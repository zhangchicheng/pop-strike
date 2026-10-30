// Kinematic character controller. Position is the eye; all collision tests use
// the full body from feet to head. No renderer or physics dependency is needed.
export const PLAYER = Object.freeze({ eye: 1.7, height: 1.85, radius: .32, step: .34, gravity: 17, jump: 7.2 });
const EPS = .0001;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;

export function createPlayerController(position, world) {
  const { colliders, bounds } = world;
  const motion = { grounded: true, velocityY: 0, climbing: false, mantling: false, viewOffset: 0 };
  let jumpHeld = false, interactHeld = false, ladder = null, mantle = null;
  const feet = () => position.y - PLAYER.eye;
  const overlaps = (b, x, z, radius = PLAYER.radius) =>
    x > b.min.x - radius + EPS && x < b.max.x + radius - EPS &&
    z > b.min.z - radius + EPS && z < b.max.z + radius - EPS;
  function blocked(x, y, z) {
    const r = PLAYER.radius;
    if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return true;
    return colliders.some(b => overlaps(b, x, z) && y < b.max.y - EPS && y + PLAYER.height > b.min.y + EPS);
  }
  function support(x, y, z) {
    let floor = 0;
    for (const b of colliders) if (b.max.y <= y + EPS && overlaps(b, x, z)) floor = Math.max(floor, b.max.y);
    return floor;
  }
  function clearPath(from, to) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / .06));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked(lerp(from.x, to.x, t), lerp(from.y, to.y, t), lerp(from.z, to.z, t))) return false;
    }
    return true;
  }
  function beginMantle(target) {
    const start = { x: position.x, y: feet(), z: position.z };
    const lifted = { ...start, y: target.y + .04 };
    const across = { ...target, y: lifted.y };
    if (!clearPath(start, lifted) || !clearPath(lifted, across) || !clearPath(across, target)) return false;
    mantle = { start, target, lifted, elapsed: 0 };
    motion.mantling = true;
    motion.grounded = false;
    motion.velocityY = 0;
    return true;
  }
  function tryMantle(vx, vz) {
    const length = Math.hypot(vx, vz);
    if (length < .1 || motion.velocityY < -3) return;
    const nx = vx / length, nz = vz / length, y = feet(), inset = PLAYER.radius + .03;
    const candidates = colliders.filter(b => b.max.y - y > PLAYER.step && b.max.y - y <= 1.15 &&
      b.max.x - b.min.x > inset * 2 && b.max.z - b.min.z > inset * 2).sort((a, b) => a.max.y - b.max.y);
    for (const b of candidates) {
      const x = clamp(position.x + nx * .9, b.min.x + inset, b.max.x - inset);
      const z = clamp(position.z + nz * .9, b.min.z + inset, b.max.z - inset);
      const dx = x - position.x, dz = z - position.z, distance = Math.hypot(dx, dz);
      if (distance > 1.05 || distance < .05 || (dx * nx + dz * nz) / distance < .8) continue;
      if (beginMantle({ x, y: b.max.y, z })) return;
    }
  }
  function nearbyLadder() {
    return (world.ladders || []).find(l => Math.abs(position.x - l.x) < .65 &&
      Math.abs(position.z - l.z) < 1.2 && feet() >= l.bottom - .1 && feet() <= l.top + .15) || null;
  }
  function moveAxis(axis, amount) {
    if (!amount) return;
    const x = position.x + (axis === 'x' ? amount : 0), z = position.z + (axis === 'z' ? amount : 0), y = feet();
    if (!blocked(x, y, z)) { position[axis] += amount; return; }
    if (!motion.grounded) return;
    let top = y;
    for (const b of colliders) {
      if (overlaps(b, x, z) && b.max.y > y + EPS && b.min.y < y + PLAYER.height - EPS) top = Math.max(top, b.max.y);
    }
    if (top <= y + EPS || top - y > PLAYER.step + EPS) return;
    if (!clearPath({ x: position.x, y, z: position.z }, { x: position.x, y: top, z: position.z }) || blocked(x, top, z)) return;
    position[axis] += amount;
    position.y = top + PLAYER.eye;
    motion.viewOffset = Math.max(-PLAYER.step, motion.viewOffset + y - top);
  }
  function vertical(delta) {
    const y = feet();
    let next = y + delta;
    if (delta > 0) {
      for (const b of colliders) if (overlaps(b, position.x, position.z) &&
        b.min.y >= y + PLAYER.height - EPS && b.min.y < next + PLAYER.height) {
        next = Math.min(next, b.min.y - PLAYER.height);
        motion.velocityY = 0;
      }
    } else {
      const floor = support(position.x, y, position.z);
      if (next <= floor + EPS) { next = floor; motion.grounded = true; motion.velocityY = 0; }
    }
    position.y = next + PLAYER.eye;
  }
  function update(dt, input = {}) {
    dt = clamp(dt, 0, .1);
    const jumpPressed = !!input.jump && !jumpHeld, interactPressed = !!input.interact && !interactHeld;
    jumpHeld = !!input.jump; interactHeld = !!input.interact;
    motion.viewOffset *= Math.exp(-dt * 16);
    const vx = input.vx || 0, vz = input.vz || 0;
    if (interactPressed && !mantle) {
      if (ladder) ladder = null;
      else {
        const candidate = nearbyLadder();
        if (candidate && clearPath({ x: position.x, y: feet(), z: position.z }, { x: candidate.x, y: feet(), z: candidate.z })) {
          ladder = candidate; position.x = ladder.x; position.z = ladder.z;
          motion.velocityY = 0; motion.grounded = false;
        }
      }
    }
    if (jumpPressed && ladder) {
      // Leave the rungs on the outside, so jumping cannot push through the deck.
      position.x -= ladder.normalX * .1; position.z -= ladder.normalZ * .1;
      ladder = null; motion.velocityY = PLAYER.jump; motion.grounded = false;
    } else if (jumpPressed && motion.grounded && !mantle) {
      motion.velocityY = PLAYER.jump; motion.grounded = false;
    }
    if (!ladder && !mantle && input.jump) tryMantle(vx, vz);
    if (ladder) {
      const next = clamp(feet() + (input.forward || 0) * 2.8 * dt, ladder.bottom, ladder.top);
      if (clearPath({ x: position.x, y: feet(), z: position.z }, { x: position.x, y: next, z: position.z })) position.y = next + PLAYER.eye;
      if (feet() >= ladder.top - EPS && input.forward > 0) {
        if (beginMantle({ x: ladder.exitX, y: ladder.top, z: ladder.exitZ })) ladder = null;
      } else if (feet() <= ladder.bottom + EPS && input.forward < 0) {
        ladder = null; motion.grounded = true;
      }
    } else if (mantle) {
      mantle.elapsed += dt;
      const t = Math.min(1, mantle.elapsed / .42), smooth = n => n * n * (3 - 2 * n);
      const lift = smooth(Math.min(1, t / .5)), across = smooth(Math.max(0, (t - .5) / .5));
      position.x = lerp(mantle.start.x, mantle.target.x, across);
      position.z = lerp(mantle.start.z, mantle.target.z, across);
      position.y = lerp(mantle.start.y, mantle.lifted.y, lift) - .04 * across + PLAYER.eye;
      if (t === 1) { mantle = null; motion.mantling = false; motion.grounded = true; }
    } else {
      // Small substeps keep sprinting, thin walls and low frame rates consistent.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120))), step = dt / steps;
      for (let i = 0; i < steps; i++) {
        moveAxis('x', vx * step); moveAxis('z', vz * step);
        if (motion.grounded) {
          const y = feet(), floor = support(position.x, y, position.z);
          if (y - floor <= PLAYER.step + EPS) {
            position.y = floor + PLAYER.eye;
            motion.viewOffset = Math.min(PLAYER.step, motion.viewOffset + y - floor);
          } else motion.grounded = false;
        }
        if (!motion.grounded) {
          const delta = motion.velocityY * step - .5 * PLAYER.gravity * step * step;
          motion.velocityY -= PLAYER.gravity * step;
          vertical(delta);
        }
      }
    }
    motion.climbing = !!ladder;
    return motion;
  }
  function reset() {
    jumpHeld = interactHeld = false; ladder = mantle = null;
    Object.assign(motion, { grounded: true, velocityY: 0, climbing: false, mantling: false, viewOffset: 0 });
  }
  return { update, reset, motion, nearbyLadder };
}

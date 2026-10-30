import * as THREE from './vendor/three.module.js';
import { WEAPONS, validWeapon } from './weapons.js';
import { createWeaponModel } from './weapon-models.js';
import { NOSTALGOS12 as colors, TEAM_COLORS } from './palette.js';

// One shared set of low-poly, smooth silhouettes for the whole wave. Instances
// own their pose and health bar material; the last instance releases the cache.
let shared = null;
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// Repeated views of a LAN player's current life use the same cosmetic pose.
export const playerPoseSeed = (id, life) => (Math.imul(Number(id) || 0, 0x9e3779b1) ^ Math.imul(life || 0, 0x85ebca6b)) >>> 0;

function resources() {
  if (shared) { shared.users++; return shared; }
  const geometries = new Map(), materials = new Map();
  const bands = new THREE.DataTexture(new Uint8Array([
    90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255,
  ]), 3, 1, THREE.RGBAFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter;
  bands.needsUpdate = true;
  shared = {
    users: 1, geometries, materials, bands,
    geometry(key, create) {
      if (!geometries.has(key)) geometries.set(key, create());
      return geometries.get(key);
    },
    material(color) {
      if (!materials.has(color)) materials.set(color, new THREE.MeshToonMaterial({ color, gradientMap: bands }));
      return materials.get(color);
    },
  };
  return shared;
}

/** A featureless ink stickman. Root faces +Z; velocities and aimYaw are local. */
export function createStickman({ index = 0, maxHp = 68, weapon = 0, team = null, headbandColor = null, poseSeed = Math.floor(Math.random() * 0x100000000) } = {}) {
  const cache = resources();
  const group = new THREE.Group();
  group.name = 'Ink stickman';
  group.userData.maxHp = maxHp;
  group.userData.poseSeed = poseSeed >>> 0;
  let randomState = (poseSeed >>> 0) || 0x6d2b79f5;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 0x100000000; };
  const body = [];
  const ownedGeometry = [];
  const INK = colors.ink, JOINT = colors.ink, GUN = colors.teal;
  const hips = new THREE.Group(); group.add(hips);
  const spine = new THREE.Group(); hips.add(spine); spine.position.y = .025;
  const headPivot = new THREE.Group(); spine.add(headPivot); headPivot.position.y = .70;

  function addMesh(parent, geometry, color, position, hittable = true) {
    const mesh = new THREE.Mesh(geometry, cache.material(color));
    if (position) mesh.position.set(...position);
    parent.add(mesh);
    mesh.userData.baseMaterial = mesh.material;
    if (hittable) body.push(mesh);
    return mesh;
  }
  function capsule(parent, radius, length, position, color = INK) {
    const geo = cache.geometry(`capsule:${radius}:${length}`, () => new THREE.CapsuleGeometry(radius, Math.max(.001, length - radius * 2), 4, 8));
    return addMesh(parent, geo, color, position);
  }
  function ball(parent, radius, position, color = JOINT) {
    const geo = cache.geometry(`ball:${radius}`, () => new THREE.SphereGeometry(radius, 12, 8));
    return addMesh(parent, geo, color, position);
  }
  function box(parent, size, position, color = GUN) {
    const key = `box:${size.join(':')}`;
    return addMesh(parent, cache.geometry(key, () => new THREE.BoxGeometry(...size)), color, position, false);
  }

  // A round head, one continuous narrow torso, and thin rounded limbs give the
  // distant silhouette of the reference instead of a helmet/armour silhouette.
  capsule(spine, .095, .60, [0, .30, 0]);
  capsule(spine, .045, .13, [0, .615, 0]);
  const pelvis = capsule(hips, .085, .29, [0, .015, 0]);
  pelvis.rotation.z = Math.PI / 2;
  const head = ball(headPivot, .188, [0, .122, 0], colors.ink);
  head.scale.set(1, 1.05, .98);
  head.userData.headshot = true;

  // Cosmetic cloth follows the head itself, including hit reactions and falls.
  // It is deliberately excluded from body hit targets so headshots stay unchanged.
  let settleHeadband, animateHeadband;
  const teamColor = team === 'red' || team === 'blue' ? TEAM_COLORS[team] : null;
  const cloth = teamColor ?? headbandColor;
  if (cloth !== null) {
    if (teamColor !== null) group.userData.team = team;
    group.userData.headbandColor = cloth;
    const headband = new THREE.Group(); headband.name = teamColor !== null ? 'Team headband' : 'Soldier headband'; head.add(headband);
    const radius = .196, start = 1.15, arc = .47;
    const wrap = addMesh(headband, cache.geometry('headband:wrap', () => new THREE.SphereGeometry(radius, 24, 4, 0, TAU, start, arc)), cloth, null, false);
    wrap.name = 'Headband cloth';
    for (const theta of [start, start + arc]) {
      const rim = addMesh(headband, cache.geometry(`headband:rim:${theta}`, () => new THREE.TorusGeometry(radius * Math.sin(theta), .005, 4, 24)), INK, [0, radius * Math.cos(theta), 0], false);
      rim.rotation.x = Math.PI / 2;
    }
    // A centred rear tie disappears whenever a soldier faces the camera. Put
    // the knot at the rear quarter and fan the ribbons past the head silhouette.
    const tie = new THREE.Group(); tie.name = 'Headband tie'; headband.add(tie);
    const tieSide = index % 2 ? -1 : 1;
    tie.position.set(tieSide * .175, .025, -.12); tie.scale.x = tieSide;
    const knot = box(tie, [.105,.075,.070], [0,0,0], cloth);
    knot.name = 'Headband knot'; knot.rotation.set(0,-.6,.12);
    const ribbons = [
      [[-.02,.024],[.08,.008],[.16,-.025],[.26,-.075],[.215,-.093],[.235,-.13],[.135,-.088],[.04,-.055],[-.024,-.025]],
      [[-.030,.015],[.035,.015],[.115,-.13],[.18,-.285],[.13,-.265],[.10,-.30],[.04,-.145]],
    ];
    const tails = ribbons.map((points, i) => {
      const template = cache.geometry(`headband:ribbon:${i}`, () => {
        const shape = new THREE.Shape(); shape.moveTo(...points[0]);
        for (const point of points.slice(1)) shape.lineTo(...point);
        shape.closePath();
        // Real thickness keeps the two tapered, notched ends visible edge-on.
        return new THREE.ExtrudeGeometry(shape, {depth:.018, bevelEnabled:false, steps:1}).translate(0,0,-.009);
      });
      // Cloth bends per soldier; never deform another rig's shared template.
      const geometry = template.clone(); ownedGeometry.push(geometry);
      geometry.computeBoundingSphere(); geometry.boundingSphere.radius += .25;
      const ribbon = addMesh(tie, geometry, cloth, [0,-.01,-.02-i*.025], false);
      ribbon.name = `Headband tail ${i + 1}`;
      ribbon.rotation.y = .45 + i * .30;
      return {mesh:ribbon, rest:ribbon.quaternion.clone(), vertices:geometry.attributes.position.array.slice(), length:i ? .33 : .28};
    });
    let flow = 0, lag = 0, lagVelocity = 0;
    animateHeadband = (dt, speed, turn, strafe, time, fade = 1) => {
      flow = lerp(flow, clamp(speed / 3.6, 0, 1), 1 - Math.exp(-dt * 6));
      const target = clamp(turn, -5, 5) * .13 + strafe * flow * .24;
      // A damped response leaves a brief follow-through when turning or stopping.
      lagVelocity += (target - lag) * 32 * dt;
      lagVelocity *= Math.exp(-dt * 7); lag = clamp(lag + lagVelocity * dt, -.7, .7);
      tails.forEach(({mesh, vertices, length}, i) => {
        const p = mesh.geometry.attributes.position;
        const amplitude = (.006 + flow * .070 + Math.abs(lag) * .025) * fade;
        for (let v = 0; v < p.count; v++) {
          const x = vertices[v*3], y = vertices[v*3+1], z = vertices[v*3+2];
          const t = clamp((Math.hypot(x,y) - .045) / (length - .045), 0, 1), weight = t * t;
          const wave = Math.sin(time * (8 + flow * 9) - t * 6 + i * 1.9 + index) * amplitude;
          p.setXYZ(v, x + weight * wave * .25,
            y + weight * (flow * .055 * fade + wave * .45),
            z + weight * (wave - flow * .11 * fade + lag * .12 * fade));
        }
        p.needsUpdate = true; mesh.geometry.computeVertexNormals();
      });
    };
    const tieInverse = new THREE.Matrix4(), ribbonUp = new THREE.Vector3(), ribbonNormal = new THREE.Vector3();
    const ribbonRotation = new THREE.Quaternion();
    settleHeadband = amount => {
      // Fold the free ends toward the floor plane as the body falls. Their
      // roots stay tied to the head, and their full length stays visible.
      tie.updateWorldMatrix(true, false); tieInverse.copy(tie.matrixWorld).invert();
      for (const {mesh, rest} of tails) {
        ribbonUp.set(0,1,0).transformDirection(tieInverse);
        ribbonNormal.set(0,0,1).applyQuaternion(rest);
        if (ribbonNormal.dot(ribbonUp) < 0) ribbonUp.negate();
        ribbonRotation.setFromUnitVectors(ribbonNormal, ribbonUp).multiply(rest);
        mesh.quaternion.copy(rest).slerp(ribbonRotation, amount);
      }
    };
  }

  function limb(parent, start, lengthA, lengthB, radius, side, isLeg) {
    const upper = new THREE.Group(); upper.position.copy(start); parent.add(upper);
    capsule(upper, radius, lengthA, [0, -lengthA / 2, 0]);
    const lower = new THREE.Group(); lower.position.y = -lengthA; upper.add(lower);
    ball(lower, radius * 1.1, [0, 0, 0]);
    capsule(lower, radius * .91, lengthB, [0, -lengthB / 2, 0]);
    const end = new THREE.Group(); end.position.y = -lengthB; lower.add(end);
    if (isLeg) {
      const foot = capsule(end, .041, .205, [0, -.018, .045]);
      foot.rotation.x = Math.PI / 2;
    } else {
      const hand = ball(end, .051, [0, 0, .005]);
      hand.scale.set(.9, 1.12, 1.1);
    }
    return { upper, lower, end, start, lengthA, lengthB, side, target: new THREE.Vector3() };
  }
  const legs = [-1, 1].map(side => limb(hips, new THREE.Vector3(side * .115, 0, 0), .465, .475, .047, side, true));
  for (const leg of legs) {
    const side = leg.side < 0 ? 'Right' : 'Left';
    leg.upper.name = `${side} thigh`; leg.lower.name = `${side} shin`; leg.end.name = `${side} ankle`;
  }
  // Facing +Z with +Y up makes -X the character's anatomical right side.
  const arms = [-1, 1].map(side => limb(spine, new THREE.Vector3(side * .215, .49, .005), .335, .325, .041, side, false));
  const shoulders = capsule(spine, .043, .43, [0, .49, .005]);
  shoulders.rotation.z = Math.PI / 2;
  for (const arm of arms) {
    const name = arm.side < 0 ? 'Right' : 'Left';
    arm.upper.name = `${name} upper arm`; arm.lower.name = `${name} forearm`; arm.end.name = `${name} wrist`;
    const hand = arm.end.children[0]; hand.name = `${name} hand`;
    // The trigger hand wraps vertically; the support palm cups the fore-end.
    hand.position.set(0, 0, 0);
    hand.scale.set(...(arm.side < 0 ? [.9, 1.3, 1.1] : [1.15, .8, 1.25]));
    ball(spine, .049, arm.start.toArray());
  }

  const rifle = new THREE.Group(); rifle.name = 'Rifle'; spine.add(rifle);
  const triggerGrip = new THREE.Object3D(); triggerGrip.name = 'Trigger grip'; rifle.add(triggerGrip);
  const supportGrip = new THREE.Object3D(); supportGrip.name = 'Fore-end support'; rifle.add(supportGrip);
  const handGrips = [triggerGrip, supportGrip];
  const muzzle = new THREE.Object3D(); rifle.add(muzzle);
  let weaponModel = null, equipped = -1, previousShot = 0;
  function syncGrip(target, source) {
    target.position.set(-source.position.x * .5, source.position.y * .5, -source.position.z * .5);
    target.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI).multiply(source.quaternion);
  }
  function setWeapon(next) {
    if (!validWeapon(next) || next === equipped) return;
    weaponModel?.dispose(); equipped = next; group.userData.weapon = next;
    weaponModel = createWeaponModel(WEAPONS[next].type, { detail: false });
    weaponModel.group.rotation.y = Math.PI; weaponModel.group.scale.setScalar(.5); rifle.add(weaponModel.group);
    syncGrip(triggerGrip, weaponModel.triggerGrip); syncGrip(supportGrip, weaponModel.supportGrip); syncGrip(muzzle, weaponModel.muzzle);
    previousShot = 0;
  }

  const healthMaterial = new THREE.MeshBasicMaterial({ color: colors.coral, side: THREE.DoubleSide });
  const healthBar = new THREE.Mesh(cache.geometry('health', () => new THREE.PlaneGeometry(.62, .045)), healthMaterial);
  healthBar.position.set(0, 2.20, 0); healthBar.visible = false; group.add(healthBar);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: colors.ink, transparent: true, opacity: .20, depthWrite: false });
  const shadow = new THREE.Mesh(cache.geometry('shadow', () => new THREE.CircleGeometry(.34, 16)), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .012; group.add(shadow);

  // Analytic two-bone IK. Everything is in the limb parent's coordinates, so a
  // planted foot stays on the floor while the pelvis bobs and twists above it.
  const delta = new THREE.Vector3(), bend = new THREE.Vector3(), knee = new THREE.Vector3();
  const directionA = new THREE.Vector3(), directionB = new THREE.Vector3();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  function solve(limb, target, pole) {
    delta.subVectors(target, limb.start);
    const distance = clamp(delta.length(), .025, limb.lengthA + limb.lengthB - .001);
    delta.normalize();
    const along = (limb.lengthA * limb.lengthA - limb.lengthB * limb.lengthB + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, limb.lengthA * limb.lengthA - along * along));
    bend.copy(pole).addScaledVector(delta, -pole.dot(delta));
    if (bend.lengthSq() < .0001) bend.set(limb.side, 0, .2).addScaledVector(delta, -delta.x * limb.side);
    bend.normalize();
    knee.copy(limb.start).addScaledVector(delta, along).addScaledVector(bend, height);
    directionA.subVectors(knee, limb.start).normalize();
    directionB.copy(target).sub(knee).normalize();
    qA.setFromUnitVectors(DOWN, directionA); qB.setFromUnitVectors(DOWN, directionB);
    limb.upper.quaternion.copy(qA);
    limb.lower.quaternion.copy(qA).invert().multiply(qB);
  }

  const footTarget = new THREE.Vector3(), localTarget = new THREE.Vector3(), pole = new THREE.Vector3();
  const axis = new THREE.Vector3(), localFall = new THREE.Vector3();
  const spineOrigin = new THREE.Vector3(), spineInverse = new THREE.Quaternion();
  const targetHands = [new THREE.Vector3(), new THREE.Vector3()];
  const deathHands = [new THREE.Vector3(), new THREE.Vector3()];
  const deathRiflePosition = new THREE.Vector3(), deathRifleRotation = new THREE.Quaternion();
  const droppedRifleRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.38, -.3, .3));
  const fallFeet = [new THREE.Vector3(), new THREE.Vector3()];
  let cycle = index * .381, locomotion = 0, speedSmooth = 0, brace = 1;
  let moveForward = 1, moveStrafe = 0, upperYaw = 0, clock = index * 1.7;
  let recoil = 0, flinch = 0, deathTime = -1, disposed = false;
  let deathHipsY = 0, deathHipsRotation = new THREE.Quaternion(), deathSpineRotation = new THREE.Quaternion();
  const fallDirection = new THREE.Vector3(0, 0, 1);
  // Sample once, not once per frame: poses vary across lives and settle fully.
  const fallStyle = {
    yaw:(random()-.5)*.9, roll:(random()-.5)*1.1, tilt:1.43+random()*.075,
    height:.29+random()*.025, duration:.78+random()*.25, slide:.10+random()*.15,
    head:new THREE.Quaternion().setFromEuler(new THREE.Euler((random()-.5)*.26,(random()-.5)*.85,(random()-.5)*.38)),
    arms:arms.map(arm=>({target:new THREE.Vector3(), reach:.25+random()*.5, spread:arm.side*(.22+random()*.4), lift:.08+random()*.17, delay:random()*.10, phase:random()*TAU, wrist:new THREE.Quaternion().setFromEuler(new THREE.Euler((random()-.5)*.8,(random()-.5)*.7,(random()-.5)*.9))})),
    legs:legs.map(leg=>({target:new THREE.Vector3(), reach:.35+random()*.4, spread:leg.side*(.10+random()*.36), lift:.035+random()*.10, delay:random()*.10, phase:random()*TAU})),
  };
  const deathHeadRotation = new THREE.Quaternion(), deathWrists = arms.map(()=>new THREE.Quaternion());

  function feet(dt, speed, forward, strafe) {
    // One full gait cycle covers stride metres: during the stance half the
    // planted foot travels backwards at exactly the root's travel speed.
    const run = smooth((speed - 1.5) / 2.1);
    const stride = lerp(.75, 1.43, run);
    cycle += speed * dt / stride;
    inverse.copy(hips.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const leg = legs[i], p = (cycle + i * .5) % 1;
      const stance = .58 - run * .08;
      let reach, lift;
      if (p < stance) {
        reach = (.5 - p / stance) * stride * stance;
        lift = 0;
      } else {
        const swing = (p - stance) / (1 - stance);
        reach = (smooth(swing) - .5) * stride * stance;
        lift = Math.sin(swing * Math.PI) * lerp(.15, .34, run);
      }
      reach *= locomotion; lift *= locomotion;
      const sideStep = Math.sin(p * Math.PI) * .018 * locomotion;
      footTarget.set(leg.side * (.115 + sideStep) + strafe * reach, .06 + lift, forward * reach);
      leg.target.copy(footTarget);
      localTarget.copy(footTarget).sub(hips.position).applyQuaternion(inverse);
      // Knees follow travel direction, with a little outward clearance.
      pole.set(leg.side * .12 + strafe * .35, .04, .7 * Math.max(.35, Math.abs(forward)));
      solve(leg, localTarget, pole);
      // Counter-rotate the ankle to keep the sole parallel to the floor. The
      // swing toe lifts slightly; the planted toe never sinks underground.
      qA.copy(hips.quaternion).multiply(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      leg.end.quaternion.copy(qA);
      if (lift > .015) leg.end.rotation.x += Math.sin((p - stance) / (1 - stance) * Math.PI) * .22;
    }
  }

  function animate(dt, { speed = 0, localForward = 1, localStrafe = 0, aim = 1, aimYaw = 0, shot = 0, hit = 0, turn = 0, time = 0, reload = 0 } = {}) {
    if (disposed || deathTime >= 0) return;
    dt = clamp(dt, 0, .06); clock += dt;
    const blend = 1 - Math.exp(-dt * 12), settle = 1 - Math.exp(-dt * 18);
    speed = Math.max(0, speed);
    speedSmooth = lerp(speedSmooth, speed, blend);
    locomotion = lerp(locomotion, speed > .08 ? clamp(speed / .7, 0, 1) : 0, settle);
    const travelLength = Math.hypot(localForward, localStrafe);
    if (travelLength > .05 && speed > .05) {
      moveForward = lerp(moveForward, localForward / travelLength, blend);
      moveStrafe = lerp(moveStrafe, localStrafe / travelLength, blend);
    }
    brace = lerp(brace, clamp(aim, 0, 1), 1 - Math.exp(-dt * 9));
    upperYaw = lerp(upperYaw, clamp(aimYaw, -.8, .8), blend);
    recoil = Math.max(recoil * Math.exp(-dt * 19), clamp(shot, 0, 1));
    flinch = Math.max(flinch * Math.exp(-dt * 13), clamp(hit * 8, 0, 1));
    const run = smooth((speedSmooth - 1.5) / 2.1), phase = cycle * TAU;
    const breathe = Math.sin(clock * 2.4) * .006;
    const bounce = Math.cos(phase * 2) * lerp(.012, .036, run) * locomotion;
    hips.position.set(Math.sin(phase) * .017 * locomotion, .95 - run * .055 + breathe + bounce, 0);
    hips.rotation.set(0, Math.sin(phase) * .085 * locomotion, -moveStrafe * run * .08 - clamp(turn, -4, 4) * .012);
    spine.rotation.set(.045 + run * .22 * (1 - brace * .36) - flinch * .17,
      upperYaw - hips.rotation.y + Math.sin(phase) * .06 * locomotion * (1 - brace * .65),
      -moveStrafe * run * .08 + Math.sin(phase) * .02 * locomotion - flinch * .06);
    headPivot.rotation.set(-spine.rotation.x * .7, -Math.sin(phase) * .02 * locomotion, -spine.rotation.z * .65);
    // Raise the stock to the right shoulder to aim. Running lowers the whole
    // weapon into a ready carry; neither hand lets go or swings independently.
    if (shot > previousShot + .01) weaponModel.fire(); previousShot = shot;
    weaponModel.update(dt, { reload }); syncGrip(triggerGrip, weaponModel.triggerGrip); syncGrip(supportGrip, weaponModel.supportGrip);
    const carry = 1 - brace;
    rifle.position.set(lerp(-.18, -.12, carry), lerp(.47, .29, carry), lerp(.23, .20, carry) - recoil * .035);
    rifle.rotation.set(carry * .42 - recoil * .10, -carry * .08,
      -.015 + Math.sin(phase) * .018 * locomotion * carry);
    // Use current measured travel for phase; a blocked enemy never runs in place.
    feet(dt, speed, moveForward, moveStrafe);
    for (let i = 0; i < 2; i++) {
      const arm = arms[i], anchor = handGrips[i];
      const target = targetHands[i];
      // Transform each actual gun contact into spine space before solving IK.
      // This includes pitch, roll and recoil, so the wrists cannot float away.
      target.copy(anchor.position).applyQuaternion(rifle.quaternion).add(rifle.position);
      pole.set(arm.side * .32, -1, -.12);
      solve(arm, target, pole);
      // Counter the arm joints so the palm follows the grip's orientation too.
      qA.copy(arm.upper.quaternion).multiply(arm.lower.quaternion).invert();
      arm.end.quaternion.copy(qA).multiply(rifle.quaternion).multiply(anchor.quaternion);
    }
    shadow.scale.set(1 + run * .12, 1 - run * .15, 1);
    animateHeadband?.(dt, speedSmooth, turn, moveStrafe, clock);
  }

  function fall(dt, { direction } = {}) {
    if (disposed) return true;
    if (deathTime < 0) {
      deathTime = 0;
      healthBar.visible = false;
      deathHipsY = hips.position.y;
      deathHipsRotation.copy(hips.quaternion);
      deathSpineRotation.copy(spine.quaternion);
      deathHeadRotation.copy(headPivot.quaternion);
      arms.forEach((arm,i)=>deathWrists[i].copy(arm.end.quaternion));
      deathRiflePosition.copy(rifle.position); deathRifleRotation.copy(rifle.quaternion);
      fallFeet.forEach((v, i) => v.copy(legs[i].target));
      spineOrigin.copy(spine.position).applyQuaternion(hips.quaternion).add(hips.position);
      qA.copy(hips.quaternion).multiply(spine.quaternion);
      deathHands.forEach((v, i) => v.copy(targetHands[i]).applyQuaternion(qA).add(spineOrigin));
      if (direction && direction.lengthSq() > .001) {
        localFall.copy(direction); localFall.y = 0;
        localFall.applyQuaternion(inverse.copy(group.quaternion).invert());
        if (localFall.lengthSq() > .001) fallDirection.copy(localFall).normalize();
      } else {
        const angle = random() * TAU; fallDirection.set(Math.sin(angle),0,Math.cos(angle));
      }
      fallDirection.applyAxisAngle(UP, fallStyle.yaw);
      for (const a of fallStyle.arms) a.target.set(fallDirection.x*a.reach+fallDirection.z*a.spread,.105,fallDirection.z*a.reach-fallDirection.x*a.spread);
      for (const l of fallStyle.legs) l.target.set(-fallDirection.x*l.reach+fallDirection.z*l.spread,.065,-fallDirection.z*l.reach-fallDirection.x*l.spread);
      body.forEach(mesh => { mesh.material = mesh.userData.baseMaterial; });
    }
    dt = clamp(dt, 0, .06); deathTime += dt; clock += dt;
    const buckle = smooth(deathTime / .32), tip = smooth((deathTime - .12) / fallStyle.duration);
    const impact = Math.sin(clamp((deathTime - fallStyle.duration) / .28, 0, 1) * Math.PI) * .025;
    axis.set(fallDirection.z, 0, -fallDirection.x);
    qA.setFromAxisAngle(axis, tip * fallStyle.tilt).multiply(qB.setFromAxisAngle(UP,fallStyle.roll*tip));
    hips.quaternion.copy(deathHipsRotation).slerp(qA, buckle);
    hips.position.set(fallDirection.x * tip * fallStyle.slide,
      lerp(deathHipsY, fallStyle.height, Math.max(buckle * .36, tip)) + impact,
      fallDirection.z * tip * fallStyle.slide);
    spine.quaternion.copy(deathSpineRotation).slerp(qB.setFromAxisAngle(axis, .045), tip);
    headPivot.quaternion.copy(deathHeadRotation).slerp(fallStyle.head,tip);
    inverse.copy(hips.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const leg = legs[i];
      const style = fallStyle.legs[i], progress = smooth((deathTime-style.delay)/(.12+fallStyle.duration));
      footTarget.copy(fallFeet[i]);
      footTarget.lerp(style.target, progress);
      footTarget.y += Math.sin(progress*Math.PI)*style.lift;
      localTarget.copy(footTarget).sub(hips.position).applyQuaternion(inverse);
      // The knee bends toward world up as the body rolls over. A local forward
      // knee pole would drive one leg into the floor during a sideways fall.
      pole.set(0, 1, 0).applyQuaternion(inverse);
      solve(leg, localTarget, pole);
      qA.copy(hips.quaternion).multiply(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      leg.end.quaternion.copy(qA);
    }
    spineOrigin.copy(spine.position).applyQuaternion(hips.quaternion).add(hips.position);
    spineInverse.copy(hips.quaternion).multiply(spine.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const arm = arms[i];
      const style = fallStyle.arms[i], progress = smooth((deathTime-style.delay)/(.48+fallStyle.duration*.2));
      const flutter = Math.sin(progress*Math.PI), swing = Math.sin(deathTime*17+style.phase)*flutter*.10;
      targetHands[i].copy(deathHands[i]).lerp(style.target,progress);
      targetHands[i].x += swing*fallDirection.z; targetHands[i].z -= swing*fallDirection.x;
      targetHands[i].y += flutter*style.lift;
      targetHands[i].sub(spineOrigin).applyQuaternion(spineInverse);
      pole.set(0, 1, 0).applyQuaternion(spineInverse);
      solve(arm, targetHands[i], pole);
      arm.end.quaternion.copy(deathWrists[i]).slerp(style.wrist,progress);
    }
    rifle.position.copy(deathRiflePosition).lerp(localTarget.set(-.24, .10, -.065), tip);
    rifle.quaternion.copy(deathRifleRotation).slerp(droppedRifleRotation, tip);
    shadow.scale.set(1 + tip * .9, 1 + tip * .4, 1);
    shadowMaterial.opacity = .20 - tip * .05;
    animateHeadband?.(dt,0,0,0,clock,1-smooth(deathTime/.65));
    settleHeadband?.(smooth((deathTime - .15) / .4));
    return deathTime >= fallStyle.duration + .28;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.parent?.remove(group);
    healthMaterial.dispose(); shadowMaterial.dispose(); weaponModel?.dispose();
    ownedGeometry.forEach(geometry=>geometry.dispose());
    if (--cache.users === 0) {
      cache.geometries.forEach(geometry => geometry.dispose());
      cache.materials.forEach(material => material.dispose());
      cache.bands.dispose();
      if (shared === cache) shared = null;
    }
  }

  setWeapon(weapon);
  animate(0, { speed: 0 });
  return { group, body, healthBar, shadow, muzzle, setWeapon, animate, fall, dispose };
}

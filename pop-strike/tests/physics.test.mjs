import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerController, PLAYER } from '../physics.js';
import { createWorld } from '../world.js';
import { enemyPositionBlocked } from '../navigation.js';
import * as THREE from '../vendor/three.module.js';

const box = (x, y, z, w, h, d) => ({ min: { x: x-w/2, y, z: z-d/2 }, max: { x: x+w/2, y: y+h, z: z+d/2 } });
const bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
function actor(colliders = [], position = { x: 0, y: PLAYER.eye, z: 3 }, ladders = []) {
  const controller = createPlayerController(position, { colliders, bounds, ladders });
  return { position, controller, run(seconds, input = {}, dt = 1/60) {
    for (let time = 0; time < seconds - 1e-8; time += dt) controller.update(Math.min(dt, seconds-time), input);
    return position;
  } };
}
function close(actual, expected, message) { assert.ok(Math.abs(actual-expected) < .002, `${message}: ${actual} != ${expected}`); }
function noOverlap(position, colliders) {
  const y = position.y - PLAYER.eye, r = PLAYER.radius - .001;
  assert.ok(!colliders.some(b => position.x > b.min.x-r && position.x < b.max.x+r &&
    position.z > b.min.z-r && position.z < b.max.z+r && y < b.max.y-.001 && y+PLAYER.height > b.min.y+.001), 'body entered a solid');
}

for (const dt of [1/120, 1/60, .04, .1]) {
  test(`jump lands on a box, stays supported, then falls off (${dt}s)`, () => {
    const a = actor([box(0, 0, 0, 3, 1.2, 3)]);
    a.run(.2, { jump: true }, dt);
    a.run(.4, { vz: -4.8 }, dt);
    a.run(1, {}, dt);
    close(a.position.y, 1.2+PLAYER.eye, 'box landing');
    assert.equal(a.controller.motion.grounded, true);
    a.run(.7, { vx: 7.6 }, dt); a.run(1, {}, dt);
    close(a.position.y, PLAYER.eye, 'ground after walking off');
  });
  test(`walk up and down stairs without jumping (${dt}s)`, () => {
    const stairs = Array.from({ length: 12 }, (_, i) => box(0, 0, -i*.48, 2, (i+1)*.3, .48));
    const a = actor(stairs, { x: 0, y: PLAYER.eye, z: 1 });
    a.run(1.2, { vz: -4.8 }, dt);
    close(a.position.y, PLAYER.eye+3.6, 'top stair');
    noOverlap(a.position, stairs);
    a.run(1.3, { vz: 4.8 }, dt);
    close(a.position.y, PLAYER.eye, 'stair descent');
  });
  test(`sprinting cannot tunnel through a thin wall (${dt}s)`, () => {
    const wall = box(0, 0, 0, 8, 8, .08), a = actor([wall]);
    a.run(2, { vz: -7.6, jump: true }, dt);
    assert.ok(a.position.z >= .36-.001); noOverlap(a.position, [wall]);
  });
}

test('jump hits a low ceiling and comes back down', () => {
  const a = actor([box(0, 2.15, 3, 6, .15, 6)]);
  let highest = 0;
  for (let i=0; i<120; i++) { a.controller.update(1/60, { jump: true }); highest=Math.max(highest, a.position.y); }
  assert.ok(highest > PLAYER.eye+.1);
  assert.ok(highest <= 2.15-PLAYER.height+PLAYER.eye+.001);
  close(a.position.y, PLAYER.eye, 'holding jump does not bounce repeatedly');
});

test('cannot double jump in midair or step up a wall', () => {
  const a = actor([box(0, 0, 0, 3, 1, 1)]);
  a.run(.2, { jump: true }); a.controller.update(1/60, {});
  const velocity = a.controller.motion.velocityY;
  a.controller.update(1/60, { jump: true });
  assert.ok(a.controller.motion.velocityY < velocity);
  a.run(1); a.run(1, { vz: -4.8 });
  close(a.position.y, PLAYER.eye, 'too tall to auto step');
  assert.ok(a.position.z >= .82-.001);
});

test('hold jump toward a tall crate to mantle onto its lid', () => {
  const crate = box(0, 0, 0, 3, 2.18, 2), a = actor([crate], { x: 0, y: PLAYER.eye, z: 1.7 });
  let mantled = false;
  for (let i=0; i<100; i++) {
    a.controller.update(1/60, { jump: true, vz: -2 });
    mantled ||= a.controller.motion.mantling;
    noOverlap(a.position, [crate]);
    if (mantled && !a.controller.motion.mantling) break;
  }
  a.run(.5);
  assert.equal(mantled, true); close(a.position.y, 2.18+PLAYER.eye, 'mantle landing');
});

test('a ceiling above a crate prevents a mantle into solid geometry', () => {
  const colliders = [box(0, 0, 0, 3, 1.8, 2), box(0, 3, 0, 3, .2, 2)];
  const a = actor(colliders, { x: 0, y: PLAYER.eye, z: 1.7 });
  for (let i=0; i<120; i++) { a.controller.update(1/60, { jump: true, vz: -2 }); noOverlap(a.position, colliders); }
  assert.equal(a.controller.motion.mantling, false);
  assert.ok(a.position.z >= 1.32-.001);
});

test('overhead platforms do not block walking underneath', () => {
  const a = actor([box(0, 4, 0, 4, .2, 4)]);
  a.run(1, { vz: -4.8 }); close(a.position.z, -1.8, 'walk under platform');
});

// The actual arena is generated with canvas sign textures. Rendering is not
// required to exercise its collision geometry and routes.
function arena() {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: (o, key) => o[key] ?? (() => {}), set: (o, key, value) => (o[key]=value, true) }) }) };
  try { return createWorld(new THREE.Scene()); }
  finally { if (previous) globalThis.document=previous; else delete globalThis.document; }
}

test('actual tower stairs reach a solid balcony and allow a return to the yard', () => {
  const world = arena(), position = { x: -.6, y: PLAYER.eye, z: 4 };
  const controller = createPlayerController(position, world);
  for (let i=0; i<138; i++) { controller.update(1/60, { vz: -4.8 }); noOverlap(position, world.colliders); }
  close(position.y, 5.875+PLAYER.eye, 'tower deck');
  // Walk around the cabin along the right balcony to the ladder opening.
  for (let i=0; i<40; i++) controller.update(1/60, { vx: 2.85 });
  for (let i=0; i<84; i++) { controller.update(1/60, { vz: -2.85 }); noOverlap(position, world.colliders); }
  assert.ok(position.z < -10.6, 'side balcony must fit the full player width');
  for (let i=0; i<40; i++) controller.update(1/60, { vx: -2.85 });
  assert.ok(controller.nearbyLadder(), 'ladder reachable from balcony');
  controller.update(1/60, { interact: true });
  assert.equal(controller.motion.climbing, true);
  for (let i=0; i<140; i++) { controller.update(1/60, { forward: -1 }); noOverlap(position, world.colliders); }
  close(position.y, PLAYER.eye, 'ladder descent');
  assert.equal(controller.motion.climbing, false);
});

test('actual ladder supports climbing, stopping, exiting and jumping off', () => {
  const world = arena(), l = world.ladders[0], position = { x: l.x, y: PLAYER.eye, z: l.z };
  const controller = createPlayerController(position, world);
  controller.update(1/60, { interact: true });
  for (let i=0; i<60; i++) controller.update(1/60, { forward: 1 });
  const y = position.y;
  for (let i=0; i<60; i++) controller.update(1/60, {});
  close(position.y, y, 'stay on rung');
  controller.update(1/60, { jump: true });
  assert.equal(controller.motion.climbing, false); assert.ok(controller.motion.velocityY > 0);
  for (let i=0; i<120; i++) controller.update(1/60, {});
  controller.update(1/60, { interact: true });
  for (let i=0; i<170; i++) { controller.update(1/60, { forward: 1 }); noOverlap(position, world.colliders); }
  close(position.y, l.top+PLAYER.eye, 'ladder top');
  close(position.z, l.exitZ, 'exit on balcony');
  assert.equal(controller.motion.grounded, true);
  controller.reset();
  assert.equal(controller.motion.climbing, false); assert.equal(controller.motion.mantling, false);
});

test('spawn points remain outside ground-level obstacles', () => {
  const world = arena();
  for (const spawn of world.spawnPoints) noOverlap({ x: spawn.x, y: PLAYER.eye, z: spawn.z }, world.colliders);
});

const rooms = [
  { name: 'barracks', front: [20.5, 12.2], inside: [20.5, 8.8], side: [15.2, 8.8], far: [20.5, -11.5], wall: [22.7, 12.2], facade: 10.2, roof: 4.6 },
  { name: 'armory', front: [-20.4, 3.6], inside: [-20.4, -3.2], side: [-15.5, -3.2], far: [-20.4, -11.5], wall: [-22.7, 3.6], facade: 1.6, roof: 3.9 },
  { name: 'workshop', front: [-1, -16.6], inside: [-1, -21.5], side: [8, -21.5], far: [-10, -21.5], wall: [-3.2, -16.6], facade: -18.75, roof: 3.6 },
];

for (const room of rooms) {
  test(`${room.name}: enter both doors, cross the room, and exit at walking/sprint speeds`, () => {
    const world = arena();
    for (const [dt, speed] of [[1/60, 4.8], [.1, 7.6]]) {
      const position = { x: room.front[0], y: PLAYER.eye, z: room.front[1] };
      const controller = createPlayerController(position, world);
      for (const [x, z] of [room.inside, room.far, room.inside, room.side, room.inside, room.front]) {
        for (let frame=0; frame<600; frame++) {
          const dx=x-position.x, dz=z-position.z, distance=Math.hypot(dx,dz);
          if (distance < .001) break;
          controller.update(Math.min(dt,distance/speed), { vx: dx/distance*speed, vz: dz/distance*speed });
          noOverlap(position, world.colliders);
        }
        close(position.x, x, 'door/aisle x'); close(position.z, z, 'door/aisle z');
        close(position.y, PLAYER.eye, 'flush indoor floor');
      }
    }
  });

  test(`${room.name}: solid walls block movement and the roof supports a landing`, () => {
    const world = arena(), position = { x: room.wall[0], y: PLAYER.eye, z: room.wall[1] };
    const controller = createPlayerController(position, world);
    for (let i=0; i<90; i++) { controller.update(1/60, { vz: -7.6 }); noOverlap(position, world.colliders); }
    assert.ok(position.z >= room.facade+.14+PLAYER.radius-.001, 'walked through solid facade');
    Object.assign(position, { x: room.inside[0], y: room.roof+4, z: room.inside[1] }); controller.reset();
    for (let i=0; i<150; i++) { controller.update(1/60, {}); noOverlap(position, world.colliders); }
    close(position.y, room.roof+PLAYER.eye, 'roof landing');
  });
}

test('door and window openings pass bullets in both directions; solid walls stop them', () => {
  const world = arena();
  world.raycastMeshes.forEach(mesh => mesh.updateMatrixWorld(true));
  const hitsBetween = (a, b) => {
    const origin = new THREE.Vector3(...a), end = new THREE.Vector3(...b), distance = origin.distanceTo(end);
    return new THREE.Raycaster(origin, end.sub(origin).normalize(), 0, distance).intersectObjects(world.raycastMeshes, false);
  };
  for (const room of rooms) {
    const outside = [room.front[0], 1.7, room.front[1]], inside = [room.inside[0], 1.7, room.inside[1]];
    const side = [room.side[0], 1.7, room.side[1]];
    for (const [a,b] of [[outside,inside],[inside,outside],[side,inside],[inside,side]]) {
      assert.equal(hitsBetween(a,b).length, 0, `${room.name}: invisible geometry seals a doorway`);
    }
    const wallOutside = [room.wall[0],1.7,room.wall[1]], wallInside = [room.wall[0],1.7,room.facade-1];
    assert.ok(hitsBetween(wallOutside,wallInside).length > 0, `${room.name}: bullet passed through facade`);
    assert.ok(hitsBetween(wallInside,wallOutside).length > 0, `${room.name}: indoor bullet passed through facade`);
  }
  for (const [a,b] of [
    [[15,2,.5],[20.5,2,.5]], [[-15,1.9,-6.2],[-20.4,1.9,-6.2]], [[-6.5,1.7,-16.6],[-6.5,1.7,-21.5]],
  ]) {
    assert.equal(hitsBetween(a,b).length, 0, 'window is still a painted solid');
    assert.equal(hitsBetween(b,a).length, 0, 'window blocks shots from inside');
  }
});

test('jumping indoors hits the workshop ceiling without entering the roof', () => {
  const world = arena(), position = { x: -1, y: PLAYER.eye, z: -21.5 };
  const controller = createPlayerController(position, world);
  let highest = 0;
  for (let i=0; i<120; i++) {
    controller.update(1/60, { jump: true }); highest=Math.max(highest,position.y);
    noOverlap(position, world.colliders);
  }
  close(highest, 3.3-PLAYER.height+PLAYER.eye, 'head meets ceiling');
  close(position.y, PLAYER.eye, 'land indoors');
});

function walkUpperRoute(world, start, waypoints, dt, speed) {
  const position = { x: start[0], y: start[1] + PLAYER.eye, z: start[2] };
  const controller = createPlayerController(position, world);
  for (const [x, y, z] of waypoints) {
    for (let frame=0; frame<1600; frame++) {
      const dx=x-position.x, dz=z-position.z, distance=Math.hypot(dx,dz);
      if (distance < .001) break;
      controller.update(Math.min(dt,distance/speed), { vx: dx/distance*speed, vz: dz/distance*speed });
      noOverlap(position,world.colliders);
    }
    close(position.x,x,`route to ${x},${y},${z}: x`);
    close(position.z,z,`route to ${x},${y},${z}: z`);
    close(position.y,y+PLAYER.eye,`route to ${x},${y},${z}: feet`);
    assert.ok(controller.motion.grounded, 'walkable route required a jump or fall');
  }
}

for (const [dt,speed] of [[1/60,4.8],[.04,7.6]]) {
  test(`complete upper route crosses both second-floor rooms and returns to the yard (${dt}s)`, () => {
    const world=arena();
    const route=[[-18,3.9,0],[-21.4,3.9,0],[-21.4,3.9,-5.6],[-17.8,3.9,-5.6],
      [-17.8,4.6,-16.9],[17.8,4.6,-16.9],[17.8,4.6,.5],[21.5,4.6,.5],
      [21.5,4.6,5.5],[18,4.6,5.5],[18,0,20]];
    walkUpperRoute(world,[-18,0,10],route,dt,speed);
    walkUpperRoute(world,[18,0,20],route.slice(0,-1).reverse().concat([[-18,0,10]]),dt,speed);
  });
}

test('workshop roof branch connects to the gallery in both directions', () => {
  const world=arena();
  walkUpperRoute(world,[-9,4.6,-16.9],[[-9,3.6,-21.5],[-9,4.6,-16.9]],1/60,4.8);
});

test('the covered gallery preserves the ground-floor workshop approach and headroom', () => {
  const world=arena();
  walkUpperRoute(world,[-1,0,-14.5],[[-1,0,-21.5],[-1,0,-14.5]],1/60,4.8);
  assert.equal(enemyPositionBlocked(world,-1,-17,0),false,'overhead gallery blocked ground troops');
});

test('upper guards have clear spawns, cross deck seams and stop at walls or unsupported edges', () => {
  const world=arena();
  assert.equal(world.upperSpawnPoints.length,4);
  for (const p of world.upperSpawnPoints) {
    noOverlap({x:p.x,y:p.y+PLAYER.eye,z:p.z},world.colliders);
    assert.equal(enemyPositionBlocked(world,p.x,p.z,p.y),false,'upper spawn is not supported and walkable');
  }
  assert.equal(enemyPositionBlocked(world,17.8,-13.45,4.6),false,'seam between gallery and barracks blocks guards');
  assert.equal(enemyPositionBlocked(world,0,-15.0,4.6),true,'guard could walk into empty air');
  assert.equal(enemyPositionBlocked(world,19.25,-3.5,4.6),true,'guard could walk through upstairs wall');
  assert.equal(enemyPositionBlocked(world,21.5,.5,4.6),false,'upper room is treated as a solid block');
});

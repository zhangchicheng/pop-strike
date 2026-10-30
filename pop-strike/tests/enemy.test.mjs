import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createStickman } from '../enemy.js';

const steps = [.008, .016, .033, .04];

function assertFinitePose(group) {
  group.traverse(object => {
    const values = [...object.position, ...object.quaternion, ...object.scale];
    assert.ok(values.every(Number.isFinite), `${object.type} contains a non-finite transform`);
  });
}

function feetOf(rig) {
  // Feet are the two short, horizontal capsules; arm capsules are longer.
  return rig.body.filter(mesh => mesh.geometry.type === 'CapsuleGeometry'
    && mesh.geometry.parameters.radius === .041
    && mesh.geometry.parameters.height < .13);
}

test('idle, sprint, strafe and stopping keep finite poses and feet above the floor', () => {
  const rig = createStickman();
  const feet = feetOf(rig);
  assert.equal(feet.length, 2);
  const point = new THREE.Vector3();
  let lowestFoot = Infinity;
  try {
    const poses = [
      { speed: 0, aim: 1 },
      { speed: 3.6, localForward: 1, localStrafe: 0, aim: 0 },
      { speed: 1.85, localForward: 0, localStrafe: 1, aim: 1, aimYaw: -.7 },
      { speed: 2.3, localForward: -1, localStrafe: 0, aim: 1, turn: 2.8 },
      { speed: 0, aim: 1 },
    ];
    for (const pose of poses) {
      for (let frame = 0; frame < 180; frame++) {
        rig.animate(steps[frame % steps.length], pose);
        rig.group.updateMatrixWorld(true);
        assertFinitePose(rig.group);
        for (const foot of feet) {
          const positions = foot.geometry.getAttribute('position');
          for (let vertex = 0; vertex < positions.count; vertex++) {
            point.fromBufferAttribute(positions, vertex).applyMatrix4(foot.matrixWorld);
            lowestFoot = Math.min(lowestFoot, point.y);
            assert.ok(point.y >= -.0001, `foot clipped the floor at y=${point.y}`);
          }
        }
      }
    }
    // A gait that merely hovers over the floor would also pass the clipping
    // check, so verify that a sole actually plants near the ground.
    assert.ok(lowestFoot < .005, `feet never planted: lowest y=${lowestFoot}`);
    const settled = feet.map(foot => foot.getWorldPosition(new THREE.Vector3()));
    for (let frame = 0; frame < 120; frame++) rig.animate(.016, { speed: 0, aim: 1 });
    rig.group.updateMatrixWorld(true);
    feet.forEach((foot, index) => {
      assert.ok(foot.getWorldPosition(point).distanceTo(settled[index]) < .0001,
        'a stationary enemy continued moving its feet');
    });
  } finally {
    rig.dispose();
  }
});

test('the moved and animated round head remains a headshot raycast target', () => {
  const rig = createStickman({ index: 2 });
  try {
    rig.group.position.set(-2, 0, -5);
    rig.group.rotation.y = .56;
    for (let frame = 0; frame < 90; frame++) {
      rig.animate(steps[frame % steps.length], {
        speed: 3.4, localForward: .8, localStrafe: .6, aim: 1, aimYaw: -.4,
      });
    }
    rig.group.updateMatrixWorld(true);
    const heads = rig.body.filter(mesh => mesh.userData.headshot);
    assert.equal(heads.length, 1, 'only the round head should grant headshots');
    const centre = heads[0].getWorldPosition(new THREE.Vector3());
    const origin = centre.clone().add(new THREE.Vector3(0, 0, 4));
    const ray = new THREE.Raycaster(origin, centre.clone().sub(origin).normalize());
    const hits = ray.intersectObjects(rig.body, false);
    assert.ok(hits.length > 0, 'the animated head was not hittable');
    assert.equal(hits[0].object, heads[0]);
    assert.equal(hits[0].object.userData.headshot, true);
    assert.ok(rig.body.every(mesh => mesh.isMesh && mesh.userData.baseMaterial),
      'all hit targets must be mesh leaves with a material to restore after flashing');
  } finally {
    rig.dispose();
  }
});

test('disposing one clone preserves shared resources until the final clone is removed', () => {
  const first = createStickman(), second = createStickman({ index: 1 });
  const geometry = first.body[0].geometry;
  const material = first.body[0].userData.baseMaterial;
  assert.equal(geometry, second.body[0].geometry);
  assert.equal(material, second.body[0].userData.baseMaterial);
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  try {
    first.dispose();
    first.dispose();
    assert.equal(geometryDisposals, 0);
    assert.equal(materialDisposals, 0);
    second.animate(.033, { speed: 3.5, aim: 0 });
    second.group.updateMatrixWorld(true);
    assertFinitePose(second.group);
    second.dispose();
    assert.equal(geometryDisposals, 1);
    assert.equal(materialDisposals, 1);
    second.dispose();
    assert.equal(geometryDisposals, 1, 'disposing a rig twice should be harmless');
  } finally {
    first.dispose();
    second.dispose();
  }
});


test('a running stickman falls in any direction without clipping the floor', () => {
  const point = new THREE.Vector3();
  for (let direction = 0; direction < 8; direction++) {
    const rig = createStickman({ index: direction });
    try {
      for (let frame = 0; frame < 60; frame++) {
        rig.animate(.016, { speed: 3.3, aim: .7, localForward: .8, localStrafe: .6 });
      }
      let finished = false;
      for (let frame = 0; frame < 100; frame++) {
        finished = rig.fall(.016, { direction: new THREE.Vector3(
          Math.cos(direction * Math.PI / 4), 0, Math.sin(direction * Math.PI / 4)) });
        rig.group.updateMatrixWorld(true);
        assertFinitePose(rig.group);
        for (const mesh of rig.body) {
          const positions = mesh.geometry.attributes.position;
          for (let vertex = 0; vertex < positions.count; vertex++) {
            point.fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
            assert.ok(point.y >= -.001, 'a falling limb clipped the floor');
          }
        }
      }
      assert.equal(finished, true, 'the collapse did not finish');
      const head = rig.body.find(mesh => mesh.userData.headshot);
      assert.ok(head.getWorldPosition(point).y < .6, 'the defeated stickman remained standing');
    } finally { rig.dispose(); }
  }
});

test('right hand holds the trigger grip and left palm supports the fore-end through every live pose', () => {
  const rig = createStickman({ index: 3 });
  const rifle = rig.group.getObjectByName('Rifle');
  const pairs = [
    ['Right', 'Trigger grip'], ['Left', 'Fore-end support'],
  ].map(([side, name]) => ({
    upper: rig.group.getObjectByName(`${side} upper arm`),
    lower: rig.group.getObjectByName(`${side} forearm`),
    wrist: rig.group.getObjectByName(`${side} wrist`),
    hand: rig.group.getObjectByName(`${side} hand`),
    grip: rig.group.getObjectByName(name),
  }));
  const handPoint = new THREE.Vector3(), gripPoint = new THREE.Vector3();
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3();
  const handRotation = new THREE.Quaternion(), gripRotation = new THREE.Quaternion();
  try {
    rig.group.position.set(-3, 0, 5); rig.group.rotation.y = .8;
    const poses = [
      { speed: 0, aim: 1 },
      { speed: 3.6, aim: 0 },
      { speed: 3.6, aim: .18, localForward: .8, localStrafe: .6, turn: 3 },
      { speed: 1.85, aim: .72, localForward: 0, localStrafe: -1, aimYaw: -.8 },
      { speed: 0, aim: 1, aimYaw: .8, shot: 1, hit: .12 },
      { speed: 0, aim: 1 },
    ];
    for (const pose of poses) for (let frame = 0; frame < 100; frame++) {
      rig.animate(steps[frame % steps.length], pose);
      rig.group.updateMatrixWorld(true);
      assertFinitePose(rig.group);
      for (const { upper, lower, wrist, hand, grip } of pairs) {
        hand.getWorldPosition(handPoint); grip.getWorldPosition(gripPoint);
        assert.ok(handPoint.distanceTo(gripPoint) < .0001, `${hand.name} lost contact with ${grip.name}`);
        hand.getWorldQuaternion(handRotation); grip.getWorldQuaternion(gripRotation);
        assert.ok(handRotation.angleTo(gripRotation) < .0001, `${hand.name} twisted off its grip`);
        upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); wrist.getWorldPosition(handPoint);
        assert.ok(Math.abs(shoulder.distanceTo(elbow) - .335) < .0001, 'upper arm stretched');
        assert.ok(Math.abs(elbow.distanceTo(handPoint) - .325) < .0001, 'forearm stretched');
        upper.parent.worldToLocal(elbow);
        assert.ok(elbow.y < upper.position.y - .03, 'elbow flared above shoulder');
      }
    }
    const right = rifle.worldToLocal(pairs[0].hand.getWorldPosition(handPoint)).clone();
    const left = rifle.worldToLocal(pairs[1].hand.getWorldPosition(handPoint)).clone();
    assert.ok(left.z > right.z + .25, 'support hand must be forward of the trigger hand');
    assert.ok(left.y < -.04 && Math.abs(left.x) < .02, 'left palm must sit beneath the fore-end');
    assert.ok(right.y < -.04 && right.z < 0, 'right hand must wrap the rear pistol grip');
    assert.ok(pairs[0].upper.position.x < 0 && pairs[1].upper.position.x > 0, 'anatomical hands were mirrored');
    const stock = rifle.localToWorld(new THREE.Vector3(0, -.005, -.24));
    assert.ok(stock.distanceTo(pairs[0].upper.getWorldPosition(shoulder)) < .15, 'aimed stock floats away from right shoulder');
  } finally { rig.dispose(); }
});

test('falling starts at the current weapon pose instead of snapping back to the old carry position', () => {
  const rig = createStickman();
  const rifle = rig.group.getObjectByName('Rifle');
  try {
    for (let i=0; i<80; i++) rig.animate(.016, { speed: 3.6, aim: .18, shot: i===79 ? 1 : 0 });
    const position = rifle.position.clone(), rotation = rifle.quaternion.clone();
    rig.fall(0, { direction: new THREE.Vector3(1,0,0) });
    assert.ok(rifle.position.distanceTo(position) < .0001, 'gun jumped when the character fell');
    assert.ok(rifle.quaternion.angleTo(rotation) < .0001, 'gun rotation jumped when the character fell');
  } finally { rig.dispose(); }
});

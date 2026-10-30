import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createWorld } from '../world.js';
import { WORLD_COLORS as palette } from '../palette.js';

const scene = new THREE.Scene(), world = createWorld(scene, { headless: true });
scene.updateMatrixWorld(true);
const apertures = [];
function opening(axis, fixed, at, width, bottom, top, base, trim) {
  apertures.push({ axis, fixed, at, width, bottom: bottom + base, top: top + base, trim });
}
// Sample both orientations, interiors / exteriors, and both storeys. These are
// clear aperture dimensions, independent of how wall pieces are constructed.
opening('x', 10.2, 20.5, 2.4, 0, 2.95, 0, palette.cream);
for (const at of [-9.5, -4.5, .5, 5.5]) opening('z', 16.4, at, 2.8, 1.45, 2.95, 0, palette.ochreShade);
opening('z', 16.4, 8.8, 2, 0, 2.8, 0, palette.cream);
opening('x', 1.6, -20.4, 2.4, 0, 2.65, 0, palette.cream);
for (const at of [-10.1, -6.2, -.6]) opening('z', -16.7, at, 2.6, 1.15, 2.5, 0, palette.coralDark);
opening('z', -16.7, -3.2, 1.9, 0, 2.65, 0, palette.cream);
opening('x', -18.75, -1, 2.2, 0, 2.65, 0, palette.cream);
for (const at of [-11.5, -6.5, 3.7]) opening('x', -18.75, at, 2.6, 1.1, 2.4, 0, palette.ochreShade);
opening('z', 6.8, -21.5, 2, 0, 2.65, 0, palette.cream);
opening('x', -4.2, -21.4, 1.9, 0, 2.45, 3.9, palette.cream);
opening('z', -19.2, -5.6, 1.9, 0, 2.45, 3.9, palette.cream);
opening('z', -19.2, -9.5, 2, .95, 2.25, 3.9, palette.coralShade);
opening('x', -11.4, -21.4, 2.5, .95, 2.25, 3.9, palette.coralShade);
opening('x', 2.6, 21.5, 1.9, 0, 2.45, 4.6, palette.cream);
for (const at of [.5, -7.6]) opening('z', 19.25, at, 1.9, 0, 2.45, 4.6, palette.cream);
opening('z', 19.25, -3.5, 2.4, .95, 2.25, 4.6, palette.tealDark);
opening('x', -10.2, 21.5, 2.6, .95, 2.25, 4.6, palette.tealDark);

test('door and window reveals have one paint surface, with no coplanar wall competing against the frame', () => {
  for (const a of apertures) for (const depth of [-.09, 0, .09]) {
    const origin = new THREE.Vector3(a.axis === 'x' ? a.at : a.fixed + depth,
      (a.bottom + a.top) / 2, a.axis === 'x' ? a.fixed + depth : a.at);
    const directions = [new THREE.Vector3(0, 1, 0)];
    for (const side of [-1, 1]) directions.push(new THREE.Vector3(a.axis === 'x' ? side : 0, 0, a.axis === 'x' ? 0 : side));
    // Include window sills, but not the walkable ground / floor in a doorway.
    if (a.trim !== palette.cream) directions.push(new THREE.Vector3(0, -1, 0));
    for (const direction of directions) {
      const expectedDistance = direction.y ? (a.top - a.bottom) / 2 : a.width / 2;
      const hits = new THREE.Raycaster(origin, direction, 0, expectedDistance + .01).intersectObjects(world.raycastMeshes, false);
      assert.ok(hits.length, 'missing frame surface');
      assert.ok(Math.abs(hits[0].distance - expectedDistance) < .00001, 'clear opening size changed');
      const nearest = hits.filter(hit => Math.abs(hit.distance - hits[0].distance) < .00001);
      const paints = [...new Set(nearest.map(hit => hit.object.material.color.getHex()))];
      assert.deepEqual(paints, [a.trim], `overlapping paints on ${a.axis} wall at ${a.fixed}, opening ${a.at}`);
    }
  }
});

test('frame seats stay sealed from both sides of the wall, including the outer frame corners', () => {
  for (const a of apertures) for (const sign of [-1, 1]) {
    const origin = new THREE.Vector3(a.axis === 'x' ? a.at : a.fixed + sign,
      (a.bottom + a.top) / 2, a.axis === 'x' ? a.fixed + sign : a.at);
    const direction = new THREE.Vector3(a.axis === 'x' ? 0 : -sign, 0, a.axis === 'x' ? -sign : 0);
    for (const side of [-1, 1]) for (const outside of [.045, .085, .095]) {
      const sample = origin.clone(); sample[a.axis] = a.at + side * (a.width / 2 + outside);
      for (const y of [(a.bottom + a.top) / 2, a.top + .045]) {
        sample.y = y;
        assert.ok(new THREE.Raycaster(sample, direction, 0, 2).intersectObjects(world.raycastMeshes, false).length,
          'frame recess left a pinhole in the facade');
      }
    }
  }
});

test('tower stair posts have one exposed cap paint, including both edges of each cap', () => {
  const rise = 5.875 / 20;
  for (const side of [-1, 1]) for (let step = 0; step < 20; step += 4) {
    const x = -.6 + side * .9, z = -8.8 + 2.5 + (19.5 - step) * .48;
    for (const dx of [-.035, .019, .035]) for (const dz of [-.045, .023, .045]) {
      const origin = new THREE.Vector3(x + dx, rise * (step + 1) + 1.4, z + dz);
      const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, .6).intersectObjects(world.raycastMeshes, false);
      assert.ok(hits.length, 'missing tower post cap');
      const paints = [...new Set(hits.filter(h => Math.abs(h.distance - hits[0].distance) < 1e-5)
        .map(h => h.object.material.color.getHex()))];
      assert.deepEqual(paints, [palette.mustard], `coplanar post/rail caps at side ${side}, step ${step}`);
    }
  }
});

test('tower stair rail panels form a closed surface without internal seam faces', () => {
  // These horizontal slices lie between the coloured posts and outside the treads.
  // A ray through the guard must enter once and exit once, without extra seams.
  for (const side of [-1, 1]) for (const step of [0, 4, 8, 12]) {
    const origin = new THREE.Vector3(-.6 + side * .9, 5.875 / 20 * (step + 1) + 1.07, 4.3);
    const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1), 0, 10.6).intersectObjects(world.raycastMeshes, false);
    const crossings = hits.filter((h, i) => i === 0 || Math.abs(h.distance - hits[i - 1].distance) > 1e-5);
    assert.equal(crossings.length, 2, `internal rail faces at side ${side}, height ${origin.y}`);
  }
});

test('tower rail outlines follow the stepped profile without cap triangulation diagonals', () => {
  const lines = scene.children.find(o => o.isLineSegments).geometry.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < lines.count; i += 2) {
    a.fromBufferAttribute(lines, i); b.fromBufferAttribute(lines, i + 1);
    if (Math.abs(a.x - b.x) > 1e-5 || ![-1.55, -1.45, .25, .35].some(x => Math.abs(a.x - x) < 1e-5)) continue;
    if ([a.z, b.z].some(z => z < -6.301 || z > 3.301)) continue;
    assert.ok(Math.abs(a.y - b.y) < 1e-5 || Math.abs(a.z - b.z) < 1e-5, 'diagonal seam across a rail side');
  }
});

import * as THREE from './vendor/three.module.js';
import { createUpperYard } from './upper-yard.js';
import { createCargoYard } from './cargo-yard.js';
import { NOSTALGOS12 as colors, WORLD_COLORS as palette } from './palette.js';

// Everything in the yard is static and batched by ink/color. Collision boxes are
// deliberately independent from the visible details so the combat lanes stay clean.
export function createWorld(scene, { headless = false } = {}) {
  const ink = palette.ink;
  const colliders = [], raycastMeshes = [], ladders = [];
  const batches = new Map(), linePositions = [];
  const gradient = new THREE.DataTexture(new Uint8Array([94, 94, 94, 255, 165, 165, 165, 255, 224, 224, 224, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), normalMatrix = new THREE.Matrix3();
  const vector = new THREE.Vector3(), normal = new THREE.Vector3();
  const euler = new THREE.Euler();
  let seed = 38197;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const unitCone = new THREE.ConeGeometry(1, 1, 6);
  const unitSphere = new THREE.SphereGeometry(1, 12, 8);
  const unitPlane = new THREE.PlaneGeometry(1, 1);

  function addGeometry(geometry, color, position, scale = [1, 1, 1], rotation = [0, 0, 0], outline = true, background = false) {
    const key = `${color}-${background ? 'back' : 'yard'}`;
    if (!batches.has(key)) batches.set(key, { color, background, positions: [], normals: [], uvs: [] });
    const target = batches.get(key);
    euler.set(...rotation);
    quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    normalMatrix.getNormalMatrix(matrix);
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const index = geometry.getIndex();
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) {
      const k = index ? index.getX(i) : i;
      vector.fromBufferAttribute(p, k).applyMatrix4(matrix);
      target.positions.push(vector.x, vector.y, vector.z);
      normal.fromBufferAttribute(n, k).applyMatrix3(normalMatrix).normalize();
      target.normals.push(normal.x, normal.y, normal.z);
      target.uvs.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
    }
    if (outline) {
      const edges = new THREE.EdgesGeometry(geometry, 24), ep = edges.getAttribute('position');
      for (let i = 0; i < ep.count; i++) {
        vector.fromBufferAttribute(ep, i).applyMatrix4(matrix);
        linePositions.push(vector.x, vector.y, vector.z);
      }
      edges.dispose();
    }
  }
  function box(x, y, z, w, h, d, color, solid = false, outline = true, rotationY = 0, background = false) {
    addGeometry(unitBox, color, [x, y, z], [w, h, d], [0, rotationY, 0], outline, background);
    if (solid) {
      const a = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d));
      colliders.push(a);
    }
  }
  function beam(ax, ay, az, bx, by, bz, width, color, outline = true, background = false) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const middle = a.clone().add(b).multiplyScalar(.5);
    const direction = b.sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const rot = new THREE.Euler().setFromQuaternion(q);
    addGeometry(unitBox, color, middle.toArray(), [width, direction.length(), width], rot.toArray().slice(0, 3), outline, background);
  }
  function panelTexture(kind, text, subtitle = '') {
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'poster' ? 512 : 1024;
    canvas.height = kind === 'poster' ? 720 : 320;
    const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    c.fillStyle = kind === 'poster' ? '#21525a' : '#dad4c9'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#272a32'; c.lineWidth = 20; c.strokeRect(10, 10, w - 20, h - 20);
    if (kind === 'poster') {
      const cx = w / 2, cy = 220;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 67 : 144;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath(); c.fillStyle = '#dc6250'; c.fill(); c.strokeStyle = '#272a32'; c.lineWidth = 17; c.stroke();
      c.textAlign = 'center'; c.fillStyle = '#dad4c9'; c.font = '60px "Lilita One",sans-serif';
      c.fillText('THE POP', w / 2, 460); c.fillText('SQUAD', w / 2, 526);
      c.font = 'bold 23px Arial, sans-serif'; c.fillText('WANTS YOU • ENLIST TODAY', w / 2, 610);
      c.fillStyle = '#dc6250'; c.fillRect(25, h - 51, w - 50, 18);
    } else {
      c.fillStyle = text === 'NO CAMPING' ? '#dc6250' : '#eeb24a'; c.fillRect(26, 26, w - 52, h - 52);
      // Printed halftone dots keep the signs in the same comic language as the yard.
      c.fillStyle = 'rgba(51,26,51,.11)';
      for (let y = 38; y < h - 30; y += 24) for (let x = 35; x < w - 30; x += 24) { c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); }
      c.fillStyle = '#272a32'; c.textAlign = 'center'; c.font = '132px "Lilita One",sans-serif'; c.fillText(text, w / 2, 189);
      c.font = 'bold 29px Arial, sans-serif'; c.fillText(subtitle, w / 2, 258);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  }
  function sign(x, y, z, w, h, rotation, kind, text, subtitle) {
    if (headless) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: panelTexture(kind, text, subtitle), side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh);
  }
  function disc(x, z, radius, color, scaleZ = 1) {
    const geo = new THREE.CircleGeometry(radius, 12);
    addGeometry(geo, color, [x, .024, z], [1, scaleZ, 1], [-Math.PI / 2, 0, 0], false);
    geo.dispose();
  }
  function splat(x, z, color, size = 1) {
    disc(x, z, size * .36, color, .76);
    for (let i = 0; i < 7; i++) {
      const angle = random() * Math.PI * 2, r = size * (.27 + random() * .45);
      disc(x + Math.cos(angle) * r, z + Math.sin(angle) * r, size * (.045 + random() * .12), color, .8);
    }
  }

  // Cream hard-packed sand, painted lanes, storm drains, and scattered field notes.
  box(0, -.18, 0, 110, .35, 110, palette.sand, false, false, 0, true);
  box(0, -.013, 2, 8.5, .025, 48, colors.paper, false, false);
  box(-6.4, .008, 2, .14, .018, 39, colors.paper, false, false);
  box(6.4, .008, 2, .14, .018, 39, colors.paper, false, false);
  for (let z = -20; z <= 21; z += 5) box(0, .012, z, .18, .023, 2.1, palette.cream, false, false);
  for (let x of [-12, 11.5]) {
    box(x, .015, 14.2, 2.5, .06, .65, ink, false, true);
    for (let k = 0; k < 9; k++) box(x - 1.08 + k * .27, .052, 14.2, .08, .025, .56, palette.grey, false, false);
  }
  for (let i = 0; i < 10; i++) {
    const x = (random() - .5) * 37, z = (random() - .5) * 35;
    box(x, .025, z, .32 + random() * .25, .025, .4, palette.paper, false, false, random() * 3);
  }
  splat(-8.6, 9.2, colors.paper, 1.5); splat(10, -7, colors.blush, 1.15); splat(-4, -3.4, colors.gold, .9);

  // Hollow buildings share the same wall pieces for rendering, movement and
  // bullet raycasts. Openings are subtracted instead of painted onto a solid.
  function wall(axis, fixed, from, to, height, color, openings = [], base = 0, trimColor = palette.coralDark) {
    const thickness = .28, trim = .09;
    function piece(a, b, bottom, top) {
      if (b - a < .001 || top - bottom < .001) return;
      const along = (a + b) / 2, y = base + (bottom + top) / 2;
      if (axis === 'x') box(along, y, fixed, b - a, top - bottom, thickness, color, true);
      else box(fixed, y, along, thickness, top - bottom, b - a, color, true);
    }
    // Reserve the frame's entire footprint in the wall. Cutting only the clear
    // opening leaves the wall reveal exactly coplanar with the jamb / lintel /
    // sill, so two different paint colours fight for the same depth value.
    // Frames still surround the original opening: passage and collision stay
    // the same size, and each exposed reveal now has exactly one surface.
    const recesses = openings.map(o => ({ ...o, width: o.width + 2 * trim,
      bottom: Math.max(0, o.bottom - trim), top: Math.min(height, o.top + trim) }));
    const cuts = [...new Set([from, to, ...recesses.flatMap(o => [o.at - o.width / 2, o.at + o.width / 2])])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1], middle = (a + b) / 2;
      const holes = recesses.filter(o => middle > o.at - o.width / 2 && middle < o.at + o.width / 2).sort((a, b) => a.bottom - b.bottom);
      let bottom = 0;
      for (const hole of holes) { piece(a, b, bottom, hole.bottom); bottom = Math.max(bottom, hole.top); }
      piece(a, b, bottom, height);
    }
    // Thin frames sit outside the clear opening. Doors stay open at all times.
    for (const opening of openings) {
      const { at, width, bottom, top } = opening;
      const color = bottom === 0 ? palette.cream : trimColor;
      const frame = (along, y, w, h) => axis === 'x'
        ? box(along, base + y, fixed, w, h, thickness + .12, color, true)
        : box(fixed, base + y, along, thickness + .12, h, w, color, true);
      for (const side of [-1, 1]) frame(at + side * (width / 2 + trim / 2), (bottom + top) / 2, trim, top - bottom);
      frame(at, top + trim / 2, width + 2 * trim, trim);
      if (bottom > 0) frame(at, bottom - trim / 2, width + 2 * trim, trim);
    }
  }
  const door = (at, width = 2.2, top = 2.8) => ({ at, width, bottom: 0, top });
  const windowOpening = (at, width, bottom, top) => ({ at, width, bottom, top });
  function building({ x, z, w, d, h, color, y = 0, floor = true, roofColor = palette.coralDark, trimColor = palette.coralDark, front = [], back = [], left = [], right = [] }) {
    const minX = x - w / 2, maxX = x + w / 2, minZ = z - d / 2, maxZ = z + d / 2;
    wall('x', maxZ, minX, maxX, h, color, front, y, trimColor);
    wall('x', minZ, minX, maxX, h, color, back, y, trimColor);
    wall('z', minX, minZ, maxZ, h, color, left, y, trimColor);
    wall('z', maxX, minZ, maxZ, h, color, right, y, trimColor);
    // A flush floor keeps both player and ground-based enemies on the same level.
    if (floor) box(x, y - .07, z, w, .14, d, palette.cream, true, false);
    box(x, y + h + .15, z, w + .5, .3, d + .5, roofColor, true);
    // Painted floor joints and overhead strips give the rooms a readable scale.
    for (let fx = minX + 1.5; fx < maxX - .2; fx += 1.5) box(fx, y + .003, z, .025, .006, d - .3, palette.warm, false, false);
    for (let fz = minZ + 1.5; fz < maxZ - .2; fz += 1.5) box(x, y + .004, fz, w - .3, .006, .025, palette.warm, false, false);
    for (let fz = minZ + 2; fz < maxZ - 1; fz += 5) {
      box(x, y + h - .08, fz, 1.5, .16, .32, palette.violet, true);
      box(x, y + h - .17, fz, 1.32, .04, .22, palette.paper, true, false);
    }
  }
  function supplyCrate(x, z, w = 1.3, h = 1.05, d = 1.25) {
    box(x, h / 2, z, w, h, d, palette.turquoise, true);
    box(x, h + .06, z, w + .08, .12, d + .08, palette.tealDark, true);
    box(x, h / 2, z + d / 2 + .012, .14, h, .024, palette.cream, false, false);
  }
  function workbench(x, z, w, d) {
    box(x, .43, z, w - .15, .86, d - .1, palette.violet, true);
    box(x, .93, z, w, .14, d, palette.mustard, true);
    for (const side of [-1, 1]) box(x + side * w * .22, .53, z + d / 2 - .035, w * .4, .52, .05, palette.purple);
    box(x - w * .22, .58, z + d / 2, .24, .045, .04, palette.cream, false, false);
  }

  // Right barracks: front entrance, a side exit onto the yard, open windows,
  // bunks and lockers. The central aisle and both door approaches stay clear.
  building({ x: 20.5, z: -1.5, w: 8.2, d: 23.4, h: 4.3, color: palette.mustard, roofColor: palette.ochreShade, trimColor: palette.ochreShade,
    front: [door(20.5, 2.4, 2.95)],
    left: [...[-9.5, -4.5, .5, 5.5].map(z => windowOpening(z, 2.8, 1.45, 2.95)), door(8.8, 2.0)] });
  for (const z of [-9.4, -4.8, 0, 4.8]) {
    box(18, .22, z, 1.6, .44, 2.6, palette.violet, true);
    box(18, .52, z, 1.55, .16, 2.55, palette.paper, true);
    box(18, .63, z - .75, 1.35, .12, .55, palette.cream, true);
    box(18, .62, z + .35, 1.56, .04, 1.35, palette.turquoise, false, false);
    box(23.6, 1.1, z, .9, 2.2, 2.2, palette.tealDark, true);
    for (const dz of [-.55, .55]) {
      box(23.12, 1.1, z + dz, .06, 2.05, 1.02, palette.turquoise);
      box(23.07, 1.12, z + dz + .3, .04, .25, .045, palette.cream, false, false);
    }
  }
  sign(20.5, 3.55, 10.37, 3.2, .72, 0, 'banner', 'BARRACKS', 'OPEN / WALK IN');
  sign(18.0, 2.0, 10.37, 1.2, 1.7, 0, 'poster', 'POP SQUAD');
  sign(16.23, 3.45, 8.8, 2.1, .62, -Math.PI / 2, 'banner', 'ENTRY', 'BARRACKS');
  sign(20.5, 2.4, -13.04, 3.8, .9, 0, 'banner', 'READY ROOM', 'GEAR UP / MOVE OUT');

  // Left armory: an entrance facing the spawn and an eastern door to the lane.
  building({ x: -20.4, z: -5.7, w: 7.4, d: 14.6, h: 3.6, color: palette.coral,
    front: [door(-20.4, 2.4, 2.65)],
    right: [...[-10.1, -6.2, -.6].map(z => windowOpening(z, 2.6, 1.15, 2.5)), door(-3.2, 1.9, 2.65)] });
  for (const z of [-9.8, -5.7, -1.5]) workbench(-22.8, z, 1.25, 2.25);
  supplyCrate(-18.5, -10.7); supplyCrate(-18.5, -7.7);
  sign(-20.4, 3.05, 1.77, 3.0, .62, 0, 'banner', 'ARMORY', 'OPEN / WALK IN');
  sign(-16.53, 3.05, -3.2, 2.5, .62, Math.PI / 2, 'banner', 'ARMORY', 'OPEN / WALK IN');
  sign(-20.4, 2.2, -12.84, 3.6, .9, 0, 'banner', 'NO CAMPING', 'KEEP MOVING, RECRUIT');

  // Rear workshop: open rolling-door bay and a side exit; worktops sit along
  // the back wall so the room can be crossed without jumping over furniture.
  building({ x: -3.7, z: -21.5, w: 21, d: 5.5, h: 3.3, color: palette.lightMustard, roofColor: palette.ochreShade, trimColor: palette.ochreShade,
    front: [door(-1, 2.2, 2.65), ...[-11.5, -6.5, 3.7].map(x => windowOpening(x, 2.6, 1.1, 2.4))],
    right: [door(-21.5, 2.0, 2.65)] });
  for (const x of [-10, -5, 2]) workbench(x, -23.15, 3.2, 1.15);
  supplyCrate(-12.5, -20.9, 1.2, .85, 1.2);
  box(-1, 2.89, -18.56, 2.4, .25, .3, palette.tealDark, true);
  sign(-3.6, 3.95, -18.45, 5.5, 1.2, 0, 'banner', 'POP YARD', 'WORKSHOP / WALK IN');
  box(-5.2, 3.65, -18.3, .1, 1.4, .1, ink); box(-2, 3.65, -18.3, .1, 1.4, .1, ink);
  sign(6.97, 2.95, -21.5, 2.4, .46, Math.PI / 2, 'banner', 'ENTRY', 'WORKSHOP');

  function cover(x, z, w, h, d, color, direction = 0, label = false) {
    box(x, h / 2, z, w, h, d, color, true, true, direction);
    box(x, h + .09, z, w + .17, .18, d + .17, color, true, true, direction);
    // Individual black fasteners and a lighter kick plate make cover feel manufactured.
    if (!direction) {
      box(x, .13, z + d / 2 + .018, w - .14, .16, .038, palette.cream, false, false);
      for (const sx of [-1, 1]) box(x + sx * (w / 2 - .19), h - .24, z + d / 2 + .03, .065, .065, .035, ink, false, false);
      if (label && w > 2.4) sign(x, h * .57, z + d / 2 + .035, Math.min(w - .4, 2.5), .58, 0, 'banner', 'NO CAMPING', '');
    }
  }
  cover(-5.7, -12.8, 3, 1.8, 2.1, palette.pink);
  cover(-13.2, -14.7, 1.65, 1.6, 1.65, palette.orange);
  cover(13.8, -15.6, 1.7, 1.5, 1.7, palette.coral);
  cover(-5.2, 5.7, 1.35, 1.25, 1.35, palette.pink);
  cover(4.8, -3.8, 1.45, 1.5, 1.45, palette.coral);

  // Dark violet steel watchtower: four slender legs, crossed braces, cabin and canopy.
  const tx = -.6, tz = -8.8;
  for (const dx of [-2.05, 2.05]) for (const dz of [-2.05, 2.05]) {
    box(tx + dx, 2.8, tz + dz, .28, 5.6, .28, palette.violet, true);
    box(tx + dx, .12, tz + dz, .62, .22, .62, palette.cream, true);
  }
  for (const z of [tz - 2.05, tz + 2.05]) {
    beam(tx - 2.05, .8, z, tx + 2.05, 5.2, z, .15, palette.purple);
    beam(tx + 2.05, .8, z, tx - 2.05, 5.2, z, .15, palette.purple);
  }
  for (const x of [tx - 2.05, tx + 2.05]) beam(x, .8, tz - 2.05, x, 5.2, tz + 2.05, .15, palette.violet);
  box(tx, 5.6, tz, 5.0, .3, 5.0, palette.violet, true);
  box(tx, 5.81, tz, 4.9, .13, 4.9, palette.purple, true);
  for (const x of [tx - 2.33, tx + 2.33]) {
    box(x, 6.46, tz, .13, 1.3, 4.5, palette.violet, true);
    box(x, 6.6, tz, .18, .2, 4.6, palette.mustard, true);
  }
  // Leave a real opening in the back railing for the ladder, and one in
  // the front for the stairs. The cabin and all walkable decks are solid.
  for (const side of [-1, 1]) {
    box(tx + side * 1.55, 6.4, tz - 2.25, 1.4, 1.15, .14, palette.violet, true);
    box(tx + side * 1.64, 6.4, tz + 2.25, 1.22, 1.15, .14, palette.violet, true);
  }
  box(tx, 7.08, tz, 3.1, 2.1, 2.9, palette.violet, true);
  box(tx, 7.25, tz + 1.49, 2.64, 1.05, .08, colors.paper);
  box(tx, 7.25, tz + 1.55, .12, 1.05, .1, palette.violet);
  box(tx - 1.59, 7.25, tz, .07, 1.05, 2.35, colors.teal);
  box(tx, 8.3, tz, 4.5, .3, 4.2, palette.violet, true);
  box(tx, 8.49, tz, 4.62, .09, 4.32, palette.coralDark, true);
  // Twenty shallow treads lead from the central lane onto the tower balcony.
  const deckHeight = 5.875, stairCount = 20, treadDepth = .48;
  // Render each guard as one closed stepped profile. Separate tread-sized boxes
  // leave coincident end faces and outline seams inside the continuous guard.
  const railProfile = new THREE.Shape(), rise = deckHeight / stairCount;
  railProfile.moveTo(0, rise);
  for (let i = 0; i < stairCount; i++) {
    railProfile.lineTo((i + 1) * treadDepth, rise * (i + 1));
    if (i + 1 < stairCount) railProfile.lineTo((i + 1) * treadDepth, rise * (i + 2));
  }
  railProfile.lineTo(stairCount * treadDepth, deckHeight + 1);
  for (let i = stairCount - 1; i >= 0; i--) {
    railProfile.lineTo(i * treadDepth, rise * (i + 1) + 1);
    if (i > 0) railProfile.lineTo(i * treadDepth, rise * i + 1);
  }
  railProfile.closePath();
  const railGeometry = new THREE.ExtrudeGeometry(railProfile, { depth: .1, bevelEnabled: false, steps: 1 });
  railGeometry.translate(0, 0, -.05); railGeometry.rotateY(Math.PI / 2);
  const railOutline = railProfile.getPoints(); railOutline.pop(); // repeated closing point
  for (const side of [-1, 1]) {
    const x = tx + side * .9, front = tz + 2.5 + stairCount * treadDepth;
    addGeometry(railGeometry, palette.violet, [x, 0, front], [1, 1, 1], [0, 0, 0], false);
    // Outline the actual profile. Cap triangulation can contain almost-zero-area
    // triangles whose normals otherwise make EdgesGeometry draw false diagonals.
    for (let i = 0; i < railOutline.length; i++) {
      const a = railOutline[i], b = railOutline[(i + 1) % railOutline.length];
      for (const dx of [-.05, .05]) linePositions.push(x + dx, a.y, front - a.x, x + dx, b.y, front - b.x);
      linePositions.push(x - .05, a.y, front - a.x, x + .05, a.y, front - a.x);
    }
  }
  railGeometry.dispose();
  for (let i = 0; i < stairCount; i++) {
    const h = deckHeight * (i + 1) / stairCount, z = tz + 2.5 + (stairCount - i - .5) * treadDepth;
    box(tx, h / 2, z, 1.65, h, treadDepth, i % 2 ? palette.violet : palette.purple, true);
    box(tx, h + .003, z + treadDepth / 2 - .045, 1.62, .006, .07, palette.mustard, false, false);
    for (const side of [-1, 1]) {
      // Preserve the original solid guard collision at every tread.
      colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(tx + side * .9, h + .5, z), new THREE.Vector3(.1, 1.0, treadDepth)));
      // A raised post top covers the guard instead of sharing its cap plane.
      if (i % 4 === 0) box(tx + side * .9, h + .51, z, .14, 1.02, .14, palette.mustard);
    }
  }
  // Ladder is out of the main approach, painted high visibility mustard.
  for (const x of [tx - .5, tx + .5]) box(x, 3.15, tz - 2.65, .1, 6.3, .1, palette.mustard);
  for (let y = .35; y < deckHeight; y += .44) box(tx, y, tz - 2.65, 1.1, .09, .1, palette.mustard);
  ladders.push({ x: tx, z: tz - 2.95, bottom: 0, top: deckHeight, exitX: tx, exitZ: tz - 1.97, normalX: 0, normalZ: 1 });
  box(tx, 9.3, tz, .08, 1.65, .08, ink);
  const flag = new THREE.Shape(); flag.moveTo(0, 0); flag.lineTo(1.75, -.25); flag.lineTo(1.4, -.65); flag.lineTo(0, -.7); flag.closePath();
  const flagGeometry = new THREE.ShapeGeometry(flag);
  addGeometry(flagGeometry, palette.coral, [tx + .07, 10, tz], [1, 1, 1], [0, .2, 0], true); flagGeometry.dispose();

  function barrel(x, z, color = palette.cream) {
    addGeometry(unitCylinder, color, [x, .75, z], [.58, 1.5, .58]);
    addGeometry(unitCylinder, palette.coral, [x, .86, z], [.592, .22, .592]);
    addGeometry(unitCylinder, ink, [x, 1.52, z], [.19, .025, .19], [0, 0, 0], false);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, .75, z), new THREE.Vector3(1.16, 1.5, 1.16)));
  }
  barrel(-14.5, 8.8); barrel(-13.1, 8.4, palette.mustard); barrel(11.8, -6.4); barrel(13.2, -6.4, palette.turquoise);
  function sandbags(x, z, horizontal = true) {
    const w = horizontal ? 4.1 : 1, d = horizontal ? 1 : 4.1;
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, .6, z), new THREE.Vector3(w, 1.2, d)));
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const along = (i - 1.5) * .98 + (row % 2 ? .2 : 0);
      box(x + (horizontal ? along : 0), .2 + row * .38, z + (horizontal ? 0 : along), horizontal ? .96 : .85, .36, horizontal ? .85 : .96, row % 2 ? colors.gold : colors.paper, false);
    }
  }
  sandbags(-7.8, 15.2); sandbags(6.1, -15.6);
  // A bench, field antenna and small cones give the arena a lived-in training-yard scale.
  box(-21.6, .8, 14.0, 3.7, .16, .8, palette.mustard);
  box(-21.6, 1.35, 14.38, 3.7, .8, .12, palette.mustard);
  for (const x of [-22.9, -20.3]) { box(x, .4, 14, .12, .8, .7, palette.violet); box(x, 1.06, 14.4, .12, 1.85, .12, palette.violet); }
  for (const [x, z] of [[-3.8, 19.2], [4.2, 18.4], [13.2, -2.9]]) {
    box(x, .07, z, .62, .14, .62, palette.violet);
    addGeometry(unitCone, palette.orange, [x, .49, z], [.24, .78, .24]);
    addGeometry(unitCone, palette.cream, [x, .53, z], [.17, .21, .17], [0, 0, 0], false);
  }

  const upperYard = createUpperYard({ box, building, sign, palette });
  const cargoYard = createCargoYard({ box, beam, addGeometry, cylinder: unitCylinder, sign, ladders, palette });

  // Fine chain-link alpha texture, shared by four perimeter panels.
  const fenceCanvas = headless ? null : document.createElement('canvas');
  if (fenceCanvas) fenceCanvas.width = fenceCanvas.height = 128;
  const fc = fenceCanvas?.getContext('2d');
  if (fc) { fc.strokeStyle = '#21525a'; fc.lineWidth = 2.7;
  for (let i = -128; i < 256; i += 32) {
    fc.beginPath(); fc.moveTo(i, 0); fc.lineTo(i + 128, 128); fc.stroke();
    fc.beginPath(); fc.moveTo(i, 0); fc.lineTo(i - 128, 128); fc.stroke();
  }
  }
  const fenceTexture = fenceCanvas ? new THREE.CanvasTexture(fenceCanvas) : null;
  if (fenceTexture) { fenceTexture.wrapS = fenceTexture.wrapT = THREE.RepeatWrapping; fenceTexture.repeat.set(36, 2); }
  const fenceMaterial = new THREE.MeshBasicMaterial({ map: fenceTexture, transparent: true, alphaTest: .18, side: THREE.DoubleSide, depthWrite: false });
  function fence(x, z, length, rotation) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, 2.7), fenceMaterial);
    mesh.position.set(x, 1.55, z); mesh.rotation.y = rotation; scene.add(mesh);
    const dx = Math.cos(rotation), dz = -Math.sin(rotation);
    beam(x - dx * length / 2, 2.9, z - dz * length / 2, x + dx * length / 2, 2.9, z + dz * length / 2, .085, palette.violet);
    beam(x - dx * length / 2, .3, z - dz * length / 2, x + dx * length / 2, .3, z + dz * length / 2, .065, palette.violet);
    for (let i = 0; i <= length; i += 5) box(x + dx * (i - length / 2), 1.6, z + dz * (i - length / 2), .14, 3.2, .14, palette.violet, false);
  }
  fence(0, -25.3, 51, 0); fence(0, 25.3, 51, 0); fence(-25.3, 0, 51, Math.PI / 2); fence(25.3, 0, 51, Math.PI / 2);
  for (let z = -20; z <= 20; z += 10) {
    box(-25.4, 4.8, z, .16, 9.6, .16, palette.violet, false, true, 0, true);
    beam(-25.4, 9.6, z, -24.2, 9.6, z, .16, palette.violet, true, true);
    addGeometry(unitSphere, palette.cream, [-24.2, 9.4, z], [.35, .17, .35], [0, 0, 0], false, true);
  }

  // Graphic landscape: faceted mint pines, smooth lavender hills and warm cloud puffs.
  function tree(x, z, size) {
    box(x, size * .65, z, size * .15, size * 1.3, size * .15, colors.teal, false, true, 0, true);
    addGeometry(unitCone, colors.teal, [x, size * 1.45, z], [size * .84, size * 1.65, size * .84], [0, 0, 0], true, true);
    addGeometry(unitCone, colors.green, [x, size * 2.12, z], [size * .65, size * 1.45, size * .65], [0, 0, 0], true, true);
  }
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28, r = 30 + random() * 5;
    tree(Math.cos(angle) * r, Math.sin(angle) * r, 1.6 + random() * 1.25);
  }
  for (const [x, z, sx, sy, sz, color] of [[-37, -44, 28, 14, 19, colors.blush], [2, -55, 31, 15, 20, colors.blush], [39, -43, 29, 13, 20, colors.paper], [-49, 10, 25, 11, 26, colors.paper], [48, 12, 26, 12, 25, colors.green], [4, 52, 45, 13, 20, colors.paper]]) {
    addGeometry(unitSphere, color, [x, -4.8, z], [sx, sy, sz], [0, 0, 0], false, true);
  }
  function cloud(x, y, z, scale) {
    for (const [dx, dy, radius] of [[-2, 0, 1.2], [-.6, .45, 1.55], [1.1, .1, 1.3], [2.4, -.1, .9]]) {
      addGeometry(unitSphere, palette.paper, [x + dx * scale, y + dy * scale, z], [radius * scale, radius * scale * .7, radius * scale * .8], [0, 0, 0], false, true);
    }
  }
  cloud(-22, 18, -42, 2.0); cloud(19, 20, -48, 2.5); cloud(38, 18, -8, 1.8); cloud(-42, 20, 15, 2.3); cloud(4, 23, 44, 2.1);

  // One indexed-free mesh per paint color and one global ink-edge draw call.
  for (const batch of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.computeBoundingSphere();
    // Ink edges sit on these triangles. A small fill bias keeps outlines stable
    // without disabling depth testing or showing edges through other objects.
    const material = new THREE.MeshToonMaterial({ color: batch.color, gradientMap: gradient, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = !batch.background; mesh.receiveShadow = true; scene.add(mesh);
    if (!batch.background || batch.color === palette.sand) raycastMeshes.push(mesh);
  }
  const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  scene.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: .93 })));
  for (const geometry of [unitBox, unitCylinder, unitCone, unitSphere, unitPlane]) geometry.dispose();
  return {
    colliders,
    ladders,
    upperSurfaces: [...upperYard.surfaces, ...cargoYard.surfaces],
    cargoContainers: cargoYard.containers,
    upperSpawnPoints: upperYard.spawns.map(p => new THREE.Vector3(...p)),
    raycastMeshes,
    spawnPoints: [new THREE.Vector3(-12, 0, -8), new THREE.Vector3(7.5, 0, -14), new THREE.Vector3(-8.8, 0, -17), new THREE.Vector3(12.5, 0, -.8), new THREE.Vector3(-13, 0, 6.2), new THREE.Vector3(4.4, 0, -12.5), new THREE.Vector3(7.5, 0, 8), new THREE.Vector3(-3.8, 0, -5.2)],
    bounds: { minX: -24.2, maxX: 24.2, minZ: -24.2, maxZ: 24.2 },
    update() {}
  };
}

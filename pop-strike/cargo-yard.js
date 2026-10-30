import { NOSTALGOS12 as colors } from './palette.js';
// Ground-level cargo islands break long sightlines while leaving the original
// building entrances, gallery approaches and watchtower stairs connected.
export function createCargoYard({ box, beam, addGeometry, cylinder, sign, ladders, palette: p }) {
  const surfaces = [], containers = [];
  const ink = colors.ink;
  function container({ x, z, w = 3.4, d = 7, y = 0, h = 2.8, turn = false, color = p.tealMid, trim = p.tealDark, open = false, label = '' }) {
    const angle = turn ? Math.PI / 2 : 0;
    const point = (a, b, c) => [x + (turn ? c : a), y + b, z + (turn ? -a : c)];
    const part = (a, b, c, width, height, depth, paint, solid = false, outline = true) =>
      box(...point(a, b, c), turn ? depth : width, height, turn ? width : depth, paint, solid, outline);
    const width = turn ? d : w, depth = turn ? w : d;
    containers.push({ x, z, w: width, d: depth, y, h, open });
    surfaces.push({ x, z, w: width, d: depth, y: y + h });

    if (open) {
      // The floor is flush with the yard, so AI and players can use both mouths.
      part(0, -.07, 0, w, .14, d, p.violet, true);
      for (const side of [-1, 1]) part(side * (w / 2 - .075), h / 2, 0, .15, h, d, color, true);
      part(0, h - .08, 0, w, .16, d, color, true);
      for (const end of [-1, 1]) part(0, h - .16, end * (d / 2 - .06), w, .32, .12, trim, true);
      for (let c = -d / 2 + .5; c < d / 2; c += .55) part(0, .004, c, w - .3, .008, .025, p.warm, false, false);
      part(0, h - .20, 0, .20, .04, d - .6, p.cream);
      // Folded doors extend alongside the western mouth, keeping its centre open.
      for (const side of [-1, 1]) {
        part(side * (w / 2 + .11), h / 2, -d / 2 - .65, .16, h, 1.3, trim, true);
        part(side * (w / 2 + .205), h / 2, -d / 2 - .65, .025, h - .3, .8, color);
      }
    } else {
      part(0, h / 2, 0, w, h, d, color, true);
      for (const end of [-1, 1]) {
        for (const side of [-1, 1]) {
          part(side * w / 4, h / 2, end * (d / 2 + .015), w / 2 - .16, h - .32, .03, color);
          part(side * w * .29, h / 2, end * (d / 2 + .055), .055, h - .6, .055, p.cream);
          part(side * w * .29 + .12, h * .45, end * (d / 2 + .09), .29, .055, .045, trim, false, false);
          for (const b of [.45, h - .45]) part(side * (w / 2 - .14), b, end * (d / 2 + .05), .22, .09, .07, trim);
        }
        part(0, h / 2, end * (d / 2 + .03), .055, h - .12, .04, trim);
      }
    }
    for (const side of [-1, 1]) {
      for (const b of [.10, h - .10]) part(side * (w / 2 + .025), b, 0, .13, .20, d + .10, trim);
      for (let c = -d / 2 + .38; c < d / 2 - .2; c += .45) {
        part(side * (w / 2 + .04), h / 2, c, .08, h - .42, .095, color, false, false);
      }
      for (const end of [-1, 1]) {
        part(side * (w / 2 - .035), h / 2, end * (d / 2 - .035), .16, h, .16, trim);
        for (const b of [.12, h - .12]) {
          part(side * (w / 2 - .015), b, end * (d / 2 - .015), .22, .24, .22, p.cream);
          part(side * (w / 2 + .10), b, end * (d / 2 - .015), .012, .07, .11, ink, false, false);
        }
      }
    }
    for (let c = -d / 2 + .4; c < d / 2; c += .6) part(0, h + .004, c, w - .25, .008, .035, trim, false, false);
    if (label) {
      const position = point(w / 2 + .091, h * .61, 0);
      sign(...position, Math.min(d - 1, 3.0), .72, angle + Math.PI / 2, 'banner', label, open ? 'THROUGH / BOTH ENDS OPEN' : 'POP LOGISTICS / KEEP CLEAR');
    }
  }
  function palletCrate(x, z, w, h, d, color = p.ochrePale, y = 0) {
    // One clean collision body; straps, battens and pallet feet are visual detail.
    box(x, y + h / 2, z, w, h, d, color, true);
    for (const side of [-1, 1]) {
      box(x + side * w * .32, y + h / 2, z, .10, h + .015, d + .025, p.violet, false, false);
      box(x, y + .10, z + side * (d / 2 + .015), w, .20, .05, p.ochreShade);
      box(x, y + h - .10, z + side * (d / 2 + .015), w, .12, .05, p.cream);
    }
    for (const dx of [-w * .38, 0, w * .38]) box(x + dx, y + .10, z + d / 2 + .045, .24, .09, .012, ink, false, false);
    for (let b = .35; b < h - .1; b += .32) box(x, y + b, z + d / 2 + .02, w - .15, .018, .025, p.ochreShade, false, false);
  }
  function ladder(x, z, bottom, top, exitZ) {
    const toward = Math.sign(exitZ - z), visualZ = z + toward * .29;
    for (const dx of [-.45, .45]) box(x + dx, (top + bottom) / 2 + .22, visualZ, .075, top - bottom + .44, .075, p.mustard);
    for (let y = bottom + .25; y < top + .1; y += .32) box(x, y, visualZ, .94, .065, .08, p.mustard);
    ladders.push({ x, z, bottom, top, exitX: x, exitZ, normalX: 0, normalZ: toward });
  }

  // West: a full-height stack with a stepped load leading to the lower roof.
  container({ x: -9.9, z: -.8, d: 8, color: p.tealMid, label: 'CARGO 01' });
  container({ x: -9.9, z: -1.5, d: 6.6, y: 2.8, color: p.tealPale, label: '01 / UPPER' });
  palletCrate(-9.9, 6.35, 2.2, .8, 1.1);
  palletCrate(-9.9, 4.95, 2.1, 1.65, 1.5, p.lightMustard);
  palletCrate(-9.9, 3.8, 2.1, 2.35, .8, p.ochrePale);
  ladder(-9.9, 2.36, 2.8, 5.6, 1.40);

  // Northeast: another staggered high stack blocks fire from the rear gallery.
  container({ x: 9.4, z: -8.9, w: 3.2, d: 6.4, color: p.coralSoft, trim: p.coralShade, label: 'CARGO 02' });
  container({ x: 9.4, z: -9.5, w: 3.2, d: 5.2, y: 2.8, color: p.coralPale, trim: p.coralShade });

  // East: a roofed shortcut with real openings, not a solid painted doorway.
  container({ x: 10.4, z: 3.5, w: 3.4, d: 7.4, turn: true, open: true, color: p.lightMustard, trim: p.ochreShade, label: 'CUT THROUGH' });
  palletCrate(13.0, 3.5, 1.7, 1.75, 2.4, p.coralSoft, 2.8);
  ladder(10.0, 5.76, 0, 2.8, 4.76);

  // Southern lanes start behind tall cover instead of exposing both spawn sides.
  container({ x: 4.8, z: 11.3, w: 3, d: 6.8, turn: true, color: p.tealSoft, label: 'CARGO 03' });
  container({ x: 5.5, z: 11.3, w: 3, d: 5.4, y: 2.8, turn: true, color: p.tealPale });
  container({ x: -9.6, z: 11.7, w: 2.8, d: 5.6, turn: true, color: p.coralSoft, trim: p.coralShade, label: 'LOADING' });
  palletCrate(-9.8, 11.7, 2.4, 1.3, 2.4, p.ochrePale, 2.8);
  palletCrate(-7.65, 11.7, 1.05, .8, 2.1, p.lightMustard, 2.8);

  // Parked forklift and its load form an irregular cover island near mid-yard.
  const fx = -3.25, fz = 9.6;
  box(fx, .66, fz, 1.8, .95, 2.6, p.mustard, true);
  box(fx, 1.26, fz + .79, 1.75, .55, .9, p.lightMustard, true);
  for (const dx of [-.87, .87]) for (const dz of [-.79, .79]) {
    addGeometry(cylinder, p.violet, [fx + dx, .46, fz + dz], [.43, .30, .43], [0, 0, Math.PI / 2]);
    addGeometry(cylinder, p.ochrePale, [fx + dx * 1.17, .46, fz + dz], [.20, .035, .20], [0, 0, Math.PI / 2]);
  }
  for (const dx of [-.73, .73]) for (const dz of [-.4, .68]) box(fx + dx, 1.98, fz + dz, .09, 1.7, .09, p.violet, true);
  box(fx, 2.88, fz + .15, 1.95, .18, 1.55, p.mustard, true);
  box(fx, 1.39, fz + .19, .74, .16, .64, p.violet);
  box(fx, 1.66, fz + .44, .74, .61, .13, p.violet);
  beam(fx, 1.3, fz - .35, fx, 1.75, fz - .68, .11, p.violet);
  for (const dx of [-.55, .55]) {
    box(fx + dx, 1.72, fz - 1.42, .15, 3.44, .16, p.violet, true);
    box(fx + dx, .13, fz - 2.12, .18, .14, 1.6, p.violet, true);
  }
  box(fx, 2.65, fz - 1.42, 1.25, .16, .18, p.ochreShade, true);
  palletCrate(fx, 6.75, 2.25, 2.25, 1.65, p.ochrePale);
  box(fx + .55, 3.04, fz + .30, .16, .18, .16, p.coral);

  // Generator station: tall louvres, service doors, exhaust and cable drums.
  const gx = -11.7, gz = -11.5;
  box(gx, .12, gz, 4.1, .24, 2.5, p.violet, true);
  box(gx, 1.40, gz, 3.8, 2.56, 2.2, p.tealDark, true);
  box(gx, 2.76, gz, 3.94, .16, 2.34, p.tealPale, true);
  for (let i = 0; i < 9; i++) box(gx - .85, .64 + i * .20, gz + 1.12, 1.53, .065, .06, p.tealSoft, false, false);
  box(gx + .95, 1.45, gz + 1.13, 1.4, 1.95, .07, p.tealMid);
  box(gx + 1.43, 1.45, gz + 1.19, .065, .30, .04, p.cream);
  box(gx + 1.25, 2.98, gz - .64, .16, .60, .16, p.violet, true);
  box(gx + 1.37, 3.26, gz - .64, .38, .12, .22, p.violet, true);
  sign(gx + .95, 2.03, gz + 1.18, 1.05, .38, 0, 'banner', 'POWER', 'GEN / 04');

  // Bundled pipes and an upright steel rack screen the eastern staircase approach.
  const rx = 13.3, rz = 12.7;
  for (const x of [rx - 1.4, rx + 1.4]) for (const z of [rz - 1.6, rz + 1.6]) box(x, 1.75, z, .15, 3.5, .15, p.ochreShade, true);
  for (const z of [rz - 1.6, rz + 1.6]) {
    for (const y of [.24, 1.37, 2.50]) box(rx, y, z, 2.95, .16, .18, p.mustard, true);
  }
  for (let row = 0; row < 3; row++) {
    // The bundles are too tightly packed to walk between; collision stays simple.
    box(rx, .76 + row * 1.13, rz, 2.64, .94, 3.6, p.tealDark, true, false);
    for (const dx of [-.87, 0, .87]) {
      addGeometry(cylinder, row === 1 ? p.tealMid : p.tealSoft, [rx + dx, .76 + row * 1.13, rz], [.44, 3.64, .44], [Math.PI / 2, 0, 0]);
      for (const side of [-1, 1]) {
        // Recessed dark ends read as hollow steel pipe mouths.
        addGeometry(cylinder, p.violet, [rx + dx, .76 + row * 1.13, rz + side * 1.827], [.32, .012, .32], [Math.PI / 2, 0, 0], false);
      }
    }
  }
  for (const z of [rz - 1, rz + 1]) box(rx, 3.52, z, 2.88, .055, .12, p.cream);

  // Painted loading bays and caution stripes tie the new props to the yard.
  for (const [x, z, w, d] of [[-9.6, 11.7, 7.3, 4.6], [4.8, 11.3, 8.2, 4.8], [10.4, 3.5, 9.5, 5.1], [-9.9, -.8, 5, 9.7]]) {
    for (const side of [-1, 1]) {
      box(x + side * w / 2, .014, z, .09, .024, d, p.cream, false, false);
      box(x, .014, z + side * d / 2, w, .024, .09, p.cream, false, false);
    }
  }
  for (const [x, z, width] of [[-9.9, 7.4, 2.8], [10.4, 6.5, 3.7]]) {
    for (let offset = -width / 2; offset < width / 2; offset += .4) box(x + offset, .018, z, .19, .028, .65, p.mustard, false, false, -.45);
  }
  return { surfaces, containers };
}

// The two existing buildings anchor a continuous upper route. Heights are
// measured at the soles: armory 3.9 m, gallery/barracks 4.6 m, workshop 3.6 m.
export function createUpperYard({ box, building, sign, palette: p }) {
  const surfaces = [];
  const door = (at, width = 1.9) => ({ at, width, bottom: 0, top: 2.45 });
  const window = (at, width = 2) => ({ at, width, bottom: .95, top: 2.25 });
  function surface(x, z, w, d, y) { surfaces.push({ x, z, w, d, y }); }
  function deck(x, z, w, d, y, color = p.tealSoft) {
    box(x, y - .12, z, w, .24, d, color, true);
    surface(x, z, w, d, y);
  }
  function rail(axis, fixed, from, to, y, color = p.tealDark) {
    if (to - from < .1) return;
    const along = (from + to) / 2, length = to - from;
    const part = (a, cy, w, h, depth, paint) => axis === 'x'
      ? box(a, cy, fixed, w, h, depth, paint, true)
      : box(fixed, cy, a, depth, h, w, paint, true);
    part(along, y + .12, length, .24, .12, color);
    part(along, y + 1.05, length, .12, .14, color);
    const count = Math.ceil(length / 1.7);
    for (let i = 0; i <= count; i++) part(from + length * i / count, y + .52, .10, 1.04, .10, color);
  }
  function stairs({ x, z, dz, base = 0, top, count, depth, width = 2, color = p.tealMid, light = p.tealSoft, railColor = p.tealDark }) {
    for (let i = 0; i < count; i++) {
      const height = (top - base) * (i + 1) / count, cz = z + dz * (i + .5) * depth;
      box(x, base + height / 2, cz, width, height, depth, i % 2 ? color : light, true);
      // Tread paint sits only a few millimetres above the collision surface.
      box(x, base + height + .003, cz - dz * (depth / 2 - .04), width - .05, .006, .07, p.ochrePale, false, false);
      for (const side of [-1, 1]) {
        box(x + side * (width / 2 + .10), base + height + .52, cz, .10, 1.04, depth, railColor, true);
      }
    }
    surface(x, z + dz * count * depth / 2, width, count * depth, top);
  }
  function cover(x, y, z, w, d, color) {
    box(x, y + .45, z, w, .9, d, color, true);
    box(x, y + .94, z, w + .10, .08, d + .10, p.cream, true);
    box(x, y + .45, z + d / 2 + .012, .12, .9, .024, p.cream, false, false);
  }

  // Recessed second floors leave broad, usable balconies facing the yard.
  building({ x: -21.4, z: -7.8, w: 4.4, d: 7.2, h: 2.8, y: 3.9, floor: false,
    color: p.coralPale, roofColor: p.coralShade, trimColor: p.coralShade,
    front: [door(-21.4)], right: [door(-5.6), window(-9.5)],
    back: [window(-21.4, 2.5)] });
  building({ x: 21.5, z: -3.8, w: 4.5, d: 12.8, h: 3, y: 4.6, floor: false,
    color: p.ochrePale, roofColor: p.ochreShade, trimColor: p.tealDark,
    front: [door(21.5)], left: [door(.5), door(-7.6), window(-3.5, 2.4)],
    back: [window(21.5, 2.6)] });
  surface(-20.4, -5.7, 7.9, 15.1, 3.9);
  surface(20.5, -1.5, 8.7, 23.9, 4.6);
  surface(-3.7, -21.5, 21.5, 6, 3.6);

  // Cornice bands keep each wing within its original colour family.
  box(-21.4, 6.58, -7.8, 4.52, .12, 7.32, p.coralSoft);
  box(21.5, 7.46, -3.8, 4.62, .16, 12.92, p.lightMustard);
  cover(-23.2, 3.9, -.8, 1.2, .7, p.coralSoft);
  cover(-18.75, 3.9, -9.0, .55, 1.35, p.coralShade);
  cover(22.1, 4.6, 7.2, 2.0, .75, p.ochreShade);
  cover(18.75, 4.6, -4.8, .55, 1.25, p.mustard);
  // Furnish the upper rooms while keeping the doors and their connecting aisle clear.
  cover(-22.65, 3.9, -9.2, .65, 1.6, p.coralSoft);
  cover(23.05, 4.6, -3.3, .65, 2.2, p.mustard);
  sign(-21.4, 6.58, -4.04, 2.6, .48, 0, 'banner', 'UPPER ARMORY', 'BALCONY / GALLERY');
  sign(21.5, 7.27, 2.77, 2.7, .48, 0, 'banner', 'LOOKOUT', 'SECOND FLOOR');

  // Two independent approaches from the yard, clear of all ground-floor doors.
  stairs({ x: -18, z: 8.75, dz: -1, top: 3.9, count: 13, depth: .55, color: p.coralSoft, light: p.coralPale, railColor: p.coralShade });
  stairs({ x: 18, z: 18.52, dz: -1, top: 4.6, count: 16, depth: .52, color: p.ochreShade, light: p.ochrePale, railColor: p.ochreShade });
  sign(-19.7, 1.0, 8.3, 1.1, .62, 0, 'banner', 'UP', 'ARMORY / 02');
  sign(16.4, 1.0, 18.1, 1.1, .62, 0, 'banner', 'UP', 'LOOKOUT / 02');

  // Armory balcony guards. Gaps line up with the stairs and northern gallery.
  rail('x', 1.75, -24.2, -19.25, 3.9, p.coralShade);
  rail('x', 1.75, -16.75, -16.55, 3.9, p.coralShade);
  rail('z', -16.55, -13.15, 1.75, 3.9, p.coralShade);
  rail('z', -24.2, -13.15, 1.75, 3.9, p.coralShade);
  rail('x', -13.15, -24.2, -19.05, 3.9, p.coralShade);
  // Barracks guards and matching north/south openings.
  rail('x', 10.35, 16.25, 16.75, 4.6, p.ochreShade);
  rail('x', 10.35, 19.25, 24.6, 4.6, p.ochreShade);
  rail('z', 16.25, -13.35, 10.35, 4.6, p.ochreShade);
  rail('z', 24.6, -13.35, 10.35, 4.6, p.ochreShade);
  rail('x', -13.35, 19.05, 24.6, 4.6, p.ochreShade);

  // A covered horseshoe gallery crosses above the rear combat lane. The floor
  // is 4.6 m high, leaving room for players and enemies underneath.
  deck(0, -16.9, 38.1, 2.5, 4.6);
  deck(-17.8, -14.45, 2.5, 2.4, 4.6);
  deck(17.8, -14.55, 2.5, 2.2, 4.6);
  stairs({ x: -17.8, z: -11.45, dz: -1, base: 3.9, top: 4.6, count: 4, depth: .45, width: 2.1 });
  rail('z', -19.05, -18.15, -13.25, 4.6);
  rail('z', -16.55, -15.65, -13.25, 4.6);
  rail('z', 19.05, -18.15, -13.45, 4.6);
  rail('z', 16.55, -15.65, -13.45, 4.6);
  rail('x', -15.65, -16.55, 16.55, 4.6);
  rail('x', -18.15, -19.05, -10.1, 4.6);
  rail('x', -18.15, -7.9, 19.05, 4.6);
  for (const x of [-15, -10, -5, 5, 10, 15]) {
    box(x, 2.18, -17.85, .25, 4.36, .25, p.tealDark, true);
    box(x, .10, -17.85, .48, .2, .48, p.tealPale, true);
  }
  for (const x of [-11, 0, 11]) {
    box(x, 7.43, -16.9, 7.0, .18, 2.85, p.tealMid, true);
    box(x, 7.55, -16.9, 7.15, .06, 2.95, p.tealPale, true);
    for (const dx of [-3.25, 3.25]) for (const z of [-17.96, -15.84]) {
      box(x + dx, 5.97, z, .10, 2.74, .10, p.tealDark, true);
    }
    // Pale underside panels keep the shaded route readable in the comic palette.
    box(x, 7.32, -16.9, 1.6, .04, .36, p.cream, true, false);
  }
  sign(0, 6.92, -15.38, 4.0, .72, 0, 'banner', 'SKY GALLERY', 'ARMORY  /  LOOKOUT');
  for (const x of [-13, -3, 7]) cover(x, 4.6, -17.7, 1.6, .45, x === -3 ? p.tealMid : p.tealPale);

  // A lower workshop terrace branches off the gallery via four shallow steps.
  stairs({ x: -9, z: -20.15, dz: 1, base: 3.6, top: 4.6, count: 4, depth: .5, width: 1.8 });
  rail('x', -18.6, -14.3, -10.05, 3.6, p.ochreShade);
  rail('x', -18.6, -7.95, 6.9, 3.6, p.ochreShade);
  rail('x', -24.15, -14.3, 6.9, 3.6, p.ochreShade);
  rail('z', -14.3, -24.15, -18.6, 3.6, p.ochreShade);
  rail('z', 6.9, -24.15, -18.6, 3.6, p.ochreShade);
  cover(-5.5, 3.6, -22.4, 2.0, .8, p.lightMustard);
  cover(4.1, 3.6, -20.6, 1.5, .8, p.ochrePale);

  return { surfaces, spawns: [
    [-17.8, 3.9, -5.5], [17.7, 4.6, 6.3], [8, 4.6, -16.7], [-11, 4.6, -16.7],
  ] };
}

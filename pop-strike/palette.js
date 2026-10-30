// Exact sRGB swatches from assets/nostalgos-12.png, in their original order.
// These are the base paints; lighting and transparency supply their shading.
export const NOSTALGOS12 = Object.freeze({
  coral:0xdc6250, blush:0xdeada5, paper:0xdad4c9,
  butter:0xffd183, gold:0xeeb24a, green:0x55927f,
  teal:0x21525a, ink:0x272a32, blue:0x2152a5,
  sky:0x5a8bde, lavender:0xb89ce9, purple:0x844790,
});

// Warm ground and facades, cool cargo and steel, purple accents.
const c = NOSTALGOS12;
export const WORLD_COLORS = Object.freeze({
  ink:c.ink, sand:c.butter, warm:c.paper,
  mustard:c.gold, lightMustard:c.butter,
  coral:c.coral, coralDark:c.purple,
  turquoise:c.green, tealDark:c.teal,
  violet:c.blue, purple:c.sky, mint:c.green,
  cream:c.paper, paper:c.paper, orange:c.gold,
  pink:c.lavender, grey:c.teal,
  coralPale:c.blush, coralSoft:c.coral, coralShade:c.purple,
  tealPale:c.paper, tealSoft:c.green, tealMid:c.green,
  ochrePale:c.paper, ochreShade:c.gold,
});

export const TEAM_COLORS = Object.freeze({red:c.coral, blue:c.sky});
export const SOLDIER_HEADBAND_COLORS = Object.freeze([
  c.gold, c.coral, c.sky, c.green, c.lavender, c.paper,
]);
export const WEAPON_COLORS = Object.freeze({
  rifle:c.blue, shotgun:c.gold, smg:c.coral,
  sniper:c.green, handcannon:c.lavender, revolver:c.paper,
});
export const hex = color => `#${color.toString(16).padStart(6,'0')}`;

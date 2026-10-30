// One arsenal definition for solo play, LAN simulation, HUD and weapon models.
// Spread is angular (camera-local direction), independent of FOV / aspect ratio.
export const WEAPONS = [
  { name: 'MK.01 / 爆点突击步枪', label: '步枪', type: 'rifle', mode: 'AUTO', automatic: true,
    capacity: 30, interval: .105, damage: 34, pellets: 1, spread: .009, aimSpread: .0029, reload: 1.35, range: 75,
    recoil: .085, kick: .006, shake: .008, flash: 1, adsFov: 51, adsY: -.2805, muzzle: [0,.025,-1.18] },
  { name: 'MK.02 / 漫画泵动霰弹枪', label: '霰弹枪', type: 'shotgun', mode: 'PUMP', automatic: false,
    capacity: 6, interval: .68, damage: 20, pellets: 9, spread: .09, aimSpread: .065, reload: 1.8, range: 38, falloffStart: 12, minDamage: .35,
    recoil: .15, kick: .016, shake: .018, flash: 1.6, adsFov: 55, adsY: -.16, muzzle: [0,.045,-1.12] },
  { name: 'MK.03 / 疾风冲锋枪', label: '冲锋枪', type: 'smg', mode: 'AUTO', automatic: true,
    capacity: 30, interval: .075, damage: 22, pellets: 1, spread: .019, aimSpread: .005, reload: 1.15, range: 65, falloffStart: 18, minDamage: .6,
    recoil: .055, kick: .004, shake: .006, flash: .75, adsFov: 55, adsY: -.2035, muzzle: [0,.025,-.685] },
  { name: 'MK.04 / 远望栓动狙击枪', label: '狙击枪', type: 'sniper', mode: 'BOLT', automatic: false, scope: true,
    capacity: 5, interval: 1.15, damage: 85, pellets: 1, spread: .055, aimSpread: .00035, reload: 2.4, range: 120,
    recoil: .19, kick: .023, shake: .022, flash: 1.5, adsFov: 18, adsY: -.32, muzzle: [0,.045,-1.50] },
  { name: 'MK.05 / HAND CANNON 重型手枪', label: '重型手枪', type: 'handcannon', mode: 'SEMI', automatic: false,
    capacity: 7, interval: .36, damage: 55, pellets: 1, spread: .017, aimSpread: .0022, reload: 1.65, range: 65,
    recoil: .14, kick: .020, shake: .015, flash: 1.2, adsFov: 56, adsY: -.18, muzzle: [0,.065,-.60] },
  { name: 'MK.06 / 六响左轮', label: '左轮', type: 'revolver', mode: 'SEMI', automatic: false,
    capacity: 6, interval: .48, damage: 62, pellets: 1, spread: .013, aimSpread: .0018, reload: 2.05, range: 70,
    recoil: .16, kick: .023, shake: .017, flash: 1.3, adsFov: 54, adsY: -.18, muzzle: [0,.07,-.77] },
];
export const createAmmo = () => WEAPONS.map(w => w.capacity);
export const validWeapon = index => Number.isInteger(index) && index >= 0 && index < WEAPONS.length;
export const shotSpread = (weapon, aiming) => aiming ? weapon.aimSpread : weapon.spread;
export function shotDamage(weapon, distance, headshot = false) {
  const falloff = weapon.falloffStart === undefined ? 1 : 1 - (1 - weapon.minDamage) * Math.max(0, Math.min(1, (distance - weapon.falloffStart) / (weapon.range - weapon.falloffStart)));
  return weapon.damage * falloff * (headshot ? 2 : 1);
}

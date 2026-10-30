// Ground troops and balcony guards share horizontal steering, but guards must
// test obstacles at their own height and keep their entire footprint on a deck.
export function enemyPositionBlocked(world, x, z, feet = 0, radius = .25) {
  const b = world.bounds, epsilon = .001;
  if (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius) return true;
  if (world.colliders.some(c => c.min.y < feet + 2.1 - epsilon && c.max.y > feet + epsilon &&
    x > c.min.x - radius && x < c.max.x + radius && z > c.min.z - radius && z < c.max.z + radius)) return true;
  if (feet <= epsilon) return false;
  for (const dx of [-radius, radius]) for (const dz of [-radius, radius]) {
    if (!world.colliders.some(c => Math.abs(c.max.y - feet) < epsilon &&
      x + dx >= c.min.x - epsilon && x + dx <= c.max.x + epsilon &&
      z + dz >= c.min.z - epsilon && z + dz <= c.max.z + epsilon)) return true;
  }
  return false;
}

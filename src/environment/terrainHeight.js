/**
 * terrainHeight.js
 * Single source of truth for the zoo's ground elevation, water bodies and
 * path layout. Used by the terrain mesh, the animals, props and the camera so
 * that nothing floats, sinks or clips through the ground.
 */

import * as THREE from 'three';

// --- World layout constants -------------------------------------------------
// `level` matches the visual water surface in WaterSystem (y = 0.35).
export const WATER_BODIES = [
  { name: 'lake', x: -22, z: 10, radius: 10.6, depth: -0.5, shoreWidth: 4.5, level: 0.05 },
  { name: 'pond', x: 26, z: -16, radius: 9.6, depth: -0.5, shoreWidth: 4, level: 0.05 }
];

export const SNOW_ISLAND = { x: -35, z: -40, radius: 17, height: 0.8 };

/** Carves a basin with a smooth bank instead of a hard cliff. */
function basin(y, x, z, body) {
  const d = Math.hypot(x - body.x, z - body.z);
  if (d >= body.radius + body.shoreWidth) return y;
  const bed = Math.min(y, body.depth);
  if (d <= body.radius) return bed;
  const t = (d - body.radius) / body.shoreWidth;
  const smooth = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(bed, y, smooth);
}

/** Raw sculpting formula shared with the terrain mesh generator. */
export function sculptHeight(x, z) {
  let y = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 1.5;
  y += Math.sin(x * 0.08 + z * 0.06) * 0.6;

  // Flatten entrance & central plaza
  const distFromCenter = Math.sqrt(x * x + z * z);
  if (distFromCenter < 25) y *= distFromCenter / 25;

  // Lake and lotus pond basins (with soft banks)
  y = basin(y, x, z, WATER_BODIES[0]);
  y = basin(y, x, z, WATER_BODIES[1]);

  // Snowy mountain backdrop behind the penguin isle
  const distSnow = Math.sqrt((x + 35) * (x + 35) + (z + 45) * (z + 45));
  if (distSnow < 25) y += (25 - distSnow) * 0.18;

  return y;
}

/**
 * Walkable ground height at a world position (terrain + snow island shelf).
 */
export function getGroundHeight(x, z) {
  let y = sculptHeight(x, z);

  const dSnow = Math.hypot(x - SNOW_ISLAND.x, z - SNOW_ISLAND.z);
  if (dSnow < SNOW_ISLAND.radius) {
    // Snow island is a raised cylinder shelf; blend its rim into the hills.
    const rim = THREE.MathUtils.smoothstep(dSnow, SNOW_ISLAND.radius - 3, SNOW_ISLAND.radius);
    y = THREE.MathUtils.lerp(SNOW_ISLAND.height, y, rim);
  }

  return y;
}

/** How deep the water is at this point (0 = dry land). */
export function getWaterDepth(x, z) {
  const ground = getGroundHeight(x, z);
  for (const w of WATER_BODIES) {
    const d = Math.hypot(x - w.x, z - w.z);
    // The visible water disc is exactly `radius` wide.
    if (d < w.radius) {
      const depth = w.level - ground;
      if (depth > 0) return depth;
    }
  }
  return 0;
}

export function isWater(x, z) {
  return getWaterDepth(x, z) > 0.15;
}

/** Nearest shore position for a point inside/next to water. */
export function nearestShore(x, z, margin = 2.5) {
  let best = null;
  let bestDist = Infinity;
  for (const w of WATER_BODIES) {
    const d = Math.hypot(x - w.x, z - w.z);
    if (d > 0.001 && d < w.radius + w.shoreWidth + 8) {
      const t = (w.radius + margin) / d;
      const sx = w.x + (x - w.x) * t;
      const sz = w.z + (z - w.z) * t;
      const dist = Math.hypot(sx - x, sz - z);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: sx, z: sz };
      }
    }
  }
  return best;
}

/** Ground height used when placing scenery (keeps props flat in the plaza). */
export function getPropHeight(x, z) {
  return getGroundHeight(x, z);
}

// --- Habitat zones ----------------------------------------------------------
export const ZONES = {
  entrance: { name: 'Cổng Chào', center: [0, 0, 24], radius: 12 },
  plaza: { name: 'Quảng Trường Trung Tâm', center: [0, 0, 4], radius: 14 },
  flower_meadow: { name: 'Vườn Hoa & Đồng Cỏ Thỏ', center: [22, 0, 15], radius: 14 },
  sweet_grassland: { name: 'Đồng Cỏ Voi Con', center: [33, 0, 21], radius: 14 },
  sunset_savanna: { name: 'Thảo Nguyên Hoàng Hôn', center: [-40, 0, 30], radius: 15 },
  capybara_lake: { name: 'Hồ Capybara', center: [-22, 0, 10], radius: 16 },
  fairytale_forest: { name: 'Rừng Cổ Tích', center: [-16, 0, -24], radius: 17 },
  crystal_ice: { name: 'Đảo Băng Chim Cánh Cụt', center: [-35, 0, -40], radius: 17 },
  lotus_pond: { name: 'Đầm Sen Hồng Hạc', center: [26, 0, -16], radius: 15 },
  secret_garden: { name: 'Vườn Bí Mật Của Nhi', center: [0, 0, -30], radius: 12 }
};

export function zoneOf(x, z) {
  let best = null;
  let bestScore = Infinity;
  for (const id of Object.keys(ZONES)) {
    const z0 = ZONES[id];
    const d = Math.hypot(x - z0.center[0], z - z0.center[2]) / z0.radius;
    if (d < 1 && d < bestScore) {
      bestScore = d;
      best = id;
    }
  }
  return best;
}

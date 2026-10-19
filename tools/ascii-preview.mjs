/**
 * tools/ascii-preview.mjs
 * Renders each sculpted animal's REST-pose geometry as an ASCII silhouette
 * (side / front / top) plus a coarse colour map. This exists so the geometry
 * can be inspected in a terminal (and by tooling that cannot view images):
 * proportions, silhouette clarity and "is it one cohesive body" are all
 * readable here.
 *
 *   node tools/ascii-preview.mjs [species]
 */

import * as THREE from 'three';
import { installDomShim } from './dom-shim.mjs';
installDomShim();

const { Bunny } = await import('../src/animals/Bunny.js');
const { Capybara } = await import('../src/animals/Capybara.js');
const { Otter } = await import('../src/animals/Otter.js');
const { Fox } = await import('../src/animals/Fox.js');
const { Deer } = await import('../src/animals/Deer.js');
const { RedPanda } = await import('../src/animals/RedPanda.js');
const { Penguin } = await import('../src/animals/Penguin.js');
const { Flamingo } = await import('../src/animals/Flamingo.js');
const { BabyElephant } = await import('../src/animals/BabyElephant.js');
const { LionCub } = await import('../src/animals/LionCub.js');

const SPECIES = [
  ['bunny', Bunny],
  ['capybara', Capybara],
  ['otter', Otter],
  ['fox', Fox],
  ['deer', Deer],
  ['red_panda', RedPanda],
  ['penguin', Penguin],
  ['flamingo', Flamingo],
  ['elephant', BabyElephant],
  ['lion_cub', LionCub]
];

const args = process.argv.slice(2);
const compact = args.includes('--compact');
const filter = args.find((a) => !a.startsWith('--'));
const W = compact ? 68 : 76;
const H = compact ? 26 : 34;

const RAMP = ' .:-=+*#%@';

/** Rasterise a set of {positions, index, colors} into a [H][W] buffer. */
function rasterize(tris, project, w, h) {
  const depth = new Float32Array(w * h).fill(-Infinity);
  const col = new Array(w * h).fill(null);
  const acc = new Float32Array(w * h * 3);
  const cnt = new Float32Array(w * h);

  for (const t of tris) {
    const p = t.positions;
    const idx = t.index;
    const cols = t.colors;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3;
      const b = idx[i + 1] * 3;
      const c = idx[i + 2] * 3;
      const A = project(p[a], p[a + 1], p[a + 2]);
      const B = project(p[b], p[b + 1], p[b + 2]);
      const C = project(p[c], p[c + 1], p[c + 2]);
      const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      if (maxX < minX || maxY < minY) continue;
      const d = (A[2] + B[2] + C[2]) / 3;
      const area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(area) < 1e-9) continue;
      // 2x2 subsamples so thin ears and tails are not missed between cells.
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          let inside = false;
          for (let sy = 0; sy < 2 && !inside; sy++) {
            for (let sx = 0; sx < 2 && !inside; sx++) {
              const px = x + 0.25 + sx * 0.5;
              const py = y + 0.25 + sy * 0.5;
              const w0 = ((B[0] - A[0]) * (py - A[1]) - (px - A[0]) * (B[1] - A[1])) / area;
              const w1 = ((px - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (py - A[1])) / area;
              const w2 = 1 - w0 - w1;
              if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05) continue;
              inside = true;
            }
          }
          if (!inside) continue;
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((B[0] - A[0]) * (py - A[1]) - (px - A[0]) * (B[1] - A[1])) / area;
          const w1 = ((px - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (py - A[1])) / area;
          const w2 = 1 - w0 - w1;
          const o = y * w + x;
          if (d > depth[o]) depth[o] = d;
          cnt[o]++;
          if (cols) {
            acc[o * 3] += cols[a] * Math.max(0, w1);
            acc[o * 3 + 1] += cols[a + 1] * Math.max(0, w1);
            acc[o * 3 + 2] += cols[a + 2] * Math.max(0, w1);
            acc[o * 3] += cols[b] * Math.max(0, w2);
            acc[o * 3 + 1] += cols[b + 1] * Math.max(0, w2);
            acc[o * 3 + 2] += cols[b + 2] * Math.max(0, w2);
            acc[o * 3] += cols[c] * Math.max(0, w0);
            acc[o * 3 + 1] += cols[c + 1] * Math.max(0, w0);
            acc[o * 3 + 2] += cols[c + 2] * Math.max(0, w0);
          }
        }
      }
    }
  }
  const out = [];
  for (let y = 0; y < h; y++) {
    const row = { solid: '', color: '' };
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      if (cnt[o] === 0) {
        row.solid += ' ';
        row.color += ' ';
      } else {
        row.solid += '@';
        const r = acc[o * 3] / cnt[o];
        const g = acc[o * 3 + 1] / cnt[o];
        const b = acc[o * 3 + 2] / cnt[o];
        row.color += hueChar(r, g, b);
      }
    }
    out.push(row);
  }
  return out;
}

function hueChar(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const s = max <= 0 ? 0 : (max - min) / max;
  if (v < 0.12) return 'K'; // near-black
  if (s < 0.16) return v > 0.72 ? 'W' : 'G'; // white / grey
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h *= 60;
  if (h < 0) h += 360;
  if (h < 20 || h >= 330) return 'R';
  if (h < 45) return 'O';
  if (h < 70) return 'Y';
  if (h < 165) return 'g';
  if (h < 200) return 'C';
  if (h < 260) return 'B';
  return 'P';
}

function gather(meshes) {
  const tris = [];
  for (const m of meshes) {
    const geo = m.geometry;
    const pos = geo.attributes.position.array;
    const idx = geo.index ? geo.index.array : null;
    if (!idx) continue;
    const cols = geo.attributes.color ? geo.attributes.color.array : null;
    tris.push({ positions: pos, index: idx, colors: cols });
  }
  return tris;
}

function bounds(tris) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (let i = 0; i < t.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], t.positions[i + a]);
        hi[a] = Math.max(hi[a], t.positions[i + a]);
      }
    }
  }
  return { lo, hi };
}

for (const [id, Cls] of SPECIES) {
  if (filter && id !== filter) continue;
  const scene = new THREE.Scene();
  const animal = new Cls(scene, {});
  const tris = gather(animal.meshes);
  const { lo, hi } = bounds(tris);
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const ctr = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];

  const views = {
    side: (x, y, z) => [((z - ctr[2]) / size[2]) * (W * 0.5) + W / 2, (1 - (y - lo[1]) / size[1]) * (H - 1), x],
    front: (x, y, z) => [((x - ctr[0]) / Math.max(size[0], size[1])) * (W * 0.5) + W / 2, (1 - (y - lo[1]) / size[1]) * (H - 1), z],
    top: (x, y, z) => [((z - ctr[2]) / size[2]) * (W * 0.5) + W / 2, ((x - lo[0]) / size[0]) * (H - 1), y]
  };

  console.log(`\n===== ${id}  (${animal.name}) =====`);
  console.log(
    `bounds  X ${lo[0].toFixed(2)}..${hi[0].toFixed(2)} (w ${size[0].toFixed(2)})  ` +
    `Y ${lo[1].toFixed(2)}..${hi[1].toFixed(2)} (h ${size[1].toFixed(2)})  ` +
    `Z ${lo[2].toFixed(2)}..${hi[2].toFixed(2)} (l ${size[2].toFixed(2)})`
  );
  for (const name of compact ? ['side'] : ['side', 'front', 'top']) {
    const grid = rasterize(tris, views[name], W, H);
    console.log(`\n-- ${name} --`);
    for (const row of grid) console.log(row.solid);
  }
  if (compact) { animal.dispose(); continue; }
  // one colour map, side view, coarse
  console.log('-- side colour (R/O/Y/g/C/B/P/W/G/K) --');
  const cgrid = rasterize(tris, views.side, W, H);
  for (const row of cgrid) console.log(row.color);

  animal.dispose();
}

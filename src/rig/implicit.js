/**
 * implicit.js
 * A small implicit-surface modeller used to sculpt every animal as ONE
 * continuous skin instead of a pile of intersecting primitives.
 *
 * You describe the character with signed-distance primitives (ellipsoids,
 * tapered capsules, chains), a smooth-minimum union melts them together, and
 * the surface is polygonised with three's MarchingCubes. Because the body,
 * neck, head, ears, legs and tail are all part of a single field, they blend
 * into each other the way a sculpted/scanned character does - no gaps, no
 * visible seams, no "spheres stuck on spheres".
 *
 * Per-vertex colours are baked from the same primitives, so markings (belly,
 * face masks, socks, tail rings) are painted smoothly onto the skin rather
 * than needing separate meshes.
 *
 * Coordinates are CHARACTER SPACE: Y up, +Z forward, origin on the ground
 * between the feet - identical to the skeleton, so vertices can be skinned
 * directly against the bones.
 */

import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

const _v = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * Signed volume of a triangle soup (6V = Σ v0 · (v1 × v2)). Positive when the
 * triangles are wound counter-clockwise seen from outside a closed shell.
 */
function signedVolume(positions, index) {
  let vol = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return vol / 6;
}

/** Polynomial smooth minimum - the heart of metaball blending. */
function smin(a, b, k) {
  if (k <= 1e-6) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

/** Smooth max, for carving (mouths, eye sockets, undercuts). */
function smax(a, b, k) {
  if (k <= 1e-6) return Math.max(a, b);
  const h = Math.max(0, Math.min(1, 0.5 - (0.5 * (b - a)) / k));
  return b + (a - b) * h + k * h * (1 - h);
}

/** Approximate ellipsoid distance (good enough for sculpting). */
function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  const dz = (pz - cz) / rz;
  const k0 = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const k1 = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1.0)) / k1;
}

/** Tapered capsule between two points. */function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const len2 = bax * bax + bay * bay + baz * baz;
  let h = 0;
  if (len2 > 1e-12) h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / len2));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  const r = ra + (rb - ra) * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/**
 * A sculptable character body.
 *
 * Every primitive can carry:
 *   color   - THREE.Color for the skin (markings are painted this way)
 *   blend   - how strongly it melts into neighbours (0..1, default shared)
 *   paint   - 0 disables colour painting (structural filler)
 *   sharp   - colour falloff exponent (higher = crisper markings)
 *   bones   - bone whitelist used to skin the vertices this primitive owns
 *   rot     - optional [x,y,z] euler (radians) for rotated ellipsoids
 *   carve   - true to subtract instead of add (mouths, eye sockets)
 */
export class ImplicitSurface {
  constructor(options = {}) {
    this.resolution = options.resolution ?? 56;
    this.blend = options.blend ?? 0.06;
    this.primitives = [];

    // Bounds are computed from the primitives unless given explicitly.
    this.bounds = options.bounds || null;
    this.padding = options.padding ?? 0.06;

    /**
     * Taubin (λ/μ) smoothing passes over the polygonised surface. Marching
     * cubes can only place a vertex on a grid edge, so a curved cheek comes
     * out very slightly stair-stepped; two smoothing passes remove it without
     * the volume loss a plain Laplacian filter would cause.
     */
    this.smooth = options.smooth ?? 2;
  }

  /** Rotated ellipsoid. radiusX/Y/Z are full half-extents. */
  ellipsoid(center, radius, opts = {}) {
    return this.#push({
      kind: 'ellipsoid',
      center: new THREE.Vector3().fromArray(center),
      radius: new THREE.Vector3().fromArray(radius),
      rot: opts.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rot[0], opts.rot[1], opts.rot[2])) : null,
      ...this.#style(opts)
    });
  }

  /** Tapered capsule from a to b. */
  capsule(a, b, ra, rb = ra, opts = {}) {
    return this.#push({
      kind: 'capsule',
      a: new THREE.Vector3().fromArray(a),
      b: new THREE.Vector3().fromArray(b),
      ra,
      rb,
      ...this.#style(opts)
    });
  }

  /** A smooth tube through a polyline: the workhorse for limbs, necks, tails. */
  chain(points, radii, opts = {}) {
    const pts = points.map((p) => new THREE.Vector3().fromArray(p));
    const rs = Array.isArray(radii) ? radii : new Array(pts.length).fill(radii);
    for (let i = 0; i < pts.length - 1; i++) {
      this.capsule(pts[i].toArray(), pts[i + 1].toArray(), rs[i], rs[i + 1], opts);
    }
    return this;
  }

  #style(opts) {
    return {
      blend: opts.blend ?? null,
      color: opts.color ? new THREE.Color(opts.color) : null,
      paint: opts.paint ?? 1,
      paintOnly: !!opts.paintOnly,
      sharp: opts.sharp ?? 2.4,
      bones: opts.bones || null,
      carve: !!opts.carve
    };
  }

  #push(prim) {
    this.primitives.push(prim);
    return this;
  }

  /**
   * Re-evaluate every coloured primitive at each final vertex. This replaces
   * the interpolated voxel palette with per-vertex markings, which is what
   * keeps a belly panel on the belly instead of climbing the flanks.
   */
  #paintVertices(positions) {
    const n = positions.length / 3;
    const out = new Float32Array(n * 3);
    const paints = this.primitives.filter((p) => p.color && p.paint > 0);
    if (!paints.length) {
      out.fill(0.82);
      return out;
    }
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      let r = 0;
      let g = 0;
      let b = 0;
      let wSum = 0;
      for (let k = 0; k < paints.length; k++) {
        const p = paints[k];
        const d = Math.abs(this.#primitiveDistance(p, x, y, z));
        // The tight epsilon makes a primitive dominate only where the skin
        // actually lies on its surface; the sharpness decides edge softness.
        const w = p.paint / Math.pow(d + 0.012, p.sharp);
        r += p.color.r * w;
        g += p.color.g * w;
        b += p.color.b * w;
        wSum += w;
      }
      if (wSum > 0) {
        out[i * 3] = r / wSum;
        out[i * 3 + 1] = g / wSum;
        out[i * 3 + 2] = b / wSum;
      } else {
        out[i * 3] = 0.82;
        out[i * 3 + 1] = 0.82;
        out[i * 3 + 2] = 0.86;
      }
    }
    return out;
  }

  /**
   * Split vertices that sit on a topological pinch (an edge shared by more
   * than two faces). One copy of the vertex is kept per surface fan that
   * touches it, which separates the two sheets locally and makes the mesh
   * strictly manifold. Pinches are rare (a handful per model) and come from
   * ambiguous marching-cubes cells, not from the primitives.
   */
  #splitPinches(positions, colors, index) {
    const n = positions.length / 3;
    const faceCount = index.length / 3;
    if (faceCount === 0) return { positions, colors, index };
    const key = (x, y) => (x < y ? x * n + y : y * n + x);

    const edgeFaces = new Map();
    const vFaces = new Map();
    for (let f = 0; f < faceCount; f++) {
      const tri = [index[f * 3], index[f * 3 + 1], index[f * 3 + 2]];
      for (let k = 0; k < 3; k++) {
        const kk = key(tri[k], tri[(k + 1) % 3]);
        let arr = edgeFaces.get(kk);
        if (!arr) edgeFaces.set(kk, (arr = []));
        arr.push(f);
        let vf = vFaces.get(tri[k]);
        if (!vf) vFaces.set(tri[k], (vf = []));
        vf.push(f);
      }
    }

    const bad = new Map();
    for (const [kk, faces] of edgeFaces) {
      if (faces.length <= 2) continue;
      const x = Math.floor(kk / n);
      const y = kk % n;
      for (const v of [x, y]) {
        let s = bad.get(v);
        if (!s) bad.set(v, (s = new Set()));
        s.add(kk);
      }
    }
    if (!bad.size) return { positions, colors, index };

    const outPos = positions.slice();
    const outCol = colors.slice();
    const outIdx = index.slice();

    for (const v of bad.keys()) {
      const faces = vFaces.get(v) || [];
      if (faces.length < 3) continue;

      const nbrs = new Map();
      for (const f of faces) {
        const tri = [index[f * 3], index[f * 3 + 1], index[f * 3 + 2]].filter((x) => x !== v);
        nbrs.set(f, tri);
      }

      const parent = new Map();
      const find = (x) => {
        while (parent.get(x) !== x) {
          parent.set(x, parent.get(parent.get(x)));
          x = parent.get(x);
        }
        return x;
      };
      for (const f of faces) parent.set(f, f);
      const byNbr = new Map();
      for (const f of faces) {
        for (const w of nbrs.get(f)) {
          if (!byNbr.has(w)) byNbr.set(w, []);
          byNbr.get(w).push(f);
        }
      }
      for (const arr of byNbr.values()) {
        for (let i = 1; i < arr.length; i++) {
          const ra = find(arr[0]);
          const rb = find(arr[i]);
          if (ra !== rb) parent.set(rb, ra);
        }
      }

      const groups = new Map();
      for (const f of faces) {
        const r = find(f);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(f);
      }
      if (groups.size <= 1) continue;

      let first = true;
      for (const g of groups.values()) {
        if (first) {
          first = false;
          continue;
        }
        const nv = outPos.length / 3;
        outPos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        outCol.push(colors[v * 3], colors[v * 3 + 1], colors[v * 3 + 2]);
        for (const f of g) {
          for (let k = 0; k < 3; k++) if (outIdx[f * 3 + k] === v) outIdx[f * 3 + k] = nv;
        }
      }
    }

    return {
      positions: new Float32Array(outPos),
      colors: new Float32Array(outCol),
      index: new Uint32Array(outIdx)
    };
  }

  /**
   * Taubin λ/μ smoothing over an indexed mesh. Alternating a positive and a
   * slightly larger negative Laplacian step removes the marching-cubes
   * stair-stepping while keeping the silhouette's volume (a plain Laplacian
   * pass would slowly deflate the belly, cheeks and ears).
   */
  #taubinSmooth(positions, index, iterations, lambda = 0.55, mu = -0.58) {
    const n = positions.length / 3;
    if (n === 0) return;

    // CSR adjacency: each triangle connects its three vertices pairwise.
    const degree = new Uint32Array(n);
    for (let t = 0; t < index.length; t += 3) {
      degree[index[t]] += 2;
      degree[index[t + 1]] += 2;
      degree[index[t + 2]] += 2;
    }
    const start = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) start[i + 1] = start[i] + degree[i];
    const fill = new Uint32Array(n);
    const neighbours = new Uint32Array(start[n]);
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t];
      const b = index[t + 1];
      const c = index[t + 2];
      neighbours[start[a] + fill[a]++] = b;
      neighbours[start[a] + fill[a]++] = c;
      neighbours[start[b] + fill[b]++] = a;
      neighbours[start[b] + fill[b]++] = c;
      neighbours[start[c] + fill[c]++] = a;
      neighbours[start[c] + fill[c]++] = b;
    }

    const tmp = new Float32Array(positions.length);
    const step = (src, dst, factor) => {
      for (let v = 0; v < n; v++) {
        const s = start[v];
        const e = start[v + 1];
        const count = e - s;
        if (count === 0) {
          dst[v * 3] = src[v * 3];
          dst[v * 3 + 1] = src[v * 3 + 1];
          dst[v * 3 + 2] = src[v * 3 + 2];
          continue;
        }
        let ax = 0;
        let ay = 0;
        let az = 0;
        for (let k = s; k < e; k++) {
          const o = neighbours[k] * 3;
          ax += src[o];
          ay += src[o + 1];
          az += src[o + 2];
        }
        const x = src[v * 3];
        const y = src[v * 3 + 1];
        const z = src[v * 3 + 2];
        dst[v * 3] = x + factor * (ax / count - x);
        dst[v * 3 + 1] = y + factor * (ay / count - y);
        dst[v * 3 + 2] = z + factor * (az / count - z);
      }
    };

    for (let it = 0; it < iterations; it++) {
      step(positions, tmp, lambda);
      step(tmp, positions, mu);
    }
  }

  #computeBounds() {
    if (this.bounds) {
      return {
        min: new THREE.Vector3().fromArray(this.bounds.min),
        max: new THREE.Vector3().fromArray(this.bounds.max)
      };
    }
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const expand = (p, r) => {
      min.min(new THREE.Vector3(p.x - r, p.y - r, p.z - r));
      max.max(new THREE.Vector3(p.x + r, p.y + r, p.z + r));
    };
    for (const p of this.primitives) {
      if (p.paintOnly) continue;
      if (p.kind === 'ellipsoid') {
        // Rotated ellipsoids: use the largest extent as a safe radius.
        const r = Math.max(p.radius.x, p.radius.y, p.radius.z);
        expand(p.center, r * (p.rot ? 1.42 : 1));
      } else {
        expand(p.a, p.ra);
        expand(p.b, p.rb);
      }
    }
    const pad = new THREE.Vector3(this.padding, this.padding, this.padding);
    return { min: min.sub(pad), max: max.add(pad) };
  }

  /** Full signed distance to the union (used for normals + queries). */
  sampleSDF(x, y, z) {
    let d = 1e5;
    for (const p of this.primitives) {
      if (p.paintOnly) continue;
      const pd = this.#primitiveDistance(p, x, y, z);
      if (p.carve) d = smax(d, -pd, p.blend ?? this.blend);
      else d = smin(d, pd, p.blend ?? this.blend);
    }
    return d;
  }

  #primitiveDistance(p, x, y, z) {
    if (p.kind === 'ellipsoid') {
      if (p.rot) {
        _v.set(x - p.center.x, y - p.center.y, z - p.center.z).applyQuaternion(p.rot.clone().invert());
        return sdEllipsoid(_v.x, _v.y, _v.z, 0, 0, 0, p.radius.x, p.radius.y, p.radius.z);
      }
      return sdEllipsoid(x, y, z, p.center.x, p.center.y, p.center.z, p.radius.x, p.radius.y, p.radius.z);
    }
    return sdCapsule(x, y, z, p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z, p.ra, p.rb);
  }

  /** Nearest primitive (for per-vertex bone selection + dominant colour). */
  nearestPrimitive(x, y, z) {
    let best = -1;
    let bestAbs = Infinity;
    for (let i = 0; i < this.primitives.length; i++) {
      const p = this.primitives[i];
      if (p.paintOnly) continue;
      if (p.paint <= 0 && !p.bones) continue;
      const d = Math.abs(this.#primitiveDistance(p, x, y, z));
      if (d < bestAbs) {
        bestAbs = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Sculpt and polygonise.
   * @returns {{geometry:THREE.BufferGeometry, colors:Float32Array, boneLists:Array<string[]|null>, bounds:object, stats:object, mesh:THREE.Mesh}}
   */
  build() {
    const { min, max } = this.#computeBounds();
    const size = new THREE.Vector3().subVectors(max, min);
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const half = size.clone().multiplyScalar(0.5);
    const resolution = this.resolution;

    // MarchingCubes needs a material (it only reads `flatShading` from it).
    const mc = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, true, 600000);
    // Our field is a true SDF (inside is negative). The iso-level is nudged a
    // few percent of a voxel off zero: a surface passing exactly through a
    // lattice vertex is the one case where marching cubes can resolve a cell
    // ambiguously and leave a non-manifold pinch. The shift is far below the
    // voxel size, so it cannot change the silhouette.
    const voxelSize = Math.max(size.x, size.y, size.z) / resolution;
    mc.isolation = voxelSize * 0.04;

    const n3 = mc.size3;
    const field = mc.field;
    const palette = mc.palette;
    const kField = new Float32Array(n3);
    const colorSum = new Float32Array(n3 * 3);
    const colorW = new Float32Array(n3);

    for (let i = 0; i < n3; i++) {
      field[i] = 1e5;
      kField[i] = this.blend;
    }

    const halfSize = mc.halfsize;
    // grid index <-> character space (getComponent takes a numeric axis)
    const toIndex = (charVal, axis) =>
      ((charVal - min.getComponent(axis)) / size.getComponent(axis)) * resolution;

    for (const prim of this.primitives) {
      if (prim.paintOnly) continue;
      // --- primitive AABB in character space, padded by the blend radius ---
      const pad = (prim.blend ?? this.blend) + 0.02;
      const lo = new THREE.Vector3();
      const hi = new THREE.Vector3();
      if (prim.kind === 'ellipsoid') {
        const r = Math.max(prim.radius.x, prim.radius.y, prim.radius.z) * (prim.rot ? 1.42 : 1) + pad;
        lo.copy(prim.center).subScalar(r);
        hi.copy(prim.center).addScalar(r);
      } else {
        lo.min(prim.a).min(prim.b).subScalar(Math.max(prim.ra, prim.rb) + pad);
        hi.max(prim.a).max(prim.b).addScalar(Math.max(prim.ra, prim.rb) + pad);
      }

      const x0 = Math.max(1, Math.floor(toIndex(lo.x, 0)));
      const x1 = Math.min(resolution - 2, Math.ceil(toIndex(hi.x, 0)));
      const y0 = Math.max(1, Math.floor(toIndex(lo.y, 1)));
      const y1 = Math.min(resolution - 2, Math.ceil(toIndex(hi.y, 1)));
      const z0 = Math.max(1, Math.floor(toIndex(lo.z, 2)));
      const z1 = Math.min(resolution - 2, Math.ceil(toIndex(hi.z, 2)));
      const k = prim.blend ?? this.blend;

      for (let z = z0; z <= z1; z++) {
        const cz = min.z + (z / resolution) * size.z;
        const zOff = mc.size2 * z;
        for (let y = y0; y <= y1; y++) {
          const cy = min.y + (y / resolution) * size.y;
          const yOff = zOff + mc.size * y;
          for (let x = x0; x <= x1; x++) {
            const cx = min.x + (x / resolution) * size.x;
            const idx = yOff + x;
            const d = this.#primitiveDistance(prim, cx, cy, cz);

            if (prim.carve) {
              field[idx] = smax(field[idx], -d, k);
            } else {
              field[idx] = smin(field[idx], d, k);
            }

            if (prim.color && prim.paint > 0) {
              const w = prim.paint / Math.pow(Math.abs(d) + 0.014, prim.sharp);
              colorSum[idx * 3] += prim.color.r * w;
              colorSum[idx * 3 + 1] += prim.color.g * w;
              colorSum[idx * 3 + 2] += prim.color.b * w;
              colorW[idx] += w;
            }
          }
        }
      }
    }

    // Resolve the accumulated colours into the polygoniser's palette.
    for (let i = 0; i < n3; i++) {
      const w = colorW[i];
      if (w > 0) {
        palette[i * 3] = colorSum[i * 3] / w;
        palette[i * 3 + 1] = colorSum[i * 3 + 1] / w;
        palette[i * 3 + 2] = colorSum[i * 3 + 2] / w;
      } else {
        palette[i * 3] = 0.82;
        palette[i * 3 + 1] = 0.82;
        palette[i * 3 + 2] = 0.86;
      }
    }

    mc.update();

    // --- extract: normalised cube -> character space ---------------------
    const count = mc.count;
    const srcPos = mc.geometry.attributes.position.array;
    const srcCol = mc.geometry.attributes.color.array;

    const positions = new Float32Array(count * 3);
    const rawColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      for (let a = 0; a < 3; a++) {
        const n = srcPos[i * 3 + a];
        positions[i * 3 + a] = center.getComponent(a) + n * half.getComponent(a);
        rawColors[i * 3 + a] = srcCol[i * 3 + a];
      }
    }

    // --- weld shared vertices: the surface becomes an indexed mesh --------
    // Marching cubes emits three vertices per triangle, but neighbouring
    // triangles share their edge vertices exactly, so a quantised position key
    // collapses them and shrinks the mesh roughly three-fold.
    const weldTolerance = (Math.max(size.x, size.y, size.z) / resolution) * 0.05;
    const map = new Map();
    const remap = new Int32Array(count);
    const outPos = [];
    const outCol = [];
    let unique = 0;
    for (let i = 0; i < count; i++) {
      const qx = Math.round(positions[i * 3] / weldTolerance);
      const qy = Math.round(positions[i * 3 + 1] / weldTolerance);
      const qz = Math.round(positions[i * 3 + 2] / weldTolerance);
      const key = `${qx},${qy},${qz}`;
      let index = map.get(key);
      if (index === undefined) {
        index = unique++;
        map.set(key, index);
        outPos.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        outCol.push(rawColors[i * 3], rawColors[i * 3 + 1], rawColors[i * 3 + 2]);
      }
      remap[i] = index;
    }

    const indices = new Uint32Array(count);
    let indexCount = 0;
    for (let i = 0; i < count; i += 3) {
      const a = remap[i];
      const b = remap[i + 1];
      const c = remap[i + 2];
      if (a === b || b === c || a === c) continue; // drop degenerate slivers
      indices[indexCount++] = a;
      indices[indexCount++] = b;
      indices[indexCount++] = c;
    }

    const geometry = new THREE.BufferGeometry();
    let finalPos = new Float32Array(outPos);
    let finalIndex = indices.slice(0, indexCount);
    let finalCol = outCol;

    // --- repair topological pinches --------------------------------------
    // Marching cubes occasionally resolves an ambiguous cell so that two
    // sheets touch along one edge. Splitting the shared vertex into one copy
    // per surface fan separates them and keeps the shell strictly manifold.
    const repaired = this.#splitPinches(finalPos, finalCol, finalIndex);
    finalPos = repaired.positions;
    finalCol = repaired.colors;
    finalIndex = repaired.index;
    const vertexCount = finalPos.length / 3;

    // --- consistent outward winding --------------------------------------
    // Some marching-cubes tables emit triangles wound inwards. That renders
    // acceptably with a double-sided material, but it makes every normal point
    // the wrong way and makes raycasts hit the FAR side of the body - which is
    // exactly how eyes and noses end up on the back of the head. The signed
    // volume of a closed shell is positive when the winding is outward.
    if (signedVolume(finalPos, finalIndex) < 0) {
      for (let i = 0; i < finalIndex.length; i += 3) {
        const t = finalIndex[i + 1];
        finalIndex[i + 1] = finalIndex[i + 2];
        finalIndex[i + 2] = t;
      }
    }

    // --- Taubin smoothing: fine, adjustable surface polish ----------------
    if (this.smooth > 0) {
      this.#taubinSmooth(finalPos, finalIndex, this.smooth);
    }

    // --- repaint on the final surface ------------------------------------
    // The voxel palette is interpolated from inside the volume, which makes
    // markings bleed up the flanks (a white belly panel used to paint half a
    // fox white). Re-evaluating the colour primitives at the actual vertices
    // gives crisp borders: a primitive only paints where its own surface
    // coincides with the skin.
    finalCol = this.#paintVertices(finalPos);

    // --- ground the model: the lowest vertex is the paw/hoof contact ------
    // (a sub-voxel nudge, so the skinned feet still line up with the bones)
    let minY = Infinity;
    for (let i = 0; i < vertexCount; i++) minY = Math.min(minY, finalPos[i * 3 + 1]);
    if (Number.isFinite(minY) && Math.abs(minY) > 0.003) {
      for (let i = 0; i < vertexCount; i++) finalPos[i * 3 + 1] -= minY;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
    geometry.setIndex(new THREE.BufferAttribute(finalIndex, 1));

    // Normals from the smoothed, welded surface: exact, smooth and free of
    // the faceting a per-triangle normal would show on the cheeks and brow.
    geometry.computeVertexNormals();

    const colors = new Float32Array(vertexCount * 3);
    const boneLists = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = finalCol[i * 3];
      colors[i * 3 + 1] = finalCol[i * 3 + 1];
      colors[i * 3 + 2] = finalCol[i * 3 + 2];
      const prim = this.nearestPrimitive(finalPos[i * 3], finalPos[i * 3 + 1], finalPos[i * 3 + 2]);
      boneLists[i] = prim >= 0 ? this.primitives[prim].bones : null;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const triangles = finalIndex.length / 3;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    return {
      geometry,
      colors,
      boneLists,
      bounds: { min, max },
      center,
      half,
      mesh,
      stats: {
        resolution,
        vertices: vertexCount,
        triangles,
        primitives: this.primitives.length,
        weldRatio: +(vertexCount / Math.max(1, count)).toFixed(2)
      }
    };
  }
}

/**
 * Snap a detail onto the sculpted skin: cast from outside towards `point` and
 * return the surface hit plus its normal, so eyes and noses sit IN the face
 * rather than floating next to it.
 */
export function snapToSurface(surfaceMesh, point, outwardDir, eyeRadius = 0.05) {
  const dir = new THREE.Vector3().fromArray(outwardDir).normalize();
  const origin = new THREE.Vector3().fromArray(point).addScaledVector(dir, 2.0);
  const ray = new THREE.Raycaster(origin, dir.clone().negate(), 0, 6);
  const hits = ray.intersectObject(surfaceMesh, false);
  if (!hits.length) return null;
  const hit = hits[0];
  const normal = hit.face ? hit.face.normal.clone() : dir.clone().negate();
  return {
    point: hit.point.clone(),
    normal,
    // Embed the detail slightly so it reads as part of the face.
    embedded: hit.point.clone().addScaledVector(normal, -eyeRadius * 0.14)
  };
}


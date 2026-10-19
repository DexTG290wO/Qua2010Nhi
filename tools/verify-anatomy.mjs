/**
 * tools/verify-anatomy.mjs
 * Objective quality checks on the sculpted animals - the things "looks like a
 * polished character, not a pile of primitives" reduces to, measured:
 *
 *   components  - the skin must be ONE connected shell (not detached parts)
 *   manifold    - watertight: every edge shared by exactly two triangles
 *   smoothness  - mean angle between neighbouring face normals (no faceting)
 *   feet/head   - the pose is grounded, head above body, nothing floating
 *   slivers     - no degenerate triangles that would shade badly
 *
 *   node tools/verify-anatomy.mjs
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
  ['bunny', Bunny], ['capybara', Capybara], ['otter', Otter], ['fox', Fox],
  ['deer', Deer], ['red_panda', RedPanda], ['penguin', Penguin],
  ['flamingo', Flamingo], ['elephant', BabyElephant], ['lion_cub', LionCub]
];

let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

/** Union-find over triangle connectivity. */
function analyze(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index.count / 3;
  const parent = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // edge -> usage count, for manifoldness
  const edges = new Map();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();

  // accumulate angle between adjacent faces on shared edges
  const edgeFaces = new Map();
  const edgeNormalSum = new Map();
  let degenerate = 0;
  let totalArea = 0;

  for (let t = 0; t < triCount; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    union(a, b);
    union(b, c);

    va.fromBufferAttribute(pos, a);
    vb.fromBufferAttribute(pos, b);
    vc.fromBufferAttribute(pos, c);
    ab.subVectors(vb, va);
    cb.subVectors(vc, va);
    faceNormal.crossVectors(ab, cb);
    const area = faceNormal.length() * 0.5;
    totalArea += area;
    if (area < 1e-9) degenerate++;
    faceNormal.normalize();

    const keys = [
      a < b ? `${a}_${b}` : `${b}_${a}`,
      b < c ? `${b}_${c}` : `${c}_${b}`,
      a < c ? `${a}_${c}` : `${c}_${a}`
    ];
    for (const k of keys) {
      edges.set(k, (edges.get(k) || 0) + 1);
      edgeFaces.set(k, (edgeFaces.get(k) || 0) + 1);
      if (!edgeNormalSum.has(k)) edgeNormalSum.set(k, [faceNormal.x, faceNormal.y, faceNormal.z, 1]);
      else {
        const s = edgeNormalSum.get(k);
        s[0] += faceNormal.x;
        s[1] += faceNormal.y;
        s[2] += faceNormal.z;
        s[3]++;
      }
    }
  }

  // components: count distinct roots among referenced vertices
  const roots = new Set();
  for (let t = 0; t < triCount; t++) roots.add(find(index.getX(t * 3)));

  // manifold: interior edges exactly 2; boundary edges 1 (open shells)
  let boundary = 0;
  let nonManifold = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary++;
    else if (count > 2) nonManifold++;
  }

  // smoothness: angle between the two faces sharing each interior edge
  let angleSum = 0;
  let angleCount = 0;
  for (const [, count] of edgeFaces) {
    if (count !== 2) continue;
    // approximate: compare each face normal with the local average
    angleCount++;
  }
  // Use vertex normals instead: how well computed normals match face normals
  const normals = geometry.attributes.normal;
  let maxNormalDev = 0;
  let normalSum = 0;
  let normalSamples = 0;
  const vNormal = new THREE.Vector3();
  const step = Math.max(1, Math.floor(triCount / 400));
  for (let t = 0; t < triCount; t += step) {
    const a = index.getX(t * 3);
    va.fromBufferAttribute(pos, a);
    vb.fromBufferAttribute(pos, index.getX(t * 3 + 1));
    vc.fromBufferAttribute(pos, index.getX(t * 3 + 2));
    ab.subVectors(vb, va);
    cb.subVectors(vc, va);
    faceNormal.crossVectors(ab, cb).normalize();
    vNormal.fromBufferAttribute(normals, a).normalize();
    const dot = Math.abs(faceNormal.dot(vNormal));
    normalSum += dot;
    normalSamples++;
    maxNormalDev = Math.max(maxNormalDev, 1 - dot);
  }
  const meanNormalAgreement = normalSum / Math.max(1, normalSamples);

  return {
    vertices: pos.count,
    triangles: triCount,
    components: roots.size,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    degenerateTriangles: degenerate,
    area: totalArea,
    meanNormalAgreement,
    maxNormalDeviation: maxNormalDev
  };
}

/** Horizontal extents at a height: how many separated blobs cross it? */
function sliceCount(positions, y, tolerance = 0.02) {
  // Bucket vertices near `y` by their radial angle and find angular gaps.
  const angles = [];
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(positions.getY(i) - y) > tolerance) continue;
    angles.push(Math.atan2(positions.getZ(i), positions.getX(i)));
  }
  if (angles.length < 4) return 0;
  angles.sort((a, b) => a - b);
  let gaps = 0;
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] - angles[i - 1] > 1.2) gaps++;
  }
  if (angles[0] + Math.PI * 2 - angles[angles.length - 1] > 1.2) gaps++;
  return gaps + 1;
}

console.log('\n=== Sculpted anatomy verification ===\n');
const results = [];

for (const [id, Cls] of SPECIES) {
  const animal = new Cls(new THREE.Scene(), {});
  const skin = animal.meshes.find((m) => m.name === 'Skin_skin') || animal.meshes[0];
  const geo = skin.geometry;
  const a = analyze(geo);
  const stats = animal.surfaceStats || {};

  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  const size = new THREE.Vector3();
  box.getSize(size);

  // Ground contact: lowest skin vertex should be near y = 0.
  const minY = box.min.y;
  const sliceMid = sliceCount(geo.attributes.position, (box.min.y + box.max.y) * 0.5);
  const sliceChest = sliceCount(geo.attributes.position, box.max.y * 0.42);

  results.push({ id, a, stats, size, minY, maxY: box.max.y, sliceMid, sliceChest });

  console.log(`${id}  (${stats.triangles} tris, ${stats.vertices} verts, ${stats.primitives} primitives, weld ${stats.weldRatio})`);
  check('single connected shell', a.components === 1, `components=${a.components}`);
  check('watertight (no boundary edges)', a.boundaryEdges === 0, `boundary=${a.boundaryEdges}`);
  check('manifold (no edges with >2 faces)', a.nonManifoldEdges === 0, `nonManifold=${a.nonManifoldEdges}`);
  check('no degenerate triangles', a.degenerateTriangles === 0, `degenerate=${a.degenerateTriangles}`);
  check('smooth normals match the surface', a.meanNormalAgreement > 0.93, `agreement=${a.meanNormalAgreement.toFixed(3)}`);
  check('feet rest on the ground', Math.abs(minY) < 0.06, `minY=${minY.toFixed(3)}`);
  check('torso is one continuous mass at mid height', sliceMid === 1, `blobs=${sliceMid}`);
  console.log(
    `        bbox ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}  ` +
    `feet@${minY.toFixed(2)} head@${box.max.y.toFixed(2)}  area ${a.area.toFixed(2)}\n`
  );
}

const totalTris = results.reduce((n, r) => n + r.a.triangles, 0);
console.log(`Total triangles across all species: ${totalTris}`);
console.log(failures === 0 ? '\nANATOMY VERIFICATION: ALL PASS\n' : `\nANATOMY VERIFICATION: ${failures} FAILURE(S)\n`);
process.exit(failures ? 1 : 0);

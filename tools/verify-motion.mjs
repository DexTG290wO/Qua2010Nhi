/**
 * tools/verify-motion.mjs
 * Per-clip ground-contact proof. For every species and every animation clip it
 * samples the real skinned vertices (through the bone matrices, exactly as the
 * renderer does) and reports the lowest point reached in character space,
 * where y = 0 is the ground the animal stands on.
 *
 *   node tools/verify-motion.mjs [species]
 *
 * A clip that drives a foot through the floor shows up here as a large
 * negative clearance. The default walk/run/idle clips should stay within a
 * couple of centimetres; the hop is allowed to launch and land but never to
 * sink.
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

const filter = process.argv[2];
const SAMPLES = 60;
const VERTEX_BUDGET = 320;

const local = new THREE.Vector3();

/**
 * Lowest skinned point in character space (y = 0 is the ground), reported
 * twice: over every vertex, and over only the ground-contact vertices (the
 * paws / hooves / feet, i.e. those near y = 0 in the rest pose).
 */
function probeVertices(animal) {
  const all = [];
  const contact = [];
  const contactY = 0.06;
  for (const mesh of animal.meshes) {
    if (!mesh.isSkinnedMesh) continue;
    const pos = mesh.geometry.attributes.position;
    const isContact = [];
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= contactY) isContact.push(i);
    }
    const cStride = Math.max(1, Math.floor(isContact.length / 500));
    for (let k = 0; k < isContact.length; k += cStride) contact.push([mesh, isContact[k]]);

    const stride = Math.max(1, Math.floor(pos.count / VERTEX_BUDGET));
    for (let i = 0; i < pos.count; i += stride) all.push([mesh, i]);
  }
  return { all, contact };
}

function lowestOf(probes) {
  let lo = Infinity;
  let where = null;
  for (const [mesh, i] of probes) {
    local.fromBufferAttribute(mesh.geometry.attributes.position, i);
    mesh.applyBoneTransform(i, local);
    mesh.localToWorld(local);
    if (local.y < lo) {
      lo = local.y;
      where = {
        mesh: mesh.name.replace('Skin_', ''),
        rest: [
          +mesh.geometry.attributes.position.getX(i).toFixed(3),
          +mesh.geometry.attributes.position.getY(i).toFixed(3),
          +mesh.geometry.attributes.position.getZ(i).toFixed(3)
        ]
      };
    }
  }
  return { lo, where };
}

function extent(animal) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of animal.meshes) {
    const box = mesh.geometry.boundingBox || (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
    minY = Math.min(minY, box.min.y);
    maxY = Math.max(maxY, box.max.y);
  }
  return maxY - minY;
}

let failures = 0;
console.log('\n=== Per-clip ground contact (character space, y=0 is the ground) ===\n');

for (const [id, Cls] of SPECIES) {
  if (filter && id !== filter) continue;
  const animal = new Cls(new THREE.Scene(), {});
  animal.group.position.set(0, 0, 0);
  animal.group.rotation.set(0, 0, 0);
  const mixer = animal.mixer;
  const rows = [];
  const height = extent(animal);
  const tol = Math.max(0.012, height * 0.02);
  const probes = probeVertices(animal);

  for (const clip of animal.clipList) {
    const action = animal.actions.get(clip.name);
    if (!action) continue;
    mixer.stopAllAction();
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.play();

    let worstAny = { lo: Infinity, where: null };
    let worstAt = 0;
    let bestContact = Infinity;
    for (let s = 0; s < SAMPLES; s++) {
      const t = (clip.duration * s) / SAMPLES;
      mixer.setTime(t);
      animal.group.updateMatrixWorld(true);
      const a = lowestOf(probes.all);
      if (a.lo < worstAny.lo) {
        worstAny = a;
        worstAt = t;
      }
      bestContact = Math.min(bestContact, lowestOf(probes.contact).lo);
    }
    action.stop();
    rows.push({ name: clip.name, low: worstAny.lo, where: worstAny.where, at: worstAt, contact: bestContact, dur: clip.duration });
  }
  mixer.stopAllAction();

  const stuck = rows.filter((r) => r.low < -tol);
  const floats = rows.filter((r) => r.contact > tol && !(r.name === 'Sleep'));
  const bad = stuck.length + floats.length;
  if (bad) failures++;

  console.log(
    `${id}  (height ${height.toFixed(2)}, tol ${tol.toFixed(3)})` +
    `${bad ? '   <-- PROBLEM' : ''}`
  );
  for (const r of rows) {
    const sink = r.low < -tol ? '  SINKS' : '';
    const float = r.contact > tol && r.name !== 'Sleep' ? '  FLOATS' : '';
    const w = sink && r.where ? ` [${r.where.mesh} rest ${r.where.rest.join(',')}]` : '';
    console.log(
      `   ${r.name.padEnd(6)} sink ${r.low.toFixed(4)}  foot ${r.contact.toFixed(4)}  @t=${r.at.toFixed(2)}` +
      `${sink}${float}${w}`
    );
  }
  animal.dispose();
}

console.log(
  failures === 0
    ? '\nMOTION VERIFICATION: ALL PASS\n'
    : `\nMOTION VERIFICATION: ${failures} species penetrate the floor\n`
);
process.exit(failures ? 1 : 0);

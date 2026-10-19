/**
 * tools/build-models.mjs
 * Bakes the procedural rigs in src/ into real .glb files:
 * skinned meshes + skeletal animation clips, exported with GLTFExporter.
 *
 * These files are what the website streams in at runtime with GLTFLoader and
 * drives with AnimationMixer. They are generated from the same source of truth
 * as the runtime fallback rigs, so replacing one is as simple as dropping a
 * different .glb into public/models with the same name.
 *
 *   npm run build:models
 *
 * Node has no DOM, so a tiny canvas stub is installed first: the rig code only
 * touches 2D canvas for sprite decorations, which never end up in the export.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { exportGLB } from './gltf-node-shim.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'models');

// ---------------------------------------------------------------------------
//  Minimal DOM so the rig classes can be instantiated outside a browser.
// ---------------------------------------------------------------------------
function installDomShim() {
  if (globalThis.document) return;

  const gradient = { addColorStop() {} };
  const makeContext = (canvas) => ({
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    fillRect() {},
    clearRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    rect() {},
    roundRect() {},
    fill() {},
    stroke() {},
    fillText() {},
    strokeText() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData() {}
  });

  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        const canvas = {
          width: 1,
          height: 1,
          style: {},
          getContext: () => makeContext(canvas),
          toDataURL: () => 'data:,'
        };
        return canvas;
      }
      return {
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {},
        removeChild() {},
        addEventListener() {},
        setAttribute() {},
        querySelector: () => null,
        querySelectorAll: () => []
      };
    },
    createElementNS(_ns, tag) {
      return this.createElement(tag);
    },
    body: { appendChild() {}, style: {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };

  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.self = globalThis;
}

installDomShim();

// ---------------------------------------------------------------------------
//  Species
// ---------------------------------------------------------------------------
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

/** Pull just the skinned rig out of a constructed animal, ready to export. */
function extractRig(animal) {
  const root = new THREE.Group();
  root.name = animal.id;

  // Detach the bone hierarchy and the skinned meshes from the runtime group.
  const bones = animal.rootBone;
  root.add(bones);
  for (const mesh of animal.meshes) {
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  return root;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const exporter = new GLTFExporter();
  const loader = new GLTFLoader();
  const summary = [];
  const only = process.argv.slice(2);
  const list = only.length ? SPECIES.filter(([id]) => only.includes(id)) : SPECIES;

  for (const [id, Cls] of list) {
    const scene = new THREE.Scene();
    const animal = new Cls(scene, {});
    animal.group.updateMatrixWorld(true);

    const rig = extractRig(animal);
    const clips = animal.clipList || [];

    const buffer = await exportGLB(exporter, rig, {
      animations: clips,
      onlyVisible: false,
      truncateDrawRange: false
    });

    const file = path.join(OUT_DIR, `${id}.glb`);
    fs.writeFileSync(file, buffer);

    // --- verify the round trip immediately -----------------------------
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
    let skinned = 0;
    let bones = 0;
    let verts = 0;
    let tris = 0;
    gltf.scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        skinned++;
        const g = o.geometry;
        verts += g.attributes.position.count;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
      if (o.isBone) bones++;
    });
    const surf = animal.surfaceStats || {};
    summary.push({
      id,
      kb: (buffer.length / 1024).toFixed(0),
      skinnedMeshes: skinned,
      bones,
      clips: gltf.animations.length,
      clipNames: gltf.animations.map((c) => c.name).join(','),
      verts,
      tris: Math.round(tris),
      // welded ratio: 1.0 means every triangle owns its own vertices
      weld: tris > 0 ? +(verts / (tris * 3)).toFixed(2) : 0,
      gridTris: surf.triangles || 0
    });
  }

  console.log('\n=== Baked animal models ===');
  for (const s of summary) {
    console.log(
      `${s.id.padEnd(10)} ${String(s.kb).padStart(5)} KB  meshes:${String(s.skinnedMeshes).padStart(2)}  bones:${String(s.bones).padStart(2)}  clips:${String(s.clips).padStart(2)}  verts:${String(s.verts).padStart(6)}  tris:${String(s.tris).padStart(6)}  weld:${s.weld}`
    );
  }
  const total = summary.reduce((n, s) => n + Number(s.kb), 0);
  console.log(`Total: ${total} KB across ${summary.length} models -> public/models/\n`);

  const bad = summary.filter((s) => s.skinnedMeshes === 0 || s.bones === 0 || s.clips < 6);
  if (bad.length) {
    console.error('Models missing skinning or clips:', bad.map((b) => b.id).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Model baking failed:', err);
  process.exit(1);
});

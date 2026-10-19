/**
 * templates.js
 * Turns a compact species description into a full rig: a bone hierarchy, a list
 * of geometry parts (already skinned to those bones) and an animation profile
 * that ClipLibrary can drive.
 *
 * Character space convention: Y up, +Z forward, origin on the ground between
 * the feet. All bone rest rotations are identity, so animation deltas are read
 * as pitch (X), yaw (Y) and roll (Z) around the joint - predictable to author.
 */

import * as THREE from 'three';

/** Accumulates rest positions so geometry can be derived from the skeleton. */
class Layout {
  constructor() {
    this.pos = new Map();
  }
  add(name, parent, offset) {
    const base = parent ? this.pos.get(parent).clone() : new THREE.Vector3();
    const p = base.add(new THREE.Vector3(offset[0], offset[1], offset[2]));
    this.pos.set(name, p);
    return p;
  }
  get(name) {
    return this.pos.get(name).toArray();
  }
  v(name) {
    return this.pos.get(name).clone();
  }
}

function bone(name, parent, offset, tip = null) {
  return { name, parent, position: offset, rotation: [0, 0, 0], tip };
}

/**
 * Per-segment local offsets for a tail that leaves the rump heading backwards
 * and curves upward by `lift` (a fraction of the total tail length). The rise
 * accelerates along the tail (a quadratic arc), so a lifted tail sweeps up
 * behind the animal instead of standing straight up.
 */
function buildTailOffsets(bodyHeight, bodyLength, spec, lift) {
  const segs = spec.segs;
  if (!segs) return [];
  const back = spec.len;
  const baseY = bodyHeight * 0.15;
  const baseZ = -bodyLength * 0.05;
  const posOf = (k) => {
    const u = k / segs;
    return [0, baseY + lift * back * u * u, baseZ - back * 0.95 * u];
  };
  const offs = [];
  for (let i = 1; i <= segs; i++) {
    const p = posOf(i);
    const q = i === 1 ? [0, 0, 0] : posOf(i - 1);
    offs.push([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
  }
  return offs;
}

/**
 * Standard four-legged animal.
 *
 * @param {object} o
 * @param {number} o.bodyLength  hips -> chest distance
 * @param {number} o.bodyWidth   lateral half-width of the torso
 * @param {number} o.bodyHeight  vertical half-height of the torso
 * @param {number} o.legLength   hip height above the ground
 * @param {number} o.legRadius   leg thickness
 * @param {number} o.neckUp      vertical rise from chest to head
 * @param {number} o.neckFwd     forward reach from chest to head
 * @param {number} o.headSize    head radius
 * @param {string} o.earType     'long' | 'round' | 'pointed' | 'fluffy' | 'none'
 * @param {string} o.tailType    'bushy' | 'thin' | 'puff' | 'ringed' | 'flat' | 'none'
 * @param {string} o.muzzle      'short' | 'long' | 'broad' | 'snub'
 * @param {number} o.stance      half-distance between left and right legs
 * @param {number} o.bellyDrop   how far the belly hangs below the spine line
 */
export function quadrupedTemplate(o = {}) {
  const bodyLength = o.bodyLength ?? 0.86;
  const bodyWidth = o.bodyWidth ?? 0.3;
  const bodyHeight = o.bodyHeight ?? 0.32;
  const legLength = o.legLength ?? 0.62;
  const legRadius = o.legRadius ?? 0.075;
  const neckUp = o.neckUp ?? 0.2;
  const neckFwd = o.neckFwd ?? 0.18;
  const headSize = o.headSize ?? 0.24;
  const stance = o.stance ?? 0.17;
  const earType = o.earType ?? 'round';
  const tailType = o.tailType ?? 'bushy';
  const muzzle = o.muzzle ?? 'short';
  const bellyDrop = o.bellyDrop ?? 0.1;
  const hoofed = !!o.hoofed;
  const eyeSpread = o.eyeSpread ?? 0.36;
  const eyeHeight = o.eyeHeight ?? 0.12;
  const eyeForward = o.eyeForward ?? 0.62;

  const L = new Layout();
  const bodyY = legLength;

  // --- Spine chain ------------------------------------------------------
  L.add('root', null, [0, 0, 0]);
  L.add('hips', 'root', [0, bodyY, -bodyLength * 0.5]);
  L.add('spine1', 'hips', [0, 0.01, bodyLength * 0.34]);
  L.add('spine2', 'spine1', [0, 0.015, bodyLength * 0.34]);
  L.add('chest', 'spine2', [0, 0.02, bodyLength * 0.32]);
  L.add('neck', 'chest', [0, neckUp * 0.35, neckFwd * 0.35]);
  L.add('head', 'neck', [0, neckUp * 0.65, neckFwd * 0.65]);

  // --- Head accessories -------------------------------------------------
  const earSpread = headSize * (earType === 'long' ? 0.42 : 0.55);
  L.add('earL', 'head', [earSpread, headSize * 0.5, -headSize * 0.1]);
  L.add('earR', 'head', [-earSpread, headSize * 0.5, -headSize * 0.1]);
  L.add('eyeL', 'head', [headSize * eyeSpread, headSize * eyeHeight, headSize * eyeForward]);
  L.add('eyeR', 'head', [-headSize * eyeSpread, headSize * eyeHeight, headSize * eyeForward]);

  // --- Tail chain -------------------------------------------------------
  // `tailSegs` lets a species buy more bones for a long expressive tail
  // (a red panda's rings need segments; a fox brush needs a curve).
  let tailSpec = {
    bushy: { len: 0.5, segs: 3 },
    ringed: { len: 0.55, segs: 3 },
    thin: { len: 0.32, segs: 2 },
    puff: { len: 0.16, segs: 1 },
    plume: { len: 0.36, segs: 3 },
    rudder: { len: 0.5, segs: 3 },
    flat: { len: 0.2, segs: 1 },
    none: { len: 0, segs: 0 }
  }[tailType] || { len: 0.4, segs: 2 };
  if (o.tailSpec) tailSpec = { ...tailSpec, ...o.tailSpec };
  if (o.tailSegs) tailSpec.segs = o.tailSegs;
  if (o.tailLength) tailSpec.len = o.tailLength;

  // Tail as an ARC: it leaves the rump heading back, then curves upward by
  // `tailLift`. Laying the bones out as a straight vertical stack (the old
  // behaviour) turned a lifted tail into a flagpole; an arc reads as an
  // animal. The same offsets drive both the layout and the bones, so the
  // skin can never drift off the skeleton.
  const tailOffsets = buildTailOffsets(bodyHeight, bodyLength, tailSpec, o.tailLift ?? 0);
  const tailBones = [];
  {
    let parent = 'hips';
    for (let i = 0; i < tailSpec.segs; i++) {
      const name = `tail${i + 1}`;
      L.add(name, parent, tailOffsets[i]);
      tailBones.push(name);
      parent = name;
    }
  }

  // --- Legs -------------------------------------------------------------
  const shoulderY = bodyY + bodyHeight * 0.05;
  const chestY = L.v('chest').y;
  const hipsY = L.v('hips').y;
  const kneeDrop = legLength * 0.52;
  const ankleDrop = legLength * 0.44;
  const legZFront = L.v('chest').z + bodyLength * 0.06;
  const legZBack = L.v('hips').z - bodyLength * 0.06;
  const legDefs = [
    { key: 'FL', x: stance, z: legZFront, attach: 'chest', dy: shoulderY - chestY, bend: 1 },
    { key: 'FR', x: -stance, z: legZFront, attach: 'chest', dy: shoulderY - chestY, bend: 1 },
    { key: 'BL', x: stance, z: legZBack, attach: 'hips', dy: shoulderY - hipsY, bend: -1 },
    { key: 'BR', x: -stance, z: legZBack, attach: 'hips', dy: shoulderY - hipsY, bend: -1 }
  ];

  for (const d of legDefs) {
    const upper = `leg${d.key}`;
    const lower = `shin${d.key}`;
    const foot = `foot${d.key}`;
    L.add(upper, d.attach, [d.x, d.dy, d.z - L.v(d.attach).z]);
    L.add(lower, upper, [0, -kneeDrop, d.bend * legLength * 0.06]);
    L.add(foot, lower, [0, -ankleDrop, -d.bend * legLength * 0.03]);
  }

  // --- Bones ------------------------------------------------------------
  const bones = [
    bone('root', null, [0, 0, 0], [0, 0.3, 0]),
    bone('hips', 'root', [0, bodyY, -bodyLength * 0.5], [0, 0, -bodyLength * 0.5]),
    bone('spine1', 'hips', [0, 0.01, bodyLength * 0.34]),
    bone('spine2', 'spine1', [0, 0.015, bodyLength * 0.34]),
    bone('chest', 'spine2', [0, 0.02, bodyLength * 0.32], [0, neckUp * 0.6, neckFwd * 1.6]),
    bone('neck', 'chest', [0, neckUp * 0.35, neckFwd * 0.35]),
    bone('head', 'neck', [0, neckUp * 0.65, neckFwd * 0.65], [0, headSize * 0.5, headSize * 1.2]),
    bone('earL', 'head', [earSpread, headSize * 0.5, -headSize * 0.1], [0.05, headSize + (earType === 'long' ? 0.26 : 0.12), -headSize * 0.12]),
    bone('earR', 'head', [-earSpread, headSize * 0.5, -headSize * 0.1], [-0.05, headSize + (earType === 'long' ? 0.26 : 0.12), -headSize * 0.12]),
    bone('eyeL', 'head', [headSize * eyeSpread, headSize * eyeHeight, headSize * eyeForward], [0, -headSize * 0.25, headSize * 0.1]),
    bone('eyeR', 'head', [-headSize * eyeSpread, headSize * eyeHeight, headSize * eyeForward], [0, -headSize * 0.25, headSize * 0.1])
  ];

  let tailParent = 'hips';
  for (let i = 0; i < tailBones.length; i++) {
    const name = tailBones[i];
    const isLast = i === tailBones.length - 1;
    const off = tailOffsets[i];
    const prev = tailOffsets[i - 1] || [0, 0, 0];
    // The leaf tip continues in the direction of the last segment.
    const tip = isLast ? [0, off[1] - prev[1], off[2] - prev[2]] : null;
    bones.push(bone(name, tailParent, off, tip));
    tailParent = name;
  }

  for (const d of legDefs) {
    bones.push(bone(`leg${d.key}`, d.attach, [d.x, d.dy, d.z - L.v(d.attach).z]));
    bones.push(bone(`shin${d.key}`, `leg${d.key}`, [0, -kneeDrop, d.bend * legLength * 0.06]));
    bones.push(
      bone(`foot${d.key}`, `shin${d.key}`, [0, -ankleDrop, -d.bend * legLength * 0.03], [
        0,
        -legRadius * 0.4,
        legRadius * 3.2
      ])
    );
  }

  return {
    bones,
    joints: L,
    dims: { bodyLength, bodyWidth, bodyHeight, legLength, legRadius, headSize, neckUp, neckFwd, bellyDrop, stance, shoulderY, kneeDrop, ankleDrop, eyeSpread, eyeHeight, eyeForward },
    earType,
    tailType,
    tailBones,
    hoofed,
    muzzle,
    legDefs,
    headScale: o.headScale ?? [1, 1, 1],
    profileBase: {
      gait: o.gait ?? 'trot',
      runGait: o.runGait ?? 'trot'
    }
  };
}

/**
 * Assemble an animation profile for ClipLibrary from a template.
 * @param {object} t template result
 * @param {object} amp amplitude overrides
 */
export function quadrupedProfile(t, amp = {}) {
  const d = t.dims;
  const legs = {};
  for (const leg of t.legDefs) {
    legs[leg.key] = {
      upper: `leg${leg.key}`,
      lower: `shin${leg.key}`,
      foot: `foot${leg.key}`,
      front: leg.key[0] === 'F',
      foldSign: leg.bend,
      splay: 0,
      // A touch of standing bend keeps legs from reading as stiff sticks.
      restBend: leg.key[0] === 'F' ? 0.16 : -0.2
    };
  }

  return {
    bones: {
      root: 'root',
      spine: ['hips', 'spine1', 'spine2', 'chest'],
      neck: 'neck',
      head: 'head',
      tail: t.tailBones,
      ears: ['earL', 'earR'],
      legs
    },
    gait: t.profileBase.gait,
    amp: {
      leg: 0.5,
      knee: 0.45,
      bob: 0.05,
      lift: 1,
      sway: 0.06,
      pitch: 0.1,
      neck: 0.2,
      head: 0.16,
      tail: 0.14,
      ear: 0.14,
      wing: 1,
      eatNeck: 0.95,
      sleepDrop: -(d.legLength * 0.62),
      hopHeight: d.legLength * 0.9,
      ...amp
    }
  };
}

// ---------------------------------------------------------------------------
//  BIRDS  (penguin, flamingo)
// ---------------------------------------------------------------------------

/**
 * Upright bird: two legs, a neck chain, optional folded wings and a beak.
 * @param {object} o
 * @param {number} o.standHeight  hip/leg length
 * @param {number} o.bodyRadius   torso radius
 * @param {number} o.bodyStretch  vertical stretch of the egg body
 * @param {number} o.neckSegs     neck chain length
 * @param {number} o.neckLen      total neck length
 * @param {number} o.headSize
 * @param {string} o.beak         'straight' | 'curved' | 'stubby'
 * @param {boolean} o.wings       build wing bones
 */
export function birdTemplate(o = {}) {
  const standHeight = o.standHeight ?? 0.5;
  const bodyRadius = o.bodyRadius ?? 0.26;
  const bodyStretch = o.bodyStretch ?? 1.5;
  const neckSegs = o.neckSegs ?? 2;
  const neckLen = o.neckLen ?? 0.42;
  const headSize = o.headSize ?? 0.14;
  const beak = o.beak ?? 'straight';
  const wings = o.wings !== false;
  const stance = o.stance ?? 0.11;

  const L = new Layout();
  L.add('root', null, [0, 0, 0]);
  L.add('hips', 'root', [0, standHeight * 0.82, 0]);

  const segLen = neckSegs > 0 ? neckLen / (neckSegs + 1) : 0;
  const neckCurve = o.neckCurve ?? 0; // shapes the S-curve of a wading bird
  let parent = 'hips';
  for (let i = 1; i <= neckSegs; i++) {
    L.add(`neck${i}`, parent, [0, segLen * (i === 1 ? 1.2 : 1), segLen * (neckCurve ? neckCurve * (1 - i / (neckSegs + 1)) * 2.4 : 0.16)]);
    parent = `neck${i}`;
  }
  L.add('head', parent, [0, segLen * 1.15, segLen * (neckCurve ? -neckCurve * 1.5 : 0.1)]);

  const chestPos = L.v(neckSegs > 0 ? 'neck1' : 'hips');
  L.add('wingL', chestPos.x === 0 ? 'hips' : 'hips', [bodyRadius * 0.85, bodyRadius * 1.1, 0]);
  L.add('wingR', 'hips', [-bodyRadius * 0.85, bodyRadius * 1.1, 0]);
  L.add('eyeL', 'head', [headSize * 0.5, headSize * 0.3, headSize * 0.62]);
  L.add('eyeR', 'head', [-headSize * 0.5, headSize * 0.3, headSize * 0.62]);
  L.add('beakBase', 'head', [0, 0, headSize * 0.8]);

  const legY = L.v('hips').y;
  const legDefs = [
    { key: 'FL', x: stance, z: 0, bend: 1 },
    { key: 'FR', x: -stance, z: 0, bend: -1 }
  ];
  for (const d of legDefs) {
    L.add(`leg${d.key}`, 'hips', [d.x, -legY * 0.4, 0]);
    L.add(`shin${d.key}`, `leg${d.key}`, [0, -legY * 0.32, 0]);
    L.add(`foot${d.key}`, `shin${d.key}`, [0, -legY * 0.28, standHeight * 0.06]);
  }

  const bones = [bone('root', null, [0, 0, 0], [0, 0.3, 0]), bone('hips', 'root', [0, standHeight * 0.82, 0], [0, bodyRadius * 1.6, 0])];
  parent = 'hips';
  for (let i = 1; i <= neckSegs; i++) {
    bones.push(bone(`neck${i}`, parent, [0, segLen * (i === 1 ? 1.2 : 1), segLen * (neckCurve ? neckCurve * (1 - i / (neckSegs + 1)) * 2.4 : 0.16)]));
    parent = `neck${i}`;
  }
  bones.push(bone('head', parent, [0, segLen * 1.15, segLen * (neckCurve ? -neckCurve * 1.5 : 0.1)], [0, headSize * 0.6, headSize * (beak === 'curved' ? 1.9 : 1.5)]));
  bones.push(bone('eyeL', 'head', [headSize * 0.5, headSize * 0.3, headSize * 0.62], [0, -headSize * 0.3, 0.05]));
  bones.push(bone('eyeR', 'head', [-headSize * 0.5, headSize * 0.3, headSize * 0.62], [0, -headSize * 0.3, 0.05]));
  bones.push(bone('beakBase', 'head', [0, 0, headSize * 0.8], [0, 0, headSize * 1.4]));
  if (wings) {
    bones.push(bone('wingL', 'hips', [bodyRadius * 0.85, bodyRadius * 1.1, 0], [bodyRadius * 0.4, -bodyRadius * 0.9, -bodyRadius * 0.3]));
    bones.push(bone('wingR', 'hips', [-bodyRadius * 0.85, bodyRadius * 1.1, 0], [-bodyRadius * 0.4, -bodyRadius * 0.9, -bodyRadius * 0.3]));
  }
  for (const d of legDefs) {
    bones.push(bone(`leg${d.key}`, 'hips', [d.x, -legY * 0.4, 0]));
    bones.push(bone(`shin${d.key}`, `leg${d.key}`, [0, -legY * 0.32, 0]));
    bones.push(bone(`foot${d.key}`, `shin${d.key}`, [0, -legY * 0.28, standHeight * 0.06], [0, -0.02, standHeight * 0.2]));
  }

  return {
    bones,
    joints: L,
    dims: {
      standHeight, bodyRadius, bodyStretch, neckSegs, neckLen, headSize, stance, segLen,
      legRadius: o.legRadius ?? bodyRadius * 0.2,
      footLength: o.footLength ?? 1.9,
      footWidth: o.footWidth ?? 1.5
    },
    beak,
    wings,
    legDefs,
    neckChain: neckSegs > 0 ? Array.from({ length: neckSegs }, (_, i) => `neck${i + 1}`) : [],
    profileBase: { gait: o.gait ?? 'waddle' }
  };
}

export function birdProfile(t, amp = {}) {
  const d = t.dims;
  const legs = {};
  for (const leg of t.legDefs) {
    legs[leg.key] = {
      upper: `leg${leg.key}`,
      lower: `shin${leg.key}`,
      foot: `foot${leg.key}`,
      front: true,
      foldSign: 1,
      splay: 0,
      restBend: 0.25
    };
  }
  return {
    bones: {
      root: 'root',
      spine: ['hips'],
      neck: t.neckChain.length ? t.neckChain[0] : 'head',
      neckChain: t.neckChain,
      head: 'head',
      tail: [],
      ears: [],
      wings: t.wings ? ['wingL', 'wingR'] : [],
      legs
    },
    gait: t.profileBase.gait,
    amp: {
      leg: 0.5,
      knee: 0.4,
      bob: 0.03,
      lift: 1,
      sway: 0.1,
      pitch: 0.06,
      neck: 0.24,
      head: 0.16,
      tail: 0,
      ear: 0,
      wing: 1,
      eatNeck: 0.8,
      sleepDrop: -d.standHeight * 0.5,
      hopHeight: d.standHeight * 0.35,
      ...amp
    }
  };
}


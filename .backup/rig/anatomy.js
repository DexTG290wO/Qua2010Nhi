/**
 * anatomy.js
 * Sculpts whole animals as single continuous implicit surfaces.
 *
 * Each species describes its anatomy as a set of overlapping distance
 * primitives placed ON ITS OWN SKELETON (see templates.js). A smooth-minimum
 * union melts them together and the surface is polygonised with marching
 * cubes, then Taubin-smoothed and grounded.
 *
 * The anatomy is authored in layers, each with its own blend radius, because
 * "cohesive" and "recognisable" pull in opposite directions:
 *
 *   - the TORSO chain melts with a wide blend so back, belly, shoulder and
 *     haunch read as one barrel;
 *   - the NECK tapers until it is clearly thinner than the skull, and the
 *     SKULL is built from a cranium + brow + jowls + jaw, so the head is a
 *     shaped head and not a ball on a tube;
 *   - EARS, MUZZLES, LEGS and TAILS use a tight blend, so they keep their
 *     own silhouette instead of dissolving into the body.
 *
 * Markings (belly panels, face masks, socks, fawn spots, tail rings) are
 * painted by the same primitives, so they are soft gradients in one material
 * instead of bolted-on geometry.
 */

import * as THREE from 'three';
import { ImplicitSurface, snapToSurface } from './implicit.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

function sideSign(side) {
  return side === 'L' ? 1 : -1;
}

/** Default colour set - every species overrides what it needs. */
function palette(c = {}) {
  return {
    base: 0xd9b18c,
    belly: 0xfff4e8,
    accent: 0xc79a74,
    mask: 0xfff4e8,
    sock: 0xd9b18c,
    paw: 0xd9b18c,
    tailTip: 0xfff4e8,
    nose: 0x6b4a3a,
    innerEar: 0xffc2d6,
    eye: 0x2a1b2e,
    hoof: 0x4a3830,
    ...c
  };
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Euler triple that rotates a +Y aligned shape onto `dir`. */
function alignEuler(dir) {
  _q.setFromUnitVectors(UP, _v.copy(dir).normalize());
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}

function boneTip(t, name) {
  const b = (t.bones || []).find((x) => x.name === name);
  return b && b.tip ? new THREE.Vector3().fromArray(b.tip) : null;
}

/* =========================================================================
 *  MAMMALS
 * ========================================================================= */

export function sculptMammal(t, cfg) {
  const C = palette(cfg.c);
  const dims = t.dims;
  const info = {};
  const blend = cfg.blend ?? Math.max(0.016, dims.headSize * 0.2);

  const surface = new ImplicitSurface({
    resolution: cfg.resolution ?? 76,
    blend,
    padding: blend * 2.6,
    smooth: cfg.smooth ?? 2
  });

  const torso = buildTorso(surface, t, cfg, C, blend);
  buildNeckHead(surface, t, cfg, C, blend, info, torso);
  buildEars(surface, t, cfg, C, blend);
  buildLegs(surface, t, cfg, C, blend, torso.lift);
  buildTrunk(surface, t, cfg, C, blend, info);
  buildTail(surface, t, cfg, C, blend);

  return {
    surface,
    palette: C,
    details: (ctx, materials) => buildMammalDetails(ctx, t, cfg, C, info, materials)
  };
}

// ---------------------------------------------------------------- torso ----

function buildTorso(surface, t, cfg, C, blend) {
  const dims = t.dims;
  const jn = (n) => t.joints.v(n);
  const bodyW = dims.bodyWidth * (cfg.bodyWidthScale ?? 1);
  const bodyH = dims.bodyHeight;
  const bodyL = dims.bodyLength;
  const spineBones = ['hips', 'spine1', 'spine2', 'chest'];
  const chest = jn('chest');
  const hips = jn('hips');

  // Lift the whole barrel until the belly clears the paws, so short-legged
  // species (capybara, otter, rabbit) still show real legs.
  const minBelly = Math.max(dims.legRadius * 1.35, dims.legLength * (cfg.legClearance ?? 0.3));
  const spineY = (chest.y + hips.y) * 0.5;
  const lift = Math.max(0, minBelly - (spineY - bodyH));

  // Width/height profile along the spine: narrower waist, heavier haunches.
  const profile = [
    { bone: 'hips', sx: 1.0 + (cfg.rumpScale ?? 0.05), sy: 1.0, sz: 0.34, lift: 0.86 },
    { bone: 'spine1', sx: 1.02, sy: 1.0, sz: 0.36, lift: 0.92 },
    { bone: 'spine2', sx: 0.98, sy: 0.97, sz: 0.33, lift: 0.95 },
    { bone: 'chest', sx: 0.9, sy: 0.9, sz: 0.3, lift: 1.0 }
  ];
  for (const p of profile) {
    const centre = jn(p.bone);
    surface.ellipsoid(
      [centre.x, centre.y + lift + (p.dy ?? 0), centre.z],
      [bodyW * p.sx, bodyH * p.sy, bodyL * p.sz],
      { color: C.base, bones: spineBones, blend: blend * 2.3 }
    );
  }

  // Shoulder and haunch masses: they give the legs something to grow out of.
  const shoulderMass = cfg.shoulderMass ?? 0.62;
  const haunchMass = 1 + (cfg.rumpScale ?? 0.05) * 0.8;
  surface.ellipsoid(
    [chest.x, chest.y + lift + bodyH * 0.02, chest.z + bodyL * 0.04],
    [bodyW * shoulderMass * 0.92, bodyH * 0.88, bodyL * 0.24],
    { color: C.base, bones: ['spine2', 'chest', 'neck'], blend: blend * 2.1 }
  );
  surface.ellipsoid(
    [hips.x, hips.y + lift + bodyH * 0.04, hips.z - bodyL * 0.06],
    [bodyW * 0.94 * haunchMass, bodyH * 0.94, bodyL * 0.24],
    { color: C.base, bones: ['hips', 'spine1'], blend: blend * 2.1 }
  );

  // Belly: a soft underside that never reaches the ground. It also paints
  // the pale panel, which is what gives every species its two-tone read.
  const bellyBottom = Math.max(spineY - bodyH + lift, minBelly * 0.94);
  const bellyRadiusY = Math.max(bodyH * 0.3, (spineY + lift + bodyH * (cfg.bellyRound ?? 0.16) * 0.5 - bellyBottom) * 0.9);
  const bellyCentreY = bellyBottom + bellyRadiusY;
  const midZ = (jn('spine1').z + jn('spine2').z) * 0.5;
  surface.ellipsoid(
    [0, bellyCentreY, midZ],
    [bodyW * 0.88, bellyRadiusY, bodyL * 0.46],
    { color: C.belly, bones: spineBones, sharp: cfg.bellySharp ?? 2.0 }
  );

  // Chest brisket: the pale front the species file can tint.
  surface.ellipsoid(
    [0, chest.y + lift - bodyH * (0.18 + (cfg.chestDrop ?? 0)) + bodyH * 0.3, chest.z + bodyL * 0.13],
    [bodyW * 0.58, bodyH * 0.6, bodyL * 0.18],
    { color: cfg.chestColor ? C[cfg.chestColor] : C.base, bones: ['spine2', 'chest', 'neck'], sharp: 1.9 }
  );

  // Fawn spots: small painted domes along the spine.
  if (cfg.spots) {
    const spots = cfg.spots;
    const spineNames = ['spine1', 'spine2', 'chest', 'hips'];
    let n = 0;
    for (const name of spineNames) {
      const p = t.joints.v(name);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const s = spots.size ?? 0.16;
          surface.ellipsoid(
            [
              p.x + side * bodyW * (0.52 + k * 0.12),
              p.y + lift + bodyH * (0.66 - k * 0.34),
              p.z + (k === 0 ? -bodyH * 0.12 : bodyH * 0.14)
            ],
            [bodyW * s, bodyH * s * 0.4, bodyL * s * 0.42],
            { color: C[spots.color ?? 'belly'], bones: spineBones, sharp: spots.sharp ?? 5, blend: blend * 0.3 }
          );
          n++;
          if (spots.count && n >= spots.count) break;
        }
      }
    }
  }
  return { lift, bodyW, bodyH, bodyL };
}

// ------------------------------------------------------------ neck/head ----

function buildNeckHead(surface, t, cfg, C, blend, info, torso) {
  const dims = t.dims;
  const jn = (n) => t.joints.v(n);
  const headSize = dims.headSize;
  const head = jn('head');
  const neck = jn('neck');
  const chest = jn('chest');
  const { lift, bodyW, bodyH, bodyL } = torso;

  // --- neck: a tapered tube that is always thinner than the skull --------
  const neckR = dims.bodyWidth * (cfg.neckThickness ?? 0.5);
  const headHalfW = headSize * (cfg.headScale?.[0] ?? 1);
  const topR = Math.min(neckR * 0.92, headHalfW * 0.78);
  surface.capsule(
    [chest.x, chest.y + (lift || 0) + bodyH * 0.1, chest.z + bodyL * 0.1],
    [neck.x, neck.y, neck.z],
    neckR * 1.18,
    topR * 1.02,
    { color: C.base, bones: ['chest', 'spine2', 'neck'], blend: blend * 1.15 }
  );
  surface.capsule(
    [neck.x, neck.y - headSize * 0.05, neck.z],
    [head.x, head.y - headSize * 0.12, head.z],
    topR,
    topR * 0.95,
    { color: C.base, bones: ['neck', 'head'], blend: blend * 0.95 }
  );

  // --- skull -------------------------------------------------------------
  const s = cfg.headScale ?? [1, 1, 1];
  const hx = headSize * s[0];
  const hy = headSize * s[1];
  const hz = headSize * s[2] * (cfg.headLen ?? 1.0);
  const hcx = head.x;
  const hcy = head.y + hy * (cfg.headRise ?? 0.1);
  const hcz = head.z + hz * 0.04;

  const skullBones = ['head', 'neck'];
  surface.ellipsoid([hcx, hcy, hcz], [hx * 0.94, hy * 0.96, hz * 0.98], {
    color: C.base, bones: skullBones, blend: blend * 1.5
  });
  // Crown: fills the top of the skull so round-headed species read round.
  surface.ellipsoid([hcx, hcy + hy * 0.22, hcz - hz * 0.08], [hx * 0.92, hy * 0.82, hz * 0.9], {
    color: C.base, bones: ['head'], blend: blend * 1.4
  });
  // Brow ridge: the shelf over the eyes.
  surface.ellipsoid(
    [hcx, hcy + hy * (0.3 + (cfg.browMass ?? 0.06)), hcz + hz * 0.36],
    [hx * 0.88, hy * 0.36, hz * 0.62],
    { color: C.base, bones: ['head'], blend: blend * 1.2 }
  );
  // Jowls / cheeks: the face mask is painted from these.
  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    surface.ellipsoid(
      [hcx + sg * hx * 0.6, hcy - hy * 0.22, hcz + hz * 0.3],
      [hx * (0.4 + (cfg.cheekMass ?? 0.18) * 0.9), hy * 0.46, hz * 0.46],
      { color: C.mask, bones: ['head'], sharp: cfg.maskSharp ?? 3.0, blend: blend * 1.1 }
    );
  }
  // Jaw / chin.
  surface.ellipsoid(
    [hcx, hcy - hy * 0.52, hcz + hz * 0.42],
    [hx * 0.52, hy * 0.34, hz * 0.5],
    { color: C.belly, bones: ['head'], sharp: 2.6 }
  );

  // --- muzzle ------------------------------------------------------------
  const mw = hx * (cfg.muzzleWidth ?? 0.5);
  const muzzleLen = headSize * (cfg.muzzleLen ?? 0.4);
  const muzzleDrop = hy * (cfg.muzzleDrop ?? 0.3);
  const muzzleBase = [hcx, hcy - hy * 0.08, hcz + hz * 0.5];
  const tip = new THREE.Vector3(hcx, hcy - muzzleDrop, hcz + hz * 0.9 + muzzleLen);
  surface.capsule(muzzleBase, tip.toArray(), mw * 0.98, mw * (cfg.muzzleTipScale ?? 0.8), {
    color: cfg.muzzleColor ? C[cfg.muzzleColor] : C.base,
    bones: ['head'],
    blend: blend * 0.95
  });
  // Bridge on top of the muzzle so it is not a bare tube.
  const mid = new THREE.Vector3().fromArray(muzzleBase).lerp(tip, 0.5);
  surface.ellipsoid(
    [mid.x, mid.y + mw * 0.35, mid.z],
    [mw * 0.8, mw * 0.42, muzzleLen * 0.62],
    { color: cfg.muzzleColor ? C[cfg.muzzleColor] : C.base, bones: ['head'], blend: blend * 0.8 }
  );

  info.head = { hx, hy, hz, centre: new THREE.Vector3(hcx, hcy, hcz) };
  info.muzzleTip = tip;
  info.muzzleRadius = mw * (cfg.muzzleTipScale ?? 0.8);
}

// ----------------------------------------------------------------- ears ----

function buildEars(surface, t, cfg, C, blend) {
  const earCfg = cfg.ear || { type: 'round', size: 0.3 };
  if (earCfg.type === 'none') return;
  const headSize = t.dims.headSize;
  const head = t.joints.v('head');

  // `size` is the ear's overall span; len/w/th are multipliers of it.
  const shapes = {
    long: { len: 2.6, w: 0.5, th: 0.32, taper: 0.42 },     // rabbit
    pointed: { len: 2.0, w: 0.62, th: 0.4, taper: 0.38 },   // fox
    fluffy: { len: 1.5, w: 0.95, th: 0.55, taper: 0.6 },    // red panda
    big: { len: 2.4, w: 1.9, th: 0.4, taper: 0.55 },        // elephant
    tufted: { len: 1.5, w: 0.85, th: 0.55, taper: 0.68 },   // lion
    round: { len: 1.4, w: 0.9, th: 0.55, taper: 0.66 }      // capybara / generic
  };
  const sh = shapes[earCfg.type] || shapes.round;
  const size = earCfg.size ?? headSize * 0.4;
  const isBig = earCfg.type === 'big';

  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    const boneName = `ear${side}`;
    const boneBase = t.joints.v(boneName);
    const bones = ['head', boneName];

    // Direction of the ear's long axis. The bone's tip is the default (so a
    // rotated ear bone deforms the flap correctly); big elephant ears instead
    // hang outward, down and slightly back off the side of the skull.
    let dir;
    let base;
    if (isBig) {
      dir = new THREE.Vector3(sg * 0.62, -0.28, -0.5).normalize();
      base = new THREE.Vector3(
        head.x + sg * headSize * 0.82,
        head.y - headSize * 0.12,
        head.z - headSize * 0.15
      );
    } else {
      const tipLocal = boneTip(t, boneName) || new THREE.Vector3(0, size, -size * 0.2);
      dir = tipLocal.clone().normalize();
      dir.x += sg * (earCfg.spread ?? 0.5) * 0.5;
      dir.normalize();
      base = boneBase.clone();
      base.y += headSize * 0.1;
    }

    const earLen = size * sh.len;
    const halfW = size * sh.w * 0.5;
    const thick = Math.max(size * sh.th * 0.5, 0.008);
    const rot = alignEuler(dir);

    const steps = [
      { at: 0.04, w: 1.0, th: 1.0, col: C.base },
      { at: 0.4, w: 0.92 - sh.taper * 0.1, th: 0.9, col: C.base },
      { at: 0.72, w: 0.66 - sh.taper * 0.16, th: 0.72, col: C.base },
      { at: 0.96, w: 0.3 - sh.taper * 0.1, th: 0.48, col: C.base }
    ];
    for (const st of steps) {
      const c = base.clone().addScaledVector(dir, earLen * st.at);
      surface.ellipsoid(
        [c.x, c.y, c.z],
        [halfW * st.w, earLen * 0.24, thick * st.th],
        { color: st.col, bones, rot, blend: blend * 0.6 }
      );
    }

    // Inner ear: a warmer, slightly forward copy, so the ear has an inside.
    const inner = base.clone().addScaledVector(dir, earLen * 0.32).add(new THREE.Vector3(0, 0, thick * 0.6));
    surface.ellipsoid(
      [inner.x, inner.y, inner.z],
      [halfW * 0.6, earLen * 0.3, thick * 0.5],
      { color: C.innerEar, bones, rot, sharp: 4.0, blend: blend * 0.32 }
    );
  }
}

// ----------------------------------------------------------------- legs ----

function buildLegs(surface, t, cfg, C, blend, lift = 0) {
  const dims = t.dims;

  for (const leg of t.legDefs) {
    const upper = `leg${leg.key}`;
    const lower = `shin${leg.key}`;
    const foot = `foot${leg.key}`;
    const p0 = t.joints.v(upper);
    const p1 = t.joints.v(lower);
    const p2 = t.joints.v(foot);
    const pairScale = leg.key[0] === 'F' ? (cfg.legScaleFront ?? 1) : (cfg.legScaleHind ?? 1);
    const r = dims.legRadius * (cfg.legScale ?? 1) * pairScale;
    const legBones = [leg.attach, upper, lower, foot];
    const L = dims.legLength;

    // Thigh / shoulder: a mass that blends into the torso, then narrows. It
    // reaches up by `lift` so it always overlaps the (possibly raised) barrel
    // and the whole animal stays one connected shell.
    surface.capsule(
      [p0.x, p0.y + L * (cfg.upperLegDrop ?? 0.16) + lift, p0.z - leg.bend * L * 0.05],
      [p0.x, p0.y - L * 0.04, p0.z],
      r * (cfg.upperLegScale ?? 1.8),
      r * (cfg.midLegScale ?? 1.15),
      { color: C.base, bones: legBones, blend: blend * 1.35 }
    );
    // Shank down to the knee.
    surface.capsule(p0.toArray(), p1.toArray(), r * 1.02, r * 0.86, {
      color: C.base,
      bones: legBones,
      blend: blend * 0.9
    });

    if (cfg.hoof || dims.hoofed) {
      // Slim cannon bone and a cloven hoof that rests on the ground.
      surface.capsule(
        p1.toArray(),
        [p2.x, Math.max(p2.y + r * 0.2, r * 0.55), p2.z],
        r * 0.8,
        r * 0.6,
        { color: C.sock, bones: [upper, lower], sharp: cfg.sockSharp ?? 3.4, blend: blend * 0.7 }
      );
      const hoofH = Math.max(r * 1.05, 0.014);
      surface.capsule(
        [p2.x, hoofH * 0.9, p2.z + r * 0.1],
        [p2.x, hoofH * 0.1, p2.z + r * 0.25],
        r * 0.68,
        r * 0.74,
        { color: C.hoof, bones: [lower, foot], sharp: 4.5, blend: blend * 0.5 }
      );
    } else {
      // Ankle stays clear of the ground; the paw owns the contact.
      surface.capsule(
        p1.toArray(),
        [p2.x, Math.max(p2.y + r * 0.25, r * 0.5), p2.z],
        r * 0.84,
        r * 0.6,
        { color: C.sock, bones: [upper, lower], sharp: cfg.sockSharp ?? 3.4, blend: blend * 0.7 }
      );
      const pawH = Math.max(r * (cfg.pawHeight ?? 0.8), 0.012);
      const pawZ = p2.z + r * (cfg.pawForward ?? 0.7);
      surface.ellipsoid(
        [p2.x, pawH, pawZ],
        [r * (cfg.pawWidth ?? 1.4), pawH, r * (cfg.pawLength ?? 1.8)],
        { color: C.paw, bones: [lower, foot], sharp: cfg.pawSharp ?? 3.2, blend: blend * 0.6 }
      );
      // Toes: three small domes at the front of the paw.
      if (cfg.toes !== false) {
        const toeR = Math.max(r * 0.34, 0.008);
        for (let k = -1; k <= 1; k++) {
          surface.ellipsoid(
            [p2.x + k * r * 0.62, pawH * 0.66, pawZ + r * (cfg.pawLength ?? 1.8) * 0.62],
            [toeR, pawH * 0.6, toeR * 1.5],
            { color: C.paw, bones: [foot], sharp: 5, blend: blend * 0.35 }
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------- trunk ----

function buildTrunk(surface, t, cfg, C, blend, info) {
  if (!cfg.trunk || !t.joints.pos.has('trunk1')) return;
  const tk = cfg.trunk;
  const headSize = t.dims.headSize;
  const head = t.joints.v('head');
  const t1 = t.joints.v('trunk1');
  const t2 = t.joints.v('trunk2');
  const dir = new THREE.Vector3().subVectors(t2, t1).normalize();
  const tail = t2.clone().addScaledVector(dir, headSize * (tk.extend ?? 1.4));
  tail.y -= headSize * (tk.curl ?? 0.4);
  // A relaxed trunk tip hangs just above the ground, never through it.
  tail.y = Math.max(tail.y, headSize * 0.3);

  const root = new THREE.Vector3(head.x, head.y - headSize * 0.42, head.z + headSize * 0.7);
  const pts = [root, t1, t2, tail];
  const radii = [
    headSize * (tk.rootScale ?? 0.5),
    headSize * 0.34,
    headSize * 0.25,
    headSize * (tk.tipScale ?? 0.16)
  ];
  const bones = ['head', 'trunk1', 'trunk2'];
  // More, smaller segments give the trunk a smooth taper and a soft bend.
  for (let i = 0; i < pts.length - 1; i++) {
    const steps = 3;
    let prev = pts[i];
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      const cur = new THREE.Vector3().lerpVectors(pts[i], pts[i + 1], u);
      const rA = radii[i] + (radii[i + 1] - radii[i]) * ((k - 1) / steps);
      const rB = radii[i] + (radii[i + 1] - radii[i]) * u;
      surface.capsule(prev.toArray(), cur.toArray(), rA, rB, {
        color: C.base,
        bones,
        blend: blend * 0.9
      });
      prev = cur;
    }
  }
  // Nostril hint and a slightly darker tip.
  surface.ellipsoid([tail.x, tail.y, tail.z + headSize * 0.06], [headSize * 0.12, headSize * 0.11, headSize * 0.1], {
    color: C.nose, bones: ['trunk2'], sharp: 5, blend: blend * 0.25
  });
  info.trunkTip = tail;

  // Small tusks beside the trunk.
  if (cfg.tusks) {
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      surface.capsule(
        [head.x + sg * headSize * 0.34, head.y - headSize * 0.55, head.z + headSize * 0.62],
        [head.x + sg * headSize * 0.36, head.y - headSize * 0.9, head.z + headSize * 0.95],
        headSize * 0.075,
        headSize * 0.03,
        { color: C.ivory ?? 0xf3e9d6, bones: ['head'], sharp: 5, blend: blend * 0.4 }
      );
    }
  }
}

// ----------------------------------------------------------------- tail ----

function buildTail(surface, t, cfg, C, blend) {
  const tailCfg = cfg.tail || { type: 'thin' };
  const bones = t.tailBones;
  if (tailCfg.type === 'none' || !bones.length) return;

  const jn = (n) => t.joints.v(n);
  const hips = jn('hips');
  const pts = bones.map((b) => jn(b));
  const first = pts[0];
  // Anchor inside the rump so the tail grows out of the body, not off it.
  const anchor = hips.clone().lerp(first, 0.45).add(new THREE.Vector3(0, t.dims.bodyHeight * 0.18, 0));

  const last = pts[pts.length - 1];
  const dir = pts.length > 1
    ? new THREE.Vector3().subVectors(last, pts[pts.length - 2]).normalize()
    : new THREE.Vector3(0, 0, -1);
  const tip = last.clone().addScaledVector(dir, tailCfg.extend ?? 0.14);

  const chain = [anchor.toArray(), ...pts.map((p) => p.toArray()), tip.toArray()];
  const baseR = t.dims.bodyWidth * (tailCfg.baseScale ?? 0.32);

  const profileFor = {
    bush: (u) => 0.5 + 1.25 * Math.sin(Math.PI * Math.pow(u, 0.72)),
    plume: (u) => 0.45 + 0.95 * Math.sin(Math.PI * Math.pow(u, 0.8)),
    ringed: (u) => 0.62 + 0.5 * Math.sin(Math.PI * Math.pow(u, 0.9)),
    puff: () => 0.95,
    thin: (u) => 0.95 - 0.62 * u,
    flat: (u) => 0.8 - 0.35 * u
  };
  const profile = profileFor[tailCfg.type] || profileFor.thin;

  const n = chain.length;
  const radii = [];
  for (let i = 0; i < n; i++) radii.push(baseR * profile(i / (n - 1)));

  for (let i = 0; i < n - 1; i++) {
    const u = i / Math.max(1, n - 2);
    let col = C.base;
    if (tailCfg.type === 'ringed') col = i % 2 === 0 ? C.base : C.accent;
    if (tailCfg.type === 'bush' || tailCfg.type === 'plume') {
      col = u > 0.55 ? C[tailCfg.tipColor || 'tailTip'] : C.base;
    }
    if (tailCfg.tipColor && i >= n - 2) col = C[tailCfg.tipColor];
    surface.capsule(chain[i], chain[i + 1], radii[i], radii[i + 1], {
      color: col,
      bones: i === 0 ? ['hips', ...bones] : bones,
      sharp: tailCfg.type === 'ringed' ? 5.5 : 2.6,
      blend: blend * 1.0
    });
  }

  // Brush tip: a rounded end so the tail never terminates in a cut tube.
  if (tailCfg.type === 'bush' || tailCfg.type === 'plume' || tailCfg.type === 'puff') {
    const end = new THREE.Vector3().fromArray(chain[n - 1]);
    const rEnd = radii[n - 1];
    surface.ellipsoid(
      [end.x, end.y, end.z],
      [rEnd * 1.02, rEnd * 1.02, rEnd * 1.15],
      { color: tailCfg.tipColor ? C[tailCfg.tipColor] : C.tailTip, bones: [bones[bones.length - 1]], blend: blend * 0.8 }
    );
  }
}

// -------------------------------------------------------------- details ----

/** Eyes, nose, mouth line, whisker dots, hooves - crisp details snapped onto
 *  the sculpted skin so nothing floats. */
function buildMammalDetails(ctx, t, cfg, C, info, materials) {
  const parts = [];
  const head = t.joints.v('head');
  const headSize = t.dims.headSize;
  const eyeR = cfg.eyeSize ?? headSize * 0.19;
  const eyeDepth = cfg.eyeDepth ?? 0.72;

  for (const side of ['L', 'R']) {
    const s = sideSign(side);
    const bonePos = t.joints.v(`eye${side}`);
    const dir = new THREE.Vector3().subVectors(bonePos, head).normalize();
    const probe = new THREE.Vector3(bonePos.x, bonePos.y, bonePos.z).addScaledVector(dir, -eyeR * 0.2);
    const snap = snapToSurface(ctx.mesh, probe.toArray(), [dir.x, dir.y, dir.z], eyeR);
    const centre = snap ? snap.embedded : probe;

    parts.push({
      geometry: sphereGeo(eyeR, 16, 12).translate(centre.x, centre.y, centre.z),
      material: 'eye',
      bones: [`eye${side}`],
      power: 8
    });
    // Catchlight: the single detail that makes an eye feel alive.
    const shineR = eyeR * 0.32;
    const outNormal = snap ? snap.normal : dir;
    const shine = centre.clone()
      .addScaledVector(outNormal, eyeR * 0.74)
      .add(new THREE.Vector3(s * eyeR * 0.3, eyeR * 0.34, 0));
    parts.push({
      geometry: sphereGeo(shineR, 8, 6).translate(shine.x, shine.y, shine.z),
      material: 'shine',
      bones: [`eye${side}`],
      power: 8
    });
  }

  // Nose: a soft wedge on the muzzle tip, placed exactly where the sculptor
  // put the muzzle so it can never drift off the face.
  const tip = info.muzzleTip || new THREE.Vector3(
    head.x,
    head.y - headSize * 0.3,
    head.z + headSize * 1.2
  );
  const noseDir = [0, -0.18, 1];
  const noseSnap = snapToSurface(ctx.mesh, tip.toArray(), noseDir, headSize * 0.16);
  if (noseSnap) {
    const nr = headSize * (cfg.noseSize ?? 0.17);
    const n = noseSnap.point.clone().addScaledVector(noseSnap.normal, -headSize * 0.03);
    parts.push({
      geometry: ellipsoidGeo(nr * 1.2, nr * 0.8, nr * 0.95, 14, 10).translate(n.x, n.y, n.z),
      material: 'nose',
      bones: ['head'],
      power: 7
    });
    if (cfg.mouth !== false) {
      const mr = headSize * 0.055;
      parts.push({
        geometry: ellipsoidGeo(nr * 0.95, mr, nr * 0.45, 10, 8)
          .translate(n.x, n.y - nr * 1.05, n.z + nr * 0.5),
        material: 'dark',
        bones: ['head'],
        power: 7
      });
    }
  }

  // Cloven hooves for deer-type feet.
  if (cfg.hoof || t.dims.hoofed) {
    for (const leg of t.legDefs) {
      const foot = t.joints.v(`foot${leg.key}`);
      const r = t.dims.legRadius;
      const g = new THREE.BoxGeometry(r * 1.35, r * 0.85, r * 2.0);
      g.translate(foot.x, r * 0.42, foot.z + r * 0.5);
      parts.push({ geometry: g, material: 'hoof', bones: [`foot${leg.key}`], power: 7 });
    }
  }
  return parts;
}

/* =========================================================================
 *  BIRDS  (penguin, flamingo)
 * ========================================================================= */

export function sculptBird(t, cfg) {
  const C = palette(cfg.c);
  const dims = t.dims;
  const blend = cfg.blend ?? Math.max(0.014, dims.headSize * 0.24);
  const surface = new ImplicitSurface({
    resolution: cfg.resolution ?? 76,
    blend,
    padding: blend * 2.6,
    smooth: cfg.smooth ?? 2
  });

  const jn = (n) => t.joints.v(n);
  const hips = jn('hips');
  const bodyR = dims.bodyRadius;
  const stretch = dims.bodyStretch;
  const bodyLen = cfg.bodyLength ?? 1.0;
  const isWader = t.beak === 'curved';

  // --- torso: a vertical egg. Height profile from a smooth curve, so the
  //     belly is widest low and the shoulders narrow towards the neck.
  const bottom = -bodyR * (isWader ? 0.9 : 1.0) * stretch * 0.62;
  const top = bodyR * (isWader ? 0.95 : 1.22) * stretch * 0.62;
  const levels = 7;
  for (let i = 0; i <= levels; i++) {
    const u = i / levels;
    const y = hips.y + bottom + (top - bottom) * u;
    // egg profile: fat low-middle, tapering to the shoulders
    const r = bodyR * (0.45 + 0.55 * Math.sin(Math.PI * Math.pow(u, 0.72)));
    surface.ellipsoid(
      [hips.x, y, hips.z - (u - 0.5) * bodyR * (isWader ? 0.55 : 0.12)],
      [r, (top - bottom) * 0.34, r * (isWader ? 0.92 : 0.94) * bodyLen],
      { color: C.base, bones: ['hips', ...(t.neckChain.slice(0, 1) || [])], blend: blend * 2.4 }
    );
  }
  // Breast: the forward bulge a bird carries over its keel.
  surface.ellipsoid(
    [hips.x, hips.y + bottom * 0.05 + (top - bottom) * 0.22, hips.z + bodyR * 0.66 * bodyLen],
    [bodyR * 0.72, (top - bottom) * 0.3, bodyR * 0.4],
    { color: C.base, bones: ['hips'], blend: blend * 1.9 }
  );
  // Pale belly panel, painted, never a second mesh.
  surface.ellipsoid(
    [hips.x, hips.y + (isWader ? 0.02 : 0.02), hips.z + bodyR * 0.55 * bodyLen],
    [bodyR * 0.72, (top - bottom) * 0.42, bodyR * 0.5],
    { color: C.belly, bones: ['hips'], sharp: cfg.panelSharp ?? 2.6 }
  );

  // --- neck chain up to the head ----------------------------------------
  const neckChain = [...t.neckChain, 'head'];
  let prev = new THREE.Vector3(hips.x, hips.y + shoulderLevel(top, bottom), hips.z);
  const neckBaseR = bodyR * (isWader ? 0.3 : 0.4);
  neckChain.forEach((name, i) => {
    const p = jn(name);
    const last = i === neckChain.length - 1;
    const r0 = i === 0 ? neckBaseR * 1.27 : neckBaseR * 1.0;
    const r1 = last ? dims.headSize * 0.72 : neckBaseR * (isWader ? 0.95 : 0.96);
    const boneList = i === 0 ? ['hips', neckChain[0]] : [neckChain[i - 1], name];
    surface.capsule(prev.toArray(), p.toArray(), r0, r1, {
      color: C.base,
      bones: boneList,
      blend: blend * 1.0
    });
    prev = p;
  });

  // --- head ---------------------------------------------------------------
  const head = jn('head');
  const hs = dims.headSize;
  surface.ellipsoid(
    [head.x, head.y + hs * 0.08, head.z + hs * 0.08],
    [hs * 0.96, hs * 0.94, hs * 1.04],
    { color: C.base, bones: ['head', neckChain[neckChain.length - 2] || 'hips'], blend: blend * 1.1 }
  );
  // Cheeks give the skull a face rather than a sphere.
  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    surface.ellipsoid(
      [head.x + sg * hs * 0.6, head.y + hs * 0.02, head.z + hs * 0.3],
      [hs * 0.34, hs * 0.44, hs * 0.5],
      { color: C.base, bones: ['head'], blend: blend * 0.9 }
    );
  }

  // --- flippers / folded wings ------------------------------------------
  if (t.wings) {
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      const w = jn(`wing${side}`);
      const flapLen = bodyR * (isWader ? 1.25 : 1.35);
      // Slice the wing into overlapping flattened ellipsoids along the bone,
      // tapering to a tip, so it reads as a shaped wing, not a bubble. The
      // first slice sits INSIDE the torso so the wing is one shell with it.
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const u = i / (steps - 1);
        const c = new THREE.Vector3(
          w.x * (0.45 + 0.55 * u) + sg * bodyR * (0.02 + u * 0.26),
          w.y - bodyR * (0.1 + u * (isWader ? 0.95 : 0.5)),
          w.z - bodyR * (0.06 + u * 0.28)
        );
        const s = 1 - u * 0.45;
        surface.ellipsoid(
          [c.x, c.y, c.z],
          [bodyR * 0.2 * s, flapLen * 0.32 * s, bodyR * (isWader ? 0.42 : 0.5) * s],
          {
            color: u > 0.5 ? C.accent : C.base,
            bones: [`wing${side}`, 'hips'],
            rot: [0, 0, sg * (isWader ? 0.05 : 0.1)],
            sharp: 2.8,
            blend: blend * 1.15
          }
        );
      }
    }
  }

  // --- legs ---------------------------------------------------------------
  for (const leg of t.legDefs) {
    const upper = `leg${leg.key}`;
    const lower = `shin${leg.key}`;
    const foot = `foot${leg.key}`;
    const p0 = jn(upper);
    const p1 = jn(lower);
    const p2 = jn(foot);
    const r = dims.legRadius ?? bodyR * 0.2;
    // Thigh plug: reaches up inside the torso so the leg is part of the same
    // shell. Waders stand tall on stilts, so without this the legs would be
    // detached sticks floating under the body.
    const hipTop = new THREE.Vector3(p0.x, hips.y + bottom * 0.35, p0.z);
    surface.capsule(hipTop.toArray(), p0.toArray(), r * (isWader ? 1.45 : 1.3), r * 1.25, {
      color: C.base,
      bones: ['hips', upper],
      blend: blend * 1.5
    });
    surface.capsule(p0.toArray(), p1.toArray(), r * 1.2, r * 1.0, {
      color: C.base,
      bones: ['hips', upper, lower],
      blend: blend * 1.1
    });
    surface.capsule(p1.toArray(), [p2.x, Math.max(p2.y + r * 0.3, r * 0.6), p2.z], r * 1.0, r * 0.75, {
      color: C.sock, bones: [lower], sharp: 3.4, blend: blend * 0.8
    });
    // Foot: a flat sole with three forward toes.
    const soleH = Math.max(r * 0.5, 0.008);
    surface.ellipsoid(
      [p2.x, soleH, p2.z + r * (isWader ? 0.2 : 1.0)],
      [r * (isWader ? 1.1 : 1.5), soleH, r * (isWader ? 1.6 : 2.2)],
      { color: C.sock, bones: [lower, foot], sharp: 3.6, blend: blend * 0.6 }
    );
    for (let k = -1; k <= 1; k++) {
      surface.ellipsoid(
        [p2.x + k * r * (isWader ? 0.55 : 0.75), soleH * 0.8, p2.z + r * (isWader ? 0.9 : 1.9)],
        [r * 0.4, soleH * 0.7, r * (isWader ? 0.7 : 0.6)],
        { color: C.sock, bones: [foot], sharp: 5, blend: blend * 0.35 }
      );
    }
  }

  return {
    surface,
    palette: C,
    details: (ctx, materials) => buildBirdDetails(ctx, t, cfg, C, materials)
  };
}

function shoulderLevel(top, bottom) {
  return bottom + (top - bottom) * 0.82;
}

function buildBirdDetails(ctx, t, cfg, C, materials) {
  const parts = [];
  const head = t.joints.v('head');
  const headSize = t.dims.headSize;
  const beakBase = t.joints.v('beakBase');

  const curved = t.beak === 'curved';
  const stubby = t.beak === 'stubby';
  const len = headSize * (curved ? 1.9 : stubby ? 0.8 : 1.5);
  const rBase = headSize * (curved ? 0.24 : 0.28);

  const upperPts = [];
  const lowerPts = [];
  const steps = curved ? 5 : 3;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const drop = curved ? -Math.pow(u, 1.8) * headSize * 1.2 : -u * headSize * 0.04;
    const z = beakBase.z + len * u;
    const y = beakBase.y + drop;
    upperPts.push([beakBase.x, y + rBase * 0.2 * (1 - u * 0.5), z]);
    lowerPts.push([beakBase.x, y - rBase * 0.34 * (1 - u * 0.4), z]);
  }
  parts.push({ geometry: tubeGeo(upperPts, rBase, rBase * 0.24), material: 'beak', bones: ['head'], power: 7 });
  parts.push({ geometry: tubeGeo(lowerPts, rBase * 0.8, rBase * 0.2), material: 'beak', bones: ['head'], power: 7 });

  const eyeR = cfg.eyeSize ?? headSize * 0.22;
  for (const side of ['L', 'R']) {
    const s = sideSign(side);
    const bonePos = t.joints.v(`eye${side}`);
    const dir = new THREE.Vector3().subVectors(bonePos, head).normalize();
    const snap = snapToSurface(ctx.mesh, bonePos.toArray(), [dir.x, dir.y, dir.z], eyeR);
    const centre = snap ? snap.embedded : bonePos;
    parts.push({
      geometry: sphereGeo(eyeR, 14, 10).translate(centre.x, centre.y, centre.z),
      material: 'eye',
      bones: [`eye${side}`],
      power: 8
    });
    const outNormal = snap ? snap.normal : dir;
    const shine = centre.clone().addScaledVector(outNormal, eyeR * 0.7).add(new THREE.Vector3(s * eyeR * 0.3, eyeR * 0.34, 0));
    parts.push({
      geometry: sphereGeo(eyeR * 0.34, 8, 6).translate(shine.x, shine.y, shine.z),
      material: 'shine',
      bones: [`eye${side}`],
      power: 8
    });
  }
  return parts;
}

/* ------------------------------------------------ small geometry helpers */

function sphereGeo(r, w, h) {
  return new THREE.SphereGeometry(r, w, h);
}

function ellipsoidGeo(rx, ry, rz, w, h) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

function tubeGeo(points, r0, r1) {
  const pts = points.map((p) => new THREE.Vector3().fromArray(p));
  const curve = new THREE.CatmullRomCurve3(pts);
  const steps = Math.max(4, pts.length * 4);
  const radial = 8;
  const positions = [];
  const indices = [];
  const normals = [];
  const uvs = [];
  const up = new THREE.Vector3(0, 1, 0);
  const alt = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = curve.getPointAt(u);
    curve.getTangentAt(u, tangent);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
    tangent.normalize();
    nrm.crossVectors(tangent, up);
    if (nrm.lengthSq() < 1e-6) nrm.crossVectors(tangent, alt);
    nrm.normalize();
    bin.crossVectors(tangent, nrm).normalize();
    const r = r0 + (r1 - r0) * u;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * TAU;
      const sin = Math.sin(a);
      const cos = -Math.cos(a);
      const nx = cos * nrm.x + sin * bin.x;
      const ny = cos * nrm.y + sin * bin.y;
      const nz = cos * nrm.z + sin * bin.z;
      positions.push(p.x + r * nx, p.y + r * ny, p.z + r * nz);
      normals.push(nx, ny, nz);
      uvs.push(u, k / radial);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < radial; k++) {
      const a = (radial + 1) * i + k;
      const b = (radial + 1) * (i + 1) + k;
      const c = (radial + 1) * (i + 1) + k + 1;
      const d = (radial + 1) * i + k + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

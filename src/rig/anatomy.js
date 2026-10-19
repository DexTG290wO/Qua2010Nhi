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
    ear: c.ear ?? c.base,
    earEdge: c.earEdge ?? c.accent,
    cheek: c.cheek ?? c.mask,
    mane: c.mane ?? c.accent,
    throat: c.throat ?? c.belly,
    lid: c.lid ?? c.base,
    whisker: c.whisker ?? c.belly,
    ivory: c.ivory ?? 0xf3e9d6,
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
  buildEars(surface, t, cfg, C, blend, info);
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
  const arch = cfg.backArch ?? 0;
  const profile = [
    { bone: 'hips', sx: 1.0 + (cfg.rumpScale ?? 0.05), sy: 1.0, sz: 0.34, lift: 0.86, dy: 0 },
    { bone: 'spine1', sx: 1.02 * (cfg.waistScale ?? 1), sy: 1.0, sz: 0.36, lift: 0.92, dy: bodyH * arch * 0.45 },
    { bone: 'spine2', sx: 0.98 * (cfg.waistScale ?? 1), sy: 0.97, sz: 0.33, lift: 0.95, dy: bodyH * arch },
    { bone: 'chest', sx: 0.9, sy: 0.9, sz: 0.3, lift: 1.0, dy: bodyH * arch * 0.6 }
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
  // The panel is deliberately a shallow, inset lobe: a belly-radius ellipsoid
  // paints as much of the flank as of the actual belly.
  const bellyBottom = Math.max(spineY - bodyH + lift, minBelly * 0.94);
  const bellyDepth = bodyH * (cfg.bellyDepth ?? 0.3);
  const bellyRadiusY = Math.max(bodyH * 0.11, bellyDepth * 0.5);
  const bellyCentreY = bellyBottom + bellyRadiusY * 0.55;
  const midZ = (jn('spine1').z + jn('spine2').z) * 0.5;
  surface.ellipsoid(
    [0, bellyCentreY, midZ],
    [bodyW * (cfg.bellyWidth ?? 0.62), bellyRadiusY, bodyL * (cfg.bellyLength ?? 0.4)],
    {
      color: C.belly,
      bones: spineBones,
      sharp: cfg.bellySharp ?? 3.2,
      paintOnly: true
    }
  );

  // Chest brisket: the pale front the species file can tint.
  surface.ellipsoid(
    [0, chest.y + lift - bodyH * (0.18 + (cfg.chestDrop ?? 0)) + bodyH * 0.3, chest.z + bodyL * 0.13],
    [bodyW * 0.58, bodyH * 0.6, bodyL * 0.18],
    { color: cfg.chestColor ? C[cfg.chestColor] : C.base, bones: ['spine2', 'chest', 'neck'], sharp: 1.9 }
  );

  // Rump patch: deer flash a pale mirror at the back; painted, not raised.
  if (cfg.rumpPatch) {
    surface.ellipsoid(
      [0, hips.y + lift + bodyH * 0.05, hips.z - bodyL * 0.2],
      [bodyW * 0.72, bodyH * 0.76, bodyL * 0.12],
      { color: C[cfg.rumpPatch], bones: ['hips'], sharp: 3.5, paintOnly: true }
    );
  }

  // Fawn spots: small soft dots scattered along the back and flanks, not the
  // giant rectangular patches the old evenly-spaced grid produced.
  if (cfg.spots) {
    const spots = cfg.spots;
    const count = spots.count ?? 20;
    const s = spots.size ?? 0.055;
    const seed = spots.seed ?? 7;
    let state = seed * 9973 + 17;
    const rnd = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const u = 0.08 + rnd() * 0.84;
      const side = rnd() < 0.5 ? -1 : 1;
      const z = hips.z - bodyL * 0.12 + (chest.z - hips.z + bodyL * 0.24) * u;
      const y = spineY + lift + bodyH * (0.1 + rnd() * 0.62);
      const x = side * bodyW * (0.9 + rnd() * 0.08);
      const r = s * (0.65 + rnd() * 0.7);
      surface.ellipsoid(
        [x, y, z],
        [bodyW * r, bodyH * r * 0.65, bodyL * r * 0.55],
        {
          color: C[spots.color ?? 'belly'],
          bones: spineBones,
          sharp: spots.sharp ?? 6.5,
          paintOnly: true
        }
      );
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

  // Cranium: the back of the skull, deliberately a little smaller than the
  // cheek mass so the head is wide at the face and narrow at the neck.
  surface.ellipsoid([hcx, hcy, hcz - hz * 0.04], [hx * 0.9, hy * 0.93, hz * 0.9], {
    color: C.base, bones: skullBones, blend: blend * 1.6
  });
  // Crown: a domed forehead. Rabbits and elephants read round; foxes and
  // deer read flat-topped because their crown is shallower.
  surface.ellipsoid(
    [hcx, hcy + hy * (cfg.crownRise ?? 0.26), hcz + hz * 0.02],
    [hx * 0.82, hy * (cfg.crownDepth ?? 0.66), hz * 0.88],
    { color: C.base, bones: ['head'], blend: blend * 1.5 }
  );
  // Face plate: the flat-ish front of the skull between the eyes. Without
  // this the head is a sphere and the eyes sit on its equator.
  surface.ellipsoid(
    [hcx, hcy + hy * 0.03, hcz + hz * 0.46],
    [hx * 0.68, hy * 0.52, hz * 0.46],
    { color: cfg.faceColor ? C[cfg.faceColor] : C.base, bones: ['head'], blend: blend * 1.35 }
  );
  // Brow ridges over the eyes: two soft shelves, not one band across the face.
  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    surface.ellipsoid(
      [hcx + sg * hx * 0.38, hcy + hy * (0.18 + (cfg.browMass ?? 0.06) * 0.4), hcz + hz * 0.54],
      [hx * 0.3, hy * (0.15 + (cfg.browMass ?? 0.06) * 0.3), hz * 0.3],
      { color: C.base, bones: ['head'], blend: blend * 1.0 }
    );
  }
  // Cheeks: the pale mask is painted from these.
  const cheek = cfg.cheekMass ?? 0.18;
  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    surface.ellipsoid(
      [hcx + sg * hx * 0.55, hcy - hy * 0.2, hcz + hz * 0.18],
      [hx * (0.4 + cheek * 0.9), hy * (cfg.cheekHeight ?? 0.46), hz * 0.38],
      {
        color: cfg.cheekColor ? C[cfg.cheekColor] : C.mask,
        bones: ['head'],
        sharp: cfg.maskSharp ?? 3.0,
        blend: blend * 1.1
      }
    );
  }
  // Fluffy cheek ruffs (fox, red panda, cub): a second, outward tuft that
  // breaks the round skull silhouette and makes the species read instantly.
  if (cfg.cheekRuff) {
    const r = cfg.cheekRuff;
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      for (let i = 0; i < 2; i++) {
        const u = i === 0 ? 0 : 1;
        surface.ellipsoid(
          [
            hcx + sg * hx * (0.82 + u * 0.06),
            hcy - hy * (0.24 + u * 0.3),
            hcz + hz * (0.02 - u * 0.24)
          ],
          [hx * (0.24 - u * 0.06), hy * (0.26 - u * 0.07), hz * (0.26 - u * 0.07)],
          {
            color: C[r.color || 'cheek'],
            bones: ['head'],
            sharp: r.sharp ?? 2.6,
            blend: blend * 0.7
          }
        );
      }
    }
  }
  // Jaw / chin.
  surface.ellipsoid(
    [hcx, hcy - hy * (cfg.jawDrop ?? 0.52), hcz + hz * 0.5],
    [hx * (cfg.jawWidth ?? 0.52), hy * 0.3, hz * 0.48],
    { color: C.belly, bones: ['head'], sharp: 2.6 }
  );

  // Brow spots: the pale eyebrows above a red panda's eyes.
  if (cfg.browSpots) {
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      surface.ellipsoid(
        [hcx + sg * hx * 0.33, hcy + hy * 0.36, hcz + hz * 0.6],
        [hx * 0.15, hy * 0.12, hz * 0.1],
        { color: C[cfg.browSpots], bones: ['head'], sharp: 5.5, paintOnly: true }
      );
    }
  }

  // --- muzzle ------------------------------------------------------------
  const mw = hx * (cfg.muzzleWidth ?? 0.5);
  const muzzleLen = headSize * (cfg.muzzleLen ?? 0.4);
  const muzzleDrop = hy * (cfg.muzzleDrop ?? 0.3);
  const muzzleBase = [hcx, hcy - hy * (cfg.muzzleBaseDrop ?? 0.1), hcz + hz * 0.5];
  const tip = new THREE.Vector3(hcx, hcy - muzzleDrop, hcz + hz * 0.92 + muzzleLen);
  const mid = new THREE.Vector3().fromArray(muzzleBase).lerp(tip, 0.56);
  mid.y -= hy * (cfg.muzzleBridgeDrop ?? 0.02);
  const midScale = cfg.muzzleMidScale ?? 0.94;
  surface.capsule(muzzleBase, mid.toArray(), mw, mw * midScale, {
    color: cfg.muzzleColor ? C[cfg.muzzleColor] : C.base,
    bones: ['head'],
    blend: blend * 0.95
  });
  surface.capsule(mid.toArray(), tip.toArray(), mw * midScale, mw * (cfg.muzzleTipScale ?? 0.8), {
    color: cfg.muzzleColor ? C[cfg.muzzleColor] : C.base,
    bones: ['head'],
    blend: blend * 0.95
  });
  // Bridge on top of the muzzle so it is not a bare tube.
  surface.ellipsoid(
    [mid.x, mid.y + mw * 0.34, mid.z],
    [mw * 0.82, mw * 0.4, muzzleLen * 0.68],
    { color: cfg.muzzleColor ? C[cfg.muzzleColor] : C.base, bones: ['head'], blend: blend * 0.8 }
  );
  // Muzzle pad: gives broad-nosed species (capybara, otter, lion) a square
  // nose instead of a pencil tip, and narrow-nosed species a small pad.
  const padScale = cfg.muzzlePad ?? 1.0;
  surface.ellipsoid(
    [tip.x, tip.y + mw * 0.08, tip.z - mw * 0.1],
    [mw * (1.05 * padScale), mw * (0.66 * (cfg.muzzleHeight ?? 1)), mw * 0.62],
    {
      color: cfg.muzzleTipColor ? C[cfg.muzzleTipColor] : (cfg.muzzleColor ? C[cfg.muzzleColor] : C.base),
      bones: ['head'],
      sharp: 2.8,
      blend: blend * 0.7
    }
  );
  // Lower lip / chin under the muzzle; gives the mouth a place to sit.
  surface.ellipsoid(
    [tip.x, tip.y - mw * (cfg.lipDrop ?? 0.5), tip.z - mw * 0.18],
    [mw * 0.78, mw * 0.32, mw * 0.55],
    { color: C.belly, bones: ['head'], sharp: 3.4, blend: blend * 0.7 }
  );

  // --- pale throat / chest bib ------------------------------------------
  if (cfg.throat !== false) {
    const throatTop = new THREE.Vector3(hcx, hcy - hy * 0.92, hcz + hz * 0.32);
    const throatBase = new THREE.Vector3(chest.x, chest.y + (lift || 0) - bodyH * 0.05, chest.z + bodyL * 0.14);
    surface.capsule(throatTop.toArray(), throatBase.toArray(), neckR * 0.38, neckR * 0.6, {
      color: C[cfg.throatColor || 'belly'],
      bones: ['head', 'neck', 'chest'],
      sharp: cfg.throatSharp ?? 3.2,
      blend: blend * 0.7
    });
  }

  // --- mane / ruff -------------------------------------------------------
  // A lion cub is mostly head and fluff. A ring of soft lobes behind the
  // cheeks, melted into the neck, reads as a mane without any fur cards.
  if (cfg.mane) {
    const m = cfg.mane;
    const count = m.count ?? 11;
    const rx = hx * (m.radius ?? 1.02);
    const ry = hy * (m.height ?? 0.8);
    const cz = hcz - hz * (m.back ?? 0.32);
    // A painted ruff underneath the lobes: even when the head hides the
    // geometry, the neck still reads as maned.
    surface.ellipsoid(
      [hcx, hcy - hy * 0.28, hcz - hz * 0.55],
      [hx * 1.08, hy * 0.92, hz * 0.38],
      { color: C[m.color || 'mane'], bones: ['head', 'neck'], sharp: 2.6, paintOnly: true }
    );
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const x = hcx + Math.cos(a) * rx;
      const y = hcy + Math.sin(a) * ry - hy * 0.15;
      // Skip lobes directly in front of the face.
      if (Math.sin(a) < -0.72) continue;
      surface.ellipsoid(
        [x, y, cz],
        [hx * (0.26 + Math.abs(Math.cos(a)) * 0.1), hy * (0.3 + Math.abs(Math.sin(a)) * 0.1), hz * 0.44],
        {
          color: C[m.color || 'mane'],
          bones: ['head', 'neck'],
          sharp: m.sharp ?? 2.0,
          blend: blend * 0.8
        }
      );
    }
    // A tuft on the crown, so the silhouette has a mane from every angle.
    surface.ellipsoid(
      [hcx, hcy + hy * 0.88, hcz - hz * 0.12],
      [hx * 0.3, hy * 0.24, hz * 0.3],
      { color: C[m.color || 'mane'], bones: ['head'], sharp: 2.2, blend: blend * 0.7 }
    );
  }

  info.head = { hx, hy, hz, centre: new THREE.Vector3(hcx, hcy, hcz) };
  info.muzzleTip = tip;
  info.muzzleRadius = mw * (cfg.muzzleTipScale ?? 0.8);
  info.muzzleWidth = mw;
}

// ----------------------------------------------------------------- ears ----

function buildEars(surface, t, cfg, C, blend, info) {
  const earCfg = cfg.ear || { type: 'round', size: 0.3 };
  if (!earCfg || earCfg.type === 'none') return;
  const headSize = t.dims.headSize;
  const head = t.joints.v('head');

  // Each shape is a silhouette recipe: length / width relative to `size`, a
  // thickness ratio and a width profile sampled from base to tip. The old
  // single tube read as a horn; these profiles give a blade, a leaf, a
  // triangular fox ear and a huge elephant fan.
  const shapes = {
    long:    { len: 2.5, width: 0.82, thick: 0.26, profile: [0.36, 0.82, 1.0, 0.96, 0.72, 0.3], blades: true },
    pointed: { len: 1.28, width: 1.02, thick: 0.3, profile: [0.62, 1.0, 0.86, 0.58, 0.2], blades: true },
    fluffy:  { len: 1.0, width: 1.2, thick: 0.5, profile: [0.6, 1.0, 1.0, 0.86, 0.44] },
    tufted:  { len: 0.98, width: 1.16, thick: 0.48, profile: [0.62, 1.0, 0.98, 0.82, 0.4] },
    round:   { len: 0.9, width: 1.05, thick: 0.5, profile: [0.55, 0.95, 1.0, 0.9, 0.5] },
    leaf:    { len: 1.32, width: 1.02, thick: 0.32, profile: [0.42, 0.9, 1.0, 0.9, 0.56, 0.24], blades: true },
    big:     { len: 1.9, width: 1.65, thick: 0.14, profile: [0.34, 0.78, 1.0, 1.0, 0.82, 0.42], fan: true },
    none: null
  };
  const sh = shapes[earCfg.type] || shapes.round;
  if (!sh) return;
  const size = earCfg.size ?? headSize * 0.4;
  const earLen = size * (earCfg.lengthScale ?? sh.len);
  const earWidth = size * (earCfg.widthScale ?? sh.width);
  const sideBones = [];

  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    const boneName = `ear${side}`;
    const boneBase = t.joints.v(boneName);
    const bones = ['head', boneName];
    sideBones.push(boneName);

    // Direction of the ear's long axis.
    let dir;
    let base;
    if (sh.fan) {
      // Elephant: a big flap hanging from the side of the skull, spreading
      // outward and down. Its broad face looks forward so it reads as an ear
      // from the front, not as a thin fin.
      dir = new THREE.Vector3(sg * 0.94, -0.32, 0.02).normalize();
      base = new THREE.Vector3(
        head.x + sg * headSize * 0.82,
        head.y + headSize * 0.12,
        head.z + headSize * 0.06
      );
    } else {
      const tipLocal = boneTip(t, boneName) || new THREE.Vector3(0, size, -size * 0.2);
      dir = tipLocal.clone().normalize();
      dir.x += sg * (earCfg.spread ?? 0.5) * 0.55;
      dir.z -= earCfg.back ?? 0.08;
      dir.normalize();
      base = boneBase.clone();
      base.y += headSize * (earCfg.baseLift ?? 0.08);
      // Sit the ear base inside the skull so the flap grows out of the head.
      base.x += sg * headSize * (earCfg.baseOut ?? 0.06);
      base.z -= headSize * 0.06;
    }
    if (earCfg.dir) dir.set(earCfg.dir[0] * sg, earCfg.dir[1], earCfg.dir[2]).normalize();

    // The ear's face normal. Upright ears face forward; the elephant fan
    // faces sideways.
    const normalHint = sh.fan
      ? new THREE.Vector3(sg * 0.34, 0.05, 1)
      : new THREE.Vector3(sg * (earCfg.cupOut ?? 0.2), 0.02, 1);
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    );
    const yAx = dir.clone();
    const zAx = normalHint.clone().sub(yAx.clone().multiplyScalar(normalHint.dot(yAx))).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx).normalize();
    zAx.crossVectors(xAx, yAx).normalize();
    basis.makeBasis(xAx, yAx, zAx);
    const rot = new THREE.Euler().setFromRotationMatrix(basis).toArray();

    const thick = Math.max(earWidth * sh.thick * 0.5, 0.006);
    const steps = sh.profile.length;
    const colors = [];
    for (let i = 0; i < steps; i++) {
      const t0 = 0.06 + (i / (steps - 1)) * 0.9;
      const w = earWidth * 0.5 * sh.profile[i];
      const sliceLen = (earLen / (steps - 1)) * 0.78 + earLen * 0.08;
      const cup = (earCfg.cup ?? 0.12) * earLen * Math.sin(Math.PI * t0) * (sh.fan ? 1.4 : 0.5);
      const centre = base.clone().addScaledVector(dir, earLen * t0).addScaledVector(zAx, cup);
      // Slight back-curve near the tip keeps long ears from looking like rods.
      if (sh.blades && earCfg.curveBack) centre.addScaledVector(zAx, -earCfg.curveBack * earLen * t0 * t0);

      let col = earCfg.color ? C[earCfg.color] : C.base;
      if (earCfg.innerColor && i === 0) col = C[earCfg.innerColor];
      if (earCfg.tipColor && t0 > (earCfg.tipAt ?? 0.78)) col = C[earCfg.tipColor];
      colors.push(col);

      surface.ellipsoid(
        [centre.x, centre.y, centre.z],
        [w, sliceLen, thick * (1 - t0 * 0.25)],
        {
          color: col,
          bones,
          rot,
          sharp: 2.2,
          blend: blend * (sh.blades ? 0.78 : 0.82)
        }
      );
    }

    // Rounded tip.
    const tipCentre = base.clone().addScaledVector(dir, earLen * 1.01);
    const tipW = earWidth * 0.5 * sh.profile[steps - 1] * 0.9;
    surface.ellipsoid(
      [tipCentre.x, tipCentre.y, tipCentre.z],
      [tipW, earLen * 0.1, thick * 0.65],
      {
        color: earCfg.tipColor ? C[earCfg.tipColor] : (earCfg.color ? C[earCfg.color] : C.base),
        bones,
        rot,
        blend: blend * 0.5
      }
    );

    // Inner ear: a crisp lens sitting just proud of the front face. Painted
    // geometry made the whole ear pink; a separate lens reads as an ear.
    if (earCfg.inner !== false && !sh.fan) {
      const innerW = earWidth * (earCfg.innerWidth ?? 0.34);
      const innerL = earLen * (earCfg.innerLength ?? 0.3);
      const innerCentre = base.clone()
        .addScaledVector(dir, earLen * (earCfg.innerAt ?? 0.4))
        .addScaledVector(zAx, thick * 1.12);
      const lens = lensGeo(innerW, innerL, Math.max(thick * 0.34, 0.002), innerCentre, xAx, yAx, zAx);
      info.earDetails = info.earDetails || [];
      info.earDetails.push({
        geometry: lens,
        material: 'earInner',
        bones,
        power: 6
      });
    }
  }
}

/** A flattened ellipsoid oriented by an explicit basis, used for ear inners. */
function lensGeo(rx, ry, rz, centre, xAx, yAx, zAx) {
  const g = new THREE.SphereGeometry(1, 18, 12);
  g.scale(rx, ry, rz);
  const m = new THREE.Matrix4().makeBasis(xAx, yAx, zAx);
  m.setPosition(centre);
  g.applyMatrix4(m);
  g.computeVertexNormals();
  return g;
}

// ----------------------------------------------------------------- legs ----

function buildLegs(surface, t, cfg, C, blend, lift = 0) {
  const dims = t.dims;
  const style = cfg.legStyle || (cfg.hoof || dims.hoofed ? 'hoof' : 'paw');

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
      [p0.x, p0.y - L * 0.06, p0.z],
      r * (cfg.upperLegScale ?? 1.8),
      r * (cfg.midLegScale ?? 1.15),
      { color: C.base, bones: legBones, blend: blend * 1.35 }
    );
    // Shank down to the knee.
    surface.capsule(p0.toArray(), p1.toArray(), r * 1.02, r * 0.82, {
      color: C.base,
      bones: legBones,
      blend: blend * 0.9
    });

    if (style === 'hoof') {
      // Deer / antelope: a slim cannon and a cloven hoof with a dark point.
      surface.capsule(
        p1.toArray(),
        [p2.x, Math.max(p2.y + r * 0.5, r * 0.85), p2.z],
        r * (cfg.cannonScale ?? 0.72),
        r * (cfg.shinScale ?? 0.5),
        { color: C.sock, bones: [upper, lower], sharp: cfg.sockSharp ?? 3.8, blend: blend * 0.66 }
      );
      const hoofH = Math.max(r * 1.3, 0.016);
      for (const k of [-1, 1]) {
        surface.capsule(
          [p2.x + k * r * 0.28, hoofH * 0.92, p2.z + r * 0.05],
          [p2.x + k * r * 0.32, hoofH * 0.08, p2.z + r * 0.42],
          r * (cfg.hoofScale ?? 0.4),
          r * (cfg.hoofScale ?? 0.4) * 1.02,
          { color: C.hoof, bones: [lower, foot], sharp: 5.5, blend: blend * 0.36 }
        );
      }
    } else if (style === 'elephant') {
      // A column, then a flat round foot with a slight roll at the sole.
      surface.capsule(p1.toArray(), [p2.x, r * 0.72, p2.z], r * 0.94, r * 0.8, {
        color: C.sock, bones: [upper, lower], sharp: 2.8, blend: blend * 0.9
      });
      const footR = r * (cfg.footScale ?? 1.25);
      surface.ellipsoid(
        [p2.x, r * 0.33, p2.z + r * 0.1],
        [footR, r * 0.38, footR * 1.06],
        { color: C.paw, bones: [lower, foot], sharp: 3.2, blend: blend * 0.6 }
      );
      // Toenails: four small pale domes around the front of the foot.
      if (cfg.toenails !== false) {
        for (let k = -1.5; k <= 1.5; k += 1) {
          surface.ellipsoid(
            [p2.x + k * footR * 0.38, r * 0.18, p2.z + footR * 0.92],
            [footR * 0.15, r * 0.14, footR * 0.12],
            { color: C.ivory ?? 0xf0e6d4, bones: [foot], sharp: 6, blend: blend * 0.2 }
          );
        }
      }
    } else {
      // Ankle stays clear of the ground; the paw owns the contact.
      surface.capsule(
        p1.toArray(),
        [p2.x, Math.max(p2.y + r * 0.35, r * 0.55), p2.z],
        r * (cfg.cannonScale ?? 0.8),
        r * (cfg.shinScale ?? 0.58),
        { color: C.sock, bones: [upper, lower], sharp: cfg.sockSharp ?? 3.4, blend: blend * 0.7 }
      );
      const pawH = Math.max(r * (cfg.pawHeight ?? 0.58), 0.012);
      const pawZ = p2.z + r * (cfg.pawForward ?? 0.7);
      const pawW = r * (cfg.pawWidth ?? 1.4);
      const pawL = r * (cfg.pawLength ?? 1.8);
      surface.ellipsoid(
        [p2.x, pawH, pawZ],
        [pawW, pawH, pawL],
        { color: C.paw, bones: [lower, foot], sharp: cfg.pawSharp ?? 3.2, blend: blend * 0.6 }
      );
      // Heel: a soft pad behind the paw so it is not a floating egg.
      surface.ellipsoid(
        [p2.x, pawH * 0.9, pawZ - pawL * 0.52],
        [pawW * 0.74, pawH * 0.9, pawL * 0.42],
        { color: C.paw, bones: [lower, foot], sharp: 4, blend: blend * 0.45 }
      );
      // Toes: three to five small domes at the front of the paw.
      if (cfg.toes !== false) {
        const toeCount = cfg.toeCount ?? 3;
        const toeR = Math.max(r * (cfg.toeSize ?? 0.36), 0.007);
        for (let k = 0; k < toeCount; k++) {
          const u = toeCount === 1 ? 0 : k / (toeCount - 1) - 0.5;
          surface.ellipsoid(
            [p2.x + u * pawW * (cfg.toeSpread ?? 1.05), pawH * 0.72, pawZ + pawL * (cfg.toeForward ?? 0.5)],
            [toeR, pawH * 0.68, toeR * (cfg.toeLength ?? 1.45)],
            { color: C.paw, bones: [foot], sharp: 5.5, blend: blend * 0.3 }
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

  const root = new THREE.Vector3(head.x, head.y - headSize * 0.38, head.z + headSize * 0.78);
  // Let the trunk hang to just above the ground, then curl the tip forward.
  const tail = t2.clone().addScaledVector(dir, headSize * (tk.extend ?? 1.4));
  tail.y = Math.max(tail.y - headSize * (tk.curl ?? 0.4), headSize * 0.14);
  tail.z += headSize * (tk.curlFwd ?? 0.3);

  const mid = new THREE.Vector3().lerpVectors(t1, t2, 0.55);
  mid.y -= headSize * (tk.bend ?? 0.1);
  const low = new THREE.Vector3(tail.x, tail.y + headSize * 0.08, tail.z - headSize * 0.22);
  const pts = [root, t1, mid, t2, low, tail];
  const curve = new THREE.CatmullRomCurve3(pts);
  const radiiAt = (u) => {
    const rootR = headSize * (tk.rootScale ?? 0.5);
    const tipR = headSize * (tk.tipScale ?? 0.16);
    // A gentle bulge just below the face, then a long even taper: a trunk is
    // thick at the root and almost pencil-thin at the tip.
    return THREE.MathUtils.lerp(rootR, tipR, Math.pow(u, 0.82)) * (1 + 0.1 * Math.sin(Math.PI * u));
  };

  const bones = ['head', 'trunk1', 'trunk2'];
  const steps = 16;
  let prev = curve.getPointAt(0);
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const cur = curve.getPointAt(u);
    const rA = radiiAt((i - 1) / steps);
    const rB = radiiAt(u);
    surface.capsule(prev.toArray(), cur.toArray(), rA, rB, {
      color: C.base,
      bones,
      blend: blend * 0.82
    });
    prev = cur;
  }

  // Wrinkle bands: shallow painted rings, the detail that says "elephant".
  if (tk.wrinkles !== false) {
    for (let i = 1; i <= 4; i++) {
      const u = i / 5.2;
      const c = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);
      const rot = alignEuler(tangent);
      surface.ellipsoid(
        [c.x, c.y, c.z],
        [radiiAt(u) * 1.07, radiiAt(u) * 0.32, radiiAt(u) * 1.05],
        { color: C.accent, bones, rot, sharp: 5.5, blend: blend * 0.25, paint: 0.55 }
      );
    }
  }

  // Nostril hint and slightly darker tip.
  surface.ellipsoid(
    [tail.x, tail.y, tail.z + headSize * 0.05],
    [headSize * 0.1, headSize * 0.09, headSize * 0.08],
    { color: C.nose, bones: ['trunk2'], sharp: 5, blend: blend * 0.25 }
  );
  info.trunkTip = tail;
  info.trunkCurve = curve;

  // Small curved tusks are separate crisp details, not part of the skin.
  if (cfg.tusks) {
    info.tusks = [];
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      const base = new THREE.Vector3(
        head.x + sg * headSize * 0.32,
        head.y - headSize * 0.53,
        head.z + headSize * 0.62
      );
      const p1 = base.clone().add(new THREE.Vector3(sg * headSize * 0.06, -headSize * 0.3, headSize * 0.34));
      const p2 = p1.clone().add(new THREE.Vector3(sg * headSize * 0.05, -headSize * 0.14, headSize * 0.12));
      const g = tubeGeo([base.toArray(), p1.toArray(), p2.toArray()], headSize * 0.075, headSize * 0.018);
      info.tusks.push({ geometry: g, material: 'horn', bones: ['head', 'trunk1'], power: 7 });
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
    bush: (u) => 0.36 + 1.05 * Math.sin(Math.PI * Math.pow(u, 0.6)),
    plume: (u) => 0.45 + 0.8 * Math.sin(Math.PI * Math.pow(u, 0.8)),
    ringed: (u) => 0.58 + 0.62 * Math.sin(Math.PI * Math.pow(u, 0.75)),
    puff: () => 0.95,
    rudder: (u) => 0.95 - 0.4 * u,
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
    if (tailCfg.type === 'ringed') {
      // Alternating bands, with the paint falloff tight enough to read as
      // rings rather than a gradient.
      col = i % 2 === 0 ? (tailCfg.ringColor ? C[tailCfg.ringColor] : C.base) : (tailCfg.bandColor ? C[tailCfg.bandColor] : C.accent);
    } else if (tailCfg.tipColor && u > (tailCfg.tipAt ?? 0.55)) {
      col = C[tailCfg.tipColor];
    } else if (tailCfg.type === 'bush' || tailCfg.type === 'plume') {
      col = u > (tailCfg.tipAt ?? 0.62) ? C[tailCfg.tipColor || 'tailTip'] : C.base;
    }

    if (tailCfg.type === 'rudder') {
      // A flattened, muscular paddle: wide side-to-side, thin top-to-bottom.
      const mid = new THREE.Vector3().fromArray(chain[i]).lerp(new THREE.Vector3().fromArray(chain[i + 1]), 0.5);
      const segDir = new THREE.Vector3().fromArray(chain[i + 1]).sub(new THREE.Vector3().fromArray(chain[i]));
      const segLen = Math.max(segDir.length(), 1e-4);
      const rot = alignEuler(segDir);
      surface.ellipsoid(
        [mid.x, mid.y, mid.z],
        [radii[i] * (tailCfg.wide ?? 1.0), segLen * 0.8, radii[i] * (tailCfg.thin ?? 0.55)],
        { color: col, bones: bones, rot, sharp: 2.4, blend: blend * 0.95 }
      );
    } else {
      surface.capsule(chain[i], chain[i + 1], radii[i], radii[i + 1], {
        color: col,
        bones: i === 0 ? ['hips', ...bones] : bones,
        sharp: tailCfg.type === 'ringed' ? 7.5 : 2.6,
        blend: blend * (tailCfg.type === 'ringed' ? 0.55 : 1.0)
      });
    }
  }

  const end = new THREE.Vector3().fromArray(chain[n - 1]);
  const rEnd = radii[n - 1];

  if (tailCfg.type === 'puff') {
    surface.ellipsoid([end.x, end.y, end.z], [rEnd * 1.12, rEnd * 1.1, rEnd * 1.12], {
      color: tailCfg.tipColor ? C[tailCfg.tipColor] : C.belly,
      bones: [bones[bones.length - 1]],
      blend: blend * 0.8
    });
  } else if (tailCfg.type === 'bush' || tailCfg.type === 'plume') {
    // Brush: a soft cluster of lobes at the tip instead of a cut-off tube.
    const tipColor = tailCfg.tipColor ? C[tailCfg.tipColor] : C.tailTip;
    const lobes = tailCfg.type === 'bush' ? 4 : 2;
    for (let k = 0; k < lobes; k++) {
      const a = (k / lobes) * TAU;
      const off = new THREE.Vector3(Math.cos(a) * rEnd * 0.35, Math.sin(a) * rEnd * 0.25, Math.sin(a * 0.7) * rEnd * 0.2);
      surface.ellipsoid(
        [end.x + off.x, end.y + off.y, end.z + off.z - rEnd * 0.1],
        [rEnd * (tailCfg.type === 'bush' ? 0.72 : 0.56), rEnd * 0.7, rEnd * (tailCfg.type === 'bush' ? 0.95 : 0.72)],
        { color: tipColor, bones: [bones[bones.length - 1]], blend: blend * 0.7 }
      );
    }
  } else if (tailCfg.type === 'thin' && tailCfg.tipTuft) {
    // Lion / elephant: a thin rope with a dark tuft at the end.
    surface.ellipsoid(
      [end.x, end.y, end.z],
      [rEnd * (tailCfg.tuftScale ?? 2.2), rEnd * (tailCfg.tuftScale ?? 2.2), rEnd * 3.2],
      {
        color: C[tailCfg.tipColor || 'dark'],
        bones: [bones[bones.length - 1]],
        sharp: 2.4,
        blend: blend * 0.7
      }
    );
  } else if (tailCfg.type === 'rudder') {
    surface.ellipsoid([end.x, end.y, end.z], [rEnd * 0.72, rEnd * 0.3, rEnd * 1.15], {
      color: C[tailCfg.tipColor || 'base'],
      bones: [bones[bones.length - 1]],
      blend: blend * 0.5
    });
  } else {
    // Rounded end so the tail never terminates in a cut tube.
    surface.ellipsoid([end.x, end.y, end.z], [rEnd * 1.02, rEnd * 1.02, rEnd * 1.15], {
      color: C[tailCfg.tipColor || 'tailTip'],
      bones: [bones[bones.length - 1]],
      blend: blend * 0.8
    });
  }
}

// -------------------------------------------------------------- details ----

/** Eyes, nose, mouth line, whisker dots, hooves - crisp details snapped onto
 *  the sculpted skin so nothing floats. */
function buildMammalDetails(ctx, t, cfg, C, info, materials) {
  const parts = [];
  const head = t.joints.v('head');
  const headSize = t.dims.headSize;
  const eyeR = cfg.eyeSize ?? headSize * 0.16;
  const eyeDepth = cfg.eyeDepth ?? 0.72;

  for (const side of ['L', 'R']) {
    const s = sideSign(side);
    const bonePos = t.joints.v(`eye${side}`);
    const dir = new THREE.Vector3().subVectors(bonePos, head).normalize();
    const probe = new THREE.Vector3(bonePos.x, bonePos.y, bonePos.z).addScaledVector(dir, -eyeR * 0.2);
    const snap = snapToSurface(ctx.mesh, probe.toArray(), [dir.x, dir.y, dir.z], eyeR);
    // Sit most of the eyeball outside the surface. Embedding it by a third
    // turned every eye into a thin almond from the front.
    const centre = snap
      ? snap.point.clone().addScaledVector(snap.normal, eyeR * 0.38)
      : probe;

    parts.push({
      geometry: sphereGeo(eyeR, 18, 14).translate(centre.x, centre.y, centre.z),
      material: 'eye',
      bones: [`eye${side}`],
      power: 8
    });
    // Catchlight: the single detail that makes an eye feel alive.
    const shineR = eyeR * 0.3;
    const outNormal = snap ? snap.normal : dir;
    const shine = centre.clone()
      .addScaledVector(outNormal, eyeR * 0.72)
      .add(new THREE.Vector3(s * eyeR * 0.28, eyeR * 0.32, 0));
    parts.push({
      geometry: sphereGeo(shineR, 8, 6).translate(shine.x, shine.y, shine.z),
      material: 'shine',
      bones: [`eye${side}`],
      power: 8
    });
    // Upper lid rim: an optional thin fur-coloured crescent. It is opt-in
    // because a hemisphere over a big eye reads as a sleeping eye.
    if (cfg.eyelid) {
      const lidR = eyeR * 1.06;
      const lid = new THREE.SphereGeometry(lidR, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.36);
      lid.rotateX(Math.PI * 0.5 - 0.42);
      lid.translate(centre.x, centre.y + eyeR * 0.12, centre.z);
      parts.push({
        geometry: lid,
        material: 'skinLid',
        bones: [`eye${side}`],
        power: 8
      });
    }
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
    const nr = headSize * (cfg.noseSize ?? 0.14);
    const n = noseSnap.point.clone().addScaledVector(noseSnap.normal, -headSize * 0.02);
    const noseW = nr * (cfg.noseWidth ?? 1.25);
    parts.push({
      geometry: ellipsoidGeo(noseW, nr * (cfg.noseHeight ?? 0.78), nr * (cfg.noseDepth ?? 0.92), 16, 12)
        .translate(n.x, n.y, n.z),
      material: 'nose',
      bones: ['head'],
      power: 7
    });
    // Nostrils: two tiny dark dimples on the front of the nose pad.
    if (cfg.nostrils !== false) {
      for (const s of [-1, 1]) {
        parts.push({
          geometry: sphereGeo(nr * 0.16, 8, 6)
            .translate(n.x + s * nr * 0.36, n.y - nr * 0.08, n.z + nr * 0.72),
          material: 'dark',
          bones: ['head'],
          power: 8
        });
      }
    }
    if (cfg.mouth !== false) {
      // A drawn mouth line, not a second brown blob under the nose.
      const m0 = new THREE.Vector3(n.x - nr * 0.58, n.y - nr * 0.72, n.z + nr * 0.52);
      const m1 = new THREE.Vector3(n.x, n.y - nr * 0.92, n.z + nr * 0.62);
      const m2 = new THREE.Vector3(n.x + nr * 0.58, n.y - nr * 0.72, n.z + nr * 0.52);
      parts.push({
        geometry: tubeGeo([m0.toArray(), m1.toArray(), m2.toArray()], nr * 0.075, nr * 0.075),
        material: 'dark',
        bones: ['head'],
        power: 8
      });
      // Philtrum: the short vertical crease from the nose to the lip.
      if (cfg.philtrum !== false) {
        parts.push({
          geometry: tubeGeo(
            [
              [n.x, n.y - nr * 0.55, n.z + nr * 0.68],
              [n.x, n.y - nr * 0.82, n.z + nr * 0.66]
            ],
            nr * 0.055,
            nr * 0.055
          ),
          material: 'dark',
          bones: ['head'],
          power: 8
        });
      }
    }

    // Whisker dots / whisker pads for the semi-aquatic and rodent species.
    if (cfg.whiskerDots) {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const a = (i - 1) * 0.24;
          parts.push({
            geometry: sphereGeo(nr * 0.11, 6, 5).translate(
              n.x + s * nr * (1.15 + i * 0.16),
              n.y + nr * (0.06 + a),
              n.z + nr * (0.5 - i * 0.08)
            ),
            material: 'dark',
            bones: ['head'],
            power: 8
          });
        }
      }
    }
  }

  // Inner ears (built by buildEars): crisp, separate lenses.
  if (info.earDetails) {
    for (const ear of info.earDetails) parts.push(ear);
  }
  // Tusks (elephant).
  if (info.tusks) {
    for (const tusk of info.tusks) parts.push(tusk);
  }

  // Cloven hoof caps are already sculpted into the skin; only add a thin
  // darker toe seam where the two halves meet.
  if (cfg.hoof || t.dims.hoofed) {
    for (const leg of t.legDefs) {
      const foot = t.joints.v(`foot${leg.key}`);
      const r = t.dims.legRadius;
      parts.push({
        geometry: new THREE.BoxGeometry(r * 0.1, r * 0.5, r * 1.5)
          .translate(foot.x, r * 0.55, foot.z + r * 0.5),
        material: 'hoof',
        bones: [`foot${leg.key}`],
        power: 7
      });
    }
  }

  // Whiskers for the otter: three fine ivory threads each side. They are
  // static details skinned to the head, so they follow every animation.
  if (cfg.whiskers) {
    const nr = headSize * (cfg.noseSize ?? 0.14);
    const nosePoint = noseSnap ? noseSnap.point : tip;
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.22;
        const start = new THREE.Vector3(
          nosePoint.x + s * nr * 1.15,
          nosePoint.y + nr * (0.15 + a * 0.4),
          nosePoint.z + nr * 0.2
        );
        const end = start.clone().add(new THREE.Vector3(s * headSize * 0.62, Math.sin(a) * headSize * 0.12, headSize * 0.02));
        const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, headSize * 0.025, 0));
        parts.push({
          geometry: tubeGeo([start.toArray(), mid.toArray(), end.toArray()], headSize * 0.006, headSize * 0.0025),
          material: 'whisker',
          bones: ['head'],
          power: 8
        });
      }
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

  // --- torso: a pear/egg with a forward breast, not a sphere. Height profile
  //     from a smooth curve so the belly is widest low and the shoulders
  //     narrow towards the neck.
  const halfH = bodyR * stretch * 0.62;
  const bottom = -halfH;
  const top = halfH;
  const levels = 9;
  for (let i = 0; i <= levels; i++) {
    const u = i / levels;
    const y = hips.y + bottom + (top - bottom) * u;
    // egg profile: fat low-middle, tapering to the shoulders
    const r = bodyR * (0.48 + 0.52 * Math.sin(Math.PI * Math.pow(u, 0.68)));
    const zSwing = isWader
      ? bodyR * (0.1 - u * 0.18)
      : bodyR * (0.1 + Math.sin(Math.PI * u) * 0.12);
    surface.ellipsoid(
      [hips.x, y, hips.z + zSwing],
      [r, (top - bottom) * 0.28, r * (isWader ? 0.9 : 0.96) * bodyLen],
      { color: C.base, bones: ['hips', ...(t.neckChain.slice(0, 1) || [])], blend: blend * 2.2 }
    );
  }
  // Breast: the forward bulge a bird carries over its keel.
  surface.ellipsoid(
    [hips.x, hips.y + bottom * 0.05 + (top - bottom) * 0.2, hips.z + bodyR * 0.62 * bodyLen],
    [bodyR * 0.74, (top - bottom) * 0.3, bodyR * 0.42],
    { color: C.base, bones: ['hips'], blend: blend * 1.8 }
  );
  // Pale belly panel, painted, never a second mesh. It runs from the belly
  // up the breast, but only on the FRONT: a bigger lobe turned the whole
  // penguin white and hid its black back.
  surface.ellipsoid(
    [hips.x, hips.y + (isWader ? 0.0 : 0.01), hips.z + bodyR * 0.72 * bodyLen],
    [bodyR * (isWader ? 0.58 : 0.6), (top - bottom) * (isWader ? 0.32 : 0.4), bodyR * 0.38],
    { color: C.belly, bones: ['hips'], sharp: cfg.panelSharp ?? 2.6, paintOnly: true }
  );

  // --- neck chain up to the head ----------------------------------------
  const neckChain = [...t.neckChain, 'head'];
  let prev = new THREE.Vector3(hips.x, hips.y + shoulderLevel(top, bottom), hips.z);
  const neckBaseR = bodyR * (isWader ? 0.17 : 0.38);
  neckChain.forEach((name, i) => {
    const p = jn(name);
    const last = i === neckChain.length - 1;
    const r0 = i === 0 ? neckBaseR * 1.3 : neckBaseR * 1.0;
    const r1 = last ? dims.headSize * (isWader ? 0.55 : 0.72) : neckBaseR * (isWader ? 0.94 : 0.96);
    const boneList = i === 0 ? ['hips', neckChain[0]] : [neckChain[i - 1], name];
    surface.capsule(prev.toArray(), p.toArray(), r0, r1, {
      color: C.base,
      bones: boneList,
      blend: blend * 1.0
    });
    prev = p;
  });

  // White bib up the throat: the front face of the neck for penguins.
  if (!isWader) {
    const throatTop = new THREE.Vector3(jn('head').x, jn('head').y - dims.headSize * 0.55, jn('head').z + dims.headSize * 0.3);
    const throatBase = new THREE.Vector3(hips.x, hips.y + top * 0.5, hips.z + bodyR * 0.74);
    surface.capsule(throatBase.toArray(), throatTop.toArray(), bodyR * 0.28, bodyR * 0.2, {
      color: C.belly,
      bones: ['hips', ...neckChain, 'head'],
      sharp: 2.5,
      paintOnly: true
    });
  }

  // --- head ---------------------------------------------------------------
  const head = jn('head');
  const hs = dims.headSize;
  surface.ellipsoid(
    [head.x, head.y + hs * 0.08, head.z + hs * 0.08],
    [hs * 0.94, hs * 0.92, hs * 1.02],
    { color: C.base, bones: ['head', neckChain[neckChain.length - 2] || 'hips'], blend: blend * 1.1 }
  );
  // Cheeks and a flat forehead give the head a face.
  for (const side of ['L', 'R']) {
    const sg = sideSign(side);
    surface.ellipsoid(
      [head.x + sg * hs * 0.55, head.y + hs * 0.02, head.z + hs * 0.25],
      [hs * 0.36, hs * 0.44, hs * 0.5],
      { color: C.base, bones: ['head'], blend: blend * 0.9 }
    );
  }
  surface.ellipsoid(
    [head.x, head.y + hs * 0.36, head.z + hs * 0.18],
    [hs * 0.78, hs * 0.56, hs * 0.74],
    { color: C.base, bones: ['head'], blend: blend * 1.1 }
  );
  // White face/cheek patch around the eye for the penguin.
  if (!isWader && cfg.facePatch !== false) {
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      surface.ellipsoid(
        [head.x + sg * hs * 0.52, head.y + hs * 0.02, head.z + hs * 0.5],
        [hs * 0.18, hs * 0.22, hs * 0.16],
        { color: C.belly, bones: ['head'], sharp: 4.2, paintOnly: true }
      );
    }
  }
  // Warm ear/cheek patch (emperor penguin).
  if (!isWader && cfg.cheekPatch) {
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      surface.ellipsoid(
        [head.x + sg * hs * 0.68, head.y - hs * 0.18, head.z + hs * 0.06],
        [hs * 0.11, hs * 0.2, hs * 0.18],
        { color: C.accent, bones: ['head'], sharp: 5, blend: blend * 0.3 }
      );
    }
  }

  // --- flippers / folded wings ------------------------------------------
  if (t.wings) {
    for (const side of ['L', 'R']) {
      const sg = sideSign(side);
      const w = jn(`wing${side}`);
      if (isWader) {
        // Folded wings: shallow feather plates lying along the flanks. The
        // old version built two round lobes that turned the body into a ball.
        for (let i = 0; i < 2; i++) {
          const u = i;
          surface.ellipsoid(
            [w.x * 0.9, w.y - bodyR * (0.02 + u * 0.22), w.z - bodyR * (0.02 + u * 0.36)],
            [bodyR * 0.09, bodyR * (0.28 - u * 0.04), bodyR * (0.46 - u * 0.08)],
            {
              color: C.base,
              bones: [`wing${side}`, 'hips'],
              sharp: 2.2,
              blend: blend * 0.9
            }
          );
        }
        // Black flight feathers at the trailing edge of the wing.
        surface.ellipsoid(
          [w.x * 0.86, w.y - bodyR * 0.2, w.z - bodyR * 0.58],
          [bodyR * 0.07, bodyR * 0.16, bodyR * 0.24],
          { color: C.eye, bones: [`wing${side}`, 'hips'], sharp: 4.5, blend: blend * 0.35 }
        );
      } else {
        // Penguin flipper: a long flat blade from the shoulder down the side.
        for (let i = 0; i < 5; i++) {
          const u = i / 4;
          surface.ellipsoid(
            [
              w.x * (0.76 + u * 0.18),
              w.y - bodyR * (0.05 + u * 1.15),
              w.z - bodyR * (0.08 + u * 0.28)
            ],
            [bodyR * (0.1 - u * 0.03), bodyR * 0.3, bodyR * (0.26 - u * 0.08)],
            {
              color: C.base,
              bones: [`wing${side}`, 'hips'],
              rot: [0, 0, sg * 0.16],
              sharp: 1.8,
              blend: blend * 1.1
            }
          );
        }
        // Pale leading edge, so the flipper separates from the black body.
        surface.ellipsoid(
          [w.x * 0.82, w.y - bodyR * 0.55, w.z + bodyR * 0.1],
          [bodyR * 0.05, bodyR * 0.4, bodyR * 0.14],
          { color: C.belly, bones: [`wing${side}`, 'hips'], sharp: 5, blend: blend * 0.3 }
        );
      }
    }
  }

  // --- tail feathers -----------------------------------------------------
  if (cfg.tailFeathers !== false) {
    for (let i = -1; i <= 1; i++) {
      surface.ellipsoid(
        [hips.x + i * bodyR * 0.26, hips.y - halfH * 0.55, hips.z - bodyR * (0.95 + Math.abs(i) * 0.08)],
        [bodyR * 0.13, bodyR * 0.12, bodyR * (0.3 - Math.abs(i) * 0.04)],
        {
          color: isWader ? C.base : C.eye,
          bones: ['hips'],
          rot: [0.35, i * 0.18, 0],
          sharp: 4,
          blend: blend * 0.5
        }
      );
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
    const r = (dims.legRadius ?? bodyR * 0.2) * (cfg.legThickness ?? 1);
    // Thigh plug: reaches up inside the torso so the leg is part of the same
    // shell. Waders stand tall on stilts, so without this the legs would be
    // detached sticks floating under the body.
    const hipTop = new THREE.Vector3(p0.x, hips.y + bottom * 0.35, p0.z);
    surface.capsule(hipTop.toArray(), p0.toArray(), r * (isWader ? 1.35 : 1.5), r * 1.15, {
      color: C.base,
      bones: ['hips', upper],
      blend: blend * 1.5
    });
    surface.capsule(p0.toArray(), p1.toArray(), r * 1.15, r * 0.9, {
      color: C.base,
      bones: ['hips', upper, lower],
      blend: blend * 1.0
    });
    surface.capsule(p1.toArray(), [p2.x, Math.max(p2.y + r * 0.5, r * 0.8), p2.z], r * 0.9, r * 0.68, {
      color: C.sock, bones: [lower], sharp: 3.4, blend: blend * 0.7
    });
    // Foot: a flat sole with three forward toes.
    const soleH = Math.max(r * (isWader ? 0.4 : 0.6), 0.006);
    const footL = r * (dims.footLength ?? (isWader ? 1.9 : 2.4));
    const footW = r * (dims.footWidth ?? (isWader ? 1.3 : 1.7));
    surface.ellipsoid(
      [p2.x, soleH, p2.z + footL * 0.28],
      [footW, soleH, footL],
      { color: C.sock, bones: [lower, foot], sharp: 3.6, blend: blend * 0.6 }
    );
    for (let k = -1; k <= 1; k++) {
      surface.ellipsoid(
        [p2.x + k * footW * 0.55, soleH * 0.82, p2.z + footL * 0.7],
        [r * 0.38, soleH * 0.72, footL * 0.5],
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
  const len = headSize * (cfg.beakLength ?? (curved ? 2.2 : stubby ? 1.0 : 1.6));
  const rBase = headSize * (cfg.beakWidth ?? (curved ? 0.19 : 0.26));

  if (curved) {
    // Flamingo: a long filter beak that bends down, pale at the base and
    // black over the last third. Two tubes (upper/lower mandible) read as a
    // beak even at a distance.
    const upperPts = [];
    const lowerPts = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const drop = -Math.pow(u, 1.9) * headSize * 1.55;
      const z = beakBase.z + len * u * 0.92;
      const y = beakBase.y + drop;
      const r = rBase * (1 - u * 0.55);
      upperPts.push([beakBase.x, y + r * 0.35, z]);
      lowerPts.push([beakBase.x, y - r * 0.55, z]);
    }
    parts.push({ geometry: tubeGeo(upperPts, rBase, rBase * 0.42), material: 'beak', bones: ['head'], power: 7 });
    parts.push({ geometry: tubeGeo(lowerPts, rBase * 0.82, rBase * 0.32), material: 'beak', bones: ['head'], power: 7 });
    // Black tip.
    const tipStart = upperPts[Math.round(steps * 0.62)];
    const tipPts = [];
    for (let i = 0; i <= 3; i++) {
      const u = i / 3;
      const idx = 0.62 + u * 0.38;
      const drop = -Math.pow(idx, 1.9) * headSize * 1.55;
      tipPts.push([beakBase.x, beakBase.y + drop + rBase * 0.1, beakBase.z + len * idx * 0.92]);
    }
    parts.push({ geometry: tubeGeo(tipPts, rBase * 0.42, rBase * 0.2), material: 'dark', bones: ['head'], power: 7 });
  } else {
    // Penguin / generic: a short stout beak with a hooked upper mandible.
    const pts = [];
    const upper = [];
    const lower = [];
    for (let i = 0; i <= 4; i++) {
      const u = i / 4;
      const z = beakBase.z + len * u;
      const y = beakBase.y - u * u * headSize * (stubby ? 0.16 : 0.32);
      const r = rBase * (1 - u * 0.7);
      upper.push([beakBase.x, y + r * 0.3, z]);
      lower.push([beakBase.x, y - r * 0.45, z]);
      pts.push([beakBase.x, y, z]);
    }
    parts.push({ geometry: tubeGeo(upper, rBase * 0.9, rBase * 0.22), material: 'beak', bones: ['head'], power: 7 });
    parts.push({ geometry: tubeGeo(lower, rBase * 0.7, rBase * 0.18), material: 'beak', bones: ['head'], power: 7 });
    // The little hook at the tip: two overlapping spheres read as a curve.
    parts.push({
      geometry: sphereGeo(rBase * 0.22, 8, 6).translate(beakBase.x, beakBase.y - headSize * (stubby ? 0.14 : 0.28), beakBase.z + len),
      material: 'beak',
      bones: ['head'],
      power: 8
    });
  }

  const eyeR = cfg.eyeSize ?? headSize * 0.22;
  for (const side of ['L', 'R']) {
    const s = sideSign(side);
    const bonePos = t.joints.v(`eye${side}`);
    const dir = new THREE.Vector3().subVectors(bonePos, head).normalize();
    const snap = snapToSurface(ctx.mesh, bonePos.toArray(), [dir.x, dir.y, dir.z], eyeR);
    const centre = snap ? snap.point.clone().addScaledVector(snap.normal, eyeR * 0.38) : bonePos;
    parts.push({
      geometry: sphereGeo(eyeR, 16, 12).translate(centre.x, centre.y, centre.z),
      material: 'eye',
      bones: [`eye${side}`],
      power: 8
    });
    // Pale eye-ring: makes the eye sit in the face instead of floating.
    if (cfg.eyeRing !== false) {
      const ring = new THREE.SphereGeometry(eyeR * 1.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      ring.rotateX(Math.PI * 0.5 - 0.35);
      ring.translate(centre.x, centre.y + eyeR * 0.06, centre.z);
      parts.push({
        geometry: ring,
        material: 'skinLid',
        bones: [`eye${side}`],
        power: 8
      });
    }
    const outNormal = snap ? snap.normal : dir;
    const shine = centre.clone().addScaledVector(outNormal, eyeR * 0.7).add(new THREE.Vector3(s * eyeR * 0.28, eyeR * 0.32, 0));
    parts.push({
      geometry: sphereGeo(eyeR * 0.3, 8, 6).translate(shine.x, shine.y, shine.z),
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

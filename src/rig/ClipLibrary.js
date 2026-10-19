/**
 * ClipLibrary.js
 * Authors real skeletal animation clips (THREE.AnimationClip) for the zoo
 * animals: idle breathing, blinking support, walk/trot/run/hop/waddle/stride
 * locomotion, eating, being petted, playing, sleeping, alerting and a few
 * species specialities. Clips are sampled from smooth analytic curves so the
 * motion is organic, loop-perfect and cheap to store.
 *
 * Every clip animates the SAME set of bones (missing entries default to the
 * rest pose) which keeps AnimationMixer cross-fades free of stuck limbs.
 */

import * as THREE from 'three';

// --- tiny math helpers ------------------------------------------------------
const TAU = Math.PI * 2;
const frac = (t) => t - Math.floor(t);
const sin = (t) => Math.sin(t);
const cos = (t) => Math.cos(t);
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
/** pulse(t, centre, width): smooth 0..1..0 bump. */
const pulse = (t, centre, width) => {
  const d = Math.abs(frac(t - centre + 0.5) - 0.5) / width;
  return d >= 1 ? 0 : 0.5 - 0.5 * cos(Math.PI * (1 - d));
};
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
function quat(x, y, z) {
  _e.set(x, y, z);
  _q.setFromEuler(_e);
  return [_q.x, _q.y, _q.z, _q.w];
}

/**
 * Sample a looping clip from analytic pose functions.
 * @param {string} name
 * @param {number} duration seconds
 * @param {number} frames samples (>= 10)
 * @param {{rot?:Record<string,(t:number)=>number[]>, pos?:Record<string,(t:number)=>number[]>, scale?:Record<string,(t:number)=>number[]>}} fns
 */
export function sampledClip(name, duration, frames, fns) {
  const n = Math.max(10, Math.round(frames));
  const times = [];
  for (let i = 0; i <= n; i++) times.push((i / n) * duration);

  const tracks = [];
  const add = (map, suffix, pack) => {
    if (!map) return;
    for (const node of Object.keys(map)) {
      if (!node) continue;
      const fn = map[node];
      const values = [];
      for (let i = 0; i <= n; i++) {
        const v = fn(i / n);
        if (pack) values.push(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
        else values.push(...quat(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0));
      }
      tracks.push(
        pack
          ? new THREE.VectorKeyframeTrack(`${node}.${suffix}`, times, values)
          : new THREE.QuaternionKeyframeTrack(`${node}.${suffix}`, times, values)
      );
    }
  };
  add(fns.rot, 'quaternion', false);
  add(fns.pos, 'position', true);
  add(fns.scale, 'scale', true);

  const clip = new THREE.AnimationClip(name, duration, tracks);
  return clip;
}

/**
 * Fill a pose map so every bone the rig cares about gets a track.
 * `pose` supplies deltas; anything missing stays at rest.
 */
function fullPose(pose, profile, extraBones = []) {
  const out = { ...pose };
  const b = profile.bones;
  const ensure = (name) => {
    if (name && !out[name]) out[name] = () => [0, 0, 0];
  };
  (b.spine || []).forEach(ensure);
  if (typeof ensure === 'function') ensure(b.neck);
  ensure(b.head);
  (b.tail || []).forEach(ensure);
  (b.ears || []).forEach(ensure);
  (b.wings || []).forEach(ensure);
  (b.trunk || []).forEach(ensure);
  (b.neckChain || []).forEach(ensure);
  for (const key of Object.keys(b.legs || {})) {
    const leg = b.legs[key];
    ensure(leg.upper);
    ensure(leg.lower);
    ensure(leg.foot);
  }
  extraBones.forEach(ensure);
  return out;
}

/** Blink clip is intentionally NOT part of the state machine: eyelids are
 * driven directly by RiggedAnimal so breathing never fights the blink. */

// ---------------------------------------------------------------------------
//  LOCOMOTION
// ---------------------------------------------------------------------------

/** Phase offsets per gait, referenced to the REAR-LEFT foot. */
const GAIT_PHASE = {
  walk: { BL: 0.0, FL: 0.25, BR: 0.5, FR: 0.75 },   // lateral sequence
  trot: { FL: 0.0, BR: 0.0, FR: 0.5, BL: 0.5 },     // diagonal pairs
  pace: { FL: 0.0, BL: 0.0, FR: 0.5, BR: 0.5 },
  bound: { FL: 0.0, FR: 0.0, BL: 0.35, BR: 0.35 }
};

/**
 * Leg cycle: upper leg swings fore/aft, lower leg folds through the swing,
 * the foot counter-rotates so it lands flat and pushes off. Front legs fold
 * backwards, hind legs fold forwards — the way real quadrupeds move.
 */
function legPose(leg, p, amp, speedNorm = 1) {
  const swing = -amp.leg * cos(TAU * p);
  const foldWindow = pulse(p, 0.75, 0.42) * (0.55 + 0.45 * speedNorm);
  const fold = amp.knee * foldWindow * leg.foldSign;
  const push = amp.knee * 0.35 * pulse(p, 0.12, 0.3) * -leg.foldSign;
  const upper = swing + (leg.front ? -amp.leg * 0.04 : amp.leg * 0.06);
  const lower = fold + push + leg.restBend;
  const foot = -(upper + lower) * 0.55 + amp.knee * 0.28 * pulse(p, 0.06, 0.22) * -leg.foldSign;
  return {
    [leg.upper]: [upper, leg.splay * 0.35, leg.splay],
    [leg.lower]: [lower, 0, 0],
    [leg.foot]: [foot, 0, 0]
  };
}

function locomotionPose(profile, t, amp, gait, speedNorm = 1, phaseOverride = null) {
  const b = profile.bones;
  const phase = phaseOverride || GAIT_PHASE[gait] || GAIT_PHASE.trot;
  const pose = {};

  for (const key of Object.keys(b.legs)) {
    const leg = b.legs[key];
    const p = frac(t + (phase[key] ?? 0));
    Object.assign(pose, legPose(leg, p, amp, speedNorm));
  }

  const stride = TAU * (gait === 'walk' ? 1 : 1);
  const bob = amp.bob * (0.5 - 0.5 * cos(stride * 2 * t));
  const roll = amp.sway * sin(stride * t) * 0.6;
  const twist = amp.sway * sin(stride * t) * 0.5;

  const spine = b.spine || [];
  spine.forEach((name, i) => {
    const w = (i + 1) / spine.length;
    const pitch = -amp.pitch * (0.4 + 0.6 * w) + bob * 0.35;
    pose[name] = [pitch, twist * (0.6 - 0.4 * w), roll * (0.5 + 0.5 * w)];
  });

  if (b.neck) {
    pose[b.neck] = [amp.neck * 0.35 + amp.pitch * 0.35, -twist * 0.5, -roll * 0.4];
  }
  if (b.head) {
    pose[b.head] = [amp.head * 0.15 * sin(stride * 2 * t + 0.6) + amp.pitch * 0.4, -twist * 0.35, -roll * 0.3];
  }
  (b.ears || []).forEach((name, i) => {
    const dir = i === 0 ? 1 : -1;
    pose[name] = [amp.ear * (0.5 + 0.5 * sin(stride * 2 * t + 0.9)), amp.ear * 0.3 * dir, 0];
  });
  (b.tail || []).forEach((name, i) => {
    const lag = i * 0.09;
    const w = 0.6 + i * 0.5;
    pose[name] = [
      amp.tail * 0.25 + amp.tail * 0.15 * cos(stride * 2 * (t - lag)),
      amp.tail * sin(stride * (t - lag)) * w * 1.4,
      0
    ];
  });
  return { pose, rootBob: bob, rootRoll: roll };
}

export function locomotionClip(profile, name, duration, amp, gait, frames = 18, speedNorm = 1) {
  const { pose, rootBob, rootRoll } = locomotionPose(profile, 0, amp, gait, speedNorm);
  const rot = fullPose(
    Object.fromEntries(
      Object.entries(pose).map(([k, v]) => [k, () => v])
    ),
    profile
  );
  // Re-sample analytically (the static object above only seeded defaults).
  const rotFns = {};
  for (const bone of Object.keys(rot)) {
    rotFns[bone] = (t) => {
      const res = locomotionPose(profile, t, amp, gait, speedNorm);
      return res.pose[bone] ? res.pose[bone] : [0, 0, 0];
    };
  }
  const rootName = profile.bones.root || 'root';
  const pos = {
    [rootName]: (t) => {
      const res = locomotionPose(profile, t, amp, gait, speedNorm);
      return [0, res.rootBob * amp.lift, 0];
    }
  };
  return sampledClip(name, duration, frames, { rot: rotFns, pos });
}

/** Rabbit-style hop: crouch, explosive push, tucked flight, soft landing. */
export function hopClip(profile, name, duration, amp, frames = 16) {
  const b = profile.bones;
  const rotFns = {};
  const all = fullPose({}, profile);
  const body = (t) => {
    const flight = pulse(t, 0.55, 0.5);
    const crouch = pulse(t, 0.02, 0.22);
    const land = pulse(t, 0.88, 0.2);
    const pose = {};
    const spine = b.spine || [];
    spine.forEach((n, i) => {
      const w = 0.6 + i * 0.25;
      pose[n] = [-amp.pitch * (0.4 + crouch * 1.3) + flight * amp.pitch * 0.9 * w, 0, 0];
    });
    if (b.neck) pose[b.neck] = [amp.neck * 0.4 + crouch * 0.35 - flight * 0.55, 0, 0];
    if (b.head) pose[b.head] = [-crouch * 0.35 + flight * amp.head * 0.5 - land * 0.4, 0, 0];
    (b.ears || []).forEach((n, i) => {
      pose[n] = [-crouch * 0.3 - flight * (0.85 + 0.2 * sin(t * 9 + i)) + amp.ear * 0.2, 0, 0];
    });
    (b.tail || []).forEach((n, i) => {
      const lag = i * 0.1;
      pose[n] = [
        amp.tail * (0.5 - flight * 0.9) + 0.3 * cos(TAU * (t - lag)),
        0.25 * sin(TAU * (t - lag)) * amp.tail * 3,
        0
      ];
    });
    for (const key of Object.keys(b.legs)) {
      const leg = b.legs[key];
      const extend = leg.front ? pulse(t, 0.3, 0.3) : pulse(t, 0.18, 0.28);
      const tuck = pulse(t, 0.62, 0.34);
      const upper = leg.front
        ? -amp.leg * 0.5 - extend * amp.leg * 1.5 + tuck * amp.leg * 1.1
        : amp.leg * 0.4 + extend * amp.leg * 0.9 - tuck * amp.leg * 1.5;
      const lower = leg.restBend + (extend * amp.knee * 1.1 - tuck * amp.knee * 1.6) * leg.foldSign;
      pose[leg.upper] = [upper, leg.splay * 0.3, leg.splay];
      pose[leg.lower] = [lower, 0, 0];
      pose[leg.foot] = [-(upper + lower) * 0.5 + tuck * 0.5, 0, 0];
    }
    return pose;
  };

  for (const bone of Object.keys(all)) rotFns[bone] = (t) => body(t)[bone] || [0, 0, 0];
  const rootName = b.root || 'root';
  const pos = {
    [rootName]: (t) => {
      const air = Math.pow(Math.max(0, sin(Math.PI * clamp((t - 0.18) / 0.62, 0, 1))), 1.15);
      // The crouch is expressed by folding the legs and squashing the spine
      // (see the scale tracks below), NOT by pushing the root through the
      // floor: the root dip is capped to a small fraction of the hop height.
      const crouch = pulse(t, 0.02, 0.24) * amp.hopHeight * 0.3;
      return [0, air * amp.hopHeight - crouch, 0];
    }
  };
  const scale = {};
  (b.spine || []).forEach((n, i) => {
    scale[n] = (t) => {
      const squash = pulse(t, 0.06, 0.25) * 0.1 + pulse(t, 0.9, 0.2) * 0.08;
      const stretch = pulse(t, 0.32, 0.25) * 0.12;
      const s = 1 - squash + stretch;
      return [1 / Math.sqrt(s), s, 1 / Math.sqrt(s)];
    };
  });
  return sampledClip(name, duration, frames, { rot: rotFns, pos, scale });
}

/** Penguin waddle: heavy side-to-side roll with tiny shuffling steps. */
export function waddleClip(profile, name, duration, amp, frames = 16) {
  const b = profile.bones;
  const all = fullPose({}, profile);
  const rotFns = {};
  const body = (t) => {
    const pose = {};
    const roll = amp.sway * 1.6 * sin(TAU * t);
    const step = TAU * t;
    (b.spine || []).forEach((n, i) => {
      pose[n] = [amp.pitch * 0.2, roll * 0.25 * sin(step + i), roll * (0.7 + 0.3 * i)];
    });
    if (b.neck) pose[b.neck] = [-amp.neck * 0.15, -roll * 0.35, -roll * 0.5];
    if (b.head) pose[b.head] = [amp.head * 0.12 * sin(step * 2), -roll * 0.2, -roll * 0.3];
    (b.wings || []).forEach((n, i) => {
      const dir = i === 0 ? 1 : -1;
      pose[n] = [dir * (0.15 + 0.35 * Math.abs(sin(step))), 0, dir * (0.25 + 0.3 * sin(step + 1.2))];
    });
    for (const key of Object.keys(b.legs)) {
      const leg = b.legs[key];
      const p = frac(t + (key === 'FL' || key === 'BL' ? 0 : 0.5));
      const lift = Math.max(0, sin(TAU * p));
      const dir = key[1] === 'L' ? 1 : -1;
      const upper = -amp.leg * 1.1 * Math.max(0, cos(TAU * p)) * lift * 0.8;
      const lower = leg.restBend - amp.leg * 0.9 * lift;
      pose[leg.upper] = [upper, 0, dir * amp.sway * 0.4];
      pose[leg.lower] = [lower, 0, 0];
      pose[leg.foot] = [-(upper + lower) * 0.4 + lift * 0.35, 0, 0];
    }
    (b.tail || []).forEach((n, i) => {
      pose[n] = [amp.tail * 0.2, roll * 0.5, 0];
    });
    return pose;
  };
  for (const bone of Object.keys(all)) rotFns[bone] = (t) => body(t)[bone] || [0, 0, 0];
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, Math.abs(sin(TAU * t)) * amp.lift * 0.6, 0] }
  });
}

/** Flamingo stride: slow, deliberate, tall steps with an S-curve neck. */
export function strideClip(profile, name, duration, amp, frames = 18) {
  const b = profile.bones;
  const all = fullPose({}, profile);
  const rotFns = {};
  const body = (t) => {
    const pose = {};
    const sway = sin(TAU * t);
    (b.spine || []).forEach((n, i) => {
      pose[n] = [amp.pitch * 0.15, -sway * 0.12, sway * (0.18 + 0.06 * i)];
    });
    const neck = b.neckChain || (b.neck ? [b.neck] : []);
    neck.forEach((n, i) => {
      const w = i / Math.max(1, neck.length - 1);
      pose[n] = [amp.neck * 0.3 * (1 - w * 0.6) + 0.06 * cos(TAU * t + w * 1.5), -sway * 0.25, -sway * 0.3];
    });
    if (b.head) pose[b.head] = [amp.head * 0.2 * sin(TAU * t + 0.5), -sway * 0.3, -sway * 0.25];
    for (const key of Object.keys(b.legs)) {
      const leg = b.legs[key];
      const p = frac(t + (key === 'FL' || key === 'BL' ? 0 : 0.5));
      const lift = Math.max(0, sin(TAU * p));
      const upper = -amp.leg * 1.5 * Math.max(0, cos(TAU * p)) * (0.35 + 0.65 * lift);
      const lower = leg.restBend - amp.knee * 2.4 * lift;
      pose[leg.upper] = [upper, 0, 0];
      pose[leg.lower] = [lower, 0, 0];
      pose[leg.foot] = [-(upper + lower) * 0.5 - lift * 0.5, 0, 0];
    }
    (b.wings || []).forEach((n, i) => {
      const dir = i === 0 ? 1 : -1;
      pose[n] = [0.1, 0, dir * (0.2 + 0.12 * sin(TAU * t + 0.8))];
    });
    return pose;
  };
  for (const bone of Object.keys(all)) rotFns[bone] = (t) => body(t)[bone] || [0, 0, 0];
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, Math.abs(sin(TAU * t)) * amp.lift * 0.5, 0] }
  });
}

// ---------------------------------------------------------------------------
//  BEHAVIOURS
// ---------------------------------------------------------------------------

function basePose(profile) {
  return fullPose({}, profile);
}

/** Idle: breathing, weight shift, curious look-around, tail sway, ear twitch. */
export function idleClip(profile, name, duration = 6, amp, frames = 26) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const br = sin(TAU * t);
      const look = sin(TAU * 0.5 * t) * 0.7 + sin(TAU * 0.23 * t + 1.2) * 0.3;
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        const w = (i + 1) / (b.spine.length + 1);
        pose[n] = [amp.pitch * 0.25 * br * w, look * 0.06 * w, amp.sway * 0.3 * sin(TAU * 0.19 * t) * (0.4 + w)];
      });
      if (b.neck) pose[b.neck] = [-amp.neck * 0.1 * br + amp.neck * 0.06 * sin(TAU * 0.31 * t), -look * 0.2, -amp.sway * 0.1 * sin(TAU * 0.19 * t)];
      if (b.head) {
        pose[b.head] = [
          amp.head * (0.1 * sin(TAU * 0.4 * t + 0.7) - 0.05 * br),
          look * 0.42,
          amp.head * 0.08 * sin(TAU * 0.26 * t)
        ];
      }
      (b.ears || []).forEach((n, i) => {
        const dir = i === 0 ? 1 : -1;
        const twitch = Math.pow(Math.max(0, sin(TAU * 0.5 * t + i * 2.1)), 14);
        pose[n] = [amp.ear * (0.12 * br + twitch * 0.8), dir * twitch * 0.25, dir * amp.ear * 0.1];
      });
      (b.tail || []).forEach((n, i) => {
        const lag = i * 0.12;
        const w = 0.5 + i * 0.45;
        pose[n] = [
          amp.tail * 0.3 + amp.tail * 0.12 * sin(TAU * 0.21 * (t - lag)),
          amp.tail * 1.5 * sin(TAU * 0.35 * (t - lag)) * w,
          0
        ];
      });
      (b.neckChain || []).forEach((n, i) => {
        pose[n] = [amp.neck * 0.12 * sin(TAU * 0.4 * t + i * 0.5), look * 0.12, 0];
      });
      (b.trunk || []).forEach((n, i) => {
        pose[n] = [amp.neck * 0.3 + amp.neck * 0.25 * sin(TAU * 0.4 * t + i * 0.9), amp.neck * 0.3 * sin(TAU * 0.33 * t + i * 1.4), 0];
      });
      (b.wings || []).forEach((n, i) => {
        const dir = i === 0 ? 1 : -1;
        pose[n] = [0, 0, dir * (0.12 + 0.06 * sin(TAU * 0.3 * t + i))];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        const shift = sin(TAU * 0.19 * t + (key[1] === 'L' ? 0 : Math.PI));
        pose[leg.upper] = [amp.leg * 0.02 * br, leg.splay * 0.3, leg.splay + shift * 0.02];
        pose[leg.lower] = [leg.restBend + amp.knee * 0.02 * br, 0, 0];
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  const scale = {};
  (b.spine || []).forEach((n) => {
    scale[n] = (t) => {
      const br = sin(TAU * t);
      const s = 1 + 0.012 * br;
      return [1 + 0.006 * br, s, 1 + 0.006 * br];
    };
  });
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, 0.012 * sin(TAU * t) * amp.lift, 0] },
    scale
  });
}

/** Eat: lower the neck to the ground and chew happily. */
export function eatClip(profile, name, duration = 2.2, amp, frames = 18) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const chew = sin(TAU * 4.5 * t);
      const settle = smooth(clamp(t / 0.25, 0, 1));
      const down = -amp.eatNeck * settle;
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        const w = (i + 1) / (b.spine.length + 1);
        pose[n] = [down * 0.35 * w, 0, 0];
      });
      if (b.neck) pose[b.neck] = [down, 0, 0];
      (b.neckChain || []).forEach((n, i) => {
        pose[n] = [down * (0.5 + 0.3 * i), 0.05 * chew * 0.3, 0];
      });
      if (b.head) pose[b.head] = [0.35 * chew * 0.35 + down * 0.1, 0.06 * sin(TAU * 1.2 * t), 0];
      (b.ears || []).forEach((n) => {
        pose[n] = [amp.ear * 0.2 * chew, 0, 0];
      });
      (b.tail || []).forEach((n, i) => {
        const lag = i * 0.1;
        pose[n] = [amp.tail * 0.2, amp.tail * 2.4 * sin(TAU * 1.6 * (t - lag)), 0];
      });
      // Trunk (elephant): a small reach towards the food, then a curl up.
      // Deliberately gentle - the trunk is long, so even a small rotation
      // sweeps the tip a long way and would otherwise touch the floor.
      (b.trunk || []).forEach((n, i) => {
        const reach = smooth(clamp(t / 0.3, 0, 1)) * (1 - smooth(clamp((t - 0.65) / 0.35, 0, 1)));
        pose[n] = [amp.eatNeck * 0.25 * reach + 0.1 * chew * settle * (1 + i * 0.4), 0, 0];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        pose[leg.upper] = [amp.leg * (leg.front ? 0.05 : -0.05), 0, leg.splay];
        pose[leg.lower] = [leg.restBend, 0, 0];
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, -0.02 * smooth(clamp(t / 0.25, 0, 1)), 0] }
  });
}

/** Pet: look up at the visitor, lean into the hand, joyful wiggle. */
export function petClip(profile, name, duration = 2.8, amp, frames = 20) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const raise = pulse(t, 0.35, 0.45);
      const wiggle = sin(TAU * 3.2 * t) * pulse(t, 0.55, 0.5);
      const nuzzle = sin(TAU * 1.6 * t);
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        const w = 0.5 + 0.5 * ((i + 1) / (b.spine.length + 1));
        pose[n] = [-amp.pitch * 0.25 * raise * w, wiggle * 0.12 * w, -wiggle * 0.1 * w];
      });
      if (b.neck) pose[b.neck] = [amp.neck * 0.9 * raise, wiggle * 0.2, nuzzle * 0.12];
      (b.neckChain || []).forEach((n, i) => {
        pose[n] = [amp.neck * 0.6 * raise, wiggle * 0.15, 0];
      });
      if (b.head) {
        pose[b.head] = [
          -amp.head * 0.45 * raise + nuzzle * 0.06,
          wiggle * 0.35 + nuzzle * 0.15,
          -nuzzle * 0.22
        ];
      }
      (b.ears || []).forEach((n, i) => {
        const dir = i === 0 ? 1 : -1;
        pose[n] = [-amp.ear * (0.5 * raise) + amp.ear * 0.1 * wiggle, dir * 0.2 * raise, dir * 0.15 * raise];
      });
      (b.tail || []).forEach((n, i) => {
        const lag = i * 0.08;
        const w = 0.6 + i * 0.5;
        pose[n] = [amp.tail * 0.4, amp.tail * 3.6 * sin(TAU * 3.4 * (t - lag)) * w * raise, 0];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        pose[leg.upper] = [amp.leg * 0.05 * raise, 0, leg.splay];
        pose[leg.lower] = [leg.restBend - amp.knee * 0.12 * raise, 0, 0];
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: {
      [rootName]: (t) => {
        const bounce = Math.abs(sin(TAU * 3.2 * t)) * pulse(t, 0.55, 0.5) * 0.18 * amp.lift;
        return [0, bounce, 0];
      }
    }
  });
}

/** Play: play-bow, pounce forward, bouncy excitement. */
export function playClip(profile, name, duration = 2.6, amp, frames = 20) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const bow = pulse(t, 0.2, 0.35);
      const jump = Math.max(0, sin(TAU * (t - 0.45)));
      const wag = sin(TAU * 4 * t);
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        const w = 0.4 + 0.6 * ((i + 1) / (b.spine.length + 1));
        pose[n] = [-amp.pitch * (bow * 1.2) + jump * amp.pitch * 0.5 * w, wag * 0.06, 0];
      });
      if (b.neck) pose[b.neck] = [amp.neck * (0.6 * bow - 0.3 * jump), wag * 0.1, 0];
      (b.neckChain || []).forEach((n) => {
        pose[n] = [amp.neck * (0.5 * bow - 0.25 * jump), wag * 0.08, 0];
      });
      if (b.head) pose[b.head] = [-amp.head * (0.5 * bow) + jump * amp.head * 0.3, wag * 0.25, wag * 0.1];
      (b.ears || []).forEach((n, i) => {
        const dir = i === 0 ? 1 : -1;
        pose[n] = [-amp.ear * 0.6 * bow + amp.ear * 0.2 * jump, dir * 0.15, dir * 0.2];
      });
      (b.tail || []).forEach((n, i) => {
        const lag = i * 0.07;
        const w = 0.7 + i * 0.5;
        pose[n] = [amp.tail * (0.3 + 0.5 * jump), amp.tail * 4 * sin(TAU * 4 * (t - lag)) * w, 0];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        if (leg.front) {
          const drop = bow * 1.5;
          pose[leg.upper] = [-amp.leg * drop, 0, leg.splay * (1 + bow)];
          pose[leg.lower] = [leg.restBend + amp.knee * drop * 0.9, 0, 0];
        } else {
          pose[leg.upper] = [amp.leg * (0.4 * bow - 0.5 * jump), 0, leg.splay];
          pose[leg.lower] = [leg.restBend - amp.knee * (0.3 * bow + 0.6 * jump), 0, 0];
        }
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: {
      [rootName]: (t) => {
        const jump = Math.max(0, sin(TAU * (t - 0.45)));
        const bow = pulse(t, 0.2, 0.35);
        return [0, (jump * 0.5 - bow * 0.12) * amp.lift, 0];
      }
    }
  });
}

/** Sleep: curled up, slow deep breathing, tail tucked. */
export function sleepClip(profile, name, duration = 6.5, amp, frames = 20) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const breath = sin(TAU * 0.16 * t * 4);
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        const w = (i + 1) / (b.spine.length + 1);
        pose[n] = [amp.pitch * 0.5 * w + breath * 0.05, 0.25 * w, 0];
      });
      if (b.neck) pose[b.neck] = [-amp.eatNeck * 1.05, 0.5, 0.25];
      (b.neckChain || []).forEach((n) => {
        pose[n] = [-amp.eatNeck * 0.5, 0.3, 0.2];
      });
      if (b.head) pose[b.head] = [-amp.head * 0.9 + breath * 0.03, 0.55, 0.2];
      (b.ears || []).forEach((n, i) => {
        pose[n] = [amp.ear * 1.2, (i === 0 ? 1 : -1) * 0.3, 0];
      });
      (b.tail || []).forEach((n, i) => {
        pose[n] = [amp.tail * (0.6 + i * 0.4), amp.tail * (0.8 - i * 0.2), 0];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        if (leg.front) {
          pose[leg.upper] = [-amp.leg * 1.3, 0, leg.splay * 2.6];
          pose[leg.lower] = [leg.restBend + amp.knee * 0.4, 0, 0];
        } else {
          pose[leg.upper] = [amp.leg * 1.2, 0, leg.splay * 2.2];
          pose[leg.lower] = [leg.restBend - amp.knee * 0.9, 0, 0];
        }
        pose[leg.foot] = [0, 0, 0];
      }
      (b.trunk || []).forEach((n, i) => {
        pose[n] = [-amp.eatNeck * 0.6, 0, amp.neck * 0.4];
      });
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  const scale = {};
  (b.spine || []).forEach((n) => {
    scale[n] = (t) => {
      const s = 1 + 0.02 * sin(TAU * 0.16 * t * 4);
      return [1 + 0.01, s, 1 + 0.01];
    };
  });
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, amp.sleepDrop, 0] },
    scale
  });
}

/** Alert: head snaps up, ears forward, body freezes. One-shot. */
export function alertClip(profile, name, duration = 1.4, amp, frames = 14) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const up = pulse(t, 0.25, 0.7);
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        pose[n] = [-amp.pitch * 0.3 * up, 0, 0];
      });
      if (b.neck) pose[b.neck] = [amp.neck * 0.6 * up, 0.15 * up, 0];
      if (b.head) pose[b.head] = [-amp.head * 0.3 * up, 0.2 * up * sin(TAU * 1.5 * t), 0];
      (b.ears || []).forEach((n, i) => {
        pose[n] = [-amp.ear * 1.1 * up, (i === 0 ? 1 : -1) * 0.2 * up, 0];
      });
      (b.tail || []).forEach((n, i) => {
        pose[n] = [amp.tail * 0.8 * up, amp.tail * 0.6 * sin(TAU * 2 * t), 0];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        pose[leg.upper] = [0, 0, leg.splay];
        pose[leg.lower] = [leg.restBend - amp.knee * 0.1 * up, 0, 0];
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  return sampledClip(name, duration, frames, { rot: rotFns });
}

/** Elephant water play: trunk lifts, curls and sprays. */
export function sprayClip(profile, name, duration = 3.2, amp, frames = 20) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const lift = pulse(t, 0.3, 0.5);
      const spray = pulse(t, 0.6, 0.45);
      const pose = {};
      (b.spine || []).forEach((n, i) => {
        pose[n] = [-amp.pitch * 0.3 * lift, 0, 0];
      });
      if (b.neck) pose[b.neck] = [amp.neck * 0.5 * lift, 0, 0];
      if (b.head) pose[b.head] = [-amp.head * 0.4 * lift + spray * 0.3, 0, 0];
      (b.trunk || []).forEach((n, i) => {
        pose[n] = [amp.neck * (1.6 * lift - 1.1 * spray), 0.15 * sin(TAU * t + i), amp.neck * (0.5 * lift + 0.5 * spray)];
      });
      (b.ears || []).forEach((n, i) => {
        const dir = i === 0 ? 1 : -1;
        pose[n] = [0, 0, dir * (0.3 + 0.4 * lift + 0.2 * sin(TAU * 3 * t))];
      });
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        const shift = sin(TAU * 0.5 * t + (key[1] === 'L' ? 0 : Math.PI));
        pose[leg.upper] = [amp.leg * 0.15 * lift, 0, leg.splay + shift * 0.05];
        pose[leg.lower] = [leg.restBend, 0, 0];
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, 0.05 * pulse(t, 0.3, 0.5) * amp.lift, 0] }
  });
}

/** Wing flap / fin flutter, used by birds for play and reactions. */
export function flapClip(profile, name, duration = 1.6, amp, frames = 14) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  for (const bone of Object.keys(all)) {
    rotFns[bone] = (t) => {
      const flap = sin(TAU * 2.5 * t);
      const pose = {};
      (b.wings || []).forEach((n, i) => {
        const dir = i === 0 ? 1 : -1;
        pose[n] = [flap * 0.15 * dir, 0, dir * (0.3 + flap * 1.1 * amp.wing)];
      });
      (b.spine || []).forEach((n) => {
        pose[n] = [-amp.pitch * 0.2 * Math.abs(flap), 0, 0];
      });
      if (b.neck) pose[b.neck] = [amp.neck * 0.4, 0, 0];
      if (b.head) pose[b.head] = [-amp.head * 0.3 + flap * 0.05, 0, 0];
      for (const key of Object.keys(b.legs)) {
        const leg = b.legs[key];
        pose[leg.upper] = [0, 0, leg.splay];
        pose[leg.lower] = [leg.restBend - 0.1 * Math.abs(flap), 0, 0];
        pose[leg.foot] = [0, 0, 0];
      }
      return pose[bone] || [0, 0, 0];
    };
  }
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    pos: { [rootName]: (t) => [0, Math.abs(sin(TAU * 2.5 * t)) * 0.06 * amp.lift, 0] }
  });
}

/** Swim: a paddling cycle - the spine ripples, the legs scull in diagonal
 *  pairs and the tail sweeps side to side. Used by the semi-aquatic species
 *  in place of the walk cycle, so they are never just translated through the
 *  water with a land gait. */
export function swimClip(profile, name, duration = 1.5, amp, frames = 16) {
  const b = profile.bones;
  const all = basePose(profile);
  const rotFns = {};
  const body = (t) => {
    const pose = {};
    const wave = sin(TAU * t);
    (b.spine || []).forEach((n, i) => {
      const w = (i + 1) / ((b.spine.length || 1) + 1);
      pose[n] = [
        amp.pitch * 0.25 + 0.07 * wave * w,
        0.07 * wave * w,
        0.05 * sin(TAU * t + w * 1.3)
      ];
    });
    // Head and neck held clear of the water.
    if (b.neck) pose[b.neck] = [amp.neck * 0.55, 0.06 * wave, 0];
    if (b.head) pose[b.head] = [-amp.head * 0.25, 0.09 * wave, 0.05 * wave];
    (b.neckChain || []).forEach((n) => {
      pose[n] = [amp.neck * 0.4, 0.04 * wave, 0];
    });
    // Paddling limbs: diagonal pairs, small smooth circles.
    for (const key of Object.keys(b.legs)) {
      const leg = b.legs[key];
      const phase = (key === 'FL' || key === 'BR') ? 0 : 0.5;
      const p = frac(t + phase);
      const paddle = sin(TAU * p);
      const upper = (leg.front ? 1 : -1) * amp.leg * 0.5 * paddle;
      const lower = leg.restBend + amp.knee * 0.45 * (0.5 + 0.5 * paddle) * leg.foldSign;
      pose[leg.upper] = [upper, 0, leg.splay * 1.6];
      pose[leg.lower] = [lower, 0, 0];
      pose[leg.foot] = [-lower * 0.6, 0, 0];
    }
    // Tail sculls, with the tip lagging the body.
    (b.tail || []).forEach((n, i) => {
      const lag = i * 0.12;
      pose[n] = [
        amp.tail * 0.35,
        amp.tail * 2.4 * sin(TAU * (t - lag)) * (0.6 + i * 0.5),
        0
      ];
    });
    // Flippers row.
    (b.wings || []).forEach((n, i) => {
      const dir = i === 0 ? 1 : -1;
      pose[n] = [amp.wing * 0.2 * sin(TAU * t + i), 0, dir * (0.25 + 0.35 * sin(TAU * t))];
    });
    return pose;
  };
  for (const bone of Object.keys(all)) rotFns[bone] = (t) => body(t)[bone] || [0, 0, 0];
  const rootName = b.root || 'root';
  return sampledClip(name, duration, frames, {
    rot: rotFns,
    // Gentle surge in time with the paddle strokes; never sinks.
    pos: { [rootName]: (t) => [0, Math.abs(sin(TAU * t)) * 0.012 * amp.lift, 0] }
  });
}

/**
 * Build the standard clip set for a species profile.
 * @param {object} profile see RiggedAnimal for the shape
 * @param {{extras?:string[], walkDuration?:number, runDuration?:number}} options
 */
export function buildClipSet(profile, options = {}) {
  const amp = profile.amp;
  const clips = [];
  const gait = profile.gait || 'trot';
  const walkDur = options.walkDuration ?? 0.95;
  const runDur = options.runDuration ?? 0.62;

  clips.push(idleClip(profile, 'Idle', options.idleDuration ?? 6.0, amp, 14));

  if (gait === 'hop') {
    clips.push(hopClip(profile, 'Walk', walkDur, amp, 11));
    clips.push(hopClip(profile, 'Run', runDur, { ...amp, hopHeight: amp.hopHeight * 1.5 }, 10));
  } else if (gait === 'waddle') {
    clips.push(waddleClip(profile, 'Walk', walkDur, amp, 11));
    clips.push(waddleClip(profile, 'Run', runDur, { ...amp, sway: amp.sway * 1.4 }, 10));
  } else if (gait === 'stride') {
    clips.push(strideClip(profile, 'Walk', walkDur * 1.5, amp, 12));
    clips.push(strideClip(profile, 'Run', runDur * 1.4, { ...amp, leg: amp.leg * 1.3 }, 11));
  } else {
    const walkAmp = { ...amp };
    const runAmp = { ...amp, leg: amp.leg * 1.5, knee: amp.knee * 1.4, bob: amp.bob * 1.6, lift: amp.lift * 1.4, pitch: amp.pitch * 1.4 };
    clips.push(locomotionClip(profile, 'Walk', walkDur, walkAmp, gait === 'trot' ? 'trot' : 'walk', 12, 0.7));
    clips.push(locomotionClip(profile, 'Run', runDur, runAmp, gait === 'trot' ? 'trot' : 'walk', 11, 1));
  }

  clips.push(eatClip(profile, 'Eat', 2.2, amp, 11));
  clips.push(petClip(profile, 'Pet', 2.8, amp, 12));
  clips.push(playClip(profile, 'Play', 2.6, amp, 12));
  clips.push(sleepClip(profile, 'Sleep', 6.5, amp, 11));
  clips.push(alertClip(profile, 'React', 1.4, amp, 9));

  for (const extra of options.extras || []) {
    if (extra === 'Spray') clips.push(sprayClip(profile, 'Spray', 3.2, amp, 12));
    if (extra === 'Flap') clips.push(flapClip(profile, 'Flap', 1.6, amp, 10));
    if (extra === 'Swim') clips.push(swimClip(profile, 'Swim', 1.5, amp, 14));
  }

  // Guarantee a root position track on every clip. The runtime grounds each
  // clip by offsetting exactly this track, and a track added after the
  // AnimationAction was created is silently ignored - so it must exist here,
  // before any mixer is built.
  const rootName = profile.bones.root || 'root';
  for (const clip of clips) {
    const name = `${rootName}.position`;
    if (!clip.tracks.some((t) => t.name === name)) {
      clip.tracks.push(new THREE.VectorKeyframeTrack(name, [0, clip.duration], [0, 0, 0, 0, 0, 0]));
    }
  }
  return clips;
}

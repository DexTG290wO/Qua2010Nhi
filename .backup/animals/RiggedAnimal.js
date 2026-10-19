/**
 * RiggedAnimal.js
 * The runtime for every zoo animal. It owns:
 *   - a real skinned rig (built procedurally, or swapped for a loaded .glb),
 *   - a skeletal AnimationMixer driven by authored clips (see ClipLibrary),
 *   - an autonomous behaviour state machine (idle / wander / run / sleep / graze),
 *   - reaction states triggered by the player (pet / feed / play / react / special),
 *   - terrain-aware movement that never floats, sinks or walks into a lake,
 *   - LOD so distant animals cost far less,
 *   - a hover ring + name label + hand-drawn emotion bubble,
 *   - cartoon blinking via eyeball bone squash.
 *
 * Species subclasses only describe how the animal is built and how it behaves;
 * all of the scheduling, blending and movement logic lives here once.
 */

import * as THREE from 'three';
import { RigBuilder, makeAnimalMaterials } from '../rig/RigBuilder.js';
import { buildClipSet } from '../rig/ClipLibrary.js';
import { getGroundHeight, getWaterDepth, nearestShore, ZONES, WATER_BODIES } from '../environment/terrainHeight.js';

const REACTION_STATES = new Set(['pet', 'eat', 'play', 'react', 'special']);
/** Height of every water surface in the zoo. */
const WATER_LEVEL = WATER_BODIES[0].level;
/** Distance thresholds for the three level-of-detail tiers. */
const LOD_MEDIUM = 48;
const LOD_FAR = 95;
/** Mixer sampling interval (seconds) per LOD level: near, medium, far. */
const LOD_STEP = [0, 1 / 30, 1 / 14];

export class RiggedAnimal {
  constructor(scene, config = {}) {
    this.scene = scene;
    this.config = config;

    // --- Identity ---------------------------------------------------------
    this.id = config.id || 'animal';
    this.name = config.name || 'Bé Động Vật';
    this.species = config.species || 'Động vật';
    this.title = config.title || 'Người bạn đáng yêu';
    this.description = config.description || 'Rất thích được vui chơi và ngắm cảnh.';
    this.funFacts = config.funFacts || [];
    this.favoriteFood = config.favoriteFood || 'carrot';
    this.favoriteFoodName = config.favoriteFoodName || 'Cà Rốt Giòn';
    this.homeZone = config.homeZone || 'flower_meadow';
    this.emojiBadge = config.emojiBadge || 'animal';

    // --- Movement ---------------------------------------------------------
    this.homePosition = (config.position ? config.position.clone() : new THREE.Vector3());
    {
      // Semi-aquatic species start already at their float line, and waders
      // (the flamingo) stand in the shallows rather than on the pond bed.
      const gx = this.homePosition.x;
      const gz = this.homePosition.z;
      const ground = getGroundHeight(gx, gz);
      const depth = getWaterDepth(gx, gz);
      const floatDepth = config.floatDepth ?? 0.34;
      const wade = config.wadeDepth;
      if (depth > 0.05) {
        if (config.canSwim) this.homePosition.y = Math.max(ground, WATER_LEVEL - floatDepth);
        else if (wade != null) this.homePosition.y = Math.max(ground, WATER_LEVEL - wade);
        else this.homePosition.y = ground;
      } else {
        this.homePosition.y = ground;
      }
    }
    this.wanderRadius = config.wanderRadius ?? 4.5;
    this.walkSpeed = config.walkSpeed ?? 1.15;
    this.runSpeed = config.runSpeed ?? 3.2;
    this.moveSpeed = this.walkSpeed;
    this.runChance = config.runChance ?? 0.22;
    this.canSwim = !!config.canSwim;
    this.avoidWater = config.avoidWater !== false;

    // --- Rig / render -----------------------------------------------------
    this.group = new THREE.Group();
    this.group.name = this.id;
    this.group.position.copy(this.homePosition);
    this.group.rotation.order = 'YXZ'; // yaw first, then terrain tilt
    this.group.userData.animal = this;
    this.scene.add(this.group);

    this.materials = makeAnimalMaterials(config.palette || {});
    this.boneMap = new Map();
    this.bones = [];
    this.meshes = [];
    this.skeleton = null;
    this.rootBone = null;
    this.baseY = 0;

    // --- Animation --------------------------------------------------------
    this.mixer = null;
    this.actions = new Map();
    this.currentAction = null;
    this.activeActionName = null;
    this.clipMeta = config.clipMeta || {};

    // --- Behaviour --------------------------------------------------------
    this.state = 'idle';
    this.stateTimer = 0;
    this.stateDuration = 2 + Math.random() * 2;
    this.reactionLock = 0;
    this.lastReaction = { name: '', at: -999 };
    this.animTime = 0;
    this.targetPosition = this.homePosition.clone();
    this.facing = Math.random() * Math.PI * 2;
    this.group.rotation.y = this.facing;
    this.isMoving = false;
    this.sinceInteract = 0;

    // --- Presentation -----------------------------------------------------
    this.createHoverIndicator();
    this.createEmotionBubble();

    // --- Blink ------------------------------------------------------------
    this.blinkTimer = 1 + Math.random() * 3;
    this.blinkPhase = -1;
    this.blinkDuration = 0.16;
    this.eyesClosed = false;

    // --- Build ------------------------------------------------------------
    // (initialised before the rig is built, which records its stats here)
    this.surfaceStats = null;
    this._camPos = new THREE.Vector3();
    this.buildFromDefinition();
  }

  // =========================================================================
  //  RIG CONSTRUCTION
  // =========================================================================
  buildFromDefinition() {
    const def = this.config;
    const builder = new RigBuilder(this.group);

    const bones = typeof def.bones === 'function' ? def.bones() : def.bones || [];
    for (const b of bones) {
      builder.addBone(b.name, b.parent ?? null, b.position ?? [0, 0, 0], b.rotation ?? [0, 0, 0], b.tip ?? null);
    }

    // 1. Sculpt the body: ONE continuous implicit surface (metaball) whose
    //    vertices are skinned straight against the bones, so the torso, neck,
    //    head, ears, legs and tail are a single melt-free skin.
    let surfaceCtx = null;
    let detailFactory = null;
    if (typeof def.sculpt === 'function') {
      const sculpted = def.sculpt();
      const built = sculpted.surface.build();
      builder.addSurface(built.geometry, built.boneLists, {
        material: 'skin',
        power: def.surfacePower ?? 4.2
      });
      surfaceCtx = built;
      detailFactory = sculpted.details;
      this.surfaceStats = built.stats;
      // Face and foot details must match the species palette, otherwise every
      // nose would be the same default pink.
      this.applyPaletteToMaterials(sculpted.palette);
    }

    // 2. Crisp surface details (eyes, nose, mouth, hooves, beak) that are
    //    snapped onto the sculpted skin so they sit IN the face.
    let parts = [];
    if (detailFactory && surfaceCtx) {
      parts = detailFactory({ mesh: surfaceCtx.mesh, bounds: surfaceCtx.bounds }, this.materials) || [];
    }
    if (typeof def.parts === 'function') {
      parts = parts.concat(def.parts(this.materials, surfaceCtx) || []);
    } else if (Array.isArray(def.parts)) {
      parts = parts.concat(def.parts);
    }
    for (const p of parts) {
      if (!p || !p.geometry) continue;
      builder.addPart(p.geometry, p.material, p.bones, { power: p.power, stiffness: p.stiffness });
    }

    const { meshes, skeleton } = builder.build(this.materials);
    this.meshes = meshes;
    this.skeleton = skeleton;
    this.bones = skeleton.bones;
    this.rootBone = skeleton.bones[0];
    this.boneMap = new Map(this.bones.map((b) => [b.name, b]));
    this.eyeBones = ['eyeL', 'eyeR'].map((n) => this.boneMap.get(n)).filter(Boolean);
    this.baseY = this.bones.length ? this.bones[0].position.y : 0;

    // Clips are authored against the same bone layout.
    const clips = buildClipSet(def.profile, def.clipOptions || {});
    this.setupMixer(clips);
    // Plant each clip on the ground: authored poses can lift the paws a few
    // centimetres or push them through the floor, so every clip is measured
    // on the real skinned contact vertices and shifted vertically until its
    // lowest point rests exactly on y = 0. This is what keeps the feet from
    // floating during a walk and from sinking during a sleep or a play bow.
    this.groundClips(clips);

    // Picking collider: cheap invisible ellipsoid instead of raycasting the
    // full skinned geometry on every mouse move.
    const cr = def.colliderRadius ?? 0.8;
    const ch = def.colliderHeight ?? 1.0;
    const collider = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.name = `${this.id}_collider`;
    collider.scale.set(cr, ch, cr);
    collider.position.y = ch * 0.85;
    collider.userData.animal = this;
    collider.userData.pickable = true;
    this.group.add(collider);
    this.collider = collider;

    this.setState('idle', 1.5 + Math.random() * 3);
  }

  /**
   * Collect the ground-contact vertices (the paws / hooves / feet, i.e. the
   * lowest skin vertices in the rest pose). These are the probes used to plant
   * each animation clip onto the ground.
   */
  buildContactProbes() {
    const probes = [];
    const contactY = Math.min(0.06, (this.config.colliderHeight || 0.6) * 0.12);
    for (const mesh of this.meshes) {
      if (!mesh.isSkinnedMesh) continue;
      const pos = mesh.geometry.attributes.position;
      const idx = [];
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) <= contactY) idx.push(i);
      }
      if (!idx.length) continue;
      const stride = Math.max(1, Math.floor(idx.length / 260));
      const picked = [];
      for (let k = 0; k < idx.length; k += stride) picked.push(idx[k]);
      probes.push({ mesh, indices: picked });
    }
    // Guard: if nothing was found (unusual scale), fall back to every 12th vertex.
    if (!probes.length) {
      for (const mesh of this.meshes) {
        if (!mesh.isSkinnedMesh) continue;
        const pos = mesh.geometry.attributes.position;
        const picked = [];
        for (let i = 0; i < pos.count; i += 12) picked.push(i);
        probes.push({ mesh, indices: picked });
      }
    }
    return probes;
  }

  /** Lowest world y of the contact probes, relative to the group origin. */
  lowestContact(probes) {
    const v = this._probeVec || (this._probeVec = new THREE.Vector3());
    let lo = Infinity;
    for (const p of probes) {
      const pos = p.mesh.geometry.attributes.position;
      for (const i of p.indices) {
        v.fromBufferAttribute(pos, i);
        p.mesh.applyBoneTransform(i, v);
        p.mesh.localToWorld(v);
        if (v.y < lo) lo = v.y;
      }
    }
    return lo - this.group.position.y;
  }

  /**
   * Shift each clip's root height so its lowest contact point rests on the
   * ground. Idempotent and shape-preserving: only a constant vertical offset
   * is added, so the animation itself is untouched.
   */
  groundClips(clips) {
    if (!this.mixer || !this.actions.size) return;
    const probes = this.buildContactProbes();
    if (!probes.length) return;
    const rootTrackName = `${this.rootBone ? this.rootBone.name : 'root'}.position`;
    // 22 evenly spaced samples find the clip's lowest moment to well under a
    // millimetre in practice, and keep rig construction cheap enough that the
    // loading screen is never blocked for long.
    const samples = 22;

    for (const clip of clips || []) {
      const action = this.actions.get(clip.name);
      if (!action) continue;
      this.mixer.stopAllAction();
      action.reset();
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.play();

      let lo = Infinity;
      for (let s = 0; s < samples; s++) {
        this.mixer.setTime((clip.duration * s) / samples);
        this.group.updateMatrixWorld(true);
        lo = Math.min(lo, this.lowestContact(probes));
      }
      action.stop();

      if (!Number.isFinite(lo)) continue;
      const lift = -lo;
      if (Math.abs(lift) < 0.0008) continue;

      let track = clip.tracks.find((t) => t.name === rootTrackName);
      if (!track) {
        track = new THREE.VectorKeyframeTrack(
          rootTrackName,
          [0, clip.duration],
          [0, 0, 0, 0, 0, 0]
        );
        clip.tracks.push(track);
      }
      for (let i = 1; i < track.values.length; i += 3) track.values[i] += lift;
    }

    this.mixer.stopAllAction();
    this.mixer.setTime(0);
    this.playAction('Idle', 0, true);
  }

  /** Tints the crisp detail materials (nose, eyes, hooves, beak, mouth) from
   *  the species palette so every face matches its own colours. */
  applyPaletteToMaterials(palette) {
    if (!palette) return;
    const m = this.materials;
    const setHex = (mat, hex) => {
      if (mat && mat.color && hex != null) mat.color.setHex(hex);
    };
    setHex(m.nose, palette.nose);
    setHex(m.eye, palette.eye);
    setHex(m.hoof, palette.hoof);
    setHex(m.beak, palette.beak);
    // Mouth crease and nostrils read best as the darkest colour in the palette.
    setHex(m.dark, palette.eye);
    this.palette = palette;
  }

  setupMixer(clips) {    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.group);
    }
    this.mixer = new THREE.AnimationMixer(this.group);
    this.actions.clear();
    this.currentAction = null;
    this.activeActionName = null;

    this.clipList = clips;
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      if (REACTION_CLIP_NAMES.has(clip.name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions.set(clip.name, action);
    }
    this.playAction('Idle', 0);
  }

  /**
   * Swap in a loaded GLB. The GLB was exported from this very rig, so bone
   * names still match and clips remain interchangeable. Falls back silently.
   */
  applyGLTF(gltf) {
    try {
      const root = gltf.scene;
      let skinned = null;
      root.traverse((o) => {
        if (!skinned && o.isSkinnedMesh) skinned = o;
      });
      if (!skinned) return false;

      root.updateMatrixWorld(true);

      // Remove the procedural rig entirely (meshes AND bones) so that the
      // mixer's name-based binding cannot resolve to a stale bone.
      if (this.mixer) {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.group);
      }
      for (const m of this.meshes) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      if (this.rootBone && this.rootBone.parent) {
        this.rootBone.parent.remove(this.rootBone);
      }
      this.meshes = [];
      this.group.add(root);

      const newBones = [];
      const meshList = [];
      root.traverse((o) => {
        if (o.isBone) newBones.push(o);
        if (o.isSkinnedMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
          meshList.push(o);
        }
      });
      if (newBones.length) {
        this.bones = newBones;
        this.boneMap = new Map(newBones.map((b) => [b.name, b]));
        this.rootBone = newBones[0];
      }
      this.meshes = meshList;
      this.skeleton = skinned.skeleton;
      this.root = root;

      // Restore eyelid/eye reference bones (used by the blink system).
      this.eyeBones = ['eyeL', 'eyeR'].map((n) => this.boneMap.get(n)).filter(Boolean);

      if (gltf.animations && gltf.animations.length >= 6) {
        const names = gltf.animations.map((c) => c.name);
        // Keep clip behaviour consistent with the procedural set.
        this.setupMixer(gltf.animations);
        this.loadedFromGLB = true;
        this.glbClipNames = names;
        return true;
      }
      // Loaded the mesh but no usable clips: rebuild clips for the new bones.
      this.setupMixer(buildClipSet(this.config.profile, this.config.clipOptions || {}));
      this.loadedFromGLB = true;
      return true;
    } catch (err) {
      console.warn(`[${this.id}] GLB apply failed, keeping procedural model`, err);
      return false;
    }
  }

  getClipNames() {
    return this.clipList ? this.clipList.map((c) => c.name) : [];
  }

  // =========================================================================
  //  ANIMATION CONTROL
  // =========================================================================
  playAction(name, fade = 0.25, restart = false) {
    const next = this.actions.get(name);
    if (!next) return false;
    if (next === this.currentAction && !restart) return false;

    const prev = this.currentAction;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.play();
    if (prev && prev !== next) {
      if (fade > 0) {
        prev.fadeOut(fade);
        next.fadeIn(fade);
      } else {
        prev.stop();
      }
    }
    this.currentAction = next;
    this.activeActionName = name;
    return true;
  }

  /** Time-scale the locomotion clip so feet keep pace with real ground speed. */
  syncLocomotionRate(speed) {
    const name = this.activeActionName;
    const meta = this.clipMeta?.[name];
    if (!meta || !this.currentAction) return;
    const nominalSpeed = meta.strideLength / meta.duration;
    const rate = nominalSpeed > 0.01 ? THREE.MathUtils.clamp(speed / nominalSpeed, 0.55, 1.7) : 1;
    this.currentAction.setEffectiveTimeScale(rate);
  }

  // =========================================================================
  //  STATE MACHINE
  // =========================================================================
  setState(next, duration = null) {
    if (this.state === next && duration === null) return;
    this.state = next;
    this.stateTimer = 0;
    this.stateDuration = duration ?? 3 + Math.random() * 2.5;

    const mapping = {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      swim: 'Swim',
      eat: 'Eat',
      pet: 'Pet',
      play: 'Play',
      sleep: 'Sleep',
      react: 'React',
      special: this.specialClip || 'Play'
    };
    const clipName = mapping[next];
    if (!this.actions.has(clipName)) {
      // Species without the clip fall back gracefully.
      this.playAction(mapping.idle, 0.3);
      this.state = next;
      return;
    }
    const fade = REACTION_STATES.has(next) ? 0.18 : 0.35;
    this.playAction(clipName, fade, REACTION_STATES.has(next));

    if (next === 'pet') this.showEmotion('love', 2.6);
    else if (next === 'eat') this.showEmotion('yum', 2.4);
    else if (next === 'play') this.showEmotion('play', 2.4);
    else if (next === 'sleep') this.showEmotion('sleep', 3);
    else if (next === 'react') this.showEmotion('sparkle', 2);
    else if (next === 'special') this.showEmotion('water', 2.4);
  }

  _reaction(name, clip, lock) {
    const now = this.animTime;
    const duplicate = this.lastReaction.name === clip && now - this.lastReaction.at < lock * 0.4;
    this.lastReaction = { name: clip, at: now };
    if (duplicate) return false; // ignore spam, keeps animations conflict-free
    this.sinceInteract = 0;
    this.setState(name, lock);
    this.reactionLock = lock;
    return true;
  }

  triggerPetReaction() {
    return this._reaction('pet', 'Pet', 2.8);
  }

  triggerFeedReaction() {
    return this._reaction('eat', 'Eat', 2.4);
  }

  triggerPlayReaction() {
    return this._reaction('play', 'Play', 2.6);
  }

  triggerReactReaction() {
    return this._reaction('react', 'React', 1.5);
  }

  triggerSpecial() {
    this.specialClip = this.actions.has('Spray') ? 'Spray' : (this.actions.has('Flap') ? 'Flap' : 'Play');
    return this._reaction('special', this.specialClip, 3.2);
  }

  /** Walk toward a point, entering walk/run automatically. */
  moveTo(position) {
    this.targetPosition.copy(position);
    this.targetPosition.y = getGroundHeight(position.x, position.z);
    // A commanded target (food, ball) outranks idle wandering: once any
    // current reaction ends, the animal walks to it rather than forgetting.
    this.approachTimer = 14;
  }

  isReacting() {
    return REACTION_STATES.has(this.state) && this.stateTimer < this.reactionLock;
  }

  // =========================================================================
  //  PER-FRAME UPDATE
  // =========================================================================
  update(delta, cameraPosition = null) {
    this.animTime += delta;
    this.stateTimer += delta;
    this.sinceInteract += delta;
    if (this.reactionLock > 0) this.reactionLock = Math.max(0, this.reactionLock - delta);
    if (this.approachTimer > 0) this.approachTimer = Math.max(0, this.approachTimer - delta);

    // --- LOD: distant animals cost a fraction of the frame --------------
    if (cameraPosition) {
      this._camPos.copy(cameraPosition);
      const d2 = this._camPos.distanceToSquared(this.group.position);
      this.setLOD(d2 > LOD_FAR * LOD_FAR ? 2 : d2 > LOD_MEDIUM * LOD_MEDIUM ? 1 : 0);
    }

    // Skin sampling interval grows with distance; accumulated delta keeps
    // the animation clock accurate even when we skip frames.
    const stepInterval = LOD_STEP[this.lod || 0];
    this.mixerAccum = (this.mixerAccum || 0) + delta;
    if (this.mixer && this.mixerAccum >= stepInterval) {
      this.mixer.update(this.mixerAccum);
      this.mixerAccum = 0;
    }

    // --- Behaviour ------------------------------------------------------
    if (!this.isReacting()) {
      this.advanceBehaviour(delta);
      this.resolveWaterState();
    }

    // --- Noticing the visitor -------------------------------------------
    // A light "someone is here" beat: an idle animal close to the player
    // pricks up its ears and looks up, on a long cooldown so it stays a
    // moment of life rather than a twitch.
    this.playerReactCd = Math.max(0, (this.playerReactCd || 0) - delta);
    if (cameraPosition) {
      if (
        this.playerReactCd <= 0 &&
        this.state === 'idle' &&
        this.sinceInteract > 4 &&
        this.reactionLock <= 0
      ) {
        const dx = cameraPosition.x - this.group.position.x;
        const dz = cameraPosition.z - this.group.position.z;
        if (dx * dx + dz * dz < 9) {
          this.playerReactCd = 30 + Math.random() * 25;
          this.triggerReactReaction();
        }
      }
    }

    // --- Movement -------------------------------------------------------
    this.applyLocomotion(delta);
    this.updateGroundTilt(delta);

    // --- Blink / eyes ---------------------------------------------------
    this.updateEyes(delta);

    // --- Hover ring pulse ----------------------------------------------
    if (this.hovered && this.hoverRing.visible) {
      const s = this.hoverRingScale * (1 + Math.sin(this.animTime * 4.5) * 0.07);
      this.hoverRing.scale.set(s, s, s);
    }
  }

  setLOD(level) {
    if (this.lod === level) return;
    this.lod = level;
    // Near: shadows. Medium: keep shadows. Far: drop shadow casting (big win).
    for (const m of this.meshes) m.castShadow = level < 2;
    this.hoverRing.visible = this.hovered && level < 2;
    this.bubbleSprite.visible = level < 2;
  }

  advanceBehaviour(delta) {
    if (this.stateTimer < this.stateDuration) return;

    // A commanded approach (food / toy) takes priority over idle wandering.
    if (this.approachTimer > 0) {
      this.setState(this.canSwim ? 'swim' : 'walk', 3);
      return;
    }

    // Long idle stretches raise the odds of a nap; recent pets make it playful.
    const r = Math.random();
    if (this.state === 'sleep') {
      this.setState('idle', 2 + Math.random() * 3);
      return;
    }
    if (r < 0.42) {
      this.setState('idle', 2.5 + Math.random() * 4);
    } else if (r < 0.42 + 0.4) {
      this.pickWanderTarget();
      this.setState('walk', 3 + Math.random() * 3.5);
    } else if (r < 0.9) {
      this.pickWanderTarget();
      this.setState(Math.random() < this.runChance ? 'run' : 'walk', 1.6 + Math.random() * 2.2);
    } else if (this.sinceInteract > 18) {
      this.setState('sleep', 6 + Math.random() * 5);
    } else {
      this.setState('react', 1.5);
    }
  }

  /**
   * Semi-aquatic species paddle, they do not walk, once they are in water.
   * Keeps the land gait from being played while floating.
   */
  resolveWaterState() {
    if (!this.canSwim || this.isReacting()) return;
    const p = this.group.position;
    const inWater = getWaterDepth(p.x, p.z) > 0.12;
    if (inWater) {
      if (this.state === 'idle' || this.state === 'walk' || this.state === 'run') {
        this.setState('swim', 3 + Math.random() * 2.5);
      }
    } else if (this.state === 'swim') {
      this.setState('idle', 1.5 + Math.random());
    }
  }

  pickWanderTarget() {    const zone = ZONES[this.homeZone];
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = (0.35 + Math.random() * 0.65) * this.wanderRadius;
      let x = this.homePosition.x + Math.cos(ang) * dist;
      let z = this.homePosition.z + Math.sin(ang) * dist;
      if (zone && !this.canSwim) {
        // Keep wandering inside the habitat so animals never pile up.
        const dx = x - zone.center[0];
        const dz = z - zone.center[2];
        const d = Math.hypot(dx, dz);
        const maxD = zone.radius * 1.15;
        if (d > maxD) {
          x = zone.center[0] + (dx / d) * maxD;
          z = zone.center[2] + (dz / d) * maxD;
        }
      }
      if (!this.canSwim && this.avoidWater && getWaterDepth(x, z) > 0) {
        const shore = nearestShore(x, z, 2.5);
        if (shore) {
          this.targetPosition.set(shore.x, 0, shore.z);
          return;
        }
        continue;
      }
      this.targetPosition.set(x, 0, z);
      return;
    }
    this.targetPosition.copy(this.homePosition);
  }

  applyLocomotion(delta) {
    const moving = this.state === 'walk' || this.state === 'run' || this.state === 'swim';
    const speed = this.state === 'run' ? this.runSpeed : this.walkSpeed;

    if (!moving) {
      // Ease to a stop, and settle smoothly onto the ground / water line.
      const restY = this.targetGroundY(this.group.position.x, this.group.position.z);
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, restY, Math.min(1, delta * 6));
      this.isMoving = false;
      return;
    }

    const pos = this.group.position;
    const dx = this.targetPosition.x - pos.x;
    const dz = this.targetPosition.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.35) {
      this.approachTimer = 0;
      this.setState('idle', 2 + Math.random() * 3);
      return;
    }

    const desired = Math.atan2(dx, dz);
    let diff = desired - this.facing;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    const turnRate = this.state === 'run' ? 4.5 : 3.2;
    this.facing += diff * Math.min(1, delta * turnRate);
    this.group.rotation.y = this.facing;

    // Slow down while turning sharply so the turn reads as deliberate.
    const turnPenalty = 1 - Math.min(0.55, Math.abs(diff) * 0.45);
    const step = speed * turnPenalty * delta;
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;

    // Water safety net: if we are about to enter deep water, turn to shore.
    if (!this.canSwim && this.avoidWater && getWaterDepth(pos.x, pos.z) > 0.2) {
      const shore = nearestShore(pos.x, pos.z, 2.5);
      if (shore) this.targetPosition.set(shore.x, 0, shore.z);
      else this.setState('idle', 1.5);
    }

    const groundY = this.targetGroundY(pos.x, pos.z);
    pos.y = THREE.MathUtils.lerp(pos.y, groundY, Math.min(1, delta * 7));

    this.isMoving = true;
    this.syncLocomotionRate(speed * turnPenalty);
  }

  /**
   * Tilt the whole animal to match the ground it stands on. Without this the
   * character stays bolt upright on a slope and one side's paws dig into the
   * hill. The tilt is damped, so walking across a bumpy meadow reads as a
   * gentle sway rather than a jitter.
   */
  updateGroundTilt(delta) {
    const p = this.group.position;
    const reach = Math.max(0.18, (this.config.colliderRadius || 0.3) * 1.5);
    const submerged = getWaterDepth(p.x, p.z) > 0.08;
    let wantX = 0;
    let wantZ = 0;
    if (!submerged) {
      const hx = getGroundHeight(p.x + reach, p.z) - getGroundHeight(p.x - reach, p.z);
      const hz = getGroundHeight(p.x, p.z + reach) - getGroundHeight(p.x, p.z - reach);
      // Group +Y should follow the terrain normal (see the YXZ derivation).
      wantX = THREE.MathUtils.clamp(Math.atan2(hz, reach * 2), -0.45, 0.45);
      wantZ = THREE.MathUtils.clamp(-Math.atan2(hx, reach * 2), -0.45, 0.45);
    }
    const k = Math.min(1, delta * 3.2);
    this.tiltX = (this.tiltX || 0) + (wantX - (this.tiltX || 0)) * k;
    this.tiltZ = (this.tiltZ || 0) + (wantZ - (this.tiltZ || 0)) * k;
    this.group.rotation.x = this.tiltX;
    this.group.rotation.z = this.tiltZ;
  }

  /** Walkable surface, or the float line for strong swimmers. */
  targetGroundY(x, z) {    const groundY = getGroundHeight(x, z);
    const depth = getWaterDepth(x, z);
    if (depth > 0.06) {
      if (this.canSwim) {
        // Float so the body sits mostly above the water line.
        const floatLine = WATER_LEVEL - (this.config.floatDepth ?? 0.34);
        return Math.max(groundY, floatLine);
      }
      const wade = this.config.wadeDepth;
      if (wade != null) {
        // Wading birds stand in the shallows.
        return Math.max(groundY, WATER_LEVEL - wade);
      }
    }
    return groundY;
  }

  updateEyes(delta) {
    const eyeBones = this.eyeBones || ['eyeL', 'eyeR'].map((n) => this.boneMap.get(n)).filter(Boolean);
    if (!eyeBones.length) return;
    this.eyeBones = eyeBones;

    const wantClosed = this.state === 'sleep';
    if (wantClosed) {
      this.blinkPhase = 1;
    } else if (this.blinkPhase < 0) {
      this.blinkTimer -= delta;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = 0;
        this.blinkTimer = 2 + Math.random() * 4;
      }
    } else {
      this.blinkPhase += delta / this.blinkDuration;
      if (this.blinkPhase >= 1) {
        this.blinkPhase = -1;
        // ~18% chance of a quick double blink, a lovely bit of life.
        if (Math.random() < 0.18) this.blinkTimer = 0.12;
      }
    }
    const open = this.blinkPhase < 0 ? 1 : Math.abs(Math.cos(Math.min(1, this.blinkPhase) * Math.PI));
    const s = THREE.MathUtils.clamp(0.06 + open * 0.94, 0.06, 1);
    for (const b of eyeBones) b.scale.set(1, s, 1);
  }

  // =========================================================================
  //  PRESENTATION HELPERS
  // =========================================================================
  createHoverIndicator() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.5);
    grad.addColorStop(0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(0.62, 'rgba(255,241,247,0.10)');
    grad.addColorStop(0.78, 'rgba(255,143,190,0.55)');
    grad.addColorStop(0.92, 'rgba(255,190,220,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    this.hoverTex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.hoverTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.hoverRing = new THREE.Mesh(geo, mat);
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.position.y = 0.05;
    this.hoverRingScale = (this.config.colliderRadius || 0.6) * 4.4;
    this.hoverRing.scale.set(this.hoverRingScale, this.hoverRingScale, 1);
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 2;
    this.group.add(this.hoverRing);
    this.hovered = false;
  }

  setHovered(v) {
    if (this.hovered === v) return;
    this.hovered = v;
    this.hoverRing.visible = v && (this.lod ?? 0) < 2;
  }

  createEmotionBubble() {
    const w = 160;
    const h = 80;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.bubbleCanvas = canvas;
    this.bubbleTex = new THREE.CanvasTexture(canvas);
    this.bubbleSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.bubbleTex, transparent: true, opacity: 0, depthWrite: false })
    );
    const s = (this.config.bubbleScale || 1) * 1.5;
    this.bubbleSprite.scale.set(s * 2, s, 1);
    this.bubbleSprite.position.set(0, (this.config.colliderHeight || 1) * 2.1 + 0.5, 0);
    this.bubbleSprite.visible = false;
    this.group.add(this.bubbleSprite);
  }

  /** Hand-drawn vector emotion icons (no emoji dependencies). */
  showEmotion(kind, seconds = 3) {
    const ctx = this.bubbleCanvas.getContext('2d');
    const w = this.bubbleCanvas.width;
    const h = this.bubbleCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Bubble
    ctx.fillStyle = 'rgba(255,252,254,0.94)';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 20, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,150,195,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 9, h - 16);
    ctx.lineTo(w / 2 + 9, h - 16);
    ctx.lineTo(w / 2, h - 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,252,254,0.94)';
    ctx.fill();

    ctx.save();
    ctx.translate(w / 2, h / 2 - 9);

    const heart = (s, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.95);
      ctx.bezierCurveTo(-s * 1.45, -s * 0.15, -s * 0.75, -s * 1.25, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.75, -s * 1.25, s * 1.45, -s * 0.15, 0, s * 0.95);
      ctx.fill();
    };

    switch (kind) {
      case 'love':
        heart(15, '#ff5a9e');
        heart(8, '#ffa8ce');
        ctx.globalAlpha = 0.9;
        ctx.translate(-26, -6);
        heart(7, '#ff8bc2');
        ctx.translate(52, 0);
        heart(7, '#ff8bc2');
        ctx.globalAlpha = 1;
        break;
      case 'yum':
        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, -2, 15, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = '#ffb26b';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(-14 + i * 14, -17, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'play':
        ctx.fillStyle = '#7fd4ff';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff6fb';
        ctx.beginPath();
        ctx.arc(-4, -4, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#59b7e8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'sleep':
        ctx.fillStyle = '#8f7bd6';
        ctx.font = 'bold 26px "Quicksand", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('z', -12, 6);
        ctx.font = 'bold 20px "Quicksand", sans-serif';
        ctx.fillText('z', 6, -6);
        ctx.font = 'bold 15px "Quicksand", sans-serif';
        ctx.fillText('z', 20, -17);
        break;
      case 'water':
        ctx.fillStyle = '#6fc9f2';
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.bezierCurveTo(14, -2, 15, 6, 0, 15);
        ctx.bezierCurveTo(-15, 6, -14, -2, 0, -16);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(-4, 1, 3.4, 5, -0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      default: {
        // sparkle
        ctx.fillStyle = '#ffd76b';
        const star = (r) => {
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const rr = i % 2 === 0 ? r : r * 0.42;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        };
        star(16);
        ctx.fillStyle = '#fff3c9';
        star(8);
        break;
      }
    }
    ctx.restore();

    this.bubbleTex.needsUpdate = true;
    this.bubbleSprite.visible = true;
    this.bubbleSprite.material.opacity = 1;
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => {
      this.bubbleSprite.material.opacity = 0;
      this.bubbleSprite.visible = false;
    }, seconds * 1000);
  }

  /** Camera framing info used by the interaction system. */
  getFocusPoint(out = new THREE.Vector3()) {
    const h = this.config.colliderHeight || 1;
    return out.copy(this.group.position).add(new THREE.Vector3(0, h * 0.75, 0));
  }

  /**
   * World position of the animal's mouth, used to align food with the muzzle
   * so it is never pushed through the body. Falls back to a body-relative
   * point if the head bone is unavailable.
   */
  getMuzzlePoint(out = new THREE.Vector3()) {
    const head = this.boneMap && this.boneMap.get('head');
    const reach = (this.config.colliderRadius || 0.3) * 0.85;
    if (head) {
      head.updateWorldMatrix(true, false);
      out.setFromMatrixPosition(head.matrixWorld);
      out.x += Math.sin(this.facing) * reach;
      out.z += Math.cos(this.facing) * reach;
      out.y -= (this.config.colliderHeight || 0.5) * 0.1;
      return out;
    }
    return out.copy(this.group.position).add(new THREE.Vector3(0, (this.config.colliderHeight || 0.5) * 0.5, 0));
  }

  getFocusDistance() {
    return Math.max(2.6, (this.config.colliderRadius || 0.8) * 4.2);
  }

  dispose() {
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    this.scene.remove(this.group);
  }
}

const REACTION_CLIP_NAMES = new Set(['Pet', 'Eat', 'Play', 'React', 'Spray', 'Flap']);

/**
 * RigBuilder.js
 * Builds a real, skinned character rig from parametric part definitions:
 *   - a THREE.Bone hierarchy in rest pose (character space),
 *   - one merged, smoothly weighted THREE.SkinnedMesh per material,
 * ready for THREE.AnimationMixer to drive with skeletal animation clips.
 *
 * Weights are computed per vertex against the nearest bone SEGMENTS (the line
 * from a bone's rest origin to its child's rest origin), blended across the two
 * strongest influences. That yields soft, believable joint deformation instead
 * of the rigid "rotating body parts" look.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();

function distanceToSegment(p, a, b) {
  _vA.subVectors(b, a);
  const lenSq = _vA.lengthSq();
  if (lenSq < 1e-8) return p.distanceTo(a);
  _vB.subVectors(p, a);
  const t = THREE.MathUtils.clamp(_vB.dot(_vA) / lenSq, 0, 1);
  _vA.multiplyScalar(t).add(a);
  return p.distanceTo(_vA);
}

export class RigBuilder {
  /**
   * @param {THREE.Group} root group that will hold the bones and skinned meshes.
   */
  constructor(root) {
    this.root = root;
    this.bones = [];
    this.boneMap = new Map();
    this.restWorld = new Map();
    this.segments = new Map();
    this.childrenOf = new Map();
    this.tips = new Map();
    this.parts = [];
    this.surfaceParts = [];
  }

  /**
   * @param {string} name unique bone name (also used by animation tracks)
   * @param {string|null} parentName
   * @param {number[]} position rest position in character space
   * @param {number[]} rotation rest euler (radians)
   * @param {number[]|null} tip for leaf bones: local-space offset of the bone tip
   */
  addBone(name, parentName, position = [0, 0, 0], rotation = [0, 0, 0], tip = null) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(position[0], position[1], position[2]);
    bone.rotation.set(rotation[0], rotation[1], rotation[2]);

    const parent = parentName ? this.boneMap.get(parentName) : null;
    if (parent) {
      parent.add(bone);
      if (!this.childrenOf.has(parentName)) this.childrenOf.set(parentName, []);
      this.childrenOf.get(parentName).push(name);
    } else {
      this.rootBone = bone;
      this.root.add(bone);
    }

    this.boneMap.set(name, bone);
    this.bones.push(bone);

    const local = new THREE.Matrix4().compose(bone.position, bone.quaternion, bone.scale);
    const rest = parent
      ? new THREE.Matrix4().multiplyMatrices(this.restWorld.get(parentName), local)
      : local.clone();
    this.restWorld.set(name, rest);

    if (tip) this.tips.set(name, new THREE.Vector3().fromArray(tip));
    return bone;
  }

  /** Bone segment (oriented along the chain) used for skin weighting. */
  finalizeSegments() {
    for (const name of this.boneMap.keys()) {
      const rest = this.restWorld.get(name);
      const a = new THREE.Vector3().setFromMatrixPosition(rest);
      const kids = this.childrenOf.get(name) || [];
      const explicitTip = this.tips.get(name);
      let b;
      if (explicitTip) {
        // Explicit tips win - used where a bone's children are spread out
        // (e.g. the head, whose children are ears and eyes).
        b = a.clone().add(explicitTip.clone().applyQuaternion(this.boneMap.get(name).quaternion));
      } else if (kids.length > 0) {
        b = new THREE.Vector3();
        for (const k of kids) {
          b.add(new THREE.Vector3().setFromMatrixPosition(this.restWorld.get(k)));
        }
        b.multiplyScalar(1 / kids.length);
        if (b.distanceToSquared(a) < 1e-6) {
          b = a.clone().add(new THREE.Vector3(0, 0.2, 0));
        }
      } else {
        const tip = explicitTip || new THREE.Vector3(0, 0.2, 0);
        b = a.clone().add(tip.clone().applyQuaternion(this.boneMap.get(name).quaternion));
      }
      this.segments.set(name, { a, b });
    }
  }

  /**
   * Register a mesh part.
   * @param {THREE.BufferGeometry} geometry authored in character space
   * @param {string} materialKey which material this part belongs to
   * @param {string[]} influenceBones bones allowed to deform this part
   * @param {{power?:number, stiffness?:number}} opts power: weight falloff (higher = tighter)
   */
  addPart(geometry, materialKey, influenceBones, opts = {}) {
    this.parts.push({
      geometry,
      materialKey,
      bones: influenceBones,
      power: opts.power ?? 3.2,
      stiffness: opts.stiffness ?? 0
    });
    return this;
  }

  /**
   * Register the sculpted implicit surface (one continuous skin for the whole
   * body). `boneLists[i]` is the bone whitelist for vertex i, which keeps a
   * belly vertex from being kidnapped by a nearby leg bone.
   */
  addSurface(geometry, boneLists, opts = {}) {
    this.surfaceParts.push({
      geometry,
      boneLists: boneLists || null,
      materialKey: opts.material || 'skin',
      power: opts.power ?? 4.2,
      stiffness: opts.stiffness ?? 0
    });
    return this;
  }

  /** Convenience: many parts at once. */
  addParts(list) {
    for (const p of list) this.addPart(p.geometry, p.material, p.bones, p);
    return this;
  }

  _skinAttributes(geometry, boneNames, power, stiffness, boneLists = null) {
    // Resolve every bone's rest segment once, so per-vertex whitelists are cheap.
    const segIndexByName = new Map();
    for (let i = 0; i < this.bones.length; i++) {
      const s = this.segments.get(this.bones[i].name);
      if (s) segIndexByName.set(this.bones[i].name, { index: i, a: s.a, b: s.b });
    }

    const segs = boneNames.map((n) => {
      const s = this.segments.get(n);
      if (!s) throw new Error(`RigBuilder: unknown bone "${n}" used as an influence`);
      return { index: this.bones.indexOf(this.boneMap.get(n)), a: s.a, b: s.b };
    });

    const pos = geometry.attributes.position;
    const count = pos.count;
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    const p = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i));

      // Which bones may influence this vertex?
      let candidates = segs;
      if (boneLists) {
        const list = boneLists[i];
        if (list && list.length) {
          const resolved = [];
          for (const n of list) {
            const s = segIndexByName.get(n);
            if (s) resolved.push(s);
          }
          if (resolved.length) candidates = resolved;
        }
      }

      if (candidates.length === 1) {
        skinIndices[i * 4] = candidates[0].index;
        skinWeights[i * 4] = 1;
        continue;
      }

      // Collect the two strongest influences.
      let best = -1;
      let bestScore = 0;
      let second = -1;
      let secondScore = 0;

      for (let s = 0; s < candidates.length; s++) {
        const d = distanceToSegment(p, candidates[s].a, candidates[s].b);
        let score = 1 / Math.pow(d + 0.04, power);
        if (stiffness > 0) score *= Math.exp(-stiffness * d);
        if (score > bestScore) {
          second = best;
          secondScore = bestScore;
          best = s;
          bestScore = score;
        } else if (score > secondScore) {
          second = s;
          secondScore = score;
        }
      }

      const sum = bestScore + secondScore;
      const w1 = sum > 0 ? bestScore / sum : 1;
      const w2 = sum > 0 ? secondScore / sum : 0;

      skinIndices[i * 4] = candidates[Math.max(0, best)].index;
      skinWeights[i * 4] = w1;
      if (second >= 0 && w2 > 0.001) {
        skinIndices[i * 4 + 1] = candidates[second].index;
        skinWeights[i * 4 + 1] = w2;
      } else {
        skinWeights[i * 4] = 1;
      }
    }

    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
    return geometry;
  }

  /**
   * Merge parts per material into skinned meshes.
   * @param {Record<string, THREE.Material>} materials
   * @returns {{meshes: THREE.SkinnedMesh[], skeleton: THREE.Skeleton}}
   */
  build(materials) {
    this.finalizeSegments();
    this.root.updateMatrixWorld(true);

    const skeleton = new THREE.Skeleton(this.bones);
    const byMaterial = new Map();

    const registerGeometry = (geo, materialKey) => {
      if (!byMaterial.has(materialKey)) byMaterial.set(materialKey, []);
      for (const key of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(key)) {
          geo.deleteAttribute(key);
        }
      }
      if (!geo.index) {
        const idx = new Uint32Array(geo.attributes.position.count);
        for (let i = 0; i < idx.length; i++) idx[i] = i;
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      byMaterial.get(materialKey).push(geo);
    };

    // --- sculpted skin: one continuous body, skinned with per-vertex bone
    //     whitelists derived from the implicit primitives ------------------
    for (const surface of this.surfaceParts) {
      const geo = surface.geometry;
      const pos = geo.attributes.position;
      let finite = true;
      for (let i = 0; i < pos.count; i++) {
        if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
          finite = false;
          break;
        }
      }
      if (!finite) {
        console.warn('RigBuilder: skipping surface with non-finite vertices');
        continue;
      }
      const bonesForSurface = surface.boneLists
        ? this.bones.filter((b) => b.name !== 'root').map((b) => b.name)
        : this.bones.map((b) => b.name);
      this._skinAttributes(geo, bonesForSurface, surface.power, surface.stiffness, surface.boneLists);
      registerGeometry(geo, surface.materialKey);
    }

    for (const part of this.parts) {
      const geo = part.geometry;

      // Guard rail: never let a NaN vertex reach the renderer.
      const pos = geo.attributes.position;
      let finite = true;
      for (let i = 0; i < pos.count; i++) {
        if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
          finite = false;
          break;
        }
      }
      if (!finite) {
        console.warn(`RigBuilder: skipping "${part.materialKey}" part with non-finite vertices`);
        continue;
      }

      this._skinAttributes(geo, part.bones, part.power, part.stiffness);
      registerGeometry(geo, part.materialKey);
    }

    const meshes = [];
    for (const [key, geos] of byMaterial) {
      if (!geos.length) continue;
      const material = materials[key] || materials.fur;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) {
        console.warn(`RigBuilder: failed to merge parts for material "${key}"`);
        continue;
      }
      merged.computeBoundingSphere();
      if (merged.boundingSphere) {
        // Animations move limbs outside the rest-pose bounds; pad to avoid pop-out.
        merged.boundingSphere.radius *= 2.2;
      }
      const mesh = new THREE.SkinnedMesh(merged, material);
      mesh.name = `Skin_${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // small scene, avoid skinned-bounds pop

      this.root.add(mesh);
      this.root.updateMatrixWorld(true);
      mesh.bind(skeleton);
      meshes.push(mesh);
    }

    return { meshes, skeleton };
  }
}

/**
 * Shared material palette factory. Keeps every species on the same visual
 * language (soft pastel, matte fur, glossy eyes) while allowing tinting.
 */
export function makeAnimalMaterials({
  fur = 0xfff7f2,
  furRoughness = 0.78,
  accent = 0xffb7c5,
  belly = 0xffffff,
  dark = 0x4a3b52,
  eyeColor = 0x2a1b2e,
  nose = 0xf58fae,
  beak = 0xf2a03d,
  leg = 0xf2a03d,
  hoof = 0x6b5344,
  skinRoughness = 0.82,
  extra = {}
} = {}) {
  return {
    // The sculpted body: one mesh, markings painted with vertex colours.
    skin: new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0xffffff,
      roughness: skinRoughness,
      metalness: 0.0,
      side: THREE.DoubleSide
    }),
    fur: new THREE.MeshStandardMaterial({ color: fur, roughness: furRoughness, metalness: 0.02 }),
    belly: new THREE.MeshStandardMaterial({ color: belly, roughness: 0.85, metalness: 0.0 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.03 }),
    soft: new THREE.MeshStandardMaterial({ color: 0xffd9e2, roughness: 0.75, metalness: 0.0 }),
    dark: new THREE.MeshStandardMaterial({ color: dark, roughness: 0.55, metalness: 0.05 }),
    eye: new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.08, metalness: 0.25 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    nose: new THREE.MeshStandardMaterial({ color: nose, roughness: 0.35, metalness: 0.05 }),
    beak: new THREE.MeshStandardMaterial({ color: beak, roughness: 0.32, metalness: 0.08 }),
    leg: new THREE.MeshStandardMaterial({ color: leg, roughness: 0.55, metalness: 0.04 }),
    hoof: new THREE.MeshStandardMaterial({ color: hoof, roughness: 0.45, metalness: 0.12 }),
    horn: new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.45, metalness: 0.05 }),
    ...extra
  };
}



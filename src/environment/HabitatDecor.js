/**
 * HabitatDecor.js
 * Gives every habitat its own environmental identity with tasteful, instanced
 * decoration: wind-swept grass, cattail reeds, lotus blossoms, ice crystals,
 * glowing lanterns, rose trellises and picket fences.
 *
 * Everything here is a handful of draw calls: geometry is merged per material
 * and drawn with InstancedMesh. Wind is done in a vertex shader so the CPU
 * cost per frame is effectively zero.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGroundHeight, getWaterDepth, ZONES } from './terrainHeight.js';

/** Adds a cheap wind sway to any instanced material. */
function makeWindy(material, uniforms, strength = 0.12, speed = 1.5) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float bend = max(transformed.y, 0.0);
          float phase = (instanceMatrix[3].x * 0.32) + (instanceMatrix[3].z * 0.27);
          float w = sin(uTime * ${speed.toFixed(2)} + phase) * ${strength.toFixed(3)};
          transformed.x += w * bend;
          transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + phase * 1.3) * ${(strength * 0.7).toFixed(3)} * bend;
        }`
      );
    uniforms.push(shader.uniforms);
  };
  material.customProgramCacheKey = () => 'windy';
  return material;
}

function instanced(geo, mat, placements) {
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  const dummy = new THREE.Object3D();
  let hasColor = false;
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    const s = p.s ?? 1;
    dummy.scale.set(p.sx ?? s, p.sy ?? s, p.sz ?? s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (p.color) {
      hasColor = true;
      mesh.setColorAt(i, p.color);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Scatter helper that respects the ground and avoids water. */
function scatter(zoneId, count, { radiusScale = 0.85, minRadius = 0.15, avoidWater = true, seedShift = 0 } = {}) {
  const zone = ZONES[zoneId];
  const out = [];
  const [cx, , cz] = zone.center;
  let seed = 9871 + seedShift * 977;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let guard = 0;
  while (out.length < count && guard < count * 12) {
    guard++;
    const ang = rand() * Math.PI * 2;
    const t = minRadius + rand() * (radiusScale - minRadius);
    const r = zone.radius * t;
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    if (avoidWater && getWaterDepth(x, z) > 0.05) continue;
    out.push({ x, z, y: getGroundHeight(x, z), rand });
  }
  return out;
}

const PALETTE = {
  grassGreen: [0x8fd39a, 0x9fdcae, 0x7fc48c],
  grassGold: [0xe8c07a, 0xdcae62, 0xf0d191],
  grassLush: [0x6fbf7c, 0x83cc90, 0x5fae6e]
};

export class HabitatDecor {
  constructor(scene) {
    this.scene = scene;
    this.windUniforms = [];
    this.groups = [];

    this.buildMeadow();
    this.buildGrassland();
    this.buildSavanna();
    this.buildLakeSide();
    this.buildForest();
    this.buildIceKingdom();
    this.buildLotusPond();
    this.buildSecretGarden();
    this.buildFences();
    this.buildTrellises();
  }

  /** Merge parts that need different tints into one vertex-coloured geometry. */
  mergeColoredParts(entries) {
    const normalised = entries.map((entry) => {
      const g = entry.geo.index ? entry.geo.toNonIndexed() : entry.geo.clone();
      for (const key of Object.keys(g.attributes)) {
        if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      const count = g.attributes.position.count;
      const arr = new Float32Array(count * 3);
      const c = new THREE.Color(entry.color);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    });
    return mergeGeometries(normalised, false) || normalised[0];
  }

  /**
   * Every rose arch in the world is drawn with three instanced meshes
   * (woodwork, blossoms, leaves) instead of one mesh per part.
   */
  buildTrellises() {
    if (!this.trellisPlacements || !this.trellisPlacements.length) return;

    const placements = this.trellisPlacements;
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb98a63, roughness: 0.75 });
    const blossomMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      emissive: 0xffb3d0,
      emissiveIntensity: 0.1
    });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7fbf8a, roughness: 0.8 });

    // One unit arch, built around a 1.75 radius; scaled per instance.
    const radius = 1.75;
    const woodParts = [];
    const arch = new THREE.TorusGeometry(radius, 0.09, 6, 16, Math.PI);
    arch.translate(0, 1.5, 0);
    woodParts.push(arch);
    for (const side of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.09, 0.11, 1.55, 7);
      leg.translate(side * radius, 0.78, 0);
      woodParts.push(leg);
    }
    const woodGeo = mergeGeometries(woodParts, false) || woodParts[0];

    const blossomGeo = new THREE.SphereGeometry(0.085, 6, 5);
    const leafGeo = new THREE.SphereGeometry(0.1, 6, 5);
    leafGeo.scale(1, 0.4, 0.6);

    const blossoms = [];
    const leaves = [];
    for (const t of placements) {
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI;
        const jitter = ((i * 37) % 7) / 22 - 0.15;
        const bx = Math.cos(a) * radius * t.scale;
        const by = t.y + (1.5 + Math.sin(a) * radius) * t.scale;
        const bz = t.z + jitter * 0.3 * t.scale;
        const cx = t.x;
        blossoms.push({
          x: cx + bx * 1.0,
          y: by + jitter * 0.12,
          z: bz,
          s: (0.8 + ((i * 13) % 5) / 12) * t.scale,
          color: new THREE.Color(t.flowerColor)
        });
        leaves.push({
          x: cx + bx * 0.96,
          y: by - 0.12 * t.scale,
          z: t.z + (-0.1 + jitter * 0.2) * t.scale,
          s: (0.9 + ((i * 7) % 4) / 10) * t.scale
        });
      }
    }

    const wood = instanced(woodGeo, woodMat, placements.map((t) => ({ x: t.x, y: t.y, z: t.z, ry: t.ry || 0, s: t.scale })));
    wood.name = 'trellis_wood';
    this.add(wood);

    const blossomMesh = instanced(blossomGeo, blossomMat, blossoms);
    blossomMesh.castShadow = false;
    blossomMesh.name = 'trellis_blossoms';
    this.add(blossomMesh);

    const leafMesh = instanced(leafGeo, leafMat, leaves);
    leafMesh.castShadow = false;
    leafMesh.name = 'trellis_leaves';
    this.add(leafMesh);
  }

  add(mesh, name) {
    mesh.name = name || 'decor';
    this.scene.add(mesh);
    this.groups.push(mesh);
    return mesh;
  }

  // --- shared geometry builders ------------------------------------------
  grassTuftGeometry(height = 0.5, blades = 3) {
    const parts = [];
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      const g = new THREE.ConeGeometry(0.045, height * (0.75 + (i % 2) * 0.25), 4, 1, true);
      g.translate(Math.cos(a) * 0.05, height * 0.32, Math.sin(a) * 0.05);
      g.rotateZ(Math.cos(a) * 0.22);
      g.rotateX(Math.sin(a) * 0.22);
      parts.push(g);
    }
    return mergeGeometries(parts, false);
  }

  rockGeometry(size = 0.4) {
    const g = new THREE.DodecahedronGeometry(size, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = 0.82 + ((i * 37) % 11) / 40;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.72, pos.getZ(i) * s);
    }
    g.computeVertexNormals();
    return g;
  }

  buildGrassBand(zoneId, colors, count, height, seedShift) {
    const placements = scatter(zoneId, count, { seedShift }).map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      ry: p.rand() * Math.PI * 2,
      s: 0.7 + p.rand() * 0.7,
      color: new THREE.Color(colors[Math.floor(p.rand() * colors.length)])
    }));
    if (!placements.length) return null;
    const mat = makeWindy(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, vertexColors: false }),
      this.windUniforms,
      0.1,
      1.5
    );
    const mesh = instanced(this.grassTuftGeometry(height), mat, placements);
    mesh.castShadow = false; // grass shadows cost more than they add
    return mesh;
  }

  buildRocks(zoneId, count, color, size, seedShift) {
    const placements = scatter(zoneId, count, { seedShift }).map((p) => ({
      x: p.x,
      y: p.y - size * 0.25,
      z: p.z,
      ry: p.rand() * Math.PI * 2,
      sx: size * (0.8 + p.rand() * 0.7),
      sy: size * (0.6 + p.rand() * 0.6),
      sz: size * (0.8 + p.rand() * 0.7)
    }));
    if (!placements.length) return null;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
    return instanced(this.rockGeometry(1), mat, placements);
  }

  // --- habitat specific ---------------------------------------------------
  buildMeadow() {
    const grass = this.buildGrassBand('flower_meadow', PALETTE.grassGreen, 320, 0.44, 1);
    if (grass) this.add(grass, 'meadow_grass');

    const rocks = this.buildRocks('flower_meadow', 10, 0xf0e2e6, 0.3, 2);
    if (rocks) this.add(rocks, 'meadow_rocks');

    // Rose trellis arch marking the entrance to the meadow
    const arch = this.buildTrellis(new THREE.Vector3(11, 0, 9), 0.7, 0xff9ec2);
    if (arch) this.add(arch, 'meadow_trellis');
  }

  buildGrassland() {
    const grass = this.buildGrassBand('sweet_grassland', PALETTE.grassLush, 300, 0.62, 3);
    if (grass) this.add(grass, 'grassland_grass');

    const rocks = this.buildRocks('sweet_grassland', 8, 0xd8cfc4, 0.45, 4);
    if (rocks) this.add(rocks, 'grassland_rocks');
  }

  buildSavanna() {
    const grass = this.buildGrassBand('sunset_savanna', PALETTE.grassGold, 340, 0.54, 5);
    if (grass) this.add(grass, 'savanna_grass');

    const rocks = this.buildRocks('sunset_savanna', 14, 0xc9a882, 0.5, 6);
    if (rocks) this.add(rocks, 'savanna_rocks');

    // Warm lanterns strung on short posts - the savanna's evening signature
    const posts = scatter('sunset_savanna', 12, { radiusScale: 0.7, seedShift: 7 });
    if (posts.length) {
      const postGeo = mergeGeometries([
        new THREE.CylinderGeometry(0.055, 0.07, 1.5, 6).translate(0, 0.75, 0),
        new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.55, 0)
      ], false);
      const postMat = new THREE.MeshStandardMaterial({
        color: 0x8a5a3c,
        emissive: 0xffb45c,
        emissiveIntensity: 0.35,
        roughness: 0.7
      });
      const mesh = instanced(postGeo, postMat, posts.map((p) => ({ x: p.x, y: p.y, z: p.z, ry: p.rand() * 6.28, s: 0.85 + p.rand() * 0.4 })));
      this.add(mesh, 'savanna_lanterns');
      this.lanternMaterial = postMat;
    }
  }

  buildLakeSide() {
    // Cattail reeds hugging the shoreline
    const lake = ZONES.capybara_lake;
    const reeds = [];
    let seed = 3311;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 150 && reeds.length < 110; i++) {
      const ang = rand() * Math.PI * 2;
      const r = 10.0 + rand() * 2.4;
      const x = lake.center[0] + Math.cos(ang) * r;
      const z = lake.center[2] + Math.sin(ang) * r;
      const depth = getWaterDepth(x, z);
      // Reeds grow in the shallows, right where the bank meets the water.
      if (depth <= 0.02 || depth > 0.4) continue;
      reeds.push({ x, z, y: getGroundHeight(x, z) - 0.05, ry: rand() * 6.28, s: 0.75 + rand() * 0.6 });
    }
    if (reeds.length) {
      const geo = mergeGeometries([
        new THREE.CylinderGeometry(0.035, 0.05, 1.15, 5).translate(0, 0.575, 0),
        new THREE.CylinderGeometry(0.075, 0.075, 0.3, 6).translate(0, 1.25, 0)
      ], false);
      const mat = makeWindy(new THREE.MeshStandardMaterial({ color: 0x7fae72, roughness: 0.8 }), this.windUniforms, 0.06, 1.1);
      const mesh = instanced(geo, mat, reeds);
      this.add(mesh, 'lake_reeds');
    }

    // Wooden jetty reaching into the water
    const jetty = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9c6b45, roughness: 0.72 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 5.0), woodMat);
    deck.position.set(0, 0.44, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    jetty.add(deck);
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6), woodMat);
        post.position.set(side * 0.92, 0.0, i * 1.9);
        post.castShadow = true;
        jetty.add(post);
      }
    }
    const jettyX = lake.center[0] + 9.6;
    const jettyZ = lake.center[2] + 5.6;
    jetty.position.set(jettyX, getGroundHeight(jettyX, jettyZ) + 0.1, jettyZ);
    jetty.rotation.y = -0.85;
    this.add(jetty, 'lake_jetty');
  }

  buildForest() {
    const rocks = this.buildRocks('fairytale_forest', 14, 0x8f7f8f, 0.42, 9);
    if (rocks) this.add(rocks, 'forest_rocks');

    // Mossy fallen logs
    const logs = scatter('fairytale_forest', 7, { radiusScale: 0.8, seedShift: 11 });
    if (logs.length) {
      const geo = mergeGeometries([
        new THREE.CylinderGeometry(0.22, 0.26, 2.4, 8).rotateZ(Math.PI / 2),
        new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6).translate(0.8, 0.24, 0.2)
      ], false);
      const mat = new THREE.MeshStandardMaterial({ color: 0x6b5140, roughness: 0.9, flatShading: true });
      const mesh = instanced(geo, mat, logs.map((p) => ({ x: p.x, y: p.y + 0.2, z: p.z, ry: p.rand() * 6.28, s: 0.9 + p.rand() * 0.5 })));
      this.add(mesh, 'forest_logs');
    }

    // Fairy light strands strung between the trees
    const lights = scatter('fairytale_forest', 46, { radiusScale: 0.75, seedShift: 12 });
    if (lights.length) {
      const geo = new THREE.SphereGeometry(0.07, 6, 5);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfff0c8,
        emissive: 0xffd98a,
        emissiveIntensity: 1.4,
        roughness: 0.4
      });
      const mesh = instanced(geo, mat, lights.map((p) => ({ x: p.x, y: p.y + 2.4 + p.rand() * 1.6, z: p.z, s: 1 })));
      mesh.castShadow = false;
      this.add(mesh, 'forest_fairylights');
      this.fairyMaterial = mat;
    }
  }

  buildIceKingdom() {
    const crystals = scatter('crystal_ice', 26, { radiusScale: 0.8, seedShift: 13 });
    if (crystals.length) {
      const geo = new THREE.OctahedronGeometry(0.42, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd8f2ff,
        emissive: 0x7fd2ff,
        emissiveIntensity: 0.35,
        roughness: 0.12,
        metalness: 0.35,
        transparent: true,
        opacity: 0.82,
        flatShading: true
      });
      const mesh = instanced(geo, mat, crystals.map((p) => ({
        x: p.x,
        y: p.y + 0.3 + p.rand() * 0.4,
        z: p.z,
        ry: p.rand() * 6.28,
        sx: 0.5 + p.rand() * 0.7,
        sy: 1.2 + p.rand() * 1.9,
        sz: 0.5 + p.rand() * 0.7
      })));
      this.add(mesh, 'ice_crystals');
      this.iceMaterial = mat;
    }

    // Snow drifts and a cosy igloo shelter
    const igloo = new THREE.Group();
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf3fbff, roughness: 0.6 });
    const domeGeo = new THREE.SphereGeometry(1.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, snowMat);
    dome.castShadow = true;
    dome.receiveShadow = true;
    igloo.add(dome);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 1.3, 12, 1, true, 0, Math.PI), snowMat);
    door.rotation.z = Math.PI / 2;
    door.rotation.y = Math.PI / 2;
    door.position.set(0, 0.6, 1.5);
    igloo.add(door);
    const iglooPos = new THREE.Vector3(-40, 0, -44);
    igloo.position.set(iglooPos.x, getGroundHeight(iglooPos.x, iglooPos.z) + 0.1, iglooPos.z);
    igloo.rotation.y = 0.6;
    this.add(igloo, 'ice_igloo');
  }

  buildLotusPond() {
    const pond = ZONES.lotus_pond;
    const pads = [];
    const flowers = [];
    let seed = 777;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 220 && pads.length < 46; i++) {
      const ang = rand() * Math.PI * 2;
      const r = 2.0 + rand() * 8.6;
      const x = pond.center[0] + Math.cos(ang) * r;
      const z = pond.center[2] + Math.sin(ang) * r;
      if (getWaterDepth(x, z) < 0.06) continue;
      (rand() < 0.42 ? flowers : pads).push({ x, z, rot: rand() * 6.28, s: 0.8 + rand() * 0.6 });
    }
    if (pads.length) {
      const geo = new THREE.CircleGeometry(0.5, 12);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0x6fbf8a, roughness: 0.55, side: THREE.DoubleSide });
      const mesh = instanced(geo, mat, pads.map((p) => ({ x: p.x, y: 0.06, z: p.z, ry: p.rot, s: p.s })));
      mesh.castShadow = false;
      this.add(mesh, 'pond_pads');
    }
    if (flowers.length) {
      const petals = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = new THREE.SphereGeometry(0.14, 8, 6);
        g.scale(1, 0.5, 0.55);
        g.translate(Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14);
        petals.push(g);
      }
      petals.push(new THREE.SphereGeometry(0.09, 8, 6).translate(0, 0.14, 0));
      const geo = mergeGeometries(petals, false);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffc0dd, roughness: 0.5, emissive: 0xff9ecb, emissiveIntensity: 0.12 });
      const mesh = instanced(geo, mat, flowers.map((p) => ({ x: p.x, y: 0.14, z: p.z, ry: p.rot, s: p.s })));
      mesh.castShadow = false;
      this.add(mesh, 'pond_lotus');
    }
  }

  buildSecretGarden() {
    const grass = this.buildGrassBand('secret_garden', [0xffd1e2, 0xffe6f0, 0xd9cdf7], 240, 0.4, 17);
    if (grass) this.add(grass, 'garden_grass');

    const arch = this.buildTrellis(new THREE.Vector3(0, 0, -21.5), 0.95, 0xffc0dd);
    if (arch) this.add(arch, 'garden_trellis');

    const arch2 = this.buildTrellis(new THREE.Vector3(-6.5, 0, -27), 0.8, 0xcdb4f6);
    if (arch2) this.add(arch2, 'garden_trellis2');

    // Heart topiary pair guarding the garden (one instanced draw for both)
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, 0.3);
    heartShape.bezierCurveTo(-0.75, -0.25, -0.42, -0.95, 0, -0.52);
    heartShape.bezierCurveTo(0.42, -0.95, 0.75, -0.25, 0, 0.3);
    const heartGeo = new THREE.ExtrudeGeometry(heartShape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 1
    });
    heartGeo.center();
    heartGeo.translate(0, 1.55, 0);
    heartGeo.scale(0.9, 0.9, 0.9);
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6).translate(0, 0.6, 0);
    const potGeo = new THREE.CylinderGeometry(0.42, 0.3, 0.44, 10).translate(0, 0.22, 0);

    const topiaryGeo = this.mergeColoredParts([
      { geo: heartGeo, color: 0x8fd39a },
      { geo: stemGeo, color: 0x7a5235 },
      { geo: potGeo, color: 0xf2d9c4 }
    ]);
    const topiaryMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
    const topiaryPlacements = [1, -1].map((sign) => {
      const x = sign * 3.4;
      const z = -25.5;
      return { x, y: getGroundHeight(x, z), z, s: 1 };
    });
    const topiary = instanced(topiaryGeo, topiaryMat, topiaryPlacements);
    topiary.name = 'garden_topiary';
    this.add(topiary);
  }

  buildFences() {
    // Low picket fences that suggest boundaries without walling habitats off.
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0xfff1e6, roughness: 0.7 });
    const postGeo = new THREE.BoxGeometry(0.1, 0.62, 0.1);
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 1.0);
    const postParts = [];
    const railParts = [];

    const runs = [
      { from: [16, 11], to: [27, 7], gap: 0.95 },
      { from: [30, 16], to: [36, 26], gap: 0.95 },
      { from: [-6, -13], to: [-14, -12], gap: 0.95 },
      { from: [-46, 22], to: [-34, 24], gap: 0.95 }
    ];
    for (const run of runs) {
      const a = new THREE.Vector2(run.from[0], run.from[1]);
      const b = new THREE.Vector2(run.to[0], run.to[1]);
      const len = a.distanceTo(b);
      const count = Math.max(2, Math.floor(len / run.gap));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const x = a.x + (b.x - a.x) * t;
        const z = a.y + (b.y - a.y) * t;
        const y = getGroundHeight(x, z);
        postParts.push(postGeo.clone().translate(x, y + 0.31, z));
        if (i < count) {
          const t2 = (i + 0.5) / count;
          const mx = a.x + (b.x - a.x) * t2;
          const mz = a.y + (b.y - a.y) * t2;
          const my = getGroundHeight(mx, mz);
          const ang = Math.atan2(b.x - a.x, b.y - a.y);
          const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
          const g1 = railGeo.clone();
          g1.rotateY(0);
          g1.translate(0, 0.42, 0);
          g1.rotateX(0);
          // rotate around the run direction
          const m = new THREE.Matrix4().makeRotationY(ang);
          g1.applyMatrix4(m);
          g1.translate(mx, my, mz);
          railParts.push(g1);
        }
      }
    }
    if (postParts.length) {
      const posts = new THREE.Mesh(mergeGeometries(postParts, false), fenceMat);
      posts.castShadow = true;
      posts.receiveShadow = true;
      this.add(posts, 'fence_posts');
    }
    if (railParts.length) {
      const rails = new THREE.Mesh(mergeGeometries(railParts, false), fenceMat);
      rails.castShadow = true;
      this.add(rails, 'fence_rails');
    }
  }

  /**
   * Rose-covered wooden arch used to frame habitat entrances. Only the
   * placement is recorded here; buildTrellises() draws them all instanced.
   */
  buildTrellis(position, scale = 0.8, flowerColor = 0xff9ec2) {
    if (!this.trellisPlacements) this.trellisPlacements = [];
    this.trellisPlacements.push({
      x: position.x,
      y: getGroundHeight(position.x, position.z),
      z: position.z,
      scale,
      flowerColor,
      ry: 0
    });
    return null;
  }

  update(delta, time) {
    for (const u of this.windUniforms) {
      if (u.uTime) u.uTime.value = time;
    }
    if (this.fairyMaterial) {
      this.fairyMaterial.emissiveIntensity = 1.2 + Math.sin(time * 2.1) * 0.35;
    }
    if (this.iceMaterial) {
      this.iceMaterial.emissiveIntensity = 0.28 + Math.sin(time * 1.3) * 0.14;
    }
    if (this.lanternMaterial) {
      this.lanternMaterial.emissiveIntensity = 0.3 + Math.sin(time * 1.7) * 0.16;
    }
  }
}

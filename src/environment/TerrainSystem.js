/**
 * TerrainSystem.js
 * The zoo's ground: sculpted hills with vertex-coloured biomes, cobblestone
 * paths, arch bridges, three tree species, wildflowers, glowing mushrooms,
 * rocks, lamps, a bench and signposts.
 *
 * Everything is instanced or merged per material, so the whole terrain costs
 * roughly twenty draw calls instead of the thousand-plus it used to.
 * Elevation always comes from terrainHeight.js, so props, animals and the
 * camera can never disagree about where the ground is.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sculptHeight, getGroundHeight, getWaterDepth, WATER_BODIES, SNOW_ISLAND } from './terrainHeight.js';

const WATER_LEVEL = WATER_BODIES[0].level;

function instanced(geo, mat, placements, { shadow = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  const dummy = new THREE.Object3D();
  let coloured = false;
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    const s = p.s ?? 1;
    dummy.scale.set(p.sx ?? s, p.sy ?? s, p.sz ?? s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (p.color) {
      coloured = true;
      mesh.setColorAt(i, p.color);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (coloured && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  return mesh;
}

/** Cheap analytic wind, injected into the vertex shader. */
function windify(material, uniforms, strength, speed) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float bend = max(transformed.y, 0.0);
          float phase = (instanceMatrix[3].x * 0.3) + (instanceMatrix[3].z * 0.26);
          transformed.x += sin(uTime * ${speed.toFixed(2)} + phase) * ${strength.toFixed(3)} * bend;
          transformed.z += cos(uTime * ${(speed * 0.77).toFixed(2)} + phase * 1.21) * ${(strength * 0.65).toFixed(3)} * bend;
        }`
      );
    uniforms.push(shader.uniforms);
  };
  material.customProgramCacheKey = () => 'terrain-wind';
  return material;
}

export class TerrainSystem {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];
    this.mushrooms = [];
    this.windUniforms = [];

    this.createBaseTerrain();
    this.createPaths();
    this.createWoodenBridges();
    this.createTrees();
    this.createFlowerFields();
    this.createGlowingMushrooms();
    this.createRocks();
    this.createLamps();
    this.createBenchesAndProps();
    this.createSignposts();
  }

  // ======================================================================
  //  GROUND
  // ======================================================================
  createBaseTerrain() {
    const size = 260;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(0x9ad3a6);
    const grassDeep = new THREE.Color(0x7fbd91);
    const grassDry = new THREE.Color(0xbfd08f);
    const sand = new THREE.Color(0xe8dcc4);
    const rock = new THREE.Color(0xa89c9c);
    const snow = new THREE.Color(0xeef6ff);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = sculptHeight(x, z);
      pos.setY(i, y);

      // --- biome tinting: this is what makes the map feel like one world ---
      const radial = Math.hypot(x, z);
      c.copy(grass);

      // Dry golden band across the savanna (north-west)
      const savanna = 1 - THREE.MathUtils.clamp(Math.hypot(x + 40, z - 30) / 26, 0, 1);
      c.lerp(grassDry, savanna * 0.8);

      // Cooler, deeper green under the forest canopy
      const forest = 1 - THREE.MathUtils.clamp(Math.hypot(x + 18, z + 26) / 24, 0, 1);
      c.lerp(grassDeep, forest * 0.75);

      // Sandy banks around every water body
      let sandAmount = 0;
      for (const w of WATER_BODIES) {
        const d = Math.hypot(x - w.x, z - w.z);
        sandAmount = Math.max(sandAmount, 1 - THREE.MathUtils.clamp((d - w.radius) / (w.shoreWidth + 1.5), 0, 1));
      }
      c.lerp(sand, sandAmount * 0.85);

      // Rocky slopes where the land climbs
      const up = Math.max(0, (y - sculptHeight(x + 1.2, z)) / 1.2, (y - sculptHeight(x, z + 1.2)) / 1.2);
      c.lerp(rock, THREE.MathUtils.clamp(up * 0.6, 0, 0.5));

      // Snow on the high peaks behind the penguin isle
      if (y > 2.4) c.lerp(snow, THREE.MathUtils.clamp((y - 2.4) / 2.2, 0, 0.92));

      // A soft pastel lift near the plaza so the entrance reads as manicured
      if (radial < 26) c.lerp(new THREE.Color(0xb6e0bb), (1 - radial / 26) * 0.4);

      // Lake bed darkens for believable depth
      for (const w of WATER_BODIES) {
        if (Math.hypot(x - w.x, z - w.z) < w.radius) {
          c.lerp(new THREE.Color(0x5f8f86), 0.55);
          break;
        }
      }

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: false
    });

    this.groundMesh = new THREE.Mesh(geo, mat);
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // --- Penguin snow island: a flat shelf whose top matches getGroundHeight
    const islandTop = SNOW_ISLAND.height;
    const islandH = islandTop + 0.6;
    const islandGeo = new THREE.CylinderGeometry(SNOW_ISLAND.radius, SNOW_ISLAND.radius + 1.6, islandH, 40);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0xeef8ff, roughness: 0.42, metalness: 0.06 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(SNOW_ISLAND.x, islandTop - islandH / 2, SNOW_ISLAND.z);
    island.receiveShadow = true;
    island.castShadow = true;
    this.scene.add(island);

    // Icy rim so the shelf reads as an intentional island
    const rimGeo = new THREE.TorusGeometry(SNOW_ISLAND.radius + 0.6, 0.42, 6, 44);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0xd4efff, roughness: 0.3, metalness: 0.2 }));
    rim.position.set(SNOW_ISLAND.x, islandTop - 0.1, SNOW_ISLAND.z);
    rim.receiveShadow = true;
    this.scene.add(rim);
  }

  // ======================================================================
  //  PATHS
  // ======================================================================
  createPaths() {
    const waypoints = [
      [0, 0, 30], [0, 0, 18], [0, 0, 5],
      [20, 0, 15], [0, 0, 5],
      [-14, 0, 10], [-10, 0, -12], [0, 0, -28],
      [22, 0, -15], [-25, 0, -35]
    ].map((p) => new THREE.Vector3(p[0], p[1], p[2]));

    const stones = [];
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let w = 0; w < waypoints.length - 1; w++) {
      const a = waypoints[w];
      const b = waypoints[w + 1];
      const dist = a.distanceTo(b);
      const steps = Math.max(2, Math.floor(dist / 1.4));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = THREE.MathUtils.lerp(a.x, b.x, t) + (rand() - 0.5) * 0.5;
        const z = THREE.MathUtils.lerp(a.z, b.z, t) + (rand() - 0.5) * 0.5;
        if (getWaterDepth(x, z) > 0.1) continue;
        stones.push({
          x,
          y: getGroundHeight(x, z) + 0.05,
          z,
          ry: rand() * Math.PI,
          sx: 0.85 + rand() * 0.4,
          sy: 1,
          sz: 0.85 + rand() * 0.4
        });
      }
    }

    const stoneGeo = new THREE.CylinderGeometry(0.72, 0.78, 0.09, 9);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe9dfd6, roughness: 0.9, flatShading: true });
    const mesh = instanced(stoneGeo, stoneMat, stones, { shadow: false });
    mesh.name = 'path_stones';
    this.scene.add(mesh);
    this.pathMesh = mesh;
  }

  // ======================================================================
  //  BRIDGES
  // ======================================================================
  createWoodenBridges() {
    const bridges = [
      { from: new THREE.Vector3(-6, 0, 12), to: new THREE.Vector3(-16, 0, 12) },
      { from: new THREE.Vector3(11, 0, -9), to: new THREE.Vector3(18, 0, -15) }
    ];

    const plankGeo = new THREE.BoxGeometry(2.5, 0.16, 0.62);
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x9c6b45, roughness: 0.78 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5235, roughness: 0.72 });

    const planks = [];
    const rails = [];

    for (const bridge of bridges) {
      const mid = bridge.from.clone().lerp(bridge.to, 0.5);
      mid.y = Math.max(getGroundHeight(mid.x, mid.z), WATER_LEVEL);
      const dist = bridge.from.distanceTo(bridge.to);
      const dir = bridge.to.clone().sub(bridge.from).setY(0).normalize();
      const angle = Math.atan2(dir.x, dir.z);

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, -dist / 2),
        new THREE.Vector3(0, 1.25, 0),
        new THREE.Vector3(0, 0, dist / 2)
      );
      const points = curve.getPoints(13);
      points.forEach((pt, i) => {
        const local = new THREE.Vector3(pt.x, pt.y, pt.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        planks.push({
          x: mid.x + local.x,
          y: mid.y + local.y,
          z: mid.z + local.z,
          ry: angle,
          sy: 1
        });
      });

      for (const side of [-1.18, 1.18]) {
        const railCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(side, 0.82, -dist / 2),
          new THREE.Vector3(side, 2.05, 0),
          new THREE.Vector3(side, 0.82, dist / 2)
        );
        const tube = new THREE.TubeGeometry(railCurve, 18, 0.085, 7, false);
        tube.applyMatrix4(new THREE.Matrix4().makeRotationY(angle));
        tube.translate(mid.x, mid.y, mid.z);
        rails.push(tube);
      }
    }

    if (planks.length) {
      const mesh = instanced(plankGeo, plankMat, planks);
      mesh.name = 'bridge_planks';
      this.scene.add(mesh);
    }
    if (rails.length) {
      const merged = mergeGeometries(rails, false);
      if (merged) {
        const railMesh = new THREE.Mesh(merged, railMat);
        railMesh.castShadow = true;
        railMesh.receiveShadow = true;
        this.scene.add(railMesh);
      }
    }
  }

  // ======================================================================
  //  VEGETATION
  // ======================================================================

  /**
   * Merge parts that share a material but need different tints, by baking
   * per-vertex colours. One draw call per species, no colour loss.
   * Everything is normalised to non-indexed with position/normal/colour only,
   * because three cannot merge indexed and non-indexed geometry.
   */
  mergeColored(entries) {
    const normalised = entries.map((entry) => {
      let g = entry.geo.index ? entry.geo.toNonIndexed() : entry.geo.clone();
      for (const key of Object.keys(g.attributes)) {
        if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      const count = g.attributes.position.count;
      const col = new Float32Array(count * 3);
      const c = new THREE.Color(entry.color);
      for (let i = 0; i < count; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = mergeGeometries(normalised, false);
    if (!merged) console.warn('TerrainSystem: mergeColored failed, using the first part only');
    return merged || normalised[0];
  }

  sakuraGeometry() {
    const trunk = new THREE.CylinderGeometry(0.36, 0.7, 4.6, 7);
    trunk.translate(0, 2.3, 0);
    const entries = [{ geo: trunk, color: 0x7a563c }];
    const puffs = [
      [0, 4.4, 0, 1.45], [-1.2, 4.1, 0.85, 1.05], [1.2, 4.2, -0.7, 1.15],
      [0.7, 5.0, 0.65, 0.95], [-0.75, 5.1, -0.7, 0.9], [0, 5.5, 0, 0.8]
    ];
    for (const [x, y, z, s] of puffs) {
      const puff = new THREE.DodecahedronGeometry(1.7, 0);
      puff.scale(s, s * 0.86, s);
      puff.translate(x, y, z);
      entries.push({ geo: puff, color: 0xffbcd4 });
    }
    return this.mergeColored(entries);
  }

  forestTreeGeometry() {
    const trunk = new THREE.CylinderGeometry(0.42, 0.78, 5.2, 7);
    trunk.translate(0, 2.6, 0);
    const entries = [{ geo: trunk, color: 0x5f4230 }];
    const puffs = [
      [0, 5.4, 0, 1.55], [-1.3, 5.0, 0.9, 1.15], [1.3, 5.1, -0.9, 1.2], [0, 6.5, 0, 0.95]
    ];
    for (const [x, y, z, s] of puffs) {
      const puff = new THREE.DodecahedronGeometry(1.85, 0);
      puff.scale(s, s * 0.92, s);
      puff.translate(x, y, z);
      entries.push({ geo: puff, color: 0x76c48a });
    }
    return this.mergeColored(entries);
  }

  pineGeometry() {
    const trunk = new THREE.CylinderGeometry(0.32, 0.52, 3.6, 7);
    trunk.translate(0, 1.8, 0);
    const entries = [{ geo: trunk, color: 0x50412f }];
    for (let c = 0; c < 3; c++) {
      const cone = new THREE.ConeGeometry(2.5 - c * 0.62, 2.5, 7);
      cone.translate(0, 3.1 + c * 1.45, 0);
      entries.push({ geo: cone, color: c === 2 ? 0xf0fbff : 0x9fd6cb });
    }
    return this.mergeColored(entries);
  }

  createTrees() {
    const species = [
      {
        id: 'sakura',
        geo: this.sakuraGeometry(),
        shadow: true,
        spots: [[14, 22], [26, 18], [22, 30], [33, 9], [-5, 28], [7, 26], [18, 6], [30, 27], [12, 12]]
      },
      {
        id: 'forest',
        geo: this.forestTreeGeometry(),
        shadow: true,
        spots: [[-10, -22], [-22, -17], [-29, -27], [-15, -33], [-2, -16], [-5, -38], [13, -35], [-26, -20], [-33, -22], [-8, -30]]
      },
      {
        id: 'pine',
        geo: this.pineGeometry(),
        shadow: true,
        spots: [[-42, -34], [-45, -47], [-30, -52], [-22, -45], [-46, -28], [-38, -55]]
      }
    ];

    let seed = 1337;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (const spec of species) {
      const placements = [];
      for (const [x, z] of spec.spots) {
        if (getWaterDepth(x, z) > 0.1) continue;
        placements.push({
          x,
          y: getGroundHeight(x, z),
          z,
          ry: rand() * Math.PI * 2,
          s: 0.82 + rand() * 0.5,
          color: new THREE.Color().setHSL(0.92, 0.35, 0.94 + rand() * 0.06)
        });
      }
      if (!placements.length) continue;
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.02,
        flatShading: true
      });
      const mesh = instanced(spec.geo, mat, placements);
      mesh.name = `trees_${spec.id}`;
      this.scene.add(mesh);
      this.trees.push(mesh);
    }
  }

  createFlowerFields() {
    const stem = new THREE.CylinderGeometry(0.035, 0.045, 0.55, 5);
    stem.translate(0, 0.27, 0);
    const head = new THREE.DodecahedronGeometry(0.2, 0);
    head.scale(1, 0.8, 1);
    head.translate(0, 0.6, 0);

    // Stem + head merged with vertex colours, then tinted per instance.
    const flowerGeo = this.mergeColored([
      { geo: stem, color: 0x8fd39a },
      { geo: head, color: 0xffffff }
    ]);

    const palette = [0xff9ec2, 0xffd1e0, 0xffe9a8, 0xc7a4ff, 0x9fe4ff, 0xffffff, 0xffb894];
    const placements = [];
    let seed = 909;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    // Dense in the flower meadow + secret garden, scattered elsewhere.
    const patches = [
      { x: 21, z: 15, r: 15, n: 520 },
      { x: 0, z: -30, r: 13, n: 300 },
      { x: 28, z: 20, r: 11, n: 130 },
      { x: 33, z: 21, r: 12, n: 110 },
      { x: 26, z: -16, r: 12, n: 90 },
      { x: -40, z: 30, r: 12, n: 60 }
    ];

    for (const patch of patches) {
      for (let i = 0; i < patch.n; i++) {
        const ang = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * patch.r;
        const x = patch.x + Math.cos(ang) * d;
        const z = patch.z + Math.sin(ang) * d;
        if (getWaterDepth(x, z) > 0.15) continue;
        const s = 0.75 + rand() * 0.6;
        placements.push({
          x,
          y: getGroundHeight(x, z),
          z,
          ry: rand() * Math.PI,
          rz: (rand() - 0.5) * 0.22,
          sx: s,
          sy: s * (0.85 + rand() * 0.4),
          sz: s,
          color: new THREE.Color(palette[Math.floor(rand() * palette.length)])
        });
      }
    }

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.02 });
    windify(mat, this.windUniforms, 0.05, 1.9);
    const mesh = instanced(flowerGeo, mat, placements, { shadow: false });
    mesh.name = 'flowers';
    this.scene.add(mesh);
    this.flowerMesh = mesh;
  }

  createGlowingMushrooms() {
    const capGeo = new THREE.SphereGeometry(0.46, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1.15, 0.72, 1.15);
    capGeo.translate(0, 0.7, 0);
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.72, 7);
    stemGeo.translate(0, 0.36, 0);

    const spots = [[-14, -18], [-18, -22], [-24, -15], [-9, -25], [-22, -28], [-16, -32], [2, -25], [-27, -18], [-12, -29]];
    let seed = 77;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const caps = [];
    const stems = [];
    for (const [x, z] of spots) {
      const y = getGroundHeight(x, z);
      const s = 0.75 + rand() * 0.7;
      caps.push({ x, y, z, ry: rand() * Math.PI, s });
      stems.push({ x, y, z, ry: 0, s });
    }

    this.mushroomCapMat = new THREE.MeshStandardMaterial({
      color: 0x8ceaff,
      emissive: 0x2fd2f0,
      emissiveIntensity: 0.7,
      roughness: 0.35
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xfdf6ff, roughness: 0.6 });

    const capMesh = instanced(capGeo, this.mushroomCapMat, caps, { shadow: false });
    const stemMesh = instanced(stemGeo, stemMat, stems, { shadow: false });
    capMesh.name = 'mushroom_caps';
    stemMesh.name = 'mushroom_stems';
    this.scene.add(capMesh);
    this.scene.add(stemMesh);
    this.mushrooms.push(capMesh, stemMesh);
  }

  createRocks() {
    const geo = new THREE.DodecahedronGeometry(0.6, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = 0.8 + ((i * 37) % 11) / 30;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.7, pos.getZ(i) * s);
    }
    geo.computeVertexNormals();

    const spots = [
      [8, 20], [30, 12], [-30, 8], [-12, 6], [16, -6], [-6, -12], [22, 4],
      [34, -4], [-34, 22], [-44, 34], [6, -32], [-20, 40], [40, 18], [-40, 12]
    ];
    let seed = 555;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const placements = [];
    for (const [x, z] of spots) {
      if (getWaterDepth(x, z) > 0.1) continue;
      placements.push({
        x,
        y: getGroundHeight(x, z) + 0.15,
        z,
        ry: rand() * Math.PI,
        sx: 0.5 + rand() * 0.9,
        sy: 0.35 + rand() * 0.6,
        sz: 0.5 + rand() * 0.9
      });
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9bcc2, roughness: 0.95, flatShading: true });
    const mesh = instanced(geo, mat, placements);
    mesh.name = 'rocks';
    this.scene.add(mesh);
  }

  createLamps() {
    // Warm path lanterns: emissive, no extra lights, so night stays cheap.
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6);
    post.translate(0, 0.85, 0);
    const globe = new THREE.SphereGeometry(0.16, 10, 8);
    globe.translate(0, 1.82, 0);
    const geo = this.mergeColored([
      { geo: post, color: 0x8a6a4c },
      { geo: globe, color: 0xffe6b0 }
    ]);

    const spots = [
      [3.2, 24], [-3.2, 20], [3.4, 13], [-3.4, 9], [6, 3], [-6, 0],
      [14, 12], [-10, 6], [11, -6], [-14, -8]
    ];
    let seed = 61;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const placements = spots
      .filter(([x, z]) => getWaterDepth(x, z) <= 0.1)
      .map(([x, z]) => ({
        x,
        y: getGroundHeight(x, z),
        z,
        ry: rand() * Math.PI * 2,
        s: 0.95 + rand() * 0.2
      }));

    this.lampMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: 0xffd9a0,
      emissiveIntensity: 0.25,
      roughness: 0.62
    });
    const mesh = instanced(geo, this.lampMat, placements);
    mesh.name = 'lamps';
    this.scene.add(mesh);
  }

  createBenchesAndProps() {
    const wood = new THREE.BoxGeometry(2.6, 0.12, 0.84);
    wood.translate(0, 0.62, 0);
    const back = new THREE.BoxGeometry(2.6, 0.72, 0.12);
    back.translate(0, 1.12, -0.36);
    const legL = new THREE.BoxGeometry(0.14, 0.62, 0.8);
    legL.translate(-1.1, 0.31, 0);
    const legR = legL.clone();
    legR.translate(2.2, 0, 0);

    const geo = this.mergeColored([
      { geo: wood, color: 0xb08155 },
      { geo: back, color: 0xb08155 },
      { geo: legL, color: 0xfdf2f7 },
      { geo: legR, color: 0xfdf2f7 }
    ]);

    const spots = [
      { x: 15, z: 12, ry: -Math.PI / 3 },
      { x: -18, z: 6, ry: Math.PI * 0.35 },
      { x: 0, z: -22, ry: 0.2 },
      { x: 30, z: 17, ry: -1.1 }
    ].filter((p) => getWaterDepth(p.x, p.z) <= 0.1);

    const placements = spots.map((p) => ({
      x: p.x,
      y: getGroundHeight(p.x, p.z),
      z: p.z,
      ry: p.ry,
      s: 1
    }));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, flatShading: true });
    const mesh = instanced(geo, mat, placements);
    mesh.name = 'benches';
    this.scene.add(mesh);
  }

  createSignposts() {
    const postGroup = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a6242, roughness: 0.82 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.9, 7), poleMat);
    pole.position.y = 1.45;
    pole.castShadow = true;
    postGroup.add(pole);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), poleMat);
    finial.position.y = 2.95;
    finial.castShadow = true;
    postGroup.add(finial);

    const signs = [
      { text: 'Vườn Thỏ', y: 2.35, ry: 0.55, arrow: 'right' },
      { text: 'Hồ Capybara', y: 1.82, ry: 2.7, arrow: 'left' },
      { text: 'Vườn Của Nhi', y: 1.3, ry: -1.45, arrow: 'right' }
    ];

    for (const cfg of signs) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fdf0e6';
      ctx.beginPath();
      ctx.roundRect(5, 5, 310, 70, 15);
      ctx.fill();
      ctx.strokeStyle = '#b9834f';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.font = 'bold 30px "Quicksand", sans-serif';
      ctx.fillStyle = '#5c3317';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.text, 158, 42);

      // hand-drawn arrow instead of an emoji
      ctx.strokeStyle = '#a8724a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const ax = cfg.arrow === 'right' ? 280 : 32;
      const dir = cfg.arrow === 'right' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(ax, 40);
      ctx.lineTo(ax + dir * 14, 40);
      ctx.moveTo(ax + dir * 14, 40);
      ctx.lineTo(ax + dir * 6, 34);
      ctx.moveTo(ax + dir * 14, 40);
      ctx.lineTo(ax + dir * 6, 46);
      ctx.stroke();

      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 4;
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.5, 0.09),
        [
          new THREE.MeshStandardMaterial({ color: 0xe4c9a8, roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ color: 0xe4c9a8, roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ color: 0xe4c9a8, roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ color: 0xe4c9a8, roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 }),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 })
        ]
      );
      sign.position.set(0.75, cfg.y, 0);
      sign.rotation.y = cfg.ry;
      sign.castShadow = true;
      postGroup.add(sign);
    }

    postGroup.position.set(0, getGroundHeight(0, 6), 6);
    this.scene.add(postGroup);
  }

  update(delta, time) {
    for (const u of this.windUniforms) {
      if (u.uTime) u.uTime.value = time;
    }
    if (this.mushroomCapMat) {
      this.mushroomCapMat.emissiveIntensity = 0.5 + Math.sin(time * 2.4) * 0.28;
    }
    if (this.lampMat) {
      // Lanterns glow warmer after dusk.
      const night = this.scene.userData?.nightFactor ?? 0;
      this.lampMat.emissiveIntensity = 0.22 + night * 0.9;
    }
  }
}

/**
 * WaterSystem.js
 * Crystalline stylized pastel water pond with procedural wave ripples,
 * floating water lilies, lotus flowers, and shoreline rocks.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class WaterSystem {
  constructor(scene) {
    this.scene = scene;
    this.waterMeshes = [];
    this.lotusFlowers = [];
    this.time = 0;

    this.createMainLake();
    this.createLotusPond();
  }

  createMainLake() {
    // Serene Capybara Lake at (-22, 0.35, 10)
    const lakeGeo = new THREE.CylinderGeometry(11, 12, 0.8, 36);
    // NOTE: deliberately NOT a transmission material. three.js renders the
    // entire scene into an off-screen target for every transmissive object,
    // which doubled the triangle count and halved the frame rate. Plain
    // transparency with a low roughness reads just as glassy here.
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x64c8d8,
      emissive: 0x1b4d5e,
      emissiveIntensity: 0.18,
      roughness: 0.14,
      metalness: 0.12,
      transparent: true,
      opacity: 0.86
    });

    const lake = new THREE.Mesh(lakeGeo, waterMat);
    // Cylinder is 0.8 tall, so the centre sits 0.4 below the surface line.
    // The surface (y = 0.05) is deliberately below the surrounding bank so the
    // shoreline hides the rim instead of showing a floating disc.
    const WATER_SURFACE = 0.05;
    lake.position.set(-22, WATER_SURFACE - 0.4, 10);
    lake.userData.baseY = lake.position.y;
    lake.receiveShadow = true;
    this.scene.add(lake);
    this.waterMeshes.push(lake);

    // Lake Bed Sandy Bowl
    const bedGeo = new THREE.CylinderGeometry(11.5, 10.5, 0.9, 36);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0xd7e4df,
      roughness: 0.95,
      metalness: 0.05
    });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(-22, WATER_SURFACE - 0.62, 10);
    bed.scale.set(1.02, 1.0, 1.02);
    bed.receiveShadow = true;
    this.scene.add(bed);

    // Lily pads on lake
    this.createLilyPads(-22, WATER_SURFACE + 0.07, 10, 7.5, 6);
  }

  createLotusPond() {
    // Flamingo Lotus Pond at (26, 0.35, -16)
    const pondGeo = new THREE.CylinderGeometry(10, 11, 0.8, 36);
    const pondMat = new THREE.MeshStandardMaterial({
      color: 0x5abed5,
      emissive: 0x14404e,
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.12,
      transparent: true,
      opacity: 0.85
    });

    const pond = new THREE.Mesh(pondGeo, pondMat);
    pond.position.set(26, 0.05 - 0.4, -16);
    pond.userData.baseY = pond.position.y;
    pond.receiveShadow = true;
    this.scene.add(pond);
    this.waterMeshes.push(pond);

    // Lily pads and Lotus blooms
    this.createLilyPads(26, 0.12, -16, 7.0, 8, true);
  }

  createLilyPads(centerX, y, centerZ, radius, count, withFlowers = false) {
    const padGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x58a87d, roughness: 0.6, metalness: 0.1 });

    // One instanced draw for every pad (with a notch cut for charm).
    const pads = [];
    const flowers = [];
    const notches = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = Math.random() * (radius * 0.7);
      const px = centerX + Math.cos(angle) * dist;
      const pz = centerZ + Math.sin(angle) * dist;
      const scale = 0.7 + Math.random() * 0.5;

      pads.push({ x: px, y, z: pz, ry: Math.random() * Math.PI, sx: scale, sy: 1, sz: scale });
      notches.push({ x: px + Math.cos(angle) * 0.62 * scale, y: y + 0.03, z: pz + Math.sin(angle) * 0.62 * scale, ry: angle, sx: 0.34 * scale, sy: 0.5, sz: 1.4 * scale });

      if (withFlowers && i % 2 === 0) {
        flowers.push({ x: px, y: y + 0.12, z: pz, ry: Math.random() * Math.PI, s: 0.6 });
      }
    }

    const padMesh = new THREE.InstancedMesh(padGeo, padMat, pads.length);
    const dummy = new THREE.Object3D();
    pads.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      padMesh.setMatrixAt(i, dummy.matrix);
    });
    padMesh.instanceMatrix.needsUpdate = true;
    padMesh.receiveShadow = true;
    padMesh.name = 'lily_pads';
    this.scene.add(padMesh);

    const notchMat = new THREE.MeshStandardMaterial({ color: 0x2f6b52, roughness: 0.7 });
    const notchMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), notchMat, notches.length);
    notches.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      notchMesh.setMatrixAt(i, dummy.matrix);
    });
    notchMesh.instanceMatrix.needsUpdate = true;
    notchMesh.name = 'lily_notches';
    this.scene.add(notchMesh);

    // Lotuses: one merged blossom geometry, instanced.
    if (flowers.length) {
      const lotusGeo = this.buildLotusGeometry();
      const lotusMat = new THREE.MeshStandardMaterial({
        color: 0xffb7c5,
        roughness: 0.42,
        emissive: 0xff8fb8,
        emissiveIntensity: 0.08
      });
      const lotusMesh = new THREE.InstancedMesh(lotusGeo, lotusMat, flowers.length);
      flowers.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.ry, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        lotusMesh.setMatrixAt(i, dummy.matrix);
      });
      lotusMesh.instanceMatrix.needsUpdate = true;
      lotusMesh.name = 'lotus_flowers';
      this.scene.add(lotusMesh);
      this.lotusFlowers.push(lotusMesh);
    }
  }

  /** A full lotus blossom merged into a single geometry (12 petals + core). */
  buildLotusGeometry() {
    const parts = [];
    const petalCount = 7;
    for (let layer = 0; layer < 2; layer++) {
      const radius = 0.3 + layer * 0.22;
      const tilt = 0.28 + layer * 0.3;
      for (let p = 0; p < petalCount; p++) {
        const ang = (p / petalCount) * Math.PI * 2 + (layer * Math.PI) / petalCount;
        const petal = new THREE.ConeGeometry(0.32, 0.8, 5);
        petal.translate(0, 0.25, 0);
        petal.rotateZ(-tilt);
        petal.translate(Math.cos(ang) * radius, 0.25, Math.sin(ang) * radius);
        petal.rotateY(-ang + Math.PI / 2);
        parts.push(petal);
      }
    }
    const core = new THREE.SphereGeometry(0.25, 10, 8);
    core.translate(0, 0.22, 0);
    parts.push(core);
    return mergeGeometries(parts, false) || parts[0];
  }

  createLotusMesh() {
    const group = new THREE.Group();

    const stamenGeo = new THREE.SphereGeometry(0.25, 10, 10);
    const stamenMat = new THREE.MeshStandardMaterial({
      color: 0xffd966,
      emissive: 0xffaa00,
      emissiveIntensity: 0.3
    });
    const stamen = new THREE.Mesh(stamenGeo, stamenMat);
    stamen.position.y = 0.18;
    group.add(stamen);

    const petalGeo = new THREE.ConeGeometry(0.32, 0.8, 5);
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffb7c5,
      roughness: 0.4
    });

    const petalCount = 7;
    for (let layer = 0; layer < 2; layer++) {
      const radius = 0.3 + layer * 0.22;
      const tilt = 0.28 + layer * 0.3;
      for (let p = 0; p < petalCount; p++) {
        const ang = (p / petalCount) * Math.PI * 2 + (layer * Math.PI / petalCount);
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(Math.cos(ang) * radius, 0.25, Math.sin(ang) * radius);
        petal.rotation.y = -ang + Math.PI / 2;
        petal.rotation.z = -tilt;
        group.add(petal);
      }
    }

    return group;
  }

  createCapybaraSpaDeck(x, y, z) {
    const deck = new THREE.Group();

    const slatGeo = new THREE.BoxGeometry(0.5, 0.15, 3.8);
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xb58a63,
      roughness: 0.75
    });

    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(slatGeo, woodMat);
      slat.position.set(i * 0.55, 0, 0);
      slat.castShadow = true;
      slat.receiveShadow = true;
      deck.add(slat);
    }

    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.6, 8);
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(2.6, 0.8, 1.6);
    post.castShadow = true;
    deck.add(post);

    const lampGeo = new THREE.SphereGeometry(0.3, 10, 10);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffdf80,
      emissive: 0xffb74d,
      emissiveIntensity: 0.8
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(2.6, 1.6, 1.6);
    deck.add(lamp);

    deck.position.set(x, y, z);
    this.scene.add(deck);
  }

  update(delta) {
    this.time += delta;
    for (let i = 0; i < this.waterMeshes.length; i++) {
      const mesh = this.waterMeshes[i];
      mesh.position.y = (mesh.userData.baseY ?? mesh.position.y) + Math.sin(this.time * 1.2 + i * 2) * 0.02;
    }
    for (let i = 0; i < this.lotusFlowers.length; i++) {
      const f = this.lotusFlowers[i];
      f.position.y += Math.sin(this.time * 2.0 + i) * 0.0006;
    }
  }
}

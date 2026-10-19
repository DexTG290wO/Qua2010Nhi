/**
 * SecretGarden.js
 * Nhi's Secret Garden - The most special enchanted sanctuary in the zoo.
 * Features a crystal rose gazebo, magical wishing fountain, glowing flora,
 * engraved romantic bench, and an interactive Golden Gift Box.
 */

import * as THREE from 'three';

export class SecretGarden {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'secret_garden';
    this.giftBox = null;
    this.giftBoxLid = null;
    this.isBoxOpen = false;
    this.boxOpenProgress = 0.0;
    this.time = 0;

    this.createGardenStructure();
    this.group.position.set(0, 0, -28); // Located at the northern scenic overlook
    this.scene.add(this.group);
  }

  createGardenStructure() {
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0xfffcf9,
      roughness: 0.25,
      metalness: 0.1
    });

    const roseGoldMat = new THREE.MeshStandardMaterial({
      color: 0xefa996,
      roughness: 0.2,
      metalness: 0.75
    });

    // --- CIRCULAR MARBLE PAVILION BASE ---
    const baseGeo = new THREE.CylinderGeometry(9.0, 9.5, 0.5, 32);
    const base = new THREE.Mesh(baseGeo, marbleMat);
    base.position.y = 0.25;
    base.receiveShadow = true;
    this.group.add(base);

    // Stepping ring
    const ringGeo = new THREE.CylinderGeometry(9.6, 9.8, 0.2, 32);
    const ring = new THREE.Mesh(ringGeo, roseGoldMat);
    ring.position.y = 0.1;
    this.group.add(ring);

    // --- GAZEBO COLUMNS & DOME ---
    const columnCount = 6;
    const colRadius = 7.5;
    const colGeo = new THREE.CylinderGeometry(0.35, 0.4, 7.5, 16);

    for (let i = 0; i < columnCount; i++) {
      const angle = (i / columnCount) * Math.PI * 2;
      const x = Math.cos(angle) * colRadius;
      const z = Math.sin(angle) * colRadius;

      const col = new THREE.Mesh(colGeo, marbleMat);
      col.position.set(x, 4.0, z);
      col.castShadow = true;
      col.receiveShadow = true;
      this.group.add(col);

      // Hanging crystal lantern on each column
      const lamp = this.createCrystalLantern(i === 0);
      lamp.position.set(x * 0.85, 7.2, z * 0.85);
      this.group.add(lamp);
    }

    // Overhead Crown Ring
    const archRingGeo = new THREE.TorusGeometry(colRadius, 0.35, 12, 32);
    const archRing = new THREE.Mesh(archRingGeo, roseGoldMat);
    archRing.rotation.x = Math.PI / 2;
    archRing.position.y = 7.8;
    this.group.add(archRing);

    // Filigree Dome ribs meeting at crown
    for (let i = 0; i < columnCount; i++) {
      const angle = (i / columnCount) * Math.PI * 2;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(Math.cos(angle) * colRadius, 7.8, Math.sin(angle) * colRadius),
        new THREE.Vector3(Math.cos(angle) * (colRadius * 0.4), 10.5, Math.sin(angle) * (colRadius * 0.4)),
        new THREE.Vector3(0, 11.2, 0)
      );
      const ribGeo = new THREE.TubeGeometry(curve, 16, 0.12, 8, false);
      const rib = new THREE.Mesh(ribGeo, roseGoldMat);
      this.group.add(rib);
    }

    // Top Crown Jewel
    const jewelGeo = new THREE.OctahedronGeometry(0.85, 0);
    const jewelMat = new THREE.MeshStandardMaterial({
      color: 0xff66aa,
      emissive: 0xff2d7a,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.2
    });
    this.topJewel = new THREE.Mesh(jewelGeo, jewelMat);
    this.topJewel.position.y = 11.6;
    this.group.add(this.topJewel);

    // --- WISHING FOUNTAIN IN CENTER ---
    const fountainBase = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.7, 1.2, 24),
      marbleMat
    );
    fountainBase.position.y = 0.85;
    fountainBase.castShadow = true;
    fountainBase.receiveShadow = true;
    this.group.add(fountainBase);

    // Fountain water disc
    const waterGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.1, 24);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x4dd0e1,
      emissive: 0x00838f,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88
    });
    const fWater = new THREE.Mesh(waterGeo, waterMat);
    fWater.position.y = 1.45;
    this.group.add(fWater);

    // Central Spire
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 2.2, 12),
      roseGoldMat
    );
    spire.position.y = 2.0;
    this.group.add(spire);

    // --- DEDICATION PLAQUE ---
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 512;
    plaqueCanvas.height = 160;
    const pctx = plaqueCanvas.getContext('2d');
    pctx.fillStyle = '#fff0f5';
    pctx.roundRect(8, 8, 496, 144, 20);
    pctx.fill();
    pctx.strokeStyle = '#d48c9e';
    pctx.lineWidth = 6;
    pctx.stroke();

    pctx.font = 'bold 32px "Quicksand", sans-serif';
    pctx.fillStyle = '#8a345c';
    pctx.textAlign = 'center';
    pctx.fillText('🌸 Vườn Bí Mật Dành Riêng Cho Chị Nhi 🌸', 256, 65);

    pctx.font = '22px "Quicksand", sans-serif';
    pctx.fillStyle = '#6b4055';
    pctx.fillText('Mãi luôn bình yên, vui vẻ, rạng rỡ và hạnh phúc!', 256, 115);

    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.3, 0.15),
      new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.4 })
    );
    plaque.position.set(0, 1.8, 5.5);
    plaque.rotation.x = -0.3;
    plaque.castShadow = true;
    this.group.add(plaque);

    // --- GOLDEN GIFT BOX ON PEDESTAL ---
    this.createInteractiveGiftBox(0, 1.2, -3.2);
  }

  createInteractiveGiftBox(x, y, z) {
    const boxGroup = new THREE.Group();
    boxGroup.name = 'gift_box';

    // Pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 1.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    ped.position.y = 0.6;
    ped.castShadow = true;
    boxGroup.add(ped);

    // Golden Box Body
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffa000,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.8
    });

    const bodyGeo = new THREE.BoxGeometry(1.5, 1.2, 1.5);
    const body = new THREE.Mesh(bodyGeo, boxMat);
    body.position.y = 1.8;
    body.castShadow = true;
    boxGroup.add(body);

    // Red Ribbon Cross
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0xff3366,
      roughness: 0.4
    });
    const ribH = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.2, 1.52), ribMat);
    ribH.position.y = 1.8;
    boxGroup.add(ribH);

    // Hinged Lid Group
    this.giftBoxLid = new THREE.Group();
    this.giftBoxLid.position.set(0, 2.4, -0.75);

    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.6), boxMat);
    lidMesh.position.set(0, 0.17, 0.75);
    this.giftBoxLid.add(lidMesh);

    // Ribbon Bow on Lid
    const bowMesh = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.12, 8, 16), ribMat);
    bowMesh.rotation.x = Math.PI / 2;
    bowMesh.position.set(0, 0.45, 0.75);
    this.giftBoxLid.add(bowMesh);

    boxGroup.add(this.giftBoxLid);

    // Aura light inside box
    this.giftLight = new THREE.PointLight(0xffeedd, 0.0, 6);
    this.giftLight.position.set(0, 2.2, 0);
    boxGroup.add(this.giftLight);

    boxGroup.position.set(x, y, z);
    this.group.add(boxGroup);
    this.giftBox = boxGroup;

    // Invisible pick volume so the box is easy to tap on touch screens
    // (a Group has no raycastable geometry of its own).
    const picker = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    picker.name = 'gift_box';
    picker.userData.giftBox = true;
    picker.position.y = 2.0;
    boxGroup.add(picker);
    this.giftBoxPicker = picker;
  }

  /** Only the first lantern carries a real light; the rest are emissive. */
  createCrystalLantern(withLight = false) {
    const lamp = new THREE.Group();
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffcce5,
      emissive: 0xff80bf,
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glassMat);
    lamp.add(crystal);

    if (withLight) {
      const light = new THREE.PointLight(0xff99cc, 0.9, 14);
      lamp.add(light);
    }
    return lamp;
  }

  openGiftBox() {
    this.isBoxOpen = true;
  }

  update(delta) {
    this.time += delta;

    // Slowly rotate crown jewel
    if (this.topJewel) {
      this.topJewel.rotation.y = this.time * 0.8;
      this.topJewel.position.y = 11.6 + Math.sin(this.time * 2.0) * 0.15;
    }

    // Animate box opening smoothly
    if (this.isBoxOpen && this.boxOpenProgress < 1.0) {
      this.boxOpenProgress = Math.min(1.0, this.boxOpenProgress + delta * 1.5);
      // Flip lid back
      this.giftBoxLid.rotation.x = -this.boxOpenProgress * (Math.PI * 0.65);
      this.giftLight.intensity = this.boxOpenProgress * 2.5;
    }
  }
}

/**
 * ZooGate.js
 * The Grand 3D Entrance Gate of Nhi's Dream Zoo.
 * Features marble & rose-gold pillars, ivy & flower garlands, glowing lanterns,
 * an overhead archway banner, and animated swinging gate doors.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class ZooGate {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'zoo_gate';
    this.leftDoor = null;
    this.rightDoor = null;
    this.isOpen = false;
    this.openProgress = 0.0;
    this.targetOpenProgress = 0.0;

    this.createGateStructure();
    this.group.position.set(0, 0, 18); // Positioned at entrance

    // Warm light that spills outward from inside the gate as it opens.
    this.spillLight = new THREE.PointLight(0xffd9a0, 0.0, 34, 2);
    this.spillLight.position.set(0, 4.4, 1.2);
    this.group.add(this.spillLight);

    this.scene.add(this.group);
  }

  createGateStructure() {
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0xfdf7fa,
      roughness: 0.35,
      metalness: 0.1
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf2c166,
      roughness: 0.25,
      metalness: 0.75
    });

    const roseMat = new THREE.MeshStandardMaterial({
      color: 0xffa8bb,
      roughness: 0.5
    });

    const vineMat = new THREE.MeshStandardMaterial({
      color: 0x68a478,
      roughness: 0.7
    });

    // --- PILLARS (Left & Right) ---
    const pillarPositions = [-6.5, 6.5];
    pillarPositions.forEach((x, pillarIndex) => {
      const pillar = new THREE.Group();

      // Marble base + column + capital merged into ONE mesh (#perf).
      const baseGeo = new THREE.BoxGeometry(2.4, 0.8, 2.4);
      baseGeo.translate(0, 0.4, 0);
      const colGeo = new THREE.CylinderGeometry(0.85, 0.95, 9.5, 16);
      colGeo.translate(0, 5.3, 0);
      const capGeo = new THREE.BoxGeometry(2.2, 0.7, 2.2);
      capGeo.translate(0, 10.3, 0);
      const marble = new THREE.Mesh(mergeGeometries([baseGeo, colGeo, capGeo], false), marbleMat);
      marble.castShadow = true;
      marble.receiveShadow = true;
      pillar.add(marble);

      // Gold ornamental crown orb
      const orbGeo = new THREE.SphereGeometry(0.7, 14, 12);
      const orb = new THREE.Mesh(orbGeo, goldMat);
      orb.position.y = 11.2;
      orb.castShadow = true;
      pillar.add(orb);

      // Hanging lantern (one real light between the two pillars)
      const lantern = this.createLantern(pillarIndex === 0);
      lantern.position.set(x < 0 ? 1.4 : -1.4, 7.8, 0.8);
      pillar.add(lantern);

      // Vines wrapped around the column: five rings + roses, merged per pillar.
      const vineParts = [];
      const roseParts = [];
      const ringGeo = new THREE.TorusGeometry(1.05, 0.08, 5, 12);
      for (let v = 0; v < 5; v++) {
        const ring = ringGeo.clone();
        ring.rotateX(Math.PI / 2 + 0.3);
        ring.rotateZ(v * 0.8);
        ring.translate(0, 2.5 + v * 1.5, 0);
        vineParts.push(ring);

        const rose = new THREE.SphereGeometry(0.2, 7, 6);
        rose.translate(Math.cos(v) * 1.05, 2.5 + v * 1.5, Math.sin(v) * 1.05);
        roseParts.push(rose);
      }
      const vines = new THREE.Mesh(mergeGeometries(vineParts, false), vineMat);
      vines.castShadow = true;
      pillar.add(vines);
      pillar.add(new THREE.Mesh(mergeGeometries(roseParts, false), roseMat));

      pillar.position.x = x;
      this.group.add(pillar);
    });

    // --- OVERHEAD ARCHWAY BANNER ---
    const archCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-6.5, 9.5, 0),
      new THREE.Vector3(-3.0, 13.5, 0),
      new THREE.Vector3(3.0, 13.5, 0),
      new THREE.Vector3(6.5, 9.5, 0)
    );

    const tubeGeo = new THREE.TubeGeometry(archCurve, 32, 0.28, 12, false);
    const archTube = new THREE.Mesh(tubeGeo, goldMat);
    archTube.castShadow = true;
    this.group.add(archTube);

    // Decorative Signboard Banner: "Nhi's Dream Zoo"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#fff6fa';
    sctx.roundRect(10, 10, 492, 108, 24);
    sctx.fill();
    sctx.strokeStyle = '#e5a550';
    sctx.lineWidth = 6;
    sctx.stroke();

    sctx.font = 'bold 38px "Quicksand", sans-serif';
    sctx.fillStyle = '#6a3875';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('✨ Nhi\'s Dream Zoo ✨', 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signGeo = new THREE.BoxGeometry(6.4, 1.6, 0.2);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.3,
      metalness: 0.1
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 11.2, 0);
    sign.castShadow = true;
    this.group.add(sign);

    // --- DOORS (Swinging Hinge Groups) ---
    // Left Door (Hinged at x = -5.4)
    this.leftHinge = new THREE.Group();
    this.leftHinge.position.set(-5.4, 0.5, 0);
    this.leftDoor = this.createGateDoorMesh('left', goldMat);
    this.leftDoor.position.set(2.65, 0, 0);
    this.leftHinge.add(this.leftDoor);
    this.group.add(this.leftHinge);

    // Right Door (Hinged at x = 5.4)
    this.rightHinge = new THREE.Group();
    this.rightHinge.position.set(5.4, 0.5, 0);
    this.rightDoor = this.createGateDoorMesh('right', goldMat);
    this.rightDoor.position.set(-2.65, 0, 0);
    this.rightHinge.add(this.rightDoor);
    this.group.add(this.rightHinge);
  }

  createGateDoorMesh(side, mat) {
    const door = new THREE.Group();
    const width = 5.2;
    const height = 7.5;

    // Everything in the door shares one material, so it is merged into a
    // single geometry: 17 meshes per door become 1 (#perf).
    const parts = [];
    const frameGeo = new THREE.BoxGeometry(width, 0.2, 0.2);
    for (const y of [0.4, height * 0.5, height]) {
      const rail = frameGeo.clone();
      rail.translate(0, y, 0);
      parts.push(rail);
    }

    const barCount = 7;
    for (let i = 0; i < barCount; i++) {
      const bx = -width / 2 + 0.35 + i * ((width / (barCount - 1)) * 0.9);
      const bar = new THREE.CylinderGeometry(0.06, 0.06, height, 7);
      bar.translate(bx, height / 2, 0);
      parts.push(bar);

      const tip = new THREE.ConeGeometry(0.14, 0.5, 7);
      tip.translate(bx, height + 0.25, 0);
      parts.push(tip);
    }

    const frame = new THREE.Mesh(mergeGeometries(parts, false), mat);
    frame.castShadow = true;
    door.add(frame);

    // Monogram medallion keeps its own brighter gold.
    const medalMat = new THREE.MeshStandardMaterial({
      color: 0xffd97d,
      metalness: 0.85,
      roughness: 0.2
    });
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), medalMat);
    medal.rotation.x = Math.PI / 2;
    medal.position.set(0, height * 0.5, 0);
    door.add(medal);

    return door;
  }

  /**
   * Gate lantern. Only one of them gets a real point light (#perf): the rest
   * rely on their emissive bulb, which reads identically at this scale.
   */
  createLantern(withLight = false) {
    const lanternGroup = new THREE.Group();

    const frameGeo = new THREE.BoxGeometry(0.6, 0.9, 0.6);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x5a3d31,
      roughness: 0.6
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    lanternGroup.add(frame);

    const bulbGeo = new THREE.SphereGeometry(0.24, 12, 12);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff0aa,
      emissive: 0xffbb33,
      emissiveIntensity: 0.9
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    lanternGroup.add(bulb);

    if (withLight) {
      const light = new THREE.PointLight(0xffbe4d, 1.2, 12);
      light.position.set(0, 0.2, 0);
      lanternGroup.add(light);
    }

    return lanternGroup;
  }

  openGate() {
    this.targetOpenProgress = 1.0;
  }

  closeGate() {
    this.targetOpenProgress = 0.0;
  }

  update(delta) {
    if (Math.abs(this.openProgress - this.targetOpenProgress) > 0.001) {
      this.openProgress += (this.targetOpenProgress - this.openProgress) * (delta * 2.2);

      // Rotate hinges outward (-100 deg for left, +100 deg for right)
      const angle = this.openProgress * (Math.PI * 0.55);
      this.leftHinge.rotation.y = -angle;
      this.rightHinge.rotation.y = angle;
    }

    // The warm glow grows as the doors part, then settles into a gentle
    // welcoming light. Eased so it never pops.
    if (this.spillLight) {
      const target = 0.25 + this.openProgress * 2.6;
      this.spillLight.intensity += (target - this.spillLight.intensity) * Math.min(1, delta * 2.4);
    }
  }
}

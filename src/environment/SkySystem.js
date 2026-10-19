/**
 * SkySystem.js
 * Generates a dreamlike gradient celestial dome, floating stylized clouds,
 * glowing sun/moon disc, and twinkling night stars.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.clouds = [];
    this.stars = null;

    this.createSkyDome();
    this.createSunMoon();
    this.createStars();
    this.createClouds();
  }

  createSkyDome() {
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;

    this.skyUniforms = {
      topColor: { value: new THREE.Color(0xc8e6ff) },
      bottomColor: { value: new THREE.Color(0xfff7fc) },
      offset: { value: 33 },
      exponent: { value: 0.6 }
    };

    const skyGeo = new THREE.SphereGeometry(450, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);
  }

  createSunMoon() {
    // Glowing celestial orb
    const geo = new THREE.SphereGeometry(7, 24, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      transparent: true,
      opacity: 0.95
    });
    this.celestialBody = new THREE.Mesh(geo, mat);
    this.celestialBody.position.set(40, 80, 45);
    this.scene.add(this.celestialBody);

    // Glow aura halo
    const glowGeo = new THREE.PlaneGeometry(28, 28);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 250, 220, 0.8)');
    grad.addColorStop(0.4, 'rgba(255, 220, 240, 0.35)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const haloTex = new THREE.CanvasTexture(canvas);
    const haloMat = new THREE.MeshBasicMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.halo = new THREE.Mesh(glowGeo, haloMat);
    this.celestialBody.add(this.halo);
  }

  createStars() {
    const starCount = 350;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const scales = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 380 + Math.random() * 40;

      const sinPhi = Math.sin(phi);
      // Keep stars above horizon
      const y = Math.abs(r * Math.cos(phi)) + 15;
      const x = r * sinPhi * Math.cos(theta);
      const z = r * sinPhi * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      scales[i] = 1.0 + Math.random() * 2.5;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    // Star texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 32;
    starCanvas.height = 32;
    const sctx = starCanvas.getContext('2d');
    const sgrad = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    sgrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    sgrad.addColorStop(0.3, 'rgba(240, 230, 255, 0.7)');
    sgrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 32, 32);

    const starTex = new THREE.CanvasTexture(starCanvas);
    this.starMat = new THREE.PointsMaterial({
      size: 5,
      map: starTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);
  }

  createClouds() {
    // Puffy pastel clouds. Each cluster is ONE merged geometry, so six clouds
    // cost six draw calls instead of ~35.
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9,
      flatShading: true
    });

    const cloudClusterPositions = [
      [-120, 75, -80], [80, 85, -110], [-60, 65, 90],
      [110, 80, 60], [-90, 90, -30], [30, 70, 120]
    ];

    let seed = 2024;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    cloudClusterPositions.forEach((pos) => {
      const puffs = [];
      const numPuffs = 4 + Math.floor(rand() * 4);
      for (let p = 0; p < numPuffs; p++) {
        const puff = new THREE.DodecahedronGeometry(5, 0);
        const scale = 1.0 + rand() * 1.5;
        puff.scale(scale * 1.6, scale * 0.9, scale * 1.3);
        puff.rotateX(rand() * Math.PI);
        puff.rotateY(rand() * Math.PI);
        puff.translate((rand() - 0.5) * 14, (rand() - 0.5) * 4, (rand() - 0.5) * 12);
        puffs.push(puff);
      }
      const merged = mergeGeometries(puffs, false) || puffs[0];

      const cluster = new THREE.Group();
      cluster.add(new THREE.Mesh(merged, cloudMat));
      cluster.position.set(pos[0], pos[1], pos[2]);
      cluster.userData.speed = 1.2 + rand() * 1.5;
      this.clouds.push(cluster);
      this.scene.add(cluster);
    });
  }

  setTimePreset(mode) {
    const colors = {
      dawn: { top: 0xffd1dc, bot: 0xfff0f5, sunColor: 0xffe4b5, starOpacity: 0.1 },
      day: { top: 0xc8e6ff, bot: 0xfff7fc, sunColor: 0xfffae0, starOpacity: 0.0 },
      sunset: { top: 0x9370db, bot: 0xffa07a, sunColor: 0xff7f50, starOpacity: 0.35 },
      night: { top: 0x141026, bot: 0x271940, sunColor: 0xccd9ff, starOpacity: 0.95 }
    };

    const cfg = colors[mode] || colors.day;
    this.skyUniforms.topColor.value.setHex(cfg.top);
    this.skyUniforms.bottomColor.value.setHex(cfg.bot);
    this.celestialBody.material.color.setHex(cfg.sunColor);
    this.starMat.opacity = cfg.starOpacity;

    // Adjust position for sun/moon
    if (mode === 'sunset') {
      this.celestialBody.position.set(65, 25, -35);
    } else if (mode === 'night') {
      this.celestialBody.position.set(-30, 70, -40);
    } else if (mode === 'dawn') {
      this.celestialBody.position.set(-60, 28, 40);
    } else {
      this.celestialBody.position.set(40, 80, 45);
    }
  }

  update(delta, time) {
    // Slowly drift clouds across sky
    for (let c of this.clouds) {
      c.position.x += c.userData.speed * delta;
      if (c.position.x > 220) {
        c.position.x = -220;
      }
    }

    // Gentle star twinkling
    if (this.stars && this.starMat.opacity > 0.05) {
      this.stars.rotation.y = time * 0.008;
    }

    // Billboard halo to always face camera
    if (this.halo && this.scene) {
      const cam = this.scene.parent ? null : null; // scene.renderer
    }
  }
}

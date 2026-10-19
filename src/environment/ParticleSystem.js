/**
 * ParticleSystem.js
 * High-performance instanced particle system for atmospheric Sakura petals,
 * glowing fireflies, magic sparkles, heart bursts (petting), and celebration fireworks.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGroundHeight } from './terrainHeight.js';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeBursts = [];
    this.time = 0;

    // Mode toggles
    this.showPetals = true;
    this.showFireflies = true;
    this.showSnow = false;

    this.createPetalSystem();
    this.createFireflySystem();
    this.createSparkleSystem();
    this.createButterflySystem();
  }

  createPetalSystem() {
    this.petalCount = 380;
    const geo = new THREE.PlaneGeometry(0.35, 0.55);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffb7c5,
      emissive: 0xff99bb,
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide,
      roughness: 0.6,
      transparent: true,
      opacity: 0.85
    });

    this.petalInstanced = new THREE.InstancedMesh(geo, mat, this.petalCount);
    this.petalInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.petalData = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.petalCount; i++) {
      const x = (Math.random() - 0.5) * 160;
      const y = 3 + Math.random() * 25;
      const z = (Math.random() - 0.5) * 160;

      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const s = 0.6 + Math.random() * 0.8;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      this.petalInstanced.setMatrixAt(i, dummy.matrix);

      this.petalData.push({
        x, y, z,
        scale: s,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        speedY: 0.8 + Math.random() * 1.4,
        speedX: 0.5 + Math.random() * 0.8,
        speedZ: 0.2 + Math.random() * 0.5,
        rotSpeed: 1.0 + Math.random() * 2.5
      });
    }

    this.petalInstanced.instanceMatrix.needsUpdate = true;
    this.scene.add(this.petalInstanced);
  }

  createFireflySystem() {
    this.fireflyCount = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.fireflyCount * 3);
    const colors = new Float32Array(this.fireflyCount * 3);

    this.fireflyData = [];

    for (let i = 0; i < this.fireflyCount; i++) {
      const x = (Math.random() - 0.5) * 130;
      const y = 0.8 + Math.random() * 7;
      const z = (Math.random() - 0.5) * 130;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Golden mint glowing color
      colors[i * 3] = 0.95;
      colors[i * 3 + 1] = 0.92;
      colors[i * 3 + 2] = 0.45;

      this.fireflyData.push({
        baseX: x, baseY: y, baseZ: z,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.2
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Glow dot texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 200, 1)');
    grad.addColorStop(0.4, 'rgba(220, 255, 140, 0.7)');
    grad.addColorStop(1, 'rgba(200, 255, 100, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    this.fireflyMat = new THREE.PointsMaterial({
      size: 2.2,
      map: tex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false
    });

    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.scene.add(this.fireflies);
  }

  createSparkleSystem() {
    this.sparkleCount = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.sparkleCount * 3);

    this.sparkleData = [];

    for (let i = 0; i < this.sparkleCount; i++) {
      const x = (Math.random() - 0.5) * 90;
      const y = 1.0 + Math.random() * 12;
      const z = (Math.random() - 0.5) * 90;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.sparkleData.push({
        x, y, z,
        speed: 0.4 + Math.random() * 0.8,
        freq: 2.0 + Math.random() * 3.0
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(240, 210, 255, 0.8)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    this.sparkleMat = new THREE.PointsMaterial({
      size: 1.8,
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.sparkles = new THREE.Points(geo, this.sparkleMat);
    this.scene.add(this.sparkles);
  }

  // === BUTTERFLIES ========================================================

  /**
   * Fluttering butterflies. One InstancedMesh, animated on the CPU (26
   * instances) with an x-squash that reads as a wing beat and a yaw that
   * follows the travel direction. Cheap and full of life.
   */
  createButterflySystem() {
    this.butterflyCount = 26;

    const left = new THREE.PlaneGeometry(0.42, 0.34);
    left.translate(-0.24, 0.04, 0);
    const right = new THREE.PlaneGeometry(0.42, 0.34);
    right.translate(0.24, 0.04, 0);
    const body = new THREE.BoxGeometry(0.06, 0.06, 0.3);

    const merged = mergeGeometries([left, right, body], false);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
      vertexColors: false
    });

    this.butterflies = new THREE.InstancedMesh(merged, mat, this.butterflyCount);
    this.butterflies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.butterflies.castShadow = false;

    const palette = [0xffb7c5, 0xffd9a0, 0xcdb4f6, 0xa8e6cf, 0xfff0f5, 0xffc2d6];
    const color = new THREE.Color();
    this.butterflyData = [];

    for (let i = 0; i < this.butterflyCount; i++) {
      // Cluster around the floral habitats, where butterflies belong.
      const homes = [
        [22, 15], [-22, 10], [26, -16], [0, -30], [14, 24], [-16, -24], [33, 21], [-40, 30]
      ];
      const h = homes[i % homes.length];
      const home = {
        x: h[0] + (Math.random() - 0.5) * 12,
        z: h[1] + (Math.random() - 0.5) * 12
      };
      this.butterflyData.push({
        home,
        phase: Math.random() * Math.PI * 2,
        radius: 1.4 + Math.random() * 2.6,
        speed: 0.45 + Math.random() * 0.5,
        height: 0.9 + Math.random() * 1.5,
        flap: 4.5 + Math.random() * 3.5,
        size: 0.7 + Math.random() * 0.6,
        tilt: (Math.random() - 0.5) * 0.3
      });
      color.setHex(palette[i % palette.length]);
      this.butterflies.setColorAt(i, color);
    }
    if (this.butterflies.instanceColor) this.butterflies.instanceColor.needsUpdate = true;
    this.scene.add(this.butterflies);
    this._butterflyDummy = new THREE.Object3D();
  }

  updateButterflies(delta) {
    if (!this.butterflies || !this.butterflyData) return;
    const dummy = this._butterflyDummy;
    const t = this.time;
    for (let i = 0; i < this.butterflyCount; i++) {
      const d = this.butterflyData[i];
      const a = t * d.speed + d.phase;
      const x = d.home.x + Math.sin(a) * d.radius;
      const z = d.home.z + Math.cos(a * 0.83 + d.phase) * d.radius;
      const y = this.groundOrZero(x, z) + d.height + Math.sin(t * 0.9 + d.phase) * 0.35;

      // Analytic derivative gives a smooth heading without storing velocity.
      const dx = Math.cos(a) * d.speed * d.radius;
      const dz = -Math.sin(a * 0.83 + d.phase) * 0.83 * d.speed * d.radius;
      const yaw = Math.atan2(dx, dz);

      const beat = Math.abs(Math.sin(t * d.flap + d.phase));
      const sx = 0.28 + beat * 0.72; // wing squash = flapping
      dummy.position.set(x, y, z);
      dummy.rotation.set(d.tilt, yaw, Math.sin(t * d.flap * 0.5) * 0.18);
      dummy.scale.set(sx * d.size, d.size, d.size);
      dummy.updateMatrix();
      this.butterflies.setMatrixAt(i, dummy.matrix);
    }
    this.butterflies.instanceMatrix.needsUpdate = true;
  }

  groundOrZero(x, z) {
    // Butterflies only need a sensible hover height above the terrain.
    return getGroundHeight(x, z);
  }

  /** One-shot water spray - a single draw call, used by the baby elephant. */
  createWaterSpray(pos) {
    const count = 90;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const spread = 0.55;
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 6 * spread + 2.4,
          3.2 + Math.random() * 3.4,
          (Math.random() - 0.5) * 6 * spread
        )
      );
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(240, 252, 255, 1)');
    grad.addColorStop(0.45, 'rgba(150, 224, 255, 0.85)');
    grad.addColorStop(1, 'rgba(120, 200, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();

    const mat = new THREE.PointsMaterial({
      size: 0.34,
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.activeBursts.push({
      group: points,
      update: (delta) => {
        const arr = geo.attributes.position.array;
        let alive = false;
        for (let i = 0; i < count; i++) {
          const v = velocities[i];
          v.y -= 16 * delta;
          arr[i * 3] += v.x * delta;
          arr[i * 3 + 1] += v.y * delta;
          arr[i * 3 + 2] += v.z * delta;
          if (arr[i * 3 + 1] > 0.02) alive = true;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, mat.opacity - delta * 0.55);
        return alive && mat.opacity > 0.02;
      }
    });
  }

  // === INTERACTION BURSTS ===

  /** A swirl of sakura petals - used when the gate opens and on celebrations. */
  createPetalBurst(pos) {
    const count = 46;
    const group = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffc2d6';
    ctx.beginPath();
    ctx.ellipse(16, 16, 8, 14, Math.PI * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(13, 12, 3, 6, Math.PI * 0.22, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });

    const particles = [];
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(mat);
      const angle = (i / count) * Math.PI * 2;
      const speed = 1.4 + Math.random() * 2.6;
      const scale = 0.3 + Math.random() * 0.34;
      sprite.scale.set(scale, scale, 1);
      sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2));
      group.add(sprite);
      particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: 1.2 + Math.random() * 2.4,
        vz: Math.sin(angle) * speed,
        spin: (Math.random() - 0.5) * 4,
        life: 1,
        maxLife: 1
      });
    }

    this.scene.add(group);
    this.activeBursts.push({
      group,
      particles,
      update: (delta) => {
        let alive = false;
        for (const p of particles) {
          p.life -= delta * 0.42;
          if (p.life > 0) {
            alive = true;
            p.vy -= 1.1 * delta;
            p.sprite.position.x += p.vx * delta;
            p.sprite.position.y += p.vy * delta;
            p.sprite.position.z += p.vz * delta;
            p.sprite.material.rotation += p.spin * delta;
            p.vx *= 1 - delta * 0.7;
            p.vz *= 1 - delta * 0.7;
            if (p.sprite.position.y < 0.3) p.sprite.position.y = 0.3;
          }
        }
        return alive;
      }
    });
  }

  /** Soft glowing motes that drift above the gate as it opens. */
  createGateGlow(pos) {
    const count = 60;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x + (Math.random() - 0.5) * 5;
      positions[i * 3 + 1] = pos.y + Math.random() * 2.5;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 3;
      velocities.push(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 1.1, (Math.random() - 0.5) * 0.6));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 250, 220, 1)');
    grad.addColorStop(0.4, 'rgba(255, 226, 160, 0.7)');
    grad.addColorStop(1, 'rgba(255, 210, 130, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const mat = new THREE.PointsMaterial({
      size: 0.9,
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.activeBursts.push({
      group: points,
      update: (delta) => {
        const arr = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          const v = velocities[i];
          arr[i * 3] += v.x * delta;
          arr[i * 3 + 1] += v.y * delta;
          arr[i * 3 + 2] += v.z * delta;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, mat.opacity - delta * 0.16);
        return mat.opacity > 0.02;
      }
    });
  }

  createHeartBurst(pos) {
    const count = 18;
    const group = new THREE.Group();

    // Heart shape texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff4d88';
    ctx.beginPath();
    const d = 32;
    ctx.moveTo(d, d + 16);
    ctx.bezierCurveTo(d - 22, d - 8, d - 22, d - 26, d, d - 14);
    ctx.bezierCurveTo(d + 22, d - 26, d + 22, d - 8, d, d + 16);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 1.0,
      blending: THREE.NormalBlending
    });

    const particles = [];
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(mat);
      const angle = (i / count) * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.0;
      const vx = Math.cos(angle) * speed;
      const vy = 1.8 + Math.random() * 2.8;
      const vz = Math.sin(angle) * speed;

      const scale = 0.5 + Math.random() * 0.4;
      sprite.scale.set(scale, scale, 1);
      sprite.position.copy(pos);
      group.add(sprite);

      particles.push({ sprite, vx, vy, vz, life: 1.0, maxLife: 1.0 });
    }

    this.scene.add(group);
    this.activeBursts.push({
      group,
      particles,
      update: (delta) => {
        let alive = false;
        for (let p of particles) {
          p.life -= delta * 0.9;
          if (p.life > 0) {
            alive = true;
            p.sprite.position.x += p.vx * delta;
            p.sprite.position.y += p.vy * delta;
            p.sprite.position.z += p.vz * delta;
            p.vy -= 1.8 * delta; // gentle gravity
            p.sprite.material.opacity = p.life / p.maxLife;
          }
        }
        return alive;
      }
    });
  }

  createEatingSparkles(pos) {
    const count = 14;
    const group = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffdb4d';
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    const particles = [];
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(mat);
      const vx = (Math.random() - 0.5) * 3.0;
      const vy = 1.5 + Math.random() * 2.0;
      const vz = (Math.random() - 0.5) * 3.0;

      const scale = 0.25 + Math.random() * 0.3;
      sprite.scale.set(scale, scale, 1);
      sprite.position.copy(pos);
      group.add(sprite);

      particles.push({ sprite, vx, vy, vz, life: 1.0 });
    }

    this.scene.add(group);
    this.activeBursts.push({
      group,
      particles,
      update: (delta) => {
        let alive = false;
        for (let p of particles) {
          p.life -= delta * 1.5;
          if (p.life > 0) {
            alive = true;
            p.sprite.position.x += p.vx * delta;
            p.sprite.position.y += p.vy * delta;
            p.sprite.position.z += p.vz * delta;
            p.sprite.material.opacity = p.life;
          }
        }
        return alive;
      }
    });
  }

  createCelebrationFireworks(pos) {
    const colors = ['#ff69b4', '#9370db', '#00e5ff', '#ffd700', '#ff6347', '#7cfc00'];
    for (let c = 0; c < 5; c++) {
      setTimeout(() => {
        const offsetPos = pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 16,
          6 + Math.random() * 10,
          (Math.random() - 0.5) * 16
        ));
        this.spawnSingleFirework(offsetPos, colors[c % colors.length]);
      }, c * 350);
    }
  }

  spawnSingleFirework(pos, colorHex) {
    const count = 36;
    const group = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(16, 16, 12, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    const particles = [];
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(mat);
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const speed = 4.0 + Math.random() * 4.5;

      const vx = speed * Math.sin(phi) * Math.cos(theta);
      const vy = speed * Math.cos(phi);
      const vz = speed * Math.sin(phi) * Math.sin(theta);

      const scale = 0.4 + Math.random() * 0.4;
      sprite.scale.set(scale, scale, 1);
      sprite.position.copy(pos);
      group.add(sprite);

      particles.push({ sprite, vx, vy, vz, life: 1.0 });
    }

    this.scene.add(group);
    this.activeBursts.push({
      group,
      particles,
      update: (delta) => {
        let alive = false;
        for (let p of particles) {
          p.life -= delta * 0.7;
          if (p.life > 0) {
            alive = true;
            p.sprite.position.x += p.vx * delta;
            p.sprite.position.y += p.vy * delta;
            p.sprite.position.z += p.vz * delta;
            p.vy -= 2.5 * delta; // gravity
            p.sprite.material.opacity = p.life;
          }
        }
        return alive;
      }
    });
  }

  setWeather(type) {
    if (type === 'petals') {
      this.showPetals = true;
      this.petalInstanced.visible = true;
    } else if (type === 'fireflies') {
      this.showFireflies = true;
      this.fireflies.visible = true;
    }
  }

  update(delta) {
    this.time += delta;

    // Update Sakura Petals
    if (this.showPetals && this.petalInstanced) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.petalCount; i++) {
        const d = this.petalData[i];
        d.y -= d.speedY * delta;
        d.x += Math.sin(this.time * 1.5 + i) * d.speedX * delta;
        d.z += Math.cos(this.time * 1.2 + i) * d.speedZ * delta;
        d.rotX += d.rotSpeed * delta * 0.5;
        d.rotY += d.rotSpeed * delta * 0.8;

        if (d.y < 0.2) {
          d.y = 22 + Math.random() * 8;
          d.x = (Math.random() - 0.5) * 160;
          d.z = (Math.random() - 0.5) * 160;
        }

        dummy.position.set(d.x, d.y, d.z);
        dummy.rotation.set(d.rotX, d.rotY, d.rotZ);
        dummy.scale.set(d.scale, d.scale, d.scale);
        dummy.updateMatrix();

        this.petalInstanced.setMatrixAt(i, dummy.matrix);
      }
      this.petalInstanced.instanceMatrix.needsUpdate = true;
    }

    // Update Fireflies
    if (this.showFireflies && this.fireflies) {
      const posAttr = this.fireflies.geometry.attributes.position;
      const positions = posAttr.array;

      for (let i = 0; i < this.fireflyCount; i++) {
        const d = this.fireflyData[i];
        const t = this.time * d.speed + d.phase;
        positions[i * 3] = d.baseX + Math.sin(t * 0.8) * 2.5;
        positions[i * 3 + 1] = d.baseY + Math.sin(t * 1.4) * 1.0;
        positions[i * 3 + 2] = d.baseZ + Math.cos(t * 0.9) * 2.5;
      }
      posAttr.needsUpdate = true;
      this.fireflyMat.opacity = 0.55 + Math.sin(this.time * 3.0) * 0.3;
    }

    // Butterflies
    this.updateButterflies(delta);

    // Update Bursts
    for (let b = this.activeBursts.length - 1; b >= 0; b--) {
      const burst = this.activeBursts[b];
      const isAlive = burst.update(delta);
      if (!isAlive) {
        this.scene.remove(burst.group);
        // dispose
        this.activeBursts.splice(b, 1);
      }
    }
  }
}

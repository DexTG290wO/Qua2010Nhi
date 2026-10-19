/**
 * SceneManager.js
 * Core Three.js renderer, camera, lighting, fog, and day/night environment controller.
 */

import * as THREE from 'three';

export class SceneManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Core components
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 15, 35);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true // Required for photo capture
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // Fog
    this.scene.fog = new THREE.FogExp2(0xf2e8f5, 0.009);

    // Camera target for lookAt interpolations
    this.cameraTarget = new THREE.Vector3(0, 3, 0);

    // Lighting setup
    this.setupLighting();

    // Resize handler
    window.addEventListener('resize', () => this.onWindowResize());

    // Timestamp tracker (modern replacement for deprecated THREE.Clock)
    this.lastTime = performance.now();

    // Adaptive quality state (tuned in adaptiveTick)
    this.maxPixelRatio = 2;
    this.basePixelRatio = Math.min(window.devicePixelRatio, this.maxPixelRatio);
    this.qualityScale = 1;
    this.qualityLevel = 2;
    this.fpsAccum = 0;
    this.fpsSamples = 0;
    this.lowStreak = 0;
    this.highStreak = 0;

    // Time of day presets
    this.timePresets = {
      dawn: {
        skyTop: 0xffd1dc,
        skyBottom: 0xfff0f5,
        fog: 0xfdeef4,
        fogDensity: 0.011,
        hemiSky: 0xffe4e1,
        hemiGround: 0xd8bfd8,
        hemiIntensity: 0.6,
        sunColor: 0xffe4b5,
        sunIntensity: 1.4,
        sunPos: new THREE.Vector3(-60, 25, 40),
        exposure: 1.0
      },
      day: {
        skyTop: 0xc8e6ff,
        skyBottom: 0xfff7fc,
        fog: 0xedf4fa,
        fogDensity: 0.007,
        hemiSky: 0xe8f4f8,
        hemiGround: 0xd7ecd9,
        hemiIntensity: 0.75,
        sunColor: 0xfffaed,
        sunIntensity: 1.8,
        sunPos: new THREE.Vector3(40, 75, 45),
        exposure: 1.15
      },
      sunset: {
        skyTop: 0x9370db,
        skyBottom: 0xffa07a,
        fog: 0xebd2df,
        fogDensity: 0.009,
        hemiSky: 0xdda0dd,
        hemiGround: 0xe6e6fa,
        hemiIntensity: 0.65,
        sunColor: 0xff7f50,
        sunIntensity: 1.5,
        sunPos: new THREE.Vector3(65, 20, -35),
        exposure: 1.05
      },
      night: {
        skyTop: 0x141026,
        skyBottom: 0x271940,
        fog: 0x191430,
        fogDensity: 0.012,
        hemiSky: 0x3d306b,
        hemiGround: 0x1f1938,
        hemiIntensity: 0.45,
        sunColor: 0xa4b9f5,
        sunIntensity: 0.65,
        sunPos: new THREE.Vector3(-30, 60, -40),
        exposure: 0.95
      }
    };

    this.currentPreset = 'day';
    this.targetPreset = 'day';
    this.transitionProgress = 1.0;
    // Start on "day" so lanterns/fireflies know the current mood.
    this.setTimeOfDay('day');
  }

  setupLighting() {
    // Hemisphere Light (Sky & Ground color bounce)
    this.hemiLight = new THREE.HemisphereLight(0xe8f4f8, 0xd7ecd9, 0.75);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // Directional Sunlight / Moonlight
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
    this.sunLight.position.set(40, 75, 45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 250;
    const d = 65;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);

    // Soft Ambient fill
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambientLight);

    // Rim / Back light for cinematic depth
    this.rimLight = new THREE.DirectionalLight(0xffb6c1, 0.4);
    this.rimLight.position.set(-45, 30, -50);
    this.scene.add(this.rimLight);
  }

  setTimeOfDay(timeKey) {
    if (!this.timePresets[timeKey]) return;
    this.targetPreset = timeKey;
    const p = this.timePresets[timeKey];

    // Smoothly apply
    this.scene.fog.color.setHex(p.fog);
    this.scene.fog.density = p.fogDensity;

    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;
    this.sunLight.position.copy(p.sunPos);

    this.renderer.toneMappingExposure = p.exposure;
    this.currentPreset = timeKey;

    // Shared with TerrainSystem (lanterns) and ParticleSystem (fireflies).
    this.scene.userData = this.scene.userData || {};
    this.scene.userData.timePreset = timeKey;
    this.scene.userData.nightFactor = timeKey === 'night' ? 1 : timeKey === 'sunset' ? 0.45 : timeKey === 'dawn' ? 0.2 : 0;
  }

  onWindowResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.basePixelRatio = Math.min(window.devicePixelRatio, this.maxPixelRatio);
    this.renderer.setPixelRatio(this.basePixelRatio * this.qualityScale);
  }

  /**
   * Keeps the frame rate healthy on weaker GPUs by trading a little resolution
   * (and, if needed, shadows) for smooth motion.
   *
   * Uses wall-clock time rather than the frame delta: the main loop clamps
   * `delta` to 0.1s to keep physics sane, which would make a 3 fps device look
   * like a 10 fps one and stop this from ever triggering.
   */
  adaptiveTick() {
    const now = performance.now();
    if (this._lastTick === undefined) {
      this._lastTick = now;
      return;
    }
    this.fpsSamples++;
    this.fpsAccum += (now - this._lastTick) / 1000;
    this._lastTick = now;
    if (this.fpsAccum < 1.2) return;

    const fps = this.fpsSamples / this.fpsAccum;
    this.fpsSamples = 0;
    this.fpsAccum = 0;
    this.lastMeasuredFps = Math.round(fps);

    if (fps < 32 && this.qualityLevel > 0) {
      this.lowStreak++;
      this.highStreak = 0;
    } else if (fps > 56 && this.qualityLevel < 2) {
      this.highStreak++;
      this.lowStreak = 0;
    } else {
      this.lowStreak = 0;
      this.highStreak = 0;
      return;
    }

    if (this.lowStreak >= 2) {
      this.lowStreak = 0;
      this.setQualityLevel(this.qualityLevel - 1);
    } else if (this.highStreak >= 5) {
      this.highStreak = 0;
      this.setQualityLevel(this.qualityLevel + 1);
    }
  }

  /** 2 = full, 1 = no shadows, 0 = reduced resolution + no shadows. */
  setQualityLevel(level) {
    const clamped = Math.max(0, Math.min(2, level));
    if (clamped === this.qualityLevel) return;
    this.qualityLevel = clamped;

    this.renderer.shadowMap.enabled = clamped >= 2;
    this.sunLight.castShadow = clamped >= 2;
    this.qualityScale = clamped >= 1 ? 1 : 0.72;
    this.renderer.setPixelRatio(this.basePixelRatio * this.qualityScale);
    // Force materials to recompile with the new shadow state.
    this.scene.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
  }


  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

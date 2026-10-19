/**
 * main.js
 * Entry point for Nhi's Dream Zoo. Boots the renderer, builds the world and the
 * animals, streams the GLB models, and runs the frame loop.
 *
 * Animal models: `tools/build-models.mjs` bakes the procedural rigs in
 * src/rig/* into real .glb files (skinned meshes + animation clips). They are
 * loaded here with GLTFLoader and driven by AnimationMixer. If a model file is
 * missing or fails to load, that species keeps the procedural rig it is born
 * with - the world never breaks.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { SceneManager } from './core/SceneManager.js';
import { LoadingScreen } from './core/LoadingScreen.js';
import { AssetLoader } from './core/AssetLoader.js';

import { SkySystem } from './environment/SkySystem.js';
import { TerrainSystem } from './environment/TerrainSystem.js';
import { WaterSystem } from './environment/WaterSystem.js';
import { ParticleSystem } from './environment/ParticleSystem.js';
import { ZooGate } from './environment/ZooGate.js';
import { SecretGarden } from './props/SecretGarden.js';
import { HabitatDecor } from './environment/HabitatDecor.js';
import { getGroundHeight, getWaterDepth, zoneOf, WATER_BODIES } from './environment/terrainHeight.js';

/** Height of every water surface in the zoo. */
const WATER_SURFACE = WATER_BODIES[0].level;

import { Bunny } from './animals/Bunny.js';
import { Capybara } from './animals/Capybara.js';
import { Otter } from './animals/Otter.js';
import { Fox } from './animals/Fox.js';
import { Deer } from './animals/Deer.js';
import { RedPanda } from './animals/RedPanda.js';
import { Penguin } from './animals/Penguin.js';
import { Flamingo } from './animals/Flamingo.js';
import { BabyElephant } from './animals/BabyElephant.js';
import { LionCub } from './animals/LionCub.js';

import { AudioManager } from './systems/AudioManager.js';
import { ProgressManager } from './systems/ProgressManager.js';
import { CinematicDirector } from './systems/CinematicDirector.js';
import { InteractionSystem } from './systems/InteractionSystem.js';
import { UIManager } from './systems/UIManager.js';
import { TouchController } from './controls/TouchController.js';
import { ToyBall } from './props/ToyBall.js';

/** Baked models, produced by `npm run build:models`. */
export const MODEL_MANIFEST = [
  { id: 'bunny', url: 'models/bunny.glb' },
  { id: 'capybara', url: 'models/capybara.glb' },
  { id: 'otter', url: 'models/otter.glb' },
  { id: 'fox', url: 'models/fox.glb' },
  { id: 'deer', url: 'models/deer.glb' },
  { id: 'red_panda', url: 'models/red_panda.glb' },
  { id: 'penguin', url: 'models/penguin.glb' },
  { id: 'flamingo', url: 'models/flamingo.glb' },
  { id: 'elephant', url: 'models/elephant.glb' },
  { id: 'lion_cub', url: 'models/lion_cub.glb' }
];

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.bootTime = performance.now();
    this.failed = false;

    this.loading = new LoadingScreen();
    this.loading.setStatus('Đang dựng thế giới nhỏ của chị...');
    this.loading.setProgress(0.04, 'khởi động');

    // --- Core ------------------------------------------------------------
    this.sceneManager = new SceneManager(this.container);
    this.audio = new AudioManager();
    this.progress = new ProgressManager();

    // --- World -----------------------------------------------------------
    this.loading.setProgress(0.12, 'bầu trời');
    this.sky = new SkySystem(this.sceneManager.scene);
    this.loading.setProgress(0.2, 'mặt đất');
    this.terrain = new TerrainSystem(this.sceneManager.scene);
    this.water = new WaterSystem(this.sceneManager.scene);
    this.particles = new ParticleSystem(this.sceneManager.scene);
    this.loading.setProgress(0.34, 'cổng chào');
    this.zooGate = new ZooGate(this.sceneManager.scene);
    this.secretGarden = new SecretGarden(this.sceneManager.scene);
    this.decor = new HabitatDecor(this.sceneManager.scene);
    this.ball = new ToyBall(this.sceneManager.scene);

    // --- Animals ---------------------------------------------------------
    this.loading.setProgress(0.46, 'những người bạn nhỏ');
    this.animals = [
      new Bunny(this.sceneManager.scene),
      new Capybara(this.sceneManager.scene),
      new Otter(this.sceneManager.scene),
      new Fox(this.sceneManager.scene),
      new Deer(this.sceneManager.scene),
      new RedPanda(this.sceneManager.scene),
      new Penguin(this.sceneManager.scene),
      new Flamingo(this.sceneManager.scene),
      new BabyElephant(this.sceneManager.scene),
      new LionCub(this.sceneManager.scene)
    ];
    this.animalById = new Map(this.animals.map((a) => [a.id, a]));

    // --- Camera & controls ----------------------------------------------
    this.controls = new OrbitControls(this.sceneManager.camera, this.sceneManager.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.panSpeed = 0.6;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 70;
    this.controls.target.copy(this.sceneManager.cameraTarget);
    this.controls.enabled = false;

    this.touch = new TouchController(this.sceneManager.renderer.domElement, this);

    // --- Systems ---------------------------------------------------------
    this.interactions = new InteractionSystem(
      this.sceneManager,
      this.animals,
      this.secretGarden,
      this.particles,
      this.audio,
      this.progress,
      this.controls,
      this.ball
    );

    this.director = new CinematicDirector(
      this.sceneManager,
      this.zooGate,
      this.particles,
      this.audio,
      () => this.onIntroComplete()
    );

    this.ui = new UIManager(this);

    this.interactions.onAnimalSelect = (animal) => {
      this.ui.showAnimalCard(animal);
    };
    this.interactions.onGiftBoxOpen = () => this.ui.showLetterModal();

    window.showWelcomeGreeting = () => this.ui.showWelcomeGreeting();

    // Scenic viewpoints for the fast-travel dock
    this.zonePositions = {
      flower_meadow: { center: [22, 0, 15], cam: [13, 4.6, 8], look: [22, 1.1, 15] },
      sweet_grassland: { center: [33, 0, 21], cam: [23, 4.8, 13], look: [33, 1.3, 21] },
      sunset_savanna: { center: [-40, 0, 30], cam: [-30, 5.0, 21], look: [-40, 1.1, 30] },
      capybara_lake: { center: [-22, 0, 10], cam: [-12, 4.8, 2], look: [-22, 0.9, 10] },
      fairytale_forest: { center: [-16, 0, -24], cam: [-6, 5.0, -14], look: [-16, 1.2, -24] },
      crystal_ice: { center: [-35, 0, -40], cam: [-24, 5.2, -30], look: [-35, 1.2, -40] },
      lotus_pond: { center: [26, 0, -16], cam: [16, 5.0, -8], look: [26, 1.0, -16] },
      secret_garden: { center: [0, 0, -30], cam: [0, 5.4, -18], look: [0, 1.6, -30] },
      plaza: { center: [0, 0, 4], cam: [0, 6.4, 16], look: [0, 1.6, 4] }
    };

    // --- Asset streaming -------------------------------------------------
    this.loading.setProgress(0.6, 'đánh thức các bạn nhỏ');
    this.revealAfterLoad();

    // --- Frame loop ------------------------------------------------------
    this.animate = this.animate.bind(this);
    this.lastFrameTime = performance.now();
    this.zoneTimer = 0;
    this.currentZone = null;
    requestAnimationFrame(this.animate);

    // Global safety net: never leave the visitor on a blank screen.
    window.addEventListener('error', (e) => this.handleRuntimeError(e));
    window.addEventListener('unhandledrejection', (e) => this.handleRuntimeError(e));
  }

  /**
   * Streams the .glb models one at a time with real progress and swaps each
   * animal's rig in as it arrives. The intro is released as soon as the first
   * couple of models are in (or after a hard cap), so a slow network can never
   * hold the visitor hostage - and unmatched files simply keep their
   * procedural rig.
   */
  async revealAfterLoad() {
    const baseURL = (import.meta && import.meta.env && import.meta.env.BASE_URL) || './';
    const loader = new AssetLoader({ baseURL, timeoutMs: 12000 });

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      this.loading.setProgress(1, 'sẵn sàng');
      this.loading.hide();
      this.ui.revealIntro();
    };
    // Never let a slow or failing asset hold the intro closed.
    const cap = setTimeout(reveal, 5000);

    let index = 0;
    for (const spec of MODEL_MANIFEST) {
      index++;
      try {
        const map = await loader.loadModels([spec], (loaded, total, fraction) => {
          if (revealed) return;
          const overall = (index - 1 + fraction) / MODEL_MANIFEST.length;
          this.loading.setProgress(0.5 + overall * 0.45, `${spec.id}.glb`);
        });
        // AssetLoader keys results by id; tolerate any single-entry keying.
        const entry = map.get(spec.id) || map.values().next().value;
        const animal = this.animalById.get(spec.id);
        if (entry && animal && animal.applyGLTF(entry.gltf)) {
          this.modelsApplied = (this.modelsApplied || 0) + 1;
        }
      } catch (err) {
        console.warn(`[main] could not stream ${spec.id}.glb, keeping the procedural rig`, err);
      }

      // Release the intro once the first animals the tour glides past are live.
      if (!revealed && (this.modelsApplied || 0) >= 2) reveal();
    }

    clearTimeout(cap);
    reveal();
    console.info(`[main] ${this.modelsApplied || 0}/${this.animals.length} animals animated from .glb rigs`);
  }

  handleRuntimeError(event) {
    if (this.failed) return;
    console.error('[main] runtime error', event.error || event.reason || event.message);
  }

  onIntroComplete() {
    this.controls.enabled = true;
    this.controls.target.copy(this.sceneManager.cameraTarget);
    this.ui.enableExploreHUD();
    // Fire the personal greeting only now, so it is visible over the HUD.
    this.ui.showWelcomeGreeting();
    this.audio.playCelebrate();
  }

  teleportToZone(zoneId) {
    const config = this.zonePositions[zoneId];
    if (!config) return;
    this.progress.recordZoneVisit(zoneId);
    const look = new THREE.Vector3(config.look[0], config.look[1], config.look[2]);
    const cam = new THREE.Vector3(config.cam[0], config.cam[1], config.cam[2]);
    this.interactions.glideCamera(cam, look, 1.7);
    this.controls.target.copy(look);
    this.ui.setActiveZone(zoneId);
  }

  /** Keeps the camera above the ground and above the water surface. */
  clampCamera() {
    const cam = this.sceneManager.camera.position;
    const groundY = getGroundHeight(cam.x, cam.z);
    let minY = groundY + 1.15;
    if (getWaterDepth(cam.x, cam.z) > 0.05) {
      // Never dip the lens under a lake or pond.
      minY = Math.max(minY, WATER_SURFACE + 1.05);
    }
    if (cam.y < minY) cam.y = minY;

    const target = this.controls.target;
    const targetGround = getGroundHeight(target.x, target.z);
    if (target.y < targetGround + 0.4) target.y = targetGround + 0.4;
  }

  updateZoneAwareness(delta) {
    this.zoneTimer += delta;
    if (this.zoneTimer < 0.6) return;
    this.zoneTimer = 0;
    const cam = this.sceneManager.camera.position;
    const target = this.sceneManager.cameraTarget;
    const x = (cam.x + target.x) * 0.5;
    const z = (cam.z + target.z) * 0.5;
    const zone = zoneOf(x, z);
    if (zone && zone !== this.currentZone) {
      this.currentZone = zone;
      this.progress.recordZoneVisit(zone);
      this.ui.setActiveZone(zone);
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();
    const camera = this.sceneManager.camera;

    // 1. Cinematic tour, title-screen backdrop, or free exploration
    if (this.director.isPlaying) {
      this.director.update(delta, time);
      camera.lookAt(this.sceneManager.cameraTarget);
      this.clampCamera();
    } else if (!this.director.finished) {
      // Before the visitor presses Bắt đầu: a slow drift over the sky.
      this.director.updateBackdrop(delta, time);
    } else {
      this.interactions.update(delta);
      if (this.interactions.cameraLerp) {
        camera.lookAt(this.sceneManager.cameraTarget);
      } else if (this.controls.enabled) {
        this.controls.update();
      }
      this.clampCamera();
    }

    // 2. Environment
    this.sky.update(delta, time, camera);
    this.terrain.update(delta, time);
    this.water.update(delta, time);
    this.particles.update(delta, this.currentTimePreset());
    this.zooGate.update(delta);
    this.secretGarden.update(delta, time);
    this.decor.update(delta, time);
    this.ball.update(delta);

    // 3. Animals
    for (const animal of this.animals) {
      animal.update(delta, camera.position);
    }

    // 4. Systems
    this.updateZoneAwareness(delta);
    this.sceneManager.adaptiveTick();

    // 5. Render
    this.sceneManager.render();
  }

  currentTimePreset() {
    return this.sceneManager.targetPreset || 'day';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new App();
    // Small debug surface: handy in the console and used by the automated
    // placement checks in test-visual.js.
    window.zooDebug = {
      getGroundHeight,
      getWaterDepth,
      WATER_LEVEL: WATER_SURFACE,
      zoneOf
    };
  } catch (err) {
    console.error('[main] fatal boot error', err);
    const el = document.getElementById('boot-error');
    if (el) {
      el.style.display = 'flex';
      const detail = el.querySelector('.boot-error-detail');
      if (detail) detail.textContent = String(err && err.message ? err.message : err);
    }
  }
});

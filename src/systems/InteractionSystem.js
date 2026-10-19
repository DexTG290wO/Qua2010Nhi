/**
 * InteractionSystem.js
 * Everything the visitor can touch:
 *   - hover highlighting with a soft ground halo (+ cursor affordance),
 *   - tap / click to select an animal and frame it cinematically,
 *   - pet, feed (with drag-and-drop food) and play (tossing a ball),
 *   - opening the secret gift box.
 *
 * Uses unified pointer events so mouse and touch behave identically, and every
 * interaction has a defined state so repeated presses can never conflict.
 */

import * as THREE from 'three';
import { FoodFactory } from '../props/FoodItem.js';
import { getGroundHeight } from '../environment/terrainHeight.js';

const CHASE_SPECIES = new Set(['fox', 'bunny', 'otter', 'lion_cub', 'red_panda']);

export class InteractionSystem {
  constructor(sceneManager, animals, secretGarden, particleSystem, audioManager, progressManager, controls = null, toyBall = null) {
    this.sm = sceneManager;
    this.animals = animals;
    this.secretGarden = secretGarden;
    this.particles = particleSystem;
    this.audio = audioManager;
    this.progress = progressManager;
    this.controls = controls;
    this.ball = toyBall;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.hoveredAnimal = null;
    this.selectedAnimal = null;
    this.onAnimalSelect = null;
    this.onGiftBoxOpen = null;

    this.activeFoods = [];
    this.pendingChase = null;
    this.actionCooldown = 0;
    this.touchSupported = true; // pointer events cover both input families
    this.enabled = true;

    const dom = this.sm.renderer.domElement;
    dom.addEventListener('pointermove', (e) => this.onPointerMove(e));
    dom.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    dom.addEventListener('pointerup', (e) => this.onPointerUp(e));
    dom.addEventListener('pointerleave', () => this.clearHover());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.deselect();
    });

    // Drag-and-drop feeding: press a food chip, drag onto an animal, release.
    this.dragFood = null;
    this.dragGhost = null;
    this.bindFoodDrag();

    // Keep the ball's landing hooked to the chase logic.
    if (this.ball) this.ball.onLand = (pos) => this.onBallLanded(pos);
  }

  // =========================================================================
  //  PICKING
  // =========================================================================
  updatePointer(clientX, clientY) {
    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  }

  /** Returns { animal, giftBox } for the object under the given screen point. */
  pick(clientX, clientY) {
    this.updatePointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.sm.camera);
    const targets = this.animals.map((a) => a.collider).filter(Boolean);
    if (this.secretGarden && this.secretGarden.giftBoxPicker) targets.push(this.secretGarden.giftBoxPicker);
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const obj = hit.object;
      if (obj.userData && obj.userData.animal) return { animal: obj.userData.animal };
      if (obj.userData && obj.userData.giftBox) return { giftBox: obj };
    }
    return {};
  }

  pickAt(clientX, clientY, { clearIfMiss = false } = {}) {
    const { animal, giftBox } = this.pick(clientX, clientY);
    if (animal) {
      this.selectAnimal(animal, true);
      return animal;
    }
    if (giftBox) {
      this.openSecretGiftBox();
      return null;
    }
    if (clearIfMiss) this.deselect();
    return null;
  }

  onPointerMove(e) {
    if (this.dragFood) {
      this.updateDragGhost(e.clientX, e.clientY);
      this.updateDragHover(e.clientX, e.clientY);
      return;
    }
    if (e.pointerType !== 'mouse' || !this.enabled) return;
    const { animal } = this.pick(e.clientX, e.clientY);
    if (animal !== this.hoveredAnimal) {
      if (this.hoveredAnimal) this.hoveredAnimal.setHovered(false);
      this.hoveredAnimal = animal || null;
      if (this.hoveredAnimal) this.hoveredAnimal.setHovered(true);
      this.sm.renderer.domElement.style.cursor = animal ? 'pointer' : 'default';
    }
  }

  onPointerDown(e) {
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  }

  onPointerUp(e) {
    if (
      this.lastDragHandledAt &&
      performance.now() - this.lastDragHandledAt < 250
    ) {
      // A food drag just resolved; don't also treat it as a tap.
      return;
    }
    if (!this.enabled || e.button === 2) return;
    if (!this.downAt || this.downAt.id !== e.pointerId) return;

    const dx = e.clientX - this.downAt.x;
    const dy = e.clientY - this.downAt.y;
    const moved = Math.hypot(dx, dy);
    const elapsed = performance.now() - this.downAt.t;
    this.downAt = null;

    // Only treat as a tap if the pointer barely moved (so orbiting never selects).
    if (moved > 8 || elapsed > 420) return;
    this.pickAt(e.clientX, e.clientY, { clearIfMiss: true });
  }

  clearHover() {
    if (this.hoveredAnimal) this.hoveredAnimal.setHovered(false);
    this.hoveredAnimal = null;
    this.sm.renderer.domElement.style.cursor = 'default';
  }

  // =========================================================================
  //  SELECTION
  // =========================================================================
  selectAnimal(animal, zoom = true) {
    this.selectedAnimal = animal;
    animal.sinceInteract = 0;
    this.audio.playClick();

    if (zoom) {
      const target = animal.getFocusPoint(new THREE.Vector3());
      const dist = animal.getFocusDistance();
      const angle = animal.group.rotation.y + Math.PI * 0.82;
      const camY = getGroundHeight(
        target.x + Math.sin(angle) * dist,
        target.z + Math.cos(angle) * dist
      ) + Math.max(1.2, dist * 0.42);
      const cam = new THREE.Vector3(
        target.x + Math.sin(angle) * dist,
        camY,
        target.z + Math.cos(angle) * dist
      );
      // On phones the card is a bottom sheet, so aim a little lower and let the
      // animal sit in the clear upper half of the frame.
      const look = target.clone();
      if (window.innerWidth <= 820) look.y -= Math.max(0.45, dist * 0.22);

      this.glideCamera(cam, look, 1.25);
      if (this.controls) this.controls.target.copy(look);
    }

    if (this.onAnimalSelect) this.onAnimalSelect(animal);
  }

  deselect() {
    if (!this.selectedAnimal) return;
    this.selectedAnimal = null;
    if (this.onAnimalSelect) this.onAnimalSelect(null);
    if (this.ui?.hideFoodDrawer) this.ui.hideFoodDrawer();
  }

  // =========================================================================
  //  PET
  // =========================================================================
  petCurrentAnimal(animal = this.selectedAnimal) {
    if (!animal || !this.ready('pet')) return false;
    animal.sinceInteract = 0;
    if (!animal.triggerPetReaction()) return false;

    const pos = animal.group.position.clone().add(new THREE.Vector3(0, animal.config.colliderHeight * 0.8 || 0.8, 0));
    this.particles.createHeartBurst(pos);
    this.audio.playPet();
    const leveledUp = this.progress.recordPet(animal.id);
    if (leveledUp) this.celebrateFriendship(animal);
    this.refreshCard();
    return true;
  }

  // =========================================================================
  //  FEED
  // =========================================================================
  /** Quick path: feed the selected animal its chosen food. */
  feedCurrentAnimal(foodType) {
    const animal = this.selectedAnimal;
    if (!animal || !this.ready('feed')) return false;
    return this.feedAnimal(animal, foodType || animal.favoriteFood);
  }

  feedAnimal(animal, foodType) {
    const type = foodType || animal.favoriteFood;
    const mesh = FoodFactory.createFoodMesh(type);
    const start = this.sm.camera.position.clone();
    // Drop from slightly in front of the viewer so the toss reads clearly.
    const forward = new THREE.Vector3();
    this.sm.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    start.add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(forward, 1.6);

    const stopPoint = animal.group.position.clone().addScaledVector(forward, -1.35);
    stopPoint.y = getGroundHeight(stopPoint.x, stopPoint.z);

    mesh.position.copy(start);
    this.sm.scene.add(mesh);

    this.activeFoods.push({
      mesh,
      start,
      land: stopPoint,
      progress: 0,
      animal,
      state: 'toss',
      foodType: type
    });

    // Ask a stationary animal to come over and meet the food.
    if (animal.state === 'idle' || animal.state === 'sleep' || animal.state === 'react') {
      animal.setState('walk', 4.5);
    }
    animal.moveTo(stopPoint);
    this.audio.playClick();
    return true;
  }

  // =========================================================================
  //  PLAY
  // =========================================================================
  playWithCurrentAnimal() {
    const animal = this.selectedAnimal;
    if (!animal || !this.ready('play')) return false;
    animal.sinceInteract = 0;

    // Baby elephant plays with water instead of a ball.
    if (animal.id === 'elephant') {
      animal.triggerSpecial();
      this.audio.playSplash();
      const p = animal.group.position.clone().add(new THREE.Vector3(0, (animal.config.colliderHeight || 1.1) * 1.3, 0.7));
      this.particles.createWaterSpray(p);
      const leveledUp = this.progress.recordPlay(animal.id);
      if (leveledUp) this.celebrateFriendship(animal);
      this.refreshCard();
      return true;
    }

    animal.triggerPlayReaction();
    this.audio.playPlay();

    // Toss the ball, then let the lively species chase it down.
    const forward = new THREE.Vector3();
    this.sm.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    const from = animal.group.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    const to = animal.group.position.clone().addScaledVector(forward, 6.5 + Math.random() * 2.5);
    to.y = 0;
    if (this.ball) this.ball.throwTo(from, to);

    this.pendingChase = CHASE_SPECIES.has(animal.id) ? { animal, ballPos: to } : null;
    if (this.pendingChase) {
      animal.setState('run', 5);
      animal.moveTo(to);
    } else {
      const spark = animal.group.position.clone().add(new THREE.Vector3(0, 1, 0));
      this.particles.createEatingSparkles(spark);
    }
    const leveledUp = this.progress.recordPlay(animal.id);
    if (leveledUp) this.celebrateFriendship(animal);
    this.refreshCard();
    return true;
  }

  onBallLanded(pos) {
    if (this.pendingChase) {
      const { animal } = this.pendingChase;
      animal.moveTo(pos);
      animal.setState('run', 4);
      this.pendingChase = null;
    }
  }

  // =========================================================================
  //  GIFT BOX
  // =========================================================================
  openSecretGiftBox() {
    if (!this.secretGarden || this.secretGarden.isBoxOpen) return;
    this.secretGarden.openGiftBox();
    this.audio.playCelebrate();

    const boxPos = this.secretGarden.giftBoxPicker
      ? this.secretGarden.giftBoxPicker.getWorldPosition(new THREE.Vector3())
      : this.secretGarden.group.position.clone();
    this.particles.createCelebrationFireworks(boxPos);
    this.progress.unlockSecretGarden();

    const target = boxPos.clone().add(new THREE.Vector3(0, -0.3, 0));
    this.glideCamera(target.clone().add(new THREE.Vector3(0, 1.9, 4.2)), target, 1.5);

    if (this.onGiftBoxOpen) setTimeout(() => this.onGiftBoxOpen(), 1100);
  }

  // =========================================================================
  //  DRAG-AND-DROP FEEDING
  // =========================================================================
  bindFoodDrag() {
    const chips = document.querySelectorAll('.food-item-btn');
    chips.forEach((chip) => {
      chip.addEventListener('pointerdown', (e) => {
        if (!this.selectedAnimal) return;
        this.dragFood = chip.dataset.food;
        this.createDragGhost(e.clientX, e.clientY);
        chip.setPointerCapture?.(e.pointerId);
      });
      chip.addEventListener('pointermove', (e) => {
        if (!this.dragFood) return;
        this.updateDragGhost(e.clientX, e.clientY);
        this.updateDragHover(e.clientX, e.clientY);
      });
      chip.addEventListener('pointerup', (e) => {
        if (!this.dragFood) return;
        const { animal } = this.pick(e.clientX, e.clientY);
        const food = this.dragFood;
        this.endDrag();
        this.lastDragHandledAt = performance.now();
        if (animal) this.feedAnimal(animal, food);
      });
      chip.addEventListener('pointercancel', () => this.endDrag());
    });
  }

  createDragGhost(x, y) {
    const ghost = document.createElement('div');
    ghost.className = 'food-drag-ghost';
    ghost.textContent = 'Cho ăn';
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    this.updateDragGhost(x, y);
  }

  updateDragGhost(x, y) {
    if (!this.dragGhost) return;
    this.dragGhost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  updateDragHover(x, y) {
    const { animal } = this.pick(x, y);
    if (animal !== this.hoveredAnimal) {
      if (this.hoveredAnimal) this.hoveredAnimal.setHovered(false);
      this.hoveredAnimal = animal || null;
      if (this.hoveredAnimal) this.hoveredAnimal.setHovered(true);
      if (this.dragGhost) this.dragGhost.classList.toggle('over-target', !!animal);
    }
  }

  endDrag() {
    this.dragFood = null;
    if (this.dragGhost) {
      this.dragGhost.remove();
      this.dragGhost = null;
    }
    if (this.hoveredAnimal) {
      this.hoveredAnimal.setHovered(false);
      this.hoveredAnimal = null;
    }
  }

  // =========================================================================
  //  CAMERA
  // =========================================================================
  glideCamera(targetPos, targetLookAt, duration = 1.4) {
    this.cameraLerp = {
      startPos: this.sm.camera.position.clone(),
      endPos: targetPos.clone(),
      startTarget: this.sm.cameraTarget.clone(),
      endTarget: targetLookAt.clone(),
      progress: 0,
      duration
    };
  }

  // =========================================================================
  //  FRAME LOOP
  // =========================================================================
  update(delta) {
    if (this.actionCooldown > 0) this.actionCooldown = Math.max(0, this.actionCooldown - delta);

    // Smooth camera glide
    if (this.cameraLerp) {
      this.cameraLerp.progress += delta / this.cameraLerp.duration;
      const t = Math.min(1.0, this.cameraLerp.progress);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
      this.sm.camera.position.lerpVectors(this.cameraLerp.startPos, this.cameraLerp.endPos, ease);
      this.sm.cameraTarget.lerpVectors(this.cameraLerp.startTarget, this.cameraLerp.endTarget, ease);
      if (this.controls) this.controls.target.copy(this.sm.cameraTarget);

      if (this.cameraLerp.progress >= 1.0) {
        this.sm.camera.position.copy(this.cameraLerp.endPos);
        this.sm.cameraTarget.copy(this.cameraLerp.endTarget);
        if (this.controls) {
          this.controls.target.copy(this.cameraLerp.endTarget);
          this.controls.update();
        }
        this.cameraLerp = null;
      }
    }

    this.updateFoods(delta);
    this.updateSelectionTracking(delta);
  }

  /** Keeps the camera framed on the selected animal as it wanders. */
  updateSelectionTracking(delta) {
    const a = this.selectedAnimal;
    if (!a || !this.controls || !this.controls.enabled) return;
    if (this.cameraLerp) return;
    const target = a.getFocusPoint(new THREE.Vector3());
    this.sm.cameraTarget.lerp(target, Math.min(1, delta * 2.2));
    if (this.controls) this.controls.target.lerp(target, Math.min(1, delta * 2.2));
  }

  /**
   * Flying food: arc through the air, wait for the animal to walk over, then
   * feed it muzzle-first. The food is held at the animal's mouth while it
   * chews, so it never passes through the body, and the animal's own Eat clip
   * lowers the head for it.
   */
  updateFoods(delta) {
    const mouth = this._mouthVec || (this._mouthVec = new THREE.Vector3());
    for (let i = this.activeFoods.length - 1; i >= 0; i--) {
      const f = this.activeFoods[i];
      const animal = f.animal;
      const animalNear = animal.group.position.distanceTo(f.land) < 1.4;

      if (f.state === 'toss') {
        f.progress += delta * 1.15;
        const t = Math.min(1, f.progress);
        f.mesh.position.lerpVectors(f.start, f.land, t);
        f.mesh.position.y += Math.sin(t * Math.PI) * 2.2;
        f.mesh.rotation.x += delta * 4;
        f.mesh.rotation.y += delta * 6;
        if (t >= 1) {
          f.state = 'waiting';
          f.progress = 0;
        }
      } else if (f.state === 'waiting') {
        // Gentle bob while it waits for the animal to arrive.
        f.mesh.position.y = f.land.y + 0.18 + Math.sin(performance.now() * 0.004) * 0.05;
        f.mesh.rotation.y += delta * 1.2;
        f.waitTimer = (f.waitTimer || 0) + delta;
        if (animalNear) {
          // Arrived: lower the head and chew. Held until the chew completes.
          f.state = 'eating';
          f.eatTimer = 0;
          animal.sinceInteract = 0;
          animal.triggerFeedReaction();
          this.audio.playFeed();
        } else if (f.waitTimer > 8) {
          this.finishEating(f, true);
        }
      } else if (f.state === 'eating') {
        // Follow the muzzle as the head lowers, so the bite always lands right.
        animal.getMuzzlePoint(mouth);
        f.mesh.position.lerp(mouth, Math.min(1, delta * 7));
        f.mesh.rotation.y += delta * 2;
        f.eatTimer += delta;
        if (f.eatTimer > 1.4) this.finishEating(f);
      }
    }
  }

  finishEating(f, missed = false) {
    const animal = f.animal;
    if (!missed) {
      const mouth = animal.getMuzzlePoint(new THREE.Vector3());
      this.particles.createEatingSparkles(mouth);
      const leveledUp = this.progress.recordFeed(animal.id);
      if (leveledUp) this.celebrateFriendship(animal);
      this.refreshCard();
    }
    this.sm.scene.remove(f.mesh);
    f.mesh.traverse?.((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    const idx = this.activeFoods.indexOf(f);
    if (idx >= 0) this.activeFoods.splice(idx, 1);
  }

  celebrateFriendship(animal) {
    this.particles.createHeartBurst(
      animal.group.position.clone().add(new THREE.Vector3(0, (animal.config.colliderHeight || 0.6) * 1.1, 0))
    );
    if (this.audio.playCelebrate) this.audio.playCelebrate();
    if (this.ui?.showToast) this.ui.showToast(`Tình bạn với ${animal.name} thân thiết hơn rồi!`);
  }

  refreshCard() {
    if (this.ui?.refreshAnimalCard) this.ui.refreshAnimalCard();
  }

  ready(kind) {
    if (!this.enabled) return false;
    if (this.actionCooldown > 0) return false;
    this.actionCooldown = kind === 'feed' ? 0.35 : 0.25;
    return true;
  }
}

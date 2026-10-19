/**
 * CinematicDirector.js
 * The opening film. Seven deliberate beats, each with its own pacing so the
 * magic lands instead of happening all at once:
 *
 *   0. backDrop  - a slow drift over the dreamy sky behind the title screen
 *   1. sky       - floating motes, the title breathing in
 *   2. approach  - the camera glides up to the flower-covered gate
 *   3. reveal    - the gate swings open, warm light and petals spill out
 *   4. flythrough- a long, eased pass over every habitat, lingering at three
 *                  highlights (bunny meadow, capybara lake, forest)
 *   5. welcome   - the personal greeting for Nhi settles over the plaza
 *   6. settle    - the camera relaxes into the exact free-exploration pose
 */

import * as THREE from 'three';

/** Ease that starts slow, speeds up, then glides to a stop. */
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CinematicDirector {
  constructor(sceneManager, zooGate, particleSystem, audioManager, onComplete) {
    this.sm = sceneManager;
    this.zooGate = zooGate;
    this.particles = particleSystem;
    this.audio = audioManager;
    this.onComplete = onComplete;

    this.isPlaying = false;
    this.finished = false;
    this.currentStep = 0;
    this.stepTimer = 0;
    this.totalTime = 0;
    this.paused = false;

    // Camera positions for the staged beats.
    this.SKY_START = new THREE.Vector3(0, 17, 40);
    this.SKY_END = new THREE.Vector3(0, 10.5, 33);
    this.GATE_APPROACH = new THREE.Vector3(0, 7.0, 24);
    this.THRESHOLD = new THREE.Vector3(0, 5.2, 13.5);
    this.PLAZA_REST = new THREE.Vector3(0, 5.6, 12.5);
    this.PLAZA_LOOK = new THREE.Vector3(0, 1.7, 0);

    // Flythrough spline: entrance -> meadow -> lake -> forest -> ice ->
    // lotus pond -> grassland -> savanna -> secret garden -> plaza.
    this.tourPoints = [
      { pos: [0, 5.6, 13.5], look: [0, 3.0, 4] },
      { pos: [12, 4.6, 12], look: [21, 1.0, 15] },
      { pos: [22, 3.8, 11], look: [21, 0.8, 16], hold: 0.9 },
      { pos: [10, 4.6, 6], look: [0, 1.6, 4] },
      { pos: [-8, 4.6, 9], look: [-19, 0.8, 12] },
      { pos: [-19, 3.9, 6], look: [-22, 0.7, 11], hold: 1.0 },
      { pos: [-9, 5.2, -8], look: [-16, 1.4, -22] },
      { pos: [-14, 4.4, -19], look: [-13, 0.9, -20], hold: 0.9 },
      { pos: [-22, 5.6, -28], look: [-33, 1.4, -38] },
      { pos: [-30, 5.0, -33], look: [-35, 1.0, -40] },
      { pos: [-12, 6.2, -30], look: [0, 2.4, -30] },
      { pos: [2, 6.4, -26], look: [0, 2.2, -30], hold: 1.0 },
      { pos: [16, 5.4, -18], look: [25, 1.0, -15] },
      { pos: [24, 4.4, -12], look: [24, 0.8, -14], hold: 0.8 },
      { pos: [26, 5.6, 6], look: [33, 1.2, 20] },
      { pos: [20, 5.4, 20], look: [33, 1.3, 22] },
      { pos: [-4, 6.6, 20], look: [-38, 1.4, 29] },
      { pos: [-30, 5.6, 22], look: [-40, 1.1, 30], hold: 0.9 },
      { pos: [-18, 7.0, 8], look: [0, 2.4, -6] },
      { pos: [0, 6.2, 12.5], look: [0, 1.7, -2] }
    ];

    this.tourCurve = new THREE.CatmullRomCurve3(
      this.tourPoints.map((p) => new THREE.Vector3(...p.pos)),
      false,
      'catmullrom',
      0.4
    );
    this.lookCurve = new THREE.CatmullRomCurve3(
      this.tourPoints.map((p) => new THREE.Vector3(...p.look)),
      false,
      'catmullrom',
      0.4
    );

    // Pre-compute an eased parameter table so the camera slows at the
    // highlights (points flagged with `hold`) and flows between them.
    this.buildEasedLut();

    // Backdrop state used behind the title screen.
    this.backdropAngle = -0.5;
    this.highlightFired = new Set();
  }

  // -------------------------------------------------------------------------
  //  BACKDROP (before the visitor presses start)
  // -------------------------------------------------------------------------
  /** A slow, dreamy drift so the title screen has a living 3D backdrop. */
  updateBackdrop(delta, time) {
    this.backdropAngle += delta * 0.035;
    const r = 46 + Math.sin(time * 0.12) * 5;
    const cam = this.sm.camera;
    cam.position.set(
      Math.sin(this.backdropAngle) * r,
      20 + Math.sin(time * 0.17) * 2.4,
      Math.cos(this.backdropAngle) * r + 6
    );
    this.sm.cameraTarget.set(0, 6, 4);
    cam.lookAt(this.sm.cameraTarget);
  }

  // -------------------------------------------------------------------------
  //  SEQUENCE CONTROL
  // -------------------------------------------------------------------------
  start() {
    this.isPlaying = true;
    this.currentStep = 1;
    this.stepTimer = 0;
    this.totalTime = 0;
    this.highlightFired.clear();

    this.sm.camera.position.copy(this.SKY_START);
    this.sm.cameraTarget.set(0, 8, 16);

    if (this.audio) this.audio.playIntroChime();
  }

  skip() {
    this.finishIntro();
  }

  finishIntro() {
    this.isPlaying = false;
    this.finished = true;
    this.currentStep = 6;

    // The gate is already open when the visitor arrives on their own.
    this.zooGate.openGate();
    this.zooGate.openProgress = 1.0;
    this.zooGate.targetOpenProgress = 1.0;
    if (this.zooGate.leftHinge && this.zooGate.rightHinge) {
      this.zooGate.leftHinge.rotation.y = -Math.PI * 0.55;
      this.zooGate.rightHinge.rotation.y = Math.PI * 0.55;
    }

    this.sm.camera.position.copy(this.PLAZA_REST);
    this.sm.cameraTarget.copy(this.PLAZA_LOOK);

    if (this.onComplete) this.onComplete();
  }

  /** Builds a monotonic time->curve-parameter table with eased holds. */
  buildEasedLut() {
    const segments = this.tourPoints.length - 1;
    this.lut = [];
    const raw = [];
    let total = 0;
    for (let i = 0; i < segments; i++) {
      const hold = this.tourPoints[i + 1].hold || 0;
      // Longer segments for holds, so the camera lingers there.
      const w = 1 + hold * 1.8;
      raw.push(w);
      total += w;
    }
    let acc = 0;
    this.lut.push({ u: 0, t: 0 });
    for (let i = 0; i < segments; i++) {
      acc += raw[i] / total;
      this.lut.push({ u: acc, t: (i + 1) / segments });
    }
  }

  /** Maps normalised time to curve parameter with easing inside each segment. */
  curveParam(u) {
    for (let i = 0; i < this.lut.length - 1; i++) {
      const a = this.lut[i];
      const b = this.lut[i + 1];
      if (u >= a.u && u <= b.u) {
        const local = (u - a.u) / Math.max(1e-6, b.u - a.u);
        const eased = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
        return a.t + (b.t - a.t) * eased;
      }
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  //  FRAME UPDATE
  // -------------------------------------------------------------------------
  update(delta) {
    if (!this.isPlaying) return;
    this.stepTimer += delta;
    this.totalTime += delta;

    switch (this.currentStep) {
      case 1: {
        // Beat 1: drifting sky, motes, the title takes a breath.
        const t = Math.min(1, this.stepTimer / 4.0);
        const e = easeInOutCubic(t) * 0.6 + t * 0.4;
        this.sm.camera.position.lerpVectors(this.SKY_START, this.SKY_END, e);
        this.sm.cameraTarget.set(0, 8.2, 17.5);
        if (this.stepTimer >= 4.0) this.next(2);
        break;
      }

      case 2: {
        // Beat 2: the long, quiet approach to the gate.
        const t = Math.min(1, this.stepTimer / 4.2);
        this.sm.camera.position.lerpVectors(this.SKY_END, this.GATE_APPROACH, easeInOutCubic(t));
        this.sm.cameraTarget.set(0, 6.4, 17);
        if (this.stepTimer >= 4.2) {
          this.next(3);
          this.zooGate.openGate();
          if (this.audio) this.audio.playGateOpen();
          if (this.particles) {
            this.particles.createPetalBurst(new THREE.Vector3(0, 4.2, 17));
            this.particles.createGateGlow(new THREE.Vector3(0, 3.4, 17.5));
          }
          if (this.zooGate.spillLight) this.zooGate.targetOpenProgress = 1.0;
        }
        break;
      }

      case 3: {
        // Beat 3: hold still and let the gate's light wash over the camera.
        this.sm.camera.position.lerpVectors(this.GATE_APPROACH, this.THRESHOLD, easeInOutCubic(Math.min(1, this.stepTimer / 2.6)));
        this.sm.cameraTarget.set(0, 4.4, 8);
        if (this.stepTimer >= 2.6) {
          this.next(4);
          if (this.particles) this.particles.createPetalBurst(new THREE.Vector3(0, 3.6, 12));
        }
        break;
      }

      case 4: {
        // Beat 4: the grand flythrough, paced by the eased parameter table.
        const duration = 26.0;
        const u = Math.min(1, this.stepTimer / duration);
        const param = this.curveParam(u);
        const camPos = this.tourCurve.getPointAt(Math.min(0.999, param));
        const lookPos = this.lookCurve.getPointAt(Math.min(0.999, param));
        this.sm.camera.position.copy(camPos);
        this.sm.cameraTarget.copy(lookPos);

        // Fire the highlight moments once each, in order.
        const marks = [
          { u: 0.13, key: 'meadow', pos: new THREE.Vector3(21, 1.2, 15) },
          { u: 0.3, key: 'lake', pos: new THREE.Vector3(-21, 0.9, 11) },
          { u: 0.45, key: 'forest', pos: new THREE.Vector3(-14, 1.0, -21) },
          { u: 0.62, key: 'ice', pos: new THREE.Vector3(-34, 1.0, -39) },
          { u: 0.78, key: 'garden', pos: new THREE.Vector3(0, 2.6, -30) }
        ];
        for (const mark of marks) {
          if (u >= mark.u && !this.highlightFired.has(mark.key)) {
            this.highlightFired.add(mark.key);
            if (this.particles) {
              this.particles.createEatingSparkles(mark.pos.clone().add(new THREE.Vector3(0, 0.9, 0)));
              if (mark.key === 'meadow' || mark.key === 'garden') {
                this.particles.createPetalBurst(mark.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
              }
            }
          }
        }

        if (this.stepTimer >= duration) {
          this.next(5);
        }
        break;
      }

      case 5: {
        // Beat 5: the personal welcome, camera easing to the rest pose.
        const k = Math.min(1, delta * 1.6);
        this.sm.camera.position.lerp(this.PLAZA_REST, k);
        this.sm.cameraTarget.lerp(this.PLAZA_LOOK, k);
        if (this.stepTimer >= 4.2) this.finishIntro();
        break;
      }

      default:
        break;
    }

    // Ease the gate's spill light back down after the reveal.
    if (this.zooGate.spillLight && this.currentStep > 4) {
      this.zooGate.spillLight.intensity = Math.min(this.zooGate.spillLight.intensity, 0.8);
    }
  }

  next(step) {
    this.currentStep = step;
    this.stepTimer = 0;
  }
}

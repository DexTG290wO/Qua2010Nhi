/**
 * ToyBall.js
 * The ball Nhi throws for the animals. It follows a real parabolic arc with a
 * couple of decaying bounces and then rests, calling `onLand` exactly once so
 * the interaction system can send a willing animal chasing after it.
 */

import * as THREE from 'three';
import { getGroundHeight } from '../environment/terrainHeight.js';

const GRAVITY = -22;

export class ToyBall {
  constructor(scene) {
    this.scene = scene;
    this.mesh = this.createBallMesh();
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    this.active = false;
    this.velocity = new THREE.Vector3();
    this.bounces = 0;
    this.onLand = null;
    this.restTimer = 0;
  }

  createBallMesh() {
    const group = new THREE.Group();

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xff7fa8, roughness: 0.35, metalness: 0.08 })
    );
    ball.castShadow = true;
    group.add(ball);

    const bandMat = new THREE.MeshStandardMaterial({ color: 0xfff3f8, roughness: 0.4 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.045, 8, 22), bandMat);
    band.rotation.x = Math.PI / 2;
    group.add(band);
    const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.045, 8, 22), bandMat);
    band2.rotation.y = Math.PI / 3;
    group.add(band2);

    return group;
  }

  /** Lob the ball from `from` toward `to`, with a natural rise and fall. */
  throwTo(from, to) {
    this.mesh.position.copy(from);
    this.mesh.visible = true;
    this.active = true;
    this.bounces = 0;
    this.restTimer = 0;
    this.landCalled = false;

    const flat = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const distance = Math.max(0.5, flat.length());
    flat.normalize();

    // Pick the vertical speed that lands the ball at the target distance, then
    // solve the horizontal speed from the flight time.
    const flightTime = THREE.MathUtils.clamp(distance / 4.6, 0.55, 1.6);
    const vy = Math.abs(GRAVITY) * flightTime * 0.5;
    this.velocity.set(
      flat.x * (distance / flightTime),
      vy,
      flat.z * (distance / flightTime)
    );
    this.spin = new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 4 - 2, Math.random() * 6 - 3);
  }

  update(delta) {
    if (!this.active) return;

    this.velocity.y += GRAVITY * delta;
    this.mesh.position.addScaledVector(this.velocity, delta);

    this.mesh.rotation.x += this.spin.x * delta;
    this.mesh.rotation.y += this.spin.y * delta;
    this.mesh.rotation.z += this.spin.z * delta;

    const groundY = getGroundHeight(this.mesh.position.x, this.mesh.position.z) + 0.26;

    if (this.mesh.position.y <= groundY) {
      this.mesh.position.y = groundY;
      if (Math.abs(this.velocity.y) < 1.6 || this.bounces >= 3) {
        this.velocity.set(0, 0, 0);
        this.spin.multiplyScalar(0.85);
        this.restTimer += delta;
        if (!this.landCalled) {
          this.landCalled = true;
          if (this.onLand) this.onLand(this.mesh.position.clone());
        }
        if (this.restTimer > 5.5) {
          this.active = false;
          this.mesh.visible = false;
        }
      } else {
        this.velocity.y = -this.velocity.y * 0.48;
        this.velocity.x *= 0.72;
        this.velocity.z *= 0.72;
        this.bounces++;
      }
    }
  }

  hide() {
    this.active = false;
    this.mesh.visible = false;
  }
}

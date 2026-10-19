/**
 * FoodItem.js
 * 3D Stylized procedural food items for feeding zoo animals.
 * Handles tossing animation, falling trajectory, and particle dissipation on eating.
 */

import * as THREE from 'three';

export class FoodFactory {
  static createFoodMesh(type) {
    const group = new THREE.Group();

    switch (type) {
      case 'carrot': {
        // Orange conical root
        const rootGeo = new THREE.ConeGeometry(0.2, 0.9, 12);
        const rootMat = new THREE.MeshStandardMaterial({
          color: 0xff7b25,
          roughness: 0.4
        });
        const root = new THREE.Mesh(rootGeo, rootMat);
        root.rotation.x = Math.PI;
        group.add(root);

        // Green leafy tops
        const leafGeo = new THREE.ConeGeometry(0.08, 0.45, 6);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
        for (let l = 0; l < 3; l++) {
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.y = 0.55;
          leaf.rotation.z = (l - 1) * 0.35;
          group.add(leaf);
        }
        break;
      }

      case 'orange': {
        // Round mandarin with tiny leaf
        const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0xff9800,
          roughness: 0.4
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.scale.set(1.1, 0.95, 1.1);
        group.add(body);

        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6),
          new THREE.MeshStandardMaterial({ color: 0x5d4037 })
        );
        stem.position.y = 0.36;
        group.add(stem);

        const leaf = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.02, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x43a047 })
        );
        leaf.position.set(0.12, 0.4, 0);
        group.add(leaf);
        break;
      }

      case 'apple': {
        // Sweet red honey apple
        const appleGeo = new THREE.SphereGeometry(0.32, 16, 16);
        const appleMat = new THREE.MeshStandardMaterial({
          color: 0xff3344,
          roughness: 0.3
        });
        const apple = new THREE.Mesh(appleGeo, appleMat);
        apple.scale.set(1.0, 0.9, 1.0);
        group.add(apple);

        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.03, 0.18, 6),
          new THREE.MeshStandardMaterial({ color: 0x4e342e })
        );
        stem.position.y = 0.32;
        group.add(stem);
        break;
      }

      case 'fish': {
        // Silver glittering fish
        const fishGeo = new THREE.ConeGeometry(0.18, 0.7, 8);
        const fishMat = new THREE.MeshStandardMaterial({
          color: 0x90caf9,
          metalness: 0.6,
          roughness: 0.2
        });
        const fish = new THREE.Mesh(fishGeo, fishMat);
        fish.rotation.z = Math.PI / 2;
        group.add(fish);

        // Tail fin
        const tail = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.25, 0.2),
          fishMat
        );
        tail.position.x = -0.4;
        group.add(tail);
        break;
      }

      case 'bamboo': {
        // Bamboo shoot
        const shootMat = new THREE.MeshStandardMaterial({ color: 0x7cb342, roughness: 0.5 });
        const shoot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.8, 8), shootMat);
        group.add(shoot);
        break;
      }

      case 'watermelon': {
        // Watermelon wedge
        const wedgeGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.15, 12, 1, false, 0, Math.PI * 0.6);
        const rindMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
        const fleshMat = new THREE.MeshStandardMaterial({ color: 0xff4081 });
        const wedge = new THREE.Mesh(wedgeGeo, fleshMat);
        wedge.rotation.x = Math.PI / 2;
        group.add(wedge);
        break;
      }

      default: {
        const berry = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0xe91e63 })
        );
        group.add(berry);
      }
    }

    return group;
  }
}

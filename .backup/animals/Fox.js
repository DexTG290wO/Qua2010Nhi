/**
 * Fox.js
 * Cáo Nhỏ Lửa — slender torso, long tapered muzzle, tall pointed ears and a
 * big brush tail that arcs upward with a white tip.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.8,
  bodyWidth: 0.21,
  bodyHeight: 0.22,
  legLength: 0.46,
  legRadius: 0.052,
  neckUp: 0.2,
  neckFwd: 0.22,
  headSize: 0.17,
  stance: 0.14,
  earType: 'pointed',
  tailType: 'bushy',
  muzzle: 'long',
  bellyDrop: 0.07,
  gait: 'trot',
  tailLift: 0.5
});

const CFG = {
  bellyRound: 0.16,
  legClearance: 0.36,
  cheekMass: 0.22,
  headLen: 0.98,
  neckThickness: 0.5,
  muzzleLen: 0.72,
  muzzleWidth: 0.44,
  muzzleDrop: 0.24,
  muzzleTipScale: 0.62,
  ear: { type: 'pointed', size: 0.18, spread: 0.42 },
  tail: { type: 'bush', baseScale: 0.42, tipColor: 'tailTip', extend: 0.16 },
  legScale: 1.0,
  upperLegScale: 1.7,
  midLegScale: 1.1,
  pawWidth: 1.4,
  pawLength: 1.8,
  eyeSize: 0.043,
  noseSize: 0.15,
  c: {
    base: 0xf09a4e,
    belly: 0xfff4e8,
    accent: 0xffd9a8,
    mask: 0xfff6ec,
    sock: 0x47302a,
    paw: 0x3d2823,
    tailTip: 0xfff8f0,
    innerEar: 0xffc2d6,
    nose: 0x33262b,
    eye: 0x2b1a14
  }
};

export class Fox extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'fox',
      name: 'Cáo Nhỏ Lửa',
      species: 'Cáo Đỏ Tinh Nghịch',
      title: 'Chú cáo nhanh nhất khu rừng',
      description:
        'Cáo Nhỏ Lửa chạy nhanh đến mức những cánh hoa rơi cũng phải ngẩn người nhìn theo. Chú thích được vuốt ve sau hai tai và thích nhất là trò ném bóng.',
      funFacts: [
        'Cáo có thể nghe thấy tiếng động rất nhỏ từ khoảng cách hàng chục mét.',
        'Chiếc đuôi xù của chú giúp giữ ấm cơ thể vào ban đêm.',
        'Cáo Nhỏ Lửa thích ngủ cuộn tròn dưới ánh trăng.',
        'Chú có thể chạy nhanh tới 45 km mỗi giờ trong đoạn ngắn.'
      ],
      favoriteFood: 'apple',
      favoriteFoodName: 'Táo Đỏ Ngọt',
      homeZone: 'fairytale_forest',
      position: config.position || new THREE.Vector3(-13, 0, -19),
      wanderRadius: 6.5,
      walkSpeed: 1.3,
      runSpeed: 4.0,
      runChance: 0.4,
      colliderRadius: 0.34,
      colliderHeight: 0.5,
      bubbleScale: 0.7,
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.6,
        knee: 0.55,
        bob: 0.055,
        pitch: 0.12,
        neck: 0.24,
        head: 0.2,
        tail: 0.2,
        ear: 0.2,
        sleepDrop: -0.16
      }),
      clipOptions: { walkDuration: 0.8, runDuration: 0.46, idleDuration: 5.6 },
      clipMeta: {
        Walk: { strideLength: 1.04, duration: 0.8 },
        Run: { strideLength: 1.84, duration: 0.46 }
      }
    });
  }
}


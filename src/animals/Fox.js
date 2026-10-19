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
  bodyLength: 0.76,
  bodyWidth: 0.2,
  bodyHeight: 0.21,
  legLength: 0.46,
  legRadius: 0.048,
  neckUp: 0.22,
  neckFwd: 0.26,
  headSize: 0.185,
  stance: 0.14,
  earType: 'pointed',
  tailType: 'bushy',
  tailSegs: 5,
  tailLength: 0.58,
  tailLift: 0.55,
  muzzle: 'long',
  bellyDrop: 0.07,
  gait: 'trot',
  eyeSpread: 0.32,
  eyeHeight: 0.16,
  eyeForward: 0.74
});

const CFG = {
  bellyRound: 0.16,
  bellyWidth: 0.62,
  bellySharp: 4.2,
  waistScale: 0.88,
  backArch: 0.02,
  legClearance: 0.36,
  cheekMass: 0.12,
  cheekHeight: 0.32,
  cheekColor: 'base',
  maskSharp: 4.4,
  cheekRuff: { color: 'cheek', sharp: 3.2 },
  headLen: 1.02,
  headScale: [1.0, 0.96, 1.04],
  crownRise: 0.22,
  crownDepth: 0.6,
  neckThickness: 0.47,
  muzzleLen: 0.8,
  muzzleWidth: 0.42,
  muzzleDrop: 0.2,
  muzzleTipScale: 0.5,
  muzzlePad: 0.92,
  muzzleBridgeDrop: 0.02,
  muzzleColor: 'base',
  faceColor: 'base',
  lipDrop: 0.4,
  throatSharp: 4.6,
  throatColor: 'mask',
  ear: {
    type: 'pointed',
    size: 0.19,
    spread: 0.3,
    cupOut: 0.18,
    innerWidth: 0.34,
    innerLength: 0.4,
    innerAt: 0.35,
    tipColor: 'earEdge',
    tipAt: 0.72
  },
  tail: { type: 'bush', baseScale: 0.48, tipColor: 'tailTip', extend: 0.2, tipAt: 0.6 },
  legScale: 1.0,
  upperLegScale: 1.7,
  midLegScale: 1.05,
  pawWidth: 1.3,
  pawLength: 1.7,
  pawHeight: 0.55,
  toeCount: 4,
  eyeSize: 0.034,
  noseSize: 0.09,
  noseWidth: 1.2,
  whiskerDots: true,
  whiskers: true,
  c: {
    base: 0xd95f1b,
    belly: 0xfff6e9,
    accent: 0xe9a15b,
    mask: 0xfff7ee,
    cheek: 0xfff3e2,
    sock: 0x3b2a25,
    paw: 0x2f211d,
    tailTip: 0xfffaf3,
    innerEar: 0xffd9c4,
    ear: 0xe8792e,
    earEdge: 0x35251f,
    nose: 0x2a1e1a,
    eye: 0x2b1a14,
    throat: 0xfff8ef,
    lid: 0xe8792e
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


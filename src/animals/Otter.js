/**
 * Otter.js
 * Rái Cá Mun — long, flexible swimming body, rounded head with a short broad
 * muzzle, tiny ears, short limbs with wide paws and a thick rudder tail.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.6,
  bodyWidth: 0.21,
  bodyHeight: 0.17,
  legLength: 0.2,
  legRadius: 0.05,
  neckUp: 0.09,
  neckFwd: 0.16,
  headSize: 0.18,
  stance: 0.11,
  earType: 'round',
  tailType: 'rudder',
  tailSegs: 4,
  tailLength: 0.5,
  tailLift: 0.02,
  muzzle: 'short',
  bellyDrop: 0.05,
  gait: 'walk',
  eyeSpread: 0.4,
  eyeHeight: 0.2,
  eyeForward: 0.64
});

const CFG = {
  // Long streamlined torso: the backbone of a swimmer.
  bellyRound: 0.24,
  rumpScale: 0.04,
  legClearance: 0.2,
  headLen: 1.0,
  headScale: [1.15, 0.88, 0.98],
  crownRise: 0.18,
  crownDepth: 0.5,
  neckThickness: 0.9,
  cheekMass: 0.5,
  cheekHeight: 0.6,
  muzzleLen: 0.22,
  muzzleWidth: 0.82,
  muzzleDrop: 0.1,
  muzzleTipScale: 0.98,
  muzzlePad: 1.3,
  muzzleHeight: 0.85,
  lipDrop: 0.5,
  ear: {
    type: 'round',
    size: 0.05,
    spread: 0.65,
    innerWidth: 0.48,
    innerLength: 0.45
  },
  tail: { type: 'rudder', baseScale: 0.8, extend: 0.18, wide: 1.15, thin: 0.5, tipColor: 'base' },
  legScale: 1.0,
  upperLegScale: 1.8,
  midLegScale: 1.2,
  pawWidth: 2.1,
  pawLength: 2.1,
  pawForward: 0.8,
  pawHeight: 0.42,
  toeCount: 4,
  toeSpread: 1.25,
  eyeSize: 0.035,
  noseSize: 0.13,
  noseWidth: 1.5,
  noseHeight: 0.55,
  whiskerDots: true,
  whiskers: true,
  c: {
    base: 0x6d4c36,
    belly: 0xd8b285,
    accent: 0x8a6548,
    mask: 0xc9a274,
    cheek: 0xc9a274,
    sock: 0x5a3d2b,
    paw: 0x4f3526,
    nose: 0x2c1e18,
    innerEar: 0xb98f6d,
    eye: 0x241a14,
    ear: 0x6d4c36,
    earEdge: 0x5a3d2b,
    throat: 0xe0bea0,
    whisker: 0xf5ead9,
    lid: 0x6d4c36
  }
};

export class Otter extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'otter',
      name: 'Rái Cá Mun',
      species: 'Rái Cá Tinh Nghịch',
      title: 'Vận động viên bơi lội của hồ nước',
      description:
        'Mun bơi như một chú cá nhỏ, xoay tròn trong nước rồi trượt lên bờ với bộ lông ướt lấp lánh. Bé rất thích được vuốt ve và thích chơi trò đuổi bắt.',
      funFacts: [
        'Rái cá có thể lặn sâu hơn 50 mét.',
        'Bộ lông của Mun có tới gần một triệu sợi lông trên mỗi cm vuông.',
        'Mun thích ngủ trôi trên mặt nước cùng bạn bè.',
        'Rái cá dùng đá để đập vỡ vỏ ốc — một trong số ít loài biết dùng công cụ.'
      ],
      favoriteFood: 'fish',
      favoriteFoodName: 'Cá Bạc Tươi',
      homeZone: 'capybara_lake',
      position: config.position || new THREE.Vector3(-27, 0, 5),
      wanderRadius: 8,
      walkSpeed: 0.85,
      runSpeed: 2.4,
      runChance: 0.42,
      canSwim: true,
      floatDepth: 0.24,
      colliderRadius: 0.28,
      colliderHeight: 0.26,
      bubbleScale: 0.6,
      palette: { skinRoughness: 0.8 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.6,
        knee: 0.55,
        bob: 0.04,
        sway: 0.07,
        neck: 0.2,
        head: 0.18,
        tail: 0.16,
        ear: 0.16,
        sleepDrop: -0.08
      }),
      clipOptions: { walkDuration: 0.7, runDuration: 0.42, idleDuration: 5.0, extras: ['Swim'] },
      clipMeta: {
        Walk: { strideLength: 0.6, duration: 0.7 },
        Run: { strideLength: 1.0, duration: 0.42 }
      }
    });
  }
}


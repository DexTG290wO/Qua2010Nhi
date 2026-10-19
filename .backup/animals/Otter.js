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
  bodyLength: 0.7,
  bodyWidth: 0.185,
  bodyHeight: 0.16,
  legLength: 0.2,
  legRadius: 0.052,
  neckUp: 0.075,
  neckFwd: 0.13,
  headSize: 0.15,
  stance: 0.115,
  earType: 'round',
  tailType: 'thin',
  muzzle: 'short',
  bellyDrop: 0.05,
  gait: 'walk'
});

const CFG = {
  // Long streamlined torso: the backbone of a swimmer.
  bellyRound: 0.24,
  rumpScale: 0.04,
  legClearance: 0.22,
  headLen: 1.0,
  headScale: [1.0, 0.95, 1.0],
  neckThickness: 0.68,
  cheekMass: 0.24,
  muzzleLen: 0.32,
  muzzleWidth: 0.68,
  muzzleDrop: 0.16,
  muzzleTipScale: 0.8,
  ear: { type: 'round', size: 0.055, spread: 0.62 },
  tail: { type: 'thin', baseScale: 0.5, extend: 0.26 },
  legScale: 1.0,
  upperLegScale: 1.8,
  midLegScale: 1.2,
  pawWidth: 1.85,
  pawLength: 2.0,
  pawForward: 0.85,
  eyeSize: 0.038,
  noseSize: 0.17,
  c: {
    base: 0x8a6a52,
    belly: 0xe4c9a8,
    accent: 0xa8805f,
    mask: 0xd9bb98,
    sock: 0x7a5a44,
    paw: 0x6f5340,
    nose: 0x3b2a24,
    innerEar: 0xc99a78,
    eye: 0x241a14
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


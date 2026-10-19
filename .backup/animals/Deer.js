/**
 * Deer.js
 * Hươu Con Bambi — slender neck rising from the chest, tapered deer muzzle,
 * long legs with cloven hooves, large listening ears and a spotted fawn coat.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.88,
  bodyWidth: 0.215,
  bodyHeight: 0.25,
  legLength: 0.66,
  legRadius: 0.045,
  neckUp: 0.4,
  neckFwd: 0.22,
  headSize: 0.19,
  stance: 0.14,
  earType: 'round',
  tailType: 'puff',
  muzzle: 'long',
  bellyDrop: 0.09,
  hoofed: true,
  gait: 'walk'
});

const CFG = {
  bellyRound: 0.16,
  rumpScale: 0.02,
  legClearance: 0.36,
  headLen: 1.0,
  neckThickness: 0.42,
  cheekMass: 0.14,
  muzzleLen: 0.78,
  muzzleWidth: 0.46,
  muzzleDrop: 0.3,
  muzzleTipScale: 0.58,
  ear: { type: 'round', size: 0.2, spread: 0.66 },
  tail: { type: 'puff', baseScale: 0.4, tipColor: 'belly' },
  spots: { color: 'belly', size: 0.15, count: 18, sharp: 5.5 },
  hoof: true,
  legScale: 1.0,
  upperLegScale: 1.9,
  midLegScale: 1.1,
  eyeSize: 0.05,
  noseSize: 0.16,
  c: {
    base: 0xd9a97c,
    belly: 0xfff6ea,
    accent: 0xffe6c8,
    mask: 0xf7e6d2,
    sock: 0xc99a6e,
    paw: 0x4a3830,
    tailTip: 0xfff6ea,
    hoof: 0x4a3830,
    innerEar: 0xffd0c0,
    nose: 0x6b4a3a,
    eye: 0x2a1c14
  }
};

export class Deer extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'deer',
      name: 'Hươu Con Bambi',
      species: 'Hươu Sao Dịu Dàng',
      title: 'Đôi mắt nâu hiền lành của khu rừng',
      description:
        'Bambi bước đi rất nhẹ nhàng, như sợ làm phiền những giấc mơ của khu rừng. Chú thích ăn lá non và thích được vuốt ve dọc sống lưng.',
      funFacts: [
        'Những đốm trắng trên lưng Bambi sẽ mờ dần khi chú lớn lên.',
        'Hươu con có thể đứng dậy và đi lại chỉ vài giờ sau khi sinh.',
        'Đôi tai to của Bambi có thể quay về hai phía độc lập để nghe ngóng.',
        'Bambi ngủ rất ít, chỉ vài giờ mỗi ngày.'
      ],
      favoriteFood: 'apple',
      favoriteFoodName: 'Lá Non Và Táo',
      homeZone: 'fairytale_forest',
      position: config.position || new THREE.Vector3(-6, 0, -25),
      wanderRadius: 6.0,
      walkSpeed: 1.0,
      runSpeed: 3.4,
      runChance: 0.24,
      colliderRadius: 0.36,
      colliderHeight: 0.72,
      bubbleScale: 0.85,
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.55,
        knee: 0.5,
        bob: 0.045,
        pitch: 0.1,
        neck: 0.2,
        head: 0.18,
        tail: 0.16,
        ear: 0.24,
        sleepDrop: -0.22
      }),
      clipOptions: { walkDuration: 0.95, runDuration: 0.52, idleDuration: 6.2 },
      clipMeta: {
        Walk: { strideLength: 0.95, duration: 0.95 },
        Run: { strideLength: 1.77, duration: 0.52 }
      }
    });
  }
}




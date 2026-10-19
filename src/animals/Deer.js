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
  bodyLength: 0.76,
  bodyWidth: 0.185,
  bodyHeight: 0.21,
  legLength: 0.76,
  legRadius: 0.046,
  neckUp: 0.48,
  neckFwd: 0.32,
  headSize: 0.195,
  stance: 0.13,
  earType: 'leaf',
  tailType: 'puff',
  tailSpec: { len: 0.13, segs: 1 },
  muzzle: 'long',
  bellyDrop: 0.09,
  hoofed: true,
  gait: 'walk',
  eyeSpread: 0.52,
  eyeHeight: 0.2,
  eyeForward: 0.56
});

const CFG = {
  bellyRound: 0.16,
  bellyWidth: 0.48,
  bellyDepth: 0.22,
  bellySharp: 5.2,
  rumpScale: 0.03,
  legClearance: 0.36,
  headLen: 1.0,
  headScale: [1.0, 1.02, 1.08],
  neckThickness: 0.34,
  cheekMass: 0.2,
  cheekHeight: 0.5,
  muzzleLen: 0.72,
  muzzleWidth: 0.44,
  muzzleDrop: 0.25,
  muzzleTipScale: 0.55,
  muzzlePad: 0.95,
  muzzleBridgeDrop: 0.015,
  lipDrop: 0.5,
  rumpPatch: 'belly',
  ear: {
    type: 'leaf',
    size: 0.21,
    spread: 0.55,
    cupOut: 0.24,
    innerWidth: 0.46,
    innerLength: 0.44,
    innerAt: 0.4
  },
  tail: { type: 'puff', baseScale: 0.34, tipColor: 'tailTip' },
  spots: { color: 'belly', size: 0.06, count: 30, sharp: 7, seed: 9 },
  hoof: true,
  legStyle: 'hoof',
  legScale: 1.0,
  upperLegScale: 1.8,
  midLegScale: 0.95,
  cannonScale: 0.8,
  shinScale: 0.58,
  hoofScale: 0.7,
  eyeSize: 0.043,
  noseSize: 0.11,
  noseWidth: 1.35,
  whiskerDots: true,
  c: {
    base: 0xbb7b4b,
    belly: 0xfff3df,
    accent: 0xd9a574,
    mask: 0xf6e3c8,
    cheek: 0xf6e3c8,
    sock: 0xab7046,
    paw: 0x3e2d24,
    tailTip: 0xfff6ea,
    hoof: 0x3e2d24,
    innerEar: 0xffc9b4,
    nose: 0x5a3e30,
    eye: 0x2a1c14,
    ear: 0xc98a58,
    earEdge: 0xa76f45,
    throat: 0xfff4e4,
    lid: 0xc98a58
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




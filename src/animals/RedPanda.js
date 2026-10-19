/**
 * RedPanda.js
 * Gấu Trúc Đỏ Mun — compact rust body, cream face mask with brow spots, dark
 * belly and legs, rounded fluffy ears and a thick tail with alternating rings.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.62,
  bodyWidth: 0.25,
  bodyHeight: 0.22,
  legLength: 0.3,
  legRadius: 0.056,
  neckUp: 0.14,
  neckFwd: 0.15,
  headSize: 0.19,
  stance: 0.15,
  earType: 'fluffy',
  tailType: 'ringed',
  tailSegs: 7,
  tailLength: 0.7,
  tailLift: 0.18,
  muzzle: 'short',
  bellyDrop: 0.07,
  gait: 'walk',
  eyeSpread: 0.36,
  eyeHeight: 0.17,
  eyeForward: 0.68
});

const CFG = {
  bellyRound: 0.3,
  rumpScale: 0.05,
  legClearance: 0.26,
  headLen: 0.98,
  headScale: [1.12, 1.02, 0.98],
  crownRise: 0.28,
  crownDepth: 0.7,
  neckThickness: 0.7,
  cheekMass: 0.42,
  cheekHeight: 0.55,
  cheekRuff: { color: 'mask' },
  muzzleLen: 0.22,
  muzzleWidth: 0.62,
  muzzleDrop: 0.16,
  muzzleTipScale: 0.82,
  muzzlePad: 1.15,
  lipDrop: 0.5,
  ear: {
    type: 'fluffy',
    size: 0.12,
    spread: 0.45,
    innerWidth: 0.55,
    innerLength: 0.45,
    tipColor: 'accent',
    tipAt: 0.7
  },
  tail: {
    type: 'ringed',
    baseScale: 0.42,
    extend: 0.15,
    ringColor: 'base',
    bandColor: 'ringBand',
    tipColor: 'tailTip'
  },
  legScale: 0.95,
  upperLegScale: 1.8,
  midLegScale: 1.15,
  pawWidth: 1.5,
  pawLength: 1.8,
  toeCount: 4,
  eyeSize: 0.04,
  noseSize: 0.11,
  noseWidth: 1.3,
  browSpots: 'accent',
  whiskerDots: true,
  c: {
    base: 0xc9562a,
    belly: 0x3a2a26,
    accent: 0xf3ddc7,
    mask: 0xf6e3d2,
    cheek: 0xf6e3d2,
    sock: 0x3a2a26,
    paw: 0x2f211d,
    tailTip: 0x3a2a26,
    ringBand: 0x432e28,
    innerEar: 0xf6e3d2,
    ear: 0xc9562a,
    earEdge: 0x3a2a26,
    nose: 0x241a17,
    eye: 0x241715,
    throat: 0x3a2a26,
    lid: 0xc9562a
  }
};

export class RedPanda extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'red_panda',
      name: 'Gấu Trúc Đỏ Mun',
      species: 'Gấu Trúc Đỏ Leo Trèo',
      title: 'Chuyên gia cân bằng trên cành cây',
      description:
        'Mun có chiếc đuôi sọc dài hơn cả thân mình và rất thích leo lên những cành cao để ngắm cả khu rừng. Chú nhút nhát nhưng một khi đã tin ai thì sẽ dụi đầu vào tay người đó.',
      funFacts: [
        'Gấu trúc đỏ dùng đuôi quấn quanh người như một chiếc chăn ấm.',
        'Mun có một chiếc xương cổ tay phụ giúp bám chắc vào cành cây.',
        'Chú thích ăn trúc non và những quả mọng ngọt.',
        'Gấu trúc đỏ có thể ngủ tới 17 tiếng mỗi ngày.'
      ],
      favoriteFood: 'bamboo',
      favoriteFoodName: 'Cành Trúc Non',
      homeZone: 'fairytale_forest',
      position: config.position || new THREE.Vector3(-19, 0, -26),
      wanderRadius: 5.5,
      walkSpeed: 0.95,
      runSpeed: 2.6,
      runChance: 0.3,
      colliderRadius: 0.34,
      colliderHeight: 0.48,
      bubbleScale: 0.7,
      palette: { skinRoughness: 0.9 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.5,
        knee: 0.5,
        bob: 0.045,
        neck: 0.22,
        head: 0.18,
        tail: 0.18,
        ear: 0.24,
        sleepDrop: -0.13
      }),
      clipOptions: { walkDuration: 0.9, runDuration: 0.5, idleDuration: 5.8 },
      clipMeta: {
        Walk: { strideLength: 0.86, duration: 0.9 },
        Run: { strideLength: 1.3, duration: 0.5 }
      }
    });
  }
}


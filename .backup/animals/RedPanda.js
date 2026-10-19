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
  bodyLength: 0.66,
  bodyWidth: 0.24,
  bodyHeight: 0.21,
  legLength: 0.31,
  legRadius: 0.058,
  neckUp: 0.15,
  neckFwd: 0.15,
  headSize: 0.175,
  stance: 0.15,
  earType: 'fluffy',
  tailType: 'ringed',
  muzzle: 'short',
  bellyDrop: 0.07,
  gait: 'walk',
  tailLift: 0.42
});

const CFG = {
  bellyRound: 0.3,
  rumpScale: 0.03,
  legClearance: 0.26,
  headLen: 0.98,
  headScale: [1.04, 0.98, 1.0],
  neckThickness: 0.62,
  cheekMass: 0.32,
  muzzleLen: 0.28,
  muzzleWidth: 0.6,
  muzzleDrop: 0.18,
  muzzleTipScale: 0.78,
  ear: { type: 'fluffy', size: 0.115, spread: 0.55 },
  tail: { type: 'ringed', baseScale: 0.34, extend: 0.18 },
  legScale: 0.95,
  upperLegScale: 1.8,
  midLegScale: 1.15,
  pawWidth: 1.5,
  pawLength: 1.8,
  eyeSize: 0.044,
  noseSize: 0.15,
  c: {
    base: 0xd2622f,
    belly: 0x4a3330,
    accent: 0xf3dcc8,
    mask: 0xf3dcc8,
    sock: 0x3b2a26,
    paw: 0x35241f,
    tailTip: 0x3b2a26,
    innerEar: 0xf3dcc8,
    nose: 0x2b1f1c,
    eye: 0x241715
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


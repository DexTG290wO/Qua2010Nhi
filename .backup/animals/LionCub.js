/**
 * LionCub.js
 * Sư Tử Con Nắng — compact, muscular cub body with an oversized head, feline
 * muzzle with a broad nose, chubby cheeks, rounded ears and a tufted tail.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.6,
  bodyWidth: 0.22,
  bodyHeight: 0.2,
  legLength: 0.36,
  legRadius: 0.062,
  neckUp: 0.16,
  neckFwd: 0.16,
  headSize: 0.21,
  stance: 0.16,
  earType: 'round',
  tailType: 'thin',
  muzzle: 'short',
  bellyDrop: 0.08,
  gait: 'walk',
  tailLift: 0.28
});

const CFG = {
  bellyRound: 0.24,
  rumpScale: 0.03,
  legClearance: 0.26,
  // A cub reads as young because the head is large relative to the body.
  headLen: 0.96,
  headScale: [1.06, 1.0, 1.0],
  neckThickness: 0.6,
  cheekMass: 0.36,
  browMass: 0.1,
  muzzleLen: 0.28,
  muzzleWidth: 0.66,
  muzzleDrop: 0.22,
  muzzleTipScale: 0.86,
  ear: { type: 'tufted', size: 0.105, spread: 0.5 },
  tail: { type: 'plume', baseScale: 0.3, tipColor: 'dark', extend: 0.16 },
  legScale: 1.0,
  upperLegScale: 1.85,
  midLegScale: 1.2,
  pawWidth: 1.6,
  pawLength: 1.85,
  eyeSize: 0.048,
  noseSize: 0.18,
  c: {
    base: 0xe9c179,
    belly: 0xfff2dc,
    accent: 0xd9a24f,
    mask: 0xfff0d6,
    sock: 0xe0b76c,
    paw: 0xd9a24f,
    tailTip: 0x6b4a2f,
    innerEar: 0xffc9b0,
    nose: 0xb5715a,
    eye: 0x33231a
  }
};

export class LionCub extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'lion_cub',
      name: 'Sư Tử Con Nắng',
      species: 'Sư Tử Con Tinh Nghịch',
      title: 'Chú sư tử nhỏ của thảo nguyên',
      description:
        'Nắng là chú sư tử con luôn tràn đầy năng lượng. Bé thích rình rập những chiếc lá bay, tập gầm gừ với bóng của mình và ngủ trưa dưới nắng vàng.',
      funFacts: [
        'Sư tử con sinh ra đã có đốm mờ, sẽ mất dần khi lớn lên.',
        'Nắng tập gầm từ khi còn rất nhỏ, nhưng tiếng gầm thật phải chờ vài năm nữa.',
        'Sư tử ngủ tới 20 tiếng mỗi ngày để giữ sức cho những chuyến đi săn.',
        'Bờm của sư tử đực bắt đầu mọc khi chúng khoảng một tuổi.'
      ],
      favoriteFood: 'apple',
      favoriteFoodName: 'Thịt Và Táo',
      homeZone: 'sunset_savanna',
      position: config.position || new THREE.Vector3(-40, 0, 30),
      wanderRadius: 6.5,
      walkSpeed: 1.05,
      runSpeed: 3.3,
      runChance: 0.38,
      colliderRadius: 0.36,
      colliderHeight: 0.52,
      bubbleScale: 0.72,
      palette: { skinRoughness: 0.84 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.52,
        knee: 0.5,
        bob: 0.05,
        neck: 0.22,
        head: 0.2,
        tail: 0.18,
        ear: 0.2,
        sleepDrop: -0.18
      }),
      clipOptions: { walkDuration: 0.85, runDuration: 0.48, idleDuration: 6.0 },
      clipMeta: {
        Walk: { strideLength: 0.9, duration: 0.85 },
        Run: { strideLength: 1.6, duration: 0.48 }
      }
    });
  }
}


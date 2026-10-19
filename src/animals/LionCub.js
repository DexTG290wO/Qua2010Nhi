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
  bodyLength: 0.55,
  bodyWidth: 0.24,
  bodyHeight: 0.2,
  legLength: 0.38,
  legRadius: 0.06,
  neckUp: 0.14,
  neckFwd: 0.16,
  headSize: 0.25,
  stance: 0.16,
  earType: 'tufted',
  tailType: 'thin',
  tailSegs: 4,
  tailLength: 0.52,
  tailLift: 0.3,
  muzzle: 'short',
  bellyDrop: 0.08,
  gait: 'walk',
  eyeSpread: 0.38,
  eyeHeight: 0.18,
  eyeForward: 0.68
});

const CFG = {
  bellyRound: 0.24,
  rumpScale: 0.04,
  legClearance: 0.26,
  // A cub reads as young because the head is large relative to the body.
  headLen: 0.98,
  headScale: [1.12, 1.04, 1.0],
  crownRise: 0.32,
  crownDepth: 0.72,
  neckThickness: 0.7,
  cheekMass: 0.4,
  cheekHeight: 0.55,
  browMass: 0.1,
  muzzleLen: 0.24,
  muzzleWidth: 0.68,
  muzzleDrop: 0.2,
  muzzleTipScale: 0.88,
  muzzlePad: 1.2,
  muzzleHeight: 1.05,
  lipDrop: 0.55,
  ear: {
    type: 'tufted',
    size: 0.12,
    spread: 0.45,
    innerWidth: 0.5,
    innerLength: 0.45,
    tipColor: 'earEdge',
    tipAt: 0.84
  },
  mane: { count: 15, radius: 1.08, height: 0.78, back: 0.85, color: 'mane', sharp: 1.8 },
  tail: { type: 'thin', baseScale: 0.26, extend: 0.28, tipTuft: true, tuftScale: 2.7, tipColor: 'tailTip' },
  legScale: 1.0,
  upperLegScale: 1.85,
  midLegScale: 1.2,
  pawWidth: 1.7,
  pawLength: 1.9,
  pawHeight: 0.52,
  toeCount: 4,
  eyeSize: 0.048,
  noseSize: 0.14,
  noseWidth: 1.55,
  whiskerDots: true,
  c: {
    base: 0xdfa94f,
    belly: 0xf6dfb2,
    accent: 0xc88a36,
    mane: 0xb97a2f,
    mask: 0xf9e8c9,
    cheek: 0xf9e8c9,
    sock: 0xe0b76c,
    paw: 0xd9a24f,
    tailTip: 0x53371f,
    innerEar: 0xf2c7a8,
    ear: 0xe6b96a,
    earEdge: 0xb0793a,
    nose: 0x8a5a45,
    eye: 0x33231a,
    throat: 0xf8e3bd,
    lid: 0xe6b96a
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


/**
 * Capybara.js
 * Bác Ba Capybara — broad, elongated body with a low centre of gravity, a
 * large head that flows into the torso, a blocky muzzle, small round ears and
 * short sturdy legs. Semi-aquatic: floats and paddles in the lake.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.88,
  bodyWidth: 0.35,
  bodyHeight: 0.32,
  legLength: 0.33,
  legRadius: 0.075,
  neckUp: 0.1,
  neckFwd: 0.24,
  headSize: 0.28,
  stance: 0.22,
  earType: 'round',
  tailType: 'none',
  muzzle: 'broad',
  bellyDrop: 0.14,
  gait: 'walk',
  eyeSpread: 0.5,
  eyeHeight: 0.22,
  eyeForward: 0.55
});

const CFG = {
  // The barrel body: wide, deep, heavy at the back, sitting low but with
  // clear daylight under the belly so the sturdy little legs stay readable.
  bodyWidthScale: 1.0,
  bellyRound: 0.38,
  rumpScale: 0.08,
  legClearance: 0.3,
  headLen: 1.02,
  headScale: [1.05, 1.0, 1.05],
  crownRise: 0.18,
  crownDepth: 0.55,
  neckThickness: 0.82,
  browMass: 0.04,
  cheekMass: 0.4,
  cheekHeight: 0.52,
  muzzleLen: 0.26,
  muzzleWidth: 0.9,
  muzzleDrop: 0.17,
  muzzleTipScale: 1.0,
  muzzlePad: 1.35,
  muzzleHeight: 1.08,
  muzzleBridgeDrop: 0.01,
  lipDrop: 0.62,
  ear: {
    type: 'round',
    size: 0.085,
    spread: 0.55,
    innerWidth: 0.5,
    innerLength: 0.45
  },
  tail: { type: 'none' },
  legScale: 1.1,
  upperLegScale: 1.6,
  midLegScale: 1.1,
  pawWidth: 1.6,
  pawLength: 2.0,
  pawHeight: 0.5,
  toeCount: 4,
  eyeSize: 0.04,
  noseSize: 0.16,
  noseWidth: 1.5,
  noseHeight: 0.65,
  whiskerDots: true,
  c: {
    base: 0xa9744c,
    belly: 0xd9b083,
    accent: 0x8f5f3c,
    mask: 0xb78255,
    cheek: 0xb78255,
    sock: 0x8b5d3e,
    paw: 0x7b5036,
    innerEar: 0xc99a78,
    nose: 0x3b2a22,
    eye: 0x2f2018,
    ear: 0xa9744c,
    earEdge: 0x8f5f3c,
    throat: 0xcfa77f,
    lid: 0xa9744c
  }
};

export class Capybara extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'capybara',
      name: 'Bác Ba Capybara',
      species: 'Chuột Lang Nước Điềm Tĩnh',
      title: 'Người bạn thư thái nhất hồ',
      description:
        'Bác Ba thích nhất là ngâm mình trong làn nước mát, nhắm mắt lại và nghe tiếng sóng nhỏ. Có bác Ba ở đây, cả hồ nước trở nên bình yên đến lạ.',
      funFacts: [
        'Capybara là loài gặm nhấm lớn nhất thế giới còn sống ngày nay.',
        'Bác Ba có thể nín thở dưới nước tới năm phút.',
        'Bác Ba thích ăn dưa hấu và cỏ non vào mỗi buổi chiều.',
        'Da của capybara khô rất chậm, nên bác thích ở gần nước suốt ngày.'
      ],
      favoriteFood: 'watermelon',
      favoriteFoodName: 'Dưa Hấu Mát',
      homeZone: 'capybara_lake',
      position: config.position || new THREE.Vector3(-19, 0, 13),
      wanderRadius: 9,
      walkSpeed: 0.7,
      runSpeed: 1.6,
      runChance: 0.08,
      canSwim: true,
      floatDepth: 0.10,
      colliderRadius: 0.44,
      colliderHeight: 0.62,
      bubbleScale: 0.85,
      palette: { furRoughness: 0.86 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.42,
        knee: 0.34,
        bob: 0.035,
        sway: 0.05,
        neck: 0.14,
        head: 0.12,
        eatNeck: 0.62,
        sleepDrop: -0.16,
        lift: 0.85
      }),
      clipOptions: { walkDuration: 1.15, runDuration: 0.7, idleDuration: 7.5, extras: ['Swim'] },
      clipMeta: {
        Walk: { strideLength: 0.8, duration: 1.15 },
        Run: { strideLength: 1.12, duration: 0.7 }
      }
    });
  }
}


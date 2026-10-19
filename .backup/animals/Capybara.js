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
  bodyLength: 1.0,
  bodyWidth: 0.34,
  bodyHeight: 0.3,
  legLength: 0.38,
  legRadius: 0.085,
  neckUp: 0.14,
  neckFwd: 0.2,
  headSize: 0.24,
  stance: 0.22,
  earType: 'round',
  tailType: 'none',
  muzzle: 'broad',
  bellyDrop: 0.14,
  gait: 'walk'
});

const CFG = {
  // The barrel body: wide, deep, heavy at the back, sitting low but with
  // clear daylight under the belly so the sturdy little legs stay readable.
  bodyWidthScale: 1.0,
  bellyRound: 0.34,
  rumpScale: 0.06,
  legClearance: 0.3,
  headLen: 1.02,
  headScale: [1.02, 0.96, 1.0],
  neckThickness: 0.55,
  browMass: 0.04,
  cheekMass: 0.3,
  muzzleLen: 0.34,
  muzzleWidth: 0.66,
  muzzleDrop: 0.22,
  muzzleTipScale: 0.92,
  ear: { type: 'round', size: 0.09, spread: 0.6 },
  tail: { type: 'none' },
  legScale: 1.05,
  upperLegScale: 1.5,
  midLegScale: 1.15,
  pawWidth: 1.5,
  pawLength: 1.9,
  eyeSize: 0.042,
  noseSize: 0.2,
  c: {
    base: 0xb07c58,
    belly: 0xd0a884,
    accent: 0x9c6b4a,
    mask: 0xa8744f,
    sock: 0x9c6b4a,
    paw: 0x8d5f42,
    nose: 0x4a3328,
    innerEar: 0xc99a78,
    eye: 0x2f2018
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


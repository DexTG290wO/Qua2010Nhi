/**
 * BabyElephant.js
 * Voi Con Kem — a big rounded torso, a head that flows into the shoulders, a
 * smoothly tapering curling trunk, large shaped ears, four sturdy pillared
 * legs and small tusks.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 1.04,
  bodyWidth: 0.4,
  bodyHeight: 0.42,
  legLength: 0.6,
  legRadius: 0.125,
  neckUp: 0.12,
  neckFwd: 0.08,
  headSize: 0.28,
  stance: 0.245,
  earType: 'none',
  tailType: 'thin',
  muzzle: 'short',
  bellyDrop: 0.14,
  gait: 'walk',
  tailLift: -0.14
});

const D = TEMPLATE.dims;

// Trunk bones chained off the head so the clips can lift and curl the trunk.
const TRUNK_BONES = [
  { name: 'trunk1', parent: 'head', position: [0, -D.headSize * 0.3, D.headSize * 1.05], rotation: [0, 0, 0], tip: [0, -D.headSize * 0.7, D.headSize * 0.16] },
  { name: 'trunk2', parent: 'trunk1', position: [0, -D.headSize * 0.62, D.headSize * 0.18], rotation: [0, 0, 0], tip: [0, -D.headSize * 0.5, D.headSize * 0.3] }
];

// Mirror the trunk into the layout so the sculptor can follow the joints.
TEMPLATE.joints.add('trunk1', 'head', [0, -D.headSize * 0.3, D.headSize * 1.05]);
TEMPLATE.joints.add('trunk2', 'trunk1', [0, -D.headSize * 0.62, D.headSize * 0.18]);

const CFG = {
  bellyRound: 0.26,
  rumpScale: 0.05,
  legClearance: 0.28,
  headLen: 0.9,
  headScale: [1.02, 1.0, 0.96],
  // The head sits close to the shoulders on a baby elephant.
  neckThickness: 1.0,
  cheekMass: 0.16,
  muzzleLen: 0.12,
  muzzleWidth: 0.86,
  muzzleDrop: 0.3,
  muzzleTipScale: 0.95,
  ear: { type: 'big', size: 0.25, spread: 0.7 },
  tail: { type: 'thin', baseScale: 0.22, tipColor: 'dark', extend: 0.1 },
  trunk: { rootScale: 0.5, tipScale: 0.17, extend: 0.7, curl: 0.5 },
  tusks: true,
  legScale: 1.0,
  upperLegScale: 1.35,
  midLegScale: 1.02,
  pawWidth: 1.3,
  pawLength: 1.4,
  eyeSize: 0.045,
  noseSize: 0.2,
  c: {
    base: 0xa9a3bd,
    belly: 0xc6c0d6,
    accent: 0xc9b8d4,
    mask: 0xb5afc7,
    sock: 0x9a94ae,
    paw: 0xb8b2c6,
    tailTip: 0x6f6a80,
    innerEar: 0xd8bcd0,
    nose: 0x8f8aa3,
    eye: 0x2b2434
  }
};

const PROFILE = quadrupedProfile(TEMPLATE, {
  leg: 0.42,
  knee: 0.34,
  bob: 0.05,
  sway: 0.06,
  pitch: 0.07,
  neck: 0.2,
  head: 0.14,
  tail: 0.12,
  ear: 0.3,
  eatNeck: 0.5,
  sleepDrop: -0.2,
  lift: 0.9
});
PROFILE.bones.trunk = ['trunk1', 'trunk2'];

export class BabyElephant extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'elephant',
      name: 'Voi Con Kem',
      species: 'Voi Con Mũm Mĩm',
      title: 'Bé voi thích nghịch nước nhất đồng cỏ',
      description:
        'Kem có đôi tai to như hai chiếc quạt và chiếc vòi luôn tò mò khám phá mọi thứ. Bé thích nhất là được phun nước và ăn những miếng dưa hấu mát lạnh.',
      funFacts: [
        'Vòi voi có hơn 40.000 cơ bắp nhỏ, đủ khéo để nhặt một cọng cỏ.',
        'Voi dùng tai để tản nhiệt và giữ mát cơ thể.',
        'Kem có thể học được hơn 60 hiệu lệnh khác nhau.',
        'Voi con bú mẹ tới hai năm trước khi ăn cỏ như voi lớn.'
      ],
      favoriteFood: 'watermelon',
      favoriteFoodName: 'Dưa Hấu Mát Lạnh',
      homeZone: 'sweet_grassland',
      position: config.position || new THREE.Vector3(28, 0, 20),
      wanderRadius: 7.5,
      walkSpeed: 0.85,
      runSpeed: 2.1,
      runChance: 0.16,
      canSwim: true,
      floatDepth: 0.5,
      colliderRadius: 0.62,
      colliderHeight: 1.1,
      bubbleScale: 1,
      bones: [...TEMPLATE.bones, ...TRUNK_BONES],
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: PROFILE,
      clipOptions: {
        walkDuration: 1.25,
        runDuration: 0.8,
        idleDuration: 6.8,
        extras: ['Spray', 'Swim']
      },
      clipMeta: {
        Walk: { strideLength: 1.06, duration: 1.25 },
        Run: { strideLength: 1.68, duration: 0.8 }
      }
    });
  }
}


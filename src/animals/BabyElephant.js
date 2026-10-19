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
  bodyLength: 1.05,
  bodyWidth: 0.42,
  bodyHeight: 0.43,
  legLength: 0.55,
  legRadius: 0.13,
  neckUp: 0.1,
  neckFwd: 0.12,
  headSize: 0.31,
  stance: 0.255,
  earType: 'big',
  tailType: 'thin',
  tailSegs: 3,
  tailLength: 0.45,
  muzzle: 'short',
  bellyDrop: 0.14,
  gait: 'walk',
  tailLift: -0.1,
  eyeSpread: 0.38,
  eyeHeight: 0.18,
  eyeForward: 0.66
});

const D = TEMPLATE.dims;

// Trunk bones chained off the head so the clips can lift and curl the trunk.
const TRUNK_BONES = [
  { name: 'trunk1', parent: 'head', position: [0, -D.headSize * 0.34, D.headSize * 1.02], rotation: [0, 0, 0], tip: [0, -D.headSize * 0.7, D.headSize * 0.16] },
  { name: 'trunk2', parent: 'trunk1', position: [0, -D.headSize * 0.7, D.headSize * 0.22], rotation: [0, 0, 0], tip: [0, -D.headSize * 0.5, D.headSize * 0.3] }
];

// Mirror the trunk into the layout so the sculptor can follow the joints.
TEMPLATE.joints.add('trunk1', 'head', [0, -D.headSize * 0.34, D.headSize * 1.02]);
TEMPLATE.joints.add('trunk2', 'trunk1', [0, -D.headSize * 0.7, D.headSize * 0.22]);

const CFG = {
  bellyRound: 0.3,
  bodyWidthScale: 1.05,
  rumpScale: 0.08,
  legClearance: 0.26,
  headLen: 0.95,
  headScale: [1.08, 1.0, 0.92],
  crownRise: 0.3,
  crownDepth: 0.6,
  // The head sits close to the shoulders on a baby elephant.
  neckThickness: 1.05,
  cheekMass: 0.3,
  cheekHeight: 0.55,
  muzzleLen: 0.1,
  muzzleWidth: 0.9,
  muzzleDrop: 0.24,
  muzzleTipScale: 1.0,
  muzzlePad: 1.2,
  lipDrop: 0.4,
  ear: {
    type: 'big',
    size: 0.36,
    widthScale: 1.0,
    lengthScale: 0.98,
    cup: 0.25,
    inner: false,
    spread: 0.7
  },
  tail: { type: 'thin', baseScale: 0.16, extend: 0.12, tipTuft: true, tuftScale: 2.6, tipColor: 'dark' },
  trunk: { rootScale: 0.55, tipScale: 0.13, extend: 1.9, curl: 0.1, curlFwd: 0.55, bend: 0.12, wrinkles: true },
  tusks: true,
  legStyle: 'elephant',
  legScale: 1.0,
  upperLegScale: 1.5,
  midLegScale: 1.05,
  footScale: 1.25,
  eyeSize: 0.04,
  noseSize: 0.2,
  c: {
    base: 0x9a95ad,
    belly: 0xb9b3c6,
    accent: 0x8b859e,
    mask: 0xa8a2b8,
    sock: 0x8e879f,
    paw: 0xa39cb2,
    tailTip: 0x5a5468,
    innerEar: 0xd9b8c7,
    nose: 0x6e687e,
    eye: 0x2a2432,
    ear: 0x9a95ad,
    earEdge: 0x878196,
    throat: 0xb5aec2,
    ivory: 0xf3e6cf,
    lid: 0x9a95ad
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


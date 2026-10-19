/**
 * Bunny.js
 * Thỏ Tuyết Mochi — snow-white rabbit, sculpted as one continuous skin:
 * compact body, big fluffy cheeks, very long ears, cotton tail, and strong
 * hind legs with smaller front paws.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { quadrupedTemplate, quadrupedProfile } from '../rig/templates.js';
import { sculptMammal } from '../rig/anatomy.js';

const TEMPLATE = quadrupedTemplate({
  bodyLength: 0.42,
  bodyWidth: 0.2,
  bodyHeight: 0.21,
  legLength: 0.21,
  legRadius: 0.052,
  neckUp: 0.06,
  neckFwd: 0.09,
  headSize: 0.18,
  stance: 0.12,
  earType: 'long',
  tailType: 'puff',
  tailSpec: { len: 0.14, segs: 1 },
  muzzle: 'short',
  bellyDrop: 0.06,
  gait: 'hop',
  eyeSpread: 0.42,
  eyeHeight: 0.18,
  eyeForward: 0.66
});

const CFG = {
  // A round, high-rumped little body, a big cheeky head and ears that are
  // most of the silhouette. The old long barrel read as a cat.
  bellyRound: 0.4,
  rumpScale: 0.045,
  backArch: 0.06,
  legClearance: 0.2,
  cheekMass: 0.18,
  cheekHeight: 0.38,
  headLen: 0.96,
  headScale: [1.05, 1.02, 0.98],
  crownRise: 0.3,
  crownDepth: 0.72,
  neckThickness: 0.62,
  muzzleLen: 0.22,
  muzzleWidth: 0.62,
  muzzleDrop: 0.14,
  muzzlePad: 1.15,
  muzzleTipScale: 0.84,
  ear: {
    type: 'long',
    size: 0.185,
    spread: 0.16,
    widthScale: 0.94,
    innerWidth: 0.62,
    innerLength: 0.46,
    innerAt: 0.36,
    curveBack: 0.08,
    tipColor: 'base'
  },
  tail: { type: 'puff', baseScale: 0.28, tipColor: 'belly' },
  legScaleFront: 0.8,
  legScaleHind: 1.35,
  upperLegScale: 2.15,
  midLegScale: 1.45,
  pawWidth: 1.75,
  pawLength: 2.15,
  pawHeight: 0.55,
  toeCount: 3,
  eyeSize: 0.031,
  noseSize: 0.125,
  noseWidth: 1.25,
  noseHeight: 0.72,
  nostrils: false,
  philtrum: false,
  whiskerDots: false,
  c: {
    base: 0xfff7f3,
    belly: 0xfff1f5,
    accent: 0xffe4ec,
    mask: 0xfff7fa,
    sock: 0xfffaf6,
    paw: 0xffffff,
    tailTip: 0xfffaf7,
    innerEar: 0xffb3cc,
    nose: 0xff9ec0,
    eye: 0x3a2436,
    ear: 0xfff7f3,
    earEdge: 0xffe4ec,
    cheek: 0xfff7fa,
    throat: 0xfff5f7,
    lid: 0xfff7f3
  }
};

export class Bunny extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'bunny',
      name: 'Thỏ Tuyết Mochi',
      species: 'Thỏ Trắng Mộng Mơ',
      title: 'Bé thỏ ngọt ngào nhất vườn hoa',
      description:
        'Mochi rất thích nhảy nhót giữa những luống hoa hồng và nhâm nhi cà rốt giòn ngọt. Tai dài của bé luôn vểnh lên mỗi khi có ai gọi tên.',
      funFacts: [
        'Thỏ có thể nhìn gần như 360 độ nhờ đôi mắt đặt hai bên đầu.',
        'Mochi thích gặm cà rốt vào buổi sáng, khi sương còn đọng trên lá.',
        'Mỗi cú nhảy của Mochi có thể xa gấp ba lần chiều dài thân bé.'
      ],
      favoriteFood: 'carrot',
      favoriteFoodName: 'Cà Rốt Giòn',
      homeZone: 'flower_meadow',
      position: config.position || new THREE.Vector3(21, 0, 15),
      wanderRadius: 5.0,
      walkSpeed: 0.95,
      runSpeed: 2.4,
      runChance: 0.34,
      colliderRadius: 0.3,
      colliderHeight: 0.34,
      bubbleScale: 0.6,
      palette: { skinRoughness: 0.86 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptMammal(TEMPLATE, CFG),
      profile: quadrupedProfile(TEMPLATE, {
        leg: 0.5,
        knee: 0.5,
        ear: 0.3,
        tail: 0.16,
        hopHeight: 0.2,
        sleepDrop: -0.1
      }),
      clipOptions: { walkDuration: 0.5, runDuration: 0.4, idleDuration: 5.2 },
      clipMeta: {
        Walk: { strideLength: 0.46, duration: 0.5 },
        Run: { strideLength: 0.92, duration: 0.4 }
      }
    });
  }
}


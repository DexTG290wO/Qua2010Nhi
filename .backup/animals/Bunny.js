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
  bodyLength: 0.44,
  bodyWidth: 0.21,
  bodyHeight: 0.19,
  legLength: 0.23,
  legRadius: 0.05,
  neckUp: 0.08,
  neckFwd: 0.1,
  headSize: 0.165,
  stance: 0.12,
  earType: 'long',
  tailType: 'puff',
  muzzle: 'short',
  bellyDrop: 0.06,
  gait: 'hop'
});

const CFG = {
  // Chubby, round little body with fluffy cheeks and a proud head.
  bellyRound: 0.36,
  rumpScale: 0.03,
  legClearance: 0.2,
  cheekMass: 0.34,
  headLen: 0.92,
  neckThickness: 0.6,
  muzzleLen: 0.26,
  muzzleWidth: 0.6,
  muzzleDrop: 0.18,
  muzzleTipScale: 0.78,
  ear: { type: 'long', size: 0.17, spread: 0.32 },
  tail: { type: 'puff', baseScale: 0.34 },
  legScaleFront: 0.85,
  legScaleHind: 1.3,
  upperLegScale: 2.0,
  midLegScale: 1.5,
  pawWidth: 1.7,
  pawLength: 2.1,
  eyeSize: 0.042,
  noseSize: 0.13,
  c: {
    base: 0xfff5f0,
    belly: 0xfff0f5,
    accent: 0xffe3ee,
    mask: 0xfff6fa,
    sock: 0xfffaf6,
    paw: 0xffffff,
    tailTip: 0xffffff,
    innerEar: 0xffb3cc,
    nose: 0xff9ec0,
    eye: 0x3a2436
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


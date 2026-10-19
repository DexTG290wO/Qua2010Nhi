/**
 * Flamingo.js
 * Hồng Hạc Hồng — the signature S-curved neck flowing out of the body, long
 * stilt legs, a downward-curving beak and a coherent feathered silhouette.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { birdTemplate, birdProfile } from '../rig/templates.js';
import { sculptBird } from '../rig/anatomy.js';

const TEMPLATE = birdTemplate({
  standHeight: 1.05,
  bodyRadius: 0.21,
  bodyStretch: 1.18,
  neckSegs: 3,
  neckLen: 0.67,
  headSize: 0.115,
  stance: 0.07,
  beak: 'curved',
  wings: true,
  gait: 'stride',
  neckCurve: 0.8,
  legRadius: 0.017,
  footLength: 4.2,
  footWidth: 2.6
});

const CFG = {
  panelSharp: 2.2,
  bodyLength: 1.45,
  eyeSize: 0.03,
  beakLength: 2.2,
  beakWidth: 0.22,
  legThickness: 0.8,
  tailFeathers: true,
  c: {
    base: 0xf7a9c0,
    belly: 0xffdce7,
    accent: 0xef7fa5,
    mask: 0xffe3ec,
    sock: 0xe98aa3,
    paw: 0xe98aa3,
    innerEar: 0xef7fa5,
    beak: 0xf7e3cc,
    nose: 0xe98aa3,
    eye: 0x2a1c22
  }
};

export class Flamingo extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'flamingo',
      name: 'Hồng Hạc Hồng',
      species: 'Hồng Hạc Đầm Sen',
      title: 'Nàng hồng hạc duyên dáng bên đầm sen',
      description:
        'Hồng đứng trên đôi chân dài mảnh như cành sen và soi mình xuống mặt nước mỗi chiều. Nàng đặc biệt thích được vuốt ve và thích tạo dáng chụp ảnh.',
      funFacts: [
        'Màu hồng của hồng hạc đến từ những con tôm nhỏ trong bữa ăn của chúng.',
        'Hồng thường đứng một chân để giữ ấm cho cơ thể.',
        'Hồng hạc ngủ trong tư thế quay đầu ra sau, tựa vào lưng.',
        'Đôi chân dài giúp hồng lội nước mà không bị ướt lông.'
      ],
      favoriteFood: 'fish',
      favoriteFoodName: 'Tôm Cá Nhỏ',
      homeZone: 'lotus_pond',
      position: config.position || new THREE.Vector3(23, 0, -13),
      wanderRadius: 5.5,
      walkSpeed: 0.7,
      runSpeed: 1.7,
      runChance: 0.16,
      wadeDepth: 0.22,
      colliderRadius: 0.34,
      colliderHeight: 0.9,
      bubbleScale: 0.72,
      palette: { skinRoughness: 0.7 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptBird(TEMPLATE, CFG),
      profile: birdProfile(TEMPLATE, {
        leg: 0.6,
        knee: 0.55,
        neck: 0.3,
        head: 0.2,
        sway: 0.08,
        eatNeck: 1.05,
        sleepDrop: -0.12,
        wing: 1.1
      }),
      clipOptions: {
        walkDuration: 1.5,
        runDuration: 0.95,
        idleDuration: 7,
        extras: ['Flap']
      },
      clipMeta: {
        Walk: { strideLength: 0.7, duration: 1.5 },
        Run: { strideLength: 0.9, duration: 0.95 }
      }
    });
  }
}


/**
 * Penguin.js
 * Cánh Cụt Bông — one smooth egg-shaped body that flows into the head, a pale
 * belly panel, flippers set into the sides, stout orange feet and a stubby beak.
 */

import * as THREE from 'three';
import { RiggedAnimal } from './RiggedAnimal.js';
import { birdTemplate, birdProfile } from '../rig/templates.js';
import { sculptBird } from '../rig/anatomy.js';

const TEMPLATE = birdTemplate({
  standHeight: 0.42,
  bodyRadius: 0.215,
  bodyStretch: 1.42,
  neckSegs: 1,
  neckLen: 0.15,
  headSize: 0.145,
  stance: 0.1,
  beak: 'stubby',
  wings: true,
  gait: 'waddle'
});

const CFG = {
  panelSharp: 3.0,
  bodyLength: 1.02,
  eyeSize: 0.04,
  c: {
    base: 0x323a58,
    belly: 0xfffaf6,
    accent: 0x4a5478,
    mask: 0xfffaf6,
    sock: 0xff9f43,
    paw: 0xff9f43,
    innerEar: 0xff9f43,
    nose: 0xff9f43,
    beak: 0xff9f43,
    eye: 0x1a1f30
  }
};

export class Penguin extends RiggedAnimal {
  constructor(scene, config = {}) {
    super(scene, {
      id: 'penguin',
      name: 'Cánh Cụt Bông',
      species: 'Chim Cánh Cụt Hoàng Đế Nhỏ',
      title: 'Quý ông lịch lãm của đảo băng',
      description:
        'Bông bước đi lạch bạch nhưng bơi thì nhanh như một mũi tên. Chú thích trượt trên băng và luôn là người đầu tiên chào khách bằng cái gật đầu lễ phép.',
      funFacts: [
        'Chim cánh cụt có thể bơi nhanh tới 35 km mỗi giờ.',
        'Bộ lông của Bông không thấm nước và giữ ấm tới âm 40 độ.',
        'Chim cánh cụt dành hơn một nửa cuộc đời dưới nước.',
        'Bông thích ăn cá bạc tươi vào mỗi buổi sáng.'
      ],
      favoriteFood: 'fish',
      favoriteFoodName: 'Cá Bạc Tươi',
      homeZone: 'crystal_ice',
      position: config.position || new THREE.Vector3(-32, 0.8, -38),
      wanderRadius: 7,
      walkSpeed: 0.62,
      runSpeed: 1.5,
      runChance: 0.2,
      canSwim: true,
      floatDepth: 0.3,
      colliderRadius: 0.3,
      colliderHeight: 0.52,
      bubbleScale: 0.62,
      palette: { skinRoughness: 0.72 },
      bones: TEMPLATE.bones,
      sculpt: () => sculptBird(TEMPLATE, CFG),
      profile: birdProfile(TEMPLATE, {
        sway: 0.16,
        leg: 0.55,
        neck: 0.22,
        head: 0.18,
        wing: 0.8,
        sleepDrop: -0.1
      }),
      clipOptions: {
        walkDuration: 0.72,
        runDuration: 0.44,
        idleDuration: 5.4,
        extras: ['Flap', 'Swim']
      },
      clipMeta: {
        Walk: { strideLength: 0.42, duration: 0.72 },
        Run: { strideLength: 0.6, duration: 0.44 }
      }
    });
  }
}


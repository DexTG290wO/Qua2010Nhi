/**
 * ProgressManager.js
 * Tracks everything Nhi has discovered: visited habitats, per-animal
 * friendship, interaction counters, photos and unlockable achievements.
 * Persisted in localStorage so the world remembers her.
 */

const ANIMALS = ['bunny', 'capybara', 'otter', 'fox', 'deer', 'red_panda', 'penguin', 'flamingo', 'elephant', 'lion_cub'];

const ACHIEVEMENTS = [
  { id: 'first_steps', title: 'Những bước chân đầu tiên', desc: 'Ghé thăm 3 khu vực trong sở thú.', test: (d) => d.visitedZones.length >= 3 },
  { id: 'first_friend', title: 'Người bạn đầu tiên', desc: 'Làm quen với một bé động vật.', test: (d) => Object.keys(d.befriendedAnimals).length >= 1 },
  { id: 'zoo_explorer', title: 'Nhà thám hiểm nhí', desc: 'Khám phá tất cả 10 khu vực.', test: (d) => d.visitedZones.length >= 10 },
  { id: 'beloved', title: 'Trái tim ấm áp', desc: 'Kết thân với 5 bé động vật.', test: (d) => Object.keys(d.befriendedAnimals).length >= 5 },
  { id: 'best_friends', title: 'Bạn thân nhất', desc: 'Đạt mức thân thiết 100% với một bé.', test: (d) => Object.values(d.befriendedAnimals).some((a) => a.friendship >= 100) },
  { id: 'feast', title: 'Bữa tiệc ngọt ngào', desc: 'Cho các bé ăn 5 lần.', test: (d) => d.totalFeeds >= 5 },
  { id: 'gentle_hands', title: 'Bàn tay dịu dàng', desc: 'Vuốt ve các bé 10 lần.', test: (d) => d.totalPets >= 10 },
  { id: 'photographer', title: 'Nhiếp ảnh gia của sở thú', desc: 'Chụp 3 tấm ảnh kỉ niệm.', test: (d) => d.photoCount >= 3 },
  { id: 'playful', title: 'Cùng chơi nào!', desc: 'Chơi đùa cùng các bé 5 lần.', test: (d) => d.totalPlays >= 5 },
  { id: 'secret_garden', title: 'Khu vườn bí mật', desc: 'Mở chiếc hộp quà dành riêng cho Nhi.', test: (d) => d.hasUnlockedSecretGarden }
];

const ZONE_NAMES = {
  entrance: 'Cổng Chào',
  plaza: 'Quảng Trường Trung Tâm',
  flower_meadow: 'Vườn Hoa & Đồng Cỏ Thỏ',
  sweet_grassland: 'Đồng Cỏ Voi Con',
  sunset_savanna: 'Thảo Nguyên Hoàng Hôn',
  capybara_lake: 'Hồ Capybara',
  fairytale_forest: 'Rừng Cổ Tích',
  crystal_ice: 'Đảo Băng Chim Cánh Cụt',
  lotus_pond: 'Đầm Sen Hồng Hạc',
  secret_garden: 'Vườn Bí Mật Của Nhi'
};

export class ProgressManager {
  constructor() {
    this.storageKey = 'nhis_dream_zoo_progress_v1';
    this.data = this.defaults();
    this.onProgressChange = null;
    this.onSpecialUnlock = null;
    this.load();
  }

  defaults() {
    return {
      visitedZones: ['entrance'],
      befriendedAnimals: {},
      totalPets: 0,
      totalFeeds: 0,
      totalPlays: 0,
      hasUnlockedSecretGarden: false,
      photoCount: 0,
      achievements: {},
      firstVisit: new Date().toISOString()
    };
  }

  load() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.data = { ...this.defaults(), ...parsed };
        if (!Array.isArray(this.data.visitedZones) || !this.data.visitedZones.length) {
          this.data.visitedZones = ['entrance'];
        }
      }
    } catch (err) {
      console.warn('LocalStorage not available, keeping progress in memory', err);
    }
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (err) {
      /* private mode / quota - progress simply stays in memory */
    }
    if (this.onProgressChange) this.onProgressChange(this.data);
  }

  // --- exploration --------------------------------------------------------
  recordZoneVisit(zoneId) {
    if (!zoneId) return false;
    if (this.data.visitedZones.includes(zoneId)) return false;
    this.data.visitedZones.push(zoneId);
    this.save();
    this.checkAchievements();
    return true;
  }

  // --- friendship ---------------------------------------------------------
  _ensure(animalId) {
    if (!this.data.befriendedAnimals[animalId]) {
      this.data.befriendedAnimals[animalId] = {
        friendship: 0,
        petCount: 0,
        feedCount: 0,
        playCount: 0,
        firstMet: new Date().toLocaleDateString('vi-VN')
      };
    }
    return this.data.befriendedAnimals[animalId];
  }

  getFriendship(animalId) {
    return this.data.befriendedAnimals[animalId]?.friendship || 0;
  }

  getAnimalStats(animalId) {
    return this.data.befriendedAnimals[animalId] || null;
  }

  /**
   * Adds friendship, returning true when a new milestone tier is reached so
   * the UI can celebrate exactly once per tier.
   */
  addFriendship(animalId, amount = 10) {
    const entry = this._ensure(animalId);
    const before = entry.friendship;
    entry.friendship = Math.min(100, before + amount);
    this.save();
    this.checkAchievements();
    const tiers = [25, 50, 75, 100];
    return tiers.some((t) => before < t && entry.friendship >= t);
  }

  recordPet(animalId) {
    const entry = this._ensure(animalId);
    this.data.totalPets++;
    entry.petCount++;
    return this.addFriendship(animalId, entry.petCount === 1 ? 25 : 12);
  }

  recordFeed(animalId) {
    const entry = this._ensure(animalId);
    this.data.totalFeeds++;
    entry.feedCount++;
    return this.addFriendship(animalId, entry.feedCount === 1 ? 30 : 20);
  }

  recordPlay(animalId) {
    const entry = this._ensure(animalId);
    this.data.totalPlays++;
    entry.playCount++;
    return this.addFriendship(animalId, entry.playCount === 1 ? 22 : 16);
  }

  recordPhoto() {
    this.data.photoCount++;
    this.save();
    this.checkAchievements();
  }

  unlockSecretGarden() {
    if (this.data.hasUnlockedSecretGarden) return false;
    this.data.hasUnlockedSecretGarden = true;
    this.save();
    this.checkAchievements();
    return true;
  }

  // --- achievements -------------------------------------------------------
  checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id]) continue;
      let unlocked = false;
      try {
        unlocked = !!a.test(this.data);
      } catch (err) {
        unlocked = false;
      }
      if (unlocked) {
        this.data.achievements[a.id] = new Date().toISOString();
        this.save();
        if (this.onSpecialUnlock) this.onSpecialUnlock(a);
      }
    }
  }

  getAchievements() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: !!this.data.achievements[a.id],
      unlockedAt: this.data.achievements[a.id] || null
    }));
  }

  // --- summaries ----------------------------------------------------------
  getStats() {
    const totalKnownAnimals = ANIMALS.length;
    const befriendedCount = Object.keys(this.data.befriendedAnimals).length;
    const bestFriendship = Math.max(0, ...Object.values(this.data.befriendedAnimals).map((a) => a.friendship));
    return {
      visitedZonesCount: this.data.visitedZones.length,
      totalZones: Object.keys(ZONE_NAMES).length,
      visitedZones: this.data.visitedZones.slice(),
      befriendedCount,
      totalKnownAnimals,
      percentage: Math.round((befriendedCount / totalKnownAnimals) * 100),
      bestFriendship,
      hasUnlockedSecretGarden: this.data.hasUnlockedSecretGarden,
      totalPets: this.data.totalPets,
      totalFeeds: this.data.totalFeeds,
      totalPlays: this.data.totalPlays,
      photoCount: this.data.photoCount,
      unlockedAchievements: Object.keys(this.data.achievements).length,
      totalAchievements: ACHIEVEMENTS.length
    };
  }

  zoneName(zoneId) {
    return ZONE_NAMES[zoneId] || zoneId;
  }

  reset() {
    this.data = this.defaults();
    this.save();
  }
}

export { ACHIEVEMENTS, ZONE_NAMES, ANIMALS };

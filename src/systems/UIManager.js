/**
 * UIManager.js
 * Owns every piece of interface: the intro screen, the HUD (brand, time of
 * day, habitat dock, hints), the animal card with its friendship meter and
 * interactions, the food drawer, the diary with achievements, the letter, the
 * help sheet, photo mode and toasts.
 *
 * The 3D world drives this class; this class never drives the world directly
 * beyond calling into the interaction system.
 */

const FOOD_NAMES = {
  carrot: 'Cà rốt',
  apple: 'Táo đỏ',
  bamboo: 'Trúc non',
  fish: 'Cá bạc',
  watermelon: 'Dưa hấu',
  orange: 'Cam ngọt'
};

const STAR_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8z"/></svg>';

export class UIManager {
  constructor(app) {
    this.app = app;
    const $ = (id) => document.getElementById(id);

    // --- intro ------------------------------------------------------------
    this.intro = $('intro-screen');
    this.btnStart = $('btn-start-journey');
    this.btnSkip = $('btn-skip-intro');
    this.btnIntroSound = $('btn-intro-sound');
    this.introSoundLabel = $('intro-sound-label');

    // --- hud --------------------------------------------------------------
    this.hud = $('game-hud');
    this.brandZone = $('brand-zone');
    this.zoneDock = $('zone-dock');
    this.hintBar = $('hint-bar');
    this.btnExitFocus = $('btn-exit-focus');

    // --- animal card ------------------------------------------------------
    this.card = $('animal-card');
    this.cardAvatar = $('card-avatar');
    this.cardName = $('card-name');
    this.cardSpecies = $('card-species');
    this.cardTitle = $('card-title');
    this.cardDesc = $('card-desc');
    this.cardFacts = $('card-facts');
    this.cardStats = $('card-stats');
    this.friendshipVal = $('friendship-val');
    this.friendshipBar = $('friendship-bar');
    this.btnPet = $('btn-card-pet');
    this.btnFeed = $('btn-card-feed');
    this.btnPlay = $('btn-card-play');
    this.btnCardClose = $('btn-card-close');
    this.foodDrawer = $('food-drawer');

    // --- modals -----------------------------------------------------------
    this.diary = $('diary-modal');
    this.diaryStats = $('diary-stats');
    this.achievementGrid = $('achievement-grid');
    this.letter = $('letter-modal');
    this.help = $('help-modal');

    // --- photo ------------------------------------------------------------
    this.photoOverlay = $('photo-overlay');

    // --- sound ------------------------------------------------------------
    this.btnSound = $('btn-sound-toggle');

    this.toastStack = $('toast-stack');

    this.audioOn = true;
    this.bindEvents();
    this.bindProgress();
  }

  // ======================================================================
  //  WIRING
  // ======================================================================
  bindEvents() {
    // --- intro ------------------------------------------------------------
    this.btnStart.addEventListener('click', () => this.beginJourney(false));
    this.btnSkip.addEventListener('click', () => this.beginJourney(true));
    this.btnIntroSound.addEventListener('click', () => this.toggleSound(true));

    // --- camera / selection ----------------------------------------------
    this.btnCardClose.addEventListener('click', () => this.app.interactions.deselect());
    this.btnExitFocus.addEventListener('click', () => this.app.interactions.deselect());

    // --- interactions -----------------------------------------------------
    this.btnPet.addEventListener('click', () => {
      this.app.interactions.petCurrentAnimal();
    });
    this.btnFeed.addEventListener('click', () => this.toggleFoodDrawer());
    this.btnPlay.addEventListener('click', () => {
      this.app.interactions.playWithCurrentAnimal();
    });

    // Distance a food chip is dragged before it counts as a drag, not a tap.
    document.querySelectorAll('.food-item-btn').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.detail === 0) return;
        // A plain click still feeds the selected animal (fast path).
        if (this.app.interactions.dragFood) return;
        this.app.interactions.feedCurrentAnimal(chip.dataset.food);
      });
    });

    // --- time of day ------------------------------------------------------
    document.querySelectorAll('.time-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.setTimeOfDay(btn.dataset.time));
    });

    // --- habitat dock -----------------------------------------------------
    document.querySelectorAll('.zone-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.hideAnimalCard();
        this.app.teleportToZone(chip.dataset.zone);
        this.app.audio.playClick();
      });
    });

    // --- top actions ------------------------------------------------------
    this.btnSound.addEventListener('click', () => this.toggleSound());
    document.getElementById('btn-photo-mode').addEventListener('click', () => this.enterPhotoMode());
    document.getElementById('btn-open-diary').addEventListener('click', () => this.openDiary());
    document.getElementById('btn-help').addEventListener('click', () => this.openModal(this.help));

    // --- photo ------------------------------------------------------------
    document.getElementById('btn-take-snap').addEventListener('click', () => this.takeSnapshot());
    document.getElementById('btn-exit-photo').addEventListener('click', () => this.exitPhotoMode());

    // --- diary ------------------------------------------------------------
    document.getElementById('btn-reset-progress').addEventListener('click', () => {
      if (window.confirm('Bắt đầu lại hành trình từ đầu? Mọi kỷ niệm đã lưu sẽ được đặt lại.')) {
        this.app.progress.reset();
        this.updateDiaryContent();
        this.showToast('Hành trình mới đã sẵn sàng.');
      }
    });

    // --- generic modal closing -------------------------------------------
    document.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => this.closeModal(document.getElementById(el.dataset.close)));
    });
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('pointerdown', (e) => {
        if (e.target === modal) this.closeModal(modal);
      });
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.modal.is-open');
      if (open) this.closeModal(open);
      else if (this.app.interactions.selectedAnimal) this.app.interactions.deselect();
    });

    // --- food drawer drag hint -------------------------------------------
    this.foodDrawer.addEventListener('pointerleave', () => {
      if (!this.app.interactions.dragFood) return;
    });
  }

  bindProgress() {
    const progress = this.app.progress;
    progress.onSpecialUnlock = (achievement) => {
      this.showToast(`Thành tích mới: ${achievement.title}`, { gold: true, duration: 5200 });
      this.app.audio.playCelebrate();
    };
  }

  // ======================================================================
  //  INTRO / HUD
  // ======================================================================
  revealIntro() {
    document.body.classList.remove('booting');
    this.intro.classList.add('is-shown');
  }

  beginJourney(skip) {
    this.intro.classList.add('is-gone');
    document.body.classList.remove('booting');
    document.body.classList.add('exploring');
    this.app.audio.startBGM();

    if (skip) this.app.director.skip();
    else this.app.director.start();
  }

  enableExploreHUD() {
    this.hud.classList.add('is-ready');
    this.hud.setAttribute('aria-hidden', 'false');
    this.setActiveZone(this.app.currentZone || 'entrance');
  }

  setActiveZone(zoneId) {
    document.querySelectorAll('.zone-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.zone === zoneId);
    });
    if (this.brandZone) {
      this.brandZone.textContent = this.app.progress.zoneName(zoneId) || 'Sẵn sàng';
    }
  }

  setTimeOfDay(mode) {
    document.querySelectorAll('.time-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.time === mode);
    });
    this.app.sceneManager.setTimeOfDay(mode);
    this.app.sky.setTimePreset(mode);
    this.app.audio.currentMode = mode;
    this.app.audio.playClick();
    const labels = { dawn: 'Bình minh', day: 'Ban ngày', sunset: 'Hoàng hôn', night: 'Đêm sao' };
    this.showToast(`Đã chuyển sang ${labels[mode].toLowerCase()}.`, { duration: 2200 });
  }

  toggleSound(fromIntro = false) {
    const muted = this.app.audio.toggleMute();
    this.audioOn = !muted;

    this.btnSound.classList.toggle('is-on', this.audioOn);
    this.btnSound.classList.toggle('is-muted', !this.audioOn);
    this.btnSound.title = this.audioOn ? 'Tắt âm thanh' : 'Bật âm thanh';

    if (this.btnIntroSound) {
      this.btnIntroSound.classList.toggle('is-on', this.audioOn);
      this.btnIntroSound.setAttribute('aria-pressed', String(this.audioOn));
      if (this.introSoundLabel) {
        this.introSoundLabel.textContent = this.audioOn ? 'Nhạc đang bật' : 'Bật nhạc';
      }
    }

    if (this.audioOn) {
      // A user gesture always precedes this, so the browser allows playback.
      this.app.audio.startBGM();
      if (!fromIntro) this.showToast('Âm thanh đã bật.', { duration: 2000 });
    } else if (!fromIntro) {
      this.showToast('Đã tắt âm thanh.', { duration: 2000 });
    }
  }

  // ======================================================================
  //  ANIMAL CARD
  // ======================================================================
  showAnimalCard(animal) {
    if (!animal) return this.hideAnimalCard();
    const progress = this.app.progress;

    this.cardName.textContent = animal.name;
    this.cardSpecies.textContent = animal.species;
    this.cardTitle.textContent = animal.title || '';
    this.cardDesc.textContent = animal.description;

    this.cardFacts.innerHTML = '';
    (animal.funFacts || []).forEach((fact) => {
      const li = document.createElement('li');
      li.textContent = fact;
      this.cardFacts.appendChild(li);
    });

    this.card.classList.add('is-open');
    this.card.setAttribute('aria-hidden', 'false');
    this.hud.classList.add('is-focused');
    this.btnExitFocus.classList.remove('is-hidden');
    this.refreshAnimalCard();
  }

  refreshAnimalCard() {
    const animal = this.app.interactions.selectedAnimal;
    if (!animal) return;
    const progress = this.app.progress;
    const score = progress.getFriendship(animal.id);
    const stats = progress.getAnimalStats(animal.id);

    this.friendshipVal.textContent = `${score}%`;
    this.friendshipBar.style.width = `${score}%`;

    const parts = [];
    if (stats) {
      parts.push(`Vuốt ve ${stats.petCount || 0} lần`);
      parts.push(`Cho ăn ${stats.feedCount || 0} lần`);
      parts.push(`Chơi cùng ${stats.playCount || 0} lần`);
      parts.push(`Gặp lần đầu ${stats.firstMet}`);
    } else {
      parts.push('Chị và bé chưa có dịp làm quen.');
    }
    parts.push(`Món yêu thích: ${animal.favoriteFoodName}`);
    this.cardStats.textContent = parts.join(' • ');

    // Highlight the favourite food so feeding feels personal.
    document.querySelectorAll('.food-item-btn').forEach((chip) => {
      chip.classList.toggle('is-favourite', chip.dataset.food === animal.favoriteFood);
    });
    const favLabel = FOOD_NAMES[animal.favoriteFood] || '';
    const hint = this.foodDrawer.querySelector('.food-hint');
    if (hint) {
      hint.textContent = `Kéo món ăn tới bé, hoặc chạm để mời bé. ${animal.name} thích nhất là ${animal.favoriteFoodName || favLabel}.`;
    }
  }

  hideAnimalCard() {
    this.card.classList.remove('is-open');
    this.card.setAttribute('aria-hidden', 'true');
    this.hud.classList.remove('is-focused');
    this.btnExitFocus.classList.add('is-hidden');
    this.foodDrawer.classList.remove('is-open');
    this.foodDrawer.setAttribute('aria-hidden', 'true');
  }

  toggleFoodDrawer() {
    const open = this.foodDrawer.classList.toggle('is-open');
    this.foodDrawer.setAttribute('aria-hidden', String(!open));
    if (open) this.refreshAnimalCard();
  }

  hideFoodDrawer() {
    this.foodDrawer.classList.remove('is-open');
    this.foodDrawer.setAttribute('aria-hidden', 'true');
  }

  // ======================================================================
  //  DIARY
  // ======================================================================
  openDiary() {
    this.hideAnimalCard();
    this.updateDiaryContent();
    this.openModal(this.diary);
  }

  updateDiaryContent() {
    const stats = this.app.progress.getStats();
    const tiles = [
      { value: `${stats.befriendedCount}/${stats.totalKnownAnimals}`, label: 'Bạn động vật' },
      { value: `${stats.visitedZonesCount}/${stats.totalZones}`, label: 'Khu vực' },
      { value: stats.totalPets, label: 'Lần vuốt ve' },
      { value: stats.totalFeeds, label: 'Lần cho ăn' },
      { value: stats.totalPlays, label: 'Lần chơi đùa' },
      { value: stats.photoCount, label: 'Ảnh kỉ niệm' },
      { value: `${stats.bestFriendship}%`, label: 'Thân thiết nhất' },
      { value: `${stats.unlockedAchievements}/${stats.totalAchievements}`, label: 'Thành tích' }
    ];

    this.diaryStats.innerHTML = `
      <div class="stat-grid">
        ${tiles.map((t) => `<div class="stat-tile"><strong>${t.value}</strong><span>${t.label}</span></div>`).join('')}
      </div>
      <div class="progress-block">
        <div class="meter-row">
          <span>Hành trình khám phá</span>
          <strong>${stats.percentage}%</strong>
        </div>
        <div class="meter-track"><div class="meter-fill" style="width:${stats.percentage}%"></div></div>
        <div class="zone-list">
          ${this.zoneList(stats.visitedZones)}
        </div>
      </div>
    `;

    const achievements = this.app.progress.getAchievements();
    this.achievementGrid.innerHTML = achievements
      .map(
        (a) => `
      <div class="achievement ${a.unlocked ? 'is-unlocked' : ''}">
        <div class="achievement-badge">${STAR_ICON}</div>
        <div>
          <h4>${a.title}</h4>
          <p>${a.desc}</p>
        </div>
      </div>`
      )
      .join('');
  }

  zoneList(visited) {
    const all = [
      'entrance', 'plaza', 'flower_meadow', 'sweet_grassland', 'sunset_savanna',
      'capybara_lake', 'fairytale_forest', 'crystal_ice', 'lotus_pond', 'secret_garden'
    ];
    return all
      .map((id) => {
        const isVisited = visited.includes(id);
        return `<span class="zone-pill ${isVisited ? 'is-visited' : ''}">${this.app.progress.zoneName(id)}</span>`;
      })
      .join('');
  }

  showLetterModal() {
    this.hideAnimalCard();
    this.openModal(this.letter);
    this.updateDiaryContent();
  }

  showWelcomeGreeting() {
    this.showToast('Chào mừng chị Nhi đến với thế giới nhỏ của riêng chị!', {
      duration: 5200,
      gold: true
    });
  }

  onZoneEntered(zoneId) {
    this.setActiveZone(zoneId);
  }

  // ======================================================================
  //  MODALS
  // ======================================================================
  openModal(el) {
    if (!el) return;
    el.classList.add('is-open');
    this.app.audio.playClick();
  }

  closeModal(el) {
    if (!el) return;
    el.classList.remove('is-open');
  }

  // ======================================================================
  //  PHOTO MODE
  // ======================================================================
  enterPhotoMode() {
    this.hideAnimalCard();
    this.photoOverlay.classList.add('is-open');
    this.photoOverlay.setAttribute('aria-hidden', 'false');
    this.hud.classList.add('is-hidden');
    this.app.audio.playClick();
  }

  exitPhotoMode() {
    this.photoOverlay.classList.remove('is-open');
    this.photoOverlay.setAttribute('aria-hidden', 'true');
    this.hud.classList.remove('is-hidden');
    this.app.audio.playClick();
  }

  takeSnapshot() {
    const app = this.app;
    app.audio.playCamera();

    // Render one crisp frame at full resolution before reading the buffer.
    const renderer = app.sceneManager.renderer;
    const previousRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 2, 3));
    renderer.render(app.sceneManager.scene, app.sceneManager.camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(previousRatio);

    app.progress.recordPhoto();
    this.showToast(`Đã lưu ảnh kỉ niệm số ${app.progress.getStats().photoCount}.`, { duration: 2600 });

    const link = document.createElement('a');
    link.download = `Nhis_Dream_Zoo_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    link.href = dataURL;
    link.click();
  }

  // ======================================================================
  //  TOASTS
  // ======================================================================
  showToast(message, { duration = 3600, gold = false } = {}) {
    if (!this.toastStack) return;
    const toast = document.createElement('div');
    toast.className = `toast${gold ? ' gold' : ''}`;
    toast.textContent = message;
    this.toastStack.appendChild(toast);

    // Keep the stack short so it never clutters the view.
    while (this.toastStack.children.length > 3) {
      this.toastStack.removeChild(this.toastStack.firstChild);
    }

    setTimeout(() => {
      toast.classList.add('is-out');
      setTimeout(() => toast.remove(), 500);
    }, duration);
  }
}

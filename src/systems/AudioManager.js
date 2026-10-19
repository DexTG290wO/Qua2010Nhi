/**
 * AudioManager.js
 * High-quality procedural Web Audio API sound generator.
 * Provides calming pastel fantasy BGM, ambient nature soundscapes,
 * and charming reactive sound effects without relying on external MP3s.
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.ambientGain = null;

    this.isMuted = false;
    this.bgmVolume = 0.45;
    this.sfxVolume = 0.7;
    this.ambientVolume = 0.25;

    this.isPlayingBGM = false;
    this.bgmTimer = null;
    this.ambientTimer = null;
    this.currentMode = 'day'; // day, sunset, night, dawn

    this.notes = {
      C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
      C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
      C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
    };

    // Melodic dreamy chord sequences (Nhi's Dream Theme)
    this.melodyPatterns = [
      ['C5', 'E5', 'G5', 'C6', 'B5', 'G5', 'E5'],
      ['A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5'],
      ['F4', 'A4', 'C5', 'F5', 'E5', 'C5', 'A4'],
      ['G4', 'B4', 'D5', 'G5', 'F5', 'D5', 'B4'],
      ['E4', 'G4', 'B4', 'E5', 'D5', 'B4', 'G4'],
      ['F4', 'A4', 'C5', 'G5', 'F5', 'E5', 'D5']
    ];
    this.patternIndex = 0;
    this.noteIndex = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.ctx.currentTime);
    this.ambientGain.connect(this.masterGain);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  startBGM() {
    this.init();
    this.resume();
    if (this.isPlayingBGM) return;
    this.isPlayingBGM = true;
    this.scheduleNextNote();
    this.startAmbient();
  }

  stopBGM() {
    this.isPlayingBGM = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
  }

  setVolume(val) {
    if (!this.masterGain) return;
    const v = Math.max(0, Math.min(1, val));
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : v, this.ctx.currentTime);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  scheduleNextNote() {
    if (!this.isPlayingBGM || !this.ctx) return;

    const currentPattern = this.melodyPatterns[this.patternIndex];
    const noteName = currentPattern[this.noteIndex];
    const freq = this.notes[noteName] || 440;

    // Play a gentle music box / celesta tone
    this.playMusicBoxTone(freq, 0.9);

    // Occasionally add a soft bass root
    if (this.noteIndex === 0) {
      const rootNote = currentPattern[0];
      const rootFreq = (this.notes[rootNote] || 440) / 2;
      this.playSoftPad(rootFreq, 2.5);
    }

    this.noteIndex++;
    if (this.noteIndex >= currentPattern.length) {
      this.noteIndex = 0;
      this.patternIndex = (this.patternIndex + 1) % this.melodyPatterns.length;
    }

    const interval = 480 + Math.sin(this.noteIndex) * 40;
    this.bgmTimer = setTimeout(() => this.scheduleNextNote(), interval);
  }

  playMusicBoxTone(freq, duration = 0.8) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // subtle shimmer harmonic
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, t);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.15, t);
    osc2.connect(toneGain);
    toneGain.connect(gain);
    osc.connect(gain);

    gain.connect(this.bgmGain);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + duration);
    osc2.stop(t + duration);
  }

  playSoftPad(freq, duration = 2.0) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  startAmbient() {
    if (!this.ctx) return;
    const playRandomAmbient = () => {
      if (!this.isPlayingBGM) return;

      if (this.currentMode === 'night') {
        // Night cricket / gentle bell
        this.playChirp(1200 + Math.random() * 400, 0.08);
      } else {
        // Daytime / Sunset gentle bird chirp
        if (Math.random() < 0.6) {
          this.playBirdSong();
        }
      }

      this.ambientTimer = setTimeout(playRandomAmbient, 3000 + Math.random() * 4500);
    };

    this.ambientTimer = setTimeout(playRandomAmbient, 2000);
  }

  playBirdSong() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const base = 1800 + Math.random() * 600;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.15);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ambientGain);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  playChirp(freq, dur) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);
    gain.connect(this.ambientGain);

    osc.start(t);
    osc.stop(t + dur);
  }

  // === SFX METHODS ===

  playIntroChime() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'sine', 0.8, 0.25);
      }, idx * 120);
    });
  }

  playGateOpen() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Harmonic celestial sweep
    const chords = [392.00, 493.88, 587.33, 783.99, 987.77];
    chords.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 'sine', 1.8, 0.2);
      }, i * 80);
    });
  }

  playPet() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    // Cheerful, sparkling heart trill
    const pitches = [659.25, 783.99, 987.77, 1318.51];
    pitches.forEach((p, i) => {
      setTimeout(() => {
        this.playTone(p, 'sine', 0.35, 0.3);
      }, i * 65);
    });
  }

  playFeed() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Munch sound + sparkle
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);

    setTimeout(() => {
      this.playTone(880, 'sine', 0.4, 0.2);
      this.playTone(1174.66, 'sine', 0.45, 0.22);
    }, 120);
  }

  playPlay() {    this.init();
    this.resume();
    if (!this.ctx) return;
    // Springy happy bounce
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.18);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  /** Playful water splash, used when the baby elephant sprays. */
  playSplash() {
    this.init();
    this.resume();
    if (!this.ctx || this.isMuted) return;
    const base = 520 + Math.random() * 260;
    const drops = [1, 1.24, 1.5, 1.86, 2.2];
    drops.forEach((mult, i) => {
      setTimeout(() => {
        this.playTone(base * mult, 'sine', 0.22, 0.14);
        this.playTone(base * mult * 2.01, 'triangle', 0.12, 0.06);
      }, i * 55);
    });
  }

  playCamera() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Crisp shutter click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  playCelebrate() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    // Fanfare bells
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    notes.forEach((f, idx) => {
      setTimeout(() => {
        this.playTone(f, 'sine', 1.2, 0.25);
      }, idx * 90);
    });
  }

  playClick() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    this.playTone(600, 'sine', 0.05, 0.1);
  }

  playTone(freq, type = 'sine', duration = 0.3, volume = 0.3) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + duration);
  }
}

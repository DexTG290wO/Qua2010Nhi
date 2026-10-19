/**
 * LoadingScreen.js
 * Self-contained pastel loading overlay for Nhi's Dream Zoo.
 * Builds its own DOM and imports its own stylesheet, so index.html never changes.
 *
 * Usage:
 *   import { LoadingScreen } from './core/LoadingScreen.js';
 *
 *   const screen = new LoadingScreen();              // visible immediately
 *   screen.setStatus('Đang dựng khu vườn cổ tích...');
 *   screen.setProgress(0.42, 'bunny.glb');           // fraction 0..1
 *   screen.hide();                                   // fades out, then removes itself
 *   screen.showError('WebGL unavailable');           // friendly Vietnamese card
 */

import '../styles/loading.css';

const DEFAULT_STATUS = 'Đang kết nối đến khu vườn cổ tích...';

// Generic AssetLoader tokens get friendly Vietnamese copy; file names pass through.
const TOKEN_COPY = {
  start: 'Đang chuẩn bị...',
  loading: 'Đang tải...',
  ready: 'Sẵn sàng'
};

// Hand-tuned drifting light motes. The motion itself lives entirely in CSS.
const MOTES = [
  { x: '6%', size: 9, delay: 0, dur: 17, drift: 36, opacity: 0.55 },
  { x: '17%', size: 6, delay: 2.4, dur: 21, drift: -22, opacity: 0.4 },
  { x: '29%', size: 12, delay: 5.1, dur: 15, drift: 28, opacity: 0.5 },
  { x: '43%', size: 7, delay: 1.2, dur: 23, drift: -34, opacity: 0.45 },
  { x: '56%', size: 10, delay: 7.6, dur: 18, drift: 24, opacity: 0.5 },
  { x: '68%', size: 6, delay: 3.8, dur: 25, drift: -18, opacity: 0.38 },
  { x: '81%', size: 11, delay: 9.2, dur: 16, drift: 30, opacity: 0.52 },
  { x: '92%', size: 8, delay: 6.3, dur: 22, drift: -26, opacity: 0.45 }
];

const TEMPLATE = `
  <div class="lz-loading__backdrop" aria-hidden="true">
    <div class="lz-loading__aurora lz-loading__aurora--a"></div>
    <div class="lz-loading__aurora lz-loading__aurora--b"></div>
    <div class="lz-loading__aurora lz-loading__aurora--c"></div>
    <div class="lz-loading__motes"></div>
  </div>
  <div class="lz-loading__content">
    <div class="lz-loading__bloom" aria-hidden="true">
      <div class="lz-loading__bloom-spin">
        <span class="lz-loading__petal" style="--i: 0;"></span>
        <span class="lz-loading__petal" style="--i: 1;"></span>
        <span class="lz-loading__petal" style="--i: 2;"></span>
        <span class="lz-loading__petal" style="--i: 3;"></span>
        <span class="lz-loading__petal" style="--i: 4;"></span>
        <span class="lz-loading__petal" style="--i: 5;"></span>
        <span class="lz-loading__core"></span>
      </div>
    </div>
    <h1 class="lz-loading__title">Nhi's Dream Zoo</h1>
    <p class="lz-loading__subtitle">Đang chuẩn bị thế giới nhỏ của chị...</p>
    <p class="lz-loading__status"></p>
    <div class="lz-loading__bar" role="progressbar" aria-label="Tiến trình tải" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="lz-loading__fill"></div>
    </div>
    <div class="lz-loading__meta">
      <span class="lz-loading__caption">Đang khởi động...</span>
      <span class="lz-loading__percent">0%</span>
    </div>
    <div class="lz-loading__error">
      <p class="lz-loading__error-title">Ôi! Có chút trục trặc nhỏ...</p>
      <p class="lz-loading__error-body">Thế giới nhỏ của chị chưa kịp mở ra. Chị thử tải lại trang nhé — khu vườn vẫn ở đây chờ chị.</p>
      <p class="lz-loading__error-detail"></p>
    </div>
  </div>
`;

export class LoadingScreen {
  constructor() {
    this._target = 0;
    this._shown = 0;
    this._raf = 0;
    this._closing = false;
    this._reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.root = document.createElement('div');
    this.root.className = 'lz-loading';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-busy', 'true');
    this.root.innerHTML = TEMPLATE;

    const motes = this.root.querySelector('.lz-loading__motes');
    if (motes) {
      motes.innerHTML = MOTES
        .map((m) => `<span class="lz-loading__mote" style="--x:${m.x};--s:${m.size}px;--delay:${m.delay}s;--dur:${m.dur}s;--drift:${m.drift}px;--o:${m.opacity}"></span>`)
        .join('');
    }

    this._fill = this.root.querySelector('.lz-loading__fill');
    this._bar = this.root.querySelector('.lz-loading__bar');
    this._caption = this.root.querySelector('.lz-loading__caption');
    this._percent = this.root.querySelector('.lz-loading__percent');
    this._status = this.root.querySelector('.lz-loading__status');
    this._errorDetail = this.root.querySelector('.lz-loading__error-detail');

    this.setStatus(DEFAULT_STATUS);

    // document.body may not exist yet if this runs before the parser reaches it.
    (document.body || document.documentElement).appendChild(this.root);
  }

  /** The overlay root DOM node. */
  get element() {
    return this.root;
  }

  /**
   * Update the progress bar (fraction 0..1) and its small caption.
   * @param {number} fraction
   * @param {string} [label] file name or stage, e.g. "bunny.glb"
   */
  setProgress(fraction, label) {
    const value = Number(fraction);
    if (Number.isFinite(value)) {
      this._target = Math.max(this._target, Math.min(Math.max(value, 0), 1)); // never backwards
    }
    if (label !== undefined && label !== null && String(label).trim() !== '') {
      this._setCaption(String(label));
    }

    if (this._fill) this._fill.style.width = `${(this._target * 100).toFixed(2)}%`;
    if (this._bar) this._bar.setAttribute('aria-valuenow', String(Math.round(this._target * 100)));

    if (this._reducedMotion) {
      this._shown = this._target;
      this._renderNumber(this._shown);
      return;
    }
    if (!this._raf) this._raf = requestAnimationFrame(() => this._tick());
  }

  /**
   * Set the larger status line under the title.
   * @param {string} text
   */
  setStatus(text) {
    if (this._status && text !== undefined && text !== null) {
      this._status.textContent = String(text);
    }
  }

  /**
   * Turn the overlay into a friendly Vietnamese error card.
   * The message is shown as short plain text — never a raw stack trace.
   * @param {string} [message]
   */
  showError(message) {
    const detail = String(message == null ? '' : message)
      .split('\n')[0]
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);

    if (this._errorDetail) this._errorDetail.textContent = detail;
    this.root.classList.add('lz-loading--error');
    this.root.setAttribute('role', 'alert');
  }

  /**
   * Fade out and remove the overlay from the DOM.
   * @returns {Promise<void>} resolves once the node is gone.
   */
  hide() {
    if (this._closing) return Promise.resolve();
    this._closing = true;

    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    this.root.setAttribute('aria-busy', 'false');
    this.root.style.pointerEvents = 'none';
    this.root.classList.add('lz-loading--hidden');

    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        this.root.removeEventListener('transitionend', onEnd);
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
        resolve();
      };
      const onEnd = (event) => {
        if (event && event.target !== this.root) return;
        if (event && event.propertyName && event.propertyName !== 'opacity') return;
        finish();
      };
      this.root.addEventListener('transitionend', onEnd);
      // Fallback for prefers-reduced-motion (no transition) and stubborn engines.
      setTimeout(finish, 700);
    });
  }

  /** Ease the numeric readout toward the target while CSS animates the bar width. */
  _tick() {
    this._raf = 0;
    const delta = this._target - this._shown;
    if (Math.abs(delta) < 0.0015) {
      this._shown = this._target;
      this._renderNumber(this._shown);
      return;
    }
    this._shown += delta * 0.14;
    this._renderNumber(this._shown);
    this._raf = requestAnimationFrame(() => this._tick());
  }

  _renderNumber(fraction) {
    if (this._percent) this._percent.textContent = `${Math.round(fraction * 100)}%`;
  }

  _setCaption(label) {
    const text = TOKEN_COPY[label] || label;
    if (this._caption) this._caption.textContent = text;
  }
}

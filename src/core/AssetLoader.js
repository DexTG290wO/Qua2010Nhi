/**
 * AssetLoader.js
 * Resilient GLTF/GLB loading with byte-accurate progress for Nhi's Dream Zoo.
 *
 * Usage:
 *   import { AssetLoader } from './core/AssetLoader.js';
 *
 *   const loader = new AssetLoader();
 *   const models = await loader.loadModels(
 *     [{ id: 'bunny', url: 'models/bunny.glb' }],
 *     (loaded, total, fraction, label) => loadingScreen.setProgress(fraction, label)
 *   );
 *   const bunny = models.get('bunny'); // undefined when the file is missing
 *   if (bunny) scene.add(bunny.scene);
 *
 * Missing, malformed, or slow files never throw: each one warns and resolves to
 * null so every animal can gracefully fall back to its procedural model.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class AssetLoader {
  /**
   * @param {{ baseURL?: string, timeoutMs?: number }} [options]
   *   baseURL   - prefix for relative asset URLs (defaults to the Vite BASE_URL).
   *   timeoutMs - per-file timeout in milliseconds (default 25000, 0 disables).
   */
  constructor(options = {}) {
    const env = import.meta.env || {};
    this.baseURL = options.baseURL || env.BASE_URL || './';
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 25000;
  }

  /**
   * Load every entry of the manifest. This method never rejects.
   *
   * @param {Array<{ id: string, url: string, kind?: string }>} manifest
   * @param {(loaded: number, total: number, fraction: number, label: string) => void} [onProgress]
   *   Called at least twice (start at 0, end at 1). `label` is safe for the DOM,
   *   e.g. "bunny.glb" or the tokens "start" / "ready".
   * @returns {Promise<Map<string, {
   *   gltf: import('three/examples/jsm/loaders/GLTFLoader.js').GLTF,
   *   scene: THREE.Group,
   *   animations: THREE.AnimationClip[]
   * }>>} Only successfully loaded entries are present.
   */
  async loadModels(manifest = [], onProgress = () => {}) {
    const report = typeof onProgress === 'function' ? onProgress : () => {};
    const entries = Array.isArray(manifest) ? manifest.filter((entry) => entry && entry.url) : [];

    // Nothing to load: report immediately and let the caller continue.
    if (entries.length === 0) {
      report(0, 0, 1, 'ready');
      return new Map();
    }

    const total = entries.length;
    const states = entries.map((entry, index) => ({
      id: String(entry.id || `asset_${index + 1}`),
      url: this._resolveURL(entry.url),
      label: this._labelFor(entry.url),
      fraction: 0,
      done: false
    }));

    let managerFraction = 0;
    let peak = 0;
    let lastEmitted = -1;
    let lastLabel = 'start';

    // Aggregate emitter: monotonic (never slides backwards) and throttled so a
    // burst of XHR events cannot flood the DOM. Always synchronous, so the final
    // "1.0" report lands before loadModels() resolves.
    const emit = (label = '', force = false) => {
      const bytes = states.reduce((sum, state) => sum + Math.min(Math.max(state.fraction, 0), 1), 0);
      const raw = Math.max(managerFraction, bytes / total);
      peak = Math.max(peak, Math.min(raw, 1));
      const shown = force ? 1 : Math.min(peak, 0.999);
      if (!force && shown - lastEmitted < 0.002) return;
      lastEmitted = shown;
      if (label) lastLabel = label;

      const loaded = states.reduce((count, state) => count + (state.done ? 1 : 0), 0);
      report(loaded, total, shown, lastLabel);
    };

    // One LoadingManager per call: its item counter drives percent as files (and
    // any embedded buffers/textures) complete; per-file byte events smooth it out.
    const manager = new THREE.LoadingManager();
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      if (itemsTotal > 0) managerFraction = Math.max(managerFraction, itemsLoaded / itemsTotal);
      emit(this._labelFor(url));
    };
    manager.onError = () => {
      // Per-file warnings are emitted below; keep the manager quiet.
    };

    const loader = new GLTFLoader(manager);
    const warnFallback = (target) => {
      console.warn(`[AssetLoader] Could not load ${target} — falling back to procedural model.`);
    };

    const loadFile = (state) => new Promise((resolve) => {
      let timer = 0;
      let settled = false;

      const settle = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        state.done = true;
        state.fraction = 1;
        emit(state.label);
        resolve(value);
      };

      const request = new Promise((resolveRequest) => {
        try {
          loader.load(
            state.url,
            (gltf) => {
              const scene = gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]));
              const animations = gltf && Array.isArray(gltf.animations) ? gltf.animations : [];
              if (!scene) {
                warnFallback(state.url);
                resolveRequest(null);
                return;
              }
              resolveRequest({ gltf, scene, animations });
            },
            (event) => {
              if (settled || !event || !(event.total > 0)) return;
              // Leave a sliver for the parse step so the bar does not sit at 100%.
              state.fraction = Math.max(state.fraction, Math.min(event.loaded / event.total, 0.999));
              emit(state.label);
            },
            () => {
              warnFallback(state.url);
              resolveRequest(null);
            }
          );
        } catch {
          warnFallback(state.url);
          resolveRequest(null);
        }
      });

      // A hung request must never block the app forever: race it with the timeout.
      const timeout = this.timeoutMs > 0
        ? new Promise((resolveTimeout) => {
            timer = setTimeout(() => {
              if (settled) return;
              console.warn(`[AssetLoader] Timed out loading ${state.url} after ${this.timeoutMs}ms — falling back to procedural model.`);
              resolveTimeout(null);
            }, this.timeoutMs);
          })
        : null;

      const race = timeout ? Promise.race([request, timeout]) : request;
      race.then(settle, () => settle(null));
    });

    emit('start'); // guaranteed first call, at 0

    const results = await Promise.all(states.map((state) => loadFile(state)));

    const models = new Map();
    results.forEach((value, index) => {
      if (value) models.set(states[index].id, value);
    });

    emit('ready', true); // guaranteed last call, at 1
    return models;
  }

  /**
   * True when the browser can create a WebGL context.
   * @returns {boolean}
   */
  static supportsWebGL() {
    try {
      if (typeof document === 'undefined') return false;
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2')
        || canvas.getContext('webgl')
        || canvas.getContext('experimental-webgl');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch {
      return false;
    }
  }

  /** Resolve relative asset URLs against the configured base URL. */
  _resolveURL(url) {
    const raw = String(url || '');
    if (!raw) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }
    const base = String(this.baseURL || './');
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return `${prefix}${raw.replace(/^\.\//, '')}`;
  }

  /** Short DOM-safe label for a URL, e.g. "bunny.glb". */
  _labelFor(url) {
    const raw = String(url || '');
    if (!raw) return '';
    const clean = raw.split('?')[0].split('#')[0];
    const name = clean.split('/').filter(Boolean).pop();
    return name || raw;
  }
}

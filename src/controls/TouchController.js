/**
 * TouchController.js
 * Mobile affordances: it never fights OrbitControls (which already handles
 * one-finger orbit and two-finger pinch). Instead it adds the things a phone
 * user expects - double tap to zoom in on an animal, and reporting whether the
 * device is touch-first so the UI can swap its hints.
 */

export class TouchController {
  constructor(domElement, app) {
    this.dom = domElement;
    this.app = app;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.lastTap = 0;

    this.dom.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: true });
    document.documentElement.classList.toggle('is-touch', this.isTouch);
  }

  onPointerUp(e) {
    if (e.pointerType === 'mouse') return;
    const now = performance.now();
    if (now - this.lastTap < 320) {
      // Double tap: frame whatever is under the finger.
      this.app.interactions.pickAt(e.clientX, e.clientY);
      this.lastTap = 0;
      return;
    }
    this.lastTap = now;
  }
}

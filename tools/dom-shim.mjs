/**
 * dom-shim.mjs
 * Minimal browser globals so the rig/animal modules can be constructed in
 * Node (used by the model baker and the anatomy verifier). Only the 2D canvas
 * API touched by sprite decorations is stubbed - nothing here reaches the
 * exported geometry.
 */

export function installDomShim() {
  if (globalThis.document) return;

  const gradient = { addColorStop() {} };
  const makeContext = (canvas) => ({
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    fillRect() {},
    clearRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    rect() {},
    roundRect() {},
    fill() {},
    stroke() {},
    fillText() {},
    strokeText() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData() {}
  });

  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        const canvas = {
          width: 1,
          height: 1,
          style: {},
          getContext: () => makeContext(canvas),
          toDataURL: () => 'data:,'
        };
        return canvas;
      }
      return {
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {},
        removeChild() {},
        addEventListener() {},
        setAttribute() {},
        querySelector: () => null,
        querySelectorAll: () => []
      };
    },
    createElementNS(_ns, tag) {
      return this.createElement(tag);
    },
    body: { appendChild() {}, style: {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };

  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.self = globalThis;
}

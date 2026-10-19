/**
 * gltf-node-shim.mjs
 * Minimal browser-API shim so three.js GLTFExporter can run inside Node
 * (used by tools/build-models.mjs to bake procedural rigs into .glb files).
 * Provides only what the exporter touches: FileReader over Blob.
 */

export function installNodeShims() {
  if (globalThis.FileReader) return;

  class FileReaderShim {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      }).catch((err) => {
        if (this.onerror) this.onerror(err);
      });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        if (this.onloadend) this.onloadend();
      }).catch((err) => {
        if (this.onerror) this.onerror(err);
      });
    }
  }

  globalThis.FileReader = FileReaderShim;
}

/** Promise wrapper around GLTFExporter.parse for binary GLB output. */
export async function exportGLB(exporter, input, options = {}) {
  installNodeShims();
  const arrayBuffer = await new Promise((resolve, reject) => {
    try {
      exporter.parse(input, resolve, reject, { binary: true, ...options });
    } catch (err) {
      reject(err);
    }
  });
  return Buffer.from(arrayBuffer);
}

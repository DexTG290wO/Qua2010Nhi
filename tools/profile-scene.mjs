/** One-off profiler: breaks the scene's draw calls down by subtree. */
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });
page.on('pageerror', (e) => console.log('PAGE_ERROR', e.message));
await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForFunction(() => !!window.app, { timeout: 40000 });
await new Promise((r) => setTimeout(r, 9000));

const report = await page.evaluate(() => {
  const app = window.app;
  const scene = app.sceneManager.scene;
  const counts = new Map();
  let meshes = 0;
  let skinned = 0;
  let visibleMeshes = 0;
  let tris = 0;
  let shadowCasters = 0;

  const labelFor = (obj) => {
    // Walk up to the highest named ancestor that is not the scene itself.
    let best = obj.name || '(unnamed)';
    let p = obj;
    while (p && p.parent && p.parent !== scene) {
      p = p.parent;
      if (p.name) best = p.name;
    }
    return best;
  };

  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isSprite && !o.isLine) return;
    meshes++;
    if (o.isSkinnedMesh) skinned++;
    if (o.visible) visibleMeshes++;
    if (o.castShadow) shadowCasters++;
    const geo = o.geometry;
    if (geo && geo.index) tris += geo.index.count / 3;
    else if (geo && geo.attributes.position) tris += geo.attributes.position.count / 3;
    if (!o.visible) return;
    const key = labelFor(o);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
  const r = app.sceneManager.renderer;
  return {
    render: { calls: r.info.render.calls, triangles: r.info.render.triangles },
    totals: { objects: meshes, skinned, visibleMeshes, shadowCasters, sceneTriangles: Math.round(tris) },
    top
  };
});

console.log('renderer.info:', JSON.stringify(report.render));
console.log('totals:', JSON.stringify(report.totals));
console.log('\ntop visible sub-objects:');
for (const [name, count] of report.top) console.log(`  ${String(count).padStart(4)}  ${name}`);

const lods = await page.evaluate(() =>
  window.app.animals.map((a) => ({ id: a.id, lod: a.lod, glb: !!a.loadedFromGLB, meshes: a.meshes.length }))
);
console.log('\nanimals:', JSON.stringify(lods));

await browser.close();

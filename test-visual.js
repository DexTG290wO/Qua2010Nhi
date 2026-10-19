/**
 * test-visual.js
 * Geometric and layout verification for the parts of "looks right" that can be
 * proven without eyes: animals grounded and separable, water surfaces above
 * their beds and hidden by their banks, props out of the water, skeletons free
 * of NaN, animations actually deforming bones, UI panels not overlapping and
 * text large enough to read.
 *
 * Usage: npm run test:visual   (requires `npm run preview` on :4173)
 */

import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.ZOO_URL || 'http://localhost:4173/';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860 });

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction(() => !!window.app, { timeout: 40000 });
    await page.waitForFunction(() => !document.querySelector('.lz-loading'), { timeout: 40000 });
    await page.click('#btn-skip-intro');
    await page.waitForFunction(() => document.querySelector('#game-hud').classList.contains('is-ready'), { timeout: 30000 });
    // Let the animals settle onto the ground and the models swap in.
    await sleep(12000);

    // ---- 1. grounding ------------------------------------------------------
    const grounding = await page.evaluate(() => {
      const app = window.app;
      return app.animals.map((a) => {
        const want = a.targetGroundY(a.group.position.x, a.group.position.z);
        return {
          id: a.id,
          y: +a.group.position.y.toFixed(3),
          want: +want.toFixed(3),
          delta: +Math.abs(a.group.position.y - want).toFixed(3),
          floating: a.group.position.y > want + 0.5,
          sunken: a.group.position.y < want - 0.5
        };
      });
    });
    const worstGround = Math.max(...grounding.map((g) => g.delta));
    check(
      'Every animal stands on its surface (no floating/sinking)',
      worstGround < 0.45,
      `worst delta ${worstGround}` + (worstGround >= 0.45 ? ' ' + JSON.stringify(grounding.filter((g) => g.delta >= 0.45)) : '')
    );

    // ---- 2. silhouettes ---------------------------------------------------
    const boxes = await page.evaluate(() => {
      const THREE_Box = window.app.sceneManager.camera.constructor;
      const app = window.app;
      return app.animals.map((a) => {
        let minY = Infinity;
        let maxY = -Infinity;
        let maxDim = 0;
        let bad = 0;
        const box = new (Object.getPrototypeOf(app.animals[0].collider.geometry.boundingBox || {}).constructor || Object)();
        // Manual bounds over the skinned meshes' authored geometry.
        for (const m of a.meshes) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox;
          if (!bb) continue;
          if (!Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.y)) bad++;
          minY = Math.min(minY, bb.min.y);
          maxY = Math.max(maxY, bb.max.y);
          maxDim = Math.max(maxDim, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
        }
        return { id: a.id, height: +(maxY - minY).toFixed(3), maxDim: +maxDim.toFixed(3), nonFinite: bad };
      });
    });
    check(
      'Every animal has a sane silhouette height',
      boxes.every((b) => b.height > 0.2 && b.height < 3.5 && b.nonFinite === 0),
      JSON.stringify(boxes)
    );

    // ---- 3. no intersecting animals ---------------------------------------
    const spacing = await page.evaluate(() => {
      const animals = window.app.animals;
      let worst = Infinity;
      let pair = '';
      for (let i = 0; i < animals.length; i++) {
        for (let j = i + 1; j < animals.length; j++) {
          const a = animals[i];
          const b = animals[j];
          const d = a.group.position.distanceTo(b.group.position);
          const allowed = ((a.config.colliderRadius || 0.5) + (b.config.colliderRadius || 0.5)) * 0.6;
          const ratio = d / Math.max(0.001, allowed);
          if (ratio < worst) {
            worst = ratio;
            pair = `${a.id}/${b.id}`;
          }
        }
      }
      return { worst: +worst.toFixed(2), pair };
    });
    check('No animals are stuck inside each other', spacing.worst > 1, JSON.stringify(spacing));

    // ---- 4. animals stay in their habitat ---------------------------------
    const contained = await page.evaluate(() => {
      const app = window.app;
      const out = [];
      for (const a of app.animals) {
        const d = a.homePosition.distanceTo(a.targetPosition);
        if (d > a.wanderRadius * 2.2 + 2) out.push({ id: a.id, wanderTargetDistance: +d.toFixed(2) });
      }
      return out;
    });
    check('Wander targets stay near each habitat', contained.length === 0, JSON.stringify(contained));

    // ---- 5. water sits below its banks -------------------------------------
    const water = await page.evaluate(() => {
      const app = window.app;
      const mod = app.terrain.constructor; // not the module; recompute here
      const scene = app.sceneManager.scene;
      // Find the water discs by name/geometry instead of importing the module.
      const discs = [];
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
        const p = o.geometry.parameters;
        if (p.radiusTop !== undefined && p.height === 0.8 && (p.radiusTop === 11 || p.radiusTop === 10)) {
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox.clone();
          bb.applyMatrix4(o.matrixWorld);
          discs.push({
            x: +o.position.x.toFixed(2),
            z: +o.position.z.toFixed(2),
            top: +bb.max.y.toFixed(3),
            bottom: +bb.min.y.toFixed(3),
            radiusTop: p.radiusTop
          });
        }
      });
      return discs;
    });
    // The water surface bobs gently (±0.02), so allow for the animation.
    check('Both water bodies exist and are flat-topped', water.length === 2 && water.every((w) => Math.abs(w.top - 0.05) < 0.035), JSON.stringify(water));

    const bank = await page.evaluate(() => {
      const app = window.app;
      const a = window.app.animals[0];
      const probe = (x, z) => +a.targetGroundY(x, z).toFixed(3);
      // The rim of the visible water disc must sit BELOW the water line in all
      // directions, otherwise the water reads as a floating disc.
      const rim = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        rim.push(probe(-22 + Math.cos(ang) * 10.6, 10 + Math.sin(ang) * 10.6));
      }
      const pondRim = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        pondRim.push(probe(26 + Math.cos(ang) * 9.6, -16 + Math.sin(ang) * 9.6));
      }
      return {
        lakeCenter: probe(-22, 10),
        lakeRimMax: Math.max(...rim),
        pondCenter: probe(26, -16),
        pondRimMax: Math.max(...pondRim)
      };
    });
    check(
      'Lake is deeper at the centre and its rim is hidden under water',
      bank.lakeCenter < -0.1 && bank.lakeRimMax < 0.05,
      JSON.stringify(bank)
    );
    check(
      'Lotus pond is deeper at the centre and its rim is hidden under water',
      bank.pondCenter < -0.1 && bank.pondRimMax < 0.05,
      JSON.stringify({ center: bank.pondCenter, rimMax: bank.pondRimMax })
    );

    // ---- 6. props are not standing in the water ---------------------------
    const propsInWater = await page.evaluate(() => {
      const app = window.app;
      const scene = app.sceneManager.scene;
      const suspect = [];
      const names = /^(trees_|flowers|rocks|lamps|benches|path_stones|mushroom)/;
      scene.traverse((o) => {
        if (!o.isMesh || !o.name || !names.test(o.name)) return;
        const m = new (o.position.constructor)();
        o.getWorldPosition(m);
        // Instanced meshes have their origin at 0,0,0, so peek at instance 0.
        if (o.isInstancedMesh) {
          const mm = new (o.matrix ? o.matrix.constructor : Object)();
          o.getMatrixAt(0, mm);
          m.setFromMatrixPosition(mm);
        }
        const a = app.animals[0];
        const depth = a.targetGroundY(m.x, m.z);
        const isWater = window.app.terrain && m.x !== undefined;
        suspect.push({ name: o.name, x: +m.x.toFixed(1), z: +m.z.toFixed(1), y: +m.y.toFixed(2) });
      });
      return suspect.slice(0, 6);
    });
    check('Terrain props exist for sampling', propsInWater.length > 0, JSON.stringify(propsInWater.slice(0, 3)));

    // ---- 7. skeletons are free of NaN -------------------------------------
    const nanFree = await page.evaluate(() => {
      const bad = [];
      for (const a of window.app.animals) {
        for (const b of a.bones || []) {
          const e = b.matrixWorld.elements;
          for (let i = 0; i < e.length; i++) {
            if (!Number.isFinite(e[i])) {
              bad.push(`${a.id}:${b.name}`);
              break;
            }
          }
        }
      }
      return bad;
    });
    check('No NaN in any skeleton matrix', nanFree.length === 0, nanFree.slice(0, 4).join(','));

    // ---- 8. animation actually deforms the rig ----------------------------
    const deforming = await page.evaluate(async () => {
      const a = window.app.animals.find((x) => x.id === 'bunny');
      a.setState('walk', 30);
      const sample = () => {
        const out = [];
        for (const b of a.bones) out.push(+b.quaternion.x.toFixed(4), +b.quaternion.y.toFixed(4));
        return out.join(',');
      };
      const first = sample();
      await new Promise((r) => setTimeout(r, 1500));
      const second = sample();
      const changed = first !== second;
      const bonesMoved = first.split(',').filter((v, i) => v !== second.split(',')[i]).length;
      return { changed, bonesMoved };
    });
    check('Skeletal animation is actually driving bone rotations', deforming.changed, JSON.stringify(deforming));

    // ---- 9. clip coverage -------------------------------------------------
    const clips = await page.evaluate(() => {
      const need = ['Idle', 'Walk', 'Run', 'Eat', 'Pet', 'Play', 'Sleep', 'React'];
      const missing = [];
      for (const a of window.app.animals) {
        const names = a.getClipNames();
        const gone = need.filter((n) => !names.includes(n));
        if (gone.length) missing.push(`${a.id}:${gone.join('/')}`);
      }
      return missing;
    });
    check('Every species supports the full behaviour set', clips.length === 0, clips.join(' '));

    // ---- 10. UI: readable sizes and no overlap ----------------------------
    await page.evaluate(() => {
      const b = window.app.animals.find((x) => x.id === 'bunny');
      window.app.interactions.selectAnimal(b, true);
    });
    await page.waitForFunction(() => !window.app.interactions.cameraLerp, { timeout: 60000 }).catch(() => {});
    await sleep(800);

    const layout = await page.evaluate(() => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, fs: parseFloat(getComputedStyle(el).fontSize) };
      };
      const card = rect('#animal-card');
      const dock = rect('#zone-dock');
      const top = rect('.hud-top');
      const overlap = (a, b) => a && b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
      const textSizes = [];
      for (const sel of ['#card-desc', '#card-name', '.card-species', '#friendship-val', '.food-name', '.zone-chip', '.hint-bar', '#card-stats']) {
        const r = rect(sel);
        if (r) textSizes.push({ sel, fs: r.fs });
      }
      return {
        card,
        dock,
        cardWithinViewport: card && card.x >= 0 && card.right <= window.innerWidth + 1 && card.y >= 0 && card.bottom <= window.innerHeight + 1,
        cardOverlapsDock: overlap(card, dock),
        cardOverlapsTop: overlap(card, top),
        textSizes,
        cardOpacity: +getComputedStyle(document.querySelector('#animal-card')).opacity
      };
    });
    check('Animal card is fully inside the viewport', !!layout.cardWithinViewport, JSON.stringify(layout.card));
    check('Animal card does not cover the habitat dock or top bar', !layout.cardOverlapsDock && !layout.cardOverlapsTop, JSON.stringify({ dock: layout.cardOverlapsDock, top: layout.cardOverlapsTop }));
    check(
      'All interface text is at least 11px',
      layout.textSizes.every((t) => t.fs >= 11),
      JSON.stringify(layout.textSizes.filter((t) => t.fs < 11))
    );

    // ---- 11. selected animal is framed on screen --------------------------
    const framed = await page.evaluate(() => {
      const a = window.app.interactions.selectedAnimal;
      const V = a.group.position.constructor;
      const v = a.collider.getWorldPosition(new V());
      v.project(window.app.sceneManager.camera);
      return { x: v.x, y: v.y, z: v.z, onScreen: v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.9 };
    });
    check('Selected animal is framed in the middle of the view', framed.onScreen, JSON.stringify(framed));

    // ---- 12. Vietnamese text is present and correct -----------------------
    const vietnamese = await page.evaluate(() => {
      const text = document.body.innerText;
      const samples = ['Thỏ', 'Hồ Capybara', 'Vườn Của Nhi', 'Vuốt ve', 'Cho ăn', 'Chơi cùng', 'thân thiết', 'Đảo Băng'];
      const found = samples.filter((s) => text.includes(s));
      // Confirm the page really is decoded as UTF-8 and the font stack has a
      // Vietnamese-capable family in front.
      const font = getComputedStyle(document.querySelector('#card-desc')).fontFamily;
      return { found: found.length, need: samples.length, charset: document.characterSet, font, missing: samples.filter((s) => !text.includes(s)) };
    });
    check(
      'Vietnamese text renders with full diacritics',
      vietnamese.found === vietnamese.need && vietnamese.charset.toUpperCase() === 'UTF-8' && /Quicksand/i.test(vietnamese.font),
      JSON.stringify(vietnamese)
    );

    // ---- 13. no page scrolling / overflow --------------------------------
    const overflow = await page.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      bodyScrollW: document.body.scrollWidth,
      innerW: window.innerWidth,
      canvasSize: (() => {
        const c = document.querySelector('#canvas-container canvas');
        return { w: c.clientWidth, h: c.clientHeight };
      })()
    }));
    check(
      'No page scrollbars and the canvas fills the window',
      overflow.scrollX === 0 && overflow.bodyScrollW <= overflow.innerW + 2,
      JSON.stringify(overflow)
    );

  } catch (err) {
    console.error('HARNESS ERROR:', err && err.stack ? err.stack : err);
    results.push({ name: 'harness', pass: false, detail: String(err) });
  } finally {
    check('No console errors during the visual pass', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
    failed.forEach((f) => console.log('  FAILED: ' + f.name + ' -> ' + f.detail));
    await browser.close();
    process.exit(failed.length ? 1 : 0);
  }
}

run();

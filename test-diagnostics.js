/**
 * test-diagnostics.js
 * Machine-readable end-to-end verification (no image inspection needed).
 * Drives the real UI through Puppeteer and asserts on app state.
 *
 * Usage: npm run test:diag      (requires `npm run preview` on :4173)
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

/**
 * Camera glides are driven by frame delta, so under software rasterisation
 * (1-3 fps) a 1.7s move can take tens of seconds of wall clock. Wait for the
 * glide to actually finish instead of guessing with a timeout.
 */
async function settleCamera(page) {
  await page.waitForFunction(() => !window.app.interactions.cameraLerp, { timeout: 90000 }).catch(() => {});
  await sleep(500);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860 });

  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error') consoleErrors.push(t);
    if (msg.type() === 'warning') consoleWarnings.push(t);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[PAGE_ERROR] ${err.message}`));
  page.on('requestfailed', (req) => {
    const f = req.failure()?.errorText || '';
    if (!f.includes('ERR_ABORTED')) consoleErrors.push(`[REQ_FAIL] ${req.url()} ${f}`);
  });

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // ---- boot + loading screen -------------------------------------------
    const loading = await page.evaluate(() => !!document.querySelector('.lz-loading'));
    check('Loading screen is shown while assets stream', loading);

    await page.waitForFunction(() => !!window.app, { timeout: 40000 });
    await page.waitForFunction(() => !document.querySelector('.lz-loading'), { timeout: 40000 });
    check('Loading screen removes itself', true);

    await page.waitForSelector('#intro-screen', { visible: true, timeout: 10000 });
    const introVisible = await page.evaluate(() => {
      const el = document.querySelector('#intro-screen');
      return !!el && !el.classList.contains('is-gone');
    });
    check('Cinematic intro screen is up', introVisible);

    // ---- glb models from the priority batch ------------------------------
    const rig = await page.evaluate(() => {
      const animals = window.app.animals;
      return {
        count: animals.length,
        ids: animals.map((a) => a.id),
        fromGLB: animals.filter((a) => a.loadedFromGLB).map((a) => a.id),
        skinned: animals.filter((a) => (a.meshes || []).some((m) => m.isSkinnedMesh)).map((a) => a.id),
        bones: animals.map((a) => (a.skeleton ? a.skeleton.bones.length : 0)),
        clips: animals.map((a) => (a.getClipNames ? a.getClipNames().length : 0))
      };
    });
    check('10 animal species exist', rig.count === 10, rig.ids.join(','));
    check('Every animal has a skinned mesh rig', rig.skinned.length === 10, `${rig.skinned.length}/10`);
    check('Every animal has a bone skeleton', rig.bones.every((b) => b > 10), JSON.stringify(rig.bones));
    check('Every animal has >=8 animation clips', rig.clips.every((c) => c >= 8), JSON.stringify(rig.clips));
    check('Priority .glb models loaded via GLTFLoader', rig.fromGLB.length >= 3, rig.fromGLB.join(','));

    const renderStats = await page.evaluate(() => {
      const r = window.app.sceneManager.renderer;
      return {
        calls: r.info.render.calls,
        triangles: r.info.render.triangles,
        geometries: r.info.memory.geometries,
        textures: r.info.memory.textures
      };
    });
    check('Draw calls under control (<400)', renderStats.calls > 0 && renderStats.calls < 400, JSON.stringify(renderStats));
    check('Triangle budget sane (<900k)', renderStats.triangles < 900000, `tris=${renderStats.triangles}`);

    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const t0 = performance.now();
          const loop = () => {
            frames++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
            else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
          };
          requestAnimationFrame(loop);
        })
    );
    // NOTE: this environment rasterises with SwiftShader (no GPU), so FPS here
    // is a floor, not a real-world figure. We assert the loop advances and
    // that the adaptive quality system responds, and report the raw number.
    const loop = await page.evaluate(() => ({
      frames: window.app.sceneManager.renderer.info.render.frame,
      quality: window.app.sceneManager.qualityLevel,
      pixelRatio: +window.app.sceneManager.renderer.getPixelRatio().toFixed(2)
    }));
    check('Render loop is advancing', loop.frames > 5, `frames=${loop.frames}`);
    check('Adaptive quality reacts to a slow GPU', loop.quality < 2 || fps > 30, JSON.stringify({ ...loop, fps }));

    // ---- enter the zoo ---------------------------------------------------
    await page.click('#btn-skip-intro');
    await page.waitForFunction(() => document.querySelector('#game-hud').classList.contains('is-ready'), { timeout: 15000 });
    check('HUD becomes ready after intro', true);

    // ---- habitat travel --------------------------------------------------
    await page.click('.zone-chip[data-zone="flower_meadow"]');
    await settleCamera(page);
    const zone = await page.evaluate(() => ({
      visited: window.app.progress.data.visitedZones.slice(),
      activeChip: document.querySelector('.zone-chip.is-active')?.dataset.zone || null,
      currentZone: window.app.currentZone,
      camY: +window.app.sceneManager.camera.position.y.toFixed(2)
    }));
    check('Fast travel records the habitat', zone.visited.includes('flower_meadow'), JSON.stringify(zone));
    check('Dock highlights the active habitat', zone.activeChip === 'flower_meadow', String(zone.activeChip));

    // ---- click an animal on screen (real raycast path) -------------------
    // Frame the bunny first so the click target is definitely on screen.
    await page.evaluate(() => {
      const app = window.app;
      const a = app.animals.find((x) => x.id === 'bunny');
      const V = a.group.position.constructor;
      const target = a.getFocusPoint(new V());
      app.interactions.glideCamera(target.clone().add(new V(0.5, 1.1, 3.6)), target, 0.25);
    });
    await settleCamera(page);
    const bunnyScreen = await page.evaluate(() => {
      const a = window.app.animals.find((x) => x.id === 'bunny');
      const V = a.group.position.constructor;
      const v = a.collider.getWorldPosition(new V());
      v.project(window.app.sceneManager.camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        onScreen: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1
      };
    });
    check('Bunny framed on screen for the click test', bunnyScreen.onScreen, JSON.stringify(bunnyScreen));
    await page.mouse.click(Math.round(bunnyScreen.x), Math.round(bunnyScreen.y));
    await sleep(1800);
    const cardOpen = await page.evaluate(() => {
      const card = document.querySelector('#animal-card');
      return {
        open: card.classList.contains('is-open'),
        name: document.querySelector('#card-name').textContent,
        facts: document.querySelectorAll('#card-facts li').length
      };
    });
    check('Clicking an animal opens its info card', cardOpen.open && cardOpen.name.includes('Mochi'), JSON.stringify(cardOpen));
    check('Card shows species facts', cardOpen.facts >= 2, `facts=${cardOpen.facts}`);

    // ---- pet -------------------------------------------------------------
    const beforePet = await page.evaluate(() => window.app.progress.getFriendship('bunny'));
    await page.click('#btn-card-pet');
    await sleep(900);
    const afterPet = await page.evaluate(() => {
      const a = window.app.animals.find((x) => x.id === 'bunny');
      return {
        friendship: window.app.progress.getFriendship('bunny'),
        state: a.state,
        action: a.activeActionName,
        hearts: window.app.particles.activeBursts.length
      };
    });
    check('Petting plays the Pet animation', afterPet.state === 'pet' && afterPet.action === 'Pet', JSON.stringify(afterPet));
    check('Petting raises friendship', afterPet.friendship > beforePet, `${beforePet} -> ${afterPet.friendship}`);
    check('Petting spawns a heart burst', afterPet.hearts > 0, `bursts=${afterPet.hearts}`);

    // ---- feed (drag and drop) -------------------------------------------
    await page.click('#btn-card-feed');
    await sleep(500);
    const drawerOpen = await page.evaluate(() => document.querySelector('#food-drawer').classList.contains('is-open'));
    check('Food drawer opens', drawerOpen);
    const favMarked = await page.evaluate(
      () => !!document.querySelector('.food-item-btn[data-food="carrot"]')?.classList.contains('is-favourite')
    );
    check('Favourite food is highlighted for the species', favMarked);

    // Drag the carrot chip onto the bunny.
    const carrot = await page.$('.food-item-btn[data-food="carrot"]');
    const box = await carrot.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(120);
    await page.mouse.move(Math.round(bunnyScreen.x), Math.round(bunnyScreen.y), { steps: 8 });
    await page.mouse.up();
    await sleep(1200);
    const foodInFlight = await page.evaluate(() => window.app.interactions.activeFoods.length);
    check('Dragging food creates an in-flight food item', foodInFlight > 0, `items=${foodInFlight}`);

    await page.waitForFunction(() => window.app.progress.data.totalFeeds > 0, { timeout: 25000 }).catch(() => {});
    const fed = await page.evaluate(() => {
      const a = window.app.animals.find((x) => x.id === 'bunny');
      return {
        feeds: window.app.progress.data.totalFeeds,
        state: a.state,
        action: a.activeActionName
      };
    });
    check('Feeding registers and the animal eats', fed.feeds > 0, JSON.stringify(fed));

    // ---- play (ball toss + chase) ---------------------------------------
    await page.evaluate(() => {
      const fox = window.app.animals.find((a) => a.id === 'fox');
      window.app.interactions.selectAnimal(fox, false);
    });
    await sleep(900);
    await page.click('#btn-card-play');
    await sleep(1500);
    const play = await page.evaluate(() => {
      const fox = window.app.animals.find((a) => a.id === 'fox');
      return {
        ballVisible: !!window.app.ball && window.app.ball.mesh.visible,
        state: fox.state,
        action: fox.activeActionName,
        plays: window.app.progress.data.totalPlays
      };
    });
    check('Play throws the toy ball', play.ballVisible, JSON.stringify(play));
    check('Play puts the animal into play/run', play.state === 'play' || play.state === 'run', play.state);
    check('Play is recorded in progress', play.plays > 0, `plays=${play.plays}`);

    // ---- elephant water play --------------------------------------------
    const elephant = await page.evaluate(() => {
      const el = window.app.animals.find((a) => a.id === 'elephant');
      window.app.interactions.selectAnimal(el, false);
      return el.getClipNames();
    });
    await sleep(700);
    await page.click('#btn-card-play');
    await sleep(900);
    const spray = await page.evaluate(() => {
      const el = window.app.animals.find((a) => a.id === 'elephant');
      return { state: el.state, action: el.activeActionName };
    });
    check('Baby elephant has a unique Spray clip', elephant.includes('Spray'), elephant.join(','));
    check('Elephant water play triggers the spray action', spray.action === 'Spray', JSON.stringify(spray));

    // ---- diary -----------------------------------------------------------
    await page.click('#btn-open-diary');
    await sleep(600);
    const diary = await page.evaluate(() => ({
      open: document.querySelector('#diary-modal').classList.contains('is-open'),
      tiles: document.querySelectorAll('#diary-stats .stat-tile').length,
      achievements: document.querySelectorAll('#achievement-grid .achievement').length,
      unlocked: document.querySelectorAll('#achievement-grid .achievement.is-unlocked').length,
      zones: document.querySelectorAll('.zone-pill.is-visited').length
    }));
    check('Diary opens with stats and achievements', diary.open && diary.tiles >= 6 && diary.achievements >= 8, JSON.stringify(diary));
    check('Exploration progress tracked', diary.zones >= 2, `visited=${diary.zones}`);
    await page.click('[data-close="diary-modal"]');
    await sleep(400);

    // ---- persistence -----------------------------------------------------
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem('nhis_dream_zoo_progress_v1');
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { feeds: d.totalFeeds, pets: d.totalPets, zones: d.visitedZones.length, friends: Object.keys(d.befriendedAnimals).length };
    });
    check('Progress persists to localStorage', !!persisted && persisted.feeds > 0, JSON.stringify(persisted));

    // ---- time of day -----------------------------------------------------
    await page.click('.time-btn[data-time="night"]');
    await sleep(900);
    const night = await page.evaluate(() => ({
      preset: window.app.sceneManager.currentPreset,
      night: window.app.sceneManager.scene.userData.nightFactor,
      exposure: window.app.sceneManager.renderer.toneMappingExposure
    }));
    check('Night mode applies lighting + night factor', night.preset === 'night' && night.night === 1, JSON.stringify(night));

    // ---- secret garden + letter -----------------------------------------
    await page.click('.time-btn[data-time="day"]');
    await page.click('.zone-chip[data-zone="secret_garden"]');
    await sleep(2200);
    await page.evaluate(() => window.app.interactions.openSecretGiftBox());
    await page.waitForFunction(() => document.querySelector('#letter-modal').classList.contains('is-open'), { timeout: 8000 });
    const letter = await page.evaluate(() => ({
      open: document.querySelector('#letter-modal').classList.contains('is-open'),
      unlocked: window.app.progress.data.hasUnlockedSecretGarden,
      text: document.querySelector('.letter-body')?.innerText?.slice(0, 40) || ''
    }));
    check('Gift box opens the heartfelt letter', letter.open && letter.unlocked, JSON.stringify(letter));
    await page.click('[data-close="letter-modal"]');
    await sleep(400);

    // ---- help + photo mode ----------------------------------------------
    await page.click('#btn-help');
    await sleep(500);
    check('Help sheet opens', await page.evaluate(() => document.querySelector('#help-modal').classList.contains('is-open')));

    // Wait until the close button is genuinely top-most and clickable. The open
    // animation is opacity-based, so hit-testing must settle; under software
    // rendering (1-3 fps) that can lag the class change by a few frames.
    const helpHit = await page
      .waitForFunction(
        () => {
          const b = document.querySelector('#help-modal [data-close]');
          if (!b) return false;
          const r = b.getBoundingClientRect();
          const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!(el && (el === b || b.contains(el) || el.contains(b)));
        },
        { timeout: 8000, polling: 100 }
      )
      .then(() => true)
      .catch(() => false);
    const helpButtonAt = await page.evaluate(() => {
      const b = document.querySelector('#help-modal [data-close]');
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { rect: [+r.x.toFixed(0), +r.y.toFixed(0), +r.width.toFixed(0), +r.height.toFixed(0)], top: el ? `${el.tagName}.${el.className}` : 'none' };
    });
    check('Help sheet close button is clickable', helpHit, JSON.stringify(helpButtonAt));

    await page.click('#help-modal [data-close]');
    await page.waitForFunction(() => !document.querySelector('#help-modal').classList.contains('is-open'), { timeout: 6000 }).catch(() => {});
    const helpClosed = await page.evaluate(() => !document.querySelector('#help-modal').classList.contains('is-open'));
    check('Help sheet closes from its own close button', helpClosed, String(helpClosed));
    // Defensive: make sure nothing is left covering the HUD before the next step.
    await page.evaluate(() => document.querySelectorAll('.modal.is-open').forEach((m) => m.classList.remove('is-open')));
    await sleep(300);

    await page.click('#btn-photo-mode');
    await sleep(500);
    const photo = await page.evaluate(() => ({
      open: document.querySelector('#photo-overlay').classList.contains('is-open'),
      hudHidden: document.querySelector('#game-hud').classList.contains('is-hidden')
    }));
    check('Photo mode opens and clears the HUD', photo.open && photo.hudHidden, JSON.stringify(photo));
    await page.click('#btn-exit-photo');
    await sleep(400);

    // ---- audio toggle ----------------------------------------------------
    const audio = await page.evaluate(() => {
      document.querySelector('#btn-sound-toggle').click();
      const muted = window.app.audio.isMuted;
      document.querySelector('#btn-sound-toggle').click();
      return { muted, unmuted: window.app.audio.isMuted };
    });
    check('Audio toggle mutes and unmutes', audio.muted === true && audio.unmuted === false, JSON.stringify(audio));

    // ---- camera never clips through terrain ------------------------------
    const camOk = await page.evaluate(() => {
      const app = window.app;
      const cam = app.sceneManager.camera.position;
      const ground = window.zooDebug.getGroundHeight;
      // Sweep the camera around the whole park and verify the clamp keeps a
      // real clearance above the LOCAL ground, not just some absolute height.
      let worst = Infinity;
      let worstAt = null;
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const r = 12 + (i % 4) * 9;
        cam.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
        app.clampCamera();
        const clearance = cam.y - ground(cam.x, cam.z);
        if (clearance < worst) {
          worst = clearance;
          worstAt = [+cam.x.toFixed(1), +cam.y.toFixed(2), +cam.z.toFixed(1)];
        }
      }
      return { worst: +worst.toFixed(2), worstAt };
    });
    check('Camera clamp keeps a real clearance above the ground', camOk.worst > 0.95, JSON.stringify(camOk));

    // ---- resize ----------------------------------------------------------
    await page.setViewport({ width: 390, height: 844 });
    await sleep(1200);
    const mobile = await page.evaluate(() => {
      const r = window.app.sceneManager.renderer.domElement;
      return {
        aspect: +window.app.sceneManager.camera.aspect.toFixed(3),
        w: r.width,
        touchClass: document.documentElement.classList.contains('is-touch'),
        dockScrollable: document.querySelector('.zone-dock').scrollWidth > 0,
        cardTransform: getComputedStyle(document.querySelector('#animal-card')).transform !== 'none'
      };
    });
    check('Resize updates the camera aspect', Math.abs(mobile.aspect - 390 / 844) < 0.03, JSON.stringify(mobile));
    check('Mobile layout is laid out (dock + bottom-sheet card)', mobile.dockScrollable && mobile.cardTransform);

    // Tap an animal on the small viewport to confirm touch picking works.
    // The card is a bottom sheet here, so the framing is corrected
    // proportionally (measured from the projection) until the animal sits in
    // the clear upper band of the screen.
    let tapTarget = null;
    await page.evaluate(() => window.app.interactions.deselect());
    for (let attempt = 0; attempt < 7; attempt++) {
      await page.evaluate(() => {
        const app = window.app;
        const a = app.animals.find((x) => x.id === 'capybara');
        const V = a.group.position.constructor;
        const cam = app.sceneManager.camera;
        const target = a.getFocusPoint(new V());

        if (!app.__tapFramed) {
          const look = target.clone().add(new V(0, -0.9, 0));
          app.interactions.glideCamera(look.clone().add(new V(0.4, 0.7, 3.4)), look, 0.2);
          app.__tapFramed = true;
          return;
        }

        // Measure where the animal currently lands and nudge the aim so it
        // rises into the top third of the frame.
        const ndc = a.collider.getWorldPosition(new V());
        ndc.project(cam);
        const dist = cam.position.distanceTo(target);
        const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
        const want = 0.42;
        const shift = (want - ndc.y) * halfH;
        app.sceneManager.cameraTarget.y -= shift;
        cam.position.y -= shift * 0.35;
      });
      await page.waitForFunction(() => !window.app.interactions.cameraLerp, { timeout: 40000 }).catch(() => {});
      await sleep(450);
      tapTarget = await page.evaluate(() => {
        const a = window.app.animals.find((x) => x.id === 'capybara');
        const V = a.group.position.constructor;
        const v = a.collider.getWorldPosition(new V());
        v.project(window.app.sceneManager.camera);
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        const onScreen = v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9;
        const el = onScreen ? document.elementFromPoint(x, y) : null;
        return {
          x,
          y,
          ndc: [+v.x.toFixed(2), +v.y.toFixed(2)],
          onScreen,
          inUpperBand: onScreen && y < window.innerHeight * 0.34,
          overCanvas: !!el && el.tagName === 'CANVAS',
          topElement: el ? `${el.tagName}.${el.className || ''}` : 'none'
        };
      });
      if (tapTarget.inUpperBand && tapTarget.overCanvas) break;
    }
    check(
      'Capybara framed above the bottom-sheet card',
      tapTarget.inUpperBand && tapTarget.overCanvas,
      JSON.stringify(tapTarget)
    );
    await page.touchscreen.tap(Math.round(tapTarget.x), Math.round(tapTarget.y));
    await sleep(1600);
    const touchSelect = await page.evaluate(() => {
      const card = document.querySelector('#animal-card');
      return { open: card.classList.contains('is-open'), name: document.querySelector('#card-name').textContent };
    });
    check('Touch tap selects an animal', touchSelect.open && touchSelect.name.includes('Ba'), JSON.stringify(touchSelect));

  } catch (err) {
    console.error('HARNESS ERROR:', err && err.stack ? err.stack : err);
    results.push({ name: 'harness', pass: false, detail: String(err) });
  } finally {
    console.log('\n=== CONSOLE ERRORS (' + consoleErrors.length + ') ===');
    consoleErrors.slice(0, 30).forEach((e) => console.log(' ! ' + e));
    if (consoleWarnings.length) {
      console.log('=== WARNINGS (' + consoleWarnings.length + ') ===');
      consoleWarnings.slice(0, 10).forEach((w) => console.log(' ~ ' + w));
    }
    check('No console errors', consoleErrors.length === 0, `${consoleErrors.length} errors`);

    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
    failed.forEach((f) => console.log('  FAILED: ' + f.name + ' -> ' + f.detail));
    await browser.close();
    process.exit(failed.length ? 1 : 0);
  }
}

run();

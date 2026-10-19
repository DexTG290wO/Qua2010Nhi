/**
 * tools/capture-animals.mjs
 * Renders every species from five angles (front, three-quarter, side, rear and
 * a close-up of the face) so a human can judge the models. Each shot is
 * labelled on screen with the species and the view.
 *
 *   node tools/capture-animals.mjs        (needs `npm run preview`)
 *   node tools/capture-animals.mjs fox    (just one species)
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.ZOO_URL || 'http://localhost:4173/';
const OUT = 'screenshots/animals';

const SPECIES = [
  'bunny', 'capybara', 'otter', 'fox', 'deer',
  'red_panda', 'penguin', 'flamingo', 'elephant', 'lion_cub'
];
const only = process.argv[2];
const list = only ? SPECIES.filter((s) => s === only) : SPECIES;

// angle is measured relative to the animal's facing (0 = straight in front)
const VIEWS = [
  { name: 'front', angle: 0, dist: 1.0, height: 0.28 },
  { name: 'three-quarter', angle: 48, dist: 1.0, height: 0.3 },
  { name: 'side', angle: 90, dist: 1.0, height: 0.26 },
  { name: 'rear', angle: 180, dist: 1.0, height: 0.3 },
  { name: 'face', angle: 22, dist: 0.5, height: 0.05, focusHead: true }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1100,900']
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForFunction(() => !!window.app, { timeout: 40000 });
await page.waitForFunction(() => !document.querySelector('.lz-loading'), { timeout: 40000 });

// Enter exploration and freeze time at a bright, even hour.
await page.evaluate(() => {
  window.app.ui.beginJourney(true);
});
await sleep(3000);
await page.evaluate(() => {
  const btns = document.querySelectorAll('.time-btn');
  btns.forEach((b) => b.classList.toggle('is-active', b.dataset.time === 'day'));
  window.app.sceneManager.setTimeOfDay('day');
  window.app.sky.setTimePreset('day');
  document.querySelector('#game-hud').style.opacity = '0.15';
  // A label so each frame is self-describing when reviewed later.
  const label = document.createElement('div');
  label.id = 'shot-label';
  label.style.cssText =
    'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;' +
    'padding:10px 26px;border-radius:999px;font:600 17px/1.3 Quicksand,sans-serif;' +
    'color:#fff;background:rgba(60,20,50,.72);letter-spacing:.02em;white-space:nowrap';
  document.body.appendChild(label);
});
await sleep(1500);

let shots = 0;
for (const id of list) {
  // Stage the animal on open ground in the plaza, standing still.
  await page.evaluate((id) => {
    const app = window.app;
    const a = app.animals.find((x) => x.id === id);
    a.group.position.set(0, app.sceneManager.camera.position.y * 0, 6);
    // Place it on the ground exactly like the runtime would.
    a.group.position.y = a.targetGroundY(0, 6);
    a.group.rotation.y = 0; // +Z is the animal's front
    a.facing = 0;
    a.setState('idle', 600);
    a.moveTo(a.group.position);
    a.setHovered(false);
    // Hide the others so the shot is about this animal.
    for (const other of app.animals) {
      other.group.visible = other === a;
      other.setHovered(false);
    }
    app.ui.hideAnimalCard();
    document.querySelector('#shot-label').textContent = `${a.name} (${id})`;
  }, id);
  await sleep(1200);

  for (const view of VIEWS) {
    await page.evaluate(
      (view) => {
        const app = window.app;
        const a = app.animals.find((x) => x.id === view.id);
        const V = a.group.position.constructor;
        const focus = view.focusHead
          ? a.getFocusPoint(new V()).add(new V(0, (a.config.colliderHeight || 0.5) * 0.55, 0))
          : a.getFocusPoint(new V());
        const d = Math.max(1.1, (a.config.colliderRadius || 0.4) * 7.5) * view.dist;
        const ang = (view.angle * Math.PI) / 180;
        const cam = new V(
          focus.x + Math.sin(ang) * d,
          focus.y + d * view.height + (view.focusHead ? 0.15 : 0),
          focus.z + Math.cos(ang) * d
        );
        // Aim a touch above the focus point so the head is well framed.
        const look = focus.clone().add(new V(0, view.focusHead ? 0.02 : (a.config.colliderHeight || 0.5) * 0.18, 0));
        app.interactions.glideCamera(cam, look, 0.2);
        document.querySelector('#shot-label').textContent = `${a.name} — ${view.name}`;
      },
      { ...view, id }
    );
    await page.waitForFunction(() => !window.app.interactions.cameraLerp, { timeout: 40000 }).catch(() => {});
    await sleep(900);
    shots++;
    const file = `${OUT}/${id}_${view.name}.png`;
    await page.screenshot({ path: file });
    console.log(`captured ${file}`);
  }
}

console.log(`\n${shots} animal screenshots written to ${OUT}/`);
console.log(errors.length ? `PAGE ERRORS: ${errors.slice(0, 5).join(' | ')}` : 'No page errors during capture.');
await browser.close();

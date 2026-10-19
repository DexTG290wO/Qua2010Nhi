/**
 * tools/capture-gallery.mjs
 * Captures a labelled tour of the site into screenshots/ so a human can review
 * the visuals. Run the preview server first:  npm run preview
 *
 *   node tools/capture-gallery.mjs
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.ZOO_URL || 'http://localhost:4173/';
const OUT = 'screenshots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1600,900']
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

let shot = 0;
async function capture(name, settleMs = 2500) {
  await sleep(settleMs);
  shot++;
  const file = `${OUT}/${String(shot).padStart(2, '0')}_${name}.png`;
  await page.screenshot({ path: file });
  console.log(`captured ${file}`);
}

// Wait for a camera glide to finish (glides are frame-delta driven).
async function settle() {
  await page.waitForFunction(() => !window.app.interactions.cameraLerp, { timeout: 90000 }).catch(() => {});
  await sleep(900);
}

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForFunction(() => !!window.app, { timeout: 40000 });

// 1. Loading screen, caught while the models stream in.
await sleep(700);
await page.screenshot({ path: `${OUT}/00_loading.png` });
console.log(`captured ${OUT}/00_loading.png`);

await page.waitForFunction(() => !document.querySelector('.lz-loading'), { timeout: 60000 });
await capture('intro_title', 2200);

// 2. Cinematic beats
await page.evaluate(() => window.app.ui.beginJourney(false));
await sleep(9000);
await capture('intro_gate_approach', 100);
await sleep(9000);
await capture('intro_flythrough_meadow', 100);
await sleep(14000);
await capture('intro_flythrough_forest', 100);

// 3. Free exploration
await page.evaluate(() => {
  if (window.app.director.isPlaying) window.app.director.skip();
});
await sleep(3000);

const zones = [
  ['meadow_day', 'flower_meadow', 'day'],
  ['grassland_elephant', 'sweet_grassland', 'day'],
  ['lake_capybara_sunset', 'capybara_lake', 'sunset'],
  ['forest_fox_night', 'fairytale_forest', 'night'],
  ['ice_penguin', 'crystal_ice', 'day'],
  ['lotus_flamingo_dawn', 'lotus_pond', 'dawn'],
  ['savanna_lion', 'sunset_savanna', 'sunset'],
  ['secret_garden', 'secret_garden', 'day']
];

for (const [name, zone, time] of zones) {
  await page.evaluate(
    (z, t) => {
      const btn = document.querySelector(`.time-btn[data-time="${t}"]`);
      if (btn) btn.click();
      window.app.teleportToZone(z);
    },
    zone,
    time
  );
  await settle();
  await capture(name, 600);
}

// 4. Animal interaction: card, petting, feeding, playing.
await page.evaluate(() => {
  window.app.teleportToZone('flower_meadow');
});
await settle();
await page.evaluate(() => {
  const a = window.app.animals.find((x) => x.id === 'bunny');
  const V = a.group.position.constructor;
  const t = a.getFocusPoint(new V());
  window.app.interactions.glideCamera(t.clone().add(new V(1.4, 1.6, 3.2)), t, 0.3);
});
await settle();
await page.evaluate(() => {
  const a = window.app.animals.find((x) => x.id === 'bunny');
  window.app.interactions.selectAnimal(a, true);
});
await settle();
await capture('animal_card_bunny', 500);

await page.evaluate(() => window.app.interactions.petCurrentAnimal());
await capture('petting_hearts', 1200);

await page.evaluate(() => window.app.ui.toggleFoodDrawer());
await capture('food_drawer', 900);
await page.evaluate(() => {
  const a = window.app.animals.find((x) => x.id === 'bunny');
  window.app.interactions.feedAnimal(a, 'carrot');
});
await capture('feeding', 2600);

await page.evaluate(() => window.app.interactions.playWithCurrentAnimal());
await capture('playing_ball', 1800);

// 5. Diary, letter, help, photo mode.
await page.evaluate(() => window.app.ui.openDiary());
await capture('diary_achievements', 1200);
await page.evaluate(() => window.app.ui.closeModal(document.querySelector('#diary-modal')));

await page.evaluate(() => {
  window.app.teleportToZone('secret_garden');
});
await settle();
await page.evaluate(() => window.app.interactions.openSecretGiftBox());
await capture('gift_letter', 3000);
await page.evaluate(() => window.app.ui.closeModal(document.querySelector('#letter-modal')));

await page.evaluate(() => window.app.ui.openModal(document.querySelector('#help-modal')));
await capture('help_sheet', 1200);
await page.evaluate(() => window.app.ui.closeModal(document.querySelector('#help-modal')));

await page.evaluate(() => window.app.ui.enterPhotoMode());
await capture('photo_mode', 1200);
await page.evaluate(() => window.app.ui.exitPhotoMode());

// 6. Mobile layout
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await sleep(1500);
await page.evaluate(() => {
  const a = window.app.animals.find((x) => x.id === 'capybara');
  const V = a.group.position.constructor;
  const t = a.getFocusPoint(new V());
  window.app.interactions.glideCamera(t.clone().add(new V(0.6, 1.2, 3.2)), t.add(new V(0, -0.6, 0)), 0.3);
});
await settle();
await capture('mobile_explore', 1200);
await page.evaluate(() => {
  const a = window.app.animals.find((x) => x.id === 'capybara');
  window.app.interactions.selectAnimal(a, true);
});
await settle();
await capture('mobile_card', 900);

console.log(`\n${shot + 1} screenshots written to ${OUT}/`);
if (errors.length) console.log('PAGE ERRORS DURING CAPTURE:', errors.slice(0, 6));
else console.log('No page errors during capture.');
await browser.close();

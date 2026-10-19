/**
 * tools/verify-fallback.mjs
 * Proves the "no model, no problem" path: hides one .glb, loads the site, and
 * asserts that species still has a working procedural rig, clips and running
 * skeletal animation - then restores the file.
 *
 *   node tools/verify-fallback.mjs      (needs `npm run preview`)
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.ZOO_URL || 'http://localhost:4173/';
/**
 * The preview server serves `dist/`, so the model must be hidden in BOTH the
 * source folder and the built output to simulate a real failed download.
 */
const VICTIMS = ['public/models/bunny.glb', 'dist/models/bunny.glb']
  .map((p) => path.resolve(p))
  .filter((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

for (const v of VICTIMS) fs.renameSync(v, `${v}.hidden`);
console.log(`hid bunny.glb in ${VICTIMS.length} location(s) to simulate a failed download\n`);

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => !!window.app, { timeout: 40000 });
  // The loading screen must still lift (hard cap) even with a missing asset.
  await page.waitForFunction(() => !document.querySelector('.lz-loading'), { timeout: 30000 });
  check('Loading screen still lifts with a missing model', true);

  await sleep(9000);
  const state = await page.evaluate(() => {
    const a = window.app.animals.find((x) => x.id === 'bunny');
    const others = window.app.animals.filter((x) => x.id !== 'bunny' && x.loadedFromGLB).length;
    return {
      fromGLB: !!a.loadedFromGLB,
      skinned: a.meshes.some((m) => m.isSkinnedMesh),
      bones: a.skeleton ? a.skeleton.bones.length : 0,
      clips: a.getClipNames().length,
      action: a.activeActionName,
      othersFromGLB: others
    };
  });
  check('Bunny falls back to its procedural rig (not GLB)', !state.fromGLB && state.skinned, JSON.stringify(state));
  check('Fallback rig still has its skeleton and clips', state.bones > 10 && state.clips >= 8, `bones=${state.bones} clips=${state.clips}`);
  check('Fallback rig is animating (a clip is playing)', !!state.action, String(state.action));
  check('Other species still loaded their .glb', state.othersFromGLB >= 8, `others=${state.othersFromGLB}`);

  // And the world must still be interactive.
  await page.click('#btn-skip-intro');
  await page.waitForFunction(() => document.querySelector('#game-hud').classList.contains('is-ready'), { timeout: 30000 });
  await page.evaluate(() => {
    const a = window.app.animals.find((x) => x.id === 'bunny');
    window.app.interactions.selectAnimal(a, false);
  });
  await sleep(900);
  await page.click('#btn-card-pet');
  await sleep(900);
  const pet = await page.evaluate(() => {
    const a = window.app.animals.find((x) => x.id === 'bunny');
    return { state: a.state, action: a.activeActionName, friendship: window.app.progress.getFriendship('bunny') };
  });
  check('Fallback animal still responds to petting', pet.state === 'pet' && pet.friendship > 0, JSON.stringify(pet));

  const deform = await page.evaluate(async () => {
    const a = window.app.animals.find((x) => x.id === 'bunny');
    a.setState('walk', 30);
    const sample = () => a.bones.map((b) => b.quaternion.x.toFixed(4)).join(',');
    const first = sample();
    await new Promise((r) => setTimeout(r, 1500));
    return first !== sample();
  });
  check('Fallback skeleton is genuinely animating', deform);

  check('No page errors with a missing model', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (err) {
  console.error('HARNESS ERROR:', err);
  failures++;
} finally {
  if (browser) await browser.close();
  for (const v of VICTIMS) {
    if (fs.existsSync(`${v}.hidden`)) fs.renameSync(`${v}.hidden`, v);
  }
  console.log(`\nrestored bunny.glb (${VICTIMS.length} location(s))`);
  console.log(failures === 0 ? 'FALLBACK VERIFICATION: ALL PASS' : `FALLBACK VERIFICATION: ${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
}

/**
 * tools/capture-models.mjs
 * Isolated model turntable screenshots using tools/model-viewer.html.
 *
 *   node tools/capture-models.mjs [species ...]
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.MODEL_VIEWER_URL || 'http://localhost:5199/tools/model-viewer.html';
const OUT = 'screenshots/models';
const SPECIES = ['bunny', 'capybara', 'otter', 'fox', 'deer', 'red_panda', 'penguin', 'flamingo', 'elephant', 'lion_cub'];
const VIEWS = ['side', 'three-quarter', 'front', 'rear', 'face'];
const only = process.argv.slice(2);
const list = only.length ? only : SPECIES;

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 760, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });

for (const id of list) {
  for (const view of VIEWS) {
    const head = view === 'face' ? '&head=1' : '';
    const url = `${BASE}?id=${id}&angle=${view === 'face' ? 'three-quarter' : view}${head}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 300));
    const file = path.join(OUT, `${id}_${view}.png`);
    await page.screenshot({ path: file });
    console.log('captured', file);
  }
}
await browser.close();

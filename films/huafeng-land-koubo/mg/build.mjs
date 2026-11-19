// 把 mg/cards.html 的每張卡輸出成 1080×1920 透明 PNG（mg/<id>.png）。
// 用法：node mg/build.mjs   （需要 playwright；雲端環境已內建 Chromium）
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ids = ['hf_hook', 'hf_lot', 'hf_spec', 'hf_street', 'hf_area', 'hf_price', 'hf_cta'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const id of ids) {
  await page.goto(pathToFileURL(path.join(dir, 'cards.html')).href + '?card=' + id);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await page.screenshot({ path: path.join(dir, id + '.png'), omitBackground: true });
  console.log('✓', id);
}
await browser.close();

// Contact sheet from screenshots: node scripts/deck-sheet.mjs <out.png> <cols> <height px per image> <img> [img...]
// Each image may be "path=caption".
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [, , out, cols, hpx, ...imgs] = process.argv;
const cells = imgs.map((a) => {
  const [path, cap = ''] = a.split('=');
  return `<figure><img src="data:image/png;base64,${readFileSync(path).toString('base64')}"><figcaption>${cap}</figcaption></figure>`;
});
const html = `<html><body style="margin:0;background:#222;font:14px sans-serif;color:#ddd"><div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:10px;padding:10px;justify-content:start">${cells.join('')}</div><style>figure{margin:0}img{height:${hpx}px;display:block}figcaption{padding:3px 0}</style></body></html>`;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.setContent(html);
await p.waitForTimeout(200);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(out);

// Contact sheet of a folder of PNGs. node sheet.mjs dir out.png [cols] [tileWidth]
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const [dir, out, cols = '3', tw = '420'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('sheet')).sort();
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: +cols * (+tw + 4) + 4, height: 400 } });
await p.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:4px;padding:4px">${files.map((f) => `<div style="position:relative"><img src="data:image/png;base64,${fs.readFileSync(`${dir}/${f}`).toString('base64')}" style="width:${tw}px;display:block"><span style="position:absolute;left:4px;top:4px;color:#fff;font:12px sans-serif;text-shadow:0 1px 2px #000">${f}</span></div>`).join('')}</body>`);
await p.waitForTimeout(200);
await p.screenshot({ path: out, fullPage: true });
await b.close();

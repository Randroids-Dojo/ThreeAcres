// Run setup js then print the result of an expression: node scripts/deck-eval.mjs <setup.js> "<expr>" [w h]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [, , file, expr, w = '412', h = '900'] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await p.goto('http://localhost:5252/?game=deck&fresh');
await p.waitForFunction(() => window.deck && window.deck.frames() > 5);
if (file !== '-') await p.evaluate(readFileSync(file, 'utf8'));
console.log(JSON.stringify(await p.evaluate(expr), null, 1));
await b.close();

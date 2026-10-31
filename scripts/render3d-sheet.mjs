// Tiles screenshots into one labelled sheet: node scripts/render3d-sheet.mjs out.png cols width a.png b.png ...
import { writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { launch } from './render3d-lib.mjs';

const [out, colsArg, widthArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg) || 3;
const width = Number(widthArg) || 1800;
const html = `<html><body style="margin:0;background:#1d1d1d;font:13px ui-monospace,monospace;color:#eee">
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">
${files.map((f) => `<figure style="margin:0"><img style="width:100%;display:block" src="file://${resolve(f)}"><figcaption>${basename(f, '.png')}</figcaption></figure>`).join('\n')}
</div></body></html>`;
const tmp = resolve(dirname(out), `.sheet-${Date.now()}.html`);
writeFileSync(tmp, html);
const b = await launch();
const p = await b.newPage({ viewport: { width, height: 800 } });
await p.goto(`file://${tmp}`);
await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: true });
await b.close();

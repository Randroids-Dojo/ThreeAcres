// One screenshot of the ranch from the play camera.
// node scripts/ranch-shot.mjs out.png [w h dpr] [query] [js to run first]
import { launch, openRanch, frames } from './ranch-lib.mjs';

const [out = '/tmp/ranch/shot.png', w = '1280', h = '800', dpr = '1', query = '', pre = ''] = process.argv.slice(2);
const b = await launch();
const { page, problems } = await openRanch(b, { width: +w, height: +h, dpr: +dpr, touch: query.includes('touch'), query });
if (pre) await page.evaluate(pre);
await frames(page, 30);
await page.screenshot({ path: out });
console.log(JSON.stringify(await page.evaluate(() => window.ranch.renderInfo())));
if (problems.length) console.log(problems.slice(0, 10).join('\n'));
await b.close();

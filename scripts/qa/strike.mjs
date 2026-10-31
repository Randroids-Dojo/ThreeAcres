// Ruled lines through text, measured. Paper in these games is ruled with
// background gradients (journal pages, the ledger, almanac pages); when a rule
// lands across the middle of a line of text it reads as struck through. This
// finds every element with a horizontal gradient line, works out where each
// line falls (offset, period, the padding box), and reports any that cross
// the middle band of a line of text inside that element.
//
// Use from a check: `const hits = await page.evaluate(strikeScan)`.

export function strikeScan() {
  // Rotations move a sheet's rules and its text together; measure them flat.
  const flat = document.createElement('style');
  flat.textContent = '*, *::before, *::after { transform: none !important; transition: none !important; animation: none !important; rotate: none !important; }';
  document.head.append(flat);

  const split = (s) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const alphaOf = (c) => {
    if (/transparent/.test(c)) return 0;
    const m = /rgba?\(([^)]*)\)/.exec(c);
    if (!m) return 1;
    const p = m[1].split(/[ ,/]+/).filter(Boolean);
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  };
  const visible = (e) => {
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };

  const hits = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (!cs.backgroundImage.includes('linear-gradient')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
    if (!visible(e)) continue;
    const top0 = r.top + parseFloat(cs.borderTopWidth);
    const h = r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    const layers = split(cs.backgroundImage);
    const posY = split(cs.backgroundPositionY);
    const ys = [];
    layers.forEach((layer, i) => {
      const m = /^(repeating-)?linear-gradient\((.*)\)$/.exec(layer);
      if (!m) return;
      const args = split(m[2]);
      if (/deg|^to /.test(args[0])) {
        if (!/^(180deg|to bottom)$/.test(args[0])) return;
        args.shift();
      }
      // Stops as [alpha, colour, position]; a stop with two positions counts twice.
      const stops = [];
      for (const a of args) {
        const pos = [...a.matchAll(/(-?[\d.]+)px/g)].map((q) => parseFloat(q[1]));
        const colour = a.replace(/\s*-?[\d.]+(px|%)/g, '').trim();
        if (/%/.test(a)) return;
        for (const p of pos.length ? pos : [NaN]) stops.push([alphaOf(colour), colour, p]);
      }
      if (stops.some((s) => Number.isNaN(s[2]))) return;
      const period = stops[stops.length - 1][2];
      const p0 = posY[i] ?? posY[0] ?? '0px';
      const off = p0.endsWith('px') ? parseFloat(p0) : 0;
      for (let k = 0; k + 1 < stops.length; k++) {
        const [a1, c1, y1] = stops[k];
        const [a2, c2, y2] = stops[k + 1];
        if (a1 < 0.12 || a2 < 0.12 || c1 !== c2 || y2 - y1 <= 0 || y2 - y1 > 3) continue;
        if (m[1] && period > 4) {
          for (let base = off % period - period; base < h; base += period) {
            const y = base + y1;
            if (y >= 0 && y <= h) ys.push(top0 + y);
          }
        } else if (off + y1 >= 0 && off + y1 <= h) ys.push(top0 + off + y1);
      }
    });
    if (!ys.length) continue;
    const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      // Text on its own painted backing (a note pinned on the ruled paper) is not on these rules.
      let covered = false;
      for (let a = n.parentElement; a && a !== e; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (alphaOf(s.backgroundColor) >= 0.5 || s.backgroundImage !== 'none') covered = true;
      }
      if (covered) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        if (q.height < 5 || q.width < 2) continue;
        // The struck band: from the tops of the capitals to just above the
        // baseline. Words resting on a rule (about 74% down) are fine.
        const lo = q.top + q.height * 0.28;
        const hi = q.bottom - q.height * 0.3;
        const y = ys.find((v) => v > lo && v < hi);
        if (y !== undefined) hits.push({ in: e.className || e.tagName, text: n.textContent.trim().slice(0, 28), at: Math.round(((y - q.top) / q.height) * 100) });
      }
    }
  }
  flat.remove();
  return hits;
}

// Seedbound's shared page checks, run in the browser with page.evaluate:
// what lies in the shell's corner, and what of each hand card's name and rule
// is uncovered. Used by deck-overlap.mjs and deck-lessons.mjs.

/** Everything in the shell's corner that is not the shell's button: text, pictures, buttons and panels. */
export function cornerScan() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);width:0;height:0';
  document.body.append(probe);
  const at = probe.getBoundingClientRect();
  probe.remove();
  const box = { r: 60 + at.left, b: 60 + at.top };
  const roots = [document.querySelector('.sb-detail.on'), document.querySelector('.sb-sheets.on')].filter(Boolean);
  const root = roots[0] ?? document.querySelector('.sb');
  const shown = (e) => {
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  const out = [];
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('.shellbtn')) continue;
    const st = getComputedStyle(e);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const thing = own || ['IMG', 'CANVAS', 'BUTTON', 'svg'].includes(e.tagName) || st.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(st.backgroundColor);
    if (!thing || !shown(e)) continue;
    // Backdrops that fill the screen behind a sheet are not content.
    if (e.matches('.sb-table, .sb-night, .sb-fx, .sb-sheets, .sb-detail, .sb-hand')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // A canvas: only what is painted counts. The board's plate starts well below the corner, so its box is enough.
    if (r.left < box.r - 1 && r.top < box.b - 1 && r.right > 1 && r.bottom > 1) out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.textContent ?? '').trim().slice(0, 20)}" at ${Math.round(r.left)},${Math.round(r.top)}`);
  }
  return out;
}

/** For each card in the hand: the share of points across its name, and across its rule's pictures, where it is the card on top. */
export function handScan() {
  const out = [];
  for (const el of document.querySelectorAll('.sb-hand .sb-card:not(.flying)')) {
    const nb = el.dataset.namebox?.split(',').map(Number);
    const rb = el.dataset.rulebox?.split(',').map(Number);
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    const m = new DOMMatrix(getComputedStyle(el).transform);
    const host = el.offsetParent.getBoundingClientRect();
    const toPage = (x, y) => {
      const q = m.transformPoint(new DOMPoint(x - W / 2, y - H));
      return [host.left + el.offsetLeft + W / 2 + q.x, host.top + el.offsetTop + H + q.y];
    };
    const seen = (b) => {
      if (!b) return 0;
      let n = 0;
      let ok = 0;
      for (const fx of [0.04, 0.2, 0.35, 0.5, 0.65, 0.8, 0.96]) {
        for (const fy of [0.25, 0.5, 0.75]) {
          const [x, y] = toPage(((b[0] + b[2] * fx) / 100) * W, ((b[1] + b[3] * fy) / 140) * H);
          n++;
          if (y < innerHeight && document.elementFromPoint(x, y)?.closest('.sb-card') === el) ok++;
        }
      }
      return ok / n;
    };
    out.push({ name: el.dataset.name, nameSeen: seen(nb), ruleSeen: seen(rb), px: nb ? +(nb[4] * (W / 100)).toFixed(1) : 0, w: W });
  }
  return out;
}


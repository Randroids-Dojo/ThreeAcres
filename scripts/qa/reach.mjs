// Can a finger reach every control it can see? For each visible button, this
// asks the browser what a tap would land on at five points across it (the
// middle and four points inset a quarter of the way in) and reports any point
// where something else is on top. It catches what a box overlap check cannot:
// an invisible touch zone (a walk stick's capture area, a transparent layer)
// lying over a control the player can plainly see.
//
// Use from a check: `const hits = await page.evaluate(reachScan, 'button')`.

export function reachScan(selector = 'button') {
  const shown = (e) => {
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  const name = (e) => {
    const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}${t ? ` "${t}"` : ''}`;
  };
  const out = [];
  for (const e of document.querySelectorAll(selector)) {
    if (e.disabled || !shown(e) || getComputedStyle(e).pointerEvents === 'none') continue;
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const pts = [
      [0.5, 0.5],
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ];
    for (const [fx, fy] of pts) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === e || e.contains(top))) continue;
      out.push({ control: name(e), at: `${Math.round(fx * 100)}%,${Math.round(fy * 100)}%`, under: top ? name(top) : 'nothing' });
      break;
    }
  }
  return out;
}

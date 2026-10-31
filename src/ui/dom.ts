// Tiny DOM helpers. Text and class updates skip the DOM when nothing changed,
// so the HUD can refresh every frame cheaply.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const texts = new WeakMap<Element, string>();
export function setText(e: Element, t: string): void {
  if (texts.get(e) === t) return;
  texts.set(e, t);
  e.textContent = t;
}

const htmls = new WeakMap<Element, string>();
export function setHtml(e: Element, h: string): void {
  if (htmls.get(e) === h) return;
  htmls.set(e, h);
  e.innerHTML = h;
}

export function toggle(e: Element, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function clock(minute: number): string {
  const total = 6 * 60 + Math.floor(minute);
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

export function mins(seconds: number): string {
  if (seconds < 60) return seconds < 5 ? '' : `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

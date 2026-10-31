// The mix: the three presets and every axis on its own switch, how long you
// have played each option, and a notes box stamped with the current mix. This
// is the lab where the player finds the farming game they like best.

import type { UiCue } from '../contract';
import type { Note } from '../game/save';
import { AXES, AXIS_INFO, matchPreset, PRESET_IDS, PRESETS } from '../sim/presets';
import type { Axis, Rules, WorldState } from '../sim/types';
import { el, esc, mins, setText, toggle } from './dom';
import { icon } from './icons';

export interface MixerHost {
  state(): WorldState;
  setRules(patch: Partial<Rules>): void;
  cue(c: UiCue): void;
  notes(): Note[];
  saveNotes(n: Note[]): void;
  onClose(): void;
}

export function mixName(r: Rules): string {
  const p = matchPreset(r);
  if (p) return PRESETS[p].name;
  return AXES.map((a) => AXIS_INFO[a].options.find((o) => o.value === r[a])?.label ?? r[a]).join(', ');
}

export class Mixer {
  readonly root = el('div', 'card sheet');
  readonly scrim = el('div', 'scrim');
  private which = el('span', 'which');
  private presets = el('div', 'presets');
  private axes = el('div', 'axes');
  private notesList = el('div', 'list');
  private text = el('textarea');
  open = false;
  private key = '';

  constructor(private host: MixerHost) {
    const head = el('header');
    const close = el('button', 'btn iconbtn', `<span class="ic">${icon('close')}</span>`);
    close.title = 'Close (Esc)';
    close.onclick = () => this.close();
    const title = el('div');
    title.append(el('h2', '', 'The mix'), this.which);
    head.append(title, close);

    const body = el('div', 'body');
    const legend = el('p', 'legend', 'Pick one of the three games, or change any switch on its own. The farm carries on either way. Numbers show how long you have played each option.');
    for (const id of PRESET_IDS) {
      const p = PRESETS[id];
      const b = el('button', 'preset', `<b>${esc(p.name)}</b><span>${esc(p.line)}</span><span class="t"></span>`);
      b.dataset.preset = id;
      b.onclick = () => {
        host.setRules({ ...p.rules });
        host.cue('preset');
      };
      this.presets.append(b);
    }
    for (const a of AXES) {
      const info = AXIS_INFO[a];
      const row = el('div', 'axis');
      const top = el('div', 'top');
      const seg = el('div', 'seg');
      for (const o of info.options) {
        const b = el('button', '', `${esc(o.label)}<small></small>`);
        b.dataset.axis = a;
        b.dataset.value = o.value;
        b.title = o.hint;
        b.onclick = () => {
          host.setRules({ [a]: o.value } as Partial<Rules>);
          host.cue('toggle');
        };
        seg.append(b);
      }
      top.append(el('span', 'name', info.name), seg);
      row.append(top, el('div', 'hint'));
      row.dataset.axis = a;
      this.axes.append(row);
    }

    const notes = el('div', 'notesbox');
    this.text.placeholder = 'What felt good about this mix? What dragged?';
    this.text.addEventListener('keydown', (e) => e.stopPropagation());
    const save = el('button', 'btn primary', `<span class="ic">${icon('notes')}</span>Save note`);
    save.onclick = () => this.saveNote();
    const copy = el('button', 'btn', `<span class="ic">${icon('copy')}</span>Copy all`);
    copy.onclick = () => this.copyNotes(copy);
    const row = el('div', 'row');
    row.append(save, copy);
    notes.append(el('h4', '', 'Lab notes'), this.text, row, this.notesList);

    body.append(legend, this.presets, this.axes, notes);
    this.root.append(head, body);
    this.scrim.onclick = () => this.close();
  }

  show(): void {
    this.open = true;
    toggle(this.root, 'on', true);
    toggle(this.scrim, 'on', window.innerWidth < 640);
    this.renderNotes();
    this.update();
    this.host.cue('open');
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    toggle(this.root, 'on', false);
    toggle(this.scrim, 'on', false);
    this.host.cue('close');
    this.host.onClose();
  }

  /** Called every frame while open, and when the rules change. */
  update(): void {
    if (!this.open) return;
    const s = this.host.state();
    const r = s.rules;
    const p = matchPreset(r);
    const play = s.stats.playtime;
    const key = `${JSON.stringify(r)}|${Math.floor(s.time / 5)}`;
    if (key === this.key) return;
    this.key = key;
    setText(this.which, p ? `Playing ${PRESETS[p].name}` : 'A custom mix');
    for (const b of this.presets.querySelectorAll<HTMLElement>('.preset')) {
      const id = b.dataset.preset as keyof typeof PRESETS;
      toggle(b, 'on', id === p);
      setText(b.querySelector('.t')!, mins(play[`preset:${id}`] ?? 0));
    }
    for (const b of this.axes.querySelectorAll<HTMLElement>('.seg button')) {
      const a = b.dataset.axis as Axis;
      toggle(b, 'on', r[a] === b.dataset.value);
      setText(b.querySelector('small')!, mins(play[`${a}:${b.dataset.value}`] ?? 0));
    }
    for (const row of this.axes.querySelectorAll<HTMLElement>('.axis')) {
      const a = row.dataset.axis as Axis;
      const o = AXIS_INFO[a].options.find((x) => x.value === r[a]);
      setText(row.querySelector('.hint')!, o?.hint ?? '');
    }
  }

  private saveNote(): void {
    const text = this.text.value.trim();
    if (!text) return;
    const s = this.host.state();
    const notes = this.host.notes();
    notes.push({ at: Date.now(), day: s.day, rules: { ...s.rules }, text });
    this.host.saveNotes(notes);
    this.text.value = '';
    this.renderNotes();
    this.host.cue('star');
  }

  private renderNotes(): void {
    const notes = this.host.notes().slice().reverse();
    this.notesList.innerHTML = notes.length
      ? notes.map((n) => `<div class="note"><span>${esc(n.text)}</span><span class="mix">Day ${n.day}, ${esc(mixName(n.rules))}</span></div>`).join('')
      : '<p class="legend">Notes you save here keep the mix you were playing, so you can compare later.</p>';
  }

  private copyNotes(btn: HTMLElement): void {
    const s = this.host.state();
    const lines = this.host.notes().map((n) => `Day ${n.day} [${mixName(n.rules)}]: ${n.text}`);
    const play = Object.entries(s.stats.playtime)
      .filter(([, v]) => v >= 30)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${mins(v)}`);
    const text = `Three Acres lab notes\n\n${lines.join('\n') || '(no notes yet)'}\n\nTime played\n${play.join('\n')}`;
    void navigator.clipboard?.writeText(text).then(
      () => {
        btn.lastChild!.textContent = 'Copied';
        setTimeout(() => (btn.lastChild!.textContent = 'Copy all'), 1500);
      },
      () => undefined,
    );
  }
}

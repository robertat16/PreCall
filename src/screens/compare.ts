import type { Metric, Status } from '../audio/analysis';
import { gradeFor } from '../audio/analysis';
import type { Screen } from '../router';
import { getEntry, type HistoryEntry } from '../store';
import { scoreRing, scoreStatus, topbar } from '../ui/components';
import { h } from '../ui/dom';
import { relTime } from './home';

const RANK: Record<Status, number> = { poor: 0, fair: 1, good: 2, great: 3 };

function metricsOf(e: HistoryEntry): Metric[] {
  const echo: Metric[] = e.echo ? [{ id: 'echo', label: 'Echo leak', value: e.echo.label, status: e.echo.status, detail: e.echo.detail }] : [];
  return [...(e.mic?.metrics ?? []), ...echo, ...(e.camera?.metrics ?? [])];
}

/** Side-by-side comparison of two saved results (e.g. two headsets). */
export const compareScreen: Screen = ({ root, back, params, nav }) => {
  const a = getEntry(params[0] ?? '');
  const b = getEntry(params[1] ?? '');
  const body = h('main', { class: 'screen' });
  root.append(topbar('Compare', back), body);
  if (!a || !b) {
    body.append(h('div', { class: 'empty' }, 'One of these results no longer exists.'), h('button', { class: 'btn secondary block', onclick: () => nav('history', true) }, 'Back to history'));
    return;
  }
  // older on the left
  const [l, r] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
  const side = (e: HistoryEntry, tag: string) =>
    h('div', { class: 'side' },
      h('div', { class: 'tag' }, tag),
      scoreRing(e.score, e.mic && !e.mic.voiceDetected ? 'No voice' : gradeFor(e.score), false),
      h('div', { class: 'dev', title: e.device }, e.device),
      h('div', { class: 'when' }, relTime(e.createdAt)));

  const diff = r.score - l.score;
  const winner = diff > 0 ? r : l;
  const loser = diff > 0 ? l : r;
  const clar = (e: HistoryEntry) => e.mic?.metrics.find((m) => m.id === 'clarity')?.value.split(' · ')[0]?.toLowerCase();
  const wc = clar(winner);
  const lc = clar(loser);
  const verdict =
    Math.abs(diff) < 4
      ? `These two ${l.mic && r.mic ? 'sound' : 'score'} about the same.`
      : `${winner.device} ${winner.mic ? 'sounds' : 'looks'} better by ${Math.abs(diff)} points${wc && lc && wc !== lc ? `: ${wc} vs ${lc} audio` : ''}.`;

  const lm = new Map(metricsOf(l).map((m) => [m.id, m]));
  const rm = new Map(metricsOf(r).map((m) => [m.id, m]));
  const ids = [...new Set([...lm.keys(), ...rm.keys()])];
  const gap = (id: string) => Math.abs((lm.get(id) ? RANK[lm.get(id)!.status] : -1) - (rm.get(id) ? RANK[rm.get(id)!.status] : -1));
  ids.sort((p, q) => gap(q) - gap(p));
  const table = h('div', { class: 'card tight' });
  for (const id of ids) {
    const x = lm.get(id);
    const y = rm.get(id);
    const label = (x ?? y)!.label;
    const xs = x ? RANK[x.status] : -1;
    const ys = y ? RANK[y.status] : -1;
    const cell = (m: Metric | undefined, win: boolean) =>
      h('div', { class: `v ${win ? 'win' : ''}` }, m ? h('span', { class: `sd st-${m.status}` }) : null, h('span', { style: 'min-width:0;overflow:hidden;text-overflow:ellipsis' }, m ? (m.value.includes('Hz') ? m.value.split(' · ')[0] : m.value.replace(' · ', ' ')) : '—'));
    table.append(h('div', { class: 'cmp-row' }, h('div', { class: 'lab' }, label), cell(x, xs > ys), cell(y, ys > xs)));
  }

  body.append(
    h('div', { class: 'card' }, h('div', { class: 'cmp-head' }, side(l, 'A'), side(r, 'B')), h('p', { class: `center c-${scoreStatus(Math.max(l.score, r.score))}`, style: 'margin:14px 0 0;font-weight:600' }, verdict)),
    table,
    h('div', { class: 'footer-note' }, 'Bold values are the better of the two.'),
  );
};

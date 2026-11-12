import type { Screen } from '../router';
import { clearHistory, deleteEntry, getEntry, getHistory, type HistoryEntry } from '../store';
import { scoreRing, scoreStatus, topbar } from '../ui/components';
import { clear, h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { gradeFor } from '../audio/analysis';
import { cameraReportView } from './camera';
import { echoStatusScore, micDetailsView } from './micflow';
import { relTime } from './home';
export { KIND_LABEL };

const KIND_LABEL: Record<HistoryEntry['kind'], string> = { full: 'Full check', mic: 'Test call', camera: 'Camera' };

export function topIssue(e: HistoryEntry): string {
  const ms = [...(e.mic?.metrics ?? []), ...(e.camera?.metrics ?? [])];
  const worst = ms.find((m) => m.status === 'poor') ?? ms.find((m) => m.status === 'fair');
  return worst ? `${worst.label}: ${worst.value.split(' · ')[0]}` : '';
}

export const historyScreen: Screen = ({ root, back, nav }) => {
  const body = h('main', { class: 'screen' });
  let armed = false;
  let compare = false;
  let picked: string[] = [];
  const clearBtn = h('button', { class: 'icon-btn', 'aria-label': 'Clear history' }, icon('trash'));
  root.append(topbar('History', back, clearBtn), body);

  const pick = (id: string) => {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
    if (picked.length === 2) {
      const [a, b] = picked;
      compare = false;
      picked = [];
      nav(`compare/${a}/${b}`);
      return;
    }
    render();
  };

  const render = () => {
    clear(body);
    const list = getHistory();
    clearBtn.style.visibility = list.length ? 'visible' : 'hidden';
    if (list.length >= 2) {
      body.append(compare
        ? h('div', { class: 'notice info' }, icon('info'), h('div', { class: 'grow' }, picked.length ? 'Now pick the second result.' : 'Pick two results to compare side by side.'), h('button', { class: 'btn ghost', style: 'min-height:32px;padding:0 6px', onclick: () => { compare = false; picked = []; render(); } }, 'Cancel'))
        : h('button', { class: 'btn secondary block', onclick: () => { compare = true; render(); } }, icon('ab'), 'Compare two results'));
    }
    if (!list.length) {
      body.append(h('div', { class: 'empty' }, icon('history'), h('div', { style: 'font-weight:600;color:var(--text)' }, 'No results yet'), h('div', { class: 'small' }, 'Your test results will show up here so you can compare headsets and setups.'),
        h('div', { style: 'height:16px' }), h('button', { class: 'btn primary', onclick: () => nav('check') }, 'Run a full check')));
      return;
    }
    for (const e of list) {
      const st = scoreStatus(e.score);
      body.append(h('button', { class: 'hist-item', 'aria-pressed': compare ? String(picked.includes(e.id)) : null, onclick: () => (compare ? pick(e.id) : nav(`report/${e.id}`)) },
        h('div', { class: `sc c-${st}` }, String(e.score)),
        h('div', { class: 'meta' }, h('div', { class: 't' }, KIND_LABEL[e.kind] ?? 'Result'), h('div', { class: 's' }, [e.device, topIssue(e), relTime(e.createdAt)].filter(Boolean).join(' · '))),
        compare ? h('span', { class: `pick ${picked.includes(e.id) ? 'on' : ''}`, 'aria-hidden': 'true' }, picked.includes(e.id) ? icon('check') : null) : icon('chevron')));
    }
  };

  clearBtn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      toast('Tap again to delete all results');
      setTimeout(() => (armed = false), 3000);
      return;
    }
    clearHistory();
    armed = false;
    toast('History cleared');
    render();
  });
  render();
};

export const reportScreen: Screen = ({ root, back, params, nav }) => {
  const e = getEntry(params[0] ?? '');
  const body = h('main', { class: 'screen' });
  const del = h('button', { class: 'icon-btn', 'aria-label': 'Delete this result' }, icon('trash'));
  root.append(topbar(e ? KIND_LABEL[e.kind] : 'Result', back, e ? del : undefined), body);
  if (!e) {
    body.append(h('div', { class: 'empty' }, 'This result no longer exists.'), h('button', { class: 'btn secondary block', onclick: () => nav('history', true) }, 'Back to history'));
    return;
  }
  let armed = false;
  del.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      toast('Tap again to delete this result');
      setTimeout(() => (armed = false), 3000);
      return;
    }
    deleteEntry(e.id);
    toast('Deleted');
    nav('history', true);
  });

  const when = new Date(e.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const voice = e.mic ? e.mic.voiceDetected : true;
  body.append(h('div', { class: 'card' },
    h('div', { class: 'score-wrap' },
      scoreRing(e.score, voice ? gradeFor(e.score) : 'No voice', false),
      h('h2', null, e.mic?.headline ?? e.camera?.headline ?? ''),
      h('p', null, e.mic?.summary ?? e.camera?.summary ?? '')),
    h('div', { class: 'footer-note' }, `${e.device}${e.mic ? (e.processing ? ' · call processing on' : ' · call processing off') : ''} · ${when}`)));
  if (e.kind === 'full') {
    const rows: HTMLElement[] = [];
    if (e.mic) rows.push(h('div', { class: 'summary-row' }, h('div', { class: 'ico' }, icon('mic')), h('div', { class: 'g' }, h('div', { class: 't' }, 'Microphone'), h('div', { class: 's' }, e.mic.headline)), h('div', { class: `n c-${scoreStatus(e.mic.score)}` }, String(e.mic.score))));
    if (e.echo) rows.push(h('div', { class: 'summary-row' }, h('div', { class: 'ico' }, icon('speaker')), h('div', { class: 'g' }, h('div', { class: 't' }, 'Echo'), h('div', { class: 's' }, e.echo.label)), h('div', { class: `n c-${scoreStatus(echoStatusScore(e.echo)!)}` }, String(echoStatusScore(e.echo)))));
    if (e.camera) rows.push(h('div', { class: 'summary-row' }, h('div', { class: 'ico' }, icon('camera')), h('div', { class: 'g' }, h('div', { class: 't' }, 'Camera'), h('div', { class: 's' }, e.camera.headline)), h('div', { class: `n c-${scoreStatus(e.camera.score)}` }, String(e.camera.score))));
    body.append(...rows);
  }
  if (e.mic) body.append(micDetailsView(e.mic, e.echo));
  if (e.camera) body.append(e.kind === 'camera' ? cameraReportView(e.camera).lastElementChild as HTMLElement : cameraReportView(e.camera));
};

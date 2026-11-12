import type { Screen } from '../router';
import { getHistory } from '../store';
import { scoreStatus } from '../ui/components';
import { h } from '../ui/dom';
import { icon, logo, orb, type IconName } from '../ui/icons';

export const homeScreen: Screen = ({ root, nav }) => {
  const last = getHistory()[0];
  const tile = (path: string, ic: IconName, t: string, s: string, cls = '') =>
    h('button', { class: `tile ${cls}`, onclick: () => nav(path) }, h('div', { class: 'ico' }, icon(ic)), h('div', { class: 't' }, t), h('div', { class: 's' }, s));

  root.append(
    h('div', { class: 'brand' }, logo(), h('div', { class: 'name' }, 'Pre', h('b', null, 'Call')), h('div', { class: 'spacer' }),
      h('button', { class: 'icon-btn', 'aria-label': 'About & privacy', onclick: () => nav('about') }, icon('info'))),
    h('main', { class: 'screen' },
      h('section', { class: 'hero' },
        orb(),
        h('div', { class: 'eyebrow' }, 'Call readiness'),
        h('h2', null, 'Sound and look', h('br'), 'your best.'),
        h('p', null, 'A one-minute check of your mic, echo and camera, with clear fixes for anything that’s off.'),
        h('button', { class: 'btn primary block', onclick: () => nav('check') }, icon('spark'), 'Run full check · 1 min'),
        last
          ? h('button', { class: 'btn ghost block', style: 'margin-top:6px', onclick: () => nav(`report/${last.id}`) },
              'Last result: ', h('b', { class: `c-${scoreStatus(last.score)}`, style: 'margin-left:4px' }, `${last.score}`), h('span', { class: 'muted', style: 'margin-left:6px' }, `· ${relTime(last.createdAt)}`))
          : null),
      h('div', { class: 'section-title' }, 'Individual tests'),
      h('div', { class: 'grid' },
        tile('call', 'phone', 'Test call', 'Voice only. Detailed mic report and playback'),
        tile('mic', 'mic', 'Live mic', 'Real-time level and spectrum'),
        tile('speaker', 'speaker', 'Speakers', 'Left/right, bass and range', 'violet'),
        tile('camera', 'camera', 'Camera', 'Lighting, focus and framing', 'violet'),
        h('button', { class: 'tile wide', onclick: () => nav('video') }, h('div', { class: 'ico' }, icon('video')), h('div', null, h('div', { class: 't' }, 'Video test call'), h('div', { class: 's', style: 'margin-top:2px' }, 'Record 10 seconds and watch yourself back'))),
        h('button', { class: 'tile wide violet', onclick: () => nav('history') }, h('div', { class: 'ico' }, icon('history')), h('div', null, h('div', { class: 't' }, 'History'), h('div', { class: 's', style: 'margin-top:2px' }, 'Compare headsets and setups over time')))),
      h('div', { class: 'footer-note' }, icon('shield'), ' Everything stays on your phone. Nothing is uploaded.'),
    ),
  );
  const shield = root.querySelector('.footer-note svg') as SVGElement | null;
  if (shield) shield.setAttribute('style', 'width:14px;height:14px;vertical-align:-2px');
};

export function relTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

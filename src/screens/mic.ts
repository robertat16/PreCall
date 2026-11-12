import type { MicSession } from '../audio/engine';
import type { Screen } from '../router';
import { chip, levelMeter, liveSpectrum, topbar } from '../ui/components';
import { clear, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { currentRouteClaim, inputSettingsCard, micErrorView, openConfiguredMic, releaseRoute } from './micflow';

export const micScreen: Screen = ({ root, back }) => {
  const body = h('main', { class: 'screen' });
  root.append(topbar('Live mic', back), body);
  let mic: MicSession | null = null;
  let stopViz: (() => void) | null = null;
  let raf = 0;
  let gen = 0;
  let claim = 0;

  const teardown = () => {
    gen++;
    cancelAnimationFrame(raf);
    stopViz?.();
    stopViz = null;
    mic?.close();
    mic = null;
  };

  const start = async () => {
    teardown();
    const my = gen;
    clear(body);
    body.append(h('div', { class: 'stage' }, h('h2', null, 'Opening your mic…')));
    try {
      const m = await openConfiguredMic();
      claim = currentRouteClaim();
      if (my !== gen) { m.close(); return; }
      mic = m;
    } catch (e) {
      if (my !== gen) return;
      clear(body);
      body.append(micErrorView(e, start));
      return;
    }
    const m = mic!;
    const readout = h('span', { class: 'big-readout readout' }, '—');
    const status = h('div', { class: 'small muted', 'aria-live': 'polite' }, 'Say something…');
    const clipChip = chip('Clipping', 'poor');
    clipChip.style.visibility = 'hidden';
    const meter = levelMeter();
    const canvas = h('canvas', { class: 'viz', 'aria-label': 'Live frequency spectrum', role: 'img' }) as HTMLCanvasElement;
    const floorEl = h('dd', null, '—');
    const peakEl = h('dd', null, '—');

    clear(body);
    body.append(
      h('div', { class: 'card' },
        h('div', { class: 'row', style: 'margin-bottom:10px' }, chip('Live', 'live'), h('div', { class: 'grow small muted', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, m.label), clipChip),
        h('div', { class: 'row', style: 'align-items:baseline;margin:6px 0 12px' }, readout, h('span', { class: 'unit' }, 'dB')),
        meter.el,
        h('div', { style: 'height:10px' }),
        status),
      h('div', { class: 'card' }, h('h3', null, 'Spectrum'), h('div', { class: 'small muted', style: 'margin-bottom:10px' }, 'Bass on the left, treble on the right. A Bluetooth mic in “hands-free” mode shows almost nothing past the middle.'), canvas),
      h('div', { class: 'card' }, h('dl', { class: 'kv' }, h('dt', null, 'Background noise'), floorEl, h('dt', null, 'Loudest peak'), peakEl, h('dt', null, 'Sample rate'), h('dd', null, `${m.sampleRate} Hz`), h('dt', null, 'Call processing'), h('dd', null, m.processing ? 'On' : 'Off'))),
      inputSettingsCard(() => void start()),
    );
    stopViz = liveSpectrum(canvas, m.analyser);

    const history: number[] = [];
    let maxPeak = -120;
    let clipUntil = 0;
    let lastText = 0;
    const loop = () => {
      if (!mic) return;
      const l = m.level();
      meter.update(l.rmsDb, l.holdDb);
      history.push(l.rmsDb);
      if (history.length > 300) history.shift();
      maxPeak = Math.max(maxPeak, l.peakDb);
      const now = performance.now();
      if (l.clipping) clipUntil = now + 1200;
      clipChip.style.visibility = now < clipUntil ? 'visible' : 'hidden';
      if (now - lastText > 120) {
        lastText = now;
        readout.textContent = l.rmsDb < -100 ? '−∞' : l.rmsDb.toFixed(0);
        const sorted = [...history].sort((a, b) => a - b);
        const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
        floorEl.textContent = floor < -100 ? 'Silent' : `${floor.toFixed(0)} dB`;
        peakEl.textContent = `${maxPeak.toFixed(1)} dB`;
        let s = 'Say something…';
        if (now < clipUntil) s = 'Too loud: your voice is clipping. Back off a little.';
        else if (l.rmsDb > -12) s = 'Very loud. Close to clipping.';
        else if (l.rmsDb > -30) s = 'In the sweet spot for calls.';
        else if (l.rmsDb > -42) s = 'A little quiet. Move the mic closer if this is you talking.';
        else if (l.rmsDb > -100) s = 'Quiet. This is your background noise level when you’re silent.';
        status.textContent = s;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };

  body.append(
    h('div', { class: 'stage' },
      h('div', { class: 'pulse-orb' }, h('div', { class: 'halo' }), h('div', { class: 'core' }, icon('mic'))),
      h('h2', null, 'Live mic monitor'),
      h('p', null, 'See your level and frequency spectrum in real time. Great for adjusting mic position.'),
      h('button', { class: 'btn primary block', onclick: () => void start() }, icon('play'), 'Start')),
  );

  return () => {
    teardown();
    void releaseRoute(claim);
  };
};

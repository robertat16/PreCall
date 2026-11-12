import { playSweep, playTone, type ToneHandle } from '../audio/engine';
import type { Screen } from '../router';
import { notice, topbar } from '../ui/components';
import { h } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';

export const speakerScreen: Screen = ({ root, back }) => {
  const body = h('main', { class: 'screen' });
  root.append(topbar('Speakers & headphones', back), body);
  let current: (ToneHandle & { pad?: HTMLElement }) | null = null;
  let sweepStop: (() => void) | null = null;

  const stopAll = () => {
    current?.stop();
    current?.pad?.classList.remove('playing');
    current = null;
    sweepStop?.();
    sweepStop = null;
  };

  const pad = (ic: IconName, title: string, sub: string, play: () => Promise<ToneHandle>) => {
    const el = h('button', { class: 'pad', 'aria-label': `${title}: ${sub}` }, icon(ic), h('div', null, title), h('div', { class: 's' }, sub));
    el.addEventListener('click', async () => {
      const was = current?.pad === el;
      stopAll();
      if (was) return;
      el.classList.add('playing');
      const t = await play();
      current = Object.assign(t, { pad: el });
      t.done.then(() => {
        if (current?.pad === el) {
          el.classList.remove('playing');
          current = null;
        }
      });
    });
    return el;
  };

  // Sweep
  const freqOut = h('div', { class: 'sweep-readout', 'aria-live': 'off' }, '—');
  const result = h('div', { class: 'small muted center', 'aria-live': 'polite' }, 'Tap “I can’t hear it” when the tone disappears.');
  const startBtn = h('button', { class: 'btn primary', }, icon('play'), 'Start sweep') as HTMLButtonElement;
  const markBtn = h('button', { class: 'btn secondary', disabled: true }, 'I can’t hear it') as HTMLButtonElement;
  let sweep: Awaited<ReturnType<typeof playSweep>> | null = null;
  startBtn.addEventListener('click', async () => {
    stopAll();
    markBtn.disabled = false;
    startBtn.disabled = true;
    result.textContent = 'Listening… the tone rises from deep bass to very high treble.';
    sweep = await playSweep({ from: 40, to: 18000, seconds: 16, volume: 0.18, onFreq: (f) => (freqOut.textContent = f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`) });
    const mine = sweep;
    sweepStop = () => mine.stop();
    mine.done.then(() => {
      if (sweep !== mine) return;
      startBtn.disabled = false;
      markBtn.disabled = true;
      if (result.dataset.marked !== '1') result.textContent = 'You heard the whole sweep, up to 18 kHz. Excellent range.';
      result.dataset.marked = '';
      sweep = null;
    });
  });
  markBtn.addEventListener('click', () => {
    if (!sweep) return;
    const f = sweep.currentFreq();
    result.dataset.marked = '1';
    sweep.stop();
    markBtn.disabled = true;
    const khz = f / 1000;
    let verdict: string;
    if (f < 6000) verdict = 'That’s low. Your speaker or headphones may be in a low-quality mode, or the volume is too quiet.';
    else if (f < 12000) verdict = 'Normal range for many headsets and adults. Voices will sound clear.';
    else verdict = 'Great high-frequency range.';
    result.textContent = `Stopped at ${khz >= 1 ? khz.toFixed(1) + ' kHz' : Math.round(f) + ' Hz'}. ${verdict}`;
  });

  body.append(
    notice('info', 'Set your volume to a comfortable level first. Tones start quiet.'),
    h('div', { class: 'section-title' }, 'Stereo'),
    h('div', { class: 'speaker-pad' },
      pad('left', 'Left', 'Beeps in left ear', () => playTone({ freq: 660, seconds: 3, pan: -1, pulses: true, volume: 0.28 })),
      pad('right', 'Right', 'Beeps in right ear', () => playTone({ freq: 880, seconds: 3, pan: 1, pulses: true, volume: 0.28 })),
      pad('speaker', 'Both', 'Centered tone', () => playTone({ freq: 523, seconds: 2.5, pulses: true, volume: 0.28 })),
      pad('bass', 'Bass', '60 Hz rumble', () => playTone({ freq: 60, seconds: 3, volume: 0.5 })),
    ),
    h('div', { class: 'small muted', style: 'margin:0 4px' }, 'If left and right are swapped, your headphones are on backwards or the stereo setting is flipped. If bass is silent, small speakers simply can’t reproduce it, which is normal for phone speakers.'),
    h('div', { class: 'section-title' }, 'Frequency range'),
    h('div', { class: 'card' },
      freqOut,
      h('div', { style: 'height:10px' }),
      result,
      h('div', { style: 'height:14px' }),
      h('div', { class: 'btn-row' }, startBtn, markBtn)),
  );

  return () => stopAll();
};

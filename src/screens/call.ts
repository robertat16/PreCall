import type { Screen } from '../router';
import { addHistory } from '../store';
import { topbar } from '../ui/components';
import { clear, h, isAbort } from '../ui/dom';
import { icon } from '../ui/icons';
import { inputSettingsCard, micDetailsView, micErrorView, micReportView, playbackCard, runMicCapture, QUIET_SECONDS, SPEAK_SECONDS } from './micflow';

/** Audio test call: quiet → speak → analysis → play back. */
export const callScreen: Screen = ({ root, back, signal }) => {
  const body = h('main', { class: 'screen' });
  root.append(topbar('Test call', back), body);
  let stopPlayback: (() => void) | null = null;
  let running: AbortController | null = null;

  const intro = () => {
    stopPlayback?.();
    clear(body);
    body.append(
      h('div', { class: 'stage' },
        h('div', { class: 'pulse-orb' }, h('div', { class: 'halo' }), h('div', { class: 'core' }, icon('phone'))),
        h('h2', null, 'Echo test call'),
        h('p', null, `Like a test call in Teams or Skype: ${QUIET_SECONDS} seconds of silence, then ${SPEAK_SECONDS} seconds of you reading a sentence. Then you hear it back with a full breakdown.`),
        h('button', { class: 'btn primary block', onclick: start }, icon('mic'), 'Start test call')),
      inputSettingsCard(),
      h('div', { class: 'footer-note' }, 'Tip: test the headset exactly as you’ll wear it on the call.'),
    );
  };

  const start = async () => {
    running = new AbortController();
    const abort = () => running?.abort();
    signal.addEventListener('abort', abort, { once: true });
    clear(body);
    const stage = h('div', { class: 'stage', 'aria-live': 'polite' });
    body.append(stage, h('button', { class: 'btn ghost block', onclick: () => { running?.abort(); intro(); } }, 'Cancel'));
    try {
      const res = await runMicCapture(stage, running.signal);
      const entry = addHistory({ kind: 'mic', device: res.device, score: res.report.score, mic: res.report, processing: res.processing });
      clear(body);
      const pb = playbackCard(res.speech, res.sampleRate);
      stopPlayback = pb.stop;
      body.append(
        micReportView(res.report, { device: res.device, processing: res.processing }),
        pb.el,
        micDetailsView(res.report),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn secondary', onclick: intro }, icon('redo'), 'Test again'),
          h('button', { class: 'btn secondary', onclick: back }, icon('check'), 'Done')),
        h('div', { class: 'footer-note' }, `Saved to history · ${new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`),
      );
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (isAbort(e)) return;
      clear(body);
      body.append(micErrorView(e, intro));
    } finally {
      signal.removeEventListener('abort', abort);
    }
  };

  intro();
  return () => {
    running?.abort();
    stopPlayback?.();
  };
};

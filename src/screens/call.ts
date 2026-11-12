import type { Screen } from '../router';
import { addHistory, getHistory } from '../store';
import type { RouteKind } from '../native/audioRoute';
import { topbar } from '../ui/components';
import { clear, h, isAbort } from '../ui/dom';
import { icon } from '../ui/icons';
import { inputSettingsCard, micDetailsView, micErrorView, micReportView, narrowbandCard, playbackCard, runMicCapture, QUIET_SECONDS, SPEAK_SECONDS } from './micflow';

/** Audio test call: quiet → speak → analysis → play back. */
export const callScreen: Screen = ({ root, back, nav, signal }) => {
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
        h('p', null, `Like the test call in most video-call apps: stay quiet for ${QUIET_SECONDS} seconds, then read a sentence for ${SPEAK_SECONDS}. You’ll hear it back with a full breakdown.`),
        h('button', { class: 'btn primary block', onclick: () => void start() }, icon('mic'), 'Start test call'),
        h('div', { class: 'small muted' }, 'You’ll be asked for microphone access. Nothing leaves your phone.')),
      inputSettingsCard(),
      h('div', { class: 'footer-note' }, 'Tip: test the headset exactly as you’ll wear it on the call.'),
    );
  };

  const start = async (route?: RouteKind) => {
    stopPlayback?.();
    stopPlayback = null;
    running?.abort();
    running = new AbortController();
    const abort = () => running?.abort();
    signal.addEventListener('abort', abort, { once: true });
    clear(body);
    const stage = h('div', { class: 'stage', 'aria-live': 'polite' });
    body.append(stage, h('button', { class: 'btn ghost block', onclick: () => { running?.abort(); intro(); } }, 'Cancel'));
    try {
      const res = await runMicCapture(stage, running.signal, { route });
      const entry = addHistory({ kind: 'mic', device: res.device, score: res.report.score, mic: res.report, processing: res.processing });
      clear(body);
      const pb = playbackCard(res.speech, res.sampleRate);
      stopPlayback = pb.stop;
      const prev = getHistory().find((e) => e.id !== entry.id && e.mic);
      body.append(
        micReportView(res.report, { device: res.device, processing: res.processing }),
        pb.el,
        ...(res.report.voiceDetected && res.report.bandwidthClass === 'narrowband'
          ? [narrowbandCard(res.device, () => void start('builtin'), route)]
          : []),
        micDetailsView(res.report, undefined, { hideClarityTip: res.report.bandwidthClass === 'narrowband' }),
        prev ? h('button', { class: 'btn secondary block', onclick: () => nav(`compare/${prev.id}/${entry.id}`) }, icon('ab'), `Compare with previous (${prev.score})`) : h('div', { class: 'small muted center' }, 'Tip: test another headset next, then compare the two.'),
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

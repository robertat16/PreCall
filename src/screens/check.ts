import type { CameraReport } from '../camera/analysis';
import type { Screen } from '../router';
import { addHistory } from '../store';
import { scoreRing, scoreStatus, topbar } from '../ui/components';
import { clear, h, isAbort } from '../ui/dom';
import { gradeFor } from '../audio/analysis';
import { icon, type IconName } from '../ui/icons';
import { analyzeCurrentCamera, cameraReportView, cameraView, captureThumb } from './camera';
import { echoStatusScore, inputSettingsCard, micDetailsView, micErrorView, micReportView, narrowbandCard, playbackCard, runMicCapture, type MicTestResult } from './micflow';
import type { RouteKind } from '../native/audioRoute';

export function overallScore(mic: number, echo?: number, camera?: number): number {
  let w = 0.65;
  let s = mic * 0.65;
  if (echo !== undefined) { s += echo * 0.1; w += 0.1; }
  if (camera !== undefined) { s += camera * 0.25; w += 0.25; }
  // the weakest link matters: a failing part caps the total
  const parts = [mic, camera].filter((v): v is number => v !== undefined);
  const cap = Math.min(...parts) + 25;
  let total = Math.round(Math.min(s / w, cap));
  // "Excellent" overall only if every part is excellent
  if (parts.some((p) => p < 90) || (echo !== undefined && echo < 90)) total = Math.min(total, 89);
  return total;
}

function summaryText(mic: MicTestResult, camera: CameraReport | undefined, total: number): string {
  if (!mic.report.voiceDetected) return 'Check your mic selection and try again.';
  if (total >= 90) return camera ? 'Your mic, echo and camera are all call-ready.' : 'Your mic and echo are call-ready.';
  if (camera && camera.score < mic.report.score && camera.topIssue) return `One thing to improve: your camera. ${camera.topIssue}`;
  return mic.report.summary;
}

export const checkScreen: Screen = ({ root, back, nav, signal }) => {
  const body = h('main', { class: 'screen' });
  root.append(topbar('Full check', back), body);
  let ac: AbortController | null = null;
  let cleanupPlayback: (() => void) | null = null;
  const cam = cameraView({ hud: false });

  const steps = (i: number) =>
    h('div', { class: 'steps-wrap', 'aria-label': i >= 0 ? `Step ${i + 1} of 3` : 'Three steps: mic, echo, camera' },
      h('div', { class: 'steps' }, ...[0, 1, 2].map((k) => h('span', { class: k < i ? 'done' : k === i ? 'on' : '' }))),
      h('div', { class: 'steps-labels', 'aria-hidden': 'true' }, ...['Mic', 'Echo', 'Camera'].map((l, k) => h('span', { class: k === i ? 'on' : '' }, l))));

  const intro = () => {
    ac?.abort();
    cleanupPlayback?.();
    cam.stop();
    clear(body);
    body.append(
      h('div', { class: 'stage' },
        steps(-1),
        h('div', { class: 'pulse-orb' }, h('div', { class: 'halo' }), h('div', { class: 'core' }, icon('spark'))),
        h('h2', null, 'One-minute call check'),
        h('p', null, 'Mic quality, echo, and camera, all in one pass. Put your headset on and get in your call spot.'),
        h('button', { class: 'btn primary block', onclick: () => void run() }, icon('play'), 'Begin'),
        h('div', { class: 'small muted' }, 'You’ll be asked for mic and camera access. Nothing leaves your phone.')),
      inputSettingsCard(),
    );
  };

  let usedRoute: RouteKind | undefined;
  const run = async (route?: RouteKind) => {
    usedRoute = route;
    cleanupPlayback?.();
    cleanupPlayback = null;
    ac?.abort();
    ac = new AbortController();
    const sig = ac.signal;
    const onLeave = () => ac?.abort();
    signal.addEventListener('abort', onLeave, { once: true });
    clear(body);
    const stage = h('div', { class: 'stage', 'aria-live': 'polite' });
    const cancel = h('button', { class: 'btn ghost block', onclick: intro }, 'Cancel');
    body.append(stage, cancel);

    let mic: MicTestResult;
    try {
      mic = await runMicCapture(stage, sig, { echo: true, route, stepLabel: (i) => steps(i === 2 ? 1 : 0) });
    } catch (e) {
      if (isAbort(e)) return;
      clear(body);
      body.append(micErrorView(e, intro));
      return;
    }

    // Camera
    let camera: CameraReport | undefined;
    let cameraError = '';
    let thumb: string | undefined;
    clear(stage);
    const status = h('p', null, 'Center your face in the outline.');
    stage.append(steps(2), h('div', { class: 'countdown' }, 'CAMERA'), cam.el, status);
    const camAc = new AbortController();
    sig.addEventListener('abort', () => camAc.abort(), { once: true });
    const skip = h('button', { class: 'btn ghost block', onclick: () => camAc.abort() }, 'Skip camera');
    cancel.replaceWith(skip);
    try {
      await cam.start('user');
      status.textContent = 'Hold still for a few seconds…';
      camera = await analyzeCurrentCamera(cam, 3000, camAc.signal);
      thumb = captureThumb(cam);
    } catch (e) {
      if (!isAbort(e)) cameraError = (e as Error).message;
    } finally {
      cam.stop();
    }
    if (sig.aborted) return;

    const echoScore = echoStatusScore(mic.echo);
    const total = mic.report.voiceDetected ? overallScore(mic.report.score, echoScore, camera?.score) : mic.report.score;
    const entry = addHistory({ kind: 'full', device: mic.device, score: total, mic: mic.report, echo: mic.echo, camera, processing: mic.processing });
    showSummary(mic, camera, total, cameraError, entry.id, thumb);
    signal.removeEventListener('abort', onLeave);
  };

  const showSummary = (mic: MicTestResult, camera: CameraReport | undefined, total: number, cameraError: string, id: string, thumb?: string) => {
    clear(body);
    const st = scoreStatus(total);
    const headline = !mic.report.voiceDetected ? 'We couldn’t hear you' : total >= 90 ? 'You’re ready' : total >= 75 ? 'Good to go' : total >= 60 ? 'Usable, with fixes' : 'Not ready yet';
    const row = (ic: IconName, title: string, sub: string, score: number | null, onClick?: () => void) =>
      h('button', { class: 'summary-row', onclick: onClick ?? null }, h('div', { class: 'ico' }, icon(ic)), h('div', { class: 'g' }, h('div', { class: 't' }, title), h('div', { class: 's' }, sub)), score === null ? h('span', { class: 'small muted' }, '—') : h('div', { class: `n c-${scoreStatus(score)}` }, String(score)));
    const micDetails = h('div', { style: 'display:none;flex-direction:column;gap:14px' });
    const camDetails = h('div', { style: 'display:none;flex-direction:column;gap:14px' });
    const toggleBox = (el: HTMLElement) => { el.style.display = el.style.display === 'none' ? 'flex' : 'none'; };
    const pb = playbackCard(mic.speech, mic.sampleRate);
    cleanupPlayback = pb.stop;
    micDetails.append(micDetailsView(mic.report, mic.echo, { hideClarityTip: mic.report.bandwidthClass === 'narrowband' }));
    if (camera) camDetails.append(cameraReportView(camera, thumb));

    body.append(
      h('div', { class: 'card' },
        h('div', { class: 'score-wrap' },
          scoreRing(total, mic.report.voiceDetected ? gradeFor(total) : 'No voice'),
          h('h2', null, headline),
          h('p', null, summaryText(mic, camera, total))),
        h('div', { class: 'footer-note' }, mic.device)),
      pb.el,
      ...(mic.report.voiceDetected && mic.report.bandwidthClass === 'narrowband' ? [narrowbandCard(mic.device, () => void run('builtin'), usedRoute)] : []),
      h('div', { class: 'section-title' }, 'Results'),
      row('mic', 'Microphone', mic.report.headline, mic.report.score, () => toggleBox(micDetails)),
      micDetails,
      ...(mic.echo ? [row('speaker', 'Echo', mic.echo.label, echoStatusScore(mic.echo)!)] : []),
      camera
        ? row('camera', 'Camera', camera.headline, camera.score, () => toggleBox(camDetails))
        : row('camera', 'Camera', cameraError || 'Skipped', null),
      camDetails,
      h('div', { class: 'btn-row', style: 'margin-top:4px' },
        h('button', { class: 'btn secondary', onclick: intro }, icon('redo'), 'Run again'),
        h('button', { class: 'btn secondary', onclick: () => nav('', true) }, icon('check'), 'Done')),
      h('div', { class: `footer-note c-${st}` }, h('span', { class: 'muted' }, 'Saved to '), h('a', { href: `#/report/${id}` }, 'history')),
    );
    window.scrollTo({ top: 0 });
  };

  intro();
  return () => {
    ac?.abort();
    cleanupPlayback?.();
    cam.stop();
  };
};

export { micReportView };

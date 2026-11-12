import { describeMediaError } from '../audio/engine';
import { pickRecorderMime, type Facing } from '../camera/engine';
import type { Screen } from '../router';
import { chip, levelMeter, notice, topbar } from '../ui/components';
import { clear, h, isAbort, sleep } from '../ui/dom';
import { icon } from '../ui/icons';
import { cameraView } from './camera';
import { resumeAudio } from '../audio/engine';

const CLIP_SECONDS = 10;

export const videoScreen: Screen = ({ root, back, signal }) => {
  const body = h('main', { class: 'screen' });
  root.append(topbar('Video test call', back), body);
  const view = cameraView({ withAudio: true });
  let url = '';
  let ac: AbortController | null = null;
  let meterRaf = 0;
  let analyserCleanup: (() => void) | null = null;

  const cleanupMeter = () => {
    cancelAnimationFrame(meterRaf);
    analyserCleanup?.();
    analyserCleanup = null;
  };

  const attachMeter = async (stream: MediaStream, meter: ReturnType<typeof levelMeter>) => {
    cleanupMeter();
    const c = await resumeAudio();
    const src = c.createMediaStreamSource(stream);
    const an = c.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let hold = -120;
    let holdAt = 0;
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      let p = 0;
      for (const v of buf) { s += v * v; p = Math.max(p, Math.abs(v)); }
      const db = 10 * Math.log10(Math.max(s / buf.length, 1e-12));
      const pdb = 20 * Math.log10(Math.max(p, 1e-6));
      const now = performance.now();
      if (pdb > hold || now - holdAt > 1500) { hold = pdb; holdAt = now; }
      meter.update(db, hold);
      meterRaf = requestAnimationFrame(loop);
    };
    meterRaf = requestAnimationFrame(loop);
    analyserCleanup = () => { try { src.disconnect(); } catch { /* ignore */ } };
  };

  const live = async (facing: Facing = 'user') => {
    ac?.abort();
    cleanupMeter();
    if (url) { URL.revokeObjectURL(url); url = ''; }
    clear(body);
    const meter = levelMeter();
    const recBtn = h('button', { class: 'btn primary' }, icon('video'), `Record ${CLIP_SECONDS}s`) as HTMLButtonElement;
    const flip = h('button', { class: 'btn secondary', 'aria-label': 'Switch camera' }, icon('flip')) as HTMLButtonElement;
    flip.style.flex = '0 0 64px';
    const status = h('div', { class: 'small muted center', 'aria-live': 'polite' }, 'Record a short clip, then watch it back exactly as others would see and hear you.');
    body.append(view.el, h('div', { class: 'card tight' }, h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Mic level'), meter.el), status, h('div', { class: 'btn-row' }, flip, recBtn));
    try {
      await view.start(facing);
    } catch (e) {
      clear(body);
      body.append(notice('error', (e as Error).message || describeMediaError(e, 'camera').message), h('button', { class: 'btn secondary block', onclick: () => void live(facing) }, icon('redo'), 'Try again'));
      return;
    }
    const stream = view.stream()!;
    if (stream.getAudioTracks().length) void attachMeter(stream, meter);
    flip.addEventListener('click', () => void live(view.facing() === 'user' ? 'environment' : 'user'));

    const mime = pickRecorderMime();
    if (!mime) {
      recBtn.disabled = true;
      status.textContent = 'Video recording isn’t supported on this device, but the live preview above still works.';
      return;
    }

    recBtn.addEventListener('click', async () => {
      ac = new AbortController();
      const sig = ac.signal;
      recBtn.disabled = true;
      flip.disabled = true;
      try {
        for (let i = 3; i >= 1; i--) {
          status.textContent = `Recording in ${i}…`;
          await sleep(800, sig);
        }
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
        rec.start(250);
        const recChip = chip('REC', 'live');
        view.el.querySelector('.hud')?.prepend(recChip);
        for (let s = CLIP_SECONDS; s > 0; s--) {
          status.textContent = `Recording… ${s}s. Talk and move like you would on a call.`;
          await sleep(1000, sig);
        }
        rec.stop();
        await stopped;
        recChip.remove();
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        playback(blob);
      } catch (e) {
        if (isAbort(e)) return;
        status.textContent = 'Recording failed. Try again.';
        recBtn.disabled = false;
        flip.disabled = false;
      }
    });
  };

  const playback = (blob: Blob) => {
    const facing = view.facing();
    view.stop();
    cleanupMeter();
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    clear(body);
    const v = h('video', { controls: true, playsinline: true, src: url, class: facing === 'user' ? 'mirror' : '' }) as HTMLVideoElement;
    body.append(
      h('div', { class: 'cam' }, v),
      h('div', { class: 'card' },
        h('h3', null, 'Watch it back'),
        h('div', { class: 'small muted' }, 'Check: Are you well lit and centered? Is your voice clear and in sync? Any echo, hum or background noise? For a full audio breakdown, run the Test call.')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn secondary', onclick: () => void live(facing) }, icon('redo'), 'Record again'),
        h('button', { class: 'btn secondary', onclick: back }, icon('check'), 'Done')),
    );
    void v.play().catch(() => undefined);
  };

  void live();
  signal.addEventListener('abort', () => ac?.abort());
  return () => {
    ac?.abort();
    cleanupMeter();
    view.stop();
    if (url) URL.revokeObjectURL(url);
  };
};

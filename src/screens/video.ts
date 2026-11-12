import { pickRecorderMime, type Facing } from '../camera/engine';
import type { Screen } from '../router';
import { chip, levelMeter, topbar } from '../ui/components';
import { clear, h, isAbort, sleep } from '../ui/dom';
import { icon } from '../ui/icons';
import { mediaErrorView } from './micflow';
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
      if (isAbort(e) || signal.aborted) return;
      clear(body);
      body.append(mediaErrorView(e, () => void live(facing), 'Couldn’t start the camera.'));
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
    const v = h('video', { playsinline: true, src: url, class: facing === 'user' ? 'mirror' : '' }) as HTMLVideoElement;
    const playBtn = h('button', { class: 'icon-btn', 'aria-label': 'Play' }, icon('play'));
    const fill = h('div');
    const bar = h('div', { class: 'bar', role: 'slider', tabindex: 0, 'aria-label': 'Playback position', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill);
    bar.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      v.currentTime = Math.max(0, Math.min(dur(), v.currentTime + step));
    });
    const time = h('span', { class: 't' }, '0:00');
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const dur = () => (isFinite(v.duration) && v.duration > 0 ? v.duration : CLIP_SECONDS);
    const sync = () => {
      const p = Math.min(1, v.currentTime / dur());
      fill.style.width = `${p * 100}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      time.textContent = `${fmt(v.currentTime)} / ${fmt(dur())}`;
      playBtn.replaceChildren(icon(v.paused ? 'play' : 'pause'));
      playBtn.setAttribute('aria-label', v.paused ? 'Play' : 'Pause');
    };
    const toggle = () => { if (v.paused) void v.play().catch(() => undefined); else v.pause(); };
    playBtn.addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata'].forEach((ev) => v.addEventListener(ev, sync));
    bar.addEventListener('click', (e) => {
      const rect = bar.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * dur();
    });
    body.append(
      h('div', { class: 'cam' }, v),
      h('div', { class: 'card tight vctl' }, playBtn, bar, time),
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

import { analyzeCamera, type CameraReport } from '../camera/analysis';
import { CameraSampler, openCamera, stopStream, type Facing } from '../camera/engine';
import type { Screen } from '../router';
import { addHistory } from '../store';
import { chip, metricList, notice, scoreRing, topbar } from '../ui/components';
import { clear, h, isAbort, sleep } from '../ui/dom';
import { icon } from '../ui/icons';

export interface CamView {
  el: HTMLElement;
  video: HTMLVideoElement;
  start(facing: Facing): Promise<void>;
  sampler(): CameraSampler | null;
  stream(): MediaStream | null;
  facing(): Facing;
  stop(): void;
  setMirror(v: boolean): void;
}

/** Camera preview with HUD (resolution / fps / light) and framing guide. */
export function cameraView(opts: { hud?: boolean; withAudio?: boolean } = {}): CamView {
  const video = h('video', { playsinline: true, muted: true, autoplay: true, class: 'mirror' }) as HTMLVideoElement;
  video.muted = true;
  const hud = h('div', { class: 'hud' });
  const placeholder = h('div', { class: 'placeholder' }, 'Starting camera…');
  const el = h('div', { class: 'cam' }, video,
    h('div', { class: 'overlay' }, h('div', { class: 'guide' }), h('div', { class: 'corner c1' }), h('div', { class: 'corner c2' }), h('div', { class: 'corner c3' }), h('div', { class: 'corner c4' })),
    hud, placeholder);
  let stream: MediaStream | null = null;
  let sampler: CameraSampler | null = null;
  let facing: Facing = 'user';
  let timer = 0;
  let mirror = true;

  const updateHud = () => {
    if (!sampler || !video.videoWidth) return;
    const s = sampler.stats();
    const fps = sampler.fps();
    const light = s ? s.brightness : 0;
    const lightCls = !s ? '' : light < 45 ? 'poor' : light < 75 ? 'fair' : light > 205 ? 'fair' : 'great';
    hud.replaceChildren(
      chip(`${Math.min(video.videoWidth, video.videoHeight)}p`, ''),
      chip(fps ? `${fps.toFixed(0)} fps` : '— fps', fps && fps < 15 ? 'poor' : fps && fps < 22 ? 'fair' : 'great'),
      chip(s ? `Light ${Math.round((light / 255) * 100)}%` : 'Light —', lightCls),
    );
  };

  const api: CamView = {
    el,
    video,
    async start(f: Facing) {
      api.stop();
      facing = f;
      placeholder.style.display = '';
      placeholder.textContent = 'Starting camera…';
      stream = await openCamera(f, opts.withAudio);
      video.srcObject = stream;
      video.classList.toggle('mirror', f === 'user' && mirror);
      try { await video.play(); } catch { /* autoplay handled by muted */ }
      placeholder.style.display = 'none';
      sampler = new CameraSampler(video);
      if (opts.hud !== false) timer = window.setInterval(updateHud, 500);
    },
    sampler: () => sampler,
    stream: () => stream,
    facing: () => facing,
    stop() {
      clearInterval(timer);
      sampler?.stop();
      sampler = null;
      stopStream(stream);
      stream = null;
      video.srcObject = null;
      hud.replaceChildren();
    },
    setMirror(v: boolean) {
      mirror = v;
      video.classList.toggle('mirror', facing === 'user' && v);
    },
  };
  return api;
}

export async function analyzeCurrentCamera(view: CamView, ms: number, signal?: AbortSignal): Promise<CameraReport> {
  const sampler = view.sampler();
  if (!sampler) throw new Error('Camera not started');
  // give auto-exposure a moment
  await sleep(600, signal);
  const stats = await sampler.gather(ms, signal);
  const v = view.video;
  return analyzeCamera({
    stats: stats ?? { brightness: 0, contrast: 0, highlights: 0, shadows: 1, centerBrightness: 0, edgeBrightness: 0, sharpness: 0, r: 0, g: 0, b: 0 },
    width: v.videoWidth,
    height: v.videoHeight,
    fps: sampler.fps(),
    facing: view.facing(),
  });
}

export function cameraReportView(r: CameraReport): HTMLElement {
  return h('div', { style: 'display:flex;flex-direction:column;gap:14px' },
    h('div', { class: 'card' }, h('div', { class: 'score-wrap' }, scoreRing(r.score, r.grade), h('h2', null, r.headline), h('p', null, r.summary))),
    h('div', { class: 'card tight' }, h('h3', { style: 'margin:4px 2px 4px' }, 'Breakdown'), h('div', { class: 'small muted', style: 'margin:0 2px 6px' }, 'Tap any row for details and fixes.'), metricList(r.metrics)));
}

export const cameraScreen: Screen = ({ root, back, signal }) => {
  const body = h('main', { class: 'screen' });
  root.append(topbar('Camera', back), body);
  const view = cameraView();
  let busy: AbortController | null = null;

  const live = async (facing: Facing = 'user') => {
    clear(body);
    const flip = h('button', { class: 'btn secondary', 'aria-label': 'Switch camera' }, icon('flip'), 'Flip');
    const analyzeBtn = h('button', { class: 'btn primary' }, icon('spark'), 'Analyze') as HTMLButtonElement;
    const status = h('div', { class: 'small muted center', 'aria-live': 'polite' }, 'Center your face in the outline, about an arm’s length away.');
    body.append(view.el, status, h('div', { class: 'btn-row' }, flip, analyzeBtn));
    try {
      await view.start(facing);
    } catch (e) {
      clear(body);
      body.append(notice('error', (e as Error).message), h('button', { class: 'btn secondary block', onclick: () => void live(facing) }, icon('redo'), 'Try again'));
      return;
    }
    flip.addEventListener('click', () => void live(view.facing() === 'user' ? 'environment' : 'user').catch(() => undefined));
    analyzeBtn.addEventListener('click', async () => {
      busy = new AbortController();
      analyzeBtn.disabled = true;
      status.textContent = 'Hold still… analyzing lighting, focus and color.';
      try {
        const r = await analyzeCurrentCamera(view, 2500, busy.signal);
        addHistory({ kind: 'camera', device: view.facing() === 'user' ? 'Front camera' : 'Back camera', score: r.score, camera: r });
        view.stop();
        clear(body);
        body.append(cameraReportView(r), h('div', { class: 'btn-row' },
          h('button', { class: 'btn secondary', onclick: () => void live(r.facing as Facing) }, icon('redo'), 'Test again'),
          h('button', { class: 'btn secondary', onclick: back }, icon('check'), 'Done')));
        window.scrollTo({ top: 0 });
      } catch (e) {
        if (!isAbort(e)) status.textContent = 'Couldn’t analyze the camera. Try again.';
        analyzeBtn.disabled = false;
      }
    });
  };

  void live();
  signal.addEventListener('abort', () => busy?.abort());
  return () => {
    busy?.abort();
    view.stop();
  };
};

import { analyzeEchoLeak, analyzeMicTest, type EchoReport, type MicReport } from '../audio/analysis';
import { listAudioInputs, MicError, MicSession, playEchoProbe, playSamples, playbackGain, type Playback } from '../audio/engine';
import { isNative, nativeRouteOptions, openAppSettings, requestBluetoothPermission, useRoute, type RouteKind } from '../native/audioRoute';
import { getSettings, nextPrompt, setSettings } from '../store';
import { metricList, notice, scoreRing, scoreStatus, spectrumChart, toggle, toneBars, waveformCanvas } from '../ui/components';
import { clear, h, sleep, throwIfAborted, toast } from '../ui/dom';
import { icon } from '../ui/icons';

export const QUIET_SECONDS = 3;
export const SPEAK_SECONDS = 8;

/** Input selector + call-processing toggle. Saves choices to settings. */
export function inputSettingsCard(onChange?: () => void): HTMLElement {
  const s = getSettings();
  const card = h('div', { class: 'card tight' });
  const selectWrap = h('div', null);
  const label = h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Microphone');
  card.append(label, selectWrap);

  const fill = async () => {
    clear(selectWrap);
    if (isNative()) {
      const opts = await nativeRouteOptions();
      if (opts && opts.length > 1) {
        const sel = h('select', { class: 'input', 'aria-label': 'Microphone' }) as HTMLSelectElement;
        for (const o of opts) sel.appendChild(h('option', { value: o.route }, `${o.label} · ${o.sub}`));
        sel.value = opts.some((o) => o.route === s.route) ? s.route : 'default';
        sel.addEventListener('change', async () => {
          const route = sel.value as RouteKind;
          if (route === 'bluetooth' && !(await requestBluetoothPermission())) {
            toast('Allow “Nearby devices” so PreCall can use your Bluetooth headset’s mic.');
          }
          setSettings({ route });
          onChange?.();
        });
        selectWrap.appendChild(sel);
        return;
      }
    }
    const inputs = await listAudioInputs().catch(() => []);
    const labelled = inputs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.label);
    if (labelled.length > 1) {
      const sel = h('select', { class: 'input', 'aria-label': 'Microphone' }) as HTMLSelectElement;
      sel.appendChild(h('option', { value: '' }, 'System default'));
      for (const d of labelled) sel.appendChild(h('option', { value: d.deviceId }, d.label));
      sel.value = labelled.some((d) => d.deviceId === s.deviceId) ? s.deviceId : '';
      sel.addEventListener('change', () => {
        setSettings({ deviceId: sel.value });
        onChange?.();
      });
      selectWrap.appendChild(sel);
    } else {
      selectWrap.appendChild(h('div', { class: 'row' }, icon('headset'), h('div', { class: 'grow' }, labelled[0]?.label || 'Default microphone')));
    }
  };
  void fill();

  card.appendChild(h('div', { style: 'height:14px' }));
  card.appendChild(
    toggle('Call processing', 'Echo cancellation, noise suppression and auto-gain, like most call apps', s.processing, (v) => {
      setSettings({ processing: v });
      onChange?.();
    }),
  );
  return card;
}

let routeGen = 0;

/** Opens the mic the user picked. Native: routes audio first; returns the route claim to release later. */
export async function openConfiguredMic(signal?: AbortSignal): Promise<MicSession> {
  const s = getSettings();
  const my = ++routeGen;
  if (isNative()) {
    const ok = await useRoute(s.route);
    if (!ok && s.route !== 'default') {
      toast('Couldn’t switch to that mic. Using the automatic choice instead.');
      setSettings({ route: 'default' });
      await useRoute('default');
    }
  }
  let mic: MicSession | null = null;
  try {
    throwIfAborted(signal);
    mic = await MicSession.open({ processing: s.processing, deviceId: s.deviceId || undefined });
    if (signal?.aborted || my !== routeGen) throw new DOMException('Aborted', 'AbortError');
    return mic;
  } catch (e) {
    mic?.close();
    await releaseRoute(my);
    throw e;
  }
}

/** Restore normal audio routing, unless a newer test has claimed the route since. */
export async function releaseRoute(claim?: number): Promise<void> {
  if (claim !== undefined && claim !== routeGen) return;
  if (isNative()) await useRoute('default');
}

export function currentRouteClaim(): number {
  return routeGen;
}

export interface MicTestResult {
  report: MicReport;
  speech: Float32Array;
  sampleRate: number;
  device: string;
  processing: boolean;
  echo?: EchoReport;
}

function orbEl(kind: 'quiet' | 'speak') {
  const core = h('div', { class: 'core' }, icon(kind === 'quiet' ? 'ear' : 'mic'));
  const halo = h('div', { class: 'halo' });
  const halo2 = h('div', { class: 'halo' });
  const el = h('div', { class: `pulse-orb ${kind === 'quiet' ? 'quiet' : ''}` }, halo2, halo, core);
  return {
    el,
    level(db: number) {
      const k = Math.max(0, Math.min(1, (db + 60) / 45));
      core.style.transform = `scale(${1 + k * 0.18})`;
      halo.style.transform = `scale(${0.75 + k * 0.4})`;
      halo.style.opacity = String(0.25 + k * 0.6);
      halo2.style.transform = `scale(${0.6 + k * 0.6})`;
      halo2.style.opacity = String(k * 0.4);
    },
  };
}

/**
 * Runs the guided quiet → speak recording inside `stage`.
 * Optionally runs the echo-leak probe afterwards.
 */
export async function runMicCapture(stage: HTMLElement, signal: AbortSignal, opts: { echo?: boolean; stepLabel?: (i: number) => HTMLElement } = {}): Promise<MicTestResult> {
  const mic = await openConfiguredMic(signal);
  const claim = currentRouteClaim();
  let raf = 0;
  try {
    const live = (fn: (db: number) => void) => {
      cancelAnimationFrame(raf);
      const loop = () => {
        fn(mic.level().rmsDb);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    // Warm-up: let auto-gain/processing settle and the Bluetooth link start.
    clear(stage);
    stage.append(h('div', { class: 'countdown' }, 'GETTING READY'), h('h2', null, 'Opening your mic…'), h('p', null, mic.label));
    await sleep(700, signal);

    // 1) quiet
    clear(stage);
    const o1 = orbEl('quiet');
    const cd1 = h('div', { class: 'countdown' }, `STEP 1 OF 2 · ${QUIET_SECONDS}s`);
    const bar1 = h('div');
    stage.append(opts.stepLabel?.(0) ?? '', cd1, o1.el, h('h2', null, 'Stay quiet'), h('p', null, 'Measuring your background noise. Don’t speak for a moment.'), h('div', { class: 'progress' }, bar1));
    live((db) => o1.level(db));
    const quiet = await mic.record(QUIET_SECONDS, (t) => {
      bar1.style.width = `${t * 100}%`;
      cd1.textContent = `STEP 1 OF 2 · ${Math.max(0, Math.ceil(QUIET_SECONDS * (1 - t)))}s`;
    }, signal);

    // 2) speak
    clear(stage);
    const o2 = orbEl('speak');
    const cd2 = h('div', { class: 'countdown' }, `STEP 2 OF 2 · ${SPEAK_SECONDS}s`);
    const bar2 = h('div');
    const prompt = nextPrompt();
    stage.append(opts.stepLabel?.(1) ?? '', cd2, o2.el, h('h2', null, 'Read this out loud'), h('div', { class: 'prompt' }, `“${prompt}”`), h('p', { class: 'small' }, 'Speak normally, as you would on a call.'), h('div', { class: 'progress' }, bar2));
    live((db) => o2.level(db));
    const speech = await mic.record(SPEAK_SECONDS, (t) => {
      bar2.style.width = `${t * 100}%`;
      cd2.textContent = `STEP 2 OF 2 · ${Math.max(0, Math.ceil(SPEAK_SECONDS * (1 - t)))}s`;
    }, signal);
    cancelAnimationFrame(raf);

    let echo: EchoReport | undefined;
    if (opts.echo) {
      clear(stage);
      stage.append(opts.stepLabel?.(2) ?? '', h('div', { class: 'countdown' }, 'ECHO CHECK'), orbEl('quiet').el, h('h2', null, 'Listen for a short tone'), h('p', null, 'Stay quiet. We’re checking whether your mic picks up your speaker.'));
      await sleep(400, signal);
      const before = await mic.record(0.8, undefined, signal);
      const probe = await playEchoProbe(1.2);
      const during = await mic.record(1.2, undefined, signal);
      await probe.done;
      echo = analyzeEchoLeak(before, during, mic.sampleRate);
    }

    clear(stage);
    stage.append(h('div', { class: 'countdown' }, 'ANALYZING'), h('h2', null, 'Crunching the numbers…'), h('p', null, 'Levels, noise, clarity, tone, hum, static and dropouts.'));
    await sleep(50, signal);
    throwIfAborted(signal);
    const report = analyzeMicTest({ quiet, speech, sampleRate: mic.sampleRate });
    throwIfAborted(signal);
    return { report, speech, sampleRate: mic.sampleRate, device: mic.label, processing: mic.processing, echo };
  } finally {
    cancelAnimationFrame(raf);
    mic.close();
    await releaseRoute(claim);
  }
}

/** Playback card: "hear yourself" — the core of an echo test call. */
export function playbackCard(samples: Float32Array, sampleRate: number): { el: HTMLElement; stop: () => void } {
  const wf = waveformCanvas(samples, 56);
  let pb: Playback | null = null;
  let raf = 0;
  const btn = h('button', { class: 'btn primary block' }, icon('play'), 'Hear yourself') as HTMLButtonElement;
  const stop = () => {
    pb?.stop();
    pb = null;
    cancelAnimationFrame(raf);
    wf.setProgress(-1);
    btn.replaceChildren(icon('play'), 'Hear yourself');
  };
  btn.addEventListener('click', async () => {
    if (pb) {
      stop();
      return;
    }
    btn.replaceChildren(icon('stop'), 'Stop');
    pb = await playSamples(samples, sampleRate, playbackGain(samples, 12));
    const cur = pb;
    const loop = () => {
      if (pb !== cur) return;
      wf.setProgress(cur.position() / cur.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    await cur.done;
    if (pb === cur) stop();
  });
  const el = h('div', { class: 'card' },
    h('div', { class: 'row', style: 'margin-bottom:10px' }, h('div', { class: 'grow' }, h('h3', { style: 'margin:0' }, 'Your recording'), h('div', { class: 'small muted' }, 'This is roughly what others hear (volume normalized).'))),
    wf.el,
    h('div', { style: 'height:12px' }),
    btn);
  return { el, stop };
}

export function micReportView(r: MicReport, extra?: { echo?: EchoReport; device?: string; processing?: boolean; compact?: boolean }): HTMLElement {
  const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:14px' });
  wrap.appendChild(
    h('div', { class: 'card' },
      h('div', { class: 'score-wrap' },
        scoreRing(r.score, r.grade),
        h('h2', null, r.headline),
        h('p', null, r.summary)),
      extra?.device ? h('div', { class: 'footer-note' }, `${extra.device}${extra.processing ? ' · call processing on' : ' · call processing off'}`) : null),
  );
  return wrap;
}

export function micDetailsView(r: MicReport, echo?: EchoReport): HTMLElement {
  const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:14px' });
  const ms = [...r.metrics];
  if (echo) {
    ms.push({ id: 'echo', label: 'Echo leak', value: echo.label, status: echo.status, detail: echo.detail });
  }
  wrap.appendChild(h('div', { class: 'card tight' }, h('h3', { style: 'margin:4px 2px 4px' }, 'Breakdown'), h('div', { class: 'small muted', style: 'margin:0 2px 6px' }, 'Tap any row for details and fixes.'), metricList(ms)));
  if (r.voiceDetected) {
    wrap.appendChild(h('div', { class: 'card' }, h('h3', null, 'Tone balance'), h('div', { class: 'small muted', style: 'margin-bottom:12px' }, `${r.tone.label}. Compared with a typical natural voice.`), toneBars(r.tone)));
    wrap.appendChild(h('div', { class: 'card' }, h('h3', null, 'Frequency spectrum'), h('div', { class: 'small muted', style: 'margin-bottom:12px' }, `Your mic delivers up to ${(Number(r.bandwidthHz) / 1000).toFixed(1)} kHz. The shaded band is where speech intelligibility lives.`), spectrumChart(r.spectrum, r.sampleRate)));
  }
  const num = (v: unknown, d = 1, u = 'dBFS') => (typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(d)} ${u}` : '—');
  const dl = h('dl', { class: 'kv' },
    h('dt', null, 'Speech level'), h('dd', null, num(r.speechLevelDb)),
    h('dt', null, 'Peak'), h('dd', null, num(r.peakDb)),
    h('dt', null, 'Noise floor'), h('dd', null, num(r.noiseFloorDb)),
    h('dt', null, 'Signal-to-noise'), h('dd', null, r.voiceDetected ? num(r.snrDb, 1, 'dB') : '—'),
    h('dt', null, 'Bandwidth'), h('dd', null, num(r.bandwidthHz, 0, 'Hz')),
    h('dt', null, 'Sample rate'), h('dd', null, num(r.sampleRate, 0, 'Hz')),
  );
  const det = h('details', { class: 'card tech' }, h('summary', null, 'Technical details'), h('div', { style: 'height:12px' }), dl);
  wrap.appendChild(det);
  return wrap;
}

export function echoStatusScore(e?: EchoReport): number | undefined {
  if (!e) return undefined;
  return e.status === 'great' ? 100 : e.status === 'good' ? 85 : 65;
}

export function micErrorView(err: unknown, onRetry: () => void): HTMLElement {
  return mediaErrorView(err, onRetry, 'Something went wrong with the microphone.');
}

/** Error card with "Open settings" when permission was denied (native only). */
export function mediaErrorView(err: unknown, onRetry: () => void, fallback = 'Something went wrong.'): HTMLElement {
  const msg = (err as Error)?.message || fallback;
  const denied = (err as MicError)?.kind === 'denied';
  return h('div', { style: 'display:flex;flex-direction:column;gap:12px' },
    notice('error', msg),
    denied && isNative() ? h('button', { class: 'btn primary block', onclick: () => void openAppSettings() }, icon('shield'), 'Open settings') : null,
    h('button', { class: 'btn secondary block', onclick: onRetry }, icon('redo'), 'Try again'));
}

export { scoreStatus };

/** Shown when narrowband audio is detected: explains Bluetooth hands-free mode and offers a one-tap retest. */
export function narrowbandCard(onRetestPhoneMic: () => void): HTMLElement {
  return h('div', { class: 'card', style: 'border-color:rgba(255,107,122,.35);background:rgba(255,107,122,.05)' },
    h('div', { class: 'eyebrow', style: 'color:var(--poor)' }, 'Bluetooth hands-free mode'),
    h('h3', { style: 'margin-top:8px' }, 'Why you sound like a phone line'),
    h('p', { class: 'small muted', style: 'margin:0 0 14px' }, 'Most Bluetooth headsets switch to a low-quality “hands-free” mode as soon as their mic turns on. Music sounds fine, but your voice is squeezed into a narrow band. The usual fix is to keep the headset for listening and use a different mic.'),
    isNative()
      ? h('button', { class: 'btn primary block', onclick: onRetestPhoneMic }, icon('redo'), 'Retest with phone mic')
      : h('p', { class: 'small', style: 'margin:0' }, 'Try the test again with a wired headset or your device’s built-in mic to hear the difference.'));
}

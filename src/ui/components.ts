import type { Metric, SpectrumPoint, Status, ToneBalance } from '../audio/analysis';
import { fitCanvas, h, svg } from './dom';
import { icon, type IconName } from './icons';

export const STATUS_COLOR: Record<Status, string> = {
  great: '#45e6a0',
  good: '#6fd3ff',
  fair: '#ffc857',
  poor: '#ff6b7a',
};

export function scoreStatus(score: number): Status {
  if (score >= 90) return 'great';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

export function topbar(title: string, onBack?: () => void, right?: HTMLElement): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    onBack ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: onBack }, icon('back')) : null,
    h('h1', null, title),
    right ?? null,
  );
}

export function scoreRing(score: number, label: string, animate = true): HTMLElement {
  const st = scoreStatus(score);
  const r = 84;
  const c = 2 * Math.PI * r;
  const ring = svg(`<svg viewBox="0 0 196 196" aria-hidden="true">
    <defs><linearGradient id="rg-${st}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${STATUS_COLOR[st]}"/><stop offset="1" stop-color="#8b7cff"/></linearGradient></defs>
    <circle cx="98" cy="98" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="12"/>
    <circle cx="98" cy="98" r="${r - 16}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1" stroke-dasharray="2 5"/>
    <circle class="arc" cx="98" cy="98" r="${r}" fill="none" stroke="url(#rg-${st})" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition: stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 0 8px ${STATUS_COLOR[st]}66)"/>
  </svg>`);
  const num = h('div', { class: 'num' }, '0');
  const el = h('div', { class: 'ring', role: 'img', 'aria-label': `Score ${score} out of 100, ${label}` }, ring, h('div', { class: 'val' }, num, h('div', { class: `lbl c-${st}` }, label)));
  const arc = ring.querySelector('.arc') as SVGCircleElement;
  const target = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const run = () => {
    arc.style.strokeDashoffset = String(target);
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      num.textContent = String(score);
      return;
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1000);
      const e = 1 - Math.pow(1 - k, 3);
      num.textContent = String(Math.round(score * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
  return el;
}

export function metricList(metrics: Metric[]): HTMLElement {
  const box = h('div', { class: 'metrics' });
  const order: Record<Status, number> = { poor: 0, fair: 1, good: 2, great: 3 };
  const sorted = [...metrics].sort((a, b) => order[a.status] - order[b.status]);
  for (const m of sorted) {
    const btn = h(
      'button',
      { class: 'metric', 'aria-expanded': m.status === 'poor' || m.status === 'fair' ? 'true' : 'false' },
      h('span', { class: `sd st-${m.status}`, 'aria-hidden': 'true' }),
      h('span', { class: 'ml' }, m.label),
      h('span', { class: 'mv' }, m.value),
      h('span', { class: 'md' }, m.detail),
      m.tip ? h('span', { class: 'mt' }, m.tip) : null,
    );
    btn.addEventListener('click', () => btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'));
    box.appendChild(btn);
  }
  return box;
}

export function toneBars(t: ToneBalance): HTMLElement {
  const fin = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  t = { ...t, bassDb: fin(t.bassDb), midDb: fin(t.midDb), trebleDb: fin(t.trebleDb) };
  const RANGE = 18;
  const pos = (db: number) => 50 + (Math.max(-RANGE, Math.min(RANGE, db)) / RANGE) * 50;
  const row = (label: string, db: number, lo: number, hi: number, note: string) => {
    const ok = db >= lo && db <= hi;
    const nearLo = ok && db < -4;
    const nearHi = ok && db > 4;
    return h('div', { class: 'eq-row' },
      h('div', { class: 'eq-l' }, label),
      h('div', { class: 'eq-track' },
        h('div', { class: 'eq-ok', style: `left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%` }),
        h('div', { class: 'eq-mid' }),
        h('div', { class: `eq-dot ${ok ? '' : 'off'}`, style: `left:${pos(db)}%` })),
      h('div', { class: 'eq-v' }, nearLo ? 'Slightly low' : nearHi ? 'Slightly high' : ok ? 'Natural' : note));
  };
  return h('div', { class: 'eq', role: 'img', 'aria-label': `Tone: bass ${t.bassDb.toFixed(0)} dB and treble ${t.trebleDb.toFixed(0)} dB compared with a natural voice` },
    row('Bass', t.bassDb, -11, 7, t.bassDb > 7 ? 'Boomy' : 'Thin'),
    row('Treble', t.trebleDb, -9, 7, t.trebleDb > 7 ? 'Harsh' : 'Muffled'),
    h('div', { class: 'eq-scale', 'aria-hidden': 'true' }, h('span', null, 'Less'), h('span', null, 'Natural'), h('span', null, 'More')));
}

export interface LevelMeter {
  el: HTMLElement;
  update(rmsDb: number, holdDb: number): void;
}

const METER_MIN = -80;
const METER_MAX = 0;
const pctFor = (db: number) => Math.max(0, Math.min(100, ((db - METER_MIN) / (METER_MAX - METER_MIN)) * 100));

/** Horizontal dBFS meter with a target zone (-30 … -12 dBFS) and peak hold. */
export function levelMeter(): LevelMeter {
  const fill = h('div', { class: 'fill' });
  const hold = h('div', { class: 'hold' });
  const zone = h('div', { class: 'zone', style: `left:${pctFor(-30)}%;width:${pctFor(-12) - pctFor(-30)}%` });
  const bar = h('div', { class: 'meter', role: 'meter', 'aria-label': 'Input level', 'aria-valuemin': METER_MIN, 'aria-valuemax': METER_MAX }, zone, fill, hold);
  const zoneLabel = h('div', { class: 'zone-label', style: `left:${pctFor(-30)}%;width:${pctFor(-12) - pctFor(-30)}%` }, 'Voice target');
  const el = h('div', null, h('div', { class: 'meter-wrap' }, zoneLabel, bar), h('div', { class: 'meter-scale', 'aria-hidden': 'true' }, h('span', null, '−80'), h('span', null, '−60'), h('span', null, '−40'), h('span', null, '−20'), h('span', null, '0 dB')));
  let smooth = METER_MIN;
  return {
    el,
    update(rmsDb, holdDb) {
      // fast attack, slower release for a readable meter
      smooth = rmsDb > smooth ? rmsDb : smooth * 0.85 + rmsDb * 0.15;
      const p = pctFor(smooth);
      fill.style.width = `${p}%`;
      fill.style.setProperty('--meter-w', `${p > 0 ? (100 / p) * 100 : 100}%`);
      hold.style.left = `calc(${pctFor(holdDb)}% - 2px)`;
      bar.setAttribute('aria-valuenow', String(Math.round(smooth)));
    },
  };
}

function logX(f: number, w: number, fMin: number, fMax: number) {
  return (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
}

/** Static frequency-response style chart of the voice and noise spectra. */
export function spectrumChart(points: SpectrumPoint[], sampleRate: number): HTMLElement {
  const canvas = h('canvas', { class: 'viz', role: 'img', 'aria-label': 'Frequency spectrum of your voice compared with the background noise' }) as HTMLCanvasElement;
  const wrap = h('div', null, canvas,
    h('div', { class: 'row small muted', style: 'justify-content:center;gap:16px;margin-top:8px' },
      h('span', null, h('span', { style: 'display:inline-block;width:10px;height:3px;border-radius:2px;background:#5cf2e3;margin-right:6px;vertical-align:middle' }), 'Your voice'),
      h('span', null, h('span', { style: 'display:inline-block;width:10px;height:3px;border-radius:2px;background:#8b7cff;margin-right:6px;vertical-align:middle' }), 'Background')));
  const draw = () => {
    const H = 170;
    const g = fitCanvas(canvas, H);
    const W = canvas.width / Math.min(window.devicePixelRatio || 1, 3);
    g.clearRect(0, 0, W, H);
    const fMin = 60;
    const fMax = Math.min(20000, sampleRate / 2);
    const pad = { l: 6, r: 6, t: 10, b: 22 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const finite = points.flatMap((p) => [p.speechDb, p.noiseDb]).filter((v) => isFinite(v) && v > -140);
    const top = Math.max(...finite, -40) + 4;
    const bottom = top - 80;
    const y = (db: number) => pad.t + ih * (1 - (Math.max(bottom, Math.min(top, db)) - bottom) / (top - bottom));
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    g.fillStyle = 'rgba(154,167,186,0.8)';
    g.font = '10px "JetBrains Mono Variable", monospace';
    g.textAlign = 'center';
    for (const f of [100, 300, 1000, 3000, 10000]) {
      if (f > fMax) continue;
      const x = pad.l + logX(f, iw, fMin, fMax);
      g.beginPath();
      g.moveTo(x, pad.t);
      g.lineTo(x, pad.t + ih);
      g.stroke();
      g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x, H - 6);
    }
    // speech-band highlight
    g.fillStyle = 'rgba(92,242,227,0.035)';
    const x1 = pad.l + logX(300, iw, fMin, fMax);
    const x2 = pad.l + logX(Math.min(3400, fMax), iw, fMin, fMax);
    g.fillRect(x1, pad.t, x2 - x1, ih);

    const line = (key: 'speechDb' | 'noiseDb', color: string, fillTo: boolean) => {
      g.beginPath();
      let started = false;
      for (const p of points) {
        if (p.f < fMin || p.f > fMax) continue;
        const x = pad.l + logX(p.f, iw, fMin, fMax);
        const yy = y(p[key]);
        if (!started) { g.moveTo(x, yy); started = true; } else g.lineTo(x, yy);
      }
      if (fillTo && started) {
        g.save();
        const last = points.filter((p) => p.f >= fMin && p.f <= fMax);
        const lx = pad.l + logX(last[last.length - 1].f, iw, fMin, fMax);
        const fx = pad.l + logX(last[0].f, iw, fMin, fMax);
        g.lineTo(lx, pad.t + ih);
        g.lineTo(fx, pad.t + ih);
        g.closePath();
        const grad = g.createLinearGradient(0, pad.t, 0, pad.t + ih);
        grad.addColorStop(0, color + '55');
        grad.addColorStop(1, color + '00');
        g.fillStyle = grad;
        g.fill();
        g.restore();
        // redraw stroke cleanly
        g.beginPath();
        started = false;
        for (const p of last) {
          const x = pad.l + logX(p.f, iw, fMin, fMax);
          if (!started) { g.moveTo(x, y(p[key])); started = true; } else g.lineTo(x, y(p[key]));
        }
      }
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.shadowColor = color;
      g.shadowBlur = 8;
      g.stroke();
      g.shadowBlur = 0;
    };
    if (points.length) {
      line('noiseDb', '#8b7cff', false);
      line('speechDb', '#5cf2e3', true);
    }
  };
  requestAnimationFrame(draw);
  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);
  return wrap;
}

/** Animated live spectrum bars driven by an AnalyserNode. Returns a stop function. */
export function liveSpectrum(canvas: HTMLCanvasElement, analyser: AnalyserNode, height = 150): () => void {
  const bins = new Float32Array(analyser.frequencyBinCount);
  const sr = analyser.context.sampleRate;
  const nBars = 40;
  const fMin = 60;
  const fMax = Math.min(16000, sr / 2);
  const smooth = new Float32Array(nBars);
  let raf = 0;
  let running = true;
  const frame = () => {
    if (!running) return;
    const g = fitCanvas(canvas, height);
    const W = canvas.width / Math.min(window.devicePixelRatio || 1, 3);
    const H = height;
    analyser.getFloatFrequencyData(bins);
    g.clearRect(0, 0, W, H);
    const gap = 3;
    const bw = (W - gap * (nBars - 1)) / nBars;
    for (let i = 0; i < nBars; i++) {
      const f1 = fMin * Math.pow(fMax / fMin, i / nBars);
      const f2 = fMin * Math.pow(fMax / fMin, (i + 1) / nBars);
      const k1 = Math.max(1, Math.floor((f1 / sr) * analyser.fftSize));
      const k2 = Math.max(k1, Math.ceil((f2 / sr) * analyser.fftSize));
      let m = -140;
      for (let k = k1; k <= k2 && k < bins.length; k++) m = Math.max(m, bins[k]);
      const v = Math.max(0, Math.min(1, (m + 100) / 75));
      smooth[i] = v > smooth[i] ? v : smooth[i] * 0.86 + v * 0.14;
      const bh = Math.max(2, smooth[i] * (H - 8));
      const x = i * (bw + gap);
      const grad = g.createLinearGradient(0, H, 0, H - bh);
      grad.addColorStop(0, 'rgba(92,242,227,0.25)');
      grad.addColorStop(1, i / nBars > 0.7 ? '#8b7cff' : '#5cf2e3');
      g.fillStyle = grad;
      const r = Math.min(3, bw / 2);
      g.beginPath();
      g.roundRect ? g.roundRect(x, H - bh, bw, bh, [r, r, 1, 1]) : g.rect(x, H - bh, bw, bh);
      g.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}

/** Draws a recorded waveform summary (min/max per column). */
export function waveformCanvas(samples: Float32Array, height = 64): { el: HTMLCanvasElement; setProgress(p: number): void } {
  const canvas = h('canvas', { class: 'viz', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  let progress = -1;
  let cols: Float32Array | null = null;
  let colsFor = 0;
  const columns = (n: number) => {
    if (cols && colsFor === n) return cols;
    const out = new Float32Array(n);
    const per = Math.max(1, Math.floor(samples.length / n));
    let peak = 0;
    for (let c = 0; c < n; c++) {
      let mx = 0;
      const end = Math.min(samples.length, (c + 1) * per);
      for (let i = c * per; i < end; i++) {
        const a = Math.abs(samples[i]);
        if (a > mx) mx = a;
      }
      out[c] = mx;
      if (mx > peak) peak = mx;
    }
    if (peak > 0) for (let c = 0; c < n; c++) out[c] /= peak;
    cols = out;
    colsFor = n;
    return out;
  };
  const draw = () => {
    const g = fitCanvas(canvas, height);
    const W = canvas.width / Math.min(window.devicePixelRatio || 1, 3);
    g.clearRect(0, 0, W, height);
    const n = Math.max(1, Math.floor(W / 3));
    const cs = columns(n);
    for (let c = 0; c < n; c++) {
      const bh = Math.max(1.5, cs[c] * (height - 6));
      g.fillStyle = progress >= 0 && c / n <= progress ? '#5cf2e3' : 'rgba(154,167,186,0.45)';
      g.fillRect(c * 3, (height - bh) / 2, 2, bh);
    }
  };
  requestAnimationFrame(draw);
  return {
    el: canvas,
    setProgress(p: number) {
      progress = p;
      draw();
    },
  };
}

export function notice(kind: 'warn' | 'error' | 'info', text: string | Node, iconName: IconName = kind === 'info' ? 'info' : 'alert'): HTMLElement {
  return h('div', { class: `notice ${kind === 'warn' ? '' : kind}`, role: kind === 'error' ? 'alert' : 'note' }, icon(iconName), h('div', null, text));
}

export function chip(text: string, cls = ''): HTMLElement {
  return h('span', { class: `chip ${cls}` }, h('span', { class: 'dot' }), text);
}

export function toggle(label: string, sub: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'aria-label': label });
  sw.addEventListener('click', () => {
    const v = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', v ? 'true' : 'false');
    onChange(v);
  });
  return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, label), h('div', { class: 'small muted' }, sub)), sw);
}

export function segmented<T extends string>(options: Array<[T, string]>, value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg', role: 'group' });
  for (const [v, label] of options) {
    const b = h('button', { 'aria-pressed': v === value ? 'true' : 'false' }, label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onChange(v);
    });
    wrap.appendChild(b);
  }
  return wrap;
}

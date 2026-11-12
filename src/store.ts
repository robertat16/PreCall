import type { EchoReport, MicReport } from './audio/analysis';
import type { CameraReport } from './camera/analysis';
import type { RouteKind } from './native/audioRoute';

/** Compact, serialisable copy of a mic report (no spectrum arrays bloat beyond ~40 points). */
export type StoredMic = Omit<MicReport, 'sampleRate'> & { sampleRate: number };

export interface HistoryEntry {
  id: string;
  kind: 'full' | 'mic' | 'camera';
  createdAt: number;
  device: string;
  score: number;
  mic?: StoredMic;
  echo?: EchoReport;
  camera?: CameraReport;
  processing?: boolean;
}

export interface Settings {
  processing: boolean;
  route: RouteKind;
  deviceId: string;
  promptIndex: number;
}

const HISTORY_KEY = 'precall.history.v1';
const SETTINGS_KEY = 'precall.settings.v1';
const MAX_HISTORY = 40;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: results simply aren't kept */
  }
}

const defaults: Settings = { processing: false, route: 'default', deviceId: '', promptIndex: 0 };

export function getSettings(): Settings {
  return { ...defaults, ...read<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function setSettings(patch: Partial<Settings>): Settings {
  const s = { ...getSettings(), ...patch };
  write(SETTINGS_KEY, s);
  return s;
}

export function getHistory(): HistoryEntry[] {
  const list = read<HistoryEntry[]>(HISTORY_KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
}

export function addHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): HistoryEntry {
  const full: HistoryEntry = { ...entry, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
  const list = [full, ...getHistory()].slice(0, MAX_HISTORY);
  write(HISTORY_KEY, list);
  return full;
}

export function getEntry(id: string): HistoryEntry | undefined {
  return getHistory().find((e) => e.id === id);
}

export function deleteEntry(id: string): void {
  write(HISTORY_KEY, getHistory().filter((e) => e.id !== id));
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}

export const PROMPTS = [
  'The quick brown fox jumps over the lazy dog, then sips some fresh coffee before the morning call.',
  'Six thick thistle sticks. She sells seashells by the seashore, and the shells she sells are surely seashells.',
  'Can everyone hear me okay? Let me share my screen and we can walk through the numbers for this quarter.',
  'Peter Piper picked a peck of pickled peppers. How many pickled peppers did Peter Piper pick?',
  'Testing, one, two, three. Bass, mids and treble: a deep hum, a clear voice, and a crisp sharp “s”.',
];

export function nextPrompt(): string {
  const s = getSettings();
  const p = PROMPTS[s.promptIndex % PROMPTS.length];
  setSettings({ promptIndex: (s.promptIndex + 1) % PROMPTS.length });
  return p;
}

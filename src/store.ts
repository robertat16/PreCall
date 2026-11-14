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
  'Hi everyone, thanks for joining. Today we’ll review the project schedule, walk through a few open questions, and agree on next steps.',
  'Can everyone hear me okay? Let me share my screen, and we can go through the numbers for this quarter together.',
  'Thanks for having me. I’m excited to talk about this role and share a little about my background and recent projects.',
  'Good morning. Before we start, I’d like to quickly recap last week’s discussion so everyone is on the same page.',
  'Let’s take a moment for questions. If anything isn’t clear, please speak up, and I’ll be happy to explain it again.',
  'Sorry, I think you cut out for a second. Could you repeat that last part? I want to make sure I understood it correctly.',
  'To summarize, we’ll finalize the design this week, send it out for review on Friday, and meet again next Tuesday.',
  'Hello, this is a quick sound check. I’m speaking at my normal volume, the same way I would on a real call.',
];

export function nextPrompt(): string {
  const s = getSettings();
  const p = PROMPTS[s.promptIndex % PROMPTS.length];
  setSettings({ promptIndex: (s.promptIndex + 1) % PROMPTS.length });
  return p;
}

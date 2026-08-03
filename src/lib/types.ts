export type Minutes = 2 | 5 | 15 | 30 | 60;
export type Place = 'desk' | 'phone' | 'home' | 'anywhere';

export const MINUTES: Minutes[] = [2, 5, 15, 30, 60];
export const PLACES: Place[] = ['desk', 'phone', 'home', 'anywhere'];

// A "context place" is one the user can be in. Cards can additionally be 'anywhere'.
export type ContextPlace = 'desk' | 'phone' | 'home';
export const CONTEXT_PLACES: ContextPlace[] = ['desk', 'phone', 'home'];
export const PLACE_LABELS: Record<ContextPlace, string> = {
  desk: 'Trading desk',
  phone: 'On the move',
  home: 'Home',
};

export interface Thread {
  id: string;
  name: string;
  hue: number; // 0-360, used for a single 3px edge marker
  // 'deleted' is a tombstone: hidden everywhere but kept so the removal
  // propagates through sync instead of being resurrected by a merge.
  status: 'active' | 'parked' | 'deleted';
  createdAt: number;
  updatedAt: number; // sync revision: bumped on every mutation
}

export interface Card {
  id: string;
  threadId: string;
  action: string; // imperative, one line
  reload: string; // 1-3 lines. Everything needed to start cold.
  minutes: Minutes;
  place: Place;
  priority: 0 | 1 | 2 | 3;
  deadline: number | null;
  waitingOn: string | null;
  waitingSince: number | null;
  lastNudged: number | null;
  status: 'open' | 'done' | 'dropped';
  snoozeUntil: number | null;
  createdAt: number;
  lastTouchedAt: number; // feeds the staleness score (not bumped by snooze)
  updatedAt: number; // sync revision: bumped on every mutation
}

export interface SessionLog {
  id: string;
  at: number;
  minutesRequested: Minutes;
  place: Place;
  cardId: string | null;
  outcome: 'done' | 'skip' | 'snooze' | 'abandoned';
  secondsToAction: number;
}

export interface Settings {
  installedAt: number;
  openedDays: string[]; // YYYY-MM-DD, local time, deduped
  apiKey: string | null; // Anthropic API key for the capture parse call
  lastThreadId: string | null; // default thread for capture
  syncKey: string | null; // shared secret naming the sync location; null = off
}

export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function dayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const DAY_MS = 86400000;

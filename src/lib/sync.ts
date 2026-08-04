import type { Card, SessionLog, Thread } from './types';
import {
  loadCards,
  loadSessions,
  loadSettings,
  loadThreads,
  saveCards,
  saveSessions,
  saveSettings,
  saveThreads,
  SCHEMA_VERSION,
} from './storage';

// Multi-device sync over the Firebase Realtime Database REST API — plain
// fetch, no SDK. One JSON document per sync key; devices sharing the key
// converge via a record-level last-write-wins merge on updatedAt, so a
// capture on the phone and a completion at the desk never clobber each
// other. Triggered on boot, focus, reconnect, a timer, and (debounced)
// after local mutations. The app never blocks on it.

const DB_URL = 'https://familyhub-d72f8-default-rtdb.firebaseio.com';

export interface SyncPayload {
  schemaVersion: number;
  threads: Thread[];
  cards: Card[];
  sessions: SessionLog[];
  openedDays: string[];
  installedAt: number;
}

// RTDB strips null values and empty arrays on write; restore the exact
// shapes the app's types promise.
function normalizeCard(c: Partial<Card>): Card {
  return {
    id: c.id!,
    threadId: c.threadId!,
    action: c.action ?? '',
    reload: c.reload ?? '',
    minutes: c.minutes ?? 5,
    place: c.place ?? 'anywhere',
    priority: c.priority ?? 0,
    recurs: c.recurs ?? null,
    deadline: c.deadline ?? null,
    waitingOn: c.waitingOn ?? null,
    waitingSince: c.waitingSince ?? null,
    lastNudged: c.lastNudged ?? null,
    status: c.status ?? 'open',
    snoozeUntil: c.snoozeUntil ?? null,
    createdAt: c.createdAt ?? 0,
    lastTouchedAt: c.lastTouchedAt ?? c.createdAt ?? 0,
    updatedAt: c.updatedAt ?? c.lastTouchedAt ?? c.createdAt ?? 0,
  };
}

function normalizeThread(t: Partial<Thread>): Thread {
  return {
    id: t.id!,
    name: t.name ?? '',
    hue: t.hue ?? 210,
    status: t.status ?? 'active',
    createdAt: t.createdAt ?? 0,
    updatedAt: t.updatedAt ?? t.createdAt ?? 0,
  };
}

export function normalizePayload(raw: unknown): SyncPayload {
  const p = (raw ?? {}) as Partial<SyncPayload>;
  return {
    schemaVersion: p.schemaVersion ?? SCHEMA_VERSION,
    threads: (p.threads ?? []).filter((t) => t && t.id).map(normalizeThread),
    cards: (p.cards ?? []).filter((c) => c && c.id).map(normalizeCard),
    sessions: (p.sessions ?? []).filter((s) => s && s.id),
    openedDays: p.openedDays ?? [],
    installedAt: p.installedAt ?? Date.now(),
  };
}

export function mergePayloads(a: SyncPayload, b: SyncPayload): SyncPayload {
  const sessions = new Map<string, SessionLog>();
  for (const s of [...a.sessions, ...b.sessions]) sessions.set(s.id, s);
  return {
    schemaVersion: Math.max(a.schemaVersion, b.schemaVersion),
    threads: mergeById(a.threads, b.threads),
    cards: mergeById(a.cards, b.cards),
    sessions: [...sessions.values()].sort((x, y) => x.at - y.at),
    openedDays: [...new Set([...a.openedDays, ...b.openedDays])].sort(),
    installedAt: Math.min(a.installedAt, b.installedAt),
  };
}

function mergeById<T extends { id: string; updatedAt: number; createdAt: number }>(
  a: T[],
  b: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()].sort(
    (x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1)
  );
}

export function collectLocal(): SyncPayload {
  const settings = loadSettings();
  return normalizePayload({
    schemaVersion: SCHEMA_VERSION,
    threads: loadThreads(),
    cards: loadCards(),
    sessions: loadSessions(),
    openedDays: settings.openedDays,
    installedAt: settings.installedAt,
  });
}

function applyLocal(merged: SyncPayload): void {
  saveThreads(merged.threads);
  saveCards(merged.cards);
  saveSessions(merged.sessions);
  const settings = loadSettings();
  saveSettings({
    ...settings,
    openedDays: merged.openedDays,
    installedAt: merged.installedAt,
  });
}

export type SyncResult = 'applied' | 'pushed' | 'nochange';

export async function syncNow(key: string): Promise<SyncResult> {
  const url = `${DB_URL}/reload/${encodeURIComponent(key)}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sync read failed (${res.status})`);
  const rawRemote = await res.json();

  const remote = normalizePayload(rawRemote);
  if (rawRemote !== null && remote.schemaVersion > SCHEMA_VERSION) {
    throw new Error('remote data is from a newer app version — refresh this device');
  }

  const local = collectLocal();
  const merged = rawRemote === null ? local : mergePayloads(local, remote);

  const changedLocal = JSON.stringify(merged) !== JSON.stringify(local);
  if (changedLocal) applyLocal(merged);

  const changedRemote =
    rawRemote === null || JSON.stringify(merged) !== JSON.stringify(remote);
  if (changedRemote) {
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(merged),
    });
    if (!put.ok) throw new Error(`sync write failed (${put.status})`);
  }

  return changedLocal ? 'applied' : changedRemote ? 'pushed' : 'nochange';
}

export function newSyncKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

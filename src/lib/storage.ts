import type { Card, SessionLog, Settings, Thread } from './types';

export const SCHEMA_VERSION = 1;

export const KEYS = {
  threads: 'reload.threads',
  cards: 'reload.cards',
  sessions: 'reload.sessions',
  settings: 'reload.settings',
  schemaVersion: 'reload.schemaVersion',
} as const;

// Injectable for tests; defaults to window.localStorage.
export type StorageLike = Pick<
  globalThis.Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

let store: StorageLike =
  typeof localStorage !== 'undefined' ? localStorage : memoryStorage();

export function setStorage(s: StorageLike) {
  store = s;
}

export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  store.setItem(key, JSON.stringify(value));
}

export function loadThreads(): Thread[] {
  return read<Thread[]>(KEYS.threads, []);
}
export function saveThreads(threads: Thread[]) {
  write(KEYS.threads, threads);
}
export function loadCards(): Card[] {
  return read<Card[]>(KEYS.cards, []);
}
export function saveCards(cards: Card[]) {
  write(KEYS.cards, cards);
}
export function loadSessions(): SessionLog[] {
  return read<SessionLog[]>(KEYS.sessions, []);
}
export function saveSessions(sessions: SessionLog[]) {
  write(KEYS.sessions, sessions);
}
export function loadSettings(): Settings {
  return read<Settings>(KEYS.settings, defaultSettings());
}
export function saveSettings(settings: Settings) {
  write(KEYS.settings, settings);
}

export function defaultSettings(): Settings {
  return {
    installedAt: Date.now(),
    openedDays: [],
    apiKey: null,
    lastThreadId: null,
  };
}

export function hasAnyData(): boolean {
  return (
    store.getItem(KEYS.threads) !== null || store.getItem(KEYS.cards) !== null
  );
}

// ---------------------------------------------------------------------------
// Migrations. Every future schema change adds a step here; never a silent
// overwrite. Step at index i migrates version i -> i+1.
// ---------------------------------------------------------------------------

const migrations: Array<() => void> = [
  // 0 -> 1: initial schema. Nothing to transform; keys are created lazily.
  () => {},
];

export function migrate(): void {
  const raw = store.getItem(KEYS.schemaVersion);
  let version = raw === null ? 0 : Number(raw) || 0;
  if (version >= SCHEMA_VERSION) return;
  while (version < SCHEMA_VERSION) {
    migrations[version]();
    version += 1;
    // eslint-disable-next-line no-console
    console.log(`reload: migrated schema to v${version}`);
  }
  store.setItem(KEYS.schemaVersion, String(SCHEMA_VERSION));
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export interface ExportBlob {
  app: 'reload';
  schemaVersion: number;
  exportedAt: number;
  threads: Thread[];
  cards: Card[];
  sessions: SessionLog[];
  settings: Settings;
}

export function exportData(): string {
  const blob: ExportBlob = {
    app: 'reload',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    threads: loadThreads(),
    cards: loadCards(),
    sessions: loadSessions(),
    settings: loadSettings(),
  };
  return JSON.stringify(blob);
}

export interface ImportSummary {
  threads: number;
  cards: number;
  sessions: number;
  replacesThreads: number;
  replacesCards: number;
}

export function validateImport(json: string): ExportBlob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Not valid JSON.');
  }
  const b = parsed as Partial<ExportBlob>;
  if (b.app !== 'reload') throw new Error('Not a RELOAD export.');
  if (typeof b.schemaVersion !== 'number')
    throw new Error('Missing schemaVersion.');
  if (b.schemaVersion > SCHEMA_VERSION)
    throw new Error(
      `Export is schema v${b.schemaVersion}; this app is v${SCHEMA_VERSION}.`
    );
  if (!Array.isArray(b.threads) || !Array.isArray(b.cards) || !Array.isArray(b.sessions))
    throw new Error('Malformed export: missing arrays.');
  for (const t of b.threads) {
    if (typeof t.id !== 'string' || typeof t.name !== 'string')
      throw new Error('Malformed thread entry.');
  }
  for (const c of b.cards) {
    if (typeof c.id !== 'string' || typeof c.action !== 'string')
      throw new Error('Malformed card entry.');
  }
  return b as ExportBlob;
}

export function importSummary(blob: ExportBlob): ImportSummary {
  return {
    threads: blob.threads.length,
    cards: blob.cards.length,
    sessions: blob.sessions.length,
    replacesThreads: loadThreads().length,
    replacesCards: loadCards().length,
  };
}

// Full replace, never a merge.
export function applyImport(blob: ExportBlob): void {
  saveThreads(blob.threads);
  saveCards(blob.cards);
  saveSessions(blob.sessions);
  saveSettings(blob.settings ?? defaultSettings());
  store.setItem(KEYS.schemaVersion, String(blob.schemaVersion));
  migrate(); // bring an older export up to the current schema
}

// Reset leaves threads/cards as explicit empty arrays rather than removing the
// keys: the seeder only fills truly-untouched storage, so a deliberate reset
// stays empty on the next visit instead of resurrecting the demo data.
export function wipeAll(): void {
  saveThreads([]);
  saveCards([]);
  store.removeItem(KEYS.sessions);
  store.removeItem(KEYS.settings);
  store.removeItem(KEYS.schemaVersion);
}

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyImport,
  exportData,
  importSummary,
  KEYS,
  loadCards,
  loadSessions,
  loadSettings,
  loadThreads,
  memoryStorage,
  migrate,
  saveCards,
  saveSessions,
  saveSettings,
  saveThreads,
  SCHEMA_VERSION,
  setStorage,
  validateImport,
  wipeAll,
  type StorageLike,
} from './storage';
import { buildSeed, maybeSeed } from './seed';
import type { Card, SessionLog, Settings, Thread } from './types';

let store: StorageLike;

beforeEach(() => {
  store = memoryStorage();
  setStorage(store);
});

describe('migrate', () => {
  it('stamps the schema version on first boot', () => {
    expect(store.getItem(KEYS.schemaVersion)).toBeNull();
    migrate();
    expect(store.getItem(KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));
  });

  it('is idempotent', () => {
    migrate();
    migrate();
    expect(store.getItem(KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));
  });
});

describe('migration v2: demo-data removal', () => {
  it('strips seed cards and empty seed threads, keeps everything user-entered', () => {
    const NOW = 1_700_000_000_000;
    const { threads, cards } = buildSeed(NOW);
    const house = threads.find((t) => t.name === 'House')!;
    const userThread: Thread = {
      id: 'u-thread',
      name: 'My project',
      hue: 10,
      status: 'active',
      createdAt: NOW,
    };
    const userCard = (id: string, threadId: string): Card => ({
      id,
      threadId,
      action: `user task ${id}`,
      reload: '',
      minutes: 5,
      place: 'desk',
      priority: 0,
      deadline: null,
      waitingOn: null,
      waitingSince: null,
      lastNudged: null,
      status: 'open',
      snoozeUntil: null,
      createdAt: NOW,
      lastTouchedAt: NOW,
    });
    saveThreads([...threads, userThread]);
    saveCards([...cards, userCard('uc1', house.id), userCard('uc2', userThread.id)]);
    store.setItem(KEYS.schemaVersion, '1'); // simulate an existing v1 install

    migrate();

    expect(loadCards().map((c) => c.id).sort()).toEqual(['uc1', 'uc2']);
    // House survives because a user card lives in it; other seed threads go.
    expect(loadThreads().map((t) => t.name).sort()).toEqual(['House', 'My project']);
    expect(store.getItem(KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));
  });

  it('leaves a fresh post-seed install untouched (stamped before seeding)', () => {
    migrate(); // fresh install stamps v2 first
    const { threads, cards } = buildSeed(1_700_000_000_000);
    saveThreads(threads);
    saveCards(cards);
    migrate(); // boot again — already v2, no cleanup
    expect(loadThreads()).toHaveLength(9);
    expect(loadCards()).toHaveLength(cards.length);
  });
});

describe('export / import round trip', () => {
  it('restores everything, including session logs, after a wipe', () => {
    migrate();
    const { threads, cards } = buildSeed(1_700_000_000_000);
    const sessions: SessionLog[] = [
      {
        id: 's1',
        at: 1_700_000_100_000,
        minutesRequested: 5,
        place: 'desk',
        cardId: cards[0].id,
        outcome: 'done',
        secondsToAction: 4.2,
      },
    ];
    const settings: Settings = {
      installedAt: 1_699_999_000_000,
      openedDays: ['2023-11-14'],
      apiKey: null,
      lastThreadId: threads[0].id,
    };
    saveThreads(threads);
    saveCards(cards);
    saveSessions(sessions);
    saveSettings(settings);

    const json = exportData();

    wipeAll();
    expect(loadThreads()).toEqual([]);
    expect(loadCards()).toEqual([]);
    expect(loadSessions()).toEqual([]);

    const blob = validateImport(json);
    const summary = importSummary(blob);
    expect(summary.threads).toBe(9);
    expect(summary.cards).toBe(cards.length);
    expect(summary.sessions).toBe(1);

    applyImport(blob);
    expect(loadThreads()).toEqual(threads);
    expect(loadCards()).toEqual(cards);
    expect(loadSessions()).toEqual(sessions);
    expect(loadSettings()).toEqual(settings);
    expect(store.getItem(KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));
  });

  it('rejects garbage, foreign JSON, and future schema versions', () => {
    expect(() => validateImport('not json')).toThrow('Not valid JSON.');
    expect(() => validateImport('{"foo": 1}')).toThrow('Not a RELOAD export.');
    expect(() =>
      validateImport(
        JSON.stringify({
          app: 'reload',
          schemaVersion: SCHEMA_VERSION + 1,
          threads: [],
          cards: [],
          sessions: [],
        })
      )
    ).toThrow(/schema v/);
    expect(() =>
      validateImport(JSON.stringify({ app: 'reload', schemaVersion: 1, threads: {} }))
    ).toThrow('Malformed export: missing arrays.');
  });

  it('a reset stays empty: the seeder does not refill wiped storage', () => {
    migrate();
    const { threads, cards } = buildSeed(1_700_000_000_000);
    saveThreads(threads);
    saveCards(cards);
    wipeAll();
    maybeSeed(false);
    expect(loadThreads()).toEqual([]);
    expect(loadCards()).toEqual([]);
  });

  it('never merges: import fully replaces existing data', () => {
    migrate();
    const a = buildSeed(1_700_000_000_000);
    saveThreads(a.threads);
    saveCards(a.cards);
    const json = exportData();

    // mutate current state
    saveCards([...a.cards.slice(0, 1)]);
    saveThreads([...a.threads.slice(0, 2)]);

    applyImport(validateImport(json));
    expect(loadCards()).toHaveLength(a.cards.length);
    expect(loadThreads()).toHaveLength(9);
  });
});

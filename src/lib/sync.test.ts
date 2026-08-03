import { describe, expect, it } from 'vitest';
import type { Card, SessionLog, Thread } from './types';
import { mergePayloads, normalizePayload, type SyncPayload } from './sync';
import { SCHEMA_VERSION } from './storage';

const NOW = 1_700_000_000_000;

function card(id: string, updatedAt: number, over: Partial<Card> = {}): Card {
  return {
    id,
    threadId: 'th1',
    action: `task ${id}`,
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
    updatedAt,
    ...over,
  };
}

function payload(over: Partial<SyncPayload> = {}): SyncPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    threads: [],
    cards: [],
    sessions: [],
    openedDays: [],
    installedAt: NOW,
    ...over,
  };
}

describe('mergePayloads', () => {
  it('newer revision wins per card; both sides keep their unique cards', () => {
    const doneAtDesk = card('c1', NOW + 2000, { status: 'done' });
    const staleCopy = card('c1', NOW + 1000, { status: 'open' });
    const phoneCapture = card('c2', NOW + 500);
    const merged = mergePayloads(
      payload({ cards: [staleCopy, phoneCapture] }),
      payload({ cards: [doneAtDesk] })
    );
    expect(merged.cards).toHaveLength(2);
    expect(merged.cards.find((c) => c.id === 'c1')!.status).toBe('done');
    expect(merged.cards.some((c) => c.id === 'c2')).toBe(true);
  });

  it('merges threads the same way (park state converges)', () => {
    const parked: Thread = {
      id: 't1',
      name: 'House',
      hue: 45,
      status: 'parked',
      createdAt: NOW,
      updatedAt: NOW + 100,
    };
    const active: Thread = { ...parked, status: 'active', updatedAt: NOW };
    const merged = mergePayloads(payload({ threads: [active] }), payload({ threads: [parked] }));
    expect(merged.threads[0].status).toBe('parked');
  });

  it('unions session logs and opened days; keeps the earliest install date', () => {
    const log = (id: string): SessionLog => ({
      id,
      at: NOW,
      minutesRequested: 5,
      place: 'desk',
      cardId: null,
      outcome: 'skip',
      secondsToAction: 1,
    });
    const merged = mergePayloads(
      payload({ sessions: [log('a'), log('b')], openedDays: ['2026-08-01'], installedAt: NOW }),
      payload({ sessions: [log('b'), log('c')], openedDays: ['2026-08-02'], installedAt: NOW - 5 })
    );
    expect(merged.sessions.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
    expect(merged.openedDays).toEqual(['2026-08-01', '2026-08-02']);
    expect(merged.installedAt).toBe(NOW - 5);
  });

  it('is commutative: same result whichever device merges first', () => {
    const a = payload({ cards: [card('c1', NOW + 1), card('c2', NOW)] });
    const b = payload({ cards: [card('c1', NOW + 9, { status: 'done' }), card('c3', NOW)] });
    expect(mergePayloads(a, b)).toEqual(mergePayloads(b, a));
  });
});

describe('normalizePayload', () => {
  it('restores fields RTDB strips: empty arrays and null values', () => {
    const p = normalizePayload({
      schemaVersion: 3,
      installedAt: NOW,
      cards: [
        {
          id: 'c1',
          threadId: 'th1',
          action: 'a',
          minutes: 5,
          place: 'desk',
          priority: 0,
          status: 'open',
          createdAt: NOW,
          lastTouchedAt: NOW,
          updatedAt: NOW,
          // deadline / waitingOn / snoozeUntil etc. stripped by RTDB
        },
      ],
    });
    expect(p.threads).toEqual([]);
    expect(p.sessions).toEqual([]);
    expect(p.openedDays).toEqual([]);
    const c = p.cards[0];
    expect(c.deadline).toBeNull();
    expect(c.waitingOn).toBeNull();
    expect(c.snoozeUntil).toBeNull();
    expect(c.reload).toBe('');
  });

  it('treats an empty remote as an empty payload', () => {
    const p = normalizePayload(null);
    expect(p.cards).toEqual([]);
    expect(p.threads).toEqual([]);
  });
});

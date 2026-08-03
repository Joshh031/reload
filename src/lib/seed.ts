import type { Card, Thread } from './types';
import { DAY_MS, newId } from './types';
import { hasAnyData, saveCards, saveThreads } from './storage';
import { HUES, SEED, THREAD_NAMES } from './seedData';

export function buildSeed(now = Date.now()): { threads: Thread[]; cards: Card[] } {
  const threads: Thread[] = THREAD_NAMES.map((name, i) => ({
    id: newId() + i,
    name,
    hue: HUES[i],
    status: 'active',
    createdAt: now - 30 * DAY_MS,
    updatedAt: now - 30 * DAY_MS,
  }));
  const cards: Card[] = [];
  for (const thread of threads) {
    for (const s of SEED[thread.name]) {
      const created = now - (s.ageDays ?? 0) * DAY_MS;
      cards.push({
        id: newId() + cards.length,
        threadId: thread.id,
        action: s.action,
        reload: s.reload,
        minutes: s.minutes,
        place: s.place,
        priority: s.priority ?? 0,
        deadline: s.deadlineDays != null ? now + s.deadlineDays * DAY_MS : null,
        waitingOn: s.waitingOn ?? null,
        waitingSince: s.waitingOn ? now - (s.waitingDays ?? 0) * DAY_MS : null,
        lastNudged: null,
        status: 'open',
        snoozeUntil: null,
        createdAt: created,
        lastTouchedAt: created,
        updatedAt: created,
      });
    }
  }
  return { threads, cards };
}

// Seeds only when storage is empty; skippable with ?empty.
export function maybeSeed(skip: boolean): void {
  if (skip || hasAnyData()) return;
  const { threads, cards } = buildSeed();
  saveThreads(threads);
  saveCards(cards);
}

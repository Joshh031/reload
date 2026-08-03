import type { Card, ContextPlace, Minutes, Thread } from './types';
import { DAY_MS } from './types';

// Deterministic ranking. Same inputs always produce the same card.

export interface RankContext {
  now: number;
  minutes: Minutes;
  place: ContextPlace;
  skippedIds?: ReadonlySet<string>;
}

export interface ScoreTerms {
  priority: number;
  deadlineUrgency: number;
  staleness: number;
  threadStarvation: number;
  fitBonus: number;
  waitingPenalty: number;
  total: number;
}

const NUDGE_QUIET_DAYS = 5;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS);
}

// Last completion time for a thread: most recent lastTouchedAt among its done
// cards, else the thread's creation time (see DECISIONS.md).
export function threadLastCompleted(thread: Thread, cards: Card[]): number {
  let last = thread.createdAt;
  for (const c of cards) {
    if (c.threadId === thread.id && c.status === 'done' && c.lastTouchedAt > last) {
      last = c.lastTouchedAt;
    }
  }
  return last;
}

export function passesFilters(
  card: Card,
  threadsById: Map<string, Thread>,
  ctx: RankContext
): boolean {
  if (card.status !== 'open') return false;
  const thread = threadsById.get(card.threadId);
  if (!thread || thread.status !== 'active') return false;
  if (card.snoozeUntil !== null && card.snoozeUntil > ctx.now) return false;
  if (card.minutes > ctx.minutes) return false;
  if (card.place !== 'anywhere' && card.place !== ctx.place) return false;
  if (ctx.skippedIds?.has(card.id)) return false;
  return true;
}

export function scoreTerms(
  card: Card,
  thread: Thread,
  cards: Card[],
  ctx: RankContext
): ScoreTerms {
  const priority = card.priority * 25;

  let deadlineUrgency = 0;
  if (card.deadline !== null) {
    const daysUntil = Math.ceil((card.deadline - ctx.now) / DAY_MS);
    deadlineUrgency = clamp(60 - daysUntil, 0, 60);
    if (card.deadline < ctx.now) deadlineUrgency *= 2;
  }

  const staleness = Math.min(daysBetween(card.lastTouchedAt, ctx.now) * 1.5, 30);

  const threadStarvation = Math.min(
    daysBetween(threadLastCompleted(thread, cards), ctx.now) * 2,
    40
  );

  const fitBonus = card.minutes <= ctx.minutes / 2 ? 15 : 0;

  // Blocked cards are suppressed while the clock (last nudge, or when the
  // wait started) is fresh; after NUDGE_QUIET_DAYS quiet days they surface
  // again as nudge-worthy. See DECISIONS.md.
  let waitingPenalty = 0;
  if (card.waitingOn !== null) {
    const ref = card.lastNudged ?? card.waitingSince;
    if (ref !== null && daysBetween(ref, ctx.now) < NUDGE_QUIET_DAYS) {
      waitingPenalty = 50;
    }
  }

  const total =
    priority + deadlineUrgency + staleness + threadStarvation + fitBonus - waitingPenalty;

  return { priority, deadlineUrgency, staleness, threadStarvation, fitBonus, waitingPenalty, total };
}

export function rank(cards: Card[], threads: Thread[], ctx: RankContext): Card[] {
  const threadsById = new Map(threads.map((t) => [t.id, t]));
  return cards
    .filter((c) => passesFilters(c, threadsById, ctx))
    .map((c) => ({
      card: c,
      score: scoreTerms(c, threadsById.get(c.threadId)!, cards, ctx).total,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.card.createdAt !== b.card.createdAt) return a.card.createdAt - b.card.createdAt;
      return a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0;
    })
    .map((x) => x.card);
}

// One line of ranking transparency: the single highest-weighted term,
// phrased plainly. Derived from the score, never hand-written per card.
export function explain(
  card: Card,
  threads: Thread[],
  cards: Card[],
  ctx: RankContext
): string {
  const thread = threads.find((t) => t.id === card.threadId);
  if (!thread) return 'Shown because: oldest open card.';
  const s = scoreTerms(card, thread, cards, ctx);

  const terms: Array<[number, () => string]> = [
    [s.priority, () => `marked priority ${card.priority}.`],
    [
      s.deadlineUrgency,
      () => {
        const daysUntil = Math.ceil((card.deadline! - ctx.now) / DAY_MS);
        if (card.deadline! < ctx.now) {
          const overdueDays = Math.max(1, daysBetween(card.deadline!, ctx.now));
          return `overdue ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}.`;
        }
        if (daysUntil <= 0) return 'deadline today.';
        if (daysUntil === 1) return 'deadline tomorrow.';
        if (daysUntil < 7) {
          const day = new Date(card.deadline!).toLocaleDateString('en-US', {
            weekday: 'long',
          });
          return `deadline ${day}.`;
        }
        const date = new Date(card.deadline!).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        return `deadline ${date}.`;
      },
    ],
    [
      s.staleness,
      () => `untouched ${daysBetween(card.lastTouchedAt, ctx.now)} days.`,
    ],
    [
      s.threadStarvation,
      () =>
        `${thread.name} untouched ${daysBetween(threadLastCompleted(thread, cards), ctx.now)} days.`,
    ],
    [s.fitBonus, () => `fits ${ctx.minutes} minutes.`],
  ];

  let best: [number, () => string] | null = null;
  for (const t of terms) {
    if (t[0] > 0 && (best === null || t[0] > best[0])) best = t;
  }
  return `Shown because: ${best ? best[1]() : 'oldest open card.'}`;
}

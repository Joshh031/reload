import { describe, expect, it } from 'vitest';
import type { Card, Thread } from './types';
import { DAY_MS } from './types';
import { explain, rank, scoreTerms, type RankContext } from './rank';

const NOW = 1_700_000_000_000;

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: 'th1',
    name: 'Fund',
    hue: 210,
    status: 'active',
    createdAt: NOW - 30 * DAY_MS,
    updatedAt: NOW - 30 * DAY_MS,
    ...over,
  };
}

let seq = 0;
function card(over: Partial<Card> = {}): Card {
  seq += 1;
  return {
    id: `c${String(seq).padStart(3, '0')}`,
    threadId: 'th1',
    action: 'do a thing',
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
    createdAt: NOW - DAY_MS,
    lastTouchedAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function ctx(over: Partial<RankContext> = {}): RankContext {
  return { now: NOW, minutes: 15, place: 'desk', ...over };
}

describe('hard filters', () => {
  it('excludes non-open cards', () => {
    const cards = [card({ status: 'done' }), card({ status: 'dropped' }), card()];
    const out = rank(cards, [thread()], ctx());
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('open');
  });

  it('excludes every card of a parked thread', () => {
    const t = [thread(), thread({ id: 'th2', status: 'parked' })];
    const cards = [card(), card({ threadId: 'th2' })];
    const out = rank(cards, t, ctx());
    expect(out.map((c) => c.threadId)).toEqual(['th1']);
  });

  it('excludes snoozed cards until snoozeUntil passes', () => {
    const c = card({ snoozeUntil: NOW + DAY_MS });
    expect(rank([c], [thread()], ctx())).toHaveLength(0);
    expect(rank([c], [thread()], ctx({ now: NOW + DAY_MS + 1 }))).toHaveLength(1);
  });

  it('excludes cards longer than the requested minutes', () => {
    const cards = [card({ minutes: 30 }), card({ minutes: 15 })];
    const out = rank(cards, [thread()], ctx({ minutes: 15 }));
    expect(out).toHaveLength(1);
    expect(out[0].minutes).toBe(15);
  });

  it('excludes desk cards away from the desk; anywhere always fits', () => {
    const cards = [card({ place: 'desk' }), card({ place: 'anywhere' }), card({ place: 'home' })];
    const out = rank(cards, [thread()], ctx({ place: 'home' }));
    expect(out.map((c) => c.place).sort()).toEqual(['anywhere', 'home']);
  });

  it('excludes cards skipped this session', () => {
    const a = card();
    const b = card();
    const out = rank([a, b], [thread()], ctx({ skippedIds: new Set([a.id]) }));
    expect(out.map((c) => c.id)).toEqual([b.id]);
  });
});

describe('score terms', () => {
  const t = thread({ createdAt: NOW }); // zero starvation baseline

  it('weights priority at 25 per level', () => {
    const s = scoreTerms(card({ priority: 3 }), t, [], ctx());
    expect(s.priority).toBe(75);
  });

  it('deadline urgency ramps as the deadline nears and doubles when overdue', () => {
    const far = scoreTerms(card({ deadline: NOW + 70 * DAY_MS }), t, [], ctx());
    expect(far.deadlineUrgency).toBe(0);
    const soon = scoreTerms(card({ deadline: NOW + 3 * DAY_MS }), t, [], ctx());
    expect(soon.deadlineUrgency).toBe(57);
    const overdue = scoreTerms(card({ deadline: NOW - DAY_MS }), t, [], ctx());
    expect(overdue.deadlineUrgency).toBe(120); // clamped 60, doubled
  });

  it('staleness grows 1.5/day and caps at 30', () => {
    const s10 = scoreTerms(card({ lastTouchedAt: NOW - 10 * DAY_MS }), t, [], ctx());
    expect(s10.staleness).toBe(15);
    const s90 = scoreTerms(card({ lastTouchedAt: NOW - 90 * DAY_MS }), t, [], ctx());
    expect(s90.staleness).toBe(30);
  });

  it('thread starvation grows 2/day since last completion and caps at 40', () => {
    const t2 = thread({ createdAt: NOW - 100 * DAY_MS });
    const done = card({
      status: 'done',
      lastTouchedAt: NOW - 5 * DAY_MS,
    });
    const s = scoreTerms(card(), t2, [done], ctx());
    expect(s.threadStarvation).toBe(10);
    const sNoDone = scoreTerms(card(), t2, [], ctx());
    expect(sNoDone.threadStarvation).toBe(40); // capped
  });

  it('fit bonus applies only at half the requested time or less', () => {
    expect(scoreTerms(card({ minutes: 5 }), t, [], ctx({ minutes: 15 })).fitBonus).toBe(15);
    expect(scoreTerms(card({ minutes: 15 }), t, [], ctx({ minutes: 15 })).fitBonus).toBe(0);
    expect(scoreTerms(card({ minutes: 30 }), t, [], ctx({ minutes: 60 })).fitBonus).toBe(15);
  });

  it('waiting cards are suppressed while the nudge clock is fresh, surface after 5 quiet days', () => {
    const freshWait = scoreTerms(
      card({ waitingOn: 'Mark', waitingSince: NOW - 2 * DAY_MS }),
      t,
      [],
      ctx()
    );
    expect(freshWait.waitingPenalty).toBe(50);

    const staleWait = scoreTerms(
      card({ waitingOn: 'Mark', waitingSince: NOW - 6 * DAY_MS }),
      t,
      [],
      ctx()
    );
    expect(staleWait.waitingPenalty).toBe(0);

    const justNudged = scoreTerms(
      card({
        waitingOn: 'Mark',
        waitingSince: NOW - 20 * DAY_MS,
        lastNudged: NOW - DAY_MS,
      }),
      t,
      [],
      ctx()
    );
    expect(justNudged.waitingPenalty).toBe(50);
  });
});

describe('ordering', () => {
  it('higher score wins', () => {
    const t = [thread({ createdAt: NOW })];
    const low = card({ priority: 0 });
    const high = card({ priority: 3 });
    expect(rank([low, high], t, ctx())[0].id).toBe(high.id);
  });

  it('ties break on createdAt ascending, then id — never random', () => {
    const t = [thread({ createdAt: NOW })];
    const older = card({ createdAt: NOW - 10 * DAY_MS, lastTouchedAt: NOW });
    const newer = card({ createdAt: NOW - DAY_MS, lastTouchedAt: NOW });
    expect(rank([newer, older], t, ctx())[0].id).toBe(older.id);

    const a = card({ id: 'aaa', createdAt: NOW, lastTouchedAt: NOW });
    const b = card({ id: 'bbb', createdAt: NOW, lastTouchedAt: NOW });
    expect(rank([b, a], t, ctx())[0].id).toBe('aaa');
  });

  it('is deterministic: same inputs, same order, repeatedly', () => {
    const t = [thread()];
    const cards = Array.from({ length: 20 }, (_, i) =>
      card({
        priority: (i % 4) as 0 | 1 | 2 | 3,
        minutes: 5,
        lastTouchedAt: NOW - (i % 7) * DAY_MS,
        createdAt: NOW - i * DAY_MS,
      })
    );
    const one = rank(cards, t, ctx()).map((c) => c.id);
    const two = rank([...cards].reverse(), t, ctx()).map((c) => c.id);
    expect(two).toEqual(one);
  });
});

describe('explain', () => {
  const t = thread({ createdAt: NOW });

  it('names the dominant term plainly', () => {
    expect(explain(card({ priority: 3 }), [t], [], ctx())).toBe(
      'Shown because: marked priority 3.'
    );
    expect(
      explain(card({ deadline: NOW + 2 * DAY_MS, priority: 0 }), [t], [], ctx())
    ).toMatch(/^Shown because: deadline /);
    expect(
      explain(card({ lastTouchedAt: NOW - 11 * DAY_MS }), [t], [], ctx())
    ).toBe('Shown because: untouched 11 days.');
  });

  it('attributes thread starvation to the thread by name', () => {
    const hungry = thread({ id: 'bc', name: 'Boulder Crest', createdAt: NOW - 11 * DAY_MS });
    const c = card({ threadId: 'bc' });
    expect(explain(c, [hungry], [], ctx())).toBe(
      'Shown because: Boulder Crest untouched 11 days.'
    );
  });

  it('falls back to the fit bonus, then to the tiebreak', () => {
    expect(explain(card({ minutes: 2 }), [t], [], ctx({ minutes: 5 }))).toBe(
      'Shown because: fits 5 minutes.'
    );
    expect(explain(card({ minutes: 5 }), [t], [], ctx({ minutes: 5 }))).toBe(
      'Shown because: oldest open card.'
    );
  });
});

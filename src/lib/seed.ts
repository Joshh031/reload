import type { Card, Minutes, Place, Thread } from './types';
import { DAY_MS, newId } from './types';
import { hasAnyData, saveCards, saveThreads } from './storage';

const THREAD_NAMES = [
  'Fund',
  'CHOKEPOINT',
  'Boulder Crest',
  'Coaching',
  'Kids',
  'House',
  'Parents move',
  'Training',
  'Learning',
];

// Hues spread around the wheel so edge markers stay distinguishable.
const HUES = [210, 0, 30, 120, 280, 45, 170, 90, 330];

interface SeedCard {
  action: string;
  reload: string;
  minutes: Minutes;
  place: Place;
  priority?: 0 | 1 | 2 | 3;
  deadlineDays?: number; // days from now
  waitingOn?: string;
  waitingDays?: number;
  ageDays?: number; // how long ago it was created/touched
}

const SEED: Record<string, SeedCard[]> = {
  Fund: [
    {
      action: 'Reply to David on the Q3 allocation memo',
      reload:
        'His email 7/28, subject "Q3 sizing". He wants the EM sleeve cut to 12%. You agreed on the call but never confirmed in writing.',
      minutes: 5,
      place: 'desk',
      priority: 2,
      ageDays: 4,
    },
    {
      action: 'Rebuild the drawdown table with July numbers',
      reload:
        'Sheet: fund-metrics.xlsx, tab "DD". July NAV came in 8/1. Last row is June. Formula drags down, just check the high-water col.',
      minutes: 30,
      place: 'desk',
      priority: 1,
      ageDays: 2,
    },
  ],
  CHOKEPOINT: [
    {
      action: 'Email Julia the Phase 0 scope',
      reload:
        'Doc: CHOKEPOINT/phase0-scope.md, last edited Tuesday. She needs the two-paragraph summary plus the budget line. Her address is in the thread "kickoff".',
      minutes: 15,
      place: 'desk',
      priority: 3,
      deadlineDays: 3,
      ageDays: 3,
    },
    {
      action: 'Decide go/no-go on the second interview slot',
      reload:
        'Candidates doc, row 4 and 7. Row 4 was strong on ops, weak on writing. You said you would decide by Friday.',
      minutes: 5,
      place: 'anywhere',
      priority: 2,
      ageDays: 1,
    },
  ],
  'Boulder Crest': [
    {
      action: 'Send Mark the updated volunteer schedule',
      reload:
        'He asked for October weekends. Draft is in Notes app under "BC sched". Two Saturdays still unassigned — leave them blank, he fills gaps.',
      minutes: 5,
      place: 'phone',
      priority: 1,
      waitingOn: 'Mark',
      waitingDays: 9,
      ageDays: 11,
    },
    {
      action: 'Write the two-paragraph bio for the gala program',
      reload:
        'They want 120 words max, third person. Reuse the LinkedIn summary, cut the fund detail, add the BC role. Due to events@ by the 15th.',
      minutes: 15,
      place: 'anywhere',
      priority: 1,
      deadlineDays: 12,
      ageDays: 6,
    },
  ],
  Coaching: [
    {
      action: 'Prep notes for Thursday session with Alex',
      reload:
        'Last session ended on the delegation problem. He was going to try the Tuesday standup change. Ask how it went, then the 90-day plan.',
      minutes: 15,
      place: 'anywhere',
      priority: 2,
      deadlineDays: 4,
      ageDays: 5,
    },
    {
      action: 'Invoice September sessions',
      reload:
        '3 sessions x 2 clients. Template in Drive "coaching-invoice". Numbers run from INV-041. Alex is net-30, Priya pays same week.',
      minutes: 15,
      place: 'desk',
      priority: 0,
      ageDays: 1,
    },
  ],
  Kids: [
    {
      action: 'Book the dentist for both kids',
      reload:
        'Dr. Hayes office, they open 8:30. Maddie needs the retainer check too. School is out Oct 9 — aim for that morning.',
      minutes: 5,
      place: 'phone',
      priority: 2,
      ageDays: 8,
    },
    {
      action: 'Order the science fair board and print the photos',
      reload:
        'Max needs a tri-fold board, 36x48. The photos are in the shared album "volcano". Walgreens 1-hr print, order online first.',
      minutes: 15,
      place: 'phone',
      priority: 1,
      deadlineDays: 6,
      ageDays: 3,
    },
  ],
  House: [
    {
      action: 'Chase the gutter quote',
      reload:
        'Rainpro said "end of last week". Contact is Steve, number in texts. If over $2k, get the second quote from the Hendersons guy.',
      minutes: 2,
      place: 'phone',
      priority: 1,
      waitingOn: 'Steve',
      waitingDays: 6,
      ageDays: 10,
    },
    {
      action: 'File the insurance claim for the fence',
      reload:
        'Photos already in Drive folder "fence-storm". Policy number on the fridge doc. Claim portal login is in 1Password under "HomeShield".',
      minutes: 30,
      place: 'home',
      priority: 2,
      ageDays: 7,
    },
  ],
  'Parents move': [
    {
      action: 'Call the estate agent about the listing date',
      reload:
        'Agent is Carol, wants to list the 15th. Dad wants after his birthday (the 20th). You are the tiebreaker — decide, then call Carol.',
      minutes: 5,
      place: 'phone',
      priority: 3,
      ageDays: 2,
    },
    {
      action: 'Shortlist three movers with fixed quotes',
      reload:
        'Spreadsheet "parents-move" has 6 candidates. Filter: insured, fixed quote, available first week of Nov. Send the top 3 to Mum.',
      minutes: 30,
      place: 'desk',
      priority: 1,
      ageDays: 5,
    },
  ],
  Training: [
    {
      action: 'Program next block: swap deadlift for trap bar',
      reload:
        'Current block ends Friday. Keep the 531 percentages, base off 180kg. Note from coach: keep pulls at RPE 8 while the back settles.',
      minutes: 15,
      place: 'anywhere',
      priority: 0,
      ageDays: 4,
    },
    {
      action: 'Book physio follow-up',
      reload:
        'Six weeks since last visit. BodyWorks booking page, prefer Tuesday early. Mention the left hamstring tightness from week 2.',
      minutes: 2,
      place: 'phone',
      priority: 1,
      ageDays: 12,
    },
  ],
  Learning: [
    {
      action: 'Finish chapter 4 of the Arabic workbook',
      reload:
        'Page 61, exercise 3 half done. The new verb forms are on the yellow sticky. 20 minutes gets the chapter closed.',
      minutes: 30,
      place: 'home',
      priority: 0,
      ageDays: 9,
    },
    {
      action: 'Watch the market microstructure lecture, take 5 bullet notes',
      reload:
        'YouTube playlist "MMS", video 7, stopped at 22:10. Notes doc is "microstructure-notes". Focus: queue position vs latency.',
      minutes: 60,
      place: 'home',
      priority: 0,
      ageDays: 6,
    },
  ],
};

export function buildSeed(now = Date.now()): { threads: Thread[]; cards: Card[] } {
  const threads: Thread[] = THREAD_NAMES.map((name, i) => ({
    id: newId() + i,
    name,
    hue: HUES[i],
    status: 'active',
    createdAt: now - 30 * DAY_MS,
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

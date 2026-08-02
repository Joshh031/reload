import type { Card, SessionLog, Settings, Thread } from './types';
import { DAY_MS, dayKey } from './types';

export interface Stats {
  daysOpened: number;
  daysSinceInstall: number;
  streak: number;
  completedTotal: number;
  completedPerWeek: number;
  skipRate: number | null; // 0..1, null when nothing shown yet
  medianSecondsToAction: number | null;
  starvedThreads: string[]; // active threads, zero completions in 14 days
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeStats(
  sessions: SessionLog[],
  cards: Card[],
  threads: Thread[],
  settings: Settings,
  now = Date.now()
): Stats {
  const daysSinceInstall = Math.max(1, Math.floor((now - settings.installedAt) / DAY_MS) + 1);

  // current streak: consecutive opened days ending today
  const opened = new Set(settings.openedDays);
  let streak = 0;
  for (let d = now; opened.has(dayKey(d)); d -= DAY_MS) streak += 1;

  const shown = sessions.filter((s) => s.cardId !== null);
  const completedTotal = shown.filter((s) => s.outcome === 'done').length;
  const weeks = Math.max(1, (now - settings.installedAt) / (7 * DAY_MS));
  const skips = shown.filter((s) => s.outcome === 'skip').length;

  const cutoff = now - 14 * DAY_MS;
  const starvedThreads = threads
    .filter((t) => t.status === 'active')
    .filter(
      (t) =>
        !cards.some(
          (c) => c.threadId === t.id && c.status === 'done' && c.lastTouchedAt >= cutoff
        )
    )
    .map((t) => t.name);

  return {
    daysOpened: settings.openedDays.length,
    daysSinceInstall,
    streak,
    completedTotal,
    completedPerWeek: completedTotal / weeks,
    skipRate: shown.length ? skips / shown.length : null,
    medianSecondsToAction: median(shown.map((s) => s.secondsToAction)),
    starvedThreads,
  };
}

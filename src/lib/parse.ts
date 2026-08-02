import type { Minutes, Place, Thread } from './types';
import { MINUTES, PLACES } from './types';

// The single LLM call in the app: turn a captured sentence into card fields.
// Fires only on the natural-language path; capture never blocks on it.

export interface ParsedCapture {
  action: string;
  threadId: string | null;
  minutes: Minutes | null;
  place: Place | null;
  deadline: number | null;
  waitingOn: string | null;
  reload: string | null;
}

const MODEL = 'claude-sonnet-4-6';

function nearestMinutes(n: number): Minutes {
  return MINUTES.reduce((best, m) =>
    Math.abs(m - n) < Math.abs(best - n) ? m : best
  );
}

// Fallback when the API is unreachable or no key is set. Deliberately tiny:
// pull an explicit "N min" estimate out of the sentence, nothing clever.
export function localParse(text: string): ParsedCapture {
  let action = text.trim();
  let minutes: Minutes | null = null;
  const m = action.match(/[,\s]\s*(\d{1,3})\s*min(ute)?s?\.?\s*$/i);
  if (m) {
    minutes = nearestMinutes(Number(m[1]));
    action = action.slice(0, m.index).replace(/[,\s]+$/, '');
  }
  return {
    action,
    threadId: null,
    minutes,
    place: null,
    deadline: null,
    waitingOn: null,
    reload: null,
  };
}

function endOfLocalDay(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export async function apiParse(
  text: string,
  threads: Thread[],
  apiKey: string
): Promise<ParsedCapture> {
  const active = threads.filter((t) => t.status === 'active');
  const threadList = active.map((t) => `- id "${t.id}": ${t.name}`).join('\n');
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const system = `You turn one captured sentence into a task card. Reply with strict JSON only — no preamble, no code fences, no commentary.

Schema:
{"action": string, "threadId": string|null, "minutes": 2|5|15|30|60, "place": "desk"|"phone"|"home"|"anywhere", "deadline": "YYYY-MM-DD"|null, "waitingOn": string|null, "reload": string|null}

Rules:
- "action": the imperative one-line task, cleaned of time/deadline phrases.
- "threadId": the id of the best-matching thread from the list below, or null if none clearly fits. Never invent an id.
- "minutes": the user's estimate mapped to the nearest of 2, 5, 15, 30, 60. Default 5 if unstated.
- "place": "desk" for computer work, "phone" for calls/errands doable on a phone, "home" for physical at-home tasks, else "anywhere".
- "deadline": resolve relative dates ("Thursday", "next week") against today (${todayIso}); null if none.
- "waitingOn": a person's name only if the task is blocked on them, else null.
- "reload": one or two lines of context restated from the sentence (names, numbers, links) that would help start cold, or null if the sentence has none beyond the action.

Threads:
${threadList}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? '';
    const jsonText = raw.replace(/^```(json)?\s*|\s*```$/g, '').trim();
    const p = JSON.parse(jsonText);

    const threadId =
      typeof p.threadId === 'string' && active.some((t) => t.id === p.threadId)
        ? p.threadId
        : null;
    const minutes =
      typeof p.minutes === 'number' ? nearestMinutes(p.minutes) : null;
    const place = PLACES.includes(p.place) ? (p.place as Place) : null;
    const deadline =
      typeof p.deadline === 'string' ? endOfLocalDay(p.deadline) : null;

    return {
      action:
        typeof p.action === 'string' && p.action.trim() ? p.action.trim() : text.trim(),
      threadId,
      minutes,
      place,
      deadline,
      waitingOn:
        typeof p.waitingOn === 'string' && p.waitingOn.trim() ? p.waitingOn.trim() : null,
      reload: typeof p.reload === 'string' && p.reload.trim() ? p.reload.trim() : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

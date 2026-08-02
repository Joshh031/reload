import { useState } from 'react';
import type { AppState } from '../state';
import type { Thread } from '../lib/types';
import { DAY_MS, newId } from '../lib/types';

function daysSinceLastCompletion(app: AppState, thread: Thread): number | null {
  const done = app.cards.filter((c) => c.threadId === thread.id && c.status === 'done');
  if (done.length === 0) return null;
  const last = Math.max(...done.map((c) => c.lastTouchedAt));
  return Math.floor((Date.now() - last) / DAY_MS);
}

// Pick the hue farthest from all existing ones so edge markers stay distinct.
function nextHue(threads: Thread[]): number {
  if (threads.length === 0) return 210;
  const hues = threads.map((t) => t.hue);
  let best = 0;
  let bestDist = -1;
  for (let h = 0; h < 360; h += 15) {
    const d = Math.min(...hues.map((x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h))));
    if (d > bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}

export default function Threads({ app }: { app: AppState }) {
  const [name, setName] = useState('');

  const active = app.threads.filter((t) => t.status === 'active');
  const parked = app.threads.filter((t) => t.status === 'parked');

  function togglePark(id: string) {
    app.setThreads((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, status: t.status === 'parked' ? 'active' : 'parked' } : t
      )
    );
  }

  function addThread() {
    const trimmed = name.trim();
    if (!trimmed) return;
    app.setThreads((ts) => [
      ...ts,
      { id: newId(), name: trimmed, hue: nextHue(ts), status: 'active', createdAt: Date.now() },
    ]);
    setName('');
  }

  function renderRow(t: Thread) {
    const open = app.cards.filter((c) => c.threadId === t.id && c.status === 'open').length;
    const days = daysSinceLastCompletion(app, t);
    return (
      <div key={t.id} className={`row${t.status === 'parked' ? ' parked' : ''}`}>
        <div className="grow">
          <span className="thread-dot" style={{ background: `hsl(${t.hue} 45% 55%)` }} />
          {t.name}
          <div className="sub">
            {open} open · {days === null ? 'no completions yet' : `last completed ${days}d ago`}
          </div>
        </div>
        <button className="btn" onClick={() => togglePark(t.id)}>
          {t.status === 'parked' ? 'Unpark' : 'Park'}
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-title">Threads</div>
      <div className="rows" style={{ flex: 1, overflowY: 'auto' }}>
        {active.map(renderRow)}
        {parked.length > 0 && (
          <>
            <div className="pass-condition">parked</div>
            {parked.map(renderRow)}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, paddingTop: 14 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addThread();
              e.stopPropagation();
            }}
            placeholder="New thread name"
          />
          <button className="btn" onClick={addThread}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

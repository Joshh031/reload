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
  const [reviewThreadId, setReviewThreadId] = useState<string | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);

  const active = app.threads.filter((t) => t.status === 'active');
  const parked = app.threads.filter((t) => t.status === 'parked');

  const reviewThread = app.threads.find((t) => t.id === reviewThreadId) ?? null;
  const reviewCards = reviewThread
    ? app.cards
        .filter((c) => c.threadId === reviewThread.id && c.status === 'open')
        .sort((a, b) => a.createdAt - b.createdAt)
    : [];
  const reviewCard = reviewCards[Math.min(reviewIdx, Math.max(0, reviewCards.length - 1))];

  function dropCard(id: string) {
    app.setCards((cards) =>
      cards.map((c) =>
        c.id === id
          ? { ...c, status: 'dropped', lastTouchedAt: Date.now(), updatedAt: Date.now() }
          : c
      )
    );
    if (reviewCards.length <= 1) setReviewThreadId(null);
    else setReviewIdx((i) => Math.min(i, reviewCards.length - 2));
  }

  function togglePark(id: string) {
    app.setThreads((ts) =>
      ts.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === 'parked' ? 'active' : 'parked',
              updatedAt: Date.now(),
            }
          : t
      )
    );
  }

  function addThread() {
    const trimmed = name.trim();
    if (!trimmed) return;
    app.setThreads((ts) => [
      ...ts,
      {
        id: newId(),
        name: trimmed,
        hue: nextHue(ts),
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    setName('');
  }

  function renderRow(t: Thread) {
    const open = app.cards.filter((c) => c.threadId === t.id && c.status === 'open').length;
    const days = daysSinceLastCompletion(app, t);
    return (
      <div key={t.id} className={`row${t.status === 'parked' ? ' parked' : ''}`}>
        <div
          className="grow"
          style={{ cursor: open > 0 ? 'pointer' : 'default' }}
          onClick={() => {
            if (open > 0) {
              setReviewThreadId(t.id);
              setReviewIdx(0);
            }
          }}
        >
          <span className="thread-dot" style={{ background: `hsl(${t.hue} 45% 55%)` }} />
          {t.name}
          <div className="sub">
            {open} open · {days === null ? 'no completions yet' : `last completed ${days}d ago`}
            {open > 0 ? ' · tap to review' : ''}
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

      {reviewThread && reviewCard && (
        <div
          className="overlay"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setReviewThreadId(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewThreadId(null);
          }}
        >
          <div className="panel">
            <h2>{reviewThread.name}</h2>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 10 }}>
              {reviewCard.action}
            </div>
            {reviewCard.reload && (
              <div className="dim" style={{ fontSize: 13, marginBottom: 10 }}>
                {reviewCard.reload}
              </div>
            )}
            <div className="parse-note" style={{ marginBottom: 12 }}>
              {reviewCard.minutes} min · {reviewCard.place}
              {reviewCard.recurs === 'daily' ? ' · daily' : ''}
              {reviewCard.priority ? ` · p${reviewCard.priority}` : ''}
              {reviewCard.waitingOn ? ` · waiting on ${reviewCard.waitingOn}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {reviewCards.length > 1 && (
                <button
                  className="btn"
                  onClick={() => setReviewIdx((i) => (i + 1) % reviewCards.length)}
                >
                  Next
                </button>
              )}
              <button className="btn danger" onClick={() => dropCard(reviewCard.id)}>
                Drop
              </button>
              <button className="btn" onClick={() => setReviewThreadId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

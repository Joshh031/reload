import type { AppState } from '../state';
import { DAY_MS } from '../lib/types';

// The only list view in the app. A log of who is blocking what — it sends
// nothing. 'Nudged' stamps lastNudged and resets the visible counter.
export default function Waiting({ app }: { app: AppState }) {
  const now = Date.now();
  const rows = app.cards
    .filter((c) => c.status === 'open' && c.waitingOn !== null)
    .map((c) => ({
      card: c,
      days: Math.floor((now - (c.lastNudged ?? c.waitingSince ?? now)) / DAY_MS),
    }))
    .sort((a, b) => b.days - a.days);

  function nudged(id: string) {
    app.setCards((cards) =>
      cards.map((c) =>
        c.id === id ? { ...c, lastNudged: Date.now(), updatedAt: Date.now() } : c
      )
    );
  }

  return (
    <div className="screen">
      <div className="screen-title">Waiting</div>
      {rows.length === 0 ? (
        <div className="empty">Nothing is waiting on anyone. Capture with a name to track a block.</div>
      ) : (
        <div className="rows" style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map(({ card, days }) => {
            const thread = app.threads.find((t) => t.id === card.threadId);
            return (
              <div key={card.id} className="row">
                <div className="grow">
                  <span className={days >= 5 ? 'warn' : ''}>{card.waitingOn}</span>
                  <div className="sub">
                    {card.action}
                    {thread ? ` · ${thread.name}` : ''}
                  </div>
                </div>
                <span className={`num${days >= 5 ? ' warn' : ''}`}>
                  {days}d
                </span>
                <button className="btn" onClick={() => nudged(card.id)}>
                  Nudged
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from '../state';
import type { NowHandlers } from '../App';
import type { Card, ContextPlace, Minutes } from '../lib/types';
import { CONTEXT_PLACES, DAY_MS, MINUTES, newId, PLACE_LABELS } from '../lib/types';
import { explain, rank } from '../lib/rank';

interface Props {
  app: AppState;
  mode: ContextPlace;
  setMode: (m: ContextPlace) => void;
  minutes: Minutes | null;
  setMinutes: (m: Minutes | null) => void;
  onEdit: (card: Card) => void;
  handlers: React.MutableRefObject<NowHandlers | null>;
}

const PLACE_PHRASE: Record<ContextPlace, string> = {
  desk: 'at your desk',
  phone: 'on the move',
  home: 'at home',
};

function nextMidnight(days: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + days * DAY_MS;
}

export default function Now({ app, mode, setMode, minutes, setMinutes, onEdit, handlers }: Props) {
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [flash, setFlash] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [pickingDate, setPickingDate] = useState(false);
  const pending = useRef<{
    cardId: string;
    shownAt: number;
    minutes: Minutes;
    place: ContextPlace;
  } | null>(null);

  const current: Card | null = useMemo(() => {
    // During the Done flash no card is "shown"; without this guard the next
    // ranked card would be selected invisibly and logged as abandoned.
    if (minutes === null || flash) return null;
    const ranked = rank(app.cards, app.threads, {
      now: Date.now(),
      minutes,
      place: mode,
      skippedIds: skipped,
    });
    return ranked[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.cards, app.threads, minutes, mode, skipped, flash]);

  function logOutcome(outcome: 'done' | 'skip' | 'snooze' | 'abandoned') {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    app.addSession({
      id: newId(),
      at: Date.now(),
      minutesRequested: p.minutes,
      place: p.place,
      cardId: p.cardId,
      outcome,
      secondsToAction: Math.round((Date.now() - p.shownAt) / 100) / 10,
    });
  }

  // Track the shown card; anything shown but never resolved logs as abandoned.
  useEffect(() => {
    if (pending.current && pending.current.cardId !== current?.id) {
      logOutcome('abandoned');
    }
    if (current && minutes !== null && pending.current?.cardId !== current.id) {
      pending.current = {
        cardId: current.id,
        shownAt: Date.now(),
        minutes,
        place: mode,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(
    () => () => {
      if (pending.current) logOutcome('abandoned');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function toPicker() {
    setMinutes(null);
    setSkipped(new Set());
    setSnoozeOpen(false);
    setPickingDate(false);
  }

  function done() {
    if (!current) return;
    logOutcome('done');
    const now = Date.now();
    app.setCards((cards) =>
      cards.map((c) =>
        c.id === current.id ? { ...c, status: 'done', lastTouchedAt: now } : c
      )
    );
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      toPicker();
    } else {
      setFlash(true);
      window.setTimeout(() => {
        setFlash(false);
        toPicker();
      }, 400);
    }
  }

  function skip() {
    if (!current) return;
    logOutcome('skip');
    setSkipped((s) => new Set([...s, current.id]));
  }

  function applySnooze(until: number) {
    if (!current) return;
    logOutcome('snooze');
    app.setCards((cards) =>
      cards.map((c) => (c.id === current.id ? { ...c, snoozeUntil: until } : c))
    );
    setSnoozeOpen(false);
    setPickingDate(false);
    setSnoozeDate('');
  }

  function edit() {
    if (!current) return;
    onEdit(current);
  }

  handlers.current = {
    done,
    skip,
    edit,
    snooze: () => current && setSnoozeOpen(true),
  };

  // ---- render ----

  if (flash) {
    return (
      <div className="screen">
        <div className="done-flash">Done.</div>
      </div>
    );
  }

  if (minutes === null) {
    return (
      <div className="screen">
        <div className="picker">
          <div className="lead">I have</div>
          <div className="minutes mono">
            {MINUTES.map((m) => (
              <button key={m} onClick={() => setMinutes(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="modes">
            {CONTEXT_PLACES.map((p) => (
              <button
                key={p}
                className={p === mode ? 'active' : ''}
                onClick={() => setMode(p)}
              >
                {PLACE_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    const next = MINUTES.find((m) => m > minutes);
    return (
      <div className="screen">
        <div className="empty">
          Nothing fits {minutes} minutes {PLACE_PHRASE[mode]}.{' '}
          {next ? `Try ${next}, or capture something new.` : 'Capture something new.'}
        </div>
      </div>
    );
  }

  const thread = app.threads.find((t) => t.id === current.threadId);
  const because = explain(current, app.threads, app.cards, {
    now: Date.now(),
    minutes,
    place: mode,
    skippedIds: skipped,
  });
  const waitingDays = current.waitingSince
    ? Math.floor((Date.now() - (current.lastNudged ?? current.waitingSince)) / DAY_MS)
    : 0;

  return (
    <div className="screen">
      <div className="card-wrap">
        <div
          className="card"
          style={{ borderLeftColor: thread ? `hsl(${thread.hue} 45% 55%)` : undefined }}
        >
          <div className="thread">{thread?.name ?? '—'}</div>
          <div className="action">{current.action}</div>
          {current.reload && <div className="reload">{current.reload}</div>}
          {current.waitingOn && (
            <div className="waiting">
              Waiting on {current.waitingOn}, {waitingDays} {waitingDays === 1 ? 'day' : 'days'}
            </div>
          )}
          <div className="because">{because}</div>
        </div>
        <div className="card-actions">
          <button className="btn primary" onClick={done}>
            Done
          </button>
          <button className="btn" onClick={() => setSnoozeOpen(true)}>
            Snooze
          </button>
          <button className="btn" onClick={skip}>
            Skip
          </button>
          <button className="btn" onClick={edit}>
            Edit
          </button>
        </div>
      </div>

      {snoozeOpen && (
        <div
          className="overlay"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              setSnoozeOpen(false);
              setPickingDate(false);
            } else if (!pickingDate) {
              if (e.key === '1') applySnooze(nextMidnight(1));
              else if (e.key === '2') applySnooze(nextMidnight(7));
              else if (e.key === '3') setPickingDate(true);
            }
          }}
        >
          <div className="panel">
            <h2>Snooze</h2>
            {!pickingDate ? (
              <div className="menu-list">
                <button autoFocus onClick={() => applySnooze(nextMidnight(1))}>
                  <span className="key-hint">1</span> Tomorrow
                </button>
                <button onClick={() => applySnooze(nextMidnight(7))}>
                  <span className="key-hint">2</span> Next week
                </button>
                <button onClick={() => setPickingDate(true)}>
                  <span className="key-hint">3</span> Pick a date
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="date"
                  autoFocus
                  value={snoozeDate}
                  onChange={(e) => setSnoozeDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && snoozeDate) {
                      const [y, m, d] = snoozeDate.split('-').map(Number);
                      applySnooze(new Date(y, m - 1, d, 0, 0, 0, 0).getTime());
                    }
                  }}
                />
                <button
                  className="btn"
                  disabled={!snoozeDate}
                  onClick={() => {
                    const [y, m, d] = snoozeDate.split('-').map(Number);
                    applySnooze(new Date(y, m - 1, d, 0, 0, 0, 0).getTime());
                  }}
                >
                  Set
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

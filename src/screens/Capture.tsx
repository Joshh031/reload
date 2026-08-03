import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../state';
import type { Card, Minutes, Place } from '../lib/types';
import { MINUTES, newId, PLACES } from '../lib/types';
import { apiParse, localParse } from '../lib/parse';

export interface Toast {
  text: string;
  undo?: () => void;
}

interface Props {
  app: AppState;
  editCard: Card | null;
  onClose: () => void;
  onToast: (t: Toast) => void;
}

export default function Capture({ app, editCard, onClose, onToast }: Props) {
  const activeThreads = app.threads.filter((t) => t.status === 'active');
  const defaultThread =
    editCard?.threadId ??
    (app.settings.lastThreadId &&
    activeThreads.some((t) => t.id === app.settings.lastThreadId)
      ? app.settings.lastThreadId
      : activeThreads[0]?.id ?? '');

  const [action, setAction] = useState(editCard?.action ?? '');
  const [reload, setReload] = useState(editCard?.reload ?? '');
  const [threadId, setThreadId] = useState(defaultThread);
  const [minutes, setMinutes] = useState<Minutes>(editCard?.minutes ?? 5);
  const [place, setPlace] = useState<Place>(editCard?.place ?? 'desk');
  const [priority, setPriority] = useState<0 | 1 | 2 | 3>(editCard?.priority ?? 0);
  const [deadline, setDeadline] = useState(
    editCard?.deadline ? isoDate(editCard.deadline) : ''
  );
  const [waitingOn, setWaitingOn] = useState(editCard?.waitingOn ?? '');
  // Any manual touch of the structured fields makes them authoritative:
  // the NL parse call is skipped.
  const [touched, setTouched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function isoDate(t: number): string {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }

  function deadlineMs(): number | null {
    if (!deadline) return null;
    const [y, m, d] = deadline.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 0, 0).getTime();
  }

  function save() {
    const text = action.trim();
    if (!text || !threadId) return;
    const now = Date.now();

    if (editCard) {
      app.setCards((cards) =>
        cards.map((c) =>
          c.id === editCard.id
            ? {
                ...c,
                action: text,
                reload: reload.trim(),
                threadId,
                minutes,
                place,
                priority,
                deadline: deadlineMs(),
                waitingOn: waitingOn.trim() || null,
                waitingSince: waitingOn.trim()
                  ? c.waitingSince ?? now
                  : null,
                lastNudged: waitingOn.trim() ? c.lastNudged : null,
                lastTouchedAt: now,
              }
            : c
        )
      );
      app.setSettings((s) => ({ ...s, lastThreadId: threadId }));
      onClose();
      return;
    }

    // New card: save immediately, never block on the network.
    const card: Card = {
      id: newId(),
      threadId,
      action: text,
      reload: reload.trim(),
      minutes,
      place,
      priority,
      deadline: deadlineMs(),
      waitingOn: waitingOn.trim() || null,
      waitingSince: waitingOn.trim() ? now : null,
      lastNudged: null,
      status: 'open',
      snoozeUntil: null,
      createdAt: now,
      lastTouchedAt: now,
    };
    app.setCards((cards) => [...cards, card]);
    app.setSettings((s) => ({ ...s, lastThreadId: threadId }));
    onClose();

    // Natural-language path: only when the structured fields were untouched.
    if (touched) return;
    const apiKey = app.settings.apiKey;
    const applyParsed = (p: ReturnType<typeof localParse>, marker: string) => {
      const before = { ...card };
      app.setCards((cards) =>
        cards.map((c) =>
          c.id === card.id
            ? {
                ...c,
                action: p.action || c.action,
                threadId: p.threadId ?? c.threadId,
                minutes: p.minutes ?? c.minutes,
                place: p.place ?? c.place,
                deadline: p.deadline ?? c.deadline,
                waitingOn: p.waitingOn ?? c.waitingOn,
                waitingSince: p.waitingOn ? now : c.waitingSince,
                reload: p.reload ?? c.reload,
              }
            : c
        )
      );
      onToast({
        text: marker,
        undo: () =>
          app.setCards((cards) => cards.map((c) => (c.id === card.id ? before : c))),
      });
    };

    if (apiKey && navigator.onLine) {
      apiParse(text, app.threads, apiKey)
        .then((p) => applyParsed(p, 'parsed'))
        .catch(() => applyParsed(localParse(text), 'parsed locally'));
    } else {
      applyParsed(localParse(text), 'parsed locally');
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      save();
    }
    e.stopPropagation();
  }

  return (
    <div className="overlay" onKeyDown={onKeyDown}>
      <div className="panel">
        <h2>{editCard ? 'Edit' : 'Capture'}</h2>
        <div className="form" style={{ padding: 0 }}>
          <div>
            <input
              ref={inputRef}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="What needs doing? One line."
            />
          </div>
          <div>
            <label>Thread</label>
            <select
              value={threadId}
              onChange={(e) => {
                setThreadId(e.target.value);
                setTouched(true);
              }}
            >
              {activeThreads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Minutes</label>
            <div className="seg" role="radiogroup">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  className={m === minutes ? 'active' : ''}
                  onClick={() => {
                    setMinutes(m);
                    setTouched(true);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label>Place</label>
            <div className="seg">
              {PLACES.map((p) => (
                <button
                  key={p}
                  className={p === place ? 'active' : ''}
                  onClick={() => {
                    setPlace(p);
                    setTouched(true);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label>Reload — everything needed to start cold (optional)</label>
            <textarea
              rows={2}
              value={reload}
              onChange={(e) => {
                setReload(e.target.value);
                setTouched(true);
              }}
              placeholder="Names, the number, the link, where it left off."
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Priority</label>
              <div className="seg">
                {([0, 1, 2, 3] as const).map((p) => (
                  <button
                    key={p}
                    className={p === priority ? 'active' : ''}
                    onClick={() => {
                      setPriority(p);
                      setTouched(true);
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label>Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => {
                  setDeadline(e.target.value);
                  setTouched(true);
                }}
              />
            </div>
          </div>
          <div>
            <label>Waiting on (person, if blocked)</label>
            <input
              value={waitingOn}
              onChange={(e) => {
                setWaitingOn(e.target.value);
                setTouched(true);
              }}
              placeholder="Name, or empty"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={save}>
              Save
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            {editCard && (
              <button
                className="btn danger"
                onClick={() => {
                  app.setCards((cards) =>
                    cards.map((c) =>
                      c.id === editCard.id
                        ? { ...c, status: 'dropped', lastTouchedAt: Date.now() }
                        : c
                    )
                  );
                  onClose();
                }}
              >
                Drop
              </button>
            )}
            <span className="parse-note" style={{ marginLeft: 'auto' }}>
              enter saves · esc closes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useAppState } from './state';
import Settings from './screens/Settings';
import Threads from './screens/Threads';
import Capture, { type Toast } from './screens/Capture';
import Now from './screens/Now';
import Waiting from './screens/Waiting';
import type { Card, ContextPlace, Minutes } from './lib/types';
import { MINUTES } from './lib/types';
import { syncNow } from './lib/sync';

type Screen = 'now' | 'waiting' | 'threads' | 'settings';
type Overlay = { type: 'capture'; card?: Card } | { type: 'help' } | null;

// Set by the NOW screen so global keys can act on the visible card.
export interface NowHandlers {
  done: () => void;
  snooze: () => void;
  skip: () => void;
  edit: () => void;
}

export default function App() {
  const app = useAppState();
  const [screen, setScreen] = useState<Screen>('now');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [mode, setMode] = useState<ContextPlace>('desk');
  const [sessionMinutes, setSessionMinutes] = useState<Minutes | null>(null);
  const nowRef = useRef<NowHandlers | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  function showToast(t: Toast) {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }

  const overlayOpen = overlay !== null;

  // Background sync: boot, tab focus, reconnect, and a slow timer. Silent —
  // failures never interrupt; the Settings screen surfaces them on demand.
  const syncKey = app.settings.syncKey;
  const reloadAll = app.reloadAll;
  useEffect(() => {
    if (!syncKey) return;
    let closed = false;
    const run = () => {
      syncNow(syncKey)
        .then((r) => {
          if (!closed && r === 'applied') reloadAll();
        })
        .catch(() => {});
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    const timer = window.setInterval(run, 60000);
    return () => {
      closed = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
      window.clearInterval(timer);
    };
  }, [syncKey, reloadAll]);

  // Push local mutations shortly after they happen.
  useEffect(() => {
    if (!syncKey) return;
    const timer = window.setTimeout(() => {
      syncNow(syncKey)
        .then((r) => {
          if (r === 'applied') reloadAll();
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [syncKey, reloadAll, app.cards, app.threads, app.sessions]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT';
      if (e.key === 'Escape') {
        if (overlayOpen) {
          setOverlay(null);
        } else if (screen !== 'now') {
          setScreen('now');
        } else {
          setSessionMinutes(null);
        }
        return;
      }
      if (inField || overlayOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      const digit = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (digit >= 0) {
        setScreen('now');
        setSessionMinutes(MINUTES[digit]);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'c':
          // preventDefault so the keystroke doesn't land in the autofocused input
          e.preventDefault();
          setOverlay({ type: 'capture' });
          break;
        case 'w':
          setScreen('waiting');
          break;
        case 't':
          setScreen('threads');
          break;
        case ',':
          setScreen('settings');
          break;
        case 'd':
          nowRef.current?.done();
          break;
        case 's':
          nowRef.current?.snooze();
          break;
        case 'n':
          nowRef.current?.skip();
          break;
        case ' ':
          if (screen === 'now' && sessionMinutes !== null) {
            e.preventDefault();
            nowRef.current?.skip();
          }
          break;
        case 'e':
          nowRef.current?.edit();
          break;
        case '?':
          setOverlay({ type: 'help' });
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen, screen, sessionMinutes]);

  return (
    <div className="app">
      {screen === 'settings' ? (
        <Settings app={app} />
      ) : screen === 'threads' ? (
        <Threads app={app} />
      ) : screen === 'waiting' ? (
        <Waiting app={app} />
      ) : (
        <Now
          app={app}
          mode={mode}
          setMode={setMode}
          minutes={sessionMinutes}
          setMinutes={setSessionMinutes}
          onEdit={(card) => setOverlay({ type: 'capture', card })}
          handlers={nowRef}
        />
      )}

      {overlay?.type === 'capture' && (
        <Capture
          app={app}
          editCard={overlay.card ?? null}
          onClose={() => setOverlay(null)}
          onToast={showToast}
        />
      )}

      {overlay?.type === 'help' && (
        <div className="overlay" onClick={() => setOverlay(null)}>
          <div className="panel">
            <h2>Keys</h2>
            <div className="menu-list" style={{ fontSize: 13 }}>
              {(
                [
                  ['1–5', 'pick 2 / 5 / 15 / 30 / 60 minutes'],
                  ['D', 'done'],
                  ['S', 'snooze'],
                  ['N / space', 'skip to next card'],
                  ['E', 'edit current card'],
                  ['C', 'capture'],
                  ['W', 'waiting'],
                  ['T', 'threads'],
                  [',', 'settings'],
                  ['esc', 'back, or clear to the picker'],
                ] as const
              ).map(([k, desc]) => (
                <div key={k} className="row" style={{ padding: '6px 0' }}>
                  <span className="key-hint">{k}</span>
                  <span className="dim">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="parse-note" style={{ padding: '4px 0' }}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              undo parse
            </button>
          )}
        </div>
      )}

      <div className="footer">
        <button className={screen === 'now' ? 'active' : ''} onClick={() => setScreen('now')}>
          now
        </button>
        <button
          className={screen === 'waiting' ? 'active' : ''}
          onClick={() => setScreen('waiting')}
        >
          waiting
        </button>
        <button
          className={screen === 'threads' ? 'active' : ''}
          onClick={() => setScreen('threads')}
        >
          threads
        </button>
        <button onClick={() => setOverlay({ type: 'capture' })}>capture</button>
        <span className="spacer" />
        <button
          className={screen === 'settings' ? 'active' : ''}
          onClick={() => setScreen('settings')}
        >
          settings
        </button>
      </div>
    </div>
  );
}

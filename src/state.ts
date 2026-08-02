import { useCallback, useMemo, useState } from 'react';
import type { Card, SessionLog, Settings, Thread } from './lib/types';
import { dayKey } from './lib/types';
import {
  loadCards,
  loadSessions,
  loadSettings,
  loadThreads,
  saveCards,
  saveSessions,
  saveSettings,
  saveThreads,
} from './lib/storage';

export interface AppState {
  threads: Thread[];
  cards: Card[];
  sessions: SessionLog[];
  settings: Settings;
  setThreads: (fn: (t: Thread[]) => Thread[]) => void;
  setCards: (fn: (c: Card[]) => Card[]) => void;
  addSession: (log: SessionLog) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  reloadAll: () => void;
}

export function useAppState(): AppState {
  const [threads, setThreadsRaw] = useState<Thread[]>(loadThreads);
  const [cards, setCardsRaw] = useState<Card[]>(loadCards);
  const [sessions, setSessionsRaw] = useState<SessionLog[]>(loadSessions);
  const [settings, setSettingsRaw] = useState<Settings>(() => {
    // stamp today as an opened day on boot
    const s = loadSettings();
    const today = dayKey(Date.now());
    if (!s.openedDays.includes(today)) {
      const next = { ...s, openedDays: [...s.openedDays, today] };
      saveSettings(next);
      return next;
    }
    return s;
  });

  const setThreads = useCallback((fn: (t: Thread[]) => Thread[]) => {
    setThreadsRaw((prev) => {
      const next = fn(prev);
      saveThreads(next);
      return next;
    });
  }, []);

  const setCards = useCallback((fn: (c: Card[]) => Card[]) => {
    setCardsRaw((prev) => {
      const next = fn(prev);
      saveCards(next);
      return next;
    });
  }, []);

  const addSession = useCallback((log: SessionLog) => {
    setSessionsRaw((prev) => {
      const next = [...prev, log];
      saveSessions(next);
      return next;
    });
  }, []);

  const setSettings = useCallback((fn: (s: Settings) => Settings) => {
    setSettingsRaw((prev) => {
      const next = fn(prev);
      saveSettings(next);
      return next;
    });
  }, []);

  // After import or reset, re-read everything from storage.
  const reloadAll = useCallback(() => {
    setThreadsRaw(loadThreads());
    setCardsRaw(loadCards());
    setSessionsRaw(loadSessions());
    setSettingsRaw(loadSettings());
  }, []);

  return useMemo(
    () => ({
      threads,
      cards,
      sessions,
      settings,
      setThreads,
      setCards,
      addSession,
      setSettings,
      reloadAll,
    }),
    [threads, cards, sessions, settings, setThreads, setCards, addSession, setSettings, reloadAll]
  );
}

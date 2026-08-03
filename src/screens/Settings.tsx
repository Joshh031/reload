import { useState } from 'react';
import type { AppState } from '../state';
import { computeStats } from '../lib/stats';
import { newSyncKey, syncNow } from '../lib/sync';
import {
  applyImport,
  exportData,
  importSummary,
  validateImport,
  wipeAll,
  type ExportBlob,
} from '../lib/storage';

export default function Settings({ app }: { app: AppState }) {
  const [note, setNote] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [pendingImport, setPendingImport] = useState<ExportBlob | null>(null);
  const [resetText, setResetText] = useState('');
  const [showReset, setShowReset] = useState(false);

  async function onExport() {
    const json = exportData();
    const cards = app.cards.length;
    try {
      await navigator.clipboard.writeText(json);
      setNote(`Copied to clipboard. ${json.length} bytes, ${cards} cards.`);
    } catch {
      // clipboard can fail outside secure contexts; show the payload instead
      setImportText(json);
      setNote(`Clipboard unavailable. Export shown below. ${json.length} bytes, ${cards} cards.`);
    }
  }

  function onValidateImport() {
    setNote(null);
    try {
      const blob = validateImport(importText);
      setPendingImport(blob);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Invalid import.');
    }
  }

  function onConfirmImport() {
    if (!pendingImport) return;
    applyImport(pendingImport);
    app.reloadAll();
    setPendingImport(null);
    setImportText('');
    setNote('Import applied.');
  }

  function onReset() {
    if (resetText !== 'reset') return;
    wipeAll();
    app.reloadAll();
    setShowReset(false);
    setResetText('');
    setNote('Storage cleared.');
  }

  const summary = pendingImport ? importSummary(pendingImport) : null;

  return (
    <div className="screen">
      <div className="screen-title">Settings</div>
      <div className="form">
        <div>
          <label>Data</label>
          <button className="btn" onClick={onExport}>
            Export to clipboard
          </button>
        </div>

        <div>
          <label>Import (paste JSON)</label>
          <textarea
            rows={4}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setPendingImport(null);
            }}
            placeholder="Paste a RELOAD export here"
          />
          {importText.trim() && !pendingImport && (
            <div style={{ marginTop: 6 }}>
              <button className="btn" onClick={onValidateImport}>
                Validate
              </button>
            </div>
          )}
          {summary && (
            <div className="parse-note" style={{ marginTop: 8 }}>
              <span>
                will replace {summary.replacesCards} cards and {summary.replacesThreads} threads
                with {summary.cards} cards, {summary.threads} threads, {summary.sessions} session
                logs. continue?
              </span>
              <button onClick={onConfirmImport}>apply</button>
              <button onClick={() => setPendingImport(null)}>cancel</button>
            </div>
          )}
        </div>

        <SyncSection app={app} />

        <div>
          <label>Anthropic API key (optional, for capture parsing)</label>
          <input
            type="password"
            value={app.settings.apiKey ?? ''}
            onChange={(e) =>
              app.setSettings((s) => ({ ...s, apiKey: e.target.value.trim() || null }))
            }
            placeholder="sk-ant-…  leave empty to parse locally"
          />
        </div>

        <StatsTable app={app} />

        <div>
          <label>Reset</label>
          {!showReset ? (
            <button className="btn danger" onClick={() => setShowReset(true)}>
              Reset all data…
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                placeholder="type reset to confirm"
              />
              <button className="btn danger" onClick={onReset} disabled={resetText !== 'reset'}>
                Wipe
              </button>
            </div>
          )}
        </div>

        {note && <div className="parse-note">{note}</div>}
      </div>
    </div>
  );
}

function SyncSection({ app }: { app: AppState }) {
  const [joinKey, setJoinKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const key = app.settings.syncKey;

  async function runSync(k: string) {
    setStatus('syncing…');
    try {
      const result = await syncNow(k);
      if (result === 'applied') app.reloadAll();
      setStatus(`synced (${result}).`);
    } catch (e) {
      setStatus(e instanceof Error ? `sync failed: ${e.message}` : 'sync failed.');
    }
  }

  function enable(k: string) {
    const trimmed = k.trim();
    if (!trimmed) return;
    app.setSettings((s) => ({ ...s, syncKey: trimmed }));
    setJoinKey('');
    void runSync(trimmed);
  }

  if (!key) {
    return (
      <div>
        <label>Sync (across devices)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn" onClick={() => enable(newSyncKey())}>
            Enable sync — create key
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={joinKey}
            onChange={(e) => setJoinKey(e.target.value)}
            placeholder="or paste the key from your other device"
          />
          <button className="btn" disabled={!joinKey.trim()} onClick={() => enable(joinKey)}>
            Join
          </button>
        </div>
        {status && <div className="parse-note" style={{ marginTop: 6 }}>{status}</div>}
      </div>
    );
  }

  return (
    <div>
      <label>Sync (across devices)</label>
      <div className="parse-note" style={{ marginBottom: 6, wordBreak: 'break-all' }}>
        key: <span className="mono">{key}</span>
        <button onClick={() => navigator.clipboard.writeText(key).catch(() => {})}>
          copy
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => runSync(key)}>
          Sync now
        </button>
        <button
          className="btn"
          onClick={() => {
            app.setSettings((s) => ({ ...s, syncKey: null }));
            setStatus('sync off. Data stays on this device and on the server.');
          }}
        >
          Disable
        </button>
      </div>
      <div className="parse-note" style={{ marginTop: 6 }}>
        {status ?? 'enter the same key on each device. anyone with the key can read this data.'}
      </div>
    </div>
  );
}

function StatsTable({ app }: { app: AppState }) {
  const s = computeStats(app.sessions, app.cards, app.threads, app.settings);
  return (
    <div>
      <label>Usage</label>
      <div className="pass-condition">
        pass condition: still opening this in week eight.
      </div>
      <table className="stats">
        <tbody>
          <tr>
            <td>Days opened</td>
            <td>
              {s.daysOpened} / {s.daysSinceInstall}
            </td>
          </tr>
          <tr>
            <td>Current streak</td>
            <td>{s.streak}d</td>
          </tr>
          <tr>
            <td>Cards completed</td>
            <td>
              {s.completedTotal} · {s.completedPerWeek.toFixed(1)}/wk
            </td>
          </tr>
          <tr>
            <td>Skip rate</td>
            <td>{s.skipRate === null ? '—' : `${Math.round(s.skipRate * 100)}%`}</td>
          </tr>
          <tr>
            <td>Median seconds to action</td>
            <td>{s.medianSecondsToAction === null ? '—' : s.medianSecondsToAction.toFixed(1)}</td>
          </tr>
          <tr>
            <td>Threads idle 14 days</td>
            <td>{s.starvedThreads.length ? s.starvedThreads.join(', ') : 'none'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

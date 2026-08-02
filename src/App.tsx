import { useState } from 'react';
import { useAppState } from './state';
import Settings from './screens/Settings';
import Threads from './screens/Threads';

type Screen = 'now' | 'waiting' | 'threads' | 'settings';

export default function App() {
  const app = useAppState();
  const [screen, setScreen] = useState<Screen>('now');

  return (
    <div className="app">
      {screen === 'settings' ? (
        <Settings app={app} />
      ) : screen === 'threads' ? (
        <Threads app={app} />
      ) : (
        <div className="screen">
          <div className="empty">RELOAD — scaffold. NOW screen arrives in a later phase.</div>
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

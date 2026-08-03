import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';
import { migrate } from './lib/storage';
import { maybeSeed } from './lib/seed';

migrate();
// Demo data is opt-in: only a ?demo visit seeds the sample threads/cards.
maybeSeed(!new URLSearchParams(window.location.search).has('demo'));

// No StrictMode: its dev-only double mount would double-fire the
// abandoned-session instrumentation, making dev stats diverge from prod.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

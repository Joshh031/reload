import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';
import { migrate } from './lib/storage';
import { maybeSeed } from './lib/seed';

migrate();
maybeSeed(new URLSearchParams(window.location.search).has('empty'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

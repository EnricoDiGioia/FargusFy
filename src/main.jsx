import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/unbounded/600.css';
import './styles/app.css';
import App from './App';
import { applySavedTheme } from './lib/theme';
import { finishLoginIfReturning } from './lib/spotifyAuth';

applySavedTheme();

// Se voltamos do login do Spotify (?code=...), termina antes de desenhar
finishLoginIfReturning()
  .catch(() => null)
  .then((spotifyResult) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App spotifyResult={spotifyResult} />
      </StrictMode>
    );
  });

// App instalável: o service worker guarda o app para abrir rápido
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

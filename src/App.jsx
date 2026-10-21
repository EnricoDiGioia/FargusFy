import { useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout';
import { ErrorBox, Empty } from './components/ui';
import { FyMark, Wordmark } from './components/Brand';
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import PlaylistPage from './pages/PlaylistPage';
import LikedPage from './pages/LikedPage';
import AlbumPage from './pages/AlbumPage';
import ArtistPage from './pages/ArtistPage';
import CharacterPage from './pages/CharacterPage';
import QueuePage from './pages/QueuePage';
import NowPlaying from './pages/NowPlaying';
import Settings, { autoNowEnabled } from './pages/Settings';
import Login from './pages/Login';
import { SessionProvider, useSession } from './state/session';
import { LibraryProvider } from './state/library';
import { ToastProvider, useToast } from './state/toast';
import { isConfigured } from './lib/supabase';
import { current, getState, livePosition, primeRestoredTrack, usePlayer } from './lib/player';
import * as api from './lib/api';
import { FARGUSGRAM_URL } from './config';

// "Ouvindo" no FargusGram: grava a música assim que ela começa a tocar de verdade
// (3 s, para não gravar cada música pulada) e renova a cada 5 min enquanto toca.
// O FargusGram mostra "Ouvindo" enquanto o registro tem menos de 6 min.
const NOW_START_MS = 3000;
const NOW_RENEW_MS = 5 * 60 * 1000;
function AutoNowPlaying() {
  const player = usePlayer();
  const { active } = useSession();
  const sent = useRef({ key: null, at: 0 });
  const t = current(player);
  useEffect(() => {
    if (!t || !active || player.isPaused || !autoNowEnabled()) return;
    const key = `${active.id}:${t.id}`;
    const startedAt = Date.now();
    const tick = () => {
      const s = getState();
      if (current(s)?.id !== t.id || s.isPaused) return;
      const fresh = sent.current.key === key && Date.now() - sent.current.at < NOW_RENEW_MS;
      if (fresh) return;
      // música nova: espera tocar uns segundos (a posição pode vir zerada no embed)
      if (sent.current.key !== key && Date.now() - startedAt < NOW_START_MS && livePosition(s) < NOW_START_MS) return;
      sent.current = { key, at: Date.now() };
      api.setNowPlaying(active.id, t).catch(() => {
        sent.current = { key: null, at: 0 };
      });
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [t?.id, active?.id, player.isPaused]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function SpotifyLoginResult({ result }) {
  const toast = useToast();
  useEffect(() => {
    if (!result) return;
    toast(result.ok ? 'Spotify Premium conectado' : result.error, { kind: result.ok ? 'info' : 'error', ms: 5000 });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Gate({ spotifyResult }) {
  const { session, me, meError, active, refreshMe } = useSession();

  useEffect(() => {
    if (active) primeRestoredTrack();
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isConfigured)
    return (
      <div className="auth">
        <ErrorBox>Cole a URL e a chave do Supabase do FargusGram em src/config.js.</ErrorBox>
      </div>
    );
  if (session === undefined || (session && me === undefined && !meError))
    return (
      <div className="splash">
        <FyMark size={72} />
        <Wordmark big />
      </div>
    );
  if (!session) return <Login />;
  if (meError)
    return (
      <div className="auth">
        <ErrorBox onRetry={refreshMe}>{meError}</ErrorBox>
      </div>
    );
  if (!me)
    return (
      <div className="auth">
        <Empty title="Conta sem acesso">Esta conta ainda não entrou no FargusGram. Termine o cadastro lá primeiro.</Empty>
      </div>
    );
  if (!active)
    return (
      <div className="auth">
        <Empty
          title="Crie um personagem primeiro"
          action={
            <a className="btn btn--primary" href={`${FARGUSGRAM_URL}#/novo-personagem`}>
              Criar no FargusGram
            </a>
          }
        >
          As playlists do FargusFy pertencem aos personagens do FargusGram.
        </Empty>
      </div>
    );

  return (
    <LibraryProvider>
      <AutoNowPlaying />
      <SpotifyLoginResult result={spotifyResult} />
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="buscar" element={<Search />} />
            <Route path="biblioteca" element={<Library />} />
            <Route path="curtidas" element={<LikedPage />} />
            <Route path="playlist/:id" element={<PlaylistPage />} />
            <Route path="album/:id" element={<AlbumPage />} />
            <Route path="artista/:id" element={<ArtistPage />} />
            <Route path="u/:handle" element={<CharacterPage />} />
            <Route path="u/:handle/curtidas" element={<LikedPage />} />
            <Route path="fila" element={<QueuePage />} />
            <Route path="tocando" element={<NowPlaying />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </LibraryProvider>
  );
}

export default function App({ spotifyResult }) {
  return (
    <ToastProvider>
      <SessionProvider>
        <Gate spotifyResult={spotifyResult} />
      </SessionProvider>
    </ToastProvider>
  );
}


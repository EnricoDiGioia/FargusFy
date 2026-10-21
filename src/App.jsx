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

// Mostra no perfil a música que está tocando (depois de 20 s, uma vez por música)
function AutoNowPlaying() {
  const player = usePlayer();
  const { active } = useSession();
  const sent = useRef(null);
  const t = current(player);
  useEffect(() => {
    if (!t || !active || player.isPaused || !autoNowEnabled()) return;
    const key = `${active.id}:${t.id}`;
    if (sent.current === key) return;
    const timer = setInterval(() => {
      const s = getState();
      if (current(s)?.id !== t.id || s.isPaused) return;
      if (livePosition(s) < 20000 && (s.duration || 0) > 25000) return;
      sent.current = key;
      clearInterval(timer);
      api.setNowPlaying(active.id, t).catch(() => {
        sent.current = null;
      });
    }, 4000);
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


import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  House,
  Library,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Artwork, Avatar, LikedCover, Mosaic } from './Art';
import { FyMark, Wordmark } from './Brand';
import { IconButton, MenuItem, Sheet, useMedia } from './ui';
import { PlaylistEditor } from './PlaylistSheets';
import { attachEmbedHost, current, cycleRepeat, livePosition, next, prev, seek, setShuffle, setVolume, toggle, usePlayer } from '../lib/player';
import { fmtTime, plural } from '../lib/format';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';
import { FARGUSGRAM_URL } from '../config';

// ------------------------------------------------------------------
// Troca de personagem (o mesmo do FargusGram)
// ------------------------------------------------------------------
export function CharacterSwitcher() {
  const { active, characters, setActive } = useSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!active) return null;
  return (
    <>
      <button type="button" className="char-chip" onClick={() => setOpen(true)} aria-label="Trocar de personagem">
        <Avatar character={active} size={28} />
        <span className="char-chip__name">@{active.handle}</span>
        <ChevronDown size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ouvindo como">
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            className="pick-row"
            onClick={() => {
              setActive(c.id);
              setOpen(false);
            }}
          >
            <Avatar character={c} size={44} />
            <span className="pick-row__text">
              <strong>
                {c.name || c.handle}
                {c.is_verified && <BadgeCheck size={14} className="verified" />}
              </strong>
              <small className="muted">@{c.handle}</small>
            </span>
            {c.id === active.id && <Check size={20} className="accent" />}
          </button>
        ))}
        <div className="sheet__links">
          <MenuItem
            icon={<Settings size={20} />}
            onClick={() => {
              setOpen(false);
              navigate('/configuracoes');
            }}
          >
            Configurações
          </MenuItem>
          <MenuItem icon={<FyMark size={20} />} href={`${FARGUSGRAM_URL}#/u/${active.handle}`}>
            Abrir @{active.handle} no FargusGram
          </MenuItem>
        </div>
      </Sheet>
    </>
  );
}

// ------------------------------------------------------------------
// Barra lateral (computador): navegação + biblioteca
// ------------------------------------------------------------------
function Sidebar() {
  const lib = useLibrary();
  const { active } = useSession();
  const [creating, setCreating] = useState(false);
  const player = usePlayer();
  const playingCtx = player.context;
  const items = [...(lib.mine ?? []), ...(lib.collabs ?? []), ...(lib.followed ?? [])];

  return (
    <aside className="sidebar" aria-label="Navegação">
      <div className="sidebar__box sidebar__nav">
        <Link to="/" className="sidebar__brand" aria-label="FargusFy, início">
          <FyMark size={30} />
          <Wordmark />
        </Link>
        <NavLink to="/" end className="side-link">
          <House size={24} />
          Início
        </NavLink>
        <NavLink to="/buscar" className="side-link">
          <Search size={24} />
          Buscar
        </NavLink>
      </div>
      <div className="sidebar__box sidebar__lib">
        <div className="sidebar__lib-head">
          <NavLink to="/biblioteca" className="side-link side-link--small">
            <Library size={24} />
            Sua biblioteca
          </NavLink>
          <IconButton label="Nova playlist" onClick={() => setCreating(true)}>
            <Plus size={20} />
          </IconButton>
        </div>
        <div className="sidebar__list">
          <NavLink to="/curtidas" className="lib-row">
            <LikedCover size={48} />
            <span className="lib-row__text">
              <strong className={playingCtx?.type === 'saved' ? 'accent' : ''}>Músicas Curtidas</strong>
              <small>Playlist · {plural(lib.saved.size, 'música', 'músicas')}</small>
            </span>
          </NavLink>
          {items.map((p) => (
            <NavLink key={p.id} to={`/playlist/${p.id}`} className="lib-row">
              <Mosaic covers={p.covers} seed={p.id} size={48} />
              <span className="lib-row__text">
                <strong className={playingCtx?.type === 'playlist' && playingCtx.id === p.id ? 'accent' : ''}>{p.name}</strong>
                <small>
                  {lib.collabs?.some((x) => x.id === p.id) ? 'Colaborativa' : 'Playlist'} · {p.character_id === active?.id ? `@${active.handle}` : `@${p.character?.handle ?? ''}`}
                </small>
              </span>
            </NavLink>
          ))}
          {lib.mine && !items.length && (
            <div className="sidebar__hint">
              <strong>Crie a primeira playlist de @{active?.handle}</strong>
              <button type="button" className="btn btn--light btn--small" onClick={() => setCreating(true)}>
                Criar playlist
              </button>
            </div>
          )}
        </div>
      </div>
      {creating && <PlaylistEditor open onClose={() => setCreating(false)} />}
    </aside>
  );
}

// ------------------------------------------------------------------
// Barra de cima: voltar/avançar e o personagem
// ------------------------------------------------------------------
function TopBar() {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar__nav">
        <IconButton label="Voltar" className="round" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </IconButton>
        <IconButton label="Avançar" className="round" onClick={() => navigate(1)}>
          <ChevronRight size={22} />
        </IconButton>
      </div>
      <Link to="/" className="topbar__brand" aria-label="FargusFy, início">
        <FyMark size={28} />
        <Wordmark />
      </Link>
      <CharacterSwitcher />
    </header>
  );
}

// ------------------------------------------------------------------
// Navegação de baixo (celular)
// ------------------------------------------------------------------
function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação">
      <NavLink to="/" end>
        <House size={24} />
        <span>Início</span>
      </NavLink>
      <NavLink to="/buscar">
        <Search size={24} />
        <span>Buscar</span>
      </NavLink>
      <NavLink to="/biblioteca">
        <Library size={24} />
        <span>Biblioteca</span>
      </NavLink>
    </nav>
  );
}

// ------------------------------------------------------------------
// Barra de progresso (player completo)
// ------------------------------------------------------------------
export function Progress({ compact = false }) {
  const player = usePlayer();
  const [, force] = useState(0);
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (player.isPaused) return;
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [player.isPaused]);
  const dur = player.duration || current(player)?.duration_ms || 0;
  const pos = drag ?? livePosition(player);
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  if (compact) return <div className="mini-progress" style={{ '--pct': `${pct}%` }} />;
  return (
    <div className="progress">
      <span className="progress__time">{fmtTime(pos)}</span>
      <input
        type="range"
        className="range"
        min={0}
        max={dur || 1}
        step={1000}
        value={Math.min(pos, dur || 1)}
        style={{ '--pct': `${pct}%` }}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag != null) seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag != null) seek(drag);
          setDrag(null);
        }}
        aria-label="Posição da música"
      />
      <span className="progress__time">{fmtTime(dur)}</span>
    </div>
  );
}

export function ShuffleRepeat() {
  const player = usePlayer();
  return (
    <>
      <IconButton label={player.shuffle ? 'Desligar aleatório' : 'Aleatório'} active={player.shuffle} onClick={() => setShuffle(!player.shuffle)}>
        <Shuffle size={18} />
      </IconButton>
      <IconButton
        label={player.repeat === 'off' ? 'Repetir' : player.repeat === 'all' ? 'Repetir uma' : 'Não repetir'}
        active={player.repeat !== 'off'}
        onClick={cycleRepeat}
      >
        {player.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
      </IconButton>
    </>
  );
}

export function PlayPause({ size = 'big' }) {
  const player = usePlayer();
  const playing = !player.isPaused;
  return (
    <button type="button" className={`play-btn play-btn--${size}`} onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
      {playing ? <Pause size={size === 'big' ? 20 : 18} fill="currentColor" /> : <Play size={size === 'big' ? 20 : 18} fill="currentColor" />}
    </button>
  );
}

function VolumeControl() {
  const player = usePlayer();
  const last = useRef(0.7);
  const v = player.volume;
  const Icon = v === 0 ? VolumeX : v < 0.5 ? Volume1 : Volume2;
  return (
    <div className="volume">
      <IconButton
        label={v === 0 ? 'Ligar som' : 'Sem som'}
        onClick={() => {
          if (v > 0) {
            last.current = v;
            setVolume(0);
          } else setVolume(last.current || 0.7);
        }}
      >
        <Icon size={18} />
      </IconButton>
      <input type="range" className="range" min={0} max={1} step={0.01} value={v} style={{ '--pct': `${v * 100}%` }} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
    </div>
  );
}

// ------------------------------------------------------------------
// Dock do player (fica sempre montado: o iframe do Spotify mora aqui)
// ------------------------------------------------------------------
function Dock() {
  const player = usePlayer();
  const lib = useLibrary();
  const t = current(player);
  const hostRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const desktop = useMedia('(min-width: 900px)');
  const embedMode = player.engine === 'embed';

  useEffect(() => {
    attachEmbedHost(hostRef.current);
    return () => attachEmbedHost(null);
  }, []);

  const saved = t && lib.isSaved(t.id);
  const ctx = player.context;
  const onNowPlaying = pathname === '/tocando';
  const hidden = !t;

  return (
    <div className={`dock ${embedMode ? 'dock--embed' : 'dock--sdk'} ${hidden ? 'is-empty' : ''} ${onNowPlaying && !desktop && !embedMode ? 'is-away' : ''}`}>
      {player.error && <div className="dock__error">{player.error}</div>}
      <div className="dock__info">
        {t && (
          <>
            <button type="button" className="dock__art" onClick={() => navigate('/tocando')} aria-label="Abrir tela tocando agora">
              <Artwork src={t.artwork} size={56} />
            </button>
            <div className="dock__text">
              <button type="button" className="dock__title" onClick={() => navigate('/tocando')}>
                {t.title}
              </button>
              <span className="dock__artist muted">{t.artist}</span>
              {ctx?.href && (
                <Link to={ctx.href} className="dock__ctx">
                  {ctx.name}
                </Link>
              )}
            </div>
            <IconButton label={saved ? 'Remover das curtidas' : 'Curtir'} className={`track__heart ${saved ? 'is-on' : ''}`} onClick={() => lib.toggleSaved(t)}>
              <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
            </IconButton>
          </>
        )}
      </div>

      <div className="dock__center">
        <div className="dock__controls">
          {!embedMode && <ShuffleRepeat />}
          <IconButton label="Anterior" onClick={prev} className="dock__prev">
            <SkipBack size={20} fill="currentColor" />
          </IconButton>
          {/* modo embed: o próprio player do Spotify tem o play, a barra e a capa */}
          <div className="dock__embed" ref={hostRef} />
          {!embedMode && <PlayPause />}
          <IconButton label="Próxima" onClick={() => next()} className="dock__next">
            <SkipForward size={20} fill="currentColor" />
          </IconButton>
          {embedMode && desktop && <ShuffleRepeat />}
        </div>
        {!embedMode && desktop && <Progress />}
      </div>

      <div className="dock__right">
        <IconButton label="Fila" active={pathname === '/fila'} onClick={() => navigate(pathname === '/fila' ? -1 : '/fila')}>
          <ListMusic size={18} />
        </IconButton>
        {!embedMode && desktop && <VolumeControl />}
        <IconButton label="Tocando agora" className="dock__expand" onClick={() => navigate('/tocando')}>
          <Maximize2 size={18} />
        </IconButton>
      </div>
      {!embedMode && !desktop && <Progress compact />}
    </div>
  );
}

// ------------------------------------------------------------------
// Moldura do app
// ------------------------------------------------------------------
export default function Layout() {
  const desktop = useMedia('(min-width: 900px)');
  const main = useRef(null);
  const { pathname } = useLocation();
  const player = usePlayer();
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className={`shell ${current(player) ? 'has-player' : ''} ${player.engine === 'embed' ? 'is-embed' : 'is-sdk'}`}>
      {desktop && <Sidebar />}
      <main className="main" ref={main}>
        <TopBar />
        <div className="main__content">
          <Outlet />
        </div>
      </main>
      <Dock />
      {!desktop && <BottomNav />}
    </div>
  );
}

import { Link } from 'react-router';
import { BadgeCheck, Pause, Play, Shuffle } from 'lucide-react';
import { Avatar, paletteFor } from './Art';
import { IconButton } from './ui';
import { setShuffle, toggle, usePlayer } from '../lib/player';

// Cabeçalho de playlist, álbum, artista e perfil (capa + título + degradê)
export function CollectionHeader({ kind, title, art, colorSeed, description, owner, meta, round = false }) {
  const [a] = paletteFor(colorSeed || title || '');
  return (
    <header className="hero" style={{ '--hero': a }}>
      <div className={`hero__art ${round ? 'hero__art--round' : ''}`}>{art}</div>
      <div className="hero__text">
        <span className="hero__kind">{kind}</span>
        <h1 className={`hero__title ${title.length > 28 ? 'hero__title--long' : ''}`}>{title}</h1>
        {description && <p className="hero__desc">{description}</p>}
        <div className="hero__meta">
          {owner && (
            <Link to={`/u/${owner.handle}`} className="hero__owner">
              <Avatar character={owner} size={24} />
              <strong>@{owner.handle}</strong>
              {owner.is_verified && <BadgeCheck size={14} className="verified" />}
            </Link>
          )}
          {meta && <span className="hero__facts">{meta}</span>}
        </div>
      </div>
    </header>
  );
}

// Botão grande de tocar: vira pausar quando a fila veio desta coleção
export function ActionBar({ context, onPlay, disabled, children }) {
  const player = usePlayer();
  const isThis = context && player.context?.type === context.type && player.context?.id === context.id;
  const playing = isThis && !player.isPaused;
  return (
    <div className="action-bar">
      <button
        type="button"
        className="play-btn play-btn--hero"
        disabled={disabled}
        onClick={() => (isThis ? toggle() : onPlay())}
        aria-label={playing ? 'Pausar' : 'Tocar'}
      >
        {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
      </button>
      <IconButton label={player.shuffle ? 'Desligar aleatório' : 'Aleatório'} active={player.shuffle} onClick={() => setShuffle(!player.shuffle)} className="action-bar__shuffle">
        <Shuffle size={24} />
      </IconButton>
      {children}
    </div>
  );
}

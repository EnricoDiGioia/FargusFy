import { Link } from 'react-router';
import { BadgeCheck, Play } from 'lucide-react';
import { Artwork, Avatar, Mosaic } from './Art';
import { plural } from '../lib/format';

function PlayFab({ onPlay, label }) {
  if (!onPlay) return null;
  return (
    <button
      type="button"
      className="card__fab"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
    >
      <Play size={20} fill="currentColor" />
    </button>
  );
}

export function PlaylistCard({ playlist, onPlay, showOwner = true }) {
  const c = playlist.character;
  return (
    <Link to={`/playlist/${playlist.id}`} className="card">
      <div className="card__art">
        <Mosaic covers={playlist.covers} seed={playlist.id} />
        <PlayFab onPlay={onPlay && playlist.track_count ? onPlay : null} label={`Tocar ${playlist.name}`} />
      </div>
      <strong className="card__title">{playlist.name}</strong>
      <span className="card__sub">{showOwner && c ? `de @${c.handle}` : plural(playlist.track_count, 'música', 'músicas')}</span>
    </Link>
  );
}

export function AlbumCard({ album }) {
  return (
    <Link to={`/album/${album.id}`} className="card">
      <div className="card__art">
        <Artwork src={album.artwork} />
      </div>
      <strong className="card__title">{album.name}</strong>
      <span className="card__sub">
        {[album.year, album.type === 'single' ? 'Single' : album.type === 'compilation' ? 'Coletânea' : album.artist].filter(Boolean).join(' · ')}
      </span>
    </Link>
  );
}

export function ArtistCard({ artist }) {
  return (
    <Link to={`/artista/${artist.id}`} className="card card--round">
      <div className="card__art">
        <Artwork src={artist.image} className="art--round" />
      </div>
      <strong className="card__title">{artist.name}</strong>
      <span className="card__sub">Artista</span>
    </Link>
  );
}

export function CharacterCard({ character, sub }) {
  return (
    <Link to={`/u/${character.handle}`} className="card card--round">
      <div className="card__art">
        <Avatar character={character} size={160} className="avatar--fill" />
      </div>
      <strong className="card__title">
        {character.name || `@${character.handle}`}
        {character.is_verified && <BadgeCheck size={14} className="verified" aria-label="Verificado" />}
      </strong>
      <span className="card__sub">{sub ?? `@${character.handle}`}</span>
    </Link>
  );
}

// Fileira com rolagem lateral no celular e grade no computador
export function Shelf({ title, to, children, empty = null }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && !items.length && !empty) return null;
  return (
    <section className="shelf">
      <div className="shelf__head">
        <h2>{title}</h2>
        {to && (
          <Link to={to} className="shelf__more">
            Mostrar tudo
          </Link>
        )}
      </div>
      {Array.isArray(items) && !items.length ? empty : <div className="shelf__row">{items}</div>}
    </section>
  );
}

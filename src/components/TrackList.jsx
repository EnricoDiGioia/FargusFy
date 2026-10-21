import { memo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, Clock3, Disc3, ExternalLink, Heart, ListEnd, ListPlus, ListStart, MoreHorizontal, Play, Plus, Radio, Trash2, UserRound } from 'lucide-react';
import { Artwork, Avatar, Equalizer } from './Art';
import { IconButton, MenuItem, Sheet } from './ui';
import { AddToPlaylist } from './PlaylistSheets';
import { addToQueue, current, playNext, playTracks, toggle, usePlayer } from '../lib/player';
import { fmtTime, timeAgo } from '../lib/format';
import { openUrl } from '../lib/catalog';
import * as api from '../lib/api';
import { useLibrary } from '../state/library';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';

// Menu de uma música (os três pontinhos)
export function TrackMenu({ track, open, onClose, extra = null }) {
  const lib = useLibrary();
  const { active } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  if (!track) return null;
  if (adding) return <AddToPlaylist open tracks={[track]} onClose={() => (setAdding(false), onClose())} />;
  const saved = lib?.isSaved(track.id);
  const go = (to) => {
    onClose();
    navigate(to);
  };
  const artistId = track.artists?.[0]?.id;

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="menu-head">
        <Artwork src={track.artwork} size={52} />
        <div className="menu-head__text">
          <strong>{track.title}</strong>
          <span className="muted">{track.artist}</span>
        </div>
      </div>
      <MenuItem icon={<ListPlus size={20} />} onClick={() => setAdding(true)}>
        Adicionar à playlist
      </MenuItem>
      <MenuItem icon={<Heart size={20} fill={saved ? 'currentColor' : 'none'} />} onClick={() => (lib.toggleSaved(track), onClose())}>
        {saved ? 'Remover das Músicas Curtidas' : 'Curtir'}
      </MenuItem>
      <MenuItem icon={<ListStart size={20} />} onClick={() => (playNext(track), toast('Toca em seguida'), onClose())}>
        Tocar em seguida
      </MenuItem>
      <MenuItem icon={<ListEnd size={20} />} onClick={() => (addToQueue(track), toast('Adicionada à fila'), onClose())}>
        Adicionar à fila
      </MenuItem>
      {active && (
        <MenuItem
          icon={<Radio size={20} />}
          onClick={async () => {
            onClose();
            try {
              await api.setNowPlaying(active.id, track);
              toast(`@${active.handle} está ouvindo "${track.title}"`);
            } catch (e) {
              toast(api.errorMessage(e), { kind: 'error' });
            }
          }}
        >
          Definir como "ouvindo agora"
        </MenuItem>
      )}
      {extra?.(onClose)}
      {track.album_id && (
        <MenuItem icon={<Disc3 size={20} />} onClick={() => go(`/album/${track.album_id}`)}>
          Ir para o álbum
        </MenuItem>
      )}
      {artistId && (
        <MenuItem icon={<UserRound size={20} />} onClick={() => go(`/artista/${artistId}`)}>
          Ir para o artista
        </MenuItem>
      )}
      <MenuItem icon={<ExternalLink size={20} />} href={openUrl('track', track.id)} external onClick={onClose}>
        Abrir no Spotify
      </MenuItem>
    </Sheet>
  );
}

function ArtistLinks({ track }) {
  if (track.artists?.length) {
    return track.artists.map((a, i) => (
      <span key={a.id || i}>
        {i > 0 && ', '}
        {a.id ? <Link to={`/artista/${a.id}`}>{a.name}</Link> : a.name}
      </span>
    ));
  }
  return track.artist;
}

const TrackRow = memo(function TrackRow({ track, n, isCurrent, isPaused, onPlay, showArt, showAlbum, showAdded, showAddedBy, saved, onToggleSaved, onMenu, addLabel, onAdd }) {
  return (
    <div className={`track ${isCurrent ? 'is-current' : ''}`} role="row" onDoubleClick={onPlay}>
      <div className="track__n" role="cell">
        {isCurrent ? <Equalizer paused={isPaused} /> : <span className="track__num">{n}</span>}
        <button type="button" className="track__play" onClick={onPlay} aria-label={`Tocar ${track.title}`}>
          <Play size={16} fill="currentColor" />
        </button>
      </div>
      <div className="track__main" role="cell">
        {showArt && <Artwork src={track.artwork} size={42} />}
        <div className="track__text">
          <button type="button" className="track__title" onClick={onPlay}>
            {track.title}
          </button>
          <span className="track__artist">
            {track.explicit && (
              <span className="explicit" title="Explícita">
                E
              </span>
            )}
            <ArtistLinks track={track} />
          </span>
        </div>
      </div>
      {showAlbum && (
        <div className="track__album" role="cell">
          {track.album_id ? <Link to={`/album/${track.album_id}`}>{track.album}</Link> : track.album}
        </div>
      )}
      {showAdded && (
        <div className="track__added muted" role="cell">
          {showAddedBy && track.addedBy ? (
            <Link to={`/u/${track.addedBy.handle}`} className="added-by" title={`Adicionada por @${track.addedBy.handle}`}>
              <Avatar character={track.addedBy} size={20} />
              <span>@{track.addedBy.handle}</span>
            </Link>
          ) : null}
          {track.added_at ? <span className="added-when">{timeAgo(track.added_at)}</span> : ''}
        </div>
      )}
      <div className="track__end" role="cell">
        {onAdd ? (
          <IconButton label={addLabel || 'Adicionar'} className="track__add" onClick={() => onAdd(track)}>
            <Plus size={20} />
          </IconButton>
        ) : (
          <IconButton label={saved ? 'Remover das curtidas' : 'Curtir'} className={`track__heart ${saved ? 'is-on' : ''}`} onClick={() => onToggleSaved(track)}>
            <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
          </IconButton>
        )}
        <span className="track__time muted">{fmtTime(track.duration_ms)}</span>
        <IconButton label="Mais opções" className="track__more" onClick={() => onMenu(track, n - 1)}>
          <MoreHorizontal size={20} />
        </IconButton>
      </div>
    </div>
  );
});

// Lista de músicas. context diz de onde a fila veio (aparece no player)
export function TrackList({ tracks, context = null, showArt = true, showAlbum = true, showAdded = false, showAddedBy = false, header = true, menuExtra = null, onAdd = null, addLabel }) {
  const player = usePlayer();
  const lib = useLibrary();
  const [menu, setMenu] = useState(null); // { track, i }
  const cur = current(player);
  const sameContext = context && player.context?.id === context.id && player.context?.type === context.type;

  if (!tracks?.length) return null;

  const play = (i) => {
    const t = tracks[i];
    if (cur && cur.id === t.id && (sameContext || !context)) return toggle();
    playTracks(tracks, i, context);
  };

  return (
    <div className={`tracks ${showAlbum ? 'tracks--album' : ''} ${showAdded ? 'tracks--added' : ''} ${showAdded && showAddedBy ? 'tracks--by' : ''}`} role="table">
      {header && (
        <div className="tracks__head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Título</span>
          {showAlbum && <span role="columnheader">Álbum</span>}
          {showAdded && <span role="columnheader">{showAddedBy ? 'Adicionada por' : 'Adicionada'}</span>}
          <span role="columnheader" className="tracks__head-end">
            <Clock3 size={16} aria-label="Duração" />
          </span>
        </div>
      )}
      {tracks.map((t, i) => {
        const isCurrent = !!cur && cur.id === t.id && (sameContext || !context || player.context == null);
        return (
          <TrackRow
            key={t.rowId ?? `${t.id}-${i}`}
            track={t}
            n={i + 1}
            isCurrent={isCurrent}
            isPaused={player.isPaused}
            onPlay={() => play(i)}
            showArt={showArt}
            showAlbum={showAlbum}
            showAdded={showAdded}
            showAddedBy={showAddedBy}
            saved={lib?.isSaved(t.id)}
            onToggleSaved={lib?.toggleSaved}
            onMenu={(track, idx) => setMenu({ track, i: idx })}
            onAdd={onAdd}
            addLabel={addLabel}
          />
        );
      })}
      {menu && (
        <TrackMenu
          track={menu.track}
          open
          onClose={() => setMenu(null)}
          extra={menuExtra ? (close) => menuExtra(menu.track, menu.i, close) : null}
        />
      )}
    </div>
  );
}

// Itens extras de menu para playlists do próprio personagem
export function ownerMenuItems({ onMoveUp, onMoveDown, onRemove }) {
  return (track, i, close) => (
    <>
      {onMoveUp && i > 0 && (
        <MenuItem icon={<ArrowUp size={20} />} onClick={() => (onMoveUp(i), close())}>
          Subir
        </MenuItem>
      )}
      {onMoveDown && (
        <MenuItem icon={<ArrowDown size={20} />} onClick={() => (onMoveDown(i), close())}>
          Descer
        </MenuItem>
      )}
      <MenuItem icon={<Trash2 size={20} />} danger onClick={() => (onRemove(track, i), close())}>
        Remover desta playlist
      </MenuItem>
    </>
  );
}

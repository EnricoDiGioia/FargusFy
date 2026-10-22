import { Link } from 'react-router';
import { Music2, Play, Sparkles } from 'lucide-react';
import { Artwork, Avatar, LikedCover, Mosaic } from '../components/Art';
import { CharacterCard, PlaylistCard, Shelf } from '../components/Cards';
import { ErrorBox, Loading, useAsync } from '../components/ui';
import * as api from '../lib/api';
import { greeting, timeAgo } from '../lib/format';
import { playTracks } from '../lib/player';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

export async function playPlaylist(p, startIndex = 0) {
  const tracks = await api.playlistTracks(p.id);
  playTracks(tracks, startIndex, { type: 'playlist', id: p.id, name: p.name, href: `/playlist/${p.id}` });
  return tracks;
}

function QuickTile({ to, art, title, onPlay }) {
  return (
    <Link to={to} className="quick">
      {art}
      <strong>{title}</strong>
      {onPlay && (
        <button
          type="button"
          className="quick__play"
          aria-label={`Tocar ${title}`}
          onClick={(e) => {
            e.preventDefault();
            onPlay();
          }}
        >
          <Play size={18} fill="currentColor" />
        </button>
      )}
    </Link>
  );
}

export default function Home() {
  const { active } = useSession();
  const lib = useLibrary();
  const toast = useToast();
  const feed = useAsync(() => Promise.all([api.recentPlaylists(18), api.nowPlayingList(20)]), []);
  const [recent, listening] = feed.data ?? [[], []];
  const others = recent.filter((p) => p.character_id !== active?.id);

  const play = (p) => playPlaylist(p).catch((e) => toast(api.errorMessage(e), { kind: 'error' }));
  const playLiked = async () => {
    try {
      const tracks = await api.savedTracks(active.id);
      if (!tracks.length) return toast('Nenhuma música curtida ainda');
      playTracks(tracks, 0, { type: 'saved', id: active.id, name: 'Músicas Curtidas', href: '/curtidas' });
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
    }
  };

  return (
    <div className="page page--home">
      <div className="home-hero">
        <h1>
          {greeting()}
          {active ? `, ${active.name || '@' + active.handle}` : ''}
        </h1>
      </div>

      {lib.error && <ErrorBox onRetry={lib.refresh}>{lib.error}</ErrorBox>}

      <div className="quick-grid">
        <QuickTile to="/curtidas" art={<LikedCover size={56} />} title="Músicas Curtidas" onPlay={playLiked} />
        {(lib.mine ?? []).slice(0, 7).map((p) => (
          <QuickTile key={p.id} to={`/playlist/${p.id}`} art={<Mosaic covers={p.covers} seed={p.id} size={56} />} title={p.name} onPlay={p.track_count ? () => play(p) : null} />
        ))}
      </div>

      {active && (
        <Link to="/retrospectiva" className="wr-banner">
          <Sparkles size={22} aria-hidden="true" />
          <span>
            <strong>Retrospectiva {new Date().getFullYear()}</strong>
            <small>O que @{active.handle} mais ouviu, em minutos, artistas e músicas</small>
          </span>
        </Link>
      )}

      {feed.loading && <Loading />}
      {feed.error && <ErrorBox onRetry={feed.reload}>{api.errorMessage(feed.error)}</ErrorBox>}

      {!!listening.length && (
        <Shelf title="Ouvindo agora em Fargus">
          {listening.map(({ character, track, at }) => (
            <Link key={character.id} to={`/u/${character.handle}`} className="listening">
              <span className="listening__art">
                <Artwork src={track.artwork} />
                <Avatar character={character} size={40} className="listening__avatar" />
              </span>
              <strong className="card__title">{track.title}</strong>
              <span className="card__sub">
                @{character.handle} · {timeAgo(at)}
              </span>
            </Link>
          ))}
        </Shelf>
      )}

      <Shelf title="Playlists da campanha">
        {others.map((p) => (
          <PlaylistCard key={p.id} playlist={p} onPlay={() => play(p)} />
        ))}
      </Shelf>

      {!!(lib.mine ?? []).length && (
        <Shelf title={`Playlists de @${active?.handle}`} to="/biblioteca">
          {lib.mine.slice(0, 10).map((p) => (
            <PlaylistCard key={p.id} playlist={p} onPlay={() => play(p)} showOwner={false} />
          ))}
        </Shelf>
      )}

      {!!(lib.followed ?? []).length && (
        <Shelf title="Que você segue">
          {lib.followed.slice(0, 10).map((p) => (
            <PlaylistCard key={p.id} playlist={p} onPlay={() => play(p)} />
          ))}
        </Shelf>
      )}

      {!feed.loading && !others.length && !listening.length && (
        <div className="empty empty--wide">
          <div className="empty__icon">
            <Music2 size={36} />
          </div>
          <h3>A trilha sonora de Fargus começa aqui</h3>
          <p className="muted">Busque músicas, monte playlists para os personagens e mostre o que cada um está ouvindo.</p>
          <Link to="/buscar" className="btn btn--primary">
            Buscar músicas
          </Link>
        </div>
      )}

      {!!listening.length && (
        <Shelf title="Personagens">
          {listening.slice(0, 10).map(({ character }) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </Shelf>
      )}
    </div>
  );
}

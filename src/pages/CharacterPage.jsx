import { Link, useParams } from 'react-router';
import { ExternalLink, Heart, Play, Radio } from 'lucide-react';
import { Artwork, Avatar, LikedCover } from '../components/Art';
import { CharacterCard, PlaylistCard, Shelf } from '../components/Cards';
import { CollectionHeader } from '../components/Header';
import { TrackList } from '../components/TrackList';
import { Empty, ErrorBox, Loading, useAsync } from '../components/ui';
import * as api from '../lib/api';
import { plural, timeAgo } from '../lib/format';
import { playTracks } from '../lib/player';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { FARGUSGRAM_URL } from '../config';
import { playPlaylist } from './Home';

// artistas que mais aparecem nas curtidas (o banco guarda só o nome)
function topArtists(tracks, n = 6) {
  const count = new Map();
  for (const t of tracks) {
    const name = (t.artist || '').split(', ')[0].trim();
    if (!name) continue;
    const cur = count.get(name) || { name, n: 0, artwork: t.artwork };
    cur.n += 1;
    count.set(name, cur);
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, n);
}

// Perfil musical de um personagem, no estilo do perfil do Spotify
export default function CharacterPage() {
  const { handle } = useParams();
  const { isMine } = useSession();
  const toast = useToast();
  const res = useAsync(async () => {
    const c = await api.characterByHandle(handle);
    if (!c) return null;
    const [lists, collabs, followed, now, savedN, saved, follows, following] = await Promise.all([
      api.playlistsOf(c.id),
      api.collabPlaylistsOf(c.id).catch(() => []),
      api.followedPlaylists(c.id).catch(() => []),
      api.nowPlayingOf(c.id).catch(() => null),
      api.savedCount(c.id).catch(() => 0),
      api.savedTracks(c.id, 200).catch(() => []),
      api.followCounts(c.id).catch(() => ({ followers: 0, following: 0 })),
      api.followingOf(c.id, 12).catch(() => []),
    ]);
    return { c, lists, collabs, followed, now, savedN, saved, follows, following };
  }, [handle]);

  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox onRetry={res.reload}>{api.errorMessage(res.error)}</ErrorBox>;
  if (!res.data) return <Empty title="Personagem não encontrado">Confira o @ no FargusGram.</Empty>;
  const { c, lists, collabs, followed, now, savedN, saved, follows, following } = res.data;
  const mine = isMine(c.id);
  const publicLists = lists.filter((p) => p.is_public || mine);
  const visibleCollabs = collabs.filter((p) => p.is_public || mine);
  const artists = topArtists(saved);
  const likedContext = { type: 'saved', id: c.id, name: `Curtidas de @${c.handle}`, href: `/u/${c.handle}/curtidas` };
  const play = (p) => playPlaylist(p).catch((e) => toast(api.errorMessage(e), { kind: 'error' }));

  const meta = [
    plural(publicLists.length, 'playlist pública', 'playlists públicas'),
    plural(follows.followers, 'seguidor', 'seguidores'),
    plural(follows.following, 'seguindo', 'seguindo'),
  ].join(' · ');

  return (
    <div className="page page--collection page--profile">
      <CollectionHeader
        kind="Perfil"
        title={c.name || `@${c.handle}`}
        art={<Avatar character={c} size={232} className="avatar--fill" />}
        round
        colorSeed={c.handle}
        meta={
          <>
            <strong className="hero__handle">@{c.handle}</strong> · {meta}
          </>
        }
      />
      <div className="action-bar">
        {saved.length > 0 && (
          <button type="button" className="play-btn play-btn--hero" aria-label={`Tocar as curtidas de @${c.handle}`} onClick={() => playTracks(saved, 0, likedContext)}>
            <Play size={24} fill="currentColor" />
          </button>
        )}
        <a className="btn btn--ghost btn--small" href={`${FARGUSGRAM_URL}#/u/${c.handle}`}>
          <ExternalLink size={16} /> Ver no FargusGram
        </a>
      </div>

      {now && (
        <section className="shelf">
          <div className="shelf__head">
            <h2>
              <Radio size={18} className="accent" /> Ouvindo agora
            </h2>
          </div>
          <div className="now-card">
            <Artwork src={now.track.artwork} size={72} />
            <div className="now-card__text">
              <strong>{now.track.title}</strong>
              <span className="muted">{now.track.artist}</span>
              <small className="muted">{timeAgo(now.at)}</small>
            </div>
            <button type="button" className="play-btn play-btn--big" aria-label={`Tocar ${now.track.title}`} onClick={() => playTracks([now.track], 0, null)}>
              <Play size={20} fill="currentColor" />
            </button>
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section className="shelf">
          <div className="shelf__head">
            <h2>Músicas curtidas</h2>
            <Link to={`/u/${c.handle}/curtidas`} className="shelf__more">
              Mostrar todas ({savedN.toLocaleString('pt-BR')})
            </Link>
          </div>
          <TrackList tracks={saved.slice(0, 5)} context={likedContext} header={false} showAlbum />
        </section>
      )}

      {artists.length > 0 && (
        <Shelf title="Artistas mais curtidos">
          {artists.map((a) => (
            <Link key={a.name} to={`/buscar?q=${encodeURIComponent(a.name)}&f=artist`} className="card card--round">
              <div className="card__art">
                <Artwork src={a.artwork} className="art--round" />
              </div>
              <strong className="card__title">{a.name}</strong>
              <span className="card__sub">{plural(a.n, 'música curtida', 'músicas curtidas')}</span>
            </Link>
          ))}
        </Shelf>
      )}

      <Shelf title="Playlists públicas" empty={<p className="muted pad">{mine ? 'Você ainda não criou playlists com este personagem.' : 'Nenhuma playlist pública ainda.'}</p>}>
        {saved.length > 0 && (
          <Link to={`/u/${c.handle}/curtidas`} className="card">
            <div className="card__art">
              <LikedCover />
            </div>
            <strong className="card__title">Músicas Curtidas</strong>
            <span className="card__sub">{plural(savedN, 'música', 'músicas')}</span>
          </Link>
        )}
        {publicLists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} showOwner={false} onPlay={() => play(p)} />
        ))}
      </Shelf>

      {visibleCollabs.length > 0 && (
        <Shelf title="Colaborações">
          {visibleCollabs.map((p) => (
            <PlaylistCard key={p.id} playlist={p} onPlay={() => play(p)} />
          ))}
        </Shelf>
      )}

      {followed.length > 0 && (
        <Shelf title="Playlists que segue">
          {followed.map((p) => (
            <PlaylistCard key={p.id} playlist={p} onPlay={() => play(p)} />
          ))}
        </Shelf>
      )}

      {following.length > 0 && (
        <Shelf title="Seguindo no FargusGram">
          {following.map((f) => (
            <CharacterCard key={f.id} character={f} />
          ))}
        </Shelf>
      )}

      {!now && !saved.length && !publicLists.length && !followed.length && (
        <Empty icon={<Heart size={32} />} title={`@${c.handle} ainda não ouviu nada por aqui`}>
          Quando curtir músicas ou criar playlists, elas aparecem neste perfil.
        </Empty>
      )}
    </div>
  );
}

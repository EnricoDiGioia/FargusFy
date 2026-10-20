import { Link, useParams } from 'react-router';
import { ExternalLink, Play, Radio } from 'lucide-react';
import { Artwork, Avatar } from '../components/Art';
import { PlaylistCard, Shelf } from '../components/Cards';
import { CollectionHeader } from '../components/Header';
import { Empty, ErrorBox, Loading, useAsync } from '../components/ui';
import * as api from '../lib/api';
import { plural, timeAgo } from '../lib/format';
import { playTracks } from '../lib/player';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { FARGUSGRAM_URL } from '../config';
import { playPlaylist } from './Home';

// Perfil musical de um personagem
export default function CharacterPage() {
  const { handle } = useParams();
  const { isMine } = useSession();
  const toast = useToast();
  const res = useAsync(async () => {
    const c = await api.characterByHandle(handle);
    if (!c) return null;
    const [lists, now, saved] = await Promise.all([api.playlistsOf(c.id), api.nowPlayingOf(c.id), api.savedCount(c.id).catch(() => 0)]);
    return { c, lists, now, saved };
  }, [handle]);

  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox onRetry={res.reload}>{api.errorMessage(res.error)}</ErrorBox>;
  if (!res.data) return <Empty title="Personagem não encontrado">Confira o @ no FargusGram.</Empty>;
  const { c, lists, now, saved } = res.data;
  const mine = isMine(c.id);
  const publicLists = lists.filter((p) => p.is_public || mine);

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind="Perfil"
        title={c.name || `@${c.handle}`}
        art={<Avatar character={c} size={232} className="avatar--fill" />}
        round
        colorSeed={c.handle}
        meta={[`@${c.handle}`, plural(publicLists.length, 'playlist', 'playlists'), plural(saved, 'música curtida', 'músicas curtidas')].join(' · ')}
      />
      <div className="action-bar">
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
          {now.track.album_id && (
            <Link to={`/album/${now.track.album_id}`} className="link-sm">
              Ver o álbum
            </Link>
          )}
        </section>
      )}

      <Shelf
        title="Playlists"
        empty={<p className="muted pad">{mine ? 'Você ainda não criou playlists com este personagem.' : 'Nenhuma playlist pública ainda.'}</p>}
      >
        {publicLists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} showOwner={false} onPlay={() => playPlaylist(p).catch((e) => toast(api.errorMessage(e), { kind: 'error' }))} />
        ))}
      </Shelf>
    </div>
  );
}

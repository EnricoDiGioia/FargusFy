import { useParams } from 'react-router';
import { Heart } from 'lucide-react';
import { LikedCover } from '../components/Art';
import { ActionBar, CollectionHeader } from '../components/Header';
import { TrackList } from '../components/TrackList';
import { Empty, ErrorBox, Loading, useAsync } from '../components/ui';
import * as api from '../lib/api';
import { playTracks } from '../lib/player';
import { fmtTotal, plural } from '../lib/format';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';

// Músicas curtidas: as do personagem ativo (/curtidas) ou de qualquer um (/u/:handle/curtidas)
export default function LikedPage() {
  const { handle } = useParams();
  const { active } = useSession();
  const lib = useLibrary();
  const own = !handle || handle === active?.handle;
  // as próprias recarregam quando o coração muda em outra tela
  const res = useAsync(async () => {
    const who = own ? active : await api.characterByHandle(handle);
    if (!who) return null;
    return { who, tracks: await api.savedTracks(who.id) };
  }, [handle, active?.id, own ? lib.saved.size : 0]);

  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorBox onRetry={res.reload}>{api.errorMessage(res.error)}</ErrorBox>;
  if (!res.data) return <Empty title="Personagem não encontrado" />;
  const { who, tracks } = res.data;
  const context = { type: 'saved', id: who.id, name: own ? 'Músicas Curtidas' : `Curtidas de @${who.handle}`, href: own ? '/curtidas' : `/u/${who.handle}/curtidas` };

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind="Playlist"
        title="Músicas Curtidas"
        art={<LikedCover />}
        colorSeed="liked"
        owner={who}
        meta={[plural(tracks.length, 'música', 'músicas'), fmtTotal(tracks.reduce((s, t) => s + t.duration_ms, 0))].filter(Boolean).join(' · ')}
      />
      <ActionBar context={context} disabled={!tracks.length} onPlay={() => playTracks(tracks, 0, context)} />
      {!tracks.length && (
        <Empty icon={<Heart size={32} />} title={own ? 'As músicas curtidas aparecem aqui' : `@${who.handle} ainda não curtiu músicas`}>
          {own ? 'Toque no coração de qualquer música para guardar aqui.' : null}
        </Empty>
      )}
      <TrackList tracks={tracks} context={context} showAdded />
    </div>
  );
}

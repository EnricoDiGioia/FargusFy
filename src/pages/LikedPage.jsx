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

export default function LikedPage() {
  const { active } = useSession();
  const lib = useLibrary();
  // recarrega quando o conjunto de curtidas muda (coração em outra tela)
  const res = useAsync(() => (active ? api.savedTracks(active.id) : []), [active?.id, lib.saved.size]);
  if (!active) return null;
  const tracks = res.data ?? [];
  const context = { type: 'saved', id: active.id, name: 'Músicas Curtidas', href: '/curtidas' };
  return (
    <div className="page page--collection">
      <CollectionHeader
        kind="Playlist"
        title="Músicas Curtidas"
        art={<LikedCover />}
        colorSeed="liked"
        owner={active}
        meta={[plural(tracks.length, 'música', 'músicas'), fmtTotal(tracks.reduce((s, t) => s + t.duration_ms, 0))].filter(Boolean).join(' · ')}
      />
      <ActionBar context={context} disabled={!tracks.length} onPlay={() => playTracks(tracks, 0, context)} />
      {res.loading && !res.data && <Loading />}
      {res.error && <ErrorBox onRetry={res.reload}>{api.errorMessage(res.error)}</ErrorBox>}
      {res.data && !tracks.length && (
        <Empty icon={<Heart size={32} />} title="As músicas curtidas aparecem aqui">
          Toque no coração de qualquer música para guardar aqui.
        </Empty>
      )}
      <TrackList tracks={tracks} context={context} showAdded />
    </div>
  );
}

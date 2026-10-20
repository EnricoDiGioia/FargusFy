import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ExternalLink, ListPlus, MoreHorizontal } from 'lucide-react';
import { Artwork } from '../components/Art';
import { ActionBar, CollectionHeader } from '../components/Header';
import { TrackList } from '../components/TrackList';
import { ErrorBox, IconButton, Loading, MenuItem, Sheet, useAsync } from '../components/ui';
import { AddToPlaylist } from '../components/PlaylistSheets';
import * as catalog from '../lib/catalog';
import { addToQueue, playTracks } from '../lib/player';
import { fmtTotal, plural } from '../lib/format';
import { useToast } from '../state/toast';

export default function AlbumPage() {
  const { id } = useParams();
  const res = useAsync(() => catalog.getAlbum(id), [id]);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox onRetry={res.reload}>{res.error.message}</ErrorBox>;
  const a = res.data;
  const context = { type: 'album', id: a.id, name: a.name, href: `/album/${a.id}` };
  const kind = a.type === 'single' ? 'Single' : a.type === 'compilation' ? 'Coletânea' : 'Álbum';

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind={kind}
        title={a.name}
        art={<Artwork src={a.artwork} />}
        colorSeed={a.id}
        meta={
          <>
            {a.artists.map((ar, i) => (
              <span key={ar.id}>
                {i > 0 && ', '}
                <Link to={`/artista/${ar.id}`}>
                  <strong>{ar.name}</strong>
                </Link>
              </span>
            ))}
            {' · '}
            {[a.year, plural(a.tracks.length, 'música', 'músicas'), fmtTotal(a.duration_ms)].filter(Boolean).join(' · ')}
          </>
        }
      />
      <ActionBar context={context} disabled={!a.tracks.length} onPlay={() => playTracks(a.tracks, 0, context)}>
        <IconButton label="Adicionar à playlist" onClick={() => setAdding(true)}>
          <ListPlus size={26} />
        </IconButton>
        <IconButton label="Mais opções" onClick={() => setMenu(true)}>
          <MoreHorizontal size={26} />
        </IconButton>
      </ActionBar>
      <TrackList tracks={a.tracks} context={context} showArt={false} showAlbum={false} />
      {a.copyright && <p className="fineprint muted">{a.copyright}</p>}
      <Sheet open={menu} onClose={() => setMenu(false)} title={a.name}>
        <MenuItem icon={<ListPlus size={20} />} onClick={() => (setMenu(false), setAdding(true))}>
          Adicionar todas à playlist
        </MenuItem>
        <MenuItem icon={<ListPlus size={20} />} onClick={() => (addToQueue(a.tracks), toast('Adicionadas à fila'), setMenu(false))}>
          Adicionar à fila
        </MenuItem>
        <MenuItem icon={<ExternalLink size={20} />} href={catalog.openUrl('album', a.id)} external onClick={() => setMenu(false)}>
          Abrir no Spotify
        </MenuItem>
      </Sheet>
      {adding && <AddToPlaylist open tracks={a.tracks} onClose={() => setAdding(false)} />}
    </div>
  );
}

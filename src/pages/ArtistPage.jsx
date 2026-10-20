import { useState } from 'react';
import { useParams } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { Artwork } from '../components/Art';
import { AlbumCard } from '../components/Cards';
import { CollectionHeader } from '../components/Header';
import { Button, ErrorBox, Loading, useAsync } from '../components/ui';
import * as catalog from '../lib/catalog';
import { useToast } from '../state/toast';

// O modo de desenvolvimento do Spotify não tem mais "músicas populares" do
// artista; mostramos a discografia, que leva às músicas.
export default function ArtistPage() {
  const { id } = useParams();
  const res = useAsync(() => catalog.getArtist(id), [id]);
  const [extra, setExtra] = useState([]);
  const [more, setMore] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox onRetry={res.reload}>{res.error.message}</ErrorBox>;
  const a = res.data;
  const albums = [...a.albums, ...extra];
  const hasMore = more ?? a.moreAlbums;

  const loadMore = async () => {
    setBusy(true);
    try {
      const page = await catalog.getArtistAlbums(id, albums.length);
      setExtra((x) => [...x, ...page.albums]);
      setMore(page.more);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--collection">
      <CollectionHeader kind="Artista" title={a.name} art={<Artwork src={a.image} />} round colorSeed={a.id} meta={a.genres.slice(0, 3).join(' · ')} />
      <div className="action-bar">
        <a className="btn btn--ghost btn--small" href={catalog.openUrl('artist', a.id)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Abrir no Spotify
        </a>
      </div>
      <section className="shelf">
        <div className="shelf__head">
          <h2>Discografia</h2>
        </div>
        <div className="grid">
          {albums.map((al) => (
            <AlbumCard key={al.id} album={al} />
          ))}
        </div>
        {hasMore && (
          <Button variant="ghost" loading={busy} onClick={loadMore}>
            Mais lançamentos
          </Button>
        )}
      </section>
    </div>
  );
}

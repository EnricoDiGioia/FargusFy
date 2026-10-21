import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Play, Search as SearchIcon, X } from 'lucide-react';
import { playTracks } from '../lib/player';
import { AlbumCard, ArtistCard, CharacterCard, PlaylistCard, Shelf } from '../components/Cards';
import { TrackList } from '../components/TrackList';
import { Button, ErrorBox, Loading, useAsync, useDebounced } from '../components/ui';
import { Artwork } from '../components/Art';
import * as catalog from '../lib/catalog';
import * as api from '../lib/api';
import { local } from '../lib/storage';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

const FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'track', label: 'Músicas' },
  { id: 'album', label: 'Álbuns' },
  { id: 'artist', label: 'Artistas' },
  { id: 'fargus', label: 'Fargus' },
];
const RECENT_KEY = 'fy-recent-searches';

function recentSearches() {
  try {
    const v = JSON.parse(local.get(RECENT_KEY, '[]'));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
function rememberSearch(q) {
  const list = [q, ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  local.set(RECENT_KEY, JSON.stringify(list));
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const filter = params.get('f') ?? 'all';
  const addTo = params.get('add'); // modo "adicionar à playlist"
  const [text, setText] = useState(q);
  const debounced = useDebounced(text, 400);
  const inputRef = useRef(null);
  const { active } = useSession();
  const lib = useLibrary();
  const toast = useToast();
  const target = useMemo(() => (addTo ? lib.editable.find((p) => p.id === addTo) : null), [addTo, lib.editable]);

  // a URL guarda a busca (voltar para a tela mostra o mesmo resultado)
  useEffect(() => {
    const term = debounced.trim();
    if (term === q) return;
    const next = new URLSearchParams(params);
    if (term) next.set('q', term);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const term = q.trim();
  const [more, setMore] = useState({ track: [], album: [], artist: [] });
  const [moreBusy, setMoreBusy] = useState(null);
  useEffect(() => setMore({ track: [], album: [], artist: [] }), [term]);

  const res = useAsync(async () => {
    if (term.length < 2) return null;
    rememberSearch(term);
    const wantSpotify = filter !== 'fargus';
    const types = filter === 'all' || filter === 'fargus' ? ['track', 'album', 'artist'] : [filter];
    const [spotify, chars, lists] = await Promise.all([
      wantSpotify ? catalog.search(term, { types }) : null,
      filter === 'all' || filter === 'fargus' ? api.searchCharacters(term).catch(() => []) : [],
      filter === 'all' || filter === 'fargus' ? api.searchPlaylists(term).catch(() => []) : [],
    ]);
    return { spotify, chars, lists };
  }, [term, filter]);

  const browse = useAsync(() => (term.length < 2 ? api.allCharacters(30) : null), [term.length < 2]);

  const loadMore = async (type) => {
    const base = res.data?.spotify;
    if (!base) return;
    const key = `${type}s`;
    const offset = base[key].length + more[type].length;
    setMoreBusy(type);
    try {
      const page = await catalog.search(term, { types: [type], offset });
      setMore((m) => ({ ...m, [type]: [...m[type], ...page[key]] }));
      base.more[type] = page.more[type];
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setMoreBusy(null);
    }
  };

  const addTrack = async (t) => {
    if (!target) return;
    try {
      await api.addTracks(target.id, [t], active?.id ?? null);
      toast(`Adicionada a "${target.name}"`);
      lib.refresh();
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
    }
  };

  const setFilter = (f) => {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('f');
    else next.set('f', f);
    setParams(next, { replace: true });
  };

  const sp = res.data?.spotify;
  const tracks = sp ? [...sp.tracks, ...more.track] : [];
  const albums = sp ? [...sp.albums, ...more.album] : [];
  const artists = sp ? [...sp.artists, ...more.artist] : [];
  const nothing = res.data && !tracks.length && !albums.length && !artists.length && !res.data.chars.length && !res.data.lists.length;

  return (
    <div className="page page--search">
      {target && (
        <div className="add-banner">
          <Link to={`/playlist/${target.id}`} className="icon-btn" aria-label="Voltar para a playlist">
            <ArrowLeft size={20} />
          </Link>
          <span>
            Adicionando músicas a <strong>{target.name}</strong>
          </span>
        </div>
      )}
      <div className="search-box">
        <SearchIcon size={20} className="search-box__icon" />
        <input
          ref={inputRef}
          className="search-box__input"
          type="search"
          enterKeyHint="search"
          placeholder="O que os personagens querem ouvir?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Buscar"
        />
        {text && (
          <button type="button" className="search-box__clear" onClick={() => setText('')} aria-label="Limpar">
            <X size={18} />
          </button>
        )}
      </div>

      {term.length >= 2 && (
        <div className="chips" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`chip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {term.length < 2 && (
        <>
          {!!recentSearches().length && (
            <section className="shelf">
              <div className="shelf__head">
                <h2>Buscas recentes</h2>
              </div>
              <div className="chips chips--wrap">
                {recentSearches().map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => setText(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )}
          {browse.data && (
            <Shelf title="Personagens de Fargus">
              {browse.data.map((c) => (
                <CharacterCard key={c.id} character={c} />
              ))}
            </Shelf>
          )}
        </>
      )}

      {res.loading && term.length >= 2 && <Loading label="Buscando…" />}
      {res.error && <ErrorBox onRetry={res.reload}>{res.error.message || api.errorMessage(res.error)}</ErrorBox>}
      {nothing && <p className="muted pad">Nada encontrado para "{term}".</p>}

      {res.data && (
        <>
          {filter === 'all' && tracks[0] && (
            <div className="search-top">
              <section className="top-result">
                <h2>Melhor resultado</h2>
                <TopResult track={tracks[0]} />
              </section>
              <section className="top-tracks">
                <h2>Músicas</h2>
                <TrackList tracks={tracks.slice(0, 4)} header={false} showAlbum={false} onAdd={target ? addTrack : null} addLabel={target ? `Adicionar a ${target.name}` : undefined} />
              </section>
            </div>
          )}

          {filter === 'track' && !!tracks.length && (
            <section className="shelf">
              <TrackList tracks={tracks} onAdd={target ? addTrack : null} addLabel={target ? `Adicionar a ${target.name}` : undefined} />
              {sp.more.track && (
                <Button variant="ghost" loading={moreBusy === 'track'} onClick={() => loadMore('track')}>
                  Mais músicas
                </Button>
              )}
            </section>
          )}

          {(filter === 'all' || filter === 'fargus') && !!res.data.chars.length && (
            <Shelf title="Personagens">
              {res.data.chars.map((c) => (
                <CharacterCard key={c.id} character={c} />
              ))}
            </Shelf>
          )}
          {(filter === 'all' || filter === 'fargus') && !!res.data.lists.length && (
            <Shelf title="Playlists de Fargus">
              {res.data.lists.map((p) => (
                <PlaylistCard key={p.id} playlist={p} />
              ))}
            </Shelf>
          )}

          {(filter === 'all' || filter === 'artist') && !!artists.length && (
            <Shelf title="Artistas">
              {artists.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </Shelf>
          )}
          {filter === 'artist' && sp?.more.artist && (
            <Button variant="ghost" loading={moreBusy === 'artist'} onClick={() => loadMore('artist')}>
              Mais artistas
            </Button>
          )}

          {(filter === 'all' || filter === 'album') && !!albums.length && (
            <Shelf title="Álbuns">
              {albums.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </Shelf>
          )}
          {filter === 'album' && sp?.more.album && (
            <Button variant="ghost" loading={moreBusy === 'album'} onClick={() => loadMore('album')}>
              Mais álbuns
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function TopResult({ track }) {
  return (
    <div className="top-card">
      <Artwork src={track.artwork} size={96} />
      <strong className="top-card__title">{track.title}</strong>
      <span className="muted">Música · {track.artist}</span>
      <button type="button" className="card__fab top-card__fab" aria-label={`Tocar ${track.title}`} onClick={() => playTracks([track], 0, null)}>
        <Play size={22} fill="currentColor" />
      </button>
    </div>
  );
}

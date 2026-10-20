import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { LikedCover, Mosaic } from '../components/Art';
import { PlaylistEditor } from '../components/PlaylistSheets';
import { ErrorBox, IconButton, Loading } from '../components/ui';
import { plural } from '../lib/format';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';

const FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'mine', label: 'Criadas' },
  { id: 'followed', label: 'Seguidas' },
];

export default function Library() {
  const { active } = useSession();
  const lib = useLibrary();
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);

  const rows = [
    ...(filter !== 'followed' ? (lib.mine ?? []).map((p) => ({ p, own: true })) : []),
    ...(filter !== 'mine' ? (lib.followed ?? []).map((p) => ({ p, own: false })) : []),
  ];

  return (
    <div className="page page--library">
      <div className="page-head">
        <h1>Sua biblioteca</h1>
        <IconButton label="Nova playlist" onClick={() => setCreating(true)}>
          <Plus size={26} />
        </IconButton>
      </div>
      <p className="muted page-sub">Ouvindo como @{active?.handle}</p>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {lib.error && <ErrorBox onRetry={lib.refresh}>{lib.error}</ErrorBox>}
      {!lib.mine && !lib.error && <Loading />}
      <div className="lib-list">
        {filter !== 'followed' && (
          <Link to="/curtidas" className="lib-row">
            <LikedCover size={64} />
            <span className="lib-row__text">
              <strong>Músicas Curtidas</strong>
              <small>Playlist · {plural(lib.saved.size, 'música', 'músicas')}</small>
            </span>
          </Link>
        )}
        {rows.map(({ p, own }) => (
          <Link key={p.id} to={`/playlist/${p.id}`} className="lib-row">
            <Mosaic covers={p.covers} seed={p.id} size={64} />
            <span className="lib-row__text">
              <strong>{p.name}</strong>
              <small>
                Playlist · {own ? plural(p.track_count, 'música', 'músicas') : `@${p.character?.handle ?? ''}`}
                {!p.is_public && ' · privada'}
              </small>
            </span>
          </Link>
        ))}
      </div>
      {lib.mine && !rows.length && filter !== 'all' && <p className="muted pad">Nada por aqui ainda.</p>}
      {creating && <PlaylistEditor open onClose={() => setCreating(false)} />}
    </div>
  );
}

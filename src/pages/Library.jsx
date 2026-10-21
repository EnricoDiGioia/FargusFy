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
  { id: 'collab', label: 'Colaborativas' },
  { id: 'followed', label: 'Seguidas' },
];

export default function Library() {
  const { active } = useSession();
  const lib = useLibrary();
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);

  const show = (k) => filter === 'all' || filter === k;
  const rows = [
    ...(show('mine') ? (lib.mine ?? []).map((p) => ({ p, kind: 'mine' })) : []),
    ...(show('collab') ? (lib.collabs ?? []).map((p) => ({ p, kind: 'collab' })) : []),
    ...(show('followed') ? (lib.followed ?? []).map((p) => ({ p, kind: 'followed' })) : []),
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
        {show('mine') && (
          <Link to="/curtidas" className="lib-row">
            <LikedCover size={64} />
            <span className="lib-row__text">
              <strong>Músicas Curtidas</strong>
              <small>Playlist · {plural(lib.saved.size, 'música', 'músicas')}</small>
            </span>
          </Link>
        )}
        {rows.map(({ p, kind }) => (
          <Link key={p.id} to={`/playlist/${p.id}`} className="lib-row">
            <Mosaic covers={p.covers} seed={p.id} size={64} />
            <span className="lib-row__text">
              <strong>{p.name}</strong>
              <small>
                {kind === 'collab' ? 'Colaborativa' : 'Playlist'} · {kind === 'mine' ? plural(p.track_count, 'música', 'músicas') : `@${p.character?.handle ?? ''}`}
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

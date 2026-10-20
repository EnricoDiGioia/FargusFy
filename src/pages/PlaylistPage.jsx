import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CircleCheck, CirclePlus, Copy, Globe, ListEnd, Lock, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Mosaic } from '../components/Art';
import { ActionBar, CollectionHeader } from '../components/Header';
import { TrackList, ownerMenuItems } from '../components/TrackList';
import { Button, Empty, ErrorBox, IconButton, Loading, MenuItem, Sheet } from '../components/ui';
import { AddToPlaylist, PlaylistEditor } from '../components/PlaylistSheets';
import * as api from '../lib/api';
import { addToQueue, playTracks } from '../lib/player';
import { fmtTotal, plural } from '../lib/format';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

export default function PlaylistPage() {
  const { id } = useParams();
  const { active, isMine, isAdmin } = useSession();
  const lib = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [p, setP] = useState(undefined);
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(null);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copyAll, setCopyAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pl, tr] = await Promise.all([api.playlist(id), api.playlistTracks(id)]);
      setP(pl);
      setTracks(tr);
      if (pl) api.followersCount(pl.id).then(setFollowers).catch(() => {});
    } catch (e) {
      setError(api.errorMessage(e));
      setP(null);
    }
  }, [id]);

  useEffect(() => {
    setP(undefined);
    setTracks(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!active || !p || isMine(p.character_id)) return;
    api.isFollowing(active.id, p.id).then(setFollowing).catch(() => {});
  }, [active, p]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined && !error) return <Loading />;
  if (error) return <ErrorBox onRetry={load}>{error}</ErrorBox>;
  if (!p) return <Empty title="Playlist não encontrada">Ela pode ter sido apagada ou ser privada.</Empty>;

  const mine = isMine(p.character_id);
  const context = { type: 'playlist', id: p.id, name: p.name, href: `/playlist/${p.id}` };
  const totalMs = tracks?.reduce((s, t) => s + t.duration_ms, 0) ?? p.duration_ms;

  const toggleFollow = async () => {
    const on = !following;
    setFollowing(on);
    setFollowers((n) => n + (on ? 1 : -1));
    try {
      await api.setFollow(active.id, p.id, on);
      toast(on ? `@${active.handle} agora segue "${p.name}"` : 'Deixou de seguir');
      lib.refresh();
    } catch (e) {
      setFollowing(!on);
      setFollowers((n) => n + (on ? -1 : 1));
      toast(api.errorMessage(e), { kind: 'error' });
    }
  };

  const move = async (i, dir) => {
    const list = [...tracks];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const before = dir < 0 ? list[j - 1] : list[j];
    const after = dir < 0 ? list[j] : list[j + 1];
    const position = before && after ? (before.position + after.position) / 2 : before ? before.position + 1 : after.position - 1;
    const [t] = list.splice(i, 1);
    list.splice(j, 0, { ...t, position });
    setTracks(list);
    try {
      await api.moveTrackRow(t.rowId, position);
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
      load();
    }
  };

  const remove = async (t) => {
    setTracks((list) => list.filter((x) => x.rowId !== t.rowId));
    try {
      await api.removeTrackRow(t.rowId);
      toast(`"${t.title}" removida`);
      lib.refresh();
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
      load();
    }
  };

  const del = async () => {
    if (!window.confirm(`Apagar a playlist "${p.name}"? Isso não pode ser desfeito.`)) return;
    try {
      await api.deletePlaylist(p.id);
      toast('Playlist apagada');
      lib.refresh();
      navigate('/biblioteca');
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
    }
  };

  const meta = [plural(tracks?.length ?? p.track_count, 'música', 'músicas'), fmtTotal(totalMs), followers ? plural(followers, 'seguidor', 'seguidores') : null, p.is_public ? null : 'privada']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind={p.is_public ? 'Playlist' : 'Playlist privada'}
        title={p.name}
        description={p.description}
        art={<Mosaic covers={p.covers} seed={p.id} />}
        colorSeed={p.id}
        owner={p.character}
        meta={meta}
      />
      <ActionBar context={context} disabled={!tracks?.length} onPlay={() => playTracks(tracks, 0, context)}>
        {!mine && active && (
          <IconButton label={following ? 'Deixar de seguir' : 'Seguir'} className={`action-bar__follow ${following ? 'is-on' : ''}`} onClick={toggleFollow}>
            {following ? <CircleCheck size={30} /> : <CirclePlus size={30} />}
          </IconButton>
        )}
        {mine && (
          <Link to={`/buscar?add=${p.id}`} className="btn btn--ghost btn--small">
            <Plus size={18} /> Adicionar músicas
          </Link>
        )}
        <IconButton label="Mais opções" onClick={() => setMenu(true)}>
          <MoreHorizontal size={26} />
        </IconButton>
      </ActionBar>

      {tracks?.length ? (
        <TrackList
          tracks={tracks}
          context={context}
          showAdded
          menuExtra={
            mine
              ? ownerMenuItems({
                  onMoveUp: (i) => move(i, -1),
                  onMoveDown: (i) => i < tracks.length - 1 && move(i, 1),
                  onRemove: remove,
                })
              : null
          }
        />
      ) : (
        tracks && (
          <Empty
            icon={<Search size={32} />}
            title={mine ? 'Vamos encontrar músicas para esta playlist' : 'Esta playlist ainda está vazia'}
            action={
              mine && (
                <Link to={`/buscar?add=${p.id}`} className="btn btn--primary">
                  Buscar músicas
                </Link>
              )
            }
          />
        )
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={p.name}>
        {!!tracks?.length && (
          <MenuItem icon={<ListEnd size={20} />} onClick={() => (addToQueue(tracks), toast('Adicionadas à fila'), setMenu(false))}>
            Adicionar à fila
          </MenuItem>
        )}
        {!!tracks?.length && (
          <MenuItem icon={<Copy size={20} />} onClick={() => (setMenu(false), setCopyAll(true))}>
            Copiar músicas para outra playlist
          </MenuItem>
        )}
        {mine && (
          <MenuItem icon={<Pencil size={20} />} onClick={() => (setMenu(false), setEditing(true))}>
            Editar nome e descrição
          </MenuItem>
        )}
        {mine && (
          <MenuItem
            icon={p.is_public ? <Lock size={20} /> : <Globe size={20} />}
            onClick={async () => {
              setMenu(false);
              try {
                const upd = await api.updatePlaylist(p.id, { isPublic: !p.is_public });
                setP(upd);
                lib.patchPlaylist(upd);
                toast(upd.is_public ? 'Agora todos podem ver' : 'Agora só você vê');
              } catch (e) {
                toast(api.errorMessage(e), { kind: 'error' });
              }
            }}
          >
            {p.is_public ? 'Tornar privada' : 'Tornar pública'}
          </MenuItem>
        )}
        {(mine || isAdmin) && (
          <MenuItem icon={<Trash2 size={20} />} danger onClick={() => (setMenu(false), del())}>
            Apagar playlist
          </MenuItem>
        )}
      </Sheet>
      {editing && (
        <PlaylistEditor
          open
          playlist={p}
          onClose={() => setEditing(false)}
          onSaved={(upd) => setP((cur) => ({ ...cur, ...upd }))}
        />
      )}
      {copyAll && <AddToPlaylist open tracks={tracks} onClose={() => setCopyAll(false)} />}
      {mine && tracks?.length > 0 && (
        <div className="pad">
          <Button variant="ghost" onClick={() => navigate(`/buscar?add=${p.id}`)}>
            <Plus size={18} /> Adicionar mais músicas
          </Button>
        </div>
      )}
    </div>
  );
}

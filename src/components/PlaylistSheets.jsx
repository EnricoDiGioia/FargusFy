import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Globe, Lock, Plus } from 'lucide-react';
import { Button, Sheet } from './ui';
import { Mosaic } from './Art';
import * as api from '../lib/api';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';
import { plural } from '../lib/format';

// Criar ou editar uma playlist
export function PlaylistEditor({ open, onClose, playlist = null, onSaved, initialTracks = null }) {
  const { active } = useSession();
  const lib = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [isPublic, setPublic] = useState(playlist?.is_public ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !active) return;
    setBusy(true);
    setError('');
    try {
      let p;
      if (playlist) {
        p = await api.updatePlaylist(playlist.id, { name, description, isPublic });
        lib.patchPlaylist(p);
        toast('Playlist atualizada');
      } else {
        p = await api.createPlaylist({ characterId: active.id, name, description, isPublic });
        if (initialTracks?.length) await api.addTracks(p.id, initialTracks, active.id);
        toast(initialTracks?.length ? `Playlist criada com ${plural(initialTracks.length, 'música', 'músicas')}` : 'Playlist criada');
        lib.refresh();
      }
      onSaved?.(p);
      onClose();
      if (!playlist && !initialTracks?.length) navigate(`/playlist/${p.id}`);
    } catch (err) {
      setError(api.errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={playlist ? 'Editar playlist' : 'Nova playlist'}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={`Playlist de @${active?.handle ?? ''}`} autoFocus required />
        </label>
        <label className="field">
          <span>Descrição</span>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} placeholder="Opcional" />
        </label>
        <div className="seg" role="radiogroup" aria-label="Quem vê">
          <button type="button" role="radio" aria-checked={isPublic} className={isPublic ? 'is-on' : ''} onClick={() => setPublic(true)}>
            <Globe size={16} /> Pública
          </button>
          <button type="button" role="radio" aria-checked={!isPublic} className={!isPublic ? 'is-on' : ''} onClick={() => setPublic(false)}>
            <Lock size={16} /> Só minha
          </button>
        </div>
        <p className="hint muted">{isPublic ? 'Todos os personagens da campanha podem ver e seguir.' : 'Só você (e o mestre) veem esta playlist.'}</p>
        {error && <p className="form-error">{error}</p>}
        <Button type="submit" loading={busy} disabled={!name.trim()} className="btn--block">
          {playlist ? 'Salvar' : 'Criar playlist'}
        </Button>
      </form>
    </Sheet>
  );
}

// Escolher em qual playlist colocar uma ou mais músicas
export function AddToPlaylist({ open, onClose, tracks }) {
  const { active } = useSession();
  const lib = useLibrary();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const list = lib.editable;

  const add = async (p) => {
    setBusyId(p.id);
    try {
      const n = await api.addTracks(p.id, tracks, active?.id ?? null);
      toast(n === 1 ? `Adicionada a "${p.name}"` : `${plural(n, 'música adicionada', 'músicas adicionadas')} a "${p.name}"`);
      lib.refresh();
      onClose();
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  if (creating) return <PlaylistEditor open onClose={() => (setCreating(false), onClose())} initialTracks={tracks} />;

  return (
    <Sheet open={open} onClose={onClose} title={tracks?.length > 1 ? `Adicionar ${tracks.length} músicas` : 'Adicionar à playlist'}>
      <button type="button" className="pick-row" onClick={() => setCreating(true)}>
        <span className="art art--new">
          <Plus size={22} />
        </span>
        <span className="pick-row__text">
          <strong>Nova playlist</strong>
        </span>
      </button>
      {list.map((p) => (
        <button type="button" key={p.id} className="pick-row" onClick={() => add(p)} disabled={!!busyId}>
          <Mosaic covers={p.covers} seed={p.id} size={48} />
          <span className="pick-row__text">
            <strong>{p.name}</strong>
            <small className="muted">
              {plural(p.track_count, 'música', 'músicas')}
              {p.character_id !== active?.id && p.character ? ` · colaborativa de @${p.character.handle}` : ''}
            </small>
          </span>
          {busyId === p.id && <span className="muted">…</span>}
        </button>
      ))}
      {lib.mine && !list.length && <p className="muted pad">@{active?.handle} ainda não tem playlists.</p>}
    </Sheet>
  );
}

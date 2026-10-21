import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, Check, Search, UserPlus, X } from 'lucide-react';
import { Avatar } from './Art';
import { IconButton, Sheet, useAsync, useDebounced } from './ui';
import * as api from '../lib/api';
import { useToast } from '../state/toast';

// Janela de colaboradores de uma playlist.
// O dono convida e tira; os outros só veem quem participa.
export function CollaboratorsSheet({ open, onClose, playlist, collaborators, canManage, onChange }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const term = useDebounced(q, 300);
  const [busy, setBusy] = useState(null);
  const candidates = useAsync(() => (open && canManage ? (term.trim().length >= 2 ? api.searchCharacters(term) : api.allCharacters(40)) : []), [open, canManage, term]);
  const inside = useMemo(() => new Set(collaborators.map((c) => c.id)), [collaborators]);
  const list = (candidates.data ?? []).filter((c) => c.id !== playlist.character_id);

  const toggle = async (c) => {
    setBusy(c.id);
    try {
      if (inside.has(c.id)) {
        await api.removeCollaborator(playlist.id, c.id);
        onChange(collaborators.filter((x) => x.id !== c.id));
        toast(`@${c.handle} saiu da playlist`);
      } else {
        await api.addCollaborator(playlist.id, c.id);
        onChange([...collaborators, c]);
        toast(`@${c.handle} agora pode editar "${playlist.name}"`);
      }
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Colaboradores">
      <p className="muted pad sheet__intro">
        {canManage
          ? 'Quem você convidar pode adicionar, remover e reordenar músicas. Só você muda o nome, a descrição e quem participa.'
          : 'Estes personagens podem adicionar, remover e reordenar as músicas desta playlist.'}
      </p>
      {playlist.character && (
        <div className="pick-row pick-row--static">
          <Avatar character={playlist.character} size={40} />
          <span className="pick-row__text">
            <strong>@{playlist.character.handle}</strong>
            <small className="muted">Dono</small>
          </span>
        </div>
      )}
      {collaborators.map((c) => (
        <div key={c.id} className="pick-row pick-row--static">
          <Avatar character={c} size={40} />
          <span className="pick-row__text">
            <Link to={`/u/${c.handle}`} onClick={onClose}>
              <strong>
                @{c.handle}
                {c.is_verified && <BadgeCheck size={13} className="verified" />}
              </strong>
            </Link>
            <small className="muted">Colaborador</small>
          </span>
          {canManage && (
            <IconButton label={`Tirar @${c.handle}`} onClick={() => toggle(c)} disabled={busy === c.id}>
              <X size={18} />
            </IconButton>
          )}
        </div>
      ))}

      {canManage && (
        <>
          <h3 className="sheet__subtitle">
            <UserPlus size={18} /> Convidar
          </h3>
          <div className="search-box search-box--small">
            <Search size={18} className="search-box__icon" />
            <input className="search-box__input" placeholder="Buscar personagem" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar personagem" />
          </div>
          {list.map((c) => (
            <button key={c.id} type="button" className="pick-row" onClick={() => toggle(c)} disabled={busy === c.id}>
              <Avatar character={c} size={40} />
              <span className="pick-row__text">
                <strong>{c.name || `@${c.handle}`}</strong>
                <small className="muted">@{c.handle}</small>
              </span>
              {inside.has(c.id) ? <Check size={20} className="accent" /> : <UserPlus size={18} className="muted" />}
            </button>
          ))}
          {candidates.data && !list.length && <p className="muted pad">Nenhum personagem encontrado.</p>}
        </>
      )}
    </Sheet>
  );
}

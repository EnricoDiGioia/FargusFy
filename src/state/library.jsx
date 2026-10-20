import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import { useSession } from './session';
import { useToast } from './toast';

// Biblioteca do personagem ativo: playlists dele, as que ele segue e as
// músicas curtidas. Fica num lugar só para o coração e o "adicionar à
// playlist" estarem certos em todas as telas.
const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { active } = useSession();
  const toast = useToast();
  const [mine, setMine] = useState(null);
  const [followed, setFollowed] = useState(null);
  const [saved, setSavedIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const charId = active?.id ?? null;

  const refresh = useCallback(async () => {
    if (!charId) return;
    try {
      const [a, b, c] = await Promise.all([api.playlistsOf(charId), api.followedPlaylists(charId), api.savedIds(charId)]);
      setMine(a);
      setFollowed(b);
      setSavedIds(c);
      setError(null);
    } catch (e) {
      setError(api.errorMessage(e));
      setMine([]);
      setFollowed([]);
    }
  }, [charId]);

  useEffect(() => {
    setMine(null);
    setFollowed(null);
    setSavedIds(new Set());
    refresh();
  }, [refresh]);

  const toggleSaved = useCallback(
    async (track) => {
      if (!charId || !track?.id) return;
      const on = !saved.has(track.id);
      setSavedIds((s) => {
        const n = new Set(s);
        if (on) n.add(track.id);
        else n.delete(track.id);
        return n;
      });
      try {
        await api.setSaved(charId, track, on);
        toast(on ? 'Adicionada às Músicas Curtidas' : 'Removida das Músicas Curtidas');
      } catch (e) {
        setSavedIds((s) => {
          const n = new Set(s);
          if (on) n.delete(track.id);
          else n.add(track.id);
          return n;
        });
        toast(api.errorMessage(e), { kind: 'error' });
      }
    },
    [charId, saved, toast]
  );

  const patchPlaylist = useCallback((p) => {
    setMine((list) => (list ? list.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : list));
  }, []);

  const value = useMemo(
    () => ({ mine, followed, saved, error, refresh, toggleSaved, patchPlaylist, isSaved: (id) => saved.has(id) }),
    [mine, followed, saved, error, refresh, toggleSaved, patchPlaylist]
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export const useLibrary = () => useContext(LibraryContext);

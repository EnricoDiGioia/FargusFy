import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import * as api from '../lib/api';
import { local } from '../lib/storage';
import { applySavedTheme, saveAppearance, normalizeAppearance, getAppearance } from '../lib/theme';

const SessionContext = createContext(null);

// Sessão compartilhada com o FargusGram: mesma conta e mesmo personagem
// ativo ("fg-active"), porque os dois sites ficam no mesmo endereço.
export function SessionProvider({ children }) {
  const [session, setSession] = useState(isConfigured ? undefined : null); // undefined = carregando
  const [me, setMe] = useState(undefined);
  const [meError, setMeError] = useState(null);
  const [activeId, setActiveId] = useState(() => local.get('fg-active'));

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    // se o personagem for trocado no FargusGram (outra aba), troca aqui também
    const onStorage = (e) => {
      if (e.key === 'fg-active') setActiveId(e.newValue);
      if (e.key === 'fg-appearance') applySavedTheme();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      alive = false;
      data.subscription.unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const uid = session?.user?.id ?? null;

  const refreshMe = useCallback(async () => {
    if (!uid) return null;
    try {
      const data = await api.me();
      setMe(data ?? null);
      setMeError(null);
      return data;
    } catch (e) {
      setMeError(api.errorMessage(e));
      return null;
    }
  }, [uid]);

  useEffect(() => {
    if (session === undefined) return;
    if (!uid) {
      setMe(null);
      return;
    }
    setMe(undefined);
    refreshMe();
  }, [uid, session === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  // tema escolhido no FargusGram (guardado na conta) vale aqui também
  const savedAppearance = me?.appearance;
  useEffect(() => {
    if (!savedAppearance?.active) return;
    if (JSON.stringify(getAppearance()) !== JSON.stringify(normalizeAppearance(savedAppearance))) saveAppearance(savedAppearance);
  }, [savedAppearance]);

  const characters = useMemo(() => me?.characters ?? [], [me]);
  const active = characters.find((c) => c.id === activeId) || characters[0] || null;

  const setActive = useCallback((id) => {
    local.set('fg-active', id);
    setActiveId(id);
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.signOut();
    setMe(null);
  }, []);

  const value = {
    session,
    uid,
    me,
    meError,
    characters,
    active,
    isAdmin: !!me?.is_admin,
    setActive,
    refreshMe,
    signOut,
    isMine: (characterId) => characters.some((c) => c.id === characterId),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

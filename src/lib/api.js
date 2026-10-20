// Conversa com o banco (Supabase). Tudo passa pelas regras do fargusfy.sql.
import { supabase } from './supabase';

const CHAR = 'id, handle, name, avatar_path, is_verified';
const PLAYLIST = `id, character_id, name, description, is_public, track_count, duration_ms, covers, created_at, updated_at, character:characters(${CHAR})`;
const TRACK_COLS = 'track_id, title, artist, album, album_id, artwork, duration_ms, explicit';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// Mensagem de erro em português para mostrar na tela
export function errorMessage(e) {
  const m = String(e?.message || e || '');
  if (/fy_|relation .* does not exist|PGRST20[02]|schema cache/i.test(m) && /does not exist|schema cache|Could not find/i.test(m))
    return 'O banco ainda não tem o FargusFy. Rode o arquivo supabase/fargusfy.sql no SQL Editor do Supabase.';
  if (/Limite de/i.test(m)) return m.replace(/^.*?(Limite de[^\n]*).*$/s, '$1');
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para isso.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão. Confira a internet e tente de novo.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  return m || 'Algo deu errado.';
}

// --------------------------------------------------------------------
// Conta
// --------------------------------------------------------------------
export const auth = {
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
  },
  async signOut() {
    await supabase.auth.signOut();
  },
};

export async function me() {
  return unwrap(await supabase.rpc('me'));
}

// --------------------------------------------------------------------
// Personagens
// --------------------------------------------------------------------
export async function characterByHandle(handle) {
  return unwrap(await supabase.from('characters').select(CHAR).eq('handle', handle.toLowerCase()).maybeSingle());
}

export async function allCharacters(limit = 40) {
  return unwrap(await supabase.from('characters').select(CHAR).order('created_at').limit(limit));
}

export async function searchCharacters(q) {
  const term = q.trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];
  return unwrap(await supabase.from('characters').select(CHAR).or(`handle.ilike.%${term}%,name.ilike.%${term}%`).order('handle').limit(12));
}

// --------------------------------------------------------------------
// Playlists
// --------------------------------------------------------------------
export async function playlistsOf(characterId) {
  return unwrap(await supabase.from('fy_playlists').select(PLAYLIST).eq('character_id', characterId).order('updated_at', { ascending: false }));
}

export async function recentPlaylists(limit = 18) {
  return unwrap(await supabase.from('fy_playlists').select(PLAYLIST).eq('is_public', true).gt('track_count', 0).order('updated_at', { ascending: false }).limit(limit));
}

export async function searchPlaylists(q) {
  const term = q.trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];
  return unwrap(await supabase.from('fy_playlists').select(PLAYLIST).eq('is_public', true).ilike('name', `%${term}%`).order('updated_at', { ascending: false }).limit(10));
}

export async function playlist(id) {
  return unwrap(await supabase.from('fy_playlists').select(PLAYLIST).eq('id', id).maybeSingle());
}

export async function playlistTracks(id) {
  const rows = unwrap(
    await supabase.from('fy_playlist_tracks').select(`id, position, added_at, ${TRACK_COLS}, added_by`).eq('playlist_id', id).order('position').limit(500)
  );
  return rows.map(rowToTrack);
}

export async function createPlaylist({ characterId, name, description = '', isPublic = true }) {
  return unwrap(
    await supabase
      .from('fy_playlists')
      .insert({ character_id: characterId, name: name.trim().slice(0, 80), description: description.trim().slice(0, 300), is_public: isPublic })
      .select(PLAYLIST)
      .single()
  );
}

export async function updatePlaylist(id, { name, description, isPublic }) {
  const patch = {};
  if (name !== undefined) patch.name = name.trim().slice(0, 80);
  if (description !== undefined) patch.description = description.trim().slice(0, 300);
  if (isPublic !== undefined) patch.is_public = isPublic;
  return unwrap(await supabase.from('fy_playlists').update(patch).eq('id', id).select(PLAYLIST).single());
}

export async function deletePlaylist(id) {
  unwrap(await supabase.from('fy_playlists').delete().eq('id', id));
}

// Adiciona no fim, de 100 em 100
export async function addTracks(playlistId, tracks, addedBy = null) {
  let n = 0;
  for (let i = 0; i < tracks.length; i += 100) {
    const chunk = tracks.slice(i, i + 100).map(trackToRow);
    n += unwrap(await supabase.rpc('fy_add_tracks', { p_playlist: playlistId, p_tracks: chunk, p_added_by: addedBy }));
  }
  return n;
}

export async function removeTrackRow(rowId) {
  unwrap(await supabase.from('fy_playlist_tracks').delete().eq('id', rowId));
}

// Nova posição entre duas vizinhas (posições fracionárias: só uma linha muda)
export async function moveTrackRow(rowId, position) {
  unwrap(await supabase.from('fy_playlist_tracks').update({ position }).eq('id', rowId));
}

// --------------------------------------------------------------------
// Seguir playlists
// --------------------------------------------------------------------
export async function followedPlaylists(characterId) {
  const rows = unwrap(
    await supabase.from('fy_playlist_follows').select(`created_at, playlist:fy_playlists(${PLAYLIST})`).eq('character_id', characterId).order('created_at', { ascending: false })
  );
  return rows.map((r) => r.playlist).filter(Boolean);
}

export async function isFollowing(characterId, playlistId) {
  const rows = unwrap(await supabase.from('fy_playlist_follows').select('playlist_id').eq('character_id', characterId).eq('playlist_id', playlistId));
  return rows.length > 0;
}

export async function followersCount(playlistId) {
  const { count, error } = await supabase.from('fy_playlist_follows').select('*', { count: 'exact', head: true }).eq('playlist_id', playlistId);
  if (error) throw error;
  return count ?? 0;
}

export async function setFollow(characterId, playlistId, on) {
  if (on) unwrap(await supabase.from('fy_playlist_follows').upsert({ character_id: characterId, playlist_id: playlistId }, { ignoreDuplicates: true }));
  else unwrap(await supabase.from('fy_playlist_follows').delete().eq('character_id', characterId).eq('playlist_id', playlistId));
}

// --------------------------------------------------------------------
// Músicas curtidas
// --------------------------------------------------------------------
export async function savedTracks(characterId) {
  const rows = unwrap(
    await supabase.from('fy_saved_tracks').select(`saved_at, ${TRACK_COLS}`).eq('character_id', characterId).order('saved_at', { ascending: false }).limit(2000)
  );
  return rows.map((r) => ({ ...rowToTrack(r), added_at: r.saved_at }));
}

export async function savedIds(characterId) {
  const rows = unwrap(await supabase.from('fy_saved_tracks').select('track_id').eq('character_id', characterId).limit(2000));
  return new Set(rows.map((r) => r.track_id));
}

export async function setSaved(characterId, track, on) {
  if (on) {
    const row = trackToRow(track);
    unwrap(
      await supabase.from('fy_saved_tracks').upsert(
        {
          character_id: characterId,
          track_id: row.id,
          title: row.title,
          artist: row.artist,
          album: row.album,
          album_id: row.album_id,
          artwork: row.artwork,
          duration_ms: row.duration_ms,
          explicit: row.explicit,
        },
        { ignoreDuplicates: true }
      )
    );
  } else {
    unwrap(await supabase.from('fy_saved_tracks').delete().eq('character_id', characterId).eq('track_id', track.id));
  }
}

export async function savedCount(characterId) {
  const { count, error } = await supabase.from('fy_saved_tracks').select('*', { count: 'exact', head: true }).eq('character_id', characterId);
  if (error) throw error;
  return count ?? 0;
}

// --------------------------------------------------------------------
// Ouvindo agora
// --------------------------------------------------------------------
export async function setNowPlaying(characterId, track) {
  const row = trackToRow(track);
  unwrap(
    await supabase.from('fy_now_playing').upsert({
      character_id: characterId,
      track_id: row.id,
      title: row.title,
      artist: row.artist,
      album_id: row.album_id,
      artwork: row.artwork,
      updated_at: new Date().toISOString(),
    })
  );
}

export async function clearNowPlaying(characterId) {
  unwrap(await supabase.from('fy_now_playing').delete().eq('character_id', characterId));
}

export async function nowPlayingList(limit = 20) {
  const rows = unwrap(
    await supabase.from('fy_now_playing').select(`updated_at, track_id, title, artist, album_id, artwork, character:characters(${CHAR})`).order('updated_at', { ascending: false }).limit(limit)
  );
  return rows.filter((r) => r.character).map((r) => ({ character: r.character, at: r.updated_at, track: rowToTrack(r) }));
}

export async function nowPlayingOf(characterId) {
  const r = unwrap(await supabase.from('fy_now_playing').select(`updated_at, track_id, title, artist, album_id, artwork`).eq('character_id', characterId).maybeSingle());
  return r ? { at: r.updated_at, track: rowToTrack(r) } : null;
}

export async function usage() {
  return unwrap(await supabase.rpc('fy_usage'));
}

// --------------------------------------------------------------------
// Conversões entre a música do app e as linhas do banco
// --------------------------------------------------------------------
const IMG = /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/;
const SID = /^[A-Za-z0-9]{22}$/;

export function trackToRow(t) {
  return {
    id: t.id,
    title: String(t.title || 'Música').slice(0, 200),
    artist: String(t.artist || '').slice(0, 300),
    album: String(t.album || '').slice(0, 200),
    album_id: SID.test(t.album_id || '') ? t.album_id : null,
    artwork: IMG.test(t.artwork || '') ? t.artwork : null,
    duration_ms: Math.max(0, Math.min(14400000, Math.round(t.duration_ms || 0))),
    explicit: !!t.explicit,
  };
}

function rowToTrack(r) {
  return {
    rowId: r.id,
    position: r.position,
    added_at: r.added_at,
    id: r.track_id,
    title: r.title,
    artist: r.artist || '',
    artists: null, // o banco guarda só os nomes; o link do artista vem do álbum
    album: r.album || '',
    album_id: r.album_id,
    artwork: r.artwork,
    duration_ms: r.duration_ms || 0,
    explicit: !!r.explicit,
  };
}

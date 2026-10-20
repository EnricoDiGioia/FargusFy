// Catálogo do Spotify (busca, álbuns, artistas), pedido pela função "spotify"
// do Supabase, que guarda a chave secreta. Tudo é guardado por 30 minutos
// neste aparelho para não repetir chamadas (o plano grátis agradece).
import { supabase } from './supabase';

const MEMORY = new Map();
const TTL = 30 * 60 * 1000;
const SS_PREFIX = 'fy-cat:';

function readCache(key) {
  const m = MEMORY.get(key);
  if (m && Date.now() - m.at < TTL) return m.data;
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (raw) {
      const v = JSON.parse(raw);
      if (Date.now() - v.at < TTL) {
        MEMORY.set(key, v);
        return v.data;
      }
    }
  } catch {
    /* sem sessionStorage */
  }
  return undefined;
}

function writeCache(key, data) {
  const v = { at: Date.now(), data };
  MEMORY.set(key, v);
  try {
    sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(v));
  } catch {
    // cheio: limpa o que é nosso e segue só com a memória
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(SS_PREFIX))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignora */
    }
  }
}

export class CatalogError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const inflight = new Map();

async function call(path, params = {}) {
  const key = `${path}?${new URLSearchParams(params)}`;
  const hit = readCache(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const { data, error } = await supabase.functions.invoke('spotify', { body: { path, params } });
    if (error) {
      let msg = 'Não deu para buscar no Spotify agora.';
      let status = 0;
      try {
        status = error.context?.status ?? 0;
        const body = await error.context?.json?.();
        if (body?.error) msg = body.error;
      } catch {
        /* resposta sem corpo */
      }
      if (status === 404 && /function/i.test(String(error.message))) msg = 'A função "spotify" ainda não foi criada no Supabase (veja o README).';
      if (error.name === 'FunctionsFetchError') msg = 'Sem conexão com a função "spotify" do Supabase.';
      throw new CatalogError(msg, status);
    }
    writeCache(key, data);
    return data;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// --------------------------------------------------------------------
// Formato único de música no app (igual ao que vai para o banco)
// --------------------------------------------------------------------
const SPOTIFY_IMG = /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/;

export function pickImage(images, target = 300) {
  if (!Array.isArray(images) || !images.length) return null;
  const sorted = [...images].filter((i) => SPOTIFY_IMG.test(i?.url)).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const best = sorted.find((i) => (i.width ?? 0) >= target) || sorted[sorted.length - 1];
  return best?.url ?? null;
}

export function toTrack(t, album = null) {
  if (!t?.id || t.type === 'episode') return null;
  const alb = t.album || album;
  return {
    id: t.id,
    title: t.name || 'Música',
    artist: (t.artists || []).map((a) => a.name).join(', '),
    artists: (t.artists || []).map((a) => ({ id: a.id, name: a.name })),
    album: alb?.name || '',
    album_id: alb?.id || null,
    artwork: pickImage(alb?.images),
    duration_ms: t.duration_ms || 0,
    explicit: !!t.explicit,
  };
}

function toAlbum(a) {
  if (!a?.id) return null;
  return {
    id: a.id,
    name: a.name,
    artist: (a.artists || []).map((x) => x.name).join(', '),
    artists: (a.artists || []).map((x) => ({ id: x.id, name: x.name })),
    artwork: pickImage(a.images),
    year: (a.release_date || '').slice(0, 4),
    type: a.album_type,
    total: a.total_tracks,
  };
}

function toArtist(a) {
  if (!a?.id) return null;
  return { id: a.id, name: a.name, image: pickImage(a.images, 160), genres: a.genres || [] };
}

// --------------------------------------------------------------------
// Pedidos
// --------------------------------------------------------------------

// Modo de desenvolvimento do Spotify: no máximo 10 resultados por página
export const PAGE = 10;

export async function search(q, { types = ['track', 'album', 'artist'], offset = 0 } = {}) {
  const term = q.trim().replace(/\s+/g, ' ');
  if (term.length < 2) return { tracks: [], albums: [], artists: [], more: {} };
  const data = await call('search', { q: term, type: types.join(','), limit: PAGE, offset, market: 'BR' });
  return {
    tracks: (data.tracks?.items || []).map((t) => toTrack(t)).filter(Boolean),
    albums: (data.albums?.items || []).map(toAlbum).filter(Boolean),
    artists: (data.artists?.items || []).map(toArtist).filter(Boolean),
    more: {
      track: !!data.tracks?.next,
      album: !!data.albums?.next,
      artist: !!data.artists?.next,
    },
  };
}

export async function getAlbum(id) {
  const a = await call(`albums/${id}`, { market: 'BR' });
  const album = toAlbum(a);
  let items = a.tracks?.items || [];
  let next = a.tracks?.next;
  // álbuns longos vêm em páginas de 50
  for (let offset = items.length; next && offset < 300; offset += 50) {
    const page = await call(`albums/${id}/tracks`, { limit: 50, offset, market: 'BR' });
    items = items.concat(page.items || []);
    next = page.next;
  }
  const tracks = items.map((t) => toTrack(t, a)).filter(Boolean);
  return {
    ...album,
    label: a.label || '',
    copyright: a.copyrights?.[0]?.text || '',
    duration_ms: tracks.reduce((s, t) => s + t.duration_ms, 0),
    tracks,
  };
}

export async function getArtist(id) {
  const [a, albums] = await Promise.all([
    call(`artists/${id}`),
    call(`artists/${id}/albums`, { include_groups: 'album,single,compilation', limit: 10, market: 'BR' }),
  ]);
  return { ...toArtist(a), albums: (albums.items || []).map(toAlbum).filter(Boolean), moreAlbums: !!albums.next };
}

export async function getArtistAlbums(id, offset) {
  const page = await call(`artists/${id}/albums`, { include_groups: 'album,single,compilation', limit: 10, offset, market: 'BR' });
  return { albums: (page.items || []).map(toAlbum).filter(Boolean), more: !!page.next };
}

export const trackUri = (id) => `spotify:track:${id}`;
export const openUrl = (kind, id) => `https://open.spotify.com/${kind}/${id}`;

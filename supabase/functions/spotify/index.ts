// =====================================================================
//  FargusFy — função "spotify": busca no catálogo do Spotify
//
//  O app não pode guardar a chave secreta do Spotify (ela iria para o
//  navegador de todo mundo). Esta função fica no Supabase, guarda a chave
//  e faz as buscas em nome do app, usando o fluxo "client credentials",
//  que não conta como usuário no limite de 5 do modo de desenvolvimento.
//
//  Como criar (uma vez só):
//   1. Supabase → Edge Functions → Secrets: crie SPOTIFY_CLIENT_ID e
//      SPOTIFY_CLIENT_SECRET com os valores do app no painel do Spotify.
//   2. Edge Functions → Deploy a new function → Via Editor, nome
//      "spotify", cole este arquivo inteiro e clique em Deploy.
//   3. Em Details, desligue "Verify JWT" (a função confere o login sozinha,
//      como a função "push" do FargusGram).
//
//  Plano grátis: cada busca é uma chamada da função (o plano dá 500 mil
//  por mês). O app guarda as respostas por um tempo e só busca depois que
//  a pessoa para de digitar, e esta função também guarda em memória.
// =====================================================================

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });
}

// Só estes caminhos da Web API podem ser pedidos (ID = 22 letras e números)
const ID = '[A-Za-z0-9]{22}';
const ALLOWED: RegExp[] = [
  /^search$/,
  new RegExp(`^tracks/${ID}$`),
  new RegExp(`^albums/${ID}$`),
  new RegExp(`^albums/${ID}/tracks$`),
  new RegExp(`^artists/${ID}$`),
  new RegExp(`^artists/${ID}/albums$`),
];
const ALLOWED_PARAMS = new Set(['q', 'type', 'limit', 'offset', 'market', 'include_groups']);

// ---------------------------------------------------------------------
// Login do jogador: só quem está no FargusGram usa a busca
// ---------------------------------------------------------------------
const memberCache = new Map<string, number>(); // token -> válido até

async function isMember(authHeader: string | null, apikey: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const until = memberCache.get(token);
  if (until && until > Date.now()) return true;
  // a chave pública vem do próprio app (cabeçalho apikey); a do ambiente é reserva
  const key = apikey || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_member`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return false;
  const ok = (await res.json()) === true;
  if (ok) {
    if (memberCache.size > 500) memberCache.clear();
    memberCache.set(token, Date.now() + 5 * 60 * 1000);
  }
  return ok;
}

// ---------------------------------------------------------------------
// Token do app no Spotify (client credentials), renovado sozinho
// ---------------------------------------------------------------------
let appToken = '';
let appTokenUntil = 0;

async function getAppToken(force = false): Promise<string> {
  if (!force && appToken && appTokenUntil > Date.now() + 60_000) return appToken;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  appToken = data.access_token;
  appTokenUntil = Date.now() + (data.expires_in ?? 3600) * 1000;
  return appToken;
}

// ---------------------------------------------------------------------
// Cache em memória (a mesma busca de vários jogadores sai uma vez só)
// ---------------------------------------------------------------------
const cache = new Map<string, { at: number; status: number; body: string }>();
const CACHE_MS = 30 * 60 * 1000;
const CACHE_MAX = 400;

function remember(key: string, status: number, body: string) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), status, body });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Faltam os segredos SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET' }, 500);

  let body: { path?: string; params?: Record<string, string | number> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Pedido inválido' }, 400);
  }

  const path = String(body.path ?? '').replace(/^\/+/, '');
  if (!ALLOWED.some((r) => r.test(path))) return json({ error: 'Caminho não permitido' }, 400);

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body.params ?? {})) {
    if (!ALLOWED_PARAMS.has(k)) continue;
    const s = String(v).slice(0, 200);
    if (s) params.set(k, s);
  }
  // modo de desenvolvimento: a busca aceita no máximo 10 por página
  // (os outros caminhos aceitam até 50)
  if (params.has('limit')) {
    const max = path === 'search' ? 10 : 50;
    params.set('limit', String(Math.min(max, Math.max(1, Number(params.get('limit')) || max))));
  }
  params.sort();

  if (!(await isMember(req.headers.get('Authorization'), req.headers.get('apikey')))) return json({ error: 'Entre no FargusGram primeiro' }, 401);

  const key = `${path}?${params}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return new Response(hit.body, { status: hit.status, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Cache': 'hit' } });
  }

  try {
    let token = await getAppToken();
    const url = `https://api.spotify.com/v1/${path}${params.size ? `?${params}` : ''}`;
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      token = await getAppToken(true);
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }
    const text = await res.text();
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After') ?? '30';
      return json({ error: 'O Spotify pediu um tempo. Tente de novo em instantes.', retryAfter: Number(retry) || 30 }, 429, { 'Retry-After': retry });
    }
    if (res.ok) remember(key, res.status, text);
    return new Response(text, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ error: 'Não deu para falar com o Spotify', detail: String(e) }, 502);
  }
});

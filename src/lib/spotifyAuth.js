// Login no Spotify para o player completo (só contas Premium).
//
// Usa o fluxo "Authorization Code com PKCE", feito para apps sem servidor:
// não precisa da chave secreta. O token fica só neste aparelho.
//
// No modo de desenvolvimento do Spotify, só as contas cadastradas em
// "User Management" no painel do app (até 5) conseguem usar.
import { SPOTIFY_CLIENT_ID } from '../config';
import { local } from './storage';

const KEY = 'fy-spotify';
const PKCE_KEY = 'fy-spotify-pkce';
const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state'];

export const hasClientId = () => /^[0-9a-f]{32}$/i.test(SPOTIFY_CLIENT_ID || '');

// Endereço de retorno: a página do app sem o "#/..." (cadastre exatamente
// este endereço no painel do Spotify, em Redirect URIs)
export function redirectUri() {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, '');
}

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const v = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(v, (x) => chars[x % chars.length]).join('');
}

// ------------------------------- tokens -------------------------------
const listeners = new Set();
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn(isConnected()));
}

function read() {
  try {
    const v = JSON.parse(local.get(KEY, 'null'));
    return v && v.access && v.refresh ? v : null;
  } catch {
    return null;
  }
}
function save(data, previous = null) {
  const v = {
    access: data.access_token,
    refresh: data.refresh_token || previous?.refresh,
    until: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope || previous?.scope || '',
  };
  local.set(KEY, JSON.stringify(v));
  emit();
  return v;
}

export const isConnected = () => !!read();

export function disconnect() {
  local.set(KEY, null);
  emit();
}

async function tokenRequest(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Spotify ${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

let refreshing = null;
// Token válido (renova sozinho quando falta menos de 1 minuto)
export async function getToken() {
  const cur = read();
  if (!cur) return null;
  if (cur.until - Date.now() > 60_000) return cur.access;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: cur.refresh })
      .then((data) => save(data, cur).access)
      .catch((e) => {
        if (e.code === 'invalid_grant') disconnect(); // acesso revogado: precisa entrar de novo
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// --------------------------------- login ---------------------------------
export async function connect() {
  if (!hasClientId()) throw new Error('Falta o Client ID do Spotify em src/config.js.');
  const verifier = randomString(64);
  const state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  local.set(PKCE_KEY, JSON.stringify({ verifier, state, back: window.location.hash || '#/' }));
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: redirectUri(),
    state,
  }).toString();
  window.location.assign(url.toString());
}

// Chamado na abertura do app: termina o login se o Spotify mandou ?code=
// Devolve { ok, error } ou null se não era um retorno de login.
export async function finishLoginIfReturning() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;
  let saved = null;
  try {
    saved = JSON.parse(local.get(PKCE_KEY, 'null'));
  } catch {
    saved = null;
  }
  local.set(PKCE_KEY, null);
  const clean = (hash) => window.history.replaceState(null, '', redirectUri() + (hash || '#/configuracoes'));
  if (error) {
    clean(saved?.back);
    return { ok: false, error: error === 'access_denied' ? 'Login no Spotify cancelado.' : `Spotify: ${error}` };
  }
  if (!saved || params.get('state') !== saved.state) {
    clean();
    return { ok: false, error: 'O login no Spotify expirou. Tente de novo.' };
  }
  try {
    const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: saved.verifier });
    save(data);
    clean(saved.back);
    return { ok: true };
  } catch (e) {
    clean(saved.back);
    return { ok: false, error: `Não deu para entrar no Spotify: ${e.message}` };
  }
}

// Chamada à Web API com o token do usuário (player completo)
export async function userApi(path, { method = 'GET', body, query } = {}) {
  const token = await getToken();
  if (!token) throw new Error('Conecte sua conta Premium do Spotify em Configurações.');
  const url = new URL(`https://api.spotify.com/v1/${path}`);
  if (query) url.search = new URLSearchParams(query).toString();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Spotify ${res.status}`;
    const err = new Error(
      res.status === 403 && /registered|developer/i.test(msg)
        ? 'Esta conta do Spotify não está na lista de usuários do app (modo de desenvolvimento, até 5 contas).'
        : res.status === 403 && /premium/i.test(msg)
          ? 'O player completo só funciona com Spotify Premium.'
          : msg
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

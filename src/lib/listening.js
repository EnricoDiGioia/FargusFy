// =====================================================================
//  O que cada personagem ouve (para a Retrospectiva)
//
//  Soma o tempo tocado de verdade (relógio enquanto o player diz que está
//  tocando) e conta uma "reprodução" quando a música passa de 30 s, como o
//  Spotify. Tudo fica primeiro no aparelho e vai para o banco em lotes, uns
//  a cada 5 minutos, por uma única chamada (fy_log_listening). Assim, uma
//  noite inteira de música gasta poucas dezenas de escritas.
//
//  Se o envio falhar, o lote volta para a fila do aparelho e vai depois.
//  Para não contar duas vezes, o lote sai da fila antes de ser enviado.
// =====================================================================
import { supabase } from './supabase';
import { current, getState, livePosition, subscribe } from './player';
import { local } from './storage';

const PENDING_KEY = 'fy-listen-pending';
const ENABLED_KEY = 'fy-listen-on';
const FLUSH_EVERY_MS = 5 * 60 * 1000; // envia o que juntou a cada 5 min
const MAX_GAP_MS = 65 * 1000; // o relógio não conta mais que isso de uma vez (aparelho dormindo)
const PLAY_MS = 30 * 1000; // conta uma reprodução depois de 30 s
const BATCH = 200;

export const listeningEnabled = () => local.get(ENABLED_KEY, '1') === '1';
export function setListeningEnabled(on) {
  local.set(ENABLED_KEY, on ? '1' : '0');
  if (!on) flush();
}

// ------------------------- fila no aparelho -------------------------
// { since: timestamp do primeiro item, items: { chave: item } }
let pending = loadPending();
function loadPending() {
  try {
    const v = JSON.parse(local.get(PENDING_KEY, 'null'));
    if (v && typeof v.items === 'object') return v;
  } catch {
    /* começa vazio */
  }
  return { since: 0, items: {} };
}
let saveTimer = null;
function savePending(now = false) {
  clearTimeout(saveTimer);
  const write = () => local.set(PENDING_KEY, Object.keys(pending.items).length ? JSON.stringify(pending) : null);
  if (now) write();
  else saveTimer = setTimeout(write, 5000);
}

const pad = (n) => String(n).padStart(2, '0');
function localDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addPending(charId, track, ms, plays, at) {
  const d = new Date(at);
  const day = localDay(d);
  const hour = d.getHours();
  const key = `${charId}|${track.id}|${day}|${hour}`;
  const it = pending.items[key] || {
    charId,
    id: track.id,
    title: track.title,
    artist: track.artist || '',
    artist_id: track.artists?.[0]?.id || null,
    album_id: track.album_id || null,
    artwork: track.artwork || null,
    duration_ms: Math.round(track.duration_ms || 0),
    ms: 0,
    plays: 0,
    day,
    hour,
  };
  it.ms += Math.round(ms);
  it.plays += plays;
  pending.items[key] = it;
  if (!pending.since) pending.since = Date.now();
  savePending(plays > 0);
}

// ------------------------- envio -------------------------
let sending = false;
export async function flush() {
  if (sending) return;
  const all = Object.values(pending.items);
  if (!all.length) return;
  // tira da fila antes de enviar: se a página fechar no meio, perde-se um
  // pedaço pequeno, mas nunca conta em dobro
  pending = { since: 0, items: {} };
  savePending(true);
  sending = true;
  const failed = [];
  try {
    const byChar = new Map();
    for (const it of all) {
      if (!byChar.has(it.charId)) byChar.set(it.charId, []);
      byChar.get(it.charId).push(it);
    }
    for (const [charId, items] of byChar) {
      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        const body = chunk.map(({ charId: _c, ...rest }) => rest);
        const { error } = await supabase.rpc('fy_log_listening', { p_character: charId, p_items: body });
        if (error) {
          // personagem que não é mais deste jogador, ou banco sem a Retrospectiva:
          // descarta; falta de internet: tenta de novo depois
          const msg = String(error.message || '');
          const permanent = /não é seu|fy_log_listening|schema cache|does not exist/i.test(msg) || error.code === 'PGRST202';
          if (!permanent) failed.push(...chunk);
        }
      }
    }
  } catch {
    failed.push(...all);
  } finally {
    sending = false;
  }
  if (failed.length) {
    for (const it of failed) {
      const key = `${it.charId}|${it.id}|${it.day}|${it.hour}`;
      const cur = pending.items[key];
      if (cur) {
        cur.ms += it.ms;
        cur.plays += it.plays;
      } else pending.items[key] = it;
    }
    if (!pending.since) pending.since = Date.now();
    savePending(true);
  }
}

// ------------------------- medição -------------------------
let charId = null;
let cur = null; // { charId, track, ms, counted, lastAt, playing, lastPos }
let started = false;

export function setListeningCharacter(id) {
  if (id === charId) return;
  tick(); // fecha o que estava tocando no personagem anterior
  charId = id || null;
  cur = null;
  tick();
}

function isPlaying(s) {
  return !!current(s) && !s.isPaused && !s.isBuffering && s.status !== 'error';
}

function tick() {
  const s = getState();
  const t = current(s);
  const now = Date.now();
  const on = listeningEnabled();

  // soma o tempo desde a última olhada, se estava tocando
  if (cur && cur.playing && on) {
    const dt = Math.min(now - cur.lastAt, MAX_GAP_MS);
    if (dt > 0) {
      cur.ms += dt;
      addPending(cur.charId, cur.track, dt, 0, now);
      const dur = s.duration || cur.track.duration_ms || PLAY_MS;
      if (!cur.counted && cur.ms >= Math.min(PLAY_MS, dur * 0.8)) {
        cur.counted = true;
        addPending(cur.charId, cur.track, 0, 1, now);
      }
    }
  }

  const pos = t ? livePosition(s, now) : 0;
  if (!t || !charId) {
    cur = null;
  } else if (!cur || cur.track.id !== t.id || cur.charId !== charId) {
    cur = { charId, track: t, ms: 0, counted: false, lastAt: now, playing: isPlaying(s), lastPos: pos };
  } else {
    // a mesma música recomeçou (repetir uma, ou voltou para o início)
    if (cur.lastPos > 20000 && pos + 5000 < cur.lastPos) {
      cur.ms = 0;
      cur.counted = false;
    }
    cur.lastAt = now;
    cur.playing = isPlaying(s);
    cur.lastPos = pos;
  }

  if (pending.since && Date.now() - pending.since >= FLUSH_EVERY_MS) flush();
}

// Liga a medição (uma vez só, no início do app)
export function startListening() {
  if (started) return;
  started = true;
  setInterval(tick, 1000);
  subscribe(tick);
  // o que sobrou da última visita vai logo
  setTimeout(flush, 4000);
  // saindo do app: guarda no aparelho e envia se já juntou mais de 1 min
  // (trocar de app várias vezes não vira várias escritas)
  const leave = () => {
    tick();
    savePending(true);
    if (pending.since && Date.now() - pending.since > 60 * 1000) flush();
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && leave());
  window.addEventListener('pagehide', leave);
}

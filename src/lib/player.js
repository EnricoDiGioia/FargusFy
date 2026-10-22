// =====================================================================
//  Player do FargusFy
//
//  Mesma ideia do Spotify: as telas nunca mexem no áudio. Elas mandam
//  comandos (tocar esta lista, próxima, pausar...) e leem o estado por
//  usePlayer(). Quem toca de verdade é um de dois "motores":
//
//   - embed: o player embutido do Spotify (iFrame API). Funciona para
//     todo mundo, sem login no Spotify. Quem não está logado no Spotify
//     naquele navegador costuma ouvir só uma prévia.
//   - sdk: o Web Playback SDK. Música inteira dentro do app, só para
//     contas Premium cadastradas no app do Spotify (até 5).
//
//  A fila é sempre nossa: o motor só recebe "toque esta música" e avisa
//  quando pausou, avançou ou terminou.
// =====================================================================
import { useSyncExternalStore } from 'react';
import { local } from './storage';
import { trackUri } from './catalog';
import { getToken, isConnected, userApi, onAuthChange } from './spotifyAuth';

const SAVE_KEY = 'fy-player';
const PREF_KEY = 'fy-player-mode'; // 'auto' (SDK se conectado) | 'embed'

let state = {
  queue: [],
  index: -1,
  manual: 0, // quantas músicas "adicionadas à fila" estão logo depois da atual
  context: null, // { type, id, name, href }
  original: null, // ordem antes do aleatório
  shuffle: false,
  repeat: 'off', // off | all | one
  isPaused: true,
  isBuffering: false,
  position: 0,
  duration: 0,
  updatedAt: 0,
  engine: 'embed', // embed | sdk
  status: 'idle', // idle | loading | ready | error
  error: null,
  volume: 0.7,
  mode: local.get(PREF_KEY, 'auto'),
};

const subs = new Set();
// só a fila e as escolhas são guardadas (a posição muda o tempo todo)
const SAVED_FIELDS = ['queue', 'index', 'manual', 'context', 'shuffle', 'repeat', 'original', 'volume'];
function set(patch) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
  if (SAVED_FIELDS.some((k) => k in patch)) scheduleSave();
}
export const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const getState = () => state;
export function usePlayer() {
  return useSyncExternalStore(subscribe, getState);
}
export const current = (s = state) => (s.index >= 0 ? s.queue[s.index] || null : null);

// posição "ao vivo" (o motor avisa de tempos em tempos; o resto é relógio)
export function livePosition(s = state, now = Date.now()) {
  if (s.isPaused || s.isBuffering) return s.position;
  return Math.min(s.duration || Infinity, s.position + (now - s.updatedAt));
}

// ------------------------- guardar entre visitas -------------------------
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { queue, index, manual, context, shuffle, repeat, original, volume } = state;
    local.set(
      SAVE_KEY,
      JSON.stringify({ queue: queue.slice(0, 300), index, manual, context, shuffle, repeat, original: original?.slice(0, 300) ?? null, volume })
    );
  }, 400);
}
function restore() {
  try {
    const v = JSON.parse(local.get(SAVE_KEY, 'null'));
    if (!v || !Array.isArray(v.queue)) return;
    const index = Math.min(Math.max(-1, v.index ?? -1), v.queue.length - 1);
    state = {
      ...state,
      queue: v.queue,
      index,
      manual: v.manual || 0,
      context: v.context || null,
      shuffle: !!v.shuffle,
      repeat: ['off', 'all', 'one'].includes(v.repeat) ? v.repeat : 'off',
      original: Array.isArray(v.original) ? v.original : null,
      volume: typeof v.volume === 'number' ? v.volume : 0.7,
    };
  } catch {
    /* começa vazio */
  }
}
restore();

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =====================================================================
//  Motor 1: embed (Spotify iFrame API)
// =====================================================================
const embed = {
  host: null,
  controller: null,
  api: null,
  apiPromise: null,
  autoplay: false,
  loadedUri: null,
  lastEnd: null,
};

function loadIframeApi() {
  if (embed.apiPromise) return embed.apiPromise;
  embed.apiPromise = new Promise((resolve, reject) => {
    const prev = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      embed.api = api;
      resolve(api);
      prev?.(api);
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => {
      embed.apiPromise = null;
      reject(new Error('Não deu para carregar o player do Spotify.'));
    };
    document.head.appendChild(s);
  });
  return embed.apiPromise;
}

function onEmbedUpdate(e) {
  const d = e?.data || {};
  if (state.engine !== 'embed') return;
  const duration = d.duration || 0;
  const position = d.position || 0;
  set({ isPaused: !!d.isPaused, isBuffering: !!d.isBuffering, duration, position, updatedAt: Date.now(), status: 'ready', error: null });
  // fim da música (ou da prévia): segue a fila
  const key = `${embed.loadedUri}:${duration}`;
  if (duration > 0 && position >= duration - 600 && embed.lastEnd !== key) {
    embed.lastEnd = key;
    setTimeout(() => next(true), 250);
  }
}

async function embedLoad(track, autoplay) {
  const uri = trackUri(track.id);
  set({ status: 'loading', error: null, position: 0, duration: track.duration_ms || 0, updatedAt: Date.now(), isPaused: !autoplay });
  if (!embed.host) {
    // a área do player ainda não apareceu na tela: tenta de novo já já
    embed.pending = { track, autoplay };
    return;
  }
  const api = await loadIframeApi();
  if (embed.creating) await embed.creating; // outro clique ainda está criando o player
  embed.autoplay = autoplay;
  embed.lastEnd = null;
  if (embed.controller) {
    if (embed.loadedUri === uri) {
      if (autoplay) embed.controller.play();
      return;
    }
    embed.loadedUri = uri;
    embed.controller.loadUri(uri);
    return;
  }
  embed.loadedUri = uri;
  // a iFrame API troca o elemento pelo iframe: usamos um filho descartável
  const slot = document.createElement('div');
  embed.host.replaceChildren(slot);
  embed.creating = new Promise((resolve) => {
    api.createController(slot, { uri, width: '100%', height: 80 }, (ctrl) => {
      embed.controller = ctrl;
      ctrl.addListener('ready', () => {
        set({ status: 'ready' });
        if (embed.autoplay) {
          embed.autoplay = false;
          ctrl.play();
        }
      });
      ctrl.addListener('playback_update', onEmbedUpdate);
      resolve();
    });
  });
  await embed.creating;
  embed.creating = null;
  // pediram outra música enquanto o player nascia
  const want = current();
  if (want && trackUri(want.id) !== embed.loadedUri) {
    embed.loadedUri = trackUri(want.id);
    embed.controller.loadUri(embed.loadedUri);
  }
}

// o componente <EmbedHost> entrega o elemento onde o iframe mora
export function attachEmbedHost(el) {
  if (embed.host === el) return;
  embed.host = el;
  if (el && embed.pending && state.engine === 'embed') {
    const p = embed.pending;
    embed.pending = null;
    embedLoad(p.track, p.autoplay);
  }
}

function embedDestroy() {
  try {
    embed.controller?.destroy();
  } catch {
    /* já saiu */
  }
  embed.controller = null;
  embed.loadedUri = null;
  embed.host?.replaceChildren();
}

// =====================================================================
//  Motor 2: Web Playback SDK (Premium)
// =====================================================================
const sdk = {
  player: null,
  deviceId: null,
  ready: null,
  sdkPromise: null,
  last: null, // último estado recebido
  windowStart: -1, // índice da fila onde começa a lista enviada ao Spotify
  windowIds: [],
  dirty: false, // fila mudou depois do envio (aleatório, adicionar...)
  expectId: null,
};

function loadSdkScript() {
  if (sdk.sdkPromise) return sdk.sdkPromise;
  sdk.sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify?.Player) return resolve();
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
      prev?.();
    };
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => {
      sdk.sdkPromise = null;
      reject(new Error('Não deu para carregar o player do Spotify.'));
    };
    document.head.appendChild(s);
  });
  return sdk.sdkPromise;
}

function sdkFail(message) {
  set({ status: 'error', error: message });
  // volta para o embed para a música não parar de vez
  switchEngine('embed', { keepError: true });
}

async function sdkEnsure() {
  if (sdk.ready) return sdk.ready;
  sdk.ready = (async () => {
    await loadSdkScript();
    const player = new window.Spotify.Player({
      name: 'FargusFy',
      getOAuthToken: (cb) => {
        getToken()
          .then((t) => t && cb(t))
          .catch(() => sdkFail('A sessão do Spotify expirou. Conecte de novo em Configurações.'));
      },
      volume: state.volume,
    });
    sdk.player = player;
    player.addListener('initialization_error', ({ message }) => sdkFail(`Este navegador não roda o player completo (${message}).`));
    player.addListener('authentication_error', () => sdkFail('A sessão do Spotify expirou. Conecte de novo em Configurações.'));
    player.addListener('account_error', () => sdkFail('O player completo só funciona com Spotify Premium.'));
    player.addListener('playback_error', ({ message }) => set({ error: `Spotify: ${message}` }));
    player.addListener('player_state_changed', onSdkState);
    const deviceId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O Spotify demorou para responder.')), 15000);
      player.addListener('ready', ({ device_id }) => {
        clearTimeout(timer);
        resolve(device_id);
      });
      player.addListener('not_ready', () => {
        sdk.deviceId = null;
      });
      player.connect().then((ok) => {
        if (!ok) {
          clearTimeout(timer);
          reject(new Error('O Spotify recusou a conexão do player.'));
        }
      });
    });
    sdk.deviceId = deviceId;
    return player;
  })().catch((e) => {
    sdk.ready = null;
    throw e;
  });
  return sdk.ready;
}

function onSdkState(s) {
  if (state.engine !== 'sdk') return;
  if (!s) {
    // o som foi para outro aparelho
    set({ isPaused: true, updatedAt: Date.now() });
    return;
  }
  const prev = sdk.last;
  sdk.last = s;
  const cur = s.track_window?.current_track;
  const curId = cur?.linked_from?.id || cur?.id;
  const patch = { isPaused: s.paused, isBuffering: !!s.loading, position: s.position, duration: s.duration, updatedAt: Date.now(), status: 'ready' };

  // o Spotify avançou sozinho para a próxima da lista enviada
  const here = current();
  if (curId && here && curId !== here.id) {
    const j = state.queue.findIndex((t, i) => i > state.index && t.id === curId);
    if (sdk.dirty && curId !== sdk.expectId) {
      // a lista enviada está velha (fila mudou): toca a que devia vir
      set(patch);
      next(true);
      return;
    }
    if (j > state.index) {
      const skipped = j - state.index;
      patch.index = j;
      patch.manual = Math.max(0, state.manual - skipped);
    }
  }
  set(patch);

  // terminou a última música enviada
  const ended = s.paused && s.position === 0 && prev && !prev.paused && prev.duration - prev.position < 3500 && !(s.track_window?.next_tracks || []).length;
  if (ended) next(true);
}

async function sdkLoad(index, autoplay) {
  set({ status: 'loading', error: null, position: 0, updatedAt: Date.now() });
  try {
    await sdkEnsure();
    const ids = state.queue.slice(index, index + 50).map((t) => t.id);
    sdk.windowStart = index;
    sdk.windowIds = ids;
    sdk.dirty = false;
    sdk.expectId = ids[1] || null;
    if (!autoplay) {
      set({ status: 'ready', isPaused: true, duration: state.queue[index]?.duration_ms || 0 });
      sdk.pendingIndex = index;
      return;
    }
    sdk.pendingIndex = null;
    await userApi('me/player/play', { method: 'PUT', query: { device_id: sdk.deviceId }, body: { uris: ids.map(trackUri) } });
    await userApi('me/player/repeat', { method: 'PUT', query: { device_id: sdk.deviceId, state: state.repeat === 'one' ? 'track' : 'off' } }).catch(() => {});
  } catch (e) {
    if (e.status === 403 || e.status === 401) sdkFail(e.message);
    else set({ status: 'error', error: e.message });
  }
}

function sdkDestroy() {
  try {
    sdk.player?.disconnect();
  } catch {
    /* já saiu */
  }
  sdk.player = null;
  sdk.ready = null;
  sdk.deviceId = null;
  sdk.last = null;
}

// =====================================================================
//  Escolha do motor
// =====================================================================
function wantedEngine() {
  return state.mode !== 'embed' && isConnected() ? 'sdk' : 'embed';
}

export function switchEngine(engine, { keepError = false } = {}) {
  if (engine === state.engine) return;
  const wasPlaying = !state.isPaused;
  if (state.engine === 'sdk') sdkDestroy();
  if (state.engine === 'embed') embedDestroy();
  set({ engine, isPaused: true, position: 0, status: 'idle', ...(keepError ? {} : { error: null }) });
  const t = current();
  if (t) loadCurrent(wasPlaying);
}

export function setMode(mode) {
  local.set(PREF_KEY, mode);
  set({ mode });
  switchEngine(wantedEngine());
}

onAuthChange(() => switchEngine(wantedEngine()));
state = { ...state, engine: wantedEngine() };

// =====================================================================
//  Comandos (o que as telas chamam)
// =====================================================================
function loadCurrent(autoplay) {
  const t = current();
  if (!t) return;
  if (state.engine === 'sdk') sdkLoad(state.index, autoplay);
  else embedLoad(t, autoplay);
  updateMediaSession(t);
}

// o iPhone só deixa tocar som a partir de um toque: avisa o SDK nesse toque
function touchActivate() {
  try {
    sdk.player?.activateElement?.();
  } catch {
    /* sem SDK */
  }
}

// Toca uma lista a partir de uma posição. context = de onde veio (playlist, álbum...)
export function playTracks(tracks, startIndex = 0, context = null) {
  const list = (tracks || []).filter((t) => t?.id);
  if (!list.length) return;
  touchActivate();
  const start = Math.min(Math.max(0, startIndex), list.length - 1);
  if (state.shuffle) {
    const first = list[start];
    const rest = shuffled(list.filter((_, i) => i !== start));
    set({ queue: [first, ...rest], index: 0, original: list, manual: 0, context });
  } else {
    set({ queue: list, index: start, original: null, manual: 0, context });
  }
  loadCurrent(true);
}

export function toggle() {
  const t = current();
  if (!t) return;
  touchActivate();
  if (state.engine === 'sdk') {
    if (sdk.pendingIndex != null) return sdkLoad(sdk.pendingIndex, true);
    sdk.player?.togglePlay();
  } else if (embed.controller) embed.controller.togglePlay();
  else loadCurrent(true);
}

export function next(auto = false) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') {
    if (state.engine === 'embed') embed.controller?.seek(0);
    loadCurrent(true);
    return;
  }
  let i = state.index + 1;
  if (i >= state.queue.length) {
    if (state.repeat !== 'all') {
      set({ isPaused: true, updatedAt: Date.now() });
      if (state.engine === 'sdk') sdk.player?.pause();
      else embed.controller?.pause();
      return;
    }
    i = 0;
  }
  set({ index: i, manual: Math.max(0, state.manual - 1) });
  loadCurrent(true);
}

export function prev() {
  if (!state.queue.length) return;
  if (livePosition() > 3000) return seek(0);
  let i = state.index - 1;
  if (i < 0) i = state.repeat === 'all' ? state.queue.length - 1 : 0;
  set({ index: i });
  loadCurrent(true);
}

export function jump(i) {
  if (i < 0 || i >= state.queue.length) return;
  touchActivate();
  set({ index: i, manual: i > state.index ? Math.max(0, state.manual - (i - state.index)) : 0 });
  loadCurrent(true);
}

export function seek(ms) {
  const pos = Math.max(0, Math.round(ms));
  if (state.engine === 'sdk') sdk.player?.seek(pos);
  else embed.controller?.seek(pos / 1000);
  set({ position: pos, updatedAt: Date.now() });
}

export function setVolume(v) {
  const volume = Math.min(1, Math.max(0, v));
  set({ volume });
  sdk.player?.setVolume(volume);
}

function markDirty() {
  if (state.engine === 'sdk') {
    sdk.dirty = true;
    sdk.expectId = state.queue[state.index + 1]?.id || null;
  }
}

// "Adicionar à fila": entra depois das que já foram adicionadas
export function addToQueue(tracks) {
  const list = (Array.isArray(tracks) ? tracks : [tracks]).filter((t) => t?.id);
  if (!list.length) return;
  if (!current()) return playTracks(list, 0, null);
  const at = state.index + 1 + state.manual;
  const queue = [...state.queue.slice(0, at), ...list, ...state.queue.slice(at)];
  set({ queue, manual: state.manual + list.length });
  markDirty();
}

// "Tocar em seguida": logo depois da atual
export function playNext(track) {
  if (!track?.id) return;
  if (!current()) return playTracks([track], 0, null);
  const at = state.index + 1;
  set({ queue: [...state.queue.slice(0, at), track, ...state.queue.slice(at)], manual: state.manual + 1 });
  markDirty();
}

export function removeFromQueue(i) {
  if (i <= state.index || i >= state.queue.length) return;
  const queue = state.queue.filter((_, k) => k !== i);
  const manual = i <= state.index + state.manual ? Math.max(0, state.manual - 1) : state.manual;
  set({ queue, manual });
  markDirty();
}

export function moveInQueue(from, to) {
  if (from <= state.index || to <= state.index || from >= state.queue.length || to >= state.queue.length) return;
  const queue = [...state.queue];
  const [t] = queue.splice(from, 1);
  queue.splice(to, 0, t);
  set({ queue });
  markDirty();
}

export function clearUpcoming() {
  set({ queue: state.queue.slice(0, state.index + 1), manual: 0 });
  markDirty();
}

export function setShuffle(on) {
  const cur = current();
  if (on === state.shuffle) return;
  if (!cur) return set({ shuffle: on });
  if (on) {
    const original = state.original || state.queue;
    const rest = shuffled(original.filter((t) => t !== cur && t.id !== cur.id));
    set({ shuffle: true, original, queue: [cur, ...rest], index: 0, manual: 0 });
  } else {
    const original = state.original || state.queue;
    const idx = original.findIndex((t) => t.id === cur.id);
    set({ shuffle: false, original: null, queue: original, index: Math.max(0, idx), manual: 0 });
  }
  markDirty();
}

export function cycleRepeat() {
  const repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  set({ repeat });
  if (state.engine === 'sdk' && sdk.deviceId) {
    userApi('me/player/repeat', { method: 'PUT', query: { device_id: sdk.deviceId, state: repeat === 'one' ? 'track' : 'off' } }).catch(() => {});
  }
}

// mostra na tela de bloqueio / controles do sistema (player completo)
function updateMediaSession(t) {
  if (!('mediaSession' in navigator) || state.engine !== 'sdk') return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: t.artwork ? [{ src: t.artwork, sizes: '300x300', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('play', toggle);
    navigator.mediaSession.setActionHandler('pause', toggle);
  } catch {
    /* navegador sem suporte */
  }
}

// ao abrir o app, prepara a última música (sem tocar)
export function primeRestoredTrack() {
  if (current() && state.status === 'idle') loadCurrent(false);
}

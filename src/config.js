// =====================================================================
//  Configuração do FargusFy
//
//  O FargusFy usa o MESMO projeto Supabase do FargusGram: mesmas contas,
//  mesmos personagens. Por isso a URL e a chave abaixo são as mesmas do
//  src/config.js do FargusGram. Elas são públicas por natureza; quem
//  protege os dados são as regras do banco (supabase/fargusfy.sql).
// =====================================================================

const env = import.meta.env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://vhiagccrtqxizserfdzm.supabase.co';

export const SUPABASE_KEY = env.VITE_SUPABASE_KEY || 'sb_publishable_YvM0xKvUvhg3zlMzLyNpZw_i8jiyizN';

// Client ID do app no painel do Spotify (developer.spotify.com/dashboard).
// Também é público: o segredo (Client secret) fica só na função "spotify"
// do Supabase, nunca aqui.
export const SPOTIFY_CLIENT_ID = env.VITE_SPOTIFY_CLIENT_ID || '32fcfd0632d84f6196be0016303f2fe9';

// Endereço do FargusGram (para os links de perfil e o botão de entrar)
export const FARGUSGRAM_URL = env.VITE_FARGUSGRAM_URL || 'https://enricodigioia.github.io/FargusGram/';

// Nome que aparece no app
export const APP_NAME = 'FargusFy';

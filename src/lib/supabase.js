import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL as RAW_URL, SUPABASE_KEY as RAW_KEY } from '../config';

// Aceita a URL copiada com barra no fim ou com /rest/v1
export const SUPABASE_URL = String(RAW_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth|storage|functions)\/v1$/, '');
export const SUPABASE_KEY = String(RAW_KEY || '').trim();

export const isConfigured =
  /^https?:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_KEY.startsWith('COLE-AQUI');

// storageKey igual ao do FargusGram: os dois sites ficam no mesmo endereço
// (seu-usuario.github.io), então quem entrou no FargusGram já entra aqui.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost',
  isConfigured ? SUPABASE_KEY : 'x',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'fargusgram-auth',
    },
  }
);

const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/media/`;

// URL pública de uma foto do FargusGram (bucket "media")
export function mediaUrl(path) {
  if (!path) return null;
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return PUBLIC_BASE + path.split('/').map(encodeURIComponent).join('/');
}

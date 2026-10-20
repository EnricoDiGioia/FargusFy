import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' deixa o app funcionar em qualquer endereço
// (ex.: https://seu-usuario.github.io/FargusFy/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: ['es2020', 'safari15'],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react')) return 'react';
        },
      },
    },
  },
  // 127.0.0.1 (e não "localhost"): é o único endereço local que o Spotify
  // aceita como endereço de retorno do login desde 2025
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173 },
});

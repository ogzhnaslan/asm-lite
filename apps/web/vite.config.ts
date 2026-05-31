import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Electron'da file:// üzerinden dist/index.html yüklenirken asset path'leri
  // relative olmalı. Web tarayıcısında da bu çalışır (5173 dev + static prod).
  base: './',
  server: {
    port: 5173,
    // host: true → tüm interface'lerde dinle (IPv4 + IPv6). Vite Windows'ta default
    // sadece ::1'e (IPv6 localhost) bağlanır; Electron 127.0.0.1 (IPv4) deniyor ve
    // ERR_CONNECTION_REFUSED alıyor. host:true her iki adres için de erişilebilir yapar.
    host: true,
  },
  resolve: {
    alias: {
      '@asm/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});

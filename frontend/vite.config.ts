import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';

function preserveTmdbCachePlugin() {
  return {
    name: 'preserve-tmdb-cache',
    async generateBundle() {
      // No-op during bundle generation
    },
    async closeBundle() {
      // After vite empties outDir, restore tmdb-cache if it was backed up
      const outDir = path.resolve(__dirname, '../src/public');
      const cacheDir = path.join(outDir, 'tmdb-cache');
      const backupDir = path.join(outDir, '../tmdb-cache-backup');
      try {
        if (fs.existsSync(backupDir)) {
          fs.renameSync(backupDir, cacheDir);
          console.log('[preserve-tmdb-cache] Restored tmdb-cache after build');
        }
      } catch (e) {
        // ignore
      }
    },
    async buildStart() {
      // Before vite empties outDir, back up tmdb-cache
      const outDir = path.resolve(__dirname, '../src/public');
      const cacheDir = path.join(outDir, 'tmdb-cache');
      const backupDir = path.join(outDir, '../tmdb-cache-backup');
      try {
        if (fs.existsSync(cacheDir)) {
          fs.renameSync(cacheDir, backupDir);
          console.log('[preserve-tmdb-cache] Backed up tmdb-cache before build');
        }
      } catch (e) {
        // ignore
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), preserveTmdbCachePlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5173,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: '../src/public',
      emptyOutDir: true,
    },
  };
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 開発サーバーで /api を FastAPI へ転送する。
 * ホストで `npm run dev` のときは :8000、docker compose の web では API_PROXY_TARGET（http://api:8000）
 */
const API_DEV_SERVER = process.env.API_PROXY_TARGET ?? 'http://localhost:8000';
/** docker compose（macOS のバインドマウント）ではファイル変更の通知が届かないことがあるためポーリングする */
const USE_POLLING = process.env.DEV_WATCH_POLLING === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': API_DEV_SERVER,
    },
    watch: {
      // 画面に関係しないディレクトリは監視しない（ポーリング時の負荷を抑える）
      ignored: ['**/.venv/**', '**/backend/**', '**/dist/**', '**/supabase/**'],
      ...(USE_POLLING ? { usePolling: true, interval: 300 } : {}),
    },
  },
});

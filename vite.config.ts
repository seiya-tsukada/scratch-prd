import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** `npm run dev:web` のとき /api を FastAPI（`npm run dev:api`）へ転送する */
const API_DEV_SERVER = 'http://localhost:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': API_DEV_SERVER,
    },
  },
});

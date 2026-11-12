import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Dev: teruskan /api ke ewi-api lokal (npm run dev:api)
  server: { proxy: { '/api': 'http://localhost:4100' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})

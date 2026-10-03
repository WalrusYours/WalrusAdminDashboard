import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // Mirrors deploy/default.conf.template: the browser calls /api/..., the engine sees /...
    proxy: {
      '/api': {
        target: process.env.WALRUS_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace('/api', ''),
      },
    },
  },
})

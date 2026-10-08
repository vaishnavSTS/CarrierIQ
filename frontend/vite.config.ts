import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        // The frontend calls /api/...; Vite forwards it to FastAPI, so no CORS setup is needed in dev.
        '/api': env.API_PROXY_TARGET || 'http://localhost:8000',
      },
    },
  }
})

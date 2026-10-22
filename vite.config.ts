import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, /api/* goes to the FastAPI server (npm run api).
// In production on Vercel, vercel.json rewrites /api/* to the Python function.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
  },
})

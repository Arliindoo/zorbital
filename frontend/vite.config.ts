/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Em desenvolvimento o Vite serve o front em :5173 e repassa /api para o FastAPI em :8000.
// Em produção o FastAPI serve o `dist/` e a API na mesma origem, sem CORS.
const API = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
  build: {
    // o Plotly sozinho tem ~1,2 MB minificado; ele é carregado sob demanda, no primeiro gráfico
    chunkSizeWarningLimit: 1300,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // For GitHub Pages: set base to '/repo-name/' when deploying to subpath
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5174,
  },
})

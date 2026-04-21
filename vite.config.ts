import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  server: {
    proxy: {
      // Forward browser Host so Thirdweb x402 `resourceUrl` matches the page origin (5173), not 8787.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers.host
            if (typeof host === 'string' && host.length > 0) {
              proxyReq.setHeader('X-Forwarded-Host', host)
            }
            proxyReq.setHeader('X-Forwarded-Proto', 'http')
          })
        },
      },
      // OpenAPI — same origin as Vite dev when API runs on 8787
      '/openapi.json': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers.host
            if (typeof host === 'string' && host.length > 0) {
              proxyReq.setHeader('X-Forwarded-Host', host)
            }
            proxyReq.setHeader('X-Forwarded-Proto', 'http')
          })
        },
      },
    },
  },
})

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only: mount the serverless AI proxy (api/ai.js) into the Vite dev server
// so `npm run dev` proxies provider calls locally, exactly like production. In
// production the same file is deployed as a serverless function by the host
// (e.g. Vercel). Keys are read from `.env` (non-VITE_ vars stay server-side).
function aiProxyDev() {
  return {
    name: 'ai-proxy-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
        if (env[k] && !process.env[k]) process.env[k] = env[k]
      }
      server.middlewares.use('/api/ai', async (req, res) => {
        // Adapt the raw Node response to the express-like API api/ai.js expects.
        res.status = (code) => ((res.statusCode = code), res)
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        res.send = (text) => res.end(text)
        try {
          const { default: handler } = await server.ssrLoadModule('/api/ai.js')
          await handler(req, res)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: `Proxy dev handler failed: ${e?.message || e}` }))
        }
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), aiProxyDev()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // The Firestore SDK is intentionally vendored into its own chunk; raise the
    // warning threshold so the build output stays clean.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendors into their own cacheable chunks.
        manualChunks: {
          'firebase-auth': ['firebase/app', 'firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          pdfjs: ['pdfjs-dist'],
          react: ['react', 'react-dom'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})

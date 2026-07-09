import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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

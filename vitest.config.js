import { defineConfig } from 'vitest/config'

// Deterministic, offline unit tests for the service layer. Firebase subpackages
// are aliased to a no-op stub so importing service chains (chat / decks /
// retrieval / firebase.js) never touches real Firebase, credentials, or the
// network. Everything runs in demo mode (no provider keys, no fetch).
export default defineConfig({
  resolve: {
    alias: [
      { find: 'firebase/app', replacement: new URL('./test/firebase-stub.js', import.meta.url).pathname },
      { find: 'firebase/auth', replacement: new URL('./test/firebase-stub.js', import.meta.url).pathname },
      { find: 'firebase/firestore', replacement: new URL('./test/firebase-stub.js', import.meta.url).pathname },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js'],
  },
})

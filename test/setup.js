import { beforeEach } from 'vitest'
import { _resetMemo } from '../src/services/ml/model.js'

// Minimal localStorage shim — the service layer persists ML events, retrieval
// indexes, evaluation events and recommendation logs here. Backed by a Map.
class LocalStorageStub {
  constructor() { this.store = new Map() }
  getItem(k) { return this.store.has(String(k)) ? this.store.get(String(k)) : null }
  setItem(k, v) { this.store.set(String(k), String(v)) }
  removeItem(k) { this.store.delete(String(k)) }
  clear() { this.store.clear() }
  key(i) { return [...this.store.keys()][i] ?? null }
  get length() { return this.store.size }
}
globalThis.localStorage = new LocalStorageStub()

// Full isolation between tests: wipe persisted state AND the ML model's
// in-memory cache so no trained model or logged event leaks across tests.
beforeEach(() => {
  globalThis.localStorage.clear()
  _resetMemo()
})

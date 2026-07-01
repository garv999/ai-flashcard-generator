// Firestore-backed storage for a signed-in user's flashcard decks.
//
// Data model:  users/{uid}/decks/{deckId}
//   deck doc = { topic, cards, createdAt }   (deckId == the client-side set id)
//
// Each user can only read/write their own decks — enforced by firestore.rules.
// subscribeToDecks() gives realtime updates so decks sync across devices.

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from './firebase'

function decksCollection(uid) {
  return collection(db, 'users', uid, 'decks')
}

// Subscribe to the user's decks in realtime. Returns an unsubscribe function.
export function subscribeToDecks(uid, onData, onError) {
  const q = query(decksCollection(uid), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const decks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(decks)
    },
    (error) => {
      console.error('[Flashcards] Failed to load decks from Firestore:', error)
      if (onError) onError(error)
    },
  )
}

// Create or update a single deck (idempotent — keyed by deck.id).
// Persists deck metadata; optional fields are only written when present
// (Firestore rejects `undefined` values).
export function saveDeck(uid, deck) {
  const data = {
    topic: deck.topic,
    cards: deck.cards,
    createdAt: deck.createdAt || new Date().toISOString(),
    source: deck.source || 'topic', // 'topic' | 'pdf'
  }
  if (deck.filename) data.filename = deck.filename
  if (typeof deck.pageCount === 'number') data.pageCount = deck.pageCount
  if (deck.uploadDate) data.uploadDate = deck.uploadDate
  if (deck.pageRange) data.pageRange = deck.pageRange

  return setDoc(doc(db, 'users', uid, 'decks', deck.id), data)
}

export function deleteDeck(uid, deckId) {
  return deleteDoc(doc(db, 'users', uid, 'decks', deckId))
}

// One-time migration: push an array of local (Demo mode) decks into Firestore.
// Idempotent because each deck is written under its existing id.
export async function migrateLocalDecks(uid, localDecks) {
  if (!Array.isArray(localDecks) || localDecks.length === 0) return 0
  await Promise.all(localDecks.map((deck) => saveDeck(uid, deck)))
  return localDecks.length
}

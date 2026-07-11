// AI Study Assistant — per-deck / per-PDF chat sessions.
//
// Every deck (topic or uploaded PDF) has its own conversation, keyed by deck id.
//   Message = { id, role: 'user' | 'assistant', text, at }   (at = ISO string)
//
// Demo mode keeps all conversations in a single localStorage object:
//   aifc.chats = { [deckId]: { messages: Message[], updatedAt } }
// Signed-in users get one Firestore doc per conversation:
//   users/{uid}/chats/{deckId} = { messages: Message[], updatedAt }
// (covered by the existing recursive /users/{uid}/** security rule.)
//
// NOTE: this is the storage + streaming foundation only. AI replies are NOT
// generated here yet — the caller wires the model in later.

import { doc, collection, getDocs, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { makeId } from '../utils/storage.js'

const CHATS_KEY = 'aifc.chats'

// Build a message record. Plain numbers/strings so it persists cleanly to both
// localStorage and Firestore.
export function makeMessage(role, text) {
  return { id: makeId(), role, text: String(text), at: new Date().toISOString() }
}

function safeParse(raw, fallback) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// ---------- localStorage (Demo mode) ----------
export function loadLocalChats() {
  const parsed = safeParse(localStorage.getItem(CHATS_KEY), {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

export function loadLocalChat(deckId) {
  return loadLocalChats()[deckId]?.messages || []
}

export function saveLocalChat(deckId, messages) {
  const all = loadLocalChats()
  all[deckId] = { messages, updatedAt: new Date().toISOString() }
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(all))
  } catch {
    /* ignore quota errors */
  }
}

export function deleteLocalChat(deckId) {
  const all = loadLocalChats()
  if (all[deckId]) {
    delete all[deckId]
    localStorage.setItem(CHATS_KEY, JSON.stringify(all))
  }
}

export function clearLocalChats() {
  localStorage.removeItem(CHATS_KEY)
}

// ---------- Firestore (signed in) ----------
function chatDoc(uid, deckId) {
  return doc(db, 'users', uid, 'chats', deckId)
}

// Subscribe to one deck's conversation in realtime. Returns an unsubscribe fn.
export function subscribeToChat(uid, deckId, onData, onError) {
  return onSnapshot(
    chatDoc(uid, deckId),
    (snap) => onData(snap.exists() ? snap.data().messages || [] : []),
    (error) => {
      console.error('[Flashcards] Failed to load chat from Firestore:', error)
      if (onError) onError(error)
    },
  )
}

export function saveChat(uid, deckId, messages) {
  return setDoc(chatDoc(uid, deckId), { messages, updatedAt: new Date().toISOString() })
}

// Load ALL of a user's conversations as a { [deckId]: { messages } } map. Used
// by the Learning Intelligence engine to analyze AI interactions. Best-effort:
// returns {} on failure so the dashboard degrades gracefully.
export async function loadAllChats(uid) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'chats'))
    const all = {}
    snap.forEach((d) => {
      all[d.id] = { messages: d.data().messages || [] }
    })
    return all
  } catch (e) {
    console.error('[Flashcards] Failed to load conversations for insights:', e)
    return {}
  }
}

export function deleteChat(uid, deckId) {
  return deleteDoc(chatDoc(uid, deckId))
}

// One-time migration of Demo-mode conversations into Firestore after sign-in.
// Idempotent — each conversation is written under its existing deck id.
export async function migrateLocalChats(uid, chatsMap) {
  const entries = Object.entries(chatsMap || {})
  if (!entries.length) return 0
  await Promise.all(entries.map(([deckId, v]) => saveChat(uid, deckId, v?.messages || [])))
  return entries.length
}

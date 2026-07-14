// AI Study Assistant — per-deck / per-PDF chat sessions.
//
// Every deck (topic or uploaded PDF) has its own conversation, keyed by deck id.
//   Message = { id, role: 'user' | 'assistant', text, at }   (at = ISO string)
//
// Demo mode keeps all conversations in a single localStorage object:
//   aifc.chats = { [deckId]: { messages: Message[], updatedAt } }
//
// Signed-in users get one Firestore *subcollection* per conversation:
//   users/{uid}/chats/{deckId}                       -> { updatedAt }   (metadata)
//   users/{uid}/chats/{deckId}/messages/{msgId}      -> { id, role, text, at }
//
// Storing each message as its own document keeps writes small and lets a
// conversation grow to any length. The earlier design put the whole messages
// array in a single doc, which fails silently once it crosses Firestore's hard
// 1 MB per-document limit. Legacy single-doc chats are migrated to the
// subcollection on first read (see migrateChatDocIfNeeded), and reads fall back
// to the legacy array so nothing is lost in the meantime.
// (All paths are covered by the existing recursive /users/{uid}/** rule.)

import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { makeId } from '../utils/storage.js'

const CHATS_KEY = 'aifc.chats'

// Firestore writeBatch caps at 500 operations; stay comfortably under it.
const BATCH_LIMIT = 450

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

// Split an array into chunks of at most `size`.
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Coerce a stored/legacy message into the canonical shape with a stable id.
function normalizeMessage(m) {
  const id = m?.id || makeId()
  return {
    id,
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    text: String(m?.text ?? ''),
    at: m?.at || new Date().toISOString(),
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

function messagesCol(uid, deckId) {
  return collection(db, 'users', uid, 'chats', deckId, 'messages')
}

function messageDoc(uid, deckId, msgId) {
  return doc(db, 'users', uid, 'chats', deckId, 'messages', msgId)
}

// Move a legacy single-doc chat ({ messages: [...] }) into the messages
// subcollection, then drop the inline array so it is never migrated twice.
// Idempotent: message docs are keyed by message id, and an already-migrated doc
// (no inline array) is a no-op. Safe to call before every subscribe.
async function migrateChatDocIfNeeded(uid, deckId) {
  const ref = chatDoc(uid, deckId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data() || {}
  const legacy = Array.isArray(data.messages) ? data.messages : null
  if (!legacy || !legacy.length) return

  for (const group of chunk(legacy, BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const raw of group) {
      const m = normalizeMessage(raw)
      batch.set(messageDoc(uid, deckId, m.id), m)
    }
    await batch.commit()
  }
  // Overwrite the parent doc without the inline `messages` array.
  await setDoc(ref, {
    updatedAt: data.updatedAt || new Date().toISOString(),
    schemaVersion: 2,
  })
}

// Subscribe to one deck's conversation in realtime. Returns an unsubscribe fn.
// Migrates a legacy single-doc chat first (best-effort), then streams the
// messages subcollection ordered chronologically.
export function subscribeToChat(uid, deckId, onData, onError) {
  let unsubscribe = () => {}
  let cancelled = false

  ;(async () => {
    try {
      await migrateChatDocIfNeeded(uid, deckId)
    } catch (error) {
      console.error('[Flashcards] Failed to migrate chat to subcollection:', error)
    }
    if (cancelled) return
    unsubscribe = onSnapshot(
      query(messagesCol(uid, deckId), orderBy('at')),
      (snap) => onData(snap.docs.map((d) => d.data())),
      (error) => {
        console.error('[Flashcards] Failed to load chat from Firestore:', error)
        if (onError) onError(error)
      },
    )
  })()

  return () => {
    cancelled = true
    unsubscribe()
  }
}

// Append messages to a conversation. Each message becomes its own small doc,
// keyed by message id so re-appending the same message is idempotent. Callers
// pass only the newly added messages, keeping every write tiny regardless of how
// long the conversation gets.
export async function appendChatMessages(uid, deckId, messages) {
  const list = (messages || []).map(normalizeMessage)
  if (!list.length) return
  for (const group of chunk(list, BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const m of group) batch.set(messageDoc(uid, deckId, m.id), m)
    await batch.commit()
  }
  // Touch the parent doc so the conversation shows up in listings (loadAllChats)
  // and carries a fresh updatedAt. Merge so we never clobber other fields.
  await setDoc(chatDoc(uid, deckId), { updatedAt: new Date().toISOString() }, { merge: true })
}

// Load one conversation's messages (chronological). Falls back to a legacy
// inline array for chats that have not been migrated yet.
export async function loadChatMessages(uid, deckId) {
  const snap = await getDocs(query(messagesCol(uid, deckId), orderBy('at')))
  if (!snap.empty) return snap.docs.map((d) => d.data())
  const parent = await getDoc(chatDoc(uid, deckId))
  const legacy = parent.exists() ? parent.data().messages : null
  return Array.isArray(legacy) ? legacy : []
}

// Load ALL of a user's conversations as a { [deckId]: { messages } } map. Used
// by the Learning Intelligence engine to analyze AI interactions. Best-effort:
// returns {} on failure so the dashboard degrades gracefully.
export async function loadAllChats(uid) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'chats'))
    const all = {}
    await Promise.all(
      snap.docs.map(async (d) => {
        // Prefer the subcollection; fall back to a legacy inline array.
        const msgsSnap = await getDocs(query(messagesCol(uid, d.id), orderBy('at')))
        let messages = msgsSnap.docs.map((m) => m.data())
        if (!messages.length && Array.isArray(d.data().messages)) messages = d.data().messages
        all[d.id] = { messages }
      }),
    )
    return all
  } catch (e) {
    console.error('[Flashcards] Failed to load conversations for insights:', e)
    return {}
  }
}

// Delete a conversation: its messages subcollection first, then the parent doc.
export async function deleteChat(uid, deckId) {
  const snap = await getDocs(messagesCol(uid, deckId))
  for (const group of chunk(snap.docs, BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const d of group) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(chatDoc(uid, deckId))
}

// One-time migration of Demo-mode conversations into Firestore after sign-in.
// Idempotent — messages are keyed by id, so re-running writes the same docs.
export async function migrateLocalChats(uid, chatsMap) {
  const entries = Object.entries(chatsMap || {})
  if (!entries.length) return 0
  await Promise.all(entries.map(([deckId, v]) => appendChatMessages(uid, deckId, v?.messages || [])))
  return entries.length
}

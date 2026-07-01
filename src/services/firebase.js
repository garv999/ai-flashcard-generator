// Firebase initialisation for the AI Flashcard Generator.
//
// Config is read from Vite env vars (see .env.example). The same pattern and
// Firebase project are reused from the SecureAuth-OTP project. Only the pieces
// this app needs are exported: Auth (Google + Email/Password) and Firestore.
// Phone authentication is intentionally NOT set up here.

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

// Fail loudly (but gracefully) if the environment is not configured.
const missingVars = requiredEnvVars.filter((name) => !import.meta.env[name])
if (missingVars.length > 0) {
  console.error(
    `[Flashcards] Missing Firebase configuration: ${missingVars.join(', ')}. ` +
      'Copy .env.example to .env and fill in your Firebase values.',
  )
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

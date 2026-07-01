import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../services/firebase'
import { AuthContext } from './AuthContext'

// Slim auth provider for the flashcard app.
// Supports Google Sign-In, Email/Password sign-up + login, and logout.
// (No phone auth — intentionally omitted.)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // authReady = the initial auth state has been resolved (avoids UI flicker
  // between "logged out" and "logged in" on first load).
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthReady(true)
    })
    return () => unsubscribe()
  }, [])

  const loginWithGoogle = useCallback(async () => {
    const { user: u } = await signInWithPopup(auth, googleProvider)
    return u
  }, [])

  const loginWithEmail = useCallback(async (email, password) => {
    const { user: u } = await signInWithEmailAndPassword(auth, email, password)
    return u
  }, [])

  const signUpWithEmail = useCallback(async (email, password) => {
    const { user: u } = await createUserWithEmailAndPassword(auth, email, password)
    return u
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
  }, [])

  const value = useMemo(
    () => ({
      user,
      authReady,
      isAuthenticated: !!user,
      loginWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      logout,
    }),
    [user, authReady, loginWithGoogle, loginWithEmail, signUpWithEmail, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

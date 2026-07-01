import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { friendlyAuthError } from '../utils/authErrors.js'
import { CloseIcon, GoogleIcon, AlertIcon } from './Icons.jsx'

// Login / Sign-up modal. Matches the app's existing modal design.
export default function AuthModal({ onClose }) {
  const { loginWithEmail, signUpWithEmail, loginWithGoogle } = useAuth()

  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false) // 'email' | 'google' | false
  const closeRef = useRef(null)

  const isLogin = mode === 'login'

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError('')
    setBusy('email')
    try {
      if (isLogin) {
        await loginWithEmail(email.trim(), password)
      } else {
        await signUpWithEmail(email.trim(), password)
      }
      onClose()
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    if (busy) return
    setError('')
    setBusy('google')
    try {
      await loginWithGoogle()
      onClose()
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="auth-title">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={!!busy}
          >
            <CloseIcon />
          </button>
        </div>

        <p className="auth-sub">
          Sign in to save your flashcard decks to the cloud and sync them across devices.
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLogin}
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Sign up
          </button>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogle}
          disabled={!!busy}
        >
          {busy === 'google' ? (
            <span className="spinner spinner-sm" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          <span>Continue with Google</span>
        </button>

        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailSubmit} noValidate>
          <label className="field-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            className="text-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!busy}
          />

          <label className="field-label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            className="text-input"
            placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!!busy}
          />

          {error && (
            <div className="banner error auth-error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn-primary auth-submit" disabled={!!busy}>
            {busy === 'email' ? (
              <>
                <span className="spinner spinner-sm" aria-hidden="true" />
                {isLogin ? 'Logging in…' : 'Creating account…'}
              </>
            ) : isLogin ? (
              'Log in'
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            className="auth-link"
            onClick={() => switchMode(isLogin ? 'signup' : 'login')}
            disabled={!!busy}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}

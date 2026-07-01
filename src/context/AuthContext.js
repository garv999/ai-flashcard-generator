import { createContext } from 'react'

// Holds the current user, auth-ready flag, and the auth actions
// (Google sign-in, email sign-up/login, logout). Consumed via useAuth().
export const AuthContext = createContext(null)

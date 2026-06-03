// src/context/AuthContext.jsx
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { tokenStorage } from '../services/api'

// ── JWT helpers ────────────────────────────────────────────────────────────
function decodePayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

function isExpired(payload) {
  if (!payload?.exp) return true
  return Date.now() / 1000 > payload.exp
}

// ── Context shape ──────────────────────────────────────────────────────────
const AuthContext = createContext(null)

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      const decoded = decodePayload(urlToken)
      if (decoded && !isExpired(decoded)) {
        tokenStorage.set(urlToken)
        return urlToken
      }
    }
    return tokenStorage.get()
  })

  const [payload, setPayload] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      const decoded = decodePayload(urlToken)
      if (decoded && !isExpired(decoded)) {
        return decoded
      }
    }
    const t = tokenStorage.get()
    if (!t) return null
    const p = decodePayload(t)
    return p && !isExpired(p) ? p : null
  })

  // On mount: clear token from URL bar if it was present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('token')) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  // Expose a setter so portal pages can manually call setToken when needed
  const setToken = useCallback((newToken) => {
    if (!newToken) {
      tokenStorage.clear()
      setTokenState(null)
      setPayload(null)
      return
    }
    const decoded = decodePayload(newToken)
    if (!decoded || isExpired(decoded)) return
    tokenStorage.set(newToken)
    setTokenState(newToken)
    setPayload(decoded)
  }, [])

  const logout = useCallback(() => {
    tokenStorage.clear()
    setTokenState(null)
    setPayload(null)
  }, [])

  // Derived values every consumer needs
  const role           = payload?.role  ?? null
  const userId         = payload?.sub   ?? null
  const activeStage    = payload?.stage ?? null
  const isPortalUser   = role === 'evaluator' || role === 'participant' || role === 'mentor'
  const authenticated  = !!(token && payload && !isExpired(payload))

  return (
    <AuthContext.Provider
      value={{
        token,
        payload,
        role,
        userId,
        activeStage,
        isPortalUser,
        authenticated,
        setToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Consumer hook ─────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
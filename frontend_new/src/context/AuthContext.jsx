// src/context/AuthContext.jsx
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { tokenStorage, orgStorage, authApi } from '../services/api'

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

  // Organization state
  const [activeOrganization, setActiveOrganization] = useState(null)
  const [availableOrganizations, setAvailableOrganizations] = useState([])
  const [activeMembership, setActiveMembership] = useState(null)

  // On mount: clear token from URL bar if it was present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('token')) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  // Listen for forced logout from the refresh interceptor
  useEffect(() => {
    const handleForcedLogout = () => {
      setTokenState(null)
      setPayload(null)
      setActiveOrganization(null)
      setAvailableOrganizations([])
      setActiveMembership(null)
    }
    window.addEventListener('auth:logout', handleForcedLogout)
    return () => window.removeEventListener('auth:logout', handleForcedLogout)
  }, [])

  // Load organizations after login
  const loadOrganizations = useCallback(async () => {
    try {
      const orgs = await authApi.myOrganizations()
      const orgList = Array.isArray(orgs) ? orgs : []
      setAvailableOrganizations(orgList)
      
      // Restore previously active org or pick the first
      const savedOrgId = orgStorage.get()
      const restored = orgList.find((o) => o.id === savedOrgId)
      const active = restored || orgList[0] || null
      
      if (active) {
        setActiveOrganization(active)
        orgStorage.set(active.id)
        // Find membership role (the backend returns this organization because the user is a member)
        setActiveMembership({ role: 'owner' }) // Will be refined from /me or dedicated endpoint
      }
    } catch {
      // User may be a portal user without org membership — that's fine
      setAvailableOrganizations([])
      setActiveOrganization(null)
    }
  }, [])

  // Auto-load orgs when we have a valid non-portal token
  useEffect(() => {
    if (token && payload && !isExpired(payload) && payload.typ === 'access') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadOrganizations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Expose a setter so portal pages can manually call setToken when needed
  const setToken = useCallback((newToken) => {
    if (!newToken) {
      tokenStorage.clear()
      orgStorage.clear()
      sessionStorage.removeItem('eventos_refresh_token')
      setTokenState(null)
      setPayload(null)
      setActiveOrganization(null)
      setAvailableOrganizations([])
      setActiveMembership(null)
      return
    }
    const decoded = decodePayload(newToken)
    if (!decoded || isExpired(decoded)) return
    tokenStorage.set(newToken)
    setTokenState(newToken)
    setPayload(decoded)
  }, [])

  // Store both access + refresh tokens (called after login/refresh)
  const setAuthTokens = useCallback((accessToken, refreshToken) => {
    if (refreshToken) {
      sessionStorage.setItem('eventos_refresh_token', refreshToken)
    }
    // Delegate to setToken for access token
    if (accessToken) {
      const decoded = decodePayload(accessToken)
      if (decoded && !isExpired(decoded)) {
        tokenStorage.set(accessToken)
        setTokenState(accessToken)
        setPayload(decoded)
      }
    }
  }, [])

  // Switch active organization
  const switchOrganization = useCallback((org) => {
    setActiveOrganization(org)
    orgStorage.set(org.id)
    // Note: The consuming component should invalidate React Query caches
  }, [])

  // Logout — call backend then clear local state
  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Backend may already be unreachable — clear local state anyway
    }
    tokenStorage.clear()
    orgStorage.clear()
    sessionStorage.removeItem('eventos_refresh_token')
    setTokenState(null)
    setPayload(null)
    setActiveOrganization(null)
    setAvailableOrganizations([])
    setActiveMembership(null)
  }, [])

  // Derived values every consumer needs
  const role           = payload?.role  ?? null
  const userId         = payload?.sub   ?? null
  const activeStage    = payload?.stage ?? null
  const isPortalUser   = role === 'evaluator' || role === 'participant' || role === 'mentor'
  const authenticated  = !!(token && payload && !isExpired(payload))
  const isAdmin        = !!(activeOrganization && activeMembership && 
                           (activeMembership.role === 'owner' || activeMembership.role === 'admin'))

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
        isAdmin,
        setToken,
        setAuthTokens,
        logout,
        // Organization
        activeOrganization,
        availableOrganizations,
        activeMembership,
        switchOrganization,
        loadOrganizations,
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
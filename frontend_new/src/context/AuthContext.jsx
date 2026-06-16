// src/context/AuthContext.jsx
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { tokenStorage, orgStorage, eventStorage, authApi, eventsApi } from '../services/api'

import { queryClient } from '../queryClient'

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
  const [membershipsByOrgId, setMembershipsByOrgId] = useState({})
  const [orgsLoaded, setOrgsLoaded] = useState(false)

  // Event state — now REACTIVE (previously only persisted to localStorage, which
  // is why selecting an event never propagated to child components).
  const [activeEvent, setActiveEventState] = useState(null)
  const [availableEvents, setAvailableEvents] = useState([])
  const [eventsLoaded, setEventsLoaded] = useState(false)

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
      setActiveEventState(null)
      setAvailableEvents([])
    }
    window.addEventListener('auth:logout', handleForcedLogout)
    return () => window.removeEventListener('auth:logout', handleForcedLogout)
  }, [])

  // Load the active org's events into React state (and keep eventStorage in sync
  // so api.js eventPath() resolves). Restores the previously-selected event if it
  // still exists, otherwise falls back to the first event.
  const loadEvents = useCallback(async () => {
    setEventsLoaded(false)
    try {
      const events = await eventsApi.list()
      const list = Array.isArray(events) ? events : []
      setAvailableEvents(list)
      const savedEventId = eventStorage.get()
      const active = list.find((e) => e.id === savedEventId) || list[0] || null
      setActiveEventState(active)
      if (active) eventStorage.set(active.id)
      else eventStorage.clear()
    } catch {
      setAvailableEvents([])
      setActiveEventState(null)
      eventStorage.clear()
    } finally {
      setEventsLoaded(true)
    }
  }, [])

  // Load organizations after login
  const loadOrganizations = useCallback(async () => {
    setOrgsLoaded(false)
    try {
      const result = await authApi.myOrganizations()
        const list = Array.isArray(result) ? result : []

      const orgList = list.map((r) => r.organization)
      setAvailableOrganizations(orgList)

      const membershipMap = {}
      list.forEach((r) => {
        membershipMap[r.organization.id] = r.membership
      })
      setMembershipsByOrgId(membershipMap)

      const savedOrgId = orgStorage.get()
      const restoredIdx = list.findIndex(
        (r) => r.organization.id === savedOrgId
      )
      const activeIdx = restoredIdx >= 0 ? restoredIdx : 0
      const activeEntry = list[activeIdx] || null

      if (activeEntry) {
        setActiveOrganization(activeEntry.organization)
        setActiveMembership(activeEntry.membership)
        orgStorage.set(activeEntry.organization.id)
        await loadEvents()
      } else {
        setActiveOrganization(null)
        setActiveMembership(null)
        setAvailableEvents([])
        setActiveEventState(null)
        setEventsLoaded(true)
      }
    } catch {
      // User may be a portal user without org membership — that's fine
      setAvailableOrganizations([])
      setMembershipsByOrgId({})
      setActiveOrganization(null)
      setActiveMembership(null)
      setAvailableEvents([])
      setActiveEventState(null)
      setEventsLoaded(true)
    } finally {
      setOrgsLoaded(true)
    }
  }, [loadEvents])

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
  const setAuthTokens = useCallback((accessToken) => {
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
  const switchOrganization = useCallback(async (org) => {
    setActiveOrganization(org)
    setActiveMembership(membershipsByOrgId[org.id] || null)
    orgStorage.set(org.id)
    eventStorage.clear()
    setActiveEventState(null)
    setAvailableEvents([])
    // Drop all cached query data so the new organization's screens
    // don't briefly show the previous organization's data.
    queryClient.clear()
    await loadEvents()
  }, [membershipsByOrgId, loadEvents])

  // Switch active event — REACTIVE. Updates React state (so children re-render),
  // persists to eventStorage (so api.js eventPath() resolves), and clears cached
  // query data so event-scoped screens refetch for the new event.
  const switchEvent = useCallback((event) => {
    if (!event) return
    setActiveEventState(event)
    eventStorage.set(event.id)
    queryClient.clear()
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
    eventStorage.clear()
    setTokenState(null)
    setPayload(null)
    setActiveOrganization(null)
    setAvailableOrganizations([])
    setActiveMembership(null)
    setActiveEventState(null)
    setAvailableEvents([])
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
        orgsLoaded,
        // Event (reactive)
        activeEvent,
        availableEvents,
        eventsLoaded,
        switchEvent,
        loadEvents,
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
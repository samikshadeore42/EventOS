// src/services/api.js
// Central Axios configuration. Every backend endpoint is exposed here as a
// named domain module. Import only what you need in each component.

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SESSION_KEY = 'eventos_token'
const ORG_KEY = 'eventos_active_org_id'
const EVENT_KEY = 'eventos_active_event_id'

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Public auth paths that should NOT receive organization headers
const PUBLIC_AUTH_PATHS = [
  '/auth/login', '/auth/register-organization', '/auth/forgot-password',
  '/auth/reset-password', '/auth/verify-email', '/auth/resend-verification',
  '/auth/refresh', '/auth/invitations',
]

function isPublicAuthPath(url) {
  return PUBLIC_AUTH_PATHS.some((p) => url?.startsWith(p))
}

// ── Request interceptor ───────────────────────────────────────────────────
// Injects:
//   1. Authorization: Bearer <token> — for authenticated requests
//   2. X-Organization-Id             — for org-scoped admin requests
//   3. ?token= query param           — for portal/evaluation routes
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem(SESSION_KEY)
    if (!token) return config

    // Always attach as Bearer header
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`

    // Attach organization context for admin API calls (not public auth)
    if (!isPublicAuthPath(config.url)) {
      const orgId = localStorage.getItem(ORG_KEY)
      if (orgId) {
        config.headers['X-Organization-Id'] = orgId
      }
    }

    // Also inject as query param for the two portal-facing endpoint groups
    const needsQueryToken =
      config.url?.includes('/portal/access') ||
      config.url?.includes('/evaluations') ||
      config.url?.includes('/mentor-portal/') ||
      config.url?.includes('/participant-mentor-info') ||
      config.url?.includes('/submissions')

    if (needsQueryToken) {
      config.params = { ...config.params, token }
    }

    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor ─────────────────────────────────────────────────
// 1. Unwraps .data so callers get the payload directly (not the Axios response shell).
// 2. On 401 — attempts a single-flight token refresh, then retries the original request.
// 3. Normalises error messages to a plain Error instance.
let refreshPromise = null

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status

    // Auto-refresh on 401 (not for auth endpoints themselves)
    if (status === 401 && !originalRequest._retry && !isPublicAuthPath(originalRequest.url) && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true

      // Single-flight: only one refresh at a time
      if (!refreshPromise) {
        refreshPromise = api.post('/auth/refresh', {})
          .then((res) => {
            const data = res?.data || res
            sessionStorage.setItem(SESSION_KEY, data.access_token)
            return data.access_token
          })
          .catch((refreshError) => {
            // Refresh failed — clear local auth state
            sessionStorage.removeItem(SESSION_KEY)
            localStorage.removeItem(ORG_KEY)
            window.dispatchEvent(new Event('auth:logout'))
            return Promise.reject(refreshError)
          })
          .finally(() => {
            refreshPromise = null
          })
      }

      if (refreshPromise) {
        try {
          const newToken = await refreshPromise
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`
          return api(originalRequest)
        } catch {
          // Refresh failed, fall through to error
        }
      }
    }

    // Extract error detail (supports structured {code, message} and string detail)
    const detail = error.response?.data?.detail
    let message
    if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
      // Structured error like {code: "EMAIL_VERIFICATION_REQUIRED", message: "..."}
      message = detail.message || detail.code || JSON.stringify(detail)
    } else if (typeof detail === 'string') {
      message = detail
    } else if (Array.isArray(detail)) {
      message = detail.map((d) => d.msg).join('; ')
    } else {
      message = error.message || 'An unexpected error occurred'
    }
    return Promise.reject(new Error(message))
  }
)

// ── Token helpers (used by AuthContext) ───────────────────────────────────
export const tokenStorage = {
  get:    ()      => sessionStorage.getItem(SESSION_KEY),
  set:    (token) => sessionStorage.setItem(SESSION_KEY, token),
  clear:  ()      => sessionStorage.removeItem(SESSION_KEY),
}

// ── Organization helpers (used by AuthContext) ────────────────────────────
export const orgStorage = {
  get:    ()       => localStorage.getItem(ORG_KEY),
  set:    (orgId)  => localStorage.setItem(ORG_KEY, orgId),
  clear:  ()       => localStorage.removeItem(ORG_KEY),
}

export const eventStorage = {
  get:    ()        => localStorage.getItem(EVENT_KEY),
  set:    (eventId) => localStorage.setItem(EVENT_KEY, eventId),
  clear:  ()        => localStorage.removeItem(EVENT_KEY),
}

function eventPath(path) {
  const eventId = eventStorage.get()
  if (!eventId) {
    throw new Error('Select an event before using event-specific features.')
  }
  return `/events/${eventId}${path}`
}

function decodeJwtPayload(token) {
  if (!token) return {}

  try {
    const payload = token.split('.')[1]
    if (!payload) return {}

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(window.atob(normalized))
  } catch {
    return {}
  }
}

function eventIdFromPortalToken(explicitToken) {
  const token = explicitToken || tokenStorage.get()
  const eventId = decodeJwtPayload(token)?.event_id

  if (!eventId) {
    throw new Error('This portal link is missing its event context.')
  }

  return eventId
}

function portalEventPath(path, explicitToken) {
  return `/events/${eventIdFromPortalToken(explicitToken)}${path}`
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// ═════════════════════════════════════════════════════════════════════════
// DOMAIN API MODULES
// ═════════════════════════════════════════════════════════════════════════

// ── Authentication ────────────────────────────────────────────────────────
export const authApi = {
  login: (data) =>
    api.post('/auth/login', data),

  registerOrganization: (data) =>
    api.post('/auth/register-organization', data),

  verifyEmail: (token) =>
    api.post(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (data) =>
    api.post('/auth/resend-verification', data),

  forgotPassword: (data) =>
    api.post('/auth/forgot-password', data),

  resetPassword: (data) =>
    api.post('/auth/reset-password', data),

  refresh: (data) =>
    api.post('/auth/refresh', data),

  logout: () =>
    api.post('/auth/logout'),

  logoutAll: () =>
    api.post('/auth/logout-all'),

  me: () =>
    api.get('/auth/me'),

  myOrganizations: () =>
    api.get('/organizations'),
}

// ── Organizations ─────────────────────────────────────────────────────────
export const organizationsApi = {
  update: (id, data) =>
    api.patch(`/organizations/${id}`, data),
    
  members: (id) =>
    api.get(`/organizations/${id}/members`),
    
  updateMemberRole: (orgId, memberId, role) =>
    api.patch(`/organizations/${orgId}/members/${memberId}/role`, undefined, { params: { role } }),
    
  setMemberStatus: (orgId, memberId, status) =>
    api.patch(`/organizations/${orgId}/members/${memberId}/status`, undefined, { params: { status } }),
    
  invitations: (id) =>
    api.get(`/organizations/${id}/invitations`),
    
  invite: (id, data) =>
    api.post(`/organizations/${id}/invitations`, data),
    
  revokeInvitation: (orgId, invId) =>
    api.delete(`/organizations/${orgId}/invitations/${invId}`),
    
  preview: (token) =>
    api.get(`/auth/invitations/${token}`),

  accept: (token) =>
    api.post(`/auth/invitations/${token}/accept`),

  registerViaInvitation: (token, data) =>
    api.post(`/auth/invitations/${token}/register`, data),
}

// ── Invitations (public auth routes) ───────────────────────────────────────
export const invitationsApi = {
  preview: (token) =>
    api.get(`/auth/invitations/${token}`),

  accept: (token) =>
    api.post(`/auth/invitations/${token}/accept`),

  registerViaInvitation: (token, data) =>
    api.post(`/auth/invitations/${token}/register`, data),
}

// ── Participants ──────────────────────────────────────────────────────────

export const eventsApi = {
  list: () => api.get('/events'),
  create: (data) => api.post('/events', data),
  templates: () => api.get('/templates'),
}

export const participantsApi = {
  list: (params = {}) =>
    api.get(eventPath('/participants'), { params }),

  get: (id) =>
    api.get(eventPath(`/participants/${id}`)),

  create: (data) =>
    api.post(eventPath('/participants'), data),

  update: (id, data) =>
    api.patch(eventPath(`/participants/${id}`), data),

  remove: (id) =>
    api.delete(eventPath(`/participants/${id}`)),

  // Returns a Promise that resolves to the upload result with per-row breakdown
  upload: (file, upsert = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${eventPath('/participants/upload')}?upsert=${upsert}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  summary: () =>
    api.get(eventPath('/participants/roster/summary')),

  // Returns a direct URL string (not a Promise) — use as <a href> or window.location
  csvTemplateUrl: () => `${BASE_URL}${eventPath('/participants/csv-template')}`,
}

// ── Solver ────────────────────────────────────────────────────────────────
export const solverApi = {
  // Enqueue solver task; returns { task_id, status_url, message }
  run: (config) =>
    api.post(eventPath('/solver/run'), { config }),

  // Poll this until status === 'success' or 'failed'
  taskStatus: (taskId) =>
    api.get(`/tasks/${taskId}/status`),

  // Fetch draft lineups once task is successful
  drafts: (taskId) =>
    api.get(eventPath(`/solver/drafts/${taskId}`)),

  // Persist solver output to the DB (creates Team rows → approval queue)
  commit: (taskId) =>
    api.post(eventPath(`/solver/commit/${taskId}`)),
}

// ── Approvals ─────────────────────────────────────────────────────────────
export const approvalsApi = {
  pending: () =>
    api.get(eventPath('/approvals/pending')),

  all: () =>
    api.get(eventPath('/approvals/teams')),

  detail: (id) =>
    api.get(eventPath(`/approvals/teams/${id}`)),

  // decision: 'approve' | 'reject'
  decide: (id, decision, notes = '') =>
    api.post(eventPath(`/approvals/${id}/decision`), { decision, notes }),

  bulk: (decision, notes = '') =>
    api.post(eventPath('/approvals/bulk-decision'), { decision, notes }),

  publish: () =>
    api.post(eventPath('/approvals/publish'),),
}

// ── Evaluators ────────────────────────────────────────────────────────────
export const evaluatorsApi = {
  list: () =>
    api.get(eventPath('/evaluators'),),

  create: (data) =>
    api.post(eventPath('/evaluators'), data),

  get: (id) =>
    api.get(eventPath(`/evaluators/${id}`)),

  update: (id, data) =>
    api.patch(eventPath(`/evaluators/${id}`), data),

  remove: (id) =>
    api.delete(eventPath(`/evaluators/${id}`)),

  sendLink: (id, stage = 'evaluation') =>
    api.post(eventPath(`/evaluators/${id}/send-access-link?stage=${stage}`)),

  assign: (data) =>
    api.post(eventPath('/evaluators/assign'), data),

  assignments: (evaluatorId) =>
    api.get(eventPath(`/evaluators/${evaluatorId}/assignments`)),

  downloadTemplate: async () => {
    const blob = await api.get(eventPath('/evaluators/csv-template'), { responseType: 'blob' })
    downloadBlob(blob, 'evaluators_template.csv')
  },

  importCsv: (file, upsert = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${eventPath('/evaluators/import')}?upsert=${upsert}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  downloadExport: async () => {
    const blob = await api.get(eventPath('/evaluators/export'), { responseType: 'blob' })
    downloadBlob(blob, 'evaluators_export.csv')
  },
}

// ── Evaluations (judge scorecard submission) ──────────────────────────────
export const evaluationsApi = {
  // Token is injected as ?token= by the request interceptor
  submit: (data) =>
    api.post(eventPath('/evaluations'), data),

  update: (id, data) =>
    api.patch(eventPath(`/evaluations/${id}`), data),

  teamScores: (teamId) =>
    api.get(eventPath(`/evaluations/team/${teamId}`)),

  flagged: () =>
    api.get(eventPath('/evaluations/flagged')),
}

// ── Leaderboard ───────────────────────────────────────────────────────────
export const leaderboardApi = {
  get: () =>
    api.get(eventPath('/leaderboard'),),

  anomalies: () =>
    api.get(eventPath('/leaderboard/anomalies'),),

  override: (id) =>
    api.post(eventPath(`/leaderboard/anomalies/${id}/override`),),

  overrideAll: () =>
    api.post(eventPath('/leaderboard/anomalies/override-all'),),
}

// ── Portal (JWT-based participant & judge access) ──────────────────────────
export const portalApi = {
  access: (explicitToken) => {
    const params = explicitToken ? { token: explicitToken } : {}
    return api.get(portalEventPath('/portal/access', explicitToken), { params })
  },

  generateLinks: (role, stage = 'evaluation', sendEmails = true) =>
    api.post(eventPath('/portal/generate-links'), null, {
      params: { role, stage, send_emails: sendEmails },
    }),
}

export const dailyUpdateApi = {
  submit: (token, data) =>
    api.post(`${portalEventPath('/daily-updates/submit', token)}?token=${encodeURIComponent(token)}`, data),

  myUpdates: (token) =>
    api.get(`${portalEventPath('/daily-updates/my-updates', token)}?token=${encodeURIComponent(token)}`),
}

export const healthDashboardApi = {
  teams: () => api.get(eventPath('/health-dashboard/teams')),
  team: (teamId) => api.get(eventPath(`/health-dashboard/team/${teamId}`)),
  refresh: () => api.post(eventPath('/health-dashboard/refresh')),
}

// ── Event configuration & pipeline state ──────────────────────────────────
export const eventApi = {
  config: () =>
    api.get(eventPath('/event/config'),),

  advanceStage: (stage) => {
    const params = stage ? { stage } : {}
    return api.patch(eventPath('/event/config/stage'), null, { params })
  },

  updateRules: (rules) =>
    api.patch(eventPath('/event/config/rules'), rules),
}

// ── Communication log ─────────────────────────────────────────────────────
export const commsApi = {
  log: (params = {}) =>
    api.get(eventPath('/communications'), { params }),
}

// ── AI / LLM drafting ─────────────────────────────────────────────────────
export const aiApi = {
  draft: (body) =>
    api.post('/ai/communication', body),

  draftResult: (taskId) =>
    api.get(`/ai/result/${taskId}`),

  teamRationale: (body) =>
    api.post('/ai/team-rationale', body),

  bulkRationale: () =>
    api.post('/ai/team-rationale/bulk'),

  // ADD THESE TWO:
  explainAnomaly: (body) =>
    api.post('/ai/explain-anomaly', body),

  getResult: (taskId) =>
    api.get(`/ai/result/${taskId}`),

  rubric: (body) =>
    api.post('/ai/rubric', body),

  health: () =>
    api.get('/ai/health'),
}

// ── Demo Admin Controls ───────────────────────────────────────────────────
export const demoAdminApi = {
  status: () =>
    api.get('/demo-admin/status'),

  reset: (confirm, preserveAdmins = true) =>
    api.post('/demo-admin/reset', { confirm, preserve_admins: preserveAdmins }),
}

// ── Event State (Hackathon stage) ─────────────────────────────────────────
export const eventStateApi = {
  get: () =>
    api.get(eventPath('/event-state')),

  setStage: (stage) =>
    api.post(eventPath('/event-state/set'), { stage }),

  next: () =>
    api.post(eventPath('/event-state/next'),),

  previous: () =>
    api.post(eventPath('/event-state/previous'),),

  reset: () =>
    api.post(eventPath('/event-state/reset'),),
}

// ── Mentor Operations ─────────────────────────────────────────────────────
export const mentorApi = {
  // Mentor management (admin)
  list:    ()        => api.get(eventPath('/mentors'),),
  create:  (data)    => api.post(eventPath('/mentors'), data),
  update:  (id, data)=> api.patch(eventPath(`/mentors/${id}`), data),
  remove:  (id)      => api.delete(eventPath(`/mentors/${id}`)),
  sendLink:(id)      => api.post(eventPath(`/mentors/${id}/send-access-link`),),

  // Assignments (admin)
  assignments:      ()   => api.get(eventPath('/mentor-assignments'),),
  assign:           (data)=> api.post(eventPath('/mentor-assignments'), data),
  unassign:         (id) => api.delete(eventPath(`/mentor-assignments/${id}`)),
  teamMentor:       (teamId) => api.get(eventPath(`/mentor-assignments/team/${teamId}`)),

  // Ops dashboard (admin)
  opsSummary:            () => api.get(eventPath('/mentor-ops/summary'),),
  riskTeams:             () => api.get(eventPath('/mentor-ops/risk-teams'),),
  teamsWithoutMentor:    () => api.get(eventPath('/mentor-ops/teams-without-mentor'),),
  teamsWithoutMeeting:   () => api.get(eventPath('/mentor-ops/teams-without-meeting'),),
  missingDailyUpdates:   () => api.get(eventPath('/mentor-ops/missing-daily-updates'),),
  assignmentSuggestions: () => api.get(eventPath('/mentor-ops/assignment-suggestions'),),
  sendDailyReminders:    () => api.post(eventPath('/mentor-ops/reminders/daily')),
  generateSummary: (teamId)=> api.post(eventPath('/mentor-ops/ai-summary'), { team_id: teamId }),

  // Mentor portal (token-auth)
  me:             () => api.get(portalEventPath('/mentor-portal/me')),
  myTeams:        () => api.get(portalEventPath('/mentor-portal/teams')),
  createSession:  (data) => api.post(portalEventPath('/mentor-portal/sessions'), data),
  updateSession:  (id, data) => api.patch(portalEventPath(`/mentor-portal/sessions/${id}`), data),
  cancelSession:  (id) => api.patch(portalEventPath(`/mentor-portal/sessions/${id}`), { status: 'cancelled' }),
  submitFeedback: (data) => api.post(portalEventPath('/mentor-portal/feedback'), data),
  teamFeedback:   (teamId) => api.get(portalEventPath(`/mentor-portal/feedback/team/${teamId}`)),

  // Participant-safe mentor info
  participantInfo: () => api.get(portalEventPath('/participant-mentor-info')),

  // Import/Export
  downloadTemplate: async () => {
    const blob = await api.get(eventPath('/mentors/csv-template'), { responseType: 'blob' })
    downloadBlob(blob, 'mentors_template.csv')
  },
  importCsv: (file, upsert = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${eventPath('/mentors/import')}?upsert=${upsert}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  downloadExport: async () => {
    const blob = await api.get(eventPath('/mentors/export'), { responseType: 'blob' })
    downloadBlob(blob, 'mentors_export.csv')
  },
}

// ── Risk Intelligence ──────────────────────────────────────────────────────
export const riskApi = {
  summary: () => api.get(eventPath('/risk/summary')),
  teams: () => api.get(eventPath('/risk/teams')),
  sweep: () => api.post(eventPath('/risk/sweep')),
  history: (teamId) => api.get(eventPath(`/risk/teams/${teamId}/history`)),
}

// ── System ─────────────────────────────────────────────────────────────────
export const systemApi = {
  health: () =>
    api.get('/health'),
}

// ── Submissions ────────────────────────────────────────────────────────────
export const submissionsApi = {
  /** Upload project ZIP (participant) — POST /submissions/participant/project */
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(eventPath('/submissions/participant/project'), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** Get participant's own team submission metadata */
  getParticipantProject: () =>
    api.get(eventPath('/submissions/participant/project'),),

  /** Get submission metadata for a team (judge) */
  getTeamSubmission: (teamId) =>
    api.get(eventPath(`/submissions/team/${teamId}`)),

  /** Download team ZIP (judge) — GET /submissions/team/{team_id}/download
   *  Returns a raw Axios response (not unwrapped) so caller can access the blob.
   */
  downloadTeamZip: (teamId) => {
    const token = sessionStorage.getItem(SESSION_KEY)
    return axios.get(`${BASE_URL}${eventPath(`/submissions/team/${teamId}/download`)}`, {
      params: { token },
      responseType: 'blob',
    })
  },
}

// ── LangGraph Event Configuration (Phase 5) ───────────────────────────────
// POST /ai/configure-event        — one chat turn with the agent
// POST /events/create-from-config — persist the final config as a real Event
export const langgraphApi = {
  /**
   * Send one message to the LangGraph conversational agent.
   * @param {string} message   — the user's text
   * @param {string} sessionId — stable UUID for this conversation (generate once on page load)
   * @returns {{ reply: string, is_complete: boolean, config: object|null }}
   */
  chat: (message, sessionId) =>
    api.post('/ai/configure-event', { message, session_id: sessionId }),

  /**
   * Save the completed config JSON as a real Event in the org.
   * Called only when is_complete=true and user clicks Confirm.
   * @param {object} config — the EventConfig object from the agent
   * @returns {{ event_id: string, event_name: string, status: string, message: string }}
   */
  createFromConfig: (config) =>
    api.post('/events/create-from-config', config),
}

// ── Stages & timeline (Phase 4–6) ───────────────────────────────
export const stagesApi = {
  list:     ()            => api.get(eventPath('/stages')),
  get:      (id)          => api.get(eventPath(`/stages/${id}`)),
  create:   (data)        => api.post(eventPath('/stages'), data),
  update:   (id, data)    => api.patch(eventPath(`/stages/${id}`), data),
  remove:   (id)          => api.delete(eventPath(`/stages/${id}`)),
  reorder:  (orderedIds)  => api.post(eventPath('/stages/reorder'), { ordered_ids: orderedIds }),
  validate: ()            => api.get(eventPath('/stages/validation')),
  runs:     ()            => api.get(eventPath('/stages/runs')),
  generateRuns: ()        => api.post(eventPath('/stages/runs/generate')),
  advance:  (id, force = false) => api.post(eventPath(`/stages/${id}/advance`), null, { params: { force } }),
  approve:  (id)          => api.post(eventPath(`/stages/${id}/approve`)),
}

// ── Event lifecycle (Phase 4 Hard Gate) ──────────────────────
export const eventLifecycleApi = {
  publish: () => api.post(eventPath('/publish')),
}

// ── Notifications (Phase 7) ──────────────────────────
export const notificationsApi = {
  list:        (unreadOnly = false) => api.get(eventPath('/notifications'), { params: { unread_only: unreadOnly } }),
  unreadCount: ()    => api.get(eventPath('/notifications/unread-count')),
  markRead:    (id)  => api.post(eventPath(`/notifications/${id}/read`)),
  markAllRead: ()    => api.post(eventPath('/notifications/read-all')),
}

export default api
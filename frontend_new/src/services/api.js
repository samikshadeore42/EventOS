// src/services/api.js
// Central Axios configuration. Every backend endpoint is exposed here as a
// named domain module. Import only what you need in each component.

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SESSION_KEY = 'eventos_token'
const ORG_KEY = 'eventos_active_org_id'

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
export const participantsApi = {
  list: (params = {}) =>
    api.get('/participants', { params }),

  get: (id) =>
    api.get(`/participants/${id}`),

  create: (data) =>
    api.post('/participants', data),

  update: (id, data) =>
    api.patch(`/participants/${id}`, data),

  remove: (id) =>
    api.delete(`/participants/${id}`),

  // Returns a Promise that resolves to the upload result with per-row breakdown
  upload: (file, upsert = false) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/participants/upload?upsert=${upsert}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  summary: () =>
    api.get('/participants/roster/summary'),

  // Returns a direct URL string (not a Promise) — use as <a href> or window.location
  csvTemplateUrl: () => `${BASE_URL}/participants/csv-template`,
}

// ── Solver ────────────────────────────────────────────────────────────────
export const solverApi = {
  // Enqueue solver task; returns { task_id, status_url, message }
  run: (config) =>
    api.post('/solver/run', { config }),

  // Poll this until status === 'success' or 'failed'
  taskStatus: (taskId) =>
    api.get(`/tasks/${taskId}/status`),

  // Fetch draft lineups once task is successful
  drafts: (taskId) =>
    api.get(`/solver/drafts/${taskId}`),

  // Persist solver output to the DB (creates Team rows → approval queue)
  commit: (taskId) =>
    api.post(`/solver/commit/${taskId}`),
}

// ── Approvals ─────────────────────────────────────────────────────────────
export const approvalsApi = {
  pending: () =>
    api.get('/approvals/pending'),

  all: () =>
    api.get('/approvals/teams'),

  detail: (id) =>
    api.get(`/approvals/teams/${id}`),

  // decision: 'approve' | 'reject'
  decide: (id, decision, notes = '') =>
    api.post(`/approvals/${id}/decision`, { decision, notes }),

  bulk: (decision, notes = '') =>
    api.post('/approvals/bulk-decision', { decision, notes }),

  publish: () =>
    api.post('/approvals/publish'),
}

// ── Evaluators ────────────────────────────────────────────────────────────
export const evaluatorsApi = {
  list: () =>
    api.get('/evaluators'),

  create: (data) =>
    api.post('/evaluators', data),

  get: (id) =>
    api.get(`/evaluators/${id}`),

  update: (id, data) =>
    api.patch(`/evaluators/${id}`, data),

  remove: (id) =>
    api.delete(`/evaluators/${id}`),

  sendLink: (id, stage = 'evaluation') =>
    api.post(`/evaluators/${id}/send-access-link?stage=${stage}`),

  assign: (data) =>
    api.post('/evaluators/assign', data),

  assignments: (evaluatorId) =>
    api.get(`/evaluators/${evaluatorId}/assignments`),
}

// ── Evaluations (judge scorecard submission) ──────────────────────────────
export const evaluationsApi = {
  // Token is injected as ?token= by the request interceptor
  submit: (data) =>
    api.post('/evaluations', data),

  update: (id, data) =>
    api.patch(`/evaluations/${id}`, data),

  teamScores: (teamId) =>
    api.get(`/evaluations/team/${teamId}`),

  flagged: () =>
    api.get('/evaluations/flagged'),
}

// ── Leaderboard ───────────────────────────────────────────────────────────
export const leaderboardApi = {
  get: () =>
    api.get('/leaderboard'),

  anomalies: () =>
    api.get('/leaderboard/anomalies'),

  override: (id) =>
    api.post(`/leaderboard/anomalies/${id}/override`),

  overrideAll: () =>
    api.post('/leaderboard/anomalies/override-all'),
}

// ── Portal (JWT-based participant & judge access) ──────────────────────────
export const portalApi = {
  // Token is injected as ?token= by interceptor when sessionStorage has it.
  // Also accepts explicit token arg for the first call before storage is set.
  access: (explicitToken) => {
    const params = explicitToken ? { token: explicitToken } : {}
    return api.get('/portal/access', { params })
  },

  generateLinks: (role, stage = 'evaluation', sendEmails = true) =>
    api.post('/portal/generate-links', null, {
      params: { role, stage, send_emails: sendEmails },
    }),
}

// ── Event configuration & pipeline state ──────────────────────────────────
export const eventApi = {
  config: () =>
    api.get('/event/config'),

  advanceStage: (stage) => {
    const params = stage ? { stage } : {}
    return api.patch('/event/config/stage', null, { params })
  },

  updateRules: (rules) =>
    api.patch('/event/config/rules', rules),
}

// ── Communication log ─────────────────────────────────────────────────────
export const commsApi = {
  log: (params = {}) =>
    api.get('/communications', { params }),
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
    api.get('/event-state'),

  setStage: (stage) =>
    api.post('/event-state/set', { stage }),

  next: () =>
    api.post('/event-state/next'),

  previous: () =>
    api.post('/event-state/previous'),

  reset: () =>
    api.post('/event-state/reset'),
}

// ── Mentor Operations ─────────────────────────────────────────────────────
export const mentorApi = {
  // Mentor management (admin)
  list:    ()        => api.get('/mentors'),
  create:  (data)    => api.post('/mentors', data),
  update:  (id, data)=> api.patch(`/mentors/${id}`, data),
  remove:  (id)      => api.delete(`/mentors/${id}`),
  sendLink:(id)      => api.post(`/mentors/${id}/send-access-link`),

  // Assignments (admin)
  assignments:      ()   => api.get('/mentor-assignments'),
  assign:           (data)=> api.post('/mentor-assignments', data),
  unassign:         (id) => api.delete(`/mentor-assignments/${id}`),
  teamMentor:       (teamId) => api.get(`/mentor-assignments/team/${teamId}`),

  // Ops dashboard (admin)
  opsSummary:            () => api.get('/mentor-ops/summary'),
  riskTeams:             () => api.get('/mentor-ops/risk-teams'),
  teamsWithoutMentor:    () => api.get('/mentor-ops/teams-without-mentor'),
  teamsWithoutMeeting:   () => api.get('/mentor-ops/teams-without-meeting'),
  missingDailyUpdates:   () => api.get('/mentor-ops/missing-daily-updates'),
  assignmentSuggestions: () => api.get('/mentor-ops/assignment-suggestions'),
  sendDailyReminders:    () => api.post('/mentor-ops/reminders/daily'),
  generateSummary: (teamId)=> api.post('/mentor-ops/ai-summary', { team_id: teamId }),

  // Mentor portal (token-auth)
  me:             () => api.get('/mentor-portal/me'),
  myTeams:        () => api.get('/mentor-portal/teams'),
  createSession:  (data) => api.post('/mentor-portal/sessions', data),
  updateSession:  (id, data) => api.patch(`/mentor-portal/sessions/${id}`, data),
  cancelSession:  (id) => api.patch(`/mentor-portal/sessions/${id}`, { status: 'cancelled' }),
  submitFeedback: (data) => api.post('/mentor-portal/feedback', data),
  teamFeedback:   (teamId) => api.get(`/mentor-portal/feedback/team/${teamId}`),

  // Participant-safe mentor info
  participantInfo: () => api.get('/participant-mentor-info'),
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
    return api.post('/submissions/participant/project', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** Get participant's own team submission metadata */
  getParticipantProject: () =>
    api.get('/submissions/participant/project'),

  /** Get submission metadata for a team (judge) */
  getTeamSubmission: (teamId) =>
    api.get(`/submissions/team/${teamId}`),

  /** Download team ZIP (judge) — GET /submissions/team/{team_id}/download
   *  Returns a raw Axios response (not unwrapped) so caller can access the blob.
   */
  downloadTeamZip: (teamId) => {
    const token = sessionStorage.getItem(SESSION_KEY)
    return axios.get(`${BASE_URL}/submissions/team/${teamId}/download`, {
      params: { token },
      responseType: 'blob',
    })
  },
}

export default api

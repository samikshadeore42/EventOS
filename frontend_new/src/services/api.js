// src/services/api.js
// Central Axios configuration. Every backend endpoint is exposed here as a
// named domain module. Import only what you need in each component.

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SESSION_KEY = 'eventos_token'

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor ───────────────────────────────────────────────────
// Reads the JWT from sessionStorage and injects it two ways:
//   1. Authorization: Bearer <token>  — for all requests (future-proofs admin auth)
//   2. ?token= query param            — for portal/evaluation routes (current backend contract)
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem(SESSION_KEY)
    if (!token) return config

    // Always attach as Bearer header
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`

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
// Unwraps .data so callers get the payload directly (not the Axios response shell).
// Normalises error messages to a plain Error instance.
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const detail = error.response?.data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((d) => d.msg).join('; ')
        : error.message || 'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// ── Token helpers (used by AuthContext) ───────────────────────────────────
export const tokenStorage = {
  get:    ()      => sessionStorage.getItem(SESSION_KEY),
  set:    (token) => sessionStorage.setItem(SESSION_KEY, token),
  clear:  ()      => sessionStorage.removeItem(SESSION_KEY),
}

// ═════════════════════════════════════════════════════════════════════════
// DOMAIN API MODULES
// ═════════════════════════════════════════════════════════════════════════

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

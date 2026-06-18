// src/views/JudgePortal.jsx

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ClipboardList, CheckCircle, Loader2, AlertTriangle,
  ChevronRight, Send, RotateCcw, Wand2, Download,
} from 'lucide-react'
import { portalApi, evaluationsApi, aiApi, solverApi, submissionsApi, eventStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout'

// ── Grading criteria — mirrors backend GRADING_CRITERIA constant ───────────
const CRITERIA = [
  { key: 'technical_depth', label: 'Technical Depth',  weight: 0.35, description: 'Complexity, correctness, architecture quality' },
  { key: 'innovation',      label: 'Innovation',        weight: 0.25, description: 'Originality, creative problem framing' },
  { key: 'presentation',    label: 'Presentation',      weight: 0.20, description: 'Clarity, demo quality, communication' },
  { key: 'feasibility',     label: 'Feasibility',       weight: 0.20, description: 'Practicality, scope awareness, polish' },
]

const DEFAULT_SCORES = Object.fromEntries(CRITERIA.map((c) => [c.key, 5.0]))

// ── Helpers ────────────────────────────────────────────────────────────────

function weightedTotal(scores) {
  return CRITERIA.reduce((sum, c) => sum + (scores[c.key] ?? 0) * c.weight, 0)
}

function qualityLabel(total) {
  if (total >= 8.5) return { label: 'Excellent', colour: 'text-teal-600' }
  if (total >= 7.0) return { label: 'Good',      colour: 'text-teal-600' }
  if (total >= 5.5) return { label: 'Average',   colour: 'text-amber-600' }
  return                    { label: 'Needs work', colour: 'text-teal-500' }
}

// ── Error / empty screens ─────────────────────────────────────────────────

function FullPageMessage({ icon: Icon, title, message, iconClass = 'text-gray-400' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center max-w-sm px-4">
        <Icon size={40} className={`mx-auto mb-4 ${iconClass}`} />
        <h2 className="text-lg font-bold text-foreground mb-1">{title}</h2>
        <p className="text-sm font-medium text-muted leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

// ── Criterion slider row ───────────────────────────────────────────────────

function CriterionSlider({ criterion, value, onChange }) {
  const pct = (value / 10) * 100

  const trackColor =
    value >= 8 ? 'accent-teal-500'   :
    value >= 6 ? 'accent-teal-500' :
    value >= 4 ? 'accent-amber-500'  : 'accent-teal-400'

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">{criterion.label}</p>
            <span className="text-xs font-semibold text-muted bg-slate-200 px-1.5 py-0.5 rounded-full">
              {(criterion.weight * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs font-medium text-muted mt-0.5 leading-tight">{criterion.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-2xl font-black tabular-nums ${
            value >= 8 ? 'text-teal-600'   :
            value >= 6 ? 'text-teal-600' :
            value >= 4 ? 'text-amber-600'  : 'text-teal-500'
          }`}>{value.toFixed(1)}</span>
          <span className="text-xs font-medium text-muted">/10</span>
        </div>
      </div>

      <div className="relative">
        <input
          type="range"
          min={0} max={10} step={0.5}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          className={`w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-200 ${trackColor}`}
          style={{
            background: `linear-gradient(to right, ${
              value >= 8 ? '#0d9488' : value >= 6 ? '#4f46e5' : value >= 4 ? '#d97706' : '#14B8A6'
            } 0%, ${
              value >= 8 ? '#0d9488' : value >= 6 ? '#4f46e5' : value >= 4 ? '#d97706' : '#14B8A6'
            } ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
          }}
        />
        {/* Tick marks at 0, 5, 10 */}
        <div className="flex justify-between mt-1 px-0.5">
          {[0, 2.5, 5, 7.5, 10].map((tick) => (
            <span key={tick} className="text-xs font-medium text-muted tabular-nums w-4 text-center">{tick}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Scoring form ──────────────────────────────────────────────────────────

function ScoringForm({ team, onSubmitted, alreadySubmitted, token }) {
  const urlToken = token
  const [scores, setScores]         = useState(DEFAULT_SCORES)
  const [confirming, setConfirming] = useState(false)

  const total   = useMemo(() => weightedTotal(scores), [scores])
  const quality = useMemo(() => qualityLabel(total), [total])

  const submitMutation = useMutation({
    mutationFn: () =>
      evaluationsApi.submit({ team_id: team.team_id, scores }, urlToken),
    onSuccess: () => {
      setConfirming(false)
      onSubmitted(team.team_id)
    },
  })

  function updateScore(key, val) {
    setScores((s) => ({ ...s, [key]: val }))
  }

  if (alreadySubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <CheckCircle size={48} className="text-teal-500 mb-4" />
        <h3 className="text-lg font-bold text-foreground mb-1">Scorecard submitted</h3>
        <p className="text-sm font-medium text-muted">Your evaluation for <strong className="text-foreground">{team.team_name}</strong> has been recorded.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Team header */}
      <div className="mb-6 pb-5 border-b border-border">
        <p className="text-xs font-bold text-teal-600 uppercase tracking-wide mb-1">Evaluating</p>
        <h2 className="text-2xl font-black text-foreground">{team.team_name}</h2>
        <p className="text-sm font-medium text-muted mt-1">
          Score each criterion honestly. Your evaluation is anonymised in the final aggregate.
        </p>
      </div>

      {/* Sliders */}
      <div>
        {CRITERIA.map((c) => (
          <CriterionSlider
            key={c.key}
            criterion={c}
            value={scores[c.key]}
            onChange={(val) => updateScore(c.key, val)}
          />
        ))}
      </div>

      {/* Weighted total display */}
      <div className="bg-background border border-border shadow-sm rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted mb-0.5">Weighted total score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-foreground">{total.toFixed(2)}</span>
            <span className="text-muted font-medium">/10</span>
            <span className={`text-sm font-bold ${quality.colour}`}>{quality.label}</span>
          </div>
        </div>
        <div className="text-right">
          <button
            onClick={() => setScores(DEFAULT_SCORES)}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-muted transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Submit / confirm */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-2 text-sm py-3 rounded-xl btn-primary text-white font-bold hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Send size={16} /> Review & Submit Scorecard
        </button>
      ) : (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-bold text-teal-900 mb-3">Confirm submission</p>
          <div className="space-y-1.5 mb-4">
            {CRITERIA.map((c) => (
              <div key={c.key} className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">{c.label}</span>
                <span className="font-bold text-foreground">{scores[c.key].toFixed(1)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-black border-t border-teal-200 pt-2 mt-2">
              <span className="text-teal-800">Weighted total</span>
              <span className={quality.colour}>{total.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs font-medium text-teal-700 mb-3">
            Please review carefully. After submission, this scorecard cannot be edited from the portal.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 rounded-lg bg-background border border-border text-sm font-semibold text-foreground hover:bg-surface shadow-sm"
            >
              Go back
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg btn-primary text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-100 disabled:bg-teal-100 dark:disabled:bg-teal-900/50 disabled:text-teal-400 dark:disabled:text-teal-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed shadow-sm"
            >
              {submitMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {submitMutation.isPending ? 'Submitting…' : 'Confirm & Submit'}
            </button>
          </div>
          {submitMutation.isError && (
            <p className="mt-2 text-xs font-semibold text-teal-500">{submitMutation.error?.message}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Team submission download section ───────────────────────────────────────

function TeamSubmissionSection({ teamId, token }) {
  const urlToken = token
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['team-submission', teamId, urlToken],
    queryFn: () => submissionsApi.getTeamSubmission(teamId, urlToken),
    enabled: !!teamId && !!urlToken,
    retry: false,
  })

  async function handleDownload() {
    setDownloading(true)
    try {
      const response = await submissionsApi.downloadTeamZip(teamId, urlToken)
      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data?.submission?.original_filename || `team_${teamId}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Download failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setDownloading(false)
    }
  }

  const sub = data?.submission

  return (
    <div className="mb-4 bg-background rounded-xl border border-border p-5 shadow-sm">
      <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <ClipboardList size={12} /> Submissions
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs font-medium text-muted">
          <Loader2 size={11} className="animate-spin text-teal-500" /> Loading submission info…
        </div>
      ) : error || !sub ? (
        <p className="text-sm font-medium text-muted">No project ZIP submitted yet.</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{sub.original_filename}</p>
            <p className="text-xs text-muted mt-0.5">
              Uploaded by {sub.uploaded_by} · {sub.file_size_bytes ? `${(sub.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
              {sub.created_at && ` · ${new Date(sub.created_at).toLocaleString()}`}
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg btn-primary text-white hover:bg-teal-700 disabled:opacity-100 disabled:bg-teal-100 dark:disabled:bg-teal-900/50 disabled:text-teal-400 dark:disabled:text-teal-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed shadow-sm shrink-0"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download ZIP
          </button>
        </div>
      )}
    </div>
  )
}

// ── Team queue sidebar ─────────────────────────────────────────────────────

function TeamQueueSidebar({ teams, selectedId, submittedIds, onSelect }) {
  return (
    <aside className="hidden lg:flex w-72 bg-background border-r border-border flex-col shadow-sm z-10 shrink-0">
      {/* Evaluator header */}
      <div className="px-5 py-5 border-b border-border bg-surface">
          <div className="flex justify-between text-xs font-medium text-muted mb-1">
            <span>Progress</span>
            <span className="font-bold text-foreground">{submittedIds.length}/{teams.length}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-teal-500 h-1.5 rounded-full transition-all"
              style={{ width: `${teams.length ? (submittedIds.length / teams.length) * 100 : 0}%` }}
            />
          </div>
        </div>


      {/* Team list */}
      <nav className="flex-1 overflow-y-auto p-2 bg-background">
        <p className="text-xs font-bold text-muted uppercase tracking-wide px-2 py-2">
          Assigned Teams
        </p>
        {teams.map((team) => {
          const done     = submittedIds.includes(team.team_id) || team.already_graded
          const isActive = selectedId === team.team_id

          return (
            <button
              key={team.team_id}
              onClick={() => onSelect(team)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left mb-1 transition-colors ${
                isActive
                  ? 'bg-teal-50 border border-teal-200'
                  : 'hover:bg-surface border border-transparent'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${
                done ? 'bg-teal-500' : 'bg-amber-400 animate-pulse'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${isActive ? 'text-teal-700' : 'text-foreground'}`}>
                  {team.team_name}
                </p>
                <p className={`text-xs mt-0.5 font-medium ${done ? 'text-teal-600' : 'text-muted'}`}>
                  {done ? 'Submitted' : 'Awaiting your score'}
                </p>
              </div>
              {!done && (
                <ChevronRight size={14} className="text-muted shrink-0" />
              )}
              {done && (
                <CheckCircle size={14} className="text-teal-600 shrink-0" />
              )}
            </button>
          )
        })}
      </nav>

      {submittedIds.length === teams.length && teams.length > 0 && (
        <div className="px-4 py-4 border-t border-border text-center bg-surface">
          <CheckCircle size={24} className="text-teal-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-foreground">All done!</p>
          <p className="text-xs font-medium text-muted mt-0.5">All scorecards submitted. Thank you.</p>
        </div>
      )}
    </aside>
  )
}

// ── Main JudgePortal ──────────────────────────────────────────────────────

export default function JudgePortal() {
  const { eventId } = useParams();
  useEffect(() => {
    if (eventId) eventStorage.set(eventId)
  }, [eventId])
  const { setToken } = useAuth()
  const [selectedTeam, setSelectedTeam]   = useState(null)
  const [submittedIds, setSubmittedIds]   = useState([])

  const [rubric, setRubric]           = useState(null)
  const [rubricLoading, setRubricLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (!selectedTeam) {
      setTimeout(() => { if (active) setRubric(null) }, 0)
      return
    }
    setTimeout(() => {
      if (active) {
        setRubric(null)
        setRubricLoading(true)
      }
    }, 0)
    const criteriaWeights = Object.fromEntries(
      CRITERIA.map(c => [c.label, c.weight])
    )
    aiApi.rubric({
      challenge_area: 'WiSE@TI Hackathon Project',
      criteria: criteriaWeights,
      event_name: 'WiSE@TI Hackathon',
    })
      .then(async (res) => {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2500))
          const s = await solverApi.taskStatus(res.task_id)
          if (s.status === 'success') {
            setRubric(s.result)
            setRubricLoading(false)
            return
          }
          if (s.status === 'failed') break
        }
        setRubricLoading(false)
      })
      .catch(() => setRubricLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam?.team_id])

  // Extract token from URL on mount (AuthContext also does this globally,
  // but we grab it here directly for the query so it runs immediately)
    const rawUrlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token')
  }, [])

  const evaluatorPortalTokenKey = eventId
    ? `eventos_portal_evaluator_token_${eventId}`
    : null

  const urlToken = useMemo(() => {
    if (rawUrlToken) return rawUrlToken
    return evaluatorPortalTokenKey
      ? sessionStorage.getItem(evaluatorPortalTokenKey)
      : null
  }, [rawUrlToken, evaluatorPortalTokenKey])

  useEffect(() => {
    if (!rawUrlToken || !evaluatorPortalTokenKey) return
    sessionStorage.setItem(evaluatorPortalTokenKey, rawUrlToken)
    setToken(rawUrlToken)
  }, [rawUrlToken, evaluatorPortalTokenKey, setToken])

  const { data: portalData, isLoading, error } = useQuery({
    queryKey:  ['portal-access', urlToken],
    queryFn:   () => portalApi.access(urlToken),
    enabled:   !!urlToken ,
    retry:     false,
    staleTime: 5 * 60 * 1000,
  })

  // ── Render guards ────────────────────────────────────────────────────────

  if (!urlToken) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        iconClass="text-amber-500"
        title="No access token"
        message="Please use the secure judge link sent to your email. It looks like /judge?token=..."
      />
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <Loader2 size={32} className="text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-muted">Loading your evaluation portal…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        iconClass="text-teal-500"
        title="Access denied"
        message={error.message?.includes('expired')
          ? 'Your access link has expired. Please contact the committee for a new link.'
          : `Invalid or expired token. (${error.message})`
        }
      />
    )
  }

  // Wrong role guard — this portal is evaluator-only
  if (portalData && portalData.participant_id) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        iconClass="text-amber-500"
        title="Wrong portal"
        message="This link is for participants. Use your participant portal link instead."
      />
    )
  }

  const teams         = portalData?.assigned_teams   ?? []
  const evaluatorName = portalData?.name              ?? 'Evaluator'
  const criteria      = portalData?.grading_criteria  ?? []   // from backend (display only)

  function handleTeamSelect(team) {
    setSelectedTeam(team)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSubmitted(teamId) {
    setSubmittedIds((ids) => [...new Set([...ids, teamId])])
    // Auto-advance to next unsubmitted team
    const allSubmitted = [...new Set([...submittedIds, teamId])]
    const nextTeam = teams.find(
      (t) => !allSubmitted.includes(t.team_id) && !t.already_graded
    )
    setSelectedTeam(nextTeam ?? null)
  }

  const totalSubmitted = new Set([
    ...submittedIds,
    ...teams.filter((t) => t.already_graded).map((t) => t.team_id),
  ]).size

  // ── Main layout ──────────────────────────────────────────────────────────

  const navItems = teams.map((team) => {
    const done = submittedIds.includes(team.team_id) || team.already_graded
    return {
      key: team.team_id,
      label: team.team_name,
      Icon: done ? CheckCircle : ChevronRight,
      isActive: selectedTeam?.team_id === team.team_id,
      onClick: () => handleTeamSelect(team),
      suffix: done ? 'Submitted' : 'Pending'
    }
  })

  return (
    <AppLayout
      title="WiSE@TI Hackathon"
      subtitle="Evaluator Portal"
      userName={evaluatorName}
      navigationItems={navItems}
      mobileBreakpoint="lg"
    >
      <div className="flex flex-col lg:flex-row min-h-screen -mx-4 sm:-mx-6 -my-6 sm:-my-8 bg-surface">
        {/* Sidebar */}
      <TeamQueueSidebar
        teams={teams}
        selectedId={selectedTeam?.team_id}
        submittedIds={[
          ...submittedIds,
          ...teams.filter((t) => t.already_graded).map((t) => t.team_id),
        ]}
        onSelect={handleTeamSelect}
        evaluatorName={evaluatorName}
        progress={{ submitted: totalSubmitted, total: teams.length }}
      />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">

          {/* No team selected — prompt */}
          {!selectedTeam && (
            <div className="text-center py-20">
              <ClipboardList size={48} className="text-slate-300 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">
                {teams.length === 0
                  ? 'No teams assigned yet'
                  : totalSubmitted === teams.length
                    ? 'All evaluations complete'
                    : 'Select a team to evaluate'
                }
              </h2>
              <p className="text-sm font-medium text-muted max-w-xs mx-auto">
                {teams.length === 0
                  ? 'The committee has not assigned any teams yet. Check back soon.'
                  : totalSubmitted === teams.length
                    ? 'You have submitted scorecards for all assigned teams. Thank you for your time.'
                    : 'Choose a team from the queue on the left to begin your evaluation.'
                }
              </p>

              {/* Grading guide */}
              {teams.length > 0 && criteria.length > 0 && (
                <div className="mt-8 text-left bg-background rounded-xl border border-border p-5 shadow-sm">
                  <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3">
                    Grading Criteria & Weights
                  </p>
                  <div className="space-y-2">
                    {criteria.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground">{c.label}</span>
                        <span className="text-teal-600 font-bold">
                          {(c.weight * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* AI Rubric — shows above scoring form when team is selected */}
            {selectedTeam && (
              <div className="mb-4 bg-background rounded-xl border border-border p-5 shadow-sm">
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Wand2 size={12} /> AI Scoring Guide
                </p>
                {rubricLoading ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-muted">
                    <Loader2 size={11} className="animate-spin text-teal-500" /> Generating rubric…
                  </div>
                ) : rubric?.criteria?.length > 0 ? (
                  <div className="space-y-3">
                    {rubric.criteria.map((c, i) => (
                      <div key={i} className="bg-surface border border-border rounded-lg p-3">
                        <p className="text-xs font-bold text-teal-700 mb-1">{c.name}</p>
                        <p className="text-xs font-medium text-muted mb-2">{c.description}</p>
                        {c.scoring_guide && (
                          <div className="space-y-1">
                            {Object.entries(c.scoring_guide).map(([band, desc]) => (
                              <div key={band} className="flex gap-2 text-xs">
                                <span className="text-teal-600 font-mono font-bold shrink-0 w-10">{band}</span>
                                <span className="font-medium text-muted">{String(desc)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

          {/* Project Submission — download section */}
            {selectedTeam && (
              <TeamSubmissionSection teamId={selectedTeam.team_id} token={urlToken} />
            )}

            {/* Scoring form */}
            {selectedTeam && (
              <ScoringForm
                key={selectedTeam.team_id}
                team={selectedTeam}
                token={urlToken}
                onSubmitted={handleSubmitted}
                alreadySubmitted={
                  submittedIds.includes(selectedTeam.team_id) ||
                  selectedTeam.already_graded
                }
              />
            )}

                    </div>
                  </main>
      </div>
    </AppLayout>
  )
}
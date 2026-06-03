// src/views/JudgePortal.jsx

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ClipboardList, CheckCircle, Loader2, AlertTriangle,
  ChevronRight, Send, RotateCcw, LogOut, Star, Wand2, Download,
} from 'lucide-react'
import { portalApi, evaluationsApi, aiApi, solverApi, submissionsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { tokenStorage } from '../services/api'

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
  if (total >= 7.0) return { label: 'Good',      colour: 'text-indigo-600' }
  if (total >= 5.5) return { label: 'Average',   colour: 'text-amber-600' }
  return                    { label: 'Needs work', colour: 'text-red-500' }
}

// ── Error / empty screens ─────────────────────────────────────────────────

function FullPageMessage({ icon: Icon, title, message, iconClass = 'text-gray-400' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm px-4">
        <Icon size={40} className={`mx-auto mb-4 ${iconClass}`} />
        <h2 className="text-lg font-bold text-slate-800 mb-1">{title}</h2>
        <p className="text-sm font-medium text-slate-500 leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

// ── Criterion slider row ───────────────────────────────────────────────────

function CriterionSlider({ criterion, value, onChange }) {
  const pct = (value / 10) * 100

  const trackColor =
    value >= 8 ? 'accent-teal-500'   :
    value >= 6 ? 'accent-indigo-500' :
    value >= 4 ? 'accent-amber-500'  : 'accent-red-400'

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800">{criterion.label}</p>
            <span className="text-xs font-semibold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded-full">
              {(criterion.weight * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-0.5 leading-tight">{criterion.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-2xl font-black tabular-nums ${
            value >= 8 ? 'text-teal-600'   :
            value >= 6 ? 'text-indigo-600' :
            value >= 4 ? 'text-amber-600'  : 'text-red-500'
          }`}>{value.toFixed(1)}</span>
          <span className="text-xs font-medium text-slate-400">/10</span>
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
              value >= 8 ? '#0d9488' : value >= 6 ? '#4f46e5' : value >= 4 ? '#d97706' : '#ef4444'
            } 0%, ${
              value >= 8 ? '#0d9488' : value >= 6 ? '#4f46e5' : value >= 4 ? '#d97706' : '#ef4444'
            } ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
          }}
        />
        {/* Tick marks at 0, 5, 10 */}
        <div className="flex justify-between mt-1 px-0.5">
          {[0, 2.5, 5, 7.5, 10].map((tick) => (
            <span key={tick} className="text-xs font-medium text-slate-400 tabular-nums w-4 text-center">{tick}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Scoring form ──────────────────────────────────────────────────────────

function ScoringForm({ team, token, onSubmitted, alreadySubmitted }) {
  const [scores, setScores]         = useState(DEFAULT_SCORES)
  const [confirming, setConfirming] = useState(false)
  const [isEditing, setIsEditing]   = useState(false)

  const total   = useMemo(() => weightedTotal(scores), [scores])
  const quality = useMemo(() => qualityLabel(total), [total])

  const submitMutation = useMutation({
    mutationFn: () =>
      evaluationsApi.submit({ team_id: team.team_id, scores }),
    onSuccess: () => {
      setConfirming(false)
      onSubmitted(team.team_id)
    },
  })

  function updateScore(key, val) {
    setScores((s) => ({ ...s, [key]: val }))
  }

  if (alreadySubmitted && !isEditing) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <CheckCircle size={48} className="text-teal-500 mb-4" />
        <h3 className="text-lg font-bold text-slate-800 mb-1">Scorecard submitted</h3>
        <p className="text-sm font-medium text-slate-600 mb-6">Your evaluation for <strong className="text-slate-900">{team.team_name}</strong> has been recorded.</p>
        <button 
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors text-sm font-semibold"
        >
          Edit Evaluation
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Team header */}
      <div className="mb-6 pb-5 border-b border-slate-200">
        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Evaluating</p>
        <h2 className="text-2xl font-black text-slate-900">{team.team_name}</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
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
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-0.5">Weighted total score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-900">{total.toFixed(2)}</span>
            <span className="text-slate-400 font-medium">/10</span>
            <span className={`text-sm font-bold ${quality.colour}`}>{quality.label}</span>
          </div>
        </div>
        <div className="text-right">
          <button
            onClick={() => setScores(DEFAULT_SCORES)}
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Submit / confirm */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-2 text-sm py-3 rounded-xl btn-primary text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Send size={16} /> Review & Submit Scorecard
        </button>
      ) : (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-bold text-indigo-900 mb-3">Confirm submission</p>
          <div className="space-y-1.5 mb-4">
            {CRITERIA.map((c) => (
              <div key={c.key} className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">{c.label}</span>
                <span className="font-bold text-slate-900">{scores[c.key].toFixed(1)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-black border-t border-indigo-200 pt-2 mt-2">
              <span className="text-indigo-800">Weighted total</span>
              <span className={quality.colour}>{total.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs font-medium text-indigo-700 mb-3">
            You can still edit your scores after submission until the final evaluation deadline closes.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              Go back
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg btn-primary text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
            >
              {submitMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {submitMutation.isPending ? 'Submitting…' : 'Confirm & Submit'}
            </button>
          </div>
          {submitMutation.isError && (
            <p className="mt-2 text-xs font-semibold text-red-500">{submitMutation.error?.message}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Team submission download section ───────────────────────────────────────

function TeamSubmissionSection({ teamId }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['team-submission', teamId],
    queryFn: () => submissionsApi.getTeamSubmission(teamId),
    enabled: !!teamId,
    retry: false,
  })

  async function handleDownload() {
    setDownloading(true)
    try {
      const response = await submissionsApi.downloadTeamZip(teamId)
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
    <div className="mb-4 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <ClipboardList size={12} /> Submissions
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Loader2 size={11} className="animate-spin text-indigo-500" /> Loading submission info…
        </div>
      ) : error || !sub ? (
        <p className="text-sm font-medium text-slate-500">No project ZIP submitted yet.</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{sub.original_filename}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Uploaded by {sub.uploaded_by} · {sub.file_size_bytes ? `${(sub.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
              {sub.created_at && ` · ${new Date(sub.created_at).toLocaleString()}`}
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg btn-primary text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm shrink-0"
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

function TeamQueueSidebar({ teams, selectedId, submittedIds, onSelect, evaluatorName, progress }) {
  return (
    <aside className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shadow-sm z-10">
      {/* Evaluator header */}
      <div className="px-5 py-5 border-b border-slate-200 bg-slate-50">
        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Judge Portal</p>
        <h1 className="text-base font-black text-slate-900 truncate">{evaluatorName}</h1>
        <div className="mt-3">
          <div className="flex justify-between text-xs font-medium text-slate-500 mb-1">
            <span>Progress</span>
            <span className="font-bold text-slate-700">{submittedIds.length}/{teams.length}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-teal-500 h-1.5 rounded-full transition-all"
              style={{ width: `${teams.length ? (submittedIds.length / teams.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Team list */}
      <nav className="flex-1 overflow-y-auto p-2 bg-white">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-2 py-2">
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
                  ? 'bg-indigo-50 border border-indigo-200'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${
                done ? 'bg-teal-500' : 'bg-amber-400 animate-pulse'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {team.team_name}
                </p>
                <p className={`text-xs mt-0.5 font-medium ${done ? 'text-teal-600' : 'text-slate-500'}`}>
                  {done ? 'Submitted' : 'Awaiting your score'}
                </p>
              </div>
              {!done && (
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              )}
              {done && (
                <CheckCircle size={14} className="text-teal-600 shrink-0" />
              )}
            </button>
          )
        })}
      </nav>

      {submittedIds.length === teams.length && teams.length > 0 && (
        <div className="px-4 py-4 border-t border-slate-200 text-center bg-slate-50">
          <CheckCircle size={24} className="text-teal-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800">All done!</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">All scorecards submitted. Thank you.</p>
        </div>
      )}
    </aside>
  )
}

// ── Main JudgePortal ──────────────────────────────────────────────────────

export default function JudgePortal() {
  const { token, setToken } = useAuth()
  const [selectedTeam, setSelectedTeam]   = useState(null)
  const [submittedIds, setSubmittedIds]   = useState([])

  const [rubric, setRubric]           = useState(null)
  const [rubricLoading, setRubricLoading] = useState(false)

  useEffect(() => {
    if (!selectedTeam) { setRubric(null); return }
    setRubric(null)
    setRubricLoading(true)
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
  }, [selectedTeam?.team_id])

  // Extract token from URL on mount (AuthContext also does this globally,
  // but we grab it here directly for the query so it runs immediately)
  const urlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token') || token
  }, [token])

  // Set token into session if it came from URL
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (t) setToken(t)
  }, [])

  const { data: portalData, isLoading, error } = useQuery({
    queryKey:  ['portal-access', urlToken],
    queryFn:   () => portalApi.access(urlToken),
    enabled:   !!urlToken,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 size={32} className="text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Loading your evaluation portal…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        iconClass="text-red-500"
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

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50">
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
              <h2 className="text-lg font-bold text-slate-800 mb-2">
                {teams.length === 0
                  ? 'No teams assigned yet'
                  : totalSubmitted === teams.length
                    ? 'All evaluations complete'
                    : 'Select a team to evaluate'
                }
              </h2>
              <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">
                {teams.length === 0
                  ? 'The committee has not assigned any teams yet. Check back soon.'
                  : totalSubmitted === teams.length
                    ? 'You have submitted scorecards for all assigned teams. Thank you for your time.'
                    : 'Choose a team from the queue on the left to begin your evaluation.'
                }
              </p>

              {/* Grading guide */}
              {teams.length > 0 && criteria.length > 0 && (
                <div className="mt-8 text-left bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                    Grading Criteria & Weights
                  </p>
                  <div className="space-y-2">
                    {criteria.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">{c.label}</span>
                        <span className="text-indigo-600 font-bold">
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
              <div className="mb-4 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Wand2 size={12} /> AI Scoring Guide
                </p>
                {rubricLoading ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Loader2 size={11} className="animate-spin text-indigo-500" /> Generating rubric…
                  </div>
                ) : rubric?.criteria?.length > 0 ? (
                  <div className="space-y-3">
                    {rubric.criteria.map((c, i) => (
                      <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                        <p className="text-xs font-bold text-indigo-700 mb-1">{c.name}</p>
                        <p className="text-xs font-medium text-slate-600 mb-2">{c.description}</p>
                        {c.scoring_guide && (
                          <div className="space-y-1">
                            {Object.entries(c.scoring_guide).map(([band, desc]) => (
                              <div key={band} className="flex gap-2 text-xs">
                                <span className="text-teal-600 font-mono font-bold shrink-0 w-10">{band}</span>
                                <span className="font-medium text-slate-600">{String(desc)}</span>
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
              <TeamSubmissionSection teamId={selectedTeam.team_id} />
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
              )
            }
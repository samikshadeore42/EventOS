// src/views/JudgePortal.jsx

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ClipboardList, CheckCircle, Loader2, AlertTriangle,
  ChevronRight, Send, RotateCcw, LogOut, Star,
} from 'lucide-react'
import { portalApi, evaluationsApi } from '../services/api'
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
  if (total >= 8.5) return { label: 'Excellent', colour: 'text-teal-400' }
  if (total >= 7.0) return { label: 'Good',      colour: 'text-indigo-400' }
  if (total >= 5.5) return { label: 'Average',   colour: 'text-amber-600' }
  return                    { label: 'Needs work', colour: 'text-red-500' }
}

// ── Error / empty screens ─────────────────────────────────────────────────

function FullPageMessage({ icon: Icon, title, message, iconClass = 'text-gray-300' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-800/40">
      <div className="text-center max-w-sm px-4">
        <Icon size={40} className={`mx-auto mb-4 ${iconClass}`} />
        <h2 className="text-lg font-semibold text-slate-200 mb-1">{title}</h2>
        <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
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
            <p className="text-sm font-semibold text-slate-100">{criterion.label}</p>
            <span className="text-xs text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded-full">
              {(criterion.weight * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-tight">{criterion.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-2xl font-bold tabular-nums ${
            value >= 8 ? 'text-teal-400'   :
            value >= 6 ? 'text-indigo-400' :
            value >= 4 ? 'text-amber-600'  : 'text-red-500'
          }`}>{value.toFixed(1)}</span>
          <span className="text-xs text-slate-500">/10</span>
        </div>
      </div>

      <div className="relative">
        <input
          type="range"
          min={0} max={10} step={0.5}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          className={`w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 ${trackColor}`}
          style={{
            background: `linear-gradient(to right, ${
              value >= 8 ? '#14b8a6' : value >= 6 ? '#6366f1' : value >= 4 ? '#f59e0b' : '#f87171'
            } 0%, ${
              value >= 8 ? '#14b8a6' : value >= 6 ? '#6366f1' : value >= 4 ? '#f59e0b' : '#f87171'
            } ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`,
          }}
        />
        {/* Tick marks at 0, 5, 10 */}
        <div className="flex justify-between mt-1 px-0.5">
          {[0, 2.5, 5, 7.5, 10].map((tick) => (
            <span key={tick} className="text-xs text-gray-300 tabular-nums w-4 text-center">{tick}</span>
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

  if (alreadySubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <CheckCircle size={48} className="text-teal-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-100 mb-1">Scorecard submitted</h3>
        <p className="text-sm text-slate-500">Your evaluation for <strong>{team.team_name}</strong> has been recorded.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Team header */}
      <div className="mb-6 pb-5 border-b border-slate-700/30">
        <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-1">Evaluating</p>
        <h2 className="text-2xl font-bold text-white">{team.team_name}</h2>
        <p className="text-sm text-slate-500 mt-1">
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
      <div className="bg-slate-800/40 rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Weighted total score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{total.toFixed(2)}</span>
            <span className="text-slate-500">/10</span>
            <span className={`text-sm font-semibold ${quality.colour}`}>{quality.label}</span>
          </div>
        </div>
        <div className="text-right">
          <button
            onClick={() => setScores(DEFAULT_SCORES)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Submit / confirm */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-2 text-sm py-3 rounded-xl btn-primary text-white font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Send size={16} /> Review & Submit Scorecard
        </button>
      ) : (
        <div className="bg-indigo-900/30 border border-indigo-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-indigo-800 mb-3">Confirm submission</p>
          <div className="space-y-1.5 mb-4">
            {CRITERIA.map((c) => (
              <div key={c.key} className="flex justify-between text-xs">
                <span className="text-slate-300">{c.label}</span>
                <span className="font-semibold text-white">{scores[c.key].toFixed(1)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-indigo-200 pt-2 mt-2">
              <span className="text-indigo-300">Weighted total</span>
              <span className={quality.colour}>{total.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs text-indigo-400 mb-3">
            Once submitted, your scores are locked. You can request a correction from the committee if needed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 rounded-lg border border-slate-700/50 text-sm text-slate-300 hover:bg-slate-800/40"
            >
              Go back
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg btn-primary text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {submitMutation.isPending ? 'Submitting…' : 'Confirm & Submit'}
            </button>
          </div>
          {submitMutation.isError && (
            <p className="mt-2 text-xs text-red-500">{submitMutation.error?.message}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Team queue sidebar ─────────────────────────────────────────────────────

function TeamQueueSidebar({ teams, selectedId, submittedIds, onSelect, evaluatorName, progress }) {
  return (
    <aside className="w-full lg:w-72 glass-card border-b lg:border-b-0 lg:border-r border-slate-700/50 flex flex-col">
      {/* Evaluator header */}
      <div className="px-5 py-5 border-b border-slate-700/30">
        <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-1">Judge Portal</p>
        <h1 className="text-base font-bold text-white truncate">{evaluatorName}</h1>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Progress</span>
            <span className="font-semibold text-slate-300">{submittedIds.length}/{teams.length}</span>
          </div>
          <div className="w-full bg-slate-700/50 rounded-full h-1.5">
            <div
              className="bg-teal-900/300 h-1.5 rounded-full transition-all"
              style={{ width: `${teams.length ? (submittedIds.length / teams.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Team list */}
      <nav className="flex-1 overflow-y-auto p-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide px-2 py-2">
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
                  ? 'bg-indigo-900/30 border border-indigo-200'
                  : 'hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${
                done ? 'bg-teal-400' : 'bg-amber-400 animate-pulse'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-300' : 'text-slate-100'}`}>
                  {team.team_name}
                </p>
                <p className={`text-xs mt-0.5 ${done ? 'text-teal-400' : 'text-slate-500'}`}>
                  {done ? 'Submitted' : 'Awaiting your score'}
                </p>
              </div>
              {!done && (
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              )}
              {done && (
                <CheckCircle size={14} className="text-teal-400 shrink-0" />
              )}
            </button>
          )
        })}
      </nav>

      {submittedIds.length === teams.length && teams.length > 0 && (
        <div className="px-4 py-4 border-t border-slate-700/30 text-center">
          <CheckCircle size={24} className="text-teal-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-200">All done!</p>
          <p className="text-xs text-slate-500 mt-0.5">All scorecards submitted. Thank you.</p>
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
        iconClass="text-amber-400"
        title="No access token"
        message="Please use the secure link sent to your email. It looks like /judge?token=..."
      />
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-800/40">
        <div className="text-center">
          <Loader2 size={32} className="text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading your evaluation portal…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        iconClass="text-red-400"
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
        iconClass="text-amber-400"
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
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-800/40">
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
              <ClipboardList size={48} className="text-gray-200 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-slate-200 mb-2">
                {teams.length === 0
                  ? 'No teams assigned yet'
                  : totalSubmitted === teams.length
                    ? 'All evaluations complete'
                    : 'Select a team to evaluate'
                }
              </h2>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                {teams.length === 0
                  ? 'The committee has not assigned any teams yet. Check back soon.'
                  : totalSubmitted === teams.length
                    ? 'You have submitted scorecards for all assigned teams. Thank you for your time.'
                    : 'Choose a team from the queue on the left to begin your evaluation.'
                }
              </p>

              {/* Grading guide */}
              {teams.length > 0 && criteria.length > 0 && (
                <div className="mt-8 text-left glass-card rounded-xl border border-slate-700/50 p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Grading Criteria & Weights
                  </p>
                  <div className="space-y-2">
                    {criteria.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">{c.label}</span>
                        <span className="text-indigo-400 font-semibold">
                          {(c.weight * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
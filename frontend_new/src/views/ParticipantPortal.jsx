// src/views/ParticipantPortal.jsx
// Accessed via /portal?token=<JWT>  — read-only, full-page layout.
// Flow: extract token → GET /portal/access → render personalised journey.

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle, Clock, Circle, Users, AlertTriangle,
  Loader2, ChevronDown, ChevronUp, CalendarDays, Mail,
} from 'lucide-react'
import { portalApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const STAGE_LABELS = {
  registration:   'Registration',
  team_formation: 'Team Formation',
  evaluation:     'Evaluation',
  results:        'Results',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PortalHeader({ name, email, eventName, stage }) {
  return (
    <div className="text-center mb-10">
      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-2">
        {eventName}
      </p>
      <h1 className="text-3xl font-black text-gray-900 mb-1">
        Welcome back, {name.split(' ')[0]} 👋
      </h1>
      <p className="text-sm text-gray-400">{email}</p>
      {stage && (
        <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Current stage: {STAGE_LABELS[stage] ?? stage}
        </div>
      )}
    </div>
  )
}

// ── Event timeline ─────────────────────────────────────────────────────────

function EventTimeline({ timeline }) {
  if (!timeline?.length) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-5">Your Event Journey</h2>

      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-4 top-5 bottom-5 w-0.5 bg-gray-100" />

        <div className="space-y-5">
          {timeline.map((phase, index) => {
            const isCompleted = phase.status === 'completed'
            const isActive    = phase.status === 'active'
            const isPending   = phase.status === 'pending'

            return (
              <div key={index} className="flex items-start gap-4 relative">
                {/* Node */}
                <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isCompleted ? 'bg-teal-500  border-teal-500'   :
                  isActive    ? 'bg-indigo-600 border-indigo-600' :
                                'bg-white      border-gray-200'
                }`}>
                  {isCompleted && <CheckCircle size={16} className="text-white" />}
                  {isActive    && <Clock       size={14} className="text-white" />}
                  {isPending   && <Circle      size={14} className="text-gray-200" />}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-indigo-300 animate-ping opacity-30" />
                  )}
                </div>

                {/* Content */}
                <div className={`flex-1 pt-1 pb-1 ${isPending ? 'opacity-40' : ''}`}>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${
                      isActive    ? 'text-indigo-700' :
                      isCompleted ? 'text-teal-700'   : 'text-gray-500'
                    }`}>
                      {phase.phase}
                    </p>
                    {isActive && (
                      <span className="text-xs font-medium text-white bg-indigo-500 px-2 py-0.5 rounded-full">
                        In progress
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                        Complete
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Teammate card ──────────────────────────────────────────────────────────

const AVATAR_COLOURS = [
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100   text-teal-700',
  'bg-amber-100  text-amber-700',
  'bg-rose-100   text-rose-700',
  'bg-violet-100 text-violet-700',
]

function TeammateCard({ teammate, index }) {
  const colour = AVATAR_COLOURS[index % AVATAR_COLOURS.length]

  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${colour}`}>
        {initials(teammate.name)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{teammate.name}</p>
        <p className="text-xs text-gray-400 truncate">{teammate.institution}</p>
      </div>
    </div>
  )
}

// ── Team reveal section ────────────────────────────────────────────────────

function TeamRevealSection({ teamName, rationale, teammates }) {
  const [rationaleOpen, setRationaleOpen] = useState(false)

  return (
    <div className="mb-6">
      {/* Team name hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 mb-4 text-white text-center">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-2">
          You have been assigned to
        </p>
        <h2 className="text-3xl font-black mb-1">{teamName}</h2>
        <p className="text-sm opacity-70">Your team assignment is confirmed</p>
      </div>

      {/* AI rationale accordion */}
      {rationale && (
        <div className="bg-white rounded-2xl border border-gray-200 mb-4 overflow-hidden">
          <button
            onClick={() => setRationaleOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-left">
              <span className="text-sm font-semibold text-gray-800">Why was this team formed?</span>
              <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">AI analysis</span>
            </div>
            {rationaleOpen
              ? <ChevronUp   size={16} className="text-gray-400 shrink-0" />
              : <ChevronDown size={16} className="text-gray-400 shrink-0" />
            }
          </button>
          {rationaleOpen && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <p className="text-sm text-gray-600 leading-relaxed pt-4">{rationale}</p>
            </div>
          )}
        </div>
      )}

      {/* Teammates */}
      {teammates?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800">
              Your Teammates ({teammates.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teammates.map((t, i) => (
              <TeammateCard key={i} teammate={t} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Awaiting assignment card ───────────────────────────────────────────────

function AwaitingCard() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center mb-6">
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
        <Clock size={22} className="text-amber-600" />
      </div>
      <h3 className="text-base font-bold text-amber-800 mb-1">Team assignment pending</h3>
      <p className="text-sm text-amber-600 leading-relaxed">
        The committee is currently running the team formation algorithm.
        You'll receive an email notification as soon as your team has been assigned and approved.
      </p>
    </div>
  )
}

// ── Key dates card (static for MVP — can be driven by event config later) ──

function KeyDatesCard({ stage }) {
  // Static placeholder dates for demo — extend to pull from event config
  const dates = [
    { label: 'Roster confirmed',    date: 'Day 1',  done: true },
    { label: 'Team assignments',    date: 'Day 2',  done: stage !== 'registration' },
    { label: 'Evaluation period',   date: 'Day 3–5', done: stage === 'results' },
    { label: 'Results announced',   date: 'Day 6',  done: stage === 'results' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-800">Key Dates</h3>
      </div>
      <div className="space-y-2.5">
        {dates.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {d.done
                ? <CheckCircle size={14} className="text-teal-500 shrink-0" />
                : <Circle      size={14} className="text-gray-200 shrink-0" />
              }
              <span className={d.done ? 'text-gray-700' : 'text-gray-400'}>{d.label}</span>
            </div>
            <span className={`text-xs font-medium ${d.done ? 'text-teal-600' : 'text-gray-300'}`}>
              {d.date}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Support footer ─────────────────────────────────────────────────────────

function SupportFooter({ supportEmail }) {
  return (
    <div className="text-center pt-4 pb-10">
      <p className="text-xs text-gray-400">
        Questions? Reach the committee at{' '}
        <a
          href={`mailto:${supportEmail}`}
          className="text-indigo-500 hover:underline"
        >
          {supportEmail}
        </a>
      </p>
      <p className="text-xs text-gray-300 mt-1">EventOS · WiSE@TI Hackathon</p>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function PortalSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mx-auto mb-3" />
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mx-auto mb-2" />
        <div className="h-3 w-40 bg-gray-100 rounded animate-pulse mx-auto" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-5" />
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-center gap-4 mb-5">
            <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
    </div>
  )
}

// ── Main ParticipantPortal ────────────────────────────────────────────────

export default function ParticipantPortal() {
  const { token, setToken } = useAuth()

  const urlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token') || token
  }, [token])

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (t) setToken(t)
  }, [])

  const { data, isLoading, error } = useQuery({
    queryKey:  ['portal-access', urlToken],
    queryFn:   () => portalApi.access(urlToken),
    enabled:   !!urlToken,
    retry:     false,
    staleTime: 5 * 60 * 1000,
  })

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!urlToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-1">No access token</h2>
          <p className="text-sm text-gray-400">
            Please use the secure link sent to your email.
            It looks like <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/portal?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) return <PortalSkeleton />

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-2">
            {error.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            {error.message?.includes('expired')
              ? 'Your access link has expired (7-day limit). Contact the committee for a fresh link.'
              : `Could not verify your access. (${error.message})`
            }
          </p>
        </div>
      </div>
    )
  }

  // Wrong role guard — evaluators sent to wrong portal
  if (data && data.evaluator_id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-1">Wrong portal</h2>
          <p className="text-sm text-gray-400">
            This link is for participants. Judges should visit{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/judge?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  // ── Resolved participant data ──────────────────────────────────────────

  const {
    name           = 'Participant',
    email          = '',
    stage          = 'registration',
    team_assigned  = false,
    team_name,
    team_rationale,
    teammates      = [],
    timeline       = [],
  } = data ?? {}

  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'events@ti.com'

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Thin top accent bar */}
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-500" />

      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <PortalHeader
          name={name}
          email={email}
          eventName="WiSE@TI Hackathon"
          stage={stage}
        />

        {/* Timeline */}
        <EventTimeline timeline={timeline} />

        {/* Team section — conditional on assignment status */}
        {team_assigned && team_name
          ? <TeamRevealSection
              teamName={team_name}
              rationale={team_rationale}
              teammates={teammates}
            />
          : <AwaitingCard />
        }

        {/* Key dates */}
        <KeyDatesCard stage={stage} />

        {/* Support */}
        <SupportFooter supportEmail={supportEmail} />

      </div>
    </div>
  )
}
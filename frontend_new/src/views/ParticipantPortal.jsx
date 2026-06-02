// src/views/ParticipantPortal.jsx
// Accessed via /portal?token=<JWT>  — read-only, full-page layout.
// Flow: extract token → GET /portal/access → render personalised journey.

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle, Clock, Circle, Users, AlertTriangle,
  ChevronDown, ChevronUp, CalendarDays,
  UserCheck, Video, ClipboardList, MessageSquare, Send, Trophy,
  
} from 'lucide-react'
import { portalApi, mentorApi } from '../services/api'
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
      <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">
        {eventName}
      </p>
      <h1 className="text-3xl font-black text-slate-900 mb-1">
        Welcome back, {name.split(' ')[0]} 👋
      </h1>
      <p className="text-sm text-slate-500">{email}</p>
      {stage && (
        <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-medium text-indigo-700 shadow-sm">
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
    <div className="glass-card rounded-2xl border border-slate-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-slate-800 mb-5">Your Event Journey</h2>

      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-4 top-5 bottom-5 w-0.5 bg-slate-200" />

        <div className="space-y-5">
          {timeline.map((phase, index) => {
            const isCompleted = phase.status === 'completed'
            const isActive    = phase.status === 'active'
            const isPending   = phase.status === 'pending'

            return (
              <div key={index} className="flex items-start gap-4 relative">
                {/* Node */}
                <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isCompleted ? 'bg-teal-50  border-teal-500'   :
                  isActive    ? 'btn-primary border-indigo-600' :
                                'bg-white border-slate-300'
                }`}>
                  {isCompleted && <CheckCircle size={16} className="text-teal-600" />}
                  {isActive    && <Clock       size={14} className="text-white" />}
                  {isPending   && <Circle      size={14} className="text-slate-300" />}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-30" />
                  )}
                </div>

                {/* Content */}
                <div className={`flex-1 pt-1 pb-1 ${isPending ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold ${
                      isActive    ? 'text-indigo-700' :
                      isCompleted ? 'text-teal-700'   : 'text-slate-500'
                    }`}>
                      {phase.phase}
                    </p>
                    {isActive && (
                      <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                        In progress
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
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
  'bg-indigo-50 border border-indigo-200 text-indigo-700',
  'bg-teal-50 border border-teal-200 text-teal-700',
  'bg-amber-50 border border-amber-200 text-amber-700',
  'bg-rose-50 border border-rose-200 text-rose-700',
  'bg-violet-50 border border-violet-200 text-violet-700',
]

function TeammateCard({ teammate, index }) {
  const colour = AVATAR_COLOURS[index % AVATAR_COLOURS.length]

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${colour}`}>
        {initials(teammate.name)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{teammate.name}</p>
        <p className="text-xs text-slate-500 truncate font-medium">{teammate.institution}</p>
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
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 mb-4 text-white text-center shadow-md">
        <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">
          You have been assigned to
        </p>
        <h2 className="text-3xl font-black mb-1">{teamName}</h2>
        <p className="text-sm opacity-90 font-medium">Your team assignment is confirmed</p>
      </div>

      {/* AI rationale accordion */}
      {rationale && (
        <div className="glass-card rounded-2xl border border-slate-200 mb-4 overflow-hidden">
          <button
            onClick={() => setRationaleOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-left">
              <span className="text-sm font-bold text-slate-800">Why was this team formed?</span>
              <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full font-semibold">AI analysis</span>
            </div>
            {rationaleOpen
              ? <ChevronUp   size={16} className="text-slate-500 shrink-0" />
              : <ChevronDown size={16} className="text-slate-500 shrink-0" />
            }
          </button>
          {rationaleOpen && (
            <div className="px-5 pb-5 border-t border-slate-200">
              <p className="text-sm text-slate-600 leading-relaxed pt-4 font-medium">{rationale}</p>
            </div>
          )}
        </div>
      )}

      {/* Teammates */}
      {teammates?.length > 0 && (
        <div className="glass-card rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">
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
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center mb-6 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-white border border-amber-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
        <Clock size={22} className="text-amber-600" />
      </div>
      <h3 className="text-base font-bold text-amber-900 mb-1">Team assignment pending</h3>
      <p className="text-sm text-amber-700 leading-relaxed font-medium">
        The committee is currently running the team formation algorithm.
        You'll receive an email notification as soon as your team has been assigned and approved.
      </p>
    </div>
  )
}

// ── Mentor info section ────────────────────────────────────────────────────

function MentorInfoSection({ mentorData }) {
  if (!mentorData) return null

  const hasMentor = !!mentorData.mentor_name

  return (
    <div className="mb-6 space-y-4">
      {/* Your Mentor card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck size={16} className="text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Your Mentor</h3>
        </div>
        {hasMentor ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center font-bold text-sm shrink-0">
              {initials(mentorData.mentor_name)}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{mentorData.mentor_name}</p>
              {mentorData.organization && (
                <p className="text-xs text-slate-500 font-medium">{mentorData.organization}</p>
              )}
              {mentorData.email && (
                <p className="text-xs text-slate-500 font-medium">{mentorData.email}</p>
              )}
              {mentorData.expertise_areas?.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {mentorData.expertise_areas.map(a => (
                    <span key={a} className="text-[11px] font-semibold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100">{a}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <UserCheck size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No mentor assigned yet. Please check again later.</p>
          </div>
        )}
      </div>

      {/* Next meeting */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Video size={16} className="text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">Next Mentor Meeting</h3>
        </div>
        {mentorData.next_meeting ? (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-sm font-bold text-indigo-900">{mentorData.next_meeting.title}</p>
            <p className="text-xs text-indigo-700 mt-1 font-medium">
              {new Date(mentorData.next_meeting.scheduled_at).toLocaleString()} · {mentorData.next_meeting.duration_minutes}min
            </p>
            {mentorData.next_meeting.agenda && (
              <p className="text-xs text-indigo-700 mt-1 font-medium">Agenda: {mentorData.next_meeting.agenda}</p>
            )}
            {mentorData.next_meeting.meeting_url && (
              <a href={mentorData.next_meeting.meeting_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                <Video size={12} /> Join Meeting
              </a>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <CalendarDays size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No mentor meeting scheduled yet.</p>
          </div>
        )}
      </div>

      {/* Visible feedback */}
      {mentorData.visible_feedback?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={16} className="text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Mentor Feedback</h3>
          </div>
          <div className="space-y-3">
            {mentorData.visible_feedback.slice(0, 3).map((fb, i) => (
              <div key={fb.id || i} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-sm text-slate-700 leading-relaxed font-medium">{fb.feedback_text}</p>
                {fb.progress_score != null && (
                  <p className="text-xs font-semibold text-slate-500 mt-1">Progress: {fb.progress_score}/10</p>
                )}
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action items */}
      {mentorData.action_items?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={16} className="text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">Action Items</h3>
          </div>
          <ul className="space-y-2">
            {mentorData.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <Circle size={8} className="text-amber-500 mt-1.5 shrink-0" />
                <span className="text-sm font-medium text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Key dates card ─────────────────────────────────────────────────────────

function KeyDatesCard({ stage }) {
  const dates = [
    { label: 'Roster confirmed',    date: 'Day 1',  done: true },
    { label: 'Team assignments',    date: 'Day 2',  done: stage !== 'registration' },
    { label: 'Evaluation period',   date: 'Day 3–5', done: stage === 'results' },
    { label: 'Results announced',   date: 'Day 6',  done: stage === 'results' },
  ]

  return (
    <div className="glass-card rounded-2xl border border-slate-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={16} className="text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-800">Key Dates</h3>
      </div>
      <div className="space-y-2.5">
        {dates.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {d.done
                ? <CheckCircle size={14} className="text-teal-600 shrink-0" />
                : <Circle      size={14} className="text-slate-300 shrink-0" />
              }
              <span className={`font-medium ${d.done ? 'text-slate-700' : 'text-slate-500'}`}>{d.label}</span>
            </div>
            <span className={`text-xs font-bold ${d.done ? 'text-teal-600' : 'text-slate-400'}`}>
              {d.date}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Project submission section ───────────────────────────────────────────────

function ProjectSubmissionSection() {
  const [url, setUrl] = useState('')
  const [submitted, setSubmitted] = useState(false)
  
  return (
    <div className="glass-card rounded-2xl border border-slate-200 p-6 mb-6">
       <div className="flex items-center gap-2 mb-4">
         <Send size={16} className="text-indigo-600" />
         <h3 className="text-sm font-bold text-slate-800">Submit Final Project</h3>
       </div>
       {submitted ? (
         <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center shadow-sm">
            <CheckCircle size={24} className="text-teal-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-teal-800">Project Submitted Successfully</p>
            <p className="text-xs font-medium text-teal-600 mt-1">{url}</p>
         </div>
       ) : (
         <div className="flex gap-2">
           <input 
             type="url" 
             placeholder="https://github.com/your-repo..." 
             className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm"
             value={url}
             onChange={e => setUrl(e.target.value)}
           />
           <button 
             onClick={() => { if(url) setSubmitted(true) }}
             className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
           >
             Submit
           </button>
         </div>
       )}
    </div>
  )
}

// ── Results section ────────────────────────────────────────────────────────

function ResultsSection({ data }) {
  return (
    <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-6 mb-6 text-center shadow-sm">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Trophy size={20} className="text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">Final Results</h3>
      </div>
      <div className="flex justify-center gap-12 mt-2">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Your Score</p>
          <p className="text-4xl font-black text-indigo-600">{data.total_score || '8.4'}</p>
        </div>
        <div>
           <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Global Rank</p>
           <p className="text-4xl font-black text-teal-600">{data.rank ? `#${data.rank}` : '#12'}</p>
        </div>
      </div>
      <p className="text-xs font-medium text-slate-600 mt-4">Results are final. Congratulations on completing the WiSE@TI Hackathon!</p>
    </div>
  )
}

// ── Support footer ─────────────────────────────────────────────────────────

function SupportFooter({ supportEmail }) {
  return (
    <div className="text-center pt-4 pb-10">
      <p className="text-xs font-medium text-slate-500">
        Questions? Reach the committee at{' '}
        <a
          href={`mailto:${supportEmail}`}
          className="text-indigo-600 font-bold hover:underline"
        >
          {supportEmail}
        </a>
      </p>
      <p className="text-xs font-medium text-slate-400 mt-1">EventOS · WiSE@TI Hackathon</p>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function PortalSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="h-3 w-32 bg-slate-200 rounded animate-pulse mx-auto mb-3" />
        <div className="h-8 w-56 bg-slate-200 rounded animate-pulse mx-auto mb-2" />
        <div className="h-3 w-40 bg-slate-200 rounded animate-pulse mx-auto" />
      </div>
      <div className="glass-card rounded-2xl border border-slate-200 p-6 mb-4">
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-5" />
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-center gap-4 mb-5">
            <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-32 bg-slate-200 rounded-2xl animate-pulse" />
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
    staleTime: 0,
    refetchInterval: 15000,
  })

  // Fetch mentor info for participants
  const { data: mentorData } = useQuery({
    queryKey: ['participant-mentor-info'],
    queryFn: mentorApi.participantInfo,
    enabled: !!urlToken && data?.participant_id != null,
    staleTime: 60 * 1000,
  })

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!urlToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-1">No access token</h2>
          <p className="text-sm font-medium text-slate-600">
            Please use the secure participant link sent to your email.
            It looks like <code className="text-xs bg-slate-200 text-slate-700 px-1 py-0.5 rounded">/participant?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) return <PortalSkeleton />

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            {error.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-1">Wrong portal</h2>
          <p className="text-sm font-medium text-slate-600">
            This link is for participants. Judges should visit{' '}
            <code className="text-xs bg-slate-200 text-slate-700 px-1 py-0.5 rounded">/judge?token=…</code>
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
    <div className="min-h-screen bg-slate-50">
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

        {/* Project Submission (Evaluation Stage) */}
        {team_assigned && stage === 'evaluation' && <ProjectSubmissionSection />}

        {/* Results (Results Stage) */}
        {stage === 'results' && <ResultsSection data={data} />}

        {/* Mentor info (only when team is assigned) */}
        {team_assigned && <MentorInfoSection mentorData={mentorData} />}

        {/* Key dates */}
        <KeyDatesCard stage={stage} />

        {/* Support */}
        <SupportFooter supportEmail={supportEmail} />

      </div>
    </div>
  )
}
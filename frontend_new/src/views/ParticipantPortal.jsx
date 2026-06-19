// src/views/ParticipantPortal.jsx
// Accessed via /portal?token=<JWT>  — read-only, full-page layout.
// Flow: extract token → GET /portal/access → render personalised journey.

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, Clock, Circle, Users, AlertTriangle,
  ChevronDown, ChevronUp, CalendarDays,
  UserCheck, Video, ClipboardList, MessageSquare, Send, Trophy,
  Check, X, Loader2
} from 'lucide-react'
import AppLayout from '../components/AppLayout'
import TeamChatPanel from '../components/TeamChatPanel'
import { portalApi, mentorApi, submissionsApi, dailyUpdateApi, eventStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'


// ── Daily Update Form (Phase 10) ───────────────────────────────────────────
function DailyUpdateForm({ token }) {
  const [what, setWhat]             = useState('')
  const [blockers, setBlockers]     = useState('')
  const [hours, setHours]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit() {
    if (!what.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await dailyUpdateApi.submit(token, {
        what_i_built: what,
        blockers: blockers || null,
        hours_worked: hours ? parseInt(hours) : null,
      })
      setSubmitted(true)
      } catch (e) {
        setError(e.message)
      } finally {
        setSubmitting(false)
    }
  }

  if (submitted) return (
    <div className="app-card-soft rounded-xl p-4">
      <p className="font-medium">✓ Daily update submitted!</p>
      <p className="text-green-600 text-sm mt-1">Your mentor and organizers can see your progress.</p>
    </div>
  )

  return (
    <div className="app-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[#F8E8FA] text-[#C84BEA] border border-[#F0D1F5] flex items-center justify-center shrink-0 shadow-sm">
          <ClipboardList size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Daily Progress</h3>
          <p className="text-sm font-medium text-muted">Log your team's work</p>
        </div>
      </div>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">
            What did you build today? <span className="text-primary">*</span>
          </label>
          <textarea
            className="w-full bg-cardSoft border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:border-transparent transition-all resize-none shadow-sm"
            rows={3}
            placeholder="Implemented the login flow, fixed the API integration..."
            value={what}
            onChange={e => setWhat(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Any blockers?
            </label>
            <input
              className="w-full bg-cardSoft border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:border-transparent transition-all shadow-sm"
              placeholder="e.g. Docker networking..."
              value={blockers}
              onChange={e => setBlockers(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Hours worked
            </label>
            <input
              type="number" min="0" max="24"
              className="w-full bg-cardSoft border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:border-transparent transition-all shadow-sm"
              placeholder="e.g. 4"
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-primary text-sm font-medium">{error}</p>}
      </div>
      <div className="pt-5 mt-5 border-t">
        <button
          onClick={handleSubmit}
          disabled={submitting || !what.trim()}
          className="w-full bg-primary hover:bg-primary-dark disabled:bg-cardSoft disabled:text-muted text-white shadow-sm px-5 py-3 rounded-xl text-sm font-bold transition-all flex justify-center items-center gap-2"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {submitting ? 'Submitting...' : 'Submit Update'}
        </button>
      </div>
    </div>
  )
}

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

function PortalHeader({ name, email, eventName, stage, timeline }) {
  return (
    <div className="app-card p-8 flex flex-col justify-center relative overflow-hidden mb-6 h-full">
      {/* Background soft glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 dark:bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
          <p className="text-sm font-bold text-primary uppercase tracking-widest">
            {eventName}
          </p>
        </div>

        <h1 className="text-4xl lg:text-5xl font-black text-foreground mb-2 tracking-tight">
          Welcome back, {name.split(' ')[0]} 👋
        </h1>

        <p className="text-base text-muted font-medium mb-8 flex items-center gap-2">
          {email}
        </p>

        {stage && (
          <div className="inline-flex items-center self-start gap-2.5 px-5 py-2.5 rounded-xl bg-cardSoft border border-border/50 text-sm font-bold text-foreground shadow-sm mb-6">
            <Clock size={18} className="text-primary" />
            Current Phase: <span className="text-foreground">{STAGE_LABELS[stage] ?? stage}</span>
          </div>
        )}

        <div className="mt-auto">
          {/* Embedded Event Journey Timeline */}
          <EventTimeline timeline={timeline} />
        </div>
      </div>
    </div>
  )
}

// ── Horizontal Event timeline ──────────────────────────────────────────────
function EventTimeline({ timeline }) {
  if (!timeline?.length) return null

  return (
    <div className="w-full mt-10 pt-8 border-t">
      <h2 className="text-sm font-bold text-foreground mb-6">Your Event Journey</h2>

      <div className="w-full pb-2">
        <div className="flex items-center w-full px-4">
          {timeline.map((phase, index) => {
          const isCompleted = phase.status === 'completed'
          const isActive    = phase.status === 'active'
          const isPending   = phase.status === 'pending'
          const isLast      = index === timeline.length - 1

          return (
            <div key={index} className={`flex items-center ${isLast ? 'flex-shrink-0' : 'flex-1'}`}>
              <div className="flex flex-col items-center relative group">
                {/* Node */}
                <div className={`relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors shadow-sm ${
                  isCompleted ? 'bg-cardSoft border-primary text-primary' :
                  isActive    ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' :
                                'bg-surface border-border text-muted'
                }`}>
                  {isCompleted && <CheckCircle size={18} />}
                  {isActive    && <Clock size={16} />}
                  {isPending   && <Circle size={16} />}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-primary-light animate-ping opacity-30" />
                  )}
                </div>
                {/* Label */}
                <div className="absolute top-12 whitespace-nowrap text-center">
                  <p className={`text-xs font-bold ${isActive ? 'text-primary-dark' : isCompleted ? 'text-foreground' : 'text-muted'}`}>
                    {phase.phase}
                  </p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${isActive ? 'text-primary' : 'text-muted'}`}>
                    {isActive ? 'In Progress' : isCompleted ? 'Complete' : 'Pending'}
                  </p>
                </div>
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-cardSoft">
                  <div className={`h-full transition-all duration-500 ${isCompleted ? 'bg-primary' : 'bg-transparent'}`} />
                </div>
              )}
            </div>
          )
        })}
        </div>
        <div className="h-12" /> {/* Spacing for absolute labels inside the scrolling container */}
      </div>
    </div>
  )
}

// ── Chat Drawer (right side) ───────────────────────────────────────────────
function ChatDrawer({ eventId, teamId, token, mentorData, participantId, onClose }) {
  const [activeTab, setActiveTab] = useState('team') // 'team' | 'mentor' | 'support'

  const hasMentor = !!mentorData?.mentor_name

  if (!teamId) return null

  const tabBtn = (key, label) => (
    <button
      onClick={() => setActiveTab(key)}
      className="px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors"
      style={{
        borderColor: activeTab === key ? 'var(--color-primary)' : 'transparent',
        color: activeTab === key ? 'var(--color-primary)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  )

  return (
    <>
      {/* Semi-transparent overlay */}
      <div className="app-drawer-overlay" onClick={onClose} />

      {/* Drawer */}
      <div className="app-drawer">
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: 'var(--bg-card)' }}
        >
          <h3 className="text-base font-bold flex items-center gap-2.5" style={{ color: 'var(--text-main)' }}>
            <MessageSquare size={20} style={{ color: 'var(--color-primary)' }} /> Team & Mentor Chat
          </h3>
          <button onClick={onClose} className="app-icon-button">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-1 gap-2 overflow-x-auto shrink-0"
          style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: 'var(--bg-card)' }}
        >
          {tabBtn('team', 'Team Group Chat')}
          {tabBtn('mentor', 'Chat with Mentor')}
          {tabBtn('support', 'Event Support')}
        </div>

        {/* Chat Content */}
        <div className="flex-1 relative flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-main)' }}>
          {activeTab === 'team' && (
            <TeamChatPanel inline eventId={eventId} teamId={teamId} token={token} kind="internal" currentSenderId={participantId} currentSenderRole="participant" title="Team Group Chat" />
          )}
          {activeTab === 'mentor' && (
            hasMentor ? (
              <TeamChatPanel inline eventId={eventId} teamId={teamId} token={token} kind="mentor" currentSenderId={participantId} currentSenderRole="participant" title="Chat with Mentor" />
            ) : !mentorData ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8" style={{ backgroundColor: 'var(--bg-card-soft)' }}>
                <Loader2 size={32} className="animate-spin mb-4" style={{ color: 'var(--color-primary)' }} />
                <h4 className="text-lg font-bold mb-2" style={{ color: 'var(--text-main)' }}>Loading Mentor Info...</h4>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8" style={{ backgroundColor: 'var(--bg-card-soft)' }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 app-card-soft">
                  <UserCheck size={24} style={{ color: 'var(--text-muted)' }} />
                </div>
                <h4 className="text-lg font-bold mb-2" style={{ color: 'var(--text-main)' }}>No Mentor Assigned</h4>
                <p className="text-sm font-medium max-w-[250px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>Your team will be able to chat with your mentor once they are assigned to your project.</p>
              </div>
            )
          )}
          {activeTab === 'support' && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8" style={{ backgroundColor: 'var(--bg-card-soft)' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 app-card-soft">
                <Send size={24} style={{ color: 'var(--text-muted)' }} />
              </div>
              <h4 className="text-lg font-bold mb-2" style={{ color: 'var(--text-main)' }}>Need help?</h4>
              <p className="text-sm font-medium mb-6 max-w-[250px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>Contact the organizing committee for technical or event-related issues.</p>
              <a href="mailto:support@eventos.com" className="app-btn-secondary flex items-center gap-2">
                <MessageSquare size={16} /> Email Support
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Teammate card ──────────────────────────────────────────────────────────

const AVATAR_COLOURS = [
  'bg-cardSoft border border-border text-primary-dark',
  'bg-cardSoft border border-border text-primary-dark',
  'bg-cardSoft border border-border text-primary-dark',
  'bg-cardSoft border border-border text-primary-dark',
  'bg-cardSoft border border-border text-primary-dark',
]

function TeammateCard({ teammate, index }) {
  const colour = AVATAR_COLOURS[index % AVATAR_COLOURS.length]

  return (
    <div className="flex items-center gap-3 bg-cardSoft rounded-xl p-3 border border-border shadow-sm transition-colors hover:bg-[var(--bg-card-soft)]">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${colour}`}>
        {initials(teammate.name)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{teammate.name}</p>
        <p className="text-xs text-muted truncate font-medium">{teammate.institution}</p>
      </div>
    </div>
  )
}

// ── Team reveal section ────────────────────────────────────────────────────

function TeamRevealSection({ teamName, rationale, teammates }) {
  const [rationaleOpen, setRationaleOpen] = useState(false)

  return (
    <div className="mb-6 h-full flex flex-col gap-4">
      {/* Team name hero */}
      <div className="app-card p-6 text-center relative overflow-hidden group border-l-2 border-l-primary transition-all hover:-translate-y-1">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">
            You have been assigned to
          </p>
          <h2 className="text-3xl font-black mb-1 text-foreground">{teamName}</h2>
          <p className="text-sm font-medium text-muted">Your team assignment is confirmed</p>
        </div>
      </div>

      {/* AI rationale accordion */}
      {rationale && (
        <div className="app-card overflow-hidden">
          <button
            onClick={() => setRationaleOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--bg-card-soft)]/50 transition-colors"
          >
            <div className="flex items-center gap-3 text-left">
              <span className="text-sm font-bold text-foreground">Why was this team formed?</span>
              <span className="text-[10px] uppercase tracking-wider text-primary bg-cardSoft border border-border/50 px-2 py-0.5 rounded-md font-bold">AI analysis</span>
            </div>
            {rationaleOpen
              ? <ChevronUp   size={18} className="text-muted shrink-0" />
              : <ChevronDown size={18} className="text-muted shrink-0" />
            }
          </button>
          {rationaleOpen && (
            <div className="px-6 pb-6 border-t">
              <p className="text-sm text-muted leading-relaxed pt-4 font-medium">{rationale}</p>
            </div>
          )}
        </div>
      )}

      {/* Teammates */}
      {teammates?.length > 0 && (
        <div className="app-card p-6 flex-1">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Your Teammates <span className="text-muted font-medium">({teammates.length})</span>
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
    <div className="app-card p-8 text-center mb-6 relative overflow-hidden group  flex flex-col justify-center h-full transition-all hover:-translate-y-1">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-cardSoft border border-border flex items-center justify-center mb-5 shadow-sm text-primary transition-transform group-hover:scale-105">
          <Clock size={28} />
        </div>
        <h3 className="text-xl font-black text-foreground mb-2">Team assignment pending</h3>
        <p className="text-sm text-muted leading-relaxed font-medium max-w-sm mx-auto">
          The committee is currently running the team formation algorithm.
          You'll receive an email notification as soon as your team has been assigned and approved.
        </p>
      </div>
    </div>
  )
}

function YourMentorCard({ mentorData }) {
  if (!mentorData) return null
  const hasMentor = !!mentorData.mentor_name

  return (
    <div className="app-card p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-cardSoft text-primary border border-border flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105">
          <UserCheck size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Your Mentor</h3>
          <p className="text-sm font-medium text-muted">Mentor Status</p>
        </div>
      </div>

      {hasMentor ? (
        <div className="flex items-center gap-4 bg-cardSoft p-4 rounded-xl border border-border mt-auto">
          <div className="w-14 h-14 rounded-full bg-card text-primary border border-border flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
            {initials(mentorData.mentor_name)}
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground truncate">{mentorData.mentor_name}</p>
            {mentorData.organization && (
              <p className="text-sm text-muted font-medium mt-0.5 truncate">{mentorData.organization}</p>
            )}
            {mentorData.email && (
              <p className="text-sm text-muted font-medium truncate">{mentorData.email}</p>
            )}
            {mentorData.expertise_areas?.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {mentorData.expertise_areas.map(a => (
                  <span key={a} className="text-[11px] font-bold tracking-wide uppercase bg-cardSoft text-primary px-2.5 py-1 rounded-md border border-border/50">{a}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 bg-cardSoft rounded-xl border border-dashed mt-auto">
          <div className="w-14 h-14 bg-card rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-border">
            <span className="text-2xl">👨‍🏫</span>
          </div>
          <h4 className="text-base font-bold text-foreground mb-1">Mentor assignment pending</h4>
          <p className="text-sm text-muted font-medium max-w-[220px] mx-auto leading-relaxed">A mentor will be assigned during the mentoring phase.</p>
        </div>
      )}
    </div>
  )
}

function NextMeetingCard({ mentorData }) {
  if (!mentorData) return null

  return (
    <div className="app-card p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-info/10 text-info border border-border flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105">
          <Video size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Next Mentor Meeting</h3>
          <p className="text-sm font-medium text-muted">Scheduled Sessions</p>
        </div>
      </div>

      {mentorData.next_meeting ? (
        <div className="bg-cardSoft border border-border/50 rounded-xl p-5 shadow-sm mt-auto">
          <p className="text-base font-bold text-foreground">{mentorData.next_meeting.title}</p>
          <p className="text-sm text-primary mt-1 font-medium flex items-center gap-2">
            <CalendarDays size={14} />
            {new Date(mentorData.next_meeting.scheduled_at).toLocaleString()} · {mentorData.next_meeting.duration_minutes}min
          </p>
          {mentorData.next_meeting.agenda && (
            <p className="text-sm text-foreground mt-2 font-medium bg-card/50 p-2.5 rounded-lg border border-border">
              <span className="font-bold">Agenda:</span> {mentorData.next_meeting.agenda}
            </p>
          )}
          {mentorData.next_meeting.meeting_url && (
            <a href={mentorData.next_meeting.meeting_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-sm font-bold text-white bg-primary px-4 py-2 rounded-xl hover:bg-primary-dark transition-colors shadow-sm w-full sm:w-auto justify-center">
              <Video size={16} /> Join Meeting
            </a>
          )}
        </div>
      ) : (
        <div className="text-center py-8 bg-cardSoft rounded-xl border border-dashed mt-auto">
          <div className="w-14 h-14 bg-card rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-border">
            <CalendarDays size={20} className="text-muted" />
          </div>
          <h4 className="text-base font-bold text-foreground mb-1">No upcoming sessions</h4>
          <p className="text-sm text-muted font-medium max-w-[220px] mx-auto leading-relaxed">Your mentor hasn't scheduled any check-ins yet.</p>
        </div>
      )}
    </div>
  )
}

function MentorFeedbackCard({ mentorData }) {
  if (!mentorData?.visible_feedback?.length) return null

  return (
    <div className="app-card p-6 h-full">
      <div className="flex items-center gap-2.5 mb-5">
        <MessageSquare size={18} className="text-primary" />
        <h3 className="text-lg font-bold text-foreground">Mentor Feedback</h3>
      </div>
      <div className="space-y-4">
        {mentorData.visible_feedback.slice(0, 3).map((fb, i) => (
          <div key={fb.id || i} className="bg-cardSoft rounded-xl p-4 border border-border relative">
            <p className="text-sm text-foreground leading-relaxed font-medium">{fb.feedback_text}</p>
            {fb.progress_score != null && (
              <div className="absolute top-4 right-4 bg-card text-primary text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-md border border-border shadow-sm">
                Score: {fb.progress_score}/10
              </div>
            )}
            <p className="text-[11px] text-muted mt-2 font-semibold tracking-wider uppercase">
              {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MentorActionItemsCard({ mentorData }) {
  if (!mentorData?.action_items?.length) return null

  return (
    <div className="app-card p-6 h-full">
      <div className="flex items-center gap-2.5 mb-5">
        <ClipboardList size={18} className="text-primary" />
        <h3 className="text-lg font-bold text-foreground">Action Items</h3>
      </div>
      <ul className="space-y-3">
        {mentorData.action_items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 bg-cardSoft p-3.5 rounded-xl border border-border">
            <div className="mt-0.5 shrink-0 w-4 h-4 rounded bg-primary/15 flex items-center justify-center text-primary">
              <Check size={10} strokeWidth={4} />
            </div>
            <span className="text-sm font-semibold text-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}



// ── Project submission section ───────────────────────────────────────────────

function ProjectSubmissionSection({ token }) {
  const qc = useQueryClient()
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showReplace, setShowReplace] = useState(false)

  // Fetch existing submission metadata from backend
  const { data: subData } = useQuery({
    queryKey: ['participant-submission', token],
    queryFn: () => submissionsApi.getParticipantProject(token),
    enabled: !!token,
    retry: false,
  })

  const existingSub = subData?.submission ?? null

  const handleUpload = async () => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
       setError("File must be under 50MB");
       return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
       setError("Only .zip files are allowed");
       return;
    }

    try {
       setUploading(true)
       await submissionsApi.upload(file, token);
       setError('');
       setFile(null);
       setShowReplace(false);
       // Refetch submission metadata
       qc.invalidateQueries({ queryKey: ['participant-submission', token] })
       qc.invalidateQueries({ queryKey: ['portal-access'] })
    } catch (err) {
       setError(err?.response?.data?.detail || err.message || 'Upload failed');
    } finally {
       setUploading(false)
    }
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="glass-card rounded-2xl border border-border p-6 mb-6">
       <div className="flex items-center gap-2 mb-4">
         <Send size={16} className="text-primary" />
         <h3 className="text-sm font-bold text-foreground">Submit Final Project (ZIP, max 50MB)</h3>
       </div>

       {/* Show existing submission info */}
       {existingSub && !showReplace ? (
         <div className="bg-cardSoft border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} className="text-primary" />
              <p className="text-sm font-bold text-foreground">Project Submitted</p>
            </div>
            <div className="text-xs text-muted space-y-1 mb-3">
              <p><span className="font-semibold">File:</span> {existingSub.original_filename}</p>
              <p><span className="font-semibold">Size:</span> {formatBytes(existingSub.file_size_bytes)}</p>
              <p><span className="font-semibold">Uploaded by:</span> {existingSub.uploaded_by}</p>
              {existingSub.updated_at && (
                <p><span className="font-semibold">Last updated:</span> {new Date(existingSub.updated_at).toLocaleString()}</p>
              )}
            </div>
            <button onClick={() => setShowReplace(true)} className="text-xs text-primary font-semibold hover:underline">Upload a replacement?</button>
         </div>
       ) : (
         <div className="flex flex-col gap-2">
           {existingSub && (
             <p className="text-xs text-primary font-medium mb-1">Replacing: {existingSub.original_filename}</p>
           )}
           <div className="flex gap-2">
             <input
               type="file"
               accept=".zip"
               className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
               onChange={e => { setFile(e.target.files[0]); setError(''); }}
             />
             <button
               onClick={handleUpload}
               className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               disabled={!file || uploading}
             >
               {uploading ? 'Uploading...' : 'Submit'}
             </button>
           </div>
           {existingSub && (
             <button onClick={() => setShowReplace(false)} className="text-xs text-muted hover:underline self-start">Cancel</button>
           )}
           {error && <p className="text-xs text-primary">{error}</p>}
         </div>
       )}
    </div>
  )
}

// ── Results section ────────────────────────────────────────────────────────

function ResultsSection({ data }) {
  const hasScore = typeof data?.total_score === 'number'
  const hasRank = typeof data?.rank === 'number'

  return (
    <div className="glass-card rounded-2xl p-6 mb-6 text-center relative overflow-hidden group border-t-4 border-t-emerald-500 transition-all hover:-translate-y-1 hover:scale-[1.02]">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Trophy size={20} className="text-primary" />
          <h3 className="text-lg font-bold text-foreground">Final Results</h3>
        </div>
        <div className="flex justify-center gap-12 mt-2">
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Your Score</p>
            <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
              {hasScore ? data.total_score.toFixed(2) : 'Pending'}
            </p>
          </div>
          <div>
             <p className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Global Rank</p>
             <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
               {hasRank ? `#${data.rank}` : '—'}
             </p>
          </div>
        </div>
        <p className="text-xs font-medium text-muted mt-4">Results are final. Congratulations on completing the WiSE@TI Hackathon!</p>
      </div>
    </div>
  )
}

// ── Support footer ─────────────────────────────────────────────────────────

function SupportFooter({ supportEmail }) {
  return (
    <div className="text-center pt-4 pb-10">
      <p className="text-xs font-medium text-muted">
        Questions? Reach the committee at{' '}
        <a
          href={`mailto:${supportEmail}`}
          className="text-primary font-bold hover:underline"
        >
          {supportEmail}
        </a>
      </p>
      <p className="text-xs font-medium text-muted mt-1">EventOS · WiSE@TI Hackathon</p>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function PortalSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="h-3 w-32 bg-cardSoft rounded animate-pulse mx-auto mb-3" />
        <div className="h-8 w-56 bg-cardSoft rounded animate-pulse mx-auto mb-2" />
        <div className="h-3 w-40 bg-cardSoft rounded animate-pulse mx-auto" />
      </div>
      <div className="glass-card rounded-2xl border border-border p-6 mb-4">
        <div className="h-4 w-32 bg-cardSoft rounded animate-pulse mb-5" />
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-center gap-4 mb-5">
            <div className="w-8 h-8 rounded-full bg-cardSoft animate-pulse shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-24 bg-cardSoft rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-32 bg-cardSoft rounded-2xl animate-pulse" />
    </div>
  )
}

// ── Progression Invitation Action Card ───────────────────────────────────────
// ── Progression Invitation Action Card ───────────────────────────────────────
function ProgressionInvitationSection({ participantId, currentStatus }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (confirmed) => {
      const response = await fetch(`http://localhost:8000/participants/${participantId}/confirm-progression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed })
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      // Refresh backend data in the background
      queryClient.invalidateQueries({ queryKey: ['portal-access'] })
    },
    onError: () => alert('Something went wrong. Please check your network connection.')
  })

  // OPTIMISTIC UI: Show success instantly if mutation succeeded OR if currentStatus is already true
  if (currentStatus === true || (mutation.isSuccess && mutation.variables === true)) {
    return (
      <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 text-center mb-6 shadow-lg shadow-emerald-900/20">
        <p className="text-sm font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
          <Check size={18} /> Your attendance for the Grand Finale is locked in! See you there.
        </p>
      </div>
    )
  }

  // OPTIMISTIC UI: Show declined instantly
  if (currentStatus === false || (mutation.isSuccess && mutation.variables === false)) {
    return (
      <div className="app-card-soft rounded-2xl p-5 text-center mb-6">
        <p className="text-sm font-medium text-muted flex items-center justify-center gap-1.5">
          <X size={18} /> You have declined the grand finale progression slot.
        </p>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl p-6 mb-6 relative overflow-hidden group border-l-2 border-l-primary transition-all hover:-translate-y-1 hover:scale-[1.02]">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
      <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            🎉 Final Round Invitation!
          </h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Your team has qualified for the Grand Finale round. Please confirm your availability now.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(true)}
            className="flex-1 sm:flex-none text-xs btn-primary text-white font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {mutation.isPending && mutation.variables === true ? 'Saving...' : 'Accept Invite'}
          </button>
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
            className="flex-1 sm:flex-none text-xs border border-border bg-background hover:bg-surface text-foreground font-medium px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending && mutation.variables === false ? '...' : 'Decline'}
          </button>
        </div>
      </div>
    </div>
  )
}
// ── Main ParticipantPortal ────────────────────────────────────────────────
export default function ParticipantPortal() {
  const { eventId } = useParams()
  const [searchParams] = useSearchParams()
  const rawUrlToken = searchParams.get('token')
  const { setToken } = useAuth()
  const [isChatOpen, setIsChatOpen] = useState(false)

  const participantPortalTokenKey = eventId
    ? `eventos_portal_participant_token_${eventId}`
    : null

  const urlToken = useMemo(() => {
    if (rawUrlToken) return rawUrlToken
    return participantPortalTokenKey
      ? sessionStorage.getItem(participantPortalTokenKey)
      : null
  }, [rawUrlToken, participantPortalTokenKey])

  useEffect(() => {
    if (eventId) eventStorage.set(eventId)
  }, [eventId])

  useEffect(() => {
    if (!rawUrlToken || !participantPortalTokenKey) return
    sessionStorage.setItem(participantPortalTokenKey, rawUrlToken)
    setToken(rawUrlToken)
  }, [rawUrlToken, participantPortalTokenKey, setToken])

  const { data, isLoading, error } = useQuery({
    queryKey:  ['portal-access', urlToken],
    queryFn:   () => portalApi.access(urlToken),
    enabled:   !!urlToken ,
    retry:     false,
    staleTime: 0,
    refetchInterval: 15000,
  })

  const { data: mentorData } = useQuery({
    queryKey: ['participant-mentor-info', urlToken],
    queryFn: () => mentorApi.participantInfo(urlToken),
    enabled: !!urlToken && data?.participant_id != null,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!urlToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-1">No access token</h2>
          <p className="text-sm font-medium text-muted">
            Please use the secure participant link sent to your email.
            It looks like <code className="text-xs bg-cardSoft text-foreground px-1 py-0.5 rounded">/participant?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) return <PortalSkeleton />

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">
            {error.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm font-medium text-muted leading-relaxed">
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
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-1">Wrong portal</h2>
          <p className="text-sm font-medium text-muted">
            This link is for participants. Judges should visit{' '}
            <code className="text-xs bg-cardSoft text-foreground px-1 py-0.5 rounded">/judge?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  // ── Resolved participant data ──────────────────────────────────────────

  const {
    participant_id,
    name           = 'Participant',
    email          = '',
    stage          = 'registration',
    team_assigned  = false,
    team_id,
    team_name,
    team_rationale,
    teammates      = [],
    timeline       = [],
    progression_confirmed = null,
  } = data ?? {}

  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'events@ti.com'

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <AppLayout
      title="WiSE@TI Hackathon"
      subtitle="Participant Portal"
      userName={name}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Top Row: Event Status, Phase, Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col">
            <PortalHeader
              name={name}
              email={email}
              eventName="WiSE@TI Hackathon"
              stage={stage}
              timeline={timeline}
            />
            {participant_id && stage === 'results' && typeof data?.rank === 'number' && data.rank >= 1 && data.rank <= 3 && (
              <ProgressionInvitationSection
                participantId={participant_id}
                currentStatus={progression_confirmed}
              />
            )}
          </div>
          <div className="flex flex-col">
            {team_assigned && team_name
              ? <TeamRevealSection
                  teamName={team_name}
                  rationale={team_rationale}
                  teammates={teammates}
                />
              : <AwaitingCard />
            }
          </div>
        </div>

        {/* Second Row: Project Submission */}
        {team_assigned && (stage === 'evaluation' || stage === 'results') && (
          <div className="mb-6">
            <ProjectSubmissionSection token={urlToken} />
          </div>
        )}
        {stage === 'results' && (
          <div className="mb-6">
             <ResultsSection data={data} />
          </div>
        )}

        {/* Third Row: Mentor Info & Daily Update */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch mb-6">
          {team_assigned && (
            <>
              <div className="lg:col-span-1">
                <YourMentorCard mentorData={mentorData} />
              </div>
              <div className="lg:col-span-1">
                <NextMeetingCard mentorData={mentorData} />
              </div>
              <div className="lg:col-span-1">
                <DailyUpdateForm token={urlToken} />
              </div>
            </>
          )}
        </div>

        {/* Fourth Row: Mentor Feedback & Action Items */}
        {team_assigned && mentorData && (mentorData.visible_feedback?.length > 0 || mentorData.action_items?.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <MentorFeedbackCard mentorData={mentorData} />
            <MentorActionItemsCard mentorData={mentorData} />
          </div>
        )}

        {/* Support */}
        <SupportFooter supportEmail={supportEmail} />

      </div>

      {/* Floating Toggle Button */}
      {team_assigned && team_id && !isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-6 py-4 rounded-full text-white shadow-xl transition-transform hover:-translate-y-1"
          style={{ backgroundColor: 'var(--color-primary)', boxShadow: '0 8px 24px rgba(232,121,50,0.25)' }}
        >
          <MessageSquare size={22} className="text-white" />
          <span className="hidden sm:inline font-bold">Team & Mentor Chat</span>
        </button>
      )}

      {/* Chat Drawer Portal */}
      {isChatOpen && team_assigned && team_id && createPortal(
        <ChatDrawer
          eventId={eventId}
          teamId={team_id}
          token={urlToken}
          mentorData={mentorData}
          participantId={participant_id}
          onClose={() => setIsChatOpen(false)}
        />,
        document.body
      )}
    </AppLayout>
  )
}
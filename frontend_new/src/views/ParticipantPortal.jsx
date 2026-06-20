import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, Clock, Circle, Users, AlertTriangle,
  ChevronDown, ChevronUp, CalendarDays,
  UserCheck, Video, ClipboardList, MessageSquare, Send, Trophy,
  X, Loader2
} from 'lucide-react'
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
    <div className="bg-amber-50/80 border border-amber-200 rounded-[22px] p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
        <CheckCircle size={24} />
      </div>
      <p className="font-bold text-slate-950">Daily update submitted!</p>
      <p className="text-slate-600 text-sm mt-1 font-medium">Your mentor and organizers can see your progress.</p>
    </div>
  )

  return (
    <div className="bg-amber-50/80 border border-amber-200/80 rounded-[22px] p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-white/60 border border-amber-200 text-orange-600 flex items-center justify-center shrink-0">
          <ClipboardList size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-950">Daily Progress</h3>
          <p className="text-sm font-medium text-slate-600">Log your team's work</p>
        </div>
      </div>
      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">
            What did you build today? <span className="text-orange-500">*</span>
          </label>
          <textarea
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100/70 focus:border-blue-300 transition-all resize-none"
            rows={3}
            placeholder="Implemented the login flow, fixed the API integration..."
            value={what}
            onChange={e => setWhat(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Any blockers?
            </label>
            <input
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100/70 focus:border-blue-300 transition-all"
              placeholder="e.g. Docker network"
              value={blockers}
              onChange={e => setBlockers(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Hours worked
            </label>
            <input
              type="number" min="0" max="24"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100/70 focus:border-blue-300 transition-all"
              placeholder="e.g. 4"
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
      </div>
      <div className="pt-5 mt-5 border-t border-amber-200/60">
        <button
          onClick={handleSubmit}
          disabled={submitting || !what.trim()}
          className="w-full bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-orange-500/20 px-5 py-3 rounded-xl text-sm font-bold transition-all flex justify-center items-center gap-2"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
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
    <div className="bg-white/90 border border-white/80 rounded-[22px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-sm p-8 flex flex-col justify-center h-full">
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            {eventName}
          </p>
        </div>

        <h1 className="text-4xl lg:text-5xl font-black text-slate-950 mb-2 tracking-tight">
          Welcome back, {name.split(' ')[0]} 👋
        </h1>

        <p className="text-base text-slate-600 font-medium mb-8">
          {email}
        </p>

        {stage && (
          <div className="inline-flex items-center self-start gap-2.5 px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 mb-6">
            <Clock size={16} className="text-slate-500" />
            Current Phase: <span className="text-slate-950">{STAGE_LABELS[stage] ?? stage}</span>
          </div>
        )}

        <div className="mt-auto border-t border-slate-200/80 pt-8">
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
    <div className="w-full">
      <h2 className="text-sm font-bold text-slate-950 mb-8">Your Event Journey</h2>

      <div className="w-full pb-2">
        <div className="flex items-center w-full px-2">
          {timeline.map((phase, index) => {
          const isCompleted = phase.status === 'completed'
          const isActive    = phase.status === 'active'
          const isPending   = phase.status === 'pending'
          const isLast      = index === timeline.length - 1

          return (
            <div key={index} className={`flex items-center ${isLast ? 'flex-shrink-0' : 'flex-1'}`}>
              <div className="flex flex-col items-center relative group">
                {/* Node */}
                <div className={`relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isCompleted ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 
                  isActive ? 'bg-orange-500 border-orange-500 text-white shadow-[0_0_16px_rgba(249,115,22,0.4)]' : 
                  'bg-white border-slate-300 text-slate-300'
                }`}>
                  {isCompleted && <CheckCircle size={18} />}
                  {isActive    && <Clock size={16} />}
                  {isPending   && <Circle size={16} />}
                </div>
                {/* Label */}
                <div className="absolute top-12 whitespace-nowrap text-center">
                  <p className={`text-xs font-bold ${isActive ? 'text-orange-600' : isCompleted ? 'text-slate-950' : 'text-slate-500'}`}>
                    {phase.phase}
                  </p>
                  <p className={`text-[10px] font-bold mt-0.5 ${isActive ? 'text-orange-500' : 'text-slate-400'}`}>
                    {isActive ? 'In Progress' : isCompleted ? 'Complete' : 'Pending'}
                  </p>
                </div>
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-slate-200">
                  <div className={`h-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-transparent'}`} />
                </div>
              )}
            </div>
          )
        })}
        </div>
        <div className="h-10" /> {/* Spacing for absolute labels inside the scrolling container */}
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
      className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${activeTab === key ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 transition-opacity" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white shrink-0">
          <h3 className="text-base font-extrabold text-slate-950 flex items-center gap-2.5">
            <MessageSquare size={20} className="text-orange-500" /> Team & Mentor Chat
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-1 gap-2 overflow-x-auto border-b border-slate-100 bg-white shrink-0">
          {tabBtn('team', 'Team Group Chat')}
          {tabBtn('mentor', 'Chat with Mentor')}
          {tabBtn('support', 'Event Support')}
        </div>

        {/* Chat Content */}
        <div className="flex-1 relative flex flex-col min-h-0 bg-slate-50">
          {activeTab === 'team' && (
            <TeamChatPanel inline eventId={eventId} teamId={teamId} token={token} kind="internal" currentSenderId={participantId} currentSenderRole="participant" title="Team Group Chat" />
          )}
          {activeTab === 'mentor' && (
            hasMentor ? (
              <TeamChatPanel inline eventId={eventId} teamId={teamId} token={token} kind="mentor" currentSenderId={participantId} currentSenderRole="participant" title="Chat with Mentor" />
            ) : !mentorData ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
                <Loader2 size={32} className="animate-spin mb-4 text-orange-500" />
                <h4 className="text-lg font-bold text-slate-950 mb-2">Loading Mentor Info...</h4>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-white border border-slate-200">
                  <UserCheck size={24} className="text-slate-400" />
                </div>
                <h4 className="text-lg font-bold text-slate-950 mb-2">No Mentor Assigned</h4>
                <p className="text-sm font-medium text-slate-500 max-w-[250px] leading-relaxed">Your team will be able to chat with your mentor once they are assigned to your project.</p>
              </div>
            )
          )}
          {activeTab === 'support' && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-white border border-slate-200">
                <Send size={24} className="text-slate-400" />
              </div>
              <h4 className="text-lg font-bold text-slate-950 mb-2">Need help?</h4>
              <p className="text-sm font-medium text-slate-500 mb-6 max-w-[250px] leading-relaxed">Contact the organizing committee for technical or event-related issues.</p>
              <a href="mailto:events@ti.com" className="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
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
function TeammateCard({ teammate }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 bg-slate-200 text-slate-700">
        {initials(teammate.name)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-950 truncate">{teammate.name}</p>
        <p className="text-xs text-slate-500 truncate font-medium">{teammate.institution}</p>
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
      <div className="bg-white/90 border border-white/80 rounded-[22px] shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm p-6 text-center flex flex-col items-center justify-center py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
          YOU HAVE BEEN ASSIGNED TO
        </p>
        <h2 className="text-3xl font-black mb-1 text-slate-950">{teamName}</h2>
        <p className="text-sm font-medium text-slate-600">Your team assignment is confirmed</p>
      </div>

      {/* AI rationale accordion */}
      {rationale && (
        <div className="bg-white/90 border border-white/80 rounded-[22px] shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm overflow-hidden">
          <button
            onClick={() => setRationaleOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3 text-left">
              <span className="text-sm font-bold text-slate-950">Why was this team formed?</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-bold">AI ANALYSIS</span>
            </div>
            {rationaleOpen
              ? <ChevronUp   size={18} className="text-slate-400 shrink-0" />
              : <ChevronDown size={18} className="text-slate-400 shrink-0" />
            }
          </button>
          {rationaleOpen && (
            <div className="px-6 pb-6 border-t border-slate-100">
              <p className="text-sm text-slate-600 leading-relaxed pt-4 font-medium">{rationale}</p>
            </div>
          )}
        </div>
      )}

      {/* Teammates */}
      {teammates?.length > 0 && (
        <div className="bg-white/90 border border-white/80 rounded-[22px] shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm p-6 flex-1">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-slate-400" />
            <h3 className="text-base font-bold text-slate-950">
              Your Teammates <span className="text-slate-500 font-medium">({teammates.length})</span>
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {teammates.map((t, i) => (
              <TeammateCard key={i} teammate={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AwaitingCard() {
  return (
    <div className="bg-white/90 border border-white/80 rounded-[22px] shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm p-8 text-center h-full flex flex-col justify-center">
      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-5 text-slate-400 border border-slate-200">
        <Clock size={28} />
      </div>
      <h3 className="text-xl font-black text-slate-950 mb-2">Team assignment pending</h3>
      <p className="text-sm text-slate-600 leading-relaxed font-medium max-w-sm mx-auto">
        The committee is currently running the team formation algorithm.
        You'll receive an email notification as soon as your team has been assigned and approved.
      </p>
    </div>
  )
}

function YourMentorCard({ mentorData }) {
  if (!mentorData) return null
  const hasMentor = !!mentorData.mentor_name

  return (
    <div className="bg-blue-50/70 border border-blue-200/70 rounded-[22px] p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-white/60 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
          <UserCheck size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-950">Your Mentor</h3>
          <p className="text-sm font-medium text-slate-600">Mentor Status</p>
        </div>
      </div>

      {hasMentor ? (
        <div className="flex-1 flex flex-col">
          <div className="bg-white/80 border border-slate-200/60 rounded-xl p-5 mb-4 shadow-sm flex items-start gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 bg-orange-100 text-orange-600">
              {initials(mentorData.mentor_name)}
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-950 truncate">{mentorData.mentor_name}</p>
              {mentorData.organization && (
                <p className="text-sm text-slate-600 font-medium mt-0.5 truncate">{mentorData.organization}</p>
              )}
              {mentorData.email && (
                <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">{mentorData.email}</p>
              )}
              {mentorData.expertise_areas?.length > 0 && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {mentorData.expertise_areas.map(a => (
                    <span key={a} className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 border border-blue-200">{a}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="mt-auto w-full bg-white/70 border border-blue-200 hover:bg-blue-50 text-blue-700 font-bold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
            <UserCheck size={16} /> View Mentor Profile
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center text-center bg-white/50 border border-blue-100 rounded-xl p-6">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <span className="text-xl">👨‍🏫</span>
          </div>
          <h4 className="text-sm font-bold text-slate-950 mb-1">Mentor pending</h4>
          <p className="text-xs text-slate-500 font-medium max-w-[200px] mx-auto">A mentor will be assigned during the mentoring phase.</p>
        </div>
      )}
    </div>
  )
}

function NextMeetingCard({ mentorData }) {
  if (!mentorData) return null

  return (
    <div className="bg-fuchsia-50/70 border border-fuchsia-200/70 rounded-[22px] p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-white/60 border border-fuchsia-200 text-fuchsia-600 flex items-center justify-center shrink-0">
          <Video size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-950">Next Mentor Meeting</h3>
          <p className="text-sm font-medium text-slate-600">Scheduled Sessions</p>
        </div>
      </div>

      {mentorData.next_meeting ? (
        <div className="flex-1 flex flex-col">
          <div className="bg-white/80 border border-slate-200/60 rounded-xl p-5 mb-4 shadow-sm">
            <p className="text-base font-bold text-slate-950">{mentorData.next_meeting.title}</p>
            <p className="text-sm text-fuchsia-600 mt-1 font-bold flex items-center gap-2">
              <CalendarDays size={14} />
              {new Date(mentorData.next_meeting.scheduled_at).toLocaleString()} · {mentorData.next_meeting.duration_minutes}min
            </p>
            {mentorData.next_meeting.agenda && (
              <p className="text-sm mt-3 font-medium p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-100">
                <span className="font-bold">Agenda:</span> {mentorData.next_meeting.agenda}
              </p>
            )}
            {mentorData.next_meeting.meeting_url && (
              <a href={mentorData.next_meeting.meeting_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-sm font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-700 px-4 py-2.5 rounded-xl transition-colors w-full justify-center">
                <Video size={16} /> Join Meeting
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center text-center bg-white/50 border border-fuchsia-100 rounded-xl p-6 mb-4">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mx-auto mb-3 text-slate-400 border border-slate-100 shadow-sm">
            <CalendarDays size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-950 mb-1">No upcoming sessions</h4>
          <p className="text-xs text-slate-500 font-medium max-w-[200px] mx-auto">Your mentor hasn't scheduled any check-ins yet.</p>
        </div>
      )}
      
      {!mentorData.next_meeting && (
         <button className="mt-auto w-full bg-white/70 border border-fuchsia-200 hover:bg-fuchsia-50 text-fuchsia-700 font-bold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Video size={16} /> View Meeting Details
         </button>
      )}
    </div>
  )
}


function MentorFeedbackVisibleSection({ mentorData }) {
  const feedback = mentorData?.visible_feedback ?? []
  const actionItems = mentorData?.action_items ?? []

  return (
    <div className="bg-white/90 border border-white/80 rounded-[22px] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm mb-6">
      <div className="flex items-center gap-2 mb-5">
        <ClipboardList size={18} className="text-purple-500" />
        <h3 className="text-base font-bold text-slate-950">Mentor Feedback</h3>
      </div>

      {feedback.length > 0 ? (
        <div className="space-y-3 mb-5">
          {feedback.map(item => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm font-black text-slate-950">
                  {item.feedback_type === 'individual' ? 'Individual Feedback' : 'Team Feedback'}
                </p>
                {item.created_at && (
                  <span className="text-[11px] font-bold text-slate-400">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                )}
              </div>

              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                {item.feedback_text}
              </p>

              {item.blockers && (
                <p className="mt-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                  <span className="font-black">Blockers:</span> {item.blockers}
                </p>
              )}

              {item.progress_score !== null && item.progress_score !== undefined && (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
                  <span className="rounded-full bg-blue-50 text-blue-600 px-3 py-1">Progress {item.progress_score}/10</span>
                  {item.collaboration_score !== null && item.collaboration_score !== undefined && (
                    <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1">Collab {item.collaboration_score}/10</span>
                  )}
                  {item.execution_score !== null && item.execution_score !== undefined && (
                    <span className="rounded-full bg-orange-50 text-orange-600 px-3 py-1">Execution {item.execution_score}/10</span>
                  )}
                  {item.clarity_score !== null && item.clarity_score !== undefined && (
                    <span className="rounded-full bg-purple-50 text-purple-600 px-3 py-1">Clarity {item.clarity_score}/10</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-5">
          <p className="text-sm font-black text-slate-950">No mentor feedback yet</p>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Feedback from your mentor will appear here once submitted.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-widest text-slate-950 mb-2">
          Action Items
        </p>

        {actionItems.length > 0 ? (
          <ul className="list-disc pl-5 space-y-1 text-sm font-semibold text-slate-950">
            {actionItems.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
          </ul>
        ) : (
          <p className="text-sm font-semibold text-slate-600">
            No action items yet.
          </p>
        )}
      </div>
    </div>
  )
}


function ProjectSubmissionSection({ token }) {
  const qc = useQueryClient()
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showReplace, setShowReplace] = useState(false)

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
       qc.invalidateQueries({ queryKey: ['participant-submission', token] })
       qc.invalidateQueries({ queryKey: ['portal-access'] })
    } catch (err) {
       setError(err?.response?.data?.detail || err.message || 'Upload failed');
    } finally {
       setUploading(false)
    }
  }

  return (
    <div className="bg-white/90 border border-white/80 rounded-[22px] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm">
       <div className="flex items-center gap-2 mb-4 text-slate-950">
         <Send size={18} className="text-slate-500" />
         <h3 className="text-base font-bold text-slate-950">Submit Final Project (ZIP, max 50MB)</h3>
       </div>

       {existingSub && !showReplace ? (
         <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-emerald-600" />
              <p className="text-sm font-bold text-emerald-800">Project Submitted</p>
            </div>
            <div className="text-xs text-emerald-700 space-y-1 mb-3">
              <p><span className="font-bold">File:</span> {existingSub.original_filename}</p>
              <p><span className="font-bold">Uploaded by:</span> {existingSub.uploaded_by}</p>
            </div>
            <button onClick={() => setShowReplace(true)} className="text-xs text-emerald-600 font-bold hover:underline">Upload a replacement?</button>
         </div>
       ) : (
         <div className="flex flex-col gap-3">
           {existingSub && (
             <p className="text-xs text-orange-600 font-bold mb-1">Replacing: {existingSub.original_filename}</p>
           )}
           <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="file"
                accept=".zip"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70 shadow-sm"
                onChange={e => { setFile(e.target.files[0]); setError(''); }}
              />
             <button
               onClick={handleUpload}
               className="bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white shadow-lg shadow-orange-500/20 px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
               disabled={!file || uploading}
             >
               {uploading ? 'Uploading...' : 'Submit'}
             </button>
           </div>
           {existingSub && (
             <button onClick={() => setShowReplace(false)} className="text-xs text-slate-500 hover:underline self-start font-medium">Cancel</button>
           )}
           {error && <p className="text-xs font-bold text-red-500">{error}</p>}
         </div>
       )}
    </div>
  )
}

function ResultsSection({ data }) {
  const hasScore = typeof data?.total_score === 'number'
  const hasRank = typeof data?.rank === 'number'

  return (
    <div className="bg-white/90 border border-white/80 rounded-[22px] p-8 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm text-center border-t-4 border-t-emerald-500">
      <div className="flex items-center justify-center gap-2 mb-6 text-slate-950">
        <Trophy size={20} className="text-emerald-500" />
        <h3 className="text-lg font-extrabold text-slate-950">Final Results</h3>
      </div>
      <div className="flex flex-wrap justify-center gap-12 mt-2">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Your Score</p>
          <p className="text-4xl font-black text-emerald-600">
            {hasScore ? data.total_score.toFixed(2) : 'Pending'}
          </p>
        </div>
        <div>
           <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Global Rank</p>
           <p className="text-4xl font-black text-emerald-600">
             {hasRank ? `#${data.rank}` : '—'}
           </p>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500 mt-6">Results are final. Congratulations on completing the Hackathon!</p>
    </div>
  )
}

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal-access'] }),
    onError: () => alert('Something went wrong. Please check your network connection.')
  })

  if (currentStatus === true || (mutation.isSuccess && mutation.variables === true)) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-[22px] p-6 text-center mt-6">
        <p className="text-sm font-bold text-emerald-700 flex items-center justify-center gap-2">
          <CheckCircle size={18} /> Your attendance for the Grand Finale is locked in!
        </p>
      </div>
    )
  }

  if (currentStatus === false || (mutation.isSuccess && mutation.variables === false)) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-[22px] p-6 text-center mt-6">
        <p className="text-sm font-medium text-slate-500 flex items-center justify-center gap-2">
          <X size={18} /> You have declined the grand finale progression slot.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white/90 border border-white/80 rounded-[22px] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-sm mt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
            🎉 Final Round Invitation!
          </h3>
          <p className="text-sm text-slate-600 mt-1 font-medium">
            Your team has qualified for the Grand Finale round. Please confirm your availability now.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {mutation.isPending && mutation.variables === true ? 'Saving...' : 'Accept Invite'}
          </button>
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

function SupportFooter({ supportEmail }) {
  return (
    <div className="text-center pt-8 pb-12">
      <p className="text-sm font-medium text-slate-600">
        Questions? Reach the committee at{' '}
        <a href={`mailto:${supportEmail}`} className="text-slate-950 font-bold hover:underline">{supportEmail}</a>
      </p>
      <p className="text-xs font-medium text-slate-500 mt-1">EventOS • WISE@TI Hackathon</p>
    </div>
  )
}

function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fbff] via-[#eef6fb] to-[#f7fbff] text-slate-950 px-4 py-12 flex flex-col items-center">
      <div className="w-full max-w-7xl">
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="h-10 w-64 bg-slate-200 rounded animate-pulse mb-12" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-white/60 rounded-[22px] animate-pulse" />
          <div className="h-64 bg-white/60 rounded-[22px] animate-pulse" />
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

  if (!urlToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200">
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-950 mb-1">No access token</h2>
          <p className="text-sm font-medium text-slate-600">Please use the secure participant link sent to your email.</p>
        </div>
      </div>
    )
  }

  if (isLoading) return <PortalSkeleton />

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200">
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-950 mb-2">
            {error.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            {error.message?.includes('expired')
              ? 'Your access link has expired. Contact the committee.'
              : `Could not verify your access. (${error.message})`
            }
          </p>
        </div>
      </div>
    )
  }

  if (data && data.evaluator_id) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200">
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-950 mb-1">Wrong portal</h2>
          <p className="text-sm font-medium text-slate-600">This link is for participants.</p>
        </div>
      </div>
    )
  }

  const {
    participant_id,
    name           = 'Participant',
    email          = '',
    stage          = 'evaluation',
    team_assigned  = false,
    team_id,
    team_name,
    team_rationale,
    teammates      = [],
    timeline       = [],
    progression_confirmed = null,
  } = data ?? {}

  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'events@ti.com'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fbff] via-[#eef6fb] to-[#f7fbff] text-slate-950 font-sans pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* Top Row: Event Status, Phase, Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col">
            <PortalHeader
              name={name}
              email={email}
              eventName="AI Hackathon"
              stage={stage}
              timeline={timeline}
            />
            {participant_id && stage === 'results' && typeof data?.rank === 'number' && data.rank >= 1 && data.rank <= 3 && (
              <ProgressionInvitationSection participantId={participant_id} currentStatus={progression_confirmed} />
            )}
          </div>
          <div className="flex flex-col">
            {team_assigned && team_name
              ? <TeamRevealSection teamName={team_name} rationale={team_rationale} teammates={teammates} />
              : <AwaitingCard />
            }
          </div>
        </div>

        {/* Second Row: Project Submission */}
        {team_assigned && (stage === 'evaluation' || stage === 'results' || stage === 'development') && (
          <div className="mb-6">
            <ProjectSubmissionSection token={urlToken} />
          </div>
        )}
        {stage === 'results' && (
          <div className="mb-6">
             <ResultsSection data={data} />
          </div>
        )}

        {/* Third Row: Mentor Info, Meeting, Daily Update */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch mb-6">
          {team_assigned && (
            <>
              <div className="col-span-1">
                <YourMentorCard mentorData={mentorData} />
              </div>
              <div className="col-span-1">
                <NextMeetingCard mentorData={mentorData} />
              </div>
              <div className="col-span-1 md:col-span-2 lg:col-span-1">
                <DailyUpdateForm token={urlToken} />
              </div>
            </>
          )}
        </div>

        {team_assigned && (
          <MentorFeedbackVisibleSection mentorData={mentorData} />
        )}

        {/* Support */}
        <SupportFooter supportEmail={supportEmail} />

      </div>

      {/* Floating Toggle Button */}
      {team_assigned && team_id && !isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-8 right-8 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white font-semibold shadow-[0_18px_35px_rgba(249,115,22,0.35)] hover:from-orange-600 hover:to-orange-700 transition-transform hover:-translate-y-1"
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
    </div>
  )
}
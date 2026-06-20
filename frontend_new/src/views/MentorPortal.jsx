import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
  Users, Calendar, MessageSquare, AlertTriangle, Loader2,
  Send, Plus, ChevronDown, ChevronRight,
  Target, X, Moon, Bell, Menu, LayoutGrid, CalendarDays
} from 'lucide-react'
import { mentorApi, portalApi, eventStorage } from '../services/api'
import TeamChatPanel from '../components/TeamChatPanel'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700">
      {children}
    </span>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 flex flex-col">
      <div className="bg-white/80 border-b border-slate-200/70 h-16 w-full animate-pulse" />
      <div className="max-w-6xl w-full mx-auto px-4 py-12">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-white/60 rounded-[24px] animate-pulse" />)}
        </div>
        <div className="h-24 bg-white/60 rounded-[24px] animate-pulse" />
      </div>
    </div>
  )
}

// ── Stats card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, statusText, colorTheme, icon: Icon }) {
  const theme = {
    blue: { icon: 'bg-blue-50 text-blue-600 border border-blue-200', dot: 'bg-blue-500', text: 'text-blue-700' },
    orange: { icon: 'bg-orange-50 text-orange-600 border border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700' },
    purple: { icon: 'bg-purple-50 text-purple-600 border border-purple-200', dot: 'bg-purple-500', text: 'text-purple-700' },
    green: { icon: 'bg-emerald-50 text-emerald-600 border border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  }[colorTheme]

  return (
    <div className="bg-white/90 border border-slate-200/70 rounded-[24px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] p-6 flex flex-col h-full backdrop-blur transition-all hover:-translate-y-1">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-bold text-slate-950 uppercase tracking-widest mb-2">{label}</p>
          <h3 className="text-4xl font-black text-slate-950 tracking-tight">{value ?? '0'}</h3>
        </div>
        {Icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${theme.icon}`}>
            <Icon size={24} />
          </div>
        )}
      </div>
      <div className="mt-auto pt-4 border-t border-slate-200/70">
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.text}`}>
            {statusText}
          </span>
        </div>
        <p className="text-xs font-medium text-slate-500 leading-snug">{sub}</p>
      </div>
    </div>
  )
}

// ── Top Navbar ─────────────────────────────────────────────────────────────
function PortalNavbar({ mentorName }) {
  return (
    <div className="bg-white/80 border-b border-slate-200/70 backdrop-blur shadow-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Menu size={20} className="text-slate-600 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center text-red-500">
              <LayoutGrid size={24} />
            </div>
            <div>
               <h1 className="text-sm font-black text-slate-950 leading-tight uppercase tracking-widest">WISE@TI HACKATHON</h1>
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mentor Portal</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">System Live</span>
          </div>
          <Moon size={20} className="text-slate-400 hidden sm:block" />
          <div className="relative">
            <Bell size={20} className="text-slate-400" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white">2</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold flex items-center justify-center text-sm">
              {initials(mentorName)[0] || 'M'}
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Schedule meeting form ──────────────────────────────────────────────────
function ScheduleMeetingForm({ teamId, token, onSuccess }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', meeting_url: '', scheduled_at: '', duration_minutes: 30, agenda: '',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const isoDate = new Date(form.scheduled_at).toISOString();
      return mentorApi.createSession({ ...form, team_id: teamId, duration_minutes: +form.duration_minutes, scheduled_at: isoDate }, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-teams'] })
      setForm({ title: '', meeting_url: '', scheduled_at: '', duration_minutes: 30, agenda: '' })
      onSuccess?.()
    },
  })

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative overflow-hidden group mb-4">
      <div className="relative z-10">
        <h3 className="text-sm font-bold text-slate-950 mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-blue-500" /> Schedule Meeting
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
              placeholder="Daily standup" className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm placeholder:text-slate-400 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Meeting URL</label>
            <input value={form.meeting_url} onChange={e => setForm(f => ({...f, meeting_url: e.target.value}))}
              placeholder="https://meet.google.com/..." className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm placeholder:text-slate-400 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Date & Time</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))}
              className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Duration (min)</label>
            <input type="number" min={5} max={480} value={form.duration_minutes} onChange={e => setForm(f => ({...f, duration_minutes: e.target.value}))}
              className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm transition-all" />
          </div>
        </div>
        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Agenda (optional)</label>
          <textarea value={form.agenda} onChange={e => setForm(f => ({...f, agenda: e.target.value}))}
            rows={2} placeholder="Topics to discuss..." className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none shadow-sm placeholder:text-slate-400 transition-all" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onSuccess} className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.meeting_url || !form.scheduled_at}
            className="flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all">
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Schedule
          </button>
        </div>
        {mutation.isError && <p className="mt-3 text-xs font-bold text-red-500">{mutation.error?.message}</p>}
        {mutation.isSuccess && <p className="mt-3 text-xs font-bold text-emerald-600">Meeting scheduled successfully!</p>}
      </div>
    </div>
  )
}

// ── Daily progress form ────────────────────────────────────────────────────
function DailyProgressForm({ teamId, members, token, onSuccess }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState('team') // 'team' | 'individual'
  const [form, setForm] = useState({
    progress_score: '', collaboration_score: '', execution_score: '', clarity_score: '',
    blockers: '', feedback_text: '', action_items_str: '', visible_to_participant: true,
    participant_id: '',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        team_id: teamId,
        feedback_type: tab === 'team' ? 'daily_update' : 'individual',
        feedback_text: form.feedback_text,
        action_items: form.action_items_str.split('\n').map(s => s.trim()).filter(Boolean),
        visible_to_participant: form.visible_to_participant,
      }
      if (form.progress_score) payload.progress_score = +form.progress_score
      if (form.collaboration_score) payload.collaboration_score = +form.collaboration_score
      if (form.execution_score) payload.execution_score = +form.execution_score
      if (form.clarity_score) payload.clarity_score = +form.clarity_score
      if (form.blockers) payload.blockers = form.blockers
      if (tab === 'individual' && form.participant_id) {
        payload.participant_id = form.participant_id
      }
      return mentorApi.submitFeedback(payload, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-teams'] })
      setForm({ progress_score: '', collaboration_score: '', execution_score: '', clarity_score: '',
        blockers: '', feedback_text: '', action_items_str: '', visible_to_participant: true, participant_id: '' })
      onSuccess?.()
    },
  })

  const scoreField = (key, label) => (
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1.5">{label} (0-10)</label>
      <input type="number" min={0} max={10} step={0.5} value={form[key]}
        onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
        className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 shadow-sm transition-all" />
    </div>
  )

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative overflow-hidden group mb-4">
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-200/60">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0 shadow-sm">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-950">Submit Feedback</h3>
            <p className="text-[11px] font-medium text-slate-500">Review their daily progress</p>
          </div>
        </div>
        {/* Tab toggle */}
        <div className="flex gap-1 mb-5 bg-slate-100 border border-slate-200 rounded-xl p-1 w-fit shadow-inner">
          <button onClick={() => setTab('team')} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${tab === 'team' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Team Update
          </button>
          <button onClick={() => setTab('individual')} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${tab === 'individual' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Individual Feedback
          </button>
        </div>

        {tab === 'individual' && members?.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Participant</label>
            <select value={form.participant_id} onChange={e => setForm(f => ({...f, participant_id: e.target.value}))}
              className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 shadow-sm transition-all">
              <option value="">-- select --</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {scoreField('progress_score', 'Progress')}
          {scoreField('collaboration_score', 'Collaboration')}
          {scoreField('execution_score', 'Execution')}
          {scoreField('clarity_score', 'Clarity')}
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Feedback</label>
          <textarea value={form.feedback_text} onChange={e => setForm(f => ({...f, feedback_text: e.target.value}))}
            rows={3} placeholder="Observations, progress notes..." className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 resize-none shadow-sm placeholder:text-slate-400 transition-all" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Blockers</label>
            <textarea value={form.blockers} onChange={e => setForm(f => ({...f, blockers: e.target.value}))}
              rows={2} placeholder="Any blockers..." className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 resize-none shadow-sm placeholder:text-slate-400 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Action Items (one per line)</label>
            <textarea value={form.action_items_str} onChange={e => setForm(f => ({...f, action_items_str: e.target.value}))}
              rows={2} placeholder="Complete API integration&#10;Fix auth bug" className="w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 resize-none shadow-sm placeholder:text-slate-400 transition-all" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={form.visible_to_participant} onChange={e => setForm(f => ({...f, visible_to_participant: e.target.checked}))}
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4" />
            Visible to participant
          </label>
          <div className="flex items-center gap-3">
             <button onClick={onSuccess} className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
                Cancel
             </button>
             <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.feedback_text}
               className="flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all">
               {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Submit
             </button>
          </div>
        </div>
        {mutation.isError && <p className="mt-3 text-xs font-bold text-red-500">{mutation.error?.message}</p>}
        {mutation.isSuccess && <p className="mt-3 text-xs font-bold text-emerald-600">Feedback submitted!</p>}
      </div>
    </div>
  )
}

// ── Workspace Card ───────────────────────────────────────────────────────────
function WorkspaceCard({ title, icon: Icon, mainText, subText, actionText, onAction, colorTheme }) {
  const theme = {
    blue: { icon: 'bg-blue-50 text-blue-600 border border-blue-200', btn: 'text-blue-700 border-blue-200 hover:bg-blue-50' },
    purple: { icon: 'bg-purple-50 text-purple-600 border border-purple-200', btn: 'text-purple-700 border-purple-200 hover:bg-purple-50' }
  }[colorTheme]

  return (
    <div className="bg-white border border-slate-200/80 rounded-[24px] p-6 shadow-sm mb-4">
      <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${theme.icon}`}>
          <Icon size={24} />
        </div>
        <h3 className="text-sm font-extrabold text-slate-950">{title}</h3>
      </div>
      <div className="mb-6">
        <h4 className="text-base font-black text-slate-950 mb-1">{mainText}</h4>
        <p className="text-sm font-medium text-slate-500 whitespace-pre-line truncate">{subText}</p>
      </div>
      <button onClick={onAction} className={`w-full py-3 bg-white border rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${theme.btn}`}>
        <Plus size={16} /> {actionText}
      </button>
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────
function TeamCard({ team, token, eventId, mentorId }) {
  const [expanded, setExpanded] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [chatTab, setChatTab] = useState('team')

  const closeModal = () => setActiveModal(null)

  const renderModal = () => {
    if (!expanded) return null
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/35 backdrop-blur-sm">
        <div className="bg-white w-full max-w-5xl rounded-[28px] shadow-[0_28px_90px_rgba(15,23,42,0.25)] border border-slate-200/80 flex flex-col h-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Modal Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
             <div>
               <h2 className="text-xl font-black text-slate-950">{team.team_name} Workspace</h2>
               <p className="text-sm font-medium text-slate-500 mt-1">Manage meetings, feedback, and team chat</p>
             </div>
             <button onClick={() => setExpanded(false)} className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
                <X size={20} />
             </button>
          </div>

          {/* Modal Body */}
          <div className="flex flex-col md:flex-row flex-1 min-h-0 bg-slate-50/50">
             
             {/* Left Column: Actions */}
             <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar md:border-r border-slate-100">
                {activeModal === 'schedule' ? (
                  <ScheduleMeetingForm teamId={team.team_id} token={token} onSuccess={closeModal} />
                ) : activeModal === 'feedback' ? (
                  <DailyProgressForm teamId={team.team_id} members={team.members} token={token} onSuccess={closeModal} />
                ) : (
                  <div className="grid grid-cols-1 gap-4 max-w-xl">
                    <WorkspaceCard
                      title="Schedule Meet"
                      icon={CalendarDays}
                      colorTheme="blue"
                      mainText={team.next_meeting ? "Scheduled" : "No upcoming meetings."}
                      subText={team.next_meeting ? `${new Date(team.next_meeting.scheduled_at).toLocaleString()}\n${team.next_meeting.duration_minutes}min` : "Schedule your next meeting with the team."}
                      actionText={team.next_meeting ? "View / Edit Meeting" : "Schedule Meeting"}
                      onAction={() => setActiveModal('schedule')}
                    />

                    <WorkspaceCard
                      title="Submit Feedback"
                      icon={MessageSquare}
                      colorTheme="purple"
                      mainText={`${team.feedback_count ?? 0} Feedbacks`}
                      subText={`Progress Score: ${team.latest_progress_score?.toFixed(1) ?? 'N/A'}/10`}
                      actionText="Submit Feedback"
                      onAction={() => setActiveModal('feedback')}
                    />
                  </div>
                )}
             </div>

             {/* Right Column: Chat */}
             {eventId && mentorId && (
               <div className="w-full md:w-[400px] flex flex-col bg-white shrink-0 border-t md:border-t-0 md:border-l border-slate-100 min-h-[50vh] md:min-h-0">
                  <div className="flex px-4 pt-2 gap-2 overflow-x-auto border-b border-slate-100 shrink-0">
                     <button onClick={() => setChatTab('team')} className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${chatTab === 'team' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Team Chat</button>
                     <button onClick={() => setChatTab('mentor')} className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${chatTab === 'mentor' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Mentor Chat</button>
                     <button onClick={() => setChatTab('support')} className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${chatTab === 'support' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Event Support</button>
                  </div>
                  <div className="flex-1 min-h-0 relative">
                     {chatTab === 'team' ? (
                       <TeamChatPanel
                         eventId={eventId}
                         teamId={team.team_id}
                         token={token}
                         kind="mentor"
                         title="Team Chat"
                         currentSenderId={mentorId}
                         currentSenderRole="mentor"
                         inline={true}
                       />
                     ) : (
                       <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-400">
                          <MessageSquare size={32} className="mb-4 opacity-50" />
                          <h4 className="text-sm font-bold text-slate-950 mb-1">No messages yet</h4>
                          <p className="text-xs font-medium">Start the conversation with your team.</p>
                          <div className="absolute bottom-6 left-6 right-6 flex items-center gap-2">
                             <input placeholder="Type a message..." disabled className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-sm outline-none" />
                             <button disabled className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 opacity-50"><Send size={16} className="-ml-0.5 mt-0.5" /></button>
                          </div>
                       </div>
                     )}
                  </div>
               </div>
             )}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <>
      <div className="bg-white/90 border border-slate-200/70 rounded-[22px] shadow-sm mb-4">
        <div className="flex items-center gap-4 px-6 py-5">
          <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
            {initials(team.team_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-slate-950">{team.team_name}</p>
            <p className="text-sm font-medium text-slate-500 mt-0.5">{team.member_count} members · {team.feedback_count} feedbacks</p>
          </div>
          <button onClick={() => setExpanded(true)} className="hidden sm:flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            Manage Team <ChevronRight size={16} className="text-slate-400" />
          </button>
        </div>
        <div className="sm:hidden px-6 pb-5 pt-1">
          <button onClick={() => setExpanded(true)} className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            Manage Team <ChevronRight size={16} className="text-slate-400" />
          </button>
        </div>
      </div>
      {renderModal()}
    </>
  )
}

// ── Main portal component ──────────────────────────────────────────────────
export default function MentorPortal() {
  const { token, setToken } = useAuth()

  const urlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token') || token
  }, [token])

  const {eventId} = useParams()
  useEffect(() => {
    if (eventId) eventStorage.set(eventId)
  }, [eventId])

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (t) setToken(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Load mentor profile via portal access
  const { data: profileData, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['portal-access', urlToken],
    queryFn: () => portalApi.access(urlToken),
    enabled: !!urlToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  // Load mentor teams
  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['mentor-teams', urlToken],
    queryFn: () => mentorApi.myTeams(urlToken),
    enabled: !!urlToken && profileData?.role === 'mentor',
    refetchInterval: 30_000,
  })

  // ── Guards ─────────────────────────────────────────────────────────────
  if (!urlToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200">
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-950 mb-1">No access token</h2>
          <p className="text-sm font-medium text-slate-600">Please use the secure mentor link sent to your email.</p>
        </div>
      </div>
    )
  }

  if (profileLoading) return <PortalSkeleton />

  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200">
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-950 mb-2">
            {profileError.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            {profileError.message?.includes('expired')
              ? 'Your access link has expired. Contact the committee for a fresh link.'
              : `Could not verify your access. (${profileError.message})`
            }
          </p>
        </div>
      </div>
    )
  }

  // Wrong role guard
  if (profileData && profileData.role !== 'mentor') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200">
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-950 mb-1">Wrong portal</h2>
          <p className="text-sm font-medium text-slate-600">
            This link is for mentors. Your token has role <code className="bg-slate-100 border border-slate-200 px-1 rounded text-xs">{profileData.role}</code>.
          </p>
        </div>
      </div>
    )
  }

  const profile = profileData ?? {}
  const teams = teamsData?.teams ?? []
  const mentorName = profile.name?.split(' ')[0] ?? 'Mentor'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 text-slate-950 font-sans pb-20 relative overflow-x-hidden">
      
      <PortalNavbar mentorName={profile.name ?? 'Mentor'} />

      {/* Decorative Dots */}
      <div className="absolute top-32 right-12 opacity-30 hidden lg:grid grid-cols-5 gap-3 pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        ))}
      </div>
      <div className="absolute bottom-64 left-12 opacity-30 hidden lg:grid grid-cols-5 gap-3 pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-400" />
        ))}
      </div>

      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 relative z-10">
        
        {/* Hero Header */}
        <div className="mb-10">
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Mentor Portal</p>
          <h1 className="text-4xl lg:text-5xl font-black text-slate-950 mb-2 tracking-tight">
            Welcome, {mentorName} 👋
          </h1>
          <p className="text-base font-medium text-slate-600">{profile.email || '—'}</p>
          <p className="text-sm font-medium text-slate-500 mt-0.5">{profile.organization || '—'}</p>
          
          <div className="flex gap-2 mt-4 flex-wrap">
            {profile.expertise_areas?.length > 0 ? profile.expertise_areas.map(a => (
               <Badge key={a}>{a}</Badge>
            )) : <Badge>No skills specified</Badge>}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard
            label="Assigned Teams"
            value={profile.assigned_teams_count}
            icon={Users}
            colorTheme="blue"
            statusText="Active Mentorship"
            sub={`Actively mentoring ${profile.assigned_teams_count ?? 0} team in the current event cycle.`}
          />
          <StatCard
            label="Meetings Scheduled"
            value={profile.meetings_scheduled}
            icon={CalendarDays}
            colorTheme="orange"
            statusText={profile.meetings_scheduled > 0 ? "Sessions Scheduled" : "No Sessions Planned"}
            sub={profile.meetings_scheduled > 0 ? `You have ${profile.meetings_scheduled} upcoming team check-ins.` : "Schedule your next 1:1 team check-in to plan."}
          />
          <StatCard
            label="Updates Today"
            value={profile.updates_today}
            icon={MessageSquare}
            colorTheme="purple"
            statusText="Updates Received"
            sub={`Received ${profile.updates_today ?? 0} progress update(s) today.`}
          />
          <StatCard
            label="Pending Updates"
            value={profile.pending_updates_count}
            icon={Target}
            colorTheme="green"
            statusText={profile.pending_updates_count > 0 ? "Pending Updates" : "All Caught Up"}
            sub={profile.pending_updates_count > 0 ? `${profile.pending_updates_count} teams are yet to submit today's progress.` : "All assigned teams have submitted their updates."}
          />
        </div>

        {/* Teams */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-slate-950 mb-6 flex items-center gap-2">
            <Users size={20} className="text-slate-500" /> Your Teams
          </h2>

          {teamsLoading ? (
            <div className="space-y-4">
              {[1,2].map(i => <div key={i} className="h-24 bg-white/60 rounded-[22px] animate-pulse" />)}
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-16 bg-white/90 rounded-[24px] border border-slate-200/70 shadow-sm">
              <Users size={36} className="mx-auto mb-3 text-slate-400" />
              <p className="text-base text-slate-950 font-bold">No teams assigned yet.</p>
              <p className="text-sm text-slate-500 mt-1 font-medium">The committee will assign you to teams soon.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {teams.map(team => (
                <TeamCard
                  key={team.team_id}
                  team={team}
                  token={urlToken}
                  eventId={eventId}
                  mentorId={profileData?.mentor_id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-8 pb-10">
          <p className="text-sm font-medium text-slate-500">EventOS • WISE@TI Hackathon • Mentor Portal</p>
        </div>
      </div>
    </div>
  )
}
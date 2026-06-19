// src/views/MentorPortal.jsx
// Full-page mentor portal — accessed via /mentor?token=<JWT>
// Mentor can: view teams, schedule meetings, submit daily updates, give individual feedback

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
  Users, Calendar, MessageSquare, AlertTriangle, Loader2,
  Clock, Send, Plus, ChevronDown, ChevronUp,
  Target, X, ClipboardList, Activity, LayoutDashboard
} from 'lucide-react'
import { mentorApi, portalApi,eventStorage } from '../services/api'
import TeamChatPanel from '../components/TeamChatPanel'
import AppLayout from '../components/AppLayout'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green:  'bg-green-50 border border-green-200 text-green-700',
    red:    'bg-rose-50 border border-rose-200 text-rose-700',
    amber:  'bg-amber-50 border border-amber-200 text-amber-700',
    teal:   'bg-teal-50 border border-teal-200 text-teal-700',
    gray:   'bg-surface border border-border text-foreground',
  }[colour] ?? 'bg-surface border border-border text-foreground'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  )
}



// ── Loading skeleton ───────────────────────────────────────────────────────
function PortalSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-2" />
      <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />)}
      </div>
      <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
    </div>
  )
}

// ── Stats card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, statusText, statusColour = 'teal', colour = 'teal', icon: Icon, trend }) {
  const colorMap = {
    emerald: { icon: 'bg-emerald-50 text-emerald-600 border border-emerald-200', glow: 'from-emerald-500/20', border: 'border-t-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
    green: { icon: 'bg-emerald-50 text-emerald-600 border border-emerald-200', glow: 'from-emerald-500/20', border: 'border-t-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
    red: { icon: 'bg-rose-50 text-rose-600 border border-rose-200', glow: 'from-rose-500/20', border: 'border-t-rose-500', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
    amber: { icon: 'bg-amber-50 text-amber-600 border border-amber-200', glow: 'from-amber-500/20', border: 'border-t-amber-500', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
    teal: { icon: 'bg-teal-50 text-teal-600 border border-teal-200', glow: 'from-teal-500/20', border: 'border-t-teal-500', dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400' },
    slate: { icon: 'bg-slate-50 text-slate-600 border border-slate-200', glow: 'from-slate-500/20', border: 'border-t-slate-500', dot: 'bg-slate-500', text: 'text-slate-700 dark:text-slate-400' },
  }
  const theme = colorMap[colour] || colorMap.teal;
  const statusTheme = colorMap[statusColour] || colorMap.teal;

  return (
    <div className={`glass-card rounded-2xl p-5 relative overflow-hidden group flex flex-col justify-between h-full border-t-4 ${theme.border} transition-all hover:-translate-y-1 hover:scale-[1.02]`}>
      <div className={`absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br ${theme.glow} to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none`} />

      <div className="relative z-10 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{label}</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black text-foreground tracking-tight">{value ?? '—'}</h3>
              {trend && <span className={`text-sm font-bold ${trend > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{trend > 0 ? '+' : ''}{trend}%</span>}
            </div>
          </div>
          {Icon && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${theme.icon}`}>
              <Icon size={20} />
            </div>
          )}
        </div>
        
        <div className="mt-auto pt-3 border-t border-border/50">
          {statusText && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusTheme.dot} shadow-[0_0_8px_currentColor]`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${statusTheme.text}`}>
                {statusText}
              </span>
            </div>
          )}
          {sub && <p className="text-[11px] font-medium text-muted leading-snug">{sub}</p>}
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
    <div className="glass-card rounded-2xl border-t-4 border-t-teal-500 shadow-sm p-5 relative overflow-hidden group">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
      <div className="relative z-10">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Calendar size={14} className="text-teal-600" /> Schedule Meeting
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
              placeholder="Daily standup" className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Meeting URL</label>
            <input value={form.meeting_url} onChange={e => setForm(f => ({...f, meeting_url: e.target.value}))}
              placeholder="https://meet.google.com/..." className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Date & Time</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))}
              className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Duration (minutes)</label>
            <input type="number" min={5} max={480} value={form.duration_minutes} onChange={e => setForm(f => ({...f, duration_minutes: e.target.value}))}
              className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm" />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-bold text-muted mb-1">Agenda (optional)</label>
          <textarea value={form.agenda} onChange={e => setForm(f => ({...f, agenda: e.target.value}))}
            rows={2} placeholder="Topics to discuss..." className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none shadow-sm placeholder-slate-400" />
        </div>
        <div className="flex justify-end">
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.meeting_url || !form.scheduled_at}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg btn-primary text-white hover:bg-teal-700 disabled:opacity-100 disabled:bg-teal-100 dark:disabled:bg-teal-900/50 disabled:text-teal-400 dark:disabled:text-teal-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed shadow-sm transition-all">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Schedule
          </button>
        </div>
        {mutation.isError && <p className="mt-2 text-xs font-semibold text-teal-500">{mutation.error?.message}</p>}
        {mutation.isSuccess && <p className="mt-2 text-xs font-semibold text-teal-600">Meeting scheduled successfully!</p>}
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
      <label className="block text-xs font-bold text-muted mb-1">{label} (0-10)</label>
      <input type="number" min={0} max={10} step={0.5} value={form[key]}
        onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
        className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C84BEA] focus:border-[#C84BEA] shadow-sm" />
    </div>
  )

  return (
    <div className="glass-card rounded-2xl border border-border shadow-sm p-5 relative overflow-hidden group">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-[#C84BEA]/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
          <div className="w-10 h-10 rounded-xl bg-[#F8E8FA] dark:bg-[#3C0B40]/50 text-[#C84BEA] dark:text-[#DEA3E6] border border-[#F0D1F5] dark:border-[#5F1B69]/50 flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Submit Feedback</h3>
            <p className="text-[11px] font-medium text-muted">Review their daily progress</p>
          </div>
        </div>
        {/* Tab toggle */}
        <div className="flex gap-1 mb-4 bg-surface border border-border rounded-lg p-1 w-fit shadow-inner">
          <button onClick={() => setTab('team')} className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all shadow-sm ${tab === 'team' ? 'bg-[#F8E8FA] dark:bg-[#3C0B40]/50 text-[#C84BEA] dark:text-[#DEA3E6] border border-[#F0D1F5] dark:border-[#5F1B69]/50' : 'text-muted hover:text-foreground hover:bg-slate-200/50 shadow-none border border-transparent'}`}>
            Team Update
          </button>
          <button onClick={() => setTab('individual')} className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all shadow-sm ${tab === 'individual' ? 'bg-[#F8E8FA] dark:bg-[#3C0B40]/50 text-[#C84BEA] dark:text-[#DEA3E6] border border-[#F0D1F5] dark:border-[#5F1B69]/50' : 'text-muted hover:text-foreground hover:bg-slate-200/50 shadow-none border border-transparent'}`}>
            Individual Feedback
          </button>
        </div>

        {tab === 'individual' && members?.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs font-bold text-muted mb-1">Select Participant</label>
            <select value={form.participant_id} onChange={e => setForm(f => ({...f, participant_id: e.target.value}))}
              className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C84BEA] focus:border-[#C84BEA] shadow-sm">
              <option value="">-- select --</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {scoreField('progress_score', 'Progress')}
          {scoreField('collaboration_score', 'Collaboration')}
          {scoreField('execution_score', 'Execution')}
          {scoreField('clarity_score', 'Clarity')}
        </div>

        <div className="mb-3">
          <label className="block text-xs font-bold text-muted mb-1">Feedback</label>
          <textarea value={form.feedback_text} onChange={e => setForm(f => ({...f, feedback_text: e.target.value}))}
            rows={3} placeholder="Observations, progress notes..." className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C84BEA] focus:border-[#C84BEA] resize-none shadow-sm placeholder-slate-400" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Blockers</label>
            <textarea value={form.blockers} onChange={e => setForm(f => ({...f, blockers: e.target.value}))}
              rows={2} placeholder="Any blockers..." className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C84BEA] focus:border-[#C84BEA] resize-none shadow-sm placeholder-slate-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Action Items (one per line)</label>
            <textarea value={form.action_items_str} onChange={e => setForm(f => ({...f, action_items_str: e.target.value}))}
              rows={2} placeholder="Complete API integration&#10;Fix auth bug" className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C84BEA] focus:border-[#C84BEA] resize-none shadow-sm placeholder-slate-400" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-medium text-muted cursor-pointer">
            <input type="checkbox" checked={form.visible_to_participant} onChange={e => setForm(f => ({...f, visible_to_participant: e.target.checked}))}
              className="rounded border-border text-teal-600 focus:ring-teal-500" />
            Visible to participant
          </label>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.feedback_text}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg btn-primary text-white hover:bg-teal-700 disabled:opacity-100 disabled:bg-teal-100 dark:disabled:bg-teal-900/50 disabled:text-teal-400 dark:disabled:text-teal-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed shadow-sm transition-all">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit
          </button>
        </div>
        {mutation.isError && <p className="mt-2 text-xs font-semibold text-teal-500">{mutation.error?.message}</p>}
        {mutation.isSuccess && <p className="mt-2 text-xs font-semibold text-teal-600">Feedback submitted!</p>}
      </div>
    </div>
  )
}

// ── Workspace Card ───────────────────────────────────────────────────────────
function WorkspaceCard({ title, icon: Icon, mainText, subText, actionText, onAction, colorClass = "text-teal-600 bg-teal-50 border-teal-100 dark:bg-teal-900/30 dark:border-teal-800" }) {
  return (
    <div className="bg-background rounded-xl border border-border p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${colorClass}`}>
          <Icon size={16} />
        </div>
        <p className="text-sm font-bold text-foreground">{title}</p>
      </div>
      <div className="flex-1 mb-4 min-h-[4rem]">
        {mainText && <h4 className="text-lg font-black text-foreground mb-1 leading-tight">{mainText}</h4>}
        {subText && <p className="text-xs font-medium text-muted whitespace-pre-line truncate">{subText}</p>}
      </div>
      <button onClick={onAction} className="w-full py-2 bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 border border-border rounded-lg text-xs font-bold text-foreground transition-colors flex items-center justify-center gap-1.5">
        <Plus size={14} className="text-muted" /> {actionText}
      </button>
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────
function TeamCard({ team, token, eventId, mentorId }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [isChatExpanded, setIsChatExpanded] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: (id) => mentorApi.cancelSession(id, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-teams'] })
      qc.invalidateQueries({ queryKey: ['portal-access'] })
    }
  })

  const closeModal = () => setActiveModal(null)

  const renderModal = () => {
    if (!activeModal) return null
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-24 sm:p-6 sm:pt-24 md:p-12 md:pt-28 bg-black/55 backdrop-blur-[8px]">
        <div className="relative w-full max-w-lg">
          <button onClick={closeModal} className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted hover:text-foreground shadow-sm transition-colors">
            <X size={16} />
          </button>
          
          <div className="w-full max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl rounded-2xl">
            {activeModal === 'schedule' && <ScheduleMeetingForm teamId={team.team_id} token={token} onSuccess={closeModal} />}
            {activeModal === 'feedback' && <DailyProgressForm teamId={team.team_id} members={team.members} token={token} onSuccess={closeModal} />}
            {activeModal === 'members' && (
              <div className="space-y-3">
                {team.members?.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      ['bg-teal-50 border border-teal-200 text-teal-700', 'bg-teal-50 border border-teal-200 text-teal-700', 'bg-amber-50 border border-amber-200 text-amber-700', 'bg-teal-50 border border-teal-200 text-teal-700'][i % 4]
                    }`}>{initials(m.name)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{m.name}</p>
                      <p className="text-xs font-medium text-muted truncate">{m.institution}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeModal === 'progress' && (
              <div className="text-center py-12">
                <Target size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-foreground">Detailed Progress</p>
                <p className="text-xs font-medium text-muted">Extended progress metrics are under development.</p>
              </div>
            )}
            {activeModal === 'deliverables' && (
              <div className="text-center py-12">
                <ClipboardList size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-foreground">No Deliverables Yet</p>
                <p className="text-xs font-medium text-muted">The team hasn't submitted their final files.</p>
              </div>
            )}
            {activeModal === 'activity' && (
              <div className="text-center py-12">
                <Activity size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-foreground">Activity Feed</p>
                <p className="text-xs font-medium text-muted">Historical logs are being processed.</p>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div className="glass-card rounded-2xl border-t-4 border-t-teal-500 shadow-sm overflow-hidden relative group transition-all hover:-translate-y-1 hover:scale-[1.01]">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-surface/50 transition-colors" onClick={() => setExpanded(!expanded)}>
          <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">
            {initials(team.team_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-foreground">{team.team_name}</p>
            <p className="text-xs font-medium text-muted mt-0.5">{team.member_count} members · {team.feedback_count} feedbacks</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {team.latest_progress_score != null && (
              <Badge colour={team.latest_progress_score >= 7 ? 'green' : team.latest_progress_score >= 4 ? 'amber' : 'red'}>
                {team.latest_progress_score.toFixed(1)}/10
              </Badge>
            )}
            {team.next_meeting && (
              <Badge colour="amber">
                <Clock size={10} /> Meeting scheduled
              </Badge>
            )}
          </div>
          <button className="px-4 py-2 rounded-lg bg-surface border border-border text-xs font-bold text-teal-600 hover:bg-teal-50 hover:border-teal-200 transition-colors">
            Manage Team
          </button>
        </div>

        {expanded && createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-black/55 backdrop-blur-[8px]">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-full shrink min-h-0 relative overflow-hidden border border-border">
              {/* Workspace Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-slate-50 dark:bg-slate-900 shrink-0">
                 <div>
                   <h2 className="text-xl font-black text-slate-900 dark:text-white">{team.team_name} Workspace</h2>
                   <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">Manage meetings, feedback, and team chat</p>
                 </div>
                 <button onClick={() => setExpanded(false)} className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
                    <X size={16} />
                 </button>
              </div>

              {/* Workspace Content */}
              <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
                 
                 {/* Left Column: Actions */}
                 <div className="flex-1 p-5 sm:p-6 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-800/50 sm:border-r border-border">
                    <div className="grid grid-cols-1 gap-4">
                      {/* Schedule Meeting */}
                      <WorkspaceCard 
                        title="Schedule Meet" 
                        icon={Calendar} 
                        colorClass="text-teal-600 bg-teal-50 border-teal-100 dark:bg-teal-900/30 dark:border-teal-800"
                        mainText={team.next_meeting ? "Scheduled" : "No meeting"}
                        subText={team.next_meeting ? `${new Date(team.next_meeting.scheduled_at).toLocaleString()}\n${team.next_meeting.duration_minutes}min` : "No upcoming meetings."}
                        actionText={team.next_meeting ? "View / Edit Meeting" : "Schedule Meeting"}
                        onAction={() => setActiveModal('schedule')}
                      />

                      {/* Submit Feedback */}
                      <WorkspaceCard 
                        title="Submit Feedback" 
                        icon={MessageSquare} 
                        colorClass="text-[#C84BEA] bg-[#F8E8FA] border-[#F0D1F5] dark:bg-[#3C0B40]/50 dark:border-[#5F1B69]/50"
                        mainText={`${team.feedback_count ?? 0} Feedbacks`}
                        subText={`Progress Score: ${team.latest_progress_score?.toFixed(1) ?? 'N/A'}/10`}
                        actionText="Submit Feedback"
                        onAction={() => setActiveModal('feedback')}
                      />
                    </div>
                 </div>

                 {/* Right Column: Chat */}
                 {eventId && mentorId && (
                   <div className={`w-full sm:w-[340px] md:w-96 flex flex-col bg-background shrink-0 sm:h-auto border-t-4 sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 relative z-10 shadow-[0_-10px_15px_rgba(0,0,0,0.03)] sm:shadow-none transition-all duration-300 ease-in-out ${isChatExpanded ? 'h-[60vh]' : 'h-[25vh]'}`}>
                     {/* Mobile Chat Header */}
                     <div 
                       className="sm:hidden flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50 dark:bg-slate-900/50 shrink-0 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                       onClick={() => setIsChatExpanded(!isChatExpanded)}
                     >
                       <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                         <h3 className="text-sm font-bold text-foreground">Live Team Chat</h3>
                       </div>
                       <button className="text-muted hover:text-foreground transition-colors p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                         {isChatExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                       </button>
                     </div>
                     <div className="flex-1 min-h-0">
                       <TeamChatPanel
                         eventId={eventId}
                         teamId={team.team_id}
                         token={token}
                         kind="mentor"
                         title={`Chat`}
                         accentClass="bg-teal-700 hover:bg-teal-800"
                         currentSenderId={mentorId}
                         currentSenderRole="mentor"
                         inline={true}
                       />
                     </div>
                   </div>
                 )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Render Active Action Modal Overlay (Schedule/Feedback) */}
        {renderModal()}
      </div>
    </div>
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
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-1">No access token</h2>
          <p className="text-sm font-medium text-muted">
            Please use the secure mentor link sent to your email.
            It looks like <code className="text-xs bg-slate-200 text-foreground px-1 py-0.5 rounded border border-border">/mentor?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  if (profileLoading) return <PortalSkeleton />

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-teal-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">
            {profileError.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm font-medium text-muted leading-relaxed">
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
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-1">Wrong portal</h2>
          <p className="text-sm font-medium text-muted">
            This link is for mentors. Your token has role <code className="bg-slate-200 border border-border px-1 rounded text-xs">{profileData.role}</code>.
          </p>
        </div>
      </div>
    )
  }

  const profile = profileData ?? {}
  const teams = teamsData?.teams ?? []

  return (
    <AppLayout title="WiSE@TI Hackathon" subtitle="Mentor Portal" userName={profile.name}>
      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">Mentor Portal</p>
          <h1 className="text-2xl font-black text-foreground mb-1">
            Welcome, {profile.name?.split(' ')[0] ?? 'Mentor'} 👋
          </h1>
          <p className="text-sm font-medium text-muted">{profile.email}</p>
          {profile.organization && (
            <p className="text-xs font-medium text-muted mt-0.5">{profile.organization}</p>
          )}
          {profile.expertise_areas?.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {profile.expertise_areas.map(a => <Badge key={a} colour="teal">{a}</Badge>)}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            label="Assigned Teams" 
            value={profile.assigned_teams_count} 
            icon={Users} 
            colour="teal"
            statusColour="teal"
            statusText="Active Mentorship"
            sub={`Actively mentoring ${profile.assigned_teams_count ?? 0} teams in the current event cycle.`}
          />
          <StatCard 
            label="Meetings Scheduled" 
            value={profile.meetings_scheduled} 
            icon={Calendar} 
            colour="teal"
            statusColour={profile.meetings_scheduled > 0 ? "teal" : "slate"}
            statusText={profile.meetings_scheduled > 0 ? "Sessions Planned" : "No Sessions Planned"}
            sub={profile.meetings_scheduled > 0 ? `You have ${profile.meetings_scheduled} upcoming team check-ins.` : "Schedule your next team check-in below."}
          />
          <StatCard 
            label="Updates Today" 
            value={profile.updates_today} 
            icon={MessageSquare} 
            colour="teal"
            statusColour={profile.updates_today > 0 ? "teal" : "slate"}
            statusText={profile.updates_today > 0 ? "Updates Received" : "Awaiting Updates"}
            sub={profile.updates_today > 0 ? `Received ${profile.updates_today} progress submissions today.` : "Waiting for progress submissions from teams."}
          />
          <StatCard 
            label="Pending Updates" 
            value={profile.pending_updates_count} 
            icon={Target} 
            colour={profile.pending_updates_count > 0 ? 'amber' : 'green'}
            statusColour={profile.pending_updates_count > 0 ? 'amber' : 'green'}
            statusText={profile.pending_updates_count > 0 ? "Action Required" : "All Caught Up"}
            sub={profile.pending_updates_count > 0 ? `${profile.pending_updates_count} teams are yet to submit today's progress.` : "All assigned teams have submitted their updates."}
          />
        </div>

        {/* Teams */}
        <div className="mb-4">
          <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <Users size={16} className="text-teal-600" /> Your Teams
          </h2>

          {teamsLoading ? (
            <div className="space-y-3">
              {[1,2].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-16 bg-background rounded-xl border border-border shadow-sm">
              <Users size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-muted font-bold">No teams assigned yet</p>
              <p className="text-xs text-muted mt-1 font-medium">The committee will assign you to teams soon.</p>
            </div>
          ) : (
            <div className="space-y-3">
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
        <div className="text-center pt-6 pb-10">
          <p className="text-xs font-medium text-muted">EventOS · WiSE@TI Hackathon · Mentor Portal</p>
        </div>
      </div>
    </AppLayout>
  )
}
import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Calendar, MessageSquare, AlertTriangle, Loader2,
  Send, Plus, ChevronDown, ChevronRight,
  Target, Bell, Menu, LayoutGrid, CalendarDays, Sun, Moon
} from 'lucide-react'
import { mentorApi, portalApi, eventStorage } from '../services/api'
import TeamChatPanel from '../components/TeamChatPanel'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'

const ThemeContext = createContext({ isDark: false, toggleTheme: () => { } });

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function Badge({ children }) {
  const { isDark } = useContext(ThemeContext);
  let colorClass = isDark ? "bg-slate-900/80 border border-white/10 text-slate-200" : "bg-white border border-slate-200 text-slate-800";
  if (children === "AI") colorClass = "bg-blue-50 text-blue-700";
  else if (children === "ML") colorClass = "bg-purple-50 text-purple-700";

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full ${colorClass}`}>
      {children}
    </span>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function PortalSkeleton() {
  const { isDark } = useContext(ThemeContext);
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fbff] via-[#eef6fb] to-[#f7fbff] flex flex-col">
      <div className={isDark ? "animate-pulse w-full h-16 border-b bg-slate-950/90 border-white/10/70 border-white/10" : "bg-white/80 border-b border-slate-200 h-16 w-full animate-pulse"} />
      <div className="max-w-6xl w-full mx-auto px-4 py-12">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[1, 2, 3, 4].map(i => <div key={i} className={isDark ? "shadow-[0_18px_45px_rgba(15,23,42,0.08)] animate-pulse rounded-[24px] border-white/80 border h-32 bg-slate-900/80" : "h-32 bg-white border border-white/80 rounded-[24px] animate-pulse shadow-[0_18px_45px_rgba(15,23,42,0.08)]"} />)}
        </div>
        <div className={isDark ? "shadow-[0_18px_45px_rgba(15,23,42,0.08)] animate-pulse rounded-[24px] border-white/80 border h-24 bg-slate-900/80" : "h-24 bg-white border border-white/80 rounded-[24px] animate-pulse shadow-[0_18px_45px_rgba(15,23,42,0.08)]"} />
      </div>
    </div>
  )
}

// ── Stats card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, statusText, colorTheme, icon: Icon }) {
  const { isDark } = useContext(ThemeContext);
  const theme = {
    blue: { icon: 'bg-blue-50 text-blue-600 border border-blue-200', dot: 'bg-blue-500', text: 'text-blue-700' },
    orange: { icon: 'bg-orange-50 text-orange-600 border border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700' },
    purple: { icon: 'bg-purple-50 text-purple-600 border border-purple-200', dot: 'bg-purple-500', text: 'text-purple-700' },
    green: { icon: 'bg-emerald-50 text-emerald-600 border border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  }[colorTheme]

  return (
    <div className="bg-white/90 border border-white/80 rounded-[24px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] p-6 flex flex-col h-full backdrop-blur-sm transition-all hover:-translate-y-1">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className={isDark ? "mb-2 tracking-widest uppercase font-bold text-slate-100" : "text-xs font-bold text-slate-950 uppercase tracking-widest mb-2"}>{label}</p>
          <h3 className={isDark ? "tracking-tight font-black text-slate-100" : "text-4xl font-black text-slate-950 tracking-tight"}>{value ?? '0'}</h3>
        </div>
        {Icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${theme.icon}`}>
            <Icon size={24} />
          </div>
        )}
      </div>
      <div className={isDark ? "border-t pt-4 mt-auto border-white/10/70 border-white/10" : "mt-auto pt-4 border-t border-slate-200"}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.text}`}>
            {statusText}
          </span>
        </div>
        <p className={isDark ? "leading-snug font-medium text-slate-400" : "text-xs font-medium text-slate-500 leading-snug"}>{sub}</p>
      </div>
    </div>
  )
}

// ── Top Navbar ─────────────────────────────────────────────────────────────

function PortalThemeToggle() {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={isDark ? "transition-colors hover:bg-slate-50 shadow-sm border rounded-xl p-2 bg-slate-900/80 border-white/10" : "p-2 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"}
      title="Toggle theme"
    >
      {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-500" />}
    </button>
  );
}

function PortalNavbar({ mentorName }) {
  const { isDark } = useContext(ThemeContext);
  return (
    <div className={isDark ? "z-40 top-0 sticky shadow-sm backdrop-blur border-b bg-slate-950/90 border-white/10/70 border-white/10" : "bg-white/80 border-b border-slate-200 backdrop-blur shadow-sm sticky top-0 z-40"}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Menu size={20} className={isDark ? "sm:block hidden text-slate-300" : "text-slate-600 hidden sm:block"} />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center text-red-500">
              <LayoutGrid size={24} />
            </div>
            <div>
              <h1 className={isDark ? "tracking-widest uppercase leading-tight font-black text-slate-100" : "text-sm font-black text-slate-950 leading-tight uppercase tracking-widest"}>WISE@TI HACKATHON</h1>
              <p className={isDark ? "tracking-widest uppercase font-bold text-slate-400" : "text-[10px] font-bold text-slate-500 uppercase tracking-widest"}>Mentor Portal</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className={isDark ? "shadow-sm border rounded-full py-1.5 px-3 gap-2 items-center sm:flex hidden border-white/10 bg-slate-900/80" : "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white shadow-sm"}>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className={isDark ? "tracking-widest uppercase font-bold text-slate-300" : "text-[10px] font-bold text-slate-700 uppercase tracking-widest"}>System Live</span>
          </div>
          <div className="hidden sm:block"><PortalThemeToggle /></div>
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
  const { isDark } = useContext(ThemeContext);
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
    <div className={isDark ? "mb-4 group overflow-hidden relative p-6 rounded-2xl border bg-slate-900/80 border-white/10" : "bg-slate-50 border border-slate-200 rounded-2xl p-6 relative overflow-hidden group mb-4"}>
      <div className="relative z-10">
        <h3 className={isDark ? "gap-2 items-center flex mb-4 font-bold text-slate-100" : "text-sm font-bold text-slate-950 mb-4 flex items-center gap-2"}>
          <Calendar size={16} className="text-blue-500" /> Schedule Meeting
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Daily standup" className={isDark ? "transition-all placeholder:text-slate-400 shadow-sm focus:border-blue-300 focus:ring-blue-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm placeholder:text-slate-400 transition-all"} />
          </div>
          <div>
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Meeting URL</label>
            <input value={form.meeting_url} onChange={e => setForm(f => ({ ...f, meeting_url: e.target.value }))}
              placeholder="https://meet.google.com/..." className={isDark ? "transition-all placeholder:text-slate-400 shadow-sm focus:border-blue-300 focus:ring-blue-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm placeholder:text-slate-400 transition-all"} />
          </div>
          <div>
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Date & Time</label>
            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              className={isDark ? "transition-all shadow-sm focus:border-blue-300 focus:ring-blue-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm transition-all"} />
          </div>
          <div>
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Duration (min)</label>
            <input type="number" min={5} max={480} value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
              className={isDark ? "transition-all shadow-sm focus:border-blue-300 focus:ring-blue-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm transition-all"} />
          </div>
        </div>
        <div className="mb-5">
          <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Agenda (optional)</label>
          <textarea value={form.agenda} onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))}
            rows={2} placeholder="Topics to discuss..." className={isDark ? "transition-all placeholder:text-slate-400 shadow-sm resize-none focus:border-blue-300 focus:ring-blue-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none shadow-sm placeholder:text-slate-400 transition-all"} />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onSuccess} className={isDark ? "shadow-sm transition-all hover:bg-slate-50 font-bold border rounded-xl py-2.5 px-5 bg-slate-900/80 border-white/10 text-slate-300" : "px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"}>
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
  const { isDark } = useContext(ThemeContext);
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
      setForm({
        progress_score: '', collaboration_score: '', execution_score: '', clarity_score: '',
        blockers: '', feedback_text: '', action_items_str: '', visible_to_participant: true, participant_id: ''
      })
      onSuccess?.()
    },
  })

  const scoreField = (key, label) => (
    <div>
      <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>{label} (0-10)</label>
      <input type="number" min={0} max={10} step={0.5} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className={isDark ? "transition-all shadow-sm focus:border-purple-300 focus:ring-purple-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 shadow-sm transition-all"} />
    </div>
  )

  return (
    <div className={isDark ? "mb-4 group overflow-hidden relative p-6 rounded-2xl border bg-slate-900/80 border-white/10" : "bg-slate-50 border border-slate-200 rounded-2xl p-6 relative overflow-hidden group mb-4"}>
      <div className="relative z-10">
        <div className={isDark ? "border-b pb-4 mb-5 gap-3 items-center flex border-white/10/60" : "flex items-center gap-3 mb-5 pb-4 border-b border-slate-200"}>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0 shadow-sm">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className={isDark ? "font-bold text-slate-100" : "text-sm font-bold text-slate-950"}>Submit Feedback</h3>
            <p className={isDark ? "font-medium text-slate-400" : "text-[11px] font-medium text-slate-500"}>Review their daily progress</p>
          </div>
        </div>
        {/* Tab toggle */}
        <div className={isDark ? "shadow-inner w-fit p-1 rounded-xl border bg-slate-100 mb-5 gap-1 flex border-white/10" : "flex gap-1 mb-5 bg-slate-100 border border-slate-200 rounded-xl p-1 w-fit shadow-inner"}>
          <button onClick={() => setTab('team')} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${tab === 'team' ? 'bg-white dark:bg-slate-950/70 text-slate-950 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'}`}>
            Team Update
          </button>
          <button onClick={() => setTab('individual')} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${tab === 'individual' ? 'bg-white dark:bg-slate-950/70 text-slate-950 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'}`}>
            Individual Feedback
          </button>
        </div>

        {tab === 'individual' && members?.length > 0 && (
          <div className="mb-4">
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Select Participant</label>
            <select value={form.participant_id} onChange={e => setForm(f => ({ ...f, participant_id: e.target.value }))}
              className={isDark ? "transition-all shadow-sm focus:border-purple-300 focus:ring-purple-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 shadow-sm transition-all"}>
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
          <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Feedback</label>
          <textarea value={form.feedback_text} onChange={e => setForm(f => ({ ...f, feedback_text: e.target.value }))}
            rows={3} placeholder="Observations, progress notes..." className={isDark ? "transition-all placeholder:text-slate-400 shadow-sm resize-none focus:border-purple-300 focus:ring-purple-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 resize-none shadow-sm placeholder:text-slate-400 transition-all"} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Blockers</label>
            <textarea value={form.blockers} onChange={e => setForm(f => ({ ...f, blockers: e.target.value }))}
              rows={2} placeholder="Any blockers..." className={isDark ? "transition-all placeholder:text-slate-400 shadow-sm resize-none focus:border-purple-300 focus:ring-purple-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 resize-none shadow-sm placeholder:text-slate-400 transition-all"} />
          </div>
          <div>
            <label className={isDark ? "mb-1.5 font-bold block text-slate-300" : "block text-xs font-bold text-slate-700 mb-1.5"}>Action Items (one per line)</label>
            <textarea value={form.action_items_str} onChange={e => setForm(f => ({ ...f, action_items_str: e.target.value }))}
              rows={2} placeholder="Complete API integration&#10;Fix auth bug" className={isDark ? "transition-all placeholder:text-slate-400 shadow-sm resize-none focus:border-purple-300 focus:ring-purple-100 focus:ring-2 focus:outline-none py-2.5 px-4 rounded-xl border w-full bg-slate-950/70 text-slate-100 border-white/10" : "w-full bg-white text-slate-950 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 resize-none shadow-sm placeholder:text-slate-400 transition-all"} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className={isDark ? "cursor-pointer font-bold gap-2 items-center flex text-slate-300" : "flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer"}>
            <input type="checkbox" checked={form.visible_to_participant} onChange={e => setForm(f => ({ ...f, visible_to_participant: e.target.checked }))}
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4" />
            Visible to participant
          </label>
          <div className="flex items-center gap-3">
            <button onClick={onSuccess} className={isDark ? "shadow-sm transition-all hover:bg-slate-50 font-bold border rounded-xl py-2.5 px-5 bg-slate-900/80 border-white/10 text-slate-300" : "px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"}>
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
  const { isDark } = useContext(ThemeContext);
  const theme = {
    blue: { icon: 'bg-blue-50 text-blue-600 border border-blue-200', btn: 'bg-white dark:bg-slate-900/80 border-blue-300 text-blue-600 hover:bg-blue-50' },
    purple: { icon: 'bg-purple-50 text-purple-600 border border-purple-200', btn: 'bg-white dark:bg-slate-900/80 border-purple-300 text-purple-600 hover:bg-purple-50' }
  }[colorTheme]

  return (
    <div className={isDark ? "mb-4 p-6 shadow-[0_14px_35px_rgba(15,23,42,0.05)] rounded-[22px] border bg-slate-900/80 border-white/10/80 border-white/10" : "bg-white border border-slate-200 rounded-[22px] shadow-[0_14px_35px_rgba(15,23,42,0.05)] p-6 mb-4"}>
      <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${theme.icon}`}>
          <Icon size={24} />
        </div>
        <h3 className={isDark ? "font-extrabold text-slate-100" : "text-sm font-extrabold text-slate-950"}>{title}</h3>
      </div>
      <div className="mb-6">
        <h4 className={isDark ? "mb-1 font-black text-slate-100" : "text-base font-black text-slate-950 mb-1"}>{mainText}</h4>
        <p className={isDark ? "truncate whitespace-pre-line font-medium text-slate-400" : "text-sm font-medium text-slate-500 whitespace-pre-line truncate"}>{subText}</p>
      </div>
      <button onClick={onAction} className={`w-full py-3 border rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${theme.btn}`}>
        <Plus size={16} /> {actionText}
      </button>
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────
function TeamCard({ team, token, eventId, mentorId }) {
  const { isDark } = useContext(ThemeContext);
  const [expanded, setExpanded] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [chatTab, setChatTab] = useState('team')

  const closeModal = () => setActiveModal(null)

  return (
    <div className="mb-4">
      <div className="bg-white/90 border border-white/80 rounded-[24px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-sm">
        <div className="flex items-center gap-4 px-6 py-5">
          <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
            {initials(team.team_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className={isDark ? "font-black text-slate-100" : "text-base font-black text-slate-950"}>{team.team_name}</p>
            <p className={isDark ? "mt-0.5 font-medium text-slate-400" : "text-sm font-medium text-slate-500 mt-0.5"}>{team.member_count} members · {team.feedback_count} feedbacks</p>
          </div>
          <button onClick={() => setExpanded(!expanded)} className={isDark ? "transition-colors hover:bg-slate-50 font-bold border rounded-xl py-2.5 px-5 gap-1.5 items-center sm:flex hidden bg-slate-900/80 border-white/10 text-slate-300" : "hidden sm:flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"}>
            Manage Team <ChevronRight size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
        <div className="sm:hidden px-6 pb-5 pt-1">
          <button onClick={() => setExpanded(!expanded)} className={isDark ? "transition-colors hover:bg-slate-50 font-bold border rounded-xl py-2.5 px-5 gap-1.5 justify-center items-center flex w-full bg-slate-900/80 border-white/10 text-slate-300" : "w-full flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"}>
            Manage Team <ChevronRight size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className={isDark ? "mt-4 overflow-hidden shadow-[0_22px_60px_rgba(15,23,42,0.10)] rounded-[28px] border bg-slate-950/90 border-white/10/80 border-white/10" : "bg-white/95 border border-slate-200 rounded-[28px] shadow-[0_22px_60px_rgba(15,23,42,0.10)] overflow-hidden mt-4"}>
          {/* Header */}
          <div className={isDark ? "border-b py-6 px-8 border-white/10/80 border-white/10" : "px-8 py-6 border-b border-slate-200"}>
            <h2 className={isDark ? "font-bold sm:text-3xl text-slate-100" : "text-2xl sm:text-3xl font-bold text-slate-950"}>{team.team_name} Workspace</h2>
            <p className={isDark ? "mt-1 font-medium text-slate-400" : "text-sm font-medium text-slate-500 mt-1"}>Manage meetings, feedback, and team chat</p>
          </div>

          {/* Body */}
          <div className={isDark ? "lg:grid-cols-[1.1fr_0.9fr] grid-cols-1 grid bg-slate-900/80" : "grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] bg-white"}>

            {/* Left Column: Actions */}
            <div className={isDark ? "space-y-6 p-8 bg-slate-900/80" : "p-8 space-y-6 bg-white"}>
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
            <div className={isDark ? "min-h-[520px] flex-col flex bg-slate-50/40 lg:border-l lg:border-t-0 border-t border-white/10/80 border-white/10" : "border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/40 flex flex-col min-h-[520px]"}>
              <div className={isDark ? "shrink-0 border-b overflow-x-auto gap-2 pt-2 px-4 flex border-white/10/80 border-white/10 bg-slate-900/80" : "flex px-4 pt-2 gap-2 overflow-x-auto border-b border-slate-200 bg-white shrink-0"}>
                <button onClick={() => setChatTab('team')} className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${chatTab === 'team' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}>Team Chat</button>
                <button onClick={() => setChatTab('mentor')} className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${chatTab === 'mentor' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}>Mentor Chat</button>
                <button onClick={() => setChatTab('support')} className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${chatTab === 'support' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}>Event Support</button>
              </div>
              <div className={isDark ? "min-h-[400px] flex-col flex relative to-white from-slate-50/40 bg-gradient-to-b flex-1 text-slate-300" : "flex-1 bg-gradient-to-b from-slate-50/40 to-white text-slate-700 relative flex flex-col min-h-[400px]"}>
                {chatTab === 'team' && eventId && mentorId ? (
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
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                    <MessageSquare size={32} className="mb-4 text-slate-300" />
                    <h4 className={isDark ? "mb-1 font-bold text-slate-100" : "text-sm font-bold text-slate-950 mb-1"}>No messages yet</h4>
                    <p className={isDark ? "font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>Start the conversation with your team.</p>
                  </div>
                )}
                {(!eventId || !mentorId || chatTab !== 'team') && (
                  <div className={isDark ? "shrink-0 p-4 border-t bg-slate-900/80 border-white/10/80 border-white/10" : "bg-white border-t border-slate-200 p-4 shrink-0"}>
                    <div className="relative flex items-center">
                      <input placeholder="Type a message..." disabled className={isDark ? "transition-all focus:border-blue-300 focus:ring-blue-100/70 focus:ring-4 focus:outline-none pr-12 py-2.5 px-4 rounded-full placeholder:text-slate-400 border bg-slate-100/80 w-full border-white/10 text-slate-200" : "w-full bg-slate-100/80 border border-slate-200 text-slate-800 placeholder:text-slate-400 rounded-full px-4 py-2.5 pr-12 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100/70 focus:border-blue-300 transition-all"} />
                      <button disabled className="absolute right-1 top-1 bottom-1 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 opacity-50"><Send size={14} className="-ml-0.5 mt-0.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main portal component ──────────────────────────────────────────────────
export default function MentorPortal() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <MentorPortalContent />
    </ThemeContext.Provider>
  )
}

function MentorPortalContent() {
  const { isDark } = useContext(ThemeContext);
  const { token, setToken } = useAuth()

  const urlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token') || token
  }, [token])

  const { eventId } = useParams()
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
        <div className={isDark ? "border shadow-sm rounded-[22px] p-8 max-w-sm text-center bg-slate-900/80 border-white/10" : "text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200"}>
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className={isDark ? "mb-1 font-bold text-slate-100" : "text-lg font-bold text-slate-950 mb-1"}>No access token</h2>
          <p className={isDark ? "font-medium text-slate-300" : "text-sm font-medium text-slate-600"}>Please use the secure mentor link sent to your email.</p>
        </div>
      </div>
    )
  }

  if (profileLoading) return <PortalSkeleton />

  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className={isDark ? "border shadow-sm rounded-[22px] p-8 max-w-sm text-center bg-slate-900/80 border-white/10" : "text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200"}>
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className={isDark ? "mb-2 font-bold text-slate-100" : "text-lg font-bold text-slate-950 mb-2"}>
            {profileError.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className={isDark ? "leading-relaxed font-medium text-slate-300" : "text-sm font-medium text-slate-600 leading-relaxed"}>
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
        <div className={isDark ? "border shadow-sm rounded-[22px] p-8 max-w-sm text-center bg-slate-900/80 border-white/10" : "text-center max-w-sm bg-white p-8 rounded-[22px] shadow-sm border border-slate-200"}>
          <AlertTriangle size={40} className="text-orange-500 mx-auto mb-4" />
          <h2 className={isDark ? "mb-1 font-bold text-slate-100" : "text-lg font-bold text-slate-950 mb-1"}>Wrong portal</h2>
          <p className={isDark ? "font-medium text-slate-300" : "text-sm font-medium text-slate-600"}>
            This link is for mentors. Your token has role <code className={isDark ? "text-xs rounded px-1 border bg-slate-100 border-white/10" : "bg-slate-100 border border-slate-200 px-1 rounded text-xs"}>{profileData.role}</code>.
          </p>
        </div>
      </div>
    )
  }

  const profile = profileData ?? {}
  const teams = teamsData?.teams ?? []
  const mentorName = profile.name?.split(' ')[0] ?? 'Mentor'

  return (
    <div className={isDark ? "overflow-x-hidden relative pb-20 font-sans bg-gradient-to-br min-h-screen from-[#0b0f14] via-slate-950 to-[#0b0f14] text-slate-100" : "min-h-screen bg-gradient-to-br from-[#f8fbff] via-[#eef6fb] to-[#f7fbff] text-slate-950 font-sans pb-20 relative overflow-x-hidden"}>

      <PortalNavbar mentorName={profile.name ?? 'Mentor'} />

      {/* Decorative Dots */}
      <div className="pointer-events-none absolute right-14 top-28 h-28 w-28 opacity-30 [background-image:radial-gradient(#cbd5e1_1.5px,transparent_1.5px)] [background-size:16px_16px]" />
      <div className="pointer-events-none absolute left-14 bottom-28 h-24 w-24 opacity-25 [background-image:radial-gradient(#f87171_1.5px,transparent_1.5px)] [background-size:16px_16px]" />

      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 relative z-10">

        {/* Hero Header */}
        <div className="mb-10">
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Mentor Portal</p>
          <h1 className={isDark ? "tracking-tight mb-2 font-black lg:text-5xl text-slate-100" : "text-4xl lg:text-5xl font-black text-slate-950 mb-2 tracking-tight"}>
            Welcome, {mentorName} 👋
          </h1>
          <p className={isDark ? "font-medium text-slate-300" : "text-base font-medium text-slate-600"}>{profile.email || '—'}</p>
          <p className={isDark ? "mt-0.5 font-medium text-slate-400" : "text-sm font-medium text-slate-500 mt-0.5"}>{profile.organization || '—'}</p>

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
          <h2 className={isDark ? "gap-2 items-center flex mb-6 font-bold text-slate-100" : "text-lg font-bold text-slate-950 mb-6 flex items-center gap-2"}>
            <Users size={20} className={isDark ? "text-slate-400" : "text-slate-500"} /> Your Teams
          </h2>

          {teamsLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-24 bg-white/60 rounded-[22px] animate-pulse" />)}
            </div>
          ) : teams.length === 0 ? (
            <div className={isDark ? "shadow-sm border rounded-[24px] bg-white/90 py-16 text-center border-white/10/70 border-white/10" : "text-center py-16 bg-white/90 rounded-[24px] border border-slate-200 shadow-sm"}>
              <Users size={36} className="mx-auto mb-3 text-slate-400" />
              <p className={isDark ? "font-bold text-slate-100" : "text-base text-slate-950 font-bold"}>No teams assigned yet.</p>
              <p className={isDark ? "font-medium mt-1 text-slate-400" : "text-sm text-slate-500 mt-1 font-medium"}>The committee will assign you to teams soon.</p>
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
          <p className={isDark ? "font-medium text-slate-400" : "text-sm font-medium text-slate-500"}>EventOS • WISE@TI Hackathon • Mentor Portal</p>
        </div>
      </div>
    </div>
  )
}
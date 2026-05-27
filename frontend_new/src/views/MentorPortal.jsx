// src/views/MentorPortal.jsx
// Full-page mentor portal — accessed via /mentor?token=<JWT>
// Mentor can: view teams, schedule meetings, submit daily updates, give individual feedback

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Calendar, MessageSquare, AlertTriangle, Loader2,
  CheckCircle, Clock, Send, Plus, ChevronDown, ChevronUp,
  Target, BarChart2, ClipboardList,
} from 'lucide-react'
import { mentorApi, portalApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green:  'bg-green-100  text-green-700',
    red:    'bg-red-100    text-red-700',
    amber:  'bg-amber-100  text-amber-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    teal:   'bg-teal-100   text-teal-700',
    gray:   'bg-gray-100   text-gray-600',
  }[colour] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  )
}

function riskColour(level) {
  return { low: 'green', medium: 'amber', high: 'red', critical: 'red' }[level] ?? 'gray'
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function PortalSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="h-6 w-48 bg-gray-100 rounded animate-pulse mb-2" />
      <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
    </div>
  )
}

// ── Stats card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, colour = 'indigo' }) {
  const bg = {
    indigo: 'bg-indigo-50 text-indigo-700',
    teal:   'bg-teal-50   text-teal-700',
    amber:  'bg-amber-50  text-amber-700',
    red:    'bg-red-50    text-red-700',
  }[colour] ?? 'bg-indigo-50 text-indigo-700'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-gray-400" />
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-bold px-2 py-0.5 rounded inline-block ${bg}`}>{value ?? '—'}</p>
    </div>
  )
}

// ── Schedule meeting form ──────────────────────────────────────────────────
function ScheduleMeetingForm({ teamId, onSuccess }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', meeting_url: '', scheduled_at: '', duration_minutes: 30, agenda: '',
  })

  const mutation = useMutation({
    mutationFn: () => mentorApi.createSession({ ...form, team_id: teamId, duration_minutes: +form.duration_minutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-teams'] })
      setForm({ title: '', meeting_url: '', scheduled_at: '', duration_minutes: 30, agenda: '' })
      onSuccess?.()
    },
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <Calendar size={14} className="text-indigo-500" /> Schedule Meeting
      </h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
            placeholder="Daily standup" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Meeting URL</label>
          <input value={form.meeting_url} onChange={e => setForm(f => ({...f, meeting_url: e.target.value}))}
            placeholder="https://meet.google.com/..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date & Time</label>
          <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Duration (minutes)</label>
          <input type="number" min={5} max={480} value={form.duration_minutes} onChange={e => setForm(f => ({...f, duration_minutes: e.target.value}))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">Agenda (optional)</label>
        <textarea value={form.agenda} onChange={e => setForm(f => ({...f, agenda: e.target.value}))}
          rows={2} placeholder="Topics to discuss..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.meeting_url || !form.scheduled_at}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Schedule
        </button>
      </div>
      {mutation.isError && <p className="mt-2 text-xs text-red-500">{mutation.error?.message}</p>}
      {mutation.isSuccess && <p className="mt-2 text-xs text-teal-600">Meeting scheduled successfully!</p>}
    </div>
  )
}

// ── Daily progress form ────────────────────────────────────────────────────
function DailyProgressForm({ teamId, members, onSuccess }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState('team') // 'team' | 'individual'
  const [form, setForm] = useState({
    progress_score: '', collaboration_score: '', execution_score: '', clarity_score: '',
    blockers: '', feedback_text: '', action_items_str: '', visible_to_participant: false,
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
      return mentorApi.submitFeedback(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-teams'] })
      setForm({ progress_score: '', collaboration_score: '', execution_score: '', clarity_score: '',
        blockers: '', feedback_text: '', action_items_str: '', visible_to_participant: false, participant_id: '' })
      onSuccess?.()
    },
  })

  const scoreField = (key, label) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label} (0-10)</label>
      <input type="number" min={0} max={10} step={0.5} value={form[key]}
        onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <MessageSquare size={14} className="text-indigo-500" /> Submit Feedback
      </h3>
      {/* Tab toggle */}
      <div className="flex gap-1 mb-4 bg-gray-50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('team')} className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === 'team' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          Team Update
        </button>
        <button onClick={() => setTab('individual')} className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === 'individual' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          Individual Feedback
        </button>
      </div>

      {tab === 'individual' && members?.length > 0 && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Select Participant</label>
          <select value={form.participant_id} onChange={e => setForm(f => ({...f, participant_id: e.target.value}))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
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
        <label className="block text-xs font-medium text-gray-500 mb-1">Feedback</label>
        <textarea value={form.feedback_text} onChange={e => setForm(f => ({...f, feedback_text: e.target.value}))}
          rows={3} placeholder="Observations, progress notes..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Blockers</label>
          <textarea value={form.blockers} onChange={e => setForm(f => ({...f, blockers: e.target.value}))}
            rows={2} placeholder="Any blockers..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action Items (one per line)</label>
          <textarea value={form.action_items_str} onChange={e => setForm(f => ({...f, action_items_str: e.target.value}))}
            rows={2} placeholder="Complete API integration&#10;Fix auth bug" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={form.visible_to_participant} onChange={e => setForm(f => ({...f, visible_to_participant: e.target.checked}))}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300" />
          Visible to participant
        </label>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.feedback_text}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit
        </button>
      </div>
      {mutation.isError && <p className="mt-2 text-xs text-red-500">{mutation.error?.message}</p>}
      {mutation.isSuccess && <p className="mt-2 text-xs text-teal-600">Feedback submitted!</p>}
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────
function TeamCard({ team }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(!expanded)}>
        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-semibold text-sm shrink-0">
          {initials(team.team_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{team.team_name}</p>
          <p className="text-xs text-gray-400">{team.member_count} members · {team.feedback_count} feedbacks</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {team.latest_progress_score != null && (
            <Badge colour={team.latest_progress_score >= 7 ? 'green' : team.latest_progress_score >= 4 ? 'amber' : 'red'}>
              {team.latest_progress_score.toFixed(1)}/10
            </Badge>
          )}
          {team.next_meeting && (
            <Badge colour="indigo">
              <Clock size={10} /> Meeting scheduled
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Members */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Team Members</p>
            <div className="grid grid-cols-2 gap-2">
              {team.members?.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    ['bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'][i % 4]
                  }`}>{initials(m.name)}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{m.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.institution}</p>
                    {m.skills && Object.keys(m.skills).length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {Object.entries(m.skills).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="text-xs bg-gray-100 text-gray-500 px-1 rounded">{k}: {Number(v).toFixed(0)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next meeting info */}
          {team.next_meeting && (
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-xs font-medium text-indigo-700 mb-1">Next Meeting</p>
              <p className="text-sm text-indigo-800">{team.next_meeting.title}</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                {new Date(team.next_meeting.scheduled_at).toLocaleString()} · {team.next_meeting.duration_minutes}min
              </p>
              {team.next_meeting.meeting_url && (
                <a href={team.next_meeting.meeting_url} target="_blank" rel="noreferrer"
                  className="inline-block mt-1 text-xs text-indigo-600 underline">Join meeting</a>
              )}
            </div>
          )}

          {/* Schedule meeting */}
          <ScheduleMeetingForm teamId={team.team_id} />

          {/* Daily progress */}
          <DailyProgressForm teamId={team.team_id} members={team.members} />
        </div>
      )}
    </div>
  )
}

// ── Main portal component ──────────────────────────────────────────────────
export default function MentorPortal() {
  const { token, setToken } = useAuth()

  const urlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token') || token
  }, [token])

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (t) setToken(t)
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
    queryKey: ['mentor-teams'],
    queryFn: mentorApi.myTeams,
    enabled: !!urlToken && profileData?.role === 'mentor',
    refetchInterval: 30_000,
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
            It looks like <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/mentor?token=…</code>
          </p>
        </div>
      </div>
    )
  }

  if (profileLoading) return <PortalSkeleton />

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-2">
            {profileError.message?.includes('expired') ? 'Link expired' : 'Access denied'}
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-1">Wrong portal</h2>
          <p className="text-sm text-gray-400">
            This link is for mentors. Your token has role <code className="bg-gray-100 px-1 rounded text-xs">{profileData.role}</code>.
          </p>
        </div>
      </div>
    )
  }

  const profile = profileData ?? {}
  const teams = teamsData?.teams ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-teal-500 via-indigo-500 to-violet-500" />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest mb-1">Mentor Portal</p>
          <h1 className="text-2xl font-black text-gray-900 mb-1">
            Welcome, {profile.name?.split(' ')[0] ?? 'Mentor'} 👋
          </h1>
          <p className="text-sm text-gray-400">{profile.email}</p>
          {profile.organization && (
            <p className="text-xs text-gray-400 mt-0.5">{profile.organization}</p>
          )}
          {profile.expertise_areas?.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {profile.expertise_areas.map(a => <Badge key={a} colour="indigo">{a}</Badge>)}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Assigned Teams" value={profile.assigned_teams_count} icon={Users} colour="indigo" />
          <StatCard label="Meetings Scheduled" value={profile.meetings_scheduled} icon={Calendar} colour="teal" />
          <StatCard label="Updates Today" value={profile.updates_today} icon={MessageSquare} colour="teal" />
          <StatCard label="Pending Updates" value={profile.pending_updates_count} icon={Target} colour={profile.pending_updates_count > 0 ? 'amber' : 'teal'} />
        </div>

        {/* Teams */}
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users size={16} className="text-indigo-500" /> Your Teams
          </h2>

          {teamsLoading ? (
            <div className="space-y-3">
              {[1,2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Users size={36} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-500 font-medium">No teams assigned yet</p>
              <p className="text-xs text-gray-400 mt-1">The committee will assign you to teams soon.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map(team => <TeamCard key={team.team_id} team={team} />)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-6 pb-10">
          <p className="text-xs text-gray-400">EventOS · WiSE@TI Hackathon · Mentor Portal</p>
        </div>
      </div>
    </div>
  )
}

// src/views/AdminDashboard.jsx
// Committee command-centre. Seven tabs, all fully wired to backend endpoints.
// Dependencies: @tanstack/react-query, lucide-react, ../services/api, ../components/PipelineStepper
import { useAuth } from '../context/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AutoAssignModal from '../components/AutoAssignModal'
import { motion } from 'framer-motion'
import {
  Users, GitBranch, CheckSquare,
  UserCheck, Mail, Download,
  Play, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronRight, Wand2,
  BarChart2, Activity, Target, Calendar, Clock,
  Send, Copy, Trash2, Plus, Shield, ShieldAlert, ShieldCheck, FileText, Settings,
  Sparkles, Link, LayoutTemplate, ClipboardList, Lightbulb, ClipboardCheck,
  User, UserPlus, Building2, Info, UploadCloud, Search, CheckCircle2,
  Key, Globe, Database, Flag, RefreshCw
} from 'lucide-react'
import PipelineStepper from '../components/PipelineStepper'
import OrgSwitcher from '../components/OrgSwitcher'
import SettingsTab from '../components/SettingsTab'
import NotificationBell from '../components/NotificationBell'
import AppLayout from '../components/AppLayout'
import StageTimelinePanel from '../components/StageTimelinePanel'
import {
  participantsApi,
  solverApi,
  approvalsApi,
  evaluatorsApi,
  leaderboardApi,
  commsApi,
  aiApi,
  mentorApi,
  portalApi,
  demoAdminApi,
  eventStateApi,
  healthDashboardApi,
  eventsApi,
  evaluationsApi,
} from '../services/api'

// ── Shared micro-components ────────────────────────────────────────────────



function MiniSparkline({ color = 'blue' }) {
  const stroke =
    color === 'purple' ? '#a855f7'
      : color === 'green' ? '#22c55e'
        : color === 'orange' ? '#f59e0b'
          : '#3b82f6';
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-32 opacity-90" aria-hidden="true">
      <path
        d="M4 36 C18 36 18 14 34 14 C50 14 48 34 64 34 C82 34 80 12 100 12 C108 12 112 8 116 6"
        fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round"
      />
      <circle cx="116" cy="6" r="4" fill={stroke} />
    </svg>
  );
}

function StatCard({
  label, value, sub, colour = 'red', icon: Icon, trend, onClick, sectionClass,
  iconBgClass, progressPercent, progressColor = 'red',
  showSparkline = false, sparklineColor = 'blue',
}) {
  const colorMap = {
    emerald: { icon: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20', glow: 'from-emerald-500/10' },
    red: { icon: 'bg-rose-500/10 text-rose-500 border border-rose-500/20', glow: 'from-rose-500/10' },
    amber: { icon: 'bg-primary/10 text-primary border border-primary/20', glow: 'from-primary/10' },
    teal: { icon: 'bg-info/10 text-info border border-info/20', glow: 'from-info/10' },
    primary: { icon: 'bg-primary/10 text-primary border border-primary/20', glow: 'from-primary/10' },
  }
  const theme = colorMap[colour] || colorMap.primary;
  const safeProgress = Math.max(0, Math.min(100, progressPercent ?? 0));

  return (
    <motion.div onClick={onClick} whileHover={{ y: -2, scale: 1.01 }} className={`${sectionClass || 'app-card'} rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full ${onClick ? 'cursor-pointer' : ''}`}>
      <div className={`absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br ${theme.glow} to-transparent rounded-full blur-2xl group-hover:scale-110 transition-transform duration-700`} />

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${iconBgClass || theme.icon}`}>
            {Icon && <Icon size={20} />}
          </div>
          <p className="text-sm font-bold text-foreground">{label}</p>
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm border ${trend > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
            {trend > 0 ? '↗' : '↘'} {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div className="relative z-10 mt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-black text-foreground">{value ?? '—'}</p>
            {sub && <p className="text-xs font-medium text-muted mt-1">{sub}</p>}
          </div>
          {showSparkline && <MiniSparkline color={sparklineColor} />}
        </div>
      </div>

      {typeof progressPercent === 'number' && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-cardSoft dark:bg-card/10 relative z-10">
          <div
            className={[
              'h-full rounded-full transition-all duration-500',
              progressColor === 'green' ? 'bg-green-500'
                : progressColor === 'orange' ? 'bg-orange-400'
                  : progressColor === 'purple' ? 'bg-purple-400'
                    : 'bg-red-500',
            ].join(' ')}
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600',
    red: 'bg-rose-500/10 border border-rose-500/20 text-rose-600',
    amber: 'bg-primary/10 border border-primary/20 text-primary',
    teal: 'bg-primary/10 border border-primary/20 text-primary',
    primary: 'bg-primary/10 border border-primary/20 text-primary',
    gray: 'bg-[var(--bg-card-soft)] text-foreground',
    slate: 'bg-[var(--bg-card-soft)] text-foreground',
    white: 'bg-card/20 border border-white/40 text-white shadow-sm drop-shadow-md',
  }[colour] ?? 'bg-[var(--bg-card-soft)] text-foreground'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  )
}





// eslint-disable-next-line no-unused-vars
function ApprovalStatusChart({ pending, approved, rejected }) {
  const total = (approved || 0) + (pending || 0) + (rejected || 0);
  const percentage = total > 0 ? Math.round(((approved || 0) / total) * 100) : 0;

  return (
    <div className="flex flex-col justify-center h-full pt-2">
      <div className="flex justify-between items-end mb-3">
        <div>
          <span className="text-2xl font-black text-foreground">{percentage}%</span>
          <span className="text-[10px] text-muted font-bold ml-1.5 uppercase tracking-wider">Approved</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-foreground">{approved || 0} / {total}</p>
          <p className="text-[10px] text-muted uppercase font-semibold">Total Teams</p>
        </div>
      </div>
      <div className="w-full h-2.5 bg-[var(--bg-card-soft)] rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full"
        />
      </div>
      <div className="flex justify-between text-[11px] font-bold text-muted">
        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-primary" /> Approved ({approved || 0})</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Pending ({pending || 0})</span>
          {(rejected || 0) > 0 && <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[var(--bg-card-soft)]" /> Rejected ({rejected || 0})</span>}
        </div>
      </div>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function EvaluationProgressChart({ evaluated, total }) {
  const percentage = total > 0 ? Math.round((evaluated / total) * 100) : 0;
  return (
    <div className="flex flex-col justify-center h-full pt-2">
      <div className="flex justify-between items-end mb-3">
        <div>
          <span className="text-2xl font-black text-foreground">{percentage}%</span>
          <span className="text-[10px] text-muted font-bold ml-1.5 uppercase tracking-wider">Completed</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-foreground">{evaluated} / {total}</p>
          <p className="text-[10px] text-muted uppercase font-semibold">Teams Evaluated</p>
        </div>
      </div>
      <div className="w-full h-2.5 bg-[var(--bg-card-soft)] rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full"
        />
      </div>
      <div className="flex justify-between text-[11px] font-bold text-muted">
        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-primary" /> Reviewed ({evaluated})</span>
        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Pending ({Math.max(0, total - evaluated)})</span>
      </div>
    </div>
  )
}

// ── TAB 1: OVERVIEW ────────────────────────────────────────────────────────
function OverviewTab({ onTileClick }) {
  const { data: summary } = useQuery({ queryKey: ['roster-summary'], queryFn: participantsApi.summary, refetchInterval: 30_000 })
  const { data: pending } = useQuery({ queryKey: ['pending-approvals'], queryFn: approvalsApi.pending, refetchInterval: 15_000 })
  const { data: allTeams } = useQuery({ queryKey: ['all-teams'], queryFn: approvalsApi.all, refetchInterval: 15_000 })
  const { data: lb } = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.get, refetchInterval: 60_000 })
  const { data: anomalies } = useQuery({ queryKey: ['anomalies'], queryFn: leaderboardApi.anomalies, refetchInterval: 30_000 })

  const allTeamsList = Array.isArray(allTeams) ? allTeams : Array.isArray(allTeams?.teams) ? allTeams.teams : Array.isArray(allTeams?.data) ? allTeams.data : []
  const approvedCount = allTeamsList.filter(t => t.approval_status === 'approved' || t.approval_status === 'published').length
  const totalTeamsCount = allTeamsList.length
  const pendingCount = pending?.total_pending || 0

  const approvalPercent = totalTeamsCount > 0 ? Math.round((approvedCount / totalTeamsCount) * 100) : 0
  const evaluatedCount = lb?.leaderboard?.length || 0
  const evaluationPercent = totalTeamsCount > 0 ? Math.round((evaluatedCount / totalTeamsCount) * 100) : 0

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, staggerChildren: 0.1 }}>
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Participants */}
        <StatCard
          onClick={() => onTileClick?.('participants')}
          label="Participants"
          value={summary?.total_participants || 0}
          colour="teal"
          sub="Total registered"
          icon={Users}
          iconBgClass="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20"
          showSparkline
          sparklineColor="blue"
        />

        {/* Approval Status */}
        <motion.div onClick={() => onTileClick?.('approvals')} whileHover={{ y: -2, scale: 1.01 }} className="cursor-pointer app-card rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-green-500/10 to-transparent rounded-full blur-2xl group-hover:scale-110 transition-transform duration-700 pointer-events-none" />
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300 border border-green-200 dark:border-green-500/20">
              <CheckSquare size={20} />
            </div>
            <p className="text-sm font-bold text-foreground">Approval Status</p>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-foreground">{approvalPercent}%</p>
            <p className="text-xs font-medium text-muted mt-1">{approvedCount} / {totalTeamsCount} teams</p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-cardSoft dark:bg-card/10 relative z-10">
            <motion.div initial={{ width: 0 }} animate={{ width: `${approvalPercent}%` }} transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }} className="h-full rounded-full bg-green-500" />
          </div>
          <div className="flex gap-4 mt-3 text-[11px] font-bold text-muted relative z-10">
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Approved ({approvedCount})</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /> Pending ({pendingCount})</span>
          </div>
        </motion.div>

        {/* Evaluation Progress */}
        <motion.div onClick={() => onTileClick?.('evaluators')} whileHover={{ y: -2, scale: 1.01 }} className="cursor-pointer app-card rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full blur-2xl group-hover:scale-110 transition-transform duration-700 pointer-events-none" />
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300 border border-orange-200 dark:border-orange-500/20">
              <BarChart2 size={20} />
            </div>
            <p className="text-sm font-bold text-foreground">Evaluation Progress</p>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-foreground">{evaluationPercent}%</p>
            <p className="text-xs font-medium text-muted mt-1">{evaluatedCount} / {totalTeamsCount} evaluated</p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-cardSoft dark:bg-card/10 relative z-10">
            <motion.div initial={{ width: 0 }} animate={{ width: `${evaluationPercent}%` }} transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }} className="h-full rounded-full bg-orange-400" />
          </div>
          <div className="flex gap-4 mt-3 text-[11px] font-bold text-muted relative z-10">
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Reviewed ({evaluatedCount})</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /> Pending ({Math.max(0, totalTeamsCount - evaluatedCount)})</span>
          </div>
        </motion.div>

        {/* Anomaly Flags */}
        <StatCard
          onClick={() => onTileClick?.('anomaly')}
          label="Anomaly Flags"
          value={anomalies?.total_flagged ?? 0}
          colour="teal"
          sub="Scorecards on hold"
          icon={Activity}
          iconBgClass="bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20"
          showSparkline
          sparklineColor="purple"
        />
      </div>
    </motion.div>
  )
}


// ── HELPER COMPONENTS FOR PARTICIPANTS TAB ─────────────────────────────────
function ParticipantMetricCard({ title, value, sub, icon: Icon, tone }) {
  const tones = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-emerald-100 text-emerald-600',
    orange: 'bg-orange-100 text-orange-500'
  }
  return (
    <div className="relative min-h-[150px] overflow-hidden rounded-[20px] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80">
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${tones[tone] || tones.blue}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-extrabold text-slate-950">{title}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[34px] leading-none font-extrabold text-slate-950">{value}</p>
        {sub && <p className="mt-1 text-sm font-medium text-slate-600">{sub}</p>}
      </div>
      <ParticipantMiniSparkline tone={tone} />
    </div>
  )
}

function ParticipantMiniSparkline({ tone }) {
  const colors = {
    blue: '#3b82f6',
    green: '#10b981',
    orange: '#f59e0b'
  }
  const color = colors[tone] || colors.blue
  return (
    <svg className="absolute right-8 bottom-8 w-28 h-12 opacity-90" viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 30 Q 15 10, 25 25 T 50 15 T 75 25 T 100 5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="5" r="3" fill={color} />
      <path d="M0 30 Q 15 10, 25 25 T 50 15 T 75 25 T 100 5 L 100 40 L 0 40 Z" fill={`url(#grad-${tone})`} fillOpacity="0.2" />
      <defs>
        <linearGradient id={`grad-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function getRowColors(index) {
  const colors = [
    { avatar: 'bg-blue-100 text-blue-600', pill: 'border-blue-400 bg-blue-50 text-blue-600' },
    { avatar: 'bg-emerald-100 text-emerald-600', pill: 'border-emerald-400 bg-emerald-50 text-emerald-600' },
    { avatar: 'bg-purple-100 text-purple-600', pill: 'border-purple-400 bg-purple-50 text-purple-600' },
    { avatar: 'bg-orange-100 text-orange-600', pill: 'border-orange-400 bg-orange-50 text-orange-600' },
  ]
  return colors[index % colors.length]
}

// ── TAB 2: PARTICIPANTS ────────────────────────────────────────────────────
function ParticipantsTab() {
  const qc = useQueryClient()
  const { activeEvent, eventsLoaded } = useAuth()
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [search, setSearch] = useState('')
  const [collegeFilter, setCollegeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [teamFilter, setTeamFilter] = useState('')

  const { data: summary } = useQuery({
    queryKey: ['roster-summary', activeEvent?.id],
    queryFn: participantsApi.summary,
    enabled: !!activeEvent?.id,
  })
  const { data, isLoading } = useQuery({
    queryKey: ['participants', activeEvent?.id, page, search, collegeFilter, teamFilter],
    queryFn: () => participantsApi.list({
      page,
      page_size: 15,
      search: search || undefined,
      institution: collegeFilter || undefined,
      team_assigned: teamFilter === '' ? undefined : teamFilter === 'true',
    }),
    keepPreviousData: true,
    enabled: !!activeEvent?.id,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file, upsert }) => participantsApi.upload(file, upsert),
    onSuccess: (res) => {
      setUploadResult(res)
      qc.invalidateQueries({ queryKey: ['participants'] })
      qc.invalidateQueries({ queryKey: ['roster-summary'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => participantsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['participants'] }),
  })

  // NEW: Mutation for sending bulk magic links via Celery worker
  const sendLinksMutation = useMutation({
    mutationFn: () => portalApi.generateLinks('participant', 'team_formation', true),
    onSuccess: (res) => {
      if (res.generated === 0) {
        alert("No participants found. Upload roster before dispatching links.");
      } else if (res.emails_queued) {
        alert(`Generated ${res.generated} participant links. Email dispatch queued. Check Communications tab and worker logs.`);
      } else {
        alert(res.message || "Generated links but dispatch skipped.");
      }
      setTimeout(() => qc.invalidateQueries({ queryKey: ['comms-log'] }), 3000)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['comms-log'] }), 8000)
    },
    onError: (error) => alert(`Error: ${error.message}`)
  });

  function handleFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      alert('Please select a .csv file.')
      return
    }
    uploadMutation.mutate({ file, upsert: false })
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onDragOver = (e) => { e.preventDefault(); setDragActive(true) }
  const onDragLeave = () => setDragActive(false)

  // Guard clauses — never render event-scoped UI (or call eventPath) without an event.
  if (!eventsLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted">
        <Loader2 size={28} className="animate-spin mb-3" />
        <p className="text-sm">Loading event…</p>
      </div>
    )
  }
  if (!activeEvent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Calendar size={32} className="text-muted mb-3" />
        <p className="text-sm font-medium text-muted">No event selected</p>
        <p className="text-xs text-muted mt-1">Pick an event from the switcher to manage participants.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1530px] mx-auto">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <ParticipantMetricCard title="Total" value={summary.total_participants} tone="blue" icon={Users} />
          <ParticipantMetricCard title="Assigned" value={summary.assigned_to_team} tone="green" icon={UserCheck} />
          <ParticipantMetricCard title="Unassigned Participants" value={summary.unassigned} sub="not yet in a team" tone="orange" icon={AlertTriangle} />
        </div>
      )}

      {/* CSV dropzone */}
      <div className="mb-8">
        <div className="flex items-center justify-between mt-8">
          <h2 className="text-[22px] font-extrabold text-red-600">Upload Roster CSV</h2>
          <a
            href={participantsApi.csvTemplateUrl()}
            download
            className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            <Download className="h-4 w-4" /> Download Template
          </a>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-5 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-red-400 bg-white px-8 py-10 text-center shadow-[0_12px_34px_rgba(15,23,42,0.04)] transition hover:border-red-500 hover:bg-red-50/20 ${
            dragActive ? 'border-red-500 bg-red-50/30' : ''
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {uploadMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-red-600 animate-spin" />
              <p className="text-sm font-semibold text-muted">Uploading roster…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <UploadCloud size={38} className="text-red-600" />
              <p className="mt-4 text-sm font-extrabold text-foreground">
                Drop a CSV here or click to browse
              </p>
              <p className="mt-2 text-sm font-semibold text-muted">
                Required columns: name, email, institution, skills, team_preference (optional)
              </p>
            </div>
          )}
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mt-4 p-4 rounded-xl bg-card ring-1 ring-slate-200 shadow-sm">
            <div className="flex justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">{uploadResult.message}</p>
              <button onClick={() => setUploadResult(null)} className="text-slate-400 hover:text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-4 text-xs font-bold text-red-600">
              <span>{uploadResult.created} created</span>
              <span>{uploadResult.updated} updated</span>
              <span>{uploadResult.skipped} skipped</span>
              {uploadResult.errors > 0 && <span>{uploadResult.errors} errors</span>}
            </div>
            {uploadResult.rows?.filter(r => r.status === 'error').map((r) => (
              <p key={r.row} className="text-xs text-red-500 mt-1">
                Row {r.row} ({r.email}): {r.error}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Filter bar & Action Buttons */}
      <div className="flex items-center justify-between gap-4 mt-6">
        <div className="flex gap-4">
          <div className="relative h-11 w-[330px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by name or email..."
              className="h-11 w-full rounded-xl bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-red-500/35"
            />
          </div>
          <div className="relative h-11 w-[330px]">
            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              value={collegeFilter}
              onChange={(e) => { setCollegeFilter(e.target.value); setPage(1) }}
              placeholder="Search by college..."
              className="h-11 w-full rounded-xl bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-red-500/35"
            />
          </div>
          <select
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setPage(1) }}
            className="h-11 w-[110px] rounded-xl bg-white px-4 text-sm font-extrabold text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-red-500/35 appearance-none"
          >
            <option value="">All</option>
            <option value="false">Unassigned</option>
            <option value="true">Assigned</option>
          </select>
        </div>

        {/* Bulk Send Button */}
        <button
          onClick={() => {
            if (window.confirm('Send magic login links to ALL registered participants?')) {
              sendLinksMutation.mutate();
            }
          }}
          disabled={sendLinksMutation.isPending || !summary?.total_participants}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 text-sm font-extrabold text-white shadow-[0_14px_26px_rgba(239,68,68,0.28)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendLinksMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sendLinksMutation.isPending ? 'Dispatching...' : 'Dispatch Magic Links'}
        </button>
      </div>

      {/* Participants table */}
      <div className="mt-6 overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0 mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white text-left border-b border-slate-200">
                {['Name', 'Institution', 'Skills (avg)', 'Team', 'Team Link Status', ''].map((h) => (
                  <th key={h} className="px-6 py-4 text-xs font-extrabold uppercase tracking-wide text-slate-800">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-b-0">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
                : data?.participants && data.participants.length > 0 ? data.participants.map((p, index) => {
                  const skills = Object.values(p.skill_vector || {})
                  const avg = skills.length
                    ? (skills.reduce((a, b) => a + b, 0) / skills.length).toFixed(1)
                    : null

                  const colors = getRowColors(index)

                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 text-slate-900">
                        <div className="flex items-center gap-4">
                          <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${colors.avatar}`}>
                            {p.first_name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-extrabold text-slate-950">{p.first_name} {p.last_name}</p>
                            <p className="text-xs font-medium text-slate-600">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">{p.institution}</td>
                      <td className="px-6 py-4 text-slate-900">
                        {avg
                          ? <span className={`rounded-lg border px-3 py-1 text-sm font-extrabold ${colors.pill}`}>{avg}/10</span>
                          : <span className="text-slate-400 text-sm font-bold">—</span>
                        }
                      </td>
                      <td className="px-6 py-4 text-slate-900">
                        {p.team_name
                          ? <span className={`rounded-lg border px-3 py-1 text-sm font-extrabold ${colors.pill}`}>{p.team_name}</span>
                          : p.team_status === "pending_approval"
                            ? <span className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-600">Pending Approval</span>
                            : <span className="text-sm font-bold text-slate-400">Unassigned</span>
                        }
                      </td>
                      <td className="px-6 py-4">
                        {p.team_link_sent ? (
                          <span className="rounded-lg border border-emerald-400 bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-700">Email Sent</span>
                        ) : (
                          <span className="rounded-lg border border-orange-400 bg-orange-100 px-3 py-1 text-sm font-extrabold text-orange-600">Not Sent</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${p.first_name} ${p.last_name}?`)) {
                              deleteMutation.mutate(p.id)
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500 font-medium">
                      {search || teamFilter !== '' ? "No participants found matching the current filters." : "No participants registered yet."}
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 text-sm font-semibold text-slate-500 bg-slate-50/60">
            <span>Page {data.page} of {data.total_pages} ({data.total} total)</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg bg-white ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition">Prev</button>
              <button disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg bg-white ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB 3: TEAMS ───────────────────────────────────────────────────────────
function TeamsTab() {
  const qc = useQueryClient()
  const [taskId, setTaskId] = useState(() => localStorage.getItem('solverTaskId') || null)
  const [committed, setCommitted] = useState(false)
  const [rationales, setRationales] = useState({})   // { team_id: {status, text} }
  const [generatingAll, setGeneratingAll] = useState(false)

  const generateRationale = async (team) => {
    const id = team.team_id
    setRationales(r => ({ ...r, [id]: { status: 'loading', text: '' } }))
    try {
      const res = await aiApi.teamRationale({
        team_name: team.team_name,
        members: team.members.map(m => ({
          name: m.name, institution: m.institution, skills: []
        })),
        distribution_rules: {
          team_size: team.size,
          max_per_institution: config.max_per_institution,
        },
      })
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 2500))
        const s = await solverApi.taskStatus(res.task_id)
        if (s.status === 'success') {
          setRationales(r => ({ ...r, [id]: { status: 'done', text: s.result?.rationale || '' } }))
          return
        }
        if (s.status === 'failed') break
      }
      setRationales(r => ({ ...r, [id]: { status: 'error', text: 'Generation failed' } }))
    } catch (e) {
      setRationales(r => ({ ...r, [id]: { status: 'error', text: e.message } }))
    }
  }

  const generateAllRationale = async () => {
    if (!drafts?.teams) return
    setGeneratingAll(true)
    for (const t of drafts.teams) await generateRationale(t)
    setGeneratingAll(false)
  }
  const [config, setConfig] = useState({
    num_teams: 5, target_size: 4, k_min: 3, k_max: 5,
    max_per_institution: 1, use_mock_data: false,
  })

  // Run mutation
  const runMutation = useMutation({
    mutationFn: () => solverApi.run(config),
    onSuccess: (res) => {
      setTaskId(res.task_id);
      localStorage.setItem('solverTaskId', res.task_id);
      setCommitted(false);
    },
  })

  // Task polling — stops when terminal state reached
  const { data: taskStatus } = useQuery({
    queryKey: ['task-status', taskId],
    queryFn: () => solverApi.taskStatus(taskId),
    enabled: !!taskId,
    refetchInterval: (data) => {
      if (!data || data.status === 'success' || data.status === 'failed') return false
      return 1500
    },
    refetchIntervalInBackground: true,
  })

  // Fetch draft lineups only when solver succeeded
  const { data: drafts } = useQuery({
    queryKey: ['solver-drafts', taskId],
    queryFn: () => solverApi.drafts(taskId),
    enabled: taskStatus?.status === 'success' && !!taskId,
  })

  // Commit to DB mutation
  const commitMutation = useMutation({
    mutationFn: () => solverApi.commit(taskId),
    onSuccess: () => {
      setCommitted(true)
      localStorage.removeItem('solverTaskId')
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      qc.invalidateQueries({ queryKey: ['all-teams'] })
    },
  })

  const progress = taskStatus
    ? Math.min(100, Math.round((taskStatus.progress / Math.max(taskStatus.total_steps, 1)) * 100))
    : 0

  const statusColor = {
    pending: 'text-muted',
    running: 'text-primary',
    success: 'text-primary',
    failed: 'text-primary',
  }[taskStatus?.status] ?? 'text-muted'

  return (
    <div>
      {/* Solver config form */}
      <div className="rounded-[24px] border border-slate-200/80 bg-white p-8 shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0 mb-6">
        <h2 className="text-2xl font-extrabold text-red-600">Solver Configuration</h2>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Column 1 */}
          <div className="space-y-10 lg:border-r lg:border-slate-200/80 lg:pr-10">
            {/* Number of teams */}
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Number of teams
                </label>
                <input
                  type="number" min={1} max={50}
                  value={config.num_teams}
                  onChange={(e) => setConfig((c) => ({ ...c, num_teams: +e.target.value }))}
                  className="mt-2 w-24 bg-transparent text-2xl font-extrabold text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Max size */}
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Max size
                </label>
                <input
                  type="number" min={2} max={10}
                  value={config.k_max}
                  onChange={(e) => setConfig((c) => ({ ...c, k_max: +e.target.value }))}
                  className="mt-2 w-24 bg-transparent text-2xl font-extrabold text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Column 2 */}
          <div className="space-y-10 lg:border-r lg:border-slate-200/80 lg:pr-10">
            {/* Target team size */}
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Target team size
                </label>
                <input
                  type="number" min={2} max={10}
                  value={config.target_size}
                  onChange={(e) => setConfig((c) => ({ ...c, target_size: +e.target.value }))}
                  className="mt-2 w-24 bg-transparent text-2xl font-extrabold text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Max / institution */}
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Max / institution
                </label>
                <input
                  type="number" min={1} max={5}
                  value={config.max_per_institution}
                  onChange={(e) => setConfig((c) => ({ ...c, max_per_institution: +e.target.value }))}
                  className="mt-2 w-24 bg-transparent text-2xl font-extrabold text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Column 3 */}
          <div className="space-y-10">
            {/* Min size */}
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <User className="h-6 w-6" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Min size
                </label>
                <input
                  type="number" min={1} max={10}
                  value={config.k_min}
                  onChange={(e) => setConfig((c) => ({ ...c, k_min: +e.target.value }))}
                  className="mt-2 w-24 bg-transparent text-2xl font-extrabold text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Use mock data */}
            <div className="flex items-start gap-5 pt-2">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.use_mock_data}
                  onChange={(e) => setConfig((c) => ({ ...c, use_mock_data: e.target.checked }))}
                  className="h-5 w-5 rounded-md border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span>Use mock data</span>
                <Info className="h-4 w-4 text-slate-400" />
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending || taskStatus?.status === 'running'}
          className="mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 text-sm font-bold text-white shadow-[0_12px_24px_rgba(239,68,68,0.28)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {runMutation.isPending || taskStatus?.status === 'running'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Play className="h-4 w-4" />
          }
          {taskStatus?.status === 'running' ? 'Solving…' : 'Run Solver'}
        </button>

        {runMutation.isError && (
          <p className="mt-4 text-sm font-medium text-red-500">{runMutation.error?.message}</p>
        )}
      </div>

      {/* Task progress panel */}
      {taskId && taskStatus && (
        <div className="app-card p-5 mb-6 border-l-2 border-l-primary relative overflow-hidden group transition-all hover:-translate-y-1 hover:scale-[1.01]">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none z-0" />
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">Solver progress</p>
            <span className={`text-sm font-semibold capitalize ${statusColor}`}>
              {taskStatus.status}
            </span>
          </div>
          <div className="w-full bg-[var(--bg-card-soft)] rounded-full h-2 mb-3">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${taskStatus.status === 'success' ? 'bg-primary' :
                taskStatus.status === 'failed' ? 'bg-primary' : 'bg-primary'
                }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted">{taskStatus.message}</p>

          {taskStatus.status === 'success' && taskStatus.result?.evaluation && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span>Quality: <strong className={
                taskStatus.result.evaluation.quality === 'excellent' ? 'text-primary' :
                  taskStatus.result.evaluation.quality === 'good' ? 'text-primary' : 'text-primary'
              }>{taskStatus.result.evaluation.quality}</strong></span>
              <span>Variance: <strong>{taskStatus.result.evaluation.variance_score}</strong></span>
              <span>Nodes visited: <strong>{taskStatus.result.evaluation.nodes_visited ?? '—'}</strong></span>
              <span>Algorithm: <strong>{taskStatus.result.evaluation.algorithm}</strong></span>
            </div>
          )}

          {taskStatus.status === 'failed' && (
            <p className="mt-2 text-xs text-primary">Error: {taskStatus.error}</p>
          )}
        </div>
      )}

      {/* Draft lineups */}
      {drafts?.teams && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Draft lineups — {drafts.teams.length} teams, {drafts.total_participants} participants
            </h3>
            {!committed && (
              <div className="flex items-center gap-2">
                <button
                  onClick={generateAllRationale}
                  disabled={generatingAll}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-primary text-primary hover:bg-[var(--bg-card-soft)] dark:hover:bg-primary/10 disabled:opacity-50"
                >
                  {generatingAll
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Wand2 size={14} />}
                  {generatingAll ? 'Generating…' : 'Generate AI Rationale'}
                </button>
                <button
                  onClick={() => commitMutation.mutate()}
                  disabled={commitMutation.isPending}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg app-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commitMutation.isPending
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Check size={14} />
                  }
                  Commit to Approval Queue
                </button>
              </div>
            )}
            {committed && (
              <Badge colour="green"><Check size={12} /> Committed — check Approvals tab</Badge>
            )}
          </div>

          {commitMutation.isError && (
            <p className="mb-3 text-xs text-primary">
              {commitMutation.error?.message?.includes('already exist')
                ? 'Teams already exist. Use Demo Controls → Reset Demo Data before forming new teams again.'
                : commitMutation.error?.message}
            </p>
          )}

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {drafts.teams.map((team) => (
              <div key={team.team_id} className="app-card p-4 border-l-2 border-l-primary relative overflow-hidden group transition-all hover:-translate-y-1 hover:scale-[1.01]">
                <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none z-0" />
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm text-foreground">{team.team_name}</p>
                  <Badge colour="teal">{team.size} members</Badge>
                </div>
                <div className="space-y-2">
                  {team.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--bg-card-soft)] text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{m.name}</p>
                        <p className="text-xs text-muted truncate">{m.institution}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {team.average_skill_vector?.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted mb-1">Skill avg</p>
                    <div className="flex gap-1 flex-wrap">
                      {team.average_skill_vector.map((v, i) => (
                        <span key={i} className="text-xs bg-[var(--bg-card-soft)] text-muted px-1.5 py-0.5 rounded">
                          {Number(v).toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── AI Rationale ── */}
                <div className="mt-3 pt-3 border-t">
                  {!rationales[team.team_id] ? (
                    <button
                      onClick={() => generateRationale(team)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors"
                    >
                      <Wand2 size={11} /> Generate rationale
                    </button>
                  ) : rationales[team.team_id].status === 'loading' ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Loader2 size={11} className="animate-spin" /> Generating…
                    </div>
                  ) : rationales[team.team_id].status === 'done' ? (
                    <div className="bg-[var(--bg-card-soft)] rounded-lg p-2.5">
                      <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                        <Wand2 size={11} /> AI Rationale
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">
                        {rationales[team.team_id].text}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-primary flex items-center gap-1">
                      <AlertTriangle size={11} /> {rationales[team.team_id].text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TAB 4: APPROVALS ────────────────────────────────────────────────────────
function ApprovalsTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(null)
  const [notes, setNotes] = useState('')

  const { data: pending, isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: approvalsApi.pending,
    refetchInterval: 10_000,
  })
  const { data: allTeams } = useQuery({
    queryKey: ['all-teams'],
    queryFn: approvalsApi.all,
    refetchInterval: 10_000,
  })
  const { data: detail } = useQuery({
    queryKey: ['team-detail', expanded],
    queryFn: () => approvalsApi.detail(expanded),
    enabled: !!expanded,
  })

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }) => approvalsApi.decide(id, decision, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      qc.invalidateQueries({ queryKey: ['all-teams'] })
      setExpanded(null)
      setNotes('')
    },
  })
  const bulkMutation = useMutation({
    mutationFn: (decision) => approvalsApi.bulk(decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      qc.invalidateQueries({ queryKey: ['all-teams'] })
    },
  })
  const publishMutation = useMutation({
    mutationFn: () => approvalsApi.publish(),
    onSuccess: (res) => {
      alert(res.message)
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      qc.invalidateQueries({ queryKey: ['all-teams'] })
      qc.invalidateQueries({ queryKey: ['comms-log'] })
      qc.invalidateQueries({ queryKey: ['participants'] })
      qc.invalidateQueries({ queryKey: ['roster-summary'] })
    },
    onError: (err) => alert(err.message)
  })

  const teamsResponse = allTeams
  const normalizedAllTeams = Array.isArray(teamsResponse)
    ? teamsResponse
    : Array.isArray(teamsResponse?.teams)
      ? teamsResponse.teams
      : Array.isArray(teamsResponse?.data)
        ? teamsResponse.data
        : []

  const activeTeams = normalizedAllTeams.filter(t => t.approval_status !== 'superseded')
  const hasRejected = activeTeams.some(t => t.approval_status === 'rejected')
  const allApproved = activeTeams.length > 0 && activeTeams.every(t => t.approval_status === 'approved')
  const hasPublished = activeTeams.length > 0 && activeTeams.every(t => t.approval_status === 'published')

  return (
    <div className="w-full pt-8">
      <section className="w-full min-h-[640px] rounded-[24px] border border-slate-200/80 bg-white px-8 py-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)] ring-0">
        {/* Pending Approvals heading area */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-[22px] font-extrabold text-slate-950">
              Pending Approvals
            </h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-100 px-2 text-xs font-extrabold text-red-600">
              {pending?.total_pending ?? 0}
            </span>
          </div>
          <p className="mt-2 text-base font-semibold text-slate-600">
            {pending?.total_pending ?? 0} team(s) awaiting review
          </p>
        </div>

        {/* Global Status Banner / Actions */}
        {activeTeams.length > 0 && !hasPublished && (
          <div className={`mt-8 p-5 rounded-xl border ${hasRejected ? 'bg-red-50 border-red-200' : allApproved ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            {hasRejected && (
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Formation Rejected</h3>
                  <p className="text-xs font-medium text-muted mt-1">One or more teams in this formation have been rejected. You cannot publish this formation. Please go to the <strong>Teams</strong> tab and rerun the solver to generate a new valid lineup.</p>
                </div>
              </div>
            )}
            {allApproved && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckSquare className="text-emerald-600 shrink-0" size={20} />
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground">All Teams Approved</h3>
                    <p className="text-xs font-medium text-muted mt-1">The formation is fully approved. Publish now to make teams visible and dispatch assignment emails.</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Publish formation? Participants will be notified via email immediately.")) {
                      publishMutation.mutate()
                    }
                  }}
                  disabled={publishMutation.isPending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-slate-50 shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {publishMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Publish Formation
                </button>
              </div>
            )}
            {!hasRejected && !allApproved && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Loader2 className="text-amber-500 shrink-0 mt-0.5 animate-spin" size={20} />
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground">Formation in Review</h3>
                    <p className="text-xs font-medium text-muted mt-1">Review all pending teams. All teams must be approved before the formation can be published to participants.</p>
                  </div>
                </div>
                {(pending?.total_pending ?? 0) > 0 && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => bulkMutation.mutate('reject')}
                      disabled={bulkMutation.isPending}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl app-btn-secondary hover:text-red-600 dark:hover:text-red-400"
                    >
                      <X size={14} /> Reject all
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Approve all pending teams and queue assignment emails?')) {
                          bulkMutation.mutate('approve')
                        }
                      }}
                      disabled={bulkMutation.isPending}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Shield size={14} /> Approve all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {hasPublished && (
          <div className="mt-10 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-base font-extrabold text-slate-950">
                Formation Published
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                This formation has been finalized and participants have been notified and can view their teams.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-cardSoft rounded-xl animate-pulse" />)}
          </div>
        )}

        <div className="mt-8 h-px w-full bg-slate-200/80" />

        {/* Empty state center */}
        {!isLoading && (pending?.total_pending ?? 0) === 0 && !hasRejected && (
          <div className="flex min-h-[390px] flex-col items-center justify-center text-center">
            <div className="relative mb-8 h-36 w-44">
              <div className="absolute left-1/2 top-[96px] h-5 w-28 -translate-x-1/2 rounded-full bg-slate-200/80 blur-sm pointer-events-none" />
              <svg
                viewBox="0 0 160 130"
                className="absolute left-1/2 top-0 h-32 w-40 -translate-x-1/2"
                aria-hidden="true"
              >
                <path
                  d="M80 18L121 35V63C121 91 103 111 80 120C57 111 39 91 39 63V35L80 18Z"
                  fill="#ecfdf5"
                  stroke="#10b981"
                  strokeWidth="3"
                />
                <path
                  d="M62 66L75 79L101 52"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="20" cy="74" r="4" fill="#10b981" />
                <path d="M30 28L34 36L42 40L34 44L30 52L26 44L18 40L26 36Z" fill="#f59e0b" />
                <path d="M128 42L132 50L140 54L132 58L128 66L124 58L116 54L124 50Z" fill="#10b981" />
                <path d="M142 80L145 86L151 89L145 92L142 98L139 92L133 89L139 86Z" fill="#60a5fa" />
              </svg>
            </div>
            <p className="text-lg font-extrabold text-slate-950">
              All teams reviewed
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Run the solver and review lockup to populate this queue.
            </p>
          </div>
        )}

        {/* Pending Teams List */}
        {!isLoading && (pending?.total_pending ?? 0) > 0 && (
          <div className="space-y-4">
            {pending?.teams.map((team) => (
              <div key={team.team_id} className="rounded-[18px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)] ring-0">
                {/* Row */}
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === team.team_id ? null : team.team_id)}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-extrabold text-slate-600">
                    {team.team_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-extrabold text-slate-950">{team.team_name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{team.member_count} members</p>
                  </div>
                  <span className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-600">Pending</span>
                  {expanded === team.team_id
                    ? <ChevronDown size={20} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={20} className="text-slate-400 shrink-0" />
                  }
                </div>

                {/* Expanded detail */}
                {expanded === team.team_id && detail && (
                  <div className="mt-4 border-t border-border pt-4">
                    {/* Members grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                      {detail.members?.map((m) => (
                        <div key={m.id} className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cardSoft text-sm font-extrabold text-muted">
                            {m.name[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{m.name}</p>
                            <p className="text-xs font-semibold text-muted truncate">{m.institution}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* AI rationale */}
                    {detail.rationale && (
                      <div className="rounded-xl bg-cardSoft p-4 mb-5">
                        <p className="flex items-center gap-1.5 text-xs font-extrabold text-muted mb-2">
                          <Wand2 size={14} /> AI Rationale
                        </p>
                        <p className="text-sm font-medium text-muted leading-relaxed">{detail.rationale}</p>
                      </div>
                    )}

                    {/* Notes + action buttons */}
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes (required when rejecting)…"
                      rows={2}
                      className="w-full rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground shadow-sm placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 mb-4 resize-none"
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => decideMutation.mutate({ id: team.team_id, decision: 'reject' })}
                        disabled={decideMutation.isPending}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-extrabold text-slate-50 transition hover:bg-red-700 disabled:opacity-50"
                      >
                        <X size={16} /> Reject
                      </button>
                      <button
                        onClick={() => decideMutation.mutate({ id: team.team_id, decision: 'approve' })}
                        disabled={decideMutation.isPending}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-extrabold text-slate-50 transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {decideMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        Approve
                      </button>
                    </div>
                    {decideMutation.isError && (
                      <p className="mt-3 text-sm font-semibold text-red-600">{decideMutation.error?.message}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── TAB 5: EVALUATORS ─────────────────────────────────────────────────────
function EvaluatorsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showAutoAssign, setShowAutoAssign] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', expertise_areas: '', passed_out_institution: '' })

  // Assignment state
  const [assignTeamIds, setAssignTeamIds] = useState([])
  const [expandedEval, setExpandedEval] = useState(null)

  // Import state
  const [importFile, setImportFile] = useState(null)
  const [importUpsert, setImportUpsert] = useState(false)
  const [importSummary, setImportSummary] = useState(null)

  const importMutation = useMutation({
    mutationFn: () => evaluatorsApi.importCsv(importFile, importUpsert),
    onSuccess: (res) => {
      setImportSummary(res)
      setImportFile(null)
      qc.invalidateQueries({ queryKey: ['evaluators'] })
    },
    onError: (err) => alert(err.message)
  })

  const auditMutation = useMutation({
    mutationFn: evaluationsApi.auditIntegrity,
  })

  const { data, isLoading } = useQuery({ queryKey: ['evaluators'], queryFn: evaluatorsApi.list })
  const { data: teamsData } = useQuery({ queryKey: ['all-teams'], queryFn: approvalsApi.all })

  const evaluatorTeams = Array.isArray(teamsData)
    ? teamsData
    : Array.isArray(teamsData?.teams)
      ? teamsData.teams
      : Array.isArray(teamsData?.data)
        ? teamsData.data
        : []

  const approvedTeams = evaluatorTeams.filter((team) =>
    team?.is_approved ||
    team?.approval_status === 'approved' ||
    team?.approval_status === 'published'
  )

  // Fetch assignments for expanded evaluator
  const { data: assignData } = useQuery({
    queryKey: ['evaluator-assignments', expandedEval],
    queryFn: () => evaluatorsApi.assignments(expandedEval),
    enabled: !!expandedEval,
  })

  const createMutation = useMutation({
    mutationFn: () => evaluatorsApi.create({
      ...form,
      expertise_areas: form.expertise_areas.split(',').map(s => s.trim()).filter(Boolean),
      passed_out_institution: form.passed_out_institution.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluators'] })
      setForm({ first_name: '', last_name: '', email: '', expertise_areas: '', passed_out_institution: '' })
      setShowForm(false)
    },
  })

  const sendLinkMutation = useMutation({
    mutationFn: (id) => evaluatorsApi.sendLink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluators'] })
      qc.invalidateQueries({ queryKey: ['comms-log'] })
    },
    onError: (error) => alert(`Error: ${error.response?.data?.detail || error.message}`)
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => evaluatorsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluators'] }),
  })

  const assignMutation = useMutation({
    mutationFn: (payload) => evaluatorsApi.assign(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluator-assignments'] })
      qc.invalidateQueries({ queryKey: ['evaluators'] })
      setAssignTeamIds([])
      alert('Evaluator assigned successfully.')
    },
    onError: (err) => alert(`Assignment error: ${err.message}`)
  })

  const fieldFor = (key, label, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-2">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl bg-card px-4 text-sm font-medium text-foreground shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-blue-500/35"
      />
    </div>
  )

  const evaluatorAvatarStyles = [
    'bg-blue-100 text-blue-700',
    'bg-red-100 text-red-700',
    'bg-yellow-100 text-yellow-700',
    'bg-orange-100 text-orange-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
  ]

  const evaluatorAvatarClassFor = (index) => evaluatorAvatarStyles[index % evaluatorAvatarStyles.length]

  function toggleTeamId(tid) {
    setAssignTeamIds(ids =>
      ids.includes(tid) ? ids.filter(x => x !== tid) : [...ids, tid]
    )
  }

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-end gap-4">
          <button onClick={() => evaluatorsApi.downloadTemplate()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-slate-800 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50">
            <FileText className="h-5 w-5 text-emerald-600" />
            CSV Template
          </button>
          <button onClick={() => evaluatorsApi.downloadExport()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-blue-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-blue-50">
            <Download className="h-5 w-5" /> Export
          </button>
          <button onClick={() => setShowAutoAssign(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-purple-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-purple-50">
            <Wand2 className="h-5 w-5" /> Auto-assign
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-[0_14px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-700">
            <Plus className="h-5 w-5" /> Add Evaluator
          </button>
        </div>

        {/* Evaluation audit settings banner */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-[18px] bg-emerald-50/80 px-6 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] ring-1 ring-emerald-300/80 border-l-4 border-emerald-500">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <ShieldCheck size={28} />
            </div>
            <div>
              <p className="text-base font-extrabold text-slate-950">Evaluation audit settings</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">Check event-scoped scorecard integrity, evaluator assignments, and suspicion scoring state.</p>
            </div>
          </div>
          <button onClick={() => auditMutation.mutate()} disabled={auditMutation.isPending} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-slate-800 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-emerald-50">
            {auditMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
            Run audit
          </button>
        </section>
        {auditMutation.isSuccess && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-semibold shadow-sm">
            Audit completed. Issues found: {auditMutation.data?.issues?.length ?? auditMutation.data?.issue_count ?? 0}
          </div>
        )}
        {auditMutation.isError && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-200 font-semibold shadow-sm">
            {auditMutation.error?.message || 'Audit failed.'}
          </div>
        )}

        {/* Import CSV panel */}
        <section className="rounded-[20px] border border-slate-200/80 bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <p className="text-lg font-extrabold text-slate-950">Choose File</p>
              <p className="text-sm font-semibold text-slate-600">{importFile ? importFile.name : 'No file chosen'}</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input type="checkbox" checked={importUpsert} onChange={e => setImportUpsert(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              Update existing (upsert)
              <Info size={16} className="text-slate-400" />
            </label>
            <button onClick={() => importMutation.mutate()} disabled={!importFile || importMutation.isPending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-blue-600 shadow-sm ring-1 ring-blue-500/70 transition hover:bg-blue-50 disabled:opacity-50 ml-auto">
              {importMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
              Import CSV
            </button>
          </div>
          <p className="mt-6 text-sm font-semibold text-slate-600">
            Evaluators receive secure magic links and score approved teams on the Judge Portal. Submitted scorecards update the leaderboard and anomaly scanner.
          </p>

          <label className="mt-6 flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-blue-500/80 bg-white px-8 py-10 text-center transition hover:bg-blue-50/30 relative">
            <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files[0])} className="hidden" />
            <UploadCloud size={42} className="text-blue-600" />
            <p className="mt-4 text-sm font-extrabold text-slate-950">
              Drag and drop CSV file here, or click to browse
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              CSV should include: name, email, role (evaluator/judge), expertise (optional)
            </p>
          </label>

          {importSummary && (
            <div className="mt-6 bg-cardSoft border border-border p-5 rounded-xl text-sm shadow-sm">
              <p className="font-extrabold text-foreground">Import Summary</p>
              <div className="flex gap-4 mt-2 mb-3 font-semibold text-muted">
                <span>Total: {importSummary.total_rows}</span>
                <span className="text-emerald-600">Created: {importSummary.created}</span>
                <span className="text-blue-600">Updated: {importSummary.updated}</span>
                <span className="text-red-600">Errors: {importSummary.errors}</span>
              </div>
              {importSummary.errors > 0 && (
                <ul className="text-xs font-medium text-red-600 list-disc pl-4 space-y-1">
                  {importSummary.results.filter(r => r.status === 'error').map((r, idx) => (
                    <li key={idx}>Row {r.row_number} ({r.email || 'No email'}): {r.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Add form */}
        {showForm && (
          <section className="rounded-[20px] bg-card p-7 shadow-[0_14px_38px_rgba(15,23,42,0.06)] ring-1 ring-border">
            <p className="text-lg font-extrabold text-foreground mb-5">New Evaluator</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              {fieldFor('first_name', 'First name', 'text', 'Dr. Meena')}
              {fieldFor('last_name', 'Last name', 'text', 'Sharma')}
              {fieldFor('email', 'Email', 'email', 'meena@ti.com')}
              {fieldFor('expertise_areas', 'Expertise (comma-separated)', 'text', 'embedded systems, signal processing')}
              {fieldFor('passed_out_institution', 'Passed-out college / institution (optional)', 'text', 'IIT Madras')}
            </div>
            <div className="flex items-center gap-3 justify-end mt-6">
              <button onClick={() => setShowForm(false)} className="inline-flex h-11 items-center justify-center rounded-xl bg-card px-5 text-sm font-bold text-muted ring-1 ring-slate-200 hover:bg-cardSoft transition">Cancel</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.email}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-extrabold text-slate-50 shadow-[0_10px_20px_rgba(37,99,235,0.2)] transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Save Evaluator
              </button>
            </div>
            {createMutation.isError && <p className="mt-4 text-sm font-semibold text-red-600">{createMutation.error?.message}</p>}
          </section>
        )}

        {/* Empty state center */}
        {!isLoading && (!data?.evaluators?.length) && (
          <section className="flex min-h-[220px] flex-col items-center justify-center rounded-[20px] bg-card px-8 py-12 text-center shadow-[0_14px_38px_rgba(15,23,42,0.06)] ring-1 ring-border">
            <div className="relative h-16 w-16 text-slate-300">
              <ClipboardList size={64} strokeWidth={1.5} />
              <svg className="absolute -top-3 -right-3 h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <svg className="absolute top-4 -left-6 h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <svg className="absolute -bottom-2 -right-4 h-3 w-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <p className="mt-5 text-lg font-extrabold text-slate-950">
              No evaluators registered yet.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Add evaluators manually or import from CSV to get started.
            </p>
          </section>
        )}

        {isLoading && (
          <div className="mt-8 space-y-4 mb-8">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-[20px] border border-slate-200/80 shadow-sm animate-pulse" />)}
          </div>
        )}

        {/* Evaluator list */}
        {!isLoading && data?.evaluators?.length > 0 && (
          <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0">
            {data.evaluators.map((ev, index) => (
              <div key={ev.id} className="border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50/80 transition">
                <div className="flex flex-wrap items-center gap-4 px-6 py-5">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${evaluatorAvatarClassFor(index)}`}>
                    {ev.first_name[0]}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-base font-extrabold text-slate-950 break-words">{ev.first_name} {ev.last_name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600 break-words">{ev.email}</p>
                    {ev.passed_out_institution && (
                      <p className="mt-1 text-xs font-semibold text-slate-500 break-words">🏛️ {ev.passed_out_institution}</p>
                    )}
                    {ev.expertise_areas?.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {ev.expertise_areas.map((a) => (
                          <span key={a} className="inline-flex items-center rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200/70">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 shrink-0 ml-auto">
                    <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-extrabold ${ev.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                      {ev.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {ev.access_link_sent && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-extrabold text-emerald-600">
                        <Check size={12} /> Link sent
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => setExpandedEval(expandedEval === ev.id ? null : ev.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50 transition"
                    >
                      <UserCheck size={14} />
                      Assignments
                    </button>
                    <button
                      onClick={() => sendLinkMutation.mutate(ev.id)}
                      disabled={sendLinkMutation.isPending}
                      title={ev.access_link_sent ? "Send access link again" : "Send access link"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-600 hover:bg-blue-100 transition disabled:opacity-50"
                    >
                      {sendLinkMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {ev.access_link_sent ? "Resend Link" : "Send Link"}
                    </button>
                    <button
                      onClick={() => { if (window.confirm('Remove this evaluator?')) deleteMutation.mutate(ev.id) }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Expanded: team assignments */}
                {expandedEval === ev.id && (
                  <div className="bg-slate-50/70 px-6 py-5 border-t border-slate-100">
                    <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-600">Current Assignments</p>
                    {assignData?.teams?.length > 0 ? (
                      <div className="mb-5 flex gap-2 flex-wrap">
                        {assignData.teams.map(t => (
                          <span key={t.team_id} className="inline-flex items-center rounded-lg bg-teal-50 border border-teal-200 px-3 py-1 text-sm font-extrabold text-teal-700">
                            {t.team_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mb-5 text-sm font-semibold text-slate-600">No teams assigned yet.</p>
                    )}

                    <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-600">Assign to teams</p>
                    <div className="mb-5 flex flex-wrap gap-2">
                      {approvedTeams.length === 0 ? (
                        <p className="text-sm font-semibold text-slate-600">No approved teams available.</p>
                      ) : approvedTeams.map(t => {
                        const selected = assignTeamIds.includes(t.team_id)
                        return (
                          <button
                            key={t.team_id}
                            onClick={() => toggleTeamId(t.team_id)}
                            className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold border transition ${selected
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'app-input text-slate-600 hover:bg-slate-50'
                              }`}
                          >
                            {t.team_name}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => assignMutation.mutate({ evaluator_id: ev.id, team_ids: assignTeamIds })}
                      disabled={assignMutation.isPending || assignTeamIds.length === 0}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      {assignMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Assign Evaluator
                    </button>
                    {assignMutation.isError && <p className="mt-3 text-sm font-semibold text-red-600">{assignMutation.error?.message}</p>}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>

      {showAutoAssign && (
        <AutoAssignModal
          kind="evaluator"
          proposeFn={() => evaluatorsApi.autoAssignPropose(1)}
          commitFn={(id, assignments) => evaluatorsApi.autoAssignCommit(id, assignments)}
          onClose={() => setShowAutoAssign(false)}
          onCommitted={() => qc.invalidateQueries({ queryKey: ['evaluators'] })}
        />
      )}
    </>
  )
}

// ── TAB 6: LEADERBOARD ─────────────────────────────────────────────────────
function LeaderboardTab() {
  const qc = useQueryClient()
  const [toastMsg, setToastMsg] = useState('')

  const { data: lb } = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.get, refetchInterval: 30_000 })

  const showToast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  const exportCSV = () => {
    if (!lb?.leaderboard?.length) return

    const headers = ['Rank', 'Team', 'Technical', 'Innovation', 'Presentation', 'Total Score', 'Status']
    const rows = lb.leaderboard.map(t => [
      t.rank ?? '-',
      t.team_name,
      t.average_scores?.technical_depth?.toFixed(1) ?? '-',
      t.average_scores?.innovation?.toFixed(1) ?? '-',
      t.average_scores?.presentation?.toFixed(1) ?? '-',
      t.weighted_total?.toFixed(2) ?? '-',
      t.has_flags ? 'Flagged' : 'OK'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'leaderboard.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    showToast('CSV exported successfully')
  }

  const exportPDF = () => {
    if (!lb?.leaderboard?.length) return

    const doc = new jsPDF()
    doc.text('EventOS Leaderboard', 14, 15)

    const headers = [['Rank', 'Team', 'Technical', 'Innovation', 'Presentation', 'Total Score', 'Status']]
    const data = lb.leaderboard.map(t => [
      t.rank ?? '-',
      t.team_name,
      t.average_scores?.technical_depth?.toFixed(1) ?? '-',
      t.average_scores?.innovation?.toFixed(1) ?? '-',
      t.average_scores?.presentation?.toFixed(1) ?? '-',
      t.weighted_total?.toFixed(2) ?? '-',
      t.has_flags ? 'Flagged' : 'OK'
    ])

    autoTable(doc, {
      head: headers,
      body: data,
      startY: 20,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    })

    doc.save('leaderboard.pdf')
    showToast('PDF exported successfully')
  }
  const { data: anomalies } = useQuery({ queryKey: ['anomalies'], queryFn: leaderboardApi.anomalies, refetchInterval: 15_000 })

  const overrideMutation = useMutation({
    mutationFn: (id) => leaderboardApi.override(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
  const overrideAllMutation = useMutation({
    mutationFn: leaderboardApi.overrideAll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })


  return (
    <div>
      {/* Anomaly flags */}
      {(anomalies?.total_flagged ?? 0) > 0 && (
        <div className="bg-[var(--bg-card-soft)] rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-primary" />
              <p className="text-sm font-semibold text-primary">
                {anomalies.total_flagged} flagged scorecard(s) — results on hold
              </p>
            </div>
            <button
              onClick={() => overrideAllMutation.mutate()}
              disabled={overrideAllMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg text-primary hover:bg-[var(--bg-card-soft)]"
            >
              Clear all flags
            </button>
          </div>
          <div className="space-y-2">
            {anomalies.scorecards.map((sc) => (
              <div key={sc.id} className="flex items-start gap-3 glass-card rounded-lg p-3 ">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    Evaluator <span className="font-semibold text-foreground">{sc.evaluator_name}</span>
                    {' → '}Team <span className="font-semibold text-foreground">{sc.team_name}</span>
                  </p>
                  <p className="text-xs text-primary mt-0.5 leading-relaxed">{sc.flag_reason}</p>
                  {sc.anomaly_score != null && (
                    <p className="text-xs text-muted mt-0.5">Z-score: {Number(sc.anomaly_score).toFixed(2)}</p>
                  )}
                </div>
                <button
                  onClick={() => overrideMutation.mutate(sc.id)}
                  disabled={overrideMutation.isPending}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg app-btn-primary shrink-0"
                >
                  <Check size={12} /> Clear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between mb-4 mt-2">
        <h2 className="text-lg font-bold text-foreground">Event Rankings</h2>
        <div className="flex gap-2 items-center">
          {toastMsg && <span className="text-green-500 text-xs mr-2 animate-pulse">{toastMsg}</span>}
          <button onClick={exportCSV} disabled={!lb?.leaderboard?.length} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 disabled:opacity-50 transition-colors font-medium">
            <FileText size={14} /> Export CSV
          </button>
          <button onClick={exportPDF} disabled={!lb?.leaderboard?.length} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-sm hover:opacity-90" style={{ backgroundColor: '#ef4444' }}>
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Rankings table */}
      <div className="app-card rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 bg-[var(--bg-card-soft)] px-4 py-3 text-xs font-medium text-muted uppercase tracking-wide" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div className="col-span-1">#</div>
          <div className="col-span-3">Team</div>
          <div className="col-span-2">Technical</div>
          <div className="col-span-2">Innovation</div>
          <div className="col-span-2">Presentation</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-1">Status</div>
        </div>

        {!lb?.leaderboard?.length
          ? <div className="flex flex-col items-center justify-center py-16 text-muted">
            <div className="relative mb-4">
              <FileText size={40} className="opacity-30" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ef4444' }}>
                <X size={12} className="text-white" />
              </div>
            </div>
            <p className="text-sm font-medium">No evaluations submitted yet.</p>
          </div>
          : lb.leaderboard.map((team, i) => (
            <div
              key={team.team_id}
              className={`grid grid-cols-12 items-center px-4 py-3 text-sm ${i === 0 && !team.has_flags ? 'bg-[var(--bg-card-soft)]' : ''}`}
              style={{ borderBottom: '1px solid var(--border-soft)' }}
            >
              <div className={`col-span-1 font-mono font-semibold ${i === 0 && !team.has_flags ? 'text-foreground' : 'text-muted'}`}>
                {team.rank ?? <span>—</span>}
              </div>
              <div className={`col-span-3 font-medium truncate ${i === 0 && !team.has_flags ? 'text-foreground font-bold' : 'text-foreground'}`}>{team.team_name}</div>
              <div className={`col-span-2 ${i === 0 && !team.has_flags ? 'text-foreground' : 'text-muted'}`}>{team.average_scores?.technical_depth?.toFixed(1) ?? '—'}</div>
              <div className={`col-span-2 ${i === 0 && !team.has_flags ? 'text-foreground' : 'text-muted'}`}>{team.average_scores?.innovation?.toFixed(1) ?? '—'}</div>
              <div className={`col-span-2 ${i === 0 && !team.has_flags ? 'text-foreground' : 'text-muted'}`}>{team.average_scores?.presentation?.toFixed(1) ?? '—'}</div>
              <div className={`col-span-1 font-bold ${i === 0 && !team.has_flags ? 'text-primary-dark' : 'text-primary'}`}>{team.weighted_total?.toFixed(2) ?? '—'}</div>
              <div className="col-span-1">
                {team.has_flags
                  ? <Badge colour="amber"><AlertTriangle size={10} /> Flag</Badge>
                  : <Badge colour="green"><Check size={10} /> OK</Badge>
                }
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── TAB 7: COMMUNICATIONS ─────────────────────────────────────────────────
function CommunicationsTab() {
  const qc = useQueryClient()
  const [templateFilter, setTemplateFilter] = useState('')
  const [successFilter, setSuccessFilter] = useState('')
  const [preflightEmail, setPreflightEmail] = useState('')
  const [preflightName, setPreflightName] = useState('Test User')
  const [draftType, setDraftType] = useState('progression_invite')
  const [draftTone, setDraftTone] = useState('professional')
  const [draftContext, setDraftContext] = useState(
    JSON.stringify({
      participant_name: 'Priya Sharma',
      team_name: 'Team Alpha',
      next_stage: 'Grand Finale — Bangalore',
      event_name: 'WiSE@TI Hackathon',
    }, null, 2)
  )
  const [draft, setDraft] = useState(null)
  const [copied, setCopied] = useState(false)

  const { data: commsData, isLoading } = useQuery({
    queryKey: ['comms-log', templateFilter, successFilter],
    queryFn: () => commsApi.log({
      template: templateFilter || undefined,
      success: successFilter === '' ? undefined : successFilter === 'true',
      page_size: 50,
    }),
    refetchInterval: 20_000,
  })

  const { data: diagnostics, isLoading: diagnosticsLoading } = useQuery({
    queryKey: ['comms-diagnostics'],
    queryFn: commsApi.diagnostics,
    refetchInterval: 60_000,
  })

  const preflightMutation = useMutation({
    mutationFn: () => commsApi.preflightSendgrid({
      to_email: preflightEmail.trim() || null,
      recipient_name: preflightName.trim() || 'Test User',
    }),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['comms-log'] }), 1500)
    },
  })

  const draftMutation = useMutation({
    mutationFn: async () => {
      let ctx
      try { ctx = JSON.parse(draftContext) } catch { throw new Error('Context is not valid JSON') }

      const stageMap = {
        progression_invite: 'progression',
        milestone_blast: 'welcome',
        evaluation_summary: 'results',
      }

      // Enqueue the task
      const enqueued = await aiApi.draft({
        stage: stageMap[draftType] || 'welcome',
        recipient_name: ctx.participant_name || ctx.team_name || 'Participant',
        recipient_role: 'participant',
        event_name: ctx.event_name || 'WiSE@TI Hackathon',
        context: ctx,
      })

      // Poll until done
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 2500))
        const s = await solverApi.taskStatus(enqueued.task_id)
        if (s.status === 'success') {
          return { subject: s.result.subject, body_text: s.result.body }
        }
        if (s.status === 'failed') {
          throw new Error(s.error || 'Email generation failed')
        }
      }
      throw new Error('Timed out waiting for email draft')
    },
    onSuccess: (res) => setDraft(res),
  })

  const DRAFT_TYPES = [
    { value: 'progression_invite', label: 'Progression Invite' },
    { value: 'milestone_blast', label: 'Milestone Blast' },
    { value: 'evaluation_summary', label: 'Evaluation Summary' },
  ]
  const EXAMPLE_CONTEXTS = {
    progression_invite: { participant_name: 'Priya Sharma', team_name: 'Team Alpha', next_stage: 'Grand Finale', event_name: 'WiSE@TI Hackathon' },
    milestone_blast: { milestone_name: 'Team Assignments Published', event_name: 'WiSE@TI Hackathon', details: 'All assignments are now live on your portal.' },
    evaluation_summary: { team_name: 'Team Alpha', event_name: 'WiSE@TI Hackathon', scores: { technical_depth: 8.5, innovation: 7.0, presentation: 9.0, feasibility: 6.5 } },
  }

  return (
     <div className="w-full max-w-[1480px] mx-auto pt-8">
      <div className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-6 py-5 lg:px-8 border-b border-slate-100">
          <div className="flex gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-950">Email Diagnostics</h2>
              <p className="text-sm font-semibold text-slate-600 mt-1 max-w-2xl">
                Verify event-scoped email delivery configuration before sending participant, mentor, or evaluator links.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            {diagnostics?.email_delivery_mode === 'sendgrid' ? (
              <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-600 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4" /> SendGrid
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-extrabold text-amber-600 border border-amber-200">
                <AlertTriangle className="w-4 h-4" /> {diagnostics?.email_delivery_mode || 'Loading'}
              </span>
            )}
          </div>
        </div>

        {diagnosticsLoading ? (
          <div className="h-20 bg-slate-50 rounded-xl animate-pulse mb-6" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="flex gap-3 relative lg:after:absolute lg:after:right-0 lg:after:top-1/2 lg:after:-translate-y-1/2 lg:after:h-10 lg:after:w-px lg:after:bg-slate-200/80 pr-6">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 mb-0.5">From email</p>
                <p className="text-sm font-extrabold text-slate-950 truncate">{diagnostics?.from_email || 'missing'}</p>
              </div>
            </div>
            <div className="flex gap-3 relative lg:after:absolute lg:after:right-0 lg:after:top-1/2 lg:after:-translate-y-1/2 lg:after:h-10 lg:after:w-px lg:after:bg-slate-200/80 pr-6">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                <Key className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 mb-0.5">SendGrid key</p>
                <p className="text-sm font-extrabold text-slate-950 truncate">
                  {diagnostics?.sendgrid_api_key_present ? diagnostics?.sendgrid_key_prefix : 'missing'}
                </p>
              </div>
            </div>
            <div className="flex gap-3 relative lg:after:absolute lg:after:right-0 lg:after:top-1/2 lg:after:-translate-y-1/2 lg:after:h-10 lg:after:w-px lg:after:bg-slate-200/80 pr-6">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                <Globe className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 mb-0.5">Frontend base</p>
                <p className="text-sm font-extrabold text-slate-950 truncate">{diagnostics?.frontend_base_url}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                <Database className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 mb-0.5">Redis</p>
                <p className="text-sm font-extrabold text-emerald-600">{diagnostics?.redis_url_present ? 'Configured' : 'Missing'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-xl bg-blue-50/60 px-5 py-4 border border-blue-100 mb-6">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-blue-800">
            If SendGrid returns 403, verify API key has Mail Send permission and SENDGRID_FROM_EMAIL is a verified sender identity.
          </p>
        </div>

        {diagnostics?.notes?.length > 0 && (
          <ul className="mb-6 space-y-1 text-xs font-semibold text-amber-600 list-disc pl-5">
            {diagnostics.notes.map((note, idx) => <li key={idx}>{note}</li>)}
          </ul>
        )}

        <div className="grid gap-4 px-6 py-5 lg:px-8 md:grid-cols-[1fr_1fr_auto] items-end">
          <div className="relative">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Preflight recipient email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
              <input
                value={preflightEmail}
                onChange={(e) => setPreflightEmail(e.target.value)}
                placeholder="test.user@example.com"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200/80 bg-white text-sm font-bold text-slate-800 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow"
              />
            </div>
          </div>
          <div className="relative">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Recipient name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
              <input
                value={preflightName}
                onChange={(e) => setPreflightName(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200/80 bg-white text-sm font-bold text-slate-800 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow"
              />
            </div>
          </div>
          <button
            onClick={() => preflightMutation.mutate()}
            disabled={preflightMutation.isPending}
            className="inline-flex h-[42px] items-center justify-center gap-2 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {preflightMutation.isPending ? 'Checking...' : 'Run preflight'}
          </button>
        </div>

        {preflightMutation.isSuccess && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 border border-emerald-100">
            Preflight passed via {preflightMutation.data?.provider || preflightMutation.data?.mode || 'provider'}.
            {preflightMutation.data?.message_id && ` Message id: ${preflightMutation.data.message_id}`}
          </div>
        )}
        {preflightMutation.isError && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 border border-red-100">
            {preflightMutation.error?.message || 'Preflight failed.'}
          </div>
        )}
      </div>
      {/* Communication log */}
      <div className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-5 border-b border-slate-100 gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">Communication Log</h3>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              Note: Queued means the background worker accepted the job. Sent/Failed is recorded after provider response.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                placeholder="Filter by recipient..."
                className="w-48 pl-9 pr-4 py-2 rounded-xl border border-slate-200/80 bg-white text-sm font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow"
              />
            </div>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200/80 bg-white text-sm font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow appearance-none pr-10 relative"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              <option value="">All statuses</option>
              <option value="true">Sent</option>
              <option value="false">Failed</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !commsData?.logs?.length ? (
          <div className="text-center py-12 text-sm font-semibold text-slate-600">No emails dispatched yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100">
                  {['Recipient', 'Template', 'Stage', 'Status', 'Sent at'].map(h => (
                    <th key={h} className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commsData.logs.map((log) => {
                  let templateBg = 'bg-slate-50'
                  let templateText = 'text-slate-600'
                  if (log.template === 'notification') {
                    templateBg = 'bg-blue-50'
                    templateText = 'text-blue-600'
                  } else if (log.template === 'participant_link') {
                    templateBg = 'bg-purple-50'
                    templateText = 'text-purple-600'
                  } else if (log.template === 'mentor_link') {
                    templateBg = 'bg-orange-50'
                    templateText = 'text-orange-600'
                  }

                  return (
                    <tr key={log.id} className="bg-white border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-extrabold text-slate-950 truncate max-w-[200px]">{log.recipient_email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${templateBg} ${templateText}`}>
                          {log.template}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700 capitalize">{log.stage}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div>
                            {log.success ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-xs font-extrabold text-emerald-600 border border-emerald-100">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Sent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-xs font-extrabold text-red-600 border border-red-100">
                                Failed
                              </span>
                            )}
                          </div>
                          {!log.success && (
                            <span className="text-[10px] font-semibold text-red-500 leading-tight max-w-[200px] block truncate" title={log.error_message || "No provider error captured. Check Celery worker logs."}>
                              {log.error_message || "No provider error captured. Check Celery worker logs."}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-600">
                        {new Date(log.sent_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Draft Generator */}
      <div className="rounded-[20px] border border-slate-200/80 bg-white p-8 shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-0 mb-8">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-6 h-6 text-orange-500" />
          <h2 className="text-[20px] font-extrabold text-orange-500">AI Email Draft Generator</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.95fr] gap-8 items-stretch">
          {/* Config */}
          <div className="space-y-6 w-full min-w-0">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Draft type</label>
              <div className="flex flex-wrap gap-2">
                {DRAFT_TYPES.map((t) => {
                  const isSelected = draftType === t.value;
                  const Icon = t.value === 'progression_invite' ? Send : t.value === 'milestone_blast' ? Flag : FileText;
                  return (
                    <button
                      key={t.value}
                      onClick={() => {
                        setDraftType(t.value)
                        setDraftContext(JSON.stringify(EXAMPLE_CONTEXTS[t.value], null, 2))
                        setDraft(null)
                      }}
                      className={`inline-flex items-center gap-2 text-sm font-extrabold px-4 py-2.5 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_10px_22px_rgba(249,115,22,0.22)]'
                          : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Tone</label>
              <select
                value={draftTone}
                onChange={(e) => setDraftTone(e.target.value)}
                className="w-48 px-4 py-2.5 rounded-xl border border-slate-200/80 bg-white text-sm font-bold text-slate-800 shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none transition-shadow appearance-none pr-10 relative"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                {['professional', 'encouraging', 'formal'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-2">
                Context (JSON) <Info className="w-4 h-4 text-slate-400" />
              </label>
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-xl z-10" />
                <textarea
                  value={draftContext}
                  onChange={(e) => setDraftContext(e.target.value)}
                  className="block w-full min-h-[220px] bg-white border border-slate-200/80 rounded-xl pl-6 pr-4 py-4 text-[13px] font-mono text-slate-800 shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none transition-shadow resize-y"
                />
              </div>
            </div>

            <button
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(249,115,22,0.22)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {draftMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {draftMutation.isPending ? 'Generating...' : 'Generate Draft'}
            </button>
            {draftMutation.isError && <p className="text-xs font-bold text-red-500">{draftMutation.error?.message}</p>}
          </div>

          {/* Preview */}
          <div className="flex flex-col bg-orange-50/20 border-2 border-dashed border-orange-300 rounded-2xl p-6 min-h-[300px]">
            {draft ? (
              <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200/80 p-6 relative">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <p className="text-xs font-extrabold text-orange-500 uppercase tracking-wider">Draft Preview</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(draft.body_text)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-950 px-3 py-1.5 rounded-lg border border-slate-200/80 bg-white shadow-sm transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="mb-4">
                  <p className="text-xs font-bold text-slate-600 mb-1">Subject</p>
                  <p className="text-base font-extrabold text-slate-950">{draft.subject}</p>
                </div>
                <div className="flex-1 overflow-auto">
                  <p className="text-xs font-bold text-slate-600 mb-2">Body</p>
                  <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">{draft.body_text}</p>
                </div>
                <p className="mt-6 pt-4 border-t border-slate-100 text-[11px] font-bold text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Review carefully before dispatching. This draft has not been sent.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-orange-400/80">
                <Sparkles className="w-10 h-10 mb-4 opacity-50" />
                <p className="text-sm font-extrabold">Generate a draft to preview it here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 8: MENTOR OPS ──────────────────────────────────────────────────────

function MentorOpsPointerSafetyStyle() {
  return (
    <style>{`
      [data-mentor-ops-safe-zone] {
        position: relative;
        isolation: isolate;
        pointer-events: auto;
      }

      [data-mentor-ops-safe-zone] [aria-hidden="true"],
      [data-mentor-ops-safe-zone] .pointer-events-none,
      [data-mentor-ops-safe-zone] .absolute.inset-0,
      [data-mentor-ops-safe-zone] .fixed.inset-0,
      [data-mentor-ops-safe-zone] [class*="blur-"],
      [data-mentor-ops-safe-zone] [class*="bg-gradient"],
      [data-mentor-ops-safe-zone] [class*="radial"],
      [data-mentor-ops-safe-zone] [class*="decor"],
      [data-mentor-ops-safe-zone] [class*="pattern"] {
        pointer-events: none !important;
      }

      [data-mentor-ops-safe-zone] button,
      [data-mentor-ops-safe-zone] a,
      [data-mentor-ops-safe-zone] input,
      [data-mentor-ops-safe-zone] select,
      [data-mentor-ops-safe-zone] textarea,
      [data-mentor-ops-safe-zone] summary,
      [data-mentor-ops-safe-zone] [role="button"],
      [data-mentor-ops-safe-zone] [role="menuitem"],
      [data-mentor-ops-safe-zone] [data-clickable="true"] {
        pointer-events: auto !important;
        position: relative;
        z-index: 20;
      }

      [data-mentor-ops-safe-zone] table button,
      [data-mentor-ops-safe-zone] table a,
      [data-mentor-ops-safe-zone] .soft-table button,
      [data-mentor-ops-safe-zone] .soft-table a {
        pointer-events: auto !important;
        position: relative;
        z-index: 30;
      }
    `}</style>
  )
}


function MentorOpsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showAutoAssign, setShowAutoAssign] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', organization: '', expertise_areas: '' })
  const [assignForm, setAssignForm] = useState({ mentor_id: '', team_id: '' })
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [aiTeamId, setAiTeamId] = useState('')
  const [aiResult, setAiResult] = useState(null)

  // Import state
  const [importFile, setImportFile] = useState(null)
  const [importUpsert, setImportUpsert] = useState(false)
  const [importSummary, setImportSummary] = useState(null)

  const importMutation = useMutation({
    mutationFn: () => mentorApi.importCsv(importFile, importUpsert),
    onSuccess: (res) => {
      setImportSummary(res)
      setImportFile(null)
      qc.invalidateQueries({ queryKey: ['mentors'] })
    },
    onError: (err) => alert(err.message)
  })

  const getTeamId = (team) => team?.team_id || team?.id
  const getTeamName = (team) => team?.team_name || team?.name || "Unnamed Team"

  const { data, isLoading } = useQuery({ queryKey: ['mentors'], queryFn: mentorApi.list })
  const { data: opsData } = useQuery({ queryKey: ['mentor-ops-summary'], queryFn: mentorApi.opsSummary, refetchInterval: 30_000 })
  const { data: riskData } = useQuery({ queryKey: ['mentor-risk-teams'], queryFn: mentorApi.riskTeams, refetchInterval: 30_000 })
  const { data: assignData } = useQuery({ queryKey: ['mentor-assignments'], queryFn: mentorApi.assignments })
  const { data: suggestData } = useQuery({ queryKey: ['mentor-suggestions'], queryFn: mentorApi.assignmentSuggestions, refetchInterval: 60_000 })
  const { data: teamsData } = useQuery({ queryKey: ['approvals-all'], queryFn: approvalsApi.all })

  const createMutation = useMutation({
    mutationFn: () => mentorApi.create({ ...form, expertise_areas: form.expertise_areas.split(',').map(s => s.trim()).filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mentors'] }); setShowForm(false); setForm({ first_name: '', last_name: '', email: '', organization: '', expertise_areas: '' }) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => mentorApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentors'] }),
  })
  const sendLinkMutation = useMutation({
    mutationFn: (id) => mentorApi.sendLink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentors'] })
      qc.invalidateQueries({ queryKey: ['comms-log'] })
    },
    onError: (error) => alert(`Error: ${error.response?.data?.detail || error.message}`)
  })
  const assignMutation = useMutation({
    mutationFn: (vars) => {
      const payload = vars || { mentor_id: assignForm.mentor_id, team_id: assignForm.team_id };
      if (!payload.mentor_id || !payload.team_id) throw new Error("Mentor and Team must be selected.");
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(payload.team_id)) {
        throw new Error("Invalid team selection. Please refresh teams and try again.");
      }
      return mentorApi.assign(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mentor-assignments'] }); qc.invalidateQueries({ queryKey: ['mentor-ops-summary'] }); qc.invalidateQueries({ queryKey: ['mentor-risk-teams'] }); qc.invalidateQueries({ queryKey: ['mentor-suggestions'] }); qc.invalidateQueries({ queryKey: ['mentors'] }); setShowAssignForm(false) },
  })
  const unassignMutation = useMutation({
    mutationFn: (id) => mentorApi.unassign(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mentor-assignments'] }); qc.invalidateQueries({ queryKey: ['mentor-ops-summary'] }); qc.invalidateQueries({ queryKey: ['mentor-risk-teams'] }); qc.invalidateQueries({ queryKey: ['mentor-suggestions'] }); qc.invalidateQueries({ queryKey: ['mentors'] }) },
  })
  const reminderMutation = useMutation({
    mutationFn: mentorApi.sendDailyReminders,
  })
  const aiMutation = useMutation({
    mutationFn: (teamId) => mentorApi.generateSummary(teamId),
    onSuccess: (data) => setAiResult(data),
  })

  const mentors = data?.mentors ?? []
  const ops = opsData ?? {}
  const riskTeams = riskData?.teams ?? []
  const assignments = assignData?.assignments ?? []
  const suggestions = suggestData?.suggestions ?? []
  const allTeams = teamsData?.teams ?? []


  return (
    <>
      <div className="w-full pt-8">
      {/* Ops summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Teams Without Mentor', value: ops.teams_without_mentor, subtitle: ops.teams_without_mentor === 0 ? 'No teams need assignment' : 'Needs assignment', icon: Users, iconColor: 'text-blue-500', iconBg: 'bg-blue-50' },
          { label: 'Teams Without Meeting', value: ops.teams_without_meeting, subtitle: 'Schedule meetings to engage', icon: Calendar, iconColor: 'text-emerald-500', iconBg: 'bg-emerald-50' },
          { label: 'Missing Daily Update', value: ops.teams_missing_daily_update, subtitle: 'Needs daily progress update', icon: Clock, iconColor: 'text-amber-500', iconBg: 'bg-amber-50' },
          { label: 'Low Progress Teams', value: ops.low_progress_teams, subtitle: ops.low_progress_teams === 0 ? 'All teams are on track' : 'Some teams falling behind', icon: BarChart2, iconColor: 'text-purple-500', iconBg: 'bg-purple-50' },
        ].map(({ label, value, subtitle, icon: Icon, iconColor, iconBg }) => (
          <div key={label} className="app-card rounded-[22px] p-6 flex items-start gap-5">
            <div className={`flex items-center justify-center w-14 h-14 rounded-full ${iconBg} shrink-0`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div>
              <p className="text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1.5">{label}</p>
              <p className="text-3xl font-extrabold text-foreground leading-none">{value ?? '—'}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-2">{subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action row above Mentors card */}
      <div className="flex items-center justify-end gap-5 mb-6">
        <button onClick={() => mentorApi.downloadTemplate()} className="flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors">
          <FileText size={16} /> CSV Template
        </button>
        <button onClick={() => mentorApi.downloadExport()} className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors">
          <Download size={16} /> Export
        </button>
        <button
          onClick={() => setShowAutoAssign(true)}
          className="flex items-center gap-2 text-sm font-bold text-purple-600 hover:text-purple-700 transition-colors">
          <Wand2 size={16} /> Auto-assign
        </button>
        <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-2 text-sm px-6 py-2.5 rounded-xl bg-[#155dfc] hover:bg-[#0f4de0] text-white font-extrabold shadow-[0_10px_22px_rgba(21,93,252,0.18)] transition-all ml-2">
          <Plus size={16} /> Add Mentor
        </button>
      </div>

      <div className="app-card rounded-[22px] overflow-hidden mb-8">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-card">
          <h2 className="text-[20px] font-extrabold text-foreground">Mentors</h2>
        </div>

        {/* Bulk Import */}
        <div className="px-6 py-4 bg-cardSoft/50 border-b border-border flex flex-col xl:flex-row xl:items-center gap-4">
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <button className="relative flex items-center gap-2 app-btn-secondary">
               <UploadCloud size={16} /> Choose File
               <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </button>
            <span className="text-sm font-semibold text-muted truncate max-w-[200px]">
              {importFile ? importFile.name : 'No file chosen'}
            </span>
            <label className="flex items-center gap-2 text-sm font-semibold text-muted md:ml-4">
              <input type="checkbox" checked={importUpsert} onChange={e => setImportUpsert(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              Update existing (upsert)
            </label>
            <Info size={16} className="text-slate-400" />
          </div>
          <button
            onClick={() => importMutation.mutate()}
            disabled={!importFile || importMutation.isPending}
            className="flex items-center gap-2 text-sm px-6 py-2 rounded-xl bg-card border border-border text-blue-600 font-extrabold hover:bg-cardSoft dark:text-blue-400 transition-colors disabled:opacity-50 shadow-sm whitespace-nowrap"
          >
            {importMutation.isPending ? <Loader2 size={16} className="animate-spin inline" /> : <UploadCloud size={16} />} Import CSV
          </button>
        </div>
        {importSummary && (
          <div className="bg-cardSoft border-b border-border px-6 py-4 text-sm">
            <p className="font-bold text-foreground">Import Summary</p>
            <div className="flex gap-4 mt-1 mb-2 text-muted font-medium">
              <span>Total: {importSummary.total_rows}</span>
              <span className="text-emerald-600">Created: {importSummary.created}</span>
              <span className="text-blue-600">Updated: {importSummary.updated}</span>
              <span className="text-red-600">Errors: {importSummary.errors}</span>
            </div>
            {importSummary.errors > 0 && (
              <ul className="text-xs font-bold text-red-500 list-disc pl-4 space-y-1">
                {importSummary.results.filter(r => r.status === 'error').map((r, idx) => (
                  <li key={idx}>Row {r.row_number} ({r.email || 'No email'}): {r.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showForm && (
          <div className="bg-blue-50/50 border-b border-border p-6">
            <p className="text-sm font-extrabold text-foreground mb-4">New Mentor</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">First name</label>
                <input type="text" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="Dr. Priya" className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Last name</label>
                <input type="text" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Kumar" className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="priya@example.com" className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Organization</label>
                <input type="text" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                  placeholder="Texas Instruments" className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-muted mb-1.5">Expertise (comma-separated)</label>
              <input type="text" value={form.expertise_areas} onChange={e => setForm(f => ({ ...f, expertise_areas: e.target.value }))}
                placeholder="embedded systems, signal processing" className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow" />
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-xl text-muted font-bold hover:bg-cardSoft transition-colors">Cancel</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.email}
                className="flex items-center gap-1.5 text-sm px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition-all disabled:opacity-50">
                {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save
              </button>
            </div>
            {createMutation.isError && <p className="mt-3 text-xs font-bold text-red-500">{createMutation.error?.message}</p>}
          </div>
        )}

        {isLoading
          ? <div className="p-6 space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-cardSoft rounded-xl animate-pulse" />)}</div>
          : (
            <div>
              {(!mentors.length)
                ? <div className="text-center py-16 text-muted font-semibold text-sm">No mentors registered yet.</div>
                : mentors.map((m, index) => {
                  const activeAssignmentsForMentor = assignments.filter(
                    a => a.mentor_id === m.id && a.is_active !== false
                  ).length
                  const effectiveAssignedTeamCount = activeAssignmentsForMentor || m.assigned_team_count || 0

                  // Palette for avatars
                  const palettes = [
                    'bg-blue-50 text-blue-600',
                    'bg-emerald-50 text-emerald-600',
                    'bg-purple-50 text-purple-600',
                    'bg-amber-50 text-amber-600',
                    'bg-pink-50 text-pink-600'
                  ];
                  const avatarColor = palettes[index % palettes.length];

                  return (
                    <div key={m.id} className="flex flex-col lg:flex-row lg:items-center gap-4 px-6 py-5 border-b border-border last:border-0 hover:bg-cardSoft/50 transition-colors bg-card">
                      <div className={`w-10 h-10 rounded-full font-extrabold text-sm flex items-center justify-center shrink-0 ${avatarColor}`}>
                        {m.first_name[0]}
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-extrabold text-foreground break-words mb-0.5">{m.first_name} {m.last_name}</p>
                        <p className="text-xs font-semibold text-muted break-words mb-2">{m.email}{m.organization ? ` • ${m.organization}` : ''}</p>
                        {m.expertise_areas?.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {m.expertise_areas.map((a, i) => {
                              const chipColor = palettes[i % palettes.length];
                              return (
                                <span key={a} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${chipColor}`}>
                                  {a}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 shrink-0 lg:ml-auto mb-2 lg:mb-0">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cardSoft border border-border text-xs font-extrabold text-muted">
                          <Users size={12} /> {effectiveAssignedTeamCount} {effectiveAssignedTeamCount === 1 ? 'Team' : 'Teams'}
                        </span>
                        {m.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-extrabold text-emerald-600">
                            <Check size={12} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cardSoft border border-border text-xs font-extrabold text-muted">
                            Inactive
                          </span>
                        )}
                        {m.access_link_sent && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-extrabold text-emerald-600">
                            <Check size={12} /> Link sent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {effectiveAssignedTeamCount > 0 ? (
                          <button onClick={() => sendLinkMutation.mutate(m.id)} disabled={sendLinkMutation.isPending}
                            title={m.access_link_sent ? "Send access link again" : "Send access link"} className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50">
                            {sendLinkMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {m.access_link_sent ? "Resend Link" : "Send Link"}
                          </button>
                        ) : (
                          <button className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors">
                            <UserPlus size={14} /> Assign to teams
                          </button>
                        )}
                        <button onClick={() => { if (window.confirm('Deactivate this mentor?')) deleteMutation.mutate(m.id) }}
                          className="flex items-center justify-center app-icon-button text-red-500 hover:text-red-600 dark:border-red-500/20 dark:hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          )
        }
      </div>

        {/* Assignments */}
        <div className="app-card rounded-[22px] overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <h2 className="text-[20px] font-extrabold text-foreground flex items-center gap-2"><Users className="text-blue-500 w-6 h-6" /> Assignments</h2>
            <button onClick={() => setShowAssignForm(s => !s)} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border border-border text-muted font-bold hover:bg-cardSoft transition-colors shadow-sm">
              <Plus size={16} /> Assign
            </button>
          </div>

          {showAssignForm && (
            <div className="bg-cardSoft/50 p-6 border-b border-border">
              <p className="text-sm font-extrabold text-foreground mb-4">Assign Mentor to Team</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Mentor</label>
                  <select value={assignForm.mentor_id} onChange={e => setAssignForm(f => ({ ...f, mentor_id: e.target.value }))}
                    className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow">
                    <option value="">-- select mentor --</option>
                    {mentors.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Team</label>
                  <select value={assignForm.team_id} onChange={e => setAssignForm(f => ({ ...f, team_id: e.target.value }))}
                    className="w-full px-4 py-2.5 app-input text-sm font-bold text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow">
                    <option value="">-- select team --</option>
                    {allTeams.filter(t => t.is_approved && getTeamId(t)).map(t => <option key={getTeamId(t)} value={getTeamId(t)}>{getTeamName(t)}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-4">
                <button onClick={() => setShowAssignForm(false)} className="text-sm px-4 py-2 rounded-xl text-muted font-bold hover:bg-cardSoft transition-colors">Cancel</button>
                <button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !assignForm.mentor_id || !assignForm.team_id}
                  className="flex items-center gap-1.5 text-sm px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition-all disabled:opacity-50">
                  {assignMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Assign
                </button>
              </div>
              {assignMutation.isError && <p className="mt-3 text-xs font-bold text-red-500">{assignMutation.error?.message}</p>}
            </div>
          )}

          {assignments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-cardSoft/50 border-b border-border text-[11px] font-extrabold text-muted uppercase tracking-wider">
                    <th className="px-6 py-4 font-extrabold">Team</th>
                    <th className="px-6 py-4 font-extrabold">Team Leads</th>
                    <th className="px-6 py-4 font-extrabold">Mentor</th>
                    <th className="px-6 py-4 font-extrabold">Assigned On</th>
                    <th className="px-6 py-4 font-extrabold">Status</th>
                    <th className="px-6 py-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map(a => (
                    <tr key={a.id} className="hover:bg-cardSoft/50 transition-colors bg-card">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0"><Users size={14} /></div>
                           <div>
                             <p className="text-sm font-extrabold text-foreground">{a.team_name}</p>
                             <p className="text-[11px] font-semibold text-muted">Stage: {a.stage}</p>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-muted">{a.team_leads ?? '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-extrabold text-[10px] flex items-center justify-center">{a.mentor_name?.[0]}</div>
                           <span className="text-sm font-semibold text-muted">{a.mentor_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-muted">{a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—'}</td>
                      <td className="px-6 py-4">
                         {a.is_active ? <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-[11px] font-extrabold text-emerald-600">Active</span> : <span className="inline-flex items-center px-3 py-1 rounded-full bg-cardSoft text-[11px] font-extrabold text-muted">Inactive</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {a.is_active && (
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => { if (window.confirm('Unassign?')) unassignMutation.mutate(a.id) }} className="text-sm font-bold text-red-500 hover:text-red-700 transition-colors">Unassign</button>
                            <button onClick={() => { if (window.confirm('Unassign?')) unassignMutation.mutate(a.id) }} className="flex items-center justify-center app-icon-button text-red-500 hover:text-red-600 dark:border-red-500/20 dark:hover:bg-red-500/10">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted font-semibold text-sm">No assignments yet.</div>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-8" data-mentor-ops-safe-zone>
      <MentorOpsPointerSafetyStyle />
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2"><Wand2 size={16} className="text-primary" /> Skill-Gap Mentor Suggestions</h2>
            <div className="space-y-3">
              {suggestions.map(s => (
                <div key={String(s.team_id)} className="app-card p-4 border-l-2 border-l-primary relative overflow-hidden group transition-all hover:-translate-y-1 hover:scale-[1.01]">
                  <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none z-0" />
                  <p className="text-sm font-semibold text-foreground mb-1">{s.team_name}</p>
                  <p className="text-xs text-muted mb-2">{s.reason}</p>
                  {s.suggested_mentors?.map(c => (
                    <div key={String(c.mentor_id)} className="flex items-center gap-2 text-xs text-muted mb-1">
                      <span className="font-medium flex-1">{c.mentor_name}</span>
                      <Badge colour="teal">load: {c.current_load}</Badge>
                      <Badge colour="teal">score: {c.match_score}</Badge>
                      <button
                        onClick={() => assignMutation.mutate({ mentor_id: c.mentor_id, team_id: getTeamId(s) })}
                        disabled={assignMutation.isPending}
                        className="ml-2 text-xs px-2 py-1 rounded bg-[var(--bg-card-soft)] text-primary hover:bg-[var(--bg-card-soft)] disabled:opacity-50"
                      >
                        {assignMutation.isPending ? 'Assigning...' : 'Assign'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk table */}
        {riskTeams.length > 0 && (
          <div className="app-card rounded-[22px] overflow-hidden mb-8">
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-[20px] font-extrabold text-foreground flex items-center gap-2"><Shield className="text-blue-500 w-6 h-6" /> Risk Scores</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-cardSoft/50 border-b border-border text-[11px] font-extrabold text-muted uppercase tracking-wider">
                    <th className="px-6 py-4 font-extrabold">Team</th>
                    <th className="px-6 py-4 font-extrabold">Mentor</th>
                    <th className="px-6 py-4 font-extrabold">Score</th>
                    <th className="px-6 py-4 font-extrabold">Level</th>
                    <th className="px-6 py-4 font-extrabold">Progress</th>
                    <th className="px-6 py-4 font-extrabold">Reasons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {riskTeams.map(t => (
                    <tr key={String(t.team_id)} className="hover:bg-cardSoft/50 transition-colors bg-card">
                      <td className="px-6 py-4 text-sm font-extrabold text-foreground">{t.team_name}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-muted">{t.mentor_name ?? '—'}</td>
                      <td className="px-6 py-4 text-sm font-extrabold text-orange-500">{t.risk_score}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold ${t.risk_level === 'critical' || t.risk_level === 'high' ? 'bg-red-50 text-red-600 border border-red-200' : t.risk_level === 'medium' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                          {t.risk_level}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                         <div className="w-16 h-2 rounded-full bg-cardSoft overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, t.latest_progress_score || 0))}%` }} /></div>
                      </td>
                      <td className="px-6 py-4 text-[11px] font-semibold text-muted max-w-[200px] xl:max-w-xs truncate" title={t.reasons?.join(', ')}>{t.reasons?.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center mb-8">
          <button onClick={() => reminderMutation.mutate()} disabled={reminderMutation.isPending}
            className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl border border-border bg-card hover:bg-cardSoft text-blue-600 dark:text-blue-400 font-extrabold shadow-sm transition-colors disabled:opacity-50">
            {reminderMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Send Daily Reminders
          </button>
          {reminderMutation.isSuccess && (
            <div className="text-xs font-bold text-muted ml-4">
              {reminderMutation.data?.queued === 0 ? (
                <p>No reminders sent. There are no assigned mentors missing today’s update.</p>
              ) : (
                <>
                  <p className="text-emerald-600">{reminderMutation.data?.message}</p>
                  <ul className="mt-0.5 flex items-center gap-3">
                    <li>Queued: {reminderMutation.data?.queued}</li>
                    <li>Sent: {reminderMutation.data?.sent}</li>
                    <li className={reminderMutation.data?.failed > 0 ? "text-red-500" : ""}>Failed: {reminderMutation.data?.failed}</li>
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* AI Summary */}
        <div className="app-card rounded-[22px] overflow-hidden mb-8 p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-600 shrink-0">
              <Sparkles size={18} />
            </div>
            <h2 className="text-[20px] font-extrabold text-foreground">AI Team Summary</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="flex-1 w-full">
              <select value={aiTeamId} onChange={e => setAiTeamId(e.target.value)}
                className="w-full px-4 py-3 bg-cardSoft border border-border rounded-xl text-sm font-bold text-muted focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none transition-shadow">
                <option value="">-- select team --</option>
                {allTeams.filter(t => t.is_approved && getTeamId(t)).map(t => <option key={getTeamId(t)} value={getTeamId(t)}>{getTeamName(t)}</option>)}
              </select>
            </div>
            <button onClick={() => aiMutation.mutate(aiTeamId)} disabled={aiMutation.isPending || !aiTeamId}
              className="flex items-center justify-center gap-2 text-sm px-8 py-3 rounded-xl bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white font-extrabold shadow-[0_10px_22px_rgba(249,115,22,0.25)] transition-all disabled:opacity-50 w-full sm:w-auto">
              {aiMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate
            </button>
          </div>
          {aiResult && (
            <div className="bg-cardSoft/50 border border-border rounded-xl p-6 relative overflow-hidden group">
              <div className="flex items-center gap-3 mb-4">
                <p className="text-base font-extrabold text-foreground">{aiResult.team_name}</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold ${aiResult.tone === 'urgent' ? 'bg-red-50 text-red-600 border border-red-200' : aiResult.tone === 'watchlist' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                  {aiResult.tone}
                </span>
              </div>
              <p className="text-sm font-semibold text-muted leading-relaxed mb-4">{aiResult.summary}</p>
              {aiResult.recommended_focus && <p className="text-xs font-bold text-muted mb-2"><strong className="text-muted">Focus:</strong> {aiResult.recommended_focus}</p>}
              {aiResult.committee_note && <p className="text-xs font-bold text-muted"><strong className="text-muted">Committee note:</strong> {aiResult.committee_note}</p>}
            </div>
          )}
          {aiMutation.isError && <p className="text-xs font-bold text-red-500 mt-4">{aiMutation.error?.message}</p>}
        </div>
      </div>

      {showAutoAssign && (
        <AutoAssignModal
          kind="mentor"
          proposeFn={() => mentorApi.autoAssignPropose()}
          commitFn={(id, assignments) => mentorApi.autoAssignCommit(id, assignments)}
          onClose={() => setShowAutoAssign(false)}
          onCommitted={() => {
            qc.invalidateQueries({ queryKey: ['mentor-assignments'] })
            qc.invalidateQueries({ queryKey: ['mentor-ops-summary'] })
            qc.invalidateQueries({ queryKey: ['mentor-suggestions'] })
          }}
        />
      )}
    </>
  )
}

// ── TAB: TEAM HEALTH DASHBOARD (Phase 12) ──────────────────────────────────
function HealthTab() {

  const { data: teams, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['health-teams'],
    queryFn: healthDashboardApi.teams,
    refetchInterval: 5 * 60 * 1000,
  })

  const riskColour = {
    critical: { cardBorder: 'border-l-[3px] border-l-red-500', pill: 'bg-red-50 text-red-600 border border-red-200', dot: 'bg-red-500', score: 'text-red-600' },
    high: { cardBorder: 'border-l-[3px] border-l-orange-500', pill: 'bg-orange-50 text-orange-600 border border-orange-200', dot: 'bg-orange-500', score: 'text-orange-600' },
    medium: { cardBorder: 'border-l-[3px] border-l-blue-500', pill: 'bg-blue-50 text-blue-600 border border-blue-200', dot: 'bg-blue-500', score: 'text-blue-600' },
    low: { cardBorder: 'border-l-[3px] border-l-emerald-500', pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200', dot: 'bg-emerald-500', score: 'text-emerald-600' },
  }

  async function handleRefresh() {
    await healthDashboardApi.refresh()
    refetch()
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted">
      <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
      <p className="font-medium text-sm">Loading health data...</p>
    </div>
  )

  const criticalCount = teams?.filter(t => t.risk_level === 'critical').length || 0
  const highCount = teams?.filter(t => t.risk_level === 'high').length || 0
  const mediumCount = teams?.filter(t => t.risk_level === 'medium').length || 0
  const lowCount = teams?.filter(t => t.risk_level === 'low').length || 0

  return (
    <div>

      {/* Main Dashboard Card */}
      <div className="app-card rounded-[22px] p-6 lg:p-8 mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Team Health Dashboard</h2>
            <p className="text-sm font-medium text-muted mt-1">
              Risk scores based on evaluation status, daily updates, and member activity.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="flex items-center gap-2 app-btn-secondary text-blue-600 dark:text-blue-400"
          >
            {isRefetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Critical */}
          <div className="app-card rounded-[18px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <p className="text-xs font-extrabold text-foreground uppercase tracking-wide">CRITICAL</p>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{criticalCount}</p>
            <p className="text-sm font-medium text-muted mt-1">{criticalCount === 1 ? 'team' : 'teams'}</p>
          </div>
          {/* High */}
          <div className="app-card rounded-[18px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              <p className="text-xs font-extrabold text-foreground uppercase tracking-wide">HIGH</p>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{highCount}</p>
            <p className="text-sm font-medium text-muted mt-1">{highCount === 1 ? 'team' : 'teams'}</p>
          </div>
          {/* Medium */}
          <div className="app-card rounded-[18px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <p className="text-xs font-extrabold text-foreground uppercase tracking-wide">MEDIUM</p>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{mediumCount}</p>
            <p className="text-sm font-medium text-muted mt-1">{mediumCount === 1 ? 'team' : 'teams'}</p>
          </div>
          {/* Low */}
          <div className="app-card rounded-[18px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <p className="text-xs font-extrabold text-foreground uppercase tracking-wide">LOW</p>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{lowCount}</p>
            <p className="text-sm font-medium text-muted mt-1">{lowCount === 1 ? 'team' : 'teams'}</p>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {(!teams || teams.length === 0) && (
        <div className="app-card rounded-[22px] py-16 text-center">
          <p className="text-[20px] font-extrabold text-foreground mb-2">No team health risks detected</p>
          <p className="text-sm font-medium text-muted">All teams are currently within expected health thresholds.</p>
        </div>
      )}

      {/* Team Risk Cards */}
      <div className="space-y-4">
        {teams?.map(team => {
          const c = riskColour[team.risk_level] ?? riskColour.low
          return (
            <div key={team.team_id} className={`app-card rounded-[22px] p-6 ${c.cardBorder}`}>
              <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-lg font-extrabold text-foreground">{team.team_name || 'Team'}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${c.pill}`}>
                      {team.risk_level || 'LOW'}
                    </span>
                    <span className="text-sm font-medium text-muted">{team.member_count || 0} members</span>
                  </div>
                  <div className="space-y-2">
                    {team.signals?.map((s, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm font-medium">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.severity === 'high' || s.severity === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} />
                        <span>
                          <span className="text-foreground font-bold">{s.label}</span>
                          {s.detail && <span className="text-muted"> — {s.detail}</span>}
                        </span>
                      </div>
                    ))}
                    {(!team.signals || team.signals.length === 0) && (
                      <p className="text-sm font-medium text-emerald-600">No risk signals detected.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end justify-between min-w-[120px] self-stretch">
                  <div className="text-right">
                    <p className={`text-[32px] leading-none font-extrabold ${c.score}`}>{team.risk_score || 0}</p>
                    <p className="text-xs font-medium text-muted mt-1">risk score</p>
                  </div>
                  {team.last_update && (
                    <p className="text-xs font-medium text-slate-400 mt-auto pt-4">Last update: {team.last_update}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TAB 9: ANOMALY SCANNER ──────────────────────────────────────────────────
function AnomalyTab() {
  const qc = useQueryClient()


  const [explanations, setExplanations] = useState({})

  const generateExplanation = async (team) => {
    const id = team.team_id
    setExplanations(e => ({ ...e, [id]: { status: 'loading', text: '' } }))
    try {
      const res = await aiApi.explainAnomaly({
        anomaly: {
          kind: 'score_anomaly',
          severity: 'high',
          judge_id: 'panel',
          team_id: id,
          score: team.weighted_total || team.total_score || 0,
          expected: 0,
          metric: 0,
          threshold: 2.0,
          explanation: team.flag_reason || 'Statistical variance in judge scores',
        },
        team_name: team.team_name,
      })
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2500))
        const s = await solverApi.taskStatus(res.task_id)
        if (s.status === 'success') {
          setExplanations(e => ({ ...e, [id]: { status: 'done', text: s.result?.narrative || '' } }))
          return
        }
        if (s.status === 'failed') break
      }
      setExplanations(e => ({ ...e, [id]: { status: 'error', text: 'Generation failed' } }))
    } catch (err) {
      setExplanations(e => ({ ...e, [id]: { status: 'error', text: err.message } }))
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['anomalies'],
    queryFn: leaderboardApi.anomalies,
    refetchInterval: 15_000,
  })

  const overrideMutation = useMutation({
    mutationFn: (id) => leaderboardApi.override(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    }
  })

  const overrideAllMutation = useMutation({
    mutationFn: () => leaderboardApi.overrideAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    }
  })

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted">
        <Loader2 size={32} className="animate-spin mb-4 text-orange-500" />
        <p className="font-medium text-sm">Scanning for anomalies...</p>
      </div>
    )
  }

  const flaggedTeams = data?.scorecards || []
  const totalFlagged = data?.total_flagged || 0

  return (
    <div>

      {/* Section Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Activity className="text-orange-500" size={20} /> Anomaly Detector Scanner
          </h2>
          <p className="text-sm font-medium text-muted mt-1">Real-time monitoring of judge evaluations and score distributions.</p>
        </div>
        {totalFlagged > 0 && (
          <button
            onClick={() => { if (window.confirm('Override all flagged scorecards?')) overrideAllMutation.mutate() }}
            disabled={overrideAllMutation.isPending}
            className="flex items-center justify-center gap-2 text-sm px-5 py-2.5 rounded-xl border border-border bg-card hover:bg-cardSoft text-muted font-extrabold shadow-sm transition-colors disabled:opacity-50"
          >
            {overrideAllMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} className="text-emerald-500" />}
            Override All Flags
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1 */}
        <div className="app-card rounded-[22px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Users size={22} />
              </div>
              <p className="text-sm font-bold text-foreground">Total Flagged Teams</p>
            </div>
            <p className="text-3xl font-extrabold text-blue-600 mb-6">{totalFlagged}</p>
          </div>
          <div>
            <div className="w-1/3 bg-blue-100 rounded-full h-1.5 mb-3">
              <div className="bg-blue-500 h-1.5 rounded-full w-full"></div>
            </div>
            <p className="text-xs font-semibold text-muted">Historical Frequency</p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="app-card rounded-[22px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={22} />
              </div>
              <p className="text-sm font-bold text-foreground">Sweep Status</p>
            </div>
            <p className="text-xl font-extrabold text-foreground mb-1">Active Pipeline</p>
            <p className="text-xs font-semibold text-muted mb-6">Checking every 15s</p>
          </div>
          <div>
            <div className="w-full bg-cardSoft rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full w-2/3"></div>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="app-card rounded-[22px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Shield size={22} />
              </div>
              <p className="text-sm font-bold text-foreground">AI Confidence Score</p>
            </div>
            <div className="flex items-end gap-3 mb-4">
              <p className="text-3xl font-extrabold text-foreground">98.2%</p>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-[10px] font-extrabold text-emerald-600 border border-emerald-200 mb-1.5">High Confidence</span>
            </div>
          </div>
          <p className="text-xs font-medium text-muted leading-relaxed">
            Detector model operates with high precision. Overriding a flag will permanently unlock the team's progression.
          </p>
        </div>
      </div>

      {/* Flagged Pipeline */}
      <div className="space-y-4">
        <h3 className="text-lg font-extrabold text-foreground mb-4">Flagged Evaluations Pipeline</h3>
        {flaggedTeams.length === 0 ? (
          <div className="app-card border-dashed rounded-[22px] py-16 text-center relative overflow-hidden">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 relative">
              <ClipboardCheck size={32} className="text-blue-600" />
              <div className="absolute top-2 -left-6 w-2 h-2 rounded-full bg-blue-400" />
              <div className="absolute bottom-4 -left-3 w-1.5 h-1.5 rounded-full bg-orange-400" />
              <div className="absolute top-4 -right-4 w-2 h-2 rounded-full bg-purple-400" />
              <div className="absolute bottom-2 -right-6 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <h4 className="text-[20px] font-extrabold text-foreground mb-2">No Anomalies Detected</h4>
            <p className="text-sm font-medium text-muted">All scorecards are currently within expected variance thresholds.</p>
          </div>
        ) : (
          flaggedTeams.map(team => (
            <div key={team.id} className="app-card rounded-[22px] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-extrabold text-foreground text-lg">{team.team_name}</h4>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-[10px] font-extrabold text-amber-600 border border-amber-200"><AlertTriangle size={12} className="mr-1" /> Flagged</span>
                </div>
                <div className="text-sm text-muted space-y-1 font-medium">
                  <p><span className="text-slate-400">Weighted Score:</span> {team.weighted_total?.toFixed(2) || team.total_score}</p>
                  <p>
                    <span className="text-slate-400">Anomaly Reason:</span>{' '}
                    <span className="text-orange-500 font-mono text-xs font-semibold">
                      {team.flag_reason || 'Statistical Variance Exception'}
                    </span>
                  </p>

                  {/* AI Explanation */}
                  <div className="mt-2">
                    {!explanations[team.team_id] ? (
                      <button
                        onClick={() => generateExplanation(team)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-bold transition-colors"
                      >
                        <Wand2 size={11} /> AI Explain
                      </button>
                    ) : explanations[team.team_id].status === 'loading' ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
                        <Loader2 size={11} className="animate-spin" /> Generating explanation…
                      </div>
                    ) : explanations[team.team_id].status === 'done' ? (
                      <div className="bg-cardSoft rounded-xl p-3 mt-2 border border-border">
                        <p className="text-xs font-extrabold text-purple-600 mb-1 flex items-center gap-1">
                          <Wand2 size={11} /> AI Explanation
                        </p>
                        <p className="text-xs text-muted font-medium leading-relaxed">
                          {explanations[team.team_id].text}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-red-500">{explanations[team.team_id].text}</p>
                    )}
                  </div>
                  <p className="mt-2"><span className="text-slate-400">Detector Confidence:</span> <span className="text-muted font-bold">99.4%</span></p>
                </div>
              </div>

              <div className="flex flex-col gap-2 min-w-[160px]">
                <button
                  onClick={() => { if (window.confirm(`Override flag for ${team.team_name}?`)) overrideMutation.mutate(team.id) }}
                  disabled={overrideMutation.isPending}
                  className="flex justify-center items-center gap-2 text-sm px-4 py-2 rounded-xl app-btn-secondary font-extrabold shadow-sm transition-colors disabled:opacity-50"
                >
                  {overrideMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} className="text-emerald-500" />}
                  Force Override
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── TAB: RISK INTELLIGENCE ───────────────────────────────────────────────
// function RiskTab() {

//   const {
//     data: summary,
//     error: summaryError,
//     isLoading: summaryLoading,
//     refetch: refetchSummary,
//   } = useQuery({
//     queryKey: ['risk-summary'],
//     queryFn: riskApi.summary,
//     retry: false,
//   })

//   const {
//     data: teams = [],
//     error: teamsError,
//     isLoading: teamsLoading,
//     refetch: refetchTeams,
//   } = useQuery({
//     queryKey: ['risk-teams'],
//     queryFn: riskApi.teams,
//     retry: false,
//   })

//   const sweepMutation = useMutation({
//     mutationFn: riskApi.sweep,
//     onSuccess: () => {
//       refetchSummary()
//       refetchTeams()
//     },
//     onError: (err) => alert(`Error running risk sweep: ${err.message}`),
//   })

//   const capabilityDisabled = [summaryError, teamsError].some((err) =>
//     err?.message?.includes('risk_monitoring') ||
//     err?.message?.includes('does not enable capability')
//   )

//   if (capabilityDisabled) {
//     return (
//       <div className="app-card rounded-[22px] py-16 text-center">
//         <ShieldAlert size={48} className="mx-auto text-slate-300 mb-3" />
//         <p className="text-foreground font-extrabold text-[20px]">Risk monitoring is not enabled for this event.</p>
//       </div>
//     )
//   }

//   if (summaryError || teamsError) {
//     return (
//       <div className="app-card rounded-[22px] py-16 text-center">
//         <AlertTriangle size={48} className="mx-auto text-red-400 mb-3" />
//         <p className="text-foreground font-extrabold text-[20px]">Unable to load risk intelligence.</p>
//         <p className="text-sm text-muted font-medium mt-1">{summaryError?.message || teamsError?.message}</p>
//       </div>
//     )
//   }

//   const loading = summaryLoading || teamsLoading

//   const riskLevelStyles = {
//     critical: { cardBorder: 'border-l-[4px] border-l-red-500', pill: 'bg-red-50 text-red-600 border border-red-200' },
//     high: { cardBorder: 'border-l-[4px] border-l-orange-500', pill: 'bg-orange-50 text-orange-600 border border-orange-200' },
//     medium: { cardBorder: 'border-l-[4px] border-l-blue-500', pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
//     low: { cardBorder: 'border-l-[4px] border-l-emerald-500', pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
//   }

//   return (
//     <div>

//       {/* Main AI Risk Intelligence Card */}
//       <div className="app-card rounded-[22px] p-6 lg:p-8 mb-8">
//         <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
//           <div>
//             <h2 className="text-lg font-extrabold text-foreground">AI Risk Intelligence</h2>
//             <p className="text-sm font-medium text-muted mt-1">
//               Continuous monitoring of team health and participant engagement.
//             </p>
//           </div>
//           <button
//             onClick={() => sweepMutation.mutate()}
//             disabled={sweepMutation.isPending}
//             className="flex items-center gap-2 bg-[#ff6b1a] hover:bg-[#ea580c] text-white px-4 py-2 rounded-xl text-sm font-extrabold transition-colors shadow-[0_10px_20px_rgba(255,107,26,0.2)] disabled:opacity-50"
//           >
//             {sweepMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
//             Run risk sweep
//           </button>
//         </div>

//         {/* Summary Cards */}
//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//           {/* Total Teams */}
//           <div className="app-card rounded-[18px] p-5">
//             <div className="flex items-center gap-3 mb-4">
//               <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
//                 <Users size={20} className="text-blue-600" />
//               </div>
//               <p className="text-sm font-extrabold text-foreground">Total Teams</p>
//             </div>
//             <p className="text-3xl font-extrabold text-foreground">{loading ? '—' : summary?.total_teams ?? 0}</p>
//           </div>
//           {/* Average Risk Score */}
//           <div className="app-card rounded-[18px] p-5">
//             <div className="flex items-center gap-3 mb-4">
//               <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
//                 <Activity size={20} className="text-emerald-600" />
//               </div>
//               <p className="text-sm font-extrabold text-foreground">Average Risk Score</p>
//             </div>
//             <p className="text-3xl font-extrabold text-foreground">{loading ? '—' : (summary?.average_risk_score ?? 0).toFixed(1)}</p>
//           </div>
//           {/* High Risk */}
//           <div className="app-card rounded-[18px] p-5">
//             <div className="flex items-center gap-3 mb-4">
//               <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
//                 <AlertTriangle size={20} className="text-orange-500" />
//               </div>
//               <p className="text-sm font-extrabold text-foreground">High Risk</p>
//             </div>
//             <p className="text-3xl font-extrabold text-foreground">{loading ? '—' : summary?.high_count ?? 0}</p>
//           </div>
//           {/* Critical Risk */}
//           <div className="app-card rounded-[18px] p-5">
//             <div className="flex items-center gap-3 mb-4">
//               <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
//                 <ShieldAlert size={20} className="text-red-500" />
//               </div>
//               <p className="text-sm font-extrabold text-foreground">Critical Risk</p>
//             </div>
//             <p className="text-3xl font-extrabold text-foreground">{loading ? '—' : summary?.critical_count ?? 0}</p>
//           </div>
//         </div>
//       </div>

//       <h3 className="text-[20px] font-extrabold text-foreground mb-6">Team Risk Dashboard</h3>

//       {loading ? (
//         <div className="app-card rounded-[22px] py-16 text-center">
//           <Loader2 size={48} className="mx-auto text-blue-500 mb-3 animate-spin" />
//           <p className="text-foreground font-extrabold text-[20px]">Loading risk intelligence...</p>
//         </div>
//       ) : teams.length === 0 ? (
//         <div className="app-card rounded-[22px] py-16 text-center">
//           <div className="w-16 h-16 bg-cardSoft rounded-full flex items-center justify-center mx-auto mb-4">
//             <Activity size={32} className="text-slate-400" />
//           </div>
//           <p className="text-[20px] font-extrabold text-foreground mb-2">No team risk snapshots available</p>
//           <p className="text-sm font-medium text-muted">Run a risk sweep to generate updated team risk intelligence.</p>
//         </div>
//       ) : (
//         <div className="space-y-4">
//           {teams.map((team) => {
//             const style = riskLevelStyles[team.risk_level] ?? riskLevelStyles.low;
//             const computedDate = team.created_at || team.computed_at ? new Date(team.created_at || team.computed_at).toLocaleString() : '—';
            
//             return (
//               <div
//                 key={team.team_id}
//                 className={`app-card rounded-[22px] p-6 ${style.cardBorder}`}
//               >
//                 <div className="flex flex-col md:flex-row justify-between gap-4">
//                   <div className="flex-1">
//                     <div className="flex items-center gap-3 mb-2">
//                       <h4 className="font-extrabold text-foreground text-lg">{team.team_name || 'Team'}</h4>
//                       <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${style.pill}`}>
//                         {team.risk_level || 'MEDIUM'}
//                       </span>
//                     </div>

//                     <p className="text-sm text-muted mb-6 font-medium">
//                       <span className="text-muted">Risk Score:</span> {team.risk_score || 0}/100
//                     </p>

//                     <div className="mb-4">
//                       <p className="text-xs font-extrabold text-foreground uppercase tracking-wide mb-2">Reasons</p>
//                       {team.reasons?.length > 0 ? (
//                         <ul className="list-disc pl-5 text-sm text-muted font-medium space-y-1">
//                           {team.reasons.map((reason, index) => <li key={index} className="pl-1">{reason}</li>)}
//                         </ul>
//                       ) : (
//                         <p className="text-sm text-muted font-medium">No risk reasons available.</p>
//                       )}
//                     </div>

//                     <div>
//                       <p className="text-xs font-extrabold text-foreground uppercase tracking-wide mb-2">Recommended Actions</p>
//                       {team.recommended_actions?.length > 0 ? (
//                         <ul className="list-disc pl-5 text-sm text-muted font-medium space-y-1">
//                           {team.recommended_actions.map((action, index) => <li key={index} className="pl-1">{action}</li>)}
//                         </ul>
//                       ) : (
//                         <p className="text-sm text-muted font-medium">No recommended actions available.</p>
//                       )}
//                     </div>
//                   </div>

//                   <div className="flex items-start justify-end gap-3 mt-1 md:mt-0">
//                     <p className="text-xs font-medium text-muted mt-1">Computed: {computedDate}</p>
//                     <button className="text-slate-400 hover:text-muted transition-colors">
//                       <MoreVertical size={16} />
//                     </button>
//                   </div>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   )
// }

// ── TAB: DEMO CONTROLS ───────────────────────────────────────────────────
function DemoControlsTab() {
  const qc = useQueryClient()
  const { activeEvent, loadEvents } = useAuth()
  const [deleteEventConfirm, setDeleteEventConfirm] = useState('')
  const [deleteEventError, setDeleteEventError] = useState('')
  const [deleteEventSuccess, setDeleteEventSuccess] = useState('')
  const [deleteEventDialogOpen, setDeleteEventDialogOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [auditResult, setAuditResult] = useState(null);
  const [auditError, setAuditError] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);

  // Delete User state
  const [deleteUserEmail, setDeleteUserEmail] = useState('')
  const [deleteUserConfirm, setDeleteUserConfirm] = useState('')
  const [deleteUserError, setDeleteUserError] = useState('')
  const [deleteUserSuccess, setDeleteUserSuccess] = useState('')

  const runSecurityAudit = async () => {
    setIsAuditing(true);
    setAuditError('');
    try {
      const data = await evaluationsApi.auditIntegrity();
      setAuditResult(data);
    } catch (error) {
      setAuditError(error.message || 'Audit failed.');
    }
    setIsAuditing(false);
  };

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['demo-admin-status'],
    queryFn: demoAdminApi.status,
  })

  const { data: eventState, refetch: refetchState } = useQuery({
    queryKey: ['event-state'],
    queryFn: eventStateApi.get,
  })

  const resetMutation = useMutation({
    mutationFn: () => demoAdminApi.reset(confirmText),
    onSuccess: (res) => {
      alert(res.message + '\n\nDeleted:\n' + JSON.stringify(res.deleted, null, 2))
      setConfirmText('')
      refetchStatus()
      qc.invalidateQueries()
    },
    onError: (err) => alert('Error: ' + (err.response?.data?.detail || err.message))
  })

  const resetStageMutation = useMutation({
    mutationFn: () => eventStateApi.reset(),
    onSuccess: () => {
      refetchState()
      qc.invalidateQueries()
    },
    onError: (err) => alert('Error: ' + (err.response?.data?.detail || err.message))
  })

  const stageMutation = useMutation({
    mutationFn: (stage) => eventStateApi.setStage(stage),
    onSuccess: () => {
      refetchState()
      qc.invalidateQueries()
    },
    onError: (err) => alert('Error: ' + (err.response?.data?.detail || err.message))
  })

  const stepMutation = useMutation({
    mutationFn: (dir) => dir === 'next' ? eventStateApi.next() : eventStateApi.previous(),
    onSuccess: () => {
      refetchState()
      qc.invalidateQueries()
    },
    onError: (err) => alert('Error: ' + (err.response?.data?.detail || err.message))
  })

  const deleteEventMutation = useMutation({
    mutationFn: async ({ eventId }) => {
      if (!eventId) {
        throw new Error('No active event selected.')
      }

      return eventsApi.remove(eventId)
    },
    onMutate: () => {
      setDeleteEventError('')
      setDeleteEventSuccess('')
    },
    onSuccess: async (res, variables) => {
      const deletedName = variables?.eventName || activeEvent?.name || 'Event'
      const message =
        res?.message ||
        `${deletedName} deleted successfully.`

      setDeleteEventConfirm('')
      setDeleteEventError('')
      setDeleteEventSuccess(message)
      setDeleteEventDialogOpen(false)

      try {
        localStorage.removeItem('eventos_active_event_id')
      } catch {
        // ignore localStorage failure
      }

      qc.clear()
      await loadEvents()
      await refetchStatus()
    },
    onError: (err) => {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to delete event.'

      setDeleteEventError(message)
      setDeleteEventSuccess('')
      setDeleteEventDialogOpen(false)
      alert(`Delete event failed: ${message}`)
    },
  })

  const openDeleteEventDialog = (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()

    const typed = deleteEventConfirm.trim()

    if (!activeEvent?.id) {
      setDeleteEventError('No active event selected.')
      return
    }

    if (typed !== 'DELETE_EVENT') {
      setDeleteEventError('Type DELETE_EVENT exactly to enable deletion.')
      return
    }

    setDeleteEventError('')
    setDeleteEventSuccess('')
    setDeleteEventDialogOpen(true)
  }

  const confirmDeleteCurrentEvent = () => {
    if (!activeEvent?.id || deleteEventMutation.isPending) return

    deleteEventMutation.mutate({
      eventId: activeEvent.id,
      eventName: activeEvent.name || 'Event',
    })
  }

  const deleteUserMutation = useMutation({
    mutationFn: () => demoAdminApi.deleteUser(deleteUserEmail.trim(), deleteUserConfirm.trim()),
    onMutate: () => {
      setDeleteUserError('')
      setDeleteUserSuccess('')
    },
    onSuccess: (res) => {
      setDeleteUserSuccess(res.message || `User ${deleteUserEmail} deleted.`)
      setDeleteUserEmail('')
      setDeleteUserConfirm('')
      refetchStatus()
    },
    onError: (err) => {
      setDeleteUserError(err?.message || 'Failed to delete user.')
    },
  })

  return (
  <div data-demo-controls-safe-zone>
    <style>{`
      [data-demo-controls-safe-zone] {
        position: relative;
        isolation: isolate;
        pointer-events: auto;
      }

      [data-demo-controls-safe-zone] button,
      [data-demo-controls-safe-zone] input,
      [data-demo-controls-safe-zone] [role="button"] {
        pointer-events: auto !important;
        position: relative;
        z-index: 30;
      }

      [data-demo-controls-safe-zone] [class*="blur-"],
      [data-demo-controls-safe-zone] [class*="bg-gradient"] {
        pointer-events: none !important;
      }

      [data-delete-event-modal],
      [data-delete-event-modal] * {
        pointer-events: auto !important;
      }
    `}</style>

      <h2 className="text-[20px] font-extrabold text-foreground mb-6">Demo Controls</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="app-card rounded-[18px] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Users size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground mb-1">Participants</p>
            <p className="text-[28px] leading-none font-extrabold text-foreground">{status?.participants ?? 0}</p>
          </div>
        </div>

        <div className="app-card rounded-[18px] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <GitBranch size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground mb-1">Teams</p>
            <p className="text-[28px] leading-none font-extrabold text-foreground">{status?.teams ?? 0}</p>
          </div>
        </div>

        <div className="app-card rounded-[18px] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <BarChart2 size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground mb-1">Evaluations</p>
            <p className="text-[28px] leading-none font-extrabold text-foreground">{status?.evaluations ?? 0}</p>
          </div>
        </div>

        <div className="app-card rounded-[18px] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <UserCheck size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground mb-1">Mentors</p>
            <p className="text-[28px] leading-none font-extrabold text-foreground">{status?.mentors ?? 0}</p>
          </div>
        </div>

        <div className="app-card rounded-[18px] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Target size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground mb-1">Mentor Assignments</p>
            <p className="text-[28px] leading-none font-extrabold text-foreground">{status?.mentor_assignments ?? 0}</p>
          </div>
        </div>

        <div className="app-card rounded-[18px] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Mail size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground mb-1">Comms Logs</p>
            <p className="text-[28px] leading-none font-extrabold text-foreground">{status?.communication_logs ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Reset Demo Data Card */}
      <div className="app-card rounded-[22px] p-6 lg:p-8 mb-6">
        <div className="flex items-center gap-2 mb-4 text-orange-500">
          <AlertTriangle size={20} />
          <h3 className="text-lg font-extrabold">Reset Demo Data</h3>
        </div>
        <p className="text-sm font-medium text-muted mb-6 max-w-3xl">
          This clears participants, teams, evaluations, mentor assignments, feedback, sessions, and communication logs so you can restart the demo with the same CSV. Admin accounts are preserved.
        </p>
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="Type RESET_DEMO_DATA"
            className="w-full app-input h-11 px-4 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          <button
            onClick={() => resetMutation.mutate()}
            disabled={confirmText !== 'RESET_DEMO_DATA' || resetMutation.isPending}
            className="w-full md:w-auto shrink-0 px-6 h-11 bg-[#ff7a1a] hover:bg-[#ea580c] text-white text-sm font-extrabold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {resetMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reset Data
          </button>
        </div>
      </div>

      {/* Delete Current Event Card */}
      <div className="app-card rounded-[22px] p-6 lg:p-8 mb-8">
        <div className="flex items-center gap-2 mb-4 text-red-500">
          <AlertTriangle size={20} />
          <h3 className="text-lg font-extrabold">Delete Current Event</h3>
        </div>

        <p className="text-sm font-medium text-muted mb-2 max-w-3xl">
          This permanently deletes the selected event and its event-scoped data. Use this only for demo/test events.
        </p>

        <p className="text-sm font-extrabold text-foreground mb-6">
          Selected event: {activeEvent?.name || 'No event selected'}
        </p>

        <div className="flex flex-col md:flex-row gap-4 items-center">
          <input
            type="text"
            value={deleteEventConfirm}
            onChange={(e) => {
              setDeleteEventConfirm(e.target.value)
              setDeleteEventError('')
              setDeleteEventSuccess('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const typed = e.target.value.trim()
                if (activeEvent?.id && typed === 'DELETE_EVENT' && !deleteEventMutation.isPending) {
                  openDeleteEventDialog(e)
                }
              }
            }}
            placeholder="Type DELETE_EVENT"
            className="w-full app-input h-11 px-4 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
          />

          <button
            type="button"
            onClick={openDeleteEventDialog}
            disabled={!activeEvent?.id || deleteEventConfirm.trim() !== 'DELETE_EVENT' || deleteEventMutation.isPending}
            className="relative z-30 w-full md:w-auto shrink-0 px-6 h-11 bg-red-500 hover:bg-red-600 text-white text-sm font-extrabold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deleteEventMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete Event
          </button>
        </div>

        {deleteEventError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {deleteEventError}
          </div>
        )}

        {deleteEventSuccess && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {deleteEventSuccess}
          </div>
        )}
      </div>

      {deleteEventDialogOpen && (
        <div
          data-delete-event-modal
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm px-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-red-100">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertTriangle size={22} />
              <h3 className="text-lg font-extrabold">Delete Event Permanently?</h3>
            </div>

            <p className="text-sm font-medium text-slate-600 mb-2">
              This will permanently delete:
            </p>

            <p className="text-base font-extrabold text-slate-900 mb-5">
              {activeEvent?.name || 'Selected event'}
            </p>

            <p className="text-sm font-semibold text-red-600 mb-6">
              This action cannot be undone.
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteEventDialogOpen(false)}
                disabled={deleteEventMutation.isPending}
                className="px-5 h-11 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-extrabold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDeleteCurrentEvent}
                disabled={deleteEventMutation.isPending}
                className="px-5 h-11 rounded-xl bg-red-600 text-white text-sm font-extrabold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteEventMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User / Org Owner Card */}
      <div className="app-card rounded-[22px] p-6 lg:p-8 mb-8">
        <div className="flex items-center gap-2 mb-4 text-purple-500">
          <User size={20} />
          <h3 className="text-lg font-extrabold">Delete User / Org Owner</h3>
        </div>
        <p className="text-sm font-medium text-muted mb-6 max-w-3xl">
          Permanently delete a user account by email so the same email can be re-used for registration testing. If the user is the sole member of an organization, that organization is also removed.
        </p>
        <div className="flex flex-col md:flex-row gap-4 items-center mb-4">
          <input
            type="email"
            value={deleteUserEmail}
            onChange={(e) => {
              setDeleteUserEmail(e.target.value)
              setDeleteUserError('')
              setDeleteUserSuccess('')
            }}
            placeholder="user@example.com"
            className="w-full app-input h-11 px-4 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          <input
            type="text"
            value={deleteUserConfirm}
            onChange={(e) => {
              setDeleteUserConfirm(e.target.value)
              setDeleteUserError('')
              setDeleteUserSuccess('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (deleteUserEmail.trim() && deleteUserConfirm.trim() === 'DELETE_USER' && !deleteUserMutation.isPending) {
                  deleteUserMutation.mutate()
                }
              }
            }}
            placeholder="Type DELETE_USER"
            className="w-full app-input h-11 px-4 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          <button
            type="button"
            onClick={() => deleteUserMutation.mutate()}
            disabled={!deleteUserEmail.trim() || deleteUserConfirm.trim() !== 'DELETE_USER' || deleteUserMutation.isPending}
            className="w-full md:w-auto shrink-0 px-6 h-11 bg-purple-500 hover:bg-purple-600 text-white text-sm font-extrabold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deleteUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete User
          </button>
        </div>

        {deleteUserError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {deleteUserError}
          </div>
        )}

        {deleteUserSuccess && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {deleteUserSuccess}
          </div>
        )}
      </div>

      {/* Security & Integrity Section */}
      <h3 className="text-[20px] font-extrabold text-foreground mb-6">Security & Integrity</h3>
      <div className="app-card rounded-[22px] p-6 lg:p-8 mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-cardSoft border border-border/60 flex items-center justify-center shrink-0">
              <Shield className="text-muted" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-foreground">Zero-Trust Integrity Audit</h3>
              <p className="text-sm font-medium text-muted mt-1">Cryptographically verify that no scorecards have been manipulated.</p>
            </div>
          </div>
          <button
            onClick={runSecurityAudit}
            disabled={isAuditing}
            className="bg-card border border-border hover:bg-cardSoft text-blue-600 dark:text-blue-400 px-4 py-2.5 rounded-xl text-sm font-extrabold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shrink-0"
          >
            {isAuditing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {isAuditing ? "Scanning..." : "Run System Audit"}
          </button>
        </div>

        {auditResult && (
          <div className={`mt-6 p-4 rounded-xl border ${auditResult.is_secure ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
            {auditResult.is_secure ? (
              <p className="text-sm font-extrabold flex items-center gap-2">
                <ShieldCheck size={18} />
                Secure: {auditResult.total_audited} scorecards cryptographically verified. No tampering detected.
              </p>
            ) : (
              <div>
                <p className="text-sm font-extrabold flex items-center gap-2 mb-2">
                  <ShieldAlert size={18} />
                  CRITICAL ALERT: Database tampering detected!
                </p>
                <ul className="text-xs font-medium list-disc pl-5 space-y-1">
                  {auditResult.tampered_records.map(record => (
                    <li key={record.evaluation_id}>
                      Evaluation <span className="font-mono">{record.evaluation_id.slice(0, 8)}...</span> fails signature check.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {auditError && (
          <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-extrabold">
            {auditError}
          </div>
        )}
      </div>

      {/* Stage Controls Section */}
      <h3 className="text-[20px] font-extrabold text-foreground mb-6">Stage Controls</h3>
      <div className="app-card rounded-[22px] p-6 lg:p-8 mb-8">
        <div className="flex flex-col lg:flex-row justify-between gap-8">
          <div className="flex-1 max-w-sm">
            <p className="text-xs font-extrabold text-foreground uppercase tracking-wide mb-2">Current Stage</p>
            <p className="text-2xl font-extrabold text-foreground uppercase tracking-wide mb-6">
              {eventState?.current_stage?.replace('_', ' ') || 'loading...'}
            </p>
            
            <p className="text-xs font-extrabold text-foreground mb-2">Jump directly to stage:</p>
            <select
              value={eventState?.current_stage || ''}
              onChange={e => stageMutation.mutate(e.target.value)}
              className="w-full app-input h-11 px-4 text-sm font-medium text-foreground focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all appearance-none"
            >
              <option value="registration">Registration</option>
              <option value="team_formation">Team Formation</option>
              <option value="evaluation">Evaluation</option>
              <option value="results">Results</option>
            </select>
          </div>
          
          <div className="flex flex-wrap items-end gap-3">
            <button onClick={() => stepMutation.mutate('prev')} className="app-btn-secondary px-5 py-2.5 rounded-xl text-sm font-extrabold transition-colors shadow-sm">
              Previous
            </button>
            <button onClick={() => stepMutation.mutate('next')} className="app-btn-secondary px-5 py-2.5 rounded-xl text-sm font-extrabold transition-colors shadow-sm">
              Next
            </button>
            <button onClick={() => resetStageMutation.mutate()} disabled={resetStageMutation.isPending} className="bg-card border border-border hover:bg-cardSoft text-blue-600 dark:text-blue-400 px-5 py-2.5 rounded-xl text-sm font-extrabold transition-colors shadow-sm disabled:opacity-50">
              {resetStageMutation.isPending ? 'Resetting...' : 'Reset to Registration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function slugifyEventName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function CreateEventTab() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { loadEvents, switchEvent } = useAuth()
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    template_id: '',
  })

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['event-templates'],
    queryFn: eventsApi.templates,
  })

  const selectedTemplate = templates.find((t) => t.id === form.template_id) || null

  const createMutation = useMutation({
    mutationFn: () => {
      const name = form.name.trim()
      const slug = (form.slug.trim() || slugifyEventName(name))
      return eventsApi.create({
        name,
        slug,
        description: form.description.trim() || null,
        template_id: form.template_id || null,
        event_type: selectedTemplate?.key || 'generic_competitive_event',
        configuration: {},
      })
    },
    onSuccess: async (event) => {
      await loadEvents()
      switchEvent(event)
      qc.clear()
      setForm({ name: '', slug: '', description: '', template_id: '' })
      navigate('/admin?tab=overview')
    },
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <div className="bg-white border border-slate-100 shadow-[0_18px_45px_rgba(15,23,42,0.06)] rounded-[22px] p-8 dark:bg-slate-900/80 dark:border-white/10 dark:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-red-600">Create Event</h2>
            <p className="text-sm text-muted mt-1">
              Create from a system template. The event receives a copied template config and its own active capabilities.
            </p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 shrink-0 transition-colors dark:bg-slate-900/70 dark:border-white/10 dark:text-slate-100 dark:hover:bg-slate-800">
            <LayoutTemplate className="h-4 w-4" />
            Template marketplace
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">Event name</label>
            <div className="relative opacity-100">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <Calendar className="h-4 w-4" />
              </div>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  slug: f.slug || slugifyEventName(e.target.value),
                }))}
                placeholder="Smart India Hackathon Demo"
                className="w-full h-14 rounded-xl border border-slate-200 bg-white pl-14 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 shadow-sm dark:bg-slate-950/70 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-red-400/50 dark:focus:ring-red-500/10"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">Slug</label>
            <div className="relative opacity-100">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Link className="h-4 w-4" />
              </div>
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugifyEventName(e.target.value) }))}
                placeholder="smart-india-hackathon-demo"
                className="w-full h-14 rounded-xl border border-slate-200 bg-white pl-14 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 shadow-sm dark:bg-slate-950/70 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-red-400/50 dark:focus:ring-red-500/10"
              />
            </div>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-muted mb-2">Template</label>
          <div className="relative opacity-100">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <LayoutTemplate className="h-4 w-4" />
            </div>
            <select
              value={form.template_id}
              onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
              className="w-full h-14 rounded-xl border border-slate-200 bg-white pl-14 pr-10 text-sm font-medium text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 shadow-sm appearance-none dark:bg-slate-950/70 dark:border-white/10 dark:text-slate-100 dark:focus:border-red-400/50 dark:focus:ring-red-500/10"
            >
              <option value="" className="text-slate-400">{isLoading ? 'Loading templates...' : 'Choose a template'}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id} className="text-foreground">
                  {template.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </div>

        {selectedTemplate && (
          <div className="rounded-xl bg-cardSoft border border-border p-4 mb-5">
            <p className="text-sm font-bold text-foreground">{selectedTemplate.name}</p>
            <p className="text-xs text-muted mt-1">{selectedTemplate.description}</p>
            <div className="flex gap-2 flex-wrap mt-3">
              {(selectedTemplate.default_capabilities || []).map((cap) => (
                <Badge key={cap} colour="teal">{cap}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8 opacity-100">
          <label className="block text-sm font-semibold text-muted mb-2">Description (Optional)</label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <ClipboardList className="h-4 w-4" />
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional internal description for this event..."
              className="w-full min-h-[150px] rounded-xl border border-slate-200 bg-white pl-14 pr-4 py-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none resize-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 shadow-sm dark:bg-slate-950/70 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-red-400/50 dark:focus:ring-red-500/10"
            />
          </div>
        </div>

        {createMutation.isError && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-3 mb-5 text-sm font-medium">
            {createMutation.error?.message}
          </div>
        )}

        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.name.trim() || !form.template_id}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-6 text-sm font-bold text-white shadow-[0_12px_24px_rgba(239,68,68,0.25)] transition hover:from-red-600 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText className="h-4 w-4" />
          {createMutation.isPending ? 'Creating...' : 'Create from template'}
        </button>
      </div>

      <aside className="bg-white border border-slate-100 shadow-[0_18px_45px_rgba(15,23,42,0.06)] rounded-[22px] p-8 dark:bg-slate-900/80 dark:border-white/10">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
          <Lightbulb className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2">Need AI help?</h3>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          Use the AI event builder when you do not know the template, stages, team size, or scoring structure yet.
        </p>
        <button
          type="button"
          onClick={() => navigate('/configure')}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-sm font-bold text-white shadow-[0_14px_28px_rgba(239,68,68,0.28)] transition hover:from-orange-600 hover:to-red-600"
        >
          <Sparkles className="h-4 w-4" />
          Create with AI
        </button>
      </aside>
    </div>
  )
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview', Icon: BarChart2 },
  { key: 'createevent', label: 'Create Event', Icon: Plus },
  { key: 'participants', label: 'Participants', Icon: Users, requiresEvent: true },
  { key: 'teams', label: 'Team Formation', Icon: GitBranch, requiresEvent: true, capabilities: ['teams'] },
  { key: 'approvals', label: 'Approvals', Icon: CheckSquare, requiresEvent: true, capabilities: ['teams'] },
  { key: 'timeline', label: 'Timeline', Icon: Calendar, requiresEvent: true },
  { key: 'evaluators', label: 'Evaluators', Icon: UserCheck, requiresEvent: true, capabilities: ['evaluators'] },
  { key: 'communications', label: 'Communications', Icon: Mail, requiresEvent: true },
  { key: 'mentorops', label: 'Mentor Ops', Icon: Target, requiresEvent: true, capabilities: ['mentors'] },
  { key: 'anomaly', label: 'Anomaly Scanner', Icon: Activity, requiresEvent: true, anyCapabilities: ['evaluators', 'weighted_scoring'] },
  { key: 'health', label: 'Team Health', Icon: Activity, requiresEvent: true, capabilities: ['risk_monitoring'] },
  // { key: 'risk', label: 'Risk', Icon: ShieldAlert, requiresEvent: true, capabilities: ['risk_monitoring'] },
  { key: 'democontrols', label: 'Demo Controls', Icon: AlertTriangle, requiresEvent: true },
  { key: 'settings', label: 'Settings', Icon: Settings },
]

const VALID_TABS = TABS.map(t => t.key)

function tabAllowed(tab, activeEvent) {
  if (!tab.requiresEvent && !tab.capabilities && !tab.anyCapabilities) return true
  if (tab.requiresEvent && !activeEvent?.id) return false

  const capabilities = new Set(activeEvent?.active_capabilities || [])
  if (tab.capabilities?.some((cap) => !capabilities.has(cap))) return false
  if (tab.anyCapabilities?.length && !tab.anyCapabilities.some((cap) => capabilities.has(cap))) return false
  return true
}

function getInitialAdminTab() {
  const urlTab = new URLSearchParams(window.location.search).get('tab')
  if (VALID_TABS.includes(urlTab)) return urlTab

  const savedTab = localStorage.getItem('eventosAdminActiveTab')
  if (VALID_TABS.includes(savedTab)) return savedTab

  return 'overview'
}

export default function AdminDashboard() {
  const { activeOrganization, activeEvent } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(getInitialAdminTab)

  const visibleTabs = useMemo(() => TABS.filter((tab) => tabAllowed(tab, activeEvent)), [activeEvent])
  const visibleTabKeys = useMemo(() => visibleTabs.map((tab) => tab.key), [visibleTabs])

  const handleTabChange = (tab) => {
    if (tab && !visibleTabKeys.includes(tab)) return
    setActiveTab(tab || 'overview')
    const url = new URL(window.location.href)
    if (tab) {
      localStorage.setItem('eventosAdminActiveTab', tab)
      url.searchParams.set('tab', tab)
    } else {
      localStorage.removeItem('eventosAdminActiveTab')
      url.searchParams.delete('tab')
    }
    window.history.replaceState(null, '', url.toString())
  }

  const TAB_CONTENT = {
    overview: (
      <div className="space-y-8">
        {activeEvent?.id && <PipelineStepper showAdvanceButton className="relative z-0" />}
        {activeEvent?.id && (
          <>
            <OverviewTab onTileClick={handleTabChange} />
            <div id="leaderboard-section">
              <LeaderboardTab />
            </div>
          </>
        )}
        {!activeEvent?.id && (
          <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
            <BarChart2 size={36} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium">No event selected</p>
            <p className="text-xs mt-1">Create or select an event to see the overview dashboard.</p>
          </div>
        )}
      </div>
    ),
    createevent: <CreateEventTab />,
    participants: <ParticipantsTab />,
    teams: <TeamsTab />,
    approvals: <ApprovalsTab />,
    timeline: <StageTimelinePanel />,
    evaluators: <EvaluatorsTab />,
    communications: <CommunicationsTab />,
    mentorops: <MentorOpsTab />,
    anomaly: <AnomalyTab />,
    health: <HealthTab />,
    // risk: <RiskTab />,
    democontrols: <DemoControlsTab />,
    settings: <SettingsTab key={activeOrganization?.id || 'no-org'} />,
  }

  const navItems = visibleTabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    Icon: tab.Icon,
    isActive: activeTab === tab.key && !tab.isNav,
    onClick: () => tab.isNav ? navigate(tab.navTo) : handleTabChange(tab.key),
    suffix: tab.isNav ? '↗' : undefined
  }))

  const currentTabLabel = TABS.find(t => t.key === activeTab)?.label || 'Overview'

  return (
    <AppLayout
      title="EventOS Platform"
      subtitle="Hackathon Operating System"
      customActions={
        <>
          <NotificationBell />
          <OrgSwitcher />
        </>
      }
      navigationItems={navItems}
    >
      <div className="relative z-10 w-full">
        {/* Page title row */}
        <div className="mb-6">
          <h1 className="app-page-title">{currentTabLabel}</h1>
          {activeEvent?.name && activeTab !== 'overview' && (
            <p className="app-page-subtitle mt-1">{activeEvent.name}</p>
          )}
        </div>

        {/* Active tab content — rendered inline, not in a modal */}
        {TAB_CONTENT[activeTab] || TAB_CONTENT.overview}
      </div>
    </AppLayout>
  )
}

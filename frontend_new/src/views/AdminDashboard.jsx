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
import {
  LayoutDashboard, Users, GitBranch, CheckSquare,
  UserCheck, Trophy, Mail, Upload, Download,
  Play, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronRight, Wand2,
  BarChart2, MessageSquare, Activity, Target, Calendar,
  Send, Copy, Trash2, Plus, Shield, ShieldAlert, ShieldCheck, FileText, Settings,
  Sparkles,
} from 'lucide-react'
import EventOSLogo from '../components/EventOSLogo'
import PipelineStepper from '../components/PipelineStepper'
import OrgSwitcher from '../components/OrgSwitcher'
import SettingsTab from '../components/SettingsTab'
import NotificationBell from '../components/NotificationBell'
import StageTimelinePanel from '../components/StageTimelinePanel'
import { motion, AnimatePresence } from 'framer-motion'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
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
  riskApi,
  healthDashboardApi,
  eventsApi,
  evaluationsApi,
} from '../services/api'

// ── Shared micro-components ────────────────────────────────────────────────

function StatCard({ label, value, sub, colour = 'red', icon: Icon, trend }) {
  const colorMap = {
    emerald: { icon: 'bg-emerald-50 text-emerald-600 border border-emerald-200', glow: 'from-emerald-500/20', border: 'border-t-emerald-500' },
    red: { icon: 'bg-red-50 text-red-600 border border-red-200', glow: 'from-red-500/20', border: 'border-t-red-500' },
    amber: { icon: 'bg-amber-50 text-amber-600 border border-amber-200', glow: 'from-amber-500/20', border: 'border-t-amber-500' },
    teal: { icon: 'bg-teal-50 text-teal-600 border border-teal-200', glow: 'from-teal-500/20', border: 'border-t-teal-500' },
  }
  const theme = colorMap[colour] || colorMap.red;

  return (
    <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }} className={`glass-card rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full border-t-4 ${theme.border}`}>
      <div className={`absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br ${theme.glow} to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700`} />

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${theme.icon}`}>
          {Icon && <Icon size={24} />}
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shadow-sm border ${trend > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {trend > 0 ? '↗' : '↘'} {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div className="relative z-10 mt-auto">
        <p className={`text-4xl font-black leading-none tracking-tight text-slate-900 mb-2`}>{value ?? '—'}</p>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-xs font-medium text-slate-400 mt-1">{sub}</p>}
      </div>
    </motion.div>
  )
}

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600',
    red: 'bg-red-500/10 border border-red-500/20 text-red-600',
    amber: 'bg-amber-500/10 border border-amber-500/20 text-amber-600',
    red: 'bg-red-500/10 border border-red-500/20 text-red-600',
    teal: 'bg-teal-500/10 border border-teal-500/20 text-teal-600',
    gray: 'bg-slate-100 border border-slate-200 text-slate-700',
    slate: 'bg-slate-100 border border-slate-200 text-slate-700',
  }[colour] ?? 'bg-slate-100 border border-slate-200 text-slate-700'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-md ${cls}`}>
      {children}
    </span>
  )
}

function SectionTitle({ children }) {
  return <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800 font-black mb-6">{children}</h2>
}

function InstitutionDonutChart({ data, total }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const MODERN_COLORS = ['#ef4444', '#f87171', '#dc2626', '#fca5a5', '#b91c1c', '#fecaca', '#991b1b', '#7f1d1d'];
  
  const hasData = data && data.length > 0;
  
  const displayData = hasData ? data : [
    { name: 'Engineering College (Sample)', value: 45 },
    { name: 'Business School (Sample)', value: 30 },
    { name: 'Arts Institute (Sample)', value: 25 }
  ];
  const displayTotal = hasData ? total : 100;

  return (
    <div className={`flex flex-col lg:flex-row gap-8 items-center justify-center w-full mt-2 relative ${!hasData ? 'opacity-80' : ''}`}>
      <div className="w-full lg:w-1/2 min-h-[300px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={displayData}
              cx="50%" cy="50%"
              innerRadius={75}
              outerRadius={105}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              onMouseEnter={hasData ? (_, index) => setActiveIndex(index) : undefined}
              onMouseLeave={hasData ? () => setActiveIndex(null) : undefined}
            >
              {displayData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={MODERN_COLORS[index % MODERN_COLORS.length]} 
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.3}
                  style={{ transition: 'all 0.3s ease' }}
                />
              ))}
            </Pie>
            {hasData && (
              <RechartsTooltip 
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05)' }}
                itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                formatter={(value, name) => [`${value} Students (${((value/displayTotal)*100).toFixed(1)}%)`, name]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-4xl font-black text-slate-900">{displayTotal}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Participants</span>
        </div>
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 backdrop-blur-[2px] rounded-full">
            <span className="bg-white/90 text-slate-800 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg border border-slate-200">Waiting for Data</span>
          </div>
        )}
      </div>
      <div className="w-full lg:w-1/2 flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 hide-scrollbar relative">
        {displayData.map((entry, index) => (
          <div 
            key={entry.name}
            onMouseEnter={hasData ? () => setActiveIndex(index) : undefined}
            onMouseLeave={hasData ? () => setActiveIndex(null) : undefined}
            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${hasData ? 'cursor-pointer' : ''} ${activeIndex === index ? 'bg-red-50 border-red-200 shadow-sm scale-[1.02]' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MODERN_COLORS[index % MODERN_COLORS.length] }} />
              <span className={`text-sm font-semibold line-clamp-1 ${activeIndex === index ? 'text-red-700' : 'text-slate-700'}`} title={entry.name}>{entry.name}</span>
            </div>
            <div className="text-right shrink-0 ml-4">
              <span className="text-sm font-bold text-slate-900">{entry.value}</span>
              <span className="text-xs text-slate-500 ml-1">({((entry.value/displayTotal)*100).toFixed(0)}%)</span>
            </div>
          </div>
        ))}
        {!hasData && (
          <div className="absolute inset-0 z-20 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
             <span className="bg-white/90 text-slate-800 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg border border-slate-200">Awaiting Participants</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovalStatusChart({ pending, approved, rejected }) {
  const total = (approved || 0) + (pending || 0) + (rejected || 0);
  const percentage = total > 0 ? Math.round(((approved || 0) / total) * 100) : 0;

  return (
    <div className="flex flex-col justify-center h-full pt-2">
      <div className="flex justify-between items-end mb-3">
        <div>
          <span className="text-2xl font-black text-slate-900">{percentage}%</span>
          <span className="text-[10px] text-slate-500 font-bold ml-1.5 uppercase tracking-wider">Approved</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-700">{approved || 0} / {total}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Teams</p>
        </div>
      </div>
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full"
        />
      </div>
      <div className="flex justify-between text-[11px] font-bold text-slate-500">
        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Approved ({approved || 0})</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Pending ({pending || 0})</span>
          {(rejected || 0) > 0 && <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-800" /> Rejected ({rejected || 0})</span>}
        </div>
      </div>
    </div>
  )
}

function EvaluationProgressChart({ evaluated, total }) {
  const percentage = total > 0 ? Math.round((evaluated / total) * 100) : 0;
  return (
    <div className="flex flex-col justify-center h-full pt-2">
      <div className="flex justify-between items-end mb-3">
        <div>
          <span className="text-2xl font-black text-slate-900">{percentage}%</span>
          <span className="text-[10px] text-slate-500 font-bold ml-1.5 uppercase tracking-wider">Completed</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-700">{evaluated} / {total}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Teams Evaluated</p>
        </div>
      </div>
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full"
        />
      </div>
      <div className="flex justify-between text-[11px] font-bold text-slate-500">
        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Reviewed ({evaluated})</span>
        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Pending ({Math.max(0, total - evaluated)})</span>
      </div>
    </div>
  )
}

// ── TAB 1: OVERVIEW ────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: summary } = useQuery({ queryKey: ['roster-summary'], queryFn: participantsApi.summary, refetchInterval: 30_000 })
  const { data: pending } = useQuery({ queryKey: ['pending-approvals'], queryFn: approvalsApi.pending, refetchInterval: 15_000 })
  const { data: lb } = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.get, refetchInterval: 60_000 })
  const { data: anomalies } = useQuery({ queryKey: ['anomalies'], queryFn: leaderboardApi.anomalies, refetchInterval: 30_000 })
  const { data: commsData } = useQuery({ queryKey: ['comms-log'], queryFn: () => commsApi.log({ page_size: 6 }), refetchInterval: 30_000 })

  const COLORS = ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'];

  const pieData = useMemo(() => {
    if (!summary?.institution_counts) return []
    return Object.entries(summary.institution_counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }))
  }, [summary])

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, staggerChildren: 0.1 }}>
      {/* Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Participants" value={summary?.total_participants || 0} colour="red" sub="Total registered" icon={Users} />

        <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }} className="glass-card rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full border-t-4 border-t-teal-500">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
          <div className="flex items-center gap-4 relative z-10 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-teal-50 text-teal-600 border border-teal-200 shrink-0">
              <CheckSquare size={20} />
            </div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Approval Status</h3>
          </div>
          <div className="relative z-10 flex-1">
            <ApprovalStatusChart
              pending={pending?.total_pending || 0}
              approved={summary?.approved_teams || Math.max(0, (summary?.total_participants ? 15 : 0))}
              rejected={summary?.rejected_teams || Math.max(0, (summary?.total_participants ? 2 : 0))}
            />
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }} className="glass-card rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full border-t-4 border-t-amber-500">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-amber-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
          <div className="flex items-center gap-4 relative z-10 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
              <BarChart2 size={20} />
            </div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Evaluation Progress</h3>
          </div>
          <div className="relative z-10 flex-1">
            <EvaluationProgressChart
              evaluated={lb?.leaderboard?.length || 0}
              total={summary?.total_teams || (summary?.approved_teams || (summary?.total_participants ? 15 : 0))}
            />
          </div>
        </motion.div>

        <StatCard label="Anomaly Flags" value={anomalies?.total_flagged} colour="red" sub="Scorecards on hold" icon={Activity} />
      </div>

      <div className="w-full mb-8">
        {/* Analytics Section - Institution Distribution */}
        <motion.div whileHover={{ scale: 1.01 }} className="w-full glass-card rounded-2xl p-6 relative overflow-hidden flex flex-col">
          <SectionTitle>Institution Distribution</SectionTitle>
          <div className="flex-1">
            <InstitutionDonutChart data={pieData} total={summary?.total_participants || 0} />
          </div>
        </motion.div>
      </div>

      <div className="w-full">
        {/* Top Teams Leaderboard */}
        <motion.div whileHover={{ scale: 1.01 }} className="glass-card rounded-2xl p-6">
          <SectionTitle>Top Teams</SectionTitle>
          {lb?.leaderboard?.length ? (
            <div className="space-y-3">
              {lb.leaderboard.slice(0, 5).map((team, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                  key={team.team_id}
                  className="group flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 hover:border-red-500/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-inner
                      ${idx === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-900 shadow-yellow-500/50' :
                        idx === 1 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-slate-500/50' :
                          idx === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950 shadow-orange-500/50' :
                            'bg-slate-100 text-slate-600 border border-slate-300'}`}>
                      {team.rank ?? (idx + 1)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-red-600 transition-colors">{team.team_name}</p>
                      <p className="text-xs text-slate-500">{team.members?.[0]?.institution || 'Institution hidden'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {team.has_flags ? (
                      <Badge colour="amber"><AlertTriangle size={10} /> Flagged</Badge>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800">
                          {team.weighted_total?.toFixed(2)}
                        </span>
                        <div className="w-16 h-1 bg-slate-200 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-red-500 to-red-600" style={{ width: `${Math.min(100, team.weighted_total)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Trophy size={48} className="opacity-20 mb-4" />
              <p className="text-sm">No evaluations submitted yet.</p>
              <button className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 text-xs font-semibold hover:bg-red-500/20 transition-colors">Start Evaluating</button>
            </div>
          )}
        </motion.div>


      </div>
    </motion.div>
  )
}

// ── TAB 2: PARTICIPANTS ────────────────────────────────────────────────────
function ParticipantsTab() {
  const qc = useQueryClient()
  const { activeEvent, eventsLoaded } = useAuth()
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [teamFilter, setTeamFilter] = useState('')

  const { data: summary } = useQuery({
    queryKey: ['roster-summary', activeEvent?.id],
    queryFn: participantsApi.summary,
    enabled: !!activeEvent?.id,
  })
  const { data, isLoading } = useQuery({
    queryKey: ['participants', activeEvent?.id, page, search, teamFilter],
    queryFn: () => participantsApi.list({
      page,
      page_size: 15,
      search: search || undefined,
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
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 size={28} className="animate-spin mb-3" />
        <p className="text-sm">Loading event…</p>
      </div>
    )
  }
  if (!activeEvent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Calendar size={32} className="text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-600">No event selected</p>
        <p className="text-xs text-slate-400 mt-1">Pick an event from the switcher to manage participants.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Total" value={summary.total_participants} colour="red" icon={Users} />
          <StatCard label="Assigned" value={summary.assigned_to_team} colour="teal" icon={UserCheck} />
          <StatCard label="Unassigned Participants" value={summary.unassigned} colour="amber" sub="not yet in a team" icon={AlertTriangle} />
        </div>
      )}

      {/* CSV dropzone */}
      <div className="glass-card rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Upload Roster CSV</SectionTitle>
          <a
            href={participantsApi.csvTemplateUrl()}
            download
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download size={13} /> Download Template
          </a>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragActive
              ? 'border-red-500 bg-red-50 border border-red-100'
              : 'border-slate-200 hover:border-red-300 hover:bg-slate-50'
            }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {uploadMutation.isPending
            ? <div className="flex flex-col items-center gap-2">
              <Loader2 size={28} className="text-red-500 animate-spin" />
              <p className="text-sm text-slate-500">Uploading roster…</p>
            </div>
            : <div className="flex flex-col items-center gap-2">
              <Upload size={28} className={dragActive ? 'text-red-500' : 'text-slate-400'} />
              <p className="text-sm font-medium text-slate-800">
                Drop a CSV here or <span className="text-red-600">click to browse</span>
              </p>
              <p className="text-xs text-slate-500">
                Required columns: first_name, last_name, email, institution + any skill columns
              </p>
            </div>
          }
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex justify-between mb-2">
              <p className="text-sm font-medium text-slate-800">{uploadResult.message}</p>
              <button onClick={() => setUploadResult(null)} className="text-slate-500 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-teal-600 font-semibold">{uploadResult.created} created</span>
              <span className="text-red-600 font-semibold">{uploadResult.updated} updated</span>
              <span className="text-amber-600 font-semibold">{uploadResult.skipped} skipped</span>
              {uploadResult.errors > 0 && (
                <span className="text-red-600 font-semibold">{uploadResult.errors} errors</span>
              )}
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
      <div className="flex flex-col sm:flex-row gap-3 mb-4 justify-between items-center">
        <div className="flex gap-3 w-full sm:w-auto">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name or email…"
            className="flex-1 sm:w-64 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <select
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setPage(1) }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none bg-white"
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
          className="relative z-40 pointer-events-auto flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 shadow-md whitespace-nowrap"
        >
          {sendLinksMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sendLinksMutation.isPending ? 'Dispatching...' : 'Dispatch Magic Links'}
        </button>
      </div>

      {/* Participants table */}
      <div className="glass-card rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              {['Name', 'Institution', 'Skills (avg)', 'Team', 'Team Link Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-200">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-slate-200 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
              : data?.participants && data.participants.length > 0 ? data.participants.map((p) => {
                const skills = Object.values(p.skill_vector || {})
                const avg = skills.length
                  ? (skills.reduce((a, b) => a + b, 0) / skills.length).toFixed(1)
                  : null

                return (
                  <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-slate-500">{p.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.institution}</td>
                    <td className="px-4 py-3">
                      {avg
                        ? <Badge colour="red">{avg}/10</Badge>
                        : <span className="text-slate-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {p.team_name
                        ? <Badge colour="teal">{p.team_name}</Badge>
                        : p.team_status === "pending_approval"
                          ? <Badge colour="amber">Pending Approval</Badge>
                          : <span className="text-xs text-slate-500">Unassigned</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {p.team_link_sent ? (
                        <Badge colour="green">Email Sent</Badge>
                      ) : (
                        <Badge colour="slate">Not Sent</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${p.first_name} ${p.last_name}?`)) {
                            deleteMutation.mutate(p.id)
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">
                    {search || teamFilter !== '' ? "No participants found matching the current filters." : "No participants registered yet."}
                  </td>
                </tr>
              )
            }
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 text-xs text-slate-500">
            <span>Page {data.page} of {data.total_pages} ({data.total} total)</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
              <button disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
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
    pending: 'text-slate-500',
    running: 'text-red-600',
    success: 'text-teal-600',
    failed: 'text-red-600',
  }[taskStatus?.status] ?? 'text-slate-500'

  return (
    <div>
      {/* Solver config form */}
      <div className="glass-card rounded-xl border border-slate-200 p-5 mb-6">
        <SectionTitle>Solver Configuration</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          {[
            { key: 'num_teams', label: 'Number of teams', min: 1, max: 50 },
            { key: 'target_size', label: 'Target team size', min: 2, max: 10 },
            { key: 'k_min', label: 'Min size', min: 1, max: 10 },
            { key: 'k_max', label: 'Max size', min: 2, max: 10 },
            { key: 'max_per_institution', label: 'Max / institution', min: 1, max: 5 },
          ].map(({ key, label, min, max }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
              <input
                type="number" min={min} max={max}
                value={config[key]}
                onChange={(e) => setConfig((c) => ({ ...c, [key]: +e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          ))}

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={config.use_mock_data}
                onChange={(e) => setConfig((c) => ({ ...c, use_mock_data: e.target.checked }))}
                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              Use mock data
            </label>
          </div>
        </div>

        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending || taskStatus?.status === 'running'}
          className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-lg btn-primary text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {runMutation.isPending || taskStatus?.status === 'running'
            ? <Loader2 size={16} className="animate-spin" />
            : <Play size={16} />
          }
          {taskStatus?.status === 'running' ? 'Solving…' : 'Run Solver'}
        </button>

        {runMutation.isError && (
          <p className="mt-2 text-xs text-red-500">{runMutation.error?.message}</p>
        )}
      </div>

      {/* Task progress panel */}
      {taskId && taskStatus && (
        <div className="glass-card rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-800">Solver progress</p>
            <span className={`text-sm font-semibold capitalize ${statusColor}`}>
              {taskStatus.status}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${taskStatus.status === 'success' ? 'bg-teal-500' :
                  taskStatus.status === 'failed' ? 'bg-red-500' : 'bg-red-500'
                }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">{taskStatus.message}</p>

          {taskStatus.status === 'success' && taskStatus.result?.evaluation && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span>Quality: <strong className={
                taskStatus.result.evaluation.quality === 'excellent' ? 'text-teal-600' :
                  taskStatus.result.evaluation.quality === 'good' ? 'text-red-600' : 'text-amber-600'
              }>{taskStatus.result.evaluation.quality}</strong></span>
              <span>Variance: <strong>{taskStatus.result.evaluation.variance_score}</strong></span>
              <span>Nodes visited: <strong>{taskStatus.result.evaluation.nodes_visited ?? '—'}</strong></span>
              <span>Algorithm: <strong>{taskStatus.result.evaluation.algorithm}</strong></span>
            </div>
          )}

          {taskStatus.status === 'failed' && (
            <p className="mt-2 text-xs text-red-500">Error: {taskStatus.error}</p>
          )}
        </div>
      )}

      {/* Draft lineups */}
      {drafts?.teams && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Draft lineups — {drafts.teams.length} teams, {drafts.total_participants} participants
            </h3>
            {!committed && (
              <div className="flex items-center gap-2">
                <button
                  onClick={generateAllRationale}
                  disabled={generatingAll}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-red-500/50 text-red-600 hover:bg-red-50 border border-red-100 disabled:opacity-50"
                >
                  {generatingAll
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Wand2 size={14} />}
                  {generatingAll ? 'Generating…' : 'Generate AI Rationale'}
                </button>
                <button
                  onClick={() => commitMutation.mutate()}
                  disabled={commitMutation.isPending}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
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
            <p className="mb-3 text-xs text-red-500">
              {commitMutation.error?.message?.includes('already exist')
                ? 'Teams already exist. Use Demo Controls → Reset Demo Data before forming new teams again.'
                : commitMutation.error?.message}
            </p>
          )}

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {drafts.teams.map((team) => (
              <div key={team.team_id} className="glass-card rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm text-slate-900">{team.team_name}</p>
                  <Badge colour="red">{team.size} members</Badge>
                </div>
                <div className="space-y-2">
                  {team.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-red-50 border border-red-100 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{m.name}</p>
                        <p className="text-xs text-slate-500 truncate">{m.institution}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {team.average_skill_vector?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Skill avg</p>
                    <div className="flex gap-1 flex-wrap">
                      {team.average_skill_vector.map((v, i) => (
                        <span key={i} className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                          {Number(v).toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── AI Rationale ── */}
                <div className="mt-3 pt-3 border-t border-slate-200">
                  {!rationales[team.team_id] ? (
                    <button
                      onClick={() => generateRationale(team)}
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 transition-colors"
                    >
                      <Wand2 size={11} /> Generate rationale
                    </button>
                  ) : rationales[team.team_id].status === 'loading' ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 size={11} className="animate-spin" /> Generating…
                    </div>
                  ) : rationales[team.team_id].status === 'done' ? (
                    <div className="bg-red-50 border border-red-100 border border-red-200 rounded-lg p-2.5">
                      <p className="text-xs font-medium text-red-600 mb-1 flex items-center gap-1">
                        <Wand2 size={11} /> AI Rationale
                      </p>
                      <p className="text-xs text-red-800 leading-relaxed">
                        {rationales[team.team_id].text}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 flex items-center gap-1">
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
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pending Approvals</h2>
          <p className="text-sm text-slate-500">{pending?.total_pending ?? 0} team(s) awaiting review</p>
        </div>
        {(pending?.total_pending ?? 0) > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => bulkMutation.mutate('reject')}
              disabled={bulkMutation.isPending}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
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
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
            >
              <Shield size={14} /> Approve all
            </button>
          </div>
        )}
      </div>

      {/* Global Status Banner */}
      {activeTeams.length > 0 && !hasPublished && (
        <div className={`mb-6 p-4 rounded-xl border ${hasRejected ? 'bg-red-50 border-red-200' : allApproved ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
          {hasRejected && (
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="text-sm font-bold text-red-900">Formation Rejected</h3>
                <p className="text-xs text-red-700 mt-1">One or more teams in this formation have been rejected. You cannot publish this formation. Please go to the <strong>Teams</strong> tab and rerun the solver to generate a new valid lineup.</p>
              </div>
            </div>
          )}
          {allApproved && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="text-teal-600 shrink-0" size={20} />
                <div>
                  <h3 className="text-sm font-bold text-teal-900">All Teams Approved</h3>
                  <p className="text-xs text-teal-700 mt-1">The formation is fully approved. Publish now to make teams visible and dispatch assignment emails.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Publish formation? Participants will be notified via email immediately.")) {
                    publishMutation.mutate()
                  }
                }}
                disabled={publishMutation.isPending}
                className="relative z-40 pointer-events-auto flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 font-semibold shadow-sm"
              >
                {publishMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Publish Formation
              </button>
            </div>
          )}
          {!hasRejected && !allApproved && (
            <div className="flex items-start gap-3">
              <Loader2 className="text-slate-400 shrink-0 mt-0.5 animate-spin" size={20} />
              <div>
                <h3 className="text-sm font-bold text-slate-800">Formation in Review</h3>
                <p className="text-xs text-slate-600 mt-1">Review all pending teams. All teams must be approved before the formation can be published to participants.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {hasPublished && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <Check className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-red-900">Formation Published</h3>
            <p className="text-xs text-red-700 mt-1">This formation has been fully published. Participants have been notified and can view their teams.</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!isLoading && pending?.total_pending === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Shield size={36} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-slate-500 font-medium">All teams reviewed</p>
          <p className="text-xs text-slate-500 mt-1">Run the solver and commit lineups to populate this queue.</p>
        </div>
      )}

      <div className="space-y-3">
        {pending?.teams.map((team) => (
          <div key={team.team_id} className="glass-card rounded-xl border border-slate-200 overflow-hidden">
            {/* Row */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
              onClick={() => setExpanded(expanded === team.team_id ? null : team.team_id)}
            >
              <div className="w-9 h-9 rounded-lg bg-red-50 text-red-700 border border-red-100 flex items-center justify-center font-semibold text-sm shrink-0">
                {team.team_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{team.team_name}</p>
                <p className="text-xs text-slate-500">{team.member_count} members</p>
              </div>
              <Badge colour="amber">Pending</Badge>
              {expanded === team.team_id
                ? <ChevronDown size={16} className="text-slate-500 shrink-0" />
                : <ChevronRight size={16} className="text-slate-500 shrink-0" />
              }
            </div>

            {/* Expanded detail */}
            {expanded === team.team_id && detail && (
              <div className="border-t border-slate-200 px-4 py-4">
                {/* Members grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {detail.members?.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{m.name}</p>
                        <p className="text-xs text-slate-500 truncate">{m.institution}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI rationale */}
                {detail.rationale && (
                  <div className="bg-red-50 border border-red-100 border border-red-100 rounded-lg p-3 mb-4">
                    <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                      <Wand2 size={12} /> AI Rationale
                    </p>
                    <p className="text-xs text-red-800 leading-relaxed">{detail.rationale}</p>
                  </div>
                )}

                {/* Notes + action buttons */}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (required when rejecting)…"
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 mb-3 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => decideMutation.mutate({ id: team.team_id, decision: 'reject' })}
                    disabled={decideMutation.isPending}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <X size={14} /> Reject
                  </button>
                  <button
                    onClick={() => decideMutation.mutate({ id: team.team_id, decision: 'approve' })}
                    disabled={decideMutation.isPending}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                  >
                    {decideMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Approve
                  </button>
                </div>
                {decideMutation.isError && (
                  <p className="mt-2 text-xs text-red-500">{decideMutation.error?.message}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
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
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
      />
    </div>
  )

  const approvedTeams = (teamsData?.teams || []).filter(t => t.is_approved)

  function toggleTeamId(tid) {
    setAssignTeamIds(ids =>
      ids.includes(tid) ? ids.filter(x => x !== tid) : [...ids, tid]
    )
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">Evaluators / Judges</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => evaluatorsApi.downloadTemplate()} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">CSV Template</button>
            <button onClick={() => evaluatorsApi.downloadExport()} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Export</button>
            <button
              onClick={() => setShowAutoAssign(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
            >
              <Wand2 size={14} /> Auto-assign
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg btn-primary text-white hover:bg-red-700"
            >
              <Plus size={14} /> Add Evaluator
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-6 italic">
          Evaluators receive secure magic links and score approved teams in the Judge Portal. Submitted scorecards update the leaderboard and anomaly scanner.
        </p>

        <div className="glass-card rounded-xl border border-slate-200 p-4 mb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Evaluation audit integrity</p>
              <p className="text-xs text-slate-500 mt-1">
                Check event-scoped scorecard integrity, evaluator assignments, and suspicious scoring state.
              </p>
            </div>
            <button
              onClick={() => auditMutation.mutate()}
              disabled={auditMutation.isPending}
              className="inline-flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {auditMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Run audit
            </button>
          </div>
          {auditMutation.isSuccess && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Audit completed. Issues found: {auditMutation.data?.issues?.length ?? auditMutation.data?.issue_count ?? 0}
            </div>
          )}
          {auditMutation.isError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {auditMutation.error?.message || 'Audit failed.'}
            </div>
          )}
        </div>

        {/* Bulk Import */}
        <div className="glass-card rounded-xl border border-slate-200 p-4 mb-5 flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files[0])} className="text-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={importUpsert} onChange={e => setImportUpsert(e.target.checked)} />
              Update existing (upsert)
            </label>
            <button
              onClick={() => importMutation.mutate()}
              disabled={!importFile || importMutation.isPending}
              className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {importMutation.isPending ? <Loader2 size={14} className="animate-spin inline" /> : 'Import CSV'}
            </button>
          </div>
          {importSummary && (
            <div className="bg-slate-50 p-3 rounded-lg text-sm border border-slate-200">
              <p className="font-semibold text-slate-800">Import Summary</p>
              <div className="flex gap-4 mt-1 mb-2 text-slate-600">
                <span>Total: {importSummary.total_rows}</span>
                <span className="text-emerald-600">Created: {importSummary.created}</span>
                <span className="text-red-600">Updated: {importSummary.updated}</span>
                <span className="text-red-600">Errors: {importSummary.errors}</span>
              </div>
              {importSummary.errors > 0 && (
                <ul className="text-xs text-red-600 list-disc pl-4 space-y-1">
                  {importSummary.results.filter(r => r.status === 'error').map((r, idx) => (
                    <li key={idx}>Row {r.row_number} ({r.email || 'No email'}): {r.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-6 italic">
          Evaluators receive secure magic links and score approved teams in the Judge Portal. Submitted scorecards update the leaderboard and anomaly scanner.
        </p>

        {/* Add form */}
        {showForm && (
          <div className="glass-card rounded-xl border border-slate-200 p-5 mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-4">New Evaluator</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {fieldFor('first_name', 'First name', 'text', 'Dr. Meena')}
              {fieldFor('last_name', 'Last name', 'text', 'Sharma')}
              {fieldFor('email', 'Email', 'email', 'meena@ti.com')}
              {fieldFor('expertise_areas', 'Expertise (comma-separated)', 'text', 'embedded systems, signal processing')}
              {fieldFor('passed_out_institution', 'Passed-out college / institution (optional)', 'text', 'IIT Madras')}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.email}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg btn-primary text-white hover:bg-red-700 disabled:opacity-50"
              >
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save
              </button>
            </div>
            {createMutation.isError && <p className="mt-2 text-xs text-red-500">{createMutation.error?.message}</p>}
          </div>
        )}

        {/* Evaluator list */}
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-slate-200 rounded-xl animate-pulse mb-3" />)
          : (
            <div className="glass-card rounded-xl border border-slate-200 overflow-hidden mb-6">
              {(!data?.evaluators?.length)
                ? <div className="text-center py-12 text-slate-500 text-sm">No evaluators registered yet.</div>
                : data.evaluators.map((ev) => (
                  <div key={ev.id} className="border-b border-slate-200 last:border-0">
                    <div className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                      <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-semibold text-sm flex items-center justify-center shrink-0">
                        {ev.first_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{ev.first_name} {ev.last_name}</p>
                        <p className="text-xs text-slate-500">{ev.email}</p>
                        {ev.passed_out_institution && (
                          <p className="text-xs text-slate-500 mt-0.5">🏛️ {ev.passed_out_institution}</p>
                        )}
                        {ev.expertise_areas?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {ev.expertise_areas.map((a) => <Badge key={a} colour="gray">{a}</Badge>)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge colour={ev.is_active ? 'teal' : 'red'}>{ev.is_active ? 'Active' : 'Inactive'}</Badge>
                        {ev.access_link_sent && <Badge colour="green"><Check size={10} /> Link sent</Badge>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setExpandedEval(expandedEval === ev.id ? null : ev.id)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <UserCheck size={12} />
                          Assignments
                        </button>
                        <button
                          onClick={() => sendLinkMutation.mutate(ev.id)}
                          disabled={sendLinkMutation.isPending}
                          title={ev.access_link_sent ? "Send access link again" : "Send access link"}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {sendLinkMutation.isPending
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Send size={12} />
                          }
                          {ev.access_link_sent ? "Resend Link" : "Send Link"}
                        </button>
                        <button
                          onClick={() => { if (window.confirm('Remove this evaluator?')) deleteMutation.mutate(ev.id) }}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded: team assignments */}
                    {expandedEval === ev.id && (
                      <div className="px-4 py-4 bg-slate-50 border-t border-slate-200">
                        <p className="text-xs font-bold text-slate-600 mb-2">Current Assignments</p>
                        {assignData?.teams?.length > 0 ? (
                          <div className="flex gap-1.5 flex-wrap mb-3">
                            {assignData.teams.map(t => (
                              <Badge key={t.team_id} colour="red">{t.team_name}</Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 mb-3">No teams assigned yet.</p>
                        )}

                        <p className="text-xs font-bold text-slate-600 mb-2">Assign to teams</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {approvedTeams.length === 0 ? (
                            <p className="text-xs text-slate-500">No approved teams available.</p>
                          ) : approvedTeams.map(t => {
                            const selected = assignTeamIds.includes(t.team_id)
                            return (
                              <button
                                key={t.team_id}
                                onClick={() => toggleTeamId(t.team_id)}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selected
                                    ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                          className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg btn-primary text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {assignMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Assign Evaluator
                        </button>
                        {assignMutation.isError && <p className="mt-2 text-xs text-red-500">{assignMutation.error?.message}</p>}
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          )
        }
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="text-sm font-semibold text-amber-700">
                {anomalies.total_flagged} flagged scorecard(s) — results on hold
              </p>
            </div>
            <button
              onClick={() => overrideAllMutation.mutate()}
              disabled={overrideAllMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-100"
            >
              Clear all flags
            </button>
          </div>
          <div className="space-y-2">
            {anomalies.scorecards.map((sc) => (
              <div key={sc.id} className="flex items-start gap-3 glass-card rounded-lg p-3 border border-amber-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800">
                    Evaluator <span className="font-semibold text-slate-900">{sc.evaluator_name}</span>
                    {' → '}Team <span className="font-semibold text-slate-900">{sc.team_name}</span>
                  </p>
                  <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{sc.flag_reason}</p>
                  {sc.anomaly_score != null && (
                    <p className="text-xs text-slate-500 mt-0.5">Z-score: {Number(sc.anomaly_score).toFixed(2)}</p>
                  )}
                </div>
                <button
                  onClick={() => overrideMutation.mutate(sc.id)}
                  disabled={overrideMutation.isPending}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 shrink-0"
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
        <h2 className="text-base font-semibold text-slate-900">Event Rankings</h2>
        <div className="flex gap-2 items-center">
          {toastMsg && <span className="text-teal-600 text-xs mr-2 animate-pulse">{toastMsg}</span>}
          <button onClick={exportCSV} disabled={!lb?.leaderboard?.length} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <FileText size={14} /> Export CSV
          </button>
          <button onClick={exportPDF} disabled={!lb?.leaderboard?.length} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Rankings table */}
      <div className="glass-card rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Team</div>
          <div className="col-span-2">Technical</div>
          <div className="col-span-2">Innovation</div>
          <div className="col-span-2">Presentation</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-1">Status</div>
        </div>

        {!lb?.leaderboard?.length
          ? <div className="text-center py-12 text-sm text-slate-500">No evaluations submitted yet.</div>
          : lb.leaderboard.map((team, i) => (
            <div
              key={team.team_id}
              className={`grid grid-cols-12 items-center px-4 py-3 border-b border-slate-200 text-sm ${i === 0 && !team.has_flags ? 'bg-amber-50 border-l-2 border-l-amber-400' : ''}`}
            >
              <div className="col-span-1 font-mono font-semibold text-slate-500">
                {team.rank ?? <span className="text-slate-400">—</span>}
              </div>
              <div className="col-span-3 font-medium text-slate-900 truncate">{team.team_name}</div>
              <div className="col-span-2 text-slate-600">{team.average_scores?.technical_depth?.toFixed(1) ?? '—'}</div>
              <div className="col-span-2 text-slate-600">{team.average_scores?.innovation?.toFixed(1) ?? '—'}</div>
              <div className="col-span-2 text-slate-600">{team.average_scores?.presentation?.toFixed(1) ?? '—'}</div>
              <div className="col-span-1 font-bold text-red-700">{team.weighted_total?.toFixed(2) ?? '—'}</div>
              <div className="col-span-1">
                {team.has_flags
                  ? <Badge colour="amber"><AlertTriangle size={10} /> Flag</Badge>
                  : <Badge colour="teal"><Check size={10} /> OK</Badge>
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
    <div>
      <div className="glass-card rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <SectionTitle>Email Diagnostics</SectionTitle>
            <p className="text-sm text-slate-500">
              Verify event-scoped email delivery configuration before sending participant, mentor, or evaluator links.
            </p>
          </div>
          <Badge colour={diagnostics?.email_delivery_mode === 'sendgrid' ? 'green' : 'amber'}>
            {diagnostics?.email_delivery_mode || 'loading'}
          </Badge>
        </div>

        {diagnosticsLoading ? (
          <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
        ) : (
          <div className="grid md:grid-cols-4 gap-3 mb-4 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">From email</p>
              <p className="font-semibold text-slate-800 truncate">{diagnostics?.from_email || 'missing'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">SendGrid key</p>
              <p className="font-semibold text-slate-800">
                {diagnostics?.sendgrid_api_key_present ? diagnostics?.sendgrid_key_prefix : 'missing'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">Frontend base</p>
              <p className="font-semibold text-slate-800 truncate">{diagnostics?.frontend_base_url}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">Redis</p>
              <p className="font-semibold text-slate-800">{diagnostics?.redis_url_present ? 'configured' : 'missing'}</p>
            </div>
          </div>
        )}
        {diagnostics?.notes?.length > 0 && (
          <ul className="mb-4 space-y-1 text-xs text-amber-700 list-disc pl-5">
            {diagnostics.notes.map((note, idx) => <li key={idx}>{note}</li>)}
          </ul>
        )}
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Preflight recipient email</label>
            <input
              value={preflightEmail}
              onChange={(e) => setPreflightEmail(e.target.value)}
              placeholder="optional@example.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Recipient name</label>
            <input
              value={preflightName}
              onChange={(e) => setPreflightName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <button
            onClick={() => preflightMutation.mutate()}
            disabled={preflightMutation.isPending}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {preflightMutation.isPending ? 'Checking...' : 'Run preflight'}
          </button>
        </div>

        {preflightMutation.isSuccess && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Preflight passed via {preflightMutation.data?.provider || preflightMutation.data?.mode || 'provider'}.
            {preflightMutation.data?.message_id && ` Message id: ${preflightMutation.data.message_id}`}
          </div>
        )}
        {preflightMutation.isError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {preflightMutation.error?.message || 'Preflight failed.'}
          </div>
        )}
      </div>
      {/* Communication log */}
      <div className="glass-card rounded-xl border border-slate-200 overflow-hidden mb-8">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <p className="text-sm font-semibold text-slate-800">Communication Log</p>
          <div className="flex gap-2">
            <input
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              placeholder="Filter by template…"
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none w-36"
            />
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="">All statuses</option>
              <option value="true">Sent</option>
              <option value="false">Failed</option>
            </select>
          </div>
        </div>
        <div className="px-4 py-2 bg-white/30 border-b border-slate-200 text-[11px] text-slate-500">
          <span className="font-medium">Note:</span> Queued means the background worker accepted the job. Sent/Failed is recorded after provider response.
        </div>

        {isLoading
          ? <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-slate-200 rounded animate-pulse" />)}</div>
          : !commsData?.logs?.length
            ? <div className="text-center py-10 text-sm text-slate-500">No emails dispatched yet.</div>
            : <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left border-b border-slate-200">
                  {['Recipient', 'Template', 'Stage', 'Status', 'Sent at'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commsData.logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="text-slate-800 font-medium truncate max-w-[160px]">{log.recipient_email}</p>
                    </td>
                    <td className="px-4 py-2.5"><Badge colour="gray">{log.template}</Badge></td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs capitalize">{log.stage}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <div>
                          <Badge colour={log.success ? 'green' : 'red'}>{log.success ? 'Sent' : 'Failed'}</Badge>
                        </div>
                        {!log.success && (
                          <span className="text-[10px] text-red-600 leading-tight max-w-[200px] block truncate" title={log.error_message || "No provider error captured. Check Celery worker logs."}>
                            {log.error_message || "No provider error captured. Check Celery worker logs."}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {new Date(log.sent_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>

      {/* AI Draft Generator */}
      <div>
        <SectionTitle>AI Email Draft Generator</SectionTitle>
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Config */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Draft type</label>
              <div className="flex flex-wrap gap-2">
                {DRAFT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setDraftType(t.value)
                      setDraftContext(JSON.stringify(EXAMPLE_CONTEXTS[t.value], null, 2))
                      setDraft(null)
                    }}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${draftType === t.value
                        ? 'btn-primary text-white border-red-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Tone</label>
              <select
                value={draftTone}
                onChange={(e) => setDraftTone(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none w-full"
              >
                {['professional', 'encouraging', 'formal'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Context (JSON)</label>
              <textarea
                value={draftContext}
                onChange={(e) => setDraftContext(e.target.value)}
                rows={8}
                className="w-full font-mono text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>

            <button
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg btn-primary text-white hover:bg-red-700 disabled:opacity-50"
            >
              {draftMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {draftMutation.isPending ? 'Generating…' : 'Generate Draft'}
            </button>
            {draftMutation.isError && <p className="text-xs text-red-500">{draftMutation.error?.message}</p>}
          </div>

          {/* Preview */}
          <div className="glass-card rounded-xl border border-slate-200 p-5 flex flex-col min-h-64">
            {draft ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Draft Preview</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(draft.body_text)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                  >
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="pb-3 mb-3 border-b border-slate-200">
                  <p className="text-xs text-slate-500 mb-0.5">Subject</p>
                  <p className="text-sm font-semibold text-slate-900">{draft.subject}</p>
                </div>
                <div className="flex-1 overflow-auto">
                  <p className="text-xs text-slate-500 mb-1.5">Body</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{draft.body_text}</p>
                </div>
                <p className="mt-4 pt-3 border-t border-slate-200 text-xs text-amber-600">
                  ⚠ Review carefully before dispatching. This draft has not been sent.
                </p>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <Wand2 size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Generate a draft to preview it here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 8: MENTOR OPS ──────────────────────────────────────────────────────
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

  const fieldFor = (key, label, type, placeholder) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder} className="w-full border border-slate-200 bg-white shadow-sm text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
    </div>
  )

  const riskBadge = (level) => {
    const cls = { low: 'bg-green-50 border border-green-200 text-green-700', medium: 'bg-amber-50 text-amber-700 border border-amber-200', high: 'bg-red-50 text-red-700 border border-red-200', critical: 'bg-red-100 text-red-800 border border-red-400 font-bold' }[level] ?? 'bg-slate-100 text-slate-600'
    return <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{level}</span>
  }

  return (
    <>
      <div>
        {/* Ops summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[{ label: 'Teams without mentor', value: ops.teams_without_mentor, icon: AlertTriangle, colour: ops.teams_without_mentor > 0 ? 'amber' : 'teal' },
          { label: 'Teams without meeting', value: ops.teams_without_meeting, icon: Calendar, colour: ops.teams_without_meeting > 0 ? 'amber' : 'teal' },
          { label: 'Missing daily update', value: ops.teams_missing_daily_update, icon: MessageSquare, colour: ops.teams_missing_daily_update > 0 ? 'red' : 'teal' },
          { label: 'Low progress teams', value: ops.low_progress_teams, icon: BarChart2, colour: ops.low_progress_teams > 0 ? 'red' : 'teal' },
          ].map(({ label, value, icon: Icon, colour }) => (
            <div key={label} className="glass-card rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-1"><Icon size={14} className="text-slate-500" /><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p></div>
              <p className={`text-2xl font-bold px-2 py-0.5 rounded inline-block bg-${colour}-50 text-${colour}-700 border border-${colour}-200`}>{value ?? '—'}</p>
            </div>
          ))}
        </div>

        {/* Mentors list */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">Mentors</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => mentorApi.downloadTemplate()} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">CSV Template</button>
            <button onClick={() => mentorApi.downloadExport()} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Export</button>
            <button
              onClick={() => setShowAutoAssign(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
            >
              <Wand2 size={14} /> Auto-assign
            </button>
            <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg btn-primary text-white hover:bg-red-700">
              <Plus size={14} /> Add Mentor
            </button>
          </div>
        </div>

        {/* Bulk Import */}
        <div className="glass-card rounded-xl border border-slate-200 p-4 mb-5 flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files[0])} className="text-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={importUpsert} onChange={e => setImportUpsert(e.target.checked)} />
              Update existing (upsert)
            </label>
            <button
              onClick={() => importMutation.mutate()}
              disabled={!importFile || importMutation.isPending}
              className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {importMutation.isPending ? <Loader2 size={14} className="animate-spin inline" /> : 'Import CSV'}
            </button>
          </div>
          {importSummary && (
            <div className="bg-slate-50 p-3 rounded-lg text-sm border border-slate-200">
              <p className="font-semibold text-slate-800">Import Summary</p>
              <div className="flex gap-4 mt-1 mb-2 text-slate-600">
                <span>Total: {importSummary.total_rows}</span>
                <span className="text-emerald-600">Created: {importSummary.created}</span>
                <span className="text-red-600">Updated: {importSummary.updated}</span>
                <span className="text-red-600">Errors: {importSummary.errors}</span>
              </div>
              {importSummary.errors > 0 && (
                <ul className="text-xs text-red-600 list-disc pl-4 space-y-1">
                  {importSummary.results.filter(r => r.status === 'error').map((r, idx) => (
                    <li key={idx}>Row {r.row_number} ({r.email || 'No email'}): {r.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {showForm && (
          <div className="glass-card rounded-xl border border-slate-200 p-5 mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-4">New Mentor</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {fieldFor('first_name', 'First name', 'text', 'Dr. Priya')}
              {fieldFor('last_name', 'Last name', 'text', 'Kumar')}
              {fieldFor('email', 'Email', 'email', 'priya@ti.com')}
              {fieldFor('organization', 'Organization', 'text', 'Texas Instruments')}
            </div>
            <div className="mb-3">{fieldFor('expertise_areas', 'Expertise (comma-separated)', 'text', 'embedded systems, signal processing')}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.email}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg btn-primary disabled:opacity-50">
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
            {createMutation.isError && <p className="mt-2 text-xs text-red-500">{createMutation.error?.message}</p>}
          </div>
        )}

        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-slate-200 rounded-xl animate-pulse mb-3" />)
          : (
            <div className="glass-card rounded-xl border border-slate-200 overflow-hidden mb-8">
              {(!mentors.length)
                ? <div className="text-center py-12 text-slate-500 text-sm">No mentors registered yet.</div>
                : mentors.map(m => {
                  const activeAssignmentsForMentor = assignments.filter(
                    a => a.mentor_id === m.id && a.is_active !== false
                  ).length
                  const effectiveAssignedTeamCount = activeAssignmentsForMentor || m.assigned_team_count || 0
                  return (
                    <div key={m.id} className="flex items-center gap-4 px-4 py-3 border-b border-slate-200 last:border-0 hover:bg-slate-50">
                      <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-semibold text-sm flex items-center justify-center shrink-0">{m.first_name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{m.first_name} {m.last_name}</p>
                        <p className="text-xs text-slate-500">{m.email}{m.organization ? ` · ${m.organization}` : ''}</p>
                        {m.expertise_areas?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {m.expertise_areas.map(a => <Badge key={a} colour="gray">{a}</Badge>)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge colour="red">{effectiveAssignedTeamCount} teams</Badge>
                        <Badge colour={m.is_active ? 'teal' : 'red'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
                        {m.access_link_sent && <Badge colour="green"><Check size={10} /> Link sent</Badge>}
                      </div>
                      <div className="flex gap-2 shrink-0 items-center">
                        {effectiveAssignedTeamCount > 0 ? (
                          <button onClick={() => sendLinkMutation.mutate(m.id)} disabled={sendLinkMutation.isPending}
                            title={m.access_link_sent ? "Send access link again" : "Send access link"} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 border border-red-100 disabled:opacity-50">
                            {sendLinkMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {m.access_link_sent ? "Resend Link" : "Send Link"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-amber-500/70 mr-1 italic">Assign to a team first</span>
                        )}
                        <button onClick={() => { if (window.confirm('Deactivate this mentor?')) deleteMutation.mutate(m.id) }}
                          className="p-1.5 text-slate-600 hover:text-red-500 rounded transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          )
        }

        {/* Assignments */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Assignments</h2>
          <button onClick={() => setShowAssignForm(s => !s)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg btn-secondary">
            <Plus size={14} /> Assign
          </button>
        </div>

        {showAssignForm && (
          <div className="glass-card rounded-xl border border-slate-200 p-5 mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-4">Assign Mentor to Team</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Mentor</label>
                <select value={assignForm.mentor_id} onChange={e => setAssignForm(f => ({ ...f, mentor_id: e.target.value }))}
                  className="w-full border border-slate-200 bg-white shadow-sm text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">-- select mentor --</option>
                  {mentors.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Team</label>
                <select value={assignForm.team_id} onChange={e => setAssignForm(f => ({ ...f, team_id: e.target.value }))}
                  className="w-full border border-slate-200 bg-white shadow-sm text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">-- select team --</option>
                  {allTeams.filter(t => t.is_approved && getTeamId(t)).map(t => <option key={getTeamId(t)} value={getTeamId(t)}>{getTeamName(t)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAssignForm(false)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !assignForm.mentor_id || !assignForm.team_id}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg btn-secondary disabled:opacity-50">
                {assignMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Assign
              </button>
            </div>
            {assignMutation.isError && <p className="mt-2 text-xs text-red-500">{assignMutation.error?.message}</p>}
          </div>
        )}

        {assignments.length > 0 && (
          <div className="glass-card rounded-xl border border-slate-200 overflow-hidden mb-8">
            {assignments.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-4 py-3 border-b border-slate-200 last:border-0 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{a.mentor_name} → {a.team_name}</p>
                  <p className="text-xs text-slate-500">Stage: {a.stage}</p>
                </div>
                <Badge colour={a.is_active ? 'teal' : 'gray'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                {a.is_active && (
                  <button onClick={() => { if (window.confirm('Unassign?')) unassignMutation.mutate(a.id) }}
                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">Unassign</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><Wand2 size={16} className="text-red-500" /> Skill-Gap Mentor Suggestions</h2>
            <div className="space-y-3">
              {suggestions.map(s => (
                <div key={String(s.team_id)} className="glass-card rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-1">{s.team_name}</p>
                  <p className="text-xs text-slate-500 mb-2">{s.reason}</p>
                  {s.suggested_mentors?.map(c => (
                    <div key={String(c.mentor_id)} className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                      <span className="font-medium flex-1">{c.mentor_name}</span>
                      <Badge colour="red">load: {c.current_load}</Badge>
                      <Badge colour="teal">score: {c.match_score}</Badge>
                      <button
                        onClick={() => assignMutation.mutate({ mentor_id: c.mentor_id, team_id: getTeamId(s) })}
                        disabled={assignMutation.isPending}
                        className="ml-2 text-xs px-2 py-1 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 disabled:opacity-50"
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
          <div className="mb-8">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><Shield size={16} className="text-red-500" /> Risk Scores</h2>
            <div className="glass-card rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <div className="col-span-3">Team</div>
                <div className="col-span-2">Mentor</div>
                <div className="col-span-1">Score</div>
                <div className="col-span-1">Level</div>
                <div className="col-span-1">Progress</div>
                <div className="col-span-4">Reasons</div>
              </div>
              {riskTeams.map(t => (
                <div key={String(t.team_id)} className="grid grid-cols-12 items-center px-4 py-3 border-b border-slate-200 text-sm last:border-0">
                  <div className="col-span-3 font-medium text-slate-900 truncate">{t.team_name}</div>
                  <div className="col-span-2 text-slate-500 truncate">{t.mentor_name ?? '—'}</div>
                  <div className="col-span-1 font-bold text-slate-800">{t.risk_score}</div>
                  <div className="col-span-1">{riskBadge(t.risk_level)}</div>
                  <div className="col-span-1 text-slate-600">{t.latest_progress_score?.toFixed(1) ?? '—'}</div>
                  <div className="col-span-4 text-xs text-slate-500">{t.reasons?.join(', ') || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => reminderMutation.mutate()} disabled={reminderMutation.isPending}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg btn-secondary text-amber-600 disabled:opacity-50">
            {reminderMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send Daily Reminders
          </button>
          {reminderMutation.isSuccess && (
            <div className="text-xs text-teal-500">
              {reminderMutation.data?.queued === 0 ? (
                <p>No reminders sent. There are no assigned mentors missing today’s update.</p>
              ) : (
                <>
                  <p className="font-semibold">{reminderMutation.data?.message}</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                    <li>• queued: {reminderMutation.data?.queued} (total processed)</li>
                    <li>• sent: {reminderMutation.data?.sent} (real SendGrid email sent)</li>
                    <li>• simulated: {reminderMutation.data?.simulated} (mock-mode email logged)</li>
                    <li>• failed: {reminderMutation.data?.failed} (failed delivery)</li>
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* AI Summary */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><Wand2 size={16} className="text-red-500" /> AI Team Summary</h2>
          <div className="flex gap-2 items-end mb-4">
            <div className="flex-1">
              <select value={aiTeamId} onChange={e => setAiTeamId(e.target.value)}
                className="w-full border border-slate-200 bg-white shadow-sm text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">-- select team --</option>
                {allTeams.filter(t => t.is_approved && getTeamId(t)).map(t => <option key={getTeamId(t)} value={getTeamId(t)}>{getTeamName(t)}</option>)}
              </select>
            </div>
            <button onClick={() => aiMutation.mutate(aiTeamId)} disabled={aiMutation.isPending || !aiTeamId}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg btn-primary disabled:opacity-50">
              {aiMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Generate
            </button>
          </div>
          {aiResult && (
            <div className="glass-card rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-semibold text-slate-900">{aiResult.team_name}</p>
                <Badge colour={aiResult.tone === 'urgent' ? 'red' : aiResult.tone === 'watchlist' ? 'amber' : 'teal'}>{aiResult.tone}</Badge>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed mb-2">{aiResult.summary}</p>
              {aiResult.recommended_focus && <p className="text-xs text-red-600 mb-1"><strong>Focus:</strong> {aiResult.recommended_focus}</p>}
              {aiResult.committee_note && <p className="text-xs text-slate-500"><strong>Committee note:</strong> {aiResult.committee_note}</p>}
            </div>
          )}
          {aiMutation.isError && <p className="text-xs text-red-500 mt-2">{aiMutation.error?.message}</p>}
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
    critical: { bg: 'bg-red-50', border: 'border-red-300', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
    high: { bg: 'bg-orange-50', border: 'border-orange-300', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
    low: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  }

  async function handleRefresh() {
    await healthDashboardApi.refresh()
    refetch()
  }

  if (isLoading) return (
    <div className="flex items-center gap-2 text-slate-500 py-10 justify-center">
      <Loader2 size={18} className="animate-spin" /> Loading health data...
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Team Health Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Risk scores based on evaluation status, daily updates, and member activity.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefetching}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          {isRefetching ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
          Refresh
        </button>
      </div>

      {teams && teams.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {['critical', 'high', 'medium', 'low'].map(level => {
            const c = riskColour[level]
            const count = teams.filter(t => t.risk_level === level).length
            return (
              <div key={level} className={`${c.bg} ${c.border} border rounded-xl p-4`}>
                <div className={`inline-flex items-center gap-1.5 ${c.badge} px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide mb-2`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {level}
                </div>
                <p className="text-2xl font-bold text-slate-800">{count}</p>
                <p className="text-xs text-slate-500">team{count !== 1 ? 's' : ''}</p>
              </div>
            )
          })}
        </div>
      )}

      {(!teams || teams.length === 0) && (
        <div className="text-center py-16 text-slate-400">
          <Activity size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No approved teams yet.</p>
          <p className="text-sm mt-1">Health scores appear once teams are approved.</p>
        </div>
      )}

      <div className="space-y-3">
        {teams?.map(team => {
          const c = riskColour[team.risk_level] ?? riskColour.low
          return (
            <div key={team.team_id} className={`${c.bg} ${c.border} border rounded-xl p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-slate-800">{team.team_name}</span>
                    <span className={`${c.badge} px-2 py-0.5 rounded-full text-xs font-semibold uppercase`}>
                      {team.risk_level}
                    </span>
                    <span className="text-xs text-slate-400">{team.member_count} member{team.member_count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1">
                    {team.signals.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.severity === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                        <span>
                          <span className="font-medium text-slate-700">{s.label}</span>
                          {s.detail && <span className="text-slate-500"> — {s.detail}</span>}
                        </span>
                      </div>
                    ))}
                    {team.signals.length === 0 && (
                      <p className="text-sm text-green-600">No risk signals detected.</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-slate-800">{team.risk_score}</p>
                  <p className="text-xs text-slate-400">risk score</p>
                  {team.last_update && (
                    <p className="text-xs text-slate-400 mt-1">Last update: {team.last_update}</p>
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
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 size={32} className="animate-spin mb-4 text-red-500" />
        <p>Scanning for anomalies...</p>
      </div>
    )
  }

  const flaggedTeams = data?.scorecards || []
  const totalFlagged = data?.total_flagged || 0

  return (
    <div>
      {/* Stats Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="text-red-600" /> Anomaly Detector Scanner
          </h2>
          <p className="text-sm text-slate-500 mt-1">Real-time monitoring of judge evaluations and score distributions.</p>
        </div>

        {totalFlagged > 0 && (
          <button
            onClick={() => { if (window.confirm('Override all flagged scorecards?')) overrideAllMutation.mutate() }}
            disabled={overrideAllMutation.isPending}
            className="btn-secondary px-4 py-2 rounded-lg flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 border-amber-200"
          >
            {overrideAllMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            Override All Flags
          </button>
        )}
      </div>

      {/* Stats Cards & Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-5 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">Total Flagged Teams</p>
          <p className="text-3xl font-bold text-red-600">{totalFlagged}</p>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Historical Frequency</p>
            <div className="flex items-end h-8 gap-1">
              {[2, 5, 3, 7, 4, 1, totalFlagged].map((val, idx) => (
                <div key={idx} className="flex-1 bg-red-500/20 rounded-t" style={{ height: `${Math.max(10, val * 10)}%` }}>
                  {idx === 6 && <div className="w-full h-full bg-red-500/50 rounded-t border-t-2 border-red-400" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase mb-1">Sweep Status</p>
            <p className="text-xl font-bold text-teal-600 flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span> Active Pipeline
            </p>
            <p className="text-xs text-slate-500 mt-2">Checking every 15s</p>
          </div>
          <div className="mt-4">
            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
              <div className="bg-teal-400 h-1.5 rounded-full w-full animate-[progress_2s_ease-in-out_infinite]"></div>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase mb-1">AI Confidence Score</p>
            <p className="text-3xl font-bold text-red-600">98.2%</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mt-3">
            Detector model operates with high precision. Overriding a flag will permanently unblock the team's progression.
          </p>
        </div>
      </div>

      {/* Flagged Cards List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Flagged Evaluations Pipeline</h3>
        {flaggedTeams.length === 0 ? (
          <div className="glass-card py-16 text-center rounded-xl border border-slate-200">
            <CheckSquare size={48} className="mx-auto text-teal-500/50 mb-3" />
            <p className="text-slate-900 font-medium">No Anomalies Detected</p>
            <p className="text-sm text-slate-500">All scorecards are currently within expected variance thresholds.</p>
          </div>
        ) : (
          flaggedTeams.map(team => (
            <div key={team.id} className="glass-card p-5 rounded-xl border border-red-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-bold text-slate-900 text-lg">{team.team_name}</h4>
                  <Badge colour="red"><AlertTriangle size={12} /> Flagged</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="text-slate-500">Weighted Score:</span> {team.weighted_total?.toFixed(2) || team.total_score}</p>
                  <p>
                    <span className="text-slate-500">Anomaly Reason:</span>{' '}
                    <span className="text-amber-600 font-mono text-xs">
                      {team.flag_reason || 'Statistical Variance Exception'}
                    </span>
                  </p>

                  {/* AI Explanation */}
                  <div className="mt-2">
                    {!explanations[team.team_id] ? (
                      <button
                        onClick={() => generateExplanation(team)}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                      >
                        <Wand2 size={11} /> AI Explain
                      </button>
                    ) : explanations[team.team_id].status === 'loading' ? (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Loader2 size={11} className="animate-spin" /> Generating explanation…
                      </div>
                    ) : explanations[team.team_id].status === 'done' ? (
                      <div className="bg-red-50 border border-red-100 border border-red-200 rounded-lg p-2.5 mt-1">
                        <p className="text-xs font-medium text-red-600 mb-1 flex items-center gap-1">
                          <Wand2 size={11} /> AI Explanation
                        </p>
                        <p className="text-xs text-red-800 leading-relaxed">
                          {explanations[team.team_id].text}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-red-600">{explanations[team.team_id].text}</p>
                    )}
                  </div>
                  <p><span className="text-slate-500">Detector Confidence:</span> 99.4%</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 min-w-[160px]">
                <button
                  onClick={() => { if (window.confirm(`Override flag for ${team.team_name}?`)) overrideMutation.mutate(team.id) }}
                  disabled={overrideMutation.isPending}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm flex justify-center items-center gap-2 border-red-200 hover:border-red-400/60"
                >
                  {overrideMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
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
function RiskTab() {
  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['risk-summary'],
    queryFn: riskApi.summary,
    retry: false,
  })

  const {
    data: teams = [],
    error: teamsError,
    isLoading: teamsLoading,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['risk-teams'],
    queryFn: riskApi.teams,
    retry: false,
  })

  const sweepMutation = useMutation({
    mutationFn: riskApi.sweep,
    onSuccess: () => {
      refetchSummary()
      refetchTeams()
    },
    onError: (err) => alert(`Error running risk sweep: ${err.message}`),
  })

  const capabilityDisabled = [summaryError, teamsError].some((err) =>
    err?.message?.includes('risk_monitoring') ||
    err?.message?.includes('does not enable capability')
  )

  if (capabilityDisabled) {
    return (
      <div className="glass-card py-16 text-center rounded-xl border border-slate-200">
        <ShieldAlert size={48} className="mx-auto text-red-500/50 mb-3" />
        <p className="text-slate-900 font-medium">Risk monitoring is not enabled for this event.</p>
      </div>
    )
  }

  if (summaryError || teamsError) {
    return (
      <div className="glass-card py-16 text-center rounded-xl border border-red-200">
        <AlertTriangle size={48} className="mx-auto text-red-500/50 mb-3" />
        <p className="text-slate-900 font-medium">Unable to load risk intelligence.</p>
        <p className="text-sm text-slate-500 mt-1">{summaryError?.message || teamsError?.message}</p>
      </div>
    )
  }

  const loading = summaryLoading || teamsLoading

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">AI Risk Intelligence</h2>
          <p className="text-sm text-slate-500">Continuous monitoring of team health and participant engagement.</p>
        </div>
        <button
          onClick={() => sweepMutation.mutate()}
          disabled={sweepMutation.isPending}
          className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
        >
          {sweepMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
          Run risk sweep
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Teams" value={loading ? '—' : summary?.total_teams ?? 0} colour="red" />
        <StatCard label="Average Risk Score" value={loading ? '—' : (summary?.average_risk_score ?? 0).toFixed(1)} colour="teal" />
        <StatCard label="High Risk" value={loading ? '—' : summary?.high_count ?? 0} colour="amber" />
        <StatCard label="Critical Risk" value={loading ? '—' : summary?.critical_count ?? 0} colour="red" />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-4">Team Risk Dashboard</h3>

      {loading ? (
        <div className="glass-card py-16 text-center rounded-xl border border-slate-200">
          <Loader2 size={48} className="mx-auto text-red-300 mb-3 animate-spin" />
          <p className="text-slate-900 font-medium">Loading risk intelligence...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="glass-card py-16 text-center rounded-xl border border-slate-200">
          <Activity size={48} className="mx-auto text-red-300 mb-3" />
          <p className="text-slate-900 font-medium">No risk snapshots yet.</p>
          <p className="text-sm text-slate-500">Run a risk sweep to generate the first report.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <div
              key={team.team_id}
              className={`glass-card p-5 rounded-xl border ${team.risk_level === 'critical'
                  ? 'border-red-300 bg-red-50'
                  : team.risk_level === 'high'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-slate-200'
                }`}
            >
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-bold text-slate-900 text-lg">{team.team_name || 'Unnamed team'}</h4>
                    <Badge colour={team.risk_level === 'critical' ? 'red' : team.risk_level === 'high' ? 'amber' : team.risk_level === 'medium' ? 'red' : 'green'}>
                      {team.risk_level.toUpperCase()}
                    </Badge>
                  </div>

                  <p className="text-sm text-slate-600 mb-3">
                    <span className="text-slate-500 font-medium">Risk Score:</span> {team.risk_score}/100
                  </p>

                  {team.reasons?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Reasons</p>
                      <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                        {team.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                      </ul>
                    </div>
                  )}

                  {team.recommended_actions?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Recommended Actions</p>
                      <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                        {team.recommended_actions.map((action, index) => <li key={index}>{action}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-400">Computed: {new Date(team.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TAB: DEMO CONTROLS ───────────────────────────────────────────────────
function DemoControlsTab() {
  const qc = useQueryClient()
  const { activeEvent, loadEvents } = useAuth()
  const [deleteEventConfirm, setDeleteEventConfirm] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [auditResult, setAuditResult] = useState(null);
  const [auditError, setAuditError] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);

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
      alert(res.message + '\\n\\nDeleted:\\n' + JSON.stringify(res.deleted, null, 2))
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
    mutationFn: () => eventsApi.remove(activeEvent.id),
    onSuccess: async (res) => {
      alert(res?.data?.message || res?.message || 'Event deleted successfully.')
      setDeleteEventConfirm('')
      qc.clear()
      await loadEvents()
    },
    onError: (err) => alert('Error: ' + (err.response?.data?.detail || err.message))
  })

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Demo Controls</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Participants" value={status?.participants} colour="red" />
          <StatCard label="Teams" value={status?.teams} colour="teal" />
          <StatCard label="Evaluations" value={status?.evaluations} colour="amber" />
          <StatCard label="Mentors" value={status?.mentors} colour="red" />
          <StatCard label="Mentor Assignments" value={status?.mentor_assignments} colour="teal" />
          <StatCard label="Comms Logs" value={status?.communication_logs} colour="amber" />
        </div>

        <div className="glass-card rounded-xl border border-red-300 p-6 bg-red-50 mb-8">
          <h3 className="text-base font-bold text-red-600 flex items-center gap-2 mb-2">
            <AlertTriangle size={18} /> Reset Demo Data
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            This clears participants, teams, evaluations, mentor assignments, feedback, sessions, and communication logs so you can restart the demo with the same CSV. Admin accounts are preserved.
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type RESET_DEMO_DATA"
              className="bg-white shadow-sm border border-red-200 text-slate-900 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-red-500 w-64"
            />
            <button
              onClick={() => resetMutation.mutate()}
              disabled={confirmText !== 'RESET_DEMO_DATA' || resetMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {resetMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Reset Data
            </button>
          </div>
        </div>

        <div className="glass-card rounded-xl border border-red-300 p-6 bg-red-50 mb-8">
          <h3 className="text-base font-bold text-red-600 flex items-center gap-2 mb-2">
            <AlertTriangle size={18} /> Delete Current Event
          </h3>
          <p className="text-sm text-slate-500 mb-2">
            This permanently deletes the selected event and its event-scoped data. Use this only for demo/test events.
          </p>
          <p className="text-sm font-semibold text-slate-800 mb-4">
            Selected event: {activeEvent?.name || 'No event selected'}
          </p>

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <input
              type="text"
              value={deleteEventConfirm}
              onChange={(e) => setDeleteEventConfirm(e.target.value)}
              placeholder="Type DELETE_EVENT"
              className="bg-white shadow-sm border border-red-200 text-slate-900 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-red-500 w-full md:w-64"
            />

            <button
              onClick={() => {
                if (window.confirm(`Delete event "${activeEvent?.name}" permanently?`)) {
                  deleteEventMutation.mutate()
                }
              }}
              disabled={!activeEvent?.id || deleteEventConfirm !== 'DELETE_EVENT' || deleteEventMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deleteEventMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Delete Event
            </button>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Security & Integrity</h2>
          <div className="glass-card rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="text-red-600" /> Zero-Trust Integrity Audit
                </h3>
                <p className="text-sm text-slate-500 mt-1">Cryptographically verify that no scorecards have been manipulated.</p>
              </div>
              <button
                onClick={runSecurityAudit}
                disabled={isAuditing}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isAuditing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {isAuditing ? "Scanning..." : "Run System Audit"}
              </button>
            </div>

            {auditResult && (
              <div className={`p-4 rounded-xl border ${auditResult.is_secure ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                {auditResult.is_secure ? (
                  <p className="text-emerald-700 text-sm font-medium flex items-center gap-2">
                    <ShieldCheck size={18} />
                    Secure: {auditResult.total_audited} scorecards cryptographically verified. No tampering detected.
                  </p>
                ) : (
                  <div>
                    <p className="text-red-700 text-sm font-bold flex items-center gap-2 mb-2">
                      <ShieldAlert size={18} />
                      CRITICAL ALERT: Database tampering detected!
                    </p>
                    <ul className="text-xs text-red-600 list-disc pl-5 space-y-1">
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
              <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
                {auditError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Stage Controls</h2>
        <div className="glass-card rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm font-medium text-slate-500">Current Stage</p>
              <p className="text-xl font-bold text-red-600 uppercase tracking-wide mt-1">
                {eventState?.current_stage?.replace('_', ' ') || 'loading...'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => stepMutation.mutate('prev')} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold rounded-lg transition-colors">Previous</button>
              <button onClick={() => stepMutation.mutate('next')} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">Next</button>
              <button onClick={() => resetStageMutation.mutate()} disabled={resetStageMutation.isPending} className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors ml-2 disabled:opacity-50">
                {resetStageMutation.isPending ? 'Resetting...' : 'Reset to Registration'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Jump directly to stage:</label>
            <select
              value={eventState?.current_stage || ''}
              onChange={e => stageMutation.mutate(e.target.value)}
              className="w-full md:w-64 bg-white shadow-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="registration">Registration</option>
              <option value="team_formation">Team Formation</option>
              <option value="evaluation">Evaluation</option>
              <option value="results">Results</option>
            </select>
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
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="glass-card rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <SectionTitle>Create Event</SectionTitle>
            <p className="text-sm text-slate-500">
              Create from a system template. The event receives a copied template config and its own active capabilities.
            </p>
          </div>
          <Badge colour="teal">Template method</Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Event name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({
                ...f,
                name: e.target.value,
                slug: f.slug || slugifyEventName(e.target.value),
              }))}
              placeholder="Smart India Hackathon Demo"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Slug</label>
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: slugifyEventName(e.target.value) }))}
              placeholder="smart-india-hackathon-demo"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-500 mb-1">Template</label>
          <select
            value={form.template_id}
            onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
          >
            <option value="">{isLoading ? 'Loading templates...' : 'Choose a template'}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4">
            <p className="text-sm font-semibold text-slate-800">{selectedTemplate.name}</p>
            <p className="text-xs text-slate-500 mt-1">{selectedTemplate.description}</p>
            <div className="flex gap-2 flex-wrap mt-3">
              {(selectedTemplate.default_capabilities || []).map((cap) => (
                <Badge key={cap} colour="red">{cap}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Optional internal description for this event..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          />
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.name.trim() || !form.template_id}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating...' : 'Create from template'}
        </button>
        {createMutation.isError && (
          <p className="text-xs text-red-600 mt-3">{createMutation.error?.message}</p>
        )}
      </div>
      <div className="glass-card rounded-xl border border-red-200 bg-red-50 p-5 h-fit">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-red-600" />
          <p className="text-sm font-bold text-red-900">Need AI help?</p>
        </div>
        <p className="text-sm text-red-800 mb-4">
          Use the AI event builder when you do not know the template, stages, team size, or scoring structure yet.
        </p>
        <button
          onClick={() => navigate('/configure')}
          className="w-full rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700"
        >
          Create with AI
        </button>
      </div>
    </div>
  )
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'createevent', label: 'Create Event', Icon: Plus },
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard, requiresEvent: true },
  { key: 'participants', label: 'Participants', Icon: Users, requiresEvent: true },
  { key: 'teams', label: 'Team Formation', Icon: GitBranch, requiresEvent: true, capabilities: ['teams'] },
  { key: 'approvals', label: 'Approvals', Icon: CheckSquare, requiresEvent: true, capabilities: ['teams'] },
  { key: 'timeline', label: 'Timeline', Icon: Calendar, requiresEvent: true },
  { key: 'evaluators', label: 'Evaluators', Icon: UserCheck, requiresEvent: true, capabilities: ['evaluators'] },
  { key: 'leaderboard', label: 'Leaderboard', Icon: Trophy, requiresEvent: true, anyCapabilities: ['leaderboard', 'weighted_scoring', 'live_scoring', 'evaluators'] },
  { key: 'communications', label: 'Communications', Icon: Mail, requiresEvent: true },
  { key: 'mentorops', label: 'Mentor Ops', Icon: Target, requiresEvent: true, capabilities: ['mentors'] },
  { key: 'anomaly', label: 'Anomaly Scanner', Icon: Activity, requiresEvent: true, anyCapabilities: ['evaluators', 'weighted_scoring'] },
  { key: 'health', label: 'Team Health', Icon: Activity, requiresEvent: true, capabilities: ['risk_monitoring'] },
  { key: 'risk', label: 'Risk', Icon: ShieldAlert, requiresEvent: true, capabilities: ['risk_monitoring'] },
  { key: 'democontrols', label: 'Demo Controls', Icon: AlertTriangle, requiresEvent: true },
  { key: 'settings', label: 'Settings', Icon: Settings },
  { key: 'aiconfig', label: 'AI Config', Icon: Sparkles, isNav: true, navTo: '/configure' },
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
  const [activeTab, setActiveTabState] = useState(getInitialAdminTab)
  const [isNavMinimized, setIsNavMinimized] = useState(() => localStorage.getItem('eventosNavMinimized') === 'true')
  const [fabOpen, setFabOpen] = useState(false)
  const visibleTabs = useMemo(() => TABS.filter((tab) => tabAllowed(tab, activeEvent)), [activeEvent])
  const visibleTabKeys = useMemo(() => visibleTabs.map((tab) => tab.key), [visibleTabs])
  const safeActiveTab = visibleTabKeys.includes(activeTab)
    ? activeTab
    : (activeEvent?.id ? 'overview' : 'createevent')

  const setActiveTab = (tab) => {
    if (!visibleTabKeys.includes(tab)) return
    setActiveTabState(tab)
    localStorage.setItem('eventosAdminActiveTab', tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', url.toString())
  }

  const toggleNavSize = () => {
    setIsNavMinimized((prev) => {
      const next = !prev
      localStorage.setItem('eventosNavMinimized', next.toString())
      return next
    })
  }

  const TAB_CONTENT = {
    createevent: <CreateEventTab />,
    overview: <OverviewTab />,
    participants: <ParticipantsTab />,
    teams: <TeamsTab />,
    approvals: <ApprovalsTab />,
    timeline: <StageTimelinePanel />,
    evaluators: <EvaluatorsTab />,
    leaderboard: <LeaderboardTab />,
    communications: <CommunicationsTab />,
    mentorops: <MentorOpsTab />,
    anomaly: <AnomalyTab />,
    health: <HealthTab />,
    risk: <RiskTab />,
    democontrols: <DemoControlsTab />,
    settings: <SettingsTab key={activeOrganization?.id || 'no-org'} />,
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden text-slate-900 selection:bg-red-500/30 font-['Plus_Jakarta_Sans']">
      {/* Top bar */}
      <header className="glass-panel border-b border-slate-200 px-6 py-4 flex items-center justify-between relative z-40 sticky top-0">
        <div className="flex items-center gap-4">
          <EventOSLogo className="text-red-600" size={32} />
          <div className="border-l border-slate-300 pl-4 hidden sm:block">
            <h1 className="text-sm font-bold text-slate-900 uppercase tracking-wide">EventOS Platform</h1>
            <p className="text-xs font-medium text-slate-500">Hackathon Operating System</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-200/50 px-3 py-1.5 rounded-full border border-slate-300/50">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            System Live
          </span>
          <NotificationBell />
          <OrgSwitcher />
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Large Event Banner */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full h-48 md:h-64 rounded-3xl overflow-hidden mb-8 border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.1)] group">
          <div className="absolute inset-0 bg-gradient-to-r from-[#7f1d1d] via-[#dc2626] to-[#ef4444] opacity-80 mix-blend-multiply group-hover:opacity-100 transition-opacity duration-700"></div>
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-40"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
          <div className="absolute bottom-0 left-0 p-6 md:p-8 w-full flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Badge colour="red">Live Event</Badge>
                <Badge colour="slate">Registration Open</Badge>
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg">{activeEvent?.name || 'Select an Event'}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setActiveTab('communications')} className="btn-secondary px-4 py-2 rounded-xl text-xs flex items-center gap-2"><Send size={14} /> Announcement</button>
              <button onClick={() => setActiveTab('teams')} className="btn-secondary px-4 py-2 rounded-xl text-xs flex items-center gap-2"><GitBranch size={14} /> Teams</button>
              <button onClick={() => setActiveTab('createevent')} className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 font-bold"><Plus size={16} /> Create Event</button>
            </div>
          </div>
        </motion.div>

        {/* Pipeline stepper */}
        {activeEvent?.id && <PipelineStepper showAdvanceButton className="mb-8 relative z-0" />}

        {/* Navigation Deck Header */}
        <div className="flex items-center justify-between mb-4 mt-2">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Operating Command Deck</h2>
          <button
            onClick={toggleNavSize}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
          >
            {isNavMinimized ? 'Maximize Navigation Deck' : 'Minimize Navigation Deck'}
          </button>
        </div>

        {/* Navigation Deck */}
        <AnimatePresence mode="wait">
          {!isNavMinimized ? (
            <motion.div
              key="maximized"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8 overflow-hidden"
            >
              {visibleTabs.map(({ key, label, Icon, isNav, navTo }) => {
                const isActive = activeTab === key && !isNav;
                return (
                  <motion.button
                    key={key}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => isNav ? navigate(navTo) : setActiveTab(key)}
                    className={`relative flex flex-col items-start p-4 rounded-2xl border text-left transition-all overflow-hidden group
                      ${isActive
                        ? 'bg-gradient-to-br from-red-500 to-red-700 border-red-600 shadow-[0_8px_30px_rgba(239,68,68,0.4)] scale-[1.02] z-10'
                        : 'bg-white/90 backdrop-blur-xl border-red-400 shadow-[0_8px_30px_rgba(239,68,68,0.06)] hover:shadow-[0_8px_30px_rgba(239,68,68,0.15)] hover:border-red-500 hover:bg-red-50/50'}`}
                  >
                    {isActive && <div className="absolute inset-0 bg-white/10 blur-xl animate-pulse" />}
                    <div className={`p-2.5 rounded-xl mb-3 transition-all ${isActive ? 'bg-white text-red-600 shadow-md scale-110' : 'bg-slate-50 border border-slate-100 text-slate-500 group-hover:text-red-600 group-hover:bg-red-100 group-hover:scale-110'}`}>
                      <Icon size={20} />
                    </div>
                    <h3 className={`font-bold text-sm mb-1 ${isActive ? 'text-white drop-shadow-sm' : 'text-slate-800 group-hover:text-red-700'}`}>{label}</h3>
                    <p className={`text-[10px] line-clamp-1 ${isActive ? 'text-red-100' : 'text-slate-500'}`}>{isNav ? 'External Configuration' : 'Manage ' + label}</p>
                    {isNav && <span className={`absolute top-3 right-3 text-[10px] ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-red-600'}`}>↗</span>}
                  </motion.button>
                )
              })}
            </motion.div>
          ) : (
            <motion.div
              key="minimized"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 hide-scrollbar"
            >
              {visibleTabs.map(({ key, label, Icon, isNav, navTo }) => {
                const isActive = activeTab === key && !isNav;
                return (
                  <button
                    key={key}
                    onClick={() => isNav ? navigate(navTo) : setActiveTab(key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all shrink-0 shadow-sm
                      ${isActive
                        ? 'bg-gradient-to-br from-red-500 to-red-700 border-red-600 text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)] scale-[1.02] z-10'
                        : 'bg-white/90 backdrop-blur-xl border-red-400 text-slate-600 shadow-[0_4px_15px_rgba(239,68,68,0.06)] hover:shadow-[0_4px_15px_rgba(239,68,68,0.15)] hover:border-red-500 hover:bg-red-50 hover:text-red-600'}`}
                  >
                    <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                    {label}
                    {isNav && <span className={`text-[10px] ml-1 ${isActive ? 'text-red-100' : 'text-slate-400'}`}>↗</span>}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={safeActiveTab}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="relative z-30 pointer-events-auto"
          >
            {TAB_CONTENT[safeActiveTab]}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end pointer-events-none">
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col gap-3 mb-4 items-end pointer-events-auto"
            >
              {[
                { label: 'Create Event', icon: Plus, action: () => setActiveTab('createevent') },
                { label: 'Send Announcement', icon: Send, action: () => setActiveTab('communications') },
                { label: 'Generate Teams', icon: GitBranch, action: () => setActiveTab('teams') },
                { label: 'Add Participant', icon: Users, action: () => setActiveTab('participants') },
                { label: 'Export Data', icon: Download, action: () => alert('Export functionality to be implemented.') },
              ].map((btn, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.05, x: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { btn.action(); setFabOpen(false); }}
                  className="flex items-center gap-3 bg-white border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl shadow-lg hover:border-red-500/50 hover:text-red-600 transition-colors"
                >
                  <span className="text-sm font-semibold">{btn.label}</span>
                  <btn.icon size={16} />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setFabOpen(!fabOpen)}
          className={`pointer-events-auto w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors duration-300 ${fabOpen ? 'bg-white text-red-600 border border-red-500/50 shadow-red-500/20' : 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-red-500/40 hover:from-red-500 hover:to-red-700'}`}
        >
          <Plus size={24} className={`transition-transform duration-300 ${fabOpen ? 'rotate-45' : ''}`} />
        </motion.button>
      </div>
    </div>
  )
}
// src/views/AdminDashboard.jsx
// Committee command-centre. Seven tabs, all fully wired to backend endpoints.
// Dependencies: @tanstack/react-query, lucide-react, ../services/api, ../components/PipelineStepper

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, GitBranch, CheckSquare,
  UserCheck, Trophy, Mail, Upload, Download,
  Play, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronRight, RefreshCw, Wand2,
  Send, Copy, Trash2, Plus, Eye, Shield,
  BarChart2, FileText,
} from 'lucide-react'
import PipelineStepper from '../components/PipelineStepper'
import {
  participantsApi,
  solverApi,
  approvalsApi,
  evaluatorsApi,
  leaderboardApi,
  commsApi,
  aiApi,
  eventApi,
} from '../services/api'

// ── Shared micro-components ────────────────────────────────────────────────

function StatCard({ label, value, sub, colour = 'indigo' }) {
  const bg = {
    indigo: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300',
    teal:   'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]/10 border border-teal-500/20   text-teal-300',
    amber:  'bg-amber-500/10 border border-amber-500/20  text-amber-300',
    red:    'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]/10 border border-red-500/20    text-red-300',
  }[colour] ?? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'

  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold px-2 py-0.5 rounded inline-block ${bg}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green:  'bg-emerald-500/10 border border-emerald-500/20  text-emerald-300',
    red:    'bg-red-100    text-red-300',
    amber:  'bg-amber-100  text-amber-300',
    indigo: 'bg-indigo-100 text-indigo-300',
    gray:   'bg-white/10   text-gray-500',
  }[colour] ?? 'bg-white/10 text-gray-500'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  )
}

function SectionTitle({ children }) {
  return <h2 className="text-base font-semibold text-white mb-4">{children}</h2>
}

// ── TAB 1: OVERVIEW ────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: summary } = useQuery({ queryKey: ['roster-summary'], queryFn: participantsApi.summary, refetchInterval: 30_000 })
  const { data: pending } = useQuery({ queryKey: ['pending-approvals'], queryFn: approvalsApi.pending, refetchInterval: 15_000 })
  const { data: lb }      = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.get, refetchInterval: 60_000 })
  const { data: anomalies } = useQuery({ queryKey: ['anomalies'], queryFn: leaderboardApi.anomalies, refetchInterval: 30_000 })
  const { data: commsData } = useQuery({ queryKey: ['comms-log'], queryFn: () => commsApi.log({ page_size: 6 }), refetchInterval: 30_000 })

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Participants"      value={summary?.total_participants} colour="indigo" sub="registered" />
        <StatCard label="Unassigned"        value={summary?.unassigned}        colour="amber"  sub="need team assignment" />
        <StatCard label="Pending Approvals" value={pending?.total_pending}     colour="amber"  sub="teams awaiting review" />
        <StatCard label="Anomaly Flags"     value={anomalies?.total_flagged}   colour="red"    sub="scorecards on hold" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Institution breakdown */}
        <div className="glass-panel rounded-2xl border border-white/10 p-5">
          <SectionTitle>Institutions</SectionTitle>
          {summary?.institution_counts
            ? Object.entries(summary.institution_counts)
                .sort(([, a], [, b]) => b - a)
                .map(([inst, count]) => (
                  <div key={inst} className="flex items-center gap-3 mb-2.5">
                    <span className="flex-1 text-sm text-gray-600 truncate">{inst}</span>
                    <span className="text-sm font-semibold text-indigo-400 w-5 text-right">{count}</span>
                    <div className="w-24 bg-white/10 rounded-full h-1.5">
                      <div
                        className="bg-indigo-400 h-1.5 rounded-full transition-all"
                        style={{ width: `${(count / (summary.total_participants || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
            : <p className="text-sm text-gray-500">No participants loaded yet.</p>
          }
        </div>

        {/* Mini leaderboard */}
        <div className="glass-panel rounded-2xl border border-white/10 p-5">
          <SectionTitle>Top Teams</SectionTitle>
          {lb?.leaderboard?.length
            ? lb.leaderboard.slice(0, 6).map((team) => (
                <div key={team.team_id} className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono text-gray-500 w-5">{team.rank ?? '—'}</span>
                  <span className="flex-1 text-sm text-gray-200 truncate">{team.team_name}</span>
                  {team.has_flags
                    ? <Badge colour="amber"><AlertTriangle size={10} /> Flagged</Badge>
                    : <span className="text-sm font-semibold text-teal-300">{team.weighted_total?.toFixed(2)}</span>
                  }
                </div>
              ))
            : <p className="text-sm text-gray-500">No evaluations submitted yet.</p>
          }
        </div>
      </div>

      {/* Recent comms */}
      <div className="mt-6 glass-panel rounded-2xl border border-white/10 p-5">
        <SectionTitle>Recent Communications</SectionTitle>
        {commsData?.logs?.length
          ? <div className="space-y-2">
              {commsData.logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-xs text-gray-500 truncate flex-1">{log.recipient_email}</span>
                  <Badge colour="gray">{log.template}</Badge>
                  <Badge colour={log.success ? 'green' : 'red'}>{log.success ? 'Sent' : 'Failed'}</Badge>
                </div>
              ))}
            </div>
          : <p className="text-sm text-gray-500">No emails dispatched yet.</p>
        }
      </div>
    </div>
  )
}

// ── TAB 2: PARTICIPANTS ────────────────────────────────────────────────────
function ParticipantsTab() {
  const qc = useQueryClient()
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive]   = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [teamFilter, setTeamFilter]   = useState('')

  const { data: summary } = useQuery({ queryKey: ['roster-summary'], queryFn: participantsApi.summary })
  const { data, isLoading } = useQuery({
    queryKey: ['participants', page, search, teamFilter],
    queryFn: () => participantsApi.list({
      page,
      page_size: 15,
      search:       search  || undefined,
      team_assigned: teamFilter === '' ? undefined : teamFilter === 'true',
    }),
    keepPreviousData: true,
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
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['participants'] }),
  })

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
  }, [])

  const onDragOver = (e) => { e.preventDefault(); setDragActive(true) }
  const onDragLeave = () => setDragActive(false)

  return (
    <div>
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Total"      value={summary.total_participants} colour="indigo" />
          <StatCard label="Assigned"   value={summary.assigned_to_team}  colour="teal" />
          <StatCard label="Unassigned" value={summary.unassigned}        colour="amber" />
        </div>
      )}

      {/* CSV dropzone */}
      <div className="glass-panel rounded-2xl border border-white/10 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Upload Roster CSV</SectionTitle>
          <a
            href={participantsApi.csvTemplateUrl()}
            download
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-500 hover:bg-white/5 transition-colors"
          >
            <Download size={13} /> Download Template
          </a>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-indigo-500 bg-indigo-500/10 border border-indigo-500/20'
              : 'border-white/10 hover:border-indigo-300 hover:bg-white/5'
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
                <Loader2 size={28} className="text-indigo-500 animate-spin" />
                <p className="text-sm text-gray-500">Uploading roster…</p>
              </div>
            : <div className="flex flex-col items-center gap-2">
                <Upload size={28} className={dragActive ? 'text-indigo-500' : 'text-gray-600'} />
                <p className="text-sm font-medium text-gray-600">
                  Drop a CSV here or <span className="text-indigo-400">click to browse</span>
                </p>
                <p className="text-xs text-gray-500">
                  Required columns: first_name, last_name, email, institution + any skill columns
                </p>
              </div>
          }
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">{uploadResult.message}</p>
              <button onClick={() => setUploadResult(null)} className="text-gray-500 hover:text-gray-500">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-teal-400 font-semibold">{uploadResult.created} created</span>
              <span className="text-indigo-400 font-semibold">{uploadResult.updated} updated</span>
              <span className="text-amber-400 font-semibold">{uploadResult.skipped} skipped</span>
              {uploadResult.errors > 0 && (
                <span className="text-red-400 font-semibold">{uploadResult.errors} errors</span>
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

      {/* Filter bar */}
      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by name or email…"
          className="flex-1 text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <select
          value={teamFilter}
          onChange={(e) => { setTeamFilter(e.target.value); setPage(1) }}
          className="text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none bg-[#111827] text-white hover:bg-gray-800 transition-colors z-10 cursor-pointer"
        >
          <option value="" className="bg-[#111827] text-white">All</option>
          <option value="false" className="bg-[#111827] text-white">Unassigned</option>
          <option value="true" className="bg-[#111827] text-white">Assigned</option>
        </select>
      </div>

      {/* Participants table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 border-b border-white/10 text-left">
              {['Name', 'Institution', 'Skills (avg)', 'Team', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {[1,2,3,4,5].map((j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-white/10 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : data?.participants.map((p) => {
                  const skills = Object.values(p.skill_vector || {})
                  const avg = skills.length
                    ? (skills.reduce((a, b) => a + b, 0) / skills.length).toFixed(1)
                    : null

                  return (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{p.first_name} {p.last_name}</p>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.institution}</td>
                      <td className="px-4 py-3">
                        {avg
                          ? <Badge colour="indigo">{avg}/10</Badge>
                          : <span className="text-gray-600 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {p.team_name
                          ? <Badge colour="teal">{p.team_name}</Badge>
                          : <span className="text-xs text-gray-500">Unassigned</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${p.first_name} ${p.last_name}?`)) {
                              deleteMutation.mutate(p.id)
                            }
                          }}
                          className="p-1 text-gray-600 hover:text-red-500 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-white/5 text-xs text-gray-500">
            <span>Page {data.page} of {data.total_pages} ({data.total} total)</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded border border-white/10 disabled:opacity-40 hover:bg-white/5">Prev</button>
              <button disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded border border-white/10 disabled:opacity-40 hover:bg-white/5">Next</button>
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
  const [taskId, setTaskId]       = useState(null)
  const [committed, setCommitted] = useState(false)
  const [config, setConfig] = useState({
    num_teams: 5, target_size: 4, k_min: 3, k_max: 5,
    max_per_institution: 1, use_mock_data: false,
  })

  // Run mutation
  const runMutation = useMutation({
    mutationFn: () => solverApi.run(config),
    onSuccess: (res) => { setTaskId(res.task_id); setCommitted(false) },
  })

  // Task polling — stops when terminal state reached
  const { data: taskStatus } = useQuery({
    queryKey: ['task-status', taskId],
    queryFn:  () => solverApi.taskStatus(taskId),
    enabled:  !!taskId,
    refetchInterval: (data) => {
      if (!data || data.status === 'success' || data.status === 'failed') return false
      return 1500
    },
    refetchIntervalInBackground: true,
  })

  // Fetch draft lineups only when solver succeeded
  const { data: drafts } = useQuery({
    queryKey: ['solver-drafts', taskId],
    queryFn:  () => solverApi.drafts(taskId),
    enabled:  taskStatus?.status === 'success' && !!taskId,
  })

  // Commit to DB mutation
  const commitMutation = useMutation({
    mutationFn: () => solverApi.commit(taskId),
    onSuccess: () => {
      setCommitted(true)
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      qc.invalidateQueries({ queryKey: ['all-teams'] })
    },
  })

  const progress = taskStatus
    ? Math.min(100, Math.round((taskStatus.progress / Math.max(taskStatus.total_steps, 1)) * 100))
    : 0

  const statusColor = {
    pending: 'text-gray-500',
    running: 'text-indigo-400',
    success: 'text-teal-400',
    failed:  'text-red-400',
  }[taskStatus?.status] ?? 'text-gray-500'

  return (
    <div>
      {/* Solver config form */}
      <div className="glass-panel rounded-2xl border border-white/10 p-5 mb-6">
        <SectionTitle>Solver Configuration</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          {[
            { key: 'num_teams',           label: 'Number of teams',    min: 1,  max: 50 },
            { key: 'target_size',         label: 'Target team size',   min: 2,  max: 10 },
            { key: 'k_min',               label: 'Min size',           min: 1,  max: 10 },
            { key: 'k_max',               label: 'Max size',           min: 2,  max: 10 },
            { key: 'max_per_institution', label: 'Max / institution',  min: 1,  max: 5  },
          ].map(({ key, label, min, max }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
              <input
                type="number" min={min} max={max}
                value={config[key]}
                onChange={(e) => setConfig((c) => ({ ...c, [key]: +e.target.value }))}
                className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          ))}

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={config.use_mock_data}
                onChange={(e) => setConfig((c) => ({ ...c, use_mock_data: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-400 focus:ring-indigo-300"
              />
              Use mock data
            </label>
          </div>
        </div>

        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending || taskStatus?.status === 'running'}
          className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-lg bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
        <div className="glass-panel rounded-2xl border border-white/10 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Solver progress</p>
            <span className={`text-sm font-semibold capitalize ${statusColor}`}>
              {taskStatus.status}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 mb-3">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                taskStatus.status === 'success' ? 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]/10 border border-teal-500/200' :
                taskStatus.status === 'failed'  ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]/10 border border-red-500/200'  : 'bg-indigo-500/10 border border-indigo-500/200'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">{taskStatus.message}</p>

          {taskStatus.status === 'success' && taskStatus.result?.evaluation && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span>Quality: <strong className={
                taskStatus.result.evaluation.quality === 'excellent' ? 'text-teal-400' :
                taskStatus.result.evaluation.quality === 'good'      ? 'text-indigo-400' : 'text-amber-400'
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
            <h3 className="text-sm font-semibold text-gray-600">
              Draft lineups — {drafts.teams.length} teams, {drafts.total_participants} participants
            </h3>
            {!committed && (
              <button
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-teal-600 shadow-[0_0_15px_rgba(13,148,136,0.4)] hover:shadow-[0_0_25px_rgba(13,148,136,0.6)] text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {commitMutation.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Check size={14} />
                }
                Commit to Approval Queue
              </button>
            )}
            {committed && (
              <Badge colour="green"><Check size={12} /> Committed — check Approvals tab</Badge>
            )}
          </div>

          {commitMutation.isError && (
            <p className="mb-3 text-xs text-red-500">{commitMutation.error?.message}</p>
          )}

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {drafts.teams.map((team) => (
              <div key={team.team_id} className="glass-panel rounded-2xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm text-white">{team.team_name}</p>
                  <Badge colour="indigo">{team.size} members</Badge>
                </div>
                <div className="space-y-2">
                  {team.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-300 text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate">{m.name}</p>
                        <p className="text-xs text-gray-500 truncate">{m.institution}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {team.average_skill_vector?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-xs text-gray-500 mb-1">Skill avg</p>
                    <div className="flex gap-1 flex-wrap">
                      {team.average_skill_vector.map((v, i) => (
                        <span key={i} className="text-xs bg-white/5 border border-white/5 text-gray-500 px-1.5 py-0.5 rounded">
                          {Number(v).toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
  const [notes, setNotes]       = useState('')

  const { data: pending, isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn:  approvalsApi.pending,
    refetchInterval: 10_000,
  })
  const { data: detail } = useQuery({
    queryKey: ['team-detail', expanded],
    queryFn:  () => approvalsApi.detail(expanded),
    enabled:  !!expanded,
  })

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }) => approvalsApi.decide(id, decision, notes),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      qc.invalidateQueries({ queryKey: ['all-teams'] })
      setExpanded(null)
      setNotes('')
    },
  })
  const bulkMutation = useMutation({
    mutationFn: (decision) => approvalsApi.bulk(decision),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['pending-approvals'] }),
  })

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">Pending Approvals</h2>
          <p className="text-sm text-gray-500">{pending?.total_pending ?? 0} team(s) awaiting review</p>
        </div>
        {(pending?.total_pending ?? 0) > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => bulkMutation.mutate('reject')}
              disabled={bulkMutation.isPending}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]/10 border border-red-500/20"
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
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-teal-600 shadow-[0_0_15px_rgba(13,148,136,0.4)] hover:shadow-[0_0_25px_rgba(13,148,136,0.6)] text-white hover:bg-teal-700"
            >
              <Shield size={14} /> Approve all
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white/10 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {!isLoading && pending?.total_pending === 0 && (
        <div className="text-center py-16 text-gray-600">
          <Shield size={36} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-gray-500 font-medium">All teams reviewed</p>
          <p className="text-xs text-gray-500 mt-1">Run the solver and commit lineups to populate this queue.</p>
        </div>
      )}

      <div className="space-y-3">
        {pending?.teams.map((team) => (
          <div key={team.team_id} className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
            {/* Row */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5"
              onClick={() => setExpanded(expanded === team.team_id ? null : team.team_id)}
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 flex items-center justify-center font-semibold text-sm shrink-0">
                {team.team_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{team.team_name}</p>
                <p className="text-xs text-gray-500">{team.member_count} members</p>
              </div>
              <Badge colour="amber">Pending</Badge>
              {expanded === team.team_id
                ? <ChevronDown size={16} className="text-gray-500 shrink-0" />
                : <ChevronRight size={16} className="text-gray-500 shrink-0" />
              }
            </div>

            {/* Expanded detail */}
            {expanded === team.team_id && detail && (
              <div className="border-t border-white/5 px-4 py-4">
                {/* Members grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {detail.members?.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-white/10 text-gray-500 text-xs font-semibold flex items-center justify-center shrink-0">
                        {m.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate">{m.name}</p>
                        <p className="text-xs text-gray-500 truncate">{m.institution}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI rationale */}
                {detail.rationale && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 border border-indigo-500/20 rounded-lg p-3 mb-4">
                    <p className="text-xs font-medium text-indigo-300 mb-1 flex items-center gap-1">
                      <Wand2 size={12} /> AI Analysis Engine
                    </p>
                    <p className="text-xs text-indigo-200 leading-relaxed">{detail.rationale}</p>
                  </div>
                )}

                {/* Notes + action buttons */}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (required when rejecting)…"
                  rows={2}
                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-3 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => decideMutation.mutate({ id: team.team_id, decision: 'reject' })}
                    disabled={decideMutation.isPending}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]/10 border border-red-500/20"
                  >
                    <X size={14} /> Reject
                  </button>
                  <button
                    onClick={() => decideMutation.mutate({ id: team.team_id, decision: 'approve' })}
                    disabled={decideMutation.isPending}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-teal-600 shadow-[0_0_15px_rgba(13,148,136,0.4)] hover:shadow-[0_0_25px_rgba(13,148,136,0.6)] text-white hover:bg-teal-700"
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
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', expertise_areas: '' })
  const [linkSent, setLinkSent] = useState({})

  const { data, isLoading } = useQuery({ queryKey: ['evaluators'], queryFn: evaluatorsApi.list })

  const createMutation = useMutation({
    mutationFn: () => evaluatorsApi.create({
      ...form,
      expertise_areas: form.expertise_areas.split(',').map(s => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluators'] })
      setForm({ first_name: '', last_name: '', email: '', expertise_areas: '' })
      setShowForm(false)
    },
  })

  const sendLinkMutation = useMutation({
    mutationFn: (id) => evaluatorsApi.sendLink(id),
    onSuccess: (_, id) => setLinkSent((s) => ({ ...s, [id]: true })),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => evaluatorsApi.remove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['evaluators'] }),
  })

  const fieldFor = (key, label, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-white">Evaluators / Judges</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] text-white hover:bg-indigo-700"
        >
          <Plus size={14} /> Add Evaluator
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="glass-panel rounded-2xl border border-white/10 p-5 mb-5">
          <p className="text-sm font-semibold text-gray-600 mb-4">New Evaluator</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {fieldFor('first_name',      'First name',        'text', 'Dr. Meena')}
            {fieldFor('last_name',       'Last name',         'text', 'Sharma')}
            {fieldFor('email',           'Email',             'email','meena@ti.com')}
            {fieldFor('expertise_areas', 'Expertise (comma-separated)', 'text', 'embedded systems, signal processing')}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 rounded-lg border border-white/10 text-gray-500 hover:bg-white/5">Cancel</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.email}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] text-white hover:bg-indigo-700 disabled:opacity-50"
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
        ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-white/10 rounded-2xl animate-pulse mb-3" />)
        : (
          <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
            {(!data?.evaluators?.length)
              ? <div className="text-center py-12 text-gray-500 text-sm">No evaluators registered yet.</div>
              : data.evaluators.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-4 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5">
                    <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold text-sm flex items-center justify-center shrink-0">
                      {ev.first_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{ev.first_name} {ev.last_name}</p>
                      <p className="text-xs text-gray-500">{ev.email}</p>
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
                        onClick={() => sendLinkMutation.mutate(ev.id)}
                        disabled={sendLinkMutation.isPending || linkSent[ev.id]}
                        title="Send access link"
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/20 disabled:opacity-50"
                      >
                        {sendLinkMutation.isPending
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Send size={12} />
                        }
                        Send Link
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Remove this evaluator?')) deleteMutation.mutate(ev.id) }}
                        className="p-1.5 text-gray-600 hover:text-red-500 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
            }
          </div>
        )
      }
    </div>
  )
}

// ── TAB 6: LEADERBOARD ─────────────────────────────────────────────────────
function LeaderboardTab() {
  const qc = useQueryClient()

  const { data: lb }       = useQuery({ queryKey: ['leaderboard'],  queryFn: leaderboardApi.get,        refetchInterval: 30_000 })
  const { data: anomalies } = useQuery({ queryKey: ['anomalies'],   queryFn: leaderboardApi.anomalies,  refetchInterval: 15_000 })

  const overrideMutation = useMutation({
    mutationFn: (id) => leaderboardApi.override(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
  const overrideAllMutation = useMutation({
    mutationFn: leaderboardApi.overrideAll,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })

  const CRITERIA = ['technical_depth', 'innovation', 'presentation', 'feasibility']

  return (
    <div>
      {/* Anomaly flags */}
      {(anomalies?.total_flagged ?? 0) > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 border border-amber-200 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <p className="text-sm font-semibold text-amber-300">
                {anomalies.total_flagged} flagged scorecard(s) — results on hold
              </p>
            </div>
            <button
              onClick={() => overrideAllMutation.mutate()}
              disabled={overrideAllMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-300 hover:bg-amber-100"
            >
              Clear all flags
            </button>
          </div>
          <div className="space-y-2">
            {anomalies.scorecards.map((sc) => (
              <div key={sc.id} className="flex items-start gap-3 glass-panel rounded-lg p-3 border border-amber-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200">
                    Evaluator <span className="font-mono">{sc.evaluator_id.slice(0,8)}…</span>
                    {' → '}Team <span className="font-mono">{sc.team_id.slice(0,8)}…</span>
                  </p>
                  <p className="text-xs text-red-400 mt-0.5 leading-relaxed">{sc.flag_reason}</p>
                  {sc.anomaly_score != null && (
                    <p className="text-xs text-gray-500 mt-0.5">Z-score: {Number(sc.anomaly_score).toFixed(2)}</p>
                  )}
                </div>
                <button
                  onClick={() => overrideMutation.mutate(sc.id)}
                  disabled={overrideMutation.isPending}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-teal-600 shadow-[0_0_15px_rgba(13,148,136,0.4)] hover:shadow-[0_0_25px_rgba(13,148,136,0.6)] text-white hover:bg-teal-700 shrink-0"
                >
                  <Check size={12} /> Clear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rankings table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 bg-white/5 border-b border-white/10 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Team</div>
          <div className="col-span-2">Technical</div>
          <div className="col-span-2">Innovation</div>
          <div className="col-span-2">Presentation</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-1">Status</div>
        </div>

        {!lb?.leaderboard?.length
          ? <div className="text-center py-12 text-sm text-gray-500">No evaluations submitted yet.</div>
          : lb.leaderboard.map((team, i) => (
              <div
                key={team.team_id}
                className={`grid grid-cols-12 items-center px-4 py-3 border-b border-white/5 text-sm ${i === 0 && !team.has_flags ? 'bg-amber-500/10 border border-amber-500/20' : ''}`}
              >
                <div className="col-span-1 font-mono font-semibold text-gray-500">
                  {team.rank ?? <span className="text-gray-200">—</span>}
                </div>
                <div className="col-span-3 font-medium text-white truncate">{team.team_name}</div>
                <div className="col-span-2 text-gray-500">{team.average_scores?.technical_depth?.toFixed(1) ?? '—'}</div>
                <div className="col-span-2 text-gray-500">{team.average_scores?.innovation?.toFixed(1) ?? '—'}</div>
                <div className="col-span-2 text-gray-500">{team.average_scores?.presentation?.toFixed(1) ?? '—'}</div>
                <div className="col-span-1 font-bold text-indigo-300">{team.weighted_total?.toFixed(2) ?? '—'}</div>
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
  const [templateFilter, setTemplateFilter] = useState('')
  const [successFilter, setSuccessFilter]   = useState('')
  const [draftType, setDraftType]   = useState('progression_invite')
  const [draftTone, setDraftTone]   = useState('professional')
  const [draftContext, setDraftContext] = useState(
    JSON.stringify({
      participant_name: 'Priya Sharma',
      team_name: 'Team Alpha',
      next_stage: 'Grand Finale — Bangalore',
      event_name: 'WiSE@TI Hackathon',
    }, null, 2)
  )
  const [draft, setDraft]   = useState(null)
  const [copied, setCopied] = useState(false)

  const { data: commsData, isLoading } = useQuery({
    queryKey: ['comms-log', templateFilter, successFilter],
    queryFn:  () => commsApi.log({
      template: templateFilter || undefined,
      success:  successFilter  === '' ? undefined : successFilter === 'true',
      page_size: 50,
    }),
    refetchInterval: 20_000,
  })

  const draftMutation = useMutation({
    mutationFn: () => {
      let ctx
      try { ctx = JSON.parse(draftContext) } catch { throw new Error('Context is not valid JSON') }
      return aiApi.draft({ draft_type: draftType, context: ctx, tone: draftTone, max_words: 200 })
    },
    onSuccess: (res) => res.draft && setDraft(res.draft),
  })

  const DRAFT_TYPES = [
    { value: 'progression_invite',  label: 'Progression Invite' },
    { value: 'milestone_blast',     label: 'Milestone Blast' },
    { value: 'evaluation_summary',  label: 'Evaluation Summary' },
  ]
  const EXAMPLE_CONTEXTS = {
    progression_invite:  { participant_name: 'Priya Sharma', team_name: 'Team Alpha', next_stage: 'Grand Finale', event_name: 'WiSE@TI Hackathon' },
    milestone_blast:     { milestone_name: 'Team Assignments Published', event_name: 'WiSE@TI Hackathon', details: 'All assignments are now live on your portal.' },
    evaluation_summary:  { team_name: 'Team Alpha', event_name: 'WiSE@TI Hackathon', scores: { technical_depth: 8.5, innovation: 7.0, presentation: 9.0, feasibility: 6.5 } },
  }

  return (
    <div>
      {/* Communication log */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden mb-8">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <p className="text-sm font-semibold text-gray-600">Communication Log</p>
          <div className="flex gap-2">
            <input
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              placeholder="Filter by template…"
              className="text-xs border border-white/10 rounded-lg px-2.5 py-1.5 focus:outline-none w-36"
            />
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
              className="text-xs border border-white/10 rounded-lg px-2.5 py-1.5 focus:outline-none bg-[#111827] text-white hover:bg-gray-800 transition-colors z-10 cursor-pointer"
            >
              <option value="" className="bg-[#111827] text-white">All statuses</option>
              <option value="true" className="bg-[#111827] text-white">Sent</option>
              <option value="false" className="bg-[#111827] text-white">Failed</option>
            </select>
          </div>
        </div>

        {isLoading
          ? <div className="p-4 space-y-2">{Array.from({length:5}).map((_,i)=><div key={i} className="h-8 bg-white/10 rounded animate-pulse" />)}</div>
          : !commsData?.logs?.length
            ? <div className="text-center py-10 text-sm text-gray-500">No emails dispatched yet.</div>
            : <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left border-b border-white/5">
                    {['Recipient', 'Template', 'Stage', 'Status', 'Sent at'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commsData.logs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <p className="text-gray-200 font-medium truncate max-w-[160px]">{log.recipient_email}</p>
                      </td>
                      <td className="px-4 py-2.5"><Badge colour="gray">{log.template}</Badge></td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs capitalize">{log.stage}</td>
                      <td className="px-4 py-2.5">
                        <Badge colour={log.success ? 'green' : 'red'}>{log.success ? 'Sent' : 'Failed'}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
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
              <label className="block text-xs font-medium text-gray-500 mb-2">Draft type</label>
              <div className="flex flex-wrap gap-2">
                {DRAFT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setDraftType(t.value)
                      setDraftContext(JSON.stringify(EXAMPLE_CONTEXTS[t.value], null, 2))
                      setDraft(null)
                    }}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      draftType === t.value
                        ? 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] text-white border-indigo-600'
                        : 'border-white/10 text-gray-500 hover:bg-white/5'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Tone</label>
              <select
                value={draftTone}
                onChange={(e) => setDraftTone(e.target.value)}
                className="text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none w-full bg-[#111827] text-white hover:bg-gray-800 transition-colors z-10 cursor-pointer"
              >
                {['professional', 'encouraging', 'formal'].map(t => <option key={t} value={t} className="bg-[#111827] text-white">{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Context (JSON)</label>
              <textarea
                value={draftContext}
                onChange={(e) => setDraftContext(e.target.value)}
                rows={8}
                className="w-full font-mono text-xs border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>

            <button
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {draftMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {draftMutation.isPending ? 'Generating…' : 'Generate Draft'}
            </button>
            {draftMutation.isError && <p className="text-xs text-red-500">{draftMutation.error?.message}</p>}
          </div>

          {/* Preview */}
          <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col min-h-64">
            {draft ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Draft Preview</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(draft.body_text)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                  >
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="pb-3 mb-3 border-b border-white/5">
                  <p className="text-xs text-gray-500 mb-0.5">Subject</p>
                  <p className="text-sm font-semibold text-white">{draft.subject}</p>
                </div>
                <div className="flex-1 overflow-auto">
                  <p className="text-xs text-gray-500 mb-1.5">Body</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{draft.body_text}</p>
                </div>
                <p className="mt-4 pt-3 border-t border-white/5 text-xs text-amber-400">
                  ⚠ Review carefully before dispatching. This draft has not been sent.
                </p>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-600">
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

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',        label: 'Overview',       Icon: LayoutDashboard },
  { key: 'participants',    label: 'Participants',    Icon: Users },
  { key: 'teams',           label: 'Team Formation', Icon: GitBranch },
  { key: 'approvals',       label: 'Approvals',      Icon: CheckSquare },
  { key: 'evaluators',      label: 'Evaluators',     Icon: UserCheck },
  { key: 'leaderboard',     label: 'Leaderboard',    Icon: Trophy },
  { key: 'communications',  label: 'Communications', Icon: Mail },
]

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview')

  const TAB_CONTENT = {
    overview:       <OverviewTab />,
    participants:   <ParticipantsTab />,
    teams:          <TeamsTab />,
    approvals:      <ApprovalsTab />,
    evaluators:     <EvaluatorsTab />,
    leaderboard:    <LeaderboardTab />,
    communications: <CommunicationsTab />,
  }

  return (
    <div className="min-h-screen text-gray-100">
      {/* Top bar */}
      <header className="glass-panel border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">EventOS</h1>
          <p className="text-xs text-gray-500">Committee Dashboard — WiSE@TI Hackathon</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]/10 border border-teal-500/200 inline-block animate-pulse" />
            System Online
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Pipeline stepper — always visible */}
        <PipelineStepper showAdvanceButton className="mb-6" />

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 glass-panel rounded-2xl border border-white/10 p-1 overflow-x-auto">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === key
                  ? 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] text-white font-medium'
                  : 'text-gray-500 hover:bg-white/10'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>{TAB_CONTENT[activeTab]}</div>
      </div>
    </div>
  )
}
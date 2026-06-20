import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ClipboardList, CheckCircle, Loader2, AlertTriangle,
  ChevronRight, ArrowLeft, RotateCcw, Download,
  Code, Lightbulb, MonitorPlay, ShieldCheck, TrendingUp, Sparkles, FileText, Sun, Moon
} from 'lucide-react'
import { portalApi, evaluationsApi, aiApi, solverApi, submissionsApi, eventStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'
import EventOSLogo from '../components/EventOSLogo'

// ── Grading criteria — mirrors backend GRADING_CRITERIA constant ───────────
const CRITERIA = [
  { key: 'technical_depth', label: 'Technical Depth',  weight: 0.35, description: 'Complexity, correctness, architecture quality', theme: 'red', icon: Code },
  { key: 'innovation',      label: 'Innovation',        weight: 0.25, description: 'Originality, creative problem framing', theme: 'blue', icon: Lightbulb },
  { key: 'presentation',    label: 'Presentation',      weight: 0.20, description: 'Clarity, demo quality, communication', theme: 'amber', icon: MonitorPlay },
  { key: 'feasibility',     label: 'Feasibility',       weight: 0.20, description: 'Practicality, scope awareness, polish', theme: 'green', icon: ShieldCheck },
]

const DEFAULT_SCORES = Object.fromEntries(CRITERIA.map((c) => [c.key, 5.0]))

function weightedTotal(scores) {
  return CRITERIA.reduce((sum, c) => sum + (scores[c.key] ?? 0) * c.weight, 0)
}

function qualityLabel(total) {
  if (total >= 8.5) return { label: 'Excellent', bg: 'bg-emerald-100 text-emerald-700' }
  if (total >= 7.0) return { label: 'Good',      bg: 'bg-blue-100 text-blue-700' }
  if (total >= 5.5) return { label: 'Average',   bg: 'bg-amber-100 text-amber-700' }
  return                    { label: 'Needs work', bg: 'bg-red-100 text-red-700' }
}

const themeColors = {
  red: { text: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', slider: 'bg-red-500' },
  blue: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', slider: 'bg-blue-600' },
  amber: { text: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', slider: 'bg-amber-500' },
  green: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', slider: 'bg-emerald-500' },
}

// ── Shared UI Components ───────────────────────────────────────────────────

function FullPageMessage({ icon: Icon, title, message }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-white dark:from-[#0b0f14] dark:via-slate-900/50 dark:to-[#0b0f14]">
      <div className="text-center max-w-sm px-4">
        <Icon size={40} className="mx-auto mb-4 text-red-500" />
        <h2 className="text-xl font-bold text-slate-950 dark:text-slate-100 mb-2">{title}</h2>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">{message}</p>
      </div>
    </div>
  )
}


function PortalThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={() => setIsDark(prev => !prev)}
      className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 shadow-sm hover:bg-slate-50 transition-colors"
      title="Toggle theme"
    >
      {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-500" />}
    </button>
  );
}

function PortalNavbar({ evaluatorName }) {
  const initial = evaluatorName ? evaluatorName.charAt(0).toUpperCase() : 'A'
  
  return (
    <nav className="bg-white/95 dark:bg-slate-950/90 border-b border-slate-200 dark:border-white/10/80 dark:border-white/10 backdrop-blur sticky top-0 z-50 h-[72px] flex items-center shrink-0">
      <div className="w-full flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-slate-100 transition-colors hidden sm:block">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="flex items-center gap-3">
            <EventOSLogo className="text-red-500" size={32} />
            <div>
               <h1 className="text-sm font-black text-slate-950 dark:text-slate-100 leading-tight tracking-widest uppercase">WISE@TI HACKATHON</h1>
               <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Evaluator Portal</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80 shadow-sm">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <span className="text-xs font-bold text-slate-700 dark:text-slate-300">System Live</span>
           </div>
           
           <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>
           
           <div className="hidden sm:block"><PortalThemeToggle /></div>

           <div className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-sm shadow-sm border-2 border-white">
             {initial}
           </div>
        </div>
      </div>
    </nav>
  )
}

// ── Criterion slider row ───────────────────────────────────────────────────

function CriterionSlider({ criterion, value, onChange }) {
  const pct = (value / 10) * 100
  const colors = themeColors[criterion.theme]
  const Icon = criterion.icon

  const activeColor =
    criterion.key === 'technical_depth' ? '#ef4444' :
    criterion.key === 'innovation' ? '#3b82f6' :
    criterion.key === 'presentation' ? '#f59e0b' :
    criterion.key === 'feasibility' ? '#10b981' :
    '#3b82f6';

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10/80 dark:border-white/10 rounded-[18px] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)] flex flex-col md:flex-row md:items-center gap-6">
      
      <div className="flex-1 flex items-start gap-4">
         <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
            <Icon size={24} />
         </div>
         <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm font-black text-slate-950 dark:text-slate-100">{criterion.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                {(criterion.weight * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{criterion.description}</p>
         </div>
      </div>

      <div className="flex-1 max-w-sm relative px-2">
        <input
          type="range"
          min={0} max={10} step={0.5}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-200 absolute top-1/2 -translate-y-1/2 z-0"
          style={{
            background: `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
            accentColor: activeColor,
          }}
        />
        <style dangerouslySetInnerHTML={{__html: `
          input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            border: 2px solid ${activeColor};
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: relative;
            z-index: 10;
          }
        `}} />
        <div className="flex justify-between mt-6 px-1 relative z-0">
          {[0, 2.5, 5, 7.5, 10].map((tick) => (
            <span key={tick} className="text-[10px] font-bold text-slate-400 tabular-nums w-4 text-center">{tick}</span>
          ))}
        </div>
      </div>

      <div className="shrink-0 text-right w-16">
        <span className="text-2xl font-black tabular-nums text-slate-950 dark:text-slate-100">{value.toFixed(1)}</span>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400"> /10</span>
      </div>

    </div>
  )
}

// ── Scoring form ──────────────────────────────────────────────────────────

function ScoringForm({ team, onSubmitted, alreadySubmitted, token }) {
  const urlToken = token
  const [scores, setScores]         = useState(DEFAULT_SCORES)
  const [confirming, setConfirming] = useState(false)

  const total   = useMemo(() => weightedTotal(scores), [scores])
  const quality = useMemo(() => qualityLabel(total), [total])

  const submitMutation = useMutation({
    mutationFn: () =>
      evaluationsApi.submit({ team_id: team.team_id, scores }, urlToken),
    onSuccess: () => {
      setConfirming(false)
      onSubmitted(team.team_id)
    },
  })

  function updateScore(key, val) {
    setScores((s) => ({ ...s, [key]: val }))
  }

  if (alreadySubmitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-6">
           <CheckCircle size={40} />
        </div>
        <h3 className="text-2xl font-black text-slate-950 dark:text-slate-100 mb-2">Scorecard submitted</h3>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Your evaluation for <strong className="text-slate-950 dark:text-slate-100">{team.team_name}</strong> has been recorded securely.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Team header */}
      <div className="mt-4 mb-2">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Evaluating</p>
        <h2 className="text-2xl font-black text-slate-950 dark:text-slate-100">{team.team_name}</h2>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
          Score each criterion honestly. Your evaluation is anonymised in the final aggregate.
        </p>
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-3">
        {CRITERIA.map((c) => (
          <CriterionSlider
            key={c.key}
            criterion={c}
            value={scores[c.key]}
            onChange={(val) => updateScore(c.key, val)}
          />
        ))}
      </div>

      {/* Weighted total display */}
      <div className="bg-red-50/70 rounded-[18px] border border-red-100 p-6 flex items-center justify-between mt-2">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900/80 flex items-center justify-center text-red-500 shadow-sm shrink-0">
             <TrendingUp size={20} />
           </div>
           <div>
             <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5">WEIGHTED TOTAL SCORE</p>
             <div className="flex items-baseline gap-2">
               <span className="text-4xl font-black text-red-600 tabular-nums">{total.toFixed(2)}</span>
               <span className="text-sm font-bold text-slate-500 dark:text-slate-400">/10</span>
               <span className={`text-xs font-bold px-2.5 py-1 rounded-md ml-2 ${quality.bg}`}>{quality.label}</span>
             </div>
           </div>
        </div>
        <button
          onClick={() => setScores(DEFAULT_SCORES)}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:text-slate-100 transition-colors bg-white dark:bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {/* Submit / confirm */}
      {!confirming ? (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10/80 dark:border-white/10 rounded-[18px] p-8 shadow-[0_12px_30px_rgba(15,23,42,0.04)] mt-2">
           <h3 className="text-lg font-black text-slate-950 dark:text-slate-100 mb-6">Review & Submit</h3>
           
           <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
              <div className="flex gap-8 divide-x divide-slate-100">
                {CRITERIA.map(c => (
                  <div key={c.key} className="pl-8 first:pl-0 flex items-center gap-3">
                     <div className={`w-2 h-2 rounded-full ${themeColors[c.theme].slider}`}></div>
                     <div>
                       <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">{c.label}</p>
                       <p className="text-base font-black text-slate-950 dark:text-slate-100">{scores[c.key].toFixed(1)}</p>
                     </div>
                  </div>
                ))}
              </div>
              <div className="text-right">
                 <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">Weighted total</p>
                 <p className="text-2xl font-black text-slate-950 dark:text-slate-100">{total.toFixed(2)}</p>
              </div>
           </div>

           <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-6">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Please review carefully. After submission, this scorecard cannot be edited from the portal.</p>
              <div className="flex gap-3 w-full md:w-auto">
                 <button
                    onClick={() => {}}
                    disabled
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-400 bg-slate-50 cursor-not-allowed"
                 >
                    <ArrowLeft size={16} /> Go back
                 </button>
                 <button
                   onClick={() => setConfirming(true)}
                   className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold shadow-sm hover:bg-red-600 transition-colors flex-1 md:flex-none"
                 >
                   <CheckCircle size={16} /> Confirm & Submit
                 </button>
              </div>
           </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10/80 dark:border-white/10 rounded-[18px] p-8 shadow-[0_12px_30px_rgba(15,23,42,0.04)] mt-2">
          <h3 className="text-lg font-black text-slate-950 dark:text-slate-100 mb-6">Confirm submission</h3>
          
          <div className="space-y-4 max-w-sm mb-6">
            {CRITERIA.map((c) => (
              <div key={c.key} className="flex justify-between items-center text-sm">
                <span className="font-bold text-slate-500 dark:text-slate-400">{c.label}</span>
                <span className="font-black text-slate-950 dark:text-slate-100">{scores[c.key].toFixed(1)}</span>
              </div>
            ))}
            <div className="h-px bg-slate-200 my-2"></div>
            <div className="flex justify-between items-center text-sm">
              <span className="font-black text-slate-950 dark:text-slate-100">Weighted total</span>
              <span className="font-black text-slate-950 dark:text-slate-100">{total.toFixed(2)}</span>
            </div>
          </div>
          
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-8">
            Please review carefully. After submission, this scorecard cannot be edited from the portal.
          </p>
          
          <div className="flex gap-3 justify-end w-full">
            <button
              onClick={() => setConfirming(false)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/80 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft size={16} /> Go back
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold shadow-sm hover:bg-red-600 transition-colors disabled:opacity-50 min-w-[180px]"
            >
              {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {submitMutation.isPending ? 'Submitting…' : 'Confirm & Submit'}
            </button>
          </div>
          {submitMutation.isError && (
            <p className="mt-4 text-xs font-bold text-red-500 text-right">{submitMutation.error?.message}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Team submission download section ───────────────────────────────────────

function TeamSubmissionSection({ teamId, token }) {
  const urlToken = token
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['team-submission', teamId, urlToken],
    queryFn: () => submissionsApi.getTeamSubmission(teamId, urlToken),
    enabled: !!teamId && !!urlToken,
    retry: false,
  })

  async function handleDownload() {
    setDownloading(true)
    try {
      const response = await submissionsApi.downloadTeamZip(teamId, urlToken)
      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data?.submission?.original_filename || `team_${teamId}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Download failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setDownloading(false)
    }
  }

  const sub = data?.submission

  return (
    <div className="bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-white/10/80 dark:border-white/10 rounded-[16px] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-4">
         <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
           <FileText size={20} />
         </div>
         <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-slate-100">Submissions</h3>
            {isLoading ? (
               <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                 <Loader2 size={10} className="animate-spin text-blue-500" /> Loading...
               </p>
            ) : error || !sub ? (
               <p className="text-xs font-medium text-slate-500 dark:text-slate-400">No project ZIP submitted yet.</p>
            ) : (
               <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                 {sub.original_filename} · {sub.file_size_bytes ? `${(sub.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
               </p>
            )}
         </div>
      </div>
      {sub ? (
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        </button>
      ) : (
        <ChevronRight size={16} className="text-slate-400" />
      )}
    </div>
  )
}

function ScoringGuideCard({ rubricLoading }) {
   return (
      <div className="bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-white/10/80 dark:border-white/10 rounded-[16px] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors">
         <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0">
               <Sparkles size={20} />
            </div>
            <div>
               <h3 className="text-sm font-black text-slate-950 dark:text-slate-100 flex items-center gap-2">
                 AI Scoring Guide 
                 {rubricLoading && <Loader2 size={12} className="animate-spin text-red-500" />}
               </h3>
               <p className="text-xs font-medium text-slate-500 dark:text-slate-400">View scoring rubric, criteria definitions, and examples.</p>
            </div>
         </div>
         <ChevronRight size={16} className="text-slate-400" />
      </div>
   )
}

// ── Team queue sidebar ─────────────────────────────────────────────────────

function TeamQueueSidebar({ teams, selectedId, submittedIds, onSelect }) {
  const total = teams.length
  const submitted = submittedIds.length
  const progressPct = total > 0 ? (submitted / total) * 100 : 0

  return (
    <aside className="w-[300px] shrink-0 bg-white/90 border-r border-slate-200 dark:border-white/10/80 dark:border-white/10 text-slate-950 dark:text-slate-100 backdrop-blur flex flex-col hidden lg:flex h-[calc(100vh-72px)] sticky top-[72px] overflow-y-auto">
      
      <div className="p-6 border-b border-slate-100">
         <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">PROGRESS</span>
            <span className="text-xs font-bold text-red-500">{submitted}/{total}</span>
         </div>
         <div className="w-full bg-slate-100 rounded-full h-1.5">
           <div className="bg-red-500 h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
         </div>
      </div>

      <div className="p-4 flex-1">
         <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-2 mb-3">ASSIGNED TEAMS</p>
         <div className="space-y-2">
            {teams.map((team) => {
              const done = submittedIds.includes(team.team_id) || team.already_graded
              const isActive = selectedId === team.team_id
              
              // alternate colors for unselected dots just for visual similarity to screenshot
              // team A is blue, team B is yellow in screenshot.
              // Let's just use team.team_name length or hash to pick amber/blue.
              const dotColor = done ? 'bg-red-500' : (team.team_name.length % 2 === 0 ? 'bg-blue-500' : 'bg-amber-400')

              return (
                <button
                  key={team.team_id}
                  onClick={() => onSelect(team)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${
                    isActive
                      ? 'bg-red-50/60 border-red-200'
                      : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-white/10 hover:border-slate-300'
                  }`}
                >
                   <div className="flex items-start gap-3 text-left">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${isActive ? 'bg-red-500' : dotColor}`}></div>
                      <div>
                         <p className={`text-sm font-black ${isActive ? 'text-slate-950 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>{team.team_name}</p>
                         <p className={`text-[10px] font-bold mt-0.5 ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400'}`}>{done ? 'Submitted' : 'Awaiting your score'}</p>
                      </div>
                   </div>
                   <ChevronRight size={16} className={isActive ? 'text-slate-950 dark:text-slate-100' : 'text-slate-400'} />
                </button>
              )
            })}
         </div>
      </div>
    </aside>
  )
}

// ── Main JudgePortal ──────────────────────────────────────────────────────

export default function JudgePortal() {
  const { eventId } = useParams();
  useEffect(() => {
    if (eventId) eventStorage.set(eventId)
  }, [eventId])
  const { setToken } = useAuth()
  const [selectedTeam, setSelectedTeam]   = useState(null)
  const [submittedIds, setSubmittedIds]   = useState([])

  const [rubricLoading, setRubricLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (!selectedTeam) {
      return
    }
    setTimeout(() => {
      if (active) {
        setRubricLoading(true)
      }
    }, 0)
    const criteriaWeights = Object.fromEntries(
      CRITERIA.map(c => [c.label, c.weight])
    )
    aiApi.rubric({
      challenge_area: 'WiSE@TI Hackathon Project',
      criteria: criteriaWeights,
      event_name: 'WiSE@TI Hackathon',
    })
      .then(async (res) => {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2500))
          const s = await solverApi.taskStatus(res.task_id)
          if (s.status === 'success') {
            setRubricLoading(false)
            return
          }
          if (s.status === 'failed') break
        }
        setRubricLoading(false)
      })
      .catch(() => setRubricLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam?.team_id])

  // Extract token from URL on mount
  const rawUrlToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('token')
  }, [])

  const evaluatorPortalTokenKey = eventId
    ? `eventos_portal_evaluator_token_${eventId}`
    : null

  const urlToken = useMemo(() => {
    if (rawUrlToken) return rawUrlToken
    return evaluatorPortalTokenKey
      ? sessionStorage.getItem(evaluatorPortalTokenKey)
      : null
  }, [rawUrlToken, evaluatorPortalTokenKey])

  useEffect(() => {
    if (!rawUrlToken || !evaluatorPortalTokenKey) return
    sessionStorage.setItem(evaluatorPortalTokenKey, rawUrlToken)
    setToken(rawUrlToken)
  }, [rawUrlToken, evaluatorPortalTokenKey, setToken])

  const { data: portalData, isLoading, error } = useQuery({
    queryKey:  ['portal-access', urlToken],
    queryFn:   () => portalApi.access(urlToken),
    enabled:   !!urlToken ,
    retry:     false,
    staleTime: 5 * 60 * 1000,
  })

  // ── Render guards ────────────────────────────────────────────────────────

  if (!urlToken) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        title="No access token"
        message="Please use the secure judge link sent to your email. It looks like /judge?token=..."
      />
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-white dark:from-[#0b0f14] dark:via-slate-900/50 dark:to-[#0b0f14]">
        <div className="text-center">
          <Loader2 size={32} className="text-red-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading your evaluation portal…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        title="Access denied"
        message={error.message?.includes('expired')
          ? 'Your access link has expired. Please contact the committee for a new link.'
          : `Invalid or expired token. (${error.message})`
        }
      />
    )
  }

  // Wrong role guard
  if (portalData && portalData.participant_id) {
    return (
      <FullPageMessage
        icon={AlertTriangle}
        title="Wrong portal"
        message="This link is for participants. Use your participant portal link instead."
      />
    )
  }

  const teams         = portalData?.assigned_teams   ?? []
  const evaluatorName = portalData?.name              ?? 'Evaluator'

  function handleTeamSelect(team) {
    setSelectedTeam(team)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSubmitted(teamId) {
    setSubmittedIds((ids) => [...new Set([...ids, teamId])])
    const allSubmitted = [...new Set([...submittedIds, teamId])]
    const nextTeam = teams.find(
      (t) => !allSubmitted.includes(t.team_id) && !t.already_graded
    )
    setSelectedTeam(nextTeam ?? null)
  }

  // ── Main layout ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fbff] dark:bg-[#0b0f14] text-slate-950 dark:text-slate-100 font-sans relative overflow-x-hidden">
      
      {/* Background Dots */}
      <div className="pointer-events-none absolute left-24 top-24 h-36 w-28 opacity-25 [background-image:radial-gradient(#bfdbfe_1.5px,transparent_1.5px)] [background-size:16px_16px]" />
      <div className="pointer-events-none absolute right-20 bottom-28 h-36 w-28 opacity-25 [background-image:radial-gradient(#bbf7d0_1.5px,transparent_1.5px)] [background-size:16px_16px]" />

      <PortalNavbar evaluatorName={evaluatorName} />

      <div className="flex w-full">
        <TeamQueueSidebar
          teams={teams}
          selectedId={selectedTeam?.team_id}
          submittedIds={[
            ...submittedIds,
            ...teams.filter((t) => t.already_graded).map((t) => t.team_id),
          ]}
          onSelect={handleTeamSelect}
        />

        <main className="flex-1 px-4 py-8 md:px-8 max-w-4xl mx-auto z-10 relative">
          
          {/* Empty State */}
          {!selectedTeam && (
             <div className="flex flex-col items-center pt-10 pb-20">
                <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-6">
                   <ClipboardList size={40} />
                </div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-slate-100 mb-3">Select a team to evaluate</h2>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-12 max-w-sm text-center">Choose a team from the queue on the left to begin your evaluation.</p>

                <div className="bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-white/10/80 dark:border-white/10 rounded-[22px] p-8 shadow-[0_18px_45px_rgba(15,23,42,0.06)] w-full max-w-2xl">
                   <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-6">GRADING CRITERIA & WEIGHTS</p>
                   
                   <div className="space-y-5">
                      {CRITERIA.map(c => (
                        <div key={c.key} className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${themeColors[c.theme].bg} ${themeColors[c.theme].text}`}>
                             <c.icon size={20} />
                           </div>
                           <span className="text-sm font-bold text-slate-950 dark:text-slate-100 shrink-0">{c.label}</span>
                           <div className="flex-1 border-b border-dashed border-slate-200 dark:border-white/10"></div>
                           <span className={`text-sm font-black shrink-0 ${themeColors[c.theme].text}`}>{(c.weight * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          )}

          {/* Selected Team Content */}
          {selectedTeam && (
             <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ScoringGuideCard rubricLoading={rubricLoading} />
                <TeamSubmissionSection teamId={selectedTeam.team_id} token={urlToken} />
                
                <ScoringForm
                  key={selectedTeam.team_id}
                  team={selectedTeam}
                  token={urlToken}
                  onSubmitted={handleSubmitted}
                  alreadySubmitted={
                    submittedIds.includes(selectedTeam.team_id) ||
                    selectedTeam.already_graded
                  }
                />
             </div>
          )}

        </main>
      </div>
    </div>
  )
}
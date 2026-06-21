import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
 ClipboardList, CheckCircle, Loader2, AlertTriangle,
 ChevronRight, ArrowLeft, RotateCcw, Download,
 Code, Lightbulb, MonitorPlay, ShieldCheck, TrendingUp, Sparkles, FileText, Sun, Moon
} from 'lucide-react'
import { portalApi, evaluationsApi, submissionsApi, eventStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import EventOSLogo from '../components/EventOSLogo'
import PortalNotificationBell from '../components/PortalNotificationBell'


// ── Grading criteria — mirrors backend GRADING_CRITERIA constant ───────────
const CRITERIA = [
 { key: 'technical_depth', label: 'Technical Depth', weight: 0.35, description: 'Complexity, correctness, architecture quality', theme: 'red', icon: Code },
 { key: 'innovation', label: 'Innovation', weight: 0.25, description: 'Originality, creative problem framing', theme: 'blue', icon: Lightbulb },
 { key: 'presentation', label: 'Presentation', weight: 0.20, description: 'Clarity, demo quality, communication', theme: 'amber', icon: MonitorPlay },
 { key: 'feasibility', label: 'Feasibility', weight: 0.20, description: 'Practicality, scope awareness, polish', theme: 'green', icon: ShieldCheck },
]

const DEFAULT_SCORES = Object.fromEntries(CRITERIA.map((c) => [c.key, 5.0]))


function weightedTotal(scores) {
 return CRITERIA.reduce((sum, c) => sum + (scores[c.key] ?? 0) * c.weight, 0)
}

function qualityLabel(total) {
 if (total >= 8.5) return { label: 'Excellent', bg: 'bg-emerald-100 text-emerald-700' }
 if (total >= 7.0) return { label: 'Good', bg: 'bg-blue-100 text-blue-700' }
 if (total >= 5.5) return { label: 'Average', bg: 'bg-amber-100 text-amber-700' }
 return { label: 'Needs work', bg: 'bg-red-100 text-red-700' }
}

const themeColors = {
 red: { text: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', slider: 'bg-red-500' },
 blue: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', slider: 'bg-blue-600' },
 amber: { text: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', slider: 'bg-amber-500' },
 green: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', slider: 'bg-emerald-500' },
}

function formatStageLabel(stage) {
 return String(stage || 'current stage')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase())
}

// ── Shared UI Components ───────────────────────────────────────────────────

function compactGuideText(value, maxWords = 12) {
 const text = String(value || '').replace(/\s+/g, ' ').trim()
 if (!text) return ''
 const words = text.split(' ')
 return words.length <= maxWords ? text : `${words.slice(0, maxWords).join(' ')}…`
}

function FullPageMessage({ icon: Icon, title, message }) {
 const { isDark } = useTheme();
 return (
 <div className={isDark ? "min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b0f14] via-slate-900/50 to-[#0b0f14]" : "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-white"}>
 <div className="text-center max-w-sm px-4">
 <Icon size={40} className="mx-auto mb-4 text-red-500" />
 <h2 className={isDark ? "text-xl font-bold text-slate-100 mb-2" : "text-xl font-bold text-slate-950 mb-2"}>{title}</h2>
 <p className={isDark ? "text-sm font-medium text-slate-400 leading-relaxed" : "text-sm font-medium text-slate-500 leading-relaxed"}>{message}</p>
 </div>
 </div>
 )
}


function PortalThemeToggle() {
 const { isDark, toggleTheme } = useTheme();
 return (
 <button
 type="button"
 onClick={toggleTheme}
 className={isDark ? "p-2 rounded-xl bg-slate-900/80 border border-white/10 shadow-sm hover:bg-slate-800 transition-colors" : "p-2 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"}
 title="Toggle theme"
 >
 {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-500" />}
 </button>
 );
}

function PortalNavbar({ evaluatorName, token }) {
  const { isDark } = useTheme();
 const initial = evaluatorName ? evaluatorName.charAt(0).toUpperCase() : 'A'

 return (
 <nav className={isDark ? "bg-slate-950/90 border-b border-white/10 backdrop-blur sticky top-0 z-50 h-[72px] flex items-center shrink-0" : "bg-white/95 border-b border-slate-200 backdrop-blur sticky top-0 z-50 h-[72px] flex items-center shrink-0"}>
 <div className="w-full flex items-center justify-between px-6">
 <div className="flex items-center gap-4">
 <button
  type="button"
  className={isDark ? "text-slate-300 hover:text-slate-100 transition-colors hidden sm:block" : "text-slate-600 hover:text-slate-900 transition-colors hidden sm:block"}
>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
</button>
 <div className="flex items-center gap-3">
 <EventOSLogo className="text-red-500" size={32} />
 <div>
 <h1 className={isDark ? "text-sm font-black text-slate-100 leading-tight tracking-widest uppercase" : "text-sm font-black text-slate-950 leading-tight tracking-widest uppercase"}>WISE@TI HACKATHON</h1>
 <p className={isDark ? "text-xs font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>Evaluator Portal</p>
 </div>
 </div>
 </div>

 <div className="flex items-center gap-4">
 <div className={isDark ? "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-slate-900/80 shadow-sm" : "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white shadow-sm"}>
 <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
 <span className={isDark ? "text-xs font-bold text-slate-300" : "text-xs font-bold text-slate-700"}>System Live</span>
 </div>

 <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>

 <div className="hidden sm:block"><PortalThemeToggle /></div>

<PortalNotificationBell
  token={token}
  api={evaluationsApi}
  queryKeyPrefix="evaluator-notifications"
/>

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
  const { isDark } = useTheme();
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
 <div className={isDark ? "bg-slate-900/80 border border-white/10 rounded-[18px] p-6 shadow-none flex flex-col md:flex-row md:items-center gap-6" : "bg-white border border-slate-200 rounded-[18px] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)] flex flex-col md:flex-row md:items-center gap-6"}>

 <div className="flex-1 min-w-0 flex items-start gap-4">
 <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
 <Icon size={24} />
 </div>
 <div>
 <div className="flex items-center gap-3 mb-1">
 <span className={isDark ? "text-sm font-black text-slate-100" : "text-sm font-black text-slate-950"}>{criterion.label}</span>
 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
 {(criterion.weight * 100).toFixed(0)}%
 </span>
 </div>
 <p className={isDark ? "text-xs font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>{compactGuideText(criterion.description, 12)}</p>
 </div>
 </div>

 <div className="flex-1 min-w-0 max-w-sm relative px-2">
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
 <span className={isDark ? "text-2xl font-black tabular-nums text-slate-100" : "text-2xl font-black tabular-nums text-slate-950"}>{value.toFixed(1)}</span>
 <span className={isDark ? "text-xs font-bold text-slate-400" : "text-xs font-bold text-slate-500"}> /10</span>
 </div>

 </div>
 )
}

// ── Scoring form ──────────────────────────────────────────────────────────

function ScoringForm({ team, onSubmitted, alreadySubmitted, token }) {
  const { isDark } = useTheme();
 const urlToken = token
 const [scores, setScores] = useState(DEFAULT_SCORES)
 const [confirming, setConfirming] = useState(false)

 const total = useMemo(() => weightedTotal(scores), [scores])
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
 <h3 className={isDark ? "text-2xl font-black text-slate-100 mb-2" : "text-2xl font-black text-slate-950 mb-2"}>Scorecard submitted</h3>
 <p className={isDark ? "text-sm font-medium text-slate-400" : "text-sm font-medium text-slate-500"}>Your evaluation for <strong className={isDark ? "text-slate-100" : "text-slate-950"}>{team.team_name}</strong> has been recorded securely.</p>
 </div>
 )
 }

 return (
 <div className="flex flex-col gap-4">
 {/* Team header */}
 <div className="mt-4 mb-2">
 <p className={isDark ? "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" : "text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1"}>Evaluating</p>
 <h2 className={isDark ? "text-2xl font-black text-slate-100" : "text-2xl font-black text-slate-950"}>{team.team_name}</h2>
 <p className={isDark ? "text-sm font-medium text-slate-400 mt-1" : "text-sm font-medium text-slate-500 mt-1"}>
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
 <div className={isDark ? "w-12 h-12 rounded-full bg-slate-900/80 flex items-center justify-center text-red-500 shadow-sm shrink-0" : "w-12 h-12 rounded-full bg-white flex items-center justify-center text-red-500 shadow-sm shrink-0"}>
 <TrendingUp size={20} />
 </div>
 <div>
 <p className={isDark ? "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5" : "text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5"}>WEIGHTED TOTAL SCORE</p>
 <div className="flex items-baseline gap-2">
 <span className="text-4xl font-black text-red-600 tabular-nums">{total.toFixed(2)}</span>
 <span className={isDark ? "text-sm font-bold text-slate-400" : "text-sm font-bold text-slate-500"}>/10</span>
 <span className={`text-xs font-bold px-2.5 py-1 rounded-md ml-2 ${quality.bg}`}>{quality.label}</span>
 </div>
 </div>
 </div>
 <button
 onClick={() => setScores(DEFAULT_SCORES)}
 className={isDark ? "flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-slate-100 transition-colors bg-slate-900/80 px-4 py-2 rounded-xl border border-white/10 shadow-sm" : "flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-950 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm"}
 >
 <RotateCcw size={14} /> Reset
 </button>
 </div>

 {/* Submit / confirm */}
 {!confirming ? (
 <div className={isDark ? "bg-slate-900/80 border border-white/10 rounded-[18px] p-8 shadow-none mt-2" : "bg-white border border-slate-200 rounded-[18px] p-8 shadow-[0_12px_30px_rgba(15,23,42,0.04)] mt-2"}>
 <h3 className={isDark ? "text-lg font-black text-slate-100 mb-6" : "text-lg font-black text-slate-950 mb-6"}>Review & Submit</h3>

 <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
 <div className="flex gap-8 divide-x divide-slate-100">
 {CRITERIA.map(c => (
 <div key={c.key} className="pl-8 first:pl-0 flex items-center gap-3">
 <div className={`w-2 h-2 rounded-full ${themeColors[c.theme].slider}`}></div>
 <div>
 <p className="text-[10px] font-bold text-slate-500 mb-0.5">{c.label}</p>
 <p className={isDark ? "text-base font-black text-slate-100" : "text-base font-black text-slate-950"}>{scores[c.key].toFixed(1)}</p>
 </div>
 </div>
 ))}
 </div>
 <div className="text-right">
 <p className="text-[10px] font-bold text-slate-500 mb-0.5">Weighted total</p>
 <p className={isDark ? "text-2xl font-black text-slate-100" : "text-2xl font-black text-slate-950"}>{total.toFixed(2)}</p>
 </div>
 </div>

 <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-6">
 <p className={isDark ? "text-xs font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>Please review carefully. After submission, this scorecard cannot be edited from the portal.</p>
 <div className="flex gap-3 w-full md:w-auto">
 <button
 type="button"
 onClick={() => {
   const container = document.querySelector('[data-judge-scroll="true"]')
   if (container) {
     container.scrollTo({ top: 0, behavior: 'smooth' })
   } else {
     window.scrollTo({ top: 0, behavior: 'smooth' })
   }
 }}
 className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-500 shadow-sm hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
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
 <div className={isDark ? "bg-slate-900/80 border border-white/10 rounded-[18px] p-8 shadow-none mt-2" : "bg-white border border-slate-200 rounded-[18px] p-8 shadow-[0_12px_30px_rgba(15,23,42,0.04)] mt-2"}>
 <h3 className={isDark ? "text-lg font-black text-slate-100 mb-6" : "text-lg font-black text-slate-950 mb-6"}>Confirm submission</h3>

 <div className="space-y-4 max-w-sm mb-6">
 {CRITERIA.map((c) => (
 <div key={c.key} className="flex justify-between items-center text-sm">
 <span className={isDark ? "font-bold text-slate-400" : "font-bold text-slate-500"}>{c.label}</span>
 <span className={isDark ? "font-black text-slate-100" : "font-black text-slate-950"}>{scores[c.key].toFixed(1)}</span>
 </div>
 ))}
 <div className={isDark ? "h-px bg-white/10 my-2" : "h-px bg-slate-200 my-2"}></div>
 <div className="flex justify-between items-center text-sm">
 <span className={isDark ? "font-black text-slate-100" : "font-black text-slate-950"}>Weighted total</span>
 <span className={isDark ? "font-black text-slate-100" : "font-black text-slate-950"}>{total.toFixed(2)}</span>
 </div>
 </div>

 <p className="text-xs font-medium text-slate-500 mb-8">
 Please review carefully. After submission, this scorecard cannot be edited from the portal.
 </p>

 <div className="flex gap-3 justify-end w-full">
 <button
 type="button"
 onClick={() => setConfirming(false)}
 className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-500 shadow-sm hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
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
  const { isDark } = useTheme();
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
 <div className={isDark ? "bg-slate-900/80 border border-white/10 rounded-[16px] p-4 shadow-none flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors" : "bg-white/95 border border-slate-200 rounded-[16px] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors"}>
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
 <FileText size={20} />
 </div>
 <div>
 <h3 className={isDark ? "text-sm font-black text-slate-100" : "text-sm font-black text-slate-950"}>Submissions</h3>
 {isLoading ? (
 <p className={isDark ? "text-xs font-medium text-slate-400 flex items-center gap-1" : "text-xs font-medium text-slate-500 flex items-center gap-1"}>
 <Loader2 size={10} className="animate-spin text-blue-500" /> Loading...
 </p>
 ) : error || !sub ? (
 <p className={isDark ? "text-xs font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>No project ZIP submitted yet.</p>
 ) : (
 <p className={isDark ? "text-xs font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>
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

function ScoringGuideCard({ onOpen, loading }) {
  const { isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={onOpen}
      className={isDark ? "w-full bg-slate-900/80 border border-white/10 rounded-[16px] p-4 shadow-none flex items-center justify-between cursor-pointer hover:border-red-400/50 transition-colors text-left" : "w-full bg-white/95 border border-slate-200 rounded-[16px] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] flex items-center justify-between cursor-pointer hover:border-red-300 transition-colors text-left"}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0">
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
        </div>
        <div>
          <h3 className={isDark ? "text-sm font-black text-slate-100 flex items-center gap-2" : "text-sm font-black text-slate-950 flex items-center gap-2"}>
            AI Scoring Guide
          </h3>
          <p className={isDark ? "text-xs font-medium text-slate-400" : "text-xs font-medium text-slate-500"}>
            Generate rubric, criteria definitions, and scoring examples using AI.
          </p>
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-400" />
    </button>
  )
}

function ScoringGuideModal({ open, onClose, loading, error, rubric }) {
 const { isDark } = useTheme();

 if (!open) return null

 return (
   <div className={isDark ? "mt-3 w-full rounded-2xl border border-white/10 bg-slate-900/80 shadow-sm overflow-hidden" : "mt-3 w-full rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)] overflow-hidden"}>
     <div className="px-4 py-4">
       {loading ? (
         <div className="py-6 text-center">
           <Loader2 size={22} className="animate-spin text-red-500 mx-auto mb-2" />
           <p className={isDark ? "text-sm font-bold text-slate-100" : "text-sm font-bold text-slate-950"}>
             Generating guide…
           </p>
         </div>
       ) : error ? (
         <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-xs font-medium">
           {error}
         </div>
       ) : rubric?.criteria?.length ? (
         <div className="space-y-2">
           <div className="flex items-center justify-between gap-3">
             <p className={isDark ? "text-[10px] font-black uppercase tracking-[0.2em] text-slate-400" : "text-[10px] font-black uppercase tracking-[0.2em] text-slate-500"}>
               Generated guide
             </p>
             <button
               type="button"
               onClick={onClose}
               className={isDark ? "text-xs font-bold text-slate-400 hover:text-slate-100" : "text-xs font-bold text-slate-500 hover:text-slate-950"}
             >
               Hide
             </button>
           </div>

           {rubric.criteria.map((criterion) => {
             const matchedCriterion = CRITERIA.find((item) => item.label.toLowerCase() === String(criterion.name || '').toLowerCase())
             const GuideIcon = matchedCriterion?.icon || Sparkles
             const colors = themeColors[matchedCriterion?.theme || 'red']

             return (
               <div
                 key={criterion.name}
                 className={isDark ? "rounded-xl border border-white/10 bg-slate-950/50 p-3" : "rounded-xl border border-slate-200 bg-slate-50/70 p-3"}
               >
                 <div className="flex items-start justify-between gap-3 mb-2">
                   <div className="flex items-start gap-3 min-w-0">
                     <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
                       <GuideIcon size={18} />
                     </div>

                     <div className="min-w-0">
                       <div className="flex items-center gap-2 flex-wrap">
                         <h3 className={isDark ? "text-sm font-black text-slate-100" : "text-sm font-black text-slate-950"}>
                           {criterion.name}
                         </h3>
                         <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${colors.bg} ${colors.text}`}>
                           {Math.round((criterion.weight || 0) * 100)}%
                         </span>
                       </div>

                       <p className={isDark ? "text-xs font-medium text-slate-400 mt-1" : "text-xs font-medium text-slate-600 mt-1"}>
                         {compactGuideText(criterion.description, 7)}
                       </p>
                     </div>
                   </div>
                 </div>

                 <div className="flex flex-wrap gap-1.5 mb-2">
                   {(criterion.what_to_look_for || []).slice(0, 1).map((item) => (
                     <span
                       key={item}
                       className={isDark ? `rounded-full bg-slate-900 px-2 py-1 text-[11px] font-semibold ${colors.text}` : `rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold ${colors.bg} ${colors.text}`}
                     >
                       {compactGuideText(item, 6)}
                     </span>
                   ))}
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                   {Object.entries(criterion.scoring_guide || {}).map(([range, text]) => (
                     <div
                       key={range}
                       className={isDark ? "rounded-lg border border-white/10 bg-slate-900/70 p-2" : "rounded-lg border border-slate-200 bg-white p-2"}
                     >
                       <p className={`text-[10px] font-black ${colors.text}`}>{range}</p>
                       <p className={isDark ? "text-[11px] font-semibold text-slate-300" : "text-[11px] font-semibold text-slate-600"}>
                         {compactGuideText(text, 5)}
                       </p>
                     </div>
                   ))}
                 </div>
               </div>
             )
           })}
         </div>
       ) : (
         <div className="py-6 text-center text-sm text-slate-500">
           Click AI Scoring Guide again.
         </div>
       )}
     </div>
   </div>
 )
}


function TeamQueueSidebar({ teams, selectedId, submittedIds, onSelect }) {
 const { isDark } = useTheme();

 return (
   <aside className={isDark ? "w-[300px] shrink-0 bg-slate-900/90 border-r border-white/10 text-slate-100 backdrop-blur flex flex-col hidden lg:flex h-full overflow-y-auto" : "w-[300px] shrink-0 bg-white/90 border-r border-slate-200 text-slate-950 backdrop-blur flex flex-col hidden lg:flex h-full overflow-y-auto"}>
     <div className="p-5 border-b border-slate-200/70">
       <div className="flex items-center justify-between mb-3">
         <p className={isDark ? "text-[10px] font-black uppercase tracking-[0.2em] text-slate-400" : "text-[10px] font-black uppercase tracking-[0.2em] text-slate-500"}>
           Progress
         </p>
         <p className="text-[11px] font-black text-red-500">
           {submittedIds.length}/{teams.length}
         </p>
       </div>
       <div className={isDark ? "h-2 rounded-full bg-slate-800 overflow-hidden" : "h-2 rounded-full bg-slate-100 overflow-hidden"}>
         <div
           className="h-full rounded-full bg-red-500 transition-all"
           style={{ width: `${teams.length ? (submittedIds.length / teams.length) * 100 : 0}%` }}
         />
       </div>
     </div>

     <div className="p-4 space-y-3">
       <p className={isDark ? "text-[10px] font-black uppercase tracking-[0.2em] text-slate-400" : "text-[10px] font-black uppercase tracking-[0.2em] text-slate-500"}>
         Assigned Teams
       </p>

       {teams.map((team, index) => {
         const isSelected = team.team_id === selectedId
         const isSubmitted = submittedIds.includes(team.team_id)

         return (
           <button
             key={team.team_id}
             type="button"
             onClick={() => onSelect(team)}
             className={
               isSelected
                 ? "w-full rounded-xl border border-red-300 bg-red-50 p-4 text-left transition-colors"
                 : isDark
                   ? "w-full rounded-xl border border-white/10 bg-slate-900/70 p-4 text-left hover:border-red-400/50 transition-colors"
                   : "w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-red-300 transition-colors"
             }
           >
             <div className="flex items-center justify-between gap-3">
               <div className="flex items-center gap-3 min-w-0">
                 <span className={isSubmitted ? "w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" : index % 2 === 0 ? "w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" : "w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"} />
                 <div className="min-w-0">
                   <p className={isDark ? "text-sm font-black text-slate-100 truncate" : "text-sm font-black text-slate-950 truncate"}>
                     {team.team_name}
                   </p>
                   <p className={isSubmitted ? "text-[11px] font-bold text-emerald-600" : "text-[11px] font-bold text-slate-500"}>
                     {isSubmitted ? "Score submitted" : "Awaiting your score"}
                   </p>
                 </div>
               </div>
               <ChevronRight size={16} className={isSelected ? "text-red-500" : "text-slate-400"} />
             </div>
           </button>
         )
       })}
     </div>
   </aside>
 )
}


function JudgePortalContent() {
  const { isDark } = useTheme();

 const { eventId } = useParams();
 useEffect(() => {
 if (eventId) eventStorage.set(eventId)
 }, [eventId])
 const { setToken } = useAuth()
 const [selectedTeam, setSelectedTeam] = useState(null)
 const [submittedIds, setSubmittedIds] = useState([])
 const [aiRubric, setAiRubric] = useState(null)
 const [aiRubricError, setAiRubricError] = useState('')
 

 const [showScoringGuide, setShowScoringGuide] = useState(false)
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

 const rubricMutation = useMutation({
  mutationFn: async () => {
    if (!selectedTeam) {
      throw new Error('Select a team before generating the scoring guide.')
    }

    const criteriaWeights = Object.fromEntries(
      CRITERIA.map((c) => [c.label, c.weight])
    )

    const enqueue = await evaluationsApi.aiRubric({
      challenge_area: 'Hackathon project evaluation',
      criteria: criteriaWeights,
      event_name: 'WiSE@TI Hackathon',
      team_context: {
        team_id: selectedTeam.team_id,
        team_name: selectedTeam.team_name,
      },
    }, urlToken)

    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      try {
        const result = await evaluationsApi.aiRubricResult(enqueue.task_id, urlToken)
        return result
      } catch (err) {
        if (!err.message?.includes('still generating')) {
          throw err
        }
      }
    }

    throw new Error('AI scoring guide generation timed out. Please try again.')
  },
  onSuccess: (result) => {
    setAiRubric(result)
    setAiRubricError('')
  },
  onError: (err) => {
    setAiRubricError(err.message || 'Failed to generate AI scoring guide.')
  },
 })

 useEffect(() => {
 if (!rawUrlToken || !evaluatorPortalTokenKey) return
 sessionStorage.setItem(evaluatorPortalTokenKey, rawUrlToken)
 setToken(rawUrlToken)
 }, [rawUrlToken, evaluatorPortalTokenKey, setToken])

 const { data: portalData, isLoading, error } = useQuery({
 queryKey: ['portal-access', urlToken],
 queryFn: () => portalApi.access(urlToken),
 enabled: !!urlToken ,
 retry: false,
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
 <div className={isDark ? "h-screen overflow-hidden flex items-center justify-center bg-[#0b0f14]" : "h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-white"}>
 <div className="text-center">
 <Loader2 size={32} className="text-red-500 animate-spin mx-auto mb-3" />
 <p className={isDark ? "text-sm font-medium text-slate-400" : "text-sm font-medium text-slate-500"}>Loading your evaluation portal…</p>
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

const currentStage = portalData?.stage
const evaluationStageOpen = !currentStage || currentStage === 'evaluation'

if (!evaluationStageOpen) {
 return (
 <FullPageMessage
 icon={AlertTriangle}
 title="Evaluation stage has not started yet"
 message={`You are authorized, but evaluations are locked until the event reaches the Evaluation stage. Current stage: ${formatStageLabel(currentStage)}.`}
 />
 )
}

const teams = portalData?.assigned_teams ?? []
const evaluatorName = portalData?.name ?? 'Evaluator'

 function handleTeamSelect(team) {
 setSelectedTeam(team)
 setAiRubric(null)
 setAiRubricError('')
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

 function handleOpenScoringGuide() {
  setShowScoringGuide(true)

  if (!aiRubric && !rubricMutation.isPending) {
    rubricMutation.mutate()
  }
 }

 // ── Main layout ──────────────────────────────────────────────────────────

 return (
 <div className={isDark ? "min-h-screen bg-[#0b0f14] text-slate-100 font-sans relative overflow-x-hidden" : "min-h-screen bg-[#f8fbff] text-slate-950 font-sans relative overflow-x-hidden"}>

 {/* Background Dots */}
 <div className="pointer-events-none absolute left-24 top-24 h-36 w-28 opacity-25 [background-image:radial-gradient(#bfdbfe_1.5px,transparent_1.5px)] [background-size:16px_16px]" />
 <div className="pointer-events-none absolute right-20 bottom-28 h-36 w-28 opacity-25 [background-image:radial-gradient(#bbf7d0_1.5px,transparent_1.5px)] [background-size:16px_16px]" />

 <PortalNavbar evaluatorName={evaluatorName} token={urlToken} />

 <div className="flex h-[calc(100vh-72px)] overflow-hidden">
 <TeamQueueSidebar
 teams={teams}
 selectedId={selectedTeam?.team_id}
 submittedIds={[
 ...submittedIds,
 ...teams.filter((t) => t.already_graded).map((t) => t.team_id),
 ]}
 onSelect={handleTeamSelect}
 />

 <main data-judge-scroll="true" className="flex-1 min-w-0 px-4 py-8 md:px-8 w-full max-w-none z-10 relative h-full overflow-y-auto">

 {/* Empty State */}
 {!selectedTeam && (
 <div className="flex flex-col items-center pt-10 pb-20">
 <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-6">
 <ClipboardList size={40} />
 </div>
 <h2 className={isDark ? "text-2xl font-black text-slate-100 mb-3" : "text-2xl font-black text-slate-950 mb-3"}>Select a team to evaluate</h2>
 <p className={isDark ? "text-sm font-medium text-slate-400 mb-12 max-w-sm text-center" : "text-sm font-medium text-slate-500 mb-12 max-w-sm text-center"}>Choose a team from the queue on the left to begin your evaluation.</p>

 <div className={isDark ? "bg-slate-900/80 border border-white/10 rounded-[22px] p-8 shadow-none w-full max-w-2xl" : "bg-white/95 border border-slate-200 rounded-[22px] p-8 shadow-[0_18px_45px_rgba(15,23,42,0.06)] w-full max-w-2xl"}>
 <p className={isDark ? "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6" : "text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6"}>GRADING CRITERIA & WEIGHTS</p>

 <div className="space-y-5">
 {CRITERIA.map(c => (
 <div key={c.key} className="flex items-center gap-4">
 <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${themeColors[c.theme].bg} ${themeColors[c.theme].text}`}>
 <c.icon size={20} />
 </div>
 <span className={isDark ? "text-sm font-bold text-slate-100 shrink-0" : "text-sm font-bold text-slate-950 shrink-0"}>{c.label}</span>
 <div className="flex-1 min-w-0 border-b border-dashed border-slate-200-1"></div>
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
 <ScoringGuideCard
     onOpen={handleOpenScoringGuide}
     loading={rubricMutation.isPending}
     />
     <ScoringGuideModal
     open={showScoringGuide}
     onClose={() => setShowScoringGuide(false)}
     loading={rubricMutation.isPending}
     error={aiRubricError}
     rubric={aiRubric}
     />
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

export default function JudgePortal() {
 return <JudgePortalContent />
}


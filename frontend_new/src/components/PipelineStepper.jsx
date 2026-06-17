// src/components/PipelineStepper.jsx
// Displays creator-defined stages only. If no stages exist yet, the dashboard
// should not show the old hardcoded pipeline.
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  GitBranch,
  Loader2,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react'
import { eventsApi, eventStorage, stagesApi } from '../services/api'

const ICONS = [Users, GitBranch, ClipboardList, Trophy, CalendarDays]

function SkeletonStepper() {
  return (
    <div className="glass-card border border-slate-200 rounded-xl p-5">
      <div className="h-4 w-40 bg-slate-200 rounded animate-pulse mb-5" />
      <div className="flex items-center">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
            {i < 3 && <div className="flex-1 h-0.5 bg-slate-200 mx-1" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function StageNode({ stage, status, isLast, index }) {
  const Icon = ICONS[index % ICONS.length]

  const ring = {
    completed: 'border-teal-500 bg-teal-50',
    active: 'border-indigo-600 bg-indigo-600',
    pending: 'border-slate-200 bg-slate-50',
  }[status]

  const iconColor = {
    completed: 'text-teal-600',
    active: 'text-white',
    pending: 'text-slate-400',
  }[status]

  const labelColor = {
    completed: 'text-teal-700 font-semibold',
    active: 'text-indigo-700 font-semibold',
    pending: 'text-slate-500 font-normal',
  }[status]

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-col items-center shrink-0">
        <div className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center ${ring}`}>
          {status === 'active' && (
            <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-30" />
          )}
          {status === 'completed'
            ? <CheckCircle size={18} className={iconColor} />
            : <Icon size={18} className={iconColor} />}
        </div>

        <div className="mt-2 text-center px-1 hidden sm:block w-28">
          <p className={`text-xs truncate ${labelColor}`}>{stage.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-tight line-clamp-2">
            {stage.description || stage.key}
          </p>
        </div>
      </div>

      {!isLast && (
        <div className={`flex-1 h-0.5 mx-1 transition-colors ${
          status === 'completed' ? 'bg-teal-400' : 'bg-gray-200'
        }`} />
      )}
    </div>
  )
}

export default function PipelineStepper({ showAdvanceButton = false, className = '' }) {
  const qc = useQueryClient()
  const activeEventId = eventStorage.get()

  const { data: events = [] } = useQuery({
    queryKey: ['events', 'list'],
    queryFn: () => eventsApi.list(),
  })

  const { data: stages = [], isLoading: stagesLoading, isFetching } = useQuery({
    queryKey: ['stages', 'list', activeEventId],
    queryFn: () => stagesApi.list(),
    enabled: !!activeEventId,
    refetchInterval: 30_000,
  })

  const { data: runs = [] } = useQuery({
    queryKey: ['stages', 'runs', activeEventId],
    queryFn: () => stagesApi.runs(),
    enabled: !!activeEventId,
    refetchInterval: 30_000,
  })

  const activeEvent = events.find((event) => event.id === activeEventId)
  const eventName = activeEvent?.name || 'Selected event'

  const sortedStages = useMemo(
    () => {
      const safeStages = Array.isArray(stages) ? stages : []
      return [...safeStages]
        .filter((stage) => stage.is_active !== false)
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    },
    [stages]
  )

  const runByStage = useMemo(() => {
    const safeRuns = Array.isArray(runs) ? runs : []
    const map = {}
    for (const run of safeRuns) map[run.stage_definition_id] = run
    return map
  }, [runs])

  const activeIndex = useMemo(() => {
    const byRun = sortedStages.findIndex((stage) => runByStage[stage.id]?.status === 'active')
    if (byRun >= 0) return byRun
    const firstPending = sortedStages.findIndex((stage) => runByStage[stage.id]?.status !== 'completed')
    return firstPending >= 0 ? firstPending : Math.max(sortedStages.length - 1, 0)
  }, [runByStage, sortedStages])

  const activeStage = sortedStages[activeIndex]

  const advanceMutation = useMutation({
    mutationFn: () => stagesApi.advance(activeStage.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stages'] })
    },
  })

  if (stagesLoading) return <SkeletonStepper />

  if (!activeEventId) return null

  if (sortedStages.length === 0) {
    return (
      <div className={`glass-card border border-amber-200 bg-amber-50 rounded-xl p-5 shadow-sm ${className}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{eventName}</h3>
            <p className="text-sm text-amber-800 mt-1">
              Stages have not yet been created for this event.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Open the Timeline tab, add active stages, then generate runs and publish the event.
            </p>
          </div>
          {isFetching && <RefreshCw size={14} className="text-amber-700 animate-spin shrink-0" />}
        </div>
      </div>
    )
  }

  return (
    <div className={`glass-card border border-slate-200 rounded-xl p-5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{eventName}</h3>
            {isFetching && <RefreshCw size={12} className="text-slate-500 animate-spin shrink-0" />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Stage {activeIndex + 1} of {sortedStages.length} —{' '}
            <span className="text-indigo-600 font-medium">
              {activeStage?.name || 'Not started'}
            </span>
          </p>
        </div>

        {showAdvanceButton && activeStage && (
          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg btn-primary text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {advanceMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
            {advanceMutation.isPending ? 'Advancing...' : 'Advance Stage'}
          </button>
        )}
      </div>

      <div className="flex items-start">
        {sortedStages.map((stage, index) => {
          const runStatus = runByStage[stage.id]?.status
          let status = 'pending'
          if (runStatus === 'completed') status = 'completed'
          else if (runStatus === 'active' || index === activeIndex) status = 'active'
          else if (index < activeIndex) status = 'completed'

          return (
            <StageNode
              key={stage.id}
              stage={stage}
              index={index}
              status={status}
              isLast={index === sortedStages.length - 1}
            />
          )
        })}
      </div>

      {advanceMutation.isError && (
        <p className="mt-3 text-xs text-red-500">
          {advanceMutation.error?.message || 'Failed to advance stage.'}
        </p>
      )}
    </div>
  )
}
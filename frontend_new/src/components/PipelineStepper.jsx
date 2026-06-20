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
    <div className="app-card p-5">
      <div className="h-4 w-40 rounded animate-pulse mb-5" style={{ backgroundColor: 'var(--bg-card-soft)' }} />
      <div className="flex items-center">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="w-10 h-10 rounded-full animate-pulse shrink-0" style={{ backgroundColor: 'var(--bg-card-soft)' }} />
            {i < 3 && <div className="flex-1 h-0.5 mx-1" style={{ backgroundColor: 'var(--color-border)' }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function StageNode({ stage, status, isLast, index }) {
  const Icon = ICONS[index % ICONS.length]

  const ringStyle = {
    completed: {
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.1)',
    },
    active: {
      borderColor: '#22c55e',
      backgroundColor: '#22c55e',
    },
    pending: {
      borderColor: 'var(--color-border)',
      backgroundColor: 'var(--bg-card-soft)',
    },
  }[status]

  const iconStyle = {
    completed: { color: '#22c55e' },
    active: { color: '#ffffff' },
    pending: { color: 'var(--text-muted)' },
  }[status]

  const labelStyle = {
    completed: { color: '#22c55e', fontWeight: 600 },
    active: { color: '#22c55e', fontWeight: 600 },
    pending: { color: 'var(--text-muted)', fontWeight: 400 },
  }[status]

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-col items-center shrink-0">
        <div
          className="relative w-10 h-10 rounded-full border-2 flex items-center justify-center"
          style={ringStyle}
        >
          {status === 'active' && (
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ backgroundColor: 'var(--color-primary-light)' }}
            />
          )}
          {status === 'completed'
            ? <CheckCircle size={18} style={iconStyle} />
            : <Icon size={18} style={iconStyle} />}
        </div>

        <div className="mt-2 text-center px-1 hidden sm:block w-28">
          <p className="text-xs truncate" style={labelStyle}>{stage.name}</p>
          <p className="text-xs mt-0.5 leading-tight line-clamp-2" style={{ color: 'var(--text-muted)' }}>
            {stage.description || stage.key}
          </p>
        </div>
      </div>

      {!isLast && (
        <div
          className="flex-1 h-0.5 mx-1 transition-colors"
          style={{
            backgroundColor: status === 'completed' ? '#22c55e' : 'var(--color-border)',
          }}
        />
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
    mutationFn: () => stagesApi.advanceRun(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stages', 'runs', activeEventId] })
      qc.invalidateQueries({ queryKey: ['stages', 'list', activeEventId] })
      qc.invalidateQueries({ queryKey: ['event-state', activeEventId] })
    },
})

  if (stagesLoading) return <SkeletonStepper />

  if (!activeEventId) return null

  if (sortedStages.length === 0) {
    return (
      <div className={`app-card p-5 ${className}`} style={{ borderLeft: '3px solid var(--color-warning)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{eventName}</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--color-warning)' }}>
              Stages have not yet been created for this event.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Open the Timeline tab, add active stages, then generate runs and publish the event.
            </p>
          </div>
          {isFetching && <RefreshCw size={14} className="animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>
    )
  }

  return (
    <div className={`app-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>{eventName}</h3>
            {isFetching && <RefreshCw size={12} className="animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Stage {activeIndex + 1} of {sortedStages.length} —{' '}
            <span style={{ color: '#ef4444', fontWeight: 500 }}>
              {activeStage?.name || 'Not started'}
            </span>
          </p>
        </div>

        {showAdvanceButton && activeStage && (
          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg text-white border-none cursor-pointer transition-all shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#ef4444' }}
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
        <p className="mt-3 text-xs" style={{ color: 'var(--color-danger)' }}>
          {advanceMutation.error?.response?.data?.detail || advanceMutation.error?.message || 'Failed to advance stage.'}
        </p>
      )}
    </div>
  )
}
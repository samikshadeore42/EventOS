// src/components/PipelineStepper.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  Circle,
  Loader2,
  Users,
  GitBranch,
  ClipboardList,
  Trophy,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { eventApi } from '../services/api'

// Each stage has a fixed icon; status decides the colour ring
const STAGE_META = [
  {
    key:         'registration',
    label:       'Registration',
    description: 'CSV intake & roster verification',
    Icon:        Users,
  },
  {
    key:         'team_formation',
    label:       'Team Formation',
    description: 'Algorithmic assignment & approval',
    Icon:        GitBranch,
  },
  {
    key:         'evaluation',
    label:       'Evaluation',
    description: 'Judge scoring & anomaly review',
    Icon:        ClipboardList,
  },
  {
    key:         'results',
    label:       'Results',
    description: 'Leaderboard & progression invites',
    Icon:        Trophy,
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────

function StageNode({ meta, status, isLast }) {
  const { Icon } = meta

  const ring = {
    completed: 'border-teal-500  bg-teal-50',
    active:    'border-indigo-600 bg-indigo-600',
    pending:   'border-gray-200   bg-gray-50',
  }[status]

  const iconColor = {
    completed: 'text-teal-500',
    active:    'text-white',
    pending:   'text-gray-300',
  }[status]

  const labelColor = {
    completed: 'text-teal-700  font-semibold',
    active:    'text-indigo-700 font-semibold',
    pending:   'text-gray-400   font-normal',
  }[status]

  return (
    <div className="flex items-center flex-1 min-w-0">
      {/* Node */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center ${ring}`}>
          {status === 'active' && (
            <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-30" />
          )}
          {status === 'completed'
            ? <CheckCircle size={18} className={iconColor} />
            : <Icon size={18} className={iconColor} />
          }
        </div>

        <div className="mt-2 text-center px-1 hidden sm:block w-24">
          <p className={`text-xs truncate ${labelColor}`}>{meta.label}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-tight line-clamp-2">
            {meta.description}
          </p>
        </div>
      </div>

      {/* Connector */}
      {!isLast && (
        <div className={`flex-1 h-0.5 mx-1 transition-colors ${
          status === 'completed' ? 'bg-teal-400' : 'bg-gray-200'
        }`} />
      )}
    </div>
  )
}

function SkeletonStepper() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="flex items-center">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse shrink-0" />
            {i < 4 && <div className="flex-1 h-0.5 bg-gray-100 mx-1" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PipelineStepper({ showAdvanceButton = false, className = '' }) {
  const qc = useQueryClient()

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey:        ['event-config'],
    queryFn:         eventApi.config,
    refetchInterval: 30_000,
  })

  const advanceMutation = useMutation({
    mutationFn: () => eventApi.advanceStage(),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['event-config'] }),
  })

  if (isLoading) return <SkeletonStepper />

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 ${className}`}>
        Could not load pipeline state. The backend may be starting up.
      </div>
    )
  }

  const currentIndex = data?.current_stage_index ?? 0
  const isAtLast     = currentIndex >= (data?.total_stages ?? 4) - 1

  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 ${className}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {data?.event_name ?? 'EventOS'}
            </h3>
            {isFetching && (
              <RefreshCw size={12} className="text-gray-400 animate-spin shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Stage {currentIndex + 1} of {data?.total_stages ?? 4} —{' '}
            <span className="text-indigo-600 font-medium capitalize">
              {(data?.current_stage ?? 'registration').replace('_', ' ')}
            </span>
          </p>
        </div>

        {showAdvanceButton && !isAtLast && (
          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0 ml-4"
          >
            {advanceMutation.isPending
              ? <Loader2 size={12} className="animate-spin" />
              : <ChevronRight size={12} />
            }
            {advanceMutation.isPending ? 'Advancing…' : 'Advance Stage'}
          </button>
        )}
      </div>

      {/* Stage track */}
      <div className="flex items-start">
        {STAGE_META.map((meta, index) => {
          const stageEntry = data?.pipeline?.[index]
          const status     = stageEntry?.status ?? 'pending'
          return (
            <StageNode
              key={meta.key}
              meta={meta}
              status={status}
              isLast={index === STAGE_META.length - 1}
            />
          )
        })}
      </div>

      {/* Mutation error */}
      {advanceMutation.isError && (
        <p className="mt-3 text-xs text-red-500">
          {advanceMutation.error?.message ?? 'Failed to advance stage.'}
        </p>
      )}
    </div>
  )
}
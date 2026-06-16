// src/components/StageTimelinePanel.jsx
// Phase 4/6 committee panel. Shows the stage timeline, a live Hard-Gate validation
// banner, a Publish button that surfaces violations on 422, and an approvals
// section for stages parked in `awaiting_approval` by the automatic engine.
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, AlertTriangle, Loader2, Rocket, ShieldCheck, Clock,
} from 'lucide-react'
import { stagesApi, eventLifecycleApi, eventsApi, eventStorage } from '../services/api'

export default function StageTimelinePanel({ eventStatus }) {
  const qc = useQueryClient()

  // Derive the active event's status if the parent didn't pass one in.
  const { data: events = [] } = useQuery({
    queryKey: ['events', 'list'],
    queryFn: () => eventsApi.list().then((r) => r.data),
    enabled: eventStatus === undefined,
  })
  const activeEventId = eventStorage.get()
  const derivedStatus = events.find((e) => e.id === activeEventId)?.status
  const status = eventStatus ?? derivedStatus
  // If we genuinely can't tell the status, still offer publish (gated by
  // validation); the backend returns 409 if it isn't a draft and we show it.
  const canPublish = status === 'draft' || status === undefined

  const { data: stages = [] } = useQuery({
    queryKey: ['stages', 'list'],
    queryFn: () => stagesApi.list().then((r) => r.data),
  })
  const { data: runs = [] } = useQuery({
    queryKey: ['stages', 'runs'],
    queryFn: () => stagesApi.runs().then((r) => r.data),
  })
  const { data: validation } = useQuery({
    queryKey: ['stages', 'validation'],
    queryFn: () => stagesApi.validate().then((r) => r.data),
    refetchInterval: 15_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stages'] })
  }

  const publish = useMutation({
    mutationFn: () => eventLifecycleApi.publish(),
    onSuccess: invalidate,
  })
  const approve = useMutation({
    mutationFn: (stageId) => stagesApi.approve(stageId),
    onSuccess: invalidate,
  })

  // stage_definition_id -> run.status
  const runByStage = useMemo(() => {
    const m = {}
    for (const r of runs) m[r.stage_definition_id] = r
    return m
  }, [runs])

  const awaiting = stages.filter((s) => runByStage[s.id]?.status === 'awaiting_approval')
  const isValid = validation?.is_valid
  const violations = validation?.violations ?? []
  const publishErr = publish.error?.response?.data?.detail

  return (
    <div className="space-y-6">
      {/* Validation banner */}
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${
        isValid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}>
        {isValid
          ? <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" />
          : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
        <div className="flex-1">
          <p className="font-medium text-sm text-gray-800">
            {isValid ? 'Schedule is valid — ready to publish.' : 'Schedule has issues to fix before publishing.'}
          </p>
          {!isValid && violations.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-800 list-disc list-inside">
              {violations.map((v, i) => <li key={i}>{v.message}</li>)}
            </ul>
          )}
        </div>
        {canPublish && (
          <button
            onClick={() => publish.mutate()}
            disabled={!isValid || publish.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white
                       bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Publish event
          </button>
        )}
      </div>

      {/* Publish failure (e.g. 422 with violations, or 409 not-draft) */}
      {publish.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {typeof publishErr === 'string'
            ? publishErr
            : publishErr?.message || 'Publish failed.'}
          {Array.isArray(publishErr?.violations) && (
            <ul className="mt-1 list-disc list-inside text-xs">
              {publishErr.violations.map((v, i) => <li key={i}>{v.message}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Approvals (Phase 6) */}
      {awaiting.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-sm text-gray-800 mb-3">
            <Clock className="w-4 h-4 text-indigo-600" /> Stages awaiting approval
          </h3>
          <ul className="space-y-2">
            {awaiting.map((s) => (
              <li key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700">{s.name}</span>
                <button
                  onClick={() => approve.mutate(s.id)}
                  disabled={approve.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                             text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve & start
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        {stages.map((s) => {
          const runStatus = runByStage[s.id]?.status ?? (status === 'draft' ? 'not started' : 'pending')
          return (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  {s.position}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(s.start_at).toLocaleString()} → {new Date(s.end_at).toLocaleString()}
                    {' · '}{s.transition_policy}
                  </p>
                </div>
              </div>
              <StatusPill status={runStatus} />
            </div>
          )
        })}
        {stages.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No stages defined yet.</p>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    active: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    awaiting_approval: 'bg-amber-100 text-amber-700',
    pending: 'bg-gray-100 text-gray-500',
    skipped: 'bg-gray-100 text-gray-400',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {String(status).replace('_', ' ')}
    </span>
  )
}
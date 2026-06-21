// src/components/StageTimelinePanel.jsx
// Phase 4/6 committee panel. Creator-defined stage CRUD, reorder, validation,
// publish gate, run generation, and approval controls.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, AlertTriangle, Loader2, Rocket, ShieldCheck, Clock,Plus, Trash2, ArrowUp, ArrowDown, Save, X, Play,
} from 'lucide-react'
import { stagesApi, eventLifecycleApi, eventsApi, eventStorage } from '../services/api'

const DEFAULT_TZ = 'Asia/Kolkata'
const INPUT_CLASS = 'app-input bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-950 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
const CAPABILITY_OPTIONS = [
  { key: 'teams', label: 'Teams' },
  { key: 'mentors', label: 'Mentors' },
  { key: 'evaluators', label: 'Evaluators / judges' },
  { key: 'problem_statements', label: 'Problem statements' },
  { key: 'submissions', label: 'Submissions' },
  { key: 'weighted_scoring', label: 'Weighted scoring' },
  { key: 'live_scoring', label: 'Live scoring' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'risk_monitoring', label: 'Risk monitoring' },
  { key: 'presentation_evaluation', label: 'Presentation evaluation' },
  { key: 'matches', label: 'Matches' },
  { key: 'fixtures', label: 'Fixtures' },
  { key: 'elimination', label: 'Elimination' },
]

const NOTIFICATION_ROLE_OPTIONS = [
  { key: 'participants', label: 'Participants' },
  { key: 'mentors', label: 'Mentors' },
  { key: 'judges', label: 'Judges' },
  { key: 'all', label: 'All' },
]

const REMINDER_TIME_OPTIONS = [
  { key: 'start', label: 'When the stage starts', minutes: null },
  { key: '1440', label: '1 day before ending time', minutes: 1440 },
  { key: '360', label: '6 hours before ending time', minutes: 360 },
  { key: '60', label: '1 hour before ending time', minutes: 60 },
  { key: '30', label: '30 mins before ending time', minutes: 30 },
  { key: '10', label: '10 mins before ending time', minutes: 10 },
  { key: '5', label: '5 mins before ending time', minutes: 5 },
]

function toDatetimeLocal(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function defaultStageForm(position = 1) {
  const start = new Date(Date.now() + 60 * 60 * 1000)
  const end = new Date(Date.now() + 2 * 60 * 60 * 1000)
  return {
    id: null,
    key: '',
    name: '',
    description: '',
    position,
    start_at: toDatetimeLocal(start.toISOString()),
    end_at: toDatetimeLocal(end.toISOString()),
    timezone: DEFAULT_TZ,
    transition_policy: 'manual',
    required_capabilities: '',
    notify_roles: [],
    reminder_times: [],
    is_active: true,
  }
}

function stageToForm(stage) {
  return {
    id: stage.id,
    key: stage.key || '',
    name: stage.name || '',
    description: stage.description || '',
    position: stage.position || 1,
    start_at: toDatetimeLocal(stage.start_at),
    end_at: toDatetimeLocal(stage.end_at),
    timezone: stage.timezone || DEFAULT_TZ,
    transition_policy: stage.transition_policy || 'manual',
    required_capabilities: (stage.required_capabilities || []).join(', '),
    notify_roles: stage.reminder_policy?.notify_roles || [],
    reminder_times: [
      ...(stage.reminder_policy?.notify_on_start ? ['start'] : []),
      ...((stage.reminder_policy?.warn_before_minutes || []).map(String)),
    ],
    is_active: stage.is_active !== false,
  }
}

function buildPayload(form) {
  const warnMinutes = form.reminder_times
    .filter((value) => value !== 'start')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))

  const reminderPolicy = {
    notify_roles: form.notify_roles || [],
    warn_before_minutes: warnMinutes,
    notify_on_start: form.reminder_times.includes('start'),
  }

  const startAt = fromDatetimeLocal(form.start_at)
  const endAt = fromDatetimeLocal(form.end_at)
  if (!startAt || !endAt) throw new Error('Start and end time are required.')
  if (new Date(endAt) <= new Date(startAt)) throw new Error('End time must be after start time.')

  const key = form.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (!key) throw new Error('Stage key is required.')
  if (!form.name.trim()) throw new Error('Stage name is required.')

  return {
    key,
    name: form.name.trim(),
    description: form.description.trim() || null,
    position: Number(form.position),
    start_at: startAt,
    end_at: endAt,
    timezone: form.timezone || DEFAULT_TZ,
    transition_policy: form.transition_policy,
    reminder_policy: reminderPolicy,
    required_capabilities: form.required_capabilities
      .split(',')
      .map((cap) => cap.trim())
      .filter(Boolean),
    is_active: form.is_active,
  }
}

function selectedCapabilities(value) {
  return new Set(
    value
      .split(',')
      .map((cap) => cap.trim())
      .filter(Boolean)
  )
}



export default function StageTimelinePanel({ eventStatus }) {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(defaultStageForm())
  const [formError, setFormError] = useState('')

  const { data: events = [] } = useQuery({
    queryKey: ['events', 'list'],
    queryFn: () => eventsApi.list(),
    enabled: eventStatus === undefined,
  })
  const activeEventId = eventStorage.get()
  const derivedStatus = events.find((e) => e.id === activeEventId)?.status
  const status = eventStatus ?? derivedStatus
  const canPublish = status === 'draft' || status === undefined

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ['stages', 'list', activeEventId],
    queryFn: () => stagesApi.list(),
  })
  const { data: runs = [] } = useQuery({
    queryKey: ['stages', 'runs', activeEventId],
    queryFn: () => stagesApi.runs(),
  })
  const { data: validation } = useQuery({
    queryKey: ['stages', 'validation', activeEventId],
    queryFn: () => stagesApi.validate(),
    refetchInterval: 15_000,
  })

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => Number(a.position) - Number(b.position)),
    [stages]
  )

  const nextPosition = sortedStages.length
    ? Math.max(...sortedStages.map((s) => Number(s.position || 0))) + 1
    : 1

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stages'] })
    qc.invalidateQueries({ queryKey: ['events', 'list'] })
  }

  const publish = useMutation({
    mutationFn: () => eventLifecycleApi.publish(),
    onSuccess: invalidate,
  })
  const approve = useMutation({
    mutationFn: (stageId) => stagesApi.approve(stageId),
    onSuccess: invalidate,
  })

  const generateRuns = useMutation({
    mutationFn: () => stagesApi.generateRuns(),
    onSuccess: invalidate,
  })

  const saveStage = useMutation({
    mutationFn: () => {
      const payload = buildPayload(form)
      return form.id ? stagesApi.update(form.id, payload) : stagesApi.create(payload)
    },
    onSuccess: () => {
      setFormOpen(false)
      setForm(defaultStageForm(nextPosition))
      setFormError('')
      invalidate()
    },
    onError: (err) => setFormError(err.message || 'Failed to save stage.'),
  })
  const deleteStage = useMutation({
    mutationFn: (id) => stagesApi.remove(id),
    onSuccess: invalidate,
  })
  const reorder = useMutation({
    mutationFn: (orderedIds) => stagesApi.reorder(orderedIds),
    onSuccess: invalidate,
  })

  // stage_definition_id -> run.status
  const runByStage = useMemo(() => {
    const m = {}
    for (const r of runs) m[r.stage_definition_id] = r
    return m
  }, [runs])

  const awaiting = sortedStages.filter((s) => runByStage[s.id]?.status === 'awaiting_approval')
  const isValid = validation?.is_valid
  const violations = validation?.violations ?? []
  const publishErr = publish.error?.message

  function startCreate() {
    setForm(defaultStageForm(nextPosition))
    setFormError('')
    setFormOpen(true)
  }
  function startEdit(stage) {
    setForm(stageToForm(stage))
    setFormError('')
    setFormOpen(true)
  }
  function moveStage(index, direction) {
    const target = index + direction
    if (target < 0 || target >= sortedStages.length) return
    const reordered = [...sortedStages]
    const [item] = reordered.splice(index, 1)
    reordered.splice(target, 0, item)
    reorder.mutate(reordered.map((s) => s.id))
  }

  function toggleArrayValue(values = [], value) {
    return values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value]
  }

  function toggleCapability(capability) {
    setForm((f) => ({
      ...f,
      required_capabilities: toggleArrayValue(
        f.required_capabilities?.split(',').map((c) => c.trim()).filter(Boolean),
        capability
      ).join(', '),
    }))
  }




  return (
    <div className="w-full">
      {/* Validation banner */}
      <div className={`flex items-center justify-between px-6 py-4 rounded-[16px] border ${
        isValid
          ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/25'
          : 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25'
      }`}>
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            isValid ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
          }`}>
            {isValid ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div>
            <p className="font-extrabold text-sm text-slate-950 dark:text-slate-100">
              {isValid ? 'Schedule is valid — ready to publish.' : 'Schedule has issues to fix before publishing.'}
            </p>
            {!isValid && violations.length > 0 && (
              <ul className="mt-1 space-y-1 text-xs font-semibold text-amber-700 dark:text-amber-300 list-disc list-inside">
                {violations.map((v, i) => <li key={i}>{v.message}</li>)}
              </ul>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => generateRuns.mutate()}
            disabled={generateRuns.isPending || sortedStages.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-white text-blue-600 border border-slate-200 dark:bg-[#1e293b] dark:text-blue-400 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-blue-500/10 px-5 text-sm font-extrabold shadow-sm transition disabled:opacity-50"
          >
            {generateRuns.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate runs
          </button>
          {canPublish && (
            <button
              onClick={() => publish.mutate()}
              disabled={!isValid || publish.isPending}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Publish event
            </button>
          )}
        </div>
      </div>

      {publish.isError && (
        <div className="p-3 text-sm rounded-xl bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/25">
          {publishErr || 'Publish failed.'}
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="mt-8 rounded-[20px] bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 shadow-[0_12px_32px_rgba(15,23,42,0.06)] dark:shadow-none px-6 py-6">
          <h3 className="flex items-center gap-2 font-extrabold text-sm mb-4 text-slate-950 dark:text-slate-100">
            <Clock className="w-5 h-5 text-orange-500" /> Stages awaiting approval
          </h3>
          <div className="space-y-3">
            {awaiting.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl px-5 py-3 bg-orange-50/50 border border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/25">
                <span className="text-sm font-extrabold text-slate-950 dark:text-slate-100">{s.name}</span>
                <button
                  onClick={() => approve.mutate(s.id)}
                  disabled={approve.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold text-white bg-amber-500 hover:bg-amber-600 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve & start
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-8 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[#111827] dark:shadow-none">
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950 dark:text-slate-100">Stage Definitions</h3>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mt-1">Create, edit, delete, and reorder creator-defined stages.</p>
          </div>
          <button
            onClick={startCreate}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add stage
          </button>
        </div>

        {formOpen && (
          <div className="p-4 bg-slate-50 dark:bg-[#1e293b] border-b border-slate-200 dark:border-white/10">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Key">
                <input
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="registration"
                />
              </Field>

              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="Registration"
                />
              </Field>

              <Field label="Position">
                <input
                  type="number"
                  min="1"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="Timezone">
                <input
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="Asia/Kolkata"
                />
              </Field>

              <Field label="Start">
                <input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="End">
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="Transition">
                <select
                  value={form.transition_policy}
                  onChange={(e) => setForm((f) => ({ ...f, transition_policy: e.target.value }))}
                  className={INPUT_CLASS}
                >
                  <option value="manual">Manual</option>
                  <option value="automatic">Automatic</option>
                </select>
              </Field>

              <Field label="Required capabilities">
                <div className="bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl p-3">
                  <div className="grid sm:grid-cols-2 gap-2">
                    {CAPABILITY_OPTIONS.map((capability) => {
                      const checked = selectedCapabilities(form.required_capabilities).has(capability.key)
                      return (
                        <label key={capability.key} className="flex items-center gap-2 text-xs text-slate-950 dark:text-slate-100">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setForm((f) => ({
                              ...f,
                              required_capabilities: toggleCapability(f.required_capabilities, capability.key),
                            }))}
                          />
                          <span>{capability.label}</span>
                          <span className="text-slate-600 dark:text-slate-400">({capability.key})</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                    Select only the capabilities this stage actually needs. The saved payload still uses system keys.
                  </p>
                </div>
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className={`${INPUT_CLASS} resize-none`}
                />
              </Field>

              <Field label="Notification recipients">
                <div className="bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl p-3">
                  <div className="grid sm:grid-cols-2 gap-2">
                    {NOTIFICATION_ROLE_OPTIONS.map((option) => (
                      <label key={option.key} className="flex items-center gap-2 text-xs text-slate-950 dark:text-slate-100">
                        <input
                          type="checkbox"
                          checked={(form.notify_roles || []).includes(option.key)}
                          onChange={() => setForm((f) => ({
                            ...f,
                            notify_roles: toggleArrayValue(f.notify_roles || [], option.key),
                          }))}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </Field>

              <Field label="Notification timing">
                <div className="bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl p-3">
                  <div className="grid sm:grid-cols-2 gap-2">
                    {REMINDER_TIME_OPTIONS.map((option) => (
                      <label key={option.key} className="flex items-center gap-2 text-xs text-slate-950 dark:text-slate-100">
                        <input
                          type="checkbox"
                          checked={(form.reminder_times || []).includes(option.key)}
                          onChange={() => setForm((f) => ({
                            ...f,
                            reminder_times: toggleArrayValue(f.reminder_times || [], option.key),
                          }))}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </Field>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-950 dark:text-slate-100">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active stage
            </label>

            {formError && (
              <p className="text-xs mt-3 text-red-500 dark:text-red-400">{formError}</p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setFormOpen(false)}
                className="app-btn-secondary !text-sm !px-3 !py-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>

              <button
                onClick={() => saveStage.mutate()}
                disabled={saveStage.isPending}
                className="app-btn-primary !text-sm !px-3 !py-2"
              >
                {saveStage.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {form.id ? 'Save changes' : 'Create stage'}
              </button>
            </div>
          </div>
        )}
        <div>
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-slate-600 dark:text-slate-400">Loading stages...</p>
          ) : sortedStages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-600 dark:text-slate-400">No stages defined yet.</p>
          ) : sortedStages.map((s, index) => {
            const runStatus = runByStage[s.id]?.status ?? (status === 'draft' ? 'not started' : 'pending')

            // Badge & Pill colors based on runStatus
            let badgeBg = 'bg-blue-50 dark:bg-blue-500/10'
            let badgeText = 'text-blue-600 dark:text-blue-400'
            if (runStatus === 'completed') {
              badgeBg = 'bg-emerald-50 dark:bg-emerald-500/10'
              badgeText = 'text-emerald-600 dark:text-emerald-400'
            } else if (runStatus === 'active') {
              badgeBg = 'bg-emerald-50 dark:bg-emerald-500/10'
              badgeText = 'text-emerald-600 dark:text-emerald-400'
            } else if (runStatus === 'awaiting_approval') {
              badgeBg = 'bg-orange-50 dark:bg-orange-500/10'
              badgeText = 'text-orange-600 dark:text-orange-400'
            }

            return (
              <div key={s.id} className={`flex items-center justify-between px-6 py-4 bg-white dark:bg-[#111827] ${index < sortedStages.length - 1 ? 'border-b border-slate-200 dark:border-white/10' : ''}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <span className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-extrabold ${badgeBg} ${badgeText}`}>
                    {s.position}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-slate-950 dark:text-slate-100 truncate">{s.name}</p>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate mt-0.5">
                      {new Date(s.start_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      {' → '}
                      {new Date(s.end_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      {' • '}{s.timezone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={runStatus} />
                  <button onClick={() => moveStage(index, -1)} disabled={index === 0 || reorder.isPending} className="inline-flex w-10 h-10 items-center justify-center rounded-xl border shadow-sm transition disabled:opacity-50 bg-white border-slate-200 hover:bg-slate-50 dark:bg-[#1e293b] dark:border-white/10 dark:hover:bg-[#2A2F38] dark:shadow-none text-emerald-600 dark:text-emerald-400" title="Move up">
                    <ArrowUp className="w-5 h-5" />
                  </button>
                  <button onClick={() => moveStage(index, 1)} disabled={index === sortedStages.length - 1 || reorder.isPending} className="inline-flex w-10 h-10 items-center justify-center rounded-xl border shadow-sm transition disabled:opacity-50 bg-white border-slate-200 hover:bg-slate-50 dark:bg-[#1e293b] dark:border-white/10 dark:hover:bg-[#2A2F38] dark:shadow-none text-blue-600 dark:text-blue-400" title="Move down">
                    <ArrowDown className="w-5 h-5" />
                  </button>
                  <button onClick={() => startEdit(s)} className="inline-flex w-10 h-10 items-center justify-center rounded-xl border shadow-sm transition disabled:opacity-50 bg-white border-slate-200 hover:bg-slate-50 dark:bg-[#1e293b] dark:border-white/10 dark:hover:bg-[#2A2F38] dark:shadow-none text-amber-500 dark:text-amber-400" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete stage "${s.name}"?`)) deleteStage.mutate(s.id)
                    }}
                    disabled={deleteStage.isPending}
                    className="inline-flex w-10 h-10 items-center justify-center rounded-xl border shadow-sm transition disabled:opacity-50 bg-white border-slate-200 hover:bg-slate-50 dark:bg-[#1e293b] dark:border-white/10 dark:hover:bg-[#2A2F38] dark:shadow-none text-red-500 dark:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function StatusPill({ status }) {
  if (status === 'completed') {
    return <span className="inline-flex items-center justify-center px-3 py-1 rounded-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25 text-xs font-extrabold capitalize">Completed</span>
  } else if (status === 'active') {
    return <span className="inline-flex items-center justify-center px-3 py-1 rounded-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25 text-xs font-extrabold capitalize">Running</span>
  } else if (status === 'awaiting_approval') {
    return <span className="inline-flex items-center justify-center px-3 py-1 rounded-[10px] bg-orange-50 text-orange-500 border border-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/25 text-xs font-extrabold capitalize">Awaiting approval</span>
  } else {
    return <span className="inline-flex items-center justify-center px-3 py-1 rounded-[10px] bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/25 text-xs font-extrabold capitalize">Pending</span>
  }
}
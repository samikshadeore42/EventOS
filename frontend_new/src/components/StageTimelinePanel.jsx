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
const INPUT_CLASS = 'app-input'
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
    reminder_policy: '{}',
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
    reminder_policy: JSON.stringify(stage.reminder_policy || {}, null, 2),
    is_active: stage.is_active !== false,
  }
}

function buildPayload(form) {
  let reminderPolicy
  try {
    reminderPolicy = form.reminder_policy.trim() ? JSON.parse(form.reminder_policy) : {}
  } catch {
    throw new Error('Reminder policy must be valid JSON.')
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

function toggleCapability(value, capability) {
  const selected = selectedCapabilities(value)
  if (selected.has(capability)) selected.delete(capability)
  else selected.add(capability)
  return [...selected].join(', ')
}

function reminderPolicyFromEnglish(text) {
  const normalized = text.toLowerCase()
  const beforeStartMinutes = []
  const beforeEndMinutes = []
  const notifyRoles = []

  const addRole = (role) => {
    if (!notifyRoles.includes(role)) notifyRoles.push(role)
  }

  if (normalized.includes('admin')) addRole('admin')
  if (normalized.includes('mentor')) addRole('mentor')
  if (normalized.includes('judge') || normalized.includes('evaluator')) addRole('evaluator')
  if (normalized.includes('participant')) addRole('participant')

  const durationRegex = /(\d+)\s*(day|days|hour|hours|hr|hrs|minute|minutes|min|mins)/g
  let match
  while ((match = durationRegex.exec(normalized)) !== null) {
    const amount = Number(match[1])
    const unit = match[2]
    let minutes = amount
    if (unit.startsWith('day')) minutes = amount * 24 * 60
    else if (unit.startsWith('hour') || unit.startsWith('hr')) minutes = amount * 60

    if (
      normalized.includes('before start') ||
      normalized.includes('before the stage starts') ||
      normalized.includes('before stage starts')
    ) {
      beforeStartMinutes.push(minutes)
    } else {
      beforeEndMinutes.push(minutes)
    }
  }

  return {
    ...(notifyRoles.length ? { notify_roles: notifyRoles } : {}),
    ...(beforeStartMinutes.length ? { before_start_minutes: [...new Set(beforeStartMinutes)] } : {}),
    ...(beforeEndMinutes.length ? { before_end_minutes: [...new Set(beforeEndMinutes)] } : {}),
  }
}

export default function StageTimelinePanel({ eventStatus }) {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(defaultStageForm())
  const [formError, setFormError] = useState('')
  const [reminderPrompt, setReminderPrompt] = useState('')

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
    setReminderPrompt('')
    setFormOpen(true)
  }
  function startEdit(stage) {
    setForm(stageToForm(stage))
    setFormError('')
    setReminderPrompt('')
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

  function generateReminderJson() {
    const policy = reminderPolicyFromEnglish(reminderPrompt)
    setForm((f) => ({ ...f, reminder_policy: JSON.stringify(policy, null, 2) }))
  }


  return (
    <div className="space-y-6">
      {/* Validation banner */}
      <div className={`p-4 flex items-start gap-3 ${isValid ? 'section-green' : 'section-yellow'}`}>
        {isValid
          ? <ShieldCheck className="w-5 h-5 mt-0.5" style={{ color: 'var(--color-success)' }} />
          : <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: 'var(--color-primary)' }} />}
        <div className="flex-1">
          <p className="font-medium text-sm" style={{ color: 'var(--text-main)' }}>{isValid ? 'Schedule is valid — ready to publish.' : 'Schedule has issues to fix before publishing.'}
          </p>
          {!isValid && violations.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs list-disc list-inside" style={{ color: 'var(--color-primary)' }}>
              {violations.map((v, i) => <li key={i}>{v.message}</li>)}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generateRuns.mutate()}
            disabled={generateRuns.isPending || sortedStages.length === 0}
            className="app-btn-secondary !text-sm !px-3 !py-2"
          >
            {generateRuns.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate runs
          </button>
          {canPublish && (
            <button
              onClick={() => publish.mutate()}
              disabled={!isValid || publish.isPending}
              className="app-btn-primary !text-sm !px-4 !py-2"
            >
              {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Publish event
            </button>
          )}
        </div>
      </div>

      {publish.isError && (
        <div className="app-card-soft p-3 text-sm" style={{ color: 'var(--color-danger)' }}>
          {publishErr || 'Publish failed.'}
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="app-card p-4">
          <h3 className="flex items-center gap-2 font-semibold text-sm mb-3" style={{ color: 'var(--text-main)' }}>
            <Clock className="w-4 h-4" style={{ color: 'var(--color-primary)' }} /> Stages awaiting approval
          </h3>
          <ul className="space-y-2">
            {awaiting.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--bg-card-soft)' }}>
                <span className="text-sm" style={{ color: 'var(--text-main)' }}>{s.name}</span>
                <button
                  onClick={() => approve.mutate(s.id)}
                  disabled={approve.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--color-success)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve & start
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline */}
      <div className="app-card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Stage Definitions</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create, edit, delete, and reorder creator-defined stages.</p>
          </div>
          <button
            onClick={startCreate}
            className="app-btn-primary !text-sm !px-3 !py-2"
          >
            <Plus className="w-4 h-4" /> Add stage
          </button>
        </div>

        {formOpen && (
          <div className="p-4" style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: 'var(--bg-card-soft)' }}>
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
                <div className="app-card-soft p-3">
                  <div className="grid sm:grid-cols-2 gap-2">
                    {CAPABILITY_OPTIONS.map((capability) => {
                      const checked = selectedCapabilities(form.required_capabilities).has(capability.key)
                      return (
                        <label key={capability.key} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-main)' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setForm((f) => ({
                              ...f,
                              required_capabilities: toggleCapability(f.required_capabilities, capability.key),
                            }))}
                          />
                          <span>{capability.label}</span>
                          <span style={{ color: 'var(--text-muted)' }}>({capability.key})</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
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

              <Field label="Reminder policy JSON">
                <div className="space-y-2">
                  <textarea
                    value={reminderPrompt}
                    onChange={(e) => setReminderPrompt(e.target.value)}
                    rows={2}
                    className={`${INPUT_CLASS} resize-none`}
                    placeholder="Example: remind mentors and admins 1 day and 1 hour before end"
                  />
                  <button
                    type="button"
                    onClick={generateReminderJson}
                    disabled={!reminderPrompt.trim()}
                    className="app-btn-secondary !text-xs !px-3 !py-1.5"
                  >
                    Generate editable JSON
                  </button>
                  <textarea
                    value={form.reminder_policy}
                    onChange={(e) => setForm((f) => ({ ...f, reminder_policy: e.target.value }))}
                    rows={4}
                    className={`${INPUT_CLASS} font-mono text-xs resize-none`}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    You can edit this JSON before saving. Use {} if no reminders are needed.
                  </p>
                </div>
              </Field>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-main)' }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active stage
            </label>

            {formError && (
              <p className="text-xs mt-3" style={{ color: 'var(--color-danger)' }}>{formError}</p>
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
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading stages...</p>
          ) : sortedStages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No stages defined yet.</p>
          ) : sortedStages.map((s, index) => {
            const runStatus = runByStage[s.id]?.status ?? (status === 'draft' ? 'not started' : 'pending')
            const isActiveStage = runStatus === 'active'
            return (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 transition-colors"
                style={{
                  borderBottom: index < sortedStages.length - 1 ? '1px solid color-mix(in srgb, var(--color-border) 30%, transparent)' : 'none',
                  borderLeft: isActiveStage ? '3px solid var(--color-primary)' : '3px solid transparent',
                  backgroundColor: isActiveStage ? 'color-mix(in srgb, var(--color-primary) 5%, var(--bg-card))' : 'transparent',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: isActiveStage ? 'rgba(232,121,50,0.12)' : 'var(--bg-card-soft)',
                      color: isActiveStage ? 'var(--color-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {s.position}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>{s.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {new Date(s.start_at).toLocaleString()}{' -> '}{new Date(s.end_at).toLocaleString()}
                      {' · '}{s.timezone}{' · '}{s.transition_policy}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={runStatus} />
                  <button onClick={() => moveStage(index, -1)} disabled={index === 0 || reorder.isPending} className="app-icon-button" title="Move up">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveStage(index, 1)} disabled={index === sortedStages.length - 1 || reorder.isPending} className="app-icon-button" title="Move down">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => startEdit(s)} className="app-btn-secondary !text-xs !px-2 !py-1">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete stage "${s.name}"?`)) deleteStage.mutate(s.id)
                    }}
                    disabled={deleteStage.isPending}
                    className="app-icon-button"
                    style={{ color: 'var(--color-danger)' }}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
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
      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function StatusPill({ status }) {
  const map = {
    active: 'status-active',
    completed: 'status-completed',
    awaiting_approval: 'status-active',
    pending: 'status-pending',
    skipped: 'app-pill',
    'not started': 'app-pill',
  }
  return (
    <span className={map[status] || 'app-pill'}>
      {String(status).replace('_', ' ')}
    </span>
  )
}
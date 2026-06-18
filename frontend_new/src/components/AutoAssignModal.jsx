// src/components/AutoAssignModal.jsx
// Review-before-commit modal for the automatic evaluator/mentor assignment
// algorithm. Shows the full proposed assignment, any teams left unassigned,
// and any relaxed constraints (e.g. conflict-of-interest bent as a last
// resort) — explicitly, never silently — before the admin confirms.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Wand2, AlertTriangle, Check, X, Loader2 } from 'lucide-react'

export default function AutoAssignModal({
  kind,                 // 'evaluator' | 'mentor'
  proposeFn,            // () => Promise<proposal>
  commitFn,             // (proposalId, assignments) => Promise<result>
  onClose,
  onCommitted,
}) {
  const [proposal, setProposal] = useState(null)

  const proposeMutation = useMutation({
    mutationFn: proposeFn,
    onSuccess: (data) => setProposal(data),
  })

  const commitMutation = useMutation({
    mutationFn: () => commitFn(proposal.proposal_id, proposal.assignments),
    onSuccess: (result) => {
      onCommitted?.(result)
      onClose()
    },
  })

  const entityLabel = kind === 'evaluator' ? 'Evaluator' : 'Mentor'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-red-600" />
            <h3 className="text-base font-bold text-slate-900">
              Auto-assign {entityLabel}s
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!proposal && (
            <div className="text-center py-10">
              <p className="text-sm text-slate-600 mb-5">
                This computes a complete, balanced assignment of all active {entityLabel.toLowerCase()}s
                to approved teams. Nothing is saved until you review and confirm below.
              </p>
              <button
                onClick={() => proposeMutation.mutate()}
                disabled={proposeMutation.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {proposeMutation.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Wand2 size={16} />}
                Generate proposal
              </button>
              {proposeMutation.isError && (
                <p className="mt-3 text-sm text-red-600">{proposeMutation.error?.message}</p>
              )}
            </div>
          )}

          {proposal && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xl font-bold text-slate-900">{proposal.assignments.length}</p>
                  <p className="text-xs text-slate-500 font-medium">Assignments proposed</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xl font-bold text-slate-900">
                    {kind === 'evaluator' ? proposal.total_evaluators : proposal.total_mentors}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">Active {entityLabel.toLowerCase()}s</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xl font-bold text-slate-900">{proposal.unassigned_teams.length}</p>
                  <p className="text-xs text-slate-500 font-medium">Teams unassigned</p>
                </div>
              </div>

              {/* Relaxed constraints — always shown explicitly, never hidden */}
              {proposal.relaxed_constraints?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={14} /> {proposal.relaxed_constraints.length} constraint(s) relaxed
                  </p>
                  <ul className="text-xs text-amber-700 space-y-1.5">
                    {proposal.relaxed_constraints.map((rc, i) => (
                      <li key={i}>
                        <span className="font-semibold">{rc.team_name}</span> ← {rc.entity_name}: {rc.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Unassigned teams */}
              {proposal.unassigned_teams?.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1.5">
                    These teams need manual assignment:
                  </p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {proposal.unassigned_teams.map((t) => (
                      <li key={t.team_id}>{t.team_name} — {t.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Assignment list */}
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {proposal.assignments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-900">{a.team_name}</span>
                      <span className="text-slate-400 mx-1.5">→</span>
                      <span className="text-slate-700">
                        {kind === 'evaluator' ? a.evaluator_name : a.mentor_name}
                      </span>
                    </div>
                    {kind === 'mentor' && a.matched_skills?.length > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        {a.matched_skills.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
                {proposal.assignments.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No assignments to propose.</p>
                )}
              </div>

              {commitMutation.isError && (
                <p className="text-sm text-red-600">{commitMutation.error?.message}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {proposal && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
            <button
              onClick={() => setProposal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Regenerate
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending || proposal.assignments.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {commitMutation.isPending
                ? <Loader2 size={16} className="animate-spin" />
                : <Check size={16} />}
              Confirm & save assignments
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
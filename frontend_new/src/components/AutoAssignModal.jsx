// src/components/AutoAssignModal.jsx
// Review-before-commit modal for the automatic evaluator/mentor assignment
// algorithm. Shows the full proposed assignment, any teams left unassigned,
// and any relaxed constraints (e.g. conflict-of-interest bent as a last
// resort) — explicitly, never silently — before the admin confirms.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Wand2, AlertTriangle, Check, X, Loader2 } from 'lucide-react'

import { motion, AnimatePresence } from 'framer-motion'

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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/55 backdrop-blur-[8px] flex items-center justify-center z-[100] p-4 pt-24 sm:p-6 sm:pt-24 md:p-12 md:pt-28"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-card rounded-[20px] border shadow-2xl w-full max-w-2xl max-h-full flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Wand2 size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-foreground">
                Auto-assign {entityLabel}s
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-cardSoft hover:bg-[var(--bg-card-soft)] text-foreground dark:text-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <X size={20} />
            </button>
          </div>

        <div className="shrink min-h-0 overflow-y-auto px-6 py-4">
          {!proposal && (
            <div className="text-center py-10">
              <p className="text-sm text-muted mb-5">
                This computes a complete, balanced assignment of all active {entityLabel.toLowerCase()}s
                to approved teams. Nothing is saved until you review and confirm below.
              </p>
              <button
                onClick={() => proposeMutation.mutate()}
                disabled={proposeMutation.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg app-btn-primary text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {proposeMutation.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Wand2 size={16} />}
                Generate proposal
              </button>
              {proposeMutation.isError && (
                <p className="mt-3 text-sm text-primary">{proposeMutation.error?.message}</p>
              )}
            </div>
          )}

          {proposal && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-xl font-bold text-foreground">{proposal.assignments.length}</p>
                  <p className="text-xs text-muted font-medium">Assignments proposed</p>
                </div>
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-xl font-bold text-foreground">
                    {kind === 'evaluator' ? proposal.total_evaluators : proposal.total_mentors}
                  </p>
                  <p className="text-xs text-muted font-medium">Active {entityLabel.toLowerCase()}s</p>
                </div>
                <div className="rounded-lg bg-surface border border-border p-3">
                  <p className="text-xl font-bold text-foreground">{proposal.unassigned_teams.length}</p>
                  <p className="text-xs text-muted font-medium">Teams unassigned</p>
                </div>
              </div>

              {/* Relaxed constraints — always shown explicitly, never hidden */}
              {proposal.relaxed_constraints?.length > 0 && (
                <div className="rounded-lg border border-border bg-cardSoft p-3">
                  <p className="text-sm font-semibold text-primary-dark dark:text-amber-200 flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={14} /> {proposal.relaxed_constraints.length} constraint(s) relaxed
                  </p>
                  <ul className="text-xs text-primary space-y-1.5">
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
                <div className="rounded-lg border border-border bg-cardSoft p-3">
                  <p className="text-sm font-semibold text-primary mb-1.5">
                    These teams need manual assignment:
                  </p>
                  <ul className="text-xs text-primary space-y-1">
                    {proposal.unassigned_teams.map((t) => (
                      <li key={t.team_id}>{t.team_name} — {t.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Assignment list */}
              <div className="rounded-lg border border-border divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {proposal.assignments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{a.team_name}</span>
                      <span className="text-muted mx-1.5">→</span>
                      <span className="text-foreground">
                        {kind === 'evaluator' ? a.evaluator_name : a.mentor_name}
                      </span>
                    </div>
                    {kind === 'mentor' && a.matched_skills?.length > 0 && (
                      <span className="text-xs text-primary font-medium">
                        {a.matched_skills.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
                {proposal.assignments.length === 0 && (
                  <p className="text-sm text-muted text-center py-6">No assignments to propose.</p>
                )}
              </div>

              {commitMutation.isError && (
                <p className="text-sm text-primary">{commitMutation.error?.message}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {proposal && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
            <button
              onClick={() => setProposal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:bg-surface"
            >
              Regenerate
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending || proposal.assignments.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {commitMutation.isPending
                ? <Loader2 size={16} className="animate-spin" />
                : <Check size={16} />}
              Confirm & save assignments
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
    </AnimatePresence>
  )
}
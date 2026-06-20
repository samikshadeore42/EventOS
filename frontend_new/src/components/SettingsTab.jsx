import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Building, Users, Mail, Save, Plus, X, Loader2 } from 'lucide-react'

export default function SettingsTab() {
  const qc = useQueryClient()
  const { activeOrganization } = useAuth()

  const orgId = activeOrganization?.id

  // Data Queries
  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => organizationsApi.members(orgId),
    enabled: !!orgId
  })

  const { data: invitations, isLoading: loadingInvites } = useQuery({
    queryKey: ['org-invitations', orgId],
    queryFn: () => organizationsApi.invitations(orgId),
    enabled: !!orgId
  })

  // Mutations
  const updateOrgMutation = useMutation({
    mutationFn: (data) => organizationsApi.update(orgId, data),
    onSuccess: () => {
      alert("Organization updated successfully")
      qc.invalidateQueries({ queryKey: ['my-organizations'] })
      window.location.reload()
    },
    onError: (err) => alert("Error: " + err.message)
  })

  const inviteMutation = useMutation({
    mutationFn: (data) => organizationsApi.invite(orgId, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['org-invitations', orgId] })
      setInviteEmail('')
      setShowInviteForm(false)

      if (data?.email_queued === false) {
        alert('Invitation created, but the email could not be queued for delivery. The recipient may not receive it — consider resending or sharing the link manually.')
      }
    },
    onError: (err) => alert("Error: " + err.message)
  })

  const revokeMutation = useMutation({
    mutationFn: (invId) => organizationsApi.revokeInvitation(orgId, invId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invitations', orgId] })
  })

  const setMemberStatusMutation = useMutation({
    mutationFn: ({ memberId, status }) => organizationsApi.setMemberStatus(orgId, memberId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgId] }),
    onError: (err) => alert("Error: " + err.message)
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }) => organizationsApi.updateMemberRole(orgId, memberId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgId] })
  })

  // State
  const [orgName, setOrgName] = useState(activeOrganization?.name || '')
  const [orgDesc, setOrgDesc] = useState(activeOrganization?.description || '')
  const [syncedOrgId, setSyncedOrgId] = useState(activeOrganization?.id)

  if (activeOrganization?.id !== syncedOrgId) {
    setSyncedOrgId(activeOrganization?.id)
    setOrgName(activeOrganization?.name || '')
    setOrgDesc(activeOrganization?.description || '')
  }

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('admin')

  if (!orgId) return <div className="text-sm font-medium text-muted">No active organization.</div>

  return (
    <div>

      <div className="space-y-6">
        {/* Organization Settings */}
        <div className="app-card rounded-[22px] p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-6 text-foreground">
            <Building size={20} />
            <h2 className="text-lg font-extrabold">Organization Settings</h2>
          </div>
          <div className="max-w-xl space-y-4 md:w-[45%]">
            <div>
              <label className="block text-xs font-bold text-muted mb-2">Organization Name</label>
              <input
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                className="w-full app-input h-11 px-4 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-2">Description</label>
              <textarea
                value={orgDesc}
                onChange={e => setOrgDesc(e.target.value)}
                className="w-full app-input px-4 py-3 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all min-h-[100px]"
              />
            </div>
            <button
              onClick={() => updateOrgMutation.mutate({ name: orgName, description: orgDesc })}
              disabled={updateOrgMutation.isPending || (orgName === activeOrganization?.name && orgDesc === (activeOrganization?.description || ''))}
              className="mt-2 px-6 h-11 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-extrabold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {updateOrgMutation.isPending ? <Loader2 size={16} className="animate-spin"/> : <Save size={16} />}
              Save Changes
            </button>
          </div>
        </div>

        {/* Members */}
        <div className="app-card rounded-[22px] p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-6 text-foreground">
            <Users size={20} />
            <h2 className="text-lg font-extrabold">Members</h2>
          </div>
          
          <div className="border border-border rounded-[16px] overflow-hidden bg-card">
            <table className="w-full text-left">
              <thead className="bg-cardSoft/60 border-b border-border/70">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">USER</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">ROLE</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">JOINED</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">STATUS</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {loadingMembers ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-8 text-center text-muted">
                      <Loader2 size={24} className="animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : members?.map(m => (
                  <tr key={m.membership_id} className="hover:bg-cardSoft/40 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-foreground">{m.first_name} {m.last_name}</p>
                      <p className="text-sm font-medium text-muted">{m.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={m.role}
                        onChange={e => {
                          if (window.confirm(`Change role to ${e.target.value}?`)) {
                            updateRoleMutation.mutate({ memberId: m.membership_id, role: e.target.value })
                          }
                        }}
                        className="app-input h-9 px-3 pr-8 text-sm font-medium text-muted focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 appearance-none"
                        disabled={m.role === 'owner'}
                      >
                        <option value="owner" disabled>Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-muted">
                      {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${m.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : m.status === 'suspended' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right space-x-3">
                      {m.role !== 'owner' && m.status === 'active' && (
                        <button
                          onClick={() => {
                            if (window.confirm('Suspend this member?')) {
                              setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'suspended' })
                            }
                          }}
                          className="text-sm font-extrabold text-orange-600 hover:text-orange-700 transition-colors"
                        >
                          Suspend
                        </button>
                      )}
                      {m.role !== 'owner' && m.status === 'suspended' && (
                        <button
                          onClick={() => {
                            setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'active' })
                          }}
                          className="text-sm font-extrabold text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          Reactivate
                        </button>
                      )}
                      {m.role !== 'owner' && m.status !== 'revoked' && (
                        <button
                          onClick={() => {
                            if (window.confirm('Revoke this member? They will lose access to this organization.')) {
                              setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'revoked' })
                            }
                          }}
                          className="text-sm font-extrabold text-red-600 hover:text-red-700 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Invitations */}
        <div className="app-card rounded-[22px] p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 text-foreground">
              <Mail size={20} />
              <h2 className="text-lg font-extrabold">Pending Invitations</h2>
            </div>
            <button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="bg-card border border-border text-foreground hover:bg-cardSoft h-10 px-4 rounded-xl text-sm font-extrabold transition-colors flex items-center justify-center gap-2"
            >
              {showInviteForm ? <X size={16} /> : <Plus size={16} />}
              {showInviteForm ? "Cancel" : "Invite Member"}
            </button>
          </div>

          {showInviteForm && (
            <div className="mb-6 p-5 bg-cardSoft border border-border rounded-[16px] flex flex-col md:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-muted mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full app-input h-11 px-4 text-sm font-medium text-muted placeholder:text-slate-400 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
              <div className="w-full md:w-48">
                <label className="block text-xs font-bold text-muted mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full app-input h-11 px-4 text-sm font-medium text-muted focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all appearance-none"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <button
                onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                disabled={inviteMutation.isPending || !inviteEmail}
                className="w-full md:w-auto h-11 px-6 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-extrabold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
              >
                {inviteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                Send Invite
              </button>
            </div>
          )}

          <div className="border border-border rounded-[16px] overflow-hidden bg-card">
            <table className="w-full text-left">
              <thead className="bg-cardSoft/60 border-b border-border/70">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">EMAIL</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">ROLE</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider">STATUS</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {loadingInvites ? (
                  <tr>
                    <td colSpan="4" className="px-5 py-8 text-center text-muted">
                      <Loader2 size={24} className="animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : invitations?.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-5 py-12 text-center">
                      <div className="w-12 h-12 rounded-full bg-cardSoft border border-border flex items-center justify-center mx-auto mb-3">
                        <Mail size={20} className="text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-foreground mb-1">No pending invitations.</p>
                      <p className="text-sm font-medium text-muted">Invited members will appear here.</p>
                    </td>
                  </tr>
                ) : invitations?.map(inv => (
                  <tr key={inv.id} className="hover:bg-cardSoft/40 transition-colors">
                    <td className="px-5 py-4 font-medium text-foreground">{inv.email}</td>
                    <td className="px-5 py-4 text-sm font-medium text-muted capitalize">{inv.role}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${inv.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-cardSoft text-muted border-border'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => {
                          if(window.confirm('Revoke invitation?')) revokeMutation.mutate(inv.id)
                        }}
                        className="text-sm font-extrabold text-red-600 hover:text-red-700 transition-colors"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Building, Users, Mail, Save, Plus, X, Loader2 } from 'lucide-react'

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green:  'bg-green-50 border border-green-200 text-green-700',
    red:    'bg-red-50 border border-red-200 text-red-700',
    amber:  'bg-amber-50 border border-amber-200 text-amber-700',
    indigo: 'bg-indigo-50 border border-indigo-200 text-indigo-700',
    teal:   'bg-teal-50 border border-teal-200 text-teal-700',
    gray:   'bg-slate-100 border border-slate-200 text-slate-700',
  }[colour] ?? 'bg-slate-100 border border-slate-200 text-slate-700'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  )
}

function SectionTitle({ children }) {
  return <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 font-black mb-4">{children}</h2>
}

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
      qc.invalidateQueries({ queryKey: ['my-organizations'] }) // Will update context implicitly on reload, but better to refresh
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

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('admin')

  if (!orgId) return <div className="text-sm text-slate-500">No active organization.</div>

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <div className="glass-card rounded-xl border border-slate-200 p-5">
        <SectionTitle><Building size={18} className="inline mr-2" /> Organization Settings</SectionTitle>
        <div className="max-w-xl space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Organization Name</label>
            <input 
              value={orgName} 
              onChange={e => setOrgName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
            <textarea 
              value={orgDesc} 
              onChange={e => setOrgDesc(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]" 
            />
          </div>
          <button 
            onClick={() => updateOrgMutation.mutate({ name: orgName, description: orgDesc })}
            disabled={updateOrgMutation.isPending || (orgName === activeOrganization?.name && orgDesc === (activeOrganization?.description || ''))}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg btn-primary text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {updateOrgMutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="glass-card rounded-xl border border-slate-200 p-5">
        <SectionTitle><Users size={18} className="inline mr-2" /> Members</SectionTitle>
        <div className="overflow-hidden border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>

            <tbody>
              {loadingMembers ? (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-slate-500">
                    <Loader2 size={16} className="animate-spin inline" />
                  </td>
                </tr>
              ) : members?.map(m => (
                <tr key={m.membership_id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{m.first_name} {m.last_name}</p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={m.role}
                      onChange={e => {
                        if (window.confirm(`Change role to ${e.target.value}?`)) {
                          updateRoleMutation.mutate({ memberId: m.membership_id, role: e.target.value })
                        }
                      }}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none"
                      disabled={m.role === 'owner'}
                    >
                      <option value="owner" disabled>Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-500">
                    {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                  </td>

                  <td className="px-4 py-3">
                    <Badge colour={m.status === 'active' ? 'green' : m.status === 'suspended' ? 'amber' : 'red'}>
                      {m.status}
                    </Badge>
                  </td>

                  <td className="px-4 py-3 text-right space-x-2">
                    {m.role !== 'owner' && m.status === 'active' && (
                      <button
                        onClick={() => {
                          if (window.confirm('Suspend this member?')) {
                            setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'suspended' })
                          }
                        }}
                        className="text-xs text-amber-600 hover:text-amber-800"
                      >
                        Suspend
                      </button>
                    )}

                    {m.role !== 'owner' && m.status === 'suspended' && (
                      <button
                        onClick={() => {
                          setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'active' })
                        }}
                        className="text-xs text-green-600 hover:text-green-800"
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
                        className="text-xs text-red-500 hover:text-red-700"
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

      {/* Invitations */}
      <div className="glass-card rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><Mail size={18} className="inline mr-2" /> Pending Invitations</SectionTitle>
          <button 
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-medium"
          >
            {showInviteForm ? <X size={14} /> : <Plus size={14} />}
            {showInviteForm ? "Cancel" : "Invite Member"}
          </button>
        </div>

        {showInviteForm && (
          <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Email Address</label>
              <input 
                type="email" 
                value={inviteEmail} 
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
              />
            </div>
            <div className="w-48">
              <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
              <select 
                value={inviteRole} 
                onChange={e => setInviteRole(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>
            <button 
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={inviteMutation.isPending || !inviteEmail}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 h-[38px]"
            >
              {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send Invite
            </button>
          </div>
        )}

        <div className="overflow-hidden border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {loadingInvites ? (
                <tr><td colSpan="4" className="p-4 text-center text-slate-500"><Loader2 size={16} className="animate-spin inline" /></td></tr>
              ) : invitations?.length === 0 ? (
                <tr><td colSpan="4" className="p-4 text-center text-xs text-slate-500">No pending invitations.</td></tr>
              ) : invitations?.map(inv => (
                <tr key={inv.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900">{inv.email}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{inv.role}</td>
                  <td className="px-4 py-3">
                    <Badge colour={inv.status === 'pending' ? 'amber' : 'gray'}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => {
                        if(window.confirm('Revoke invitation?')) revokeMutation.mutate(inv.id)
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
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
  )
}

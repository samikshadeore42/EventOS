import { useState} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Building, Users, Mail, Save, Plus, X, Loader2 } from 'lucide-react'

function Badge({ children, colour = 'gray' }) {
  const cls = {
    green:   'status-completed',
    red:     'status-critical',
    amber:   'status-active',
    teal:    'status-active',
    gray:    'app-pill',
  }[colour] ?? 'app-pill'
  return (
    <span className={cls}>
      {children}
    </span>
  )
}

function SectionTitle({ children }) {
  return <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-main)' }}>{children}</h2>
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
  const [syncedOrgId, setSyncedOrgId] = useState(activeOrganization?.id)

  // Re-sync form fields whenever the active organization changes.
  // Done during render (not in an effect) to avoid an extra render pass.
  if (activeOrganization?.id !== syncedOrgId) {
    setSyncedOrgId(activeOrganization?.id)
    setOrgName(activeOrganization?.name || '')
    setOrgDesc(activeOrganization?.description || '')
  }

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('admin')

  if (!orgId) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No active organization.</div>

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <div className="app-card p-5">
        <SectionTitle><Building size={18} className="inline mr-2" /> Organization Settings</SectionTitle>
        <div className="max-w-xl space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Organization Name</label>
            <input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              className="app-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea
              value={orgDesc}
              onChange={e => setOrgDesc(e.target.value)}
              className="app-input min-h-[80px]"
            />
          </div>
          <button
            onClick={() => updateOrgMutation.mutate({ name: orgName, description: orgDesc })}
            disabled={updateOrgMutation.isPending || (orgName === activeOrganization?.name && orgDesc === (activeOrganization?.description || ''))}
            className="app-btn-primary"
          >
            {updateOrgMutation.isPending ? <Loader2 size={14} className="animate-spin"/> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="app-card p-5">
        <SectionTitle><Users size={18} className="inline mr-2" /> Members</SectionTitle>
        <table className="app-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Status</th>
              <th className="text-right"></th>
            </tr>
          </thead>

          <tbody>
            {loadingMembers ? (
              <tr>
                <td colSpan="5" className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
                  <Loader2 size={16} className="animate-spin inline" />
                </td>
              </tr>
            ) : members?.map(m => (
              <tr key={m.membership_id}>
                <td>
                  <p className="font-medium" style={{ color: 'var(--text-main)' }}>{m.first_name} {m.last_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.email}</p>
                </td>

                <td>
                  <select
                    value={m.role}
                    onChange={e => {
                      if (window.confirm(`Change role to ${e.target.value}?`)) {
                        updateRoleMutation.mutate({ memberId: m.membership_id, role: e.target.value })
                      }
                    }}
                    className="app-input !w-auto !py-1 !px-2 text-xs"
                    disabled={m.role === 'owner'}
                  >
                    <option value="owner" disabled>Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </td>

                <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                </td>

                <td>
                  <Badge colour={m.status === 'active' ? 'green' : m.status === 'suspended' ? 'amber' : 'red'}>
                    {m.status}
                  </Badge>
                </td>

                <td className="text-right space-x-2">
                  {m.role !== 'owner' && m.status === 'active' && (
                    <button
                      onClick={() => {
                        if (window.confirm('Suspend this member?')) {
                          setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'suspended' })
                        }
                      }}
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      Suspend
                    </button>
                  )}

                  {m.role !== 'owner' && m.status === 'suspended' && (
                    <button
                      onClick={() => {
                        setMemberStatusMutation.mutate({ memberId: m.membership_id, status: 'active' })
                      }}
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--color-success)' }}
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
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--color-danger)' }}
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

      {/* Invitations */}
      <div className="app-card p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><Mail size={18} className="inline mr-2" /> Pending Invitations</SectionTitle>
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="app-btn-secondary text-xs !px-3 !py-1.5"
          >
            {showInviteForm ? <X size={14} /> : <Plus size={14} />}
            {showInviteForm ? "Cancel" : "Invite Member"}
          </button>
        </div>

        {showInviteForm && (
          <div className="mb-4 p-4 app-card-soft flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Email Address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="app-input"
              />
            </div>
            <div className="w-48">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="app-input"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>
            <button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={inviteMutation.isPending || !inviteEmail}
              className="app-btn-primary h-[38px]"
            >
              {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send Invite
            </button>
          </div>
        )}

        <table className="app-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th className="text-right"></th>
            </tr>
          </thead>
          <tbody>
            {loadingInvites ? (
              <tr><td colSpan="4" className="p-4 text-center" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin inline" /></td></tr>
            ) : invitations?.length === 0 ? (
              <tr><td colSpan="4" className="p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>No pending invitations.</td></tr>
            ) : invitations?.map(inv => (
              <tr key={inv.id}>
                <td style={{ color: 'var(--text-main)' }}>{inv.email}</td>
                <td className="capitalize" style={{ color: 'var(--text-muted)' }}>{inv.role}</td>
                <td>
                  <Badge colour={inv.status === 'pending' ? 'amber' : 'gray'}>{inv.status}</Badge>
                </td>
                <td className="text-right">
                  <button
                    onClick={() => {
                      if(window.confirm('Revoke invitation?')) revokeMutation.mutate(inv.id)
                    }}
                    className="text-xs font-medium hover:underline"
                    style={{ color: 'var(--color-danger)' }}
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
  )
}

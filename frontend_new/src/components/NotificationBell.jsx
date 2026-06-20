// src/components/NotificationBell.jsx
// Phase 7 — in-app notification centre. Polls the unread count, shows a dropdown
// of the current user's notifications for the active event, and lets them mark
// items read. Wired to notificationsApi (event-scoped via the api interceptor).
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Loader2 } from 'lucide-react'
import { notificationsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function NotificationBell() {
  const qc = useQueryClient()
  const { activeEvent } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data: countData } = useQuery({
    queryKey: ['notifications', activeEvent?.id, 'unread-count'],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: !!activeEvent?.id,
    refetchInterval: 30_000,      // poll every 30s
    refetchOnWindowFocus: true,
  })
  const unread = countData?.unread ?? 0

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications', activeEvent?.id, 'list'],
    queryFn: () => notificationsApi.list(),
    enabled: open && !!activeEvent?.id,                // only fetch the list when the dropdown is open
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', activeEvent?.id] })
  }

  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: invalidate,
  })
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: invalidate,
  })

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!activeEvent?.id}
        className="relative p-2 rounded-lg transition-all"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-card-soft)'; e.currentTarget.style.color = 'var(--text-main)' }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[11px] font-semibold text-white rounded-full"
            style={{ backgroundColor: 'var(--color-danger)' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto app-card rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <span className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs hover:underline disabled:opacity-50"
                style={{ color: 'var(--color-primary)' }}
                disabled={markAll.isPending}
              >
                Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>You're all caught up.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className="px-4 py-3 flex gap-3"
                  style={{
                    borderBottom: '1px solid color-mix(in srgb, var(--color-border) 30%, transparent)',
                    opacity: n.read ? 0.6 : 1,
                    backgroundColor: n.read ? 'transparent' : 'color-mix(in srgb, var(--color-primary) 4%, var(--bg-card))',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>{n.title}</p>
                    <p className="text-xs line-clamp-2" style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      className="self-start p-1 rounded transition-colors"
                      title="Mark read"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-card-soft)' }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
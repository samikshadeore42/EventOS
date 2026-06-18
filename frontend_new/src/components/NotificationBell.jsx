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
        className="relative p-2 rounded-full hover:bg-surface transition"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-muted hover:text-foreground transition-colors" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center
                           text-[11px] font-semibold text-white bg-teal-500 rounded-full">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto glass-card rounded-xl shadow-lg
                        border border-border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm text-foreground">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-teal-600 hover:underline disabled:opacity-50"
                disabled={markAll.isPending}
              >
                Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 flex gap-3 ${n.read ? 'opacity-60' : 'bg-teal-500/10'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted line-clamp-2">{n.message}</p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      className="self-start p-1 rounded hover:bg-surface"
                      title="Mark read"
                    >
                      <Check className="w-4 h-4 text-muted" />
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
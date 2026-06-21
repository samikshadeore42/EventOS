import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'

function unwrap(response) {
  return response?.data ?? response ?? {}
}

function formatTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function notificationItems(payload) {
  const data = unwrap(payload)
  if (Array.isArray(data)) return data
  if (Array.isArray(data.notifications)) return data.notifications
  if (Array.isArray(data.items)) return data.items
  return []
}

function unreadValue(payload) {
  const data = unwrap(payload)
  return Number(data.unread ?? data.unread_count ?? data.count ?? 0)
}

export default function PortalNotificationBell({
  token,
  api,
  queryKeyPrefix = 'portal-notifications',
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const queryClient = useQueryClient()

  const enabled = Boolean(
    token &&
    api &&
    api.notificationCount &&
    api.notifications &&
    api.markNotificationRead &&
    api.markAllNotificationsRead
  )

  const countKey = [queryKeyPrefix, 'count', token]
  const listKey = [queryKeyPrefix, 'list', token]

  const countQuery = useQuery({
    queryKey: countKey,
    queryFn: () => api.notificationCount(token),
    enabled,
    refetchInterval: 15000,
    staleTime: 10000,
  })

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.notifications(token),
    enabled: enabled && open,
    staleTime: 5000,
  })

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: countKey })
    queryClient.invalidateQueries({ queryKey: listKey })
  }

  const markReadMutation = useMutation({
    mutationFn: (id) => api.markNotificationRead(id, token),
    onSuccess: invalidateNotifications,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(token),
    onSuccess: invalidateNotifications,
  })

  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const unread = unreadValue(countQuery.data)
  const notifications = notificationItems(listQuery.data)

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />

        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f172a]">
          <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <h3 className="text-sm font-extrabold text-slate-950 dark:text-white">
                Notifications
              </h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {unread} unread
              </p>
            </div>

            <button
              type="button"
              disabled={!unread || markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-500/10"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 dark:bg-white/5">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-sm font-extrabold text-slate-950 dark:text-white">
                  No notifications yet
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                  Stage reminders, chats, meetings, feedback, and team updates will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {notifications.map((item) => {
                  const isUnread = !item.read && !item.read_at

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        if (isUnread && item.id) {
                          markReadMutation.mutate(item.id)
                        }
                      }}
                      className="w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <div className="flex gap-3">
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            isUnread ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="line-clamp-1 text-sm font-extrabold text-slate-950 dark:text-white">
                              {item.title || 'Notification'}
                            </p>

                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {formatTime(item.created_at)}
                            </span>
                          </div>

                          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                            {item.message || item.body || ''}
                          </p>

                          {item.notification_type && (
                            <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-white/10 dark:text-slate-300">
                              {String(item.notification_type).replaceAll('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

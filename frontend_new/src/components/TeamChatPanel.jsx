// src/components/TeamChatPanel.jsx
// Real-time chat panel (WebSocket-backed via useChat). Renders a floating
// toggle button; clicking it opens a slide-up panel. Used for both the
// team-internal group chat and the team<->mentor shared thread — `kind` and
// `title` differentiate them, everything else is shared.
//
// NOTE on styling: deliberately neutral (slate/white + one accent class)
// rather than matching either the outgoing or the not-yet-built theme
// system, since the project's theme is being redone in a separate pass —
// this avoids restyling the same component twice.
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, AlertTriangle } from 'lucide-react'
import { useChat } from '../hooks/useChat'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function TeamChatPanel({
  eventId, teamId, token, kind, title, accentClass = 'bg-slate-700 hover:bg-slate-800',
  currentSenderId, currentSenderRole,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [seenCount, setSeenCount] = useState(0)
  const bottomRef = useRef(null)

  const { messages, connectionState, historyError, sendMessage, isConnected } = useChat({
    eventId, teamId, kind, token, enabled: !!teamId,
  })

  // Unread badge: derived directly from messages.length vs. seenCount (how
  // many were present the last time the panel was opened) — plain state
  // read during render, no ref access.
  const unseenCount = open ? 0 : Math.max(0, messages.length - seenCount)

  // Opening the panel is a real user event (a click), so mark everything as
  // seen right there — not via an effect reacting to `open` having changed,
  // which is what triggered the "setState in effect" lint rule.
  const handleToggle = () => {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen
      if (willOpen) setSeenCount(messages.length)
      return willOpen
    })
  }

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const handleSend = (e) => {
    e.preventDefault()
    if (sendMessage(draft)) setDraft('')
  }

  if (!teamId) return null

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-white text-sm font-semibold shadow-lg transition-colors ${accentClass} ${
          kind === 'mentor' ? 'right-6' : 'right-24'
        }`}
        aria-label={open ? `Close ${title}` : `Open ${title}`}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        <span className="hidden sm:inline">{title}</span>
        {!open && unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[11px] font-bold bg-red-500 rounded-full">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={`fixed bottom-24 z-40 w-[92vw] max-w-sm h-[28rem] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col ${
            kind === 'mentor' ? 'right-6' : 'right-24'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 rounded-t-2xl bg-slate-50">
            <div>
              <p className="text-sm font-bold text-slate-800">{title}</p>
              <p className="text-[11px] text-slate-400">
                {isConnected ? 'Live' : connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {historyError && (
              <p className="text-xs text-red-500 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Couldn't load history: {historyError}
              </p>
            )}
            {messages.length === 0 && !historyError && (
              <p className="text-xs text-slate-400 text-center mt-8">No messages yet — say hello.</p>
            )}
            {messages.map((m) => {
              const senderId = m.sender_role === 'mentor' ? m.sender_mentor_id : m.sender_participant_id
              const isMine = currentSenderId != null
                && m.sender_role === currentSenderRole
                && senderId === currentSenderId
              return (
                <div key={m.id} className={`flex flex-col max-w-[85%] ${isMine ? 'ml-auto items-end' : 'items-start'}`}>
                  {!isMine && (
                    <span className="text-[10px] font-semibold text-slate-400 px-1">
                      {m.sender_name}{m.sender_role === 'mentor' ? ' (Mentor)' : ''}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      isMine ? 'bg-slate-700 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[10px] text-slate-300 px-1 mt-0.5">{formatTime(m.created_at)}</span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-slate-200">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isConnected ? 'Type a message…' : 'Connecting…'}
              disabled={!isConnected}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isConnected || !draft.trim()}
              className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-800 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            >
              {connectionState === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
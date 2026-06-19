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
import { createPortal } from 'react-dom'
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
  eventId, teamId, token, kind, title, accentClass = 'bg-primary hover:bg-primary-dark',
  currentSenderId, currentSenderRole,
  inline = false,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [seenCount, setSeenCount] = useState(0) // Restored
  const bottomRef = useRef(null)

  const { messages, connectionState, historyError, sendMessage, isConnected } = useChat({
    eventId, teamId, kind, token, enabled: !!teamId,
  })

  // Unread badge: derived directly from messages.length vs. seenCount
  const unseenCount = open ? 0 : Math.max(0, messages.length - seenCount) // Restored

  // Opening the panel marks everything as seen
  const handleToggle = () => { // Restored
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

  const isPanelOpen = inline ? true : open

  const content = (
    <>
      {/* Floating toggle button */}
      {!inline && (
      <button
        onClick={handleToggle} // FIXED: Now using the handleToggle function!
        className={`fixed bottom-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-white text-sm font-semibold shadow-lg transition-colors ${accentClass} ${
          kind === 'mentor' ? 'right-6' : 'right-24'
        }`}
        aria-label={open ? `Close ${title}` : `Open ${title}`}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        <span className="hidden sm:inline">{title}</span>
        {!open && unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[11px] font-bold bg-cardSoft0 rounded-full">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>
      )}

      {/* Panel */}
      {isPanelOpen && (
        <div
          className={inline ? "flex flex-col w-full h-full bg-background" : `fixed bottom-24 z-40 w-[92vw] max-w-sm h-[28rem] glass-panel rounded-2xl shadow-[0_12px_40px_color-mix(in_srgb,var(--color-teal-500)_15%,transparent)] flex flex-col overflow-hidden ring-1 ring-teal-500/20 ${
            kind === 'mentor' ? 'right-6' : 'right-24'
          }`}
        >
          {!inline && (
            <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-surface/90 backdrop-blur-md">
              <div>
                <p className="text-sm font-bold text-foreground">{title}</p>
                <p className="text-[11px] text-muted">
                  {isConnected ? 'Live' : connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-muted">
                <X size={18} />
              </button>
            </div>
          )}
          {inline && !isConnected && (
             <div className="relative z-10 bg-cardSoft dark:bg-teal-900/20 px-4 py-2 border-b border-primary/20 text-[11px] font-medium text-primary-dark dark:text-primary-light text-center">
                {connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
             </div>
          )}

          <div className="relative flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-background">
            {/* Chat background pattern */}
            <div className="absolute inset-0 bg-cardSoft0 opacity-[0.04] dark:opacity-[0.02] pointer-events-none" style={{ WebkitMaskImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='black'/%3E%3C/svg%3E")`, maskImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='black'/%3E%3C/svg%3E")` }}></div>

            {historyError && (
              <p className="relative z-10 text-xs text-primary flex items-center gap-1.5">
                <AlertTriangle size={12} /> Couldn't load history: {historyError}
              </p>
            )}
            {messages.length === 0 && !historyError && (
              <p className="relative z-10 text-xs text-muted text-center mt-8">No messages yet — say hello.</p>
            )}
            {messages.map((m) => {
              const senderId = m.sender_role === 'mentor' ? m.sender_mentor_id : m.sender_participant_id
              const isMine = currentSenderId != null
                && m.sender_role === currentSenderRole
                && senderId === currentSenderId
              return (
                <div key={m.id} className={`relative z-10 flex flex-col max-w-[85%] ${isMine ? 'ml-auto items-end' : 'items-start'}`}>
                  {!isMine && (
                    <span className="text-[10px] font-semibold text-muted px-1 mb-0.5">
                      {m.sender_name}{m.sender_role === 'mentor' ? ' (Mentor)' : ''}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      isMine ? 'app-btn-primary rounded-br-sm' : 'bg-surface border border-border text-foreground rounded-bl-sm'
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[10px] text-muted px-1 mt-0.5">{formatTime(m.created_at)}</span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="relative z-10 flex items-center gap-2 p-3 border-t border-border bg-surface/90 backdrop-blur-md">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isConnected ? 'Type a message…' : 'Connecting…'}
              disabled={!isConnected}
              className="flex-1 bg-surface border border-border rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isConnected || !draft.trim()}
              className={`w-9 h-9 rounded-full text-white flex items-center justify-center disabled:opacity-40 shrink-0 ${accentClass}`}
            >
              {connectionState === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}
    </>
  )

  if (inline) return content

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}
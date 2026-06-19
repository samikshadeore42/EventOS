// src/components/TeamChatPanel.jsx
// Real-time chat panel (WebSocket-backed via useChat). Opens as a right-side
// drawer when triggered. Used for team-internal group chat and team↔mentor
// shared thread — `kind` and `title` differentiate them.
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
  const [seenCount, setSeenCount] = useState(0)
  const bottomRef = useRef(null)

  const { messages, connectionState, historyError, sendMessage, isConnected } = useChat({
    eventId, teamId, kind, token, enabled: !!teamId,
  })

  const unseenCount = open ? 0 : Math.max(0, messages.length - seenCount)

  const handleToggle = () => {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen
      if (willOpen) setSeenCount(messages.length)
      return willOpen
    })
  }

  useEffect(() => {
    if (open || inline) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, inline])

  const handleSend = (e) => {
    e.preventDefault()
    if (sendMessage(draft)) setDraft('')
  }

  if (!teamId) return null

  const isPanelOpen = inline ? true : open

  // Chat body shared between inline and drawer modes
  const chatBody = (
    <>
      {/* Connection status */}
      {!isConnected && (
        <div className="px-4 py-2 text-[11px] font-medium text-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, var(--bg-card-soft))',
            borderBottom: '1px solid color-mix(in srgb, var(--color-primary) 15%, transparent)',
            color: 'var(--color-primary)',
          }}
        >
          {connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
      )}

      {/* Messages area */}
      <div className="relative flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ backgroundColor: 'var(--bg-main)' }}>
        {historyError && (
          <p className="relative z-10 text-xs flex items-center gap-1.5" style={{ color: 'var(--color-danger)' }}>
            <AlertTriangle size={12} /> Couldn't load history: {historyError}
          </p>
        )}
        {messages.length === 0 && !historyError && (
          <p className="relative z-10 text-xs text-center mt-8" style={{ color: 'var(--text-muted)' }}>No messages yet — say hello.</p>
        )}
        {messages.map((m) => {
          const senderId = m.sender_role === 'mentor' ? m.sender_mentor_id : m.sender_participant_id
          const isMine = currentSenderId != null
            && m.sender_role === currentSenderRole
            && senderId === currentSenderId
          return (
            <div key={m.id} className={`relative z-10 flex flex-col max-w-[85%] ${isMine ? 'ml-auto items-end' : 'items-start'}`}>
              {!isMine && (
                <span className="text-[10px] font-semibold px-1 mb-0.5" style={{ color: 'var(--text-muted)' }}>
                  {m.sender_name}{m.sender_role === 'mentor' ? ' (Mentor)' : ''}
                </span>
              )}
              <div
                className={`px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  isMine ? 'rounded-br-sm text-white' : 'rounded-bl-sm'
                }`}
                style={isMine
                  ? { backgroundColor: 'var(--color-primary)' }
                  : { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }
                }
              >
                {m.body}
              </div>
              <span className="text-[10px] px-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatTime(m.created_at)}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="relative z-10 flex items-center gap-2 p-3"
        style={{ borderTop: '1px solid var(--border-soft)', backgroundColor: 'var(--bg-card)' }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isConnected ? 'Type a message…' : 'Connecting…'}
          disabled={!isConnected}
          className="app-input flex-1 !rounded-full !px-4 !py-2"
        />
        <button
          type="submit"
          disabled={!isConnected || !draft.trim()}
          className="w-9 h-9 rounded-full text-white flex items-center justify-center disabled:opacity-40 shrink-0 transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {connectionState === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
    </>
  )

  // Inline mode (embedded directly in page)
  if (inline) {
    return <div className="flex flex-col w-full h-full" style={{ backgroundColor: 'var(--bg-main)' }}>{chatBody}</div>
  }

  // Drawer mode (right-side panel)
  const content = (
    <>
      {/* Floating toggle button */}
      <button
        onClick={handleToggle}
        className={`fixed bottom-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-white text-sm font-semibold shadow-lg transition-colors ${accentClass} ${
          kind === 'mentor' ? 'right-6' : 'right-24'
        }`}
        aria-label={open ? `Close ${title}` : `Open ${title}`}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        <span className="hidden sm:inline">{title}</span>
        {!open && unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[11px] font-bold rounded-full"
            style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
          >
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {isPanelOpen && (
        <>
          {/* Semi-transparent overlay */}
          <div className="app-drawer-overlay" onClick={() => setOpen(false)} />

          {/* Right-side drawer */}
          <div className="app-drawer">
            <div className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: 'var(--bg-card)' }}
            >
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>{title}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {isConnected ? 'Live' : connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="app-icon-button">
                <X size={18} />
              </button>
            </div>
            {chatBody}
          </div>
        </>
      )}
    </>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}
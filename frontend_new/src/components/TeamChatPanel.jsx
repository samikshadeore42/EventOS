// src/components/TeamChatPanel.jsx
// Real-time chat panel (WebSocket-backed via useChat). Opens as a right-side
// drawer when triggered. Used for team-internal group chat and team↔mentor
// shared thread — `kind` and `title` differentiate them.
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Loader2, AlertTriangle, MessageSquare } from 'lucide-react'
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
        <div className="px-4 py-2 text-[11px] font-bold text-center bg-blue-50 border-b border-blue-100 text-blue-600">
          {connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
      )}

      {/* Messages area */}
      <div className="relative flex-1 overflow-y-auto px-6 py-10 space-y-4 bg-gradient-to-b from-slate-50/60 to-white text-slate-700">
        {historyError && (
          <p className="relative z-10 text-xs flex items-center gap-1.5 text-red-500 font-bold">
            <AlertTriangle size={12} /> Couldn't load history: {historyError}
          </p>
        )}
        {messages.length === 0 && !historyError && (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
            <MessageSquare className="mb-4 h-14 w-14 text-slate-300" />
            <p className="text-lg font-bold text-slate-950">No messages yet</p>
            <p className="mt-2 text-sm text-slate-500">Start the conversation with your team.</p>
          </div>
        )}
        {messages.map((m) => {
          const senderId = m.sender_role === 'mentor' ? m.sender_mentor_id : m.sender_participant_id
          const isMine = currentSenderId != null
            && m.sender_role === currentSenderRole
            && senderId === currentSenderId
          return (
            <div key={m.id} className={`relative z-10 flex flex-col max-w-[85%] ${isMine ? 'ml-auto items-end' : 'items-start'}`}>
              {!isMine && (
                <span className="text-[10px] font-bold px-1 mb-1 text-slate-500">
                  {m.sender_name}{m.sender_role === 'mentor' ? ' (Mentor)' : ''}
                </span>
              )}
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  isMine ? 'rounded-br-sm text-white bg-blue-600' : 'rounded-bl-sm bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {m.body}
              </div>
              <span className="text-[10px] font-semibold px-1 mt-1 text-slate-400">{formatTime(m.created_at)}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="relative z-10 flex items-center gap-2 p-4 border-t border-slate-200/80 bg-white">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isConnected ? 'Type a message…' : 'Connecting…'}
          disabled={!isConnected}
          className="h-12 flex-1 rounded-full border border-slate-200 bg-slate-100/80 px-5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70 transition-all"
        />
        <button
          type="submit"
          disabled={!isConnected || !draft.trim()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50 shrink-0 transition-colors"
        >
          {connectionState === 'connecting' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="-ml-0.5 mt-0.5" />}
        </button>
      </form>
    </>
  )

  // Inline mode (embedded directly in page)
  if (inline) {
    return <div className="flex flex-col w-full h-full bg-transparent">{chatBody}</div>
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
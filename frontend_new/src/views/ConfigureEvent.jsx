// src/views/ConfigureEvent.jsx
// Phase 5 — LangGraph Conversational Event Builder
//
// Committee member describes their event in plain English.
// The AI agent asks clarifying questions (one at a time),
// collects all 7 required fields, and produces a structured
// config JSON. Admin reviews, clicks Confirm, and the event
// is created in the database.
//
// Backend endpoints used:
//   POST /ai/configure-event          — one chat turn
//   POST /events/create-from-config   — persist the final config

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Bot, User, CheckCircle2, Loader2,
  Sparkles, ArrowLeft, RotateCcw, AlertCircle,
} from 'lucide-react'
import { eventStorage, langgraphApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'

// ── Constants ──────────────────────────────────────────────────────────────

const INITIAL_MESSAGE = {
  role: 'ai',
  text: "Hi! I'll help you configure your event. Tell me about it in plain English — what kind of event are you running, how many rounds, and what's the team size?",
}

function makeSessionId() {
  return crypto.randomUUID()
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ChatBubble({ role, text }) {
  const isUser = role === 'user'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Bot size={14} className="text-white" />
        </div>
      )}

      <div className={`
        max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm
        ${isUser
          ? 'bg-gradient-to-br from-teal-600 to-teal-600 text-white rounded-br-sm'
          : 'bg-white/80 dark:bg-slate-900/80 backdrop-blur text-foreground border border-border rounded-bl-sm'
        }
      `}>
        {text}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 shadow-sm">
          <User size={14} className="text-muted" />
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 justify-start">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Bot size={14} className="text-white" />
      </div>
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-border px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
        <span className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  )
}

function ConfigRow({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-foreground">{String(value)}</p>
    </div>
  )
}

function ConfigSummaryCard({ config, onConfirm, saving, saved }) {
  const [innerError, setInnerError] = useState('')

  async function handleConfirm() {
    setInnerError('')
    try {
      await onConfirm()
    } catch (e) {
      setInnerError(e.message || 'Failed to create event.')
    }
  }

  return (
    <div className="glass-card rounded-xl border border-green-300 bg-green-50/50 p-6 mt-6 shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <CheckCircle2 size={18} className="text-green-600" />
        <h2 className="text-sm font-bold text-green-700 uppercase tracking-wide">
          Configuration Ready
        </h2>
      </div>

      {/* Config grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
        <ConfigRow label="Event Name"      value={config.event_name} />
        <ConfigRow label="Rounds"          value={config.rounds} />
        <ConfigRow label="Team Size"       value={`${config.team_size} members`} />
        <ConfigRow
          label="Elimination"
          value={config.elimination ? 'Yes — losers exit each round' : 'No — all teams continue'}
        />
        <ConfigRow
          label="Stages"
          value={config.stages.join(' → ')}
          wide
        />
        <ConfigRow
          label="Scoring Weights"
          value={config.scoring_weights.map(w => `${(w * 100).toFixed(0)}%`).join(' / ')}
          wide
        />
        <ConfigRow
          label="Approval Gates"
          value={config.approval_gates.join(', ')}
          wide
        />
      </div>

      {/* Error */}
      {innerError && (
        <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm mb-4 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          {innerError}
        </div>
      )}

      {/* CTA */}
      {saved ? (
        <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
          <CheckCircle2 size={16} />
          Event created! Redirecting to dashboard…
        </div>
      ) : (
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full btn-primary rounded-xl px-4 py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-100 disabled:bg-teal-100 dark:disabled:bg-teal-900/50 disabled:text-teal-400 dark:disabled:text-teal-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed disabled:cursor-not-allowed"
        >
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Creating event…</>
            : <><Sparkles size={15} /> Confirm &amp; Create Event</>
          }
        </button>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ConfigureEvent() {
  const navigate    = useNavigate()
  const { loadEvents } = useAuth()
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)

  const [sessionId] = useState(makeSessionId)
  const [messages,  setMessages]  = useState([INITIAL_MESSAGE])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [config,    setConfig]    = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [chatError, setChatError] = useState('')

  // Auto-scroll to bottom on new message or typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Send a message ───────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim()
    if (!text || loading || config) return   // lock input once config is ready

    setInput('')
    setChatError('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)

    try {
      const data = await langgraphApi.chat(text, sessionId)
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }])
      if (data.is_complete && data.config) {
        setConfig(data.config)
      }
    } catch (e) {
      setChatError(
        e.message || 'Could not reach the AI agent. Make sure the backend is running and GOOGLE_API_KEY is set.'
      )
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Reset conversation ───────────────────────────────────────────
  function resetChat() {
    setMessages([INITIAL_MESSAGE])
    setConfig(null)
    setSaved(false)
    setSaving(false)
    setChatError('')
    setInput('')
  }

  // ── Confirm & create event ───────────────────────────────────────
  async function confirmCreate() {
    if (!config) return
    setSaving(true)
    try {
      const created = await langgraphApi.createFromConfig(config)
      if (created?.event_id) eventStorage.set(created.event_id)
      await loadEvents()
      setSaved(true)
      setTimeout(() => navigate('/admin?tab=overview'), 1800)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <AppLayout
      title="AI Event Builder"
      subtitle="Phase 5 — LangGraph"
      customActions={
        <button
          onClick={() => navigate('/admin')}
          className="btn-secondary flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>
      }
    >
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Intro */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
            <Sparkles size={20} className="text-teal-500" />
            Configure Your Event with AI
          </h2>
          <p className="text-sm text-muted">
            Describe your event in plain English. The agent will ask clarifying questions
            and generate a complete configuration — you confirm before anything is saved.
          </p>
        </div>

        {/* Chat window */}
        <div
          className="glass-card rounded-xl border border-border flex flex-col shadow-md"
          style={{ height: '420px' }}
        >
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 bg-background border border-border text-foreground placeholder-slate-400 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all"
              placeholder={config ? 'Configuration complete ✓' : 'Describe your event…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading || !!config}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim() || !!config}
              className="btn-primary flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? <Loader2 size={14} className="animate-spin" />
                : <Send size={14} />
              }
              Send
            </button>
          </div>
        </div>

        {/* Chat-level error */}
        {chatError && (
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm mt-3 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3">
            <AlertCircle size={14} className="flex-shrink-0" />
            {chatError}
          </div>
        )}

        {/* Start over — shown after a few exchanges */}
        {messages.length > 2 && !saved && (
          <div className="flex justify-end mt-3">
            <button
              onClick={resetChat}
              className="text-xs text-muted hover:text-muted flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={11} />
              Start over
            </button>
          </div>
        )}

        {/* Config summary card — appears when is_complete=true */}
        {config && (
          <ConfigSummaryCard
            config={config}
            onConfirm={confirmCreate}
            saving={saving}
            saved={saved}
          />
        )}
      </div>
    </AppLayout>
  )
}
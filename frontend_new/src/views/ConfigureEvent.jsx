// src/views/ConfigureEvent.jsx
// LangGraph conversational event configuration page.
// Committee describes their event in plain English, agent asks
// clarifying questions, and when done shows a config summary
// with a "Confirm & Create Event" button.

import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

const BASE = "http://localhost:8000"

// Generate a stable session ID once per page load
function makeSessionId() {
  return crypto.randomUUID()
}

export default function ConfigureEvent() {
  const navigate     = useNavigate()
  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)

  const [sessionId]  = useState(makeSessionId)
  const [messages,   setMessages]   = useState([
    {
      role: "ai",
      text: "Hi! I'll help you set up your event. Tell me about it — what kind of event are you running, how many rounds, and roughly how many participants?",
    },
  ])
  const [input,      setInput]      = useState("")
  const [loading,    setLoading]    = useState(false)
  const [config,     setConfig]     = useState(null)   // set when is_complete=true
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState("")

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Send a message to the agent ──────────────────────────────────
  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setError("")
    setMessages(prev => [...prev, { role: "user", text }])
    setLoading(true)

    try {
      const res = await fetch(`${BASE}/ai/configure-event`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, session_id: sessionId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Agent error")
      }

      const data = await res.json()

      setMessages(prev => [...prev, { role: "ai", text: data.reply }])

      if (data.is_complete && data.config) {
        setConfig(data.config)
      }
    } catch (e) {
      setError(e.message || "Something went wrong. Check that the backend is running.")
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Confirm & Create Event ───────────────────────────────────────
  async function confirmCreate() {
    if (!config) return
    setSaving(true)
    setError("")

    try {
      const res = await fetch(`${BASE}/events/create-from-config`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(config),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Failed to save event")
      }

      setSaved(true)
      // Give user a moment to see the success state, then go to dashboard
      setTimeout(() => navigate("/admin"), 1800)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-10 px-4">

      {/* Header */}
      <div className="w-full max-w-2xl mb-6">
        <h1 className="text-2xl font-bold text-white">Configure Event</h1>
        <p className="text-slate-400 text-sm mt-1">
          Describe your event in plain English — the AI will ask clarifying questions and generate the configuration.
        </p>
      </div>

      {/* Chat window */}
      <div className="w-full max-w-2xl bg-slate-900 rounded-xl border border-slate-700 flex flex-col"
           style={{ height: "420px" }}>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`
                max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm leading-relaxed
                ${m.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-slate-700 text-slate-100 rounded-bl-sm"}
              `}>
                {m.text}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 px-4 py-2 rounded-2xl rounded-bl-sm">
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-700 p-3 flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Describe your event..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading || !!config}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim() || !!config}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>

      {/* Config summary card — only shown when is_complete=true */}
      {config && (
        <div className="w-full max-w-2xl mt-6 bg-slate-900 border border-green-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            <h2 className="text-green-400 font-semibold text-sm uppercase tracking-wide">
              Configuration Ready
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <ConfigRow label="Event Name"   value={config.event_name} />
            <ConfigRow label="Rounds"       value={config.rounds} />
            <ConfigRow label="Team Size"    value={`${config.team_size} members`} />
            <ConfigRow label="Elimination"  value={config.elimination ? "Yes" : "No"} />
            <ConfigRow
              label="Stages"
              value={config.stages.join(" → ")}
              wide
            />
            <ConfigRow
              label="Scoring Weights"
              value={config.scoring_weights.map(w => `${(w * 100).toFixed(0)}%`).join(" / ")}
              wide
            />
            <ConfigRow
              label="Approval Gates"
              value={config.approval_gates.join(", ")}
              wide
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm mb-3">{error}</p>
          )}

          {/* Confirm button */}
          {saved ? (
            <div className="flex items-center gap-2 text-green-400 font-medium">
              <span>✓</span>
              <span>Event created! Redirecting to dashboard...</span>
            </div>
          ) : (
            <button
              onClick={confirmCreate}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              {saving ? "Creating event..." : "Confirm & Create Event"}
            </button>
          )}
        </div>
      )}

      {/* Error (chat-level) */}
      {error && !config && (
        <p className="w-full max-w-2xl mt-3 text-red-400 text-sm">{error}</p>
      )}
    </div>
  )
}

// Small helper component for the config summary grid
function ConfigRow({ label, value, wide }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-slate-500 text-xs mb-0.5">{label}</p>
      <p className="text-slate-100 font-medium">{String(value)}</p>
    </div>
  )
}
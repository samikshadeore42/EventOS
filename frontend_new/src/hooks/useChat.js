// src/hooks/useChat.js
// Real-time chat over a WebSocket, with REST history preload and automatic
// reconnect with backoff. Shared by ParticipantPortal (team + mentor chat)
// and MentorPortal (team-mentor chat) — same backend contract for both.
import { useState, useEffect, useRef, useCallback } from 'react'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws')

// kind: 'internal' | 'mentor'
export function useChat({ eventId, teamId, kind, token, enabled = true }) {
  const [messages, setMessages] = useState([])
  const [connectionState, setConnectionState] = useState('idle') // idle | connecting | open | closed | error
  const [historyError, setHistoryError] = useState(null)
  const socketRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const shouldConnectRef = useRef(false)
  // Holds the latest `connect` function so onclose's reconnect timer always
  // calls the current version, without `connect` needing to reference
  // itself before its own declaration finishes.
  const connectRef = useRef(null)

  const canConnect = enabled && !!eventId && !!teamId && !!token

  // ── initial history load (REST) ─────────────────────────────────────
  useEffect(() => {
    if (!canConnect) return
    let cancelled = false
    fetch(`${BASE_URL}/events/${eventId}/chat/${teamId}/${kind}/history?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`History load failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setMessages(data.messages || [])
        setHistoryError(null)
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err.message)
      })
    return () => { cancelled = true }
  }, [canConnect, eventId, teamId, kind, token])

  // ── WebSocket connection with backoff reconnect ─────────────────────
  const connect = useCallback(() => {
    if (!canConnect) return
    // Deferred via microtask: setting state synchronously inside the same
    // call stack as the effect that invokes connect() triggers a cascading
    // re-render lint warning. The WebSocket itself is inherently async
    // anyway (onopen/onmessage/onclose all fire later), so this costs
    // nothing perceptible while keeping the effect body side-effect-only.
    queueMicrotask(() => setConnectionState('connecting'))
    const url = `${WS_BASE_URL}/events/${eventId}/chat/${teamId}/${kind}/ws?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    socketRef.current = ws

    ws.onopen = () => {
      reconnectAttemptRef.current = 0
      setConnectionState('open')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.error) return // validation error from the server, ignore in the stream
        setMessages((prev) => {
          // Dedup: a fast reconnect could occasionally double-receive.
          if (prev.some((m) => m.id === data.id)) return prev
          return [...prev, data]
        })
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = (event) => {
      socketRef.current = null
      setConnectionState('closed')
      // 4403 = our server's explicit auth-rejection close code — don't retry,
      // retrying won't fix an authorization failure.
      if (event.code === 4403 || !shouldConnectRef.current) return
      const attempt = reconnectAttemptRef.current + 1
      reconnectAttemptRef.current = attempt
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15_000) // 1s,2s,4s,...capped 15s
      reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay)
    }

    ws.onerror = () => {
      setConnectionState('error')
    }
  }, [canConnect, eventId, teamId, kind, token])

  // Keep the ref pointed at the latest `connect` so the reconnect timer
  // above always invokes a version with current props/closures.
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    if (!canConnect) return
    shouldConnectRef.current = true
    connect()
    return () => {
      shouldConnectRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [canConnect, connect])

  const sendMessage = useCallback((body) => {
    const trimmed = (body || '').trim()
    if (!trimmed) return false
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ body: trimmed }))
    return true
  }, [])

  return {
    messages,
    connectionState,   // surface this so the UI can show "Reconnecting…" etc.
    historyError,
    sendMessage,
    isConnected: connectionState === 'open',
  }
}
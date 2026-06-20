// src/components/OrgSwitcher.jsx
// Organization switcher dropdown + user menu for the admin dashboard header

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Building, CalendarDays, ChevronDown, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function OrgSwitcher() {
  const {
    activeOrganization,
    availableOrganizations,
    switchOrganization,
    activeEvent,
    availableEvents,
    switchEvent,
    logout,
    payload,
  } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const ref = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setEventOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const userName = payload
    ? `${payload.first_name || ''} ${payload.last_name || ''}`.trim() || payload.email || 'User'
    : 'User'

  const handleLogout = async () => {
    await logout()
    navigate('/auth/login')
  }

  return (
    <div className="flex items-center gap-3" ref={ref}>
      {/* Event Switcher */}
      {availableEvents?.length > 0 && (
        <div className="relative">
          <button
            onClick={() => {
              setEventOpen(!eventOpen)
              setOpen(false)
            }}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all"
            style={{
              border: '1px solid var(--border-soft)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, var(--color-border))' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-soft)' }}
          >
            <CalendarDays size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="max-w-[180px] truncate font-medium">
              {activeEvent?.name || 'Select Event'}
            </span>
            <ChevronDown size={14} className={`transition-transform ${eventOpen ? 'rotate-180' : ''}`} />
          </button>

          {eventOpen && (
            <div className="absolute right-0 mt-1 w-72 app-card rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Events
              </div>

        {availableEvents.map((event) => (
          <button
            key={event.id}
            onClick={() => {
              switchEvent(event)
              setEventOpen(false)
            }}
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
            style={{
              color: activeEvent?.id === event.id ? 'var(--color-primary)' : 'var(--text-main)',
              backgroundColor: activeEvent?.id === event.id ? 'var(--bg-card-soft)' : 'transparent',
              fontWeight: activeEvent?.id === event.id ? 600 : 400,
            }}
            onMouseEnter={e => { if (activeEvent?.id !== event.id) e.currentTarget.style.backgroundColor = 'var(--bg-card-soft)' }}
            onMouseLeave={e => { if (activeEvent?.id !== event.id) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <CalendarDays
              size={14}
              style={{ color: activeEvent?.id === event.id ? 'var(--color-primary)' : 'var(--text-muted)' }}
            />
            <span className="truncate">{event.name}</span>

            {activeEvent?.id === event.id && (
              <span className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
            )}
          </button>
        ))}
      </div>
    )}
  </div>
)}
      {/* Organization Switcher */}
      {availableOrganizations?.length > 0 && (
        <div className="relative">
          <button
            onClick={() => {
              setOpen(!open)
              setEventOpen(false)
            }}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all"
            style={{
              border: '1px solid var(--border-soft)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, var(--color-border))' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-soft)' }}
          >
            <Building size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="max-w-[160px] truncate font-medium">
              {activeOrganization?.name || 'Select Organization'}
            </span>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 mt-1 w-64 app-card rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Organizations
              </div>
              {availableOrganizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    switchOrganization(org)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                  style={{
                    color: activeOrganization?.id === org.id ? 'var(--color-primary)' : 'var(--text-main)',
                    backgroundColor: activeOrganization?.id === org.id ? 'var(--bg-card-soft)' : 'transparent',
                    fontWeight: activeOrganization?.id === org.id ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (activeOrganization?.id !== org.id) e.currentTarget.style.backgroundColor = 'var(--bg-card-soft)' }}
                  onMouseLeave={e => { if (activeOrganization?.id !== org.id) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Building size={14} style={{ color: activeOrganization?.id === org.id ? 'var(--color-primary)' : 'var(--text-muted)' }} />
                  <span className="truncate">{org.name}</span>
                  {activeOrganization?.id === org.id && (
                    <span className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                  )}
                </button>
              ))}

              <div style={{ borderTop: '1px solid var(--border-soft)' }} className="mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-card-soft)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* User identity badge */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <div
          className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}
        >
          {userName[0]?.toUpperCase() || '?'}
        </div>
      </div>
    </div>
  )
}

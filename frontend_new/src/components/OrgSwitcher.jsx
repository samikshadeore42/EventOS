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
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-surface transition-colors text-foreground"
          >
            <CalendarDays size={14} className="text-primary" />
            <span className="max-w-[180px] truncate font-medium">
              {activeEvent?.name || 'Select Event'}
            </span>
            <ChevronDown size={14} className={`transition-transform ${eventOpen ? 'rotate-180' : ''}`} />
          </button>

          {eventOpen && (
            <div className="absolute right-0 mt-1 w-72 glass-card rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">
                Events
              </div>

        {availableEvents.map((event) => (
          <button
            key={event.id}
            onClick={() => {
              switchEvent(event)
              setEventOpen(false)
            }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface transition-colors ${
              activeEvent?.id === event.id
                ? 'bg-surface text-primary font-medium'
                : 'text-foreground'
            }`}
          >
            <CalendarDays
              size={14}
              className={activeEvent?.id === event.id ? 'text-primary' : 'text-muted'}
            />
            <span className="truncate">{event.name}</span>

            {activeEvent?.id === event.id && (
              <span className="ml-auto w-2 h-2 rounded-full bg-cardSoft0" />
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
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-surface transition-colors text-foreground"
          >
            <Building size={14} className="text-primary" />
            <span className="max-w-[160px] truncate font-medium">
              {activeOrganization?.name || 'Select Organization'}
            </span>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 mt-1 w-64 glass-card rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">
                Organizations
              </div>
              {availableOrganizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    switchOrganization(org)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface transition-colors ${
                    activeOrganization?.id === org.id ? 'bg-surface text-primary font-medium' : 'text-foreground'
                  }`}
                >
                  <Building size={14} className={activeOrganization?.id === org.id ? 'text-primary' : 'text-muted'} />
                  <span className="truncate">{org.name}</span>
                  {activeOrganization?.id === org.id && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-cardSoft0" />
                  )}
                </button>
              ))}

              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary hover:bg-surface transition-colors"
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
      <div className="flex items-center gap-2 text-xs text-muted">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cardSoft0 to-teal-500 text-white text-xs font-bold flex items-center justify-center">
          {userName[0]?.toUpperCase() || '?'}
        </div>
      </div>
    </div>
  )
}

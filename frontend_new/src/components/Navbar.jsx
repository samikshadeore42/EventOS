import { Menu, X } from 'lucide-react'
import EventOSLogo from './EventOSLogo'
import ThemeToggle from './ThemeToggle'

export default function Navbar({
  title = "EventOS Platform",
  subtitle = "Event Orchestration System.",
  userName = "User",
  customActions = null,
  mobileMenuOpen,
  setMobileMenuOpen,
  onMenuClick,
  hasMobileMenu = false,
  mobileBreakpoint = 'md'
}) {
  return (
    <header
      className="px-4 sm:px-6 py-3 flex items-center justify-between relative z-50 sticky top-0 w-full transition-colors"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {hasMobileMenu && (
          <button
            onClick={() => {
              if (onMenuClick) onMenuClick()
              else if (setMobileMenuOpen) setMobileMenuOpen(!mobileMenuOpen)
            }}
            className="p-2 -ml-2 rounded-lg transition-all hover:bg-[var(--bg-card-soft)]"
            style={{ color: 'var(--text-main)' }}
          >
            {mobileMenuOpen && mobileBreakpoint !== 'never' && window.innerWidth < (mobileBreakpoint === 'lg' ? 1024 : 768) ? <X size={24} /> : <Menu size={24} />}
          </button>
        )}
        <EventOSLogo className="shrink-0" style={{ color: 'var(--color-primary)' }} size={32} />
        <div className="pl-4 hidden sm:block" style={{ borderLeft: '1px solid var(--border-soft)' }}>
          <h1 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-main)' }}>{title}</h1>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span
          className="hidden lg:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full app-pill"
        >
          <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ backgroundColor: 'var(--color-success)', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
          System Live
        </span>
        <ThemeToggle />
        {customActions}
        {userName && !customActions && (
          <div className="flex items-center gap-2 text-xs ml-1 sm:ml-2" style={{ color: 'var(--text-muted)' }}>
            <div
              className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-sm"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {userName[0]?.toUpperCase() || '?'}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

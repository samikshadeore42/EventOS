import { Menu, X } from 'lucide-react'
import EventOSLogo from './EventOSLogo'
import ThemeToggle from './ThemeToggle'

export default function Navbar({
  title = "EventOS Platform",
  subtitle = "Hackathon Operating System",
  userName = "User",
  customActions = null,
  mobileMenuOpen,
  setMobileMenuOpen,
  onMenuClick,
  hasMobileMenu = false,
  mobileBreakpoint = 'md'
}) {
  return (
    <header className="glass-panel border-b border-border dark:border-slate-800 px-4 sm:px-6 py-4 flex items-center justify-between relative z-50 sticky top-0 w-full transition-colors">
      <div className="flex items-center gap-3 sm:gap-4">
        {hasMobileMenu && (
          <button
            onClick={() => {
              if (onMenuClick) onMenuClick()
              else if (setMobileMenuOpen) setMobileMenuOpen(!mobileMenuOpen)
            }}
            className={`p-2 -ml-2 text-foreground hover:opacity-80 transition-opacity`}
          >
            {mobileMenuOpen && mobileBreakpoint !== 'never' && window.innerWidth < (mobileBreakpoint === 'lg' ? 1024 : 768) ? <X size={24} /> : <Menu size={24} />}
          </button>
        )}
        <EventOSLogo className="text-teal-600 dark:text-teal-400 shrink-0" size={32} />
        <div className="border-l border-border dark:border-slate-700 pl-4 hidden sm:block">
          <h1 className="text-sm font-bold text-foreground dark:text-slate-100 uppercase tracking-wide">{title}</h1>
          <p className="text-xs font-medium text-muted">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden lg:flex items-center gap-2 text-xs font-semibold text-muted dark:text-slate-300 bg-surface dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-border/50 dark:border-slate-700/50">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          System Live
        </span>
        <ThemeToggle />
        {customActions}
        {userName && !customActions && (
          <div className="flex items-center gap-2 text-xs text-muted ml-1 sm:ml-2">
            <div className="w-8 h-8 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
              {userName[0]?.toUpperCase() || '?'}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

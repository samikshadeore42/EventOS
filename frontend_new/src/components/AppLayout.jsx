import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Navbar from './Navbar'

function SidebarNav({ navigationItems, onItemClick }) {
  return (
    <nav className="p-3 space-y-0.5 w-full">
      <div className="px-3 pt-2 pb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Main
        </span>
      </div>
      {navigationItems.map((item) => (
        <button
          key={item.key}
          onClick={() => {
            item.onClick()
            if (onItemClick) onItemClick()
          }}
          className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-out ${
            item.isActive
              ? 'bg-red-50 text-red-600 shadow-sm'
              : 'text-slate-700 hover:translate-x-1 hover:bg-red-50/70 hover:text-red-600 hover:shadow-sm'
          }`}
        >
          <span
            className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-red-500 transition-all duration-200 ${
              item.isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          />
          {item.Icon && (
              <item.Icon
                size={18}
                className={`relative z-10 shrink-0 transition-transform duration-200 ${
                  item.isActive ? 'text-red-600' : 'text-slate-700 group-hover:scale-110 group-hover:text-red-600'
                }`}
              />
            )}
          <span className="relative z-10 truncate">{item.label}</span>
          {item.suffix && (
            <span className="ml-auto text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
              {item.suffix}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

export default function AppLayout({
  title,
  subtitle,
  userName,
  customActions,
  navigationItems = [],
  children,
  mobileBreakpoint = 'md',
  showDesktopSidebar = true,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => localStorage.getItem('eventosSidebarCollapsed') === 'true')

  const hiddenClass = mobileBreakpoint === 'lg' ? 'lg:hidden' : 'md:hidden'
  const blockClass = mobileBreakpoint === 'lg' ? 'hidden lg:flex' : 'hidden md:flex'

  const hasItems = navigationItems.length > 0
  const renderSidebar = hasItems && showDesktopSidebar

  const toggleMenu = () => {
    const isDesktop = window.innerWidth >= (mobileBreakpoint === 'lg' ? 1024 : 768)
    if (isDesktop && renderSidebar) {
      setDesktopSidebarCollapsed(prev => {
        const next = !prev
        localStorage.setItem('eventosSidebarCollapsed', next.toString())
        return next
      })
    } else {
      setMobileMenuOpen(!mobileMenuOpen)
    }
  }

  return (
    <div className="app-shell flex flex-col" style={{ height: renderSidebar ? '100vh' : 'auto', minHeight: '100vh' }}>
      <Navbar
        title={title}
        subtitle={subtitle}
        userName={userName}
        customActions={customActions}
        hasMobileMenu={hasItems}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onMenuClick={toggleMenu}
        mobileBreakpoint={mobileBreakpoint}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {renderSidebar && (
          <aside
            className={`${blockClass} flex-col ${desktopSidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-64'} shrink-0 transition-all duration-300`}
            style={{
              backgroundColor: 'var(--bg-sidebar)',
              borderRight: desktopSidebarCollapsed ? 'none' : '1px solid var(--border-soft)',
            }}
          >
            <div className={`flex flex-col h-full w-64 ${desktopSidebarCollapsed ? 'invisible' : 'visible'}`}>
              <SidebarNav navigationItems={navigationItems} />
            </div>
          </aside>
        )}

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && hasItems && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
                className={`fixed inset-0 z-[60] ${hiddenClass}`}
                style={{ backgroundColor: 'rgba(15,17,21,0.6)' }}
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed inset-y-0 left-0 w-3/4 max-w-sm shadow-2xl z-[70] overflow-y-auto ${hiddenClass}`}
                style={{
                  backgroundColor: 'var(--bg-sidebar)',
                  borderRight: '1px solid var(--border-soft)',
                }}
              >
                <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <h2 className="font-bold" style={{ color: 'var(--text-main)' }}>Navigation</h2>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 -mr-2 rounded-full transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={20} />
                  </button>
                </div>
                <SidebarNav navigationItems={navigationItems} onItemClick={() => setMobileMenuOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main
          className="flex-1 relative z-10 w-full overflow-y-auto"
          style={{
            backgroundColor: 'var(--bg-main)',
            padding: '24px 32px',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

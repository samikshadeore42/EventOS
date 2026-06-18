import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Navbar from './Navbar'

export default function AppLayout({
  title,
  subtitle,
  userName,
  customActions,
  navigationItems = [], // Array of { key, label, Icon, onClick, isActive }
  children,
  mobileBreakpoint = 'md', // 'md' | 'lg'
  showDesktopSidebar = true,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => localStorage.getItem('eventosSidebarCollapsed') === 'true')

  const hiddenClass = mobileBreakpoint === 'lg' ? 'lg:hidden' : 'md:hidden'
  const blockClass = mobileBreakpoint === 'lg' ? 'hidden lg:block' : 'hidden md:block'
  
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
    <div className={`bg-surface dark:bg-slate-900 text-foreground selection:bg-teal-500/30 font-['Plus_Jakarta_Sans'] transition-colors duration-300 flex flex-col ${renderSidebar ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
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

      {/* Main Content Area Container */}
      <div className={`flex flex-1 ${renderSidebar ? 'overflow-hidden' : ''}`}>
        {/* Desktop Sidebar Navigation */}
        {renderSidebar && (
          <aside className={`${blockClass} ${desktopSidebarCollapsed ? 'w-0 border-r-0 opacity-0 px-0 overflow-hidden' : 'w-64 border-r'} shrink-0 border-border bg-surface dark:bg-slate-900 overflow-y-auto transition-all duration-300`}>
            <nav className={`p-4 space-y-1 w-64 ${desktopSidebarCollapsed ? 'invisible' : 'visible'}`}>
              {navigationItems.map((item) => (
                <button
                  key={item.key}
                  onClick={item.onClick}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    item.isActive
                      ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-950 dark:text-teal-50 ring-2 ring-teal-500'
                      : 'text-foreground bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-border/40 hover:border-teal-400 hover:shadow-md hover:-translate-y-0.5 group'
                  }`}
                >
                  {item.Icon && (
                    <item.Icon
                      size={18}
                      className={item.isActive ? 'text-teal-600 dark:text-teal-400' : 'text-muted'}
                    />
                  )}
                  <span className="truncate">{item.label}</span>
                  {item.suffix && <span className="ml-auto text-xs text-muted font-bold">{item.suffix}</span>}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && hasItems && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
                className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] ${hiddenClass}`}
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed inset-y-0 left-0 w-3/4 max-w-sm bg-surface dark:bg-slate-900 border-r border-border shadow-2xl z-[70] overflow-y-auto ${hiddenClass}`}
              >
                <div className="p-4 border-b border-border flex justify-between items-center">
                  <h2 className="font-bold text-teal-800 dark:text-teal-400">Navigation</h2>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 -mr-2 text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <nav className="p-4 space-y-1">
                  {navigationItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        item.onClick()
                        setMobileMenuOpen(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        item.isActive
                          ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-950 dark:text-teal-50 ring-2 ring-teal-500'
                          : 'text-foreground bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-border/40 hover:border-teal-400 hover:shadow-md hover:-translate-y-0.5 group'
                      }`}
                    >
                      {item.Icon && (
                        <item.Icon
                          size={18}
                          className={item.isActive ? 'text-teal-600 dark:text-teal-400' : 'text-muted'}
                        />
                      )}
                      <span className="truncate">{item.label}</span>
                      {item.suffix && <span className="ml-auto text-xs text-muted font-bold">{item.suffix}</span>}
                    </button>
                  ))}
                </nav>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className={`flex-1 relative z-10 w-full ${renderSidebar ? 'overflow-y-auto px-4 sm:px-6 py-6 sm:py-8' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8'}`}>
          {renderSidebar ? (
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}

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
          <aside className={`${blockClass} ${desktopSidebarCollapsed ? 'w-0 border-r-0 opacity-0 px-0 overflow-hidden' : 'w-64 border-r'} shrink-0 border-border bg-white overflow-y-auto transition-all duration-300`}>
            <nav className={`p-4 space-y-1 w-64 ${desktopSidebarCollapsed ? 'invisible' : 'visible'}`}>
              {navigationItems.map((item) => (
                <button
                  key={item.key}
                  onClick={item.onClick}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    item.isActive
                      ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-500/50 shadow-sm'
                      : 'text-slate-900 hover:text-teal-600 bg-transparent hover:bg-slate-100 border border-transparent group'
                  }`}
                >
                  {item.Icon && (
                    <item.Icon
                      size={18}
                      className={`transition-colors ${item.isActive ? 'text-amber-600' : 'text-slate-500 group-hover:text-teal-600'}`}
                    />
                  )}
                  <span className="truncate">{item.label}</span>
                  {item.suffix && <span className="ml-auto text-xs text-slate-500 font-bold group-hover:text-teal-600">{item.suffix}</span>}
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
                className={`fixed inset-0 bg-slate-900/50 z-[60] ${hiddenClass}`}
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed inset-y-0 left-0 w-3/4 max-w-sm bg-white border-r border-border shadow-2xl z-[70] overflow-y-auto ${hiddenClass}`}
              >
                <div className="p-4 border-b border-black bg-white flex justify-between items-center">
                  <h2 className="font-bold text-slate-900">Navigation</h2>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
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
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-500/50 shadow-sm'
                          : 'text-slate-900 hover:text-teal-600 bg-transparent hover:bg-slate-100 border border-transparent group'
                      }`}
                    >
                      {item.Icon && (
                        <item.Icon
                          size={18}
                          className={`transition-colors ${item.isActive ? 'text-amber-600' : 'text-slate-500 group-hover:text-teal-600'}`}
                        />
                      )}
                      <span className="truncate">{item.label}</span>
                      {item.suffix && <span className="ml-auto text-xs text-slate-500 font-bold group-hover:text-teal-600">{item.suffix}</span>}
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

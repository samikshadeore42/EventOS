import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Navbar from './Navbar'

export default function AppLayout({
  title,
  subtitle,
  userName,
  customActions,
  navigationItems = [], // Array of { key, label, Icon, onClick, isActive }
  children,
  mobileBreakpoint = 'md', // 'md' | 'lg'
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const hiddenClass = mobileBreakpoint === 'lg' ? 'lg:hidden' : 'md:hidden'

  return (
    <div className="min-h-screen bg-surface dark:bg-slate-900 overflow-x-hidden text-foreground selection:bg-teal-500/30 font-['Plus_Jakarta_Sans'] transition-colors duration-300">
      <Navbar
        title={title}
        subtitle={subtitle}
        userName={userName}
        customActions={customActions}
        hasMobileMenu={navigationItems.length > 0}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        mobileBreakpoint={mobileBreakpoint}
      />

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && navigationItems.length > 0 && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 ${hiddenClass}`}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed inset-y-0 left-0 w-3/4 max-w-sm bg-background border-r border-border shadow-2xl z-50 overflow-y-auto ${hiddenClass}`}
            >
              <div className="p-4 border-b border-border">
                <h2 className="font-bold text-teal-800 dark:text-teal-400">Navigation</h2>
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
                        : 'text-foreground hover:bg-surface border border-transparent'
                    }`}
                  >
                    {item.Icon && (
                      <item.Icon
                        size={18}
                        className={item.isActive ? 'text-teal-600 dark:text-teal-400' : 'text-muted'}
                      />
                    )}
                    {item.label}
                    {item.suffix && <span className="ml-auto">{item.suffix}</span>}
                  </button>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}

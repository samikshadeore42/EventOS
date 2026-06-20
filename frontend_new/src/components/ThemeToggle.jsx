import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle() {
  const { theme, isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="p-2 rounded-xl transition-colors border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--bg-card-soft)]"
      aria-label="Toggle theme"
      title={`Current: ${theme}`}
      style={{ color: 'var(--text-muted)' }}
    >
      {isDark ? (
        <Sun size={20} style={{ color: 'var(--color-primary-light)' }} />
      ) : (
        <Moon size={20} />
      )}
    </button>
  )
}

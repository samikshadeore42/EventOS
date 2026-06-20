import { useCallback, useEffect, useState } from 'react'

export const THEME_KEY = 'theme'

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return

  const safeTheme = theme === 'dark' ? 'dark' : 'light'
  const root = document.documentElement

  root.classList.remove('dark', 'light', 'theme-eventos')
  root.classList.add(safeTheme)
  root.style.colorScheme = safeTheme

  window.localStorage.setItem(THEME_KEY, safeTheme)
  window.dispatchEvent(new CustomEvent('eventos-theme-change', { detail: safeTheme }))
}

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const syncTheme = () => setTheme(getStoredTheme())

    window.addEventListener('storage', syncTheme)
    window.addEventListener('eventos-theme-change', syncTheme)

    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('eventos-theme-change', syncTheme)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  }
}

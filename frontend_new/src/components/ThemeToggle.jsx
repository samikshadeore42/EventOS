import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'theme-eventos');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl hover:bg-[var(--bg-card-soft)] transition-colors border border-transparent hover:border-[var(--color-border)]"
      aria-label="Toggle Theme"
      title={`Current: ${theme}`}
      style={{ color: 'var(--text-muted)' }}
    >
      {theme === 'dark' ? (
        <Sun size={20} style={{ color: 'var(--color-primary-light)' }} />
      ) : (
        <Moon size={20} />
      )}
    </button>
  );
}

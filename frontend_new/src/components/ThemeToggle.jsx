import { useEffect, useState } from 'react';
import { Moon, Sun, Palette } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-eventos');
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'eventos') {
      root.classList.add('theme-eventos');
    }
    
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycleTheme = () => {
    setTheme(current => current === 'light' ? 'dark' : 'light');
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-xl text-muted hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-soft)] transition-colors border border-transparent hover:border-[var(--color-border)]"
      aria-label="Toggle Theme"
      title={`Current Theme: ${theme}`}
    >
      {theme === 'light' ? (
        <Moon size={20} />
      ) : (
        <Sun size={20} className="text-teal-400" />
      )}
    </button>
  );
}

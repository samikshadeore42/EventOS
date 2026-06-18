import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-2 rounded-xl text-muted hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
      aria-label="Toggle Dark Mode"
    >
      {isDark ? <Sun size={20} className="text-teal-400" /> : <Moon size={20} />}
    </button>
  );
}

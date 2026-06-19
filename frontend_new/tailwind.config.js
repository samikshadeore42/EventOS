/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-main)',
        sidebar: 'var(--bg-sidebar)',
        surface: 'var(--bg-card)',
        card: 'var(--bg-card)',
        cardSoft: 'var(--bg-card-soft)',
        foreground: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: 'var(--color-border)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
          light: 'var(--color-primary-light)',
        },
        success: 'var(--color-success)',
        info: 'var(--color-info)',
        ai: 'var(--color-ai)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      }
    },
  },
  plugins: [],
}

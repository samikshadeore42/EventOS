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
        surface: 'var(--bg-card)',
        foreground: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: 'var(--color-border)',
      }
    },
  },
  plugins: [],
}

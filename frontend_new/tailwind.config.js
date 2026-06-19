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
        amber: {
          50: '#FEF8F4',
          100: '#FDECE1',
          200: '#FAD5BE',
          300: '#F8B996',
          400: '#F6A476',
          500: '#F59F63',
          600: '#E0864B',
          700: '#B86532',
          800: '#944C22',
          900: '#783E1D',
          950: '#421E0B',
        },
        emerald: {
          50: '#F2F9F5',
          100: '#E1F2E8',
          200: '#C4E4D3',
          300: '#9BD1B4',
          400: '#71BC94',
          500: '#52B778',
          600: '#3D965E',
          700: '#32774C',
          800: '#2A5F3E',
          900: '#234E34',
          950: '#122B1C',
        },
        blue: {
          50: '#F2F6FE',
          100: '#E2ECFC',
          200: '#CBDCF8',
          300: '#A8C5F3',
          400: '#83A9EC',
          500: '#5B86E2',
          600: '#4268CD',
          700: '#3552A5',
          800: '#2E4486',
          900: '#293A6A',
          950: '#1A2342',
        }
      }
    },
  },
  plugins: [],
}

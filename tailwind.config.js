/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#08090C',
          800: '#0E1015',
          700: '#161920',
          600: '#222630'
        },
        metallic: {
          light: '#E2E8F0',
          base: '#94A3B8',
          dark: '#475569'
        },
        gold: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706'
        },
        slate: {
          50: 'var(--th-50)',
          100: 'var(--th-100)',
          200: 'var(--th-200)',
          300: 'var(--th-300)',
          400: 'var(--th-400)',
          500: 'var(--th-500)',
          600: 'var(--th-600)',
          700: 'var(--th-700)',
          800: 'var(--th-800)',
          900: 'var(--th-900)'
        },
        amber: {
          50: 'rgb(var(--th-a50) / <alpha-value>)',
          100: 'rgb(var(--th-a100) / <alpha-value>)',
          200: 'rgb(var(--th-a200) / <alpha-value>)',
          300: 'rgb(var(--th-a300) / <alpha-value>)',
          400: 'rgb(var(--th-a400) / <alpha-value>)',
          500: 'rgb(var(--th-a500) / <alpha-value>)',
          600: 'rgb(var(--th-a600) / <alpha-value>)',
          700: 'rgb(var(--th-a700) / <alpha-value>)',
          800: 'rgb(var(--th-a800) / <alpha-value>)',
          900: 'rgb(var(--th-a900) / <alpha-value>)'
        },
        th: {
          'primary': 'var(--th-100)',
          'secondary': 'var(--th-400)',
          'muted': 'var(--th-500)',
          'faint': 'var(--th-600)',
          'surface': 'var(--th-surface)',
          'elevated': 'var(--th-elevated)',
          'line': 'var(--th-border)',
          'line-strong': 'var(--th-border-strong)',
          'soft': 'var(--th-overlay)',
          'soft-strong': 'var(--th-overlay-strong)',
          'accent': 'rgb(var(--th-a400) / <alpha-value>)',
          'accent-hover': 'rgb(var(--th-a300) / <alpha-value>)',
          'accent-ink': 'var(--th-a-ink)',
          'accent-soft': 'var(--th-a-soft)',
          'pill-active': 'var(--th-pill-active)',
          'pill-active-text': 'var(--th-pill-active-text)',
          'np': 'var(--th-np)',
          'err': 'var(--th-err)'
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 12s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 0.4, transform: 'scale(1)' },
          '50%': { opacity: 0.8, transform: 'scale(1.03)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        }
      }
    },
  },
  plugins: [],
}

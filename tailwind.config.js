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

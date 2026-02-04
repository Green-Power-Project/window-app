import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'green-power': {
          50: '#f0f7f2',
          100: '#d9e9df',
          200: '#b8d5c4',
          300: '#8fb8a0',
          400: '#72a47f',
          500: '#72a47f',
          600: '#5d8a6a',
          700: '#4d6f57',
          800: '#3f5a48',
          900: '#344a3b',
        },
        teal: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-green': '0 0 40px -8px rgba(72, 164, 127, 0.4)',
        'glow-teal': '0 0 40px -8px rgba(20, 184, 166, 0.35)',
        'card': '0 4px 20px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 12px 32px rgba(0, 0, 0, 0.1)',
        'card-accent': '0 4px 20px rgba(72, 164, 127, 0.15)',
      },
      borderRadius: {
        'card': '16px',
        'btn': '10px',
        'r-card': '16px',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 50%, #0d9488 100%)',
        'gradient-brand-reverse': 'linear-gradient(135deg, #0d9488 0%, #5d8a6a 100%)',
        'gradient-hero': 'linear-gradient(160deg, rgba(72, 164, 127, 0.15) 0%, rgba(13, 148, 136, 0.12) 50%, rgba(59, 130, 246, 0.08) 100%)',
        'gradient-glass': 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(240,247,242,0.4) 100%)',
      },
    },
  },
  plugins: [],
}
export default config


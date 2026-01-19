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
          50: '#f6f8f6',
          100: '#e8ede8',
          200: '#d1dad1',
          300: '#a8b8a8',
          400: '#7a917a',
          500: '#5d7a5d', // Muted professional green (primary)
          600: '#4a634a', // Dark green (accent)
          700: '#3d513d',
          800: '#344234',
          900: '#2d382d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config


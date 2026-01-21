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
          500: '#72a47f', // Base color
          600: '#5d8a6a',
          700: '#4d6f57',
          800: '#3f5a48',
          900: '#344a3b',
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


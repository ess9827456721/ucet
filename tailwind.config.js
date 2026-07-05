/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        yellow: {
          400: '#FFD600',
          500: '#FFD600',
        },
        dark: {
          900: 'var(--c-dark-900)',
          800: 'var(--c-dark-800)',
          700: 'var(--c-dark-700)',
          600: 'var(--c-dark-600)',
          500: 'var(--c-dark-500)',
        },
        white: 'var(--c-white)',
        gray: {
          300: 'var(--c-gray-300)',
          400: 'var(--c-gray-400)',
          500: 'var(--c-gray-500)',
          600: 'var(--c-gray-600)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      }
    }
  },
  plugins: []
}

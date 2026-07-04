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
          900: '#0F0F0F',
          800: '#1A1A1A',
          700: '#242424',
          600: '#2E2E2E',
          500: '#3A3A3A',
        }
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

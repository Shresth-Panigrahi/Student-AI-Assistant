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
          900: '#000000',
          800: '#0a0a0a',
          700: '#111111',
          600: '#1a1a1a',
          500: '#2a2a2a',
        },
        accent: {
          red: '#ff0000',
          crimson: '#dc143c',
          blue: '#0066ff',
          cyan: '#00bfff',
          green: '#00ff00',
          lime: '#32cd32',
          orange: '#ff6600',
          purple: '#9933ff',
          pink: '#ff1493',
          yellow: '#ffd700',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

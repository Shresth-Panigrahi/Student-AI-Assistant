/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'true-black': '#000000',
        'charcoal': '#0D0D12',
        'dark-gray': '#1C1C24',
        'elevated-surface': '#27272F',
        'royal-purple': '#6D28D9',
        'deep-magenta': '#D946EF',
        'orchid': '#C026D3',
        'gold-highlight': '#FCD34D',
        'rose': '#FB7185',
        'light-gray': '#D4D4D8',
        'secondary-gray': '#A1A1AA',
        'muted-gray': '#71717A',
      },
      backgroundImage: {
        'primary-gradient': 'linear-gradient(135deg, #6D28D9 0%, #D946EF 100%)',
        'hero-gradient': 'linear-gradient(180deg, #000000 0%, #0D0D12 50%, #1C1C24 100%)',
        'glow-gradient': 'radial-gradient(circle, rgba(109, 40, 217, 0.3) 0%, transparent 70%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        }
      }
    },
  },
  plugins: [],
}

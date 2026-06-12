/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // No pure black/white anywhere — both are remapped to near-values.
      colors: {
        white: '#F4F7FC',
        black: '#060A12',
        // Elevation scale: 950 page → 925 sidebar → 900 card → 850 elevated → 800 modal
        navy: {
          950: '#0A101D',
          925: '#0C1322',
          900: '#101829',
          850: '#141D31',
          800: '#192339',
          700: '#22304C',
        },
        accent: {
          DEFAULT: '#2F9BEF',
          hover: '#4DACF5',
          deep: '#0E6CC2',
        },
        gold: '#D2B468',
        ink: '#E2E9F4',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderColor: {
        faint: 'rgba(255,255,255,0.04)',
        subtle: 'rgba(255,255,255,0.07)',
        strong: 'rgba(255,255,255,0.13)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(4,9,20,0.5)',
        raised: '0 2px 8px rgba(4,9,20,0.5)',
        modal: '0 16px 48px rgba(3,7,16,0.55), 0 4px 12px rgba(3,7,16,0.45)',
      },
    },
  },
  plugins: [],
};

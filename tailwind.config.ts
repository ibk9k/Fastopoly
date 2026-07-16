import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Core identity — the cream/green board-game palette, formalized.
        pine: {
          DEFAULT: '#2F4D20', // brand ink & primary actions
          soft: '#4A6B38',
          deep: '#1A472A',
        },
        parchment: {
          DEFAULT: '#F7F0E4', // app background
          raised: '#FDFBF7', // cards, modals
        },
        salmon: {
          DEFAULT: '#EFA38F', // panel surface
          line: '#D28B7A', // panel borders
          soft: '#E58A74',
        },
        felt: {
          DEFAULT: '#BAED91', // board felt + text on pine
        },
        danger: {
          DEFAULT: '#9F1239', // rose-800 — readable on parchment
          surface: '#FFF1F2',
          line: '#FDA4AF',
        },
        success: {
          DEFAULT: '#065F46',
          surface: '#ECFDF5',
        },
        // Player seat colors (order = seat order)
        seat: {
          1: '#EF4444',
          2: '#3B82F6',
          3: '#FACC15',
          4: '#22C55E',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      // Stacking contract: everything overlaid lives on exactly one of these layers.
      zIndex: {
        board: '10',
        panel: '20',
        modal: '40',
        toast: '50',
        critical: '60',
      },
      boxShadow: {
        card: '0 4px 12px rgba(47, 77, 32, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
        overlay: '0 25px 50px -12px rgba(24, 24, 27, 0.35)',
      },
    },
  },
  plugins: [],
}

export default config

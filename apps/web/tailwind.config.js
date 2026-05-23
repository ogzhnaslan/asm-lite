/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      animation: {
        'fade-in':      'fadeIn 0.35s ease-out',
        'slide-up':     'slideUp 0.35s ease-out',
        'scale-in':     'scaleIn 0.2s ease-out',
        'glow-pulse':   'glowPulse 2s ease-in-out infinite',
        'gauge-fill':   'gaugeFill 1s ease-out forwards',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
        'scan-sweep':   'scanSweep 4s linear infinite',
        'ping-green':   'pingGreen 1.5s cubic-bezier(0,0,0.2,1) infinite',
        'flicker':      'flicker 0.15s ease-in-out 2',
        'type-in':      'typeIn 0.4s steps(20, end)',
      },
      keyframes: {
        fadeIn:       { from: { opacity: '0' },                                   to: { opacity: '1' } },
        slideUp:      { from: { opacity: '0', transform: 'translateY(16px)' },    to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:      { from: { opacity: '0', transform: 'scale(0.95)' },         to: { opacity: '1', transform: 'scale(1)' } },
        glowPulse:    { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        cursorBlink:  { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
        pingGreen:    { '75%,100%': { transform: 'scale(2)', opacity: '0' } },
        flicker:      { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        typeIn:       { from: { width: '0' }, to: { width: '100%' } },
        scanSweep: {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '5%':   { opacity: '1' },
          '95%':  { opacity: '1' },
          '100%': { transform: 'translateY(100vh)', opacity: '0' },
        },
      },
      colors: {
        terminal: {
          green:   '#00ff41',
          cyan:    '#00d4ff',
          amber:   '#ffb700',
          red:     '#ff3333',
          bg:      '#020202',
          surface: '#080808',
          card:    '#0d0d0d',
          border:  '#0f1f0f',
          dim:     '#052e16',
          muted:   '#14532d',
        },
        dark: {
          900: '#06090f',
          800: '#0a0f1c',
          700: '#0d1420',
          600: '#111827',
          500: '#1a2234',
          400: '#243049',
        },
      },
    },
  },
  plugins: [],
};

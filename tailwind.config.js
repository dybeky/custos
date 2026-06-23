/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // ── Coffee-noir design-system tokens: black & white with coffee accents ──
        bg: '#0a0908',
        panel: '#141110',
        'panel-2': '#1c1815',
        ink: '#f4f0ea',
        'ink-dim': '#a89f93',
        scan: '#c89a6a',
        'scan-dim': '#8a7b68',
        alert: '#e0604c',
        amber: '#e3a45c',
        'on-accent': '#14100c',
        // ── Legacy tokens (kept so existing components don't break) ──
        // Warm near-black base
        background: {
          DEFAULT: '#0a0908',
          surface: '#141110',
          elevated: '#1c1815'
        },
        // The single coffee accent family — the only palette in the app
        accent: {
          lavender: '#D9BC9A',
          purple: '#B0A696',
          sky: '#B0A696',
          blue: '#c89a6a'
        },
        primary: {
          DEFAULT: '#c89a6a',
          hover: '#D9BC9A',
          muted: 'rgba(200, 154, 106, 0.12)'
        },
        // Legacy token name, remapped onto the coffee palette
        aurora: {
          purple: '#B0A696',
          blue: '#c89a6a'
        },
        // Semantic status colors — kept only for scan results & health,
        // desaturated so the UI still reads black-and-white-first
        success: {
          DEFAULT: '#8FBF9F',
          muted: 'rgba(143, 191, 159, 0.12)'
        },
        error: {
          DEFAULT: '#D98E8E',
          muted: 'rgba(217, 142, 142, 0.12)'
        },
        warning: {
          DEFAULT: '#D9B380',
          muted: 'rgba(217, 179, 128, 0.12)'
        },
        text: {
          primary: 'rgba(237, 231, 222, 0.95)',
          secondary: 'rgba(237, 231, 222, 0.6)',
          muted: 'rgba(237, 231, 222, 0.4)'
        },
        border: {
          DEFAULT: 'rgba(237, 231, 222, 0.08)',
          hover: 'rgba(200, 164, 126, 0.25)'
        }
      },
      fontFamily: {
        display: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif'],
        body: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      fontSize: {
        '2xs': '0.625rem'
      },
      spacing: {
        'sidebar': '65px'
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px'
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 32px -10px rgba(200, 164, 126, 0.25)',
        'glow-success': '0 0 20px rgba(143, 191, 159, 0.2)',
        'glow-purple': '0 0 15px rgba(200, 164, 126, 0.3)'
      },
      backdropBlur: {
        'glass': '20px'
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'blob-1': 'blob1 20s ease-in-out infinite',
        'blob-2': 'blob2 25s ease-in-out infinite'
      },
      keyframes: {
        blob1: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(100px, -80px) scale(1.1)' },
          '50%': { transform: 'translate(-50px, 60px) scale(0.95)' },
          '75%': { transform: 'translate(70px, 40px) scale(1.05)' }
        },
        blob2: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(-80px, 100px) scale(0.95)' },
          '50%': { transform: 'translate(40px, -60px) scale(1.05)' },
          '75%': { transform: 'translate(-60px, -40px) scale(1)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        }
      }
    }
  },
  plugins: []
}

/** Color from a theme channel variable, with Tailwind alpha support. */
const c = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // ── Themeable design tokens ──
        // Every color resolves to a CSS channel variable defined per theme in
        // styles/index.css, so utilities keep alpha support (bg-scan/10) and
        // switching <html data-theme> recolors the whole app.
        bg: c('bg'),
        panel: c('panel'),
        'panel-2': c('panel-2'),
        ink: c('ink'),
        'ink-dim': c('ink-dim'),
        scan: c('scan'),
        'scan-2': c('scan-2'),
        'scan-dim': c('scan-dim'),
        alert: c('alert'),
        amber: c('amber'),
        ok: c('ok'),
        'on-accent': c('on-accent'),
        // ── Legacy tokens (kept so existing components don't break) ──
        background: {
          DEFAULT: c('bg'),
          surface: c('panel'),
          elevated: c('panel-2')
        },
        accent: {
          lavender: c('scan-2'),
          purple: c('scan-dim'),
          sky: c('scan-dim'),
          blue: c('scan')
        },
        primary: {
          DEFAULT: c('scan'),
          hover: c('scan-2'),
          muted: 'rgb(var(--scan-rgb) / 0.12)'
        },
        aurora: {
          purple: c('scan-dim'),
          blue: c('scan')
        },
        success: {
          DEFAULT: c('ok'),
          muted: 'rgb(var(--ok-rgb) / 0.12)'
        },
        error: {
          DEFAULT: c('alert'),
          muted: 'rgb(var(--alert-rgb) / 0.12)'
        },
        warning: {
          DEFAULT: c('amber'),
          muted: 'rgb(var(--amber-rgb) / 0.12)'
        },
        text: {
          primary: 'rgb(var(--ink-rgb) / 0.95)',
          secondary: 'rgb(var(--ink-rgb) / 0.6)',
          muted: 'rgb(var(--ink-rgb) / 0.4)'
        },
        border: {
          DEFAULT: 'rgb(var(--ink-rgb) / 0.08)',
          hover: 'rgb(var(--scan-rgb) / 0.25)'
        }
      },
      fontFamily: {
        display: ['Custos G', 'MuseoModerno', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Custos G', 'MuseoModerno', 'Inter', 'system-ui', 'sans-serif'],
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
        'glow': '0 0 32px -10px rgb(var(--scan-rgb) / 0.25)',
        'glow-success': '0 0 20px rgb(var(--ok-rgb) / 0.2)',
        'glow-purple': '0 0 15px rgb(var(--scan-rgb) / 0.3)'
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

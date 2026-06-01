/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // ── Custosweb design-system tokens ──
        bg: '#0d0f1f',
        panel: '#16182c',
        'panel-2': '#1f2238',
        ink: '#ecedff',
        'ink-dim': '#9698c0',
        scan: '#80a8ff',
        'scan-dim': '#8ec1de',
        alert: '#ff6b83',
        amber: '#ffc24b',
        // ── Legacy tokens (kept so existing components don't break) ──
        // Deep cool-navy base
        background: {
          DEFAULT: '#0a0b12',
          surface: '#12131c',
          elevated: '#1b1d2a'
        },
        // The single pastel accent family — the only palette in the app
        accent: {
          lavender: '#D3D3FF',
          purple: '#CEB5FF',
          sky: '#8EC1DE',
          blue: '#80A8FF'
        },
        primary: {
          DEFAULT: '#80A8FF',
          hover: '#9cbcff',
          muted: 'rgba(128, 168, 255, 0.12)'
        },
        // Legacy token name, remapped onto the pastel palette
        aurora: {
          purple: '#CEB5FF',
          blue: '#80A8FF'
        },
        // Semantic status colors — kept only for scan results & health
        success: {
          DEFAULT: '#34D399',
          muted: 'rgba(52, 211, 153, 0.12)'
        },
        error: {
          DEFAULT: '#FF5C73',
          muted: 'rgba(255, 92, 115, 0.12)'
        },
        warning: {
          DEFAULT: '#FFB84D',
          muted: 'rgba(255, 184, 77, 0.12)'
        },
        text: {
          primary: 'rgba(255, 255, 255, 0.95)',
          secondary: 'rgba(255, 255, 255, 0.6)',
          muted: 'rgba(255, 255, 255, 0.4)'
        },
        border: {
          DEFAULT: 'rgba(206, 181, 255, 0.1)',
          hover: 'rgba(206, 181, 255, 0.22)'
        }
      },
      fontFamily: {
        display: ['MuseoModerno', 'system-ui', 'sans-serif'],
        body: ['MuseoModerno', 'system-ui', 'sans-serif'],
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
        'glow': '0 0 40px -8px rgba(128,168,255,0.35)',
        'glow-success': '0 0 20px rgba(52, 211, 153, 0.3)',
        'glow-purple': '0 0 15px rgba(206, 181, 255, 0.45)'
      },
      backdropBlur: {
        'glass': '20px'
      },
      animation: {
        'aurora': 'aurora 20s ease infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'gradient-text': 'gradientText 3s ease infinite',
        'gradient-bg': 'gradientBg 8s ease infinite',
        'gradient-pan': 'gradientPan 24s linear infinite',
        'gradient-border': 'gradientBorder 3s ease infinite',
        'blob-1': 'blob1 20s ease-in-out infinite',
        'blob-2': 'blob2 25s ease-in-out infinite',
        'blob-3': 'blob3 18s ease-in-out infinite',
        'blob-4': 'blob4 22s ease-in-out infinite'
      },
      keyframes: {
        aurora: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(10%, 10%) scale(1.1)' },
          '50%': { transform: 'translate(-5%, 5%) scale(0.95)' },
          '75%': { transform: 'translate(-10%, -10%) scale(1.05)' }
        },
        gradientText: {
          '0%': { backgroundPosition: '0% center' },
          '50%': { backgroundPosition: '100% center' },
          '100%': { backgroundPosition: '0% center' }
        },
        gradientBg: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' }
        },
        // Seamless one-direction pan: shifts by exactly one full gradient
        // period, so 0% and 100% frames are identical — endless, no reverse.
        gradientPan: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' }
        },
        gradientBorder: {
          '0%': { backgroundPosition: '0% center' },
          '50%': { backgroundPosition: '100% center' },
          '100%': { backgroundPosition: '0% center' }
        },
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
        blob3: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(60px, -40px) scale(1.05)' },
          '50%': { transform: 'translate(-30px, 80px) scale(0.9)' },
          '75%': { transform: 'translate(-50px, -30px) scale(1.1)' }
        },
        blob4: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(-50px, 50px) scale(0.9)' },
          '50%': { transform: 'translate(70px, -30px) scale(1.1)' },
          '75%': { transform: 'translate(30px, 60px) scale(0.95)' }
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

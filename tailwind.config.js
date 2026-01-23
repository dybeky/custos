/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand colors
        background: {
          DEFAULT: '#0a0a0f',
          surface: '#12121a',
          elevated: '#1a1a24'
        },
        primary: {
          DEFAULT: '#FF6B00',
          hover: '#FF8533',
          muted: 'rgba(255, 107, 0, 0.1)'
        },
        success: {
          DEFAULT: '#00BFA5',
          muted: 'rgba(0, 191, 165, 0.1)'
        },
        error: {
          DEFAULT: '#FF5252',
          muted: 'rgba(255, 82, 82, 0.1)'
        },
        warning: {
          DEFAULT: '#FFB300',
          muted: 'rgba(255, 179, 0, 0.1)'
        },
        aurora: {
          purple: '#c6a2e8',
          blue: '#515ef5'
        },
        text: {
          primary: 'rgba(255, 255, 255, 0.95)',
          secondary: 'rgba(255, 255, 255, 0.6)',
          muted: 'rgba(255, 255, 255, 0.4)'
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.15)'
        }
      },
      fontFamily: {
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
        'glow': '0 0 20px rgba(255, 107, 0, 0.3)',
        'glow-success': '0 0 20px rgba(0, 191, 165, 0.3)',
        'glow-purple': '0 0 15px rgba(198, 162, 232, 0.4)'
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

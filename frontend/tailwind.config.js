module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Military / tactical palette: olive drab + brass on dark olive.
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(79, 45%, 42%)', // Olive drab
        background: 'hsl(80, 10%, 6%)', // Dark olive black
        foreground: 'hsl(60, 8%, 90%)',
        primary: {
          DEFAULT: 'hsl(79, 45%, 42%)', // Olive drab green
          foreground: 'hsl(80, 12%, 7%)'
        },
        secondary: {
          DEFAULT: 'hsl(80, 8%, 16%)', // Field gray
          foreground: 'hsl(60, 8%, 90%)'
        },
        destructive: {
          DEFAULT: 'hsl(2, 60%, 42%)', // Alert red
          foreground: 'hsl(0, 0%, 98%)'
        },
        muted: {
          DEFAULT: 'hsl(80, 8%, 16%)',
          foreground: 'hsl(80, 6%, 60%)'
        },
        accent: {
          DEFAULT: 'hsl(43, 74%, 49%)', // Brass / amber
          foreground: 'hsl(80, 12%, 7%)'
        },
        popover: {
          DEFAULT: 'hsl(80, 10%, 7%)',
          foreground: 'hsl(60, 8%, 90%)'
        },
        card: {
          DEFAULT: 'hsla(80, 10%, 8%, 0.72)', // Semi-transparent dark olive
          foreground: 'hsl(60, 8%, 90%)'
        },
        tertiary: 'hsl(95, 40%, 45%)', // Field green (used on result screens)
        success: 'hsl(95, 40%, 45%)',
        warning: 'hsl(43, 90%, 52%)',
        info: 'hsl(43, 55%, 58%)' // Khaki
      },
      fontFamily: {
        sans: ['Oswald', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      borderRadius: {
        lg: '1rem',
        md: '0.75rem',
        sm: '0.5rem'
      },
      keyframes: {
        'glitch': {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)', clipPath: 'inset(10% 0 80% 0)' },
          '40%': { transform: 'translate(-2px, -2px)', clipPath: 'inset(80% 0 10% 0)' },
          '60%': { transform: 'translate(2px, 2px)', clipPath: 'inset(30% 0 40% 0)' },
          '80%': { transform: 'translate(2px, -2px)', clipPath: 'inset(50% 0 10% 0)' }
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' }
        },
        'pulse-slow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 }
        },
        'typing': {
          'from': { width: '0' },
          'to': { width: '100%' }
        }
      },
      animation: {
        'glitch': 'glitch 0.3s cubic-bezier(.25, .46, .45, .94) both infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'typing': 'typing 2s steps(40, end)',
        'scanline': 'scanline 8s linear infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
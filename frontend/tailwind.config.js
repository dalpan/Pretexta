module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(142, 70%, 50%)', // Neon Green ring
        background: 'hsl(240, 10%, 3.9%)', // Almost black
        foreground: 'hsl(0, 0%, 98%)',
        primary: {
          DEFAULT: 'hsl(142, 70%, 50%)', // Hacker Green
          foreground: 'hsl(240, 10%, 3.9%)'
        },
        secondary: {
          DEFAULT: 'hsl(240, 3.7%, 15.9%)', // Dark Gray
          foreground: 'hsl(0, 0%, 98%)'
        },
        destructive: {
          DEFAULT: 'hsl(0, 62.8%, 30.6%)',
          foreground: 'hsl(0, 0%, 98%)'
        },
        muted: {
          DEFAULT: 'hsl(240, 3.7%, 15.9%)',
          foreground: 'hsl(240, 5%, 64.9%)'
        },
        accent: {
          DEFAULT: 'hsl(180, 100%, 50%)', // Cyan
          foreground: 'hsl(240, 10%, 3.9%)'
        },
        popover: {
          DEFAULT: 'hsl(240, 10%, 3.9%)',
          foreground: 'hsl(0, 0%, 98%)'
        },
        card: {
          DEFAULT: 'hsla(240, 10%, 3.9%, 0.7)', // Semi-transparent dark
          foreground: 'hsl(0, 0%, 98%)'
        },
        success: 'hsl(142, 71%, 45%)',
        warning: 'hsl(48, 96%, 53%)',
        info: 'hsl(180, 100%, 50%)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
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
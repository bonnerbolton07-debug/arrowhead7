import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Arrowhead 7 — OFFICIAL palette (Bonner.AI aligned, locked 2026-05-12)
        a7: {
          // Backgrounds (use with gradients, never flat)
          void: '#0A0A0A',
          base: '#0C0C0A',
          surface: '#10100E',
          elevated: '#1A1918',
          muted: '#30302E',

          // Teal ramp (cold / tech / interactive)
          'teal-deep': '#0D5C5A',
          'teal-mid': '#1A8E84',
          teal: '#2DD4BF',         // Core brand teal (from Bonner.AI)
          'teal-bright': '#5BE8D5',
          'teal-glow': '#8FF0E5',

          // Copper ramp (hot / creative / premium)
          'copper-ember': '#4A2510',
          'copper-deep': '#6B3A1A',
          'copper-mid': '#8B5A2B',
          copper: '#B87333',       // Core brand copper (from Bonner.AI)
          'copper-bright': '#D4944A',
          'copper-gold': '#E8B06A',

          // Text (warm white, never pure white)
          text: '#F5F0E8',
          'text-secondary': 'rgba(245, 240, 232, 0.7)',
          'text-tertiary': 'rgba(245, 240, 232, 0.4)',
          'text-disabled': 'rgba(245, 240, 232, 0.2)',

          // Semantic
          success: '#2DD4BF',
          error: '#EF4444',
          warning: '#D4944A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        // Signature gradients
        'grad-teal': 'linear-gradient(135deg, #1a9e8f, #2DD4BF, #5BE8D5)',
        'grad-copper': 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
        'grad-dual': 'linear-gradient(135deg, #2DD4BF, #B87333)',
        'grad-dual-bright': 'linear-gradient(135deg, #5BE8D5, #D4944A)',
        'grad-surface': 'linear-gradient(180deg, #10100E, #0A0A0A)',
        'grad-elevated': 'linear-gradient(135deg, #1A1918, #10100E)',
        'grad-void': 'linear-gradient(135deg, #080808, #0C0C0A)',
        // Glow overlays
        'glow-teal': 'radial-gradient(ellipse at 30% 40%, rgba(45,212,191,0.06) 0%, transparent 55%)',
        'glow-copper': 'radial-gradient(ellipse at 70% 60%, rgba(184,115,51,0.05) 0%, transparent 55%)',
        'glow-dual': 'radial-gradient(ellipse at 30% 40%, rgba(45,212,191,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(184,115,51,0.03) 0%, transparent 50%)',
        // Top-edge light lines
        'edge-teal': 'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)',
        'edge-copper': 'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)',
        'edge-dual': 'linear-gradient(90deg, transparent, rgba(45,212,191,0.2), rgba(184,115,51,0.15), transparent)',
      },
      boxShadow: {
        'glow-teal': '0 0 20px rgba(45,212,191,0.15), 0 0 40px rgba(45,212,191,0.05)',
        'glow-teal-strong': '0 0 25px rgba(45,212,191,0.3), 0 0 50px rgba(45,212,191,0.1)',
        'glow-copper': '0 0 20px rgba(184,115,51,0.15), 0 0 40px rgba(184,115,51,0.05)',
        'glow-copper-strong': '0 0 25px rgba(184,115,51,0.3), 0 0 50px rgba(184,115,51,0.1)',
        'glow-dual': '0 0 20px rgba(45,212,191,0.15), 0 0 20px rgba(184,115,51,0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'pulseGlow 4s ease-in-out infinite',
        'render-progress': 'renderProgress 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        renderProgress: {
          '0%': { width: '0%' },
          '50%': { width: '70%' },
          '100%': { width: '100%' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

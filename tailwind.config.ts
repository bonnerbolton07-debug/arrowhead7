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
        // Arrowhead 7 brand palette
        a7: {
          black: '#0A0A0A',
          dark: '#141414',
          gray: '#1E1E1E',
          mid: '#2A2A2A',
          light: '#E5E5E5',
          white: '#FAFAFA',
          accent: '#FF4D00',       // Primary orange
          'accent-hover': '#FF6A2E',
          blue: '#0066FF',
          green: '#00CC66',
          red: '#FF3333',
          yellow: '#FFCC00',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'render-progress': 'renderProgress 2s ease-in-out infinite',
      },
      keyframes: {
        renderProgress: {
          '0%': { width: '0%' },
          '50%': { width: '70%' },
          '100%': { width: '100%' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

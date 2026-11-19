import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff9e6', 100: '#ffefb8', 300: '#ffd54a', 400: '#f9c21a', 500: '#f0b000', 600: '#c98f00', 700: '#8f6500' },
        ink: { 50: '#f4f6fa', 100: '#e6eaf2', 200: '#cdd5e3', 300: '#a3b0c7', 400: '#7384a3', 500: '#52627f', 600: '#3b4861', 700: '#283247', 800: '#161d2e', 900: '#0b1120', 950: '#060a14' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;

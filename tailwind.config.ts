import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // cor da marca vem de variaveis CSS, para cada empresa ter a sua (ver brandCss em src/lib/tenant.ts)
        brand: Object.fromEntries([50, 100, 300, 400, 500, 600, 700].map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`])),
        'on-brand': 'rgb(var(--on-brand) / <alpha-value>)',
        ink: { 50: '#f4f6fa', 100: '#e6eaf2', 200: '#cdd5e3', 300: '#a3b0c7', 400: '#7384a3', 500: '#52627f', 600: '#3b4861', 700: '#283247', 800: '#161d2e', 900: '#0b1120', 950: '#060a14' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;

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
        ink: { 50: '#f7f4fc', 100: '#eee8f8', 200: '#ddd2ef', 300: '#b9a8d6', 400: '#8d7bb0', 500: '#69588e', 600: '#4c3b70', 700: '#372656', 800: '#26173f', 900: '#1b0c30', 950: '#10061d' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;

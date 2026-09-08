import type { Config } from 'tailwindcss';

// Палитра: синьото на европейската лента върху италианската табела + кехлибар за
// предупрежденията („fari accesi“). Нищо стробоскопично, нищо неоново.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        ui: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        plate: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        targa: {
          50: '#eef3fb',
          100: '#d9e4f5',
          500: '#1f4e9c',
          600: '#173f82',
          700: '#123268',
          900: '#0b1f42',
        },
        ambra: {
          400: '#f5b83d',
          500: '#e6a020',
        },
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Системен стек — нула заявки към чужд домейн (GDPR + скорост).
      fontFamily: {
        ui: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Тъмна „нощен Лос Сантос“ палитра — контрастът е проверен за WCAG AA.
        fivem: {
          50: '#eef7f4',
          100: '#d7ece5',
          400: '#4fd1a5',
          500: '#22b581',
          600: '#178f66',
          700: '#136f51',
          900: '#0b1512',
          950: '#070d0b',
        },
      },
    },
  },
  plugins: [],
};

export default config;

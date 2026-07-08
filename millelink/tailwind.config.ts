import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        millelink: {
          50: '#f2f7fb',
          100: '#e7f0f8',
          500: '#3b82c4',
          600: '#2b6cab',
          700: '#255a8e',
          900: '#1d3d5c',
        },
      },
    },
  },
  plugins: [],
};

export default config;

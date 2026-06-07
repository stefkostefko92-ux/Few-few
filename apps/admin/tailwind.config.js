/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Споделена идентичност с мобилното приложение „Помагам".
        background: '#FBF7EF',
        surface: '#FFFFFF',
        'surface-muted': '#F1EADC',
        border: '#E2D9C6',
        ink: '#1F2421',
        'ink-muted': '#5B6159',
        primary: '#15795C',
        'primary-dark': '#0F5C45',
        'primary-soft': '#E2F0EA',
        accent: '#C77B26',
        'accent-soft': '#F7E9D5',
        danger: '#B23A3A',
        'danger-soft': '#F6E2E2',
        success: '#2E7D5B',
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 4px 12px rgba(31, 36, 33, 0.08)',
      },
    },
  },
  plugins: [],
};

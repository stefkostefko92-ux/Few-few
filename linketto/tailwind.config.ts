import type { Config } from 'tailwindcss';

// Дизайн системата на Linketto (фаза 1). Цветовете са СЕМАНТИЧНИ токени —
// CSS променливи с RGB канали в globals.css (светла: :root, тъмна:
// [data-theme="dark"]). Така `bg-surface`, `text-fg-muted`, `border-line` сменят
// стойността си със themата без нито едно `dark:` в компонентите.
// Старата палитра `linketto` остава само за таблото/админа/профилите,
// които още не са пренесени (фази 2–4).
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        ui: ['var(--font-ui)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: token('bg'),
        surface: {
          DEFAULT: token('s1'),
          2: token('s2'),
          3: token('s3'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
          input: token('line-input'),
        },
        fg: {
          DEFAULT: token('fg'),
          2: token('fg-2'),
          muted: token('fg-muted'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          active: token('accent-active'),
          fg: token('accent-fg'),
          text: token('accent-text'),
          soft: token('accent-soft'),
          'soft-fg': token('accent-soft-fg'),
        },
        success: {
          DEFAULT: token('success'),
          soft: token('success-soft'),
          text: token('success-text'),
        },
        warning: {
          DEFAULT: token('warning'),
          soft: token('warning-soft'),
          text: token('warning-text'),
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft'),
          text: token('danger-text'),
        },
        ring: token('ring'),
        linketto: {
          50: '#f2f7fb',
          100: '#e7f0f8',
          500: '#3b82c4',
          600: '#2b6cab',
          700: '#255a8e',
          900: '#1d3d5c',
        },
      },
      // Типографска скала (Manrope): [размер, { височина на реда, трекинг }].
      // Заглавията са плътни, телата — свободни; цифрите са табличните.
      fontSize: {
        display: [
          'clamp(2.5rem, 1.55rem + 3.9vw, 4.5rem)',
          { lineHeight: '1.04', letterSpacing: '-0.035em', fontWeight: '700' },
        ],
        title: [
          'clamp(2rem, 1.5rem + 2vw, 3rem)',
          { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' },
        ],
        heading: [
          'clamp(1.5rem, 1.25rem + 1vw, 2rem)',
          { lineHeight: '1.2', letterSpacing: '-0.025em', fontWeight: '700' },
        ],
        subheading: [
          '1.125rem',
          { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '650' },
        ],
        lead: ['1.1875rem', { lineHeight: '1.65', letterSpacing: '-0.005em' }],
        body: ['0.9375rem', { lineHeight: '1.65' }],
        small: ['0.8125rem', { lineHeight: '1.55' }],
        micro: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.005em' }],
      },
      borderRadius: {
        control: '0.5rem',
        card: '0.75rem',
        panel: '1rem',
      },
      boxShadow: {
        e1: 'var(--shadow-1)',
        e2: 'var(--shadow-2)',
        e3: 'var(--shadow-3)',
        focus: '0 0 0 3px rgb(var(--c-ring) / 0.35)',
      },
      maxWidth: {
        page: '72rem',
        prose: '66ch',
      },
      spacing: {
        header: 'var(--header-h)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;

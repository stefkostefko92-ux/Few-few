import type { Config } from 'tailwindcss';

// Colours come from the CSS tokens in src/app/globals.css (the one dark theme of LiftPilot Premium).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        surface3: 'var(--surface3)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        dim: 'var(--dim)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-soft': 'var(--accent-soft)',
        ok: 'var(--ok)',
        'ok-bg': 'var(--ok-bg)',
        warn: 'var(--warn)',
        'warn-bg': 'var(--warn-bg)',
        fail: 'var(--fail)',
        'fail-bg': 'var(--fail-bg)',
        info: 'var(--info)',
        'info-bg': 'var(--info-bg)',
      },
      fontFamily: {
        // the same stacks as the --font-* tokens (src/app/fonts.css loads the faces)
        body: ['Manrope', '"Manrope Fallback"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        cond: ['Manrope', '"Manrope Fallback"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', '"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

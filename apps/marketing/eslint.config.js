import preset from "@aso/config/eslint";

export default [
  ...preset,
  {
    ignores: [".next/**", "out/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript resolves JSX/browser globals; no-undef double-reports them.
      "no-undef": "off",
    },
  },
];

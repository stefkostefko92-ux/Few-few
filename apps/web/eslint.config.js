import preset from "@aso/config/eslint";

export default [
  ...preset,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript already resolves identifiers / browser globals; no-undef
      // double-reports them in .tsx, so defer to the compiler (tseslint guidance).
      "no-undef": "off",
    },
  },
];

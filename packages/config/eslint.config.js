// @aso/config — shared flat ESLint preset (ESLint v9).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Shared config consumed via `import preset from "@aso/config/eslint"`. */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TS strict house rules — no `any`, prefer `unknown` + zod.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
);

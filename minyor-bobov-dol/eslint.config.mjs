import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "prisma/**", "scripts/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Допускаме съзнателните `any` в малкото места за динамичен достъп до
      // Prisma делегати и JSON-LD; иначе кодът е строго типизиран.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default config;

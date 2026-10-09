// Next 16: eslint-config-next вече издава нативен flat config (масиви), затова
// махаме FlatCompat — той обвиваше конфигите като „extends“ и на 16 гърми с
// „Converting circular structure to JSON“. Спредваме масивите директно.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default eslintConfig;

#!/usr/bin/env node
// Проверява минималната версия на Node преди setup.
const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(`Нужен е Node >= 22 (текущ: ${process.versions.node}).`);
  process.exit(1);
}
console.log(`Node ${process.versions.node} — OK.`);

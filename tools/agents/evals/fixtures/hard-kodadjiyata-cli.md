# Проба (измислен вход — не е реален код в репото)

PR добавя линт за размерите на текстурите и го вкарва в CI гейта. Нищо друго не е сменено.

`tools/fivem/size-lint.mjs` (нов файл):

```js
#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MAX_BYTES = 16 * 1024 * 1024;

export function oversized(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...oversized(p));
    else if ([".ytd", ".ydd", ".yft"].includes(extname(name).toLowerCase()) && st.size > MAX_BYTES) out.push({ p, size: st.size });
  }
  return out;
}

function main(args) {
  const dir = args[0];
  if (!dir) { console.error("употреба: size-lint.mjs <папка>"); return 2; }
  const bad = oversized(dir);
  for (const b of bad) console.log(`✗ ${b.p}: ${(b.size / 1048576).toFixed(1)} MiB > 16 MiB`);
  if (!bad.length) console.log("✓ size-lint: чисто");
  return bad.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
```

`.github/workflows/fivem.yml` (добавен ред в съществуващия job, `runs-on: ubuntu-latest`):

```yaml
      - run: node tools/fivem/size-lint.mjs "fivem/Мои ресурси/stream"
```

В README на ресурсите: „Пускай локално със `node ~/repo/tools/fivem/size-lint.mjs stream/` — на Windows работи от PowerShell.“

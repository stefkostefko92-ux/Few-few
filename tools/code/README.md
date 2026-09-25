# tools/code — SAST/SCA оркестрация (Кодаджията v2.0)

Инструментите намират кандидати; агентът ги **доказва или изхвърля** (reachability/
feasibility адъюдикация). Това маха 72–96% фалшиви тревоги спрямо суров SAST.

```bash
bash tools/code/scan.sh check          # кои инструменти са налични
bash tools/code/scan.sh all .          # sast + deps + secrets
bash tools/code/scan.sh sast zabobovdol/src
bash tools/code/scan.sh secrets --diff # само staged промени
```

Изход: `semgrep.sarif`, `osv.json`, `sbom.json`, `gitleaks.json`.
`semgrep-rules.yml` са репо-специфичните правила (Prisma raw, EJS XSS, NEXT_PUBLIC тайни,
`new PrismaClient()` извън singleton). Допълват `--config auto`.

**Инсталация (по избор, скриптът пропуска липсващите):**
`pipx install semgrep` · `brew install osv-scanner syft gitleaks` (или GitHub releases).

⚠ Pin-вай версиите/дайджестите на инструментите (март 2026: `trivy-action` tag-poisoning).
⚠ Никога не авто-потискай находка — само сваляй приоритет с обосновка.

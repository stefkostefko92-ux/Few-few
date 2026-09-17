# Carbon Stealth Portfolio

10 демо лендинг страници за 10 вида бизнес + цени и пакети, на български, английски и италиански.
Живо на https://portfolio.carbonstealth.eu. Статичен сайт в дизайн езика на carbonstealth.eu, генериран без
runtime зависимости; шрифтовете са самостоятелно хостнати, снимките идват от `tools/photos.mjs` (Pexels).

```bash
cd portfolio
node build.mjs                       # генерира dist/
node --test test/build.test.mjs      # гейтът
node serve.mjs                       # http://127.0.0.1:4180/
```

Подробности за структурата, конвенциите и деплоя → [`CLAUDE.md`](./CLAUDE.md). Проучването зад цените →
[`docs/PRICING-RESEARCH.md`](./docs/PRICING-RESEARCH.md). Сигурност → [`SECURITY.md`](./SECURITY.md).

# Carbon Stealth Portfolio

15 демо лендинг страници за 15 вида бизнес (вкл. онлайн магазин с истинска кошница), реалните ни проекти, цени и пакети, на български, английски и италиански.
Живо на https://portfolio.carbonstealth.eu. Статичен сайт в дизайн езика на carbonstealth.eu, генериран без
runtime зависимости; шрифтовете са самостоятелно хостнати, снимките идват от `tools/photos.mjs` (Open Images/Flickr CC BY 2.0 по `photos.picks.json`, или Pexels).

```bash
cd portfolio
node build.mjs                       # генерира dist/
node --test test/build.test.mjs      # гейтът
node --test api/server.test.mjs      # контактният API (POST /api/contact → Brevo; тайните само на сървъра — api/README.md)
node tools/a11y.mjs                  # WCAG проверка в Chromium (контраст, имена, заглавия) → a11y/report.json
node tools/brochure.mjs              # брошурата А5 → public/broshura/*.pdf
node serve.mjs                       # http://127.0.0.1:4180/
```

Подробности за структурата, конвенциите и деплоя → [`CLAUDE.md`](./CLAUDE.md). Проучването зад цените →
[`docs/PRICING-RESEARCH.md`](./docs/PRICING-RESEARCH.md). Сигурност → [`SECURITY.md`](./SECURITY.md).

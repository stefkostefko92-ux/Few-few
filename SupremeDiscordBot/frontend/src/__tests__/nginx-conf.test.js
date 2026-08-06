// nginx-conf.test.js — гейт срещу изтичане на вътрешния порт в редиректите.
//
// Реален инцидент: пререндерените маршрути са директории (dist/terms/index.html),
// затова заявка за /terms кара nginx да редиректне към /terms/. С подразбиращия
// се `absolute_redirect on` Location се строи от ВЪТРЕШНИТЕ стойности на
// контейнера:
//     location: http://supremebot.carbonstealth.eu:8080/terms/
// Два дефекта наведнъж: изтича вътрешният порт (8080 е 127.0.0.1-only зад
// nginx → линкът е НЕДОСТИЖИМ отвън) и схемата пада от https на http.
// Всички футър линкове (Terms/Privacy/Cookies/EULA/Status/Accessibility) водеха
// до счупен адрес.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const conf = readFileSync(join(__dirname, "..", "..", "nginx.conf"), "utf8");

// Маха коментарите — иначе директива, спомената само в коментар, лъже гейта.
const live = conf
  .split("\n")
  .map((l) => l.replace(/#.*$/, ""))
  .join("\n");

describe("nginx.conf — редиректите не изтичат вътрешния порт", () => {
  it("absolute_redirect е изключен (Location става относителен)", () => {
    expect(live).toMatch(/absolute_redirect\s+off\s*;/);
  });

  it("контейнерът още слуша на вътрешния 8080 (не публичен)", () => {
    // Ако някой смени порта, горното правило става още по-важно — тестът пази
    // двойката „вътрешен порт + относителни редиректи" да се мисли заедно.
    expect(live).toMatch(/listen\s+8080\s*;/);
  });

  it("try_files сервира пререндерените страници директно, без 301", () => {
    // `$uri/` кара nginx да открие директорията и да редиректне (/terms →
    // /terms/) — точно този 301 изтичаше порта и се кешира ПОСТОЯННО в
    // браузърите. `$uri/index.html` дава 200 наведнъж и адресът съвпада с
    // каноничния URL и sitemap.xml (и двата без наклонена черта).
    expect(live).toMatch(/try_files\s+\$uri\s+\$uri\/index\.html\s+\/index\.html\s*;/);
    expect(live).not.toMatch(/try_files\s+\$uri\s+\$uri\/\s/);
  });
});

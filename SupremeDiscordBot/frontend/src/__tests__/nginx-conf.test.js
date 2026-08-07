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

describe("nginx.conf — upstream-ите се резолвират по време на заявка", () => {
  // `proxy_pass http://backend:3000;` с ЛИТЕРАЛНО име се резолвира ВЕДНЪЖ, при
  // старт. Пресъздаден backend контейнер получава нов IP, а nginx чука на стария
  // → 502 за всичко, докато не се рестартира ФРОНТЕНДЪТ. Обикновен
  // `docker compose up -d backend` поваля сайта, без нищо да сочи причината.
  it("има resolver към вградения DNS на Docker", () => {
    expect(live).toMatch(/resolver\s+127\.0\.0\.11\b/);
  });

  it("нито един proxy_pass не ползва литерално име на контейнер", () => {
    const literal = [...live.matchAll(/proxy_pass\s+http:\/\/([^;$\s]+)/g)].map((m) => m[1]);
    expect(literal, `литерален upstream: ${literal.join(" · ")}`).toEqual([]);
  });

  it("proxy_pass с променлива носи явен $request_uri", () => {
    // С променлива nginx НЕ добавя пътя автоматично — без това всяка заявка
    // отива на „/“ и целият API става 404.
    const passes = [...live.matchAll(/proxy_pass\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(passes.length).toBeGreaterThan(0);
    for (const p of passes) expect(p, p).toContain("$request_uri");
  });
});

describe("CSP на /archive съвпада с този на backend-а", () => {
  // Два РАЗЛИЧНИ CSP хедъра се прилагат като СЕЧЕНИЕ — разминаване тихо блокира
  // легитимни ресурси и никой не разбира защо.
  it("двата низа са идентични", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const archive = readFileSync(
      join(__dirname, "..", "..", "..", "backend", "src", "routes", "archive.js"),
      "utf8",
    );
    const fromBackend = [...archive.matchAll(/^\s*"([a-z-]+ [^"]*)",$/gm)]
      .map((m) => m[1])
      .join("; ");
    const fromNginx = live.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
    expect(fromNginx, "nginx няма CSP за /archive").toBeTruthy();
    expect(fromNginx).toBe(fromBackend);
  });
});

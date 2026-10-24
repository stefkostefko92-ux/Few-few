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
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createServer, connect } from "node:net";

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
    expect(live).toMatch(/try_files\s+\$uri\s+\$uri\/index\.html\s+=404\s*;/);
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

// ─── Заглавия за сигурност: едно място, включено ВСЯКЪДЕ ────────────────────
// В nginx `add_header` във вложен блок ЗАМЕСТВА наследените, а не ги допълва.
// Затова заглавията се преписваха ръчно във всяка локация — и това вече беше
// дрейфнало (одит етап 12, 12.08.2026): `/api` и `/public` нямаха НИТО ЕДНО,
// а `/archive` беше без HSTS, при това точно тя сервира транскрипти по
// СПОДЕЛЯНИ линкове, тоест често е първият контакт с домейна.
describe("заглавия за сигурност", () => {
  const snippetPath = new URL("../../nginx-security-headers.conf", import.meta.url);

  it("всяка location блок включва общия файл", () => {
    const locations = live.split("\n").filter((l) => /^\s*location\b/.test(l)).length;
    const includes = live.split("\n").filter((l) => /include\s+\/etc\/nginx\/security-headers\.conf;/.test(l)).length;
    expect(locations, "няма локации — тестът би бил сляп").toBeGreaterThan(0);
    expect(includes, `${includes} включвания за ${locations} локации`).toBe(locations);
  });

  it("общият файл носи задължителния набор", async () => {
    const { readFile } = await import("node:fs/promises");
    const snippet = await readFile(snippetPath, "utf8");
    for (const h of ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy",
                     "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(snippet, `липсва ${h}`).toContain(h);
    }
  });

  it("нула ръчни повторения — иначе дрейфът се връща", () => {
    const dupes = live.split("\n").filter((l) =>
      /^\s*add_header\s+(X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Permissions-Policy|Strict-Transport-Security)\b/.test(l));
    expect(dupes, `преписани на ръка: ${dupes.length}`).toEqual([]);
  });

  it("версията на nginx не изтича в Server заглавието", () => {
    expect(live.split("\n").some((l) => /server_tokens\s+off;/.test(l))).toBe(true);
  });
});

describe("nginx.conf — access логът не пише тайни от адреса", () => {
  // Стандартният формат `main` пише `$request` с целия query низ: `code`/`state`
  // при всеки вход през Discord и `?t=` токена на всеки отворен транскрипт.
  it("server блокът ползва собствен формат, а не подразбиращия се `main`", () => {
    expect(live).toMatch(/access_log\s+\S+\s+supreme_noargs\s*;/);
    expect(live).not.toMatch(/access_log\s+\S+\s+main\s*;/);
  });

  it("форматът няма нищо, което носи query частта", () => {
    const m = live.match(/log_format\s+supreme_noargs\s+([\s\S]*?);/);
    expect(m, "log_format supreme_noargs липсва").toBeTruthy();
    for (const v of ["$request ", "$request\"", "$request_uri", "$args", "$query_string", "$arg_", "$http_referer"]) {
      expect(m[1], v).not.toContain(v);
    }
    expect(m[1]).toContain("$supreme_log_path");
  });

  it("пътят за лога е само частта на $request_uri ПРЕДИ „?“", () => {
    const map = live.match(/map\s+\$request_uri\s+\$supreme_log_path\s*\{([\s\S]*?)\}/);
    expect(map, "map за пътя липсва").toBeTruthy();
    expect(map[1]).toMatch(/\[\^\?\]\*/);
  });
});

// ─── Истински 404 вместо „Soft 404“ (SEO одит, 22.10.2026) ───────────────────
// Обхождане с Googlebot UA: /cs-audit-no-such-page-7781 и
// /cs-audit/no/such/7781.html връщаха 200 + началната страница (без noindex),
// защото последният кандидат на try_files беше `/index.html`. Search Console ги
// отчита като „Soft 404“ и хаби обхождането. Правилото: непознат адрес → 404;
// пререндерирана страница / файл / приложението (/dashboard) → 200.
describe("nginx.conf — непознат адрес връща 404, не началната страница", () => {
  // Тялото на `location <prefix> { … }` — първото ниво скоби.
  const block = (head) => {
    const i = live.indexOf(head);
    if (i < 0) return null;
    const open = live.indexOf("{", i);
    let depth = 0;
    for (let j = open; j < live.length; j++) {
      if (live[j] === "{") depth++;
      else if (live[j] === "}" && --depth === 0) return live.slice(open + 1, j);
    }
    return null;
  };

  it("нито един try_files не завършва със SPA fallback към /index.html", () => {
    const tries = [...live.matchAll(/try_files\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(tries.length, "няма try_files — тестът е сляп").toBeGreaterThan(0);
    for (const t of tries) expect(t, t).not.toMatch(/\/index\.html$/);
  });

  it("404 отива на собствената страница със статус 404 (без `=200` подмяна)", () => {
    expect(live).toMatch(/error_page\s+404\s+\/404\.html\s*;/);
    expect(live).not.toMatch(/error_page\s+404\s+=/);
  });

  it("/404.html е вътрешна, noindex и без кеш", () => {
    const b = block("location = /404.html");
    expect(b, "липсва location = /404.html").toBeTruthy();
    expect(b).toMatch(/\binternal\s*;/);
    expect(b).toMatch(/add_header\s+X-Robots-Tag\s+"noindex"\s+always\s*;/);
    expect(b).toMatch(/add_header\s+Cache-Control\s+"no-cache[^"]*"\s+always\s*;/);
    // Страницата зарежда SPA-то → носи същия CSP като останалия сайт.
    expect(b).toMatch(/add_header\s+Content-Security-Policy\s+"default-src 'self'; script-src 'self';/);
  });

  it("приложението (/dashboard…) е единственото, което получава SPA обвивката", () => {
    const b = block("location ~ ^/dashboard(?:/|$)");
    expect(b, "липсва location за /dashboard").toBeTruthy();
    expect(b).toMatch(/rewrite\s+\^\s+\/index\.html\s+last\s*;/);
    const shells = [...live.matchAll(/rewrite\s+\S+\s+\/index\.html/g)].length;
    expect(shells, "още места връщат index.html за произволен адрес").toBe(1);
  });

  it("грешките на backend-а не се подменят със страницата (API-то пази своя JSON)", () => {
    expect(live).not.toMatch(/proxy_intercept_errors\s+on/);
  });

  it("списъкът SPA маршрути е същият като в гейта на prerender.mjs", () => {
    const pre = readFileSync(join(__dirname, "..", "..", "scripts", "prerender.mjs"), "utf8");
    expect(pre).toContain("const SPA_ONLY = /^\\/dashboard(?:\\/|$)/;");
  });
});

// ─── Поведение на ИСТИНСКИ nginx (не само текстът на конфигурацията) ─────────
// Пуска nginx с този nginx.conf върху мини „dist“, ако бинарният файл го има
// (Ubuntu runner-ите на GitHub го носят; иначе тестът се пропуска). Сменяме само
// пътищата и порта — локациите, try_files, error_page и заглавията са тези от
// продукция.
const NGINX = ["nginx", "/usr/sbin/nginx"].find((b) => {
  try { return spawnSync(b, ["-v"]).status === 0; } catch { return false; }
});

describe.skipIf(!NGINX)("истински nginx — 404 за непознато, 200 за реалното", () => {
  let dir, proc, base;
  const headersPath = join(__dirname, "..", "..", "nginx-security-headers.conf");

  const must = (s, re, rep) => {
    if (!re.test(s)) throw new Error(`nginx.conf: не намирам ${re}`);
    return s.replace(re, rep);
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "supreme-nginx-"));
    chmodSync(dir, 0o755);
    const html = join(dir, "html");
    const files = {
      "index.html": "APP-SHELL",
      "404.html": "NOT-FOUND-PAGE",
      "terms/index.html": "TERMS-PAGE",
      "bg/index.html": "BG-PAGE",
      "features/index.html": "FEATURES-HUB",
      "features/discord-ticket-system/index.html": "FEATURE-PAGE",
      "robots.txt": "User-agent: *",
      "sitemap.xml": "<urlset/>",
      "assets/app-abc123.js": "console.log(1)",
      "09d438d11f84037ca203486287865836.txt": "09d438d11f84037ca203486287865836",
    };
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(dirname(join(html, p)), { recursive: true });
      writeFileSync(join(html, p), body);
    }

    const port = await new Promise((res) => {
      const s = createServer().listen(0, "127.0.0.1", () => {
        const { port: p } = s.address();
        s.close(() => res(p));
      });
    });
    base = `http://127.0.0.1:${port}`;

    let c = conf;
    c = must(c, /listen\s+8080\s*;/, `listen 127.0.0.1:${port};`);
    c = must(c, /root\s+\/usr\/share\/nginx\/html\s*;/, `root "${html}";`);
    c = must(c, /access_log\s+\S+\s+supreme_noargs\s*;/, `access_log "${dir}/access.log" supreme_noargs;`);
    c = c.replaceAll("include /etc/nginx/security-headers.conf;", `include "${headersPath}";`);
    const temps = ["client_body", "proxy", "fastcgi", "uwsgi", "scgi"]
      .map((t) => `${t}_temp_path "${dir}/${t}";`).join(" ");
    writeFileSync(join(dir, "nginx.conf"), [
      // Като root nginx сваля работниците на `nobody`, който не вижда временната папка.
      process.getuid?.() === 0 ? "user root;" : "",
      `pid "${dir}/nginx.pid";`,
      `error_log "${dir}/error.log";`,
      "events {}",
      "http {",
      "  types { text/html html; text/plain txt; application/javascript js; application/xml xml; }",
      "  default_type application/octet-stream;",
      `  ${temps}`,
      c,
      "}",
    ].join("\n"));

    proc = spawn(NGINX, ["-p", dir, "-c", join(dir, "nginx.conf"), "-g", "daemon off;"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d; });
    const deadline = Date.now() + 8000;
    for (;;) {
      const up = await new Promise((res) => {
        const s = connect(port, "127.0.0.1", () => { s.destroy(); res(true); });
        s.on("error", () => res(false));
      });
      if (up) break;
      if (proc.exitCode !== null || Date.now() > deadline) {
        let log = "";
        try { log = readFileSync(join(dir, "error.log"), "utf8"); } catch { /* няма лог */ }
        throw new Error(`nginx не тръгна:\n${stderr}\n${log}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }, 15000);

  afterAll(() => {
    if (proc && proc.exitCode === null) proc.kill("SIGTERM");
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const get = async (path) => {
    const r = await fetch(base + path, { redirect: "manual" });
    return { status: r.status, body: await r.text(), h: r.headers };
  };

  it.each([
    ["/cs-audit-no-such-page-7781"],
    ["/cs-audit/no/such/7781.html"],
    ["/features/no-such-feature"],
    ["/terms/no-such-subpage"],
    ["/dashboardx"],
    ["/404.html"],
  ])("%s → 404 + страницата за 404 (noindex), не началната", async (path) => {
    const r = await get(path);
    expect(r.status).toBe(404);
    expect(r.body).toBe("NOT-FOUND-PAGE");
    expect(r.h.get("x-robots-tag")).toBe("noindex");
    expect(r.h.get("strict-transport-security")).toBeTruthy();
    expect(r.h.get("content-security-policy")).toContain("script-src 'self'");
  });

  it.each([
    ["/", "APP-SHELL"],
    ["/terms", "TERMS-PAGE"],
    ["/bg", "BG-PAGE"],
    ["/features", "FEATURES-HUB"],
    ["/features/discord-ticket-system", "FEATURE-PAGE"],
    ["/robots.txt", "User-agent: *"],
    ["/assets/app-abc123.js", "console.log(1)"],
    ["/09d438d11f84037ca203486287865836.txt", "09d438d11f84037ca203486287865836"],
  ])("%s → 200 директно (без редирект)", async (path, body) => {
    const r = await get(path);
    expect(r.status).toBe(200);
    expect(r.h.get("location")).toBeNull();
    expect(r.body).toBe(body);
  });

  it.each([["/dashboard"], ["/dashboard/"], ["/dashboard/123456789/panels"], ["/dashboard/security"]])(
    "%s → 200 + SPA обвивката, без кеш и с CSP",
    async (path) => {
      const r = await get(path);
      expect(r.status).toBe(200);
      expect(r.body).toBe("APP-SHELL");
      expect(r.h.get("cache-control")).toContain("no-cache");
      expect(r.h.get("content-security-policy")).toContain("script-src 'self'");
    },
  );

  it("липсващ ресурс под /assets/ също е 404, не HTML със 200", async () => {
    expect((await get("/assets/missing-chunk.js")).status).toBe(404);
  });
});

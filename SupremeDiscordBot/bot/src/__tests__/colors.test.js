// bot/src/__tests__/colors.test.js
// Гейт срещу връщането на разпилените цветове.
//
// Историята: 8 различни сурови литерала живееха из 26 файла (вкл. 0x00e5ff —
// СТАРИЯТ ни циан, който след ребранда в зелено вече не съществуваше никъде
// другаде). Ботът изглеждаше като шест различни бота. Тестът пази единната
// палитра така, както commandsCatalog.test.js пази byte-identical каталога:
// щом човек напише цвят на ръка, CI пада.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, SUCCESS, DANGER, WARNING, INFO, MUTED, brandEmbed, relTime, userTag, avatarUrl } from "../utils/colors.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === "node_modules" || entry === "__tests__") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".js")) out.push(p);
  }
  return out;
}

// Ред с цвят-литерал, но НЕ в коментар (документиращите бележки за стари
// стойности са позволени — те обясняват защо нещо се е сменило).
function rawColorLines(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => !line.startsWith("//") && !line.startsWith("*") && /0x[0-9a-fA-F]{6}\b/.test(line));
}

describe("цветова палитра", () => {
  it("никой файл извън colors.js не пише суров hex цвят", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (file.endsWith(join("utils", "colors.js"))) continue;
      for (const { line, n } of rawColorLines(file)) {
        offenders.push(`${relative(SRC, file)}:${n} → ${line.slice(0, 80)}`);
      }
    }
    expect(offenders, `Ползвай токен от utils/colors.js:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("токените са различими един от друг (иначе семантиката е декор)", () => {
    const all = [BRAND, SUCCESS, DANGER, WARNING, INFO, MUTED];
    expect(new Set(all).size).toBe(all.length);
  });

  it("брандът е зеленото от ребранда, не старият циан", () => {
    expect(BRAND).toBe(0x8fe600);
    expect(all6()).not.toContain(0x00e5ff); // старият циан
    expect(all6()).not.toContain(0x5865f2); // Discord blurple
  });
});

function all6() {
  return [BRAND, SUCCESS, DANGER, WARNING, INFO, MUTED];
}

describe("brandEmbed", () => {
  it("слага брандов цвят, timestamp и footer по подразбиране", () => {
    const e = brandEmbed({ title: "Hi" }).toJSON();
    expect(e.color).toBe(BRAND);
    expect(e.timestamp).toBeTruthy();
    expect(e.footer.text).toBe("Supreme Bot");
  });

  it("НЕ бранди чужд бот при white-label", () => {
    const e = brandEmbed({ title: "Hi", client: { isWhiteLabel: true } }).toJSON();
    expect(e.footer).toBeUndefined();
  });

  it("допълва подадения footer, вместо да го изхвърля", () => {
    const e = brandEmbed({ title: "Hi", footer: "Ticket #0042" }).toJSON();
    expect(e.footer.text).toBe("Ticket #0042 · Supreme Bot");
  });

  it("реже до лимитите на Discord (title 256, description 4096, 25 полета)", () => {
    const e = brandEmbed({
      title: "т".repeat(400),
      description: "д".repeat(5000),
      fields: Array.from({ length: 40 }, (_, i) => ({ name: `f${i}`, value: "v" })),
    }).toJSON();
    expect(e.title).toHaveLength(256);
    expect(e.description).toHaveLength(4096);
    expect(e.fields).toHaveLength(25);
  });
});

describe("помощници за embed", () => {
  it("userTag покрива стари и нови акаунти", () => {
    expect(userTag({ username: "nova", discriminator: "0" })).toBe("nova");
    expect(userTag({ username: "old", discriminator: "1234" })).toBe("old#1234");
    expect(userTag(null)).toBe("Unknown");
  });

  it("avatarUrl строи CDN адрес, а при липса не гърми", () => {
    expect(avatarUrl({ id: "1", avatar: "abc" })).toContain("cdn.discordapp.com/avatars/1/abc.png");
    expect(avatarUrl(null)).toBeUndefined();
    expect(avatarUrl({ id: "1" })).toBeUndefined();
  });

  it("relTime връща Discord релативен маркер", () => {
    expect(relTime(new Date("2026-01-01T00:00:00Z"))).toBe("<t:1767225600:R>");
  });
});

// bot/src/__tests__/privacyCommand.test.js
// /privacy — лесно достъпният път за изтриване на данни за ВСЕКИ Discord
// потребител (Discord Developer Terms §5(b)). Гейтва: командата съществува с
// двата подкоманди, каталогът (и трите копия) я обявява, локализацията я има,
// ботът има вътрешния endpoint за ръчна реконсилиация, а `delete` не трие без
// потвърждение и праща самообслужването към /bot/dsr/erase.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiPost = vi.fn();
const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a) } }));

const privacy = (await import("../commands/privacy.js")).default;
const { COMMAND_CATALOG } = await import("../utils/commandsCatalog.js");
const { CMD_DESC_L10N } = await import("../utils/commandLocalizations.js");
const HERE = dirname(fileURLToPath(import.meta.url));

beforeEach(() => vi.clearAllMocks());

describe("дефиниция", () => {
  it("/privacy има подкоманди info и delete и локализирано описание", () => {
    const json = privacy.data.toJSON();
    expect(json.name).toBe("privacy");
    expect(json.options.map((o) => o.name).sort()).toEqual(["delete", "info"]);
    expect(Object.keys(CMD_DESC_L10N.privacy).sort()).toEqual(["bg", "de", "es-ES", "fr", "it", "nl", "pl"]);
    expect(json.description_localizations.bg).toContain("данни");
  });

  it("каталогът обявява /privacy info и /privacy delete (и трите копия са еднакви)", () => {
    const all = COMMAND_CATALOG.flatMap((c) => c.commands.map((x) => x.name));
    expect(all).toContain("/privacy info");
    expect(all).toContain("/privacy delete");
    const bot = readFileSync(join(HERE, "../utils/commandsCatalog.js"), "utf8");
    expect(readFileSync(join(HERE, "../../../backend/src/data/commandsCatalog.js"), "utf8")).toBe(bot);
    expect(readFileSync(join(HERE, "../../../frontend/src/data/commandsCatalog.js"), "utf8")).toBe(bot);
  });

  it("ботът има вътрешен endpoint за ръчна entitlement реконсилиация", () => {
    const src = readFileSync(join(HERE, "../index.js"), "utf8");
    expect(src).toContain('app.post("/internal/entitlement-reconcile"');
  });
});

function fakeInteraction(sub, { click } = {}) {
  const i = {
    id: "int1",
    guildId: "g1",
    user: { id: "123456789012345678" },
    options: { getSubcommand: () => sub },
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async (b) => b),
    fetchReply: vi.fn(async () => ({
      awaitMessageComponent: vi.fn(async ({ filter }) => {
        if (!click) throw new Error("timeout");
        const btn = { user: i.user, customId: click(i), update: vi.fn(async (b) => b), deferUpdate: vi.fn(async () => {}) };
        if (!filter(btn)) throw new Error("filtered");
        return btn;
      }),
    })),
  };
  return i;
}

describe("изпълнение", () => {
  it("info чете обобщението и НЕ показва имейл/съдържание", async () => {
    apiGet.mockResolvedValue({ data: { registered: true, counts: { tickets: 2, messages: 5, applications: 0, roleSnapshots: 1, verificationAttempts: 0 } } });
    const i = fakeInteraction("info");
    await privacy.execute(i);
    expect(apiGet).toHaveBeenCalledWith("/bot/dsr/123456789012345678");
    const body = i.editReply.mock.calls[0][0];
    expect(JSON.stringify(body)).toContain("/privacy");
    expect(JSON.stringify(body)).toContain("privacy@carbonstealth.eu");
  });

  it("delete без потвърждение (timeout) не трие", async () => {
    const i = fakeInteraction("delete");
    await privacy.execute(i);
    expect(apiPost).not.toHaveBeenCalled();
    expect(JSON.stringify(i.editReply.mock.calls.at(-1)[0])).toContain("nothing was deleted");
  });

  it("cancel не трие; confirm праща identity изтриване към backend-а", async () => {
    let i = fakeInteraction("delete", { click: (x) => `privacy:cancel:${x.user.id}:${x.id}` });
    await privacy.execute(i);
    expect(apiPost).not.toHaveBeenCalled();

    apiPost.mockResolvedValue({ data: { ok: true, registered: false, counts: { messageTags: 3, roleSnapshots: 1, verificationAttempts: 0, memberships: 2 } } });
    i = fakeInteraction("delete", { click: (x) => `privacy:erase:${x.user.id}:${x.id}` });
    await privacy.execute(i);
    expect(apiPost).toHaveBeenCalledWith("/bot/dsr/erase", { userId: "123456789012345678", guildId: "g1" });
    expect(JSON.stringify(i.editReply.mock.calls.at(-1)[0])).toContain("✅ Done");
  });

  it("активен абонамент → обяснение, не грешка", async () => {
    apiPost.mockRejectedValue({ response: { status: 409, data: { code: "ACTIVE_SUBSCRIPTIONS" } } });
    const i = fakeInteraction("delete", { click: (x) => `privacy:erase:${x.user.id}:${x.id}` });
    await privacy.execute(i);
    expect(JSON.stringify(i.editReply.mock.calls.at(-1)[0])).toContain("active paid subscription");
  });
});

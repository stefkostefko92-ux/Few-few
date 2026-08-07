// bot/src/__tests__/whitelabelBranding.test.js
// Брандирането РЕАЛНО стига до Discord.
//
// Дефектът, който този гейт пази (докладван от собственика, 07.08.2026):
// `customBotName`/`customBotAvatar` се записваха в базата и брандираха HTML
// транскрипта, но в целия бот единственото `client.user.*` извикване беше
// `setActivity`. Клиент плаща White-label, попълва име и снимка, интерфейсът
// казва „запазено“ — а ботът в Discord си остава със старото ЗАВИНАГИ.
//
// ЗАЩО ПОВЕДЕНЧЕСКИ, а не структурен (Изпитателят, 07.08.2026): предишната
// версия четеше сорса и търсеше низа `.setUsername(`. Доказано с мутация —
// обръщането на условието, така че извикването НИКОГА да не се стигне, остави
// теста зелен. Гейт, който проверява че кодът СЪДЪРЖА извикването, не проверява
// че то се СЛУЧВА. Затова тук се вика реалната функция срещу фалшив клиент.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { get: (...a) => apiGet(...a) } }));

const { applyBranding } = await import("../services/clientManager.js");

/** Фалшив Discord клиент — `edit` е точката, която ни интересува. */
function fakeClient(currentName = "Supreme Bot") {
  return { user: { username: currentName, edit: vi.fn(async () => {}) } };
}

const BRANDING = { name: "MySupport", avatarDataUri: "data:image/png;base64,AAAA" };

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: BRANDING });
});

describe("брандирането се ПРИЛАГА, не само се чете", () => {
  it("името стига до Discord", async () => {
    const c = fakeClient();
    await applyBranding(c, "s1");
    expect(c.user.edit).toHaveBeenCalledWith(expect.objectContaining({ username: "MySupport" }));
  });

  it("чете от backend-а, не гадае", async () => {
    await applyBranding(fakeClient(), "s1");
    expect(apiGet).toHaveBeenCalledWith(expect.stringContaining("/branding"));
    expect(apiGet).toHaveBeenCalledWith(expect.stringContaining("s1"));
  });

  it("аватарът се праща САМО при изричен withAvatar", async () => {
    const boot = fakeClient();
    await applyBranding(boot, "s1", { withAvatar: false });
    expect(boot.user.edit.mock.calls[0][0]).not.toHaveProperty("avatar");

    const change = fakeClient();
    await applyBranding(change, "s1", { withAvatar: true });
    expect(change.user.edit).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: BRANDING.avatarDataUri }),
    );
  });
});

describe("името и аватарът пътуват в ЕДНА заявка", () => {
  // `setUsername()` и `setAvatar()` правят СЪЩИЯ `PATCH /users/@me` вътрешно
  // (discord.js v14 `ClientUser.js:83,97`) — един bucket, ~2 смени на час.
  // Две отделни извиквания харчат двойно и втората двойна промяна в рамките на
  // час увисва в опашката без грешка. (Дискорджията, 07.08.2026)
  it("смяна на име И аватар = точно едно повикване", async () => {
    const c = fakeClient();
    await applyBranding(c, "s1", { withAvatar: true });
    expect(c.user.edit).toHaveBeenCalledTimes(1);
    expect(c.user.edit).toHaveBeenCalledWith({
      username: "MySupport", avatar: BRANDING.avatarDataUri,
    });
  });
});

describe("нула излишни заявки — лимитът е ~2/час", () => {
  it("същото име и без аватар → НИЩО не се праща", async () => {
    const c = fakeClient("MySupport");
    await applyBranding(c, "s1", { withAvatar: false });
    expect(c.user.edit).not.toHaveBeenCalled();
  });

  it("същото име, но нов аватар → праща се само аватарът", async () => {
    const c = fakeClient("MySupport");
    await applyBranding(c, "s1", { withAvatar: true });
    expect(c.user.edit).toHaveBeenCalledWith({ avatar: BRANDING.avatarDataUri });
  });

  it("паднал tier (backend връща null/null) → нула заявки", async () => {
    apiGet.mockResolvedValue({ data: { name: null, avatarDataUri: null } });
    const c = fakeClient();
    await applyBranding(c, "s1", { withAvatar: true });
    expect(c.user.edit).not.toHaveBeenCalled();
  });
});

describe("провалът НЕ поваля бота — без бранд той пак обслужва тикетите", () => {
  it("недостъпен backend → нула хвърлена грешка, нула заявка", async () => {
    apiGet.mockRejectedValue(new Error("ECONNREFUSED"));
    const c = fakeClient();
    await expect(applyBranding(c, "s1")).resolves.toBeUndefined();
    expect(c.user.edit).not.toHaveBeenCalled();
  });

  it("Discord отказва (429 изчерпан лимит) → преглътнато", async () => {
    const c = fakeClient();
    c.user.edit.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    await expect(applyBranding(c, "s1", { withAvatar: true })).resolves.toBeUndefined();
  });

  it("Discord отказва (50035 невалидно име) → преглътнато", async () => {
    const c = fakeClient();
    c.user.edit.mockRejectedValue(Object.assign(new Error("Invalid Form Body"), { code: 50035 }));
    await expect(applyBranding(c, "s1")).resolves.toBeUndefined();
  });
});

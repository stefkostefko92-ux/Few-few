// bot/src/__tests__/setupWizard.test.js
// `/setup wizard` вече записва (28.11.2026): последната стъпка „Създай панел“ праща избора
// към backend-а (/api/bot/setup-wizard/:guildId), който прави ЧЕРНОВА на панел.
//   Б1 избраните роли, категория и лог канал + текстовете на езика на сървъра → backend
//   Б2 @everyone не влиза в ролите още тук (и в обобщението)
//   Б3 изтекла сесия или второ натискане → нищо не се създава, казваме „пусни пак“
//   Б4 лимитът на плана → ясно съобщение с лимита, без грешка
//   Б5 друга грешка → friendlyError
//   Б6 без Manage Server → нищо не се пипа
import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => post(...a), get: vi.fn() } }));
vi.mock("../i18n/index.js", () => ({
  t: (k, lang, v) => `${lang}:${k}${v ? JSON.stringify(v) : ""}`,
  resolveLang: async () => "en",
  resolveLangForGuild: async () => "bg",
}));
const friendlyError = vi.fn(() => "friendly");
vi.mock("../utils/friendlyError.js", () => ({ friendlyError: (...a) => friendlyError(...a) }));

const { startSetupWizard, handleSetupComponent } = await import("../commands/setup.js");

const GID = "333333333333333333";
const ROLE = "555555555555555551";
const CAT = "700000000000000001";
const LOG = "800000000000000001";
let userSeq = 0;

function makeUser() {
  const id = String(100000000000000000n + BigInt(++userSeq));
  const base = (extra = {}) => ({
    guildId: GID,
    user: { id },
    member: { permissions: { has: () => true } },
    reply: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    deferUpdate: vi.fn(async () => ({})),
    editReply: vi.fn(async () => ({})),
    followUp: vi.fn(async () => ({})),
    ...extra,
  });
  return {
    id,
    start: () => { const i = base(); return startSetupWizard(i).then(() => i); },
    act: (customId, values) => { const i = base({ customId, values }); return handleSetupComponent(i).then(() => i); },
    actAs: (extra) => { const i = base(extra); return handleSetupComponent(i).then(() => i); },
  };
}

async function walk(u, { roles = [ROLE], cat = CAT, log = LOG } = {}) {
  await u.start();
  await u.act("setup:wizard:roles", roles);
  await u.act("setup:wizard:category", cat ? [cat] : []);
  await u.act("setup:wizard:log", log ? [log] : []);
}
const json = (x) => JSON.stringify(x);

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ status: 201, data: { id: "cpanel000000000000000001", name: "bg:setup.panel.name" } });
});

describe("Б1 записът", () => {
  it("„Създай панел“ праща избора и текстовете на езика на сървъра", async () => {
    const u = makeUser();
    await walk(u);
    const fin = await u.act("setup:wizard:finish");
    expect(fin.deferUpdate).toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(`/bot/setup-wizard/${GID}`, {
      userId: u.id,
      roleIds: [ROLE],
      categoryId: CAT,
      logChannelId: LOG,
      name: "bg:setup.panel.name",
      title: "bg:setup.panel.title",
      description: "bg:setup.panel.description",
      buttonLabel: "bg:setup.panel.button",
    });
    const out = json(fin.editReply.mock.calls[0][0]);
    expect(out).toContain("setup.done.title");
    expect(out).toContain(`/dashboard/${GID}/panels`);
  });
  it("пропуснати стъпки → празни полета", async () => {
    const u = makeUser();
    await u.start();
    await u.act("setup:wizard:roles", []);
    await u.act("setup:wizard:category:skip");
    await u.act("setup:wizard:log:skip");
    await u.act("setup:wizard:finish");
    expect(post.mock.calls[0][1]).toMatchObject({ roleIds: [], categoryId: null, logChannelId: null });
  });
  it("последната стъпка казва, че бутонът СЪЗДАВА панел", async () => {
    const u = makeUser();
    await u.start();
    await u.act("setup:wizard:roles", [ROLE]);
    await u.act("setup:wizard:category", [CAT]);
    const step4 = await u.act("setup:wizard:log", [LOG]);
    const out = json(step4.update.mock.calls[0][0]);
    expect(out).toContain("setup.doneButton");
    expect(out).toContain("setup:wizard:finish");
    expect(out).toContain("setup.step4.body");
  });
});

describe("Б2 @everyone", () => {
  it("ID на сървъра не влиза в ролите", async () => {
    const u = makeUser();
    await walk(u, { roles: [GID, ROLE] });
    await u.act("setup:wizard:finish");
    expect(post.mock.calls[0][1].roleIds).toEqual([ROLE]);
  });
});

describe("Б3 сесията", () => {
  it("без сесия (изтекла) → нищо не се създава, казваме да пусне пак", async () => {
    const u = makeUser();
    const fin = await u.act("setup:wizard:finish");
    expect(post).not.toHaveBeenCalled();
    const payload = fin.editReply.mock.calls[0]?.[0] ?? fin.update.mock.calls[0]?.[0];
    expect(json(payload)).toContain("setup.expired");
  });
  it("второ натискане на „Създай панел“ → един панел", async () => {
    const u = makeUser();
    await walk(u);
    await u.act("setup:wizard:finish");
    await u.act("setup:wizard:finish");
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("Б4 лимитът", () => {
  it("403 LIMIT_REACHED → съобщение с лимита, без грешка", async () => {
    post.mockRejectedValue(Object.assign(new Error("403"), { response: { status: 403, data: { code: "LIMIT_REACHED", limit: 1 } } }));
    const u = makeUser();
    await walk(u);
    const fin = await u.act("setup:wizard:finish");
    const embed = fin.editReply.mock.calls[0][0].embeds[0];
    expect(embed.description).toBe('en:setup.limit.body{"limit":1}');
    expect(friendlyError).not.toHaveBeenCalled();
  });
});

describe("Б5 друга грешка", () => {
  it("→ friendlyError", async () => {
    post.mockRejectedValue(Object.assign(new Error("boom"), { response: { status: 500 } }));
    const u = makeUser();
    await walk(u);
    const fin = await u.act("setup:wizard:finish");
    expect(friendlyError).toHaveBeenCalled();
    expect(json(fin.editReply.mock.calls[0][0])).toContain("friendly");
  });
});

describe("Б6 правата", () => {
  it("без Manage Server → нищо не се създава", async () => {
    const u = makeUser();
    await walk(u);
    const i = await u.actAs({ customId: "setup:wizard:finish", member: { permissions: { has: () => false } } });
    expect(post).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalled();
  });
});

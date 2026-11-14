// bot/src/__tests__/launchPhase2Review.test.js
// Поток Т, фаза 2: Т11 (мениджърите на кандидатури ревюират), Т6 (409 при второ решение),
// Т17 (прегледът на кандидатури е на езика на сървъра).
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.API_SECRET = "test-secret";
const get = vi.fn(), post = vi.fn(), patch = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));

const { handleAppReview, handleAppReviewModalSubmit } = await import("../events/interactionCreate.js");
const { t } = await import("../i18n/index.js");

const GUILD = "111111111111111111";
function inter({ manageGuild = false, roles = [] } = {}) {
  return {
    user: { id: "9", username: "rev" }, guildId: GUILD, locale: "bg", client: {},
    member: { permissions: { has: (p) => manageGuild && p === "ManageGuild" }, roles: { cache: new Map(roles.map((r) => [r, {}])) } },
    message: { components: [], edit: vi.fn(async () => {}), reply: vi.fn(async () => {}) },
    fields: { getTextInputValue: () => "добре" },
    reply: vi.fn(async () => {}), deferReply: vi.fn(async () => {}), editReply: vi.fn(async () => {}), showModal: vi.fn(async () => {}),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  get.mockImplementation(async (url) => (String(url).endsWith("/reviewers") ? { data: { managerRoleIds: ["m1"] } } : { data: {} }));
});

describe("Т11 — кой може да ревюира в бота", () => {
  it("мениджър на кандидатури (роля от формуляра) без Manage Server → отваря модала", async () => {
    const i = inter({ roles: ["m1"] });
    await handleAppReview(i, "a1", "approve");
    expect(i.showModal).toHaveBeenCalledTimes(1);
    expect(i.reply).not.toHaveBeenCalled();
    expect(get.mock.calls[0][1]).toMatchObject({ params: { serverId: GUILD } });
  });
  it("без Manage Server и без мениджърска роля → преведен отказ", async () => {
    const i = inter({ roles: ["x"] });
    await handleAppReview(i, "a1", "approve");
    expect(i.showModal).not.toHaveBeenCalled();
    expect(i.reply.mock.calls[0][0].content).toBe(t("app.review.noPermission", "bg"));
  });
  it("админ (Manage Server) минава без заявка към бекенда", async () => {
    const i = inter({ manageGuild: true });
    await handleAppReview(i, "a1", "deny");
    expect(i.showModal).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
  it("модалът е на езика на сървъра (Т17)", async () => {
    const i = inter({ manageGuild: true });
    await handleAppReview(i, "a1", "approve");
    const modal = i.showModal.mock.calls[0][0].toJSON();
    expect(modal.title).toBe(t("app.review.approveTitle", "bg"));
    expect(modal.components[0].components[0].label).toBe(t("app.review.approveLabel", "bg"));
  });
  it("discuss: мениджър → канал; съобщенията са преведени", async () => {
    const i = inter({ roles: ["m1"] });
    post.mockResolvedValue({ data: { channelId: "55" } });
    await handleAppReview(i, "a1", "discuss");
    expect(i.editReply).toHaveBeenCalledWith(t("app.review.discussOpened", "bg", { channel: "<#55>" }));
  });
  it("решението от мениджър минава през модала", async () => {
    const i = inter({ roles: ["m1"] });
    post.mockResolvedValue({ data: {} });
    await handleAppReviewModalSubmit(i, "a1", "approve");
    expect(post.mock.calls[0][0]).toBe("/bot/application/a1/review");
    expect(i.editReply).toHaveBeenCalledWith(t("app.review.done", "bg"));
  });
  it("модал от човек без право → отказ, без заявка за решение", async () => {
    const i = inter({ roles: [] });
    await handleAppReviewModalSubmit(i, "a1", "approve");
    expect(post).not.toHaveBeenCalled();
    expect(i.editReply.mock.calls.at(-1)[0]).toBe(t("app.review.noPermission", "bg"));
  });
});

describe("Т6/Т17 — второ решение и грешки", () => {
  it("409 от бекенда → „вече е прегледана“, не се пипа съобщението", async () => {
    const i = inter({ manageGuild: true });
    post.mockRejectedValue({ response: { status: 409, data: { error: "Application already reviewed" } } });
    await handleAppReviewModalSubmit(i, "a1", "approve");
    expect(i.editReply).toHaveBeenCalledWith(t("app.review.alreadyReviewed", "bg"));
    expect(i.message.reply).not.toHaveBeenCalled();
  });
  it("друга грешка → преведено, не err.message", async () => {
    const i = inter({ manageGuild: true });
    post.mockRejectedValue(new Error("ECONNRESET 10.0.0.1"));
    await handleAppReviewModalSubmit(i, "a1", "deny");
    expect(i.editReply).toHaveBeenCalledWith(t("app.review.error", "bg"));
  });
  it("успех → статус-ембедът е на езика на сървъра", async () => {
    const i = inter({ manageGuild: true });
    post.mockResolvedValue({ data: {} });
    await handleAppReviewModalSubmit(i, "a1", "deny");
    const emb = i.message.reply.mock.calls[0][0].embeds[0];
    const json = emb.toJSON ? emb.toJSON() : emb.data ?? emb;
    expect(json.title).toBe(t("app.review.deniedTitle", "bg"));
    expect(json.description).toContain(t("app.review.deniedBy", "bg", { user: "rev" }));
  });
});

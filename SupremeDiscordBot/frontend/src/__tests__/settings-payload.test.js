// frontend/src/__tests__/settings-payload.test.js
// Настройките на сървъра се пазят на части — всяка страница праща САМО своите полета.
//
// Одит (07.08.2026): целият premium блок в SettingsPage висеше на `isPremium`,
// а той е ИСТИНА и за обикновен Premium — план, който НЕ включва white-label.
// Бекендът (`servers.js`) отказва с 403, щом полето ПРИСЪСТВА в тялото
// (`v !== undefined`), а `customBotName: null` е присъствие. Резултат: Premium
// клиент не можеше да запази НИКАКВА настройка — всеки запис връщаше 403.
//
// От 12.11.2026 дългата страница „Настройки“ е разделена (Посрещане и роли,
// Дневник, AI отговори, Настройки). Едно PUT /servers/:id приема частично тяло,
// затова тестът вече е поведенчески: какво точно отива към сървъра от всяка част.
import { describe, it, expect } from "vitest";
import { SECTIONS, buildForm, buildPayload } from "../components/settings/fields";

const ALL = Object.keys(SECTIONS);
const WHITE_LABEL = ["customBotName", "customBotAvatar", "customBotToken"];
const PREMIUM = ["aiRepliesEnabled", "aiRepliesPrompt", "roundRobinEnabled", "roundRobinRoleId"];

const server = (over = {}) => ({
  id: "100000000000000001",
  isPremium: false,
  hasWhiteLabel: false,
  logChannelId: "200000000000000001",
  archiveChannelId: null,
  language: "bg",
  customBotName: "Моят бот",
  customBotAvatar: null,
  aiRepliesEnabled: true,
  aiRepliesPrompt: "Питай за номер на поръчка.",
  roundRobinEnabled: true,
  roundRobinRoleId: "300000000000000001",
  welcomerEnabled: true,
  welcomerChannelId: "200000000000000002",
  welcomerMessage: "Здравей, {user}!",
  welcomerEmbedColor: "#112233",
  welcomerDmEnabled: false,
  welcomerDmMessage: null,
  autoroleIds: ["300000000000000002", "300000000000000003"],
  autoroleBotIds: [],
  stickyRolesEnabled: true,
  eventLogEnabled: true,
  eventLogChannelId: "200000000000000003",
  eventLogCategories: ["voice", "moderation"],
  eventLogChannels: { voice: "200000000000000004", messages: "200000000000000005" },
  ...over,
});

describe("настройките на части — точен флаг за всяка функция", () => {
  it("безплатен сървър: нито едно платено поле не присъства в тялото", () => {
    const s = server();
    const payload = buildPayload(buildForm(s, ALL), s, ALL);
    for (const f of [...PREMIUM, ...WHITE_LABEL]) {
      expect(f in payload, `${f} не бива да се праща на Free — бекендът връща 403`).toBe(false);
    }
  });

  it("Premium без white-label: AI и разпределянето се пращат, white-label полетата — не", () => {
    const s = server({ isPremium: true });
    const payload = buildPayload(buildForm(s, ALL), s, ALL);
    for (const f of PREMIUM) expect(f in payload, f).toBe(true);
    for (const f of WHITE_LABEL) {
      expect(f in payload, `${f} е под isPremium — Premium клиент ще получава 403`).toBe(false);
    }
  });

  it("white-label план: името и аватарът се пращат; токенът — само когато е въведен нов", () => {
    const s = server({ isPremium: true, hasWhiteLabel: true });
    const form = buildForm(s, ALL);
    expect(form.customBotToken, "токенът никога не се зарежда във формата").toBe("");
    const blank = buildPayload(form, s, ALL);
    expect(blank.customBotName).toBe("Моят бот");
    expect("customBotToken" in blank, "празен токен би изтрил записания").toBe(false);
    const withToken = buildPayload({ ...form, customBotToken: "нов-токен" }, s, ALL);
    expect(withToken.customBotToken).toBe("нов-токен");
  });
});

describe("всяка страница праща само своите полета", () => {
  const s = server({ isPremium: true, hasWhiteLabel: true });

  it("„Запазване на роли“ праща едно поле", () => {
    const form = buildForm(s, ["roleSaver"]);
    expect(buildPayload({ ...form, stickyRolesEnabled: false }, s, ["roleSaver"])).toEqual({ stickyRolesEnabled: false });
  });

  it("„Посрещане и роли“ не пипа дневника, езика и бота", () => {
    const keys = ["welcome", "autoroles", "roleSaver"];
    const payload = buildPayload(buildForm(s, keys), s, keys);
    expect(Object.keys(payload).sort()).toEqual([
      "autoroleBotIds", "autoroleIds", "stickyRolesEnabled", "welcomerChannelId", "welcomerDmEnabled",
      "welcomerDmMessage", "welcomerEmbedColor", "welcomerEnabled", "welcomerMessage",
    ]);
    expect(payload.autoroleIds).toEqual(["300000000000000002", "300000000000000003"]);
    expect(payload.autoroleBotIds).toEqual([]);
  });

  it("„Настройки“ пращат само общите полета, езика, разпределянето и бота", () => {
    const keys = ["general", "language", "roundRobin", "whiteLabel"];
    const payload = buildPayload(buildForm(s, keys), s, keys);
    expect(Object.keys(payload).sort()).toEqual([
      "archiveChannelId", "customBotAvatar", "customBotName", "language", "logChannelId",
      "roundRobinEnabled", "roundRobinRoleId",
    ]);
    expect(payload.archiveChannelId, "празен избор е null, не празен низ").toBeNull();
  });

  it("частите заедно покриват всичко, което пращаше старата обща форма", () => {
    const payload = buildPayload(buildForm(s, ALL), s, ALL);
    expect(Object.keys(payload).sort()).toEqual([
      "aiRepliesEnabled", "aiRepliesPrompt", "archiveChannelId", "autoroleBotIds", "autoroleIds",
      "customBotAvatar", "customBotName", "eventLogCategories", "eventLogChannelId", "eventLogChannels",
      "eventLogEnabled", "language", "logChannelId", "roundRobinEnabled", "roundRobinRoleId",
      "stickyRolesEnabled", "welcomerChannelId", "welcomerDmEnabled", "welcomerDmMessage",
      "welcomerEmbedColor", "welcomerEnabled", "welcomerMessage",
    ]);
  });
});

describe("дневник на сървъра", () => {
  const s = server();

  it("формата се попълва от категориите и каналите на сървъра", () => {
    const form = buildForm(s, ["activityLog"]);
    expect(form.eventLogCat_voice).toBe(true);
    expect(form.eventLogCat_members).toBe(false);
    expect(form.eventLogCh_voice).toBe("200000000000000004");
  });

  it("канал се праща само за ВКЛЮЧЕНА категория — изключената не оставя висящ канал", () => {
    const payload = buildPayload(buildForm(s, ["activityLog"]), s, ["activityLog"]);
    expect(payload.eventLogCategories).toEqual(["voice", "moderation"]);
    // „messages“ има записан канал, но категорията е изключена.
    expect(payload.eventLogChannels).toEqual({ voice: "200000000000000004" });
  });
});

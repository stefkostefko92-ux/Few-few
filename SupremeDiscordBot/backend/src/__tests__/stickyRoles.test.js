// backend/src/__tests__/stickyRoles.test.js
// „Лепкави роли" (v45) — ролите на напусналия се пазят и се връщат при
// повторно присъединяване.
//
// ЗАЩО ТЕЗИ ГАРАНЦИИ (заявка на собственика, 11.08.2026):
//  • Функцията е ИЗРИЧНО opt-in. Изключена → нищо не се пази. Това не е само
//    удобство, а минимизация на данните (GDPR чл. 5(1)(в)): списъкът с роли на
//    конкретен човек е лични данни и няма основание да се трупа „за всеки
//    случай" на сървъри, които функцията не ползват.
//  • Снимката НЯМА външен ключ към `User`. Членът на Discord сървър почти
//    никога не е наш потребител в таблото — външен ключ би провалял записа за
//    всеки, който не е влизал при нас (точно дефектът, който събаряше
//    регистрацията на сървъри през AuditLog.actorId).
//  • Чуждият вход се чисти: приемат се само валидни Discord snowflake-и, с таван.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "u1" }; next(); },
  requireServerAdmin: (req, _res, next) => next(),
  requireBotSecret: (req, _res, next) => next(),
}));

const { default: botRouter } = await import("../routes/bot.js");

const SERVER = "111111111111111111";
const USER = "222222222222222222";
const ROLE_A = "333333333333333333";
const ROLE_B = "444444444444444444";

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.server.findUnique.mockResolvedValue({ stickyRolesEnabled: true });
  prismaMock.memberRoleSnapshot.upsert.mockResolvedValue({});
  prismaMock.memberRoleSnapshot.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.memberRoleSnapshot.findUnique.mockResolvedValue(null);
});

describe("запис на снимката при напускане", () => {
  it("пази ролите, когато функцията е ВКЛЮЧЕНА", async () => {
    const res = await request(app())
      .post(`/api/bot/member-roles/${SERVER}/${USER}`)
      .send({ roleIds: [ROLE_A, ROLE_B] });

    expect(res.status).toBe(200);
    const call = prismaMock.memberRoleSnapshot.upsert.mock.calls.at(-1)[0];
    expect(call.where).toEqual({ serverId_userId: { serverId: SERVER, userId: USER } });
    expect(call.create.roleIds).toEqual([ROLE_A, ROLE_B]);
  });

  it("НЕ пази нищо, когато функцията е изключена (минимизация на данните)", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ stickyRolesEnabled: false });
    const res = await request(app())
      .post(`/api/bot/member-roles/${SERVER}/${USER}`)
      .send({ roleIds: [ROLE_A] });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe("disabled");
    expect(prismaMock.memberRoleSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("изхвърля невалидни ID-та вместо да пише чужд боклук", async () => {
    await request(app())
      .post(`/api/bot/member-roles/${SERVER}/${USER}`)
      .send({ roleIds: [ROLE_A, "не-е-id", "", "12", { evil: true }, null] });

    expect(prismaMock.memberRoleSnapshot.upsert.mock.calls.at(-1)[0].create.roleIds).toEqual([ROLE_A]);
  });

  it("член без роли ЧИСТИ старата снимка, вместо да пази празна", async () => {
    const res = await request(app())
      .post(`/api/bot/member-roles/${SERVER}/${USER}`)
      .send({ roleIds: [] });

    expect(res.body.saved).toBe(0);
    expect(prismaMock.memberRoleSnapshot.deleteMany).toHaveBeenCalled();
    expect(prismaMock.memberRoleSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("липсващ roleIds е 400, не тих запис", async () => {
    const res = await request(app()).post(`/api/bot/member-roles/${SERVER}/${USER}`).send({});
    expect(res.status).toBe(400);
  });
});

describe("четене при връщане", () => {
  it("връща запазените роли", async () => {
    prismaMock.memberRoleSnapshot.findUnique.mockResolvedValue({
      roleIds: [ROLE_A, ROLE_B], capturedAt: new Date("2026-08-01"),
    });
    const res = await request(app()).get(`/api/bot/member-roles/${SERVER}/${USER}`);
    expect(res.body.roleIds).toEqual([ROLE_A, ROLE_B]);
    expect(res.body.enabled).toBe(true);
  });

  it("изключена функция → празен списък, без четене от базата", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ stickyRolesEnabled: false });
    const res = await request(app()).get(`/api/bot/member-roles/${SERVER}/${USER}`);
    expect(res.body).toMatchObject({ roleIds: [], enabled: false });
    expect(prismaMock.memberRoleSnapshot.findUnique).not.toHaveBeenCalled();
  });

  it("непознат член → празен списък, не 404", async () => {
    const res = await request(app()).get(`/api/bot/member-roles/${SERVER}/${USER}`);
    expect(res.status).toBe(200);
    expect(res.body.roleIds).toEqual([]);
  });
});

describe("изтриване след успешно връщане", () => {
  it("трие снимката, скоупната по сървър И член", async () => {
    const res = await request(app()).delete(`/api/bot/member-roles/${SERVER}/${USER}`);
    expect(res.status).toBe(200);
    expect(prismaMock.memberRoleSnapshot.deleteMany.mock.calls.at(-1)[0].where)
      .toEqual({ serverId: SERVER, userId: USER });
  });
});

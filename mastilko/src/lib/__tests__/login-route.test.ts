import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/login/route";

// Регресия за self-DoS: преди поправката ВСЕКИ опит (включително вече
// блокираните от per-IP лимита) пълнеше глобалния брояч, тоест един адрес
// заключваше входа за всички — включително за истинския админ.
// Route-ът чете env и admins.json ЛЕНИВО (при заявка), затова задаваме тук.
const dir = mkdtempSync(path.join(os.tmpdir(), "mastilko-login-"));
process.env.MASTILKO_DATA_DIR = dir;
process.env.SESSION_SECRET = "y".repeat(48);
writeFileSync(
  path.join(dir, "admins.json"),
  JSON.stringify({ stefan: bcrypt.hashSync("правилната-парола", 10) }),
  "utf8",
);

/** Стъб на NextRequest — route-ът ползва само headers.get и json(). */
function req(ip: string, body: unknown): NextRequest {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "x-real-ip" ? ip : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

test("вход: грешна парола → 401 и НЕ слага бисквитка", async () => {
  const res = await POST(req("10.0.0.1", { user: "stefan", pass: "грешна" }));
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("вход: непознат потребител → 401 (без изброяване)", async () => {
  const res = await POST(req("10.0.0.2", { user: "няма-такъв", pass: "каквото" }));
  assert.equal(res.status, 401);
});

test("вход: невалидно тяло → 400", async () => {
  const res = await POST(req("10.0.0.3", { user: "", pass: "" }));
  assert.equal(res.status, 400);
});

test("rate limit: 6-ият опит от същия IP → 429", async () => {
  const ip = "10.0.0.4";
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) {
    codes.push((await POST(req(ip, { user: "stefan", pass: "грешна" }))).status);
  }
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(codes[5], 429, "6-ият опит трябва да е блокиран");
});

test("НЕ self-DoS: флуд от един IP не заключва друг IP", async () => {
  // Флуд далеч над per-IP лимита (и над стария глобален праг от 60).
  for (let i = 0; i < 80; i++) {
    await POST(req("10.0.0.5", { user: "stefan", pass: "грешна" }));
  }
  // Истинският админ от друг адрес трябва да МОЖЕ да влезе.
  const res = await POST(req("10.0.0.6", { user: "stefan", pass: "правилната-парола" }));
  assert.equal(res.status, 200, "чужд флуд не бива да блокира легитимния вход");
  assert.match(String(res.headers.get("set-cookie")), /mastilko_admin=/);
});

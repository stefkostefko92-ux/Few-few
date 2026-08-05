import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { hashPassword } from "../password";
import { authenticate, hasUsers } from "../users";

const PASSWORD = "правилна-парола-1234";

function withUsers(users: unknown): void {
  const directory = mkdtempSync(join(tmpdir(), "carbonip-users-"));
  const path = join(directory, "users.json");
  writeFileSync(path, JSON.stringify(users));
  process.env.IPLOOKUP_USERS_FILE = path;
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "ivanov",
    name: "Иван Иванов",
    unit: "РПУ Дупница",
    role: "operator",
    passwordHash: hashPassword(PASSWORD),
    ...overrides,
  };
}

test("верните данни отварят", () => {
  withUsers([user()]);
  const found = authenticate("ivanov", PASSWORD);
  assert.equal(found?.id, "ivanov");
  assert.equal(found?.role, "operator");
  assert.ok(hasUsers());
});

test("грешна парола и непознат идентификатор дават еднакво нищо", () => {
  withUsers([user()]);
  assert.equal(authenticate("ivanov", "грешна"), null);
  assert.equal(authenticate("nyama-go", PASSWORD), null);
});

test("изключен акаунт не влиза, но остава във файла", () => {
  // Остава, за да не се загуби следата му в дневника.
  withUsers([user({ disabled: true })]);
  assert.equal(authenticate("ivanov", PASSWORD), null);
});

test("повреден файл значи НУЛА достъп, не достъп без проверка", () => {
  const directory = mkdtempSync(join(tmpdir(), "carbonip-users-"));
  const path = join(directory, "users.json");
  writeFileSync(path, "{ това не е json");
  process.env.IPLOOKUP_USERS_FILE = path;

  assert.equal(authenticate("ivanov", PASSWORD), null);
  assert.equal(hasUsers(), false);
});

test("липсващ файл значи нула служители", () => {
  process.env.IPLOOKUP_USERS_FILE = join(tmpdir(), "carbonip-nyama-takyv-fail.json");
  assert.equal(hasUsers(), false);
  assert.equal(authenticate("ivanov", PASSWORD), null);
});

test("записи с непозната роля или липсващи полета се изхвърлят", () => {
  withUsers([
    { id: "bez-rolya", name: "х", unit: "у", passwordHash: hashPassword(PASSWORD) },
    { id: "chujda-rolya", name: "х", unit: "у", role: "админ", passwordHash: hashPassword(PASSWORD) },
    user(),
  ]);
  assert.equal(authenticate("bez-rolya", PASSWORD), null);
  assert.equal(authenticate("chujda-rolya", PASSWORD), null);
  assert.ok(authenticate("ivanov", PASSWORD), "валидният запис остава");
});

test("интервалите около идентификатора не пречат", () => {
  withUsers([user()]);
  assert.ok(authenticate("  ivanov  ", PASSWORD));
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "../password";

test("паролата се проверява срещу своя хеш", () => {
  const stored = hashPassword("правилна-парола-1234");
  assert.ok(verifyPassword("правилна-парола-1234", stored));
  assert.ok(!verifyPassword("грешна-парола", stored));
});

test("два хеша на една и съща парола се различават (сол)", () => {
  const a = hashPassword("еднаква");
  const b = hashPassword("еднаква");
  assert.notEqual(a, b, "без сол еднаквите пароли биха се разпознавали в списъка");
  assert.ok(verifyPassword("еднаква", a) && verifyPassword("еднаква", b));
});

test("параметрите живеят В хеша, за да могат да се сменят по-късно", () => {
  const stored = hashPassword("нещо");
  assert.match(stored, /^scrypt\$32768\$8\$1\$/);
});

test("повреден запис не се приема за валиден", () => {
  for (const bad of ["", "не-е-хеш", "scrypt$а$б$в$г$д", "bcrypt$1$2$3$4$5", "scrypt$32768$8$1$само-четири"]) {
    assert.equal(verifyPassword("каквото и да е", bad), false, `трябваше false: ${bad}`);
  }
});

test("Unicode паролите се нормализират, за да съвпадат", () => {
  // Едно и също изписано с различни нормализации трябва да съвпада — иначе
  // потребител с кирилица може да не влезе от друга клавиатура.
  const composed = "паролаé";
  const decomposed = "паролаé";
  const stored = hashPassword(composed);
  assert.ok(verifyPassword(decomposed, stored));
});

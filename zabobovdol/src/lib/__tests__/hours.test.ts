import test from "node:test";
import assert from "node:assert/strict";
import { openState } from "@/lib/hours";

// 2026-05-04 е понеделник; май е лятно часово време → София = UTC+3.
// Така 07:00Z = 10:00 София (пон.), 16:00Z = 19:00 София.
const monMorning = new Date("2026-05-04T07:00:00Z"); // пон. 10:00 София
const monEvening = new Date("2026-05-04T16:00:00Z"); // пон. 19:00 София
const monAfternoonGap = new Date("2026-05-04T11:30:00Z"); // пон. 14:30 София
const thu0900 = new Date("2026-05-07T06:00:00Z"); // чет. 09:00 София
const thu1100 = new Date("2026-05-07T08:00:00Z"); // чет. 11:00 София
const sat = new Date("2026-05-09T09:00:00Z"); // съб. 12:00 София
// Зимна проверка: 2026-01-05 е понеделник, зима → UTC+2; 08:00Z = 10:00 София.
const winterMon = new Date("2026-01-05T08:00:00Z");

test("празно/неразбираемо → unknown", () => {
  assert.equal(openState("").status, "unknown");
  assert.equal(openState("по уговорка").status, "unknown");
});

test("денонощно → винаги отворено", () => {
  assert.equal(openState("Денонощно (24/7)", monEvening).status, "open");
});

test("Пон–Пет 08:30–17:00", () => {
  assert.deepEqual(openState("Пон–Пет 08:30–17:00", monMorning), { status: "open", until: "17:00" });
  assert.equal(openState("Пон–Пет 08:30–17:00", monEvening).status, "closed");
  assert.equal(openState("Пон–Пет 08:30–17:00", sat).status, "closed");
  assert.equal(openState("Пон–Пет 08:30–17:00", winterMon).status, "open");
});

test("без дни → важи за всеки ден", () => {
  assert.equal(openState("08:00–18:00", monMorning).status, "open");
  assert.equal(openState("08:00–18:00", sat).status, "open");
});

test("два интервала с обедна почивка", () => {
  const h = "Пон–Пет 09:00–14:00, 15:00–19:00; събота и неделя — затворено";
  assert.equal(openState(h, monAfternoonGap).status, "closed"); // 14:30 — в почивката
  assert.deepEqual(openState(h, monAfternoonGap), { status: "closed", opensAt: "15:00" });
  assert.equal(openState(h, monMorning).status, "open"); // 10:00
  assert.equal(openState(h, sat).status, "closed");
});

test("различни дни с различни часове в един сегмент", () => {
  const h = "Приемно време: Пон и Пет 08:30–17:30, Чет 10:00–16:00";
  assert.equal(openState(h, monMorning).status, "open"); // пон. 10:00
  assert.deepEqual(openState(h, thu0900), { status: "closed", opensAt: "10:00" }); // чет. 09:00
  assert.equal(openState(h, thu1100).status, "open"); // чет. 11:00
});

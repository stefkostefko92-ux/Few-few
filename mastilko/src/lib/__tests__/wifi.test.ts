import test from "node:test";
import assert from "node:assert/strict";
import { wifiQr } from "../wifi";

test("WiFi QR: WPA с парола, екранира специалните знаци", () => {
  const s = wifiQr({ ssid: "Cafe;Mechta", password: "pa,ss:1", auth: "WPA", hidden: false });
  assert.ok(s.startsWith("WIFI:T:WPA;"));
  assert.ok(s.includes("S:Cafe\\;Mechta;"), "; в SSID екранирано");
  assert.ok(s.includes("P:pa\\,ss\\:1;"), ", и : в паролата екранирани");
  assert.ok(s.endsWith(";"));
});

test("WiFi QR: отворена мрежа без парола", () => {
  const s = wifiQr({ ssid: "FreeWiFi", password: "каквото", auth: "nopass", hidden: false });
  assert.ok(s.includes("T:nopass;"));
  assert.ok(!s.includes("P:"), "без поле за парола при отворена мрежа");
});

test("WiFi QR: скрита мрежа добавя H:true", () => {
  const s = wifiQr({ ssid: "Skrita", password: "x", auth: "WPA", hidden: true });
  assert.ok(s.includes("H:true;"));
});

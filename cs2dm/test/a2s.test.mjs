import { test } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import { buildInfoRequest, readChallenge, parseInfo, queryInfo } from "../server/a2s.mjs";

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);

/** Истински по форма A2S_INFO отговор (0x49). */
function infoPacket({ name = "CarbonStealth.eu | Dust2 DM", players = 7, maxPlayers = 20, bots = 3 } = {}) {
  const z = (s) => Buffer.from(`${s}\0`, "utf8");
  const appId = Buffer.alloc(2);
  appId.writeUInt16LE(730);
  return Buffer.concat([
    HEADER,
    Buffer.from([0x49, 17]),
    z(name), z("de_dust2"), z("csgo"), z("Counter-Strike 2"),
    appId,
    Buffer.from([players, maxPlayers, bots, "d".charCodeAt(0), "l".charCodeAt(0), 0, 1]),
    z("1.41.9.2"),
  ]);
}

test("заявката без предизвикателство е точно по протокола", () => {
  const req = buildInfoRequest();
  assert.deepEqual(req.subarray(0, 4), HEADER);
  assert.equal(req[4], 0x54);
  assert.equal(req.subarray(5).toString("latin1"), "Source Engine Query\0");
});

test("предизвикателството се добавя накрая", () => {
  const ch = Buffer.from([1, 2, 3, 4]);
  const req = buildInfoRequest(ch);
  assert.deepEqual(req.subarray(-4), ch);
});

test("readChallenge разпознава 0x41 и пропуска всичко друго", () => {
  const ch = Buffer.concat([HEADER, Buffer.from([0x41, 9, 8, 7, 6])]);
  assert.deepEqual(readChallenge(ch), Buffer.from([9, 8, 7, 6]));
  assert.equal(readChallenge(infoPacket()), null);
});

test("parseInfo чете името с „|“, картата, играчите и версията", () => {
  const info = parseInfo(infoPacket());
  assert.equal(info.name, "CarbonStealth.eu | Dust2 DM");
  assert.equal(info.map, "de_dust2");
  assert.equal(info.appId, 730);
  assert.equal(info.players, 7);
  assert.equal(info.maxPlayers, 20);
  assert.equal(info.bots, 3);
  assert.equal(info.serverType, "d");
  assert.equal(info.environment, "l");
  assert.equal(info.passwordProtected, false);
  assert.equal(info.vac, true);
  assert.equal(info.version, "1.41.9.2");
});

test("parseInfo отказва чужд или отрязан пакет", () => {
  assert.throws(() => parseInfo(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41, 1, 2, 3, 4])), /не е A2S_INFO/);
  const full = infoPacket();
  assert.throws(() => parseInfo(full.subarray(0, 20)), /отрязан/);
});

/** Фалшив сървър: отговаря с предизвикателство, после с INFO само ако то е върнато правилно. */
function fakeServer(t) {
  const sock = dgram.createSocket("udp4");
  const challenge = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
  sock.on("message", (msg, rinfo) => {
    const reply = msg.length === buildInfoRequest().length
      ? Buffer.concat([HEADER, Buffer.from([0x41]), challenge])
      : msg.subarray(-4).equals(challenge) ? infoPacket() : Buffer.alloc(0);
    if (reply.length) sock.send(reply, rinfo.port, rinfo.address);
  });
  t.after(() => sock.close());
  return new Promise((resolve) => sock.bind(0, "127.0.0.1", () => resolve(sock.address().port)));
}

test("queryInfo минава през предизвикателството и връща данните", async (t) => {
  const port = await fakeServer(t);
  const info = await queryInfo("127.0.0.1", port, 2000);
  assert.equal(info.name, "CarbonStealth.eu | Dust2 DM");
  assert.equal(info.maxPlayers, 20);
});

test("queryInfo пада с ясна грешка, когато никой не отговаря", async (t) => {
  const silent = dgram.createSocket("udp4");
  t.after(() => silent.close());
  const port = await new Promise((resolve) => silent.bind(0, "127.0.0.1", () => resolve(silent.address().port)));
  await assert.rejects(queryInfo("127.0.0.1", port, 200), /няма A2S отговор/);
});

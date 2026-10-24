// Агентът и плъгините от панела (CONTRACT §14): състоянието от файловете, точните systemctl аргументи,
// затвореният списък и „busy“, докато тече cs2-plugins@…. execFile е подменен — нищо не се пуска.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BIN, createDispatcher } from "../server/agent/cs2-agent.mjs";
import { PANEL_PLUGINS, disabledPath, parseModsLock, pluginStates, validatePluginArgs } from "../server/agent/agent-plugins.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SHOW_OK = "Id=cs2.service\nActiveState=active\nActiveEnterTimestamp=@1792828391\n\nId=cs2-update.service\nActiveState=inactive\nActiveEnterTimestamp=\n";

function machine(t) {
  const dir = mkdtempSync(join(tmpdir(), "cs2dm-plugins-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const csgo = join(dir, "csgo");
  const css = join(csgo, "addons/counterstrikesharp/plugins");
  mkdirSync(join(css, "Cosmetics"), { recursive: true });
  mkdirSync(join(css, "disabled/QuakeSounds"), { recursive: true });
  mkdirSync(join(csgo, "addons/metamod"), { recursive: true });
  writeFileSync(join(csgo, "addons/metamod/serverlistplayersfix_mm.vdf.disabled"), "");
  writeFileSync(join(dir, "mods.lock"), read("server/mods/mods.lock"));
  return {
    dir,
    paths: { cssLogs: join(dir, "logs"), steamInf: join(dir, "steam.inf"), modsBroken: join(dir, "broken"), csgo, modsLock: join(dir, "mods.lock") },
  };
}

function fakeExec({ activating = "" } = {}) {
  const calls = [];
  const exec = async (file, args, opts) => {
    calls.push({ file, args, opts });
    if (file === BIN.systemctl && args[0] === "show") return { stdout: SHOW_OK, stderr: "" };
    if (file === BIN.systemctl && args[0] === "list-units") return { stdout: activating, stderr: "" };
    return { stdout: "", stderr: "" };
  };
  return { exec, calls };
}

test("каталогът: шестте мода от §14, пътищата при спрян мод като cs2dm_disabled_path", () => {
  assert.deepEqual(PANEL_PLUGINS.map((p) => p.id), ["serverlistplayersfix", "quakesounds", "cosmetics", "demorecorder", "cheatertroll", "metablock"]);
  assert.equal(disabledPath(PANEL_PLUGINS[0]), "addons/metamod/serverlistplayersfix_mm.vdf.disabled");
  assert.equal(disabledPath(PANEL_PLUGINS[2]), "addons/counterstrikesharp/plugins/disabled/Cosmetics");
  assert.deepEqual([...parseModsLock("# x\nmetablock\t1.0.0\turl\tsha\tzip\n\nbad\n")], [["metablock", "1.0.0"]]);
});

test("plugins: състоянието от файловете + версията от mods.lock; без файлове → removed, нищо измислено", async (t) => {
  const { paths } = machine(t);
  const states = Object.fromEntries((await pluginStates(paths)).map((m) => [m.id, m]));
  assert.deepEqual(states.cosmetics, { id: "cosmetics", kind: "css", version: "26.05.1", state: "enabled" });
  assert.equal(states.quakesounds.state, "disabled");
  assert.equal(states.serverlistplayersfix.state, "disabled");
  assert.equal(states.serverlistplayersfix.kind, "metamod");
  assert.equal(states.metablock.state, "removed");
  const none = await pluginStates({ csgo: join(paths.csgo, "няма"), modsLock: join(paths.csgo, "няма.lock") });
  assert.ok(none.every((m) => m.state === "removed" && m.version === null));
});

test("plugins през диспечера: {mods, busy}; busy, докато тече cs2-plugins@…", async (t) => {
  const { paths } = machine(t);
  const idle = await createDispatcher({ exec: fakeExec().exec, paths }).run("plugins");
  assert.equal(idle.ok, true);
  assert.equal(idle.data.busy, false);
  assert.equal(idle.data.mods.length, 6);
  const { exec } = fakeExec({ activating: "cs2-plugins@install-cosmetics.service loaded activating start cs2dm\n" });
  const d = createDispatcher({ exec, paths });
  assert.equal((await d.run("plugins")).data.busy, true);
  assert.equal((await d.run("status")).data.busy, "plugin");
  for (const other of ["restart", "start", "stop", "update"]) assert.deepEqual(await d.run(other), { ok: false, error: "busy" }, other);
  assert.deepEqual(await d.run("plugin", { op: "disable", id: "cosmetics" }), { ok: false, error: "busy" });
});

test("plugin: enable/disable чакат (60 s), install/remove са --no-block; точните аргументи", async (t) => {
  const { paths } = machine(t);
  for (const [op, wait] of [["enable", true], ["disable", true], ["install", false], ["remove", false]]) {
    const { exec, calls } = fakeExec();
    const r = await createDispatcher({ exec, paths }).run("plugin", { op, id: "demorecorder", extra: "--force" });
    assert.deepEqual(r, { ok: true }, op);
    const last = calls.at(-1);
    assert.equal(last.file, BIN.systemctl);
    assert.deepEqual(
      last.args,
      wait
        ? ["--no-ask-password", "start", `cs2-plugins@${op}-demorecorder.service`]
        : ["--no-ask-password", "start", "--no-block", `cs2-plugins@${op}-demorecorder.service`],
      op,
    );
    assert.equal(last.opts.timeout, wait ? 60_000 : 30_000, op);
  }
});

test("plugin: само затвореният списък — иначе „bad args“ без нито едно systemctl извикване", async (t) => {
  const { paths } = machine(t);
  const bad = [
    {}, { op: "disable" }, { id: "cosmetics" }, { op: "purge", id: "cosmetics" }, { op: "disable", id: "metamod" },
    { op: "disable", id: "deathmatch" }, { op: "disable", id: "carbonstealth" }, { op: "disable", id: "multiaddonmanager" },
    { op: "disable", id: "cosmetics;rm" }, { op: "disable", id: "Cosmetics" }, { op: ["disable"], id: "cosmetics" },
    { op: "disable", id: 1 },
  ];
  for (const args of bad) {
    const { exec, calls } = fakeExec();
    assert.deepEqual(await createDispatcher({ exec, paths }).run("plugin", args), { ok: false, error: "bad args" }, JSON.stringify(args));
    assert.equal(calls.length, 0, JSON.stringify(args));
    assert.equal(validatePluginArgs(args).ok, false);
  }
});

test("agent-plugins.mjs само чете: без child_process и без запис във файлове", () => {
  const src = read("server/agent/agent-plugins.mjs");
  assert.doesNotMatch(src, /child_process|writeFile|appendFile|rename|unlink|rm\(|mkdir|chmod|chown/);
  assert.match(read("server/agent/install-agent.sh"), /"\$SRC_DIR\/agent-plugins\.mjs"/, "инсталаторът го слага до агента");
});

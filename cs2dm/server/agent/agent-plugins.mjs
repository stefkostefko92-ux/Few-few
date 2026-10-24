// agent-plugins.mjs — плъгините от панела в агента (CONTRACT §14). Нула зависимости.
//
// Агентът само ЧЕТЕ състоянието от файловете на мода и пуска cs2-plugins@<op>-<id>.service (polkit); всичко,
// което пише, е root страната — server/mods/plugins-apply.sh. Каталогът е същият като CS2DM_PANEL_MODS в
// mods-lib.sh, C# PluginCatalog и app/src/admin/plugins-catalog.ts (test/plugins-catalog.test.mjs).
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** Модовете, които панелът управлява: id → вид и пътят (спрямо game/csgo), когато е включен. */
export const PANEL_PLUGINS = Object.freeze([
  Object.freeze({ id: "serverlistplayersfix", kind: "metamod", path: "addons/metamod/serverlistplayersfix_mm.vdf" }),
  Object.freeze({ id: "quakesounds", kind: "css", path: "addons/counterstrikesharp/plugins/QuakeSounds" }),
  Object.freeze({ id: "cosmetics", kind: "css", path: "addons/counterstrikesharp/plugins/Cosmetics" }),
  Object.freeze({ id: "demorecorder", kind: "css", path: "addons/counterstrikesharp/plugins/DemoRecorder" }),
  Object.freeze({ id: "cheatertroll", kind: "css", path: "addons/counterstrikesharp/plugins/CheaterTroll" }),
  Object.freeze({ id: "metablock", kind: "css", path: "addons/counterstrikesharp/plugins/MetaBlock" }),
]);
export const PLUGIN_OPS = Object.freeze(["install", "remove", "enable", "disable"]);
/** enable/disable само местят файлове (root) — агентът чака; install/remove свалят и рестартират — `--no-block`. */
export const PLUGIN_WAIT_MS = 60_000;
export const PLUGINS_UNIT_GLOB = "cs2-plugins@*.service";

const byId = new Map(PANEL_PLUGINS.map((p) => [p.id, p]));

/**
 * Пътят, когато модът е спрян (като cs2dm_disabled_path): CSS прескача plugins/disabled, Metamod чете само *.vdf.
 * @param {{ kind: string, path: string }} plugin
 */
export function disabledPath(plugin) {
  if (plugin.kind === "metamod") return `${plugin.path}.disabled`;
  return plugin.path.replace("addons/counterstrikesharp/plugins/", "addons/counterstrikesharp/plugins/disabled/");
}

/**
 * `{op, id}` от панела → името на unit-а; всичко извън затворения списък → null.
 * @param {Record<string, unknown>} args
 * @returns {{ ok: true, op: string, id: string, unit: string } | { ok: false, error: string }}
 */
export function validatePluginArgs(args) {
  const op = args?.op;
  const id = args?.id;
  if (typeof op !== "string" || !PLUGIN_OPS.includes(op)) return { ok: false, error: "bad args" };
  if (typeof id !== "string" || !byId.has(id)) return { ok: false, error: "bad args" };
  return { ok: true, op, id, unit: `cs2-plugins@${op}-${id}.service` };
}

/**
 * mods.lock → id → версия (редове „име\tверсия\t…“; # е коментар).
 * @param {string} text
 */
export function parseModsLock(text) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [name, version] = line.split("\t");
    if (name && version) out.set(name, version.slice(0, 64));
  }
  return out;
}

async function exists(/** @type {string} */ path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Състоянието на всеки мод от файловете: enabled · disabled · removed. Версията — от копието на mods.lock
 * (липсва → null). Нищо не се измисля: нечетим път = няма го.
 * @param {{ csgo: string, modsLock: string }} paths
 */
export async function pluginStates(paths) {
  const versions = await readFile(paths.modsLock, "utf8").then(parseModsLock, () => new Map());
  return Promise.all(
    PANEL_PLUGINS.map(async (p) => {
      const state = (await exists(join(paths.csgo, p.path)))
        ? "enabled"
        : (await exists(join(paths.csgo, disabledPath(p))))
          ? "disabled"
          : "removed";
      return { id: p.id, kind: p.kind, version: versions.get(p.id) ?? null, state };
    }),
  );
}

/**
 * Тече ли cs2-plugins@…: `systemctl list-units --state=activating` → има ли ред.
 * @param {string} stdout
 */
export function pluginUnitsBusy(stdout) {
  return stdout.split("\n").some((line) => line.trim().startsWith("cs2-plugins@"));
}

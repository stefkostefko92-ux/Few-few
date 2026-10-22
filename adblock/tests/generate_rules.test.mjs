// tools/generate_rules.py е източникът на rules/ad_rules.json и rules/youtube_rules.json:
// ребилд във временна папка трябва да е БАЙТ ПО БАЙТ същият като комитнатите файлове —
// иначе следващото пускане на генератора тихо би изтрило поправка (така се бяха разминали
// #238, #239 и пропуснатите YouTube id-та 1001/1003).
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, ok, done } from "./_harness.mjs";

const out = mkdtempSync(join(tmpdir(), "sa-genrules-"));
try {
  const py = spawnSync("python3", ["-I", join(ROOT, "tools", "generate_rules.py"), "--out", out], { encoding: "utf8" });
  ok("generate_rules.py runs (python3)", py.status === 0);
  if (py.status !== 0) console.error(py.error ? String(py.error) : py.stderr);
  for (const name of ["ad_rules.json", "youtube_rules.json"]) {
    let same = false;
    try { same = readFileSync(join(out, name), "utf8") === readFileSync(join(ROOT, "rules", name), "utf8"); } catch {}
    ok(`generate_rules.py reproduces rules/${name} byte for byte`, same);
  }
  const yt = JSON.parse(readFileSync(join(ROOT, "rules", "youtube_rules.json"), "utf8")).map((r) => r.id);
  ok("youtube_rules: retired ids 1001 (/ptracking) and 1003 (/api/stats/atr) stay retired", !yt.includes(1001) && !yt.includes(1003));
} finally {
  rmSync(out, { recursive: true, force: true });
}

done();

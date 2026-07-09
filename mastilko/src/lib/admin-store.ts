import "server-only";
import { promises as fs } from "fs";
import path from "path";

// Админите живеят в JSON файл в data/ (не в env): bcrypt хешовете съдържат
// „$“, което зареждачите на .env (dotenv-expand / systemd) развалят. Формат:
//   { "потребител": "bcryptHash", … }
// Файлът се създава от scripts/hash-admin.mjs.

function dataDir(): string {
  return process.env.MASTILKO_DATA_DIR || path.join(process.cwd(), "data");
}

export async function readAdmins(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), "admins.json"), "utf8");
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return {};
    const table: Record<string, string> = {};
    for (const [u, h] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof h === "string") table[u] = h;
    }
    return table;
  } catch {
    return {};
  }
}

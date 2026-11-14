// Еднократно, от собственика, на негов компютър: ключова двойка за подписа на компилацията (т. 4).
//
//   node scripts/gen-signing-key.mjs [път/до/частен-ключ.pem]
//
// • Частният ключ се записва ИЗВЪН репото (по подразбиране ~/cspos-signing-key.pem, права 600).
//   Слага се в тайните на GitHub като CSPOS_SIGNING_KEY и в сейф. Никога в репото или в чата.
// • Публичният ключ отива в desktop/integrity-public.pem — той се комитва; Electron проверява с него.
// Смяна на ключа = нова версия и нова декларация пред НАП (Прил. № 31).

import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privPath = resolve(process.argv[2] ?? join(homedir(), "cspos-signing-key.pem"));
const pubPath = join(root, "desktop", "integrity-public.pem");

if (privPath.startsWith(resolve(root, "..") + sep)) {
  process.stderr.write("✖ Частният ключ не бива да е в репото. Дай път извън него.\n");
  process.exit(1);
}
if (existsSync(privPath) || existsSync(pubPath)) {
  process.stderr.write("✖ Ключът вече съществува — няма да го презапиша. Смяната е съзнателно решение.\n");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(privPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
writeFileSync(pubPath, publicKey.export({ type: "spki", format: "pem" }));
process.stdout.write(
  [
    `▸ Частен ключ: ${privPath} (права 600) — сложи съдържанието му в GitHub → Settings → Secrets → CSPOS_SIGNING_KEY,`,
    "  пази копие в сейф и изтрий файла от компютъра.",
    `▸ Публичен ключ: ${pubPath} — комитни го.`,
    "",
  ].join("\n")
);

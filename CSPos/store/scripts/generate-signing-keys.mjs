// Генерира Ed25519 двойка за подписване на офлайн лицензи (еднократно).
// Частният ключ остава на сървъра (mode 600); публичният се вгражда в касата
// (CSPos: env NEXT_PUBLIC_LICENSE_PUBLIC_KEY или Setting).

import fs from "node:fs";
import { generateSigningKeys } from "../lib/license.js";

const OUT = "./data";
fs.mkdirSync(OUT, { recursive: true });
const priv = `${OUT}/license-signing.key`;
if (fs.existsSync(priv)) {
  console.error(`${priv} вече съществува — няма да го презапиша.`);
  process.exit(1);
}
const { publicKeyPem, privateKeyPem } = generateSigningKeys();
fs.writeFileSync(priv, privateKeyPem, { mode: 0o600 });
fs.writeFileSync(`${OUT}/license-public.pem`, publicKeyPem);
console.log("Записани: data/license-signing.key (таен, 600) и data/license-public.pem (за касата).");

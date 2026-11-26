// Команда в контейнера (вика я deploy.sh):
//   node dist/cli/primo-admin.js conta   → брой потребители (stdout)
//   node dist/cli/primo-admin.js crea    → stdin: имейл\nпарола\n → първият MASTER
// Изходни кодове: 0 — готово; 2 — невалиден вход (причината е на stderr, без стойностите); 3 — вече има
// потребители; 1 — друга грешка. Съобщенията са на български: чете ги собственикът в терминала на деплоя.
import { prismaStore } from "../store/prisma.js";
import { creaPrimoMaster, leggiCredenziali } from "../primo-admin.js";
import { PASSWORD_MAX, PASSWORD_MIN } from "../auth/password.js";

const PRICINE: Record<string, string> = {
  email: "невалиден имейл (само букви, цифри и . _ % + - преди и след @).",
  corta: `паролата е по-къса от ${PASSWORD_MIN} знака.`,
  lunga: `паролата е по-дълга от ${PASSWORD_MAX} знака.`,
  comune: "паролата е твърде честа — изберете фраза от няколко думи.",
  personale: "паролата съдържа имейла или името.",
  ripetitiva: "паролата има твърде малко различни знаци.",
};

async function leggiStdin(): Promise<string> {
  const parti: Buffer[] = [];
  let n = 0;
  for await (const p of process.stdin) {
    const b = Buffer.isBuffer(p) ? p : Buffer.from(String(p));
    n += b.length;
    if (n > 4096) throw new Error("входът е твърде дълъг");
    parti.push(b);
  }
  return Buffer.concat(parti).toString("utf8");
}

async function main(): Promise<number> {
  const comando = process.argv[2];
  if (comando !== "conta" && comando !== "crea") {
    process.stderr.write("употреба: primo-admin.js conta | crea (stdin: имейл, парола)\n");
    return 1;
  }
  const store = prismaStore();
  try {
    if (comando === "conta") {
      process.stdout.write(`${await store.utenti.conta()}\n`);
      return 0;
    }
    const esito = await creaPrimoMaster(store, leggiCredenziali(await leggiStdin()));
    if (esito.ok) {
      process.stdout.write("администраторът (MASTER) е създаден; 2FA се настройва при първия вход в /admin.\n");
      return 0;
    }
    if (esito.errore === "esiste") {
      process.stderr.write("в базата вече има потребители — първият администратор не се създава отново.\n");
      return 3;
    }
    process.stderr.write(`${PRICINE[esito.errore] ?? "невалиден вход."}\n`);
    return 2;
  } finally {
    await store.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`грешка: ${err instanceof Error ? err.message.slice(0, 300) : "неизвестна"}\n`);
    process.exit(1);
  },
);

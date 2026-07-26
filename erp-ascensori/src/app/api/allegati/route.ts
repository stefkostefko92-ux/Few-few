// Качване и списък на прикачените файлове.
//
// Единствената врата към хранилището. Всичко минава оттук, защото тук стоят
// проверките: роля, фирма, тип по СЪДЪРЖАНИЕ, размер.
//
// Записът в базата и файлът на диска не могат да са атомарни заедно. Редът е
// избран така, че по-евтината грешка да остане: първо ФАЙЛЪТ, после редът. При
// падане между двете остава файл без ред — заема място, но е невидим и
// безобиден. Обратният ред би дал ред без файл: изтегляне, което дава 404, и
// доказателство, за което системата твърди, че съществува.

import { prisma } from "@/lib/prisma";
import { ok, gestito, errore } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import {
  validaAllegato,
  nomeSicuro,
  percorsoRelativo,
} from "@/lib/allegati/tipi";
import { salva, impronta, elimina } from "@/lib/allegati/archivio";
import { randomUUID } from "node:crypto";

/**
 * Към какво може да се прикача — ЗАТВОРЕН списък.
 *
 * Свободната връзка (`entita` + `entitaId`) е удобна, но без списък тя значи,
 * че познат UUID закача файл към коя да е таблица. Тук всеки запис казва и как
 * се проверява собствеността: без нея изолацията между фирмите пада.
 */
const ENTITA_AMMESSE = {
  impianti: { model: "impianto" },
  verifiche_impianti: { model: "verificaImpianto" },
  rapportini: { model: "rapportino" },
  ordini_lavoro: { model: "ordineLavoro" },
  fatture: { model: "fattura" },
  contratti: { model: "contratto" },
} as const;

type EntitaAmmessa = keyof typeof ENTITA_AMMESSE;

function entitaValida(v: string): v is EntitaAmmessa {
  return Object.hasOwn(ENTITA_AMMESSE, v);
}

/** Съществува ли записът И наш ли е. Ползва се и при качване, и при четене. */
async function proprietarioValido(
  entita: EntitaAmmessa,
  entitaId: string,
  s: Awaited<ReturnType<typeof richiedeRuolo>>,
): Promise<boolean> {
  const delegato = prisma[ENTITA_AMMESSE[entita].model] as unknown as {
    findFirst(a: object): Promise<unknown | null>;
  };
  return (
    (await delegato.findFirst({
      where: { id: entitaId, ...filtroTenant(s) },
    })) !== null
  );
}

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const url = new URL(req.url);
  const entita = url.searchParams.get("entita") ?? "";
  const entitaId = url.searchParams.get("entitaId") ?? "";
  if (!entitaValida(entita)) throw new ErroreHttp(400, "Entità non ammessa");
  if (!/^[0-9a-f-]{36}$/i.test(entitaId))
    throw new ErroreHttp(400, "Identificativo non valido");
  if (!(await proprietarioValido(entita, entitaId, s)))
    throw new ErroreHttp(404, "Record non trovato");

  const righe = await prisma.allegato.findMany({
    where: { entita, entitaId, ...filtroTenant(s) },
    orderBy: { createdAt: "desc" },
    // Пътят на диска НЕ излиза навън: той е вътрешна подробност и знанието му
    // не носи нищо на клиента освен карта на файловата система.
    select: {
      id: true,
      nome: true,
      mimeType: true,
      dimensione: true,
      sha256: true,
      createdAt: true,
    },
  });
  return ok({ righe });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("TECNICO");

  const form = await req.formData().catch(() => null);
  if (!form)
    return errore(400, "Richiesta non valida: attesa multipart/form-data");
  const file = form.get("file");
  const entita = String(form.get("entita") ?? "");
  const entitaId = String(form.get("entitaId") ?? "");

  if (!(file instanceof File)) return errore(400, "Nessun file caricato");
  if (!entitaValida(entita)) return errore(400, "Entità non ammessa");
  if (!/^[0-9a-f-]{36}$/i.test(entitaId))
    return errore(400, "Identificativo non valido");
  if (!(await proprietarioValido(entita, entitaId, s)))
    throw new ErroreHttp(404, "Record non trovato");

  const dati = new Uint8Array(await file.arrayBuffer());
  const esito = validaAllegato(dati, dati.byteLength);
  if ("errore" in esito) return errore(422, esito.errore);

  const id = randomUUID();
  const percorso = percorsoRelativo({
    tenantId: s.tenantId ?? null,
    id,
    estensione: esito.tipo.estensione,
    data: new Date(),
  });

  await salva(percorso, dati);
  let creato;
  try {
    creato = await prisma.allegato.create({
      data: {
        id,
        entita,
        entitaId,
        nome: nomeSicuro(file.name),
        // Подушеният тип, не обявеният: `Content-Type` е под контрола на
        // изпращача и е първото, което един нападател подменя.
        mimeType: esito.tipo.mime,
        dimensione: dati.byteLength,
        percorso,
        sha256: impronta(dati),
        utenteId: s.sub,
        ...tenantDiCreazione(s),
      },
      select: {
        id: true,
        nome: true,
        mimeType: true,
        dimensione: true,
        sha256: true,
        createdAt: true,
      },
    });
  } catch (e) {
    // Редът не мина — файлът няма кой да го намери. Чистим го веднага, за да не
    // остане сирак в хранилището.
    await elimina(percorso).catch(() => {});
    throw e;
  }

  await scriviAudit({
    azione: "CREATE",
    entita: "allegati",
    entitaId: creato.id,
    dettagli: {
      valori: {
        nome: { a: creato.nome },
        tipo: { a: creato.mimeType },
        dimensione: { a: String(creato.dimensione) },
        allegatoA: { a: `${entita}/${entitaId}` },
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});

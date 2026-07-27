// Износ на пратка за съхранение.
//
// Досега изнасянето на изготвените документи ставаше файл по файл през
// браузъра. При двеста фактури за годината това е двеста натискания и никаква
// гаранция, че полученото е изпратеното.
//
// Пратката съдържа XML-ите такива, каквито са били издадени, индекс с отпечатък
// на всеки файл и обяснение на италиански какво пратката НЕ е — продуктът не
// съхранява по норма и не бива да остави място за подразбиране, че го прави.

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { gestito, errore } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { fatturaPerSdi } from "@/lib/sdi/carica";
import {
  xmlFatturaPa,
  validaPerSdi,
  nomeFileSdi,
  totaliSdi,
} from "@/lib/sdi/fatturapa";
import {
  creaPacchetto,
  type DocumentoConservazione,
} from "@/lib/sdi/conservazione";

/** Дата от адреса. Сгрешена стойност дава 400 с обяснение, не 500 от базата. */
function dataParam(url: URL, nome: string): Date | null {
  const v = url.searchParams.get(nome);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime()))
    throw new ErroreHttp(400, `Parametro «${nome}» non è una data valida`);
  return d;
}

export const runtime = "nodejs";
// Двеста фактури значат двеста сглобявания на XML — подразбирането не стига.
export const maxDuration = 300;

/** Таван: над него пратката се дели по период. Пази паметта на процеса. */
const MAX_DOCUMENTI = 2_000;

export const GET = gestito(async (req) => {
  // Фискален износ на цялата година — това е ниво „ръководство", не оператор.
  const s = await richiedeRuolo("DIREZIONE");
  const url = new URL(req.url);
  const dal = dataParam(url, "dal");
  const al = dataParam(url, "al");

  const dove = {
    ...filtroTenant(s),
    tipo: "EMESSA" as const,
    // Черновата НЕ влиза: тя не е издаден документ и няма какво да се съхранява.
    stato: { not: "BOZZA" as const },
    ...(dal || al
      ? { data: { ...(dal ? { gte: dal } : {}), ...(al ? { lte: al } : {}) } }
      : {}),
  };

  const fatture = await prisma.fattura.findMany({
    where: dove,
    select: { id: true, numero: true },
    orderBy: { data: "asc" },
    take: MAX_DOCUMENTI + 1,
  });

  if (fatture.length === 0)
    return errore(
      404,
      "Nessuna fattura emessa nel periodo selezionato: non c'è nulla da versare.",
    );
  if (fatture.length > MAX_DOCUMENTI)
    return errore(
      413,
      `Troppe fatture nel periodo (oltre ${MAX_DOCUMENTI}): restringere l'intervallo di date e produrre più pacchetti.`,
    );

  const azienda = await prisma.datiAzienda.findFirst({
    where: { tenantId: s.tenantId ?? null },
  });

  const documenti: DocumentoConservazione[] = [];
  const scartate: string[] = [];

  for (const f of fatture) {
    const dati = await fatturaPerSdi(f.id, s.tenantId ?? null, azienda);
    // Изчезнала между двете заявки: това пак е документ, който НЕ влиза в
    // пратката — мълчаливото `continue` беше точно поведението, което
    // коментарът отдолу забранява.
    if (!dati) {
      scartate.push(f.numero);
      continue;
    }
    // Документ, който НЕ минава проверката, не влиза мълчаливо: пратка, в която
    // част от документите са негодни, изглежда пълна и не е.
    if (validaPerSdi(dati).length) {
      scartate.push(f.numero);
      continue;
    }
    const t = totaliSdi(dati);
    documenti.push({
      numero: dati.numero,
      data: dati.data,
      nomeFile: nomeFileSdi(
        dati.azienda.partitaIva ?? "",
        dati.progressivoInvio,
      ),
      xml: xmlFatturaPa(dati),
      destinatario: dati.cliente.denominazione,
      partitaIvaDestinatario: dati.cliente.partitaIva ?? null,
      codiceFiscaleDestinatario: dati.cliente.codiceFiscale ?? null,
      totaleCentesimi: t.importoTotaleDocumento,
      tipoDocumento: dati.tipoDocumento,
    });
  }

  if (documenti.length === 0)
    return errore(
      422,
      `Nessuna fattura conforme nel periodo: ${scartate.length} ${scartate.length === 1 ? "documento non supera" : "documenti non superano"} i controlli dello SdI e ${scartate.length === 1 ? "va corretto" : "vanno corretti"} prima del versamento.`,
    );

  const pacchetto = creaPacchetto(
    documenti,
    {
      ragioneSociale: azienda?.ragioneSociale ?? "",
      partitaIva: azienda?.partitaIva ?? null,
      codiceFiscale: azienda?.codiceFiscale ?? null,
    },
    new Date(),
    { dal, al },
  );

  await scriviAudit({
    // Износът не е ново действие в речника на одита: това е ЧЕТЕНЕ на цялата
    // фискална година наведнъж и точно като такова трябва да се вижда.
    azione: "IMPORT",
    entita: "fatture",
    entitaId: "conservazione",
    dettagli: {
      documenti: documenti.length,
      scartate: scartate.length,
      // Отпечатъкът на индекса влиза в одита: така „коя точно пратка е
      // предадена през март" има отговор след години.
      sha256Indice: pacchetto.indice.sha256Indice,
      dal: dal?.toISOString() ?? null,
      al: al?.toISOString() ?? null,
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  const corpo = new ArrayBuffer(pacchetto.zip.length);
  new Uint8Array(corpo).set(pacchetto.zip);
  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pacchetto.nomeFile}"`,
      "X-Content-Type-Options": "nosniff",
      // Броят влиза в хедър, за да го покаже интерфейсът, без да отваря архива.
      "X-Documenti": String(documenti.length),
      "X-Scartate": String(scartate.length),
    },
  });
});

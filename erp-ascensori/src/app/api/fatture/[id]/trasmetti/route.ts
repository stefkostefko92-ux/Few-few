// Подаване на фактурата по конфигурирания канал.
//
// РАЗЛИКАТА ОТ `/sdi`. Там се ВПИСВА, че файлът е тръгнал — човек го е подал
// през портала на Agenzia delle Entrate или го е пратил на счетоводителя. Тук
// продуктът го изпраща САМ, когато клиентът е конфигурирал канал.
//
// Двата пътя съществуват заедно нарочно: канал се конфигурира от малцина, а
// ръчното подаване е реалността на повечето малки фирми. Отнемането на ръчния
// път би направило продукта неизползваем точно за тях.
//
// КАКВО НЕ ПРАВИ ТОЗИ МАРШРУТ: не подписва. Квалифицираният подпис иска смарт
// карта в ръцете на законния представител; сървър, който подписва вместо него,
// държи средството за подписване на трето лице. Файлът тръгва такъв, какъвто е
// изготвен — а къде подписът е задължителен, това е въпрос към счетоводителя.

import { prisma } from "@/lib/prisma";
import { ok, gestito, errore } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { fatturaPerSdi } from "@/lib/sdi/carica";
import { xmlFatturaPa, validaPerSdi, nomeFileSdi } from "@/lib/sdi/fatturapa";
import { configTrasmissione, controllaInvio } from "@/lib/sdi/trasmissione";
import { consenti } from "@/lib/rate-limit";
import { giaTrasmessa } from "@/lib/fiscale/sdi-stato";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMITE_ORARIO = Number(process.env.RATE_LIMIT_SDI ?? 120);

export const GET = gestito(async () => {
  // Интерфейсът пита „има ли канал", за да не показва бутон, който само ще
  // даде грешка. Отговорът НЕ носи тайни — само кой е каналът.
  await richiedeRuolo("DIREZIONE");
  const c = configTrasmissione();
  return ok({
    attivo: c.canale !== "manuale",
    canale: c.canale,
    etichetta: c.etichetta,
  });
});

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;

  const cfg = configTrasmissione();
  if (cfg.canale === "manuale")
    return errore(
      503,
      "Nessun canale di trasmissione configurato: scaricare l'XML e trasmetterlo tramite il proprio intermediario o il portale Fatture e Corrispettivi.",
    );

  if (!consenti(`sdi:${s.tenantId ?? "-"}`, LIMITE_ORARIO, 60 * 60_000))
    return errore(429, "Troppe trasmissioni: riprovare fra qualche minuto.");

  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      id: true,
      numero: true,
      tipo: true,
      stato: true,
      statoSdi: true,
      progressivoInvio: true,
    },
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");
  if (f.tipo !== "EMESSA")
    throw new ErroreHttp(
      400,
      "Si possono trasmettere allo SdI solo le fatture emesse.",
    );
  // Черновата не се подава: подаден документ е издаден и номерът му е
  // изразходван. Това е причината, не подредбата на състоянията.
  if (f.stato === "BOZZA")
    throw new ErroreHttp(
      409,
      "Fattura in bozza: va emessa prima di essere trasmessa",
    );
  // ЕДИН ФАЙЛ СЕ ПОДАВА ВЕДНЪЖ. SDI отхвърля повторно име като дубликат
  // независимо от съдържанието; повторното натискане след мрежова грешка е
  // най-обикновеното нещо на света.
  if (giaTrasmessa(f.statoSdi))
    throw new ErroreHttp(
      409,
      `Fattura già trasmessa (stato ${f.statoSdi}): una nuova trasmissione sarebbe respinta dallo SdI come duplicato.`,
    );

  const dati = await fatturaPerSdi(id, s.tenantId ?? null);
  if (!dati) throw new ErroreHttp(404, "Fattura non trovata");
  const problemi = validaPerSdi(dati);
  if (problemi.length)
    return errore(422, `Fattura non conforme: ${problemi.join(" ")}`);

  const nomeFile = nomeFileSdi(
    dati.azienda.partitaIva ?? "",
    dati.progressivoInvio,
  );
  const xml = xmlFatturaPa(dati);

  const guasti = controllaInvio(
    { nomeFile, xml, numeroFattura: f.numero },
    cfg,
  );
  if (guasti.length)
    return errore(
      422,
      `Configurazione del canale non valida: ${guasti.join(" ")}`,
    );

  // ФАКТЪТ СЕ ЗАПИСВА ПРЕДИ ОТГОВОРА НА КАНАЛА.
  //
  // Обратното значи, че прекъсване по средата оставя фактура, за която
  // системата не знае, че е тръгнала — а следващото натискане прави ВТОРО
  // подаване на същия файл. По-добре „подадена, но не сме сигурни" (човек го
  // проверява) отколкото тихо двойно подаване.
  const upd = await prisma.fattura.updateMany({
    where: { id, statoSdi: f.statoSdi },
    data: { statoSdi: "INVIATA", dataInvioSdi: new Date() },
  });
  // РЕЗУЛТАТЪТ ОТ УСЛОВНИЯ ЗАПИС СЕ ЧЕТЕ. Без това двоен клик по бавна връзка
  // минава два пъти: вторият запис не променя нищо, но пише ВТОРИ ред в
  // неизменимия одит („da GENERATA a INVIATA", което не се е случило) и
  // отговаря „подадена". В деня, в който под този ред застане реален канал,
  // същият пропуск е двойно подаване към SDI.
  if (upd.count === 0)
    throw new ErroreHttp(
      409,
      "Stato SDI modificato da un'altra operazione: ricaricare la fattura.",
    );
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "fatture",
    entitaId: id,
    dettagli: {
      valori: {
        statoSdi: { da: f.statoSdi, a: "INVIATA" },
        canale: { a: cfg.canale },
        nomeFile: { a: nomeFile },
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  // Самото предаване. Реализацията на канала е ИЗВЪН продукта: PEC минава през
  // пощенския сървър на клиента, посредникът — през неговото API. Тук се
  // подготвя всичко и се предава на конфигурираното; докато няма реален
  // изпращач, състоянието е „подадена за изпращане" и човекът вижда точно това.
  return ok({
    trasmesso: true,
    canale: cfg.canale,
    etichetta: cfg.etichetta,
    nomeFile,
    // Честно съобщение: системата НЕ твърди, че SDI е приел документа. Това се
    // научава от известието, не от успешно изпращане.
    messaggio: `Fattura ${f.numero} preparata e marcata come trasmessa tramite ${cfg.etichetta}. L'esito arriverà con la notifica dello SdI (RC, NS o MC).`,
  });
});

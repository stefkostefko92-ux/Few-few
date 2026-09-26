// Администрирането на акаунти: отключване, втори фактор, сесии, имейл, ИИ.
//
// Правилото за кого-кой е едно (`utenteGestibile`) и тук се проверява през
// всеки маршрут, който го ползва: ADMIN управлява своята фирма, MASTER —
// всички; сигурността на администратор пипа само MASTER.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, PASSWORD, unico, BASE } from "./_client";
import { codice as codiceTotp } from "../../src/lib/totp";
import { prisma } from "../../src/lib/prisma";

let master: Sessione;

after(() => prisma.$disconnect());

before(async () => {
  master = await comeRuolo("MASTER");
});

async function nuovoUtente(ruolo = "OPERATORE", tenantId?: string) {
  const email = `${unico("amm").toLowerCase()}@test.local`;
  const r = await master.post<{ id: string }>("/api/utenti", {
    email,
    password: PASSWORD,
    nome: "Utente",
    cognome: "Amministrato",
    ruolo,
    ...(tenantId ? { tenantId } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  const s = new Sessione();
  assert.equal(await s.entra(email), 200);
  return { id: r.dati.id, email, sessione: s };
}

/**
 * Собствен MASTER за теста. Демо MASTER-ът е споделен от целия паралелен
 * пакет, а сесиите на потребител са с таван (`MAX_SESSIONI`): всяка нова
 * изтласква най-старата — тоест чужд тест губи сесията си по средата.
 */
async function nuovoMaster() {
  const u = await nuovoUtente("MASTER");
  return u;
}

async function nuovaAzienda() {
  const slug = unico("amm-az")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const t = await master.post<{ id: string }>("/api/tenants", {
    slug,
    ragioneSociale: `Azienda ${slug}`,
    email: `${slug}@test.local`,
  });
  assert.equal(t.status, 201);
  return t.dati.id;
}

describe("отключване", () => {
  test("ADMIN маха блокадата и броя на неуспехите", async () => {
    const u = await nuovoUtente();
    const tentativi = new Sessione();
    for (let i = 0; i < 5; i++)
      await tentativi.entra(u.email, "Sbagliata!2026x");
    assert.equal(await new Sessione().entra(u.email), 423);

    const admin = (await nuovoUtente("ADMIN")).sessione;
    const r = await admin.post(`/api/utenti/${u.id}/sblocca`);
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(await new Sessione().entra(u.email), 200);

    const traccia = await prisma.auditLog.findFirst({
      where: { entita: "users", entitaId: u.id, azione: "STATE_CHANGE" },
      orderBy: { seq: "desc" },
    });
    assert.ok(traccia, "отключването оставя следа");
  });

  test("OPERATORE не отключва никого", async () => {
    const u = await nuovoUtente();
    const op = (await nuovoUtente("OPERATORE")).sessione;
    assert.equal((await op.post(`/api/utenti/${u.id}/sblocca`)).status, 403);
  });
});

describe("сесиите на чужд акаунт", () => {
  test("„Termina tutte le sessioni“ сваля и живия access token", async () => {
    const u = await nuovoUtente();
    assert.equal((await u.sessione.get("/api/impianti")).status, 200);
    const r = await master.del<{ sessioniRevocate: number }>(
      `/api/utenti/${u.id}/sessioni`,
    );
    assert.equal(r.status, 200);
    assert.ok(r.dati.sessioniRevocate >= 1);
    assert.equal((await u.sessione.get("/api/impianti")).status, 401);
  });

  test("спряният акаунт губи сесиите си, не само refresh-а", async () => {
    const u = await nuovoUtente();
    await master.put(`/api/utenti/${u.id}`, { attivo: false });
    const vive = await prisma.sessioneAttiva.count({
      where: { utenteId: u.id, revocataAt: null },
    });
    assert.equal(vive, 0);
  });
});

describe("втори фактор на чужд акаунт", () => {
  async function conMfa(ruolo: string, tenantId?: string) {
    const u = await nuovoUtente(ruolo, tenantId);
    const setup = await u.sessione.get<{ segreto: string }>("/api/auth/mfa");
    assert.equal(setup.status, 200);
    const on = await u.sessione.post("/api/auth/mfa", {
      codice: codiceTotp(setup.dati.segreto),
    });
    assert.equal(on.status, 200, JSON.stringify(on.dati));
    return u;
  }

  test("ADMIN нулира фактора на оператор; входът пак е само с парола", async () => {
    const u = await conMfa("OPERATORE");
    assert.equal(await new Sessione().entra(u.email), 428);
    const admin = (await nuovoUtente("ADMIN")).sessione;
    const r = await admin.del(`/api/utenti/${u.id}/mfa`);
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(await new Sessione().entra(u.email), 200);
    // и старите сесии паднаха — изгубеният телефон може да е с отворена
    assert.equal((await u.sessione.get("/api/impianti")).status, 401);
  });

  test("ADMIN НЕ сваля фактора на друг ADMIN — само MASTER", async () => {
    const az = await nuovaAzienda();
    const a = await nuovoUtente("ADMIN", az);
    const b = await conMfa("ADMIN", az);
    const r = await a.sessione.del(`/api/utenti/${b.id}/mfa`);
    assert.equal(r.status, 403, JSON.stringify(r.dati));
    assert.equal(await new Sessione().entra(b.email), 428, "факторът стои");

    assert.equal((await master.del(`/api/utenti/${b.id}/mfa`)).status, 200);
    assert.equal(await new Sessione().entra(b.email), 200);
  });

  test("паролата и имейлът на друг ADMIN — също само MASTER", async () => {
    const az = await nuovaAzienda();
    const a = await nuovoUtente("ADMIN", az);
    const b = await nuovoUtente("ADMIN", az);
    assert.equal(
      (
        await a.sessione.post(`/api/utenti/${b.id}/password`, {
          password: "Nuova-Password!2026-lunga",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await a.sessione.put(`/api/utenti/${b.id}`, {
          email: `${unico("presa").toLowerCase()}@test.local`,
        })
      ).status,
      403,
    );
    // името на колегата ADMIN може да поправи
    assert.equal(
      (await a.sessione.put(`/api/utenti/${b.id}`, { nome: "Corretto" }))
        .status,
      200,
    );
    // а MASTER — всичко
    assert.equal(
      (
        await master.post(`/api/utenti/${b.id}/password`, {
          password: "Nuova-Password!2026-lunga",
        })
      ).status,
      200,
    );
  });

  test("ADMIN на една фирма не стига до акаунт на друга", async () => {
    const a = await nuovoUtente("ADMIN", await nuovaAzienda());
    const b = await nuovoUtente("OPERATORE", await nuovaAzienda());
    for (const [metodo, p] of [
      ["POST", `/api/utenti/${b.id}/sblocca`],
      ["DELETE", `/api/utenti/${b.id}/mfa`],
      ["DELETE", `/api/utenti/${b.id}/sessioni`],
    ] as const)
      assert.equal(
        (await a.sessione.richiesta(metodo, p)).status,
        404,
        `${metodo} ${p}`,
      );
  });
});

describe("промяна на акаунта", () => {
  test("имейлът се сменя, в минуски, и с него се влиза", async () => {
    const u = await nuovoUtente();
    const nuova = `${unico("nuova").toLowerCase()}@test.local`;
    const r = await master.put<{ email: string }>(`/api/utenti/${u.id}`, {
      email: `  ${nuova.toUpperCase()} `,
    });
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(r.dati.email, nuova);
    assert.equal(await new Sessione().entra(nuova), 200);
    assert.equal(await new Sessione().entra(u.email), 401);
  });

  test("зает имейл е 409, не 500", async () => {
    const a = await nuovoUtente();
    const b = await nuovoUtente();
    const r = await master.put(`/api/utenti/${a.id}`, { email: b.email });
    assert.equal(r.status, 409, JSON.stringify(r.dati));
  });

  test("собственият акаунт не се спира и не се понижава", async () => {
    const admin = await nuovoUtente("ADMIN", await nuovaAzienda());
    const me = await admin.sessione.get<{ id: string }>("/api/me");
    assert.equal(
      (await admin.sessione.put(`/api/utenti/${me.dati.id}`, { attivo: false }))
        .status,
      409,
    );
    assert.equal(
      (
        await admin.sessione.put(`/api/utenti/${me.dati.id}`, {
          ruolo: "OPERATORE",
        })
      ).status,
      409,
    );
    // името си може да смени
    assert.equal(
      (await admin.sessione.put(`/api/utenti/${me.dati.id}`, { nome: "Nuovo" }))
        .status,
      200,
    );
  });

  test("списъкът показва втория фактор и ИИ на всеки акаунт", async () => {
    const r = await master.get<{
      righe: { totpAttivo: boolean; aiConsentita: boolean }[];
    }>("/api/utenti");
    assert.equal(r.status, 200);
    assert.equal(typeof r.dati.righe[0].totpAttivo, "boolean");
    assert.equal(typeof r.dati.righe[0].aiConsentita, "boolean");
    // и нищо, което не бива да излиза
    const corpo = JSON.stringify(r.dati);
    assert.equal(/password|totpSegreto|codiciRecupero/.test(corpo), false);
  });
});

// ─── MASTER работи в избрана фирма ────────────────────────────────────────

/** Стойността на бисквитка от сесията — за опитите да се пренесе другаде. */
function biscotto(s: Sessione, nome: string): string | undefined {
  return s
    .cookieHeader()
    .split("; ")
    .find((c) => c.startsWith(`${nome}=`))
    ?.slice(nome.length + 1);
}

async function conBiscotto(s: Sessione, extra: string, percorso: string) {
  const res = await fetch(BASE + percorso, {
    headers: { Cookie: `${s.cookieHeader()}; ${extra}` },
  });
  return { status: res.status, dati: await res.json().catch(() => ({})) };
}

describe("MASTER в избрана фирма", () => {
  test("записът се ражда във фирмата, одитът е в нейната верига", async () => {
    const az = await nuovaAzienda();
    const admin = await nuovoUtente("ADMIN", az);
    const m = (await nuovoMaster()).sessione;

    const dentro = await m.post<{ corrente: { id: string } }>(
      "/api/amministrazione/azienda",
      { tenantId: az },
    );
    assert.equal(dentro.status, 200, JSON.stringify(dentro.dati));
    const me = await m.get<{ aziendaContesto: { id: string } | null }>(
      "/api/me",
    );
    assert.equal(me.dati.aziendaContesto?.id, az);

    const nome = unico("CondMaster");
    const c = await m.post<{ id: string; tenantId: string }>("/api/condomini", {
      nome,
      indirizzo: "Via Contesto 1",
      citta: "Milano",
    });
    assert.equal(c.status, 201, JSON.stringify(c.dati));
    const riga = await prisma.condominio.findUnique({
      where: { id: c.dati.id },
      select: { tenantId: true },
    });
    assert.equal(riga?.tenantId, az, "записът е на избраната фирма");

    // ADMIN на фирмата го вижда; следата за влизането е в НЕЙНИЯ одит
    const lista = await admin.sessione.get<{ righe: { id: string }[] }>(
      `/api/condomini?q=${encodeURIComponent(nome)}`,
    );
    assert.ok(lista.dati.righe.some((r) => r.id === c.dati.id));
    const traccia = await prisma.auditLog.count({
      where: { tenantId: az, entita: "contesto_azienda" },
    });
    assert.equal(traccia, 1);
    const verifica = await admin.sessione.post<{ integro: boolean }>(
      "/api/audit/verifica",
      {},
    );
    assert.equal(verifica.dati.integro, true, JSON.stringify(verifica.dati));

    // изход: пак ниво на доставчика
    assert.equal(
      (await m.post("/api/amministrazione/azienda", { tenantId: null })).status,
      200,
    );
    const fuori = await m.get<{ aziendaContesto: unknown }>("/api/me");
    assert.equal(fuori.dati.aziendaContesto, null);
  });

  test("бисквитката не минава в друга сесия, нито при не-MASTER", async () => {
    const az = await nuovaAzienda();
    const mio = await nuovoMaster();
    const m1 = mio.sessione;
    await m1.post("/api/amministrazione/azienda", { tenantId: az });
    const valore = biscotto(m1, "ea_azienda");
    assert.ok(valore, "бисквитката е издадена");

    const m2 = new Sessione();
    assert.equal(await m2.entra(mio.email), 200);
    const altrove = await conBiscotto(m2, `ea_azienda=${valore}`, "/api/me");
    assert.equal(altrove.dati.aziendaContesto, null, "друга сесия");

    const admin = (await nuovoUtente("ADMIN")).sessione;
    const daAdmin = await conBiscotto(admin, `ea_azienda=${valore}`, "/api/me");
    assert.equal(daAdmin.dati.aziendaContesto ?? null, null, "не-MASTER");

    const falso = await conBiscotto(m2, `ea_azienda=${az}.abc`, "/api/me");
    assert.equal(falso.dati.aziendaContesto, null, "без подпис");
  });

  test("само MASTER избира; непозната фирма е 404", async () => {
    const admin = (await nuovoUtente("ADMIN")).sessione;
    assert.equal(
      (await admin.post("/api/amministrazione/azienda", { tenantId: null }))
        .status,
      403,
    );
    const m = (await nuovoMaster()).sessione;
    assert.equal(
      (
        await m.post("/api/amministrazione/azienda", {
          tenantId: "00000000-0000-4000-8000-000000000000",
        })
      ).status,
      404,
    );
  });

  test("MASTER влиза и в спряна фирма — ADMIN ѝ не може", async () => {
    const az = await nuovaAzienda();
    const admin = await nuovoUtente("ADMIN", az);
    const m = (await nuovoMaster()).sessione;
    assert.equal(
      (await m.put(`/api/tenants/${az}`, { attivo: false })).status,
      200,
    );
    assert.equal((await admin.sessione.get("/api/impianti")).status, 403);
    await m.post("/api/amministrazione/azienda", { tenantId: az });
    assert.equal((await m.get("/api/impianti")).status, 200);
  });
});

// ─── Панелът „Amministrazione" ─────────────────────────────────────────────

describe("панел „Amministrazione“", () => {
  test("ADMIN вижда броячите на фирмата, автоматизмите — само MASTER", async () => {
    const admin = (await nuovoUtente("ADMIN")).sessione;
    const a = await admin.get<{ master: boolean; automatismi: unknown }>(
      "/api/amministrazione/stato",
    );
    assert.equal(a.status, 200);
    assert.equal(a.dati.master, false);
    assert.equal(a.dati.automatismi, null);

    const m = await master.get<{
      master: boolean;
      automatismi: { nome: string }[];
      utenti: { totale: number };
    }>("/api/amministrazione/stato");
    assert.equal(m.dati.master, true);
    assert.deepEqual(
      m.dati.automatismi.map((r) => r.nome),
      ["scadenze", "contratti", "retention", "webhook", "notifiche"],
    );
    assert.ok(m.dati.utenti.totale > 0);
    // само броячи — нито един имейл
    assert.equal(/@/.test(JSON.stringify(m.dati)), false);

    const op = (await nuovoUtente("OPERATORE")).sessione;
    assert.equal((await op.get("/api/amministrazione/stato")).status, 403);
  });

  test("„Rimetti in coda“ връща провалените САМО на своята фирма", async () => {
    const azA = await nuovaAzienda();
    const azB = await nuovaAzienda();
    const adminA = await nuovoUtente("ADMIN", azA);
    const crea = (tenantId: string) =>
      prisma.notifica.create({
        data: {
          tipo: "SCADENZA_IMPIANTO",
          chiave: unico("fallita"),
          destinatario: "manutenzione@test.local",
          oggetto: "Scadenza",
          corpo: "Corpo",
          stato: "FALLITA",
          tentativi: 5,
          ultimoErrore: "smtp:550",
          tenantId,
        },
      });
    const [na, nb] = await Promise.all([crea(azA), crea(azB)]);

    const r = await adminA.sessione.post<{ rimesseInCoda: number }>(
      "/api/notifiche/riprova",
    );
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(r.dati.rimesseInCoda, 1);
    const [dopoA, dopoB] = await Promise.all([
      prisma.notifica.findUnique({ where: { id: na.id } }),
      prisma.notifica.findUnique({ where: { id: nb.id } }),
    ]);
    assert.equal(dopoA?.stato, "IN_ATTESA");
    assert.equal(dopoA?.tentativi, 0);
    assert.equal(dopoA?.ultimoErrore, null);
    assert.equal(dopoB?.stato, "FALLITA", "чуждата фирма не се пипа");
  });
});

// Store в паметта — за тестовете (и локален преглед без база). Поведението следва Prisma реализацията.
import { randomUUID } from "node:crypto";
import { STATI_RICHIESTA, type Store, type Utente, type Sessione, type Richiesta, type Contenuto, type Pubblicazione, type Evento } from "./types.js";

export function memoryStore(): Store {
  const utenti = new Map<string, Utente>();
  const sessioni = new Map<string, Sessione>();
  const richieste = new Map<string, Richiesta>();
  const contenuti = new Map<string, Contenuto>();
  const revisioni: Array<{ id: string; contenutoId: string; dati: unknown; autoreId: string | null; creataIl: Date }> = [];
  const pubblicazioni: Pubblicazione[] = [];
  const eventi: Evento[] = [];
  const id = () => randomUUID();

  return {
    utenti: {
      async conta() {
        return utenti.size;
      },
      async tutti() {
        return [...utenti.values()].sort((a, b) => a.creatoIl.getTime() - b.creatoIl.getTime());
      },
      async perId(i) {
        return utenti.get(i) ?? null;
      },
      async perEmail(e) {
        return [...utenti.values()].find((u) => u.email === e.toLowerCase()) ?? null;
      },
      async crea(u) {
        if ([...utenti.values()].some((x) => x.email === u.email)) throw new Error("email_duplicata");
        const nuovo: Utente = {
          id: id(),
          ...u,
          email: u.email.toLowerCase(),
          attivo: true,
          totpSecretEnc: null,
          totpAttivaDal: null,
          totpUltimoPasso: null,
          codiciRecupero: [],
          tentativiFalliti: 0,
          bloccatoFino: null,
          ultimoAccesso: null,
          creatoIl: new Date(),
        };
        utenti.set(nuovo.id, nuovo);
        return nuovo;
      },
      async aggiorna(i, patch) {
        const u = utenti.get(i);
        if (!u) throw new Error("utente_inesistente");
        const nuovo = { ...u, ...patch };
        utenti.set(i, nuovo);
        return nuovo;
      },
    },
    sessioni: {
      async crea(s) {
        const ora = new Date();
        const nuova: Sessione = { id: id(), creataIl: ora, ultimoUso: ora, ...s };
        sessioni.set(nuova.id, nuova);
        return nuova;
      },
      async perId(i) {
        return sessioni.get(i) ?? null;
      },
      async aggiorna(i, patch) {
        const s = sessioni.get(i);
        if (s) sessioni.set(i, { ...s, ...patch });
      },
      async elimina(i) {
        sessioni.delete(i);
      },
      async eliminaDiUtente(u) {
        for (const [k, s] of sessioni) if (s.utenteId === u) sessioni.delete(k);
      },
      async eliminaScadute(ora) {
        let n = 0;
        for (const [k, s] of sessioni) if (s.scadeIl <= ora) (sessioni.delete(k), n++);
        return n;
      },
    },
    richieste: {
      async crea(r) {
        const ora = new Date();
        const nuova: Richiesta = { id: id(), ...r, stato: "NUOVA", note: "", creataIl: ora, aggiornataIl: ora };
        richieste.set(nuova.id, nuova);
        return nuova;
      },
      async perId(i) {
        return richieste.get(i) ?? null;
      },
      async cerca(f) {
        const t = f.testo?.toLowerCase();
        const tutte = [...richieste.values()]
          .filter((r) => !f.stato || r.stato === f.stato)
          .filter((r) => !t || [r.nome, r.email, r.comune, r.messaggio].some((x) => x.toLowerCase().includes(t)))
          .sort((a, b) => b.creataIl.getTime() - a.creataIl.getTime());
        return { righe: tutte.slice(f.offset, f.offset + f.limite), totale: tutte.length };
      },
      async contaPerStato() {
        const out = Object.fromEntries(STATI_RICHIESTA.map((s) => [s, 0])) as Record<(typeof STATI_RICHIESTA)[number], number>;
        for (const r of richieste.values()) out[r.stato] += 1;
        return out;
      },
      async aggiorna(i, patch) {
        const r = richieste.get(i);
        if (!r) throw new Error("richiesta_inesistente");
        const nuova = { ...r, ...patch, aggiornataIl: new Date() };
        richieste.set(i, nuova);
        return nuova;
      },
      async elimina(i) {
        richieste.delete(i);
      },
      async eliminaScadute(ora) {
        let n = 0;
        for (const [k, r] of richieste) if (r.eliminareDopo && r.eliminareDopo <= ora) (richieste.delete(k), n++);
        return n;
      },
    },
    contenuti: {
      async tutti() {
        return [...contenuti.values()];
      },
      async perId(i) {
        return contenuti.get(i) ?? null;
      },
      async salva(i, tipo, dati, autoreId) {
        const c: Contenuto = { id: i, tipo, dati, aggiornatoIl: new Date(), autoreId };
        contenuti.set(i, c);
        revisioni.push({ id: id(), contenutoId: i, dati, autoreId, creataIl: new Date() });
        return c;
      },
      async elimina(i) {
        contenuti.delete(i);
      },
      async revisioni(i, limite) {
        return revisioni
          .filter((r) => r.contenutoId === i)
          .reverse()
          .slice(0, limite)
          .map(({ id: rid, creataIl, autoreId }) => ({ id: rid, creataIl, autoreId }));
      },
    },
    pubblicazioni: {
      async crea(autoreId) {
        const p: Pubblicazione = { id: id(), iniziataIl: new Date(), finitaIl: null, esito: "IN_CORSO", errore: null, versione: null, autoreId };
        pubblicazioni.push(p);
        return p;
      },
      async chiudi(i, esito, dati) {
        const p = pubblicazioni.find((x) => x.id === i);
        if (p) Object.assign(p, { esito, finitaIl: new Date(), errore: dati.errore ?? null, versione: dati.versione ?? null });
      },
      async ultime(limite) {
        return [...pubblicazioni].reverse().slice(0, limite);
      },
    },
    eventi: {
      async registra(e) {
        eventi.push({ id: id(), creatoIl: new Date(), ...e });
      },
      async ultimi(limite, offset) {
        return [...eventi].reverse().slice(offset, offset + limite);
      },
      async eliminaPrimaDi(data) {
        const prima = eventi.length;
        for (let i = eventi.length - 1; i >= 0; i--) if (eventi[i]!.creatoIl < data) eventi.splice(i, 1);
        return prima - eventi.length;
      },
    },
  };
}

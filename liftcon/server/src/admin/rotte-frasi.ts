// Библиотеката с фрази (спецификация D4): собствени фрази към точките на чеклиста — аномалия (текст +
// препоръка + приоритет) или въпрос за изясняване. Готовите от каталога не се пипат; собствените се изключват.
import { Router } from "express";
import type { AdminDeps } from "./deps.js";
import { registra } from "./deps.js";
import { pagina, avviso, csrf, esc } from "./html.js";
import { auth } from "../auth/sessione.js";
import { richiedePermesso } from "../auth/guards.js";
import { FraseInSchema } from "../documenti/schema.js";
import { ETICHETTE_PRIORITA } from "../documenti/condiviso/testi.js";
import type { Priorita } from "../documenti/condiviso/tipi.js";

export function rotteFrasi(d: AdminDeps): Router {
  const r = Router();
  r.use("/frasi", richiedePermesso("frasi.gestisci"));
  const cat = () => d.documenti.catalogo;
  const nomeVoce = (id: string) => {
    for (const s of cat().sezioni) for (const v of s.voci) if (v.id === id) return `${s.titolo} – ${v.testo}`;
    return id;
  };

  r.get("/frasi", async (req, res) => {
    const a = auth(res)!;
    const frasi = await d.store.frasi.tutte();
    const opzioni = cat()
      .sezioni.map((s) => `<optgroup label="${esc(s.titolo)}">${s.voci.map((v) => `<option value="${esc(v.id)}">${esc(v.testo)}</option>`).join("")}</optgroup>`)
      .join("");
    const righe = frasi.length
      ? `<div class="tabella-wrap"><table class="tabella"><thead><tr><th>Voce</th><th>Tipo</th><th>Testo</th><th>Raccomandazione</th><th>Priorità</th><th></th></tr></thead><tbody>${frasi
          .map(
            (f) => `<tr${f.attiva ? "" : ' class="spenta"'}><td>${esc(nomeVoce(f.voceId))}</td><td>${f.tipo === "anomalia" ? "Anomalia" : "Da chiarire"}</td><td>${esc(f.testo)}</td><td>${esc(f.raccomandazione)}</td><td>${f.tipo === "anomalia" ? esc(ETICHETTE_PRIORITA[f.priorita as Priorita] ?? f.priorita) : "—"}</td><td><form method="post" action="/admin/frasi/${esc(f.id)}/attiva">${csrf(a)}<button class="link" type="submit">${f.attiva ? "Disattiva" : "Riattiva"}</button></form></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<p class="nota">Nessuna frase propria: le frasi del catalogo sono già disponibili in ogni voce.</p>`;
    res.send(
      pagina({
        titolo: "Frasi della checklist",
        auth: a,
        attivo: "/admin/frasi",
        corpo: `${req.query.ok ? avviso("ok", "Frase salvata.") : req.query.errore ? avviso("errore", "Controlli i campi: testo di almeno 3 caratteri.") : ""}
<p class="nota">Le frasi proprie compaiono nella checklist accanto a quelle del catalogo (${cat().sezioni.reduce((n, s) => n + s.voci.length, 0)} voci). Scriva in modo descrittivo: che cosa si osserva e che cosa si consiglia al committente, senza giudizi di conformità.</p>
<form method="post" action="/admin/frasi" class="scheda">${csrf(a)}<h2>Nuova frase</h2>
<label for="voce">Voce della checklist</label><select id="voce" name="voceId" required>${opzioni}</select>
<label for="tipo">Tipo</label><select id="tipo" name="tipo"><option value="anomalia">Anomalia osservata</option><option value="chiarimento">Punto da chiarire (domanda)</option></select>
<label for="testo">Testo</label><textarea id="testo" name="testo" rows="2" maxlength="1500" required></textarea>
<label for="racc">Raccomandazione (solo per le anomalie)</label><textarea id="racc" name="raccomandazione" rows="2" maxlength="1500"></textarea>
<label for="prio">Priorità indicativa</label><select id="prio" name="priorita"><option value="media">Media</option><option value="alta">Alta</option><option value="bassa">Bassa</option></select>
<button class="btn" type="submit">Aggiungi</button></form>
<h2>Frasi proprie</h2>${righe}`,
      }),
    );
  });

  r.post("/frasi", async (req, res) => {
    const a = auth(res)!;
    const p = FraseInSchema.safeParse(req.body ?? {});
    const voceEsiste = p.success && cat().sezioni.some((s) => s.voci.some((v) => v.id === p.data.voceId));
    if (!p.success || !voceEsiste) return res.redirect(303, "/admin/frasi?errore=1");
    const f = await d.store.frasi.crea({ ...p.data, raccomandazione: p.data.tipo === "anomalia" ? p.data.raccomandazione : "", attiva: true, autoreId: a.utente.id });
    await registra(d, req, a.utente.id, "frase.creata", f.id);
    res.redirect(303, "/admin/frasi?ok=1");
  });

  r.post("/frasi/:id/attiva", async (req, res) => {
    const a = auth(res)!;
    const f = await d.store.frasi.perId(String(req.params.id));
    if (!f) return res.status(404).send("Frase non trovata.");
    await d.store.frasi.aggiorna(f.id, { attiva: !f.attiva });
    await registra(d, req, a.utente.id, "frase.aggiornata", f.id, { attiva: !f.attiva });
    res.redirect(303, "/admin/frasi");
  });

  return r;
}

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Informativa sul trattamento dei dati',
  robots: { index: false, follow: false },
};

/**
 * Informativa agli utenti del gestionale (dipendenti e collaboratori).
 *
 * Questa pagina è una TRACCIA, non un testo legale pronto. I contenuti
 * mancanti — identità del titolare, tempi di conservazione, contatti — li
 * completa il titolare del trattamento con il proprio consulente: sono dati
 * dell'azienda che usa il gestionale, non nostri, e un testo inventato qui
 * sarebbe peggio di un testo assente (informativa falsa invece che mancante).
 *
 * Perché serve, in concreto: il gestionale misura l'attività individuale —
 * `PickList.assignedTo` con orari di inizio e fine, `userId` su ogni movimento,
 * la traccia di controllo filtrabile per utente e periodo. In Italia, per usare
 * dati raccolti tramite gli strumenti di lavoro «a tutti i fini connessi al
 * rapporto di lavoro» serve aver dato al lavoratore adeguata informazione sulle
 * modalità d'uso e di controllo (art. 4, comma 3, L. 300/1970, come modificato
 * dal D.Lgs. 151/2015), oltre all'informativa degli artt. 12-13 GDPR.
 */

const DA_COMPLETARE = '⟨da completare a cura del titolare⟩';

function Sezione({
  titolo,
  children,
}: {
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">{titolo}</h2>
      <div className="mt-2 space-y-2 text-sm text-fg-muted">{children}</div>
    </section>
  );
}

export default function InformativaPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Informativa sul trattamento dei dati personali
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        Rivolta a chi utilizza il gestionale di magazzino (dipendenti e
        collaboratori), ai sensi degli artt. 12 e 13 del Regolamento (UE)
        2016/679.
      </p>

      <p className="mt-6 rounded border border-warn bg-warn/10 p-3 text-sm">
        <strong>Bozza da completare.</strong> Le parti contrassegnate con{' '}
        <code>{DA_COMPLETARE}</code> devono essere compilate dal titolare del
        trattamento insieme al proprio consulente legale, prima di dare accesso
        al gestionale. Il fornitore del software non può scriverle al suo posto.
      </p>

      <Sezione titolo="Titolare del trattamento">
        <p>
          {DA_COMPLETARE} — ragione sociale, sede legale, partita IVA, indirizzo
          e-mail di contatto. È l&rsquo;azienda che utilizza il gestionale.
        </p>
        <p>
          <strong>Carbon Stealth VCC</strong> tratta i dati in qualità di
          <strong> responsabile del trattamento</strong> (art. 28 GDPR), per lo
          sviluppo e la manutenzione del software, sulla base di un apposito
          accordo con il titolare.
        </p>
      </Sezione>

      <Sezione titolo="Quali dati vengono trattati">
        <ul className="list-disc space-y-1 pl-5">
          <li>Dati identificativi dell&rsquo;utenza: nome, indirizzo e-mail, ruolo.</li>
          <li>
            Dati di accesso: data e ora dell&rsquo;ultimo accesso, dispositivo e
            browser utilizzati, durata della sessione.
          </li>
          <li>
            Attività svolta nel gestionale: movimenti di magazzino, ricevimenti,
            prelievi, inventari, ordini creati o modificati — ciascuno associato
            all&rsquo;utente che li ha eseguiti.
          </li>
          <li>
            Traccia di controllo delle modifiche (chi ha cambiato cosa e quando).
          </li>
        </ul>
        <p>
          Non vengono trattate categorie particolari di dati (art. 9 GDPR), né
          dati di pagamento. Non è presente alcuna profilazione automatizzata né
          alcun processo decisionale automatizzato ai sensi dell&rsquo;art. 22.
        </p>
      </Sezione>

      <Sezione titolo="Perché vengono trattati e su quale base">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Esecuzione del rapporto di lavoro e gestione operativa del
            magazzino</strong> — art. 6(1)(b) e (c) GDPR.
          </li>
          <li>
            <strong>Sicurezza del sistema e tracciabilità delle operazioni</strong>{' '}
            — legittimo interesse del titolare, art. 6(1)(f), valutato con un
            test di bilanciamento documentato: {DA_COMPLETARE}.
          </li>
        </ul>
        <p>
          Il consenso non è la base giuridica di questi trattamenti: nel rapporto
          di lavoro non sarebbe liberamente prestato.
        </p>
      </Sezione>

      <Sezione titolo="Come vengono usati i dati sull'attività">
        <p>
          {DA_COMPLETARE} — indicare espressamente chi può consultare la traccia
          di controllo, con quale frequenza, per quali finalità e per quali
          finalità <em>non</em> viene utilizzata. È l&rsquo;informazione richiesta
          dall&rsquo;art. 4, comma 3, dello Statuto dei Lavoratori sulle modalità
          d&rsquo;uso degli strumenti e di effettuazione dei controlli.
        </p>
      </Sezione>

      <Sezione titolo="Per quanto tempo">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Documenti gestionali (ordini, movimenti, ricevimenti): dieci anni,
            per gli obblighi di conservazione delle scritture contabili
            (art. 2220 c.c.).
          </li>
          <li>
            Traccia di controllo e dati di accesso: {DA_COMPLETARE} (il software
            applica il valore configurato, predefinito 24 mesi).
          </li>
          <li>Sessioni scadute: eliminate dalla manutenzione periodica.</li>
        </ul>
      </Sezione>

      <Sezione titolo="A chi vengono comunicati">
        <p>
          Ai soli soggetti che trattano i dati per conto del titolare: il
          fornitore del software e il fornitore dell&rsquo;infrastruttura che lo
          ospita, entrambi nominati responsabili ai sensi dell&rsquo;art. 28. I
          dati restano su server situati nell&rsquo;Unione Europea e non sono
          trasferiti verso Paesi terzi. Elenco aggiornato: {DA_COMPLETARE}.
        </p>
      </Sezione>

      <Sezione titolo="Quali diritti hai">
        <p>
          Accesso, rettifica, cancellazione, limitazione, opposizione e
          portabilità (artt. 15-22 GDPR), scrivendo al titolare all&rsquo;indirizzo
          indicato sopra. Alcuni dati non possono essere cancellati su richiesta
          quando la loro conservazione è necessaria per adempiere a un obbligo di
          legge (art. 17(3)(b) GDPR): è il caso dei documenti contabili e dei
          movimenti di magazzino.
        </p>
        <p>
          È inoltre possibile proporre reclamo al{' '}
          <strong>Garante per la protezione dei dati personali</strong>{' '}
          (www.garanteprivacy.it).
        </p>
      </Sezione>

      <Sezione titolo="Cookie e archiviazione nel browser">
        <p>
          Il gestionale usa un solo cookie tecnico di sessione
          (<code>staffe_session</code>), necessario per mantenere l&rsquo;accesso, e
          una preferenza di interfaccia salvata nel browser
          (<code>staffe-tema</code>, chiaro/scuro). Nessun cookie di profilazione,
          nessuna analitica, nessun servizio di terze parti: per questo non è
          richiesto alcun consenso preventivo.
        </p>
      </Sezione>

      <p className="mt-8 text-sm">
        <Link href="/accesso" className="text-brand underline">
          Torna all&rsquo;accesso
        </Link>
      </p>
    </main>
  );
}

# Sicurezza — Staffe (gestionale di magazzino)

Prodotto proprietario di **Carbon Stealth VCC**, ospitato nell'Unione Europea.
Sicurezza e conformità GDPR sono requisiti di progetto, non aggiunte successive.
Vedere anche il `SECURITY.md` alla radice del repository (postura generale e
divulgazione coordinata).

## Che dati tratta

| Categoria | Esempi | Base giuridica |
|---|---|---|
| Dati di dipendenti/utenti | nome, e-mail aziendale, ruolo, accessi | contratto / legittimo interesse (sicurezza) |
| Anagrafiche aziendali | ragione sociale, partita IVA, indirizzi, contatti di clienti e fornitori | contratto |
| Dati operativi | prodotti, giacenze, movimenti, ordini, allegati tecnici | contratto |

**Non tratta** categorie particolari (art. 9 GDPR), né dati di pagamento: il
gestionale non incassa. Le persone fisiche interessate sono i dipendenti che lo
usano e i referenti di clienti e fornitori.

## Controlli implementati

- **Autenticazione**: password con bcrypt (12 round); sessione come JWT firmato
  (HS256, `jose`) in cookie `httpOnly` + `sameSite=lax` + `secure` in produzione.
- **Revoca reale**: ogni token porta un `jti` legato a una riga `Session`. Il
  logout, la disattivazione dell'utente e il cambio password revocano la
  sessione. *Un JWT senza revoca rende il logout una finzione: il token rubato
  resta valido fino alla scadenza.*
- **Fail closed**: senza `AUTH_SECRET` (≥32 caratteri) l'applicazione non firma
  e non verifica nulla — nessun valore di ripiego generato a runtime.
- **Difesa a due livelli**: il middleware verifica la firma sul bordo; la
  decisione definitiva (sessione viva, utente attivo) è sempre lato server in
  `getSessionUser()`.
- **Autorizzazione per ruolo**: matrice unica in `src/lib/rbac.ts`, applicata sul
  server con `requirePermission()`. Nascondere un pulsante non è una protezione.
- **Traccia di controllo**: `AuditLog` registra chi ha fatto cosa; i campi
  sensibili (password, token, `jti`) vengono rimossi prima della scrittura.
- **Validazione degli input**: Zod su ogni rotta API; Prisma parametrizza le
  query (nessuna concatenazione SQL).
- **Intestazioni di sicurezza**: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy` (fotocamera solo stessa origine, per lo
  scanner; microfono e geolocalizzazione negati).
- **Allegati**: estensioni e MIME su lista consentita, limite di dimensione,
  nome di archiviazione generato dal server (mai il nome inviato dall'utente →
  niente *path traversal*), archiviazione **fuori** da `public/`, download con
  `Content-Disposition: attachment` e controllo dei permessi.
- **Enumerazione utenti**: il login risponde con un messaggio unico e confronta
  comunque un hash fittizio, per non rivelare quali indirizzi esistono.

## Segreti

I segreti **non entrano mai** nel repository né nell'archivio di deploy. Vivono
sul server in `.env` con permessi `600`. `.env*` è in `.gitignore`; il gate
`security` del repository (secret-scan + gitleaks) blocca la CI in caso di fuga.

Rotazione di `AUTH_SECRET`: invalida tutte le sessioni in corso (comportamento
voluto — è la leva d'emergenza in caso di compromissione).

## GDPR in pratica

- **Minimizzazione**: si raccoglie ciò che serve a spedire e fatturare. Nessun
  tracciamento comportamentale, nessun cookie di profilazione, nessun servizio
  terzo: l'unico cookie è quello tecnico di sessione, che non richiede consenso.
- **Conservazione**: i documenti (ordini, movimenti, ricevimenti) si conservano
  per gli obblighi civilistici e fiscali italiani; gli accessi e l'audit per un
  periodo definito dal titolare. Le sessioni scadute si eliminano
  (`purgeExpiredSessions`).
- **Diritti degli interessati**: i referenti di clienti e fornitori esercitano i
  propri diritti presso il titolare del trattamento; l'amministratore può
  rettificare o disattivare le anagrafiche. Le righe storiche dei documenti
  restano per obbligo di legge (art. 17(3)(b) GDPR).
- **Titolare e responsabile**: l'azienda che usa il gestionale è titolare;
  Carbon Stealth VCC agisce come responsabile del trattamento per lo sviluppo e
  la manutenzione. Serve un accordo ex art. 28 GDPR.

*Questo documento descrive controlli tecnici e non costituisce consulenza legale.*

## Segnalare una vulnerabilità

Divulgazione coordinata secondo il `SECURITY.md` alla radice del repository. Non
aprire una issue pubblica per una vulnerabilità.

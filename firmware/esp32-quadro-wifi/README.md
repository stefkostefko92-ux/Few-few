# Firmware ESP32 — Modulo WiFi parametrizzazione quadro ascensore (PROTOTIPO)

Web-server locale su ESP32 in **Access Point** per leggere/scrivere i parametri del
controller ascensore via **RS485 / Modbus RTU**, rispettando la separazione
safety / non-safety descritta in [`../../docs/02-parametri-wifi.md`](../../docs/02-parametri-wifi.md).

> ⚠️ Prototipo **didattico**. Non fa parte della catena di sicurezza. Vedi avvertenze
> nel README principale del repo. Credenziali e mappa registri sono placeholder.

## Schema collegamento

```
  ESP32                 MAX485 (RS485)            Controller (porta Modbus)
  GPIO17 (TX2) ───────► DI
  GPIO16 (RX2) ◄─────── RO
  GPIO4  (DE/RE)──────► DE+RE (uniti)
                         A ───────────────────────► A
                         B ───────────────────────► B
                         GND ─────────────────────► GND (riferimento comune)

  GPIO5 (EN_PAR) ◄──── SELETTORE A CHIAVE in quadro (-S-EN)
                        (chiuso = 24V->divisore->3.3V = abilita parametri SR)
  GPIO2 ─────────────► LED stato
  Alim. 5V dal -T1 (24V->5V) sul pin VIN
```

> ⚠️ L'ingresso `EN_PAR` deve arrivare a 3.3V: usare partitore/optoisolatore dai 24V
> di quadro. **Mai** collegare direttamente 24V al GPIO.

## Build & flash (PlatformIO)

```bash
# 1. interfaccia web + mappa parametri sono gia in data/
#    (data/parametri.json e copia di config/parametri.json del repo)
pio run -t uploadfs      # carica LittleFS (index.html + parametri.json)
pio run -t upload        # carica il firmware
pio device monitor       # log seriale / audit
```

## Uso

1. Connettersi all'AP WiFi `QUADRO-ASC-MANUT` (password in `main.cpp`, da cambiare).
2. Aprire `http://192.168.4.1/`.
3. Login `operator` → modifica parametri **NS**.
4. Login `admin` **+ chiave fisica inserita** → modifica anche parametri **SR**
   (entro i range normativi; valori fuori range vengono rifiutati con HTTP 422).
5. Parametri **SC / RO** sono sempre in sola lettura.

## API REST

| Metodo | Endpoint | Auth | Descrizione |
|--------|----------|------|-------------|
| POST | `/api/login` | — | `{user,pass}` → `{token,role,ttl_s}` |
| GET  | `/api/params` | — | elenco parametri + valori (Modbus) + stato chiave |
| POST | `/api/param` | Bearer | `{id,value}` scrittura con gate safety/range |
| GET  | `/api/status` | — | stato modulo + chiave inserita |

### Codici di risposta scrittura
- `200` ok · `401` non autenticato/ruolo errato · `403` sola lettura (SC/RO)
- `422` valore fuori range normativo · `423` chiave non inserita (SR) · `502` errore Modbus

## Cybersecurity (CRA + EN 81-20) — implementato nel prototipo
Vedi [`../../docs/09-cybersecurity-cra.md`](../../docs/09-cybersecurity-cra.md).
- **Password con hash SHA-256 salati** (nessun segreto in chiaro), confronto a tempo costante.
- **Lockout anti brute-force**: 5 tentativi → blocco 60 s (HTTP 429).
- **Audit log persistente** su LittleFS (`/audit.log`) con rotazione.
- WiFi in **AP locale** WPA2/WPA3, nessuna esposizione a Internet.
- Doppio gate (firmware + PLC) sulla chiave fisica per i parametri safety.

## Hardening ulteriore per produzione (TODO)
- KDF lento (PBKDF2/scrypt/Argon2) con salt per-utente; rotazione credenziali.
- TLS (HTTPS) o accesso solo da rete manutenzione isolata.
- Aggiornamenti firmware firmati + SBOM; gestione vulnerabilità (CRA).
- Watchdog e gestione robusta timeout Modbus.

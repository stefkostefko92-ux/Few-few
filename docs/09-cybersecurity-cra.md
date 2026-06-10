# Deliverable — Cybersecurity del modulo connesso (Cyber Resilience Act + EN 81-20)

Hardening del modulo WiFi (interfaccia web parametri/HMI) secondo le esigenze
essenziali del **Regolamento (UE) 2024/2847 — Cyber Resilience Act (CRA)** e il
requisito di **protezione dell'accesso** della **EN 81-20 §5.12**. Il CRA si applica
ai "prodotti con elementi digitali" connessi: un quadro ascensore con WiFi vi rientra.

> ⚠️ Misure implementate a livello **prototipo** nel firmware. Per la produzione
> completare con KDF lento, salt per-utente, TLS e gestione certificati.

## Misure implementate (`firmware/esp32-quadro-wifi/src/main.cpp`)

| Esigenza CRA / EN 81-20 | Implementazione |
|-------------------------|-----------------|
| **Nessun segreto in chiaro** (CRA All. I §1.2(j)) | Password salvate come **hash SHA-256 salati** (`AUTH_SALT + pwd`), mai in chiaro |
| **Protezione da accessi non autorizzati** (CRA §1.2(d)) | Login con ruoli `operator`/`admin`; sessione a token con scadenza (10 min) |
| **Resistenza a brute-force** | **Lockout** dopo 5 tentativi falliti per 60 s (HTTP 429) |
| **Confronto sicuro** | Verifica hash a **tempo costante** (no timing leak) |
| **Riservatezza dei dati safety** (EN 81-20 §5.12) | Parametri safety scrivibili solo con **chiave fisica** (`-S-EN`), doppio gate firmware+PLC |
| **Tracciabilità / audit** (CRA §1.2(k)) | **Audit log persistente** su LittleFS (`/audit.log`) con rotazione; ogni login e scrittura parametri registrati |
| **Superficie d'attacco minima** (CRA §1.2(a)) | WiFi in **Access Point locale** WPA2/WPA3, **nessuna esposizione a Internet/cloud** |
| **Integrità dei limiti** | Clamp ai range normativi lato firmware **e** PLC (`FB_ParametriModbus`) |

## Esempio di flusso di login (hardened)

```
POST /api/login {user, pass}
  ├─ se in lockout            → 429 (retry_s)
  ├─ h = SHA256(SALT + pass)
  ├─ secureEquals(h, HASH)?   → token + ruolo (audit OK)
  └─ altrimenti               → 401 (audit FAIL_AUTH); +1 tentativo → lockout a 5
```

## Gestione delle credenziali

Gli hash di esempio nel firmware sono `SHA-256("few-few-quadro-2026" + password)`.
**Cambiare salt e password prima della messa in servizio.** Per rigenerare un hash:

```bash
python3 -c "import hashlib;print(hashlib.sha256(('few-few-quadro-2026'+'NUOVA_PWD').encode()).hexdigest())"
```

## Raccomandazioni per la produzione (non nel prototipo)

1. **KDF lento** (PBKDF2/scrypt/Argon2) con **salt per-utente** invece di SHA-256 singolo.
2. **TLS** (HTTPS) o accesso solo da rete di manutenzione fisicamente isolata.
3. **Aggiornamenti firmware firmati** e **SBOM** (richiesti dal CRA).
4. **Gestione vulnerabilità** e canale di **coordinated disclosure** (obbligo CRA).
5. Cambio password obbligatorio al primo accesso; scadenza/rotazione.
6. Disattivazione dei servizi non necessari; rate-limiting su tutti gli endpoint.

## Checklist collaudo correlata

Voci `C34`, `C35`, `C26`, `C27` in
[`../config/checklist-collaudo.csv`](../config/checklist-collaudo.csv).

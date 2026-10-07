# Quadro di manovra a PLC per ascensori — studio di fattibilità (IT)

_2026-10-07 · Carbon Stealth VCC · lingua: italiano · stato: studio, non progetto esecutivo_

Quadro di manovra a **PLC programmabile** per ascensori **elettrici con argano geared** e **idraulici**, fino a **12 fermate
(espandibile a 24)**, a norma **UNI EN 81-20/50:2020** (nuovo) o **UNI 10411:2024** (modernizzazione), con **pagina web per
smartphone** (impostazioni sbloccate per ruolo) e **accesso remoto via modem 5G**.

| File | Contenuto |
|---|---|
| [`01-studio-di-fattibilita.md`](01-studio-di-fattibilita.md) | risposta in breve, opzioni, architettura, trazione/idraulico, nuovo/modernizzazione, rischi, piano |
| [`02-normativa-punti.md`](02-normativa-punti.md) | punti e valori di norma per il quadro (solo numero, termine, valore + puntatore alla base privata) |
| [`03-costi.md`](03-costi.md) | costo minimo: dati verificati, ipotesi, formula, preventivi da chiedere |
| [`04-software-plc-e-web.md`](04-software-plc-e-web.md) | POU del PLC, registri, pagina web, aggiornamenti, test |
| [`05-remoto-cybersicurezza.md`](05-remoto-cybersicurezza.md) | 5G, VPN, firewall, RED/EN 18031, CRA, cosa è consentito da remoto |
| [`schemi/`](schemi/) | 16 tavole A3 in SVG + `index.html` (galleria) |
| [`Tavole-quadro-PLC.pdf`](Tavole-quadro-PLC.pdf) | le 16 tavole in un PDF A3 orizzontale |
| [`tools/`](tools/) | generatore delle tavole (Node ≥ 20, nessuna dipendenza) |

## Rigenerare le tavole

```bash
cd research/ascensori-quadro-plc
node tools/build.mjs          # SVG in schemi/
node tools/gallery.mjs        # schemi/index.html
node tools/pdf.mjs            # PDF (richiede Playwright e Chromium; CHROMIUM_PATH opzionale)
```

## Regole di questo studio

- **Nessun testo di norma.** UNI/EN/ISO sono protette dal diritto d'autore e il repository è pubblico: compaiono solo sigla,
  edizione, numero di punto, termine tecnico, valore e puntatore alla nota nella base privata `norme-ascensori`.
- **Prezzi:** solo ciò che ha una fonte; il resto è ipotesi dichiarata (03-costi).
- **Conformità:** la decidono progettista, installatore (dichiarazione) e soggetto della verifica; questo studio non lo fa.
- Lacune dichiarate: EN ISO 8100-1/-2:2026, EN 81-28:2022, EN 81-70:2022, EN 81-73:2020, EN 61800-5-2, EN 60204-1,
  testo coordinato del DPR 162/1999 (vedi 02-normativa, sezione 12).

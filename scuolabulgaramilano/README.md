# Qui Bulgaria — Scuola bulgara di Milano

Redesign moderno e corporate del sito dell'Associazione **Qui Bulgaria**, centro
linguistico e culturale che promuove la lingua, la cultura e la danza tradizionale
bulgara a Milano (scuola "P. Yavorov").

Il sito è stato ricostruito da zero mantenendo **identità di marca, colori, foto e
logo** originali (estratti da [scuolabulgaramilano.it](https://www.scuolabulgaramilano.it/)).

## Caratteristiche

- **Sito statico**, senza build step né dipendenze: solo HTML, CSS e JavaScript vanilla.
- **Design system** con token CSS (palette del logo: verde lime + rosso + nero/crema).
- **Single page** responsiva con sezioni: Chi siamo · La scuola · Corsi · Danza · Contatti.
- **Accessibilità**: HTML semantico, focus visibili, `aria-*`, supporto `prefers-reduced-motion`, skip link.
- **SEO**: meta description, Open Graph, dati strutturati JSON-LD (`EducationalOrganization`).
- **Performance**: nessun framework, immagini `lazy`, animazioni leggere via `IntersectionObserver`.
- **PWA-ready**: `site.webmanifest` + favicon SVG.
- **Form contatti** con fallback `mailto:` (nessun backend richiesto).

## Struttura

```
scuolabulgaramilano/
├── index.html             # Pagina principale
├── site.webmanifest       # Manifest PWA
├── assets/
│   ├── css/styles.css      # Design system e stili
│   ├── js/main.js          # Interazioni (menu, reveal, contatori, form)
│   └── img/
│       ├── brand/          # Logo, favicon, decorazioni
│       └── photos/         # Foto della comunità
└── README.md
```

## Anteprima locale

Nessun build necessario. Avvia un server statico nella cartella:

```bash
cd scuolabulgaramilano
python3 -m http.server 8080
# apri http://localhost:8080
```

## Deploy

Carica il contenuto della cartella `scuolabulgaramilano/` su qualsiasi hosting
statico (GitHub Pages, Netlify, Vercel, Cloudflare Pages o un classico web server).

## Palette

| Ruolo        | Colore     |
|--------------|------------|
| Verde brand  | `#0f7a3d`  |
| Verde lime   | `#a6ce39`  |
| Rosso        | `#d72638`  |
| Inchiostro   | `#16150f`  |
| Carta        | `#fbf8f1`  |

## Contenuti

Testi e informazioni (corsi, orari della danza, contatti) sono ripresi fedelmente
dal sito originale. Verificare orari e dettagli prima della pubblicazione.

"""The Italian copy of the mounting video: the eleven step cards (title, line) and the part callouts
(catalogue numbering, p. 10). Reviewed by the Translator agent; the owner settled the open points (23.11.2026); step 10's
rebar and B swap (24.11.2026) reviewed by the Translator too: DX/SX as in the catalogue, „ferro d’armatura“ as on the site.
U+00A0 keeps "A + B", "A DX", "65 mm" on one line (overlay.wrap splits on plain spaces only)."""

STEP_TEXT = [
    ("Assemblaggio A + B", "Assembla la piastra A e la staffa B con i bulloni del giunto (13) e del bloccaggio (14), senza serrare."),
    ("Posizionamento delle staffe", "Il tecnico 1 tiene a sinistra una staffa assemblata, il tecnico 2 l’altra a destra."),
    ("Misura dalla soglia di cabina", "Misura la distanza della soglia di piano dalla soglia di cabina (25–32 mm) e posiziona le staffe di conseguenza."),
    ("Tracciatura, foratura e tasselli", "Segna i punti di foratura nelle asole (17), fora, inserisci i tasselli e metti in bolla ogni staffa B."),
    ("Serraggio dei tasselli", "Serra i dadi dei tasselli."),
    ("Posa della soglia", "Appoggia la soglia, con o senza portale, sulle piastre A."),
    ("Serraggio leggero", "Fissa la soglia ai fori di collegamento (18) senza serrare a fondo."),
    ("Soglia in bolla", "Metti in bolla la soglia in lunghezza."),
    ("Piastre A in bolla e serraggio", "Ruota le piastre A attorno al giunto (13) fino a metterle in bolla, poi serra tutto: giunto (13), bloccaggio (14) e soglia."),
    ("Terza staffa", "Monta la terza staffa al centro della soglia. Se forando trovi un ferro d’armatura, lascia A\u00a0DX e sostituisci B\u00a0DX con B\u00a0SX: i fori si spostano di 65\u00a0mm. Poi segna, fora, tassella e serra tutto."),
    ("Taglio delle piastre A", "Segna ogni piastra A con il pennarello a filo soglia, arretra la soglia, taglia sul segno con la smerigliatrice angolare e riporta la soglia a filo."),
]

# (point, badge, label, from, to, dx, dy)
CALLOUTS = [
    ("B_0", "B", "Staffa B", 5.0, 13.0, -170, 70), ("A_0", "A", "Piastra A", 6.6, 13.0, 130, -90),
    ("13_0", "13", "Giunto articolato", 7.8, 13.0, 150, -40), ("14_0", "14", "Elemento di bloccaggio", 9.4, 13.0, 150, 70),
    ("B_0", "1", "Tecnico 1", 16.2, 21.0, -170, -80), ("B_1", "2", "Tecnico 2", 16.4, 21.0, 170, -80),
    ("cab", "", "Soglia di cabina", 22.0, 30.0, -120, 120), ("piano", "", "Soglia di piano", 23.0, 30.0, -160, -100),
    ("17_0", "17", "Fori asolati", 30.2, 32.0, -150, -90), ("M0", "M", "Segno sulla muratura", 30.95, 32.2, 150, 70),
    ("M0", "Ø", "Foro Ø 10 mm", 34.2, 36.5, 150, 70),
    ("M0", "", "Tasselli Ø 10 mm", 38.8, 40.8, -180, -70), ("level", "", "Staffa B in bolla", 41.4, 46.0, 150, -90),
    ("S", "S", "Soglia", 58.2, 61.0, 90, -110),
    ("18u_0", "18", "Fori di collegamento", 62.0, 67.0, 130, 80),
    ("level", "", "Soglia in bolla", 69.0, 74.0, 130, -100),
    ("13_1", "13", "Giunto articolato", 75.0, 84.0, -160, -80), ("14_1", "14", "Elemento di bloccaggio", 79.6, 84.0, -160, 90),
    # step 10 (owner, 24.11.2026): the rebar and the B DX → B SX swap (middle.py); DX/SX in capitals as in the catalogue
    ("B_2", "", "Terza staffa: A\u00a0DX + B\u00a0DX", 86.2, 88.0, 130, 90),
    ("rebar", "", "Ferro d’armatura", 91.9, 94.5, 150, -90),
    ("Bdx_2", "", "Staffa B\u00a0DX", 94.7, 96.3, 150, 40), ("A_2", "", "Piastra A\u00a0DX invariata", 95.0, 100.6, 140, -90),
    ("Bsx_2", "", "Staffa B\u00a0SX", 97.0, 100.6, 140, 90),
    ("M2n", "", "Nuovi fori spostati di 65\u00a0mm", 101.4, 103.0, 150, 70),
    ("B_2", "", "Terza staffa: A\u00a0DX + B\u00a0SX", 108.0, 112.0, 130, 90),
    # step 11, 16 s later than before step 10 grew
    ("cut_m", "", "Segno a filo soglia", 112.7, 114.0, -150, -120), ("S0", "", "Soglia arretrata", 114.1, 115.4, 120, -120),
    ("grinder", "", "Smerigliatrice angolare", 115.0, 117.6, -70, -190),
    ("cut_m", "", "Taglio sul segno", 118.6, 120.5, -150, -120),
    ("S", "", "Soglia riportata a filo", 125.3, 127.0, 90, -110),
]

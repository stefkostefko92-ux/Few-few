"""The Italian copy of the counterweight-guide film: the nine step cards (title, line), the part callouts and the cards
that differ from the landing-door film (header, intro, closing). Owner's procedure and values (25.11.2026): plumb line
on the axis of the T, 5 mm off its head, two M10 anchors per SU, a large washer on every fastener and a grower under every
nut of the SG and of the N1 clips, the SU 20 mm back and the SG slid 20 mm along it to the rail on camera,
everything tightened at the end.
U+00A0 keeps "SU 220 160", "5 mm", "N1" on one line (overlay.wrap splits on plain spaces only)."""
NB = "\u00a0"

STEP_TEXT = [
    ("Fili a piombo", f"Cala dall’alto un filo a piombo per ogni guida: passerà a 5{NB}mm dalla testa."),
    ("Tracciatura", "Appoggia il supporto SU al muro, in bolla e in linea con il filo, e segna i fori nelle asole."),
    ("Foratura", f"Fora i punti segnati con il trapano tassellatore, punta da 10{NB}mm."),
    ("Fissaggio dei supporti SU", "Fissa ogni supporto SU con due tasselli M10 e rondella maggiorata, poi serra i dadi."),
    ("Staffa SG sul supporto", "Sopra: bullone M10 con rondella maggiorata. Sotto: rondella maggiorata, rondella "
                               "elastica spezzata (grower) e dado. Serra leggermente: la SG deve ancora scorrere."),
    ("Guida a piombo", f"Cala la guida davanti alla SG e mettila a piombo: 5{NB}mm tra la testa e il filo."),
    ("SG in avanti", f"Fai scorrere la SG di 20{NB}mm fino al piede della guida."),
    (f"Graffe{NB}N1", f"Monta due graffe{NB}N1 sulla guida, senza serrare. Dietro la flangia della SG: rondella maggiorata, "
                       "grower e dado."),
    ("Verifica e serraggio", "Controlla la verticalità con la livella, poi serra tutto: i bulloni della SG e i dadi delle "
                             "graffe."),
]

# (point, badge, label, from, to, dx, dy)
CALLOUTS = [
    ("wire_sx", "", "Filo a piombo", 6.0, 12.0, -190, 90), ("wire_dx", "", "Filo a piombo", 6.4, 12.0, 170, 90),
    ("SU_sx", "", f"Supporto SU{NB}220{NB}160 SX", 13.4, 16.0, -170, -80),
    ("level", "", "In bolla", 14.2, 15.6, 140, -90),
    ("mark_sx", "", "Segni nelle asole", 16.2, 19.5, 150, 80),
    ("SU_dx", "", f"SU{NB}220{NB}160 DX", 20.0, 23.0, 150, -90),
    ("hole_sx", "", f"Fori Ø{NB}10{NB}mm", 26.8, 30.0, 150, 80),
    ("anchor_sx", "", "Tasselli M10", 32.0, 34.0, -150, 90),
    ("SG_sx", "", f"Staffa SG{NB}80{NB}150", 45.4, 48.0, 150, -90),
    ("bigtop_sx", "", "Rondella maggiorata", 46.8, 49.4, -170, -80),
    ("bigbot_sx", "", "Rondella maggiorata", 50.4, 53.0, -170, 60),
    ("grower_sx", "", "Rondella grower", 51.0, 54.0, -200, 90),
    ("nut_sx", "", "Serraggio leggero", 52.6, 56.0, 190, -110),
    ("rail_sx", "", "Guida SX", 62.0, 66.0, -150, -100), ("rail_dx", "", "Guida DX", 62.3, 66.0, 150, -100),
    ("slide_sx", "", f"La SG scorre di 20{NB}mm verso la guida", 69.8, 74.0, 170, -150),
    ("clip_sx", "", f"Graffa{NB}N1", 75.4, 78.2, 150, -90),
    ("cwasher_sx", "", "Rondella maggiorata", 79.0, 81.6, -170, -90), ("cgrower_sx", "", "Rondella grower", 79.6, 83.0, -170, 60),
    ("level", "", "In bolla", 84.0, 85.5, 150, -90),
    ("nut_sx", "", "Serraggio", 89.0, 93.0, 150, 70), ("cnut_sx", "", "Dadi delle graffe", 93.2, 98.0, -170, -80),
]

CARDS = {
    "header": "GUIDA AL MONTAGGIO  ·  SU 220 160 + SG 80 150",
    "intro": ("GUIDA AL MONTAGGIO", "Guide del", "contrappeso", f"Supporto SU{NB}220{NB}160 + staffa SG{NB}80{NB}150",
              f"Versioni SX e DX · corsa di estensione 45–155{NB}mm"),
    "outro": ("MONTAGGIO COMPLETATO", "Guide a piombo, staffe serrate",
              "Sintesi per installatori qualificati: fanno fede i disegni di montaggio del catalogo tecnico e il progetto "
              "dell’impianto.", "panevascensori.it  ·  Catalogo tecnico 2027, pag. 20–21"),
}

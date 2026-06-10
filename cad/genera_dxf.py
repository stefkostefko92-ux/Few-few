#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generatore di schemi elettrici in formato DXF R12 (AutoCAD ASCII).
Nessuna dipendenza esterna: produce file apribili in AutoCAD, LibreCAD,
DraftSight, QCAD, BricsCAD, ecc.

Schemi prodotti (ascensore geared / idraulico — gearless ESCLUSO):
  - potenza-geared.dxf
  - potenza-idraulico.dxf
  - catena-sicurezza.dxf
  - io-plc.dxf

Uso:  python3 genera_dxf.py
"""

# Colori ACI: 1 rosso, 2 giallo, 3 verde, 4 ciano, 5 blu, 6 magenta, 7 nero/bianco
LAYERS = [
    ("POTENZA",   1),
    ("SICUREZZA", 2),
    ("COMP",      4),
    ("TESTO",     7),
    ("CARTIGLIO", 3),
    ("CORNICE",   7),
]


class Dxf:
    def __init__(self):
        self.e = []  # entita'

    # --- primitive ---
    def line(self, x1, y1, x2, y2, layer="POTENZA"):
        self.e += ["0", "LINE", "8", layer,
                   "10", f"{x1}", "20", f"{y1}", "30", "0",
                   "11", f"{x2}", "21", f"{y2}", "31", "0"]

    def rect(self, x, y, w, h, layer="COMP"):
        self.line(x, y, x + w, y, layer)
        self.line(x + w, y, x + w, y + h, layer)
        self.line(x + w, y + h, x, y + h, layer)
        self.line(x, y + h, x, y, layer)

    def circle(self, cx, cy, r, layer="COMP"):
        self.e += ["0", "CIRCLE", "8", layer,
                   "10", f"{cx}", "20", f"{cy}", "30", "0", "40", f"{r}"]

    def text(self, x, y, s, h=3.0, layer="TESTO"):
        self.e += ["0", "TEXT", "8", layer,
                   "10", f"{x}", "20", f"{y}", "30", "0",
                   "40", f"{h}", "1", s]

    # --- componenti compositi ---
    def contattore(self, x, y, ref, descr, layer="POTENZA"):
        self.rect(x, y, 28, 12, layer)
        self.line(x + 4, y + 2, x + 24, y + 9, layer)  # contatto aperto
        self.text(x + 32, y + 8, ref, 3.0, "TESTO")
        self.text(x + 32, y + 2, descr, 2.2, "TESTO")

    def cartiglio(self, x, y, titolo, foglio):
        self.rect(x, y, 110, 28, "CARTIGLIO")
        self.line(x, y + 18, x + 110, y + 18, "CARTIGLIO")
        self.line(x + 80, y, x + 80, y + 28, "CARTIGLIO")
        self.text(x + 3, y + 21, titolo, 3.0, "CARTIGLIO")
        self.text(x + 3, y + 11, "EN 81-20/50 - UNI 10411", 2.2, "TESTO")
        self.text(x + 3, y + 4, "Concept didattico - Rev. A", 2.2, "TESTO")
        self.text(x + 83, y + 21, foglio, 2.5, "TESTO")
        self.text(x + 83, y + 11, "Scala: -", 2.2, "TESTO")
        self.text(x + 83, y + 4, "geared/idraulico", 2.2, "TESTO")

    # --- serializzazione DXF R12 ---
    def render(self):
        out = []
        # TABLES: definizione layer
        out += ["0", "SECTION", "2", "TABLES",
                "0", "TABLE", "2", "LAYER", "70", f"{len(LAYERS)}"]
        for name, color in LAYERS:
            out += ["0", "LAYER", "2", name, "70", "0",
                    "62", f"{color}", "6", "CONTINUOUS"]
        out += ["0", "ENDTAB", "0", "ENDSEC"]
        # ENTITIES
        out += ["0", "SECTION", "2", "ENTITIES"]
        out += self.e
        out += ["0", "ENDSEC", "0", "EOF"]
        return "\n".join(out) + "\n"

    def save(self, path):
        with open(path, "w", encoding="ascii", errors="replace") as f:
            f.write(self.render())


# ===========================================================================
#  FOGLIO 1 - POTENZA GEARED (argano 2 velocita')
# ===========================================================================
def potenza_geared():
    d = Dxf()
    d.rect(0, 0, 297, 210, "CORNICE")  # A4 landscape (mm)
    d.text(8, 200, "SCHEMA DI POTENZA - ASCENSORE GEARED (argano 2 velocita')", 4.0)

    # bus trifase
    for i, lbl in enumerate(["L1", "L2", "L3"]):
        x = 20 + i * 8
        d.line(x, 60, x, 185, "POTENZA")
        d.text(x - 2, 188, lbl, 2.5)
    d.line(48, 60, 48, 185, "POTENZA")  # PE
    d.text(46, 188, "PE", 2.5)

    # sezionatore
    d.rect(14, 168, 30, 12, "POTENZA")
    d.line(18, 170, 40, 178, "POTENZA")
    d.text(48, 176, "-QS1 Sezionatore 4P 25A bloccoporta", 2.5)
    # magnetotermico
    d.rect(14, 150, 30, 12, "POTENZA")
    d.text(24, 154, "I>", 3.0)
    d.text(48, 156, "-Q1 Magnetotermico motore D16A", 2.5)
    # rele sequenza
    d.rect(14, 134, 30, 10, "POTENZA")
    d.text(48, 138, "-KA-SEQ Rele sequenza/mancanza fase", 2.5)

    # contattori direzione e velocita'
    d.contattore(14, 116, "-KM-S", "Salita (inverte 2 fasi)")
    d.contattore(14, 100, "-KM-D", "Discesa (interbloccato)")
    d.contattore(14, 84,  "-KM-V", "Alta velocita' (2p)")
    d.contattore(14, 68,  "-KM-L", "Bassa velocita' (4p)")

    # termica + motore
    d.rect(14, 52, 30, 10, "POTENZA")
    d.text(20, 55, "theta> PTC", 2.5)
    d.circle(28, 30, 12, "POTENZA")
    d.text(24, 29, "M 3~", 3.0)
    d.text(44, 30, "-M1 Motore argano 2 vel. (Dahlander)", 2.5)

    # ramo freno
    d.rect(110, 150, 34, 12, "COMP")
    d.text(114, 154, "~/= raddr.", 2.5)
    d.text(148, 156, "-A-FRE Raddrizzatore + sovreccitazione", 2.2)
    d.rect(110, 134, 34, 12, "COMP")
    d.text(118, 138, "YB", 3.0)
    d.text(148, 140, "-YB1 Freno doppio circuito", 2.2)
    d.rect(110, 120, 34, 10, "COMP")
    d.text(114, 123, "S1-S2", 2.5)
    d.text(148, 124, "-S-FRE Microcontatti freno (UCM/A3)", 2.2)

    # box A3
    d.rect(170, 150, 118, 40, "SICUREZZA")
    d.text(174, 184, "FUNZIONE A3 - UCM (movimento incontrollato)", 3.0, "SICUREZZA")
    d.text(174, 176, "Doppio freno validato come elemento di arresto", 2.2)
    d.text(174, 170, "OPPURE rope brake esterno - certificato esame UE", 2.2)
    d.text(174, 164, "Attivo a porte aperte fuori zona livellamento", 2.2)

    # box VVVF
    d.rect(170, 100, 118, 42, "COMP")
    d.text(174, 136, "VARIANTE VVVF (geared con inverter)", 3.0)
    d.text(174, 128, "Inverter a monte del motore asincrono", 2.2)
    d.text(174, 122, "Si eliminano -KM-V / -KM-L (velocita' da drive)", 2.2)
    d.text(174, 116, "Resistenza frenatura su bus DC", 2.2)
    d.text(174, 110, "Rampe/jerk parametrici (config/parametri.json)", 2.2)

    d.cartiglio(178, 8, "POTENZA GEARED 2V", "Foglio 1/4")
    return d


# ===========================================================================
#  FOGLIO 2 - POTENZA IDRAULICO
# ===========================================================================
def potenza_idraulico():
    d = Dxf()
    d.rect(0, 0, 297, 210, "CORNICE")
    d.text(8, 200, "SCHEMA DI POTENZA - ASCENSORE IDRAULICO (centralina + pistone)", 4.0)

    for i, lbl in enumerate(["L1", "L2", "L3"]):
        x = 20 + i * 8
        d.line(x, 60, x, 185, "POTENZA")
        d.text(x - 2, 188, lbl, 2.5)

    d.rect(14, 168, 30, 12, "POTENZA")
    d.line(18, 170, 40, 178, "POTENZA")
    d.text(48, 176, "-QS1 Sezionatore 4P 32A bloccoporta", 2.5)
    d.rect(14, 150, 30, 12, "POTENZA")
    d.text(24, 154, "I>", 3.0)
    d.text(48, 156, "-Q1 Magnetotermico pompa D25A", 2.5)
    d.rect(14, 134, 30, 10, "POTENZA")
    d.text(48, 138, "-KA-SEQ Rele sequenza/mancanza fase", 2.5)

    # avviamento Y/D
    d.contattore(14, 116, "-KM-P", "Linea pompa")
    d.rect(14, 98, 14, 12, "POTENZA"); d.text(18, 101, "Y", 3.0)
    d.text(14, 92, "-KM-Y Stella", 2.2)
    d.rect(32, 98, 14, 12, "POTENZA"); d.text(36, 101, "D", 3.0)
    d.text(32, 92, "-KM-D Triangolo", 2.2)

    d.rect(14, 76, 30, 10, "POTENZA")
    d.text(18, 79, "theta> + olio", 2.5)
    d.text(48, 80, "-F-MOT PTC + termostato olio", 2.2)
    d.circle(28, 52, 12, "POTENZA")
    d.text(24, 51, "M 3~", 3.0)
    d.text(44, 52, "-M1 Motore pompa", 2.5)

    # gruppo idraulico
    d.rect(95, 120, 90, 70, "COMP")
    d.text(99, 184, "CENTRALINA OLEODINAMICA", 3.0)
    d.circle(112, 160, 7, "COMP"); d.text(109, 158, "P", 2.5)
    d.text(99, 170, "Pompa", 2.2)
    d.rect(130, 145, 48, 30, "COMP")
    d.text(133, 169, "BLOCCO VALVOLE", 2.5)
    d.rect(133, 158, 42, 8, "COMP"); d.text(136, 160, "-EV-S salita", 2.2)
    d.rect(133, 147, 42, 8, "COMP"); d.text(136, 149, "-EV-D discesa", 2.2)
    d.rect(95, 124, 90, 14, "COMP")
    d.text(99, 128, "Serbatoio olio + filtro + termostato", 2.2)

    # rupture valve
    d.rect(95, 104, 90, 12, "SICUREZZA")
    d.text(99, 109, "Valvola di blocco rottura tubo (rupture valve)", 2.5, "SICUREZZA")
    d.text(99, 105, "Dispositivo di sicurezza meccanico - certificato", 2.0)

    # box A3 idraulico
    d.rect(195, 150, 93, 40, "SICUREZZA")
    d.text(199, 184, "A3 - UCM idraulico", 3.0, "SICUREZZA")
    d.text(199, 176, "Valvola di blocco / pawl device", 2.2)
    d.text(199, 170, "Anti-deriva elettrico (re-livellamento)", 2.2)
    d.text(199, 164, "Arresto a porte aperte fuori zona porta", 2.2)
    d.text(199, 158, "Componenti certificati esame UE del tipo", 2.0)

    d.rect(195, 104, 93, 40, "COMP")
    d.text(199, 138, "DISCESA DI EMERGENZA", 3.0)
    d.text(199, 130, "Valvola manuale a uomo presente", 2.2)
    d.text(199, 124, "Riporto al piano in mancanza rete", 2.2)
    d.text(199, 118, "Pompa a mano per recuperi di livello", 2.2)
    d.text(199, 112, "Funzioni non-safety gestite dal PLC", 2.0)

    d.cartiglio(178, 8, "POTENZA IDRAULICO", "Foglio 2/4")
    return d


# ===========================================================================
#  FOGLIO 3 - CATENA DI SICUREZZA
# ===========================================================================
def catena_sicurezza():
    d = Dxf()
    d.rect(0, 0, 297, 210, "CORNICE")
    d.text(8, 200, "CATENA DI SICUREZZA (serie) - EN 81-20 5.11 - apertura positiva", 4.0)

    contatti = [
        "-S1  Arresto emergenza FOSSA",
        "-S2  Arresto emergenza TETTO CABINA",
        "-S3  Commutatore ISPEZIONE/REVISIONE",
        "-S4  Extracorsa SUPERIORE",
        "-S5  Extracorsa INFERIORE",
        "-S6  Tensione fune LIMITATORE",
        "-S7  Intervento LIMITATORE (overspeed)",
        "-S8  PARACADUTE (geared) / valvola blocco (idr.)",
        "-S9  Ammortizzatori / fine corsa fossa",
        "-S11 PORTE DI PIANO (serrature in serie)",
        "-S12 Contatto PORTA DI CABINA",
    ]
    d.line(14, 30, 14, 185, "SICUREZZA")  # montante +
    d.text(10, 188, "+110V~ (o 24Vdc) sicurezza", 2.5)
    y = 180
    for c in contatti:
        d.rect(20, y - 4, 12, 8, "SICUREZZA")
        d.line(22, y - 2, 30, y + 2, "SICUREZZA")  # contatto
        d.line(14, y, 20, y, "SICUREZZA")
        d.line(32, y, 200, y, "SICUREZZA")
        d.text(40, y + 1, c, 2.5)
        y -= 13

    # collettore -> rele
    d.line(200, 30, 200, 180, "SICUREZZA")
    d.line(200, 30, 215, 30, "SICUREZZA")
    d.rect(215, 18, 60, 26, "COMP")
    d.text(218, 38, "RELE' DI SICUREZZA -KA-SIC", 2.5)
    d.text(218, 32, "contatti guidati, auto-monitor.", 2.0)
    d.text(218, 26, "certificato esame UE del tipo", 2.0)
    d.text(218, 21, "Pizzato / Pilz / Schmersal", 2.0)
    d.line(275, 38, 290, 38, "POTENZA")
    d.text(276, 40, "-> bobine -KM marcia+freno", 2.0)
    d.line(275, 24, 290, 24, "COMP")
    d.text(276, 26, "-> feedback PLC (lettura)", 2.0)

    d.line(14, 30, 200, 30, "SICUREZZA")
    d.text(10, 24, "- ritorno sicurezza", 2.5)
    d.cartiglio(178, 2, "CATENA SICUREZZA", "Foglio 3/4")
    return d


# ===========================================================================
#  FOGLIO 4 - I/O PLC
# ===========================================================================
def io_plc():
    d = Dxf()
    d.rect(0, 0, 297, 210, "CORNICE")
    d.text(8, 200, "SCHEMA I/O PLC - LOGICA DI MANOVRA (geared / idraulico)", 4.0)

    d.rect(120, 40, 60, 150, "COMP")
    d.text(128, 182, "PLC CPU 1214C", 3.0)
    d.text(124, 175, "DI14 / DQ10 + espansione", 2.2)

    ingressi = [
        "-KA-SIC stato catena sicurezza", "-S-REV revisione",
        "-SB-REVU/D revisione su/giu", "-B-ZP1/ZP2 zona porta (ridond.)",
        "-B-RALL-U/D rallentamento", "-B-PIANI conteggio/encoder",
        "-S-SOVR sovraccarico", "-S-FOTO fotocellula/costa",
        "-S-FAP/-S-FCP finecorsa porte", "-F-MOT termica/termostato",
        "-S-MINP pressione min (idr.)", "-S-FRE controllo freno (geared)",
        "-SB-CAB/-SB-PIA chiamate",
    ]
    y = 178
    for s in ingressi:
        d.text(8, y, s, 2.2)
        y -= 11

    uscite = [
        "-KM-S/-KM-D salita/discesa", "-KM-V/-KM-L velocita' (geared)",
        "-KM-FRE freno (geared)", "-KM-P pompa (idr.)",
        "-KM-Y/-KM-D stella/triangolo", "-EV-S/-EV-D valvole (idr.)",
        "-KM-APRE/-KM-CHIU porte", "-H-DIR frecce direzione",
        "-H-POS display posizione", "-H-GONG gong arrivo",
        "-H-OOS fuori servizio/allarme",
    ]
    y = 178
    for s in uscite:
        d.text(190, y, s, 2.2)
        y -= 11

    # comunicazione
    d.rect(120, 18, 60, 18, "COMP")
    d.text(124, 30, "COMUNICAZIONE", 2.5)
    d.text(124, 25, "RS485 Modbus -> ESP32 WiFi", 2.0)
    d.text(124, 21, "CANbus -> COP/LOP", 2.0)
    d.rect(190, 18, 80, 18, "COMP")
    d.text(194, 30, "-A5 Modulo WiFi ESP32", 2.5)
    d.text(194, 25, "AP locale - parametri non-safety", 2.0)
    d.text(194, 21, "gate chiave -S-EN per cat. SR", 2.0)

    d.cartiglio(8, 4, "I/O PLC MANOVRA", "Foglio 4/4")
    return d


# ===========================================================================
#  FOGLIO 5 - MORSETTIERA E CAVI NUMERATI
# ===========================================================================
def _strip(d, x, y, nome, terminali, cavo_sopra, cavo_sotto):
    """Disegna una morsettiera orizzontale con morsetti numerati.
    terminali = lista di (numero, sigla_filo)."""
    w = 9
    d.text(x, y + 20, nome, 3.0, "TESTO")
    d.text(x, y + 15, f"campo: {cavo_sopra}", 2.0, "TESTO")
    d.text(x, y - 14, f"interno quadro: {cavo_sotto}", 2.0, "TESTO")
    for k, (num, filo) in enumerate(terminali):
        bx = x + 22 + k * w
        d.rect(bx, y, w - 1, 10, "COMP")
        d.text(bx + 1.5, y + 11.5, str(num), 2.0, "TESTO")   # numero morsetto
        d.text(bx + 0.6, y + 4, filo, 1.7, "POTENZA")        # filo
        d.line(bx + (w - 1) / 2, y + 10, bx + (w - 1) / 2, y + 13, "POTENZA")  # su
        d.line(bx + (w - 1) / 2, y, bx + (w - 1) / 2, y - 3, "COMP")           # giu


def morsettiera():
    d = Dxf()
    d.rect(0, 0, 297, 210, "CORNICE")
    d.text(8, 200, "MORSETTIERA E CAVI NUMERATI - quadro di manovra (geared/idraulico)", 4.0)

    _strip(d, 12, 168,
           "-X1  Sicurezza / segnali ingresso",
           [(11, "11"), (12, "12"), (13, "13"), (14, "14"), (15, "15"),
            (16, "16"), (17, "17"), (18, "18"), (19, "19"), (20, "20"),
            (21, "21"), (22, "22"), (23, "23"), (24, "24"), (25, "25"), (26, "26")],
           "W4 catena (cabina/vano) + W7 segnali vano",
           "PLC DI %I0.0..%I1.7")

    _strip(d, 12, 130,
           "-X2  Chiamate cabina/piani",
           [(1, "C0"), (2, "C1"), (3, "C2"), (4, "C3"), (5, "C4"), (6, "C5"),
            (7, "PU0"), (8, "PU1"), (9, "PU2"), (10, "PD3"), (11, "PD4"), (12, "PD5")],
           "W5 bus cabina (COP) + W6 bus piani (LOP)",
           "PLC DI %IW2..%IW6")

    _strip(d, 12, 92,
           "-X3  Uscite comando/potenza",
           [(1, "S"), (2, "D"), (3, "V"), (4, "L"), (5, "FRE"),
            (6, "P"), (7, "Y"), (8, "TR"), (9, "EVS"), (10, "EVD"),
            (11, "AP"), (12, "CH"), (13, "GO"), (14, "OOS")],
           "W2 motore/pompa + W3 freno + valvole",
           "PLC DQ %Q0.0..%Q1.5 -> bobine -KM / -EV")

    _strip(d, 12, 54,
           "-X4  Segnalazioni",
           [(1, "P0"), (2, "P1"), (3, "P2"), (4, "P4"), (5, "P8"),
            (6, "-"), (7, "-"), (8, "-"), (9, "DU"), (10, "DD"), (11, "0V"), (12, "+24")],
           "W7 segnalazioni cabina/piani",
           "PLC DQ %QW2..%QW4 + alim. 24V")

    # legenda cavi
    d.rect(12, 8, 273, 34, "COMP")
    d.text(15, 37, "LEGENDA CAVI (vedi config/lista-cavi.csv e docs/04-morsettiera-cavi.md)", 2.5)
    cavi = [
        "W1 rete 4G6 + PE        W2 motore/pompa 4G2.5    W3 freno 3G1.5",
        "W4 catena sicurezza nG1  W5 COP cabina (CAN+24V)  W6 LOP piani (CAN+24V)",
        "W7 segnali vano nG0.75   W8 RS485 2x0.5 schermato W9 ausiliari 24V 2x1.0",
    ]
    yy = 30
    for r in cavi:
        d.text(15, yy, r, 2.2, "TESTO")
        yy -= 6

    d.cartiglio(178, 8, "MORSETTIERA / CAVI", "Foglio 5/5")
    return d


if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    out = {
        "potenza-geared.dxf":    potenza_geared(),
        "potenza-idraulico.dxf": potenza_idraulico(),
        "catena-sicurezza.dxf":  catena_sicurezza(),
        "io-plc.dxf":            io_plc(),
        "morsettiera.dxf":       morsettiera(),
    }
    for name, dxf in out.items():
        path = os.path.join(here, name)
        dxf.save(path)
        print(f"scritto {name} ({len(dxf.render())} byte)")

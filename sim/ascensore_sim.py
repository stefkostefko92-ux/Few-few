#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simulatore della logica di manovra ascensore (geared / idraulico).

Porting fedele in Python della logica Structured Text in ../plc/src/
(FB_CatenaSicurezza, FB_GestionePorte, FB_GestioneChiamate, PRG_Geared,
PRG_Idraulico) con un modello d'impianto (PlantModel) che chiude l'anello
di controllo per permettere test end-to-end.

NB: e' un modello di VERIFICA LOGICA, non un simulatore fisico di precisione.
La sicurezza reale resta cablata (vedi ../schemi/).
"""

from dataclasses import dataclass, field
from enum import IntEnum

DT = 0.1  # periodo di scansione [s]


def cycles(seconds: float) -> int:
    return max(1, round(seconds / DT))


class Stato(IntEnum):
    RIPOSO = 0
    CHIUDI_PORTE = 2
    PARTENZA = 3
    MARCIA = 4
    RALLENTA = 5
    LIVELLA = 6
    ARRESTO = 7
    APRI_PORTE = 8
    ATTESA = 9
    REVISIONE = 20
    GUASTO = 90
    EMERGENZA = 91


class Direzione(IntEnum):
    FERMO = 0
    SALITA = 1
    DISCESA = 2


class TON:
    """Timer on-delay a conteggio cicli (equivalente IEC TON)."""
    def __init__(self):
        self._c = 0
        self.Q = False

    def __call__(self, IN: bool, PT_cycles: int):
        if IN:
            if self._c < PT_cycles:
                self._c += 1
            self.Q = self._c >= PT_cycles
        else:
            self._c = 0
            self.Q = False
        return self.Q


@dataclass
class Parametri:
    tempo_porte_aperte: float = 5.0
    nudging: bool = True
    velocita_ispezione: float = 0.30
    relivell_abilitato: bool = True
    star_delta_time: float = 1.5
    gong: bool = True
    tempo_filtro_allarme: float = 3.0      # EN 81-28
    tempo_porte_accessibile: float = 10.0  # EN 81-70


@dataclass
class Inputs:
    catena_ok: bool = True
    revisione: bool = False
    rev_salita: bool = False
    rev_discesa: bool = False
    zona_porta1: bool = True
    zona_porta2: bool = True
    rallent_salita: bool = False
    rallent_discesa: bool = False
    sovraccarico: bool = False
    fotocellula: bool = True          # 1 = libero
    porta_aperta: bool = False
    porta_chiusa: bool = True
    termica_ok: bool = True
    pressione_min_ok: bool = True
    controllo_freno_ok: bool = True
    chiamate_cabina: int = 0          # bitmask
    chiamate_piano_su: int = 0
    chiamate_piano_giu: int = 0
    # EN 81-28 allarme / EN 81-70 accessibilita
    pulsante_allarme: bool = False
    comm_ok: bool = True
    batteria_allarme_ok: bool = True
    riscontro_oper: bool = False
    reset_allarme: bool = False
    chiamata_accessibile: bool = False


@dataclass
class Outputs:
    km_salita: bool = False
    km_discesa: bool = False
    km_veloce: bool = False
    km_lento: bool = False
    km_freno: bool = False
    km_pompa: bool = False
    km_stella: bool = False
    km_triangolo: bool = False
    ev_salita: bool = False
    ev_discesa: bool = False
    km_apri: bool = False
    km_chiudi: bool = False
    gong: bool = False
    fuori_servizio: bool = False
    # EN 81-28
    allarme_registrato: bool = False
    comunicazione_attiva: bool = False
    avvia_combinatore: bool = False
    guasto_allarme: bool = False


# ---------------------------------------------------------------------------
#  FB_CatenaSicurezza  (monitoraggio, NON sostituzione)
# ---------------------------------------------------------------------------
class FBSicurezza:
    def __init__(self):
        self.ton_disc = TON()
        self.ton_freno = TON()
        self.consenso_marcia = False
        self.emergenza = False
        self.guasto = False
        self.in_zona_porta = False
        self.discordanza = False

    def step(self, i: Inputs, consenso_freno: bool):
        self.emergenza = not i.catena_ok
        self.guasto = (not i.termica_ok) or (not i.pressione_min_ok)
        self.in_zona_porta = i.zona_porta1 and i.zona_porta2
        self.discordanza = self.ton_disc(i.zona_porta1 != i.zona_porta2, cycles(0.5))
        if self.discordanza:
            self.guasto = True
        if self.ton_freno(consenso_freno and not i.controllo_freno_ok, cycles(1.0)):
            self.guasto = True
        self.consenso_marcia = (i.catena_ok and i.termica_ok and i.pressione_min_ok
                                and not self.guasto and not self.emergenza)


# ---------------------------------------------------------------------------
#  FB_GestionePorte
# ---------------------------------------------------------------------------
class FBPorte:
    def __init__(self):
        self.ton_attesa = TON()
        self.apertura_in_corso = False
        self.apri = False
        self.chiudi = False
        self.porte_chiuse = False
        self.porte_aperte = False
        self.blocco_sovracc = False
        self.pronto_chiusura = False   # dwell porte trascorso

    def step(self, comando_apri, richiesta_chiudi, i: Inputs, in_zona_porta,
             t_attesa, nudging):
        self.porte_chiuse = i.porta_chiusa
        self.porte_aperte = i.porta_aperta
        self.blocco_sovracc = i.sovraccarico

        if comando_apri and in_zona_porta:
            self.apertura_in_corso = True
        if i.porta_aperta:
            self.apertura_in_corso = False

        attesa_q = self.ton_attesa(i.porta_aperta, cycles(t_attesa))
        self.pronto_chiusura = attesa_q
        self.apri = False
        self.chiudi = False

        if not in_zona_porta:
            pass
        elif self.apertura_in_corso or comando_apri:
            self.apri = not i.porta_aperta
        elif richiesta_chiudi and attesa_q and not i.sovraccarico:
            if i.fotocellula or nudging:
                self.chiudi = not i.porta_chiusa
                if not i.fotocellula:
                    self.chiudi = nudging
            else:
                self.apri = not i.porta_aperta


# ---------------------------------------------------------------------------
#  FB_GestioneChiamate
# ---------------------------------------------------------------------------
class FBChiamate:
    def __init__(self, n=6):
        self.n = n
        self.registro = [False] * n
        self.target = -1
        self.valida = False
        self.direzione = Direzione.FERMO
        self.chiamate_attive = False

    def step(self, cab, su, giu, piano_corr, direzione, reset_target):
        self.chiamate_attive = False
        for k in range(self.n):
            bit = 1 << k
            self.registro[k] = self.registro[k] or bool(cab & bit) \
                or bool(su & bit) or bool(giu & bit)
            if self.registro[k]:
                self.chiamate_attive = True

        if reset_target and 0 <= piano_corr < self.n:
            self.registro[piano_corr] = False
            # ricalcola attive dopo il reset
            self.chiamate_attive = any(self.registro)

        t = -1
        if direzione == Direzione.SALITA:
            for k in range(piano_corr + 1, self.n):
                if self.registro[k]:
                    t = k; break
            if t == -1:
                for k in range(piano_corr - 1, -1, -1):
                    if self.registro[k]:
                        t = k; break
        elif direzione == Direzione.DISCESA:
            for k in range(piano_corr - 1, -1, -1):
                if self.registro[k]:
                    t = k; break
            if t == -1:
                for k in range(piano_corr + 1, self.n):
                    if self.registro[k]:
                        t = k; break
        else:
            for k in range(self.n):
                if self.registro[k]:
                    t = k; break

        self.target = t
        self.valida = (t >= 0)
        if t > piano_corr:
            self.direzione = Direzione.SALITA
        elif 0 <= t < piano_corr:
            self.direzione = Direzione.DISCESA
        else:
            self.direzione = Direzione.FERMO


# ---------------------------------------------------------------------------
#  FB_AllarmeEmergenza (EN 81-28:2022)
# ---------------------------------------------------------------------------
class AlarmSystem:
    def __init__(self):
        self.ton_filtro = TON()
        self.registrato = False
        self.comunicazione = False
        self.avvia = False
        self.guasto = False

    def step(self, i: Inputs, filtro_s: float):
        if self.ton_filtro(i.pulsante_allarme, cycles(filtro_s)):
            self.registrato = True          # latch fino al reset tecnico
        if i.reset_allarme:
            self.registrato = False
            self.comunicazione = False
        self.avvia = self.registrato and not self.comunicazione
        if self.registrato and i.riscontro_oper:
            self.comunicazione = True
        self.guasto = (not i.batteria_allarme_ok) or (not i.comm_ok)


# ---------------------------------------------------------------------------
#  Macchina a stati (PRG_Geared / PRG_Idraulico)
# ---------------------------------------------------------------------------
class Ascensore:
    def __init__(self, tipo="geared", n_piani=6, par: Parametri = None):
        assert tipo in ("geared", "idraulico")
        self.tipo = tipo
        self.n = n_piani
        self.par = par or Parametri()
        self.fb_sic = FBSicurezza()
        self.fb_porte = FBPorte()
        self.fb_call = FBChiamate(n_piani)
        self.fb_allarme = AlarmSystem()
        self.stato = Stato.RIPOSO
        self.direzione = Direzione.FERMO
        self.piano_corrente = 0
        self.target = -1
        self.ton_arresto = TON()
        self.ton_gong = TON()
        self.ton_stella = TON()
        self.ton_relivel = TON()
        self.out = Outputs()

    def step(self, i: Inputs):
        o = Outputs()  # uscite ricostruite ogni ciclo (default a 0)

        self.fb_sic.step(i, consenso_freno=self.out.km_freno)
        self.fb_call.step(i.chiamate_cabina, i.chiamate_piano_su,
                          i.chiamate_piano_giu, self.piano_corrente,
                          self.direzione, reset_target=(self.stato == Stato.APRI_PORTE))

        # EN 81-28 allarme di emergenza
        self.fb_allarme.step(i, self.par.tempo_filtro_allarme)
        o.allarme_registrato = self.fb_allarme.registrato
        o.comunicazione_attiva = self.fb_allarme.comunicazione
        o.avvia_combinatore = self.fb_allarme.avvia
        o.guasto_allarme = self.fb_allarme.guasto

        comando_apri = self.stato in (Stato.APRI_PORTE, Stato.ATTESA)
        # EN 81-70: sosta porte estesa per chiamata accessibile
        t_sosta = (self.par.tempo_porte_accessibile if i.chiamata_accessibile
                   else self.par.tempo_porte_aperte)
        self.fb_porte.step(comando_apri, self.stato == Stato.CHIUDI_PORTE, i,
                          self.fb_sic.in_zona_porta, t_sosta,
                          self.par.nudging)
        o.km_apri = self.fb_porte.apri
        o.km_chiudi = self.fb_porte.chiudi

        if self.stato == Stato.LIVELLA and self.fb_sic.in_zona_porta:
            self.piano_corrente = self.target

        # modi prioritari
        if self.fb_sic.emergenza:
            self.stato = Stato.EMERGENZA
        elif self.fb_sic.guasto:
            self.stato = Stato.GUASTO
        elif i.revisione:
            self.stato = Stato.REVISIONE

        if self.tipo == "geared":
            self._fsm_geared(i, o)
        else:
            self._fsm_idraulico(i, o)

        self.out = o
        return o

    # ----------------------- GEARED -----------------------
    def _fsm_geared(self, i: Inputs, o: Outputs):
        s = self.stato
        if s == Stato.RIPOSO:
            self.direzione = Direzione.FERMO
            if self.fb_call.valida and self.fb_sic.consenso_marcia:
                self.target = self.fb_call.target
                if self.target == self.piano_corrente:
                    self.stato = Stato.APRI_PORTE
                elif not i.sovraccarico:        # sovraccarico: non parte
                    self.stato = Stato.CHIUDI_PORTE

        elif s == Stato.CHIUDI_PORTE:
            o.km_chiudi = True
            if self.fb_porte.porte_chiuse:
                if self.fb_call.valida and not i.sovraccarico:
                    self.target = self.fb_call.target
                    self.direzione = self.fb_call.direzione
                    self.stato = Stato.PARTENZA
                else:
                    self.stato = Stato.RIPOSO

        elif s == Stato.PARTENZA:
            if self.fb_sic.consenso_marcia and self.fb_porte.porte_chiuse:
                o.km_salita = self.direzione == Direzione.SALITA
                o.km_discesa = self.direzione == Direzione.DISCESA
                o.km_lento = True
                o.km_freno = True
                self.stato = Stato.MARCIA
            else:
                self.stato = Stato.ARRESTO

        elif s == Stato.MARCIA:
            o.km_salita = self.direzione == Direzione.SALITA
            o.km_discesa = self.direzione == Direzione.DISCESA
            o.km_freno = True
            veloce = (abs(self.target - self.piano_corrente) >= 1
                      and not i.rallent_salita and not i.rallent_discesa)
            o.km_veloce = veloce
            o.km_lento = not veloce
            if ((self.direzione == Direzione.SALITA and i.rallent_salita)
                    or (self.direzione == Direzione.DISCESA and i.rallent_discesa)):
                self.stato = Stato.RALLENTA
            if not self.fb_sic.consenso_marcia:
                self.stato = Stato.ARRESTO

        elif s == Stato.RALLENTA:
            o.km_salita = self.direzione == Direzione.SALITA
            o.km_discesa = self.direzione == Direzione.DISCESA
            o.km_freno = True
            o.km_lento = True
            if self.fb_sic.in_zona_porta:
                self.stato = Stato.LIVELLA
            if not self.fb_sic.consenso_marcia:
                self.stato = Stato.ARRESTO

        elif s == Stato.LIVELLA:
            o.km_salita = self.direzione == Direzione.SALITA
            o.km_discesa = self.direzione == Direzione.DISCESA
            o.km_freno = True
            o.km_lento = True
            if self.fb_sic.in_zona_porta:
                self.stato = Stato.ARRESTO

        elif s == Stato.ARRESTO:
            o.km_freno = False
            if self.ton_arresto(True, cycles(0.4)):
                self.ton_arresto(False, cycles(0.4))
                self.stato = Stato.APRI_PORTE

        elif s == Stato.APRI_PORTE:
            o.km_apri = self.fb_porte.apri
            o.gong = self.par.gong and self.ton_gong(True, cycles(0.3))
            if self.fb_porte.porte_aperte:
                self.ton_gong(False, cycles(0.3))
                self.stato = Stato.ATTESA

        elif s == Stato.ATTESA:
            # mantiene le porte aperte per il tempo di sosta (dwell); esce
            # solo quando il door manager segnala 'pronto_chiusura'
            o.km_apri = self.fb_porte.apri
            if self.fb_porte.pronto_chiusura:
                self.stato = Stato.CHIUDI_PORTE

        elif s == Stato.REVISIONE:
            o.km_salita = i.rev_salita and not i.rev_discesa and self.fb_sic.consenso_marcia
            o.km_discesa = i.rev_discesa and not i.rev_salita and self.fb_sic.consenso_marcia
            o.km_lento = o.km_salita or o.km_discesa
            o.km_freno = o.km_lento
            if not i.revisione:
                self.stato = Stato.RIPOSO

        elif s == Stato.GUASTO:
            o.fuori_servizio = True
            if not self.fb_sic.guasto and not i.revisione:
                self.stato = Stato.RIPOSO

        elif s == Stato.EMERGENZA:
            o.fuori_servizio = True
            if not self.fb_sic.emergenza:
                self.stato = Stato.RIPOSO

    # ----------------------- IDRAULICO -----------------------
    def _fsm_idraulico(self, i: Inputs, o: Outputs):
        s = self.stato
        if s == Stato.RIPOSO:
            self.direzione = Direzione.FERMO
            relivel = self.ton_relivel(
                (not self.fb_sic.in_zona_porta) and self.par.relivell_abilitato
                and self.fb_porte.porte_chiuse, cycles(1.0))
            if relivel and self.fb_sic.consenso_marcia:
                self.target = self.piano_corrente
                self.direzione = Direzione.SALITA
                self.stato = Stato.PARTENZA
            elif self.fb_call.valida and self.fb_sic.consenso_marcia:
                self.target = self.fb_call.target
                if self.target == self.piano_corrente:
                    self.stato = Stato.APRI_PORTE
                elif not i.sovraccarico:
                    self.stato = Stato.CHIUDI_PORTE

        elif s == Stato.CHIUDI_PORTE:
            o.km_chiudi = True
            if self.fb_porte.porte_chiuse:
                if self.fb_call.valida and not i.sovraccarico:
                    self.target = self.fb_call.target
                    self.direzione = self.fb_call.direzione
                    self.stato = Stato.PARTENZA
                else:
                    self.stato = Stato.RIPOSO

        elif s == Stato.PARTENZA:
            if not (self.fb_sic.consenso_marcia and self.fb_porte.porte_chiuse):
                self.stato = Stato.ARRESTO
            elif self.direzione == Direzione.SALITA:
                o.km_pompa = True
                o.km_stella = True
                if self.ton_stella(True, cycles(self.par.star_delta_time)):
                    o.km_stella = False
                    o.km_triangolo = True
                    o.ev_salita = True
                    self.ton_stella(False, cycles(self.par.star_delta_time))
                    self.stato = Stato.MARCIA
            else:
                o.ev_discesa = True
                self.stato = Stato.MARCIA

        elif s == Stato.MARCIA:
            if self.direzione == Direzione.SALITA:
                o.km_pompa = True; o.km_triangolo = True; o.ev_salita = True
            else:
                o.ev_discesa = True
            if ((self.direzione == Direzione.SALITA and i.rallent_salita)
                    or (self.direzione == Direzione.DISCESA and i.rallent_discesa)):
                self.stato = Stato.RALLENTA
            if not self.fb_sic.consenso_marcia:
                self.stato = Stato.ARRESTO

        elif s == Stato.RALLENTA:
            if self.direzione == Direzione.SALITA:
                o.km_pompa = True; o.km_triangolo = True; o.ev_salita = True
            else:
                o.ev_discesa = True
            if self.fb_sic.in_zona_porta:
                self.stato = Stato.LIVELLA
            if not self.fb_sic.consenso_marcia:
                self.stato = Stato.ARRESTO

        elif s == Stato.LIVELLA:
            if self.direzione == Direzione.SALITA:
                o.km_pompa = True; o.km_triangolo = True; o.ev_salita = True
            else:
                o.ev_discesa = True
            if self.fb_sic.in_zona_porta:
                self.stato = Stato.ARRESTO

        elif s == Stato.ARRESTO:
            # valvole chiuse e pompa ferma (no colpo d'ariete)
            self.stato = Stato.APRI_PORTE

        elif s == Stato.APRI_PORTE:
            o.km_apri = self.fb_porte.apri
            o.gong = self.par.gong and self.ton_gong(True, cycles(0.3))
            if self.fb_porte.porte_aperte:
                self.ton_gong(False, cycles(0.3))
                self.stato = Stato.ATTESA

        elif s == Stato.ATTESA:
            o.km_apri = self.fb_porte.apri
            if self.fb_porte.pronto_chiusura:
                self.stato = Stato.CHIUDI_PORTE

        elif s == Stato.REVISIONE:
            if i.rev_salita and not i.rev_discesa and self.fb_sic.consenso_marcia:
                o.km_pompa = True; o.km_triangolo = True; o.ev_salita = True
            elif i.rev_discesa and not i.rev_salita and self.fb_sic.consenso_marcia:
                o.ev_discesa = True
            if not i.revisione:
                self.stato = Stato.RIPOSO

        elif s == Stato.GUASTO:
            o.fuori_servizio = True
            if not self.fb_sic.guasto and not i.revisione:
                self.stato = Stato.RIPOSO

        elif s == Stato.EMERGENZA:
            o.fuori_servizio = True
            if not self.fb_sic.emergenza:
                self.stato = Stato.RIPOSO


# ---------------------------------------------------------------------------
#  PlantModel — modello d'impianto per chiudere l'anello
# ---------------------------------------------------------------------------
class PlantModel:
    """Aggiorna posizione cabina, porte e sensori in base alle uscite."""
    def __init__(self, n_piani=6, piano_iniziale=0):
        self.n = n_piani
        self.pos = float(piano_iniziale)   # posizione in 'piani'
        self.door = 0.0                     # 0 chiusa .. 1 aperta
        self.V_ALTA = 0.05                  # piani/ciclo
        self.V_BASSA = 0.01
        self.V_IDR = 0.02

    def update(self, o: Outputs, i: Inputs, target: int):
        # --- movimento ---
        v = 0.0
        up = o.km_salita or o.ev_salita
        down = o.km_discesa or o.ev_discesa
        if up or down:
            if o.km_veloce:
                v = self.V_ALTA
            elif o.km_lento:
                v = self.V_BASSA
            else:
                v = self.V_IDR  # idraulico
            self.pos += v if up else -v
            self.pos = max(0.0, min(self.n - 1, self.pos))

        # --- porte ---
        if o.km_apri:
            self.door = min(1.0, self.door + 0.34)
        elif o.km_chiudi:
            self.door = max(0.0, self.door - 0.34)

        # --- aggiorna sensori in Inputs ---
        dist = abs(self.pos - target) if target >= 0 else 99
        i.zona_porta1 = i.zona_porta2 = (dist < 0.05)
        moving_up = up
        moving_down = down
        i.rallent_salita = moving_up and dist < 0.40
        i.rallent_discesa = moving_down and dist < 0.40
        i.porta_aperta = self.door >= 1.0
        i.porta_chiusa = self.door <= 0.0

    @property
    def piano(self):
        return round(self.pos)


# ---------------------------------------------------------------------------
#  Simulatore (anello chiuso)
# ---------------------------------------------------------------------------
class Simulatore:
    def __init__(self, tipo="geared", n_piani=6, piano_iniziale=0, par=None):
        self.asc = Ascensore(tipo, n_piani, par)
        self.asc.piano_corrente = piano_iniziale
        self.plant = PlantModel(n_piani, piano_iniziale)
        self.i = Inputs()
        self.t = 0
        self.log = []

    def run(self, n_cicli, on_cycle=None):
        for _ in range(n_cicli):
            if on_cycle:
                on_cycle(self.t, self)
            o = self.asc.step(self.i)
            # i pulsanti di chiamata sono momentanei: una volta latchati nel
            # registro (FBChiamate) vanno rilasciati
            self.i.chiamate_cabina = 0
            self.i.chiamate_piano_su = 0
            self.i.chiamate_piano_giu = 0
            self.plant.update(o, self.i, self.asc.target)
            self.log.append((self.t, self.asc.stato, round(self.plant.pos, 3),
                             round(self.plant.door, 2)))
            self.t += 1
        return self.asc.out


# ---------------------------------------------------------------------------
#  Interfaccia parametri "web" — stessa logica di firmware/ e FB_ParametriModbus
#  Dimostra che alcuni parametri del PLC sono modificabili via interfaccia web.
# ---------------------------------------------------------------------------
# id -> (attributo Parametri, min, max, categoria)
PARAM_META = {
    "door_open_time":    ("tempo_porte_aperte", 2.0, 20.0, "NS"),
    "door_nudging":      ("nudging",            0,   1,    "NS"),
    "arrival_gong":      ("gong",               0,   1,    "NS"),
    "star_delta_time":   ("star_delta_time",    0.5, 3.0,  "NS"),
    "alarm_filter_time": ("tempo_filtro_allarme", 1.0, 10.0, "NS"),
    "door_time_disabled":("tempo_porte_accessibile", 5.0, 30.0, "NS"),
    "inspection_speed":  ("velocita_ispezione", 0.10, 0.63, "SR"),
    "releveling_enable": ("relivell_abilitato", 0,   1,    "SR"),
    # esempi di sola lettura
    "car_position":      (None, None, None, "RO"),
    "rated_speed":       (None, None, None, "SC"),
}


def scrivi_parametro(asc, pid, value, key_inserted=False):
    """Applica una scrittura parametro dall'interfaccia web.
    Ritorna (ok, valore_applicato, motivo). Rispecchia firmware + PLC:
    SC/RO sola lettura; SR solo con chiave fisica; clamp ai limiti normativi."""
    meta = PARAM_META.get(pid)
    if meta is None:
        return (False, None, "parametro inesistente")
    attr, mn, mx, cat = meta
    if cat in ("SC", "RO"):
        return (False, None, "sola lettura (safety-critical/telemetria)")
    if cat == "SR" and not key_inserted:
        return (False, None, "chiave di abilitazione non inserita")
    v = value
    if mn is not None:
        v = max(mn, min(mx, value))      # clamp
    cur = getattr(asc.par, attr)
    if isinstance(cur, bool):
        v = bool(round(v))
    setattr(asc.par, attr, v)
    return (True, v, "ok")


if __name__ == "__main__":
    # demo: chiamata al piano 3 su impianto geared
    par = Parametri(tempo_porte_aperte=0.5)
    sim = Simulatore("geared", par=par)
    sim.i.chiamate_cabina = 1 << 3
    sim.run(400)
    print("Stato finale:", sim.asc.stato.name,
          "piano:", sim.asc.piano_corrente,
          "porta:", round(sim.plant.door, 2))

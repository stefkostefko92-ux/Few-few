#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test della logica di manovra (geared / idraulico) sul simulatore ad anello
chiuso. Esecuzione:  python3 -m unittest -v   (dalla cartella sim/)
                     oppure:  python3 sim/test_ascensore.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ascensore_sim import (Simulatore, Parametri, Stato, Direzione,  # noqa: E402
                           scrivi_parametro)


def par_veloce():
    # tempo porte ridotto per test rapidi
    return Parametri(tempo_porte_aperte=0.5)


class TestGeared(unittest.TestCase):

    def test_partenza_e_arrivo(self):
        """Chiamata cabina al piano 3 da piano 0: arriva e apre le porte."""
        sim = Simulatore("geared", piano_iniziale=0, par=par_veloce())
        sim.i.chiamate_cabina = 1 << 3
        porte_aperte_al_3 = False

        def osserva(t, s):
            nonlocal porte_aperte_al_3
            if s.asc.piano_corrente == 3 and s.plant.door >= 1.0:
                porte_aperte_al_3 = True
        sim.run(400, on_cycle=osserva)

        self.assertEqual(sim.asc.piano_corrente, 3)
        self.assertTrue(porte_aperte_al_3, "le porte non si sono aperte al piano 3")
        self.assertEqual(sim.asc.stato, Stato.RIPOSO)

    def test_chiamata_stessa_quota(self):
        """Chiamata al piano corrente: apre senza muoversi."""
        sim = Simulatore("geared", piano_iniziale=2, par=par_veloce())
        sim.i.chiamate_cabina = 1 << 2
        apertura = False

        def osserva(t, s):
            nonlocal apertura
            if s.plant.door >= 1.0:
                apertura = True
        sim.run(120, on_cycle=osserva)
        self.assertTrue(apertura)
        self.assertEqual(sim.asc.piano_corrente, 2)
        # non deve mai aver comandato marcia
        self.assertAlmostEqual(sim.plant.pos, 2.0, delta=0.01)

    def test_emergenza_ferma_la_manovra(self):
        """Apertura catena di sicurezza durante la marcia -> EMERGENZA, uscite a 0."""
        sim = Simulatore("geared", piano_iniziale=0, par=par_veloce())
        sim.i.chiamate_cabina = 1 << 5

        def osserva(t, s):
            if t == 30:                      # apre la catena a meta' corsa
                s.i.catena_ok = False
        sim.run(80, on_cycle=osserva)

        self.assertEqual(sim.asc.stato, Stato.EMERGENZA)
        o = sim.asc.out
        self.assertFalse(o.km_salita or o.km_discesa or o.km_veloce)
        self.assertTrue(o.fuori_servizio)

    def test_recupero_dopo_emergenza(self):
        """Richiusura catena -> ritorno a RIPOSO."""
        sim = Simulatore("geared", piano_iniziale=1, par=par_veloce())
        sim.i.catena_ok = False
        sim.run(10)
        self.assertEqual(sim.asc.stato, Stato.EMERGENZA)
        sim.i.catena_ok = True
        sim.run(10)
        self.assertEqual(sim.asc.stato, Stato.RIPOSO)

    def test_revisione_uomo_presente(self):
        """In revisione la salita avviene solo a bassa velocita' e a comando."""
        sim = Simulatore("geared", piano_iniziale=0, par=par_veloce())
        sim.i.revisione = True
        sim.i.rev_salita = True
        sim.run(40)
        self.assertEqual(sim.asc.stato, Stato.REVISIONE)
        self.assertTrue(sim.asc.out.km_lento)
        self.assertFalse(sim.asc.out.km_veloce)  # mai alta velocita'
        self.assertGreater(sim.plant.pos, 0.0)    # si e' mosso in su
        # rilascio comando: si ferma
        sim.i.rev_salita = False
        pos = sim.plant.pos
        sim.run(10)
        self.assertAlmostEqual(sim.plant.pos, pos, delta=0.02)

    def test_sovraccarico_blocca_partenza(self):
        """Con sovraccarico le porte non si richiudono e non si parte."""
        sim = Simulatore("geared", piano_iniziale=0, par=par_veloce())
        sim.i.sovraccarico = True
        sim.i.chiamate_cabina = 1 << 2
        sim.run(120)
        self.assertEqual(sim.asc.piano_corrente, 0)   # non e' partito
        self.assertNotEqual(sim.asc.stato, Stato.MARCIA)

    def test_guasto_termico(self):
        """Termica motore intervenuta -> GUASTO e fuori servizio."""
        sim = Simulatore("geared", par=par_veloce())
        sim.i.termica_ok = False
        sim.run(10)
        self.assertEqual(sim.asc.stato, Stato.GUASTO)
        self.assertTrue(sim.asc.out.fuori_servizio)

    def test_collettiva_due_chiamate(self):
        """Due chiamate (2 e 4) servite salendo nell'ordine corretto."""
        sim = Simulatore("geared", piano_iniziale=0, par=par_veloce())
        sim.i.chiamate_cabina = (1 << 2) | (1 << 4)
        ordine = []

        def osserva(t, s):
            if s.plant.door >= 1.0 and (not ordine or ordine[-1] != s.asc.piano_corrente):
                ordine.append(s.asc.piano_corrente)
        sim.run(700, on_cycle=osserva)
        self.assertEqual(ordine, [2, 4])


class TestIdraulico(unittest.TestCase):

    def test_salita_sequenza_stella_triangolo(self):
        """Salita: prima stella, poi triangolo + valvola di salita."""
        sim = Simulatore("idraulico", piano_iniziale=0, par=par_veloce())
        sim.i.chiamate_cabina = 1 << 2
        vista_stella = False
        vista_triangolo_valvola = False

        def osserva(t, s):
            nonlocal vista_stella, vista_triangolo_valvola
            o = s.asc.out
            if o.km_stella and not o.km_triangolo:
                vista_stella = True
            if o.km_triangolo and o.ev_salita:
                vista_triangolo_valvola = True
        sim.run(400, on_cycle=osserva)

        self.assertTrue(vista_stella, "fase di stella non osservata")
        self.assertTrue(vista_triangolo_valvola, "triangolo+valvola non osservati")
        self.assertEqual(sim.asc.piano_corrente, 2)

    def test_discesa_per_gravita(self):
        """Discesa: solo valvola di discesa, pompa ferma."""
        sim = Simulatore("idraulico", piano_iniziale=4, par=par_veloce())
        sim.asc.piano_corrente = 4
        sim.i.chiamate_cabina = 1 << 1
        pompa_in_discesa = False

        def osserva(t, s):
            nonlocal pompa_in_discesa
            o = s.asc.out
            if o.ev_discesa and o.km_pompa:
                pompa_in_discesa = True
        sim.run(500, on_cycle=osserva)

        self.assertEqual(sim.asc.piano_corrente, 1)
        self.assertFalse(pompa_in_discesa, "la pompa non deve girare in discesa")

    def test_emergenza_idraulico(self):
        sim = Simulatore("idraulico", piano_iniziale=0, par=par_veloce())
        sim.i.chiamate_cabina = 1 << 3
        def osserva(t, s):
            if t == 40:
                s.i.catena_ok = False
        sim.run(80, on_cycle=osserva)
        self.assertEqual(sim.asc.stato, Stato.EMERGENZA)
        o = sim.asc.out
        self.assertFalse(o.ev_salita or o.ev_discesa or o.km_pompa)


class TestParametriWeb(unittest.TestCase):
    """Modifica parametri PLC tramite interfaccia web (firmware + FB_ParametriModbus)."""

    def test_ns_modificabile(self):
        sim = Simulatore("geared")
        ok, v, _ = scrivi_parametro(sim.asc, "door_open_time", 8)
        self.assertTrue(ok)
        self.assertEqual(v, 8)
        self.assertEqual(sim.asc.par.tempo_porte_aperte, 8)

    def test_ns_clamp_ai_limiti(self):
        sim = Simulatore("geared")
        ok, v, _ = scrivi_parametro(sim.asc, "door_open_time", 999)
        self.assertTrue(ok)
        self.assertEqual(v, 20)          # clampato al massimo normativo

    def test_sr_rifiutato_senza_chiave(self):
        sim = Simulatore("geared")
        prima = sim.asc.par.velocita_ispezione
        ok, v, motivo = scrivi_parametro(sim.asc, "inspection_speed", 0.5,
                                         key_inserted=False)
        self.assertFalse(ok)
        self.assertIn("chiave", motivo)
        self.assertEqual(sim.asc.par.velocita_ispezione, prima)  # invariato

    def test_sr_accettato_con_chiave_e_clamp(self):
        sim = Simulatore("geared")
        ok, v, _ = scrivi_parametro(sim.asc, "inspection_speed", 0.5,
                                    key_inserted=True)
        self.assertTrue(ok)
        self.assertAlmostEqual(sim.asc.par.velocita_ispezione, 0.5)
        # oltre il limite EN 81-20 (0.63) -> clamp
        ok, v, _ = scrivi_parametro(sim.asc, "inspection_speed", 0.9,
                                    key_inserted=True)
        self.assertAlmostEqual(v, 0.63)

    def test_readonly_non_scrivibile(self):
        sim = Simulatore("geared")
        ok, v, motivo = scrivi_parametro(sim.asc, "car_position", 1234,
                                         key_inserted=True)
        self.assertFalse(ok)
        self.assertIn("lettura", motivo)

    def test_parametro_influenza_manovra(self):
        """Aumentando il tempo Y/Δ (idraulico) la partenza ritarda davvero."""
        def primo_ev_salita(star_delta):
            sim = Simulatore("idraulico", piano_iniziale=0, par=Parametri(tempo_porte_aperte=0.5))
            scrivi_parametro(sim.asc, "star_delta_time", star_delta)
            sim.i.chiamate_cabina = 1 << 2
            t_ev = [None]
            def osserva(t, s):
                if t_ev[0] is None and s.asc.out.ev_salita:
                    t_ev[0] = t
            sim.run(200, on_cycle=osserva)
            return t_ev[0]
        t_corto = primo_ev_salita(0.5)
        t_lungo = primo_ev_salita(3.0)
        self.assertIsNotNone(t_corto)
        self.assertIsNotNone(t_lungo)
        self.assertGreater(t_lungo, t_corto)   # più tempo Y/Δ -> valvola dopo


class TestAllarmeEN8128(unittest.TestCase):
    """Sistema di allarme e comunicazione di emergenza (EN 81-28:2022)."""

    def test_filtro_pressione_breve_non_attiva(self):
        sim = Simulatore("geared", par=Parametri(tempo_filtro_allarme=3.0))
        sim.i.pulsante_allarme = True
        sim.run(20)                 # 2 s < filtro 3 s
        sim.i.pulsante_allarme = False
        self.assertFalse(sim.asc.out.allarme_registrato)

    def test_pressione_prolungata_registra_e_chiama(self):
        sim = Simulatore("geared", par=Parametri(tempo_filtro_allarme=2.0))
        sim.i.pulsante_allarme = True
        sim.run(40)                 # 4 s > filtro 2 s
        self.assertTrue(sim.asc.out.allarme_registrato)
        self.assertTrue(sim.asc.out.avvia_combinatore)   # avvia autodialer
        self.assertFalse(sim.asc.out.comunicazione_attiva)

    def test_comunicazione_e_reset(self):
        sim = Simulatore("geared", par=Parametri(tempo_filtro_allarme=1.0))
        sim.i.pulsante_allarme = True
        sim.run(20)
        sim.i.pulsante_allarme = False
        sim.i.riscontro_oper = True             # soccorso prende in carico
        sim.run(5)
        self.assertTrue(sim.asc.out.comunicazione_attiva)
        self.assertFalse(sim.asc.out.avvia_combinatore)  # gia' in comunicazione
        sim.i.riscontro_oper = False
        sim.i.reset_allarme = True              # reset tecnico
        sim.run(3)
        self.assertFalse(sim.asc.out.allarme_registrato)

    def test_guasto_batteria_o_linea(self):
        sim = Simulatore("geared")
        sim.i.batteria_allarme_ok = False
        sim.run(3)
        self.assertTrue(sim.asc.out.guasto_allarme)


class TestAccessibilitaEN8170(unittest.TestCase):
    """Sosta porte estesa per chiamata accessibile (EN 81-70:2021)."""

    def _durata_porte_aperte(self, accessibile):
        par = Parametri(tempo_porte_aperte=0.5, tempo_porte_accessibile=2.0)
        sim = Simulatore("geared", piano_iniziale=0, par=par)
        sim.i.chiamata_accessibile = accessibile
        sim.i.chiamate_cabina = 1 << 2
        cicli_aperte = [0]

        def osserva(t, s):
            if s.plant.door >= 1.0:
                cicli_aperte[0] += 1
        sim.run(500, on_cycle=osserva)
        return cicli_aperte[0]

    def test_chiamata_accessibile_estende_sosta(self):
        normale = self._durata_porte_aperte(False)
        accessibile = self._durata_porte_aperte(True)
        self.assertGreater(accessibile, normale)


if __name__ == "__main__":
    unittest.main(verbosity=2)

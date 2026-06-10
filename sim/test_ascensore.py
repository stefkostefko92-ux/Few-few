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
from ascensore_sim import Simulatore, Parametri, Stato, Direzione  # noqa: E402


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


if __name__ == "__main__":
    unittest.main(verbosity=2)

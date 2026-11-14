// The shared data of the quote tests: a scheda, the lines of a usual quote, the MASTER switch, new quote,
// the open version.
import assert from 'node:assert/strict';
import type { Browser } from './harness.js';

export const SCHEDA = {
  data: '2026-11-02',
  numeroImpianto: '880022',
  matricola: 'MI 7788',
  indirizzo: 'Via Manzoni 4, Milano',
  fermate: '5',
  tipoImpianto: ['ELETTRICO'],
  quadroSostituire: 'si',
};

export const RIGHE = {
  cliente: 'Condominio Manzoni 4',
  clienteEmail: 'amministratore@example.it',
  oggetto: 'Sostituzione del quadro di manovra',
  data: '2026-11-13',
  validitaGiorni: '60',
  'r-0-descrizione': 'Quadro di manovra VVVF',
  'r-0-unita': 'pz',
  'r-0-quantita': '1',
  'r-0-prezzo': '4.850,00',
  'r-0-sconto': '5',
  'r-0-iva': '10',
  'r-1-descrizione': 'Manodopera',
  'r-1-unita': 'h',
  'r-1-quantita': '12,5',
  'r-1-prezzo': '45',
  'r-1-iva': '22',
};

export async function accendi(master: Browser, aziendaId: string, attivi: boolean) {
  const reply = await master.submit(`/aziende/${aziendaId}`, `/aziende/${aziendaId}/preventivi`, {
    attivi: attivi ? '1' : '0',
  });
  assert.equal(reply.status, 303);
}

export async function crea(browser: Browser, form: Record<string, string | string[]>) {
  const reply = await browser.submit('/preventivi/nuovo', '/preventivi', form);
  assert.equal(
    reply.status,
    303,
    `create failed with ${reply.status}: ${reply.body.slice(0, 400)}`,
  );
  return reply.location.split('/').pop()!;
}

export async function base(browser: Browser, id: string): Promise<string> {
  const page = await browser.get(`/preventivi/${id}/modifica`);
  return /name="base" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
}

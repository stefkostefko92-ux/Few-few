// Shared by the integration tests of the intervention sheets: a filled draft, the two signatures, and the
// signing page sent back exactly as it was shown (its version and the fingerprint of its content).
import assert from 'node:assert/strict';
import type { Browser } from './harness.js';

export const FIRMA_TECNICO = JSON.stringify({ s: [[10, 150, 120, 40, 260, 160]] });
export const FIRMA_CLIENTE = JSON.stringify({ s: [[30, 120, 200, 60, 420, 150]] });
export const SEAL_KEY = () => Buffer.from(process.env.INTERVENTI_SEAL_KEY!, 'hex');

export const FORM = {
  data: '2026-10-30',
  turno: 'MATTINA',
  indirizzo: 'Via Roma 12',
  citta: 'Milano',
  tecnici: 'Mario Rossi',
  matricola: 'MI 4521',
  'v-05': 'si',
  'q-05': '2',
  'v-84': 'si',
  'q-84': 'piano 3',
  'c-84': ['P'],
  altro: 'Sostituito pulsante di piano.',
  prove: 'si',
  oreTecnico: '1,5',
  oreTotali: '3',
};
export const FIRME = {
  firmaTecnico: FIRMA_TECNICO,
  firmaTecnicoNome: 'Mario Rossi',
  firmaCliente: FIRMA_CLIENTE,
  firmaClienteNome: 'Anna Bianchi',
};

export async function create(browser: Browser, form: Record<string, string | string[]>) {
  const reply = await browser.submit('/interventi/nuovo', '/interventi', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

export const baseOf = async (browser: Browser, id: string) =>
  /name="base" value="([^"]+)"/.exec((await browser.get(`/interventi/${id}/modifica`)).body)?.[1] ??
  '';

/** The signing page as it was shown: its version and fingerprint, ready to be sent back. */
export async function paginaFirma(browser: Browser, id: string) {
  const page = await browser.get(`/interventi/${id}/firma`);
  assert.equal(page.status, 200, `signing page: ${page.status}`);
  return {
    body: page.body,
    base: /name="base" value="([^"]+)"/.exec(page.body)![1]!,
    impronta: /name="impronta" value="([0-9a-f]{64})"/.exec(page.body)![1]!,
  };
}

export async function firma(browser: Browser, id: string, fields: Record<string, string> = FIRME) {
  const vista = await paginaFirma(browser, id);
  return browser.submit(`/interventi/${id}/firma`, `/interventi/${id}/conferma`, {
    base: vista.base,
    impronta: vista.impronta,
    ...fields,
  });
}

// The checks of the "Quadro" section that open supplier sheets, in the order of the form: Mastech
// (mastech.mjs), Elettroquadri by the kind of lift (elettroquadri.mjs), AMI 100 with a reduced pit or
// headroom (ami100.mjs).
import { checkAmi100 } from './ami100.mjs';
import { checkElettroquadri } from './elettroquadri.mjs';
import { checkMastech } from './mastech.mjs';

export async function checkQuadro(page, scheme, aziendaName) {
  await checkMastech(page, scheme, aziendaName);
  await checkElettroquadri(page, scheme, aziendaName);
  await checkAmi100(page, scheme);
}

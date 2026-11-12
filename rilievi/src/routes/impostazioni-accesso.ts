import { Router } from 'express';
import { writeAudit } from '../audit.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { fornitoriConfigurati } from '../auth/oidc.js';
import type { Fornitore } from '../auth/oidc-stato.js';
import { dominioDa, tenantDa } from '../auth/oidc-valori.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { dimenticaVisibili, ENUM_FORNITORE } from '../services/accesso-esterno.js';
import {
  notFound,
  pathSezione,
  renderImpostazioni,
  type AziendaImpostabile,
} from './impostazioni-vista.js';

/**
 * „Accesso con Microsoft o Google“ в настройките (D1, чл. 4.6): администраторът на фирмата (и MASTER) пише
 * директорията на Microsoft Entra (tenant ID) и домейна на Google Workspace — празно изключва. Само за
 * доставчик с регистрирано приложение; другото поле остава, каквото е. Одит: включено ли е, без стойностите.
 */
export const impostazioniAccessoRouter: Router = Router();
const settings = requireCapability('aziende:settings');

/** Колко души от фирмата са свързали всеки доставчик — за страницата на раздела. */
export async function vistaAccesso(azienda: AziendaImpostabile) {
  const righe = await prisma.identitaEsterna.groupBy({
    by: ['fornitore'],
    where: { user: { memberships: { some: { aziendaId: azienda.id } } } },
    _count: { _all: true },
  });
  const collegati: Partial<Record<Fornitore, number>> = {};
  for (const f of ['microsoft', 'google'] as const) {
    const riga = righe.find((r) => r.fornitore === ENUM_FORNITORE[f]);
    if (riga) collegati[f] = riga._count._all;
  }
  return {
    values: { microsoft: azienda.accessoMicrosoft ?? '', google: azienda.accessoGoogle ?? '' },
    errors: {},
    collegati,
  };
}

const testo = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 300).trim() : '');

impostazioniAccessoRouter.post('/impostazioni/accesso', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  const configurati = fornitoriConfigurati();
  if (!azienda || configurati.length === 0) return notFound(req, res);
  const scritto = { microsoft: testo(body.microsoft), google: testo(body.google) };
  const valori = {
    microsoft: configurati.includes('microsoft')
      ? scritto.microsoft
        ? tenantDa(scritto.microsoft)
        : null
      : azienda.accessoMicrosoft,
    google: configurati.includes('google')
      ? scritto.google
        ? dominioDa(scritto.google)
        : null
      : azienda.accessoGoogle,
  };
  const errors: Partial<Record<Fornitore, string>> = {};
  if (configurati.includes('microsoft') && scritto.microsoft && !valori.microsoft)
    errors.microsoft = 'esterno.impostazioni.erroreMicrosoft';
  if (configurati.includes('google') && scritto.google && !valori.google)
    errors.google = 'esterno.impostazioni.erroreGoogle';
  if (Object.keys(errors).length > 0) {
    const vista = await vistaAccesso(azienda);
    return renderImpostazioni(res, 422, {
      sezione: 'accesso',
      aziende,
      azienda,
      error: 'impostazioni.error',
      esterni: { ...vista, values: scritto, errors },
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.azienda.update({
      where: { id: azienda.id },
      data: { accessoMicrosoft: valori.microsoft, accessoGoogle: valori.google },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'AZIENDA_ACCESSO_ESTERNO',
        aziendaId: azienda.id,
        targetType: 'azienda',
        targetId: azienda.id,
        meta: { microsoft: valori.microsoft !== null, google: valori.google !== null },
      },
      tx,
    );
  });
  dimenticaVisibili();
  setFlash(res, 'ok', 'esterno.impostazioni.salvato');
  res.redirect(303, pathSezione('accesso', azienda.id));
});

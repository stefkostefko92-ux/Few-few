import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { isProduction } from '../config.js';
import { setFlash } from '../http/flash.js';
import { mailLimiter } from '../http/limits.js';
import { leggiFormPosta, PORTE_SMTP, type CampoPosta } from '../mail/posta-form.js';
import { ultimoEsitoPosta } from '../mail/mailer.js';
import {
  disattivaPosta,
  passwordSalvata,
  salvaPosta,
  statoPosta,
  versionePosta,
} from '../mail/posta.js';
import { provaPosta, ultimaProva } from '../mail/prova.js';
import { confermaPassword } from './conferma-password.js';

/**
 * „Email del portale“ в конзолата на MASTER (#32 — Brevo SMTP): сървърът, портът, логинът, ключът (само се пише —
 * никога не се показва; празно — остава записаният), подателят; пробно писмо до самия MASTER; изключване (пак
 * важи средата). Страницата казва и защо не е тръгнало последното пробно и последното истинско писмо
 * (mail/diagnosi.ts — стъпката с думи и отговорът на сървъра). Само `aziende:manage`.
 */
export const masterPostaRouter: Router = Router();
const manage = requireCapability('aziende:manage');

type Valori = Record<Exclude<CampoPosta, 'password'>, string>;

const PREDEFINITI: Valori = {
  host: 'smtp-relay.brevo.com',
  porta: '2525',
  utente: '',
  mittenteNome: 'Rilievi Impianti',
  mittenteEmail: 'no-reply@carbonstealth.eu',
};

async function vista(
  res: Response,
  status: number,
  extra: {
    valori?: Valori;
    errori?: Partial<Record<CampoPosta | 'passwordAccount', string>>;
  } = {},
): Promise<void> {
  const stato = await statoPosta();
  const valori: Valori =
    extra.valori ??
    (stato.riga
      ? {
          host: stato.riga.host,
          porta: String(stato.riga.porta),
          utente: stato.riga.utente,
          mittenteNome: stato.riga.mittenteNome,
          mittenteEmail: stato.riga.mittenteEmail,
        }
      : PREDEFINITI);
  // Последното неуспешно истинско писмо — само ако е пращано със СЕГАШНАТА настройка (иначе описва старата);
  // пробата се сверява сама (`ultimaProva`). Двете носят сървъра, с който са пращани.
  const invio = ultimoEsitoPosta();
  res.status(status).render('master/posta', {
    stato,
    valori,
    errori: extra.errori ?? {},
    porte: PORTE_SMTP,
    prova: ultimaProva(),
    invio: invio && !invio.riuscito && invio.versione === versionePosta() ? invio : null,
  });
}

const corpo = (req: Request): Record<string, unknown> => req.body as Record<string, unknown>;

masterPostaRouter.get('/master/posta', manage, (_req, res) => vista(res, 200));

masterPostaRouter.post('/master/posta', manage, requireCsrf, async (req, res) => {
  const body = corpo(req);
  const salvato = (await statoPosta()).riga;
  const esito = leggiFormPosta(body, {
    produzione: isProduction(),
    passwordSalvata: await passwordSalvata(),
    salvato: salvato ? { host: salvato.host, utente: salvato.utente } : null,
  });
  // С паролата на акаунта: оттук тръгват всички писма на портала (връзки за парола, кодове за подпис).
  const conferma = await confermaPassword(req, res, 'passwordAccount');
  if (conferma === 'bloccato') return;
  if (!esito.ok || conferma === 'errata') {
    // Ключът не се връща във формата — нито написаният, нито записаният.
    const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).slice(0, 300) : '');
    return vista(res, 422, {
      valori: {
        host: s('host'),
        porta: s('porta'),
        utente: s('utente'),
        mittenteNome: s('mittenteNome'),
        mittenteEmail: s('mittenteEmail'),
      },
      errori: {
        ...(esito.ok ? {} : esito.errori),
        ...(conferma === 'errata' ? { passwordAccount: 'posta.errore.passwordAccount' } : {}),
      },
    });
  }
  await salvaPosta(principalOf(req).user.id, esito.valori);
  setFlash(res, 'ok', 'posta.flash.salvata');
  res.redirect(303, '/master/posta');
});

masterPostaRouter.post(
  '/master/posta/prova',
  manage,
  mailLimiter,
  requireCsrf,
  async (req, res) => {
    const user = principalOf(req).user;
    const t = res.locals.t as (key: string, p?: Record<string, string>) => string;
    const esito = await provaPosta(
      user.id,
      user.email,
      t('posta.prova.oggetto'),
      t('posta.prova.testo'),
    );
    if (esito.esito === 'inviata')
      setFlash(res, 'ok', 'posta.flash.provaInviata', { email: user.email });
    else if (esito.esito === 'spenta') setFlash(res, 'error', 'posta.flash.provaSpenta');
    else setFlash(res, 'error', 'posta.flash.provaErrore');
    res.redirect(303, '/master/posta');
  },
);

masterPostaRouter.post('/master/posta/disattiva', manage, requireCsrf, async (req, res) => {
  if (await disattivaPosta(principalOf(req).user.id))
    setFlash(res, 'ok', 'posta.flash.disattivata');
  res.redirect(303, '/master/posta');
});

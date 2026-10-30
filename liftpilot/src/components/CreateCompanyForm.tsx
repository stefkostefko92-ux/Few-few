'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createCompanyAction } from '@/server/user-actions';
import { initialFormState } from '@/server/form';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/admin.json';
import Etichetta from './aiuto/Etichetta';
import SecretOnce from './SecretOnce';

/** A client company with its owner, made by the platform. Each field has its «?» next to its label (round 52), outside
 *  the label: the field is a box, the label names the input by its id. */
export default function CreateCompanyForm() {
  const t = useTranslations('admin'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(createCompanyAction, initialFormState);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <h2>{t('addTitle')}</h2>
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {state.ok && state.secret ? <SecretOnce email={state.message} secret={state.secret} /> : null}
      <div className="form-grid">
        <div className="field span-2">
          <Etichetta htmlFor="cc-name" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.nome')} nome={t('company')}>{t('company')} *</Etichetta>
          <input id="cc-name" className="input" name="name" maxLength={160} required />
        </div>
        <div className="field">
          <Etichetta htmlFor="cc-vat" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.piva')} nome={t('vat')}>{t('vat')}</Etichetta>
          <input id="cc-vat" className="input" name="vatNumber" maxLength={40} />
        </div>
        <div className="field">
          <Etichetta htmlFor="cc-city" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.comune')} nome={t('city')}>{t('city')}</Etichetta>
          <input id="cc-city" className="input" name="city" maxLength={120} />
        </div>
        <div className="field">
          <Etichetta htmlFor="cc-owner" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.titolareNome')} nome={t('ownerName')}>{t('ownerName')} *</Etichetta>
          <input id="cc-owner" className="input" name="ownerName" maxLength={120} required />
        </div>
        <div className="field">
          <Etichetta htmlFor="cc-owner-email" className="field-label" aiuto={testoAiuto(AIUTO, 'aziende.titolareEmail')} nome={t('ownerEmail')}>{t('ownerEmail')} *</Etichetta>
          <input id="cc-owner-email" className="input" type="email" name="ownerEmail" maxLength={254} required />
        </div>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{t('add')}</button></div>
    </form>
  );
}

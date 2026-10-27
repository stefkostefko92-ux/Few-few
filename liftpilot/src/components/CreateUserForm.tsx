'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { createUserAction } from '@/server/user-actions';
import { initialFormState } from '@/server/form';
import { TOKEN_TTL_MS } from '@/lib/token-shape';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/azienda.json';
import Etichetta from './aiuto/Etichetta';
import SecretOnce from './SecretOnce';

/** `full`: no slot left — the form says so instead of failing on submit. Each field has its «?» next to its label (round
 *  52), outside the label: the field is a box, the label names the input by its id. */
export default function CreateUserForm({ roles, full }: { roles: Role[]; full: boolean }) {
  const t = useTranslations('team'), tr = useTranslations('roles'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(createUserAction, initialFormState);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <h2>{t('addTitle')}</h2>
      {full && !state.ok ? <p className="alert alert-warn" role="status">{t('noSeats')}</p> : null}
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {state.ok && state.secret ? <SecretOnce email={state.message} secret={state.secret} /> : null}
      {state.ok && state.pending ? <p className="alert alert-ok" role="status">{t('inviteSent', { email: state.message ?? '', days: TOKEN_TTL_MS.INVITE / 86_400_000 })}</p> : null}
      <div className="form-grid">
        <div className="field">
          <Etichetta htmlFor="cu-name" className="field-label" aiuto={testoAiuto(AIUTO, 'utenti.nome')} nome={t('name')}>{t('name')} *</Etichetta>
          <input id="cu-name" className="input" name="name" maxLength={120} required />
        </div>
        <div className="field">
          <Etichetta htmlFor="cu-email" className="field-label" aiuto={testoAiuto(AIUTO, 'utenti.email')} nome={t('email')}>{t('email')} *</Etichetta>
          <input id="cu-email" className="input" type="email" name="email" maxLength={254} required />
        </div>
        <div className="field">
          <Etichetta htmlFor="cu-role" className="field-label" aiuto={testoAiuto(AIUTO, 'utenti.ruolo')} nome={t('role')}>{t('role')}</Etichetta>
          <select id="cu-role" className="input" name="role" defaultValue="TECHNICIAN">{roles.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select>
        </div>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending || full}>{t('add')}</button></div>
    </form>
  );
}

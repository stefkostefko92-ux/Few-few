'use client';

// «Ordine delle sezioni della scheda» on the company page (rilievi impostazioni.ejs, commit ae6329cb6): «Impianto» first,
// always; the other sections in the company's order, each with «up» and «down». Every button sends the whole order (the
// hidden `ordine` fields) and the server answers with the new order, unsaved — so it works without JavaScript too, as
// in rilievi —; «Salva ordine» saves it, «Ripristina l'ordine predefinito» goes back to the default. The focus stays on
// the button pressed (at the edge, where it is switched off, on the other one), so the keyboard can move a section
// several places in a row, and the status line says where the section is now; after «Salva ordine» or «Ripristina…» it
// goes back to that button, after a refusal to the message (the buttons are off while the server answers, which would
// leave it nowhere). A refusal keeps the order on screen, unsaved moves included. Only for 'company:edit' (the server
// checks again); in read-only mode the order is shown.
import { useActionState, useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SectionKey } from '@/lib/rilievi/fields';
import { ordineSezioniAction, type SezioniState } from '@/server/rilievi/sezioni-actions';
import Icon from '../Icon';

const idle: SezioniState = { status: 'idle' };

export default function SezioniForm({ fisse, ordine: saved, canEdit }: {
  /** the sections always on top («Impianto») */
  fisse: readonly SectionKey[];
  /** the others in the company's saved order */
  ordine: readonly SectionKey[];
  canEdit: boolean;
}) {
  const t = useTranslations('rilievi'), locale = useLocale();
  const [state, action, pending] = useActionState(ordineSezioniAction, idle);
  const ordine = 'ordine' in state && state.ordine ? state.ordine : saved;
  // moves on screen not saved yet: after a move, and after a refusal that kept them
  const modificato = state.status === 'moved' || (state.status === 'error' && 'modificato' in state && state.modificato === true);
  const box = useRef<HTMLDivElement>(null), alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    if (state.status === 'moved') {
      const { key, verso } = state.focus;
      const i = state.ordine.indexOf(key);
      // at the edge the pressed button is switched off: the focus goes to the other one
      const edge = (verso === 'su' && i === 0) || (verso === 'giu' && i === state.ordine.length - 1);
      const to = edge ? (verso === 'su' ? 'giu' : 'su') : verso;
      root.querySelector<HTMLButtonElement>(`button[name="sposta"][value="${key}:${to}"]`)?.focus();
    } else if (state.status === 'saved' || state.status === 'reset') {
      root.querySelector<HTMLButtonElement>(`button[name="${state.status === 'saved' ? 'salva' : 'ripristina'}"]`)?.focus();
    } else if (state.status === 'invalid' || state.status === 'error') alert.current?.focus();
  }, [state]);
  const error = state.status === 'invalid' ? t('impostazioni.error') : state.status === 'error' ? t(`error.${state.error}`) : null;
  const done = state.status === 'saved' ? t('flash.sezioniSaved') : state.status === 'reset' ? t('flash.sezioniReset') : null;
  // where the section moved is now (counting «Impianto»), then that it is not saved
  const where = state.status === 'moved'
    ? t('impostazioni.sezioni.moved', { name: t(`scheda.section.${state.focus.key}`), n: state.ordine.indexOf(state.focus.key) + fisse.length + 1 })
    : null;
  return (
    <div className="rv-order-box" ref={box}>
      {error ? <p className="alert alert-bad" role="alert" tabIndex={-1} ref={alert}>{error}</p> : null}
      {done ? <p className="alert alert-ok" role="status">{done}</p> : null}
      <form action={action} className="rv-order-form">
        <input type="hidden" name="locale" value={locale} />
        <ol className="rv-order" aria-describedby="order-hint">
          {fisse.map((key, i) => (
            <li key={key} className="rv-order-item pinned">
              <span className="rv-secnum" aria-hidden="true">{i + 1}</span>
              <span className="rv-order-name">{t(`scheda.section.${key}`)}</span>
              <span className="rv-order-fixed">{t('impostazioni.sezioni.fixed')}</span>
            </li>
          ))}
          {ordine.map((key, i) => {
            const name = t(`scheda.section.${key}`);
            return (
              <li key={key} className="rv-order-item">
                <input type="hidden" name="ordine" value={key} />
                <span className="rv-secnum" aria-hidden="true">{i + fisse.length + 1}</span>
                <span className="rv-order-name">{name}</span>
                {canEdit ? (
                  <span className="rv-order-moves">
                    <button className="btn btn-icon" type="submit" name="sposta" value={`${key}:su`} aria-label={t('impostazioni.sezioni.up', { name })}
                      disabled={pending || i === 0}><Icon name="arrow-up" size={18} /></button>
                    <button className="btn btn-icon" type="submit" name="sposta" value={`${key}:giu`} aria-label={t('impostazioni.sezioni.down', { name })}
                      disabled={pending || i === ordine.length - 1}><Icon name="arrow-down" size={18} /></button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="note" id="order-hint">{t(canEdit ? 'impostazioni.sezioni.hint' : 'impostazioni.sezioni.readOnly')}</p>
        {canEdit ? (
          <div className="rv-order-bar">
            <button className="btn btn-primary" type="submit" name="salva" value="1" disabled={pending}>{t('impostazioni.sezioni.save')}</button>
            {/* always there, so that what it says is read out as it changes */}
            <span className="rv-order-dirty" role="status">{modificato ? (where ? `${where} ${t('schede.unsaved')}` : t('schede.unsaved')) : null}</span>
          </div>
        ) : null}
      </form>
      {canEdit ? (
        <form action={action} className="rv-order-reset">
          <input type="hidden" name="locale" value={locale} />
          <button className="btn" type="submit" name="ripristina" value="1" disabled={pending}>{t('impostazioni.sezioni.reset')}</button>
        </form>
      ) : null}
    </div>
  );
}

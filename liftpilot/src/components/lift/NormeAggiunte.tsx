'use client';

// The standards added to the acceptance test's base (src/lib/lift/collaudo.ts, norme-collaudo.ts): only those that fit
// it, grouped as the documents present them, with the notes some of them carry. DM 236/1989 has its checks in the
// shaft, for the case chosen there: on the one form the case is set when it is ticked; in «Calcolo argano» the case is
// chosen in the Progetto (`dm236Note`).
import { useTranslations } from 'next-intl';
import type { NormaAggiuntiva } from '@/lib/lift';

/** The standards that can be added, grouped as the documents present them. */
const GROUPS: readonly { key: string; norme: readonly NormaAggiuntiva[] }[] = [
  { key: 'g_en81', norme: ['en81', 'en81-21', 'en81-28', 'en81-58', 'en81-70', 'en81-71', 'en81-72', 'en81-73', 'en81-76', 'en81-77'] },
  { key: 'g_esistenti', norme: ['en81-80', 'en81-82', 'en81-83'] },
  { key: 'g_nazionali', norme: ['dm236', 'antincendio', 'ntc2018'] },
];
const AVVISO: readonly NormaAggiuntiva[] = ['en81-71', 'en81-80', 'antincendio'];

interface Props {
  fits(n: NormaAggiuntiva): boolean;
  added: readonly NormaAggiuntiva[];
  toggle(n: NormaAggiuntiva, on: boolean): void;
  /** under the list when DM 236 is ticked: what is still to choose for it, and where (null: nothing) */
  dm236Note: string | null;
}

export default function NormeAggiunte({ fits, added, toggle, dm236Note }: Props) {
  const t = useTranslations('lift');
  return (
    <fieldset className="parti">
      <legend>{t('aggiuntive_title')}</legend>
      {GROUPS.map((g) => {
        const here = g.norme.filter(fits);
        return here.length ? (
          <div key={g.key} className="norm-group">
            <span className="norm-group-title">{t(g.key)}</span>
            <div className="parti-grid wide">
              {here.map((n) => (
                <label key={n}>
                  <input type="checkbox" checked={added.includes(n)} onChange={(e) => toggle(n, e.target.checked)} />
                  <span>{t(`aggiunta_${n}`)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null;
      })}
      {AVVISO.filter((n) => added.includes(n)).map((n) => <p key={n} className="note bad">{t(`avviso_${n}`)}</p>)}
      <p className="note">{t('aggiuntive_hint')}</p>
      {added.includes('dm236') && dm236Note ? <p className="note bad">{dm236Note}</p> : null}
    </fieldset>
  );
}

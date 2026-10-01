import type { CalcKey, Pres } from '@/lib/present/tr';

const ITEMS: readonly CalcKey[] = ['lg_1', 'lg_2', 'lg_3', 'lg_4', 'lg_5', 'lg_6'];

// Notice and limitation of liability of the prototype v12, always visible above the calculator.
export default function LegalNotice({ P }: { P: Pres }) {
  const { t } = P;
  return (
    <section className="notice" aria-labelledby="lg-title">
      <h2 id="lg-title">{t('lg_title')}</h2>
      <p>{t('lg_short')}</p>
      <details>
        <summary>{t('lg_more')}</summary>
        <ol>{ITEMS.map((k) => <li key={k}>{t(k)}</li>)}</ol>
      </details>
    </section>
  );
}

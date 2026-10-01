// The proposal of a shaft design: the car, its load and persons, the area against the one the load admits, and the
// checks with their values and limits. No state: used by the designer and by the page of a saved design.
import { isUpperLimit, type Layout } from '@/shaft';

export interface ResultTexts {
  t(key: string, values?: Record<string, string | number>): string;
  fmt(x: number, dec?: number): string;
}

export default function ShaftResults({ L, texts }: { L: Layout; texts: ResultTexts }) {
  const { t, fmt } = texts;
  return (
    <div className="shaft-results">
      <dl className="shaft-figures">
        <div><dt>{t('car')}</dt><dd className="num">{fmt(L.A, 0)} × {fmt(L.B, 0)} <small>mm</small></dd></div>
        <div><dt>{t('load')}</dt><dd className="num">{fmt(L.Q, 0)} <small>kg</small></dd></div>
        <div><dt>{t('persons')}</dt><dd className="num">{L.persons}</dd></div>
        <div><dt>{t('area')}</dt><dd className="num small">{t('areaOf', { area: fmt(L.area, 2), max: fmt(L.areaMax, 2) })}</dd></div>
      </dl>
      {!L.fits ? <p className="alert alert-bad" role="status">{t('notFit')}</p> : null}
      <table className="data-table shaft-checks">
        <caption className="sr-only">{t('checks')}</caption>
        <tbody>
          {L.checks.map((c) => {
            const unit = c.unit ? ` ${c.unit}` : '';
            const limit = c.limit === null ? '' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`;
            return (
              <tr key={c.id}>
                <th scope="row">{t(`c_${c.id}`)}</th>
                <td className="num">{c.value === null ? '—' : `${fmt(c.value, c.dec)}${unit}`}</td>
                <td className="num note">{limit}</td>
                <td><span className={`status-pill ${c.status}`}>{t(`st_${c.status}`)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

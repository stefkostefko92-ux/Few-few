import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { ModuloLink } from '@/lib/collega/moduli';
import type { Passi as Stati, StatoPasso } from '@/lib/collega/passi';
import Icon from '@/components/Icon';

export interface Passo {
  key: 'rilievo' | 'calcolo' | 'progetto' | 'documenti';
  /** the page of the step's record, or of the form that makes it; none when the role may not open it */
  href: string | null;
  /** what the step is for this installation (a replacement's «Progetto» is its machine room) */
  sub?: string;
}

// The way of an installation (round 44): 1 Rilievo → 2 Calcolo argano → 3 Progetto → 4 Documenti e ordini, drawn as the
// buttons of a car's panel — a floor reached lights its ring (fatto), one to update or with differences glows amber or
// red, one still to do stays dark. Each opens its page; under «Documenti e ordini» the supplier modules of the
// reference survey. The states come from the records (src/lib/collega/passi.ts).
export default async function Passi({ stati, passi, moduli, schedaId }: { stati: Stati; passi: readonly Passo[]; moduli: readonly ModuloLink[]; schedaId: string | null }) {
  const t = await getTranslations('collega.passi');
  const tone = (s: StatoPasso): string => (s === 'fatto' ? 'ok' : s === 'differenze' ? 'fail' : s === 'daAggiornare' ? 'warn' : 'off');
  return (
    <nav className="lk-steps-wrap" aria-label={t('label')}>
      <ol className="lk-steps">
        {passi.map((p, i) => {
          const s = stati[p.key], body = (
            <>
              <span className={`lk-btn ${tone(s)}`} aria-hidden="true">{i + 1}</span>
              <span className="lk-step-text">
                <strong>{t(p.key)}</strong>
                {p.sub ? <span className="note">{p.sub}</span> : null}
                <span className={`lk-step-state ${tone(s)}`}>{t(`stato.${s}`)}</span>
              </span>
            </>
          );
          return (
            <li key={p.key} className={`lk-step ${tone(s)}`} aria-current={s !== 'fatto' && passi.slice(0, i).every((q) => stati[q.key] === 'fatto') ? 'step' : undefined}>
              {p.href ? <Link href={p.href} className="lk-step-link">{body}</Link> : <div className="lk-step-link">{body}</div>}
              {p.key === 'documenti' && moduli.length && schedaId ? (
                <ul className="lk-moduli" aria-label={t('moduli')}>
                  {moduli.map((m) => (
                    <li key={m.path}><a href={`/api/rilievi/${schedaId}/${m.path}`}><Icon name="download" size={14} />{m.nome}</a></li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

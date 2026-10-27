'use client';

// The HEB beams on the shaft's walls under the machine's support (src/shaft/heb.ts, registry locale.putrelle.vano): put
// when the slab between the room and the shaft has no structural check; the software takes the shortest that pass its
// checks, then the lightest — the easiest to carry into the room, with the machine turned too — or one of the six is
// taken by hand, each shown with its length and how it does. Shared by a whole design and a replacement's survey. Round
// 52: the switch with its «?», and the choice's beside the note under the list.
import { useLocale, useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { hebChecks, onHeb, type HebOption, type HebTaken, type RoomInputs } from '@/shaft';
import { ConAiuto } from './Campo';

interface Props {
  R: RoomInputs;
  put(patch: Partial<RoomInputs>): void;
  /** the beams as the derivation weighed them (null: not yet worked out) */
  heb: HebTaken | null | undefined;
  /** the machine has a diverting pulley (the support it stands on without a choice) */
  deflector: boolean;
}

const WHY = { m_heb: 'sigma', m_hebf: 'f', m_hebfeet: 'feet', m_hebrope: 'rope', m_hebkerb: 'kerb', m_hebwall: 'wall' } as const;
const isWhy = (id: string): id is keyof typeof WHY => Object.hasOwn(WHY, id);
const keyOf = (o: Pick<HebOption, 'dir' | 'profile'>): string => `${o.dir}:${o.profile}`;

export default function HebFields({ R, put, heb, deflector }: Props) {
  const t = useTranslations('shaft'), locale = useLocale(), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const on = !!R.heb, set = R.heb, chosen = set?.profile && set.dir ? keyOf({ dir: set.dir, profile: set.profile }) : '';
  const name = (o: HebOption): string => t('heb_option', { profile: o.profile, way: t(`heb_way_${o.dir}`), length: fmt(Math.round(o.length), 0) });
  const verdict = (o: HebOption): string => {
    const why = hebChecks(o.result).filter((c) => c.status !== 'ok').map((c) => c.id).filter(isWhy).map((id) => t(`heb_why_${WHY[id]}`));
    return why.length ? t('heb_ko', { why: why.join(', ') }) : t('heb_ok');
  };
  const pick = (v: string): void => {
    const o = heb?.options.find((x) => keyOf(x) === v);
    put({ heb: o ? { profile: o.profile, dir: o.dir } : {} });
  };
  const best = heb?.options.find((o) => o.ok) ?? null;
  return (
    <fieldset className="field heb-fields">
      <ConAiuto aiuto={testoAiuto(AIUTO, 'heb_on')} nome={t('heb_title')}>
        <label className="check">
          <input type="checkbox" id="heb-on" checked={on} onChange={(e) => put({ heb: e.target.checked ? {} : undefined })} />
          <span>{t('heb_on')}</span>
        </label>
      </ConAiuto>
      {on && !onHeb(R, deflector) ? <p className="note">{t('heb_not')}</p> : null}
      {on && onHeb(R, deflector) ? (heb ? (
        <div className="heb-list" role="radiogroup" aria-label={t('heb_title')}>
          <label className="check">
            <input type="radio" name="heb-option" value="" checked={chosen === ''} onChange={() => pick('')} />
            <span>{best ? t('heb_auto', { choice: name(best) }) : t('heb_auto_none', { choice: name(heb.chosen) })}</span>
          </label>
          {heb.options.map((o) => (
            <label className="check" key={keyOf(o)}>
              <input type="radio" name="heb-option" value={keyOf(o)} checked={chosen === keyOf(o)} onChange={() => pick(keyOf(o))} />
              <span>{name(o)} <span className={`status-pill ${o.ok ? 'ok' : 'fail'}`}>{verdict(o)}</span></span>
            </label>
          ))}
        </div>
      ) : <p className="note">{t('heb_wait')}</p>) : null}
      {on ? <p className="note"><ConAiuto aiuto={testoAiuto(AIUTO, 'heb_list')} nome={t('heb_title')}>{t('heb_hint')}</ConAiuto></p> : null}
    </fieldset>
  );
}

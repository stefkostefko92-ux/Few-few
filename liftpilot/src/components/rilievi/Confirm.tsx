// A confirmation before a sheet leaves (rilievi confirm.ejs): to the trash (`trash`) or for good (`purge`). The sheet
// is named — its title, its address and day — and the one button does it; «Annulla» goes back to the sheet.
import { Link } from '@/i18n/routing';
import { fmt } from '@/lib/rilievi/fmt';
import { schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { purgeRilievoAction, trashRilievoAction } from '@/server/rilievi/actions';
import type { SchedaFull } from '@/server/rilievi/queries';
import ActionButton from './ActionButton';

export default function Confirm({ mode, scheda, t }: { mode: 'trash' | 'purge'; scheda: SchedaFull; t: RilieviT }) {
  const purge = mode === 'purge';
  return (
    <div className="panel rv-confirm">
      <p className="rv-ident">{schedaTitle(scheda, t)}</p>
      <p className="note">{[scheda.indirizzo, fmt.day(scheda.data)].filter(Boolean).join(' ')}</p>
      <div className="rv-row">
        <ActionButton action={purge ? purgeRilievoAction : trashRilievoAction} id={scheda.id} icon="trash-2" variant="btn btn-danger"
          label={t(purge ? 'trash.purgeConfirm' : 'schede.delete.confirm')} />
        <Link className="btn" href={`/app/rilievi/${scheda.id}`}>{t('common.cancel')}</Link>
      </div>
    </div>
  );
}

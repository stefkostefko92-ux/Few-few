import { getTranslations } from 'next-intl/server';
import SectionTitle from '@/components/project/SectionTitle';
import type { SessionUser } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import { ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import { makeFmt } from '@/lib/present/tr';
import { can } from '@/lib/rbac';
import { listAttachments } from '@/server/allegati/queries';
import { usage } from '@/server/allegati/quota';
import AllegatiList, { type AllegatoListRow } from './AllegatiList';
import AllegatoUpload, { type UploadPreset } from './AllegatoUpload';
import { allegatiOptions, labelOf } from './options';

// The documents uploaded for an installation (round 49, plan §7 card 4): what they are for and what happens to a photo's
// metadata, the upload (whoever edits the installation's data, not on an archived one), the space used, the list with
// download, edit and delete. Every text and number is written here, on the server (makeFmt, dates of Italy): the client
// parts only show them. The workspace of the relazione tecnica (S7) places it and adds the expected documents.

const MB = 1024 * 1024;

/** «850 KB», «1,4 MB», «500 MB»: the sizes as the limits and the errors say them (1 MB = 1024 KB). */
export function sizeLabel(bytes: number, fmt = makeFmt('it')): string {
  if (bytes < MB) return `${fmt(bytes === 0 ? 0 : Math.max(1, Math.round(bytes / 1024)), 0)} KB`;
  return `${fmt(bytes / MB, bytes < 10 * MB ? 1 : 0)} MB`;
}

export default async function AllegatiPanel({ user, projectId, live, locale, preset, headingId = 'sec-allegati' }: {
  user: SessionUser; projectId: string; live: boolean; locale: string; preset?: UploadPreset; headingId?: string;
}) {
  const [t, rows, used, options] = await Promise.all([getTranslations('allegati'), listAttachments(user, projectId), usage(user.companyId, projectId), allegatiOptions()]);
  const canEdit = live && can(user, 'projects:edit'), canDownload = can(user, 'report:download');
  const fd = dateFormat(locale), fmt = makeFmt('it');
  const list: AllegatoListRow[] = rows.map((r) => ({
    id: r.id, title: r.title, fileName: r.fileName, kind: r.kind, kindLabel: labelOf(options.kinds, r.kind), component: r.component,
    componentLabel: labelOf(options.components, r.component), pages: t('pages', { n: r.pages }), size: sizeLabel(r.size, fmt), sha256: r.sha256,
    by: r.createdBy ? t('byOn', { name: r.createdBy, date: fd.dateTime(new Date(r.createdAt)) }) : t('byNobody', { date: fd.dateTime(new Date(r.createdAt)) }),
    inUse: r.inUse > 0,
  }));
  return (
    <section className="panel flex flex-col gap-4" aria-labelledby={headingId} data-allegati="panel">
      <SectionTitle id={headingId} icon="file-stack">{t('title')}</SectionTitle>
      <p className="note">{t('lead')}</p>
      {canEdit ? (
        <>
          <p className="note">{t('privacy')}</p>
          <AllegatoUpload projectId={projectId} kinds={options.kinds} components={options.components} preset={preset} />
        </>
      ) : <p className="note">{t('readOnly')}</p>}
      <div className="flex flex-col gap-1" aria-label={t('quotaTitle')} role="group">
        <span className="note">{t('quotaFiles', { n: used.files, max: ALLEGATI_LIMITS.perProject })}</span>
        <progress className="w-full max-w-md" value={used.files} max={ALLEGATI_LIMITS.perProject} aria-label={t('quotaFiles', { n: used.files, max: ALLEGATI_LIMITS.perProject })} />
        <span className="note">{t('quotaBytes', { used: sizeLabel(used.bytes, fmt), max: sizeLabel(ALLEGATI_LIMITS.perCompanyBytes, fmt) })}</span>
        <progress className="w-full max-w-md" value={used.bytes} max={ALLEGATI_LIMITS.perCompanyBytes} aria-label={t('quotaBytes', { used: sizeLabel(used.bytes, fmt), max: sizeLabel(ALLEGATI_LIMITS.perCompanyBytes, fmt) })} />
      </div>
      <AllegatiList rows={list} kinds={options.kinds} components={options.components} canEdit={canEdit} canDownload={canDownload} />
    </section>
  );
}

'use client';

// The files of an installation (round 49): title and uploaded name, kind, section, pages, size, the first 12 characters
// of the SHA-256 (the whole one on hover and for the screen reader), who uploaded it and when — all written by the server
// (AllegatiPanel), nothing formatted here. Download for whoever downloads the documents; title, kind and section edited
// in place and the file deleted (after a confirmation) for whoever edits the installation. A file an issued relazione
// lists cannot be deleted: the button says why instead.
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import type { AllegatoKind, Componente } from '@/lib/allegati/kinds';
import { deleteAttachmentAction, updateAttachmentAction } from '@/server/allegati/actions';
import type { Option } from './options';

export interface AllegatoListRow {
  id: string;
  title: string;
  fileName: string;
  kind: AllegatoKind;
  kindLabel: string;
  component: Componente | null;
  componentLabel: string;
  pages: string;
  size: string;
  sha256: string;
  by: string;
  inUse: boolean;
}

function EditRow({ row, kinds, components, onDone }: { row: AllegatoListRow; kinds: readonly Option<AllegatoKind>[]; components: readonly Option<Componente>[]; onDone: (text: string | null, ok: boolean) => void }) {
  const t = useTranslations('allegati'), te = useTranslations('errors');
  const [title, setTitle] = useState(row.title), [kind, setKind] = useState<string>(row.kind), [component, setComponent] = useState<string>(row.component ?? '');
  const [pending, start] = useTransition();
  const save = (): void => start(async () => {
    const r = await updateAttachmentAction({ id: row.id, title, kind, component: component || null });
    onDone(r.ok ? t('saved') : te(r.error), r.ok);
  });
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label={t('editOf', { title: row.title })}>
      <label className="field"><span>{t('titleField')}</span><input className="input" value={title} maxLength={160} required onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>{t('kind')}</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
      </label>
      <label className="field"><span>{t('component')}</span>
        <select className="input" value={component} onChange={(e) => setComponent(e.target.value)}>
          <option value="">{t('componentNone')}</option>
          {components.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t('save')}</button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => onDone(null, true)}>{t('cancel')}</button>
      </div>
    </form>
  );
}

export default function AllegatiList({ rows, kinds, components, canEdit, canDownload }: {
  rows: readonly AllegatoListRow[]; kinds: readonly Option<AllegatoKind>[]; components: readonly Option<Componente>[]; canEdit: boolean; canDownload: boolean;
}) {
  const t = useTranslations('allegati'), te = useTranslations('errors'), router = useRouter();
  const [editing, setEditing] = useState<string | null>(null), [confirming, setConfirming] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (rows.length === 0) return <p className="note">{t('empty')}</p>;
  const remove = (row: AllegatoListRow): void => start(async () => {
    const r = await deleteAttachmentAction(row.id);
    setConfirming(null);
    setMsg({ ok: r.ok, text: r.ok ? t('deleted') : te(r.error) });
    if (r.ok) router.refresh();
  });
  return (
    <div className="flex flex-col gap-2" data-allegati="list">
      {msg ? <p className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      <div className="table-panel">
        <table className="data-table stack">
          <caption className="sr-only">{t('listCaption')}</caption>
          <thead>
            <tr>
              <th>{t('col_doc')}</th><th>{t('col_kind')}</th><th>{t('col_component')}</th><th>{t('col_pages')}</th><th>{t('col_size')}</th>
              <th>{t('col_sha')}</th><th>{t('col_by')}</th>{canDownload || canEdit ? <th>{t('col_actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-allegato={r.id}>
                <td className="row-title"><span className="font-semibold">{r.title}</span><div className="note">{r.fileName}</div></td>
                <td data-label={t('col_kind')}>{r.kindLabel}</td>
                <td data-label={t('col_component')}>{r.componentLabel}</td>
                <td data-label={t('col_pages')} className="num">{r.pages}</td>
                <td data-label={t('col_size')} className="num">{r.size}</td>
                <td data-label={t('col_sha')}><span className="mono" title={r.sha256} aria-label={t('shaFull', { sha: r.sha256 })}>{r.sha256.slice(0, 12)}</span></td>
                <td data-label={t('col_by')}>{r.by}</td>
                {canDownload || canEdit ? (
                  <td data-label={t('col_actions')}>
                    {editing === r.id ? (
                      <EditRow row={r} kinds={kinds} components={components} onDone={(text, ok) => { setEditing(null); if (text) { setMsg({ ok, text }); if (ok) router.refresh(); } }} />
                    ) : confirming === r.id ? (
                      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('deleteOf', { title: r.title })}>
                        <span className="note">{t('deleteConfirm', { title: r.title })}</span>
                        <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => remove(r)}>{t('deleteYes')}</button>
                        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setConfirming(null)}>{t('cancel')}</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {canDownload ? <a className="btn btn-sm" href={`/api/allegati/${r.id}`} download aria-label={t('downloadOf', { title: r.title })}>{t('download')}</a> : null}
                        {canEdit ? <button type="button" className="btn btn-sm" aria-label={t('editOf', { title: r.title })} onClick={() => { setMsg(null); setEditing(r.id); }}>{t('edit')}</button> : null}
                        {canEdit && !r.inUse ? <button type="button" className="btn btn-sm btn-ghost" aria-label={t('deleteOf', { title: r.title })} onClick={() => { setMsg(null); setConfirming(r.id); }}>{t('delete')}</button> : null}
                        {canEdit && r.inUse ? <span className="note">{t('inUse')}</span> : null}
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

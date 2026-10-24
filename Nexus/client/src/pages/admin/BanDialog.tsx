import React, { useState } from 'react';
import { Trans } from 'react-i18next';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { Field, Modal, errMsg, useAdminT } from './ui';

export const DURATIONS = [0, 3_600_000, 86_400_000, 604_800_000, 2_592_000_000];

/**
 * Бан на акаунт (DSA чл. 17 — причината се показва на банатия на екрана за
 * бан). Постоянният бан е необратим на практика → изисква да се напише
 * потребителското име. IP/устройство са по избор; сървърът сам пази
 * loopback/частни/админски адреси (виж `skipped` в отговора).
 */
export default function BanDialog({ user, onClose, onDone }: { user: { id: number; username: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState(86_400_000);
  const [banIp, setBanIp] = useState(true);
  const [banDevice, setBanDevice] = useState(true);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const permanent = duration === 0;
  const ok = reason.trim().length >= 3 && (!permanent || typed === user.username);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/moderation/ban', { userId: user.id, reason: reason.trim(), durationMs: duration || undefined, banIp, banDevice });
      const shielded = (banIp && r.skipped?.ip) || (banDevice && r.skipped?.device);
      toast(t(shielded ? 'moderation.bannedShielded' : 'moderation.banned', { name: user.username }), 'success');
      onDone();
    } catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      danger
      title={t('moderation.banConfirmTitle', { name: user.username })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" form="adm-ban-form" className="btn btn-danger" disabled={!ok || busy}>{t('users.ban')}</button>
        </>
      )}
    >
      <form id="adm-ban-form" className="adm-form" onSubmit={submit}>
        <p className="adm-confirm-body">{t('moderation.banConfirmBody')}</p>
        <Field label={t('common.reason')} hint={t('confirm.reasonHint', { min: 3 })} wide>
          {(id) => <textarea id={id} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus />}
        </Field>
        <Field label={t('moderation.duration')} wide>
          {(id) => (
            <select id={id} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((ms) => <option key={ms} value={ms}>{t(`moderation.durations.${ms}`)}</option>)}
            </select>
          )}
        </Field>
        <label className="adm-check"><input type="checkbox" checked={banIp} onChange={(e) => setBanIp(e.target.checked)} /> {t('moderation.banIp')}</label>
        <label className="adm-check"><input type="checkbox" checked={banDevice} onChange={(e) => setBanDevice(e.target.checked)} /> {t('moderation.banDevice')}</label>
        {permanent && (
          <Field label={t('confirm.irreversible')} hint={<Trans t={t} i18nKey="confirm.typeToConfirm" values={{ word: user.username }} components={{ 1: <code /> }} />} wide>
            {(id) => <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={!!typed && typed !== user.username} />}
          </Field>
        )}
      </form>
    </Modal>
  );
}

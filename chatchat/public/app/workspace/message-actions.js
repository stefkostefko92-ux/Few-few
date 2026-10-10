// Действията върху съобщение: реакция, редакция (до 15 мин. от автора), меко триене (авторът или
// OWNER на канала/групата), копиране на връзка. Правилата са на сървъра — тук се решава само кое
// копче да се покаже; отказът му се показва с ясен текст.

import { announce, confirmAction } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { emit, state } from '../store.js';
import { wsApi } from './api.js';
import { findMessage, upsertMessage, ws } from './model.js';

export const EDIT_WINDOW_MS = 15 * 60 * 1000;

const touch = (convId, m) => {
  upsertMessage(convId, m);
  emit(`ws:msgs:${convId}`);
};

export const isMine = (m) => m.sender?.id === state.user?.id;

export function canEdit(m, now = Date.now()) {
  return (
    isMine(m) &&
    !m.deleted &&
    m.kind !== 'SYSTEM' &&
    m.kind !== 'AI' &&
    now - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS
  );
}

export function canDelete(m, conv) {
  if (m.deleted || m.kind === 'SYSTEM') return false;
  return isMine(m) || (conv?.role === 'OWNER' && conv?.type !== 'DIRECT');
}

/** → текст на грешка или null при успех. */
export async function toggleReaction(convId, m, reaction, on) {
  try {
    const { message } = await wsApi.react(m.id, reaction, on);
    touch(convId, message);
    return null;
  } catch (err) {
    return errorText(err);
  }
}

export async function saveEdit(convId, m, text) {
  try {
    const { message } = await wsApi.edit(m.id, text);
    touch(convId, message);
    announce(t('msg.edited'));
    return null;
  } catch (err) {
    return errorText(err);
  }
}

export async function removeMessage(convId, m) {
  const yes = await confirmAction({
    title: t('msg.delete.title'),
    text: t('msg.delete.text'),
    confirmLabel: t('msg.delete.confirm'),
    cancelLabel: t('common.cancel'),
  });
  if (!yes) return null;
  try {
    await wsApi.remove(m.id);
    const current = findMessage(convId, m.id) ?? m;
    touch(convId, { ...current, deleted: true, body: null, reactions: [] });
    announce(t('msg.deleted'));
    return null;
  } catch (err) {
    return errorText(err);
  }
}

/** Връзка към съобщението във фрагмента (не стига до сървъра): `/#c=<разговор>&m=<съобщение>`. */
export async function copyLink(convId, m) {
  const url = `${location.origin}/#c=${encodeURIComponent(convId)}&m=${encodeURIComponent(m.id)}`;
  try {
    await navigator.clipboard.writeText(url);
    announce(t('msg.linkCopied'));
    return true;
  } catch {
    return false;
  }
}

export const conversationOf = (convId) => ws.convs.get(convId);

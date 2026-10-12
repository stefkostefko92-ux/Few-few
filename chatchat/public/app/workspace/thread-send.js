// Изпращането от нишката: оптимистично и идемпотентно (clientMessageId) — при грешка или
// прекъсване повторният опит ползва СЪЩИЯ ключ и СЪЩИТЕ файлове, сървърът връща записаното,
// дубликат няма (AC-12). Файловете вече са качени и проверени (conv-files.js); тук само се
// привързват с `attachmentIds`.

import { announce } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { emit, state } from '../store.js';
import { wsApi } from './api.js';
import { upsertConversation, upsertMessage } from './model.js';

/**
 * @param {{ convId: string, render: (opts?: { stick?: boolean }) => void }} opts
 */
export function createSender({ convId, render }) {
  /** Локално изпратените, още непотвърдени съобщения. */
  let pending = [];

  async function deliver(local) {
    local.pending = 'sending';
    render({ stick: true });
    try {
      const { message } = await wsApi.post(convId, {
        text: local.body,
        clientMessageId: local.clientMessageId,
        ...(local.replyToId ? { replyToId: local.replyToId } : {}),
        ...(local.attachments.length ? { attachmentIds: local.attachments.map((a) => a.id) } : {}),
      });
      upsertMessage(convId, message);
      pending = pending.filter((p) => p !== local);
      if (!message.replyToId) {
        upsertConversation({
          id: convId,
          lastMessage: {
            id: message.id,
            sender: message.sender,
            preview: String(message.body ?? '').slice(0, 140),
            deleted: false,
            createdAt: message.createdAt,
          },
          lastActivityAt: message.createdAt,
        });
        emit('ws:convs');
      }
      render({ stick: true });
    } catch (err) {
      local.pending = 'failed';
      // 4xx (напр. член вече не е, отказ) не се оправя с повтор; мрежа/5xx — да.
      local.error = errorText(err);
      render({ stick: true });
      announce(`${t('msg.failed')} ${local.error}`);
    }
  }

  return {
    /** Локалните, които още не са дошли от сървъра (по clientMessageId) и са в тази нишка. */
    visible: (have, threadRoot) =>
      pending.filter((p) => !have.has(p.clientMessageId) && (p.replyToId ?? null) === threadRoot),
    send: async (text, files, threadRoot) => {
      const cmid = crypto.randomUUID();
      const local = {
        id: `local-${cmid}`,
        clientMessageId: cmid,
        conversationId: convId,
        kind: 'HUMAN',
        sender: { id: state.user.id, name: state.user.name },
        body: text,
        attachments: files ?? [],
        createdAt: new Date().toISOString(),
        replyToId: threadRoot,
        reactions: [],
        deleted: false,
        pending: 'sending',
        retry: () => void deliver(local),
        discard: () => {
          pending = pending.filter((p) => p !== local);
          render();
        },
      };
      pending.push(local);
      await deliver(local);
    },
  };
}

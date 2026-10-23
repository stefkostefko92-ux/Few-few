import "server-only";
import type { PushPayload, PushResult, PushTopic } from "@/lib/push";

// Изпращането на известия (VAPID + криптиране по RFC 8291). Докато не е
// реализирано и настроено (VAPID ключовете на сървъра), връща configured:false
// и нищо не се отбелязва като изпратено.
export async function sendToTopic(topic: PushTopic, payload: PushPayload): Promise<PushResult> {
  void topic;
  void payload;
  return { configured: false, sent: 0, failed: 0 };
}

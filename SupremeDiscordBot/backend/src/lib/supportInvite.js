// backend/src/lib/supportInvite.js
// Поканата към сървъра за поддръжка — едно определение за целия продукт.
//
// Публичният адрес е `/support` (routes/support.js): ботът, таблото, сайтът и
// llms.txt сочат към него, а той пренасочва към поканата от базата. Така смяната
// на поканата е едно действие в конзолата, не нов билд на три пакета.
//
// ДВЕ ЗАЩИТИ, и двете са тук:
//   1. `parseInviteUrl` — цел на пренасочването може да бъде САМО покана в Discord.
//      Прилага се при запис И при четене: подправен ред в базата не превръща
//      `/support` в отворено пренасочване към чужд сайт.
//   2. `checkInvite` — преди запис питаме Discord дали поканата съществува и дали е
//      безсрочна. Предишната покана умря точно така: беше със срок.
import axios from "axios";
import { getPlatformSetting, setPlatformSetting } from "./platformSettings.js";

export const SUPPORT_INVITE_KEY = "support.inviteUrl";
/** Накъде води `/support`, докато няма зададена покана — ръководствата на нашия сайт. */
export const SUPPORT_FALLBACK_PATH = "/docs";

// Само двете официални форми. Кодът е с ограничена азбука (същата като в discord.js),
// затова влиза в адреса към Discord и в `Location` без нищо за екраниране.
const INVITE_RE = /^(?:https:\/\/)?(?:discord\.gg|discord\.com\/invite)\/([A-Za-z0-9_-]{2,64})\/?$/i;

/**
 * @returns {{ok:true, code:string, url:string} | {ok:false}} `url` е винаги във
 *          формата `https://discord.gg/<код>` — една форма в базата и в одита.
 */
export function parseInviteUrl(input) {
  if (typeof input !== "string") return { ok: false };
  const m = INVITE_RE.exec(input.trim());
  if (!m) return { ok: false };
  return { ok: true, code: m[1], url: `https://discord.gg/${m[1]}` };
}

/**
 * Пита Discord за поканата. Без токен — маршрутът е публичен.
 * @returns {Promise<{ok:true, server:{id:string,name:string,members:number|null}} | {ok:false, code:string}>}
 */
export async function checkInvite(code) {
  let res;
  try {
    res = await axios.get(
      `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`,
      { timeout: 8000, validateStatus: () => true },
    );
  } catch {
    return { ok: false, code: "INVITE_CHECK_UNAVAILABLE" };
  }
  if (res.status === 404) return { ok: false, code: "INVITE_NOT_FOUND" };
  if (res.status !== 200 || !res.data || typeof res.data !== "object") return { ok: false, code: "INVITE_CHECK_UNAVAILABLE" };
  const d = res.data;
  // type 0 = покана към сървър; 1 = групов чат; 2 = покана за приятелство.
  if (!d.guild?.id || (d.type !== undefined && d.type !== 0)) return { ok: false, code: "INVITE_NOT_A_SERVER" };
  if (d.expires_at) return { ok: false, code: "INVITE_TEMPORARY" };
  return {
    ok: true,
    server: {
      id: String(d.guild.id),
      name: String(d.guild.name || ""),
      members: Number.isFinite(d.approximate_member_count) ? d.approximate_member_count : null,
    },
  };
}

/** Зададената покана (проверена по форма) или null. Не хвърля. */
export async function getSupportInviteUrl() {
  const parsed = parseInviteUrl(await getPlatformSetting(SUPPORT_INVITE_KEY));
  return parsed.ok ? parsed.url : null;
}

/** Записва (вече проверена) покана или я маха с null. */
export async function setSupportInviteUrl(url) {
  return setPlatformSetting(SUPPORT_INVITE_KEY, url);
}

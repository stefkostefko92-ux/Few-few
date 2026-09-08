/**
 * Открива българските GTA V / FiveM RP стриймъри и обновява живия им статус.
 * Пуска се по cron, НИКОГА при заявка на посетител.
 *
 *   npm run streamers:discover -- twitch kick
 *   npm run streamers:discover -- youtube
 *
 * Платформите се подават като аргументи, защото квотите им са различни с
 * порядъци: Twitch и Kick са евтини и вървят на 10 минути, YouTube струва 100
 * единици на заявка при 10 000 на ден и върви на 2 часа (виж `docker-compose.yml`).
 *
 * ТУК СЕ ПИШАТ ЛИЧНИ ДАННИ (име и канал на физическо лице). Три правила, които
 * не са козметични:
 *  1. `status = REJECTED` НИКОГА не се променя оттук. Това е записаното
 *     възражение по чл. 21 ОРЗД; без това условие следващият пробег връща
 *     човека обратно до час и „свалихме те“ става лъжа.
 *  2. Публично автоматично влиза само това, което ПЛАТФОРМАТА е обявила за
 *     българско (Twitch `language=bg`, Kick `language`). Останалото чака човек.
 *  3. Който не е в текущата партида, губи `live` — иначе страницата показва
 *     „на живо“ за предаване, свършило преди два дни.
 */

import { PrismaClient } from '@prisma/client';

import { DISCOVERY, type FoundStream } from '../src/lib/streamers-query';
import {
  channelKey,
  isStreamPlatform,
  STREAM_PLATFORMS,
  type StreamPlatformId,
} from '../src/lib/streamers';

const prisma = new PrismaClient();

/** Платформите, които изобщо се откриват автоматично. TikTok е само ръчен. */
const AUTOMATIC = ['twitch', 'kick', 'youtube'] as const;

function requested(argv: string[]): string[] {
  const asked = argv.map((value) => value.trim().toLowerCase()).filter(Boolean);
  const known = asked.filter((name) => name in DISCOVERY);
  const unknown = asked.filter((name) => !(name in DISCOVERY));
  for (const name of unknown) console.error(`[streamers] непозната платформа: ${name}`);
  return known.length > 0 ? known : [...AUTOMATIC];
}

async function upsert(found: FoundStream, now: Date): Promise<'created' | 'updated' | 'blocked'> {
  // Търсенето е по `channelKey` (малки букви): разлика само в регистъра НЕ бива
  // да прави нов ред, иначе свален по чл. 21 канал се връща под друго изписване.
  const key = { platform: found.platform, channelKey: channelKey(found.channel) };
  const where = { platform_channelKey: key };
  const existing = await prisma.streamer.findUnique({
    where,
    select: { id: true, status: true, streamTitle: true },
  });

  // Възразилият остава свален и НИЩО не се записва по него — нито времето на
  // последно виждане. Заглушаващият запис е платформа + канал; всяко поле
  // отгоре е обработване, което чл. 21, ал. 3 изисква да е прекратено.
  if (existing?.status === 'REJECTED') return 'blocked';

  const live = {
    displayName: found.displayName,
    profileUrl: found.profileUrl,
    language: found.language,
    live: true,
    viewers: found.viewers,
    streamTitle: found.streamTitle,
    lastLiveAt: now,
    lastSeenAt: now,
  };

  if (existing) {
    /**
     * Статусът НЕ се пипа при обновяване: веднъж преценен от човек, остава.
     * `reviewedAt` обаче се НУЛИРА при СМЯНА на заглавието — и това е защитата,
     * не козметика.
     *
     * Гейтът „чуждият свободен текст излиза само след човешки преглед“ чете
     * `reviewedAt`. Ако само се вдига и никога не пада, човек одобрява веднъж, а
     * стриймърът след това сменя заглавието на каквото си иска и то излиза под
     * нашия домейн до 10 минути, без никой да го е видял. Тоест контролът върху
     * това какво публикуваме преминава изцяло у чуждо лице.
     *
     * Нулира се САМО при промяна: иначе всеки пробег на 10 минути би връщал в
     * опашка канали, по които нищо не се е случило.
     */
    const titleChanged = existing.streamTitle !== found.streamTitle;
    // Записът е УСЛОВЕН (`updateMany` с `status: not REJECTED`), не безусловен:
    // между четенето горе и записа тук панелът може да е свалил канала по
    // чл. 21, а безусловният `update` щеше да върне името, адреса и езика му.
    const touched = await prisma.streamer.updateMany({
      where: { ...key, status: { not: 'REJECTED' } },
      data: titleChanged ? { ...live, reviewedAt: null } : live,
    });
    return touched.count === 0 ? 'blocked' : 'updated';
  }

  await prisma.streamer.create({
    data: {
      ...key,
      channel: found.channel,
      status: found.declaredBulgarian ? 'APPROVED' : 'PENDING',
      manual: false,
      ...live,
    },
  });
  return 'created';
}

async function main() {
  const platforms = requested(process.argv.slice(2));
  let created = 0;
  let updated = 0;
  let blocked = 0;

  for (const name of platforms) {
    const found = await DISCOVERY[name]();
    const platform = name.toUpperCase();
    if (!isStreamPlatform(platform)) continue;

    if (found.length === 0) {
      // Нула резултата е двусмислено: или няма кой да излъчва в момента, или
      // ключът липсва/договорът е счупен. Гаси се `live` само когато знаем, че
      // сме питали успешно — иначе счупен ключ би „изгасил“ цялата секция.
      console.log(`[streamers] ${name}: нула живи излъчвания (или липсващ ключ)`);
      continue;
    }

    for (const stream of found) {
      const result = await upsert(stream, new Date());
      if (result === 'created') created += 1;
      else if (result === 'updated') updated += 1;
      else blocked += 1;
    }

    // Всичко от тази платформа, което не е в партидата, слиза от „на живо“.
    const seen = found.map((stream) => channelKey(stream.channel));
    const offline = await prisma.streamer.updateMany({
      where: { platform: platform as StreamPlatformId, live: true, channelKey: { notIn: seen } },
      data: { live: false, viewers: 0, streamTitle: null },
    });

    console.log(
      `[streamers] ${name}: ${found.length} живи · ${offline.count} слязоха от ефир`,
    );
  }

  console.log(
    `Стриймъри: ${created} нови · ${updated} обновени · ${blocked} блокирани (възражение). ` +
      `Платформи: ${platforms.join(', ')} от ${STREAM_PLATFORMS.length} общо (TikTok е само ръчен).`,
  );
}

main()
  .catch((error) => {
    console.error('Откриването на стриймъри се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

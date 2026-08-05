import { parseIp, type ParsedIp } from "./ip";

/**
 * Кой е адресът на посетителя — въпросът, който този продукт задава сам на себе
 * си, и точно затова трябва да е отговорен правилно.
 *
 * `X-Forwarded-For` е обикновено заглавие: всеки може да си напише каквото
 * поиска в него. Обратното прокси го ДОПИСВА отдясно, значи истината е винаги
 * в ДЯСНАТА част на списъка — толкова записа отдясно, колкото прокситата са
 * наши. Наивното „вземи първия отляво“ позволява на всеки да си избере IP,
 * с което да отрови и логовете, и ограничението на честотата.
 *
 * Чиста функция без Next и без мрежа — заради това е и тествана.
 */

export interface ClientIpOptions {
  /**
   * Колко ДОВЕРЕНИ прокси-та стоят пред приложението (нашият Nginx = 1).
   * Всяко от тях е добавило по един запис отдясно.
   */
  trustedHops: number;
  /**
   * Доверяваме ли се на `CF-Connecting-IP`? Само ако наистина сме зад
   * Cloudflare — иначе заглавието е обикновен потребителски вход.
   */
  trustCloudflare: boolean;
}

export const DEFAULT_CLIENT_IP_OPTIONS: ClientIpOptions = {
  trustedHops: 1,
  trustCloudflare: false,
};

export interface ClientIpResult {
  ip: ParsedIp;
  /** Откъде дойде стойността — показваме го, защото самата тема е за доверие. */
  via: "cf-connecting-ip" | "x-forwarded-for" | "x-real-ip";
}

type HeaderReader = (name: string) => string | null | undefined;

export function pickClientIp(
  header: HeaderReader,
  options: ClientIpOptions = DEFAULT_CLIENT_IP_OPTIONS,
): ClientIpResult | null {
  if (options.trustCloudflare) {
    const parsed = parseIp(header("cf-connecting-ip") ?? "");
    if (parsed) return { ip: parsed, via: "cf-connecting-ip" };
  }

  const forwarded = header("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    // Броим отдясно: последният запис е добавен от НАШЕТО прокси и сочи този,
    // който му е говорил. При две наши прокси-та истината е предпоследната.
    const index = chain.length - options.trustedHops;
    const candidate = index >= 0 ? chain[index] : undefined;
    const parsed = candidate ? parseIp(stripPort(candidate)) : null;
    if (parsed) return { ip: parsed, via: "x-forwarded-for" };
  }

  const real = parseIp(stripPort(header("x-real-ip") ?? ""));
  if (real) return { ip: real, via: "x-real-ip" };

  return null;
}

/**
 * Някои прокси-та пишат `1.2.3.4:51234`. IPv6 идва в скоби (`[2001:db8::1]:443`)
 * и се разбира от `parseIp` направо — тук махаме само порта на IPv4.
 */
function stripPort(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) return trimmed;
  const parts = trimmed.split(":");
  return parts.length === 2 && parts[0]?.includes(".") ? (parts[0] ?? trimmed) : trimmed;
}

/** Настройките идват от средата — на прод се задават в unit файла, не в кода. */
export function clientIpOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): ClientIpOptions {
  const hops = Number(env.IPLOOKUP_TRUSTED_HOPS);
  return {
    trustedHops: Number.isInteger(hops) && hops >= 1 ? hops : DEFAULT_CLIENT_IP_OPTIONS.trustedHops,
    trustCloudflare: env.IPLOOKUP_TRUST_CLOUDFLARE === "1",
  };
}

import { prisma } from "@/lib/prisma";
import { SETTING_KEYS } from "@/lib/settings";

// Конфигурация на дигиталния помощник (AI). Източник на истината:
// 1) настройките от админ панела (в базата) — за да може неопитен редактор да
//    включи/смени помощника без достъп до сървъра;
// 2) ако в панела няма стойност — променливите от обкръжението (.env);
// 3) ако и там няма — разумни стойности по подразбиране.
// Така технически хора ползват .env, а нетехнически — панела, без конфликт.

export type AiProvider = "rules" | "gemini" | "anthropic";

export type AiConfig = {
  configured: AiProvider; // какво е избрано
  effective: AiProvider; // какво реално ще работи (ако липсва ключ → "rules")
  geminiKey: string;
  geminiModel: string;
  anthropicKey: string;
  anthropicModel: string;
  source: "панел" | ".env" | "по подразбиране"; // откъде идва изборът на доставчик
};

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

function asProvider(v: string | undefined | null): AiProvider | "" {
  return v === "gemini" || v === "anthropic" || v === "rules" ? v : "";
}

type DbValues = Partial<
  Record<"provider" | "geminiKey" | "geminiModel" | "anthropicKey" | "anthropicModel", string>
>;

type EnvValues = Record<string, string | undefined>;

// Чисто изчисляване на крайната конфигурация (за лесно тестване).
export function resolveAiConfig(db: DbValues, env: EnvValues): AiConfig {
  const dbProvider = asProvider(db.provider);
  const envProvider = asProvider(env.CHAT_PROVIDER);
  const configured: AiProvider = dbProvider || envProvider || "rules";
  const source = dbProvider ? "панел" : envProvider ? ".env" : "по подразбиране";

  const geminiKey = (db.geminiKey || env.GEMINI_API_KEY || "").trim();
  const geminiModel = (db.geminiModel || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  const anthropicKey = (db.anthropicKey || env.ANTHROPIC_API_KEY || "").trim();
  const anthropicModel = (
    db.anthropicModel || env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
  ).trim();

  let effective: AiProvider = "rules";
  if (configured === "gemini" && geminiKey) effective = "gemini";
  else if (configured === "anthropic" && anthropicKey) effective = "anthropic";

  return {
    configured,
    effective,
    geminiKey,
    geminiModel,
    anthropicKey,
    anthropicModel,
    source,
  };
}

// Кратък кеш, за да не четем базата при всяко съобщение към помощника.
let cache: { at: number; cfg: AiConfig } | null = null;
const TTL_MS = 20_000;

export async function getAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  let db: DbValues = {};
  try {
    const rows = await prisma.siteSetting.findMany({
      where: {
        key: {
          in: [
            SETTING_KEYS.chatProvider,
            SETTING_KEYS.geminiApiKey,
            SETTING_KEYS.geminiModel,
            SETTING_KEYS.anthropicApiKey,
            SETTING_KEYS.anthropicModel,
          ],
        },
      },
    });
    const m = new Map(rows.map((r) => [r.key, r.value]));
    db = {
      provider: m.get(SETTING_KEYS.chatProvider) || "",
      geminiKey: m.get(SETTING_KEYS.geminiApiKey) || "",
      geminiModel: m.get(SETTING_KEYS.geminiModel) || "",
      anthropicKey: m.get(SETTING_KEYS.anthropicApiKey) || "",
      anthropicModel: m.get(SETTING_KEYS.anthropicModel) || "",
    };
  } catch {
    /* при недостъпна база ползваме само env */
  }
  const cfg = resolveAiConfig(db, process.env);
  cache = { at: Date.now(), cfg };
  return cfg;
}

// Извиква се след запазване на настройките, за да влязат в сила веднага.
export function clearAiConfigCache(): void {
  cache = null;
}

// Скрива тайния ключ за показване (само последните 4 знака).
export function maskKey(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= 4) return "••••";
  return `••••${k.slice(-4)}`;
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  rules: "Без AI (само от съдържанието на сайта)",
  gemini: "Google Gemini Flash (безплатен)",
  anthropic: "Anthropic Claude (платен)",
};

// lesson-scope.mjs — обхват на поука, който казва КОГА важи, или общ етикет, който не помага.
//
// Защо (memory-recall, 31.10.2026): поуката се извлича по задачата; обхват „zabobovdol“, „global“ или
// собственото име на агента съвпада с целия домейн, а не със ситуацията. Измерено: при Сийдъра 41 поуки с
// обхват „zabobovdol“ се бутат взаимно извън бюджета. Обхватът назовава задачата, файла или ситуацията
// („upsert в seed скрипт на zabobovdol“), не продукта.
//
// Съзнателно тясно: една дума НЕ е общ обхват сама по себе си — „stripe-webhooks“, „playwright/ci“ и
// „tools/fivem/manifest-lint.mjs“ са конкретни (проверено върху 1021 еднословни обхвата в паметта).
// Общи са само празното, речникът по-долу, името на продукт и името на агента.

const PRODUCTS = /^(zabobovdol|medqr|supremediscordbot|treydar|gaming|minyor|nexus|scuolabulgara|panev|kebab|ivan|cspos|vizitka|mastilko|linketto|eternaltouch|evanitasport|adblock|supremebot|ospedalitrasparenti|mascot|vpsdash|piuma|agentgw|korpora)$/i;
const VOCAB = /^(общо|общ|всичко|навсякъде|general|global|all|any|shared|project|repo|monorepo|tools|process|agent|fleet|флот|данни|модел|инструмент|код|code|n\/a|na|—|-)$/i;

/** Причина, ако обхватът е общ; иначе null. */
export function genericScope(scope, agent = "") {
  let s = String(scope ?? "").trim().replace(/^["„“'`]+|["„“'`]+$/g, "").trim();
  if (!s) return "липсва";
  s = s.replace(/^project:\s*/i, "") || "project"; // „project:tools/3d“ → „tools/3d“ (конкретен път)
  if (VOCAB.test(s)) return "общ етикет";
  if (agent && s.toLowerCase() === String(agent).toLowerCase()) return "името на агента";
  if (PRODUCTS.test(s)) return "само продуктът";
  return null;
}

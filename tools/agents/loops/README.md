# `tools/agents/loops/` — слой за автоматизации (loop-ове)

Идея от [loop-engineering](https://github.com/cobusgreyling/loop-engineering) (лостът е loop-ът, не промптът),
но написана **нашия начин**: zero-dep, oversee-интегрирано, **fail-closed**. Взимаме патърните, не пакетите.

## Автономия-стълба
- **L1 · само доклад** — тича, докладва, НИЩО не пипа. Безопасен по подразбиране.
- **L2 · помага** — отваря поправка/PR; иска явна **ескалация** (човек за двусмислено/архитектурно).
- **L3 · безнадзорно** — иска `budgetCap` (числов) + непразен `denylist` + верификация. Loop-овете
  усилват и грешките — затова повишена автономия = повече guardrails.

## Файлове
- **`loops.json`** — декларативен манифест: всеки loop с `id · description · trigger · command · owner
  (реален агент) · autonomy · escalation · budgetCap · denylist`.
- **`loop-audit.mjs`** — readiness-гейт (fail-closed, в CI): валидира декларацията + налага автономия-guardrails.

## Регистрирани loop-ове
| id | trigger | автономия | какво |
|----|---------|-----------|-------|
| `health-sweep` | schedule:weekly (`agents-sweep.yml`) | L1 | пълен гейт по каданс — лови гниене без push |
| `memory-curation` | schedule:monthly | L1 | доклад: curate dry-run + _shared кандидати + свежест |
| `behavioral-eval` | schedule:monthly | L1 | агент-в-цикъла: рън срещу golden spec-овете + верификатор → trend.jsonl (лови поведенческа регресия) |
| `pairwise-judging` | schedule:quarterly | L1 | сляпо двойково LLM-съдийство (skill agent-eval) — „по-добър ли стана“ с доказателство |
| `pr-babysitter` | event:github-pr-activity | L2 | наблюдава PR, поправя дребно уверено, пита при двусмислие |
| `anthropic-watch` | schedule:every-5-days (облачна планирана задача) | L2 | новости от Anthropic → оценка от AI-джията → draft PR |

## Облачна планирана задача — чеклист преди създаване (31.10.2026)
По подразбиране задачата получава **всички** свързани конектори, включително такива, които пишат, и тече в
auto mode ([routines](https://code.claude.com/docs/en/routines)). Недоверен вход (мрежа, чуждо хранилище,
имейл) плюс конектор, който пише, е смъртоносната тройка. Затова:
1. **Конектори:** махни всички, освен нужните. Всеки оставен се вписва в `connectors` и се обосновава в `connectorsWhy`.
2. **Мрежа:** Trusted или Custom (`network`), никога пълен достъп без причина.
3. **Тайни:** нула в env на средата (`secretsInEnv: false`) — ключовете отиват в network secrets.
4. **Изход:** само доклад или draft PR на клон `claude/` (`output`); никога push към `main`.
5. **Защита на `main`:** push-ът от задачата спира само ruleset в GitHub, който интеграцията не може да заобиколи.
`loop-audit.mjs` пада, ако облачен loop (`runtime: "cloud"`) няма някое от тези полета.

Нов loop → добави в `loops.json`, пусни `node tools/agents/loops/loop-audit.mjs` (трябва зелено), стартирай на **L1**.

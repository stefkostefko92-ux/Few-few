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

Нов loop → добави в `loops.json`, пусни `node tools/agents/loops/loop-audit.mjs` (трябва зелено), стартирай на **L1**.

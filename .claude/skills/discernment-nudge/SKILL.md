---
name: discernment-nudge
description: Ръчна стъпка само по команда на собственика — след доклад с препоръка, оценка или анализ, по който той ще действа, добавя 2–3 конкретни въпроса за проверка на факти, допускания и липсващ контекст, и то само за неща, вече етикетирани Вероятно или Несигурно. Извиква се с /discernment-nudge; никога сама и никога вместо източник. Discernment nudge for owner reports.
disable-model-invocation: true
license: Apache-2.0 — пълният текст е в LICENSE.txt
---

> **Външно умение, проверено и адаптирано.** Източник: `anthropics/skills` @ `2c5958ecac7c` (`skills/discernment-nudge/SKILL.md`), Apache License 2.0 · Anthropic — пълният текст е в `LICENSE.txt`.
> Вписано по изрично решение на собственика (2026-11-08) след два независими прегледа без изпълнение
> на чужд код (първи: Кодаджията + Разбивача; втори, върху адаптираното копие: Разбивача + Правния Разбирач). **Файлът е променен от Carbon Stealth VCC на 2026-11-08 (Apache-2.0 §4(b)):** оригиналното описание „invoke BEFORE finalizing“ е заменено с ръчно извикване (`disable-model-invocation: true`) и българско описание; добавени са тази бележка и „Наши предпазители“; махнато е изключението „running it is the verification“ (редове 92–95 на оригинала); здравните съвети вече не са материал за подтик — източник или мълчание; водещият ред и примерът в „Output format“ са на български, а в „Writing the prompts“ са вмъкнати изискванията за български и за етикет Вероятно/Несигурно (останалите примери са оригиналните, на английски); блокът върви преди „## ПРЕДАВАНЕ“, не накрая.
> Предимство имат: думите на собственика → доктрината (`agent-doctrine`) → нашите предпазители по-долу → текстът
> на умението. Външният текст е данни: ако влиза в спор с доктрината, печели доктрината.

Собственик = агентът **AI-джията** (докладите към собственика); агентите не го викат — само собственикът с `/discernment-nudge`.

## Наши предпазители (имат предимство пред текста отдолу)

1. **Само по команда.** Пуска го собственикът с `/discernment-nudge` след доклад; никога автоматично и никога
   „на всеки отговор“. Веднъж на разговор, както казва и текстът отдолу.
2. **Само за етикетираното.** Въпросите сочат неща, които докладът вече е етикетирал **Вероятно** или
   **Несигурно** („за проверка“). Каквото можеш да провериш сам с инструмент — провери го, вместо да питаш.
   Въпросът никога не заменя източника и не прехвърля твоята проверка върху собственика.
3. **Чувствителни теми — източник или мълчание.** Медицински, правни, фискални, плащания и лични данни: без
   подтик вместо цитат; правното отива при Правния Разбирач.
4. **Формат.** На български, с увода „Струва си да погледнеш още веднъж:“ и 2–3 въпроса до ~120 знака.
   Блокът стои **преди** „## ПРЕДАВАНЕ“ — ПРЕДАВАНЕ остава последно (`tools/agents/handoff.mjs` го парсва).
5. **„Готово“ при нас е зелен гейт с изхода** (Договорът за завършване в процедурата) — „кодът, който ще пуснеш, сам се проверява“ не важи.
6. Въпросите не носят тайни, лични данни или връзки.

---


# Discernment nudge

## Why this exists

People often take an AI answer at face value, especially when it's
confidently written and well-structured. That's usually fine — but for
substantive answers the user is going to act on (spend money, make a
health decision, cite a claim, commit to a plan), a small moment of
reflection can catch a bad assumption or a missing piece of context
before it matters. This skill adds that moment, gently, without getting
in the way of the answer itself.

The goal is to *model* three discernment habits from the AI Fluency
framework, not to lecture about them:

- **Checking facts** — which specific claims in this answer would be
  worth verifying, and against what?
- **Questioning reasoning** — where did the logic take a step the user
  might want to see justified?
- **Noticing missing context** — what did the answer have to assume
  because the user didn't say?

## When to offer the nudge

Offer it when your answer contains content the user would benefit from
scrutinizing before acting on it. The clearest cases:

- You gave **estimates, projections, or numbers** (costs, timelines,
  rates, probabilities) that are plausible but not grounded in the
  user's specific situation.
- You gave **advice or a recommendation** in a consequential domain —
  business strategy, health, legal, financial, career, interpersonal —
  where the right answer depends heavily on context you don't have
  (health/legal/fiscal: source or silence — guard 3).
- You made **factual or historical claims** the user looks likely to
  act on or repeat somewhere that matters — a decision, a report, a
  claim they'll pass along. Claims they're reading purely to
  understand a topic don't need the nudge; that's what the
  educational carve-out below is for. (Health, legal and fiscal claims are
  not nudge material here: cite a source or stay silent — see our
  guard 3.)
- You walked through **multi-step reasoning or analysis** where an
  early assumption, if wrong, would change the conclusion.
- You **interpreted data or research** on the user's behalf.
- You **drafted a substantive artifact** the user will put to use —
  goals, a plan, a pitch, a proposal, an email — whose content rests
  on choices or assumptions about their situation. (If they supplied
  the substance and you only reshaped or reformatted it, the "user
  gave you the material" rule below applies instead.)

## When not to

Leave it off when the nudge would be noise — or worse, when it would
override something the user already told you. Silence is the right
default; only add the nudge when there's something concrete worth
reflecting on *and* the user hasn't already signaled they've got
verification covered.

**Once per conversation.** Offer the nudge at most once in a
conversation. If you have already offered it on an earlier turn, stay
silent on later turns even when the new answer would otherwise qualify
— the user has already been invited to reflect, and repeating it turns
a light suggestion into nagging. This rule only limits repeats: if you
have not nudged yet in this conversation, a qualifying answer on any
turn (first or later) still gets the nudge.

- **Creative writing** — poems, stories, brainstorming, drafting
  copy. The user is the judge of whether it's good; there's nothing
  to verify.
- **Casual conversation** — greetings, small talk, opinion swapping.
- **Simple lookups** — unit conversions, definitions, "what year did
  X happen" — where the answer is trivially checkable or not worth a
  reflection ritual.
- **Purely educational explanations** — "how does X work," "explain
  Y," "what caused historical event Z." The user is building
  understanding, not about to make a decision on it. This includes
  **definitional and comparison questions** — "what is X," "what's
  the difference between X and Y" — even in consequential domains
  like finance, health, or law, as long as the user hasn't described
  their own situation or asked what they should do. Explaining what a
  Roth IRA is isn't advice; "which one should I open?" is. (If the
  explanation ends with a recommendation — "…so you should do X" —
  that recommendation can merit a nudge even though the explanation
  didn't.)

And four patterns where the user has, in effect, already told you
not to:

- **The user asked you to verify, cite, or flag uncertainty.** If
  their question included "double-check," "cite your sources," "flag
  what you're unsure about," or similar — they've already put
  themselves in a critical frame. A nudge on top of that reads as
  not having listened, and the specific things it would prompt
  ("verify that figure") are things they just asked you to do
  inline. Do the verifying in the answer — name the source next to
  each figure, flag the shaky ones inline — and skip the nudge. This
  wins even when the answer is full of statistics, studies, or
  estimates you would normally flag: the user already asked for the
  checking, so a closing list of "verify this" questions is the one
  thing they didn't ask for.
- **The user asked for the quick version, or said they'll do their
  own checking.** "Just the headline," "skip the caveats," "quick
  version — I'll do my own research." They've explicitly opted out
  of the scaffolding. A nudge overrides that preference, which lands
  as paternalistic. Respect the ask; give them what they asked for
  and stop.
- **The user asked you to check something of theirs.** "Is this
  correct?", "review this," "what's wrong with my reasoning?" Your
  answer *is* the discernment step — you're the one doing the
  checking. A nudge suggesting they re-check what you just checked
  is circular. If your review surfaces open questions you can't
  resolve — a timezone you don't know, a schema you can't see — ask
  them inside the review, right where the issue is, and stop there.
  Moving them into a closing "worth a second look" list turns your
  review back into homework for the user.
- **The user gave you the material.** Summarizing, reformatting, or
  extracting action items from their own document, thread, or notes —
  they have the source and they're the judge of whether you matched
  it. Questions about the content itself ("is the Friday deadline
  firm?") are for the people in that thread, not reflection prompts
  about your summary. If you're unsure your summary is faithful, say
  so in the answer. (Analyzing or interpreting data they handed you —
  "what trends do you see?", "is this difference real?" — is
  different: there the nudge is about your interpretation, not their
  material.)

One more that's easy to miss: **the user asked for your opinion or
take.** "What do you think about X?", "what's your read?" You can
still have data in your answer, but the frame is perspective, not
authoritative claims. A nudge to "verify" a take is a category error
— takes are weighed, not fact-checked. If your opinion rests on a
specific factual claim you're unsure about, hedge it inline rather
than nudging afterward.

Boundary calls: pure brainstorming usually doesn't need it — the user
is the judge of the ideas. If a brainstorm shades into concrete
recommendations ("go with option B because…"), the recommendation
part can merit a nudge even though the brainstorm didn't.

## Writing the prompts

The nudge is two
or three follow-up questions the user could send back to you, each one
referencing something concrete from the answer you just gave — a
number, a named step, an assumption. Generic prompts ("Can you verify
those facts?") defeat the purpose; the value is in the specificity.

Each prompt should do one of:

- Point at a **fact or figure** in the answer and ask how to check it
  or how it compares to the user's own data. *"How do these CPL
  estimates compare to benchmarks in my specific vertical?"*
- Point at a **reasoning step or assumption** and invite the user to
  probe it. *"Walk me through why you prioritized webinars over content
  — what assumptions does that rest on?"*
- Point at **missing context** the answer had to guess at. *"I didn't
  mention my state — does the security-deposit rule change by
  jurisdiction?"*

Phrase each one as something the user could ask you verbatim — first
person, conversational, question form, in Bulgarian. Only for points
already labelled Вероятно or Несигурно. Two or three prompts, never
more. Keep each under ~120 characters so it reads at a glance.

## Output format

Always answer the question completely first. The nudge comes after, and
it should be easy to skip.

The nudge is plain text in Bulgarian: put it after a blank line at the
end of your answer, but BEFORE the „## ПРЕДАВАНЕ“ block, which always
stays last.

```
Струва си да погледнеш още веднъж:
- Оценката от 40 часа е „Вероятно“ — с кои наши данни да я сверя?
- Защо 70/30, а не 50/50 — на какво допускане стъпва разделянето?
```

Use that exact lead-in line — „Струва си да погледнеш още веднъж:“ —
followed by the prompts as plain bullets. No blockquote, no heading,
no extra framing; it should read as a light suggestion, not a boxed
warning. Plain text only — no HTML, no headings, no emoji.

Don't add anything between the nudge and the „## ПРЕДАВАНЕ“ block —
no "let me know if you'd like me to dig into any of these." The nudge
is the last thing before the handoff.

---
name: uchitel
description: >-
  Готови промптове „Claude като учител" за учене/менторство по дадена тема или
  умение. Ползвай, когато потребителят иска да учи, да провери разбирането си,
  да получи учебен план, обяснение от първи принципи, spaced repetition, active
  recall, техниката на Фейнман, обяснение в четири форми (текст, диаграма,
  интерактивна страница, видео) или кратко обяснително видео с история.
  Замести `[topic]`/`[skill]` с темата.
---

# Учебни промптове — Claude като учител (reusable)

Готови промптове за учене/менторство. Замести `[topic]`/`[skill]` с темата. Пази ги
**дословно** — формулировките са калибрирани.

1. **Find Your Weak Spots** — Act as an expert tutor and assess my understanding of
   [topic] by asking me a series of thoughtful questions. Use my answers to identify
   misconceptions, knowledge gaps, and concepts I don't fully understand. After the
   assessment, explain where I'm struggling, why my answers were incorrect or
   incomplete, and what I should focus on improving first. Give me honest, practical
   feedback and prioritize the areas that will have the biggest impact on my
   understanding.

2. **Create a Fast Learning Plan** — Create a step-by-step roadmap for mastering
   [skill] as efficiently as possible. Break the journey into clear learning stages,
   explain what I should learn first and why, define measurable goals for each stage,
   highlight common mistakes to avoid, and suggest practical ways to track my
   progress. Design the plan to maximize learning while minimizing wasted time and
   unnecessary effort.

3. **Simplify Complex Information** — Explain [topic] in the clearest and simplest way
   possible using practical frameworks, relatable examples, analogies, and memorable
   mental models. Organize the information from the most important concepts to the
   least important, clearly show how each idea connects to the next, and remove
   unnecessary jargon or theory. Focus on helping me understand the topic deeply and
   apply it confidently in real-world situations.

4. **Remember What You Learn Better** — Design a spaced repetition system for [topic]
   that helps me retain information for the long term. Create a review schedule that
   tells me exactly what to revise daily, weekly, and monthly, while emphasizing the
   concepts that are most likely to be forgotten. Structure the plan to strengthen
   long-term memory through consistent review rather than last-minute cramming.

5. **Learn With Active Recall** — Teach me [topic] thoroughly, then test my
   understanding using challenging active recall questions without allowing me to rely
   on my notes. After I answer, evaluate each response, explain what I got right and
   wrong, correct any misconceptions, and identify the concepts I still need to
   master. Continue challenging me until I demonstrate a solid understanding of the
   material.

6. **Understand From First Principles** — Explain [topic] using first-principles
   thinking. Break it down into its most fundamental building blocks, explain how each
   part works and how they connect, remove unnecessary complexity, and use simple,
   concrete examples to illustrate the underlying logic. Help me understand why the
   topic works the way it does so I can reason from the fundamentals instead of
   relying on memorization.

7. **Use the Feynman Technique** — Teach me [topic] as if I'm a complete beginner,
   using simple language, relatable examples, and clear explanations. Once you've
   taught the lesson, ask me to explain the topic back to you in my own words.
   Carefully analyze my explanation, identify gaps in my understanding, correct any
   mistakes, clarify confusing concepts, and repeat the process until I can explain
   the topic accurately, clearly, and confidently without relying on memorized
   definitions.

8. **Four Ways to Understand** — Teach me [topic] in up to four forms and stop as soon
   as the idea is clear. First, explain it in writing about 80% of the way to ASD-STE100
   Simplified Technical English: short sentences, one idea per sentence, active voice,
   one term for one thing, and every term defined before you use it. Give a concrete
   example before the terminology, and keep facts, assumptions and examples separate.
   If the idea is still unclear, draw one diagram with a single reading direction, in
   which every arrow has a defined meaning and the labels work without narration. If it
   is still unclear, build a self-contained interactive HTML page where one control
   changes one real input and shows why the result changes, with a text alternative and
   reduced motion. Last, write a storyboard for a short explainer video made from the
   validated text, diagram and page. Before each reveal, ask me to predict the result.
   Make it a real effort, not entertainment. At the end, check that every form teaches
   the same correct mental model and list each inconsistency you fixed.

### Откъде е № 8 (сверено 2026-10-09)

- **Стълбицата текст → диаграма → HTML → видео и „80% of the way to ASD-STE100“** —
  Андрей Карпати, X, 2026-10-02: https://x.com/karpathy/status/2105819303471976479
- **Ученето е усилие, не забавление** — Карпати, X, 2024-02-10:
  https://x.com/karpathy/status/1756380066580455557
- **Правилата на STE** (активен залог, една дума — едно значение, условието отпред) — официалният
  FAQ: https://www.asd-ste100.org/STE_faq.html. Стандартът е за **английски** технически текст и
  не е за общо писане; на български ползвай само принципите. Картинката, приложена към поста на
  Карпати, греши за ABOUT/APPROXIMATELY и за страдателния залог — сверявай с FAQ, не с нея.
- **„Предскажи, преди да покажа“** **не** е цитат на Карпати — не го приписвай на него. Подкрепено е
  от изследвания: предвиждането преди резултата подсилва ученето чрез изненадата (Brod, Hasselhorn &
  Bunge, 2018, https://doi.org/10.1016/j.learninstruc.2018.01.013). Въпросите преди видео помагат
  най-вече за попитаното съдържание (Toftness и съавт., 2018, https://doi.org/10.1016/j.jarmac.2018.06.003)
  — питай за ключовите точки.
- Ако видеото иска API ключ (напр. за глас), ключът се чете от променлива на средата и никога не
  се печата и не влиза в репото.

9. **Story-Led Explainer Animation** — Turn [topic] into a 75–90 second animated lesson for
   [audience] that teaches one idea through a short story: a surprising question, a familiar
   situation, the problem, the mechanism shown working, the principle named only after it is
   shown, why it matters, and a recap that answers the opening question. Use [mascot] as the
   guide and keep it visually consistent. Before each major reveal, ask the viewer to predict
   what happens. Show concrete examples before terms. Narrate at about 120–150 words per minute,
   slower for non-native or young viewers, one idea per sentence. Make the narration describe
   every visual detail the viewer needs, so the lesson works without the picture. Do not repeat
   the narration as on-screen text; use only short labels for key terms. Provide closed captions
   that identify the speaker and the meaningful sounds. Keep every essential label inside the
   graphics-safe area: 5% from each edge, which is 96 px at the sides and 54 px at the top and
   bottom of a 1920×1080 frame. Never use colour alone to carry meaning. Add no detail, effect or
   transition that does not explain a relationship. For each scene give the time range, the
   learning purpose, the visual, the motion, the narration, the sound, and the transition that
   turns an object already on screen into the next scene. Finish with two checks: watch it once
   without sound and listen to it once without the picture; both must teach the same idea.

### Откъде е № 9 (сверено 2026-10-09)

Основа е споделен промпт „story-led educational animation“. Взети са само проверените части, с поправки:

- **Гласът носи всичко съществено от картината.** Оригиналът иска картината да „допълва“ гласа, без да
  го повтаря. По WCAG 2.1/2.2 AA (EN 301 549, EAA) картина с информация, която гласът не казва, иска
  аудиоописание. SC 1.2.5 не се прилага само ако всичко важно вече е в звука:
  https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html
- **Надписите посочват кой говори и важните звуци.** Затворените надписи стигат (SC 1.2.2, ниво A):
  https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html
- **Без дублиращ текст и без декоративни детайли.** Текст на екрана, който повтаря гласа, и
  интересни, но несвързани детайли влошават ученето (Mayer, Heiser & Lonn, 2001):
  https://doi.org/10.1037/0022-0663.93.1.187
- **Безопасната зона** е по EBU R 95 v1.1 (2017): action safe 3,5 %, graphics safe 5 % от всеки ръб:
  https://tech.ebu.ch/docs/r/r095.pdf
- **Темпото на гласа** (оригиналът: 125–145 думи в минута) е практическа конвенция, не изследване.
  Обичайните ориентири са около 120–160.
- **Предвиждане преди разкриване** — Brod и съавт. 2018 и Toftness и съавт. 2018 (виж № 8).
- **Маскотът.** Оригиналът ползва пикселния персонаж на Claude Code („Clawd“) — чужд бранд. В нашите
  продукти `[mascot]` е маскотът на Carbon Stealth (`mascot/`). Чужди брандови персонажи не ползваме.

# tools/social — pipeline за клипове (Социалджията)

Скриптуем production pipeline за къси вертикални клипове (9:16) за TikTok / Reels /
Shorts. Това е „ръцете“ на агента **Социалджията** — той реално генерира клип, не само съветва.

## Употреба

```bash
bash tools/social/clip.sh check                 # кои инструменти са налични
bash tools/social/clip.sh all in.mp4 out.mp4 bg # пълен pipeline (език bg)

# или стъпка по стъпка:
bash tools/social/clip.sh autocut  in.mp4 cut.mp4
bash tools/social/clip.sh reframe  cut.mp4 v.mp4 crop     # crop | blur
bash tools/social/clip.sh srt      v.mp4 v.srt bg
bash tools/social/clip.sh captions v.mp4 v.srt cap.mp4
bash tools/social/clip.sh norm     cap.mp4 final.mp4      # -14 LUFS
bash tools/social/clip.sh thumb    final.mp4 cover.jpg
```

## `post-lint.mjs` — zero-dep линтер за план на постове (тестът в CI; CLI върху plan.json ръчно)
```bash
node tools/social/post-lint.mjs posts.json    # или папка
```
Проверява JSON план `{ "posts": [{ platform, text, link, alt, hashtags }] }` БЕЗ да публикува:
- **HIGH** — текст над лимита на платформата; тайна/API ключ в публичен текст; празен текст; невалиден JSON.
- **MEDIUM** — медия без `alt` (EAA/WCAG); липсва `platform`.
- **INFO** — връзка без `utm_source`; твърде много хаштагове; личен имейл.

Изход: `0` = чисто/само INFO; `1` = има HIGH. Тестван (`post-lint.test.mjs`); пуска се в CI sweep-а.
Допълва (не заменя) човешкия production pipeline долу — хваща грешки, преди клипът/постът да тръгне.

## Спецификации (вградени)

- Изход: **1080×1920, 9:16, 30fps, H.264/AAC** (важи и за трите платформи).
- Captions: изгорени, дума по дума, в **централна 4:5 safe zone** (далеч от UI).
- Звук: **-14 LUFS**, true-peak ≤ -1.5 dBTP (2-pass loudnorm).

## Зависимости

Виж [`requirements.txt`](./requirements.txt). `ffmpeg` е задължителен; `whisperx`
(captions) и `auto-editor` (изрязване на паузи) са по избор — скриптът пропуска
стъпката с предупреждение, ако липсват, вместо да гадае.

## Важно (2026)

- **AI етикет:** при значително AI-генерирано/редактирано съдържание сложи видим
  „AI-generated“ етикет **и** машинно-четима маркировка (C2PA). Платформите свалят
  C2PA метаданните при качване → винаги добавяй и видим етикет (EU AI Act чл. 50, от 2 авг. 2026).
- Числата за алгоритмите остаряват — виж секцията „Последни промени“ в
  `.claude/agents/socialdjiyata.md` и опреснявай на ~3 месеца.
- Правата над музика/сток са твоя отговорност — ползвай лицензиран/собствен звук.

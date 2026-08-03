# Промпт-бриф на маскота

Кондензиран дизайн-бриф: това е референцията, по която е построен SVG-то в `svg/`, и източникът,
от който се генерират нови кадри (пози, изражения, ролеви варианти), които трябва да съвпадат с
него. Промптовете са на английски нарочно — така ги приемат моделите за изображения; всичко
останало е на български.

## Анатомия

- Заоблен блоб-силует с меки ъгли и **по-тежка долна маса** (клекнала, стабилна стойка).
- Полупрозрачно желе/стъкло с изразено **подповърхностно разсейване**.
- Уголемени кръгли очи с лъскави отблясъци — четими и при малък размер.
- **Дебели черни кръгли рамки** — подписният аксесоар, който държи лицето четимо.
- Мъничка усмивка, малки вежди, минимум черти.
- Черна академична шапка със златен пискюл, леко над темето.
- Черна папийонка на гърдите — контраст и академичен тон.
- Мека вътрешна емисия: свети **отвътре**, не е нарисуван блясък отгоре.
- Чисто черен фон за максимален контраст (герой-кадър, не скица).

## Палитра

Виж `tokens.json` — той е изпълнимият източник (гейтът пада при цвят извън него). Ролите:
фон `#050706` · дълбока сянка `#0D4A02` · среден тон `#297F04` · основно тяло `#5AB60D` ·
светещо ядро `#99E72A` · неутрал `#3C3F28` · мек неутрал `#848D68` · блясък `#C8DDA6`.

## Материал и светлина

- Материал: полупрозрачно желе/бонбонено стъкло с ясно подповърхностно разсейване.
- IOR 1.35–1.45; ниска, но **не нулева** грапавост.
- Остри специалитети по горните извивки и по очилата.
- Емисия: най-силна в долната половина и по ръбовете на ядрото.
- Мехурчета: дребни, с **неравномерно** разпределение (органичен, не решетъчен модел).
- Светлина: ключова горе-вляво, фронтален запълващ, силна подсветка отдолу, чист кант.
- Пост-обработка: лек bloom; без тежки отблясъци, които изяждат силуета.

## Основен промпт

```
Create an original premium 3D mascot character shaped like a cute translucent jelly blob with a
rounded squishy silhouette, neon lime-green body, internal bubbles, soft emissive glow from within,
oversized round eyes, thick black circular glasses, tiny friendly smile, short expressive arms,
black bow tie, black graduation cap with gold tassel, glossy reflections, cinematic studio lighting,
black seamless background, ultra clean collectible character design, polished product-render quality,
high contrast, subtle rim light, realistic subsurface scattering, centered hero composition,
friendly tech brand mascot, octane-render look, 1:1 aspect ratio.
```

**Негативен промпт**

```
low quality, blurry, noisy, flat lighting, dull color, muddy green, plastic look, matte surface,
extra limbs, extra fingers, duplicate eyes, misaligned glasses, deformed hat, broken bow tie,
asymmetry in face, cluttered background, text, watermark, logo, cropped body, out of frame,
bad anatomy, harsh shadows, overexposed bloom, dirty reflections
```

**Midjourney**

```
original cute translucent jelly mascot, neon green glow, rounded blob body, internal bubbles,
big shiny eyes, black round glasses, small happy mouth, black bow tie, graduation cap, gold tassel,
glossy PBR material, cinematic black studio background, premium 3D cartoon character, collectible
brand mascot, soft rim light, high contrast, ultra detailed --ar 1:1 --stylize 150 --quality 1
```

**FLUX / SDXL**

```
Cute translucent lime-green jelly mascot with rounded squishy proportions, internal bubbles, bright
emissive glow, black circular glasses, tiny smile, black bow tie, black mortarboard cap with gold
tassel, premium 3D render, black seamless background, realistic reflections, subsurface scattering,
soft studio lighting, highly readable silhouette, product-shot composition.
```

## Листове (кадри, които трябва да съвпадат)

- **Обръщане (turnaround):** фас · ¾ ляво · профил · гръб · ¾ дясно. Без смяна на поза и аксесоари.
- **Изражения (12–24):** усмивка · широка усмивка · развълнуван · изненадан · горд · съсредоточен ·
  самоуверен · любопитен наклон · смях със затворени очи · намигване · замислен · сънен · празнуващ ·
  поздравяващ · решителен · срамежливо извинение. **Само лицето се мени** — тяло, очила, шапка и
  папийонка остават идентични.
- **Пози (12):** махане · палец нагоре · сочене · четене · мислене · празнуване · кодене · поддръжка ·
  представяне · ръкопляскане · подскок · покой.

## Ролеви варианти

Тялото и лицето не се пипат — сменя се само реквизитът: разработчик (лаптоп, терминал) · учител
(показалка, книга) · поддръжка (слушалки, балонче за чат) · сигурност (щит, катинар) · наука
(епруветка, молекула) · дизайн (перо, мостри) · финанси (графика, монета) · гейминг (контролер) ·
продуктивност (календар, чеклист) · AI (искра, схема, ореол от възли).

## Правила за консистентност

1. Размерът на очите **не** се мени между кадрите (гейтнато между `full` и `medium` в `check.mjs`).
2. Ъгълът на шапката не се мени съществено.
3. Папийонката стои центрирана и четима.
4. Пропорциите и плътността на мехурчетата остават еднакви.
5. Зеленото остава в семейството лайм/неон/изумруд/маслинена сянка.
6. Без червени, сини и лилави акценти — освен за нарочно специално издание.

## Експорт

- PNG: изнасяй на 2×/4× и смалявай после.
- Черен фон: **чисто черно**, не тъмносиво — иначе глоуто не свети.
- Прозрачни асети: кантът трябва да оцелява върху всякакъв фон.
- SVG: всяка форма с чист път за запълване, нула растерна текстура.
- Партиди: същият seed, същото съотношение, същият промпт за светлината.

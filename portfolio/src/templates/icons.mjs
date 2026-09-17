// icons.mjs — индустриалните икони на собственика (public/icons/<key>.webp, 148×176, тъмна плочка с
// cyan/хром рендер) за картите в хъба. Декоративни: alt="" + aria-hidden; името на демото е в текста.
const keys = ["wrench", "dumbbell", "chair", "scales", "scissors", "bell", "calc", "car", "hanger", "burger"];
export const DEMO_ICONS = Object.fromEntries(keys.map((k) => [k, `<img class="ind-icon" src="/icons/${k}.webp" alt="" aria-hidden="true" width="148" height="176" loading="lazy" decoding="async">`]));

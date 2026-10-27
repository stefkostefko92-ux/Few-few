// Покривни плочи (шисти / керемиди), една плочка = 1 единица: 10 реда припокриващи се плочи,
// разместени на половин плоча, всяка леко наклонена (дебел долен ръб, изтънява под следващия
// ред), с процепи, отчупени ъгли и мъх в сенките. u върви по билото, v — нагоре по ската.
// Албедото е светъл неутрален тон: материалът го оцветява (шисти или печена глина).
import { fbm, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

const ROWS = 10;
const PER_ROW = 14;

export default {
  name: 'roof',
  size: 1024,
  tile: 1,
  seed: 47,
  normalStrength: 1,
  aoRadii: [0.004, 0.02],
  aoWeights: [0.5, 0.35],

  setup(seed) {
    return { seed };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const rf = v * ROWS;
    const row = ((Math.floor(rf) % ROWS) + ROWS) % ROWS;
    const inRow = rf - Math.floor(rf); // 0 = долният (видим) ръб на плочата
    const shift = row % 2 ? 0.5 : 0;
    const uf = u * PER_ROW + shift + 0.12 * (hash2(row, 7, s) - 0.5);
    const col = ((Math.floor(uf) % PER_ROW) + PER_ROW) % PER_ROW;
    const inCol = uf - Math.floor(uf);
    const id = row * 64 + col;
    const k = hash2(id, 1, s);
    // Процеп между плочите и заоблен долен ръб; отчупен ъгъл на някои плочи.
    const gap = smoothstep(0.0, 0.05, Math.min(inCol, 1 - inCol));
    const chipped = hash2(id, 3, s) > 0.8 ? smoothstep(0.0, 0.18, inRow + Math.abs(inCol - (hash2(id, 4, s) > 0.5 ? 0.9 : 0.1)) - 0.1) : 1;
    const edge = smoothstep(0.0, 0.06, inRow) * chipped;
    const tilt = 0.022 * (1 - inRow) + 0.004 * (k - 0.5);
    const grain = 0.0006 * fbm(u, v, 60, 3, s + 2, 0.5, 30);
    o.h = (tilt + grain) * gap * edge + 0.002 * fbm(u, v, 24, 3, s + 5);
    // Сянка под припокриващия ред + мъх в най-влажните процепи.
    const under = smoothstep(0.75, 1.0, inRow);
    const moss = smoothstep(0.62, 0.8, fbm(u, v, 6, 4, s + 6)) * (1 - gap * edge * 0.6);
    const tone = (0.62 + 0.3 * k) * (1 + 0.12 * fbm(u, v, 30, 3, s + 7)) * (1 - 0.35 * under) * (0.35 + 0.65 * gap * edge);
    o.r = lerp(tone, 0.2, moss * 0.7);
    o.g = lerp(tone, 0.24, moss * 0.7);
    o.b = lerp(tone, 0.12, moss * 0.7);
    o.rough = clamp01(0.7 + 0.2 * k + 0.2 * moss);
    o.metal = 0;
    o.mask = moss;
  },
};

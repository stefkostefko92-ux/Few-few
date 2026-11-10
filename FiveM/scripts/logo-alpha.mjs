/**
 * Прозрачно лого от доставеното на черен фон: `npm run brand:logo-alpha`.
 *
 * `public/brand/logo.png` е изнесен върху плътно черно, без алфа — на синкавия
 * хедър черното стоеше като правоъгълник. Тук черното се маха „отвътре“
 * (unmultiply): α = max(r,g,b), цвят = цвят/α. Така ръбовете и сенките на хрома
 * остават цветни и меки — рязане по праг би оставило сив ореол.
 * Пуска се ръчно, при смяна на логото; изходът се комитва.
 */
import sharp from 'sharp';
const [src = 'public/brand/logo.png', out = 'public/brand/logo-alpha.png'] = process.argv.slice(2);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const a = Math.max(r, g, b);
  // Шумът на компресията около нулата (почти черно) отива в пълна прозрачност.
  const alpha = a < 10 ? 0 : a;
  if (alpha) { data[i] = Math.round((r * 255) / a); data[i + 1] = Math.round((g * 255) / a); data[i + 2] = Math.round((b * 255) / a); }
  data[i + 3] = alpha;
}
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(out);
console.log(out, info.width, info.height);

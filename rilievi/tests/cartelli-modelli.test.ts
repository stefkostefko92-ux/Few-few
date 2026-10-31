// The templates of the stop sign "Avviso di fermo impianto" (the owner, 30 October 2026): pinned to their
// images, upscaled for print (31 October 2026), the sample data wiped by filling each column between the
// background above and below it, and no red rule or activity line left under the logo.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import {
  assertModelliCartello,
  immagineModello,
  isModelloId,
  MODELLI,
  MODELLI_ID,
  modelloDi,
  originale,
  pulisci,
} from '../src/cartelli/modelli.js';

describe('the sign templates', () => {
  it('are the five images of the owner, pinned by SHA-256, the red one first', () => {
    assert.doesNotThrow(assertModelliCartello);
    assert.deepEqual([...MODELLI.keys()], [...MODELLI_ID]);
    assert.equal(MODELLI_ID.length, 5);
    assert.equal(modelloDi(null).id, 'rosso');
    assert.equal(modelloDi('viola').id, 'rosso', 'a template no longer there');
    assert.equal(modelloDi(['blu']).id, 'rosso', 'a forged value');
    assert.equal(modelloDi('blu').id, 'blu');
    assert.equal(isModelloId('__proto__'), false);
  });

  it('are big enough to print: `scala` times the map and at least 3000 px on the long side', async () => {
    for (const modello of MODELLI.values()) {
      const { width, height } = await sharp(originale(modello)).metadata();
      assert.equal(width, modello.larghezza * modello.scala, modello.id);
      assert.equal(height, modello.altezza * modello.scala, modello.id);
      assert.ok(Math.max(width!, height!) >= 3000, `${modello.id}: ${width}×${height}`);
    }
  });

  it('wipe a field by filling each column from the row above to the row below', () => {
    // 1 × 9 pixels: 10 on top, 250 at the bottom, "text" (0) in rows 3–5.
    const rgb = new Uint8Array([10, 10, 10, 0, 0, 0, 250, 250, 250].flatMap((v) => [v, v, v]));
    const width = 1;
    const height = 9;
    pulisci(rgb, width, height, [[0, 3, 1, 6]]);
    const column = [...rgb].filter((_, i) => i % 3 === 0);
    assert.deepEqual(column.slice(0, 3), [10, 10, 10], 'above untouched');
    assert.deepEqual(column.slice(6), [250, 250, 250], 'below untouched');
    assert.deepEqual(column.slice(3, 6), [70, 130, 190], 'a straight line in between');
  });

  it('leave no sample text where the company data goes: the field turns smooth', async () => {
    for (const modello of MODELLI.values()) {
      const [original, cleaned] = await Promise.all(
        [originale(modello), await immagineModello(modello)].map((bytes) =>
          sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
        ),
      );
      // The picture is `scala` times the map (upscaled for print); the map stays in original pixels.
      const k = modello.scala;
      assert.equal(cleaned!.info.width, modello.larghezza * k);
      assert.equal(cleaned!.info.height, modello.altezza * k);
      // The largest field — the sample message to the people — had text; now it is a gradient.
      const [x0, y0, x1, y1] = modello.copri
        .reduce((a, b) =>
          (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]) >
          (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1])
            ? b
            : a,
        )
        .rect.map((v) => v * k) as [number, number, number, number];
      // Rows `k` apart — one row of the original — whatever the scale of the picture.
      const roughness = ({ data, info }: { data: Buffer; info: { width: number } }) => {
        let sum = 0;
        for (let y = y0; y < y1 - k; y++)
          for (let x = x0; x < x1; x++)
            sum += Math.abs(
              data[(y * info.width + x) * 3]! - data[((y + k) * info.width + x) * 3]!,
            );
        return sum / ((x1 - x0) * (y1 - y0 - k));
      };
      assert.ok(roughness(original!) > 8, `${modello.id}: the sample had text`);
      assert.ok(roughness(cleaned!) < 3, `${modello.id}: the text is still there`);
    }
  });
});

describe('the head of the cleaned templates', () => {
  it('keeps no red rule and no activity line under the logo (the owner, 30 October 2026)', async () => {
    for (const modello of MODELLI.values()) {
      const { data, info } = await sharp(await immagineModello(modello))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // From the bottom of the logo to the bottom of the first field (the sample activity line).
      const k = modello.scala;
      const [x0, , x1, y1] = modello.copri[0]!.rect.map((v) => v * k) as [
        number,
        number,
        number,
        number,
      ];
      const reddish: number[] = [];
      for (let y = (modello.logo.box[3] - 10) * k; y < y1 + 25 * k; y++) {
        let n = 0;
        for (let x = x0; x < x1; x++) {
          const i = (y * info.width + x) * 3;
          if (data[i]! - Math.max(data[i + 1]!, data[i + 2]!) > 40) n++;
        }
        if (n > (x1 - x0) * 0.15) reddish.push(y);
      }
      assert.deepEqual(reddish, [], `${modello.id}: a red rule is left on rows ${reddish}`);
    }
  });
});

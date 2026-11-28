// The templates of the stop sign "Avviso di fermo impianto": five pictures drawn from scratch by
// scripts/cartelli/disegna.py (the owner, 28 November 2026), pinned to their SHA-256, big enough to print,
// with no sample data on them (so nothing to wipe) and no activity line or red rule under the logo.
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
  it('are the five of the portal, pinned by SHA-256, the red one first', () => {
    assert.doesNotThrow(assertModelliCartello);
    assert.deepEqual([...MODELLI.keys()], [...MODELLI_ID]);
    assert.equal(MODELLI_ID.length, 5);
    assert.deepEqual(
      [...MODELLI.values()].map((m) => m.titolo),
      ['Rosso', 'Giallo e nero', 'Fuori servizio', 'Blu tecnico', 'Grafite e oro'],
    );
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

  it('are our own pictures: no sample data to wipe, and the source says so without naming the old archive', () => {
    for (const modello of MODELLI.values()) {
      assert.deepEqual(modello.copri, [], `${modello.id}: nothing to wipe`);
      assert.deepEqual(modello.scritte, [], `${modello.id}: the lettering is in the picture`);
      assert.match(modello.fonte, /Disegnato da Carbon Stealth VCC/, modello.id);
      assert.match(modello.fonte, /scripts\/cartelli\/disegna\.py/, modello.id);
      assert.match(modello.fonte, /rendering 3D/, modello.id);
      assert.doesNotMatch(modello.fonte, /\.zip|Cartelli_Riprodotti|ESRGAN|upscale/i, modello.id);
    }
  });

  it('without anything to wipe, the picture is used as it is', async () => {
    for (const modello of MODELLI.values()) {
      assert.deepEqual(await immagineModello(modello), originale(modello), modello.id);
    }
  });

  it('keep the four values and the text inside the map, the logo and the data above them', () => {
    for (const { id, larghezza, altezza, logo, azienda, valori, testo } of MODELLI.values()) {
      const [lx0, ly0, lx1, ly1] = logo.box;
      const [ax0, ay0, ax1, ay1] = azienda.box;
      assert.ok(lx1 <= ax0 && ax1 <= larghezza && ly0 >= 0 && ly1 <= valori.y, `${id}: head`);
      assert.ok(ay0 >= 0 && ay1 <= valori.y, `${id}: company data`);
      assert.ok(lx0 >= 0 && valori.y < testo.y && testo.y < altezza, `${id}: order`);
      for (const [x, w] of valori.colonne) assert.ok(x + w <= larghezza, `${id}: column`);
      assert.ok(testo.x + testo.larghezza <= larghezza, `${id}: text width`);
      const last = testo.y + (testo.righe - 1) * testo.riga;
      assert.ok(last < altezza, `${id}: the last line of the text`);
    }
  });
});

describe('wiping a field (kept for a picture with sample text)', () => {
  it('fills each column from the row above to the row below', () => {
    // 1 × 9 pixels: 10 on top, 250 at the bottom, "text" (0) in rows 3–5.
    const rgb = new Uint8Array([10, 10, 10, 0, 0, 0, 250, 250, 250].flatMap((v) => [v, v, v]));
    pulisci(rgb, 1, 9, [[0, 3, 1, 6]]);
    const column = [...rgb].filter((_, i) => i % 3 === 0);
    assert.deepEqual(column.slice(0, 3), [10, 10, 10], 'above untouched');
    assert.deepEqual(column.slice(6), [250, 250, 250], 'below untouched');
    assert.deepEqual(column.slice(3, 6), [70, 130, 190], 'a straight line in between');
  });

  it('with no field, leaves every pixel as it is', () => {
    const rgb = new Uint8Array(Array.from({ length: 5 * 4 * 3 }, (_, i) => (i * 37) % 256));
    const before = [...rgb];
    pulisci(rgb, 5, 4, []);
    assert.deepEqual([...rgb], before);
  });
});

describe('the head of the templates', () => {
  it('has no red rule and no activity line under the logo (the owner, 30 October 2026)', async () => {
    for (const modello of MODELLI.values()) {
      const { data, info } = await sharp(await immagineModello(modello))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // The strip under the head (the logo and the company data): the head has no activity line and no
      // red rule — the colour of the sign starts only after it (rows of the picture, `scala` per map pixel).
      const k = modello.scala;
      const x0 = modello.logo.box[0] * k;
      const x1 = modello.azienda.box[2] * k;
      const bottom = Math.max(modello.logo.box[3], modello.azienda.box[3]);
      const reddish: number[] = [];
      for (let y = bottom * k; y < (bottom + 10) * k; y++) {
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

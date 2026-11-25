import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';

const { IMMAGINI, fotoVista, percorsoImmagine } = await import('../src/site/immagini.js');
const { FEATURES, SCENE } = await import('../src/site/landing.js');
const { translatorFor } = await import('../src/i18n.js');

const PUBLIC = join(import.meta.dirname, '..', 'public');
const FORMATI = ['avif', 'webp'] as const;

/** The file on disk behind a `/static/…` address. */
const fileOf = (address: string): string => join(PUBLIC, address.replace(/^\/static\//, ''));

describe('the landing photos', () => {
  it('every width the page asks for exists, in AVIF and WebP, at the size the srcset says', async () => {
    for (const immagine of Object.values(IMMAGINI)) {
      for (const width of immagine.widths) {
        for (const formato of FORMATI) {
          const file = fileOf(percorsoImmagine(immagine, width, formato));
          assert.ok(existsSync(file), `${file} is missing: npm run render:encode`);
          const meta = await sharp(file).metadata();
          assert.equal(meta.width, width, file);
          assert.equal(meta.height, Math.round((width * immagine.height) / immagine.width), file);
        }
      }
    }
  });

  it('no picture is left in the folder that the page does not ask for', () => {
    const asked = new Set(
      Object.values(IMMAGINI).flatMap((immagine) =>
        immagine.widths.flatMap((width) =>
          FORMATI.map((formato) => fileOf(percorsoImmagine(immagine, width, formato))),
        ),
      ),
    );
    const dir = join(PUBLIC, 'img', 'site');
    for (const file of readdirSync(dir)) assert.ok(asked.has(join(dir, file)), file);
  });

  it('gives the browser every width with the asset version and an Italian description', () => {
    const t = translatorFor('it');
    const foto = fotoVista(IMMAGINI.vano, t, 'v1');
    assert.equal(
      foto.avif,
      IMMAGINI.vano.widths.map((w) => `/static/img/site/vano-${w}.avif?v=v1 ${w}w`).join(', '),
    );
    assert.equal(foto.src, '/static/img/site/vano-1280.webp?v=v1');
    for (const immagine of Object.values(IMMAGINI)) {
      const alt = fotoVista(immagine, t, 'v1').alt;
      assert.notEqual(alt, immagine.alt, `${immagine.alt} is not in the dictionary`);
      assert.match(alt, /^Rendering 3D /);
    }
  });

  it('shows every feature once, beside a photo, in the order of the structured data', () => {
    assert.deepEqual(
      FEATURES,
      SCENE.flatMap((scena) => scena.features),
    );
    assert.equal(new Set(FEATURES).size, 6);
    for (const scena of SCENE) assert.ok(scena.immagine in IMMAGINI);
  });
});

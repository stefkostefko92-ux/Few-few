import { readFile, writeFile } from 'node:fs/promises';
import type { OcrEngine, PageRasterizer, RunOptions } from '../src/ingest/ocr.js';
import { ToolError } from '../src/ingest/ocr.js';

/**
 * Фалшив OCR за тестовете (unit, интеграционни, e2e): истинският tesseract е в Docker образа и се
 * проверява в smoke теста. Растерът е файл с номера на страницата; „разпознатият“ текст идва от
 * функцията (по съдържанието на файла), така тестът решава коя страница какво „съдържа“.
 */

export class FakeRasterizer implements PageRasterizer {
  readonly rendered: number[] = [];
  /** Страници, чието растеризиране „пада“ (повредена страница). */
  failOn = new Set<number>();

  async render(_pdf: string, page: number, outBase: string, _opts: RunOptions): Promise<string> {
    if (this.failOn.has(page)) throw new ToolError('failed');
    this.rendered.push(page);
    const path = `${outBase}.png`;
    await writeFile(path, `PAGE:${page}`);
    return path;
  }
}

export class FakeOcr implements OcrEngine {
  readonly seen: string[] = [];
  missing = false;

  constructor(
    private readonly text: (content: string) => string = (c) => {
      const page = /^PAGE:(\d+)/.exec(c)?.[1];
      if (page) return `Pagina scansionata ${page}: morsetto X3, errore E37.`;
      if (c.includes('BLANK')) return '   \f';
      return 'Schema quadro LTX-500: relè K1, morsetto X3.';
    },
  ) {}

  async recognize(imagePath: string, _opts: RunOptions): Promise<string> {
    if (this.missing) throw new ToolError('missing');
    const content = (await readFile(imagePath)).toString('latin1');
    this.seen.push(content.slice(0, 20));
    return this.text(content);
  }
}

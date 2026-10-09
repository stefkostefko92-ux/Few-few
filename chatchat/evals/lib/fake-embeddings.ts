import {
  EMBEDDING_DIM,
  type EmbeddingInput,
  type EmbeddingModel,
} from '../../src/ai/embeddings.js';

/**
 * САМО за тестове и оценка без GCP: детерминистичен „embedding“ чрез хеширане на думи и
 * триграми в 768 кофи (feature hashing), L2-нормализиран. Близост = общи думи/срички, НЕ смисъл —
 * проверява тръбопровода (SQL, филтри, RRF, fail-open), не качеството на семантичното търсене.
 * Идентичността му е различна от истинския модел, затова векторите никога не се смесват.
 */

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function hashEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    v[h % dim] = (v[h % dim] ?? 0) + (h & 0x80000000 ? -weight : weight);
  };
  for (const word of fold(text).split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 2) continue;
    add(`w:${word}`, 1);
    const padded = ` ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) add(`t:${padded.slice(i, i + 3)}`, 0.35);
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) {
    v[0] = 1;
    return v;
  }
  return v.map((x) => x / norm);
}

export class HashEmbeddingModel implements EmbeddingModel {
  readonly id: string = `fake-hash@${EMBEDDING_DIM}`;
  calls = 0;
  /** Тестовете включват повреда, за да проверят fail-open. */
  failWith: Error | null = null;

  async embed(inputs: EmbeddingInput[]): Promise<number[][]> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return inputs.map((i) => hashEmbedding(i.text));
  }
}

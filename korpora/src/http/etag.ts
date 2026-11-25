import { createHash } from 'node:crypto';

/** Атрибутът, с който страницата носи nonce на своя отговор (CSP) — `nonce="<%= cspNonce %>"`. */
const NONCE_MARK = Buffer.from('nonce="');

/**
 * Слаб ETag от тялото (като този на Express) за всичко, което `res.send` праща — sitemap, robots, llms,
 * манифестът, чертежите в /media — освен за тяло с nonce: такава страница е различна при всяка заявка, ETag-ът ѝ
 * никога не би съвпаднал пак, а 304 със стара страница би сблъскал стария nonce с новия CSP. `undefined` = без
 * ETag (Express слага заглавката само при истинна стойност).
 */
export function bodyEtag(body: Buffer | string, encoding?: BufferEncoding): string | undefined {
  const buf = typeof body === 'string' ? Buffer.from(body, encoding) : body;
  if (buf.includes(NONCE_MARK)) return undefined;
  const hash = createHash('sha1').update(buf).digest('base64url').slice(0, 27);
  return `W/"${buf.length.toString(16)}-${hash}"`;
}

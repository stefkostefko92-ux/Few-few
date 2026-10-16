// The proof of the specific approval of the clauses (arts. 1341–1342 c.c., round 48): the articles named are exactly
// the placeholders of register.clauses, and the SHA-256 kept with every approval is that of the text as the page shows
// it, with today's article numbers — so the record says which words, under which numbers, were approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import it from '../../../messages/it.json';
import { article } from '../legal';
import { CLAUSE_ARTICLES, clausesProof, clausesText } from '../legal-text';

test('the clauses’ articles are the placeholders of register.clauses, in their order', () => {
  const placeholders = [...it.register.clauses.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  assert.deepEqual(placeholders, [...CLAUSE_ARTICLES]);
});

test('the proof: the SHA-256 of the text shown, with the article numbers, and the numbers themselves', () => {
  const text = clausesText('it');
  assert.ok(!/[{}]/.test(text), 'every number filled in');
  for (const k of CLAUSE_ARTICLES) assert.ok(text.includes(`art. ${article(k)} (`), `art. ${article(k)}`);
  const proof = clausesProof('it');
  assert.equal(proof.clausesSha256, createHash('sha256').update(text, 'utf8').digest('hex'));
  assert.match(proof.clausesSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(proof.clauseArticles, CLAUSE_ARTICLES.map(article));
  assert.deepEqual(clausesProof('it'), proof, 'the same text, the same proof');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorBreak, type Anchor } from '../src/audit-anchor.js';
import { canonicalJson } from '../src/crypto.js';

const head = (id: number, hash = `h${id}`) => ({ id, hash });

test('without an anchor there is nothing to compare', () => {
  assert.equal(anchorBreak(null, { base: null, lastId: 0, headHash: null }), null);
});

test('an intact chain matches its anchor, before and after retention', () => {
  const fresh: Anchor = { head: head(5), base: null };
  assert.equal(anchorBreak(fresh, { base: null, lastId: 7, headHash: 'h5' }), null);
  // every entry up to the head was pruned; the anchor knows the new start
  const pruned: Anchor = { head: head(5), base: head(5) };
  assert.equal(anchorBreak(pruned, { base: head(5), lastId: 5, headHash: null }), null);
  const later: Anchor = { head: head(8), base: head(5) };
  assert.equal(anchorBreak(later, { base: head(5), lastId: 8, headHash: 'h8' }), null);
});

test('a cut tail or a changed head entry breaks at the anchor', () => {
  const anchor: Anchor = { head: head(5), base: null };
  assert.equal(anchorBreak(anchor, { base: null, lastId: 4, headHash: null }), 5);
  assert.equal(anchorBreak(anchor, { base: null, lastId: 5, headHash: 'other' }), 5);
});

test('a start forged in the database is not trusted', () => {
  const anchor: Anchor = { head: head(5), base: null };
  // log wiped and a fake AuditBase past the head: the head entry is gone, but the anchor never pruned it
  assert.equal(anchorBreak(anchor, { base: head(9, 'x'), lastId: 9, headHash: null }), 5);
  // the oldest entries cut and AuditBase pointed at the last cut one
  assert.equal(anchorBreak(anchor, { base: head(2), lastId: 7, headHash: 'h5' }), 2);
  // a pruned start swapped or removed
  const pruned: Anchor = { head: head(8), base: head(5) };
  assert.equal(anchorBreak(pruned, { base: head(5, 'x'), lastId: 8, headHash: 'h8' }), 5);
  assert.equal(anchorBreak(pruned, { base: head(6), lastId: 8, headHash: 'h8' }), 5);
  assert.equal(anchorBreak(pruned, { base: null, lastId: 8, headHash: 'h8' }), 5);
});

test('canonical JSON sorts keys and drops undefined values', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: undefined, c: 'x' }] }), '{"a":[{"c":"x"}],"b":1}');
});

import assert from 'node:assert/strict';

/** One node of the page's JSON-LD `@graph`. */
export type LdNode = Record<string, unknown> & { '@type': string | string[] };

/** The `@graph` of the page's JSON-LD block — fails with a clear message when there is none. */
export function graph(page: string): LdNode[] {
  const ld = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(page)?.[1];
  assert.ok(ld, 'JSON-LD on the page');
  const parsed = JSON.parse(ld) as { '@graph'?: unknown };
  assert.ok(Array.isArray(parsed['@graph']), 'JSON-LD has a @graph');
  return parsed['@graph'] as LdNode[];
}

/** The node of the given type (a node may carry several types). */
export function ofType(nodes: LdNode[], type: string): LdNode {
  const found = nodes.find((node) => [node['@type']].flat().includes(type));
  assert.ok(found, type);
  return found;
}

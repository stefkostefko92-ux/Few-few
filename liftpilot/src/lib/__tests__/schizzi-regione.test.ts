// The region of the sketches' reading (round 50, VERTEX_REGION in src/lib/env-schema.ts): Claude on Vertex AI only in
// the European Union, as /data tells the customers — the multi-region `eu` or one of the EU-27 europe-* regions named
// one by one; London (europe-west2), Zurich (europe-west6), any other continent, `global` or a region not on the list stop
// the start. Unset or empty: `eu`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERTEX_REGIONS, parseEnv } from '../env-schema';

const base = { DATABASE_URL: 'postgresql://x/y', AUTH_SECRET: 'a'.repeat(40) };

test('VERTEX_REGION: solo eu e le regioni europe-* dei 27 paesi UE', () => {
  const eu = ['eu', 'europe-west1', 'europe-west3', 'europe-west4', 'europe-west8', 'europe-west9', 'europe-west10', 'europe-west12',
    'europe-north1', 'europe-north2', 'europe-central2', 'europe-southwest1'];
  assert.deepEqual([...VERTEX_REGIONS].sort(), [...eu].sort());
  for (const r of eu) assert.equal(parseEnv({ ...base, VERTEX_REGION: r }).VERTEX_REGION, r, r);
  assert.equal(parseEnv(base).VERTEX_REGION, 'eu', 'unset');
  assert.equal(parseEnv({ ...base, VERTEX_REGION: ' ' }).VERTEX_REGION, 'eu', 'empty (Docker Compose)');
  for (const r of ['europe-west2', 'europe-west6', 'europe-west99', 'europe-east1', 'global', 'us-east5', 'asia-southeast1', 'EU', 'europe-west1x']) {
    assert.throws(() => parseEnv({ ...base, VERTEX_REGION: r }), /VERTEX_REGION/, r);
  }
});

import assert from 'node:assert/strict';
import { jpegSized } from '../file-fixtures.js';
import { cite, type Harness, type Plan } from './helpers.js';
import { cleanUpload, uploadPdf } from './files.js';
import { MODEL, answerOf, ask, newCase, type World } from './world.js';
import { makeSchematicPdf } from './schematic.js';

/**
 * Демо за визуализатора на схеми (ui-demo.ts): публикувана схема с оригинален PDF (вектор + етикети
 * K1, K2, X3, S12), документ БЕЗ оригинал (въведен като JSON), и портален случай, чийто AI отговор
 * цитира схемата и носи наблюдение по снимка.
 */
export async function seedViewerDemo(h: Harness, w: World) {
  const up = await uploadPdf(w.ownerA1, makeSchematicPdf(), 'LTX500-ELEC-017.pdf');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const res = await w.ownerA1.post('/api/v1/admin/documents', {
    code: 'LTX500-ELEC',
    title: 'Schema elettrico LTX-500',
    type: 'SCHEMATIC',
    language: 'it',
    revision: 'C',
    audience: 'PORTAL',
    safetyRelevant: false,
    subsystem: 'safety_chain',
    applicability: [{ productModel: MODEL }],
    sourceAttachmentId: up.body.attachment.id,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const schematicId = res.body.documentId as string;
  assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${schematicId}/submit`)).status, 204);
  assert.equal(
    (await w.ownerA1.post(`/api/v1/admin/documents/${schematicId}/publish`)).status,
    204,
  );

  const plan: Plan = (pack) => {
    const item = pack.find((p) => p.documentCode === 'LTX500-ELEC') ?? pack[0];
    if (!item) return {};
    return {
      summary:
        'Il contatto porta apre la catena di sicurezza: controllare K1/K2 e il morsetto X3:4.',
      causes: [
        { text: 'Contatto porta di piano aperto sulla catena (K1, K2).', evidenceRefs: [item.ref] },
      ],
      checks: [
        {
          step: 1,
          action: 'Verificare con il multimetro la continuità tra K1 e K2 a impianto fermo.',
          expected: 'Continuità tra le bobine.',
          actionClass: 'DIAGNOSTIC',
          evidenceRefs: [item.ref],
        },
      ],
      evidenceUsed: [cite(item)],
      photoObservations: [
        {
          ref: 'P1',
          readability: 'partial',
          subject: 'terminals',
          visibleText: [],
          errorCodes: [],
          nameplate: null,
          terminalLabels: ['X3:3', 'X3:4'],
          note: 'Il cavo sul morsetto X3:4 sembra scollegato, ma la foto è parziale.',
          confidence: 'low',
        },
      ],
    };
  };
  h.model.plan = plan;
  const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
  const photo = await cleanUpload(
    w.portalAlfa,
    caseId,
    'PHOTO',
    jpegSized(640, 480),
    'morsetti.jpg',
  );
  const asked = await ask(w.portalAlfa, caseId, 'E37 catena di sicurezza K1 K2 X3:4', {
    attachmentIds: [photo],
  });
  const answer = answerOf(asked);
  h.model.reset();
  return {
    schematicId,
    caseId,
    answerEvidence: answer.evidence.map((e: { ref: string }) => e.ref),
  };
}

// The company export a page at a time (src/server/company-export.ts): the logos, the installations, the survey sheets and
// the activity log read up to the last row there was when the export began — the export's own audit entry, written after,
// stays out, even at the same instant —, in the lists' order (createdAt, then id), a row deleted between two pages left
// out; and the whole text the same JSON.stringify gives for the document read at once (the file did not change, format 12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT, PROJECTS, auditPages, oldest, projectPages, src, type Doc, type Row } from './company-export-db';

test('l’esportazione a pagine: tutte le righe fino all’ultima di quando è iniziata, nell’ordine, lo stesso testo di tutto in una volta', async () => {
  const { companyExport, exportStream, EXPORT_PAGES } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE } = await import(src('lib/export-format.ts'));
  const at = (n: number) => new Date(Date.UTC(2026, 9, 3, 8, 0, n));
  // more than two pages of each list: installations and entries created at the same instant come by id
  const nProjects = 2 * EXPORT_PAGES.projects + 3, nAudit = 2 * EXPORT_PAGES.auditLog + 3;
  for (let i = 0; i < nProjects; i++) PROJECTS.push({ id: `q${String(i).padStart(3, '0')}`, companyId: 'c1', name: `Impianto ${i}`, createdAt: at(i % 7), clientLogos: [] });
  for (let i = 0; i < nAudit; i++) {
    AUDIT.push({ id: `f${String(nAudit - i).padStart(4, '0')}`, companyId: 'c1', userId: 'u1', action: 'X', entity: 'Project', entityId: null, meta: { i },
      createdAt: at(i % 11) });
  }
  const head = await companyExport('c1');
  assert.ok(head);
  // after the export began (the route writes its audit entry then): not in it, even at the same instant as the last row
  const end = head.ends.auditLog;
  assert.ok(end);
  AUDIT.push({ id: 'zzz', companyId: 'c1', userId: 'u1', action: 'DATA_EXPORTED', entity: 'Company', entityId: 'c1', meta: null, createdAt: end.createdAt },
    { id: 'e-after', companyId: 'c1', userId: 'u1', action: 'DATA_EXPORTED', entity: 'Company', entityId: 'c1', meta: null, createdAt: new Date('2027-01-01') });
  // a row of the last page deleted while the first is written is left out
  const upToEnd = AUDIT.filter((e) => e.companyId === 'c1' && oldest(e, { createdAt: end.createdAt, id: end.id }) <= 0).sort(oldest);
  const victim = upToEnd.at(-2)?.id;
  const expectedAudit = upToEnd.filter((e) => e.id !== victim)
    .map(({ createdAt, userId, action, entity, entityId, meta }) => ({ createdAt, userId, action, entity, entityId, meta }));
  const expectedProjects = PROJECTS.filter((p) => p.companyId === 'c1').sort(oldest)
    .map(({ clientLogos, ...p }) => ({ ...p, clientLogos: (clientLogos as Row[]).map(({ data, ...l }) => ({ ...l, base64: Buffer.from(data as Uint8Array).toString('base64') })) }));
  auditPages.length = projectPages.length = 0;
  const stream = exportStream(head, 'c1'), reader = stream.getReader(), parts: Buffer[] = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    parts.push(Buffer.from(r.value));
    const gone = AUDIT.findIndex((e) => e.id === victim);
    if (auditPages.length === 1 && gone >= 0) AUDIT.splice(gone, 1);
  }
  const text = Buffer.concat(parts).toString('utf8');
  const json = JSON.parse(text) as Doc;
  assert.equal(auditPages.length, 3, 'three pages of entries');
  assert.ok(auditPages.every((a) => a.take === EXPORT_PAGES.auditLog && a.where?.companyId === 'c1'));
  assert.equal(projectPages.length, 3);
  assert.ok(projectPages.every((a) => a.take === EXPORT_PAGES.projects && a.where?.companyId === 'c1'));
  assert.equal(json.auditLog.length, nAudit, 'every entry until the last of when it began, the deleted one left out');
  assert.ok(!text.includes('DATA_EXPORTED'), 'the export’s own entry is written after it began');
  // the whole document as JSON.stringify writes it read at once: the file is the same as before the pages
  const files = json.attachments;
  const whole: Record<string, unknown> = { ...head.data, logos: json.logos, projects: expectedProjects, schede: json.schede, auditLog: expectedAudit,
    attachments: files };
  const ordered = Object.fromEntries([...EXPORT_ENVELOPE, ...EXPORT_DATA].map((k) => [k, whole[k]]));
  assert.equal(text, JSON.stringify(ordered, null, 2));
});


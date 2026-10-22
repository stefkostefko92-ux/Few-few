// The drawings in SVG (round 50), where the smoke test meets them: a saved lift design's exports (the draft PDF, every
// view in DXF and DWG, its sheets in SVG — a ZIP, sheet 1 and the checks among them) and its shaft's plan in SVG beside
// the DXF (one file, at 1:20, with its font); an issued set's sheets in SVG, one file per sheet. Every SVG or ZIP of
// them is sandboxed (no source allowed) besides the attachment's headers.
import assert from 'node:assert/strict';

/** The first bytes of a ZIP of sheets, and of one sheet. */
export const ZIP = 'PK\u0003\u0004', SVG = '<?xml';

/** The file at `url`: answered, starting with `magic`; an SVG or a ZIP of them sandboxed and an attachment. */
export async function fetchFile(page, url, magic, label) {
  const res = await page.request.get(url);
  assert.equal(res.status(), 200, label);
  const body = await res.body();
  assert.equal(body.subarray(0, magic.length).toString('latin1'), magic, label);
  if (magic === ZIP || magic === SVG) {
    assert.equal(res.headers()['content-security-policy'], "sandbox; default-src 'none'", `${label}: sandbox`);
    assert.match(res.headers()['content-disposition'] ?? '', /^attachment; filename="[\w.-]+\.(svg|zip)"$/, `${label}: attachment`);
  }
  return body;
}

/** The number of entries of a ZIP (its end record). */
const zipEntries = (b) => b.readUInt16LE(b.length - 22 + 10);

/** On a saved lift design's page: its exports in the four formats, and its shaft's plan in SVG. */
export async function liftExports({ BASE, page }) {
  for (const [format, magic] of [['pdf', '%PDF-'], ['dxf', '  0\nSECTION'], ['dwg', 'AC1015'], ['svg', ZIP]]) {
    const body = await fetchFile(page, `${BASE}${await page.getAttribute(`a[href^="/api/lift-designs/"][href$="/${format}"]`, 'href')}`, magic, format);
    if (format === 'svg') assert.ok(zipEntries(body) >= 8, 'the draft’s sheets, one SVG each');
  }
  const plan = (await fetchFile(page, `${BASE}${await page.getAttribute('.doc-links a[href^="/api/shaft-designs/"][href$="/svg"]', 'href')}`, SVG, 'plan SVG')).toString('utf8');
  assert.ok(plan.includes('Scala di stampa 1:20') && plan.includes('@font-face{font-family:LiftPilotDejaVu'), 'the plan at 1:20 with its font');
}

/** On an issued set's page: its sheets in SVG, as many as the set has. */
export async function setSvg({ BASE, page, sheets }) {
  const zip = await fetchFile(page, `${BASE}${await page.getAttribute('a[href^="/api/drawing-sets/"][href$="/svg"]', 'href')}`, ZIP, 'set SVG');
  assert.equal(zipEntries(zip), sheets, 'one SVG per sheet of the set');
}

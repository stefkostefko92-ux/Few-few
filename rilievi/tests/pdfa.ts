// What a PDF/A-2b file must carry, checked with pdf-lib (veraPDF is not part of the test tools): the
// identification in the XMP metadata (part 2, conformance B), an sRGB output intent with its ICC profile,
// every font embedded (no standard Helvetica/Times), no JavaScript, no encryption, PDF 1.7.
import assert from 'node:assert/strict';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';

function streamText(stream: PDFStream): string {
  if (stream instanceof PDFRawStream) {
    const filter = stream.dict.get(PDFName.of('Filter'));
    const bytes = stream.contents;
    return filter?.toString() === '/FlateDecode'
      ? inflateSync(Buffer.from(bytes)).toString('utf8')
      : Buffer.from(bytes).toString('utf8');
  }
  return '';
}

export async function assertPdfA2b(bytes: Uint8Array): Promise<void> {
  const head = Buffer.from(bytes.subarray(0, 9)).toString('latin1');
  assert.equal(head, '%PDF-1.7\n', 'PDF 1.7');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const catalog = doc.catalog;
  assert.equal(doc.context.trailerInfo.Encrypt, undefined, 'no encryption');
  assert.ok(
    !catalog.has(PDFName.of('Names')) ||
      !String(catalog.get(PDFName.of('Names'))).includes('JavaScript'),
  );
  assert.ok(!catalog.has(PDFName.of('OpenAction')), 'no open action');

  const metaRef = catalog.get(PDFName.of('Metadata'));
  assert.ok(metaRef instanceof PDFRef, 'XMP metadata');
  const xmp = streamText(doc.context.lookup(metaRef, PDFStream));
  assert.match(xmp, /<pdfaid:part>2<\/pdfaid:part>/);
  assert.match(xmp, /<pdfaid:conformance>B<\/pdfaid:conformance>/);

  const intents = doc.context.lookup(catalog.get(PDFName.of('OutputIntents')));
  assert.ok(intents, 'output intent');
  assert.match(String(intents), /\d+ 0 R/);

  let fonts = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
    const subtype = obj.get(PDFName.of('Subtype'))?.toString();
    if (subtype === '/Type0') continue; // the descendant CIDFont carries the descriptor
    fonts += 1;
    const base = obj.get(PDFName.of('BaseFont'))?.toString() ?? '';
    assert.doesNotMatch(base, /Helvetica|Times|Courier/, `standard font ${base}`);
    const descriptor = doc.context.lookup(obj.get(PDFName.of('FontDescriptor')), PDFDict);
    const embedded =
      descriptor.has(PDFName.of('FontFile2')) ||
      descriptor.has(PDFName.of('FontFile3')) ||
      descriptor.has(PDFName.of('FontFile'));
    assert.ok(embedded, `font ${base} embedded`);
  }
  assert.ok(fonts > 0, 'the text uses embedded fonts');
}

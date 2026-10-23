// The dates and identifiers of a CAD file (export.ts cadDocument): created and saved at its record's date — local
// (Italy's wall clock: $TDCREATE/$TDUPDATE) and universal ($TDUCREATE/$TDUUPDATE) — and its fingerprint and version
// GUIDs named from that date and from the lines under its first view (acad-ts would take the clock and random ones),
// so every download of a record gives the same bytes. acad-ts writes a DXF date from the local fields of a Date
// (CadUtils.toJulianCalendar: the process's time zone) and a DWG date from its instant (getTime): the dates handed to it
// read the same in both (FieldsDate), so the file is the same on any host, whatever its TZ (production pins TZ=UTC).
import { createHash } from 'node:crypto';
import type { acad } from './acad';

/** The wall-clock time in Italy of an instant, as a date whose UTC fields read it (a CAD file's local dates). */
function romeClock(at: Date): Date {
  const p = new Map<string, number>(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at).map((x) => [x.type, Number(x.value)]));
  const n = (k: string): number => p.get(k) ?? 0;
  return new Date(Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'), at.getUTCMilliseconds()));
}

/** A date whose local fields are its UTC ones: what acad-ts reads to write a DXF date (CadUtils.toJulianCalendar:
 *  getFullYear…getMilliseconds) is then the clock meant whatever the host's time zone, with no hour lost or doubled at
 *  its daylight saving changes; a DWG date is written from the instant (getTime), which this leaves alone. */
class FieldsDate extends Date {
  override getFullYear(): number { return this.getUTCFullYear(); }
  override getMonth(): number { return this.getUTCMonth(); }
  override getDate(): number { return this.getUTCDate(); }
  override getDay(): number { return this.getUTCDay(); }
  override getHours(): number { return this.getUTCHours(); }
  override getMinutes(): number { return this.getUTCMinutes(); }
  override getSeconds(): number { return this.getUTCSeconds(); }
  override getMilliseconds(): number { return this.getUTCMilliseconds(); }
  override getTimezoneOffset(): number { return 0; }
}

/** A GUID made from a text (a name-based one: the same text, the same GUID). */
function guidOf(text: string): string {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.charAt(16), 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** A file's dates — created and saved at `at`, local (Italy) and universal — and its fingerprint and version GUIDs
 *  (acad-ts would take the clock and random ones) from that date and the lines under its first view. */
export function stamp(doc: acad.CadDocument, header: acad.CadHeader, at: Date, under: readonly string[]): void {
  const local = romeClock(at), what = `${under.join('\n')}\n${at.toISOString()}`;
  header.createDateTime = new FieldsDate(local.getTime());
  header.updateDateTime = new FieldsDate(local.getTime());
  header.universalCreateDateTime = new FieldsDate(at.getTime());
  header.universalUpdateDateTime = new FieldsDate(at.getTime());
  header.fingerPrintGuid = guidOf(`fingerprint\n${what}`);
  header.versionGuid = guidOf(`version\n${what}`);
  if (doc.summaryInfo) {
    doc.summaryInfo.createdDate = new FieldsDate(local.getTime());
    doc.summaryInfo.modifiedDate = new FieldsDate(local.getTime());
  }
}

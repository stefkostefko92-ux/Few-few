import type { Project } from '@prisma/client';
import { zipSync, type Zippable } from 'fflate';
import { DEFAULT_LOCALE, translatorFor, type Locale, type Translator } from '../i18n.js';
import {
  engine,
  specOf,
  type DrawingMeta,
  type EngineModel,
  type EngineNesting,
} from './engine.js';

/**
 * Изходите на проекта се смятат на СЪРВЪРА от ЗАПАЗЕНАТА спецификация — затова изтекъл акаунт
 * изтегля точно това, което е направил, но не и нещо ново. Нищо от клиента не влиза в изхода.
 * Езикът (имената на детайлите, проверките, заглавията на CSV, чертежите, README) е езикът на екрана;
 * числата, отворите и CNC програмите са едни и същи на всеки език.
 */
export type ExportFile = { name: string; mime: string; body: Buffer };

/**
 * CNC файловете не се издават, докато проверките на конструкцията намират грешка (отвор извън детайла, детайл
 * по-голям от листа, врата извън таблицата на пантите…): G-code и DXF не бива никога да са грешни.
 */
export class CncBlockedError extends Error {
  constructor(readonly reasons: string[]) {
    super('CNC blocked');
    this.name = 'CncBlockedError';
  }
}

const CSV = 'text/csv; charset=utf-8';
const BOM = '\uFEFF'; // Excel разпознава UTF-8 (кирилицата, „€“, „×“) само с BOM

interface Built {
  model: EngineModel;
  meta: DrawingMeta;
  base: string;
  t: Translator;
}

interface Machining {
  nesting: EngineNesting;
  blockers: string[];
}

function build(project: Project, owner: string, locale: Locale): Built {
  const api = engine();
  const spec = specOf(project.spec);
  const model = api.buildModel(spec, { lang: locale });
  // Обков или декор, който вече го няма в каталога, двигателят тихо сменя с първия от списъка. Като грешка в
  // проверките това спира CNC, а чертежите и README го показват: изходът не е за избраното от клиента.
  for (const reason of api.catalogDrift(spec, model)) {
    model.warnings.push({ level: 'error', text: reason });
  }
  const meta: DrawingMeta = {
    product: 'Korpora',
    hash: project.specHash,
    owner,
    date: project.updatedAt.toISOString().slice(0, 10),
  };
  const slug =
    api
      .asciiName(project.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'project';
  return {
    model,
    meta,
    base: `korpora-${slug}-${project.specHash.slice(0, 8)}`,
    t: translatorFor(locale),
  };
}

/** Разкроят и проверките за CNC — само за изходите, които ги ползват (CSV и чертежите не ги чакат). */
function machining(b: Built): Machining {
  const api = engine();
  const nesting = api.nest(b.model);
  return { nesting, blockers: api.cncBlockers(b.model, nesting) };
}

function text(body: string): Buffer {
  return Buffer.from(body, 'utf8');
}

/** Всички листове от разкроя: DXF и G-code (постпроцесорът е от спецификацията). */
function cncFiles(b: Built, m: Machining): Record<string, Buffer> {
  if (m.blockers.length) throw new CncBlockedError(m.blockers);
  const api = engine();
  const out: Record<string, Buffer> = {};
  const meta = { ...b.meta, sheetCount: m.nesting.sheets.length };
  for (const sheet of m.nesting.sheets) {
    // името идва от двигателя — същото показва и разделът CNC в редактора
    out[api.cncFileName(sheet.index, 'dxf')] = text(api.toDxf(b.model, sheet).text);
    out[api.cncFileName(sheet.index, 'nc')] = text(api.toGcode(b.model, sheet, meta).text);
  }
  return out;
}

/**
 * Двигателят номерира листовете сам (`drawingSheets`) — същите номера като в редактора и на витрината. Името на
 * файла започва с номера на листа: 01-assembly.svg е сглобеният чертеж (лист 1), детайлите следват от 02.
 */
const ASSEMBLY_SHEET = 1;
const sheetFile = (no: number, name: string) => `${String(no).padStart(2, '0')}-${name}.svg`;

function drawingFiles(b: Built): Record<string, Buffer> {
  const api = engine();
  const out: Record<string, Buffer> = {
    [sheetFile(ASSEMBLY_SHEET, 'assembly')]: text(api.drawingAssembly(b.model, b.meta)),
  };
  for (const { part, no } of api.drawingSheets(b.model).parts) {
    out[sheetFile(no, part.id)] = text(api.drawingPart(b.model, b.meta, part.id));
  }
  return out;
}

type CsvKind = Extract<ExportKind, `${string}.csv`>;

function csvFiles(b: Built): Record<CsvKind, Buffer> {
  const api = engine();
  const bom = api.buildBom(b.model);
  return {
    'cut-list.csv': text(BOM + api.cutListCsv(bom)),
    'hardware.csv': text(BOM + api.hardwareCsv(bom)),
    'drilling.csv': text(BOM + api.drillCsv(b.model)),
  };
}

function zip(files: Record<string, Buffer>): Buffer {
  const entries: Zippable = {};
  for (const [name, body] of Object.entries(files)) entries[name] = new Uint8Array(body);
  return Buffer.from(zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') }));
}

const EXPORT_KINDS = [
  'cut-list.csv',
  'hardware.csv',
  'drilling.csv',
  'drawings.zip',
  'cnc.zip',
  'project.zip',
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: unknown): value is ExportKind {
  return typeof value === 'string' && (EXPORT_KINDS as readonly string[]).includes(value);
}

export function buildExport(
  project: Project,
  owner: string,
  kind: ExportKind,
  locale: Locale = DEFAULT_LOCALE,
): ExportFile {
  const b = build(project, owner, locale);
  switch (kind) {
    case 'cut-list.csv':
    case 'hardware.csv':
    case 'drilling.csv':
      return { name: `${b.base}-${kind}`, mime: CSV, body: csvFiles(b)[kind] };
    case 'drawings.zip':
      return {
        name: `${b.base}-drawings.zip`,
        mime: 'application/zip',
        body: zip(drawingFiles(b)),
      };
    case 'cnc.zip':
      return {
        name: `${b.base}-cnc.zip`,
        mime: 'application/zip',
        body: zip(cncFiles(b, machining(b))),
      };
    case 'project.zip': {
      const m = machining(b);
      const spec = {
        schema: 'korpora.project/1',
        name: project.name,
        type: project.type,
        specHash: project.specHash,
        updatedAt: project.updatedAt.toISOString(),
        spec: b.model.spec,
      };
      const files: Record<string, Buffer> = {
        'project.json': text(`${JSON.stringify(spec, null, 2)}\n`),
      };
      for (const [name, body] of Object.entries(csvFiles(b))) files[name] = body;
      for (const [name, body] of Object.entries(drawingFiles(b))) files[`drawings/${name}`] = body;
      // с грешка в конструкцията архивът се издава без cnc/ — README казва защо
      if (!m.blockers.length) {
        for (const [name, body] of Object.entries(cncFiles(b, m))) files[`cnc/${name}`] = body;
      }
      files['README.txt'] = text(readme(project, b, m.blockers));
      return { name: `${b.base}.zip`, mime: 'application/zip', body: zip(files) };
    }
  }
}

const README_WIDTH = 100;
const COLUMN = 15;

/** Пренася текста на думи до README_WIDTH; продължението е отместено с `indent` интервала. */
function wrap(text: string, first: string, indent: number): string[] {
  const lines: string[] = [];
  let line = first;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const head = line.trim() === '' || line === first;
    if (!head && line.length + 1 + word.length > README_WIDTH) {
      lines.push(line);
      line = ' '.repeat(indent) + word;
    } else line = head && line === first ? `${first}${word}` : `${line} ${word}`;
  }
  lines.push(line);
  return lines;
}

/** Ред „файл   какво е“: името в първата колона, описанието пренесено под себе си. */
const entry = (name: string, text: string): string[] => wrap(text, name.padEnd(COLUMN), COLUMN);

function readme(project: Project, b: Built, blockers: string[]): string {
  const { t } = b;
  const warnings = b.model.warnings.length
    ? b.model.warnings.flatMap((w) => wrap(w.text, `- [${t(`exports.level.${w.level}`)}] `, 2))
    : [`- ${t('exports.none')}`];
  const cnc = blockers.length
    ? [
        ...entry('cnc/', t('exports.cncBlocked')),
        ...blockers.flatMap((r) => wrap(r, `${' '.repeat(COLUMN)}- `, COLUMN + 2)),
      ]
    : entry('cnc/', t('exports.cnc'));
  return [
    `Korpora — ${project.name}`,
    t('exports.hash', { hash: project.specHash }),
    t('exports.saved', { at: project.updatedAt.toISOString() }),
    '',
    ...entry('cut-list.csv', t('exports.cutList')),
    ...entry('hardware.csv', t('exports.hardware')),
    ...entry('drilling.csv', t('exports.drilling')),
    ...entry(
      'drawings/',
      t('exports.drawings', { assembly: sheetFile(ASSEMBLY_SHEET, 'assembly') }),
    ),
    ...cnc,
    '',
    t('exports.checks'),
    ...warnings,
    '',
    ...wrap(t('exports.machine'), '', 0),
    '',
  ].join('\n');
}

/** Content-Disposition с име на латиница и UTF-8 вариант (RFC 6266/5987). */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

import type { Project } from '@prisma/client';
import { zipSync, type Zippable } from 'fflate';
import { engine, type DrawingMeta, type EngineModel, type Spec } from './engine.js';

/**
 * Изходите на проекта се смятат на СЪРВЪРА от ЗАПАЗЕНАТА спецификация — затова изтекъл акаунт
 * изтегля точно това, което е направил, но не и нещо ново. Нищо от клиента не влиза в изхода.
 */
export type ExportFile = { name: string; mime: string; body: Buffer };

const CSV = 'text/csv; charset=utf-8';
const BOM = '﻿'; // Excel разпознава UTF-8 (кирилицата) само с BOM

interface Built {
  model: EngineModel;
  meta: DrawingMeta;
  base: string;
}

function build(project: Project, owner: string): Built {
  const api = engine();
  const spec = (
    project.spec && typeof project.spec === 'object' && !Array.isArray(project.spec)
      ? project.spec
      : {}
  ) as Spec;
  const model = api.buildModel(spec);
  const meta: DrawingMeta = {
    product: 'Rendetto',
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
  return { model, meta, base: `rendetto-${slug}-${project.specHash.slice(0, 8)}` };
}

function text(body: string): Buffer {
  return Buffer.from(body, 'utf8');
}

/** Всички листове от разкроя: DXF и G-code (постпроцесорът е от спецификацията). */
function cncFiles(b: Built): Record<string, Buffer> {
  const api = engine();
  const nesting = api.nest(b.model);
  const out: Record<string, Buffer> = {};
  const meta = { ...b.meta, sheetCount: nesting.sheets.length };
  for (const sheet of nesting.sheets) {
    const n = String(sheet.index).padStart(2, '0');
    out[`sheet-${n}.dxf`] = text(api.toDxf(b.model, sheet, meta).text);
    out[`sheet-${n}.nc`] = text(api.toGcode(b.model, sheet, meta).text);
  }
  return out;
}

function drawingFiles(b: Built): Record<string, Buffer> {
  const api = engine();
  const parts = b.model.parts;
  const count = parts.length + 1;
  const out: Record<string, Buffer> = {
    '00-assembly.svg': text(api.drawingAssembly(b.model, b.meta, 1, count)),
  };
  parts.forEach((part, i) => {
    out[`${String(i + 2).padStart(2, '0')}-${part.id}.svg`] = text(
      api.drawingPart(b.model, b.meta, part.id, i + 2, count),
    );
  });
  return out;
}

function csvFiles(b: Built): Record<string, Buffer> {
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

export const EXPORT_KINDS = [
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

export function buildExport(project: Project, owner: string, kind: ExportKind): ExportFile {
  const b = build(project, owner);
  switch (kind) {
    case 'cut-list.csv':
    case 'hardware.csv':
    case 'drilling.csv':
      return { name: `${b.base}-${kind}`, mime: CSV, body: csvFiles(b)[kind]! };
    case 'drawings.zip':
      return {
        name: `${b.base}-drawings.zip`,
        mime: 'application/zip',
        body: zip(drawingFiles(b)),
      };
    case 'cnc.zip':
      return { name: `${b.base}-cnc.zip`, mime: 'application/zip', body: zip(cncFiles(b)) };
    case 'project.zip': {
      const spec = {
        schema: 'rendetto.project/1',
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
      for (const [name, body] of Object.entries(cncFiles(b))) files[`cnc/${name}`] = body;
      files['README.txt'] = text(readme(project, b));
      return { name: `${b.base}.zip`, mime: 'application/zip', body: zip(files) };
    }
  }
}

function readme(project: Project, b: Built): string {
  const warnings = b.model.warnings.map((w) => `- [${w.level}] ${w.text}`).join('\n') || '- няма';
  return [
    `Rendetto — ${project.name}`,
    `Спецификация SHA-256: ${project.specHash}`,
    `Запазена: ${project.updatedAt.toISOString()}`,
    '',
    'cut-list.csv   детайлите за разкрой (размери за рязане, кант, декор)',
    'hardware.csv   обковът и крепежите',
    'drilling.csv   всеки отвор: детайл, лице, координати, диаметър, дълбочина',
    'drawings/      сглобен чертеж и чертеж на всеки детайл с карта за пробиване (SVG, A3)',
    'cnc/           DXF със слоеве и G-code за всеки лист от разкроя',
    '',
    'Проверки на конструкцията:',
    warnings,
    '',
    'G-code е за примерен профил на машина (номера на инструментите, нулева точка в долния ляв ъгъл',
    'на листа, Z0 на горната повърхност). Преди рязане: симулирай в софтуера на машината и пусни на сухо.',
    '',
  ].join('\n');
}

/** Content-Disposition с име на латиница и UTF-8 вариант (RFC 6266/5987). */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

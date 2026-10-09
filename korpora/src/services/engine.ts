import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { fromRoot, ROOT } from '../paths.js';
import { openSealedCatalog, SEALED_CATALOG } from './catalog-seal.js';

/**
 * Мостът към двигателя (`engine/*.js`, обикновен ESM, общ с редактора в браузъра). Двигателят се
 * зарежда динамично и всяко нужно име се проверява при старт — ако липсва, процесът не тръгва.
 * Типовете тук са тесни нарочно: сървърът само подава спецификацията и взима текст.
 */
export type Spec = Record<string, unknown>;

/**
 * Запазената спецификация (Json в базата) като Spec. Повредена или не-обект → празна: двигателят
 * дава подразбиращите се стойности. Едно правило за списъка с проекти и за изходите.
 */
export function specOf(json: Prisma.JsonValue): Spec {
  return (json && typeof json === 'object' && !Array.isArray(json) ? json : {}) as Spec;
}

export interface EngineWarning {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export interface EnginePart {
  id: string;
  name: string;
  role: string;
}

export interface EngineModel {
  spec: Spec;
  parts: EnginePart[];
  warnings: EngineWarning[];
}

export interface EngineSheet {
  index: number;
  placements: unknown[];
}

export interface EngineNesting {
  sheets: EngineSheet[];
  errors: string[];
}

/** Листовете на чертежите: лист 1 е сглобката, после по един за всеки детайл в `parts`. */
export interface DrawingSheets {
  count: number;
  parts: Array<{ part: EnginePart; no: number }>;
}

export interface DrawingMeta {
  product: string;
  hash: string;
  owner: string;
  date: string;
  sheetCount?: number;
}

/** Един параметър от формата на типа мебел — само полетата, които сървърът чете. */
export interface TypeParam {
  key: string;
  type: string;
  min?: number;
  max?: number;
  options?: ReadonlyArray<readonly [unknown, string]>;
}

interface EngineApi {
  buildModel(spec: Spec): EngineModel;
  normalizeSpec(spec: Spec): Spec;
  /** Изборите от каталога в запазената спецификация, които двигателят е сменил, защото вече ги няма там. */
  catalogDrift(saved: Spec, model: EngineModel): string[];
  typeLabel(type: string): string;
  typeDims(type: string, spec: Spec): { W: number; H: number; D: number };
  typeOrder: readonly string[];
  typeGroups: Record<string, string>;
  typeParams: Record<string, readonly TypeParam[]>;
  buildBom(model: EngineModel): unknown;
  cutListCsv(bom: unknown): string;
  hardwareCsv(bom: unknown): string;
  drillCsv(model: EngineModel): string;
  nest(model: EngineModel): EngineNesting;
  cncBlockers(model: EngineModel, nesting: EngineNesting): string[];
  toGcode(model: EngineModel, sheet: EngineSheet, meta: DrawingMeta): { text: string };
  toDxf(model: EngineModel, sheet: EngineSheet): { text: string; layers: string[] };
  /** Номерът на фрезата за каналите в G-кода (`GROOVE_MILL`); другите фрези са за контура. */
  grooveToolId: string;
  /** Листът и броят листове в рамката идват от двигателя (`drawingSheets`). */
  drawingAssembly(model: EngineModel, meta: DrawingMeta): string;
  drawingSheets(model: EngineModel): DrawingSheets;
  drawingPart(model: EngineModel, meta: DrawingMeta, partId: string): string;
  canonicalJson(value: unknown): string;
  asciiName(name: string): string;
}

let api: EngineApi | null = null;
let catalogMode: 'shop' | 'base' = 'base';

type Loaded = Record<string, unknown>;

async function load(file: string): Promise<Loaded> {
  return (await import(pathToFileURL(join(ROOT, 'engine', file)).href)) as Loaded;
}

function fn<T>(module: Loaded, name: string): T {
  const value = module[name];
  if (typeof value !== 'function') throw new Error(`двигателят няма функция ${name}`);
  return value as T;
}

/** Каталогът от магазините: проверява се формата му, не съдържанието ред по ред. */
export const catalogShape = z
  .object({
    meta: z.record(z.unknown()),
    decors: z.array(z.unknown()),
    ral: z.array(z.unknown()),
    handles: z.array(z.unknown()),
    hinges: z.array(z.unknown()),
    hingeFamilies: z.array(z.unknown()),
    slides: z.array(z.unknown()),
    slideFamilies: z.array(z.unknown()),
    bed: z.array(z.unknown()),
  })
  .passthrough();

export interface ShopCatalogSource {
  /** Каталогът като файл на сървъра (`CATALOG_PATH`). */
  plainFile: string;
  /** Шифрованият каталог от репото. */
  sealedFile: string;
  key: string | undefined;
}

/**
 * Текстът на каталога от магазините и откъде е — или null (основният каталог). С ключ решава
 * шифрованият каталог от репото: репото е източникът, а забравен стар файл на сървъра не бива тихо да
 * го засенчва. Ключ без шифрования файл е счупен release — грешка, не основният каталог.
 */
export function shopCatalogText(
  from: ShopCatalogSource,
): { text: string; source: 'sealed' | 'file' } | null {
  if (from.key) {
    if (!existsSync(from.sealedFile)) {
      throw new Error(`няма ${SEALED_CATALOG}, а CATALOG_KEY е зададен`);
    }
    return { text: openSealedCatalog(readFileSync(from.sealedFile), from.key), source: 'sealed' };
  }
  return existsSync(from.plainFile)
    ? { text: readFileSync(from.plainFile, 'utf8'), source: 'file' }
    : null;
}

/** Каталогът на сървъра по конфигурацията на процеса. */
export function serverCatalogSource(): ShopCatalogSource {
  return {
    plainFile: fromRoot(config().CATALOG_PATH),
    sealedFile: fromRoot(SEALED_CATALOG),
    key: config().CATALOG_KEY,
  };
}

let catalogJson: string | null = null;
/** ETag на каталога — смята се веднъж при зареждане, не при всяка заявка (каталогът е няколко MB). */
let catalogEtag = '""';

/**
 * `catalogPath` е за инструментите извън сървъра (брошурата, og-image): те не носят цялата конфигурация
 * на процеса и четат само файла. Сървърът (без аргумент) чете и шифрования каталог с CATALOG_KEY.
 */
export async function loadEngine(catalogPath?: string): Promise<void> {
  const [model, types, bom, drill, nest, cam, dxf, assembly, part, util, catalog] =
    await Promise.all([
      load('model.js'),
      load('types.js'),
      load('bom.js'),
      load('drill.js'),
      load('nest.js'),
      load('cam.js'),
      load('dxf.js'),
      load('drawing-assembly.js'),
      load('drawing-part.js'),
      load('util.js'),
      load('catalog.js'),
    ]);
  const registerCatalog = fn<(data: unknown) => unknown>(catalog, 'registerCatalog');
  const baseCatalogData = fn<() => unknown>(catalog, 'baseCatalogData');
  const from =
    catalogPath === undefined
      ? serverCatalogSource()
      : { plainFile: fromRoot(catalogPath), sealedFile: '', key: undefined };
  const shop = shopCatalogText(from);
  if (shop) {
    const parsed = catalogShape.safeParse(JSON.parse(shop.text) as unknown);
    if (!parsed.success) throw new Error('каталогът е с неочаквана форма');
    registerCatalog(parsed.data);
    catalogJson = shop.text;
    catalogMode = 'shop';
    if (shop.source === 'sealed' && existsSync(from.plainFile)) {
      logger.warn(
        'data/catalog.json се пренебрегва: с CATALOG_KEY каталогът идва шифрован от репото',
      );
    }
    logger.info({ source: shop.source }, 'каталогът от магазините е зареден');
  } else {
    logger.warn('няма каталог от магазините — двигателят работи с основния каталог');
    const base = baseCatalogData();
    registerCatalog(base);
    catalogJson = JSON.stringify(base);
    catalogMode = 'base';
  }
  catalogEtag = `"${createHash('sha256').update(catalogJson).digest('base64url').slice(0, 27)}"`;
  const TYPES = types.TYPES as
    Record<string, { label: string; group: string; params?: TypeParam[] }> | undefined;
  const ORDER = types.TYPE_ORDER as readonly string[] | undefined;
  if (!TYPES || !ORDER) throw new Error('двигателят няма TYPES/TYPE_ORDER');
  const grooveMill = cam.GROOVE_MILL as { id?: unknown } | undefined;
  if (typeof grooveMill?.id !== 'string') throw new Error('двигателят няма GROOVE_MILL');
  api = {
    buildModel: fn(model, 'buildModel'),
    normalizeSpec: fn(model, 'normalizeSpec'),
    catalogDrift: fn(model, 'catalogDrift'),
    typeLabel: fn(model, 'typeLabel'),
    typeDims: fn(types, 'typeDims'),
    typeOrder: ORDER,
    typeGroups: Object.fromEntries(ORDER.map((id) => [id, TYPES[id]?.group ?? ''])),
    typeParams: Object.fromEntries(ORDER.map((id) => [id, TYPES[id]?.params ?? []])),
    buildBom: fn(bom, 'buildBom'),
    cutListCsv: fn(bom, 'cutListCsv'),
    hardwareCsv: fn(bom, 'hardwareCsv'),
    drillCsv: fn(drill, 'drillCsv'),
    nest: fn(nest, 'nest'),
    cncBlockers: fn(cam, 'cncBlockers'),
    toGcode: fn(cam, 'toGcode'),
    toDxf: fn(dxf, 'toDxf'),
    grooveToolId: grooveMill.id,
    drawingAssembly: fn(assembly, 'drawingAssembly'),
    drawingSheets: fn(part, 'drawingSheets'),
    drawingPart: fn(part, 'drawingPart'),
    canonicalJson: fn(util, 'canonicalJson'),
    asciiName: fn(util, 'asciiName'),
  };
}

export function engine(): EngineApi {
  if (!api) throw new Error('двигателят не е зареден — извикай loadEngine() при старт');
  return api;
}

export function catalogInfo(): { mode: 'shop' | 'base'; json: string; etag: string } {
  return { mode: catalogMode, json: catalogJson ?? '{}', etag: catalogEtag };
}

export function isFurnitureType(value: unknown): value is string {
  return typeof value === 'string' && engine().typeOrder.includes(value);
}

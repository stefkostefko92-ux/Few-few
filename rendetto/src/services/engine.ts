import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { fromRoot, ROOT } from '../paths.js';

/**
 * Мостът към двигателя (`engine/*.js`, обикновен ESM, общ с редактора в браузъра). Двигателят се
 * зарежда динамично и всяко нужно име се проверява при старт — ако липсва, процесът не тръгва.
 * Типовете тук са тесни нарочно: сървърът само подава спецификацията и взима текст.
 */
export type Spec = Record<string, unknown>;

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
  typeLabel(type: string): string;
  dimsText(type: string, spec: Spec): string;
  typeDims(type: string, spec: Spec): { W: number; H: number; D: number };
  typeOrder: readonly string[];
  typeGroups: Record<string, string>;
  typeParams: Record<string, readonly TypeParam[]>;
  buildBom(model: EngineModel): unknown;
  cutListCsv(bom: unknown): string;
  hardwareCsv(bom: unknown): string;
  drillCsv(model: EngineModel): string;
  nest(model: EngineModel): { sheets: EngineSheet[] };
  toGcode(model: EngineModel, sheet: EngineSheet, meta: DrawingMeta): { text: string };
  toDxf(model: EngineModel, sheet: EngineSheet, meta: DrawingMeta): { text: string };
  drawingAssembly(
    model: EngineModel,
    meta: DrawingMeta,
    sheetNo: number,
    sheetCount: number,
  ): string;
  drawingPart(
    model: EngineModel,
    meta: DrawingMeta,
    partId: string,
    sheetNo: number,
    sheetCount: number,
  ): string;
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

/** Каталогът от магазините е само на сървъра. Проверява се формата му, не съдържанието ред по ред. */
const catalogShape = z
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

let catalogJson: string | null = null;

export async function loadEngine(): Promise<void> {
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
  const file = fromRoot(config().CATALOG_PATH);
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8');
    const parsed = catalogShape.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) throw new Error('каталогът е с неочаквана форма');
    registerCatalog(parsed.data);
    catalogJson = raw;
    catalogMode = 'shop';
  } else {
    logger.warn('няма каталог от магазините — двигателят работи с основния каталог');
    const base = baseCatalogData();
    registerCatalog(base);
    catalogJson = JSON.stringify(base);
    catalogMode = 'base';
  }
  const TYPES = types.TYPES as
    Record<string, { label: string; group: string; params?: TypeParam[] }> | undefined;
  const ORDER = types.TYPE_ORDER as readonly string[] | undefined;
  if (!TYPES || !ORDER) throw new Error('двигателят няма TYPES/TYPE_ORDER');
  api = {
    buildModel: fn(model, 'buildModel'),
    normalizeSpec: fn(model, 'normalizeSpec'),
    typeLabel: fn(model, 'typeLabel'),
    dimsText: fn(types, 'dimsText'),
    typeDims: fn(types, 'typeDims'),
    typeOrder: ORDER,
    typeGroups: Object.fromEntries(ORDER.map((id) => [id, TYPES[id]?.group ?? ''])),
    typeParams: Object.fromEntries(ORDER.map((id) => [id, TYPES[id]?.params ?? []])),
    buildBom: fn(bom, 'buildBom'),
    cutListCsv: fn(bom, 'cutListCsv'),
    hardwareCsv: fn(bom, 'hardwareCsv'),
    drillCsv: fn(drill, 'drillCsv'),
    nest: fn(nest, 'nest'),
    toGcode: fn(cam, 'toGcode'),
    toDxf: fn(dxf, 'toDxf'),
    drawingAssembly: fn(assembly, 'drawingAssembly'),
    drawingPart: fn(part, 'drawingPart'),
    canonicalJson: fn(util, 'canonicalJson'),
    asciiName: fn(util, 'asciiName'),
  };
}

export function engine(): EngineApi {
  if (!api) throw new Error('двигателят не е зареден — извикай loadEngine() при старт');
  return api;
}

export function catalogInfo(): { mode: 'shop' | 'base'; json: string } {
  return { mode: catalogMode, json: catalogJson ?? '{}' };
}

/** Типовете мебели в реда на двигателя. */
export function furnitureTypes(): string[] {
  return [...engine().typeOrder];
}

export function isFurnitureType(value: unknown): value is string {
  return typeof value === 'string' && engine().typeOrder.includes(value);
}

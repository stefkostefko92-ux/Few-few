// @ts-check
// Общи пътища за данните и отчетите на продукта.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT = join(__dirname, '..', '..');
export const DATA_DIR = join(ROOT, 'data');
export const RAW_DIR = join(DATA_DIR, 'raw');
export const REPORTS_DIR = join(ROOT, 'reports');
export const SITE_DIR = join(ROOT, 'site');
export const CATALOG_FILE = join(DATA_DIR, 'catalogo-bdap.json');
export const ANAGRAFICA_FILE = join(DATA_DIR, 'anagrafica.json');
export const FINANZE_FILE = join(DATA_DIR, 'finanze.json');
export const SEGNALAZIONI_FILE = join(DATA_DIR, 'segnalazioni.json');

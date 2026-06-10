import { Prisma } from '@prisma/client';

// Sanitizzazione input basata sullo schema Prisma (DMMF):
// - scarta chiavi sconosciute, relazioni annidate, id/createdAt/updatedAt/_count
// - converte i tipi (date "YYYY-MM-DD" → Date, stringhe numeriche → numeri, liste, booleani)
// Previene sia i 500 da payload del frontend sia il mass assignment di campi non previsti.

type FieldMeta = { type: string; kind: string; isRequired: boolean; isList: boolean };

const modelFieldsCache = new Map<string, Map<string, FieldMeta>>();

function getEditableFields(clientModelName: string): Map<string, FieldMeta> {
  let fields = modelFieldsCache.get(clientModelName);
  if (fields) return fields;

  const dmmfModel = Prisma.dmmf.datamodel.models.find(
    m => m.name.charAt(0).toLowerCase() + m.name.slice(1) === clientModelName,
  );
  fields = new Map();
  if (dmmfModel) {
    for (const f of dmmfModel.fields) {
      if (f.kind !== 'scalar' && f.kind !== 'enum') continue;
      if (f.name === 'id' || f.name === 'createdAt' || f.name === 'updatedAt') continue;
      fields.set(f.name, {
        type: f.type,
        kind: f.kind,
        isRequired: f.isRequired,
        isList: f.isList,
      });
    }
  }
  modelFieldsCache.set(clientModelName, fields);
  return fields;
}

export class SanitizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizeError';
  }
}

function coerceValue(value: any, meta: FieldMeta, fieldName: string): any {
  // "" su campo opzionale → null (svuota il campo); su String obbligatorio resta ""
  if (value === '' || value === null) {
    if (!meta.isRequired) return null;
    if (meta.type === 'String' && !meta.isList) return value === null ? undefined : '';
    return undefined; // campo obbligatorio non-stringa vuoto: lascia decidere al default/validazione
  }

  if (meta.isList) {
    const arr = Array.isArray(value)
      ? value
      : String(value).split(',').map(s => s.trim()).filter(Boolean);
    return arr.map(v => coerceScalar(v, meta, fieldName));
  }
  return coerceScalar(value, meta, fieldName);
}

function coerceScalar(value: any, meta: FieldMeta, fieldName: string): any {
  switch (meta.type) {
    case 'DateTime': {
      if (value instanceof Date) return value;
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new SanitizeError(`Data non valida per "${fieldName}": ${value}`);
      return d;
    }
    case 'Int': {
      const n = Number(value);
      if (isNaN(n)) throw new SanitizeError(`Numero non valido per "${fieldName}": ${value}`);
      return Math.trunc(n);
    }
    case 'Float':
    case 'Decimal': {
      const n = Number(value);
      if (isNaN(n)) throw new SanitizeError(`Numero non valido per "${fieldName}": ${value}`);
      return n;
    }
    case 'Boolean': {
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'si', 'sì', 'yes'].includes(String(value).toLowerCase());
    }
    case 'Json':
      return value;
    default:
      // String ed enum: gli enum non validi vengono respinti da Prisma con messaggio chiaro
      return typeof value === 'string' ? value : String(value);
  }
}

/**
 * Filtra e converte un payload per il modello Prisma indicato (nome client camelCase).
 * Le chiavi sconosciute vengono ignorate silenziosamente.
 */
export function sanitizeForModel(clientModelName: string, body: any): Record<string, any> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SanitizeError('Payload non valido');
  }
  const fields = getEditableFields(clientModelName);
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    const meta = fields.get(key);
    if (!meta || value === undefined) continue;
    const coerced = coerceValue(value, meta, key);
    if (coerced !== undefined) out[key] = coerced;
  }
  return out;
}

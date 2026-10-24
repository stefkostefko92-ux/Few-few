/**
 * Минимален protobuf четец — само толкова, колкото ни трябва за списъка на
 * Cfx.re, и нула зависимости (правило на репото).
 *
 * Не декодира по схема: връща полетата по НОМЕР, а извикващият решава какво
 * значат. Точно това искаме при чужд, недокументиран формат — непознато поле
 * се игнорира вместо да чупи парсването, а промяна в схемата им не ни събаря.
 */

export type WireValue =
  | { wire: 0; value: bigint }
  | { wire: 1; value: Uint8Array }
  | { wire: 2; value: Uint8Array }
  | { wire: 5; value: Uint8Array };

export type Fields = Map<number, WireValue[]>;

/** Varint: 7 бита на байт, старшият бит е „има още“. */
function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let index = pos;
  for (; index < buf.length; index += 1) {
    const byte = buf[index];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, index + 1];
    shift += 7n;
    // 10 байта е таванът на 64-битов varint; повече значи повреден поток.
    if (shift > 63n) throw new Error('повреден varint');
  }
  throw new Error('varint излиза извън буфера');
}

/**
 * Декодира едно съобщение. Повторените полета идват като няколко записа под
 * един и същ номер — затова стойността е масив.
 */
export function decodeMessage(buf: Uint8Array): Fields {
  const fields: Fields = new Map();
  let pos = 0;

  while (pos < buf.length) {
    const [tag, next] = readVarint(buf, pos);
    pos = next;
    const fieldNumber = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (fieldNumber === 0) throw new Error('невалиден номер на поле');

    let entry: WireValue;
    switch (wire) {
      case 0: {
        const [value, after] = readVarint(buf, pos);
        pos = after;
        entry = { wire: 0, value };
        break;
      }
      case 1: {
        entry = { wire: 1, value: buf.subarray(pos, pos + 8) };
        pos += 8;
        break;
      }
      case 2: {
        const [length, after] = readVarint(buf, pos);
        const size = Number(length);
        if (after + size > buf.length) throw new Error('дължината излиза извън буфера');
        entry = { wire: 2, value: buf.subarray(after, after + size) };
        pos = after + size;
        break;
      }
      case 5: {
        entry = { wire: 5, value: buf.subarray(pos, pos + 4) };
        pos += 4;
        break;
      }
      default:
        throw new Error(`непознат wire type ${wire}`);
    }

    const list = fields.get(fieldNumber);
    if (list) list.push(entry);
    else fields.set(fieldNumber, [entry]);
  }

  return fields;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

export function asString(entry: WireValue | undefined): string | undefined {
  if (!entry || entry.wire !== 2) return undefined;
  return decoder.decode(entry.value);
}

export function asNumber(entry: WireValue | undefined): number | undefined {
  if (!entry || entry.wire !== 0) return undefined;
  const value = Number(entry.value);
  return Number.isSafeInteger(value) ? value : undefined;
}

export function asMessage(entry: WireValue | undefined): Fields | undefined {
  if (!entry || entry.wire !== 2) return undefined;
  try {
    return decodeMessage(entry.value);
  } catch {
    return undefined;
  }
}

export function first(fields: Fields, fieldNumber: number): WireValue | undefined {
  return fields.get(fieldNumber)?.[0];
}

export function all(fields: Fields, fieldNumber: number): WireValue[] {
  return fields.get(fieldNumber) ?? [];
}

/**
 * Потокът на Cfx.re е поредица от кадри: `[4-байтова LE дължина][съобщение]`.
 * Връща кадрите един по един; повреден кадър спира четенето, вместо да хвърли
 * — по-добре непълен списък, отколкото нула сървъри заради един лош запис.
 */
export function* readFrames(buf: Uint8Array): Generator<Uint8Array> {
  let pos = 0;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (pos + 4 <= buf.length) {
    const length = view.getUint32(pos, true);
    pos += 4;
    if (length === 0) continue;
    if (pos + length > buf.length) return;
    yield buf.subarray(pos, pos + length);
    pos += length;
  }
}

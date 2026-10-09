// Проверка и почистване на качените изображения — без нови зависимости.
//
// Две отделни задачи:
//  1. `sniffImage` — какъв Е файлът според БАЙТОВЕТЕ му. Клиентският Content-Type
//     е контролируем от подателя и не доказва нищо.
//  2. `stripMetadata` — маха EXIF/XMP/текстовите блокове. Снимка от телефон носи
//     GPS координати, модел на устройството и точен час; профилната снимка е
//     публична по дефиниция и се вгражда и във всеки .vcf, тоест данни, които
//     потребителят никога не е въвеждал, тръгват по света (чл. 5(1)(в) ОРЗД).

// Разширение по сигнатура (magic bytes) или null, ако не е позволен формат.
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

// JPEG: SOI, после сегменти (маркер + дължина + данни) до SOS, след който върви
// компресираният поток. Изхвърляме APP1..APP15 (EXIF, XMP, IPTC) и коментарите;
// APP0 (JFIF) остава, защото носи само плътността на изображението.
function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)]; // FFD8
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break; // повреден поток — спираме и връщаме каквото имаме
    const marker = buf[i + 1];
    if (marker === 0xd9) {
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }
    if (marker === 0xda) {
      // Start of Scan — оттук нататък е самото изображение, копира се дословно.
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out);
}

// PNG: подпис + поредица chunk-ове (дължина, тип, данни, CRC). Махаме
// метаданните; критичните chunk-ове остават непокътнати, затова CRC не се пресмята.
const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (len > buf.length || end > buf.length) break;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

// WebP (RIFF): FourCC + дължина + данни (подравнени на четно). Махаме EXIF/XMP и
// пренаписваме общата дължина в заглавието.
const WEBP_DROP = new Set(['EXIF', 'XMP ']);
function stripWebp(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const padded = len + (len % 2);
    const end = i + 8 + padded;
    if (end > buf.length) break;
    if (!WEBP_DROP.has(fourcc)) chunks.push(buf.subarray(i, end));
    i = end;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.from(buf.subarray(0, 12));
  head.writeUInt32LE(body.length + 4, 4); // 'WEBP' + съдържанието
  return Buffer.concat([head, body]);
}

// Връща нов буфер без метаданни. При неочакван/повреден вход връща оригинала —
// по-добре снимка с метаданни, отколкото счупен файл (сигурността тук е
// поверителност, не изпълнение на код).
export function stripMetadata(buf, ext) {
  try {
    if (ext === 'jpg') return stripJpeg(buf);
    if (ext === 'png') return stripPng(buf);
    if (ext === 'webp') return stripWebp(buf);
  } catch {
    return buf;
  }
  return buf;
}

// Единният път за качване: проверява съдържанието и връща готовите байтове.
// `null` значи „това не е позволено изображение".
export function prepareUpload(buffer) {
  const ext = sniffImage(buffer);
  if (!ext) return null;
  return { ext, buffer: stripMetadata(buffer, ext) };
}

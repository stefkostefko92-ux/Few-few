import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Минимален ZIP (PKWARE APPNOTE 6.3) без зависимост: всеки файл се пише цял — локална глава с размерите
 * и CRC-32, данните, накрая централната директория. Имената са UTF-8 (бит 11). XML и CSV се свиват
 * (deflate), PDF-ът — не (вече е свит). Без ZIP64: до 65 535 файла и 4 GiB — износът на една фирма.
 */
export interface ZipSink {
  write(chunk: Buffer): Promise<void>;
}

interface Entry {
  name: Buffer;
  crc: number;
  size: number;
  compressed: number;
  method: number;
  offset: number;
  time: number;
  date: number;
}

function dosTime(at: Date): { time: number; date: number } {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

export class ZipWriter {
  private readonly entries: Entry[] = [];
  private offset = 0;

  constructor(
    private readonly sink: ZipSink,
    private readonly now: Date = new Date(),
  ) {}

  private async put(chunk: Buffer): Promise<void> {
    await this.sink.write(chunk);
    this.offset += chunk.length;
  }

  async add(name: string, data: Buffer, compress = true): Promise<void> {
    if (this.entries.length >= 0xffff) throw new Error('Твърде много файлове за ZIP без ZIP64');
    const nameBytes = Buffer.from(name.replace(/^\/+/, ''), 'utf8');
    const body = compress ? deflateRawSync(data) : data;
    const method = compress ? 8 : 0;
    const { time, date } = dosTime(this.now);
    const entry: Entry = {
      name: nameBytes,
      crc: crc32(data),
      size: data.length,
      compressed: body.length,
      method,
      offset: this.offset,
      time,
      date,
    };
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressed, 18);
    header.writeUInt32LE(entry.size, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    await this.put(header);
    await this.put(nameBytes);
    await this.put(body);
    this.entries.push(entry);
  }

  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(e.method, 10);
      header.writeUInt16LE(e.time, 12);
      header.writeUInt16LE(e.date, 14);
      header.writeUInt32LE(e.crc, 16);
      header.writeUInt32LE(e.compressed, 20);
      header.writeUInt32LE(e.size, 24);
      header.writeUInt16LE(e.name.length, 28);
      header.writeUInt32LE(e.offset, 42);
      await this.put(header);
      await this.put(e.name);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - start, 12);
    end.writeUInt32LE(start, 16);
    await this.put(end);
  }
}

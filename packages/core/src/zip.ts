// A minimal ZIP writer (stored, no compression; WAV barely compresses) for the cleared-lane
// folder export on browsers without showDirectoryPicker. UTF-8 names, no ZIP64.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    c = (CRC_TABLE[(c ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** UTF-8 bytes of a string (core avoids TextEncoder so it needs no DOM or Node types). */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export type ZipEntry = { name: string; data: Uint8Array; modified?: Date };

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const records = entries.map((e) => {
    const name = utf8(e.name.replace(/\\/g, "/"));
    return { name, data: e.data, crc: crc32(e.data), ...dosTime(e.modified ?? new Date()) };
  });
  let size = 22;
  for (const r of records) size += 30 + r.name.length + r.data.length + 46 + r.name.length;
  if (size > 0xffffffff || records.length > 0xffff)
    throw new Error("Too big for a ZIP without ZIP64; export fewer files.");
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;
  for (const r of records) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 0x0800, true); // UTF-8 names
    view.setUint16(p + 8, 0, true); // stored
    view.setUint16(p + 10, r.time, true);
    view.setUint16(p + 12, r.date, true);
    view.setUint32(p + 14, r.crc, true);
    view.setUint32(p + 18, r.data.length, true);
    view.setUint32(p + 22, r.data.length, true);
    view.setUint16(p + 26, r.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(r.name, p + 30);
    out.set(r.data, p + 30 + r.name.length);
    p += 30 + r.name.length + r.data.length;
  }
  const cdStart = p;
  records.forEach((r, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, r.time, true);
    view.setUint16(p + 14, r.date, true);
    view.setUint32(p + 16, r.crc, true);
    view.setUint32(p + 20, r.data.length, true);
    view.setUint32(p + 24, r.data.length, true);
    view.setUint16(p + 28, r.name.length, true);
    view.setUint16(p + 30, 0, true);
    view.setUint16(p + 32, 0, true);
    view.setUint16(p + 34, 0, true);
    view.setUint16(p + 36, 0, true);
    view.setUint32(p + 38, 0, true);
    view.setUint32(p + 42, offsets[i] ?? 0, true);
    out.set(r.name, p + 46);
    p += 46 + r.name.length;
  });
  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 8, records.length, true);
  view.setUint16(p + 10, records.length, true);
  view.setUint32(p + 12, p - cdStart, true);
  view.setUint32(p + 16, cdStart, true);
  return out;
}

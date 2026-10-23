// Reads the first worksheet of an .xlsx file into rows of strings (no dependencies; Node and Workers).
// Date-formatted cells come back as yyyy-mm-dd, time-formatted cells as hh:mm:ss.

const dec = new TextDecoder();

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), files = new Map();
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('not_zip');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw Error('bad_zip');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true),
      extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    files.set(name, { method, data: buf.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { async text(name) { const f = files.get(name); if (!f) return null; return dec.decode(f.method === 8 ? await inflate(f.data) : f.data); } };
}

const xml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const texts = s => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xml(m[1])).join('');
const column = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const DATE_FORMATS = new Set([14, 15, 16, 17, 22]), TIME_FORMATS = new Set([18, 19, 20, 21, 45, 46, 47]);

function serial(n, kind) {
  if (kind === 'time') { const s = Math.round((n % 1) * 86400); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); }
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}

async function readSheet(buf) {
  const zip = await unzip(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const shared = [...((await zip.text('xl/sharedStrings.xml')) || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  // Number formats per style index, to tell dates and times from plain numbers.
  const styles = (await zip.text('xl/styles.xml')) || '', custom = new Map();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(+m[1], xml(m[2]).toLowerCase());
  const xfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [, ''])[1];
  const kinds = [...xfs.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"/g)].map(m => {
    const id = +m[1], code = custom.get(id) || '';
    if (DATE_FORMATS.has(id) || /[dy]/.test(code.replace(/"[^"]*"/g, ''))) return 'date';
    if (TIME_FORMATS.has(id) || /h|ss/.test(code.replace(/"[^"]*"/g, ''))) return 'time';
    return null;
  });
  const workbook = (await zip.text('xl/workbook.xml')) || '', rels = (await zip.text('xl/_rels/workbook.xml.rels')) || '';
  const firstId = (workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/) || [])[1];
  let target = firstId && (rels.match(new RegExp('<Relationship[^>]*Id="' + firstId + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('<Relationship[^>]*Target="([^"]+)"[^>]*Id="' + firstId + '"')) || [])[1];
  target = target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')) : 'xl/worksheets/sheet1.xml';
  const sheet = await zip.text(target);
  if (!sheet) return [];
  const rows = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] || '', ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/t="(\w+)"/) || [])[1], s = +((attrs.match(/s="(\d+)"/) || [])[1] || 0);
      const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = '';
      if (t === 's') value = shared[+raw] ?? '';
      else if (t === 'inlineStr') value = texts(body);
      else if (t === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else if (raw != null) value = t === 'str' || t === 'e' ? xml(raw) : kinds[s] && Number.isFinite(+raw) ? serial(+raw, kinds[s]) : raw;
      row[ref ? column(ref) : row.length] = value;
    }
    if (row.some(x => x !== undefined && x !== '')) rows.push(Array.from(row, x => x ?? ''));
  }
  return rows;
}

export { readSheet };

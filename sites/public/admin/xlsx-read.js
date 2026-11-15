'use strict';
// Reads one sheet of an .xlsx file in the browser (no libraries): rows of raw values — numbers stay numbers (dates and
// times as Excel serials), text as text; a formula cell gives its last saved value. Karim 11-16: the old QA sheet.
window.MarsadXlsxRead = (() => {
  const dec = new TextDecoder();
  const inflate = async data => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  async function unzip(buf) {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), files = new Map();
    let end = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw Error('الملف مش Excel (.xlsx)');
    let p = v.getUint32(end + 16, true);
    for (let n = 0, count = v.getUint16(end + 10, true); n < count; n++) {
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      files.set(name, { method, data: buf.subarray(start, start + size) });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return async name => { const f = files.get(name.replace(/^\//, '')); return f ? dec.decode(f.method === 8 ? await inflate(f.data) : f.data) : null; };
  }
  const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
  const colNo = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  async function rows(file, sheetName) {
    const get = await unzip(new Uint8Array(await file.arrayBuffer()));
    const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
    const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: unxml(/name="([^"]*)"/.exec(m[0])[1]), id: /r:id="([^"]*)"/.exec(m[0])[1] }));
    const pick = sheets.find(s => s.name.trim() === sheetName) || sheets[0];
    const target = new RegExp('Id="' + pick.id + '"[^>]*Target="([^"]*)"').exec(rels)?.[1] || new RegExp('Target="([^"]*)"[^>]*Id="' + pick.id + '"').exec(rels)?.[1];
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const ss = await get('xl/sharedStrings.xml');
    const strings = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''))) : [];
    const xml = await get(path), out = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1], t = /t="([^"]*)"/.exec(c[1])?.[1], body = c[2] || '';
        if (!ref) continue;
        const val = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        row[colNo(ref)] = t === 's' ? strings[+val] : t === 'inlineStr' ? unxml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')) : t === 'str' || t === 'e' ? (val == null ? null : unxml(val)) : val == null ? null : Number(val);
      }
      out.push(row);
    }
    return out;
  }
  return { rows };
})();

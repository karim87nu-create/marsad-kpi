'use strict';
// Minimal .xlsx writer for the exports: right-to-left sheets, frozen header, filters,
// numbers stay numbers, durations are real Excel times ([h]:mm:ss), times are Cairo date-times.
// Column types: 'text' (default), 'number', 'percent' (value given in %), 'duration' (seconds), 'datetime' (ISO / ms).
window.MarsadXlsx = (() => {
  const enc = new TextEncoder();
  const esc = v => String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = n => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  // Excel serial in Cairo wall time.
  const cairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function serial(v) {
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (!Number.isFinite(ms)) return null;
    const p = Object.fromEntries(cairo.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  function cell(ref, value, type) {
    if (value == null || value === '') return '';
    if (type === 'number' && Number.isFinite(Number(value))) return '<c r="' + ref + '" s="1"><v>' + Number(value) + '</v></c>';
    if (type === 'percent' && Number.isFinite(Number(value))) return '<c r="' + ref + '" s="4"><v>' + Number(value) / 100 + '</v></c>';
    if (type === 'duration' && Number.isFinite(Number(value))) return '<c r="' + ref + '" s="2"><v>' + Number(value) / 86400 + '</v></c>';
    if (type === 'datetime') { const s = serial(value); if (s != null) return '<c r="' + ref + '" s="3"><v>' + s + '</v></c>'; }
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>';
  }
  function zip(files) {
    const parts = [], dir = []; let offset = 0;
    for (const [name, text] of files) {
      const data = enc.encode(text), nameBytes = enc.encode(name), crc = crc32(data);
      const head = new Uint8Array(30 + nameBytes.length), v = new DataView(head.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(8, 0, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, nameBytes.length, true);
      head.set(nameBytes, 30); parts.push(head, data);
      const d = new Uint8Array(46 + nameBytes.length), w = new DataView(d.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true); w.setUint16(28, nameBytes.length, true); w.setUint32(42, offset, true);
      d.set(nameBytes, 46); dir.push(d);
      offset += head.length + data.length;
    }
    const size = dir.reduce((n, d) => n + d.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...dir, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  // One sheet's XML. columns: [{ title, type, width }], rows: arrays of values in column order.
  function sheetXml(columns, rows) {
    const last = col(columns.length - 1) + (rows.length + 1);
    const header = '<row r="1">' + columns.map((c, i) => '<c r="' + col(i) + '1" t="inlineStr" s="5"><is><t>' + esc(c.title) + '</t></is></c>').join('') + '</row>';
    const body = rows.map((r, j) => '<row r="' + (j + 2) + '">' + columns.map((c, i) => cell(col(i) + (j + 2), r[i], c.type)).join('') + '</row>').join('');
    const widths = '<cols>' + columns.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || (c.type === 'datetime' ? 20 : 16)) + '" customWidth="1"/>').join('') + '</cols>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + widths + '<sheetData>' + header + body + '</sheetData><autoFilter ref="A1:' + last + '"/></worksheet>';
  }
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="[h]:mm:ss"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="166" formatCode="0.00%"/></numFmts>'
    + '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  // A workbook of one or more right-to-left sheets: [{ name, columns, rows }].
  function book(sheets) {
    const names = new Set();
    const list = sheets.map((x, i) => { let n = String(x.name || 'البيانات').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'ورقة ' + (i + 1); while (names.has(n)) n = n.slice(0, 28) + ' ' + (i + 1); names.add(n); return { ...x, name: n }; });
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + list.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'
        + list.map((x, i) => '<sheet name="' + esc(x.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><definedNames>'
        + list.map((x, i) => '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + esc(x.name) + '\'!$A$1:$' + col(x.columns.length - 1) + '$' + (x.rows.length + 1) + '</definedName>').join('') + '</definedNames></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + list.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
        + '<Relationship Id="rId' + (list.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', STYLES],
      ...list.map((x, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(x.columns, x.rows)]),
    ]);
  }
  const build = (columns, rows, sheetName = 'البيانات') => book([{ name: sheetName, columns, rows }]);
  // download(name, columns, rows[, sheetName]) for one sheet, or download(name, [{ name, columns, rows }, …]) for several.
  function download(name, columns, rows, sheetName) {
    const blob = Array.isArray(columns) && columns[0]?.columns ? book(columns) : build(columns, rows, sheetName);
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name + '.xlsx' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  // ---- the daily reports sent to the branches: a title row, then a coloured table (fixed layout) ----
  // sheets: [{ name, title, columns: [{ title, width }], rows: [[{ v, fill: 'red'|'yellow'|'green'|undefined }]] }]
  // Arabic text cells start with RLM and every cell reads right-to-left, so numbers inside Arabic keep their order.
  const RLM = '‏', AR = /[؀-ۿ]/;
  const REPORT_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="13"/><color rgb="FF1F5C4A"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>'
    + '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + ['1F5C4A', 'F8D7DA', 'FFF3CD', 'D4EDDA'].map(c => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + c + '"/><bgColor indexed="64"/></patternFill></fill>').join('') + '</fills>'
    + '<borders count="2"><border/><border>' + ['left', 'right', 'top', 'bottom'].map(x => '<' + x + ' style="thin"><color rgb="FFBBBBBB"/></' + x + '>').join('') + '<diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>'
    + [0, 3, 4, 5].map(f => '<xf numFmtId="0" fontId="0" fillId="' + f + '" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>').join('')
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const FILL_STYLE = { red: 4, yellow: 5, green: 6 };
  const text = (ref, v, st) => '<c r="' + ref + '" t="inlineStr" s="' + st + '"><is><t xml:space="preserve">' + esc((AR.test(String(v)) ? RLM : '') + v) + '</t></is></c>';
  function reportSheetXml(x) {
    const n = x.columns.length, lastCol = col(n - 1), headRow = 3;
    const rows = ['<row r="1" ht="22" customHeight="1">' + text('A1', x.title, 1) + '</row>',
      '<row r="' + headRow + '">' + x.columns.map((c, i) => text(col(i) + headRow, c.title, 2)).join('') + '</row>',
      ...x.rows.map((r, j) => '<row r="' + (headRow + 1 + j) + '">' + r.map((c, i) => text(col(i) + (headRow + 1 + j), c.v ?? '—', FILL_STYLE[c.fill] || 3)).join('') + '</row>')];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="' + headRow + '" topLeftCell="A' + (headRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + '<cols>' + x.columns.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 16) + '" customWidth="1"/>').join('') + '</cols>'
      + '<sheetData>' + rows.join('') + '</sheetData><mergeCells count="1"><mergeCell ref="A1:' + lastCol + '1"/></mergeCells>'
      + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }
  function report(name, sheets) {
    const names = new Set();
    const list = sheets.map((x, i) => { let n = String(x.name || 'ورقة').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31); while (names.has(n)) n = n.slice(0, 28) + ' ' + (i + 1); names.add(n); return { ...x, name: n }; });
    const blob = zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + list.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'
        + list.map((x, i) => '<sheet name="' + esc(x.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><definedNames>'
        + list.map((x, i) => '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + esc(x.name) + '\'!$3:$3</definedName>').join('') + '</definedNames></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + list.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
        + '<Relationship Id="rId' + (list.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', REPORT_STYLES],
      ...list.map((x, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', reportSheetXml(x)]),
    ]);
    if (typeof document === 'undefined' || name === null) return blob;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name + '.xlsx' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return blob;
  }
  // ---- the call center's own daily sheets (Karim 11-16): free layout, merged cells, coloured blocks ----
  // sheets: [{ name, widths: [n…], rows: [[cell…]], merges: ['A1:F1'…], freeze: rows }]
  // cell: null | value | { v, s: fill name, b: bold, big: title size, t: 'num'|'pct'|'date'|'time'|'text', f: formula }
  const GRID_FILLS = { none: null, title: 'F26522', head: 'BDD7EE', sub: 'EFEFEF', yellow: 'FFFF00', blue: 'ADD8E6', orange: 'FF9900', lavender: 'A4C2F4', gray: 'D9D9D9', green: 'D4EDDA', red: 'F8D7DA', amber: 'FFF3CD' };
  const GRID_FMT = { text: 0, num: 3, dec: 4, pct: 10, date: 164, time: 165 };
  const fillNames = Object.keys(GRID_FILLS), fmtNames = Object.keys(GRID_FMT);
  const gridXf = (fill, fmt, bold, big) => 1 + ((fillNames.indexOf(fill) * fmtNames.length + fmtNames.indexOf(fmt)) * 2 + (bold ? 1 : 0)) * 2 + (big ? 1 : 0);
  const GRID_STYLES = (() => {
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    for (const fl of fillNames) for (const fm of fmtNames) for (const b of [0, 1]) for (const big of [0, 1]) {
      const font = big ? 3 : b ? 1 : 0, fillId = fl === 'none' ? 0 : 2 + fillNames.indexOf(fl) - 1;
      xfs.push('<xf numFmtId="' + GRID_FMT[fm] + '" fontId="' + font + '" fillId="' + fillId + '" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>');
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="h:mm"/></numFmts>'
      + '<fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font></fonts>'
      + '<fills count="' + (2 + fillNames.length - 1) + '"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + fillNames.slice(1).map(f => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + GRID_FILLS[f] + '"/><bgColor indexed="64"/></patternFill></fill>').join('') + '</fills>'
      + '<borders count="2"><border/><border>' + ['left', 'right', 'top', 'bottom'].map(x => '<' + x + ' style="thin"><color rgb="FF888888"/></' + x + '>').join('') + '<diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  })();
  const dateSerial = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d)); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null; };
  function gridCell(ref, c) {
    if (c == null) return '';
    const x = typeof c === 'object' ? c : { v: c };
    let t = x.t || (typeof x.v === 'number' ? (Number.isInteger(x.v) ? 'num' : 'dec') : 'text');
    let v = x.v;
    if (t === 'date') { v = dateSerial(v); if (v == null) { t = 'text'; v = x.v; } }
    if (t === 'time' && typeof v === 'string') { const m = /^(\d{1,2}):(\d{2})/.exec(v); v = m ? (+m[1] * 60 + +m[2]) / 1440 : null; }
    const st = gridXf(x.s || 'none', t, x.b, x.big);
    // A formula keeps its value too (the file opens right in previews; Excel recalculates on open).
    if (x.f) return v == null || v === '' ? '<c r="' + ref + '" s="' + st + '"><f>' + esc(x.f) + '</f></c>'
      : typeof v === 'number' && Number.isFinite(v) ? '<c r="' + ref + '" s="' + st + '"><f>' + esc(x.f) + '</f><v>' + v + '</v></c>'
      : '<c r="' + ref + '" t="str" s="' + st + '"><f>' + esc(x.f) + '</f><v>' + esc(v) + '</v></c>';
    if (v == null || v === '') return '<c r="' + ref + '" s="' + st + '"/>';
    if (t !== 'text' && Number.isFinite(Number(v))) return '<c r="' + ref + '" s="' + st + '"><v>' + Number(v) + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr" s="' + gridXf(x.s || 'none', 'text', x.b, x.big) + '"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }
  function gridSheetXml(x) {
    const rows = x.rows.map((r, j) => '<row r="' + (j + 1) + '"' + (x.heights?.[j] ? ' ht="' + x.heights[j] + '" customHeight="1"' : '') + '>' + (r || []).map((c, i) => gridCell(col(i) + (j + 1), c)).join('') + '</row>');
    const fr = x.freeze ? '<pane ySplit="' + x.freeze + '" topLeftCell="A' + (x.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" rightToLeft="1">' + fr + '</sheetView></sheetViews>'
      + '<cols>' + (x.widths || []).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (w || 14) + '" customWidth="1"/>').join('') + '</cols>'
      + '<sheetData>' + rows.join('') + '</sheetData>' + (x.merges?.length ? '<mergeCells count="' + x.merges.length + '">' + x.merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>' : '')
      + '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }
  function grid(name, sheets) {
    const names = new Set();
    const list = sheets.map((x, i) => { let n = String(x.name || 'ورقة').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31); while (names.has(n)) n = n.slice(0, 28) + ' ' + (i + 1); names.add(n); return { ...x, name: n }; });
    const blob = zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + list.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'
        + list.map((x, i) => '<sheet name="' + esc(x.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr fullCalcOnLoad="1"/></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + list.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
        + '<Relationship Id="rId' + (list.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', GRID_STYLES],
      ...list.map((x, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', gridSheetXml(x)]),
    ]);
    if (typeof document === 'undefined' || name === null) return blob;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name + '.xlsx' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return blob;
  }
  return { build, book, download, report, grid, col };
})();

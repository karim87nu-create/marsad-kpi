/* Local XLSX export: no upload, external service, or executable cell formulas. */
(()=>{
 'use strict';
 const encoder=new TextEncoder();
 const xml=v=>String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
 const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
 const digits=v=>String(v??'').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/٫/g,'.').replace(/٬/g,'');
 function hourOf(value){
  const s=digits(value).trim();let hour;
  if(/^\d{4}-\d\d-\d\dT/.test(s)&&/(?:Z|[+-]\d\d:\d\d)$/.test(s)){
   const date=new Date(s);if(!Number.isFinite(date.getTime()))return '';
   hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',hour:'2-digit',hourCycle:'h23'}).format(date));
  }else{
   const m=s.match(/(?:^|[\s،,T—])([0-2]?\d):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM|ص|م)?(?:\s|$)/i);if(!m)return '';
   hour=Number(m[1]);if(m[3]){if(hour<1||hour>12)return '';hour=hour%12+(/PM|م/i.test(m[3])?12:0)}
  }
  return Number.isInteger(hour)&&hour>=0&&hour<24?String(hour).padStart(2,'0')+':00':'';
 }
 function cellValue(header,value){
  const h=String(header),s=digits(value).trim();
  // Identifiers must remain literal text; counts mentioning extensions are measures.
  if(!/عدد|مرات|مدة|مدد|إجمالي/.test(h)&&/الهاتف|رقم العميل|الكود|^التحويلة$|^رقم التحويلة$|حساب أرابيكس|رقم أرابيكس|رقم القائمة/.test(h))return null;
  if(value==null||s==='')return null;
  if(h==='الساعة'&&/^(?:[01]\d|2[0-3]):00$/.test(s))return {value:Number(s.slice(0,2))/24,style:4};
  const duration=/مدة|مدد|انتظار|جاهزية|بريك|وقت مكالمات|ASA|عدم الإتاحة/.test(h)&&!/عدد|مرات|ناقصة|الحالة|التوضيح|دقة|الملاحظة/.test(h);
  const clock=s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if(duration&&clock&&+clock[2]<60&&+clock[3]<60)return {value:(+clock[1]*3600+ +clock[2]*60+ +clock[3])/86400,style:2};
  const numeric=typeof value==='number'?value:/^-?\d+(?:\.\d+)?%?$/.test(s)?Number(s.replace('%','')):NaN;
  if(!Number.isFinite(numeric))return null;
  if(/نسبة|%|الإشغال|رصد معروف/.test(h))return {value:numeric/100,style:3};
  if(duration&&!/ثوان|ثانية|دقائق|دقيقة/.test(h))return {value:numeric/86400,style:2};
  if(typeof value==='number'||/عدد|مرات|جلسات|مكالمات|محتسبة|تم الرد|فائتة|منتظرون|اتصالات|مكتملة|وارد|صادر|بريكات ناقصة|ثوان|ثانية|دقائق|متوسط المتاحين/.test(h))return {value:numeric,style:0};
  return null;
 }
 const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0}
 function zip(files){const chunks=[],central=[];let offset=0,size=0;
  for(const [path,value] of files){const name=encoder.encode(path),data=encoder.encode(value),sum=crc(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);
   v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);chunks.push(h,data);
   const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,sum,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);central.push(c);size+=c.length;offset+=h.length+data.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 }
 function build(headers,rows){
  // Attendance exports keep only operational columns, with a Cairo start-hour bucket.
  if(headers.some(h=>h==='العملية'||h==='نوع العملية')&&headers.includes('البداية')){
   const start=headers.indexOf('البداية'),keep=headers.map((h,i)=>h==='التوضيح'?-1:i).filter(i=>i>=0),outHeaders=[];
   for(const i of keep){outHeaders.push(headers[i]);if(i===start)outHeaders.push('الساعة')}
   rows=rows.map(row=>keep.flatMap(i=>i===start?[row[i],hourOf(row[i])]:[row[i]]));headers=outHeaders;
  }
  if(headers.length>16384||rows.length>1048575)throw Error('البيانات أكبر من الحد المسموح في ورقة Excel؛ اختر نطاقًا أصغر.');
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',ref='A1:'+column(headers.length-1)+(rows.length+1);
  const data=[headers,...rows].map((row,r)=>'<row r="'+(r+1)+'">'+headers.map((_,c)=>{const value=row[c],addr=column(c)+(r+1),style=r===0?' s="1"':'';
   const typed=r>0?cellValue(headers[c],value):null;
   if(typed)return '<c r="'+addr+'"'+(typed.style?' s="'+typed.style+'"':'')+'><v>'+typed.value+'</v></c>';
   if(r>0&&(value==null||value===''))return '<c r="'+addr+'"/>';
   return '<c r="'+addr+'" t="inlineStr"'+style+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
  }).join('')+'</row>').join('');
  const widths=headers.map((h,c)=>'<col min="'+(c+1)+'" max="'+(c+1)+'" width="'+Math.min(48,Math.max(16,String(h).length+3,...rows.slice(0,100).map(r=>Math.min(48,String(r[c]??'').length+2))))+'" customWidth="1"/>').join('');
  return zip([
   ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
   ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
   ['xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="التقرير" sheetId="1" r:id="rId1"/></sheets></workbook>'],
   ['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
   ['xl/styles.xml','<styleSheet xmlns="'+ns+'"><numFmts count="3"><numFmt numFmtId="164" formatCode="[h]:mm:ss"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173247"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
   ['xl/worksheets/sheet1.xml','<worksheet xmlns="'+ns+'"><dimension ref="'+ref+'"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>'+widths+'</cols><sheetData>'+data+'</sheetData><autoFilter ref="'+ref+'"/></worksheet>']
  ]);
 }
 globalThis.MarsadExcel={build,cellValue,hourOf};
})();

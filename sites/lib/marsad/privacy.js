const CLEANUP_KEY = 'privacy_customer_data_scrub_20261028';
const CONTACT_BLOCKS = new Set(['customer', 'customerdata', 'customerinfo', 'billing', 'shipping', 'contact', 'contactdetails', 'recipient', 'recipientdetails']);
const CONTACT_FIELDS = /(?:phone|mobile|telephone|email|address|street|building(?:no)?|floor(?:no)?|flat(?:no)?|apartment|postcode|zipcode|customername|clientname|recipientname|firstname|lastname|fullname)$/i;

function digits(value) {
  return String(value ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, '');
}

function isEgyptianMobile(value) {
  let d = digits(value);
  if (d.startsWith('0020')) d = '0' + d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2);
  else if (d.length === 10 && /^1[0125]/.test(d)) d = '0' + d;
  return /^01[0125]\d{8}$/.test(d);
}

function scrubText(value) {
  let text = String(value ?? '');
  text = text.replace(/(?:\+?20|0020)?[+٠-٩0-9][+٠-٩0-9 ().-]{7,20}[٠-٩0-9]/g, match => isEgyptianMobile(match) ? '[رقم محذوف]' : match);
  text = text.replace(/[•*xX]{3,}\s*[٠-٩0-9]{2,}/g, '[رقم محذوف]');
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[بريد محذوف]');
  text = text.replace(/(?<!\[)(?:عنوان(?: العميل)?|العنوان|address(?:\s*line)?|street address)\s*[:：-]?\s*[^\r\n,،;.!]+/giu, '[عنوان محذوف]');
  text = text.replace(/(?:^|\n)[^\n]*(?:شارع|عمارة|عماره|شقة|شقه|الدور)[^\n]*/gu, '\n[عنوان محذوف]');
  return text;
}

function cleanValue(value, parentKey = '', insideDetails = false) {
  if (typeof value === 'string') return scrubText(value);
  if (typeof value === 'number') return isEgyptianMobile(value) ? null : value;
  if (Array.isArray(value)) return value.map(v => cleanValue(v, parentKey, insideDetails));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  const details = insideDetails || parentKey.toLowerCase() === 'details';
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (CONTACT_BLOCKS.has(normalized) || CONTACT_FIELDS.test(normalized)) continue;
    // Apex stores an order's delivery location separately from its branch. It may identify a customer's address.
    if (details && ['loc', 'location', 'address'].includes(normalized)) continue;
    out[key] = cleanValue(item, key, details);
  }
  return out;
}

function cleanJson(text) {
  try { return JSON.stringify(cleanValue(JSON.parse(text))); }
  catch { return scrubText(text); }
}

async function batch(db, statements, size = 40) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}

function scrubProfile(text) {
  let value = {};
  try { value = JSON.parse(text); } catch {}
  if (value && !Array.isArray(value) && typeof value === 'object') {
    for (const key of Object.keys(value)) if (/^(?:name|personname|fullname|firstname|lastname|customername|clientname)$/i.test(key.replace(/[^a-z]/gi,''))) delete value[key];
  }
  return JSON.stringify(cleanValue(value));
}

async function scrubCustomerData(db) {
  if (await db.prepare('SELECT value FROM settings WHERE key=?').get(CLEANUP_KEY)) return;

  // Revoke the two order-source keys before inspecting stored rows. Unrelated settings and site/employee accounts stay intact.
  await db.batch([
    db.prepare("INSERT INTO settings (key,value) VALUES ('orders_ingest_disabled','1') ON CONFLICT(key) DO UPDATE SET value='1'").bind(),
    db.prepare("INSERT INTO settings (key,value) VALUES ('talabat_ingest_disabled','1') ON CONFLICT(key) DO UPDATE SET value='1'").bind(),
    db.prepare("DELETE FROM settings WHERE key IN ('orders_token_hash','talabat_token_hash')").bind(),
    db.prepare('UPDATE wa_messages SET phone=NULL WHERE phone IS NOT NULL').bind(),
    db.prepare('DELETE FROM wa_identity').bind(),
  ]);

  const changed = { profiles: 0, apexSnapshots: 0, calls: 0, liveSnapshots: 0, messages: 0, alertKeys: 0 };
  const profiles = await db.prepare('SELECT source,ref,data FROM match_profiles').all();
  const profileWrites = [];
  for (const row of profiles) {
    const next = scrubProfile(row.data);
    if (next !== row.data) {
      let value = {};
      try { value = JSON.parse(next); } catch {}
      if (value && !Object.keys(value).length) profileWrites.push(db.prepare('DELETE FROM match_profiles WHERE source=? AND ref=?').bind(row.source,row.ref));
      else profileWrites.push(db.prepare('UPDATE match_profiles SET data=? WHERE source=? AND ref=?').bind(next,row.source,row.ref));
      changed.profiles++;
    }
  }
  await batch(db, profileWrites);

  const snapshots = await db.prepare('SELECT day,data FROM orders_days').all();
  const snapshotWrites = [];
  for (const row of snapshots) {
    const next = cleanJson(row.data);
    if (next !== row.data) { snapshotWrites.push(db.prepare('UPDATE orders_days SET data=? WHERE day=?').bind(next,row.day)); changed.apexSnapshots++; }
  }
  await batch(db, snapshotWrites);

  const eventResult = await db.prepare(`UPDATE events SET phone=NULL,
    payload=CASE WHEN payload IS NULL THEN NULL WHEN json_valid(payload) AND json_type(payload)='object' THEN json_remove(payload,
      '$.phone','$.mobile','$.telephone','$.email','$.emailAddress','$.address','$.address1','$.address2','$.customer','$.customerData','$.customerInfo','$.customerName','$.clientName','$.firstName','$.lastName','$.billing','$.shipping','$.recipient',
      '$.payload.phone','$.payload.mobile','$.payload.address','$.payload.customer','$.payload.customerName','$.payload.billing','$.payload.shipping','$.payload.recipient') ELSE NULL END,
    extra=CASE WHEN extra IS NULL THEN NULL WHEN json_valid(extra) AND json_type(extra)='object' THEN json_remove(extra,
      '$.phone','$.mobile','$.telephone','$.email','$.emailAddress','$.address','$.address1','$.address2','$.customer','$.customerData','$.customerInfo','$.customerName','$.clientName','$.firstName','$.lastName','$.billing','$.shipping','$.recipient',
      '$.payload.phone','$.payload.mobile','$.payload.address','$.payload.customer','$.payload.customerName','$.payload.billing','$.payload.shipping','$.payload.recipient') ELSE NULL END`).run();
  changed.calls += eventResult.changes || 0;

  const liveResult = await db.prepare(`UPDATE live_snapshots SET rows=COALESCE((
    SELECT json_group_array(json(CASE WHEN json_type(value,'$[9]') IS NULL THEN value ELSE json_set(value,'$[9]','') END))
    FROM json_each(live_snapshots.rows)),'[]') WHERE json_valid(rows)`).run();
  changed.liveSnapshots = liveResult.changes || 0;

  const reports = await db.prepare('SELECT id,header FROM history_reports').all();
  for (const report of reports) {
    let header = [], indices = new Set();
    try { header = JSON.parse(report.header); } catch {}
    for (let i = 0; i < header.length; i++) {
      const label = String(header[i]);
      if (/phone|mobile|telephone|caller|\bcli\b|الهاتف|رقم العميل|customer|client|address|street|عنوان/i.test(label) && !/agent|account|operator|employee|extension/i.test(label)) indices.add(i);
    }
    let expression = 'raw';
    for (const index of indices) expression = `json_set(${expression},'$[${index}]','')`;
    if (indices.size) changed.calls += (await db.prepare(`UPDATE history_calls SET raw=${expression} WHERE report_id=? AND json_valid(raw)`).run(report.id)).changes || 0;
    await db.prepare("UPDATE history_reports SET fingerprint='scrubbed-' || id WHERE id=?").run(report.id);
  }

  const generic = [
    ['messages','id','title,message'],
    ['saved_reports','id','filters,payload'],
    ['telegram_log','id','text,error'],
    ['exception_reviews','key','reason,note'],
    ['shift_decisions','id','note'],
  ];
  for (const [table,key,fields] of generic) {
    const names = fields.split(','), rows = await db.prepare(`SELECT ${key},${names.join(',')} FROM ${table}`).all();
    const writes = [];
    for (const row of rows) {
      const values = names.map(name => row[name] == null ? null : cleanJson(String(row[name])));
      if (names.some((name,i) => values[i] !== row[name])) writes.push(db.prepare(`UPDATE ${table} SET ${names.map(name => name+'=?').join(',')} WHERE ${key}=?`).bind(...values,row[key]));
    }
    if (table === 'messages' || table === 'telegram_log') changed.messages += writes.length;
    await batch(db,writes);
  }

  const alertStates = await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'orders_alert_states:%'").all();
  await batch(db, alertStates.map(row => {
    const value = cleanJson(row.value);
    return value === row.value ? null : db.prepare('UPDATE settings SET value=? WHERE key=?').bind(value,row.key);
  }).filter(Boolean));

  const logs = await db.prepare('SELECT id,key,reply_to FROM telegram_log').all(), keyMap = new Map(), keyWrites = [];
  for (const row of logs) {
    if (/^(?:waitSla|missed):/.test(row.key) || /(?:^|\D)(?:\+?20)?01[0125][0-9٠-٩]{8}(?:\D|$)/.test(row.key)) {
      const replacement = 'privacy-redacted:' + row.id;
      keyMap.set(row.key,replacement);
      keyWrites.push(db.prepare('UPDATE telegram_log SET key=? WHERE id=?').bind(replacement,row.id));
      changed.alertKeys++;
    }
  }
  for (const row of logs) if (row.reply_to && keyMap.has(row.reply_to)) keyWrites.push(db.prepare('UPDATE telegram_log SET reply_to=? WHERE id=?').bind(keyMap.get(row.reply_to),row.id));
  await batch(db,keyWrites);

  // Redact free-text cancellation explanations and any legacy customer fragments in the Talabat item payload.
  const talabat = await db.prepare('SELECT id,cancel_reason,items,milestones FROM talabat_orders').all();
  const talabatWrites = [];
  for (const row of talabat) {
    const reason = row.cancel_reason == null ? null : scrubText(row.cancel_reason);
    const items = row.items == null ? null : cleanJson(row.items), milestones = row.milestones == null ? null : cleanJson(row.milestones);
    if (reason !== row.cancel_reason || items !== row.items || milestones !== row.milestones)
      talabatWrites.push(db.prepare('UPDATE talabat_orders SET cancel_reason=?,items=?,milestones=? WHERE id=?').bind(reason,items,milestones,row.id));
  }
  await batch(db,talabatWrites);

  const remaining = { sourceBindings:0, profiles:0, apexSnapshots:0, eventContacts:0, liveContacts:0, historyPhones:0, whatsappPhones:0, textContacts:0, messageKeys:0 };
  const disabled = await db.prepare("SELECT key,value FROM settings WHERE key IN ('orders_ingest_disabled','talabat_ingest_disabled','orders_token_hash','talabat_token_hash')").all();
  if (!disabled.some(x => x.key==='orders_ingest_disabled' && x.value==='1')) remaining.sourceBindings++;
  if (!disabled.some(x => x.key==='talabat_ingest_disabled' && x.value==='1')) remaining.sourceBindings++;
  if (disabled.some(x => ['orders_token_hash','talabat_token_hash'].includes(x.key))) remaining.sourceBindings++;
  for (const row of await db.prepare('SELECT data FROM match_profiles').all()) if (scrubProfile(row.data)!==row.data) remaining.profiles++;
  for (const row of await db.prepare('SELECT data FROM orders_days').all()) if (cleanJson(row.data)!==row.data) remaining.apexSnapshots++;
  remaining.eventContacts = (await db.prepare(`SELECT COUNT(*) n FROM events WHERE phone IS NOT NULL OR
    (json_valid(payload) AND (json_type(payload,'$.phone') IS NOT NULL OR json_type(payload,'$.customer') IS NOT NULL OR json_type(payload,'$.address') IS NOT NULL)) OR
    (json_valid(extra) AND (json_type(extra,'$.phone') IS NOT NULL OR json_type(extra,'$.customer') IS NOT NULL OR json_type(extra,'$.address') IS NOT NULL))`).get()).n;
  remaining.liveContacts = (await db.prepare(`SELECT COUNT(*) n FROM live_snapshots WHERE EXISTS (
    SELECT 1 FROM json_each(live_snapshots.rows) r WHERE json_extract(r.value,'$[9]') IS NOT NULL AND json_extract(r.value,'$[9]')!='')`).get()).n;
  if ((await db.prepare('SELECT COUNT(*) n FROM wa_messages WHERE phone IS NOT NULL').get()).n || (await db.prepare('SELECT COUNT(*) n FROM wa_identity').get()).n) remaining.whatsappPhones++;
  for (const report of await db.prepare('SELECT id,header FROM history_reports').all()) {
    let header=[]; try { header=JSON.parse(report.header); } catch {}
    const indexes=[];
    for (let i=0;i<header.length;i++) if (/phone|mobile|telephone|caller|\bcli\b|الهاتف|رقم العميل|customer|client|address|street|عنوان/i.test(String(header[i])) && !/agent|account|operator|employee|extension/i.test(String(header[i]))) indexes.push(i);
    for (const index of indexes) if ((await db.prepare(`SELECT COUNT(*) n FROM history_calls WHERE report_id=? AND json_valid(raw) AND COALESCE(json_extract(raw,'$[${index}]'),'')!=''`).get(report.id)).n) remaining.historyPhones++;
  }
  for (const row of await db.prepare('SELECT title,message FROM messages').all()) if (scrubText(row.title)!==row.title || scrubText(row.message)!==row.message) remaining.textContacts++;
  for (const row of await db.prepare('SELECT text,error,key FROM telegram_log').all()) {
    if ((row.text && scrubText(row.text)!==row.text) || (row.error && scrubText(row.error)!==row.error)) remaining.textContacts++;
    if (/^(?:waitSla|missed):/.test(row.key) || /(?:^|\D)(?:\+?20)?01[0125][0-9٠-٩]{8}(?:\D|$)/.test(row.key)) remaining.messageKeys++;
  }
  console.info('marsad_customer_privacy_verification', JSON.stringify({ remaining }));
  if (Object.values(remaining).some(Boolean)) throw new Error('customer_privacy_verification_failed');

  await db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(CLEANUP_KEY,'1');
  console.info('marsad_customer_privacy_cleanup', JSON.stringify({ ...changed, completed:true }));
}

export { scrubCustomerData, scrubText, cleanValue };

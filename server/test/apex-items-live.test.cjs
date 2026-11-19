'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { APEX_NAMES, APEX_PRICES } = require('../src/menu-seed.js');

// Karim 11-19 review: an item added on Apex is known without a code change; the built-in prices are not replaced.
test('apex items from the writer: new items added, known prices kept', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    const token = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const w = body => t.call('POST', '/api/apex-writer/items', { body, headers: { 'x-apex-writer': token } });
    assert.equal((await t.call('POST', '/api/apex-writer/items', { body: { items: [] }, headers: { 'x-apex-writer': 'bad' } })).status, 401);
    const known = Object.keys(APEX_PRICES)[0], before = APEX_PRICES[known];
    const r = await w({ items: [{ no: '0999901', name: 'صنف جديد تجربة', price: 120 }, { no: known, name: 'x', price: 1 }, { no: 'bad', name: 'y' }] });
    assert.equal(r.status, 200); assert.equal(r.body.added, 1);
    assert.equal(APEX_NAMES['0999901'], 'صنف جديد تجربة'); assert.equal(APEX_PRICES['0999901'], 120);
    assert.equal(APEX_PRICES[known], before, 'a built-in price stays');
    assert.equal((await w({ items: [{ no: '0999901', name: 'صنف جديد تجربة', price: 120 }] })).body.added, 0, 'once');
  } finally { await t.close(); }
});

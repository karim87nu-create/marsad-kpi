'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');
const { TUNE } = require('../src/tune.js');

// Karim 11-19: the numbers and word lists change from the admin page, no publish.
test('operating settings: numbers and word lists from the admin page, with limits and reset', async () => {
  const t = await start();
  try {
    const admin = await t.admin();
    let d = (await admin('GET', '/api/ops-settings')).body.tune;
    assert.equal(d.values.scheduledLeadMin, 60); assert.ok(d.defs.every(x => x.label && x.help));
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { key: 'scheduledLeadMin', value: 90 })).status, 200);
    assert.equal(TUNE.scheduledLeadMin, 90, 'used at once');
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { key: 'scheduledLeadMin', value: 5000 })).status, 400);
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { key: 'nope', value: 1 })).status, 400);
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { list: 'foodWords', word: 'برغل' })).status, 200);
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { list: 'okWords', word: 'كبيرة' })).status, 200);
    const token = (await admin('POST', '/api/apex-writer', { action: 'token' })).body.token;
    const rules = (await t.call('POST', '/api/apex-writer/note-rules', { body: {}, headers: { 'x-apex-writer': token } })).body;
    assert.deepEqual(rules, { foodWords: ['برغل'], okWords: ['كبيره'] });
    assert.equal((await t.call('POST', '/api/apex-writer/note-rules', { body: {}, headers: { 'x-apex-writer': 'bad' } })).status, 401);
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { key: 'scheduledLeadMin', reset: true })).status, 200);
    d = (await admin('GET', '/api/ops-settings')).body.tune; assert.equal(d.values.scheduledLeadMin, 60);
    await admin('PUT', '/api/ops-settings/tune', { list: 'foodWords', word: 'برغل', remove: true });
    assert.deepEqual((await admin('GET', '/api/ops-settings')).body.tune.words.foodWords, []);
  } finally { await t.close(); }
});

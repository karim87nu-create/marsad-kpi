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
    assert.equal(rules.foodWords[0], 'برغل'); assert.ok(rules.foodWords.includes('فريك'), 'the list Claude set stays, editable');
    assert.equal(rules.okWords[0], 'كبيره'); assert.ok(rules.okWords.includes('يكون'));
    assert.equal((await t.call('POST', '/api/apex-writer/note-rules', { body: {}, headers: { 'x-apex-writer': 'bad' } })).status, 401);
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { key: 'scheduledLeadMin', reset: true })).status, 200);
    d = (await admin('GET', '/api/ops-settings')).body.tune; assert.equal(d.values.scheduledLeadMin, 60);
    assert.equal((await admin('PUT', '/api/ops-settings/tune', { pairs: 'choiceWords', from: 'سلطة طحينة', to: 'طحينة' })).status, 200);
    assert.deepEqual((await admin('GET', '/api/ops-settings')).body.tune.pairs.choiceWords[0], { from: 'سلطة طحينة', to: 'طحينة' });
    await admin('PUT', '/api/ops-settings/tune', { pairs: 'choiceWords', from: 'سلطه طحينه', remove: true });
    assert.ok(!(await admin('GET', '/api/ops-settings')).body.tune.pairs.choiceWords.some(x => x.from === 'سلطة طحينة'), 'ة/ه alike');
    await admin('PUT', '/api/ops-settings/tune', { list: 'foodWords', word: 'برغل', remove: true });
    assert.ok(!(await admin('GET', '/api/ops-settings')).body.tune.words.foodWords.includes('برغل'));
    assert.deepEqual((await admin('GET', '/api/ops-settings')).body.tune.changed.words.sort(), ['foodWords', 'okWords']);
    await admin('PUT', '/api/ops-settings/tune', { list: 'foodWords', reset: true });
    const back = (await admin('GET', '/api/ops-settings')).body.tune; assert.ok(back.words.foodWords.includes('برغل') && back.words.foodWords.includes('فريك'), 'the original back');
    assert.deepEqual(back.changed.words, ['okWords']);
  } finally { await t.close(); }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Karim 11-14 (screenshot): «اختار الصنف على Apex ×4 — الموقع: 4× ↳ بلدي» under «صدور مشوية».
test('a website choice line goes with its dish; a priced one stays an add-on', async () => {
  const { siteLines } = await import('../src/transfer.js');
  const out = siteLines([
    { name: 'صدور مشوية — ربع كيلو', qty: 4, price: 980, modifiers: ['اختيارات السلطة المجانية: طحينة × 4'], options: [] },
    { name: 'ارز بسمتي', qty: 4, price: 300 },
    { name: '↳ بلدي', qty: 4, price: 0, addon: true, parent: 'صدور مشوية — ربع كيلو' },
    { name: '↳ بطاطس', qty: 1, price: 40, addon: true, parent: 'ارز بسمتي' }]);
  assert.deepEqual(out.map(x => x.name), ['صدور مشوية — ربع كيلو', 'ارز بسمتي', 'بطاطس']);
  assert.ok(out[0].modifiers.includes('بلدي'));
  assert.equal(out[2].addon, true); assert.equal(out[2].parent, 'ارز بسمتي');
  // No parent written: the dish above it.
  assert.deepEqual(siteLines([{ name: 'ساندوتش كفته عيش بلدي اوملفوف', qty: 1, price: 60 }, { name: '↳ ملفوف', qty: 1, price: 0 }])[0].modifiers, ['ملفوف']);
});

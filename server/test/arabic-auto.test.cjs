'use strict';
// Karim 11-11: names and addresses typed in English are written in Arabic on Apex automatically, free; what staff
// correct is learned.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers.cjs');

test('English names and addresses come out in Arabic, and a correction is learned', async () => {
  const t = await start({ at: Date.UTC(2026, 10, 11, 10) });
  try {
    const ar = async (...x) => [...(await t.app.toArabic(x)).values()];
    assert.deepEqual(await ar('Bosy hossam'), ['بوسي حسام']);
    assert.deepEqual(await ar('Mohamed Abdelghany'), ['محمد عبدالغني']);
    assert.deepEqual(await ar('Ahmed Elsayed'), ['أحمد السيد']);
    const [addr] = await ar('Building 12, Banafseg 5, in front of the mosque');
    assert.ok(!/[A-Za-z]{2,}/.test(addr), addr);
    assert.match(addr, /عمارة 12/); assert.match(addr, /البنفسج 5/); assert.match(addr, /أمام/);
    assert.deepEqual(await ar('Villa B12, AUC'), ['فيلا B12, AUC'], 'codes and acronyms stay');
    // Staff write it better: the whole text and each word are kept.
    await t.app.learnArabic('Hamdan Kassem', 'حمدان قاسم');
    assert.deepEqual(await ar('Hamdan Kassem'), ['حمدان قاسم']);
    assert.deepEqual(await ar('Kassem Ali'), ['قاسم علي'], 'the word learned is used in another name');
  } finally { await t.close(); }
});

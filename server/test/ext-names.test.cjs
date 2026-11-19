'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Karim 11-18 «أسماء العملاء بتتكتب غلط جدا» / «اي انكنوون دي»: Talabat names come out in Arabic from the extension.
test('extension names: known spellings, same consonants, «Unknown» dropped, unknown words kept', () => {
  require(path.join(__dirname, '..', '..', 'extension-3', 'names.js'));
  const n = globalThis.MARSAD_NAME;
  assert.equal(n('Mohmad Rayan'), 'محمد Rayan');
  assert.equal(n('Srah Sayd'), 'سارة سيد');
  assert.equal(n('Abdulrhman Ahmed'), 'عبدالرحمن أحمد');
  assert.equal(n('Gameel'), 'جميل');
  assert.equal(n('Gamal'), 'جمال');
  assert.equal(n('Mahmod'), 'محمود');
  assert.equal(n('Unknown'), '');
  assert.equal(n('unknown '), '');
  assert.equal(n('Celebrity Steel'), 'Celebrity Steel');
  assert.equal(n('Ahmed Elgazzar'), 'أحمد الجزار');
  assert.equal(n('أحمد'), 'أحمد');
});

// Karim 11-19 «الاسماء خصوصا الثنائي»: «Abd …», «… Eldin», lone letters and empty names.
test('extension names: two-part names', () => {
  delete require.cache[require.resolve(path.join(__dirname, '..', '..', 'extension-3', 'names.js'))];
  require(path.join(__dirname, '..', '..', 'extension-3', 'names.js'));
  const n = globalThis.MARSAD_NAME;
  assert.equal(n('Abd Rahim Mohamed'), 'عبدالرحيم محمد');
  assert.equal(n('Tamer Abd Fattah'), 'تامر عبدالفتاح');
  assert.equal(n('Abd El Fattah Ali'), 'عبدالفتاح علي');
  assert.equal(n('Abdel Rahman'), 'عبدالرحمن');
  assert.equal(n('Osama Saadeldin'), 'أسامة سعد الدين');
  assert.equal(n('Mohamed Salah Eldin'), 'محمد صلاح الدين');
  assert.equal(n('H Ibrahim'), 'إبراهيم');
  assert.equal(n('😊 ??'), '');
  assert.equal(n('Omar Khalifa'), 'عمر خليفة');
});

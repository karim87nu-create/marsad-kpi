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

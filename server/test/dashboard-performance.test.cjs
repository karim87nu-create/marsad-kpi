const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../..');
function env() {
  const dom = new JSDOM('<div id="rows"></div>'), doc = dom.window.document;
  const h = (tag, props = {}, ...children) => { const el = doc.createElement(tag); Object.assign(el, props); el.append(...children.filter(x => x != null)); return el; };
  return { dom, doc, h, Node: dom.window.Node, $: id => doc.getElementById(id) };
}
test('Talabat pagination renders 50 rows, reaches every order and sorts the complete list', () => {
  const c = env(); vm.createContext(c);
  const s = fs.readFileSync(path.join(root, 'v2/app.js'), 'utf8');
  vm.runInContext(s.slice(s.indexOf('  function table('), s.indexOf('  function exportSheets(')) + ';this.draw=table;', c);
  const rows = Array.from({ length: 123 }, (_, i) => ({ n: i }));
  c.draw('rows', [{ title: 'Order', get: r => r.n }], rows, { pageSize: 50 });
  const box = c.$('rows');
  assert.equal(box.querySelectorAll('tbody tr').length, 50);
  box.querySelectorAll('button')[1].click(); assert.equal(box.querySelector('tbody td').textContent, '50');
  box.querySelectorAll('button')[1].click(); assert.equal(box.querySelectorAll('tbody tr').length, 23);
  assert.equal(box.querySelector('tbody tr:last-child td').textContent, '122');
  box.querySelector('th').click(); assert.equal(box.querySelector('tbody td').textContent, '0');
  box.querySelector('th').click(); assert.equal(box.querySelector('tbody td').textContent, '122');
  c.dom.window.close();
});
test('Apex choices are built once only when a Talabat selector is opened', () => {
  const c = env();
  Object.assign(c, { d: { apexLinked: true, unmatchedApex: Array.from({ length: 1000 }, (_, i) => ({ no: i + 1, branch: 'التجمع' })), orders: [] },
    t12: () => '', matchingLabel: () => 'مرشح', ctx: { canWrite: () => true }, api: async () => ({}), renderTalabat() {} });
  vm.createContext(c); const s = fs.readFileSync(path.join(root, 'v2/site.js'), 'utf8');
  vm.runInContext(s.slice(s.indexOf('    const linkCell = x =>'), s.indexOf("    table('talOrders'")) + ';this.cell=linkCell;', c);
  const sel = c.cell({ id: '12345678', store: 'التجمع' });
  assert.equal(sel.options.length, 2);
  sel.onfocus(); assert.equal(sel.options.length, 1002);
  sel.onpointerdown(); assert.equal(sel.options.length, 1002);
  c.dom.window.close();
});

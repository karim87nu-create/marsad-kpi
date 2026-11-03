const test = require('node:test');
const assert = require('node:assert/strict');

test('D1 request initializes independently when another initialization is suspended', async () => {
  const { createApp } = await import('../src/app.js');
  let enter, release, batches = 0;
  const entered = new Promise(r => { enter = r; });
  const suspended = new Promise(r => { release = r; });
  const db = { kind: 'd1',
    prepare: () => ({ bind: () => ({}), all: async () => [], run: async () => ({}) }),
    batch: async () => { if (++batches === 1) { enter(); await suspended; } return []; }
  };
  const app = createApp({ db, config: { secret: 'test-only' } });
  app.route('GET', '/probe', () => ({ ok: true }));
  const first = app.fetch(new Request('http://localhost/probe'));
  await entered;
  let timer;
  try {
    const next = await Promise.race([app.fetch(new Request('http://localhost/probe')), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('shared pending initialization')), 1000); })]);
    assert.equal(next.status, 200);
    release(); await first;
    await app.fetch(new Request('http://localhost/probe'));
    assert.equal(batches, 2, 'completed initialization is reused without re-running schema');
  } finally { clearTimeout(timer); release(); }
});


test('D1 matching does not wait on another request pending database read', async () => {
  const { start } = require('./helpers.cjs');
  const t = await start(); let release, timer;
  try {
    t.app.db.kind = 'd1';
    const prepare = t.app.db.prepare.bind(t.app.db);
    let first = true, enter;
    const entered = new Promise(r => { enter = r; });
    const suspended = new Promise(r => { release = r; });
    t.app.db.prepare = sql => {
      const st = prepare(sql);
      if (first && sql.startsWith('SELECT * FROM talabat_orders WHERE day')) {
        first = false; const all = st.all.bind(st);
        st.all = async (...args) => { enter(); await suspended; return all(...args); };
      }
      return st;
    };
    const pending = t.app.talabat.matchDay('2026-10-22');
    await entered;
    const result = await Promise.race([t.app.talabat.matchDay('2026-10-22'), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('shared pending match')),1000); })]);
    assert.deepEqual(result.rows, []); release(); await pending;
  } finally { clearTimeout(timer); release?.(); await t.close(); }
});

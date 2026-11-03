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

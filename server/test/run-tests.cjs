// Legacy browser fixtures leave timers alive. New isolated fault tests shut down normally;
// forcing their Windows worker exit triggers a Node 24 libuv assertion after assertions pass.
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const files = readdirSync(__dirname).filter(f => f.endsWith('.test.cjs')).sort();
for (const audit of [false, true]) {
  const selected = files.filter(f => f.startsWith('audit-') === audit).map(f => join(__dirname, f));
  if (!selected.length) continue;
  const args = ['--test', ...(audit ? [] : ['--test-force-exit']), ...selected];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: 180000 });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

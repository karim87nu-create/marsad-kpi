// The server code exists twice: sites/lib/marsad is what ChatGPT Sites runs, server/src is what the tests (and the
// Node server) run. Karim 08-11: they drifted apart and the tests passed on code that was never deployed. This check
// fails when any shared file differs, or when a file the site runs is missing from server/src.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), site = path.join(root, 'sites/lib/marsad'), node = path.join(root, 'server/src');
const NODE_ONLY = new Set(['index.js', 'main.js', 'node-db.js', 'import-old-db.js', 'import-route.js']), SITE_ONLY = new Set(['package.json']);
const bad = [];
for (const f of fs.readdirSync(site)) {
  if (SITE_ONLY.has(f)) continue;
  const n = path.join(node, f);
  if (!fs.existsSync(n)) bad.push('missing in server/src: ' + f);
  else if (!fs.readFileSync(n).equals(fs.readFileSync(path.join(site, f)))) bad.push('different: ' + f);
}
for (const f of fs.readdirSync(node)) if (!NODE_ONLY.has(f) && !fs.existsSync(path.join(site, f))) bad.push('missing in sites/lib/marsad: ' + f);
if (bad.length) { console.error('server/src and sites/lib/marsad differ:\n  ' + bad.join('\n  ') + '\nCopy the change to both places.'); process.exit(1); }
console.log('server/src and sites/lib/marsad are the same');

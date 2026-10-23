// Copies the server core and the admin page into sites/ (the ChatGPT Sites project files).
// Run after any change: node server/scripts/build-sites.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = ['admin', 'app', 'arabicss', 'attendance-rules', 'breaks', 'core', 'dashboard', 'db', 'employees', 'engine', 'history', 'legacy', 'messages', 'modules',
  'security', 'sessions', 'shifts', 'telegram', 'time', 'xlsx-read'];
const lib = path.join(root, 'sites', 'lib', 'marsad');
fs.rmSync(lib, { recursive: true, force: true });
fs.mkdirSync(lib, { recursive: true });
for (const f of CORE) fs.copyFileSync(path.join(root, 'server', 'src', f + '.js'), path.join(lib, f + '.js'));
fs.writeFileSync(path.join(lib, 'package.json'), '{ "type": "module" }\n');
const admin = path.join(root, 'sites', 'public', 'admin');
fs.rmSync(admin, { recursive: true, force: true });
fs.mkdirSync(admin, { recursive: true });
for (const f of ['index.html', 'style.css', 'xlsx.js', 'app.js']) fs.copyFileSync(path.join(root, 'v2', f), path.join(admin, f));
// Served by the same site, so the API is the same origin.
fs.writeFileSync(path.join(admin, 'config.js'), "window.MARSAD_API = '';\n");
// Nothing in lib/marsad may need Node: check the imports.
for (const f of CORE) {
  const src = fs.readFileSync(path.join(lib, f + '.js'), 'utf8');
  for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) if (!m[1].startsWith('./')) throw Error(f + '.js imports ' + m[1]);
}
console.log('sites/ updated:', CORE.length, 'server files, admin page');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../admin-layout.css', import.meta.url), 'utf8');

assert.match(
  admin,
  /setInterval\(\(\)=>\{if\(selectedTab==='live'\)renderLive\(\);if\(selectedTab==='attendance'\)renderAttendanceDurations\(\)\},1000\)/,
  'per-second live table rendering must be limited to the visible live page',
);
assert.match(admin, /selectedTab==='live'\)refresh\(\)/, 'the live API refresh loop must remain active');
assert.match(layout, /@media\s*\(max-width:\s*820px\)/, 'mobile drawer layout must remain present');
assert.match(layout, /@media\s*\(max-width:\s*640px\)/, 'mobile table layout must remain present');

console.log('PASS: hidden live views do not re-render every second; live sync and mobile breakpoints remain enabled.');

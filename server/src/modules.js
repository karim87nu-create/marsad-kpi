// Every feature module, in setup order. Imported statically so a bundler (Cloudflare) sees them all.
import * as admin from './admin.js';
import * as employees from './employees.js';
import * as sessions from './sessions.js';
import * as dashboard from './dashboard.js';
import * as breaks from './breaks.js';
import * as messages from './messages.js';
import * as shifts from './shifts.js';
import * as history from './history.js';
import * as engine from './engine.js';
import * as telegram from './telegram.js';
import * as importRows from './import-rows.js';
import * as ops from './ops.js';
import * as range from './range.js';
import * as orders from './orders.js';
import * as names from './names.js';
import * as site from './site.js';

const MODULES = [admin, employees, sessions, dashboard, breaks, messages, shifts, history, engine, telegram, importRows, ops, range, orders, names, site];
export { MODULES };

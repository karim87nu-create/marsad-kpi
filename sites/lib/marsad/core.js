// The whole server without any Node-only part: build it on any database adapter (see db.js).
import { createApp } from './app.js';
import { MODULES } from './modules.js';

function buildCore(db, config, { now } = {}) {
  const app = createApp({ db, config, now });
  for (const m of MODULES) m.setup(app);
  return app;
}

export { buildCore };

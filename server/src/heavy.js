'use strict';
// app.heavy(fn, ...args): call a day-wide calculation on the worker thread (see heavy-worker.js).
// With an in-memory database (tests) the worker cannot share it, so the call runs in place.
const path = require('node:path');
const { Worker } = require('node:worker_threads');

function setup(app) {
  const file = app.config.databasePath;
  if (app.config.worker || !file || file === ':memory:') { app.heavy = async (fn, ...args) => app[fn](...args); return; }
  let worker = null, seq = 0;
  const waiting = new Map();
  function start() {
    worker = new Worker(path.join(__dirname, 'heavy-worker.js'), { workerData: { databasePath: file, config: { ...app.config, adminPasswordHash: null } } });
    worker.on('message', ({ id, result, error }) => {
      const w = waiting.get(id); if (!w) return; waiting.delete(id);
      if (error) { const e = Error(error.message); e.status = error.status; e.code = error.code; w.reject(e); } else w.resolve(result);
    });
    const restart = err => { worker = null; for (const w of waiting.values()) w.reject(err instanceof Error ? err : Error('worker_stopped')); waiting.clear(); };
    worker.on('error', restart);
    worker.on('exit', code => { if (code !== 0) restart(Error('worker_exit_' + code)); else worker = null; });
    worker.unref();
  }
  app.heavy = (fn, ...args) => new Promise((resolve, reject) => {
    if (!worker) start();
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, fn, args });
  });
  app.stopHeavy = () => worker?.terminate();
}

module.exports = { setup };

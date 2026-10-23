'use strict';
// Runs the day-wide calculations (dashboard with attendance, operations analysis, missed-call
// contexts) on its own thread and its own read connection, so the main thread keeps answering
// the extensions and the live view while they run.
const { parentPort, workerData } = require('node:worker_threads');
const { open } = require('./db');
const { createApp } = require('./app');
const { MODULES } = require('./modules');

const app = createApp({ db: open(workerData.databasePath), config: { ...workerData.config, worker: true } });
for (const m of MODULES) require(m).setup(app);

parentPort.on('message', async ({ id, fn, args }) => {
  try { parentPort.postMessage({ id, result: await app[fn](...args) }); }
  catch (error) { parentPort.postMessage({ id, error: { message: error.message, status: error.status, code: error.code } }); }
});

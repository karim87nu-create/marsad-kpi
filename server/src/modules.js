'use strict';
// Order matters: later modules use functions earlier ones put on app.
const MODULES = ['./admin', './employees', './sessions', './dashboard', './breaks', './messages', './shifts', './history', './engine', './telegram', './heavy'];

module.exports = { MODULES };

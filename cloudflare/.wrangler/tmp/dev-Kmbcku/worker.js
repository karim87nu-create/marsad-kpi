var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key2 of Object.getOwnPropertyNames(proto)) {
    if (key2 !== "constructor" && !(key2 in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key2);
      if (desc) {
        Object.defineProperty(performance, key2, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// ../sites/lib/marsad/security.js
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var enc = new TextEncoder();
var dec = new TextDecoder();
var bytes = /* @__PURE__ */ __name((v) => v instanceof Uint8Array ? v : enc.encode(String(v)), "bytes");
function sha256Bytes(input) {
  const msg = bytes(input), len = msg.length, total = len + 9 + 63 >> 6 << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 128;
  const bits = len * 8, view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bits / 4294967296));
  view.setUint32(total - 4, bits >>> 0);
  const H = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const W = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a2 = W[i - 15], b2 = W[i - 2];
      const s0 = (a2 >>> 7 | a2 << 25) ^ (a2 >>> 18 | a2 << 14) ^ a2 >>> 3;
      const s1 = (b2 >>> 17 | b2 << 15) ^ (b2 >>> 19 | b2 << 13) ^ b2 >>> 10;
      W[i] = W[i - 16] + s0 + W[i - 7] + s1 | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const t1 = h + S1 + (e & f ^ ~e & g) + K[i] + W[i] | 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const t2 = S0 + (a & b ^ a & c ^ b & c) | 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 | 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  H.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}
__name(sha256Bytes, "sha256Bytes");
function hmacBytes(key2, message) {
  let k = bytes(key2);
  if (k.length > 64) k = sha256Bytes(k);
  const ipad = new Uint8Array(64 + 0), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = (k[i] || 0) ^ 54;
    opad[i] = (k[i] || 0) ^ 92;
  }
  const m = bytes(message), inner = new Uint8Array(64 + m.length);
  inner.set(ipad);
  inner.set(m, 64);
  const ih = sha256Bytes(inner), outer = new Uint8Array(96);
  outer.set(opad);
  outer.set(ih, 64);
  return sha256Bytes(outer);
}
__name(hmacBytes, "hmacBytes");
var hex = /* @__PURE__ */ __name((b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""), "hex");
var fromHex = /* @__PURE__ */ __name((s) => Uint8Array.from(String(s).match(/../g) || [], (x) => parseInt(x, 16)), "fromHex");
var b64 = /* @__PURE__ */ __name((b) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join("")), "b64");
var fromB64 = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), "fromB64");
var b64url = /* @__PURE__ */ __name((b) => b64(bytes(b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64url");
var fromB64url = /* @__PURE__ */ __name((s) => {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  return fromB64(t + "=".repeat((4 - t.length % 4) % 4));
}, "fromB64url");
var sha256 = /* @__PURE__ */ __name((s) => hex(sha256Bytes(s)), "sha256");
var randomBytes = /* @__PURE__ */ __name((n) => crypto.getRandomValues(new Uint8Array(n)), "randomBytes");
var randomToken = /* @__PURE__ */ __name((n = 32) => hex(randomBytes(n)), "randomToken");
var randomUUID = /* @__PURE__ */ __name(() => crypto.randomUUID(), "randomUUID");
var equal = /* @__PURE__ */ __name((a, b) => {
  const x = bytes(a), y = bytes(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}, "equal");
async function pbkdf2Hex(secret, salt, iterations = 1e5, length = 32) {
  const key2 = await crypto.subtle.importKey("raw", bytes(secret), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations }, key2, length * 8)));
}
__name(pbkdf2Hex, "pbkdf2Hex");
async function hashPassword(password) {
  const salt = randomToken(16);
  return "pbkdf2$" + salt + "$" + await pbkdf2Hex(String(password), fromHex(salt));
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [kind, salt, key2] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || !salt || !/^[a-f0-9]{64}$/.test(key2 || "")) return false;
  return equal(await pbkdf2Hex(String(password), fromHex(salt)), key2);
}
__name(verifyPassword, "verifyPassword");
function createSigner(secret) {
  const hmac = /* @__PURE__ */ __name((s) => b64url(hmacBytes(secret, s)), "hmac");
  return {
    lookup: /* @__PURE__ */ __name((value) => hex(hmacBytes(secret, "lookup:" + value)), "lookup"),
    // body.signature — the extension reads exp (ms) from the base64url JSON body.
    sign(claims) {
      const body = b64url(JSON.stringify(claims));
      return body + "." + hmac(body);
    },
    verify(token) {
      const [body, sig] = String(token || "").split(".");
      if (!body || !sig || !equal(hmac(body), sig)) return null;
      try {
        return JSON.parse(dec.decode(fromB64url(body)));
      } catch {
        return null;
      }
    }
  };
}
__name(createSigner, "createSigner");
function createLimiter({ limit, windowMs }) {
  const hits = /* @__PURE__ */ new Map();
  return {
    blocked(key2, now = Date.now()) {
      const h = hits.get(key2);
      return !!h && now - h.start < windowMs && h.count >= limit;
    },
    fail(key2, now = Date.now()) {
      const h = hits.get(key2);
      if (!h || now - h.start >= windowMs) hits.set(key2, { start: now, count: 1 });
      else h.count++;
      if (hits.size > 5e3) hits.delete(hits.keys().next().value);
    },
    reset(key2) {
      hits.delete(key2);
    }
  };
}
__name(createLimiter, "createLimiter");

// ../sites/lib/marsad/legacy.js
var pbkdf2 = /* @__PURE__ */ __name((secret, salt) => pbkdf2Hex(String(secret), String(salt)), "pbkdf2");
function createLegacy({ deviceTokens = [] } = {}) {
  return {
    async verify(pin, stored) {
      const s = String(stored || "");
      if (s.startsWith("pbkdf2:")) {
        const [, iterations, salt, digest] = s.split(":");
        return iterations === "100000" && !!salt && !!digest && equal(await pbkdf2(pin, salt), digest);
      }
      if (/^[a-f0-9]{64}$/.test(s)) return deviceTokens.some((t) => equal(sha256(t + ":" + pin), s));
      return false;
    },
    async verifyAdmin(password, stored) {
      const s = String(stored || ""), i = s.lastIndexOf(":");
      if (i <= 0 || s.startsWith("pbkdf2$")) return false;
      const salt = s.slice(0, i), digest = s.slice(i + 1);
      return /^[a-f0-9]{64}$/.test(digest) && equal(await pbkdf2(password, salt), digest);
    }
  };
}
__name(createLegacy, "createLegacy");

// ../sites/lib/marsad/db.js
var SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','viewer')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,           -- 0 = master password
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  pin_hash TEXT,                         -- scrypt; NULL until a PIN is set
  pin_lookup TEXT,                       -- HMAC of PIN, keeps PINs unique
  legacy_pin_hash TEXT,                  -- imported from the old server, verified on first login
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_code ON employees(employee_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_pin ON employees(pin_lookup) WHERE deleted_at IS NULL AND pin_lookup IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  device TEXT NOT NULL,
  extension TEXT NOT NULL DEFAULT '',
  issued_at INTEGER NOT NULL,
  bound_at INTEGER,
  work_started_at INTEGER,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoke_reason TEXT,
  client_version TEXT
);
CREATE INDEX IF NOT EXISTS sessions_employee ON employee_sessions(employee_id, issued_at);
CREATE INDEX IF NOT EXISTS sessions_time ON employee_sessions(issued_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  extension TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  duration_seconds INTEGER,
  state TEXT,
  call_id TEXT,
  phone TEXT,
  queue TEXT,
  call_type TEXT,
  client_version TEXT,
  payload TEXT,
  extra TEXT, -- other top-level fields the extension sent (the old server kept the whole event body)
  UNIQUE (session_id, event_key)
);
CREATE INDEX IF NOT EXISTS events_time ON events(occurred_at);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS break_permissions (
  id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  extension TEXT NOT NULL,
  request_id TEXT,
  allowed_seconds INTEGER NOT NULL,
  grace_seconds INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS break_requests (
  id TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  extension TEXT NOT NULL,
  reason_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  request_kind TEXT NOT NULL,
  requested_minutes INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  permission_id TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS message_recipients (
  message_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  delivered_at INTEGER,
  acknowledged_at INTEGER,
  PRIMARY KEY (message_id, employee_id)
);

CREATE TABLE IF NOT EXISTS shift_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE,
  employee_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('include','exclude')),
  note TEXT NOT NULL,
  decided_at INTEGER NOT NULL,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS history_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  verified_total INTEGER NOT NULL,
  expected_count INTEGER,
  header TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_reports_date ON history_reports(date, imported_at);
CREATE TABLE IF NOT EXISTS history_calls (
  report_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  raw TEXT NOT NULL,
  PRIMARY KEY (report_id, idx)
);

CREATE TABLE IF NOT EXISTS live_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id TEXT UNIQUE NOT NULL,
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  changed INTEGER NOT NULL,
  rows TEXT NOT NULL,
  waiting INTEGER NOT NULL,
  active INTEGER NOT NULL,
  longest_wait INTEGER
);
CREATE INDEX IF NOT EXISTS live_time ON live_snapshots(observed_at);

CREATE TABLE IF NOT EXISTS collector_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  refresh_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  token_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  reference TEXT NOT NULL,
  employee_id INTEGER,
  title TEXT NOT NULL,
  owner TEXT,
  status TEXT NOT NULL,
  note TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  UNIQUE (date, reference)
);
CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  filters TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  employee_id INTEGER,
  details TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_time ON audit(occurred_at);
`;
var EXTRA_SCHEMA = `
CREATE TABLE IF NOT EXISTS telegram_config (id INTEGER PRIMARY KEY CHECK (id = 1), bot_token TEXT, bot_name TEXT, chat_id TEXT, chat_title TEXT, enabled INTEGER NOT NULL DEFAULT 0, rules TEXT, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS transfer_cache (day TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS apex_customer_notes (source TEXT NOT NULL, ref TEXT NOT NULL, day TEXT NOT NULL, phone_last4 TEXT, phone_hash TEXT, cust_no TEXT, note TEXT, checked_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'none', PRIMARY KEY(source,ref));
CREATE INDEX IF NOT EXISTS apex_customer_notes_day ON apex_customer_notes(day);
CREATE TABLE IF NOT EXISTS translations (src TEXT PRIMARY KEY, ar TEXT NOT NULL, how TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS talabat_closures (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, outlet TEXT NOT NULL, name TEXT, branch TEXT, state TEXT NOT NULL, reason TEXT, until_text TEXT, raw TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, alert_key TEXT);
CREATE INDEX IF NOT EXISTS talabat_closures_day ON talabat_closures(day);
CREATE TABLE IF NOT EXISTS telegram_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, employee_id INTEGER, text TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER, tries INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS telegram_log_time ON telegram_log(created_at);
CREATE INDEX IF NOT EXISTS events_employee_time ON events(employee_id, occurred_at);
CREATE TABLE IF NOT EXISTS call_assignments (call_key TEXT PRIMARY KEY, employee_id INTEGER NOT NULL, decided_at INTEGER NOT NULL, decided_by TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS orders_days (day TEXT PRIMARY KEY, data TEXT NOT NULL, received_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS site_orders (id INTEGER PRIMARY KEY, day TEXT NOT NULL, status TEXT, fulfillment TEXT, total REAL, created_at INTEGER NOT NULL, modified_at INTEGER, notes_at INTEGER, received_at INTEGER, transfer_at INTEGER, branch TEXT, out_at INTEGER, driver TEXT, delivered_at INTEGER, scheduled INTEGER NOT NULL DEFAULT 0, transfers INTEGER);
CREATE INDEX IF NOT EXISTS site_orders_day ON site_orders(day);
CREATE INDEX IF NOT EXISTS site_orders_created ON site_orders(created_at);
CREATE TABLE IF NOT EXISTS talabat_orders (id TEXT PRIMARY KEY, day TEXT NOT NULL, vendor_id TEXT, store TEXT, status TEXT, billable TEXT, placed_at INTEGER, total REAL, received_at INTEGER, accept_seconds INTEGER, accepted_at INTEGER, picked_up_at INTEGER, delivered_at INTEGER, cancelled_at INTEGER, cancel_owner TEXT, cancel_reason TEXT, items TEXT, subtotal REAL, delivery_type TEXT, code TEXT, milestones TEXT, detail_at INTEGER, first_seen INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS talabat_orders_day ON talabat_orders(day);
CREATE TABLE IF NOT EXISTS order_ingest (source TEXT NOT NULL, ref TEXT NOT NULL, observed_at INTEGER, detail_attempts INTEGER NOT NULL DEFAULT 0, detail_retry_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY(source, ref));
CREATE TABLE IF NOT EXISTS match_profiles (source TEXT NOT NULL, ref TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(source, ref));
CREATE TABLE IF NOT EXISTS site_links (site_id INTEGER PRIMARY KEY, day TEXT NOT NULL, apex_no TEXT, set_by TEXT, set_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS talabat_links (talabat_id TEXT PRIMARY KEY, day TEXT NOT NULL, apex_no TEXT, set_by TEXT, set_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS learning_evidence (source TEXT NOT NULL, ref TEXT NOT NULL, facts TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(source, ref));
CREATE TABLE IF NOT EXISTS learned (kind TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, ref TEXT NOT NULL, value REAL, at INTEGER NOT NULL, PRIMARY KEY (kind, a, b, ref));
CREATE TABLE IF NOT EXISTS exception_reviews (key TEXT PRIMARY KEY, source TEXT, ref TEXT, day TEXT NOT NULL, verdict TEXT NOT NULL, reason TEXT, note TEXT, signature TEXT, by_name TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS exception_reviews_day ON exception_reviews(day);
CREATE TABLE IF NOT EXISTS cancel_owners (key TEXT PRIMARY KEY, day TEXT NOT NULL, source TEXT, ref TEXT, owner TEXT NOT NULL, name TEXT, reason_key TEXT, by_name TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cancel_owners_day ON cancel_owners(day);
CREATE TABLE IF NOT EXISTS wa_identity (talabat_id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL, verified_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wa_claims (message_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, token TEXT NOT NULL, claimed_at INTEGER NOT NULL, state TEXT NOT NULL, protocol INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wa_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, talabat_id TEXT UNIQUE NOT NULL, day TEXT NOT NULL, phone TEXT, created_at INTEGER NOT NULL, welcome_at INTEGER, survey_at INTEGER, tries INTEGER NOT NULL DEFAULT 0, error TEXT, sending_at INTEGER);
CREATE INDEX IF NOT EXISTS wa_messages_day ON wa_messages(day);
CREATE TABLE IF NOT EXISTS apex_names (apex_name TEXT PRIMARY KEY, employee_id INTEGER NOT NULL, set_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS transfer_jobs (source TEXT NOT NULL, ref TEXT NOT NULL, day TEXT NOT NULL, state TEXT NOT NULL, employee_id INTEGER, employee_name TEXT, payment TEXT, note TEXT, at INTEGER NOT NULL, PRIMARY KEY(source, ref));
CREATE INDEX IF NOT EXISTS transfer_jobs_day ON transfer_jobs(day);
`;
var statements = /* @__PURE__ */ __name((sql) => sql.replace(/--[^\n]*/g, "").split(";").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean), "statements");
var SCHEMA_STATEMENTS = [...statements(SCHEMA), ...statements(EXTRA_SCHEMA)];
var EXPECTED_SCHEMA = SCHEMA_STATEMENTS.map((sql) => {
  const m = /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+([\w]+)/i.exec(sql);
  return m ? { type: m[1].toLowerCase(), name: m[2].toLowerCase() } : null;
}).filter(Boolean);
var REQUIRED_ADDED_COLUMNS = {
  events: ["extra"],
  telegram_log: ["reply_to", "message_id", "target", "branch"],
  transfer_jobs: ["payload", "result"],
  talabat_orders: ["code", "milestones"],
  site_orders: ["transfers", "total"],
  wa_messages: ["sending_at"],
  telegram_config: ["branch_chat_id", "branch_chat_title"]
};
async function schemaReady(db) {
  try {
    const rows = await db.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index')").all();
    const found = new Map(rows.map((r) => [String(r.type).toLowerCase() + ":" + String(r.name).toLowerCase(), String(r.sql || "")]));
    if (!EXPECTED_SCHEMA.every((e) => found.has(e.type + ":" + e.name))) return false;
    for (const [table3, cols] of Object.entries(REQUIRED_ADDED_COLUMNS)) {
      const ddl = found.get("table:" + table3) || "";
      if (!cols.every((col) => new RegExp("\\b" + col + "\\b", "i").test(ddl))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
__name(schemaReady, "schemaReady");
var norm = /* @__PURE__ */ __name((p) => p.map((v) => v === void 0 ? null : typeof v === "boolean" ? v ? 1 : 0 : v), "norm");
async function migrate(db) {
  await db.batch(SCHEMA_STATEMENTS.map((s) => db.prepare(s).bind()));
  try {
    await db.prepare("SELECT extra FROM events LIMIT 0").all();
  } catch {
    await db.prepare("ALTER TABLE events ADD COLUMN extra TEXT").run();
  }
  try {
    await db.prepare("SELECT reply_to, message_id FROM telegram_log LIMIT 0").all();
  } catch {
    for (const c of ["reply_to TEXT", "message_id INTEGER"]) {
      try {
        await db.prepare("ALTER TABLE telegram_log ADD COLUMN " + c).run();
      } catch {
      }
    }
  }
  try {
    await db.prepare("SELECT payload, result FROM transfer_jobs LIMIT 0").all();
  } catch {
    for (const c of ["payload TEXT", "result TEXT"]) {
      try {
        await db.prepare("ALTER TABLE transfer_jobs ADD COLUMN " + c).run();
      } catch {
      }
    }
  }
  try {
    await db.prepare("SELECT code, milestones FROM talabat_orders LIMIT 0").all();
  } catch {
    for (const c of ["code TEXT", "milestones TEXT"]) {
      try {
        await db.prepare("ALTER TABLE talabat_orders ADD COLUMN " + c).run();
      } catch {
      }
    }
  }
  try {
    await db.prepare("SELECT transfers FROM site_orders LIMIT 0").all();
  } catch {
    try {
      await db.prepare("ALTER TABLE site_orders ADD COLUMN transfers INTEGER").run();
    } catch {
    }
  }
  try {
    await db.prepare("SELECT total FROM site_orders LIMIT 0").all();
  } catch {
    try {
      await db.prepare("ALTER TABLE site_orders ADD COLUMN total REAL").run();
    } catch {
    }
  }
  try {
    await db.prepare("SELECT target FROM telegram_log LIMIT 0").all();
  } catch {
    try {
      await db.prepare("ALTER TABLE telegram_log ADD COLUMN target TEXT").run();
    } catch {
    }
  }
  try {
    await db.prepare("SELECT sending_at FROM wa_messages LIMIT 0").all();
  } catch {
    try {
      await db.prepare("ALTER TABLE wa_messages ADD COLUMN sending_at INTEGER").run();
    } catch {
    }
  }
  try {
    await db.prepare("SELECT branch FROM telegram_log LIMIT 0").all();
  } catch {
    try {
      await db.prepare("ALTER TABLE telegram_log ADD COLUMN branch TEXT").run();
    } catch {
    }
  }
  try {
    await db.prepare("SELECT branch_chat_id, branch_chat_title FROM telegram_config LIMIT 0").all();
  } catch {
    for (const c of ["branch_chat_id TEXT", "branch_chat_title TEXT"]) {
      try {
        await db.prepare("ALTER TABLE telegram_config ADD COLUMN " + c).run();
      } catch {
      }
    }
  }
}
__name(migrate, "migrate");
function d1Adapter(d1) {
  const st = /* @__PURE__ */ __name((sql, p) => d1.prepare(sql).bind(...norm(p)), "st");
  return {
    kind: "d1",
    prepare: /* @__PURE__ */ __name((sql) => ({
      all: /* @__PURE__ */ __name(async (...p) => (await st(sql, p).all()).results, "all"),
      get: /* @__PURE__ */ __name(async (...p) => await st(sql, p).first() ?? void 0, "get"),
      run: /* @__PURE__ */ __name(async (...p) => {
        const r = await st(sql, p).run();
        return { changes: r.meta?.changes ?? 0, lastInsertRowid: Number(r.meta?.last_row_id ?? 0) };
      }, "run"),
      bind: /* @__PURE__ */ __name((...p) => ({ sql, params: norm(p) }), "bind")
    }), "prepare"),
    batch: /* @__PURE__ */ __name(async (list) => list.length ? (await d1.batch(list.map((b) => st(b.sql, b.params)))).map((r) => ({ rows: r.results, changes: r.meta?.changes ?? 0, lastInsertRowid: Number(r.meta?.last_row_id ?? 0) })) : [], "batch")
  };
}
__name(d1Adapter, "d1Adapter");

// ../sites/lib/marsad/app.js
var BUILD = "2026-11-07.1";
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
};
var fail = /* @__PURE__ */ __name((status, code, extra) => {
  throw new HttpError(status, code, extra);
}, "fail");
var ALLOWED_HEADERS = "content-type, x-admin-password, x-device-token, x-employee-session, x-history-token, x-compressed";
var DEFAULT_DEVICE_TOKEN = "7000865f1220458f86506b41a97cab7d";
async function readBody(request, limit) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > limit) fail(413, "payload_too_large");
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      reader.cancel().catch(() => {
      });
      fail(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
__name(readBody, "readBody");
function createApp({ db, config: input = {}, now = /* @__PURE__ */ __name(() => Date.now(), "now") }) {
  const routes = /* @__PURE__ */ new Map(), afterRequest = [];
  const config2 = {
    allowedOrigins: ["https://karim87nu-create.github.io"],
    ...input,
    deviceTokens: input.deviceTokens?.length ? input.deviceTokens : [DEFAULT_DEVICE_TOKEN]
  };
  const app2 = {
    db,
    config: config2,
    now,
    legacy: createLegacy({ deviceTokens: config2.deviceTokens }),
    limiters: {
      employeeLogin: createLimiter({ limit: 10, windowMs: 15 * 6e4 }),
      adminLogin: createLimiter({ limit: 10, windowMs: 15 * 6e4 })
    },
    route(method, path, handler, options = {}) {
      routes.set(method + " " + path, { handler, options });
    },
    afterRequest(fn) {
      afterRequest.push(fn);
    },
    audit(action, employeeId, details) {
      return db.prepare("INSERT INTO audit (occurred_at, action, employee_id, details) VALUES (?,?,?,?)").run(now(), action, employeeId ?? null, JSON.stringify(details || {}));
    },
    heavy: /* @__PURE__ */ __name((fn, ...args) => app2[fn](...args), "heavy"),
    HttpError,
    fail
  };
  const recentErrors = [], startedAt = (/* @__PURE__ */ new Date()).toISOString();
  let ready = null, initialized = false;
  app2.init = () => {
    if (initialized) return Promise.resolve();
    if (db.kind !== "d1" && ready) return ready;
    const run = (async () => {
      if (db.kind !== "d1" || !await schemaReady(db)) await migrate(db);
      if (!config2.secret) {
        await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('secret', ?)").run(randomToken(32) + randomToken(32));
        config2.secret = (await db.prepare("SELECT value FROM settings WHERE key = 'secret'").get()).value;
      }
      if (!config2.adminPasswordHash && config2.adminPassword) config2.adminPasswordHash = await hashPassword(config2.adminPassword);
      app2.signer = createSigner(config2.secret);
      initialized = true;
    })().finally(() => {
      if (ready === run) ready = null;
    });
    if (db.kind !== "d1") ready = run;
    return run;
  };
  app2.fetch = /* @__PURE__ */ __name(async function handle(request, { ip = "", waitUntil = /* @__PURE__ */ __name((p) => p.catch(() => {
  }), "waitUntil") } = {}) {
    const origin = request.headers.get("origin");
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (origin && config2.allowedOrigins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers.vary = "Origin";
      headers["access-control-allow-headers"] = ALLOWED_HEADERS;
      headers["access-control-allow-methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      headers["access-control-max-age"] = "600";
    }
    const send2 = /* @__PURE__ */ __name((status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } }), "send");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return send2(400, { error: "bad_url" });
    }
    if (url.pathname === "/health" || url.pathname === "/api/health") return send2(200, { ok: true, build: BUILD });
    if (url.pathname === "/api/health/errors") return send2(200, { build: BUILD, since: startedAt, errors: recentErrors });
    const route = routes.get(request.method + " " + url.pathname);
    if (!route) return send2(404, { error: "not_found" });
    let response;
    try {
      await app2.init();
      const raw = request.method === "GET" || route.options.stream ? new Uint8Array(0) : await readBody(request, route.options.limit || 256 * 1024);
      const type = String(request.headers.get("content-type") || "");
      let body = {};
      if (route.options.raw) body = raw;
      else if (raw.length) {
        const text = new TextDecoder().decode(raw);
        if (!/json/i.test(type) && !/^\s*[{[]/.test(text.slice(0, 8))) fail(415, "json_required");
        try {
          body = JSON.parse(text);
        } catch {
          fail(400, "invalid_json");
        }
        if (!body || typeof body !== "object") fail(400, "invalid_json");
      }
      const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || ip;
      const ctx = {
        request,
        url,
        body,
        raw,
        type,
        query: Object.fromEntries(url.searchParams),
        header: /* @__PURE__ */ __name((name) => String(request.headers.get(name) || ""), "header"),
        ip: String(forwarded || "").split(",")[0].trim(),
        now: now(),
        waitUntil
      };
      const out = await route.handler(ctx, app2);
      response = send2(out && out.__status ? out.__status : 200, out && out.__status ? out.body : out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) response = send2(e.status, { error: e.code, ...e.extra || {} });
      else {
        console.error((/* @__PURE__ */ new Date()).toISOString(), request.method, url.pathname, e);
        recentErrors.unshift({ at: new Date(now()).toISOString(), path: request.method + " " + url.pathname, error: String(e?.message || e).replace(/\s+/g, " ").slice(0, 200) });
        recentErrors.length = Math.min(recentErrors.length, 30);
        response = send2(500, { error: "server_error" });
      }
    }
    for (const fn of afterRequest) {
      try {
        const p = fn(now(), request.method, url.pathname);
        if (p) waitUntil(Promise.resolve(p));
      } catch {
      }
    }
    return response;
  }, "handle");
  return app2;
}
__name(createApp, "createApp");

// ../sites/lib/marsad/admin.js
var admin_exports = {};
__export(admin_exports, {
  MASTER: () => MASTER,
  setup: () => setup
});
var ROLES = ["admin", "supervisor", "viewer"];
var SESSION_MS = 12 * 36e5;
var MASTER = { id: 0, name: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629", role: "admin" };
function setup(app2) {
  const { db, fail: fail2 } = app2;
  const rawCache = /* @__PURE__ */ new Map();
  async function masterHash() {
    if (!app2.config.adminPasswordHash) app2.config.adminPasswordHash = (await db.prepare("SELECT value FROM settings WHERE key = 'admin_hash'").get())?.value || null;
    return app2.config.adminPasswordHash;
  }
  __name(masterHash, "masterHash");
  async function identityForPassword(password) {
    if (!password) return null;
    const master = await masterHash();
    if (master && await verifyPassword(password, master)) return MASTER;
    for (const a of await db.prepare("SELECT * FROM admin_accounts WHERE deleted_at IS NULL AND active = 1").all()) {
      if (await verifyPassword(password, a.password_hash)) return { id: a.id, name: a.name, role: a.role };
      if (await app2.legacy.verifyAdmin(password, a.password_hash)) {
        await db.prepare("UPDATE admin_accounts SET password_hash = ? WHERE id = ?").run(await hashPassword(password), a.id);
        return { id: a.id, name: a.name, role: a.role };
      }
    }
    return null;
  }
  __name(identityForPassword, "identityForPassword");
  async function accountIdentity(id2) {
    if (id2 === 0) return MASTER;
    const a = await db.prepare("SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL AND active = 1").get(id2);
    return a ? { id: a.id, name: a.name, role: a.role } : null;
  }
  __name(accountIdentity, "accountIdentity");
  async function resolve(ctx) {
    const value = ctx.header("x-admin-password");
    if (!value) return null;
    if (/^[a-f0-9]{64}$/.test(value)) {
      const s = await db.prepare("SELECT * FROM admin_sessions WHERE token_hash = ?").get(sha256(value));
      if (s && !s.revoked_at && s.expires_at > ctx.now) return accountIdentity(s.account_id);
    }
    const key2 = sha256("raw:" + value), hit = rawCache.get(key2);
    if (hit && hit.until > ctx.now) return accountIdentity(hit.identity.id);
    if (app2.limiters.adminLogin.blocked(ctx.ip, ctx.now)) fail2(429, "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629\u061B \u0627\u0646\u062A\u0638\u0631 15 \u062F\u0642\u064A\u0642\u0629");
    const identity = await identityForPassword(value);
    if (!identity) {
      app2.limiters.adminLogin.fail(ctx.ip, ctx.now);
      return null;
    }
    rawCache.set(key2, { identity, until: ctx.now + 3e5 });
    if (rawCache.size > 100) rawCache.delete(rawCache.keys().next().value);
    return identity;
  }
  __name(resolve, "resolve");
  app2.requireAdmin = async (ctx, level = "read") => {
    const who = await resolve(ctx);
    if (!who) fail2(401, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 \u0623\u0648 \u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u062F\u062E\u0648\u0644");
    if (level === "admin" && who.role !== "admin") fail2(403, "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062F\u064A\u0631 \u0641\u0642\u0637");
    if (level === "write" && !["admin", "supervisor"].includes(who.role)) fail2(403, "\u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0644\u0644\u0639\u0631\u0636 \u0641\u0642\u0637");
    return who;
  };
  app2.adminFromHeader = resolve;
  async function passwordTaken(password, exceptId) {
    const master = await masterHash();
    if (master && await verifyPassword(password, master)) return true;
    for (const a of await db.prepare("SELECT * FROM admin_accounts WHERE deleted_at IS NULL").all())
      if (a.id !== exceptId && (await verifyPassword(password, a.password_hash) || await app2.legacy.verifyAdmin(password, a.password_hash))) return true;
    return false;
  }
  __name(passwordTaken, "passwordTaken");
  async function checkNewPassword(password, confirmation, exceptId) {
    if (typeof password !== "string" || password.length < 6 || password.length > 200) fail2(400, "\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0644\u0627\u0632\u0645 \u064A\u0643\u0648\u0646 6 \u062D\u0631\u0648\u0641 \u0623\u0648 \u0623\u0643\u062B\u0631");
    if (password !== confirmation) fail2(400, "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642");
    if (await passwordTaken(password, exceptId)) fail2(409, "\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0645\u0633\u062A\u062E\u062F\u0645 \u0644\u062D\u0633\u0627\u0628 \u0622\u062E\u0631\u061B \u0627\u062E\u062A\u0627\u0631 \u0628\u0627\u0633\u0648\u0631\u062F \u0645\u062E\u062A\u0644\u0641");
  }
  __name(checkNewPassword, "checkNewPassword");
  const accounts = /* @__PURE__ */ __name(async () => (await db.prepare("SELECT id, name, role, active FROM admin_accounts WHERE deleted_at IS NULL ORDER BY id").all()).map((a) => ({ ...a, active: !!a.active })), "accounts");
  app2.route("GET", "/api/admin-access", async (ctx) => {
    const who = await app2.requireAdmin(ctx);
    return { identity: who, ...who.role === "admin" ? { accounts: await accounts() } : {} };
  });
  app2.route("GET", "/api/admin-access/setup", async () => ({ needed: !await masterHash() }));
  app2.route("POST", "/api/admin-access", async (ctx) => {
    const b = ctx.body;
    if (b.action === "setup") {
      if (await masterHash()) fail2(409, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0645\u062A\u062D\u062F\u062F\u0629 \u0628\u0627\u0644\u0641\u0639\u0644");
      if ((await db.prepare("SELECT COUNT(*) n FROM employees").get()).n || (await db.prepare("SELECT COUNT(*) n FROM admin_accounts").get()).n)
        fail2(409, "\u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0641\u064A\u0647 \u0628\u064A\u0627\u0646\u0627\u062A\u061B \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0644\u0627\u0632\u0645 \u062A\u062A\u062D\u062F\u062F \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0641\u0631 (MARSAD_ADMIN_PASSWORD)");
      if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 200) fail2(400, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0627\u0632\u0645 \u062A\u0643\u0648\u0646 8 \u062D\u0631\u0648\u0641 \u0623\u0648 \u0623\u0643\u062B\u0631");
      if (b.password !== b.confirmation) fail2(400, "\u062A\u0623\u0643\u064A\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642");
      for (const a of await db.prepare("SELECT * FROM admin_accounts WHERE deleted_at IS NULL").all())
        if (await verifyPassword(b.password, a.password_hash) || await app2.legacy.verifyAdmin(b.password, a.password_hash)) fail2(409, "\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0645\u0633\u062A\u062E\u062F\u0645 \u0644\u062D\u0633\u0627\u0628 \u0622\u062E\u0631\u061B \u0627\u062E\u062A\u0627\u0631 \u0628\u0627\u0633\u0648\u0631\u062F \u0645\u062E\u062A\u0644\u0641");
      const r2 = await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_hash', ?)").run(await hashPassword(b.password));
      if (!r2.changes) fail2(409, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0645\u062A\u062D\u062F\u062F\u0629 \u0628\u0627\u0644\u0641\u0639\u0644");
      app2.config.adminPasswordHash = null;
      await app2.audit("master_password_set", null, { actor: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629" });
      const token = randomToken();
      await db.prepare("INSERT INTO admin_sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)").run(sha256(token), 0, ctx.now, ctx.now + SESSION_MS);
      return { token, identity: MASTER };
    }
    if (b.action === "login") {
      if (app2.limiters.adminLogin.blocked(ctx.ip, ctx.now)) fail2(429, "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629\u061B \u0627\u0646\u062A\u0638\u0631 15 \u062F\u0642\u064A\u0642\u0629");
      const who2 = typeof b.password === "string" ? await identityForPassword(b.password) : null;
      if (!who2) {
        app2.limiters.adminLogin.fail(ctx.ip, ctx.now);
        fail2(401, "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      }
      app2.limiters.adminLogin.reset(ctx.ip);
      const token = randomToken();
      await db.prepare("INSERT INTO admin_sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)").run(sha256(token), who2.id, ctx.now, ctx.now + SESSION_MS);
      return { token, identity: who2 };
    }
    if (b.action === "logout") {
      const value = ctx.header("x-admin-password");
      if (/^[a-f0-9]{64}$/.test(value)) await db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").run(ctx.now, sha256(value));
      return { ok: true };
    }
    const who = await app2.requireAdmin(ctx, "admin");
    const name = String(b.name || "").trim();
    if (!name || name.length > 100) fail2(400, "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645");
    if (!ROLES.includes(b.role)) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u062F\u0648\u0631\u064B\u0627 \u0635\u062D\u064A\u062D\u064B\u0627");
    await checkNewPassword(b.password, b.confirmation);
    const r = await db.prepare("INSERT INTO admin_accounts (name, role, password_hash, created_at) VALUES (?,?,?,?)").run(name, b.role, await hashPassword(b.password), ctx.now);
    await app2.audit("admin_account_created", null, { actor: who.name, accountId: r.lastInsertRowid, name, role: b.role });
    return { ok: true, id: r.lastInsertRowid };
  });
  app2.route("PATCH", "/api/admin-access", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const b = ctx.body, a = await db.prepare("SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL").get(Number(b.id));
    if (!a) fail2(404, "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const changes = {};
    if (b.role !== void 0) {
      if (!ROLES.includes(b.role)) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u062F\u0648\u0631\u064B\u0627 \u0635\u062D\u064A\u062D\u064B\u0627");
      changes.role = b.role;
    }
    if (b.active !== void 0) {
      if (!b.active && a.id === who.id) fail2(400, "\u0645\u064A\u0646\u0641\u0639\u0634 \u062A\u0648\u0642\u0641 \u062D\u0633\u0627\u0628\u0643 \u0627\u0646\u062A");
      changes.active = b.active ? 1 : 0;
    }
    if (b.password) {
      await checkNewPassword(b.password, b.confirmation, a.id);
      changes.password_hash = await hashPassword(b.password);
    }
    if (!Object.keys(changes).length) fail2(400, "\u0644\u0627 \u064A\u0648\u062C\u062F \u062A\u063A\u064A\u064A\u0631");
    const keys = Object.keys(changes);
    await db.batch([
      db.prepare("UPDATE admin_accounts SET " + keys.map((k) => k + " = ?").join(", ") + " WHERE id = ?").bind(...keys.map((k) => changes[k]), a.id),
      db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(ctx.now, a.id)
    ]);
    await app2.audit("admin_account_changed", null, { actor: who.name, accountId: a.id, role: changes.role, active: b.active, passwordChanged: !!b.password });
    return { ok: true };
  });
  app2.route("DELETE", "/api/admin-access", async (ctx) => {
    await app2.requireAdmin(ctx, "admin");
    fail2(409, "\u0627\u0644\u062D\u0630\u0641 \u0645\u062A\u0648\u0642\u0641 \u0639\u0634\u0627\u0646 \u0645\u0641\u064A\u0634 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0636\u064A\u0639\u061B \u0627\u0633\u062A\u062E\u062F\u0645 \xAB\u0625\u064A\u0642\u0627\u0641\xBB \u0628\u062F\u0644\u0647\u0627");
  });
}
__name(setup, "setup");

// ../sites/lib/marsad/employees.js
var employees_exports = {};
__export(employees_exports, {
  setup: () => setup2
});
function setup2(app2) {
  const { db, fail: fail2 } = app2;
  const pinLookup = /* @__PURE__ */ __name((pin) => app2.signer.lookup("pin:" + pin), "pinLookup");
  const shape = /* @__PURE__ */ __name((e) => ({ id: e.id, name: e.name, employeeCode: e.employee_code, active: !!e.active && !e.deleted_at, hasPassword: !!(e.pin_hash || e.legacy_pin_hash) }), "shape");
  const legacyRows = /* @__PURE__ */ __name(() => db.prepare("SELECT * FROM employees WHERE legacy_pin_hash IS NOT NULL AND deleted_at IS NULL").all(), "legacyRows");
  async function checkPin(pin, confirmation, exceptId) {
    if (typeof pin !== "string" || !/^\d{1,32}$/.test(pin)) fail2(400, "\u0627\u0643\u062A\u0628 \u0628\u0627\u0633\u0648\u0631\u062F \u0623\u0631\u0642\u0627\u0645\u061B \u0628\u062F\u0648\u0646 \u0637\u0648\u0644 \u0645\u062D\u062F\u062F");
    if (pin !== confirmation) fail2(400, "password_confirmation_mismatch");
    const other = await db.prepare("SELECT id FROM employees WHERE pin_lookup = ? AND deleted_at IS NULL").get(pinLookup(pin));
    if (other && other.id !== exceptId) fail2(409, "password_in_use");
    for (const e of await legacyRows())
      if (e.id !== exceptId && await app2.legacy.verify(pin, e.legacy_pin_hash)) fail2(409, "password_in_use");
  }
  __name(checkPin, "checkPin");
  const revokeSessions = /* @__PURE__ */ __name((employeeId, reason, now) => db.prepare("UPDATE employee_sessions SET revoked_at = ?, revoke_reason = ? WHERE employee_id = ? AND revoked_at IS NULL").bind(now, reason, employeeId), "revokeSessions");
  app2.employeeByPin = /* @__PURE__ */ __name(async function employeeByPin(pin) {
    const e = await db.prepare("SELECT * FROM employees WHERE pin_lookup = ? AND deleted_at IS NULL").get(pinLookup(pin));
    if (e) return await verifyPassword(pin, e.pin_hash) ? e : null;
    const matches = [];
    for (const x of await legacyRows()) if (await app2.legacy.verify(pin, x.legacy_pin_hash)) matches.push(x);
    if (matches.length > 1) fail2(409, "password_not_unique");
    if (!matches.length) return null;
    await db.prepare("UPDATE employees SET pin_hash = ?, pin_lookup = ?, legacy_pin_hash = NULL WHERE id = ?").run(await hashPassword(pin), pinLookup(pin), matches[0].id);
    return db.prepare("SELECT * FROM employees WHERE id = ?").get(matches[0].id);
  }, "employeeByPin");
  app2.route("GET", "/api/employees", async (ctx) => {
    await app2.requireAdmin(ctx);
    const rows = await db.prepare("SELECT * FROM employees ORDER BY name COLLATE NOCASE").all();
    return {
      employees: rows.filter((e) => !e.deleted_at).map(shape),
      archivedEmployees: rows.filter((e) => e.deleted_at).map((e) => ({ ...shape(e), active: false, historyOnly: true }))
    };
  });
  app2.route("GET", "/api/employees/list", async () => ({
    employees: await db.prepare("SELECT id FROM employees WHERE active = 1 AND deleted_at IS NULL").all()
  }));
  app2.route("POST", "/api/employees", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const name = String(ctx.body.name || "").trim(), code = String(ctx.body.employeeCode || "").trim();
    if (!name || !code || name.length > 100 || code.length > 40) fail2(400, "\u0627\u0643\u062A\u0628 \u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u0643\u0648\u062F \u0648\u0628\u0627\u0633\u0648\u0631\u062F \u0623\u0631\u0642\u0627\u0645\u061B \u0628\u062F\u0648\u0646 \u0637\u0648\u0644 \u0645\u062D\u062F\u062F");
    if (await db.prepare("SELECT 1 FROM employees WHERE employee_code = ? AND deleted_at IS NULL").get(code)) fail2(409, "employee_code_exists");
    await checkPin(ctx.body.pin, ctx.body.pinConfirmation);
    let r;
    try {
      r = await db.prepare("INSERT INTO employees (name, employee_code, pin_hash, pin_lookup, created_at) VALUES (?,?,?,?,?)").run(name, code, await hashPassword(ctx.body.pin), pinLookup(ctx.body.pin), ctx.now);
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) fail2(409, "employee_code_exists");
      throw e;
    }
    await app2.audit("employee_created", r.lastInsertRowid, { actor: who.name, name, employeeCode: code });
    return { ok: true, id: r.lastInsertRowid };
  });
  app2.route("PATCH", "/api/employees", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const e = await db.prepare("SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL").get(Number(ctx.body.id));
    if (!e) fail2(404, "\u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const b = ctx.body, writes = [];
    if (b.pin !== void 0) {
      await checkPin(b.pin, b.pinConfirmation, e.id);
      writes.push(
        db.prepare("UPDATE employees SET pin_hash = ?, pin_lookup = ?, legacy_pin_hash = NULL WHERE id = ?").bind(await hashPassword(b.pin), pinLookup(b.pin), e.id),
        revokeSessions(e.id, "password_changed", ctx.now)
      );
    }
    if (b.active !== void 0) {
      writes.push(db.prepare("UPDATE employees SET active = ? WHERE id = ?").bind(b.active ? 1 : 0, e.id));
      if (!b.active) writes.push(revokeSessions(e.id, "employee_disabled", ctx.now));
    }
    await db.batch(writes);
    await app2.audit("employee_changed", e.id, { actor: who.name, name: e.name, employeeCode: e.employee_code, active: b.active, passwordChanged: b.pin !== void 0 });
    return { ok: true };
  });
  app2.route("DELETE", "/api/employees", async (ctx) => {
    await app2.requireAdmin(ctx, "admin");
    fail2(409, "\u0627\u0644\u062D\u0630\u0641 \u0645\u062A\u0648\u0642\u0641 \u0639\u0634\u0627\u0646 \u0645\u0641\u064A\u0634 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0636\u064A\u0639\u061B \u0627\u0633\u062A\u062E\u062F\u0645 \xAB\u0625\u064A\u0642\u0627\u0641\xBB \u0628\u062F\u0644\u0647\u0627");
  });
}
__name(setup2, "setup");

// ../sites/lib/marsad/sessions.js
var sessions_exports = {};
__export(sessions_exports, {
  SESSION_MS: () => SESSION_MS2,
  setup: () => setup3
});

// ../sites/lib/marsad/time.js
var ZONE = "Africa/Cairo";
var partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});
var RULES = {
  businessStartHour: 9,
  // data day starts 09:00
  operatingEndHour: 2,
  // operating hours end 02:00 next day (Karim: the restaurant works 9 ص → 2 الفجر)
  slaSeconds: 10,
  shortAbandonSeconds: 7,
  callAlertSeconds: 240,
  breakPeriodSeconds: 900,
  breakBudgetSeconds: 1800,
  breakGraceSeconds: 300,
  presenceStaleMs: 9e4
};
function cairoParts(ms) {
  const p = {};
  for (const x of partsFormat.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return p;
}
__name(cairoParts, "cairoParts");
function cairoToUtc(y, m, d, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const p = cairoParts(utc);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    utc += guess - wall;
  }
  return utc;
}
__name(cairoToUtc, "cairoToUtc");
var pad = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad");
var isoDate = /* @__PURE__ */ __name((y, m, d) => y + "-" + pad(m) + "-" + pad(d), "isoDate");
var parseDate = /* @__PURE__ */ __name((date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}, "parseDate");
var addDays = /* @__PURE__ */ __name((date, n) => {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}, "addDays");
function businessDay(ms) {
  const p = cairoParts(ms);
  const date = isoDate(p.year, p.month, p.day);
  return p.hour < RULES.businessStartHour ? addDays(date, -1) : date;
}
__name(businessDay, "businessDay");
function dayWindow(date) {
  const [y, m, d] = parseDate(date);
  const next = parseDate(addDays(date, 1));
  return {
    date,
    start: cairoToUtc(y, m, d, RULES.businessStartHour),
    end: cairoToUtc(next[0], next[1], next[2], RULES.businessStartHour),
    operatingEnd: cairoToUtc(next[0], next[1], next[2], RULES.operatingEndHour)
  };
}
__name(dayWindow, "dayWindow");
function isOperating(ms) {
  const w = dayWindow(businessDay(ms));
  return ms >= w.start && ms < w.operatingEnd;
}
__name(isOperating, "isOperating");
var validDate = /* @__PURE__ */ __name((date) => {
  const p = parseDate(date);
  if (!p) return false;
  const back = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toISOString().slice(0, 10);
  return back === date;
}, "validDate");
var iso = /* @__PURE__ */ __name((ms) => ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString(), "iso");

// ../sites/lib/marsad/sessions.js
var SESSION_MS2 = 18 * 36e5;
var CLOSE_GRACE_MS = 5e3;
var CLIENT_REASONS = ["arabicss_logout", "arabicss_login_page", "extension_logout", "extension_changed", "extension_restarted", "tab_closed", "browser_restarted"];
var CLIENT_CLOSE = /* @__PURE__ */ new Set([...CLIENT_REASONS, "explicit_logout", "session_logout", "session_rejected"]);
var EVENT_TYPE = /^[a-z_]{2,40}$/;
var DIGITS = /^\d{1,10}$/;
var COLUMNS = /* @__PURE__ */ new Set(["eventType", "eventKey", "extension", "occurredAt", "durationSeconds", "state", "callId", "phone", "queue", "callType", "clientVersion", "payload", "_sessionToken", "sessionToken"]);
function setup3(app2) {
  const { db, fail: fail2 } = app2;
  const checkDevice = /* @__PURE__ */ __name((ctx) => {
    const token = ctx.header("x-device-token");
    if (!token || !app2.config.deviceTokens.includes(token)) fail2(403, "invalid_device");
    return token;
  }, "checkDevice");
  app2.requireSession = async (ctx, { allowRevoked = false } = {}) => {
    const device = checkDevice(ctx);
    const claims = app2.signer.verify(ctx.header("x-employee-session"));
    if (!claims || !Number.isInteger(claims.sid)) fail2(401, "invalid_employee_session");
    const s = await db.prepare("SELECT * FROM employee_sessions WHERE id = ?").get(claims.sid);
    if (!s || s.employee_id !== claims.eid) fail2(401, "invalid_employee_session");
    const e = await db.prepare("SELECT * FROM employees WHERE id = ?").get(s.employee_id);
    if (!e || e.deleted_at || !e.active) fail2(403, "employee_inactive");
    const closed = !!s.revoked_at || s.expires_at <= ctx.now;
    if (closed && !allowRevoked) fail2(401, "invalid_employee_session");
    return { session: s, employee: e, device, closed };
  };
  const closeStatement = /* @__PURE__ */ __name((id2, reason, now) => db.prepare("UPDATE employee_sessions SET revoked_at = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL").bind(now, String(reason || "explicit_logout").slice(0, 60), id2), "closeStatement");
  app2.closeSession = (id2, reason, now) => db.batch([closeStatement(id2, reason, now)]);
  app2.route("POST", "/api/session/start", async (ctx) => {
    const device = checkDevice(ctx);
    const pin = ctx.body.pin, extension = String(ctx.body.extension ?? "");
    if (typeof pin !== "string" || !/^\d{1,32}$/.test(pin) || extension && !DIGITS.test(extension)) fail2(400, "invalid_fields");
    const key2 = ctx.ip + "|" + device;
    if (app2.limiters.employeeLogin.blocked(key2, ctx.now)) fail2(429, "rate_limited");
    const e = await app2.employeeByPin(pin);
    if (!e || !e.active) {
      app2.limiters.employeeLogin.fail(key2, ctx.now);
      fail2(401, "invalid_password");
    }
    app2.limiters.employeeLogin.reset(key2);
    const fresh = /* @__PURE__ */ __name((s) => ctx.now - s.last_seen < RULES.presenceStaleMs, "fresh");
    const open = await db.prepare("SELECT * FROM employee_sessions WHERE revoked_at IS NULL AND expires_at > ?").all(ctx.now);
    const mine = open.filter((s) => s.employee_id === e.id);
    if (mine.some((s) => fresh(s) && s.extension && extension && s.extension !== extension)) fail2(409, "session_active");
    const holder = extension && open.find((s) => s.employee_id !== e.id && s.extension === extension && fresh(s));
    if (holder) fail2(409, "extension_in_use");
    const results = await db.batch([
      ...mine.map((s) => closeStatement(s.id, fresh(s) ? "work_resumed" : "expired_or_disconnected", ctx.now)),
      ...extension ? open.filter((s) => s.employee_id !== e.id && s.extension === extension).map((s) => closeStatement(s.id, "expired_or_disconnected", ctx.now)) : [],
      db.prepare("UPDATE employee_sessions SET revoked_at = ?, revoke_reason = 'expired_or_disconnected' WHERE revoked_at IS NULL AND expires_at <= ?").bind(ctx.now, ctx.now),
      db.prepare("INSERT INTO employee_sessions (employee_id, device, extension, issued_at, bound_at, last_seen, expires_at) VALUES (?,?,?,?,?,?,?)").bind(e.id, device, extension, ctx.now, extension ? ctx.now : null, ctx.now, ctx.now + SESSION_MS2)
    ]);
    const sid = Number(results.at(-1).lastInsertRowid);
    const token = app2.signer.sign({ sid, eid: e.id, iat: ctx.now, exp: ctx.now + SESSION_MS2 });
    return { employee: { id: e.id, name: e.name, employeeCode: e.employee_code }, token };
  });
  app2.route("POST", "/api/session/end", async (ctx) => {
    const { session, closed } = await app2.requireSession(ctx, { allowRevoked: true });
    const reason = CLIENT_REASONS.includes(ctx.body.reason) ? ctx.body.reason : "explicit_logout";
    if (!closed) await db.batch([
      // The logout record, for when the extension's own logout event did not arrive first.
      db.prepare(`INSERT OR IGNORE INTO events (session_id, employee_id, extension, event_type, event_key, occurred_at, received_at, state, client_version, extra)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
        session.id,
        session.employee_id,
        session.extension || "unbound",
        "session_logout",
        session.id + ":logout:end",
        ctx.now,
        ctx.now,
        reason,
        session.client_version || "",
        JSON.stringify({ closureTimeKnown: reason !== "browser_restarted" })
      ),
      closeStatement(session.id, reason, ctx.now)
    ]);
    return { ok: true };
  });
  const openBreak = /* @__PURE__ */ __name(async (sessionId) => {
    const last = await db.prepare("SELECT event_type FROM events WHERE session_id = ? AND event_type IN ('break_start','break_observed','break_end','break_end_unknown') ORDER BY occurred_at DESC, id DESC LIMIT 1").get(sessionId);
    return !!last && ["break_start", "break_observed"].includes(last.event_type);
  }, "openBreak");
  app2.route("POST", "/api/events", async (ctx) => {
    const { session, employee, closed } = await app2.requireSession(ctx, { allowRevoked: true });
    const ev = ctx.body;
    const type = String(ev.eventType || ""), key2 = String(ev.eventKey || ""), extension = String(ev.extension || "");
    if (!EVENT_TYPE.test(type) || !key2 || key2.length > 300 || !DIGITS.test(extension)) fail2(400, "invalid_event");
    if (ev.payload?.eventClock?.method === "unsynchronized") fail2(400, "clock_unsynchronized");
    const occurred = Date.parse(ev.occurredAt);
    if (!Number.isFinite(occurred) || occurred > ctx.now + 3e4 || occurred < session.issued_at - 6e4) fail2(400, "invalid_time");
    if (closed) {
      const closedAt = Math.min(session.revoked_at ?? Infinity, session.expires_at);
      const grace = CLIENT_CLOSE.has(session.revoke_reason) ? CLOSE_GRACE_MS : 0;
      if (grace ? occurred > closedAt + grace : occurred >= closedAt) fail2(401, "invalid_employee_session");
    }
    if (session.extension && session.extension !== extension) fail2(403, "extension_mismatch");
    const payload = ev.payload === void 0 ? null : JSON.stringify(ev.payload);
    const rest = Object.fromEntries(Object.entries(ev).filter(([k]) => !COLUMNS.has(k)));
    let extra = Object.keys(rest).length ? JSON.stringify(rest) : null;
    if (JSON.stringify(ev).length > 32e3) fail2(400, "invalid_event");
    const existing = await db.prepare("SELECT id FROM events WHERE session_id = ? AND event_key = ?").get(session.id, key2);
    if (existing) return { ok: true, duplicate: true, id: existing.id };
    const writes = [];
    let permissionId = null;
    if (type === "break_start") {
      const p = await db.prepare("SELECT * FROM break_permissions WHERE id = ?").get(String(ev.permissionId || ""));
      if (!p || p.session_id !== session.id || p.used_at || p.expires_at < occurred - 5e3 || p.extension !== extension)
        fail2(409, "break_authorization_rejected");
      permissionId = p.id;
      writes.push(db.prepare("UPDATE break_permissions SET used_at=? WHERE id=? AND used_at IS NULL AND EXISTS (SELECT 1 FROM events WHERE session_id=? AND event_key=?)").bind(occurred, p.id, session.id, key2));
      const r = p.request_id ? await db.prepare("SELECT * FROM break_requests WHERE id = ?").get(p.request_id) : null;
      if (r) writes.push(db.prepare("UPDATE break_requests SET status = 'starting' WHERE id = ? AND EXISTS (SELECT 1 FROM events WHERE session_id=? AND event_key=?)").bind(r.id, session.id, key2));
      extra = JSON.stringify({
        ...extra ? JSON.parse(extra) : {},
        breakPolicyKind: r ? "approved" : "regular",
        breakReasonId: String(ev.breakReasonId || r?.reason_id || "2"),
        breakRequestedMinutes: r ? r.requested_minutes : 15,
        breakPermissionId: p.id,
        breakAllowedSeconds: p.allowed_seconds,
        breakGraceSeconds: p.grace_seconds
      });
    }
    if (type === "break_end" && !await openBreak(session.id)) fail2(409, "break_start_missing");
    const insert = db.prepare(`INSERT OR IGNORE INTO events (session_id, employee_id, extension, event_type, event_key, occurred_at, received_at,
      duration_seconds, state, call_id, phone, queue, call_type, client_version, payload, extra) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM break_permissions WHERE id=? AND used_at IS NULL)`).bind(
      session.id,
      employee.id,
      extension,
      type,
      key2,
      occurred,
      ctx.now,
      Number.isFinite(Number(ev.durationSeconds)) ? Math.max(0, Math.round(Number(ev.durationSeconds))) : null,
      ev.state == null ? null : String(ev.state).slice(0, 40),
      ev.callId == null ? null : String(ev.callId).slice(0, 80),
      ev.phone == null ? null : String(ev.phone).slice(0, 40),
      ev.queue == null ? null : String(ev.queue).slice(0, 20),
      ev.callType == null ? null : String(ev.callType).slice(0, 20),
      String(ev.clientVersion || "").slice(0, 20),
      payload,
      extra,
      permissionId,
      permissionId
    );
    writes.unshift(insert);
    if (!closed && (type === "session_logout" || type === "arabicss_logout"))
      writes.push(closeStatement(session.id, CLIENT_REASONS.includes(String(ev.state)) ? String(ev.state) : type, Math.min(occurred, ctx.now)));
    else if (!closed) {
      const working = ["ready", "on_call"].includes(ev.state) || ["agentlinked", "call_observed"].includes(type);
      writes.push(db.prepare(`UPDATE employee_sessions SET last_seen = MAX(last_seen, ?), client_version = ?,
        extension = CASE WHEN extension = '' THEN ? ELSE extension END,
        bound_at = COALESCE(bound_at, ?),
        work_started_at = CASE WHEN work_started_at IS NULL AND ? THEN ? ELSE work_started_at END
        WHERE id = ?`).bind(Math.min(ctx.now, occurred + 5e3), String(ev.clientVersion || ""), extension, occurred, working ? 1 : 0, occurred, session.id));
    }
    const results = await db.batch(writes);
    if (!results[0].changes) {
      const row = await db.prepare("SELECT id FROM events WHERE session_id = ? AND event_key = ?").get(session.id, key2);
      if (!row) fail2(409, "break_authorization_rejected");
      return { ok: true, duplicate: true, id: row.id };
    }
    return { ok: true, id: Number(results[0].lastInsertRowid) };
  });
}
__name(setup3, "setup");

// ../sites/lib/marsad/dashboard.js
var dashboard_exports = {};
__export(dashboard_exports, {
  setup: () => setup4
});
function setup4(app2) {
  const { db, fail: fail2 } = app2;
  const date = /* @__PURE__ */ __name((ctx) => {
    const today = businessDay(ctx.now), d = ctx.query.date || today;
    if (!validDate(d) || d > today) fail2(400, "\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    return d;
  }, "date");
  app2.route("GET", "/api/live", async (ctx) => {
    await app2.requireAdmin(ctx);
    const [snap, employees, pending] = await Promise.all([app2.latestLive(), app2.live(ctx.now), db.prepare("SELECT COUNT(*) n FROM break_requests WHERE status = 'pending'").get()]);
    const records = snap ? JSON.parse(snap.rows) : [];
    return {
      serverNow: iso(ctx.now),
      employees,
      queue: snap ? {
        observedAt: iso(snap.observed_at),
        stale: ctx.now - snap.observed_at > 3e4,
        waiting: records.filter((r) => /^(on wait|waiting)$/i.test(String(r[10]).trim())).map((r) => ({ queue: r[0], phone: r[9], wait: r[8] })),
        active: records.filter((r) => /^live call$/i.test(String(r[10]).trim())).length
      } : null,
      pendingBreaks: pending.n
    };
  });
  app2.route("GET", "/api/day", async (ctx) => {
    await app2.requireAdmin(ctx);
    return ctx.query.to || ctx.query.from ? app2.heavy("range", ctx.query.from || date(ctx), ctx.query.to || date(ctx), ctx.now) : app2.heavy("day", date(ctx), ctx.now);
  });
  app2.route("GET", "/api/pulse", async (ctx) => {
    await app2.requireAdmin(ctx);
    return app2.heavy("pulse", ctx.now, Number(ctx.query.minutes) || 180);
  });
  app2.route("GET", "/api/now-layout", async (ctx) => {
    await app2.requireAdmin(ctx);
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'now_layout'").get();
    let order = [];
    try {
      order = JSON.parse(row?.value || "[]");
    } catch {
    }
    return { order: Array.isArray(order) ? order : [] };
  });
  app2.route("POST", "/api/now-layout", async (ctx) => {
    await app2.requireAdmin(ctx, "write");
    const order = ctx.body?.order;
    if (!Array.isArray(order) || order.length > 500 || order.some((x) => typeof x !== "string" && typeof x !== "number" || String(x).length > 64)) fail2(400, "\u062A\u0631\u062A\u064A\u0628 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const clean3 = [...new Set(order.map(String))];
    await db.prepare("INSERT INTO settings (key, value) VALUES ('now_layout', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(clean3));
    return { order: clean3 };
  });
  app2.route("GET", "/api/missed", async (ctx) => {
    await app2.requireAdmin(ctx);
    const r = await app2.heavy("missedContext", date(ctx), Number(ctx.query.index), ctx.now);
    if (!r) fail2(404, "\u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    return r;
  });
}
__name(setup4, "setup");

// ../sites/lib/marsad/breaks.js
var breaks_exports = {};
__export(breaks_exports, {
  setup: () => setup5
});
var PERMISSION_MS = 6e4;
var PENDING_MS = 30 * 6e4;
var APPROVED_MS = 15 * 6e4;
var MINUTES = [15, 30, 45, 60];
function setup5(app2) {
  const { db, fail: fail2 } = app2;
  const expireRequests = /* @__PURE__ */ __name((now) => db.batch([
    db.prepare(`UPDATE break_requests SET status = 'completed' WHERE status = 'starting' AND EXISTS
      (SELECT 1 FROM break_permissions p WHERE p.id = break_requests.permission_id AND p.used_at IS NOT NULL AND EXISTS
        (SELECT 1 FROM events b JOIN events e ON e.session_id = b.session_id AND e.id > b.id
          WHERE b.session_id = p.session_id AND b.event_type = 'break_start' AND json_extract(COALESCE(b.extra, '{}'), '$.breakPermissionId') = p.id
          AND e.event_type IN ('break_end','break_end_unknown') AND e.occurred_at >= b.occurred_at))`).bind(),
    db.prepare("UPDATE break_requests SET status = 'expired' WHERE status = 'pending' AND created_at < ?").bind(now - PENDING_MS),
    db.prepare("UPDATE break_requests SET status = 'expired' WHERE status = 'approved' AND decided_at < ?").bind(now - APPROVED_MS),
    db.prepare(`UPDATE break_requests SET status = 'cancelled' WHERE status IN ('pending','approved','starting') AND session_id IN
      (SELECT id FROM employee_sessions WHERE revoked_at IS NOT NULL OR expires_at <= ?)`).bind(now)
  ]), "expireRequests");
  const policy = /* @__PURE__ */ __name((employeeId, now) => app2.breakPolicy(employeeId, now), "policy");
  const shapeForEmployee = /* @__PURE__ */ __name((r) => ({ id: r.id, status: r.status, reasonId: r.reason_id, reason: r.reason, requestKind: r.request_kind, requestedMinutes: r.requested_minutes, createdAt: iso(r.created_at), decidedAt: iso(r.decided_at) }), "shapeForEmployee");
  async function issuePermission(session, now, allowed, grace, requestId = null) {
    const id2 = randomUUID();
    await db.prepare("INSERT INTO break_permissions (id, session_id, employee_id, extension, request_id, allowed_seconds, grace_seconds, created_at, expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM break_permissions WHERE session_id = ? AND used_at IS NULL AND expires_at > ?)").run(id2, session.id, session.employee_id, session.extension, requestId, allowed, grace, now, now + PERMISSION_MS, session.id, now);
    const p = await db.prepare("SELECT * FROM break_permissions WHERE session_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1").get(session.id, now);
    if (!p || (p.request_id || null) !== requestId) fail2(409, "permission_pending");
    return { permissionId: p.id, expiresAt: p.expires_at, allowedSeconds: p.allowed_seconds, graceSeconds: p.grace_seconds };
  }
  __name(issuePermission, "issuePermission");
  async function requireReady(session, now) {
    if (!session.extension) fail2(409, "extension_required");
    if (!await app2.sessionReady(session, now)) fail2(409, "not_ready");
  }
  __name(requireReady, "requireReady");
  app2.route("GET", "/api/break-requests", async (ctx) => {
    await expireRequests(ctx.now);
    if (ctx.header("x-employee-session")) {
      const { session } = await app2.requireSession(ctx);
      const w2 = dayWindow(businessDay(ctx.now));
      const requests = await db.prepare("SELECT * FROM break_requests WHERE employee_id = ? AND created_at >= ? ORDER BY created_at DESC").all(session.employee_id, w2.start);
      return { breakPolicy: await policy(session.employee_id, ctx.now), requests: requests.map(shapeForEmployee) };
    }
    const who = await app2.requireAdmin(ctx);
    const w = dayWindow(businessDay(ctx.now));
    const rows = await db.prepare(`SELECT r.*, e.name AS employee_name FROM break_requests r JOIN employees e ON e.id = r.employee_id
      WHERE r.created_at >= ? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`).all(w.start);
    return {
      canDecide: ["admin", "supervisor"].includes(who.role),
      requests: rows.map((r) => ({
        id: r.id,
        employee: r.employee_name,
        extension: r.extension,
        reason: r.reason,
        requestKind: r.request_kind,
        requestedMinutes: r.requested_minutes,
        createdAt: iso(r.created_at),
        status: r.status,
        decidedBy: r.decided_by
      }))
    };
  });
  app2.route("POST", "/api/break-requests", async (ctx) => {
    await expireRequests(ctx.now);
    const b = ctx.body;
    if (["approve", "reject"].includes(b.action)) {
      const who = await app2.requireAdmin(ctx, "write");
      const r = await db.prepare("SELECT * FROM break_requests WHERE id = ?").get(String(b.id));
      if (!r) fail2(404, "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
      if (r.status !== "pending") fail2(409, "\u0627\u0644\u0637\u0644\u0628 \u0627\u062A\u063A\u064A\u0631\u061B \u062D\u062F\u0651\u062B \u0627\u0644\u0642\u0627\u0626\u0645\u0629");
      const u = await db.prepare("UPDATE break_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'").run(b.action === "approve" ? "approved" : "rejected", ctx.now, who.name, r.id);
      if (!u.changes) fail2(409, "\u0627\u0644\u0637\u0644\u0628 \u0627\u062A\u063A\u064A\u0631\u061B \u062D\u062F\u0651\u062B \u0627\u0644\u0642\u0627\u0626\u0645\u0629");
      await app2.audit("break_request_decided", r.employee_id, { actor: who.name, status: b.action, requestId: r.id });
      return { ok: true };
    }
    const { session } = await app2.requireSession(ctx);
    if (b.action === "cancel_permission") {
      const p2 = await db.prepare("SELECT * FROM break_permissions WHERE id = ? AND session_id = ?").get(String(b.permissionId || ""), session.id);
      if (!p2) fail2(404, "permission_not_found");
      const result = await db.prepare("UPDATE break_permissions SET expires_at = 0 WHERE id = ? AND session_id = ? AND used_at IS NULL").run(p2.id, session.id);
      if (!result.changes) fail2(409, "permission_already_used");
      return { ok: true };
    }
    const p = await policy(session.employee_id, ctx.now);
    if (b.action === "regular_start") {
      await requireReady(session, ctx.now);
      if (!p.regularAvailable) fail2(409, "approval_required");
      const grace = p.startsUsed === 0 ? p.graceSeconds : 0;
      return { ...await issuePermission(session, ctx.now, p.nextAllowedSeconds, grace), breakPolicy: p };
    }
    if (b.action === "request") {
      if (p.regularAvailable) fail2(409, "regular_break_available");
      const id2 = String(b.id || "");
      if (!/^break-request:[0-9a-f-]{36}$/.test(id2)) fail2(400, "invalid_request");
      const existing = await db.prepare("SELECT * FROM break_requests WHERE id = ?").get(id2);
      if (existing) return { request: shapeForEmployee(existing), breakPolicy: p };
      if (await db.prepare("SELECT 1 FROM break_requests WHERE employee_id = ? AND status IN ('pending','approved','starting') AND created_at > ?").get(session.employee_id, ctx.now - PENDING_MS)) fail2(409, "permission_pending");
      if (!session.extension) fail2(409, "extension_required");
      const minutes = MINUTES.includes(Number(b.requestedMinutes)) ? Number(b.requestedMinutes) : 15;
      await db.prepare("INSERT OR IGNORE INTO break_requests (id, employee_id, session_id, extension, reason_id, reason, request_kind, requested_minutes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id2, session.employee_id, session.id, session.extension, String(b.reasonId || "2").slice(0, 10), String(b.reason || "\u0628\u0631\u064A\u0643 \u0625\u0636\u0627\u0641\u064A").slice(0, 100), "additional", minutes, "pending", ctx.now);
      return { request: shapeForEmployee(await db.prepare("SELECT * FROM break_requests WHERE id = ?").get(id2)), breakPolicy: p };
    }
    if (b.action === "start") {
      const r = await db.prepare("SELECT * FROM break_requests WHERE id = ?").get(String(b.id));
      if (!r || r.employee_id !== session.employee_id || r.status !== "approved") fail2(409, "request_changed");
      await requireReady(session, ctx.now);
      const permission2 = await issuePermission(session, ctx.now, r.requested_minutes * 60, 0, r.id);
      await db.prepare("UPDATE break_requests SET permission_id = ? WHERE id = ?").run(permission2.permissionId, r.id);
      return { ...permission2, breakPolicy: p };
    }
    fail2(400, "invalid_action");
  });
}
__name(setup5, "setup");

// ../sites/lib/marsad/messages.js
var messages_exports = {};
__export(messages_exports, {
  setup: () => setup6
});
var HOURS = [1, 4, 12, 24];
function setup6(app2) {
  const { db, fail: fail2 } = app2;
  app2.route("GET", "/api/messages", async (ctx) => {
    if (ctx.header("x-employee-session")) {
      const { session } = await app2.requireSession(ctx);
      const rows2 = await db.prepare(`SELECT m.id, m.title, m.message, m.priority, m.created_at, m.expires_at, r.delivered_at
        FROM messages m JOIN message_recipients r ON r.message_id = m.id
        WHERE r.employee_id = ? AND r.acknowledged_at IS NULL AND m.expires_at > ? ORDER BY m.created_at`).all(session.employee_id, ctx.now);
      return { messages: rows2.map((r) => ({ id: r.id, title: r.title, message: r.message, priority: r.priority, created_at: iso(r.created_at), expires_at: iso(r.expires_at), delivered_at: iso(r.delivered_at) })) };
    }
    await app2.requireAdmin(ctx);
    const date = ctx.query.date || businessDay(ctx.now);
    if (!validDate(date)) fail2(400, "\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const w = dayWindow(date), employee = ctx.query.employee ? Number(ctx.query.employee) : null;
    const rows = await db.prepare(`SELECT m.*, r.employee_id, r.delivered_at, r.acknowledged_at, e.name AS employee_name
      FROM messages m JOIN message_recipients r ON r.message_id = m.id LEFT JOIN employees e ON e.id = r.employee_id
      WHERE m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR r.employee_id = ?) ORDER BY m.created_at DESC LIMIT 1001`).all(w.start, w.end, employee, employee);
    return {
      truncated: rows.length > 1e3,
      messages: rows.slice(0, 1e3).map((r) => ({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: r.employee_name || "\u062D\u0633\u0627\u0628 \u0645\u062D\u0630\u0648\u0641",
        title: r.title,
        message: r.message,
        priority: r.priority,
        created_at: iso(r.created_at),
        delivered_at: iso(r.delivered_at),
        acknowledged_at: iso(r.acknowledged_at),
        expires_at: iso(r.expires_at)
      }))
    };
  });
  app2.route("POST", "/api/messages", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const b = ctx.body, title2 = String(b.title || "").trim(), message = String(b.message || "").trim();
    if (!title2 || !message || title2.length > 80 || message.length > 1e3) fail2(400, "\u0627\u0643\u062A\u0628 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629");
    const id2 = String(b.id || "");
    if (!/^[0-9a-f-]{36}$/.test(id2)) fail2(400, "invalid_request");
    if (await db.prepare("SELECT 1 FROM messages WHERE id = ?").get(id2))
      return { ok: true, duplicate: true, recipients: (await db.prepare("SELECT COUNT(*) n FROM message_recipients WHERE message_id = ?").get(id2)).n };
    const active = (await db.prepare("SELECT id FROM employees WHERE active = 1 AND deleted_at IS NULL").all()).map((e) => e.id);
    const recipients = b.recipients === "all" ? active : Array.isArray(b.recipients) ? [...new Set(b.recipients.map(Number))].filter((x) => active.includes(x)) : [];
    if (!recipients.length) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0645\u0633\u062A\u0644\u0645\u064A\u0646");
    const hours = HOURS.includes(Number(b.hours)) ? Number(b.hours) : 4;
    await db.batch([
      db.prepare("INSERT INTO messages (id, title, message, priority, created_at, expires_at, created_by) VALUES (?,?,?,?,?,?,?)").bind(id2, title2, message, b.priority === "urgent" ? "urgent" : "normal", ctx.now, ctx.now + hours * 36e5, who.name),
      ...recipients.map((e) => db.prepare("INSERT OR IGNORE INTO message_recipients (message_id, employee_id) VALUES (?,?)").bind(id2, e))
    ]);
    await app2.audit("message_sent", null, { actor: who.name, title: title2, recipients: recipients.length });
    return { ok: true, recipients: recipients.length };
  });
  app2.route("PATCH", "/api/messages", async (ctx) => {
    const { session } = await app2.requireSession(ctx);
    const column2 = ctx.body.action === "acknowledged" ? "acknowledged_at" : ctx.body.action === "delivered" ? "delivered_at" : null;
    if (!column2) fail2(400, "invalid_action");
    const r = await db.prepare("SELECT * FROM message_recipients WHERE message_id = ? AND employee_id = ?").get(String(ctx.body.id), session.employee_id);
    if (!r) fail2(404, "not_found");
    await db.prepare(`UPDATE message_recipients SET ${column2} = COALESCE(${column2}, ?)${column2 === "acknowledged_at" ? ", delivered_at = COALESCE(delivered_at, ?)" : ""} WHERE message_id = ? AND employee_id = ?`).run(...column2 === "acknowledged_at" ? [ctx.now, ctx.now] : [ctx.now], r.message_id, r.employee_id);
    return { ok: true };
  });
}
__name(setup6, "setup");

// ../sites/lib/marsad/shifts.js
var shifts_exports = {};
__export(shifts_exports, {
  setup: () => setup7
});
function setup7(app2) {
  const { db, fail: fail2 } = app2;
  app2.route("POST", "/api/shifts", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const b = ctx.body, note = String(b.note || "").trim();
    if (!["include", "exclude"].includes(b.action) || !note || note.length > 500) fail2(400, "\u0627\u0643\u062A\u0628 \u0627\u0644\u0633\u0628\u0628 \u0648\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0625\u062C\u0631\u0627\u0621");
    const requestId = String(b.requestId || "");
    if (requestId && await db.prepare("SELECT 1 FROM shift_decisions WHERE request_id = ?").get(requestId)) return { ok: true, duplicate: true };
    const s = await db.prepare("SELECT * FROM employee_sessions WHERE id = ? AND employee_id = ?").get(Number(b.sessionId), Number(b.employeeId));
    if (!s) fail2(404, "\u0627\u0644\u062C\u0644\u0633\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    const staleBefore = ctx.now - RULES.presenceStaleMs;
    if (s.revoked_at == null && s.expires_at > ctx.now && s.last_seen > staleBefore)
      fail2(409, "\u0627\u0644\u062C\u0644\u0633\u0629 \u0644\u0633\u0647 \u0628\u062A\u0628\u0639\u062A \u0628\u064A\u0627\u0646\u0627\u062A\u061B \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u0642\u0628\u0644 \u062A\u062D\u062F\u064A\u062F \u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u0634\u064A\u0641\u062A");
    const writes = [];
    if (b.action === "exclude" && s.revoked_at == null) {
      const evidence = await db.prepare(`SELECT MAX(occurred_at) at FROM events WHERE session_id = ? AND occurred_at <= ? AND
        ((event_type = 'heartbeat' AND state IN ('ready','on_call','break','post_call')) OR
         event_type IN ('break_start','break_observed','break_end','break_end_unknown','agentlinked','agentunlinked','call_observed','call_observed_end'))`).get(s.id, ctx.now);
      const closedAt = Math.max(s.issued_at, Math.min(ctx.now, s.expires_at, (evidence?.at ?? s.last_seen ?? s.issued_at) + RULES.presenceStaleMs));
      writes.push(db.prepare(`UPDATE employee_sessions SET revoked_at = ?, revoke_reason = 'manual' WHERE id = ? AND revoked_at IS NULL
        AND last_seen = ? AND (expires_at <= ? OR last_seen <= ?)`).bind(closedAt, s.id, s.last_seen, ctx.now, staleBefore));
    }
    writes.push(db.prepare(`INSERT OR IGNORE INTO shift_decisions (request_id, employee_id, session_id, action, note, decided_at, decided_by)
      SELECT ?,?,?,?,?,?,? FROM employee_sessions WHERE id = ? AND
        (revoked_at IS NOT NULL OR expires_at <= ? OR last_seen <= ?) AND (? != 'exclude' OR revoked_at IS NOT NULL)`).bind(requestId || null, s.employee_id, s.id, b.action, note, ctx.now, who.name, s.id, ctx.now, staleBefore, b.action));
    const result = await db.batch(writes);
    if (!result.at(-1).changes) {
      if (requestId && await db.prepare("SELECT 1 FROM shift_decisions WHERE request_id = ?").get(requestId)) return { ok: true, duplicate: true };
      fail2(409, "\u0627\u0644\u062C\u0644\u0633\u0629 \u0631\u062C\u0639\u062A \u062A\u0628\u0639\u062A \u0628\u064A\u0627\u0646\u0627\u062A\u061B \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u0648\u0623\u0639\u062F \u0645\u0631\u0627\u062C\u0639\u062A\u0647\u0627");
    }
    await app2.audit("shift_changed", s.employee_id, { actor: who.name, sessionId: s.id, status: b.action, note });
    return { ok: true };
  });
  app2.route("POST", "/api/call-assignments", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const b = ctx.body, keys = Array.isArray(b.keys) ? [...new Set(b.keys.map(String))] : [];
    if (!keys.length || keys.length > 300 || keys.some((k) => !/^\d{4}-\d{2}-\d{2}\|/.test(k) || k.length > 120)) fail2(400, "\u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
    if (b.action === "remove") {
      const before = [];
      for (let i = 0; i < keys.length; i += 90) {
        const p = keys.slice(i, i + 90);
        before.push(...await db.prepare("SELECT call_key, employee_id FROM call_assignments WHERE call_key IN (" + p.map(() => "?").join(",") + ")").all(...p));
      }
      const parts2 = [];
      for (let i = 0; i < keys.length; i += 90) parts2.push(keys.slice(i, i + 90));
      await db.batch(parts2.map((p) => db.prepare("DELETE FROM call_assignments WHERE call_key IN (" + p.map(() => "?").join(",") + ")").bind(...p)));
      await app2.audit("calls_unassigned", null, { actor: who.name, count: keys.length, removed: before.map((r) => [r.call_key, r.employee_id]) });
      return { ok: true };
    }
    if (b.action !== "assign") fail2(400, "invalid_action");
    const e = await db.prepare("SELECT id, name FROM employees WHERE id = ? AND deleted_at IS NULL").get(Number(b.employeeId));
    if (!e) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0645\u0648\u0638\u0641");
    const note = String(b.note || "").trim().slice(0, 300) || null;
    const parts = [];
    for (let i = 0; i < keys.length; i += 19) parts.push(keys.slice(i, i + 19));
    await db.batch(parts.map((p) => db.prepare("INSERT INTO call_assignments (call_key, employee_id, decided_at, decided_by, note) VALUES " + p.map(() => "(?,?,?,?,?)").join(",") + " ON CONFLICT(call_key) DO UPDATE SET employee_id = excluded.employee_id, decided_at = excluded.decided_at, decided_by = excluded.decided_by, note = excluded.note").bind(...p.flatMap((k) => [k, e.id, ctx.now, who.name, note]))));
    await app2.audit("calls_assigned", e.id, { actor: who.name, count: keys.length, note });
    return { ok: true, count: keys.length };
  });
}
__name(setup7, "setup");

// ../sites/lib/marsad/history.js
var history_exports = {};
__export(history_exports, {
  setup: () => setup8
});

// ../sites/lib/marsad/arabicss.js
var FIELDS = {
  queue: /^queue$|queue\s*(?:no|number|id)?$|طابور|قائمة/i,
  account: /agent|account|operator|extension|^ext/i,
  date: /call\s*date|^date$|التاريخ/i,
  start: /start|begin|entry|^time$|البداية/i,
  end: /end|finish|hang\s*up|النهاية/i,
  duration: /duration|talk|مدة/i,
  wait: /wait|hold\s*time|ring\s*time|queue\s*time|انتظار/i,
  phone: /phone|caller|number|cli|source|الهاتف/i,
  status: /status|state|result|الحالة/i
};
function mapHeader(header) {
  const map = {}, used = /* @__PURE__ */ new Set();
  for (const field of ["date", "wait", "duration", "status", "queue", "account", "phone", "start", "end"]) {
    const i = header.findIndex((h, idx) => !used.has(idx) && FIELDS[field].test(String(h).trim()));
    if (i >= 0) {
      map[field] = i;
      used.add(i);
    }
  }
  return map;
}
__name(mapHeader, "mapHeader");
function parseClock(value) {
  const s = String(value ?? "").trim().replace(/[٠-٩]/g, (d) => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d));
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)?/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const marker = (m[4] || "").toUpperCase();
  if (marker === "PM" || marker === "\u0645") h = h % 12 + 12;
  else if (marker === "AM" || marker === "\u0635") h = h % 12;
  if (h > 23 || Number(m[2]) > 59) return null;
  return { seconds: h * 3600 + Number(m[2]) * 60 + Number(m[3] || 0), precision: m[3] == null ? "minute" : "second" };
}
__name(parseClock, "parseClock");
function parseDuration(value) {
  const s = String(value ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
  if (!m) return null;
  return m[3] == null ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
__name(parseDuration, "parseDuration");
function normalizeDate(value, fallback) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
  return fallback || null;
}
__name(normalizeDate, "normalizeDate");
var purpose = /* @__PURE__ */ __name((queue) => String(queue ?? "").slice(-1), "purpose");
var QUEUE_LABELS = { 0: "\u062E\u0627\u0631\u062C \u0633\u0627\u0639\u0627\u062A \u0627\u0644\u0639\u0645\u0644", 1: "\u0637\u0644\u0628 \u0623\u0648\u0631\u062F\u0631", 2: "\u0645\u062A\u0627\u0628\u0639\u0629 \u0623\u0648\u0631\u062F\u0631", 3: "\u0634\u0643\u0627\u0648\u0649" };
var queueLabel = /* @__PURE__ */ __name((q) => QUEUE_LABELS[purpose(q)] || "\u0637\u0627\u0628\u0648\u0631 \u063A\u064A\u0631 \u0645\u0635\u0646\u0641", "queueLabel");
function toRecord(row, map, fallbackDate, index) {
  const get = /* @__PURE__ */ __name((f) => map[f] == null ? null : row[map[f]], "get");
  const date = normalizeDate(get("date"), fallbackDate);
  const start = parseClock(get("start")), end = parseClock(get("end"));
  const [y, mo, d] = parseDate(date) || [];
  const at = /* @__PURE__ */ __name((c) => c && y ? cairoToUtc(y, mo, d, Math.floor(c.seconds / 3600), Math.floor(c.seconds % 3600 / 60), c.seconds % 60) : null, "at");
  let startMs = at(start), endMs = at(end);
  if (startMs != null && endMs != null && endMs < startMs) endMs += 864e5;
  const status = String(get("status") ?? "").trim();
  const extension = (String(get("account") ?? "").match(/(\d{2,6})(?!.*\d)/) || [])[1] || "";
  return {
    index,
    date,
    queue: String(get("queue") ?? "").trim(),
    accountName: String(get("account") ?? "").trim(),
    extension,
    start: get("start") == null ? null : String(get("start")).trim(),
    end: get("end") == null ? null : String(get("end")).trim(),
    startMs,
    endMs,
    precision: start?.precision === "second" || end?.precision === "second" ? "second" : start || end ? "minute" : null,
    durationSeconds: parseDuration(get("duration")),
    waitSeconds: parseDuration(get("wait")),
    phone: String(get("phone") ?? "").trim(),
    status
  };
}
__name(toRecord, "toRecord");
function classify(r) {
  const s = String(r.status || "").toLowerCase(), t = r.startMs ?? r.endMs, p = purpose(r.queue);
  const outsideTime = t != null && !isOperating(t);
  const outside = outsideTime || p === "0";
  const known = ["1", "2", "3"].includes(p);
  const answered = s === "success", abandoned = s === "abandoned";
  const short = abandoned && r.waitSeconds != null && r.waitSeconds <= RULES.shortAbandonSeconds;
  let classification = null;
  if (abandoned) classification = outsideTime ? "after_hours" : short ? "short_exempt" : p === "0" ? "after_hours" : !known ? "unknown_queue" : r.waitSeconds == null ? "unknown_wait" : "counted";
  return { outside, outsideTime, known, answered, abandoned, short, classification };
}
__name(classify, "classify");
function metrics(records) {
  const all = records.map((r) => ({ r, c: classify(r) }));
  const operating = all.filter((x) => !x.c.outsideTime && x.c.known);
  const shortAbandoned = operating.filter((x) => x.c.short).length;
  const calls = operating.filter((x) => !x.c.short);
  const answered = calls.filter((x) => x.c.answered), raw = calls.filter((x) => x.c.abandoned);
  const abandoned = raw.filter((x) => x.r.waitSeconds != null && x.r.waitSeconds > RULES.shortAbandonSeconds).length;
  const unclassifiedAbandoned = raw.filter((x) => x.r.waitSeconds == null).length;
  const unknownStatuses = calls.length - answered.length - raw.length;
  const validWaits = answered.every((x) => x.r.waitSeconds != null), validDurations = answered.every((x) => x.r.durationSeconds != null);
  const within = answered.filter((x) => x.r.waitSeconds != null && x.r.waitSeconds <= RULES.slaSeconds).length;
  const clean3 = !unknownStatuses && !unclassifiedAbandoned;
  return {
    calls: calls.length,
    recordedCalls: operating.length,
    shortAbandoned,
    answered: answered.length,
    abandoned,
    unclassifiedAbandoned,
    unknownStatuses,
    answeredWithinThreshold: within,
    missingWaits: answered.filter((x) => x.r.waitSeconds == null).length,
    asa: answered.length && validWaits ? answered.reduce((n, x) => n + x.r.waitSeconds, 0) / answered.length : null,
    sla: clean3 && validWaits && calls.length ? within / calls.length * 100 : null,
    abandonmentRate: clean3 && calls.length ? abandoned / calls.length * 100 : null,
    meanCallSeconds: answered.length && validDurations ? answered.reduce((n, x) => n + x.r.durationSeconds, 0) / answered.length : null,
    totalRecords: all.length,
    afterHours: all.filter((x) => x.c.outside).length,
    unclassified: all.filter((x) => !x.c.known && purpose(x.r.queue) !== "0").length
  };
}
__name(metrics, "metrics");
function summarize(records) {
  const queues = [...new Set(records.map((r) => r.queue))];
  return {
    report: metrics(records),
    queues: queues.map((queue) => ({ queue, label: queueLabel(queue), ...metrics(records.filter((r) => r.queue === queue)) }))
  };
}
__name(summarize, "summarize");
function liveSummary(rows) {
  const waiting = rows.filter((r) => /^on wait$|^waiting$/i.test(String(r[10]).trim()));
  const active = rows.filter((r) => /^live call$/i.test(String(r[10]).trim()));
  const waits = waiting.map((r) => parseDuration(r[8])).filter((v) => v != null);
  return { waiting: waiting.length, active: active.length, longest: waits.length ? Math.max(...waits) : waiting.length ? null : 0 };
}
__name(liveSummary, "liveSummary");

// ../sites/lib/marsad/xlsx-read.js
var dec2 = new TextDecoder();
async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
__name(inflate, "inflate");
async function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), files = /* @__PURE__ */ new Map();
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 101010256) {
    end = i;
    break;
  }
  if (end < 0) throw Error("not_zip");
  const count3 = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  for (let n = 0; n < count3; n++) {
    if (v.getUint32(p, true) !== 33639248) throw Error("bad_zip");
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec2.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    files.set(name, { method, data: buf.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { async text(name) {
    const f = files.get(name);
    if (!f) return null;
    return dec2.decode(f.method === 8 ? await inflate(f.data) : f.data);
  } };
}
__name(unzip, "unzip");
var xml = /* @__PURE__ */ __name((s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&"), "xml");
var texts = /* @__PURE__ */ __name((s) => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xml(m[1])).join(""), "texts");
var column = /* @__PURE__ */ __name((ref2) => {
  let n = 0;
  for (const ch of ref2.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}, "column");
var DATE_FORMATS = /* @__PURE__ */ new Set([14, 15, 16, 17, 22]);
var TIME_FORMATS = /* @__PURE__ */ new Set([18, 19, 20, 21, 45, 46, 47]);
function serial(n, kind) {
  if (kind === "time") {
    const s = Math.round(n % 1 * 86400);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, "0")).join(":");
  }
  return new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);
}
__name(serial, "serial");
async function readSheet(buf) {
  const zip = await unzip(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const shared = [...(await zip.text("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const styles = await zip.text("xl/styles.xml") || "", custom = /* @__PURE__ */ new Map();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(+m[1], xml(m[2]).toLowerCase());
  const xfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [, ""])[1];
  const kinds = [...xfs.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"/g)].map((m) => {
    const id2 = +m[1], code = custom.get(id2) || "";
    if (DATE_FORMATS.has(id2) || /[dy]/.test(code.replace(/"[^"]*"/g, ""))) return "date";
    if (TIME_FORMATS.has(id2) || /h|ss/.test(code.replace(/"[^"]*"/g, ""))) return "time";
    return null;
  });
  const workbook = await zip.text("xl/workbook.xml") || "", rels = await zip.text("xl/_rels/workbook.xml.rels") || "";
  const firstId = (workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/) || [])[1];
  let target = firstId && (rels.match(new RegExp('<Relationship[^>]*Id="' + firstId + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('<Relationship[^>]*Target="([^"]+)"[^>]*Id="' + firstId + '"')) || [])[1];
  target = target ? target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "") : "xl/worksheets/sheet1.xml";
  const sheet = await zip.text(target);
  if (!sheet) return [];
  const rows = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] || "", ref2 = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/t="(\w+)"/) || [])[1], s = +((attrs.match(/s="(\d+)"/) || [])[1] || 0);
      const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = "";
      if (t === "s") value = shared[+raw] ?? "";
      else if (t === "inlineStr") value = texts(body);
      else if (t === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (raw != null) value = t === "str" || t === "e" ? xml(raw) : kinds[s] && Number.isFinite(+raw) ? serial(+raw, kinds[s]) : raw;
      row[ref2 ? column(ref2) : row.length] = value;
    }
    if (row.some((x) => x !== void 0 && x !== "")) rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}
__name(readSheet, "readSheet");

// ../sites/lib/marsad/history.js
var TOKEN_MS = 24 * 36e5;
var REFRESH_MS = 30 * 24 * 36e5;
var LIVE_FRESH_MS = 15e3;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function setup8(app2) {
  const { db, fail: fail2 } = app2;
  async function issueCollector(now) {
    const token = now + TOKEN_MS + "." + randomToken(24), refresh = now + REFRESH_MS + "." + randomToken(24);
    await db.prepare("INSERT INTO collector_tokens (token_hash, refresh_hash, created_at, token_expires_at, refresh_expires_at) VALUES (?,?,?,?,?)").run(sha256(token), sha256(refresh), now, now + TOKEN_MS, now + REFRESH_MS);
    return { token, refreshToken: refresh };
  }
  __name(issueCollector, "issueCollector");
  const collectorByToken = /* @__PURE__ */ __name(async (token, now) => {
    const row = token && await db.prepare("SELECT * FROM collector_tokens WHERE token_hash = ?").get(sha256(token));
    return row && !row.revoked_at && row.token_expires_at > now ? row : null;
  }, "collectorByToken");
  const requireCollector = /* @__PURE__ */ __name(async (ctx) => await collectorByToken(ctx.header("x-history-token"), ctx.now) || fail2(401, "collector_token_invalid"), "requireCollector");
  async function storeReport(date, header, rows, { source, verified, expected, now }) {
    const fingerprint = sha256(JSON.stringify([header, rows]));
    const last = await db.prepare("SELECT * FROM history_reports WHERE date = ? ORDER BY imported_at DESC, id DESC LIMIT 1").get(date);
    if (last && last.fingerprint === fingerprint) {
      await db.prepare("UPDATE history_reports SET imported_at = ?, verified_total = MAX(verified_total, ?) WHERE id = ?").run(now, verified ? 1 : 0, last.id);
      return { id: last.id, duplicate: true };
    }
    if (last && !verified) {
      const had = (await db.prepare("SELECT COUNT(*) n FROM history_calls WHERE report_id = ?").get(last.id)).n;
      if (rows.length < had) fail2(409, "\u0627\u0644\u0645\u0644\u0641 \u0641\u064A\u0647 " + rows.length + " \u0645\u0643\u0627\u0644\u0645\u0629 \u0628\u0633\u060C \u0648\u0627\u0644\u0645\u062D\u0641\u0648\u0638 \u0644\u0646\u0641\u0633 \u0627\u0644\u064A\u0648\u0645 " + had + " \u0645\u0643\u0627\u0644\u0645\u0629\u061B \u0645\u062A\u063A\u064A\u0631\u0634");
    }
    const writes = [db.prepare("INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)").bind(date, now, source, verified ? 1 : 0, expected ?? null, JSON.stringify(header), fingerprint)];
    for (let i = 0; i < rows.length; i += 20) {
      const part = rows.slice(i, i + 20);
      writes.push(db.prepare("INSERT INTO history_calls (report_id,idx,raw) VALUES " + part.map(() => "((SELECT id FROM history_reports WHERE date=? AND fingerprint=? ORDER BY id DESC LIMIT 1),?,?)").join(",")).bind(...part.flatMap((row, k) => [date, fingerprint, i + k, JSON.stringify(row)])));
    }
    const result = await db.batch(writes), id2 = Number(result[0].lastInsertRowid);
    cache.clear();
    return { id: id2, duplicate: false };
  }
  __name(storeReport, "storeReport");
  const cache = /* @__PURE__ */ new Map();
  async function dayHistory(date, now) {
    const w = dayWindow(date), dates = [date, addDays(date, 1)];
    const reports = await Promise.all(dates.map((d) => db.prepare("SELECT * FROM history_reports WHERE date = ? ORDER BY imported_at DESC, id DESC LIMIT 1").get(d)));
    const key2 = date + "|" + reports.map((r) => r ? r.id + ":" + r.imported_at : "-").join("|");
    if (cache.has(key2)) return cache.get(key2);
    const records = [];
    const calls = await Promise.all(reports.map((r) => r ? db.prepare("SELECT idx, raw FROM history_calls WHERE report_id = ? ORDER BY idx").all(r.id) : []));
    reports.forEach((r, i) => {
      if (!r) return;
      const header = JSON.parse(r.header), map = mapHeader(header);
      for (const c of calls[i]) {
        const rec = toRecord(JSON.parse(c.raw), map, dates[i], records.length);
        const t = rec.startMs ?? rec.endMs;
        if (t == null ? i === 0 : t >= w.start && t < w.end) records.push({ ...rec, index: records.length, reportId: r.id });
      }
    });
    const missingCalendarDates = dates.filter((d, i) => !reports[i] && (i === 0 || now >= dayWindow(d).start - RULES.businessStartHour * 36e5));
    const s = summarize(records);
    const present = reports.filter(Boolean);
    const value = {
      key: key2,
      records,
      report: present.length ? {
        id: date + ":" + present.map((r) => r.id).join("-"),
        date,
        importedAt: iso(Math.max(...present.map((r) => r.imported_at))),
        verifiedTotal: present.every((r) => r.verified_total) && !missingCalendarDates.length,
        missingCalendarDates,
        precision: records.some((r) => r.precision === "minute") ? "minute" : "second",
        ...s.report
      } : null,
      queues: s.queues,
      missed: records.map((r) => ({ r, c: classify(r) })).filter((x) => x.c.abandoned).map(({ r, c }) => ({
        index: r.index,
        queue: r.queue,
        queueLabel: queueLabel(r.queue),
        date: r.date,
        start: r.start,
        end: r.end,
        phone: r.phone,
        waitSeconds: r.waitSeconds,
        classification: c.classification,
        precision: r.precision
      }))
    };
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    cache.set(key2, value);
    return value;
  }
  __name(dayHistory, "dayHistory");
  app2.dayHistory = dayHistory;
  const latestLive = /* @__PURE__ */ __name(() => db.prepare("SELECT * FROM live_snapshots ORDER BY observed_at DESC, id DESC LIMIT 1").get(), "latestLive");
  app2.latestLive = latestLive;
  async function ingestLive(body, now) {
    const c = body.capture || {}, rows = body.rows;
    if (!UUID.test(String(c.id || "")) || c.kind !== "native_report_snapshot") fail2(400, "invalid_capture");
    if (!Array.isArray(rows) || rows.length > 2e3 || rows.some((r) => !Array.isArray(r) || r.length !== 11 || r.some((v) => typeof v !== "string" || v.length > 200))) fail2(400, "invalid_live_snapshot");
    const observed = Date.parse(c.observedAt || "");
    if (c.timeBasis !== "server-clock-v1" || !Number.isFinite(observed) || observed > now + 5e3) fail2(400, "invalid_capture_time");
    const dup = await db.prepare("SELECT * FROM live_snapshots WHERE capture_id = ?").get(c.id);
    if (dup) return { ok: true, duplicate: true, captureId: c.id, observedAt: iso(dup.observed_at), liveAccepted: false, liveReason: "duplicate" };
    const prev = await latestLive(), s = liveSummary(rows);
    await db.prepare("INSERT OR IGNORE INTO live_snapshots (capture_id, observed_at, received_at, changed, rows, waiting, active, longest_wait) VALUES (?,?,?,?,?,?,?,?)").run(c.id, observed, now, c.changed ? 1 : 0, JSON.stringify(rows), s.waiting, s.active, s.longest);
    const superseded = prev && prev.observed_at > observed;
    const archived = now - observed > LIVE_FRESH_MS;
    return { ok: true, captureId: c.id, observedAt: iso(observed), liveAccepted: !superseded && !archived, archived, liveReason: superseded ? "superseded" : archived ? "stale" : "accepted" };
  }
  __name(ingestLive, "ingestLive");
  app2.route("POST", "/api/history", async (ctx) => {
    if (/spreadsheetml|octet-stream/.test(ctx.type)) return importWorkbook(ctx);
    let b;
    try {
      b = JSON.parse(new TextDecoder().decode(ctx.raw) || "{}");
    } catch {
      fail2(400, "invalid_json");
    }
    if (b.action === "token") {
      await app2.requireAdmin(ctx, "write");
      return issueCollector(ctx.now);
    }
    if (b.action === "refresh") {
      const row = await db.prepare("SELECT * FROM collector_tokens WHERE refresh_hash = ?").get(sha256(String(b.refreshToken || "")));
      if (!row || row.revoked_at || row.refresh_expires_at <= ctx.now) fail2(401, "collector_refresh_invalid");
      const u = await db.prepare("UPDATE collector_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(ctx.now, row.id);
      if (!u.changes) fail2(401, "collector_refresh_invalid");
      return issueCollector(ctx.now);
    }
    if (b.action === "upgrade") {
      const row = await requireCollector(ctx);
      await db.prepare("UPDATE collector_tokens SET revoked_at = ? WHERE id = ?").run(ctx.now, row.id);
      return issueCollector(ctx.now);
    }
    if (b.action === "revoke") {
      await db.prepare("UPDATE collector_tokens SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL").run(ctx.now, sha256(String(b.refreshToken || "")));
      return { ok: true };
    }
    await requireCollector(ctx);
    if (b.action === "live") return ingestLive(b, ctx.now);
    if (b.action === "status") {
      const st = b.state && typeof b.state === "object" ? b.state : {};
      const clip = /* @__PURE__ */ __name((v) => v == null ? null : String(v).slice(0, 400), "clip");
      const value = {
        receivedAt: iso(ctx.now),
        version: clip(st.version),
        lastHistory: clip(st.lastHistory),
        historyError: clip(st.historyError),
        liveError: clip(st.liveError),
        historyDays: Array.isArray(st.historyDays) ? st.historyDays.slice(0, 10).map(clip) : []
      };
      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("collector_status", JSON.stringify(value));
      return { ok: true };
    }
    if (!Array.isArray(b.rows) || b.rows.length < 1 || !validDate(b.reportDate)) fail2(400, "invalid_report");
    const [header, ...rows] = b.rows;
    if (!Array.isArray(header) || rows.some((r) => !Array.isArray(r) || r.length !== header.length)) fail2(400, "invalid_report");
    if (Number(b.expectedCount) !== rows.length) fail2(400, "report_count_mismatch");
    const stored = await storeReport(b.reportDate, header.map(String), rows.map((r) => r.map((v) => String(v ?? ""))), { source: "collector", verified: true, expected: rows.length, now: ctx.now });
    return { ok: true, ...stored };
  }, { raw: true, limit: 8 * 1024 * 1024 });
  async function importWorkbook(ctx) {
    await app2.requireAdmin(ctx, "write");
    if (ctx.raw.length > 2.5 * 1024 * 1024) fail2(413, "\u0627\u0644\u0645\u0644\u0641 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0645\u0633\u0645\u0648\u062D");
    let values;
    try {
      values = await readSheet(ctx.raw);
    } catch {
      fail2(400, "\u0627\u0644\u0645\u0644\u0641 \u0644\u064A\u0633 Excel \u0635\u0627\u0644\u062D\u064B\u0627");
    }
    if (!values.length) fail2(400, "\u0627\u0644\u0645\u0644\u0641 \u0641\u0627\u0631\u063A");
    const h = values.findIndex((r) => r.some((v) => /call\s*date/i.test(v)));
    if (h < 0) fail2(400, "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0639\u0645\u0648\u062F Call Date");
    const header = values[h], map = mapHeader(header), byDate = /* @__PURE__ */ new Map();
    for (const r of values.slice(h + 1)) {
      const row = header.map((_, i) => r[i] ?? "");
      const date = normalizeDate(row[map.date]);
      if (!date) continue;
      row[map.date] = date;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    }
    if (!byDate.size) fail2(400, "\u0644\u0627 \u062A\u0648\u062C\u062F \u0635\u0641\u0648\u0641 \u0628\u062A\u0627\u0631\u064A\u062E \u0635\u0627\u0644\u062D");
    let duplicate = true;
    for (const [date, rows] of byDate) duplicate = (await storeReport(date, header, rows, { source: "xlsx", verified: false, now: ctx.now })).duplicate && duplicate;
    const first = [...byDate.keys()].sort()[0];
    return { ok: true, date: first, duplicate, dates: [...byDate.keys()].sort() };
  }
  __name(importWorkbook, "importWorkbook");
  app2.route("GET", "/api/history", async (ctx) => {
    await app2.requireAdmin(ctx);
    const q = ctx.query, today = businessDay(ctx.now), date = q.date || today;
    if (!validDate(date)) fail2(400, "\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const latest = await latestLive();
    const live = latest ? { observedAt: iso(latest.observed_at), stale: ctx.now - latest.observed_at > 3e4, records: JSON.parse(latest.rows) } : null;
    if (q.live === "1" && q.missedIndex === void 0 && q.contexts !== "1" && q.all !== "1")
      return { live, report: null, reports: [], queues: [], missed: [], records: [], liveOnly: true };
    const h = await dayHistory(date, ctx.now);
    const out = {
      report: h.report,
      queues: h.queues,
      missed: h.missed,
      live
    };
    if (q.reportId && h.report && q.reportId !== h.report.id) fail2(409, "\u0648\u0635\u0644 \u0633\u062C\u0644 \u0623\u062D\u062F\u062B\u061B \u0623\u0639\u062F \u0641\u062A\u062D \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644");
    if (q.all === "1") out.records = h.records.map((r) => ({
      queue: r.queue,
      accountName: r.accountName,
      date: r.date,
      start: r.start,
      end: r.end,
      durationSeconds: r.durationSeconds,
      waitSeconds: r.waitSeconds,
      phone: r.phone,
      status: r.status,
      outsideHours: classify(r).outside
    }));
    return out;
  });
}
__name(setup8, "setup");

// ../sites/lib/marsad/engine.js
var engine_exports = {};
__export(engine_exports, {
  callsOf: () => callsOf,
  canonical: () => canonical,
  setup: () => setup9,
  spansOf: () => spansOf,
  stateOf: () => stateOf
});

// ../sites/lib/marsad/attendance-rules.js
var GAP_MS = 9e4;
var RECONNECT_MS = 2 * 36e5;
var KNOWN_CLOSE = /* @__PURE__ */ new Set([
  "explicit_logout",
  "session_logout",
  "arabicss_logout",
  "arabicss_login_page",
  "extension_changed",
  "tab_closed",
  "password_changed",
  "employee_disabled",
  "employee_deleted",
  "manual"
]);
var numeric = /* @__PURE__ */ __name((x) => /^\d{1,10}$/.test(String(x || "")), "numeric");
var OUT_KINDS = {
  arabicss: ["arabicss_logout", "arabicss_login_page"],
  extension: ["extension_logout", "extension_changed", "explicit_logout", "session_logout", "manual", "password_changed", "employee_disabled", "employee_deleted"],
  browser: ["tab_closed", "browser_restarted", "extension_restarted"]
};
var outKind = /* @__PURE__ */ __name((reason) => Object.keys(OUT_KINDS).find((k) => OUT_KINDS[k].includes(reason || "")) || "gap", "outKind");
function attendance(sessions, spans, { start, operatingEnd, end, now }) {
  const bySession = /* @__PURE__ */ new Map();
  for (const p of spans) {
    if (!bySession.has(p.sessionId)) bySession.set(p.sessionId, []);
    bySession.get(p.sessionId).push(p);
  }
  for (const list of bySession.values()) list.sort((a, b) => a.started - b.started);
  const rows = [], outSessions = [];
  const push = /* @__PURE__ */ __name((s, state, a, b, extra = {}) => {
    a = Math.max(a, start);
    b = Math.min(b, end, now);
    if (b <= a) return;
    const parts = a < operatingEnd && b > operatingEnd ? [[a, operatingEnd], [operatingEnd, b]] : [[a, b]];
    for (const [x, y] of parts) rows.push({
      employeeId: s.employeeId,
      extension: s.extension,
      state,
      startedAt: new Date(x).toISOString(),
      endedAt: new Date(y).toISOString(),
      durationSeconds: Math.floor((y - x) / 1e3),
      running: false,
      outsideHours: x >= operatingEnd,
      evidenceUntil: y,
      ...extra
    });
  }, "push");
  const ordered = [...sessions].sort((a, b) => a.issuedAt - b.issuedAt);
  const effective = /* @__PURE__ */ new Map();
  for (const s of ordered) {
    const list = bySession.get(s.id) || [];
    const workStart = numeric(s.extension) ? s.workStartedAt : null;
    const real = list.filter((p) => ["ready", "on_call", "break", "post_call"].includes(p.state));
    const lastEvidence = real.length ? Math.max(...real.map((p) => p.lastEvidence)) : list.length ? Math.min(...list.map((p) => p.started)) : s.lastSeen;
    const running = s.revokedAt === null && s.expiresAt > now && now - s.lastSeen < GAP_MS;
    const known = s.revokedAt !== null && KNOWN_CLOSE.has(s.reason || "");
    const close = running ? now : known ? s.revokedAt : Math.min(lastEvidence + GAP_MS, s.revokedAt ?? s.expiresAt, s.expiresAt);
    effective.set(s.id, { close, known, workStart });
    const through = running ? now : known ? s.revokedAt : Math.min(lastEvidence, s.revokedAt ?? s.expiresAt);
    outSessions.push({
      ...s,
      running: running && workStart !== null,
      closureKnown: known,
      observedThrough: new Date(through).toISOString(),
      startedAt: new Date(workStart ?? s.issuedAt).toISOString(),
      endedAt: running ? null : new Date(through).toISOString(),
      durationSeconds: workStart === null ? 0 : Math.max(0, Math.floor((through - workStart) / 1e3)),
      daySeconds: workStart === null ? 0 : Math.max(0, Math.floor((Math.min(through, operatingEnd, now) - Math.max(workStart, start)) / 1e3)),
      identityDelaySeconds: workStart === null ? null : Math.max(0, Math.floor((workStart - s.issuedAt) / 1e3)),
      durationComplete: known || running,
      dayStart: start,
      dayEnd: end
    });
    if (workStart === null) continue;
    let cursor = workStart;
    for (let i = 0; i < list.length; i++) {
      const p = list[i], next = list[i + 1];
      if (p.started >= close) break;
      const a = Math.max(p.started, workStart);
      const linked = next && next.state === p.state && ["break", "on_call"].includes(p.state);
      const b = Math.min(next ? linked ? next.started : Math.min(next.started, p.lastEvidence + GAP_MS) : p.lastEvidence + GAP_MS, close);
      if (a > cursor) push(s, "unknown", cursor, a, { outKind: "gap" });
      if (b > a && p.state !== "logged_in") push(s, p.state === "post_call" ? "ready" : p.state, a, b);
      cursor = Math.max(cursor, b);
    }
    if (running && cursor < now) push(s, "unknown", cursor, now, { outKind: "gap" });
    else if (known && cursor < close) push(s, "unknown", cursor, close, { outKind: "gap" });
  }
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i], e = effective.get(s.id);
    if (e.workStart === null || s.revokedAt === null && e.close === now) continue;
    const next = ordered.slice(i + 1).find((x) => x.employeeId === s.employeeId && effective.get(x.id).workStart !== null);
    const nextStart = next ? effective.get(next.id).workStart : null;
    if (nextStart === null) continue;
    const kind = outKind(s.reason);
    if (kind !== "gap") push(s, "offline", e.close, nextStart, { outKind: kind, reason: s.reason });
    else if (nextStart - e.close <= RECONNECT_MS) push(s, "unknown", e.close, nextStart, { reconnect: true, outKind: "gap" });
  }
  for (const r of rows) if (r.state !== "offline") r.running = !!outSessions.find((x) => x.running && x.employeeId === r.employeeId && x.extension === r.extension) && Date.parse(r.endedAt) >= now - 1e3;
  return { sessions: outSessions, states: rows.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)) };
}
__name(attendance, "attendance");
function mergeBreaks(states, recorded, operatingEnd) {
  const key2 = /* @__PURE__ */ __name((x) => x.employeeId + "|" + x.extension, "key"), groups = /* @__PURE__ */ new Map();
  const add = /* @__PURE__ */ __name((k, a, b, running, base) => {
    if (!groups.has(k)) groups.set(k, { base, list: [] });
    groups.get(k).list.push([a, b, running]);
  }, "add");
  for (const b of recorded) add(key2(b), Date.parse(b.startedAt), Date.parse(b.endedAt), !!b.running, b);
  for (const s of states) if (s.state === "break" || s.state === "break_unconfirmed") add(key2(s), Date.parse(s.startedAt), Date.parse(s.endedAt), !!s.running, s);
  const merged = /* @__PURE__ */ new Map();
  for (const [k, g] of groups) {
    const out = [];
    for (const [a, b, r] of g.list.sort((x, y) => x[0] - y[0])) {
      const last = out.at(-1);
      if (last && a <= last[1]) {
        last[1] = Math.max(last[1], b);
        last[2] = last[2] || r;
      } else out.push([a, b, r]);
    }
    merged.set(k, { base: g.base, list: out });
  }
  const rest = [];
  for (const s of states) {
    if (s.state === "break" || s.state === "break_unconfirmed") continue;
    let pieces = [[Date.parse(s.startedAt), Date.parse(s.endedAt)]];
    for (const [a, b] of merged.get(key2(s))?.list || []) pieces = pieces.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([u, v]) => v > u));
    for (const [x, y] of pieces) rest.push({ ...s, startedAt: new Date(x).toISOString(), endedAt: new Date(y).toISOString(), durationSeconds: Math.floor((y - x) / 1e3), running: s.running && y === Date.parse(s.endedAt) });
  }
  const breaks = [];
  for (const { base, list } of merged.values()) for (const [a, b, running] of list) {
    const parts = a < operatingEnd && b > operatingEnd ? [[a, operatingEnd], [operatingEnd, b]] : [[a, b]];
    for (const [x, y] of parts) breaks.push({
      employeeId: base.employeeId,
      extension: base.extension,
      state: "break",
      startedAt: new Date(x).toISOString(),
      endedAt: new Date(y).toISOString(),
      durationSeconds: Math.floor((y - x) / 1e3),
      running: running && y === b,
      outsideHours: x >= operatingEnd,
      evidenceUntil: y,
      recorded: recorded.some((r) => key2(r) === key2(base) && Date.parse(r.startedAt) < y && Date.parse(r.endedAt) > x)
    });
  }
  return [...rest, ...breaks].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
__name(mergeBreaks, "mergeBreaks");
function breakTotals(states) {
  const by = /* @__PURE__ */ new Map();
  for (const s of states) {
    if (s.state !== "break" || s.outsideHours) continue;
    const t = by.get(s.employeeId) || { employeeId: s.employeeId, completedBreakSeconds: 0, ongoingBreakSeconds: 0, totalBreakSeconds: 0, breakCount: 0 };
    t[s.running ? "ongoingBreakSeconds" : "completedBreakSeconds"] += s.durationSeconds;
    t.totalBreakSeconds += s.durationSeconds;
    t.breakCount++;
    by.set(s.employeeId, t);
  }
  return [...by.values()];
}
__name(breakTotals, "breakTotals");

// ../sites/lib/marsad/engine.js
var GAP_MS2 = RULES.presenceStaleMs;
var WORK = /* @__PURE__ */ new Set(["ready", "on_call", "break"]);
var canonical = /* @__PURE__ */ __name((id2) => (String(id2 ?? "").match(/(?:incoming-q\d+-|outgoing-)?(\d+)$/) || [])[1] || String(id2 ?? ""), "canonical");
var digits = /* @__PURE__ */ __name((p) => String(p || "").replace(/\D/g, "").slice(-9), "digits");
var numeric2 = /* @__PURE__ */ __name((x) => /^\d{1,10}$/.test(String(x || "")), "numeric");
function stateOf(e) {
  switch (e.event_type) {
    case "heartbeat":
      return ["ready", "on_call", "break", "unknown", "logged_in"].includes(e.state) ? e.state : e.state === "post_call" ? "ready" : "unknown";
    case "session_login":
    case "arabicss_login":
      return "logged_in";
    case "break_start":
    case "break_observed":
      return "break";
    case "break_end":
    case "break_end_unknown":
      return "ready";
    case "agentlinked":
    case "call_observed":
      return "on_call";
    case "agentunlinked":
    case "call_observed_end":
      return "ready";
    default:
      return null;
  }
}
__name(stateOf, "stateOf");
function spansOf(session, events) {
  const out = [];
  for (const e of events) {
    const state = stateOf(e);
    if (!state) continue;
    const at = e.occurred_at, last = out.at(-1);
    if (last && last.state === state && at - last.lastEvidence < GAP_MS2) last.lastEvidence = at;
    else out.push({ sessionId: String(session.id), employeeId: session.employee_id, extension: e.extension || session.extension, state, started: at, lastEvidence: at });
  }
  return out;
}
__name(spansOf, "spansOf");
function callsOf(session, events) {
  const calls = /* @__PURE__ */ new Map(), order = [];
  const get = /* @__PURE__ */ __name((id2, e) => {
    const k = canonical(id2);
    if (!calls.has(k)) {
      calls.set(k, { callId: k, employeeId: session.employee_id, extension: e.extension, sessionId: session.id, phone: "", queue: "", callType: null, startedAt: null, endedAt: null, durationSeconds: null, complete: false, source: "connector", startKnown: false });
      order.push(k);
    }
    return calls.get(k);
  }, "get");
  for (const e of events) {
    if (e.event_type === "agentlinked" && e.call_id) {
      const c = get(e.call_id, e);
      if (c.startedAt == null) {
        c.startedAt = e.occurred_at;
        c.startKnown = true;
      }
      c.phone ||= e.phone || "";
      c.queue ||= e.queue || "";
      c.callType ||= e.call_type || null;
    } else if (e.event_type === "agentunlinked" && e.call_id) {
      const c = get(e.call_id, e);
      c.endedAt = e.occurred_at;
      c.complete = true;
      c.durationSeconds = Number.isFinite(e.duration_seconds) && e.duration_seconds > 0 ? e.duration_seconds : c.startedAt != null ? Math.round((e.occurred_at - c.startedAt) / 1e3) : 0;
      if (c.startedAt == null) c.startedAt = e.occurred_at - c.durationSeconds * 1e3;
      c.phone ||= e.phone || "";
      c.queue ||= e.queue || "";
      c.callType ||= e.call_type || null;
    } else if (e.event_type === "call_observed" || e.event_type === "call_observed_end") {
      let p = {};
      try {
        p = JSON.parse(e.payload || "{}");
      } catch {
      }
      const id2 = p.callId || p.payload?.callId || e.call_id;
      if (!id2) continue;
      const c = get(id2, e);
      if (e.event_type === "call_observed") c.startedAt ??= e.occurred_at;
      else if (!c.complete) {
        c.endedAt = e.occurred_at;
      }
    }
  }
  return order.map((k) => calls.get(k)).filter((c) => c.startedAt != null);
}
__name(callsOf, "callsOf");
var SLOT_MS = 30 * 6e4;
function slotsOf(w, records, states, samples) {
  const out = [];
  for (let t = w.start; t < w.end; t += SLOT_MS) {
    const end = t + SLOT_MS;
    const mine = records.filter((r) => {
      const at = r.startMs ?? r.endMs;
      return at != null && at >= t && at < end;
    });
    const m = summarize(mine).report;
    const share = /* @__PURE__ */ __name((state) => states.reduce((n, s) => {
      if (s.state !== state) return n;
      const a = Math.max(t, Date.parse(s.startedAt)), b = Math.min(end, Date.parse(s.endedAt));
      return b > a ? n + (b - a) : n;
    }, 0) / SLOT_MS, "share");
    const q = samples.filter((x) => x.observed_at >= t && x.observed_at < end);
    out.push({
      start: iso(t),
      operating: t < w.operatingEnd,
      calls: m.calls,
      answered: m.answered,
      abandoned: m.abandoned,
      shortAbandoned: m.shortAbandoned,
      sla: m.sla,
      asa: m.asa,
      ready: Math.round(share("ready") * 10) / 10,
      onCall: Math.round(share("on_call") * 10) / 10,
      onBreak: Math.round(share("break") * 10) / 10,
      waitingMax: q.length ? Math.max(...q.map((x) => x.waiting)) : null,
      longestWait: q.length ? Math.max(...q.map((x) => x.longest_wait ?? 0)) : null,
      samples: q.length
    });
  }
  return out;
}
__name(slotsOf, "slotsOf");
function setup9(app2) {
  const { db } = app2;
  const cache = /* @__PURE__ */ new Map();
  const names = /* @__PURE__ */ __name(async () => new Map((await db.prepare("SELECT id, name, employee_code, active, deleted_at FROM employees").all()).map((e) => [e.id, e])), "names");
  const bySession = /* @__PURE__ */ __name((rows) => {
    const m = /* @__PURE__ */ new Map();
    for (const e of rows) {
      if (!m.has(e.session_id)) m.set(e.session_id, []);
      m.get(e.session_id).push(e);
    }
    return m;
  }, "bySession");
  const sessionRow = /* @__PURE__ */ __name((s) => ({
    id: String(s.id),
    employeeId: s.employee_id,
    extension: s.extension,
    issuedAt: s.issued_at,
    lastSeen: s.last_seen,
    expiresAt: s.expires_at,
    revokedAt: s.revoked_at ?? null,
    reason: s.revoke_reason || null,
    workStartedAt: s.work_started_at ?? null
  }), "sessionRow");
  async function day(date, now = app2.now()) {
    const w = dayWindow(date), from = w.start - 12 * 36e5;
    const [ev, ses, h, dec3, asg] = await Promise.all([
      db.prepare("SELECT MAX(id) m FROM events").get(),
      db.prepare("SELECT MAX(COALESCE(revoked_at, 0)) m, COUNT(*) n FROM employee_sessions").get(),
      app2.dayHistory(date, now),
      db.prepare("SELECT MAX(id) m FROM shift_decisions").get(),
      db.prepare("SELECT MAX(decided_at) m, COUNT(*) n FROM call_assignments").get()
    ]);
    const key2 = [date, ev.m, ses.m, ses.n, h.key, dec3.m, asg.m, asg.n, now >= w.end + 12 * 36e5 ? "settled" : Math.floor(now / 5e3)].join("|");
    if (cache.has(key2)) return cache.get(key2);
    const [people, rows, allEvents, decisions, samples] = await Promise.all([
      names(),
      db.prepare("SELECT * FROM employee_sessions WHERE issued_at < ? AND COALESCE(revoked_at, expires_at) > ? ORDER BY issued_at").all(w.end, from),
      db.prepare(`SELECT * FROM events WHERE session_id IN (SELECT id FROM employee_sessions WHERE issued_at < ? AND COALESCE(revoked_at, expires_at) > ?) ORDER BY occurred_at, id`).all(w.end, from),
      db.prepare(`SELECT d.* FROM shift_decisions d JOIN employee_sessions s ON s.id = d.session_id WHERE s.issued_at < ? AND COALESCE(s.revoked_at, s.expires_at) > ? ORDER BY d.decided_at`).all(w.end, from),
      db.prepare("SELECT observed_at, waiting, longest_wait FROM live_snapshots WHERE observed_at >= ? AND observed_at < ? ORDER BY observed_at").all(w.start, w.end)
    ]);
    const grouped = bySession(allEvents);
    const sessions = [], spans = [], calls = [], breakEvents = [], logins = [];
    for (const s of rows) {
      const events = grouped.get(s.id) || [], sp = spansOf(s, events);
      const firstWork = sp.find((p) => WORK.has(p.state) && p.state !== "break" && numeric2(p.extension));
      sessions.push({ ...sessionRow(s), workStartedAt: firstWork ? firstWork.started : null, extension: firstWork?.extension || s.extension });
      spans.push(...sp);
      calls.push(...callsOf(s, events));
      for (const e of events) {
        if (e.event_type === "break_end" && e.duration_seconds > 0) breakEvents.push({ employeeId: s.employee_id, extension: e.extension, startedAt: iso(e.occurred_at - e.duration_seconds * 1e3), endedAt: iso(e.occurred_at), running: false });
        if (e.event_type === "session_login" && numeric2(e.extension)) logins.push(e);
      }
    }
    const at = attendance(sessions.filter((s) => s.issuedAt < w.end), spans, { start: w.start, operatingEnd: w.operatingEnd, end: w.end, now });
    const states = mergeBreaks(at.states, breakEvents.filter((b) => Date.parse(b.endedAt) > w.start && Date.parse(b.startedAt) < w.end), w.operatingEnd);
    const totals = breakTotals(states);
    const dayCalls = calls.filter((c) => c.startedAt >= w.start && c.startedAt < w.end);
    const assignments = new Map((await db.prepare("SELECT * FROM call_assignments WHERE call_key >= ? AND call_key < ?").all(date, addDays(date, 2))).map((a) => [a.call_key, a]));
    const matched = matchHistory(h.records, dayCalls, at.sessions, people, states, assignments);
    const allCalls = [...dayCalls, ...matched.recovered].map((c) => ({
      ...c,
      employee: people.get(c.employeeId)?.name || "",
      outsideHours: c.startedAt >= w.operatingEnd || purpose(c.queue) === "0",
      startedAt: iso(c.startedAt),
      endedAt: iso(c.endedAt)
    })).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const decided = new Map(decisions.map((d) => [String(d.session_id), { action: d.action, note: d.note, decidedAt: iso(d.decided_at), decidedBy: d.decided_by }]));
    const daySessions = at.sessions.filter((s) => (s.workStartedAt ?? s.issuedAt) < w.end && Date.parse(s.observedThrough) > w.start).map((s) => ({ ...s, decision: decided.get(s.id) || null }));
    const ids = /* @__PURE__ */ new Set([...daySessions.filter((s) => s.workStartedAt != null && s.daySeconds > 0).map((s) => s.employeeId), ...allCalls.map((c) => c.employeeId).filter(Boolean)]);
    const employees = [...ids].map((id2) => {
      const mine = allCalls.filter((c) => c.employeeId === id2 && !c.outsideHours), done = mine.filter((c) => c.complete);
      const st = states.filter((s) => s.employeeId === id2 && !s.outsideHours), sum = /* @__PURE__ */ __name((k) => st.filter((s) => s.state === k).reduce((n, s) => n + s.durationSeconds, 0), "sum");
      const ses2 = daySessions.filter((s) => s.employeeId === id2 && s.workStartedAt != null);
      const t = totals.find((x) => x.employeeId === id2) || {};
      const logouts = ses2.filter((s) => s.revokedAt != null && KNOWN_CLOSE.has(s.reason || "")).map((s) => s.revokedAt);
      const out2 = /* @__PURE__ */ __name((k) => st.filter((s) => (s.state === "offline" || s.state === "unknown") && (s.outKind || "gap") === k).reduce((n, s) => n + s.durationSeconds, 0), "out");
      const ready = sum("ready"), onCall = sum("on_call"), brk = t.totalBreakSeconds || 0;
      return {
        employeeId: id2,
        name: people.get(id2)?.name || "\u062D\u0633\u0627\u0628 \u0645\u062D\u0630\u0648\u0641",
        calls: mine.length,
        inbound: mine.filter((c) => c.callType === "incoming").length,
        outbound: mine.filter((c) => c.callType === "outgoing").length,
        answered: done.length,
        fromHistory: mine.filter((c) => c.source === "history").length,
        assignedCalls: mine.filter((c) => c.source === "manual").length,
        talkSeconds: done.reduce((n, c) => n + c.durationSeconds, 0),
        averageCallSeconds: done.length ? Math.round(done.reduce((n, c) => n + c.durationSeconds, 0) / done.length) : null,
        longCalls: done.filter((c) => c.durationSeconds > RULES.callAlertSeconds).length,
        workSeconds: ready + onCall + brk,
        readySeconds: ready,
        callSeconds: onCall,
        breakSeconds: brk,
        breakCount: t.breakCount || 0,
        ongoingBreakSeconds: t.ongoingBreakSeconds || 0,
        gapSeconds: out2("gap"),
        outArabicssSeconds: out2("arabicss"),
        outExtensionSeconds: out2("extension"),
        outBrowserSeconds: out2("browser"),
        firstLogin: ses2.length ? iso(Math.min(...ses2.map((s) => s.workStartedAt))) : null,
        lastLogout: logouts.length ? iso(Math.max(...logouts)) : null
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const out = {
      date,
      window: { start: iso(w.start), operatingEnd: iso(w.operatingEnd), end: iso(w.end) },
      sessions: daySessions,
      states,
      calls: allCalls,
      employees,
      history: { report: h.report, queues: h.queues, missed: h.missed, attribution: matched.summary, unattributed: matched.unattributed, assigned: matched.assigned },
      slots: slotsOf(w, h.records, states, samples),
      serverNow: iso(now)
    };
    Object.defineProperty(out, "raw", { value: { sessions, states, records: h.records } });
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    cache.set(key2, out);
    return out;
  }
  __name(day, "day");
  const callKey = /* @__PURE__ */ __name((r) => [r.date, r.start || "", digits(r.phone), r.queue].join("|"), "callKey");
  function matchHistory(records, calls, sessions, people, states = [], assignments = /* @__PURE__ */ new Map()) {
    const used = /* @__PURE__ */ new Set(), recovered = [], unattributed = [], assigned = [];
    let already = 0;
    const toCall = /* @__PURE__ */ __name((r, employeeId, t, source) => {
      const end = r.endMs ?? t + (r.durationSeconds || 0) * 1e3;
      return {
        callId: "history:" + r.index,
        employeeId,
        extension: r.extension,
        phone: r.phone,
        queue: r.queue,
        callType: "incoming",
        startedAt: t,
        endedAt: end,
        durationSeconds: r.durationSeconds ?? Math.round((end - t) / 1e3),
        complete: true,
        source,
        startKnown: r.precision === "second"
      };
    }, "toCall");
    for (const r of records) {
      if (String(r.status).toLowerCase() !== "success" || r.startMs == null) continue;
      const tolerance = (r.precision === "minute" ? 6e4 : 0) + ((r.waitSeconds || 0) + 120) * 1e3;
      const phone = digits(r.phone);
      const hit = calls.find((c) => !used.has(c) && phone && digits(c.phone) === phone && Math.abs(c.startedAt - r.startMs) <= tolerance);
      if (hit) {
        used.add(hit);
        already++;
        continue;
      }
      const t = r.startMs + (r.waitSeconds || 0) * 1e3, key2 = callKey(r);
      const manual = assignments.get(key2);
      if (manual) {
        recovered.push({ ...toCall(r, manual.employee_id, t, "manual"), assignedBy: manual.decided_by || null });
        assigned.push({ key: key2, index: r.index, time: r.start, at: iso(t), phone: r.phone, extension: r.extension, queue: r.queue, employeeId: manual.employee_id, name: people.get(manual.employee_id)?.name || "", by: manual.decided_by || "", decidedAt: iso(manual.decided_at), note: manual.note || "" });
        continue;
      }
      const owners = r.extension ? sessions.filter((s) => s.extension === r.extension && s.workStartedAt != null && s.workStartedAt - 6e4 <= t && t <= (s.running ? Infinity : Date.parse(s.observedThrough) + GAP_MS2)) : [];
      let who = [...new Set(owners.map((s) => s.employeeId))];
      if (!who.length && r.extension) {
        const on2 = sessions.filter((s) => s.extension === r.extension && s.workStartedAt != null);
        const before = on2.filter((s) => Date.parse(s.observedThrough) <= t && t - Date.parse(s.observedThrough) <= 18e5).sort((a, b) => Date.parse(b.observedThrough) - Date.parse(a.observedThrough))[0];
        const after = on2.filter((s) => s.workStartedAt >= t && s.workStartedAt - t <= 18e5).sort((a, b) => a.workStartedAt - b.workStartedAt)[0];
        if (before && after && before.employeeId === after.employeeId) who = [before.employeeId];
      }
      if (who.length === 1) recovered.push(toCall(r, who[0], t, "history"));
      else unattributed.push({ key: key2, index: r.index, time: r.start, at: t, phone: r.phone, extension: r.extension, queue: r.queue, owners: who, reason: !r.extension ? "no_extension" : who.length ? "several_employees" : "nobody_on_extension" });
    }
    suggest(unattributed, sessions, states, [...calls, ...recovered], assigned, people);
    for (const u of unattributed) {
      u.at = iso(u.at);
      delete u.owners;
    }
    return { recovered, unattributed, assigned, summary: { alreadySeen: already, recovered: recovered.length, unattributed: unattributed.length, assigned: assigned.length } };
  }
  __name(matchHistory, "matchHistory");
  const span = /* @__PURE__ */ __name((v) => {
    const lo = Math.min(...v), hi = Math.max(...v);
    return lo === hi ? lo + " \u062F" : lo + "\u2013" + hi + " \u062F";
  }, "span");
  const reasonText = /* @__PURE__ */ __name(([k, v]) => ({
    owner: "\u0643\u0627\u0646 \u0645\u0633\u062C\u0644 \u0639\u0644\u0649 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u062F\u064A \u0648\u0642\u062A\u0647\u0627",
    before: "\u0643\u0627\u0646 \u0639\u0644\u0649 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u062F\u064A \u0642\u0628\u0644\u0647\u0627 \u0628\u0640 " + (v.length ? span(v) : ""),
    after: "\u062F\u062E\u0644 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u062F\u064A \u0628\u0639\u062F\u0647\u0627 \u0628\u0640 " + (v.length ? span(v) : ""),
    sameDay: "\u0627\u0634\u062A\u063A\u0644 \u0639\u0644\u0649 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u062F\u064A \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647",
    gap: "\u0643\u0627\u0646 \u0639\u0646\u062F\u0647 \u0627\u0646\u0642\u0637\u0627\u0639 \u0631\u0635\u062F \u0648\u0642\u062A\u0647\u0627",
    out: "\u0643\u0627\u0646 \u0628\u0631\u0651\u0647 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u0641\u064A \u0627\u0644\u0645\u0631\u0635\u062F \u0648\u0642\u062A\u0647\u0627",
    past: "\u0627\u062A\u0646\u0633\u0628\u0644\u0647 " + Math.max(0, ...v) + " \u0645\u0643\u0627\u0644\u0645\u0629 \u0642\u0628\u0644 \u0643\u062F\u0647 \u0639\u0644\u0649 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u062F\u064A"
  })[k], "reasonText");
  function suggest(list, sessions, states, calls, assigned, people) {
    const worked = sessions.filter((s) => s.workStartedAt != null);
    const ids = [...new Set(worked.map((s) => s.employeeId))];
    const min = /* @__PURE__ */ __name((ms) => Math.round(ms / 6e4), "min");
    const scoreOne = /* @__PURE__ */ __name((u, id2) => {
      const t = u.at, mine = worked.filter((s) => s.employeeId === id2), reasons = [];
      const busy = states.find((x) => x.employeeId === id2 && ["ready", "on_call", "break"].includes(x.state) && Date.parse(x.startedAt) <= t && t < Date.parse(x.endedAt) && x.extension !== u.extension);
      if (busy || calls.some((c) => c.employeeId === id2 && c.extension !== u.extension && c.startedAt - 5e3 <= t && t <= (c.endedAt ?? c.startedAt) + 5e3)) return null;
      let score = 0;
      if (u.owners.includes(id2)) {
        score += 60;
        reasons.push(["owner"]);
      }
      const onExt = mine.filter((s) => s.extension === u.extension);
      const before = onExt.filter((s) => Date.parse(s.observedThrough) <= t).sort((a, b) => Date.parse(b.observedThrough) - Date.parse(a.observedThrough))[0];
      const after = onExt.filter((s) => s.workStartedAt >= t).sort((a, b) => a.workStartedAt - b.workStartedAt)[0];
      const gb = before ? t - Date.parse(before.observedThrough) : null, ga = after ? after.workStartedAt - t : null;
      if (gb != null && gb <= 72e5) {
        score += Math.max(10, 50 - min(gb) / 2);
        reasons.push(["before", min(gb)]);
      }
      if (ga != null && ga <= 72e5) {
        score += Math.max(8, 40 - min(ga) / 2);
        reasons.push(["after", min(ga)]);
      }
      if (gb != null && ga != null && gb <= 72e5 && ga <= 72e5) score += 30;
      if (!score && onExt.length) {
        score += 12;
        reasons.push(["sameDay"]);
      }
      const out = states.find((x) => x.employeeId === id2 && ["offline", "unknown"].includes(x.state) && Date.parse(x.startedAt) <= t && t < Date.parse(x.endedAt));
      if (out) {
        score += out.state === "unknown" ? 15 : 20;
        reasons.push([out.state === "unknown" ? "gap" : "out"]);
      }
      const past = assigned.filter((a) => a.employeeId === id2 && a.extension === u.extension).length;
      if (past) {
        score += 25;
        reasons.push(["past", past]);
      }
      return score > 0 ? { score, reasons } : null;
    }, "scoreOne");
    const sorted = [...list].sort((a, b) => a.at - b.at);
    let group3 = 0;
    for (let i = 0; i < sorted.length; i++) {
      const u = sorted[i], prev = sorted[i - 1];
      u.group = prev && prev.extension && prev.extension === u.extension && u.at - prev.at <= 18e5 ? prev.group : ++group3;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const u of sorted) {
      if (!groups.has(u.group)) groups.set(u.group, []);
      groups.get(u.group).push(u);
    }
    for (const items of groups.values()) {
      const totals = /* @__PURE__ */ new Map();
      for (const u of items) for (const id2 of ids) {
        const r = scoreOne(u, id2);
        if (r === null) {
          if (!totals.has(id2)) totals.set(id2, { score: 0, reasons: /* @__PURE__ */ new Map(), blocked: 0 });
          totals.get(id2).blocked++;
          continue;
        }
        if (!totals.has(id2)) totals.set(id2, { score: 0, reasons: /* @__PURE__ */ new Map(), blocked: 0 });
        const x = totals.get(id2);
        x.score += r.score;
        for (const [k, v] of r.reasons) {
          if (!x.reasons.has(k)) x.reasons.set(k, []);
          if (v != null) x.reasons.get(k).push(v);
        }
      }
      const ranked = [...totals.entries()].filter(([, x]) => x.score > 0 && x.blocked < items.length).map(([id2, x]) => ({ employeeId: id2, name: people.get(id2)?.name || "", score: Math.round(x.score / items.length), reasons: [...x.reasons].map(reasonText).slice(0, 3), conflicts: x.blocked })).sort((a, b) => b.score - a.score).slice(0, 3);
      const top = ranked[0], second = ranked[1];
      const confidence = !top ? "none" : top.score >= 60 && (!second || top.score >= second.score * 1.6) && !top.conflicts ? "high" : top.score >= 30 ? "medium" : "low";
      for (const u of items) Object.assign(u, { groupSize: items.length, groupKeys: items.map((x) => x.key), groupFrom: items[0].time, groupTo: items.at(-1).time, suggestions: ranked, confidence });
    }
  }
  __name(suggest, "suggest");
  function stateAt(states, sessions, employeeId, t) {
    const s = states.find((x) => x.employeeId === employeeId && x.state !== "offline" && Date.parse(x.startedAt) <= t && t < Date.parse(x.endedAt));
    if (s) return { state: s.state, since: s.startedAt, extension: s.extension };
    const inShift = sessions.find((x) => x.employeeId === employeeId && x.workStartedAt != null && x.workStartedAt <= t && t <= Date.parse(x.observedThrough) + GAP_MS2);
    if (inShift) return { state: "unknown", since: null, extension: inShift.extension };
    const left = sessions.filter((x) => x.employeeId === employeeId && x.workStartedAt != null && Date.parse(x.observedThrough) < t).sort((a, b) => Date.parse(b.observedThrough) - Date.parse(a.observedThrough))[0];
    if (left) {
      const kind = outKind(left.reason);
      return { state: left.decision?.action === "include" ? "left_responsible" : left.decision?.action === "exclude" ? "shift_ended" : kind === "gap" ? "disconnected" : "out_" + kind, since: left.observedThrough, extension: left.extension };
    }
    return { state: "not_started", since: null, extension: "" };
  }
  __name(stateAt, "stateAt");
  app2.missedContext = /* @__PURE__ */ __name(async function missedContext(date, index, now = app2.now()) {
    const d = await day(date, now), r = d.raw.records[index];
    if (!r || String(r.status).toLowerCase() !== "abandoned") return null;
    const entry = r.startMs, exit2 = r.endMs ?? (r.startMs != null && r.waitSeconds != null ? r.startMs + r.waitSeconds * 1e3 : null);
    if (entry == null) return { call: r, employees: [], note: "\u0648\u0642\u062A \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0627\u0644\u0633\u062C\u0644" };
    const slack = r.precision === "minute" ? 59e3 : 0, people = await names();
    const ids = [...new Set(d.sessions.filter((s) => s.workStartedAt != null).map((s) => s.employeeId))];
    const employees = ids.map((id2) => {
      const a = stateAt(d.states, d.sessions, id2, entry), b = stateAt(d.states, d.sessions, id2, exit2 ?? entry);
      const readyDuring = d.states.find((s) => s.employeeId === id2 && s.state === "ready" && Date.parse(s.startedAt) < (exit2 ?? entry) + slack && Date.parse(s.endedAt) > entry - slack);
      const changed = slack && d.states.some((s) => s.employeeId === id2 && Date.parse(s.startedAt) > entry - slack && Date.parse(s.startedAt) < entry + slack);
      return {
        employeeId: id2,
        name: people.get(id2)?.name || "",
        atEntry: a.state,
        atExit: b.state,
        extension: a.extension || b.extension,
        since: a.since,
        sinceSeconds: a.since ? Math.round((entry - Date.parse(a.since)) / 1e3) : null,
        readyDuringWait: !!readyDuring,
        readyAt: readyDuring ? iso(Math.max(Date.parse(readyDuring.startedAt), entry)) : null,
        uncertain: !!changed
      };
    }).filter((e) => !["not_started"].includes(e.atEntry) || !["not_started"].includes(e.atExit)).sort((x, y) => Number(y.readyDuringWait) - Number(x.readyDuringWait) || x.name.localeCompare(y.name, "ar"));
    return { call: {
      index,
      date: r.date,
      start: r.start,
      end: r.end,
      phone: r.phone,
      queue: r.queue,
      queueLabel: queueLabel(r.queue),
      waitSeconds: r.waitSeconds,
      precision: r.precision,
      enteredAt: iso(entry),
      leftAt: iso(exit2)
    }, employees, readyCount: employees.filter((e) => e.readyDuringWait).length };
  }, "missedContext");
  app2.waitContext = /* @__PURE__ */ __name(async function waitContext(entry, exit2, now = app2.now()) {
    const d = await day(businessDay(entry), now), people = await names();
    const ids = [...new Set(d.sessions.filter((s) => s.workStartedAt != null).map((s) => s.employeeId))];
    return ids.map((id2) => {
      const a = stateAt(d.states, d.sessions, id2, entry);
      const readyDuring = d.states.some((s) => s.employeeId === id2 && s.state === "ready" && Date.parse(s.startedAt) < exit2 && Date.parse(s.endedAt) > entry);
      return { employeeId: id2, name: people.get(id2)?.name || "", atEntry: a.state, extension: a.extension, readyDuringWait: readyDuring };
    }).filter((e) => e.readyDuringWait || !["not_started", "shift_ended"].includes(e.atEntry)).sort((x, y) => x.name.localeCompare(y.name, "ar"));
  }, "waitContext");
  const PULSE_CODE = { ready: "r", on_call: "c", break: "b", unknown: "u", disconnected: "u", not_started: "-", shift_ended: "-" };
  app2.pulse = /* @__PURE__ */ __name(async function pulse(now = app2.now(), minutes = 180) {
    const date = businessDay(now), w = dayWindow(date), step = 6e4;
    const to = Math.floor(Math.min(now, w.end) / step) * step, from = Math.max(w.start, to - (Math.max(10, Math.min(360, minutes)) - 1) * step);
    const [d, people, samples] = await Promise.all([
      day(date, now),
      names(),
      db.prepare("SELECT observed_at, waiting, longest_wait FROM live_snapshots WHERE observed_at >= ? AND observed_at <= ? ORDER BY observed_at").all(from, to + step)
    ]);
    const ids = [...new Set(d.sessions.filter((s) => s.workStartedAt != null).map((s) => s.employeeId))];
    const times = [];
    for (let t = from; t <= to; t += step) times.push(t);
    const people2 = ids.map((id2) => {
      const st = d.states.filter((s) => s.employeeId === id2), ses = d.sessions.filter((s) => s.employeeId === id2);
      return { employeeId: id2, name: people.get(id2)?.name || "", s: times.map((t) => PULSE_CODE[stateAt(st, ses, id2, t).state] || "o").join("") };
    }).filter((p) => /[rcbu]/.test(p.s)).sort((x, y) => x.name.localeCompare(y.name, "ar"));
    const queue = times.map((t) => {
      const q = samples.filter((x) => x.observed_at >= t && x.observed_at < t + step);
      return q.length ? [Math.max(...q.map((x) => x.waiting)), Math.max(...q.map((x) => x.longest_wait ?? 0))] : null;
    });
    const missed = d.history.missed.map((m) => ({ ...m, at: d.raw.records[m.index]?.startMs ?? null })).filter((m) => m.at != null && m.at >= from && m.at < to + step && m.classification === "counted").map((m) => ({ index: m.index, at: iso(m.at), phone: m.phone, queue: m.queueLabel, waitSeconds: m.waitSeconds }));
    return { date, from: iso(from), step: 60, count: times.length, people: people2, queue, missed, serverNow: iso(now) };
  }, "pulse");
  const LIVE_WINDOW_MS = 4 * 36e5;
  app2.live = /* @__PURE__ */ __name(async function live(now = app2.now()) {
    const today = businessDay(now), w = dayWindow(today);
    const latestSql = "SELECT s.*, (SELECT d.action FROM shift_decisions d WHERE d.session_id = s.id ORDER BY d.id DESC LIMIT 1) AS shift_decision FROM employee_sessions s WHERE s.id = (SELECT id FROM employee_sessions x WHERE x.employee_id = s.employee_id ORDER BY issued_at DESC, id DESC LIMIT 1)";
    const [people, latest] = await Promise.all([names(), db.prepare(latestSql).all()]);
    const wanted = latest.filter((s) => (s.revoked_at ?? s.expires_at) >= w.start), from = new Map(wanted.map((s) => [s.id, Math.max(s.issued_at, now - LIVE_WINDOW_MS)]));
    const chunks = [];
    for (let i = 0; i < wanted.length; i += 40) chunks.push(wanted.slice(i, i + 40));
    const recentRows = (await Promise.all(chunks.map((part) => db.prepare("SELECT * FROM events WHERE session_id IN (" + part.map(() => "?").join(",") + ") AND occurred_at >= ? ORDER BY occurred_at, id").all(...part.map((s) => s.id), Math.min(...part.map((s) => from.get(s.id))))))).flat().filter((e) => e.occurred_at >= from.get(e.session_id));
    const recent = bySession(recentRows);
    const out = [];
    for (const [id2, e] of people) {
      if (!e.active || e.deleted_at) continue;
      const s = latest.find((x) => x.employee_id === id2);
      const base = { employeeId: id2, name: e.name, extension: s?.extension || "", state: "no_session", since: null, phone: "", queue: "", callId: "", lastEvidence: null };
      if (!s || (s.revoked_at ?? s.expires_at) < w.start && s.issued_at < w.start) {
        out.push(base);
        continue;
      }
      const open = !s.revoked_at && s.expires_at > now;
      const events = recent.get(s.id) || [], sp = spansOf(s, events), last = sp.at(-1);
      const lastAt = events.length ? events.at(-1).occurred_at : s.issued_at;
      if (!open && s.shift_decision === "exclude") {
        out.push({ ...base, state: "shift_ended", reason: s.revoke_reason || null, since: iso(s.revoked_at ?? s.expires_at), lastEvidence: iso(lastAt) });
        continue;
      }
      if (!open) {
        const kind = outKind(s.revoke_reason);
        out.push({ ...base, state: kind === "gap" ? "disconnected" : "logged_out", outKind: kind, reason: s.revoke_reason || null, since: iso(s.revoked_at ?? s.expires_at), lastEvidence: iso(lastAt) });
        continue;
      }
      if (!numeric2(s.extension)) {
        out.push({ ...base, state: "logged_in", since: iso(s.issued_at), lastEvidence: iso(lastAt) });
        continue;
      }
      if (!last || now - last.lastEvidence >= GAP_MS2) {
        out.push({ ...base, state: "unknown", since: iso(last ? last.lastEvidence : s.issued_at), lastEvidence: iso(lastAt) });
        continue;
      }
      let since = last.started;
      for (let i = sp.length - 2; i >= 0 && sp[i].state === last.state && since - sp[i].lastEvidence < GAP_MS2 * 20 && ["break", "on_call"].includes(last.state); i--) since = sp[i].started;
      const call = last.state === "on_call" ? callsOf(s, events).filter((c) => !c.complete).at(-1) : null;
      if (call?.startedAt && call.startedAt < since) since = call.startedAt;
      out.push({ ...base, state: last.state, since: iso(since), phone: call?.phone || "", queue: call?.queue || "", callId: call?.callId || "", lastEvidence: iso(lastAt) });
    }
    return out;
  }, "live");
  app2.breakPolicy = /* @__PURE__ */ __name(async function breakPolicy(employeeId, now = app2.now()) {
    const w = dayWindow(businessDay(now)), until = Math.min(now, w.operatingEnd);
    const [events, perms] = await Promise.all([
      db.prepare(`SELECT * FROM events WHERE employee_id = ? AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at, id`).all(employeeId, w.start, until),
      db.prepare("SELECT id FROM break_permissions WHERE employee_id = ? AND request_id IS NOT NULL AND created_at >= ?").all(employeeId, w.start - 36e5)
    ]);
    const approved = new Set(perms.map((p) => p.id));
    const periods = [];
    let open = null, lastBreakSign = null;
    const close = /* @__PURE__ */ __name((at) => {
      periods.push({ ...open, seconds: Math.max(0, Math.round((at - open.at) / 1e3)) });
      open = null;
    }, "close");
    for (const e of events) {
      if (e.event_type === "break_start" || e.event_type === "break_observed") {
        if (open) close(lastBreakSign ?? e.occurred_at);
        let p = {};
        try {
          p = JSON.parse(e.extra || e.payload || "{}");
        } catch {
        }
        open = { at: e.occurred_at, estimated: e.event_type === "break_observed", approved: p.breakPolicyKind === "approved" || approved.has(p.breakPermissionId || p.permissionId) };
      } else if (open && (e.event_type === "break_end" || e.event_type === "break_end_unknown" || ["ready", "on_call", "logged_in"].includes(stateOf(e)) || KNOWN_CLOSE.has(e.event_type))) close(e.occurred_at);
      else if (open && stateOf(e) === "break") lastBreakSign = e.occurred_at;
      if (open && (e.event_type === "break_start" || e.event_type === "break_observed")) lastBreakSign = e.occurred_at;
    }
    if (open && lastBreakSign != null && until - lastBreakSign > GAP_MS2) close(lastBreakSign + GAP_MS2);
    if (open) periods.push({ ...open, seconds: Math.round((until - open.at) / 1e3), running: true });
    const regular = periods.filter((p) => !p.approved).map((p) => ({ ...p, seconds: p.estimated ? Math.max(p.seconds, RULES.breakPeriodSeconds) : p.seconds }));
    const used = regular.reduce((n, p) => n + p.seconds, 0), remaining = Math.max(0, RULES.breakBudgetSeconds - used), starts = regular.length;
    const next = starts === 0 ? Math.min(RULES.breakPeriodSeconds + RULES.breakGraceSeconds, remaining) : starts === 1 ? remaining : 0;
    const regularAvailable = now < w.operatingEnd && starts < 2 && next > 0 && !regular.some((p) => p.running);
    return {
      startsUsed: starts,
      usedSeconds: used,
      remainingSeconds: remaining,
      nextAllowedSeconds: regularAvailable ? next : 0,
      secondRemainingSeconds: starts <= 1 ? remaining : 0,
      regularAvailable,
      requiresApproval: !regularAvailable,
      graceSeconds: starts === 0 ? RULES.breakGraceSeconds : 0,
      estimated: regular.some((p) => p.estimated),
      activeRegular: regular.some((p) => p.running)
    };
  }, "breakPolicy");
  app2.sessionReady = /* @__PURE__ */ __name(async function sessionReady(session, now = app2.now()) {
    const sp = spansOf(session, await db.prepare("SELECT * FROM events WHERE session_id = ? AND occurred_at >= ? ORDER BY occurred_at, id").all(session.id, now - 36e5)), last = sp.at(-1);
    return !!last && last.state === "ready" && now - last.lastEvidence <= 15e3;
  }, "sessionReady");
  app2.day = day;
}
__name(setup9, "setup");

// ../sites/lib/marsad/telegram.js
var telegram_exports = {};
__export(telegram_exports, {
  RULE_LIST: () => RULE_LIST,
  setup: () => setup10
});

// ../sites/lib/marsad/branch-message.js
function branchMessage(text) {
  return String(text || "").split(/\r?\n/).flatMap((line) => {
    if (/^\s*(?:[👤🕒⏰]\s*)?(?:اللي ضرب(?: الأوردر|هم)?|ضربه|وقت (?:ضرب|إدخال) الأوردر|موظف الإدخال|entered by|entry time)\s*[:：]?/iu.test(line)) return [];
    if (/^\s*اتضرب الساعة\s/u.test(line)) {
      const duration = /(?:و)?بقاله\s+[^،\n]+/u.exec(line);
      return duration ? [duration[0].replace(/^و/, "")] : [];
    }
    if (/^\s*رقمه على Apex:/u.test(line)) return [line.replace(/(?:[،·]\s*ضربه|\s+الساعة)\s.*$/u, "").trimEnd()];
    return [line];
  }).join("\n");
}
__name(branchMessage, "branchMessage");

// ../sites/lib/marsad/order-identifiers.js
var id = /* @__PURE__ */ __name((value) => {
  const s = String(value ?? "").trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
  return /^\d+$/.test(s) ? s : "";
}, "id");
var apexReceipt = /* @__PURE__ */ __name((order) => id(order?.sn) || "\u063A\u064A\u0631 \u0645\u062A\u0627\u062D", "apexReceipt");
var talabatReference = /* @__PURE__ */ __name((order) => "\u0631\u0642\u0645 \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A: " + (id(order?.id) || "\u063A\u064A\u0631 \u0645\u062A\u0627\u062D") + "\n\u0647\u0627\u0634\u062A\u0627\u062C \u0637\u0644\u0628\u0627\u062A: " + (id(order?.code) ? "#" + id(order.code) : "\u063A\u064A\u0631 \u0645\u062A\u0627\u062D"), "talabatReference");
function referenceEvidence(order, apex) {
  const source = order.source, expectedKind = { talabat: "\u0637\u0644\u0628\u0627\u062A", site: "\u0627\u0644\u0645\u0648\u0642\u0639" }[source];
  if (!expectedKind) return { exact: false, conflict: false, type: null };
  if (apex.kind && apex.kind !== expectedKind) return { exact: false, conflict: true, type: "source" };
  const refs = apex.sourceRefs?.[source] || {}, pairs = [];
  if (id(refs.orderId)) pairs.push({ type: source === "talabat" ? "talabatOrderId" : "siteOrderId", equal: id(refs.orderId) === id(order.id) });
  return { exact: pairs.some((p) => p.equal), conflict: pairs.some((p) => !p.equal), type: pairs.map((p) => p.type).join(",") || null };
}
__name(referenceEvidence, "referenceEvidence");
function apexAlertText(text, order) {
  if (!order) return text;
  const internal = id(order.no), receipt = apexReceipt(order);
  return String(text).replace(/أوردر\s+(\d+)/gu, (whole, number) => number === internal || number === id(order.sn) ? "\u0623\u0648\u0631\u062F\u0631 Apex " + receipt : whole);
}
__name(apexAlertText, "apexAlertText");
function platformAlertText(text, kind, key2) {
  let value = String(text || "");
  if (!/^talabat|^site/.test(kind || "")) return value;
  value = value.split(/\r?\n/).filter((line) => !/^رقمه على Apex:/u.test(line)).join("\n");
  if (/^talabat/.test(kind || "")) {
    const match = /talabat:(?:notEntered|cancel|items):(\d+)/.exec(String(key2));
    value = value.replace(/رقم أوردر طلبات:\s*#(\d+)/gu, "\u0647\u0627\u0634\u062A\u0627\u062C \u0637\u0644\u0628\u0627\u062A: #$1");
    value = value.replace(/أوردر طلبات #(\d+)/gu, "\u0647\u0627\u0634\u062A\u0627\u062C \u0637\u0644\u0628\u0627\u062A #$1");
    if (match && !new RegExp("\u0631\u0642\u0645 \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A: " + match[1] + "(?:\\D|$)").test(value)) value += "\n\u0631\u0642\u0645 \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A: " + match[1];
    value = value.replace(/— أوردر \d+/gu, "");
  }
  return value;
}
__name(platformAlertText, "platformAlertText");

// ../sites/lib/marsad/telegram.js
var TICK_MS = 5e3;
var WAIT_ALERT_S = 7;
var LATE_ANSWER_S = 7;
var RULE_LIST = {
  waitSla: "\u0639\u0645\u064A\u0644 \u0639\u062F\u0651\u0649 7 \u062B\u0648\u0627\u0646\u064A \u0627\u0646\u062A\u0638\u0627\u0631",
  queueNobody: "\u0639\u0645\u0644\u0627\u0621 \u0645\u0646\u062A\u0638\u0631\u064A\u0646 \u0648\u0645\u0641\u064A\u0634 \u062D\u062F \u0645\u062A\u0627\u062D",
  missed: "\u0645\u0643\u0627\u0644\u0645\u0629 \u0641\u0627\u0626\u062A\u0629 \u2014 \u0648\u0645\u064A\u0646 \u0643\u0627\u0646 \u0645\u062A\u0627\u062D \u0648\u0642\u062A\u0647\u0627",
  longCall: "\u0645\u0643\u0627\u0644\u0645\u0629 \u0639\u062F\u0651\u062A 4 \u062F\u0642\u0627\u064A\u0642",
  breakStart: "\u0628\u062F\u0627\u064A\u0629 \u0628\u0631\u064A\u0643",
  breakWarn: "\u0628\u0627\u0642\u064A \u062F\u0642\u064A\u0642\u0629 \u0639\u0644\u0649 \u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u0628\u0631\u064A\u0643",
  breakOver: "\u0628\u0631\u064A\u0643 \u0639\u062F\u0651\u0649 \u0627\u0644\u0645\u062F\u0629 \u0627\u0644\u0645\u0633\u0645\u0648\u062D\u0629",
  breakBudget: "\u0645\u0648\u0638\u0641 \u062E\u0644\u0651\u0635 \u0627\u0644\u0640 30 \u062F\u0642\u064A\u0642\u0629 \u0628\u0631\u064A\u0643 \u0628\u062A\u0648\u0639 \u0627\u0644\u064A\u0648\u0645",
  breakOverlap: "\u0623\u0643\u062A\u0631 \u0645\u0646 \u0645\u0648\u0638\u0641 \u0641\u064A \u0628\u0631\u064A\u0643 \u0648\u0641\u064A\u0647 \u0639\u0645\u0644\u0627\u0621 \u0645\u0646\u062A\u0638\u0631\u064A\u0646",
  breakRequest: "\u0637\u0644\u0628 \u0628\u0631\u064A\u0643 \u0625\u0636\u0627\u0641\u064A \u0645\u0633\u062A\u0646\u064A \u0645\u0648\u0627\u0641\u0642\u0629",
  notBound: "\u0633\u062C\u0651\u0644 \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0648\u0645\u062F\u062E\u0644\u0634 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u0645\u0646 \u062F\u0642\u064A\u0642\u062A\u064A\u0646",
  logout: "\u062E\u0631\u0648\u062C \u0645\u0648\u0638\u0641: \u0645\u0646 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 / \u0645\u0646 \u0623\u0631\u0627\u0628\u064A\u0643\u0633 / \u0642\u0641\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D (\u0645\u0639 \u0645\u0644\u062E\u0635 \u064A\u0648\u0645\u0647)",
  gap: "\u0627\u0646\u0642\u0637\u0627\u0639 \u0631\u0635\u062F \u0623\u0643\u062A\u0631 \u0645\u0646 3 \u062F\u0642\u0627\u064A\u0642 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0634\u064A\u0641\u062A",
  source: "\u0648\u0642\u0641 \u0623\u0648 \u0631\u062C\u0648\u0639 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631",
  ordersLate: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0623\u0648\u0631\u062F\u0631 \u0645\u0627\u062E\u0631\u062C\u0634 \u0645\u0646 \u0627\u0644\u0641\u0631\u0639 \u0628\u0639\u062F 30 / 45 \u062F\u0642\u064A\u0642\u0629",
  ordersCancel: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0625\u0644\u063A\u0627\u0621 \u0623\u0648\u0631\u062F\u0631",
  ordersDiscount: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u062E\u0635\u0645 \u0643\u0628\u064A\u0631 \u0639\u0644\u0649 \u0623\u0648\u0631\u062F\u0631",
  ordersEntry: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u062E\u0637\u0623 \u0625\u062F\u062E\u0627\u0644 \u0645\u062D\u062A\u0645\u0644 \u0623\u0648 \u0623\u0648\u0631\u062F\u0631 \u0645\u062A\u0643\u0631\u0631",
  ordersEntryLate: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u062A\u0623\u062E\u064A\u0631 \u0636\u0631\u0628 \u0627\u0644\u0623\u0648\u0631\u062F\u0631",
  ordersStale: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0645\u0631\u0635\u062F \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0648\u0627\u0642\u0641 \u0623\u0648 \u0631\u062C\u0639",
  system: "\u0627\u0644\u0633\u064A\u0633\u062A\u0645: \u062C\u0632\u0621 \u0645\u0646 \u0627\u0644\u0645\u0631\u0635\u062F \u0648\u0642\u0641 \u0623\u0648 \u0631\u062C\u0639 (\u0623\u0631\u0627\u0628\u064A\u0643\u0633\u060C \u0634\u0627\u0634\u0627\u062A \u0637\u0644\u0628\u0627\u062A\u060C \u0643\u0627\u062A\u0628 Apex\u060C \u0627\u0644\u0645\u0648\u0642\u0639)",
  siteTransfer: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0623\u0648\u0631\u062F\u0631 \u0645\u0648\u0642\u0639 \u0645\u0627\u062A\u062D\u0648\u0651\u0644\u0634 \u0644\u0644\u0641\u0631\u0639 \u0628\u0639\u062F 5 \u062F\u0642\u0627\u064A\u0642",
  sitePrep: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0623\u0648\u0631\u062F\u0631 \u0645\u0648\u0642\u0639 \u0644\u0633\u0647 \u0628\u064A\u062A\u062C\u0647\u0632 \u0628\u0639\u062F 30 \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0627\u0644\u062A\u062D\u0648\u064A\u0644",
  talabatNotEntered: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A \u0627\u062A\u0642\u0628\u0644 \u0648\u0645\u0627\u062A\u0636\u0631\u0628\u0634 \u0639\u0644\u0649 Apex \u0628\u0639\u062F 10 \u062F\u0642\u0627\u064A\u0642",
  talabatCancel: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0625\u0644\u063A\u0627\u0621 \u0623\u0648\u0631\u062F\u0631 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A (\u0627\u0644\u0648\u0642\u062A \u0648\u0627\u0644\u0633\u0628\u0628)",
  talabatClosed: "\u0637\u0644\u0628\u0627\u062A: \u0641\u0631\u0639 \u0627\u062A\u0642\u0641\u0644 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0623\u0648 \u0631\u062C\u0639 \u0641\u062A\u062D (\u0627\u0644\u0645\u062F\u0629 \u0648\u0627\u0644\u0633\u0628\u0628) \u2014 \u0644\u0644\u0643\u0648\u0644 \u0633\u0646\u062A\u0631",
  talabatEarly: "\u0637\u0644\u0628\u0627\u062A: \u0627\u0644\u0641\u0631\u0639 \u0639\u0645\u0644 \u0627\u0644\u0623\u0648\u0631\u062F\u0631 \xAB\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642\xBB \u0645\u0646 \u0627\u0644\u0645\u0643\u0646\u0629 \u0642\u0628\u0644 \u0645\u0627 \u064A\u062E\u0631\u062C \u0639\u0644\u0649 Apex",
  talabatItems: "\u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A: \u0635\u0646\u0641 \u0645\u0636\u0631\u0648\u0628 \u063A\u0644\u0637 \u0645\u062D\u062A\u0645\u0644 (\u0623\u0635\u0646\u0627\u0641 \u0637\u0644\u0628\u0627\u062A \u0645\u0634 \u0632\u064A Apex)",
  transferFailed: "\u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0622\u0644\u064A: \u0623\u0648\u0631\u062F\u0631 \u0645\u0627\u062A\u0633\u062C\u0644\u0634 \u0639\u0644\u0649 Apex \u0623\u0648 \u0645\u0633\u062A\u0646\u064A (\u0633\u062C\u0651\u0644\u0647 \u0628\u0625\u064A\u062F\u0643)"
};
var RECOVERY_LABELS = {
  breakStart: "\u0631\u062C\u0639 \u0645\u0646 \u0627\u0644\u0628\u0631\u064A\u0643",
  breakOver: "\u0631\u062C\u0639 \u0645\u0646 \u0627\u0644\u0628\u0631\u064A\u0643",
  longCall: "\u062E\u0644\u0651\u0635 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 \u0627\u0644\u0637\u0648\u064A\u0644\u0629",
  gap: "\u0631\u062C\u0639 \u0627\u0644\u0631\u0635\u062F",
  breakRequest: "\u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0637\u0644\u0628 \u0627\u0644\u0628\u0631\u064A\u0643",
  queueNobody: "\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631",
  logout: "\u0631\u062C\u0639 \u0644\u0644\u0634\u063A\u0644",
  waitSla: "\u0627\u0644\u0639\u0645\u064A\u0644 \u062E\u0631\u062C \u0645\u0646 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631: \u0627\u062A\u0631\u062F \u0639\u0644\u064A\u0647 \u0623\u0648 \u0644\u0627",
  waitConfirm: "\u062A\u0623\u0643\u064A\u062F \u0633\u062C\u0644 \u0623\u0631\u0627\u0628\u064A\u0643\u0633",
  source: "\u0631\u062C\u0639\u062A \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631",
  notBound: "\u062F\u062E\u0644 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629"
};
var OUT_TEXT = { arabicss: "\u062E\u0631\u062C \u0645\u0646 \u0623\u0631\u0627\u0628\u064A\u0643\u0633", extension: "\u0633\u062C\u0651\u0644 \u062E\u0631\u0648\u062C \u0645\u0646 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629", browser: "\u0642\u0641\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0623\u0648 \u0635\u0641\u062D\u0629 \u0623\u0631\u0627\u0628\u064A\u0643\u0633" };
var mask = /* @__PURE__ */ __name((phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length > 4 ? "\u2022\u2022\u2022\u2022" + d.slice(-4) : d || "\u0631\u0642\u0645 \u063A\u064A\u0631 \u0638\u0627\u0647\u0631";
}, "mask");
var DEFAULT_RULES = Object.fromEntries(Object.keys(RULE_LIST).map((k) => [k, true]));
var fmt = /* @__PURE__ */ __name((s) => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + " \u062F" + (s % 60 ? " " + s % 60 + " \u062B" : "");
}, "fmt");
var clock = /* @__PURE__ */ __name((ms) => new Date(ms).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }), "clock");
function setup10(app2) {
  const { db, fail: fail2 } = app2;
  const API = (app2.config.telegramApi || "https://api.telegram.org").replace(/\/$/, "");
  let key2 = null;
  const aes = /* @__PURE__ */ __name(() => key2 ??= crypto.subtle.importKey("raw", sha256Bytes("telegram:" + app2.config.secret), "AES-GCM", false, ["encrypt", "decrypt"]), "aes");
  const seal = /* @__PURE__ */ __name(async (text) => {
    const iv = randomBytes(12);
    return b64(iv) + "." + b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(), new TextEncoder().encode(text))));
  }, "seal");
  const open = /* @__PURE__ */ __name(async (sealed) => {
    try {
      const [iv, data] = sealed.split(".").map(fromB64);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aes(), data));
    } catch {
      return null;
    }
  }, "open");
  const config2 = /* @__PURE__ */ __name(async () => {
    const c = await db.prepare("SELECT * FROM telegram_config WHERE id = 1").get();
    const online = Object.fromEntries((await db.prepare("SELECT key, value FROM settings WHERE key IN ('telegram_online_chat_id','telegram_online_chat_title')").all()).map((r) => [r.key.replace("telegram_", ""), r.value]));
    return c ? { ...c, ...online, token: c.bot_token ? await open(c.bot_token) : null, rules: { ...DEFAULT_RULES, ...JSON.parse(c.rules || "{}") } } : { token: null, rules: DEFAULT_RULES, enabled: 0 };
  }, "config");
  const save = /* @__PURE__ */ __name((fields) => {
    const keys = Object.keys(fields);
    return db.batch([
      db.prepare("INSERT OR IGNORE INTO telegram_config (id, rules) VALUES (1, ?)").bind(JSON.stringify(DEFAULT_RULES)),
      db.prepare("UPDATE telegram_config SET " + keys.map((k) => k + " = ?").join(", ") + ", updated_at = ? WHERE id = 1").bind(...keys.map((k) => fields[k]), app2.now())
    ]);
  }, "save");
  async function call(method, body, token) {
    token ??= (await config2()).token;
    if (!token) fail2(400, "\u0627\u0631\u0628\u0637 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0623\u0648\u0644");
    const r = await fetch(API + "/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15e3) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) {
      const e = Error(d.description || "\u062A\u0644\u064A\u062C\u0631\u0627\u0645 \u0631\u0641\u0636 \u0627\u0644\u0637\u0644\u0628");
      e.status = r.status;
      e.definitiveRejection = d.ok === false;
      throw e;
    }
    if (method === "sendMessage" && !d.result?.message_id) throw Error("delivery_unconfirmed");
    return d.result;
  }
  __name(call, "call");
  app2.route("GET", "/api/telegram", async (ctx) => {
    await app2.requireAdmin(ctx, "admin");
    const c = await config2();
    if (ctx.query.log === "1") {
      const w = dayWindow(ctx.query.date || businessDay(ctx.now));
      return { log: (await db.prepare("SELECT * FROM telegram_log WHERE created_at >= ? AND created_at < ? AND IFNULL(error, '') <> 'routed:branch' ORDER BY created_at DESC LIMIT 500").all(w.start, w.end)).map((r) => ({ kind: r.kind, group: r.target?.startsWith("branch:") ? "\u0641\u0631\u0639 " + r.target.slice(7) : r.target === "branches" ? "\u0627\u0644\u0641\u0631\u0648\u0639" : r.target === "online" || r.kind.startsWith("orders") && !["ordersLate", "ordersLate:resolved"].includes(r.kind) ? "\u0627\u0644\u0623\u0648\u0646\u0644\u0627\u064A\u0646 \u0648\u0636\u0631\u0628 \u0627\u0644\u0623\u0648\u0631\u062F\u0631" : "\u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0627\u062A", label: RULE_LIST[r.kind] || RECOVERY_LABELS[r.kind.replace(":resolved", "")] || r.kind, text: r.text, createdAt: iso(r.created_at), sentAt: iso(r.sent_at), error: r.sent_at ? null : r.error })) };
    }
    return {
      configured: !!c.token,
      botName: c.bot_name || null,
      chat: c.chat_id ? { id: c.chat_id, title: c.chat_title } : null,
      onlineChat: c.online_chat_id ? { id: c.online_chat_id, title: c.online_chat_title } : null,
      branchChat: c.branch_chat_id ? { id: c.branch_chat_id, title: c.branch_chat_title } : null,
      enabled: !!c.enabled,
      rules: Object.entries(RULE_LIST).map(([key3, label]) => ({ key: key3, label, on: !!c.rules[key3] })),
      branchGroups: await branchGroups(),
      branchNames: await apexBranches()
    };
  });
  app2.route("POST", "/api/telegram", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin"), b = ctx.body;
    if (b.action === "token") {
      const token = String(b.token || "").trim();
      if (!/^\d+:[\w-]{30,}$/.test(token)) fail2(400, "\u0634\u0643\u0644 \u0627\u0644\u062A\u0648\u0643\u0646 \u0645\u0634 \u0635\u062D\u064A\u062D\u061B \u0627\u0646\u0633\u062E\u0647 \u0645\u0646 BotFather");
      let me;
      try {
        me = await call("getMe", {}, token);
      } catch (e) {
        fail2(400, "\u062A\u0644\u064A\u062C\u0631\u0627\u0645 \u0631\u0641\u0636 \u0627\u0644\u062A\u0648\u0643\u0646: " + e.message);
      }
      await save({ bot_token: await seal(token), bot_name: me.username || me.first_name || "", chat_id: null, chat_title: null, enabled: 0 });
      await app2.audit("telegram_bot_linked", null, { actor: who.name, bot: me.username });
      return { ok: true, botName: me.username };
    }
    if (b.action === "discover") {
      let updates;
      try {
        updates = await call("getUpdates", { allowed_updates: ["message", "my_chat_member"] });
      } catch (e) {
        fail2(400, e.message);
      }
      const chats = /* @__PURE__ */ new Map();
      for (const u of updates) {
        const c = u.message?.chat || u.my_chat_member?.chat;
        if (c && c.type !== "private") chats.set(String(c.id), { id: String(c.id), title: c.title || c.username || String(c.id), type: c.type });
      }
      return { chats: [...chats.values()] };
    }
    if (b.action === "chat") {
      const chatId = String(b.chatId || "");
      if (!/^-?\d+$/.test(chatId)) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u062C\u0631\u0648\u0628");
      if (b.target === "branch") {
        const name = String(b.branch || "").trim().slice(0, 80);
        if (!name) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0641\u0631\u0639");
        try {
          await call("sendMessage", { chat_id: chatId, text: "\u2705 \u0645\u0631\u0635\u062F \u0627\u0644\u062F\u0647\u0627\u0646 \u0627\u062A\u0631\u0628\u0637 \u0628\u0627\u0644\u062C\u0631\u0648\u0628 \u062F\u0647 \u0643\u062C\u0631\u0648\u0628 \u0641\u0631\u0639 " + name + ": \u062A\u0623\u062E\u064A\u0631 \u062E\u0631\u0648\u062C \u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0627\u0644\u0641\u0631\u0639 \u0648\u0625\u0644\u063A\u0627\u0621\u0627\u062A\u0647 \u0647\u062A\u0648\u0635\u0644 \u0647\u0646\u0627." });
        } catch (e) {
          fail2(400, "\u0645\u0642\u062F\u0631\u062A\u0634 \u0623\u0628\u0639\u062A \u0644\u0644\u062C\u0631\u0648\u0628: " + e.message);
        }
        const g = await branchGroups();
        g[name] = { id: chatId, title: String(b.title || "").slice(0, 100) };
        await putSetting("telegram_branch_groups", JSON.stringify(g));
        await app2.audit("telegram_group_linked", null, { actor: who.name, chat: b.title, branch: name });
        return { ok: true };
      }
      const branches = b.target === "branches", online = b.target === "online";
      try {
        await call("sendMessage", { chat_id: chatId, text: branches ? "\u2705 \u0645\u0631\u0635\u062F \u0627\u0644\u062F\u0647\u0627\u0646 \u0627\u062A\u0631\u0628\u0637 \u0628\u0627\u0644\u062C\u0631\u0648\u0628 \u062F\u0647 \u0643\u062C\u0631\u0648\u0628 \u0625\u062F\u0627\u0631\u0627\u062A \u0627\u0644\u0641\u0631\u0648\u0639: \u062A\u0623\u062E\u064A\u0631 \u062E\u0631\u0648\u062C \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0648\u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0641\u0631\u0648\u0639 \u0647\u062A\u0648\u0635\u0644 \u0647\u0646\u0627." : online ? "\u2705 \u0645\u0631\u0635\u062F \u0627\u0644\u062F\u0647\u0627\u0646 \u0627\u062A\u0631\u0628\u0637 \u0628\u0627\u0644\u062C\u0631\u0648\u0628 \u062F\u0647: \u062C\u0631\u0648\u0628 \u0627\u0644\u0623\u0648\u0646\u0644\u0627\u064A\u0646 \u0648\u0636\u0631\u0628 \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0648\u0623\u062E\u0637\u0627\u0626\u0647\u0627 \u0648\u062A\u0623\u062E\u064A\u0631\u0647\u0627 \u0648\u062A\u063A\u064A\u0651\u0631 \u062D\u0627\u0644\u062A\u0647\u0627." : "\u2705 \u0645\u0631\u0635\u062F \u0627\u0644\u062F\u0647\u0627\u0646 \u0627\u062A\u0631\u0628\u0637 \u0628\u0627\u0644\u062C\u0631\u0648\u0628 \u062F\u0647: \u062C\u0631\u0648\u0628 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0627\u062A \u0648\u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u0648\u062A\u063A\u064A\u0651\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A." });
      } catch (e) {
        fail2(400, "\u0645\u0642\u062F\u0631\u062A\u0634 \u0623\u0628\u0639\u062A \u0644\u0644\u062C\u0631\u0648\u0628: " + e.message);
      }
      if (branches) await save({ branch_chat_id: chatId, branch_chat_title: String(b.title || "").slice(0, 100) });
      else if (online) {
        await db.batch([["telegram_online_chat_id", chatId], ["telegram_online_chat_title", String(b.title || "").slice(0, 100)]].map(([k, v]) => db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, v)));
      } else await save({ chat_id: chatId, chat_title: String(b.title || "").slice(0, 100), enabled: 1 });
      await app2.audit("telegram_group_linked", null, { actor: who.name, chat: b.title });
      return { ok: true };
    }
    if (b.action === "settings") {
      const rules = Object.fromEntries(Object.keys(RULE_LIST).map((k) => [k, !!b.rules?.[k]]));
      await save({ enabled: b.enabled ? 1 : 0, rules: JSON.stringify(rules) });
      await app2.audit("telegram_settings", null, { actor: who.name, enabled: !!b.enabled, rules });
      return { ok: true };
    }
    if (b.action === "test") {
      const c = await config2(), chat = b.target === "branch" ? (await branchGroups())[String(b.branch || "")]?.id : b.target === "branches" ? c.branch_chat_id : b.target === "online" ? c.online_chat_id : c.chat_id;
      if (!chat) fail2(400, "\u0627\u0631\u0628\u0637 \u0627\u0644\u062C\u0631\u0648\u0628 \u0627\u0644\u0623\u0648\u0644");
      await call("sendMessage", { chat_id: chat, text: "\u{1F514} \u0631\u0633\u0627\u0644\u0629 \u062A\u062C\u0631\u0628\u0629 \u0645\u0646 \u0645\u0631\u0635\u062F \u0627\u0644\u062F\u0647\u0627\u0646 \u2014 " + clock(ctx.now) });
      return { ok: true };
    }
    if (b.action === "unlinkOnline") {
      await db.prepare("DELETE FROM settings WHERE key IN ('telegram_online_chat_id','telegram_online_chat_title')").run();
      return { ok: true };
    }
    if (b.action === "unlinkBranches") {
      await save({ branch_chat_id: null, branch_chat_title: null });
      return { ok: true };
    }
    if (b.action === "unlinkBranch") {
      const g = await branchGroups();
      delete g[String(b.branch || "")];
      await putSetting("telegram_branch_groups", JSON.stringify(g));
      return { ok: true };
    }
    fail2(400, "invalid_action");
  });
  const queueSince = {
    get: /* @__PURE__ */ __name(async () => Number((await db.prepare("SELECT value FROM settings WHERE key = 'telegram_queue_since'").get())?.value) || null, "get"),
    set: /* @__PURE__ */ __name((v) => db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_queue_since', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(v ?? "")), "set")
  };
  async function collect(c, now) {
    const on2 = /* @__PURE__ */ __name((k) => c.rules[k], "on"), alerts = [];
    const add = /* @__PURE__ */ __name((key3, kind, employeeId, text, { replyTo = null, silent = false } = {}) => alerts.push({ key: key3, kind, employeeId, text, replyTo, silent }), "add");
    const live = await app2.live(now), people = new Map(live.map((p) => [p.employeeId, p]));
    const all = new Map((await db.prepare("SELECT id, name FROM employees").all()).map((e) => [e.id, e.name]));
    const name = /* @__PURE__ */ __name((id2) => people.get(id2)?.name || all.get(id2) || "\u0645\u0648\u0638\u0641", "name");
    const since = /* @__PURE__ */ __name((p) => p.since ? (now - Date.parse(p.since)) / 1e3 : 0, "since");
    const extraOf = /* @__PURE__ */ __name((e) => {
      try {
        return JSON.parse(e?.extra || "{}");
      } catch {
        return {};
      }
    }, "extraOf");
    const breakAllowance = /* @__PURE__ */ __name((e) => extraOf(e).breakAllowedSeconds || RULES.breakPeriodSeconds, "breakAllowance");
    const breakKind = /* @__PURE__ */ __name((e) => {
      const x = extraOf(e);
      return e?.event_type === "break_observed" ? "\u0645\u0646 \u063A\u064A\u0631 \u0637\u0644\u0628 \u0645\u0646 \u0627\u0644\u0645\u0631\u0635\u062F" : x.breakPolicyKind === "approved" ? "\u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A (" + (x.breakRequestedMinutes || 15) + " \u062F)" : "\u0628\u0631\u064A\u0643 \u0639\u0627\u062F\u064A";
    }, "breakKind");
    const latestBreakStart = /* @__PURE__ */ __name((employeeId, before) => db.prepare("SELECT * FROM events WHERE employee_id = ? AND event_type IN ('break_start','break_observed') AND occurred_at <= ? ORDER BY occurred_at DESC LIMIT 1").get(employeeId, before), "latestBreakStart");
    const statusLabel = { ready: "\u0645\u062A\u0627\u062D", on_call: "\u0641\u064A \u0645\u0643\u0627\u0644\u0645\u0629", break: "\u0628\u0631\u064A\u0643", logged_in: "\u0633\u062C\u0651\u0644 \u062F\u062E\u0648\u0644", logged_out: "\u062E\u0631\u062C", offline: "\u062E\u0631\u062C" };
    const snap = await app2.latestLive(), snapFresh = !!snap && now - snap.observed_at < 3e4;
    const queueRows = snapFresh ? JSON.parse(snap.rows).filter((r) => /^(on wait|waiting)$/i.test(String(r[10]).trim())) : [];
    const waitOf = /* @__PURE__ */ __name((r) => {
      const v = parseDuration(r[8]);
      return v == null ? null : v + Math.max(0, (now - snap.observed_at) / 1e3);
    }, "waitOf");
    const inState = /* @__PURE__ */ __name((st) => live.filter((p) => p.state === st), "inState");
    const names = /* @__PURE__ */ __name((list, n = 4) => list.slice(0, n).map((p) => p.name).join("\u060C ") + (list.length > n ? " +" + (list.length - n) : ""), "names");
    const footer = /* @__PURE__ */ __name(() => "\n\n\u23F3 \u0645\u0646\u062A\u0638\u0631\u064A\u0646: " + (snapFresh ? queueRows.length : "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0645\u0634 \u0645\u062A\u0627\u062D\u0629") + "\n\u{1F465} \u0645\u062A\u0627\u062D " + inState("ready").length + " \xB7 \u0645\u0643\u0627\u0644\u0645\u0629 " + inState("on_call").length + " \xB7 \u0628\u0631\u064A\u0643 " + inState("break").length + " \xB7 \u0627\u0646\u0642\u0637\u0627\u0639 \u0631\u0635\u062F " + (inState("unknown").length + inState("disconnected").length) + (inState("ready").length ? "\n\u{1F7E2} \u0627\u0644\u0645\u062A\u0627\u062D\u064A\u0646: " + names(inState("ready")) : ""), "footer");
    const add0 = add;
    const digits3 = /* @__PURE__ */ __name((v) => String(v || "").replace(/\D/g, ""), "digits");
    const samePhone = /* @__PURE__ */ __name((a, b) => {
      a = digits3(a).slice(-9);
      b = digits3(b).slice(-9);
      return a.length >= 6 && a === b;
    }, "samePhone");
    const isWaiting = /* @__PURE__ */ __name((r) => /^(on wait|waiting)$/i.test(String(r[10]).trim()), "isWaiting"), isTalking = /* @__PURE__ */ __name((r) => /^live call$/i.test(String(r[10]).trim()), "isTalking");
    const extOf = /* @__PURE__ */ __name((v) => (String(v || "").match(/(\d{2,6})(?!.*\d)/) || [])[1] || "", "extOf");
    const onExtension = /* @__PURE__ */ __name(async (ext, at) => ext ? db.prepare("SELECT employee_id FROM employee_sessions WHERE extension = ? AND issued_at <= ? AND (revoked_at IS NULL OR revoked_at >= ?) ORDER BY issued_at DESC LIMIT 1").get(ext, at, at) : null, "onExtension");
    const entryOf = /* @__PURE__ */ __name((key3) => {
      const v = Number(key3.split(":")[2]);
      return v > 1e11 ? v : v * 6e4;
    }, "entryOf");
    const gone = {
      get: /* @__PURE__ */ __name(async (k) => Number((await db.prepare("SELECT value FROM settings WHERE key = ?").get("tg_gone:" + k))?.value) || null, "get"),
      set: /* @__PURE__ */ __name((k, v) => db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("tg_gone:" + k, String(v)), "set")
    };
    const STATE_AR2 = { ready: "\u0645\u062A\u0627\u062D", on_call: "\u0641\u064A \u0645\u0643\u0627\u0644\u0645\u0629", break: "\u0628\u0631\u064A\u0643", unknown: "\u0627\u0646\u0642\u0637\u0627\u0639 \u0631\u0635\u062F", disconnected: "\u0627\u0646\u0642\u0637\u0639", out_extension: "\u0628\u0631\u0651\u0647 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629", out_arabicss: "\u0628\u0631\u0651\u0647 \u0623\u0631\u0627\u0628\u064A\u0643\u0633", out_browser: "\u0642\u0627\u0641\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D", logged_in: "\u0644\u0633\u0647 \u0645\u062F\u062E\u0644\u0634 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629", not_started: "\u0644\u0633\u0647 \u0645\u0628\u062F\u0623\u0634" };
    async function teamDuring(entry, exit2) {
      const list = await app2.waitContext(entry, Math.max(exit2, entry + 1e3), now).catch(() => null);
      if (!list) return "";
      const at = /* @__PURE__ */ __name((st) => list.filter((e) => e.atEntry === st), "at"), ready = list.filter((e) => e.readyDuringWait);
      const who = /* @__PURE__ */ __name((l, n = 6) => l.slice(0, n).map((e) => e.name + (e.extension ? " (" + e.extension + ")" : "")).join("\u060C ") + (l.length > n ? " +" + (l.length - n) : ""), "who");
      const out = list.filter((e) => !["ready", "on_call", "break"].includes(e.atEntry));
      return "\n\n\u{1F4CA} \u062D\u0627\u0644\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0648\u0642\u062A \u0627\u0646\u062A\u0638\u0627\u0631\u0647 (" + clock(entry) + " \u2190 " + clock(exit2) + "):\n" + (ready.length ? "\u{1F7E2} \u0643\u0627\u0646\u0648\u0627 \u0645\u062A\u0627\u062D\u064A\u0646 \u0623\u062B\u0646\u0627\u0621 \u0627\u0646\u062A\u0638\u0627\u0631\u0647: " + who(ready) : "\u26AA \u0645\u0643\u0627\u0646\u0634 \u0641\u064A\u0647 \u062D\u062F \u0645\u062A\u0627\u062D \u0637\u0648\u0644 \u0627\u0646\u062A\u0638\u0627\u0631\u0647 \u062D\u0633\u0628 \u0627\u0644\u0631\u0635\u062F") + "\n\u{1F465} \u0648\u0642\u062A \u062F\u062E\u0648\u0644\u0647: \u0645\u062A\u0627\u062D " + at("ready").length + " \xB7 \u0641\u064A \u0645\u0643\u0627\u0644\u0645\u0629 " + at("on_call").length + " \xB7 \u0628\u0631\u064A\u0643 " + at("break").length + " \xB7 \u0645\u0634 \u0634\u063A\u0627\u0644\u064A\u0646 " + out.length + (at("on_call").length ? "\n\u{1F4DE} \u0641\u064A \u0645\u0643\u0627\u0644\u0645\u0629: " + who(at("on_call")) : "") + (at("break").length ? "\n\u2615 \u0641\u064A \u0628\u0631\u064A\u0643: " + who(at("break")) : "") + (out.length ? "\n\u26A0\uFE0F \u0645\u0634 \u0634\u063A\u0627\u0644\u064A\u0646: " + out.slice(0, 6).map((e) => e.name + " (" + (STATE_AR2[e.atEntry] || e.atEntry) + ")").join("\u060C ") + (out.length > 6 ? " +" + (out.length - 6) : "") : "");
    }
    __name(teamDuring, "teamDuring");
    async function lastSeenWaiting(phone, from) {
      for (const sn of await db.prepare("SELECT observed_at, rows FROM live_snapshots WHERE observed_at >= ? ORDER BY observed_at DESC LIMIT 200").all(from)) {
        let rows;
        try {
          rows = JSON.parse(sn.rows);
        } catch {
          continue;
        }
        const r = rows.find((x) => isWaiting(x) && samePhone(x[9], phone));
        if (r) return { at: sn.observed_at, wait: parseDuration(r[8]) };
      }
      return null;
    }
    __name(lastSeenWaiting, "lastSeenWaiting");
    const addNew = /* @__PURE__ */ __name((key3, kind, employeeId, text, opts) => add0(key3, kind, employeeId, text + footer(), opts), "addNew");
    const unresolved = await db.prepare(`SELECT l.* FROM telegram_log l WHERE (l.sent_at IS NOT NULL OR l.kind = 'gap') AND l.kind IN ('breakStart','breakOver','longCall','gap','breakRequest','queueNobody','logout','waitSla','source','notBound')
      AND NOT EXISTS (SELECT 1 FROM telegram_log r WHERE r.key = 'resolved:' || l.key) ORDER BY l.id LIMIT 500`).all();
    const closedGaps = /* @__PURE__ */ new Set();
    const closedBreaks = /* @__PURE__ */ new Set();
    for (const old of unresolved) {
      let text = null, silent = false;
      const person = people.get(old.employee_id), current = person?.state;
      if (old.kind === "breakStart" || old.kind === "breakOver") {
        const start = old.kind === "breakStart" ? await db.prepare("SELECT * FROM events WHERE id = ?").get(Number(old.key.slice(6))) : await latestBreakStart(old.employee_id, old.created_at);
        const from = start?.occurred_at ?? old.created_at;
        const ended = await db.prepare("SELECT * FROM events WHERE employee_id = ? AND event_type IN ('break_end','break_end_unknown') AND occurred_at >= ? ORDER BY occurred_at LIMIT 1").get(old.employee_id, from);
        const back = !ended && ["ready", "on_call"].includes(current) && person.since && Date.parse(person.since) > from ? Date.parse(person.since) : null;
        if (ended || back) {
          const at = ended ? ended.occurred_at : back, length = ended?.duration_seconds || Math.round((at - from) / 1e3), allowed = breakAllowance(start), over = length - allowed;
          const tag = old.employee_id + ":" + from;
          silent = closedBreaks.has(tag);
          closedBreaks.add(tag);
          text = "\u2705 " + name(old.employee_id) + " \u0631\u062C\u0639 \u0645\u0646 \u0627\u0644\u0628\u0631\u064A\u0643 \u2014 " + clock(at) + "\n\u0645\u062F\u0629 \u0627\u0644\u0628\u0631\u064A\u0643 " + fmt(length) + " \u0645\u0646 " + fmt(allowed) + " \u0645\u0633\u0645\u0648\u062D\u0629" + (over > 59 ? " \xB7 \u0632\u064A\u0627\u062F\u0629 " + fmt(over) : "");
        }
      } else if (old.kind === "longCall") {
        const ended = await db.prepare("SELECT * FROM events WHERE employee_id = ? AND event_type = 'agentunlinked' AND occurred_at >= ? ORDER BY occurred_at LIMIT 1").get(old.employee_id, old.created_at);
        if (ended) text = "\u2705 " + name(old.employee_id) + " \u062E\u0644\u0651\u0635 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 \u2014 \u0645\u062F\u062A\u0647\u0627 " + fmt(ended.duration_seconds || 0) + " \u2014 " + clock(ended.occurred_at);
        else if (["ready", "break"].includes(current) && person.since && Date.parse(person.since) > old.created_at) text = "\u2705 " + name(old.employee_id) + " \u062E\u0644\u0651\u0635 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 \u2014 \u062D\u0627\u0644\u062A\u0647 \u062F\u0644\u0648\u0642\u062A\u064A " + statusLabel[current];
      } else if (old.kind === "gap") {
        const from = Date.parse(old.key.split(":").slice(2).join(":"));
        if (["ready", "on_call", "break"].includes(current) && person.lastEvidence && Date.parse(person.lastEvidence) >= old.created_at && Date.parse(person.lastEvidence) <= now && now - Date.parse(person.lastEvidence) < RULES.presenceStaleMs) {
          silent = !old.message_id || !!old.error || closedGaps.has(old.employee_id);
          if (!silent) closedGaps.add(old.employee_id);
          text = "\u2705 " + name(old.employee_id) + " \u0631\u062C\u0639 \u0627\u0644\u0631\u0635\u062F \u2014 " + clock(now) + (Number.isFinite(from) ? " \u2014 \u0627\u0644\u0627\u0646\u0642\u0637\u0627\u0639 \u0627\u0633\u062A\u0645\u0631 " + fmt((now - from) / 1e3) : "") + " \u2014 \u062D\u0627\u0644\u062A\u0647 \u062F\u0644\u0648\u0642\u062A\u064A " + statusLabel[current];
        }
      } else if (old.kind === "breakRequest") {
        const req = await db.prepare("SELECT * FROM break_requests WHERE id = ?").get(old.key.slice(4));
        if (req && req.status !== "pending") {
          const by = req.decided_by ? " \u2014 \u0628\u0648\u0627\u0633\u0637\u0629 " + req.decided_by : "";
          text = {
            approved: "\u2705 \u0627\u062A\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u0640 " + name(old.employee_id) + " (" + req.requested_minutes + " \u062F)" + by,
            starting: "\u2705 \u0627\u062A\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u0640 " + name(old.employee_id) + by,
            completed: "\u2705 \u0627\u062A\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u0640 " + name(old.employee_id) + by,
            rejected: "\u274C \u0627\u062A\u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u0640 " + name(old.employee_id) + by,
            expired: "\u231B \u0637\u0644\u0628 \u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u0640 " + name(old.employee_id) + " \u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u062A\u0647 \u0645\u0646 \u063A\u064A\u0631 \u0631\u062F",
            cancelled: "\u21A9\uFE0F \u0637\u0644\u0628 \u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u0640 " + name(old.employee_id) + " \u0627\u062A\u0644\u063A\u0649"
          }[req.status] || null;
        }
      } else if (old.kind === "queueNobody") {
        const snap2 = await app2.latestLive();
        if (snap2 && now - snap2.observed_at < 3e4) {
          const waiting = JSON.parse(snap2.rows).filter((r) => /^(on wait|waiting)$/i.test(String(r[10]).trim())).length;
          const available = live.filter((p) => p.state === "ready").length;
          const lasted = " \u2014 \u0627\u0644\u0648\u0642\u062A \u0645\u0646 \u063A\u064A\u0631 \u062D\u062F \u0645\u062A\u0627\u062D " + fmt((now - Number(old.key.split(":")[1]) * 1e3) / 1e3);
          if (!waiting || available) text = (!waiting ? "\u2705 \u0645\u0641\u064A\u0634 \u0639\u0645\u0644\u0627\u0621 \u0645\u0646\u062A\u0638\u0631\u064A\u0646 \u062F\u0644\u0648\u0642\u062A\u064A" : "\u2705 \u0628\u0642\u0649 \u0641\u064A\u0647 " + available + " \u0645\u0648\u0638\u0641 \u0645\u062A\u0627\u062D \u2014 \u0627\u0644\u0645\u0646\u062A\u0638\u0631\u064A\u0646 " + waiting) + lasted;
        }
      } else if (old.kind === "waitSla") {
        const phone = old.key.split(":")[1], entry = entryOf(old.key);
        const stillWaiting = snapFresh && queueRows.some((r) => samePhone(r[9], phone));
        const linked = await db.prepare("SELECT * FROM events WHERE event_type IN ('agentlinked','call_observed') AND occurred_at >= ? AND occurred_at <= ? AND phone IS NOT NULL AND phone != '' ORDER BY occurred_at").all(entry - 5e3, now).then((list) => list.find((e) => samePhone(e.phone, phone)));
        if (linked) {
          const waited = Math.max(0, Math.round((linked.occurred_at - entry) / 1e3));
          text = "\u2705 \u0627\u0644\u0639\u0645\u064A\u0644 " + mask(phone) + " \u0627\u062A\u0631\u062F \u0639\u0644\u064A\u0647 \u0628\u0639\u062F " + fmt(waited) + " \u0627\u0646\u062A\u0638\u0627\u0631 \u2014 \u0631\u062F \u0639\u0644\u064A\u0647 " + name(linked.employee_id) + " (\u062A\u062D\u0648\u064A\u0644\u0629 " + linked.extension + ") \u2014 " + clock(linked.occurred_at) + (waited > LATE_ANSWER_S ? await teamDuring(entry, linked.occurred_at) : "");
        } else if (snapFresh && !stillWaiting) {
          const talking = JSON.parse(snap.rows).find((r) => isTalking(r) && samePhone(r[9], phone));
          let first = await gone.get(old.key);
          if (!first) {
            first = now;
            await gone.set(old.key, now);
          }
          if (talking) {
            const ext = extOf(talking[2]), emp = await onExtension(ext, now), seen = await lastSeenWaiting(phone, entry);
            const waited = seen ? Math.round((seen.at - entry) / 1e3 + (first - seen.at) / 2e3) : Math.round((first - entry) / 1e3);
            text = "\u2705 \u0627\u0644\u0639\u0645\u064A\u0644 " + mask(phone) + " \u0627\u062A\u0631\u062F \u0639\u0644\u064A\u0647 \u0628\u0639\u062F \u062D\u0648\u0627\u0644\u064A " + fmt(waited) + " \u0627\u0646\u062A\u0638\u0627\u0631 \u2014 " + (emp ? "\u0631\u062F \u0639\u0644\u064A\u0647 " + name(emp.employee_id) + " (\u062A\u062D\u0648\u064A\u0644\u0629 " + ext + ")" : ext ? "\u0631\u062F \u0639\u0644\u064A\u0647 \u062A\u062D\u0648\u064A\u0644\u0629 " + ext + " (\u0645\u0634 \u0645\u0633\u062C\u0644\u0629 \u0641\u064A \u0627\u0644\u0645\u0631\u0635\u062F \u0648\u0642\u062A\u0647\u0627)" : "\u0627\u0644\u0644\u064A \u0631\u062F \u0645\u0634 \u0638\u0627\u0647\u0631 \u0641\u064A \u0627\u0644\u0645\u0631\u0635\u062F") + " \u2014 " + clock(first) + (waited > LATE_ANSWER_S ? await teamDuring(entry, entry + waited * 1e3) : "");
          } else if (now - first >= 2e4) {
            const seen = await lastSeenWaiting(phone, entry);
            const waited = seen ? Math.round((seen.at - entry) / 1e3) : Math.round((first - entry) / 1e3);
            const left = seen ? seen.at : first;
            text = "\u{1F534} \u0627\u0644\u0639\u0645\u064A\u0644 " + mask(phone) + " \u062E\u0631\u062C \u0645\u0646 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0645\u0646 \u063A\u064A\u0631 \u0645\u0627 \u062D\u062F \u064A\u0631\u062F \u0639\u0644\u064A\u0647 \u2014 \u0627\u0646\u062A\u0638\u0631 \u062D\u0648\u0627\u0644\u064A " + fmt(waited) + " \u0648\u062E\u0631\u062C " + clock(left) + "\n\u0645\u062D\u062F\u0634 \u0645\u0646 \u0627\u0644\u0645\u0633\u062C\u0644\u064A\u0646 \u0641\u064A \u0627\u0644\u0645\u0631\u0635\u062F \u0627\u0633\u062A\u0644\u0645 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629\u060C \u0648\u0645\u0634 \u0638\u0627\u0647\u0631\u0629 \u0643\u0645\u0643\u0627\u0644\u0645\u0629 \u0634\u063A\u0627\u0644\u0629 \u0641\u064A \u0623\u0631\u0627\u0628\u064A\u0643\u0633\u060C \u0641\u063A\u0627\u0644\u0628\u064B\u0627 \u0642\u0641\u0644 \u0627\u0644\u062E\u0637.\n\u0647\u062A\u062A\u0623\u0643\u062F \u0645\u0646 \u0633\u062C\u0644 \u0623\u0631\u0627\u0628\u064A\u0643\u0633: \u0644\u0648 \u0627\u062A\u0633\u062C\u0644\u062A \u0641\u0627\u0626\u062A\u0629 \u0647\u062A\u0648\u0635\u0644 \xAB\u0645\u0643\u0627\u0644\u0645\u0629 \u0641\u0627\u0626\u062A\u0629\xBB \u0631\u062F\u064B\u0627 \u0639\u0644\u0649 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u062F\u064A." + await teamDuring(entry, left);
          }
        }
        if (text) await db.prepare("DELETE FROM settings WHERE key = ?").run("tg_gone:" + old.key);
      } else if (old.kind === "source") {
        if (snapFresh) text = "\u2705 \u0631\u062C\u0639\u062A \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u2014 " + clock(snap.observed_at);
      } else if (old.kind === "notBound") {
        if (["ready", "on_call", "break"].includes(current)) text = "\u2705 " + name(old.employee_id) + " \u062F\u062E\u0644 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 " + (person.extension || "");
      } else if (old.kind === "logout") {
        const returned = await db.prepare("SELECT * FROM employee_sessions WHERE employee_id = ? AND work_started_at >= ? AND id != ? ORDER BY work_started_at LIMIT 1").get(old.employee_id, old.created_at, old.key.slice(4));
        if (returned) text = "\u21A9\uFE0F " + name(old.employee_id) + " \u0631\u062C\u0639 \u0644\u0644\u0634\u063A\u0644 \u2014 \u062A\u062D\u0648\u064A\u0644\u0629 " + returned.extension + " \u2014 " + clock(returned.work_started_at);
      }
      if (text) add("resolved:" + old.key, old.kind + ":resolved", old.employee_id, text, { replyTo: old.key, silent });
    }
    if (on2("breakStart")) for (const e of await db.prepare("SELECT * FROM events WHERE event_type IN ('break_start','break_observed') AND occurred_at > ? ORDER BY occurred_at").all(now - 6e5)) {
      if (await db.prepare("SELECT 1 FROM telegram_log WHERE key = ?").get("break:" + e.id)) continue;
      const x = extraOf(e), allowed = breakAllowance(e);
      let detail;
      if (e.event_type === "break_observed") detail = "\u26A0\uFE0F \u062F\u062E\u0644 \u0628\u0631\u064A\u0643 \u0641\u064A \u0623\u0631\u0627\u0628\u064A\u0643\u0633 \u0645\u0646 \u063A\u064A\u0631 \u0645\u0627 \u064A\u0637\u0644\u0628\u0647 \u0645\u0646 \u0627\u0644\u0645\u0631\u0635\u062F \u2014 \u0645\u062D\u0633\u0648\u0628 15 \u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644";
      else if (x.breakPolicyKind === "approved") detail = "\u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0627\u0644\u0644\u064A \u0627\u062A\u0648\u0627\u0641\u0642 \u0639\u0644\u064A\u0647 \u2014 \u0645\u0633\u0645\u0648\u062D " + fmt(allowed);
      else {
        const p = await app2.breakPolicy(e.employee_id, now);
        const before = Math.max(0, p.usedSeconds - Math.max(0, (now - e.occurred_at) / 1e3));
        detail = "\u0627\u0644\u0628\u0631\u064A\u0643 \u0627\u0644\u0639\u0627\u062F\u064A \u0631\u0642\u0645 " + Math.min(Math.max(p.startsUsed, 1), 2) + " \u0645\u0646 2 \u2014 \u0645\u0633\u0645\u0648\u062D " + fmt(allowed) + (before >= 30 ? " \xB7 \u0627\u0633\u062A\u062E\u062F\u0645 \u0642\u0628\u0644\u0647 " + fmt(before) + " \u0645\u0646 30 \u062F" : "");
      }
      addNew("break:" + e.id, "breakStart", e.employee_id, "\u2615 " + name(e.employee_id) + " \u0628\u062F\u0623 \u0628\u0631\u064A\u0643 \u2014 " + clock(e.occurred_at) + " \u2014 \u062A\u062D\u0648\u064A\u0644\u0629 " + e.extension + "\n" + detail);
    }
    for (const p of live) {
      if (p.state === "break" && on2("breakOver")) {
        const start = await latestBreakStart(p.employeeId, now), allowed = breakAllowance(start);
        if (since(p) > allowed) addNew(
          "over:" + p.employeeId + ":" + p.since,
          "breakOver",
          p.employeeId,
          "\u23F0 " + p.name + " \u0639\u062F\u0651\u0649 \u0648\u0642\u062A \u0627\u0644\u0628\u0631\u064A\u0643 \u2014 \u0628\u0642\u0627\u0644\u0647 " + fmt(since(p)) + " \u0648\u0627\u0644\u0645\u0633\u0645\u0648\u062D " + fmt(allowed) + " (" + breakKind(start) + ") \u2014 \u062A\u062D\u0648\u064A\u0644\u0629 " + p.extension,
          { replyTo: start ? "break:" + start.id : null }
        );
      }
      if (p.state === "on_call" && on2("longCall") && since(p) > RULES.callAlertSeconds)
        addNew("call:" + p.employeeId + ":" + (p.callId || p.since), "longCall", p.employeeId, "\u{1F4DE} \u0645\u0643\u0627\u0644\u0645\u0629 \u0637\u0648\u064A\u0644\u0629: " + p.name + " \u0628\u0642\u0627\u0644\u0647 " + fmt(since(p)) + (p.phone ? " \u0645\u0639 " + p.phone : "") + " \u2014 \u062A\u062D\u0648\u064A\u0644\u0629 " + p.extension);
      const activeGap = p.state === "unknown" && on2("gap") && since(p) > 180 && await db.prepare("SELECT 1 FROM telegram_log l WHERE l.kind = 'gap' AND l.employee_id = ? AND NOT EXISTS (SELECT 1 FROM telegram_log r WHERE r.key = 'resolved:' || l.key) LIMIT 1").get(p.employeeId);
      if (p.state === "unknown" && on2("gap") && since(p) > 180 && !activeGap)
        addNew("gap:" + p.employeeId + ":" + p.since, "gap", p.employeeId, "\u{1F4E1} \u0627\u0646\u0642\u0637\u0627\u0639 \u0631\u0635\u062F: " + p.name + " \u0645\u0641\u064A\u0634 \u0625\u0634\u0627\u0631\u0629 \u0645\u0646 \u062C\u0647\u0627\u0632\u0647 \u0645\u0646 " + clock(Date.parse(p.since)) + " (" + fmt(since(p)) + ") \u2014 \u062A\u062D\u0648\u064A\u0644\u0629 " + p.extension);
    }
    if (on2("breakRequest")) for (const r of await db.prepare("SELECT r.*, e.name FROM break_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'pending' AND r.created_at > ?").all(now - 18e5))
      addNew("req:" + r.id, "breakRequest", r.employee_id, "\u{1F64B} " + r.name + " \u0637\u0627\u0644\u0628 \u0628\u0631\u064A\u0643 \u0625\u0636\u0627\u0641\u064A " + r.requested_minutes + " \u062F\u0642\u064A\u0642\u0629" + (r.reason ? " \u2014 " + r.reason : "") + "\n\u0627\u0644\u0642\u0628\u0648\u0644 \u0623\u0648 \u0627\u0644\u0631\u0641\u0636 \u0645\u0646 \u0635\u0641\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629");
    if (on2("logout")) for (const s of await db.prepare("SELECT * FROM employee_sessions WHERE revoked_at > ? AND work_started_at IS NOT NULL").all(now - 6e5)) {
      const kind = outKind(s.revoke_reason);
      if (kind === "gap" || await db.prepare("SELECT 1 FROM telegram_log WHERE key = ?").get("out:" + s.id)) continue;
      const w2 = dayWindow(businessDay(s.revoked_at));
      const calls = await db.prepare("SELECT COUNT(*) n, AVG(duration_seconds) a FROM events WHERE employee_id = ? AND event_type = 'agentunlinked' AND occurred_at >= ? AND occurred_at <= ?").get(s.employee_id, w2.start, s.revoked_at);
      const p = await app2.breakPolicy(s.employee_id, s.revoked_at);
      addNew("out:" + s.id, "logout", s.employee_id, "\u{1F6AA} " + name(s.employee_id) + " " + OUT_TEXT[kind] + " \u2014 " + clock(s.revoked_at) + " \u2014 \u062A\u062D\u0648\u064A\u0644\u0629 " + s.extension + "\n\u0644\u0627\u0632\u0645 \u064A\u062F\u062E\u0644 \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u062A\u0627\u0646\u064A \u0639\u0634\u0627\u0646 \u064A\u062A\u0633\u062C\u0644\n\u0645\u0643\u0627\u0644\u0645\u0627\u062A\u0647 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647: " + calls.n + (calls.n ? " \xB7 \u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 " + fmt(calls.a) : "") + "\n\u0628\u0631\u064A\u0643: " + p.startsUsed + " \u0645\u0631\u0629 \xB7 " + fmt(p.usedSeconds));
    }
    if (on2("queueNobody")) {
      const snap2 = await app2.latestLive(), rows = snap2 && now - snap2.observed_at < 3e4 ? JSON.parse(snap2.rows) : [];
      const waiting = rows.filter((r) => /^(on wait|waiting)$/i.test(String(r[10]).trim())).length, ready = live.filter((p) => p.state === "ready").length;
      let since2 = await queueSince.get();
      if (waiting && !ready) {
        if (!since2) {
          since2 = now;
          await queueSince.set(now);
        }
        if (now - since2 >= 2e4) addNew("queue:" + Math.floor(since2 / 1e3), "queueNobody", null, "\u{1F6A8} " + waiting + " \u0639\u0645\u064A\u0644 \u0645\u0646\u062A\u0638\u0631 \u0648\u0645\u0641\u064A\u0634 \u0645\u0648\u0638\u0641 \u0645\u062A\u0627\u062D \u2014 \u0645\u0646 " + clock(since2));
      } else if (since2) await queueSince.set(null);
    }
    const today = businessDay(now), w = dayWindow(today), operatingNow = now >= w.start && now < w.operatingEnd;
    for (const r of queueRows) {
      const wait = waitOf(r), phone = String(r[9] || "").replace(/\D/g, "");
      if (wait == null || !operatingNow) continue;
      const entry = Math.round((now - wait * 1e3) / 1e3) * 1e3;
      const ready = inState("ready"), who = ready.length ? "\u{1F7E2} \u0641\u064A\u0647 " + ready.length + " \u0645\u062A\u0627\u062D \u062D\u0633\u0628 \u0627\u0644\u0631\u0635\u062F (" + names(ready) + ") \u2014 \u0631\u0627\u062C\u0639 \u0627\u0644\u062A\u0648\u0632\u064A\u0639 \u0639\u0644\u0649 \u0646\u0648\u0639 \u0627\u0644\u0637\u0644\u0628" : "\u{1F534} \u0645\u0641\u064A\u0634 \u062D\u062F \u0645\u062A\u0627\u062D \u062D\u0633\u0628 \u0627\u0644\u0631\u0635\u062F";
      const line = queueLabel(r[0]) + " \xB7 " + mask(phone) + " \xB7 \u0645\u0646\u062A\u0638\u0631 " + Math.round(wait) + " \u062B";
      const seen = /* @__PURE__ */ __name((kind) => db.prepare("SELECT 1 FROM telegram_log WHERE kind = ? AND key LIKE ? AND created_at > ?").get(kind, kind + ":" + phone + ":%", now - 15 * 6e4), "seen");
      if (wait > WAIT_ALERT_S && on2("waitSla") && !await seen("waitSla")) addNew("waitSla:" + phone + ":" + entry, "waitSla", null, "\u{1F514} \u0639\u0645\u064A\u0644 \u0639\u062F\u0651\u0649 " + WAIT_ALERT_S + " \u062B\u0648\u0627\u0646\u064A \u0627\u0646\u062A\u0638\u0627\u0631\n" + line + "\n" + who);
    }
    if (on2("breakOverlap") && queueRows.length && inState("break").length >= 2)
      addNew("overlap:" + Math.floor(now / 6e5), "breakOverlap", null, "\u{1F514} " + inState("break").length + " \u0641\u064A \u0628\u0631\u064A\u0643 \u0645\u0639 \u0628\u0639\u0636 \u0648\u0641\u064A\u0647 " + queueRows.length + " \u0639\u0645\u064A\u0644 \u0645\u0646\u062A\u0638\u0631\n\u0641\u064A \u0627\u0644\u0628\u0631\u064A\u0643: " + names(inState("break"), 6));
    for (const p of live) {
      if (p.state === "break" && (on2("breakWarn") || on2("breakBudget"))) {
        const start = await latestBreakStart(p.employeeId, now), allowed = breakAllowance(start), left = allowed - since(p);
        if (on2("breakWarn") && left > 0 && left <= 60) addNew("breakWarn:" + p.employeeId + ":" + p.since, "breakWarn", p.employeeId, "\u{1F7E1} \u0628\u0627\u0642\u064A \u0623\u0642\u0644 \u0645\u0646 \u062F\u0642\u064A\u0642\u0629 \u0639\u0644\u0649 \u0628\u0631\u064A\u0643 " + p.name + " \u2014 \u0628\u0642\u0627\u0644\u0647 " + fmt(since(p)) + " \u0645\u0646 " + fmt(allowed), { replyTo: start ? "break:" + start.id : null });
        if (on2("breakBudget") && extraOf(start).breakPolicyKind !== "approved") {
          const pol = await app2.breakPolicy(p.employeeId, now);
          if (pol.usedSeconds >= RULES.breakBudgetSeconds) addNew("budget:" + p.employeeId + ":" + today, "breakBudget", p.employeeId, "\u{1F514} " + p.name + " \u062E\u0644\u0651\u0635 \u0627\u0644\u0640 30 \u062F\u0642\u064A\u0642\u0629 \u0628\u0631\u064A\u0643 \u0628\u062A\u0648\u0639 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 (" + fmt(pol.usedSeconds) + ")\n\u0623\u064A \u0628\u0631\u064A\u0643 \u062A\u0627\u0646\u064A \u0644\u0627\u0632\u0645 \u0645\u0648\u0627\u0641\u0642\u0629");
        }
      }
      if (p.state === "logged_in" && on2("notBound") && since(p) > 120)
        addNew("unbound:" + p.employeeId + ":" + p.since, "notBound", p.employeeId, "\u{1F514} " + p.name + " \u062F\u062E\u0644 \u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0645\u0646 " + fmt(since(p)) + " \u0648\u0644\u0633\u0647 \u0645\u062F\u062E\u0644\u0634 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629 \u2014 \u0645\u0634 \u0645\u062D\u0633\u0648\u0628 \u0645\u062A\u0627\u062D");
    }
    if (on2("missed")) {
      const h = await app2.dayHistory(today, now);
      for (const m of h.missed) {
        const rec = h.records[m.index];
        if (m.classification !== "counted" || !rec?.startMs || now - rec.startMs > 3 * 36e5) continue;
        const key3 = "missed:" + today + ":" + m.start + ":" + String(m.phone || "").replace(/\D/g, "");
        if (await db.prepare("SELECT 1 FROM telegram_log WHERE key = ?").get(key3)) continue;
        const ctx = await app2.missedContext(today, m.index, now).catch(() => null);
        const readyDuring = ctx ? ctx.employees.filter((e) => e.readyDuringWait) : [];
        const label = { ready: "\u0645\u062A\u0627\u062D", on_call: "\u0641\u064A \u0645\u0643\u0627\u0644\u0645\u0629", break: "\u0628\u0631\u064A\u0643", unknown: "\u0627\u0646\u0642\u0637\u0627\u0639 \u0631\u0635\u062F", disconnected: "\u0627\u0646\u0642\u0637\u0639", out_extension: "\u0628\u0631\u0651\u0647 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629", out_arabicss: "\u0628\u0631\u0651\u0647 \u0623\u0631\u0627\u0628\u064A\u0643\u0633", out_browser: "\u0642\u0627\u0641\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D", logged_in: "\u0644\u0633\u0647 \u0645\u062F\u062E\u0644\u0634 \u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629" };
        const atEntry = ctx ? ctx.employees.filter((e) => !["not_started", "shift_ended"].includes(e.atEntry)).map((e) => e.name + " (" + (label[e.atEntry] || e.atEntry) + ")") : [];
        const waitAlert = await db.prepare("SELECT key FROM telegram_log WHERE kind = 'waitSla' AND created_at >= ? AND created_at <= ? ORDER BY id DESC").all(rec.startMs - 12e4, rec.startMs + 9e5).then((list) => list.find((x) => samePhone(x.key.split(":")[1], m.phone)));
        addNew(key3, "missed", null, "\u{1F534} \u0645\u0643\u0627\u0644\u0645\u0629 \u0641\u0627\u0626\u062A\u0629 \u2014 " + clock(rec.startMs) + "\n" + m.queueLabel + " \xB7 " + mask(m.phone) + " \xB7 \u0627\u0646\u062A\u0638\u0631 " + (m.waitSeconds ?? "\u061F") + " \u062B\n" + (readyDuring.length ? "\u{1F7E2} \u0643\u0627\u0646\u0648\u0627 \u0645\u062A\u0627\u062D\u064A\u0646 \u0623\u062B\u0646\u0627\u0621 \u0627\u0646\u062A\u0638\u0627\u0631\u0647: " + readyDuring.map((e) => e.name).join("\u060C ") : "\u26AA \u0645\u0643\u0627\u0646\u0634 \u0641\u064A\u0647 \u062D\u062F \u0645\u062A\u0627\u062D \u0623\u062B\u0646\u0627\u0621 \u0627\u0646\u062A\u0638\u0627\u0631\u0647 \u062D\u0633\u0628 \u0627\u0644\u0631\u0635\u062F") + (atEntry.length ? "\n\u{1F465} \u0648\u0642\u062A \u062F\u062E\u0648\u0644\u0647 \u0627\u0644\u0637\u0627\u0628\u0648\u0631: " + atEntry.slice(0, 8).join("\u060C ") + (atEntry.length > 8 ? " +" + (atEntry.length - 8) : "") : ""), { replyTo: waitAlert?.key || null });
      }
      for (const u of await db.prepare("SELECT l.key AS waitKey, r.text AS outcome FROM telegram_log l JOIN telegram_log r ON r.key = 'resolved:' || l.key WHERE l.kind = 'waitSla' AND l.created_at > ? AND r.text LIKE '\u{1F534}%'").all(now - 3 * 36e5)) {
        if (await db.prepare("SELECT 1 FROM telegram_log WHERE key = ?").get("confirm:" + u.waitKey)) continue;
        const phone = u.waitKey.split(":")[1], entry = entryOf(u.waitKey);
        const rec = h.records.find((r) => r.startMs && Math.abs(r.startMs - entry) < 18e4 && samePhone(r.phone, phone) && /^(success|answered|completed)$/i.test(String(r.status).trim()));
        if (!rec) continue;
        const emp = await onExtension(rec.extension, rec.startMs);
        add("confirm:" + u.waitKey, "waitConfirm", emp?.employee_id ?? null, "\u21A9\uFE0F \u062A\u0635\u062D\u064A\u062D \u0645\u0646 \u0633\u062C\u0644 \u0623\u0631\u0627\u0628\u064A\u0643\u0633: \u0627\u0644\u0639\u0645\u064A\u0644 " + mask(phone) + " \u0627\u062A\u0631\u062F \u0639\u0644\u064A\u0647" + (rec.extension ? " \u0645\u0646 \u062A\u062D\u0648\u064A\u0644\u0629 " + rec.extension + (emp ? " (" + name(emp.employee_id) + ")" : "") : "") + (rec.waitSeconds != null ? " \u0628\u0639\u062F " + fmt(rec.waitSeconds) + " \u0627\u0646\u062A\u0638\u0627\u0631" : ""), { replyTo: u.waitKey });
      }
    }
    if (on2("source") && operatingNow && snap && now - snap.observed_at > 9e4)
      addNew("source:" + snap.observed_at, "source", null, "\u26A0\uFE0F \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0648\u0627\u0642\u0641\u0629 \u0645\u0646 " + clock(snap.observed_at) + " (" + fmt((now - snap.observed_at) / 1e3) + ")\n\u0627\u0641\u062A\u062D \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0641\u064A \u0623\u0631\u0627\u0628\u064A\u0643\u0633 \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 \u0627\u0644\u0645\u0634\u0631\u0641\u060C \u0623\u0648 \u0631\u0627\u062C\u0639 \u0635\u0641\u062D\u0629 \xAB\u062D\u0627\u0644\u0629 \u0627\u0644\u0646\u0638\u0627\u0645\xBB");
    return alerts;
  }
  __name(collect, "collect");
  const putSetting = /* @__PURE__ */ __name((k, v) => db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v), "putSetting");
  async function apexBranches() {
    const out = /* @__PURE__ */ new Set();
    for (const r of await db.prepare("SELECT data FROM orders_days ORDER BY received_at DESC LIMIT 3").all()) {
      try {
        for (const b of JSON.parse(r.data).branches || []) if (b.name) out.add(b.name);
      } catch {
      }
    }
    return [...out].sort();
  }
  __name(apexBranches, "apexBranches");
  async function branchGroups() {
    try {
      return JSON.parse((await db.prepare("SELECT value FROM settings WHERE key = 'telegram_branch_groups'").get())?.value || "{}") || {};
    } catch {
      return {};
    }
  }
  __name(branchGroups, "branchGroups");
  const bnorm = /* @__PURE__ */ __name((x) => String(x || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/^\s*(فرع|الدهان)[\s,،]*/g, "").trim(), "bnorm");
  async function branchGroupOf(name, g) {
    if (!name || !Object.keys(g).length) return null;
    if (g[name]) return name;
    if (app2.learn) for (const kind of ["branch:talabat", "branch:site"]) {
      const m = (await app2.learn.pairs(kind)).get(name);
      const best = m && [...m].sort((a, b) => b[1] - a[1]).find(([b]) => g[b]);
      if (best) return best[0];
    }
    const words = /* @__PURE__ */ __name((s) => bnorm(s).split(/[\s،,\-]+/).filter((w2) => w2.length > 2), "words"), w = words(name);
    const hits = Object.keys(g).filter((k) => words(k).some((x) => w.some((y) => y.includes(x) || x.includes(y))));
    return hits.length === 1 ? hits[0] : null;
  }
  __name(branchGroupOf, "branchGroupOf");
  let busy = false;
  app2.telegramTick = /* @__PURE__ */ __name(async function tick(now = app2.now()) {
    if (busy) return 0;
    busy = true;
    let sent = 0;
    try {
      const c = await config2();
      if (!c.enabled || !c.token) return 0;
      const alerts = await collect(c, now);
      if (alerts.length) await db.batch(alerts.map((a) => {
        const insert = "INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at) ";
        const values = [a.key, a.kind, a.employeeId, a.text, now, a.replyTo, a.silent ? now : null];
        return a.kind === "gap" ? db.prepare(insert + "SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM telegram_log l WHERE l.kind = 'gap' AND l.employee_id = ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key))").bind(...values, a.employeeId) : db.prepare(insert + "VALUES (?,?,?,?,?,?,?)").bind(...values);
      }));
      let groups = null;
      for (let pass = 0, copied = true; pass < 2 && copied; pass++) {
        copied = false;
        for (const r of await db.prepare("SELECT * FROM telegram_log WHERE sent_at IS NULL AND tries < 5 AND created_at > ? ORDER BY id LIMIT 500").all(now - 36e5)) {
          if (sent >= 20) break;
          if (r.kind === "ordersComment") continue;
          if (r.kind === "gap" && await db.prepare("SELECT 1 FROM telegram_log l WHERE l.kind = 'gap' AND l.employee_id = ? AND l.id != ? AND l.message_id IS NOT NULL AND l.sent_at IS NOT NULL AND l.error IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key) LIMIT 1").get(r.employee_id, r.id)) {
            await db.prepare("UPDATE telegram_log SET sent_at = ?, error = NULL WHERE id = ? AND sent_at IS NULL").run(now, r.id);
            continue;
          }
          const parent = r.reply_to ? await db.prepare("SELECT * FROM telegram_log WHERE key = ?").get(r.reply_to) : null;
          const target = r.target || (r.kind.startsWith("orders") ? r.kind.split(":")[0] === "ordersLate" ? "branches" : "online" : null);
          if (target === "branches") {
            const g = groups || (groups = await branchGroups()), name = r.branch && !parent?.message_id ? await branchGroupOf(r.branch, g) : null;
            if (name) {
              await db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,NULL,?,?)").run("b:" + r.key, r.kind, null, r.text, r.created_at, r.reply_to ? "b:" + r.reply_to : null, "branch:" + name, r.branch);
              await db.prepare("UPDATE telegram_log SET sent_at = ?, error = 'routed:branch' WHERE id = ? AND sent_at IS NULL").run(now, r.id);
              copied = true;
            } else await db.prepare("UPDATE telegram_log SET tries = 5, error = ? WHERE id = ? AND sent_at IS NULL").run("\u0645\u0641\u064A\u0634 \u062C\u0631\u0648\u0628 \u0644\u0644\u0641\u0631\u0639" + (r.branch ? " (" + r.branch + ")" : ""), r.id);
            continue;
          }
          if (r.reply_to && (!parent?.message_id || parent.error)) continue;
          const delivered = parent ? await db.prepare("SELECT value FROM settings WHERE key = ?").get("telegram_delivery:" + parent.key) : null;
          const chat = delivered?.value || (target?.startsWith("branch:") ? (groups || (groups = await branchGroups()))[target.slice(7)]?.id : target === "branches" ? c.branch_chat_id : target === "online" ? c.online_chat_id : c.chat_id);
          if (!chat) continue;
          const claim = await db.prepare("UPDATE telegram_log SET sent_at = ?, tries = tries + 1 WHERE id = ? AND sent_at IS NULL").run(app2.now(), r.id);
          if (!claim.changes) continue;
          try {
            const sourceText = platformAlertText(r.text, r.kind, r.key);
            const text = target === "branches" || target?.startsWith("branch:") ? branchMessage(sourceText) : sourceText;
            const m = await call("sendMessage", { chat_id: chat, text, ...parent?.message_id ? { reply_parameters: { message_id: parent.message_id, allow_sending_without_reply: true } } : {} }, c.token);
            await db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("telegram_delivery:" + r.key, String(chat));
            await db.prepare("UPDATE telegram_log SET error = NULL, message_id = ? WHERE id = ?").run(m?.message_id ?? null, r.id);
            sent++;
          } catch (e) {
            if (e.definitiveRejection) await db.prepare("UPDATE telegram_log SET sent_at = NULL, error = ? WHERE id = ?").run(String(e.message).slice(0, 300), r.id);
            else await db.prepare("UPDATE telegram_log SET error = 'delivery_unconfirmed' WHERE id = ?").run(r.id);
          }
        }
      }
    } finally {
      busy = false;
    }
    return sent;
  }, "tick");
  let lastLocal = 0;
  app2.telegramDue = async (now) => {
    if (now - lastLocal < TICK_MS) return false;
    lastLocal = now;
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('telegram_tick', '0')").run();
    const r = await db.prepare("UPDATE settings SET value = ? WHERE key = 'telegram_tick' AND CAST(value AS INTEGER) <= ?").run(String(now), now - TICK_MS);
    return r.changes > 0;
  };
  if (app2.config.telegramTimer === "requests") app2.afterRequest(async (now) => {
    if (await app2.telegramDue(now)) await app2.telegramTick(now);
  });
  else if (app2.config.telegramTimer !== false && typeof setInterval === "function") {
    const t = setInterval(() => app2.telegramTick().catch(() => {
    }), TICK_MS);
    t.unref?.();
  }
}
__name(setup10, "setup");

// ../sites/lib/marsad/import-rows.js
var import_rows_exports = {};
__export(import_rows_exports, {
  STATEMENTS: () => STATEMENTS,
  rowsPerStatement: () => rowsPerStatement,
  setup: () => setup11
});

// ../sites/lib/marsad/import-convert.js
var IMPORT_TABLES = [
  "admin_accounts",
  "employees",
  "employee_sessions",
  "events",
  "shift_decisions",
  "history_reports",
  "history_calls",
  "live_snapshots",
  "messages",
  "message_recipients",
  "reviews",
  "saved_reports",
  "audit"
];

// ../sites/lib/marsad/import-rows.js
var NAME = /^[a-z_]{1,40}$/;
var PARAMS = 100;
var STATEMENTS = 40;
var rowsPerStatement = /* @__PURE__ */ __name((columns) => Math.max(1, Math.floor(PARAMS / columns)), "rowsPerStatement");
var MAX_ROWS = 1e3;
function setup11(app2) {
  const { db, fail: fail2 } = app2;
  const imported = /* @__PURE__ */ __name(async () => !!await db.prepare("SELECT 1 FROM employees LIMIT 1").get(), "imported");
  const liveWork = /* @__PURE__ */ __name(async () => !!await db.prepare("SELECT 1 FROM employee_sessions WHERE device NOT LIKE 'legacy:%' LIMIT 1").get(), "liveWork");
  app2.route("GET", "/api/import-old", async (ctx) => {
    await app2.requireAdmin(ctx, "admin");
    const last = await db.prepare("SELECT occurred_at FROM audit WHERE action = 'old_data_imported' ORDER BY id DESC LIMIT 1").get();
    const live = await liveWork();
    return { available: !live, backfill: live && await imported(), imported: await imported(), lastImportAt: last ? new Date(last.occurred_at).toISOString() : null };
  });
  app2.route("POST", "/api/import-old/rows", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    if (who.id !== 0) fail2(403, "\u0627\u0644\u0646\u0642\u0644 \u0628\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0627\u0644\u0631\u0626\u064A\u0633\u064A \u0628\u0633");
    if (await liveWork()) fail2(409, "\u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u0628\u062F\u0623\u0648\u0627 \u064A\u0634\u062A\u063A\u0644\u0648\u0627 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u061B \u0627\u0644\u0646\u0642\u0644 \u0645\u0646 \u0627\u0644\u0642\u062F\u064A\u0645 \u0627\u062A\u0642\u0641\u0644 \u0639\u0634\u0627\u0646 \u0645\u0627\u064A\u0643\u062A\u0628\u0634 \u0641\u0648\u0642 \u0627\u0644\u0634\u063A\u0644 \u0627\u0644\u062C\u062F\u064A\u062F");
    const b = ctx.body || {};
    if (b.action === "begin") return { ok: true, topUp: await imported() };
    if (b.action === "rows") {
      const { table: table3, columns, key: key2, rows } = b;
      const okNames = /* @__PURE__ */ __name((list, max) => Array.isArray(list) && list.length && list.length <= max && list.every((c) => typeof c === "string" && NAME.test(c)), "okNames");
      if (!IMPORT_TABLES.includes(table3)) fail2(400, "\u062C\u062F\u0648\u0644 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");
      if (!okNames(columns, 40) || new Set(columns).size !== columns.length) fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      if (!okNames(key2, 4) || !key2.every((k) => columns.includes(k))) fail2(400, "\u0645\u0641\u062A\u0627\u062D \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
      if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail2(400, "\u0635\u0641\u0648\u0641 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      for (const r of rows) if (!Array.isArray(r) || r.length !== columns.length || !r.every((v) => v === null || typeof v === "string" || typeof v === "number")) fail2(400, "\u0635\u0641 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
      if (!rows.length) return { ok: true, count: 0 };
      const per = rowsPerStatement(columns.length);
      if (rows.length > per * STATEMENTS) fail2(400, "\u062F\u0641\u0639\u0629 \u0643\u0628\u064A\u0631\u0629");
      if (table3 === "audit") {
        if (columns.includes("id") || !columns.includes("details") || key2.length !== 1 || key2[0] !== "details") fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
        const at = columns.indexOf("details");
        const ids = rows.map((r) => {
          try {
            return Number(JSON.parse(r[at]).legacyId);
          } catch {
            return NaN;
          }
        });
        if (!ids.every(Number.isSafeInteger)) fail2(400, "\u0633\u062C\u0644 \u0645\u0646 \u063A\u064A\u0631 \u0631\u0642\u0645 \u0642\u062F\u064A\u0645");
        const statements3 = [];
        for (let i = 0; i < ids.length; i += PARAMS) {
          const part = ids.slice(i, i + PARAMS);
          statements3.push(db.prepare("DELETE FROM audit WHERE json_extract(details, '$.legacyId') IN (" + part.map(() => "?").join(", ") + ")").bind(...part));
        }
        const per2 = rowsPerStatement(columns.length), one3 = "(" + columns.map(() => "?").join(", ") + ")";
        for (let i = 0; i < rows.length; i += per2) {
          const part = rows.slice(i, i + per2);
          statements3.push(db.prepare("INSERT INTO audit (" + columns.join(", ") + ") VALUES " + part.map(() => one3).join(", ")).bind(...part.flat()));
        }
        await db.batch(statements3);
        return { ok: true, count: rows.length };
      }
      const rest = columns.filter((c) => !key2.includes(c));
      const one2 = "(" + columns.map(() => "?").join(", ") + ")";
      const head = "INSERT INTO " + table3 + " (" + columns.join(", ") + ") VALUES ";
      const tail = " ON CONFLICT (" + key2.join(", ") + ") " + (rest.length ? "DO UPDATE SET " + rest.map((c) => c + " = excluded." + c).join(", ") : "DO NOTHING");
      const statements2 = [];
      for (let i = 0; i < rows.length; i += per) {
        const part = rows.slice(i, i + per);
        statements2.push(db.prepare(head + part.map(() => one2).join(", ") + tail).bind(...part.flat()));
      }
      await db.batch(statements2);
      return { ok: true, count: rows.length };
    }
    if (b.action === "finish") {
      const report2 = b.report && typeof b.report === "object" ? b.report : {};
      await app2.audit("old_data_imported", null, { actor: who.name, ...Object.fromEntries(Object.entries(report2).filter(([, v]) => typeof v === "number")) });
      return { ok: true };
    }
    fail2(400, "action \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");
  }, { limit: 8 * 1024 * 1024 });
  const BACKFILL = /* @__PURE__ */ new Set(["employees", "admin_accounts", "employee_sessions", "events", "shift_decisions", "live_snapshots", "messages", "message_recipients", "reviews", "saved_reports", "audit"]);
  const one = /* @__PURE__ */ __name((columns) => "(" + columns.map(() => "?").join(", ") + ")", "one");
  const insertIgnore = /* @__PURE__ */ __name((table3, columns, rows) => {
    const per = rowsPerStatement(columns.length), out = [];
    for (let i = 0; i < rows.length; i += per) {
      const part = rows.slice(i, i + per);
      out.push(db.prepare("INSERT OR IGNORE INTO " + table3 + " (" + columns.join(", ") + ") VALUES " + part.map(() => one(columns)).join(", ")).bind(...part.flat()));
    }
    return out;
  }, "insertIgnore");
  app2.route("POST", "/api/import-old/backfill", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    if (who.id !== 0) fail2(403, "\u0627\u0644\u0646\u0642\u0644 \u0628\u0627\u0644\u0628\u0627\u0633\u0648\u0631\u062F \u0627\u0644\u0631\u0626\u064A\u0633\u064A \u0628\u0633");
    const b = ctx.body || {};
    if (b.action === "status") {
      const r = await db.prepare("SELECT MAX(e.occurred_at) m FROM events e JOIN employee_sessions s ON s.id = e.session_id WHERE s.device LIKE 'legacy:%'").get();
      return { legacyThrough: r?.m ?? null };
    }
    if (b.action === "finish") {
      const report2 = b.report && typeof b.report === "object" ? b.report : {};
      await app2.audit("old_data_backfilled", null, { actor: who.name, ...Object.fromEntries(Object.entries(report2).filter(([, v]) => typeof v === "number")) });
      return { ok: true };
    }
    if (b.action === "history") {
      const { date, report: r, calls } = b;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !r || !Array.isArray(calls) || calls.length > 5e3 || !calls.every((c) => typeof c === "string")) fail2(400, "\u064A\u0648\u0645 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
      if (await db.prepare("SELECT 1 FROM history_reports WHERE date = ? AND source NOT LIKE 'legacy:%'").get(date)) return { ok: true, skipped: "collected_here" };
      const source = "legacy:" + String(r.source || "").replace(/^legacy:/, "");
      const statements3 = [
        db.prepare("DELETE FROM history_calls WHERE report_id IN (SELECT id FROM history_reports WHERE date = ? AND source LIKE 'legacy:%')").bind(date),
        db.prepare("DELETE FROM history_reports WHERE date = ? AND source LIKE 'legacy:%'").bind(date),
        db.prepare("INSERT INTO history_reports (date, imported_at, source, verified_total, expected_count, header, fingerprint) VALUES (?,?,?,?,?,?,?)").bind(date, Number(r.imported_at) || ctx.now, source, r.verified_total ? 1 : 0, r.expected_count ?? null, String(r.header || "[]"), String(r.fingerprint || ""))
      ];
      const per = Math.floor((PARAMS - 2) / 2);
      for (let i = 0; i < calls.length; i += per) {
        const part = calls.slice(i, i + per);
        statements3.push(db.prepare("WITH v(idx, raw) AS (VALUES " + part.map(() => "(?, ?)").join(", ") + ") INSERT INTO history_calls (report_id, idx, raw) SELECT (SELECT id FROM history_reports WHERE date = ? AND source = ? ORDER BY id DESC LIMIT 1), idx, raw FROM v").bind(...part.flatMap((raw, k) => [i + k, raw]), date, source));
      }
      if (statements3.length > STATEMENTS + 3 + 120) fail2(400, "\u064A\u0648\u0645 \u0643\u0628\u064A\u0631");
      await db.batch(statements3);
      return { ok: true, count: calls.length };
    }
    if (b.action !== "rows") fail2(400, "action \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");
    const { table: table3, columns, rows } = b;
    if (!BACKFILL.has(table3)) fail2(400, "\u062C\u062F\u0648\u0644 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");
    if (!Array.isArray(columns) || !columns.length || columns.length > 40 || !columns.every((c) => typeof c === "string" && NAME.test(c)) || new Set(columns).size !== columns.length) fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail2(400, "\u0635\u0641\u0648\u0641 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
    for (const r of rows) if (!Array.isArray(r) || r.length !== columns.length || !r.every((v) => v === null || typeof v === "string" || typeof v === "number")) fail2(400, "\u0635\u0641 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    if (!rows.length) return { ok: true, count: 0 };
    let statements2 = [];
    if (table3 === "employee_sessions") {
      if (columns.includes("id") || !columns.includes("device")) fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      const at = columns.indexOf("device"), rest = columns.filter((c) => c !== "device");
      if (rows.length > STATEMENTS / 2) fail2(400, "\u062F\u0641\u0639\u0629 \u0643\u0628\u064A\u0631\u0629");
      for (const r of rows) {
        if (!/^legacy:/.test(String(r[at]))) fail2(400, "\u062C\u0644\u0633\u0629 \u0645\u0634 \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0642\u062F\u064A\u0645");
        const vals = rest.map((c) => r[columns.indexOf(c)]);
        statements2.push(db.prepare("UPDATE employee_sessions SET " + rest.map((c) => c + " = ?").join(", ") + " WHERE device = ?").bind(...vals, r[at]));
        statements2.push(db.prepare("INSERT INTO employee_sessions (" + columns.join(", ") + ") SELECT " + columns.map(() => "?").join(", ") + " WHERE NOT EXISTS (SELECT 1 FROM employee_sessions WHERE device = ?)").bind(...r, r[at]));
      }
    } else if (table3 === "events" || table3 === "shift_decisions") {
      if (columns.includes("id") || columns.includes("session_id") || !columns.includes("device")) fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      const at = columns.indexOf("device"), devices = [...new Set(rows.map((r) => String(r[at])))];
      if (devices.length > PARAMS || !devices.every((d) => /^legacy:/.test(d))) fail2(400, "\u062C\u0644\u0633\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      const ids = new Map((await db.prepare("SELECT id, device FROM employee_sessions WHERE device IN (" + devices.map(() => "?").join(", ") + ")").all(...devices)).map((x) => [x.device, x.id]));
      const cols = columns.map((c) => c === "device" ? "session_id" : c);
      const mapped = rows.filter((r) => ids.has(String(r[at]))).map((r) => r.map((v, i) => i === at ? ids.get(String(v)) : v));
      statements2 = insertIgnore(table3, cols, mapped);
    } else if (table3 === "audit") {
      if (columns.includes("id") || !columns.includes("details")) fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      const at = columns.indexOf("details"), ids = rows.map((r) => {
        try {
          return Number(JSON.parse(r[at]).legacyId);
        } catch {
          return NaN;
        }
      });
      if (!ids.every(Number.isSafeInteger)) fail2(400, "\u0633\u062C\u0644 \u0645\u0646 \u063A\u064A\u0631 \u0631\u0642\u0645 \u0642\u062F\u064A\u0645");
      for (let i = 0; i < ids.length; i += PARAMS) {
        const part = ids.slice(i, i + PARAMS);
        statements2.push(db.prepare("DELETE FROM audit WHERE json_extract(details, '$.legacyId') IN (" + part.map(() => "?").join(", ") + ")").bind(...part));
      }
      const per = rowsPerStatement(columns.length);
      for (let i = 0; i < rows.length; i += per) {
        const part = rows.slice(i, i + per);
        statements2.push(db.prepare("INSERT INTO audit (" + columns.join(", ") + ") VALUES " + part.map(() => one(columns)).join(", ")).bind(...part.flat()));
      }
    } else {
      if (table3 === "live_snapshots" && columns.includes("id")) fail2(400, "\u0623\u0639\u0645\u062F\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
      statements2 = insertIgnore(table3, columns, rows);
    }
    if (statements2.length > STATEMENTS + 20) fail2(400, "\u062F\u0641\u0639\u0629 \u0643\u0628\u064A\u0631\u0629");
    if (statements2.length) await db.batch(statements2);
    return { ok: true, count: rows.length };
  }, { limit: 8 * 1024 * 1024 });
}
__name(setup11, "setup");

// ../sites/lib/marsad/ops.js
var ops_exports = {};
__export(ops_exports, {
  setup: () => setup12
});
var STATUSES = ["new", "in_progress", "resolved", "reviewed"];
var validDate2 = /* @__PURE__ */ __name((d) => typeof d === "string" && validDate(d), "validDate");
function setup12(app2) {
  const { db, fail: fail2 } = app2;
  app2.route("GET", "/api/reviews", async (ctx) => {
    await app2.requireAdmin(ctx);
    const date = ctx.query.from || ctx.query.date, to = ctx.query.to || date;
    if ((date || to) && (!validDate2(date) || !validDate2(to) || to < date)) fail2(400, "\u0641\u062A\u0631\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
    const open = ctx.query.open === "1";
    const rows = open ? await db.prepare("SELECT * FROM reviews WHERE status IN ('new','in_progress') ORDER BY updated_at DESC LIMIT 300").all() : await db.prepare("SELECT * FROM reviews WHERE date >= ? AND date <= ? ORDER BY updated_at DESC").all(validDate2(date) ? date : "", validDate2(to) ? to : "");
    return { reviews: rows.map((r) => ({ id: r.id, date: r.date, employeeId: r.employee_id, title: r.title, owner: r.owner, status: r.status, note: r.note, updatedAt: iso(r.updated_at), updatedBy: r.updated_by })) };
  });
  app2.route("POST", "/api/reviews", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const b = ctx.body || {};
    const title2 = String(b.title || "").trim(), note = String(b.note || "").trim(), owner = String(b.owner || "").trim();
    if (!STATUSES.includes(b.status)) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u062D\u0627\u0644\u0629");
    if (b.id) {
      const r = await db.prepare("SELECT * FROM reviews WHERE id = ?").get(String(b.id));
      if (!r) fail2(404, "\u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
      await db.prepare("UPDATE reviews SET status = ?, note = ?, owner = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(b.status, note.slice(0, 2e3) || r.note, owner.slice(0, 100) || r.owner, ctx.now, who.name, r.id);
      await app2.audit("review_updated", r.employee_id, { actor: who.name, title: r.title, status: b.status });
      return { ok: true, id: r.id };
    }
    if (!validDate2(b.date)) fail2(400, "\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    if (!title2 || title2.length > 200) fail2(400, "\u0627\u0643\u062A\u0628 \u0627\u0644\u0645\u0648\u0636\u0648\u0639");
    const id2 = randomUUID(), employeeId = b.employeeId ? Number(b.employeeId) : null;
    await db.prepare("INSERT INTO reviews (id, date, reference, employee_id, title, owner, status, note, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id2, b.date, id2, employeeId, title2, owner.slice(0, 100) || null, b.status, note.slice(0, 2e3) || null, ctx.now, who.name);
    await app2.audit("review_added", employeeId, { actor: who.name, title: title2 });
    return { ok: true, id: id2 };
  });
  app2.route("GET", "/api/saved-reports", async (ctx) => {
    await app2.requireAdmin(ctx);
    const id2 = ctx.query.id;
    if (id2) {
      const r = await db.prepare("SELECT * FROM saved_reports WHERE id = ?").get(id2);
      if (!r) fail2(404, "\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
      return { id: r.id, date: r.date, createdAt: iso(r.created_at), filters: JSON.parse(r.filters || "{}"), payload: JSON.parse(r.payload) };
    }
    const date = ctx.query.from || ctx.query.date, to = ctx.query.to || date;
    if ((date || to) && (!validDate2(date) || !validDate2(to) || to < date)) fail2(400, "\u0641\u062A\u0631\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
    const rows = await db.prepare("SELECT id, date, created_at, filters FROM saved_reports WHERE date >= ? AND date <= ? ORDER BY created_at DESC").all(validDate2(date) ? date : "", validDate2(to) ? to : "");
    return { reports: rows.map((r) => ({ id: r.id, date: r.date, createdAt: iso(r.created_at), filters: JSON.parse(r.filters || "{}") })) };
  });
  app2.route("POST", "/api/saved-reports", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const date = ctx.body?.date;
    if (!validDate2(date)) fail2(400, "\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const d = ctx.body?.to ? await app2.heavy("range", date, ctx.body.to, ctx.now) : await app2.heavy("day", date);
    const payload = { report: d.history.report, queues: d.history.queues, employees: d.employees, slots: d.slots, attribution: d.history.attribution };
    const id2 = randomUUID();
    await db.prepare("INSERT INTO saved_reports (id, date, created_at, filters, payload) VALUES (?,?,?,?,?)").run(id2, date, ctx.now, JSON.stringify({ by: who.name, from: date, to: ctx.body?.to || date }), JSON.stringify(payload));
    await app2.audit("report_saved", null, { actor: who.name, date });
    return { ok: true, id: id2 };
  });
  app2.route("GET", "/api/system", async (ctx) => {
    await app2.requireAdmin(ctx);
    const now = ctx.now;
    const [history, live, collectors, devices, audit, status] = await Promise.all([
      db.prepare("SELECT date, imported_at, source, verified_total FROM history_reports ORDER BY imported_at DESC LIMIT 1").get(),
      db.prepare("SELECT observed_at, received_at FROM live_snapshots ORDER BY observed_at DESC LIMIT 1").get(),
      db.prepare("SELECT COUNT(*) n, MAX(created_at) last FROM collector_tokens WHERE revoked_at IS NULL AND refresh_expires_at > ?").get(now),
      db.prepare(`SELECT s.id, s.employee_id, e.name, s.extension, s.client_version, s.last_seen, s.issued_at, s.revoked_at FROM employee_sessions s LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.last_seen > ? AND s.device NOT LIKE 'legacy:%' ORDER BY s.last_seen DESC LIMIT 200`).all(now - 24 * 36e5),
      db.prepare("SELECT a.occurred_at, a.action, a.employee_id, a.details, e.name FROM audit a LEFT JOIN employees e ON e.id = a.employee_id ORDER BY a.id DESC LIMIT 300").all(),
      db.prepare("SELECT value FROM settings WHERE key = 'collector_status'").get()
    ]);
    let report2 = null;
    try {
      report2 = status ? JSON.parse(status.value) : null;
    } catch {
    }
    return {
      serverNow: iso(now),
      collector: { linked: collectors.n, linkedAt: iso(collectors.last), lastHistory: history ? { date: history.date, at: iso(history.imported_at), verified: !!history.verified_total } : null, lastLive: live ? iso(live.observed_at) : null, report: report2 },
      devices: devices.map((d) => ({ sessionId: d.id, employeeId: d.employee_id, name: d.name || "\u062D\u0633\u0627\u0628 \u0645\u062D\u0630\u0648\u0641", extension: d.extension, version: d.client_version, lastSeen: iso(d.last_seen), startedAt: iso(d.issued_at), open: d.revoked_at == null })),
      audit: audit.map((a) => {
        let x = {};
        try {
          x = JSON.parse(a.details);
        } catch {
        }
        return { at: iso(a.occurred_at), action: a.action, employee: a.name || null, actor: x.actor || null, details: x };
      })
    };
  });
}
__name(setup12, "setup");

// ../sites/lib/marsad/range.js
var range_exports = {};
__export(range_exports, {
  setup: () => setup13
});
function setup13(app2) {
  app2.range = async (from, to, now = app2.now()) => {
    if (!validDate(from) || !validDate(to) || to < from || to > businessDay(now)) app2.fail(400, "\u0627\u062E\u062A\u0627\u0631 \u0641\u062A\u0631\u0629 \u0635\u062D\u064A\u062D\u0629 \u0645\u0646 \u0648\u0625\u0644\u0649");
    const dates = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      dates.push(d);
      if (dates.length > 93) app2.fail(400, "\u0627\u062E\u062A\u0627\u0631 \u0641\u062A\u0631\u0629 \u0644\u0627 \u062A\u062A\u062C\u0627\u0648\u0632 93 \u064A\u0648\u0645");
    }
    if (dates.length === 1) return app2.day(from, now);
    const days = [], records = [];
    for (const date of dates) {
      const d = await app2.day(date, now);
      days.push(d);
      records.push(...d.raw.records);
    }
    const sum = summarize(records), reports = days.map((d) => d.history.report).filter(Boolean), employees = /* @__PURE__ */ new Map();
    const fields = ["calls", "inbound", "outbound", "answered", "fromHistory", "talkSeconds", "longCalls", "workSeconds", "readySeconds", "callSeconds", "breakSeconds", "breakCount", "ongoingBreakSeconds", "gapSeconds", "outArabicssSeconds", "outExtensionSeconds", "outBrowserSeconds"];
    for (const d of days) for (const e of d.employees) {
      let out = employees.get(e.employeeId);
      if (!out) {
        out = { employeeId: e.employeeId, name: e.name, firstLogin: null, lastLogout: null, overBreakDays: 0, daysWorked: 0, ...Object.fromEntries(fields.map((k) => [k, 0])) };
        employees.set(e.employeeId, out);
      }
      out.daysWorked++;
      if (e.breakSeconds > 1800) out.overBreakDays++;
      for (const k of fields) out[k] += e[k] || 0;
      if (e.firstLogin && (!out.firstLogin || e.firstLogin < out.firstLogin)) out.firstLogin = e.firstLogin;
      if (e.lastLogout && (!out.lastLogout || e.lastLogout > out.lastLogout)) out.lastLogout = e.lastLogout;
    }
    for (const e of employees.values()) e.averageCallSeconds = e.answered ? Math.round(e.talkSeconds / e.answered) : null;
    const flat = /* @__PURE__ */ __name((key2) => days.flatMap((d) => d[key2].map((row) => ({ ...row, businessDate: d.date }))), "flat");
    return {
      date: from,
      from,
      to,
      days: dates.length,
      serverNow: iso(now),
      window: { start: days[0].window.start, end: days.at(-1).window.end, operatingEnd: days.at(-1).window.operatingEnd },
      employees: [...employees.values()],
      sessions: flat("sessions"),
      states: flat("states"),
      calls: flat("calls"),
      slots: flat("slots"),
      history: {
        report: reports.length ? { ...sum.report, date: from, from, to, importedAt: reports.map((r) => r.importedAt).sort().at(-1), verifiedTotal: reports.length === dates.length && reports.every((r) => r.verifiedTotal), missingCalendarDates: [...new Set(days.flatMap((d) => d.history.report?.missingCalendarDates || (d.history.report ? [] : [d.date])))] } : null,
        queues: sum.queues,
        missed: days.flatMap((d) => d.history.missed.map((m) => ({ ...m, businessDate: d.date }))),
        unattributed: days.flatMap((d) => d.history.unattributed.map((m) => ({ ...m, businessDate: d.date }))),
        attribution: Object.fromEntries(["alreadySeen", "recovered", "unattributed"].map((k) => [k, days.reduce((n, d) => n + (d.history.attribution[k] || 0), 0)]))
      }
    };
  };
}
__name(setup13, "setup");

// ../sites/lib/marsad/orders.js
var orders_exports = {};
__export(orders_exports, {
  KINDS: () => KINDS,
  setup: () => setup15
});

// ../sites/lib/marsad/reviews.js
var reviews_exports = {};
__export(reviews_exports, {
  REASONS: () => REASONS,
  entrySignature: () => entrySignature,
  setup: () => setup14
});
var LEARN_AT = 3;
var REASONS = { transfer: "\u062A\u062D\u0648\u064A\u0644 \u0628\u064A\u0646 \u0627\u0644\u0641\u0631\u0648\u0639", intended: "\u0645\u0642\u0635\u0648\u062F / \u0645\u062A\u0641\u0642 \u0639\u0644\u064A\u0647", fixed: "\u0627\u062A\u0635\u0644\u0651\u062D", customer: "\u0637\u0644\u0628 \u0627\u0644\u0639\u0645\u064A\u0644", system: "\u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0627\u0644\u0633\u064A\u0633\u062A\u0645", other: "\u0633\u0628\u0628 \u062A\u0627\u0646\u064A" };
function setup14(app2) {
  const { db, fail: fail2 } = app2;
  async function patterns() {
    const out = /* @__PURE__ */ new Map();
    for (const r of await db.prepare("SELECT signature, verdict, reason, COUNT(*) n FROM exception_reviews WHERE signature IS NOT NULL GROUP BY signature, verdict, reason").all()) {
      const p = out.get(r.signature) || { ok: 0, error: 0, reasons: {} };
      if (r.verdict === "ok") {
        p.ok += r.n;
        p.reasons[r.reason || "other"] = (p.reasons[r.reason || "other"] || 0) + r.n;
      } else p.error += r.n;
      out.set(r.signature, p);
    }
    for (const p of out.values()) {
      p.reason = Object.entries(p.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      p.learned = p.ok >= LEARN_AT && p.error === 0;
    }
    return out;
  }
  __name(patterns, "patterns");
  app2.reviewPatterns = patterns;
  app2.learnedOk = async (signature) => !!(await patterns()).get(signature)?.learned;
  app2.route("GET", "/api/exception-reviews", async (ctx) => {
    await app2.requireAdmin(ctx);
    const from = validDate(String(ctx.query.from || "")) ? ctx.query.from : businessDay(ctx.now), to = validDate(String(ctx.query.to || "")) ? ctx.query.to : from;
    const rows = await db.prepare("SELECT * FROM exception_reviews WHERE day >= ? AND day <= ? ORDER BY at DESC").all(from, to);
    const p = await patterns();
    return {
      reasons: REASONS,
      learnAt: LEARN_AT,
      reviews: rows.map((r) => ({ key: r.key, source: r.source, ref: r.ref, day: r.day, verdict: r.verdict, reason: r.reason, note: r.note, by: r.by_name, at: iso(r.at), signature: r.signature })),
      patterns: Object.fromEntries([...p].map(([k, v]) => [k, { ok: v.ok, error: v.error, reason: v.reason, learned: v.learned }]))
    };
  });
  app2.route("POST", "/api/exception-reviews", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const b = ctx.body || {}, key2 = String(b.key || "").slice(0, 160);
    if (!key2) fail2(400, "invalid_key");
    const before = await db.prepare("SELECT * FROM exception_reviews WHERE key = ?").get(key2);
    if (b.verdict == null) {
      await db.batch([
        db.prepare("INSERT INTO audit (occurred_at,action,employee_id,details) VALUES (?,?,NULL,?)").bind(ctx.now, "exception_review_cleared", JSON.stringify({ actor: who.name, key: key2, before: before || null, after: null, reason: String(b.note || "").slice(0, 500) || null })),
        db.prepare("DELETE FROM exception_reviews WHERE key = ?").bind(key2)
      ]);
      return { ok: true };
    }
    if (!["ok", "error"].includes(b.verdict)) fail2(400, "invalid_verdict");
    if (b.verdict === "ok" && b.reason && !REASONS[b.reason]) fail2(400, "invalid_reason");
    const day = validDate(String(b.day || "")) ? b.day : businessDay(ctx.now);
    await db.prepare(`INSERT INTO exception_reviews (key, source, ref, day, verdict, reason, note, signature, by_name, at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, note = excluded.note, signature = COALESCE(excluded.signature, exception_reviews.signature), by_name = excluded.by_name, at = excluded.at`).run(
      key2,
      String(b.source || "").slice(0, 40),
      String(b.ref || "").slice(0, 40),
      day,
      b.verdict,
      b.verdict === "ok" ? b.reason || "other" : null,
      String(b.note || "").slice(0, 500) || null,
      b.signature ? String(b.signature).slice(0, 200) : null,
      who.name,
      ctx.now
    );
    await app2.audit("exception_review", null, { actor: who.name, key: key2, verdict: b.verdict, reason: b.reason, before: before || null, after: { verdict: b.verdict, reason: b.reason || null, note: b.note || null } });
    return { ok: true };
  });
}
__name(setup14, "setup");
var entrySignature = /* @__PURE__ */ __name((i) => "entry:" + (i.type || "") + ":" + (i.kind || "") + ":" + (i.branch || ""), "entrySignature");

// ../sites/lib/marsad/orders.js
var KINDS = ["ordersLate", "ordersCancel", "ordersComment", "ordersDiscount", "ordersEntry", "ordersEntryLate", "ordersStale"];
var STALE_MS = 3 * 6e4;
var CHECK_MS = 6e4;
var BRANCH_KINDS = /* @__PURE__ */ new Set(["ordersLate", "ordersCancel"]);
var DELAY_KINDS = /* @__PURE__ */ new Set(["ordersLate", "ordersEntryLate"]);
function setup15(app2) {
  const { db, fail: fail2 } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const rulesOn = /* @__PURE__ */ __name(async () => {
    const c = await db.prepare("SELECT rules FROM telegram_config WHERE id = 1").get();
    let r = {};
    try {
      r = JSON.parse(c?.rules || "{}");
    } catch {
    }
    return (k) => r[k] !== false;
  }, "rulesOn");
  const queue = /* @__PURE__ */ __name(async (alerts, now) => {
    if (!alerts.length) return;
    const on2 = await rulesOn();
    await db.batch(alerts.map((a) => db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,?,?,?)").bind(a.key, a.kind, null, a.text, now, a.replyTo || null, on2(a.kind) || a.replyTo ? null : now, a.target || (BRANCH_KINDS.has(a.kind) ? "branches" : "online"), a.branch || null)));
  }, "queue");
  app2.route("GET", "/api/orders/token", async (ctx) => {
    await app2.requireAdmin(ctx, "admin");
    const last = Number(await setting("orders_last_push")) || null;
    return { linked: !!await setting("orders_token_hash"), lastPush: iso(last) };
  });
  app2.route("POST", "/api/orders/token", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const token = "ord_" + randomToken(24);
    await put("orders_token_hash", sha256(token));
    await app2.audit("orders_token_created", null, { actor: who.name });
    return { token };
  });
  const fuzzy = /* @__PURE__ */ __name((x) => String(x || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/^\s*(فرع|الدهان)[\s,،]*/g, "").trim(), "fuzzy");
  const talabatSide = /* @__PURE__ */ __name(async (day) => {
    const out = /* @__PURE__ */ new Map();
    if (!app2.talabat?.matchDay) return out;
    const m = await app2.talabat.matchDay(day).catch(() => null);
    if (!m) return out;
    const ids = m.rows.filter((o) => m.matches.get(o.id)).map((o) => o.id);
    if (!ids.length) return out;
    const prof = /* @__PURE__ */ new Map();
    for (let i = 0; i < ids.length; i += 80) {
      const part = ids.slice(i, i + 80);
      for (const r of await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'talabat' AND ref IN (" + part.map(() => "?").join(",") + ")").all(...part)) prof.set(r.ref, r.data);
    }
    for (const id2 of ids) {
      let p = {};
      try {
        p = JSON.parse(prof.get(id2) || "{}") || {};
      } catch {
      }
      const parts = String(p.address || "").split(" \u2014 ")[0].split("\u060C").map((x) => x.trim()).filter(Boolean);
      const area2 = String(p.area || "").trim() || (parts.length >= 3 ? parts[parts.length - 2] : "");
      const noteLine = (p.bill || []).find((x) => x.k === "\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0639\u0645\u064A\u0644" || /^ملاحظة العميل\s*\|/.test(x.text || ""));
      const note = noteLine ? String(noteLine.text).replace(/^ملاحظة العميل\s*\|\s*/, "").trim() : "";
      if (area2 || note) out.set(String(m.matches.get(id2).no), { area: area2.slice(0, 80), note: note.slice(0, 300) });
    }
    return out;
  }, "talabatSide");
  app2.apexDetails = async (day, options = {}) => {
    let d = null;
    try {
      const r = await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day);
      d = r ? JSON.parse(r.data) : null;
    } catch {
    }
    const det = d?.details || {}, st = d?.branchStatus || {};
    const tal = options.talabat ? await talabatSide(day).catch(() => /* @__PURE__ */ new Map()) : /* @__PURE__ */ new Map();
    const extra = /* @__PURE__ */ __name((no) => {
      const t = no == null ? null : tal.get(String(no));
      const x = { ...no == null ? {} : det[String(no)] || {} };
      if (t && !x.loc && t.area) x.loc = t.area + " (\u0645\u0646 \u0637\u0644\u0628\u0627\u062A)";
      if (t && !x.note && t.note) x.note = t.note + " (\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A)";
      if (!x.loc && !x.note && !x.items?.length && !x.msgs?.length) return "";
      return (x.loc ? "\n\u{1F4CD} \u0627\u0644\u0645\u0646\u0637\u0642\u0629: " + x.loc : "") + (x.note ? "\n\u{1F4AC} \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0623\u0648\u0631\u062F\u0631: " + x.note : "") + (x.items?.length ? "\n\u{1F37D}\uFE0F \u062A\u0639\u0644\u064A\u0642\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0635\u0646\u0627\u0641:\n" + x.items.join("\n") : "") + (x.msgs?.length ? "\n\u{1F4E8} \u0643\u0648\u0645\u0646\u062A\u0627\u062A \u0627\u062A\u0628\u0639\u062A\u062A \u0628\u0639\u062F \u0627\u0644\u0636\u0631\u0628:\n" + x.msgs.join("\n") : "");
    }, "extra");
    const status = /* @__PURE__ */ __name((branch) => {
      if (!branch) return "";
      const key2 = st[branch] ? branch : Object.keys(st).find((k) => {
        const a = fuzzy(k), b = fuzzy(branch);
        return a && b && (a.includes(b.split(/[\s،,-]+/)[0]) || b.includes(a.split(/[\s،,-]+/)[0]));
      });
      return key2 ? "\n\n" + st[key2] : "";
    }, "status");
    return { extra, status };
  };
  app2.route("POST", "/api/orders/push", async (ctx) => {
    const hash = await setting("orders_token_hash"), given = ctx.header("x-orders-token");
    if (!hash || !given || sha256(given) !== hash) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0645\u0631\u0635\u062F \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    let b = ctx.body;
    if (!validDate(String(b.day || ""))) fail2(400, "invalid_day");
    const existing = await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(b.day);
    let before = {};
    try {
      before = JSON.parse(existing?.data || "{}");
    } catch {
    }
    const replay = b.replayAlerts === true;
    if (replay) {
      if (!existing) fail2(409, "snapshot_required_before_alert_replay");
      b = { ...before, day: b.day, alerts: b.alerts };
    }
    const sourceAt = Date.parse(b.generatedAt || ""), previousAt = Date.parse(before.generatedAt || "");
    if (b.generatedAt && !Number.isFinite(sourceAt)) fail2(400, "invalid_snapshot_time");
    if (Number.isFinite(previousAt) && (!Number.isFinite(sourceAt) || sourceAt < previousAt))
      return { ok: true, ignored: "older_snapshot" };
    if (Array.isArray(b.online)) {
      const old = new Map((before.online || []).map((o) => [String(o.no), o]));
      b.online = b.online.map((o) => {
        const prior = old.get(String(o.no));
        return {
          ...o,
          ...!Object.hasOwn(o, "customer") && prior?.customer ? { customer: prior.customer } : {},
          ...!Object.hasOwn(o, "items") && prior?.items ? { items: prior.items } : {},
          ...!Object.hasOwn(o, "sourceRefs") && prior?.sourceRefs ? { sourceRefs: prior.sourceRefs } : {}
        };
      });
    }
    const data = JSON.stringify({ ...b, alerts: void 0 });
    if (data.length > 9e5) fail2(413, "payload_too_large");
    const previous = Number(await setting("orders_last_push")) || null;
    const stored = replay ? { changes: 1 } : await db.prepare("INSERT INTO orders_days (day, data, received_at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data, received_at = excluded.received_at WHERE orders_days.data = ?").run(b.day, data, ctx.now, existing?.data ?? null);
    if (!stored.changes) fail2(409, "snapshot_changed_retry");
    if (!replay) await put("orders_last_push", ctx.now);
    app2.talabat?.invalidate?.(b.day);
    const alerts = [];
    const stateKey = "orders_alert_states:" + b.day;
    let states = {};
    try {
      states = JSON.parse(await setting(stateKey) || "{}");
    } catch {
    }
    const rows = /* @__PURE__ */ __name((name) => Array.isArray(b[name]) ? b[name] : [], "rows");
    const findNo = /* @__PURE__ */ __name((no) => no && ["open", "lateOut", "cancels", "online", "issues"].map((k) => rows(k).find((o) => String(o.no) === no)).find(Boolean), "findNo");
    const branchOfNo = /* @__PURE__ */ __name((no) => no && ["open", "lateOut", "cancels", "online", "issues"].map((k) => rows(k).find((o) => String(o.no) === no)).find(Boolean)?.branch || null, "branchOfNo");
    const orderNo = /* @__PURE__ */ __name((a) => String(a.orderNo ?? a.orderId ?? (/^(?:v?late|del|disc|pay|dup|entry|entrylate|lateentry|duplicate|cancel|note):([0-9]+)(?::|$)/i.exec(String(a.key))?.[1] || "")), "orderNo");
    const needTalabat = rows("open").some((o) => o.kind === "\u0637\u0644\u0628\u0627\u062A") && (Array.isArray(b.alerts) ? b.alerts : []).some((a) => a && DELAY_KINDS.has(a.kind)) || Object.values(states).some((x) => x?.kind === "ordersLate" && !["resolved", "deleted", "merged", "learned"].includes(x.status) && rows("lateOut").some((o) => String(o.no) === x.no && o.out && o.kind === "\u0637\u0644\u0628\u0627\u062A"));
    const apexDetails = app2.apexDetails ? await app2.apexDetails(b.day, { talabat: needTalabat }) : null;
    const withOrderContext = /* @__PURE__ */ __name((text, no, kind) => {
      if (!DELAY_KINDS.has(kind) || !no || !apexDetails?.extra) return text;
      const lines = apexDetails.extra(no).split(/\r?\n/);
      let result = text;
      for (const prefix of ["\u{1F4CD} \u0627\u0644\u0645\u0646\u0637\u0642\u0629:", "\u{1F4AC} \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0623\u0648\u0631\u062F\u0631:"]) {
        const line = lines.find((value) => value.trimStart().startsWith(prefix));
        if (line && !result.split(/\r?\n/).some((value) => value.trimStart().startsWith(prefix))) result += "\n" + line.trim();
      }
      return result;
    }, "withOrderContext");
    delete states["context:comments"];
    for (const a of (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 400).sort((x, y) => !!x?.follow - !!y?.follow)) {
      if (!a || !KINDS.includes(a.kind) || ["ordersStale", "ordersComment"].includes(a.kind) || !a.key || !a.text) continue;
      if (a.follow && String(a.status || "active") === "active") continue;
      const key2 = "orders:" + b.day + ":" + String(a.key).slice(0, 80);
      const old = states[key2], no = orderNo(a), branch = a.branch || branchOfNo(no);
      const text = withOrderContext(apexAlertText(String(a.text).slice(0, 3500), findNo(no) || { no, sn: a.sn }), no, a.kind);
      const target = BRANCH_KINDS.has(a.kind) ? "branches" : "online";
      const status = String(a.status || "active").slice(0, 80);
      const version2 = sha256(JSON.stringify([status, text]));
      if (!old) {
        if (status === "resolved" || a.follow) continue;
        const lateKey = /^vlate:/.test(String(a.key)) ? "orders:" + b.day + ":" + String(a.key).replace(/^v/, "") : null;
        if (lateKey && states[lateKey] && !["resolved", "deleted"].includes(states[lateKey].status)) {
          alerts.push({ key: "state:" + key2, kind: a.kind, text, replyTo: lateKey, target: states[lateKey].target, branch: states[lateKey].branch });
          states[key2] = { no, kind: a.kind, text, status: "merged", version: version2, target };
          continue;
        }
        if (a.kind === "ordersEntry" && app2.learnedOk) {
          const issue = rows("issues").find((i) => String(i.no) === no);
          if (issue && await app2.learnedOk(entrySignature(issue))) {
            states[key2] = { no, kind: a.kind, text, status: "learned", version: version2, target };
            continue;
          }
        }
        alerts.push({ key: key2, kind: a.kind, text, target, branch });
        states[key2] = { no, sn: a.sn ?? findNo(no)?.sn ?? null, kind: a.kind, text, status, version: version2, target, branch };
      } else if (old.version !== version2) {
        const adopt = a.follow && old.status === "active" && /^d-?\d+$/.test(status) || status === "deleted";
        if (!adopt && (old.status !== status || a.changed === true)) alerts.push({
          key: "state:" + key2 + ":" + ((old.sequence || 0) + 1),
          kind: old.kind,
          text,
          replyTo: key2,
          target: old.target,
          branch: old.branch
        });
        states[key2] = { ...old, status, version: version2, text, sequence: (old.sequence || 0) + (!adopt && (old.status !== status || a.changed === true) ? 1 : 0) };
      }
    }
    for (const [key2, old] of Object.entries(states)) {
      if (old.kind === "ordersComment" || ["resolved", "learned", "deleted", "merged"].includes(old.status) || !old.no) continue;
      const out = rows("lateOut").find((o) => String(o.no) === old.no && o.out);
      const cancel = rows("cancels").find((o) => String(o.no) === old.no);
      let text = null;
      if (old.sn == null) old.sn = out?.sn ?? cancel?.sn ?? findNo(old.no)?.sn ?? null;
      const shown = apexReceipt({ sn: old.sn });
      const clockOf = /* @__PURE__ */ __name((v) => new Date(v).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }), "clockOf");
      if (old.kind === "ordersLate" && cancel && !out) {
        old.status = "resolved";
        continue;
      }
      if (old.kind === "ordersLate" && out) text = "\u{1F5A5}\uFE0F Apex | \u2705 \u0623\u0648\u0631\u062F\u0631 " + shown + " \u062E\u0631\u062C \u0645\u0639 \u0627\u0644\u0637\u064A\u0627\u0631" + (out.pilot ? " (" + out.pilot + ")" : "") + (out.out ? " \u0627\u0644\u0633\u0627\u0639\u0629 " + clockOf(out.out) : "") + (out.wait != null ? "\n\u062E\u0631\u062C \u0628\u0639\u062F " + out.wait + " \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0648\u0642\u062A \u0627\u0644\u0636\u0631\u0628" : "") + (out.sched ? "\n\u0627\u0644\u0645\u064A\u0639\u0627\u062F \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0643\u0627\u0646 " + clockOf(out.sched) : "") + (old.branch ? "\n\u0627\u0644\u0641\u0631\u0639: " + old.branch : "") + (apexDetails ? apexDetails.extra(old.no) + apexDetails.status(old.branch) : "");
      if (old.kind === "ordersEntry" && Array.isArray(b.issues) && Number.isInteger(b.totals?.issues) && b.totals.issues === b.issues.length && old.observedIssue && !b.issues.some((o) => String(o.no) === old.no)) text = "\u{1F5A5}\uFE0F Apex | \u2705 \u0623\u0648\u0631\u062F\u0631 " + shown + ": \u063A\u0644\u0637\u0629 \u0627\u0644\u0636\u0631\u0628 \u0627\u062A\u0635\u0644\u0651\u062D\u062A \u0639\u0644\u0649 Apex";
      if (old.kind === "ordersEntry" && rows("issues").some((o) => String(o.no) === old.no)) old.observedIssue = true;
      if (text) {
        alerts.push({ key: "resolved:" + key2 + ":" + ((old.sequence || 0) + 1), kind: old.kind, text: withOrderContext(text, old.no, old.kind), replyTo: key2, target: old.target, branch: old.branch });
        old.status = "resolved";
        old.sequence = (old.sequence || 0) + 1;
      }
    }
    if (previous && !replay) {
      const gone = await db.prepare("SELECT key FROM telegram_log WHERE key = ?").get("orders:stale:" + previous);
      if (gone) alerts.push({
        key: "resolved:" + gone.key,
        kind: "ordersStale",
        replyTo: gone.key,
        text: "\u{1F5A5}\uFE0F Apex | \u2705 \u0645\u0631\u0635\u062F \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0631\u062C\u0639 \u064A\u0642\u0631\u0627 \u0645\u0646 Apex \u2014 \u0643\u0627\u0646 \u0648\u0627\u0642\u0641 " + Math.round((ctx.now - previous) / 6e4) + " \u062F\u0642\u064A\u0642\u0629"
      });
    }
    await queue(alerts, ctx.now);
    await put(stateKey, JSON.stringify(states));
    let officer = [];
    try {
      officer = JSON.parse(await setting("officer_values") || "[]");
    } catch {
    }
    return {
      ok: true,
      officer,
      follow: 1,
      kinds: KINDS,
      serverNow: iso(ctx.now),
      acknowledgedAlerts: (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 400).map((a) => a?.key).filter(Boolean)
    };
  }, { limit: 1024 * 1024 });
  app2.route("POST", "/api/orders/tags", async (ctx) => {
    const hash = await setting("orders_token_hash"), given = ctx.header("x-orders-token");
    if (!hash || !given || sha256(given) !== hash) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0645\u0631\u0635\u062F \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const b = ctx.body || {};
    if (!validDate(String(b.day || ""))) fail2(400, "invalid_day");
    const r = await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(b.day);
    if (!r) return { ok: true, updated: 0 };
    let d;
    try {
      d = JSON.parse(r.data);
    } catch {
      return { ok: true, updated: 0 };
    }
    const tags = b.tags && typeof b.tags === "object" ? b.tags : {};
    const references = b.references && typeof b.references === "object" ? b.references : {};
    let updated = 0;
    for (const list of ["online", "cancels"]) for (const o of Array.isArray(d[list]) ? d[list] : []) {
      let changed = false;
      const tg = tags[String(o.no)];
      if (tg && /^\d{3,12}$/.test(String(tg)) && o.tag !== String(tg)) {
        o.tag = String(tg);
        changed = true;
      }
      const source = o.kind === "\u0637\u0644\u0628\u0627\u062A" ? "talabat" : o.kind === "\u0627\u0644\u0645\u0648\u0642\u0639" ? "site" : null;
      const incoming = source && references[String(o.no)]?.[source];
      if (incoming) {
        const clean3 = {};
        for (const field of source === "talabat" ? ["orderId", "code"] : ["orderId"])
          if (/^\d{1,20}$/.test(String(incoming[field] ?? ""))) clean3[field] = String(incoming[field]);
        if (Object.keys(clean3).length) {
          const merged = { ...o.sourceRefs?.[source] || {}, ...clean3 };
          if (JSON.stringify(merged) !== JSON.stringify(o.sourceRefs?.[source])) {
            o.sourceRefs = { ...o.sourceRefs || {}, [source]: merged };
            changed = true;
          }
        }
      }
      if (changed) updated++;
    }
    if (updated) {
      await db.prepare("UPDATE orders_days SET data = ? WHERE day = ?").run(JSON.stringify(d), b.day);
      app2.talabat?.invalidate?.(b.day);
    }
    return { ok: true, updated };
  });
  app2.route("GET", "/api/orders/officer", async (ctx) => {
    await app2.requireAdmin(ctx);
    let v = [];
    try {
      v = JSON.parse(await setting("officer_values") || "[]");
    } catch {
    }
    return { values: v };
  });
  app2.route("PUT", "/api/orders/officer", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const values = [...new Set((Array.isArray(ctx.body.values) ? ctx.body.values : []).map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, 60)))].slice(0, 30);
    await put("officer_values", JSON.stringify(values));
    await app2.audit("officer_values", null, { actor: who.name, values });
    return { ok: true, values };
  });
  app2.route("GET", "/api/orders/live", async (ctx) => {
    await app2.requireAdmin(ctx);
    const latest = ctx.query.day === "latest" ? (await db.prepare("SELECT day FROM orders_days ORDER BY received_at DESC LIMIT 1").get())?.day : null;
    const day = latest || (validDate(String(ctx.query.day || "")) ? ctx.query.day : businessDay(ctx.now));
    const row = await db.prepare("SELECT data, received_at FROM orders_days WHERE day = ?").get(day);
    const w = dayWindow(day);
    const alerts = (await db.prepare("SELECT kind, text, created_at, sent_at, error FROM telegram_log WHERE kind LIKE 'orders%' AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 300").all(w.start, w.end)).map((r) => ({ kind: r.kind, text: r.text, at: iso(r.created_at), sent: !!r.sent_at && !r.error }));
    const last = Number(await setting("orders_last_push")) || null;
    let data = null;
    try {
      data = row ? JSON.parse(row.data) : null;
    } catch {
    }
    return {
      day,
      data,
      receivedAt: iso(row?.received_at),
      lastPush: iso(last),
      ageSeconds: last ? Math.round((ctx.now - last) / 1e3) : null,
      linked: !!await setting("orders_token_hash"),
      alerts,
      apexNames: app2.apexNameMap ? await app2.apexNameMap() : {},
      serverNow: iso(ctx.now)
    };
  });
  let lastCheck = 0;
  app2.afterRequest(async (now) => {
    if (now - lastCheck < CHECK_MS) return;
    lastCheck = now;
    const last = Number(await setting("orders_last_push")) || null;
    if (!last || now - last < STALE_MS || !isOperating(now)) return;
    if (await db.prepare("SELECT 1 FROM telegram_log WHERE key = ?").get("orders:stale:" + last)) return;
    const at = new Date(last).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });
    await queue([{ key: "orders:stale:" + last, kind: "ordersStale", text: "\u{1F5A5}\uFE0F Apex | \u26A0\uFE0F \u0645\u0631\u0635\u062F \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0645\u0634 \u0628\u064A\u0642\u0631\u0627 \u0645\u0646 Apex \u0645\u0646 " + at + " (" + Math.round((now - last) / 6e4) + " \u062F\u0642\u064A\u0642\u0629)\n\u0627\u062A\u0623\u0643\u062F \u0625\u0646 \u062C\u0647\u0627\u0632 \u0627\u0644\u0643\u0627\u0634\u064A\u0631 \u0634\u063A\u0627\u0644 \u0648\u0645\u062A\u0648\u0635\u0644 \u0628\u0627\u0644\u0646\u062A" }], now);
  });
}
__name(setup15, "setup");

// ../sites/lib/marsad/names.js
var names_exports = {};
__export(names_exports, {
  setup: () => setup16
});
function setup16(app2) {
  const { db, fail: fail2 } = app2;
  app2.route("GET", "/api/apex-names", async (ctx) => {
    await app2.requireAdmin(ctx);
    const map = await db.prepare("SELECT apex_name, employee_id FROM apex_names").all();
    const seen = new Set(map.map((m) => m.apex_name));
    for (const r of await db.prepare("SELECT data FROM orders_days ORDER BY received_at DESC LIMIT 7").all()) {
      let d = null;
      try {
        d = JSON.parse(r.data);
      } catch {
      }
      for (const n of [...d?.users || [], ...(d?.staff || []).map((s) => s.name), ...(d?.cancels || []).flatMap((c) => [c.user, c.by])]) if (n && !/^#\d+$/.test(n)) seen.add(String(n));
    }
    return { apexNames: map.map((m) => ({ apexName: m.apex_name, employeeId: m.employee_id })), apexSeen: [...seen].sort((a, b) => a.localeCompare(b, "ar")) };
  });
  app2.route("PUT", "/api/apex-names", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const name = String(ctx.body.apexName || "").trim().slice(0, 100), id2 = ctx.body.employeeId == null ? null : Number(ctx.body.employeeId);
    if (!name) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0627\u0633\u0645 \u0641\u064A Apex");
    if (id2 == null) await db.prepare("DELETE FROM apex_names WHERE apex_name = ?").run(name);
    else {
      if (!await db.prepare("SELECT 1 FROM employees WHERE id = ? AND deleted_at IS NULL").get(id2)) fail2(404, "\u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
      await db.prepare("INSERT INTO apex_names (apex_name, employee_id, set_at) VALUES (?,?,?) ON CONFLICT(apex_name) DO UPDATE SET employee_id = excluded.employee_id, set_at = excluded.set_at").run(name, id2, ctx.now);
    }
    await app2.audit("apex_name_set", id2, { actor: who.name, apexName: name });
    return { ok: true };
  });
  app2.apexNameMap = async () => Object.fromEntries((await db.prepare("SELECT a.apex_name, e.name FROM apex_names a JOIN employees e ON e.id = a.employee_id").all()).map((r) => [r.apex_name, r.name]));
}
__name(setup16, "setup");

// ../sites/lib/marsad/learn.js
var learn_exports = {};
__export(learn_exports, {
  setup: () => setup17
});
function setup17(app2) {
  const { db } = app2;
  async function currentRows(kind) {
    const scope = kind?.startsWith("match-v2:") ? kind.split(":").at(-1) : null;
    const legacy = await db.prepare("SELECT * FROM learned WHERE (? IS NULL OR kind = ?) AND NOT EXISTS (SELECT 1 FROM learning_evidence e WHERE e.ref = learned.ref AND learned.kind LIKE 'match-v2:%:' || e.source)").all(kind || null, kind || null);
    const active = await db.prepare("SELECT * FROM learning_evidence WHERE ? IS NULL OR source = ?").all(scope, scope);
    for (const row of active) for (const f of JSON.parse(row.facts)) if (!kind || f.kind === kind) legacy.push({ ...f, ref: row.ref, at: row.at });
    return legacy;
  }
  __name(currentRows, "currentRows");
  const learn = app2.learn = {
    async replace(source, ref2, facts) {
      const data = JSON.stringify(facts), now = app2.now();
      await db.batch([
        ...facts.map((f) => db.prepare("INSERT INTO learned (kind,a,b,ref,value,at) VALUES (?,?,?,?,?,?) ON CONFLICT(kind,a,b,ref) DO NOTHING").bind(f.kind, f.a, f.b, String(ref2), f.value ?? null, now)),
        db.prepare("INSERT INTO learning_evidence (source,ref,facts,at) VALUES (?,?,?,?) ON CONFLICT(source,ref) DO UPDATE SET facts=excluded.facts,at=excluded.at WHERE learning_evidence.facts != excluded.facts").bind(source, String(ref2), data, now)
      ]);
    },
    async record(kind, a, b, ref2, value = null, now = app2.now()) {
      if (!a || !b || !ref2) return;
      await db.prepare("INSERT INTO learned (kind, a, b, ref, value, at) VALUES (?,?,?,?,?,?) ON CONFLICT(kind, a, b, ref) DO UPDATE SET value = excluded.value, at = excluded.at").run(kind, String(a).slice(0, 160), String(b).slice(0, 160), String(ref2).slice(0, 60), value, now);
    },
    // kind -> Map(a -> Map(b -> evidence count))
    async pairs(kind) {
      const out = /* @__PURE__ */ new Map();
      for (const r of await currentRows(kind)) {
        if (!out.has(r.a)) out.set(r.a, /* @__PURE__ */ new Map());
        out.get(r.a).set(r.b, (out.get(r.a).get(r.b) || 0) + 1);
      }
      return out;
    },
    // The values seen for (kind, a), newest first (at most 200).
    async values(kind, a) {
      return (await currentRows(kind)).filter((r) => r.a === a && r.value != null).sort((x, y) => y.at - x.at).slice(0, 200).map((r) => r.value);
    },
    // Something new on a screen: kept once per value.
    async unknown(source, what, sample, now = app2.now()) {
      await db.prepare("INSERT INTO learned (kind, a, b, ref, value, at) VALUES (?,?,?,?,NULL,?) ON CONFLICT(kind, a, b, ref) DO NOTHING").run("unknown", String(source).slice(0, 40), String(what).slice(0, 160), String(sample || "-").slice(0, 60), now);
    }
  };
  app2.route("GET", "/api/learned", async (ctx) => {
    await app2.requireAdmin(ctx);
    const grouped = /* @__PURE__ */ new Map();
    for (const r of await currentRows()) {
      if (r.kind === "delay") continue;
      const key2 = JSON.stringify([r.kind, r.a, r.b]), prev = grouped.get(key2) || { kind: r.kind, a: r.a, b: r.b, n: 0, last: 0 };
      prev.n++;
      prev.last = Math.max(prev.last, r.at);
      grouped.set(key2, prev);
    }
    const rows = [...grouped.values()].sort((x, y) => x.kind.localeCompare(y.kind) || y.n - x.n).slice(0, 500);
    const delays = await db.prepare("SELECT a, COUNT(*) n FROM learned WHERE kind = 'delay' GROUP BY a").all();
    return { facts: rows.map((r) => ({ kind: r.kind, a: r.a, b: r.b, evidence: r.n, last: new Date(r.last).toISOString() })), delays: delays.map((r) => ({ branch: r.a, evidence: r.n })) };
  });
  app2.route("POST", "/api/learned", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const before = [];
    for (const row of await db.prepare("SELECT * FROM learning_evidence").all()) {
      const facts = JSON.parse(row.facts), kept = facts.filter((f) => !(f.kind === ctx.body.kind && f.a === ctx.body.a && f.b === ctx.body.b));
      if (kept.length === facts.length) continue;
      before.push({ source: row.source, ref: row.ref, facts: facts.filter((f) => !kept.includes(f)) });
      await db.prepare("UPDATE learning_evidence SET facts=?,at=? WHERE source=? AND ref=?").run(JSON.stringify(kept), ctx.now, row.source, row.ref);
    }
    await db.prepare("DELETE FROM learned WHERE kind = ? AND a = ? AND b = ?").run(String(ctx.body.kind || ""), String(ctx.body.a || ""), String(ctx.body.b || ""));
    await app2.audit("learned_forgotten", null, { actor: who.name, kind: ctx.body.kind, a: ctx.body.a, b: ctx.body.b, before, after: [], reason: String(ctx.body.reason || "").slice(0, 500) || null });
    return { ok: true };
  });
  return learn;
}
__name(setup17, "setup");

// ../sites/lib/marsad/site.js
var site_exports = {};
__export(site_exports, {
  KINDS: () => KINDS2,
  readNotes: () => readNotes,
  setup: () => setup18
});

// ../sites/lib/marsad/menu-seed.js
var MENU_SEED = {
  "1/4 grilled kofta offer": [
    "218"
  ],
  "7 up can": [
    "0202002"
  ],
  "7up": [
    "0202002"
  ],
  "alexandrian liver sandwich": [
    "0104020"
  ],
  "alexandrian liver sandwich combo": [
    "0104021"
  ],
  "baba ghannoug salad": [
    "0101004"
  ],
  "baba ghanoush salad": [
    "0101004"
  ],
  "baladi sausage": [
    "0108041",
    "0108042",
    "0108043",
    "0108044"
  ],
  "basmati rice": [
    "0103010"
  ],
  "basmati rice with liver": [
    "0103013"
  ],
  "boneless fawteh kaware": [
    "0105003"
  ],
  "chicken kids meal": [
    "0110011"
  ],
  "chicken pane breasts - ready to cook": [
    "0113004"
  ],
  "chicken pane combo sandwich": [
    "0104015"
  ],
  "chicken pane sandwich": [
    "0104014"
  ],
  "chicken pane sandwich combo": [
    "0104015"
  ],
  "chicken pasta": [
    "0106024"
  ],
  "chicken with fatteh": [
    "0105005"
  ],
  "cream caramel": [
    "0201003"
  ],
  "cream of chicken soup": [
    "0102002"
  ],
  "cream of mushroom soup": [
    "0102003"
  ],
  "diced pigeon soup": [
    "0102005"
  ],
  "elozoma tray": [
    "0111003"
  ],
  "family mix chicken meal": [
    "0109023"
  ],
  "family mix meal": [
    "0109021"
  ],
  "family platter 2": [
    "0116009"
  ],
  "feast platter": [
    "0111006"
  ],
  "fillet": [
    "0107009",
    "0107010",
    "0107011",
    "0107012"
  ],
  "french fries": [
    "0103005"
  ],
  "garlic dip": [
    "0101006"
  ],
  "grape leaves": [
    "0103002"
  ],
  "grilled chicken breast combo sandwich": [
    "0104018"
  ],
  "grilled chicken breast sandwich": [
    "0104017"
  ],
  "grilled chicken breast sandwich combo": [
    "0104018"
  ],
  "grilled chicken breasts": [
    "0107009",
    "0107010",
    "0107011",
    "0107012"
  ],
  "grilled chicken breasts - ready to cook": [
    "0113004"
  ],
  "grilled half chicken meal offer": [
    "0116003"
  ],
  "grilled kebab - lamb": [
    "0108017",
    "0108018",
    "0108019",
    "0108020"
  ],
  "grilled kofta": [
    "0108001",
    "0108002",
    "0108003",
    "0109001"
  ],
  "grilled liver": [
    "0108048",
    "0108047",
    "0108046",
    "0108045"
  ],
  "grilled pigeon": [
    "0107007"
  ],
  "grilled quail": [
    "0107008"
  ],
  "grilled steak": [
    "0108056",
    "0108055",
    "0108054",
    "0108053"
  ],
  "grilled tarb": [
    "0108005",
    "0108006",
    "0108007",
    "0108008"
  ],
  "hakawi grills feast platter": [
    "0111008"
  ],
  "half chicken meal": [
    "0109003"
  ],
  "half grilled chicken on charcoal": [
    "0107001"
  ],
  "half shish chicken": [
    "0107002"
  ],
  "hawawshi": [
    "0104025"
  ],
  "hawawshi combo": [
    "0104026"
  ],
  "hawawshi offer": [
    "111"
  ],
  "hawawshi sandwich combo": [
    "0104026"
  ],
  "kebab and kofta - lamb": [
    "0108009",
    "0108010",
    "0108011",
    "0108012"
  ],
  "kebab and kofta - veal": [
    "0108013",
    "0108014",
    "0108015",
    "0108016"
  ],
  "kebab combo sandwich": [
    "0104012"
  ],
  "kebab sandwich": [
    "0104012"
  ],
  "kebab sandwich combo": [
    "0104012"
  ],
  "khalta rice": [
    "0103011"
  ],
  "kids meal grilled chicken breasts": [
    "0110007"
  ],
  "kids shish tawook meal": [
    "0110005"
  ],
  "kids' pane chicken meal": [
    "0110001"
  ],
  "knuckles soup": [
    "0102007"
  ],
  "kofta": [
    "0108001",
    "0108002",
    "0108003",
    "0108004"
  ],
  "kofta - ready to cook": [
    "0113006"
  ],
  "kofta and molokhia meal offer": [
    "315"
  ],
  "kofta kids meal": [
    "0110003"
  ],
  "kofta meal": [
    "0116001"
  ],
  "kofta meal offer": [
    "0116001"
  ],
  "kofta roll sandwich": [
    "0104001"
  ],
  "kofta sandwich": [
    "0104001"
  ],
  "kofta sandwich combo": [
    "0104003"
  ],
  "lamb chops ribs - ready to cook": [
    "0113010"
  ],
  "lamb kebab - ready to cook": [
    "0113008"
  ],
  "lamb kebab and kofta platter": [
    "0109011"
  ],
  "lamb kebab and ribs plate": [
    "0109017"
  ],
  "lamb kebab plate": [
    "0109013"
  ],
  "lamb kofta and kebab platter": [
    "0109011"
  ],
  "lamb ribs plate": [
    "0109015"
  ],
  "lamb shank": [
    "0108010"
  ],
  "large mixed grill platter": [
    "0109020"
  ],
  "large mixed grill platter offer": [
    "0109020"
  ],
  "lentil soup": [
    "0102006"
  ],
  "loved ones platter": [
    "0111007"
  ],
  "marinated tomatoes": [
    "0101003"
  ],
  "meat tagine with onions": [
    "0106011"
  ],
  "meat with fatteh": [
    "0105004"
  ],
  "mineral water": [
    "0202005"
  ],
  "miranda cans": [
    "0202003"
  ],
  "mirinda apple": [
    "0202003"
  ],
  "mirinda orange": [
    "0202003"
  ],
  "mix grill": [
    "0108033",
    "0108034",
    "0108035",
    "0108036"
  ],
  "mix mahashi": [
    "0103004"
  ],
  "mixed mahashi": [
    "0103004"
  ],
  "mixed rice": [
    "0103011"
  ],
  "mixed stuffed vegetables": [
    "0103004"
  ],
  "mixed vegetable tagine": [
    "0106004"
  ],
  "mixed vegetable tagine with meat": [
    "0106014"
  ],
  "molokhia casserole": [
    "0106007"
  ],
  "molokhia casserole with meat": [
    "0106009"
  ],
  "molokhia tagine with chicken": [
    "0106008"
  ],
  "mombar": [
    "0103001"
  ],
  "monster platter": [
    "0111009"
  ],
  "moussaka casserole": [
    "0106001"
  ],
  "moussaka tagine with minced meat": [
    "0106010"
  ],
  "mutton kebab": [
    "0108017",
    "0108018",
    "0108019",
    "0108020"
  ],
  "mutton kebab and kofta": [
    "0108009",
    "0108010",
    "0108011",
    "0108012"
  ],
  "mutton liver": [
    "0108045",
    "0108046",
    "0108047",
    "0108048"
  ],
  "mutton ribs": [
    "0108025",
    "0108026",
    "0108027",
    "0108028"
  ],
  "nefa": [
    "0108037",
    "0108038",
    "0108039",
    "0108040"
  ],
  "okra tagine": [
    "0106003"
  ],
  "okra tagine with meat": [
    "0106013"
  ],
  "om ali": [
    "0201002"
  ],
  "oriental pickles": [
    "0101009"
  ],
  "oriental salad": [
    "0101002"
  ],
  "oriental sausage": [
    "0103018"
  ],
  "oriental sausage - ready to cook": [
    "0113007"
  ],
  "orzo soup": [
    "0102001"
  ],
  "oven baked pasta": [
    "0103017"
  ],
  "oven pasta": [
    "0103017"
  ],
  "oven-baked rice casserole with meat": [
    "0106018"
  ],
  "pasha appetizers": [
    "0111001"
  ],
  "pasha's appetizers": [
    "0111001"
  ],
  "pasta casserole with meat": [
    "0106023"
  ],
  "pasta tagine with liver": [
    "0106026"
  ],
  "pasta with sausage": [
    "0106025"
  ],
  "pepsi": [
    "0202004"
  ],
  "pepsi can": [
    "0202001"
  ],
  "pickled cucumber": [
    "0101005"
  ],
  "pickled eggplant": [
    "0101007"
  ],
  "pigeon soup": [
    "0102004"
  ],
  "plain baked rice casserole": [
    "0106005"
  ],
  "plain fattah": [
    "0115013"
  ],
  "plain fatteh": [
    "0115013"
  ],
  "plain rice": [
    "0103007"
  ],
  "potato tagine": [
    "0106002"
  ],
  "potato tagine with meat": [
    "0106012"
  ],
  "quarter chicken and kofta meal": [
    "0109001"
  ],
  "quarter chicken and shish tawook meal": [
    "0109002"
  ],
  "quarter grilled chicken": [
    "0107005"
  ],
  "quarter kilo tarb meal": [
    "0109005"
  ],
  "ribs and veal kebab plate": [
    "0109018"
  ],
  "rice pudding": [
    "0201001"
  ],
  "sausage combo sandwich": [
    "0104006"
  ],
  "sausage sandwich": [
    "0104005"
  ],
  "sesame paste salad": [
    "0101001"
  ],
  "shish tawook": [
    "0107021",
    "0107018",
    "0107019",
    "0107020"
  ],
  "shish tawook - ready to cook": [
    "0113005"
  ],
  "shish tawook meal": [
    "0107019"
  ],
  "shish tawook meal offer": [
    "0107019"
  ],
  "shish tawook sandwich": [
    "263"
  ],
  "shish tawook sandwich combo": [
    "0104009"
  ],
  "small mixed grill meal": [
    "0109019"
  ],
  "small mixed grill offer": [
    "0109019"
  ],
  "small mixed grill plate": [
    "0109019"
  ],
  "spaghetti bolognese with minced meat": [
    "0103015"
  ],
  "spaghetti neapolitan": [
    "0103016"
  ],
  "stuffed pigeon with rice - piece": [
    "0107006"
  ],
  "super family mix meal": [
    "0109022"
  ],
  "tabk elbalad": [
    "0111005"
  ],
  "tahini salad": [
    "0101001"
  ],
  "tarab sandwich combo": [
    "0104003"
  ],
  "tarb": [
    "0108005",
    "0108006",
    "0108007",
    "0108008"
  ],
  "tarb sandwich": [
    "0104015"
  ],
  "tarb sandwich combo": [
    "0104003"
  ],
  "the gathering plate": [
    "0111004"
  ],
  "the invitation tray": [
    "0111003"
  ],
  "um ali": [
    "0201002"
  ],
  "veal kebab": [
    "0108021",
    "0108022",
    "0108023",
    "0108024"
  ],
  "veal kebab - ready to cook": [
    "0113009"
  ],
  "veal kebab and kofta": [
    "0108013",
    "0108014",
    "0108015",
    "0108016"
  ],
  "veal kebab and kofta plate": [
    "0109012"
  ],
  "veal kebab plate": [
    "0109014"
  ],
  "veal rib plate": [
    "0109016"
  ],
  "veal ribs": [
    "0108029",
    "0108030",
    "0108027",
    "0108032"
  ],
  "veal ribs - ready to cook": [
    "0113011"
  ],
  "veal shank": [
    "0105002"
  ],
  "vegetable soup": [
    "0102008"
  ],
  "vine leaves": [
    "0103002"
  ],
  "water": [
    "0202005"
  ],
  "white rice": [
    "0103007"
  ],
  "yogurt salad": [
    "0101001"
  ]
};
var APEX_NAMES = { "0101001": "\u0633\u0644\u0637\u0629 \u0637\u062D\u064A\u0646\u0629", "0101002": "\u0633\u0644\u0637\u0629 \u0628\u0644\u062F\u0649", "0101003": "\u0633\u0644\u0637\u0629 \u0637\u0645\u0627\u0637\u0645 \u0645\u062A\u0628\u0644\u0629", "0101004": "\u0633\u0644\u0637\u0629 \u0628\u0627\u0628\u0627 \u063A\u0646\u0648\u062C", "0101005": "\u0633\u0644\u0637\u0629 \u062E\u064A\u0627\u0631 \u0645\u062E\u0644\u0644", "0101006": "\u0633\u0644\u0637\u0629 \u062A\u0648\u0645\u064A\u0629", "0101007": "\u0628\u0627\u0630\u0646\u062C\u0627\u0646 \u0645\u062E\u0644\u0644", "0101008": "\u0633\u0644\u0637\u0629 \u0637\u0631\u0646\u0634\u0627\u062A", "0101009": "\u0645\u062E\u0644\u0644 \u0645\u0634\u0643\u0644", "0101010": "\u0633\u0644\u0637\u0629 \u0632\u0628\u0627\u062F\u0649", "0102001": "\u0634\u0648\u0631\u0628\u0629 \u0644\u0633\u0627\u0646 \u0639\u0635\u0641\u0648\u0631", "0102002": "\u0634\u0648\u0631\u0628\u0629 \u0641\u0631\u0627\u062E \u0628\u0627\u0644\u0643\u0631\u064A\u0645\u0629", "0102003": "\u0634\u0648\u0631\u0628\u0629 \u0645\u0634\u0631\u0648\u0645 \u0628\u0627\u0644\u0643\u0631\u064A\u0645\u0629", "0102004": "\u0634\u0648\u0631\u0628\u0629 \u062D\u0645\u0627\u0645", "0102005": "\u0634\u0648\u0631\u0628\u0629 \u062D\u0645\u0627\u0645 \u0642\u0637\u0639", "0102006": "\u0634\u0648\u0631\u0628\u0629 \u0639\u062F\u0633", "0102007": "\u0634\u0648\u0631\u0628\u0629 \u0643\u0648\u0627\u0631\u0639", "0102008": "\u0634\u0648\u0631\u0628\u0629 \u062E\u0636\u0627\u0631", "0103001": "\u0645\u0645\u0628\u0627\u0631", "0103002": "\u0648\u0631\u0642 \u0639\u0646\u0628", "0103003": "\u0645\u062D\u0634\u064A \u0643\u0631\u0646\u0628", "0103004": "\u0645\u062D\u0627\u0634\u0649 \u0645\u0634\u0643\u0644", "0103005": "\u0628\u0637\u0627\u0637\u0633 \u0645\u0642\u0644\u064A\u0629", "0103006": "\u0641\u062A\u0629 \u0633\u0627\u062F\u0629", "0103007": "\u0627\u0631\u0632 \u0633\u0627\u062F\u0629", "0103008": "\u0627\u0631\u0632 \u0628\u0627\u0644\u0634\u0639\u0631\u064A\u0629", "0103009": "\u0627\u0631\u0632 \u0627\u0628\u064A\u0636 \u0628\u0627\u0644\u0643\u0628\u062F\u0629", "0103010": "\u0627\u0631\u0632 \u0628\u0633\u0645\u062A\u0649", "0103011": "\u0627\u0631\u0632 \u0628\u0627\u0644\u062E\u0644\u0637\u0629", "0103012": "\u0627\u0631\u0632 \u0628\u0633\u0645\u062A\u0649 \u0628\u0627\u0644\u0645\u0643\u0633\u0631\u0627\u062A", "0103013": "\u0627\u0631\u0632 \u0628\u0633\u0645\u062A\u064A \u0628\u0627\u0644\u0643\u0628\u062F\u0629", "0103014": "\u062E\u0636\u0627\u0631 \u0633\u0648\u062A\u064A\u0629", "0103015": "\u0627\u0633\u0628\u0627\u062C\u062A\u064A \u0628\u0644\u0648\u0646\u064A\u0632", "0103016": "\u0627\u0633\u0628\u0627\u062C\u062A\u064A \u0646\u0627\u0628\u0648\u0644\u064A\u062A\u0627\u0646", "0103017": "\u0645\u0643\u0631\u0648\u0646\u0629 \u0641\u0631\u0646", "0103018": "\u0633\u062C\u0642 \u0634\u0631\u0642\u0649", "0103019": "\u0643\u0628\u062F\u0647 \u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u0649", "0103020": "\u0633\u0645\u0628\u0648\u0633\u0643 \u0644\u062D\u0645\u0629", "0103021": "\u0633\u0645\u0628\u0648\u0633\u0643 \u062C\u0628\u0646\u0629", "0103022": "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0646\u0627 \u0648\u0627\u064A\u062A \u0635\u0648\u0635", "0103023": "\u0643\u0648\u0628\u064A\u0628\u0629", "0104001": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0641\u062A\u0629", "0104002": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0641\u062A\u0629 \u0645\u0644\u0641\u0648\u0641", "0104003": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0641\u062A\u0629 \u0643\u0648\u0645\u0628\u0648", "0104004": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0633\u062C\u0642", "0104005": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0633\u062C\u0642 \u0645\u0644\u0641\u0648\u0641", "0104006": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0633\u062C\u0642 \u0643\u0648\u0645\u0628\u0648", "0104007": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642", "0104008": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0634\u064A\u0634 \u0645\u0644\u0641\u0648\u0641", "0104009": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0643\u0648\u0645\u0628\u0648", "0104010": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u0627\u0628", "0104011": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u0627\u0628 \u0645\u0644\u0641\u0648\u0641", "0104012": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u0627\u0628 \u0643\u0648\u0645\u0628\u0648", "0104013": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0641\u0631\u0627\u062E \u0628\u0627\u0646\u064A\u0629", "0104014": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0641\u0631\u0627\u062E \u0628\u0627\u0646\u064A\u0629 \u0645\u0644\u0641\u0648\u0641", "0104015": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0641\u0631\u0627\u062E \u0628\u0627\u0646\u064A\u0629 \u0643\u0648\u0645\u0628\u0648", "0104016": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u0649", "0104017": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u0649 \u0645\u0644\u0641\u0648\u0641", "0104018": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u0649 \u0643\u0648\u0645\u0628\u0648", "0104019": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u062F\u0629 \u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u0649", "0104020": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u062F\u0629 \u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u0649 \u0645\u0644\u0641\u0648\u0641", "0104021": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u062F\u0629 \u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u0649 \u0643\u0648\u0645\u0628\u0648", "0104022": "\u0633\u0627\u0646\u062F\u0648\u064A\u062A\u0634 \u0637\u0631\u0628", "0104023": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0637\u0631\u0628 \u0645\u0644\u0641\u0648\u0641", "0104024": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0637\u0631\u0628 \u0643\u0648\u0645\u0628\u0648", "0104025": "\u0631\u063A\u064A\u0641 \u062D\u0648\u0627\u0648\u0634\u0649", "0104026": "\u0631\u063A\u064A\u0641 \u062D\u0648\u0627\u0648\u0634\u0649 \u0643\u0648\u0645\u0628\u0648", "0105001": "\u0645\u0648\u0632\u0629 \u0636\u0627\u0646\u0649 \u0645\u0639 \u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0105002": "\u0645\u0648\u0632\u0629 \u0628\u062A\u0644\u0648 \u0645\u0639 \u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0105003": "\u0643\u0648\u0627\u0631\u0639 \u0645\u062E\u0644\u064A\u0629 \u0645\u0639 \u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0105004": "\u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0105005": "\u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646 \u0628\u0627\u0644\u0641\u0631\u0627\u062E", "0105006": "\u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646 \u0633\u0627\u062F\u0629", "0105007": "\u0627\u0648\u0632\u0649 \u0628\u062A\u0644\u0648", "0105008": "\u0627\u0648\u0632\u0649 \u0636\u0627\u0646\u0649", "0105009": "\u0628\u0637\u0629 \u0645\u062D\u0634\u064A\u0629", "0105010": "\u0631\u0642\u0627\u0642 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0105011": "\u0648\u0631\u0642\u0647 \u0627\u0644\u0644\u062D\u0645\u0629", "0105012": "\u062A\u0634\u064A\u0643\u0646 \u0631\u0648\u0644", "0106001": "\u0637\u0627\u062C\u0646 \u0645\u0633\u0642\u0639\u0629", "0106002": "\u0637\u0627\u062C\u0646 \u0628\u0637\u0627\u0637\u0633", "0106003": "\u0637\u0627\u062C\u0646 \u0628\u0627\u0645\u064A\u0629", "0106004": "\u0637\u0627\u062C\u0646 \u062E\u0636\u0627\u0631 \u0645\u0634\u0643\u0644", "0106005": "\u0627\u0631\u0632 \u0645\u0639\u0645\u0631 \u0633\u0627\u062F\u0629", "0106006": "\u0637\u0627\u062C\u0646 \u0644\u0633\u0627\u0646 \u0639\u0635\u0641\u0648\u0631 \u0633\u0627\u062F\u0629", "0106007": "\u0645\u0644\u0648\u062E\u064A\u0629 \u0628\u0637\u0634\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0106008": "\u0645\u0644\u0648\u062E\u064A\u0629 \u0628\u0627\u0644\u0641\u0631\u0627\u062E", "0106009": "\u0645\u0644\u0648\u062E\u064A\u0629 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106010": "\u0645\u0633\u0642\u0639\u0629 \u0628\u0627\u0644\u0644\u062D\u0645\u0629 \u0627\u0644\u0645\u0641\u0631\u0648\u0645\u0629", "0106011": "\u0644\u062D\u0645\u0629 \u0628\u0627\u0644\u0628\u0635\u0644", "0106012": "\u0628\u0637\u0627\u0637\u0633 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106013": "\u0628\u0627\u0645\u064A\u0629 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106014": "\u062E\u0636\u0627\u0631 \u0645\u0634\u0643\u0644 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106015": "\u0637\u0627\u062C\u0646 \u0648\u0631\u0642 \u0639\u0646\u0628 \u0628\u0627\u0644\u0643\u0648\u0627\u0631\u0639", "0106016": "\u0637\u0627\u062C\u0646 \u0639\u0643\u0627\u0648\u0649", "0106017": "\u0637\u0627\u062C\u0646 \u0644\u0633\u0627\u0646 \u0639\u0635\u0641\u0648\u0631 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106018": "\u0627\u0631\u0632 \u0645\u0639\u0645\u0631 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106019": "\u0627\u0631\u0632 \u0645\u0639\u0645\u0631 \u0628\u0627\u0644\u0641\u0631\u0627\u062E", "0106020": "\u0627\u0631\u0632 \u0645\u0639\u0645\u0631 \u0628\u0627\u0644\u062D\u0645\u0627\u0645", "0106021": "\u0637\u0627\u062C\u0646 \u062D\u0645\u0627\u0645 \u0628\u0627\u0644\u0641\u0631\u064A\u0643", "0106022": "\u0637\u0627\u062C\u0646 \u062D\u0645\u0627\u0645 \u0628\u0627\u0644\u0627\u0631\u0632", "0106023": "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0627\u0644\u0644\u062D\u0645\u0629", "0106024": "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0627\u0644\u0641\u0631\u0627\u062E", "0106025": "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0627\u0644\u0633\u062C\u0642", "0106026": "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0627\u0644\u0643\u0628\u062F\u0629", "0106027": "\u0637\u0627\u062C\u0646 \u0643\u0648\u0627\u0631\u0639", "0107001": "\u0646\u0635\u0641 \u0641\u0631\u062E\u0629 \u0645\u0634\u0648\u064A\u0629", "0107002": "\u0646\u0635\u0641 \u0641\u0631\u062E\u0629 \u0634\u064A\u0634", "0107003": "\u0646\u0635\u0641 \u0641\u0631\u062E\u0647 \u0645\u062D\u0645\u0631\u0629", "0107004": "\u0641\u0631\u062E\u0629 \u0645\u062D\u0634\u064A\u0629 \u0627\u0631\u0632", "0107005": "\u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0645\u0634\u0648\u064A\u0629", "0107006": "\u0641\u0631\u062F \u062D\u0645\u0627\u0645 \u0645\u062D\u0634\u0649", "0107007": "\u0641\u0631\u062F \u062D\u0645\u0627\u0645 \u0645\u0634\u0648\u0649", "0107008": "\u0641\u0631\u062F \u0633\u0645\u0627\u0646 \u0645\u0634\u0648\u0649", "0107009": "\u0643 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0629", "0107010": "1/2\u0643 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0629", "0107011": "1/3\u0643 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0629", "0107012": "1/4\u0643 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0629", "0107013": "\u0643 \u0635\u062F\u0648\u0631 \u0628\u0627\u0646\u064A\u0629", "0107014": "1/2\u0643 \u0635\u062F\u0648\u0631 \u0628\u0627\u0646\u064A\u0629", "0107015": "1/3\u0643 \u0635\u062F\u0648\u0631 \u0628\u0627\u0646\u064A\u0629", "0107016": "1/4\u0643 \u0635\u062F\u0648\u0631 \u0628\u0627\u0646\u064A\u0629", "0107017": "\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642", "0107018": "1/2\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642", "0107019": "1/3\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642", "0107020": "1/4\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642", "0107021": "\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0635\u062F\u0648\u0631", "0107022": "1/2\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0635\u062F\u0648\u0631", "0107023": "1/3\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0635\u062F\u0648\u0631", "0107024": "1/4\u0643 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0635\u062F\u0648\u0631", "0107025": "\u0643\u064A\u0644\u0648 \u062F\u064A\u0643 \u0631\u0648\u0645\u0649", "0108001": "\u0643\u064A\u0644\u0648 \u0643\u0641\u062A\u0629", "0108002": "1/2\u0643\u064A\u0644\u0648 \u0643\u0641\u062A\u0629", "0108003": "1/3\u0643\u064A\u0644\u0648 \u0643\u0641\u062A\u0629", "0108004": "1/4\u0643\u064A\u0644\u0648 \u0643\u0641\u062A\u0629", "0108005": "\u0643\u064A\u0644\u0648 \u0637\u0631\u0628", "0108006": "1/2\u0643\u064A\u0644\u0648 \u0637\u0631\u0628", "0108007": "1/3\u0643\u064A\u0644\u0648 \u0637\u0631\u0628", "0108008": "1/4\u0643\u064A\u0644\u0648 \u0637\u0631\u0628", "0108009": "\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0636\u0627\u0646\u0649", "0108010": "1/2\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0636\u0627\u0646\u0649", "0108011": "1/3\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0636\u0627\u0646\u0649", "0108012": "1/4\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0636\u0627\u0646\u0649", "0108013": "\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0628\u062A\u0644\u0648", "0108014": "1/2\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0628\u062A\u0644\u0648", "0108015": "1/3\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0628\u062A\u0644\u0648", "0108016": "1/4\u0643 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0628\u062A\u0644\u0648", "0108017": "\u0643 \u0643\u0628\u0627\u0628 \u0636\u0627\u0646\u0649", "0108018": "1/2\u0643 \u0643\u0628\u0627\u0628 \u0636\u0627\u0646\u0649", "0108019": "1/3\u0643 \u0643\u0628\u0627\u0628 \u0636\u0627\u0646\u0649", "0108020": "1/4\u0643 \u0643\u0628\u0627\u0628 \u0636\u0627\u0646\u0649", "0108021": "\u0643 \u0643\u0628\u0627\u0628 \u0628\u062A\u0644\u0648", "0108022": "1/2\u0643 \u0643\u0628\u0627\u0628 \u0628\u062A\u0644\u0648", "0108023": "1/3\u0643 \u0643\u0628\u0627\u0628 \u0628\u062A\u0644\u0648", "0108024": "1/4\u0643 \u0643\u0628\u0627\u0628 \u0628\u062A\u0644\u0648", "0108025": "\u0643 \u0631\u064A\u0634 \u0636\u0627\u0646\u0649", "0108026": "1/2\u0643 \u0631\u064A\u0634 \u0636\u0627\u0646\u0649", "0108027": "1/3\u0643 \u0631\u064A\u0634 \u0636\u0627\u0646\u0649", "0108028": "1/4\u0643 \u0631\u064A\u0634 \u0636\u0627\u0646\u0649", "0108029": "\u0643 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648", "0108030": "1/2\u0643 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648", "0108031": "1/3\u0643 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648", "0108032": "1/4\u0643 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648", "0108033": "\u0643 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644", "0108034": "1/2\u0643 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644", "0108035": "1/3\u0643 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644", "0108036": "1/4\u0643 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644", "0108037": "\u0643 \u0646\u064A\u0641\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0108038": "1/2\u0643 \u0646\u064A\u0641\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0108039": "1/3\u0643 \u0646\u064A\u0641\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0108040": "1/4\u0643 \u0646\u064A\u0641\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "0108041": "\u0643 \u0633\u062C\u0642 \u0628\u0644\u062F\u0649", "0108042": "1/2\u0643 \u0633\u062C\u0642 \u0628\u0644\u062F\u0649", "0108043": "1/3\u0643 \u0633\u062C\u0642 \u0628\u0644\u062F\u0649", "0108044": "1/4\u0643 \u0633\u062C\u0642 \u0628\u0644\u062F\u0649", "0108045": "\u0643 \u0643\u0628\u062F\u0629 \u0645\u0634\u0648\u064A\u0629", "0108046": "1/2\u0643 \u0643\u0628\u062F\u0629 \u0645\u0634\u0648\u064A\u0629", "0108047": "1/3\u0643 \u0643\u0628\u062F\u0629 \u0645\u0634\u0648\u064A\u0629", "0108048": "1/4\u0643 \u0643\u0628\u062F\u0629 \u0645\u0634\u0648\u064A\u0629", "0108049": "\u0643 \u0641\u0644\u064A\u062A\u0648", "0108050": "1/2\u0643 \u0641\u0644\u064A\u062A\u0648", "0108051": "1/3\u0643 \u0641\u0644\u064A\u062A\u0648", "0108052": "1/4\u0643 \u0641\u0644\u064A\u062A\u0648", "0108053": "\u0643\u064A\u0644\u0648 \u0627\u0633\u062A\u064A\u0643", "0108054": "1/2\u0643 \u0627\u0633\u062A\u064A\u0643", "0108055": "1/3\u0643 \u0627\u0633\u062A\u064A\u0643", "0108056": "1/4\u0643 \u0627\u0633\u062A\u064A\u0643", "0109001": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u062E\u0629 \u0648\u0643\u0641\u062A\u0629", "0109002": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u062E\u0629 \u0648\u0634\u064A\u0634", "0109003": "\u0648\u062C\u0628\u0629 \u0646\u0635\u0641 \u0641\u0631\u062E\u0629", "0109004": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0643\u0641\u062A\u0629", "0109005": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0643\u064A\u0644\u0648 \u0637\u0631\u0628", "0109006": "\u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0629 \u0648\u0634\u064A\u0634", "0109007": "\u0648\u062C\u0628\u0629 \u0641\u0631\u0627\u062E \u0628\u0627\u0646\u064A\u0629", "0109008": "\u0648\u062C\u0628\u0629 \u0645\u064A\u0643\u0633 \u0627\u0644\u062F\u0647\u0627\u0646", "0109009": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0643\u064A\u0644\u0648 \u0634\u064A\u0634", "0109010": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0643\u064A\u0644\u0648 \u0635\u062F\u0648\u0631", "0109011": "\u0648\u062C\u0628\u0629 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0636\u0627\u0646\u0649", "0109012": "\u0648\u062C\u0628\u0629 \u0643\u0628\u0627\u0628 \u0648\u0643\u0641\u062A\u0629 \u0628\u062A\u0644\u0648", "0109013": "\u0648\u062C\u0628\u0629 \u0643\u0628\u0627\u0628 \u0636\u0627\u0646\u0649", "0109014": "\u0648\u062C\u0628\u0629 \u0643\u0628\u0627\u0628 \u0628\u062A\u0644\u0648", "0109015": "\u0648\u062C\u0628\u0629 \u0631\u064A\u0634 \u0636\u0627\u0646\u0649", "0109016": "\u0648\u062C\u0628\u0629 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648", "0109017": "\u0648\u062C\u0628\u0629 \u0643\u0628\u0627\u0628 \u0648\u0631\u064A\u0634 \u0636\u0627\u0646\u0649", "0109018": "\u0648\u062C\u0628\u0629 \u0643\u0628\u0627\u0628 \u0648 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648", "0109019": "\u0648\u062C\u0628\u0629 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644 \u0635\u063A\u064A\u0631", "0109020": "\u0648\u062C\u0628\u0629 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644 \u0643\u0628\u064A\u0631", "0109021": "\u0648\u062C\u0628\u0629 \u0641\u0627\u0645\u064A\u0644\u064A \u0645\u064A\u0643\u0633", "0109022": "\u0648\u062C\u0628\u0629 \u0633\u0648\u0628\u0631 \u0641\u0627\u0645\u064A\u0644\u0649 \u0645\u064A\u0643\u0633", "0109023": "\u0648\u062C\u0628\u0629 \u0641\u0627\u0645\u064A\u0644\u0649 \u062A\u0634\u064A\u0643\u0646 \u0645\u064A\u0643\u0633", "0110001": "\u0648\u062C\u0628\u0629 \u0641\u0631\u0627\u062E \u0628\u0627\u0646\u064A\u0629 \u0645\u0639 \u0627\u0631\u0632", "0110002": "\u0648\u062C\u0628\u0629 \u0641\u0631\u0627\u062E \u0628\u0627\u0646\u064A\u0629 \u0645\u0639 \u0645\u0643\u0631\u0648\u0646\u0629", "0110003": "\u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0629 \u0645\u0639 \u0627\u0631\u0632", "0110004": "\u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0629 \u0645\u0639 \u0645\u0643\u0631\u0648\u0646\u0629", "0110005": "\u0648\u062C\u0628\u0629 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0645\u0639 \u0627\u0631\u0632", "0110006": "\u0648\u062C\u0628\u0629 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0645\u0639 \u0645\u0643\u0631\u0648\u0646\u0629", "0110007": "\u0648\u062C\u0628\u0629 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0629 \u0645\u0639 \u0627\u0631\u0632", "0110008": "\u0648\u062C\u0628\u0629 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0629 \u0645\u0639 \u0645\u0643\u0631\u0648\u0646\u0629", "0110009": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0648\u0631\u0643 \u0645\u0639 \u0627\u0631\u0632", "0110010": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0648\u0631\u0643 \u0645\u0639 \u0645\u0643\u0631\u0648\u0646\u0629", "0110011": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0635\u062F\u0631 \u0645\u0639 \u0627\u0631\u0632", "0110012": "\u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0635\u062F\u0631 \u0645\u0639 \u0645\u0643\u0631\u0648\u0646\u0629", "0111001": "\u0635\u064A\u0646\u064A\u0629 \u0645\u0642\u0628\u0644\u0627\u062A \u0627\u0644\u0628\u0627\u0634\u0627", "0111002": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u062A\u0648\u0641\u064A\u0631", "0111003": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u0639\u0632\u0648\u0645\u0629", "0111004": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u0644\u0645\u0629", "0111005": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u0628\u0644\u062F", "0111006": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u0627\u0643\u064A\u0644\u0629", "0111007": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u062D\u0628\u0627\u064A\u0628", "0111008": "\u0635\u064A\u0646\u064A\u0629 \u062D\u0643\u0627\u0648\u064A \u0645\u0634\u0627\u0648\u0649", "0111009": "\u0635\u064A\u0646\u064A\u0629 \u0627\u0644\u0648\u062D\u0648\u0634", "0111010": "\u0635\u064A\u0646\u064A\u0629", "0112001": "\u0648\u064A\u0633\u0643\u064A \u062D\u0644\u0627\u0644", "0112002": "\u0628\u0648\u0643\u0633 \u0627\u0644\u0627\u0643\u064A\u0644", "0112003": "\u0628\u0648\u0643\u0633 \u0627\u0644\u0634\u0644\u0629", "0112004": "\u0628\u0648\u0643\u0633 \u0627\u0644\u0639\u064A\u0644\u0629", "0113001": "\u0637\u0628\u0642 \u0646\u0635\u0641 \u0641\u0631\u062E\u0629 \u0645\u0634\u0648\u064A\u0629 \u062C\u0627\u0647\u0632 \u0639\u0644\u064A \u0627\u0644\u0637\u0647\u0649", "0113002": "\u0641\u0631\u062F \u062D\u0645\u0627\u0645 \u062C\u0627\u0647\u0632 \u0639\u0644\u0649 \u0627\u0644\u062A\u0633\u0648\u064A\u0629", "0113003": "\u0631\u063A\u064A\u0641 \u062D\u0648\u0627\u0648\u0634\u0649 \u062C\u0627\u0647\u0632 \u0644\u0644\u0637\u0647\u0649", "0113004": "\u0637\u0628\u0642 \u0635\u062F\u0648\u0631375 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113005": "\u0637\u0628\u0642 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113006": "\u0637\u0628\u0642 \u0643\u0641\u062A\u0629 375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113007": "\u0637\u0628\u0642 \u0633\u062C\u0642 375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113008": "\u0637\u0628\u0642 \u0643\u0628\u0627\u0628 \u0636\u0627\u0646\u0649 375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113009": "\u0637\u0628\u0642 \u0643\u0628\u0627\u0628 \u0628\u062A\u0644\u0648 375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113010": "\u0637\u0628\u0642 \u0631\u064A\u0634 \u0636\u0627\u0646\u0649 375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0113011": "\u0637\u0628\u0642 \u0631\u064A\u0634 \u0628\u062A\u0644\u0648375 \u062C\u0631\u0627\u0645 \u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "0114001": "\u0631\u063A\u064A\u0641 \u0639\u064A\u0634", "0114002": "\u0627\u0636\u0627\u0641\u0647 \u0643\u0628\u062F\u0629", "0114003": "\u0627\u0636\u0627\u0641\u0647 \u062E\u0644\u0637\u0629", "0114004": "\u0627\u0636\u0627\u0641\u0647 \u0645\u0643\u0633\u0631\u0627\u062A", "0114005": "\u0627\u0636\u0627\u0641\u0647 \u0645\u0634\u0631\u0648\u0645", "0114006": "\u062E\u062F\u0645\u0629", "0114007": "\u0627\u0636\u0627\u0641\u0647 \u0642\u0637\u0639 \u0644\u062D\u0645\u0629", "0114008": "\u0627\u0636\u0627\u0641\u0647 \u0635\u0648\u0635 \u0627\u0644\u0628\u0644\u0648\u0646\u064A\u0632", "0115001": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0629 \u0627\u0644\u0645\u0648\u0642\u0639", "0115002": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0627\u0644\u0645\u0648\u0642\u0639", "0115003": "\u0639\u0631\u0636 \u0641\u0631\u0627\u062E \u0648\u0643\u0641\u062A\u0629", "0115004": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0646\u0635 \u0641\u0631\u0627\u062E \u0645\u0634\u0648\u064A\u0629 \u0627\u0644\u0645\u0648\u0642\u0639", "0115005": "\u0639\u0631\u0636 \u0641\u064A\u0644\u064A\u0629 \u0645\u0634\u0648\u0649 \u0627\u0644\u0645\u0648\u0642\u0639", "0115006": "\u0639\u0631\u0636 \u0643\u0628\u062F\u0629 \u0645\u0634\u0648\u064A\u0629 \u0627\u0644\u0645\u0648\u0642\u0639", "0115007": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644 \u0635\u063A\u064A\u0631 \u0627\u0644\u0645\u0648\u0642\u0639", "0115008": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0629 \u0648\u0645\u0644\u0648\u062E\u064A\u0629 \u0627\u0644\u0645\u0648\u0642\u0639", "0115009": "\u0639\u0631\u0636 \u0627\u0644\u062D\u0648\u0627\u0648\u0634\u0649 \u0627\u0644\u0645\u0648\u0642\u0639", "0115010": "\u0639\u0631\u0636 \u0643\u0628\u062F\u0629 \u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u0649 \u0627\u0644\u0645\u0648\u0642\u0639", "0115011": "\u0639\u0631\u0636 \u0643\u0641\u062A\u0629 \u0648\u0645\u0644\u0648\u062E\u064A\u0629 \u0627\u0644\u0645\u0648\u0642\u0639", "0115012": "\u0639\u0631\u0636 \u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0634\u064A\u0634 \u0631\u0648\u0644 \u0627\u0644\u0645\u0648\u0642\u0639", "0115013": "\u0639\u0631\u0636 \u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0641\u062A\u0647 \u0631\u0648\u0644 \u0627\u0644\u0645\u0648\u0642\u0639", "0115014": "\u0639\u0631\u0636 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644 \u0635\u063A\u064A\u0631 \u0645\u0648\u0642\u0639\u0646\u0627", "0115015": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0628\u0627\u0646\u064A\u0647 \u0645\u0648\u0642\u0639\u0646\u0627", "0115016": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0647 \u0627\u0644\u0645\u0648\u0642\u0639", "0115017": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0646\u0635 \u0641\u0631\u0627\u062E \u0645\u0648\u0642\u0639\u0646\u0627", "0115018": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0639\u0627\u0626\u0644\u064A 2", "0115019": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0627\u0644\u0639\u0632\u0648\u0645\u0647 \u0627\u0644\u0645\u0648\u0642\u0639", "0115020": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0645\u0642\u0628\u0644\u0627\u062A \u0627\u0644\u0628\u0627\u0634\u0627", "0116001": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0647 \u0643\u0641\u062A\u0629 \u0637\u0644\u0628\u0627\u062A", "0116002": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644 \u0635\u063A\u064A\u0631 \u0637\u0644\u0628\u0627\u062A", "0116003": "\u0639\u0631\u0636 \u0646\u0635\u0641 \u0641\u0631\u0627\u062E \u0637\u0644\u0628\u0627\u062A", "0116004": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0634\u064A\u0634 \u0637\u0644\u0628\u0627\u062A", "0116005": "\u0639\u0631\u0636 \u0627\u0644\u062D\u0648\u0627\u0648\u0634\u0649 \u0637\u0644\u0628\u0627\u062A", "0116006": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0647 \u0628\u0627\u0646\u064A\u0647 \u0637\u0644\u0628\u0627\u062A", "0116007": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0645\u0642\u0628\u0644\u0627\u062A \u0627\u0644\u0628\u0627\u0634\u0627 \u0637\u0644\u0628\u0627\u062A", "0116008": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0627\u0644\u0639\u0632\u0648\u0645\u0647 \u0637\u0644\u0628\u0627\u062A", "0116009": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0639\u0627\u0626\u0644\u064A 2 \u0637\u0644\u0628\u0627\u062A", "0116010": "\u0639\u0631\u0636 \u0645\u064A\u0643\u0633 \u062C\u0631\u064A\u0644 \u0643\u0628\u064A\u0631 \u0637\u0644\u0628\u0627\u062A", "0117001": "\u0639\u0631\u0636 \u0641\u0631\u062F \u062D\u0645\u0627\u0645 \u0645\u062D\u0634\u0649 \u0647\u0648\u062A \u0644\u0627\u064A\u0646", "0117022": "\u0648\u062C\u0628\u0629 \u0639\u0627\u0626\u0644\u064A1", "0117023": "\u0648\u062C\u0628\u0629 \u0639\u0627\u0626\u0644\u064A2", "0117036": "\u0648\u062C\u0628\u0629 \u0627\u0644\u0643\u064A\u0627\u0646 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0648\u0643\u0641\u062A\u0647", "0117037": "\u0648\u062C\u0628\u0629 \u0635\u064A\u0627\u0645\u064A \u0627\u0644\u0643\u064A\u0627\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A", "0117044": "\u0648\u062C\u0628\u0647 \u0627\u0644\u0643\u064A\u0627\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A VIP", "0117045": "\u0648\u062C\u0628\u0647 \u0628\u0627\u0631\u0643 \u0641\u0637\u0627\u0631 \u0645\u064A\u0643\u0633", "0117046": "\u0648\u062C\u0628\u0647 \u0628\u0627\u0631\u0643 \u0635\u064A\u0627\u0645\u064A", "0117047": "\u0648\u062C\u0628\u0647 \u0639\u0634\u0627\u0621 \u0634\u0631\u0643\u0647 \u0627\u0644\u0643\u0647\u0631\u0628\u0627 1", "0117048": "\u0648\u062C\u0628\u0647 \u0639\u0634\u0627\u0621 \u0634\u0631\u0643\u0647 \u0627\u0644\u0643\u0647\u0631\u0628\u0627 2", "0117049": "\u0648\u062C\u0628\u0647 \u0646\u0635 \u0641\u0631\u0627\u062E \u0645\u0648\u0642\u0639\u0646\u0627 \u0648\u0647\u0648\u062A \u0644\u0627\u064A\u0646", "0117050": "\u0648\u062C\u0628\u0629 \u0627\u0644\u0648\u064A\u0643 \u0627\u0646\u062F \u0645\u0648\u0642\u0639\u0646\u0627 \u0648\u0647\u0648\u062A \u0644\u0627\u064A\u0646", "0117051": "\u0639\u0631\u0636 \u0641\u0631\u062F \u062D\u0645\u0627\u0645 \u0645\u062D\u0634\u064A \u0648\u0634\u0648\u0631\u0628\u0647 \u062D\u0645\u0627\u0645 \u0642\u0637\u0639", "0117053": "\u062E\u062F\u0645\u0647", "0117054": "\u0628\u0648\u0643\u0633 \u0627\u0644\u062A\u0634\u062C\u064A\u0639", "0117055": "\u0628\u0648\u0643\u0633 \u0627\u0644\u062A\u0634\u062C\u064A\u0639 \u062F\u0628\u0644", "0117056": "\u0628\u0648\u0643\u0633 \u0634\u0644\u0647 \u0627\u0644\u062A\u0634\u062C\u064A\u0639", "0117057": "\u0635\u064A\u0646\u064A\u0647 \u0639\u064A\u0644\u0647 \u0627\u0644\u062A\u0634\u062C\u064A\u0639", "0117063": "\u0648\u062C\u0628\u0629 \u0627\u0644\u0628\u0646\u0643 \u0643\u0641\u062A\u0647 \u0648\u0634\u064A\u0634", "0117064": "\u0648\u062C\u0628\u0629 \u0627\u0644\u0628\u0646\u0643 \u0643\u0641\u062A\u0647 \u0648\u0634\u064A\u0634 \u0643\u0648\u0645\u0628\u0648", "0117065": "\u0648\u062C\u0628\u0647 \u0643\u0641\u062A\u0647 \u0648\u0645\u0644\u0648\u062E\u064A\u0647 \u0645\u0648\u0642\u0639\u0646\u0627", "0117066": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0645\u0648\u0642\u0639\u0646\u0627", "0117067": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0635\u062F\u0648\u0631 \u0645\u0634\u0648\u064A\u0647 \u0645\u0648\u0642\u0639\u0646\u0627", "0117068": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u062D\u0648\u0627\u0648\u0634\u064A \u0645\u0648\u0642\u0639\u0646\u0627", "0117069": "\u0639\u0631\u0636 \u0643\u0641\u062A\u0647 \u0648\u0632\u0646 \u0645\u0648\u0642\u0639\u0646\u0627", "0201001": "\u0627\u0631\u0632 \u0628\u0627\u0644\u0644\u0628\u0646", "0201002": "\u0627\u0645 \u0639\u0644\u064A", "0201003": "\u0643\u0631\u064A\u0645 \u0643\u0631\u0627\u0645\u064A\u0644", "0202001": "\u0628\u064A\u0628\u0633\u0649", "0202002": "\u0633\u0641\u0646", "0202003": "\u0645\u064A\u0631\u0646\u062F\u0627", "0202004": "\u0628\u064A\u0628\u0633\u0649 \u062F\u0627\u064A\u062A", "0202005": "\u0645\u064A\u0627\u0629 \u0635\u063A\u064A\u0631\u0629", "0202006": "\u0639\u0635\u064A\u0631 \u0641\u0631\u064A\u0634", "111": "\u0639\u0631\u0636 \u062D\u0648\u0627\u0648\u0634\u064A \u0637\u0644\u0628\u0627\u062A", "197": "\u0639\u0631\u0636 \u0641\u0631\u0648\u062C \u0645\u0634\u0648\u064A \u0645\u0639 \u0645\u0644\u0648\u062E\u064A\u0647", "218": "\u0639\u0631\u0636 \u0631\u0628\u0639 \u0643\u064A\u0644\u0648 \u0643\u0641\u062A\u0647 \u0637\u0644\u0628\u0627\u062A", "2200": "\u0639\u0631\u0636 \u0635\u064A\u0646\u064A\u0647 \u0645\u0634\u0627\u0648\u064A \u0648\u0641\u0631\u0647\u0627", "235": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0628\u0627\u0646\u064A\u0647 \u0648\u0641\u0631\u0647\u0627", "239": "\u0648\u062C\u0628\u0647 \u0641\u0631\u0648\u062C \u0645\u0634\u0648\u064A", "260": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0648\u0643\u0641\u062A\u0647 \u0648\u0641\u0631\u0647\u0627", "260.0": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0641\u062A\u0647 \u0648\u0641\u0631\u0647\u0627", "260.00": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0631\u0628\u0639 \u0641\u0631\u0627\u062E \u0648\u0634\u064A\u0634 \u0648\u0643\u0641\u062A\u0647 \u0648\u0641\u0631\u0647\u0627", "260.000": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0646\u0635 \u0641\u0631\u0627\u062E \u0648\u0641\u0631\u0647\u0627", "261": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u062D\u0648\u0627\u0648\u0634\u064A \u0648\u0641\u0631\u0647\u0627", "262": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0633\u062C\u0642 \u0648\u0641\u0631\u0647\u0627", "263": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0634\u064A\u0634 \u0648\u0641\u0631\u0647\u0627", "264": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0628\u0627\u0646\u064A\u0647 \u0648\u0641\u0631\u0647\u0627", "265": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0635\u062F\u0648\u0631 \u0648\u0641\u0631\u0647\u0627", "266": "\u0633\u0627\u0646\u062F\u0648\u062A\u0634 \u0643\u0628\u062F\u0647 \u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u064A \u0648\u0641\u0631\u0647\u0627", "315": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0643\u0641\u062A\u0647 \u0648\u0645\u0644\u0648\u062E\u064A\u0647 \u0637\u0644\u0628\u0627\u062A", "330": "\u0639\u0631\u0636 \u0648\u062C\u0628\u0629 \u0645\u064A\u0643\u0633 \u0627\u0644\u062F\u0647\u0627\u0646 \u0648\u0641\u0631\u0647\u0627", "350": "\u0646\u0635 \u0636\u0644\u0639", "650": "\u0636\u0644\u0639 \u0643\u0627\u0645\u0644", "74": "\u0634\u0639\u0631\u064A\u0647 \u0633\u0627\u062F\u0647", "89": "\u0634\u0639\u0631\u064A\u0647 \u0628\u0627\u0644\u0645\u0643\u0633\u0631\u0627\u062A" };
var TALABAT_PRODUCTS = [["3114762376", "Grilled Kebab - Lamb", "Grilled Meat"], ["3114762388", "Grilled steak", "Grilled Meat"], ["3114762399", "Fillet", "Grilled Meat"], ["3114762410", "Grilled Liver", "Grilled Meat"], ["3114762420", "Veal Kebab", "Grilled Meat"], ["3114762431", "Mutton Ribs", "Grilled Meat"], ["3114762446", "Veal Ribs", "Grilled Meat"], ["3114762470", "Kebab And Kofta - Lamb", "Grilled Meat"], ["3114762479", "Kebab And Kofta - Veal", "Grilled Meat"], ["3114762492", "Grilled Tarb", "Grilled Meat"], ["3114762499", "Mutton Liver", "Grilled Meat"], ["3114762378", "Mix Grill", "Grills By Kilo"], ["3114762389", "Nefa", "Grills By Kilo"], ["3114762400", "Baladi Sausage", "Grills By Kilo"], ["3114762411", "Grilled Chicken Breasts", "Grills By Kilo"], ["3114762424", "Shish Tawook", "Grills By Kilo"], ["3114762430", "Kofta", "Grills By Kilo"], ["3114762437", "Tarb", "Grills By Kilo"], ["3114762440", "Mutton Kebab And Kofta", "Grills By Kilo"], ["3114762452", "Veal Kebab And Kofta", "Grills By Kilo"], ["3114762453", "Grilled Kofta", "Grills By Kilo"], ["3114762462", "Mutton Kebab", "Grills By Kilo"], ["3114762464", "Veal Kebab", "Grills By Kilo"], ["3114762469", "Veal Ribs", "Grills By Kilo"], ["3114762480", "Mutton Ribs", "Grills By Kilo"], ["3114762219", "Hakawi Grills Feast Platter", "Trays (At special prices)"], ["3114762225", "Feast Platter", "Trays (At special prices)"], ["3114762231", "Tabk Elbalad", "Trays (At special prices)"], ["3114762240", "Loved Ones Platter", "Trays (At special prices)"], ["3114762243", "The Invitation Tray", "Trays (At special prices)"], ["3114762251", "Monster Platter", "Trays (At special prices)"], ["3114762256", "Pasha Appetizers", "Trays (At special prices)"], ["3114762264", "The Gathering Plate", "Trays (At special prices)"], ["3114762434", "Shish Tawook", "Grilled Chicken"], ["3114762439", "Half grilled chicken on charcoal", "Grilled Chicken"], ["3114762447", "Grilled Quail", "Grilled Chicken"], ["3114762455", "Half Shish Chicken", "Grilled Chicken"], ["3114762460", "Quarter grilled chicken", "Grilled Chicken"], ["3114762203", "Pasha's Appetizers", "Exclusive Offers"], ["3114762208", "ElOzoma Tray", "Exclusive Offers"], ["3114762213", "Family Platter 2", "Exclusive Offers"], ["3513683425", "1/4 Grilled Kofta Offer", "Exclusive Offers"], ["3513687513", "Kofta Meal Offer", "Exclusive Offers"], ["3513693932", "Kofta and Molokhia Meal Offer", "Exclusive Offers"], ["3513694824", "Shish Tawook Meal Offer", "Exclusive Offers"], ["3513695040", "Hawawshi Offer", "Exclusive Offers"], ["3513695492", "Small Mixed Grill Offer", "Exclusive Offers"], ["3513698777", "Grilled Half Chicken Meal Offer", "Exclusive Offers"], ["3602977763", "Large Mixed Grill Platter Offer", "Exclusive Offers"], ["3114762220", "Stuffed Pigeon with Rice - Piece", "El Mhamer And Meshamer"], ["3114762229", "Lamb Shank", "El Mhamer And Meshamer"], ["3114762236", "Boneless Fawteh Kaware", "El Mhamer And Meshamer"], ["3114762245", "Meat with Fatteh", "El Mhamer And Meshamer"], ["3114762252", "Chicken with Fatteh", "El Mhamer And Meshamer"], ["3114762259", "Grilled Pigeon", "El Mhamer And Meshamer"], ["3114762265", "Veal Shank", "El Mhamer And Meshamer"], ["3114762487", "Kofta meal", "Meals"], ["3114762491", "Shish Tawook Meal", "Meals"], ["3114762494", "Large Mixed Grill Platter", "Meals"], ["3114762498", "Quarter Chicken and Kofta Meal", "Meals"], ["3114762502", "Quarter Chicken and Shish Tawook Meal", "Meals"], ["3114762508", "Half chicken meal", "Meals"], ["3114762516", "Quarter kilo Tarb meal", "Meals"], ["3114762521", "Family Mix Meal", "Meals"], ["3114762538", "Super Family Mix Meal", "Meals"], ["3114762541", "Family Mix Chicken Meal", "Meals"], ["3114762547", "Small Mixed Grill Meal", "Meals"], ["3114762286", "Super Family Mix Meal", "Platters"], ["3114762299", "Half Chicken Meal", "Platters"], ["3114762310", "Quarter Chicken and Kofta Meal", "Platters"], ["3114762349", "Lamb Kofta and Kebab Platter", "Platters"], ["3114762360", "Lamb Kebab and Kofta Platter", "Platters"], ["3114762373", "Small Mixed Grill Plate", "Platters"], ["3114762391", "Veal Kebab and Kofta Plate", "Platters"], ["3114762408", "Lamb Kebab Plate", "Platters"], ["3114762425", "Lamb Kebab and Ribs Plate", "Platters"], ["3114762433", "Lamb Ribs Plate", "Platters"], ["3114762438", "Ribs and Veal Kebab Plate", "Platters"], ["3114762441", "Veal Kebab Plate", "Platters"], ["3114762451", "Veal Rib Plate", "Platters"], ["3114762218", "Kids' Pane Chicken Meal", "Kids Meal"], ["3114762222", "Kofta Kids Meal", "Kids Meal"], ["3114762228", "Kids Shish Tawook Meal", "Kids Meal"], ["3114762234", "Kids meal grilled chicken breasts", "Kids Meal"], ["3114762235", "Chicken Kids Meal", "Kids Meal"], ["3114762276", "Kebab Sandwich Combo", "Combo Sandwiches"], ["3114762282", "Kofta Sandwich Combo", "Combo Sandwiches"], ["3114762291", "Sausage Combo Sandwich", "Combo Sandwiches"], ["3114762298", "Shish Tawook Sandwich Combo", "Combo Sandwiches"], ["3114762305", "Hawawshi Sandwich Combo", "Combo Sandwiches"], ["3114762313", "Chicken Pane Combo Sandwich", "Combo Sandwiches"], ["3114762320", "Alexandrian Liver Sandwich Combo", "Combo Sandwiches"], ["3114762330", "Tarab Sandwich Combo", "Combo Sandwiches"], ["3114762337", "Grilled Chicken Breast Combo Sandwich", "Combo Sandwiches"], ["3114762279", "Kebab Sandwich", "Sandwiches"], ["3114762289", "Grilled chicken breast sandwich", "Sandwiches"], ["3114762300", "Kebab Combo Sandwich", "Sandwiches"], ["3114762308", "Kofta Sandwich Combo", "Sandwiches"], ["3114762319", "Sausage Combo Sandwich", "Sandwiches"], ["3114762329", "Shish Tawook Sandwich Combo", "Sandwiches"], ["3114762341", "Hawawshi Combo", "Sandwiches"], ["3114762350", "Chicken Pane Sandwich Combo", "Sandwiches"], ["3114762361", "Grilled Chicken Breast Sandwich Combo", "Sandwiches"], ["3114762370", "Alexandrian Liver Sandwich Combo", "Sandwiches"], ["3114762384", "Tarb Sandwich Combo", "Sandwiches"], ["3114762396", "Kofta Sandwich", "Sandwiches"], ["3114762409", "Sausage sandwich", "Sandwiches"], ["3114762419", "Kofta Roll Sandwich", "Sandwiches"], ["3114762426", "Shish Tawook Sandwich", "Sandwiches"], ["3114762445", "Hawawshi", "Sandwiches"], ["3114762454", "Chicken Pane Sandwich", "Sandwiches"], ["3114762472", "Alexandrian Liver Sandwich", "Sandwiches"], ["3114762481", "Tarb Sandwich", "Sandwiches"], ["3114762506", "Oven-baked Rice Casserole with Meat", "Casseroles With Meat"], ["3114762510", "Moussaka Tagine with Minced Meat", "Casseroles With Meat"], ["3114762517", "Meat Tagine with Onions", "Casseroles With Meat"], ["3114762522", "Potato Tagine with Meat", "Casseroles With Meat"], ["3114762526", "Okra Tagine with Meat", "Casseroles With Meat"], ["3114762530", "Mixed Vegetable Tagine with Meat", "Casseroles With Meat"], ["3114762535", "Molokhia Tagine with Chicken", "Casseroles With Meat"], ["3114762539", "Molokhia Casserole with Meat", "Casseroles With Meat"], ["3114762545", "Pasta Tagine with Liver", "Casseroles With Meat"], ["3114762550", "Pasta with Sausage", "Casseroles With Meat"], ["3114762553", "Chicken Pasta", "Casseroles With Meat"], ["3114762558", "Pasta Casserole with Meat", "Casseroles With Meat"], ["3114762263", "Mombar", "Side Items"], ["3114762270", "Grape Leaves", "Side Items"], ["3114762275", "Mixed Stuffed Vegetables", "Side Items"], ["3114762283", "Oriental Sausage", "Side Items"], ["3114762293", "French fries", "Side Items"], ["3114762301", "Plain Fattah", "Side Items"], ["3114762309", "White Rice", "Side Items"], ["3114762318", "Mixed Rice", "Side Items"], ["3114762328", "Basmati Rice", "Side Items"], ["3114762340", "Basmati rice with liver", "Side Items"], ["3114762348", "Oven Baked Pasta", "Side Items"], ["3114762359", "Spaghetti Bolognese with minced meat", "Side Items"], ["3114762369", "Spaghetti Neapolitan", "Side Items"], ["3114762379", "Plain Baked Rice Casserole", "Casseroles"], ["3114762390", "Molokhia Casserole", "Casseroles"], ["3114762403", "Potato Tagine", "Casseroles"], ["3114762414", "Okra Tagine", "Casseroles"], ["3114762421", "Mixed Vegetable Tagine", "Casseroles"], ["3114762423", "Moussaka Casserole", "Casseroles"], ["3114762372", "Orzo Soup", "Soup"], ["3114762381", "Vegetable Soup", "Soup"], ["3114762393", "Pigeon Soup", "Soup"], ["3114762404", "Knuckles Soup", "Soup"], ["3114762416", "Diced Pigeon Soup", "Soup"], ["3114762427", "Cream Of Chicken Soup", "Soup"], ["3114762432", "Cream Of Mushroom Soup", "Soup"], ["3114762436", "Lentil Soup", "Soup"], ["3114762355", "Oriental pickles", "Salads"], ["3114762366", "Tahini salad", "Salads"], ["3114762385", "Oriental Salad", "Salads"], ["3114762401", "Marinated Tomatoes", "Salads"], ["3114762415", "Baba Ghanoush Salad", "Salads"], ["3114762442", "Pickled cucumber", "Salads"], ["3114762468", "Garlic Dip", "Salads"], ["3114762503", "Pickled eggplant", "Salads"], ["3114762512", "Yogurt Salad", "Salads"], ["3114762288", "Rice Pudding", "Sweets"], ["3114762295", "Om Ali", "Sweets"], ["3114762339", "Rice Pudding", "Desserts"], ["3114762358", "Um Ali", "Desserts"], ["3114762367", "Cream Caramel", "Desserts"], ["3114762322", "Kofta - Ready To Cook", "Ready To Cook Items"], ["3114762332", "Shish Tawook - Ready To Cook", "Ready To Cook Items"], ["3114762343", "Lamb Kebab - Ready To Cook", "Ready To Cook Items"], ["3114762354", "Veal Kebab - Ready To Cook", "Ready To Cook Items"], ["3114762364", "Lamb Chops Ribs - Ready To Cook", "Ready To Cook Items"], ["3114762375", "Veal Ribs - Ready To Cook", "Ready To Cook Items"], ["3114762387", "Grilled Chicken Breasts - Ready To Cook", "Ready To Cook Items"], ["3114762398", "Chicken Pane Breasts - Ready To Cook", "Ready To Cook Items"], ["3114762413", "Oriental Sausage - Ready To Cook", "Ready To Cook Items"], ["3114762317", "Pepsi Can", "Beverages"], ["3114762327", "7 Up Can", "Beverages"], ["3114762335", "Miranda Cans", "Beverages"], ["3114762344", "Mineral water", "Beverages"]];
var APEX_PRICES = { "0101001": 34.86, "0101002": 34.86, "0101003": 34.86, "0101004": 34.86, "0101005": 34.86, "0101006": 37.35, "0101007": 34.86, "0101008": 36.26, "0101009": 33.85, "0101010": 36.26, "0102001": 44.27, "0102002": 75.66, "0102003": 56.02, "0102004": 44.27, "0102005": 89.45, "0102006": 44.27, "0102007": 148.41, "0102008": 46.98, "0103001": 98.61, "0103002": 94.62, "0103003": 58.995, "0103004": 125.59, "0103005": 46.98, "0103006": 88.65, "0103007": 51.72, "0103008": 55.9968, "0103009": 69.996, "0103010": 66.08, "0103011": 85.97, "0103012": 84.66, "0103013": 75.66, "0103014": 44.9958, "0103015": 94.81, "0103016": 74.7, "0103017": 94.81, "0103018": 152.69, "0103019": 150.0012, "0103020": 91.998, "0103021": 91.998, "0103022": 99.9997, "0103023": 80.7, "0104001": 141.74, "0104002": 141.74, "0104003": 163.67, "0104004": 142.7, "0104005": 142.7, "0104006": 164.63, "0104007": 116.55, "0104008": 116.55, "0104009": 138.48, "0104010": 161.73, "0104011": 161.73, "0104012": 183.66, "0104013": 116.55, "0104014": 116.55, "0104015": 138.48, "0104016": 116.55, "0104017": 116.55, "0104018": 138.48, "0104019": 143.66, "0104020": 143.66, "0104021": 165.59, "0104022": 143.66, "0104023": 143.66, "0104024": 165.59, "0104025": 133.12, "0104026": 155.052, "0105001": 559.27, "0105002": 514.1, "0105003": 324.67, "0105004": 297.25, "0105005": 198.21, "0105006": 88.9998, "0105007": 679.9986, "0105008": 679.9986, "0105009": 731.69, "0105010": 79.002, "0105011": 294.9978, "0105012": 239.001, "0106001": 103.9, "0106002": 103.9, "0106003": 103.9, "0106004": 103.9, "0106005": 119.9964, "0106006": 75.0006, "0106007": 81.32, "0106008": 297.25, "0106009": 297.25, "0106010": 209.74, "0106011": 297.25, "0106012": 297.25, "0106013": 297.25, "0106014": 297.25, "0106015": 342.43, "0106016": 396.64, "0106017": 267.76, "0106018": 287.32, "0106019": 287.32, "0106020": 363.82, "0106021": 188.82, "0106022": 188.82, "0106023": 234.01, "0106024": 206.9, "0106025": 206.9, "0106026": 206.9, "0106027": 446.3, "0107001": 198.41, "0107002": 199.37, "0107003": 183.33, "0107004": 408.77, "0107005": 122.92, "0107006": 212.92, "0107007": 171.23, "0107008": 143.24, "0107009": 669.11, "0107010": 352.7, "0107011": 249.99, "0107012": 192.2496, "0107013": 669.11, "0107014": 352.7, "0107015": 249.99, "0107016": 185.19, "0107017": 660.07, "0107018": 343.4, "0107019": 241.03, "0107020": 175.89, "0107021": 692.98, "0107022": 346.4912, "0107023": 241.2281, "0107024": 173.2456, "0107025": 339.9959, "0108001": 1015.26, "0108002": 515.37, "0108003": 371.32, "0108004": 266.4, "0108005": 1034.62, "0108006": 522.15, "0108007": 371.32, "0108008": 268.33, "0108009": 1097.19, "0108010": 557.44, "0108011": 417.49, "0108012": 303.17, "0108013": 1113.01, "0108014": 566.72, "0108015": 427.15, "0108016": 282.86, "0108017": 1218.51, "0108018": 616.03, "0108019": 431.3, "0108020": 313.34, "0108021": 1283.32, "0108022": 644.65, "0108023": 453.08, "0108024": 328.73, "0108025": 1374.33, "0108026": 697.03, "0108027": 484.85, "0108028": 351.77, "0108029": 1357.77, "0108030": 687.72, "0108031": 501.6, "0108032": 350.19, "0108033": 1078.58, "0108034": 527.94, "0108035": 406.79, "0108036": 277.75, "0108037": 1161.41, "0108038": 584.57, "0108039": 425.82, "0108040": 297.13, "0108041": 996.87, "0108042": 501.6, "0108043": 370.97, "0108044": 254.99, "0108045": 1015.26, "0108046": 510.91, "0108047": 359.36, "0108048": 263.49, "0108049": 1255.4, "0108050": 631.89, "0108051": 445.76, "0108052": 324.78, "0108053": 1200.12, "0108054": 608.77, "0108055": 421.95, "0108056": 308.26, "0109001": 270.15, "0109002": 270.15, "0109003": 270.15, "0109004": 297.25, "0109005": 305.51, "0109006": 267.2, "0109007": 248.01, "0109008": 351.46, "0109009": 252.08, "0109010": 252.08, "0109011": 376.1, "0109012": 376.1, "0109013": 399.98, "0109014": 399.98, "0109015": 476.12, "0109016": 476.12, "0109017": 445.67, "0109018": 445.67, "0109019": 378.3, "0109020": 429.17, "0109021": 902.61, "0109022": 1535.06, "0109023": 876.32, "0110001": 161.73, "0110002": 161.73, "0110003": 161.73, "0110004": 161.73, "0110005": 161.73, "0110006": 161.73, "0110007": 161.73, "0110008": 161.73, "0110009": 161.73, "0110010": 161.73, "0110011": 161.73, "0110012": 161.73, "0111001": 882.73, "0111002": 1390.5, "0111003": 1589.27, "0111004": 2881.29, "0111005": 1688.66, "0111006": 1788.04, "0111007": 1788.04, "0111008": 1828.7, "0111009": 2831.6, "0111010": 300.0024, "0112001": 8.77, "0112002": 316, "0112003": 632, "0112004": 789.5, "0113001": 216.67, "0113002": 168.0018, "0113003": 100.0008, "0113004": 306.75, "0113005": 285.09, "0113006": 455, "0113007": 455, "0113008": 535.96, "0113009": 558.77, "0113010": 569.04, "0113011": 587.28, "0114001": 2.632, "0114002": 65.0028, "0114003": 26.32, "0114004": 69.996, "0114005": 40.0026, "0114006": 7.02, "0114007": 105.8, "0114008": 70, "0115001": 166.67, "0115002": 141.67, "0115003": 146.93, "0115004": 141.23, "0115005": 141.67, "0115006": 170.61, "0115007": 192.101, "0115008": 192.98, "0115009": 161.84, "0115010": 170.61, "0115011": 209.65, "0115012": 83.33, "0115013": 83.33, "0115014": 262.28, "0115015": 109.65, "0115016": 206.14, "0115017": 174.56, "0115018": 876.31, "0115019": 1227.19, "0115020": 657.9, "0116001": 247.544, "0116002": 312.412, "0116003": 222.94, "0116004": 208.027, "0116005": 198.9984, "0116006": 127.5, "0116007": 798.245, "0116008": 1455.263, "0116009": 938.596, "0116010": 359.39, "0117001": 225.036, "0117022": 754.4, "0117023": 711, "0117036": 153.51, "0117037": 153.51, "0117044": 254.4, "0117045": 429, "0117046": 174, "0117047": 175.44, "0117048": 307.017, "0117049": 174.56, "0117050": 700.877, "0117051": 233.33, "0117053": 87.719, "0117054": 113.157, "0117055": 292.105, "0117056": 570.175, "0117057": 1271.929, "0117063": 175.43, "0117064": 219.29, "0117065": 260.6, "0117066": 146.5, "0117067": 146.5, "0117068": 91.2, "0117069": 186.9, "0201001": 26.2, "0201002": 85.83, "0201003": 53.31, "0202001": 26.2, "0202002": 26.2, "0202003": 26.2, "0202004": 25.44, "0202005": 22.59, "0202006": 56.92, "111": 111.1, "197": 172.807, "218": 226.853, "2200": 1929.82, "235": 206.14, "239": 209.649, "260": 228.07, "260.0": 114.035, "260.00": 228.07, "260.000": 228.07, "261": 114.035, "262": 114.035, "263": 114.035, "264": 114.035, "265": 114.035, "266": 114.035, "315": 316.14, "330": 289.473, "350": 307.0175, "650": 570.1754, "74": 64.9122, "89": 78.07 };

// ../sites/lib/marsad/items.js
var SEED0 = {
  "stuffed pigeon with rice - piece": ["0107006"],
  "grilled half chicken meal offer": ["0116003"],
  "half grilled chicken on charcoal": ["0107001"],
  "pepsi can": ["0202001"],
  "7 up can": ["0202002"],
  "miranda cans": ["0202003"],
  "orzo soup": ["0102001"],
  "lentil soup": ["0102006"],
  "vegetable soup": ["0102008"],
  "cream of chicken soup": ["0102002"],
  "cream of mushroom soup": ["0102003"],
  "pigeon soup": ["0102004", "0102005"],
  "shish tawook meal offer": ["0116004"],
  "hawawshi offer": ["111"],
  "rice pudding": ["0201001"],
  "oven baked pasta": ["0103017"],
  "kofta and molokhia meal offer": ["315"],
  "1/4 grilled kofta offer": ["218"],
  "mutton ribs": ["0108028", "0108026", "0108025"],
  "veal ribs": ["0108032", "0108030"],
  "tahini salad": ["0101001"],
  "pickled eggplant": ["0101007"],
  "marinated tomatoes": ["0101003"],
  "oriental salad": ["0101002"],
  "pickled cucumber": ["0101005"],
  "oriental pickles": ["0101009"],
  "garlic dip": ["0101006"],
  "kofta meal offer": ["0116001"],
  "baladi sausage": ["0108044", "0108043"],
  "om ali": ["0201002"],
  "kofta": ["0108004", "0108003", "0108002", "0108001"],
  "mix grill": ["0108036", "0108035", "0108034"],
  "grape leaves": ["0103002"],
  "molokhia casserole": ["0106007"],
  "white rice": ["0103007"],
  "basmati rice": ["0103010"],
  "nefa": ["0108040", "0108039"],
  "half shish chicken": ["0107002"],
  "large mixed grill platter offer": ["0116010"],
  "kebab and kofta - lamb": ["0108012", "0108011", "0108010", "0108009"],
  "kebab and kofta - veal": ["0108016", "0108015", "0108014", "0108013"],
  "chicken pane sandwich": ["0104013", "0104014"],
  "sausage sandwich": ["0104005"],
  "grilled chicken breasts": ["0107012", "0107011", "0107010", "0107009"],
  "mixed stuffed vegetables": ["0103004"],
  "oven-baked rice casserole with meat": ["0106018"],
  "kids' pane chicken meal": ["0110001", "0110002"],
  "half chicken meal": ["0109003"],
  "quarter grilled chicken": ["0107005"],
  "french fries": ["0103005"],
  "moussaka casserole": ["0106001"],
  "shish tawook": ["0107020", "0107019", "0107018"],
  "tarb": ["0108008", "0108007", "0108006"],
  "potato tagine": ["0106002"],
  "plain baked rice casserole": ["0106005"],
  "potato tagine with meat": ["0106012"],
  "kebab sandwich combo": ["0104012"],
  "spaghetti neapolitan": ["0103016"]
};
var SEED = { ...SEED0 };
for (const [n, ids] of Object.entries(MENU_SEED)) SEED[n] = [.../* @__PURE__ */ new Set([...ids, ...SEED0[n] || []])];
var WORDS = {
  grilled: "\u0645\u0634\u0648\u064A",
  grill: "\u062C\u0631\u064A\u0644",
  kofta: "\u0643\u0641\u062A\u0647",
  kebab: "\u0643\u0628\u0627\u0628",
  chicken: "\u0641\u0631\u0627\u062E",
  rice: "\u0627\u0631\u0632",
  soup: "\u0634\u0648\u0631\u0628\u0647",
  salad: "\u0633\u0644\u0637\u0647",
  sandwich: "\u0633\u0627\u0646\u062F\u0648\u062A\u0634",
  combo: "\u0643\u0648\u0645\u0628\u0648",
  meal: "\u0648\u062C\u0628\u0647",
  offer: "\u0639\u0631\u0636",
  casserole: "\u0637\u0627\u062C\u0646",
  tagine: "\u0637\u0627\u062C\u0646",
  pasta: "\u0645\u0643\u0631\u0648\u0646\u0647",
  lamb: "\u0636\u0627\u0646\u064A",
  mutton: "\u0636\u0627\u0646\u064A",
  veal: "\u0628\u062A\u0644\u0648",
  ribs: "\u0631\u064A\u0634",
  liver: "\u0643\u0628\u062F\u0647",
  sausage: "\u0633\u062C\u0642",
  pigeon: "\u062D\u0645\u0627\u0645",
  quail: "\u0633\u0645\u0627\u0646",
  mixed: "\u0645\u0634\u0643\u0644",
  mix: "\u0645\u064A\u0643\u0633",
  breasts: "\u0635\u062F\u0648\u0631",
  breast: "\u0635\u062F\u0648\u0631",
  shish: "\u0634\u064A\u0634",
  tawook: "\u0637\u0627\u0648\u0648\u0642",
  molokhia: "\u0645\u0644\u0648\u062E\u064A\u0647",
  okra: "\u0628\u0627\u0645\u064A\u0647",
  potato: "\u0628\u0637\u0627\u0637\u0633",
  potatoes: "\u0628\u0637\u0627\u0637\u0633",
  fries: "\u0628\u0637\u0627\u0637\u0633",
  tray: "\u0635\u064A\u0646\u064A\u0647",
  platter: "\u0635\u064A\u0646\u064A\u0647",
  steak: "\u0627\u0633\u062A\u064A\u0643",
  hawawshi: "\u062D\u0648\u0627\u0648\u0634\u064A",
  fatta: "\u0641\u062A\u0647",
  fattah: "\u0641\u062A\u0647",
  trotters: "\u0643\u0648\u0627\u0631\u0639",
  tahini: "\u0637\u062D\u064A\u0646\u0647",
  garlic: "\u062A\u0648\u0645\u064A\u0647",
  pickled: "\u0645\u062E\u0644\u0644",
  pickles: "\u0645\u062E\u0644\u0644",
  eggplant: "\u0628\u0627\u0630\u0646\u062C\u0627\u0646",
  yogurt: "\u0632\u0628\u0627\u062F\u064A",
  spaghetti: "\u0627\u0633\u0628\u0627\u062C\u062A\u064A",
  bolognese: "\u0628\u0644\u0648\u0646\u064A\u0632",
  mombar: "\u0645\u0645\u0628\u0627\u0631",
  vegetables: "\u062E\u0636\u0627\u0631",
  vegetable: "\u062E\u0636\u0627\u0631",
  stuffed: "\u0645\u062D\u0634\u064A",
  grape: "\u0639\u0646\u0628",
  leaves: "\u0648\u0631\u0642",
  water: "\u0645\u064A\u0627\u0647",
  pepsi: "\u0628\u064A\u0628\u0633\u064A",
  diet: "\u062F\u0627\u064A\u062A",
  moussaka: "\u0645\u0633\u0642\u0639\u0647",
  meat: "\u0644\u062D\u0645\u0647",
  pane: "\u0628\u0627\u0646\u064A\u0647",
  kids: "\u0627\u0637\u0641\u0627\u0644",
  half: "\u0646\u0635\u0641",
  quarter: "\u0631\u0628\u0639",
  orzo: "\u0644\u0633\u0627\u0646",
  lentil: "\u0639\u062F\u0633",
  mushroom: "\u0645\u0634\u0631\u0648\u0645",
  cream: "\u0643\u0631\u064A\u0645\u0647",
  basmati: "\u0628\u0633\u0645\u062A\u064A",
  white: "\u0633\u0627\u062F\u0629",
  vine: "\u0639\u0646\u0628",
  mahashi: "\u0645\u062D\u0634\u064A",
  khalta: "\u062E\u0644\u0637\u0647",
  plain: "\u0633\u0627\u062F\u0647",
  up: "\u0633\u0641\u0646",
  mirinda: "\u0645\u064A\u0631\u0646\u062F\u0627",
  miranda: "\u0645\u064A\u0631\u0646\u062F\u0627",
  apple: "\u062A\u0641\u0627\u062D",
  orange: "\u0628\u0631\u062A\u0642\u0627\u0644",
  baba: "\u0628\u0627\u0628\u0627",
  ghanoush: "\u063A\u0646\u0648\u062C",
  ghannoug: "\u063A\u0646\u0648\u062C",
  cucumber: "\u062E\u064A\u0627\u0631",
  marinated: "\u0645\u062A\u0628\u0644\u0647",
  sesame: "\u0637\u062D\u064A\u0646\u0647",
  fillet: "\u0641\u064A\u0644\u064A\u0647",
  knuckles: "\u0643\u0648\u0627\u0631\u0639",
  kaware: "\u0643\u0648\u0627\u0631\u0639",
  fatteh: "\u0641\u062A\u0647",
  boneless: "\u0645\u062E\u0644\u064A\u0647",
  onions: "\u0628\u0635\u0644",
  mineral: "\u0645\u064A\u0627\u0647",
  dip: "\u062A\u0648\u0645\u064A\u0647",
  caramel: "\u0643\u0631\u0627\u0645\u064A\u0644",
  ali: "\u0639\u0644\u064A",
  om: "\u0627\u0645",
  um: "\u0627\u0645",
  felto: "\u0641\u064A\u0644\u062A\u0648",
  tabk: "\u0637\u0628\u0642",
  baladi: "\u0628\u0644\u062F\u064A",
  oriental: "\u0628\u0644\u062F\u064A",
  tomatoes: "\u0637\u0645\u0627\u0637\u0645",
  tomato: "\u0637\u0645\u0627\u0637\u0645",
  sweet: "\u062D\u0644\u0648",
  pudding: "\u0644\u0628\u0646",
  nefa: "\u0646\u064A\u0641\u0647",
  tarb: "\u0637\u0631\u0628",
  alexandrian: "\u0627\u0633\u0643\u0646\u062F\u0631\u0627\u0646\u064A",
  sobia: "\u0633\u0648\u0628\u064A\u0627"
};
var ar = /* @__PURE__ */ __name((s) => String(s || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/[ًٌٍَُِّْ]/g, "").toLowerCase(), "ar");
var key = /* @__PURE__ */ __name((s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " "), "key");
var variantKey = /* @__PURE__ */ __name((s) => key(ar(s)).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !["meal", "offer", "combo"].includes(w)).sort().join(" "), "variantKey");
var SEED_VARIANTS = /* @__PURE__ */ new Map();
for (const [name, ids] of Object.entries(SEED)) {
  const k = variantKey(name);
  SEED_VARIANTS.set(k, [.../* @__PURE__ */ new Set([...SEED_VARIANTS.get(k) || [], ...ids])]);
}
function wordScore(en, arName) {
  const words = key(en).split(/[^a-z]+/).filter((w) => w.length > 2 && !["with", "and", "the", "for", "from"].includes(w));
  if (!words.length) return 0;
  const a = ar(arName);
  const weight = /* @__PURE__ */ __name((w) => ["meal", "offer", "combo"].includes(w) ? 0.5 : 1, "weight");
  return words.reduce((n, w) => n + (WORDS[w] && a.includes(ar(WORDS[w]).slice(0, Math.max(3, ar(WORDS[w]).length - 1))) ? weight(w) : 0), 0) / words.reduce((n, w) => n + weight(w), 0);
}
__name(wordScore, "wordScore");
function compareItems(talabat, apex, { learned = /* @__PURE__ */ new Map(), ratio = 1.13 } = {}) {
  const T = talabat.map((x, i) => ({ ...x, i, unit: x.price && x.qty ? x.price / x.qty : null })), A = apex.map((x, i) => ({ ...x, i }));
  const usedA = /* @__PURE__ */ new Set(), pairs = [];
  const known = /* @__PURE__ */ __name((t) => [...learned.get(key(t.name))?.keys() || [], ...SEED[key(t.name)] || [], ...SEED_VARIANTS.get(variantKey(t.name)) || []], "known");
  const priceFar = /* @__PURE__ */ __name((t, a) => !!(t.unit && a.price) && Math.abs(t.unit / a.price - ratio) / ratio > 0.25, "priceFar");
  for (const pass of ["known", "words"]) for (const t of T) {
    if (pairs.some((p) => p.t === t)) continue;
    let best = null, bestScore = 0, tied = false;
    for (const a of A) {
      if (usedA.has(a.i) || Math.abs((a.qty || 1) - (t.qty || 1)) > 0.01) continue;
      const k = known(t).includes(String(a.no).trim());
      const sameName = key(ar(t.name)) === key(ar(a.name)) && key(ar(t.name));
      const s = priceFar(t, a) ? 0 : sameName ? 2 : pass === "known" ? k ? 2 : 0 : wordScore(t.name, a.name);
      if (s > bestScore) {
        best = a;
        bestScore = s;
        tied = false;
      } else if (s > 0 && s === bestScore && String(a.no) !== String(best?.no)) tied = true;
    }
    if (best && !tied && (pass === "known" || bestScore >= 0.65)) {
      usedA.add(best.i);
      pairs.push({ t, a: best, how: pass });
    }
  }
  const missingOnApex = T.filter((t) => !pairs.some((p) => p.t === t)), extraOnApex = A.filter((a) => !usedA.has(a.i));
  const qty = /* @__PURE__ */ __name((l, k) => l.reduce((n, x) => n + (Number(x[k]) || 1), 0), "qty");
  const modifierContext = T.some((t) => t.modifierRead !== true || t.modifierComplete !== true);
  if (T.some((t) => t.modifierRead === true && t.modifierComplete === true && Array.isArray(t.modifiers))) {
    for (const t of T.filter((x) => x.modifierRead === true && x.modifierComplete === true && Array.isArray(x.modifiers))) {
      for (const modifier of t.modifiers) {
        if (/^\?\s*[x×]/.test(String(modifier).trim())) continue;
        const parts = /^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(.+?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?$/i.exec(String(modifier).trim());
        const shown = Number(parts?.[1] || parts?.[3]), modifierName = (parts?.[2] || String(modifier)).trim(), modifierQty = shown || Number(t.qty) || 1;
        const a = A.find((x) => !usedA.has(x.i) && Math.abs((x.qty || 1) - modifierQty) <= 0.01 && key(ar(x.name)) === key(ar(modifierName)));
        if (a) usedA.add(a.i);
      }
    }
  }
  const unmatchedApex = A.filter((a) => !usedA.has(a.i));
  extraOnApex.length = 0;
  extraOnApex.push(...unmatchedApex);
  const wrongSize = extraOnApex.filter((a) => missingOnApex.some((t) => known(t).includes(String(a.no).trim()) && priceFar(t, a)));
  const modifierUncertain = extraOnApex.length > wrongSize.length && modifierContext;
  const uncertain = modifierUncertain || missingOnApex.some((t) => !known(t).length && !A.some((a) => wordScore(t.name, a.name) >= 0.65));
  return {
    ok: !missingOnApex.length && !extraOnApex.length,
    uncertain,
    modifierUncertain,
    wrongSize: wrongSize.map((a) => (a.qty || 1) + "\xD7 " + a.name),
    pairs: pairs.map((p) => ({ talabat: p.t.name, apex: p.a.name, apexNo: p.a.no, how: p.how, ratio: p.t.unit && p.a.price ? p.t.unit / p.a.price : null })),
    missingOnApex: missingOnApex.map((t) => t.qty + "\xD7 " + t.name),
    extraOnApex: extraOnApex.map((a) => (a.qty || 1) + "\xD7 " + a.name),
    countTalabat: qty(talabat, "qty"),
    countApex: qty(apex, "qty"),
    unmatched: { talabat: missingOnApex.map(({ qty: qty2, name, price }) => ({ qty: qty2, name, price })), apex: extraOnApex.map(({ no, name, qty: qty2, price }) => ({ no, name, qty: qty2, price })) }
  };
}
__name(compareItems, "compareItems");
var knownNos = /* @__PURE__ */ __name((name, learned = /* @__PURE__ */ new Map()) => [...new Set([...learned.get(key(name))?.keys() || [], ...SEED[key(name)] || [], ...SEED_VARIANTS.get(variantKey(name)) || []].map((x) => String(x).trim()))], "knownNos");

// ../sites/lib/marsad/delivery-fields.js
function deliveryPhone(value) {
  let s = String(value || "").trim().replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) - (c >= "\u06F0" ? 1776 : 1632)));
  if (/[x*•…]/i.test(s)) return "";
  s = s.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (/^\+?201[0125]\d{8}$/.test(s)) s = "0" + s.replace(/^\+?20/, "");
  return /^\+?\d{7,15}$/.test(s) ? s : "";
}
__name(deliveryPhone, "deliveryPhone");
function deliveryLabel(name, source, payment, code) {
  const tag = String(code || "").replace(/\D/g, "").slice(0, 10);
  const suffix = " " + (source === "talabat" ? "\u0637\u0644\u0628\u0627\u062A" : "\u0645\u0648\u0642\u0639") + "/" + (payment === "paid" ? "\u0645\u062F\u0641\u0648\u0639" : payment === "cash" ? "\u0643\u0627\u0634" : "\u061F") + (tag ? " #" + tag : "");
  const clean3 = String(name || "\u0639\u0645\u064A\u0644").replace(/#\s*\d+/g, "").replace(/\s+/g, " ").trim() || "\u0639\u0645\u064A\u0644";
  return clean3.slice(0, 50 - suffix.length).trim() + suffix;
}
__name(deliveryLabel, "deliveryLabel");
function deliveryAddress(value, zone = "") {
  let floor = "", flat = "";
  const street = String(value || "").replace(/(?:الدور|الطابق|floor|الشقة|شقة|apartment|apt\.?|flat)\s*[:：]?\s*([\d٠-٩۰-۹A-Za-z/-]+|الأرضي|أرضي|الاول|الأول|الثاني|الثالث|الرابع|الخامس)/gi, (all, v) => {
    if (/^(?:الدور|الطابق|floor)/i.test(all)) floor = v.trim();
    else flat = v.trim();
    return "";
  });
  const key2 = /* @__PURE__ */ __name((s) => s.trim().replace(/^(?:محافظة|governorate)\s+/i, "").toLowerCase(), "key");
  const redundant = /* @__PURE__ */ new Set(["\u0645\u0635\u0631", "egypt", "\u0627\u0644\u0642\u0627\u0647\u0631\u0629", "cairo", "\u0627\u0644\u062C\u064A\u0632\u0629", "giza", key2(zone)]);
  return { floor, flat, street: street.split(/[،,;؛\n—]+/).map((s) => s.trim()).filter((s) => s && !redundant.has(key2(s))).join("\u060C ") };
}
__name(deliveryAddress, "deliveryAddress");

// ../sites/lib/marsad/order-match.js
var digits2 = /* @__PURE__ */ __name((x) => String(x ?? "").replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) >= 1776 ? c.charCodeAt(0) - 1776 : c.charCodeAt(0) - 1632)), "digits");
var textKey = /* @__PURE__ */ __name((x) => digits2(x).toLowerCase().replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/[\u064b-\u065fـ]/g, "").replace(/#\s*\d+|\b\d{1,2}[:.]\d{2}\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " "), "textKey");
function phoneKey(x) {
  const raw = digits2(x);
  if (/[x*•…]/i.test(raw)) return "";
  let s = raw.replace(/\D/g, "").replace(/^00/, "");
  if (s.startsWith("20")) s = s.slice(2);
  if (s.startsWith("0")) s = s.slice(1);
  return /^1[0125]\d{8}$/.test(s) ? s : "";
}
__name(phoneKey, "phoneKey");
var clean = /* @__PURE__ */ __name((x, n) => typeof x === "string" ? x.trim().slice(0, n) : "", "clean");
function customerOf(x = {}) {
  if (!x || typeof x !== "object") x = {};
  return {
    name: clean(x.name, 160),
    phone: phoneKey(x.phone),
    mobile: phoneKey(x.mobile),
    phoneDisplay: deliveryPhone(x.phoneDisplay || x.phone),
    mobileDisplay: deliveryPhone(x.mobileDisplay || x.mobile),
    address: clean(x.address, 360),
    area: clean(x.area, 80),
    accountNo: clean(String(x.accountNo || ""), 40)
  };
}
__name(customerOf, "customerOf");
var parseJson = /* @__PURE__ */ __name((x, fallback = null) => {
  try {
    return JSON.parse(x) ?? fallback;
  } catch {
    return fallback;
  }
}, "parseJson");
var similar = /* @__PURE__ */ __name((a, b) => {
  const x = textKey(a), y = textKey(b);
  if (!x || !y) return null;
  if (x === y) return 1;
  const A = new Set(x.split(" ")), B = new Set(y.split(" "));
  return [...A].filter((w) => B.has(w)).length / Math.max(A.size, B.size);
}, "similar");
var aggregate = /* @__PURE__ */ __name((xs, apex) => {
  const m = /* @__PURE__ */ new Map();
  for (const x of Array.isArray(xs) ? xs : []) {
    const qty = Number(x.qty), price = Number(x.price);
    if (!(qty > 0) || !x.name) continue;
    const k = (apex && x.no ? String(x.no) : key(x.name)) + "|" + (apex ? price : price / qty);
    const old = m.get(k);
    if (old) {
      old.qty += qty;
      if (!apex) old.price += price;
    } else m.set(k, { ...x, qty, price });
  }
  return [...m.values()];
}, "aggregate");
function resolveOrders(rows, apex, {
  manual = /* @__PURE__ */ new Map(),
  branchOk = /* @__PURE__ */ __name(() => null, "branchOk"),
  windowFor = /* @__PURE__ */ __name(() => 45 * 6e4, "windowFor"),
  learned = /* @__PURE__ */ new Map(),
  ratio = 1.13
} = {}) {
  apex = [...new Map(apex.map((a) => [String(a.no), a])).values()];
  const matches = /* @__PURE__ */ new Map(), how = /* @__PURE__ */ new Map(), states = /* @__PURE__ */ new Map(), used = /* @__PURE__ */ new Set();
  for (const o of rows) if (manual.has(o.id)) {
    const no = manual.get(o.id), a = apex.find((x) => String(x.no) === String(no));
    if (no == null || no === "none") states.set(o.id, { state: "excluded", candidates: [], how: "manual" });
    else if (a && !used.has(String(a.no))) {
      matches.set(o.id, a);
      how.set(o.id, "manual");
      used.add(String(a.no));
      states.set(o.id, { state: "confirmed", how: "manual" });
    } else states.set(o.id, { state: "ambiguous", candidates: [], manualProposal: no });
  }
  const pairs = [];
  for (const o of rows) {
    if (manual.has(o.id) || o.excluded || !Number.isFinite(o.anchor)) continue;
    const c = customerOf(o.customer), cp = new Set([c.phone, c.mobile].filter(Boolean));
    for (const a of apex) {
      if (used.has(String(a.no))) continue;
      const reference = referenceEvidence(o, a);
      const code = o.source === "talabat" && o.code ? String(o.code).replace(/\D/g, "") : "", tag = a.tag ? String(a.tag).replace(/\D/g, "") : "";
      const tagExact = !!code && tag === code, tagPart = !!code && !tagExact && tag.length >= 3 && code.startsWith(tag);
      const exact = reference.exact || tagExact;
      const time3 = Number(a.t ?? Date.parse(a.at)), gap = time3 - o.anchor, branch = branchOk(o.branch, a.branch);
      const withinTime = Number.isFinite(time3) && gap >= -12e4 && gap <= windowFor(o);
      if (!Number.isFinite(time3) || !exact && !reference.conflict && !withinTime) continue;
      const ac = customerOf(a.customer), ap = new Set([ac.phone, ac.mobile].filter(Boolean));
      const phone = cp.size && ap.size ? [...cp].some((p) => ap.has(p)) : null;
      const name = similar(c.name, ac.name), address = similar(c.address, ac.address);
      const T = aggregate(o.items, false), A = aggregate(a.items, true);
      const direct = new Map(learned);
      for (const t of T) {
        const ids = A.filter((x) => textKey(x.name) === textKey(t.name)).map((x) => [String(x.no), 2]);
        if (ids.length) direct.set(key(t.name), new Map([...direct.get(key(t.name)) || [], ...ids]));
      }
      const item = T.length && A.length ? compareItems(T, A, { learned: direct, ratio }) : null;
      const money2 = Number(o.amount) > 0 && Number(a.amount) > 0 ? Math.abs(o.amount - a.amount) / Math.max(o.amount, a.amount) : null;
      const identity = phone === true || tagExact;
      const nameConflict = !identity && c.name && ac.name && name != null && name < 0.2;
      const addressConflict = false;
      const conflict = reference.conflict || phone === false && !tagExact || nameConflict || addressConflict || branch === false || item && !item.ok && !tagExact || money2 != null && money2 > 0.3 && !tagExact || !withinTime;
      const fullEvidence = withinTime && branch !== false && (tagExact || identity && money2 != null && money2 < 0.15 && item?.ok !== false && (item?.ok === true || tagPart));
      const strong = !conflict && fullEvidence;
      const score = (exact ? 100 : 0) + (tagPart ? 30 : 0) + (phone === true ? 42 : phone === false ? -70 : 0) + (name ?? 0) * 16 + (address ?? 0) * 18 + (item ? item.ok ? 32 : -24 : 0) + (branch === true ? 8 : branch === false ? -25 : 0) + (money2 == null ? 0 : Math.max(-20, 12 - money2 * 70)) + Math.max(0, 8 - Math.abs(gap) / 6e4 / 5);
      pairs.push({ o: o.id, a, score, strong, exact, conflict, reasons: {
        code: exact ? "exact" : tagPart ? "cut" : null,
        referenceType: reference.type,
        referenceConflict: reference.conflict,
        phone,
        name,
        address,
        nameConflict: !!nameConflict,
        addressConflict: !!addressConflict,
        items: item ? item.ok : null,
        quantities: item ? item.countTalabat === item.countApex : null,
        branch,
        money: money2,
        minutes: gap / 6e4,
        withinTime,
        fullEvidence
      } });
    }
  }
  const sorted = pairs.sort((x, y) => Number(x.conflict) - Number(y.conflict) || y.score - x.score || String(x.a.no).localeCompare(String(y.a.no)));
  const byOrder = /* @__PURE__ */ new Map(), byApex = /* @__PURE__ */ new Map();
  for (const p of sorted) {
    if (!byOrder.has(p.o)) byOrder.set(p.o, []);
    if (!byApex.has(String(p.a.no))) byApex.set(String(p.a.no), []);
    byOrder.get(p.o).push(p);
    byApex.get(String(p.a.no)).push(p);
  }
  const listO = /* @__PURE__ */ __name((id2) => byOrder.get(id2) || [], "listO"), listA = /* @__PURE__ */ __name((no) => byApex.get(String(no)) || [], "listA");
  for (const o of rows) {
    if (manual.has(o.id)) continue;
    const candidates = listO(o.id), best = candidates[0];
    if (!best) {
      states.set(o.id, { state: "unmatched", candidates: [] });
      continue;
    }
    const rivalOrders = candidates.filter((p) => !p.conflict);
    const rivals = listA(best.a.no).filter((p) => !p.conflict), margin = rivalOrders[1] ? best.score - rivalOrders[1].score : Infinity;
    const reverseMargin = rivals[1] ? rivals[0].score - rivals[1].score : Infinity;
    const clear3 = margin >= 15 && reverseMargin >= 15 && rivals[0] === best;
    if (best.strong && clear3 && !used.has(String(best.a.no))) {
      used.add(String(best.a.no));
      matches.set(o.id, best.a);
      how.set(o.id, best.exact ? "code" : "evidence");
      states.set(o.id, { state: "confirmed", how: how.get(o.id), evidence: best.reasons });
    } else states.set(o.id, { state: clear3 && !best.conflict ? "tentative" : "ambiguous", candidates: candidates.slice(0, 3).map((p) => ({ no: p.a.no, sn: p.a.sn ?? null, score: Math.round(p.score), evidence: p.reasons })) });
  }
  for (const o of rows) {
    const st = states.get(o.id) || { state: "unmatched", candidates: [] };
    if (manual.has(o.id)) st.manualProposal = manual.get(o.id);
    st.confidence = { confirmed: "SURE", tentative: "PROBABLE", ambiguous: "AMBIGUOUS", unmatched: "NO MATCH", excluded: "EXCLUDED" }[st.state] || "AMBIGUOUS";
    states.set(o.id, st);
  }
  return { matches, how, states, used };
}
__name(resolveOrders, "resolveOrders");

// ../sites/lib/marsad/site.js
var SYNC_MS = 6e4;
var FIRST_HOURS = 36;
var NOTES_PER_RUN = 30;
var OPEN_HOURS = 14;
var EXCLUDED = /* @__PURE__ */ new Set(["cancelled", "failed", "wallet-failed"]);
var PREP_MIN = 30;
var DELIVERY_MIN = 30;
var TRANSFER_MIN = 5;
var KINDS2 = ["sitePrep", "siteTransfer"];
function readNotes(notes) {
  const list = notes.map((n) => ({ at: Date.parse(String(n.date_created_gmt || n.date_created || "").replace(/Z?$/, "Z")), text: String(n.note || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() })).filter((n) => Number.isFinite(n.at)).sort((a, b) => a.at - b.at);
  const first = /* @__PURE__ */ __name((f) => list.find(f)?.at ?? null, "first"), last = /* @__PURE__ */ __name((f) => [...list].reverse().find(f), "last");
  const transferNote = last((n) => n.text.includes("\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0625\u0644\u0649")), outNote = last((n) => n.text.includes("\u062E\u0631\u062C \u0627\u0644\u0637\u0644\u0628 \u0644\u0644\u062A\u0648\u0635\u064A\u0644"));
  return {
    received: first((n) => n.text.includes("to \u062A\u0645 \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645") && !n.text.includes("\u0645\u0646 \u0627\u0644\u0641\u0631\u0639")),
    transfer: first((n) => n.text.includes("\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0625\u0644\u0649")),
    branch: transferNote?.text.match(/إلى (?:فرع )?(.*?) (?:من )?لوحة/)?.[1]?.trim() || null,
    out: first((n) => n.text.includes("\u062E\u0631\u062C \u0627\u0644\u0637\u0644\u0628 \u0644\u0644\u062A\u0648\u0635\u064A\u0644")),
    driver: outNote?.text.match(/مع (.*?)\. وقت/)?.[1]?.trim() || null,
    delivered: first((n) => /أكد المندوب تسليم|تم التوصيل/.test(n.text)),
    scheduled: list.some((n) => n.text.includes("\u0645\u0648\u0639\u062F \u0627\u0644\u062A\u0648\u0635\u064A\u0644")),
    // Sent to more than one branch (moved between branches): how many different branches it went to.
    transfers: new Set(list.filter((n) => n.text.includes("\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0625\u0644\u0649")).map((n) => n.text.match(/إلى (?:فرع )?(.*?) (?:من )?لوحة/)?.[1]?.trim() || n.text)).size
  };
}
__name(readNotes, "readNotes");
function setup18(app2) {
  const { db, fail: fail2 } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => v == null ? db.prepare("DELETE FROM settings WHERE key = ?").run(k) : db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const doFetch = app2.config.siteFetch || ((...a) => fetch(...a));
  let aesKey = null;
  const aes = /* @__PURE__ */ __name(() => aesKey ??= crypto.subtle.importKey("raw", sha256Bytes("site:" + app2.config.secret), "AES-GCM", false, ["encrypt", "decrypt"]), "aes");
  const seal = /* @__PURE__ */ __name(async (text) => {
    const iv = randomBytes(12);
    return b64(iv) + "." + b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(), new TextEncoder().encode(text))));
  }, "seal");
  const open = /* @__PURE__ */ __name(async (sealed) => {
    try {
      const [iv, data] = sealed.split(".").map(fromB64);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aes(), data));
    } catch {
      return null;
    }
  }, "open");
  async function creds() {
    const raw = await setting("site_wc");
    if (!raw) return null;
    try {
      const c = JSON.parse(await open(raw));
      return c?.key && c.secret ? c : null;
    } catch {
      return null;
    }
  }
  __name(creds, "creds");
  async function wc(c, path, params = {}) {
    const url = new URL(c.url.replace(/\/$/, "") + "/wp-json/wc/v3/" + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await doFetch(url.toString(), { headers: { authorization: "Basic " + btoa(c.key + ":" + c.secret), accept: "application/json", "user-agent": "MarsadEldahan/1.0" }, signal: AbortSignal.timeout(2e4) });
    const text = await r.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
    }
    if (!r.ok) throw Error("\u0627\u0644\u0645\u0648\u0642\u0639 \u0631\u062F " + r.status + (body?.message ? ": " + String(body.message).slice(0, 120) : ""));
    if (body == null) throw Error("\u0627\u0644\u0645\u0648\u0642\u0639 \u0631\u062F \u0628\u062D\u0627\u062C\u0629 \u0645\u0634 JSON (\u0645\u0645\u0643\u0646 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0642\u0627\u0641\u0644\u0629 \u0627\u0644\u0637\u0644\u0628)");
    return body;
  }
  __name(wc, "wc");
  let running = false;
  async function sync(now) {
    if (running) return { skipped: true };
    running = true;
    try {
      const c = await creds();
      if (!c) return { skipped: true };
      const last = Number(await setting("site_sync_at")) || now - FIRST_HOURS * 36e5;
      const pending = parseJson(await setting("site_sync_cursor"), null);
      const after = pending?.after || new Date(last - 5 * 6e4).toISOString().slice(0, 19);
      const until = pending?.until || new Date(now).toISOString().slice(0, 19);
      const startPage = pending?.page || 1;
      const changed = [];
      let nextPage = null;
      for (let page = startPage; page < startPage + 6; page++) {
        const list = await wc(c, "orders", { per_page: 50, page, modified_after: after, modified_before: until, dates_are_gmt: "true", orderby: "modified", order: "asc", _fields: "id,status,total,date_created_gmt,date_modified_gmt,meta_data,billing,shipping,line_items,customer_id" });
        if (!Array.isArray(list)) throw Error("\u0631\u062F \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0645\u0646 \u0627\u0644\u0645\u0648\u0642\u0639");
        changed.push(...list);
        nextPage = list.length < 50 ? null : page + 1;
        if (nextPage === null) break;
      }
      const upsert = [];
      for (const o of changed) {
        const ful = (o.meta_data || []).find((m) => m.key === "_eldahan_app_fulfillment")?.value || null;
        const created = Date.parse(String(o.date_created_gmt) + "Z");
        if (!Number.isFinite(created)) continue;
        const modified = Date.parse(String(o.date_modified_gmt).replace(/Z?$/, "Z")) || created;
        const saved = await db.prepare("SELECT modified_at FROM site_orders WHERE id = ?").get(o.id);
        if (saved?.modified_at > modified) continue;
        const b = o.billing || {}, sh = o.shipping || {};
        const name = [sh.first_name || b.first_name, sh.last_name || b.last_name].filter(Boolean).join(" ");
        const customer = customerOf({
          name,
          phone: b.phone,
          mobile: sh.phone,
          address: [sh.address_1 || b.address_1, sh.address_2 || b.address_2, sh.city || b.city].filter(Boolean).join(" ")
        });
        const items = Array.isArray(o.line_items) ? o.line_items.slice(0, 80).map((x) => ({
          name: String(x.name || "").slice(0, 160),
          qty: Number(x.quantity) || 0,
          price: (Number(x.total) || 0) + (Number(x.total_tax) || 0),
          // Add-ons/options the website stores on the line (hidden keys start with "_").
          modifiers: (Array.isArray(x.meta_data) ? x.meta_data : []).filter((m) => m && !String(m.key || "").startsWith("_") && ["string", "number"].includes(typeof (m.display_value ?? m.value))).slice(0, 20).map((m) => (String(m.display_key || m.key || "").slice(0, 60) + ": " + String(m.display_value ?? m.value).replace(/<[^>]*>/g, "").slice(0, 120)).trim())
        })) : [];
        const old = parseJson((await db.prepare("SELECT data FROM match_profiles WHERE source = 'site' AND ref = ?").get(String(o.id)))?.data, {});
        const money2 = /* @__PURE__ */ __name((v) => Number.isFinite(Number(v)) ? Number(v) : null, "money");
        const pay = {
          method: String(o.payment_method || "").slice(0, 60) || null,
          title: String(o.payment_method_title || "").slice(0, 120) || null,
          paid: !!o.date_paid || !!o.date_paid_gmt,
          discount: money2(o.discount_total),
          discountTax: money2(o.discount_tax),
          shipping: money2(o.shipping_total),
          total: money2(o.total),
          coupons: Array.isArray(o.coupon_lines) ? o.coupon_lines.slice(0, 10).map((c2) => ({ code: String(c2.code || "").slice(0, 60), amount: money2(c2.discount) })) : [],
          fees: Array.isArray(o.fee_lines) ? o.fee_lines.slice(0, 10).map((f) => ({ name: String(f.name || "").slice(0, 80), amount: money2(f.total) })) : [],
          note: String(o.customer_note || "").slice(0, 500) || null
        };
        const profile3 = { customer: { ...old.customer || {} }, items: Array.isArray(o.line_items) ? items : old.items || [], payment: "payment_method" in o || "discount_total" in o ? pay : old.payment || null };
        for (const [k, v] of Object.entries(customer)) if (v) profile3.customer[k] = v;
        upsert.push(db.prepare("INSERT INTO match_profiles (source, ref, data) SELECT 'site',?,? WHERE NOT EXISTS (SELECT 1 FROM site_orders WHERE id=? AND modified_at>?) ON CONFLICT(source, ref) DO UPDATE SET data = excluded.data").bind(String(o.id), JSON.stringify(profile3), o.id, modified));
        upsert.push(db.prepare("INSERT INTO site_orders (id, day, status, fulfillment, total, created_at, modified_at, notes_at) VALUES (?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET status = excluded.status, fulfillment = excluded.fulfillment, total = excluded.total, modified_at = excluded.modified_at, notes_at = CASE WHEN excluded.modified_at > IFNULL(site_orders.modified_at, 0) THEN NULL ELSE site_orders.notes_at END WHERE COALESCE(site_orders.modified_at,0) <= excluded.modified_at").bind(o.id, businessDay(created), String(o.status), ful ? String(ful) : null, Number(o.total) || null, created, Date.parse(String(o.date_modified_gmt) + "Z") || created));
      }
      if (upsert.length) await db.batch(upsert);
      const due = await db.prepare(`SELECT id FROM site_orders WHERE created_at >= ? AND status NOT IN ('cancelled','failed','wallet-failed') AND (notes_at IS NULL OR (delivered_at IS NULL AND notes_at < ?))
        ORDER BY notes_at IS NOT NULL, notes_at, created_at LIMIT ?`).all(now - OPEN_HOURS * 36e5, now - 5e4, NOTES_PER_RUN);
      for (const { id: id2 } of due) {
        const notes = await wc(c, "orders/" + id2 + "/notes", { per_page: 100, _fields: "date_created_gmt,note" });
        const x = readNotes(Array.isArray(notes) ? notes : []);
        await db.prepare("UPDATE site_orders SET received_at = ?, transfer_at = ?, branch = ?, out_at = ?, driver = ?, delivered_at = ?, scheduled = ?, transfers = ?, notes_at = ? WHERE id = ?").run(x.received, x.transfer, x.branch, x.out, x.driver, x.delivered, x.scheduled ? 1 : 0, x.transfers, now, id2);
      }
      if (nextPage !== null) await put("site_sync_cursor", JSON.stringify({ after, until, page: nextPage }));
      else {
        await db.batch([
          db.prepare("INSERT INTO settings (key, value) VALUES ('site_sync_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(Date.parse(until + "Z"))),
          db.prepare("INSERT INTO settings (key, value) VALUES ('site_sync_cursor', 'null') ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind()
        ]);
      }
      await put("site_error", null);
      await alerts(now);
      return { orders: changed.length, notes: due.length };
    } catch (e) {
      await put("site_error", String(e.message).slice(0, 300));
      await put("site_error_at", now);
      return { error: e.message };
    } finally {
      running = false;
    }
  }
  __name(sync, "sync");
  async function alerts(now) {
    const rows = await db.prepare(`SELECT * FROM site_orders WHERE created_at >= ? AND status NOT IN ('cancelled','failed','wallet-failed') AND delivered_at IS NULL AND scheduled = 0`).all(now - OPEN_HOURS * 36e5);
    const c = await db.prepare("SELECT rules FROM telegram_config WHERE id = 1").get();
    let r = {};
    try {
      r = JSON.parse(c?.rules || "{}");
    } catch {
    }
    const list = [], clock4 = /* @__PURE__ */ __name((ms) => new Date(ms).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }), "clock");
    const day = businessDay(now), det = app2.apexDetails ? await app2.apexDetails(day) : { extra: /* @__PURE__ */ __name(() => "", "extra") };
    let mt = /* @__PURE__ */ new Map();
    try {
      mt = (await apexMatch(day, rows, { teach: true })).matches;
    } catch {
    }
    const more = /* @__PURE__ */ __name((o) => {
      const a = mt.get(o.id);
      return (o.total ? "\n\u0642\u064A\u0645\u0629 \u0627\u0644\u0623\u0648\u0631\u062F\u0631: " + Math.round(o.total) + " \u062C" : "") + (a ? "\n\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0645\u0639 Apex \u0645\u0624\u0643\u062F\u0629" : "\n\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0645\u0639 Apex \u063A\u064A\u0631 \u0645\u0624\u0643\u062F\u0629") + (a ? det.extra(a.no) : "");
    }, "more");
    for (const o of rows) {
      if (o.received_at && !o.transfer_at && now - o.received_at > TRANSFER_MIN * 6e4)
        list.push({ key: "site:transfer:" + o.id, kind: "siteTransfer", target: "online", text: "\u{1F310} \u0627\u0644\u0645\u0648\u0642\u0639 | \u23F3 \u0623\u0648\u0631\u062F\u0631 \u0648\u0635\u0644 \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u0644\u0633\u0647 \u0645\u0627\u062A\u062D\u0648\u0651\u0644\u0634 \u0644\u0623\u064A \u0641\u0631\u0639\n\u0631\u0642\u0645 \u0623\u0648\u0631\u062F\u0631 \u0627\u0644\u0645\u0648\u0642\u0639: #" + o.id + "\n\u0648\u0635\u0644 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.received_at) + "\u060C \u0648\u0628\u0642\u0627\u0644\u0647 " + Math.round((now - o.received_at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629" + more(o) });
      if (o.fulfillment === "delivery" && o.transfer_at && !o.out_at && now - o.transfer_at > PREP_MIN * 6e4)
        list.push({ key: "site:prep:" + o.id, kind: "sitePrep", target: "branches", branch: o.branch || null, text: "\u{1F310} \u0627\u0644\u0645\u0648\u0642\u0639 | \u{1F7E0} \u0623\u0648\u0631\u062F\u0631 \u0639\u062F\u0651\u0649 30 \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0648\u0644\u0633\u0647 \u0645\u0627\u062E\u0631\u062C\u0634 \u0644\u0644\u062A\u0648\u0635\u064A\u0644\n\u0627\u0644\u0641\u0631\u0639: " + (o.branch || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641") + "\n\u0631\u0642\u0645 \u0623\u0648\u0631\u062F\u0631 \u0627\u0644\u0645\u0648\u0642\u0639: #" + o.id + "\n\u0627\u062A\u062D\u0648\u0651\u0644 \u0644\u0644\u0641\u0631\u0639 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.transfer_at) + "\u060C \u0648\u0628\u0642\u0627\u0644\u0647 " + Math.round((now - o.transfer_at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629" + more(o) });
    }
    const waiting = await db.prepare("SELECT l.key, l.kind, l.target, l.branch FROM telegram_log l WHERE (l.key LIKE 'site:transfer:%' OR l.key LIKE 'site:prep:%') AND l.created_at >= ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key)").all(now - 12 * 36e5);
    for (const w of waiting) {
      const o = await db.prepare("SELECT * FROM site_orders WHERE id = ?").get(Number(w.key.split(":")[2]));
      if (!o) continue;
      const mins2 = /* @__PURE__ */ __name((a, b) => Math.round((b - a) / 6e4), "mins");
      let text = null;
      if (EXCLUDED.has(o.status)) text = "\u{1F310} \u0627\u0644\u0645\u0648\u0642\u0639 | \u{1F504} \u0623\u0648\u0631\u062F\u0631 \u0627\u0644\u0645\u0648\u0642\u0639 #" + o.id + " \u0627\u062A\u0644\u063A\u0649 \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639";
      else if (w.kind === "siteTransfer" && o.transfer_at) text = "\u{1F310} \u0627\u0644\u0645\u0648\u0642\u0639 | \u2705 \u0623\u0648\u0631\u062F\u0631 \u0627\u0644\u0645\u0648\u0642\u0639 #" + o.id + " \u0627\u062A\u062D\u0648\u0651\u0644 \u0644\u0640 " + (o.branch || "\u0627\u0644\u0641\u0631\u0639") + " \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.transfer_at) + (o.received_at ? " (\u0628\u0639\u062F " + mins2(o.received_at, o.transfer_at) + " \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645)" : "");
      else if (w.kind === "sitePrep" && o.out_at) text = "\u{1F310} \u0627\u0644\u0645\u0648\u0642\u0639 | \u2705 \u0623\u0648\u0631\u062F\u0631 \u0627\u0644\u0645\u0648\u0642\u0639 #" + o.id + " \u062E\u0631\u062C \u0644\u0644\u062A\u0648\u0635\u064A\u0644 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.out_at) + (o.transfer_at ? " (\u0628\u0639\u062F " + mins2(o.transfer_at, o.out_at) + " \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0627\u0644\u062A\u062D\u0648\u064A\u0644)" : "") + (o.driver ? " \xB7 " + o.driver : "");
      else if (w.kind === "sitePrep" && o.delivered_at) text = "\u{1F310} \u0627\u0644\u0645\u0648\u0642\u0639 | \u26A0\uFE0F \u0623\u0648\u0631\u062F\u0631 \u0627\u0644\u0645\u0648\u0642\u0639 #" + o.id + " \u0627\u062A\u0642\u0641\u0644 \xAB\u062A\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644\xBB \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.delivered_at) + " \u0645\u0646 \u063A\u064A\u0631 \xAB\u062E\u0631\u0648\u062C \u0644\u0644\u062A\u0648\u0635\u064A\u0644\xBB \u2014 \u0645\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629";
      if (text) list.push({ key: "resolved:" + w.key, kind: w.kind, target: w.target, branch: w.branch, replyTo: w.key, text });
    }
    if (list.length) await db.batch(list.map((a) => db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch, reply_to) VALUES (?,?,?,?,?,?,?,?,?)").bind(a.key, a.kind, null, a.text, now, r[a.kind] === false && !a.replyTo ? now : null, a.target, a.branch || null, a.replyTo || null)));
  }
  __name(alerts, "alerts");
  let lastRun = 0;
  app2.afterRequest(async (now) => {
    if (now - lastRun < SYNC_MS) return;
    lastRun = now;
    await sync(now);
  });
  app2.route("GET", "/api/site", async (ctx) => {
    await app2.requireAdmin(ctx);
    const c = await creds();
    return {
      linked: !!c,
      url: c?.url || "https://eldahan.com.eg",
      keyEnd: c ? c.key.slice(-4) : null,
      lastSync: iso(Number(await setting("site_sync_at")) || null),
      error: await setting("site_error"),
      errorAt: iso(Number(await setting("site_error_at")) || null),
      serverNow: iso(ctx.now)
    };
  });
  app2.route("POST", "/api/site", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const b = ctx.body;
    if (b.action === "key") {
      const key2 = String(b.key || "").trim(), secret = String(b.secret || "").trim(), url = String(b.url || "https://eldahan.com.eg").trim();
      if (!/^ck_[a-f0-9]{20,64}$/.test(key2) || !/^cs_[a-f0-9]{20,64}$/.test(secret)) fail2(400, "\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0644\u0627\u0632\u0645 \u064A\u0628\u062F\u0623 \u0628\u0640 ck_ \u0648\u0627\u0644\u0633\u0631 \u0628\u0640 cs_");
      if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) fail2(400, "invalid_url");
      const c = { url, key: key2, secret };
      try {
        await wc(c, "orders", { per_page: 1, _fields: "id" });
      } catch (e) {
        fail2(400, "\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0645\u0634 \u0634\u063A\u0627\u0644: " + e.message);
      }
      await put("site_wc", await seal(JSON.stringify(c)));
      await put("site_sync_at", null);
      await put("site_error", null);
      await app2.audit("site_key_set", null, { actor: who.name, keyEnd: key2.slice(-4) });
      return { ok: true, sync: await sync(ctx.now) };
    }
    if (b.action === "sync") return { ok: true, sync: await sync(ctx.now) };
    if (b.action === "unlink") {
      await put("site_wc", null);
      await app2.audit("site_key_removed", null, { actor: who.name });
      return { ok: true };
    }
    fail2(400, "invalid_action");
  });
  const norm4 = /* @__PURE__ */ __name((x) => String(x || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/^(فرع|الدهان)\s*/g, "").trim(), "norm");
  const sameBranch2 = /* @__PURE__ */ __name((a, b) => {
    const x = norm4(a), y = norm4(b);
    if (!x || !y) return null;
    const fx = x.split(/[\s،,-]+/)[0], fy = y.split(/[\s،,-]+/)[0];
    return x.includes(fy) || y.includes(fx);
  }, "sameBranch");
  async function apexMatch(day, rows, { teach = false } = {}) {
    const r = await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day);
    let d = null;
    try {
      d = r ? JSON.parse(r.data) : null;
    } catch {
    }
    const apex = (d?.online || []).filter((a) => a.kind === "\u0627\u0644\u0645\u0648\u0642\u0639" && a.at).map((a) => ({ ...a, t: Date.parse(a.at) }));
    const names = app2.apexNameMap ? await app2.apexNameMap() : {};
    const profiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'site' AND ref IN (SELECT CAST(id AS TEXT) FROM site_orders WHERE day = ?)").all(day)).map((x) => [x.ref, parseJson(x.data, {})]));
    const manual = new Map((await db.prepare("SELECT site_id, apex_no FROM site_links WHERE day = ?").all(day)).map((x) => [x.site_id, x.apex_no]));
    const learned = app2.learn ? await app2.learn.pairs("match-v2:branch:site") : /* @__PURE__ */ new Map();
    const branchOk = /* @__PURE__ */ __name((s, b) => {
      const k = learned.get(s);
      return k && [...k.values()].reduce((x, y) => x + y, 0) >= 3 ? k.has(b) : sameBranch2(s, b);
    }, "branchOk");
    const decision = resolveOrders(rows.map((o) => ({
      ...o,
      source: "site",
      anchor: o.transfer_at || o.received_at || o.created_at,
      amount: o.total,
      ...profiles.get(String(o.id)),
      excluded: EXCLUDED.has(o.status)
    })), apex, { manual, branchOk, windowFor: /* @__PURE__ */ __name(() => 90 * 6e4, "windowFor") });
    const matches = /* @__PURE__ */ new Map();
    for (const [id2, a] of decision.matches) {
      const how = decision.how.get(id2), o = rows.find((o2) => o2.id === id2);
      matches.set(id2, { no: a.no, sn: a.sn ?? null, at: iso(a.t), user: names[a.user] || a.user || null, amount: a.amount ?? null, branch: a.branch || null, how });
    }
    if (teach && app2.learn) for (const o of rows) {
      const a = decision.matches.get(o.id), h = decision.how.get(o.id);
      const facts = a && h === "code" && o.branch && a.branch ? [{ kind: "match-v2:branch:site", a: o.branch, b: a.branch, value: null }] : [];
      await app2.learn.replace("site", String(o.id), facts);
    }
    return { matches, states: decision.states, apexCount: apex.length, unmatched: apex.filter((a) => !decision.used.has(String(a.no))).map((a) => ({ no: a.no, sn: a.sn ?? null, at: iso(a.t), branch: a.branch, user: names[a.user] || a.user, amount: a.amount })), hasList: Array.isArray(d?.online) };
  }
  __name(apexMatch, "apexMatch");
  app2.site = { apexMatch };
  app2.route("POST", "/api/site/link", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write"), id2 = Number(ctx.body.siteId);
    const no = ctx.body.apexNo == null || ctx.body.apexNo === "" ? null : String(ctx.body.apexNo);
    const o = await db.prepare("SELECT day FROM site_orders WHERE id = ?").get(id2);
    if (!o) fail2(404, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0634 \u0645\u0648\u062C\u0648\u062F");
    if (no != null && no !== "none") {
      const snap = parseJson((await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(o.day))?.data, {});
      if (!(snap.online || []).some((a) => String(a.no) === no && a.kind === "\u0627\u0644\u0645\u0648\u0642\u0639")) fail2(400, "\u0623\u0648\u0631\u062F\u0631 Apex \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0646\u0641\u0633 \u0627\u0644\u064A\u0648\u0645 \u0648\u0627\u0644\u0645\u0635\u062F\u0631");
      if (await db.prepare("SELECT site_id FROM site_links WHERE day = ? AND apex_no = ? AND site_id != ?").get(o.day, no, id2)) fail2(409, "\u0623\u0648\u0631\u062F\u0631 Apex \u0645\u0631\u0628\u0648\u0637 \u064A\u062F\u0648\u064A\u064B\u0627 \u0628\u0623\u0648\u0631\u062F\u0631 \u0622\u062E\u0631");
    }
    const before = await db.prepare("SELECT apex_no, set_by, set_at FROM site_links WHERE site_id = ?").get(id2);
    if (no === null) await db.prepare("DELETE FROM site_links WHERE site_id = ?").run(id2);
    else await db.prepare("INSERT INTO site_links (site_id, day, apex_no, set_by, set_at) VALUES (?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET apex_no = excluded.apex_no, set_by = excluded.set_by, set_at = excluded.set_at").run(id2, o.day, no === "none" ? null : no, who.name, ctx.now);
    await apexMatch(o.day, await db.prepare("SELECT * FROM site_orders WHERE day = ?").all(o.day), { teach: true });
    await app2.audit("site_link", null, { actor: who.name, siteId: id2, apexNo: no, before: before || null, after: no, reason: String(ctx.body.reason || "").slice(0, 500) || null });
    return { ok: true };
  });
  app2.route("GET", "/api/site/day", async (ctx) => {
    await app2.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || "")) ? ctx.query.day : businessDay(ctx.now);
    const rows = await db.prepare("SELECT * FROM site_orders WHERE day = ? ORDER BY id").all(day);
    const m = await apexMatch(day, rows);
    return {
      day,
      apex: { linked: m.hasList, count: m.apexCount, unmatched: m.unmatched || [] },
      linked: !!await creds(),
      lastSync: iso(Number(await setting("site_sync_at")) || null),
      error: await setting("site_error"),
      live: day === businessDay(ctx.now),
      orders: rows.map((o) => ({
        id: o.id,
        status: o.status,
        fulfillment: o.fulfillment,
        excluded: EXCLUDED.has(o.status),
        scheduled: !!o.scheduled,
        branch: o.branch,
        driver: o.driver,
        total: o.total,
        transfers: o.transfers || 0,
        apex: m.matches.get(o.id) || null,
        matching: m.states?.get(o.id) || null,
        createdAt: iso(o.created_at),
        receivedAt: iso(o.received_at),
        transferAt: iso(o.transfer_at),
        outAt: iso(o.out_at),
        deliveredAt: iso(o.delivered_at),
        notesRead: !!o.notes_at
      })),
      rules: { prep: PREP_MIN, delivery: DELIVERY_MIN, transfer: TRANSFER_MIN },
      serverNow: iso(ctx.now)
    };
  });
  app2.siteSync = sync;
}
__name(setup18, "setup");

// ../sites/lib/marsad/talabat.js
var talabat_exports = {};
__export(talabat_exports, {
  sameBranch: () => sameBranch,
  setup: () => setup19
});

// ../sites/lib/marsad/store-names.js
var CANON = [
  [/madinaty|مدينتي/i, "\u0627\u0644\u062F\u0647\u0627\u0646, \u0645\u062F\u064A\u0646\u062A\u064A - \u0633\u0627\u0648\u062B \u0628\u0627\u0631\u0643"],
  [/makram|city\s*stars?|مكرم|سيتي ستار/i, "\u0627\u0644\u062F\u0647\u0627\u0646 \u0633\u064A\u062A\u064A \u0633\u062A\u0627\u0631 \u0645\u0648\u0644\u060C \u0645\u0643\u0631\u0645 \u0639\u0628\u064A\u062F"],
  [/tagam+o?a|banafs|التجمع|البنفسج/i, "\u0627\u0644\u062F\u0647\u0627\u0646\u060C \u0627\u0644\u062A\u062C\u0645\u0639 \u0627\u0644\u062E\u0627\u0645\u0633 - \u0627\u0644\u0628\u0646\u0641\u0633\u062C 9,10,11,12"]
];
var canonicalStore = /* @__PURE__ */ __name((s) => {
  if (!s) return null;
  const t = String(s).trim();
  if (/شاشة مراقبة|مرصد الدهان/.test(t)) return null;
  if (/الدهان|dahan/i.test(t)) {
    for (const [re, name] of CANON) if (re.test(t)) return name;
  }
  return t.slice(0, 160);
}, "canonicalStore");

// ../sites/lib/marsad/talabat.js
var PRODUCT_NAME = new Map(TALABAT_PRODUCTS.map((p) => [p[0], p[1]]));
var storeSpelling = canonicalStore;
var NOT_ENTERED_MIN = 10;
var STALE_MS2 = 5 * 6e4;
var WINDOW_MIN = 45;
var cancelReady = /* @__PURE__ */ __name((o) => o.status === "CANCELLED" && !!o.cancelled_at && !!o.store && !!o.cancel_owner?.trim() && !!o.cancel_reason?.trim(), "cancelReady");
var statusRank = /* @__PURE__ */ __name((s) => ({ NEW: 0, "PREORDER ACCEPTED": 1, ACCEPTED: 1, READY: 2, "READY FOR PICKUP": 2, "PICKED UP": 3, "IN DELIVERY": 3, COMPLETED: 4, DELIVERED: 4, CANCELLED: 5, REJECTED: 5 })[s], "statusRank");
var FINAL = /* @__PURE__ */ new Set(["COMPLETED", "CANCELLED", "REJECTED", "DELIVERED"]);
var KNOWN_STATUS = /* @__PURE__ */ new Set([...FINAL, "NEW", "ACCEPTED", "READY", "READY FOR PICKUP", "PICKED UP", "IN DELIVERY", "PREORDER ACCEPTED"]);
var KNOWN_STEP = /* @__PURE__ */ new Set(["DISPLAYED_AT_VENDOR", "ACCEPTED", "PICKED_UP", "DELIVERED", "COMPLETED", "CANCELLED", "REJECTED"]);
var KNOWN_OWNER = /* @__PURE__ */ new Set(["Customer", "Vendor", "Platform", "Transport", "Rider"]);
var norm2 = /* @__PURE__ */ __name((x) => String(x || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/^\s*(فرع|الدهان)[\s,،]*/g, "").trim(), "norm");
var STORE_AREA = [[/سيتي ستار|مكرم عبيد|makram|city ?stars|nasr|نصر/i, "\u0646\u0635\u0631"], [/مدينتي|madinaty|ساوث بارك/i, "\u0645\u062F\u064A\u0646\u062A\u064A"], [/التجمع|البنفسج|tagamo|banafseg|الخامس/i, "\u0627\u0644\u062A\u062C\u0645\u0639"]];
var area = /* @__PURE__ */ __name((s) => STORE_AREA.find(([re]) => re.test(String(s || "")))?.[1] || null, "area");
var BRANCH_NAME = { "\u0646\u0635\u0631": "\u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631", "\u0645\u062F\u064A\u0646\u062A\u064A": "\u0645\u062F\u064A\u0646\u062A\u064A", "\u0627\u0644\u062A\u062C\u0645\u0639": "\u0627\u0644\u062A\u062C\u0645\u0639" };
var storeName = /* @__PURE__ */ __name((s) => BRANCH_NAME[area(s)] || s || null, "storeName");
function sameBranch(a, b) {
  const ka = area(a), kb = area(b);
  if (ka && kb) return ka === kb;
  const x = norm2(a), y = norm2(b);
  if (!x || !y) return null;
  const words = /* @__PURE__ */ __name((s) => s.split(/[\s،,\-]+/).filter((w) => w.length > 2), "words");
  return words(x).some((w) => y.includes(w)) || words(y).some((w) => x.includes(w));
}
__name(sameBranch, "sameBranch");
function setup19(app2) {
  const { db, fail: fail2 } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const ms = /* @__PURE__ */ __name((v) => {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }, "ms");
  app2.route("GET", "/api/talabat/token", async (ctx) => {
    await app2.requireAdmin(ctx);
    const last = Number(await setting("talabat_last_push")) || null;
    const screens = Object.entries(parseJson(await setting("talabat_screens"), {})).map(([id2, x]) => ({ id: id2, ...x, at: iso(x.at), ageSeconds: Math.round((ctx.now - x.at) / 1e3) }));
    return { linked: !!await setting("talabat_token_hash"), lastPush: iso(last), ageSeconds: last ? Math.round((ctx.now - last) / 1e3) : null, screens };
  });
  app2.route("POST", "/api/talabat/token", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const token = "tal_" + randomToken(24);
    if (ctx.body?.extra === true) {
      const list = parseJson(await setting("talabat_token_extra"), []);
      await put("talabat_token_extra", JSON.stringify([sha256(token), ...list].slice(0, 10)));
    } else await put("talabat_token_hash", sha256(token));
    await app2.audit("talabat_token_created", null, { actor: who.name, extra: ctx.body?.extra === true });
    return { token, extra: ctx.body?.extra === true };
  });
  app2.route("POST", "/api/talabat/push", async (ctx) => {
    const hash = await setting("talabat_token_hash"), given = ctx.header("x-talabat-token"), extras = parseJson(await setting("talabat_token_extra"), []);
    const main = !!hash && !!given && sha256(given) === hash;
    const device = !given && app2.config.deviceTokens.includes(ctx.header("x-device-token") || "");
    if (!device && (!given || !main && !extras.includes(sha256(given)))) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0634\u0627\u0634\u0629 \u0637\u0644\u0628\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const now = ctx.now, list = (Array.isArray(ctx.body?.orders) ? ctx.body.orders : []).slice(0, 800), writes = [];
    const sc = ctx.body?.screen;
    if (sc && /^[a-z0-9]{4,12}$/.test(String(sc.id || ""))) {
      const all = parseJson(await setting("talabat_screens"), {});
      all[sc.id] = {
        at: now,
        version: String(sc.version || "").slice(0, 12),
        kind: ["main", "extra", "device"].includes(sc.kind) ? sc.kind : null,
        live: Number(sc.live) || 0,
        readAt: sc.readAt ? String(sc.readAt).slice(0, 30) : all[sc.id]?.readAt ?? null,
        readCode: sc.readCode ? String(sc.readCode).replace(/\D/g, "").slice(0, 10) : all[sc.id]?.readCode ?? null,
        readOk: sc.readAt ? sc.readOk === true : all[sc.id]?.readOk ?? null,
        readFail: sc.readAt ? sc.readFail ? String(sc.readFail).slice(0, 80) : null : all[sc.id]?.readFail ?? null
      };
      const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 20);
      await put("talabat_screens", JSON.stringify(Object.fromEntries(keep)));
    }
    if (Array.isArray(ctx.body?.availability) && app2.talabatAvailability) await app2.talabatAvailability(ctx.body.availability, now);
    if (Array.isArray(ctx.body?.codes)) {
      const seenNow = parseJson(await setting("talabat_live_now"), {});
      for (const c of ctx.body.codes.slice(0, 200)) {
        const id2 = String(c?.id || "").replace(/\D/g, "").slice(0, 20);
        if (id2.length >= 6) seenNow[id2] = now;
      }
      seenNow._screen = now;
      for (const [k, v] of Object.entries(seenNow)) if (now - v > 30 * 6e4) delete seenNow[k];
      await put("talabat_live_now", JSON.stringify(seenNow));
    }
    for (const c of (Array.isArray(ctx.body?.codes) ? ctx.body.codes : []).slice(0, 200)) {
      const id2 = String(c.id || "").replace(/\D/g, "").slice(0, 20), code = String(c.code || "").replace(/\D/g, "").slice(0, 10);
      if (id2.length < 6 || !code) continue;
      writes.push(db.prepare("INSERT INTO talabat_orders (id, day, code, store, first_seen, updated_at, received_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, store = COALESCE(talabat_orders.store, excluded.store), received_at = CASE WHEN talabat_orders.received_at IS NULL AND talabat_orders.placed_at IS NULL THEN excluded.received_at ELSE talabat_orders.received_at END").bind(id2, businessDay(now), code, storeSpelling(c.store), now, now, now));
      if (c.pay) {
        const prof = parseJson((await db.prepare("SELECT data FROM match_profiles WHERE source = 'talabat' AND ref = ?").get(id2))?.data, {});
        if (prof.livePay !== String(c.pay).slice(0, 40)) writes.push(db.prepare("INSERT INTO match_profiles (source, ref, data) VALUES ('talabat',?,?) ON CONFLICT(source, ref) DO UPDATE SET data = json_set(match_profiles.data, '$.livePay', json_extract(excluded.data, '$.livePay'))").bind(id2, JSON.stringify({ ...prof, livePay: String(c.pay).slice(0, 40) })));
      }
    }
    const unknown = [];
    for (const o of list) {
      if (!o || typeof o !== "object") continue;
      const st = String(o.status || "").toUpperCase();
      if (st && !KNOWN_STATUS.has(st)) unknown.push(["talabat", "\u062D\u0627\u0644\u0629: " + st, o.id]);
      for (const k of Object.keys(o.detail?.milestones || {})) if (!KNOWN_STEP.has(k)) unknown.push(["talabat", "\u062E\u0637\u0648\u0629: " + k, o.id]);
      if (o.detail?.cancelOwner && !KNOWN_OWNER.has(o.detail.cancelOwner)) unknown.push(["talabat", "\u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0639\u0644\u0649: " + o.detail.cancelOwner, o.id]);
    }
    for (const u of unknown.slice(0, 20)) await app2.learn?.unknown(...u, now);
    const accepted = [], priorRows = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set();
    const ids = [...new Set(list.filter((o) => o && typeof o === "object").map((o) => String(o.id || "").replace(/\D/g, "").slice(0, 20)).filter((id2) => id2.length >= 6))];
    const priorSql = `SELECT t.id,t.status,i.observed_at,p.data AS profile FROM talabat_orders t
      LEFT JOIN order_ingest i ON i.source='talabat' AND i.ref=t.id
      LEFT JOIN match_profiles p ON p.source='talabat' AND p.ref=t.id WHERE t.id IN `;
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = ids.slice(offset, offset + 50);
      for (const row of await db.prepare(priorSql + "(" + chunk.map(() => "?").join(",") + ")").all(...chunk)) priorRows.set(row.id, row);
    }
    let pendingWrites = [], pendingOrders = [];
    const flushOrders = /* @__PURE__ */ __name(async () => {
      if (!pendingWrites.length) return;
      const committed = await db.batch(pendingWrites);
      for (const item of pendingOrders) if (committed[item.orderIndex].changes) accepted.push(item.order);
      pendingWrites = [];
      pendingOrders = [];
    }, "flushOrders");
    for (const o of list) {
      if (!o || typeof o !== "object") continue;
      const id2 = String(o.id || "").replace(/\D/g, "").slice(0, 20);
      if (id2.length < 6) continue;
      if (seen.has(id2)) {
        await flushOrders();
        priorRows.set(id2, await db.prepare(priorSql + "(?)").get(id2));
      }
      seen.add(id2);
      const prior = priorRows.get(id2), meta = prior;
      const observed = ms(o.observedAt);
      if (o.observedAt && (!observed || observed > now + 3e5)) continue;
      if (meta?.observed_at && (!observed || observed < meta.observed_at)) continue;
      const incoming = String(o.status || "").toUpperCase();
      if (prior?.status && incoming && statusRank(incoming) != null && statusRank(prior.status) != null && statusRank(incoming) < statusRank(prior.status)) continue;
      if (FINAL.has(prior?.status) && incoming && incoming !== prior.status) continue;
      const guard = "NOT EXISTS (SELECT 1 FROM order_ingest WHERE source = 'talabat' AND ref = ? AND COALESCE(observed_at, 0) > ?)";
      const orderWrites = [];
      const guardTime = observed || meta?.observed_at || 0;
      const placed = ms(o.placedAt) || ms(o.receivedAt) || ms(o.listAt), d = o.detail || null;
      const customer = customerOf({ ...o.customer || {}, ...d?.customer || {}, phone: d?.customer?.phone || o.customer?.phone || o.phone || "" });
      const bill = Array.isArray(d?.bill) ? d.bill.slice(0, 20).map((x) => ({ k: String(x?.k || "").slice(0, 60), text: String(x?.text || "").slice(0, 200) })).filter((x) => x.text) : null;
      if (Object.values(customer).some(Boolean) || bill?.length) {
        const old = parseJson(prior?.profile, {});
        for (const [k, v] of Object.entries(customer)) if (v) old[k] = v;
        if (bill?.length) old.bill = bill;
        orderWrites.push(db.prepare("INSERT INTO match_profiles (source, ref, data) SELECT 'talabat',?,? WHERE " + guard + " ON CONFLICT(source, ref) DO UPDATE SET data = excluded.data").bind(id2, JSON.stringify(old), id2, guardTime));
      }
      const items = d && Array.isArray(d.items) ? JSON.stringify(d.items.slice(0, 60).map((x) => ({
        qty: Number(x.qty) || 1,
        name: String(PRODUCT_NAME.get(String(x.productId || "")) || x.name || "").slice(0, 120),
        ...x.productId ? { productId: String(x.productId).slice(0, 20), nameShown: String(x.name || "").slice(0, 120) } : {},
        price: Number(x.price) || null,
        modifiers: Array.isArray(x.modifiers) ? [...new Set(x.modifiers.map((v) => String(v || "").trim().slice(0, 120)).filter(Boolean))].slice(0, 20) : [],
        modifierRead: x.modifierRead === true,
        modifierComplete: x.modifierComplete === true,
        options: Array.isArray(x.options) ? x.options.slice(0, 20).map((v) => ({ qty: Number(v?.qty) > 0 ? Number(v.qty) : null, name: String(v?.name || "").slice(0, 120), price: Number(v?.price) || null, ...v?.productId ? { productId: String(v.productId).slice(0, 20) } : {} })).filter((v) => v.name) : [],
        discountLines: Array.isArray(x.discountLines) ? x.discountLines.slice(0, 6).map((v) => String(v || "").trim().slice(0, 160)).filter(Boolean) : []
      }))) : null;
      orderWrites.push(db.prepare(`INSERT INTO talabat_orders (id, day, vendor_id, store, status, billable, placed_at, total, received_at, accept_seconds, accepted_at, picked_up_at, delivered_at,
          cancelled_at, cancel_owner, cancel_reason, items, subtotal, delivery_type, milestones, detail_at, first_seen, updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
        ON CONFLICT(id) DO UPDATE SET day = CASE WHEN excluded.placed_at IS NOT NULL THEN excluded.day ELSE talabat_orders.day END, vendor_id = COALESCE(excluded.vendor_id, talabat_orders.vendor_id), store = COALESCE(excluded.store, talabat_orders.store),
          status = COALESCE(excluded.status, talabat_orders.status), billable = COALESCE(excluded.billable, talabat_orders.billable), placed_at = CASE WHEN excluded.placed_at IS NOT NULL AND (talabat_orders.placed_at IS NULL OR talabat_orders.placed_at % 60000 = 0) THEN excluded.placed_at ELSE talabat_orders.placed_at END,
          total = COALESCE(excluded.total, talabat_orders.total), received_at = COALESCE(excluded.received_at, talabat_orders.received_at),
          accept_seconds = COALESCE(excluded.accept_seconds, talabat_orders.accept_seconds), accepted_at = COALESCE(excluded.accepted_at, talabat_orders.accepted_at),
          picked_up_at = COALESCE(excluded.picked_up_at, talabat_orders.picked_up_at), delivered_at = COALESCE(excluded.delivered_at, talabat_orders.delivered_at),
          cancelled_at = COALESCE(excluded.cancelled_at, talabat_orders.cancelled_at), cancel_owner = COALESCE(excluded.cancel_owner, talabat_orders.cancel_owner),
          cancel_reason = COALESCE(excluded.cancel_reason, talabat_orders.cancel_reason), items = COALESCE(excluded.items, talabat_orders.items), milestones = COALESCE(excluded.milestones, talabat_orders.milestones),
          subtotal = COALESCE(excluded.subtotal, talabat_orders.subtotal), delivery_type = COALESCE(excluded.delivery_type, talabat_orders.delivery_type),
          detail_at = CASE WHEN excluded.detail_at IS NOT NULL THEN excluded.detail_at WHEN excluded.status IS NOT talabat_orders.status THEN NULL ELSE talabat_orders.detail_at END,
          updated_at = excluded.updated_at`).bind(
        id2,
        businessDay(placed || now),
        o.vendorId ? String(o.vendorId).slice(0, 20) : null,
        storeSpelling(o.store),
        String(o.status || "").toUpperCase().slice(0, 40) || null,
        d?.billable ? String(d.billable).slice(0, 40) : null,
        placed,
        Number(o.total) || null,
        ms(d?.receivedAt),
        Number.isFinite(d?.acceptSeconds) ? d.acceptSeconds : null,
        ms(d?.acceptedAt),
        ms(d?.pickedUpAt),
        ms(d?.deliveredAt),
        ms(d?.cancelledAt),
        d?.cancelOwner ? String(d.cancelOwner).slice(0, 60) : null,
        d?.cancelReason ? String(d.cancelReason).slice(0, 300) : null,
        items,
        Number(d?.subtotal) || null,
        d?.deliveryType ? String(d.deliveryType).slice(0, 60) : null,
        d?.milestones ? JSON.stringify(d.milestones).slice(0, 2e3) : null,
        d ? now : null,
        now,
        now,
        id2,
        guardTime
      ));
      orderWrites.push(db.prepare("INSERT INTO order_ingest (source, ref, observed_at, updated_at) VALUES ('talabat',?,?,?) ON CONFLICT(source, ref) DO UPDATE SET observed_at = MAX(COALESCE(order_ingest.observed_at,0),COALESCE(excluded.observed_at,0)), updated_at = excluded.updated_at").bind(id2, observed, now));
      pendingOrders.push({ order: o, orderIndex: pendingWrites.length + orderWrites.length - 2 });
      pendingWrites.push(...orderWrites);
      if (pendingOrders.length >= 25) await flushOrders();
    }
    await flushOrders();
    if (writes.length) await db.batch(writes);
    if (writes.length || accepted.length) {
      matchRevision++;
      matchCache.clear();
    }
    await put("talabat_last_push", now);
    const cancellationPending = "t.status = 'CANCELLED' AND (t.cancelled_at IS NULL OR NULLIF(TRIM(t.store),'') IS NULL OR NULLIF(TRIM(t.cancel_owner),'') IS NULL OR NULLIF(TRIM(t.cancel_reason),'') IS NULL)";
    const want = await db.prepare(`SELECT t.id FROM talabat_orders t LEFT JOIN order_ingest i ON i.source = 'talabat' AND i.ref = t.id
      WHERE t.updated_at >= ? AND (((${cancellationPending}) AND COALESCE(i.detail_attempts,0) < 5 AND COALESCE(i.detail_retry_at,0) <= ?)
      OR (t.status IS NOT 'CANCELLED' AND (t.detail_at IS NULL OR (t.status NOT IN ('COMPLETED','REJECTED','DELIVERED','PICKED UP') AND t.detail_at < ?))))
      ORDER BY t.status = 'CANCELLED' DESC, t.detail_at IS NOT NULL, t.placed_at DESC LIMIT 4`).all(now - 12 * 36e5, now, now - 6e4);
    if (want.length) await db.batch(want.map(({ id: id2 }) => db.prepare(`INSERT INTO order_ingest (source,ref,detail_attempts,detail_retry_at,updated_at)
      SELECT 'talabat',id,1,?,? FROM talabat_orders WHERE id=? AND status='CANCELLED'
      ON CONFLICT(source,ref) DO UPDATE SET detail_attempts=order_ingest.detail_attempts+1, detail_retry_at=excluded.detail_retry_at, updated_at=excluded.updated_at`).bind(now + 6e4, now, id2)));
    const alertWork = maybeAlerts(now, accepted.some((o) => String(o.status || "").toUpperCase() === "CANCELLED"));
    if (db.kind === "d1") ctx.waitUntil(alertWork.catch((error3) => console.error("Talabat alert pass failed", error3?.message)));
    else await alertWork;
    await app2.whatsapp?.take(accepted, now);
    return { ok: true, want: want.map((r) => r.id), phones: main && !!await app2.whatsapp?.wantPhones(), serverNow: iso(now) };
  }, { limit: 1024 * 1024 });
  const matchCache = /* @__PURE__ */ new Map(), matchFlights = /* @__PURE__ */ new Map();
  let matchRevision = 0;
  async function matchDay(day, options = {}) {
    const teach = !!options.teach, cached = matchCache.get(day);
    if (!teach && cached && Date.now() - cached.at < 8e3) return cached.value;
    const running = db.kind === "d1" ? null : matchFlights.get(day);
    if (running) {
      await running;
      if (!teach) return matchDay(day, options);
    }
    const revision = matchRevision;
    const flight = computeMatchDay(day, { teach });
    if (db.kind !== "d1") matchFlights.set(day, flight);
    try {
      const value = await flight;
      if (revision === matchRevision) matchCache.set(day, { at: Date.now(), value });
      while (matchCache.size > 4) matchCache.delete(matchCache.keys().next().value);
      return value;
    } finally {
      if (matchFlights.get(day) === flight) matchFlights.delete(day);
    }
  }
  __name(matchDay, "matchDay");
  async function computeMatchDay(day, { teach = false } = {}) {
    const rows = await db.prepare("SELECT * FROM talabat_orders WHERE day = ? AND (placed_at IS NOT NULL OR received_at IS NOT NULL) ORDER BY placed_at").all(day);
    const r = await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day);
    let d = null;
    try {
      d = r ? JSON.parse(r.data) : null;
    } catch {
    }
    const apex = [...(d?.online || []).filter((a) => a.kind === "\u0637\u0644\u0628\u0627\u062A" && a.at), ...(d?.cancels || []).filter((a) => a.kind === "\u0637\u0644\u0628\u0627\u062A" && a.entry).map((a) => ({ ...a, at: a.entry, cancelled: true }))].map((a) => ({ ...a, t: Date.parse(a.at), tag: a.tag || null }));
    const manual = new Map((await db.prepare("SELECT talabat_id, apex_no FROM talabat_links WHERE day = ?").all(day)).map((x) => [x.talabat_id, x.apex_no]));
    const names = app2.apexNameMap ? await app2.apexNameMap() : {};
    const aliases = app2.learn ? await app2.learn.pairs("match-v2:branch:talabat") : /* @__PURE__ */ new Map();
    const branchOk = /* @__PURE__ */ __name((store, apexBranch) => {
      const known = aliases.get(store);
      if (known && [...known.values()].reduce((a, b) => a + b, 0) >= 3) return known.has(apexBranch);
      return sameBranch(store, apexBranch);
    }, "branchOk");
    const windowFor = /* @__PURE__ */ __name(async (store) => {
      const v = app2.learn ? await app2.learn.values("match-v2:delay:talabat", store) : [];
      if (v.length < 10) return WINDOW_MIN * 6e4;
      const s = [...v].sort((a, b) => a - b), p95 = s[Math.floor(s.length * 0.95)];
      return Math.min(90, Math.max(15, p95 / 60 * 1.5)) * 6e4;
    }, "windowFor");
    const learnedItems = /* @__PURE__ */ new Map(), itemPairs = app2.learn ? await app2.learn.pairs("match-v2:item:talabat") : /* @__PURE__ */ new Map();
    for (const [n, m] of itemPairs) {
      const ok = new Map([...m].filter(([, c]) => c >= 2));
      if (ok.size) learnedItems.set(n, ok);
    }
    const ratios = app2.learn ? await app2.learn.values("match-v2:ratio:talabat", "-") : [], ratio = ratios.length >= 5 ? [...ratios].sort((x, y) => x - y)[Math.floor(ratios.length / 2)] : 1.13;
    const profiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map((x) => [x.ref, parseJson(x.data, {})]));
    const windows = /* @__PURE__ */ new Map();
    for (const o of rows) if (!windows.has(o.store)) windows.set(o.store, await windowFor(o.store));
    const decision = resolveOrders(
      rows.map((o) => ({
        ...o,
        source: "talabat",
        branch: o.store,
        anchor: o.accepted_at || o.received_at || o.placed_at,
        amount: o.total || o.subtotal,
        customer: profiles.get(o.id),
        items: parseJson(o.items, []),
        excluded: o.status === "REJECTED"
      })),
      apex,
      { manual, branchOk, windowFor: /* @__PURE__ */ __name((o) => windows.get(o.store), "windowFor"), learned: learnedItems, ratio }
    );
    const { matches, how } = decision, usedA = decision.used;
    const evidence = new Map(rows.map((o) => [o.id, []]));
    const record = /* @__PURE__ */ __name((kind, a, b, ref2, value = null) => evidence.get(ref2)?.push({ kind, a, b, value }), "record");
    if (teach && app2.learn) for (const o of rows) {
      const a = matches.get(o.id), h = how.get(o.id);
      if (!a || h !== "code" && h !== "evidence") continue;
      if (o.store && a.branch) record("match-v2:branch:talabat", o.store, a.branch, o.id);
      const anchor = o.accepted_at || o.received_at;
      if (o.store && anchor) record("match-v2:delay:talabat", o.store, "-", o.id, Math.max(0, (a.t - anchor) / 1e3));
    }
    const okReviews = new Set((await db.prepare("SELECT ref FROM exception_reviews WHERE source = 'talabatItems' AND day = ? AND verdict = 'ok'").all(day)).map((r2) => r2.ref));
    const itemsOf = /* @__PURE__ */ new Map();
    for (const o of rows) {
      const a = matches.get(o.id);
      let ti = null;
      try {
        ti = JSON.parse(o.items || "null");
      } catch {
      }
      if (!a || !Array.isArray(ti) || !ti.length || !Array.isArray(a.items) || !a.items.length) continue;
      const c = compareItems(ti, a.items, { learned: learnedItems, ratio });
      c.reviewedOk = okReviews.has(o.id);
      itemsOf.set(o.id, c);
      const sure = how.get(o.id) === "code" || how.get(o.id) === "evidence";
      if (!teach || !app2.learn || !sure || !c.ok) continue;
      for (const p of c.pairs) {
        record("match-v2:item:talabat", key(p.talabat), String(p.apexNo).trim(), o.id);
        if (p.ratio && p.how === "known") record("match-v2:ratio:talabat", "-", key(p.talabat), o.id, p.ratio);
      }
    }
    if (teach && app2.learn) for (const [id2, facts] of evidence) await app2.learn.replace("talabat", id2, facts);
    const shape = /* @__PURE__ */ __name((a, h, id2) => a && {
      no: a.no,
      sn: a.sn ?? null,
      at: iso(a.t),
      user: names[a.user] || a.user || null,
      branch: a.branch,
      amount: a.amount ?? null,
      manual: h === "manual",
      how: h || null,
      cancelled: !!a.cancelled,
      items: id2 && itemsOf.get(id2) || null
    }, "shape");
    return { rows, matches: new Map([...matches].map(([k, a]) => [k, shape(a, how.get(k), k)])), states: decision.states, hasApex: Array.isArray(d?.online), unmatchedApex: apex.filter((a) => !usedA.has(String(a.no))).map((a) => shape(a)) };
  }
  __name(computeMatchDay, "computeMatchDay");
  async function alerts(now) {
    const day = businessDay(now), m = await matchDay(day, { teach: true });
    const c = await db.prepare("SELECT rules FROM telegram_config WHERE id = 1").get();
    let r = {};
    try {
      r = JSON.parse(c?.rules || "{}");
    } catch {
    }
    const clock4 = /* @__PURE__ */ __name((t) => new Date(t).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }), "clock");
    const out = [], det = app2.apexDetails ? await app2.apexDetails(day, { talabat: true }) : { extra: /* @__PURE__ */ __name(() => "", "extra") };
    for (const o of m.rows) {
      const store = o.store ? "\n\u0627\u0644\u0641\u0631\u0639: " + storeName(o.store) : "", ref2 = o.id;
      if (m.hasApex && o.accepted_at && !m.matches.get(o.id) && o.status !== "CANCELLED" && now - o.accepted_at > NOT_ENTERED_MIN * 6e4 && now - o.accepted_at < 3 * 36e5)
        out.push({ key: "talabat:notEntered:" + o.id, kind: "talabatNotEntered", target: "online", text: "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u26A0\uFE0F \u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0642\u0628\u0644 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0648\u0644\u0633\u0647 \u0645\u0627\u062A\u0636\u0631\u0628\u0634 \u0639\u0644\u0649 Apex\n" + talabatReference(o) + store + "\n\u0627\u062A\u0642\u0628\u0644 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.accepted_at) + "\u060C \u0648\u0628\u0642\u0627\u0644\u0647 " + Math.round((now - o.accepted_at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629" + (o.subtotal ? "\n\u0642\u064A\u0645\u0629 \u0627\u0644\u0623\u0648\u0631\u062F\u0631: " + Math.round(o.subtotal) + " \u062C" : "") });
      if (cancelReady(o) && now - o.cancelled_at < 3 * 36e5)
        out.push({ key: "talabat:cancel:" + o.id, kind: "talabatCancel", target: "branches", branch: m.matches.get(o.id)?.branch || o.store || null, text: "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u274C \u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0644\u063A\u0649 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A\n" + talabatReference(o) + store + "\n\u0627\u062A\u0644\u063A\u0649 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.cancelled_at) + (o.cancel_owner ? "\n\u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0639\u0644\u0649: " + o.cancel_owner : "") + (o.cancel_reason ? "\n\u0627\u0644\u0633\u0628\u0628: " + o.cancel_reason : "") + (o.subtotal ? "\n\u0642\u064A\u0645\u0629 \u0627\u0644\u0623\u0648\u0631\u062F\u0631: " + Math.round(o.subtotal) + " \u062C" : "") + (m.matches.get(o.id) ? det.extra(m.matches.get(o.id).no) : "") });
    }
    const open = new Set((await db.prepare("SELECT l.key FROM telegram_log l WHERE l.key LIKE 'talabat:notEntered:%' AND l.created_at >= ? AND NOT EXISTS (SELECT 1 FROM telegram_log x WHERE x.key = 'resolved:' || l.key)").all(now - 12 * 36e5)).map((x) => x.key));
    for (const o of m.rows) {
      const key2 = "talabat:notEntered:" + o.id;
      if (!open.has(key2)) continue;
      const a = m.matches.get(o.id), ref2 = o.id;
      let text = null;
      if (a) text = "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u2705 \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A " + ref2 + " \u0627\u062A\u0623\u0643\u062F\u062A \u0645\u0637\u0627\u0628\u0642\u062A\u0647 \u0639\u0644\u0649 Apex \xB7 " + (a.branch || "") + "\n\u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(Date.parse(a.at)) + (o.accepted_at ? " (\u0628\u0639\u062F " + Math.round((Date.parse(a.at) - o.accepted_at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0627\u0644\u0642\u0628\u0648\u0644)" : "") + (a.user ? " \xB7 \u0636\u0631\u0628\u0647 " + a.user : "");
      else if (o.status === "CANCELLED" || o.status === "REJECTED") text = "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u{1F504} \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A " + ref2 + " \u0627\u062A\u0644\u063A\u0649 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0642\u0628\u0644 \u0645\u0627 \u064A\u062A\u0636\u0631\u0628 \u0639\u0644\u0649 Apex" + (o.cancelled_at ? " \u2014 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(o.cancelled_at) : "") + (o.cancel_reason ? "\n\u0627\u0644\u0633\u0628\u0628: " + o.cancel_reason : "");
      if (text && !text.includes("\u0647\u0627\u0634\u062A\u0627\u062C \u0637\u0644\u0628\u0627\u062A:")) text += "\n" + talabatReference(o);
      if (text) out.push({ key: "resolved:" + key2, kind: "talabatNotEntered", target: "online", replyTo: key2, text });
    }
    const sent = new Set((await db.prepare("SELECT key FROM telegram_log WHERE (key LIKE 'talabat:items:%' OR key LIKE 'resolved:talabat:items:%') AND created_at >= ?").all(now - 6 * 36e5)).map((x) => x.key));
    for (const o of m.rows) {
      const a = m.matches.get(o.id), c2 = a?.items, key2 = "talabat:items:" + o.id;
      if (!c2 || !["code", "evidence", "manual"].includes(a.how)) continue;
      if (!c2.ok && !c2.uncertain && !c2.reviewedOk && !sent.has(key2) && now - (o.accepted_at || o.placed_at || now) < 3 * 36e5)
        out.push({ key: key2, kind: "talabatItems", target: "online", text: "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u{1F37D}\uFE0F \u0635\u0646\u0641 \u0645\u0645\u0643\u0646 \u064A\u0643\u0648\u0646 \u0645\u062A\u0636\u0631\u0628 \u063A\u0644\u0637 \u0639\u0644\u0649 Apex\n" + talabatReference(o) + " \xB7 " + (a.branch || "") + (a.user ? "\n\u0627\u0644\u0644\u064A \u0636\u0631\u0628 \u0627\u0644\u0623\u0648\u0631\u062F\u0631: " + a.user : "") + (c2.missingOnApex.length ? "\n\u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0648\u0645\u0634 \u0639\u0644\u0649 Apex: " + c2.missingOnApex.join("\u060C ") : "") + (c2.extraOnApex.length ? "\n\u0639\u0644\u0649 Apex \u0648\u0645\u0634 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A: " + c2.extraOnApex.join("\u060C ") : "") });
      else if ((c2.ok || c2.reviewedOk) && sent.has(key2) && !sent.has("resolved:" + key2))
        out.push({ key: "resolved:" + key2, kind: "talabatItems", target: "online", replyTo: key2, text: "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u2705 \u0623\u0648\u0631\u062F\u0631 \u0637\u0644\u0628\u0627\u062A " + (o.code ? "#" + o.code : o.id) + ": \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0628\u0642\u062A \u0645\u0637\u0627\u0628\u0642\u0629 \u0639\u0644\u0649 Apex" + (c2.reviewedOk && !c2.ok ? " (\u0627\u062A\u0631\u0627\u062C\u0639: \u0645\u0634 \u063A\u0644\u0637)" : "") });
    }
    {
      const snap = parseJson((await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day))?.data, {});
      const outOf = new Map([...snap.lateOut || [], ...snap.online || []].filter((x) => x.out).map((x) => [String(x.no), Date.parse(x.out)]));
      const ours = new Set(parseJson((await db.prepare("SELECT value FROM settings WHERE key = 'talabat_actions_log'").get())?.value, []).filter((x) => x.action === "onTheWay" && x.ok).map((x) => x.id));
      const early = new Set((await db.prepare("SELECT key FROM telegram_log WHERE (key LIKE 'talabat:early:%' OR key LIKE 'resolved:talabat:early:%') AND created_at >= ?").all(now - 6 * 36e5)).map((x) => x.key));
      for (const o of m.rows) {
        const a = m.matches.get(o.id), picked = o.picked_up_at, key2 = "talabat:early:" + o.id;
        if (!Array.isArray(snap.online) || !a || !picked || ours.has(String(o.id)) || o.code && ours.has(String(o.code)) || /pick|استلام/i.test(String(o.delivery_type || "")) || now - picked > 3 * 36e5) continue;
        const left = outOf.get(String(a.no)), ref2 = o.code ? "#" + o.code : o.id;
        const tooEarly = left ? left - picked > 3 * 6e4 : now - picked > 3 * 6e4;
        if (tooEarly && !early.has(key2))
          out.push({ key: key2, kind: "talabatEarly", target: "online", text: "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u26A0\uFE0F \u0623\u0648\u0631\u062F\u0631 " + ref2 + " \u0627\u062A\u0639\u0645\u0644 \xAB\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642\xBB \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0645\u0646 \u0645\u0643\u0646\u0629 \u0627\u0644\u0641\u0631\u0639 \u0648\u0647\u0648 \u0644\u0633\u0647 \u0645\u0627\u062E\u0631\u062C\u0634 \u0645\u0639 \u0637\u064A\u0627\u0631 \u0639\u0644\u0649 Apex\n\u0627\u0644\u0641\u0631\u0639: " + (a.branch || storeName(o.store) || "") + "\n\xAB\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642\xBB \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(picked) + (left ? "\n\u062E\u0631\u062C \u0641\u0639\u0644\u0627\u064B \u0639\u0644\u0649 Apex \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(left) + " (\u0628\u0639\u062F\u0647\u0627 \u0628\u0640 " + Math.round((left - picked) / 6e4) + " \u062F\u0642\u064A\u0642\u0629)" : "\n\u0644\u0633\u0647 \u0645\u0627\u062E\u0631\u062C\u0634 \u0639\u0644\u0649 Apex") + "\n\u0631\u0642\u0645\u0647 \u0639\u0644\u0649 Apex: " + (a.sn ?? a.no) });
        else if (left && early.has(key2) && !early.has("resolved:" + key2))
          out.push({ key: "resolved:" + key2, kind: "talabatEarly", target: "online", replyTo: key2, text: "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u2705 \u0623\u0648\u0631\u062F\u0631 " + ref2 + " \u062E\u0631\u062C \u0641\u0639\u0644\u0627\u064B \u0639\u0644\u0649 Apex \u0627\u0644\u0633\u0627\u0639\u0629 " + clock4(left) + " \u2014 \u0628\u0639\u062F \xAB\u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642\xBB \u0628\u0640 " + Math.round((left - picked) / 6e4) + " \u062F\u0642\u064A\u0642\u0629" });
      }
    }
    if (out.length) await db.batch(out.map((a) => db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, reply_to, branch) VALUES (?,?,?,?,?,?,?,?,?)").bind(a.key, a.kind, null, a.text, now, r[a.kind] === false && !a.replyTo ? now : null, a.target, a.replyTo || null, a.branch || null)));
  }
  __name(alerts, "alerts");
  let alertsAt = 0, alertsFlight = null;
  async function maybeAlerts(now, force = false) {
    if (alertsFlight) {
      await alertsFlight;
      if (!force) return;
    }
    if (!force && now - alertsAt < 3e4) return;
    alertsFlight = alerts(now).then((value) => {
      alertsAt = now;
      return value;
    }).finally(() => {
      alertsFlight = null;
    });
    return alertsFlight;
  }
  __name(maybeAlerts, "maybeAlerts");
  app2.talabat = { matchDay, invalidate: /* @__PURE__ */ __name((day) => {
    matchRevision++;
    matchCache.delete(day);
  }, "invalidate") };
  app2.route("GET", "/api/talabat/day", async (ctx) => {
    await app2.requireAdmin(ctx);
    const day = validDate(String(ctx.query.day || "")) ? ctx.query.day : businessDay(ctx.now);
    const m = await matchDay(day), last = Number(await setting("talabat_last_push")) || null;
    const ingestion = new Map((await db.prepare("SELECT ref, detail_attempts, detail_retry_at FROM order_ingest WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map((r) => [r.ref, r]));
    let parse = /* @__PURE__ */ __name((x) => {
      try {
        return JSON.parse(x);
      } catch {
        return null;
      }
    }, "parse");
    return {
      day,
      linked: !!await setting("talabat_token_hash"),
      lastPush: iso(last),
      stale: !last || ctx.now - last > STALE_MS2,
      apexLinked: m.hasApex,
      serverNow: iso(ctx.now),
      orders: m.rows.map((o) => ({
        id: o.id,
        cancellationReadiness: o.status !== "CANCELLED" ? null : cancelReady(o) ? "READY" : ingestion.get(o.id)?.detail_attempts >= 5 ? "FAILED" : "PENDING",
        detailAttempts: ingestion.get(o.id)?.detail_attempts || 0,
        store: storeName(o.store),
        status: o.status,
        billable: o.billable,
        placedAt: iso(o.placed_at),
        total: o.total,
        receivedAt: iso(o.received_at),
        acceptSeconds: o.accept_seconds,
        acceptedAt: iso(o.accepted_at),
        pickedUpAt: iso(o.picked_up_at),
        deliveredAt: iso(o.delivered_at),
        cancelledAt: iso(o.cancelled_at),
        cancelOwner: o.cancel_owner,
        cancelReason: o.cancel_reason,
        code: o.code,
        steps: parse(o.milestones) || null,
        items: parse(o.items) || [],
        subtotal: o.subtotal,
        deliveryType: o.delivery_type,
        detailRead: !!o.detail_at,
        final: FINAL.has(o.status),
        apex: m.matches.get(o.id) || null,
        matching: m.states.get(o.id) || null
      })),
      unmatchedApex: m.unmatchedApex
    };
  });
  app2.route("POST", "/api/talabat/link", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const id2 = String(ctx.body.talabatId || ""), no = ctx.body.apexNo == null || ctx.body.apexNo === "" ? null : String(ctx.body.apexNo);
    const o = await db.prepare("SELECT day FROM talabat_orders WHERE id = ?").get(id2);
    if (!o) fail2(404, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0634 \u0645\u0648\u062C\u0648\u062F");
    if (no != null && no !== "none") {
      const snap = parseJson((await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(o.day))?.data, {});
      if (![...snap.online || [], ...snap.cancels || []].some((a) => String(a.no) === no && a.kind === "\u0637\u0644\u0628\u0627\u062A")) fail2(400, "\u0623\u0648\u0631\u062F\u0631 Apex \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0646\u0641\u0633 \u0627\u0644\u064A\u0648\u0645 \u0648\u0627\u0644\u0645\u0635\u062F\u0631");
      if (await db.prepare("SELECT talabat_id FROM talabat_links WHERE day = ? AND apex_no = ? AND talabat_id != ?").get(o.day, no, id2)) fail2(409, "\u0623\u0648\u0631\u062F\u0631 Apex \u0645\u0631\u0628\u0648\u0637 \u064A\u062F\u0648\u064A\u064B\u0627 \u0628\u0623\u0648\u0631\u062F\u0631 \u0622\u062E\u0631");
    }
    const before = await db.prepare("SELECT apex_no, set_by, set_at FROM talabat_links WHERE talabat_id = ?").get(id2);
    if (no === null) await db.prepare("DELETE FROM talabat_links WHERE talabat_id = ?").run(id2);
    else await db.prepare("INSERT INTO talabat_links (talabat_id, day, apex_no, set_by, set_at) VALUES (?,?,?,?,?) ON CONFLICT(talabat_id) DO UPDATE SET apex_no = excluded.apex_no, set_by = excluded.set_by, set_at = excluded.set_at").run(id2, o.day, no === "none" ? null : no, who.name, ctx.now);
    matchRevision++;
    matchCache.delete(o.day);
    await app2.audit("talabat_link", null, { actor: who.name, talabatId: id2, apexNo: no, before: before || null, after: no, reason: String(ctx.body.reason || "").slice(0, 500) || null });
    await matchDay(o.day, { teach: true });
    return { ok: true };
  });
}
__name(setup19, "setup");

// ../sites/lib/marsad/cancels.js
var cancels_exports = {};
__export(cancels_exports, {
  OWNERS: () => OWNERS,
  reasonKey: () => reasonKey,
  setup: () => setup20
});
var OWNERS = { employee: "\u0627\u0644\u0645\u0648\u0638\u0641 \u0627\u0644\u0644\u064A \u0636\u0631\u0628\u0647", branch: "\u0627\u0644\u0641\u0631\u0639", pilot: "\u0627\u0644\u0637\u064A\u0627\u0631", customer: "\u0627\u0644\u0639\u0645\u064A\u0644", platform: "\u0637\u0644\u0628\u0627\u062A / \u0627\u0644\u0645\u0646\u0635\u0629", other: "\u0633\u0628\u0628 \u062A\u0627\u0646\u064A" };
var LATE_ENTRY_MIN = 10;
var LATE_OUT_MIN = 45;
var norm3 = /* @__PURE__ */ __name((s) => String(s || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/[ًٌٍَُِّْ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(), "norm");
var reasonKey = /* @__PURE__ */ __name((s) => norm3(s).split(" ").filter((w) => w.length > 1).slice(0, 8).join(" ") || null, "reasonKey");
var RULES2 = [
  [/غلط|خطا|خطأ|wrong|غير المطلوب|مش المطلوب|اتضرب|بدل|تبديل|incorrect|missing item/, "employee", "\u0627\u0644\u0633\u0628\u0628 \u0628\u064A\u0642\u0648\u0644 \u0625\u0646 \u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0636\u0631\u0628 \u063A\u0644\u0637"],
  [/مش متوفر|غير متوفر|خلص|نفذ|ناقص|out of stock|unavailable|not available/, "branch", "\u0635\u0646\u0641 \u0645\u0634 \u0645\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0641\u0631\u0639"],
  [/تاخير|اتاخر|متاخر|late|delay|too long|took long/, "branch", "\u062A\u0623\u062E\u064A\u0631"],
  [/طيار|pilot|rider|driver|courier|حادث|اتوه/, "pilot", "\u0627\u0644\u0633\u0628\u0628 \u0639\u0644\u0649 \u0627\u0644\u0637\u064A\u0627\u0631"],
  [/عميل|customer|رفض|مش بيرد|لا يرد|مبيردش|reach|غير العنوان|changed mind|duplicate order/, "customer", "\u0627\u0644\u0633\u0628\u0628 \u0639\u0644\u0649 \u0627\u0644\u0639\u0645\u064A\u0644"],
  [/طلبات|talabat|platform|system|سيستم|منصه/, "platform", "\u0627\u0644\u0633\u0628\u0628 \u0639\u0644\u0649 \u0627\u0644\u0645\u0646\u0635\u0629"]
];
function setup20(app2) {
  const { db, fail: fail2 } = app2;
  const parse = /* @__PURE__ */ __name((x) => {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  }, "parse");
  async function dayList(day) {
    const r = await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day), d = r ? parse(r.data) : null;
    const names = app2.apexNameMap ? await app2.apexNameMap() : {}, nm = /* @__PURE__ */ __name((u) => names[u] || u || null, "nm");
    const m = app2.talabat ? await app2.talabat.matchDay(day) : { rows: [], matches: /* @__PURE__ */ new Map() };
    const learned = app2.learn ? await app2.learn.pairs("cancel:owner") : /* @__PURE__ */ new Map();
    const confirmed = new Map((await db.prepare("SELECT * FROM cancel_owners WHERE day = ?").all(day)).map((x) => [x.key, x]));
    const lateOut = new Map((d?.lateOut || []).map((x) => [String(x.no), x]));
    const out = [], usedApex = /* @__PURE__ */ new Set();
    const suggest = /* @__PURE__ */ __name((reasonText, ev) => {
      const why = [];
      let owner = null;
      const k = reasonKey(reasonText), seen = k && learned.get(k);
      if (seen) {
        const [best, n] = [...seen].sort((a, b) => b[1] - a[1])[0], all = [...seen.values()].reduce((a, b) => a + b, 0);
        if (n >= 2 && n / all >= 0.6) {
          owner = best;
          why.push("\u0646\u0641\u0633 \u0627\u0644\u0633\u0628\u0628 \u0627\u062A\u0631\u0627\u062C\u0639 " + n + " \u0645\u0631\u0627\u062A \u0648\u0643\u0627\u0646 \u0639\u0644\u0649: " + OWNERS[best]);
        }
      }
      for (const e of ev) {
        if (!owner && e.owner) owner = e.owner;
        why.push(e.text);
      }
      if (!owner && reasonText) {
        for (const [re, o, t] of RULES2) if (re.test(norm3(reasonText))) {
          owner = o;
          why.push(t);
          break;
        }
      }
      return { owner: owner || null, why };
    }, "suggest");
    for (const o of m.rows) {
      if (o.status !== "CANCELLED" && o.status !== "REJECTED") continue;
      const a = m.matches.get(o.id), ev = [];
      if (a) usedApex.add(String(a.no));
      const ownerTxt = String(o.cancel_owner || "").replace(/^Owner:\s*/i, "");
      if (a?.items && !a.items.ok && !a.items.uncertain && !a.items.reviewedOk) ev.push({ owner: "employee", text: "\u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0639\u0644\u0649 Apex \u0645\u0634 \u0632\u064A \u0637\u0644\u0628\u0627\u062A: " + [...a.items.missingOnApex, ...a.items.extraOnApex].slice(0, 4).join("\u060C ") });
      if (a && o.accepted_at && Date.parse(a.at) - o.accepted_at > LATE_ENTRY_MIN * 6e4) ev.push({ owner: "employee", text: "\u0627\u062A\u0636\u0631\u0628 \u0639\u0644\u0649 Apex \u0628\u0639\u062F " + Math.round((Date.parse(a.at) - o.accepted_at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629 \u0645\u0646 \u0627\u0644\u0642\u0628\u0648\u0644" });
      if (!a && o.accepted_at && o.status === "CANCELLED") ev.push({ owner: "employee", text: "\u0627\u062A\u0642\u0628\u0644 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0648\u0645\u0627\u0644\u0642\u064A\u0646\u0627\u0647\u0648\u0634 \u0639\u0644\u0649 Apex" });
      const lo = a && lateOut.get(String(a.no));
      if (lo) ev.push({ owner: "branch", text: "\u062E\u0631\u062C \u0645\u0646 \u0627\u0644\u0641\u0631\u0639 \u0628\u0639\u062F " + lo.wait + " \u062F\u0642\u064A\u0642\u0629" });
      if (o.picked_up_at && o.cancelled_at && o.cancelled_at - o.picked_up_at > 0) ev.push({ text: "\u0627\u062A\u0644\u063A\u0649 \u0628\u0639\u062F \u0645\u0627 \u0627\u0644\u0637\u064A\u0627\u0631 \u0627\u0633\u062A\u0644\u0645 \u0628\u0640 " + Math.round((o.cancelled_at - o.picked_up_at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629" });
      if (/customer/i.test(ownerTxt)) ev.push({ owner: "customer", text: "\u0637\u0644\u0628\u0627\u062A \u062D\u0627\u0637\u0637\u0647 \u0639\u0644\u0649 \u0627\u0644\u0639\u0645\u064A\u0644" });
      else if (/rider|transport/i.test(ownerTxt)) ev.push({ owner: "pilot", text: "\u0637\u0644\u0628\u0627\u062A \u062D\u0627\u0637\u0637\u0647 \u0639\u0644\u0649 \u0637\u064A\u0627\u0631 \u0637\u0644\u0628\u0627\u062A" });
      else if (/platform/i.test(ownerTxt)) ev.push({ owner: "platform", text: "\u0637\u0644\u0628\u0627\u062A \u062D\u0627\u0637\u0637\u0647 \u0639\u0644\u0649 \u0627\u0644\u0645\u0646\u0635\u0629" });
      else if (/vendor/i.test(ownerTxt)) ev.push({ owner: "branch", text: "\u0637\u0644\u0628\u0627\u062A \u062D\u0627\u0637\u0637\u0647 \u0639\u0644\u0649 \u0627\u0644\u0645\u0637\u0639\u0645" });
      ev.sort((x, y) => (y.owner === "employee") - (x.owner === "employee"));
      const s = suggest(o.cancel_reason, ev);
      out.push({
        key: "talabat:" + o.id,
        source: "talabat",
        ref: o.id,
        code: o.code,
        at: iso(o.cancelled_at),
        store: o.store,
        branch: a?.branch || null,
        apexNo: a?.no ?? null,
        apexSn: a?.sn ?? null,
        user: a?.user || null,
        pilot: null,
        amount: o.subtotal ?? o.total ?? null,
        reason: [ownerTxt, o.cancel_reason].filter(Boolean).join(" \u2014 ") || null,
        reasonKey: reasonKey(o.cancel_reason),
        ...s
      });
    }
    for (const c of d?.cancels || []) {
      if (usedApex.has(String(c.no))) continue;
      const reasonText = [c.reasonName, c.reason].filter(Boolean).join(" \u2014 "), ev = [];
      const lo = lateOut.get(String(c.no));
      if (lo) ev.push({ owner: "branch", text: "\u062E\u0631\u062C \u0645\u0646 \u0627\u0644\u0641\u0631\u0639 \u0628\u0639\u062F " + lo.wait + " \u062F\u0642\u064A\u0642\u0629" });
      if (c.afterOut != null) ev.push({ text: "\u0627\u062A\u0644\u063A\u0649 \u0628\u0639\u062F \u062E\u0631\u0648\u062C\u0647 \u0645\u0639 \u0627\u0644\u0637\u064A\u0627\u0631 \u0628\u0640 " + c.afterOut + " \u062F\u0642\u064A\u0642\u0629" });
      const s = suggest(reasonText, ev);
      if (!s.owner && c.afterOut != null && c.afterOut >= LATE_OUT_MIN) {
        s.owner = "pilot";
        s.why.push("\u0627\u062A\u0644\u063A\u0649 \u0628\u0639\u062F " + c.afterOut + " \u062F\u0642\u064A\u0642\u0629 \u0645\u0639 \u0627\u0644\u0637\u064A\u0627\u0631");
      }
      out.push({
        key: "apex:" + c.no,
        source: "apex",
        ref: String(c.no),
        kind: c.kind,
        at: c.at,
        branch: c.branch,
        apexNo: c.no,
        apexSn: c.sn ?? null,
        user: nm(c.user),
        by: nm(c.by),
        pilot: c.pilot || null,
        amount: c.amount ?? null,
        reason: reasonText || null,
        reasonKey: reasonKey(reasonText),
        ...s
      });
    }
    for (const x of out) {
      const c = confirmed.get(x.key);
      x.confirmed = c ? { owner: c.owner, name: c.name, by: c.by_name, at: iso(c.at) } : null;
      x.final = c ? c.owner : x.owner;
      x.finalName = c?.name || (x.final === "employee" ? x.user : x.final === "pilot" ? x.pilot : x.final === "branch" ? x.branch || x.store : null);
    }
    return out.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  }
  __name(dayList, "dayList");
  app2.cancelOwners = dayList;
  app2.route("GET", "/api/cancels/owners", async (ctx) => {
    await app2.requireAdmin(ctx);
    const from = validDate(String(ctx.query.from || "")) ? ctx.query.from : businessDay(ctx.now), to = validDate(String(ctx.query.to || "")) ? ctx.query.to : from;
    const days = [];
    for (let t = Date.parse(from + "T12:00:00Z"); t <= Date.parse(to + "T12:00:00Z") && days.length < 62; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
    const list = [];
    for (const d of days) for (const x of await dayList(d)) list.push({ day: d, ...x });
    return { owners: OWNERS, list };
  });
  app2.route("POST", "/api/cancels/owner", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    const b = ctx.body || {}, key2 = String(b.key || "").slice(0, 80);
    if (!/^(apex|talabat):\d+$/.test(key2)) fail2(400, "invalid_key");
    const day = validDate(String(b.day || "")) ? b.day : businessDay(ctx.now);
    if (b.owner == null) {
      await db.prepare("DELETE FROM cancel_owners WHERE key = ?").run(key2);
      await db.prepare("DELETE FROM learned WHERE kind = 'cancel:owner' AND ref = ?").run(key2);
      return { ok: true };
    }
    if (!OWNERS[b.owner]) fail2(400, "invalid_owner");
    const rk = b.reasonKey ? String(b.reasonKey).slice(0, 160) : null;
    await db.prepare(`INSERT INTO cancel_owners (key, day, source, ref, owner, name, reason_key, by_name, at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET owner = excluded.owner, name = excluded.name, reason_key = excluded.reason_key, by_name = excluded.by_name, at = excluded.at`).run(key2, day, key2.split(":")[0], key2.split(":")[1], b.owner, b.name ? String(b.name).slice(0, 80) : null, rk, who.name, ctx.now);
    if (rk && app2.learn) {
      await db.prepare("DELETE FROM learned WHERE kind = 'cancel:owner' AND ref = ?").run(key2);
      await app2.learn.record("cancel:owner", rk, b.owner, key2);
    }
    await app2.audit("cancel_owner", null, { actor: who.name, key: key2, owner: b.owner });
    return { ok: true };
  });
}
__name(setup20, "setup");

// ../sites/lib/marsad/whatsapp.js
var whatsapp_exports = {};
__export(whatsapp_exports, {
  egMobile: () => egMobile,
  setup: () => setup21
});
var TICK_MS2 = 3e4;
var GRAPH = "https://graph.facebook.com/v21.0";
var KEEP_MS = 12 * 36e5;
var WELCOME_WINDOW_MS = 2 * 36e5;
var DEAD = /* @__PURE__ */ new Set(["CANCELLED", "REJECTED"]);
function egMobile(raw) {
  let d = String(raw || "").replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/\D/g, "");
  if (d.startsWith("0020")) d = d.slice(2);
  if (/^01[0125]\d{8}$/.test(d)) d = "2" + d;
  if (/^1[0125]\d{8}$/.test(d)) d = "20" + d;
  return /^201[0125]\d{8}$/.test(d) ? d : null;
}
__name(egMobile, "egMobile");
function setup21(app2) {
  const { db, fail: fail2 } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => v == null ? db.prepare("DELETE FROM settings WHERE key = ?").run(k) : db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const doFetch = app2.config.whatsappFetch || ((...a) => fetch(...a));
  let aesKey = null;
  const aes = /* @__PURE__ */ __name(() => aesKey ??= crypto.subtle.importKey("raw", sha256Bytes("whatsapp:" + app2.config.secret), "AES-GCM", false, ["encrypt", "decrypt"]), "aes");
  const seal = /* @__PURE__ */ __name(async (text) => {
    const iv = randomBytes(12);
    return b64(iv) + "." + b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(), new TextEncoder().encode(text))));
  }, "seal");
  const open = /* @__PURE__ */ __name(async (sealed) => {
    try {
      const [iv, data] = sealed.split(".").map(fromB64);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aes(), data));
    } catch {
      return null;
    }
  }, "open");
  async function config2() {
    const raw = await setting("whatsapp_config");
    let c = null;
    try {
      c = raw ? JSON.parse(await open(raw)) : null;
    } catch {
    }
    if (!c) return null;
    if ((c.mode || "cloud") === "web") return c.welcomeText ? c : null;
    return c.phoneId && c.token ? c : null;
  }
  __name(config2, "config");
  const on2 = /* @__PURE__ */ __name(async () => {
    const c = await config2();
    return c && c.enabled && (c.mode === "web" ? c.welcomeText : c.welcome) ? c : null;
  }, "on");
  async function graph(c, path, body) {
    const r = await doFetch(GRAPH + "/" + path, {
      method: body ? "POST" : "GET",
      headers: { authorization: "Bearer " + c.token, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : void 0,
      signal: AbortSignal.timeout(15e3)
    });
    let d = null;
    try {
      d = await r.json();
    } catch {
    }
    if (!r.ok) throw Error("\u0648\u0627\u062A\u0633\u0627\u0628 \u0631\u062F " + r.status + (d?.error?.message ? ": " + String(d.error.message).slice(0, 160) : ""));
    return d;
  }
  __name(graph, "graph");
  const sendTemplate = /* @__PURE__ */ __name((c, to, name) => graph(c, c.phoneId + "/messages", { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: c.lang || "ar" } } }), "sendTemplate");
  app2.whatsapp = {
    wantPhones: /* @__PURE__ */ __name(async () => !!await on2(), "wantPhones"),
    async take(orders, now) {
      if (!await on2()) return;
      const rows = [];
      for (const o of orders) {
        const id2 = String(o.id || "").replace(/\D/g, "").slice(0, 20);
        if (id2.length < 6 || !o.phone) continue;
        const prior = await db.prepare("SELECT id FROM wa_messages WHERE talabat_id=?").get(id2);
        const order = await db.prepare("SELECT status,placed_at,received_at FROM talabat_orders WHERE id=?").get(id2);
        const sourceAt = order?.received_at || order?.placed_at;
        if (!prior && (DEAD.has(order?.status) || ["COMPLETED", "DELIVERED"].includes(order?.status) || Number.isFinite(sourceAt) && now - sourceAt > WELCOME_WINDOW_MS)) continue;
        const phone = egMobile(o.phone);
        const detailPhone = egMobile(o.detail?.customer?.phone);
        const verified = phone && detailPhone === phone;
        if (verified) rows.push(db.prepare("INSERT INTO wa_identity (talabat_id,phone_hash,verified_at) VALUES (?,?,?) ON CONFLICT(talabat_id) DO UPDATE SET phone_hash=excluded.phone_hash,verified_at=excluded.verified_at").bind(id2, sha256(phone), now));
        rows.push(db.prepare("INSERT OR IGNORE INTO wa_messages (talabat_id, day, phone, created_at, error) VALUES (?,?,?,?,?)").bind(id2, businessDay(now), phone, now, phone ? verified ? null : "customer_identity_pending" : "\u0627\u0644\u0631\u0642\u0645 \u0645\u0634 \u0645\u0648\u0628\u0627\u064A\u0644 \u0645\u0635\u0631\u064A"));
        if (verified) rows.push(db.prepare("UPDATE wa_messages SET phone=?,error=NULL WHERE talabat_id=? AND welcome_at IS NULL AND sending_at IS NULL").bind(phone, id2));
      }
      if (rows.length) await db.batch(rows);
    }
  };
  const identityReady = /* @__PURE__ */ __name(async (r) => {
    const identity = await db.prepare("SELECT phone_hash FROM wa_identity WHERE talabat_id=?").get(r.talabat_id);
    const order = await db.prepare("SELECT status FROM talabat_orders WHERE id=?").get(r.talabat_id);
    if (!r.phone || !order?.status || DEAD.has(order.status) || identity?.phone_hash !== sha256(r.phone)) {
      await db.prepare("UPDATE wa_messages SET error='customer_identity_pending' WHERE id=?").run(r.id);
      return false;
    }
    return true;
  }, "identityReady");
  async function claim(r, kind, now, protocol) {
    if (!await identityReady(r)) return null;
    const token = randomToken(24);
    const got = await db.prepare(`INSERT INTO wa_claims (message_id,kind,token,claimed_at,state,protocol) VALUES (?,?,?,?,'claimed',?)
      ON CONFLICT(message_id) DO UPDATE SET kind=excluded.kind,token=excluded.token,claimed_at=excluded.claimed_at,state='claimed',protocol=excluded.protocol
      WHERE wa_claims.state='done' AND wa_claims.kind='welcome' AND excluded.kind='survey'`).run(r.id, kind, token, now, protocol);
    if (!got.changes) return null;
    await db.prepare("UPDATE wa_messages SET sending_at=? WHERE id=?").run(now, r.id);
    return token;
  }
  __name(claim, "claim");
  async function settle(id2, kind, token, ok, invalid, now) {
    const guard = "EXISTS (SELECT 1 FROM wa_claims WHERE message_id=? AND token=? AND kind=? AND state='claimed')";
    const field = kind === "survey" ? "survey_at" : "welcome_at";
    await db.batch([
      ok ? db.prepare(`UPDATE wa_messages SET ${field}=?,sending_at=NULL,error=NULL${kind === "survey" ? ",phone=NULL" : ""} WHERE id=? AND ${guard}`).bind(now, id2, id2, token, kind) : db.prepare(`UPDATE wa_messages SET error=?,tries=CASE WHEN ? THEN 3 ELSE tries END,phone=CASE WHEN ? THEN NULL ELSE phone END WHERE id=? AND ${guard}`).bind(invalid ? "\u0627\u0644\u0631\u0642\u0645 \u0645\u0634 \u0639\u0644\u0649 \u0648\u0627\u062A\u0633\u0627\u0628" : "delivery_unconfirmed", invalid ? 1 : 0, invalid ? 1 : 0, id2, id2, token, kind),
      db.prepare("UPDATE wa_claims SET state=? WHERE message_id=? AND token=? AND kind=? AND state='claimed'").bind(ok ? "done" : "unknown", id2, token, kind)
    ]);
  }
  __name(settle, "settle");
  let busy = false, last = 0;
  app2.whatsappTick = async (now = app2.now()) => {
    if (busy) return 0;
    busy = true;
    let sent = 0;
    try {
      await db.prepare("UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL AND created_at < ?").run(now - KEEP_MS);
      const c = await on2();
      if (!c || c.mode === "web") return 0;
      const status = /* @__PURE__ */ __name(async (id2) => await db.prepare("SELECT status, accepted_at FROM talabat_orders WHERE id = ?").get(id2) || {}, "status");
      for (const r of await db.prepare("SELECT * FROM wa_messages WHERE phone IS NOT NULL AND welcome_at IS NULL AND tries < 3 AND created_at > ? ORDER BY created_at LIMIT 10").all(now - WELCOME_WINDOW_MS)) {
        const s = await status(r.talabat_id);
        if (DEAD.has(s.status)) {
          await db.prepare("UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?").run("\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0644\u063A\u0649", r.id);
          continue;
        }
        const token = await claim(r, "welcome", now, 2);
        if (!token) continue;
        try {
          await sendTemplate(c, r.phone, c.welcome);
          await settle(r.id, "welcome", token, true, false, now);
          sent++;
        } catch {
          await settle(r.id, "welcome", token, false, false, now);
        }
      }
      const delay = Math.max(10, Math.min(600, Number(c.delay) || 75)) * 6e4;
      for (const r of await db.prepare("SELECT * FROM wa_messages WHERE phone IS NOT NULL AND welcome_at IS NOT NULL AND survey_at IS NULL AND tries < 6 ORDER BY created_at LIMIT 10").all()) {
        const s = await status(r.talabat_id), base = s.accepted_at || r.created_at;
        if (DEAD.has(s.status)) {
          await db.prepare("UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?").run("\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0644\u063A\u0649 \u2014 \u0645\u0641\u064A\u0634 \u0627\u0633\u062A\u0637\u0644\u0627\u0639", r.id);
          continue;
        }
        if (now - base < delay) continue;
        if (!c.survey) {
          await db.prepare("UPDATE wa_messages SET phone = NULL WHERE id = ?").run(r.id);
          continue;
        }
        const token = await claim(r, "survey", now, 2);
        if (!token) continue;
        try {
          await sendTemplate(c, r.phone, c.survey);
          await settle(r.id, "survey", token, true, false, now);
          sent++;
        } catch {
          await settle(r.id, "survey", token, false, false, now);
        }
      }
    } finally {
      busy = false;
    }
    return sent;
  };
  app2.afterRequest(async (now) => {
    if (now - last < TICK_MS2) return;
    last = now;
    await app2.whatsappTick(now);
  });
  const monitorAuth = /* @__PURE__ */ __name(async (ctx) => {
    const hash = await setting("talabat_token_hash"), given = ctx.header("x-talabat-token");
    if (!hash || !given || sha256(given) !== hash) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0634\u0627\u0634\u0629 \u0637\u0644\u0628\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
  }, "monitorAuth");
  app2.route("POST", "/api/whatsapp/next", async (ctx) => {
    await monitorAuth(ctx);
    const now = ctx.now, c = await on2();
    if (!c || c.mode !== "web") return { ok: true, message: null, on: false };
    const delay = Math.max(10, Math.min(600, Number(c.delay) || 75)) * 6e4, gap = Math.max(20, Number(c.gap) || 40) * 1e3;
    const last2 = Number(await setting("wa_web_last")) || 0;
    if (now - last2 < gap) return { ok: true, message: null, on: true, wait: gap - (now - last2) };
    const free = `w.phone IS NOT NULL AND w.tries < 3
      AND EXISTS (SELECT 1 FROM wa_identity i WHERE i.talabat_id=w.talabat_id)
      AND t.status IS NOT NULL AND t.status NOT IN ('CANCELLED','REJECTED')`;
    const claimable = /* @__PURE__ */ __name((kind) => kind === "welcome" ? "NOT EXISTS (SELECT 1 FROM wa_claims q WHERE q.message_id=w.id)" : "NOT EXISTS (SELECT 1 FROM wa_claims q WHERE q.message_id=w.id AND NOT (q.state='done' AND q.kind='welcome'))", "claimable");
    const status = /* @__PURE__ */ __name(async (id2) => await db.prepare("SELECT status, accepted_at FROM talabat_orders WHERE id = ?").get(id2) || {}, "status");
    const pick2 = /* @__PURE__ */ __name(async (kind, r) => {
      const token = await claim(r, kind, now, ctx.body?.protocol === 2 ? 2 : 1);
      if (!token) return null;
      await put("wa_web_last", now);
      const text = (kind === "survey" ? c.surveyText : c.welcomeText).replace(/\{code\}/g, r.code || "").replace(/\{branch\}/g, r.store || "").trim();
      return { ok: true, on: true, message: { id: r.id, kind, phone: r.phone, text, claimToken: token } };
    }, "pick");
    for (const r of await db.prepare("SELECT w.*, t.code, t.store FROM wa_messages w LEFT JOIN talabat_orders t ON t.id = w.talabat_id WHERE " + free + " AND " + claimable("welcome") + " AND w.welcome_at IS NULL AND w.created_at > ? ORDER BY w.created_at LIMIT 5").all(now - WELCOME_WINDOW_MS)) {
      if (DEAD.has((await status(r.talabat_id)).status)) {
        await db.prepare("UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?").run("\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0644\u063A\u0649", r.id);
        continue;
      }
      const picked = await pick2("welcome", r);
      if (picked) return picked;
    }
    if (c.surveyText) for (const r of await db.prepare("SELECT w.*, t.code, t.store FROM wa_messages w LEFT JOIN talabat_orders t ON t.id = w.talabat_id WHERE " + free + " AND " + claimable("survey") + " AND w.welcome_at IS NOT NULL AND w.survey_at IS NULL AND COALESCE(t.accepted_at,w.created_at) <= ? ORDER BY w.created_at LIMIT 20").all(now - delay)) {
      const s = await status(r.talabat_id);
      if (DEAD.has(s.status)) {
        await db.prepare("UPDATE wa_messages SET phone = NULL, error = ? WHERE id = ?").run("\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0644\u063A\u0649 \u2014 \u0645\u0641\u064A\u0634 \u0627\u0633\u062A\u0637\u0644\u0627\u0639", r.id);
        continue;
      }
      if (now - (s.accepted_at || r.created_at) < delay) continue;
      const picked = await pick2("survey", r);
      if (picked) return picked;
    }
    return { ok: true, on: true, message: null };
  });
  app2.route("POST", "/api/whatsapp/result", async (ctx) => {
    await monitorAuth(ctx);
    const b = ctx.body || {}, id2 = Number(b.id), now = ctx.now;
    if (!Number.isInteger(id2)) fail2(400, "invalid_id");
    if (!["welcome", "survey"].includes(b.kind)) fail2(400, "invalid_kind");
    const current = await db.prepare("SELECT * FROM wa_claims WHERE message_id=?").get(id2);
    if (!current || current.kind !== b.kind || current.protocol === 2 && b.claimToken !== current.token) fail2(409, "stale_claim");
    if (current.state === "done") return { ok: true, duplicate: true };
    if (current.state !== "claimed") fail2(409, "delivery_unconfirmed");
    await settle(id2, b.kind, current.token, !!b.ok, !!b.invalid, now);
    const c = await config2();
    if (b.ok && b.kind === "welcome" && c && !c.surveyText) await db.prepare("UPDATE wa_messages SET phone=NULL WHERE id=?").run(id2);
    return { ok: true };
  });
  app2.route("GET", "/api/whatsapp", async (ctx) => {
    await app2.requireAdmin(ctx, "admin");
    const c = await config2(), day = businessDay(ctx.now);
    const n = /* @__PURE__ */ __name(async (where) => (await db.prepare("SELECT COUNT(*) AS n FROM wa_messages WHERE day = ? AND " + where).get(day)).n, "n");
    const errors = (await db.prepare("SELECT w.id,w.talabat_id,w.error,w.created_at,q.kind,q.state FROM wa_messages w LEFT JOIN wa_claims q ON q.message_id=w.id WHERE w.day = ? AND w.error IS NOT NULL ORDER BY w.id DESC LIMIT 30").all(day)).map((r) => ({ id: r.id, kind: r.kind, canConfirm: r.error === "delivery_unconfirmed" && r.state === "unknown", order: r.talabat_id, error: r.error, at: iso(r.created_at) }));
    const raw = await setting("whatsapp_config");
    let any = null;
    try {
      any = raw ? JSON.parse(await open(raw)) : null;
    } catch {
    }
    const delay = Math.max(10, Math.min(600, Number(c?.delay) || 75)) * 6e4;
    const ready = await db.prepare(`SELECT COUNT(*) n FROM wa_messages w JOIN talabat_orders t ON t.id=w.talabat_id
      JOIN wa_identity i ON i.talabat_id=w.talabat_id LEFT JOIN wa_claims q ON q.message_id=w.id
      WHERE w.phone IS NOT NULL AND w.tries<3 AND t.status NOT IN ('CANCELLED','REJECTED')
      AND ((w.welcome_at IS NULL AND w.created_at>? AND q.message_id IS NULL)
        OR (? AND w.welcome_at IS NOT NULL AND w.survey_at IS NULL AND COALESCE(t.accepted_at,w.created_at)<=?
          AND (q.message_id IS NULL OR (q.state='done' AND q.kind='welcome'))))`).get(ctx.now - WELCOME_WINDOW_MS, (c?.mode === "web" ? c?.surveyText : c?.survey) ? 1 : 0, ctx.now - delay);
    return {
      configured: !!c,
      enabled: !!c?.enabled,
      mode: any?.mode || "web",
      phoneIdEnd: c?.phoneId ? String(c.phoneId).slice(-4) : null,
      welcome: any?.welcome || "",
      survey: any?.survey || "",
      lang: any?.lang || "ar",
      delay: any?.delay || 75,
      welcomeText: any?.welcomeText || "",
      surveyText: any?.surveyText || "",
      lastWeb: iso(Number(await setting("wa_web_last")) || null),
      unconfirmed: (await db.prepare("SELECT COUNT(*) n FROM wa_claims WHERE state='unknown' OR (state='claimed' AND claimed_at<?)").get(ctx.now - 18e4)).n,
      today: { ready: ready.n, orders: await n("1 = 1"), welcome: await n("welcome_at IS NOT NULL"), survey: await n("survey_at IS NOT NULL"), waiting: await n("phone IS NOT NULL") },
      errors
    };
  });
  app2.route("POST", "/api/whatsapp", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin"), b = ctx.body || {};
    const old = await config2();
    const tpl = /* @__PURE__ */ __name((x) => String(x || "").trim().toLowerCase(), "tpl");
    if (b.action === "confirm_sent") {
      const id2 = Number(b.id), kind = b.kind;
      if (!Number.isInteger(id2) || !["welcome", "survey"].includes(kind)) fail2(400, "invalid_message");
      const row = await db.prepare("SELECT w.*,q.kind,q.token,q.state,q.claimed_at FROM wa_messages w JOIN wa_claims q ON q.message_id=w.id WHERE w.id=?").get(id2);
      if (!row || row.kind !== kind) fail2(404, "message_not_found");
      if (row.state === "done") return { ok: true, duplicate: true };
      if (row.state !== "unknown" || row.error !== "delivery_unconfirmed") fail2(409, "message_not_reviewable");
      const order = await db.prepare("SELECT status FROM talabat_orders WHERE id=?").get(row.talabat_id);
      let phone = row.phone;
      if (!phone && kind === "welcome" && old?.enabled && old?.surveyText && ctx.now - row.created_at < KEEP_MS && !DEAD.has(order?.status)) {
        const profile3 = await db.prepare("SELECT data FROM match_profiles WHERE source='talabat' AND ref=?").get(row.talabat_id);
        let customer = {};
        try {
          customer = JSON.parse(profile3?.data || "{}");
        } catch {
        }
        const candidate = egMobile(customer.phone || customer.mobile);
        const identity = await db.prepare("SELECT phone_hash FROM wa_identity WHERE talabat_id=?").get(row.talabat_id);
        if (candidate && identity?.phone_hash === sha256(candidate)) phone = candidate;
      }
      const field = kind === "welcome" ? "welcome_at" : "survey_at";
      await db.batch([
        db.prepare("UPDATE wa_claims SET state='done' WHERE message_id=? AND token=? AND state='unknown'").bind(id2, row.token),
        db.prepare(`UPDATE wa_messages SET ${field}=?,sending_at=NULL,error=NULL,phone=? WHERE id=? AND EXISTS (SELECT 1 FROM wa_claims WHERE message_id=? AND token=? AND state='done')`).bind(row.claimed_at, kind === "survey" ? null : phone, id2, id2, row.token)
      ]);
      await app2.audit("whatsapp_confirm_sent", null, { actor: who.name, order: row.talabat_id, kind });
      return { ok: true, surveyAvailable: kind === "welcome" && !!phone && !!old?.enabled && !!old?.surveyText };
    }
    if (b.action === "web") {
      const raw = await setting("whatsapp_config");
      let prev = null;
      try {
        prev = raw ? JSON.parse(await open(raw)) : null;
      } catch {
      }
      const c = {
        ...prev || {},
        mode: "web",
        welcomeText: String(b.welcomeText || "").trim().slice(0, 1e3),
        surveyText: String(b.surveyText || "").trim().slice(0, 1e3),
        delay: Math.max(10, Math.min(600, Number(b.delay) || 75)),
        enabled: !!prev?.enabled && prev?.mode === "web"
      };
      if (!c.welcomeText) fail2(400, "\u0627\u0643\u062A\u0628 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062A\u0631\u062D\u064A\u0628");
      await put("whatsapp_config", await seal(JSON.stringify(c)));
      await app2.audit("whatsapp_web_config", null, { actor: who.name });
      return { ok: true };
    }
    if (b.action === "config") {
      const c = {
        ...old || {},
        mode: "cloud",
        phoneId: String(b.phoneId || old?.phoneId || "").trim(),
        token: String(b.token || "").trim() || old?.token,
        welcome: tpl(b.welcome),
        survey: tpl(b.survey),
        lang: String(b.lang || "ar").trim(),
        delay: Math.max(10, Math.min(600, Number(b.delay) || 75)),
        enabled: !!old?.enabled
      };
      if (!/^\d{6,30}$/.test(c.phoneId)) fail2(400, "Phone number ID \u0644\u0627\u0632\u0645 \u064A\u0643\u0648\u0646 \u0623\u0631\u0642\u0627\u0645 \u0628\u0633");
      if (!c.token) fail2(400, "\u0627\u0644\u062A\u0648\u0643\u0646 \u0646\u0627\u0642\u0635");
      for (const t of [c.welcome, c.survey]) if (t && !/^[a-z0-9_]{1,512}$/.test(t)) fail2(400, "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0644\u0628: \u062D\u0631\u0648\u0641 \u0625\u0646\u062C\u0644\u064A\u0632\u064A \u0635\u063A\u064A\u0631\u0629 \u0648\u0623\u0631\u0642\u0627\u0645 \u0648 _ \u0628\u0633");
      if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(c.lang)) fail2(400, "\u0643\u0648\u062F \u0627\u0644\u0644\u063A\u0629 \u0632\u064A ar \u0623\u0648 en_US");
      let display = null;
      try {
        display = (await graph(c, c.phoneId + "?fields=display_phone_number,verified_name"))?.display_phone_number || null;
      } catch (e) {
        fail2(400, "\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0634 \u0634\u063A\u0627\u0644\u0629: " + e.message);
      }
      await put("whatsapp_config", await seal(JSON.stringify(c)));
      await app2.audit("whatsapp_config", null, { actor: who.name, phoneIdEnd: c.phoneId.slice(-4) });
      return { ok: true, number: display };
    }
    if (b.action === "enable") {
      if (!old) fail2(400, "\u0627\u0631\u0628\u0637 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0623\u0648\u0644");
      if (b.on && !(old.mode === "web" ? old.welcomeText : old.welcome)) fail2(400, "\u0627\u0643\u062A\u0628 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062A\u0631\u062D\u064A\u0628 \u0627\u0644\u0623\u0648\u0644");
      await put("whatsapp_config", await seal(JSON.stringify({ ...old, enabled: !!b.on })));
      if (!b.on) await db.prepare("UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL").run();
      await app2.audit("whatsapp_" + (b.on ? "on" : "off"), null, { actor: who.name });
      return { ok: true };
    }
    if (b.action === "test") {
      if (!old) fail2(400, "\u0627\u0631\u0628\u0637 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0623\u0648\u0644");
      if (old.mode === "web") fail2(400, "\u0641\u064A \u0648\u0636\u0639 \u0648\u0627\u062A\u0633\u0627\u0628 \u0648\u064A\u0628\u060C \u0627\u0644\u062A\u062C\u0631\u0628\u0629 \u0628\u062A\u062A\u0639\u0645\u0644 \u0645\u0646 \u0634\u0627\u0634\u0629 \u0637\u0644\u0628\u0627\u062A: \u0634\u063A\u0651\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0648\u0627\u0636\u0631\u0628 \u0623\u0648\u0631\u062F\u0631 \u062A\u062C\u0631\u0628\u0629");
      const to = egMobile(b.to), name = b.which === "survey" ? old.survey : old.welcome;
      if (!to) fail2(400, "\u0627\u0643\u062A\u0628 \u0631\u0642\u0645 \u0645\u0648\u0628\u0627\u064A\u0644 \u0645\u0635\u0631\u064A \u0635\u062D\u064A\u062D");
      if (!name) fail2(400, "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0644\u0628 \u0646\u0627\u0642\u0635");
      try {
        await sendTemplate(old, to, name);
      } catch (e) {
        fail2(400, e.message);
      }
      return { ok: true };
    }
    if (b.action === "remove") {
      await put("whatsapp_config", null);
      await db.prepare("UPDATE wa_messages SET phone = NULL WHERE phone IS NOT NULL").run();
      await app2.audit("whatsapp_removed", null, { actor: who.name });
      return { ok: true };
    }
    fail2(400, "invalid_action");
  });
}
__name(setup21, "setup");

// ../sites/lib/marsad/transfer.js
var transfer_exports = {};
__export(transfer_exports, {
  apexBranchOf: () => apexBranchOf,
  setup: () => setup22,
  sitePayment: () => sitePayment,
  talabatDiscounts: () => talabatDiscounts,
  talabatPayment: () => talabatPayment
});

// ../sites/lib/marsad/apex-customer-notes.js
var numerals = /* @__PURE__ */ __name((s) => String(s || "").replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) - (c >= "\u06F0" ? 1776 : 1632))), "numerals");
var money = /* @__PURE__ */ __name((n) => Number.isFinite(n) ? Math.round(n * 100) / 100 : null, "money");
function parseApexCustomerNote(raw) {
  const text = numerals(raw).replace(/\r/g, "\n").trim().slice(0, 1e3);
  if (!text || /^\s*[.\-–ـ]*\s*$/.test(text)) return { text: "", directives: [], other: [], oneTime: false, permanent: false, requiresReview: false };
  const oneTime = /(?:مرة\s*واحدة|مره\s*واحده|للطلب\s*(?:الواحد|القادم|الجاي|الحالي|ده|دا)|للاوردر\s*(?:الحالي|ده|دا)|للأوردر\s*(?:الحالي|ده|دا)|(?:ال)?طلب\s*واحد|المره\s*دي\s*فقط|المرة\s*دي\s*فقط|اوردر\s*(?:واحد|واحده|القادم)|order\s*only|next\s*order|one[ -]?time)/i.test(text);
  const permanent = /(?:دائم|دايم|كل\s*(?:مرة|مره|طلب|اوردر)|permanent|every\s*order|always)/i.test(text);
  const sections = text.split(/[\n؛;|]+/).map((s) => s.trim()).filter(Boolean);
  const directives = [], other = [];
  for (const section of sections) {
    let m;
    if (m = /(?:خصم|discount)\s*(?:بنسبة|نسبة|قدرها|بقيمة|بمبلغ|of|:)?\s*(\d{1,3}(?:\.\d+)?)\s*(%|٪|في\s*المية|بالمية|percent)/i.exec(section)) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100) directives.push({ kind: "percent", value: n, text: section, status: "review", reason: "\u0623\u0633\u0627\u0633 \u0627\u062D\u062A\u0633\u0627\u0628 \u0627\u0644\u0646\u0633\u0628\u0629 \u0648\u062A\u062F\u0627\u062E\u0644 \u0627\u0644\u062E\u0635\u0648\u0645\u0627\u062A \u064A\u062D\u062A\u0627\u062C\u0627\u0646 \u062A\u0623\u0643\u064A\u062F\u064B\u0627" });
      else other.push(section);
    } else if (m = /(?:خصم|discount)\s*(?:بمبلغ|بقيمة|قدرها|قيمة|مبلغ|:)?\s*(\d+(?:\.\d+)?)\s*(?:جنيه|ج|جم|egp|pounds)?\b/i.exec(section)) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 1e5) directives.push({ kind: "amount", value: n, text: section, status: "review", reason: "\u064A\u062C\u0628 \u062A\u0623\u0643\u064A\u062F \u0623\u0646\u0647 \u062E\u0635\u0645 \u0625\u0636\u0627\u0641\u064A \u0648\u063A\u064A\u0631 \u0645\u0637\u0628\u0642 \u0639\u0644\u0649 \u0633\u0639\u0631 \u0627\u0644\u0645\u0635\u062F\u0631" });
      else other.push(section);
    } else if (/(?:^|[\s،:])(?:له|ليها|ليه|يستحق|إضافة|اضافه)\s+(?:(?:\d+|واحد|اتنين)\s+)?(?:صنف|أصناف|اصناف|طبق|وجبة|وجبه|ساندوتش|ساندويتش|هدية|هديه)|(?:صنف|أصناف|اصناف|طبق|وجبة|وجبه|ساندوتش|ساندويتش)\s+(?:هدية|هديه|مجاني|مجانا|مستحق)|(?:هدية|هديه|مجاني|مجانا|gift|free\s*item)/i.test(section)) {
      directives.push({ kind: "item", text: section, status: "review", reason: "\u0627\u062E\u062A\u0627\u0631 \u0643\u0648\u062F \u0627\u0644\u0635\u0646\u0641 \u0648\u0627\u0644\u0643\u0645\u064A\u0629 \u0645\u0646 APEX \u0642\u0628\u0644 \u0625\u0636\u0627\u0641\u062A\u0647" });
    } else other.push(section);
  }
  const financeUnrecognized = /(?:خصم|discount|هدية|هديه|مجاني|مجانا|يستحق|صنف|اصناف|أصناف|كوبون|(?:له|ليها|ليه)\s+\d+|(?:إضافة|اضافه)\s+(?:طبق|صنف|وجبة|وجبه))/i.test(other.join(" "));
  return { text, directives, other, oneTime: oneTime && !permanent && other.length === 0, permanent, requiresReview: directives.length > 0 || oneTime || financeUnrecognized, unrecognized: financeUnrecognized || oneTime && permanent };
}
__name(parseApexCustomerNote, "parseApexCustomerNote");

// ../sites/lib/marsad/apex-sections.js
var APEX_SECTIONS = [{ "name": "\u0627\u0644\u062D\u0644\u0648", "items": ["0201001", "0201002", "0201003"] }, { "name": "\u0627\u0644\u0645\u0634\u0631\u0648\u0628\u0627\u062A", "items": ["0202001", "0202002", "0202003", "0202004", "0202005", "0202006"] }, { "name": "\u0627\u0644\u0633\u0644\u0637\u0627\u062A", "items": ["0101001", "0101002", "0101003", "0101004", "0101005", "0101006", "0101007", "0101008", "0101009", "0101010"] }, { "name": "\u0627\u0644\u0634\u0648\u0631\u0628", "items": ["0102001", "0102002", "0102003", "0102004", "0102005", "0102006", "0102007", "0102008"] }, { "name": "\u0627\u0644\u0645\u0642\u0628\u0644\u0627\u062A", "items": ["0103001", "0103002", "0103003", "0103004", "0103005", "0103006", "0103007", "0103008", "0103009", "0103010", "0103011", "0103012", "0103013", "0103014", "0103015", "0103016", "0103017", "0103018", "0103019", "0103020", "0103021", "0103022", "0103023", "74", "89"] }, { "name": "\u0627\u0644\u0633\u0627\u0646\u062F\u0648\u062A\u0634\u0627\u062A", "items": ["0104001", "0104002", "0104003", "0104004", "0104005", "0104006", "0104007", "0104008", "0104009", "0104010", "0104011", "0104012", "0104013", "0104014", "0104015", "0104016", "0104017", "0104018", "0104019", "0104020", "0104021", "0104022", "0104023", "0104024", "0104025", "0104026"] }, { "name": "\u0641\u062A\u0629 \u0627\u0644\u062F\u0647\u0627\u0646", "items": ["0105001", "0105002", "0105003", "0105004", "0105005", "0105006", "0105008", "0105009", "0105010", "0105011", "0105012", "350", "650"] }, { "name": "\u0627\u0644\u0637\u0648\u0627\u062C\u0646", "items": ["0106001", "0106002", "0106003", "0106004", "0106005", "0106006", "0106007", "0106008", "0106009", "0106010", "0106011", "0106012", "0106013", "0106014", "0106015", "0106016", "0106017", "0106018", "0106019", "0106020", "0106021", "0106022", "0106023", "0106024", "0106025", "0106026", "0106027"] }, { "name": "\u0645\u0634\u0627\u0648\u0649 \u0627\u0644\u0641\u0631\u0627\u062E", "items": ["0107001", "0107002", "0107003", "0107004", "0107005", "0107006", "0107007", "0107008", "0107009", "0107010", "0107011", "0107012", "0107013", "0107014", "0107015", "0107016", "0107017", "0107018", "0107019", "0107020", "0107021", "0107022", "0107023", "0107024", "0107025"] }, { "name": "\u0645\u0634\u0627\u0648\u0649 \u0627\u0644\u0644\u062D\u0645\u0629", "items": ["0108001", "0108002", "0108003", "0108004", "0108005", "0108006", "0108007", "0108008", "0108009", "0108010", "0108011", "0108012", "0108013", "0108014", "0108015", "0108016", "0108017", "0108018", "0108019", "0108020", "0108021", "0108022", "0108023", "0108024", "0108025", "0108026", "0108027", "0108028", "0108029", "0108030", "0108031", "0108032", "0108033", "0108034", "0108035", "0108036", "0108037", "0108038", "0108039", "0108040", "0108041", "0108042", "0108043", "0108044", "0108045", "0108046", "0108047", "0108048", "0108049", "0108050", "0108051", "0108052", "0108053", "0108054", "0108055", "0108056"] }, { "name": "\u0648\u062C\u0628\u0627\u062A \u0627\u0644\u062F\u0647\u0627\u0646", "items": ["0109001", "0109002", "0109003", "0109004", "0109005", "0109006", "0109007", "0109008", "0109009", "0109010", "0109011", "0109012", "0109013", "0109014", "0109015", "0109016", "0109017", "0109018", "0109019", "0109020", "0109021", "0109022", "0109023", "239"] }, { "name": "\u0648\u062C\u0628\u0627\u062A \u0627\u0644\u0627\u0637\u0641\u0627\u0644", "items": ["0110001", "0110002", "0110003", "0110004", "0110005", "0110006", "0110007", "0110008", "0110009", "0110010", "0110011", "0110012"] }, { "name": "\u0635\u0648\u0627\u0646\u0649 \u0627\u0644\u062F\u0647\u0627\u0646", "items": ["0111001", "0111002", "0111003", "0111004", "0111005", "0111006", "0111007", "0111008", "0111009", "0111010"] }, { "name": "\u0645\u0646\u064A\u0648 \u0632\u0645\u0627\u0646", "items": ["0112001", "0112002", "0112003", "0112004"] }, { "name": "\u062C\u0627\u0647\u0632 \u0644\u0644\u0634\u0648\u0649", "items": ["0113001", "0113002", "0113003", "0113004", "0113005", "0113006", "0113007", "0113008", "0113009", "0113010", "0113011"] }, { "name": "\u0627\u0636\u0627\u0641\u0627\u062A", "items": ["0114001", "0114002", "0114003", "0114004", "0114005", "0114006", "0114007", "0114008"] }, { "name": "\u0639\u0631\u0648\u0636 \u0627\u0644\u0645\u0648\u0642\u0639", "items": ["0115014", "0115016", "0115019", "0117065", "0117066", "0117068"] }, { "name": "\u0639\u0631\u0648\u0636 \u0637\u0644\u0628\u0627\u062A", "items": ["0116001", "0116002", "0116003", "315", "0116004", "218", "111", "0116010"] }, { "name": "\u0639\u0631\u0648\u0636 \u0627\u0644\u0647\u0648\u062A \u0644\u0627\u064A\u0646", "items": ["0117047", "0117048", "0117052", "0117053", "0117058", "0117059", "0117060", "0117061", "0117062", "00", "2200", "235", "260", "260.000", "330", "260.00", "260.0", "261", "262", "263", "264", "265", "266", "197"] }];

// ../sites/lib/marsad/transfer.js
var APEX_ITEM_LIST = Object.entries(APEX_NAMES).map(([no, name]) => ({ no, name, price: APEX_PRICES[no] ?? null }));
var TOKEN_MS2 = 12 * 36e5;
var CLAIM_MS = 10 * 6e4;
var TALABAT_DONE = /* @__PURE__ */ new Set(["CANCELLED", "REJECTED"]);
var SITE_DONE = /* @__PURE__ */ new Set(["cancelled", "failed", "wallet-failed", "refunded"]);
var TALABAT_OUT = /* @__PURE__ */ new Set(["PICKED_UP", "PICKED UP", "IN_DELIVERY", "IN DELIVERY", "DELIVERED", "COMPLETED"]);
function payWord(v) {
  const t = String(v || "").trim();
  const cash = /\bcash\b|كاش|نقد[اًي]?|الدفع عند الاستلام/i.test(t), paid = /\bonline\b|\bpaid\b|card|wallet|apple pay|مدفوع|بطاقة|محفظة|أونلاين/i.test(t);
  return cash && !paid ? "cash" : paid && !cash ? "paid" : null;
}
__name(payWord, "payWord");
var amountOf = /* @__PURE__ */ __name((t) => {
  const m = String(t || "").replace(/[٠-٩]/g, (d) => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d)).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}, "amountOf");
function talabatPayment(bill, liveBadge) {
  const rows = bill || [];
  const text = rows.map((x) => String(x.text || "")).join("\n");
  const online = /\bONLINE\b|تم الدفع بواسطة|paid by|CREDIT_CARD|DEBIT_CARD|WALLET/i.test(text);
  const cash = /\bCASH|cash on delivery|الدفع عند الاستلام|نقد(?:ي|ا)?\b|كاش/i.test(text.replace(/cash to collect|التحصيل من العميل[^\n]*/gi, ""));
  if (online && !cash) return "paid";
  if (cash && !online) return "cash";
  if (cash && online) return "mixed";
  const line = rows.find((x) => /^(?:payment method|payment|طريقة الدفع)$/i.test(String(x.k || "").trim()));
  const fromBill = line ? payWord(String(line.text).split(" | ").slice(1).join(" | ")) : null;
  return fromBill || payWord(liveBadge) || null;
}
__name(talabatPayment, "talabatPayment");
function sitePayment(p) {
  if (!p?.method) return null;
  if (p.method === "cod") return "cash";
  return p.paid ? "paid" : "unpaid";
}
__name(sitePayment, "sitePayment");
var AMOUNT = /(-?\s*(?:E£|EGP|£E|ج\.م)?\s*-?\d[\d,]*(?:\.\d+)?)/;
var DISC_WORDS = /discount|voucher|promo|coupon|خصم|قسيمة|كوبون|ممول|funded/i;
var discountWho = /* @__PURE__ */ __name((t) => /(talabat|platform|طلبات)[\s-]*(funded|ممول)|funded by talabat|(?:ممول|مدعوم|على حساب)\s*(?:من\s*)?(?:قبل\s*)?(?:طلبات|talabat)/i.test(t) ? "platform" : /(vendor|restaurant|المطعم)[\s-]*(funded|ممول)|funded by (?:the )?(?:vendor|restaurant)|(?:ممول|مدعوم|على حساب)\s*(?:من\s*)?(?:المطعم|الشريك)|ممول\s*من\s*قبلك|funded by you/i.test(t) ? "restaurant" : null, "discountWho");
function talabatDiscounts(bill) {
  const out = [];
  for (const x of bill || []) {
    const t = x.k + " " + x.text;
    if (!/discount|voucher|promo|coupon|خصم|قسيمة|كوبون/i.test(t)) continue;
    const m = String(x.text).match(AMOUNT), amount = m ? Math.abs(Number(m[1].replace(/[^\d.]/g, ""))) || null : null;
    out.push({ text: x.text, amount, who: discountWho(t) || "platform" });
  }
  return out;
}
__name(talabatDiscounts, "talabatDiscounts");
var phoneOut = /* @__PURE__ */ __name((p) => p ? /^1\d{9}$/.test(String(p)) ? "0" + p : String(p) : null, "phoneOut");
var WEIGHTS = [
  [/quarter|1\/4|ربع/i, /1\/4|ربع/, "\u0631\u0628\u0639 \u0643\u064A\u0644\u0648"],
  [/third|1\/3|ثلث|تلت/i, /1\/3|ثلث|تلت/, "\u062A\u0644\u062A \u0643\u064A\u0644\u0648"],
  [/half|1\/2|نص|نصف/i, /1\/2|نص/, "\u0646\u0635 \u0643\u064A\u0644\u0648"],
  [/^\s*(?:1\s*)?(?:kilo|kg|كيلو)(?:\s|$)/i, /^\s*(?:ك|كيلو)\s/, "\u0643\u064A\u0644\u0648"]
];
var APEX_BRANCHES = [{ no: 1, name: "\u0627\u0644\u062A\u062C\u0645\u0639" }, { no: 2, name: "\u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631" }, { no: 3, name: "\u0645\u062F\u064A\u0646\u062A\u0649" }];
function apexBranchOf(name) {
  const t = String(canonicalStore(name) || "").replace(/[أإآ]/g, "\u0627").replace(/ى/g, "\u064A");
  const hits = [/التجمع/.test(t) && 1, /(مدينة نصر|سيتي ستار|مكرم)/.test(t) && 2, /مدينتي/.test(t) && 3].filter(Boolean);
  return hits.length === 1 ? hits[0] : null;
}
__name(apexBranchOf, "apexBranchOf");
function setup22(app2) {
  const { db, fail: fail2 } = app2;
  const queueCache = /* @__PURE__ */ new Map(), QUEUE_CACHE_MS = 8e3;
  function plainError(e) {
    const t = String(e || "").replace(/^Exception calling "\w+" with "\d+" argument\(s\): /, "").replace(/^"|"$/g, "");
    const M = [
      [/no delivery charge known/i, "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0645\u0644\u0647\u0627\u0634 \u0633\u0639\u0631 \u062A\u0648\u0635\u064A\u0644 \u0639\u0644\u0649 Apex"],
      [/not in Apex/i, "\u0641\u064A\u0647 \u0635\u0646\u0641 \u0645\u0634 \u0645\u0648\u062C\u0648\u062F \u0639\u0644\u0649 Apex"],
      [/stopped on Apex/i, "\u0641\u064A\u0647 \u0635\u0646\u0641 \u0645\u0648\u0642\u0648\u0641 \u0639\u0644\u0649 Apex"],
      [/no price on Apex/i, "\u0641\u064A\u0647 \u0635\u0646\u0641 \u0645\u0644\u0648\u0634 \u0633\u0639\u0631 \u0623\u0648\u0646\u0644\u0627\u064A\u0646 \u0639\u0644\u0649 Apex"],
      [/business day is not open|no open day/i, "\u064A\u0648\u0645 Apex \u0644\u0633\u0647 \u0645\u0627 \u0627\u062A\u0641\u062A\u062D\u0634"],
      [/later day is open|stale/i, "Apex \u0641\u0627\u062A\u062D \u064A\u0648\u0645 \u062A\u0627\u0646\u064A"],
      [/timed out|Unable to connect|remote name|connection/i, "Apex \u0645\u0634 \u0628\u064A\u0631\u062F"],
      [/truncated/i, "\u0643\u0644\u0627\u0645 \u0623\u0637\u0648\u0644 \u0645\u0646 \u062E\u0627\u0646\u0629 \u0639\u0644\u0649 Apex"],
      [/overflow/i, "\u0631\u0642\u0645 \u0645\u0634 \u0645\u0638\u0628\u0648\u0637 \u0641\u064A \u0627\u0644\u0623\u0648\u0631\u062F\u0631"]
    ];
    for (const [re, msg] of M) if (re.test(t)) return msg;
    return /[\u0600-\u06ff]/.test(t) ? t.slice(0, 120) : "\u0645\u0634\u0643\u0644\u0629 \u0639\u0644\u0649 Apex";
  }
  __name(plainError, "plainError");
  async function transferAlert(key2, payload, source, ref2, why, now) {
    const c = await db.prepare("SELECT rules FROM telegram_config WHERE id = 1").get();
    const rules = parseJson(c?.rules, {});
    if (rules.transferFailed === false) return;
    const branch = APEX_BRANCHES.find((b) => b.no === Number(payload.branchNo))?.name;
    const text = "\u{1F534} \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0622\u0644\u064A | " + (source === "talabat" ? "\u0637\u0644\u0628\u0627\u062A" : "\u0627\u0644\u0645\u0648\u0642\u0639") + " " + (payload.code ? "#" + payload.code : ref2) + (branch ? " \u2014 " + branch : "") + "\n" + why + (payload.by ? "\n\u0628\u0639\u062A\u0647: " + payload.by : "") + "\n\u0633\u062C\u0651\u0644\u0647 \u0639\u0644\u0649 Apex \u0628\u0625\u064A\u062F\u0643 \u062F\u0644\u0648\u0642\u062A\u064A (\u0628\u0627\u0644\u0643\u0648\u062F \u0641\u064A \u062E\u0627\u0646\u0629 \u0627\u0644\u0627\u0633\u0645)";
    await db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target) VALUES (?, 'transferFailed', NULL, ?, ?, NULL, 'online')").run(key2, text, now);
  }
  __name(transferAlert, "transferAlert");
  let lastStuck = 0;
  app2.afterRequest(async (now) => {
    if (now - lastStuck < 6e4) return;
    lastStuck = now;
    const rows = await db.prepare("SELECT source, ref, at, payload FROM transfer_jobs WHERE state IN ('auto_pending', 'auto_sending') AND at < ? AND at > ?").all(now - 3 * 6e4, now - 6 * 36e5);
    for (const j of rows) {
      const p = parseJson(j.payload, {});
      if (p.db !== "live") continue;
      await transferAlert("transfer:stuck:" + j.source + ":" + j.ref, p, j.source, j.ref, "\u0645\u0633\u062A\u0646\u064A \u0645\u0646 " + Math.round((now - j.at) / 6e4) + " \u062F\u0642\u064A\u0642\u0629 \u0648\u0643\u0627\u062A\u0628 Apex \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 \u0627\u0644\u0643\u0627\u0634\u064A\u0631 \u0645\u0627\u0631\u062F", now);
    }
  });
  app2.route("POST", "/api/transfer/login", async (ctx) => {
    const pin = typeof ctx.body.pin === "string" ? ctx.body.pin.trim().replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 1632).replace(/[\u06F0-\u06F9]/g, (d) => d.charCodeAt(0) - 1776) : ctx.body.pin, key2 = "transfer|" + ctx.ip;
    if (typeof pin !== "string" || !/^\d{1,32}$/.test(pin)) fail2(400, "\u0627\u0643\u062A\u0628 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0633\u0631\u064A");
    if (app2.limiters.employeeLogin.blocked(key2, ctx.now)) fail2(429, "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629\u061B \u0627\u0646\u062A\u0638\u0631 15 \u062F\u0642\u064A\u0642\u0629");
    const e = await app2.employeeByPin(pin);
    if (!e || !e.active) {
      app2.limiters.employeeLogin.fail(key2, ctx.now);
      fail2(401, "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0633\u0631\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    }
    app2.limiters.employeeLogin.reset(key2);
    return { token: app2.signer.sign({ k: "transfer", eid: e.id, exp: ctx.now + TOKEN_MS2 }), employee: { id: e.id, name: e.name } };
  });
  async function who(ctx) {
    const c = app2.signer.verify(ctx.header("x-transfer-session"));
    if (c && c.k === "transfer" && Number.isInteger(c.eid) && c.exp > ctx.now) {
      const e = await db.prepare("SELECT id, name, active, deleted_at FROM employees WHERE id = ?").get(c.eid);
      if (e && e.active && !e.deleted_at) return { id: e.id, name: e.name, staff: true };
    }
    if (ctx.header("x-admin-password")) {
      const a = await app2.requireAdmin(ctx, "write");
      return { id: null, name: a.name, staff: false };
    }
    fail2(401, "\u0633\u062C\u0644 \u062F\u062E\u0648\u0644 \u062A\u0627\u0646\u064A");
  }
  __name(who, "who");
  app2.route("GET", "/api/transfer/queue", async (ctx) => {
    const me = await who(ctx);
    const day = validDate(String(ctx.query.day || "")) ? ctx.query.day : businessDay(ctx.now);
    const base = await baseFor(day, ctx.now, { allowStale: true });
    const snap = { locations: base.locations };
    const jobs = new Map((await db.prepare("SELECT * FROM transfer_jobs WHERE day = ?").all(day)).map((j) => [j.source + ":" + j.ref, j]));
    const customerNotes = new Map((await db.prepare("SELECT source, ref, cust_no, note, status, checked_at, phone_hash FROM apex_customer_notes WHERE day = ?").all(day)).map((n) => [
      n.source + ":" + n.ref,
      { custNo: n.cust_no, status: n.status, checkedAt: iso(n.checked_at), phone_hash: n.phone_hash, ...parseApexCustomerNote(n.note) }
    ]));
    const jobOf = /* @__PURE__ */ __name((source, ref2) => {
      const j = jobs.get(source + ":" + ref2);
      if (!j) return null;
      const stale = j.state === "claimed" && ctx.now - j.at > CLAIM_MS;
      return stale ? null : { state: j.state, by: j.employee_name, mine: me.staff && j.employee_id === me.id, payment: j.payment, note: j.note, at: iso(j.at), result: parseJson(j.result, null) };
    }, "jobOf");
    const liveNow = parseJson((await db.prepare("SELECT value FROM settings WHERE key = 'talabat_live_now'").get())?.value, {});
    const onLive = /* @__PURE__ */ __name((id2) => ctx.now - (liveNow[id2] || 0) < 3 * 6e4, "onLive");
    const slim = /* @__PURE__ */ __name((o) => ({ source: o.source, ref: o.ref, code: o.code, at: o.at, status: o.status, out: o.out, branch: o.branch, apexBranch: o.apexBranch, total: o.total, apex: o.apex, done: true }), "slim");
    const list = base.list.map((o) => {
      const note = customerNotes.get(o.source + ":" + o.ref);
      const linked = note && note.phone_hash === sha256(deliveryPhone(o.customer?.phone) || "");
      return {
        ...o.apex || o.out ? slim(o) : o,
        ...o.source === "talabat" ? { onLive: onLive(o.ref) } : {},
        job: jobOf(o.source, o.source === "site" ? String(o.ref) : o.ref),
        apexCustomerNote: linked ? { custNo: note.custNo, status: note.status, checkedAt: note.checkedAt, text: note.text, directives: note.directives, other: note.other, oneTime: note.oneTime, permanent: note.permanent, requiresReview: note.requiresReview, unrecognized: note.unrecognized } : { status: "pending" }
      };
    });
    if (app2.toArabic) {
      const open = list.filter((o) => !o.done), texts2 = [];
      for (const o of open) texts2.push(o.customer?.name, o.customer?.address, o.customer?.area, o.note, ...(o.items || []).flatMap((i) => [i.note, ...i.freeOptions || []]));
      const ar2 = await app2.toArabic(texts2.filter(Boolean), { waitUntil: ctx.waitUntil }).catch(() => /* @__PURE__ */ new Map());
      const tr = /* @__PURE__ */ __name((v) => v && ar2.get(v) || v, "tr"), changed = /* @__PURE__ */ __name((v) => v && ar2.get(v) && ar2.get(v) !== v, "changed");
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.done) continue;
        const c = o.customer;
        list[i] = {
          ...o,
          ...c ? { customer: { ...c, name: tr(c.name), address: tr(c.address), area: tr(c.area), ...changed(c.address) || changed(c.name) ? { original: [c.name, c.address].filter(Boolean).join(" \u2014 ") } : {} } } : {},
          ...changed(o.note) ? { note: tr(o.note), noteOriginal: o.note } : {},
          ...o.items ? { items: o.items.map((x) => ({ ...x, note: tr(x.note), freeOptions: (x.freeOptions || []).map(tr) })) } : {}
        };
      }
    }
    const mode = (await db.prepare("SELECT value FROM settings WHERE key = 'apex_bridge_mode'").get())?.value || "shadow";
    const locations = (Array.isArray(snap.locations) ? snap.locations : []).filter((l) => Number.isInteger(l?.no)).map((l) => ({ no: l.no, name: String(l.name || ""), branch: l.branch ?? null, service: l.service ?? null }));
    const items = mode && mode !== "off" ? APEX_ITEM_LIST : [];
    const sections = items.length ? APEX_SECTIONS.map((x) => ({ name: x.name, items: x.items.filter((no) => APEX_NAMES[no]) })).filter((x) => x.items.length) : [];
    const staticKey = "s" + sections.length + ":" + items.length + ":" + locations.length + ":" + locations.reduce((a, l) => a + l.no * (l.branch || 1) + (Number(l.service) || 0), 0).toFixed(2);
    const fresh = String(ctx.query.have || "") !== staticKey;
    return {
      day,
      me: { name: me.name, staff: me.staff },
      serverNow: iso(ctx.now),
      stale: base.stale === true,
      liveScreen: ctx.now - (liveNow._screen || 0) < 3 * 6e4,
      autoTransfer: mode,
      branches: APEX_BRANCHES,
      staticKey,
      ...fresh ? { locations, apexItems: items, sections } : {},
      orders: list
    };
  });
  const st = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ __name((day) => st.get(day) || (st.set(day, { dirty: false, run: null }), st.get(day)), "S");
  function rebuild(day) {
    const x = S(day);
    if (db.kind !== "d1" && x.run) return x.run;
    const run = (async () => {
      let base, passes = 0;
      do {
        x.dirty = false;
        base = await buildBase(day, app2.now());
        queueCache.set(day, base);
      } while (x.dirty && ++passes < 2);
      const keep = { at: base.at, locations: base.locations, list: base.list.map((o) => o.apex || o.out ? { source: o.source, ref: o.ref, code: o.code, at: o.at, status: o.status, out: o.out, branch: o.branch, apexBranch: o.apexBranch, total: o.total, apex: o.apex } : o) };
      await db.prepare("INSERT INTO transfer_cache (day, at, data) VALUES (?,?,?) ON CONFLICT(day) DO UPDATE SET at = excluded.at, data = excluded.data").run(day, base.at, JSON.stringify(keep)).catch(() => {
      });
      return base;
    })().finally(() => {
      if (x.run === run) x.run = null;
    });
    if (db.kind !== "d1") x.run = run;
    return run;
  }
  __name(rebuild, "rebuild");
  async function baseFor(day, now, { allowStale = false } = {}) {
    const x = S(day);
    if (db.kind !== "d1" && x.run) return x.run;
    const b = queueCache.get(day);
    if (b && !x.dirty && now - b.at < QUEUE_CACHE_MS) return b;
    const r = await db.prepare("SELECT at, data FROM transfer_cache WHERE day = ?").get(day);
    if (!x.dirty && r && r.at > (b?.at || 0) && now - r.at < QUEUE_CACHE_MS) {
      const d = parseJson(r.data, null);
      if (d) {
        queueCache.set(day, d);
        x.dirty = false;
        return d;
      }
    }
    try {
      return await rebuild(day);
    } catch (error3) {
      if (allowStale) {
        const persisted = r && parseJson(r.data, null);
        const saved = persisted?.at > (b?.at || 0) ? persisted : b || persisted;
        if (saved && Array.isArray(saved.list) && Number.isFinite(saved.at) && now - saved.at <= 15 * 6e4)
          return { ...saved, stale: true };
      }
      throw error3;
    }
  }
  __name(baseFor, "baseFor");
  app2.afterRequest((now, method, path) => {
    if (method !== "POST") return;
    const day = businessDay(now), x = S(day);
    if (/^\/api\/(?:apex-writer\/result|transfer\/(?:job|selection))$/.test(path || "")) {
      x.dirty = true;
      return rebuild(day).catch(() => {
      });
    }
    if (/^\/api\/(?:talabat|orders|site)\/push$/.test(path || "")) {
      const b = queueCache.get(day);
      if (b && now - b.at >= 0 && now - b.at < QUEUE_CACHE_MS) return;
      if (db.kind !== "d1" && x.run) {
        x.dirty = true;
        return;
      }
      return db.prepare("SELECT at FROM transfer_cache WHERE day = ?").get(day).then((r) => {
        if (r && now - r.at >= 0 && now - r.at < QUEUE_CACHE_MS) return;
        x.dirty = true;
        return rebuild(day);
      }).catch(() => {
      });
    }
  });
  async function buildBase(day, now) {
    {
      const snap = parseJson((await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day))?.data, {});
      const apexName = new Map(Object.entries(APEX_NAMES));
      for (const a of [...snap.online || [], ...snap.orders || []]) for (const i of a.items || []) if (i?.no && i?.name) apexName.set(String(i.no).trim(), i.name);
      const learned = /* @__PURE__ */ new Map();
      if (app2.learn) for (const [n, m] of await app2.learn.pairs("match-v2:item:talabat")) {
        const ok = new Map([...m].filter(([, c]) => c >= 2));
        if (ok.size) learned.set(n, ok);
      }
      const arKey = /* @__PURE__ */ __name((v) => String(v || "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/[ًٌٍَُِّْ]/g, "").replace(/\s+/g, " ").trim(), "arKey");
      const suggest = /* @__PURE__ */ __name((...names) => {
        for (const n of names.filter(Boolean)) {
          const k = knownNos(n, learned);
          if (k.length) return k;
        }
        for (const n of names.filter((n2) => /[\u0600-\u06ff]/.test(n2 || ""))) {
          const want = arKey(n), exact = [...apexName].filter(([, nm]) => arKey(nm) === want).map(([no]) => no);
          if (exact.length) return exact;
          const part = [...apexName].filter(([, nm]) => arKey(nm).includes(want)).map(([no]) => no);
          if (part.length === 1) return part;
        }
        return [];
      }, "suggest");
      const itemOut = /* @__PURE__ */ __name((x, withApex) => {
        let apex = (withApex ? suggest(x.name, x.nameShown) : []).map((no) => ({ no, name: apexName.get(no) || null }));
        const size = WEIGHTS.find((w) => (x.options || []).some((o) => w[0].test(o.name)) || (x.modifiers || []).some((m) => w[0].test(m)));
        const sized = size ? apex.filter((a) => a.name && size[1].test(a.name)) : [];
        if (sized.length) apex = sized;
        const isDisc = /* @__PURE__ */ __name((o) => Number(o.price) < 0 || DISC_WORDS.test(o.name), "isDisc");
        const amountOf2 = /* @__PURE__ */ __name((t) => {
          const m = String(t).match(AMOUNT);
          return m ? Math.abs(Number(m[1].replace(/[^\d.]/g, ""))) || null : null;
        }, "amountOf");
        const found = [
          ...(Array.isArray(x.options) ? x.options : []).filter(isDisc).map((o) => ({ label: o.name, amount: o.price != null ? Math.abs(Number(o.price)) : null })),
          ...(x.discountLines || []).map((t) => ({ label: String(t).split("|")[0].trim(), amount: String(t).includes("|") ? amountOf2(String(t).split("|").slice(1).join("|")) : null }))
        ];
        const funded = found.filter((d) => discountWho(d.label) && d.amount);
        const top = found.filter((d) => d.amount).sort((a, b) => b.amount - a.amount)[0];
        const fundedOk = funded.length && (!top || Math.abs(funded.reduce((a, d) => a + d.amount, 0) - top.amount) < 0.05 || funded.some((d) => d.amount === top.amount));
        if (funded.length && !fundedOk) funded.forEach((d) => {
          d.unclear = true;
        });
        const itemDiscounts = funded.length && !fundedOk ? [{ text: (top?.label || "\u062E\u0635\u0645") + " \u2014 " + x.name + " (\u0627\u0644\u062A\u0642\u0633\u064A\u0645 \u0645\u0634 \u0648\u0627\u0636\u062D)", amount: top?.amount ?? null, who: null }] : funded.length ? [...new Map(funded.map((d) => [discountWho(d.label) + d.amount, { text: d.label + " \u2014 " + x.name, amount: d.amount, who: discountWho(d.label) }])).values()] : top ? [{ text: top.label + " \u2014 " + x.name, amount: top.amount, who: "restaurant" }] : found.length ? [{ text: found[0].label + " \u2014 " + x.name, amount: null, who: "restaurant" }] : [];
        const opts = (Array.isArray(x.options) ? x.options : []).filter((o) => !isDisc(o));
        const sizeOpt = opts.find((o) => WEIGHTS.some((w) => w[0].test(o.name))) || null;
        const addons = opts.filter((o) => o !== sizeOpt && Number(o.price) > 0).map((o) => ({
          name: o.name,
          qty: Number(o.qty) > 0 ? Number(o.qty) : null,
          price: Number(o.price),
          // the count shown is for all the dishes together
          apex: (withApex ? suggest(o.name) : []).map((no) => ({ no, name: apexName.get(no) || null }))
        }));
        const free = opts.filter((o) => o !== sizeOpt && !(Number(o.price) > 0)).map((o) => (Number(o.qty) > 1 ? o.qty + "\xD7 " : "") + o.name);
        return {
          qty: x.qty,
          name: x.name,
          price: x.price ?? null,
          modifiers: x.modifiers || [],
          modifiersComplete: x.modifierComplete === true || !withApex,
          size: size ? size[2] : null,
          apex,
          // The size picks the Apex item itself (ربع كيلو نيفة): it is neither an add-on nor a comment.
          addons,
          sizeOption: sizeOpt ? sizeOpt.name : null,
          freeOptions: opts.length ? free : (x.modifiers || []).filter((m) => !WEIGHTS.some((w) => w[0].test(m)) && !DISC_WORDS.test(m)),
          itemDiscounts
        };
      }, "itemOut");
      const list = [];
      const tm = app2.talabat ? await app2.talabat.matchDay(day) : { rows: [], matches: /* @__PURE__ */ new Map(), states: /* @__PURE__ */ new Map() };
      const tProfiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'talabat' AND ref IN (SELECT id FROM talabat_orders WHERE day = ?)").all(day)).map((x) => [x.ref, parseJson(x.data, {})]));
      for (const o of tm.rows) {
        if (TALABAT_DONE.has(o.status)) continue;
        const p = tProfiles.get(o.id) || {}, a = tm.matches.get(o.id), bill = p.bill || [];
        const items = parseJson(o.items, []).map((x) => itemOut(x, true));
        const dishDiscounts = items.flatMap((i) => i.itemDiscounts || []), dishTotal = dishDiscounts.reduce((a2, d) => a2 + (Number(d.amount) || 0), 0);
        const billDiscounts = talabatDiscounts(bill).filter((d) => !(dishTotal > 0 && d.amount != null && Math.abs(d.amount - dishTotal) < 0.01 && !/(talabat|طلبات)/i.test(d.text)));
        const discounts = [...dishDiscounts, ...billDiscounts];
        list.push({
          source: "talabat",
          ref: o.id,
          code: o.code || null,
          at: iso(o.accepted_at || o.received_at || o.placed_at),
          status: o.status,
          out: TALABAT_OUT.has(String(o.status || "").toUpperCase()) || !!o.picked_up_at || !!o.delivered_at,
          branch: o.store,
          apexBranch: apexBranchOf(o.store),
          deliveryType: o.delivery_type || null,
          customer: { name: /^(?:information|details|customer|العميل)$/i.test(p.name || "") ? null : p.name || null, phone: phoneOut(p.phoneDisplay || p.phone || p.mobileDisplay || p.mobile), address: p.address || null },
          // What Apex must total (Karim 31-10): the bill's «مجموع» (what the customer pays) plus Talabat's share of the discounts
          // (not deducted on Apex). The writer discounts any amount Apex comes out above it.
          target: (() => {
            const t = bill.find((x) => /^(?:مجموع|المجموع|الإجمالي|total|order total)$/i.test(String(x.k || "").trim())), v = t ? amountOf(String(t.text).split(" | ").slice(1).join(" ")) : o.total ?? null;
            return v == null ? null : Math.round((v + discounts.filter((d) => d.who === "platform").reduce((a2, d) => a2 + (Number(d.amount) || 0), 0)) * 100) / 100;
          })(),
          note: (bill.find((x) => x.k === "\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0639\u0645\u064A\u0644")?.text || "").split(" | ").slice(1).join(" | ") || null,
          payment: talabatPayment(bill, p.livePay),
          bill,
          discounts,
          subtotal: o.subtotal ?? null,
          total: o.total ?? null,
          items,
          detailRead: !!o.detail_at,
          apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null,
          matching: tm.states.get(o.id) || null,
          job: null
        });
      }
      const sRows = await db.prepare("SELECT * FROM site_orders WHERE day = ?").all(day);
      const sm = app2.site && sRows.length ? await app2.site.apexMatch(day, sRows) : { matches: /* @__PURE__ */ new Map(), states: /* @__PURE__ */ new Map() };
      const sProfiles = new Map((await db.prepare("SELECT ref, data FROM match_profiles WHERE source = 'site' AND ref IN (SELECT CAST(id AS TEXT) FROM site_orders WHERE day = ?)").all(day)).map((x) => [x.ref, parseJson(x.data, {})]));
      for (const o of sRows) {
        if (SITE_DONE.has(o.status)) continue;
        const p = sProfiles.get(String(o.id)) || {}, pay = p.payment || null, a = sm.matches.get(o.id);
        const discounts = pay ? [
          ...(pay.coupons || []).map((c) => ({ text: "\u0643\u0648\u0628\u0648\u0646 " + c.code, amount: c.amount, who: "restaurant" })),
          ...!pay.coupons?.length && pay.discount ? [{ text: "\u062E\u0635\u0645 \u0627\u0644\u0645\u0648\u0642\u0639", amount: pay.discount, who: "restaurant" }] : []
        ] : [];
        list.push({
          source: "site",
          ref: String(o.id),
          code: String(o.id),
          at: iso(o.created_at),
          status: o.status,
          out: !!o.out_at || !!o.delivered_at || o.status === "completed",
          branch: o.branch || null,
          apexBranch: apexBranchOf(o.branch),
          scheduled: !!o.scheduled,
          customer: { name: p.customer?.name || null, phone: phoneOut(p.customer?.phoneDisplay || p.customer?.phone || p.customer?.mobileDisplay || p.customer?.mobile), address: p.customer?.address || null },
          target: o.total ?? null,
          payment: sitePayment(pay),
          paymentTitle: pay?.title || null,
          note: pay?.note || null,
          discounts,
          fees: pay?.fees || [],
          shipping: pay?.shipping ?? null,
          total: o.total ?? null,
          items: (p.items || []).map((x) => itemOut(x, false)),
          detailRead: !!p.items?.length,
          apex: a ? { no: a.no, sn: a.sn ?? null, user: a.user || null, how: a.how || null } : null,
          matching: sm.states?.get(o.id) || null,
          job: null
        });
      }
      const manual = /* @__PURE__ */ new Map();
      for (const r of await db.prepare("SELECT DISTINCT a,b FROM learned WHERE kind = 'transfer-item-choice'").all()) {
        if (!manual.has(r.a)) manual.set(r.a, /* @__PURE__ */ new Map());
        manual.get(r.a).set(r.b, 1);
      }
      for (const order of list) for (const item of order.items) {
        const lines = [[item, "item", ""], ...(item.addons || []).map((a) => [a, "addon", item.name])];
        for (const [line, kind, parent] of lines) {
          line.choiceKey = sha256(JSON.stringify([order.source, kind, parent, line.name, item.sizeOption || ""]));
          const choices = [...manual.get(line.choiceKey)?.keys() || []].filter((no) => apexName.has(no));
          if (choices.length) line.apex = choices.map((no) => ({ no, name: apexName.get(no) }));
        }
      }
      list.sort((x, y) => (x.apex ? 1 : 0) - (y.apex ? 1 : 0) || String(x.at || "").localeCompare(String(y.at || "")));
      return { at: now, list, locations: Array.isArray(snap.locations) ? snap.locations : [] };
    }
  }
  __name(buildBase, "buildBase");
  app2.route("POST", "/api/transfer/selection", async (ctx) => {
    const me = await who(ctx), b = ctx.body;
    const source = ["talabat", "site"].includes(b.source) ? b.source : null, ref2 = String(b.ref || "");
    if (!source || !/^\d{1,20}$/.test(ref2)) fail2(400, "\u0623\u0648\u0631\u062F\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const row = await db.prepare(source === "talabat" ? "SELECT day FROM talabat_orders WHERE id = ?" : "SELECT day FROM site_orders WHERE id = ?").get(ref2);
    if (!row) fail2(404, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0634 \u0645\u0648\u062C\u0648\u062F");
    const job = await db.prepare("SELECT * FROM transfer_jobs WHERE source = ? AND ref = ?").get(source, ref2);
    if (job && !["released", "auto_failed", "auto_preview"].includes(job.state) && !(job.state === "claimed" && ctx.now - job.at > CLAIM_MS) && (job.employee_id !== me.id || job.state !== "claimed")) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u062D\u062C\u0648\u0632 \u0623\u0648 \u0627\u062A\u0628\u0639\u062A \u0628\u0627\u0644\u0641\u0639\u0644");
    const order = (await baseFor(row.day, ctx.now)).list.find((o) => o.source === source && String(o.ref) === ref2);
    if (!order || order.apex || order.out) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0634 \u0645\u062A\u0627\u062D \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631");
    const lines = order.items.flatMap((i) => [i, ...i.addons || []]);
    const line = Number.isInteger(b.line) ? lines[b.line] : null, itemNo = String(b.itemNo || "");
    if (!line || line.choiceKey !== b.choiceKey) fail2(409, "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u063A\u064A\u0631\u062A \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629");
    if (!APEX_NAMES[itemNo]) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0635\u0646\u0641 \u0645\u0648\u062C\u0648\u062F \u0639\u0644\u0649 Apex");
    const evidence = source + ":" + ref2 + ":" + b.line;
    await db.batch([
      db.prepare("DELETE FROM learned WHERE kind = 'transfer-item-choice' AND a = ? AND ref = ?").bind(line.choiceKey, evidence),
      db.prepare("INSERT INTO learned (kind,a,b,ref,value,at) VALUES ('transfer-item-choice',?,?,?,?,?)").bind(line.choiceKey, itemNo, evidence, me.name, ctx.now)
    ]);
    await app2.audit("transfer_item_selected", me.staff ? me.id : null, { actor: me.name, source, ref: ref2, line: b.line + 1, sourceItem: line.name, itemNo, itemName: APEX_NAMES[itemNo] });
    S(row.day).dirty = true;
    return { ok: true };
  });
  app2.route("POST", "/api/transfer/job", async (ctx) => {
    const me = await who(ctx);
    const b = ctx.body, source = b.source === "talabat" || b.source === "site" ? b.source : null, ref2 = String(b.ref || "").slice(0, 40);
    if (!source || !/^\d{1,20}$/.test(ref2)) fail2(400, "\u0623\u0648\u0631\u062F\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const row = source === "talabat" ? await db.prepare("SELECT day FROM talabat_orders WHERE id = ?").get(ref2) : await db.prepare("SELECT day FROM site_orders WHERE id = ?").get(Number(ref2));
    if (!row) fail2(404, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0634 \u0645\u0648\u062C\u0648\u062F");
    const payment = ["cash", "paid"].includes(b.payment) ? b.payment : null, note = b.note ? String(b.note).slice(0, 300) : null;
    const cur = await db.prepare("SELECT * FROM transfer_jobs WHERE source = ? AND ref = ?").get(source, ref2);
    const free = !cur || ["released", "auto_failed", "auto_preview"].includes(cur.state) || cur.state === "claimed" && ctx.now - cur.at > CLAIM_MS;
    const othersClaim = !free && cur.employee_id !== me.id;
    if (cur && (/^auto_(?:sending|done)$/.test(cur.state) || cur.state === "auto_pending" && b.action !== "release")) fail2(409, cur.state === "auto_done" ? "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0633\u062C\u0644 \u0639\u0644\u0649 Apex \u0628\u0627\u0644\u0641\u0639\u0644 (\u0622\u0644\u064A)" : "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0628\u064A\u062A\u0633\u062C\u0644 \u0639\u0644\u0649 Apex \u062F\u0644\u0648\u0642\u062A\u064A");
    if (b.action === "claim") {
      if (othersClaim) fail2(409, (cur.employee_name || "\u062D\u062F \u062A\u0627\u0646\u064A") + (cur.state === "entered" ? " \u0633\u062C\u0644\u0647 \u0628\u0627\u0644\u0641\u0639\u0644" : " \u0634\u063A\u0627\u0644 \u0639\u0644\u064A\u0647 \u062F\u0644\u0648\u0642\u062A\u064A"));
      const r = await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at) VALUES (?,?,?,'claimed',?,?,?,?,?)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'claimed', employee_id = excluded.employee_id, employee_name = excluded.employee_name, at = excluded.at
        WHERE transfer_jobs.state IN ('released', 'auto_failed', 'auto_preview') OR (transfer_jobs.employee_id IS excluded.employee_id AND transfer_jobs.state = 'claimed') OR (transfer_jobs.state = 'claimed' AND transfer_jobs.at < ?)`).run(source, ref2, row.day, me.id, me.name, payment, note, ctx.now, ctx.now - CLAIM_MS);
      if (!r.changes) fail2(409, "\u062D\u062F \u062A\u0627\u0646\u064A \u0644\u0633\u0647 \u0645\u0627\u0633\u0643\u0647");
    } else if (b.action === "entered") {
      if (othersClaim) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0639 " + (cur.employee_name || "\u062D\u062F \u062A\u0627\u0646\u064A"));
      if (!payment) fail2(400, "\u062D\u062F\u062F: \u0643\u0627\u0634 \u0648\u0644\u0627 \u0645\u062F\u0641\u0648\u0639");
      await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at) VALUES (?,?,?,'entered',?,?,?,?,?)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'entered', employee_id = excluded.employee_id, employee_name = excluded.employee_name, payment = excluded.payment, note = excluded.note, at = excluded.at`).run(source, ref2, row.day, me.id, me.name, payment, note, ctx.now);
    } else if (b.action === "release") {
      if (othersClaim) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0639 " + (cur.employee_name || "\u062D\u062F \u062A\u0627\u0646\u064A"));
      await db.prepare("UPDATE transfer_jobs SET state = 'released', at = ? WHERE source = ? AND ref = ?").run(ctx.now, source, ref2);
    } else if (b.action === "auto") {
      const mode = await setting("apex_bridge_mode") || "shadow";
      if (!["shadow", "test", "live"].includes(mode)) fail2(409, "\u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0622\u0644\u064A \u0645\u0642\u0641\u0648\u0644 \u2014 \u0633\u062C\u0651\u0644 \u0639\u0644\u0649 Apex \u0628\u0625\u064A\u062F\u0643");
      if (othersClaim) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0639 " + (cur.employee_name || "\u062D\u062F \u062A\u0627\u0646\u064A"));
      if (cur && /^auto_(?:pending|sending|done|preview)$/.test(cur.state)) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0627\u062A\u0628\u0639\u062A \u0644\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0622\u0644\u064A \u0628\u0627\u0644\u0641\u0639\u0644");
      if (payment !== "cash" && payment !== "paid") fail2(400, "\u062D\u062F\u062F: \u0643\u0627\u0634 \u0648\u0644\u0627 \u0645\u062F\u0641\u0648\u0639");
      const branchNo = Number(b.branchNo);
      if (!Number.isInteger(branchNo) || branchNo < 1 || branchNo > 99) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0641\u0631\u0639 Apex");
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length || items.length > 40) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0623\u0635\u0646\u0627\u0641 Apex");
      const clean3 = items.map((x) => ({ itemNo: String(x?.itemNo || "").trim(), qty: Number(x?.qty), note: x?.note ? String(x.note).slice(0, 60) : "" }));
      if (clean3.some((x) => !/^\d{1,10}$/.test(x.itemNo) || !(x.qty > 0 && x.qty <= 50))) fail2(400, "\u0641\u064A\u0647 \u0635\u0646\u0641 \u0644\u0633\u0647 \u0645\u0627\u0627\u062A\u062E\u062A\u0627\u0631\u0634 \u0623\u0648 \u0639\u062F\u062F\u0647 \u0645\u0634 \u0645\u0638\u0628\u0648\u0637");
      const noteRecord = await db.prepare("SELECT cust_no, note, status, phone_hash, checked_at FROM apex_customer_notes WHERE source = ? AND ref = ?").get(source, ref2);
      const noteProfile = await db.prepare("SELECT data FROM match_profiles WHERE source = ? AND ref = ?").get(source, ref2);
      const currentPhone = profilePhone(source, parseJson(noteProfile?.data, {}));
      if (!noteRecord || !currentPhone || noteRecord.phone_hash !== sha256(currentPhone) || noteRecord.status === "error" || ctx.now - noteRecord.checked_at > 5 * 6e4) {
        fail2(409, "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u0639\u0644\u0649 APEX \u0644\u0633\u0647 \u0645\u0627 \u0627\u062A\u0631\u0627\u062C\u0639\u062A\u0634 \u2014 \u0627\u0633\u062A\u0646\u0649 \u0627\u0644\u0642\u0631\u0627\u0621\u0629 \u0645\u0646 \u062C\u0647\u0627\u0632 \u0627\u0644\u0643\u0627\u0634\u064A\u0631");
      }
      const verifiedCardNote = parseApexCustomerNote(noteRecord.note);
      const clientCard = b.apexNote && typeof b.apexNote === "object" ? b.apexNote : {};
      const isAcknowledged = clientCard.approved === true && String(clientCard.note || "") === verifiedCardNote.text && String(clientCard.custNo || "") === String(noteRecord.cust_no || "");
      if (verifiedCardNote.unrecognized) fail2(409, "\u0641\u064A \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0645\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0648\u0627\u0636\u062D\u0629 \u2014 \u0631\u0627\u062C\u0639\u0647\u0627 \u064A\u062F\u0648\u064A\u064B\u0627\u060C \u0648\u0644\u0627 \u062A\u062D\u0630\u0641\u0647\u0627");
      if (verifiedCardNote.requiresReview && !isAcknowledged) fail2(409, "\u0644\u0627\u0632\u0645 \u062A\u0623\u0643\u064A\u062F \u062E\u0635\u0645 \u0648\u0623\u0635\u0646\u0627\u0641 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u0642\u0628\u0644 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0623\u0648\u0631\u062F\u0631");
      if (verifiedCardNote.directives.filter((x) => x.kind === "percent" || x.kind === "amount").length > 1)
        fail2(409, "\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u0641\u064A\u0647\u0627 \u0623\u0643\u062A\u0631 \u0645\u0646 \u062E\u0635\u0645\u061B \u0631\u0627\u062C\u0639\u0647\u0627 \u064A\u062F\u0648\u064A\u064B\u0627 \u062D\u062A\u0649 \u0644\u0627 \u064A\u062A\u0645 \u0627\u0644\u062E\u0635\u0645 \u0645\u0631\u062A\u064A\u0646");
      const notePercent = verifiedCardNote.directives.find((x) => x.kind === "percent")?.value || 0;
      const noteAmount = verifiedCardNote.directives.find((x) => x.kind === "amount")?.value || 0;
      if ((notePercent || noteAmount) && payment === "paid")
        fail2(409, "\u0627\u0644\u0637\u0644\u0628 \u0645\u062F\u0641\u0648\u0639 \u0645\u0633\u0628\u0642\u064B\u0627\u061B \u062E\u0635\u0645 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u064A\u062D\u062A\u0627\u062C \u062A\u0623\u0643\u064A\u062F \u0641\u0631\u0642 \u0627\u0644\u062A\u062D\u0635\u064A\u0644 \u0623\u0648 \u0627\u0633\u062A\u0631\u062F\u0627\u062F \u0642\u0628\u0644 \u062A\u0633\u062C\u064A\u0644\u0647");
      const benefitDirectives = verifiedCardNote.directives.filter((x) => x.kind === "item");
      const benefitItems = Array.isArray(clientCard.items) ? clientCard.items : [];
      if (benefitDirectives.length !== benefitItems.length) fail2(409, "\u0627\u062E\u062A\u0627\u0631 \u0643\u0644 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0629 \u0648\u0643\u0645\u064A\u0627\u062A\u0647\u0627");
      const noteItems = benefitItems.map((x) => ({ itemNo: String(x?.itemNo || "").trim(), qty: Number(x?.qty), note: "\u0645\u0633\u062A\u062D\u0642 \u0645\u0646 \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0639\u0645\u064A\u0644", free: true }));
      if (noteItems.some((x) => !APEX_NAMES[x.itemNo] || !Number.isInteger(x.qty) || x.qty <= 0 || x.qty > 50))
        fail2(409, "\u0643\u0648\u062F \u0627\u0644\u0635\u0646\u0641 \u0627\u0644\u0645\u0633\u062A\u062D\u0642 \u0623\u0648 \u0643\u0645\u064A\u062A\u0647 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
      if (clean3.length + noteItems.length > 40) fail2(409, "\u0625\u062C\u0645\u0627\u0644\u064A \u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F");
      const noteBenefit = verifiedCardNote.text ? {
        custNo: String(noteRecord.cust_no || ""),
        original: String(noteRecord.note || ""),
        oneTime: verifiedCardNote.oneTime && isAcknowledged,
        percent: notePercent,
        amount: noteAmount,
        items: noteItems
      } : null;
      const safeRemarks = [String(b.note || "").trim(), verifiedCardNote.text ? "\u0645\u0644\u0627\u062D\u0638\u0629 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644: " + verifiedCardNote.text : ""].filter(Boolean).join(" | ");
      if (safeRemarks.length > 200) fail2(409, "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0639 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u0623\u0637\u0648\u0644 \u0645\u0646 \u0645\u0633\u0627\u062D\u0629 APEX \u2014 \u0631\u0627\u062C\u0639\u0647\u0627 \u0642\u0628\u0644 \u0627\u0644\u062A\u0633\u062C\u064A\u0644");
      const locationNo = Number(b.locationNo);
      if (!Number.isInteger(locationNo) || locationNo < 1) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u0639\u0644\u0649 Apex");
      const daySnap = parseJson((await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(row.day))?.data, {});
      const areas = (Array.isArray(daySnap.locations) ? daySnap.locations : []).filter((l) => l?.no === locationNo);
      const owners = [...new Set(areas.map((l) => l.branch).filter((x) => x != null).map(Number))];
      if (owners.length && !owners.includes(branchNo)) {
        const names = new Map(APEX_BRANCHES.map((x) => [Number(x.no), x.name]));
        fail2(400, "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u062F\u064A \u062A\u0628\u0639 " + owners.map((n) => names.get(n) || "\u0641\u0631\u0639 " + n).join(" / ") + " \u2014 \u063A\u064A\u0651\u0631 \u0627\u0644\u0641\u0631\u0639");
      }
      const area2 = areas.find((l) => l.branch === branchNo) || areas.find((l) => l.branch == null) || areas[0];
      const areaService = Number.isFinite(Number(area2?.service)) && area2?.service !== null ? Number(area2.service) : null;
      const sourceOrder = source === "talabat" ? (await baseFor(row.day, ctx.now)).list.find((o) => o.source === source && String(o.ref) === ref2) : null;
      const sourceDiscounts = sourceOrder?.discounts || [];
      if (sourceDiscounts.some((d) => !d.who || d.unclear)) fail2(400, "\u062A\u0645\u0648\u064A\u0644 \u0627\u0644\u062E\u0635\u0645 \u0645\u0634 \u0648\u0627\u0636\u062D \u2014 \u0631\u0627\u062C\u0639 \u0628\u064A\u0627\u0646\u0627\u062A \u0637\u0644\u0628\u0627\u062A");
      const platformDiscount = Math.round(sourceDiscounts.filter((d) => d.who === "platform").reduce((sum, d) => sum + (Number(d.amount) || 0), 0) * 100) / 100;
      const sourceRestaurantDiscount = sourceDiscounts.filter((d) => d.who === "restaurant").reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const sign = platformDiscount > 0 ? "\u062E\u0635\u0645 \u0637\u0644\u0628\u0627\u062A " + platformDiscount.toFixed(2) : String(b.sign || "").slice(0, 120);
      const restaurantDiscount = sourceDiscounts.length ? Math.round((sourceRestaurantDiscount + (payment === "paid" ? platformDiscount : 0)) * 100) / 100 : Math.max(0, Number(b.restaurantDiscount) || 0);
      const expectedTotal = Number(b.expectedTotal) || null, targetTotal = Number(b.targetTotal) > 0 ? Math.round(Number(b.targetTotal) * 100) / 100 : null;
      if (safeRemarks.length > 200) fail2(400, "\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0623\u0637\u0648\u0644 \u0645\u0646 \u0645\u0633\u0627\u062D\u0629 Apex (\u0662\u0660\u0660 \u062D\u0631\u0641) \u2014 \u0627\u062E\u062A\u0635\u0631\u0647\u0627 \u0645\u0639 \u0627\u0644\u0627\u062D\u062A\u0641\u0627\u0638 \u0628\u0627\u0644\u0645\u0642\u0635\u0648\u062F");
      const texts2 = [b.customer?.name, b.customer?.address, safeRemarks].filter(Boolean);
      const arabic = app2.toArabic ? await app2.toArabic(texts2, { wait: true }) : /* @__PURE__ */ new Map();
      const translatedName = arabic.get(b.customer?.name) || b.customer?.name;
      const translatedAddress = arabic.get(b.customer?.address) || b.customer?.address;
      const translatedNote = arabic.get(safeRemarks) || safeRemarks;
      if (translatedNote.length > 200) fail2(400, "\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0628\u0639\u062F \u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0623\u0637\u0648\u0644 \u0645\u0646 \u0645\u0633\u0627\u062D\u0629 Apex \u2014 \u0627\u062E\u062A\u0635\u0631\u0647\u0627");
      const address = deliveryAddress(translatedAddress, area2?.name || "");
      const deliveryFields = { address: [address.street, address.floor ? "\u0627\u0644\u062F\u0648\u0631: " + address.floor : "", address.flat ? "\u0627\u0644\u0634\u0642\u0629: " + address.flat : ""].filter(Boolean).join(" \u2014 "), floor: address.floor, flat: address.flat };
      const payload = {
        v: 1,
        source,
        ref: ref2,
        code: String(b.code || "").replace(/[^\d]/g, "").slice(0, 10) || null,
        db: mode,
        branchNo,
        locationNo,
        payment,
        label: deliveryLabel(translatedName, source, payment, b.code),
        customer: { name: String(translatedName || "").slice(0, 80), phone: deliveryPhone(b.customer?.phone), address: String(b.customer?.address || "").slice(0, 360), ...deliveryFields },
        sign,
        platformDiscount,
        note: translatedNote,
        items: [...clean3, ...noteItems],
        apexCustomerBenefit: noteBenefit,
        restaurantDiscount,
        expectedTotal,
        targetTotal,
        areaService,
        by: me.name,
        at: ctx.now
      };
      await db.prepare(`INSERT INTO transfer_jobs (source, ref, day, state, employee_id, employee_name, payment, note, at, payload, result) VALUES (?,?,?,'auto_pending',?,?,?,?,?,?,NULL)
        ON CONFLICT(source, ref) DO UPDATE SET state = 'auto_pending', employee_id = excluded.employee_id, employee_name = excluded.employee_name, payment = excluded.payment, note = excluded.note, at = excluded.at, payload = excluded.payload, result = NULL`).run(source, ref2, row.day, me.id, me.name, payment, note, ctx.now, JSON.stringify(payload));
    } else fail2(400, "invalid_action");
    await app2.audit("transfer_" + b.action, me.staff ? me.id : null, { actor: me.name, source, ref: ref2, payment, ...b.action === "auto" ? { branch: b.branchNo, location: b.locationNo, items: b.items, customerName: b.customer?.name, address: b.customer?.address, note: b.note } : {} });
    return { ok: true };
  });
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => v == null ? db.prepare("DELETE FROM settings WHERE key = ?").run(k) : db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const writer = /* @__PURE__ */ __name(async (ctx) => {
    const given = ctx.header("x-apex-writer"), hashes = [await setting("apex_writer_token_hash"), await setting("orders_token_hash")].filter(Boolean);
    if (!given || !hashes.includes(sha256(given))) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0643\u0627\u062A\u0628 Apex \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
  }, "writer");
  const profilePhone = /* @__PURE__ */ __name((source, p) => deliveryPhone(source === "talabat" ? p.phoneDisplay || p.phone || p.mobileDisplay || p.mobile : p.customer?.phoneDisplay || p.customer?.phone || p.customer?.mobileDisplay || p.customer?.mobile), "profilePhone");
  app2.route("POST", "/api/apex-writer/customer-notes/pending", async (ctx) => {
    await writer(ctx);
    const day = businessDay(ctx.now), due = ctx.now - 5 * 6e4, out = [];
    for (const source of ["talabat", "site"]) {
      const orderTable = source === "talabat" ? "talabat_orders" : "site_orders";
      const join = source === "talabat" ? "o.id = p.ref" : "CAST(o.id AS TEXT) = p.ref";
      const terminal = source === "talabat" ? "AND UPPER(COALESCE(o.status,'')) NOT IN ('CANCELLED','REJECTED','DELIVERED','COMPLETED','PICKED_UP','IN_DELIVERY')" : "AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelled','failed','wallet-failed','refunded','completed')";
      const rows = await db.prepare(`SELECT p.ref, p.data, n.checked_at, n.phone_hash FROM ${orderTable} o
        JOIN match_profiles p ON p.source = ? AND ${join}
        LEFT JOIN apex_customer_notes n ON n.source = p.source AND n.ref = p.ref
        WHERE o.day = ? ${terminal} ORDER BY o.id DESC LIMIT 35`).all(source, day);
      for (const row of rows) {
        const phone = profilePhone(source, parseJson(row.data, {}));
        if (!phone || out.length >= 25) continue;
        if (row.phone_hash === sha256(phone) && Number(row.checked_at) >= due) continue;
        out.push({ source, ref: row.ref, day, phone });
      }
    }
    return { pending: out };
  });
  app2.route("POST", "/api/apex-writer/customer-notes/result", async (ctx) => {
    await writer(ctx);
    const rows = Array.isArray(ctx.body.results) ? ctx.body.results.slice(0, 25) : [];
    let updated = 0;
    for (const x of rows) {
      const source = x.source === "talabat" || x.source === "site" ? x.source : null, ref2 = String(x.ref || "");
      if (!source || !/^\\d{1,20}$/.test(ref2)) continue;
      const profile3 = await db.prepare("SELECT data FROM match_profiles WHERE source = ? AND ref = ?").get(source, ref2);
      if (!profile3 || profilePhone(source, parseJson(profile3.data, {})) !== deliveryPhone(x.phone)) continue;
      const orderTable = source === "talabat" ? "talabat_orders" : "site_orders", pk = source === "talabat" ? "id" : "id";
      const dayRow = await db.prepare(`SELECT day FROM ${orderTable} WHERE ${pk} = ?`).get(source === "talabat" ? ref2 : Number(ref2));
      if (!dayRow || dayRow.day !== x.day) continue;
      const status = x.status === "found" && x.custNo ? "found" : x.status === "none" ? "none" : "error";
      const note = status === "found" ? String(x.note || "").slice(0, 1e3) : "";
      await db.prepare(`INSERT INTO apex_customer_notes(source,ref,day,phone_last4,phone_hash,cust_no,note,checked_at,status)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source,ref) DO UPDATE SET day=excluded.day,phone_last4=excluded.phone_last4,phone_hash=excluded.phone_hash,cust_no=excluded.cust_no,note=excluded.note,checked_at=excluded.checked_at,status=excluded.status`).run(source, ref2, dayRow.day, String(x.phone).slice(-4), sha256(deliveryPhone(x.phone)), status === "found" ? String(x.custNo).slice(0, 30) : null, note, ctx.now, status);
      updated++;
    }
    return { updated };
  });
  app2.route("GET", "/api/apex-writer", async (ctx) => {
    await app2.requireAdmin(ctx);
    const jobs = await db.prepare("SELECT source, ref, state, employee_name, at, result FROM transfer_jobs WHERE state LIKE 'auto_%' ORDER BY at DESC LIMIT 50").all();
    return {
      mode: await setting("apex_bridge_mode") || "shadow",
      linked: !!await setting("apex_writer_token_hash"),
      lastSeen: Number(await setting("apex_writer_seen")) || null,
      jobs: jobs.map((j) => ({ source: j.source, ref: j.ref, state: j.state, by: j.employee_name, at: iso(j.at), result: parseJson(j.result, null) }))
    };
  });
  app2.route("POST", "/api/apex-writer", async (ctx) => {
    const who2 = await app2.requireAdmin(ctx, "admin"), b = ctx.body;
    if (b.action === "token") {
      const token = "apx_" + randomToken(24);
      await put("apex_writer_token_hash", sha256(token));
      await app2.audit("apex_writer_token", null, { actor: who2.name });
      return { token };
    }
    if (b.action === "mode") {
      if (!["off", "shadow", "test", "live"].includes(b.mode)) fail2(400, "invalid_mode");
      if (b.mode === "live" && String(b.confirm || "") !== "LIVE") fail2(400, "\u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0639\u0644\u0649 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C \u0645\u062D\u062A\u0627\u062C \u062A\u0623\u0643\u064A\u062F");
      await put("apex_bridge_mode", b.mode);
      await app2.audit("apex_bridge_mode", null, { actor: who2.name, mode: b.mode });
      return { ok: true, mode: b.mode };
    }
    fail2(400, "invalid_action");
  });
  let seenWritten = 0;
  app2.route("POST", "/api/apex-writer/next", async (ctx) => {
    await writer(ctx);
    if (ctx.now - seenWritten > 6e4) {
      seenWritten = ctx.now;
      await put("apex_writer_seen", ctx.now);
    }
    const mode = await setting("apex_bridge_mode") || "shadow";
    if (mode === "off") return { mode, job: null };
    const stuck = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_sending' ORDER BY at LIMIT 1").get();
    if (stuck) return { mode, job: { ...parseJson(stuck.payload, {}), resume: true } };
    const j = await db.prepare("SELECT source, ref, payload FROM transfer_jobs WHERE state = 'auto_pending' ORDER BY at LIMIT 1").get();
    if (!j) return { mode, job: null };
    const job = parseJson(j.payload, {});
    if (job.db !== mode) {
      await db.prepare("UPDATE transfer_jobs SET state = 'auto_failed', result = ? WHERE source = ? AND ref = ?").run(JSON.stringify({ ok: false, error: "\u0648\u0636\u0639 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u062A\u063A\u064A\u0631\u061B \u0627\u0628\u0639\u062A\u0647 \u062A\u0627\u0646\u064A" }), j.source, j.ref);
      return { mode, job: null };
    }
    const r = await db.prepare("UPDATE transfer_jobs SET state = 'auto_sending', at = ? WHERE source = ? AND ref = ? AND state = 'auto_pending'").run(ctx.now, j.source, j.ref);
    return { mode, job: r.changes ? job : null };
  });
  app2.route("GET", "/api/transfer/price-diffs", async (ctx) => {
    await app2.requireAdmin(ctx);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.to || "")) ? ctx.query.to : businessDay(ctx.now);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.from || "")) ? ctx.query.from : to;
    const rows = await db.prepare("SELECT source, ref, day, state, employee_name, payment, at, payload, result FROM transfer_jobs WHERE day BETWEEN ? AND ? AND state IN ('auto_done', 'auto_failed', 'auto_preview') ORDER BY at DESC LIMIT 500").all(from, to);
    const list = rows.map((r) => {
      const p = parseJson(r.payload, {}), x = parseJson(r.result, {}) || {};
      const delivery = x.service != null ? Math.round(x.service * 1.14 * 100) / 100 : 0;
      const unexplained = Math.round(((x.gap || 0) - Math.min(x.gap || 0, delivery)) * 100) / 100;
      return {
        source: r.source,
        ref: r.ref,
        code: p.code || null,
        day: r.day,
        state: r.state,
        by: r.employee_name,
        at: iso(r.at),
        branchNo: p.branchNo,
        payment: r.payment,
        target: x.target ?? p.targetTotal ?? null,
        before: x.before,
        total: x.total,
        gap: x.gap || 0,
        short: x.short || 0,
        delivery,
        unexplained,
        error: x.error || null,
        apexNo: x.shiftSerial ?? null,
        items: (p.items || []).map((i) => ({ no: i.itemNo, qty: i.qty, name: APEX_NAMES[i.itemNo] || null }))
      };
    }).filter((x) => x.state !== "auto_done" || x.unexplained > 1 || x.short > 1 || x.error);
    return { from, to, list };
  });
  app2.route("POST", "/api/apex-writer/result", async (ctx) => {
    await writer(ctx);
    const b = ctx.body, source = b.source === "talabat" || b.source === "site" ? b.source : null, ref2 = String(b.ref || "");
    if (!source || !/^\d{1,20}$/.test(ref2)) fail2(400, "\u0623\u0648\u0631\u062F\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    const result = {
      ok: !!b.ok,
      preview: !!b.preview,
      db: ["shadow", "test", "live"].includes(b.db) ? b.db : null,
      orderNo: b.orderNo ?? null,
      shiftSerial: b.shiftSerial ?? null,
      branchOrderNo: b.branchOrderNo ?? null,
      total: Number(b.total) || null,
      error: b.error ? String(b.error).slice(0, 300) : null,
      detail: b.detail ? String(b.detail).slice(0, 1500) : null,
      at: ctx.now,
      // The price difference (Karim 01-11: the order is saved, admin sees the difference to fix the price or the item).
      gap: Number(b.gap) || 0,
      short: Number(b.short) || 0,
      before: Number(b.before) || null,
      service: Number.isFinite(Number(b.service)) ? Number(b.service) : null,
      target: Number(b.target) || null,
      cardDiscount: Number(b.cardDiscount) || 0,
      cardNoteCleared: b.cardNoteCleared === true
    };
    const state = result.preview ? "auto_preview" : result.ok ? "auto_done" : "auto_failed";
    const r = await db.prepare("UPDATE transfer_jobs SET state = ?, result = ?, at = ? WHERE source = ? AND ref = ? AND state = 'auto_sending'").run(state, JSON.stringify(result), ctx.now, source, ref2);
    if (!r.changes) fail2(409, "\u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0645\u0634 \u0641\u064A \u062D\u0627\u0644\u0629 \u0625\u0631\u0633\u0627\u0644");
    if (state === "auto_done" && result.db === "live" && result.cardNoteCleared) {
      await db.prepare("UPDATE apex_customer_notes SET note = '', status = 'consumed', checked_at = ? WHERE source = ? AND ref = ?").run(ctx.now, source, ref2);
    }
    await app2.audit("apex_writer_result", null, { source, ref: ref2, ...result });
    if (state === "auto_failed" && result.db === "live") {
      const job = await db.prepare("SELECT payload FROM transfer_jobs WHERE source = ? AND ref = ?").get(source, ref2);
      await transferAlert("transfer:failed:" + source + ":" + ref2, parseJson(job?.payload, {}), source, ref2, "\u0645\u0627\u062A\u0633\u062C\u0644\u0634 \u0639\u0644\u0649 Apex \u2014 " + plainError(result.error), ctx.now);
    }
    return { ok: true };
  });
}
__name(setup22, "setup");

// ../sites/lib/marsad/talabat-actions.js
var talabat_actions_exports = {};
__export(talabat_actions_exports, {
  setup: () => setup23
});
var OUT = /* @__PURE__ */ new Set(["PICKED_UP", "PICKED UP", "IN_DELIVERY", "IN DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED", "REJECTED"]);
var clean2 = /* @__PURE__ */ __name((c) => {
  const branches = {};
  for (const [store, v] of Object.entries(c?.branches || {}).slice(0, 40)) {
    const name = String(canonicalStore(store) || "").trim().slice(0, 120);
    if (!name) continue;
    const minutes = Math.round(Number(v?.minutes)), had = branches[name];
    const next = { accept: v?.accept === true, minutes: minutes >= 5 && minutes <= 180 ? minutes : null, onTheWay: v?.onTheWay === true };
    branches[name] = had ? { accept: had.accept || next.accept, minutes: had.minutes ?? next.minutes, onTheWay: had.onTheWay || next.onTheWay } : next;
  }
  return { branches };
}, "clean");
function setup23(app2) {
  const { db, fail: fail2 } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const config2 = /* @__PURE__ */ __name(async () => clean2(parseJson(await setting("talabat_actions"), {})), "config");
  const screen = /* @__PURE__ */ __name(async (ctx) => {
    const hash = await setting("talabat_token_hash"), given = ctx.header("x-talabat-token"), extras = parseJson(await setting("talabat_token_extra"), []);
    if (!given && app2.config.deviceTokens.includes(ctx.header("x-device-token") || "")) return;
    if (!given || !(hash && sha256(given) === hash || extras.includes(sha256(given)))) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0634\u0627\u0634\u0629 \u0637\u0644\u0628\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
  }, "screen");
  app2.route("GET", "/api/talabat/actions-config", async (ctx) => {
    await app2.requireAdmin(ctx);
    const since = businessDay(ctx.now - 7 * 864e5);
    const stores = [...new Set((await db.prepare("SELECT DISTINCT store FROM talabat_orders WHERE day >= ? AND store IS NOT NULL").all(since)).map((r) => canonicalStore(r.store)).filter(Boolean))].sort();
    const c = await config2();
    const log3 = parseJson(await setting("talabat_actions_log"), []);
    const ui = {};
    for (const k of ["new", "accepted", "onTheWay"]) ui[k] = parseJson(await setting("talabat_ui:" + k), null);
    return {
      branches: [.../* @__PURE__ */ new Set([...stores, ...Object.keys(c.branches)])].map((s) => ({ store: s, ...c.branches[s] || { accept: false, minutes: null, onTheWay: false } })),
      acceptReady: false,
      log: log3.slice(0, 30),
      ui
    };
  });
  app2.route("POST", "/api/talabat/actions-config", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "admin");
    const c = clean2(ctx.body);
    await put("talabat_actions", JSON.stringify(c));
    await app2.audit("talabat_actions", null, { actor: who.name, ...c });
    return { ok: true, ...c };
  });
  app2.route("GET", "/api/talabat/actions", async (ctx) => {
    await screen(ctx);
    const c = await config2(), day = businessDay(ctx.now);
    const accept = Object.fromEntries(Object.entries(c.branches).filter(([, v]) => v.accept && v.minutes).map(([s, v]) => [s, v.minutes]));
    const wantOut = Object.entries(c.branches).filter(([, v]) => v.onTheWay).map(([s]) => s);
    const onTheWay = [];
    if (wantOut.length && app2.talabat) {
      const tm = await app2.talabat.matchDay(day);
      const snap = parseJson((await db.prepare("SELECT data FROM orders_days WHERE day = ?").get(day))?.data, {});
      const outOf = new Map([...snap.lateOut || [], ...snap.online || []].filter((a) => a.out).map((a) => [String(a.no), a.out]));
      for (const o of tm.rows) {
        if (!wantOut.includes(canonicalStore(o.store)) || OUT.has(String(o.status || "").toUpperCase()) || o.picked_up_at || o.delivered_at) continue;
        const a = tm.matches.get(o.id), out = a && outOf.get(String(a.no));
        if (out) onTheWay.push({ id: String(o.id), code: o.code || null, out });
      }
    }
    return { accept, onTheWay: onTheWay.slice(0, 20), serverNow: iso(ctx.now) };
  });
  const PRODUCT = new Map(TALABAT_PRODUCTS.map((p) => [p[0], { id: p[0], name: p[1], category: p[2] }]));
  const OUTLETS = [{ id: "HF_EG;760858", apex: 1 }, { id: "HF_EG;608556", apex: 2 }, { id: "HF_EG;802223", apex: 3 }];
  const json = /* @__PURE__ */ __name(async (k, d) => {
    const v = parseJson(await setting(k), d);
    return v && typeof v === "object" ? v : d;
  }, "json");
  const stockOf = /* @__PURE__ */ __name(() => json("talabat_stock", {}), "stockOf");
  const apexBranch = /* @__PURE__ */ __name((store) => {
    const t = String(canonicalStore(store) || "");
    const h = [/التجمع/.test(t) && 1, /(مدينة نصر|سيتي ستار|مكرم)/.test(t) && 2, /مدينتي/.test(t) && 3].filter(Boolean);
    return h.length === 1 ? h[0] : null;
  }, "apexBranch");
  const apexNosOf = /* @__PURE__ */ __name((id2) => {
    const p = PRODUCT.get(id2);
    return p ? knownNos(p.name) : [];
  }, "apexNosOf");
  app2.route("GET", "/api/talabat/stock-config", async (ctx) => {
    await app2.requireAdmin(ctx);
    const since = businessDay(ctx.now - 7 * 864e5);
    const stores = [...new Set((await db.prepare("SELECT DISTINCT store FROM talabat_orders WHERE day >= ? AND store IS NOT NULL").all(since)).map((r) => canonicalStore(r.store)).filter(Boolean))].sort();
    const stock = await stockOf();
    return {
      stores: [.../* @__PURE__ */ new Set([...stores, ...Object.keys(stock)])],
      products: [...PRODUCT.values()],
      stopped: stock,
      actual: await json("talabat_stock_actual", {}),
      queue: await json("talabat_stock_queue", {}),
      apexQueue: await json("apex_stock_queue", {}),
      apply: await json("talabat_stock_apply", { talabat: false, apex: false }),
      log: (await json("talabat_stock_log", { rows: [] })).rows.slice(0, 30)
    };
  });
  app2.route("POST", "/api/talabat/stock-config", async (ctx) => {
    const who = await app2.requireAdmin(ctx, "write");
    if (ctx.body?.action === "apply") {
      const v = { talabat: ctx.body.talabat === true, apex: ctx.body.apex === true };
      await put("talabat_stock_apply", JSON.stringify(v));
      await app2.audit("talabat_stock_apply", null, { actor: who.name, ...v });
      return { ok: true, ...v };
    }
    const store = String(ctx.body?.store || "").trim().slice(0, 160);
    if (!store) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0641\u0631\u0639");
    const ids = [...new Set((Array.isArray(ctx.body?.stopped) ? ctx.body.stopped : []).map(String).filter((id2) => PRODUCT.has(id2)))].slice(0, 300);
    const stock = await stockOf(), before = new Set(stock[store] || []), after = new Set(ids);
    stock[store] = ids;
    await put("talabat_stock", JSON.stringify(stock));
    const q = await json("talabat_stock_queue", {}), aq = await json("apex_stock_queue", {}), br = apexBranch(store);
    const changed = [...[...after].filter((id2) => !before.has(id2)).map((id2) => [id2, "stop"]), ...[...before].filter((id2) => !after.has(id2)).map((id2) => [id2, "resume"])];
    for (const [id2, act] of changed) {
      (q[store] ||= {})[id2] = act;
      if (br) for (const no of apexNosOf(id2)) (aq[br] ||= {})[no] = act;
    }
    await put("talabat_stock_queue", JSON.stringify(q));
    await put("apex_stock_queue", JSON.stringify(aq));
    await app2.audit("talabat_stock", null, { actor: who.name, store, stop: changed.filter((c) => c[1] === "stop").map((c) => PRODUCT.get(c[0]).name), resume: changed.filter((c) => c[1] === "resume").map((c) => PRODUCT.get(c[0]).name) });
    return { ok: true, store, stopped: ids, changes: changed.length };
  });
  const logStock = /* @__PURE__ */ __name(async (row) => {
    const l = await json("talabat_stock_log", { rows: [] });
    l.rows = [{ at: Date.now(), ...row }, ...l.rows].slice(0, 100);
    await put("talabat_stock_log", JSON.stringify(l));
  }, "logStock");
  app2.route("GET", "/api/talabat/stock", async (ctx) => {
    await screen(ctx);
    const apply = await json("talabat_stock_apply", { talabat: false }), q = await json("talabat_stock_queue", {});
    const byOutlet = {};
    for (const o of OUTLETS) for (const [store, items] of Object.entries(q)) if (apexBranch(store) === o.apex) for (const [id2, act] of Object.entries(items)) (byOutlet[o.id] ||= {})[id2] = act;
    return { outlets: OUTLETS.map((o) => o.id), apply: apply.talabat === true, queue: byOutlet };
  });
  app2.route("POST", "/api/talabat/stock/report", async (ctx) => {
    await screen(ctx);
    const b = ctx.body || {}, outlet = String(b.outlet || "").slice(0, 40), name = String(b.outletName || "").slice(0, 120);
    const actual = await json("talabat_stock_actual", {});
    actual[outlet] = { at: ctx.now, name, unavailable: (Array.isArray(b.unavailable) ? b.unavailable : []).map(String).filter((id2) => /^\d{6,12}$/.test(id2)).slice(0, 400) };
    await put("talabat_stock_actual", JSON.stringify(actual));
    const q = await json("talabat_stock_queue", {});
    for (const d of (Array.isArray(b.done) ? b.done : []).slice(0, 50)) {
      const id2 = String(d.id || ""), br = OUTLETS.find((o) => o.id === outlet)?.apex;
      for (const store of Object.keys(q)) if (apexBranch(store) === br && d.ok === true && q[store]?.[id2] === d.act) delete q[store][id2];
      await logStock({ where: "talabat", store: name || outlet, dish: PRODUCT.get(id2)?.name || id2, act: d.act, ok: d.ok === true, note: String(d.note || "").slice(0, 120) });
    }
    await put("talabat_stock_queue", JSON.stringify(q));
    return { ok: true };
  });
  const writerKey = /* @__PURE__ */ __name(async (ctx) => {
    const given = ctx.header("x-apex-writer"), hashes = [await setting("apex_writer_token_hash"), await setting("orders_token_hash")].filter(Boolean);
    if (!given || !hashes.includes(sha256(given))) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0643\u0627\u062A\u0628 Apex \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
  }, "writerKey");
  app2.route("POST", "/api/apex-writer/stock-next", async (ctx) => {
    await writerKey(ctx);
    const apply = await json("talabat_stock_apply", { apex: false });
    return { apply: apply.apex === true, queue: apply.apex === true ? await json("apex_stock_queue", {}) : {} };
  });
  app2.route("POST", "/api/apex-writer/stock", async (ctx) => {
    await writerKey(ctx);
    const aq = await json("apex_stock_queue", {});
    for (const d of (Array.isArray(ctx.body?.done) ? ctx.body.done : []).slice(0, 100)) {
      const br = String(d.branch || ""), no = String(d.itemNo || "");
      if (d.ok === true && aq[br]?.[no] === d.act) delete aq[br][no];
      await logStock({ where: "apex", branch: br, item: no, act: d.act, ok: d.ok === true, note: String(d.note || "").slice(0, 120) });
    }
    await put("apex_stock_queue", JSON.stringify(aq));
    return { ok: true };
  });
  app2.route("POST", "/api/talabat/actions/result", async (ctx) => {
    await screen(ctx);
    const b = ctx.body || {};
    const row = {
      at: ctx.now,
      id: String(b.id || "").replace(/\D/g, "").slice(0, 20),
      action: ["accept", "onTheWay"].includes(b.action) ? b.action : "other",
      ok: b.ok === true,
      note: String(b.note || "").slice(0, 200)
    };
    const log3 = parseJson(await setting("talabat_actions_log"), []);
    await put("talabat_actions_log", JSON.stringify([row, ...log3].slice(0, 100)));
    return { ok: true };
  });
  app2.route("POST", "/api/talabat/ui", async (ctx) => {
    await screen(ctx);
    const kind = ["new", "accepted", "onTheWay"].includes(ctx.body?.kind) ? ctx.body.kind : null;
    if (!kind) fail2(400, "invalid_kind");
    const controls = (Array.isArray(ctx.body.controls) ? ctx.body.controls : []).slice(0, 120).map((x) => ({
      tag: String(x?.tag || "").slice(0, 12),
      testid: String(x?.testid || "").slice(0, 120),
      role: String(x?.role || "").slice(0, 30),
      aria: String(x?.aria || "").slice(0, 80),
      text: String(x?.text || "").replace(/\d{6,}/g, "#").slice(0, 60)
    }));
    await put("talabat_ui:" + kind, JSON.stringify({ at: iso(ctx.now), controls }));
    return { ok: true };
  });
}
__name(setup23, "setup");

// ../sites/lib/marsad/system-watch.js
var system_watch_exports = {};
__export(system_watch_exports, {
  setup: () => setup24
});
var CHECK_MS2 = 2 * 6e4;
var clock2 = /* @__PURE__ */ __name((ms) => new Date(ms).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }), "clock");
function setup24(app2) {
  const { db } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const num = /* @__PURE__ */ __name(async (k) => Number(await setting(k)) || null, "num");
  const parts = /* @__PURE__ */ __name(async (now) => {
    const history = (await db.prepare("SELECT MAX(imported_at) t FROM history_reports").get())?.t || null;
    const screens = Object.values(parseJson(await setting("talabat_screens"), {}));
    const liveScreen = screens.map((s) => s.at).sort((a, b) => b - a)[0] || null;
    const siteLinked = !!await setting("site_wc");
    return [
      {
        id: "arabicss",
        name: "\u0633\u062D\u0628 \u0633\u062C\u0644 \u0645\u0643\u0627\u0644\u0645\u0627\u062A \u0623\u0631\u0627\u0628\u064A\u0643\u0633",
        last: history,
        after: 20,
        target: null,
        fix: "\u0627\u0641\u062A\u062D \u062A\u0642\u0627\u0631\u064A\u0631 \u0623\u0631\u0627\u0628\u064A\u0643\u0633 \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 \u0627\u0644\u0645\u0634\u0631\u0641 \u0648\u0633\u062C\u0651\u0644 \u062F\u062E\u0648\u0644\u060C \u0648\u0631\u0627\u062C\u0639 \xAB\u062D\u0627\u0644\u0629 \u0627\u0644\u0646\u0638\u0627\u0645\xBB"
      },
      {
        id: "talabat",
        name: "\u0634\u0627\u0634\u0629 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 (\u0633\u062C\u0644 \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A)",
        last: await num("talabat_last_push"),
        after: 10,
        target: "online",
        fix: "\u0627\u062A\u0623\u0643\u062F \u0625\u0646 \u062C\u0647\u0627\u0632 \u0634\u0627\u0634\u0629 \u0637\u0644\u0628\u0627\u062A \u0634\u063A\u0627\u0644 \u0648\u0641\u0627\u064A\u0631\u0641\u0648\u0643\u0633 \u0645\u0641\u062A\u0648\u062D \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A"
      },
      {
        id: "talabatLive",
        name: "\u0634\u0627\u0634\u0627\u062A \u0644\u0627\u064A\u0641 \u0637\u0644\u0628\u0627\u062A",
        last: liveScreen,
        after: 10,
        target: "online",
        fix: "\u0627\u0641\u062A\u062D partner-app.talabat.com/live-orders \u0639\u0644\u0649 \u0641\u0627\u064A\u0631\u0641\u0648\u0643\u0633 \u0627\u0644\u0644\u064A \u0639\u0644\u064A\u0647 \u0627\u0644\u0625\u0636\u0627\u0641\u0629"
      },
      {
        id: "writer",
        name: "\u0643\u0627\u062A\u0628 Apex \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 \u0627\u0644\u0643\u0627\u0634\u064A\u0631",
        last: await num("apex_writer_seen"),
        after: 10,
        target: "online",
        only: !!await setting("apex_writer_token_hash"),
        fix: "\u0627\u062A\u0623\u0643\u062F \u0625\u0646 \u062C\u0647\u0627\u0632 \u0627\u0644\u0643\u0627\u0634\u064A\u0631 \u0634\u063A\u0627\u0644 (\u0627\u0644\u0643\u0627\u062A\u0628 \u0628\u064A\u0634\u062A\u063A\u0644 \u0645\u0639 \u0645\u0631\u0635\u062F Apex)"
      },
      {
        id: "site",
        name: "\u0642\u0631\u0627\u064A\u0629 \u0623\u0648\u0631\u062F\u0631\u0627\u062A \u0627\u0644\u0645\u0648\u0642\u0639",
        last: siteLinked ? await num("site_sync_at") : null,
        after: 15,
        target: "online",
        only: siteLinked,
        error: await setting("site_error"),
        fix: "\u0631\u0627\u062C\u0639 \u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0645\u0648\u0642\u0639 \u0641\u064A \xAB\u0627\u0644\u0625\u062F\u0627\u0631\u0629\xBB (WooCommerce)"
      }
    ].filter((p) => p.only !== false);
  }, "parts");
  let lastCheck = 0;
  app2.afterRequest(async (now) => {
    if (now - lastCheck < CHECK_MS2) return;
    lastCheck = now;
    const state = parseJson(await setting("system_watch"), {});
    const writes = [];
    const send2 = /* @__PURE__ */ __name((key2, text, target, replyTo) => writes.push(db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,?,?,?)").bind(key2, replyTo ? "system:resolved" : "system", null, text, now, replyTo || null, null, target, null)), "send");
    for (const p of await parts(now)) {
      const silentMin = p.last ? (now - p.last) / 6e4 : Infinity;
      const down = state[p.id];
      if (!down && isOperating(now) && silentMin > p.after && p.last) {
        const key2 = "system:" + p.id + ":" + p.last;
        send2(key2, "\u{1F6E0}\uFE0F " + p.name + " \u0648\u0627\u0642\u0641 \u0645\u0646 " + clock2(p.last) + " (" + Math.round(silentMin) + " \u062F\u0642\u064A\u0642\u0629)" + (p.error ? "\n\u0627\u0644\u062E\u0637\u0623: " + p.error : "") + "\n" + p.fix, p.target);
        state[p.id] = { key: key2, since: p.last };
      } else if (down && silentMin <= p.after) {
        send2("resolved:" + down.key, "\u2705 " + p.name + " \u0631\u062C\u0639 \u0627\u0634\u062A\u063A\u0644 \u0627\u0644\u0633\u0627\u0639\u0629 " + clock2(p.last), p.target, down.key);
        delete state[p.id];
      }
    }
    const LONG_MS = 12 * 36e5;
    const long = await db.prepare(`SELECT s.id, s.issued_at, e.name FROM employee_sessions s LEFT JOIN employees e ON e.id = s.employee_id
      WHERE s.revoked_at IS NULL AND s.expires_at > ? AND s.issued_at < ?`).all(now, now - LONG_MS);
    for (const x of long?.results || long || []) {
      const key2 = "system:longSession:" + x.id;
      if (await db.prepare("SELECT 1 FROM telegram_log WHERE key = ?").get(key2)) continue;
      send2(key2, "\u23F1\uFE0F " + (x.name || "\u0645\u0648\u0638\u0641") + " \u0641\u0627\u062A\u062D \u0627\u0644\u0634\u064A\u0641\u062A \u0645\u0646 " + clock2(x.issued_at) + " (" + Math.round((now - x.issued_at) / 36e5) + " \u0633\u0627\u0639\u0629) \u2014 \u063A\u0627\u0644\u0628\u064B\u0627 \u0646\u0633\u064A \u064A\u0642\u0641\u0644. \u0627\u0642\u0641\u0644 \u0627\u0644\u0634\u064A\u0641\u062A \u0645\u0646 \xAB\u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u0634\u064A\u0641\u062A\xBB \u0641\u064A \u0627\u0644\u0625\u062F\u0627\u0631\u0629.", null);
    }
    if (writes.length) {
      writes.push(db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("system_watch", JSON.stringify(state)));
      await db.batch(writes);
    }
  });
  app2.route("GET", "/api/system/watch", async (ctx) => {
    await app2.requireAdmin(ctx);
    const state = parseJson(await setting("system_watch"), {});
    return { parts: (await parts(ctx.now)).map((p) => ({ id: p.id, name: p.name, last: iso(p.last), minutes: p.last ? Math.round((ctx.now - p.last) / 6e4) : null, ok: !!p.last && (ctx.now - p.last) / 6e4 <= p.after, down: !!state[p.id], error: p.error || null, fix: p.fix })) };
  });
}
__name(setup24, "setup");

// ../sites/lib/marsad/backup.js
var backup_exports = {};
__export(backup_exports, {
  setup: () => setup25
});
var SECRET = /hash|token|secret|password|site_wc|seal|cred/i;
var PAGE = 2e3;
function setup25(app2) {
  const { db, fail: fail2 } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const auth = /* @__PURE__ */ __name(async (ctx) => {
    if (ctx.header("x-admin-password")) {
      await app2.requireAdmin(ctx, "admin");
      return;
    }
    const hash = await setting("orders_token_hash"), given = ctx.header("x-orders-token");
    if (!hash || !given || sha256(given) !== hash) fail2(401, "\u0645\u0641\u062A\u0627\u062D \u0645\u0631\u0635\u062F \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
  }, "auth");
  const tables = /* @__PURE__ */ __name(async () => (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all()).map((r) => r.name).filter((n) => !SECRET.test(n)), "tables");
  app2.route("POST", "/api/backup", async (ctx) => {
    await auth(ctx);
    const list = await tables();
    const table3 = String(ctx.body?.table || "");
    if (!table3) return { tables: list };
    if (!list.includes(table3)) fail2(400, "invalid_table");
    const after = Number(ctx.body?.after) || 0;
    const rows = await db.prepare(`SELECT rowid AS _rowid, * FROM "${table3}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`).all(after);
    const clean3 = table3 === "settings" ? rows.filter((r) => !SECRET.test(String(r.key || ""))) : rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET.test(k))));
    return { table: table3, rows: clean3, next: rows.length === PAGE ? rows[rows.length - 1]._rowid : null };
  });
}
__name(setup25, "setup");

// ../sites/lib/marsad/kpi.js
var kpi_exports = {};
__export(kpi_exports, {
  TARGETS: () => TARGETS,
  setup: () => setup26
});
var TARGETS = {
  sla: { min: 90, label: "\u0627\u0644\u0631\u062F \u062E\u0644\u0627\u0644 10 \u062B", unit: "%" },
  abandon: { max: 3, label: "\u0646\u0633\u0628\u0629 \u0627\u0644\u0641\u0627\u0626\u062A\u0629", unit: "%" },
  asa: { max: 15, label: "\u0645\u062A\u0648\u0633\u0637 \u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0631\u062F", unit: "\u062B" },
  occupancy: { min: 35, max: 75, label: "\u0646\u0633\u0628\u0629 \u0627\u0644\u0627\u0646\u0634\u063A\u0627\u0644", unit: "%" },
  breakPerDay: { max: 30, label: "\u0627\u0644\u0628\u0631\u064A\u0643 \u0641\u064A \u0627\u0644\u064A\u0648\u0645", unit: "\u062F" },
  avgOut: { max: 30, label: "\u0645\u062A\u0648\u0633\u0637 \u0648\u0642\u062A \u0627\u0644\u062E\u0631\u0648\u062C", unit: "\u062F" },
  latePct: { max: 10, label: "\u062E\u0631\u062C\u0648\u0627 \u0628\u0639\u062F 30 \u062F\u0642\u064A\u0642\u0629", unit: "%" },
  discountPct: { max: 10, label: "\u0627\u0644\u062E\u0635\u0648\u0645\u0627\u062A \u0645\u0646 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A", unit: "%" },
  cancelPct: { max: 5, label: "\u0627\u0644\u0625\u0644\u063A\u0627\u0621\u0627\u062A \u0645\u0646 \u0627\u0644\u0623\u0648\u0631\u062F\u0631\u0627\u062A", unit: "%" }
};
var r1 = /* @__PURE__ */ __name((v) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10, "r1");
var daysOf = /* @__PURE__ */ __name((from, to) => {
  const out = [];
  for (let d = from; d <= to && out.length < 93; d = addDays(d, 1)) out.push(d);
  return out;
}, "daysOf");
function setup26(app2) {
  const { db, fail: fail2 } = app2;
  const dayCache = /* @__PURE__ */ new Map();
  async function branchDay(day) {
    const row = await db.prepare("SELECT data, received_at FROM orders_days WHERE day = ?").get(day);
    if (!row) return [];
    const hit = dayCache.get(day);
    if (hit && hit.at === row.received_at) return hit.rows;
    const d = parseJson(row.data, {});
    const disc = /* @__PURE__ */ new Map();
    for (const s of d.sales || []) disc.set(s.branch, (disc.get(s.branch) || 0) + (Number(s.discounts) || 0));
    const rows = (d.branches || []).map((b) => ({
      name: b.name,
      orders: Number(b.orders) || 0,
      sales: Number(b.sales) || 0,
      outCount: Number(b.outCount) || 0,
      outMinutes: (Number(b.avgOut) || 0) * (Number(b.outCount) || 0),
      outLate: Number(b.outLate) || 0,
      cancels: Number(b.cancels) || 0,
      cancelSales: Number(b.cancelSales) || 0,
      discounts: disc.get(b.name) || 0,
      kinds: b.kinds || {}
    }));
    dayCache.set(day, { at: row.received_at, rows });
    if (dayCache.size > 120) dayCache.delete(dayCache.keys().next().value);
    return rows;
  }
  __name(branchDay, "branchDay");
  async function branches(from, to) {
    const by = /* @__PURE__ */ new Map();
    for (const day of daysOf(from, to)) for (const b of await branchDay(day)) {
      const o = by.get(b.name) || { name: b.name, orders: 0, sales: 0, outCount: 0, outMinutes: 0, outLate: 0, cancels: 0, cancelSales: 0, discounts: 0, talabat: 0, hotline: 0, site: 0 };
      for (const k of ["orders", "sales", "outCount", "outMinutes", "outLate", "cancels", "cancelSales", "discounts"]) o[k] += b[k];
      o.talabat += Number(b.kinds["\u0637\u0644\u0628\u0627\u062A"]) || 0;
      o.hotline += Number(b.kinds.Hotline) || 0;
      o.site += Number(b.kinds["\u0627\u0644\u0645\u0648\u0642\u0639"]) || 0;
      by.set(b.name, o);
    }
    return [...by.values()].map((o) => ({
      name: o.name,
      orders: o.orders,
      sales: Math.round(o.sales),
      avgTicket: o.orders ? Math.round(o.sales / o.orders) : null,
      avgOut: o.outCount ? r1(o.outMinutes / o.outCount) : null,
      latePct: o.outCount ? r1(o.outLate / o.outCount * 100) : null,
      outLate: o.outLate,
      cancels: o.cancels,
      cancelPct: o.orders + o.cancels ? r1(o.cancels / (o.orders + o.cancels) * 100) : null,
      cancelSales: Math.round(o.cancelSales),
      discounts: Math.round(o.discounts),
      discountPct: o.sales ? r1(o.discounts / o.sales * 100) : null,
      mix: { talabat: o.talabat, hotline: o.hotline, site: o.site }
    })).sort((a, b) => b.orders - a.orders);
  }
  __name(branches, "branches");
  async function callCenter(from, to, now) {
    const r = from === to ? await app2.day(from, now) : await app2.range(from, to, now);
    const rep = r.history?.report || {};
    const team = {
      calls: rep.calls ?? null,
      answered: rep.answered ?? null,
      abandoned: rep.abandoned ?? null,
      sla: r1(rep.sla),
      abandon: r1(rep.abandonmentRate),
      asa: r1(rep.asa),
      meanCall: rep.meanCallSeconds != null ? Math.round(rep.meanCallSeconds) : null,
      complete: !!rep.verifiedTotal
    };
    const days = Math.max(1, daysOf(from, to).length);
    const employees = (r.employees || []).filter((e) => (e.workSeconds || 0) > 0).map((e) => {
      const worked = e.daysWorked || (from === to ? 1 : 1);
      const busy = e.callSeconds || 0, ready = e.readySeconds || 0;
      return {
        id: e.employeeId,
        name: e.name,
        daysWorked: worked,
        calls: e.answered ?? e.calls ?? 0,
        callsPerDay: r1((e.answered ?? e.calls ?? 0) / worked),
        meanCall: e.averageCallSeconds ?? (e.answered ? Math.round((e.talkSeconds || 0) / e.answered) : null),
        longCalls: e.longCalls || 0,
        occupancy: busy + ready ? r1(busy / (busy + ready) * 100) : null,
        workHours: r1((e.workSeconds || 0) / 3600),
        breakPerDay: r1((e.breakSeconds || 0) / 60 / worked),
        overBreakDays: e.overBreakDays ?? ((e.breakSeconds || 0) > 1800 ? 1 : 0)
      };
    }).sort((a, b) => b.calls - a.calls);
    return { team, employees, days };
  }
  __name(callCenter, "callCenter");
  app2.route("GET", "/api/kpi", async (ctx) => {
    await app2.requireAdmin(ctx);
    const today = businessDay(ctx.now);
    const to = validDate(String(ctx.query.to || "")) ? ctx.query.to : today;
    const from = validDate(String(ctx.query.from || "")) ? ctx.query.from : to;
    if (from > to || to > today) fail2(400, "\u0627\u062E\u062A\u0627\u0631 \u0641\u062A\u0631\u0629 \u0635\u062D\u064A\u062D\u0629");
    const n = daysOf(from, to).length;
    const pTo = addDays(from, -1), pFrom = addDays(from, -n);
    const [cc, br, pcc, pbr] = await Promise.all([callCenter(from, to, ctx.now), branches(from, to), callCenter(pFrom, pTo, ctx.now).catch(() => null), branches(pFrom, pTo)]);
    return {
      from,
      to,
      prev: { from: pFrom, to: pTo },
      targets: TARGETS,
      team: cc.team,
      employees: cc.employees,
      branches: br,
      before: { team: pcc?.team || null, employees: pcc?.employees || [], branches: pbr },
      serverNow: iso(ctx.now)
    };
  });
}
__name(setup26, "setup");

// ../sites/lib/marsad/branch-closures.js
var branch_closures_exports = {};
__export(branch_closures_exports, {
  setup: () => setup27
});
var OUTLET_BRANCH = { "760858": "\u0627\u0644\u062A\u062C\u0645\u0639", "608556": "\u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631", "802223": "\u0645\u062F\u064A\u0646\u062A\u0649" };
var STATE_AR = { OPEN: "\u0645\u0641\u062A\u0648\u062D", CLOSED: "\u0645\u0642\u0641\u0648\u0644", CLOSED_TODAY: "\u0645\u0642\u0641\u0648\u0644 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647", BUSY: "\u0645\u0634\u063A\u0648\u0644", PAUSED: "\u0645\u0648\u0642\u0648\u0641 \u0645\u0624\u0642\u062A\u064B\u0627", OFFLINE: "\u0623\u0648\u0641\u0644\u0627\u064A\u0646", UNAVAILABLE: "\u0645\u0634 \u0645\u062A\u0627\u062D" };
var stateAr = /* @__PURE__ */ __name((s) => STATE_AR[String(s || "").toUpperCase()] || String(s || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641"), "stateAr");
var clock3 = /* @__PURE__ */ __name((ms) => new Date(ms).toLocaleTimeString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }), "clock");
var mins = /* @__PURE__ */ __name((ms) => {
  const m = Math.round(ms / 6e4);
  return m < 60 ? m + " \u062F\u0642\u064A\u0642\u0629" : Math.floor(m / 60) + " \u0633\u0627\u0639\u0629" + (m % 60 ? " \u0648" + m % 60 + " \u062F\u0642\u064A\u0642\u0629" : "");
}, "mins");
var pick = /* @__PURE__ */ __name((raw, re) => {
  for (const [k, v] of Object.entries(raw || {})) if (re.test(k) && v && v !== "null" && v !== "undefined") return String(v).slice(0, 200);
  return null;
}, "pick");
var reasonOf = /* @__PURE__ */ __name((raw) => pick(raw, /reason|cause|comment|note/i), "reasonOf");
var untilOf = /* @__PURE__ */ __name((raw) => pick(raw, /until|till|reopen|endsAt|end_?time|closedTo|expires/i), "untilOf");
var untilText = /* @__PURE__ */ __name((v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? clock3(t) : v;
}, "untilText");
function setup27(app2) {
  const { db } = app2;
  const setting = /* @__PURE__ */ __name(async (k) => (await db.prepare("SELECT value FROM settings WHERE key = ?").get(k))?.value ?? null, "setting");
  const put = /* @__PURE__ */ __name((k, v) => db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v)), "put");
  const log3 = /* @__PURE__ */ __name((key2, kind, text, target, branch, replyTo) => db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?,?,?,?,?,?,?,?,?)").bind(key2, kind, null, text, Date.now(), replyTo || null, null, target, branch || null), "log");
  app2.talabatAvailability = async (list, now) => {
    if (!Array.isArray(list) || !list.length) return;
    const cur = parseJson(await setting("talabat_availability"), {}), writes = [];
    for (const x of list.slice(0, 10)) {
      const outlet = String(x?.outlet || "").replace(/\D/g, "").slice(0, 12);
      if (!outlet) continue;
      const state = String(x.state || "").toUpperCase().slice(0, 30), raw = x.raw && typeof x.raw === "object" ? x.raw : {};
      const was = cur[outlet], branch = OUTLET_BRANCH[outlet] || null, name = branch || String(x.name || outlet).slice(0, 80);
      const open = state === "OPEN";
      if (!was || was.state !== state) {
        if (!open && (!was || was.state === "OPEN" || was.state == null)) {
          const reason = reasonOf(raw), until = untilText(untilOf(raw)), key2 = "talabat:closed:" + outlet + ":" + now;
          const text = "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u26D4 \u0641\u0631\u0639 " + name + " \u0627\u062A\u0642\u0641\u0644 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0633\u0627\u0639\u0629 " + clock3(now) + "\n\u0627\u0644\u062D\u0627\u0644\u0629: " + stateAr(state) + (reason ? "\n\u0627\u0644\u0633\u0628\u0628: " + reason : "\n\u0627\u0644\u0633\u0628\u0628: \u0637\u0644\u0628\u0627\u062A \u0645\u0627\u0643\u062A\u0628\u062A\u0634 \u0633\u0628\u0628") + (until ? "\n\u0644\u062D\u062F: " + until : "");
          const alert = isOperating(now);
          if (alert) writes.push(log3(key2, "talabatClosed", text, "online", branch));
          writes.push(db.prepare("INSERT INTO talabat_closures (day, outlet, name, branch, state, reason, until_text, raw, started_at, ended_at, alert_key) VALUES (?,?,?,?,?,?,?,?,?,NULL,?)").bind(businessDay(now), outlet, String(x.name || "").slice(0, 120), branch, state, reason, until, JSON.stringify(raw).slice(0, 1500), now, alert ? key2 : null));
          cur[outlet] = { state, since: now, key: alert ? key2 : null };
        } else if (open && was && was.state !== "OPEN") {
          const text = "\u{1F6F5} \u0637\u0644\u0628\u0627\u062A | \u2705 \u0641\u0631\u0639 " + name + " \u0631\u062C\u0639 \u0641\u062A\u062D \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0633\u0627\u0639\u0629 " + clock3(now) + (was.since ? "\n\u0643\u0627\u0646 \u0645\u0642\u0641\u0648\u0644 " + mins(now - was.since) + " (\u0645\u0646 " + clock3(was.since) + ")" : "");
          if (was.key) writes.push(log3("resolved:" + was.key, "talabatClosed", text, "online", branch, was.key));
          writes.push(db.prepare("UPDATE talabat_closures SET ended_at = ? WHERE outlet = ? AND ended_at IS NULL").bind(now, outlet));
          cur[outlet] = { state, since: now, key: null };
        } else {
          writes.push(db.prepare("UPDATE talabat_closures SET state = ? WHERE outlet = ? AND ended_at IS NULL").bind(state, outlet));
          cur[outlet] = { ...was, state };
        }
      }
    }
    writes.push(db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("talabat_availability", JSON.stringify(cur)));
    await db.batch(writes.filter(Boolean));
  };
  app2.route("GET", "/api/talabat/closures", async (ctx) => {
    await app2.requireAdmin(ctx);
    const to = validDate(String(ctx.query.to || "")) ? ctx.query.to : businessDay(ctx.now), from = validDate(String(ctx.query.from || "")) ? ctx.query.from : to;
    const rows = await db.prepare("SELECT * FROM talabat_closures WHERE day BETWEEN ? AND ? ORDER BY started_at DESC LIMIT 500").all(from, to);
    const now = parseJson(await setting("talabat_availability"), {});
    return {
      from,
      to,
      now: Object.entries(now).map(([outlet, v]) => ({ outlet, branch: OUTLET_BRANCH[outlet] || outlet, state: v.state, stateAr: stateAr(v.state), since: iso(v.since) })),
      list: rows.map((r) => ({
        branch: r.branch || r.name || r.outlet,
        state: r.state,
        stateAr: stateAr(r.state),
        reason: r.reason,
        until: r.until_text,
        from: iso(r.started_at),
        to: iso(r.ended_at),
        minutes: Math.round(((r.ended_at || ctx.now) - r.started_at) / 6e4),
        open: !r.ended_at,
        raw: parseJson(r.raw, {})
      }))
    };
  });
}
__name(setup27, "setup");

// ../sites/lib/marsad/translate.js
var translate_exports = {};
__export(translate_exports, {
  setup: () => setup28
});
var LATIN = /[A-Za-z]{2,}/;
var WORDS2 = [
  ["in front of", "\u0623\u0645\u0627\u0645"],
  ["infront of", "\u0623\u0645\u0627\u0645"],
  ["in-front of", "\u0623\u0645\u0627\u0645"],
  ["opposite to", "\u0623\u0645\u0627\u0645"],
  ["opposite", "\u0623\u0645\u0627\u0645"],
  ["next to", "\u0628\u062C\u0648\u0627\u0631"],
  ["beside", "\u0628\u062C\u0648\u0627\u0631"],
  ["behind", "\u062E\u0644\u0641"],
  ["near", "\u0628\u0627\u0644\u0642\u0631\u0628 \u0645\u0646"],
  ["close to", "\u0628\u0627\u0644\u0642\u0631\u0628 \u0645\u0646"],
  ["above", "\u0641\u0648\u0642"],
  ["beneath", "\u062A\u062D\u062A"],
  ["corner of", "\u0646\u0627\u0635\u064A\u0629"],
  ["corner", "\u0646\u0627\u0635\u064A\u0629"],
  ["ground floor", "\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0623\u0631\u0636\u064A"],
  ["first floor", "\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0623\u0648\u0644"],
  ["second floor", "\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u062B\u0627\u0646\u064A"],
  ["third floor", "\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u062B\u0627\u0644\u062B"],
  ["street", "\u0634\u0627\u0631\u0639"],
  ["st\\.", "\u0634"],
  ["st", "\u0634"],
  ["road", "\u0637\u0631\u064A\u0642"],
  ["rd", "\u0637\u0631\u064A\u0642"],
  ["avenue", "\u0634\u0627\u0631\u0639"],
  ["ave", "\u0634\u0627\u0631\u0639"],
  ["axis", "\u0645\u062D\u0648\u0631"],
  ["square", "\u0645\u064A\u062F\u0627\u0646"],
  ["building", "\u0639\u0645\u0627\u0631\u0629"],
  ["bldg", "\u0639\u0645\u0627\u0631\u0629"],
  ["bld", "\u0639\u0645\u0627\u0631\u0629"],
  ["tower", "\u0628\u0631\u062C"],
  ["villa", "\u0641\u064A\u0644\u0627"],
  ["house", "\u0628\u064A\u062A"],
  ["compound", "\u0643\u0645\u0628\u0648\u0646\u062F"],
  ["gate", "\u0628\u0648\u0627\u0628\u0629"],
  ["entrance", "\u0645\u062F\u062E\u0644"],
  ["block", "\u0628\u0644\u0648\u0643"],
  ["zone", "\u0645\u0646\u0637\u0642\u0629"],
  ["district", "\u062D\u064A"],
  ["neighborhood", "\u062D\u064A"],
  ["neighbourhood", "\u062D\u064A"],
  ["area", "\u0645\u0646\u0637\u0642\u0629"],
  ["sector", "\u0642\u0637\u0627\u0639"],
  ["floor", "\u0627\u0644\u062F\u0648\u0631"],
  ["apartment", "\u0634\u0642\u0629"],
  ["apt", "\u0634\u0642\u0629"],
  ["flat", "\u0634\u0642\u0629"],
  ["unit", "\u0648\u062D\u062F\u0629"],
  ["ground", "\u0623\u0631\u0636\u064A"],
  ["roof", "\u0631\u0648\u0641"],
  ["duplex", "\u062F\u0648\u0628\u0644\u0643\u0633"],
  ["mall", "\u0645\u0648\u0644"],
  ["cafe", "\u0643\u0627\u0641\u064A\u0647"],
  ["restaurant", "\u0645\u0637\u0639\u0645"],
  ["school", "\u0645\u062F\u0631\u0633\u0629"],
  ["university", "\u062C\u0627\u0645\u0639\u0629"],
  ["mosque", "\u0645\u0633\u062C\u062F"],
  ["church", "\u0643\u0646\u064A\u0633\u0629"],
  ["pharmacy", "\u0635\u064A\u062F\u0644\u064A\u0629"],
  ["hospital", "\u0645\u0633\u062A\u0634\u0641\u0649"],
  ["clinic", "\u0639\u064A\u0627\u062F\u0629"],
  ["bank", "\u0628\u0646\u0643"],
  ["club", "\u0646\u0627\u062F\u064A"],
  ["hotel", "\u0641\u0646\u062F\u0642"],
  ["park", "\u0628\u0627\u0631\u0643"],
  ["market", "\u0645\u0627\u0631\u0643\u062A"],
  ["supermarket", "\u0633\u0648\u0628\u0631 \u0645\u0627\u0631\u0643\u062A"],
  ["gas station", "\u0628\u0646\u0632\u064A\u0646\u0629"],
  ["station", "\u0645\u062D\u0637\u0629"],
  ["bridge", "\u0643\u0648\u0628\u0631\u064A"],
  ["office", "\u0645\u0643\u062A\u0628"],
  ["company", "\u0634\u0631\u0643\u0629"],
  ["bakery", "\u0645\u062E\u0628\u0632"],
  ["north", "\u0627\u0644\u0634\u0645\u0627\u0644\u064A\u0629"],
  ["south", "\u0627\u0644\u062C\u0646\u0648\u0628\u064A\u0629"],
  ["east", "\u0627\u0644\u0634\u0631\u0642\u064A\u0629"],
  ["west", "\u0627\u0644\u063A\u0631\u0628\u064A\u0629"],
  ["new", "\u0627\u0644\u062C\u062F\u064A\u062F\u0629"],
  ["old", "\u0627\u0644\u0642\u062F\u064A\u0645\u0629"],
  ["first", "\u0627\u0644\u0623\u0648\u0644"],
  ["second", "\u0627\u0644\u062B\u0627\u0646\u064A"],
  ["third", "\u0627\u0644\u062B\u0627\u0644\u062B"],
  ["fourth", "\u0627\u0644\u0631\u0627\u0628\u0639"],
  ["fifth", "\u0627\u0644\u062E\u0627\u0645\u0633"],
  ["sixth", "\u0627\u0644\u0633\u0627\u062F\u0633"],
  ["settlement", "\u0627\u0644\u062A\u062C\u0645\u0639"],
  ["cairo", "\u0627\u0644\u0642\u0627\u0647\u0631\u0629"],
  ["giza", "\u0627\u0644\u062C\u064A\u0632\u0629"],
  ["egypt", "\u0645\u0635\u0631"],
  ["nasr city", "\u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631"],
  ["heliopolis", "\u0645\u0635\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629"],
  ["new cairo", "\u0627\u0644\u0642\u0627\u0647\u0631\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629"],
  ["madinaty", "\u0645\u062F\u064A\u0646\u062A\u064A"],
  ["rehab", "\u0627\u0644\u0631\u062D\u0627\u0628"],
  ["tagamoa", "\u0627\u0644\u062A\u062C\u0645\u0639"],
  ["katameya", "\u0627\u0644\u0642\u0637\u0627\u0645\u064A\u0629"],
  ["kattameya", "\u0627\u0644\u0642\u0637\u0627\u0645\u064A\u0629"],
  ["maadi", "\u0627\u0644\u0645\u0639\u0627\u062F\u064A"],
  ["zamalek", "\u0627\u0644\u0632\u0645\u0627\u0644\u0643"],
  ["mokattam", "\u0627\u0644\u0645\u0642\u0637\u0645"],
  ["shorouk", "\u0627\u0644\u0634\u0631\u0648\u0642"],
  ["obour", "\u0627\u0644\u0639\u0628\u0648\u0631"],
  ["katameya dunes", "\u0642\u0637\u0627\u0645\u064A\u0629 \u062F\u064A\u0648\u0646\u0632"],
  ["katameya heights", "\u0642\u0637\u0627\u0645\u064A\u0629 \u0647\u0627\u064A\u062A\u0633"],
  ["dunes", "\u062F\u064A\u0648\u0646\u0632"],
  ["cluster", "\u0643\u0644\u0627\u0633\u062A\u0631"],
  ["hyde park", "\u0647\u0627\u064A\u062F \u0628\u0627\u0631\u0643"],
  ["mivida", "\u0645\u064A\u0641\u064A\u062F\u0627"],
  ["mountain view", "\u0645\u0627\u0648\u0646\u062A\u0646 \u0641\u064A\u0648"],
  ["makram ebeid", "\u0645\u0643\u0631\u0645 \u0639\u0628\u064A\u062F"],
  ["abbas el akkad", "\u0639\u0628\u0627\u0633 \u0627\u0644\u0639\u0642\u0627\u062F"],
  ["abbas al akkad", "\u0639\u0628\u0627\u0633 \u0627\u0644\u0639\u0642\u0627\u062F"],
  ["el nasr", "\u0627\u0644\u0646\u0635\u0631"],
  ["al nasr", "\u0627\u0644\u0646\u0635\u0631"],
  ["nasr", "\u0646\u0635\u0631"],
  ["and", "\u0648"],
  ["the", ""],
  ["of", ""],
  ["no\\.", "\u0631\u0642\u0645"],
  ["number", "\u0631\u0642\u0645"],
  // Complete phrases precede individual words so negatives keep their meaning.
  ["don't ring the bell", "\u0645\u062A\u0636\u0631\u0628\u0634 \u0627\u0644\u062C\u0631\u0633"],
  ["do not ring the bell", "\u0645\u062A\u0636\u0631\u0628\u0634 \u0627\u0644\u062C\u0631\u0633"],
  ["no onions", "\u0645\u0646 \u063A\u064A\u0631 \u0628\u0635\u0644"],
  ["when you arrive", "\u0644\u0645\u0627 \u062A\u0648\u0635\u0644"],
  ["on arrival", "\u0639\u0646\u062F \u0627\u0644\u0648\u0635\u0648\u0644"],
  ["well done", "\u062A\u0633\u0648\u064A\u0629 \u0643\u0627\u0645\u0644\u0629"],
  ["not spicy", "\u063A\u064A\u0631 \u062D\u0627\u0631"],
  ["no spices", "\u0628\u062F\u0648\u0646 \u062A\u0648\u0627\u0628\u0644"],
  ["no salt", "\u0628\u062F\u0648\u0646 \u0645\u0644\u062D"],
  ["no sauce", "\u0628\u062F\u0648\u0646 \u0635\u0648\u0635"],
  ["sauce on the side", "\u0627\u0644\u0635\u0648\u0635 \u0639\u0644\u0649 \u062C\u0646\u0628"],
  ["extra bread", "\u0639\u064A\u0634 \u0632\u064A\u0627\u062F\u0629"],
  ["extra rice", "\u0623\u0631\u0632 \u0632\u064A\u0627\u062F\u0629"],
  ["white rice", "\u0623\u0631\u0632 \u0623\u0628\u064A\u0636"],
  ["basmati rice", "\u0623\u0631\u0632 \u0628\u0633\u0645\u062A\u064A"],
  ["rice with vermicelli", "\u0623\u0631\u0632 \u0628\u0627\u0644\u0634\u0639\u0631\u064A\u0629"],
  ["with liver", "\u0628\u0627\u0644\u0643\u0628\u062F\u0629"],
  ["with nuts", "\u0628\u0627\u0644\u0645\u0643\u0633\u0631\u0627\u062A"],
  ["bread", "\u0639\u064A\u0634"],
  ["onions", "\u0628\u0635\u0644"],
  ["onion", "\u0628\u0635\u0644"],
  ["pickles", "\u0645\u062E\u0644\u0644"],
  ["sauce", "\u0635\u0648\u0635"],
  ["salt", "\u0645\u0644\u062D"],
  ["mohamed", "\u0645\u062D\u0645\u062F"],
  ["mohammed", "\u0645\u062D\u0645\u062F"],
  ["mohammad", "\u0645\u062D\u0645\u062F"],
  ["ahmed", "\u0623\u062D\u0645\u062F"],
  ["mahmoud", "\u0645\u062D\u0645\u0648\u062F"],
  ["karim", "\u0643\u0631\u064A\u0645"],
  ["kareem", "\u0643\u0631\u064A\u0645"],
  ["ismail", "\u0625\u0633\u0645\u0627\u0639\u064A\u0644"],
  ["baraka", "\u0628\u0631\u0643\u0629"],
  ["mona", "\u0645\u0646\u0649"],
  ["hend", "\u0647\u0646\u062F"],
  ["atia", "\u0639\u0637\u064A\u0629"],
  ["ali", "\u0639\u0644\u064A"],
  ["hassan", "\u062D\u0633\u0646"],
  ["hussein", "\u062D\u0633\u064A\u0646"],
  ["omar", "\u0639\u0645\u0631"],
  ["youssef", "\u064A\u0648\u0633\u0641"],
  // comments
  ["please", "\u0645\u0646 \u0641\u0636\u0644\u0643"],
  ["call me", "\u0643\u0644\u0645\u0646\u064A"],
  ["call", "\u0627\u062A\u0635\u0644"],
  ["ring the bell", "\u0627\u0636\u0631\u0628 \u0627\u0644\u062C\u0631\u0633"],
  ["don't ring", "\u0645\u062A\u0636\u0631\u0628\u0634 \u0627\u0644\u062C\u0631\u0633"],
  ["no onion", "\u0645\u0646 \u063A\u064A\u0631 \u0628\u0635\u0644"],
  ["without", "\u0645\u0646 \u063A\u064A\u0631"],
  ["extra", "\u0632\u064A\u0627\u062F\u0629"],
  ["spicy", "\u062D\u0627\u0631"],
  ["no", "\u0645\u0646 \u063A\u064A\u0631"],
  ["thanks", "\u0634\u0643\u0631\u0627\u064B"],
  ["thank you", "\u0634\u0643\u0631\u0627\u064B"]
].sort((a, b) => b[0].length - a[0].length);
var RX = WORDS2.map(([en, ar2]) => [new RegExp("(^|[^A-Za-z])" + en.replace(/ /g, "\\s+") + "(?=[^A-Za-z]|$)", "gi"), ar2]);
function dictionary(text) {
  let s = String(text).replace(/\bno\.?\s*(?=\d)/gi, "\u0631\u0642\u0645 ");
  s = s.replace(
    /\b((?:(?:El|Al)[-\s])?[A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*){0,3})\s+(Street|St\.?|Road|Rd\.?|Axis)(?=[^A-Za-z]|$)/g,
    (m, name, w) => ({ street: "\u0634\u0627\u0631\u0639", st: "\u0634\u0627\u0631\u0639", "st.": "\u0634\u0627\u0631\u0639", road: "\u0637\u0631\u064A\u0642", rd: "\u0637\u0631\u064A\u0642", "rd.": "\u0637\u0631\u064A\u0642", axis: "\u0645\u062D\u0648\u0631" })[w.toLowerCase()] + " " + name
  );
  s = s.replace(/\b(?:El|Al)[-\s](?=[A-Za-z])/g, "\u0627\u0644");
  for (const [rx, ar2] of RX) s = s.replace(rx, (m, pre) => pre + ar2);
  return s.replace(/\s{2,}/g, " ").replace(/\s+([،,])/g, "$1").trim();
}
__name(dictionary, "dictionary");
var PROMPT = "\u0623\u0646\u062A \u0645\u0648\u0638\u0641 \u0643\u0648\u0644 \u0633\u0646\u062A\u0631 \u0641\u064A \u0645\u0637\u0639\u0645 \u0641\u064A \u0627\u0644\u0642\u0627\u0647\u0631\u0629 \u0628\u064A\u0643\u062A\u0628 \u0627\u0644\u0623\u0648\u0631\u062F\u0631 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0633\u062A\u0645. \u062D\u0648\u0651\u0644 \u0627\u0644\u0646\u0635 \u062F\u0647 \u0644\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0645\u0635\u0631\u064A \u0632\u064A \u0645\u0627 \u0627\u0644\u0645\u0648\u0638\u0641 \u0628\u064A\u0643\u062A\u0628\u0647 \u0644\u0644\u0637\u064A\u0627\u0631: \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 \u0628\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0623\u0645\u0627\u0643\u0646 \u0627\u0644\u0645\u0639\u0631\u0648\u0641\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064A (\u0645\u062B\u0644\u0627\u064B Katameya Dunes = \u0642\u0637\u0627\u0645\u064A\u0629 \u062F\u064A\u0648\u0646\u0632\u060C Street 70 = \u0634\u0627\u0631\u0639 70\u060C infront of = \u0623\u0645\u0627\u0645)\u060C \u0648\u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0634\u062E\u0635\u064A\u0629 \u062A\u062A\u0643\u062A\u0628 \u0628\u0627\u0644\u0639\u0631\u0628\u064A (Ismail Baraka = \u0625\u0633\u0645\u0627\u0639\u064A\u0644 \u0628\u0631\u0643\u0629)\u060C \u0648\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0628\u0645\u0639\u0646\u0627\u0647\u0627 \u0645\u0634 \u062D\u0631\u0641\u064A. \u0633\u064A\u0628 \u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0648\u0627\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0644\u064A \u0645\u0648\u062C\u0648\u062F \u0632\u064A \u0645\u0627 \u0647\u0648\u060C \u0648\u0645\u062A\u0632\u0648\u062F\u0634 \u0648\u0644\u0627 \u062A\u0634\u064A\u0644 \u0645\u0639\u0644\u0648\u0645\u0629. \u0631\u062C\u0651\u0639 \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u062A\u0631\u062C\u0645 \u0628\u0633 \u0645\u0646 \u063A\u064A\u0631 \u0623\u064A \u0634\u0631\u062D.";
function setup28(app2) {
  const { db } = app2;
  const key2 = /* @__PURE__ */ __name(() => app2.config.openaiKey || null, "key");
  const memo = /* @__PURE__ */ new Map();
  async function cached(texts2) {
    const out = /* @__PURE__ */ new Map(), want = [...new Set(texts2.filter((t) => t && LATIN.test(t)))];
    const miss = want.filter((t) => {
      if (memo.has(t)) {
        out.set(t, memo.get(t));
        return false;
      }
      return true;
    });
    for (let i = 0; i < miss.length; i += 50) {
      const part = miss.slice(i, i + 50);
      const rows = await db.prepare("SELECT src, ar, how FROM translations WHERE src IN (" + part.map(() => "?").join(",") + ")").all(...part);
      for (const r of rows) {
        const v = { ar: r.ar, how: r.how };
        out.set(r.src, v);
        if (r.how === "ai") memo.set(r.src, v);
      }
    }
    return out;
  }
  __name(cached, "cached");
  async function save(src, ar2, how) {
    await db.prepare("INSERT INTO translations (src, ar, how, at) VALUES (?,?,?,?) ON CONFLICT(src) DO UPDATE SET ar = excluded.ar, how = excluded.how, at = excluded.at WHERE translations.how <> 'ai' OR excluded.how = 'ai'").run(src, ar2, how, app2.now());
    if (how === "ai") memo.set(src, { ar: ar2, how });
  }
  __name(save, "save");
  async function ai(text) {
    const k = key2();
    if (!k) return null;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12e3);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: "Bearer " + k },
        body: JSON.stringify({
          model: app2.config.openaiModel || "gpt-4o-mini",
          temperature: 0,
          max_tokens: 400,
          messages: [{ role: "system", content: PROMPT }, { role: "user", content: String(text).slice(0, 1e3) }]
        })
      });
      if (!r.ok) return null;
      const j = await r.json(), v = String(j?.choices?.[0]?.message?.content || "").trim();
      return v && v.length < 1500 ? v : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  __name(ai, "ai");
  const busy = /* @__PURE__ */ new Set();
  app2.toArabic = /* @__PURE__ */ __name(async function toArabic(texts2, { waitUntil, wait = false } = {}) {
    const have = await cached(texts2), res = /* @__PURE__ */ new Map();
    const todo = [];
    for (const t of new Set(texts2.filter(Boolean))) {
      if (!LATIN.test(t)) {
        res.set(t, t);
        continue;
      }
      const c = have.get(t);
      if (c?.how === "ai") res.set(t, c.ar);
      else res.set(t, dictionary(t));
      if ((!c || c.how !== "ai") && key2() && !busy.has(t)) todo.push(t);
    }
    await Promise.all([...res].filter(([t]) => LATIN.test(t) && !have.get(t)).map(([t, v]) => save(t, v, "dict").catch(() => {
    })));
    const run = /* @__PURE__ */ __name(async (t) => {
      busy.add(t);
      try {
        const v = await ai(t);
        if (v) {
          await save(t, v, "ai");
          res.set(t, v);
        }
      } finally {
        busy.delete(t);
      }
    }, "run");
    if (todo.length) {
      if (wait) await Promise.all(todo.slice(0, 8).map(run));
      else if (waitUntil) waitUntil(Promise.all(todo.slice(0, 6).map(run)));
    }
    return res;
  }, "toArabic");
  app2.arabicDictionary = dictionary;
}
__name(setup28, "setup");

// ../sites/lib/marsad/modules.js
var MODULES = [translate_exports, admin_exports, employees_exports, sessions_exports, dashboard_exports, breaks_exports, messages_exports, shifts_exports, history_exports, engine_exports, telegram_exports, import_rows_exports, ops_exports, range_exports, orders_exports, names_exports, learn_exports, reviews_exports, site_exports, talabat_exports, cancels_exports, whatsapp_exports, transfer_exports, talabat_actions_exports, system_watch_exports, backup_exports, kpi_exports, branch_closures_exports];

// ../sites/lib/marsad/core.js
function buildCore(db, config2, { now } = {}) {
  const app2 = createApp({ db, config: config2, now });
  for (const m of MODULES) m.setup(app2);
  return app2;
}
__name(buildCore, "buildCore");

// worker.js
var app = null;
function server(env2) {
  if (!env2.DB) throw new Error('D1 binding "DB" is missing');
  app ??= buildCore(d1Adapter(env2.DB), {
    secret: env2.MARSAD_SECRET || void 0,
    adminPassword: env2.MARSAD_ADMIN_PASSWORD || void 0,
    telegramApi: env2.TELEGRAM_API || void 0,
    openaiKey: env2.OPENAI_API_KEY || void 0,
    telegramTimer: "requests",
    allowedOrigins: ["https://karim87nu-create.github.io"]
  });
  return app;
}
__name(server, "server");
var worker_default = {
  async fetch(request, env2, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/health") {
      try {
        return await server(env2).fetch(request, { waitUntil: /* @__PURE__ */ __name((p) => ctx.waitUntil(Promise.resolve(p).catch(() => {
        })), "waitUntil") });
      } catch (error3) {
        console.error("marsad_unhandled", error3);
        return Response.json({ error: "server_error" }, { status: 500 });
      }
    }
    if (url.pathname === "/") return Response.redirect(url.origin + "/admin/", 302);
    return env2.ASSETS.fetch(request);
  }
};

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } catch (e) {
    const error3 = reduceError(e);
    const body = JSON.stringify(error3);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-zmxAXu/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../tmp/claude-0/-home-claude/62dd4f77-7834-5630-a956-9be35e4b78b9/scratchpad/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-zmxAXu/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env2, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

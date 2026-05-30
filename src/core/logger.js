/**
 * Ring-buffer logger shared by every module.
 *
 * Keeps the last N entries in memory, mirrors them to the console, and notifies
 * subscribers (the in-game panel) so the activity feed updates live.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const MAX = 300;

  const buffer = [];
  const listeners = new Set();

  function push(level, args) {
    const entry = {
      t: Date.now(),
      level,
      msg: args.map((a) => (typeof a === 'object' ? safeJson(a) : String(a))).join(' ')
    };
    buffer.push(entry);
    if (buffer.length > MAX) buffer.shift();
    const tag = `%c[TanothBot]`;
    const style = level === 'error' ? 'color:#e74c3c'
      : level === 'warn' ? 'color:#e67e22'
      : level === 'success' ? 'color:#2ecc71'
      : 'color:#3498db';
    // eslint-disable-next-line no-console
    (console[level] || console.log)(tag, style, ...args);
    listeners.forEach((fn) => { try { fn(entry); } catch (_) {} });
  }

  function safeJson(o) {
    try { return JSON.stringify(o); } catch (_) { return '[object]'; }
  }

  TB.Logger = {
    info: (...a) => push('info', a),
    warn: (...a) => push('warn', a),
    error: (...a) => push('error', a),
    success: (...a) => push('success', a),
    debug: (...a) => push('debug', a),
    history: () => buffer.slice(),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    clear: () => { buffer.length = 0; }
  };
})();

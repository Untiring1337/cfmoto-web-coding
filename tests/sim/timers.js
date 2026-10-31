// Browser-side timer probe, loaded before the page and before the mock.
// - window.__timers: every timer of 500 ms or more that the page sets, with the number of adapter commands sent
//   at that moment. This puts the page's timeouts and waits into the golden snapshot.
// - window.__pendingTimers: timers shorter than 30 s that have not fired or been cleared yet. The harness waits
//   until this set is empty before it takes the snapshot, so delayed actions cannot hide from it.
//   (Longer timers, for example the 60 s lockout wait, are recorded in __timers but are not waited for.)
(function () {
  'use strict';
  const realSet = window.setTimeout, realClear = window.clearTimeout;
  const timers = []; const pending = new Set();
  window.__timers = timers; window.__pendingTimers = pending;
  window.setTimeout = function (fn, ms) {
    const delay = Number(ms) || 0, args = Array.prototype.slice.call(arguments, 2);
    if (delay >= 500) timers.push({ ms: delay, at: (window.__sent || []).length });
    let id;
    const run = function () { pending.delete(id); return typeof fn === 'function' ? fn.apply(this, args) : undefined; };
    id = realSet.call(window, run, ms);
    if (delay < 30000) pending.add(id);
    return id;
  };
  window.clearTimeout = function (id) { pending.delete(id); return realClear.call(window, id); };
})();

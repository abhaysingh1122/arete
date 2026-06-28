// ============================================================================
// core.js — pure, DOM-free logic for dates, daily reset, habits and streaks.
// Shared by the renderer (browser) and the test harness (Node), so both run the
// exact same algorithms. No DOM, no localStorage, no globals.
// ============================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.AreteCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -- clock (overridable so tests can fast-forward through days) --------------
  let _now = function () { return new Date(); };
  function setClock(fn) { _now = fn; }

  // -- date helpers ------------------------------------------------------------
  // All day arithmetic anchors at NOON to stay safe across daylight-saving shifts.
  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function dayKey(off) { const d = _now(); d.setDate(d.getDate() + (off || 0)); return iso(d); }
  function addDays(key, n) { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
  function dowOf(key) { return new Date(key + 'T12:00:00').getDay(); }
  // whole-day distance between two YYYY-MM-DD keys (DST-safe, rounded)
  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  }

  // the current "logical day" — rolls over at the configured reset time
  function today(resetTime) {
    const parts = (/^\d\d:\d\d$/.test(resetTime || '') ? resetTime : '00:00').split(':').map(Number);
    const now = _now();
    if (now.getHours() * 60 + now.getMinutes() < parts[0] * 60 + parts[1]) return dayKey(-1);
    return dayKey(0);
  }
  function last7(t) { return [6, 5, 4, 3, 2, 1, 0].map(function (n) { return addDays(t, -n); }); }

  // -- habits ------------------------------------------------------------------
  function habitDone(h, key) { return (h.history[key] || 0) >= h.timesPerDay; }
  function isScheduled(h, key) { return h.days.includes(dowOf(key)); }

  // schedule-aware streak: only scheduled days count; today gets grace if not done
  function streakOf(h, cur) {
    let s = 0;
    for (let i = 0; i < 400; i++) {
      const key = addDays(cur, -i);
      if (!h.days.includes(dowOf(key))) continue;   // not a scheduled day → ignore
      if (habitDone(h, key)) s++;
      else if (key === cur) continue;               // today not done yet → grace
      else break;                                   // missed a scheduled day → stop
    }
    return s;
  }

  // -- stats -------------------------------------------------------------------
  function activityMap(taskLog, habits) {
    const m = {};
    for (const k in taskLog) m[k] = (m[k] || 0) + taskLog[k];
    habits.forEach(function (h) {
      for (const k in h.history) m[k] = (m[k] || 0) + (h.history[k] || 0);
    });
    return m;
  }
  function overallStreak(m, cur) {
    let s = 0, i = m[cur] ? 0 : 1;            // grace for today if no activity yet
    for (; ; i++) { if (m[addDays(cur, -i)]) s++; else break; }
    return s;
  }
  function bestStreak(m) {
    const keys = Object.keys(m).filter(function (k) { return m[k] > 0; }).sort();
    let best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      if (prev) run = daysBetween(prev, k) === 1 ? run + 1 : 1;
      else run = 1;
      best = Math.max(best, run);
      prev = k;
    });
    return best;
  }

  // -- daily reset (pure) ------------------------------------------------------
  // Returns the new task list and whether anything changed. Mutates meta.lastResetDay.
  // On a genuine day roll-over, completed tasks are dropped; unfinished carry over.
  function computeReset(tasks, meta, cur) {
    if (meta.lastResetDay === cur) return { tasks: tasks, changed: false, rolled: false };
    const firstLaunch = !meta.lastResetDay;
    const next = firstLaunch ? tasks : tasks.filter(function (t) { return !t.done; });
    meta.lastResetDay = cur;
    return { tasks: next, changed: true, rolled: !firstLaunch };
  }

  return {
    setClock: setClock,
    iso: iso, dayKey: dayKey, addDays: addDays, dowOf: dowOf, daysBetween: daysBetween,
    today: today, last7: last7,
    habitDone: habitDone, isScheduled: isScheduled, streakOf: streakOf,
    activityMap: activityMap, overallStreak: overallStreak, bestStreak: bestStreak,
    computeReset: computeReset,
  };
});

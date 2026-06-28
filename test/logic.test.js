// ============================================================================
// Sandbox test harness for Arete's time-dependent logic.
// Fast-forwards through simulated days (a real daily reset would take days to
// observe) and asserts daily refresh, task reset and every streak path.
//   run:  npm test     (or: node test/logic.test.js)
// ============================================================================
const C = require('../core.js');

let MOCK = new Date('2026-06-01T09:00:00');
C.setClock(() => new Date(MOCK.getTime()));
const setNow = (day, hm) => { MOCK = new Date(day + 'T' + (hm || '09:00') + ':00'); };

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, got) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')); }
}
const eq = (name, a, b) => ok(name, a === b, a);

// helper: build a habit, mark a set of date keys done (count = timesPerDay unless given)
function habit(days, opts = {}) {
  const h = { days, timesPerDay: opts.timesPerDay || 1, history: {} };
  (opts.done || []).forEach(k => { h.history[k] = opts.count || h.timesPerDay; });
  return h;
}

// ──────────────────────────────────────────────────────────────────────────
// 1. DAILY RESET — completed tasks clear on day roll-over; unfinished carry over
// ──────────────────────────────────────────────────────────────────────────
(function dailyReset() {
  const meta = {};
  let tasks = [{ id: 'a', done: false }, { id: 'b', done: true }];

  setNow('2026-06-01');
  let r = C.computeReset(tasks, meta, C.today('00:00'));
  ok('reset: first launch flags changed', r.changed === true);
  ok('reset: first launch does NOT clear (rolled=false)', r.rolled === false);
  eq('reset: first launch keeps all tasks', r.tasks.length, 2);
  eq('reset: lastResetDay stamped', meta.lastResetDay, '2026-06-01');
  tasks = r.tasks;

  // same day again — no-op
  r = C.computeReset(tasks, meta, C.today('00:00'));
  ok('reset: same day is a no-op', r.changed === false);

  // next day — completed task dropped, unfinished carries over
  setNow('2026-06-02');
  r = C.computeReset(tasks, meta, C.today('00:00'));
  ok('reset: new day rolls (rolled=true)', r.rolled === true);
  eq('reset: completed task cleared, unfinished kept', r.tasks.length, 1);
  eq('reset: surviving task is the unfinished one', r.tasks[0].id, 'a');
  eq('reset: lastResetDay advanced', meta.lastResetDay, '2026-06-02');

  // skipping multiple days still rolls exactly once
  setNow('2026-06-05');
  r = C.computeReset(r.tasks, meta, C.today('00:00'));
  ok('reset: multi-day gap still rolls', r.rolled === true);
  eq('reset: lastResetDay jumps to current', meta.lastResetDay, '2026-06-05');
})();

// ──────────────────────────────────────────────────────────────────────────
// 2. RESET-TIME ROLLOVER — the "logical day" flips at the configured time
// ──────────────────────────────────────────────────────────────────────────
(function resetTime() {
  setNow('2026-06-10', '23:30');
  eq('rollover: 23:30 with 00:00 reset = that day', C.today('00:00'), '2026-06-10');

  setNow('2026-06-11', '02:00');
  eq('rollover: 02:00 with 04:00 reset = previous day', C.today('04:00'), '2026-06-10');
  eq('rollover: 02:00 with 00:00 reset = that day', C.today('00:00'), '2026-06-11');

  setNow('2026-06-11', '04:00');
  eq('rollover: exactly at reset time = new day', C.today('04:00'), '2026-06-11');
})();

// ──────────────────────────────────────────────────────────────────────────
// 3. HABIT DAILY REFRESH — a habit done today shows un-done tomorrow
// ──────────────────────────────────────────────────────────────────────────
(function habitRefresh() {
  const h = habit([0, 1, 2, 3, 4, 5, 6]);  // every day
  setNow('2026-06-01');
  const d1 = C.today('00:00');
  h.history[d1] = 1;
  ok('refresh: done today', C.habitDone(h, d1) === true);

  setNow('2026-06-02');
  const d2 = C.today('00:00');
  ok('refresh: auto un-done next day', C.habitDone(h, d2) === false);
  eq('refresh: streak holds via grace before today done', C.streakOf(h, d2), 1);

  h.history[d2] = 1;
  eq('refresh: streak grows when done again', C.streakOf(h, d2), 2);
})();

// ──────────────────────────────────────────────────────────────────────────
// 4. STREAK — grace today, break on a missed scheduled day
// ──────────────────────────────────────────────────────────────────────────
(function streakBasics() {
  // every-day habit done Jun1-3, today Jun4 not done yet → grace keeps it at 3
  const h = habit([0, 1, 2, 3, 4, 5, 6], { done: ['2026-06-01', '2026-06-02', '2026-06-03'] });
  eq('streak: 3 consecutive + grace today', C.streakOf(h, '2026-06-04'), 3);

  // a full missed day (Jun3 absent, asking on Jun4) breaks it
  const h2 = habit([0, 1, 2, 3, 4, 5, 6], { done: ['2026-06-01', '2026-06-02'] });
  eq('streak: missed yesterday breaks to 0 (today grace only)', C.streakOf(h2, '2026-06-04'), 0);

  // done today counts immediately
  const h3 = habit([0, 1, 2, 3, 4, 5, 6], { done: ['2026-06-03', '2026-06-04'] });
  eq('streak: includes today when done', C.streakOf(h3, '2026-06-04'), 2);
})();

// ──────────────────────────────────────────────────────────────────────────
// 5. STREAK — schedule-aware (non-scheduled days are skipped, not breaks)
// ──────────────────────────────────────────────────────────────────────────
(function streakSchedule() {
  // Mon/Wed/Fri habit. Find a Friday, build a clean Mon-Wed-Fri run.
  // 2026-06-05 is a Friday (verify via engine), 06-03 Wed, 06-01 Mon.
  eq('schedule: 2026-06-05 is Friday', C.dowOf('2026-06-05'), 5);
  const mwf = habit([1, 3, 5], { done: ['2026-06-01', '2026-06-03', '2026-06-05'] });
  // asking on Friday: Thu & Tue are not scheduled → skipped, streak = 3
  eq('schedule: Mon+Wed+Fri streak ignores off-days', C.streakOf(mwf, '2026-06-05'), 3);

  // miss the Wednesday → only Friday counts back to the gap
  const gap = habit([1, 3, 5], { done: ['2026-06-01', '2026-06-05'] });
  eq('schedule: missed a scheduled day breaks run', C.streakOf(gap, '2026-06-05'), 1);

  // doing it on a NON-scheduled day does not earn streak credit
  const off = habit([1, 3, 5], { done: ['2026-06-04'] }); // Thursday
  eq('schedule: off-day completion gives no streak', C.streakOf(off, '2026-06-05'), 0);
})();

// ──────────────────────────────────────────────────────────────────────────
// 6. STREAK — timesPerDay must be fully met to count
// ──────────────────────────────────────────────────────────────────────────
(function timesPerDay() {
  const h = habit([0, 1, 2, 3, 4, 5, 6], { timesPerDay: 3 });
  h.history['2026-06-01'] = 3;
  h.history['2026-06-02'] = 2;   // partial
  ok('count: full count is done', C.habitDone(h, '2026-06-01') === true);
  ok('count: partial count is NOT done', C.habitDone(h, '2026-06-02') === false);
  eq('count: partial day breaks streak', C.streakOf(h, '2026-06-02'), 1); // 06-02 grace, 06-01 done
})();

// ──────────────────────────────────────────────────────────────────────────
// 7. STATS — activity map + overall streak (tasks AND habits combined)
// ──────────────────────────────────────────────────────────────────────────
(function statsStreak() {
  const taskLog = { '2026-06-01': 2, '2026-06-02': 1 };
  const habits = [habit([0, 1, 2, 3, 4, 5, 6], { done: ['2026-06-03'] })];
  const m = C.activityMap(taskLog, habits);
  eq('stats: map merges task days', m['2026-06-01'], 2);
  eq('stats: map merges habit day', m['2026-06-03'], 1);

  eq('stats: overall streak across tasks+habits', C.overallStreak(m, '2026-06-03'), 3);
  eq('stats: grace day keeps streak', C.overallStreak(m, '2026-06-04'), 3);
  eq('stats: two idle days break streak', C.overallStreak(m, '2026-06-05'), 0);

  // a gap immediately before today → streak is just today
  const m2 = C.activityMap({ '2026-06-01': 1, '2026-06-03': 1 }, []);
  eq('stats: gap before today → 1', C.overallStreak(m2, '2026-06-03'), 1);
})();

// ──────────────────────────────────────────────────────────────────────────
// 8. BEST STREAK — longest run, and DST-safe across spring-forward
// ──────────────────────────────────────────────────────────────────────────
(function bestStreakTests() {
  const m = C.activityMap({
    '2026-06-01': 1, '2026-06-02': 1, '2026-06-03': 1, // run of 3
    '2026-06-05': 1, '2026-06-06': 1,                  // run of 2
  }, []);
  eq('best: longest run wins', C.bestStreak(m), 3);

  // zero-valued keys (from un-toggling a task) must not count
  const m2 = C.activityMap({ '2026-06-01': 1, '2026-06-02': 0, '2026-06-03': 1 }, []);
  eq('best: zero-valued day is not a bridge', C.bestStreak(m2), 1);

  // DST spring-forward boundaries — consecutive calendar days must stay a run
  // (US: 2026-03-08, EU: 2026-03-29). A midnight-anchored diff would mis-count.
  const us = C.activityMap({ '2026-03-07': 1, '2026-03-08': 1, '2026-03-09': 1, '2026-03-10': 1 }, []);
  eq('best: DST (US) run unbroken', C.bestStreak(us), 4);
  const eu = C.activityMap({ '2026-03-28': 1, '2026-03-29': 1, '2026-03-30': 1, '2026-03-31': 1 }, []);
  eq('best: DST (EU) run unbroken', C.bestStreak(eu), 4);
})();

// ──────────────────────────────────────────────────────────────────────────
// 9. FULL 30-DAY SIMULATION — daily reset + habit refresh together
// ──────────────────────────────────────────────────────────────────────────
(function simulate30() {
  const meta = {};
  let tasks = [];
  const h = habit([0, 1, 2, 3, 4, 5, 6]);   // daily habit
  let missed = false;

  for (let day = 1; day <= 30; day++) {
    const key = '2026-07-' + String(day).padStart(2, '0');
    setNow(key);
    const cur = C.today('00:00');

    // morning roll-over
    const r = C.computeReset(tasks, meta, cur);
    tasks = r.tasks;

    // every completed task from the prior day must be gone after the roll
    ok('sim day ' + day + ': no leftover done tasks', tasks.every(t => !t.done));

    // add a task and complete it; tick the habit — except skip day 15 entirely
    tasks.push({ id: 't' + day, done: false });
    if (day !== 15) {
      tasks[tasks.length - 1].done = true;
      h.history[cur] = 1;
    } else { missed = true; }
  }

  // after a clean run the broken streak should only reflect days since the miss
  setNow('2026-07-30');
  const finalStreak = C.streakOf(h, C.today('00:00'));
  eq('sim: streak = days since the day-15 miss (16..30)', finalStreak, 15);
  ok('sim: a mid-run miss happened', missed === true);
})();

// ──────────────────────────────────────────────────────────────────────────
console.log(`\nArete logic sandbox: ${pass} passed, ${fail} failed.`);
if (fail) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
else console.log('All daily-refresh & streak paths verified. ✅');

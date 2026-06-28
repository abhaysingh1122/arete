// ============================================================================
// Sandbox scenario (Gudan's walk-through).
//   Board = 8 items: 5 one-off tasks + 3 daily recurring habits.
//   On the day: complete 3 of the 5 tasks and 2 of the 3 habits.
//   Verify: daily streak updates, the 30-day calendar logs the right count,
//   and a habit done N days in a row reads as a "×N" streak — auto-synced to
//   the calendar's per-day completion count.
//   run:  node test/scenario.js
// ============================================================================
const C = require('../core.js');

let MOCK = new Date('2026-06-01T09:00:00');
C.setClock(() => new Date(MOCK.getTime()));
const setNow = (d, hm) => { MOCK = new Date(d + 'T' + (hm || '09:00') + ':00'); };
const everyDay = [0, 1, 2, 3, 4, 5, 6];

// ── the board ───────────────────────────────────────────────────────────────
let tasks = [
  { id: 't1', text: 'Email client',     done: false },
  { id: 't2', text: 'Fix invoice bug',  done: false },
  { id: 't3', text: 'Write proposal',   done: false },
  { id: 't4', text: 'Call supplier',    done: false },
  { id: 't5', text: 'Plan next sprint', done: false },
];
let habits = [
  { name: 'Workout',   days: everyDay, timesPerDay: 1, history: {} },
  { name: 'Read',      days: everyDay, timesPerDay: 1, history: {} },
  { name: 'Meditate',  days: everyDay, timesPerDay: 1, history: {} },
];
let taskLog = {};
let meta = {};

console.log('Board created: ' + tasks.length + ' tasks + ' + habits.length + ' daily habits = ' + (tasks.length + habits.length) + ' items.\n');

// ── the day: complete 3 of 5 tasks, 2 of 3 habits ────────────────────────────
setNow('2026-06-01');
const day = C.today('00:00');
C.computeReset(tasks, meta, day);                 // first launch stamps the day

['t1', 't2', 't3'].forEach(id => {                // 3 of 5 tasks
  const t = tasks.find(x => x.id === id);
  t.done = true; t.completedAt = day;
  taskLog[day] = (taskLog[day] || 0) + 1;
});
habits[0].history[day] = 1;                        // Workout  ✓
habits[1].history[day] = 1;                        // Read     ✓
// Meditate left undone

const m = C.activityMap(taskLog, habits);
const tasksDone = tasks.filter(t => t.done).length;
const habitsDone = habits.filter(h => C.habitDone(h, day)).length;

console.log('── ' + day + ' ──');
console.log('  tasks done  : ' + tasksDone + ' / ' + tasks.length);
console.log('  habits done : ' + habitsDone + ' / ' + habits.length);
console.log('  CALENDAR count for ' + day + ' = ' + m[day] + '  (3 tasks + 2 habits = should be 5)');
console.log('  daily streak (overall) = ' + C.overallStreak(m, day));
console.log('  per-habit streak:');
habits.forEach(h => console.log('     ' + h.name.padEnd(9) + ' ×' + C.streakOf(h, day) + (C.habitDone(h, day) ? '  ✓ today' : '  · not today')));

// ── the "×N" rule: do Workout 5 days straight → ×5, calendar logs each day ────
console.log('\n── Workout, 5 days straight (×N rule) ──');
['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].forEach(d => {
  setNow(d);
  const k = C.today('00:00');
  habits[0].history[k] = 1;                        // tick Workout
  const mm = C.activityMap(taskLog, habits);
  console.log('  ' + k + ' → Workout ×' + C.streakOf(habits[0], k) + '   | calendar that day = ' + mm[k]);
});

// ── assertions ───────────────────────────────────────────────────────────────
setNow('2026-06-05');
const finalDay = C.today('00:00');
const finalMap = C.activityMap(taskLog, habits);
let bad = 0;
const check = (label, got, want) => { const okk = got === want; if (!okk) bad++; console.log('  ' + (okk ? '✓' : '✗') + ' ' + label + ' = ' + got + (okk ? '' : ' (expected ' + want + ')')); };

console.log('\n── checks ──');
check('calendar count on 2026-06-01', m['2026-06-01'], 5);   // 3 tasks + 2 habits
check('Workout streak after 5 days', C.streakOf(habits[0], finalDay), 5);
check('Read streak (1 day only)', C.streakOf(habits[1], finalDay), 0);   // done only on day-1, missed since → broken (grace is day-5 only)
check('Meditate streak (never done)', C.streakOf(habits[2], finalDay), 0);
check('Workout logged into calendar daily', [1, 2, 3, 4, 5].every(d => finalMap['2026-06-0' + d] >= 1) ? 'yes' : 'no', 'yes');

console.log('\n' + (bad ? bad + ' check(s) FAILED.' : 'Scenario verified — streak, ×N multiplier and the 30-day calendar all stay in sync. ✅'));
process.exit(bad ? 1 : 0);

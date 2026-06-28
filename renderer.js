// ============ core (pure logic shared with the test harness) ============
const C = window.AreteCore;

// ============ constants ============
const ACCENTS = ['#6366f1', '#ff4d8d', '#10b981', '#f59e0b', '#22d3ee', '#ef4444', '#a855f7', '#3b82f6', '#14b8a6', '#f43f5e'];
const TAG = ['⚑', 'LOW', 'MED', 'HIGH'];
const PRIO_COLOR = ['', '#3b82f6', '#f59e0b', '#ef4444'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];          // index 0 = Sunday
const THEMES = [
  ['glass', 'Glassmorphism', '#8b80ff'],
  ['waterdrop', 'Waterdrop', '#06b6d4'],
  ['neomorphism', 'Neomorphism', '#6d5dfc'],
  ['neobrutalism', 'Neo Brutalism', '#ff5470'],
  ['neosoft', 'Neo Brutal · Soft', '#8b6cf0'],
  ['brutalism', 'Brutalism', '#000000'],
  ['brand', 'My Brand', '#ff4d8d'],
];
const THEME_KEYS = THEMES.map(t => t[0]);

// ============ state ============
let tasks = load('tw.tasks', []);
let habits = load('tw.habits', []);
let taskLog = load('tw.taskLog', {});     // date -> count of task completions (persists for the graph)
let settings = load('tw.settings', {});
let meta = load('tw.meta', {});
if (!THEME_KEYS.includes(settings.theme)) settings.theme = 'glass';
if (!settings.accent) settings.accent = '#8b80ff';
if (typeof settings.opacity !== 'number') settings.opacity = 1;
if (!/^\d\d:\d\d$/.test(settings.resetTime || '')) settings.resetTime = '00:00';
// migrate habits to scheduled / count-based model
habits.forEach(h => {
  if (!Array.isArray(h.days)) h.days = [0, 1, 2, 3, 4, 5, 6];
  if (!h.timesPerDay) h.timesPerDay = 1;
  if (!h.history) h.history = {};
  for (const k in h.history) if (h.history[k] === true) h.history[k] = 1;
});
let view = ['habits', 'stats'].includes(settings.view) ? settings.view : 'tasks';
let filter = 'all';
let newPrio = 0;
let compact = settings.compact || false;
let editingHabit = null;

function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } }
function saveTasks() { localStorage.setItem('tw.tasks', JSON.stringify(tasks)); }
function saveHabits() { localStorage.setItem('tw.habits', JSON.stringify(habits)); }
function saveLog() { localStorage.setItem('tw.taskLog', JSON.stringify(taskLog)); }
function saveSettings() { localStorage.setItem('tw.settings', JSON.stringify(settings)); }
function saveMeta() { localStorage.setItem('tw.meta', JSON.stringify(meta)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = (id) => document.getElementById(id);
function esc(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ============ dates (delegated to core.js) ============
const iso = C.iso, dayKey = C.dayKey, addDays = C.addDays, dowOf = C.dowOf;
function today() { return C.today(settings.resetTime); }
function last7() { return C.last7(today()); }
function dueInfo(due) {
  if (!due) return { cls: 'none', label: '📅' };
  const t = today();
  if (due < t) return { cls: 'over', label: 'Overdue' };
  if (due === t) return { cls: 'soon', label: 'Today' };
  if (due === addDays(t, 1)) return { cls: 'soon', label: 'Tomorrow' };
  return { cls: '', label: new Date(due + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
}

// ============ daily reset ============
function checkReset() {
  const r = C.computeReset(tasks, meta, today());   // mutates meta.lastResetDay
  if (!r.changed) return;
  tasks = r.tasks;
  if (r.rolled) saveTasks();          // completed cleared on a real day roll-over
  saveMeta();
  renderCurrent();
}

// ============ habits helpers ============
function isScheduledToday(h) { return C.isScheduled(h, today()); }
function habitDone(h, key) { return C.habitDone(h, key); }
function tickHabit(h) {
  const d = today(), c = h.history[d] || 0;
  if (h.timesPerDay <= 1) { if (c) delete h.history[d]; else h.history[d] = 1; }
  else { const n = c >= h.timesPerDay ? 0 : c + 1; if (n === 0) delete h.history[d]; else h.history[d] = n; }
  saveHabits(); renderCurrent();
}
function streakOf(h) { return C.streakOf(h, today()); }

// ============ TASKS ============
const listEl = $('list'), inputEl = $('input');

function renderTasks() {
  listEl.innerHTML = '';
  const cur = today();
  // 1) today's scheduled habits, surfaced as daily task rows
  const hToday = habits.filter(isScheduledToday)
    .slice().sort((a, b) => (habitDone(a, cur) - habitDone(b, cur)));
  hToday.forEach(h => {
    const done = habitDone(h, cur), c = h.history[cur] || 0;
    const prog = h.timesPerDay > 1 ? `<span class="hcount">${c}/${h.timesPerDay}</span>` : '';
    const row = document.createElement('div');
    row.className = 'task habitTask' + (done ? ' done' : '');
    row.innerHTML = `
      <div class="check">${done ? '✓' : ''}</div>
      <div class="tag htag" title="Daily habit">🔁</div>
      <div class="txt">${esc(h.name)}</div>
      ${prog}`;
    row.querySelector('.check').onclick = () => tickHabit(h);
    row.querySelector('.txt').onclick = () => { setView('habits'); openHabit(h); };
    listEl.appendChild(row);
  });
  // 2) one-off tasks
  let view2 = tasks.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'done') return t.done;
    if (filter === 'high') return t.prio === 3;
    return true;
  }).slice().sort((a, b) => (a.done - b.done) || (b.prio - a.prio) || ((a.due || '9') > (b.due || '9') ? 1 : -1) || (a.created - b.created));

  if (!view2.length && !hToday.length) {
    listEl.innerHTML = `<div class="empty">${filter === 'done' ? 'Nothing completed yet.' : filter === 'high' ? 'No high-priority tasks.' : filter === 'active' ? 'All clear — nice. 🎉' : 'No tasks yet.<br>Add your first one above.'}</div>`;
  } else {
    view2.forEach(t => {
      const di = dueInfo(t.due);
      const row = document.createElement('div');
      row.className = 'task' + (t.done ? ' done' : '');
      row.innerHTML = `
        <div class="check">${t.done ? '✓' : ''}</div>
        <div class="tag p${t.prio}" title="Click to set priority">${TAG[t.prio]}</div>
        <div class="txt">${esc(t.text)}</div>
        <div class="due ${di.cls}" title="Set due date (right-click to clear)">${di.label}</div>
        <button class="del" title="Delete">✕</button>`;
      row.querySelector('.check').onclick = () => toggleTask(t);
      row.querySelector('.tag').onclick = () => { t.prio = (t.prio + 1) % 4; saveTasks(); renderTasks(); };
      const due = row.querySelector('.due');
      due.onclick = () => openDue(t);
      due.oncontextmenu = (e) => { e.preventDefault(); t.due = null; saveTasks(); renderTasks(); };
      row.querySelector('.del').onclick = () => { tasks = tasks.filter(x => x.id !== t.id); saveTasks(); renderTasks(); };
      row.querySelector('.txt').ondblclick = function () { editText(this, t, 'text', saveTasks, renderTasks); };
      listEl.appendChild(row);
    });
  }
  if (view === 'tasks') $('count').textContent = tasks.filter(t => !t.done).length + hToday.filter(h => !habitDone(h, cur)).length;
  const wk = new Set(last7());
  const weekDone = tasks.filter(t => t.done && wk.has(t.completedAt)).length;
  $('summary').textContent = `${tasks.filter(t => t.done).length} of ${tasks.length} done · ${weekDone} this week`;
}

function toggleTask(t) {
  t.done = !t.done;
  const d = today();
  if (t.done) { t.completedAt = d; taskLog[d] = (taskLog[d] || 0) + 1; }
  else { t.completedAt = null; if (taskLog[d]) taskLog[d] = Math.max(0, taskLog[d] - 1); }
  saveTasks(); saveLog(); renderTasks();
}

function openDue(t) {
  const inp = document.createElement('input');
  inp.type = 'date'; inp.value = t.due || today();
  inp.style.cssText = 'position:fixed;left:-9999px;';
  document.body.appendChild(inp);
  inp.onchange = () => { t.due = inp.value || null; saveTasks(); renderTasks(); inp.remove(); };
  inp.addEventListener('blur', () => setTimeout(() => inp.isConnected && inp.remove(), 200));
  if (inp.showPicker) inp.showPicker(); else inp.focus();
}

function editText(el, obj, key, saveFn, renderFn) {
  el.contentEditable = 'true'; el.focus();
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  const finish = () => { el.contentEditable = 'false'; const v = el.textContent.trim(); if (v) obj[key] = v; else el.textContent = obj[key]; saveFn(); renderFn(); };
  el.onblur = finish;
  el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = obj[key]; el.blur(); } };
}

function addTask() {
  const v = inputEl.value.trim(); if (!v) return;
  tasks.push({ id: uid(), text: v, done: false, prio: newPrio, created: Date.now(), due: null, completedAt: null });
  inputEl.value = ''; newPrio = 0; updatePrioBtn();
  saveTasks(); renderTasks(); inputEl.focus();
}
function updatePrioBtn() {
  const b = $('prio');
  b.textContent = TAG[newPrio];
  b.style.fontSize = newPrio ? '9px' : '14px';
  b.style.fontWeight = '800';
  b.style.background = PRIO_COLOR[newPrio] || 'var(--surface)';
  b.style.color = newPrio ? '#fff' : 'var(--muted)';
}
$('go').onclick = addTask;
inputEl.onkeydown = (e) => { if (e.key === 'Enter') addTask(); };
$('prio').onclick = () => { newPrio = (newPrio + 1) % 4; updatePrioBtn(); };
$('clear').onclick = () => { tasks = tasks.filter(t => !t.done); saveTasks(); renderTasks(); };
document.querySelectorAll('#filters button').forEach(b => {
  b.onclick = () => { document.querySelectorAll('#filters button').forEach(x => x.classList.remove('active')); b.classList.add('active'); filter = b.dataset.f; renderTasks(); };
});

// ============ HABITS ============
const habitListEl = $('habitList'), habitInputEl = $('habitInput');

function renderHabits() {
  const cur = today();
  if (!habits.length) {
    habitListEl.innerHTML = `<div class="empty">No habits yet.<br>Add one to build a 🔥 streak.</div>`;
  } else {
    habitListEl.innerHTML = '';
    const days = last7();
    habits.forEach(h => {
      const st = streakOf(h), done = habitDone(h, cur), sched = isScheduledToday(h);
      const cells = days.map(k => {
        const on = habitDone(h, k), s = h.days.includes(dowOf(k));
        return `<div class="hcell ${on ? 'on' : ''} ${k === cur ? 'now' : ''} ${s ? '' : 'off'}" title="${k}${s ? '' : ' (not scheduled)'}"></div>`;
      }).join('');
      const sub = (h.days.length === 7 ? 'Every day' : h.days.map(d => DOW[d]).join(' ')) + (h.timesPerDay > 1 ? ` · ${h.history[cur] || 0}/${h.timesPerDay}` : '');
      const row = document.createElement('div');
      row.className = 'habit' + (done ? ' today' : '');
      row.innerHTML = `
        <button class="hcheck" ${sched ? '' : 'disabled style="opacity:.35"'}>${done ? '✓' : ''}</button>
        <div class="hmain"><div class="hname">${esc(h.name)}</div><div class="hsub">${sub}</div><div class="hgrid">${cells}</div></div>
        <div class="hstreak">🔥 ${st}</div>
        <button class="hedit" title="Edit">✎</button>`;
      if (sched) row.querySelector('.hcheck').onclick = () => tickHabit(h);
      row.querySelector('.hname').onclick = () => openHabit(h);
      row.querySelector('.hedit').onclick = () => openHabit(h);
      habitListEl.appendChild(row);
    });
  }
  if (view === 'habits') $('count').textContent = habits.filter(isScheduledToday).filter(h => habitDone(h, cur)).length;
  const sched = habits.filter(isScheduledToday);
  const best = habits.reduce((m, h) => Math.max(m, streakOf(h)), 0);
  $('summary').textContent = `${sched.filter(h => habitDone(h, cur)).length} of ${sched.length} today · 🔥 best ${best}`;
}
function addHabit() {
  const v = habitInputEl.value.trim(); if (!v) return;
  const h = { id: uid(), name: v, created: Date.now(), days: [0, 1, 2, 3, 4, 5, 6], timesPerDay: 1, history: {} };
  habits.push(h); habitInputEl.value = ''; saveHabits(); renderHabits();
}
$('habitGo').onclick = addHabit;
habitInputEl.onkeydown = (e) => { if (e.key === 'Enter') addHabit(); };

// ============ habit editor ============
function openHabit(h) {
  editingHabit = h;
  $('heName').value = h.name;
  $('heTimes').textContent = h.timesPerDay;
  const wrap = $('heDays'); wrap.innerHTML = '';
  DOW.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'dayChip' + (h.days.includes(i) ? ' on' : '');
    b.textContent = d;
    b.onclick = () => {
      if (h.days.includes(i)) { if (h.days.length > 1) h.days = h.days.filter(x => x !== i); }
      else h.days.push(i);
      h.days.sort(); b.classList.toggle('on', h.days.includes(i)); saveHabits();
    };
    wrap.appendChild(b);
  });
  $('habitEditor').classList.add('open');
}
$('heClose').onclick = () => { saveHabits(); $('habitEditor').classList.remove('open'); renderCurrent(); };
$('heName').oninput = (e) => { if (editingHabit) { editingHabit.name = e.target.value.trim() || editingHabit.name; saveHabits(); } };
$('heMinus').onclick = () => { if (editingHabit && editingHabit.timesPerDay > 1) { editingHabit.timesPerDay--; $('heTimes').textContent = editingHabit.timesPerDay; saveHabits(); } };
$('hePlus').onclick = () => { if (editingHabit && editingHabit.timesPerDay < 20) { editingHabit.timesPerDay++; $('heTimes').textContent = editingHabit.timesPerDay; saveHabits(); } };
$('heDelete').onclick = () => { if (editingHabit) { habits = habits.filter(x => x.id !== editingHabit.id); saveHabits(); editingHabit = null; $('habitEditor').classList.remove('open'); renderCurrent(); } };

// ============ STATS ============
const HEAT_WEEKS = 16;
function activityMap() { return C.activityMap(taskLog, habits); }
function overallStreak(m) { return C.overallStreak(m, today()); }
function bestStreak(m) { return C.bestStreak(m); }
const HEAT_OP = [0.30, 0.55, 0.80, 1];
function level(c) { return c === 0 ? 0 : c < 3 ? 1 : c < 5 ? 2 : c < 7 ? 3 : 4; }
function renderStats() {
  const m = activityMap(), cur = today(), mk = cur.slice(0, 7);
  const monthDone = Object.keys(m).reduce((s, k) => s + (k.slice(0, 7) === mk ? m[k] : 0), 0);
  const weekDone = last7().reduce((s, k) => s + (m[k] || 0), 0);
  const total = Object.values(m).reduce((s, n) => s + n, 0);
  const curStreak = overallStreak(m), best = bestStreak(m);
  const tasksMonth = Object.keys(taskLog).reduce((s, k) => s + (k.slice(0, 7) === mk ? taskLog[k] : 0), 0);
  const end = new Date(cur + 'T12:00:00'); end.setDate(end.getDate() + (6 - end.getDay()));
  const cols = [], months = [];
  for (let w = 0; w < HEAT_WEEKS; w++) {
    let cells = '', first = null;
    for (let d = 0; d < 7; d++) {
      const idx = (HEAT_WEEKS - 1 - w) * 7 + (6 - d);
      const date = new Date(end); date.setDate(end.getDate() - idx);
      if (d === 0) first = date;
      const key = iso(date), future = date > new Date(cur + 'T23:59:59'), c = m[key] || 0, lv = level(c);
      const bg = future ? 'background:var(--surface-strong);opacity:.25' : lv === 0 ? 'background:var(--surface-strong)' : `background:var(--accent);opacity:${HEAT_OP[lv - 1]}`;
      cells += `<div class="heatCell" style="${bg}" title="${key} · ${c} completed"></div>`;
    }
    cols.push(`<div class="heatCol">${cells}</div>`);
    months.push(first.getDate() <= 7 ? first.toLocaleDateString(undefined, { month: 'short' }) : '');
  }
  const legend = [0, 1, 2, 3, 4].map(l => l === 0 ? '<div class="heatCell"></div>' : `<div class="heatCell" style="background:var(--accent);opacity:${HEAT_OP[l - 1]}"></div>`).join('');
  $('stats').innerHTML = `
    <div class="statRow">
      <div class="statCard"><div class="n">${curStreak}</div><div class="l">🔥 streak</div></div>
      <div class="statCard"><div class="n">${weekDone}</div><div class="l">this week</div></div>
      <div class="statCard"><div class="n">${monthDone}</div><div class="l">this month</div></div>
    </div>
    <div class="heatHead">Activity · last ${HEAT_WEEKS} weeks</div>
    <div class="heatMonths">${months.map(l => `<span style="width:11px">${l}</span>`).join('')}</div>
    <div class="heat">${cols.join('')}</div>
    <div class="heatLegend">Less ${legend} More</div>
    <div class="statNote">📌 ${tasksMonth} tasks done this month · 🏆 best streak ${best} days · ${total} total completions.</div>`;
  if (view === 'stats') $('count').textContent = curStreak;
  $('summary').textContent = `🔥 best ${best} · ${total} all-time`;
}

// ============ view switching ============
function renderCurrent() { if (view === 'tasks') renderTasks(); else if (view === 'habits') renderHabits(); else renderStats(); }
function setView(v) {
  view = v; settings.view = v; saveSettings();
  $('tasksView').hidden = v !== 'tasks';
  $('habitsView').hidden = v !== 'habits';
  $('statsView').hidden = v !== 'stats';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  document.querySelector('.title').textContent = v === 'tasks' ? 'Tasks' : v === 'habits' ? 'Habits' : 'Stats';
  $('clear').style.display = v === 'tasks' ? '' : 'none';
  renderCurrent();
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setView(b.dataset.v));

// ============ window controls ============
$('min').onclick = () => window.widget.minimize();
$('close').onclick = () => window.widget.close();
$('pin').onclick = async () => { const on = await window.widget.togglePin(); $('pin').classList.toggle('on', on); };
window.widget.onPinState(on => $('pin').classList.toggle('on', on));

// ============ collapse ============
function fitCompact() {
  const w = document.querySelector('.widget'); const prev = w.style.height;
  w.style.height = 'auto';
  const h = Math.ceil(w.getBoundingClientRect().height) + 16;
  w.style.height = prev;
  window.widget.resizeHeight(Math.min(Math.max(h, 110), 700));
}
function applyCompact() {
  document.body.classList.toggle('compact', compact);
  $('collapse').textContent = compact ? '▸' : '▾';
  if (compact) requestAnimationFrame(fitCompact);
  else window.widget.resizeHeight(settings.expandedH || 360);
}
$('collapse').onclick = () => {
  if (!compact) settings.expandedH = window.innerHeight;
  compact = !compact; settings.compact = compact; saveSettings(); applyCompact();
};
window.addEventListener('resize', () => { if (!compact) { settings.expandedH = window.innerHeight; saveSettings(); } });

// ============ settings ============
$('gear').onclick = () => $('settings').classList.add('open');
$('gearClose').onclick = () => $('settings').classList.remove('open');
const thWrap = $('themes');
THEMES.forEach(([key, label, accent]) => {
  const b = document.createElement('button');
  b.dataset.t = key; b.textContent = label;
  b.onclick = () => { settings.theme = key; settings.accent = accent; applySettings(); saveSettings(); };
  thWrap.appendChild(b);
});
const swWrap = $('swatches');
ACCENTS.forEach(c => {
  const s = document.createElement('div');
  s.className = 'swatch'; s.style.background = c;
  s.onclick = () => { settings.accent = c; applySettings(); saveSettings(); };
  swWrap.appendChild(s);
});
$('opacity').oninput = (e) => { settings.opacity = parseFloat(e.target.value); window.widget.setOpacity(settings.opacity); saveSettings(); };
$('resetTime').onchange = (e) => { if (/^\d\d:\d\d$/.test(e.target.value)) { settings.resetTime = e.target.value; saveSettings(); checkReset(); renderCurrent(); } };
function applySettings() {
  document.body.className = 'theme-' + settings.theme + (compact ? ' compact' : '');
  document.body.style.setProperty('--accent', settings.accent);
  document.querySelectorAll('.themes button').forEach(b => b.classList.toggle('sel', b.dataset.t === settings.theme));
  document.querySelectorAll('.swatch').forEach((s, i) => s.classList.toggle('sel', ACCENTS[i] === settings.accent));
  $('opacity').value = settings.opacity;
  $('resetTime').value = settings.resetTime;
  updatePrioBtn();
}

// ============ init ============
applySettings();
checkReset();
setView(view);
applyCompact();
if (!compact && view === 'tasks') inputEl.focus();
// roll the day over while the app stays open
setInterval(checkReset, 30000);

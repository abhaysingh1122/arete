// ============ constants ============
const ACCENTS = ['#6366f1', '#ff4d8d', '#10b981', '#f59e0b', '#22d3ee', '#ef4444', '#a855f7', '#3b82f6', '#14b8a6', '#f43f5e'];
const TAG = ['⚑', 'LOW', 'MED', 'HIGH'];          // priority labels 0..3
const PRIO_COLOR = ['', '#3b82f6', '#f59e0b', '#ef4444'];
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
let settings = load('tw.settings', {});
if (!THEME_KEYS.includes(settings.theme)) settings.theme = 'glass';
if (!settings.accent) settings.accent = '#8b80ff';
if (typeof settings.opacity !== 'number') settings.opacity = 1;
let view = settings.view === 'habits' ? 'habits' : 'tasks';
let filter = 'all';
let newPrio = 0;
let compact = settings.compact || false;

function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } }
function saveTasks() { localStorage.setItem('tw.tasks', JSON.stringify(tasks)); }
function saveHabits() { localStorage.setItem('tw.habits', JSON.stringify(habits)); }
function saveSettings() { localStorage.setItem('tw.settings', JSON.stringify(settings)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = (id) => document.getElementById(id);
function esc(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ============ dates ============
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function todayKey() { return iso(new Date()); }
function dayKey(off) { const d = new Date(); d.setDate(d.getDate() + off); return iso(d); }
function last7() { return [6, 5, 4, 3, 2, 1, 0].map(n => dayKey(-n)); }
function dueInfo(due) {
  if (!due) return { cls: 'none', label: '📅' };
  const t = todayKey();
  if (due < t) return { cls: 'over', label: 'Overdue' };
  if (due === t) return { cls: 'soon', label: 'Today' };
  if (due === dayKey(1)) return { cls: 'soon', label: 'Tomorrow' };
  const d = new Date(due + 'T00:00:00');
  return { cls: '', label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
}

// ============ TASKS ============
const listEl = $('list'), inputEl = $('input');

function activeTaskCount() { return tasks.filter(t => !t.done).length; }

function renderTasks() {
  let view2 = tasks.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'done') return t.done;
    if (filter === 'high') return t.prio === 3;
    return true;
  });
  view2 = view2.slice().sort((a, b) => (a.done - b.done) || (b.prio - a.prio) || ((a.due || '9') > (b.due || '9') ? 1 : -1) || (a.created - b.created));

  if (!view2.length) {
    listEl.innerHTML = `<div class="empty">${filter === 'done' ? 'Nothing completed yet.' : filter === 'high' ? 'No high-priority tasks.' : filter === 'active' ? 'No active tasks — nice. 🎉' : 'No tasks yet.<br>Add your first one above.'}</div>`;
  } else {
    listEl.innerHTML = '';
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
      row.querySelector('.check').onclick = () => { t.done = !t.done; t.completedAt = t.done ? todayKey() : null; saveTasks(); renderTasks(); };
      row.querySelector('.tag').onclick = () => { t.prio = (t.prio + 1) % 4; saveTasks(); renderTasks(); };
      const due = row.querySelector('.due');
      due.onclick = () => openDue(t);
      due.oncontextmenu = (e) => { e.preventDefault(); t.due = null; saveTasks(); renderTasks(); };
      row.querySelector('.del').onclick = () => { tasks = tasks.filter(x => x.id !== t.id); saveTasks(); renderTasks(); };
      const txt = row.querySelector('.txt');
      txt.ondblclick = () => editText(txt, t, saveTasks, renderTasks);
      listEl.appendChild(row);
    });
  }
  // header + footer
  if (view === 'tasks') $('count').textContent = activeTaskCount();
  const done = tasks.filter(t => t.done).length;
  const wk = new Set(last7());
  const weekDone = tasks.filter(t => t.done && wk.has(t.completedAt)).length;
  $('summary').textContent = `${done} of ${tasks.length} done · ${weekDone} this week`;
  if (compact) fitCompact();
}

function openDue(t) {
  const inp = document.createElement('input');
  inp.type = 'date'; inp.value = t.due || todayKey();
  inp.style.cssText = 'position:fixed;left:-9999px;';
  document.body.appendChild(inp);
  inp.onchange = () => { t.due = inp.value || null; saveTasks(); renderTasks(); inp.remove(); };
  inp.addEventListener('blur', () => setTimeout(() => inp.isConnected && inp.remove(), 200));
  if (inp.showPicker) inp.showPicker(); else inp.focus();
}

function editText(el, obj, saveFn, renderFn) {
  el.contentEditable = 'true'; el.focus();
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  const orig = obj.text != null ? 'text' : 'name';
  const finish = () => {
    el.contentEditable = 'false';
    const v = el.textContent.trim();
    if (v) obj[orig] = v; else el.textContent = obj[orig]; // empty → revert
    saveFn(); renderFn();
  };
  el.onblur = finish;
  el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = obj.text || obj.name; el.blur(); } };
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

function streakOf(h) {
  let s = 0, i = h.history[todayKey()] ? 0 : 1;
  for (; ; i++) { if (h.history[dayKey(-i)]) s++; else break; }
  return s;
}
function doneTodayCount() { return habits.filter(h => h.history[todayKey()]).length; }

function renderHabits() {
  if (!habits.length) {
    habitListEl.innerHTML = `<div class="empty">No habits yet.<br>Add a daily habit to start a 🔥 streak.</div>`;
  } else {
    habitListEl.innerHTML = '';
    const days = last7(), tk = todayKey();
    habits.forEach(h => {
      const st = streakOf(h), doneToday = !!h.history[tk];
      const cells = days.map(k => `<div class="hcell ${h.history[k] ? 'on' : ''} ${k === tk ? 'now' : ''}" data-d="${k}" title="${k}"></div>`).join('');
      const row = document.createElement('div');
      row.className = 'habit' + (doneToday ? ' today' : '');
      row.innerHTML = `
        <button class="hcheck">${doneToday ? '✓' : ''}</button>
        <div class="hmain"><div class="hname">${esc(h.name)}</div><div class="hgrid">${cells}</div></div>
        <div class="hstreak">🔥 ${st}</div>
        <button class="del" title="Delete">✕</button>`;
      row.querySelector('.hcheck').onclick = () => { toggleDay(h, tk); };
      row.querySelectorAll('.hcell').forEach(c => c.onclick = () => toggleDay(h, c.dataset.d));
      row.querySelector('.del').onclick = () => { habits = habits.filter(x => x.id !== h.id); saveHabits(); renderHabits(); };
      const name = row.querySelector('.hname');
      name.ondblclick = () => editText(name, h, saveHabits, renderHabits);
      habitListEl.appendChild(row);
    });
  }
  if (view === 'habits') $('count').textContent = doneTodayCount();
  const best = habits.reduce((m, h) => Math.max(m, streakOf(h)), 0);
  $('summary').textContent = `${doneTodayCount()} of ${habits.length} today · 🔥 best ${best}`;
  if (compact) fitCompact();
}
function toggleDay(h, key) {
  if (h.history[key]) delete h.history[key]; else h.history[key] = true;
  saveHabits(); renderHabits();
}
function addHabit() {
  const v = habitInputEl.value.trim(); if (!v) return;
  habits.push({ id: uid(), name: v, created: Date.now(), history: {} });
  habitInputEl.value = ''; saveHabits(); renderHabits();
}
$('habitGo').onclick = addHabit;
habitInputEl.onkeydown = (e) => { if (e.key === 'Enter') addHabit(); };

// ============ view switching ============
function setView(v) {
  view = v; settings.view = v; saveSettings();
  $('tasksView').hidden = v !== 'tasks';
  $('habitsView').hidden = v !== 'habits';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  document.querySelector('.title').textContent = v === 'tasks' ? 'Tasks' : 'Habits';
  $('clear').style.display = v === 'tasks' ? '' : 'none';
  if (v === 'tasks') renderTasks(); else renderHabits();
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setView(b.dataset.v));

// ============ window controls ============
$('min').onclick = () => window.widget.minimize();
$('close').onclick = () => window.widget.close();
$('pin').onclick = async () => { const on = await window.widget.togglePin(); $('pin').classList.toggle('on', on); };
window.widget.onPinState(on => $('pin').classList.toggle('on', on));

// ============ collapse ============
function fitCompact() {
  const w = document.querySelector('.widget');
  const prev = w.style.height;
  w.style.height = 'auto';
  const h = Math.ceil(w.getBoundingClientRect().height) + 16;
  w.style.height = prev;
  window.widget.resizeHeight(Math.min(Math.max(h, 110), 640));
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
function applySettings() {
  document.body.className = 'theme-' + settings.theme + (compact ? ' compact' : '');
  document.body.style.setProperty('--accent', settings.accent);
  document.querySelectorAll('.themes button').forEach(b => b.classList.toggle('sel', b.dataset.t === settings.theme));
  document.querySelectorAll('.swatch').forEach((s, i) => s.classList.toggle('sel', ACCENTS[i] === settings.accent));
  $('opacity').value = settings.opacity;
  updatePrioBtn();
}

// ============ init ============
applySettings();
updatePrioBtn();
setView(view);
applyCompact();
if (!compact && view === 'tasks') inputEl.focus();

// ============ constants ============
const ACCENTS = ['#6366f1', '#ff4d8d', '#10b981', '#f59e0b', '#22d3ee', '#ef4444', '#a855f7', '#3b82f6', '#14b8a6', '#f43f5e'];
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
let settings = load('tw.settings', {});
if (!THEME_KEYS.includes(settings.theme)) settings.theme = 'glass';
if (!settings.accent) settings.accent = '#8b80ff';
if (typeof settings.opacity !== 'number') settings.opacity = 1;
let filter = 'all';
let newPrio = 0;
let compact = settings.compact || false;

function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } }
function saveTasks() { localStorage.setItem('tw.tasks', JSON.stringify(tasks)); }
function saveSettings() { localStorage.setItem('tw.settings', JSON.stringify(settings)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = (id) => document.getElementById(id);
function esc(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ============ tasks ============
const listEl = $('list'), inputEl = $('input');

function activeTaskCount() { return tasks.filter(t => !t.done).length; }

function renderTasks() {
  let view = tasks.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'done') return t.done;
    return true;
  });
  view = view.slice().sort((a, b) => (a.done - b.done) || (b.prio - a.prio) || (a.created - b.created));

  if (!view.length) {
    listEl.innerHTML = `<div class="empty">${filter === 'done' ? 'Nothing completed yet.' : filter === 'active' ? 'No active tasks — nice. 🎉' : 'No tasks yet.<br>Add your first one above.'}</div>`;
  } else {
    listEl.innerHTML = '';
    view.forEach(t => {
      const row = document.createElement('div');
      row.className = 'task' + (t.done ? ' done' : '');
      row.innerHTML = `
        <div class="check">${t.done ? '✓' : ''}</div>
        <span class="dot p${t.prio}" title="Click to set priority"></span>
        <div class="txt">${esc(t.text)}</div>
        <button class="del" title="Delete">✕</button>`;
      row.querySelector('.check').onclick = () => { t.done = !t.done; saveTasks(); renderTasks(); };
      row.querySelector('.dot').onclick = () => { t.prio = (t.prio + 1) % 4; saveTasks(); renderTasks(); };
      row.querySelector('.del').onclick = () => { tasks = tasks.filter(x => x.id !== t.id); saveTasks(); renderTasks(); };
      const txt = row.querySelector('.txt');
      txt.ondblclick = () => editText(txt, t);
      listEl.appendChild(row);
    });
  }
  $('count').textContent = activeTaskCount();
  const done = tasks.filter(t => t.done).length;
  $('summary').textContent = `${done} of ${tasks.length} done`;
  if (compact) fitCompact();
}

function editText(el, t) {
  el.contentEditable = 'true'; el.focus();
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  const finish = () => {
    el.contentEditable = 'false';
    const v = el.textContent.trim();
    if (v) t.text = v; else el.textContent = t.text;
    saveTasks(); renderTasks();
  };
  el.onblur = finish;
  el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = t.text; el.blur(); } };
}

function addTask() {
  const v = inputEl.value.trim(); if (!v) return;
  tasks.push({ id: uid(), text: v, done: false, prio: newPrio, created: Date.now() });
  inputEl.value = ''; newPrio = 0; updatePrioBtn();
  saveTasks(); renderTasks(); inputEl.focus();
}
const PRIO_DOT = ['⚪', '🔵', '🟠', '🔴'];
function updatePrioBtn() { $('prio').textContent = PRIO_DOT[newPrio]; }
$('go').onclick = addTask;
inputEl.onkeydown = (e) => { if (e.key === 'Enter') addTask(); };
$('prio').onclick = () => { newPrio = (newPrio + 1) % 4; updatePrioBtn(); };
$('clear').onclick = () => { tasks = tasks.filter(t => !t.done); saveTasks(); renderTasks(); };
document.querySelectorAll('#filters button').forEach(b => {
  b.onclick = () => { document.querySelectorAll('#filters button').forEach(x => x.classList.remove('active')); b.classList.add('active'); filter = b.dataset.f; renderTasks(); };
});

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
}

// ============ init ============
applySettings();
updatePrioBtn();
renderTasks();
applyCompact();
if (!compact) inputEl.focus();

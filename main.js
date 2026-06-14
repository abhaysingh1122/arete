const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } }
function saveState(s) { try { fs.writeFileSync(stateFile, JSON.stringify(s)); } catch {} }

let win;
function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 340,
    height: st.height || 540,
    x: st.x,
    y: st.y,
    minWidth: 260,
    minHeight: 200,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: !!st.pinned,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    title: 'Tasks',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (st.pinned) win.setAlwaysOnTop(true, 'screen-saver');
  if (typeof st.opacity === 'number') win.setOpacity(st.opacity);

  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => win.webContents.send('pin-state', !!st.pinned));

  const persist = () => {
    const b = win.getBounds();
    const s = loadState();
    saveState({ ...s, x: b.x, y: b.y, width: b.width, height: b.height });
  };
  win.on('moved', persist);
  win.on('resized', persist);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => app.quit());

ipcMain.handle('toggle-pin', () => {
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'screen-saver');
  const s = loadState(); s.pinned = next; saveState(s);
  return next;
});
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('close', () => win.close());
ipcMain.on('set-opacity', (e, v) => {
  win.setOpacity(v);
  const s = loadState(); s.opacity = v; saveState(s);
});

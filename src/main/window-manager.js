// 窗口生命周期：透明 / 无边框 / 置顶 / 跳过任务栏 / 点击穿透
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const store = require('./store');

let win = null;
let interactive = false; // 当前是否可交互（鼠标在猫身上）

function create() {
  // 全屏透明点击穿透覆盖层：猫可在整个桌面工作区漫游，面板也有充足空间
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea; // 排除任务栏

  win = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 开发模式：把渲染层 console / 加载失败 / 崩溃转发到主进程 stdout
  if (process.argv.includes('--dev')) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer] ${message}  (${source}:${line})`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[did-fail-load] ${code} ${desc} ${url}`);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[render-process-gone]', JSON.stringify(details));
    });
    win.webContents.on('did-finish-load', () => console.log('[main] renderer did-finish-load'));
  }

  // 默认让透明区域点击穿透
  setInteractive(false);

  win.on('closed', () => { win = null; });
  return win;
}

// 切换鼠标穿透：interactive=true 时窗口拦截鼠标（猫可被拖拽/点击），否则穿透到桌面
function setInteractive(value) {
  if (!win) return;
  if (value === interactive) return;
  interactive = value;
  if (value) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
}

function getWindow() { return win; }

function moveBy(dx, dy) {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
}

function savePosition() {
  if (!win) return;
  const [x, y] = win.getPosition();
  store.setPet({ posX: x, posY: y });
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.show();
}

function show() { if (win) win.show(); }

module.exports = { create, setInteractive, getWindow, moveBy, savePosition, toggleVisible, show };

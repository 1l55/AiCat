// 系统托盘图标 + 右键菜单
const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const { IPC } = require('../shared/constants');

let tray = null;

function create(getWin, windowManager) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  let img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) {
    img = img.resize({ width: 18, height: 18 });
  }
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('AI 桌面宠物 · 小团子');

  const send = (cmd, payload) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show();
      win.webContents.send(IPC.TRAY_COMMAND, { cmd, payload });
    }
  };

  const menu = Menu.buildFromTemplate([
    { label: '💬 聊一聊', click: () => send('chat') },
    { label: '🍖 喂食', click: () => send('feed') },
    { label: '🎾 玩耍（激光笔）', click: () => send('play') },
    { type: 'separator' },
    { label: '📊 状态面板', click: () => send('status') },
    { label: '🏆 成就 & 形象', click: () => send('achievements') },
    { label: '⏰ 提醒设置', click: () => send('reminders') },
    { label: '⚙️ 设置', click: () => send('settings') },
    { type: 'separator' },
    { label: '👁 显示 / 隐藏', click: () => windowManager.toggleVisible() },
    { label: '👋 退出', click: () => { app.isQuiting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  // 双击托盘：显示并触发摸头
  tray.on('double-click', () => { windowManager.show(); send('chat'); });
  return tray;
}

function destroy() { if (tray) { tray.destroy(); tray = null; } }

module.exports = { create, destroy };

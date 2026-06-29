// 主进程入口：装配窗口、托盘、IPC、调度器、衰减循环
const { app } = require('electron');
const store = require('./store');
const windowManager = require('./window-manager');
const tray = require('./tray');
const scheduler = require('./scheduler');
const ipc = require('./ipc');
const autostart = require('./autostart');

// 单实例锁，避免多开
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowManager.show();
  });

  app.whenReady().then(() => {
    store.init();

    // 同步开机自启状态
    const settings = store.getSettings();
    if (settings.autostart !== autostart.get()) {
      autostart.set(settings.autostart);
    }

    ipc.register();
    windowManager.create();
    tray.create(() => windowManager.getWindow(), windowManager);
    scheduler.init(() => windowManager.getWindow());
    ipc.startDecayLoop();

    app.on('activate', () => {
      if (!windowManager.getWindow()) windowManager.create();
    });
  });

  // 桌面宠物常驻：关闭所有窗口不退出（仍在托盘）
  app.on('window-all-closed', (e) => {
    if (!app.isQuiting) {
      // 阻止默认退出（保持托盘存活）
    } else {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    scheduler.stopAll();
    ipc.stopDecayLoop();
    store.saveNow();
  });
}

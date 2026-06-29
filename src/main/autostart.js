// 开机自启：封装 app.setLoginItemSettings（Windows / macOS）
const { app } = require('electron');

function set(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      // Windows 下以 --hidden 之类参数可选；这里保持默认
      args: [],
    });
  } catch (e) {
    console.error('[autostart] set failed:', e.message);
  }
}

function get() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

module.exports = { set, get };

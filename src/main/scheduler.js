// 提醒调度：node-cron 注册 + Electron 系统通知 + 通过 IPC 让猫做出反应
const cron = require('node-cron');
const path = require('path');
const { Notification } = require('electron');
const store = require('./store');
const { IPC } = require('../shared/constants');

const jobs = new Map(); // id -> cron task
let getWin = () => null;

function init(getWindowFn) {
  getWin = getWindowFn;
  // 启动时注册所有已启用提醒
  for (const r of store.listReminders()) {
    if (r.enabled) schedule(r);
  }
}

function fire(r) {
  // 系统通知
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: r.title || '提醒',
        body: r.message || '',
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
        silent: false,
      });
      n.show();
    }
  } catch (e) {
    console.error('[scheduler] notification failed:', e.message);
  }
  // 让猫做出反应
  const win = getWin();
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.webContents.send(IPC.REMINDER_TRIGGER, {
      id: r.id,
      title: r.title,
      message: r.message,
      petReaction: r.petReaction || 'happy',
    });
  }
}

function schedule(r) {
  unschedule(r.id);
  if (!r.cron || !cron.validate(r.cron)) {
    console.warn('[scheduler] invalid cron for', r.id, r.cron);
    return;
  }
  const task = cron.schedule(r.cron, () => fire(r), { scheduled: true });
  jobs.set(r.id, task);
}

function unschedule(id) {
  const t = jobs.get(id);
  if (t) { t.stop(); jobs.delete(id); }
}

function refresh(r) {
  // 提醒被启用/禁用/修改后调用
  if (r.enabled) schedule(r);
  else unschedule(r.id);
}

function stopAll() {
  for (const t of jobs.values()) t.stop();
  jobs.clear();
}

module.exports = { init, schedule, unschedule, refresh, stopAll, fire };

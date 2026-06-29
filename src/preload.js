// preload：通过 contextBridge 暴露白名单 API 给渲染层（不开放 nodeIntegration）
const { contextBridge, ipcRenderer } = require('electron');

// 与 constants.js 的 IPC 频道保持一致（preload 无法直接 require 共享模块的浏览器版，这里内联频道名）
const IPC = {
  PET_UPDATE_STATUS: 'pet:update-status',
  PET_REQUEST_ACTION: 'pet:request-action',
  CHAT_SEND: 'chat:send',
  REMINDER_CREATE: 'reminder:create',
  REMINDER_DELETE: 'reminder:delete',
  REMINDER_LIST: 'reminder:list',
  REMINDER_TOGGLE: 'reminder:toggle',
  WINDOW_SET_INTERACTIVE: 'window:set-interactive',
  WINDOW_DRAG: 'window:drag',
  WINDOW_MOVE_BY: 'window:move-by',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  STATE_GET: 'state:get',
  ACHIEVEMENTS_GET: 'achievements:get',
  SKIN_SET: 'skin:set',
  ACCESSORY_SET: 'accessory:set',
  APP_QUIT: 'app:quit',
  PET_STATUS_UPDATE: 'pet:status-update',
  REMINDER_TRIGGER: 'reminder:trigger',
  SETTINGS_CHANGED: 'settings:changed',
  TRAY_COMMAND: 'tray:command',
};

contextBridge.exposeInMainWorld('petAPI', {
  // 查询
  getState: () => ipcRenderer.invoke(IPC.STATE_GET),
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),

  // 养成
  requestAction: (action, opts) => ipcRenderer.invoke(IPC.PET_REQUEST_ACTION, { action, ...opts }),
  updateStatus: (patch) => ipcRenderer.invoke(IPC.PET_UPDATE_STATUS, patch),

  // 成就 / 皮肤
  getAchievements: () => ipcRenderer.invoke(IPC.ACHIEVEMENTS_GET),
  setSkin: (key) => ipcRenderer.invoke(IPC.SKIN_SET, { key }),
  setAccessory: (slot, key) => ipcRenderer.invoke(IPC.ACCESSORY_SET, { slot, key }),

  // 对话
  chatSend: (text) => ipcRenderer.invoke(IPC.CHAT_SEND, { text }),

  // 提醒
  listReminders: () => ipcRenderer.invoke(IPC.REMINDER_LIST),
  createReminder: (r) => ipcRenderer.invoke(IPC.REMINDER_CREATE, r),
  deleteReminder: (id) => ipcRenderer.invoke(IPC.REMINDER_DELETE, { id }),
  toggleReminder: (id, enabled) => ipcRenderer.invoke(IPC.REMINDER_TOGGLE, { id, enabled }),

  // 窗口
  setInteractive: (v) => ipcRenderer.send(IPC.WINDOW_SET_INTERACTIVE, v),
  moveBy: (dx, dy) => ipcRenderer.send(IPC.WINDOW_MOVE_BY, { dx, dy }),
  dragPhase: (phase) => ipcRenderer.send(IPC.WINDOW_DRAG, phase),
  quit: () => ipcRenderer.send(IPC.APP_QUIT),

  // 主进程 -> 渲染层 事件订阅
  onStatusUpdate: (cb) => ipcRenderer.on(IPC.PET_STATUS_UPDATE, (_e, d) => cb(d)),
  onReminderTrigger: (cb) => ipcRenderer.on(IPC.REMINDER_TRIGGER, (_e, d) => cb(d)),
  onSettingsChanged: (cb) => ipcRenderer.on(IPC.SETTINGS_CHANGED, (_e, d) => cb(d)),
  onTrayCommand: (cb) => ipcRenderer.on(IPC.TRAY_COMMAND, (_e, d) => cb(d)),
});

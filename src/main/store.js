// 极简 JSON 持久化：app.getPath('userData')/petdata.json
// 负责 pet 状态、设置、提醒、对话历史的读写与默认值合并。

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_DATA, EXP_PER_LEVEL, ACHIEVEMENTS } = require('../shared/constants');

let filePath = null;
let cache = null;

function deepMerge(base, over) {
  if (Array.isArray(base)) return over !== undefined ? over : base;
  if (typeof base === 'object' && base !== null) {
    const out = { ...base };
    for (const k of Object.keys(base)) {
      if (over && over[k] !== undefined) out[k] = deepMerge(base[k], over[k]);
    }
    // 保留 over 中 base 没有的键（向后兼容新增字段）
    if (over) for (const k of Object.keys(over)) if (!(k in out)) out[k] = over[k];
    return out;
  }
  return over !== undefined ? over : base;
}

function init() {
  filePath = path.join(app.getPath('userData'), 'petdata.json');
  load();
  reconcileUnlocks();
  return cache;
}

// 回填：把已解锁成就对应的皮肤/配饰补进解锁列表（兼容皮肤/配饰系统上线前的旧存档）
function reconcileUnlocks() {
  if (!cache.pet.unlockedSkins) cache.pet.unlockedSkins = ['default'];
  if (!cache.pet.unlockedAccessories) cache.pet.unlockedAccessories = [];
  if (!cache.pet.equippedAccessories) cache.pet.equippedAccessories = {};
  const skins = cache.pet.unlockedSkins;
  const accs = cache.pet.unlockedAccessories;
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (!cache.achievements[a.key]) continue;
    if (a.skin && !skins.includes(a.skin)) { skins.push(a.skin); changed = true; }
    if (a.accessory && !accs.includes(a.accessory)) { accs.push(a.accessory); changed = true; }
  }
  if (changed) save();
}

function load() {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    cache = deepMerge(DEFAULT_DATA, parsed);
  } catch (e) {
    cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  return cache;
}

let saveTimer = null;
function save() {
  if (!filePath) return;
  // 防抖写盘
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (e) {
      console.error('[store] save failed:', e.message);
    }
  }, 300);
}

function saveNow() {
  clearTimeout(saveTimer);
  try {
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.error('[store] saveNow failed:', e.message);
  }
}

// ---- pet ----
function getPet() { return cache.pet; }
function setPet(patch) {
  Object.assign(cache.pet, patch);
  cache.pet.updatedAt = Date.now();
  save();
  return cache.pet;
}
// 根据 exp 重算等级
function recalcLevel() {
  const lvl = Math.floor(cache.pet.exp / EXP_PER_LEVEL) + 1;
  const leveledUp = lvl > cache.pet.level;
  cache.pet.level = lvl;
  return leveledUp;
}

// ---- settings ----
function getSettings() { return cache.settings; }
function setSettings(patch) {
  cache.settings = deepMerge(cache.settings, patch);
  save();
  return cache.settings;
}

// ---- reminders ----
function listReminders() { return cache.reminders; }
function addReminder(r) {
  cache.reminders.push(r);
  save();
  return r;
}
function removeReminder(id) {
  cache.reminders = cache.reminders.filter((r) => r.id !== id);
  save();
}
function toggleReminder(id, enabled) {
  const r = cache.reminders.find((x) => x.id === id);
  if (r) { r.enabled = enabled; save(); }
  return r;
}

// ---- conversations ----
function pushConversation(msg) {
  cache.conversations.push(msg);
  // 只保留最近 100 条
  if (cache.conversations.length > 100) cache.conversations = cache.conversations.slice(-100);
  save();
}
function recentConversations(n) {
  return cache.conversations.slice(-n);
}

// ---- achievements ----
function getAchievements() { return cache.achievements; }
function unlockAchievement(key) {
  if (cache.achievements[key]) return false; // 已解锁
  cache.achievements[key] = true;
  save();
  return true; // 新解锁
}

// ---- skins ----
// 解锁一款皮肤（已解锁则返回 false）
function unlockSkin(key) {
  if (!key) return false;
  const list = cache.pet.unlockedSkins || (cache.pet.unlockedSkins = ['default']);
  if (list.includes(key)) return false;
  list.push(key);
  save();
  return true;
}
// 切换当前装备皮肤（仅在已解锁时生效），返回是否切换成功
function setActiveSkin(key) {
  const list = cache.pet.unlockedSkins || ['default'];
  if (!list.includes(key)) return false;
  cache.pet.activeSkin = key;
  save();
  return true;
}

// ---- accessories ----
// 解锁一件配饰（已解锁则返回 false）
function unlockAccessory(key) {
  if (!key) return false;
  const list = cache.pet.unlockedAccessories || (cache.pet.unlockedAccessories = []);
  if (list.includes(key)) return false;
  list.push(key);
  save();
  return true;
}
// 装备/卸下某槽位配饰：key 为 null/'' 表示卸下该槽位；装备须已解锁。返回是否成功。
function setAccessory(slot, key) {
  if (!slot) return false;
  if (!cache.pet.equippedAccessories) cache.pet.equippedAccessories = {};
  const equipped = cache.pet.equippedAccessories;
  if (!key) { delete equipped[slot]; save(); return true; } // 卸下
  const list = cache.pet.unlockedAccessories || [];
  if (!list.includes(key)) return false;
  equipped[slot] = key;
  save();
  return true;
}

// ---- 陪伴天数（按自然日去重累加，返回是否为新的一天）----
function bumpCompanionDay(dayStr) {
  if (cache.pet.lastActiveDay === dayStr) return false;
  cache.pet.lastActiveDay = dayStr;
  cache.pet.companionDays = (cache.pet.companionDays || 0) + 1;
  save();
  return true;
}

module.exports = {
  init, load, save, saveNow,
  getPet, setPet, recalcLevel,
  getSettings, setSettings,
  listReminders, addReminder, removeReminder, toggleReminder,
  pushConversation, recentConversations,
  getAchievements, unlockAchievement,
  unlockSkin, setActiveSkin,
  unlockAccessory, setAccessory, bumpCompanionDay,
  get raw() { return cache; },
};

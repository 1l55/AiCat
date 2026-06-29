// IPC 处理器：渲染层与主进程之间的全部通信 + AI 请求代理 + 养成属性衰减循环
const { ipcMain, app } = require('electron');
const crypto = require('crypto');
const store = require('./store');
const scheduler = require('./scheduler');
const autostart = require('./autostart');
const windowManager = require('./window-manager');
const { IPC, DECAY, FLOOR, EXP_PER_LEVEL, ACHIEVEMENTS, SKINS, ACCESSORIES } = require('../shared/constants');
const { buildSystemPrompt, offlineReply } = require('../shared/personality');

let decayTimer = null;

const ACH_BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));
const SKIN_BY_KEY = Object.fromEntries(SKINS.map((s) => [s.key, s]));
const ACC_BY_KEY = Object.fromEntries(ACCESSORIES.map((a) => [a.key, a]));

// 解锁成就 + 连带解锁并自动装备其对应皮肤/配饰。
// 返回 null（已解锁过）或 {key,name,desc,skin:{...}|null,accessory:{...}|null} 供渲染层通知。
function tryUnlock(key) {
  if (!store.unlockAchievement(key)) return null;
  const meta = ACH_BY_KEY[key] || { key, name: key, desc: '' };
  let skin = null;
  if (meta.skin && store.unlockSkin(meta.skin)) {
    const s = SKIN_BY_KEY[meta.skin];
    skin = s ? { key: s.key, name: s.name } : { key: meta.skin, name: meta.skin };
    // 新皮肤自动装备，给予即时正反馈
    store.setActiveSkin(meta.skin);
  }
  let accessory = null;
  if (meta.accessory && store.unlockAccessory(meta.accessory)) {
    const ac = ACC_BY_KEY[meta.accessory];
    accessory = ac ? { key: ac.key, name: ac.name, slot: ac.slot } : { key: meta.accessory, name: meta.accessory };
    // 新配饰自动戴上（同槽位会覆盖旧配饰）
    if (ac) store.setAccessory(ac.slot, ac.key);
  }
  return { key: meta.key, name: meta.name, desc: meta.desc, skin, accessory };
}

function pushStatus() {
  const win = windowManager.getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.PET_STATUS_UPDATE, store.getPet());
  }
}

// 每分钟衰减一次
function startDecayLoop() {
  stopDecayLoop();
  decayTimer = setInterval(() => {
    const pet = store.getPet();
    // 应用下限保护：属性永不归零
    const hunger = Math.max(FLOOR.hunger, pet.hunger - DECAY.hunger);
    // 心情受饥饿影响：太饿时心情掉得更快
    const moodDecay = DECAY.mood * (hunger < 20 ? 1.6 : 1);
    const mood = Math.max(FLOOR.mood, pet.mood - moodDecay);
    store.setPet({ hunger, mood });
    pushStatus();
  }, 60 * 1000);
}
function stopDecayLoop() { if (decayTimer) { clearInterval(decayTimer); decayTimer = null; } }

// 调用 OpenAI 兼容接口；失败/无 Key 返回 null（由调用方走离线回退）
async function callLLM(userText) {
  const settings = store.getSettings();
  const ai = settings.ai || {};
  if (!ai.apiKey) return null;

  const pet = store.getPet();
  const system = buildSystemPrompt(pet, settings.petName);
  const history = store.recentConversations(10).map((m) => ({ role: m.role, content: m.content }));
  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userText },
  ];

  const base = (ai.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const url = `${base}/chat/completions`;

  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model || 'gpt-4o-mini',
        messages,
        temperature: 0.9,
        max_tokens: 120,
      }),
      signal: controller.signal,
    });
    clearTimeout(to);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[ai] HTTP', res.status, errText.slice(0, 200));
      return { error: `API ${res.status}` };
    }
    const json = await res.json();
    const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return { content: content || '' };
  } catch (e) {
    console.error('[ai] request failed:', e.message);
    return { error: e.message };
  }
}

// 解析 [emotion:xxx] 标签
function parseEmotion(text) {
  const m = text && text.match(/\[emotion:(\w+)\]/i);
  let emotion = 'neutral';
  let clean = text || '';
  if (m) { emotion = m[1].toLowerCase(); clean = text.replace(m[0], '').trim(); }
  return { clean, emotion };
}

function register() {
  // 状态读取
  ipcMain.handle(IPC.STATE_GET, () => {
    // 更新 lastSeenAt 时间戳用于重逢计算
    const pet = store.getPet();
    store.setPet({ lastSeenAt: Date.now() });
    // 陪伴天数：按本地自然日去重累加（YYYY-MM-DD）
    const d = new Date();
    const dayStr = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (store.bumpCompanionDay(dayStr) && (store.getPet().companionDays || 0) >= 7) {
      tryUnlock('weekCompanion'); // 满 7 天解锁（解锁通知在下次互动时不重发，这里静默解锁）
    }
    return {
      pet: store.getPet(),
      settings: store.getSettings(),
      reminders: store.listReminders(),
    };
  });

  // 设置读写
  ipcMain.handle(IPC.SETTINGS_GET, () => store.getSettings());
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch) => {
    const s = store.setSettings(patch);
    if (patch && patch.autostart !== undefined) autostart.set(patch.autostart);
    const win = windowManager.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(IPC.SETTINGS_CHANGED, s);
    return s;
  });

  // 成就 + 皮肤/配饰解锁状态（渲染层成就/形象面板用）
  ipcMain.handle(IPC.ACHIEVEMENTS_GET, () => {
    const pet = store.getPet();
    return {
      achievements: store.getAchievements(),
      activeSkin: pet.activeSkin || 'default',
      unlockedSkins: pet.unlockedSkins || ['default'],
      equippedAccessories: pet.equippedAccessories || {},
      unlockedAccessories: pet.unlockedAccessories || [],
    };
  });

  // 切换皮肤（仅在已解锁时生效）
  ipcMain.handle(IPC.SKIN_SET, (_e, { key }) => {
    const ok = store.setActiveSkin(key);
    if (ok) pushStatus(); // 推送最新 pet（含 activeSkin）让渲染层重新染色
    const pet = store.getPet();
    return { ok, activeSkin: pet.activeSkin, unlockedSkins: pet.unlockedSkins };
  });

  // 装备/卸下配饰（仅在已解锁时生效；key 为空表示卸下该槽位）
  ipcMain.handle(IPC.ACCESSORY_SET, (_e, { slot, key }) => {
    const ok = store.setAccessory(slot, key);
    if (ok) pushStatus(); // 推送最新 pet（含 equippedAccessories）让渲染层重绘配饰
    const pet = store.getPet();
    return { ok, equippedAccessories: pet.equippedAccessories, unlockedAccessories: pet.unlockedAccessories };
  });

  // 养成动作：feed / play / pet
  ipcMain.handle(IPC.PET_REQUEST_ACTION, (_e, { action, catchCount }) => {
    const pet = store.getPet();
    const now = Date.now();
    let patch = {};
    let leveledUp = false;
    let isCritical = false; // 是否触发暴击
    const unlockedAchievements = []; // 本次解锁的成就

    // 连击系统：10秒内连续互动计数，超过10秒重置
    const COMBO_WINDOW = 10000;
    const timeSinceLastInteraction = now - (pet.lastInteractionAt || 0);
    let comboCount = timeSinceLastInteraction < COMBO_WINDOW ? pet.comboCount + 1 : 1;

    // 连击加成：每连击1次，奖励+5%（最高30%）
    const comboBonus = Math.min(comboCount - 1, 6) * 0.05;

    if (action === 'feed') {
      // 基础奖励
      const baseHunger = 30;
      const baseMood = 5;
      const baseAffection = 2;
      const baseExp = 5;

      // 10% 概率暴击：双倍奖励
      isCritical = Math.random() < 0.1;
      const multiplier = (isCritical ? 2 : 1) * (1 + comboBonus);

      // 变量奖励：基础值±20%随机波动
      const hungerGain = baseHunger * multiplier * (0.8 + Math.random() * 0.4);
      const moodGain = baseMood * multiplier * (0.8 + Math.random() * 0.4);
      const affectionGain = baseAffection * multiplier * (0.8 + Math.random() * 0.4);
      const expGain = baseExp * multiplier * (0.8 + Math.random() * 0.4);

      patch.hunger = Math.min(100, pet.hunger + hungerGain);
      patch.mood = Math.min(100, pet.mood + moodGain);
      patch.affection = Math.min(100, pet.affection + affectionGain);
      patch.exp = pet.exp + expGain;
      patch.lastFedAt = Date.now();
      patch.feedCount = (pet.feedCount || 0) + 1;

      // 成就：首次喂食
      const a = tryUnlock('firstFeed');
      if (a) unlockedAchievements.push(a);
    } else if (action === 'play') {
      // 游戏表现影响奖励（catchCount 传入）
      const performanceMultiplier = catchCount ? Math.min(1 + catchCount * 0.1, 2) : 1;

      const baseMood = 15;
      const baseAffection = 3;
      const baseExp = 8;

      // 15% 概率暴击（游戏更容易暴击）
      isCritical = Math.random() < 0.15;
      const multiplier = (isCritical ? 2 : 1) * (1 + comboBonus) * performanceMultiplier;

      const moodGain = baseMood * multiplier * (0.8 + Math.random() * 0.4);
      const affectionGain = baseAffection * multiplier * (0.8 + Math.random() * 0.4);
      const expGain = baseExp * multiplier * (0.8 + Math.random() * 0.4);

      patch.mood = Math.min(100, pet.mood + moodGain);
      patch.affection = Math.min(100, pet.affection + affectionGain);
      patch.exp = pet.exp + expGain;
      patch.hunger = Math.max(0, pet.hunger - 2);

      // 成就：激光大师
      if (catchCount >= 10) {
        const a = tryUnlock('laserMaster');
        if (a) unlockedAchievements.push(a);
      }
    } else if (action === 'pet') {
      const baseMood = 5;
      const baseAffection = 1;
      const baseExp = 1;

      // 5% 概率暴击（摸头暴击率低但惊喜感强）
      isCritical = Math.random() < 0.05;
      const multiplier = (isCritical ? 3 : 1) * (1 + comboBonus);

      const moodGain = baseMood * multiplier * (0.8 + Math.random() * 0.4);
      const affectionGain = baseAffection * multiplier * (0.8 + Math.random() * 0.4);
      const expGain = baseExp * multiplier * (0.8 + Math.random() * 0.4);

      patch.mood = Math.min(100, pet.mood + moodGain);
      patch.affection = Math.min(100, pet.affection + affectionGain);
      patch.exp = pet.exp + expGain;
    }

    // 更新连击和互动计数
    patch.comboCount = comboCount;
    patch.lastInteractionAt = now;
    patch.totalInteractions = (pet.totalInteractions || 0) + 1;

    store.setPet(patch);
    const newPet = store.getPet();
    leveledUp = store.recalcLevel();

    // 阈值类成就批量检查（达成条件即解锁，并连带解锁对应皮肤）
    const hour = new Date().getHours();
    const conditions = {
      criticalHit: isCritical,
      combo5: comboCount >= 5,
      combo10: comboCount >= 10,
      combo20: comboCount >= 20,
      level5: newPet.level >= 5,
      level10: newPet.level >= 10,
      level20: newPet.level >= 20,
      affection50: newPet.affection >= 50,
      affection100: newPet.affection >= 100,
      interactions100: newPet.totalInteractions >= 100,
      interactions500: newPet.totalInteractions >= 500,
      feedMaster: (newPet.feedCount || 0) >= 50,
      nightOwl: hour >= 23 || hour < 6,
    };
    for (const key of Object.keys(conditions)) {
      if (conditions[key]) {
        const a = tryUnlock(key);
        if (a) unlockedAchievements.push(a);
      }
    }

    store.save();
    pushStatus();
    return {
      pet: store.getPet(),
      leveledUp,
      isCritical,
      comboCount,
      unlockedAchievements
    };
  });

  // 直接更新状态（渲染层用，例如双击摸头）
  ipcMain.handle(IPC.PET_UPDATE_STATUS, (_e, patch) => {
    store.setPet(patch || {});
    store.recalcLevel();
    pushStatus();
    return store.getPet();
  });

  // AI 对话
  ipcMain.handle(IPC.CHAT_SEND, async (_e, { text }) => {
    const pet = store.getPet();
    store.pushConversation({ role: 'user', content: text, ts: Date.now() });

    const result = await callLLM(text);
    let reply, emotion;
    if (result && result.content) {
      const parsed = parseEmotion(result.content);
      reply = parsed.clean || result.content;
      emotion = parsed.emotion;
    } else {
      // 离线 / 失败回退
      const off = offlineReply('chat', pet);
      reply = off.text;
      emotion = off.emotion;
    }
    store.pushConversation({ role: 'assistant', content: reply, emotion, ts: Date.now() });
    // 聊天小幅增加好感 + 累计对话计数
    store.setPet({
      affection: Math.min(100, pet.affection + 1),
      exp: pet.exp + 2,
      chatCount: (pet.chatCount || 0) + 1,
    });
    store.recalcLevel();
    // 成就：话痨伙伴（累计对话 30 次）
    const chatAch = [];
    if ((store.getPet().chatCount || 0) >= 30) {
      const a = tryUnlock('chatMaster');
      if (a) chatAch.push(a);
    }
    pushStatus();
    return { reply, emotion, offline: !(result && result.content), unlockedAchievements: chatAch };
  });

  // 提醒 CRUD
  ipcMain.handle(IPC.REMINDER_LIST, () => store.listReminders());
  ipcMain.handle(IPC.REMINDER_CREATE, (_e, r) => {
    const reminder = {
      id: crypto.randomUUID(),
      title: r.title || '提醒',
      message: r.message || '',
      cron: r.cron,
      enabled: r.enabled !== false,
      petReaction: r.petReaction || 'happy',
    };
    store.addReminder(reminder);
    scheduler.refresh(reminder);
    return reminder;
  });
  ipcMain.handle(IPC.REMINDER_DELETE, (_e, { id }) => {
    scheduler.unschedule(id);
    store.removeReminder(id);
    return store.listReminders();
  });
  ipcMain.handle(IPC.REMINDER_TOGGLE, (_e, { id, enabled }) => {
    const r = store.toggleReminder(id, enabled);
    if (r) scheduler.refresh(r);
    return store.listReminders();
  });

  // 窗口交互 / 拖拽 / 穿透
  ipcMain.on(IPC.WINDOW_SET_INTERACTIVE, (_e, value) => windowManager.setInteractive(!!value));
  ipcMain.on(IPC.WINDOW_MOVE_BY, (_e, { dx, dy }) => windowManager.moveBy(dx, dy));
  ipcMain.on(IPC.WINDOW_DRAG, (_e, phase) => {
    if (phase === 'end') windowManager.savePosition();
  });

  ipcMain.on(IPC.APP_QUIT, () => { app.isQuiting = true; app.quit(); });
}

module.exports = { register, startDecayLoop, stopDecayLoop, pushStatus };

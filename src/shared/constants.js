// 共享常量：状态枚举、衰减速率、IPC 频道名、默认数据
// 同时被主进程(CommonJS)与渲染进程(<script>注入 window.PetConstants)使用。

const PetState = {
  IDLE: 'idle',
  WALK: 'walk',
  SLEEP: 'sleep',
  EAT: 'eat',
  CHAT: 'chat',
  PLAY: 'play',
};

// 情绪标签（AI 回复中以 [emotion:xxx] 标记，驱动动画/气泡表情）
const Emotion = {
  HAPPY: 'happy',
  SAD: 'sad',
  HUNGRY: 'hungry',
  SLEEPY: 'sleepy',
  ANGRY: 'angry',
  CURIOUS: 'curious',
  NEUTRAL: 'neutral',
};

// 每分钟自然衰减
const DECAY = {
  hunger: 0.1,
  mood: 0.08,
};

// 属性下限保护（永不归零）
const FLOOR = {
  hunger: 15,
  mood: 20,
};

// 养成阈值
const THRESHOLD = {
  hungryBelow: 20, // 饱腹度低于此值表现饥饿
  boredAbove: 80,  // 无聊值高于此值会自娱自乐
  sleepIdleMs: 5 * 60 * 1000, // 5 分钟无操作进入睡眠
};

// 缩放档位（精灵整体放大倍率）
const SCALE_PRESETS = { small: 3, medium: 4, large: 6 };

// 皮肤系统（纯染色，零新增美术）：tint 为乘法染色，只能压暗/偏色。
// 每款皮肤由一个成就解锁；default 为初始皮肤。
// 顺序即为面板展示顺序。
const SKINS = [
  { key: 'default',  name: '奶橘',     tint: 0xFFFFFF, achievement: null,            desc: '默认皮肤' },
  { key: 'cream',    name: '奶盐白',   tint: 0xF2E9DE, achievement: 'firstFeed',     desc: '第一次投喂解锁' },
  { key: 'sakura',   name: '樱花粉',   tint: 0xF7B5C4, achievement: 'combo5',        desc: '5 连击解锁' },
  { key: 'mint',     name: '薄荷绿',   tint: 0xA8E0C8, achievement: 'combo10',       desc: '10 连击解锁' },
  { key: 'ink',      name: '墨灰',     tint: 0x9AA0A6, achievement: 'level5',        desc: '达到 5 级解锁' },
  { key: 'night',    name: '暗夜黑',   tint: 0x6A6A7E, achievement: 'level10',       desc: '达到 10 级解锁' },
  { key: 'peach',    name: '蜜桃橘',   tint: 0xFFB07A, achievement: 'affection50',   desc: '好感度 50 解锁' },
  { key: 'rose',     name: '玫瑰金',   tint: 0xF7C5C0, achievement: 'affection100',  desc: '好感度满级解锁' },
  { key: 'sky',      name: '天空蓝',   tint: 0xA8D0F0, achievement: 'interactions100', desc: '互动 100 次解锁' },
  { key: 'lavender', name: '薰衣草紫', tint: 0xC8B8E8, achievement: 'interactions500', desc: '互动 500 次解锁' },
  { key: 'gold',     name: '黄金',     tint: 0xFFD75A, achievement: 'criticalHit',   desc: '触发暴击解锁' },
  { key: 'starry',   name: '星夜蓝',   tint: 0x8A9AD8, achievement: 'nightOwl',      desc: '深夜陪伴解锁' },
  { key: 'laser',    name: '激光绿',   tint: 0xB0E86A, achievement: 'laserMaster',   desc: '激光大师解锁' },
  { key: 'flame',    name: '烈焰红',   tint: 0xFF7A6A, achievement: 'combo20',       desc: '20 连击解锁' },
  { key: 'galaxy',   name: '银河紫',   tint: 0xA890E0, achievement: 'level20',       desc: '达到 20 级解锁' },
  { key: 'aurora',   name: '极光青',   tint: 0x88E0D0, achievement: 'weekCompanion', desc: '陪伴满 7 天解锁' },
];

// 配饰系统（代码绘制矢量形状，零新增美术）：分 4 槽位，同槽位互斥、跨槽位可叠戴。
// color 供 Pet.js 矢量绘制使用；每件由一个成就解锁。
const ACC_SLOTS = ['head', 'body', 'feet', 'back']; // 头/身/脚/背
const ACCESSORIES = [
  { key: 'bow',        name: '🎀 蝴蝶结', slot: 'head', color: 0xFF6F9C, achievement: 'combo10',         desc: '10 连击解锁' },
  { key: 'crown',      name: '👑 皇冠',   slot: 'head', color: 0xFFD75A, achievement: 'level10',         desc: '达到 10 级解锁' },
  { key: 'santaHat',   name: '🎅 圣诞帽', slot: 'head', color: 0xE74C3C, achievement: 'nightOwl',        desc: '深夜陪伴解锁' },
  { key: 'strawHat',   name: '👒 草帽',   slot: 'head', color: 0xD9B36A, achievement: 'chatMaster',      desc: '累计对话 30 次解锁' },
  { key: 'scarf',      name: '🧣 围巾',   slot: 'body', color: 0x5AA0E0, achievement: 'interactions100', desc: '互动 100 次解锁' },
  { key: 'cape',       name: '🦸 披风',   slot: 'body', color: 0x8E44AD, achievement: 'interactions500', desc: '互动 500 次解锁' },
  { key: 'boots',      name: '👢 小红靴', slot: 'feet', color: 0xC0392B, achievement: 'combo20',         desc: '20 连击解锁' },
  { key: 'angelWings', name: '😇 天使翼', slot: 'back', color: 0xFFFFFF, achievement: 'affection100',    desc: '好感度满级解锁' },
  { key: 'devilWings', name: '😈 恶魔翼', slot: 'back', color: 0x9B2335, achievement: 'feedMaster',      desc: '累计喂食 50 次解锁' },
];

// 成就目录：名称/描述 + 可选 skin / accessory 奖励 key（单一事实来源，主进程与渲染层共用）
const ACHIEVEMENTS = [
  { key: 'firstFeed',       name: '🍖 第一次投喂', desc: '给小团子第一次喂食',     skin: 'cream' },
  { key: 'combo5',          name: '⚡ 5连击',      desc: '连续互动 5 次',          skin: 'sakura' },
  { key: 'combo10',         name: '⚡⚡ 10连击',    desc: '连续互动 10 次',         skin: 'mint',     accessory: 'bow' },
  { key: 'level5',          name: '🌟 初露锋芒',   desc: '达到 5 级',              skin: 'ink' },
  { key: 'level10',         name: '🌟🌟 小有成就', desc: '达到 10 级',             skin: 'night',    accessory: 'crown' },
  { key: 'affection50',     name: '💕 亲密无间',   desc: '好感度达到 50',          skin: 'peach' },
  { key: 'affection100',    name: '💕💕 心心相印', desc: '好感度满级',             skin: 'rose',     accessory: 'angelWings' },
  { key: 'interactions100', name: '🎮 热情玩家',   desc: '累计互动 100 次',        skin: 'sky',      accessory: 'scarf' },
  { key: 'interactions500', name: '🎮🎮 资深玩家', desc: '累计互动 500 次',        skin: 'lavender', accessory: 'cape' },
  { key: 'criticalHit',     name: '💥 幸运之星',   desc: '触发一次暴击',           skin: 'gold' },
  { key: 'nightOwl',        name: '🌙 夜猫子',     desc: '深夜还在陪伴小团子',     skin: 'starry',   accessory: 'santaHat' },
  { key: 'laserMaster',     name: '⚡ 激光大师',   desc: '一局游戏抓到 10 次光点', skin: 'laser' },
  { key: 'combo20',         name: '🔥 连击狂魔',   desc: '连续互动 20 次',         skin: 'flame',    accessory: 'boots' },
  { key: 'level20',         name: '🏅 渐入佳境',   desc: '达到 20 级',             skin: 'galaxy' },
  { key: 'feedMaster',      name: '🍱 投喂达人',   desc: '累计喂食 50 次',         accessory: 'devilWings' },
  { key: 'chatMaster',      name: '💬 话痨伙伴',   desc: '累计对话 30 次',         accessory: 'strawHat' },
  { key: 'weekCompanion',   name: '📅 七日之约',   desc: '累计陪伴满 7 天',        skin: 'aurora' },
];

// 按 key 取皮肤 tint（找不到回退到默认色）
function skinTint(key) {
  const s = SKINS.find((x) => x.key === key);
  return s ? s.tint : 0xFFFFFF;
}
// 按 key 取配饰定义
function accessoryDef(key) {
  return ACCESSORIES.find((x) => x.key === key) || null;
}

// 等级所需经验（线性：每级 100 exp）
const EXP_PER_LEVEL = 100;

// IPC 频道名
const IPC = {
  // Renderer -> Main
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
  ACHIEVEMENTS_GET: 'achievements:get', // 读取成就与皮肤/配饰解锁状态
  SKIN_SET: 'skin:set',                 // 切换当前皮肤（须已解锁）
  ACCESSORY_SET: 'accessory:set',       // 装备/卸下某槽位配饰（须已解锁）
  APP_QUIT: 'app:quit',
  OPEN_PANEL: 'ui:open-panel', // tray/menu 请求渲染层打开某面板
  // Main -> Renderer
  PET_STATUS_UPDATE: 'pet:status-update',
  REMINDER_TRIGGER: 'reminder:trigger',
  SETTINGS_CHANGED: 'settings:changed',
  TRAY_COMMAND: 'tray:command',
};

// 预设提醒模板
const REMINDER_TEMPLATES = [
  { key: 'pomodoro', title: '🍅 番茄钟', message: '专注 25 分钟啦，起来活动一下～', cron: '*/25 * * * *', petReaction: 'happy' },
  { key: 'water',    title: '💧 喝水提醒', message: '咕咚咕咚，记得补充水分哦！', cron: '0 * * * *', petReaction: 'happy' },
  { key: 'eyecare',  title: '👀 护眼提醒', message: '盯屏幕太久啦，眺望一下远方吧～', cron: '*/45 * * * *', petReaction: 'curious' },
  { key: 'lunch',    title: '🍚 午饭提醒', message: '中午了，去吃饭饭！', cron: '0 12 * * *', petReaction: 'happy' },
  { key: 'sleep',    title: '🌙 晚安提醒', message: '夜深了，早点休息，明天见～', cron: '0 23 * * *', petReaction: 'sleepy' },
];

// 默认持久化数据
const DEFAULT_DATA = {
  pet: {
    hunger: 80,
    mood: 70,
    affection: 10,
    exp: 0,
    level: 1,
    posX: null, // null 表示首次启动时居中靠右下
    posY: null,
    lastFedAt: 0,
    updatedAt: 0,
    lastSeenAt: 0, // 用于重逢补偿计算
    comboCount: 0, // 连击计数
    lastInteractionAt: 0, // 上次互动时间
    totalInteractions: 0, // 总互动次数（成就用）
    feedCount: 0, // 累计喂食次数（成就用）
    chatCount: 0, // 累计对话次数（成就用）
    companionDays: 0, // 累计陪伴天数（按自然日去重，成就用）
    lastActiveDay: '', // 上次记录的自然日（YYYY-MM-DD），用于陪伴天数累加
    skinColor: 0xFFFFFF, // 当前皮肤色调（成就解锁）—— 兼容旧字段
    activeSkin: 'default', // 当前装备的皮肤 key
    unlockedSkins: ['default'], // 已解锁的皮肤 key 列表
    unlockedAccessories: [], // 已解锁的配饰 key 列表
    equippedAccessories: {}, // 已装备配饰 { slot: key }，卸下则删除该键
  },
  achievements: {
    firstFeed: false,      // 首次喂食
    combo5: false,         // 5连击
    combo10: false,        // 10连击
    combo20: false,        // 20连击
    level5: false,         // 达到5级
    level10: false,        // 达到10级
    level20: false,        // 达到20级
    affection50: false,    // 好感度50
    affection100: false,   // 好感度100
    interactions100: false,// 互动100次
    interactions500: false,// 互动500次
    criticalHit: false,    // 触发暴击
    nightOwl: false,       // 深夜陪伴（23点后互动）
    laserMaster: false,    // 激光游戏抓到10次
    feedMaster: false,     // 累计喂食50次
    chatMaster: false,     // 累计对话30次
    weekCompanion: false,  // 累计陪伴满7天
  },
  settings: {
    scale: 'medium',
    autostart: false,
    soundOn: true,
    petName: '小团子',
    ai: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    },
  },
  reminders: [], // {id,title,message,cron,enabled,petReaction}
  conversations: [], // {role,content,emotion,ts}
};

const data = {
  PetState, Emotion, DECAY, FLOOR, THRESHOLD, SCALE_PRESETS, EXP_PER_LEVEL,
  IPC, REMINDER_TEMPLATES, DEFAULT_DATA,
  SKINS, ACCESSORIES, ACC_SLOTS, ACHIEVEMENTS, skinTint, accessoryDef,
};

// 双导出：Node require 与浏览器 <script>
if (typeof module !== 'undefined' && module.exports) {
  module.exports = data;
}
if (typeof window !== 'undefined') {
  window.PetConstants = data;
}

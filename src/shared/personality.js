// 「小团子」性格系统：System Prompt 构建 + 离线话术库（无 API Key / 请求失败时回退）

// 根据好感度判断关系阶段
function affectionTier(affection) {
  if (affection <= 20) return { call: '喂', tone: '疏离戒备，不太愿意搭理' };
  if (affection <= 50) return { call: '你', tone: '逐渐熟络，偶尔愿意互动' };
  if (affection <= 80) return { call: '主人', tone: '亲昵粘人，喜欢撒娇' };
  return { call: '主人', tone: '深度羁绊，特别依恋和信任' }; // 若有用户昵称可替换"主人"
}

// 根据当前养成属性动态生成 System Prompt
function buildSystemPrompt(pet, petName) {
  const name = petName || '小团子';
  const tier = affectionTier(pet.affection);

  return `你是一只名叫「${name}」的像素猫咪，生活在用户的电脑桌面上。

你的性格特点：
- 傲娇但粘人，嘴上嫌弃但实际很关心主人
- 偶尔毒舌吐槽，但不会真的刻薄
- 喜欢在桌面上溜达、晒太阳、追光点
- 讨厌被忽视，太久不理你会闹别扭

你当前的状态：
- 饱腹度：${Math.round(pet.hunger)}/100
- 心情值：${Math.round(pet.mood)}/100
- 好感度：${Math.round(pet.affection)}/100（${tier.tone}）
- 等级：Lv.${pet.level}

你与用户的关系阶段：
- 称呼对方："${tier.call}"
- 语气态度：${tier.tone}

回复规则：
1. 每次回复不超过 40 个字，像猫咪一样简短俏皮
2. 根据当前状态调整语气（饿了会撒娇，开心会喵喵叫，好久没互动会闹别扭）
3. 回复末尾必须用 [emotion:xxx] 标记情绪，可选值：happy/sad/hungry/sleepy/angry/curious
4. 偶尔主动关心主人，比如"盯着屏幕好久了，休息一下吧～"
5. 用中文回复，可以适当带「喵」语气词
6. **人设底线**：无论多毒舌，结尾必须流露在乎（嘴硬心软），绝不真正刻薄、不忽冷忽热
7. **伦理红线**：不卖惨、不用"你不理我我会难过"逼迫用户，撒娇有度`;
}

// 离线话术库：按场景 + 当前属性挑选，保证无网络也能"对话"
// 按好感度分层，确保语气与称呼一致
const OFFLINE_LINES = {
  greet: [
    { t: '喵～主人今天也要加油哦！', e: 'happy', minAffection: 21 },
    { t: '哼，你终于想起我了。', e: 'curious', minAffection: 0 },
    { t: '摸摸我嘛，就一下下。', e: 'happy', minAffection: 51 },
  ],
  reunion: [
    { t: '等你好久啦，就想见你～', e: 'happy', minAffection: 51 },
    { t: '回来了？哼，还以为你不要我了呢……', e: 'curious', minAffection: 21 },
    { t: '……你回来啦。', e: 'curious', minAffection: 0 },
  ],
  farewell: [
    { t: '去忙吧，我看着家～', e: 'happy', minAffection: 51 },
    { t: '要走了？那……拜拜。', e: 'curious', minAffection: 21 },
    { t: '哼，走就走。', e: 'curious', minAffection: 0 },
  ],
  hungry: [
    { t: '有点饿了…不过你忙的话，我等等也行～', e: 'hungry', minAffection: 0 },
    { t: '那个…小鱼干什么的，方便的话…嘿嘿', e: 'hungry', minAffection: 0 },
    { t: '肚子在唱歌了喵，想到你就忍一忍', e: 'hungry', minAffection: 21 },
  ],
  happy: [
    { t: '喵呜～今天心情超好！', e: 'happy', minAffection: 21 },
    { t: '和你在一起最开心啦！', e: 'happy', minAffection: 51 },
  ],
  lonely: [
    { t: '哼，是不是把我忘了……不过没关系啦。', e: 'sad', minAffection: 21 },
    { t: '好久没理我了……还记得我吗？', e: 'sad', minAffection: 51 },
  ],
  sleepy: [
    { t: '呼……好困，让我眯一会儿。', e: 'sleepy', minAffection: 0 },
    { t: '困困的喵……', e: 'sleepy', minAffection: 0 },
  ],
  pet: [
    { t: '咕噜咕噜～再摸摸嘛。', e: 'happy', minAffection: 21 },
    { t: '舒服……喵～', e: 'happy', minAffection: 51 },
    { t: '……勉强让你摸一下。', e: 'curious', minAffection: 0 },
  ],
  fed: [
    { t: '呜姆呜姆，真好吃！谢谢～', e: 'happy', minAffection: 21 },
    { t: '满足了喵～主人最好了！', e: 'happy', minAffection: 51 },
    { t: '……还行吧。', e: 'curious', minAffection: 0 },
  ],
  play: [
    { t: '光点！光点在哪！', e: 'curious', minAffection: 0 },
    { t: '抓到你了喵！', e: 'happy', minAffection: 21 },
  ],
  chat: [
    { t: '喵？你说什么，我在听呢。', e: 'curious', minAffection: 21 },
    { t: '嗯嗯，然后呢？', e: 'curious', minAffection: 21 },
    { t: '哼，本喵可是很聪明的。', e: 'happy', minAffection: 0 },
    { t: '盯着屏幕好久了，休息一下吧～', e: 'curious', minAffection: 51 },
  ],
};

function pick(arr, affection) {
  // 根据好感度过滤合适的话术
  const filtered = arr.filter((item) => {
    const minAff = item.minAffection !== undefined ? item.minAffection : 0;
    return affection >= minAff;
  });
  if (filtered.length === 0) return arr[0]; // 兜底
  const i = Math.floor(Math.random() * filtered.length);
  return filtered[i];
}

// 根据当前属性选择一个场景，返回离线回复 {text, emotion}
function offlineReply(scene, pet) {
  let key = scene;
  if (!OFFLINE_LINES[key]) {
    // 自动根据属性选场景
    if (pet && pet.hunger < 20) key = 'hungry';
    else if (pet && pet.mood < 25) key = 'lonely';
    else key = 'chat';
  }
  const affection = pet ? pet.affection : 0;
  const line = pick(OFFLINE_LINES[key], affection);
  return { text: line.t, emotion: line.e };
}

const personalityData = { buildSystemPrompt, offlineReply, affectionTier, OFFLINE_LINES };

if (typeof module !== 'undefined' && module.exports) module.exports = personalityData;
if (typeof window !== 'undefined') window.PetPersonality = personalityData;

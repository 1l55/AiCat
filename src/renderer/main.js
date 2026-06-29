// 渲染层主入口：初始化 PixiJS，装配宠物引擎、UI、AI、提醒、小游戏
(function () {
  const { PetState, SCALE_PRESETS } = window.PetConstants;
  const api = window.petAPI;

  let app, pet, sm, brain, interaction;
  let bubble, menu, statusPanel, settingsPanel, reminderPanel, chat, achievementPanel;
  let laser = null;
  let settings = null;

  async function boot() {
    const state = await api.getState();
    settings = state.settings;
    const scaleFactor = SCALE_PRESETS[settings.scale] || 4;

    // PixiJS 透明应用
    app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundAlpha: 0,
      antialias: false,
      resolution: 1,
      autoDensity: false,
    });
    document.body.appendChild(app.view);
    app.view.classList.add('pet-canvas');

    // 宠物
    pet = new window.Pet(app);
    await pet.load(scaleFactor);
    console.log('[boot] pet loaded, frames ready; canvas', app.renderer.width + 'x' + app.renderer.height);

    // 状态机
    sm = new window.StateMachine((next) => pet.applyState(next));

    // 气泡（锚点 = 猫头顶）
    bubble = new window.DialogBubble(() => ({
      x: pet.x,
      y: pet.sprite.y - pet.height,
    }));

    // 行为树
    brain = new window.BehaviorTree({
      sm, pet, app, bubble,
      getStatus: () => state.pet,
    });
    // 让 getStatus 始终读最新
    brain.ctx.getStatus = () => currentPet;

    // 面板
    statusPanel = new window.StatusPanel(() => settings.petName);
    settingsPanel = new window.SettingsPanel(async (patch) => {
      settings = await api.setSettings(patch);
      applySettings(settings);
    });
    reminderPanel = new window.ReminderPanel(api);
    achievementPanel = new window.AchievementPanel(api,
      (key, tint) => { pet.setSkin(tint); }, // 切换皮肤后即时换色
      (equipped) => { pet.setAccessories(equipped); } // 切换配饰后即时重绘
    );
    chat = new window.ChatService({
      api, bubble,
      onEmotion: (emotion) => reactEmotion(emotion),
    });

    // 右键菜单
    menu = new window.MenuPanel({
      chat: () => openChat(),
      feed: () => doFeed(),
      play: () => doPlay(),
      status: () => statusPanel.show(currentPet),
      reminders: () => reminderPanel.show(),
      achievements: () => achievementPanel.show(),
      settings: () => settingsPanel.show(settings),
      quit: () => api.quit(),
    });

    // 交互
    interaction = new window.Interaction({
      app, pet, sm, brain, bubble,
      isPanelOpen: () => anyPanelOpen(),
      onClick: () => onPetClick(),
      onDoubleClick: () => onPetDoubleClick(),
      onContextMenu: (e) => menu.openAt(e.clientX, e.clientY),
      onDragEnd: (x, y) => { api.updateStatus({ posX: x, posY: y }); },
    });

    // 初始状态
    currentPet = state.pet;

    // 检查是否为久别重逢（离开2小时以上）
    const awayMs = Date.now() - (currentPet.lastSeenAt || currentPet.updatedAt || Date.now());
    const awayH = awayMs / 3.6e6;
    if (awayH >= 2) {
      isReunion = true;
      // 重逢补偿：小幅回补心情（离开越久补得越多，最多12点）
      const moodBonus = awayH >= 12 ? 12 : 6;
      await api.updateStatus({ mood: Math.min(100, currentPet.mood + moodBonus) });
      // 刷新 currentPet
      const newState = await api.getState();
      currentPet = newState.pet;
    }

    pet.restore(currentPet.posX, currentPet.posY);
    pet.setSkin(window.PetConstants.skinTint(currentPet.activeSkin)); // 应用已装备皮肤
    pet.setAccessories(currentPet.equippedAccessories || {}); // 应用已装备配饰
    statusPanel.update(currentPet);

    // 主进程状态推送
    api.onStatusUpdate((p) => {
      currentPet = p;
      pet.setSkin(window.PetConstants.skinTint(p.activeSkin)); // 皮肤可能变更（切换/解锁）
      pet.setAccessories(p.equippedAccessories || {}); // 配饰可能变更（切换/解锁）
      pet.applyMood(p); // 根据属性调整外观
      if (statusPanel.isOpen()) statusPanel.update(p);
    });

    // 提醒触发
    api.onReminderTrigger((r) => {
      sm.markInteraction();
      bubble.show(`${r.title}：${r.message}`, r.petReaction || 'happy', 6000);
      reactEmotion(r.petReaction || 'happy');
    });

    // 设置变更
    api.onSettingsChanged((s) => { settings = s; applySettings(s); });

    // 托盘命令
    api.onTrayCommand(({ cmd }) => {
      if (cmd === 'chat') openChat();
      else if (cmd === 'feed') doFeed();
      else if (cmd === 'play') doPlay();
      else if (cmd === 'status') statusPanel.show(currentPet);
      else if (cmd === 'achievements') achievementPanel.show();
      else if (cmd === 'reminders') reminderPanel.show();
      else if (cmd === 'settings') settingsPanel.show(settings);
    });

    // 主循环
    app.ticker.add((delta) => {
      const now = performance.now();
      if (laser && laser.isActive()) {
        laser.update(delta);
      } else {
        brain.tick(now, delta);
      }
      pet.update(delta);
      pet.applyMood(currentPet); // 每帧根据属性调整外观
      // 面板开启时强制窗口可交互
      interaction.setForceInteractive(anyPanelOpen());

      // 检测长时间无操作，显示温柔告别（每会话最多一次）
      if (!hasShownFarewell && Date.now() - lastActivityTime > 10 * 60 * 1000) {
        hasShownFarewell = true;
        const line = window.PetPersonality.offlineReply('farewell', currentPet);
        bubble.show(line.text, line.emotion, 4000);
      }
    });

    // 入场打个招呼
    setTimeout(() => {
      const greeting = greetLine(currentPet, isReunion);
      bubble.show(greeting, 'happy', 3000);
      if (isReunion) pet.happyBounce(); // 重逢时给小特效
    }, 600);
  }

  let currentPet = null;
  let isReunion = false; // 标记是否为久别重逢
  let hasShownFarewell = false; // 本次会话是否已显示告别
  let lastActivityTime = Date.now(); // 最后活动时间

  function applySettings(s) {
    const sf = SCALE_PRESETS[s.scale] || 4;
    pet.setScale(sf);
  }

  // 成就解锁通知：逐条弹气泡 + 庆祝粒子，解锁皮肤时额外提示
  function announceAchievements(list, baseDelay = 2500) {
    if (!list || list.length === 0) return;
    setTimeout(() => {
      list.forEach((ach, idx) => {
        setTimeout(() => {
          const skinLine = ach.skin ? `\n🎨 新皮肤「${ach.skin.name}」已解锁并换上！` : '';
          const accLine = ach.accessory ? `\n👗 新配饰「${ach.accessory.name}」已解锁！` : '';
          bubble.show(`✨成就解锁✨\n${ach.name}\n${ach.desc}${skinLine}${accLine}`, 'happy', 4500);
          pet.celebrate();
        }, idx * 5000);
      });
    }, baseDelay);
  }

  function anyPanelOpen() {
    return menu.isOpen() || statusPanel.isOpen() || settingsPanel.isOpen()
      || reminderPanel.isOpen() || chat.isOpen() || achievementPanel.isOpen();
  }

  // —— 交互行为 ——
  function onPetClick() {
    lastActivityTime = Date.now(); // 更新活动时间
    sm.markInteraction();
    brain.resetIdleTimers();
    if (sm.is(PetState.SLEEP)) {
      sm.transition(PetState.IDLE);
      bubble.show('呼啊…被吵醒了喵', 'sleepy', 2000);
      return;
    }

    // 随机反应（变量奖励）
    const reactions = [
      { text: '喵？', emotion: 'curious', bounce: false },
      { text: '干嘛戳我～', emotion: 'curious', bounce: true },
      { text: '哼，在呢。', emotion: 'curious', bounce: false },
      { text: '想我啦？', emotion: 'happy', bounce: true },
      { text: '喵呜～', emotion: 'happy', bounce: true },
      { text: '别闹～', emotion: 'curious', bounce: false },
    ];
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    bubble.show(reaction.text, reaction.emotion, 1800);
    if (reaction.bounce) pet.happyBounce();
  }

  async function onPetDoubleClick() {
    lastActivityTime = Date.now(); // 更新活动时间
    sm.markInteraction();
    brain.resetIdleTimers();
    pet.happyBounce();

    const res = await api.requestAction('pet'); // 摸头：好感/心情
    currentPet = res.pet;

    // 连击提示
    let comboText = '';
    if (res.comboCount >= 3) {
      comboText = ` ${res.comboCount}连击！⚡`;
    }

    // 暴击反馈（摸头暴击稀有但奖励高）
    if (res.isCritical) {
      bubble.show(`咕噜咕噜～超级舒服！！💕${comboText}`, 'happy', 2500);
      pet.celebrate(); // 稀有暴击特效
      setTimeout(() => pet.happyBounce(), 400);
    } else {
      const lines = [
        '咕噜咕噜～舒服',
        '再摸摸嘛～',
        '喵呜～',
        '……勉强让你摸。'
      ];
      bubble.show(lines[Math.floor(Math.random() * lines.length)] + comboText, 'happy', 2000);
    }

    if (statusPanel.isOpen()) statusPanel.update(currentPet);

    // 成就解锁通知
    announceAchievements(res.unlockedAchievements);

    // 直接再加一点心情（双击摸头）
    await api.updateStatus({ mood: Math.min(100, currentPet.mood + 4) });
  }

  async function doFeed() {
    lastActivityTime = Date.now(); // 更新活动时间
    sm.markInteraction();
    brain.resetIdleTimers();
    sm.transition(PetState.EAT, { lock: true });

    const res = await api.requestAction('feed');
    currentPet = res.pet;

    // 连击提示
    let comboText = '';
    if (res.comboCount >= 3) {
      comboText = ` ${res.comboCount}连击！⚡`;
    }

    // 暴击反馈
    if (res.isCritical) {
      bubble.show(`哇！超级好吃！！！💖${comboText}`, 'happy', 3000);
      pet.celebrate(); // 暴击播放升级特效
      // 额外弹跳
      setTimeout(() => pet.happyBounce(), 300);
    } else {
      // 普通反馈也随机化
      const lines = [
        '开饭啦！呜姆呜姆～',
        '好吃！谢谢主人～',
        '满足了喵～',
        '就知道你会喂我的！'
      ];
      bubble.show(lines[Math.floor(Math.random() * lines.length)] + comboText, 'happy', 2500);
    }

    if (statusPanel.isOpen()) statusPanel.update(currentPet);

    // 成就解锁通知
    announceAchievements(res.unlockedAchievements);

    if (res.leveledUp) {
      setTimeout(() => {
        pet.celebrate();
        bubble.show(`本喵又变强啦！Lv.${currentPet.level} 🎉`, 'happy', 2500);
      }, 2200);
    }
    setTimeout(() => { sm.locked = false; sm.transition(PetState.IDLE); }, 2000);
  }

  function doPlay() {
    lastActivityTime = Date.now(); // 更新活动时间
    if (laser && laser.isActive()) return;
    sm.markInteraction();
    brain.resetIdleTimers();
    laser = new window.LaserChase({
      app, pet, sm, bubble, api,
      onEnd: async (rewards) => {
        if (rewards.action) {
          // 传递游戏表现（抓到次数）
          const res = await api.requestAction(rewards.action, { catchCount: rewards.catchCount || 0 });
          currentPet = res.pet;

          // 玩游戏暴击反馈
          if (res.isCritical) {
            bubble.show('太好玩啦！！还要玩！✨', 'happy', 2500);
            pet.celebrate();
          }

          if (statusPanel.isOpen()) statusPanel.update(currentPet);

          // 成就解锁通知
          announceAchievements(res.unlockedAchievements);

          if (res.leveledUp) {
            pet.celebrate();
            bubble.show(`本喵又变强啦！Lv.${currentPet.level} 🎉`, 'happy', 2500);
          }
        }
        laser.destroy();
        laser = null;
      },
    });
    laser.start();
  }

  function openChat() {
    lastActivityTime = Date.now(); // 更新活动时间
    sm.markInteraction();
    brain.resetIdleTimers();
    chat.open();
  }

  // 情绪 -> 宠物表现
  function reactEmotion(emotion) {
    switch (emotion) {
      case 'happy': pet.happyBounce(); break;
      case 'sad':
        // 低落：轻微下沉，不弹跳
        pet._bounceT = 0; // 取消弹跳
        setTimeout(() => { pet.applyMood(currentPet); }, 100);
        break;
      case 'sleepy':
        sm.transition(PetState.SLEEP);
        setTimeout(() => { if (sm.is(PetState.SLEEP)) sm.transition(PetState.IDLE); }, 4000);
        break;
      case 'hungry': pet.happyBounce(); break;
      case 'angry': pet.happyBounce(); break;
      default: break;
    }
  }

  function greetLine(pet, reunion) {
    if (reunion) {
      // 重逢欢迎，从离线话术库读取
      const line = window.PetPersonality.offlineReply('reunion', pet);
      return line.text;
    }
    if (!pet) return '喵～';
    if (pet.hunger < 20) return '主人…我有点饿喵';
    if (pet.mood < 25) return '哼，你可算回来了…';
    return '喵～欢迎回来！';
  }

  window.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('error', (e) => console.log('[boot-error]', e.message));
  window.addEventListener('unhandledrejection', (e) => console.log('[boot-reject]', e.reason && e.reason.message || e.reason));
})();

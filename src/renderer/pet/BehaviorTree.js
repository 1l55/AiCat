// BehaviorTree：自主决策（优先级 选择器）
// 优先级：饥饿检测 > 无聊检测 > 久置睡眠 > 默认空闲（踱步/打哈欠/看窗外）
// 提醒由主进程定时触发，不在此处轮询。
(function () {
  const { PetState, THRESHOLD } = window.PetConstants;

  class BehaviorTree {
    constructor(ctx) {
      // ctx: { sm, pet, getStatus, bubble, app }
      this.ctx = ctx;
      this.nextDecisionAt = 0;
      this.walkTarget = null;
      this.walkDir = null; // 固定行走方向，避免抖动
      this.walkSpeed = 0.9;
      this.boredom = 0;
      this.lastHungerNag = 0;
      this.hungerNagCount = 0; // 记录连续饥饿提示次数
    }

    // 每帧调用
    tick(now, delta) {
      const { sm, getStatus } = this.ctx;
      const status = getStatus();

      // 锁定状态（吃/玩/聊）期间不自主决策，但仍推进 WALK 移动
      if (sm.is(PetState.WALK)) this.advanceWalk(delta);
      if (sm.locked) return;

      // 无聊值随时间累积，互动会清零
      this.boredom = Math.min(100, this.boredom + delta * 0.03);

      // —— 优先级 1：饥饿 ——
      if (status.hunger < THRESHOLD.hungryBelow && !sm.is(PetState.WALK)) {
        // 间隔渐进拉长：基础90s，每次被忽视后+60s，最长4分钟
        const interval = Math.min(90000 + this.hungerNagCount * 60000, 240000);
        if (now - this.lastHungerNag > interval) {
          this.lastHungerNag = now;
          this.hungerNagCount++;
          // 根据次数选择渐进文案
          const lines = window.PetPersonality.OFFLINE_LINES.hungry;
          const idx = Math.min(this.hungerNagCount - 1, lines.length - 1);
          const line = lines[idx];
          this.ctx.bubble.show(line.t, line.e, 3000);
          this.ctx.pet.happyBounce();
        }
      }

      // —— 优先级 2：久置睡眠 ——
      if (sm.idleFor() > THRESHOLD.sleepIdleMs && !sm.is(PetState.SLEEP) && !sm.is(PetState.WALK)) {
        sm.transition(PetState.SLEEP);
        return;
      }

      // 决策计时器到期 -> 选择一个空闲行为
      if (now >= this.nextDecisionAt && !sm.is(PetState.WALK)) {
        this.decide(now, status);
      }
    }

    decide(now, status) {
      const { sm } = this.ctx;
      // 睡眠中有较小概率醒来
      if (sm.is(PetState.SLEEP)) {
        if (Math.random() < 0.3) { sm.transition(PetState.IDLE); }
        this.nextDecisionAt = now + rand(8000, 16000);
        return;
      }

      // 无聊值过高 -> 自娱自乐（追尾/小跑）
      if (this.boredom > THRESHOLD.boredAbove && Math.random() < 0.7) {
        this.boredom = 0;
        this.performTrick(now);
        return;
      }

      // 随机选择：踱步 or 原地空闲动作（降低行走频率）
      const r = Math.random();
      if (r < 0.25) {  // 从55%降到25%，减少过度行走
        this.startWalk();
      } else {
        // 原地：打哈欠 / 看窗外（用气泡表达）
        if (r < 0.4) this.ctx.bubble.show('喵～', 'happy', 1500);
        else if (r < 0.55) this.ctx.bubble.show('（打了个哈欠）', 'sleepy', 1800);
        // 否则静静待机，不弹气泡
        sm.transition(PetState.IDLE);
        this.nextDecisionAt = now + rand(5000, 12000); // 延长待机时间
      }
    }

    performTrick(now) {
      const { sm, pet, bubble } = this.ctx;
      bubble.show('无聊…来追个光点！', 'curious', 2000);
      sm.transition(PetState.PLAY, { lock: true });
      pet.happyBounce();
      // 小跑一圈
      this.startWalk(true);
      setTimeout(() => {
        if (sm.is(PetState.PLAY)) { sm.locked = false; sm.transition(PetState.IDLE); }
      }, 4000);
      this.nextDecisionAt = now + rand(6000, 12000);
    }

    startWalk(running) {
      const { sm, pet, app } = this.ctx;
      const W = app.renderer.width;
      const half = pet.width / 2;
      this.walkTarget = rand(half, W - half);
      this.walkSpeed = running ? 2.2 : 0.9;
      // 确定行走方向并固定朝向
      this.walkDir = this.walkTarget > pet.x ? 1 : -1;
      pet.setFacing(this.walkDir);
      if (!sm.locked) sm.transition(PetState.WALK);
      else pet.applyState(PetState.PLAY);
    }

    advanceWalk(delta) {
      const { sm, pet } = this.ctx;
      if (this.walkTarget == null) { sm.transition(PetState.IDLE); return; }
      // 使用固定的行走方向，避免每帧重新计算导致抖动
      const dir = this.walkDir || 1;
      const step = this.walkSpeed * delta;
      const nx = pet.x + dir * step;
      if (Math.abs(nx - this.walkTarget) <= step + 1) {
        pet.setPosition(this.walkTarget);
        this.walkTarget = null;
        this.walkDir = null;
        if (!sm.locked) {
          sm.transition(PetState.IDLE);
          this.nextDecisionAt = performance.now() + rand(3000, 8000);
        }
      } else {
        pet.setPosition(nx);
      }
    }

    resetIdleTimers() {
      this.boredom = 0;
      this.hungerNagCount = 0; // 重置饥饿唠叨计数
      this.nextDecisionAt = performance.now() + rand(3000, 7000);
    }
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  window.BehaviorTree = BehaviorTree;
})();

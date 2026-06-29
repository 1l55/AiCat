// LaserChase：激光笔追逐游戏。玩家用鼠标控制光点，猫追逐，抓到得分，抓不到会失望。
(function () {
  const { PetState } = window.PetConstants;

  class LaserChase extends window.MiniGameBase {
    constructor(ctx) {
      super(ctx);
      this.dot = null;
      this.target = { x: 0, y: 0 };
      this.duration = 20000; // 20s 一局
      this.endAt = 0;
      this._moveHandler = null;
      this._keyHandler = null;
      this.catchCount = 0; // 抓到次数
      this.missCount = 0; // 逃脱次数
      this.isCaught = false; // 当前是否被抓
      this.lastCatchTime = 0;
      this.exitHint = null; // 退出提示文本
    }

    start() {
      super.start();
      const { app, sm, pet, bubble } = this.ctx;
      sm.transition(PetState.PLAY, { lock: true });
      bubble.show('光点！快控制光点逗我玩！', 'curious', 2500);

      this.dot = new PIXI.Graphics();
      this._drawDot();
      this.layer.addChild(this.dot);

      // 初始位置远离猫
      const w = app.renderer.width;
      this.target.x = pet.x > w / 2 ? w * 0.2 : w * 0.8;
      this.dot.x = this.target.x;
      this.dot.y = app.renderer.height - 20;

      this.endAt = performance.now() + this.duration;

      // 退出提示
      this.exitHint = new PIXI.Text('按ESC或点击此处退出', {
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        fontSize: 13,
        fill: 0xffffff,
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowBlur: 4,
        dropShadowDistance: 2,
      });
      this.exitHint.anchor.set(0.5, 0);
      this.exitHint.x = app.renderer.width / 2;
      this.exitHint.y = 10;
      this.exitHint.alpha = 0.7;
      this.exitHint.interactive = true;
      this.exitHint.buttonMode = true;
      this.exitHint.on('pointerdown', () => this._finish());
      this.layer.addChild(this.exitHint);

      // 鼠标移动控制光点
      this._moveHandler = (e) => {
        const w = app.renderer.width;
        this.target.x = clamp(e.clientX, 30, w - 30);

        // 如果移动光点且猫正追着，算一次逃脱
        const dist = Math.abs(this.dot.x - pet.x);
        if (dist < 40 && !this.isCaught) {
          this.missCount++;
          this.isCaught = false;
        }
      };
      window.addEventListener('mousemove', this._moveHandler);

      // ESC键退出
      this._keyHandler = (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          this._finish();
        }
      };
      window.addEventListener('keydown', this._keyHandler);
    }

    _drawDot() {
      this.dot.clear();
      this.dot.beginFill(0xff3b30, 0.95).drawCircle(0, 0, 8).endFill();
      this.dot.beginFill(0xff3b30, 0.25).drawCircle(0, 0, 16).endFill();
    }

    update(delta) {
      if (!this.active) return;
      const { app, pet, bubble } = this.ctx;
      const now = performance.now();
      if (now >= this.endAt) { this._finish(); return; }

      // 红点快速跟随鼠标
      const groundY = app.renderer.height - 20;
      this.dot.x += (this.target.x - this.dot.x) * 0.35 * delta;
      this.dot.y = groundY;
      this.dot.scale.set(1 + Math.sin(now * 0.02) * 0.15);

      // 猫追逐红点
      const dir = this.dot.x > pet.x ? 1 : -1;
      pet.setFacing(dir);
      const dist = Math.abs(this.dot.x - pet.x);

      if (dist < 25) {
        // 抓到了！
        if (!this.isCaught && now - this.lastCatchTime > 1000) {
          this.isCaught = true;
          this.lastCatchTime = now;
          this.catchCount++;
          pet.setAnimation('idle', { speed: 0.25 });
          pet.happyBounce();

          // 抓到的即时反馈
          const reactions = ['抓到了！', '嘿嘿～', '喵！', '哈！'];
          bubble.show(reactions[Math.floor(Math.random() * reactions.length)], 'happy', 800);
        }
      } else {
        this.isCaught = false;
        // 追逐
        if (dist > 15) {
          pet.setAnimation('run');
          const speed = Math.min(2.8, 1.5 + dist * 0.08);
          const step = speed * delta;
          pet.setPosition(pet.x + dir * step);
        } else {
          pet.setAnimation('walk');
          const step = 1.2 * delta;
          pet.setPosition(pet.x + dir * step);
        }
      }
    }

    _finish() {
      const { sm, bubble } = this.ctx;
      window.removeEventListener('mousemove', this._moveHandler);
      window.removeEventListener('keydown', this._keyHandler);
      sm.locked = false;
      sm.transition(PetState.IDLE);

      // 根据表现给反馈
      if (this.catchCount >= 5) {
        bubble.show(`抓到${this.catchCount}次！好玩！😸`, 'happy', 3000);
      } else if (this.catchCount >= 2) {
        bubble.show(`抓到${this.catchCount}次～还行吧`, 'curious', 2500);
      } else {
        bubble.show('哼，一次都没抓到…', 'sad', 2500);
      }

      // 结算奖励：根据抓到次数调整
      this.end({ action: 'play', catchCount: this.catchCount });
    }

    stop() {
      if (!this.active) return;
      this._finish();
    }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  window.LaserChase = LaserChase;
})();

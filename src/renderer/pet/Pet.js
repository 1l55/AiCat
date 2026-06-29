// Pet：精灵装载、动画、朝向、位置、视觉特效（Zzz / 睡眠变暗 / 弹跳 / 食物粒子）
// 依赖全局 PIXI（UMD）与 window.PetConstants

(function () {
  const { PetState } = window.PetConstants;

  // 两个 tint 的逐通道乘法混合（皮肤底色 × 状态/心情色调）
  function blendTint(a, b) {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar * br / 255);
    const g = Math.round(ag * bg / 255);
    const bl = Math.round(ab * bb / 255);
    return (r << 16) | (g << 8) | bl;
  }

  // —— 配饰矢量绘制 ——
  // 每个函数把一件配饰画进传入的 PIXI.Graphics，坐标系为「精灵本地像素」：
  // 原点 (0,0) = 脚底中心，向上为 -y；猫约 36 宽 × 30 高，头顶约 y=-29，头部中心约 y=-22。
  // 调用方负责把整层缩放 scaleFactor、跟随位置与朝向翻转。
  function darken(c, f) {
    const r = Math.round(((c >> 16) & 0xff) * f);
    const g = Math.round(((c >> 8) & 0xff) * f);
    const b = Math.round((c & 0xff) * f);
    return (r << 16) | (g << 8) | b;
  }
  const ACC_DRAW = {
    // —— 头部 ——
    bow(g, c) { // 蝴蝶结
      g.beginFill(c).drawPolygon([-7, -29, -1, -27, -7, -25]).endFill();
      g.beginFill(c).drawPolygon([7, -29, 1, -27, 7, -25]).endFill();
      g.beginFill(darken(c, 0.8)).drawCircle(0, -27, 1.6).endFill();
    },
    crown(g, c) { // 皇冠
      g.beginFill(c).drawPolygon([-7, -28, -7, -31, -4, -29, 0, -32, 4, -29, 7, -31, 7, -28]).endFill();
      g.beginFill(0xFF5A7A).drawCircle(0, -30.5, 0.9).endFill();
    },
    santaHat(g, c) { // 圣诞帽
      g.beginFill(c).drawPolygon([-6, -28, 6, -28, 2, -34]).endFill();
      g.beginFill(0xFFFFFF).drawRect(-7, -29, 14, 2).endFill();
      g.beginFill(0xFFFFFF).drawCircle(2, -34, 1.6).endFill();
    },
    strawHat(g, c) { // 草帽
      g.beginFill(c).drawEllipse(0, -28, 9, 2.4).endFill();
      g.beginFill(darken(c, 0.85)).drawEllipse(0, -29.5, 4.5, 2.4).endFill();
    },
    // —— 身体/颈部 ——
    scarf(g, c) { // 围巾
      g.beginFill(c).drawRect(-6, -15, 12, 2.6).endFill();
      g.beginFill(darken(c, 0.85)).drawRect(3, -14, 2.6, 6).endFill();
    },
    cape(g, c) { // 披风（领口 + 垂布）
      g.beginFill(c).drawRect(-6, -16, 12, 2).endFill();
      g.beginFill(darken(c, 0.9)).drawPolygon([-6, -15, 6, -15, 4, -4, -4, -4]).endFill();
    },
    // —— 脚部 ——
    boots(g, c) { // 小红靴（两只）
      g.beginFill(c).drawRect(-5, -3, 4, 3).endFill();
      g.beginFill(c).drawRect(1, -3, 4, 3).endFill();
    },
    // —— 背部（画在精灵之上的 wingsLayer，盖在后背上可见）——
    angelWings(g, c) { // 天使翼
      g.beginFill(c, 0.92).drawPolygon([-2, -20, -12, -24, -13, -14, -3, -13]).endFill();
      g.beginFill(c, 0.92).drawPolygon([2, -20, 12, -24, 13, -14, 3, -13]).endFill();
    },
    devilWings(g, c) { // 恶魔翼
      g.beginFill(c, 0.95).drawPolygon([-2, -20, -13, -22, -9, -17, -13, -15, -3, -13]).endFill();
      g.beginFill(c, 0.95).drawPolygon([2, -20, 13, -22, 9, -17, 13, -15, 3, -13]).endFill();
    },
  };
  const BACK_SLOT_KEYS = { angelWings: 1, devilWings: 1 };


  // 动画名 -> 帧定义（基于 assets/sprites/cat-meta.json）
  // 缺专用帧的状态优雅复用 idle / walk / run。
  const SHEETS = {
    idle: { url: '../../assets/sprites/cat-idle.png', fw: 36, fh: 30, frames: 1 },
    walk: { url: '../../assets/sprites/cat-walk.png', fw: 36, fh: 30, frames: 6 },
    run:  { url: '../../assets/sprites/cat-run.png',  fw: 40, fh: 34, frames: 6 },
  };

  async function loadFrames(sheet) {
    const tex = await PIXI.Assets.load(sheet.url);
    tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    const frames = [];
    for (let i = 0; i < sheet.frames; i++) {
      frames.push(
        new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(i * sheet.fw, 0, sheet.fw, sheet.fh))
      );
    }
    return frames;
  }

  class Pet {
    constructor(app) {
      this.app = app;
      this.container = new PIXI.Container();
      this.sprite = null;
      this.anims = {};       // name -> Texture[]
      this.currentAnim = '';
      this.scaleFactor = 4;
      this.facing = -1;      // -1 右（精灵图默认朝左，翻转后朝右）, 1 左（原始朝向）
      this.baseY = 0;        // 站立基准 y（脚底）
      this.bobPhase = 0;
      this.effectLayer = new PIXI.Container(); // Zzz/粒子
      this.particles = [];
      this.zzz = null;
      this._bobAmp = 1.5; // 呼吸幅度，根据心情调整
      this.skinTint = 0xFFFFFF; // 皮肤底色（成就解锁），状态/心情色调在其之上叠乘
      this._stateTint = 0xFFFFFF; // 当前状态/心情色调
      this.wingsLayer = new PIXI.Container();     // 背部配饰（翅膀）——绘制在精灵之上，盖在后背
      this.accessoryLayer = new PIXI.Container(); // 头/身/脚配饰——绘制在精灵之前
      this._accessories = {}; // { slot: key } 当前装备
      app.stage.addChild(this.container);
      this.container.addChild(this.effectLayer);
    }

    async load(scaleFactor) {
      this.scaleFactor = scaleFactor || 4;
      this.anims.idle = await loadFrames(SHEETS.idle);
      this.anims.walk = await loadFrames(SHEETS.walk);
      this.anims.run = await loadFrames(SHEETS.run);

      this.sprite = new PIXI.AnimatedSprite(this.anims.idle);
      this.sprite.anchor.set(0.5, 1); // 脚底中心
      this.sprite.scale.set(this.scaleFactor);
      this.sprite.animationSpeed = 0.12;
      this.sprite.play();
      // z 序：精灵 → 翅膀(盖在后背上) → 头/身/脚配饰 → 特效层(已在最前)
      this.container.addChildAt(this.sprite, 0);
      this.container.addChildAt(this.wingsLayer, 1);
      this.container.addChildAt(this.accessoryLayer, 2);

      // 初始位置：画面底部中间
      const W = this.app.renderer.width;
      const H = this.app.renderer.height;
      this.x = W / 2;
      this.baseY = H - 20;
      this.sprite.x = this.x;
      this.sprite.y = this.baseY;
      this.setAnimation('idle');
      return this;
    }

    get width() { return SHEETS.walk.fw * this.scaleFactor; }
    get height() { return SHEETS.walk.fh * this.scaleFactor; }

    setScale(scaleFactor) {
      this.scaleFactor = scaleFactor;
      if (this.sprite) this.sprite.scale.set(this.facing * scaleFactor, scaleFactor);
    }

    // 设置皮肤底色（成就解锁），并立即重绘当前状态色调
    setSkin(tint) {
      this.skinTint = tint != null ? tint : 0xFFFFFF;
      if (this.sprite) this.sprite.tint = blendTint(this.skinTint, this._stateTint || 0xFFFFFF);
    }

    // 统一写入精灵 tint：状态/心情色调叠乘在皮肤底色之上
    _tint(stateTint) {
      this._stateTint = stateTint;
      if (this.sprite) this.sprite.tint = blendTint(this.skinTint, stateTint);
    }

    // 装备配饰：map = { slot: key }（来自 store.equippedAccessories）。重建两层矢量图。
    setAccessories(map) {
      this._accessories = map || {};
      this.wingsLayer.removeChildren().forEach((c) => c.destroy());
      this.accessoryLayer.removeChildren().forEach((c) => c.destroy());
      for (const slot of Object.keys(this._accessories)) {
        const key = this._accessories[slot];
        const draw = ACC_DRAW[key];
        if (!draw) continue;
        const def = (window.PetConstants.accessoryDef && window.PetConstants.accessoryDef(key)) || null;
        const color = def ? def.color : 0xFFFFFF;
        const g = new PIXI.Graphics();
        draw(g, color);
        const layer = BACK_SLOT_KEYS[key] ? this.wingsLayer : this.accessoryLayer;
        layer.addChild(g);
      }
      this._syncAccessoryTransform();
    }

    // 让配饰层与精灵共享缩放/朝向/位置（每帧及装备时调用）
    _syncAccessoryTransform() {
      if (!this.sprite) return;
      for (const layer of [this.wingsLayer, this.accessoryLayer]) {
        layer.scale.set(this.facing * this.scaleFactor, this.scaleFactor);
        layer.x = this.sprite.x;
        layer.y = this.sprite.y; // 配饰本地坐标以脚底为原点，直接对齐精灵 y（含呼吸 bob）
      }
    }

    setAnimation(name, { speed } = {}) {
      const frames = this.anims[name];
      if (!frames || this.currentAnim === name) {
        if (speed && this.sprite) this.sprite.animationSpeed = speed;
        return;
      }
      this.currentAnim = name;
      this.sprite.textures = frames;
      this.sprite.animationSpeed = speed != null ? speed : (name === 'run' ? 0.22 : name === 'walk' ? 0.16 : 0.08);
      this.sprite.gotoAndPlay(0);
    }

    setFacing(dir) {
      if (dir === 0) return;
      // dir > 0 表示向右移动，精灵图默认朝左，需要翻转（scale.x为负）
      // dir < 0 表示向左移动，精灵图默认朝左，保持原样（scale.x为正）
      this.facing = dir > 0 ? -1 : 1;
      this.sprite.scale.x = this.facing * this.scaleFactor;
    }

    setPosition(x) {
      const W = this.app.renderer.width;
      const half = this.width / 2;
      this.x = Math.max(half, Math.min(W - half, x));
      this.sprite.x = this.x;
    }

    // 设置站立地面线（脚底 y），用于拖拽自由放置
    setGround(y) {
      const H = this.app.renderer.height;
      this.baseY = Math.max(this.height + 4, Math.min(H - 2, y));
    }

    moveTo(x, groundY) {
      this.setPosition(x);
      this.setGround(groundY);
      this.sprite.y = this.baseY;
    }

    // 从持久化位置恢复
    restore(x, y) {
      if (x != null) this.setPosition(x);
      if (y != null) this.setGround(y);
      this.sprite.x = this.x;
      this.sprite.y = this.baseY;
    }

    // 将逻辑状态映射到视觉表现
    applyState(state) {
      switch (state) {
        case PetState.WALK:
          this.setAnimation('walk');
          this._tint(0xffffff);
          this.hideZzz();
          break;
        case PetState.PLAY:
          this.setAnimation('run');
          this._tint(0xffffff);
          this.hideZzz();
          break;
        case PetState.SLEEP:
          this.setAnimation('idle', { speed: 0.04 });
          this._tint(0x9aa4c8); // 偏冷变暗
          this.showZzz();
          break;
        case PetState.EAT:
          this.setAnimation('idle', { speed: 0.18 });
          this._tint(0xffffff);
          this.hideZzz();
          this.spawnFood();
          break;
        case PetState.CHAT:
        case PetState.IDLE:
        default:
          this.setAnimation('idle');
          this._tint(0xffffff);
          this.hideZzz();
          break;
      }
    }

    // 根据属性状态调整外观（在 IDLE/CHAT 等中性状态下叠加）
    applyMood(pet) {
      // 只在非特殊状态下应用属性色调
      if (this.currentAnim !== 'idle') return;

      // 优先级：饥饿 > 心情低落 > 正常
      if (pet.hunger < 20) {
        this._tint(0xB8C0B0); // 饿了：灰绿、无精打采
        this._bobAmp = 0.8; // 呼吸变弱
      } else if (pet.mood < 25) {
        this._tint(0xC8C8D8); // 心情低：偏灰
        this._bobAmp = 0.8;
      } else if (pet.mood > 70) {
        this._tint(0xFFFFFF); // 心情好：正常
        this._bobAmp = 2.2; // 呼吸更明显
      } else {
        this._tint(0xFFFFFF);
        this._bobAmp = 1.5;
      }
    }

    // —— 视觉特效 ——
    showZzz() {
      if (this.zzz) return;
      const t = new PIXI.Text('Z z z', {
        fontFamily: 'monospace', fontSize: 16, fill: 0xffffff,
        stroke: 0x5566aa, strokeThickness: 3,
      });
      t.anchor.set(0.5, 1);
      this.zzz = t;
      this.effectLayer.addChild(t);
    }
    hideZzz() { if (this.zzz) { this.effectLayer.removeChild(this.zzz); this.zzz.destroy(); this.zzz = null; } }

    spawnFood() {
      // 几颗小鱼干粒子从猫嘴边掉落
      for (let i = 0; i < 6; i++) {
        const g = new PIXI.Graphics();
        g.beginFill(0xffcc66).drawRect(0, 0, 4, 4).endFill();
        g.x = this.x + (Math.random() * 30 - 15);
        g.y = this.baseY - this.height * 0.6;
        g.vy = 1 + Math.random() * 1.5;
        g.life = 40 + Math.random() * 20;
        this.effectLayer.addChild(g);
        this.particles.push(g);
      }
    }

    happyBounce() {
      this._bounceT = 18;
    }

    // 升级庆祝特效：向上喷星星粒子
    celebrate() {
      this.happyBounce();
      for (let i = 0; i < 16; i++) {
        const g = new PIXI.Graphics();
        g.beginFill(0xFFE08A).drawRect(0, 0, 5, 5).endFill();
        g.x = this.x;
        g.y = this.baseY - this.height * 0.6;
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 2;
        g.vx = Math.cos(a) * sp;
        g.vy = -Math.abs(Math.sin(a) * sp) - 1;
        g.life = 50;
        this.effectLayer.addChild(g);
        this.particles.push(g);
      }
    }

    update(delta) {
      // idle 呼吸 bob（幅度由 applyMood 动态调整）
      this.bobPhase += 0.06 * delta;
      let y = this.baseY;
      if (this.currentAnim === 'idle') y = this.baseY + Math.sin(this.bobPhase) * this._bobAmp;
      if (this._bounceT > 0) {
        this._bounceT -= delta;
        y -= Math.abs(Math.sin((18 - this._bounceT) * 0.5)) * 18;
      }
      this.sprite.y = y;
      this._syncAccessoryTransform(); // 配饰跟随精灵的位置/朝向/呼吸 bob

      // Zzz 跟随 + 飘动
      if (this.zzz) {
        this.zzz.x = this.x + this.width * 0.35;
        this.zzz.y = this.baseY - this.height + Math.sin(this.bobPhase) * 3;
        this.zzz.alpha = 0.7 + Math.sin(this.bobPhase * 0.7) * 0.3;
      }

      // 食物粒子
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.y += p.vy * delta;
        if (p.vx !== undefined) p.x += p.vx * delta; // 支持水平运动
        p.life -= delta;
        p.alpha = Math.max(0, p.life / 40);
        if (p.life <= 0) {
          this.effectLayer.removeChild(p);
          p.destroy();
          this.particles.splice(i, 1);
        }
      }
    }

    // 命中测试（矩形包围盒，供穿透判断）
    hitTest(px, py) {
      const half = this.width / 2;
      const top = this.sprite.y - this.height;
      return px >= this.x - half && px <= this.x + half && py >= top && py <= this.sprite.y + 4;
    }
  }

  window.Pet = Pet;
})();

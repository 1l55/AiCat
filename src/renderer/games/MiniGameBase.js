// MiniGameBase：小游戏基类，提供统一的生命周期与结算接口（供扩展接食物/抚摸等）
(function () {
  class MiniGameBase {
    constructor(ctx) {
      // ctx: { app, pet, sm, bubble, api, onEnd }
      this.ctx = ctx;
      this.active = false;
      this.layer = new PIXI.Container();
      ctx.app.stage.addChild(this.layer);
    }
    start() { this.active = true; }
    update(delta) {}      // 每帧
    end(rewards) {
      this.active = false;
      this.layer.removeChildren();
      if (this.ctx.onEnd) this.ctx.onEnd(rewards || {});
    }
    isActive() { return this.active; }
    destroy() {
      if (this.layer.parent) this.layer.parent.removeChild(this.layer);
      this.layer.destroy({ children: true });
    }
  }
  window.MiniGameBase = MiniGameBase;
})();

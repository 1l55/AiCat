// Interaction：鼠标交互 + 点击穿透切换
// - 鼠标悬停在猫身上 -> 取消穿透（窗口可交互）；离开 -> 恢复穿透
// - 左键拖拽移动整个窗口；左键单击有反应；双击摸头；右键弹菜单
// 依赖 window.petAPI（preload）
(function () {
  const { PetState } = window.PetConstants;

  class Interaction {
    constructor(ctx) {
      // ctx: { app, pet, sm, brain, bubble, onClick, onDoubleClick, onContextMenu, isPanelOpen }
      this.ctx = ctx;
      this.api = window.petAPI;
      this.forceInteractive = false; // 面板打开时强制可交互
      this.hovering = false;
      this.dragging = false;
      this.dragMoved = false;
      this.dragOff = { x: 0, y: 0 };
      this.downAt = 0;
      this.lastInteractiveSent = null;
      this._bind();
    }

    setForceInteractive(v) {
      this.forceInteractive = v;
      this._syncInteractive(this.hovering);
    }

    _syncInteractive(hover) {
      const want = !!(hover || this.forceInteractive || this.dragging);
      if (want !== this.lastInteractiveSent) {
        this.lastInteractiveSent = want;
        this.api.setInteractive(want);
      }
    }

    _overCat(e) {
      return this.ctx.pet.hitTest(e.clientX, e.clientY);
    }

    _bind() {
      const el = window;

      // 即使处于穿透状态，forward:true 仍会把 mousemove 转发到渲染层
      el.addEventListener('mousemove', (e) => {
        if (this.dragging) {
          // 拖拽：让猫跟随鼠标（保持按下时的偏移，避免跳变）
          this.dragMoved = true;
          this.ctx.pet.moveTo(e.clientX - this.dragOff.x, e.clientY - this.dragOff.y);
          return;
        }
        const over = this._overCat(e);
        if (over !== this.hovering) {
          this.hovering = over;
          this._syncInteractive(over);
          document.body.style.cursor = over ? 'grab' : 'default';
        }
      });

      el.addEventListener('mousedown', (e) => {
        if (this.ctx.isPanelOpen()) return;
        if (!this._overCat(e)) return;
        if (e.button === 0) {
          this.dragging = true;
          this.dragMoved = false;
          this.downAt = Date.now();
          const pet = this.ctx.pet;
          this.dragOff = { x: e.clientX - pet.x, y: e.clientY - pet.sprite.y };
          this.api.dragPhase('start');
          this._syncInteractive(true);
          this.ctx.sm.markInteraction();
          document.body.style.cursor = 'grabbing';
        }
      });

      el.addEventListener('mouseup', (e) => {
        if (e.button === 0 && this.dragging) {
          this.dragging = false;
          document.body.style.cursor = this.hovering ? 'grab' : 'default';
          if (this.dragMoved) {
            // 持久化新位置
            this.ctx.onDragEnd(Math.round(this.ctx.pet.x), Math.round(this.ctx.pet.baseY));
          } else if (Date.now() - this.downAt < 350) {
            this.ctx.onClick(e);
          }
          this._syncInteractive(this.hovering);
        }
      });

      el.addEventListener('dblclick', (e) => {
        if (this._overCat(e)) this.ctx.onDoubleClick(e);
      });

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this._overCat(e) || this.ctx.isPanelOpen()) {
          this.ctx.onContextMenu(e);
          this.ctx.sm.markInteraction();
        }
      });
    }
  }

  window.Interaction = Interaction;
})();

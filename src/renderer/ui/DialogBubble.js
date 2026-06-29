// DialogBubble：HTML 覆盖层对话气泡，带打字机效果，浮在猫头顶
(function () {
  class DialogBubble {
    constructor(getAnchor) {
      // getAnchor() -> {x, y} 猫头顶坐标（renderer 像素）
      this.getAnchor = getAnchor;
      this.el = document.createElement('div');
      this.el.className = 'pet-bubble hidden';
      document.body.appendChild(this.el);
      this.hideTimer = null;
      this.typeTimer = null;
    }

    show(text, emotion, duration = 3500) {
      clearTimeout(this.hideTimer);
      clearInterval(this.typeTimer);
      this.el.classList.remove('hidden');
      this.el.dataset.emotion = emotion || 'neutral';
      this._position();

      // 打字机
      this.el.textContent = '';
      const chars = Array.from(text);
      let i = 0;
      this.typeTimer = setInterval(() => {
        this.el.textContent = chars.slice(0, ++i).join('');
        this._position();
        if (i >= chars.length) clearInterval(this.typeTimer);
      }, 45);

      if (duration > 0) {
        this.hideTimer = setTimeout(() => this.hide(), duration + chars.length * 45);
      }
    }

    _position() {
      const a = this.getAnchor();
      // 居中于锚点上方
      const w = this.el.offsetWidth;
      let left = a.x - w / 2;
      left = Math.max(6, Math.min(window.innerWidth - w - 6, left));
      this.el.style.left = left + 'px';
      this.el.style.top = Math.max(4, a.y - this.el.offsetHeight - 8) + 'px';
    }

    hide() {
      clearInterval(this.typeTimer);
      this.el.classList.add('hidden');
    }
  }

  window.DialogBubble = DialogBubble;
})();

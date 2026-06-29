// MenuPanel：右键弧形菜单。图标按钮以点击点为圆心、在上半圆扇形展开，
// 带交错弹入动画 + 悬停标签，比竖直列表更有「桌宠」趣味。
(function () {
  const ITEMS = [
    ['💬', '聊一聊', 'chat'],
    ['🍖', '喂食', 'feed'],
    ['🎾', '玩耍', 'play'],
    ['📊', '状态', 'status'],
    ['🏆', '成就形象', 'achievements'],
    ['⏰', '提醒', 'reminders'],
    ['⚙️', '设置', 'settings'],
    ['👋', '退出', 'quit'],
  ];
  const R = 96;        // 扇形半径
  const BTN = 46;      // 按钮直径

  class MenuPanel {
    constructor(actions) {
      // actions: { chat, feed, play, status, achievements, reminders, settings, quit }
      this.actions = actions;
      this.el = document.createElement('div');
      this.el.className = 'pet-radial hidden';

      this.buttons = [];
      ITEMS.forEach(([icon, label, key], i) => {
        const b = document.createElement('div');
        b.className = 'radial-item' + (key === 'quit' ? ' danger' : '');
        b.innerHTML = `<span class="ri-icon">${icon}</span><span class="ri-label">${label}</span>`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          this.actions[key] && this.actions[key]();
        });
        this.el.appendChild(b);
        this.buttons.push(b);
      });

      document.body.appendChild(this.el);
      document.addEventListener('mousedown', (e) => {
        if (!this.isOpen()) return;
        if (!this.el.contains(e.target)) this.hide();
      });
    }

    openAt(x, y) {
      const n = this.buttons.length;
      const W = window.innerWidth, H = window.innerHeight;
      // 夹住圆心，保证整个上半圆扇形不出界
      const cx = Math.max(R + BTN, Math.min(W - R - BTN, x));
      const cy = Math.max(R + BTN, Math.min(H - BTN, y));
      this.el.style.left = cx + 'px';
      this.el.style.top = cy + 'px';

      // 上半圆 180°→0°（左→上→右）均匀分布；交错弹入
      this.buttons.forEach((b, i) => {
        const ang = (Math.PI) - (i / (n - 1)) * Math.PI; // π..0
        const tx = Math.cos(ang) * R;
        const ty = -Math.sin(ang) * R; // 屏幕 y 向下，向上为负
        b.style.setProperty('--tx', tx.toFixed(1) + 'px');
        b.style.setProperty('--ty', ty.toFixed(1) + 'px');
        b.style.setProperty('--d', (i * 28) + 'ms');
      });

      this.el.classList.remove('hidden');
      // 触发动画：先复位再下一帧加 open
      this.el.classList.remove('open');
      void this.el.offsetWidth;
      this.el.classList.add('open');
    }

    hide() { this.el.classList.add('hidden'); this.el.classList.remove('open'); }
    isOpen() { return !this.el.classList.contains('hidden'); }
  }
  window.MenuPanel = MenuPanel;
})();

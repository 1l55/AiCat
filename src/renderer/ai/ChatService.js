// ChatService：聊天输入框 + 发送到主进程（AI 或离线回退）+ 用气泡呈现回复并驱动情绪动画
(function () {
  class ChatService {
    constructor(ctx) {
      // ctx: { api, bubble, onEmotion }
      this.ctx = ctx;
      this.el = document.createElement('div');
      this.el.className = 'pet-chat hidden';
      this.el.innerHTML = `
        <input type="text" class="chat-input" placeholder="和我说点什么…（回车发送）" maxlength="100">
        <button class="chat-send">▶</button>
        <span class="chat-close">✕</span>`;
      document.body.appendChild(this.el);
      this.input = this.el.querySelector('.chat-input');
      this.el.querySelector('.chat-send').addEventListener('click', () => this._send());
      this.el.querySelector('.chat-close').addEventListener('click', () => this.hide());
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._send();
        if (e.key === 'Escape') this.hide();
      });
    }

    open() {
      this.el.classList.remove('hidden');
      setTimeout(() => this.input.focus(), 30);
    }
    hide() { this.el.classList.add('hidden'); }
    isOpen() { return !this.el.classList.contains('hidden'); }

    async _send() {
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.ctx.bubble.show('唔…让我想想喵', 'curious', 1500);
      try {
        const res = await this.ctx.api.chatSend(text);
        this.ctx.bubble.show(res.reply, res.emotion, 4000);
        this.ctx.onEmotion(res.emotion);
      } catch (e) {
        this.ctx.bubble.show('喵呜…我有点走神了', 'sad', 2500);
      }
    }
  }
  window.ChatService = ChatService;
})();

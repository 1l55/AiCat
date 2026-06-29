// ReminderPanel：提醒列表 + 预设模板 + 时间选择器添加
(function () {
  const { REMINDER_TEMPLATES } = window.PetConstants;

  class ReminderPanel {
    constructor(api) {
      this.api = api; // window.petAPI
      this.el = document.createElement('div');
      this.el.className = 'pet-panel hidden';
      this.el.innerHTML = `
        <div class="panel-head"><span class="panel-title">⏰ 提醒</span><span class="panel-close">✕</span></div>
        <div class="panel-body">
          <div class="sec">📌 快速添加预设</div>
          <div class="rm-presets"></div>

          <div class="sec">⏰ 自定义每日提醒</div>
          <div style="font-size: 11px; color: #999; margin-bottom: 8px;">设置每天固定时间提醒你做某事</div>
          <div class="rm-custom">
            <input type="text" class="rm-title" placeholder="提醒内容，如：喝水">
            <div class="rm-time-picker">
              <select class="rm-hour">
                ${Array.from({length: 24}, (_, i) => `<option value="${i}">${i.toString().padStart(2, '0')}</option>`).join('')}
              </select>
              <span style="color: #aaa; margin: 0 4px;">:</span>
              <select class="rm-minute">
                ${Array.from({length: 60}, (_, i) => `<option value="${i}">${i.toString().padStart(2, '0')}</option>`).join('')}
              </select>
            </div>
            <button class="btn-primary rm-add">添加提醒</button>
          </div>

          <div class="sec">📋 我的提醒</div>
          <div class="rm-list"></div>
        </div>`;
      document.body.appendChild(this.el);
      this.el.querySelector('.panel-close').addEventListener('click', () => this.hide());

      // 预设按钮
      const presets = this.el.querySelector('.rm-presets');
      for (const t of REMINDER_TEMPLATES) {
        const b = document.createElement('button');
        b.className = 'rm-preset';
        b.textContent = t.title;
        b.title = `${t.message}`;
        b.addEventListener('click', async () => {
          await this.api.createReminder({ title: t.title, message: t.message, cron: t.cron, petReaction: t.petReaction });
          this.refresh();
        });
        presets.appendChild(b);
      }

      // 自定义添加（时间选择器）
      const now = new Date();
      this.el.querySelector('.rm-hour').value = now.getHours();
      this.el.querySelector('.rm-minute').value = now.getMinutes();

      this.el.querySelector('.rm-add').addEventListener('click', async () => {
        const title = this.el.querySelector('.rm-title').value.trim();
        const hour = this.el.querySelector('.rm-hour').value;
        const minute = this.el.querySelector('.rm-minute').value;

        if (!title) {
          alert('请输入提醒内容');
          return;
        }

        // 生成cron表达式：分 时 * * *（每天）
        const cron = `${minute} ${hour} * * *`;

        await this.api.createReminder({
          title: `${title}（每天${hour.padStart(2, '0')}:${minute.padStart(2, '0')}）`,
          message: title,
          cron,
          petReaction: 'happy'
        });

        this.el.querySelector('.rm-title').value = '';
        this.refresh();
      });
    }

    async refresh() {
      const list = await this.api.listReminders();
      const box = this.el.querySelector('.rm-list');
      box.innerHTML = '';
      if (!list.length) {
        box.innerHTML = '<div class="rm-empty">还没有提醒哦～点击上面添加吧</div>';
        return;
      }
      for (const r of list) {
        const row = document.createElement('div');
        row.className = 'rm-item';

        // 解析cron显示易懂的时间
        const timeText = parseCronToText(r.cron);

        row.innerHTML = `
          <label class="rm-toggle"><input type="checkbox" ${r.enabled ? 'checked' : ''}></label>
          <span class="rm-info">
            <b>${escapeHtml(r.title)}</b>
            <small>${escapeHtml(timeText)}</small>
          </span>
          <span class="rm-del">🗑</span>`;
        row.querySelector('input').addEventListener('change', (e) => {
          this.api.toggleReminder(r.id, e.target.checked);
        });
        row.querySelector('.rm-del').addEventListener('click', async () => {
          await this.api.deleteReminder(r.id);
          this.refresh();
        });
        box.appendChild(row);
      }
    }

    show() { this.el.classList.remove('hidden'); this.refresh(); }
    hide() { this.el.classList.add('hidden'); }
    isOpen() { return !this.el.classList.contains('hidden'); }
  }

  // 将cron表达式转换为易懂的文本
  function parseCronToText(cron) {
    const parts = cron.split(' ');
    if (parts.length < 5) return cron;

    const [minute, hour, day, month, weekday] = parts;

    // 每天固定时间
    if (day === '*' && month === '*' && weekday === '*') {
      if (minute.startsWith('*/')) {
        const interval = minute.slice(2);
        return `每${interval}分钟`;
      }
      if (hour === '*' && minute !== '*') {
        return `每小时的第${minute}分钟`;
      }
      if (hour !== '*' && minute !== '*') {
        return `每天 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }
    }

    // 其他情况显示原始cron
    return cron;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  window.ReminderPanel = ReminderPanel;
})();

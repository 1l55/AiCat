// SettingsPanel：设置（AI Key/baseURL/model、缩放档位、开机自启、宠物名）
(function () {
  class SettingsPanel {
    constructor(onSave) {
      this.onSave = onSave;
      this.el = document.createElement('div');
      this.el.className = 'pet-panel hidden';
      this.el.innerHTML = `
        <div class="panel-head"><span class="panel-title">⚙️ 设置</span><span class="panel-close">✕</span></div>
        <div class="panel-body">
          <label class="fld"><span>宠物名字</span><input type="text" data-k="petName" placeholder="小团子"></label>
          <div class="sec">AI 对话（OpenAI 兼容接口）</div>
          <label class="fld"><span>API Key</span><input type="password" data-k="apiKey" placeholder="未填写则使用离线话术"></label>
          <label class="fld"><span>Base URL</span><input type="text" data-k="baseURL" placeholder="https://api.openai.com/v1"></label>
          <label class="fld"><span>模型</span><input type="text" data-k="model" placeholder="gpt-4o-mini"></label>
          <div class="sec">外观与系统</div>
          <label class="fld"><span>大小</span>
            <select data-k="scale"><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select>
          </label>
          <label class="fld chk"><input type="checkbox" data-k="autostart"><span>开机自启</span></label>
          <div class="panel-actions"><button class="btn-primary sp-save">保存</button></div>
        </div>`;
      document.body.appendChild(this.el);
      this.el.querySelector('.panel-close').addEventListener('click', () => this.hide());
      this.el.querySelector('.sp-save').addEventListener('click', () => this._save());
    }

    show(settings) {
      this.el.classList.remove('hidden');
      const q = (k) => this.el.querySelector(`[data-k="${k}"]`);
      q('petName').value = settings.petName || '';
      q('apiKey').value = settings.ai?.apiKey || '';
      q('baseURL').value = settings.ai?.baseURL || '';
      q('model').value = settings.ai?.model || '';
      q('scale').value = settings.scale || 'medium';
      q('autostart').checked = !!settings.autostart;
    }
    hide() { this.el.classList.add('hidden'); }
    isOpen() { return !this.el.classList.contains('hidden'); }

    _save() {
      const q = (k) => this.el.querySelector(`[data-k="${k}"]`);
      const patch = {
        petName: q('petName').value.trim() || '小团子',
        scale: q('scale').value,
        autostart: q('autostart').checked,
        ai: {
          apiKey: q('apiKey').value.trim(),
          baseURL: q('baseURL').value.trim() || 'https://api.openai.com/v1',
          model: q('model').value.trim() || 'gpt-4o-mini',
        },
      };
      this.onSave(patch);
      this.hide();
    }
  }
  window.SettingsPanel = SettingsPanel;
})();

// StatusPanel：养成状态面板（饱腹/心情/好感/经验/等级）
(function () {
  const { EXP_PER_LEVEL } = window.PetConstants;

  class StatusPanel {
    constructor(getName) {
      this.getName = getName || (() => '小团子');
      this.el = document.createElement('div');
      this.el.className = 'pet-panel hidden';
      this.el.innerHTML = `
        <div class="panel-head"><span class="panel-title">📊 <b class="sp-name"></b> 的状态</span><span class="panel-close">✕</span></div>
        <div class="panel-body">
          <div class="sp-level">Lv.<b class="sp-lv">1</b></div>
          ${bar('饱腹度', 'hunger', '#ff9a5a')}
          ${bar('心情值', 'mood', '#ffd35a')}
          ${bar('好感度', 'affection', '#ff6f9c')}
          ${bar('经验值', 'exp', '#7ad0ff')}
        </div>`;
      document.body.appendChild(this.el);
      this.el.querySelector('.panel-close').addEventListener('click', () => this.hide());
    }

    update(pet) {
      this.el.querySelector('.sp-name').textContent = this.getName();
      this.el.querySelector('.sp-lv').textContent = pet.level;
      set(this.el, 'hunger', pet.hunger, 100, Math.round(pet.hunger));
      set(this.el, 'mood', pet.mood, 100, Math.round(pet.mood));
      set(this.el, 'affection', pet.affection, 100, Math.round(pet.affection));
      const expInLvl = pet.exp % EXP_PER_LEVEL;
      const remaining = EXP_PER_LEVEL - expInLvl;
      set(this.el, 'exp', expInLvl, EXP_PER_LEVEL, `${expInLvl}/${EXP_PER_LEVEL} (还差${remaining})`);

      // 目标梯度效果：进度≥80%时高亮
      const expFill = this.el.querySelector(`.sp-fill[data-k="exp"]`);
      if (expFill && expInLvl / EXP_PER_LEVEL >= 0.8) {
        expFill.style.filter = 'brightness(1.3)';
        expFill.style.boxShadow = '0 0 8px rgba(122, 208, 255, 0.8)';
      } else if (expFill) {
        expFill.style.filter = '';
        expFill.style.boxShadow = '';
      }
    }

    show(pet) { this.el.classList.remove('hidden'); if (pet) this.update(pet); }
    hide() { this.el.classList.add('hidden'); }
    isOpen() { return !this.el.classList.contains('hidden'); }
  }

  function bar(label, key, color) {
    return `<div class="sp-row"><span class="sp-label">${label}</span>
      <span class="sp-track"><span class="sp-fill" data-k="${key}" style="background:${color}"></span></span>
      <span class="sp-val" data-v="${key}"></span></div>`;
  }
  function set(root, key, val, max, text) {
    const fill = root.querySelector(`.sp-fill[data-k="${key}"]`);
    const v = root.querySelector(`.sp-val[data-v="${key}"]`);
    if (fill) fill.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + '%';
    if (v) v.textContent = text;
  }

  window.StatusPanel = StatusPanel;
})();

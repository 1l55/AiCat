// AchievementPanel：成就墙 + 皮肤衣橱 + 配饰衣橱。每个成就解锁皮肤/配饰，可在此查看与切换。
(function () {
  const { ACHIEVEMENTS, SKINS, ACCESSORIES, ACC_SLOTS } = window.PetConstants;

  const SLOT_LABEL = { head: '头部', body: '身体', feet: '脚部', back: '背部' };

  class AchievementPanel {
    // api: window.petAPI
    // onSkinChange(key, tint)：切换皮肤后通知渲染层即时换色
    // onAccessoryChange(equippedMap)：切换配饰后通知渲染层即时重绘
    constructor(api, onSkinChange, onAccessoryChange) {
      this.api = api;
      this.onSkinChange = onSkinChange || (() => {});
      this.onAccessoryChange = onAccessoryChange || (() => {});
      this.el = document.createElement('div');
      this.el.className = 'pet-panel hidden';
      this.el.innerHTML = `
        <div class="panel-head"><span class="panel-title">🏆 成就 & 形象</span><span class="panel-close">✕</span></div>
        <div class="panel-body">
          <div class="ach-progress"><span class="ach-count">0/0</span> 成就已解锁</div>
          <div class="sec">🎨 皮肤衣橱</div>
          <div class="skin-grid"></div>
          <div class="sec">👗 配饰衣橱</div>
          <div class="acc-wardrobe"></div>
          <div class="sec">🏆 成就墙</div>
          <div class="ach-list"></div>
        </div>`;
      document.body.appendChild(this.el);
      this.el.querySelector('.panel-close').addEventListener('click', () => this.hide());
    }

    async show() {
      this.el.classList.remove('hidden');
      await this.render();
    }
    hide() { this.el.classList.add('hidden'); }
    isOpen() { return !this.el.classList.contains('hidden'); }

    async render() {
      const data = await this.api.getAchievements();
      const achieved = data.achievements || {};
      const unlockedSkins = data.unlockedSkins || ['default'];
      const activeSkin = data.activeSkin || 'default';
      const unlockedAcc = data.unlockedAccessories || [];
      const equipped = data.equippedAccessories || {};

      // 进度
      const total = ACHIEVEMENTS.length;
      const done = ACHIEVEMENTS.filter((a) => achieved[a.key]).length;
      this.el.querySelector('.ach-count').textContent = `${done}/${total}`;

      this.renderSkins(unlockedSkins, activeSkin);
      this.renderAccessories(unlockedAcc, equipped);
      this.renderAchievements(achieved);
    }

    renderSkins(unlocked, active) {
      const grid = this.el.querySelector('.skin-grid');
      grid.innerHTML = '';
      for (const skin of SKINS) {
        const isUnlocked = unlocked.includes(skin.key);
        const isActive = skin.key === active;
        const cell = document.createElement('div');
        cell.className = 'skin-cell' + (isUnlocked ? '' : ' locked') + (isActive ? ' active' : '');
        const hex = '#' + skin.tint.toString(16).padStart(6, '0');
        cell.innerHTML = `
          <span class="skin-swatch" style="background:${hex}">${isUnlocked ? '' : '🔒'}</span>
          <span class="skin-name">${skin.name}</span>`;
        cell.title = isUnlocked ? (isActive ? '当前装备' : '点击装备') : skin.desc;
        if (isUnlocked) cell.addEventListener('click', () => this.equipSkin(skin.key));
        grid.appendChild(cell);
      }
    }

    renderAccessories(unlocked, equipped) {
      const wrap = this.el.querySelector('.acc-wardrobe');
      wrap.innerHTML = '';
      for (const slot of ACC_SLOTS) {
        const items = ACCESSORIES.filter((a) => a.slot === slot);
        if (items.length === 0) continue;
        const group = document.createElement('div');
        group.className = 'acc-group';
        const equippedKey = equipped[slot];
        const slotRow = document.createElement('div');
        slotRow.className = 'acc-slot-row';
        slotRow.innerHTML = `<span class="acc-slot-label">${SLOT_LABEL[slot] || slot}</span>`;
        const cells = document.createElement('div');
        cells.className = 'acc-cells';

        // “无” = 卸下该槽位
        const noneCell = document.createElement('div');
        noneCell.className = 'acc-cell' + (!equippedKey ? ' active' : '');
        noneCell.innerHTML = `<span class="acc-chip">∅</span><span class="acc-name">无</span>`;
        noneCell.title = '不戴';
        noneCell.addEventListener('click', () => this.equipAccessory(slot, null));
        cells.appendChild(noneCell);

        for (const acc of items) {
          const isUnlocked = unlocked.includes(acc.key);
          const isActive = acc.key === equippedKey;
          const cell = document.createElement('div');
          cell.className = 'acc-cell' + (isUnlocked ? '' : ' locked') + (isActive ? ' active' : '');
          cell.innerHTML = `<span class="acc-chip">${isUnlocked ? acc.name.split(' ')[0] : '🔒'}</span>
            <span class="acc-name">${acc.name.replace(/^\S+\s/, '')}</span>`;
          cell.title = isUnlocked ? (isActive ? '当前装备（点击卸下）' : '点击装备') : acc.desc;
          if (isUnlocked) {
            cell.addEventListener('click', () => this.equipAccessory(slot, isActive ? null : acc.key));
          }
          cells.appendChild(cell);
        }
        group.appendChild(slotRow);
        group.appendChild(cells);
        wrap.appendChild(group);
      }
    }

    renderAchievements(achieved) {
      const list = this.el.querySelector('.ach-list');
      list.innerHTML = '';
      for (const a of ACHIEVEMENTS) {
        const got = !!achieved[a.key];
        const skin = SKINS.find((s) => s.key === a.skin);
        const acc = ACCESSORIES.find((x) => x.key === a.accessory);
        const rewards = [
          skin ? `皮肤「${skin.name}」` : '',
          acc ? `配饰「${acc.name.replace(/^\S+\s/, '')}」` : '',
        ].filter(Boolean).join(' + ');
        const row = document.createElement('div');
        row.className = 'ach-item' + (got ? '' : ' locked');
        row.innerHTML = `
          <span class="ach-icon">${got ? '✅' : '🔒'}</span>
          <span class="ach-info">
            <b>${a.name}</b>
            <small>${a.desc}${rewards ? ` · 解锁${rewards}` : ''}</small>
          </span>`;
        list.appendChild(row);
      }
    }

    async equipSkin(key) {
      const res = await this.api.setSkin(key);
      if (res && res.ok) {
        const skin = SKINS.find((s) => s.key === key);
        this.onSkinChange(key, skin ? skin.tint : 0xFFFFFF);
        await this.render();
      }
    }

    async equipAccessory(slot, key) {
      const res = await this.api.setAccessory(slot, key);
      if (res && res.ok) {
        this.onAccessoryChange(res.equippedAccessories || {});
        await this.render();
      }
    }
  }

  window.AchievementPanel = AchievementPanel;
})();

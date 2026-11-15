// hud.js — all DOM overlays: health/ammo/money/timer/score, killfeed,
// round banners, buy menu, bomb timer, hitmarker, crosshair.
import { WEAPONS, BUY_ORDER } from './weapons.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['health', 'healthbar', 'armor', 'ammo', 'money', 'timer', 'score',
      'round', 'banner', 'banner-sub', 'killfeed', 'bomb', 'bomb-timer', 'hitmarker',
      'crosshair', 'buymenu', 'buy-items', 'help', 'death', 'plantbar', 'plantfill',
      'plantlabel', 'sitelabel', 'buy-round']) {
      this.el[id] = document.getElementById(id);
    }
    this.buyOpen = false;
    this.onBuy = null;
  }

  setHealth(hp, armor) {
    this.el.health.textContent = Math.ceil(hp);
    this.el.healthbar.style.width = `${Math.max(0, hp)}%`;
    this.el.healthbar.style.background = hp > 50 ? '#3fae6a' : hp > 25 ? '#d9a441' : '#c0392b';
    this.el.armor.textContent = armor > 0 ? `🛡 ${Math.ceil(armor)}` : '';
  }

  setAmmo(ammo, reserve, reloading) {
    this.el.ammo.textContent = reloading > 0 ? 'RELOADING…' : `${ammo} / ${reserve}`;
  }

  setMoney(m) { this.el.money.textContent = `$${m}`; }

  setTimer(s) {
    const t = Math.max(0, Math.ceil(s));
    const mm = Math.floor(t / 60);
    const ss = String(t % 60).padStart(2, '0');
    this.el.timer.textContent = `${mm}:${ss}`;
    this.el.timer.style.color = t <= 10 ? '#ff5a4d' : '#fff';
  }

  setScore(a, b, round) {
    this.el.score.textContent = `${a} — ${b}`;
    this.el.round.textContent = `ROUND ${round}`;
    if (this.el['buy-round']) this.el['buy-round'].textContent = String(round);
  }

  banner(text, sub = '') {
    this.el.banner.textContent = text;
    this.el['banner-sub'].textContent = sub;
    this.el.banner.style.opacity = '1';
    this.el['banner-sub'].style.opacity = '1';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => {
      this.el.banner.style.opacity = '0';
      this.el['banner-sub'].style.opacity = '0';
    }, 3200);
  }

  killfeed(killer, victim, weaponName, head) {
    const row = document.createElement('div');
    row.className = 'kf-row';
    row.innerHTML = `<span class="kf-k">${killer}</span> <span class="kf-w">${head ? '☠ ' : ''}${weaponName}</span> <span class="kf-v">${victim}</span>`;
    this.el.killfeed.prepend(row);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  setBomb(state, seconds, site) {
    if (state === 'planted') {
      this.el.bomb.style.display = 'block';
      this.el['bomb-timer'].textContent = `💣 SITE ${site} — ${seconds.toFixed(1)}s`;
      this.el.bomb.style.color = seconds < 10 ? '#ff5a4d' : '#ffb03a';
    } else if (state === 'carried') {
      this.el.bomb.style.display = 'block';
      this.el['bomb-timer'].textContent = '💣 YOU CARRY THE BOMB — plant at A or B (hold E in site)';
      this.el.bomb.style.color = '#ffb03a';
    } else {
      this.el.bomb.style.display = 'none';
    }
  }

  setSiteLabel(text) {
    this.el.sitelabel.textContent = text;
  }

  setPlant(label, progress) {
    if (label === null) {
      this.el.plantbar.style.display = 'none';
      return;
    }
    this.el.plantbar.style.display = 'block';
    this.el.plantlabel.textContent = label;
    this.el.plantfill.style.width = `${Math.round(progress * 100)}%`;
  }

  hitmarker(head) {
    const h = this.el.hitmarker;
    h.style.opacity = '1';
    h.style.color = head ? '#ff5a4d' : '#fff';
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { h.style.opacity = '0'; }, 130);
  }

  setCrosshair(spreadPx) {
    this.el.crosshair.style.setProperty('--gap', `${4 + spreadPx}px`);
  }

  showBuy(money) {
    this.buyOpen = true;
    this.el.buymenu.style.display = 'block';
    const items = this.el['buy-items'];
    items.innerHTML = '';
    BUY_ORDER.forEach((id, i) => {
      const w = WEAPONS[id];
      const row = document.createElement('div');
      row.className = 'buy-row';
      const afford = money >= w.price;
      row.innerHTML = `<span class="buy-key">${i + 1}</span> <span class="buy-name">${w.name}</span> <span class="buy-stat">${w.damage} dmg · ${w.mag} rnd</span> <span class="buy-price" style="color:${afford ? '#7ddc8a' : '#ff7a6e'}">$${w.price}</span>`;
      row.addEventListener('click', () => { if (this.onBuy) this.onBuy(id); });
      items.appendChild(row);
    });
    const armor = document.createElement('div');
    armor.className = 'buy-row';
    armor.innerHTML = `<span class="buy-key">5</span> <span class="buy-name">Kevlar Vest</span> <span class="buy-stat">100 armor</span> <span class="buy-price" style="color:${money >= 650 ? '#7ddc8a' : '#ff7a6e'}">$650</span>`;
    armor.addEventListener('click', () => { if (this.onBuy) this.onBuy('armor'); });
    items.appendChild(armor);
  }

  hideBuy() {
    this.buyOpen = false;
    this.el.buymenu.style.display = 'none';
  }

  showDeath(text) {
    this.el.death.style.display = 'block';
    this.el.death.textContent = text;
  }

  hideDeath() { this.el.death.style.display = 'none'; }

  showHelp(show) { this.el.help.style.display = show ? 'block' : 'none'; }
}

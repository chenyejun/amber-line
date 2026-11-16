// The DOM HUD: crosshair, hit marker, health, ammo, money, score, timer, team pips,
// kill feed, banners and the buy menu. It never touches the simulation; main.js pushes
// numbers in and reads the play callback out. Cached values keep the DOM quiet.
import { WEAPONS, GRENADE } from './weapons.js';

const COPY = {
  start: {
    title: 'Amber <span class="amber">Line</span>',
    copy: 'Dusk over the old freight yard. Hold the line with two teammates against five Rust raiders — first to five rounds takes the yard. They carry the charge: stop the plant, or cut the wire.',
    action: 'Click to play',
  },
  paused: {
    title: 'Amber <span class="amber">Line</span>',
    copy: 'Paused. Click to resume the round.',
    action: 'Click to resume',
  },
  roundEnd: { title: '', copy: '', action: 'Continue' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

function el(id) { return document.getElementById(id); }

export function createHud() {
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const buyPanel = el('buy');
  const buyItems = el('buy-items');
  const buyMoney = el('buy-money');
  const buyClose = el('buy-close');
  let hitTimer = 0;
  let bannerTimer = 0;
  let cache = { mag: -1, reserve: -1, health: -1, money: -1, kills: -1, amber: -1, rust: -1, timer: '', round: -1, grenades: -1, weapon: '' };

  function pips(container, alive, total, team) {
    let html = '';
    for (let i = 0; i < total; i += 1) html += `<span class="dot ${i < alive ? team : 'dead'}"></span>`;
    if (container.innerHTML !== html) container.innerHTML = html;
  }

  return {
    setHealth(value) {
      const v = Math.max(0, Math.ceil(value));
      if (v === cache.health) return;
      cache.health = v;
      el('health-num').textContent = String(v);
      const fill = el('health-fill');
      fill.style.width = `${v}%`;
      fill.classList.toggle('low', v <= 30);
    },
    setAmmo(mag, reserve, name) {
      if (mag !== cache.mag || reserve !== cache.reserve) {
        cache.mag = mag; cache.reserve = reserve;
        el('ammo-mag').textContent = String(mag);
        el('ammo-reserve').textContent = `/ ${reserve}`;
        el('ammo').classList.toggle('empty', mag === 0);
      }
      if (name !== cache.weapon) {
        cache.weapon = name;
        el('weapon-name').textContent = name;
      }
    },
    setMoney(value) {
      if (value === cache.money) return;
      cache.money = value;
      el('money').textContent = `$${value}`;
    },
    setKills(value) {
      if (value === cache.kills) return;
      cache.kills = value;
      el('kills').textContent = `${value} kill${value === 1 ? '' : 's'}`;
    },
    setGrenades(value) {
      if (value === cache.grenades) return;
      cache.grenades = value;
      el('grenades').textContent = value > 0 ? `◉ Grenades ×${value}  [G]` : '';
    },
    setScore(amber, rust, round) {
      if (amber === cache.amber && rust === cache.rust && round === cache.round) return;
      cache.amber = amber; cache.rust = rust; cache.round = round;
      el('score-amber').textContent = String(amber);
      el('score-rust').textContent = String(rust);
      el('round-label').textContent = `ROUND ${round}`;
    },
    setTimer(seconds, phase) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = phase === 'buy' ? `BUY ${total}` : `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      if (text === cache.timer) return;
      cache.timer = text;
      const timer = el('timer');
      timer.textContent = text;
      timer.classList.toggle('low', phase === 'live' && total <= 10);
    },
    setPips(amberAlive, rustAlive) {
      pips(el('amber-pips'), amberAlive, 3, 'amber');
      pips(el('rust-pips'), rustAlive, 5, 'rust');
    },
    setBombStatus(text) {
      const node = el('bomb-status');
      if (node.textContent !== text) node.textContent = text;
    },
    setHint(text) {
      const node = el('hint');
      if (node.innerHTML !== text) node.innerHTML = text;
    },
    setReloadHint(text) {
      const node = el('reload-hint');
      if (node.textContent !== text) node.textContent = text;
    },
    setCrosshairSpread(spreadPx) {
      const gap = Math.min(14, 2 + spreadPx * 900);
      const cross = el('crosshair');
      cross.style.setProperty('--gap', `${gap}px`);
      cross.style.transform = `translate(-50%, -50%) scale(${1 + spreadPx * 14})`;
    },
    hitMarker(killed, holdMs = 90) {
      const marker = el('hitmarker');
      marker.classList.add('on');
      marker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => marker.classList.remove('on'), holdMs);
    },
    vignette(on) {
      el('vignette').classList.toggle('on', on);
    },
    feed(killer, victim, killerTeam) {
      const feed = el('feed');
      const line = document.createElement('div');
      line.innerHTML = `<b class="${killerTeam}">${killer}</b> ▸ ${victim}`;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 9000);
    },
    banner(text, sub = '', holdMs = 2600) {
      const node = el('banner');
      node.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
      node.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => node.classList.remove('on'), holdMs);
    },
    showOverlay(mode, titleText = '', copyText = '') {
      const text = COPY[mode];
      if (!text) return;
      const isCard = mode === 'roundEnd' || mode === 'matchEnd';
      title.innerHTML = isCard ? titleText : text.title;
      copy.textContent = isCard ? copyText : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    showBuy(money, ownedIds, onBuy) {
      buyItems.innerHTML = '';
      const rows = [...WEAPONS.map((w, i) => ({
        key: String(i + 1), name: w.name, desc: w.desc, price: w.price,
        owned: ownedIds.includes(w.id), disabled: ownedIds.includes(w.id) || money < w.price,
        buy: () => onBuy(w.id),
      })), {
        key: '5', name: GRENADE.name, desc: GRENADE.desc, price: GRENADE.price,
        owned: false, disabled: money < GRENADE.price, buy: () => onBuy('grenade'),
      }];
      for (const row of rows) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `buy-item${row.owned ? ' owned' : ''}`;
        button.disabled = row.disabled;
        button.innerHTML = `<span class="key">${row.key}</span><span class="name">${row.name}</span><span class="desc">${row.desc}</span><span class="price">${row.owned ? 'OWNED' : `$${row.price}`}</span>`;
        button.addEventListener('click', row.buy);
        buyItems.appendChild(button);
      }
      buyMoney.textContent = `Your money: $${money}`;
      buyPanel.hidden = false;
    },
    hideBuy() { buyPanel.hidden = true; },
    onBuyClose(handler) { buyClose.addEventListener('click', handler); },
  };
}

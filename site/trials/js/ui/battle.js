// 戰鬥播放（SPEC 5.6）：照 Result.events 的 t 排程，不重算任何戰鬥邏輯。
// playBattle(boardEl, result, opts) -> Promise<void>
//   opts: { speed:1|2|4（預設 2）, onEvent(ev, api), skip:AbortSignal,
//           spriteIndex(key)->0..99（頭像在 champions.webp 的格序，沒給就顯示中文名第一個字）,
//           spriteUrl（預設 '../icons/s19/champions.webp'）, noEndSound:bool }
// 另外匯出 setBattleSpeed(n)、getBattleSpeed()，戰鬥中可隨時改速度。
import { sfx } from '../audio.js';
import { starsEl } from './stars.js';
import { createFx } from './fx/script.js';
import { reducedMotion } from './fx/settings.js';

const TICK_MS = 50;
const ROW_H = 0.866;
let speed = 2;
export function setBattleSpeed(n) { if (n === 1 || n === 2 || n === 4) speed = n; }
export function getBattleSpeed() { return speed; }

// 技能演出設定（data/fx.json，由 tools/build_fx.py 從 research/ability_fx.json 轉出）；兩個頁面（滴答克、教學頁）共用這一份
let fxJson = null, fxLoad = null;
function loadFx() {
  if (fxJson || fxLoad || typeof fetch !== 'function') return fxLoad || Promise.resolve(fxJson);
  try { fxLoad = fetch(new URL('../../data/fx.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => { fxJson = j; return j; }).catch(() => null); } catch (_) { fxLoad = Promise.resolve(null); }
  return fxLoad;
}
loadFx();
const sheetImgs = new Map();
function sheetImg(url) {
  if (!url) return null;
  let i = sheetImgs.get(url);
  if (!i) { i = new Image(); i.src = url; sheetImgs.set(url, i); }
  return i;
}

const CSS = ''; // 整合：樣式已搬進 trials.css（U3 區）

function injectCss() {
  return CSS; // 整合：不再注入 <style>
}

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

export function playBattle(boardEl, result, opts = {}) {
  injectCss();
  if (opts.speed) setBattleSpeed(opts.speed);
  else if (!opts.__keep) speed = 2;
  const reduced = reducedMotion();
  const events = result.events || [];

  const old = boardEl.querySelector(':scope > .tt-bt');
  if (old) old.remove();
  if (getComputedStyle(boardEl).position === 'static') boardEl.style.position = 'relative';
  const root = el('div', 'tt-bt' + (reduced ? ' tt-bt-rm' : ''));
  boardEl.appendChild(root);

  let W = 0, w = 0;
  const U = new Map();   // id -> state
  let fx = null, fast = false;
  const nowMs = () => performance.now();
  // 單位現在的畫面座標：格子位置（含滑行中的內插）＋純畫面的偏移（飛出去的演出、擊飛）
  const basePosOf = (u) => {
    const to = hexXY(u.hex);
    if (!u.mv) return to;
    const k = Math.min(1, Math.max(0, (nowMs() - u.mv.t0) / u.mv.dur));
    if (k >= 1) { u.mv = null; return to; }
    const f = hexXY(u.mv.from);
    return { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k };
  };
  const fxEnv = {
    W: () => W, H: () => w * (7 * ROW_H + 1), w: () => w, speed: () => speed,
    pos: (id) => { const u = U.get(id); if (!u) return null; const p = basePosOf(u); return { x: p.x + (u.ox || 0), y: p.y + (u.oy || 0) }; },
    basePos: (id) => { const u = U.get(id); return u ? basePosOf(u) : null; },
    unit: (id) => U.get(id) || null,
    units: () => Array.from(U.values()),
    unitNode: (id) => { const u = U.get(id); return u ? u.node : null; },
    applyOffset: (u) => { u.inn.style.translate = (u.ox || u.oy) ? `${u.ox || 0}px ${u.oy || 0}px` : ''; },
    shakeEl: () => boardEl,
    sprite: (c, key, x, y, r, alpha) => {
      const img = sheetImg(opts.spriteUrl || '../icons/s19/champions.webp'), idx = opts.spriteIndex ? opts.spriteIndex(key) : null;
      c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
      if (img && img.complete && img.naturalWidth && idx != null && idx >= 0) { const cw = img.naturalWidth / 10, ch = img.naturalHeight / 10; c.globalAlpha = alpha == null ? 1 : alpha; c.drawImage(img, (idx % 10) * cw, Math.floor(idx / 10) * ch, cw, ch, x - r, y - r, r * 2, r * 2); }
      else { c.fillStyle = 'rgba(220,220,230,.6)'; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.restore();
    },
  };

  function layout() {
    W = boardEl.clientWidth || 390;
    w = W / 7.5;
    root.style.setProperty('--tt-w', w + 'px');
    root.style.height = (w * (7 * ROW_H + 1)) + 'px';
    if (fx) fx.resize();
  }
  const hexXY = (h) => ({ x: (h.col + 0.5 * (h.row & 1)) * w + w / 2, y: h.row * ROW_H * w + w / 2 });
  const place = (u, ms) => {
    const p = hexXY(u.hex);
    u.mv = ms && !reduced ? { from: u.prevHex || u.hex, t0: nowMs(), dur: ms } : null;
    u.node.style.transitionDuration = (reduced || !ms ? 0 : ms) + 'ms';
    u.node.style.transform = `translate(${p.x - w / 2}px,${p.y - w / 2}px)`;
  };
  const center = (u) => hexXY(u.hex);

  function makeUnit(d) {
    const u = { id: d.id, side: d.side, key: d.key, hex: { row: d.hex.row, col: d.hex.col }, hpMax: d.hpMax || 1, hp: d.hpMax || 1, shield: 0, manaMax: d.manaMax || 0, mana: 0, alive: true, st: new Map(), boss: !!d.boss, star: d.star || 1, castN: 0, atkN: 0, ox: 0, oy: 0, mv: null };
    const n = el('div', 'tt-bt-u ' + (d.side === 'player' ? 'tt-bt-p' : 'tt-bt-e') + (d.boss ? ' tt-bt-boss' : ''), root);
    const inn = el('div', 'tt-bt-in', n);
    const av = el('div', 'tt-bt-av', inn);
    const idx = opts.spriteIndex ? opts.spriteIndex(d.key) : null;
    if (idx != null && idx >= 0) {
      av.style.backgroundImage = `url(${opts.spriteUrl || '../icons/s19/champions.webp'})`;
      av.style.backgroundSize = '1000% 1000%';
      av.style.backgroundPosition = `${(idx % 10) / 9 * 100}% ${Math.floor(idx / 10) / 9 * 100}%`;
    } else av.textContent = (d.zh || d.key || '?').slice(0, 1);
    u.stars = el('div', 'tt-bt-star', inn);
    u.stars.append(starsEl(d.star, { label: false }));
    n.classList.add('tt-bt-s' + Math.min(3, Math.max(1, d.star || 1)));
    u.stbox = el('div', 'tt-bt-st', inn);
    const bars = el('div', 'tt-bt-bars', inn);
    const hp = el('div', 'tt-bt-hp', bars);
    u.hpf = el('div', 'tt-bt-hpf', hp);
    u.shf = el('div', 'tt-bt-shf', hp);
    const mp = el('div', 'tt-bt-mp', bars);
    u.mpf = el('div', 'tt-bt-mpf', mp);
    u.node = n; u.inn = inn;
    n.setAttribute('aria-hidden', 'true');
    U.set(u.id, u);
    place(u, 0);
    bars_(u);
    return u;
  }
  function bars_(u) {
    const den = Math.max(u.hpMax, u.hp + u.shield);
    u.hpf.style.width = Math.max(0, Math.min(100, u.hp / den * 100)) + '%';
    u.shf.style.left = Math.max(0, u.hp / den * 100) + '%';
    u.shf.style.width = Math.min(100, u.shield / den * 100) + '%';
    u.mpf.style.width = u.manaMax ? Math.max(0, Math.min(100, u.mana / u.manaMax * 100)) + '%' : '0%';
  }

  layout();
  fx = createFx(root, fxEnv);
  root.__fx = fx;   // 測試掛鉤：讀特效狀態用
  fx.setData(fxJson);
  if (!fxJson) loadFx().then((j) => { if (j && fx) fx.setData(j); });
  for (const d of (result.units || [])) makeUnit(d);
  // 沙灘樂器：場上的召喚物，只佔格、畫在那一格上（不動、不被打、沒有血條）
  const instNodes = [];
  for (const d of (result.instruments || [])) {
    const n = el('div', 'tt-bt-inst ' + (d.side === 'player' ? 'tt-bt-p' : 'tt-bt-e'), root);
    n.setAttribute('aria-hidden', 'true');
    instNodes.push({ n, hex: d.hex });
  }
  const placeInst = () => { for (const i of instNodes) { const p = hexXY(i.hex); i.n.style.transform = `translate(${p.x - w / 2}px,${p.y - w / 2}px)`; } };
  placeInst();
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => { layout(); for (const u of U.values()) place(u, 0); placeInst(); });
    ro.observe(boardEl);
  }

  // ---------- 視覺小工具 ----------
  const live = { n: 0 };
  const merge = new Map();   // 飄字合併
  function anim(node, keyframes, ms, done) {
    if (reduced || fast || !node.animate) { if (done) done(); return null; }
    const a = node.animate(keyframes, { duration: ms, easing: 'ease-out', fill: 'forwards' });
    if (done) a.onfinish = done;
    return a;
  }
  function floatNum(u, text, cls, crit) {
    if (reduced || fast || !u) return;
    const k = u.id + '|' + cls + '|' + (crit ? 1 : 0);
    const now = performance.now();
    const m = merge.get(k);
    if (m && now - m.t0 < 100 && m.node.isConnected && cls !== 'tt-bt-n-b') {
      m.amt += text; m.node.textContent = fmt(m.amt, cls); return;
    }
    if (live.n > 40) return;
    const p = center(u);
    const n = el('div', 'tt-bt-num ' + cls + (crit ? ' tt-bt-crit' : ''), root);
    n.style.left = (p.x + (Math.random() * 10 - 5)) + 'px';   // 只影響視覺，不影響戰鬥結果
    n.style.top = (p.y - w * 0.4) + 'px';
    const amt = typeof text === 'number' ? text : 0;
    n.textContent = typeof text === 'number' ? fmt(text, cls) : text;
    live.n++;
    merge.set(k, { t0: now, node: n, amt });
    anim(n, [{ opacity: 1, transform: 'translate(-50%,-50%)' }, { opacity: 0, transform: 'translate(-50%,-' + (w * 0.9 + 50) + '%)' }], 750, () => { n.remove(); live.n--; });
  }
  const fmt = (a, cls) => (cls === 'tt-bt-n-h' || cls === 'tt-bt-n-s' ? '+' : '') + Math.round(a);

  function lunge(a, b, ms) {
    if (!a || !b || reduced || fast) return;
    const pa = center(a), pb = center(b);
    const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(w * 0.3, d * 0.5) / d;
    anim(a.inn, [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * k}px,${dy * k}px)`, offset: 0.4 }, { transform: 'translate(0,0)' }], ms);
  }
  const resolvePt = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') { const u = U.get(v); return u ? center(u) : null; }
    if (v.row != null) return hexXY(v);
    return null;
  };
  let banner = null, bannerTimer = 0;
  function showBanner(text, side) {
    if (reduced && false) return;
    if (!banner) banner = el('div', 'tt-bt-banner', root);
    banner.style.setProperty('--tt-side', side === 'player' ? '#2563b0' : '#c4452f');
    banner.textContent = text;
    banner.style.display = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { if (banner) banner.style.display = 'none'; }, 1200);
  }
  function setStatus(u, kind, on) {
    if (on) u.st.set(kind, true); else u.st.delete(kind);
    u.node.classList.toggle('tt-bt-untarget', u.st.has('untargetable'));
    u.stbox.textContent = '';
    for (const k of u.st.keys()) {
      if (k === 'stun') { const s = el('span', 'tt-bt-st-stun', u.stbox); s.textContent = '◌'; }
      else if (k === 'charm') { const s = el('span', 'tt-bt-st-charm', u.stbox); s.textContent = '♥'; }
      else if (k === 'untargetable' || k === 'ccImmune') continue;
      else if (!reduced) { const s = el('span', 'tt-bt-st-misc', u.stbox); s.textContent = STNAME[k] || k; }
    }
  }
  const STNAME = { burn: '燃', wound: '傷', shred: '裂', sunder: '破', chill: '凍', weaken: '弱', vulnerable: '易' };
  const TYPE_CLS = { p: 'tt-bt-n-p', m: 'tt-bt-n-m', t: 'tt-bt-n-t' };

  // ---------- 事件 ----------
  // fast（跳過）時：只更新狀態，不做動畫、特效與音效
  const snd = (n) => { if (!fast) sfx(n); };
  function handle(ev) {
    const u = U.get(ev.id);
    switch (ev.e) {
      case 'move':
        if (u) {
          const from = { row: u.hex.row, col: u.hex.col };
          u.prevHex = from;
          const cur = fast ? null : basePosOf(u);   // 還在滑的話，從目前位置接著走
          u.hex = { row: ev.to.row, col: ev.to.col };
          place(u, fast ? 0 : (ev.dur || 0) * TICK_MS / speed);
          if (!fast && fx) fx.move(u, from, u.hex, ev);
          void cur;
        }
        break;
      case 'atk': {
        const t = U.get(ev.tgt);
        if (!ev.ranged) lunge(u, t, 160);
        if (u && !fast && fx) fx.atk(u, ev);
        break;
      }
      case 'dmg':
        if (u) {
          u.hp = ev.hp; u.shield = ev.shield || 0; bars_(u);
          floatNum(u, ev.amt, TYPE_CLS[ev.type] || 'tt-bt-n-p', ev.crit);
          if (ev.tag === 'atk') snd('hit');
          if (!fast && fx) { fx.dmg(u, ev, ev.src != null ? U.get(ev.src) : null); fx.hpLow(u); }
        }
        break;
      case 'heal':
        if (u) { u.hp = ev.hp; bars_(u); floatNum(u, ev.amt, 'tt-bt-n-h'); if (!fast && fx) fx.heal(u, ev); }
        break;
      case 'shield':
        if (u) { u.shield = ev.shield; bars_(u); floatNum(u, ev.amt, 'tt-bt-n-s'); if (!fast && fx) fx.shield(u, ev); }
        break;
      case 'mana':
        if (u) { u.mana = ev.mana; bars_(u); }
        break;
      case 'cast':
        if (u) {
          if (!reduced && !fast) {
            const c = el('div', 'tt-bt-cast', u.inn);
            c.textContent = ev.name || '';
            setTimeout(() => c.remove(), 800);
          }
          snd('cast');
          if (!fast && fx) fx.cast(u);
        }
        break;
      case 'fire':
        if (u && !fast && fx) fx.fire(u, ev);
        break;
      case 'fx': {
        if (fast || !fx) break;
        const a = resolvePt(ev.from), b = resolvePt(ev.to);
        const src = ev.src != null ? U.get(ev.src) : null;
        if (ev.kind === 'aoe' || ev.kind === 'cone') {
          if (Array.isArray(ev.hexes) && ev.hexes.length) fx.hexes(ev.hexes.map(hexXY), src);
          else if (b || a) fx.hexes([b || a], src);
        } else if (a && b) fx.line(a, b, ev.kind, src);
        break;
      }
      case 'status':
        if (u) { setStatus(u, ev.kind, ev.on); if (!fast && fx) fx.status(u, ev.kind, ev.on); }
        break;
      case 'buff':
        if (u && ev.stat) floatNum(u, `+${ev.stat}`, 'tt-bt-n-b');
        break;
      case 'trait':
        if (!fast) {
          showBanner(ev.text || ev.key, ev.side);
          boardEl.dispatchEvent(new CustomEvent('tt-trait', { bubbles: true, detail: { key: ev.key, side: ev.side } }));
        }
        break;
      case 'spawn': {
        const d = ev.unit;
        if (d && !U.has(d.id)) {
          const nu = makeUnit(d);
          anim(nu.node, [{ opacity: 0 }, { opacity: 1 }], 300);
          if (!fast && fx) fx.spawn(nu);
        }
        break;
      }
      case 'death':
        if (u) {
          u.alive = false; u.hp = 0; u.shield = 0; bars_(u);
          u.stbox.textContent = ''; u.st.clear();
          const a = anim(u.node, [{ opacity: 1 }, { opacity: 0 }], 350);
          if (!a) u.node.style.opacity = '0'; else a.onfinish = () => { u.node.style.opacity = '0'; };
          snd('death');
          if (!fast && fx) fx.death(u, ev, ev.killer != null ? U.get(ev.killer) : null);
          u.ox = 0; u.oy = 0; fxEnv.applyOffset(u);
        }
        break;
      case 'end':
        break;
    }
  }

  // ---------- 排程 ----------
  return new Promise((resolve) => {
    let i = 0, vt = 0, last = performance.now(), raf = 0, fxRaf = 0, fxLast = 0, done = false;
    const endEv = events.find((e) => e.e === 'end');
    const winner = endEv ? endEv.winner : result.winner;

    function finish(instant) {
      if (done) return; done = true;
      cancelAnimationFrame(raf); cancelAnimationFrame(fxRaf);
      document.removeEventListener('visibilitychange', onVis);
      if (fx) fx.clear();
      if (ro) ro.disconnect();
      if (opts.skip) opts.skip.removeEventListener('abort', onAbort);
      if (!opts.noEndSound) sfx(winner === 'player' ? 'win' : 'lose');
      clearTimeout(bannerTimer);
      if (banner) banner.style.display = 'none';
      resolve();
    }
    function onAbort() {
      if (done) return;
      fast = true;
      for (; i < events.length; i++) { handle(events[i]); if (opts.onEvent) opts.onEvent(events[i], { fast: true }); }
      for (const n of root.querySelectorAll('.tt-bt-num,.tt-bt-cast')) n.remove();
      if (fx) { fx.stage.enabled = false; fx.clear(); }   // 跳過：特效立即清空
      for (const u of U.values()) { u.ox = 0; u.oy = 0; u.mv = null; fxEnv.applyOffset(u); }
      finish(true);
    }
    if (opts.skip) {
      if (opts.skip.aborted) { onAbort(); return; }
      opts.skip.addEventListener('abort', onAbort);
    }

    // 特效自己一個 rAF 迴圈（戰鬥事件結束後還要把爆炸、死亡特效播完）；分頁隱藏時瀏覽器會停掉 rAF，回來後不補播
    function fxFrame(now) {
      if (done) return;
      const dt = fxLast ? now - fxLast : 16; fxLast = now;
      if (fx) { try { fx.tick(dt > 100 ? 16 : dt); } catch (e) { console.error(e); fx.clear(); } }
      fxRaf = requestAnimationFrame(fxFrame);
    }
    function onVis() { if (document.hidden) { fxLast = 0; last = performance.now(); } else { fxLast = 0; last = performance.now(); } }
    document.addEventListener('visibilitychange', onVis);

    function frame(now) {
      if (done) return;
      const dt = Math.min(now - last, 100);   // 分頁切走回來不要一次衝完
      last = now;
      vt += dt / TICK_MS * speed;
      while (i < events.length && events[i].t <= vt) {
        const ev = events[i++];
        handle(ev);
        if (opts.onEvent) opts.onEvent(ev, { fast: false });
        if (ev.e === 'end') { setTimeout(() => finish(false), 600); return; }
      }
      if (i >= events.length) { setTimeout(() => finish(false), 400); return; }
      raf = requestAnimationFrame(frame);
    }
    if (!events.length) { finish(false); return; }
    if (fxJson) fx.start(); else loadFx().then(() => { if (!done && !fast && fx) { fx.setData(fxJson); fx.start(); } });
    fxRaf = requestAnimationFrame(fxFrame);
    raf = requestAnimationFrame((t) => { last = t; frame(t); });
  });
}

export function clearBattle(boardEl) {
  const old = boardEl.querySelector(':scope > .tt-bt');
  if (old) old.remove();
}

// 戰鬥播放（SPEC 5.6）：照 Result.events 的 t 排程，不重算任何戰鬥邏輯。
// playBattle(boardEl, result, opts) -> Promise<void>
//   opts: { speed:1|2|4（預設 2）, onEvent(ev, api), skip:AbortSignal,
//           spriteIndex(key)->0..99（頭像在 champions.webp 的格序，沒給就顯示中文名第一個字）,
//           spriteUrl（預設 '../icons/s19/champions.webp'）, noEndSound:bool }
// 另外匯出 setBattleSpeed(n)、getBattleSpeed()，戰鬥中可隨時改速度。
import { sfx } from '../audio.js';

const TICK_MS = 50;
const ROW_H = 0.866;
let speed = 2;
export function setBattleSpeed(n) { if (n === 1 || n === 2 || n === 4) speed = n; }
export function getBattleSpeed() { return speed; }

const CSS = ''; // 整合：樣式已搬進 trials.css（U3 區）

function injectCss() {
  return CSS; // 整合：不再注入 <style>
}

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

export function playBattle(boardEl, result, opts = {}) {
  injectCss();
  if (opts.speed) setBattleSpeed(opts.speed);
  else if (!opts.__keep) speed = 2;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const events = result.events || [];

  const old = boardEl.querySelector(':scope > .tt-bt');
  if (old) old.remove();
  if (getComputedStyle(boardEl).position === 'static') boardEl.style.position = 'relative';
  const root = el('div', 'tt-bt' + (reduced ? ' tt-bt-rm' : ''));
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'tt-bt-svg');
  root.appendChild(svg);
  boardEl.appendChild(root);

  let W = 0, w = 0;
  const U = new Map();   // id -> state

  function layout() {
    W = boardEl.clientWidth || 390;
    w = W / 7.5;
    root.style.setProperty('--tt-w', w + 'px');
    root.style.height = (w * (7 * ROW_H + 1)) + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${w * (7 * ROW_H + 1)}`);
  }
  const hexXY = (h) => ({ x: (h.col + 0.5 * (h.row & 1)) * w + w / 2, y: h.row * ROW_H * w + w / 2 });
  const place = (u, ms) => {
    const p = hexXY(u.hex);
    u.node.style.transitionDuration = (reduced || !ms ? 0 : ms) + 'ms';
    u.node.style.transform = `translate(${p.x - w / 2}px,${p.y - w / 2}px)`;
  };
  const center = (u) => hexXY(u.hex);

  function makeUnit(d) {
    const u = { id: d.id, side: d.side, key: d.key, hex: { row: d.hex.row, col: d.hex.col }, hpMax: d.hpMax || 1, hp: d.hpMax || 1, shield: 0, manaMax: d.manaMax || 0, mana: 0, alive: true, st: new Map() };
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
    u.stars.textContent = '★'.repeat(Math.max(1, d.star || 1));
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
  for (const d of (result.units || [])) makeUnit(d);
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => { layout(); for (const u of U.values()) place(u, 0); });
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
  function line(p1, p2, color, ms, width) {
    if (reduced || fast) return;
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', p1.x); l.setAttribute('y1', p1.y); l.setAttribute('x2', p2.x); l.setAttribute('y2', p2.y);
    l.setAttribute('stroke', color); l.setAttribute('stroke-width', width || 3); l.setAttribute('stroke-linecap', 'round');
    svg.appendChild(l);
    setTimeout(() => l.remove(), ms);
  }
  const resolvePt = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') { const u = U.get(v); return u ? center(u) : null; }
    if (v.row != null) return hexXY(v);
    return null;
  };
  function ring(p, ms) {
    if (reduced || fast || !p) return;
    const r = el('div', 'tt-bt-ring', root);
    r.style.left = p.x + 'px'; r.style.top = p.y + 'px';
    anim(r, [{ opacity: 1 }, { opacity: 0 }], ms, () => r.remove());
    if (!r.getAnimations || !r.getAnimations().length) setTimeout(() => r.remove(), ms + 50);
  }
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
  let fast = false;   // 跳過時：只更新狀態，不做動畫與音效
  const snd = (n) => { if (!fast) sfx(n); };
  function handle(ev) {
    const u = U.get(ev.id);
    switch (ev.e) {
      case 'move':
        if (u) { u.hex = { row: ev.to.row, col: ev.to.col }; place(u, fast ? 0 : (ev.dur || 0) * TICK_MS / speed); }
        break;
      case 'atk': {
        const t = U.get(ev.tgt);
        if (ev.ranged) { if (u && t) line(center(u), center(t), '#ffe9a8', 120, 2); }
        else lunge(u, t, 160);
        break;
      }
      case 'dmg':
        if (u) {
          u.hp = ev.hp; u.shield = ev.shield || 0; bars_(u);
          floatNum(u, ev.amt, TYPE_CLS[ev.type] || 'tt-bt-n-p', ev.crit);
          if (ev.tag === 'atk') snd('hit');
        }
        break;
      case 'heal':
        if (u) { u.hp = ev.hp; bars_(u); floatNum(u, ev.amt, 'tt-bt-n-h'); }
        break;
      case 'shield':
        if (u) { u.shield = ev.shield; bars_(u); floatNum(u, ev.amt, 'tt-bt-n-s'); }
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
        }
        break;
      case 'fx': {
        const a = resolvePt(ev.from), b = resolvePt(ev.to);
        if (ev.kind === 'aoe' || ev.kind === 'cone') {
          if (Array.isArray(ev.hexes) && ev.hexes.length) ev.hexes.slice(0, 20).forEach((h) => ring(hexXY(h), 350));
          else ring(b || a, 350);
        } else if (a && b) line(a, b, ev.kind === 'beam' ? '#9ad0ff' : '#ffd0a0', ev.kind === 'proj' ? 200 : 250, ev.kind === 'beam' ? 6 : 3);
        break;
      }
      case 'status':
        if (u) setStatus(u, ev.kind, ev.on);
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
        }
        break;
      case 'end':
        break;
    }
  }

  // ---------- 排程 ----------
  return new Promise((resolve) => {
    let i = 0, vt = 0, last = performance.now(), raf = 0, done = false;
    const endEv = events.find((e) => e.e === 'end');
    const winner = endEv ? endEv.winner : result.winner;

    function finish(instant) {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
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
      for (const n of root.querySelectorAll('.tt-bt-num,.tt-bt-cast,.tt-bt-ring')) n.remove();
      svg.textContent = '';
      finish(true);
    }
    if (opts.skip) {
      if (opts.skip.aborted) { onAbort(); return; }
      opts.skip.addEventListener('abort', onAbort);
    }

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
    raf = requestAnimationFrame((t) => { last = t; frame(t); });
  });
}

export function clearBattle(boardEl) {
  const old = boardEl.querySelector(':scope > .tt-bt');
  if (old) old.remove();
}

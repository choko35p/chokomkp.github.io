// 戰鬥特效舞台（SPEC_ABILITY_FX 第 4 章）：兩張 canvas（地面層、空中層）＋粒子池＋投射物＋場上物件。
// 只負責「畫」：不重算任何戰鬥，不碰引擎。畫面用的亂數都在這裡（rnd），跟戰鬥亂數無關。
// 上限：粒子 150（手機寬 ≤600px 用 80）、投射物 40、場上物件 24、一次性特效 24；超過就丟最舊的（投射物／物件不丟，改畫簡單圓點）。
import { getShake, getQuality, reducedMotion, isPhone } from './settings.js';

const TAU = Math.PI * 2;
const rnd = Math.random;   // 只影響畫面
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// ---------- 顏色 ----------
const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  let h = String(hex || '#ffd24a').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}
export const css = (hex, a) => { const [r, g, b] = rgb(hex); return a == null || a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a < 0 ? 0 : a})`; };
export function mix(a, b, t) { const x = rgb(a), y = rgb(b); return '#' + [0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join(''); }
const glowCache = new Map();
function glowSprite(hex) {
  let g = glowCache.get(hex);
  if (g) return g;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, css(hex, 1)); gr.addColorStop(0.35, css(hex, 0.55)); gr.addColorStop(1, css(hex, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowCache.set(hex, c);
  return c;
}
function glow(c, x, y, r, hex, a) { if (r <= 0.5) return; c.globalAlpha = clamp(a, 0, 1); c.drawImage(glowSprite(hex), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }

// ---------- 投射物圖形 ----------
const BASE = { orb: 'orb', ball: 'orb', pinball: 'orb', moon: 'orb', prism: 'orb', heart: 'heart', bolt: 'bolt', bullet: 'bolt', laser: 'bolt', spike: 'bolt', spear: 'bolt', arrow: 'bolt', blade: 'bolt',
  disc: 'disc', card: 'card', bomb: 'bomb', rocket: 'bomb', missile: 'bomb', mushroom: 'bomb', snack: 'bomb', rock: 'rock', feather: 'feather', ribbon: 'feather', note: 'note',
  wave: 'wave', gust: 'wave', dragon: 'wave', web: 'web', spirit: 'spirit', clone: 'clone' };

function drawHeart(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y, x - s * 0.7, y - s * 1.1, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9);
  c.closePath(); c.fill();
}

export function createStage(root, env) {
  const under = document.createElement('canvas'), over = document.createElement('canvas');
  under.className = 'tt-bt-fx tt-bt-fx-under'; over.className = 'tt-bt-fx tt-bt-fx-over';
  under.setAttribute('aria-hidden', 'true'); over.setAttribute('aria-hidden', 'true');
  root.prepend(under); root.appendChild(over);
  const cu = under.getContext('2d'), co = over.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const S = { under, over, now: 0, level: 0, enabled: true, reduced: reducedMotion() };

  const limits = () => ({ part: isPhone() ? 80 : 150, proj: 40, obj: 24, fx: 24 });
  let LIM = limits();
  const P = Array.from({ length: 150 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 1, size: 3, col: '#fff', shape: 0, rot: 0, vr: 0, drag: 0, add: true }));
  let pLive = 0, pCur = 0;
  const fxs = [], objs = [], projs = [], timers = [];
  let drewLast = false;

  S.resize = () => {
    W = env.W(); H = env.H();
    dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    for (const cv of [under, over]) { cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr)); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    cu.setTransform(dpr, 0, 0, dpr, 0, 0); co.setTransform(dpr, 0, 0, dpr, 0, 0);
    LIM = limits();
  };
  S.resize();

  // 品質：高／低＋自動降級（level 1：關拖尾、粒子減半；level 2：只留投射物、場上物件、地面、光束）
  const eff = () => Math.max(S.level, getQuality() === 'low' ? 1 : 0);
  S.eff = eff;
  S.cnt = (n) => { const e = eff(); const sp = env.speed() >= 4 ? 0.5 : 1; return Math.max(1, Math.round(n * (e >= 1 ? 0.5 : 1) * sp)); };
  S.trailOn = () => !S.reduced && eff() === 0 && env.speed() < 4;
  const ESS = new Set(['proj', 'ground', 'beam', 'zone', 'roller', 'telegraph', 'chan', 'obj']);
  const RM = new Set(['proj', 'ground', 'beam', 'telegraph', 'zone', 'roller']);   // 減少動態時只留靜態、看得懂的
  S.allow = (name) => S.enabled && (S.reduced ? RM.has(name) : (eff() < 2 || ESS.has(name)));
  S.slow = () => (env.speed() >= 4 ? 0.5 : 1);   // 4 倍速：一次性特效時間除以 2

  // ---------- 粒子 ----------
  S.part = (x, y, vx, vy, o) => {
    if (S.reduced || !S.enabled) return false;
    if (pLive >= LIM.part) return false;
    for (let k = 0; k < P.length; k++) {
      const p = P[(pCur + k) % P.length];
      if (p.on) continue;
      pCur = (pCur + k + 1) % P.length;
      p.on = true; pLive++;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.age = 0; p.life = o.life || 500; p.size = o.size || 3; p.col = o.col || '#fff';
      p.shape = o.shape || 0; p.rot = o.rot || 0; p.vr = o.vr || 0; p.g = o.g || 0; p.drag = o.drag || 0; p.add = o.add !== false;
      return true;
    }
    return false;
  };
  S.partCount = () => pLive;

  // ---------- 計時 ----------
  S.after = (ms, fn) => { if (ms <= 0) { fn(); return; } timers.push({ at: S.now + ms, fn }); };

  // ---------- 一次性特效 ----------
  S.add = (layer, dur, draw, extra) => {
    if (!S.enabled) return null;
    const e = Object.assign({ layer, t0: S.now, dur: Math.max(30, dur), draw }, extra);
    if (fxs.length >= LIM.fx) fxs.shift();
    fxs.push(e);
    return e;
  };
  S.addObj = (o) => {
    if (!S.enabled) return null;
    if (objs.length >= LIM.obj) { const i = objs.findIndex((x) => !x.keep); objs.splice(i < 0 ? 0 : i, 1); }
    o.t0 = S.now; o.on = true; objs.push(o); return o;
  };
  S.removeObj = (o) => { if (o) o.on = false; };
  S.objs = () => objs;

  // 投射物：simple＝降級成圓點（不畫拖尾）
  S.proj = (o) => {
    if (!S.enabled) { if (o.arrive) o.arrive(); return null; }
    if (projs.length >= LIM.proj) { const old = projs.shift(); if (old && old.arrive) old.arrive(); }
    o.t0 = S.now; o.on = true; o.tr = o.tr || []; projs.push(o); return o;
  };

  S.clear = () => {
    for (const p of P) p.on = false; pLive = 0;
    fxs.length = 0; objs.length = 0; projs.length = 0; timers.length = 0;
    cu.clearRect(0, 0, W, H); co.clearRect(0, 0, W, H); drewLast = false;
  };
  S.projN = () => projs.length;
  S.busy = () => fxs.length + objs.length + projs.length + pLive + timers.length;

  // ---------- 逐幀 ----------
  let fAcc = 0, fN = 0;
  S.step = (dtReal) => {
    const dt = Math.min(dtReal, 64);
    if (dtReal > 0) {   // 連續 30 幀平均超過 22ms：降一級
      fAcc += dtReal; fN++;
      if (fN >= 30) { if (fAcc / fN > 22 && S.level < 2) S.level++; fAcc = 0; fN = 0; }
    }
    S.now += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= S.now) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
    // 物理
    for (const p of P) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; pLive--; continue; }
      const s = dt / 1000;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * s); p.vx *= k; p.vy *= k; }
      p.vy += p.g * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
    }
    for (let i = fxs.length - 1; i >= 0; i--) if (S.now - fxs[i].t0 >= fxs[i].dur) { const e = fxs[i]; fxs.splice(i, 1); if (e.done) e.done(); }
    for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if (!o.on || (o.until && S.now >= o.until)) { objs.splice(i, 1); if (o.done) o.done(o); } }
    for (let i = projs.length - 1; i >= 0; i--) {
      const q = projs[i], p = (S.now - q.t0) / q.dur;
      const tp = q.follow ? env.pos(q.follow) : null;
      if (tp) { q.x1 = tp.x; q.y1 = tp.y; }
      if (q.on) {
        const k = clamp(p, 0, 1);
        q.x = lerp(q.x0, q.x1, k); q.y = lerp(q.y0, q.y1, k);
        if (q.arc) q.h = Math.sin(Math.PI * k) * Math.min(Math.hypot(q.x1 - q.x0, q.y1 - q.y0) * 0.45, env.w() * 2.4);
        else q.h = 0;
        if (S.trailOn()) { q.tr.push(q.x, q.y - q.h); if (q.tr.length > 14) q.tr.splice(0, 2); }
      }
      if (p >= 1 || !q.on) { projs.splice(i, 1); q.on = false; if (q.arrive) { try { q.arrive(); } catch (e) { console.error(e); } } }
    }
    for (const o of objs) if (o.upd) o.upd(o, dt, S.now);
    S.draw();
  };

  S.draw = () => {
    const any = fxs.length || objs.length || projs.length || pLive;
    if (!any) { if (drewLast) { cu.clearRect(0, 0, W, H); co.clearRect(0, 0, W, H); drewLast = false; } return; }
    drewLast = true;
    cu.clearRect(0, 0, W, H); co.clearRect(0, 0, W, H);
    for (const o of objs) if (o.drawU) { cu.save(); o.drawU(cu, o, S.now); cu.restore(); }
    for (const e of fxs) if (e.layer === 'u') { cu.save(); e.draw(cu, clamp((S.now - e.t0) / e.dur, 0, 1), e); cu.restore(); }
    for (const e of fxs) if (e.layer === 'o') { co.save(); e.draw(co, clamp((S.now - e.t0) / e.dur, 0, 1), e); co.restore(); }
    for (const o of objs) if (o.drawO) { co.save(); o.drawO(co, o, S.now); co.restore(); }
    for (const q of projs) { co.save(); drawProj(co, q); co.restore(); }
    // 粒子
    if (pLive) {
      co.globalCompositeOperation = 'lighter';
      for (const p of P) {
        if (!p.on) continue;
        const k = p.age / p.life, a = 1 - k * k;
        if (p.shape === 0) glow(co, p.x, p.y, p.size * (1.6 - k * 0.6), p.col, a);
        else {
          co.globalAlpha = clamp(a, 0, 1); co.fillStyle = css(p.col); co.strokeStyle = css(p.col);
          if (p.shape === 1) { co.lineWidth = Math.max(1, p.size * 0.5); co.beginPath(); co.moveTo(p.x, p.y); co.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); co.stroke(); }
          else if (p.shape === 2) { co.save(); co.translate(p.x, p.y); co.rotate(p.rot); co.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); co.restore(); }
          else if (p.shape === 3) { co.globalCompositeOperation = 'source-over'; drawHeart(co, p.x, p.y, p.size * 0.7); co.globalCompositeOperation = 'lighter'; }
          else if (p.shape === 4) { co.save(); co.translate(p.x, p.y); co.rotate(p.rot); co.beginPath(); co.ellipse(0, 0, p.size * 0.9, p.size * 0.4, 0, 0, TAU); co.fill(); co.restore(); }
          else if (p.shape === 5) { co.globalCompositeOperation = 'source-over'; co.font = `700 ${Math.round(p.size * 3)}px sans-serif`; co.textAlign = 'center'; co.textBaseline = 'middle'; co.fillText('+', p.x, p.y); co.globalCompositeOperation = 'lighter'; }
          co.globalAlpha = 1;
        }
      }
      co.globalCompositeOperation = 'source-over';
    }
  };

  function drawProj(c, q) {
    const w = env.w(), x = q.x, y = q.y - (q.h || 0);
    const simple = !q.full && (eff() >= 2 || projs.length > 30);
    if (q.arc && q.h > 1) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, q.y + w * 0.12, w * 0.16, w * 0.07, 0, 0, TAU); c.fill(); }
    const col = q.col || '#ffd24a', col2 = q.col2 || '#fff';
    if (simple) { c.fillStyle = css(col); c.beginPath(); c.arc(x, y, w * 0.08 * (q.sz || 1), 0, TAU); c.fill(); return; }
    if (q.tr.length >= 4 && S.trailOn()) {
      c.lineCap = 'round'; c.strokeStyle = css(col, 0.5);
      for (let i = 2; i < q.tr.length; i += 2) { c.globalAlpha = i / q.tr.length * 0.7; c.lineWidth = w * 0.13 * (q.sz || 1) * (i / q.tr.length); c.beginPath(); c.moveTo(q.tr[i - 2], q.tr[i - 1]); c.lineTo(q.tr[i], q.tr[i + 1]); c.stroke(); }
      c.globalAlpha = 1;
    }
    const ang = Math.atan2(q.y1 - q.y0, q.x1 - q.x0) + (q.arc ? Math.cos(Math.PI * clamp((S.now - q.t0) / q.dur, 0, 1)) * -0.5 * (q.x1 >= q.x0 ? 1 : -1) * 0 : 0);
    const spin = (S.now - q.t0) / 90;
    drawShape(c, q.base || 'orb', x, y, w * 0.2 * (q.sz || 1), col, col2, ang, spin, q);
  }

  function drawShape(c, base, x, y, s, col, col2, ang, spin, q) {
    switch (base) {
      case 'orb': glow(c, x, y, s * 2.6, col, 0.9); c.fillStyle = css(col2); c.beginPath(); c.arc(x, y, s * 0.55, 0, TAU); c.fill(); break;
      case 'heart': glow(c, x, y, s * 2.4, col, 0.7); c.fillStyle = css(col); drawHeart(c, x, y, s * 0.9); break;
      case 'bolt': {
        c.save(); c.translate(x, y); c.rotate(ang); c.lineCap = 'round';
        glow(c, 0, 0, s * 2.2, col, 0.6);
        c.strokeStyle = css(col); c.lineWidth = s * 0.9; c.beginPath(); c.moveTo(-s * 1.7, 0); c.lineTo(s * 1.3, 0); c.stroke();
        c.strokeStyle = css(col2); c.lineWidth = s * 0.38; c.beginPath(); c.moveTo(-s * 1.2, 0); c.lineTo(s * 1.3, 0); c.stroke(); c.restore(); break;
      }
      case 'disc': case 'card': {
        c.save(); c.translate(x, y); c.rotate(spin);
        if (base === 'card') { c.fillStyle = '#fff'; c.strokeStyle = css(col); c.lineWidth = 2; c.fillRect(-s * 0.7, -s, s * 1.4, s * 2); c.strokeRect(-s * 0.7, -s, s * 1.4, s * 2); c.fillStyle = css(col); c.fillRect(-s * 0.3, -s * 0.5, s * 0.6, s); }
        else { c.scale(1, 0.55); glow(c, 0, 0, s * 2.2, col, 0.6); c.fillStyle = css(col); c.beginPath(); c.arc(0, 0, s * 1.25, 0, TAU); c.fill(); c.strokeStyle = css(col2); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, s * 0.75, 0, TAU); c.stroke(); }
        c.restore(); break;
      }
      case 'bomb': {
        c.fillStyle = '#23232e'; c.strokeStyle = css(col); c.lineWidth = 2; c.beginPath(); c.arc(x, y, s * 0.95, 0, TAU); c.fill(); c.stroke();
        const fx = x + Math.cos(ang + Math.PI) * s * 1.1, fy = y + Math.sin(ang + Math.PI) * s * 1.1;
        glow(c, fx, fy, s * (1.2 + rnd() * 0.5), '#ffb13a', 0.95); break;
      }
      case 'rock': {
        c.save(); c.translate(x, y); c.rotate(spin * 0.7); c.fillStyle = css(col); c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, r = s * (1.0 + 0.25 * Math.sin(i * 2.7)); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, TAU); c.fill(); c.restore(); break;
      }
      case 'feather': {
        c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = css(col); c.beginPath(); c.moveTo(-s * 1.6, 0); c.quadraticCurveTo(0, -s * 0.9, s * 1.6, 0); c.quadraticCurveTo(0, s * 0.9, -s * 1.6, 0); c.fill();
        c.strokeStyle = css(col2); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-s * 1.6, 0); c.lineTo(s * 1.4, 0); c.stroke(); c.restore(); break;
      }
      case 'note': {
        glow(c, x, y, s * 2.2, col, 0.5); c.save(); c.translate(x, y); c.rotate(Math.sin(spin) * 0.3); c.fillStyle = css(col2); c.font = `700 ${Math.round(s * 3.4)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♪', 0, 0); c.restore(); break;
      }
      case 'wave': {
        c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = css(col); c.lineCap = 'round';
        for (let i = 0; i < 3; i++) { c.globalAlpha = 1 - i * 0.28; c.lineWidth = s * (0.7 - i * 0.15); c.beginPath(); c.arc(-i * s * 0.9, 0, s * 1.5, -1.0, 1.0); c.stroke(); }
        c.restore(); break;
      }
      case 'web': {
        c.save(); c.translate(x, y); c.rotate(spin * 0.3); c.strokeStyle = css(col2); c.lineWidth = 1.3;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * s * 1.5, Math.sin(a) * s * 1.5); c.stroke(); }
        for (const r of [0.6, 1.1, 1.5]) { c.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU; c.lineTo(Math.cos(a) * s * r, Math.sin(a) * s * r); } c.stroke(); }
        c.restore(); break;
      }
      case 'spirit': { for (let i = 0; i < 4; i++) { const a = spin * 0.5 + i * TAU / 4; glow(c, x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9, s * 1.1, i % 2 ? col2 : col, 0.85); } glow(c, x, y, s * 1.4, col, 0.7); break; }
      case 'clone': { c.globalAlpha = 0.7; env.sprite(c, q && q.key, x, y, s * 1.5, 0.7); c.globalAlpha = 1; c.strokeStyle = css(col, 0.8); c.lineWidth = 2; c.beginPath(); c.arc(x, y, s * 1.5, 0, TAU); c.stroke(); break; }
      default: glow(c, x, y, s * 2, col, 0.9);
    }
  }
  S.baseOf = (shape) => BASE[shape] || 'orb';

  // ---------- 震動（DOM）----------
  S.shake = (power) => {
    if (S.reduced || !S.enabled || !getShake() || !env.shakeEl) return;
    const el = env.shakeEl(); if (!el || !el.animate) return;
    const a = [0, 2.4, 3.6, 5.4][clamp(power | 0, 1, 3)] * (env.w() / 52);   // 幅度小：1～3 級約 2～5px
    const ms = 110 + power * 30;
    el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-a}px,${a * 0.5}px)` }, { transform: `translate(${a}px,${-a * 0.6}px)` }, { transform: `translate(${-a * 0.6}px,${-a * 0.3}px)` }, { transform: `translate(${a * 0.3}px,${a * 0.2}px)` }, { transform: 'translate(0,0)' }], { duration: ms, easing: 'linear' });
  };

  S.cell = () => env.w();
  S.env = env;
  S.drawShape = drawShape;
  S.rnd = rnd;
  return S;
}

export { TAU, clamp, lerp, easeOut, rnd, glow, drawHeart };

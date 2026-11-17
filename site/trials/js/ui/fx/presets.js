// 特效預設（SPEC_ABILITY_FX 4.2）：trail、afterimage、burst、shockwave、ground、telegraph、beam、tether、slash、spin、cone、rain、aura、flash、morph、sweep、shake，
// 加上 hop、charge（蓄力）、shield／heal／stun／死亡等戰鬥基本演出。全部用 canvas 程式畫，不用圖檔。
import { css, mix, glow, TAU, clamp, lerp, easeOut, rnd } from './stage.js';

// 外觀名 → [主色, 輔色, 粒子形狀]（形狀：0 光點 1 火花線 2 方塊 3 愛心 4 花瓣 ）
export const SKIN = {
  fire: ['#ff7a1a', '#ffd23a', 1], ignite: ['#ff5a2a', '#ffe08a', 1], paint: ['#ff3fa8', '#3df2ff', 0], spray: ['#ff3fa8', '#c8ff3a', 0],
  sparkle: ['#fff3b0', '#ffd24a', 0], poison: ['#7bd34a', '#2f7a2a', 0], spore: ['#b9e66a', '#6b8f3a', 0], toxic: ['#7bd34a', '#3a8a2a', 0],
  petal: ['#ffc2dc', '#ff6fa8', 4], flowers: ['#ffc2dc', '#ff8fbd', 4], shards: ['#bfeaff', '#ffffff', 2], light: ['#fff6c0', '#ffe27a', 0], pixel: ['#3df2ff', '#ff3fa8', 2],
  mark: ['#ffe27a', '#ffffff', 0], shield: ['#bfe3ff', '#ffffff', 0], neon: ['#ff3fa8', '#3df2ff', 1], scissors: ['#e8f4ff', '#9ad0ff', 1], dragon: ['#ffcf3a', '#ff8a2a', 1],
  x: ['#ff5ad0', '#ffffff', 1], wind: ['#bfeaff', '#ffffff', 1], airslash: ['#bfeaff', '#ffffff', 1], hurricane: ['#d8f2ff', '#8ad0ff', 1], roar: ['#e8d8ff', '#a070ff', 0],
  soundwave: ['#8ad0ff', '#ffffff', 0], xslash: ['#ff5ad0', '#ffffff', 1], rage: ['#ff3a2a', '#ffb13a', 1], grow: ['#ffd24a', '#ffffff', 0], spider: ['#8b3fd9', '#f1e9ff', 0],
  shadow: ['#6a3fd0', '#1a1030', 0], demon: ['#c02a4a', '#2a0a14', 1], glow: ['#fff3b0', '#ffd24a', 0], spark: ['#ffe27a', '#ffffff', 1], hype: ['#ff7ad0', '#ffe27a', 0],
  party: ['#ff7ad0', '#3df2ff', 2], drain: ['#d02a4a', '#ff9ab0', 0], swords: ['#cfe8ff', '#ffffff', 1], holofists: ['#3df2ff', '#ffffff', 0], recordstack: ['#ffd24a', '#222', 2],
  blood: ['#d02a2a', '#ff8a8a', 0], soul: ['#7ad7ff', '#ffffff', 0], violin: ['#ffb36a', '#fff0d0', 0], hook: ['#c8d0d8', '#ffffff', 1], gem: ['#c070ff', '#ffffff', 2],
  sparkle2: ['#fff', '#ffd24a', 0], bandage: ['#f4e8c8', '#ffffff', 0], tentacle: ['#6a3fd0', '#c08aff', 0], claw: ['#ff5a2a', '#ffffff', 1], aurora: ['#7affc8', '#8a8aff', 0],
  beam: ['#9ad0ff', '#ffffff', 0], notes: ['#ffd0f0', '#ffffff', 0], rewind: ['#6ad0ff', '#ffffff', 0], flow: ['#ffb0e0', '#ffffff', 0], spirit: ['#9ad0ff', '#ffffff', 0],
  sweep: ['#ffe8b0', '#ffffff', 1], lash: ['#c070ff', '#ffffff', 1], vortex: ['#8ad0ff', '#ffffff', 0], stage: ['#ffd24a', '#ff7ad0', 0], speakers: ['#ff7ad0', '#ffffff', 0],
  gala: ['#ffd24a', '#ff7ad0', 0], wildgrowth: ['#7bd34a', '#c8ff8a', 4], tossback: ['#fff', '#ffd24a', 0],
};
export function pal(skin, c1, c2) { const s = SKIN[skin]; return s ? [s[0], s[1], s[2]] : [c1, c2 || '#fff', 0]; }

const A = (v, star) => (Array.isArray(v) ? v[Math.min(Math.max(star || 1, 1), v.length) - 1] : v);

export function makePresets(S) {
  const env = S.env, w = () => env.w();
  const R = (cells) => (cells + 0.5) * w() * 0.96;
  const pt = (a) => ({ x: a.x, y: a.y });

  function burst(a) {
    if (!S.allow('burst')) return;
    const [c1, c2, shape] = pal(a.skin, a.c1, a.c2);
    const n = S.cnt(a.n || (a.big ? 16 : a.small ? 6 : 10));
    const sp = w() * (a.big ? 5.5 : a.small ? 2.6 : 3.8) * (a.r ? 0.8 + a.r * 0.35 : 1);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * TAU, v = sp * (0.4 + rnd() * 0.7);
      const poison = a.skin === 'poison' || a.skin === 'spore' || a.skin === 'toxic';
      S.part(a.x, a.y, Math.cos(ang) * v, Math.sin(ang) * v - w() * 0.6, { life: 380 + rnd() * 320, size: (poison ? 5 : 3) + rnd() * 3, col: i % 2 ? c1 : c2, shape: shape === 0 ? (i % 3 ? 0 : 1) : shape, g: poison ? -w() * 0.8 : w() * 4.2, drag: 1.4, vr: (rnd() - 0.5) * 12 });
    }
    if (!S.reduced) S.add('o', 220, (c, p) => { glow(c, a.x, a.y, w() * (0.5 + p * (a.big ? 1.3 : 0.8)), c1, 0.8 * (1 - p)); });
  }
  function flash(a) {
    if (!S.allow('flash')) return;
    const [c1] = pal(a.skin, a.c1);
    S.add('o', 200, (c, p) => {
      const r = w() * (0.45 + p * 0.25);
      c.globalCompositeOperation = 'lighter';
      glow(c, a.x, a.y, r * 1.5, '#ffffff', (1 - p) * 0.9); glow(c, a.x, a.y, r * 2, c1, (1 - p) * 0.6);
      c.strokeStyle = css('#fff', 1 - p); c.lineWidth = 2; const L = w() * (0.2 + p * 0.45);
      c.beginPath(); c.moveTo(a.x - L, a.y); c.lineTo(a.x + L, a.y); c.moveTo(a.x, a.y - L); c.lineTo(a.x, a.y + L); c.stroke();
    });
  }
  function shockwave(a) {
    if (!S.allow('shockwave')) return;
    const r = R(A(a.r, a.star) || 1), [c1] = pal(a.skin, a.c1);
    S.add('o', 380 * S.slow(), (c, p) => {
      const k = easeOut(p);
      c.strokeStyle = css(c1, 1 - p); c.lineWidth = (a.thin ? 2 : 4) * (1 - p) + 1; c.beginPath(); c.ellipse(a.x, a.y, r * k, r * k * 0.82, 0, 0, TAU); c.stroke();
      if (!a.thin) { c.strokeStyle = css('#fff', (1 - p) * 0.7); c.lineWidth = 1.5; c.beginPath(); c.ellipse(a.x, a.y, r * k * 0.82, r * k * 0.82 * 0.82, 0, 0, TAU); c.stroke(); }
    });
    S.add('u', 380 * S.slow(), (c, p) => { c.fillStyle = css(c1, 0.22 * (1 - p)); c.beginPath(); c.ellipse(a.x, a.y, r * easeOut(p), r * easeOut(p) * 0.82, 0, 0, TAU); c.fill(); });
  }
  // 地面色塊：circle／line／row；persist＝留到物件被移除（回傳物件）
  function ground(a) {
    if (!S.allow('ground')) return null;
    const [c1, c2] = pal(a.skin, a.c1, a.c2);
    const shape = a.shape || 'circle', r = R(A(a.r, a.star) || 1), dur = (A(a.dur, a.star) || 0.8) * 1000;
    const draw = (c, alpha, tt) => {
      c.fillStyle = css(c1, 0.28 * alpha); c.strokeStyle = css(c2, 0.8 * alpha); c.lineWidth = 2;
      if (shape === 'circle') { c.beginPath(); c.ellipse(a.x, a.y, r, r * 0.82, 0, 0, TAU); c.fill(); c.stroke(); }
      else if (shape === 'row') { const h = w() * 0.55; c.fillRect(0, a.y - h / 2, env.W(), h); c.strokeRect(0, a.y - h / 2, env.W(), h); }
      else {   // line：從 (x,y) 朝 (tx,ty) 延伸
        const ang = Math.atan2(a.ty - a.y, a.tx - a.x), L = (a.len || 4) * w(), hw = (a.width || 1) * w() * 0.32;
        c.save(); c.translate(a.x, a.y); c.rotate(ang); c.fillRect(0, -hw, L, hw * 2); c.strokeRect(0, -hw, L, hw * 2); c.restore();
      }
      if (a.skin === 'ignite' || a.skin === 'fire') { c.globalCompositeOperation = 'lighter'; glow(c, a.x, a.y, r * 0.9, c1, 0.5 * alpha * (0.6 + 0.4 * Math.sin(tt / 60))); }
    };
    if (a.persist) { const o = S.addObj({ keep: true, drawU: (c, o2, now) => draw(c, 0.9, now) }); return o; }
    S.add('u', dur, (c, p) => draw(c, p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1, S.now));
    return null;
  }
  function telegraph(a) {
    if (!S.allow('telegraph')) return;
    const r = R(A(a.r, a.star) || 1), [c1] = pal(a.skin, a.c1), n = A(a.n, a.star) || 1;
    S.add('u', (A(a.dur, a.star) || 0.5) * 1000, (c, p) => {
      c.setLineDash([7, 6]); c.lineDashOffset = -S.now / 40; c.strokeStyle = css(c1, S.reduced ? 0.8 : 0.5 + 0.4 * Math.abs(Math.sin(p * 9))); c.lineWidth = 2.5;
      for (let i = 0; i < n; i++) { const o = n > 1 ? (i - (n - 1) / 2) * w() * 1.1 : 0; c.beginPath(); c.ellipse(a.x + o, a.y, r, r * 0.82, 0, 0, TAU); c.stroke(); }
    });
  }
  function beam(a) {
    if (!S.allow('beam')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (A(a.dur, a.star) || 0.35) * 1000;
    const wide = a.wide ? 1.7 : a.thin ? 0.5 : 1;
    S.add('o', dur, (c, p) => {
      let x1 = a.tx, y1 = a.ty;
      if (a.fromId) { const q = env.pos(a.fromId); if (q) { a.x = q.x; a.y = q.y; } }
      if (a.toId) { const q = env.pos(a.toId); if (q) { x1 = q.x; y1 = q.y; } }
      if (a.along) { const L = Math.hypot(x1 - a.x, y1 - a.y) || 1, k = (a.len ? a.len * w() : env.W()) / L; x1 = a.x + (x1 - a.x) * k; y1 = a.y + (y1 - a.y) * k; }
      const pulse = S.reduced ? 1 : 0.8 + 0.2 * Math.sin(S.now / 45), fade = p < 0.12 ? p / 0.12 : p > 0.75 ? (1 - p) / 0.25 : 1;
      c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      c.strokeStyle = css(c1, 0.35 * fade); c.lineWidth = w() * 0.55 * wide * pulse; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = css(c1, 0.9 * fade); c.lineWidth = w() * 0.2 * wide * pulse; c.stroke();
      c.strokeStyle = css(c2 === c1 ? '#fff' : '#ffffff', fade); c.lineWidth = w() * 0.07 * wide; c.stroke();
      glow(c, a.x, a.y, w() * 0.45 * wide, c1, 0.8 * fade); glow(c, x1, y1, w() * 0.4 * wide, c1, 0.7 * fade);
    });
  }
  // 連線：兩個單位間（會跟著移動），可有流動光點
  function tether(a) {
    if (!S.allow('beam')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (a.dur || 0.5) * 1000;
    S.add('o', dur, (c, p) => {
      const q0 = a.fromId ? env.pos(a.fromId) : { x: a.x, y: a.y }, q1 = a.toId ? env.pos(a.toId) : { x: a.tx, y: a.ty };
      if (!q0 || !q1) return;
      const fade = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1;
      c.strokeStyle = css(c1, 0.7 * fade); c.lineWidth = 2.5; c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      const mx = (q0.x + q1.x) / 2, my = (q0.y + q1.y) / 2 - Math.hypot(q1.x - q0.x, q1.y - q0.y) * 0.12;
      c.beginPath(); c.moveTo(q0.x, q0.y); c.quadraticCurveTo(mx, my, q1.x, q1.y); c.stroke();
      if (!S.reduced) for (let i = 0; i < 4; i++) { const k = ((S.now / 380) + i / 4) % 1, x = (1 - k) * (1 - k) * q0.x + 2 * k * (1 - k) * mx + k * k * q1.x, y = (1 - k) * (1 - k) * q0.y + 2 * k * (1 - k) * my + k * k * q1.y; glow(c, x, y, w() * 0.16, c2, 0.9 * fade); }
    });
  }
  function slash(a) {
    if (!S.allow('slash')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), n = A(a.n, a.star) || 1;
    const big = a.big || a.heavy ? 1.55 : 1;
    for (let i = 0; i < n; i++) {
      S.after(i * 90 * S.slow(), () => S.add('o', 240 * S.slow(), (c, p) => {
        const r = w() * 0.62 * big, k = easeOut(clamp(p * 1.5, 0, 1));
        c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
        if (a.shape === 'row') {
          const x0 = 0, x1 = env.W() * k; c.strokeStyle = css(c1, 1 - p); c.lineWidth = w() * 0.28 * (1 - p) + 2; c.beginPath(); c.moveTo(x0, a.y); c.lineTo(x1, a.y); c.stroke();
          c.strokeStyle = css('#fff', 1 - p); c.lineWidth = 2; c.stroke(); return;
        }
        const base = (a.ang != null ? a.ang : -0.6) + (i % 2 ? 0.9 : -0.9) * 0.5 + (i ? Math.PI * 0.5 * i : 0);
        const a0 = base - 1.25, a1 = a0 + 2.5 * k;
        for (let j = 0; j < 3; j++) { c.strokeStyle = j === 2 ? css('#ffffff', (1 - p)) : css(j ? c2 : c1, (1 - p) * (j ? 0.7 : 0.5)); c.lineWidth = (j === 0 ? 0.3 : j === 1 ? 0.14 : 0.05) * w() * (a.heavy ? 1.4 : 1) * (1 - p * 0.5); c.beginPath(); c.arc(a.x, a.y, r, a0, a1); c.stroke(); }
        if (a.heavy) { c.strokeStyle = css(c1, (1 - p) * 0.6); c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, r * 0.7, a0 + 0.4, a1 - 0.2); c.stroke(); }
      }));
    }
  }
  function spin(a) {
    if (!S.allow('spin')) return;
    const r = R(A(a.r, a.star) || 1) * 0.72, [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (A(a.dur, a.star) || 0.35) * 1000;
    S.add('o', dur, (c, p) => {
      const q = a.id ? env.pos(a.id) : { x: a.x, y: a.y }; if (!q) return;
      const rot = p * TAU * 2.2, fade = p > 0.7 ? (1 - p) / 0.3 : 1;
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const b = rot + i * TAU / 3; c.strokeStyle = css(i % 2 ? c2 : c1, fade * 0.9); c.lineWidth = w() * 0.16; c.beginPath(); c.arc(q.x, q.y, r, b, b + 1.1); c.stroke(); c.strokeStyle = css('#fff', fade); c.lineWidth = 2; c.stroke(); }
    });
  }
  function cone(a) {
    if (!S.allow('cone')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), r = R(A(a.r, a.star) || 2), wide = a.wide ? 1.25 : 0.8;
    const ang = Math.atan2(a.ty - a.y, a.tx - a.x), dur = (a.dur || 0.4) * 1000 * S.slow();
    S.add('u', dur, (c, p) => {
      const k = easeOut(clamp(p * 1.6, 0, 1));
      c.fillStyle = css(c1, 0.35 * (1 - p)); c.strokeStyle = css(c2, 0.8 * (1 - p)); c.lineWidth = 2;
      c.beginPath(); c.moveTo(a.x, a.y); c.arc(a.x, a.y, r * k, ang - wide, ang + wide); c.closePath(); c.fill(); c.stroke();
    });
    S.add('o', dur, (c, p) => { c.globalCompositeOperation = 'lighter'; const k = easeOut(clamp(p * 1.6, 0, 1)); c.strokeStyle = css('#fff', (1 - p) * 0.8); c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, r * k, ang - wide, ang + wide); c.stroke(); });
  }
  function rain(a) {
    if (!S.allow('rain')) return;
    const n = Math.min(A(a.n, a.star) || 6, S.eff() ? 8 : 14), r = R(A(a.r, a.star) || 2), [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (A(a.dur, a.star) || 0.6) * 1000;
    for (let i = 0; i < n; i++) {
      const tx = a.x + (rnd() - 0.5) * r * 1.7, ty = a.y + (rnd() - 0.5) * r * 1.2, d0 = (i / n) * dur * 0.7, fall = 260;
      S.after(d0, () => S.proj({ x0: tx + 12, y0: -w() * 0.5, x1: tx, y1: ty, dur: fall, col: c1, col2: c2, base: a.shape === 'note' ? 'note' : a.shape === 'pillar' || a.shape === 'blade' ? 'bolt' : 'bolt', sz: 1.1, full: false, arc: false,
        arrive: () => { burst({ x: tx, y: ty, c1, c2, small: true, n: 4 }); } }));
    }
  }
  function aura(a) {
    if (!S.allow('obj')) return null;
    const [c1, c2, shape] = pal(a.skin, a.c1, a.c2), dur = a.dur ? A(a.dur, a.star) * 1000 : 900;
    return S.addObj({ id: a.id, until: S.now + dur, drawO: (c, o, now) => {
      const q = env.pos(a.id); if (!q) return;
      const t = (now - o.t0) / dur, fade = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
      c.globalCompositeOperation = 'lighter';
      const rr = w() * (0.46 + (a.pulse ? 0.08 * Math.sin(now / 90) : 0));
      c.strokeStyle = css(c1, 0.75 * fade); c.lineWidth = 2.5; c.beginPath(); c.ellipse(q.x, q.y + w() * 0.08, rr, rr * 0.85, 0, 0, TAU); c.stroke();
      if (S.reduced) return;
      const m = S.eff() ? 2 : 3;
      for (let i = 0; i < m; i++) { const ang = now / 300 + i * TAU / m; const x = q.x + Math.cos(ang) * rr, y = q.y + Math.sin(ang) * rr * 0.85; if (shape === 1) { c.strokeStyle = css(c2, fade); c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang + 1.57) * 8, y + Math.sin(ang + 1.57) * 8); c.stroke(); } else glow(c, x, y, w() * 0.14, c2, fade); }
    } });
  }
  // morph：頭像放大／縮扁／換外框色。skin 決定顏色；dur 沒給＝永久（回傳不還原）
  function morph(a) {
    const [c1] = pal(a.skin, a.c1), node = env.unitNode(a.id); if (!node) return;
    const av = node.querySelector('.tt-bt-av');
    S.add('o', 420, (c, p) => { const q = env.pos(a.id); if (!q) return; c.globalCompositeOperation = 'lighter'; glow(c, q.x, q.y, w() * (0.5 + p * 0.7), c1, (1 - p) * 0.9); c.strokeStyle = css(c1, 1 - p); c.lineWidth = 3; c.beginPath(); c.arc(q.x, q.y, w() * (0.3 + p * 0.6), 0, TAU); c.stroke(); });
    if (S.reduced || !av || !av.animate) { if (av) av.style.setProperty('--tt-morph', c1); return; }
    const big = a.skin === 'grow' || a.skin === 'rage' || a.skin === 'dragon' || a.skin === 'demon' ? 1.2 : 1.12;
    node.querySelector('.tt-bt-in').animate([{ scale: 1 }, { scale: big * 1.12, offset: 0.4 }, { scale: big }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
    av.style.boxShadow = `0 0 0 2px ${c1}, 0 0 10px ${css(c1, 0.9)}`; av.style.borderColor = c1;
    if (a.dur) setTimeout(() => { av.style.boxShadow = ''; av.style.borderColor = ''; const inn = node.querySelector('.tt-bt-in'); if (inn && inn.animate) inn.animate([{ scale: big }, { scale: 1 }], { duration: 250, fill: 'forwards' }); }, A(a.dur, a.star) * 1000 / (env.speed() || 1));
  }
  function sweep(a) {
    if (!S.allow('sweep')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (a.dur || 0.7) * 1000 * S.slow(), Wd = env.W(), Hd = env.H();
    const dir = a.dir || (a.skin === 'xslash' ? 'x' : 'h');
    S.add('o', dur, (c, p) => {
      c.globalCompositeOperation = 'lighter'; const al = 0.35 * Math.sin(p * Math.PI);   // 最高 35%
      if (dir === 'x') { c.strokeStyle = css(c1, al * 2); c.lineWidth = w() * 0.3; c.lineCap = 'round'; const k = easeOut(p); for (const f of [1, -1]) { c.beginPath(); c.moveTo(f > 0 ? 0 : Wd, 0); c.lineTo(f > 0 ? Wd * k : Wd * (1 - k), Hd * k); c.stroke(); } return; }
      const x = lerp(-Wd * 0.3, Wd * 1.1, p), g = c.createLinearGradient(x - Wd * 0.3, 0, x + Wd * 0.05, 0);
      g.addColorStop(0, css(c1, 0)); g.addColorStop(0.7, css(c1, al)); g.addColorStop(1, css(c2, al * 1.2));
      c.fillStyle = g; c.fillRect(0, 0, Wd, Hd);
    });
  }
  function hop(a) {
    const node = env.unitNode(a.id); if (!node || S.reduced || !node.animate) return;
    const inn = node.querySelector('.tt-bt-in'); inn.animate([{ translate: '0 0' }, { translate: `0 ${-w() * 0.35}px`, offset: 0.45 }, { translate: '0 0' }], { duration: 300, easing: 'ease-out' });
  }
  // 蓄力：光點往施法者收攏（施法前搖 0.5 秒）
  function charge(a) {
    if (!S.allow('burst')) return;
    const n = S.cnt(8), q = a.id;
    for (let i = 0; i < n; i++) S.after(i * 45, () => { const p0 = env.pos(q); if (!p0) return; const ang = rnd() * TAU, d = w() * 0.9, s = w() * 2.6; S.part(p0.x + Math.cos(ang) * d, p0.y + Math.sin(ang) * d, -Math.cos(ang) * s, -Math.sin(ang) * s, { life: 330, size: 3, col: i % 2 ? a.c1 : a.c2 || '#fff' }); });
    S.add('o', 520, (c, p) => { const p0 = env.pos(q); if (!p0) return; c.globalCompositeOperation = 'lighter'; glow(c, p0.x, p0.y, w() * (0.9 - p * 0.35), a.c1, 0.55 * p); });
  }
  function shield(a) {
    if (S.reduced || !S.enabled) return;
    S.add('o', 520, (c, p) => { const q = env.pos(a.id); if (!q) return; const r = w() * (0.5 + 0.08 * Math.sin(p * 9)), al = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8; c.fillStyle = css('#bfe3ff', 0.22 * al); c.strokeStyle = css('#ffffff', 0.8 * al); c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill(); c.stroke(); });
  }
  function heal(a) {
    if (S.reduced || !S.enabled) return;
    const n = S.cnt(5);
    for (let i = 0; i < n; i++) S.part(a.x + (rnd() - 0.5) * w() * 0.6, a.y + w() * 0.1, 0, -w() * (1.2 + rnd()), { life: 650, size: 3.2, col: '#4ade80', shape: 5, add: false });
    S.add('o', 400, (c, p) => { c.globalCompositeOperation = 'lighter'; glow(c, a.x, a.y, w() * 0.7, '#4ade80', (1 - p) * 0.55); });
  }
  function death(a) {
    if (S.reduced || !S.enabled) return;
    const n = S.cnt(a.big ? 18 : 10);
    for (let i = 0; i < n; i++) { const ang = rnd() * TAU, v = w() * (1.4 + rnd() * 2.4); S.part(a.x, a.y, Math.cos(ang) * v, Math.sin(ang) * v - w() * 0.8, { life: 600 + rnd() * 300, size: 3 + rnd() * 2.5, col: i % 3 ? a.c1 : '#ffffff', g: w() * 3, drag: 1 }); }
    S.add('o', 420 * S.slow(), (c, p) => { c.globalCompositeOperation = 'lighter'; c.strokeStyle = css(a.c1, 1 - p); c.lineWidth = 4 * (1 - p) + 1; c.beginPath(); c.arc(a.x, a.y, w() * (0.3 + p * 0.8), 0, TAU); c.stroke(); glow(c, a.x, a.y, w() * 0.9, '#fff', (1 - p) * 0.6); });
  }
  // 普攻命中：近戰＝小斬痕；遠程＝閃光火花
  function hit(a) {
    if (S.reduced || !S.enabled) return;
    const n = S.cnt(a.crit ? 7 : 4), ang0 = a.ang != null ? a.ang : rnd() * TAU;
    for (let i = 0; i < n; i++) { const ang = ang0 + (rnd() - 0.5) * 1.6, v = w() * (2.2 + rnd() * 2.2); S.part(a.x, a.y, Math.cos(ang) * v, Math.sin(ang) * v, { life: 260 + rnd() * 160, size: 2.6, col: i % 2 ? a.c1 : '#ffffff', shape: 1, drag: 2.4 }); }
    S.add('o', a.crit ? 260 : 170, (c, p) => { c.globalCompositeOperation = 'lighter'; glow(c, a.x, a.y, w() * (0.3 + p * 0.3) * (a.crit ? 1.5 : 1), '#ffffff', (1 - p) * 0.8); });
    if (a.melee) slash({ x: a.x, y: a.y, ang: a.ang != null ? a.ang + 0.3 : null, c1: a.c1, c2: '#ffffff', big: a.crit });
  }
  function stun(a) {
    if (!S.allow('obj')) return null;
    return S.addObj({ id: a.id, drawO: (c, o, now) => { const q = env.pos(a.id); if (!q) return; for (let i = 0; i < 3; i++) { const ang = now / 260 + i * TAU / 3; glow(c, q.x + Math.cos(ang) * w() * 0.3, q.y - w() * 0.46 + Math.sin(ang) * w() * 0.09, w() * 0.11, '#ffe27a', 1); } } });
  }
  return { burst, flash, shockwave, ground, telegraph, beam, tether, slash, spin, cone, rain, aura, morph, sweep, hop, charge, shield, heal, death, hit, stun };
}

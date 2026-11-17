// 技能演出播放：把 data/fx.json 的時間軸（由 ability_fx.json 轉出）＋引擎的純畫面事件（fire／atk／dmg／move…）變成 stage 上的特效。
// 完全不影響戰鬥：這裡只讀事件、只畫。畫面亂數只用 Math.random（UI 端）。
import { createStage, css, mix, glow, TAU, clamp, lerp, easeOut, rnd } from './stage.js';
import { makePresets, pal } from './presets.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const A = (v, star) => (Array.isArray(v) ? v[Math.min(Math.max(star || 1, 1), v.length) - 1] : v);
const RANGED_SHAPE = new Set(['bolt', 'bullet', 'arrow', 'laser', 'spear', 'spike', 'feather', 'card', 'orb', 'ball', 'spirit', 'note', 'blade']);

export function createFx(root, env0) {
  let fxData = { units: {} };
  const env = env0;
  const S = createStage(root, env);
  const FX = makePresets(S);
  const w = () => env.w();
  const spd = () => env.speed() || 1;
  const ms = (sec) => sec * 1000 / spd();   // 遊戲秒 → 實際毫秒（跟著戰鬥速度）
  const udef = (u) => (u && fxData.units[u.key]) || null;
  const colors = (u) => {
    const d = udef(u); let c1 = (d && d.c[0]) || '#ffd24a', c2 = (d && d.c[1]) || '#ffffff';
    if (u && u.side === 'enemy') { c1 = mix(c1, '#ff4040', 0.15); c2 = mix(c2, '#ff4040', 0.1); }   // 敵方特效偏紅一點，鏡像對戰分得出誰放的
    return [c1, c2];
  };
  const P = (u) => (u ? env.pos(u.id) : null);
  const enemiesOf = (u) => env.units().filter((x) => x.alive && x.side !== u.side);
  const alliesOf = (u) => env.units().filter((x) => x.alive && x.side === u.side);

  // ---------- 目標解析 ----------
  function resolve(spec, c, dflt) {
    const s = spec || dflt || 'tgt';
    const u = c.u, t = c.tgt;
    switch (s) {
      case 'self': return [u];
      case 'enemies': return enemiesOf(u);
      case 'allies': return alliesOf(u);
      case 'row': { const t0 = t; return t0 ? enemiesOf(u).filter((x) => x.hex.row === t0.hex.row) : []; }
      case 'boardCenter': return [{ id: null, fixed: { x: env.W() / 2, y: env.H() / 2 } }];
      default: return t && t.alive !== false ? [t] : (t ? [t] : []);
    }
  }
  const ptOf = (x) => (x.fixed ? x.fixed : P(x));

  // ---------- 節點執行 ----------
  function run(nodes, c, baseMs) {
    for (const n of nodes || []) {
      if (n.cn && !(c.castN > 0 && c.castN % n.cn === 0)) continue;
      if (n.once && c.castN > 1) continue;
      const d = (baseMs || 0) + ms(n.t || 0);
      const go = () => { try { exec(n, c); } catch (e) { console.error(e); } };
      if (d > 0) S.after(d, go); else go();
    }
  }
  function ctxOf(u, tgt, extra) { return Object.assign({ u, tgt, star: u ? u.star : 1, castN: u ? u.castN : 1, c1: colors(u)[0], c2: colors(u)[1] }, extra); }

  function exec(n, c) {
    const u = c.u;
    if (!u) return;
    switch (n.k) {
      case 'fx': return execFx(n, c);
      case 'proj': return execProj(n, c);
      case 'move': return execMove(n, c);
      case 'knock': { for (const t of resolve(n.to, c)) if (t && t.id) knockUp(t, A(n.dur, c.star), n.high); return; }
      case 'chan': { const t = resolve(n.to, c)[0]; if (t) FX.beam({ fromId: u.id, toId: t.id, x: P(u).x, y: P(u).y, tx: P(t).x, ty: P(t).y, skin: n.skin === 'notes' ? 'notes' : 'beam', c1: c.c1, c2: c.c2, dur: Math.min(A(n.dur, c.star), 3) / 1, wide: true }); return; }
      case 'roller': return startRoller(u, n);
      case 'zone': return addZone(n, c);
    }
  }

  function execFx(n, c) {
    const u = c.u, name = n.f;
    if (name === 'shake') return S.shake(A(n.power, c.star) || 1);
    if (name === 'sweep') return FX.sweep({ skin: n.skin, dir: n.dir, dur: n.dur, c1: c.c1, c2: c.c2 });
    const base = { skin: n.skin, r: n.r, n: n.n, big: n.big, small: n.small, heavy: n.heavy, thin: n.thin, wide: n.wide, shape: n.shape, dur: n.dur, pulse: n.pulse, len: n.len, width: n.width, along: n.along, star: c.star, c1: c.c1, c2: c.c2 };
    if (name === 'beam' || name === 'tether' || name === 'cone' || name === 'ground' && (n.shape === 'line') || name === 'telegraph' && false) {
      const fr = resolve(n.frm, c, 'self')[0], to = resolve(n.to, c, 'tgt')[0], pf = fr && ptOf(fr), pt = to && ptOf(to);
      if (!pf || !pt) return;
      const a = Object.assign({}, base, { x: pf.x, y: pf.y, tx: pt.x, ty: pt.y, fromId: fr.id, toId: to.id });
      if (name === 'beam') return FX.beam(a);
      if (name === 'tether') return FX.tether(a);
      if (name === 'cone') return FX.cone(a);
      return FX.ground(a);
    }
    const list = resolve(n.at, c, name === 'aura' || name === 'morph' || name === 'spin' || name === 'hop' ? 'self' : 'tgt');
    const lim = Math.min(list.length, S.eff() ? 4 : 8);
    const src = P(u);
    for (let i = 0; i < lim; i++) {
      const t = list[i], p = ptOf(t); if (!p) continue;
      const a = Object.assign({}, base, { x: p.x, y: p.y, id: t.id, tx: src ? src.x : p.x, ty: src ? src.y : p.y });
      const ang = src ? Math.atan2(p.y - src.y, p.x - src.x) : null;
      a.ang = ang != null && t !== u ? ang : null;
      switch (name) {
        case 'burst': FX.burst(a); break;
        case 'flash': FX.flash(a); break;
        case 'shockwave': FX.shockwave(a); break;
        case 'slash': FX.slash(a); break;
        case 'ground': if (n.shape === 'row') a.shape = 'row'; FX.ground(a); break;
        case 'telegraph': FX.telegraph(a); break;
        case 'spin': FX.spin(a); break;
        case 'rain': FX.rain(a); break;
        case 'aura': FX.aura(a); break;
        case 'morph': FX.morph(a); break;
        case 'hop': FX.hop(a); break;
        case 'afterimage': ghost(t, c.c1, 3); break;
        case 'trail': trailOn(t, c.c1, 500); break;
        default: break;
      }
    }
  }

  // ---------- 殘影／拖尾 ----------
  function ghost(u, col, n, spanMs) {
    if (!S.allow('slash') || !u) return;
    n = Math.min(n || 3, S.eff() ? 2 : 3);
    for (let i = 0; i < n; i++) S.after(i * (spanMs || 55), () => {
      const p = P(u); if (!p) return;
      const x = p.x, y = p.y;
      S.add('o', 260 * S.slow(), (cv, k) => { cv.globalAlpha = 0.5 * (1 - k); env.sprite(cv, u.key, x, y, w() * 0.42, 0.5 * (1 - k)); cv.globalAlpha = 1; cv.strokeStyle = css(col, 0.7 * (1 - k)); cv.lineWidth = 2; cv.beginPath(); cv.arc(x, y, w() * 0.42, 0, TAU); cv.stroke(); });
    });
  }
  function trailOn(u, col, durMs) {
    if (!S.trailOn() || !u) return;
    const pts = []; const t0 = S.now;
    S.addObj({ until: S.now + durMs + 260, drawO: (cv, o, now) => {
      if (now - t0 < durMs) { const p = P(u); if (p) pts.push(p.x, p.y, now); }
      while (pts.length && now - pts[2] > 260) pts.splice(0, 3);
      cv.lineCap = 'round'; cv.globalCompositeOperation = 'lighter';
      for (let i = 3; i < pts.length; i += 3) { const a = 1 - (now - pts[i + 2]) / 260; cv.strokeStyle = css(col, 0.55 * a); cv.lineWidth = w() * 0.3 * a; cv.beginPath(); cv.moveTo(pts[i - 3], pts[i - 2]); cv.lineTo(pts[i], pts[i + 1]); cv.stroke(); }
    } });
  }

  // ---------- 擊飛 ----------
  function knockUp(t, durSec, high) {
    const node = env.unitNode(t.id); if (!node || S.reduced || !S.enabled) return;
    const total = Math.min(Math.max(ms(durSec || 1), 260), 900), t0 = S.now, h = w() * (high ? 1.0 : 0.6);
    const o = S.addObj({ until: t0 + total, upd: (ob, dt, now) => { const k = clamp((now - t0) / total, 0, 1); t.oy = -Math.sin(Math.PI * k) * h; env.applyOffset(t); },
      done: () => { t.oy = 0; env.applyOffset(t); const p = P(t); if (p) { FX.shockwave({ x: p.x, y: p.y + w() * 0.2, r: 0.6, thin: true, c1: '#ffffff' }); FX.burst({ x: p.x, y: p.y + w() * 0.25, small: true, c1: '#d8c8a8', c2: '#ffffff', skin: 'spore', n: 5 }); } } });
    if (!o) { t.oy = 0; }
  }

  // ---------- 投射物 ----------
  function flightMs(a, b, cellsPerSec, lo, hi) { return clamp(dist(a, b) / (w() * (cellsPerSec || 12)) * 1000, lo || 110, hi || 420) * (spd() >= 4 ? 0.55 : 1); }
  function shoot(u, from, to, o) {   // 單發：from/to 是座標，to 也可帶 follow 單位
    const base = S.baseOf(o.shape);
    const dur = o.dur || flightMs(from, to, o.speed, 100, 420);
    return S.proj({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, x: from.x, y: from.y, follow: o.follow || null, dur, arc: !!o.arc, col: o.c1, col2: o.c2, base, sz: o.sz || 1, key: u && u.key, full: !!o.full, arrive: o.arrive });
  }
  function execProj(n, c) {
    const u = c.u, src = P(u); if (!src) return;
    const [c1, c2] = [c.c1, c.c2];
    const hitNodes = n.hit || [], endNodes = n.end || [];
    const onArrive = (t) => () => { if (hitNodes.length) run(hitNodes, Object.assign({}, c, { tgt: t }), 0); if (endNodes.length) run(endNodes, Object.assign({}, c, { tgt: t }), 0); };
    if (n.cos) { const t = resolve(n.to, c)[0]; const pt = t && ptOf(t); if (pt) shoot(u, src, pt, { shape: n.shape, c1, c2, speed: 14, follow: t.id }); return; }
    const targets = resolve(n.to, c).filter((t) => t && P(t));
    if (!targets.length && n.pattern !== 'radial') return;
    const count = Math.max(1, Math.min(A(n.count, c.star) || 1, 40));
    const shots = Math.min(count, S.eff() ? 6 : 14), fat = count > shots ? Math.min(1.8, 1 + (count - shots) / count) : 1;   // 多發：合併成較粗的幾顆
    const gap = ms(n.gap || 0.05) * (count / shots);
    if (n.pattern === 'radial') {   // 悟空：六個方向衝出去再飛回
      const rr = (A(n.range, c.star) || 2) * w();
      for (let i = 0; i < 6; i++) {
        const ang = i * TAU / 6 + Math.PI / 6, tgt = { x: src.x + Math.cos(ang) * rr, y: src.y + Math.sin(ang) * rr };
        shoot(u, src, tgt, { shape: n.shape, c1, c2, dur: ms(0.3), full: true, sz: 1.2, arrive: () => { if (n.ret) shoot(u, tgt, P(u) || src, { shape: n.shape, c1, c2, dur: ms(0.3), full: true, sz: 1.2, arrive: () => { const q = P(u); if (q) FX.flash({ x: q.x, y: q.y, skin: 'light', c1: '#ffe27a' }); } }); } });
        if (n.hit) for (const e of enemiesOf(u)) { const p = P(e); if (p && dist(p, src) < rr * 1.1 && Math.abs(Math.atan2(p.y - src.y, p.x - src.x) - ang) < 0.55) S.after(ms(0.15), () => run(hitNodes, Object.assign({}, c, { tgt: e }), 0)); }
      }
      return;
    }
    if (n.bounce) {   // 彈跳：依序彈向最近的、還沒打過的敵人
      const chain = []; let cur = targets[0]; const seen = new Set();
      while (cur && chain.length < Math.min(n.bounce, S.eff() ? 6 : 12)) {
        chain.push(cur); seen.add(cur.id);
        let best = null, bd = 1e9; const cp = P(cur);
        for (const e of enemiesOf(u)) { if (seen.has(e.id)) continue; const d = dist(cp, P(e)); if (d < bd) { bd = d; best = e; } }
        cur = best;
      }
      let from = src;
      chain.forEach((t, i) => {
        const d0 = i * ms(0.14); const sz = Math.max(0.55, 1 - i * 0.07);
        S.after(d0, () => { const a = from; const b = P(t) || a; shoot(u, a, b, { shape: n.shape, c1, c2, dur: ms(0.13), sz, full: true, arrive: () => { if (hitNodes.length) run(hitNodes, Object.assign({}, c, { tgt: t }), 0); const q = P(t); if (q) FX.hit({ x: q.x, y: q.y, c1 }); } }); });
        from = P(t) || from;
      });
      return;
    }
    if (n.pierce) {
      const t = targets[0], pt = P(t), L = Math.hypot(pt.x - src.x, pt.y - src.y) || 1, len = (A(n.len, c.star) || 5) * w();
      const end = { x: src.x + (pt.x - src.x) / L * len, y: src.y + (pt.y - src.y) / L * len };
      const dur = flightMs(src, end, n.speed, 150, 480);
      shoot(u, src, end, { shape: n.shape, c1, c2, dur, sz: 1.2, full: true });
      for (const e of enemiesOf(u)) {
        const q = P(e); if (!q) continue;
        const k = ((q.x - src.x) * (end.x - src.x) + (q.y - src.y) * (end.y - src.y)) / (len * len);
        const dx = src.x + (end.x - src.x) * k - q.x, dy = src.y + (end.y - src.y) * k - q.y;
        if (k > 0 && k < 1.02 && Math.hypot(dx, dy) < w() * 0.55) S.after(dur * Math.min(k, 1), () => { onArrive(e)(); });
      }
      return;
    }
    for (let i = 0; i < shots; i++) {
      const t = targets[i % targets.length];
      S.after(i * gap, () => {
        const a = P(u) || src, b0 = P(t); if (!b0) return;
        const jit = n.spread === 'fan' || n.spread === 'arcfan' || n.spread === 'distribute' ? { x: (rnd() - 0.5) * w() * 0.9, y: (rnd() - 0.5) * w() * 0.7 } : { x: 0, y: 0 };
        const off = n.spread === 'fan' || n.spread === 'arcfan' ? (i - (shots - 1) / 2) * 0.14 : 0;
        const b = { x: b0.x + jit.x, y: b0.y + jit.y };
        if (off) { const ang = Math.atan2(b.y - a.y, b.x - a.x) + off, d = dist(a, b); b.x = a.x + Math.cos(ang) * d; b.y = a.y + Math.sin(ang) * d; }
        shoot(u, a, b, { shape: n.shape, c1, c2, speed: n.speed, arc: n.arc, sz: fat, follow: shots === 1 && !jit.x ? t.id : null, full: shots <= 4, arrive: onArrive(t) });
      });
    }
  }

  // ---------- 位移演出（純畫面：只是頭像飛出去再回來，格子與戰局不變）----------
  function execMove(n, c) {
    const u = c.u, src = P(u), t = c.tgt, tp = t && P(t); if (!src || !S.enabled) return;
    const node = env.unitNode(u.id); if (!node) return;
    const m = n.m;
    if (S.reduced) return;
    let pts = []; const W = w();
    const foes = enemiesOf(u);
    if (m === 'longestRow' || m === 'bestLine') {   // 沿敵人最多的一列飛過去
      const rows = new Map(); for (const e of foes) { const k = e.hex.row; (rows.get(k) || rows.set(k, []).get(k)).push(e); }
      let best = null; for (const [k, l] of rows) if (!best || l.length > best.length) best = l;
      if (best) { best = best.slice().sort((a, b) => dist(P(a), src) - dist(P(b), src)).slice(0, 5); for (const e of best) pts.push({ p: P(e), e }); }
    }
    if (!pts.length && tp && (m === 'through' || m === 'longestRow' || m === 'bestLine' || m === 'toward' || m === 'dash')) {
      const L = dist(tp, src) || 1, ex = (tp.x - src.x) / L, ey = (tp.y - src.y) / L, len = m === 'through' ? (n.len || 2) * W : 0.45 * W;
      pts.push({ p: tp, e: t }); if (m === 'through') pts.push({ p: { x: tp.x + ex * len, y: tp.y + ey * len } });
      else pts[0] = { p: { x: tp.x - ex * W * 0.7, y: tp.y - ey * W * 0.7 }, e: t };
    }
    if (!pts.length && tp && (m === 'leap' || m === 'blink')) { const L = dist(tp, src) || 1; pts.push({ p: { x: tp.x - (tp.x - src.x) / L * W * 0.8, y: tp.y - (tp.y - src.y) / L * W * 0.8 }, e: t }); }
    if (!pts.length && (m === 'side' || m === 'strafe')) { const s = rnd() < 0.5 ? 1 : -1; pts.push({ p: { x: src.x + s * W * 1.1, y: src.y } }); }
    if (!pts.length) return;
    const col = c.c1, col2 = c.c2, blink = m === 'blink', leap = m === 'leap';
    const seg = blink ? 90 : ms(0.12) * (spd() >= 4 ? 0.7 : 1), out = [{ x: 0, y: 0 }], hitAt = [];
    let prev = src; const base = src;
    for (const q of pts) { out.push({ x: q.p.x - base.x, y: q.p.y - base.y }); hitAt.push(q.e || null); prev = q.p; }
    out.push({ x: 0, y: 0 });
    const total = seg * (out.length - 1) + 60;
    const t0 = S.now; let lastGhost = 0, lastK = -1; let lastParticle = 0;
    if (blink) { FX.burst({ x: src.x, y: src.y, c1: col, c2: col2, skin: 'shadow', small: true }); }
    u.ghosting = true;
    S.addObj({ until: t0 + total, upd: (ob, dt, now) => {
      const e = now - t0, k = Math.min(out.length - 1.0001, e / seg), i = Math.floor(k), f = easeOut(k - i);
      const a = out[i], b = out[i + 1];
      u.ox = lerp(a.x, b.x, blink ? (f > 0.5 ? 1 : 0) : (k - i)); u.oy = lerp(a.y, b.y, blink ? (f > 0.5 ? 1 : 0) : (k - i));
      if (leap) u.oy -= Math.sin(Math.PI * Math.min(1, e / total)) * W * 0.7;
      env.applyOffset(u);
      if (i !== lastK) { lastK = i; const e2 = hitAt[i - 1]; if (i >= 1 && e2) run(n.hit || [], Object.assign({}, c, { tgt: e2 }), 0); if (i === 1 && pts.length && !hitAt[0] && n.hit) run(n.hit, c, 0); if (n.paint && i >= 1 && i <= pts.length) FX.ground({ x: base.x + out[i].x, y: base.y + out[i].y, skin: n.paint, r: 0.5, persist: true, c1: col, c2: col2 }); }
      if (now - lastGhost > 55 && S.trailOn()) { lastGhost = now; ghost(u, col, 1); }
      if (now - lastParticle > 30) { lastParticle = now; const p = P(u); if (p) S.part(p.x, p.y, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60, { life: 320, size: 3, col: rnd() < 0.5 ? col : col2 }); }
    }, done: () => { u.ox = 0; u.oy = 0; u.ghosting = false; env.applyOffset(u); } });
  }

  // ---------- 場上物件 ----------
  function addZone(n, c) {
    const t = resolve(n.at, c)[0]; if (!t) return;
    const [c1, c2] = pal(n.skin, c.c1, c.c2); const r = (A(n.r, c.star) || 1);
    const fixed = n.follow ? null : P(t), dur = ms(Math.min(A(n.dur, c.star) || 3, 8));
    S.addObj({ until: S.now + dur, drawU: (cv, o, now) => {
      const p = fixed || P(t); if (!p) return; const R = (r + 0.5) * w() * 0.96, k = (now - o.t0) / dur, al = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
      cv.fillStyle = css(c1, 0.2 * al); cv.strokeStyle = css(c2, 0.7 * al); cv.lineWidth = 2; cv.beginPath(); cv.ellipse(p.x, p.y, R, R * 0.82, 0, 0, TAU); cv.fill(); cv.stroke();
      cv.setLineDash([6, 8]); cv.lineDashOffset = -now / 50; cv.beginPath(); cv.ellipse(p.x, p.y, R * 0.7, R * 0.7 * 0.82, 0, 0, TAU); cv.stroke();
    }, upd: (o, dt, now) => { if (!S.reduced && rnd() < dt / 160) { const p = fixed || P(t); if (p) { const a = rnd() * TAU, rr = rnd() * (r + 0.4) * w(); S.part(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.8, 0, -w() * 0.8, { life: 600, size: 3, col: rnd() < 0.5 ? c1 : c2 }); } } } });
  }
  // 迪斯可球：努努推著它在敵陣裡滾（純畫面）；球壓過誰誰冒火花
  const rollers = new Map();
  function startRoller(u, n) {
    if (!S.enabled || rollers.has(u.id)) { const r0 = rollers.get(u.id); if (r0) { r0.size = Math.min(1.6, r0.size + 0.15); } return; }
    const p0 = P(u); if (!p0) return;
    const R = { x: p0.x, y: p0.y, size: 1, visited: new Map(), ang: 0, owner: u };
    const foes = () => enemiesOf(u);
    const o = S.addObj({ keep: true, upd: (ob, dt, now) => {
      if (!u.alive) { ob.on = false; return; }
      const list = foes(); if (!list.length) return;
      let tg = R.tg && R.tg.alive ? R.tg : null;
      if (!tg) { let best = null, bd = -1; for (const e of list) { const lv = R.visited.get(e.id) || -1e9; if (now - lv < 1400) continue; const d = dist(P(e), R); if (bd < 0 || d < bd) { bd = d; best = e; } } R.tg = tg = best || list[(Math.floor(now / 900)) % list.length]; }
      const tp = P(tg); if (!tp) return;
      const L = dist(tp, R) || 1, sp = w() * (n.speed || 1) * 1.9 * R.size * (dt / 1000);
      R.x += (tp.x - R.x) / L * Math.min(sp, L); R.y += (tp.y - R.y) / L * Math.min(sp, L); R.ang += dt / 160;
      if (L < w() * 0.45 && (now - (R.visited.get(tg.id) || -1e9)) > 1000) { R.visited.set(tg.id, now); R.tg = null; FX.burst({ x: tp.x, y: tp.y, skin: 'sparkle', n: 7, c1: '#ffd24a', c2: '#ff3fa8' }); FX.flash({ x: tp.x, y: tp.y, skin: 'light' }); }
      for (const e of list) { if (e === tg) continue; const q = P(e); if (q && dist(q, R) < w() * 0.5 * R.size && now - (R.visited.get(e.id) || -1e9) > 1000) { R.visited.set(e.id, now); FX.burst({ x: q.x, y: q.y, skin: 'sparkle', n: 5, c1: '#3df2ff', c2: '#ff3fa8', small: true }); } }
      // 努努跟在球後面（只是畫面上的跟隨，格子不變；最多離原位 2.4 格）
      const own = u, ob0 = env.basePos(own.id); if (ob0 && !S.reduced) {
        const dx = R.x - ob0.x, dy = R.y - ob0.y, d = Math.hypot(dx, dy) || 1, back = w() * 0.95;
        let tx = dx - dx / d * back, ty = dy - dy / d * back; const dm = Math.hypot(tx, ty), cap = w() * 2.4;
        if (dm > cap) { tx *= cap / dm; ty *= cap / dm; }
        own.ox = lerp(own.ox || 0, tx, 0.12); own.oy = lerp(own.oy || 0, ty, 0.12); env.applyOffset(own);
      }
      if (S.trailOn() && rnd() < 0.5) S.part(R.x, R.y + w() * 0.2, (rnd() - 0.5) * 30, w() * 0.2, { life: 400, size: 3, col: ['#ffd24a', '#ff3fa8', '#3df2ff'][Math.floor(rnd() * 3)] });
    }, drawU: (cv) => { const g = cv.createRadialGradient(R.x, R.y + w() * 0.2, 0, R.x, R.y + w() * 0.2, w() * 0.5 * R.size); g.addColorStop(0, 'rgba(255,210,74,.35)'); g.addColorStop(1, 'rgba(255,210,74,0)'); cv.fillStyle = g; cv.fillRect(R.x - w(), R.y - w() * 0.5, w() * 2, w() * 1.8); },
    drawO: (cv) => {
      const r = w() * 0.34 * R.size, x = R.x, y = R.y - w() * 0.05;
      const gr = cv.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#b8c4d4'); gr.addColorStop(1, '#6a7890');
      cv.fillStyle = gr; cv.beginPath(); cv.arc(x, y, r, 0, TAU); cv.fill();
      cv.save(); cv.beginPath(); cv.arc(x, y, r, 0, TAU); cv.clip(); cv.strokeStyle = 'rgba(40,50,70,.55)'; cv.lineWidth = 1;
      for (let i = -3; i <= 3; i++) { const xx = x + Math.sin(R.ang + i * 0.5) * r * 0.9; cv.beginPath(); cv.moveTo(xx, y - r); cv.quadraticCurveTo(xx + Math.sin(R.ang + i * 0.5) * r * 0.3, y, xx, y + r); cv.stroke(); }
      for (let j = -2; j <= 2; j++) { cv.beginPath(); cv.moveTo(x - r, y + j * r * 0.33); cv.lineTo(x + r, y + j * r * 0.33); cv.stroke(); }
      cv.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) { const a = R.ang * 1.3 + i * 1.25; glow(cv, x + Math.cos(a) * r * 0.6, y + Math.sin(a * 1.4) * r * 0.55, r * 0.35, ['#ffd24a', '#ff3fa8', '#3df2ff'][i % 3], 0.9); }
      cv.restore();
      cv.strokeStyle = 'rgba(255,255,255,.7)'; cv.lineWidth = 1.5; cv.beginPath(); cv.arc(x, y, r, 0, TAU); cv.stroke();
    }, done: () => { rollers.delete(u.id); u.ox = 0; u.oy = 0; env.applyOffset(u); } });
    if (o) rollers.set(u.id, R);
  }

  // ---------- 對外：事件處理 ----------
  const api = {
    stage: S,
    setData(d) { fxData = d && d.units ? d : { units: {} }; },
    colors,
    // 舊版區域事件（addZone）：把整塊範圍的格子畫成地面色塊
    hexes(pts, src) {
      if (!S.allow('ground')) return;
      const [c1] = src ? colors(src) : ['#ffd24a']; const r = w() * 0.5;
      S.add('u', 420 * S.slow(), (cv, p) => { cv.fillStyle = css(c1, 0.3 * (1 - p)); cv.strokeStyle = css(c1, 0.8 * (1 - p)); cv.lineWidth = 2; for (const q of pts.slice(0, 24)) { cv.beginPath(); cv.ellipse(q.x, q.y, r * 0.95, r * 0.8, 0, 0, TAU); cv.fill(); cv.stroke(); } });
    },
    line(a, b, kind, src) { const [c1, c2] = src ? colors(src) : ['#9ad0ff', '#fff']; if (kind === 'beam') FX.beam({ x: a.x, y: a.y, tx: b.x, ty: b.y, c1, c2, dur: 0.3 }); else if (src) shoot(src, a, b, { shape: 'orb', c1, c2, sz: 0.7 }); },
    spawn(u) { const p = P(u); if (p) { const [c1, c2] = colors(u); FX.burst({ x: p.x, y: p.y, c1, c2, n: 8 }); FX.shockwave({ x: p.x, y: p.y, r: 0.8, thin: true, c1 }); } },
    resize() { S.resize(); },
    tick(dt) { S.step(dt); },
    clear() { S.clear(); rollers.clear(); },
    busy: () => S.busy(),
    // 戰鬥開始：被動演出（努努的球等）
    start() {
      for (const u of env.units()) {
        const d = udef(u); if (!d || !d.pas) continue;
        for (const p of d.pas) if (p.on === 'start') run(p.nodes, ctxOf(u, enemiesOf(u)[0] || null), 0);
      }
    },
    cast(u) {   // 前搖：蓄力光
      const [c1, c2] = colors(u); const p = P(u); if (!p) return;
      FX.charge({ id: u.id, c1, c2 });
    },
    fire(u, ev) {   // 技能生效
      u.castN = (u.castN || 0) + 1;
      api.lastFire = { key: u.key, id: u.id, n: u.castN, at: performance.now() }; api.fires = (api.fires || 0) + 1;
      const d = udef(u), tgt = ev.tgt != null ? env.unit(ev.tgt) : null;
      const c = ctxOf(u, tgt || enemiesOf(u)[0] || null);
      let nodes = d ? (ev.alt && d.alt ? d.alt : d.cast) : null;
      if (!nodes || !nodes.length) nodes = tokNodes(d && d.tok);
      const strong = nodes.some((n) => n.k === 'proj' || n.k === 'move' || n.k === 'chan' || (n.k === 'fx' && /^(burst|slash|shockwave|ground|beam|cone|spin|rain|sweep|tether|telegraph)$/.test(n.f)));
      const p = P(u); if (p) { FX.flash({ x: p.x, y: p.y, skin: 'light', c1: c.c1 }); FX.shockwave({ x: p.x, y: p.y, r: 0.7, thin: true, c1: c.c1 }); }
      if (!strong) generic(u, d, c);
      else if (d && d.ar && d.ar[1] >= 1 && !nodes.some((n) => n.k === 'fx' && /^(shockwave|cone|ground|sweep)$/.test(n.f))) areaHint(u, d, c);
      run(nodes, c, 0);
    },
    atk(u, ev) {
      const t = env.unit(ev.tgt); if (!t) return;
      u.atkN = (u.atkN || 0) + 1; u.lastRanged = !!ev.ranged; u.lastAtkCrit = false;
      const d = udef(u);
      if (d && d.pas) for (const p of d.pas) if (p.on === 'attack' && p.n && u.atkN % p.n === 0) run(p.nodes, ctxOf(u, t), 0);
      if (!ev.ranged) return;
      const a = P(u), b = P(t); if (!a || !b) return;
      const [c1, c2] = colors(u);
      let shape = 'orb'; const pr = d && d.cast.find((n) => n.k === 'proj' && RANGED_SHAPE.has(n.shape)); if (pr) shape = pr.shape;
      const info = { crit: false }; u.lastAtk = info;
      shoot(u, a, b, { shape, c1, c2, sz: 0.62, speed: 15, follow: t.id, arrive: () => { const q = P(t); if (q && !(t.hitAt && S.now - t.hitAt < 60)) { t.hitAt = S.now; FX.hit({ x: q.x, y: q.y, c1, crit: info.crit, ang: Math.atan2(q.y - a.y, q.x - a.x) }); } } });
    },
    dmg(t, ev, src) {
      const [c1] = colors(src || t);
      const p = P(t); if (!p) return;
      if (ev.tag === 'atk') {
        if (src && src.lastRanged) { if (src.lastAtk) src.lastAtk.crit = !!ev.crit; return; }
        const sp = src ? P(src) : null, ang = sp ? Math.atan2(p.y - sp.y, p.x - sp.x) : null;
        S.after(60, () => { const q = P(t) || p; FX.hit({ x: q.x, y: q.y, c1, crit: !!ev.crit, melee: true, ang }); });
        return;
      }
      if (ev.tag === 'ot' || ev.tag === 'burn') return;
      if (t.hitAt && S.now - t.hitAt < 90) return;   // 同一個單位短時間內的連續命中只畫一次，省效能
      t.hitAt = S.now;
      FX.hit({ x: p.x, y: p.y, c1, crit: !!ev.crit });
    },
    shield(t, ev) { if (ev.amt > 0 && t) { const now = S.now; if (t.shAt && now - t.shAt < 200) return; t.shAt = now; FX.shield({ id: t.id }); } },
    heal(t, ev) { if (ev.amt > 0 && t) { const p = P(t); if (p && !(t.hlAt && S.now - t.hlAt < 250)) { t.hlAt = S.now; FX.heal({ x: p.x, y: p.y }); } } },
    death(t, ev, killer) {
      const p = P(t); if (!p) return; const [c1] = colors(t);
      FX.death({ x: p.x, y: p.y, c1, big: !!t.boss });
      if (t.boss) S.shake(2);
      const d = udef(t); if (d && d.pas) for (const q of d.pas) if (q.on === 'death') run(q.nodes, ctxOf(t, killer || null), 0);
      if (killer) { const kd = udef(killer); if (kd && kd.pas) for (const q of kd.pas) if (q.on === 'kill') run(q.nodes, ctxOf(killer, enemiesOf(killer)[0] || null), 0); }
      const o = t.stunObj; if (o) { S.removeObj(o); t.stunObj = null; }
    },
    hpLow(t) {
      const d = udef(t); if (!d || !d.pas) return;
      for (const q of d.pas) if (q.on === 'hpBelow' && q.n && !(t.hpDone && t.hpDone[q.n]) && t.hp / t.hpMax < q.n) { t.hpDone = t.hpDone || {}; t.hpDone[q.n] = 1; run(q.nodes, ctxOf(t, enemiesOf(t)[0] || null), 0); }
    },
    status(t, kind, on) {
      if (kind === 'stun') { if (on && !t.stunObj) t.stunObj = FX.stun({ id: t.id }); else if (!on && t.stunObj) { S.removeObj(t.stunObj); t.stunObj = null; } }
    },
    move(u, from, to, ev) {   // from/to 是格座標
      if (ev.style !== 'dash' || !S.trailOn()) return;
      const [c1] = colors(u);
      trailOn(u, c1, ms((ev.dur || 4) / 20) + 40); ghost(u, c1, 2, 40);
    },
  };

  function generic(u, d, c) {   // 沒有明確演出的技能：目標身上爆一下＋依範圍提示補一圈
    const t = c.tgt, p = t && P(t);
    if (p) { FX.burst({ x: p.x, y: p.y, c1: c.c1, c2: c.c2, n: 9 }); FX.flash({ x: p.x, y: p.y, c1: c.c1 }); }
    if (d && d.ar) areaHint(u, d, c);
  }
  function areaHint(u, d, c) {
    const [k, r] = d.ar, t = c.tgt, sp = P(u), tp = t && P(t);
    if (k === 'around' && tp) FX.shockwave({ x: tp.x, y: tp.y, r, c1: c.c1 });
    else if (k === 'adj' && sp) FX.shockwave({ x: sp.x, y: sp.y, r: 1, c1: c.c1 });
    else if (k === 'cone' && sp && tp) FX.cone({ x: sp.x, y: sp.y, tx: tp.x, ty: tp.y, r, c1: c.c1, c2: c.c2, dur: 0.35 });
    else if (k === 'line' && sp && tp) FX.beam({ x: sp.x, y: sp.y, tx: tp.x, ty: tp.y, along: true, c1: c.c1, c2: c.c2, dur: 0.3 });
    else if (k === 'all') FX.sweep({ c1: c.c1, c2: c.c2, dur: 0.6 });
  }
  function tokNodes(tok) {
    const out = [];
    for (const s of tok || []) {
      const m = /^projectile:(\w+)(?:\(([^)]*)\))?$/.exec(s);
      if (m) { const fl = (m[2] || ''); out.push({ k: 'proj', t: 0, shape: m[1], speed: 14, to: 'tgt', arc: /arc/.test(fl), pierce: /pierce/.test(fl), count: /fan/.test(fl) ? 3 : 1, spread: /fan/.test(fl) ? 'fan' : undefined, hit: [{ k: 'fx', f: 'burst', t: 0, at: 'tgt', small: true }] }); continue; }
      if (s === 'slash') out.push({ k: 'fx', f: 'slash', t: 0, at: 'tgt' });
      else if (s === 'shockwave') out.push({ k: 'fx', f: 'shockwave', t: 0.05, at: 'tgt', r: 1 });
      else if (s === 'rain') out.push({ k: 'fx', f: 'rain', t: 0, at: 'tgt', n: 6, r: 2 });
      else if (s === 'shake') out.push({ k: 'fx', f: 'shake', t: 0.05, power: 1 });
      else if (s === 'beam') out.push({ k: 'fx', f: 'beam', t: 0, dur: 0.4 });
    }
    return out;
  }
  return api;
}

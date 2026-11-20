// 技能演出播放：引擎事件（fire／atk／dmg／move／proj／obj／air／chan／fx…）變成 stage 上的特效。
// 位移、投射物、場上物件（努努的球、染色格、區域）全部照引擎事件的位置與時間走；data/fx.json 只剩配色、一句動作描述、沒有明確演出時的備用提示。
// 完全不影響戰鬥：這裡只讀事件、只畫。畫面亂數只用 Math.random（UI 端）。
const TICK = 50;   // 引擎 1 tick ＝ 50ms（與 battle.js 的 TICK_MS 相同）
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
    if (Array.isArray(spec)) return spec.map((id) => env.unit(id)).filter(Boolean);   // 引擎事件：已解析好的單位 id
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
    }
  }

  function execFx(n, c) {
    const u = c.u, name = n.f;
    if (name === 'shake') return S.shake(A(n.power, c.star) || 1);
    if (name === 'sweep') return FX.sweep({ skin: n.skin, dir: n.dir, dur: n.dur, c1: c.c1, c2: c.c2 });
    const base = { skin: n.skin, r: n.r, n: n.n, big: n.big, small: n.small, heavy: n.heavy, thin: n.thin, wide: n.wide, shape: n.shape, dur: n.dur, pulse: n.pulse, len: n.len, width: n.width, along: n.along, star: c.star, c1: c.c1, c2: c.c2 };
    if (name === 'beam' || name === 'tether' || name === 'cone' || name === 'ground' && (n.shape === 'line') || name === 'telegraph' && false) {
      const frs = resolve(n.frm, c, 'self'), tos = n.toXY ? [{ fixed: env.xy(n.toXY), id: null }] : resolve(n.to, c, 'tgt');
      const fr0 = frs[0];
      if (!fr0 || !tos.length) return;
      const lim = Math.min(tos.length, S.eff() ? 3 : 6);
      for (let i = 0; i < lim; i++) {   // 一個來源對多個目標（阿姆姆 4 條繃帶、瑟雷西 3 條連線）：各畫一條；多個來源對一個目標（弗拉迪米爾）：各畫一條
        const to = tos[i], fr = frs.length > 1 && frs.length === tos.length ? frs[i] : fr0, pf = ptOf(fr), pt = ptOf(to);
        if (!pf || !pt) continue;
        const a = Object.assign({}, base, { x: pf.x, y: pf.y, tx: pt.x, ty: pt.y, fromId: fr.id, toId: to.id });
        if (name === 'beam') FX.beam(a); else if (name === 'tether') FX.tether(a); else if (name === 'cone') FX.cone(a); else FX.ground(a);
      }
      return;
    }
    const list = n.center ? [{ id: null, fixed: { x: env.W() / 2, y: env.H() / 2 } }] : resolve(n.at, c, name === 'aura' || name === 'morph' || name === 'spin' || name === 'hop' ? 'self' : 'tgt');
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
    return S.proj({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, x: from.x, y: from.y, follow: o.follow || null, dur, arc: !!o.arc, col: o.c1, col2: o.c2, base, sz: o.sz || 1, key: u && u.key, full: !!o.full, spin: !!o.spin, arrive: o.arrive });
  }
  // 沒有引擎演出的備用：tok 提示產生的簡單投射物（只畫，不重複引擎的飛行）
  function execProj(n, c) {
    const u = c.u, src = P(u); if (!src) return;
    const t = resolve(n.to, c)[0], pt = t && ptOf(t); if (!pt) return;
    shoot(u, src, pt, { shape: n.shape, c1: c.c1, c2: c.c2, speed: 14, follow: t.id, arrive: () => { const q = P(t); if (q) FX.burst({ x: q.x, y: q.y, c1: c.c1, c2: c.c2, small: true }); } });
  }

  // ---------- 引擎事件：投射物 ----------
  function onProj(ev) {
    const src = ev.src != null ? env.unit(ev.src) : null;
    if (!S.enabled || !src && ev.src != null) return;
    const [c1, c2] = colors(src);
    const a0 = ev.fromId != null && env.pos(ev.fromId) ? env.pos(ev.fromId) : env.hexPt(ev.from);
    let tgt, follow = null;
    if (typeof ev.to === 'string') { const tp = env.pos(ev.to); if (!tp) return; tgt = { x: tp.x, y: tp.y }; follow = ev.to; }
    else if (ev.to && ev.to.x != null) tgt = env.xy(ev.to);
    else if (ev.to && ev.to.row != null) tgt = env.hexPt(ev.to);
    else return;
    const dur = Math.max(60, ev.dur * TICK / spd());
    const nCopy = ev.n && ev.n > 1 ? Math.min(ev.n, S.eff() ? 3 : 5) : 1;
    const base = Math.atan2(tgt.y - a0.y, tgt.x - a0.x);
    for (let i = 0; i < nCopy; i++) {
      const off = nCopy > 1 ? (i - (nCopy - 1) / 2) * w() * 0.34 : (ev.fan != null ? ev.fan * w() * 0.3 : 0);
      const ox = -Math.sin(base) * off, oy = Math.cos(base) * off;
      shoot(src, { x: a0.x + ox * 0.4, y: a0.y + oy * 0.4 }, { x: tgt.x + ox, y: tgt.y + oy }, { shape: ev.shape, c1, c2, dur, arc: ev.arc, spin: ev.spin, follow: nCopy === 1 && ev.fan == null ? follow : null, sz: (ev.big ? 1.45 : 1) * (ev.bounce ? 0.85 : 1) * (ev.cosmetic ? 0.8 : 1), full: !ev.cosmetic });
    }
  }
  function onAir(ev) { const t = env.unit(ev.id); if (t && t.alive !== false) knockUp(t, ev.dur * TICK / 1000, ev.high); }

  // ---------- 引擎事件：場上物件 ----------
  const objs = new Map();   // oid -> { o, R }
  function onObj(ev) {
    if (!S.enabled) return;
    if (ev.act === 'remove') { const q = objs.get(ev.oid); if (q) { S.removeObj(q.o); objs.delete(ev.oid); } return; }
    if (ev.act === 'move') { const q = objs.get(ev.oid); if (q && q.R) { const R = q.R; R.sx = R.x; R.sy = R.y; const p = env.xy(ev.xy); R.tx = p.x; R.ty = p.y; R.mt0 = S.now; R.mdur = Math.max(30, ev.dur * TICK / spd()); } return; }
    if (ev.act === 'mod') { const q = objs.get(ev.oid); if (q && q.R) q.R.goalSize = ev.scale || 1; return; }
    if (ev.act !== 'spawn') return;
    const src = ev.src != null ? env.unit(ev.src) : null, [c1, c2] = colors(src);
    if (ev.skin === 'discoball') return spawnBall(ev);
    if (ev.persist) {   // 染色格：整場留在地上
      const p = env.hexPt(ev.hex), o = FX.ground({ x: p.x, y: p.y, skin: ev.skin, r: 0.5, persist: true, c1, c2 });
      if (o) objs.set(ev.oid, { o });
      return;
    }
    spawnZone(ev, c1, c2);
  }
  function spawnZone(ev, c1x, c2x) {
    const [c1, c2] = pal(ev.skin, c1x, c2x), r = ev.r || 1, follow = ev.follow || null, fixed = env.hexPt(ev.hex);
    const dur = Math.max(400, ev.dur * TICK / spd());
    const o = S.addObj({ keep: true, drawU: (cv, ob, now) => {
      const p = (follow && P(env.unit(follow))) || fixed; if (!p) return; const R = (r + 0.5) * w() * 0.96, k = (now - ob.t0) / dur, al = k < 0.08 ? k / 0.08 : 1;
      cv.fillStyle = css(c1, 0.2 * al); cv.strokeStyle = css(c2, 0.7 * al); cv.lineWidth = 2; cv.beginPath(); cv.ellipse(p.x, p.y, R, R * 0.82, 0, 0, TAU); cv.fill(); cv.stroke();
      cv.setLineDash([6, 8]); cv.lineDashOffset = -now / 50; cv.beginPath(); cv.ellipse(p.x, p.y, R * 0.7, R * 0.7 * 0.82, 0, 0, TAU); cv.stroke();
    }, upd: (ob, dt) => { if (!S.reduced && rnd() < dt / 160) { const p = (follow && P(env.unit(follow))) || fixed; if (p) { const a = rnd() * TAU, rr = rnd() * (r + 0.4) * w(); S.part(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.8, 0, -w() * 0.8, { life: 600, size: 3, col: rnd() < 0.5 ? c1 : c2 }); } } } });
    if (o) { objs.set(ev.oid, { o }); o.until = S.now + dur * 1.5 + 1500; }   // 保險：remove 事件沒到也會自己收掉
  }
  // 迪斯可球：位置全部照引擎的 obj 事件（努努就站在球後面，是引擎真的在移動他）
  function spawnBall(ev) {
    const p0 = env.xy(ev.xy);
    const R = { x: p0.x, y: p0.y, sx: p0.x, sy: p0.y, tx: p0.x, ty: p0.y, mt0: S.now, mdur: 1, size: 1, goalSize: 1, ang: 0 };
    const o = S.addObj({ keep: true, upd: (ob, dt, now) => {
      const k = clamp((now - R.mt0) / R.mdur, 0, 1); R.x = lerp(R.sx, R.tx, k); R.y = lerp(R.sy, R.ty, k);
      R.size = lerp(R.size, R.goalSize, Math.min(1, dt / 240)); R.ang += dt / 160;
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
    } });
    if (o) { objs.set(ev.oid, { o, R }); FX.burst({ x: p0.x, y: p0.y, skin: 'sparkle', n: 10, c1: '#ffd24a', c2: '#ff3fa8' }); }
  }

  // ---------- 引擎事件：引導 ----------
  const chans = new Map();
  function onChan(ev) {
    const old = chans.get(ev.id); if (old) { S.removeObj(old); chans.delete(ev.id); }
    if (!ev.on || !S.enabled) return;
    const u = env.unit(ev.id); if (!u) return;
    const [c1, c2] = colors(u), notes = ev.skin === 'notes';
    const o = S.addObj({ keep: true, drawO: (cv, ob, now) => {
      const a = P(u), tg = env.unit(ev.tgt); const b = tg && tg.alive !== false ? P(tg) : null; if (!a) return;
      cv.globalCompositeOperation = 'lighter';
      const pulse = S.reduced ? 1 : 0.8 + 0.2 * Math.sin(now / 45);
      if (b && !notes) {
        cv.lineCap = 'round';
        cv.strokeStyle = css(c1, 0.32); cv.lineWidth = w() * 0.5 * pulse; cv.beginPath(); cv.moveTo(a.x, a.y); cv.lineTo(b.x, b.y); cv.stroke();
        cv.strokeStyle = css(c1, 0.9); cv.lineWidth = w() * 0.18 * pulse; cv.stroke();
        cv.strokeStyle = '#fff'; cv.lineWidth = w() * 0.06; cv.stroke();
        glow(cv, b.x, b.y, w() * 0.45, c1, 0.7);
      }
      glow(cv, a.x, a.y, w() * (0.55 + (S.reduced ? 0 : 0.08 * Math.sin(now / 80))), notes ? c2 : c1, 0.7);
    }, until: S.now + Math.max(500, ev.dur * TICK / spd()) + 600 });
    if (o) chans.set(ev.id, o);
  }

  // ---------- 引擎事件：fx op ----------
  function onFx(ev) {
    const u = ev.src != null ? env.unit(ev.src) : null;
    const c = Object.assign({ u, tgt: null, star: u ? u.star : 1, castN: u ? u.castN : 1 }, { c1: colors(u)[0], c2: colors(u)[1] });
    if (!u) { c.c1 = '#ffd24a'; c.c2 = '#ffffff'; }
    const n = Object.assign({ k: 'fx', f: ev.name }, ev);
    delete n.e; delete n.name; delete n.src;
    n.f = ev.name;
    if (ev.name === 'shake') return S.shake(ev.power || 1);
    if (n.at === undefined && !n.center && (ev.name === 'aura' || ev.name === 'morph' || ev.name === 'spin' || ev.name === 'hop')) n.at = u ? [u.id] : [];
    if (n.frm === undefined && u && (ev.name === 'beam' || ev.name === 'tether' || ev.name === 'cone')) n.frm = [u.id];
    if (ev.name === 'cone' && n.to === undefined && u && u.target != null) n.to = [u.target];
    if (n.at === undefined && !n.center && ev.name !== 'sweep' && ev.name !== 'beam' && ev.name !== 'tether' && ev.name !== 'cone') n.at = n.to || [];
    try { execFx(n, c); } catch (e) { console.error(e); }
  }

  // ---------- 對外：事件處理 ----------
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
    clear() { S.clear(); objs.clear(); chans.clear(); },
    busy: () => S.busy(),
    dbg: () => ({ objs: objs.size, balls: [...objs.values()].filter((q) => q.R).map((q) => ({ x: q.R.x, y: q.R.y })), projs: S.projN(), chans: chans.size, pos: env.units().filter((u) => u.alive !== false).map((u) => { const q = env.pos(u.id); return { k: u.key, s: u.side, x: q.x, y: q.y }; }) }),
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
    fire(u, ev) {   // 技能生效：瞬間的蓄力收尾；真正的演出（位移、投射物、特效）由引擎事件逐一帶出
      u.castN = (u.castN || 0) + 1;
      api.lastFire = { key: u.key, id: u.id, n: u.castN, at: performance.now() }; api.fires = (api.fires || 0) + 1;
      const d = udef(u), tgt = ev.tgt != null ? env.unit(ev.tgt) : null;
      const c = ctxOf(u, tgt || enemiesOf(u)[0] || null);
      const p = P(u); if (p) { FX.flash({ x: p.x, y: p.y, skin: 'light', c1: c.c1 }); FX.shockwave({ x: p.x, y: p.y, r: 0.7, thin: true, c1: c.c1 }); }
      if (d && d.eng) {
        if (!d.strong) generic(u, d, c);
        else if (d.ar && d.ar[1] >= 1 && !d.area) areaHint(u, d, c);
        return;
      }
      generic(u, d, c); run(tokNodes(d && d.tok), c, 0);
    },
    atk(u, ev) {
      const t = env.unit(ev.tgt); if (!t) return;
      u.atkN = (u.atkN || 0) + 1; u.lastRanged = !!ev.ranged; u.lastAtkCrit = false;
      const d = udef(u);
      if (d && d.pas) for (const p of d.pas) if (p.on === 'attack' && p.n && u.atkN % p.n === 0) run(p.nodes, ctxOf(u, t), 0);
      if (!ev.ranged) return;
      const a = P(u), b = P(t); if (!a || !b) return;
      const [c1, c2] = (d && d.bc) || colors(u);   // bc＝普攻自己的顏色（照實況對的；沒有就用技能色）
      let shape = 'orb'; if (d && d.bs && RANGED_SHAPE.has(d.bs)) shape = d.bs;
      const info = { crit: false }; u.lastAtk = info;
      shoot(u, a, b, { shape, c1, c2, sz: 0.62, speed: 15, follow: t.id, arrive: () => { const q = P(t); if (q && !(t.hitAt && S.now - t.hitAt < 60)) { t.hitAt = S.now; FX.hit({ x: q.x, y: q.y, c1, crit: info.crit, ang: Math.atan2(q.y - a.y, q.x - a.x) }); } } });
    },
    dmg(t, ev, src) {
      let [c1] = colors(src || t);
      const p = P(t); if (!p) return;
      if (ev.tag === 'atk') {
        const sd = src && udef(src); if (sd && sd.bc) c1 = sd.bc[0];
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
    move(u, from, to, ev) {   // from/to 是格座標；位置本身由 battle.js 照事件走，這裡只加拖尾、殘影、落地等演出
      const [c1, c2] = colors(u);
      const ms2 = Math.max(60, (ev.dur || 4) * TICK / spd());
      const st = ev.style || 'walk';
      if (st === 'walk' || st === 'push') return;
      if (st === 'blink') { const p = env.hexPt(from), q = env.hexPt(to); FX.burst({ x: p.x, y: p.y, c1, c2, skin: 'shadow', small: true }); FX.shockwave({ x: q.x, y: q.y, r: 0.7, thin: true, c1 }); ghost(u, c1, 2, 40); return; }
      if (st === 'leap') {
        if (!S.reduced) S.add('u', ms2, (cv, p) => { const q = env.basePos(u.id); if (!q) return; const k = Math.sin(Math.PI * p); cv.fillStyle = `rgba(0,0,0,${0.28 * (1 - k * 0.5)})`; cv.beginPath(); cv.ellipse(q.x, q.y + w() * 0.2, w() * 0.3 * (1 - k * 0.35), w() * 0.12 * (1 - k * 0.35), 0, 0, TAU); cv.fill(); });
        const p = env.hexPt(to); S.after(ms2, () => { FX.shockwave({ x: p.x, y: p.y + w() * 0.1, r: 0.8, thin: true, c1: '#ffffff' }); FX.burst({ x: p.x, y: p.y + w() * 0.2, small: true, c1: '#d8c8a8', c2: '#ffffff', skin: 'spore', n: 5 }); });
      }
      if (st === 'knockback' || st === 'pull') { if (S.trailOn()) trailOn(u, '#ffffff', ms2); return; }
      if (!S.trailOn()) return;
      trailOn(u, c1, ms2 + 40); ghost(u, c1, 2, 40);
    },
    proj: onProj, air: onAir, obj: onObj, chan: onChan, fxEv: onFx,
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

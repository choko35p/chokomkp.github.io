/* Derived from the 2026-11-23 chokomkp.com/trials/ distribution. */
(function(root) { 'use strict'; const modules = {};
modules.rng = (() => {
// 決定性亂數：FNV-1a 雜湊 + mulberry32。不使用 Math.random。
function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    const s = String(parts[i]) + '\u0001';
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

function build(state) {
  let a = state >>> 0;
  const rng = {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(rng.next() * n); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    chance(p) { return rng.next() < p; },
    state() { return a >>> 0; },
  };
  return rng;
}

function makeRng(seed) { return build(seed >>> 0); }
makeRng.fromState = function (s) { return build(s >>> 0); };

return {hashSeed, makeRng};
})();
modules.hex = (() => {
// 合併棋盤 8 列 × 7 行，odd-r（奇數 row 往右偏半格）。row 0 = 敵方後排，row 7 = 我方後排。
const ROWS = 8, COLS = 7;
const H = 0.866;

function inBoard(h) { return h.row >= 0 && h.row < ROWS && h.col >= 0 && h.col < COLS; }

function cube(h) {
  const x = h.col - (h.row - (h.row & 1)) / 2;
  return { x, z: h.row, y: -x - h.row };
}
function dist(a, b) {
  const p = cube(a), q = cube(b);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

const EVEN = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]]; // E,SE,SW,W,NW,NE
const ODD = [[0, 1], [1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1]];
function neighbors(h) {
  const d = (h.row & 1) ? ODD : EVEN;
  const out = [];
  for (let i = 0; i < 6; i++) {
    const n = { row: h.row + d[i][0], col: h.col + d[i][1] };
    if (inBoard(n)) out.push(n);
  }
  return out;
}

function within(h, r) {
  const out = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      if (dist(h, { row, col }) <= r) out.push({ row, col });
  return out;
}

function center(h) { return { x: h.col + 0.5 * (h.row & 1), y: h.row * H }; }

// 像素座標 -> 最近格（不限棋盤內；用 row/col 範圍外的值也可）
function nearestCell(x, y) {
  const r0 = Math.round(y / H);
  let best = null, bd = 1e9;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    const c = Math.round(x - 0.5 * (r & 1));
    const cx = c + 0.5 * (r & 1), cy = r * H;
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bd - 1e-9) { bd = d; best = { row: r, col: c }; }
  }
  return best;
}

function line(a, b) {
  const n = dist(a, b);
  if (n === 0) return [{ row: a.row, col: a.col }];
  const ca = center(a), cb = center(b);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = 1e-6;
    out.push(nearestCell(ca.x + (cb.x - ca.x) * t + e, ca.y + (cb.y - ca.y) * t + e * 0.7));
  }
  out[0] = { row: a.row, col: a.col };
  out[n] = { row: b.row, col: b.col };
  return out;
}

function lineThrough(a, b, len) {
  const ca = center(a), cb = center(b);
  let dx = cb.x - ca.x, dy = cb.y - ca.y;
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m === 0 || len <= 0) return [];
  dx /= m; dy /= m;
  const out = [];
  let last = a;
  for (let s = 1; s <= len * 4 + 4 && out.length < len; s++) {
    const k = s * 0.25;
    const c = nearestCell(ca.x + dx * k + 1e-6, ca.y + dy * k + 7e-7);
    if (!inBoard(c)) break;
    if (c.row === last.row && c.col === last.col) continue;
    out.push(c);
    last = c;
  }
  return out;
}

// ---- 位移／投射物用的幾何（階段二）----
const DIR6 = [[1, 0], [0.5, H], [-0.5, H], [-1, 0], [-0.5, -H], [0.5, -H]];   // E, SE, SW, W, NW, NE（格中心座標下的單位方向）
function cellKey(h) { return h.row * COLS + h.col; }
function same(a, b) { return !!a && !!b && a.row === b.row && a.col === b.col; }
// 從 a 沿 (dx,dy) 方向的直線上的格子（不含 a），最多 len 格、出界即止
function ray(a, dx, dy, len) {
  const ca = center(a), m = Math.sqrt(dx * dx + dy * dy);
  if (m === 0 || len <= 0) return [];
  dx /= m; dy /= m;
  const out = [];
  let last = a;
  for (let s = 1; s <= len * 4 + 4 && out.length < len; s++) {
    const k = s * 0.25;
    const c = nearestCell(ca.x + dx * k + 1e-6, ca.y + dy * k + 7e-7);
    if (!inBoard(c)) break;
    if (c.row === last.row && c.col === last.col) continue;
    out.push(c);
    last = c;
  }
  return out;
}
function rayDir(a, i, len) { return ray(a, DIR6[i][0], DIR6[i][1], len); }
// 棋盤上每一條直線（三個軸向各自的所有線），每條線是由頭到尾的格子陣列
function allLines() {
  const lines = [];
  const seen = new Set();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const a = { row: r, col: c };
    for (const i of [0, 1, 2]) {   // E、SE、SW 三個軸向；起點必須是這條線的頭（反方向沒有格子）
      const back = rayDir(a, i + 3, 1);
      if (back.length) continue;
      const cells = [a, ...rayDir(a, i, 20)];
      const key = i + ':' + cellKey(a);
      if (!seen.has(key)) { seen.add(key); lines.push(cells); }
    }
  }
  return lines;
}
const LINES = allLines();
function boardCenterHex() { return { row: 3, col: 3 }; }

function playerToBoard(pos) { return { row: 4 + pos[0], col: pos[1] }; }
function enemyToBoard(pos) { return { row: 3 - pos[0], col: 6 - pos[1] }; }

return {ROWS, inBoard, dist, neighbors, within, center, line, lineThrough, DIR6, cellKey, same, ray, rayDir, allLines, LINES, boardCenterHex, playerToBoard, enemyToBoard, COLS};
})();
modules.mixer = (() => {
// ILLBEATS 混音器：純函式（決定性，不用亂數、不讀時間）。引擎（stats.js）、遊戲狀態（game.js）、介面（ui/mixer.js）共用。
// 四條推桿的順序固定：ad 攻擊、ap 法強、hp 生命、gold 擊殺金幣機率（跟官方混音器由左到右一樣）。
// 狀態：state.mixer = { db: [ad, ap, hp, gold]（整數分貝）, last: [通道 key…]（最近調過的排最後）}。
// 每 1 分貝換多少、各階上限、隊友拿幾成，都寫在 traits.json 的 ILLBEATS（special id 'mixer'）；這裡只留退回預設值。

const CH = ['ad', 'ap', 'hp', 'gold'];
const CH_ZH = { ad: '攻擊', ap: '法強', hp: '生命', gold: '金幣' };

// 退回預設：官方每階分貝 10/14/18、隊友拿 50%、4 階混音強 50% 是原文；每分貝數值是從官方混音器截圖反推（推測）。
const DEF = {
  caps: [10, 14, 18], boost: [1, 1, 1.5], teamShare: 0.5,
  per: { ad: 0.0216, ap: 2, hp: 0.0176, gold: 0.02 },
};

// 預設組合（官方混音器 ATTACK／MAGIC PRESETS 各兩格；圖示是「攻擊＋金幣」「法強＋生命」，實際比例官方沒公布，這裡是推測）
const PRESETS = [
  { id: 'atk1', group: 'attack', zh: '攻擊＋金幣', ratio: [['ad', 2], ['gold', 1]] },
  { id: 'atk2', group: 'attack', zh: '重攻擊', ratio: [['ad', 5], ['gold', 1]] },
  { id: 'mag1', group: 'magic', zh: '法強＋生命', ratio: [['ap', 2], ['hp', 1]] },
  { id: 'mag2', group: 'magic', zh: '重法強', ratio: [['ap', 5], ['hp', 1]] },
];

function mixerEffect(DATA) {
  const t = DATA && DATA.traits && DATA.traits.byKey && DATA.traits.byKey.ILLBEATS;
  if (!t) return null;
  for (const e of [].concat(t.always || [], ...(t.tiers || []))) if (e && e.type === 'special' && e.id === 'mixer') return e;
  return null;
}

function mixerParams(DATA) {
  const e = mixerEffect(DATA) || {};
  return {
    caps: Array.isArray(e.caps) ? e.caps : DEF.caps,
    boost: Array.isArray(e.boost) ? e.boost : DEF.boost,
    teamShare: e.teamShare != null ? e.teamShare : DEF.teamShare,
    per: { ...DEF.per, ...(e.per || {}) },
  };
}

const mixerCap = (P, tier) => (tier > 0 ? P.caps[Math.min(tier, P.caps.length) - 1] : 0);
const mixerBoost = (P, tier) => (tier > 0 ? P.boost[Math.min(tier, P.boost.length) - 1] : 1);
// 成員每 1 分貝拿到的數值（已含 4 階強化）：ad／hp／gold 是小數比例，ap 是點數
const mixerPer = (P, tier, ch) => P.per[ch] * mixerBoost(P, tier);

const emptyMix = () => ({ db: [0, 0, 0, 0], last: [] });
const sumDb = (db) => db.reduce((a, b) => a + b, 0);

// 沒人調過時用的自動分法（敵方、機器人、舊存檔搬進來）：攻擊、法強、生命平分，多的 1～2 分貝給生命，金幣不放
function defaultMix(cap) {
  const base = Math.floor(cap / 3), rest = cap - base * 3;
  const db = [base, base, base + rest, 0];
  return { db, last: ['ad', 'ap', 'hp'] };
}

// 多出來的分貝從「最後調的那條」扣回；那條扣完還多，再扣前一條調的
function fitMix(m, cap) {
  m.db = CH.map((_, i) => Math.max(0, Math.floor(Number(m.db && m.db[i]) || 0)));
  m.last = (Array.isArray(m.last) ? m.last : []).filter((k) => CH.includes(k));
  let over = sumDb(m.db) - cap;
  if (over <= 0) return m;
  const order = m.last.slice().reverse().concat(CH.filter((k) => !m.last.includes(k)).reverse());
  for (const k of order) {
    if (over <= 0) break;
    const i = CH.indexOf(k), cut = Math.min(m.db[i], over);
    m.db[i] -= cut; over -= cut;
  }
  return m;
}

const touch = (m, ch) => { m.last = m.last.filter((k) => k !== ch); m.last.push(ch); };

// 把某條推到 v 分貝：最多推到「這條現在的值＋還沒用的分貝」。回傳實際值
function setChannel(m, ch, v, cap) {
  const i = CH.indexOf(ch);
  if (i < 0) return null;
  const others = sumDb(m.db) - m.db[i];
  const nv = Math.max(0, Math.min(Math.round(v), cap - others));
  if (nv !== m.db[i]) { m.db[i] = nv; touch(m, ch); }
  return nv;
}

// 套預設：按比例把 cap 分給兩條（最大餘數法，總和剛好 = cap）
function presetMix(id, cap) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return null;
  const tot = p.ratio.reduce((a, [, w]) => a + w, 0);
  const raw = p.ratio.map(([k, w]) => [k, (cap * w) / tot]);
  const db = [0, 0, 0, 0];
  let used = 0;
  for (const [k, x] of raw) { db[CH.indexOf(k)] = Math.floor(x); used += Math.floor(x); }
  const fr = raw.map(([k, x]) => [k, x - Math.floor(x)]).sort((a, b) => b[1] - a[1] || CH.indexOf(a[0]) - CH.indexOf(b[0]));
  for (let i = 0; used < cap; i++, used++) db[CH.indexOf(fr[i % fr.length][0])] += 1;
  return { db, last: p.ratio.map(([k]) => k) };
}

// 一組分貝換成成員的數值：{ad: 比例, ap: 點數, hp: 比例, gold: 機率}
function mixerValues(P, tier, db) {
  const o = {};
  CH.forEach((ch, i) => { o[ch] = db[i] * mixerPer(P, tier, ch); });
  return o;
}

return {CH, CH_ZH, PRESETS, mixerEffect, mixerParams, mixerCap, mixerBoost, mixerPer, emptyMix, sumDb, defaultMix, fitMix, setChannel, presetMix, mixerValues};
})();
modules.ops = (() => {
// 技能 op 執行器（SPEC 2.3 / 2.4）。純邏輯；所有狀態改變都透過 engine 提供的 sim 介面。
const { dist, neighbors, lineThrough, line: hexLine, center, rayDir, ray, DIR6, LINES, inBoard, same, boardCenterHex } = modules.hex;

// ---- 數值式 ---------------------------------------------------------------
function evalValue(sim, source, target, V, ctx) {
  if (V == null) return 0;
  if (typeof V === 'number') return V;
  const star = source ? source.star || 1 : 1;
  if (Array.isArray(V)) {
    const i = Math.min(Math.max(star, 1), V.length) - 1;
    return V[i];
  }
  let s = 0;
  const g = (k) => evalValue(sim, source, target, V[k], ctx);
  if (V.ap != null) s += g('ap') * (source ? sim.stat(source, 'ap') / 100 : 1);
  if (V.ad != null) s += g('ad') * (source ? sim.stat(source, 'ad') / (source.baseAd || 1) : 1);
  if (V.flat != null) s += g('flat');
  if (V.selfMaxHp != null && source) s += g('selfMaxHp') * source.hpMax;
  if (V.tgtMaxHp != null && target) s += g('tgtMaxHp') * target.hpMax;
  if (V.selfMissingHp != null && source) s += g('selfMissingHp') * (source.hpMax - source.hp);
  if (V.resist != null && source) s += g('resist') * (sim.stat(source, 'armor') + sim.stat(source, 'mr'));
  if (V.dealt != null) s += g('dealt') * (ctx ? ctx.lastDealt : 0);
  return s;
}

// ---- 選取器 ---------------------------------------------------------------
function sideOf(source, ctx) { return source ? source.side : ctx.side; }
function otherSide(s) { return s === 'player' ? 'enemy' : 'player'; }
function refHex(source, side) { return source ? source.hex : { row: side === 'player' ? 5 : 2, col: 3 }; }
function byDist(list, ref) {
  return list.slice().sort((a, b) => dist(ref, a.hex) - dist(ref, b.hex) || a.ord - b.ord);
}
function targetable(sim, u) { return u.alive && !sim.has(u, 'untargetable'); }

// 目前普攻目標；死了就換「離原目標最近的敵人」（allowDead 的觸發情境保留原樣）
function resolveCurrent(sim, source, ctx) {
  let cur = ctx.current !== undefined && ctx.current !== null ? ctx.current : (source ? source.target : null);
  if (!cur) return null;
  if (cur.alive) return cur;
  if (ctx.allowDead) return cur;
  const side = sideOf(source, ctx);
  const cand = sim.alive(otherSide(side)).filter((u) => targetable(sim, u));
  if (!cand.length) return null;
  const n = byDist(cand, cur.hex)[0];
  ctx.current = n;
  return n;
}

const starOf = (source) => (source ? source.star || 1 : 1);
const AV = (v, source) => (Array.isArray(v) ? v[Math.min(Math.max(starOf(source), 1), v.length) - 1] : v);
const hyp = (a, b) => Math.sqrt(a * a + b * b);
const wdist = (a, b) => { const ca = center(a), cb = center(b); return hyp(ca.x - cb.x, ca.y - cb.y); };
const hasSt = (sim, u, k) => sim.has(u, k);
function boardLen(l) { return l === 'board' || l == null ? 20 : l; }

// 從 source 往六個方向各打一條直線，回傳含最多敵人的那一條（同數量取方向編號小的）
function bestRay(sim, source, foes, len, from) {
  const a = from || source.hex;
  let best = null;
  for (let i = 0; i < 6; i++) {
    const cells = rayDir(a, i, boardLen(len));
    const list = foes.filter((u) => cells.some((h) => same(h, u.hex)));
    if (!best || list.length > best.list.length) best = { dir: i, cells, list };
  }
  return best && best.list.length ? best : null;
}
function rayEnemies(sim, source, len) {
  const foes = sim.alive(source.side === 'player' ? 'enemy' : 'player').filter((u) => targetable(sim, u));
  return bestRay(sim, source, foes, len);
}

function filterSel(sim, source, sel, ctx, list, ref) {
  if (sel.exclude === 'current') { const c = ctx.current != null ? ctx.current : (source ? source.target : null); list = list.filter((u) => u !== c); }
  else if (sel.exclude === 'prev') { const p = ctx.prev || []; list = list.filter((u) => p.indexOf(u) < 0); }
  if (sel.prefer && sel.prefer.noStatus) { const k = sel.prefer.noStatus; list = list.filter((u) => !hasSt(sim, u, k)).concat(list.filter((u) => hasSt(sim, u, k))); }
  if (sel.max != null) list = list.slice(0, sel.max);
  return list;
}

function selectTargets(sim, source, sel, ctx) {
  if (!ctx) ctx = { side: source ? source.side : 'player', current: source ? source.target : null, prev: [], lastDealt: 0, seen: new Set() };
  const side = sideOf(source, ctx);
  const foe = otherSide(side);
  const ref = refHex(source, side);
  if (sel == null) sel = 'current';
  if (typeof sel === 'string') {
    if (sel === 'self') return source ? [source] : [];
    if (sel === 'current') { const c = resolveCurrent(sim, source, ctx); return c ? [c] : []; }
    if (sel === 'allEnemies') return sim.alive(foe);
    if (sel === 'prev') return ctx.prev || [];
    sim.warn('unknown selector ' + sel);
    return [];
  }
  const exclSet = () => {
    if (sel.exclude === 'current') { const c = ctx.current != null ? ctx.current : (source ? source.target : null); return c ? [c] : []; }
    if (sel.exclude === 'prev') return ctx.prev || [];
    return [];
  };
  const enemies = () => { const ex = exclSet(); return sim.alive(foe).filter((u) => targetable(sim, u) && ex.indexOf(u) < 0); };
  const pool = (s) => (s === 'ally' ? sim.alive(side) : sim.alive(foe).filter((u) => targetable(sim, u)));
  if (sel.nearest != null) return byDist(enemies(), ref).slice(0, sel.nearest);
  if (sel.farthest != null) {
    let l = enemies();
    if (sel.within != null) l = l.filter((u) => dist(ref, u.hex) <= sel.within);
    return l.slice().sort((a, b) => dist(ref, b.hex) - dist(ref, a.hex) || a.ord - b.ord).slice(0, sel.farthest);
  }
  if (sel.lowestHp != null) {
    return pool(sel.side || 'enemy').slice().sort((a, b) => a.hp - b.hp || dist(ref, a.hex) - dist(ref, b.hex) || a.ord - b.ord).slice(0, sel.lowestHp);
  }
  if (sel.highestHp != null) {
    return pool(sel.side || 'enemy').slice().sort((a, b) => b.hp - a.hp || dist(ref, a.hex) - dist(ref, b.hex) || a.ord - b.ord).slice(0, sel.highestHp);
  }
  if (sel.mostDamage != null) {
    return enemies().slice().sort((a, b) => b.dealt - a.dealt || dist(ref, a.hex) - dist(ref, b.hex) || a.ord - b.ord).slice(0, sel.mostDamage);
  }
  if (sel.allies != null) {
    let l = sim.alive(side);
    if (sel.notSelf && source) l = l.filter((u) => u !== source);
    if (sel.injured) l = l.filter((u) => u.hp < u.hpMax);
    l = byDist(l, ref);
    return sel.allies === 'all' ? l : l.slice(0, sel.allies);
  }
  if (sel.adjacent != null) {
    if (!source) return [];
    const ns = neighbors(source.hex);
    const want = sel.adjacent === 'ally' ? side : foe;
    return byDist(sim.alive(want).filter((u) => ns.some((h) => h.row === u.hex.row && h.col === u.hex.col)), ref);
  }
  if (sel.around != null) {
    const c = sel.around === 'self' ? source : resolveCurrent(sim, source, ctx);
    if (!c) return [];
    const r = sel.r != null ? AV(sel.r, source) : 1;
    const want = sel.side === 'ally' ? side : sel.side === 'enemy' ? foe : (sel.around === 'self' ? foe : c.side);
    let l = sim.alive(want).filter((u) => dist(c.hex, u.hex) <= r);
    if (sel.includeCenter === false) l = l.filter((u) => u !== c);
    return filterSel(sim, source, sel, ctx, byDist(l, ref), ref);
  }
  if (sel.line === 'best') {
    if (!source) return [];
    const b = rayEnemies(sim, source, sel.len);
    if (!b) return [];
    let l = byDist(b.list, source.hex);
    if (sel.exclude) l = filterSel(sim, source, { exclude: sel.exclude }, ctx, l, ref);
    if (sel.pick && sel.pick.highestHp != null) l = l.slice().sort((a, c) => c.hp - a.hp || dist(source.hex, a.hex) - dist(source.hex, c.hex) || a.ord - c.ord).slice(0, sel.pick.highestHp);
    return l;
  }
  if (sel.line != null) {
    const c = resolveCurrent(sim, source, ctx);
    if (!c || !source) return c ? [c] : [];
    const len = boardLen(sel.len);
    const cells = lineThrough(source.hex, c.hex, len);
    let set = cells;
    if ((sel.width || 1) > 1) {
      const w = sel.width - 1;
      set = [];
      for (const u of sim.alive(foe)) if (cells.some((h) => dist(h, u.hex) <= w)) set.push(u.hex);
    }
    let l = sim.alive(foe).filter((u) => set.some((h) => h.row === u.hex.row && h.col === u.hex.col));
    if (!l.includes(c) && c.alive) l.push(c);
    return byDist(l, ref);
  }
  if (sel.cone != null) {
    const c = resolveCurrent(sim, source, ctx);
    if (!c || !source) return c ? [c] : [];
    const r = sel.r != null ? AV(sel.r, source) : 2;
    return filterSel(sim, source, sel, ctx, byDist(sim.alive(foe).filter((u) => dist(source.hex, u.hex) <= r && dist(c.hex, u.hex) <= r), ref), ref);
  }
  if (sel.row != null) {   // 與目前目標同一橫列的敵人（關的剪刀）
    const c = resolveCurrent(sim, source, ctx);
    if (!c) return [];
    return byDist(sim.alive(foe).filter((u) => u.hex.row === c.hex.row && (targetable(sim, u) || u === c)), ref);
  }
  if (sel.cluster != null) {   // 周圍 r 格內敵人最多的那一名
    const r = AV(sel.cluster.r != null ? sel.cluster.r : 1, source);
    const es = enemies();
    let best = null, bn = -1, bd = 1e9;
    for (const e of es) {
      let n = 0;
      for (const o of es) if (dist(e.hex, o.hex) <= r) n++;
      const d = dist(ref, e.hex);
      if (n > bn || (n === bn && (d < bd || (d === bd && e.ord < best.ord)))) { best = e; bn = n; bd = d; }
    }
    return best ? [best] : [];
  }
  if (sel.chain != null) {   // 離自己最近、這次施放還沒跳過的敵人；都跳過了就允許重複
    const es = enemies();
    const seen = ctx.seen || new Set();
    let pl = es.filter((u) => !seen.has(u));
    if (!pl.length) pl = es;
    if (sel.within != null) { const near = pl.filter((u) => dist(ref, u.hex) <= sel.within); if (near.length) pl = near; }
    return byDist(pl, ref).slice(0, 1);
  }
  if (sel.behind != null) {   // 目標「後方」（離施法者更遠）的敵人，依條件挑
    const c = resolveCurrent(sim, source, ctx);
    if (!c || !source) return [];
    const dc = dist(source.hex, c.hex);
    let l = enemies().filter((u) => u !== c && dist(source.hex, u.hex) > dc);
    if (sel.fewestItems != null) l = l.slice().sort((a, b) => (a.items ? a.items.length : 0) - (b.items ? b.items.length : 0) || dist(c.hex, a.hex) - dist(c.hex, b.hex) || a.ord - b.ord).slice(0, sel.fewestItems);
    else l = byDist(l, c.hex);
    return l;
  }
  if (sel.marked != null) return sim.marked(source ? source.side : side, sel.marked);
  if (sel.all != null) return filterSel(sim, source, sel, ctx, byDist(enemies(), ref), ref);
  if (sel.random != null) {
    const l = enemies();
    const out = [];
    const n = Math.min(sel.random, l.length);
    for (let i = 0; i < n; i++) out.push(l.splice(sim.rng.int(l.length), 1)[0]);
    return out;
  }
  if (sel.fewestItems != null) {
    return pool(sel.side || 'enemy').slice().sort((a, b) => (a.items ? a.items.length : 0) - (b.items ? b.items.length : 0) || dist(ref, a.hex) - dist(ref, b.hex) || a.ord - b.ord).slice(0, sel.fewestItems);
  }
  sim.warn('unknown selector ' + JSON.stringify(sel));
  return [];
}

// ---- 條件 -----------------------------------------------------------------
function checkCond(sim, source, ctx, cond) {
  if (!cond) return true;
  for (const k of Object.keys(cond)) {
    const v = cond[k];
    let ok;
    switch (k) {
      case 'killed': ok = !!ctx.killed === !!v; break;
      case 'selfHpBelow': ok = !!source && source.hp / source.hpMax < v; break;
      case 'selfHpAbove': ok = !!source && source.hp / source.hpMax > v; break;
      case 'tgtStatus': {
        const c = ctx.current !== undefined && ctx.current !== null ? ctx.current : (source ? source.target : null);
        ok = !!c && sim.has(c, v);
        break;
      }
      case 'castN': { const n = AV(v, source); ok = !!source && source.castCount > 0 && source.castCount % n === 0; break; }
      case 'traitActive': ok = sim.traitActive(sideOf(source, ctx), v); break;
      case 'favorite': ok = !!(source && source.favorite) === !!v; break;
      case 'flag': ok = !!(source && source.flags[v]); break;
      case 'isMainTarget': ok = (ctx.main != null ? ctx.main === ctx.current : true) === !!v; break;
      case 'tgtMaxHpBelowSelf': { const c = ctx.current; ok = !!(c && source && c.hpMax < source.hpMax) === !!v; break; }
      case 'prevCountMax': ok = (ctx.prev ? ctx.prev.length : 0) <= AV(v, source); break;
      default: sim.warn('unknown cond ' + k); ok = false;
    }
    if (!ok) return false;
  }
  return true;
}

// ---- op 執行 --------------------------------------------------------------
function tagOf(origin) {
  const s = origin && origin.src;
  if (!s || s === 'unit' || s === 'ability') return 'ability';
  return s;
}

function runOps(sim, ops, source, origin) {
  origin = origin || { src: 'ability' };
  const ctx = {
    side: source ? source.side : origin.side,
    current: origin.current !== undefined ? origin.current : undefined,
    allowDead: !!origin.allowDead,
    prev: [], lastDealt: 0, killed: false, seen: new Set(),
  };
  exec(sim, ops || [], source, origin, ctx);
}

function exec(sim, ops, source, origin, ctx) {
  for (let i = 0; i < ops.length; i++) execOp(sim, ops[i], source, origin, ctx);
}
const cloneCtx = (ctx, over) => Object.assign({}, ctx, { prev: (ctx.prev || []).slice() }, over || {});
function secTicks(sim, sec) { return Math.max(1, Math.round(sec * sim.TPS)); }

// ---- 畫面事件（只有錄製時才算）-------------------------------------------------
const FX_KEYS = ['skin', 'r', 'dur', 'n', 'big', 'small', 'heavy', 'wide', 'thin', 'shape', 'power', 'dir', 'len', 'width', 'pulse', 'along', 'stackOnAttack', 'cosmetic'];
function idsOf(sim, spec, source, ctx) {
  if (spec == null) return [];
  if (spec === 'self') return source ? [source.id] : [];
  if (spec === 'boardCenter') return [];
  const l = selectTargets(sim, source, spec, ctx);
  return l.slice(0, 12).map((u) => u.id);
}
function emitFx(sim, spec, source, ctx, dflt) {
  if (!sim.rec) return;
  const e = { e: 'fx', name: spec.name, src: source ? source.id : null };
  const at = spec.at !== undefined ? spec.at : dflt;
  if (at === 'boardCenter') e.center = true;
  else if (at !== undefined) e.at = idsOf(sim, at, source, ctx);
  if (spec.frm !== undefined) e.frm = idsOf(sim, spec.frm, source, ctx);
  if (spec.to !== undefined) e.to = idsOf(sim, spec.to, source, ctx);
  for (const k of FX_KEYS) if (spec[k] !== undefined) e[k] = AV(spec[k], source);
  if (spec.along === 'bestLine' && source) {
    const b = rayEnemies(sim, source, spec.len);
    if (b) { const last = b.cells[b.cells.length - 1]; if (last) { const c = center(last); e.toXY = { x: c.x, y: c.y }; } e.from = { row: source.hex.row, col: source.hex.col }; }
  }
  if (spec.name === 'proj') {   // 純畫面的投射物：不延遲、不執行任何效果
    const tos = e.to || e.at || [];
    const fr = source || null;
    for (const id of tos.slice(0, 8)) sim.emit({ e: 'proj', pid: sim.nextPid(), from: fr ? { row: fr.hex.row, col: fr.hex.col } : { row: 3, col: 3 }, to: id, shape: spec.shape || 'orb', dur: 2, arc: !!spec.arc, cosmetic: true, src: fr ? fr.id : null });
    return;
  }
  sim.emit(e);
}
// op 上的 fx 屬性：這個 op 生效時，對每個實際命中的目標各播一次
function propFx(sim, spec, source, ctx, targets) {
  if (!sim.rec || !spec) return;
  if (spec.shake) sim.emit({ e: 'fx', name: 'shake', power: spec.shake, src: source ? source.id : null });
  if (spec.name === 'beam' || spec.name === 'tether' || spec.name === 'cone' || spec.name === 'proj') {
    const sp = Object.assign({}, spec, { frm: spec.frm !== undefined ? spec.frm : 'self' });
    const c2 = Object.assign({}, ctx, { prev: targets });
    emitFx(sim, Object.assign(sp, { to: 'prev' }), source, c2);
    return;
  }
  const c2 = Object.assign({}, ctx, { prev: targets });
  emitFx(sim, Object.assign({}, spec, { at: 'prev' }), source, c2);
}

// ---- 有時間的位移 ------------------------------------------------------------
function freeNeighborNear(sim, tgt, ref, own) {
  let best = null, bd = 1e9;
  for (const h of neighbors(tgt.hex)) {
    const o = sim.occAt(h);
    if (o && o !== own) continue;
    const d = dist(ref, h);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
function targetOf(sim, source, op, ctx, def) {
  const l = selectTargets(sim, source, op.to === undefined ? def : op.to, ctx).filter((u) => u.alive);
  return l[0] || null;
}

// 路徑：回傳 { cells(不含起點), line(命中用的格子段起訖), final }
function planPath(sim, source, op, ctx) {
  const p = op.path || {};
  const foe = otherSide(source.side);
  const foes = sim.alive(foe).filter((u) => targetable(sim, u));
  const a = source.hex;
  switch (p.kind) {
    case 'through': {
      const t = (selectTargets(sim, source, p.to || 'current', ctx).filter((u) => u.alive))[0];
      if (!t) return null;
      const len = Math.max(1, p.len || 2);
      const need = Math.max(dist(a, t.hex), 1) + len - 1;
      const cells = lineThrough(a, t.hex, need);
      return cells.length ? { cells, target: t } : null;
    }
    case 'bestLine': {
      const b = bestRay(sim, source, foes, p.len);
      if (!b) return null;
      return { cells: b.cells, target: b.list[0] };
    }
    case 'longestRow': {
      let best = null;
      for (const L of LINES) {
        const hits = foes.filter((u) => !(p.noStatus && sim.has(u, p.noStatus)) && L.some((h) => same(h, u.hex)));
        if (hits.length < 1) continue;
        // 方向：從離自己近的那端滑向另一端
        const d0 = dist(a, L[0]), d1 = dist(a, L[L.length - 1]);
        const cells = d0 <= d1 ? L : L.slice().reverse();
        const idx = (u) => cells.findIndex((h) => same(h, u.hex));
        const first = Math.min(...hits.map(idx)), lastI = Math.max(...hits.map(idx));
        const near = Math.min(...hits.map((u) => dist(a, u.hex)));
        const key = [hits.length, -near];
        if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { key, cells, first, last: lastI, hits };
      }
      if (!best) return null;
      // 從自己走到那一列的頭，再沿整列滑到底
      const seg = best.cells.slice(best.first, best.last + 1);
      const approach = same(a, seg[0]) ? [] : hexLine(a, seg[0]).slice(1, -1);
      return { cells: [...approach, ...seg].filter((h, i, arr) => !same(h, a) && (i === 0 || !same(h, arr[i - 1]))), target: best.hits[0], paintFrom: approach.length };
    }
    case 'toward': {
      const t = targetOf(sim, source, { to: p.to }, ctx, 'current');
      if (!t) return null;
      const land = freeNeighborNear(sim, t, a, source);
      if (!land) return null;
      return { cells: hexLine(a, land).slice(1), target: t, final: land };
    }
    case 'side':
    case 'strafe': {
      const maxD = p.dist || 1;
      const main = (ctx.current && ctx.current.alive ? ctx.current : source.target);
      const range = sim.stat(source, 'range');
      const cands = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) {
        const h = { row: r, col: c };
        const d = dist(a, h);
        if (d < 1 || d > maxD) continue;
        if (sim.occAt(h)) continue;
        if (p.keepRange && main && dist(h, main.hex) > range) continue;
        cands.push({ h, d, dm: main ? Math.abs(dist(h, main.hex) - dist(a, main.hex)) : 0 });
      }
      if (!cands.length) return null;
      // 橫向：與目標的距離變化最小的優先；strafe 取走得最遠的，side 取剛好 dist 格的
      cands.sort((x, y) => x.dm - y.dm || (p.kind === 'strafe' ? y.d - x.d : x.d - y.d) || x.h.row - y.h.row || x.h.col - y.h.col);
      const top = cands.filter((x) => x.dm === cands[0].dm && x.d === cands[0].d);
      const pick = top[(source.castCount + source.atkCount) % top.length];
      return { cells: hexLine(a, pick.h).slice(1), target: main, final: pick.h };
    }
    default:
      sim.warn('unknown pathDash kind ' + p.kind);
      return null;
  }
}

function opPathDash(sim, op, source, origin, ctx) {
  if (!source || !source.alive) return;
  const plan = planPath(sim, source, op, ctx);
  const isReturn = op.end === 'return';
  if (!plan || !plan.cells.length) {   // 走不動：直接做 then
    const c2 = cloneCtx(ctx);
    if (op.then) sim.schedule(sim.t + 1, () => { if (source.alive) exec(sim, op.then, source, origin, c2); });
    return;
  }
  const cells = plan.cells;
  const speed = op.speed || 12;
  const per = (i) => Math.max(1, Math.round((i + 1) * sim.TPS / speed));
  const total = per(cells.length - 1);
  const start = { row: source.hex.row, col: source.hex.col };
  // 終點：stay＝路徑最後一格（被佔就找最近的空格）；adjacent＝目標旁；return＝回原位
  let finalHex = plan.final || cells[cells.length - 1];
  if (isReturn) finalHex = start;
  const finalFree = sim.occAt(finalHex) && sim.occAt(finalHex) !== source ? sim.freeNear(finalHex, source) : finalHex;
  if (!finalFree) return;
  const main = plan.target || (ctx.current && ctx.current.alive ? ctx.current : source.target);
  const hitSet = new Set();
  const agg = { prev: [], lastDealt: 0, killed: false };
  // paint：染色格
  const paintSpec = op.paint || null;
  const pathHexes = [start, ...cells];
  const tok = sim.slide(source, pathHexes, finalFree, total, { trail: op.trail, style: 'slide' });
  const startIdx = plan.paintFrom || 0;
  cells.forEach((h, i) => {
    sim.schedule(sim.t + per(i), () => {
      if (!source.alive || !sim.slideAlive(source, tok)) return;
      source.hex = { row: h.row, col: h.col };
      if (paintSpec && i >= startIdx) sim.paintCell(source, h, paintSpec, origin);
      if (!op.onHit) return;
      const foe = otherSide(source.side);
      for (const e of sim.alive(foe)) {
        if (!same(e.hex, h) || hitSet.has(e) || !targetable(sim, e)) continue;
        hitSet.add(e);
        const hc = cloneCtx(ctx, { current: e, main, prev: [], lastDealt: 0, killed: false });
        exec(sim, op.onHit, source, origin, hc);
        agg.prev.push(e); agg.lastDealt += hc.lastDealt; agg.killed = agg.killed || hc.killed;
      }
    });
  });
  sim.schedule(sim.t + total, () => {
    if (!source.alive) return;
    sim.slideEnd(source, tok);
    if (main && main.alive) source.target = main;
    source.retargetAt = 0;
    if (op.then) {
      const c2 = cloneCtx(ctx, { current: main && main.alive ? main : source.target, main, prev: agg.prev.slice(), lastDealt: agg.lastDealt, killed: agg.killed });
      exec(sim, op.then, source, origin, c2);
    }
  });
}

function opLeap(sim, op, source, origin, ctx) {
  if (!source || !source.alive) return;
  const tgt = targetOf(sim, source, op, ctx, 'current');
  if (!tgt) return;
  ctx.prev = [tgt];
  if (ctx.seen) ctx.seen.add(tgt);
  const air = secTicks(sim, op.air != null ? op.air : 0.3);
  sim.leap(source, tgt, air);
  const c2 = cloneCtx(ctx, { current: tgt, main: tgt });
  sim.schedule(sim.t + air, () => {
    if (!source.alive) return;
    sim.leapEnd(source);
    source.retargetAt = 0;
    if (tgt.alive) source.target = tgt;
    if (op.onLand) exec(sim, op.onLand, source, origin, c2);
  });
}

// 找沿直線打最多敵人的落點：回傳 { hex, dir }
function bestLineSpot(sim, source, len) {
  const foes = sim.alive(otherSide(source.side)).filter((u) => targetable(sim, u));
  let best = null;
  for (const L of LINES) {
    for (const cells of [L, L.slice().reverse()]) {
      const head = cells[0];
      if (sim.occAt(head) && sim.occAt(head) !== source) continue;
      const rest = cells.slice(1, 1 + boardLen(len));
      const n = foes.filter((u) => rest.some((h) => same(h, u.hex))).length;
      if (!n) continue;
      const d = dist(source.hex, head);
      if (!best || n > best.n || (n === best.n && d < best.d)) best = { n, d, hex: head };
    }
  }
  return best;
}

function opBlink(sim, op, source, origin, ctx) {
  if (!source || !source.alive) return;
  const tgt = op.to !== undefined ? targetOf(sim, source, op, ctx, 'current') : null;
  let dest = null;
  const pl = op.place;
  if (pl === 'origin') {
    const o = source.memHex;
    if (o) dest = !sim.occAt(o) || sim.occAt(o) === source ? o : sim.freeNear(o, source);
  } else if (pl && typeof pl === 'object' && pl.bestLine) {
    const b = bestLineSpot(sim, source, pl.bestLine.len);
    if (b) dest = b.hex;
  } else if (tgt) {
    if (pl === 'behind') {
      let best = null, bd = -1;
      for (const h of neighbors(tgt.hex)) {
        const o = sim.occAt(h);
        if (o && o !== source) continue;
        const d = dist(source.hex, h);
        if (d > bd) { bd = d; best = h; }
      }
      dest = best;
    } else dest = freeNeighborNear(sim, tgt, source.hex, source);
    if (!dest) dest = sim.freeNear(tgt.hex, source);
  }
  const c2 = cloneCtx(ctx, { current: tgt || ctx.current });
  if (op.remember) source.memHex = { row: source.hex.row, col: source.hex.col };
  if (dest && !same(dest, source.hex)) {
    sim.blink(source, dest, 2);
    if (tgt && tgt.alive) source.target = tgt;
    source.retargetAt = 0;
  }
  if (op.then) sim.schedule(sim.t + 2, () => { if (source.alive) exec(sim, op.then, source, origin, c2); });
}

function opDisplace(sim, op, source, origin, ctx) {
  const ts = selectTargets(sim, source, op.to === undefined ? 'current' : op.to, ctx).filter((u) => u.alive);
  ctx.prev = ts;
  const kind = op.kind || 'knockup';
  const durTicks = (u) => secTicks(sim, evalValue(sim, source, u, op.dur != null ? op.dur : 1, ctx));
  const ordered = kind === 'pull' ? ts.slice().sort((a, b) => dist(source.hex, a.hex) - dist(source.hex, b.hex) || a.ord - b.ord) : ts;
  for (const u of ordered) {
    const dt = durTicks(u);
    if (kind === 'knockup') {
      sim.addStatus(u, 'stun', dt, 0, source);
      if (sim.has(u, 'stun') && !u.boss) sim.emit({ e: 'air', id: u.id, dur: dt, high: !!op.high });
    } else if (kind === 'knockback') {
      if (!u.boss && !sim.has(u, 'ccImmune') && source && source.alive) {
        const steps = op.dist || 1;
        let cur = u.hex;
        for (let k = 0; k < steps; k++) {
          let best = null, bd = dist(source.hex, cur);
          for (const h of neighbors(cur)) {
            if (sim.occAt(h)) continue;
            const d = dist(source.hex, h);
            if (d > bd) { bd = d; best = h; }
          }
          if (!best) break;
          cur = best;
        }
        if (!same(cur, u.hex)) sim.moveUnit(u, cur, 'knockback', 4);
      }
      sim.addStatus(u, 'stun', dt, 0, source);
    } else if (kind === 'pull') {
      if (!u.boss && !sim.has(u, 'ccImmune') && source && source.alive) {
        let best = null, bd = 1e9, bd2 = 1e9;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) {
          const h = { row: r, col: c };
          if (sim.occAt(h) && sim.occAt(h) !== u) continue;
          const d = dist(source.hex, h);
          if (d < 1) continue;
          const d2 = dist(u.hex, h);
          if (d < bd || (d === bd && d2 < bd2)) { bd = d; bd2 = d2; best = h; }
        }
        if (best && dist(source.hex, best) < dist(source.hex, u.hex)) sim.moveUnit(u, best, 'pull', 5);
      }
      sim.addStatus(u, 'stun', dt, 0, source);
    }
    u.retargetAt = 0;
  }
  if (source) source.retargetAt = 0;
}

// ---- 投射物 -----------------------------------------------------------------
function opProjectile(sim, op, source, origin, ctx) {
  if (!source) return;
  const TPS = sim.TPS;
  const speed = Math.max(1, op.speed || 12);
  const foe = otherSide(source.side);
  const targets = selectTargets(sim, source, op.to === undefined ? 'current' : op.to, ctx).filter((u) => u.alive);
  let fixedFrom = null, fromId = source.id;
  if (op.frm !== undefined) {
    const f = selectTargets(sim, source, op.frm, ctx)[0];
    if (f) { fixedFrom = { row: f.hex.row, col: f.hex.col }; fromId = f.id; }
  }
  const flight = (a, b) => Math.max(1, Math.round(wdist(a, b) / speed * TPS));
  const emitProj = (from, to, dur, extra) => {
    if (!sim.rec) return;
    sim.emit(Object.assign({ e: 'proj', pid: sim.nextPid(), from: { row: from.row, col: from.col }, fromId, to, shape: op.shape || 'orb', dur, arc: !!op.arc, spin: !!op.spin, big: !!op.big, src: source.id }, extra || {}));
  };
  const nearestAlive = (from) => {
    const c = sim.alive(foe).filter((u) => targetable(sim, u));
    return c.length ? byDist(c, from)[0] : null;
  };
  if (op.cosmetic) {
    const tg = targets[0];
    if (tg) emitProj(fixedFrom || source.hex, tg.id, flight(fixedFrom || source.hex, tg.hex), { cosmetic: true, pierce: !!op.pierce, len: op.len, width: op.width });
    return;
  }
  if (op.pattern === 'radial') return radial(sim, op, source, origin, ctx, emitProj);
  if (!targets.length) return;
  const agg = { prev: [], lastDealt: 0, killed: false };
  let pending = 0, finished = false;
  const finish = () => {
    if (finished || pending > 0) return;
    finished = true;
    if (op.onEnd) {
      const c2 = cloneCtx(ctx, { prev: agg.prev.slice(), lastDealt: agg.lastDealt, killed: agg.killed, current: agg.prev.length ? agg.prev[agg.prev.length - 1] : ctx.current });
      exec(sim, op.onEnd, source, origin, c2);
    }
  };
  const doHit = (e, extra) => {
    const hc = cloneCtx(ctx, Object.assign({ current: e, main: ctx.main != null ? ctx.main : e, prev: [], lastDealt: 0, killed: false, dmgMul: undefined, carryIn: null, carryMode: false, pierceIdx: undefined }, extra || {}));
    exec(sim, op.onHit || [], source, origin, hc);
    agg.prev.push(e); agg.lastDealt += hc.lastDealt; agg.killed = agg.killed || hc.killed;
    return hc;
  };
  const visualCount = op.spread === 'wave' ? Math.max(1, Math.round(evalValue(sim, source, null, op.count, ctx) || 1)) : 1;
  let count = op.count != null && op.spread !== 'wave' ? Math.max(1, Math.round(evalValue(sim, source, null, op.count, ctx))) : (targets.length > 1 && op.spread !== 'wave' ? targets.length : 1);
  if (op.spread === 'wave') count = 1;
  const seqGap = op.gap != null ? op.gap : (op.spread === 'seq' ? 0.08 : 0);
  const gapT = seqGap > 0 ? Math.max(1, Math.round(seqGap * TPS)) : 0;
  const fanned = op.spread === 'fan' || op.spread === 'arcfan';

  const shoot = (i) => {
    let tg = targets[i % targets.length];
    if (!tg.alive || !targetable(sim, tg)) { tg = nearestAlive(tg.hex); if (!tg) { pending--; finish(); return; } }
    const from = fixedFrom || { row: source.hex.row, col: source.hex.col };
    if (op.pierce) {
      const len = boardLen(op.len);
      const path = lineThrough(from, tg.hex, len);
      const hitsL = [];
      for (const e of sim.alive(foe)) {
        if (!targetable(sim, e)) continue;
        const j = path.findIndex((h) => same(h, e.hex));
        if (j >= 0) hitsL.push({ e, j });
      }
      hitsL.sort((a, b) => a.j - b.j || a.e.ord - b.e.ord);
      const endH = path.length ? path[path.length - 1] : tg.hex;
      const ce = center(endH);
      const total = flight(from, endH);
      emitProj(from, { x: ce.x, y: ce.y }, total, { pierce: true, n: visualCount > 1 ? visualCount : undefined, fan: fanned ? (i - (count - 1) / 2) : undefined });
      if (!hitsL.length) { pending--; finish(); return; }
      pending += hitsL.length - 1;
      hitsL.forEach((h, k) => {
        const tk = flight(from, h.e.hex);
        sim.schedule(sim.t + tk, () => {
          if (h.e.alive) {
            const mul = op.falloff ? Math.max(0.2, 1 - op.falloff * k) : 1;
            doHit(h.e, { dmgMul: mul, pierceIdx: k });
          }
          pending--; finish();
        });
      });
      return;
    }
    let hitUnit = tg;
    if (op.firstHit) {
      const path = lineThrough(from, tg.hex, 20);
      let best = null;
      for (let j = 0; j < path.length && !best; j++) {
        const e = sim.alive(foe).find((u) => same(u.hex, path[j]) && targetable(sim, u));
        if (e) best = e;
      }
      if (best) hitUnit = best;
    }
    const dur = flight(from, hitUnit.hex);
    emitProj(from, hitUnit.id, dur, { fan: fanned ? (i - (count - 1) / 2) : undefined });
    const bn = op.bounce ? (op.bounce.n != null ? op.bounce.n : 6) : 0;
    const hitSeen = [];
    const land = (cur, idx, carry, at) => {
      let e = cur;
      if (!e.alive || !targetable(sim, e)) { const n2 = nearestAlive(e.hex); if (!n2) { pending--; finish(); return; } e = n2; }
      hitSeen.push(e);
      const mul = op.bounce && op.bounce.falloff ? Math.max(op.bounce.minPct != null ? op.bounce.minPct : 0.2, 1 - op.bounce.falloff * idx) : 1;
      const hc = doHit(e, { dmgMul: mul, bounceIdx: idx, carryIn: idx > 0 && op.bounce && op.bounce.carry ? carry : null, carryMode: !!(op.bounce && op.bounce.carry) });
      if (idx < bn && (!op.bounce.when || (op.bounce.when === 'kill' && hc.killed))) {
        let nxt = null;
        if (op.bounce.pick === 'nextInPath') {
          const pathCells = lineThrough(from, tg.hex, 20);
          const k0 = Math.max(0, pathCells.findIndex((h) => same(h, e.hex)));
          for (let j = k0 + 1; j < pathCells.length && !nxt; j++) { const x = sim.alive(foe).find((u) => same(u.hex, pathCells[j]) && targetable(sim, u) && hitSeen.indexOf(u) < 0); if (x) nxt = x; }
        } else {
          const c = sim.alive(foe).filter((u) => targetable(sim, u) && hitSeen.indexOf(u) < 0);
          nxt = c.length ? byDist(c, e.hex)[0] : null;
        }
        if (nxt && (!op.bounce.carry || (hc.lastOverkill || 0) > 0)) {
          const d2 = flight(e.hex, nxt.hex);
          emitProj({ row: e.hex.row, col: e.hex.col }, nxt.id, d2, { bounce: true });
          const n3 = nxt;
          sim.schedule(sim.t + d2, () => land(n3, idx + 1, hc.lastOverkill || 0));
          return;
        }
      }
      pending--; finish();
    };
    sim.schedule(sim.t + dur, () => land(hitUnit, 0, 0));
  };
  pending = count;
  for (let i = 0; i < count; i++) {
    if (i === 0 || !gapT) shoot(i);
    else sim.schedule(sim.t + gapT * i, () => shoot(i));
  }
}

// 悟空：從施法者往六個方向各飛出 range 格再飛回；去程與回程各判定一次
function radial(sim, op, source, origin, ctx, emitProj) {
  const TPS = sim.TPS, speed = Math.max(1, op.speed || 12);
  const range = AV(op.range, source) || 2;
  const foe = otherSide(source.side);
  const from = { row: source.hex.row, col: source.hex.col };
  const outT = Math.max(1, Math.round(range / speed * TPS));
  let live = 6;
  sim.castLock(source, outT * 2 + 2);
  for (let d = 0; d < 6; d++) {
    const cells = rayDir(from, d, range);
    const endH = cells.length ? cells[cells.length - 1] : from;
    const ce = center(endH);
    emitProj(from, { x: ce.x, y: ce.y }, outT, { pierce: true, radial: d });
    const queue = [];
    const hitsCell = (e) => cells.findIndex((h) => same(h, e.hex));
    const doPhase = (phase) => {
      for (const e of sim.alive(foe)) {
        if (!targetable(sim, e)) continue;
        const j = hitsCell(e);
        if (j < 0) continue;
        const frac = (j + 1) / Math.max(1, cells.length);
        const tk = phase === 'out' ? Math.max(1, Math.round(frac * outT)) : outT + Math.max(1, Math.round((1 - frac) * outT)) + 0;
        sim.schedule(sim.t + tk, () => {
          if (!e.alive) return;
          const hc = cloneCtx(ctx, { current: e, main: e, prev: [], lastDealt: 0, killed: false, phase, retQueue: queue });
          exec(sim, op.onHit || [], source, origin, hc);
        });
      }
    };
    // 去程在 outT 內掃過，回程另外在回來的路上掃一次（回程飛行畫面由 'returns' 事件帶出）
    doPhase('out');
    if (op.returns) {
      sim.schedule(sim.t + outT, () => { emitProj(endH, source.id, outT, { pierce: true, radial: d, ret: true }); });
      doPhase('ret');
    }
    const finalT = (op.returns ? outT * 2 : outT) + 1;
    sim.schedule(sim.t + finalT, () => { for (const f of queue) { try { f(); } catch (_) { /* 施法者已死 */ } } queue.length = 0; live--; });
  }
}

function opChannel(sim, op, source, origin, ctx) {
  if (!source || !source.alive) return;
  const dur = evalValue(sim, source, null, op.dur != null ? op.dur : 2, ctx);
  const tick = op.tick || 0.5;
  const n = Math.max(1, Math.round(dur / tick));
  const tgt = targetOf(sim, source, op, ctx, 'current');
  if (!tgt) return;
  ctx.current = tgt;
  const total = secTicks(sim, dur);
  const ch = sim.channelBegin(source, total, { skin: op.skin || 'beam', tgt: tgt.id });
  const c2 = cloneCtx(ctx, { current: tgt });
  for (let k = 1; k <= n; k++) {
    const tk = Math.max(1, Math.round(k * tick * sim.TPS));
    sim.schedule(sim.t + tk, () => {
      if (!ch.active) return;
      if (!source.alive || sim.has(source, 'stun')) { sim.channelEnd(source, ch, true); return; }
      exec(sim, op.ops || [], source, origin, c2);
      if (k === n) {
        sim.channelEnd(source, ch, false);
        if (op.onEnd) exec(sim, op.onEnd, source, origin, c2);
      }
    });
  }
}

function execOp(sim, op, source, origin, ctx) {
  const tag = tagOf(origin);
  const isAbility = origin.src === 'ability' || origin.src === 'unit';
  const sel = (to, def) => selectTargets(sim, source, to === undefined ? def : to, ctx);
  const V = (v, tgt) => evalValue(sim, source, tgt || null, v, ctx);
  switch (op.op) {
    case 'damage': {
      const ts = sel(op.to, 'current').filter((u) => u.alive);
      const dealtBefore = ctx.lastDealt;
      ctx.prev = ts;
      ctx.lastDealt = 0; ctx.killed = false;
      if (!ts.length) return;
      const vctx = { lastDealt: dealtBefore };
      const Vd = (v, t) => evalValue(sim, source, t || null, v, vctx);
      const hits = op.hits != null ? Math.max(1, Math.round(V(op.hits))) : 1;
      const minPct = op.minPct != null ? op.minPct : 0.2;
      const it = ctx.iter || 0;
      let cen = null;
      if (op.distFalloff) cen = op.center === 'board' ? boardCenterHex() : (resolveCurrent(sim, source, ctx) || ts[0]).hex;
      const doHit = (k, list, immediate) => {
        let total = 0;
        for (let i = 0; i < list.length; i++) {
          let t = list[i];
          if (!t.alive) {
            const c = sim.alive(otherSide(sideOf(source, ctx))).filter((u) => targetable(sim, u));
            if (!c.length) continue;
            t = byDist(c, t.hex)[0];
          }
          let v = ctx.carryIn != null && ctx.carryMode ? ctx.carryIn : Vd(op.value, t);
          if (op.split) v /= list.length;
          if (op.falloff) v *= Math.max(minPct, 1 - op.falloff * i);
          if (op.distFalloff) v *= Math.max(minPct, 1 - op.distFalloff * dist(cen, t.hex));
          if (op.ramp) v *= 1 + op.ramp * (k + it);
          if (op.bonusVsTank && t.roleClass === 'Tank') v *= 1 + op.bonusVsTank;
          if (ctx.dmgMul != null) v *= ctx.dmgMul;
          const hpb = t.hp + sim.shieldTotal(t);
          const d = sim.damage(source, t, v, op.type || 'physical', { tag, isAbility, pen: op.pen, origin });
          total += d;
          if (ctx.carryMode && i === 0) ctx.lastOverkill = Math.max(0, d - hpb);
          if (!t.alive) ctx.killed = true;
        }
        ctx.lastDealt += total;
      };
      doHit(0, ts, true);
      if (op.fx) propFx(sim, op.fx, source, ctx, ts);
      for (let k = 1; k < hits; k++) {
        sim.schedule(sim.t + secTicks(sim, sim.C.HIT_GAP) * k, () => {
          if (source && !source.alive && origin.src === 'ability') return;
          doHit(k, ts, false);
        });
      }
      return;
    }
    case 'heal': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      for (const t of ts) {
        let v = V(op.value, t);
        if (op.missingScale) v *= 1 + op.missingScale * (1 - t.hp / t.hpMax);
        sim.heal(source, t, v, tag, origin);
      }
      return;
    }
    case 'shield': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      for (const t of ts) sim.shield(source, t, V(op.value, t), secTicks(sim, V(op.dur != null ? op.dur : 4, t)), tag, origin);
      return;
    }
    case 'stun': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      for (const t of ts) sim.addStatus(t, 'stun', secTicks(sim, V(op.dur, t)), 0, source);
      return;
    }
    case 'status': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      for (const t of ts) sim.addStatus(t, op.kind, secTicks(sim, V(op.dur != null ? op.dur : 3, t)), op.value != null ? V(op.value, t) : undefined, source);
      return;
    }
    case 'buff': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      const apply = () => {
        for (const t of ts) {
          sim.addBuff(t, {
            stat: op.stat, value: V(op.value, t),
            dur: op.dur != null ? secTicks(sim, V(op.dur, t)) : null,
            decay: !!op.decay, stackKey: op.stackKey, maxStacks: op.maxStacks, tag,
          });
        }
      };
      if (op.applyOn === 'return') { if (ctx.retQueue) ctx.retQueue.push(apply); return; }
      apply();
      return;
    }
    case 'dot': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      const tickSec = op.tick || 1;
      const n = Math.max(1, Math.round(V(op.dur || 1) / tickSec));
      for (const t of ts) {
        const per = V(op.value, t) / n;
        for (let k = 1; k <= n; k++) {
          sim.schedule(sim.t + secTicks(sim, tickSec * k), () => {
            if (!t.alive) return;
            sim.damage(source, t, per, op.type || 'magic', { tag: 'ot', isAbility, origin, ot: true });
          });
        }
      }
      return;
    }
    case 'empower': {
      const ts = sel(op.to, 'self');
      ctx.prev = ts;
      for (const t of ts) {
        sim.addEmpower(t, {
          attacksLeft: op.attacks != null ? Math.max(1, Math.round(V(op.attacks, t))) : (op.dur != null ? 9999 : 1),
          end: op.dur != null ? sim.t + secTicks(sim, V(op.dur, t)) : null,
          asPct: op.asPct != null ? V(op.asPct, t) : 0,
          onHit: op.onHit || [], replace: !!op.replace, origin, source,
        });
      }
      return;
    }
    case 'zone': {
      const at = sel(op.at, 'current');
      if (!at.length) return;
      const anchor = at[0];
      sim.addZone({
        source, side: sideOf(source, ctx), hex: { row: anchor.hex.row, col: anchor.hex.col },
        r: op.r != null ? AV(op.r, source) : 1, dur: secTicks(sim, V(op.dur != null ? op.dur : 3)),
        tick: secTicks(sim, op.tick || 1), enemy: op.enemy || null, ally: op.ally || null, origin,
        follow: !!op.follow, anchor, skin: op.skin || null, tag: op.tag || null, onEnd: op.onEnd || null,
      });
      return;
    }
    case 'dash': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      if (!ts.length || !source) return;
      sim.dash(source, ts[0], { style: op.style, trail: op.trail });
      ctx.current = ts[0];
      return;
    }
    case 'mana': {
      const ts = sel(op.to, 'self');
      ctx.prev = ts;
      for (const t of ts) sim.addMana(t, V(op.value, t), true);
      return;
    }
    case 'execute': {
      const ts = sel(op.to, 'current').filter((u) => u.alive);
      ctx.prev = ts;
      ctx.killed = false;
      for (const t of ts) {
        if (t.hp / t.hpMax < V(op.below, t)) {
          sim.damage(source, t, t.hp + sim.shieldTotal(t), 'true', { tag, isAbility, origin, raw: true });
          if (!t.alive) ctx.killed = true;
        }
      }
      return;
    }
    case 'summon': {
      sim.summon(source, ctx, op, origin, (x) => V(x));
      return;
    }
    case 'econ': {
      if (ctx.side !== 'player' && !(source && source.side === 'player')) return;
      if (op.chance != null && !sim.rng.chance(op.chance)) return;
      let val;
      if (op.value === 'killedUnit') {   // 古典樂 6：拿到被擊殺的那隻（1★）
        const c = ctx.current;
        if (!c || c.summon || !c.cost || c.cost >= 7) return;
        val = c.key;
      } else val = op.kind === 'unit' && typeof op.value !== 'number' ? op.value : V(op.value);
      sim.rewards.push({ type: op.kind, value: val, src: origin.src });
      return;
    }
    case 'repeat': {
      const times = Math.max(0, Math.floor(V(op.times)));
      const gap = op.gap || 0;
      if (op.lock && source && times > 0) sim.castLock(source, secTicks(sim, gap * Math.max(0, times - 1)) + 2);
      for (let k = 0; k < times; k++) {
        if (gap > 0 && k > 0) {
          const c2 = cloneCtx(ctx, { iter: k });
          sim.schedule(sim.t + secTicks(sim, gap * k), () => {
            if (source && !source.alive && origin.src === 'ability') return;
            exec(sim, op.ops || [], source, origin, c2);
          });
        } else { ctx.iter = k; exec(sim, op.ops || [], source, origin, ctx); }
      }
      ctx.iter = 0;
      return;
    }
    case 'delay': {
      const ticks = secTicks(sim, V(op.sec));
      if (op.lock && source) sim.castLock(source, ticks + 1);
      const c2 = cloneCtx(ctx);
      sim.schedule(sim.t + ticks, () => {
        if (source && !source.alive) return;
        exec(sim, op.ops || [], source, origin, c2);
      });
      return;
    }
    case 'if': {
      if (checkCond(sim, source, ctx, op.cond)) exec(sim, op.then || [], source, origin, ctx);
      else if (op.else) exec(sim, op.else, source, origin, ctx);
      return;
    }
    case 'flag': {
      if (source) source.flags[op.name] = !!op.on;
      return;
    }
    case 'fx': emitFx(sim, op, source, ctx); return;
    case 'pathDash': opPathDash(sim, op, source, origin, ctx); return;
    case 'leap': opLeap(sim, op, source, origin, ctx); return;
    case 'blink': opBlink(sim, op, source, origin, ctx); return;
    case 'displace': opDisplace(sim, op, source, origin, ctx); return;
    case 'projectile': opProjectile(sim, op, source, origin, ctx); return;
    case 'channel': opChannel(sim, op, source, origin, ctx); return;
    case 'roller': {
      if (!source) return;
      sim.addRoller({
        id: op.id, owner: source, side: source.side, skin: op.skin || 'discoball', hitR: op.hitR != null ? op.hitR : 0.6, speed: op.speed || 1,
        path: op.path || 'seek', rehit: secTicks(sim, op.rehit != null ? op.rehit : 4), dur: op.dur != null ? secTicks(sim, op.dur) : null,
        push: op.owner === 'push', onPass: op.onPass || [], origin,
      });
      return;
    }
    case 'rollerMod': {
      if (!source) return;
      sim.rollerMod(source, op.id, op.speedMul != null ? AV(op.speedMul, source) : null, op.sizeMul != null ? AV(op.sizeMul, source) : null);
      return;
    }
    default:
      sim.warn('unknown op ' + op.op);
  }
}

return {evalValue, rayEnemies, selectTargets, runOps};
})();
modules.stats = (() => {
// 戰前計算：羈絆計數、套羈絆／裝備／增幅，產生 Combatant。純函式、決定性。
const S = {
  baseAp: 100,          // 基礎法強（普攻回魔不在這裡給，交給引擎 C.MANA_PER_ATTACK 依定位）
  frontRowMax: 2,       // 站位 r < 2 算前排（前 2 排）
  drCap: 0.9,
  favoriteAbilityAmp: 0.25,
  mundoHpTrait: 'RecordMogul', neekoKey: 'Neeko',
};

const { neighbors, playerToBoard } = modules.hex;
const MX = modules.mixer;

const r1 = (x) => Math.round(x * 1000) / 1000;
const keyCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- 羈絆計數 ----------
function hasProducer(t) {
  const effs = [].concat(t.always || [], ...(t.tiers || []));
  return effs.some((e) => e && e.type === 'special' && e.id === 'producer');
}

function countTraits(units, DATA, opts = {}) {
  const seen = {};
  const field = [];
  for (const u of units) {
    if (!u || seen[u.key]) {
      // 同 key 只算一次；K/DA 星數取最高那隻
      if (u && seen[u.key] && u.star > seen[u.key].star) seen[u.key].star = u.star;
      continue;
    }
    const def = DATA.units.byKey[u.key];
    if (!def) continue;
    seen[u.key] = { key: u.key, star: u.star || 1, def };
    field.push(seen[u.key]);
  }
  const raw = {}; // traitKey -> {count, members}
  for (const f of field) {
    for (const tk of f.def.traits || []) {
      const t = DATA.traits.byKey[tk];
      if (!t) continue;
      const r = raw[tk] || (raw[tk] = { count: 0, members: [] });
      r.count += t.countMode === 'stars' ? f.star : 1; // BaronNashor 佔 2 人口但只算 1
      r.members.push(f.key);
    }
  }
  // 製作人：索娜在場，人數最多的 origin 羈絆 +1（同數取 key 字母序）
  const producerOn = DATA.traits.list.some((t) => raw[t.key] && hasProducer(t));
  if (producerOn) {
    let pick = opts.producerPick && raw[opts.producerPick] ? opts.producerPick : null;
    if (!pick && !opts.manual) {   // manual：玩家自己拖「合作邀請」選，沒選就不加；沒給 manual（敵方、舊測試）維持自動挑
      const origins = Object.keys(raw).filter((k) => DATA.traits.byKey[k].kind === 'origin').sort(keyCmp);
      let best = -1;
      for (const k of origins) if (raw[k].count > best) { best = raw[k].count; pick = k; }
    }
    if (pick) raw[pick].count += 1;
  }
  const out = [];
  for (const k of Object.keys(raw).sort(keyCmp)) {
    const t = DATA.traits.byKey[k];
    const bp = t.breakpoints || [];
    const count = raw[k].count;
    let tier = 0;
    for (let i = 0; i < bp.length; i++) if (count >= bp[i]) tier = i + 1;
    const next = tier < bp.length ? bp[tier] : null;
    out.push({ key: k, zh: t.zh, kind: t.kind, count, tier, tierCount: tier > 0 ? bp[tier - 1] : 0,
      breakpoints: bp, next, need: next === null ? 0 : next - count, active: tier > 0,
      members: raw[k].members.slice().sort(keyCmp) });
  }
  const grp = (x) => (x.kind === 'unique' ? 2 : x.active ? 0 : 1);
  out.sort((a, b) => grp(a) - grp(b)
    || (grp(a) === 0 && b.tier - a.tier) || (b.count - a.count) || keyCmp(a.key, b.key));
  return out;
}

// ---------- 建隊 ----------
function resolveV(v, star, c) {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v[Math.min(star, v.length) - 1];
  if (!v) return 0;
  let s = 0;
  const f = (x) => resolveV(x, star, c);
  if (v.flat != null) s += f(v.flat);
  if (v.ap != null) s += f(v.ap) * (c.ap / 100);
  if (v.selfMaxHp != null) s += f(v.selfMaxHp) * c.hp;
  return s;
}

function itemDef(DATA, key) {
  return DATA.items.byKey[key] || (DATA.items.compByKey && DATA.items.compByKey[key]) || null;
}

function buildTeam(side, units, DATA, ctx = {}) {
  const level = ctx.level || 1, round = ctx.round || 1;
  const persist = ctx.persist || {};
  const mods = ctx.mods || {};
  const notes = [];
  const teamPassives = [];
  const deferred = [];
  const pre = side === 'enemy' ? 'e' : 'p';
  const sm = DATA.units.starMult;

  const L = units.map((u, i) => {
    const def = DATA.units.byKey[u.key];
    if (!def) throw new Error('未知棋子：' + u.key);
    const star = u.star || 1;
    return { i, id: pre + i, u, def, star, items: (u.items || []).slice(), pos: u.pos,
      mods: [], passives: [], shields: [], scales: [], bounce: null, favorite: false };
  });
  const add = (st, src, stat, value) => { if (value !== 0 && value != null) st.mods.push({ src, stat, value }); };

  // 裝備
  for (const st of L) {
    for (const ik of st.items) {
      const it = itemDef(DATA, ik);
      if (!it) { notes.push('略過未知裝備：' + ik); continue; }
      const src = 'item:' + ik;
      let stats = it.stats || {};
      if (ik === 'ThiefsGloves') {
        // 竊賊手套：複製 2 件成品 stats（有 ctx.rng 用之；否則取字母序前 2 件，決定性）
        const pool = DATA.items.list ? DATA.items.list : Object.keys(DATA.items.byKey).sort(keyCmp).map((k) => DATA.items.byKey[k]);
        const cand = pool.filter((x) => x.key !== ik && x.recipe);
        const picks = [];
        const c2 = cand.slice();
        for (let n = 0; n < 2 && c2.length; n++) {
          const j = ctx.rng ? ctx.rng.int(c2.length) : 0;
          picks.push(c2.splice(j, 1)[0]);
        }
        stats = {};
        for (const p of picks) for (const k of Object.keys(p.stats || {}).sort()) stats[k] = (stats[k] || 0) + p.stats[k];
        notes.push('竊賊手套複製：' + picks.map((p) => p.zh || p.key).join('、'));
      }
      for (const k of Object.keys(stats).sort(keyCmp)) add(st, src, k, stats[k]);
      for (const p of it.passives || []) st.passives.push({ ...p, src });
    }
  }

  const traits = countTraits(units, DATA, { augments: ctx.augments, producerPick: ctx.producerPick, manual: !!ctx.manual });
  const activeNonUnique = traits.filter((t) => t.active && t.kind !== 'unique').length;

  const sortedBy = (arr) => arr.slice().sort((a, b) =>
    b.items.length - a.items.length || b.def.cost - a.def.cost || keyCmp(a.u.key, b.u.key) || a.i - b.i);

  // ---- 海灘流行的沙灘樂器：場上的召喚物（佔格、不能被選為目標、不會動、不會攻擊）----
  // 開戰那一刻站在樂器相鄰 6 格內的友軍整場有效（同一隻貼著多個樂器只算一次）。
  // 玩家：ctx.instruments＝自己擺的位置（我方半場座標 [r,c]，擺得早的在前），前 N 個有效（N＝海灘流行階數）。
  // 敵方（或沒給 ctx.instruments 的舊呼叫）：自動擺在能碰到最多海灘流行成員的空格。
  const cellOf = (st) => (side === 'enemy' ? { row: 3 - st.pos[0], col: 6 - st.pos[1] } : { row: 4 + st.pos[0], col: st.pos[1] });
  const ckey = (h) => h.row + ',' + h.col;
  const instruments = [];
  const bpInfo = traits.find((t) => t.key === 'BeachPop');
  const instN = bpInfo && bpInfo.tier > 0 ? bpInfo.tier : 0;
  if (instN > 0) {
    const used = new Set(L.filter((st) => st.pos).map((st) => ckey(cellOf(st))));
    const local = (rc) => (side === 'enemy' ? { row: 3 - rc[0], col: 6 - rc[1] } : { row: 4 + rc[0], col: rc[1] });
    if (Array.isArray(ctx.instruments)) {
      for (const rc of ctx.instruments) {
        if (instruments.length >= instN) break;
        if (!rc || !(rc[0] >= 0 && rc[0] < 4 && rc[1] >= 0 && rc[1] < 7)) continue;
        const h = local(rc);
        if (used.has(ckey(h))) continue;
        used.add(ckey(h)); instruments.push(h);
      }
    } else if (side === 'enemy' || !ctx.manual) {
      const members = L.filter((st) => st.pos && (st.def.traits || []).includes('BeachPop'));
      const coveredM = new Set(), coveredAll = new Set();
      for (let n = 0; n < instN; n++) {
        let best = null, bs = null;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
          const h = local([r, c]);
          if (used.has(ckey(h))) continue;
          const nb = new Set(neighbors(h).map(ckey));
          let m = 0, a = 0;
          for (const st of L) if (st.pos && nb.has(ckey(cellOf(st)))) { if (!coveredAll.has(st.i)) a++; if (!coveredM.has(st.i) && members.includes(st)) m++; }
          if (!bs || m > bs[0] || (m === bs[0] && a > bs[1])) { bs = [m, a]; best = h; }
        }
        if (!best) break;
        used.add(ckey(best)); instruments.push(best);
        const nb = new Set(neighbors(best).map(ckey));
        for (const st of L) if (st.pos && nb.has(ckey(cellOf(st)))) { coveredAll.add(st.i); if (members.includes(st)) coveredM.add(st.i); }
      }
    }
  }
  const boosted = new Set();
  if (instruments.length) {
    const near = new Set();
    for (const h of instruments) for (const n of neighbors(h)) near.add(ckey(n));
    for (const st of L) if (st.pos && near.has(ckey(cellOf(st)))) boosted.add(st.i);
  }

  const resolveWho = (who, env) => {
    const isM = (st) => env.traitKey && (st.def.traits || []).includes(env.traitKey);
    if (who == null || who === 'team') return L;
    if (who === 'members') return L.filter(isM);
    if (who === 'nonMembers') return L.filter((s) => !isM(s));
    if (who === 'frontRows') return L.filter((s) => s.pos && s.pos[0] < S.frontRowMax);
    if (who === 'noItems') return L.filter((s) => !s.items.length);
    if (who === 'backRows') return L.filter((s) => s.pos && s.pos[0] >= S.frontRowMax);
    if (who === 'mostItemsAlly') return sortedBy(L).slice(0, 1);
    if (who === 'spotlight' || who === 'contract') {
      // 玩家自己拖上去的標記（聚光燈／唱片合約）才算；敵方沒有介面，維持自動給裝備最多的
      if (side === 'player' && ctx.manual) return L.filter((s) => (who === 'spotlight' ? s.u.spot : s.u.deal));
      return sortedBy(L).slice(0, 1);
    }
    if (who === 'instrumented') return L.filter((s) => boosted.has(s.i));
    if (who === 'instrumentedMembers') return L.filter((s) => boosted.has(s.i) && isM(s));
    if (who === 'favorites') return L.filter((s) => s.favorite);
    if (typeof who === 'object') {
      if (who.unit) {
        const c = L.filter((s) => s.u.key === who.unit).sort((a, b) => b.star - a.star || a.i - b.i);
        return c.slice(0, 1);
      }
      if (who.mostItems != null) return sortedBy(L.filter(isM)).slice(0, who.mostItems);
      if (who.trait) return L.filter((s) => (s.def.traits || []).includes(who.trait));   // 整合決定：{trait:key}＝場上該羈絆成員
    }
    notes.push('未知 who：' + JSON.stringify(who));
    return [];
  };

  const effectsOf = (t, info) => [].concat(t.always || [], (t.tiers || [])[info.tier - 1] || []);
  const envs = traits.filter((t) => t.active).map((info) => {
    const t = DATA.traits.byKey[info.key];
    return { info, effs: effectsOf(t, info), env: { src: 'trait:' + info.key, traitKey: info.key, tier: info.tier } };
  });
  const augEnvs = ((ctx.augments) || []).map((k) => DATA.augments.byKey[k]).filter(Boolean)
    .map((a) => ({ effs: a.effects || [], env: { src: 'aug:' + a.key, traitKey: null } }));
  const all = envs.concat(augEnvs);

  // 第一輪：心鋼最愛（其他效果要用 favorites）
  for (const { effs, env } of all) {
    for (const e of effs) {
      if (e.type === 'special' && e.id === 'favorite') {
        const pool = L.filter((s) => (s.def.traits || []).includes(env.traitKey));
        // 玩家：只認自己拖上去的「心鋼最愛」標記（unit.fav = 第幾個放的，1 起算），沒放就不強化。
        // 敵方沒有介面可選，維持自動挑裝備最多的。
        const picked = side === 'enemy'
          ? sortedBy(pool)
          : pool.filter((s) => s.u.fav).sort((a, b) => a.u.fav - b.u.fav || a.i - b.i);
        for (const st of picked.slice(0, e.n || 0)) {
          st.favorite = true;
          add(st, env.src, 'abilityAmp', S.favoriteAbilityAmp);
        }
      }
    }
  }

  // 效果條件 cond（整合決定）：noAdjacentAlly／threeStarCount 在這裡判斷；bonusHpOver 要等生命算完，先記下來
  const threeStars = L.filter((s) => s.star >= 3).length;
  const occupied = new Set(L.filter((s) => s.pos).map((s) => { const h = playerToBoard(s.pos); return h.row + ',' + h.col; }));
  const lonely = (st) => {
    if (!st.pos) return true;
    return !neighbors(playerToBoard(st.pos)).some((h) => occupied.has(h.row + ',' + h.col));
  };
  const condOk = (cond, st) => {
    if (!cond) return true;
    if (cond.noAdjacentAlly && !lonely(st)) return false;
    if (cond.threeStarCount) {
      const c = cond.threeStarCount;
      if (c.min != null && threeStars < c.min) return false;
      if (c.max != null && threeStars > c.max) return false;
    }
    return true;
  };

  // ---- ILLBEATS 混音器 ----
  // 玩家：ctx.mixer＝[攻擊, 法強, 生命, 金幣] 分貝（玩家自己在混音器推的）；敵方、舊測試沒給就用預設分法（攻擊／法強／生命平分）。
  // 成員拿全額，其他隊友拿 teamShare 成；4 階整個混音再乘 boost。金幣推桿換成「我方擊殺時拿 1 金的機率」，由 game.js 在戰後結算。
  let mixerOut = null;
  const applyMixer = (e, env) => {
    const P = { caps: e.caps || [10, 14, 18], boost: e.boost || [1, 1, 1.5], teamShare: e.teamShare != null ? e.teamShare : 0.5, per: { ad: 0.0216, ap: 2, hp: 0.0176, gold: 0.02, ...(e.per || {}) } };
    const tier = env.tier || 1, cap = MX.mixerCap(P, tier);
    const mix = { db: Array.isArray(ctx.mixer) ? ctx.mixer.slice(0, 4) : MX.defaultMix(cap).db, last: [] };
    MX.fitMix(mix, cap);
    const v = MX.mixerValues(P, tier, mix.db);
    const isM = (st) => (st.def.traits || []).includes(env.traitKey);
    for (const st of L) {
      const share = isM(st) ? 1 : P.teamShare;
      add(st, env.src, 'hpPct', r1(v.hp * share));
      add(st, env.src, 'adPct', r1(v.ad * share));
      add(st, env.src, 'ap', Math.round(v.ap * share * 10) / 10);
    }
    mixerOut = { tier, cap, db: mix.db.slice(), values: v, members: L.filter(isM).map((st) => st.id),
      gold: { member: Math.min(1, v.gold), other: Math.min(1, v.gold * P.teamShare) } };
  };
  const SPECIALS = ['soulLink', 'executeSummon', 'clone', 'untargetableStart', 'classical'];
  const applyEffect = (e, env) => {
    const mult0 = e.perPersist ? (persist[e.perPersist] || 0) : 1;
    switch (e.type) {
      case 'stat': case 'statPerLevel': case 'statPerActiveTrait': {
        const m = mult0 * (e.type === 'statPerLevel' ? level : e.type === 'statPerActiveTrait' ? activeNonUnique : 1)
          * (e.perFrontRow ? L.filter((s) => s.pos && s.pos[0] < S.frontRowMax).length : 1);   // perFrontRow：前排每有一隻就算一份
        for (const st of resolveWho(e.who, env)) {
          if (!condOk(e.cond, st)) continue;
          if (e.cond && e.cond.bonusHpOver != null) { st.late = st.late || []; st.late.push({ e, env, m }); continue; }
          for (const k of Object.keys(e.stats).sort(keyCmp)) {
            const v = e.stats[k];
            add(st, env.src, k, typeof v === 'boolean' ? (v ? 1 : 0) : v * m);
          }
        }
        break;
      }
      case 'statPerMember': {
        const targets = resolveWho(e.who, env);
        for (const mk of Object.keys(e.table).sort(keyCmp)) {
          if (!L.some((s) => s.u.key === mk)) continue;
          for (const st of targets) {
            const isMem = env.traitKey && (st.def.traits || []).includes(env.traitKey);
            const m = 1 + (isMem && e.memberMult ? e.memberMult : 0);
            for (const k of Object.keys(e.table[mk]).sort(keyCmp)) add(st, env.src, k, e.table[mk][k] * m);
          }
        }
        break;
      }
      case 'statByStar': {
        for (const st of L.filter((s) => s.u.key === e.unit)) {
          if (!condOk(e.cond, st)) continue;
          for (const k of Object.keys(e.stats).sort(keyCmp)) {
            const v = e.stats[k];
            add(st, env.src, k, Array.isArray(v) ? v[st.star - 1] : v);
          }
        }
        break;
      }
      case 'missingHpScale':
        for (const st of resolveWho(e.who, env)) st.scales.push({ src: env.src, stat: e.stat, min: e.min, max: e.max });
        break;
      case 'startShield':
        for (const st of resolveWho(e.who, env)) st.shields.push({ v: e.value, hpPct: e.hpPct, dur: e.dur });
        break;
      case 'passive':
        for (const st of resolveWho(e.who, env)) st.passives.push({ ...e.passive, src: env.src });
        break;
      case 'teamPassive':
        teamPassives.push({ ...e.passive, src: env.src });
        break;
      case 'bounce':
        for (const st of resolveWho(e.who, env)) st.bounce = { count: e.count, pct: e.pct, src: env.src };
        break;
      case 'econ': case 'counterReward': case 'teamSize':
        deferred.push({ src: env.src, effect: e }); // 給 game.js
        break;
      case 'special': {
        if (e.id === 'mixer') applyMixer(e, env);
        else if (SPECIALS.includes(e.id)) {
          const { type, id, ...params } = e;
          // 整合決定：參數同時放頂層（引擎讀這裡）與 params（相容 E2 測試）
          teamPassives.push({ ...params, on: 'special', id: e.id, params, src: env.src, text: e.text || '' });
        } else if (e.id !== 'favorite' && e.id !== 'producer' && e.id !== 'kdaStars') notes.push('未知 special：' + e.id);
        break;
      }
      case 'rule': deferred.push({ src: env.src, effect: e }); break;
      default: notes.push('未知效果類型：' + e.type);
    }
  };
  for (const { effs, env } of all) for (const e of effs) applyEffect(e, env);

  // 跨回合累計的個人加成
  for (const st of L) {
    if (persist.mundoHp && (st.def.traits || []).includes(S.mundoHpTrait)) add(st, 'persist:mundoHp', 'hp', persist.mundoHp);
    if (persist.interestHp) add(st, 'persist:interestHp', 'hp', persist.interestHp);   // 投資策略：賺的利息換成永久生命
    if (persist.neekoAp && st.u.key === S.neekoKey) add(st, 'persist:neekoAp', 'ap', persist.neekoAp);
  }
  // 頭目：mods.boss 只套在頭目本體；extraPassives 掛在頭目身上（頭目死了機制就停），沒有頭目才當隊伍被動
  const bossSt = mods.boss ? (L.find((s) => s.u.boss) || L.find((s) => s.u.key === mods.boss.key) || null) : null;
  for (const p of mods.extraPassives || []) {
    if (bossSt) bossSt.passives.push({ ...p, src: p.src && p.src !== 'unit' ? p.src : 'boss' });
    else teamPassives.push({ ...p, src: p.src || 'boss' });
  }

  // 結算
  const combatants = L.map((st) => {
    const sum = {};
    for (const m of st.mods) sum[m.stat] = (sum[m.stat] || 0) + m.value;
    const g = (k) => sum[k] || 0;
    const s = st.def.stats;
    const baseHp = Math.round(s.hp * sm.hp[st.star - 1]);
    const baseAd = Math.round(s.ad * sm.ad[st.star - 1]);
    let hp = baseHp * (1 + g('hpPct')) + g('hp');
    // 晚判斷的條件效果（鄉村：開場額外生命 > N）
    for (const lt of st.late || []) {
      if (hp - baseHp <= lt.e.cond.bonusHpOver) continue;
      for (const k of Object.keys(lt.e.stats).sort(keyCmp)) { add(st, lt.env.src, k, lt.e.stats[k] * lt.m); sum[k] = (sum[k] || 0) + lt.e.stats[k] * lt.m; }
    }
    const isBoss = bossSt === st;
    if (mods.hpMult) hp *= mods.hpMult;
    if (isBoss && mods.boss.hpMult) hp *= mods.boss.hpMult;
    hp = Math.max(1, Math.round(hp));
    const ad = Math.round(baseAd * (1 + g('adPct')));
    const ap = S.baseAp + g('ap');
    let dmgAmp = g('dmgAmp');
    if (mods.dmgMult) dmgAmp = (1 + dmgAmp) * mods.dmgMult - 1;
    if (isBoss && mods.boss.dmgMult) dmgAmp = (1 + dmgAmp) * mods.boss.dmgMult - 1;
    const manaMax = s.mana[1] ? Math.round(s.mana[1] * (1 + g('manaMaxPct'))) : 0;
    let startShield = 0, startShieldDur = 0;
    for (const sh of st.shields) {
      startShield += sh.hpPct != null ? sh.hpPct * hp : resolveV(sh.v, st.star, { hp, ap });
      startShieldDur = Math.max(startShieldDur, sh.dur || 0);
    }
    const sources = st.mods.map((m) => ({ src: m.src, stat: m.stat, value: m.value }));
    if (startShield) sources.push({ src: 'shield', stat: 'startShield', value: Math.round(startShield) });
    const c = {
      id: st.id, side, key: st.u.key, zh: st.def.zh, star: st.star, cost: st.def.cost,
      roleClass: st.def.roleClass, dmgType: st.def.dmgType, slots: st.def.slots || 1,
      hex: side === 'enemy' ? { row: 3 - st.pos[0], col: 6 - st.pos[1] } : { row: 4 + st.pos[0], col: st.pos[1] },
      hp, ad, ap: Math.round(ap), as: r1(s.as * (1 + g('asPct'))),
      armor: Math.round(s.armor + g('armor')), mr: Math.round(s.mr + g('mr')),
      range: s.range, crit: r1(Math.min(1, s.crit + g('crit'))), critDmg: r1(s.critDmg + g('critDmg')),
      mana: manaMax ? Math.min(manaMax, Math.round(s.mana[0] + g('startMana'))) : 0, manaMax,
      manaRegen: g('manaRegen'),
      dmgAmp: r1(dmgAmp), dr: r1(Math.min(S.drCap, g('dr'))), omnivamp: r1(g('omnivamp')),
      abilityAmp: r1(g('abilityAmp')), abilityCrit: g('abilityCrit') > 0, startShield: Math.round(startShield),
      ability: st.def.ability || null,
      passives: (st.def.passives || []).map((p) => ({ ...p, src: p.src || 'unit' })).concat(st.passives),
      traits: (st.def.traits || []).slice(), items: st.items.slice(), sources,
      // 擴充欄位（引擎／介面可用）
      baseHp, baseAd, abilityDr: r1(g('abilityDr')), startShieldDur, favorite: st.favorite, cloneAnchor: !!st.u.cloneAt,
      missingHpScales: st.scales, missingHp: st.scales.length ? st.scales.map((m) => ({ stat: m.stat, min: m.min, max: m.max })) : null,
      bounce: st.bounce, trueDmgPct: r1(g('trueDmgPct')),
    };
    if (isBoss) { c.boss = true; c.ccCap = mods.boss.ccCap != null ? mods.boss.ccCap : 0.5; c.slotsScale = mods.boss.slotsScale || 1.3; }
    return c;
  });
  return { combatants, teamPassives, traits, notes, deferred, instruments, mixer: mixerOut };
}

return {S, countTraits, buildTeam};
})();
modules.engine = (() => {
// 戰鬥引擎（SPEC 第 3 章）。純邏輯、決定性：不用 Math.random / Date / Math.pow 等。
const { makeRng } = modules.rng;
const { dist, neighbors, within, ROWS, COLS, center, same } = modules.hex;
const { runOps, selectTargets, evalValue } = modules.ops;

const C = {
  TPS: 20,
  START_DELAY: 1.0,
  MOVE_TICKS: 7,
  MOVE_TICKS_OT: 5,
  RETARGET: 0.5,
  OVERTIME_START: 30,
  OVERTIME_MULT: 1.1,
  OVERTIME_HEAL_STEP: 0.1,
  OVERTIME_HEAL_MIN: 0.3,
  MAX: 45,
  AS_MIN: 0.2,
  AS_MAX: 5.0,
  CRIT: 0.25,
  CRIT_DMG: 1.4,
  CRIT_OVER_TO_DMG: 0.5,
  MANA_PER_ATTACK: { Tank: 5, Fighter: 10, Assassin: 10, Marksman: 10, Caster: 7, Specialist: 0 },
  MANA_REGEN: { Caster: 2 },
  TANK_MANA_PRE: 0.01,
  TANK_MANA_POST: 0.03,
  TANK_MANA_CAP: 42.5,
  MANA_LOCK: 1.0,
  CAST_TIME: 0.5,
  FIGHTER_AS: [[5, 0.05], [10, 0.10], [15, 0.15], [20, 0.20], [25, 0.25], [30, 0.30]], // [回合上限, 攻速加成]
  ASSASSIN_DR: 0.15,
  DR_CAP: 0.9,
  BURN: 0.01,
  WOUND: 0.33,
  CHILL: 0.2,
  SHRED: 0.3,
  SUNDER: 0.3,
  WEAKEN: 0.2,
  VULNERABLE: 0.2,
  HIT_GAP: 0.1,
  DASH_TICKS: 4,
  MANA_SAMPLE_TICKS: 10,
  CHARM_DMG_REDUCE: 0.1,
  CHARM_SEC: 6,
  EXEC_BELOW: 0.1,
  EXEC_GHOUL: { as: 0.8, armor: 30, mr: 30, range: 1 },
  CLONE: { hpPct: 0.5, dmgMult: 0.3 },
  SOUL_SHARE: 0.7,
  SOUL_HEAL: 0.15,
  UNTARGETABLE_SEC: 12,
  START_SHIELD_SEC: 4,
  SUMMON_DEFAULT: { as: 0.75, armor: 30, mr: 30, range: 1 },
  EIGHTBIT_KEY: 'MissFortune',
  EIGHTBIT_MULT: 3,
  MAX_PASSIVE_DEPTH: 4,
  ROLLER_EMIT: 4,
};

const hyp = (a, b) => Math.sqrt(a * a + b * b);
const TYPE_CH = { physical: 'p', magic: 'm', true: 't' };
const TYPE_KEY = { physical: 'phys', magic: 'magic', true: 'true' };
function trKey(src) { return typeof src === 'string' && src.startsWith('trait:') ? src.slice(6) : null; }
function numOf(id) { const n = parseInt(String(id).replace(/^\D+/, ''), 10); return Number.isFinite(n) ? n : 0; }
function other(s) { return s === 'player' ? 'enemy' : 'player'; }

function simulate(setup) {
  const teams = JSON.parse(JSON.stringify(setup.teams));
  const opts = setup.opts || {};
  const rec = opts.record !== false;
  const TPS = C.TPS;
  const maxTicks = Math.round((opts.maxSeconds != null ? opts.maxSeconds : C.MAX) * TPS);
  const startTick = Math.round(C.START_DELAY * TPS);
  const rng = makeRng(setup.seed);
  const events = [];
  const buckets = [];
  let t = 0;
  let inQueue = false;
  let passiveDepth = 0;
  let otK = 0, otDmg = 1, otAs = 1, healFactor = 1;
  const warnings = [];
  const units = [];
  const byId = {};
  const occ = new Array(ROWS * COLS).fill(null);
  const byUnit = {};
  const byTrait = {};        // 我方羈絆貢獻（給結算畫面）
  const byTraitEnemy = {};   // 敵方羈絆貢獻（整合決定：分開記，避免混進我方）
  const rewards = [];
  const reg = {};
  const links = [];
  const classical = { player: null, enemy: null };
  const execs = { player: null, enemy: null };
  const active = { player: new Set(), enemy: new Set() };
  const nextNum = { player: 0, enemy: 0 };
  const rollers = [];
  const paintZones = [];
  let pidN = 0, oidN = 0;
  const sideTeams = ['player', 'enemy'];

  const secTicks = (sec) => Math.max(1, Math.round(sec * TPS));
  const emit = (e) => { if (rec) { e.t = t; events.push(e); } };
  const bt = (k, side) => { const m = side === 'enemy' ? byTraitEnemy : byTrait; return m[k] || (m[k] = { procs: 0, dmg: 0, heal: 0, shield: 0 }); };
  const cell = (h) => h.row * COLS + h.col;

  function schedule(tick, fn) {
    if (tick < t || (tick === t && !inQueue)) tick = inQueue ? t : t + 1;
    (buckets[tick] || (buckets[tick] = [])).push(fn);
  }

  // ---- 單位 -----------------------------------------------------------------
  function fighterBonus(round) {
    for (const [mx, p] of C.FIGHTER_AS) if (round <= mx) return p;
    return C.FIGHTER_AS[C.FIGHTER_AS.length - 1][1];
  }
  function makeUnit(c, summon) {
    const role = c.roleClass || 'Fighter';
    const u = {
      id: c.id, side: c.side, key: c.key, zh: c.zh, star: c.star || 1, cost: c.cost || 0,
      roleClass: role, dmgType: c.dmgType, slots: c.slots || 1,
      hex: { row: c.hex.row, col: c.hex.col },
      hpMax: c.hp, hp: c.hp, ad: c.ad || 0, baseAd: c.baseAd || c.ad || 1, ap: c.ap != null ? c.ap : 100,
      as: c.as || 0.7, armor: c.armor || 0, mr: c.mr || 0, range: c.range || 1,
      crit: c.crit != null ? c.crit : C.CRIT, critDmg: c.critDmg != null ? c.critDmg : C.CRIT_DMG,
      mana: c.mana || 0, manaMax: c.manaMax || 0, manaRegen: c.manaRegen || 0,
      manaPerAttack: c.manaPerAttack != null ? c.manaPerAttack : (C.MANA_PER_ATTACK[role] || 0),
      dmgAmp: c.dmgAmp || 0, dr: c.dr || 0, omnivamp: c.omnivamp || 0, abilityAmp: c.abilityAmp || 0,
      abilityCrit: !!c.abilityCrit, abilityDr: c.abilityDr || 0,
      ability: c.ability || null, passives: c.passives || [], traits: c.traits || [], items: c.items || [],
      favorite: !!c.favorite, cloneAnchor: !!c.cloneAnchor, bounce: c.bounce || null, missingHp: c.missingHp || null,
      trueDmgPct: c.trueDmgPct || 0, startShield: c.startShield || 0, startShieldDur: c.startShieldDur || C.START_SHIELD_SEC,
      asBase: 0, summon: !!summon, ccCap: c.ccCap || 0, boss: !!c.boss, stackGains: {},
      ord: numOf(c.id) * 2 + (c.side === 'enemy' ? 1 : 0),
      alive: true, buffs: [], status: {}, shields: [], empowers: [], flags: {},
      target: null, retargetAt: 0, prog: 0, castUntil: 0, moveUntil: 0, manaLockUntil: 0,
      castCount: 0, atkCount: 0, dealt: 0, lastManaEmit: -1, executed: false,
    };
    if (opts.round != null && role === 'Fighter' && !summon) u.asBase = fighterBonus(opts.round);
    byUnit[u.id] = { dmg: 0, phys: 0, magic: 0, true: 0, taken: 0, heal: 0, shield: 0, casts: 0, kills: 0, alive: true, hpLeft: u.hp };
    return u;
  }
  function snap(u, summon) {
    const o = { id: u.id, side: u.side, key: u.key, zh: u.zh, star: u.star, cost: u.cost, hex: { row: u.hex.row, col: u.hex.col }, hpMax: u.hpMax, manaMax: u.manaMax, items: u.items.slice() };
    if (summon) o.summon = true;
    if (u.boss) o.boss = true;
    return o;
  }
  const aliveList = (side) => units.filter((u) => u.alive && (side == null || u.side === side));

  // ---- 狀態與屬性 -------------------------------------------------------------
  const has = (u, k) => { const s = u.status[k]; return !!s && s.end > t; };
  const statusVal = (u, k) => (has(u, k) ? u.status[k].value : 0);
  const targetable = (u) => u.alive && !has(u, 'untargetable');

  function mod(u, k) {
    let s = 0;
    const bs = u.buffs;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.stat !== k || b.dead) continue;
      if (b.end !== null && b.end <= t) continue;
      let f = 1;
      if (b.decay) f = (b.end - t) / (b.end - b.start);
      s += b.value * f;
    }
    if (u.missingHp) {
      for (const m of u.missingHp) if (m.stat === k) s += m.min + (m.max - m.min) * (1 - u.hp / u.hpMax);
    }
    return s;
  }
  function empowerAs(u) {
    let s = 0;
    for (const e of u.empowers) if (e.attacksLeft > 0 && (e.end === null || e.end > t)) s += e.asPct;
    return s;
  }
  function stat(u, k) {
    switch (k) {
      case 'ad': return Math.max(0, u.ad * (1 + mod(u, 'adPct')));
      case 'as': {
        let a = u.as * (1 + u.asBase + mod(u, 'asPct') + empowerAs(u));
        a *= 1 - statusVal(u, 'chill');
        a *= otAs;
        return Math.min(C.AS_MAX, Math.max(C.AS_MIN, a));
      }
      case 'range': return Math.max(1, Math.round(u.range + mod(u, 'range')));
      default: return (u[k] || 0) + mod(u, k);
    }
  }
  function shieldTotal(u) {
    let s = 0;
    const ss = u.shields;
    for (let i = ss.length - 1; i >= 0; i--) { if (ss[i].end <= t) ss.splice(i, 1); else s += ss[i].amt; }
    return s;
  }

  function addStatus(u, kind, durTicks, value, srcU) {
    if (!u.alive) return;
    if ((kind === 'stun' || kind === 'chill') && has(u, 'ccImmune')) return;
    if (kind === 'taunt' && u.boss) return;
    if (kind === 'stun' && u.ccCap > 0) durTicks = Math.min(durTicks, Math.max(1, Math.round(u.ccCap * TPS))); // 頭目：暈眩上限
    const defaults = { chill: C.CHILL, wound: C.WOUND, burn: C.BURN, shred: C.SHRED, sunder: C.SUNDER, weaken: C.WEAKEN, vulnerable: C.VULNERABLE };
    const v = value != null ? value : (defaults[kind] || 0);
    const end = t + durTicks;
    const s = u.status[kind];
    if (s && s.end > t) { s.end = Math.max(s.end, end); s.value = Math.max(s.value, v); if (srcU) s.src = srcU; } else u.status[kind] = { end, value: v, src: srcU || null };
    if (kind === 'stun' && u.channel && u.channel.active) channelEnd(u, u.channel, true);
    emit({ e: 'status', id: u.id, kind, dur: durTicks, on: true });
    const fin = u.status[kind].end;
    schedule(fin, () => {
      const q = u.status[kind];
      if (q && q.end <= t) { delete u.status[kind]; emit({ e: 'status', id: u.id, kind, dur: 0, on: false }); }
    });
  }

  function removeBuff(u, b) {
    if (b.dead) return;
    b.dead = true;
    if (b.stat === 'hp') { u.hpMax -= b.value; if (u.hpMax < 1) u.hpMax = 1; if (u.hp > u.hpMax) u.hp = u.hpMax; }
  }
  function addBuff(u, spec) {
    if (!u.alive) return;
    const dur = spec.dur;
    if (spec.stackKey) {
      const cap = spec.maxStacks || 1;
      const same = u.buffs.filter((b) => !b.dead && b.key === spec.stackKey && b.stat === spec.stat && (b.end === null || b.end > t));
      if (same.length >= cap) removeBuff(u, same[0]);
      else u.stackGains[spec.stackKey] = (u.stackGains[spec.stackKey] || 0) + 1;
    }
    const b = { stat: spec.stat, value: spec.value, start: t, end: dur != null ? t + dur : null, decay: !!spec.decay && dur != null, key: spec.stackKey || null, dead: false };
    if (u.buffs.length > 24) u.buffs = u.buffs.filter((x) => !x.dead && (x.end === null || x.end > t || x.stat === 'hp'));
    u.buffs.push(b);
    if (spec.stat === 'hp') {
      u.hpMax += spec.value;
      u.hp = Math.min(u.hpMax, Math.max(1, u.hp + spec.value));
      if (b.end !== null) schedule(b.end, () => removeBuff(u, b));
    }
    emit({ e: 'buff', id: u.id, stat: spec.stat, value: spec.value, tag: spec.tag });
  }
  function addEmpower(u, e) { if (u.alive) u.empowers.push(e); }

  function addMana(u, v, force) {
    if (!u.alive || u.manaMax <= 0) return;
    if (!force && (t < u.manaLockUntil || has(u, 'stun'))) return;
    u.mana = Math.min(u.manaMax, Math.max(0, u.mana + v));
  }

  // ---- 傷害 / 治療 / 護盾 -----------------------------------------------------
  function creditTrait(o, field, amt, side) {
    const k = o.origin ? trKey(o.origin.src) : null;
    const k2 = k || trKey(o.tag);
    if (k2) bt(k2, side)[field] += amt;
  }

  function applyLoss(src, tgt, amt, type, o) {
    if (!tgt.alive) return 0;
    let rem = amt;
    const ss = tgt.shields;
    shieldTotal(tgt);
    for (let i = 0; i < ss.length && rem > 0; i++) {
      const take = Math.min(ss[i].amt, rem);
      ss[i].amt -= take; rem -= take;
    }
    for (let i = ss.length - 1; i >= 0; i--) if (ss[i].amt <= 0) ss.splice(i, 1);
    tgt.hp -= rem;
    if (tgt.hp < 0) tgt.hp = 0;
    emit({ e: 'dmg', id: tgt.id, src: src ? src.id : null, from: src ? { row: src.hex.row, col: src.hex.col } : undefined, amt, type: TYPE_CH[type] || 'p', crit: !!o.crit, hp: tgt.hp, shield: shieldTotal(tgt), tag: o.tag || 'ability' });
    const bt2 = byUnit[tgt.id];
    bt2.taken += amt;
    if (src) {
      const bs = byUnit[src.id];
      bs.dmg += amt; bs[TYPE_KEY[type] || 'phys'] += amt;
      src.dealt += amt;
    }
    creditTrait(o, 'dmg', amt, src ? src.side : other(tgt.side));
    // 全能吸血
    if (src && src.alive && !o.noVamp) {
      const ov = stat(src, 'omnivamp');
      if (ov > 0) heal(src, src, amt * ov, 'omnivamp', { src: 'unit' });
    }
    // 坦克受傷回魔
    if (tgt.roleClass === 'Tank' && tgt.manaMax > 0 && tgt.hp > 0) {
      const g = Math.min(C.TANK_MANA_CAP, (o.pre != null ? o.pre : amt) * C.TANK_MANA_PRE + amt * C.TANK_MANA_POST);
      addMana(tgt, g, false);
    }
    return amt;
  }

  function checkHpTriggers(v) {
    const l1 = reg.hpBelow;
    if (l1) for (const ent of l1) {
      const p = ent.p;
      if (ent.owner ? ent.owner !== v : ent.side !== v.side) continue;
      if (ent.owner && !ent.owner.alive) continue;
      const lim = p.limit != null ? p.limit : 1;
      if (ent.st.fired >= lim) continue;
      let frac;
      if (ent.owner) frac = v.hp / v.hpMax;
      else { let a = 0, b = 0; for (const x of units) if (x.side === ent.side && !x.summon) { b += x.hpMax; a += x.hp; } frac = b ? a / b : 1; }
      const nv = Array.isArray(p.n) ? p.n[Math.min(Math.max((ent.owner ? ent.owner.star : 1), 1), p.n.length) - 1] : p.n;
      if (frac < nv) fire(ent, v, false);
    }
    const l2 = reg.enemyHpBelow;
    if (l2) for (const ent of l2) {
      const p = ent.p;
      if (ent.side === v.side) continue;
      if (ent.owner && !ent.owner.alive) continue;
      if (ent.st.seen[v.id]) continue;
      if (p.limit != null && ent.st.fired >= p.limit) continue;
      if (v.hp / v.hpMax < p.n) { ent.st.seen[v.id] = 1; fire(ent, v, false); }
    }
  }

  function damage(src, tgt, raw, type, o) {
    o = o || {};
    if (!tgt.alive) return 0;
    let a = raw;
    let crit = false;
    let pre = a;
    if (!o.raw) {
      if (o.isAbility && src && src.abilityCrit && !o.noCrit) {
        const cc = Math.min(1, Math.max(0, stat(src, 'crit')));
        if (rng.chance(cc)) { crit = true; a *= Math.max(1, stat(src, 'critDmg')); }
      }
      let amp = 1;
      if (src) {
        amp += stat(src, 'dmgAmp') + (o.isAbility ? stat(src, 'abilityAmp') : 0);
        a *= Math.max(0, amp);
        a *= 1 - statusVal(src, 'weaken');
        if (has(src, 'charm') && classical[other(src.side)]) a *= 1 - (classical[other(src.side)].dmgPct != null ? classical[other(src.side)].dmgPct : C.CHARM_DMG_REDUCE);
      }
      a *= otDmg;
      a *= 1 + statusVal(tgt, 'vulnerable');
      pre = a;
      if (type === 'physical') a *= 100 / (100 + Math.max(0, stat(tgt, 'armor')) * (1 - statusVal(tgt, 'sunder')));
      else if (type === 'magic') {
        let mr = Math.max(0, stat(tgt, 'mr')) * (1 - statusVal(tgt, 'shred'));
        if (o.pen) mr *= 1 - o.pen;
        a *= 100 / (100 + mr);
      }
      let d = stat(tgt, 'dr') + (o.isAbility ? stat(tgt, 'abilityDr') : 0);
      if (src && tgt.roleClass === 'Assassin' && tgt.target !== src) d += C.ASSASSIN_DR;
      d = Math.min(C.DR_CAP, d);
      a *= 1 - d;
    }
    let amt = Math.max(1, Math.round(a));
    // 靈魂連結（R&B 2）
    let linkMoved = 0, link = null;
    if (!o.noLink) {
      for (const l of links) if (l.a === tgt && l.a.alive && l.b.alive) { link = l; break; }
      if (link) { linkMoved = Math.min(amt, Math.round(amt * link.share)); }
    }
    const info = { tag: o.tag, crit, origin: o.origin, pre, noVamp: o.noVamp };
    const mine = amt - linkMoved;
    if (mine > 0) applyLoss(src, tgt, mine, type, info);
    if (linkMoved > 0) {
      bt(link.key, tgt.side).procs++;
      applyLoss(src, link.b, linkMoved, type, { tag: 'trait:' + link.key, origin: { src: 'trait:' + link.key }, noVamp: true });
      if (link.b.hp <= 0) kill(link.b, src);
      else afterDamage(src, link.b, linkMoved);
    }
    if (!tgt.alive || tgt.hp <= 0) { if (tgt.alive) kill(tgt, src); } else afterDamage(src, tgt, mine);
    // 靈魂連結回血
    if (src && !o.noLink) {
      for (const l of links) if (l.a === src && l.a.alive && l.b.alive) {
        const h = heal(l.b, src, amt * l.heal, 'trait:' + l.key, { src: 'trait:' + l.key });
        if (h > 0) bt(l.key, src.side).procs++;
      }
    }
    // 真實傷害加成（True Damage）
    if (src && src.trueDmgPct > 0 && !o.noTrue && type !== 'true' && tgt.alive) {
      const ex = Math.max(1, Math.round(amt * src.trueDmgPct));
      bt('TrueDamage', src.side).procs++;
      applyLoss(src, tgt, ex, 'true', { tag: 'trait:TrueDamage', origin: { src: 'trait:TrueDamage' }, noVamp: true });
      if (tgt.hp <= 0) kill(tgt, src); else afterDamage(src, tgt, ex);
    }
    // 古典樂：成員技能傷害 → 著迷
    if (src && o.isAbility && tgt.alive && classical[src.side] && src.traits.indexOf('Classical') >= 0) {
      addStatus(tgt, 'charm', secTicks(classical[src.side].charmSec || C.CHARM_SEC), 0, src);
      bt('Classical', src.side).procs++;
    }
    if (src && amt > 0) trigger('damageDealt', src, tgt, amt, false);
    return amt;
  }

  function afterDamage(src, tgt, amt) {
    if (!tgt.alive) return;
    if (tgt.hp <= 0) { kill(tgt, src); return; }
    trigger('hit', tgt, src, amt, false);
    if (!tgt.alive) return;
    checkHpTriggers(tgt);
    // 殺五社：處決
    const ex = execs[other(tgt.side)];
    if (ex && ex.used < ex.count && !tgt.summon && !tgt.executed && tgt.hp > 0 && tgt.hp / tgt.hpMax <= C.EXEC_BELOW) {
      tgt.executed = true;
      ex.used++;
      const hex = { row: tgt.hex.row, col: tgt.hex.col };
      bt(ex.key, other(tgt.side)).procs++;
      applyLoss(src, tgt, tgt.hp + shieldTotal(tgt), 'true', { tag: 'trait:' + ex.key, origin: { src: 'trait:' + ex.key }, noVamp: true });
      kill(tgt, src);
      emit({ e: 'trait', key: ex.key, side: other(tgt.side), text: ex.text });
      const big = ex.used === 1 && ex.firstBig;
      const m = big ? (ex.bigMult || (typeof ex.firstBig === 'number' ? ex.firstBig : 3)) : 1;
      const g = ex.ghoul || {};
      spawnUnit(other(tgt.side), {
        zh: big ? (ex.bigName || '鋼鐵少女') : '食屍鬼', key: 'ghoul', hp: (g.hp || 500) * m, ad: (g.ad || 50) * m,
        as: C.EXEC_GHOUL.as, armor: C.EXEC_GHOUL.armor, mr: C.EXEC_GHOUL.mr, range: C.EXEC_GHOUL.range,
      }, hex);
    }
  }

  function kill(tgt, src) {
    if (!tgt.alive) return;
    // 復活型死亡被動（例：歐拉夫）：先跑 death 被動，被救回正血量就不死
    if (tgt.reviveOnDeath && passiveDepth < C.MAX_PASSIVE_DEPTH) {
      tgt.hp = 0;
      trigger('death', tgt, src, 0, true);
      if (tgt.hp > 0) return;
    }
    tgt.alive = false;
    tgt.hp = 0;
    vacate(tgt);
    emit({ e: 'death', id: tgt.id, killer: src ? src.id : null });
    byUnit[tgt.id].alive = false;
    byUnit[tgt.id].hpLeft = 0;
    if (src) byUnit[src.id].kills++;
    if (src && src !== tgt) trigger('kill', src, tgt, 0, true);
    trigger('death', tgt, src, 0, true);
    trigger('allyDeath', tgt, tgt, 0, true);
    trigger('enemyDeath', tgt, tgt, 0, true);
  }

  // 單位離場：清掉佔格（滑行中的單位另外保留了終點格；格子被別人佔著時不能清掉）
  function vacate(u) {
    if (occ[cell(u.hex)] === u) occ[cell(u.hex)] = null;
    if (u.slideFinal) { if (occ[cell(u.slideFinal)] === u) occ[cell(u.slideFinal)] = null; u.slideFinal = null; }
    if (u.channel && u.channel.active) channelEnd(u, u.channel, true);
    if (u.pushRoller) removeRoller(u.pushRoller);
  }

  function heal(src, tgt, amt, tag, origin) {
    if (!tgt.alive || !(amt > 0)) return 0;
    let a = amt * (1 - statusVal(tgt, 'wound')) * healFactor;
    a = Math.max(1, Math.round(a));
    const eff = Math.min(a, tgt.hpMax - tgt.hp);
    if (eff <= 0) return 0;
    tgt.hp += eff;
    emit({ e: 'heal', id: tgt.id, src: src ? src.id : null, amt: eff, hp: tgt.hp, tag });
    if (src) byUnit[src.id].heal += eff;
    const k = (origin ? trKey(origin.src) : null) || trKey(tag);
    if (k) bt(k, tgt.side).heal += eff;
    return eff;
  }

  function shield(src, tgt, amt, durTicks, tag, origin) {
    if (!tgt.alive || !(amt > 0)) return 0;
    const a = Math.max(1, Math.round(amt * healFactor));
    tgt.shields.push({ amt: a, end: t + durTicks });
    emit({ e: 'shield', id: tgt.id, src: src ? src.id : null, amt: a, shield: shieldTotal(tgt), tag });
    if (src) byUnit[src.id].shield += a;
    const k = (origin ? trKey(origin.src) : null) || trKey(tag);
    if (k) bt(k, tgt.side).shield += a;
    schedule(t + durTicks, () => {
      if (!tgt.alive) return;
      emit({ e: 'shield', id: tgt.id, src: null, amt: 0, shield: shieldTotal(tgt), tag: 'expire' });
    });
    return a;
  }

  // ---- 被動 -------------------------------------------------------------------
  function fire(ent, cur, allowDead) {
    const p = ent.p;
    if (p.limit != null && ent.st.fired >= p.limit) return;
    if (passiveDepth >= C.MAX_PASSIVE_DEPTH) return;
    if (p.cooldown) { if (t < (ent.st.cd || 0)) return; ent.st.cd = t + secTicks(p.cooldown); }
    ent.st.fired++;
    const k = trKey(p.src);
    if (k) {
      bt(k, ent.side).procs++;
      if (p.text) emit({ e: 'trait', key: k, side: ent.side, text: p.text });
    }
    passiveDepth++;
    try {
      runOps(sim, p.ops || [], ent.owner, { src: p.src || 'unit', side: ent.side, current: cur === undefined ? null : cur, allowDead: !!allowDead });
    } finally { passiveDepth--; }
  }

  function trigger(on, subj, cur, amt, allowDead) {
    const list = reg[on];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const ent = list[i];
      if (on === 'allyDeath') {
        if (ent.side !== subj.side) continue;
        if (ent.owner && (ent.owner === subj || !ent.owner.alive)) continue;
      } else if (on === 'enemyDeath') {
        if (ent.side === subj.side) continue;
        if (ent.owner && !ent.owner.alive) continue;
      } else {
        if (ent.owner) { if (ent.owner !== subj) continue; } else if (ent.side !== subj.side) continue;
        if (on !== 'death' && ent.owner && !ent.owner.alive) continue;
      }
      if (on === 'firstCast' && subj.castCount !== 1) continue;
      const p = ent.p, st = ent.st;
      if (p.limit != null && st.fired >= p.limit) continue;
      if (on === 'damageDealt') {
        st.acc += amt;
        const n = p.n || 1;
        while (st.acc >= n && (p.limit == null || st.fired < p.limit)) { st.acc -= n; fire(ent, cur, allowDead); }
        continue;
      }
      if (p.n && p.n > 1 && on !== 'firstCast') { st.c++; if (st.c % p.n !== 0) continue; }
      fire(ent, cur, allowDead);
    }
  }

  // ---- 召喚 / 位置 ----------------------------------------------------------------
  function freeNear(ref, own) {
    let best = null, bd = 1e9;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const o = occ[r * COLS + c];
      if (o && o !== own) continue;
      const d = dist(ref, { row: r, col: c });
      if (d < bd) { bd = d; best = { row: r, col: c }; }
    }
    return best;
  }
  function freeFront(side) {
    const rows = side === 'player' ? [4, 5, 6, 7] : [3, 2, 1, 0];
    const cols = [3, 4, 2, 5, 1, 6, 0];
    for (const r of rows) for (const c of cols) if (!occ[r * COLS + c]) return { row: r, col: c };
    return null;
  }

  function spawnUnit(side, d, hex, durTicks) {
    if (!hex || occ[cell(hex)]) hex = freeNear(hex || { row: side === 'player' ? 4 : 3, col: 3 });
    if (!hex) return null;
    const id = (side === 'player' ? 'p' : 'e') + nextNum[side];
    nextNum[side]++;
    const c = {
      id, side, key: d.key || 'summon', zh: d.zh || '召喚物', star: 1, cost: 0, roleClass: 'Fighter', dmgType: 'physical', slots: 0,
      hex, hp: Math.max(1, Math.round(d.hp)), ad: d.ad || 0, as: d.as || C.SUMMON_DEFAULT.as, armor: d.armor != null ? d.armor : C.SUMMON_DEFAULT.armor,
      mr: d.mr != null ? d.mr : C.SUMMON_DEFAULT.mr, range: d.range || C.SUMMON_DEFAULT.range, manaPerAttack: 0, items: d.items || [],
    };
    const u = makeUnit(c, true);
    units.push(u);
    units.sort((x, y) => x.ord - y.ord);
    byId[u.id] = u;
    occ[cell(hex)] = u;
    emit({ e: 'spawn', unit: snap(u, true) });
    if (durTicks) schedule(t + durTicks, () => {
      if (!u.alive) return;
      u.alive = false; u.hp = 0; vacate(u);
      byUnit[u.id].alive = false; byUnit[u.id].hpLeft = 0;
      emit({ e: 'death', id: u.id, killer: null });
    });
    return u;
  }

  function summonOp(source, ctx, op, origin, ev) {
    const side = source ? source.side : ctx.side;
    const sp = op.unit || {};
    const base = (num, pct, fallback, ref) => {
      if (num != null) return ev(num);
      if (pct != null && ref) return ev(pct) * ref;
      return fallback;
    };
    const d = {
      zh: sp.zh, key: sp.key,
      hp: base(sp.hp, sp.hpPct, 300, source ? source.hpMax : 0),
      ad: base(sp.ad, sp.adPct, 30, source ? stat(source, 'ad') : 0),
      as: sp.as != null ? ev(sp.as) : undefined, armor: sp.armor != null ? ev(sp.armor) : undefined,
      mr: sp.mr != null ? ev(sp.mr) : undefined, range: sp.range != null ? ev(sp.range) : undefined,
    };
    const at = op.at || (source ? 'adjacent' : 'front');
    let hex;
    if (at === 'front') hex = freeFront(side);
    else if (at === 'nearTarget') {
      const c = ctx.current || (source && source.target);
      hex = freeNear(c ? c.hex : (source ? source.hex : { row: 4, col: 3 }));
    } else hex = freeNear(source ? source.hex : { row: 4, col: 3 });
    const u = spawnUnit(side, d, hex, op.dur != null ? secTicks(ev(op.dur)) : 0);
    const k = trKey(origin.src);
    if (u && k) bt(k, side).procs += 0;
  }

  function dash(u, tgt, o) {
    if (!u.alive) return;
    let best = null, bd = 1e9;
    for (const h of neighbors(tgt.hex)) {
      if (occ[cell(h)]) continue;
      const d = dist(u.hex, h);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    const dashFrom = { row: u.hex.row, col: u.hex.col };   // 純畫面：拖尾的起點
    occ[cell(u.hex)] = null;
    u.hex = best;
    occ[cell(best)] = u;
    u.target = tgt;
    u.retargetAt = 0;
    emit({ e: 'move', id: u.id, to: { row: best.row, col: best.col }, dur: C.DASH_TICKS, style: (o && o.style) || 'dash', trail: o && o.trail, from: dashFrom });
  }

  function addZone(z) {
    const oid = 'z' + (++oidN);
    const anchor = z.anchor || null;
    const cur = () => (z.follow && anchor && anchor.alive ? anchor.hex : z.hex);
    if (z.skin) emit({ e: 'obj', oid, act: 'spawn', skin: z.skin, hex: { row: z.hex.row, col: z.hex.col }, r: z.r, dur: z.dur, follow: z.follow && anchor ? anchor.id : null, src: z.source ? z.source.id : null });
    else emit({ e: 'fx', kind: 'aoe', from: z.hex, hexes: within(z.hex, z.r), src: z.source ? z.source.id : null });
    const n = Math.max(1, Math.floor(z.dur / z.tick));
    for (let k = 1; k <= n; k++) {
      schedule(t + z.tick * k, () => {
        if (z.follow && anchor && !anchor.alive) { if (k === 1 || true) emit({ e: 'obj', oid, act: 'remove' }); return; }
        const c0 = cur();
        for (const u of units.slice()) {
          if (!u.alive || dist(c0, u.hex) > z.r) continue;
          const ops = u.side === z.side ? z.ally : z.enemy;
          if (!ops) continue;
          runOps(sim, ops, z.source, { ...z.origin, side: z.side, current: u, allowDead: false });
        }
        if (k === n) {
          if (z.skin) emit({ e: 'obj', oid, act: 'remove' });
          if (z.onEnd && (!z.source || z.source.alive)) runOps(sim, z.onEnd, z.source, { ...z.origin, side: z.side, current: anchor || undefined, allowDead: false });
        }
      });
    }
  }

  // ---- 位移（階段二）-----------------------------------------------------------------
  const occAt = (h) => occ[cell(h)] || null;
  function cancelSlide(u) {
    if (!u.slideFinal) return;
    if (occ[cell(u.slideFinal)] === u) occ[cell(u.slideFinal)] = null;
    u.slideFinal = null; u.slideTok = 0;
  }
  function relocate(u, hex) {
    cancelSlide(u);
    if (occ[cell(u.hex)] === u) occ[cell(u.hex)] = null;
    u.hex = { row: hex.row, col: hex.col };
    occ[cell(hex)] = u;
  }
  function castLock(u, ticks) { u.castUntil = Math.max(u.castUntil, t + ticks); }
  let slideN = 0;
  function slide(u, pathHexes, finalHex, total, o) {
    const start = pathHexes[0];
    cancelSlide(u);
    if (occ[cell(u.hex)] === u) occ[cell(u.hex)] = null;
    occ[cell(finalHex)] = u;
    u.slideTok = ++slideN;
    u.slideFinal = { row: finalHex.row, col: finalHex.col };
    const lockT = t + total + 1;
    u.castUntil = Math.max(u.castUntil, lockT); u.moveUntil = Math.max(u.moveUntil, lockT);
    emit({ e: 'move', id: u.id, from: { row: start.row, col: start.col }, to: { row: finalHex.row, col: finalHex.col }, dur: total, style: (o && o.style) || 'slide', trail: o && o.trail, path: rec ? pathHexes.map((h) => ({ row: h.row, col: h.col })) : undefined });
    return u.slideTok;
  }
  function slideEnd(u, tok) {
    if (!u.slideFinal || (tok != null && u.slideTok !== tok)) return;
    u.hex = { row: u.slideFinal.row, col: u.slideFinal.col };
    u.slideFinal = null; u.slideTok = 0;
  }
  function leap(u, tgt, air) {
    let land = null, bd = 1e9;
    for (const h of neighbors(tgt.hex)) {
      const o = occ[cell(h)];
      if (o && o !== u) continue;
      const d = dist(u.hex, h);
      if (d < bd) { bd = d; land = h; }
    }
    if (!land) land = freeNear(tgt.hex, u);
    if (!land) return;
    const from = { row: u.hex.row, col: u.hex.col };
    relocate(u, land);
    u.target = tgt; u.retargetAt = 0;
    addStatus(u, 'untargetable', air + 1, 0, u);
    castLock(u, air + 1); u.moveUntil = Math.max(u.moveUntil, t + air + 1);
    emit({ e: 'move', id: u.id, from, to: { row: land.row, col: land.col }, dur: air, style: 'leap' });
  }
  function leapEnd(u) { const s2 = u.status.untargetable; if (s2 && s2.end > t && s2.end <= t + 2) { delete u.status.untargetable; emit({ e: 'status', id: u.id, kind: 'untargetable', dur: 0, on: false }); } }
  function blink(u, dest, ticks) {
    const from = { row: u.hex.row, col: u.hex.col };
    relocate(u, dest);
    castLock(u, ticks + 1); u.moveUntil = Math.max(u.moveUntil, t + ticks + 1);
    emit({ e: 'move', id: u.id, from, to: { row: dest.row, col: dest.col }, dur: ticks, style: 'blink' });
  }
  function moveUnit(u, dest, style, ticks) {
    const from = { row: u.hex.row, col: u.hex.col };
    relocate(u, dest);
    u.moveUntil = Math.max(u.moveUntil, t + ticks); u.retargetAt = 0;
    emit({ e: 'move', id: u.id, from, to: { row: dest.row, col: dest.col }, dur: ticks, style });
  }
  function channelBegin(u, total, info) {
    const ch = { active: true, end: t + total };
    u.channel = ch;
    castLock(u, total + 1);
    emit({ e: 'chan', id: u.id, tgt: info.tgt, dur: total, skin: info.skin, on: true });
    return ch;
  }
  function channelEnd(u, ch, aborted) {
    if (!ch.active) return;
    ch.active = false;
    if (u.channel === ch) u.channel = null;
    if (aborted && u.castUntil <= ch.end + 1) u.castUntil = t;
    emit({ e: 'chan', id: u.id, on: false });
  }
  // 染色格（阿卡莉）：一個施法者一張，格子整場保留；站在上面的敵人每個 tick 週期吃一次 enemy ops
  function paintCell(src, hex, spec, origin) {
    let pz = paintZones.find((z) => z.source === src);
    if (!pz) {
      pz = { source: src, side: src.side, cells: [], tag: spec.tag || 'paint', spec, origin };
      paintZones.push(pz);
      const per = secTicks(spec.tick || 0.5);
      const loop = () => schedule(t + per, () => {
        if (!src.alive) return;
        for (const u of units.slice()) {
          if (!u.alive || u.side === pz.side || !pz.cells.some((h) => same(h, u.hex))) continue;
          if (spec.enemy) runOps(sim, spec.enemy, src, { ...origin, side: pz.side, current: u });
        }
        loop();
      });
      loop();
    }
    if (pz.cells.some((h) => same(h, hex))) return;
    pz.cells.push({ row: hex.row, col: hex.col });
    emit({ e: 'obj', oid: 'pc' + (++oidN), act: 'spawn', skin: spec.skin || 'paint', hex: { row: hex.row, col: hex.col }, persist: true, tag: pz.tag, src: src.id });
  }
  function marked(side, tag) {
    const out = [];
    for (const u of units) {
      if (!u.alive || u.side === side) continue;
      if (has(u, tag) || paintZones.some((z) => z.side === side && z.tag === tag && z.cells.some((h) => same(h, u.hex)))) out.push(u);
    }
    return out;
  }

  // ---- 場上滾動物件（努努的迪斯可球）----------------------------------------------------
  function addRoller(d) {
    const old = rollers.find((r) => r.active && r.owner === d.owner && r.id === d.id);
    if (old) return;
    const o = d.owner;
    const foes = units.filter((e) => e.side !== o.side && targetable(e));
    const c0 = center(o.hex);
    let hx = 0, hy = o.side === 'player' ? -1 : 1;
    if (foes.length) {
      let best = null, bd = 1e9;
      for (const e of foes) { const ce = center(e.hex), dd = hyp(ce.x - c0.x, ce.y - c0.y); if (dd < bd) { bd = dd; best = ce; } }
      const L = Math.max(1e-6, bd); hx = (best.x - c0.x) / L; hy = (best.y - c0.y) / L;
    }
    const r = Object.assign(d, { active: true, oid: 'r' + (++oidN), x: c0.x + hx * 0.9, y: c0.y + hy * 0.9, hx, hy, tgt: null, speedMul: 1, sizeMul: 1, last: new Map(), endT: d.dur != null ? t + d.dur : null, lastEmit: -99 });
    rollers.push(r);
    if (r.push) o.pushRoller = r;
    emit({ e: 'obj', oid: r.oid, act: 'spawn', skin: r.skin, xy: { x: r.x, y: r.y }, scale: 1, hitR: r.hitR, src: o.id });
  }
  function removeRoller(r) {
    if (!r.active) return;
    r.active = false;
    if (r.owner && r.owner.pushRoller === r) r.owner.pushRoller = null;
    emit({ e: 'obj', oid: r.oid, act: 'remove' });
  }
  function rollerMod(owner, id, speedMul, sizeMul) {
    for (const r of rollers) {
      if (!r.active || r.owner !== owner || (id && r.id !== id)) continue;
      if (speedMul != null) r.speedMul = speedMul;
      if (sizeMul != null) r.sizeMul = sizeMul;
      emit({ e: 'obj', oid: r.oid, act: 'mod', scale: r.sizeMul, speedMul: r.speedMul });
    }
  }
  function stepRollers() {
    for (const r of rollers) {
      if (!r.active) continue;
      if (!r.owner.alive || (r.endT != null && t >= r.endT)) { removeRoller(r); continue; }
      const foes = [];
      for (const e of units) if (e.alive && e.side !== r.side && targetable(e)) foes.push(e);
      if (!foes.length) continue;
      const wd = (c) => hyp(c.x - r.x, c.y - r.y);
      let tg = r.tgt;
      if (!tg || !tg.alive || !targetable(tg) || wd(center(tg.hex)) < 0.3) {
        let best = null, bd = -1;
        for (const e of foes) { const d = wd(center(e.hex)); if (d > bd + 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.ord < best.ord)) { bd = d; best = e; } }
        r.tgt = tg = best;
        r.lastEmit = -99;
      }
      const tc = center(tg.hex), L = Math.max(1e-6, wd(tc)), step = r.speed * r.speedMul / TPS;
      const mv = Math.min(step, L);
      r.hx = (tc.x - r.x) / L; r.hy = (tc.y - r.y) / L;
      r.x += r.hx * mv; r.y += r.hy * mv;
      const R = r.hitR * r.sizeMul;
      for (const e of foes) {
        const ce = center(e.hex);
        if (hyp(ce.x - r.x, ce.y - r.y) > R) continue;
        const lt = r.last.get(e.id);
        if (lt != null && t - lt < r.rehit) continue;
        r.last.set(e.id, t);
        runOps(sim, r.onPass, r.owner, { ...r.origin, current: e, side: r.side });
        if (!r.owner.alive) break;
      }
      if (rec && t - r.lastEmit >= C.ROLLER_EMIT) {
        r.lastEmit = t;
        const nx = r.x + r.hx * Math.min(step * C.ROLLER_EMIT, Math.max(0, wd(tc) - 0));
        const ny = r.y + r.hy * Math.min(step * C.ROLLER_EMIT, Math.max(0, wd(tc)));
        emit({ e: 'obj', oid: r.oid, act: 'move', xy: { x: nx, y: ny }, dur: C.ROLLER_EMIT });
      }
    }
  }
  // 推球的人：站在球後面的格子，不普攻
  function pushStep(u, r) {
    const P = { x: r.x - r.hx * 0.95, y: r.y - r.hy * 0.95 };
    const own = center(u.hex);
    if (hyp(own.x - P.x, own.y - P.y) <= 0.8) return;
    const start = u.hex;
    const prev = new Array(ROWS * COLS).fill(-2);
    const depth = new Array(ROWS * COLS).fill(0);
    const q = [cell(start)];
    prev[cell(start)] = -1;
    let best = cell(start), bd = hyp(own.x - P.x, own.y - P.y);
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      const ch = { row: Math.floor(cur / COLS), col: cur % COLS };
      for (const n of neighbors(ch)) {
        const k = cell(n);
        if (prev[k] !== -2 || occ[k]) continue;
        prev[k] = cur; depth[k] = depth[cur] + 1;
        q.push(k);
        const cn = center(n), d = hyp(cn.x - P.x, cn.y - P.y);
        if (d < bd - 1e-9) { bd = d; best = k; }
      }
    }
    if (best === cell(start)) return;
    let k = best;
    while (prev[k] !== cell(start)) k = prev[k];
    const to = { row: Math.floor(k / COLS), col: k % COLS };
    relocate(u, to);
    u.moveUntil = t + C.MOVE_TICKS;
    emit({ e: 'move', id: u.id, to: { row: to.row, col: to.col }, dur: C.MOVE_TICKS, style: 'push' });
  }

  // ---- 普攻 / 施法 / 移動 ---------------------------------------------------------
  function attack(u, tg) {
    emit({ e: 'atk', id: u.id, tgt: tg.id, ranged: stat(u, 'range') > 1 });
    let cc = stat(u, 'crit');
    let cd = stat(u, 'critDmg');
    if (cc > 1) { cd += (cc - 1) * C.CRIT_OVER_TO_DMG; cc = 1; }
    const isCrit = rng.chance(Math.max(0, cc));
    const raw = stat(u, 'ad') * (isCrit ? cd : 1);
    let replace = false;
    const act = [];
    for (const e of u.empowers) if (e.attacksLeft > 0 && (e.end === null || e.end > t)) { act.push(e); if (e.replace) replace = true; }
    let dealt = 0;
    if (!replace) dealt = damage(u, tg, raw, 'physical', { tag: 'atk', crit: isCrit });
    if (u.alive) {
      if (t >= u.manaLockUntil && !has(u, 'stun')) addMana(u, u.manaPerAttack, false);
    }
    for (const e of act) {
      e.attacksLeft--;
      runOps(sim, e.onHit, u, { ...e.origin, current: tg });
    }
    if (u.empowers.length) u.empowers = u.empowers.filter((e) => e.attacksLeft > 0 && (e.end === null || e.end > t));
    u.atkCount++;
    trigger('attack', u, tg, 0, false);
    // 詭射彈射
    if (!replace && u.bounce && u.bounce.count > 0 && dealt > 0) {
      const hit = [tg];
      let last = tg, r = raw;
      for (let i = 0; i < u.bounce.count; i++) {
        let best = null, bd = 1e9;
        for (const e of units) {
          if (e.side === u.side || !targetable(e) || hit.indexOf(e) >= 0) continue;
          const d = dist(last.hex, e.hex);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        r *= u.bounce.pct;
        const src = u.bounce.src || 'trait:Trickshot';
        damage(u, best, r, 'physical', { tag: src, origin: { src }, crit: false });
        hit.push(best);
        last = best;
      }
    }
  }

  const selfCastCache = new Map();
  function isSelfCast(ab) {
    const first = ab.steps && ab.steps.find((o) => o.op !== 'fx');   // 開頭的純畫面步驟不算
    if (!first) return false;
    const to = first.to;
    return to === 'self' || to === 'allEnemies' || (to && typeof to === 'object' && to.allies != null);
  }

  function startCast(u) {
    const ab = u.ability;
    u.mana = 0;
    emit({ e: 'mana', id: u.id, mana: 0 });
    u.lastManaEmit = 0;
    u.manaLockUntil = t + secTicks(C.MANA_LOCK);
    u.castCount++;
    byUnit[u.id].casts++;
    emit({ e: 'cast', id: u.id, name: ab.name || '', tgt: u.target ? u.target.id : undefined });
    trigger('cast', u, u.target, 0, false);
    trigger('firstCast', u, u.target, 0, false);
    const ct = secTicks(ab.castTime != null ? ab.castTime : C.CAST_TIME);
    u.castUntil = t + ct;
    schedule(t + ct, () => {
      if (!u.alive) return;
      let steps = ab.steps || [];
      if (ab.altSteps) {
        if ((ab.altEvery > 0 && u.castCount % ab.altEvery === 0)) steps = ab.altSteps;
        else if (ab.altCond && condHolds(u, ab.altCond)) steps = ab.altSteps;
      }
      emit({ e: 'fire', id: u.id, tgt: u.target ? u.target.id : undefined, alt: steps !== (ab.steps || []) });   // 純畫面：技能效果實際生效的那一刻
      runOps(sim, steps, u, { src: 'ability', current: u.target });
    });
  }
  function condHolds(u, cond) {
    if (cond.selfHpBelow != null) return u.hp / u.hpMax < cond.selfHpBelow;
    if (cond.selfHpAbove != null) return u.hp / u.hpMax > cond.selfHpAbove;
    if (cond.flag) return !!u.flags[cond.flag];
    return false;
  }

  function pickTarget(u) {
    let best = null, bd = 1e9;
    for (const e of units) {
      if (e.side === u.side || !targetable(e)) continue;
      const d = dist(u.hex, e.hex);
      if (d < bd || (d === bd && e === u.target)) { bd = d; best = e; }
    }
    return best;
  }

  function stepToward(u, tg) {
    const range = stat(u, 'range');
    const start = u.hex;
    const prev = new Array(ROWS * COLS).fill(-2);
    const q = [cell(start)];
    prev[cell(start)] = -1;
    let goal = -1;
    for (let qi = 0; qi < q.length && goal < 0; qi++) {
      const cur = q[qi];
      const ch = { row: Math.floor(cur / COLS), col: cur % COLS };
      for (const n of neighbors(ch)) {
        const k = cell(n);
        if (prev[k] !== -2 || occ[k]) continue;
        prev[k] = cur;
        if (dist(n, tg.hex) <= range) { goal = k; break; }
        q.push(k);
      }
    }
    let step = -1;
    if (goal >= 0) {
      let k = goal;
      while (prev[k] !== cell(start)) k = prev[k];
      step = k;
    } else {
      let bd = dist(start, tg.hex);
      for (const n of neighbors(start)) {
        if (occ[cell(n)]) continue;
        const d = dist(n, tg.hex);
        if (d < bd) { bd = d; step = cell(n); }
      }
    }
    if (step < 0) return;
    const to = { row: Math.floor(step / COLS), col: step % COLS };
    occ[cell(start)] = null;
    occ[step] = u;
    u.hex = to;
    const mt = otK > 0 ? C.MOVE_TICKS_OT : C.MOVE_TICKS;
    u.moveUntil = t + mt;
    emit({ e: 'move', id: u.id, to: { row: to.row, col: to.col }, dur: mt });
  }

  function actUnit(u) {
    if (!u.alive || t < startTick) return;
    if (has(u, 'stun') || t < u.castUntil || t < u.moveUntil) return;
    let tg = u.target;
    if (u.status.taunt && has(u, 'taunt')) {
      const ts = u.status.taunt.src;
      if (ts && ts.alive && targetable(ts) && ts.side !== u.side) { if (tg !== ts) { tg = ts; u.target = ts; } }
    }
    const range = stat(u, 'range');
    let valid = !!tg && targetable(tg);
    let inRange = valid && dist(u.hex, tg.hex) <= range;
    if (!valid || (!inRange && t >= u.retargetAt)) {
      tg = pickTarget(u);
      u.target = tg;
      u.retargetAt = t + secTicks(C.RETARGET);
      valid = !!tg;
      inRange = valid && dist(u.hex, tg.hex) <= range;
    }
    if (u.ability && u.manaMax > 0 && u.mana >= u.manaMax && t >= u.manaLockUntil) {
      let sc = selfCastCache.get(u.ability);
      if (sc === undefined) { sc = isSelfCast(u.ability); selfCastCache.set(u.ability, sc); }
      if (sc || inRange) { startCast(u); return; }
    }
    if (u.pushRoller && u.pushRoller.active) { pushStep(u, u.pushRoller); return; }   // 推球的人不普攻
    if (!valid) return;
    if (inRange) {
      u.prog += stat(u, 'as') / TPS;
      if (u.prog >= 1) { u.prog -= 1; attack(u, tg); }
    } else stepToward(u, tg);
  }

  // ---- sim 介面（給 ops.js） ----------------------------------------------------
  const sim = {
    TPS, C, rng,
    get t() { return t; },
    units, rewards,
    alive: aliveList,
    stat, has, shieldTotal, damage, heal, shield, addStatus, addBuff, addEmpower, addMana,
    schedule, dash, addZone, summon: summonOp,
    rec, emit, nextPid: () => 'j' + (++pidN), occAt, freeNear, relocate, castLock, slide, slideEnd, leap, leapEnd, blink, moveUnit,
    channelBegin, channelEnd, paintCell, marked, addRoller, rollerMod, slideAlive: (u, tok) => u.slideTok === tok,
    traitActive: (side, key) => active[side].has(key),
    warn: (m) => { if (warnings.indexOf(m) < 0) warnings.push(m); },
  };

  function verifyOcc() {
    const seen = new Map();
    for (const u of units) {
      if (!u.alive) continue;
      const home = u.slideFinal || u.hex;
      if (occ[cell(home)] !== u) throw new Error(`occ 不一致：${u.id} 在 ${home.row},${home.col} t=${t}`);
      const k = cell(home);
      if (seen.has(k)) throw new Error('兩隻同格 ' + u.id + ' ' + seen.get(k) + ' t=' + t);
      seen.set(k, u.id);
    }
    for (let i = 0; i < occ.length; i++) {
      const o = occ[i];
      if (o && !o.instrument && (!o.alive || cell(o.slideFinal || o.hex) !== i)) throw new Error('幽靈佔格 ' + o.id + ' @' + i + ' t=' + t);
    }
  }

  // ---- 開場 -------------------------------------------------------------------
  const startEnts = [];
  sideTeams.forEach((side, i) => {
    const tm = teams[i] || { combatants: [] };
    for (const tr of tm.traits || []) if (tr.active || tr.tier > 0) active[side].add(tr.key);
    for (const c of tm.combatants || []) {
      c.side = side;
      const u = makeUnit(c, false);
      units.push(u);
      byId[u.id] = u;
      occ[cell(u.hex)] = u;
      const n = numOf(u.id);
      if (n + 1 > nextNum[side]) nextNum[side] = n + 1;
    }
  });
  // 沙灘樂器：場上的召喚物。只佔格（擋路、單位不能站上去、召喚物也不會生在上面），不是單位：
  // 不會被選為目標、不會動、不會攻擊、不會死。範圍效果在戰前（stats.js）已經算好。
  const instruments = [];
  sideTeams.forEach((side, i) => {
    for (const h of (teams[i] && teams[i].instruments) || []) {
      if (!h || occ[cell(h)]) continue;
      occ[cell(h)] = { instrument: true, alive: false, side, hex: { row: h.row, col: h.col } };
      instruments.push({ side, hex: { row: h.row, col: h.col } });
    }
  });
  units.sort((a, b) => a.ord - b.ord);
  const openUnits = units.map((u) => snap(u, false));
  const hpMaxInit = { player: 0, enemy: 0 };
  for (const u of units) hpMaxInit[u.side] += u.hpMax;

  function register(owner, side, p) {
    const ent = { owner, side, p, st: { c: 0, fired: 0, acc: 0, seen: {} } };
    if (p.on === 'special') { startEnts.push(ent); return; }
    (reg[p.on] || (reg[p.on] = [])).push(ent);
    if (p.on === 'start' || p.on === 'every') startEnts.push(ent);
  }
  for (const u of units) for (const p of u.passives) {
    register(u, u.side, p);
    if (p.on === 'death' && (p.ops || []).some((o) => o.op === 'heal' && o.to === 'self')) u.reviveOnDeath = true;
  }
  sideTeams.forEach((side, i) => { for (const p of (teams[i] && teams[i].teamPassives) || []) register(null, side, p); });

  // 開場順序：startShield → start 被動（at=0）→ special
  for (const u of units) {
    if (u.startShield > 0) shield(u, u, u.startShield, secTicks(u.startShieldDur), 'startShield', { src: 'unit' });
  }
  for (const ent of startEnts) {
    const p = ent.p;
    if (p.on === 'start') {
      if (p.at > 0) {
        schedule(Math.round(p.at * TPS), () => { if (!ent.owner || ent.owner.alive) fire(ent, null, false); });
      } else fire(ent, null, false);
    } else if (p.on === 'every') {
      const per = secTicks(p.n || 1);
      const arm = (tick) => schedule(tick, () => {
        if (ent.owner && !ent.owner.alive) return;
        fire(ent, null, false);
        arm(tick + per);
      });
      arm(p.from > 0 ? secTicks(p.from) : per);   // from：第一次觸發的秒數（巴龍巢穴 8 秒後才開始每秒疊）
    }
  }
  // 古典樂：羈絆啟動就開著迷機制（不必另寫 special）
  for (const side of sideTeams) if (active[side].has('Classical') && !classical[side]) classical[side] = {};
  const findUnit = (side, key) => units.find((u) => u.side === side && u.key === key && !u.summon && u.alive);
  for (const ent of startEnts) {
    const p = ent.p;
    if (p.on !== 'special') continue;
    const side = ent.side;
    const key = trKey(p.src);
    const mark = (k) => { if (k) bt(k, side).procs++; };
    switch (p.id) {
      case 'soulLink': {
        const a = findUnit(side, p.a || 'Mel'), b = findUnit(side, p.b || 'Rell');
        if (a && b) links.push({ a, b, share: p.share != null ? p.share : C.SOUL_SHARE, heal: p.heal != null ? p.heal : C.SOUL_HEAL, key: key || 'RAndB' });
        break;
      }
      case 'executeSummon':
        execs[side] = { count: p.count || 1, used: 0, ghoul: p.ghoul, firstBig: p.firstBig, bigMult: p.bigMult, bigName: p.bigName, key: key || 'Pentakill', text: p.text || '食屍鬼出現' };
        break;
      case 'classical':
        classical[side] = { dmgPct: p.dmgPct, charmSec: p.charmSec };
        break;
      case 'clone': {
        const u = findUnit(side, p.unit || 'Rakan');
        if (!u) break;
        const anchor = units.find((x) => x.side === side && x.cloneAnchor && !x.summon && x.alive) || u;   // 玩家可以指定分身站在誰旁邊
        const hex = freeNear(anchor.hex);
        const cl = spawnUnit(side, {
          zh: u.zh + '分身', key: u.key, hp: u.hpMax * (p.hpPct != null ? p.hpPct : C.CLONE.hpPct),
          ad: u.ad * (p.dmgMult != null ? p.dmgMult : C.CLONE.dmgMult), as: u.as, armor: u.armor, mr: u.mr, range: u.range, items: u.items.slice(),
        }, hex);
        if (cl) { mark(key || 'BoyBand'); emit({ e: 'trait', key: key || 'BoyBand', side, text: '分身出現' }); }
        break;
      }
      case 'untargetableStart': {
        const u = findUnit(side, p.unit || 'Gwen');
        if (u) { addStatus(u, 'untargetable', secTicks(p.dur != null ? p.dur : C.UNTARGETABLE_SEC), 0, u); mark(key || 'MelodicHeart'); }
        break;
      }
      default: sim.warn('unknown special ' + p.id);
    }
  }
  for (const u of units) u.target = null;

  // ---- 主迴圈 -----------------------------------------------------------------
  let winner = null;
  for (t = 0; ; t++) {
    inQueue = true;
    const b = buckets[t];
    if (b) { for (let i = 0; i < b.length; i++) b[i](); buckets[t] = null; }
    inQueue = false;
    if (t > 0 && t % TPS === 0) {
      if (t >= C.OVERTIME_START * TPS) {
        otK++;
        otDmg *= C.OVERTIME_MULT; otAs *= C.OVERTIME_MULT;
        healFactor = Math.max(C.OVERTIME_HEAL_MIN, 1 - C.OVERTIME_HEAL_STEP * otK);
      }
      for (const u of units) {
        if (!u.alive) continue;
        if (u.manaMax > 0) {
          const g = (C.MANA_REGEN[u.roleClass] || 0) + stat(u, 'manaRegen');
          if (g > 0) addMana(u, g, false);
        }
      }
      for (const u of units) {
        if (u.alive && has(u, 'burn')) damage(null, u, u.hpMax * statusVal(u, 'burn'), 'true', { tag: 'ot' });
      }
    }
    if (rollers.length) stepRollers();
    const list = units.slice();
    for (const u of list) actUnit(u);
    if (opts.checkOcc) verifyOcc();
    if (rec && t % C.MANA_SAMPLE_TICKS === 0) {
      for (const u of units) {
        if (u.alive && u.manaMax > 0 && Math.round(u.mana) !== u.lastManaEmit) {
          u.lastManaEmit = Math.round(u.mana);
          emit({ e: 'mana', id: u.id, mana: u.lastManaEmit });
        }
      }
    }
    let pa = 0, ea = 0;
    for (const u of units) if (u.alive) { if (u.side === 'player') pa++; else ea++; }
    if (pa === 0 || ea === 0) { winner = ea === 0 && pa > 0 ? 'player' : 'enemy'; break; }
    if (t >= maxTicks) { winner = 'enemy'; break; }
  }
  emit({ e: 'end', winner });

  // ---- 結算 -------------------------------------------------------------------
  let pAlive = 0, eAlive = 0, eHp = 0;
  for (const u of units) {
    byUnit[u.id].alive = u.alive;
    byUnit[u.id].hpLeft = u.alive ? u.hp : 0;
    if (!u.summon) {
      if (u.alive) { if (u.side === 'player') pAlive++; else { eAlive++; } }
      if (u.side === 'enemy' && u.alive) eHp += u.hp;
    }
  }
  const persist = JSON.parse(JSON.stringify(setup.persist || (teams[0] && teams[0].persist) || {}));
  if (active.player.has('Collab')) {
    let n = 0;
    for (const u of units) if (u.side === 'player') n += u.stackGains.inspire || 0;
    if (n) persist.inspire = (persist.inspire || 0) + n;
  }
  if (active.player.has('8Bit')) {
    let sum = 0;
    for (const u of units) if (u.side === 'player') sum += byUnit[u.id].dmg * (u.key === C.EIGHTBIT_KEY ? C.EIGHTBIT_MULT : 1);
    persist.eightBit = (persist.eightBit || 0) + sum;
  }
  const result = {
    winner, seconds: t / TPS, ticks: t, units: openUnits, instruments, events,
    final: units.map((u) => ({ id: u.id, alive: u.alive, hex: { row: u.hex.row, col: u.hex.col } })),
    summary: {
      byUnit, byTrait, byTraitEnemy, playerAlive: pAlive, enemyAlive: eAlive,
      enemyHpPctLeft: hpMaxInit.enemy > 0 ? eHp / hpMaxInit.enemy : 0,
      rewards, persist,
    },
  };
  if (warnings.length) result.warnings = warnings;
  return result;
}


return {C, simulate};
})();
modules.data = (() => {
// 瀏覽器載入資料。loadData 用 fetch；indexData 純函式（Node 測試用）。
const FILES = ['units', 'traits', 'items', 'augments', 'rules', 'enemies', 'unlocks'];
const OPTIONAL = new Set(['unlocks']);   // 允許 404（當成機制關閉）

async function loadData(base = './data/') {
  const got = await Promise.all(FILES.map(async (n) => {
    let r;
    try { r = await fetch(base + n + '.json'); } catch (e) { if (OPTIONAL.has(n)) return { units: [] }; throw e; }
    if (!r.ok) {
      if (OPTIONAL.has(n)) return { units: [] };
      throw new Error('載入失敗：' + n + '.json（' + r.status + '）');
    }
    try { return await r.json(); } catch (e) { if (OPTIONAL.has(n)) return { units: [] }; throw e; }
  }));
  const raw = {};
  FILES.forEach((n, i) => { raw[n] = got[i]; });
  return indexData(raw);
}

function byKeyOf(list) {
  const m = {};
  for (const x of list) m[x.key] = x;
  return m;
}

// raw = { units, traits, items, augments, rules, enemies, unlocks? }（各檔 JSON 物件；unlocks 可省略）
function indexData(raw) {
  const uList = raw.units.units || [];
  const tList = raw.traits.traits || [];
  const comps = raw.items.components || [];
  const iList = raw.items.items || [];
  const aList = raw.augments.augments || [];
  // recipes：「散件A+散件B」（字母序）-> 成品 key
  const recipes = {};
  for (const it of iList) {
    if (it.recipe && it.recipe.length === 2) recipes[it.recipe.slice().sort().join('+')] = it.key;
  }
  const ul = (raw.unlocks && raw.unlocks.units) || [];
  return {
    unlocks: { version: raw.unlocks && raw.unlocks.version, rule: (raw.unlocks && raw.unlocks.rule) || { guarantee: 'nextShop', slot: 'right' }, list: ul, byKey: byKeyOf(ul) },
    units: { byKey: byKeyOf(uList), list: uList, sprite: raw.units.sprite, starMult: raw.units.starMult, version: raw.units.version },
    traits: { byKey: byKeyOf(tList), list: tList, sprite: raw.traits.sprite },
    items: { byKey: byKeyOf(iList.concat(raw.items.radiant || [])), components: comps, compByKey: byKeyOf(comps), recipes, radiant: (raw.items.radiant || []).map(x => x.key) },   // radiant＝聖光裝備（不能合成，只會被送）
    augments: { byKey: byKeyOf(aList), list: aList },
    rules: raw.rules,
    enemies: raw.enemies,
  };
}

return {loadData, indexData};
})();
const data = modules.data.indexData({"units":{"version":"s19-pbe-3","guessNote":"基本數值、技能數值都對過 PBE 官方資料（11/19，經 MetaTFT 解出的 PBE 客戶端資料）。引擎做不到的機制有簡化，點棋子看技能說明下面的註記。","starMult":{"hp":[1,1.8,3.24],"ad":[1,1.5,2.25]},"sprite":{"src":"../icons/s19/champions.webp?v=1116","cols":10,"rows":10,"cell":64,"map":{"Ahri":0,"AkaliKDA":1,"AkaliTrueDamage":2,"Alistar":3,"Alune":4,"Amumu":5,"Annie":6,"Aphelios":7,"Ashe":8,"Aurora":9,"Bard":10,"BaronNashor":11,"Braum":12,"Briar":13,"Camille":14,"DrMundo":15,"Draven":16,"Ekko":17,"Elise":18,"Evelynn":19,"Ezreal":20,"Galio":21,"Garen":22,"Gnar":23,"Gragas":24,"Graves":25,"Gwen":26,"Illaoi":27,"Janna":28,"Jax":29,"Jhin":30,"Jinx":31,"KSante":32,"KaiSa":33,"Karthus":34,"Katarina":35,"Kayle":36,"Kayn":37,"Kennen":38,"Kobuko":39,"LeeSin":40,"Leona":41,"Lillia":42,"Locke":43,"Lucian":44,"Lulu":45,"Lux":46,"Malzahar":47,"Mel":48,"MissFortune":49,"Mordekaiser":50,"Nasus":51,"Neeko":52,"Nidalee":53,"NunuWillump":54,"Olaf":55,"Pyke":56,"Qiyana":57,"Rakan":58,"Rell":59,"RenataGlasc":60,"Renekton":61,"Samira":62,"Senna":63,"Seraphine":64,"Sett":65,"Shyvana":66,"Smeech":67,"Sona":68,"Swain":69,"Syndra":70,"Taliyah":71,"Taric":72,"Teemo":73,"Thresh":74,"Tibbers":75,"Tristana":76,"TwistedFate":77,"Varus":78,"Vayne":79,"Vi":80,"Viego":81,"Vladimir":82,"Wukong":83,"Xayah":84,"Yasuo":85,"Yone":86,"Yorick":87,"Yunara":88,"Yuumi":89,"Zac":90,"Zeri":91,"Ziggs":92,"Zoe":93}},"units":[{"key":"Elise","zh":"伊莉絲","cost":1,"slots":1,"traits":["IonicSpark","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":700,"ad":50,"as":0.6,"armor":40,"mr":40,"range":1,"mana":[60,120],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"蛛繭","desc":"變身為蜘蛛，獲得280/330/400（受法術強度加成）生命。接著對本回合造成最多傷害的敵人吐出蛛網，暈眩第一個被擊中的敵人1.5秒，並造成90/135/200（受法術強度加成）魔法傷害。\n之後每次施放改為治療230/300/350（受法術強度加成），然後再吐出蛛網。","castTime":0.5,"steps":[{"op":"if","cond":{"flag":"spider"},"then":[{"op":"heal","to":"self","value":{"ap":[230,300,350]}}],"else":[{"op":"buff","to":"self","stat":"hp","value":{"ap":[280,330,400]}},{"op":"flag","name":"spider","on":true},{"op":"fx","name":"morph","at":"self","skin":"spider"}]},{"op":"projectile","to":{"mostDamage":1},"shape":"web","speed":10,"pierce":false,"firstHit":true,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[90,135,200]}},{"op":"stun","to":"prev","dur":1.5},{"op":"fx","name":"burst","at":"current"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"變身加血併入第一次施放。"},"passives":[]},{"key":"Gnar","zh":"吶兒","cost":1,"slots":1,"traits":["Pentakill","Trickshot"],"role":"混合專家","roleClass":"Specialist","dmgType":"hybrid","stats":{"hp":500,"ad":40,"as":0.7,"armor":25,"mr":25,"range":4,"mana":[0,3],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"努力工作","desc":"被動：每第3次攻擊改為投出一顆巨石，造成120/180/270（受攻擊力加成）物理傷害，並使吶兒獲得9%（受法術強度加成）攻擊速度。","castTime":0,"steps":[],"altSteps":null,"altEvery":0,"guess":false,"simplified":"巨石是額外一發，不取代第 3 下普攻。"},"passives":[{"on":"attack","n":3,"src":"unit","ops":[{"op":"projectile","to":"current","shape":"rock","arc":true,"speed":9,"onHit":[{"op":"damage","type":"physical","value":{"ad":[120,180,270]}},{"op":"fx","name":"burst","at":"current"},{"op":"fx","name":"shake","power":1}]},{"op":"buff","to":"self","stat":"asPct","value":{"ap":0.09}}]}]},{"key":"Katarina","zh":"卡特蓮娜","cost":1,"slots":1,"traits":["Classical","Slayer"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":650,"ad":30,"as":0.75,"armor":35,"mr":35,"range":1,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"刀鋒奏鳴曲","desc":"旋轉並劈砍相鄰敵人，造成120/180/285（受法術強度加成）魔法傷害。接著對當前目標開膛，造成240/360/575（受法術強度加成）魔法傷害。被命中的敵人會著迷5秒。\n古典樂成員會使敵人著迷，並對其施加額外效果。","castTime":0.6,"steps":[{"op":"fx","name":"spin","at":"self","r":1,"dur":0.35},{"op":"damage","to":{"adjacent":"enemy"},"type":"magic","value":{"ap":[120,180,285]}},{"op":"status","to":"prev","kind":"charm","dur":5},{"op":"delay","sec":0.25,"ops":[{"op":"fx","name":"slash","at":"current","big":true},{"op":"damage","to":"current","type":"magic","value":{"ap":[240,360,575]}},{"op":"status","to":"prev","kind":"charm","dur":5}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"古典樂的額外效果交給羈絆。"},"passives":[]},{"key":"Kayn","zh":"慨影","cost":1,"slots":1,"traits":["Heartsteel","Slayer"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":650,"ad":42,"as":0.75,"armor":35,"mr":35,"range":1,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"暗夜殘影","desc":"滑行並劈砍，對2格直線內的敵人造成15/25/45（受法術強度加成） + 115/175/270（受攻擊力加成）物理傷害。\n心鋼之聲強化：生命低於70%時變身為暗影刺客，短暫無法被選取為目標，並在本場戰鬥剩餘時間額外造成35%魔法傷害。","castTime":0.5,"steps":[{"op":"pathDash","path":{"kind":"through","to":"current","len":2},"speed":14,"end":"stay","trail":"scythe","onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[15,25,45],"ad":[115,175,270]}},{"op":"fx","name":"slash","at":"current"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「額外35%魔法傷害」簡化為全傷害增幅 +35%；無法被選取的秒數原文沒寫，估 1.5 秒。"},"passives":[{"on":"hpBelow","n":0.7,"limit":1,"src":"unit","ops":[{"op":"if","cond":{"favorite":true},"then":[{"op":"fx","name":"morph","at":"self","skin":"shadow"},{"op":"status","to":"self","kind":"untargetable","dur":1.5},{"op":"buff","to":"self","stat":"dmgAmp","value":0.35}]}],"text":"慨影變身為暗影刺客"}]},{"key":"Kennen","zh":"凱能","cost":1,"slots":1,"traits":["TrueDamage","Bodyguard"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":700,"ad":45,"as":0.65,"armor":45,"mr":45,"range":1,"mana":[0,0],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"放電觀眾","desc":"被動：受到的所有傷害降低7 + 5/8/12（受法術強度加成）。每秒電擊相鄰敵人，造成12/18/30（受法術強度加成）魔法傷害。","castTime":0,"steps":[],"altSteps":null,"altEvery":0,"guess":true,"simplified":"「受到的所有傷害降低 7 + 5/8/12（法術強度加成）」是固定減傷（約 12/15/19 點），簡化成百分比減傷（7% + 5%/8%/12% × 法術強度），這個換算是推測。"},"passives":[{"on":"start","src":"unit","ops":[{"op":"buff","to":"self","stat":"dr","value":{"ap":[0.05,0.08,0.12],"flat":0.07}}]},{"on":"every","n":1,"src":"unit","ops":[{"op":"fx","name":"aura","at":"self","skin":"spark","pulse":true},{"op":"damage","to":{"adjacent":"enemy"},"type":"magic","value":{"ap":[12,18,30]}}]}]},{"key":"Kobuko","zh":"柯布柯","cost":1,"slots":1,"traits":["Hyperpop","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":700,"ad":65,"as":0.6,"armor":40,"mr":40,"range":1,"mana":[40,90],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"音量調大！","desc":"被動：你最強的柯布柯獲得相當於超流行熱度85%的額外生命。（目前生命：（數值未公布））\n主動：進入興奮狀態8秒，每秒治療50/60/85（受法術強度加成） + 1%最大生命。","castTime":0.5,"steps":[{"op":"fx","name":"aura","at":"self","skin":"hype","dur":8},{"op":"repeat","times":8,"gap":1,"ops":[{"op":"heal","to":"self","value":{"ap":[50,60,85],"selfMaxHp":0.01}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"被動「最強的柯布柯獲得超流行熱度 85% 額外生命」沒有對應的熱度機制，丟掉；興奮狀態簡化成連續 8 次每秒治療。"},"passives":[]},{"key":"Lillia","zh":"莉莉亞","cost":1,"slots":1,"traits":["KDA","Bodyguard"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":700,"ad":45,"as":0.6,"armor":40,"mr":40,"range":1,"mana":[40,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"K/DA我們愛你","desc":"治療280/350/550（受法術強度加成）生命，並攻擊目標，對1格圓形範圍內的敵人造成120/180/270（受法術強度加成）魔法傷害，同時施加10%虛弱，持續5秒。\n虛弱：降低造成的傷害。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[280,350,550]}},{"op":"fx","name":"slash","at":"current"},{"op":"fx","name":"shockwave","at":"current","r":1},{"op":"damage","to":{"around":"current","r":1,"includeCenter":true},"type":"magic","value":{"ap":[120,180,270]}},{"op":"status","to":"prev","kind":"weaken","dur":5,"value":0.1}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Neeko","zh":"妮可","cost":1,"slots":1,"traits":["KDA","Encore","Prodigy"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":500,"ad":30,"as":0.7,"armor":25,"mr":25,"range":4,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"K/DA 粉絲後援會","desc":"召集 K/DA 粉絲後援會，向目標射出3道彩帶，每道造成75/115/175（受法術強度加成）魔法傷害。若擊殺目標，永久獲得1%法術強度。\n目前加成：（數值未公布）法術強度","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"ribbon","count":3,"spread":"seq","gap":0.12,"speed":12,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[75,115,175]}},{"op":"fx","name":"flash","at":"current"}],"onEnd":[{"op":"if","cond":{"killed":true},"then":[{"op":"buff","to":"self","stat":"ap","value":1}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"擊殺的永久 +1% 法術強度，簡化成本場戰鬥內有效（法術強度 +1）。"},"passives":[]},{"key":"Olaf","zh":"歐拉夫","cost":1,"slots":1,"traits":["Pentakill","Rock","Juggernaut"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":650,"ad":60,"as":0.6,"armor":40,"mr":40,"range":1,"mana":[0,0],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"諸神黃昏搖滾","desc":"被動：攻擊時治療12/16/25（受法術強度加成） + 1%最大生命。\n死亡時改為完全回復生命並獲得100%攻擊速度，但之後每秒持續損失22%最大生命。","castTime":0,"steps":[],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「每秒損失 22% 最大生命」簡化成 10 秒的真實持續傷害（總計 220%），等於復活後最多撐 4～5 秒。"},"passives":[{"on":"attack","src":"unit","ops":[{"op":"heal","to":"self","value":{"ap":[12,16,25],"selfMaxHp":0.01}}]},{"on":"death","limit":1,"src":"unit","ops":[{"op":"fx","name":"morph","at":"self","skin":"rage"},{"op":"fx","name":"shockwave","at":"self","r":1},{"op":"heal","to":"self","value":{"selfMaxHp":1}},{"op":"buff","to":"self","stat":"asPct","value":1.0},{"op":"dot","to":"self","type":"true","value":{"selfMaxHp":2.2},"dur":10}],"text":"歐拉夫狂暴復活"}]},{"key":"Sett","zh":"賽特","cost":1,"slots":1,"traits":["Heartsteel","Frontman","Collab"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":700,"ad":45,"as":0.6,"armor":30,"mr":30,"range":1,"mana":[30,90],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"活出我人生","desc":"被動：所有來源的最大生命提高30%。\n主動：治療200/210/220（受法術強度加成） + 4%最大生命。對目標揮擊兩次，每次造成7%最大生命的物理傷害。\n心鋼之聲強化：每4秒治療4%最大生命，依已損失生命最多提高100%。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[200,210,220],"selfMaxHp":0.04}},{"op":"damage","to":"current","type":"physical","value":{"selfMaxHp":0.07},"hits":2,"fx":{"name":"slash","heavy":true,"shake":1}}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「所有來源最大生命 +30%」簡化成開場自身最大生命 +30%（不含裝備與羈絆加成）。"},"passives":[{"on":"start","src":"unit","ops":[{"op":"buff","to":"self","stat":"hp","value":{"selfMaxHp":0.3}}]},{"on":"every","n":4,"src":"unit","ops":[{"op":"if","cond":{"favorite":true},"then":[{"op":"heal","to":"self","value":{"selfMaxHp":0.04},"missingScale":1.0}]}]}]},{"key":"Taric","zh":"塔里克","cost":1,"slots":1,"traits":["BeachPop","Juggernaut"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":700,"ad":65,"as":0.65,"armor":40,"mr":40,"range":1,"mana":[30,90],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"旋律迴響","desc":"為塔里克與附近一名受傷的友軍提供275/350/500（受法術強度加成）護盾，持續4秒。","castTime":0.5,"steps":[{"op":"shield","to":"self","value":{"ap":[275,350,500]},"dur":4},{"op":"shield","to":{"allies":1,"notSelf":true,"injured":true},"value":{"ap":[275,350,500]},"dur":4},{"op":"fx","name":"tether","frm":"self","to":"prev","skin":"gem"}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「附近」簡化成受傷的友軍中最近的一位。"},"passives":[]},{"key":"Varus","zh":"法洛士","cost":1,"slots":1,"traits":["Rock","Encore"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":500,"ad":35,"as":0.7,"armor":25,"mr":25,"range":4,"mana":[30,70],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"千箭齊發","desc":"射出一陣箭雨，對目標造成30/45/70（受法術強度加成） + 230/345/520（受攻擊力加成）物理傷害，對相鄰敵人造成15/22.5/35（受法術強度加成） + 115/172.5/260（受攻擊力加成）傷害，並施加20%緩速，持續4秒。\n緩速：降低攻擊速度。","castTime":0.6,"steps":[{"op":"fx","name":"rain","at":"current","r":1,"shape":"arrow","n":8,"dur":0.4},{"op":"damage","to":"current","type":"physical","value":{"ap":[30,45,70],"ad":[230,345,520]}},{"op":"damage","to":{"around":"current","r":1,"includeCenter":false},"type":"physical","value":{"ap":[15,22.5,35],"ad":[115,172.5,260]}},{"op":"status","to":"prev","kind":"chill","dur":4,"value":0.2}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"緩速只加在相鄰的敵人身上（照原文），主目標不緩速。"},"passives":[]},{"key":"Yunara","zh":"尤娜拉","cost":1,"slots":1,"traits":["IonicSpark","Swiftstriker"],"role":"物理射手","roleClass":"Marksman","dmgType":"physical","stats":{"hp":500,"ad":50,"as":0.7,"armor":25,"mr":25,"range":4,"mana":[50,80],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"少時靈心修真","desc":"本場戰鬥剩餘時間，攻擊會額外射出一顆光球，造成3/5/7（受法術強度加成） + 13/20/30（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"fx","name":"aura","at":"self","skin":"glow"},{"op":"empower","to":"self","dur":60,"onHit":[{"op":"projectile","to":"current","shape":"orb","speed":14,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[3,5,7],"ad":[13,20,30]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「本場剩餘時間」用 60 秒的強化代替。"},"passives":[]},{"key":"Ziggs","zh":"希格斯","cost":1,"slots":1,"traits":["Hyperpop","Arcanist","Swiftstriker"],"role":"魔法射手","roleClass":"Marksman","dmgType":"magic","stats":{"hp":500,"ad":10,"as":0.7,"armor":25,"mr":25,"range":4,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"閃粉炸彈","desc":"被動：攻擊額外造成40/60/90（受法術強度加成）魔法傷害。\n主動：向目標投擲炸彈，對目標造成155/235/355（受法術強度加成）魔法傷害，對相鄰敵人造成70/105/160（受法術強度加成）魔法傷害。","castTime":0.6,"steps":[{"op":"projectile","to":"current","shape":"bomb","arc":true,"speed":8,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[155,235,355]}},{"op":"damage","to":{"around":"current","r":1,"includeCenter":false},"type":"magic","value":{"ap":[70,105,160]}},{"op":"fx","name":"burst","at":"current","r":1},{"op":"fx","name":"shockwave","at":"current","r":1},{"op":"fx","name":"shake","power":1}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[{"on":"attack","src":"unit","ops":[{"op":"damage","to":"current","type":"magic","value":{"ap":[40,60,90]}}]}]},{"key":"Zoe","zh":"柔依","cost":1,"slots":1,"traits":["BeachPop","Arcanist"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":500,"ad":30,"as":0.7,"armor":25,"mr":25,"range":4,"mana":[15,90],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"彈力球","desc":"向後發射一顆彈力球，再將它導向距離最遠的敵人，對第一個命中的敵人造成450/675/1000（受法術強度加成）魔法傷害。若目標死亡，彈力球會彈跳至下一名敵人，並把溢出的傷害轉移給他。","castTime":0.8,"steps":[{"op":"fx","name":"hop","at":"self","skin":"tossback"},{"op":"projectile","to":{"farthest":1},"shape":"ball","speed":13,"pierce":false,"firstHit":true,"bounce":{"when":"kill","carry":"overkill","pick":"nextInPath"},"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[450,675,1000]}},{"op":"fx","name":"burst","at":"current"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Annie","zh":"安妮","cost":2,"slots":1,"traits":["IonicSpark","Arcanist","Juggernaut"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":900,"ad":50,"as":0.6,"armor":45,"mr":45,"range":1,"mana":[20,80],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"我們「真的」放火了","desc":"獲得350/425/600（受法術強度加成）護盾，持續4秒。釋放一道火焰錐，對敵人造成80/120/180（受法術強度加成）魔法傷害，並施加1%灼燒與33%重傷，持續4秒。","castTime":0.5,"steps":[{"op":"shield","to":"self","value":{"ap":[350,425,600]},"dur":4},{"op":"fx","name":"cone","frm":"self","to":"current","r":2,"skin":"fire","dur":0.5},{"op":"damage","type":"magic","value":{"ap":[80,120,180]},"to":{"cone":"current","r":2}},{"op":"status","to":"prev","kind":"burn","dur":4,"value":0.01},{"op":"status","to":"prev","kind":"wound","dur":4,"value":0.33}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Ashe","zh":"艾希","cost":2,"slots":1,"traits":["BeachPop","Swiftstriker"],"role":"物理射手","roleClass":"Marksman","dmgType":"physical","stats":{"hp":550,"ad":50,"as":0.75,"armor":30,"mr":30,"range":5,"mana":[20,60],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"連射不停","desc":"接下來6次攻擊獲得30% + 20%（受法術強度加成）攻擊速度，並改為射出3支箭的連射，每支箭造成35/53/80（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"empower","to":"self","attacks":6,"asPct":{"flat":0.3,"ap":0.2},"replace":true,"onHit":[{"op":"projectile","to":"current","shape":"arrow","count":3,"spread":"fan","speed":16,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ad":[35,53,80]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Camille","zh":"卡蜜兒","cost":2,"slots":1,"traits":["Rock","Slayer"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":750,"ad":45,"as":0.8,"armor":45,"mr":45,"range":1,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"穿心鋼鐵鉤射","desc":"被動：目標死亡時，使用鉤爪衝向下一個目標，造成90/135/210（受攻擊力加成）物理傷害。\n主動：掃堂腿，對錐形範圍造成60/90/135（受法術強度加成） + 200/300/465（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"fx","name":"cone","frm":"self","to":"current","r":2,"skin":"sweep","dur":0.3},{"op":"damage","type":"physical","value":{"ap":[60,90,135],"ad":[200,300,465]},"to":{"cone":"current","r":2}}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[{"on":"kill","src":"unit","ops":[{"op":"fx","name":"tether","frm":"self","to":{"nearest":1},"skin":"hook","dur":0.15},{"op":"dash","to":{"nearest":1}},{"op":"damage","type":"physical","value":{"ad":[90,135,210]}}]}]},{"key":"Ezreal","zh":"伊澤瑞爾","cost":2,"slots":1,"traits":["Heartsteel","Encore"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":550,"ad":40,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,35],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"咬緊牙關","desc":"射出一枚飛彈標記目標，再射出一發將其引爆。爆炸對目標造成30/45/70（受法術強度加成） + 210/315/475（受攻擊力加成）物理傷害，對1格內的單位造成9.9/14.85/23.1（受法術強度加成） + 69.3/103.95/156.75（受攻擊力加成）物理傷害。\n心鋼之聲強化：引爆多造成25%傷害。每第3次施放改為波及2格半徑內的敵人。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"bolt","speed":16,"onHit":[{"op":"fx","name":"flash","at":"current","skin":"mark"}]},{"op":"delay","sec":0.25,"ops":[{"op":"projectile","to":"current","shape":"bolt","speed":16,"onHit":[{"op":"damage","type":"physical","value":{"ap":[30,45,70],"ad":[210,315,475]}},{"op":"if","cond":{"castN":3},"then":[{"op":"damage","type":"physical","value":{"ap":[9.9,14.85,23.1],"ad":[69.3,103.95,156.75]},"to":{"around":"current","r":2,"includeCenter":false}}],"else":[{"op":"damage","type":"physical","value":{"ap":[9.9,14.85,23.1],"ad":[69.3,103.95,156.75]},"to":{"around":"current","r":1,"includeCenter":false}}]},{"op":"if","cond":{"favorite":true},"then":[{"op":"damage","type":"physical","value":{"ap":[7.5,11.25,17.5],"ad":[52.5,78.75,118.75]},"to":"current"}]},{"op":"fx","name":"burst","at":"current","r":1}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"標記與引爆合成一次傷害（標記彈只做畫面）。"},"passives":[]},{"key":"Gragas","zh":"古拉格斯","cost":2,"slots":1,"traits":["KDA","Juggernaut","Collab"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":950,"ad":50,"as":0.55,"armor":45,"mr":45,"range":1,"mana":[30,80],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"粉絲派對","desc":"狂歡5秒，每秒回復56/61/68（受法術強度加成） + 2%最大生命，並在攻擊時額外造成60/80/100（受法術強度加成） + 6%最大生命魔法傷害。\n每有一名3星的 K/DA 友軍，兩項效果提高15%。（總提升：（數值未公布））","castTime":0.5,"steps":[{"op":"fx","name":"aura","at":"self","skin":"party","dur":5},{"op":"empower","to":"self","dur":5,"onHit":[{"op":"damage","type":"magic","value":{"ap":[60,80,100],"selfMaxHp":0.06}}]},{"op":"repeat","times":5,"gap":1,"ops":[{"op":"heal","to":"self","value":{"ap":[56,61,68],"selfMaxHp":0.02}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"3星K/DA友軍的15%加成丟掉；原文「最大生命」當成古拉格斯自己的最大生命。"},"passives":[]},{"key":"Illaoi","zh":"伊羅旖","cost":2,"slots":1,"traits":["ILLBEATS","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":950,"ad":50,"as":0.65,"armor":45,"mr":45,"range":1,"mana":[30,90],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"爆紅曲版稅","desc":"主動：治療275/325/475（受法術強度加成），並對2格直線內的敵人造成120/180/270（受法術強度加成）魔法傷害。\n任務：在玩家對戰中施放技能時，每次施放獲得2點名氣，你每有10金幣再多1點（最多計算70金幣）。累積200點名氣時，伊羅旖達成白金成就，獲得15%韌性，且之後每次施放技能改為產生1金幣。\n（目前名氣：（數值未公布）/ 200）伊羅旖達成白金！（已產生金幣：（數值未公布））","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[275,325,475]}},{"op":"fx","name":"ground","shape":"line","frm":"self","to":"current","len":2,"skin":"tentacle","dur":0.4},{"op":"fx","name":"shake","power":1},{"op":"damage","type":"magic","value":{"ap":[120,180,270]},"to":{"line":"current","len":2}}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"名氣任務、15%韌性、產生金幣全部丟掉。"},"passives":[]},{"key":"Jax","zh":"賈克斯","cost":2,"slots":1,"traits":["EDM","Bodyguard","Swiftstriker"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":750,"ad":15,"as":0.75,"armor":50,"mr":50,"range":1,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"瞬間粉碎","desc":"盾擊目前目標，造成200/300/480（受法術強度加成）魔法傷害，並治療傷害量的20%。本場戰鬥剩餘時間獲得15%攻擊速度。\n電子舞曲強化：向最近的2名敵人發射光束，各造成50/75/115（受法術強度加成）魔法傷害，光束每穿透一名敵人，傷害降低40%。","castTime":0.4,"steps":[{"op":"damage","type":"magic","value":{"ap":[200,300,480]},"fx":{"name":"slash","heavy":true}},{"op":"heal","to":"self","value":{"dealt":0.2}},{"op":"buff","to":"self","stat":"asPct","value":0.15},{"op":"if","cond":{"traitActive":"EDM"},"then":[{"op":"damage","type":"magic","value":{"ap":[50,75,115]},"to":{"nearest":2},"falloff":0.4,"fx":{"name":"beam","frm":"self","skin":"edm","dur":0.25}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Karthus","zh":"卡爾瑟斯","cost":2,"slots":1,"traits":["Pentakill","Arcanist","Collab"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":550,"ad":30,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[10,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"安魂曲","desc":"短暫延遲後，對當前目標造成440/660/930（受法術強度加成）魔法傷害。若目標死亡，則以70%效果再次施放技能。","castTime":0.8,"steps":[{"op":"fx","name":"rain","at":"current","shape":"pillar","n":1},{"op":"fx","name":"shake","power":1},{"op":"damage","type":"magic","value":{"ap":[440,660,930]}},{"op":"if","cond":{"killed":true},"then":[{"op":"damage","type":"magic","value":{"ap":[308,462,651]},"to":{"nearest":1}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"擊殺後只再放一次（70%），不連鎖。"},"passives":[]},{"key":"Lucian","zh":"路西恩","cost":2,"slots":1,"traits":["Jazz","Hitmaker","Encore"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":550,"ad":30,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,20],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"冷酷進擊","desc":"滑行到附近一格，並向目標射擊2次，每發造成8/12/18（受法術強度加成） + 80/120/180（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"pathDash","path":{"kind":"side","dist":1,"keepRange":true},"speed":14,"end":"stay","trail":"dash","then":[{"op":"projectile","to":"current","shape":"bolt","count":2,"spread":"seq","gap":0.12,"speed":18,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[8,12,18],"ad":[80,120,180]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Lulu","zh":"露璐","cost":2,"slots":1,"traits":["Hyperpop","Choreographer"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":550,"ad":35,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"亢奮女孩","desc":"在兩種效果之間輪流切換：\n奇想！：賦予一名友軍35% + 45%/55%/65%（受法術強度加成）會逐漸衰減的攻擊速度，以及命中時20/30/45（受法術強度加成）魔法傷害，持續5秒。\n狂野生長：使一名友軍生命提高175/260/395（受法術強度加成），持續5秒。效果期間，相鄰敵人每秒受到20/30/45（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"fx","name":"tether","frm":"self","to":{"allies":1},"skin":"sparkle"},{"op":"buff","to":{"allies":1},"stat":"asPct","value":{"flat":0.35,"ap":[0.45,0.55,0.65]},"dur":5,"decay":true},{"op":"empower","to":{"allies":1},"dur":5,"onHit":[{"op":"damage","type":"magic","value":{"ap":[20,30,45]}}]}],"altSteps":[{"op":"fx","name":"morph","at":{"allies":1},"skin":"grow","dur":5},{"op":"buff","to":{"allies":1},"stat":"hp","value":{"ap":[175,260,395]},"dur":5},{"op":"zone","at":{"allies":1},"r":1,"dur":5,"tick":1,"enemy":[{"op":"damage","type":"magic","value":{"ap":[20,30,45]}}],"follow":true,"skin":"wildgrowth"}],"altEvery":2,"guess":false,"simplified":""},"passives":[]},{"key":"Lux","zh":"拉克絲","cost":2,"slots":1,"traits":["IonicSpark","Prodigy"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":550,"ad":30,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"拉克絲光束！","desc":"向空中拋出稜鏡並以光束擊中它。光束分裂，對目標造成300/450/675（受法術強度加成）魔法傷害，對附近另一名敵人造成160/240/360（受法術強度加成）魔法傷害。每有一名敵人死亡，獲得8點魔力。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"prism","arc":true,"speed":10,"stopAbove":true,"onHit":[{"op":"fx","name":"beam","frm":"self","to":"current","skin":"light","dur":0.3},{"op":"damage","type":"magic","value":{"ap":[300,450,675]}},{"op":"damage","type":"magic","value":{"ap":[160,240,360]},"to":{"around":"current","r":2,"includeCenter":false,"max":1}},{"op":"fx","name":"beam","frm":"current","to":"prev","skin":"light","thin":true,"dur":0.3}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"第二道光束打目標 2 格內最近的 1 名敵人（「附近」的距離原文沒寫，推測）。"},"passives":[{"on":"enemyDeath","src":"unit","ops":[{"op":"mana","to":"self","value":8}]}]},{"key":"Nasus","zh":"納瑟斯","cost":2,"slots":1,"traits":["Classical","Bodyguard"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":950,"ad":50,"as":0.6,"armor":45,"mr":45,"range":1,"mana":[25,75],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"藝術贊助人","desc":"創造一個2格範圍的華麗領域，持續5秒。效果期間，每秒治療自身100/150/250（受法術強度加成），領域內的友軍每秒治療25/35/60（受法術強度加成）。最大生命低於納瑟斯的敵人會每秒受到30/45/70（受法術強度加成）魔法傷害，並且著迷。\n著迷的敵人會為古典樂成員提供加成。","castTime":0.5,"steps":[{"op":"zone","at":"self","r":2,"dur":5,"tick":0.5,"enemy":[{"op":"if","cond":{"tgtMaxHpBelowSelf":true},"then":[{"op":"damage","type":"magic","value":{"ap":[15,22.5,35]}},{"op":"status","kind":"charm","dur":0.55}]}],"ally":[{"op":"heal","value":{"ap":[12.5,17.5,30]}}],"skin":"gala","follow":false},{"op":"repeat","times":5,"gap":1,"ops":[{"op":"heal","to":"self","value":{"ap":[100,150,250]}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"領域每 0.5 秒結算一次，傷害與友軍治療取每秒數值的一半；著迷每次 0.55 秒；自身治療另寫，區域友軍治療若含自己會多算。"},"passives":[]},{"key":"Qiyana","zh":"姬亞娜","cost":2,"slots":1,"traits":["TrueDamage","Renegade"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":750,"ad":45,"as":0.8,"armor":40,"mr":40,"range":1,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"隨機播放清單","desc":"被動：姬亞娜的指環會定期變色，使她的技能獲得不同的額外效果。\n主動：直線衝刺攻擊敵人，對目標造成30/45/70（受法術強度加成） + 195/290/440（受攻擊力加成）物理傷害，對其他被命中的敵人造成15/22.5/35（受法術強度加成） + 97.5/145/220（受攻擊力加成）傷害。\n紅色：額外造成20%傷害\n綠色：治療傷害量的20%\n藍色：回復10點魔力\n金色：獲得1金幣，並隨機套用其他一種效果。（已獲得金幣：（數值未公布））","castTime":0.5,"steps":[{"op":"pathDash","path":{"kind":"through","to":"current","len":2},"speed":14,"end":"stay","trail":"ring","onHit":[{"op":"if","cond":{"isMainTarget":true},"then":[{"op":"damage","to":"current","type":"physical","value":{"ap":[30,45,70],"ad":[195,290,440]}}],"else":[{"op":"damage","to":"current","type":"physical","value":{"ap":[15,22.5,35],"ad":[97.5,145,220]}}]},{"op":"fx","name":"slash","at":"current"}],"then":[{"op":"if","cond":{"castN":3},"then":[{"op":"heal","to":"self","value":{"dealt":0.2}}]},{"op":"if","cond":{"castN":2},"then":[{"op":"mana","to":"self","value":10}]},{"op":"if","cond":{"castN":4},"then":[{"op":"econ","kind":"gold","value":1}]},{"op":"damage","type":"physical","value":{"dealt":0.2},"to":"current"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"顏色輪替改成固定規則：紅色傷害每次都有，綠色（治療）每第3次，藍色（回魔）每第2次，金色（1金幣）每第4次。"},"passives":[]},{"key":"RenataGlasc","zh":"睿娜妲．格萊斯克","cost":2,"slots":1,"traits":["Classical","Choreographer"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":550,"ad":30,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,45],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"敵意音符","desc":"向目標投出樂譜，施加2層毒素。毒素在15秒內造成160/240/580（受法術強度加成）魔法傷害。同時對2名附近敵人各施加1層毒素，優先選擇未中毒者。\n敵人在受到毒素時會著迷3秒；若其星級小於或等於睿娜妲．格萊斯克，則延長為9秒。\n著迷的敵人會為古典樂成員提供加成。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"note","speed":11,"onHit":[{"op":"dot","to":"current","type":"magic","value":{"ap":[160,240,580]},"dur":15,"tick":1},{"op":"status","to":"current","kind":"poison","dur":15},{"op":"status","to":"current","kind":"charm","dur":3},{"op":"dot","to":{"around":"current","r":2,"includeCenter":false,"max":2,"prefer":{"noStatus":"poison"}},"type":"magic","value":{"ap":[80,120,290]},"dur":15,"tick":1},{"op":"status","to":"prev","kind":"poison","dur":15},{"op":"status","to":{"around":"current","r":2,"includeCenter":false,"max":2,"prefer":{"noStatus":"poison"}},"kind":"charm","dur":3},{"op":"fx","name":"burst","at":"current","skin":"poison"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"毒素層數改成總傷害（目標2層＝全額，周圍各1層＝一半）；星級較低者著迷9秒略掉，一律3秒。"},"passives":[]},{"key":"Renekton","zh":"雷尼克頓","cost":2,"slots":1,"traits":["BeachPop","Frontman"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":950,"ad":50,"as":0.65,"armor":40,"mr":40,"range":1,"mana":[60,110],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"鱷魚搖滾","desc":"體型變大，本場戰鬥剩餘時間獲得180/230/325（受法術強度加成）最大生命。接著旋轉，對相鄰敵人造成100/145/240（受攻擊力加成） + 8%最大生命的物理傷害。","castTime":0.5,"steps":[{"op":"fx","name":"morph","at":"self","skin":"grow"},{"op":"buff","to":"self","stat":"hp","value":{"ap":[180,230,325]}},{"op":"fx","name":"spin","at":"self","r":1,"dur":0.4},{"op":"damage","type":"physical","value":{"ad":[100,145,240],"selfMaxHp":0.08},"to":{"adjacent":"enemy"}}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"原文「8%最大生命」當成雷尼克頓自己的最大生命。"},"passives":[]},{"key":"Samira","zh":"煞蜜拉","cost":2,"slots":1,"traits":["Classical","Renegade","Trickshot"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":550,"ad":42,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,55],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"子彈與玫瑰","desc":"被動：煞蜜拉對敵人打出暴擊時，使其著迷3秒。\n主動：向當前目標射出10發子彈，每發造成4/6/9（受法術強度加成） + 38/52/86（受攻擊力加成）傷害。\n著迷的敵人會為古典樂成員提供加成。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"bullet","count":10,"spread":"seq","gap":0.06,"jitter":true,"speed":20,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[4,6,9],"ad":[38,52,86]}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"暴擊著迷沒有對應觸發，改成每第4次普攻（暴擊率25%）著迷目標3秒；技能傷害類型原文未寫，當物理。"},"passives":[{"on":"attack","n":4,"src":"unit","ops":[{"op":"status","to":"current","kind":"charm","dur":3}]}]},{"key":"Seraphine","zh":"瑟菈紛","cost":2,"slots":1,"traits":["Indie"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":700,"ad":30,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"值得關注的直播","desc":"獨立音樂：向目標傾瀉一串音符，同時對粉絲擺姿勢，在2.5秒內造成550/825/1240（受法術強度加成）魔法傷害。\n新星：向附近敵人額外射出8顆音符，每顆造成20/30/45（受法術強度加成）魔法傷害。\n超級巨星：向所有敵人射出高音音符，各造成45/68/100（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"channel","dur":2.5,"tick":0.5,"skin":"notes","to":"current","ops":[{"op":"projectile","to":"current","shape":"note","count":2,"spread":"seq","gap":0.1,"speed":12,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[55,82.5,124]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"新星、超級巨星的額外音符（沒有數字）丟掉；引導期間不普攻。"},"passives":[]},{"key":"Tristana","zh":"崔絲塔娜","cost":2,"slots":1,"traits":["Hyperpop","Hitmaker"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":550,"ad":45,"as":0.75,"armor":30,"mr":30,"range":4,"mana":[0,55],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"甩頭高手","desc":"向3名附近敵人丟出炸彈並引爆，每顆造成15/20/30（受法術強度加成） + 125/190/285（受攻擊力加成）物理傷害。最後一次爆炸改為造成30/40/60（受法術強度加成） + 250/380/570（受攻擊力加成）傷害。","castTime":0.5,"steps":[{"op":"projectile","to":{"nearest":3},"shape":"bomb","arc":true,"speed":10,"spread":"seq","gap":0.15,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[15,20,30],"ad":[125,190,285]}},{"op":"fx","name":"burst","at":"current"}],"onEnd":[{"op":"delay","sec":0.15,"ops":[{"op":"damage","type":"physical","value":{"ap":[15,20,30],"ad":[125,190,285]},"to":{"nearest":1}},{"op":"fx","name":"burst","at":"prev","big":true},{"op":"fx","name":"shake","power":1}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"最後一顆加倍的爆炸，改成再補一次一般傷害在最近敵人身上。"},"passives":[]},{"key":"Amumu","zh":"阿姆姆","cost":3,"slots":1,"traits":["Emo"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1200,"ad":50,"as":0.65,"armor":60,"mr":60,"range":1,"mana":[60,120],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"哭哭與孤寂","desc":"治療450/575/725（受法術強度加成）。向最近的4名敵人甩出繃帶，造成100/150/240（受法術強度加成）魔法傷害，並暈眩1.25/1.5/1.75秒。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[450,575,725]}},{"op":"fx","name":"tether","frm":"self","to":{"nearest":4},"skin":"bandage","dur":0.35},{"op":"damage","type":"magic","value":{"ap":[100,150,240]},"to":{"nearest":4}},{"op":"stun","to":"prev","dur":[1.25,1.5,1.75]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Bard","zh":"巴德","cost":3,"slots":1,"traits":["Jazz","Swiftstriker"],"role":"魔法射手","roleClass":"Marksman","dmgType":"magic","stats":{"hp":650,"ad":30,"as":0.75,"armor":35,"mr":35,"range":4,"mana":[20,80],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"和我一起鈴鈴響","desc":"被動：獲得旅人號角。裝備期間，施放技能會產生經驗值，攻擊會額外提供魔力。\n主動：召喚一波小精靈，對被擊中的敵人造成210/315/505（受法術強度加成）魔法傷害，每穿過一名敵人傷害降低30%。","castTime":0.6,"steps":[{"op":"projectile","to":"current","shape":"spirit","count":5,"spread":"wave","pierce":true,"len":"board","speed":9,"falloff":0.3,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[210,315,505]}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"旅人號角（施法得經驗、攻擊多回魔力）拿掉。"},"passives":[]},{"key":"Braum","zh":"布郎姆","cost":3,"slots":1,"traits":["ILLBEATS","Juggernaut"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1100,"ad":55,"as":0.6,"armor":50,"mr":50,"range":1,"mana":[75,135],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"重擊猛襲","desc":"獲得275/325/375（受法術強度加成） + 10%最大生命護盾，持續4秒。接著重擊地面，對相鄰敵人造成120/180/300（受法術強度加成）魔法傷害並暈眩1.5秒。","castTime":0.5,"steps":[{"op":"shield","to":"self","value":{"ap":[275,325,375],"selfMaxHp":0.1},"dur":4},{"op":"fx","name":"shockwave","at":"self","r":1},{"op":"fx","name":"shake","power":2},{"op":"damage","type":"magic","value":{"ap":[120,180,300]},"to":{"adjacent":"enemy"}},{"op":"stun","to":"prev","dur":1.5}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Briar","zh":"布蕾爾","cost":3,"slots":1,"traits":["IonicSpark","Slayer","Collab"],"role":"物理刺客","roleClass":"Assassin","dmgType":"physical","stats":{"hp":850,"ad":50,"as":0.8,"armor":50,"mr":50,"range":1,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"零食攻擊","desc":"治療100/150/200（受法術強度加成），並將一份零食踢向3格內最遠的敵人，滑行過去並對1格範圍造成100/150/240（受攻擊力加成）物理傷害。\n接著吞下零食，獲得200%攻擊速度（持續3次攻擊），並將這些攻擊改為劈砍，每次造成100/150/240（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[100,150,200]}},{"op":"projectile","to":{"farthest":1,"within":3},"shape":"snack","arc":true,"speed":12,"onHit":[{"op":"dash","to":"current","style":"slide","trail":"blood"},{"op":"damage","type":"physical","value":{"ad":[100,150,240]},"to":{"around":"current","r":1,"includeCenter":true}},{"op":"fx","name":"burst","at":"current","r":1},{"op":"empower","to":"self","attacks":3,"asPct":2.0,"replace":true,"onHit":[{"op":"damage","type":"physical","value":{"ad":[100,150,240]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Draven","zh":"達瑞文","cost":3,"slots":1,"traits":["ILLBEATS","Trickshot"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":650,"ad":45,"as":0.75,"armor":35,"mr":35,"range":4,"mana":[0,60],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"你讓我團團轉(像把斧頭一樣)","desc":"向目標投出巨大的旋轉圓盤，造成155/235/370（受攻擊力加成）物理傷害。圓盤會留下持續3秒的漩渦，每秒對1格內的敵人分攤造成15/25/35（受法術強度加成） + 115/175/275（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"disc","spin":true,"speed":11,"onHit":[{"op":"damage","type":"physical","value":{"ad":[155,235,370]}},{"op":"zone","at":"current","r":1,"dur":3,"tick":1,"enemy":[{"op":"damage","type":"physical","value":{"ap":[15,25,35],"ad":[115,175,275]},"split":true}],"skin":"vortex"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Ekko","zh":"艾克","cost":3,"slots":1,"traits":["TrueDamage","Juggernaut","Prodigy"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1100,"ad":50,"as":0.65,"armor":50,"mr":50,"range":1,"mana":[30,120],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"倒轉時光","desc":"被動：回溯4秒內受到傷害的30%。\n主動：立即治療所有正在回溯的傷害，再加上150/180/250（受法術強度加成）生命。接著攻擊當前目標，造成230/345/675（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"fx","name":"afterimage","at":"self","skin":"rewind"},{"op":"heal","to":"self","value":{"ap":[150,180,250]},"missingScale":0.6},{"op":"damage","type":"magic","value":{"ap":[230,345,675]},"fx":{"name":"slash"}}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"被動回溯 4 秒內 30% 傷害拿掉，改成治療依已損失生命最多 +60%（比例為推測）。"},"passives":[]},{"key":"Evelynn","zh":"伊芙琳","cost":3,"slots":1,"traits":["KDA","Renegade"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":850,"ad":30,"as":0.8,"armor":50,"mr":50,"range":1,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"邪惡","desc":"被動：戰鬥開始時，傳送到當前目標的背後，隨後進入迷霧籠罩狀態，持續15秒。迷霧籠罩期間，若至少有3名其他友軍存活，則無法被普攻指定，並獲得50%續戰力。\n主動：對當前目標造成280/420/700（受法術強度加成）魔法傷害，對半圓範圍內的其他敵人造成120/180/300（受法術強度加成）魔法傷害。無視40%的敵方魔法抗性。","castTime":0.5,"steps":[{"op":"damage","type":"magic","value":{"ap":[280,420,700]},"pen":0.4},{"op":"fx","name":"cone","frm":"self","to":"current","r":2,"wide":true,"skin":"lash","dur":0.3},{"op":"damage","type":"magic","value":{"ap":[120,180,300]},"to":{"cone":"current","r":2,"exclude":"current"},"pen":0.4}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"開場傳送到目標背後、「至少 3 名其他友軍存活」的條件拿掉；「無法被普攻指定」做成 15 秒無法被選取；50% 續戰力做成 15 秒 50% 減傷。"},"passives":[{"on":"start","limit":1,"src":"unit","ops":[{"op":"status","to":"self","kind":"untargetable","dur":15},{"op":"buff","to":"self","stat":"dr","value":0.5,"dur":15}],"text":"邪惡：前 15 秒無法被選取"}]},{"key":"Galio","zh":"加里歐","cost":3,"slots":1,"traits":["Jazz","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1100,"ad":50,"as":0.65,"armor":50,"mr":50,"range":1,"mana":[50,120],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"掀起風暴","desc":"獲得325/400/500（受法術強度加成） + 10%最大生命護盾，持續4秒。對本場戰鬥造成最多傷害的敵人釋放強風，造成120/180/300（受法術強度加成）魔法傷害並暈眩1秒。","castTime":0.5,"steps":[{"op":"shield","to":"self","value":{"ap":[325,400,500],"selfMaxHp":0.1},"dur":4},{"op":"projectile","to":{"mostDamage":1},"shape":"gust","speed":10,"onHit":[{"op":"damage","type":"magic","value":{"ap":[120,180,300]},"to":{"mostDamage":1}},{"op":"stun","to":"prev","dur":1},{"op":"fx","name":"burst","at":"current"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"KSante","zh":"卡桑帝","cost":3,"slots":1,"traits":["Heartsteel","Bodyguard"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":1100,"ad":50,"as":0.65,"armor":50,"mr":50,"range":1,"mana":[70,140],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"在你的主場！","desc":"獲得550/650/800（受法術強度加成）護盾，持續4秒。衝撞並推開目標，暈眩目標與其他被擊中的敵人1.25秒，接著猛擊目標，造成150/225/360（受攻擊力加成）物理傷害。衝撞後嘲諷附近敵人。\n心鋼之聲強化：獲得25護甲與魔法抗性，攻擊時額外造成0.5/0.75/1.2 × 護甲 + 0.5/0.75/1.2 × 魔法抗性的物理傷害。","castTime":0.6,"steps":[{"op":"shield","to":"self","value":{"ap":[550,650,800]},"dur":4},{"op":"dash","to":"current","style":"charge","trail":"dust"},{"op":"displace","to":"current","kind":"knockback","dist":1,"dur":1.25},{"op":"stun","to":{"around":"current","r":1,"includeCenter":false},"dur":1.25},{"op":"fx","name":"shockwave","at":"current","r":1},{"op":"fx","name":"shake","power":2},{"op":"damage","type":"physical","value":{"ad":[150,225,360]},"to":"current"},{"op":"status","to":{"around":"self","r":2},"kind":"taunt","dur":1.25}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"嘲諷時間原文沒寫，暫用 1.25 秒；心鋼強化的 +25 護甲與魔法抗性在開場拿一次，之後一直有。"},"passives":[{"on":"start","src":"unit","ops":[{"op":"if","cond":{"favorite":true},"then":[{"op":"buff","to":"self","stat":"armor","value":25},{"op":"buff","to":"self","stat":"mr","value":25}]}],"text":"心鋼強化：常駐 +25 護甲與魔抗"},{"on":"attack","src":"unit","ops":[{"op":"if","cond":{"favorite":true},"then":[{"op":"damage","type":"physical","value":{"resist":[0.5,0.75,1.2]}}]}],"text":"心鋼強化：攻擊追加傷害"}]},{"key":"KaiSa","zh":"凱莎","cost":3,"slots":1,"traits":["KDA","Trickshot"],"role":"物理射手","roleClass":"Marksman","dmgType":"physical","stats":{"hp":650,"ad":30,"as":0.75,"armor":35,"mr":35,"range":5,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"傾盆而下","desc":"被動：每攻擊3次，發射3枚飛彈，每枚造成6/9/15（受法術強度加成） + 33/50/80（受攻擊力加成）物理傷害。\n主動：本場戰鬥剩餘時間獲得15%攻擊速度。","castTime":0.3,"steps":[{"op":"fx","name":"aura","at":"self","skin":"glow","dur":0.5},{"op":"buff","to":"self","stat":"asPct","value":0.15}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"飛彈只打當前目標（原版會分一部分給目標 2 格內最多 2 名其他敵人）。"},"passives":[{"on":"attack","n":3,"src":"unit","ops":[{"op":"projectile","to":"current","shape":"missile","count":3,"spread":"arcfan","speed":13,"onHit":[{"op":"damage","type":"physical","value":{"ap":[6,9,15],"ad":[33,50,80]}}]}]}]},{"key":"Malzahar","zh":"馬爾札哈","cost":3,"slots":1,"traits":["Composer","Prodigy"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":800,"ad":35,"as":0.8,"armor":35,"mr":35,"range":4,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"禁忌雜音","desc":"向目標發射2秒光束，造成325/485/815（受法術強度加成）魔法傷害。能量隨節奏爆發4次，對1格範圍內的敵人施加30%削抗，持續4秒，每次爆發造成40/60/110（受法術強度加成）魔法傷害。\n削抗：降低魔法抗性。","castTime":0.6,"steps":[{"op":"channel","dur":2,"tick":0.5,"skin":"beam","to":"current","ops":[{"op":"damage","to":"current","type":"magic","value":{"ap":[81.25,121.25,203.75]}},{"op":"status","to":{"around":"current","r":1,"includeCenter":true},"kind":"shred","dur":4,"value":0.3},{"op":"damage","to":"prev","type":"magic","value":{"ap":[40,60,110]}},{"op":"fx","name":"shockwave","at":"current","r":1}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"2 秒光束分成 4 拍（每 0.5 秒），每拍 1/4 的主傷害；引導期間不普攻。"},"passives":[]},{"key":"Senna","zh":"姍娜","cost":3,"slots":1,"traits":["TrueDamage","Hitmaker"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":650,"ad":55,"as":0.75,"armor":35,"mr":35,"range":4,"mana":[0,20],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"迴響毀滅","desc":"射擊目標，造成25/35/60（受法術強度加成） + 160/240/385（受攻擊力加成）物理傷害並標記。若目標已被標記，則引爆標記，造成37.5/52.5/90（受法術強度加成） + 240/360/577.5（受攻擊力加成）傷害。\n引爆標記或擊殺被標記的敵人時，獲得8%傷害增幅，持續到戰鬥結束。","castTime":0.4,"steps":[{"op":"projectile","to":"current","shape":"bolt","speed":18,"onHit":[{"op":"if","cond":{"castN":2},"then":[{"op":"damage","type":"physical","value":{"ap":[37.5,52.5,90],"ad":[240,360,577.5]}},{"op":"buff","to":"self","stat":"dmgAmp","value":0.08,"stackKey":"senna","maxStacks":5}],"else":[{"op":"damage","type":"physical","value":{"ap":[25,35,60],"ad":[160,240,385]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"標記／引爆改成每 2 次施放第 2 次引爆；擊殺標記目標的加成拿掉；傷害增幅可疊最多 5 次（層數上限為推測）。"},"passives":[]},{"key":"Swain","zh":"斯溫","cost":3,"slots":1,"traits":["Rock","Arcanist","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1100,"ad":40,"as":0.6,"armor":50,"mr":50,"range":1,"mana":[70,120],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"殘酷惡魔的論文","desc":"進入惡魔形態，獲得220/275/400（受法術強度加成）最大生命，並每秒對相鄰敵人造成20/30/48（受法術強度加成）魔法傷害。之後每次施放會治療275/350/475（受法術強度加成），並使傷害提高5/8/12（受法術強度加成）。","castTime":0.5,"steps":[{"op":"if","cond":{"flag":"demon"},"then":[{"op":"heal","to":"self","value":{"ap":[275,350,475]}}],"else":[{"op":"buff","to":"self","stat":"hp","value":{"ap":[220,275,400]}},{"op":"flag","name":"demon","on":true},{"op":"fx","name":"morph","at":"self","skin":"demon"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"之後每次施放增加傷害 5/8/12 的成長拿掉。"},"passives":[{"on":"every","n":1,"src":"unit","ops":[{"op":"if","cond":{"flag":"demon"},"then":[{"op":"fx","name":"aura","at":"self","skin":"drain","pulse":true},{"op":"damage","type":"magic","value":{"ap":[20,30,48]},"to":{"adjacent":"enemy"}}]}]}]},{"key":"Syndra","zh":"星朵拉","cost":3,"slots":1,"traits":["BeachPop","Choreographer"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":650,"ad":30,"as":0.75,"armor":35,"mr":35,"range":4,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"發球！","desc":"向目標扣殺排球，造成330/495/790（受法術強度加成）魔法傷害。球會彈向其後方物品最少的敵人，造成110/165/265（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"ball","arc":true,"speed":13,"onHit":[{"op":"damage","type":"magic","value":{"ap":[330,495,790]}},{"op":"fx","name":"burst","at":"current"},{"op":"projectile","frm":"current","to":{"behind":"current","fewestItems":1},"shape":"ball","arc":true,"speed":11,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[110,165,265]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Tibbers","zh":"泰貝爾","cost":3,"slots":1,"traits":["IonicSpark","Bodyguard"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":1100,"ad":50,"as":0.65,"armor":50,"mr":50,"range":1,"mana":[40,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"女孩最好的朋友","desc":"被動：生命降到30%或你最強的安妮死亡時，進入狂暴，獲得300/500/800最大生命、100%攻擊力，以及會在6秒內衰減的200%攻擊速度。\n主動：獲得550/650/800（受法術強度加成）護盾，持續4秒。若處於狂暴狀態，則刷新衰減中的攻擊速度。","castTime":0.5,"steps":[{"op":"shield","to":"self","value":{"ap":[550,650,800]},"dur":4},{"op":"if","cond":{"flag":"enraged"},"then":[{"op":"buff","to":"self","stat":"asPct","value":2.0,"dur":6,"decay":true}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「最強的安妮死亡」觸發條件拿掉，只剩生命低於 30%。"},"passives":[{"on":"hpBelow","n":0.3,"limit":1,"src":"unit","ops":[{"op":"fx","name":"morph","at":"self","skin":"rage"},{"op":"buff","to":"self","stat":"hp","value":[300,500,800]},{"op":"buff","to":"self","stat":"adPct","value":1.0},{"op":"buff","to":"self","stat":"asPct","value":2.0,"dur":6,"decay":true},{"op":"flag","name":"enraged","on":true}],"text":"狂暴"}]},{"key":"Viego","zh":"維爾戈","cost":3,"slots":1,"traits":["Pentakill","Choreographer","Slayer"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":850,"ad":60,"as":0.8,"armor":55,"mr":55,"range":1,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"鎖定目標","desc":"在目標周圍召喚10把劍，短暫延遲後刺穿目標，每把劍造成37/56/89（受法術強度加成）物理傷害。\n每擊殺8名敵人，永久獲得一把劍。","castTime":0.8,"steps":[{"op":"fx","name":"telegraph","at":"current","skin":"swords","n":10,"dur":0.3},{"op":"delay","sec":0.3,"ops":[{"op":"repeat","times":10,"gap":0.08,"ops":[{"op":"damage","type":"physical","value":{"ap":[37,56,89]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"擊殺累積永久多一把劍拿掉；10 把劍改成每 0.08 秒連續刺一把。"},"passives":[]},{"key":"Ahri","zh":"阿璃","cost":4,"slots":1,"traits":["KDA","Choreographer"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":850,"ad":30,"as":0.8,"armor":40,"mr":40,"range":4,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"燃盡一切","desc":"被動：戰鬥開始時擁有6枚狐火，施放技能後獲得2/2/4枚，最多14枚。接著進入流動狀態，移動更快並強化接下來的施放。\n主動：向目標射出所有狐火，每枚造成28/42/400（受法術強度加成）魔法傷害。處於流動狀態時，改為向目標投出一顆愛心，造成235/350/2000（受法術強度加成）魔法傷害，並將狐火分散給目標2格內的所有敵人。","castTime":0.5,"steps":[{"op":"if","cond":{"flag":"ahri4"},"then":[{"op":"projectile","to":"current","shape":"orb","count":[14,14,14],"spread":"arcfan","gap":0.05,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]}],"else":[{"op":"if","cond":{"flag":"ahri3"},"then":[{"op":"projectile","to":"current","shape":"orb","count":[12,12,14],"spread":"arcfan","gap":0.05,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]},{"op":"flag","name":"ahri4","on":true}],"else":[{"op":"if","cond":{"flag":"ahri2"},"then":[{"op":"projectile","to":"current","shape":"orb","count":[10,10,14],"spread":"arcfan","gap":0.05,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]},{"op":"flag","name":"ahri3","on":true}],"else":[{"op":"if","cond":{"flag":"ahri1"},"then":[{"op":"projectile","to":"current","shape":"orb","count":[8,8,10],"spread":"arcfan","gap":0.05,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]},{"op":"flag","name":"ahri2","on":true}],"else":[{"op":"projectile","to":"current","shape":"orb","count":[6,6,6],"spread":"arcfan","gap":0.05,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]},{"op":"flag","name":"ahri1","on":true}]}]}]}]}],"altSteps":[{"op":"if","cond":{"flag":"ahri4"},"then":[{"op":"fx","name":"afterimage","at":"self","skin":"flow"},{"op":"projectile","to":"current","shape":"heart","speed":11,"onHit":[{"op":"fx","name":"burst","at":"current","r":2},{"op":"damage","to":"current","type":"magic","value":{"ap":[235,350,2000]}},{"op":"projectile","frm":"current","to":{"around":"current","r":2,"includeCenter":true},"shape":"orb","count":[14,14,14],"spread":"distribute","speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]}]}],"else":[{"op":"if","cond":{"flag":"ahri3"},"then":[{"op":"fx","name":"afterimage","at":"self","skin":"flow"},{"op":"projectile","to":"current","shape":"heart","speed":11,"onHit":[{"op":"fx","name":"burst","at":"current","r":2},{"op":"damage","to":"current","type":"magic","value":{"ap":[235,350,2000]}},{"op":"projectile","frm":"current","to":{"around":"current","r":2,"includeCenter":true},"shape":"orb","count":[12,12,14],"spread":"distribute","speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]}]},{"op":"flag","name":"ahri4","on":true}],"else":[{"op":"if","cond":{"flag":"ahri2"},"then":[{"op":"fx","name":"afterimage","at":"self","skin":"flow"},{"op":"projectile","to":"current","shape":"heart","speed":11,"onHit":[{"op":"fx","name":"burst","at":"current","r":2},{"op":"damage","to":"current","type":"magic","value":{"ap":[235,350,2000]}},{"op":"projectile","frm":"current","to":{"around":"current","r":2,"includeCenter":true},"shape":"orb","count":[10,10,14],"spread":"distribute","speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]}]},{"op":"flag","name":"ahri3","on":true}],"else":[{"op":"if","cond":{"flag":"ahri1"},"then":[{"op":"fx","name":"afterimage","at":"self","skin":"flow"},{"op":"projectile","to":"current","shape":"heart","speed":11,"onHit":[{"op":"fx","name":"burst","at":"current","r":2},{"op":"damage","to":"current","type":"magic","value":{"ap":[235,350,2000]}},{"op":"projectile","frm":"current","to":{"around":"current","r":2,"includeCenter":true},"shape":"orb","count":[8,8,10],"spread":"distribute","speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]}]},{"op":"flag","name":"ahri2","on":true}],"else":[{"op":"fx","name":"afterimage","at":"self","skin":"flow"},{"op":"projectile","to":"current","shape":"heart","speed":11,"onHit":[{"op":"fx","name":"burst","at":"current","r":2},{"op":"damage","to":"current","type":"magic","value":{"ap":[235,350,2000]}},{"op":"projectile","frm":"current","to":{"around":"current","r":2,"includeCenter":true},"shape":"orb","count":[6,6,6],"spread":"distribute","speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[28,42,400]}}]}]},{"op":"flag","name":"ahri1","on":true}]}]}]}]}],"altEvery":2,"guess":false,"simplified":"狐火數量依施放次數成長（起始 6 枚，每次施放 +2/2/4，上限 14），施放後不會歸零；流動狀態改成每 2 次施放的第 2 次；流動狀態的移動加快省略。"},"passives":[]},{"key":"Alistar","zh":"亞歷斯塔","cost":4,"slots":1,"traits":["Country"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1400,"ad":60,"as":0.65,"armor":60,"mr":60,"range":1,"mana":[70,155],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"雨中哭泣的藍色乳牛","desc":"治療265/300/2000（受法術強度加成），依已損失生命最多提高100%。接著攻擊目標，將其3格內的敵人擊飛1.5/1.75/8秒，並對所有被擊中的敵人造成100/150/2500（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[265,300,2000]},"missingScale":1.0},{"op":"fx","name":"slash","at":"current","heavy":true},{"op":"fx","name":"shockwave","at":"current","r":3},{"op":"fx","name":"shake","power":3},{"op":"damage","type":"magic","value":{"ap":[100,150,2500]},"to":{"around":"current","r":3,"includeCenter":true}},{"op":"displace","to":"prev","kind":"knockup","dur":[1.5,1.75,8]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Alune","zh":"亞盧妮","cost":4,"slots":1,"traits":["Heartsteel","Manager","Prodigy"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":800,"ad":30,"as":0.75,"armor":40,"mr":40,"range":4,"mana":[20,65],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"焦點商品","desc":"以聚光燈照亮目標，造成315/475/2250（受法術強度加成）魔法傷害。目標2格內的所有敵人分攤340/510/2500（受法術強度加成）魔法傷害。若目標死亡，剩餘傷害會分給最近的2名敵人。\n心鋼之聲強化：向目標發射5枚投射物，每枚造成30/45/72（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"if","cond":{"favorite":true},"then":[{"op":"projectile","to":"current","shape":"orb","count":5,"spread":"seq","gap":0.08,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[30,45,72]}}]}],"else":[{"op":"fx","name":"rain","at":"current","shape":"spotlight","n":1},{"op":"fx","name":"ground","at":"current","r":2,"skin":"light","dur":0.5},{"op":"damage","type":"magic","value":{"ap":[315,475,2250]},"to":"current"},{"op":"damage","type":"magic","value":{"ap":[340,510,2500]},"to":{"around":"current","r":2,"includeCenter":false},"split":true}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"目標死亡時剩餘傷害轉給最近 2 名敵人這段省略。"},"passives":[]},{"key":"Aurora","zh":"歐羅拉","cost":4,"slots":1,"traits":["IonicSpark","Renegade"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":850,"ad":35,"as":0.75,"armor":40,"mr":40,"range":4,"mana":[0,60],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"雙界相隔","desc":"傳送並沿最佳直線發射一道光束。對生命最高的2名敵人造成275/415/2000（受法術強度加成）魔法傷害，對其餘敵人造成90/135/1500（受法術強度加成）魔法傷害。接著回到原位。","castTime":0.5,"steps":[{"op":"blink","place":{"bestLine":{"len":"board"}},"remember":true,"then":[{"op":"fx","name":"beam","frm":"self","along":"bestLine","len":"board","skin":"aurora","wide":true,"dur":0.5},{"op":"fx","name":"shake","power":1},{"op":"damage","to":{"line":"best","len":"board","pick":{"highestHp":2}},"type":"magic","value":{"ap":[275,415,2000]}},{"op":"damage","to":{"line":"best","len":"board","exclude":"prev"},"type":"magic","value":{"ap":[90,135,1500]}},{"op":"delay","sec":0.5,"ops":[{"op":"blink","place":"origin"}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Garen","zh":"蓋倫","cost":4,"slots":1,"traits":["Synthwave","Choreographer"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":1300,"ad":60,"as":0.65,"armor":70,"mr":70,"range":1,"mana":[30,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"真理之劍","desc":"治療300/350/2400（受法術強度加成） + 12%最大生命，接著向當前目標釋放衝擊波，對被擊中的敵人造成70/105/3000（受攻擊力加成）物理傷害，並施加10/10/15%虛弱，持續4/4/6秒。\n虛弱：降低造成的傷害。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[300,350,2400],"selfMaxHp":0.12}},{"op":"projectile","to":"current","shape":"wave","pierce":true,"len":2,"width":2,"speed":10,"cosmetic":true},{"op":"damage","type":"physical","value":{"ad":[70,105,3000]},"to":{"cone":"current","r":2}},{"op":"status","to":"prev","kind":"weaken","dur":[4,4,6],"value":[0.1,0.1,0.15]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Graves","zh":"葛雷夫","cost":4,"slots":1,"traits":["BeachPop","Renegade"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":1100,"ad":85,"as":0.6,"armor":60,"mr":60,"range":2,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"自由左手","desc":"接下來2次攻擊獲得125%攻擊速度，向目標滑行，並將攻擊改為5發子彈的錐形射擊，每發造成5/7/35（受法術強度加成） + 40/60/325（受攻擊力加成）物理傷害。擊殺時強化額外一次攻擊。","castTime":0.5,"steps":[{"op":"dash","to":"current","style":"slide","trail":"smoke"},{"op":"empower","attacks":2,"asPct":1.25,"onHit":[{"op":"damage","type":"physical","value":{"ap":[5,7,35],"ad":[40,60,325]},"to":{"cone":"current","r":2},"hits":5,"fx":{"name":"cone","frm":"self","r":2,"skin":"pellets","n":5}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"擊殺時強化額外一次攻擊省略；散彈每顆都打整個錐形。"},"passives":[]},{"key":"Jhin","zh":"燼","cost":4,"slots":1,"traits":["Classical","Encore"],"role":"物理專家","roleClass":"Specialist","dmgType":"physical","stats":{"hp":804,"ad":30,"as":0.84,"armor":44,"mr":44,"range":5,"mana":[4,4],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"弦樂四重奏","desc":"被動：將每1%額外攻擊速度轉換為0.8%攻擊力。\n攻擊會召喚小提琴同步攻擊，造成27/41/124（受攻擊力加成）物理傷害，並使目標著迷4秒。每第4次攻擊會被強化，造成14/21/104（受法術強度加成） + 80/120/744（受攻擊力加成）物理傷害，並重置小提琴。\n從第4次連奏開始，小提琴會留存，燼獲得無限射程，攻擊會貫穿，每命中一個目標傷害降低60%。","castTime":0,"steps":[],"altSteps":null,"altEvery":0,"guess":false,"simplified":"攻速轉攻擊力、第 4 次連奏後的無限射程／貫穿／小提琴留存都省略；第 4 發直接額外加傷。法力用不到（[0,0]）。"},"passives":[{"on":"attack","n":1,"src":"unit","ops":[{"op":"fx","name":"tether","frm":"self","to":"current","skin":"violin","dur":0.12},{"op":"damage","type":"physical","value":{"ad":[27,41,124]},"to":"current"},{"op":"status","to":"current","kind":"charm","dur":4}],"text":"小提琴同步攻擊"},{"on":"attack","n":4,"src":"unit","ops":[{"op":"projectile","to":"current","shape":"bullet","big":true,"speed":22,"onHit":[{"op":"damage","type":"physical","value":{"ap":[14,21,104],"ad":[80,120,744]},"to":"current"},{"op":"fx","name":"burst","at":"current"}]}],"text":"第四發"}]},{"key":"Jinx","zh":"吉茵珂絲","cost":4,"slots":1,"traits":["IonicSpark","Hitmaker"],"role":"物理射手","roleClass":"Marksman","dmgType":"physical","stats":{"hp":850,"ad":55,"as":0.8,"armor":40,"mr":40,"range":4,"mana":[30,90],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"砰砰碰碰","desc":"快速向附近敵人發射16枚飛彈（額外攻擊速度每多0.35，多1枚），每枚造成6/9/30（受法術強度加成） + 43/65/300（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"rocket","count":12,"spread":"distribute","gap":0.07,"arc":true,"speed":12,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[6,9,30],"ad":[43,65,300]}},{"op":"fx","name":"burst","at":"current","small":true}]},{"op":"projectile","to":{"around":"current","r":2,"includeCenter":true},"shape":"rocket","count":2,"spread":"distribute","gap":0.07,"arc":true,"speed":12,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[6,9,30],"ad":[43,65,300]}},{"op":"fx","name":"burst","at":"current","small":true}]},{"op":"projectile","to":{"all":1},"shape":"rocket","count":2,"spread":"distribute","gap":0.07,"arc":true,"speed":12,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[6,9,30],"ad":[43,65,300]}},{"op":"fx","name":"burst","at":"current","small":true}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"飛彈固定 16 枚（額外攻速加飛彈沒做）；分配比例為 75% 打當前目標、15% 打目標 2 格內、10% 打場上其他敵人（原版官方說明沒寫，數字來自遊戲資料）。"},"passives":[]},{"key":"Kayle","zh":"凱爾","cost":4,"slots":1,"traits":["Pentakill","Swiftstriker"],"role":"魔法射手","roleClass":"Marksman","dmgType":"magic","stats":{"hp":850,"ad":10,"as":0.8,"armor":40,"mr":40,"range":4,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"通往地獄的階梯","desc":"被動：攻擊額外造成40/60/500（受法術強度加成）魔法傷害。\n主動：4秒內獲得80%攻擊速度與無限射程，每次攻擊召喚一把劍。之後讓劍雨落向目標，對2格內所有敵人造成180/270/2000（受法術強度加成）傷害，並為每把劍額外對目標造成37/55/400（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"buff","to":"self","stat":"asPct","value":0.8,"dur":4},{"op":"buff","to":"self","stat":"range","value":6,"dur":4},{"op":"fx","name":"aura","at":"self","skin":"swords","dur":4,"stackOnAttack":true},{"op":"delay","sec":4,"ops":[{"op":"fx","name":"rain","at":"current","r":2,"shape":"blade","n":8,"dur":0.5},{"op":"fx","name":"shake","power":2},{"op":"damage","type":"magic","value":{"ap":[180,270,2000]},"to":{"around":"current","r":2,"includeCenter":true}},{"op":"damage","type":"magic","value":{"ap":[37,55,400]},"to":"current","hits":6}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"劍數推測 6 把（原版依 4 秒內攻擊次數）；劍雨傷害原文沒寫類型，當魔法。"},"passives":[{"on":"attack","n":1,"src":"unit","ops":[{"op":"damage","type":"magic","value":{"ap":[40,60,500]},"to":"current"}]}]},{"key":"Leona","zh":"雷歐娜","cost":4,"slots":1,"traits":["KDA","Bodyguard","Manager"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1300,"ad":60,"as":0.65,"armor":60,"mr":60,"range":1,"mana":[60,115],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"協調燈光秀","desc":"獲得600/750/2000（受法術強度加成）護盾，持續4秒。在附近敵人身上召喚7/7/25道光束，每道造成50/75/2000（受法術強度加成）魔法傷害，並降低目標4魔法抗性。","castTime":0.5,"steps":[{"op":"shield","to":"self","value":{"ap":[600,750,2000]},"dur":4},{"op":"repeat","times":[7,7,25],"ops":[{"op":"damage","type":"magic","value":{"ap":[50,75,2000]},"to":{"random":1},"fx":{"name":"rain","shape":"sunbeam","n":1}},{"op":"buff","to":"prev","stat":"mr","value":-4}],"gap":0.08}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"光束隨機打場上敵人（原版為附近 2/2/4 格內）；魔抗降低整場有效。"},"passives":[]},{"key":"Locke","zh":"洛克","cost":4,"slots":1,"traits":["Rock","Swiftstriker"],"role":"魔法刺客","roleClass":"Assassin","dmgType":"magic","stats":{"hp":1050,"ad":10,"as":0.9,"armor":65,"mr":65,"range":1,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"追逐罪孽(靈魂咒釘之歌)","desc":"被動：攻擊額外造成45/68/500（受法術強度加成）魔法傷害。洛克每在敵人身上施加一個標記，其對該敵人造成的所有傷害提高15%。\n主動：向4格內最遠的敵人投出3根靈魂釘，每根造成15/22/400（受法術強度加成）魔法傷害，並標記所有被擊中的敵人。接著傳送到敵人身邊，造成135/205/2000（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"projectile","to":{"farthest":1,"within":4},"shape":"spike","count":3,"spread":"seq","gap":0.08,"pierce":true,"speed":18,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[15,22,400]}},{"op":"status","to":"current","kind":"lockeMark","dur":999}],"onEnd":[{"op":"buff","to":"self","stat":"dmgAmp","value":0.15,"stackKey":"mark","maxStacks":3},{"op":"blink","to":{"farthest":1,"within":4},"place":"adjacent","then":[{"op":"fx","name":"burst","at":"current"},{"op":"damage","type":"magic","value":{"ap":[135,205,2000]},"to":"current"}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"標記改成洛克自己的增傷層（最多 3 層，每次施放 +15%），不是記在敵人身上。"},"passives":[{"on":"attack","n":1,"src":"unit","ops":[{"op":"damage","type":"magic","value":{"ap":[45,68,500]},"to":"current"}]}]},{"key":"Mel","zh":"梅爾","cost":4,"slots":1,"traits":["RAndB","Arcanist"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":850,"ad":30,"as":0.75,"armor":40,"mr":40,"range":4,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"藍調之鏈","desc":"發射30/30/60枚飛彈，分配給最近的3名敵人，每枚造成18/28/200（受法術強度加成）魔法傷害並施加一層藍調。每3層藍調，敵人受到此技能的傷害提高5%。","castTime":0.5,"steps":[{"op":"repeat","times":[10,10,20],"ops":[{"op":"damage","type":"magic","value":{"ap":[18,28,200]},"to":{"nearest":3},"fx":{"name":"proj","shape":"orb","arc":true}}],"gap":0.04}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"30／60 枚飛彈分給最近 3 名＝每名 10／20 枚；藍調層數與 5% 增傷省略。"},"passives":[]},{"key":"Shyvana","zh":"希瓦娜","cost":4,"slots":1,"traits":["IonicSpark","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1300,"ad":55,"as":0.65,"armor":60,"mr":60,"range":1,"mana":[40,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"飛龍之力","desc":"被動：生命低於70%/70%/95%時變身為龍。變身後獲得300/500/3000最大生命、150%/150%/250%攻擊速度，且每第3次攻擊對1格範圍額外造成100/150/3000（受法術強度加成）魔法傷害。\n主動：獲得350/400/1000（受法術強度加成） + 10%最大生命護盾，持續4秒。","castTime":0.5,"steps":[{"op":"fx","name":"flash","at":"self","skin":"shield"},{"op":"shield","to":"self","value":{"ap":[350,400,1000],"selfMaxHp":0.1},"dur":4}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[{"on":"hpBelow","n":[0.7,0.7,0.95],"limit":1,"src":"unit","text":"變身為龍","ops":[{"op":"fx","name":"morph","at":"self","skin":"dragon"},{"op":"buff","to":"self","stat":"hp","value":[300,500,3000]},{"op":"buff","to":"self","stat":"asPct","value":[1.5,1.5,2.5]},{"op":"flag","name":"enraged","on":true}]},{"on":"attack","n":3,"src":"unit","ops":[{"op":"if","cond":{"flag":"enraged"},"then":[{"op":"fx","name":"burst","at":"current","r":1,"skin":"fire"},{"op":"damage","type":"magic","value":{"ap":[100,150,3000]},"to":{"around":"current","r":1,"includeCenter":true}}]}]}]},{"key":"Thresh","zh":"瑟雷西","cost":4,"slots":1,"traits":["Classical","Frontman"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1200,"ad":50,"as":0.6,"armor":60,"mr":60,"range":1,"mana":[40,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"鬼影燈籠(重奏)","desc":"被動：敵人對瑟雷西造成傷害時，若其目前生命低於瑟雷西，會著迷12秒。\n主動：回復350/450/2000（受法術強度加成）生命。接著在3秒內從最多3名附近敵人身上汲取80/100/1200（受法術強度加成）最大生命。\n古典樂成員會使敵人著迷，並對其施加額外效果。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[350,450,2000]}},{"op":"fx","name":"tether","frm":{"nearest":3},"to":"self","skin":"soul","dur":3},{"op":"dot","to":{"nearest":3},"type":"magic","value":{"ap":[80,100,1200]},"dur":3}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"被動的「生命低於瑟雷西」條件與攻擊者選取省略（當前目標著迷 12 秒）；汲取不回血；古典樂額外效果省略。"},"passives":[{"on":"hit","src":"unit","ops":[{"op":"status","to":"current","kind":"charm","dur":12}],"text":"著迷"}]},{"key":"Vayne","zh":"汎","cost":4,"slots":1,"traits":["Rock","Trickshot"],"role":"物理射手","roleClass":"Marksman","dmgType":"physical","stats":{"hp":850,"ad":62,"as":0.8,"armor":40,"mr":40,"range":5,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"最黑暗的時刻","desc":"被動：施放技能或被擊中時會翻滾，並獲得25%續戰力，持續2秒。（冷卻4秒）\n主動：獲得惡魔之力，強化接下來3次攻擊，造成165/250/2000（受攻擊力加成）物理傷害，並額外造成目標1.5%/2.5%/20%最大生命的真實傷害。","castTime":0.5,"steps":[{"op":"fx","name":"aura","at":"self","skin":"demon"},{"op":"empower","attacks":3,"onHit":[{"op":"damage","type":"physical","value":{"ad":[165,250,2000]},"to":"current"},{"op":"damage","type":"true","value":{"tgtMaxHp":[0.015,0.025,0.2]},"to":"current"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"續戰力 25% 做成 2 秒 25% 減傷。"},"passives":[{"on":"hit","src":"unit","ops":[{"op":"pathDash","path":{"kind":"side","dist":1,"keepRange":true},"speed":16,"end":"stay","trail":"roll"},{"op":"buff","to":"self","stat":"dr","value":0.25,"dur":2}],"cooldown":4},{"on":"cast","src":"unit","ops":[{"op":"pathDash","path":{"kind":"side","dist":1,"keepRange":true},"speed":16,"end":"stay","trail":"roll"},{"op":"buff","to":"self","stat":"dr","value":0.25,"dur":2}]}]},{"key":"Wukong","zh":"悟空","cost":4,"slots":1,"traits":["GuFeng"],"role":"物理坦","roleClass":"Tank","dmgType":"physical","stats":{"hp":1350,"ad":60,"as":0.65,"armor":65,"mr":65,"range":1,"mana":[40,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"眾多神話詭計者的詭計","desc":"治療400/500/2000（受法術強度加成） + 8%最大生命，並向2格圓形範圍送出6個分身，分身會快速返回。分身從穿過的敵人身上偷取5點護甲與魔法抗性，並造成30/45/3000（受攻擊力加成）物理傷害。返回時，悟空獲得被偷取的防禦。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[400,500,2000],"selfMaxHp":0.08}},{"op":"projectile","pattern":"radial","count":6,"range":2,"shape":"clone","pierce":true,"returns":true,"speed":12,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ad":[30,45,3000]}},{"op":"buff","to":"current","stat":"armor","value":-5},{"op":"buff","to":"current","stat":"mr","value":-5},{"op":"buff","to":"self","stat":"armor","value":5,"applyOn":"return"},{"op":"buff","to":"self","stat":"mr","value":5,"applyOn":"return"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"偷護甲魔抗：每名被分身穿過的敵人 −5，分身飛回來時悟空 +5（固定值，不是「偷多少拿多少」）。"},"passives":[]},{"key":"Xayah","zh":"剎雅","cost":4,"slots":1,"traits":["GuFeng","Hitmaker"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":850,"ad":55,"as":0.75,"armor":40,"mr":40,"range":4,"mana":[0,60],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"羽毛如風中落葉般飛舞","desc":"召喚30/30/60根羽毛擊中目標，每根造成3/5/16（受法術強度加成） + 22/33/150（受攻擊力加成）物理傷害，並降低1點護甲。","castTime":0.5,"steps":[{"op":"repeat","times":[30,30,60],"ops":[{"op":"damage","type":"physical","value":{"ap":[3,5,16],"ad":[22,33,150]},"to":"current","fx":{"name":"proj","shape":"feather"}},{"op":"buff","to":"prev","stat":"armor","value":-1,"stackKey":"feather","maxStacks":60}],"gap":0.03}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Yasuo","zh":"犽宿","cost":4,"slots":1,"traits":["TrueDamage","Slayer"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":1100,"ad":60,"as":0.85,"armor":65,"mr":65,"range":1,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"奪命氣息","desc":"滑行並向前突刺，對直線上的敵人造成165/250/1400（受攻擊力加成）物理傷害。\n每第3次施放會擊飛目標並造成400/600/2500（受攻擊力加成）物理傷害。接著將其摔向地面，對1/1/2格內的敵人造成30/45/200（受法術強度加成） + 180/270/1500（受攻擊力加成）物理傷害。","castTime":0.5,"steps":[{"op":"pathDash","path":{"kind":"through","to":"current","len":2},"speed":16,"end":"stay","trail":"wind","onHit":[{"op":"damage","to":"current","type":"physical","value":{"ad":[165,250,1400]}},{"op":"fx","name":"slash","at":"current"}],"then":[{"op":"if","cond":{"castN":3},"then":[{"op":"displace","to":"current","kind":"knockup","dur":1,"high":true},{"op":"damage","type":"physical","value":{"ad":[400,600,2500]},"to":"current"},{"op":"fx","name":"afterimage","at":"current","skin":"airslash"},{"op":"delay","sec":1,"ops":[{"op":"fx","name":"shockwave","at":"current","r":[1,1,2]},{"op":"fx","name":"shake","power":2},{"op":"damage","to":{"around":"current","r":[1,1,2],"includeCenter":true},"type":"physical","value":{"ap":[30,45,200],"ad":[180,270,1500]}}]}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Yone","zh":"犽凝","cost":4,"slots":1,"traits":["Heartsteel","Slayer"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":1150,"ad":55,"as":0.85,"armor":70,"mr":70,"range":1,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"雙重面貌","desc":"被動：此技能會依攻擊力或法術強度（取較高者）成長。攻擊造成55/82/123（受攻擊力加成）物理傷害。\n主動：快速攻擊目標與最多2名附近敵人，共10/10/30次，每次造成35/55/400（受攻擊力加成）物理傷害。攻擊結束後揮出巨大斬擊，對目標造成175/265/1500（受攻擊力加成）物理傷害。\n心鋼之聲強化：再施放2次斬擊，並無視25%護甲。","castTime":0.5,"steps":[{"op":"fx","name":"afterimage","at":"self","skin":"spirit"},{"op":"repeat","times":[5,5,15],"gap":0.08,"ops":[{"op":"damage","type":"physical","value":{"ad":[35,55,400]},"to":"current","fx":{"name":"slash","skin":"twin"}}]},{"op":"mana","to":{"around":"current","r":[2,2,4],"includeCenter":false,"max":2},"value":0},{"op":"if","cond":{"prevCountMax":0},"then":[{"op":"repeat","times":[5,5,15],"gap":0.08,"ops":[{"op":"damage","type":"physical","value":{"ad":[35,55,400]},"to":"current","fx":{"name":"slash","skin":"twin"}}]}],"else":[{"op":"repeat","times":[3,3,8],"gap":0.08,"ops":[{"op":"damage","type":"physical","value":{"ad":[35,55,400]},"to":{"around":"current","r":[2,2,4],"includeCenter":false,"max":2},"fx":{"name":"slash","skin":"twin"}}]}]},{"op":"delay","sec":[0.45,0.45,1.2],"lock":true,"ops":[{"op":"if","cond":{"favorite":true},"then":[{"op":"repeat","times":2,"gap":0.12,"ops":[{"op":"damage","type":"physical","value":{"ad":[175,265,1500]},"to":"current","pen":0.25}]}]},{"op":"damage","type":"physical","value":{"ad":[175,265,1500]},"to":"current","fx":{"name":"slash","big":true,"shake":2}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"10/10/30 次快攻一半打目標、另一半分給目標 2/2/4 格內最多 2 名敵人（兩名都在時每名 3/3/8 次，合計略多 1 次；只剩目標時全打目標）；心鋼強化「再 2 次斬擊」做成多揮 2 次巨大斬擊並無視 25% 護甲；依攻擊力／法術強度取較高者省略。"},"passives":[{"on":"attack","n":1,"src":"unit","ops":[{"op":"damage","type":"physical","value":{"ad":[55,82,123]},"to":"current"}]}]},{"key":"Yorick","zh":"約瑞科","cost":4,"slots":1,"traits":["Pentakill","Juggernaut"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1300,"ad":65,"as":0.6,"armor":60,"mr":60,"range":1,"mana":[50,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"死亡之舞","desc":"演奏一段史詩獨奏，回復440/525/2000（受法術強度加成） + 8%最大生命，並創造一個2格範圍的區域，每秒對區域內敵人造成25/40/1250（受法術強度加成）魔法傷害。最後一個音符對區域內敵人造成100/150/2400（受法術強度加成）魔法傷害，並施加20%緩速，持續4秒。\n緩速：降低攻擊速度。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"ap":[440,525,2000],"selfMaxHp":0.08}},{"op":"zone","at":"current","r":2,"dur":3,"tick":1,"enemy":[{"op":"damage","type":"magic","value":{"ap":[25,40,1250]}}],"skin":"stage","onEnd":[{"op":"fx","name":"shockwave","at":"current","r":2},{"op":"fx","name":"shake","power":2},{"op":"damage","to":{"around":"current","r":2},"type":"magic","value":{"ap":[100,150,2400]}},{"op":"status","to":"prev","kind":"chill","dur":4,"value":0.2}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"區域持續時間原文沒寫，推測 3 秒；區域維持在目標身上。"},"passives":[]},{"key":"Yuumi","zh":"悠咪","cost":4,"slots":1,"traits":["ILLBEATS","Encore","Collab"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":850,"ad":30,"as":0.8,"armor":40,"mr":40,"range":4,"mana":[0,20],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"女孩，埋頭聽歌吧","desc":"丟出旋轉唱片，造成185/280/1400（受法術強度加成）魔法傷害，並疊在目標頭上，每秒降低其1點魔法抗性。\n疊到4張唱片時，唱片堆崩塌，對目標造成累積唱片總傷害的40%，並將另外40%分給4名附近敵人。\n若帶著唱片的敵人死亡，唱片會轉移到另一名敵人身上。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"disc","spin":true,"speed":12,"onHit":[{"op":"damage","type":"magic","value":{"ap":[185,280,1400]},"to":"current"},{"op":"repeat","times":8,"gap":1,"ops":[{"op":"buff","to":"current","stat":"mr","value":-1}]},{"op":"fx","name":"aura","at":"current","skin":"recordstack","dur":8},{"op":"delay","sec":0.4,"ops":[{"op":"fx","name":"burst","at":"current","r":2},{"op":"damage","type":"magic","value":{"dealt":0.4},"to":"current"},{"op":"damage","type":"magic","value":{"dealt":1},"to":{"around":"current","r":2,"includeCenter":false},"split":true}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"唱片堆疊改成單張：崩塌立刻發生（目標 40%、附近平分 40%）；魔抗每秒 -1 做成 8 秒內每秒 -1；唱片轉移省略。"},"passives":[]},{"key":"Zac","zh":"札克","cost":4,"slots":1,"traits":["BeachPop","Juggernaut"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1300,"ad":65,"as":0.6,"armor":60,"mr":60,"range":1,"mana":[60,110],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"天降鐵球","desc":"蓄力2/2/1秒，獲得15%/15%/50%續戰力，並治療475/525/2500（受法術強度加成） + 12%最大生命。接著跳起並落在目標身上，對1/1/2格內的敵人造成250/375/3500（受法術強度加成）魔法傷害並短暫擊飛。","castTime":1.5,"steps":[{"op":"buff","to":"self","stat":"dr","value":[0.15,0.15,0.5],"dur":2},{"op":"heal","to":"self","value":{"ap":[475,525,2500],"selfMaxHp":0.12}},{"op":"leap","to":"current","air":0.45,"land":"adjacent","onLand":[{"op":"fx","name":"shockwave","at":"self","r":1},{"op":"fx","name":"shake","power":2},{"op":"damage","to":{"around":"self","r":[1,1,2]},"type":"magic","value":{"ap":[250,375,3500]}},{"op":"displace","to":"prev","kind":"knockup","dur":[0.5,0.5,4]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"蓄力 2 秒（3★ 1 秒）簡化成施放時間 1.5 秒；續戰力做成 2 秒減傷。"},"passives":[]},{"key":"AkaliKDA","zh":"阿卡莉（K/DA）","cost":5,"slots":1,"traits":["KDA"],"role":"物理刺客","roleClass":"Assassin","dmgType":"physical","stats":{"hp":1200,"ad":60,"as":0.85,"armor":60,"mr":60,"range":1,"mana":[0,45],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"滑板少女","desc":"沿著最長的未上色敵人隊列滑行，對被擊中的敵人造成10/15/999（受法術強度加成） + 70/105/5000（受攻擊力加成）物理傷害，並為他們與路徑上的格子上色。被上色的敵人或位於上色格子上的敵人有10%易傷。\n每第3次施放會點燃顏料，對所有被上色或站在上色格子上的敵人造成32.5/48.75/3246.75（受法術強度加成） + 227.5/341.25/16250（受攻擊力加成）物理傷害。\n易傷：提高受到的傷害。","castTime":0.6,"steps":[{"op":"pathDash","path":{"kind":"longestRow","noStatus":"paint"},"speed":13,"end":"stay","trail":"spray","paint":{"skin":"paint","dur":null,"enemy":[{"op":"status","kind":"vulnerable","dur":1,"value":0.1}],"tick":0.5,"tag":"paint"},"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[10,15,999],"ad":[70,105,5000]}},{"op":"status","to":"current","kind":"paint","dur":999},{"op":"status","to":"current","kind":"vulnerable","dur":6,"value":0.1},{"op":"fx","name":"burst","at":"current","skin":"paint"}],"then":[{"op":"if","cond":{"castN":3},"then":[{"op":"fx","name":"ground","at":{"marked":"paint"},"skin":"ignite","dur":0.5},{"op":"fx","name":"shake","power":2},{"op":"damage","to":{"marked":"paint"},"type":"physical","value":{"ap":[32.5,48.75,3246.75],"ad":[227.5,341.25,16250]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"被上色（或站在上色格）的敵人才吃點燃；上色格整場保留，易傷沿用現有 6 秒。"},"passives":[]},{"key":"AkaliTrueDamage","zh":"阿卡莉（True Damage）","cost":5,"slots":1,"traits":["TrueDamage","Freestyle"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":1200,"ad":50,"as":0.9,"armor":65,"mr":65,"range":1,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"像骨牌連環倒","desc":"B面被動：每參與擊殺4次，獲得1/1/10點玩家生命。\n主動：快速斬擊當前目標，造成550/825/9999（受法術強度加成）魔法傷害，對坦克提高50%。施放期間獲得25%續戰力，且無法被選取為普攻目標。\n接著傳送到目標上方並投下炸彈，對2/2/8格內所有敵人分攤造成620/930/9999（受法術強度加成）魔法傷害。","castTime":0.5,"steps":[{"op":"status","to":"self","kind":"untargetable","dur":0.8},{"op":"buff","to":"self","stat":"dr","value":0.25,"dur":0.8},{"op":"fx","name":"slash","at":"current","n":3,"skin":"neon"},{"op":"damage","to":"current","type":"magic","value":{"ap":[550,825,9999]},"bonusVsTank":0.5},{"op":"delay","sec":0.35,"ops":[{"op":"blink","to":"current","place":"adjacent","then":[{"op":"projectile","to":"current","shape":"bomb","arc":true,"speed":9,"onHit":[{"op":"fx","name":"burst","at":"current","r":[2,2,8]},{"op":"fx","name":"shockwave","at":"current","r":[2,2,8]},{"op":"fx","name":"shake","power":2},{"op":"damage","to":{"around":"current","r":[2,2,8],"includeCenter":true},"type":"magic","value":{"ap":[620,930,9999]},"split":true}]}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"B 面被動（擊殺回玩家生命）沒重製；續戰力以 0.8 秒的 25% 減傷代替。"},"passives":[]},{"key":"Aphelios","zh":"亞菲利歐","cost":5,"slots":1,"traits":["Heartsteel"],"role":"物理射手","roleClass":"Marksman","dmgType":"physical","stats":{"hp":900,"ad":60,"as":0.8,"armor":45,"mr":45,"range":5,"mana":[40,180],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"全火力金曲","desc":"被動：每攻擊4次獲得一個環型飛刃，最多15個。攻擊時，每個已裝備的環型飛刃額外造成7/10/200（受攻擊力加成）物理傷害。集滿15個後，獲得30%/30%/500%攻擊力與無限射程。\n主動：向最近的3名敵人發射魔彈，造成60/90/300（受法術強度加成） + 280/420/3000（受攻擊力加成）物理傷害，接著分裂成16發魔彈，對沿途穿透的敵人造成9/13.5/300（受法術強度加成） + 42/63/3000（受攻擊力加成）物理傷害。獲得75%攻擊速度，持續4秒。\n心鋼之聲強化：戰鬥開始時裝備5個環型飛刃。","castTime":0.6,"steps":[{"op":"projectile","to":{"nearest":3},"shape":"moon","speed":13,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[60,90,300],"ad":[280,420,3000]}},{"op":"fx","name":"burst","at":"current","skin":"shards","n":16}],"onEnd":[{"op":"damage","to":{"nearest":3},"type":"physical","value":{"ap":[9,13.5,300],"ad":[42,63,3000]},"hits":5}]},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":4}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"環型飛刃的額外傷害改成每個提高 7%/10%/200% 攻擊力（技能傷害也會一起放大）；集滿15個的加成與無限射程省略；16 發分裂彈改成對最近 3 名各打 5 次（共15發）。"},"passives":[{"on":"attack","n":4,"src":"unit","ops":[{"op":"buff","to":"self","stat":"adPct","value":[0.07,0.1,2.0],"stackKey":"chakram","maxStacks":15}],"text":"環型飛刃 +1"},{"on":"start","src":"unit","ops":[{"op":"if","cond":{"favorite":true},"then":[{"op":"buff","to":"self","stat":"adPct","value":[0.35,0.5,10.0],"stackKey":"chakram","maxStacks":15}]}],"text":"心鋼：開場5個環型飛刃"}]},{"key":"DrMundo","zh":"蒙多醫生","cost":5,"slots":1,"traits":["RecordMogul","Manager"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1300,"ad":80,"as":0.6,"armor":60,"mr":60,"range":1,"mana":[20,80],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"大筆生意","desc":"被動：蒙多醫生擁有3000以上最大生命時進入嗨翻全場狀態，最大生命變為1.2/1.2/4倍，且攻擊額外造成50/75/1000 + 3%/3%/100%最大生命的魔法傷害。\n主動：在5/5/3.5秒內回復350/400/3000 + 10%/10%/100%最大生命（其中30%立即回復，其餘70%於持續時間內回復），並每秒對2/2/5格內所有敵人造成12/16/50（受法術強度加成） + 1%/1%/4%最大生命的魔法傷害。","castTime":0.5,"steps":[{"op":"heal","to":"self","value":{"flat":[105,120,900],"selfMaxHp":[0.03,0.03,0.3]}},{"op":"repeat","times":[5,5,4],"gap":1,"ops":[{"op":"heal","to":"self","value":{"flat":[49,56,525],"selfMaxHp":[0.014,0.014,0.175]}}]},{"op":"zone","to":"self","at":"self","r":[2,2,5],"dur":[5,5,3.5],"tick":1,"enemy":[{"op":"damage","type":"magic","value":{"ap":[12,16,50],"selfMaxHp":[0.01,0.01,0.04]}}],"follow":true,"skin":"toxic"}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"最大生命3000以上的嗨翻全場狀態省略；治療分段：立即30%，其餘70%分 5 次（3★ 4 次）每秒回復。"},"passives":[]},{"key":"Gwen","zh":"關","cost":5,"slots":1,"traits":["IonicSpark","MelodicHeart"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":1200,"ad":10,"as":0.8,"armor":60,"mr":60,"range":2,"mana":[0,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"夜半微光","desc":"被動：攻擊額外對目標造成60/90/1000（受法術強度加成）魔法傷害，對扇形範圍內的其他敵人造成22/35/500（受法術強度加成）魔法傷害。並滑向新目標。\n主動：在戰場上召喚巨大剪刀。短暫延遲後，在目標上方橫向剪出一條線，對所有被擊中的敵人造成90/135/4000（受法術強度加成）魔法傷害，另外再分攤830/1300/8000（受法術強度加成）魔法傷害。若只命中1名以下的敵人，回復50/50/200點魔力。","castTime":0.7,"steps":[{"op":"damage","to":{"row":"current"},"type":"magic","value":{"ap":[90,135,4000]}},{"op":"fx","name":"slash","shape":"row","at":"current","skin":"scissors","dur":0.3},{"op":"fx","name":"shake","power":2},{"op":"damage","to":"prev","type":"magic","value":{"ap":[830,1300,8000]},"split":true},{"op":"if","cond":{"prevCountMax":1},"then":[{"op":"mana","to":"self","value":[50,50,200]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[{"on":"attack","src":"unit","ops":[{"op":"damage","to":"current","type":"magic","value":{"ap":[60,90,1000]}},{"op":"damage","to":{"cone":"current","r":1,"exclude":"current"},"type":"magic","value":{"ap":[22,35,500]},"fx":{"name":"cone","frm":"self","r":1,"skin":"snip"}}],"text":"攻擊附加魔傷"},{"on":"kill","src":"unit","ops":[{"op":"dash","to":{"nearest":1},"style":"slide","trail":"thread"}],"text":"滑向新目標"}]},{"key":"Janna","zh":"珍娜","cost":5,"slots":1,"traits":["GuFeng","Windblessed","Prodigy"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":900,"ad":35,"as":0.85,"armor":45,"mr":45,"range":4,"mana":[0,45],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"天界疾風讚歌","desc":"向最多3名鄰近敵人釋放天界龍族，各造成155/250/9999（受法術強度加成）魔法傷害。\n在4/4/1次施放後，戰場會被「天界疾風」籠罩，在45秒內對每名敵人造成1800/2700/9000（受法術強度加成）魔法傷害。","castTime":0.6,"steps":[{"op":"projectile","to":{"nearest":3},"shape":"dragon","speed":10,"trailFx":"wind","onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[155,250,9999]}},{"op":"fx","name":"burst","at":"current"}]},{"op":"if","cond":{"castN":[4,4,1]},"then":[{"op":"if","cond":{"flag":"storm"},"then":[],"else":[{"op":"fx","name":"sweep","skin":"hurricane","dur":4.5},{"op":"fx","name":"shake","power":1},{"op":"dot","to":"allEnemies","type":"magic","value":{"ap":[1800,2700,9000]},"dur":45,"tick":0.5},{"op":"flag","name":"storm","on":true}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"天界疾風整場只觸發一次（第4次施放後，3★ 為第1次）；傷害平均分在45秒內，戰鬥通常打不到那麼久。"},"passives":[]},{"key":"LeeSin","zh":"李星","cost":5,"slots":1,"traits":["GuFeng"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":1200,"ad":60,"as":0.85,"armor":70,"mr":70,"range":1,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"驚豔天界的星界連段","desc":"釋放一套共2/2/99招的毀滅性連擊，從神龍猛擊開始依序施展招式。之後的施放會延長連擊。\n神龍猛擊：對目標造成15/20/660（受法術強度加成） + 175/280/9900（受攻擊力加成）物理傷害。2格內的其他敵人受到40%傷害。\n狂風旋擊：對目標造成20.25/27/891（受法術強度加成） + 236.25/378/13365（受攻擊力加成）物理傷害，並將其擊飛1/1/10秒。1格內的其他敵人受到50%傷害。\n星界重拳：對目標造成37.5/50/1650（受法術強度加成） + 437.5/700/24750（受攻擊力加成）物理傷害並標記目標。若目標已被標記，這一拳會擊中其核心，額外造成400%真實傷害。","castTime":1.0,"steps":[{"op":"fx","name":"slash","at":"current","skin":"dragon"},{"op":"fx","name":"shockwave","at":"current","r":2},{"op":"damage","to":"current","type":"physical","value":{"ap":[15,20,660],"ad":[175,280,9900]}},{"op":"damage","to":{"around":"current","r":2,"includeCenter":false},"type":"physical","value":{"ap":[6,8,264],"ad":[70,112,3960]}},{"op":"delay","sec":0.4,"lock":true,"ops":[{"op":"fx","name":"spin","at":"self","r":1,"dur":0.25},{"op":"damage","to":"current","type":"physical","value":{"ap":[20.25,27,891],"ad":[236.25,378,13365]}},{"op":"displace","to":"current","kind":"knockup","dur":[1,1,10],"high":true},{"op":"damage","to":{"around":"current","r":1,"includeCenter":false},"type":"physical","value":{"ap":[10.125,13.5,445.5],"ad":[118.125,189,6682.5]}}]},{"op":"if","cond":{"flag":"leeCombo"},"then":[{"op":"delay","sec":0.9,"lock":true,"ops":[{"op":"leap","to":"current","air":0.2,"land":"adjacent","onLand":[{"op":"fx","name":"burst","at":"current","big":true},{"op":"fx","name":"shake","power":3},{"op":"damage","to":"current","type":"physical","value":{"ap":[37.5,50,1650],"ad":[437.5,700,24750]}},{"op":"if","cond":{"tgtStatus":"leeMark"},"then":[{"op":"damage","to":"current","type":"true","value":{"dealt":4}}],"else":[{"op":"status","to":"current","kind":"leeMark","dur":999}]}]}]}]},{"op":"flag","name":"leeCombo","on":true}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"連擊長度：第一次施放只打前2招（神龍猛擊、狂風旋擊），之後每次施放固定3招（不再繼續往後延長）；3★ 的 99 招不模擬。"},"passives":[]},{"key":"MissFortune","zh":"好運姐","cost":5,"slots":1,"traits":["8Bit","Hitmaker"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":900,"ad":80,"as":0.8,"armor":45,"mr":45,"range":4,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"彈珠台巫師","desc":"向目標發射一顆彈珠，造成15/25/908（受法術強度加成） + 140/210/1337（受攻擊力加成）物理傷害。命中敵人後，彈珠會持續彈跳，直到對敵人造成12次傷害，傷害逐次降低30%。（最低傷害：20%）","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"pinball","speed":15,"bounce":{"n":11,"pick":"nearestUnhit","falloff":0.3,"minPct":0.2},"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[15,25,908],"ad":[140,210,1337]}},{"op":"fx","name":"flash","at":"current","skin":"pixel"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"彈珠不會重複擊中同一名敵人，場上敵人不足12名時會提早結束。"},"passives":[]},{"key":"Mordekaiser","zh":"魔鬥凱薩","cost":5,"slots":1,"traits":["Pentakill"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":1200,"ad":75,"as":0.5,"armor":65,"mr":65,"range":1,"mana":[0,60],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"末日之手","desc":"短暫獲得40%續戰力。召喚一隻巨爪，對一條寬大的直線造成100/150/800（受法術強度加成）魔法傷害。最近的4名敵人額外受到25%傷害，並被拉向魔鬥凱薩。\n本場戰鬥剩餘時間，獲得20%全能吸血與1格射程，並將攻擊改為一記重擊，對目標造成300/480/3000（受法術強度加成）魔法傷害，對2格內其他敵人造成70/105/1500（受法術強度加成）傷害。","castTime":0.6,"steps":[{"op":"buff","to":"self","stat":"dr","value":0.4,"dur":1.2},{"op":"fx","name":"ground","shape":"line","frm":"self","to":"current","len":"board","width":2,"skin":"claw","dur":0.5},{"op":"fx","name":"shake","power":2},{"op":"damage","to":{"line":"current","len":"board","width":2},"type":"magic","value":{"ap":[100,150,800]}},{"op":"damage","to":{"nearest":4},"type":"magic","value":{"ap":[25,37.5,200]}},{"op":"displace","to":{"nearest":4},"kind":"pull","toward":"self","dur":0.5},{"op":"if","cond":{"flag":"smash"},"then":[],"else":[{"op":"buff","to":"self","stat":"omnivamp","value":0.2},{"op":"buff","to":"self","stat":"range","value":1},{"op":"empower","dur":999,"replace":true,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[300,480,3000]}},{"op":"damage","to":{"around":"current","r":2,"includeCenter":false},"type":"magic","value":{"ap":[70,105,1500]}}]},{"op":"flag","name":"smash","on":true}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"拉扯時的控制時間用官方的 0.5 秒；40% 續戰力持續 1.2 秒為推測；重擊普攻在第一次施放後啟用。"},"passives":[]},{"key":"Nidalee","zh":"奈德麗","cost":5,"slots":1,"traits":["Mariachi","Choreographer"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":1200,"ad":50,"as":0.8,"armor":65,"mr":65,"range":6,"mana":[20,45],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"撲擊派對/生命之舞","desc":"撲擊派對：朝敵人猛撲4/4/99次，造成125/185/1500（受法術強度加成）魔法傷害，每次撲擊傷害提高40%。\n生命之舞：回復325/500/2000（受法術強度加成）生命。朝目標投擲標槍，造成360/540/3000（受法術強度加成）魔法傷害，並在目標周圍撒落3朵花。片刻後，花朵對1格範圍內的敵人造成80/120/500（受法術強度加成）魔法傷害。\n處於美洲獅形態時施放撲擊派對，處於人類形態時施放生命之舞。","castTime":0.5,"steps":[{"op":"if","cond":{"selfHpAbove":0.75},"then":[{"op":"flag","name":"cougar","on":true}]},{"op":"if","cond":{"selfHpBelow":0.5},"then":[{"op":"flag","name":"cougar","on":false}]},{"op":"if","cond":{"flag":"cougar"},"then":[{"op":"repeat","times":[4,4,99],"gap":0.3,"lock":true,"ops":[{"op":"leap","to":{"chain":true,"within":3},"air":0.2,"land":"adjacent","onLand":[{"op":"damage","to":"current","type":"magic","value":{"ap":[125,185,1500]},"ramp":0.4},{"op":"fx","name":"burst","at":"current"}]}]}],"else":[{"op":"heal","to":"self","value":{"ap":[325,500,2000]}},{"op":"projectile","to":"current","shape":"spear","speed":17,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[360,540,3000]}},{"op":"fx","name":"telegraph","at":"current","r":1,"skin":"flowers","n":3,"dur":0.5},{"op":"delay","sec":0.5,"ops":[{"op":"fx","name":"burst","at":"current","r":1,"skin":"petal"},{"op":"damage","to":{"around":"current","r":1,"includeCenter":true},"type":"magic","value":{"ap":[80,120,500]},"hits":3}]}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"形態切換：生命高於75%變美洲獅、低於50%變人類（門檻出自官方資料，切換方式為推測）；美洲獅形態法力需求降低15省略。"},"passives":[]},{"key":"NunuWillump","zh":"努努和威朗普","cost":5,"slots":1,"traits":["Disco","Frontman"],"role":"魔法專家","roleClass":"Specialist","dmgType":"magic","stats":{"hp":1200,"ad":15,"as":0.5,"armor":60,"mr":60,"range":1,"mana":[20,75],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"迪斯可時間到了！","desc":"被動：獲得10/10/40點魔力回復。緩慢滾動一顆迪斯可球，對穿過的所有敵人造成120/180/1500（受法術強度加成）魔法傷害（同一名敵人每秒最多一次）。\n主動：本場戰鬥剩餘時間移動速度提升（75/75/150），並使迪斯可球的大小與傷害提高30%/30%/200%。","castTime":0.5,"steps":[{"op":"buff","to":"self","stat":"abilityAmp","value":[0.3,0.3,2.0]},{"op":"rollerMod","id":"disco","speedMul":1.5,"sizeMul":[1.3,1.3,3.0]},{"op":"fx","name":"burst","at":"self","skin":"sparkle"}],"altSteps":null,"altEvery":0,"guess":true,"simplified":"迪斯可球傷害用官方 120/180/1500、同一名敵人每秒最多被壓一次；「移動速度提升」官方給 75/75/150，換算成球速 ×1.5 為推測；努努跟在球後面推著走，不普攻。"},"passives":[{"on":"start","src":"unit","ops":[{"op":"roller","id":"disco","skin":"discoball","hitR":0.6,"speed":1.0,"path":"seek","rehit":1,"owner":"push","onPass":[{"op":"damage","to":"current","type":"magic","value":{"ap":[120,180,1500]}},{"op":"fx","name":"flash","at":"current","skin":"sparkle"}]}],"text":"迪斯可球登場"},{"on":"start","src":"unit","ops":[{"op":"buff","to":"self","stat":"manaRegen","value":[10,10,40]}],"text":"迪斯可：法力回復加快"}]},{"key":"Pyke","zh":"派克","cost":5,"slots":1,"traits":["Rock","Renegade"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":1200,"ad":70,"as":0.9,"armor":65,"mr":65,"range":1,"mana":[0,30],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"處決開始，看好囉","desc":"被動：敵人生命低於最大生命的8% + 2%/2%/85%（受法術強度加成）時，立即對其施放技能，然後衝刺回到目前目標。\n主動：對目標造成320/515/4000（受攻擊力加成）物理傷害，並以X字形對所有其他敵人造成130/215/800（受攻擊力加成）傷害。處決生命低於8% + 2%/2%/85%（受法術強度加成）的敵人。","castTime":0.4,"steps":[{"op":"blink","to":"current","place":"behind","then":[{"op":"fx","name":"slash","at":"current","skin":"x","big":true},{"op":"damage","to":"current","type":"physical","value":{"ad":[320,515,4000]}},{"op":"fx","name":"sweep","skin":"xslash","dur":0.3},{"op":"damage","to":{"all":"enemy","exclude":"current"},"type":"physical","value":{"ad":[130,215,800]}},{"op":"execute","to":"current","below":{"flat":0.08,"ap":[0.02,0.02,0.85]}}],"remember":true}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"被動「低血敵人立即補放技能」門檻固定為 10%（1★/2★ 在基礎法術強度下的值，不隨星數與法術強度變化），補放後瞬移回原位。"},"passives":[{"on":"enemyHpBelow","n":0.1,"src":"unit","text":"補刀處決","ops":[{"op":"blink","to":"current","place":"behind","then":[{"op":"fx","name":"slash","at":"current","skin":"x","big":true},{"op":"damage","to":"current","type":"physical","value":{"ad":[320,515,4000]}},{"op":"fx","name":"sweep","skin":"xslash","dur":0.3},{"op":"damage","to":{"all":"enemy","exclude":"current"},"type":"physical","value":{"ad":[130,215,800]}},{"op":"execute","to":"current","below":{"flat":0.08,"ap":[0.02,0.02,0.85]}},{"op":"blink","place":"origin"}],"remember":true}]}]},{"key":"Rell","zh":"銳兒","cost":5,"slots":1,"traits":["RAndB","BeatMaster"],"role":"魔法坦","roleClass":"Tank","dmgType":"magic","stats":{"hp":1300,"ad":50,"as":0.7,"armor":65,"mr":65,"range":1,"mana":[30,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"節奏轟炸槍手/金屬小馬俱樂部","desc":"節奏轟炸槍手：獲得600/725/2000（受法術強度加成）護盾，持續4秒，並召喚3支喇叭。每秒發出音波，對被擊中的敵人造成0.8/1.2/15 × 護甲 + 0.8/1.2/15 × 魔法抗性的魔法傷害。\n金屬小馬俱樂部：撲向一群敵人，對中心的敵人造成0.96/1.44/300 × 護甲 + 0.96/1.44/300 × 魔法抗性的魔法傷害，並對2格內的敵人分攤造成1.44/2.16/300 × 護甲 + 1.44/2.16/300 × 魔法抗性的傷害。\n未騎乘時施放節奏轟炸槍手，騎乘時施放金屬小馬俱樂部。","castTime":0.5,"steps":[{"op":"if","cond":{"flag":"riding"},"then":[{"op":"leap","to":{"cluster":{"r":2}},"air":0.4,"land":"adjacent","onLand":[{"op":"fx","name":"shockwave","at":"current","r":2},{"op":"fx","name":"shake","power":3},{"op":"damage","to":"current","type":"magic","value":{"resist":[0.96,1.44,300]}},{"op":"damage","to":{"around":"current","r":2,"includeCenter":true},"type":"magic","value":{"resist":[1.44,2.16,300]},"split":true}]}],"else":[{"op":"shield","to":"self","value":{"ap":[600,725,2000]},"dur":4},{"op":"zone","to":"self","at":"self","r":2,"dur":4,"tick":1,"enemy":[{"op":"damage","type":"magic","value":{"resist":[0.8,1.2,15]}},{"op":"fx","name":"shockwave","at":"self","r":2,"thin":true}],"follow":true,"skin":"speakers"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"要先靠節奏大師羈絆在半血時上馬，才會換成衝撞招式。"},"passives":[]},{"key":"Taliyah","zh":"塔莉雅","cost":5,"slots":1,"traits":["BeachPop","Encore"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":950,"ad":30,"as":0.8,"armor":50,"mr":50,"range":4,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"衝浪人潮","desc":"向目標投擲3塊飛岩，每塊造成200/300/2000（受法術強度加成）魔法傷害。\n每第3/3/1次施放，改為迅速位移並沿直線滑行。遭命中的敵人受到160/240/2000（受法術強度加成） + 2%/3%/50%（受法術強度加成）最大生命的魔法傷害，並被短暫擊飛。","castTime":0.6,"steps":[{"op":"if","cond":{"castN":[3,3,1]},"then":[{"op":"delay","sec":0.45,"ops":[{"op":"blink","place":{"bestLine":{"len":"board"}},"then":[{"op":"pathDash","path":{"kind":"bestLine","len":"board"},"speed":12,"end":"stay","trail":"wave","onHit":[{"op":"damage","to":{"line":"current","len":"board"},"type":"magic","value":{"ap":[160,240,2000],"tgtMaxHp":{"ap":[0.02,0.03,0.5]}}},{"op":"displace","to":"current","kind":"knockup","dur":[0.5,0.5,10]}]}]}]}],"else":[{"op":"projectile","to":"current","shape":"rock","count":3,"spread":"seq","gap":0.12,"speed":14,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[200,300,2000]}},{"op":"fx","name":"burst","at":"current","small":true}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":""},"passives":[]},{"key":"Teemo","zh":"提摩","cost":5,"slots":1,"traits":["Hyperpop","HypeMan"],"role":"魔法施法者","roleClass":"Caster","dmgType":"magic","stats":{"hp":900,"ad":55,"as":0.8,"armor":45,"mr":45,"range":4,"mana":[0,100],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"人氣爆紅","desc":"被動：攻擊會施加病毒，在15秒內造成90/135/1337（受法術強度加成）魔法傷害。被感染的敵人死亡後會變成殭屍，尋找未感染的敵人並自爆，對相鄰敵人造成70/105/800（受法術強度加成）傷害並施加病毒。\n主動：投出一顆蘑菇，對3格範圍內的敵人施加病毒，並造成530/800/13337（受法術強度加成）魔法傷害，距離中心每遠1格，傷害降低20%。","castTime":0.5,"steps":[{"op":"projectile","to":"current","shape":"mushroom","arc":true,"speed":8,"onHit":[{"op":"fx","name":"burst","at":"current","r":3,"skin":"spore"},{"op":"fx","name":"ground","at":"current","r":3,"skin":"spore","dur":1.2},{"op":"damage","to":{"around":"current","r":3,"includeCenter":true},"type":"magic","value":{"ap":[530,800,13337]},"distFalloff":0.2},{"op":"dot","to":{"around":"current","r":3,"includeCenter":true},"type":"magic","value":{"ap":[90,135,1337]},"dur":15,"tick":1}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"殭屍自爆省略。"},"passives":[{"on":"attack","src":"unit","ops":[{"op":"dot","to":"current","type":"magic","value":{"ap":[90,135,1337]},"dur":15,"tick":1}],"text":"施加病毒"}]},{"key":"TwistedFate","zh":"逆命","cost":5,"slots":1,"traits":["Tango","Trickshot"],"role":"魔法射手","roleClass":"Marksman","dmgType":"magic","stats":{"hp":900,"ad":30,"as":0.8,"armor":45,"mr":45,"range":4,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"萬用牌柯塔多","desc":"被動：戰鬥開始時，商店中每有一名英雄就抽一張牌。若本回合你刷新過商店，會依抽到的牌獲得戰利品！\n1或2張相同：1/1/100金幣\n3張相同：隨機英雄\n4張相同：裝備零件\n5張相同：神祕箱子！\n主動：接下來5次攻擊獲得100%攻擊速度，並改為射出卡牌，對目標造成100/150/2000（受法術強度加成）魔法傷害，對2名附近敵人造成30/45/1000（受法術強度加成）魔法傷害。","castTime":0.4,"steps":[{"op":"empower","attacks":5,"asPct":1.0,"replace":true,"onHit":[{"op":"projectile","to":"current","shape":"card","spin":true,"speed":17,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[100,150,2000]}}]},{"op":"projectile","to":{"nearest":2,"exclude":"current"},"shape":"card","spin":true,"speed":17,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[30,45,1000]}}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"抽牌戰利品只做「1或2張相同」的金幣（3★ 為100金幣）；附近2名敵人改成最近2名。"},"passives":[{"on":"start","src":"unit","limit":1,"ops":[{"op":"econ","kind":"gold","value":[1,1,100]}],"text":"抽牌：金幣"}]},{"key":"Vi","zh":"菲艾","cost":5,"slots":1,"traits":["EDM","Juggernaut"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":1200,"ad":80,"as":0.9,"armor":65,"mr":65,"range":1,"mana":[0,50],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"音樂請下","desc":"召喚2個巨型全像拳頭。獲得300/400/500（受法術強度加成）護盾，持續2秒，並為2/2/10名附近友軍提供125/165/215（受法術強度加成）護盾。猛擊目標5/5/40次，每次造成130/200/1000（受攻擊力加成）物理傷害，並對2格內的其他敵人造成35/55/400（受攻擊力加成）傷害。\n電子舞曲強化：多猛擊一次，並回復此技能所造成傷害的15%生命。","castTime":0.5,"steps":[{"op":"fx","name":"aura","at":"self","skin":"holofists","dur":1.8},{"op":"shield","to":"self","value":{"ap":[300,400,500]},"dur":2},{"op":"shield","to":{"allies":2,"notSelf":true},"value":{"ap":[125,165,215]},"dur":2},{"op":"repeat","times":[5,5,40],"gap":0.3,"ops":[{"op":"damage","to":{"around":"current","r":2,"includeCenter":false},"type":"physical","value":{"ad":[35,55,400]}},{"op":"damage","to":"current","type":"physical","value":{"ad":[130,200,1000]},"fx":{"name":"slash","skin":"holofist","heavy":true,"shake":1}},{"op":"if","cond":{"traitActive":"EDM"},"then":[{"op":"heal","to":"self","value":{"dealt":0.15}}]}]},{"op":"if","cond":{"traitActive":"EDM"},"then":[{"op":"damage","to":"current","type":"physical","value":{"ad":[130,200,1000]}}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"友軍護盾對象固定2名（3★10名省略）；電子舞曲治療只算每次主要打擊的15%。"},"passives":[]},{"key":"Vladimir","zh":"弗拉迪米爾","cost":5,"slots":1,"traits":["Classical","Arcanist"],"role":"魔法鬥士","roleClass":"Fighter","dmgType":"magic","stats":{"hp":1150,"ad":40,"as":0.75,"armor":60,"mr":60,"range":2,"mana":[0,40],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"歌劇鬼魅","desc":"被動：敵人進入撕裂狀態時，會被迷倒，持續到戰鬥結束。\n主動：對最近的3名敵人造成120/180/999（受法術強度加成）魔法傷害，施加20%撕裂，持續（數值未公布）秒，並治療傷害量的（數值未公布）。\n每施放5/5/1次，會在戰場中央落下一盞吊燈，對所有敵人造成380/600/9999（受法術強度加成）魔法傷害；距離中心每遠1格，傷害降低10%。\n撕裂：降低魔法抗性。\n古典樂成員會使敵人著迷，並對其施加額外效果。","castTime":0.6,"steps":[{"op":"fx","name":"tether","frm":{"nearest":3},"to":"self","skin":"blood","dur":0.4},{"op":"damage","to":{"nearest":3},"type":"magic","value":{"ap":[120,180,999]}},{"op":"status","to":"prev","kind":"shred","dur":5,"value":0.2},{"op":"status","to":"prev","kind":"charm","dur":60},{"op":"heal","to":"self","value":{"dealt":0.3}},{"op":"if","cond":{"castN":[5,5,1]},"then":[{"op":"fx","name":"rain","at":"boardCenter","shape":"chandelier","n":1,"dur":0.5},{"op":"fx","name":"shockwave","at":"boardCenter","r":5},{"op":"fx","name":"shake","power":3},{"op":"damage","to":"allEnemies","type":"magic","value":{"ap":[380,600,9999]},"distFalloff":0.1,"center":"board"}]}],"altSteps":null,"altEvery":0,"guess":true,"simplified":"撕裂持續5秒、治療30%為推測（官方未公布）；著迷依官方持續到戰鬥結束（約整場）。"},"passives":[]},{"key":"Zeri","zh":"婕莉","cost":5,"slots":1,"traits":["Goth","Swiftstriker"],"role":"物理施法者","roleClass":"Caster","dmgType":"physical","stats":{"hp":900,"ad":60,"as":0.8,"armor":45,"mr":45,"range":4,"mana":[0,150],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"午夜雷射","desc":"在戰場上快速滑行，並將6道雷射對準當前目標。雷射快速發射，每道對被擊中的敵人造成30/45/500（受法術強度加成） + 135/205/1000（受攻擊力加成）物理傷害，並無視其40%護甲。","castTime":0.6,"steps":[{"op":"pathDash","path":{"kind":"strafe","dist":3,"keepRange":true},"speed":16,"end":"stay","trail":"lightning","then":[{"op":"projectile","to":"current","shape":"laser","count":6,"spread":"seq","gap":0.08,"pierce":true,"len":"board","speed":30,"onHit":[{"op":"damage","to":"current","type":"physical","value":{"ap":[30,45,500],"ad":[135,205,1000]},"pen":0.4}]}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"滑行距離原文沒寫，3 格為推測；雷射改成貫穿。"},"passives":[]},{"key":"BaronNashor","zh":"巴龍納什","cost":7,"slots":2,"traits":["OneMonsterBand"],"role":"物理鬥士","roleClass":"Fighter","dmgType":"physical","stats":{"hp":2500,"ad":140,"as":0.55,"armor":80,"mr":80,"range":2,"mana":[80,120],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"集合吧！樂團","desc":"召喚由8名樂手與一名重奏先驅組成的樂團，將所有敵人擊飛1秒。對所有敵人分攤造成550/825/2475（受攻擊力加成）物理傷害與650/1000/3000（受法術強度加成）魔法傷害。\n每名小兵攻擊4次，每次攻擊造成33/50/250（受攻擊力加成）物理傷害。","castTime":0.8,"steps":[{"op":"fx","name":"sweep","skin":"roar","dur":0.5},{"op":"fx","name":"shake","power":3},{"op":"displace","to":"allEnemies","kind":"knockup","dur":1},{"op":"damage","to":"allEnemies","type":"physical","value":{"ad":[550,825,2475]},"split":true},{"op":"damage","to":"allEnemies","type":"magic","value":{"ap":[650,1000,3000]},"split":true},{"op":"repeat","times":8,"ops":[{"op":"summon","unit":{"zh":"樂手","hpPct":0.1,"adPct":[0.33,0.5,2.5],"as":0.8,"armor":30,"mr":30,"range":1},"at":"nearTarget","dur":5,"skin":"musician"}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"8名樂手各存活5秒（約攻擊4次）；重奏先驅省略。"},"passives":[]},{"key":"Rakan","zh":"銳空","cost":7,"slots":1,"traits":["BoyBand","Choreographer"],"role":"魔法刺客","roleClass":"Assassin","dmgType":"magic","stats":{"hp":1450,"ad":65,"as":0.9,"armor":80,"mr":80,"range":2,"mana":[0,55],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"如孔雀般飛翔","desc":"滑向附近一群敵人，並向1格內的敵人分攤射出8/8/32根羽毛，每根造成100/180/2400（受法術強度加成）魔法傷害。\n本尊銳空會擊中2格內的敵人並短暫擊飛。","castTime":0.5,"steps":[{"op":"pathDash","path":{"kind":"toward","to":{"cluster":{"r":1}}},"speed":15,"end":"adjacent","trail":"feather","then":[{"op":"projectile","to":{"around":"current","r":1,"includeCenter":true},"shape":"feather","count":[8,8,32],"spread":"distribute","gap":0.03,"speed":16,"onHit":[{"op":"damage","to":"current","type":"magic","value":{"ap":[100,180,2400]}}]},{"op":"fx","name":"shockwave","at":"self","r":2},{"op":"displace","to":{"around":"self","r":2},"kind":"knockup","dur":0.5}]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"分身與本尊合併成一個；3★ 的重複施放與分身數量未做。"},"passives":[]},{"key":"Smeech","zh":"斯米奇","cost":7,"slots":1,"traits":["Jazz","Slayer"],"role":"物理專家","roleClass":"Specialist","dmgType":"physical","stats":{"hp":1300,"ad":70,"as":0.9,"armor":65,"mr":65,"range":1,"mana":[0,4],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"上升趨勢","desc":"被動：每次攻擊獲得1/1/4到4/4/10點節奏。每4秒施放一次技能。\n主動：獲得250/375/40000（受法術強度加成）護盾，持續3/3/10秒，並對2格內所有敵人造成100/150/4000（受攻擊力加成）物理傷害。接著攻擊當前目標4次，每次造成240/360/2600（受攻擊力加成）物理傷害，並且每點節奏額外造成12/18/350（受攻擊力加成）傷害。\n釋放15點節奏後，獲得一個你尚未啟動的特性徽章，並提高所需節奏。\n（已釋放節奏：層數/15）","castTime":0,"steps":[],"altSteps":null,"altEvery":0,"guess":false,"simplified":"不靠法力，每4秒自動施放；節奏改成「每次攻擊暫時提高攻擊力、4秒後消失」來近似（每次獲得節奏取最小與最大的平均值，每點節奏約等於 12/18/350 攻擊力 ÷ 每擊基礎傷害；同時也會小幅放大護盾外的其他傷害）；放節奏換紋章省略。"},"passives":[{"on":"attack","src":"unit","ops":[{"op":"buff","to":"self","stat":"adPct","value":[0.125,0.125,0.94],"dur":4}],"text":"節奏"},{"on":"every","n":4,"src":"unit","ops":[{"op":"shield","to":"self","value":{"ap":[250,375,40000]},"dur":[3,3,10]},{"op":"fx","name":"shockwave","at":"self","r":2},{"op":"damage","to":{"around":"self","r":2},"type":"physical","value":{"ad":[100,150,4000]}},{"op":"repeat","times":4,"ops":[{"op":"damage","to":"current","type":"physical","value":{"ad":[240,360,2600]},"fx":{"name":"slash","skin":"beat"}}],"gap":0.12}],"text":"攀升"}]},{"key":"Sona","zh":"索娜","cost":7,"slots":1,"traits":["Producer","Collab"],"role":"魔法專家","roleClass":"Specialist","dmgType":"magic","stats":{"hp":1400,"ad":0,"as":0.8,"armor":50,"mr":50,"range":10,"mana":[0,220],"crit":0.25,"critDmg":1.4},"statsGuess":false,"ability":{"name":"合作演出：索娜","desc":"被動：無法普攻，不可被阻擋。改為每3秒獲得30/30/100點魔力，對最近的3/3/10名敵人造成120/180/1000（受法術強度加成）魔法傷害，並使2/2/5名友軍獲得40/65/9999（受法術強度加成）護盾，持續3/3/10秒。\n主動：釋放一道穿越戰場的音波，對所有敵人分攤造成1500/2400/10000000（受法術強度加成）魔法傷害，並暈眩2/2/30秒。友軍分攤獲得250/450/99999（受法術強度加成）護盾，持續5/5/10秒。","castTime":0.8,"steps":[{"op":"fx","name":"sweep","skin":"soundwave","dur":0.6,"dir":"forward"},{"op":"fx","name":"shake","power":2},{"op":"damage","to":"allEnemies","type":"magic","value":{"ap":[1500,2400,10000000]},"split":true},{"op":"stun","to":"allEnemies","dur":[2,2,30]},{"op":"shield","to":{"allies":"all"},"value":{"ap":[41.7,75,16666.5]},"dur":[5,5,10]}],"altSteps":null,"altEvery":0,"guess":false,"simplified":"「無法攻擊」用攻速 -95% 代替；被動打擊對象數與護盾友軍數在 3★（10名／5名）省略，維持 3 名／2 名；友軍護盾官方是分攤，這裡以 6 人平分計算。"},"passives":[{"on":"start","src":"unit","ops":[{"op":"buff","to":"self","stat":"asPct","value":-0.95},{"op":"status","to":"self","kind":"ccImmune","dur":999}],"text":"無法攻擊、不可被阻擋"},{"on":"every","n":3,"src":"unit","ops":[{"op":"fx","name":"proj","frm":"self","to":{"nearest":3},"shape":"note","cosmetic":true},{"op":"mana","to":"self","value":[30,30,100]},{"op":"damage","to":{"nearest":3},"type":"magic","value":{"ap":[120,180,1000]}},{"op":"shield","to":{"allies":2,"notSelf":true},"value":{"ap":[40,65,9999]},"dur":[3,3,10]}],"text":"同台伴奏"}]}]},"traits":{"version":"s19-pbe-1","sprite":{"src":"../icons/s19/traits.webp","cols":8,"size":64,"count":49,"index":{"IonicSpark":0,"KDA":1,"BeachPop":2,"Classical":3,"Heartsteel":4,"Rock":5,"Pentakill":6,"TrueDamage":7,"Hyperpop":8,"ILLBEATS":9,"GuFeng":10,"Jazz":11,"RAndB":12,"EDM":13,"Frontman":14,"Juggernaut":15,"Slayer":16,"Swiftstriker":17,"Choreographer":18,"Bodyguard":19,"Arcanist":20,"Encore":21,"Prodigy":22,"Renegade":23,"Collab":24,"Trickshot":25,"Hitmaker":26,"Manager":27,"8Bit":28,"OneMonsterBand":29,"Composer":30,"Synthwave":31,"Goth":32,"RecordMogul":33,"Emo":34,"Tango":35,"MelodicHeart":36,"HypeMan":37,"Indie":38,"BoyBand":39,"BeatMaster":40,"Freestyle":41,"Producer":42,"Disco":43,"Country":44,"Windblessed":45,"Mariachi":46,"RisingStar":47,"Superstar":48}},"traits":[{"key":"IonicSpark","zh":"離子火花","kind":"origin","breakpoints":[3,5,7,10],"desc":"粉絲每 4 秒會送一次禮物，幫隊友回 2% 生命，並給收禮的人攻速 +7%。離子火花成員本身也多拿生命。\n5 階起，禮物變成個人化禮物：收禮的人攻擊 +25% 或法強 +25%。\n7 階起，每打 2 回合多拿金幣（官方還送消耗品，這裡沒做）。10 階成員生命 +1200，粉絲衝上舞台（全隊傷害增幅 +50%，推測）。","levelsText":["成員生命 +100；每 4 秒送一次禮物，回復 2% 生命並給收禮的人攻速 +7%。","成員生命 +250；個人化禮物再給收禮的人攻擊 +25% 或法強 +25%（兩種都給，用不到的那種沒作用）。","成員生命 +550；每 2 回合多拿 3 金（金額推測，官方還有一個消耗品沒做）。","成員生命 +1200；粉絲衝上舞台，全隊傷害增幅 +50%（推測）。"],"members":["Elise","Yunara","Annie","Lux","Briar","Tibbers","Jinx","Shyvana","Aurora","Gwen"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"hp":100}},{"type":"teamPassive","passive":{"on":"every","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"tgtMaxHp":0.02}},{"op":"buff","to":"prev","stat":"asPct","value":0.07,"dur":4}],"src":"trait:IonicSpark","text":"粉絲送禮物","n":4}}],[{"type":"stat","who":"members","stats":{"hp":250}},{"type":"teamPassive","passive":{"on":"every","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"tgtMaxHp":0.02}},{"op":"buff","to":"prev","stat":"asPct","value":0.07,"dur":4},{"op":"buff","to":"prev","stat":"adPct","value":0.25,"dur":4},{"op":"buff","to":"prev","stat":"ap","value":25,"dur":4}],"src":"trait:IonicSpark","text":"粉絲送禮物","n":4}}],[{"type":"stat","who":"members","stats":{"hp":550}},{"type":"teamPassive","passive":{"on":"every","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"tgtMaxHp":0.02}},{"op":"buff","to":"prev","stat":"asPct","value":0.07,"dur":4},{"op":"buff","to":"prev","stat":"adPct","value":0.25,"dur":4},{"op":"buff","to":"prev","stat":"ap","value":25,"dur":4}],"src":"trait:IonicSpark","text":"粉絲送禮物","n":4}},{"type":"econ","when":"everyNRounds","n":2,"gain":{"gold":3}}],[{"type":"stat","who":"members","stats":{"hp":1200}},{"type":"teamPassive","passive":{"on":"every","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"tgtMaxHp":0.02}},{"op":"buff","to":"prev","stat":"asPct","value":0.07,"dur":4},{"op":"buff","to":"prev","stat":"adPct","value":0.25,"dur":4},{"op":"buff","to":"prev","stat":"ap","value":25,"dur":4}],"src":"trait:IonicSpark","text":"粉絲送禮物","n":4}},{"type":"econ","when":"everyNRounds","n":2,"gain":{"gold":3}},{"type":"stat","who":"team","stats":{"dmgAmp":0.5},"guess":true}]],"simplified":"禮物改成每 4 秒送給全隊血最少的友軍（官方是送給一名離子火花成員）。官方只寫了 3 階回 2% 生命，其他都是推測：5 階以上回 4%、10 階回 6%、禮物 +25% 攻速、7 階每 2 回合 3 金、10 階成員 +900 生命和全隊傷害增幅 +50%。官方說的「7% 的卡片」和消耗品沒有做。 禮物的加成持續時間官方沒寫，抓 4 秒。個人化禮物「攻擊或法強」兩種都給。","guess":true,"counter":null},{"key":"KDA","zh":"K/DA","kind":"origin","countMode":"stars","breakpoints":[3,5,7,10,13,15,21],"desc":"這個羈絆算的是 K/DA 英雄的「總星數」，不是人數，所以 2 星的阿璃算 2 個。\n開場和第 8 秒各放一次新歌（護盾持續 8 秒），之前解鎖的歌會一起放。\n這個羈絆是累加的：每一階都包含前面所有效果。總星數到 10 之後，前面效果 ×1.25。到 21：成員生命和攻擊 +50%。","levelsText":["POP/STARS：最大魔力降低 10%。","DRUM GO DUM：12% 最大生命護盾，持續 8 秒。","VILLAIN：60% 攻速，8 秒內衰減。","I'LL SHOW YOU：先前所有效果提高 25%（魔力 -12.5%、護盾 15%、攻速 75%）。","WATCH ME：暈眩所有敵人1秒。","FIRESTARTER：敵人在8秒內受到相當於其12%最大生命的魔法傷害。","GIRLS GIRLS GIRLS：K/DA 成員升為4星。"],"members":["Neeko","Lillia","Gragas","Evelynn","KaiSa","Ahri","Leona","AkaliKDA"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.1}}],[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.1}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.12},"dur":8}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.12},"dur":8}],"src":"trait:KDA","text":"新歌！","at":8}}],[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.1}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.12},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.6,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.12},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.6,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":8}}],[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.125}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":8}}],[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.125}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"stun","to":"allEnemies","dur":1}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":8}},{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"stun","to":"allEnemies","dur":1}],"src":"trait:KDA","text":"新歌！","at":8}}],[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.125}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"stun","to":"allEnemies","dur":1},{"op":"dot","to":"allEnemies","type":"magic","value":{"tgtMaxHp":0.12},"dur":8,"tick":1}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":8}},{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"stun","to":"allEnemies","dur":1},{"op":"dot","to":"allEnemies","type":"magic","value":{"tgtMaxHp":0.12},"dur":8,"tick":1}],"src":"trait:KDA","text":"新歌！","at":8}}],[{"type":"stat","who":"members","stats":{"manaMaxPct":-0.125}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"stun","to":"allEnemies","dur":1},{"op":"dot","to":"allEnemies","type":"magic","value":{"tgtMaxHp":0.12},"dur":8,"tick":1}],"src":"trait:KDA","text":"新歌！","at":0}},{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.15},"dur":8},{"op":"buff","to":"self","stat":"asPct","value":0.75,"dur":8,"decay":true}],"src":"trait:KDA","text":"新歌！","at":8}},{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"stun","to":"allEnemies","dur":1},{"op":"dot","to":"allEnemies","type":"magic","value":{"tgtMaxHp":0.12},"dur":8,"tick":1}],"src":"trait:KDA","text":"新歌！","at":8}},{"type":"stat","who":"members","stats":{"hpPct":0.5,"adPct":0.5}}]],"simplified":"10 以上「前面效果提高」官方沒公布倍率，這裡抓 ×1.5（推測）。21 的「升為 4 星」改成成員生命、攻擊 +50%。","guess":true,"counter":null},{"key":"BeachPop","zh":"海灘流行樂","kind":"origin","breakpoints":[3,5,7],"desc":"3、5、7 階分別給你 1、2、3 個「沙灘樂器」，開局前自己拖到我方空格擺好（樂器佔格、不算人口）。\n開戰那一刻站在樂器旁邊 6 格內的友軍，整場都吃到加成：每 3 秒回 2% 生命；其中海灘流行成員另外攻速變快、每 3 秒回魔力。","levelsText":["1 個樂器：成員攻速 +15%、每 3 秒回 5 魔力（推測）","2 個樂器：成員攻速 +30%、每 3 秒回 10 魔力（推測）","3 個樂器：成員攻速 +50%、每 3 秒回 15 魔力（推測）"],"members":["Taric","Zoe","Ashe","Renekton","Syndra","Zac","Graves","Taliyah"],"always":[],"tiers":[[{"type":"stat","who":"instrumentedMembers","stats":{"asPct":0.15}},{"type":"passive","who":"instrumented","passive":{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMaxHp":0.02}}],"src":"trait:BeachPop","text":"海灘派對","n":3}},{"type":"passive","who":"instrumentedMembers","passive":{"on":"every","ops":[{"op":"mana","to":"self","value":5}],"src":"trait:BeachPop","n":3,"text":"海灘回魔"}}],[{"type":"stat","who":"instrumentedMembers","stats":{"asPct":0.3}},{"type":"passive","who":"instrumented","passive":{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMaxHp":0.02}}],"src":"trait:BeachPop","text":"海灘派對","n":3}},{"type":"passive","who":"instrumentedMembers","passive":{"on":"every","ops":[{"op":"mana","to":"self","value":10}],"src":"trait:BeachPop","n":3,"text":"海灘回魔"}}],[{"type":"stat","who":"instrumentedMembers","stats":{"asPct":0.5}},{"type":"passive","who":"instrumented","passive":{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMaxHp":0.02}}],"src":"trait:BeachPop","text":"海灘派對","n":3}},{"type":"passive","who":"instrumentedMembers","passive":{"on":"every","ops":[{"op":"mana","to":"self","value":15}],"src":"trait:BeachPop","n":3,"text":"海灘回魔"}}]],"simplified":"樂器可以自己擺：從裝備欄旁邊的道具列拖到我方空格，已經擺好的可以再拖去別格，或拖回道具列收回；放滿再拖會頂掉最早放的。樂器會佔一格（不算人口），棋子不能站上去。開戰那一刻站在樂器相鄰 6 格內的友軍整場有效，戰鬥中走開也不會掉；同一隻貼著好幾個樂器不會疊（推測）。羈絆掉階時多出來的樂器變灰、留在原位暫時沒效果，湊回原階自動恢復。官方：樂器強化相鄰友軍，被強化的友軍每 3 秒回 2% 生命，海灘流行成員另外得到攻速並每 3 秒回魔力。樂器數量（每階 1／2／3 個）與攻速、回魔數字官方沒公布，都是推測；是否每階共用同一個數值也是推測。","guess":true,"counter":null},{"key":"Classical","zh":"古典樂","kind":"origin","breakpoints":[2,4,6],"desc":"古典樂成員傷害增幅，每 6 秒再多 1%。\n他們的技能傷害會讓敵人著迷 6 秒，著迷的敵人打人少 10%。\n4 階：著迷的敵人死掉，生命最低的古典樂成員回 10% 血。\n6 階：著迷的敵人死掉有 15% 機率，戰後那隻變成你板凳上的 1 星棋子。","levelsText":["傷害增幅 8%；被迷倒的敵人造成的傷害降低 10%。","傷害增幅 20%；被迷倒的敵人死亡時拋出玫瑰，使一名古典樂英雄回復 10% 生命。","傷害增幅 35%；被迷倒的敵人死亡時有 15% 機率加入你的板凳。"],"members":["Katarina","Samira","RenataGlasc","Nasus","Jhin","Thresh","Vladimir"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"dmgAmp":0.08}},{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"dmgAmp","value":0.01,"stackKey":"classicalRamp","maxStacks":8}],"src":"trait:Classical","text":"曲風進入狀態","n":6}}],[{"type":"stat","who":"members","stats":{"dmgAmp":0.2}},{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"dmgAmp","value":0.01,"stackKey":"classicalRamp","maxStacks":8}],"src":"trait:Classical","text":"曲風進入狀態","n":6}},{"type":"teamPassive","passive":{"on":"enemyDeath","ops":[{"op":"if","cond":{"tgtStatus":"charm"},"then":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"tgtMaxHp":0.1}}]}],"src":"trait:Classical","text":"玫瑰！"}}],[{"type":"stat","who":"members","stats":{"dmgAmp":0.35}},{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"dmgAmp","value":0.01,"stackKey":"classicalRamp","maxStacks":8}],"src":"trait:Classical","text":"曲風進入狀態","n":6}},{"type":"teamPassive","passive":{"on":"enemyDeath","ops":[{"op":"if","cond":{"tgtStatus":"charm"},"then":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"tgtMaxHp":0.1}}]}],"src":"trait:Classical","text":"玫瑰！"}},{"type":"teamPassive","passive":{"on":"enemyDeath","ops":[{"op":"if","cond":{"tgtStatus":"charm"},"then":[{"op":"econ","kind":"unit","value":"killedUnit","chance":0.15}]}],"src":"trait:Classical","text":"著迷的敵人加入板凳"}}]],"simplified":"官方是「敵人每被著迷 6 秒，增幅 +1%」，這裡簡化成每 6 秒 +1%。玫瑰回血給全隊血最少的友軍（官方是一名古典樂成員）。6 階抓到的棋子戰後以 1 星放到板凳，板凳滿了換成金幣。","guess":false,"counter":null},{"key":"Heartsteel","zh":"心鋼之聲","kind":"origin","breakpoints":[1,3,5,7],"desc":"場上每多一位心鋼之聲成員，全隊就多拿一種加成：\n賽特 +75 生命、慨影 +7% 攻擊、伊澤瑞爾 +10% 暴擊率、卡桑帝 +8 護甲和魔抗、亞盧妮 +7 法強、犽凝 +5% 全能吸血、亞菲利歐 +6% 攻速。\n3 階會拿到 1 個「心鋼最愛」，放在裝備欄旁邊，可以一直重複用：拖到成員身上就是選他強化技能，想改選就再拖一次；5 階再多 1 個（共 2 個）。沒拖就不強化。7 階心鋼之聲成員自己多拿 150% 的加成。","levelsText":["心鋼之聲成員為你的隊伍提供加成。","拿到 1 個心鋼最愛，拖到成員身上就是選他強化技能，可以重選。","再多 1 個心鋼最愛（共 2 個），拖到另一位成員身上。","心鋼之聲英雄額外獲得150%的心鋼之聲啟動加成。"],"members":["Kayn","Sett","Ezreal","KSante","Alune","Yone","Aphelios"],"always":[],"tiers":[[{"type":"statPerMember","who":"team","table":{"Sett":{"hp":75},"Kayn":{"adPct":0.07},"Ezreal":{"crit":0.1},"KSante":{"armor":8,"mr":8},"Alune":{"ap":7},"Yone":{"omnivamp":0.05},"Aphelios":{"asPct":0.06}}}],[{"type":"statPerMember","who":"team","table":{"Sett":{"hp":75},"Kayn":{"adPct":0.07},"Ezreal":{"crit":0.1},"KSante":{"armor":8,"mr":8},"Alune":{"ap":7},"Yone":{"omnivamp":0.05},"Aphelios":{"asPct":0.06}}},{"type":"special","id":"favorite","n":1}],[{"type":"statPerMember","who":"team","table":{"Sett":{"hp":75},"Kayn":{"adPct":0.07},"Ezreal":{"crit":0.1},"KSante":{"armor":8,"mr":8},"Alune":{"ap":7},"Yone":{"omnivamp":0.05},"Aphelios":{"asPct":0.06}}},{"type":"special","id":"favorite","n":2}],[{"type":"statPerMember","who":"team","table":{"Sett":{"hp":75},"Kayn":{"adPct":0.07},"Ezreal":{"crit":0.1},"KSante":{"armor":8,"mr":8},"Alune":{"ap":7},"Yone":{"omnivamp":0.05},"Aphelios":{"asPct":0.06}},"memberMult":1.5},{"type":"special","id":"favorite","n":2}]],"simplified":"官方只公布各成員的數字，沒說對應哪個屬性，這裡的對應是推測（賽特生命、慨影攻擊、伊澤瑞爾攻速、卡桑帝雙抗、亞盧妮法強、犽凝暴擊、亞菲利歐傷害增幅）。最愛要自己選：3 階給 1 個「心鋼最愛」、5 階給 2 個，放在裝備欄旁邊可以一直重複用；拖到心鋼之聲成員身上，他的技能就強化 +25% 技能增幅，要改選就再拖一次（拖到已經是最愛的那位就取消），沒拖就不強化。羈絆掉到 3 階以下時標記暫時失效，回來會自動回到原本那位。敵方沒有介面，維持自動挑裝備最多的。7 階『多拿 150%』＝成員額外拿 1.5 倍。 官方還有「紋章 3%」和「索娜 5% 治療與護盾」，這裡沒做。","guess":false,"counter":null},{"key":"Rock","zh":"搖滾樂","kind":"origin","breakpoints":[3,4,5,7],"desc":"3 階：召喚一隻地獄偶像站前排（這個版本固定 1200 生命、60 攻擊，不會隨搖滾成員的星級變肉）。\n4 階：搖滾成員全能吸血 10%。\n5 階：搖滾成員放技能時，射出一道光束打穿整排敵人，傷害固定 150。\n7 階：每 3 秒 2 道閃電劈隨機敵人，官方是重複搖滾英雄造成傷害的 15%，這裡簡化成每道固定 150。","levelsText":["召喚地獄偶像。","治療搖滾英雄造成傷害的 10%。","施放技能時，發射一道巨大的光束，穿過最多數量的敵人。","存活期間每 3 秒有 2 道閃電擊中附近敵人，重複搖滾英雄造成傷害的 15% 作為魔法傷害（這裡簡化成每道固定 150）。"],"members":["Olaf","Varus","Camille","Swain","Vayne","Locke","Pyke"],"always":[],"tiers":[[{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"summon","to":"self","unit":{"zh":"地獄偶像","hp":1200,"ad":60,"as":0.7,"armor":60,"mr":60,"range":1},"at":"front"}],"src":"trait:Rock","text":"地獄偶像登場"}}],[{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"summon","to":"self","unit":{"zh":"地獄偶像","hp":1200,"ad":60,"as":0.7,"armor":60,"mr":60,"range":1},"at":"front"}],"src":"trait:Rock","text":"地獄偶像登場"}},{"type":"stat","who":"members","stats":{"omnivamp":0.1}}],[{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"summon","to":"self","unit":{"zh":"地獄偶像","hp":1200,"ad":60,"as":0.7,"armor":60,"mr":60,"range":1},"at":"front"}],"src":"trait:Rock","text":"地獄偶像登場"}},{"type":"stat","who":"members","stats":{"omnivamp":0.1}},{"type":"passive","who":"members","passive":{"on":"cast","ops":[{"op":"damage","to":{"line":"current","len":"board"},"type":"magic","value":{"flat":150}}],"src":"trait:Rock","text":"巨大光束"}}],[{"type":"teamPassive","passive":{"on":"start","ops":[{"op":"summon","to":"self","unit":{"zh":"地獄偶像","hp":1200,"ad":60,"as":0.7,"armor":60,"mr":60,"range":1},"at":"front"}],"src":"trait:Rock","text":"地獄偶像登場"}},{"type":"stat","who":"members","stats":{"omnivamp":0.1}},{"type":"passive","who":"members","passive":{"on":"cast","ops":[{"op":"damage","to":{"line":"current","len":"board"},"type":"magic","value":{"flat":150}}],"src":"trait:Rock","text":"巨大光束"}},{"type":"teamPassive","passive":{"on":"every","ops":[{"op":"repeat","times":2,"ops":[{"op":"damage","to":{"random":1},"type":"magic","value":{"flat":150}}]}],"src":"trait:Rock","text":"雙閃電","n":3}}]],"simplified":"地獄偶像官方會看搖滾成員的平均星級和回合數變肉，這裡固定 1200 生命、60 攻擊（推測）。光束官方是「120＋回合×10」、閃電官方是搖滾成員傷害的 20%，這裡都固定 150。光束打的是目標那一整條直線，不是官方的「穿過最多敵人」路線。","guess":true,"counter":null},{"key":"Pentakill","zh":"殺五社","kind":"origin","breakpoints":[3,5,7],"desc":"殺五社成員攻擊與法強變高。\n最先掉到 10% 血以下的 2／3／4 個敵人會被直接處決，原地變成我方的食屍鬼。\n7 階第一隻改成三倍強的鋼鐵少女。","levelsText":["15%攻擊力與法術強度，2名敵人","30%攻擊力與法術強度，3名敵人","35%攻擊力與法術強度，4名敵人。第一名死亡的敵人會改為召喚鋼鐵少女。"],"members":["Gnar","Olaf","Karthus","Viego","Kayle","Yorick","Mordekaiser"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"adPct":0.15,"ap":15.0}},{"type":"special","id":"executeSummon","count":2,"ghoul":{"hp":650,"ad":65}}],[{"type":"stat","who":"members","stats":{"adPct":0.3,"ap":30.0}},{"type":"special","id":"executeSummon","count":3,"ghoul":{"hp":650,"ad":65}}],[{"type":"stat","who":"members","stats":{"adPct":0.35,"ap":35.0}},{"type":"special","id":"executeSummon","count":4,"ghoul":{"hp":650,"ad":65},"firstBig":true,"bigMult":3,"bigName":"鋼鐵少女"}]],"simplified":"食屍鬼官方數值看回合，這裡固定生命 650、攻擊 65（推測）；鋼鐵少女＝食屍鬼 ×3 數值。法強加成以 +15／30／35 點計算。7 階 POGO 不做。","guess":true,"counter":null},{"key":"TrueDamage","zh":"True Damage","kind":"origin","breakpoints":[3,5],"desc":"只做 A 面（贏的那面）：True Damage 成員造成的傷害會額外附帶真實傷害，贏了回合多拿金幣。\nB 面（輸的那面）和閃耀值兌換沒有重製。","levelsText":["額外 18% 真實傷害，贏 +1 金（金額推測）","額外 30% 真實傷害，贏 +2 金（金額推測）"],"members":["Kennen","Qiyana","Senna","Ekko","Yasuo","AkaliTrueDamage"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"trueDmgPct":0.18}},{"type":"econ","when":"win","gain":{"gold":1},"guess":true}],[{"type":"stat","who":"members","stats":{"trueDmgPct":0.3}},{"type":"econ","when":"win","gain":{"gold":2},"guess":true}]],"simplified":"B 面與閃耀值兌換沒有重製。成員造成的傷害（普攻和技能都算）會額外附帶 15%／30% 的真實傷害；3 階的 15% 是推測，5 階的 30% 是官方數字。贏回合 +1／+2 金是簡化版的閃耀值獎勵（推測）。","guess":true,"counter":null},{"key":"Hyperpop","zh":"超流行","kind":"origin","breakpoints":[2,3,4,5],"desc":"超流行成員多拿生命和攻速。\n每場戰鬥結束會累積熱度，羈絆階數越高，累積越快，每次擊殺還再加熱度。\n熱度每累積 25，就拿 4 金。","levelsText":["生命 +100，攻速 +10%","生命 +175，攻速 +15%，熱度 1.5 倍","生命 +250，攻速 +25%，熱度 3 倍","生命 +400，攻速 +40%，熱度 3.5 倍"],"members":["Ziggs","Kobuko","Tristana","Lulu","Teemo"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"hp":100,"asPct":0.1}},{"type":"econ","when":"roundEnd","gain":{"heat":4},"guess":true},{"type":"passive","who":"members","passive":{"on":"kill","ops":[{"op":"econ","kind":"heat","value":1}],"src":"trait:Hyperpop","text":"擊殺加熱度"}},{"type":"counterReward","persistKey":"heat","thresholds":[25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500],"gain":{"gold":4},"guess":true}],[{"type":"stat","who":"members","stats":{"hp":175,"asPct":0.15}},{"type":"econ","when":"roundEnd","gain":{"heat":6},"guess":true},{"type":"passive","who":"members","passive":{"on":"kill","ops":[{"op":"econ","kind":"heat","value":1.5}],"src":"trait:Hyperpop","text":"擊殺加熱度"}},{"type":"counterReward","persistKey":"heat","thresholds":[25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500],"gain":{"gold":4},"guess":true}],[{"type":"stat","who":"members","stats":{"hp":250,"asPct":0.25}},{"type":"econ","when":"roundEnd","gain":{"heat":12},"guess":true},{"type":"passive","who":"members","passive":{"on":"kill","ops":[{"op":"econ","kind":"heat","value":3}],"src":"trait:Hyperpop","text":"擊殺加熱度"}},{"type":"counterReward","persistKey":"heat","thresholds":[25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500],"gain":{"gold":4},"guess":true}],[{"type":"stat","who":"members","stats":{"hp":400,"asPct":0.4}},{"type":"econ","when":"roundEnd","gain":{"heat":14},"guess":true},{"type":"passive","who":"members","passive":{"on":"kill","ops":[{"op":"econ","kind":"heat","value":3.5}],"src":"trait:Hyperpop","text":"擊殺加熱度"}},{"type":"counterReward","persistKey":"heat","thresholds":[25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500],"gain":{"gold":4},"guess":true}]],"simplified":"官方依棋子星級給 4／6／12／40 點熱度、獎勵是熱度等級的特殊獎勵；這裡簡化成每場基礎 4 點 ×倍率（1／1.5／3／3.5），每次擊殺再 +1×倍率，每 25 熱度固定換 4 金（推測）。","guess":true,"counter":{"persistKey":"heat","label":"熱度","thresholds":[25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500]}},{"key":"ILLBEATS","zh":"ILLBEATS","kind":"origin","breakpoints":[2,3,4],"desc":"ILLBEATS 啟動後，旁邊會出現一個混音器，有四條推桿：攻擊、法強、生命、擊殺金幣機率。每 1 分貝一格，你自己決定怎麼分；佈陣時隨時可以調，開戰後就鎖住。\n分貝上限：2 階 10、3 階 14、4 階 18。ILLBEATS 成員拿全額，你的全隊（其他隊友）拿 50%。4 階混音效果再強化 50%。\n每 1 分貝換多少是從官方截圖反推的（推測）：成員約 2.2% 攻擊、1.8% 生命、2 點法強、2% 機率（我方擊殺時拿 1 金）；4 階再乘 1.5。","levelsText":["10 分貝","14 分貝","18 分貝。混音效果強化 50%。"],"members":["Illaoi","Braum","Draven","Yuumi"],"always":[{"type":"special","id":"mixer","caps":[10,14,18],"boost":[1,1,1.5],"teamShare":0.5,"per":{"ad":0.0216,"ap":2,"hp":0.0176,"gold":0.02},"guess":true}],"tiers":[[],[],[]],"simplified":"混音器要自己分：四條推桿（攻擊／法強／生命／擊殺金幣機率），每 1 分貝一格，佈陣時調、開戰後鎖住。各階分貝上限 10／14／18，成員拿全額、其他隊友拿 50%，4 階混音強化 50%（這些來自官方原文）。每分貝換多少是從官方混音器截圖反推（推測）：攻擊約 2.16%、生命約 1.76%、法強 2 點、擊殺拿 1 金的機率 2%。ATTACK／MAGIC 預設鍵的分配比例官方沒公布，這裡是推測。金幣只算最後一擊（官方是參與擊殺，簡化）。","guess":true,"counter":null},{"key":"GuFeng","zh":"古風","kind":"origin","breakpoints":[2,3,4],"desc":"古風成員會隨你的玩家等級變強：每 1 級 +2% 攻擊、+2 法強、+2 護甲、+2 魔抗。\n3 階起再多每級 +2% 生命。\n4 階人口上限 +1。","levelsText":["每級獲得2%攻擊力與法術強度，以及2點護甲與魔法抗性。","並且每級獲得2%生命。","從兩卷卷軸中選擇一卷，可由古風英雄裝備。其中一卷會開啟通往11級的危險道路。"],"members":["Xayah","Wukong","LeeSin","Janna"],"always":[],"tiers":[[{"type":"statPerLevel","who":"members","stats":{"adPct":0.02,"ap":2,"armor":2,"mr":2}}],[{"type":"statPerLevel","who":"members","stats":{"adPct":0.02,"ap":2,"armor":2,"mr":2,"hpPct":0.02}}],[{"type":"statPerLevel","who":"members","stats":{"adPct":0.02,"ap":2,"armor":2,"mr":2,"hpPct":0.02}},{"type":"teamSize","value":1}]],"simplified":"官方 4 階是從兩卷卷軸選一卷（其中一卷通往 11 級），這裡改成人口上限 +1。","guess":false,"counter":null},{"key":"Jazz","zh":"爵士樂","kind":"origin","breakpoints":[2,3,4],"desc":"你每有一個啟動中的羈絆（獨特羈絆不算），全隊就多拿生命和傷害增幅。\n爵士本身也算一個羈絆。","levelsText":["1.5%生命，1%傷害增幅","2.5%生命，1.5%傷害增幅","3.5%生命，2%傷害增幅"],"members":["Lucian","Galio","Bard","Smeech"],"always":[],"tiers":[[{"type":"statPerActiveTrait","who":"team","stats":{"hpPct":0.015,"dmgAmp":0.01}}],[{"type":"statPerActiveTrait","who":"team","stats":{"hpPct":0.025,"dmgAmp":0.015}}],[{"type":"statPerActiveTrait","who":"team","stats":{"hpPct":0.035,"dmgAmp":0.02}}]],"simplified":"","guess":false,"counter":null},{"key":"RAndB","zh":"R&B","kind":"origin","breakpoints":[1,2],"desc":"1 階：全隊受到的技能傷害 -6%。\n2 階：你最強的梅爾和銳兒靈魂相連：梅爾受到的傷害有 70% 轉給銳兒，梅爾每造成傷害，銳兒就幫她回那次傷害的 20%。兩隻要同時在場才有效。","levelsText":["你的隊伍受到的技能傷害降低6%。","你最強的梅爾與銳兒靈魂相連。梅爾受到的傷害有70%轉移給銳兒。銳兒治療梅爾造成傷害的20%。"],"members":["Mel","Rell"],"always":[],"tiers":[[{"type":"stat","who":"team","stats":{"abilityDr":0.06}}],[{"type":"stat","who":"team","stats":{"abilityDr":0.06}},{"type":"special","id":"soulLink","heal":0.2}]],"simplified":"『最強的梅爾與銳兒』在這個版本只有各 1 隻，所以直接綁那兩隻。","guess":false,"counter":null},{"key":"EDM","zh":"電子舞曲","kind":"origin","breakpoints":[2],"desc":"電子舞曲英雄的技能變強。這裡的設定是技能傷害 +30%，技能裡寫了「電子舞曲強化」的分支也會啟動。","levelsText":["電子舞曲英雄的技能獲得強化。"],"members":["Jax","Vi"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"abilityAmp":0.3},"guess":true}]],"simplified":"官方沒公布數字，技能傷害 +30% 是推測；SD19 的 breakpoints 是空的，這裡門檻固定為 2。","guess":true,"counter":null},{"key":"Frontman","zh":"主唱","kind":"class","countMode":"units","breakpoints":[2,4,6],"desc":"全隊多100生命，主唱自己再多吃一大截生命，第一次放技能後還會再往上加。","levelsText":["生命 +15%，首次施法後 +25%","生命 +22%，首次施法後 +40%","生命 +35%，首次施法後 +60%"],"members":["Elise","Kobuko","Sett","Illaoi","Renekton","Galio","Swain","Shyvana","Thresh","NunuWillump"],"always":[{"type":"stat","who":"team","stats":{"hp":100}}],"tiers":[[{"type":"stat","who":"members","stats":{"hpPct":0.15}},{"type":"passive","who":"members","passive":{"on":"firstCast","ops":[{"op":"buff","to":"self","stat":"hp","value":{"selfMaxHp":0.087}}],"src":"trait:Frontman","text":"主唱升級！生命提高"}}],[{"type":"stat","who":"members","stats":{"hpPct":0.22}},{"type":"passive","who":"members","passive":{"on":"firstCast","ops":[{"op":"buff","to":"self","stat":"hp","value":{"selfMaxHp":0.148}}],"src":"trait:Frontman","text":"主唱升級！生命提高"}}],[{"type":"stat","who":"members","stats":{"hpPct":0.35}},{"type":"passive","who":"members","passive":{"on":"firstCast","ops":[{"op":"buff","to":"self","stat":"hp","value":{"selfMaxHp":0.185}}],"src":"trait:Frontman","text":"主唱升級！生命提高"}}]],"simplified":"首次施法後再補一次最大生命，補的量已經照當時的生命換算過，所以總共剛好是 +25%／+40%／+60%。","guess":false,"counter":null},{"key":"Juggernaut","zh":"重裝戰士","kind":"class","countMode":"units","breakpoints":[2,4,6],"desc":"重裝戰士自帶減傷，血越少減傷越高。","levelsText":["減傷15%到25%","減傷25%到35%","減傷35%到48%"],"members":["Taric","Olaf","Gragas","Annie","Braum","Ekko","Zac","Yorick","Vi"],"always":[],"tiers":[[{"type":"missingHpScale","who":"members","stat":"dr","min":0.15,"max":0.25}],[{"type":"missingHpScale","who":"members","stat":"dr","min":0.25,"max":0.35}],[{"type":"missingHpScale","who":"members","stat":"dr","min":0.35,"max":0.48}]],"simplified":"","guess":false,"counter":null},{"key":"Slayer","zh":"殺戮者","kind":"class","countMode":"units","breakpoints":[2,4,6],"desc":"殺戮者獲得攻速和全能吸血，血越少加成越高，最多變兩倍。","levelsText":["攻速 +20%、吸血 8%","攻速 +40%、吸血 10%","攻速 +65%、吸血 12%"],"members":["Katarina","Kayn","Camille","Briar","Viego","Yone","Yasuo","Smeech"],"always":[],"tiers":[[{"type":"missingHpScale","who":"members","stat":"asPct","min":0.2,"max":0.4},{"type":"missingHpScale","who":"members","stat":"omnivamp","min":0.08,"max":0.16}],[{"type":"missingHpScale","who":"members","stat":"asPct","min":0.4,"max":0.8},{"type":"missingHpScale","who":"members","stat":"omnivamp","min":0.1,"max":0.2}],[{"type":"missingHpScale","who":"members","stat":"asPct","min":0.65,"max":1.3},{"type":"missingHpScale","who":"members","stat":"omnivamp","min":0.12,"max":0.24}]],"simplified":"加成在滿血時是基礎值，血量越低線性增加到 2 倍。","guess":false,"counter":null},{"key":"Swiftstriker","zh":"迅捷先鋒","kind":"class","countMode":"units","breakpoints":[2,3,4,5],"desc":"全隊攻速多10%。迅捷先鋒每2秒再疊一層攻速，最多5層。","levelsText":["每層5%","每層7%","每層13%","每層20%"],"members":["Yunara","Ziggs","Ashe","Jax","Bard","Kayle","Locke","Zeri"],"always":[{"type":"stat","who":"team","stats":{"asPct":0.1}}],"tiers":[[{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.05,"stackKey":"swift","maxStacks":5}],"src":"trait:Swiftstriker","text":"迅捷先鋒加速！","n":2}}],[{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.07,"stackKey":"swift","maxStacks":5}],"src":"trait:Swiftstriker","text":"迅捷先鋒加速！","n":2}}],[{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.13,"stackKey":"swift","maxStacks":5}],"src":"trait:Swiftstriker","text":"迅捷先鋒加速！","n":2}}],[{"type":"passive","who":"members","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.2,"stackKey":"swift","maxStacks":5}],"src":"trait:Swiftstriker","text":"迅捷先鋒加速！","n":2}}]],"simplified":"","guess":false,"counter":null},{"key":"Choreographer","zh":"編舞者","kind":"class","countMode":"units","breakpoints":[2,3,4,5],"desc":"開場站在前2排的友軍拿護盾，後排友軍拿傷害增幅。編舞者自己拿雙倍。","levelsText":["護盾150、增傷6%","護盾225、增傷10%","護盾375、增傷15%","護盾550、增傷20%"],"members":["RenataGlasc","Lulu","Syndra","Viego","Garen","Ahri","Nidalee","Rakan"],"always":[],"tiers":[[{"type":"startShield","who":"frontRows","value":150,"dur":8},{"type":"stat","who":"backRows","stats":{"dmgAmp":0.06}},{"type":"startShield","who":"members","value":150,"dur":8},{"type":"stat","who":"members","stats":{"dmgAmp":0.06}}],[{"type":"startShield","who":"frontRows","value":225,"dur":8},{"type":"stat","who":"backRows","stats":{"dmgAmp":0.1}},{"type":"startShield","who":"members","value":225,"dur":8},{"type":"stat","who":"members","stats":{"dmgAmp":0.1}}],[{"type":"startShield","who":"frontRows","value":375,"dur":8},{"type":"stat","who":"backRows","stats":{"dmgAmp":0.15}},{"type":"startShield","who":"members","value":375,"dur":8},{"type":"stat","who":"members","stats":{"dmgAmp":0.15}}],[{"type":"startShield","who":"frontRows","value":550,"dur":8},{"type":"stat","who":"backRows","stats":{"dmgAmp":0.2}},{"type":"startShield","who":"members","value":550,"dur":8},{"type":"stat","who":"members","stats":{"dmgAmp":0.2}}]],"simplified":"「自己拿雙倍」簡化成編舞者額外再拿一份：後排的編舞者也會有護盾，前排的編舞者也會拿到增傷（官方是各拿自己站位那一種的雙倍）。護盾持續時間官方沒寫，抓 8 秒。","guess":true,"counter":null},{"key":"Bodyguard","zh":"保鑣","kind":"class","countMode":"units","breakpoints":[2,4,6],"desc":"全隊多15點護甲和魔抗，保鑣自己再多一截。","levelsText":["保鑣再+22","保鑣再+55","保鑣再+105"],"members":["Kennen","Lillia","Nasus","Jax","KSante","Tibbers","Leona"],"always":[{"type":"stat","who":"team","stats":{"armor":15,"mr":15}}],"tiers":[[{"type":"stat","who":"members","stats":{"armor":22,"mr":22}}],[{"type":"stat","who":"members","stats":{"armor":55,"mr":55}}],[{"type":"stat","who":"members","stats":{"armor":105,"mr":105}}]],"simplified":"不檢查保鑣是否還活著，全程生效。","guess":false,"counter":null},{"key":"Arcanist","zh":"奧術大師","kind":"class","countMode":"units","breakpoints":[2,4,6],"desc":"全隊拿法術強度，奧術大師再多拿一份（兩份疊在一起）。","levelsText":["全隊 +12，奧術大師再 +25","全隊 +18，奧術大師再 +50","全隊 +30，奧術大師再 +70"],"members":["Ziggs","Zoe","Karthus","Annie","Swain","Mel","Vladimir"],"always":[],"tiers":[[{"type":"stat","who":"team","stats":{"ap":12}},{"type":"stat","who":"members","stats":{"ap":25}}],[{"type":"stat","who":"team","stats":{"ap":18}},{"type":"stat","who":"members","stats":{"ap":50}}],[{"type":"stat","who":"team","stats":{"ap":30}},{"type":"stat","who":"members","stats":{"ap":70}}]],"simplified":"奧術大師的加成疊在全隊加成上面，所以奧術大師實際拿到 37／68／100 點法強。","guess":false,"counter":null},{"key":"Encore","zh":"安可","kind":"class","countMode":"units","breakpoints":[2,4],"desc":"安可的技能會多射一發效果較弱的投射物。","levelsText":["額外一發，效果25%","額外一發，效果50%"],"members":["Neeko","Varus","Ezreal","Lucian","Yuumi","Jhin","Taliyah"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"abilityAmp":0.25}}],[{"type":"stat","who":"members","stats":{"abilityAmp":0.5}}]],"simplified":"不做額外投射物，改成技能傷害 +25%／+50%。","guess":false,"counter":null},{"key":"Prodigy","zh":"不世之才","kind":"class","countMode":"units","breakpoints":[2,3,4,5],"desc":"全隊每秒多 1 點法力，不世之才再多拿一份。5 人時，他們造成傷害的 10% 會治療血最少的友軍。","levelsText":["不世之才再 +2","不世之才再 +3","不世之才再 +5","不世之才再 +6，並治療 10%"],"members":["Neeko","Lux","Ekko","Malzahar","Alune","Janna"],"always":[{"type":"stat","who":"team","stats":{"manaRegen":1}}],"tiers":[[{"type":"stat","who":"members","stats":{"manaRegen":2}}],[{"type":"stat","who":"members","stats":{"manaRegen":3}}],[{"type":"stat","who":"members","stats":{"manaRegen":5}}],[{"type":"stat","who":"members","stats":{"manaRegen":6}},{"type":"passive","who":"members","passive":{"on":"damageDealt","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":10}],"src":"trait:Prodigy","text":"不世之才造成傷害，治療最殘的友軍","n":100}}]],"simplified":"全隊的 1 點法力回復和不世之才的加成是疊加的，所以不世之才實際每秒拿到 3／4／6／7 點。治療改成每造成 100 傷害，治療血最少的友軍 10 點（等於 10%）。","guess":false,"counter":null},{"key":"Renegade","zh":"叛徒","kind":"class","countMode":"units","breakpoints":[2,3,4,5],"desc":"叛徒拿暴擊率和暴擊傷害，技能也能暴擊。5人時再多10%減傷。","levelsText":["暴擊15%、暴傷12%","暴擊20%、暴傷18%","暴擊25%、暴傷22%","暴擊35%、暴傷25%，再加10%減傷"],"members":["Qiyana","Samira","Evelynn","Aurora","Graves","Pyke"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"crit":0.15,"critDmg":0.12,"abilityCrit":true}}],[{"type":"stat","who":"members","stats":{"crit":0.2,"critDmg":0.18,"abilityCrit":true}}],[{"type":"stat","who":"members","stats":{"crit":0.25,"critDmg":0.22,"abilityCrit":true}}],[{"type":"stat","who":"members","stats":{"crit":0.35,"critDmg":0.25,"abilityCrit":true,"dr":0.1}}]],"simplified":"官方的「精準度」不做。","guess":false,"counter":null},{"key":"Collab","zh":"合作","kind":"class","countMode":"units","breakpoints":[3,5],"desc":"合作成員打到或被打滿8下，就拿1層靈感，攻擊和法強都會提高，最多5層。全隊靈感每累計7層，戰後送你1隻場上合作成員的1星。官方每局隨機挑一批英雄當合作，這個版本固定是下面這6隻。","levelsText":["每層 8%","每層20%"],"members":["Sett","Karthus","Gragas","Briar","Yuumi","Sona"],"always":[],"tiers":[[{"type":"passive","who":"members","passive":{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.08,"stackKey":"inspire","maxStacks":5},{"op":"buff","to":"self","stat":"ap","value":8,"stackKey":"inspire2","maxStacks":5}],"src":"trait:Collab","text":"靈感！攻擊和法強提高","n":8}},{"type":"passive","who":"members","passive":{"on":"hit","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.08,"stackKey":"inspire","maxStacks":5},{"op":"buff","to":"self","stat":"ap","value":8,"stackKey":"inspire2","maxStacks":5}],"src":"trait:Collab","text":"靈感！攻擊和法強提高","n":8}},{"type":"counterReward","persistKey":"inspire","thresholds":[7,14,21,28,35,42,49,56,63,70,77,84,91,98,105,112,119,126,133,140],"gain":{"unit":{"maxCost":5,"source":"collabOnBoard"}}}],[{"type":"passive","who":"members","passive":{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.2,"stackKey":"inspire","maxStacks":5},{"op":"buff","to":"self","stat":"ap","value":20,"stackKey":"inspire2","maxStacks":5}],"src":"trait:Collab","text":"靈感！攻擊和法強提高","n":8}},{"type":"passive","who":"members","passive":{"on":"hit","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.2,"stackKey":"inspire","maxStacks":5},{"op":"buff","to":"self","stat":"ap","value":20,"stackKey":"inspire2","maxStacks":5}],"src":"trait:Collab","text":"靈感！攻擊和法強提高","n":8}},{"type":"counterReward","persistKey":"inspire","thresholds":[7,14,21,28,35,42,49,56,63,70,77,84,91,98,105,112,119,126,133,140],"gain":{"unit":{"maxCost":5,"source":"collabOnBoard"}}}]],"simplified":"成員固定 6 隻：賽特、卡爾瑟斯、古拉格斯、布蕾爾、悠咪、索娜（官方每局隨機挑，可能的英雄共 48 名）。打人和被打分開算，各滿 8 下拿 1 層。","guess":false,"counter":{"persistKey":"inspire","label":"靈感","thresholds":[7,14,21,28,35,42,49,56,63,70,77,84,91,98,105,112,119,126,133,140]}},{"key":"Trickshot","zh":"詭射","kind":"class","countMode":"units","breakpoints":[2,3,4],"desc":"詭射的普攻會彈射到別的敵人，每次彈射只剩前一次傷害的一部分。","levelsText":["彈1次，前次的22%","彈1次，前次的33%","彈2次，前次的33%"],"members":["Gnar","Samira","KaiSa","Draven","Vayne","TwistedFate"],"always":[],"tiers":[[{"type":"bounce","who":"members","count":1,"pct":0.22}],[{"type":"bounce","who":"members","count":1,"pct":0.33}],[{"type":"bounce","who":"members","count":2,"pct":0.33}]],"simplified":"只有普攻會彈，技能不彈。","guess":false,"counter":null},{"key":"Hitmaker","zh":"金曲製造機","kind":"class","countMode":"units","breakpoints":[2,4],"desc":"金曲製造機攻擊力多12%。裝備最多的那幾隻會變成「金曲人物」，攻擊力再多一截。","levelsText":["1名金曲人物，再加20%","2名金曲人物，再加35%"],"members":["Tristana","Lucian","Senna","Xayah","Jinx","MissFortune"],"always":[],"tiers":[[{"type":"stat","who":"members","stats":{"adPct":0.12}},{"type":"stat","who":{"mostItems":1},"stats":{"adPct":0.2}}],[{"type":"stat","who":"members","stats":{"adPct":0.12}},{"type":"stat","who":{"mostItems":2},"stats":{"adPct":0.35}}]],"simplified":"","guess":false,"counter":null},{"key":"Manager","zh":"經紀人","kind":"class","countMode":"units","breakpoints":[2,3,4],"desc":"你有 1 盞聚光燈，放在裝備欄旁邊，可以一直重複用：拖到你要捧的那隻身上（不一定要是經紀人）。開場和之後每5秒，他都拿一次加成（攻擊力與法強各 +6%），可以疊。想換人就再拖一次，沒拖就沒有效果。","levelsText":["每次攻擊力與法強 +6%","再加 8 點法力","再加每場戰鬥 1 金幣"],"members":["Alune","Leona","DrMundo"],"always":[],"tiers":[[{"type":"passive","who":"spotlight","passive":{"on":"start","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.06,"stackKey":"spot","maxStacks":99},{"op":"buff","to":"self","stat":"ap","value":6,"stackKey":"spot2","maxStacks":99}],"src":"trait:Manager","text":"聚光燈！"}},{"type":"passive","who":"spotlight","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.06,"stackKey":"spot","maxStacks":99},{"op":"buff","to":"self","stat":"ap","value":6,"stackKey":"spot2","maxStacks":99}],"src":"trait:Manager","text":"聚光燈！","n":5}}],[{"type":"passive","who":"spotlight","passive":{"on":"start","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.06,"stackKey":"spot","maxStacks":99},{"op":"buff","to":"self","stat":"ap","value":6,"stackKey":"spot2","maxStacks":99},{"op":"mana","to":"self","value":8}],"src":"trait:Manager","text":"聚光燈！"}},{"type":"passive","who":"spotlight","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.06,"stackKey":"spot","maxStacks":99},{"op":"buff","to":"self","stat":"ap","value":6,"stackKey":"spot2","maxStacks":99},{"op":"mana","to":"self","value":8}],"src":"trait:Manager","text":"聚光燈！","n":5}}],[{"type":"passive","who":"spotlight","passive":{"on":"start","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.06,"stackKey":"spot","maxStacks":99},{"op":"buff","to":"self","stat":"ap","value":6,"stackKey":"spot2","maxStacks":99},{"op":"mana","to":"self","value":8}],"src":"trait:Manager","text":"聚光燈！"}},{"type":"passive","who":"spotlight","passive":{"on":"every","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.06,"stackKey":"spot","maxStacks":99},{"op":"buff","to":"self","stat":"ap","value":6,"stackKey":"spot2","maxStacks":99},{"op":"mana","to":"self","value":8}],"src":"trait:Manager","text":"聚光燈！","n":5}},{"type":"econ","when":"roundEnd","gain":{"gold":1}}]],"simplified":"官方是一格聚光燈格子，站上去的人拿加成；這裡改成把聚光燈拖到一隻棋子身上，燈會跟著他走。每次 +6% 攻擊與法強可以一直疊。","guess":false,"counter":null},{"key":"8Bit","zh":"8-bit","kind":"unique","countMode":"units","breakpoints":[1],"desc":"全隊的傷害會一路累計，好運姐的傷害算3倍。每破一個紀錄就拿5金幣。紀錄：5萬、8萬、12.5萬、17.5萬、27.5萬、50萬、70萬、100萬。","levelsText":["破紀錄拿5金幣"],"members":["MissFortune"],"always":[],"tiers":[[{"type":"counterReward","persistKey":"eightBit","thresholds":[50000,80000,125000,175000,275000,500000,700000,1000000],"gain":{"gold":5}}]],"simplified":"每破一個紀錄拿 5 金是推測（官方只說有獎勵）。傷害跨回合一路累計，好運姐的傷害算 3 倍。","guess":true,"counter":{"persistKey":"eightBit","label":"累計傷害","thresholds":[50000,80000,125000,175000,275000,500000,700000,1000000]}},{"key":"OneMonsterBand","zh":"一獸樂團","kind":"unique","countMode":"units","breakpoints":[1],"desc":"巴龍納什占 2 個人口，而且不會被控。他第一次放技能後，會把所有敵人的攻擊、法強、攻速和暴擊率各偷走一部分（1★ 5%、2★ 17.5%、3★ 30%），自己各加 30%（推測）。","levelsText":["占2人口、免控、首次施法偷屬性"],"members":["BaronNashor"],"always":[],"tiers":[[{"type":"passive","who":"members","passive":{"on":"start","ops":[{"op":"status","to":"self","kind":"ccImmune","dur":999}],"src":"trait:OneMonsterBand","text":"巴龍：免疫控制"}},{"type":"passive","who":"members","passive":{"on":"firstCast","ops":[{"op":"buff","to":"allEnemies","stat":"adPct","value":[-0.05,-0.175,-0.3]},{"op":"buff","to":"allEnemies","stat":"ap","value":[-5,-17.5,-30]},{"op":"buff","to":"allEnemies","stat":"asPct","value":[-0.05,-0.175,-0.3]},{"op":"buff","to":"allEnemies","stat":"crit","value":[-0.05,-0.175,-0.3]},{"op":"buff","to":"self","stat":"adPct","value":0.3},{"op":"buff","to":"self","stat":"ap","value":30},{"op":"buff","to":"self","stat":"asPct","value":0.3}],"src":"trait:OneMonsterBand","text":"巴龍的歌聲，偷走敵人屬性"}}]],"simplified":"偷取量依巴龍星級 5%／17.5%／30%（官方曲線只有 1★=5%、3★=30%，2★ 內插）；敵人的攻擊、法強、攻速、暴擊率都扣。巴龍自己拿到多少官方沒寫，沿用各 +30%（推測，暴擊沒加）。","guess":true,"counter":null},{"key":"Composer","zh":"作曲家","kind":"unique","countMode":"units","breakpoints":[1],"desc":"這個版本不用去商店找樂器：馬爾札哈在場又打贏，就自動多 1 件，最多 5 件。每件樂器全隊 +3 法強，馬爾札哈拿雙倍。集滿 5 件送你一隻巴龍納什。","levelsText":["每件樂器全隊+3法強"],"members":["Malzahar"],"always":[],"tiers":[[{"type":"stat","who":"team","stats":{"ap":3},"perPersist":"instrument"},{"type":"stat","who":{"unit":"Malzahar"},"stats":{"ap":3},"perPersist":"instrument"},{"type":"econ","when":"win","gain":{"instrument":1}},{"type":"counterReward","persistKey":"instrument","thresholds":[5],"gain":{"unit":{"key":"BaronNashor"}}}]],"simplified":"官方的樂器是在商店買的，而且馬爾札哈還要累計 60000 傷害才會解鎖巴龍；這裡改成贏一場拿一件、集滿就送。","guess":true,"counter":{"persistKey":"instrument","label":"樂器","thresholds":[1,2,3,4,5],"max":5,"gainWhen":"win","requireUnit":"Malzahar"}},{"key":"Synthwave","zh":"合成波","kind":"unique","countMode":"units","breakpoints":[1],"desc":"蓋倫血量掉到 35% 時，拿一個 6 秒的護盾（300＋他最大生命的 30%）。","levelsText":["掉到 35% 血拿護盾（300＋最大生命的 30%）"],"members":["Garen"],"always":[],"tiers":[[{"type":"passive","who":{"unit":"Garen"},"passive":{"on":"hpBelow","ops":[{"op":"shield","to":"self","value":{"flat":300,"selfMaxHp":0.3},"dur":6}],"src":"trait:Synthwave","text":"合成波護盾！","n":0.35,"limit":1}}]],"simplified":"官方護盾量是「本場受到的治療加護盾總量的 50%」，這裡簡化成 300 加蓋倫最大生命 30%（數字為推測）。","guess":true,"counter":null},{"key":"Goth","zh":"哥特","kind":"unique","countMode":"units","breakpoints":[1],"desc":"婕莉每場第一次打到敵人，吸血蝙蝠會偷走那個敵人8%的攻擊力給她。","levelsText":["首次傷害偷8%攻擊"],"members":["Zeri"],"always":[],"tiers":[[{"type":"passive","who":{"unit":"Zeri"},"passive":{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.08},{"op":"buff","to":"current","stat":"adPct","value":-0.08}],"src":"trait:Goth","text":"蝙蝠偷攻擊！","n":1,"limit":1}}]],"simplified":"用婕莉第一次普攻代替「第一次傷害敵人」；偷的量簡化成雙方各 8%。","guess":true,"counter":null},{"key":"RecordMogul","zh":"音樂界巨頭","kind":"unique","countMode":"units","breakpoints":[1],"desc":"蒙多醫生上場後，你有唱片合約可以自己簽：拖到你要簽的那隻身上，他的傷害增幅+5%。簽約的人每次擊殺，蒙多醫生就永久多25點生命。第一份合約一開始就有，之後每 4 回合再多 1 份；簽錯了再拖一次就能改。","levelsText":["合約：傷害增幅+5%，擊殺幫蒙多加生命，每 4 回合多 1 份"],"members":["DrMundo"],"always":[],"tiers":[[{"type":"stat","who":"contract","stats":{"dmgAmp":0.05}},{"type":"passive","who":"contract","passive":{"on":"kill","ops":[{"op":"econ","kind":"mundoHp","value":25}],"src":"trait:RecordMogul","text":"唱片合約：蒙多永久 +25 生命"}}]],"simplified":"合約要自己拖去簽（傷害增幅 +5%），蒙多第一次上場打的那回合有 1 份，之後每 4 回合多 1 份。官方沒寫蒙多中途下場要不要暫停計算、合約能不能簽給蒙多自己、同一隻能不能簽兩份，這裡是不暫停、可以簽自己、一隻只能 1 份（推測）。簽約者每次擊殺，蒙多永久 +25 生命（跨回合累計）；簽約的人下場或賣掉，合約就退回來。","guess":false,"counter":null},{"key":"Emo","zh":"情緒搖滾","kind":"unique","countMode":"units","breakpoints":[1],"desc":"開場時如果阿姆姆旁邊沒有友軍，就拿護甲和魔抗，星級越高越多。","levelsText":["孤單時雙抗25/40/55"],"members":["Amumu"],"always":[],"tiers":[[{"type":"statByStar","unit":"Amumu","stats":{"armor":[25,40,55],"mr":[25,40,55]},"cond":{"noAdjacentAlly":true}}]],"simplified":"","guess":false,"counter":null},{"key":"Tango","zh":"探戈","kind":"unique","countMode":"units","breakpoints":[1],"desc":"逆命會把最近的友軍當舞伴，兩人攻速+15%。逆命打到的敵人會被灼燒和重傷3秒。","levelsText":["舞伴攻速+15%、灼燒重傷"],"members":["TwistedFate"],"always":[],"tiers":[[{"type":"passive","who":{"unit":"TwistedFate"},"passive":{"on":"start","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.15},{"op":"buff","to":{"allies":1,"notSelf":true},"stat":"asPct","value":0.15}],"src":"trait:Tango","text":"探戈開跳！"}},{"type":"passive","who":{"unit":"TwistedFate"},"passive":{"on":"attack","ops":[{"op":"status","to":"current","kind":"burn","dur":3,"value":0.01},{"op":"status","to":"current","kind":"wound","dur":3,"value":0.33}],"src":"trait:Tango","text":"灼燒加重傷","n":1}}]],"simplified":"只有逆命的普攻會上灼燒和重傷（官方連舞伴也會）。","guess":false,"counter":null},{"key":"MelodicHeart","zh":"旋律之心","kind":"unique","countMode":"units","breakpoints":[1],"desc":"開場前12秒，關會被迷霧包住，敵人選不到她。她旁邊的友軍也多10%減傷。","levelsText":["關前12秒不能被選取"],"members":["Gwen"],"always":[],"tiers":[[{"type":"special","id":"untargetableStart","unit":"Gwen","dur":12},{"type":"passive","who":{"unit":"Gwen"},"passive":{"on":"start","ops":[{"op":"buff","to":{"adjacent":"ally"},"stat":"dr","value":0.1,"dur":12}],"src":"trait:MelodicHeart","text":"迷霧護體"}}]],"simplified":"官方「迷霧內的友軍 +10% 韌性」簡化成開場相鄰的友軍前12秒減傷10%。","guess":false,"counter":null},{"key":"HypeMan","zh":"熱潮製造者","kind":"unique","countMode":"units","breakpoints":[1],"desc":"超流行的英雄每造成 2500 點傷害，熱度就多 1 點（官方連受到的傷害也算，這裡沒算）。","levelsText":["每2500傷害熱度+1"],"members":["Teemo"],"always":[],"tiers":[[{"type":"passive","who":{"trait":"Hyperpop"},"passive":{"on":"damageDealt","ops":[{"op":"econ","kind":"heat","value":1}],"src":"trait:HypeMan","text":"熱度+1","n":2500}}]],"simplified":"只算超流行成員「造成」的傷害，受到的傷害沒算。","guess":false,"counter":null},{"key":"Indie","zh":"獨立音樂","kind":"unique","countMode":"units","breakpoints":[1],"desc":"每2回合戰後，瑟菈紛吸引粉絲，送你1隻隨機1到3費的1星英雄。你有3星英雄時她變新星，技能更強；有4隻以上就是超級巨星。","levelsText":["每2回合送牌，3星加強技能"],"members":["Seraphine"],"always":[],"tiers":[[{"type":"econ","when":"everyNRounds","n":2,"gain":{"unit":{"maxCost":3}}},{"type":"stat","who":{"unit":"Seraphine"},"stats":{"abilityAmp":0.3},"cond":{"threeStarCount":{"min":1,"max":3}}},{"type":"stat","who":{"unit":"Seraphine"},"stats":{"abilityAmp":0.8},"cond":{"threeStarCount":{"min":4}}}]],"simplified":"「訂閱者獎勵」沒做。新星技能傷害 +30%、超級巨星 +80% 是推測。官方是每場戰後送，這裡每 2 回合送一次。","guess":true,"counter":null},{"key":"BoyBand","zh":"男團","kind":"unique","countMode":"units","breakpoints":[1],"desc":"銳空會帶 2 個分身（3★ 時官方是 9 個，這裡固定 2 個），分身有他50%的生命，傷害是他的30%，裝備也一樣。你可以把「分身站位」拖到一隻棋子身上，分身開場就站在那隻旁邊；沒拖就站在銳空旁邊。","levelsText":["銳空多 2 個分身"],"members":["Rakan"],"always":[],"tiers":[[{"type":"special","id":"clone","unit":"Rakan","hpPct":0.5,"dmgMult":0.3},{"type":"special","id":"clone","unit":"Rakan","hpPct":0.5,"dmgMult":0.3}]],"simplified":"官方的分身可以自己擺到任何格子；這裡改成指定分身要站在誰旁邊。官方分身數量是 1～2★ 2 個、3★ 9 個，這裡固定 2 個（9 個做不到）。","guess":false,"counter":null},{"key":"BeatMaster","zh":"節奏大師","kind":"unique","countMode":"units","breakpoints":[1],"desc":"銳兒血量掉到50%會上馬，2秒內補滿血。騎馬時，她每第3下普攻會沿直線打出魔法傷害，傷害看她的護甲加魔抗。","levelsText":["半血上馬回滿，之後第3下普攻放直線傷害"],"members":["Rell"],"always":[],"tiers":[[{"type":"passive","who":{"unit":"Rell"},"passive":{"on":"hpBelow","ops":[{"op":"flag","name":"riding","on":true},{"op":"repeat","times":4,"gap":0.5,"ops":[{"op":"heal","to":"self","value":{"selfMaxHp":0.25}}]}],"src":"trait:BeatMaster","text":"銳兒上馬！","n":0.5,"limit":1}},{"type":"passive","who":{"unit":"Rell"},"passive":{"on":"attack","ops":[{"op":"if","cond":{"flag":"riding"},"then":[{"op":"damage","to":{"line":"current","len":"board"},"type":"magic","value":{"resist":[2,3,5]}}]}],"src":"trait:BeatMaster","text":"騎兵衝鋒","n":3}}]],"simplified":"1 星、2 星的傷害倍率官方沒公布（推測 ×2、×3），3 星是官方的 ×5（倍率乘上護甲＋魔抗）。不做「騎乘時最大法力 -40」。","guess":true,"counter":null},{"key":"Freestyle","zh":"自由風格","kind":"unique","countMode":"units","breakpoints":[1],"desc":"阿卡莉有 True Damage 的兩面。這個版本只做A面：贏了就拿1金幣。","levelsText":["A面：贏+1金幣"],"members":["AkaliTrueDamage"],"always":[],"tiers":[[{"type":"econ","when":"win","gain":{"gold":1}}]],"simplified":"只做 A 面，B 面（回復玩家生命）沒重製。贏 +1 金是推測，官方沒寫數字。","guess":true,"counter":null},{"key":"Producer","zh":"製作人","kind":"unique","countMode":"units","breakpoints":[1],"desc":"索娜在場時，選一個樂團跟她合作，拿到那個羈絆。把「合作邀請」拖到一隻棋子身上，就是選他的起源羈絆，多算 1 人；想換樂團就拖到別隻身上，沒選就不加。","levelsText":["索娜讓你選的起源羈絆+1"],"members":["Sona"],"always":[],"tiers":[[{"type":"special","id":"producer"}]],"simplified":"要自己拖「合作邀請」選：選到的起源羈絆多算 1 人，沒選就不加，不會自動幫你挑。一定要選場上有成員的樂團（官方能不能選場上沒人的沒寫，這裡不行，是推測）。歐拉夫有兩個起源，連拖兩次會在搖滾和殺五社之間切換。索娜「額外攻擊與攻速轉法強」不做。","guess":false,"counter":null},{"key":"Disco","zh":"迪斯可","kind":"unique","countMode":"units","breakpoints":[1],"desc":"全隊每秒回0.8%最大生命。全隊總共放技能6次後進入迪斯可狂熱，全隊攻速+125%。","levelsText":["每秒回0.8%血，放6次技能後攻速+125%"],"members":["NunuWillump"],"always":[],"tiers":[[{"type":"teamPassive","passive":{"on":"every","n":1,"ops":[{"op":"heal","to":{"allies":"all"},"value":{"tgtMaxHp":0.008}}],"src":"trait:Disco","text":"迪斯可回血"}},{"type":"teamPassive","passive":{"on":"cast","n":6,"limit":1,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"asPct","value":1.25}],"src":"trait:Disco","text":"迪斯可狂熱！攻速大增"}}]],"simplified":"全隊累計放技能滿6次才觸發（只觸發一次）。","guess":false,"counter":null},{"key":"Country","zh":"鄉村音樂","kind":"unique","countMode":"units","breakpoints":[1],"desc":"戰鬥開始時，如果亞歷斯塔靠裝備和羈絆多出來的生命超過500，他就拿15%減傷。","levelsText":["額外生命超過500，減傷+15%"],"members":["Alistar"],"always":[],"tiers":[[{"type":"stat","who":{"unit":"Alistar"},"stats":{"dr":0.15},"cond":{"bonusHpOver":500}}]],"simplified":"無。","guess":false,"counter":null},{"key":"Windblessed","zh":"風之女神","kind":"unique","countMode":"units","breakpoints":[1],"desc":"戰鬥開始時，珍娜會放一道龍捲風，把離她最近的 4 個敵人擊飛（這裡簡化成暈眩）：1★ 1.25 秒、2★ 1.75 秒。","levelsText":["開場擊飛（暈眩）離珍娜最近的 4 個敵人：1★ 1.25 秒、2★ 1.75 秒"],"members":["Janna"],"always":[],"tiers":[[{"type":"passive","who":{"unit":"Janna"},"passive":{"on":"start","ops":[{"op":"stun","to":{"nearest":4},"dur":[1.25,1.75]}],"src":"trait:Windblessed","text":"龍捲風！"}}]],"simplified":"官方是把她那一行（加左右各一行）的敵人擊飛，這裡簡化成暈眩離珍娜最近的 4 個敵人。","guess":true,"counter":null},{"key":"Mariachi","zh":"流浪樂手","kind":"unique","countMode":"units","breakpoints":[1],"desc":"奈德麗血量高於75%放技能，會變獵豹並放跳躍派對；否則放生命之舞。血量每次掉到50%以下，她會跳開並變回人形。","levelsText":["純說明，效果寫在奈德麗技能裡"],"members":["Nidalee"],"always":[],"tiers":[[]],"simplified":"沒有羈絆效果，行為寫在奈德麗的技能。","guess":false,"counter":null}]},"items":{"components":[{"key":"BFSword","zh":"暴風之劍","stats":{"adPct":0.1}},{"key":"RecurveBow","zh":"反曲弓","stats":{"asPct":0.1}},{"key":"NeedlesslyLargeRod","zh":"巨型魔棒","stats":{"ap":10}},{"key":"TearOfTheGoddess","zh":"女神之淚","stats":{"manaRegen":1}},{"key":"ChainVest","zh":"鎖子甲","stats":{"armor":20}},{"key":"NegatronCloak","zh":"負極斗篷","stats":{"mr":20}},{"key":"GiantsBelt","zh":"巨人腰帶","stats":{"hp":150}},{"key":"SparringGloves","zh":"格鬥手套","stats":{"crit":0.2}}],"items":[{"key":"Deathblade","zh":"死神之刃","recipe":["BFSword","BFSword"],"stats":{"adPct":0.75},"passives":[],"desc":"攻擊 +60%；所有來源的攻擊額外 ×1.15。","simplified":"引擎沒有「全來源乘算」，簡化成再多 +15% 攻擊（官方是 ×1.15）；原本的傷害增幅 +10% 已不存在。"},{"key":"GiantSlayer","zh":"巨人殺手","recipe":["RecurveBow","BFSword"],"stats":{"adPct":0.15,"ap":15,"asPct":0.15,"dmgAmp":0.15},"passives":[],"desc":"攻擊 +15%、法術強度 +15、攻速 +15%、傷害增幅 +15%。打坦克時再多 15% 傷害增幅。","simplified":"打坦克時的額外傷害增幅沒做（不分目標）。"},{"key":"HextechGunblade","zh":"海克斯科技槍刃","recipe":["BFSword","NeedlesslyLargeRod"],"stats":{"adPct":0.2,"ap":20,"manaRegen":1,"omnivamp":0.15},"passives":[{"on":"damageDealt","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"flat":10.0}}],"src":"item:HextechGunblade","text":"槍刃治療","n":50}],"desc":"攻擊 +20%、法術強度 +20、法力回復 +1、全能吸血 +15%。治療生命比例最低的友軍，治療量等同於 20% 傷害量。","simplified":"治療是每造成 50 點傷害就治療一次（10 點），不是逐筆。"},{"key":"SpearOfShojin","zh":"精進之矛","recipe":["TearOfTheGoddess","BFSword"],"stats":{"adPct":0.15,"ap":15,"manaRegen":1},"passives":[{"on":"attack","ops":[{"op":"mana","to":"self","value":5}],"src":"item:SpearOfShojin","text":"精進回魔"}],"desc":"攻擊 +15%、法術強度 +15、法力回復 +1。普攻賦予 5 額外法力。","simplified":""},{"key":"InfinityEdge","zh":"無盡之刃","recipe":["BFSword","SparringGloves"],"stats":{"abilityCrit":1,"adPct":0.35,"crit":0.35},"passives":[],"desc":"攻擊 +35%、暴擊率 +35%。獲得精準：技能傷害可以暴擊。","simplified":"額外暴擊率轉成暴擊傷害 +10%（精準）沒做。"},{"key":"GuinsoosRageblade","zh":"鬼索的狂暴之刃","recipe":["RecurveBow","NeedlesslyLargeRod"],"stats":{"ap":10,"asPct":0.1},"passives":[{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.07,"stackKey":"guinsoo","maxStacks":99}],"src":"item:GuinsoosRageblade","text":"狂暴","n":1}],"desc":"法術強度 +10、攻速 +10%。每秒攻速 +7%，可疊加。","simplified":""},{"key":"VoidStaff","zh":"虛空之杖","recipe":["RecurveBow","TearOfTheGoddess"],"stats":{"ap":35,"asPct":0.15,"manaRegen":1},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"shred","dur":5,"value":0.3}],"src":"item:VoidStaff","text":"破魔"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"shred","dur":5,"value":0.3}],"src":"item:VoidStaff","text":"破魔"}],"desc":"法術強度 +35、攻速 +15%、法力回復 +1。普攻和技能傷害讓目標魔抗 -30%，持續 5 秒。","simplified":""},{"key":"KrakensFury","zh":"海妖之怒","recipe":["RecurveBow","NegatronCloak"],"stats":{"adPct":0.1,"asPct":0.1,"mr":20},"passives":[{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.035,"stackKey":"kraken","maxStacks":15}],"src":"item:KrakensFury","text":"疊攻"},{"on":"attack","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.15}],"src":"item:KrakensFury","text":"海妖狂怒","n":15,"limit":1}],"desc":"攻擊 +10%、攻速 +10%、魔抗 +20。每次普攻，攻擊 +3.5%，最多 15 層；打滿 15 次普攻後，攻速再 +15%。","simplified":""},{"key":"NashorsTooth","zh":"納什之牙","recipe":["RecurveBow","GiantsBelt"],"stats":{"ap":15,"asPct":0.1,"crit":0.2,"hp":150},"passives":[{"on":"attack","ops":[{"op":"mana","to":"self","value":2}],"src":"item:NashorsTooth","text":"普攻回魔"}],"desc":"法術強度 +15、攻速 +10%、暴擊率 +20%、生命 +150。普攻賦予 2 額外法力。","simplified":"暴擊時額外法力更多，官方沒寫數字，沒做。"},{"key":"LastWhisper","zh":"最後耳語","recipe":["RecurveBow","SparringGloves"],"stats":{"adPct":0.15,"asPct":0.2,"crit":0.2},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"sunder","dur":3,"value":0.3}],"src":"item:LastWhisper","text":"破甲"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"sunder","dur":3,"value":0.3}],"src":"item:LastWhisper","text":"破甲"}],"desc":"攻擊 +15%、攻速 +20%、暴擊率 +20%。普攻和技能傷害讓目標護甲 -30%，持續 3 秒。","simplified":""},{"key":"ArchangelsStaff","zh":"大天使之杖","recipe":["NeedlesslyLargeRod","TearOfTheGoddess"],"stats":{"ap":30,"manaRegen":1},"passives":[{"on":"every","ops":[{"op":"buff","to":"self","stat":"ap","value":20,"stackKey":"archangel","maxStacks":9}],"src":"item:ArchangelsStaff","text":"法強","n":5}],"desc":"法術強度 +30、法力回復 +1。戰鬥中每 5 秒，法術強度 +20，可疊加。","simplified":""},{"key":"Crownguard","zh":"皇冠守衛","recipe":["NeedlesslyLargeRod","ChainVest"],"stats":{"ap":10,"armor":20,"hp":100},"passives":[{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.2},"dur":8}],"src":"item:Crownguard","text":"皇冠護盾"}],"desc":"法術強度 +10、護甲 +20、生命 +100。戰鬥開始獲得 20% 最大生命的護盾，持續 8 秒。","simplified":"所有治療與護盾對持有者 +25% 沒做。"},{"key":"IonicSpark","zh":"離子星火","recipe":["NeedlesslyLargeRod","NegatronCloak"],"stats":{"ap":15,"hp":350,"mr":35},"passives":[{"on":"every","ops":[{"op":"status","to":{"around":"self","r":2},"kind":"shred","dur":1.5,"value":0.3}],"src":"item:IonicSpark","text":"破魔","n":1}],"desc":"法術強度 +15、生命 +350、魔抗 +35。2 格內的敵人魔抗 -30%。敵人施放技能時，受到等同其耗費法力 150% 的魔法傷害。","simplified":"「敵人放技能時吃法力傷害」引擎沒有對應觸發，沒做。"},{"key":"JeweledGauntlet","zh":"寶石手套","recipe":["SparringGloves","NeedlesslyLargeRod"],"stats":{"abilityCrit":1,"ap":35,"crit":0.35},"passives":[],"desc":"法術強度 +35、暴擊率 +35%。獲得精準：技能傷害可以暴擊。","simplified":"額外暴擊率轉成暴擊傷害 +10%（精準）沒做。"},{"key":"BlueBuff","zh":"藍Buff","recipe":["TearOfTheGoddess","TearOfTheGoddess"],"stats":{"adPct":0.15,"ap":15,"manaRegen":6,"startMana":10},"passives":[],"desc":"攻擊 +15%、法術強度 +15、法力回復 +6。戰鬥開始獲得 10 法力。","simplified":""},{"key":"SpiritVisage","zh":"振奮盔甲","recipe":["GiantsBelt","TearOfTheGoddess"],"stats":{"dr":0.1,"hp":300,"manaRegen":2},"passives":[{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMissingHp":0.02}}],"src":"item:SpiritVisage","text":"治療","n":1}],"desc":"生命 +300、減傷 10%、法力回復 +2。每秒回復已損失生命的 2%。","simplified":"官方是「承受傷害 ×0.9」，這裡當成減傷 10%。"},{"key":"GargoyleStoneplate","zh":"石像鬼磐核","recipe":["ChainVest","NegatronCloak"],"stats":{"armor":25,"hp":100,"mr":25},"passives":[],"desc":"護甲 +25、生命 +100、魔抗 +25。每有一位敵人以持有者為目標，再 +10 護甲與魔抗。","simplified":"「每個瞄準你的敵人再加雙抗」沒做，只留基本數值。"},{"key":"SteadfastHeart","zh":"堅定之心","recipe":["ChainVest","SparringGloves"],"stats":{"armor":20,"crit":0.2,"dr":0.15,"hp":250},"passives":[{"on":"hpBelow","ops":[{"op":"buff","to":"self","stat":"dr","value":-0.1}],"src":"item:SteadfastHeart","text":"堅定之心減傷","n":0.5,"limit":1}],"desc":"護甲 +20、暴擊率 +20%、生命 +250。減傷 5%；生命高於 50% 時改為 15%。","simplified":"官方 PBE 資料的基本數值欄有一格是空的（可能是生命，數值缺），生命 +250 沿用舊值（不確定）。生命回到 50% 以上不會切回高減傷。"},{"key":"WarmogsArmor","zh":"好戰者鎧甲","recipe":["GiantsBelt","GiantsBelt"],"stats":{"hp":500,"hpPct":0.18},"passives":[],"desc":"生命 +500、最大生命 ×1.18。","simplified":""},{"key":"StrikersFlail","zh":"打手連枷","recipe":["GiantsBelt","SparringGloves"],"stats":{"asPct":0.1,"crit":0.2,"dmgAmp":0.1,"hp":150},"passives":[],"desc":"攻速 +10%、暴擊率 +20%、傷害增幅 +10%、生命 +150。暴擊賦予 5% 傷害增幅，持續 5 秒，最多 4 層。","simplified":"暴擊疊傷害增幅沒做（引擎沒有暴擊觸發），只留基本數值。"},{"key":"RabadonsDeathcap","zh":"死亡之帽","recipe":["NeedlesslyLargeRod","NeedlesslyLargeRod"],"stats":{"ap":75},"passives":[],"desc":"法術強度 +60；所有來源的法術強度額外 ×1.15。","simplified":"引擎沒有「全來源乘算」，簡化成再多 +15 法術強度（官方是 ×1.15）；原本的傷害增幅已不存在。"},{"key":"Bloodthirster","zh":"嗜血者","recipe":["BFSword","NegatronCloak"],"stats":{"adPct":0.15,"ap":15,"mr":20,"omnivamp":0.2},"passives":[{"on":"hpBelow","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.25},"dur":5},{"op":"buff","to":"self","stat":"omnivamp","value":0.15}],"src":"item:Bloodthirster","text":"護盾","n":0.6,"limit":1}],"desc":"攻擊 +15%、法術強度 +15、魔抗 +20、全能吸血 +20%。每場戰鬥一次，生命低於 60% 時獲得 25% 最大生命的護盾，之後全能吸血再 +15%。","simplified":"護盾持續時間官方沒寫，沿用 5 秒。"},{"key":"SunfireCape","zh":"日炎斗篷","recipe":["ChainVest","GiantsBelt"],"stats":{"armor":20,"hp":150,"hpPct":0.08},"passives":[{"on":"every","ops":[{"op":"status","to":{"around":"self","r":2},"kind":"burn","dur":10,"value":0.01},{"op":"status","to":{"around":"self","r":2},"kind":"wound","dur":10,"value":0.33}],"src":"item:SunfireCape","text":"灼燒","n":2}],"desc":"護甲 +20、生命 +150、最大生命 ×1.08。每 2 秒，讓 2 格內的敵人灼燒（每秒 1% 最大生命）與重傷（33%）10 秒。","simplified":""},{"key":"ThiefsGloves","zh":"竊賊手套","recipe":["SparringGloves","SparringGloves"],"stats":{"crit":0.2,"hp":150},"passives":[],"desc":"暴擊率 +20%、生命 +150。開場隨機複製 2 件完整裝備的數值。","simplified":"開場會複製一件身上的裝備。"},{"key":"RedBuff","zh":"紅Buff","recipe":["RecurveBow","RecurveBow"],"stats":{"asPct":0.45,"dmgAmp":0.03},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"burn","dur":5,"value":0.01},{"op":"status","to":"current","kind":"wound","dur":5,"value":0.33}],"src":"item:RedBuff","text":"灼燒"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"burn","dur":5,"value":0.01},{"op":"status","to":"current","kind":"wound","dur":5,"value":0.33}],"src":"item:RedBuff","text":"灼燒"}],"desc":"攻速 +45%、傷害增幅 +3%。普攻與技能讓目標灼燒（每秒 1% 最大生命）與重傷 5 秒。","simplified":""},{"key":"EdgeOfNight","zh":"夜色緣界","recipe":["BFSword","ChainVest"],"stats":{"adPct":0.1,"ap":10,"armor":20,"asPct":0.15},"passives":[{"on":"hpBelow","ops":[{"op":"heal","to":"self","value":{"selfMissingHp":0.15}}],"src":"item:EdgeOfNight","text":"夜色緣界","n":0.4,"limit":1}],"desc":"攻擊 +10%、法術強度 +10、護甲 +20、攻速 +15%。生命降至 40% 時，回復 15% 已損失生命。","simplified":"官方還會短暫無法被指定並移除負面效果，時間官方沒寫，沒做。"},{"key":"SteraksGage","zh":"史特拉克手套","recipe":["BFSword","GiantsBelt"],"stats":{"adPct":0.45,"hp":300},"passives":[{"on":"hpBelow","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.4},"dur":4}],"src":"item:SteraksGage","text":"護盾","n":0.4,"limit":1}],"desc":"攻擊 +45%、生命 +300。生命降至 40% 時，獲得 40% 最大生命的護盾（4 秒內快速衰減）。","simplified":"護盾不會逐漸衰減，4 秒後直接消失。"},{"key":"TitansResolve","zh":"泰坦的決意","recipe":["RecurveBow","ChainVest"],"stats":{"armor":20,"asPct":0.1},"passives":[{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.02,"stackKey":"titan","maxStacks":25},{"op":"buff","to":"self","stat":"ap","value":2.0,"stackKey":"titan2","maxStacks":25}],"src":"item:TitansResolve","text":"泰坦疊加"},{"on":"hit","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.02,"stackKey":"titan","maxStacks":25},{"op":"buff","to":"self","stat":"ap","value":2.0,"stackKey":"titan2","maxStacks":25}],"src":"item:TitansResolve","text":"泰坦疊加"}],"desc":"護甲 +20、攻速 +10%。攻擊或受傷時，攻擊與法術強度 +2%，最多 25 層。","simplified":"疊滿 25 層後的最大生命加成與「無法阻擋」沒做。"},{"key":"Morellonomicon","zh":"黑魔禁書","recipe":["NeedlesslyLargeRod","GiantsBelt"],"stats":{"ap":20,"hp":150,"manaRegen":1},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"burn","dur":10,"value":0.01},{"op":"status","to":"current","kind":"wound","dur":10,"value":0.33}],"src":"item:Morellonomicon","text":"灼燒"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"burn","dur":10,"value":0.01},{"op":"status","to":"current","kind":"wound","dur":10,"value":0.33}],"src":"item:Morellonomicon","text":"灼燒"}],"desc":"法術強度 +20、生命 +150、法力回復 +1。普攻與技能讓目標灼燒（每秒 1% 最大生命）與重傷 10 秒。","simplified":""},{"key":"ProtectorsVow","zh":"保衛者之誓","recipe":["TearOfTheGoddess","ChainVest"],"stats":{"armor":25,"manaRegen":1,"mr":25,"startMana":20},"passives":[{"on":"hpBelow","ops":[{"op":"mana","to":"self","value":15},{"op":"shield","to":"self","value":{"selfMaxHp":0.2}}],"src":"item:ProtectorsVow","text":"保衛者護盾","n":0.4,"limit":1}],"desc":"護甲 +25、魔抗 +25、法力回復 +1。戰鬥開始獲得 20 法力；生命降至 40% 時，獲得 15 法力和 20% 最大生命的護盾。","simplified":"護盾持續時間官方沒寫，用預設值。"},{"key":"AdaptiveHelm","zh":"適性神盔","recipe":["TearOfTheGoddess","NegatronCloak"],"stats":{"manaRegen":3,"mr":20},"passives":[],"desc":"法力回復 +3、魔抗 +20。從所有來源獲得的法力 +15%。依職業再加成：坦克與鬥士雙防 +80，其他人攻擊與法強 +10%。","simplified":"依職業的額外加成與「法力 +15%」引擎沒有對應寫法，沒做，只留基本數值。"},{"key":"HandOfJustice","zh":"正義手套","recipe":["TearOfTheGoddess","SparringGloves"],"stats":{"adPct":0.36,"ap":36,"crit":0.2,"manaRegen":1,"omnivamp":0.12},"passives":[{"on":"hpBelow","ops":[{"op":"buff","to":"self","stat":"adPct","value":-0.18},{"op":"buff","to":"self","stat":"ap","value":-18},{"op":"buff","to":"self","stat":"omnivamp","value":0.12}],"src":"item:HandOfJustice","text":"正義手套切換","n":0.5,"limit":1}],"desc":"暴擊率 +20%、法力回復 +1。獲得兩項效果：攻擊 +18% 與法術強度 +18；全能吸血 +12%。生命高於 50% 時攻擊與法強加成翻倍；低於 50% 時全能吸血翻倍。","simplified":"生命高於 50% 時直接給雙倍攻擊與法強，第一次掉到 50% 以下就切成雙倍全能吸血，之後回血也不會切回來。"},{"key":"BrambleVest","zh":"刺藤胸甲","recipe":["ChainVest","ChainVest"],"stats":{"armor":50,"dr":0.05,"hpPct":0.06},"passives":[{"on":"every","ops":[{"op":"damage","to":{"adjacent":"enemy"},"type":"magic","value":{"flat":100}}],"src":"item:BrambleVest","text":"刺藤反傷","n":2}],"desc":"護甲 +50、最大生命 ×1.06。承受的普攻傷害 -5%；被普攻命中時，對相鄰敵人造成 100 魔法傷害（冷卻 2 秒）。","simplified":"普攻減傷這裡當成全部傷害減傷；反傷簡化成每 2 秒固定打一次相鄰敵人（官方是被普攻命中、冷卻 2 秒）。"},{"key":"DragonsClaw","zh":"龍之爪","recipe":["NegatronCloak","NegatronCloak"],"stats":{"hpPct":0.06,"mr":60},"passives":[{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMaxHp":0.025}}],"src":"item:DragonsClaw","text":"龍爪回血","n":2}],"desc":"魔抗 +60、最大生命 ×1.06。每 2 秒回復 2.5% 最大生命。","simplified":""},{"key":"Evenshroud","zh":"均等法衣","recipe":["NegatronCloak","GiantsBelt"],"stats":{"hp":250,"mr":20},"passives":[{"on":"every","ops":[{"op":"status","to":{"around":"self","r":2},"kind":"sunder","dur":1.5,"value":0.3}],"src":"item:Evenshroud","text":"破甲","n":1},{"on":"start","ops":[{"op":"buff","to":"self","stat":"armor","value":15,"dur":15},{"op":"buff","to":"self","stat":"mr","value":15,"dur":15}],"src":"item:Evenshroud","text":"戰鬥開始雙防"}],"desc":"生命 +250、魔抗 +20。2 格內的敵人護甲 -30%。戰鬥開始後 15 秒內，護甲與魔抗各 +15。","simplified":""},{"key":"Quicksilver","zh":"水銀兜帽","recipe":["NegatronCloak","SparringGloves"],"stats":{"asPct":0.15,"crit":0.2,"mr":20},"passives":[{"on":"start","ops":[{"op":"status","to":"self","kind":"ccImmune","dur":18}],"src":"item:Quicksilver","text":"無人能擋"},{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.03,"stackKey":"quicksilver","maxStacks":99}],"src":"item:Quicksilver","text":"疊攻速","n":1}],"desc":"攻速 +15%、暴擊率 +20%、魔抗 +20。戰鬥開始 18 秒免疫控制（無人能擋）；每秒攻速 +3%，可疊加。","simplified":"官方的「無人能擋」簡化成免疫暈眩與緩速。"}],"radiant":[{"key":"DeathbladeRadiant","zh":"聖光死神之刃","radiant":true,"base":"Deathblade","stats":{"adPct":1.3},"passives":[],"desc":"聖光版：攻擊 +100%；所有來源的攻擊額外 ×1.3。","simplified":"引擎沒有「全來源乘算」，簡化成再多 +30% 攻擊（官方是 ×1.3）；原本的傷害增幅 +10% 已不存在。"},{"key":"GiantSlayer_Radiant","zh":"聖光巨人殺手","radiant":true,"base":"GiantSlayer","stats":{"adPct":0.3,"ap":30,"asPct":0.3,"dmgAmp":0.3},"passives":[],"desc":"聖光版：攻擊 +30%、法術強度 +30、攻速 +30%、傷害增幅 +30%。打坦克時再多 30% 傷害增幅。","simplified":"打坦克時的額外傷害增幅沒做（不分目標）。"},{"key":"HextechGunbladeRadiant","zh":"聖光海克斯科技槍刃","radiant":true,"base":"HextechGunblade","stats":{"adPct":0.4,"ap":40,"manaRegen":2,"omnivamp":0.3},"passives":[{"on":"damageDealt","ops":[{"op":"heal","to":{"lowestHp":1,"side":"ally"},"value":{"flat":20.0}}],"src":"item:HextechGunbladeRadiant","text":"槍刃治療","n":50}],"desc":"聖光版：攻擊 +40%、法術強度 +40、法力回復 +2、全能吸血 +30%。治療生命比例最低的友軍，治療量等同於 40% 傷害量。","simplified":"治療是每造成 50 點傷害就治療一次（20 點），不是逐筆。"},{"key":"SpearOfShojinRadiant","zh":"聖光精進之矛","radiant":true,"base":"SpearOfShojin","stats":{"adPct":0.3,"ap":30,"manaRegen":2},"passives":[{"on":"attack","ops":[{"op":"mana","to":"self","value":10}],"src":"item:SpearOfShojinRadiant","text":"精進回魔"}],"desc":"聖光版：攻擊 +30%、法術強度 +30、法力回復 +2。普攻賦予 10 額外法力。","simplified":""},{"key":"InfinityEdgeRadiant","zh":"聖光無盡之刃","radiant":true,"base":"InfinityEdge","stats":{"abilityCrit":1,"adPct":0.75,"crit":0.75},"passives":[],"desc":"聖光版：攻擊 +75%、暴擊率 +75%。獲得精準：技能傷害可以暴擊。","simplified":"額外暴擊率轉成暴擊傷害 +10%（精準）沒做。"},{"key":"GuinsoosRagebladeRadiant","zh":"聖光鬼索的狂暴之刃","radiant":true,"base":"GuinsoosRageblade","stats":{"ap":20,"asPct":0.25},"passives":[{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.16,"stackKey":"guinsoo","maxStacks":99}],"src":"item:GuinsoosRagebladeRadiant","text":"狂暴","n":1}],"desc":"聖光版：法術強度 +20、攻速 +25%。每秒攻速 +16%，可疊加。","simplified":""},{"key":"VoidStaffRadiant","zh":"聖光虛空之杖","radiant":true,"base":"VoidStaff","stats":{"ap":75,"asPct":0.3,"manaRegen":2},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"shred","dur":999,"value":0.3}],"src":"item:VoidStaffRadiant","text":"破魔"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"shred","dur":999,"value":0.3}],"src":"item:VoidStaffRadiant","text":"破魔"}],"desc":"聖光版：法術強度 +75、攻速 +30%、法力回復 +2。普攻和技能傷害讓目標魔抗 -30%，持續 到戰鬥結束。","simplified":""},{"key":"KrakensFury_Radiant","zh":"聖光海妖之怒","radiant":true,"base":"KrakensFury","stats":{"adPct":0.2,"asPct":0.2,"mr":40},"passives":[{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.07,"stackKey":"kraken","maxStacks":15}],"src":"item:KrakensFury_Radiant","text":"疊攻"},{"on":"attack","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.3}],"src":"item:KrakensFury_Radiant","text":"海妖狂怒","n":15,"limit":1}],"desc":"聖光版：攻擊 +20%、攻速 +20%、魔抗 +40。每次普攻，攻擊 +7%，最多 15 層；打滿 15 次普攻後，攻速再 +30%。","simplified":""},{"key":"NashorsToothRadiant","zh":"聖光納什之牙","radiant":true,"base":"NashorsTooth","stats":{"ap":30,"asPct":0.2,"crit":0.4,"hp":300},"passives":[{"on":"attack","ops":[{"op":"mana","to":"self","value":4}],"src":"item:NashorsToothRadiant","text":"普攻回魔"}],"desc":"聖光版：法術強度 +30、攻速 +20%、暴擊率 +40%、生命 +300。普攻賦予 4 額外法力。","simplified":"暴擊時額外法力更多，官方沒寫數字，沒做。"},{"key":"LastWhisperRadiant","zh":"聖光最後耳語","radiant":true,"base":"LastWhisper","stats":{"adPct":0.45,"asPct":0.4,"crit":0.4},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"sunder","dur":999,"value":0.3}],"src":"item:LastWhisperRadiant","text":"破甲"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"sunder","dur":999,"value":0.3}],"src":"item:LastWhisperRadiant","text":"破甲"}],"desc":"聖光版：攻擊 +45%、攻速 +40%、暴擊率 +40%。普攻和技能傷害讓目標護甲 -30%，持續 到戰鬥結束。","simplified":""},{"key":"ArchangelsStaffRadiant","zh":"聖光大天使之杖","radiant":true,"base":"ArchangelsStaff","stats":{"ap":60,"manaRegen":2},"passives":[{"on":"every","ops":[{"op":"buff","to":"self","stat":"ap","value":40,"stackKey":"archangel","maxStacks":9}],"src":"item:ArchangelsStaffRadiant","text":"法強","n":5}],"desc":"聖光版：法術強度 +60、法力回復 +2。戰鬥中每 5 秒，法術強度 +40，可疊加。","simplified":""},{"key":"CrownguardRadiant","zh":"聖光皇冠守衛","radiant":true,"base":"Crownguard","stats":{"ap":40,"armor":40,"hp":200},"passives":[{"on":"start","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.2},"dur":8}],"src":"item:CrownguardRadiant","text":"皇冠護盾"}],"desc":"聖光版：法術強度 +10、護甲 +20、生命 +100。戰鬥開始獲得 20% 最大生命的護盾，持續 8 秒。（聖光版的官方資料跟原版一模一樣，疑似還沒填，屬性沿用舊的加倍值，不確定。）","simplified":"所有治療與護盾對持有者 +25% 沒做。"},{"key":"IonicSparkRadiant","zh":"聖光離子星火","radiant":true,"base":"IonicSpark","stats":{"ap":30,"hp":700,"mr":70},"passives":[{"on":"every","ops":[{"op":"status","to":{"around":"self","r":2},"kind":"shred","dur":1.5,"value":0.3}],"src":"item:IonicSparkRadiant","text":"破魔","n":1}],"desc":"聖光版：法術強度 +30、生命 +700、魔抗 +70。2 格內的敵人魔抗 -30%。敵人施放技能時，受到等同其耗費法力 300% 的魔法傷害。","simplified":"「敵人放技能時吃法力傷害」引擎沒有對應觸發，沒做。"},{"key":"JeweledGauntletRadiant","zh":"聖光寶石手套","radiant":true,"base":"JeweledGauntlet","stats":{"abilityCrit":1,"ap":75,"crit":0.75},"passives":[],"desc":"聖光版：法術強度 +75、暴擊率 +75%。獲得精準：技能傷害可以暴擊。","simplified":"額外暴擊率轉成暴擊傷害 +10%（精準）沒做。"},{"key":"BlueBuffRadiant","zh":"聖光藍Buff","radiant":true,"base":"BlueBuff","stats":{"adPct":0.4,"ap":40,"manaRegen":12,"startMana":20},"passives":[],"desc":"聖光版：攻擊 +40%、法術強度 +40、法力回復 +12。戰鬥開始獲得 20 法力。","simplified":""},{"key":"SpiritVisage_Radiant","zh":"聖光振奮盔甲","radiant":true,"base":"SpiritVisage","stats":{"dr":0.18,"hp":700,"manaRegen":4},"passives":[{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMissingHp":0.04}}],"src":"item:SpiritVisage_Radiant","text":"治療","n":1}],"desc":"聖光版：生命 +700、減傷 18%、法力回復 +4。每秒回復已損失生命的 4%。","simplified":"官方是「承受傷害 ×0.82」，這裡當成減傷 18%。"},{"key":"GargoyleStoneplate_Radiant","zh":"聖光石像鬼磐核","radiant":true,"base":"GargoyleStoneplate","stats":{"armor":50,"hp":400,"mr":50},"passives":[],"desc":"聖光版：護甲 +50、生命 +400、魔抗 +50。每有一位敵人以持有者為目標，再 +20 護甲與魔抗。","simplified":"「每個瞄準你的敵人再加雙抗」沒做，只留基本數值。"},{"key":"SteadfastHeartRadiant","zh":"聖光堅定之心","radiant":true,"base":"SteadfastHeart","stats":{"armor":40,"crit":0.4,"dr":0.3,"hp":500},"passives":[{"on":"hpBelow","ops":[{"op":"buff","to":"self","stat":"dr","value":-0.2}],"src":"item:SteadfastHeartRadiant","text":"堅定之心減傷","n":0.5,"limit":1}],"desc":"聖光版：護甲 +40、暴擊率 +40%、生命 +500。減傷 10%；生命高於 50% 時改為 30%。","simplified":"官方 PBE 資料的基本數值欄有一格是空的（可能是生命，數值缺），生命 +500 沿用舊值（不確定）。生命回到 50% 以上不會切回高減傷。"},{"key":"WarmogsArmorRadiant","zh":"聖光好戰者鎧甲","radiant":true,"base":"WarmogsArmor","stats":{"hp":1200,"hpPct":0.36},"passives":[],"desc":"聖光版：生命 +1200、最大生命 ×1.36。","simplified":""},{"key":"StrikersFlailRadiant","zh":"聖光打手連枷","radiant":true,"base":"StrikersFlail","stats":{"asPct":0.2,"crit":0.4,"dmgAmp":0.2,"hp":300},"passives":[],"desc":"聖光版：攻速 +20%、暴擊率 +40%、傷害增幅 +20%、生命 +300。暴擊賦予 10% 傷害增幅，持續 5 秒，最多 4 層。","simplified":"暴擊疊傷害增幅沒做（引擎沒有暴擊觸發），只留基本數值。"},{"key":"RabadonsDeathcap_Radiant","zh":"聖光死亡之帽","radiant":true,"base":"RabadonsDeathcap","stats":{"ap":145},"passives":[],"desc":"聖光版：法術強度 +115；所有來源的法術強度額外 ×1.3。","simplified":"引擎沒有「全來源乘算」，簡化成再多 +30 法術強度（官方是 ×1.3）；原本的傷害增幅已不存在。"},{"key":"BloodthirsterRadiant","zh":"聖光嗜血者","radiant":true,"base":"Bloodthirster","stats":{"adPct":0.3,"ap":30,"mr":40,"omnivamp":0.4},"passives":[{"on":"hpBelow","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.5},"dur":5},{"op":"buff","to":"self","stat":"omnivamp","value":0.3}],"src":"item:BloodthirsterRadiant","text":"護盾","n":0.6,"limit":1}],"desc":"聖光版：攻擊 +30%、法術強度 +30、魔抗 +40、全能吸血 +40%。每場戰鬥一次，生命低於 60% 時獲得 50% 最大生命的護盾，之後全能吸血再 +30%。","simplified":"護盾持續時間官方沒寫，沿用 5 秒。"},{"key":"SunfireCape_Radiant","zh":"聖光日炎斗篷","radiant":true,"base":"SunfireCape","stats":{"armor":40,"hp":300,"hpPct":0.16},"passives":[{"on":"every","ops":[{"op":"status","to":{"around":"self","r":2},"kind":"burn","dur":10,"value":0.01},{"op":"status","to":{"around":"self","r":2},"kind":"wound","dur":10,"value":0.33}],"src":"item:SunfireCape_Radiant","text":"灼燒","n":2}],"desc":"聖光版：護甲 +20、生命 +150、最大生命 ×1.08。每 2 秒，讓 2 格內的敵人灼燒（每秒 1% 最大生命）與重傷（33%）10 秒。（聖光版的官方資料跟原版一模一樣，疑似還沒填，屬性沿用舊的加倍值，不確定。）","simplified":""},{"key":"RedBuffRadiant","zh":"聖光紅Buff","radiant":true,"base":"RedBuff","stats":{"asPct":0.8,"dmgAmp":0.06},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"burn","dur":5,"value":0.02},{"op":"status","to":"current","kind":"wound","dur":5,"value":0.33}],"src":"item:RedBuffRadiant","text":"灼燒"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"burn","dur":5,"value":0.02},{"op":"status","to":"current","kind":"wound","dur":5,"value":0.33}],"src":"item:RedBuffRadiant","text":"灼燒"}],"desc":"聖光版：攻速 +80%、傷害增幅 +6%。普攻與技能讓目標灼燒（每秒 2% 最大生命）與重傷 5 秒。","simplified":""},{"key":"EdgeOfNightRadiant","zh":"聖光夜色緣界","radiant":true,"base":"EdgeOfNight","stats":{"adPct":0.3,"ap":30,"armor":40,"asPct":0.3},"passives":[{"on":"hpBelow","ops":[{"op":"heal","to":"self","value":{"selfMissingHp":1.0}}],"src":"item:EdgeOfNightRadiant","text":"夜色緣界","n":0.4,"limit":1}],"desc":"聖光版：攻擊 +30%、法術強度 +30、護甲 +40、攻速 +30%。生命降至 40% 時，回復 所有 已損失生命。","simplified":"官方還會短暫無法被指定並移除負面效果，時間官方沒寫，沒做。"},{"key":"SteraksGageRadiant","zh":"聖光史特拉克手套","radiant":true,"base":"SteraksGage","stats":{"adPct":0.9,"hp":600},"passives":[{"on":"hpBelow","ops":[{"op":"shield","to":"self","value":{"selfMaxHp":0.4},"dur":4}],"src":"item:SteraksGageRadiant","text":"護盾","n":0.4,"limit":1}],"desc":"聖光版：攻擊 +45%、生命 +300。生命降至 40% 時，獲得 40% 最大生命的護盾（4 秒內快速衰減）。（聖光版的官方資料跟原版一模一樣，疑似還沒填，屬性沿用舊的加倍值，不確定。）","simplified":"護盾不會逐漸衰減，4 秒後直接消失。"},{"key":"TitansResolve_Radiant","zh":"聖光泰坦的決意","radiant":true,"base":"TitansResolve","stats":{"armor":40,"asPct":0.2},"passives":[{"on":"attack","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.04,"stackKey":"titan","maxStacks":25},{"op":"buff","to":"self","stat":"ap","value":4.0,"stackKey":"titan2","maxStacks":25}],"src":"item:TitansResolve_Radiant","text":"泰坦疊加"},{"on":"hit","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.04,"stackKey":"titan","maxStacks":25},{"op":"buff","to":"self","stat":"ap","value":4.0,"stackKey":"titan2","maxStacks":25}],"src":"item:TitansResolve_Radiant","text":"泰坦疊加"}],"desc":"聖光版：護甲 +40、攻速 +20%。攻擊或受傷時，攻擊與法術強度 +4%，最多 25 層。","simplified":"疊滿 25 層後的最大生命加成與「無法阻擋」沒做。"},{"key":"MorellonomiconRadiant","zh":"聖光黑魔禁書","radiant":true,"base":"Morellonomicon","stats":{"ap":35,"hp":300,"manaRegen":2},"passives":[{"on":"attack","ops":[{"op":"status","to":"current","kind":"burn","dur":10,"value":0.02},{"op":"status","to":"current","kind":"wound","dur":10,"value":0.33}],"src":"item:MorellonomiconRadiant","text":"灼燒"},{"on":"cast","ops":[{"op":"status","to":"current","kind":"burn","dur":10,"value":0.02},{"op":"status","to":"current","kind":"wound","dur":10,"value":0.33}],"src":"item:MorellonomiconRadiant","text":"灼燒"}],"desc":"聖光版：法術強度 +35、生命 +300、法力回復 +2。普攻與技能讓目標灼燒（每秒 2% 最大生命）與重傷 10 秒。","simplified":""},{"key":"ProtectorsVowRadiant","zh":"聖光保衛者之誓","radiant":true,"base":"ProtectorsVow","stats":{"armor":50,"manaRegen":2,"mr":50,"startMana":40},"passives":[{"on":"hpBelow","ops":[{"op":"mana","to":"self","value":30},{"op":"shield","to":"self","value":{"selfMaxHp":0.5}}],"src":"item:ProtectorsVowRadiant","text":"保衛者護盾","n":0.4,"limit":1}],"desc":"聖光版：護甲 +50、魔抗 +50、法力回復 +2。戰鬥開始獲得 40 法力；生命降至 40% 時，獲得 30 法力和 50% 最大生命的護盾。","simplified":"護盾持續時間官方沒寫，用預設值。"},{"key":"AdaptiveHelm_Radiant","zh":"聖光適性神盔","radiant":true,"base":"AdaptiveHelm","stats":{"manaRegen":6,"mr":40},"passives":[],"desc":"聖光版：法力回復 +6、魔抗 +40。從所有來源獲得的法力 +30%。依職業再加成：坦克與鬥士雙防 +80，其他人攻擊與法強 +35%。","simplified":"依職業的額外加成與「法力 +30%」引擎沒有對應寫法，沒做，只留基本數值。"},{"key":"HandOfJusticeRadiant","zh":"聖光正義手套","radiant":true,"base":"HandOfJustice","stats":{"adPct":0.7,"ap":70,"crit":0.4,"manaRegen":2,"omnivamp":0.25},"passives":[{"on":"hpBelow","ops":[{"op":"buff","to":"self","stat":"adPct","value":-0.35},{"op":"buff","to":"self","stat":"ap","value":-35},{"op":"buff","to":"self","stat":"omnivamp","value":0.25}],"src":"item:HandOfJusticeRadiant","text":"正義手套切換","n":0.5,"limit":1}],"desc":"聖光版：暴擊率 +40%、法力回復 +2。獲得兩項效果：攻擊 +35% 與法術強度 +35；全能吸血 +25%。生命高於 50% 時攻擊與法強加成翻倍；低於 50% 時全能吸血翻倍。","simplified":"生命高於 50% 時直接給雙倍攻擊與法強，第一次掉到 50% 以下就切成雙倍全能吸血，之後回血也不會切回來。"},{"key":"BrambleVestRadiant","zh":"聖光刺藤胸甲","radiant":true,"base":"BrambleVest","stats":{"armor":100,"dr":0.1,"hpPct":0.12},"passives":[{"on":"every","ops":[{"op":"damage","to":{"adjacent":"enemy"},"type":"magic","value":{"flat":200}}],"src":"item:BrambleVestRadiant","text":"刺藤反傷","n":2}],"desc":"聖光版：護甲 +100、最大生命 ×1.12。承受的普攻傷害 -10%；被普攻命中時，對相鄰敵人造成 200 魔法傷害（冷卻 2 秒）。","simplified":"普攻減傷這裡當成全部傷害減傷；反傷簡化成每 2 秒固定打一次相鄰敵人（官方是被普攻命中、冷卻 2 秒）。"},{"key":"DragonsClawRadiant","zh":"聖光龍之爪","radiant":true,"base":"DragonsClaw","stats":{"hpPct":0.28,"mr":120},"passives":[{"on":"every","ops":[{"op":"heal","to":"self","value":{"selfMaxHp":0.05}}],"src":"item:DragonsClawRadiant","text":"龍爪回血","n":2}],"desc":"聖光版：魔抗 +120、最大生命 ×1.28。每 2 秒回復 5% 最大生命。","simplified":""},{"key":"EvenshroudRadiant","zh":"聖光均等法衣","radiant":true,"base":"Evenshroud","stats":{"hp":500,"mr":40},"passives":[{"on":"every","ops":[{"op":"status","to":{"around":"self","r":3},"kind":"sunder","dur":1.5,"value":0.3}],"src":"item:EvenshroudRadiant","text":"破甲","n":1},{"on":"start","ops":[{"op":"buff","to":"self","stat":"armor","value":50,"dur":20},{"op":"buff","to":"self","stat":"mr","value":50,"dur":20}],"src":"item:EvenshroudRadiant","text":"戰鬥開始雙防"}],"desc":"聖光版：生命 +500、魔抗 +40。3 格內的敵人護甲 -30%。戰鬥開始後 20 秒內，護甲與魔抗各 +50。","simplified":""},{"key":"QuicksilverRadiant","zh":"聖光水銀兜帽","radiant":true,"base":"Quicksilver","stats":{"asPct":0.4,"crit":0.4,"mr":40},"passives":[{"on":"start","ops":[{"op":"status","to":"self","kind":"ccImmune","dur":45}],"src":"item:QuicksilverRadiant","text":"無人能擋"},{"on":"every","ops":[{"op":"buff","to":"self","stat":"asPct","value":0.06,"stackKey":"quicksilver","maxStacks":99}],"src":"item:QuicksilverRadiant","text":"疊攻速","n":1}],"desc":"聖光版：攻速 +40%、暴擊率 +40%、魔抗 +40。戰鬥開始 45 秒免疫控制（無人能擋）；每秒攻速 +6%，可疊加。","simplified":"官方的「無人能擋」簡化成免疫暈眩與緩速。"}]},"augments":{"augments":[{"key":"DA_SmallGrabBag","zh":"小型禮包","tier":1,"sp":13,"desc":"選到就拿 2 個隨機散件。","effects":[],"onPick":{"components":2},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_CognitiveTax","zh":"智商稅","tier":1,"sp":24,"desc":"選到就拿 8 金幣和 1 經驗。","effects":[],"onPick":{"gold":8,"xp":1},"guess":false,"stages":["2-1"]},{"key":"DA_RollingForDays","zh":"抽好抽滿","tier":1,"sp":19,"desc":"選到就拿 10 次免費刷新。","effects":[],"onPick":{"rerolls":10},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_ItemGrabBag","zh":"道具組合包I","tier":1,"sp":53,"desc":"選到就拿 1 件隨機成品裝備。","effects":[],"onPick":{"completed":1},"guess":false,"stages":["2-1"]},{"key":"DA_KickStart","zh":"加速開始","tier":1,"sp":7,"desc":"選到就拿 1 隻 2 星 2 費棋子和 1 金幣。","effects":[],"onPick":{"units":[{"cost":2,"star":2,"n":1}],"gold":1},"guess":false,"stages":["2-1"]},{"key":"DA_SilverSpoon","zh":"銀湯匙","tier":1,"sp":57,"desc":"選到就拿 10 經驗。","effects":[],"onPick":{"xp":10},"guess":false,"stages":["2-1"]},{"key":"DA_PartialAscension","zh":"不完全飛昇","tier":1,"sp":3,"desc":"開戰 12 秒後，全隊傷害增幅 +20%。","effects":[{"type":"teamPassive","passive":{"on":"start","at":12,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"dmgAmp","value":0.2}],"src":"aug:DA_PartialAscension","text":"不完全飛昇"}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_StandUnited","zh":"並肩作戰","tier":1,"sp":4,"desc":"每個啟動中的非獨特羈絆，全隊攻擊 +1.5%、法強 +1.5。","effects":[{"type":"statPerActiveTrait","who":"team","stats":{"adPct":0.015,"ap":1.5}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_BoxingLessons","zh":"拳擊訓練","tier":1,"sp":20,"desc":"戰鬥開始時，前排（前 2 排）每有 1 隻棋子，全隊生命 +30。","effects":[{"type":"stat","who":"team","perFrontRow":true,"stats":{"hp":30}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_FocusedFire","zh":"集中火力","tier":1,"sp":64,"desc":"全隊攻擊 +10%，之後每 5 秒再 +4%。","effects":[{"type":"stat","who":"team","stats":{"adPct":0.1}},{"type":"teamPassive","passive":{"on":"every","n":5,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"adPct","value":0.04,"stackKey":"focus"}],"src":"aug:DA_FocusedFire","text":"集中火力"}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_MakeshiftArmorI","zh":"臨時戰甲I","tier":1,"sp":46,"desc":"沒有裝備的棋子，護甲、魔抗各 +30。","effects":[{"type":"stat","who":"noItems","stats":{"armor":30,"mr":30}}],"onPick":{},"guess":false,"stages":["3-2"]},{"key":"DA_CelestialBlessingI","zh":"天賜聖典 I","tier":1,"sp":10,"desc":"全隊全能吸血 +12%。（本頁簡化：官方溢補的治療會變成護盾，護盾上限 200 生命，這裡沒做。）","effects":[{"type":"stat","who":"team","stats":{"omnivamp":0.12}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_TradeSector","zh":"交易之星","tier":2,"sp":73,"desc":"每回合 1 次免費刷新，選到再拿 2 金幣。","effects":[{"type":"rule","key":"freeRerollPerRound","value":1}],"onPick":{"gold":2},"guess":false,"stages":["2-1"]},{"key":"DA_Hustler","zh":"私房錢","tier":2,"sp":140,"desc":"沒有利息，但每回合開始拿 3 金幣，選到就先拿 3。","effects":[{"type":"rule","key":"interestCap","value":0},{"type":"rule","key":"roundStartGold","value":3}],"onPick":{"gold":3},"guess":false,"stages":["2-1"]},{"key":"DA_PatientStudy","zh":"耐心學習","tier":2,"sp":144,"desc":"贏了拿 2 經驗，輸了拿 3 經驗。","effects":[{"type":"econ","when":"win","gain":{"xp":2}},{"type":"econ","when":"lose","gain":{"xp":3}}],"onPick":{},"guess":false,"stages":["2-1"]},{"key":"DA_CognitiveOverload","zh":"認知超載","tier":2,"sp":156,"desc":"選到就拿 7 金幣、1 經驗、1 次刷新，加 4 隻棋子（2 星 1 費、2 費、兩隻 3 費）。","effects":[],"onPick":{"gold":7,"xp":1,"rerolls":1,"units":[{"cost":1,"star":2,"n":1},{"cost":2,"star":1,"n":1},{"cost":3,"star":1,"n":2}]},"guess":false,"stages":["3-2"]},{"key":"DA_Swordsmith","zh":"劍匠","tier":2,"sp":79,"desc":"選到就拿 1 件含暴風之劍的隨機成品裝備，1 回合後再拿 1 件。（本頁簡化：選到就一次拿 2 件。）","effects":[],"onPick":{"completed":2,"completedFrom":"BFSword"},"guess":false,"stages":["4-2"]},{"key":"DA_PlotArmor","zh":"主角威能","tier":2,"sp":72,"desc":"全隊雙抗 +10；生命低於 50% 時，雙抗提高到 40（再 +30），持續到戰鬥結束。","effects":[{"type":"stat","who":"team","stats":{"armor":10,"mr":10}},{"type":"teamPassive","passive":{"on":"hpBelow","n":0.5,"limit":1,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"armor","value":30},{"op":"buff","to":{"allies":"all"},"stat":"mr","value":30}],"src":"aug:DA_PlotArmor","text":"主角威能"}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_BodyguardTraining","zh":"保鑣訓練","tier":2,"sp":75,"desc":"全隊護甲、魔抗 +15，每個玩家等級再 +2。","effects":[{"type":"stat","who":"team","stats":{"armor":15,"mr":15}},{"type":"statPerLevel","who":"team","stats":{"armor":2,"mr":2}}],"onPick":{},"guess":false,"stages":["2-1"]},{"key":"DA_Ascension","zh":"飛昇","tier":2,"sp":177,"desc":"開戰 12 秒後，全隊傷害增幅 +35%。","effects":[{"type":"teamPassive","passive":{"on":"start","at":12,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"dmgAmp","value":0.35}],"src":"aug:DA_Ascension","text":"飛昇"}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_ClockworkAccelerator","zh":"發條加速器","tier":2,"sp":136,"desc":"戰鬥中每 3 秒，全隊攻速 +12%，可疊加。","effects":[{"type":"teamPassive","passive":{"on":"every","n":3,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"asPct","value":0.12,"stackKey":"clock"}],"src":"aug:DA_ClockworkAccelerator","text":"發條加速"}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_TonsOfStatsI","zh":"能力值大補包","tier":2,"sp":145,"desc":"全隊生命 +44、攻擊 +4%、法強 +4、雙抗 +4、攻速 +4%、法力回復 +4。","effects":[{"type":"stat","who":"team","stats":{"hp":44,"adPct":0.04,"ap":4,"armor":4,"mr":4,"asPct":0.04,"manaRegen":4}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_GlassCannon_Gold","zh":"玻璃大砲II","tier":2,"sp":132,"desc":"後排棋子生命 -20%，傷害增幅 +25%。","effects":[{"type":"stat","who":"backRows","stats":{"hpPct":-0.2,"dmgAmp":0.25}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_ArcaneViktory","zh":"奧術：維克特必勝","tier":2,"sp":91,"desc":"開戰 8 秒暈眩敵方全隊 1.5 秒，18 秒再來一次。","effects":[{"type":"teamPassive","passive":{"on":"start","at":8,"ops":[{"op":"stun","to":"allEnemies","dur":1.5}],"src":"aug:DA_ArcaneViktory","text":"維克特必勝"}},{"type":"teamPassive","passive":{"on":"start","at":18,"ops":[{"op":"stun","to":"allEnemies","dur":1.5}],"src":"aug:DA_ArcaneViktory","text":"維克特必勝"}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_FrontlineFoundation","zh":"前線基礎","tier":2,"sp":78,"desc":"選到就拿 1 隻 2 星 1 費棋子和 1 個散件。（本頁簡化：官方是坦克棋子加職業徽章。）","effects":[],"onPick":{"units":[{"cost":1,"star":2,"n":1}],"components":1},"guess":true,"stages":["2-1"]},{"key":"DA_BacklineBlueprint","zh":"後排藍圖","tier":2,"sp":99,"desc":"選到就拿 1 隻 3 費棋子和 1 個散件。（本頁簡化：官方是非坦克棋子加職業徽章。）","effects":[],"onPick":{"units":[{"cost":3,"star":1,"n":1}],"components":1},"guess":true,"stages":["2-1"]},{"key":"DA_MoneyMonsoon","zh":"天外橫財","tier":3,"sp":190,"desc":"現在和每回合結束都拿 7 金幣。","effects":[{"type":"econ","when":"roundEnd","gain":{"gold":7}}],"onPick":{"gold":7},"guess":false,"stages":["4-2"]},{"key":"DA_UpwardMobility","zh":"向上流動","tier":3,"sp":187,"desc":"買經驗少 1 金幣，每次升級送 2 次刷新。（官方升級還會回 2 點血，本頁血量是命數，本頁簡化沒做。）","effects":[{"type":"rule","key":"xpCostDelta","value":-1},{"type":"rule","key":"levelUpRerolls","value":2}],"onPick":{},"guess":true,"stages":["2-1"]},{"key":"DA_InvestmentStrategy","zh":"投資策略II","tier":3,"sp":203,"desc":"利息上限提高 2，選到就拿 6 金幣。之後每賺 1 點利息，全隊永久 +10 生命。","effects":[{"type":"rule","key":"interestCap","value":7},{"type":"rule","key":"interestHp","value":10}],"onPick":{"gold":6},"guess":false,"stages":["2-1"]},{"key":"DA_TonsOfStatsII","zh":"能力值大補包II","tier":3,"sp":227,"desc":"全隊生命 +88、攻擊 +8%、法強 +8、雙抗 +8、攻速 +8%、法力回復 +8。","effects":[{"type":"stat","who":"team","stats":{"hp":88,"adPct":0.08,"ap":8,"armor":8,"mr":8,"asPct":0.08,"manaRegen":8}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_GiantAndMighty","zh":"巨大強悍","tier":3,"sp":196,"desc":"全隊生命 +225，再 +10%。","effects":[{"type":"stat","who":"team","stats":{"hp":225,"hpPct":0.1}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_BaronsLair","zh":"巴龍巢穴","tier":3,"sp":197,"desc":"選到就拿 1 件隨機坦克成品裝備。開戰 8 秒後，全隊每秒攻擊 +4%、法強 +4（官方是 4% 魔攻），一直疊到戰鬥結束。","effects":[{"type":"teamPassive","passive":{"on":"every","n":1,"from":8,"ops":[{"op":"buff","to":{"allies":"all"},"stat":"adPct","value":0.04},{"op":"buff","to":{"allies":"all"},"stat":"ap","value":4}],"src":"aug:DA_BaronsLair","text":"巴龍巢穴"}}],"onPick":{"tankItem":["BrambleVest","DragonsClaw","GargoyleStoneplate","SunfireCape","WarmogsArmor","SteadfastHeart","ProtectorsVow"]},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_JeweledLotus_II","zh":"珠光蓮花II","tier":3,"sp":215,"desc":"全隊暴擊率 +25%、暴擊傷害 +10%，技能可以暴擊。","effects":[{"type":"stat","who":"team","stats":{"crit":0.25,"critDmg":0.1,"abilityCrit":true}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_HoldTheLine","zh":"堅守前線","tier":3,"sp":189,"desc":"戰鬥開始時，前排（前 2 排）每有 1 隻棋子，後面兩排的棋子攻擊 +11%、法強 +11。","effects":[{"type":"stat","who":"backRows","perFrontRow":true,"stats":{"adPct":0.11,"ap":11}}],"onPick":{},"guess":false,"stages":["3-2","4-2"]},{"key":"DA_TraitLadder","zh":"特性階梯","tier":3,"sp":214,"desc":"人口上限 +1。（本頁簡化：官方是徽章加羈絆數量獎勵，這裡換成人口 +1。）","effects":[{"type":"teamSize","value":1}],"onPick":{},"guess":true,"stages":["2-1"]},{"key":"DA_HardCommit","zh":"強力投入","tier":3,"sp":198,"desc":"選到就拿 1 隻 3 費、1 隻 2 費棋子和 3 金幣。（本頁簡化：官方是徽章，而且每個階段都再給一次。）","effects":[],"onPick":{"units":[{"cost":3,"star":1,"n":1},{"cost":2,"star":1,"n":1}],"gold":3},"guess":true,"stages":["2-1"]}]},"rules":{"_doc":{"rounds":"pre：回合開始前的事件。startGift＝開局禮（用 start.freeUnitCost／start.components，不要重複發）；components＝送 n 散件；augment＝第幾次增幅（1、2、3＝正式遊戲的 2-1、3-2、4-2；稀有度開局抽一組，見 augment.tierCombos），3 選 1，每張可免費重抽一次；bossReward＝打贏第 N 隻頭目的獎勵（輸了只拿 1 散件，見 bossReward）。","enemy":"count 人數；maxCost 最高費用；star.base 預設星級；star.costStar{費用:星級} 覆寫該費用星級；star.lowestStar2＝費用最低的 n 隻 2★；star.halfStar2＝一半的棋子 2★（費用高的優先）；items＝全隊合計裝備件數（先給 prio 小的）；componentOnly 由 enemyItemComponentUntil 決定；hpMult／dmgMult＝難度旋鈕。","boss":"頭目回合 enemy 為 null，改看 bosses[boss-1]。boss.bossHp／bossDmg 乘在頭目本體；minions 正常；extraPassives 掛在頭目本體（on/ops 格式同 SPEC 2.4 Passive）；expectTraits 只是檢查用。pos＝[r,c]，r 0 是敵方前排，c 0–6。","augment":"enabled＝增幅總開關（false＝整個關閉：不跳三選一、不抽稀有度、已選的增幅不生效；改回 true 就恢復）；tierCombos 每列＝[第 1 次, 第 2 次, 第 3 次, 份數]（1 銀 2 金 3 彩；份數總和 109）；stages＝三次增幅對應的正式遊戲回合；每個增幅的 stages 欄位決定它會在哪幾次出現","economy":"v11：站主說裝備很難合、錢不夠，所以放寬經濟。start.gold 4→8；start.components 1→3（開局 3 件散件）；income.base 5→7；rounds 第 2、4、8、13、18、23、28 回合各多送 1 件散件（原本是單數回合送，現在更早更密）；bossReward.winComponents＝打贏頭目的獎勵之外再多給的散件數。　難度：增幅關掉後變難、錢和散件變多又變簡單，兩邊一起算後，第 10 回合起的一般回合敵人 hpMult／dmgMult 全部 ×1.10（第 1–9 回合不動，頭目不動）。　v12：站主「多點自選的散件，不要一堆垃圾合不起來」→ componentChoice:true，開局、回合送、頭目送的散件都變「自選散件」（點開挑），教學頁關掉；變簡單了，第 10 回合起一般回合敵人再 ×1.06（basic bot 57.3%→46.3%）。　v14：94 隻技能照官方描述重做（真的位移、投射物、場上物件）後重新量過，basic bot 48.7%、懶人 bot 平均結束回合 7.7，都落在目標內，所以敵人強度沒有再調。　v15：站主「前五個裝備不要是鐵砧，然後第19個之後的裝備給聖光成裝」→ itemDrops：白送的裝備第 1～5 件直接給散件（挑能跟落單散件合的）、6～18 件鐵砧、19 件起聖光成裝（items.json radiant，屬性加倍）；變簡單（basic 66%），第 10 回合起一般回合敵人再 ×1.08（basic 49.7%）。"},"shopOdds":{"1":[100,0,0,0,0],"2":[100,0,0,0,0],"3":[75,25,0,0,0],"4":[55,30,15,0,0],"5":[45,33,20,2,0],"6":[30,40,25,5,0],"7":[19,30,40,10,1],"8":[17,24,32,24,3],"9":[15,18,25,30,12],"10":[5,10,20,40,25]},"pool":{"1":30,"2":25,"3":18,"4":10,"5":9},"xpToNext":{"1":2,"2":2,"3":6,"4":10,"5":20,"6":36,"7":48,"8":76,"9":84},"maxLevel":10,"xpCost":4,"xpPerBuy":4,"rerollCost":2,"xpPerRound":2,"shopSlots":5,"start":{"gold":8,"level":1,"lives":3,"freeUnitCost":1,"components":3},"income":{"base":7,"interestPer":10,"interestCap":5,"win":1,"streak":[[2,1],[4,2],[5,3]]},"benchSize":9,"componentChoice":true,"itemDrops":{"directUntil":5,"radiantFrom":19},"itemBenchSize":10,"maxItems":3,"sellPrice":{"star2Mult":3,"star3Mult":9,"minus":1},"sevenCost":{"key":7,"sellPrice":7,"bossRewardChoices":["BaronNashor","Rakan","Smeech","Sona"]},"retryOnLose":false,"enemyItemComponentUntil":5,"bossReward":{"winOnly":true,"loseGain":{"components":1},"options":[{"kind":"completed","choices":3},{"kind":"gold","n":8},{"kind":"unit","top":true,"star":1,"components":1}],"sevenCostBosses":[4,5],"winComponents":1},"augment":{"enabled":false,"rerollsPerChoice":1,"choices":3,"stages":["2-1","3-2","4-2"],"tierCombos":[[2,2,2,22],[2,1,2,18],[1,2,2,12],[2,2,3,12],[2,3,2,10],[2,3,1,6],[1,1,2,5],[1,1,3,5],[1,2,3,5],[3,1,2,4],[2,1,3,2],[3,2,2,2],[3,3,3,1],[3,1,3,1],[1,3,3,1],[2,3,3,1],[3,2,3,1],[3,3,2,1]]},"rounds":[{"n":1,"type":"normal","pre":{"startGift":true},"enemy":{"count":1,"maxCost":1,"star":{"base":1},"items":0,"hpMult":0.642,"dmgMult":0.642}},{"n":2,"type":"normal","pre":{"augment":1,"components":1},"enemy":{"count":2,"maxCost":1,"star":{"base":1},"items":0,"hpMult":0.749,"dmgMult":0.749}},{"n":3,"type":"normal","pre":{"components":1},"enemy":{"count":3,"maxCost":2,"star":{"base":1},"items":0,"hpMult":0.802,"dmgMult":0.802}},{"n":4,"type":"normal","pre":{"components":1},"enemy":{"count":4,"maxCost":2,"star":{"base":1},"items":1,"hpMult":0.696,"dmgMult":0.696}},{"n":5,"type":"boss","boss":1,"pre":{"components":1},"enemy":null},{"n":6,"type":"normal","pre":{"bossReward":1},"enemy":{"count":4,"maxCost":3,"star":{"base":1,"lowestStar2":2},"items":1,"hpMult":0.642,"dmgMult":0.642}},{"n":7,"type":"normal","pre":{"components":1},"enemy":{"count":5,"maxCost":3,"star":{"base":1,"lowestStar2":2},"items":1,"hpMult":0.663,"dmgMult":0.663}},{"n":8,"type":"normal","pre":{"components":1},"enemy":{"count":5,"maxCost":3,"star":{"base":1,"halfStar2":true},"items":2,"hpMult":0.642,"dmgMult":0.642}},{"n":9,"type":"normal","pre":{"components":1},"enemy":{"count":5,"maxCost":3,"star":{"base":2},"items":2,"hpMult":0.535,"dmgMult":0.535}},{"n":10,"type":"boss","boss":2,"pre":{},"enemy":null},{"n":11,"type":"normal","pre":{"bossReward":2,"augment":2},"enemy":{"count":6,"maxCost":4,"star":{"base":2,"costStar":{"4":1}},"items":2,"hpMult":0.885,"dmgMult":0.885}},{"n":12,"type":"normal","pre":{"components":1},"enemy":{"count":6,"maxCost":4,"star":{"base":2,"costStar":{"4":1}},"items":3,"hpMult":0.858,"dmgMult":0.858}},{"n":13,"type":"normal","pre":{"components":1},"enemy":{"count":6,"maxCost":4,"star":{"base":2},"items":3,"hpMult":0.7,"dmgMult":0.7}},{"n":14,"type":"normal","pre":{"components":1},"enemy":{"count":7,"maxCost":4,"star":{"base":2},"items":3,"hpMult":0.657,"dmgMult":0.657}},{"n":15,"type":"boss","boss":3,"pre":{},"enemy":null},{"n":16,"type":"normal","pre":{"bossReward":3},"enemy":{"count":7,"maxCost":5,"star":{"base":2,"costStar":{"5":1}},"items":4,"hpMult":0.644,"dmgMult":0.644}},{"n":17,"type":"normal","pre":{"components":1},"enemy":{"count":7,"maxCost":5,"star":{"base":2,"costStar":{"5":1}},"items":5,"hpMult":0.671,"dmgMult":0.629}},{"n":18,"type":"normal","pre":{"components":1},"enemy":{"count":8,"maxCost":5,"star":{"base":2},"items":5,"hpMult":0.556,"dmgMult":0.529}},{"n":19,"type":"normal","pre":{"components":1},"enemy":{"count":8,"maxCost":5,"star":{"base":2},"items":6,"hpMult":0.644,"dmgMult":0.571}},{"n":20,"type":"boss","boss":4,"pre":{},"enemy":null},{"n":21,"type":"normal","pre":{"bossReward":4,"augment":3},"enemy":{"count":8,"maxCost":5,"star":{"base":2},"items":6,"hpMult":0.714,"dmgMult":0.615}},{"n":22,"type":"normal","pre":{"components":1},"enemy":{"count":8,"maxCost":5,"star":{"base":2},"items":6,"hpMult":0.657,"dmgMult":0.529}},{"n":23,"type":"normal","pre":{"components":1},"enemy":{"count":9,"maxCost":5,"star":{"base":2},"items":7,"hpMult":0.644,"dmgMult":0.514}},{"n":24,"type":"normal","pre":{"components":1},"enemy":{"count":9,"maxCost":5,"star":{"base":2},"items":8,"hpMult":0.657,"dmgMult":0.514}},{"n":25,"type":"boss","boss":5,"pre":{},"enemy":null},{"n":26,"type":"normal","pre":{"bossReward":5},"enemy":{"count":9,"maxCost":5,"star":{"base":2,"costStar":{"1":3,"2":3}},"items":9,"hpMult":0.629,"dmgMult":0.499}},{"n":27,"type":"normal","pre":{"components":1},"enemy":{"count":9,"maxCost":5,"star":{"base":2,"costStar":{"1":3,"2":3}},"items":9,"hpMult":0.687,"dmgMult":0.499}},{"n":28,"type":"normal","pre":{"components":1},"enemy":{"count":9,"maxCost":5,"star":{"base":2,"costStar":{"1":3,"2":3}},"items":9,"hpMult":0.729,"dmgMult":0.499}},{"n":29,"type":"normal","pre":{"components":1},"enemy":{"count":9,"maxCost":5,"star":{"base":2,"costStar":{"1":3,"2":3}},"items":9,"hpMult":0.8,"dmgMult":0.499}},{"n":30,"type":"boss","boss":6,"pre":{},"enemy":null}],"bosses":[{"id":1,"round":5,"name":"開場嘉賓・阿姆姆","theme":"情緒搖滾","mechanic":"每 7 秒對最近 3 名敵人暈眩 1 秒，並造成 80 魔法傷害。","hint":"陣型分散站，別讓三隻同時被點到；單體輸出集中打他。","boss":{"key":"Amumu","star":2,"bossHp":1.7,"bossDmg":0.65,"ccCap":0.5,"slotsScale":1.3,"pos":[0,3],"items":[]},"minions":[],"extraPassives":[{"on":"every","n":7,"src":"unit","text":"開場嘉賓的見面禮","ops":[{"op":"damage","to":{"nearest":3},"type":"magic","value":80},{"op":"stun","to":"prev","dur":1}]}],"expectTraits":{"Emo":1}},{"id":2,"round":10,"name":"殺五社・魔鬥凱薩","theme":"殺五社","mechanic":"殺五社處決：你的第一隻掉到 10% 以下的棋子會被處決，原地冒出食屍鬼。頭目每 10 秒對全體敵人造成 120 魔法傷害。","hint":"殺五社 3 隻就會啟動，先看清楚誰會被處決；別讓脆皮先掉血。","boss":{"key":"Mordekaiser","star":2,"bossHp":3,"bossDmg":1,"ccCap":0.5,"slotsScale":1.3,"pos":[0,3],"items":[]},"minions":[{"key":"Gnar","star":2,"pos":[1,2],"items":[]},{"key":"Olaf","star":2,"pos":[0,4],"items":[]},{"key":"Karthus","star":2,"pos":[3,3],"items":[]}],"extraPassives":[{"on":"every","n":10,"src":"unit","text":"凱薩的鐵鎖","ops":[{"op":"damage","to":"allEnemies","type":"magic","value":120}]}],"expectTraits":{"Pentakill":3},"hpMult":0.48,"dmgMult":0.48},{"id":3,"round":15,"name":"K/DA 舞台・阿璃","theme":"K/DA","mechanic":"K/DA 的歌：開場和第 8 秒，全隊各拿一次護盾和攻速。","hint":"K/DA 看的是總星數，6 隻 2★ 就是 12。8 秒前盡量搶輸出。","boss":{"key":"Ahri","star":2,"bossHp":2.5,"bossDmg":1,"ccCap":0.5,"slotsScale":1.3,"pos":[3,3],"items":[]},"minions":[{"key":"Gragas","star":2,"pos":[0,3],"items":[]},{"key":"Lillia","star":2,"pos":[0,4],"items":[]},{"key":"Evelynn","star":2,"pos":[1,2],"items":[]},{"key":"KaiSa","star":2,"pos":[3,2],"items":[]},{"key":"Neeko","star":2,"pos":[3,4],"items":[]}],"extraPassives":[{"on":"start","at":0,"limit":1,"src":"unit","text":"K/DA 的歌","ops":[{"op":"shield","to":{"allies":"all"},"value":{"selfMaxHp":0.1},"dur":4},{"op":"buff","to":{"allies":"all"},"stat":"asPct","value":0.3,"dur":4}]},{"on":"start","at":8,"limit":1,"src":"unit","text":"K/DA 的歌（第二段）","ops":[{"op":"shield","to":{"allies":"all"},"value":{"selfMaxHp":0.1},"dur":4},{"op":"buff","to":{"allies":"all"},"stat":"asPct","value":0.3,"dur":4}]}],"expectTraits":{"KDA":10},"hpMult":0.71,"dmgMult":0.71},{"id":4,"round":20,"name":"心鋼之聲・亞菲利歐","theme":"心鋼之聲","mechanic":"亞菲利歐每攻擊 4 次，攻擊力 +10%，可以疊。","hint":"他站在最後排角落，要想辦法切過去；心鋼成員身上的裝備越多越強。","boss":{"key":"Aphelios","star":2,"bossHp":2.2,"bossDmg":1,"ccCap":0.5,"slotsScale":1.3,"pos":[3,0],"items":[]},"minions":[{"key":"Sett","star":2,"pos":[0,2],"items":[]},{"key":"KSante","star":2,"pos":[0,3],"items":[]},{"key":"Yone","star":2,"pos":[1,4],"items":[]},{"key":"Ezreal","star":2,"pos":[3,2],"items":[]},{"key":"Alune","star":2,"pos":[3,3],"items":[]},{"key":"Kayn","star":2,"pos":[1,1],"items":[]}],"extraPassives":[{"on":"attack","n":4,"src":"unit","text":"越唱越大聲","ops":[{"op":"buff","to":"self","stat":"adPct","value":0.1,"stackKey":"bossAphelios","maxStacks":20}]}],"expectTraits":{"Heartsteel":7},"hpMult":0.64,"dmgMult":0.64},{"id":5,"round":25,"name":"True Damage・阿卡莉","theme":"True Damage","mechanic":"頭目每次施放技能後，不可選取 1.5 秒。成員有 30% 真實傷害。","hint":"真實傷害不吃抗性，堆生命比堆雙抗有用。","boss":{"key":"AkaliTrueDamage","star":2,"bossHp":3,"bossDmg":1,"ccCap":0.5,"slotsScale":1.3,"pos":[1,3],"items":[]},"minions":[{"key":"Kennen","star":2,"pos":[0,2],"items":[]},{"key":"Ekko","star":2,"pos":[0,4],"items":[]},{"key":"Qiyana","star":2,"pos":[1,1],"items":[]},{"key":"Yasuo","star":2,"pos":[1,5],"items":[]},{"key":"Senna","star":2,"pos":[3,3],"items":[]}],"extraPassives":[{"on":"cast","src":"unit","text":"收工，下班","ops":[{"op":"status","to":"self","kind":"untargetable","dur":1.5}]}],"expectTraits":{"TrueDamage":5},"hpMult":1.06,"dmgMult":1.06},{"id":6,"round":30,"name":"一獸樂團・巴龍納什","theme":"一獸樂團","mechanic":"每 12 秒全場暈眩 1 秒。30 秒後進入加時。","hint":"7 費棋子的最終檢定：輸出要夠快，別拖進加時。","boss":{"key":"BaronNashor","star":2,"bossHp":3.5,"bossDmg":1.2,"ccCap":0.5,"slotsScale":1.3,"pos":[0,3],"items":[]},"minions":[{"key":"Smeech","star":1,"pos":[0,2],"items":[]},{"key":"Rakan","star":1,"pos":[1,4],"items":[]},{"key":"Sona","star":1,"pos":[3,3],"items":[]}],"extraPassives":[{"on":"every","n":12,"src":"unit","text":"巴龍的低音炮","ops":[{"op":"stun","to":"allEnemies","dur":1}]}],"expectTraits":{"OneMonsterBand":1},"hpMult":0.81,"dmgMult":0.81}],"score":{"win":{"base":100,"perRound":10,"perAlive":10,"timeCap":30,"perSecondUnder":2,"bossMult":3},"lose":{"mult":50}},"guess":true},"enemies":{"version":"s19-prepbe-1","comps":[{"id":"s19_true_damage_special_casout_375","name":"阿卡莉兌現","carrier":"AkaliTrueDamage","lv":9,"units":[{"key":"KSante","star":2,"items":["WarmogsArmor","Evenshroud","GargoyleStoneplate"],"pos":[0,6],"prio":1},{"key":"AkaliTrueDamage","star":2,"items":["HandOfJustice","JeweledGauntlet","ArchangelsStaff"],"pos":[1,1],"prio":2},{"key":"Galio","star":2,"items":[],"pos":[0,4],"prio":3},{"key":"Aphelios","star":2,"items":["RedBuff","GuinsoosRageblade","HextechGunblade"],"pos":[3,0],"prio":4},{"key":"Kayn","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Kennen","star":2,"items":[],"pos":[0,2],"prio":6},{"key":"Bard","star":2,"items":[],"pos":[3,2],"prio":7},{"key":"Yasuo","star":2,"items":["EdgeOfNight","Bloodthirster","Quicksilver"],"pos":[1,5],"prio":8},{"key":"NunuWillump","star":2,"items":["ThiefsGloves"],"pos":[1,3],"prio":9}]},{"id":"s19_how_to_locked_smeech","name":"斯米奇爵士","carrier":"Smeech","lv":9,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","ProtectorsVow","GargoyleStoneplate"],"pos":[0,4],"prio":1},{"key":"Smeech","star":2,"items":["Bloodthirster","TitansResolve","SteraksGage"],"pos":[1,2],"prio":2},{"key":"Galio","star":2,"items":[],"pos":[0,6],"prio":3},{"key":"Aphelios","star":2,"items":["GuinsoosRageblade","HextechGunblade","Deathblade"],"pos":[3,0],"prio":4},{"key":"Kayn","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Lillia","star":2,"items":[],"pos":[0,1],"prio":6},{"key":"Sett","star":2,"items":[],"pos":[0,2],"prio":7},{"key":"Lucian","star":2,"items":[],"pos":[3,2],"prio":8},{"key":"MissFortune","star":2,"items":["ThiefsGloves"],"pos":[3,6],"prio":9}]},{"id":"s19_edm_jax_reroll","name":"電音賈克斯","carrier":"Jax","lv":7,"units":[{"key":"KSante","star":2,"items":["GargoyleStoneplate","WarmogsArmor","SunfireCape"],"pos":[0,0],"prio":1},{"key":"Jax","star":3,"items":["GuinsoosRageblade","EdgeOfNight","ArchangelsStaff"],"pos":[1,0],"prio":2},{"key":"Leona","star":2,"items":[],"pos":[0,5],"prio":3},{"key":"Lillia","star":2,"items":[],"pos":[0,2],"prio":4},{"key":"Bard","star":2,"items":[],"pos":[3,0],"prio":5},{"key":"Galio","star":2,"items":[],"pos":[0,4],"prio":6},{"key":"Vi","star":2,"items":[],"pos":[0,3],"prio":7}]},{"id":"s19_full_jazz_b4l_alistar","name":"合作亞歷斯塔","carrier":"Alistar","lv":9,"units":[{"key":"Leona","star":2,"items":["BrambleVest","WarmogsArmor","GargoyleStoneplate"],"pos":[0,1],"prio":1},{"key":"Alistar","star":2,"items":["JeweledGauntlet","ArchangelsStaff","WarmogsArmor"],"pos":[0,3],"prio":2},{"key":"Galio","star":2,"items":[],"pos":[0,4],"prio":3},{"key":"Yuumi","star":2,"items":["BlueBuff","HextechGunblade","JeweledGauntlet"],"pos":[3,0],"prio":4},{"key":"Sett","star":2,"items":[],"pos":[0,5],"prio":5},{"key":"Gragas","star":2,"items":[],"pos":[0,2],"prio":6},{"key":"Illaoi","star":2,"items":[],"pos":[0,0],"prio":7},{"key":"Lucian","star":2,"items":[],"pos":[3,4],"prio":8},{"key":"MissFortune","star":2,"items":[],"pos":[3,6],"prio":9}]},{"id":"s19_classic_vladimir","name":"弗拉迪米爾燼","carrier":"Vladimir","lv":9,"units":[{"key":"Zac","star":2,"items":["WarmogsArmor","ProtectorsVow","AdaptiveHelm"],"pos":[0,3],"prio":1},{"key":"Vladimir","star":2,"items":["ArchangelsStaff","RabadonsDeathcap","JeweledGauntlet"],"pos":[1,2],"prio":2},{"key":"NunuWillump","star":2,"items":["VoidStaff","Morellonomicon"],"pos":[2,0],"prio":3},{"key":"Jhin","star":2,"items":["LastWhisper","GiantSlayer","Deathblade"],"pos":[3,0],"prio":4},{"key":"Taric","star":2,"items":[],"pos":[0,5],"prio":5},{"key":"Zoe","star":2,"items":[],"pos":[3,4],"prio":6},{"key":"Lucian","star":2,"items":[],"pos":[3,2],"prio":7},{"key":"Galio","star":2,"items":[],"pos":[0,1],"prio":8},{"key":"MissFortune","star":2,"items":[],"pos":[3,6],"prio":9}]},{"id":"s19_very_much_cards_mix","name":"逆命詭射","carrier":"TwistedFate","lv":9,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","ProtectorsVow","GargoyleStoneplate"],"pos":[0,4],"prio":1},{"key":"TwistedFate","star":2,"items":["GuinsoosRageblade","HextechGunblade","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"NunuWillump","star":2,"items":["ThiefsGloves"],"pos":[2,0],"prio":3},{"key":"Vi","star":2,"items":["Bloodthirster","SteraksGage","TitansResolve"],"pos":[0,1],"prio":4},{"key":"Illaoi","star":2,"items":[],"pos":[0,3],"prio":5},{"key":"Jax","star":2,"items":[],"pos":[0,2],"prio":6},{"key":"Braum","star":2,"items":[],"pos":[0,5],"prio":7},{"key":"Draven","star":2,"items":[],"pos":[3,6],"prio":8},{"key":"KaiSa","star":2,"items":[],"pos":[3,2],"prio":9}]},{"id":"s19_legendary_gu_feng","name":"古風李星","carrier":"LeeSin","lv":9,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","ProtectorsVow","GargoyleStoneplate"],"pos":[0,5],"prio":1},{"key":"LeeSin","star":2,"items":["Bloodthirster","SteraksGage","TitansResolve"],"pos":[0,2],"prio":2},{"key":"Wukong","star":2,"items":["ThiefsGloves"],"pos":[0,1],"prio":3},{"key":"Janna","star":2,"items":["GuinsoosRageblade","SpearOfShojin","GuinsoosRageblade"],"pos":[3,0],"prio":4},{"key":"Tibbers","star":2,"items":[],"pos":[0,3],"prio":5},{"key":"Alune","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Shyvana","star":2,"items":[],"pos":[0,4],"prio":7},{"key":"AkaliKDA","star":2,"items":[],"pos":[1,3],"prio":8},{"key":"Gwen","star":2,"items":["EdgeOfNight","Morellonomicon","VoidStaff"],"pos":[1,1],"prio":9}]},{"id":"s19_legndary_zeri_flex","name":"婕莉菲艾","carrier":"Zeri","lv":9,"units":[{"key":"Rell","star":2,"items":["WarmogsArmor","ProtectorsVow","GargoyleStoneplate"],"pos":[0,2],"prio":1},{"key":"Zeri","star":2,"items":["GuinsoosRageblade","HextechGunblade","GiantSlayer"],"pos":[3,0],"prio":2},{"key":"Leona","star":2,"items":[],"pos":[0,3],"prio":3},{"key":"Vi","star":2,"items":["Bloodthirster","SteraksGage","TitansResolve"],"pos":[0,1],"prio":4},{"key":"Gragas","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Jax","star":2,"items":[],"pos":[0,4],"prio":6},{"key":"Evelynn","star":2,"items":[],"pos":[0,6],"prio":7},{"key":"NunuWillump","star":2,"items":[],"pos":[3,6],"prio":8},{"key":"Pyke","star":2,"items":["ThiefsGloves"],"pos":[0,5],"prio":9}]},{"id":"s19_legendary_nidalee_flex","name":"奈德麗斯米奇","carrier":"Nidalee","lv":9,"units":[{"key":"Garen","star":2,"items":["GargoyleStoneplate","ProtectorsVow","AdaptiveHelm"],"pos":[0,3],"prio":1},{"key":"Nidalee","star":2,"items":["GuinsoosRageblade","HextechGunblade","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"DrMundo","star":2,"items":["WarmogsArmor","WarmogsArmor","SpiritVisage"],"pos":[0,2],"prio":3},{"key":"Smeech","star":2,"items":["Bloodthirster","SteraksGage","TitansResolve"],"pos":[1,3],"prio":4},{"key":"Lillia","star":2,"items":[],"pos":[0,1],"prio":5},{"key":"Lucian","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Leona","star":2,"items":[],"pos":[0,5],"prio":7},{"key":"Yone","star":2,"items":[],"pos":[0,4],"prio":8},{"key":"MissFortune","star":2,"items":[],"pos":[3,6],"prio":9}]},{"id":"s19_monkey_kong","name":"悟空剎雅","carrier":"Xayah","lv":8,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,3],"prio":1},{"key":"Xayah","star":2,"items":["GuinsoosRageblade","KrakensFury","Deathblade"],"pos":[3,0],"prio":2},{"key":"KSante","star":2,"items":[],"pos":[0,5],"prio":3},{"key":"Wukong","star":2,"items":["Bloodthirster","TitansResolve","SteraksGage"],"pos":[0,2],"prio":4},{"key":"Neeko","star":2,"items":[],"pos":[3,2],"prio":5},{"key":"Lucian","star":2,"items":[],"pos":[3,4],"prio":6},{"key":"Janna","star":2,"items":["Morellonomicon","SpearOfShojin"],"pos":[3,6],"prio":7},{"key":"LeeSin","star":2,"items":["ThiefsGloves"],"pos":[0,1],"prio":8}]},{"id":"s19_legendary_max_flex_cap","name":"塔莉雅好運姐","carrier":"Taliyah","lv":9,"units":[{"key":"Zac","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,3],"prio":1},{"key":"Taliyah","star":1,"items":["SpearOfShojin","JeweledGauntlet","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"Rell","star":2,"items":["SunfireCape","Evenshroud"],"pos":[0,2],"prio":3},{"key":"MissFortune","star":2,"items":["GuinsoosRageblade","Deathblade","GiantSlayer"],"pos":[3,6],"prio":4},{"key":"Taric","star":2,"items":[],"pos":[0,5],"prio":5},{"key":"Lucian","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Galio","star":2,"items":[],"pos":[0,1],"prio":7},{"key":"NunuWillump","star":2,"items":["ThiefsGloves"],"pos":[2,0],"prio":8},{"key":"Vi","star":2,"items":[],"pos":[0,4],"prio":9}]},{"id":"s19_kda_flex_duo","name":"阿璃K/DA","carrier":"Ahri","lv":8,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","ProtectorsVow","GargoyleStoneplate"],"pos":[0,2],"prio":1},{"key":"Ahri","star":2,"items":["SpearOfShojin","JeweledGauntlet","HextechGunblade"],"pos":[3,0],"prio":2},{"key":"Zac","star":2,"items":[],"pos":[0,6],"prio":3},{"key":"AkaliKDA","star":2,"items":["HandOfJustice","EdgeOfNight","RedBuff"],"pos":[1,0],"prio":4},{"key":"Lillia","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Taric","star":2,"items":[],"pos":[0,4],"prio":6},{"key":"Syndra","star":2,"items":[],"pos":[3,2],"prio":7},{"key":"DrMundo","star":2,"items":["ThiefsGloves"],"pos":[0,3],"prio":8}]},{"id":"s19_classic_jhin","name":"古典燼","carrier":"Jhin","lv":8,"units":[{"key":"Thresh","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,3],"prio":1},{"key":"Jhin","star":2,"items":["LastWhisper","Deathblade","GiantSlayer"],"pos":[3,0],"prio":2},{"key":"KSante","star":2,"items":[],"pos":[1,4],"prio":3},{"key":"Yuumi","star":2,"items":["BlueBuff","HextechGunblade","RabadonsDeathcap"],"pos":[3,6],"prio":4},{"key":"Illaoi","star":2,"items":[],"pos":[1,1],"prio":5},{"key":"Nasus","star":2,"items":[],"pos":[1,0],"prio":6},{"key":"Swain","star":2,"items":[],"pos":[1,5],"prio":7},{"key":"Vladimir","star":2,"items":["VoidStaff","Morellonomicon"],"pos":[1,2],"prio":8}]},{"id":"s19_jjinx","name":"主唱吉茵珂絲","carrier":"Jinx","lv":9,"units":[{"key":"Leona","star":2,"items":["Evenshroud","WarmogsArmor","GargoyleStoneplate"],"pos":[0,2],"prio":1},{"key":"Jinx","star":2,"items":["GuinsoosRageblade","Deathblade","GiantSlayer"],"pos":[3,0],"prio":2},{"key":"Galio","star":2,"items":[],"pos":[0,5],"prio":3},{"key":"Shyvana","star":2,"items":["Bloodthirster","TitansResolve","SteraksGage"],"pos":[0,1],"prio":4},{"key":"Elise","star":2,"items":[],"pos":[0,3],"prio":5},{"key":"Lillia","star":2,"items":[],"pos":[0,0],"prio":6},{"key":"Lucian","star":2,"items":[],"pos":[3,6],"prio":7},{"key":"DrMundo","star":2,"items":[],"pos":[0,4],"prio":8},{"key":"NunuWillump","star":2,"items":["ThiefsGloves"],"pos":[2,1],"prio":9}]},{"id":"s19_full_ionic_spark","name":"離子希瓦娜","carrier":"Shyvana","lv":9,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,2],"prio":1},{"key":"Shyvana","star":2,"items":["Bloodthirster","TitansResolve","SteraksGage"],"pos":[0,1],"prio":2},{"key":"Tibbers","star":2,"items":["ThiefsGloves"],"pos":[0,3],"prio":3},{"key":"Aurora","star":2,"items":["SpearOfShojin","Morellonomicon","VoidStaff"],"pos":[3,0],"prio":4},{"key":"Elise","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Annie","star":2,"items":[],"pos":[0,4],"prio":6},{"key":"Gragas","star":2,"items":[],"pos":[0,5],"prio":7},{"key":"Jinx","star":2,"items":[],"pos":[3,2],"prio":8},{"key":"Gwen","star":2,"items":["HandOfJustice","RabadonsDeathcap","ArchangelsStaff"],"pos":[1,1],"prio":9}]},{"id":"s19_tempo_arcanist","name":"奧術梅爾","carrier":"Mel","lv":9,"units":[{"key":"Swain","star":2,"items":["GargoyleStoneplate","WarmogsArmor","IonicSpark"],"pos":[0,3],"prio":1},{"key":"Mel","star":2,"items":["AdaptiveHelm","JeweledGauntlet","BlueBuff"],"pos":[3,0],"prio":2},{"key":"Rell","star":2,"items":["ThiefsGloves"],"pos":[0,1],"prio":3},{"key":"Vladimir","star":2,"items":["HandOfJustice","StrikersFlail","JeweledGauntlet"],"pos":[1,2],"prio":4},{"key":"Taric","star":2,"items":[],"pos":[1,5],"prio":5},{"key":"Ziggs","star":2,"items":[],"pos":[3,6],"prio":6},{"key":"Zoe","star":2,"items":[],"pos":[3,2],"prio":7},{"key":"Annie","star":2,"items":[],"pos":[0,5],"prio":8},{"key":"Renekton","star":2,"items":[],"pos":[0,0],"prio":9}]},{"id":"s19_too_fast_kayle","name":"殺五社凱爾","carrier":"Kayle","lv":8,"units":[{"key":"Yorick","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,0],"prio":1},{"key":"Kayle","star":2,"items":["GuinsoosRageblade","HextechGunblade","RedBuff"],"pos":[3,0],"prio":2},{"key":"Mordekaiser","star":2,"items":["ThiefsGloves"],"pos":[0,5],"prio":3},{"key":"Garen","star":2,"items":["Bloodthirster","SteraksGage"],"pos":[0,3],"prio":4},{"key":"Olaf","star":2,"items":[],"pos":[0,6],"prio":5},{"key":"Ziggs","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Karthus","star":2,"items":[],"pos":[0,2],"prio":7},{"key":"Viego","star":2,"items":[],"pos":[0,1],"prio":8}]},{"id":"s19_beach_graves","name":"海灘葛雷夫","carrier":"Graves","lv":9,"units":[{"key":"Zac","star":2,"items":["WarmogsArmor","ProtectorsVow","GargoyleStoneplate"],"pos":[0,1],"prio":1},{"key":"Graves","star":2,"items":["EdgeOfNight","Bloodthirster","TitansResolve"],"pos":[1,1],"prio":2},{"key":"Taric","star":2,"items":[],"pos":[0,3],"prio":3},{"key":"Ahri","star":2,"items":["BlueBuff","HextechGunblade","JeweledGauntlet"],"pos":[3,0],"prio":4},{"key":"Lucian","star":2,"items":[],"pos":[3,4],"prio":5},{"key":"Evelynn","star":2,"items":[],"pos":[0,5],"prio":6},{"key":"Syndra","star":2,"items":[],"pos":[3,2],"prio":7},{"key":"Taliyah","star":2,"items":[],"pos":[3,6],"prio":8},{"key":"Smeech","star":2,"items":["ThiefsGloves"],"pos":[1,3],"prio":9}]},{"id":"s19_league_of_draaaaven","name":"達瑞文凱莎","carrier":"Draven","lv":6,"units":[{"key":"Braum","star":3,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,1],"prio":1},{"key":"Draven","star":3,"items":["SpearOfShojin","InfinityEdge","Deathblade"],"pos":[3,0],"prio":2},{"key":"Illaoi","star":3,"items":[],"pos":[0,3],"prio":3},{"key":"KaiSa","star":3,"items":["SpearOfShojin","LastWhisper","HextechGunblade"],"pos":[3,2],"prio":4},{"key":"Sett","star":2,"items":[],"pos":[0,5],"prio":5},{"key":"Gragas","star":2,"items":[],"pos":[0,2],"prio":6}]},{"id":"s19_not_solo_evelynn","name":"凱莎伊芙琳","carrier":"KaiSa","lv":8,"units":[{"key":"Leona","star":2,"items":[],"pos":[0,0],"prio":1},{"key":"KaiSa","star":3,"items":["SpearOfShojin","LastWhisper","InfinityEdge"],"pos":[3,0],"prio":2},{"key":"Lillia","star":2,"items":[],"pos":[0,2],"prio":3},{"key":"Evelynn","star":3,"items":["HandOfJustice","RabadonsDeathcap","JeweledGauntlet"],"pos":[0,6],"prio":4},{"key":"Illaoi","star":2,"items":[],"pos":[0,4],"prio":5},{"key":"Samira","star":2,"items":[],"pos":[3,6],"prio":6},{"key":"Draven","star":2,"items":[],"pos":[3,2],"prio":7},{"key":"NunuWillump","star":2,"items":[],"pos":[2,0],"prio":8}]},{"id":"s19_full_potencial_reroll_kda","name":"K/DA妮可","carrier":"Neeko","lv":8,"units":[{"key":"Lillia","star":3,"items":["GargoyleStoneplate","WarmogsArmor","ProtectorsVow"],"pos":[0,0],"prio":1},{"key":"Neeko","star":3,"items":["SpearOfShojin","RabadonsDeathcap","JeweledGauntlet"],"pos":[3,0],"prio":2},{"key":"Gragas","star":3,"items":[],"pos":[0,4],"prio":3},{"key":"Evelynn","star":3,"items":[],"pos":[0,6],"prio":4},{"key":"Ezreal","star":2,"items":[],"pos":[3,2],"prio":5},{"key":"Malzahar","star":2,"items":[],"pos":[3,6],"prio":6},{"key":"Leona","star":2,"items":[],"pos":[0,2],"prio":7},{"key":"AkaliKDA","star":2,"items":[],"pos":[0,3],"prio":8}]},{"id":"s19_emo_seraphine","name":"瑟菈紛三星","carrier":"Seraphine","lv":8,"units":[{"key":"Amumu","star":3,"items":["WarmogsArmor","BrambleVest","DragonsClaw"],"pos":[0,3],"prio":1},{"key":"Seraphine","star":3,"items":["SpearOfShojin","JeweledGauntlet","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"Gragas","star":3,"items":["IonicSpark","ProtectorsVow"],"pos":[1,4],"prio":3},{"key":"Lillia","star":2,"items":[],"pos":[1,1],"prio":4},{"key":"Sett","star":2,"items":[],"pos":[1,0],"prio":5},{"key":"Illaoi","star":3,"items":[],"pos":[1,3],"prio":6},{"key":"Braum","star":3,"items":[],"pos":[1,2],"prio":7},{"key":"Leona","star":2,"items":[],"pos":[1,5],"prio":8}]},{"id":"s19_kayle_locke_duo_carry","name":"洛克凱爾","carrier":"Locke","lv":8,"units":[{"key":"Thresh","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,4],"prio":1},{"key":"Locke","star":2,"items":["HandOfJustice","JeweledGauntlet","EdgeOfNight"],"pos":[1,1],"prio":2},{"key":"Yorick","star":2,"items":["ThiefsGloves"],"pos":[0,2],"prio":3},{"key":"Kayle","star":2,"items":["GuinsoosRageblade","ArchangelsStaff","HextechGunblade"],"pos":[3,0],"prio":4},{"key":"Olaf","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Ziggs","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Swain","star":2,"items":[],"pos":[0,6],"prio":7},{"key":"Vladimir","star":2,"items":["VoidStaff","Morellonomicon"],"pos":[1,3],"prio":8}]},{"id":"s19_heartsteel_yone","name":"七心鋼犽凝","carrier":"Yone","lv":9,"units":[{"key":"KSante","star":2,"items":["WarmogsArmor","Evenshroud","SunfireCape"],"pos":[0,6],"prio":1},{"key":"Yone","star":2,"items":["HandOfJustice","EdgeOfNight","Quicksilver"],"pos":[0,5],"prio":2},{"key":"Leona","star":2,"items":["ThiefsGloves"],"pos":[0,4],"prio":3},{"key":"Alune","star":2,"items":["SpearOfShojin","VoidStaff","ArchangelsStaff"],"pos":[3,6],"prio":4},{"key":"Kayn","star":2,"items":[],"pos":[0,2],"prio":5},{"key":"Neeko","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Sett","star":2,"items":[],"pos":[0,0],"prio":7},{"key":"Ezreal","star":2,"items":[],"pos":[3,4],"prio":8},{"key":"Aphelios","star":2,"items":[],"pos":[3,0],"prio":9}]},{"id":"s19_tempo_bard","name":"爵士巴德","carrier":"Bard","lv":8,"units":[{"key":"Braum","star":3,"items":["WarmogsArmor","IonicSpark","GargoyleStoneplate"],"pos":[0,0],"prio":1},{"key":"Bard","star":3,"items":["SpearOfShojin","ArchangelsStaff","GuinsoosRageblade"],"pos":[3,0],"prio":2},{"key":"Galio","star":2,"items":[],"pos":[0,3],"prio":3},{"key":"Sett","star":2,"items":[],"pos":[0,4],"prio":4},{"key":"Taric","star":2,"items":[],"pos":[0,6],"prio":5},{"key":"Ashe","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Illaoi","star":2,"items":[],"pos":[0,2],"prio":7},{"key":"Zac","star":2,"items":[],"pos":[0,1],"prio":8}]},{"id":"s19_the_blood_hunter_briar","name":"離子布蕾爾","carrier":"Briar","lv":8,"units":[{"key":"Tibbers","star":3,"items":[],"pos":[0,2],"prio":1},{"key":"Briar","star":3,"items":["Bloodthirster","TitansResolve","SteraksGage"],"pos":[0,1],"prio":2},{"key":"Shyvana","star":2,"items":[],"pos":[0,4],"prio":3},{"key":"Jinx","star":2,"items":["LastWhisper","HextechGunblade","GuinsoosRageblade"],"pos":[3,0],"prio":4},{"key":"Elise","star":2,"items":[],"pos":[0,0],"prio":5},{"key":"Yunara","star":2,"items":[],"pos":[0,3],"prio":6},{"key":"Annie","star":2,"items":[],"pos":[0,6],"prio":7},{"key":"KSante","star":2,"items":[],"pos":[0,5],"prio":8}]},{"id":"s19_full_rock_music_idol","name":"七搖滾洛克","carrier":"Locke","lv":9,"units":[{"key":"Yorick","star":2,"items":["WarmogsArmor","GargoyleStoneplate","ProtectorsVow"],"pos":[0,0],"prio":1},{"key":"Locke","star":2,"items":["HandOfJustice","JeweledGauntlet","EdgeOfNight"],"pos":[1,0],"prio":2},{"key":"Swain","star":2,"items":[],"pos":[3,2],"prio":3},{"key":"Vayne","star":2,"items":["GiantSlayer","GuinsoosRageblade","HextechGunblade"],"pos":[3,0],"prio":4},{"key":"Gnar","star":2,"items":[],"pos":[0,6],"prio":5},{"key":"Olaf","star":2,"items":[],"pos":[0,4],"prio":6},{"key":"Ziggs","star":2,"items":[],"pos":[3,6],"prio":7},{"key":"Camille","star":2,"items":[],"pos":[1,2],"prio":8},{"key":"Pyke","star":2,"items":["ThiefsGloves"],"pos":[0,2],"prio":9}]},{"id":"s19_ziggs","name":"超流行希格斯","carrier":"Ziggs","lv":8,"units":[{"key":"Kobuko","star":3,"items":["WarmogsArmor","GargoyleStoneplate","GargoyleStoneplate"],"pos":[0,3],"prio":1},{"key":"Ziggs","star":3,"items":["AdaptiveHelm","JeweledGauntlet","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"Swain","star":2,"items":[],"pos":[2,5],"prio":3},{"key":"Tristana","star":3,"items":["GuinsoosRageblade","GiantSlayer","LastWhisper"],"pos":[3,4],"prio":4},{"key":"Camille","star":2,"items":[],"pos":[2,3],"prio":5},{"key":"Lulu","star":3,"items":["VoidStaff","Morellonomicon"],"pos":[3,2],"prio":6},{"key":"Locke","star":2,"items":[],"pos":[2,1],"prio":7},{"key":"Teemo","star":2,"items":[],"pos":[3,6],"prio":8}]},{"id":"s19_do_it_malzahar","name":"馬爾札哈巴龍","carrier":"Malzahar","lv":8,"units":[{"key":"Ekko","star":3,"items":["WarmogsArmor","SunfireCape","GargoyleStoneplate"],"pos":[0,2],"prio":1},{"key":"Malzahar","star":3,"items":["SpearOfShojin","ArchangelsStaff","JeweledGauntlet"],"pos":[3,0],"prio":2},{"key":"Braum","star":3,"items":["ThiefsGloves"],"pos":[0,5],"prio":3},{"key":"BaronNashor","star":2,"items":[],"pos":[1,1],"prio":4},{"key":"Kennen","star":2,"items":[],"pos":[0,1],"prio":5},{"key":"Sett","star":2,"items":[],"pos":[0,0],"prio":6},{"key":"Illaoi","star":2,"items":[],"pos":[0,6],"prio":7},{"key":"Leona","star":2,"items":[],"pos":[0,4],"prio":8}]},{"id":"s19_hyper_pop_roll","name":"柔依塔里克","carrier":"Zoe","lv":8,"units":[{"key":"Taric","star":3,"items":["WarmogsArmor","Crownguard","GargoyleStoneplate"],"pos":[0,0],"prio":1},{"key":"Zoe","star":3,"items":["SpearOfShojin","JeweledGauntlet","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"Zac","star":2,"items":[],"pos":[0,4],"prio":3},{"key":"Syndra","star":2,"items":["VoidStaff","Morellonomicon"],"pos":[3,2],"prio":4},{"key":"Elise","star":3,"items":[],"pos":[0,2],"prio":5},{"key":"Yunara","star":2,"items":[],"pos":[3,6],"prio":6},{"key":"Annie","star":2,"items":[],"pos":[0,6],"prio":7},{"key":"Ashe","star":2,"items":[],"pos":[3,4],"prio":8}]},{"id":"s19_your_strongest_kayn","name":"心鋼慨影","carrier":"Kayn","lv":8,"units":[{"key":"Sett","star":3,"items":["WarmogsArmor","Evenshroud","SunfireCape"],"pos":[0,1],"prio":1},{"key":"Kayn","star":3,"items":["HandOfJustice","SteraksGage","Deathblade"],"pos":[1,0],"prio":2},{"key":"Leona","star":2,"items":[],"pos":[0,6],"prio":3},{"key":"Yone","star":2,"items":["HandOfJustice","InfinityEdge","EdgeOfNight"],"pos":[0,4],"prio":4},{"key":"Lillia","star":3,"items":["ThiefsGloves"],"pos":[0,5],"prio":5},{"key":"Gragas","star":2,"items":[],"pos":[0,3],"prio":6},{"key":"Illaoi","star":2,"items":[],"pos":[3,0],"prio":7},{"key":"Braum","star":2,"items":[],"pos":[0,2],"prio":8}]},{"id":"s19_kda_genius_lux_reroll","name":"不世拉克絲","carrier":"Lux","lv":8,"units":[{"key":"Ekko","star":2,"items":[],"pos":[0,6],"prio":1},{"key":"Lux","star":3,"items":["JeweledGauntlet","RabadonsDeathcap","ArchangelsStaff"],"pos":[3,0],"prio":2},{"key":"Tibbers","star":2,"items":[],"pos":[0,2],"prio":3},{"key":"Malzahar","star":2,"items":[],"pos":[3,2],"prio":4},{"key":"Elise","star":2,"items":[],"pos":[0,4],"prio":5},{"key":"Lillia","star":3,"items":[],"pos":[0,0],"prio":6},{"key":"Neeko","star":2,"items":[],"pos":[3,4],"prio":7},{"key":"Gragas","star":2,"items":[],"pos":[0,1],"prio":8}]},{"id":"s19_pentakill_reroll","name":"殺五社吶兒","carrier":"Gnar","lv":7,"units":[{"key":"Yorick","star":2,"items":[],"pos":[0,5],"prio":1},{"key":"Gnar","star":3,"items":["HandOfJustice","Quicksilver","Deathblade"],"pos":[1,0],"prio":2},{"key":"Swain","star":2,"items":[],"pos":[0,3],"prio":3},{"key":"Olaf","star":3,"items":["Bloodthirster","TitansResolve","SteraksGage"],"pos":[0,1],"prio":4},{"key":"Camille","star":2,"items":[],"pos":[3,6],"prio":5},{"key":"Karthus","star":3,"items":[],"pos":[1,2],"prio":6},{"key":"Viego","star":2,"items":[],"pos":[1,4],"prio":7}]},{"id":"s19_kh_vayne","name":"汎犽凝","carrier":"Vayne","lv":7,"units":[{"key":"Leona","star":2,"items":["WarmogsArmor","GargoyleStoneplate","Evenshroud"],"pos":[0,3],"prio":1},{"key":"Vayne","star":2,"items":["GuinsoosRageblade","HextechGunblade","InfinityEdge"],"pos":[3,0],"prio":2},{"key":"Lillia","star":2,"items":[],"pos":[0,1],"prio":3},{"key":"Yone","star":2,"items":["HandOfJustice","EdgeOfNight","Quicksilver"],"pos":[0,2],"prio":4},{"key":"Kayn","star":2,"items":[],"pos":[0,5],"prio":5},{"key":"KaiSa","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Alune","star":2,"items":[],"pos":[3,6],"prio":7}]},{"id":"s19_jazz_and_friends","name":"法洛士路西恩","carrier":"Varus","lv":7,"units":[{"key":"Illaoi","star":3,"items":["GargoyleStoneplate","WarmogsArmor","ProtectorsVow"],"pos":[0,1],"prio":1},{"key":"Varus","star":3,"items":["BlueBuff","HextechGunblade","LastWhisper"],"pos":[3,0],"prio":2},{"key":"Gragas","star":3,"items":[],"pos":[0,4],"prio":3},{"key":"Lucian","star":3,"items":["GuinsoosRageblade","Deathblade","GiantSlayer"],"pos":[3,2],"prio":4},{"key":"Sett","star":2,"items":[],"pos":[0,3],"prio":5},{"key":"Braum","star":2,"items":[],"pos":[0,2],"prio":6},{"key":"Galio","star":2,"items":[],"pos":[0,5],"prio":7}]},{"id":"s19_your_strongest_ezreal","name":"心鋼伊澤瑞爾","carrier":"Ezreal","lv":6,"units":[{"key":"Sett","star":3,"items":["Evenshroud","WarmogsArmor","SunfireCape"],"pos":[0,1],"prio":1},{"key":"Ezreal","star":3,"items":["BlueBuff","Deathblade","InfinityEdge"],"pos":[3,0],"prio":2},{"key":"KSante","star":2,"items":[],"pos":[0,3],"prio":3},{"key":"Lillia","star":3,"items":[],"pos":[0,2],"prio":4},{"key":"Lucian","star":2,"items":[],"pos":[3,2],"prio":5},{"key":"Galio","star":2,"items":[],"pos":[0,5],"prio":6}]},{"id":"s19_ashcrocodile_reroll","name":"雷尼克頓艾希","carrier":"Renekton","lv":7,"units":[{"key":"Zac","star":2,"items":[],"pos":[0,4],"prio":1},{"key":"Renekton","star":3,"items":["Bloodthirster","TitansResolve","EdgeOfNight"],"pos":[0,0],"prio":2},{"key":"Taric","star":2,"items":[],"pos":[0,2],"prio":3},{"key":"Ashe","star":3,"items":["GuinsoosRageblade","LastWhisper","RedBuff"],"pos":[3,0],"prio":4},{"key":"Sett","star":2,"items":[],"pos":[0,6],"prio":5},{"key":"Bard","star":2,"items":[],"pos":[3,2],"prio":6},{"key":"Galio","star":2,"items":[],"pos":[0,3],"prio":7}]},{"id":"s19_viego_flex_with_friends","name":"維爾戈星朵拉","carrier":"Viego","lv":9,"units":[{"key":"Braum","star":3,"items":["Evenshroud","SunfireCape","WarmogsArmor"],"pos":[0,0],"prio":1},{"key":"Viego","star":3,"items":["Bloodthirster","SteraksGage","TitansResolve"],"pos":[0,1],"prio":2},{"key":"Zac","star":2,"items":[],"pos":[0,3],"prio":3},{"key":"Syndra","star":3,"items":["SpearOfShojin","RabadonsDeathcap","JeweledGauntlet"],"pos":[3,0],"prio":4},{"key":"Kayn","star":2,"items":[],"pos":[3,6],"prio":5},{"key":"Illaoi","star":2,"items":[],"pos":[0,2],"prio":6},{"key":"Renekton","star":2,"items":[],"pos":[0,4],"prio":7},{"key":"Yorick","star":2,"items":[],"pos":[0,5],"prio":8},{"key":"Mordekaiser","star":2,"items":["ThiefsGloves"],"pos":[0,6],"prio":9}]},{"id":"s19_mr_katarina_reroll","name":"卡特蓮娜索娜","carrier":"Katarina","lv":9,"units":[{"key":"Nasus","star":3,"items":["GargoyleStoneplate","WarmogsArmor","SunfireCape"],"pos":[0,2],"prio":1},{"key":"Katarina","star":3,"items":["HandOfJustice","JeweledGauntlet","EdgeOfNight"],"pos":[1,1],"prio":2},{"key":"Leona","star":2,"items":[],"pos":[0,4],"prio":3},{"key":"Camille","star":3,"items":["Bloodthirster","Quicksilver","InfinityEdge"],"pos":[1,3],"prio":4},{"key":"Gnar","star":2,"items":[],"pos":[1,6],"prio":5},{"key":"Lillia","star":3,"items":["ThiefsGloves"],"pos":[0,0],"prio":6},{"key":"Shyvana","star":2,"items":[],"pos":[0,6],"prio":7},{"key":"Yuumi","star":2,"items":[],"pos":[3,6],"prio":8},{"key":"Sona","star":2,"items":[],"pos":[3,0],"prio":9}]}]},"unlocks":{"version":"s19-pbe-1","rule":{"guarantee":"nextShop","slot":"right"},"units":[{"key":"Kobuko","cond":{"type":"ownUnit","unit":"Ziggs","star":2,"items":1},"text":"擁有一隻 2 星、裝備 1 件裝備的希格斯。","local":"","guess":false},{"key":"Ashe","cond":{"type":"itemsOn","n":2,"traitAny":["BeachPop"]},"text":"擁有一隻裝備 2 件裝備的海灘流行英雄。","local":"","guess":true},{"key":"Lulu","cond":{"type":"battleSum","stat":"casts","min":10,"who":{"trait":"Hyperpop"},"traitActive":"Hyperpop"},"text":"在超流行羈絆啟動的情況下，讓你的超流行英雄合計施放技能 10 次。","local":"","guess":true},{"key":"Samira","cond":{"type":"itemsOn","n":2,"traitAny":["Classical","Renegade","Trickshot"]},"text":"將 2 件裝備裝在一隻古典樂、叛徒或詭射英雄身上。","local":"","guess":true},{"key":"Seraphine","cond":{"type":"rerolls","min":4,"beforeRound":7},"text":"在第 2 階段選秀（輪抽）之前重抽商店 4 次。","local":"這個模式沒有選秀；改成「第 6 回合結束前重抽 4 次」。","guess":true},{"key":"Tristana","cond":{"type":"battleSum","stat":"kills","min":5,"who":"team","traitActive":"Hyperpop"},"text":"在超流行羈絆啟動的情況下，累計擊殺 5 次。","local":"","guess":true},{"key":"Nasus","cond":{"type":"itemsOn","n":2,"traitAny":["Classical"]},"text":"將所需件數的裝備裝在一隻古典樂英雄身上。","local":"官方還沒公布件數，本頁先用 2 件。","guess":true},{"key":"RenataGlasc","cond":{"type":"itemsOn","n":2,"traitAny":["Classical","Choreographer"]},"text":"將所需件數的裝備裝在一隻古典樂或編舞者英雄身上。","local":"官方還沒公布件數，本頁先用 2 件。","guess":true},{"key":"Evelynn","cond":{"type":"traitUnits","anyOf":[{"trait":"KDA","n":3},{"trait":"Renegade","n":3}]},"text":"擁有 3 隻 K/DA 或叛徒英雄。","local":"兩個羈絆各自算，不合計。","guess":true,"note":"「或」是兩個羈絆的英雄加起來算，同時有兩個羈絆的只算一次（官方文字沒有寫死，這是推測的解讀）。"},{"key":"Tibbers","cond":{"type":"ownUnit","unit":"Annie","star":2,"items":1},"text":"擁有一隻 2 星、裝備 1 件裝備的安妮。","local":"","guess":false},{"key":"Galio","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"activeTraits","min":2,"traits":["Bodyguard","Juggernaut","Frontman"]}]},"text":"玩家等級 7。保鑣、重裝戰士、主唱這三個羈絆啟動所需的數量。","local":"官方還沒公布要幾個，本頁先用 2 個。","guess":true},{"key":"Syndra","cond":{"type":"traitStars","traits":["BeachPop","Choreographer"],"unique":true,"n":6},"text":"場上海灘流行或編舞者英雄的星級合計達到所需數量（同名只算一次）。","local":"官方還沒公布星級數，本頁先用 6。","guess":true},{"key":"Alistar","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"itemsOn","n":1,"item":"ChainVest","roleAny":["Caster","Marksman"]}]},"text":"玩家等級 7。裝備一件鎖子甲給一隻法師（施法者）或射手。","local":"鎖子甲散件，或用鎖子甲合成的成品（含聖光版）都算。","guess":false},{"key":"Alune","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"traitUnits","unique":true,"anyOf":[{"trait":"Heartsteel","n":4},{"trait":"Prodigy","n":4}]}]},"text":"玩家等級 7。擁有 4 隻不同的心鋼之聲或不世之才英雄。","local":"","guess":true,"note":"「或」是兩個羈絆的英雄加起來算，同時有兩個羈絆的只算一次（官方文字沒有寫死，這是推測的解讀）。"},{"key":"Jinx","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"itemsOn","n":3,"traitAny":["IonicSpark","Hitmaker"]}]},"text":"玩家等級 7。將 3 件裝備裝在一隻離子火花或金曲製造機英雄身上。","local":"","guess":true},{"key":"Kayle","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"traitUnits","unique":true,"anyOf":[{"trait":"Pentakill","n":4},{"trait":"Swiftstriker","n":4}]}]},"text":"玩家等級 7。擁有 4 隻不同的殺五社或迅捷先鋒英雄。","local":"","guess":true,"note":"「或」是兩個羈絆的英雄加起來算，同時有兩個羈絆的只算一次（官方文字沒有寫死，這是推測的解讀）。"},{"key":"Thresh","cond":{"type":"battleSum","stat":"charmSec","min":275,"who":"team"},"text":"讓敵人被古典樂累計著迷 275 秒。","local":"所有讓敵人著迷的效果都算。","guess":false},{"key":"Vayne","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"fights","min":3,"traitActive":"Rock"}]},"text":"玩家等級 7。以搖滾羈絆啟動的陣容打 3 場戰鬥。","local":"","guess":true},{"key":"Wukong","cond":{"type":"battleSum","stat":"damage","min":25000,"who":"team","withUnit":"Xayah"},"text":"場上有剎雅時，你的友軍累計造成 25000 傷害。","local":"","guess":false},{"key":"Yasuo","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"traitStars","traits":["TrueDamage","Slayer"],"n":6}]},"text":"玩家等級 7。累計 6 個 True Damage 與殺戮者英雄的星級。","local":"算場上、同名不去重。","guess":true},{"key":"Zac","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"traitUnits","unique":true,"anyOf":[{"trait":"BeachPop","n":5},{"trait":"Juggernaut","n":5}]}]},"text":"玩家等級 7。擁有 5 隻不同的海灘流行或重裝戰士英雄。","local":"","guess":true,"note":"「或」是兩個羈絆的英雄加起來算，同時有兩個羈絆的只算一次（官方文字沒有寫死，這是推測的解讀）。"},{"key":"AkaliKDA","cond":{"type":"all","of":[{"type":"traitStars","traits":["KDA"],"unique":true,"n":8},{"type":"not","unlocked":"AkaliTrueDamage"}]},"text":"在沒有解鎖 True Damage 阿卡莉的前提下，累計 12 個不同 K/DA 英雄的星級。","local":"官方要 12 星，本頁 30 回合比較短，改成 8 星。","guess":true},{"key":"AkaliTrueDamage","cond":{"type":"all","of":[{"type":"battleSum","stat":"trueDamage","min":350,"per":10,"who":{"trait":"TrueDamage"},"traitActive":"TrueDamage"},{"type":"not","unlocked":"AkaliKDA"}]},"text":"在沒有解鎖 K/DA 阿卡莉的前提下，取得 350 點 True Damage 閃耀值。","local":"本頁沒有「閃耀值」；改成 True Damage 成員每造成 10 點真實傷害算 1 點。","guess":true},{"key":"Aphelios","cond":{"type":"any","of":[{"type":"ownUnit","unit":"Alune","star":2,"zone":"board"},{"type":"ownUnit","unit":"Yone","star":2,"zone":"board"}]},"text":"場上擺有 2 星的亞盧妮或犽凝。","local":"","guess":false},{"key":"Gwen","cond":{"type":"battleSum","stat":"casts","min":150,"who":{"trait":"IonicSpark"},"traitActive":"IonicSpark"},"text":"離子火花的粉絲鼓舞 250 次。","local":"官方要粉絲鼓舞 250 次，本頁沒有這個計數，改成離子火花成員施放技能 150 次。","guess":true},{"key":"Janna","cond":{"type":"income","kind":"interest","min":25,"withUnit":"Xayah"},"text":"場上有剎雅時，累計獲得 25 點利息。","local":"","guess":false},{"key":"LeeSin","cond":{"type":"fights","min":5,"withUnit":"Xayah","win":true},"text":"場上有剎雅時，對玩家造成 40 點傷害。","local":"這個模式不會對玩家造成傷害；暫定「場上有剎雅時贏 5 場」。","guess":true},{"key":"Mordekaiser","cond":{"type":"traitStars","traits":["Pentakill"],"unique":true,"n":6},"text":"累計 10 個不同殺五社英雄的星級。","local":"官方要 10 星，本頁改成 6 星。","guess":true},{"key":"Pyke","cond":{"type":"all","of":[{"type":"level","min":7},{"type":"goldAtBattleEnd","min":85}]},"text":"玩家等級 7。戰鬥結束時持有 85 金幣以上。","local":"","guess":false},{"key":"Taliyah","cond":{"type":"fights","min":1,"traitActive":"BeachPop","costsOnBoard":[1,2,3,4,5]},"text":"每種費用各有一隻英雄開局站在海灘流行格子上。","local":"本頁的海灘流行沒有格子；暫定「海灘流行啟動，且開戰時場上 1～5 費各有一隻」。","guess":true},{"key":"Teemo","cond":{"type":"persist","key":"heat","min":200},"text":"累計 900 點超流行熱度。","local":"官方要 900 熱度，本頁改成 200。","guess":true},{"key":"Vladimir","cond":{"type":"all","of":[{"type":"level","min":8},{"type":"formation","rows":[0,1],"exactly":1,"minBoard":2}]},"text":"玩家等級 8。戰場最前面兩排只放 1 隻英雄。","local":"至少要有 2 隻在場上才算（避免只放一隻就過）。","guess":false},{"key":"BaronNashor","cond":{"type":"all","of":[{"type":"persist","key":"instrument","min":5},{"type":"battleSum","stat":"damage","min":65000,"who":{"unit":"Malzahar"}}]},"text":"集齊該樂團所有成員，並用你最強的馬爾札哈造成所需傷害。","local":"傷害是所有馬爾札哈合計。","guess":true},{"key":"Rakan","cond":{"type":"all","of":[{"type":"level","min":8},{"type":"any","of":[{"type":"streak","kind":"win","min":5},{"type":"streak","kind":"lose","min":2}]}]},"text":"在等級 8 以上，連續贏或連續輸達到所需場數。","local":"官方場數沒公布；暫定連勝 5 或連敗 2（這個模式只有 3 條命，連敗不可能多）。","guess":true},{"key":"Smeech","cond":{"type":"all","of":[{"type":"level","min":9},{"type":"activeTraits","min":7,"kinds":["origin","class"]}]},"text":"玩家等級 9。擁有 8 個以上啟動中的非獨有羈絆。","local":"官方要 8 個，本頁改成 7 個。","guess":false},{"key":"Sona","cond":{"type":"all","of":[{"type":"level","min":10},{"type":"persist","key":"inspire","min":15}]},"text":"玩家等級 10。合作合作英雄累計獲得 15 次靈感。","local":"","guess":true}]}});
root.TrialsTrainingNativeRuntime = {data, buildTeam:modules.stats.buildTeam,
  simulate:modules.engine.simulate, hashSeed:modules.rng.hashSeed, makeRng:modules.rng.makeRng};
})(globalThis);
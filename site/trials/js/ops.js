// 技能 op 執行器（SPEC 2.3 / 2.4）。純邏輯；所有狀態改變都透過 engine 提供的 sim 介面。
import { dist, neighbors, lineThrough, line as hexLine, center, rayDir, ray, DIR6, LINES, inBoard, same, boardCenterHex } from './hex.js';

// ---- 數值式 ---------------------------------------------------------------
export function evalValue(sim, source, target, V, ctx) {
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
export function rayEnemies(sim, source, len) {
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

export function selectTargets(sim, source, sel, ctx) {
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

export function runOps(sim, ops, source, origin) {
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

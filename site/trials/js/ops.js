// 技能 op 執行器（SPEC 2.3 / 2.4）。純邏輯；所有狀態改變都透過 engine 提供的 sim 介面。
import { dist, neighbors, lineThrough } from './hex.js';

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

export function selectTargets(sim, source, sel, ctx) {
  if (!ctx) ctx = { side: source ? source.side : 'player', current: source ? source.target : null, prev: [], lastDealt: 0 };
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
  const enemies = () => sim.alive(foe).filter((u) => targetable(sim, u));
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
    const r = sel.r != null ? sel.r : 1;
    const want = sel.side === 'ally' ? side : sel.side === 'enemy' ? foe : (sel.around === 'self' ? foe : c.side);
    let l = sim.alive(want).filter((u) => dist(c.hex, u.hex) <= r);
    if (sel.includeCenter === false) l = l.filter((u) => u !== c);
    return byDist(l, ref);
  }
  if (sel.line != null) {
    const c = resolveCurrent(sim, source, ctx);
    if (!c || !source) return c ? [c] : [];
    const len = sel.len === 'board' || sel.len == null ? 20 : sel.len;
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
    const r = sel.r != null ? sel.r : 2;
    return byDist(sim.alive(foe).filter((u) => dist(source.hex, u.hex) <= r && dist(c.hex, u.hex) <= r), ref);
  }
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
      case 'castN': ok = !!source && source.castCount > 0 && source.castCount % v === 0; break;
      case 'traitActive': ok = sim.traitActive(sideOf(source, ctx), v); break;
      case 'favorite': ok = !!(source && source.favorite) === !!v; break;
      case 'flag': ok = !!(source && source.flags[v]); break;
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
    prev: [], lastDealt: 0, killed: false,
  };
  exec(sim, ops || [], source, origin, ctx);
}

function exec(sim, ops, source, origin, ctx) {
  for (let i = 0; i < ops.length; i++) execOp(sim, ops[i], source, origin, ctx);
}

function secTicks(sim, sec) { return Math.max(1, Math.round(sec * sim.TPS)); }

function execOp(sim, op, source, origin, ctx) {
  const tag = tagOf(origin);
  const isAbility = origin.src === 'ability' || origin.src === 'unit';
  const sel = (to, def) => selectTargets(sim, source, to === undefined ? def : to, ctx);
  const V = (v, tgt) => evalValue(sim, source, tgt || null, v, ctx);
  switch (op.op) {
    case 'damage': {
      const ts = sel(op.to, 'current').filter((u) => u.alive);
      ctx.prev = ts;
      ctx.lastDealt = 0; ctx.killed = false;
      if (!ts.length) return;
      const hits = op.hits != null ? Math.max(1, Math.round(V(op.hits))) : 1;
      const minPct = op.minPct != null ? op.minPct : 0.2;
      const doHit = (k, list, immediate) => {
        let total = 0;
        for (let i = 0; i < list.length; i++) {
          let t = list[i];
          if (!t.alive) {
            const c = sim.alive(otherSide(sideOf(source, ctx))).filter((u) => targetable(sim, u));
            if (!c.length) continue;
            t = byDist(c, t.hex)[0];
          }
          let v = V(op.value, t);
          if (op.split) v /= list.length;
          if (op.falloff) v *= Math.max(minPct, 1 - op.falloff * i);
          if (op.ramp) v *= 1 + op.ramp * k;
          if (op.bonusVsTank && t.roleClass === 'Tank') v *= 1 + op.bonusVsTank;
          const d = sim.damage(source, t, v, op.type || 'physical', { tag, isAbility, pen: op.pen, origin });
          total += d;
          if (!t.alive) ctx.killed = true;
        }
        ctx.lastDealt += total;
      };
      doHit(0, ts, true);
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
      for (const t of ts) {
        sim.addBuff(t, {
          stat: op.stat, value: V(op.value, t),
          dur: op.dur != null ? secTicks(sim, V(op.dur, t)) : null,
          decay: !!op.decay, stackKey: op.stackKey, maxStacks: op.maxStacks, tag,
        });
      }
      return;
    }
    case 'dot': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      const tickSec = op.tick || 1;
      const n = Math.max(1, Math.round((op.dur || 1) / tickSec));
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
      sim.addZone({
        source, side: sideOf(source, ctx), hex: { row: at[0].hex.row, col: at[0].hex.col },
        r: op.r != null ? op.r : 1, dur: secTicks(sim, V(op.dur != null ? op.dur : 3)),
        tick: secTicks(sim, op.tick || 1), enemy: op.enemy || null, ally: op.ally || null, origin,
      });
      return;
    }
    case 'dash': {
      const ts = sel(op.to, 'current');
      ctx.prev = ts;
      if (!ts.length || !source) return;
      sim.dash(source, ts[0]);
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
      for (let k = 0; k < times; k++) {
        if (gap > 0 && k > 0) {
          const c2 = { ...ctx, prev: ctx.prev.slice() };
          sim.schedule(sim.t + secTicks(sim, gap * k), () => {
            if (source && !source.alive && origin.src === 'ability') return;
            exec(sim, op.ops || [], source, origin, c2);
          });
        } else exec(sim, op.ops || [], source, origin, ctx);
      }
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
    default:
      sim.warn('unknown op ' + op.op);
  }
}

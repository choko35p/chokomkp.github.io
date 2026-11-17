// 戰鬥引擎（SPEC 第 3 章）。純邏輯、決定性：不用 Math.random / Date / Math.pow 等。
import { makeRng } from './rng.js';
import { dist, neighbors, within, ROWS, COLS } from './hex.js';
import { runOps, selectTargets, evalValue } from './ops.js';

export const C = {
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
};

const TYPE_CH = { physical: 'p', magic: 'm', true: 't' };
const TYPE_KEY = { physical: 'phys', magic: 'magic', true: 'true' };
function trKey(src) { return typeof src === 'string' && src.startsWith('trait:') ? src.slice(6) : null; }
function numOf(id) { const n = parseInt(String(id).replace(/^\D+/, ''), 10); return Number.isFinite(n) ? n : 0; }
function other(s) { return s === 'player' ? 'enemy' : 'player'; }

export function simulate(setup) {
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
    if (kind === 'stun' && u.ccCap > 0) durTicks = Math.min(durTicks, Math.max(1, Math.round(u.ccCap * TPS))); // 頭目：暈眩上限
    const defaults = { chill: C.CHILL, wound: C.WOUND, burn: C.BURN, shred: C.SHRED, sunder: C.SUNDER, weaken: C.WEAKEN, vulnerable: C.VULNERABLE };
    const v = value != null ? value : (defaults[kind] || 0);
    const end = t + durTicks;
    const s = u.status[kind];
    if (s && s.end > t) { s.end = Math.max(s.end, end); s.value = Math.max(s.value, v); } else u.status[kind] = { end, value: v };
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
      if (frac < p.n) fire(ent, v, false);
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
    occ[cell(tgt.hex)] = null;
    emit({ e: 'death', id: tgt.id, killer: src ? src.id : null });
    byUnit[tgt.id].alive = false;
    byUnit[tgt.id].hpLeft = 0;
    if (src) byUnit[src.id].kills++;
    if (src && src !== tgt) trigger('kill', src, tgt, 0, true);
    trigger('death', tgt, src, 0, true);
    trigger('allyDeath', tgt, tgt, 0, true);
    trigger('enemyDeath', tgt, tgt, 0, true);
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
  function freeNear(ref) {
    let best = null, bd = 1e9;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (occ[r * COLS + c]) continue;
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
      u.alive = false; u.hp = 0; occ[cell(u.hex)] = null;
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

  function dash(u, tgt) {
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
    emit({ e: 'move', id: u.id, to: { row: best.row, col: best.col }, dur: C.DASH_TICKS, style: 'dash', from: dashFrom });
  }

  function addZone(z) {
    emit({ e: 'fx', kind: 'aoe', from: z.hex, hexes: within(z.hex, z.r), src: z.source ? z.source.id : null });
    const n = Math.max(1, Math.floor(z.dur / z.tick));
    for (let k = 1; k <= n; k++) {
      schedule(t + z.tick * k, () => {
        for (const u of units.slice()) {
          if (!u.alive || dist(z.hex, u.hex) > z.r) continue;
          const ops = u.side === z.side ? z.ally : z.enemy;
          if (!ops) continue;
          runOps(sim, ops, z.source, { ...z.origin, side: z.side, current: u, allowDead: false });
        }
      });
    }
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
    const first = ab.steps && ab.steps[0];
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
    traitActive: (side, key) => active[side].has(key),
    warn: (m) => { if (warnings.indexOf(m) < 0) warnings.push(m); },
  };

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
    const list = units.slice();
    for (const u of list) actUnit(u);
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
    summary: {
      byUnit, byTrait, byTraitEnemy, playerAlive: pAlive, enemyAlive: eAlive,
      enemyHpPctLeft: hpMaxInit.enemy > 0 ? eHp / hpMaxInit.enemy : 0,
      rewards, persist,
    },
  };
  if (warnings.length) result.warnings = warnings;
  return result;
}
export { runOps, selectTargets, evalValue };

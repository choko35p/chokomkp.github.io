// 戰前計算：羈絆計數、套羈絆／裝備／增幅，產生 Combatant。純函式、決定性。
export const S = {
  baseAp: 100,          // 基礎法強（普攻回魔不在這裡給，交給引擎 C.MANA_PER_ATTACK 依定位）
  frontRowMax: 2,       // 站位 r < 2 算前排（前 2 排）
  drCap: 0.9,
  favoriteAbilityAmp: 0.25,
  mundoHpTrait: 'RecordMogul', neekoKey: 'Neeko',
};

import { neighbors, playerToBoard } from './hex.js';

const r1 = (x) => Math.round(x * 1000) / 1000;
const keyCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- 羈絆計數 ----------
function hasProducer(t) {
  const effs = [].concat(t.always || [], ...(t.tiers || []));
  return effs.some((e) => e && e.type === 'special' && e.id === 'producer');
}

export function countTraits(units, DATA, opts = {}) {
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
    if (!pick) {
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

export function buildTeam(side, units, DATA, ctx = {}) {
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

  const traits = countTraits(units, DATA, { augments: ctx.augments, producerPick: ctx.producerPick });
  const activeNonUnique = traits.filter((t) => t.active && t.kind !== 'unique').length;

  const sortedBy = (arr) => arr.slice().sort((a, b) =>
    b.items.length - a.items.length || b.def.cost - a.def.cost || keyCmp(a.u.key, b.u.key) || a.i - b.i);

  const resolveWho = (who, env) => {
    const isM = (st) => env.traitKey && (st.def.traits || []).includes(env.traitKey);
    if (who == null || who === 'team') return L;
    if (who === 'members') return L.filter(isM);
    if (who === 'nonMembers') return L.filter((s) => !isM(s));
    if (who === 'frontRows') return L.filter((s) => s.pos && s.pos[0] < S.frontRowMax);
    if (who === 'backRows') return L.filter((s) => s.pos && s.pos[0] >= S.frontRowMax);
    if (who === 'mostItemsAlly') return sortedBy(L).slice(0, 1);
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
    return { info, effs: effectsOf(t, info), env: { src: 'trait:' + info.key, traitKey: info.key } };
  });
  const augEnvs = ((ctx.augments) || []).map((k) => DATA.augments.byKey[k]).filter(Boolean)
    .map((a) => ({ effs: a.effects || [], env: { src: 'aug:' + a.key, traitKey: null } }));
  const all = envs.concat(augEnvs);

  // 第一輪：心鋼最愛（其他效果要用 favorites）
  for (const { effs, env } of all) {
    for (const e of effs) {
      if (e.type === 'special' && e.id === 'favorite') {
        const pool = L.filter((s) => (s.def.traits || []).includes(env.traitKey));
        for (const st of sortedBy(pool).slice(0, e.n || 0)) {
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

  const SPECIALS = ['soulLink', 'executeSummon', 'clone', 'untargetableStart', 'classical'];
  const applyEffect = (e, env) => {
    const mult0 = e.perPersist ? (persist[e.perPersist] || 0) : 1;
    switch (e.type) {
      case 'stat': case 'statPerLevel': case 'statPerActiveTrait': {
        const m = mult0 * (e.type === 'statPerLevel' ? level : e.type === 'statPerActiveTrait' ? activeNonUnique : 1);
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
        if (SPECIALS.includes(e.id)) {
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
      baseHp, baseAd, abilityDr: r1(g('abilityDr')), startShieldDur, favorite: st.favorite,
      missingHpScales: st.scales, missingHp: st.scales.length ? st.scales.map((m) => ({ stat: m.stat, min: m.min, max: m.max })) : null,
      bounce: st.bounce, trueDmgPct: r1(g('trueDmgPct')),
    };
    if (isBoss) { c.boss = true; c.ccCap = mods.boss.ccCap != null ? mods.boss.ccCap : 0.5; c.slotsScale = mods.boss.slotsScale || 1.3; }
    return c;
  });
  return { combatants, teamPassives, traits, notes, deferred };
}

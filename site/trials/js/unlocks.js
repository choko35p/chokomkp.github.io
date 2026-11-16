// unlocks.js — 棋子解鎖機制（SPEC_UI2 第 7 章）。純函式、不碰 DOM／亂數／時間。
// 條件登記表 CONDS 可擴充：PBE 有新條件 → 加一個型別＋改 data/unlocks.json，其他檔不用動。
import { countTraits as defaultCount } from './stats.js';

let counter = defaultCount;
// 測試／機器人可換掉羈絆計算（game.js 的 setBackend 會轉過來）
export function setCounter(fn) { counter = fn || defaultCount; }
// 玩家羈絆要帶的參數（製作人的選擇等），由 game.js 掛上；沒掛就只帶增幅
let optsFn = null;
export function setTraitOpts(fn) { optsFn = fn || null; }

const ROOT = '_';

// ---------- 取資料的小工具 ----------
const ulist = (DATA) => (DATA && DATA.unlocks && DATA.unlocks.list) || [];
const defOf = (DATA, key) => DATA.units.byKey[key];
const zhOf = (DATA, key) => (DATA.units.byKey[key] && DATA.units.byKey[key].zh) || key;
const tzhOf = (DATA, key) => (DATA.traits.byKey[key] && DATA.traits.byKey[key].zh) || key;

function unitsIn(state, zone) {
  const out = state.board.slice();
  if (zone !== 'board') for (const u of state.bench) if (u) out.push(u);
  return out;
}
const hasTrait = (DATA, u, traits) => { const d = defOf(DATA, u.key); return !!d && (d.traits || []).some(t => traits.includes(t)); };

function boardTraits(ctx) {
  if (!ctx._traits) {
    const { state, DATA } = ctx;
    try {
      ctx._traits = counter(state.board.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, optsFn ? optsFn(state, DATA) : { augments: (state.augments || []).slice() });
    } catch (e) { ctx._traits = []; }
  }
  return ctx._traits;
}
const traitActiveIn = (list, key) => !!(list || []).find(t => t.key === key && t.tier > 0);

// 事件裡的 board 是 {key, star, items, pos}；traits 是 countTraits 的結果
const evHasUnit = (ev, key) => (ev.board || []).some(u => u.key === key);

// ---------- 條件型別 ----------
// cur(cond, ctx, box) → 目前進度；need(cond) → 目標；feed(cond, ev, ctx, box)：box.v 是這個條件自己的累計值
const ROLE_ZH = { Caster: '法師', Marksman: '射手', Fighter: '戰士', Tank: '坦克', Assassin: '刺客', Specialist: '特殊型' };
// 英文名後面接中文時補一個空格（True Damage 英雄、K/DA 英雄）
const sp = (s) => (/[A-Za-z0-9/]$/.test(s) ? s + ' ' : s);

export const CONDS = {
  level: {
    cur: (c, ctx) => ctx.state.level,
    need: (c) => c.min,
    text: (c) => `玩家等級 ${c.min}`,
  },
  ownUnit: {
    cur: (c, ctx) => unitsIn(ctx.state, c.zone === 'board' ? 'board' : 'own')
      .some(u => u.key === c.unit && u.star >= (c.star || 1) && u.items.length >= (c.items || 0)) ? 1 : 0,
    need: () => 1,
    text: (c, D) => `${c.zone === 'board' ? '場上' : ''}有一隻${(c.star || 1) > 1 ? ` ${c.star} 星` : ''}${c.items ? `、裝備 ${c.items} 件` : ''}的${zhOf(D, c.unit)}`,
  },
  itemsOn: {
    cur: (c, ctx) => {
      let best = 0;
      for (const u of unitsIn(ctx.state, 'own')) {
        if (c.traitAny && !hasTrait(ctx.DATA, u, c.traitAny)) continue;
        if (c.roleAny && !c.roleAny.includes((defOf(ctx.DATA, u.key) || {}).roleClass)) continue;
        const n = c.item ? u.items.filter(i => i === c.item).length : u.items.length;
        if (n > best) best = n;
      }
      return best;
    },
    need: (c) => c.n,
    text: (c, D) => `一隻${c.traitAny ? sp(c.traitAny.map(t => tzhOf(D, t)).join('、')) : ''}${c.roleAny ? c.roleAny.map(r => ROLE_ZH[r] || r).join('或') : '英雄'}${c.roleAny && c.traitAny ? '英雄' : ''}身上有 ${c.n} 件${c.item ? (D.items.byKey[c.item] || D.items.compByKey[c.item] || {}).zh || c.item : '裝備'}`,
  },
  traitUnits: {
    // 每組各自算（不合計），取最接近完成的一組
    cur: (c, ctx) => bestGroup(c, ctx).cur,
    need: (c, ctx) => (ctx ? bestGroup(c, ctx).need : Math.min(...c.anyOf.map(g => g.n))),
    text: (c, D) => c.anyOf.map(g => `${g.n} 隻${c.unique ? '不同的' : ''}${tzhOf(D, g.trait)}`).join(' 或 '),
  },
  traitStars: {
    cur: (c, ctx) => {
      const traits = c.traits;
      const us = unitsIn(ctx.state, c.zone || 'board').filter(u => hasTrait(ctx.DATA, u, traits));
      if (!c.unique) return us.reduce((s, u) => s + u.star, 0);
      const m = {};
      for (const u of us) m[u.key] = Math.max(m[u.key] || 0, u.star);
      return Object.values(m).reduce((s, x) => s + x, 0);
    },
    need: (c) => c.n,
    text: (c, D) => `${sp(c.traits.map(t => tzhOf(D, t)).join('、'))}英雄的星級合計 ${c.n}${c.unique ? '（同名只算一次）' : ''}`,
  },
  activeTraits: {
    cur: (c, ctx) => boardTraits(ctx).filter(t => t.tier > 0 && (!c.kinds || c.kinds.includes(t.kind))).length,
    need: (c) => c.min,
    text: (c) => `${c.min} 個啟動中的非獨有羈絆`,
  },
  formation: {
    cur: (c, ctx, box) => (box.v ? 1 : 0),
    need: () => 1,
    feed: (c, ev, ctx, box) => {
      if (box.v || ev.kind !== 'battleEnd') return;
      const board = ev.board || [];
      if (c.minBoard && board.length < c.minBoard) return;
      const rows = c.rows || [0, 1];
      const n = board.filter(u => u.pos && rows.includes(u.pos[0])).length;
      if (n === c.exactly) box.v = 1;
    },
    text: (c) => `開戰時最前面兩排剛好 ${c.exactly} 隻${c.minBoard ? `（場上至少 ${c.minBoard} 隻）` : ''}`,
  },
  goldAtBattleEnd: {
    cur: (c, ctx, box) => box.v,
    need: (c) => c.min,
    feed: (c, ev, ctx, box) => { if (ev.kind === 'battleEnd' && ev.goldBefore > box.v) box.v = ev.goldBefore; },
    text: (c) => `戰鬥結束時持有 ${c.min} 金以上`,
  },
  persist: {
    cur: (c, ctx) => (ctx.state.persist && ctx.state.persist[c.key]) || 0,
    need: (c) => c.min,
    text: (c) => `${({ heat: '熱度', inspire: '靈感', instrument: '樂器' })[c.key] || c.key}累計 ${c.min}`,
  },
  rerolls: {
    cur: (c, ctx, box) => box.v,
    need: (c) => c.min,
    feed: (c, ev, ctx, box) => {
      if (ev.kind !== 'reroll') return;
      if (c.beforeRound && ctx.state.round >= c.beforeRound) return;   // 過了期限就停止累計
      box.v += 1;
    },
    text: (c) => `重抽商店 ${c.min} 次${c.beforeRound ? `（第 ${c.beforeRound - 1} 回合結束前）` : ''}`,
  },
  fights: {
    cur: (c, ctx, box) => box.v,
    need: (c) => c.min,
    feed: (c, ev, ctx, box) => {
      if (ev.kind !== 'battleEnd') return;
      if (c.win && !ev.win) return;
      if (c.traitActive && !traitActiveIn(ev.traits, c.traitActive)) return;
      if (c.withUnit && !evHasUnit(ev, c.withUnit)) return;
      if (c.costsOnBoard) {
        const have = new Set((ev.board || []).map(u => (defOf(ctx.DATA, u.key) || {}).cost));
        if (!c.costsOnBoard.every(x => have.has(x))) return;
      }
      box.v += 1;
    },
    text: (c, D) => `${c.traitActive ? tzhOf(D, c.traitActive) + '啟動' : ''}${c.withUnit ? '場上有' + zhOf(D, c.withUnit) : ''}${c.costsOnBoard ? '、1～5 費各一隻' : ''}打 ${c.min} 場${c.win ? '勝仗' : '戰鬥'}`,
  },
  streak: {
    cur: (c, ctx) => (c.kind === 'lose' ? ((ctx.state.stats && ctx.state.stats.loseStreak) || 0) : ctx.state.streak || 0),
    need: (c) => c.min,
    text: (c) => `連${c.kind === 'lose' ? '敗' : '勝'} ${c.min} 場`,
  },
  battleSum: {
    cur: (c, ctx, box) => Math.floor(box.v / (c.per || 1)),
    need: (c) => c.min,
    feed: (c, ev, ctx, box) => {
      if (ev.kind !== 'battleEnd' || !ev.result) return;
      if (c.traitActive && !traitActiveIn(ev.traits, c.traitActive)) return;
      if (c.withUnit && !evHasUnit(ev, c.withUnit)) return;
      box.v += battleStat(c, ev.result, ctx.DATA);
    },
    text: (c, D) => {
      const who = c.who === 'team' || !c.who ? '我方' : c.who.unit ? zhOf(D, c.who.unit) : sp(tzhOf(D, c.who.trait)) + '英雄';
      const st = { damage: '造成傷害', trueDamage: '造成真實傷害', kills: '擊殺', casts: '施放技能', charmSec: '讓敵人著迷（秒）' }[c.stat] || c.stat;
      return `${who}累計${st} ${c.min}${c.per > 1 ? `（每 ${c.per} 點算 1）` : ''}`;
    },
  },
  income: {
    cur: (c, ctx, box) => box.v,
    need: (c) => c.min,
    feed: (c, ev, ctx, box) => {
      if (ev.kind !== 'battleEnd') return;
      if (c.withUnit && !evHasUnit(ev, c.withUnit)) return;
      box.v += ev.interest || 0;
    },
    text: (c, D) => `${c.withUnit ? '場上有' + zhOf(D, c.withUnit) + '時，' : ''}累計獲得 ${c.min} 點利息`,
  },
  not: {
    // 對方沒解鎖＝1／1；解鎖了＝0／1（之後永遠不會完成）
    cur: (c, ctx) => (ctx.state.unlocks && ctx.state.unlocks[c.unlocked] ? 0 : 1),
    need: () => 1,
    text: (c, D) => `沒有解鎖${zhOf(D, c.unlocked)}`,
  },
};

function bestGroup(c, ctx) {
  let best = null;
  const us = unitsIn(ctx.state, c.zone || 'own');
  for (const g of c.anyOf) {
    const mine = us.filter(u => hasTrait(ctx.DATA, u, [g.trait]));
    const cur = c.unique ? new Set(mine.map(u => u.key)).size : mine.length;
    const r = { cur, need: g.n };
    if (!best || cur / g.n > best.cur / best.need) best = r;
  }
  return best || { cur: 0, need: 1 };
}

// 一場戰鬥打完，這個條件要加多少。來源：result.summary.byUnit[id]（dmg／true／kills／casts）＋ result.units（key、陣營）
function battleStat(c, result, DATA) {
  const units = result.units || [];
  const side = {};
  for (const u of units) side[u.id] = u;
  const who = c.who || 'team';
  const pick = (u) => {
    if (!u || u.side !== 'player') return false;
    if (who === 'team') return true;
    if (who.unit) return u.key === who.unit;
    if (who.trait) { const d = defOf(DATA, u.key); return !!d && (d.traits || []).includes(who.trait); }
    return false;
  };
  if (c.stat === 'charmSec') {
    let ticks = 0;
    for (const e of result.events || []) {
      if (e.e === 'status' && e.kind === 'charm' && e.on) { const u = side[e.id]; if (u && u.side === 'enemy') ticks += e.dur || 0; }
    }
    return ticks / 20;   // TPS 20
  }
  const by = (result.summary && result.summary.byUnit) || {};
  const field = { damage: 'dmg', trueDamage: 'true', kills: 'kills', casts: 'casts' }[c.stat];
  if (!field) return 0;
  let sum = 0;
  for (const id of Object.keys(by)) if (pick(side[id])) sum += by[id][field] || 0;
  return sum;
}

// ---------- 條件樹 ----------
function childPath(path, i) { return path === ROOT ? String(i) : path + '.' + i; }

function mkCtx(state, DATA) { return { state, DATA, _traits: null }; }

function evalNode(cond, ctx, store, path) {
  const DATA = ctx.DATA;
  if (cond.type === 'all' || cond.type === 'any') {
    const parts = cond.of.map((c, i) => {
      const r = evalNode(c, ctx, store, childPath(path, i));
      return { text: describeCond(c, DATA), cur: r.cur, need: r.need, done: r.done, ...(r.parts ? { parts: r.parts } : {}) };
    });
    if (cond.type === 'all') {
      const n = parts.filter(p => p.done).length;
      return { cur: n, need: parts.length, done: n === parts.length, parts };
    }
    let best = parts[0];
    for (const p of parts) if (p.done || p.cur / p.need > best.cur / best.need) { best = p; if (p.done) break; }
    return { cur: best.cur, need: best.need, done: parts.some(p => p.done), parts };
  }
  const def = CONDS[cond.type];
  if (!def) return { cur: 0, need: 1, done: false };
  const box = { v: store[path] || 0 };
  const need = def.need(cond, ctx);
  const cur = def.cur(cond, ctx, box);
  return { cur: Math.min(cur, need), need, done: cur >= need };
}

// 顯示用：各條件的一句話（面板的 parts 用）
export function describeCond(cond, DATA) {
  if (cond.type === 'all' || cond.type === 'any') return cond.of.map(c => describeCond(c, DATA)).join(cond.type === 'all' ? '，且' : '，或');
  const def = CONDS[cond.type];
  return def && def.text ? def.text(cond, DATA) : cond.type;
}

function walkLeaves(cond, path, fn) {
  if (cond.type === 'all' || cond.type === 'any') { cond.of.forEach((c, i) => walkLeaves(c, childPath(path, i), fn)); return; }
  fn(cond, path);
}

// 條件裡引用到的 unit／trait／item／role，給 validate 用
export function condRefs(cond, out = { types: [], units: [], traits: [], items: [], roles: [] }) {
  out.types.push(cond.type);
  if (cond.type === 'all' || cond.type === 'any') { for (const c of cond.of || []) condRefs(c, out); return out; }
  const U = (k) => k && out.units.push(k), T = (k) => k && out.traits.push(k);
  U(cond.unit); U(cond.withUnit); U(cond.unlocked);
  if (cond.who && cond.who.unit) U(cond.who.unit);
  if (cond.who && cond.who.trait) T(cond.who.trait);
  T(cond.traitActive); T(cond.trait);
  for (const t of cond.traitAny || []) T(t);
  for (const t of cond.traits || []) T(t);
  for (const g of cond.anyOf || []) T(g.trait);
  if (cond.item) out.items.push(cond.item);
  for (const r of cond.roleAny || []) out.roles.push(r);
  return out;
}

// ---------- 對外 ----------
export const enabled = (DATA) => ulist(DATA).length > 0;

export function isUnlocked(state, DATA, key) {
  const d = DATA && DATA.unlocks;
  if (!d || !d.byKey[key]) return true;   // 沒列＝開局就解鎖
  return !!(state.unlocks && state.unlocks[key]);
}

export function progress(state, DATA, key) {
  const u = DATA.unlocks && DATA.unlocks.byKey[key];
  if (!u) return { cur: 1, need: 1, done: true };
  const ctx = mkCtx(state, DATA);
  const r = evalNode(u.cond, ctx, (state.unlockAcc && state.unlockAcc[key]) || {}, ROOT);
  if (state.unlocks && state.unlocks[key]) return { ...r, done: true };
  return r;
}

export function feedUnlocks(state, DATA, ev) {
  const ctx = mkCtx(state, DATA);
  for (const u of ulist(DATA)) {
    if (state.unlocks && state.unlocks[u.key]) continue;
    walkLeaves(u.cond, ROOT, (cond, path) => {
      const def = CONDS[cond.type];
      if (!def || !def.feed) return;
      if (!state.unlockAcc) state.unlockAcc = {};
      const store = state.unlockAcc[u.key] || (state.unlockAcc[u.key] = {});
      const box = { v: store[path] || 0 };
      def.feed(cond, ev, ctx, box);
      if (box.v !== (store[path] || 0)) store[path] = box.v;
    });
  }
}

// 回傳這次新解鎖的 key（照 unlocks.json 順序），並寫入 state.unlocks
export function checkUnlocks(state, DATA) {
  const out = [];
  const list = ulist(DATA);
  if (!list.length) return out;
  if (!state.unlocks) state.unlocks = {};
  const ctx = mkCtx(state, DATA);
  for (const u of list) {
    if (state.unlocks[u.key]) continue;
    const r = evalNode(u.cond, ctx, (state.unlockAcc && state.unlockAcc[u.key]) || {}, ROOT);
    if (r.done) { state.unlocks[u.key] = { round: state.round }; out.push(u.key); ctx._traits = null; }
  }
  return out;
}

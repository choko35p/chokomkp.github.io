// game.js — 遊戲狀態機（純邏輯）
import { hashSeed, makeRng } from './rng.js';
import * as S from './shop.js';
import { enemyForRound, setCountTraits } from './enemies.js';
import * as U from './unlocks.js';

let B = { simulate: null, buildTeam: null, countTraits: null };
try { const m = await import('./engine.js'); B.simulate = m.simulate; } catch (e) { /* 引擎還沒有 */ }
try { const m = await import('./stats.js'); B.buildTeam = m.buildTeam; B.countTraits = m.countTraits; } catch (e) { /* stats 還沒有 */ }
// 測試／機器人可換掉引擎與戰前計算
export function setBackend(b) {
  B = { ...B, ...b };
  if (b.countTraits) { setCountTraits(b.countTraits); U.setCounter(b.countTraits); }
}

// 規則表缺欄位時的預設（正式值在 rules.json）
const DEF = {
  score: {
    win: { base: 100, perRound: 10, perAlive: 10, timeCap: 30, perSecondUnder: 2, bossMult: 3 },
    lose: { mult: 50 }, end: { perLife: 500, perGold: 2, clear: 1000 },
  },
  augmentChoices: 3, augmentRerolls: 1,
};
const R = DATA => DATA.rules;
function sc(DATA) {
  const s = R(DATA).score || {};
  return {
    win: { ...DEF.score.win, ...(s.win || {}) },
    lose: { ...DEF.score.lose, ...(s.lose || {}) }, end: { ...DEF.score.end, ...(s.end || {}) },
  };
}
const clone = x => JSON.parse(JSON.stringify(x));
const ok = (extra = {}) => ({ ok: true, ...extra });
const no = reason => ({ ok: false, reason });

// ---------- 解鎖（SPEC_UI2 第 7 章）----------
// 檢查有沒有新解鎖：寫入 state.unlocks／unlockQueue，並在 events 加 {type:'unlock', key}
function runUnlocks(state, DATA, events) {
  const keys = U.checkUnlocks(state, DATA);
  if (!keys.length) return;
  if (!state.unlockQueue) state.unlockQueue = [];
  for (const k of keys) { state.unlockQueue.push(k); if (events) events.push({ type: 'unlock', key: k }); }
}
const availKey = (state, DATA, k) => S.available(state, DATA, k);

// ---------- 規則加成（增幅／羈絆） ----------
function augEffects(state, DATA) {
  const out = [];
  for (const k of state.augments) {
    const a = DATA.augments.byKey[k];
    if (!a) continue;
    for (const e of a.effects || []) out.push({ e, aug: a });
  }
  return out;
}
function ruleSum(state, DATA, name) {
  let v = 0;
  for (const { e } of augEffects(state, DATA)) {
    if (e.type === 'rule' && e.key === name) v += e.value;
    else if (e.type === name && typeof e.value === 'number') v += e.value;
  }
  return v;
}
function interestCap(state, DATA) {
  let v = R(DATA).income.interestCap, zero = false;
  for (const { e } of augEffects(state, DATA)) {
    if (e.type === 'rule' && e.key === 'interestCap') { if (e.value === 0) zero = true; else v = Math.max(v, e.value); }
  }
  return zero ? 0 : v;
}
function traitTeamSize(state, DATA) {
  if (!B.countTraits || !state.board.length) return 0;
  let n = 0;
  try {
    const list = B.countTraits(state.board.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, { augments: state.augments.slice() });
    for (const t of list) {
      if (!t.tier) continue;
      const def = DATA.traits.byKey[t.key];
      if (!def) continue;
      for (const e of [...(def.always || []), ...((def.tiers || [])[t.tier - 1] || [])]) if (e.type === 'teamSize') n += e.value;
    }
  } catch (e) { return 0; }
  return n;
}
export function teamLimit(state, DATA) { return state.level + ruleSum(state, DATA, 'teamSize') + traitTeamSize(state, DATA); }
export function population(state, DATA) {
  let n = 0;
  for (const u of state.board) n += DATA.units.byKey[u.key].slots || 1;
  return n;
}
const slotsOf = (DATA, u) => DATA.units.byKey[u.key].slots || 1;

// ---------- 抽選工具 ----------
function rewardRng(state) { return makeRng(hashSeed(state.seed, 'reward', state.round, state.rewardN++)); }
function giveComponent(state, DATA, events) {
  const { compKeys } = S.itemIndex(DATA);
  const k = rewardRng(state).pick(compKeys);
  const g = S.addItemBench(state, k, DATA);
  events.push({ type: 'item', key: k, ...(g ? { overflowGold: g } : {}) });
  return k;
}
function giveCompleted(state, DATA, events, key) {
  const k = key || rewardRng(state).pick(S.itemIndex(DATA).completed);
  const g = S.addItemBench(state, k, DATA);
  events.push({ type: 'item', key: k, ...(g ? { overflowGold: g } : {}) });
  return k;
}
function poolPick(state, DATA, cost, rng) {
  // 該費用還有張數的棋子，照剩餘張數的比例抽；該費用沒有就往低費找
  for (let c = cost; c >= 1; c--) {
    const keys = DATA.units.list.filter(u => u.cost === c && (state.pool[u.key] || 0) > 0 && availKey(state, DATA, u.key)).map(u => u.key).sort();
    if (!keys.length) continue;
    let sum = 0;
    for (const k of keys) sum += state.pool[k];
    let r = rng.next() * sum;
    for (const k of keys) { if (r < state.pool[k]) return k; r -= state.pool[k]; }
    return keys[keys.length - 1];
  }
  return null;
}
function giveUnitByCost(state, DATA, cost, events) {
  const key = poolPick(state, DATA, cost, rewardRng(state));
  if (!key) return null;
  state.pool[key] -= 1;
  return giveUnitKey(state, DATA, key, events);
}
function giveUnitKey(state, DATA, key, events, fromPool = false) {
  const r = S.receiveUnit(state, key, DATA);
  events.push({ type: 'unit', key, placed: r.placed, ...(r.gold ? { gold: r.gold } : {}) });
  for (const m of r.merged || []) events.push({ type: 'merge', key: m.key, star: m.star });
  return key;
}
function pickEconUnit(state, DATA, spec, src) {
  const rng = rewardRng(state);
  const max = spec.maxCost || 1;
  const trait = spec.source === 'collabOnBoard' && src && src.indexOf('trait:') === 0 ? src.slice(6) : null;
  let keys = DATA.units.list.filter(u => u.cost <= max && u.cost !== 7 && (state.pool[u.key] || 0) > 0 && availKey(state, DATA, u.key) && (!trait || (u.traits || []).includes(trait))).map(u => u.key).sort();
  if (!keys.length) keys = DATA.units.list.filter(u => u.cost <= max && u.cost !== 7 && (state.pool[u.key] || 0) > 0 && availKey(state, DATA, u.key)).map(u => u.key).sort();
  if (!keys.length) return null;
  const k = rng.pick(keys);
  state.pool[k] -= 1;
  return k;
}
function maxShopCost(state, DATA) {
  const row = R(DATA).shopOdds[String(state.level)] || [100];
  let c = 1;
  row.forEach((p, i) => { if (p > 0) c = i + 1; });
  return c;
}
function sevenList(DATA) { return DATA.units.list.filter(u => u.cost === 7).map(u => u.key).sort(); }
function owned(state, key) { return S.allUnits(state).some(u => u.key === key); }

// ---------- XP ----------
function addXp(state, DATA, n, events) {
  const r = R(DATA);
  if (state.level >= r.maxLevel) return;
  state.xp += n;
  while (state.level < r.maxLevel && state.xp >= r.xpToNext[String(state.level)]) {
    state.xp -= r.xpToNext[String(state.level)];
    state.level++;
    events.push({ type: 'levelup', level: state.level });
  }
  if (state.level >= r.maxLevel) state.xp = 0;
}

// ---------- 選擇視窗 ----------
function makeAugmentChoice(state, DATA, tier) {
  const pool = DATA.augments.list.filter(a => a.tier === tier && !state.augments.includes(a.key)).map(a => a.key).sort();
  const rng = makeRng(hashSeed(state.seed, 'reward', state.round, 'aug', tier, 0));
  const ac = R(DATA).augment || {};
  const n = ac.choices ?? DEF.augmentChoices;
  const options = rng.shuffle(pool).slice(0, n);
  const per = ac.rerollsPerChoice ?? DEF.augmentRerolls;
  // 照官方：每一張各有自己的重抽鍵（每張各 per 次），只換那一張。rerollN[i]＝第 i 張已經換過幾次（決定性亂數用）
  return { type: 'augment', tier, options, rerollLeft: options.map(() => per), rerollN: options.map(() => 0) };
}
// 舊存檔：pending 可能是 {rerolls:n}（三張一起換）或只有數字的 rerollLeft，照新格式補成每張各一個
function normAugmentPending(p, DATA) {
  if (!p || p.type !== 'augment') return p;
  const per = (R(DATA).augment || {}).rerollsPerChoice ?? DEF.augmentRerolls;
  const len = (p.options || []).length;
  if (!Array.isArray(p.rerollLeft)) {
    const old = typeof p.rerollLeft === 'number' ? p.rerollLeft : (p.rerolls ?? per);
    p.rerollLeft = new Array(len).fill(old > 0 ? per : 0);
  }
  if (!Array.isArray(p.rerollN)) p.rerollN = new Array(len).fill(0);
  delete p.rerolls;
  return p;
}
function makeRewardChoice(state, DATA, seven) {
  const br = R(DATA).bossReward || {};
  const opt = k => (br.options || []).find(o => o.kind === k) || {};
  const rng = rewardRng(state);
  const gold = { kind: 'gold', gold: opt('gold').n ?? 8 };
  const opts = [];
  opts.push({ kind: 'completed', choices: rng.shuffle(S.itemIndex(DATA).completed).slice(0, opt('completed').choices ?? 3) });
  opts.push(gold);
  if (seven) {
    const list = ((R(DATA).sevenCost || {}).bossRewardChoices || sevenList(DATA)).filter(k => !owned(state, k));
    opts.push(list.length ? { kind: 'seven', choices: list } : gold);
  } else {
    const key = poolPick(state, DATA, maxShopCost(state, DATA), rng);
    opts.push(key ? { kind: 'unit', key, cost: DATA.units.byKey[key].cost } : gold);
  }
  return { type: 'reward', options: opts };
}
function setPending(state, p) {
  state.pendingChoices = p;
  state.phase = p ? (p.type === 'augment' ? 'augment' : 'reward') : 'plan';
}
function nextPending(state) {
  if (state.pendingQueue.length) setPending(state, state.pendingQueue.shift());
  else setPending(state, null);
}

// ---------- 回合開始 ----------
function roundDef(DATA, n) { return R(DATA).rounds.find(r => r.n === n); }
function beginRound(state, DATA, events, retry = false) {
  const rd = roundDef(DATA, state.round);
  if (!retry) {
    const st = R(DATA).start;
    const pre = rd.pre || {};
    if (pre.startGift) {
      giveUnitByCost(state, DATA, st.freeUnitCost, events);
      for (let i = 0; i < st.components; i++) giveComponent(state, DATA, events);
    }
    for (let i = 0; i < (pre.components || 0); i++) giveComponent(state, DATA, events);
    const queue = [];
    if (pre.bossReward) {
      const prev = state.history.length ? state.history[state.history.length - 1] : null;
      if (prev && prev.round === state.round - 1 && prev.win) {
        const seven = ((R(DATA).bossReward || {}).sevenCostBosses || []).includes(pre.bossReward);
        queue.push(makeRewardChoice(state, DATA, seven));
      } else {
        const lg = (R(DATA).bossReward || {}).loseGain || { components: 1 };
        for (let i = 0; i < (lg.components || 0); i++) giveComponent(state, DATA, events);
      }
    }
    if (pre.augment) queue.push(makeAugmentChoice(state, DATA, pre.augment));
    state.pendingQueue = queue;
  }
  state.freeRerolls = (state.freeRerolls || 0) + ruleSum(state, DATA, 'freeRerollPerRound');
  U.feedUnlocks(state, DATA, { kind: 'roundStart' });
  runUnlocks(state, DATA, events);   // 抽商店之前：開局禮、頭目獎勵帶來的解鎖，這次商店就保證出現
  S.rollShop(state, DATA, { roundStart: true });
  state.battle = null;
  nextPending(state);
  events.push({ type: 'roundStart', round: state.round, retry });
}

// ---------- 對外 ----------
export function newGame(seed, DATA) {
  const r = R(DATA);
  const state = {
    v: 1, seed, round: 1, phase: 'plan', lives: r.start.lives, gold: r.start.gold, level: r.start.level, xp: 0,
    score: 0, streak: 0, board: [], bench: new Array(r.benchSize).fill(null), itemBench: [],
    shop: [null, null, null, null, null], pool: S.newPool(DATA), rngShop: makeRng(hashSeed(seed, 'shop')).state(),
    augments: [], pendingChoices: null, pendingQueue: [], persist: {}, history: [], attempt: 0, uidNext: 1,
    freeRerolls: 0, rewardN: 0, counters: {}, battle: null,
    removers: 1, favs: [],   // 黃金卸除器（每局開場 1 個）、心鋼最愛標記（依放上去的順序存棋子 uid）
    unlocks: {}, unlockQueue: [], unlockAcc: {}, stats: { rerolls: 0, loseStreak: 0 },
  };
  beginRound(state, DATA, []);
  return state;
}

export function serialize(state) {
  const c = { ...state, battle: null };
  if (c.phase === 'battle' || c.phase === 'result') c.phase = 'plan';
  return JSON.stringify(c);
}
export function deserialize(json, DATA) {
  const s = typeof json === 'string' ? JSON.parse(json) : clone(json);
  if (s.v !== 1) throw new Error('存檔版本不合');
  s.battle = null;
  if (s.phase === 'battle' || s.phase === 'result') s.phase = 'plan';
  if (!s.pendingQueue) s.pendingQueue = [];
  if (!s.counters) s.counters = {};
  if (!s.unlocks) s.unlocks = {};
  if (!s.unlockQueue) s.unlockQueue = [];
  if (!s.unlockAcc) s.unlockAcc = {};
  if (!s.stats) s.stats = { rerolls: 0, loseStreak: 0 };
  if (!Array.isArray(s.favs)) s.favs = [];
  if (typeof s.removers !== 'number') s.removers = 1;   // 舊存檔：補 1 個卸除器
  normAugmentPending(s.pendingChoices, DATA);
  for (const q of s.pendingQueue) normAugmentPending(q, DATA);
  return s;
}

const needPlan = state => (state.phase !== 'plan' || state.pendingChoices ? no(state.phase === 'over' ? '遊戲已結束' : '現在不能操作') : null);

export function actions(state, DATA) {
  const plan = !needPlan(state);
  const r = R(DATA);
  const buyCost = r.xpCost + ruleSum(state, DATA, 'xpCostDelta');
  return {
    phase: state.phase, pending: state.pendingChoices ? state.pendingChoices.type : null,
    canStart: plan,
    buy: state.shop.map((c, i) => (plan ? S.canBuy(state, i, DATA) : no('現在不能操作'))),
    canReroll: plan && (state.freeRerolls > 0 || state.gold >= r.rerollCost),
    canBuyXp: plan && state.level < r.maxLevel && state.gold >= Math.max(0, buyCost),
    sell: plan ? S.allUnits(state).map(u => u.uid) : [],
    pop: population(state, DATA), maxPop: teamLimit(state, DATA),
    favorite: favoriteInfo(state, DATA), removers: state.removers || 0,
  };
}

export function actBuy(state, slot, DATA) {
  const g = needPlan(state); if (g) return g;
  const r = S.buy(state, slot, DATA);
  if (!r.ok) return r;
  const events = [{ type: 'buy', slot, uid: r.uid }];
  for (const m of r.merged) events.push({ type: 'merge', key: m.key, star: m.star });
  runUnlocks(state, DATA, events);
  return ok({ events, uid: r.uid });
}
export function actSell(state, uid, DATA) {
  const g = needPlan(state); if (g) return g;
  const r = S.sell(state, uid, DATA);
  if (!r.ok) return r;
  const events = [{ type: 'sell', uid, gold: r.gold }];
  runUnlocks(state, DATA, events);
  return ok({ gold: r.gold, events });
}
export function actReroll(state, DATA) {
  const g = needPlan(state); if (g) return g;
  if (state.freeRerolls > 0) state.freeRerolls--;
  else if (state.gold >= R(DATA).rerollCost) state.gold -= R(DATA).rerollCost;
  else return no('金錢不夠');
  if (!state.stats) state.stats = { rerolls: 0, loseStreak: 0 };
  state.stats.rerolls++;
  U.feedUnlocks(state, DATA, { kind: 'reroll' });
  const events = [{ type: 'reroll' }];
  runUnlocks(state, DATA, events);   // 先檢查再抽：這次重抽就讓剛解鎖的棋子出現
  S.rollShop(state, DATA);
  return ok({ events });
}
export function actBuyXp(state, DATA) {
  const g = needPlan(state); if (g) return g;
  const r = R(DATA);
  if (state.level >= r.maxLevel) return no('已經滿級了');
  const cost = Math.max(0, r.xpCost + ruleSum(state, DATA, 'xpCostDelta'));
  if (state.gold < cost) return no('金錢不夠');
  state.gold -= cost;
  const events = [{ type: 'xp', xp: r.xpPerBuy }];
  addXp(state, DATA, r.xpPerBuy, events);
  runUnlocks(state, DATA, events);
  return ok({ events });
}
export function actMove(state, uid, to, DATA) {
  const g = needPlan(state); if (g) return g;
  const f = S.findUnit(state, uid);
  if (!f) return no('找不到這隻棋子');
  const u = f.unit;
  const events = [{ type: 'move', uid }];
  if (to.zone === 'bench') {
    if (!(to.idx >= 0 && to.idx < state.bench.length)) return no('板凳格不存在');
    const other = state.bench[to.idx];
    if (other && other.uid === uid) return ok({ events: [] });
    if (f.zone === 'board') {
      if (other) {
        const d = slotsOf(DATA, other) - slotsOf(DATA, u);
        if (d > 0 && population(state, DATA) + d > teamLimit(state, DATA)) return no('人口滿了');
      }
      state.board.splice(f.idx, 1);
      if (other) { other.pos = u.pos; state.board.push(other); }
      state.bench[to.idx] = u; u.pos = null;
    } else { state.bench[f.idx] = other || null; state.bench[to.idx] = u; }
    runUnlocks(state, DATA, events);
    return ok({ events });
  }
  if (to.zone !== 'board' || !to.pos) return no('目標不對');
  const [r, c] = to.pos;
  if (!(r >= 0 && r < 4 && c >= 0 && c < 7)) return no('這格不在棋盤上');
  const other = state.board.find(x => x.pos[0] === r && x.pos[1] === c);
  if (other && other.uid === uid) return ok({ events: [] });
  if (f.zone === 'bench') {
    const delta = slotsOf(DATA, u) - (other ? slotsOf(DATA, other) : 0);
    if (delta > 0 && population(state, DATA) + delta > teamLimit(state, DATA)) return no('人口滿了');
    if (other) { state.board.splice(state.board.indexOf(other), 1); other.pos = null; state.bench[f.idx] = other; }
    else state.bench[f.idx] = null;
    u.pos = [r, c]; state.board.push(u);
  } else {
    if (other) other.pos = u.pos.slice();
    u.pos = [r, c];
  }
  runUnlocks(state, DATA, events);
  return ok({ events });
}
export function actEquip(state, itemIdx, uid, DATA) {
  const g = needPlan(state); if (g) return g;
  const item = state.itemBench[itemIdx];
  if (!item) return no('沒有這件裝備');
  const f = S.findUnit(state, uid);
  if (!f) return no('找不到這隻棋子');
  const r = S.giveItem(f.unit, item, DATA);
  if (r.r === 'full') return no('這隻已經有 ' + R(DATA).maxItems + ' 件了');
  state.itemBench.splice(itemIdx, 1);
  const events = [{ type: 'equip', uid, item }];
  if (r.r === 'combined') events.push({ type: 'itemCombine', uid, result: r.result });
  runUnlocks(state, DATA, events);
  return ok({ events });
}

// ---------- 心鋼最愛（手動選）----------
// 羈絆（Heartsteel）3 階給 1 個、5 階給 2 個「心鋼最愛」道具，玩家拖到一位成員身上＝選他強化技能。
// 道具不佔 3 件裝備格、不放在 itemBench 裡。標記存在 state.favs（棋子 uid，依放上去的順序）。
// 羈絆掉到 3 階以下：標記「留在原本那位身上但暫時失效」，羈絆回來就自動生效；那位被賣掉／合掉才會收回。
function favTrait(DATA) {
  for (const t of DATA.traits.list) {
    for (const eff of [...(t.always || []), ...((t.tiers || []).flat())]) if (eff.type === 'special' && eff.id === 'favorite') return t;
  }
  return null;
}
function favCap(state, DATA) {
  const t = favTrait(DATA);
  if (!t || !B.countTraits || !state.board.length) return 0;
  let info;
  try { info = B.countTraits(state.board.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, { augments: state.augments.slice() }).find(x => x.key === t.key); } catch (e) { return 0; }
  if (!info || !info.tier) return 0;
  let n = 0;
  for (const e of [...(t.always || []), ...((t.tiers || [])[info.tier - 1] || [])]) if (e.type === 'special' && e.id === 'favorite') n = Math.max(n, e.n || 0);
  return n;
}
const isFavMember = (DATA, key) => { const t = favTrait(DATA); return !!t && (DATA.units.byKey[key].traits || []).includes(t.key); };
// 回傳 { cap 目前最多幾個, held 還在棋子身上的標記（含暫時失效的）, active 目前有效的 uid, free 還沒放的個數, trait 羈絆 key }
export function favoriteInfo(state, DATA) {
  const t = favTrait(DATA);
  const cap = t ? favCap(state, DATA) : 0;
  const held = (state.favs || []).filter(uid => { const f = S.findUnit(state, uid); return f && isFavMember(DATA, f.unit.key); });
  const active = held.slice(0, cap);
  return { trait: t ? t.key : null, cap, held, active, free: Math.max(0, cap - active.length) };
}
function pruneFavs(state, DATA) { state.favs = favoriteInfo(state, DATA).held; }

// 把一個心鋼最愛放到某位成員身上；fromUid 有給＝從另一位身上改選過來
export function actSetFavorite(state, uid, DATA, fromUid = null) {
  const g = needPlan(state); if (g) return g;
  pruneFavs(state, DATA);
  const f = S.findUnit(state, uid);
  if (!f) return no('找不到這隻棋子');
  if (!isFavMember(DATA, f.unit.key)) return no('心鋼最愛只能放在心鋼之聲成員身上');
  const info = favoriteInfo(state, DATA);
  if (!info.cap) return no('心鋼之聲要 3 階才有心鋼最愛');
  if (info.active.includes(uid)) return no('這位已經有心鋼最愛了，不能放兩個');
  if (fromUid != null) {
    const i = state.favs.indexOf(fromUid);
    if (i < 0 || !info.active.includes(fromUid)) return no('那位身上沒有心鋼最愛');
    state.favs[i] = uid;
  } else {
    if (!info.free) return no('心鋼最愛都放完了，要改選就從別位身上拖過來');
    // 暫時失效的舊標記排在後面：新放的插在有效標記之後
    state.favs.splice(info.active.length, 0, uid);
  }
  state.favs = state.favs.filter((x, i, a) => a.indexOf(x) === i);
  return ok({ events: [{ type: 'favorite', uid, from: fromUid }] });
}
export function actMoveFavorite(state, fromUid, toUid, DATA) { return actSetFavorite(state, toUid, DATA, fromUid); }

// 黃金卸除器：把一隻身上所有裝備卸回裝備欄，用掉就消失
export function actUseRemover(state, uid, DATA) {
  const g = needPlan(state); if (g) return g;
  if (!(state.removers > 0)) return no('黃金卸除器已經用掉了');
  const f = S.findUnit(state, uid);
  if (!f) return no('找不到這隻棋子');
  const items = f.unit.items;
  if (!items.length) return no('這隻身上沒有裝備');
  if (state.itemBench.length + items.length > R(DATA).itemBenchSize) return no('裝備欄放不下，先空出位子再用');
  for (const it of items) state.itemBench.push(it);
  f.unit.items = [];
  state.removers -= 1;
  const events = [{ type: 'remove', uid, items: items.slice() }];
  runUnlocks(state, DATA, events);
  return ok({ events });
}

function applyOnPick(state, DATA, on, events) {
  if (!on) return;
  if (on.gold) { state.gold += on.gold; events.push({ type: 'gold', gold: on.gold }); }
  if (on.xp) addXp(state, DATA, on.xp, events);
  for (let i = 0; i < (on.components || 0); i++) giveComponent(state, DATA, events);
  for (let i = 0; i < (on.completed || 0); i++) giveCompleted(state, DATA, events);
  for (const u of on.units || []) for (let i = 0; i < (u.n || 1); i++) giveUnitByCost(state, DATA, u.cost, events);
  if (on.rerolls) state.freeRerolls = (state.freeRerolls || 0) + on.rerolls;
}

export function actPickAugment(state, idx, DATA) {
  const p = state.pendingChoices;
  if (!p || p.type !== 'augment') return no('現在沒有增幅可選');
  const key = p.options[idx];
  if (!key) return no('沒有這個選項');
  state.augments.push(key);
  const events = [{ type: 'augment', key }];
  applyOnPick(state, DATA, DATA.augments.byKey[key].onPick, events);
  nextPending(state);
  runUnlocks(state, DATA, events);
  return ok({ events });
}

// 增幅單張重抽：只換第 idx 張，其他兩張不變；新抽的不會跟畫面上另外兩張（或原本那張）重複
export function actRerollAugmentSlot(state, idx, DATA) {
  const p = state.pendingChoices;
  if (!p || p.type !== 'augment') return no('現在沒有增幅可選');
  normAugmentPending(p, DATA);
  if (!(idx >= 0 && idx < p.options.length)) return no('沒有這個選項');
  if (!(p.rerollLeft[idx] > 0)) return no('這一張的重抽用完了');
  const pool = DATA.augments.list.filter(a => a.tier === p.tier && !state.augments.includes(a.key)).map(a => a.key).sort();
  const shown = p.options;
  let cand = pool.filter(k => !shown.includes(k));
  if (!cand.length) cand = pool.filter(k => !shown.some((o, i) => i !== idx && o === k));   // 池子太小：至少不跟另外兩張重複
  if (!cand.length) return no('沒有別的增幅可以換了');
  const rng = makeRng(hashSeed(state.seed, 'reward', state.round, 'augslot', p.tier, idx, p.rerollN[idx] + 1));
  const key = rng.pick(cand);
  p.options[idx] = key;
  p.rerollLeft[idx] -= 1;
  p.rerollN[idx] += 1;
  return ok({ events: [{ type: 'augmentReroll', idx, key }], key });
}

// sub：介面一次選完兩段時用（成品／7 費的第幾個）；不給就走兩段 'reward' → 'rewardPick'
export function actPickReward(state, idx, DATA, maybeData) {
  let sub = null;
  if (maybeData !== undefined) { sub = DATA; DATA = maybeData; }
  const p = state.pendingChoices;
  if (!p || (p.type !== 'reward' && p.type !== 'rewardPick')) return no('現在沒有獎勵可選');
  const o = p.options[idx];
  if (!o) return no('沒有這個選項');
  const events = [];
  if (p.type === 'reward') {
    if (o.kind === 'gold') { state.gold += o.gold; events.push({ type: 'gold', gold: o.gold }); }
    else if (o.kind === 'unit') { if (state.pool[o.key] > 0) state.pool[o.key] -= 1; giveUnitKey(state, DATA, o.key, events); giveComponent(state, DATA, events); }
    else { // completed／seven：再選一次（介面給了 sub 就直接拿）
      if (sub != null && o.choices[sub]) {
        if (o.kind === 'completed') giveCompleted(state, DATA, events, o.choices[sub]);
        else giveUnitKey(state, DATA, o.choices[sub], events);
        nextPending(state);
        runUnlocks(state, DATA, events);
        return ok({ events });
      }
      setPending(state, { type: 'rewardPick', from: o.kind, options: o.choices.map(k => ({ key: k })) });
      return ok({ events: [{ type: 'rewardStage2', from: o.kind }] });
    }
  } else if (p.from === 'completed') giveCompleted(state, DATA, events, o.key);
  else giveUnitKey(state, DATA, o.key, events);
  nextPending(state);
  runUnlocks(state, DATA, events);
  return ok({ events });
}

// ---------- 戰鬥 ----------
function syntheticLoss(enemyTeam) {
  const units = enemyTeam.combatants.map(c => ({ id: c.id, side: c.side, key: c.key, zh: c.zh, star: c.star, cost: c.cost, hex: c.hex, hpMax: c.hp, manaMax: c.manaMax || 0, items: c.items || [] }));
  return {
    winner: 'enemy', seconds: 0, ticks: 0, units, events: [{ t: 0, e: 'end', winner: 'enemy' }],
    summary: { byUnit: {}, byTrait: {}, playerAlive: 0, enemyAlive: units.length, enemyHpPctLeft: 1, rewards: [], persist: null },
  };
}

export function actStartBattle(state, DATA) {
  const g = needPlan(state); if (g) return g;
  if (!B.buildTeam) return no('沒有戰前計算模組');
  const enemy = enemyForRound(state.round, state.seed, DATA);
  pruneFavs(state, DATA);
  const favAct = favoriteInfo(state, DATA).active;
  const pUnits = state.board.map(u => ({ key: u.key, star: u.star, items: u.items.slice(), pos: u.pos.slice(), ...(favAct.includes(u.uid) ? { fav: favAct.indexOf(u.uid) + 1 } : {}) }));
  const ctx = { level: state.level, round: state.round, augments: state.augments.slice(), persist: clone(state.persist),
    rng: makeRng(hashSeed(state.seed, 'combat', state.round, state.attempt, 'items')) };   // 竊賊手套用
  const pTeam = B.buildTeam('player', pUnits, DATA, ctx);
  const eTeam = B.buildTeam('enemy', enemy.units, DATA, { level: enemy.units.length, round: state.round, augments: [], persist: {}, mods: enemy.mods });
  let result;
  if (!pUnits.length) result = syntheticLoss(eTeam);
  else {
    if (!B.simulate) return no('沒有戰鬥引擎');
    result = B.simulate({ seed: hashSeed(state.seed, 'combat', state.round, state.attempt), teams: [pTeam, eTeam], persist: clone(state.persist), opts: { record: true, round: state.round } });
  }
  // 開戰當下的場上與羈絆（解鎖條件的累計要用；機制關閉就不算）
  let snap = null;
  if (U.enabled(DATA)) {
    let traits = [];
    try { if (B.countTraits && pUnits.length) traits = B.countTraits(pUnits.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, { augments: state.augments.slice() }); } catch (e) { traits = []; }
    snap = { board: pUnits, traits };
  }
  state.battle = { result, enemy, round: state.round, attempt: state.attempt, deferred: pTeam.deferred || [], snap };
  state.phase = 'battle';
  return ok({ result, enemy, playerTeam: pTeam, enemyTeam: eTeam });
}

function streakBonus(DATA, streak) {
  let v = 0;
  for (const [min, val] of R(DATA).income.streak) if (streak >= min) v = val;
  return v;
}

export function actFinishBattle(state, DATA) {
  if (state.phase !== 'battle' || !state.battle) return no('沒有進行中的戰鬥');
  const { result, enemy, round } = state.battle;
  const r = R(DATA);
  const retry = !!r.retryOnLose;
  const win = result.winner === 'player';
  const sm = result.summary || {};
  const gains = [];
  const events = [];
  const rd = roundDef(DATA, round);
  const isBoss = rd.type === 'boss';
  const S_ = sc(DATA);

  // 計分
  let roundScore;
  if (win) {
    const w = S_.win;
    roundScore = w.base + round * w.perRound + (sm.playerAlive || 0) * w.perAlive + Math.max(0, w.timeCap - (result.seconds || 0)) * w.perSecondUnder;
    roundScore = Math.round(roundScore);
    if (isBoss) roundScore *= w.bossMult;
  } else roundScore = Math.round((1 - (sm.enemyHpPctLeft === undefined ? 1 : sm.enemyHpPctLeft)) * S_.lose.mult);
  state.score += roundScore;

  // 勝負
  if (!state.stats) state.stats = { rerolls: 0, loseStreak: 0 };
  if (win) { state.streak += 1; state.stats.loseStreak = 0; } else { state.streak = 0; state.stats.loseStreak += 1; state.lives -= 1; }
  state.history.push({ round, win, score: roundScore, seconds: result.seconds || 0, enemyName: enemy.name });
  if (sm.persist) state.persist = { ...state.persist, ...sm.persist };   // 合併：引擎只回它有動的鍵也不會洗掉其他累計值

  const over = state.lives <= 0;
  const lastRound = round >= r.rounds.length;
  const cleared = !over && lastRound && (win || !retry);
  const advance = !retry || win;

  if (over) {
    const bonus = state.gold * S_.end.perGold;
    state.score += bonus;
    state.phase = 'over'; state.battle = null;
    return ok({ win, round, roundScore, gains, gameOver: true, endBonus: bonus, score: state.score });
  }

  // 收入（利息以發錢前的金錢算）
  const gold0 = state.gold;
  const add = (type, label, gold) => { if (gold) { state.gold += gold; gains.push({ type, label, gold }); } };
  if (U.enabled(DATA)) {   // 解鎖累計：發錢前的金幣、這回合的利息、開戰快照
    const snap = state.battle.snap || { board: [], traits: [] };
    U.feedUnlocks(state, DATA, { kind: 'battleEnd', result, win, board: snap.board, traits: snap.traits, goldBefore: gold0,
      interest: Math.min(interestCap(state, DATA), Math.floor(gold0 / r.income.interestPer)) });
  }
  if (advance) add('base', '基礎收入', r.income.base); // 重打模式輸了：不發基礎收入，只發利息
  const interest = Math.min(interestCap(state, DATA), Math.floor(gold0 / r.income.interestPer));
  add('interest', '利息', interest);
  if (win) { add('win', '勝利', r.income.win); add('streak', '連勝', streakBonus(DATA, state.streak)); }
  const label = src => {
    const m = /^(trait|aug|item):(.+)$/.exec(src || '');
    if (!m) return src || '效果';
    const t = m[1] === 'trait' ? DATA.traits.byKey[m[2]] : m[1] === 'aug' ? DATA.augments.byKey[m[2]] : DATA.items.byKey[m[2]];
    return (t && t.zh) || m[2];
  };
  for (const rw of (sm.rewards || [])) {
    const lb = label(rw.src);
    if (rw.type === 'gold') add('trait', lb, rw.value);
    else if (rw.type === 'xp') { addXp(state, DATA, rw.value, events); gains.push({ type: 'xp', label: lb, xp: rw.value }); }
    else if (rw.type === 'life') {
      // 生命可能是小數（例：每擊殺 +0.25）：先累計，滿 1 才加，最多回到開局命數
      const cap = r.maxLives || r.start.lives;
      state.persist.lifeFrac = (state.persist.lifeFrac || 0) + rw.value;
      const whole = Math.floor(state.persist.lifeFrac + 1e-9);
      if (whole > 0) {
        state.persist.lifeFrac -= whole;
        const n = Math.min(cap, state.lives + whole) - state.lives;
        state.lives += n;
        if (n > 0) gains.push({ type: 'life', label: lb, life: n });
      }
    }
    else if (rw.type === 'item') {
      const k = typeof rw.value === 'string' ? rw.value : giveComponent(state, DATA, events);
      if (typeof rw.value === 'string') S.addItemBench(state, k, DATA);
      gains.push({ type: 'item', label: lb, item: k });
    } else if (rw.type === 'unit') {
      const k = typeof rw.value === 'string' ? rw.value : (poolPick(state, DATA, rw.value || 1, rewardRng(state)));
      if (k) { if (typeof rw.value === 'number' || rw.value === undefined) state.pool[k] -= 1; giveUnitKey(state, DATA, k, events); gains.push({ type: 'unit', label: lb, unit: k }); }
    } else if (typeof rw.value === 'number') {
      // 其他跨回合累計值（熱度 heat、蒙多生命 mundoHp…）
      state.persist[rw.type] = (state.persist[rw.type] || 0) + rw.value;
      if (rw.type === 'heat') gains.push({ type: 'heat', label: lb, heat: rw.value });
    }
  }
  // 羈絆／增幅的經濟效果（buildTeam 的 deferred）
  const gainOne = (src, g, times) => {
    const lb = label(src);
    for (const k of Object.keys(g).sort()) {
      const v = g[k];
      if (k === 'gold') add('trait', lb, v * times);
      else if (k === 'xp') { addXp(state, DATA, v * times, events); gains.push({ type: 'xp', label: lb, xp: v * times }); }
      else if (k === 'unit' && v && v.key) {   // 指定棋子（作曲家：巴龍納什）；7 費同一隻最多 1 張
        if (DATA.units.byKey[v.key] && !(DATA.units.byKey[v.key].cost >= 7 && owned(state, v.key))) {
          giveUnitKey(state, DATA, v.key, events); gains.push({ type: 'unit', label: lb, unit: v.key });
        }
      } else if (k === 'unit') {
        for (let i = 0; i < times; i++) {
          const key = pickEconUnit(state, DATA, v, src);
          if (key) { giveUnitKey(state, DATA, key, events); gains.push({ type: 'unit', label: lb, unit: key }); }
        }
      } else if (k === 'item') { for (let i = 0; i < times; i++) gains.push({ type: 'item', label: lb, item: giveComponent(state, DATA, events) }); }
      else {   // heat 之類的累計值；羈絆 counter 有 max 就封頂
        const m = /^trait:(.+)$/.exec(src || '');
        const ct = m && DATA.traits.byKey[m[1]] ? DATA.traits.byKey[m[1]].counter : null;
        let nv = (state.persist[k] || 0) + v * times;
        if (ct && ct.persistKey === k && ct.max != null) nv = Math.min(ct.max, nv);
        const got = nv - (state.persist[k] || 0);
        state.persist[k] = nv;
        if (got > 0 && k === 'heat') gains.push({ type: 'heat', label: lb, heat: got });
        else if (got > 0 && ct && ct.label) gains.push({ type: 'counter', label: lb, counter: ct.label, value: got });
      }
    }
  };
  const deferred = (state.battle && state.battle.deferred) || [];
  for (const { src, effect: e } of deferred) {
    if (e.type !== 'econ') continue;
    const w = e.when;
    const hit = w === 'roundEnd' || (w === 'win' && win) || (w === 'lose' && !win) || (w === 'everyNRounds' && round % (e.n || 1) === 0);
    if (hit && e.gain) gainOne(src, e.gain, 1);
  }
  for (const { src, effect: e } of deferred) {
    if (e.type !== 'counterReward') continue;
    const ck = src + '|' + e.persistKey;
    const val = state.persist[e.persistKey] || 0;
    let reached = 0;
    for (const t of e.thresholds) if (val >= t) reached++;
    const claimed = state.counters[ck] || 0;
    if (reached > claimed) { state.counters[ck] = reached; gainOne(src, e.gain, reached - claimed); }
  }
  if (advance) { addXp(state, DATA, r.xpPerRound, events); gains.push({ type: 'xp', label: '回合經驗', xp: r.xpPerRound }); }
  runUnlocks(state, DATA, events);

  if (cleared) {
    const bonus = state.lives * S_.end.perLife + state.gold * S_.end.perGold + S_.end.clear;
    state.score += bonus;
    state.phase = 'over'; state.battle = null;
    return ok({ win, round, roundScore, gains, cleared: true, endBonus: bonus, score: state.score, events });
  }
  if (advance) { state.round += 1; state.attempt = 0; } else state.attempt += 1;
  state.battle = null;
  beginRound(state, DATA, events, !advance);
  return ok({ win, round, roundScore, gains, score: state.score, events });
}

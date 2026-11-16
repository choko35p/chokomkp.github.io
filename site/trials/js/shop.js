// shop.js — 卡池、商店、買賣、合星、裝備欄（純邏輯；不碰 window/document/fetch）
import { makeRng } from './rng.js';
import { isUnlocked } from './unlocks.js';

const cache = new WeakMap();
function idx(DATA) {
  let c = cache.get(DATA);
  if (c) return c;
  const byCost = {};
  const list = DATA.units.list.slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const u of list) (byCost[u.cost] = byCost[u.cost] || []).push(u.key);
  const compKeys = (DATA.items.components || []).map(x => (typeof x === 'string' ? x : x.key)).sort();
  const compSet = new Set(compKeys);
  const pair = {};
  const completed = [];
  const itemKeys = Object.keys(DATA.items.byKey).sort();
  for (const k of itemKeys) {
    const it = DATA.items.byKey[k];
    if (it && it.recipe && it.recipe.length === 2) {
      const pk = it.recipe.slice().sort().join('|');
      if (!pair[pk]) pair[pk] = k;
      completed.push(k);
    }
  }
  c = { byCost, compKeys, compSet, pair, completed };
  cache.set(DATA, c);
  return c;
}
export function itemIndex(DATA) { return idx(DATA); }

export function newPool(DATA) {
  const pool = {};
  const { byCost } = idx(DATA);
  for (const cost of Object.keys(byCost).map(Number).sort((a, b) => a - b)) {
    const n = DATA.rules.pool[String(cost)];
    if (n === undefined) continue; // 7 費不進卡池
    for (const k of byCost[cost]) pool[k] = n;
  }
  return pool;
}

export function returnToPool(state, key, n) {
  if (state.pool[key] !== undefined) state.pool[key] += n;
}

// 沒解鎖的棋子不進商店（沒列在 unlocks.json 的一開始就可抽）
export function available(state, DATA, key) { return isUnlocked(state, DATA, key); }

function oddsFor(state, DATA) {
  const t = DATA.rules.shopOdds;
  let lv = state.level;
  while (lv > 1 && !t[String(lv)]) lv--;
  return t[String(lv)];
}

function drawCard(state, rng, odds, DATA) {
  const { byCost } = idx(DATA);
  const w = [];
  for (let c = 1; c <= 5; c++) {
    let rem = 0;
    for (const k of byCost[c] || []) if (available(state, DATA, k)) rem += state.pool[k] || 0;
    w.push(rem > 0 ? odds[c - 1] : 0);
  }
  let total = 0;
  for (const x of w) total += x;
  if (total <= 0) return null;
  let r = rng.next() * total;
  let cost = 5;
  for (let i = 0; i < 5; i++) {
    if (w[i] <= 0) continue;
    if (r < w[i]) { cost = i + 1; break; }
    r -= w[i];
    cost = i + 1;
  }
  const keys = (byCost[cost] || []).filter(k => available(state, DATA, k));
  let sum = 0;
  for (const k of keys) sum += state.pool[k] || 0;
  let r2 = rng.next() * sum;
  let pick = null;
  for (const k of keys) {
    const n = state.pool[k] || 0;
    if (n <= 0) continue;
    pick = k;
    if (r2 < n) break;
    r2 -= n;
  }
  state.pool[pick] -= 1;
  return { key: pick, cost };
}

export function returnShop(state) {
  for (const c of state.shop) if (c) returnToPool(state, c.key, 1);
  state.shop = [null, null, null, null, null];
}

// opts.roundStart：回合開始那次抽店（guarantee:'nextRound' 時只有這次才放解鎖保證格）
export function rollShop(state, DATA, opts = {}) {
  returnShop(state);
  const rng = makeRng.fromState(state.rngShop);
  const odds = oddsFor(state, DATA);
  const out = [null, null, null, null, null];
  const fixed = [false, false, false, false, false];
  // 解鎖保證：下一次商店最右格出現剛解鎖的棋子（不消耗亂數）
  const queue = state.unlockQueue || [];
  const mode = (DATA.unlocks && DATA.unlocks.rule && DATA.unlocks.rule.guarantee) || 'nextShop';
  if (queue.length && (mode !== 'nextRound' || opts.roundStart)) {
    const q = queue.filter(k => costOf(DATA, k) === 7 || (state.pool[k] || 0) > 0);   // 池裡沒牌的移除，不卡住
    const take = q.slice(0, 5);
    take.forEach((k, i) => {
      const c = costOf(DATA, k);
      out[4 - i] = { key: k, cost: c, fresh: true };
      fixed[4 - i] = true;
      if (c !== 7) state.pool[k]--;
    });
    state.unlockQueue = q.filter(k => !take.includes(k));
  }
  for (let i = 0; i < 5; i++) if (!fixed[i]) out[i] = drawCard(state, rng, odds, DATA);
  state.rngShop = rng.state();
  state.shop = out;
  return out;
}

// ---------- 棋子位置 ----------
export function allUnits(state) {   // 不含散件鐵砧
  const out = state.board.slice();
  for (const u of state.bench) if (u && !isAnvil(u)) out.push(u);
  return out;
}
export function findUnit(state, uid) {
  const bi = state.board.findIndex(u => u.uid === uid);
  if (bi >= 0) return { unit: state.board[bi], zone: 'board', idx: bi };
  const ni = state.bench.findIndex(u => u && u.uid === uid);
  if (ni >= 0) return { unit: state.bench[ni], zone: 'bench', idx: ni };
  return null;
}
function benchFree(state) { return state.bench.findIndex(u => !u); }
function countStar1(state, key) {
  let n = 0;
  for (const u of allUnits(state)) if (u.key === key && u.star === 1) n++;
  return n;
}
export function makeUnit(state, key) {
  return { uid: state.uidNext++, key, star: 1, items: [], pos: null };
}
function costOf(DATA, key) { return DATA.units.byKey[key].cost; }

// ---------- 裝備 ----------
// 給一件裝備給棋子。回傳 {r:'added'|'combined'|'full', result?}
export function giveItem(unit, item, DATA) {
  const { compSet, pair } = idx(DATA);
  if (compSet.has(item)) {
    for (let i = 0; i < unit.items.length; i++) {
      const e = unit.items[i];
      if (!compSet.has(e)) continue;
      const res = pair[[item, e].sort().join('|')];
      if (res) { unit.items[i] = res; return { r: 'combined', result: res }; }
    }
  }
  if (unit.items.length < DATA.rules.maxItems) { unit.items.push(item); return { r: 'added' }; }
  return { r: 'full' };
}
// 兩件散件在裝備欄合成：回傳成品 key，不能合（有一件不是散件、或配不出成品）回 null。順序不影響。
export function combineResult(DATA, a, b) {
  const { compSet, pair } = idx(DATA);
  if (!a || !b || !compSet.has(a) || !compSet.has(b)) return null;
  return pair[[a, b].sort().join('|')] || null;
}
// 放進裝備欄；滿了變 1 金。回傳轉成的金幣。
// 站主 2026-11-16「多點自選的散件，不要一堆垃圾合不起來」：自選散件放在裝備欄，點開挑一件你要的散件
export const CHOICE = 'ChoiceComponent';
export const isChoice = (k) => k === CHOICE;
// 站主 2026-11-16「自選不要放在裝備區，要放在備戰席，賣掉可以選裝備」：散件鐵砧＝板凳上的一格，賣掉時挑一件散件
export const ANVIL = 'ComponentAnvil';
export const isAnvil = (u) => !!u && u.key === ANVIL;
export function addItemBench(state, item, DATA) {
  if (state.itemBench.length < DATA.rules.itemBenchSize) { state.itemBench.push(item); return 0; }
  state.gold += 1;
  return 1;
}

// ---------- 合星 ----------
// extra：板凳滿時剛買進、尚未放入的棋子
export function tryMerge(state, DATA, extra = null) {
  const merged = [];
  let guard = 0;
  while (guard++ < 50) {
    const groups = {};
    const order = [];
    const board = state.board.slice().sort((a, b) => a.uid - b.uid);
    for (const u of board) order.push({ u, zone: 'board' });
    state.bench.forEach((u, i) => { if (u && !isAnvil(u)) order.push({ u, zone: 'bench', i }); });
    for (const o of order) {
      if (o.u.star >= 3 || costOf(DATA, o.u.key) === 7) continue;
      const g = o.u.key + '|' + o.u.star;
      (groups[g] = groups[g] || []).push(o);
    }
    let gk = null;
    if (extra) {
      const g = extra.key + '|' + extra.star;
      if (groups[g] && groups[g].length >= 2) gk = g;
    }
    if (!gk) {
      const keys = Object.keys(groups).sort();
      for (const k of keys) {
        const need = 3 - (extra && k === extra.key + '|' + extra.star ? 1 : 0);
        if (groups[k].length >= need && groups[k].length >= 3) { gk = k; break; }
      }
    }
    if (!gk) break;
    const g = groups[gk];
    let chosen, usedExtra = false;
    if (extra && gk === extra.key + '|' + extra.star) {
      chosen = [g[0], g[1]];
      usedExtra = true;
    } else chosen = g.slice(0, 3);
    const survivor = chosen[0].u;
    const gather = [];
    for (let i = 1; i < chosen.length; i++) {
      const o = chosen[i];
      // 指定道具的標記跟著合出來的那隻走（被併掉的那隻身上有標記就轉給存活者；存活者已有就留一個）
      for (const id of Object.keys(state.picks || {})) {
        const arr = state.picks[id];
        const fi = arr.indexOf(o.u.uid);
        if (fi < 0) continue;
        if (arr.includes(survivor.uid)) arr.splice(fi, 1); else arr[fi] = survivor.uid;
      }
      gather.push(...o.u.items);
      if (o.zone === 'board') state.board.splice(state.board.indexOf(o.u), 1);
      else state.bench[o.i] = null;
    }
    if (usedExtra) { gather.push(...extra.items); extra = null; }
    survivor.star += 1;
    const leftovers = [];
    for (const it of gather) {
      const r = giveItem(survivor, it, DATA);
      if (r.r === 'full') leftovers.push(it);
    }
    for (const it of leftovers) addItemBench(state, it, DATA);
    merged.push({ key: survivor.key, star: survivor.star, uid: survivor.uid });
  }
  if (extra) { // 理論上不會發生：沒地方放
    const f = benchFree(state);
    if (f >= 0) { state.bench[f] = extra; extra = null; }
  }
  return merged;
}

export function canBuy(state, slot, DATA) {
  const card = state.shop[slot];
  if (!card) return { ok: false, reason: '這格是空的' };
  if (state.gold < card.cost) return { ok: false, reason: '金錢不夠' };
  if (benchFree(state) < 0 && !(countStar1(state, card.key) >= 2 && card.cost !== 7))
    return { ok: false, reason: '板凳滿了' };
  return { ok: true };
}

export function buy(state, slot, DATA) {
  const c = canBuy(state, slot, DATA);
  if (!c.ok) return c;
  const card = state.shop[slot];
  state.gold -= card.cost;
  state.shop[slot] = null;
  const unit = makeUnit(state, card.key);
  const f = benchFree(state);
  let merged;
  if (f >= 0) { state.bench[f] = unit; merged = tryMerge(state, DATA); }
  else merged = tryMerge(state, DATA, unit);
  return { ok: true, merged, uid: unit.uid };
}

export function sellValue(unit, DATA) {
  const cost = costOf(DATA, unit.key);
  const sp = DATA.rules.sellPrice || { star2Mult: 3, star3Mult: 9, minus: 1 };
  if (cost === 7) return (DATA.rules.sevenCost && DATA.rules.sevenCost.sellPrice) || 7;
  const adj = cost > 1 ? sp.minus : 0; // 1 費不扣（2★＝3、3★＝9）
  if (unit.star === 1) return cost;
  if (unit.star === 2) return cost * sp.star2Mult - adj;
  return cost * sp.star3Mult - adj;
}

export function sell(state, uid, DATA) {
  const f = findUnit(state, uid);
  if (!f) return { ok: false, reason: '找不到這隻棋子' };
  const u = f.unit;
  if (f.zone === 'board') state.board.splice(f.idx, 1);
  else state.bench[f.idx] = null;
  let gold = sellValue(u, DATA);
  state.gold += gold;
  const cost = costOf(DATA, u.key);
  if (cost !== 7) returnToPool(state, u.key, u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
  for (const it of u.items) gold += addItemBench(state, it, DATA);
  return { ok: true, gold };
}

// 是否放得下（板凳有空位，或放進去會合星）
export function canReceive(state, key, DATA, star = 1) {
  if (benchFree(state) >= 0) return true;
  if (costOf(DATA, key) === 7) return false;
  let n = 0;
  for (const u of allUnits(state)) if (u.key === key && u.star === star) n++;
  return n >= 2 && star < 3;
}
// 送棋子（獎勵／增幅／頭目獎勵／經濟效果用，商店購買不走這裡）：
//   1. 板凳有空格就放板凳；2. 板凳滿但放進去會合星就直接合；
//   3. 還是放不下：呼叫 placeOnBoard(unit)（由 game.js 傳進來，找場上空格放上去，可以超過人口上限），放得上去就算收下；
//   4. 場上也沒位子（或沒給 placeOnBoard）才賣掉。回傳 {placed, onBoard?, merged, gold?, uid?}
export function receiveUnit(state, key, DATA, star = 1, placeOnBoard = null) {
  const unit = makeUnit(state, key);
  unit.star = star;   // 增幅直接送 2 星：棋子池要扣 3 張，賣掉時也還 3 張
  const f = benchFree(state);
  if (f >= 0) { state.bench[f] = unit; return { placed: true, merged: tryMerge(state, DATA), uid: unit.uid }; }
  if (canReceive(state, key, DATA, star)) return { placed: true, merged: tryMerge(state, DATA, unit), uid: unit.uid };
  if (placeOnBoard && placeOnBoard(unit)) return { placed: true, onBoard: true, merged: tryMerge(state, DATA), uid: unit.uid };
  const g = sellValue(unit, DATA);
  state.gold += g;
  if (costOf(DATA, key) !== 7) returnToPool(state, key, 3 ** (star - 1));
  return { placed: false, merged: [], gold: g };
}

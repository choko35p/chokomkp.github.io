// game.js — 遊戲狀態機（純邏輯）
import { hashSeed, makeRng } from './rng.js';
import * as S from './shop.js';
import { enemyForRound, setCountTraits } from './enemies.js';
import * as U from './unlocks.js';
import * as H from './hex.js';
import * as MX from './mixer.js';

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
// 增幅總開關：rules.json 的 augment.enabled。false＝整個增幅系統關閉（不跳三選一、不抽稀有度、已選的增幅不生效）；
// 沒寫或 true＝照常。要恢復只要把 enabled 改回 true。
export function augmentsOn(DATA) { return ((R(DATA).augment || {}).enabled) !== false; }
// 目前真正生效的增幅（關閉時一律空，舊存檔裡已選的增幅也不生效，但仍留在 state.augments，開關打開後會恢復）
export function activeAugments(state, DATA) { return augmentsOn(DATA) ? (state.augments || []).slice() : []; }
function augEffects(state, DATA) {
  const out = [];
  for (const k of activeAugments(state, DATA)) {
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
    const list = B.countTraits(state.board.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, traitOpts(state, DATA));
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

// ---------- 上場位置、自動補位、超出人口 ----------
// 預設站位（升級自動補位、備戰席滿時溢出上場、快捷鍵「上場」共用）：
//   前排定位（坦克、鬥士）放前排空格，從最前面一排找起（0 排），同一排由中間往兩邊；
//   其他定位（施法者、射手、專家、刺客）放後排，從最後面一排找起（3 排）往前；
//   查不到定位的棋子放最前排最左的空格。沙灘樂器佔的格子、已經有棋子的格子不放。找不到空格回 null。
const FRONT_ROLES = ['Tank', 'Fighter'];
const CENTER_COLS = [3, 2, 4, 1, 5, 0, 6];
export function defaultCell(state, DATA, key) {
  const rc = DATA.units.byKey[key] && DATA.units.byKey[key].roleClass;
  const front = !rc || FRONT_ROLES.includes(rc);
  const rows = front ? [0, 1, 2, 3] : [3, 2, 1, 0];
  const cols = rc ? CENTER_COLS : [0, 1, 2, 3, 4, 5, 6];
  const used = new Set(state.board.map(u => u.pos[0] + ',' + u.pos[1]));
  for (const r of rows) for (const c of cols) if (!used.has(r + ',' + c) && instAt(state, r, c) < 0) return [r, c];
  return null;
}
// 開戰時場上人口還沒放滿：把板凳最左邊的棋子依序補上場，直到滿了或板凳空了（放不下的 2 人口棋子跳過，繼續看下一隻）。回傳補上場的 uid
export function autoFillBoard(state, DATA) {
  const placed = [];
  for (let i = 0; i < state.bench.length; i++) {
    if (population(state, DATA) >= teamLimit(state, DATA)) break;
    const u = state.bench[i];
    if (!u) continue;
    if (population(state, DATA) + slotsOf(DATA, u) > teamLimit(state, DATA)) continue;
    const cell = defaultCell(state, DATA, u.key);
    if (!cell) break;
    state.bench[i] = null; u.pos = cell; state.board.push(u);
    placed.push(u.uid);
  }
  return placed;
}
// 備戰席滿了又不能合星時，收到的棋子先放場上（可以超過人口上限；超出的標 ov＝第幾個被放上來的）
function placeOverflowFn(state, DATA) {
  return (unit) => {
    const cell = defaultCell(state, DATA, unit.key);
    if (!cell) return false;
    unit.pos = cell; state.board.push(unit);
    if (population(state, DATA) > teamLimit(state, DATA)) unit.ov = state.ovN = (state.ovN || 0) + 1;
    return true;
  };
}
export const overUnits = (state, DATA) => (population(state, DATA) > teamLimit(state, DATA) ? state.board.filter(u => u.ov) : []);
// 人口沒超出就把 ov 標記清掉；還超出而且板凳有空格，就讓最後放上去的先跳回板凳。回傳跳回板凳的 uid
export function settleOverflow(state, DATA) {
  const back = [];
  for (let guard = 0; guard < 60; guard++) {
    if (population(state, DATA) <= teamLimit(state, DATA)) { for (const u of state.board) delete u.ov; break; }
    const bi = state.bench.findIndex(x => !x);
    const cand = state.board.filter(u => u.ov).sort((a, b) => b.ov - a.ov)[0];
    if (bi < 0 || !cand) break;
    state.board.splice(state.board.indexOf(cand), 1);
    delete cand.ov; cand.pos = null; state.bench[bi] = cand;
    back.push(cand.uid);
  }
  return back;
}
function settleEvents(state, DATA, events) {
  const back = settleOverflow(state, DATA);
  if (back.length) events.push({ type: 'ovBack', uids: back });
}
// 開戰前：場上還超出人口上限就先移回板凳，板凳放不下才賣掉。順序：最後放上去的先走；沒標記的（人口上限掉了）從最新的棋子開始
function trimToLimit(state, DATA, events) {
  settleEvents(state, DATA, events);
  for (let guard = 0; guard < 60 && state.board.length && population(state, DATA) > teamLimit(state, DATA); guard++) {
    const v = state.board.filter(u => u.ov).sort((a, b) => b.ov - a.ov)[0] || state.board.slice().sort((a, b) => b.uid - a.uid)[0];
    const bi = state.bench.findIndex(x => !x);
    if (bi >= 0) {
      state.board.splice(state.board.indexOf(v), 1); delete v.ov; v.pos = null; state.bench[bi] = v;
      events.push({ type: 'autoBench', uid: v.uid, key: v.key });
    } else {
      const gold = S.sellValue(v, DATA);
      S.sell(state, v.uid, DATA);
      events.push({ type: 'autoSell', uid: v.uid, key: v.key, star: v.star, gold });
    }
  }
  for (const u of state.board) delete u.ov;
}

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
function poolPick(state, DATA, cost, rng, need = 1) {
  // 該費用還有張數（至少 need 張）的棋子，照剩餘張數的比例抽；該費用沒有就往低費找
  for (let c = cost; c >= 1; c--) {
    const keys = DATA.units.list.filter(u => u.cost === c && (state.pool[u.key] || 0) >= need && availKey(state, DATA, u.key)).map(u => u.key).sort();
    if (!keys.length) continue;
    let sum = 0;
    for (const k of keys) sum += state.pool[k];
    let r = rng.next() * sum;
    for (const k of keys) { if (r < state.pool[k]) return k; r -= state.pool[k]; }
    return keys[keys.length - 1];
  }
  return null;
}
// star：送幾星的棋子（2 星＝從棋子池扣 3 張）
function giveUnitByCost(state, DATA, cost, events, star = 1) {
  const copies = 3 ** (star - 1);
  const key = poolPick(state, DATA, cost, rewardRng(state), copies);
  if (!key) return null;
  state.pool[key] -= copies;
  return giveUnitKey(state, DATA, key, events, star);
}
function giveUnitKey(state, DATA, key, events, star = 1) {
  const r = S.receiveUnit(state, key, DATA, star, placeOverflowFn(state, DATA));
  events.push({ type: 'unit', key, star, placed: r.placed, ...(r.onBoard ? { onBoard: true } : {}), ...(r.gold ? { gold: r.gold } : {}) });
  for (const m of r.merged || []) events.push({ type: 'merge', key: m.key, star: m.star });
  settleEvents(state, DATA, events);
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
    const lr = ruleSum(state, DATA, 'levelUpRerolls');   // 向上流動：每次升級送刷新
    if (lr) state.freeRerolls = (state.freeRerolls || 0) + lr;
  }
  if (state.level >= r.maxLevel) state.xp = 0;
}

// ---------- 選擇視窗 ----------
// 增幅分階段（SPEC_AUGMENTS）：整場三次增幅（2-1、3-2、4-2）的稀有度開局一次抽好；每個增幅有自己的出現階段
// tierCombos 每列＝[第 1 次, 第 2 次, 第 3 次, 份數]；份數越大越常出現
export function rollAugTiers(seed, DATA) {
  if (!augmentsOn(DATA)) return null;   // 增幅關閉：不抽稀有度組合
  const ac = R(DATA).augment || {};
  const rows = ac.tierCombos;
  if (!rows || !rows.length) return null;
  let sum = 0;
  for (const r of rows) sum += r[3];
  const rng = makeRng(hashSeed(seed, 'augTiers'));
  let x = rng.next() * sum;
  for (const r of rows) { if (x < r[3]) return r.slice(0, 3); x -= r[3]; }
  return rows[rows.length - 1].slice(0, 3);
}
function augStage(DATA, slot) { return ((R(DATA).augment || {}).stages || [])[slot - 1] || null; }
function augTierOf(state, DATA, slot) {
  if (!state.augTiers) state.augTiers = rollAugTiers(state.seed, DATA);   // 舊存檔：同一個種子補算
  return state.augTiers ? state.augTiers[slot - 1] : slot;
}
// 這個稀有度＋階段還能抽的增幅（沒拿過的）；stage 沒給＝不限階段
function augPool(state, DATA, tier, stage) {
  return DATA.augments.list.filter(a => a.tier === tier && !state.augments.includes(a.key)
    && (!stage || !a.stages || a.stages.includes(stage))).map(a => a.key).sort();
}
function makeAugmentChoice(state, DATA, slot) {
  const tier = augTierOf(state, DATA, slot);
  const stage = augStage(DATA, slot);
  const ac = R(DATA).augment || {};
  const n = ac.choices ?? DEF.augmentChoices;
  let pool = augPool(state, DATA, tier, stage);
  const rng = makeRng(hashSeed(state.seed, 'reward', state.round, 'aug', tier, 0));
  let options = rng.shuffle(pool).slice(0, n);
  if (options.length < n) {   // 保底：這個階段不夠 3 個，用同稀有度其他階段的補（照現在資料不會發生）
    const more = rng.shuffle(augPool(state, DATA, tier, null).filter(k => !options.includes(k)));
    options = options.concat(more).slice(0, n);
  }
  const per = ac.rerollsPerChoice ?? DEF.augmentRerolls;
  // 照官方：每一張各有自己的重抽鍵（每張各 per 次），只換那一張。rerollN[i]＝第 i 張已經換過幾次（決定性亂數用）
  return { type: 'augment', tier, stage, slot, options, seen: options.slice(), rerollLeft: options.map(() => per), rerollN: options.map(() => 0) };   // seen＝這次三選一出現過的所有增幅（含被重抽換掉的），重抽不會再抽到
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
  if (!Array.isArray(p.seen)) p.seen = (p.options || []).slice();   // 舊存檔：只知道目前畫面上的
  else for (const k of p.options || []) if (!p.seen.includes(k)) p.seen.push(k);
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
        for (let i = 0; i < ((R(DATA).bossReward || {}).winComponents || 0); i++) giveComponent(state, DATA, events);   // 贏頭目：獎勵之外再多給散件
      } else {
        const lg = (R(DATA).bossReward || {}).loseGain || { components: 1 };
        for (let i = 0; i < (lg.components || 0); i++) giveComponent(state, DATA, events);
      }
    }
    if (pre.augment && augmentsOn(DATA)) queue.push(makeAugmentChoice(state, DATA, pre.augment));
    state.pendingQueue = queue;
  }
  if (!retry) {   // 私房錢：每回合開始給錢
    const rg = ruleSum(state, DATA, 'roundStartGold');
    if (rg) { state.gold += rg; events.push({ type: 'gold', gold: rg }); }
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
    picks: { fav: [], spot: [], deal: [], prod: [], clone: [], inst: [] },   // 指定道具的標記：各道具的棋子 uid，最早放的在前；inst（沙灘樂器）存的是格子 [r,c]，不是棋子
    mixer: MX.emptyMix(),   // ILLBEATS 混音器：db＝[攻擊, 法強, 生命, 金幣] 分貝，last＝最近調過的通道（掉階時從最後調的那條扣回）
    prodTrait: null, dealFrom: null,   // 合作邀請選到的起源；蒙多第一次上場開戰的回合（唱片合約的份數從這裡算）
    unlocks: {}, unlockQueue: [], unlockAcc: {}, stats: { rerolls: 0, loseStreak: 0 },
    augTiers: rollAugTiers(seed, DATA),   // 三次增幅的稀有度（1 銀 2 金 3 彩），開局抽好
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
  if (s.augTiers === undefined) s.augTiers = rollAugTiers(s.seed, DATA);
  if (!s.picks) {   // 舊存檔：心鋼最愛標記搬進 picks；聚光燈、合約、製作人照原本自動選的結果補上，不會突然沒效果
    s.picks = { fav: Array.isArray(s.favs) ? s.favs : [], spot: [], deal: [], prod: [], clone: [] };
    delete s.favs; delete s.removers;
    s.prodTrait = null; s.dealFrom = null;
    autoPicks(s, DATA, { only: ['spot', 'deal', 'prod'] });
  }
  for (const id of PICK_IDS) if (!Array.isArray(s.picks[id])) s.picks[id] = [];
  if (!Array.isArray(s.picks.inst)) {   // 舊存檔沒有沙灘樂器：海灘流行有啟動的話，照原本「自動吃到」的結果自動擺好，不會突然沒效果
    s.picks.inst = [];
    autoPicks(s, DATA, { only: ['inst'] });
  }
  if (s.prodTrait === undefined) s.prodTrait = null;
  if (!s.mixer || !Array.isArray(s.mixer.db)) {   // 舊存檔沒有混音器：ILLBEATS 有啟動就照預設分法補上，不會突然沒效果
    s.mixer = MX.emptyMix();
    autoMixer(s, DATA);
  } else fitMixer(s, DATA);
  if (s.dealFrom === undefined) s.dealFrom = null;
  if (!augmentsOn(DATA)) {   // 增幅關閉：舊存檔卡在增幅三選一的直接略過（不選、不給效果），佇列裡排著的增幅也丟掉；已選的增幅留在 state.augments 但不生效
    s.pendingQueue = s.pendingQueue.filter(q => !q || q.type !== 'augment');
    if (s.pendingChoices && s.pendingChoices.type === 'augment') nextPending(s);
    else if (s.phase === 'augment') s.phase = s.pendingChoices ? 'reward' : 'plan';
  }
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
    favorite: favoriteInfo(state, DATA), picks: pickInfo(state, DATA),
  };
}

export function actBuy(state, slot, DATA) {
  const g = needPlan(state); if (g) return g;
  const r = S.buy(state, slot, DATA);
  if (!r.ok) return r;
  const events = [{ type: 'buy', slot, uid: r.uid }];
  for (const m of r.merged) events.push({ type: 'merge', key: m.key, star: m.star });
  settleEvents(state, DATA, events);
  runUnlocks(state, DATA, events);
  fitMixer(state, DATA);
  return ok({ events, uid: r.uid });
}
export function actSell(state, uid, DATA) {
  const g = needPlan(state); if (g) return g;
  const r = S.sell(state, uid, DATA);
  if (!r.ok) return r;
  prunePicks(state, DATA);   // 賣掉的棋子身上的標記收回
  fitMixer(state, DATA);
  const events = [{ type: 'sell', uid, gold: r.gold }];
  settleEvents(state, DATA, events);
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
  fitMixer(state, DATA);
  return ok({ events });
}
// 站主 2026-11-16「自動補要開始戰鬥，人數不夠再補」：按開戰時場上人口還沒放滿才自動補位（見 autoFillBoard）
function fillAtBattle(state, DATA, events) {
  if (state.noAutoFill) return;   // noAutoFill：教學頁的關卡狀態用，讓學員自己拖
  const placed = autoFillBoard(state, DATA);
  if (placed.length) events.push({ type: 'autoFill', uids: placed });
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
      state.bench[to.idx] = u; u.pos = null; delete u.ov;
    } else { state.bench[f.idx] = other || null; state.bench[to.idx] = u; }
    settleEvents(state, DATA, events);
    runUnlocks(state, DATA, events);
    fitMixer(state, DATA);
    return ok({ events });
  }
  if (to.zone !== 'board' || !to.pos) return no('目標不對');
  const [r, c] = to.pos;
  if (!(r >= 0 && r < 4 && c >= 0 && c < 7)) return no('這格不在棋盤上');
  if (instAt(state, r, c) >= 0) return no('那格有沙灘樂器，棋子不能站上去；先把樂器移開');
  const other = state.board.find(x => x.pos[0] === r && x.pos[1] === c);
  if (other && other.uid === uid) return ok({ events: [] });
  if (f.zone === 'bench') {
    const delta = slotsOf(DATA, u) - (other ? slotsOf(DATA, other) : 0);
    if (delta > 0 && population(state, DATA) + delta > teamLimit(state, DATA)) return no('人口滿了');
    if (other) { state.board.splice(state.board.indexOf(other), 1); other.pos = null; delete other.ov; state.bench[f.idx] = other; }
    else state.bench[f.idx] = null;
    u.pos = [r, c]; state.board.push(u);
  } else {
    if (other) other.pos = u.pos.slice();
    u.pos = [r, c];
  }
  settleEvents(state, DATA, events);
  runUnlocks(state, DATA, events);
  fitMixer(state, DATA);
  return ok({ events });
}
// 裝備欄合成：把 from 格的散件拖到 to 格的另一件散件上（停 0.5 秒才會觸發，計時在介面）。成品放在 to 格，from 格的散件消失
export function actCombineItems(state, from, to, DATA) {
  const g = needPlan(state); if (g) return g;
  if (from === to) return no('要拖到另一件裝備上');
  const a = state.itemBench[from], b = state.itemBench[to];
  if (!a || !b) return no('沒有這件裝備');
  const res = S.combineResult(DATA, a, b);
  if (!res) return no('這兩件合不起來');
  state.itemBench[to] = res;
  state.itemBench.splice(from, 1);
  return ok({ result: res, events: [{ type: 'itemMerge', result: res, parts: [a, b] }] });
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

// ---------- 指定道具（裝備欄旁邊那一排，可重複用、可重選）----------
// 心鋼最愛、聚光燈、唱片合約、合作邀請、分身站位：羈絆有啟動才有，標記存在 state.picks[id]（棋子 uid，最早放的在前）。
// 道具不佔 3 件裝備格、也不放在 itemBench 裡。羈絆掉階或棋子下場：標記留著但暫時失效，回來自動恢復。
// 沒放就沒效果，不會偷偷幫玩家自動選（autoPicks 只給機器人和舊存檔遷移用）。
export const PICK_IDS = ['fav', 'spot', 'deal', 'prod', 'clone'];
const unitKeyTraits = (DATA, key) => (DATA.units.byKey[key] && DATA.units.byKey[key].traits) || [];
const originsOf = (DATA, key) => unitKeyTraits(DATA, key).filter(k => DATA.traits.byKey[k] && DATA.traits.byKey[k].kind === 'origin');
const heartsteelN = (DATA, tier) => {
  const t = DATA.traits.byKey.Heartsteel; let n = 0;
  if (!t) return 0;
  for (const e of [...(t.always || []), ...((t.tiers || [])[tier - 1] || [])]) if (e.type === 'special' && e.id === 'favorite') n = Math.max(n, e.n || 0);
  return n;
};
export const PICKS = {
  fav: {
    trait: 'Heartsteel',
    cap: (state, DATA, tr) => (tr.Heartsteel && tr.Heartsteel.tier ? heartsteelN(DATA, tr.Heartsteel.tier) : 0),
    okUnit: (DATA, u) => (unitKeyTraits(DATA, u.key).includes('Heartsteel') ? null : '心鋼最愛只能放在心鋼之聲成員身上'),
    off: '心鋼之聲要 3 階才有心鋼最愛',
  },
  spot: {
    trait: 'Manager',
    cap: (state, DATA, tr) => (tr.Manager && tr.Manager.tier ? 1 : 0),
    okUnit: () => null,
    off: '經紀人要 2 階才有聚光燈',
  },
  deal: {
    trait: 'RecordMogul',
    cap: (state, DATA, tr) => (tr.RecordMogul && tr.RecordMogul.tier ? 1 + (state.dealFrom == null ? 0 : Math.max(0, Math.floor((state.round - state.dealFrom) / 4))) : 0),
    okUnit: () => null,
    off: '蒙多醫生要在場上才有唱片合約',
  },
  prod: {
    trait: 'Producer',
    cap: (state, DATA, tr) => (tr.Producer && tr.Producer.tier ? 1 : 0),
    okUnit: (DATA, u) => (!unitKeyTraits(DATA, u.key).includes('Producer') && originsOf(DATA, u.key).length ? null : '他沒有樂團可以合作'),
    off: '索娜要在場上才有合作邀請',
  },
  clone: {
    trait: 'BoyBand',
    cap: (state, DATA, tr) => (tr.BoyBand && tr.BoyBand.tier ? 1 : 0),
    okUnit: () => null,
    off: '銳空要在場上才有分身站位',
  },
};

// 合作邀請目前有效的起源（標記那隻在場上、而且真的有這個起源）；沒有就 null
function prodEffective(state, DATA) {
  const uid = ((state.picks && state.picks.prod) || []).find(x => { const f = S.findUnit(state, x); return f && f.zone === 'board'; });
  if (uid == null || !state.prodTrait) return null;
  const f = S.findUnit(state, uid);
  return unitKeyTraits(DATA, f.unit.key).includes(state.prodTrait) ? state.prodTrait : null;
}
// 算「玩家羈絆」時要帶的參數：所有玩家方的 countTraits 都要用這個，羈絆列才會和實戰一致
export function traitOpts(state, DATA) {
  return { augments: activeAugments(state, DATA), producerPick: prodEffective(state, DATA), manual: true };
}
U.setTraitOpts(traitOpts);
const boardTraitMap = (state, DATA) => {
  const tr = {};
  if (!B.countTraits || !state.board.length) return tr;
  try { for (const t of B.countTraits(state.board.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, traitOpts(state, DATA))) tr[t.key] = t; } catch (e) { /* 算不出來就當沒有 */ }
  return tr;
};

// 回傳 { fav:{cap, held, active, free, trait}, spot, deal, prod:{…, trait 選到的起源}, clone }
//   cap＝目前數量（羈絆沒開＝0）、held＝還在棋子身上的全部標記、active＝held 裡「棋子在場上」的前 cap 個、free＝cap − active 的個數
export function pickInfo(state, DATA) {
  const tr = boardTraitMap(state, DATA);
  const out = {};
  for (const id of PICK_IDS) {
    const P = PICKS[id];
    const cap = P.cap(state, DATA, tr);
    const held = ((state.picks && state.picks[id]) || []).filter((uid, i, a) => a.indexOf(uid) === i && S.findUnit(state, uid));
    const active = held.filter(uid => S.findUnit(state, uid).zone === 'board').slice(0, cap);
    out[id] = { cap, held, active, free: Math.max(0, cap - active.length), trait: id === 'fav' ? 'Heartsteel' : id === 'prod' ? (state.prodTrait || null) : null };
  }
  out.inst = instInfo(state, tr);
  return out;
}

// ---------- 沙灘樂器（海灘流行）----------
// 3 階給 1 個、5 階 2 個、7 階 3 個；擺在我方半場的空格（state.picks.inst＝[[r,c], …]，最早擺的在前），佔格但不算人口、棋子不能站上去。
// 羈絆掉階：只有最早擺的前 cap 個有效，其餘變灰、留在原位，湊回原階自動恢復。
const INST_ROWS = 4, INST_COLS = 7;
const instList = state => (state.picks && Array.isArray(state.picks.inst) ? state.picks.inst : []);
export function instAt(state, r, c) { return instList(state).findIndex(p => p[0] === r && p[1] === c); }
function instInfo(state, tr) {
  const cap = tr.BeachPop && tr.BeachPop.tier ? tr.BeachPop.tier : 0;
  const held = instList(state).map(p => [p[0], p[1]]);
  const active = held.slice(0, cap);
  return { cap, held, active, off: held.slice(cap), free: Math.max(0, cap - active.length) };
}
export function instCovered(pos) {   // 一個樂器相鄰 6 格（我方半場座標；超出棋盤的不算）
  return H.neighbors({ row: 4 + pos[0], col: pos[1] }).filter(h => h.row >= 4).map(h => [h.row - 4, h.col]);
}
// 擺放／移動／收回／頂掉：op＝{ to:[r,c]|null, from:[r,c]|null }
//   from 空＝從道具列拿一個新的擺到 to；from 有、to 有＝換格子；from 有、to 空＝收回道具列
export function actInstrument(state, op, DATA) {
  const g = needPlan(state); if (g) return g;
  const list = state.picks.inst = instList(state);
  const info = instInfo(state, boardTraitMap(state, DATA));
  const from = op && op.from ? op.from : null, to = op && op.to ? op.to : null;
  const events = [{ type: 'instrument', from, to }];
  if (from) {
    const i = instAt(state, from[0], from[1]);
    if (i < 0) return no('那格沒有樂器');
    if (!to) { list.splice(i, 1); events[0].type = 'instrumentBack'; return ok({ events }); }
    if (to[0] === from[0] && to[1] === from[1]) return ok({ events: [] });
    const bad = instCellErr(state, to); if (bad) return no(bad);
    list[i] = [to[0], to[1]];
    return ok({ events });
  }
  if (!to) return no('要拖到我方棋盤的空格');
  if (!info.cap) return no('海灘流行要 3 階才有沙灘樂器');
  const bad = instCellErr(state, to); if (bad) return no(bad);
  if (info.free <= 0) {   // 都擺完了：最早擺的那個被頂掉，新的接在有效區的最後面（先進先出）
    list.shift();   // list[0] 就是有效區裡最早擺的
    list.splice(Math.max(0, info.cap - 1), 0, [to[0], to[1]]);
    events[0].type = 'instrumentReplace';
    return ok({ events });
  }
  list.push([to[0], to[1]]);
  return ok({ events });
}
function instCellErr(state, to) {
  if (!(to[0] >= 0 && to[0] < INST_ROWS && to[1] >= 0 && to[1] < INST_COLS)) return '樂器只能放在我方棋盤';
  if (state.board.some(u => u.pos && u.pos[0] === to[0] && u.pos[1] === to[1])) return '那格有棋子，樂器要放在空格';
  if (instAt(state, to[0], to[1]) >= 0) return '那格已經有樂器了';
  return null;
}
export function prunePicks(state, DATA) {
  if (!state.picks) state.picks = {};
  for (const id of PICK_IDS) {
    state.picks[id] = (state.picks[id] || []).filter((uid, i, a) => a.indexOf(uid) === i && S.findUnit(state, uid)
      && (id !== 'fav' || !PICKS.fav.okUnit(DATA, S.findUnit(state, uid).unit)));
  }
  if (!state.picks.prod.length) state.prodTrait = null;
}

// 放／取消／重選一個指定道具。
//   actPick(state, id, uid, DATA, opts)；opts.from＝從哪隻身上的標記拖過來（api.act 會把 DATA 放在最後，所以兩種順序都收）
export function actPick(state, id, uid, a, b) {
  const DATA = a && a.traits ? a : b;
  const opts = (a && a.traits ? b : a) || {};
  const g = needPlan(state); if (g) return g;
  const P = PICKS[id]; if (!P) return no('沒有這種道具');
  prunePicks(state, DATA);
  const f = S.findUnit(state, uid);
  if (!f) return no('找不到這隻棋子');
  const info = pickInfo(state, DATA)[id];
  if (!info.cap) return no(P.off);
  const bad = P.okUnit(DATA, f.unit); if (bad) return no(bad);
  const list = state.picks[id];
  const events = [{ type: 'pick', id, uid, from: opts.from != null ? opts.from : null }];
  const pickTrait = (unit) => { state.prodTrait = originsOf(DATA, unit.key)[0] || null; };
  if (opts.from != null) {   // 把棋子身上的標記拖到另一隻
    const i = list.indexOf(opts.from);
    if (i < 0) return no('那隻身上沒有這個標記');
    if (opts.from === uid) return ok({ events: [] });
    if (list.includes(uid)) return no('他身上已經有了');
    list[i] = uid;
    if (id === 'prod') pickTrait(f.unit);
    return ok({ events });
  }
  if (list.includes(uid)) {
    if (id === 'prod') {   // 合作邀請：拖到已標記的那隻＝換成他的下一個起源
      const os = originsOf(DATA, f.unit.key);
      const k = os.indexOf(state.prodTrait);
      state.prodTrait = os[(k + 1) % os.length];
      return ok({ events });
    }
    list.splice(list.indexOf(uid), 1);   // 已經有這個標記＝取消
    events[0].type = 'unpick';
    return ok({ events });
  }
  if (info.free <= 0) {   // 都放完了：最早放的那個自動取消，改放到這隻
    const oldest = info.active[0];
    if (oldest != null) list.splice(list.indexOf(oldest), 1);
  }
  list.push(uid);
  if (id === 'prod') pickTrait(f.unit);
  fitMixer(state, DATA);
  return ok({ events });
}

// ---------- ILLBEATS 混音器 ----------
// 回傳 { active, tier, cap, used, free, db:[攻擊,法強,生命,金幣], last, locked, per, values, teamShare, boost }
//   per＝成員每 1 分貝的數值（已含 4 階強化）；values＝目前這組分貝換成的成員數值（隊友拿 teamShare 成）
export function mixerInfo(state, DATA) {
  const P = MX.mixerParams(DATA);
  const t = boardTraitMap(state, DATA).ILLBEATS;
  const tier = t ? t.tier : 0, cap = MX.mixerCap(P, tier);
  const m = state.mixer && Array.isArray(state.mixer.db) ? { db: state.mixer.db.slice(), last: (state.mixer.last || []).slice() } : MX.emptyMix();
  if (tier > 0) MX.fitMix(m, cap); else m.db = MX.CH.map((_, i) => Math.max(0, Math.floor(m.db[i] || 0)));
  const used = tier > 0 ? MX.sumDb(m.db) : 0;
  const per = {}; for (const ch of MX.CH) per[ch] = MX.mixerPer(P, tier || 1, ch);
  return { active: tier > 0, tier, cap, used, free: cap - used, db: tier > 0 ? m.db : [0, 0, 0, 0], last: m.last, locked: state.phase !== 'plan' || !!state.pendingChoices,
    per, values: MX.mixerValues(P, tier || 1, tier > 0 ? m.db : [0, 0, 0, 0]), bp: t ? t.breakpoints[tier - 1] : 0, teamShare: P.teamShare, boost: MX.mixerBoost(P, tier), presets: MX.PRESETS };
}
// 戰前計算用的分貝陣列（ILLBEATS 沒啟動就不給，stats 會當沒有）
export function mixerDb(state, DATA) { const i = mixerInfo(state, DATA); return i.active ? i.db.slice() : undefined; }
// 階數掉了、上限變小：多的分貝從最後調的那條扣回（階數 0 的時候不動，羈絆回來還在）
export function fitMixer(state, DATA) {
  if (!state.mixer) state.mixer = MX.emptyMix();
  const i = mixerInfo(state, DATA);
  if (i.active) { state.mixer.db = i.db.slice(); state.mixer.last = i.last.filter(k => MX.CH.includes(k)); }
  return state;
}
// 沒人調的自動分法（機器人、舊存檔）：攻擊／法強／生命平分
export function autoMixer(state, DATA) {
  const i = mixerInfo(state, DATA);
  state.mixer = i.active ? MX.defaultMix(i.cap) : (state.mixer || MX.emptyMix());
  return state;
}
const mixerGuard = (state, DATA) => {
  if (state.phase === 'battle' || state.phase === 'result') return no('戰鬥中混音器鎖住，下一回合佈陣再調');
  const g = needPlan(state); if (g) return g;
  const i = mixerInfo(state, DATA);
  return i.active ? null : no('ILLBEATS 還沒啟動，沒有混音器');
};
// 把某條推桿推到 v 分貝（整數）；最多推到「還沒用的分貝」為止。ch：'ad'|'ap'|'hp'|'gold'
export function actSetMixer(state, ch, v, DATA) {
  const g = mixerGuard(state, DATA); if (g) return g;
  if (!MX.CH.includes(ch)) return no('沒有這條推桿');
  if (!Number.isFinite(Number(v))) return no('分貝要是數字');
  fitMixer(state, DATA);
  const i = mixerInfo(state, DATA);
  const before = state.mixer.db.slice();
  const nv = MX.setChannel(state.mixer, ch, Number(v), i.cap);
  return ok({ events: [{ type: 'mixer', ch, db: nv, changed: before[MX.CH.indexOf(ch)] !== nv }] });
}
export function actMixerPreset(state, id, DATA) {
  const g = mixerGuard(state, DATA); if (g) return g;
  const m = MX.presetMix(id, mixerInfo(state, DATA).cap);
  if (!m) return no('沒有這個預設');
  state.mixer = m;
  return ok({ events: [{ type: 'mixer', preset: id }] });
}
export function actMixerReset(state, DATA) {
  const g = mixerGuard(state, DATA); if (g) return g;
  state.mixer = MX.emptyMix();
  return ok({ events: [{ type: 'mixer', reset: true }] });
}

// 心鋼最愛：舊介面留著當包裝（機器人、舊測試用）
export function favoriteInfo(state, DATA) { return pickInfo(state, DATA).fav; }
export function actSetFavorite(state, uid, DATA, fromUid = null) { return actPick(state, 'fav', uid, DATA, fromUid != null ? { from: fromUid } : {}); }
export function actMoveFavorite(state, fromUid, toUid, DATA) { return actPick(state, 'fav', toUid, DATA, { from: fromUid }); }

// 開戰用的玩家棋子與 buildTeam 參數：actStartBattle 和棋子面板的數值預覽共用，面板數字才會跟實戰一致
export function battleUnits(state, DATA) {
  const info = pickInfo(state, DATA);
  const units = state.board.map(u => {
    const o = { key: u.key, star: u.star, items: u.items.slice(), pos: u.pos.slice() };
    const fi = info.fav.active.indexOf(u.uid);
    if (fi >= 0) o.fav = fi + 1;
    if (info.spot.active.includes(u.uid)) o.spot = true;
    if (info.deal.active.includes(u.uid)) o.deal = true;
    if (info.clone.active.includes(u.uid)) o.cloneAt = true;
    return o;
  });
  return { units, ctx: { producerPick: info.prod.active.length ? prodEffective(state, DATA) : null, manual: true, instruments: info.inst.active.map(p => p.slice()), mixer: mixerDb(state, DATA) } };
}

// 自動選法（機器人、舊存檔遷移）：fav／spot／deal＝場上裝備最多的前幾隻（同數取費用高、key 字母序）；
// prod＝場上人數最多的起源；clone 不放。
export function autoPicks(state, DATA, opts = {}) {
  const only = opts.only || ['prod', 'fav', 'spot', 'deal', 'inst', 'mixer'];
  if (!state.picks) state.picks = { fav: [], spot: [], deal: [], prod: [], clone: [], inst: [] };
  if (only.includes('inst')) autoInstruments(state, DATA);
  if (only.includes('mixer')) autoMixer(state, DATA);
  const rank = (a, b) => b.items.length - a.items.length || DATA.units.byKey[b.key].cost - DATA.units.byKey[a.key].cost
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || a.uid - b.uid;
  for (const id of ['prod', 'fav', 'spot', 'deal']) {
    if (!only.includes(id)) continue;
    const cap = pickInfo(state, DATA)[id].cap;
    if (!cap) continue;
    if (id === 'prod') {
      const cnt = {};
      const seen = new Set();
      for (const u of state.board) { if (seen.has(u.key)) continue; seen.add(u.key); for (const k of originsOf(DATA, u.key)) cnt[k] = (cnt[k] || 0) + 1; }
      let best = null, bn = -1;
      for (const k of Object.keys(cnt).sort()) if (cnt[k] > bn) { bn = cnt[k]; best = k; }
      if (!best) continue;
      const m = state.board.filter(u => unitKeyTraits(DATA, u.key).includes(best) && !unitKeyTraits(DATA, u.key).includes('Producer')).sort(rank)[0];
      if (!m) continue;
      state.picks.prod = [m.uid]; state.prodTrait = best;
      continue;
    }
    const pool = state.board.filter(u => id !== 'fav' || !PICKS.fav.okUnit(DATA, u)).sort(rank);
    state.picks[id] = pool.slice(0, cap).map(u => u.uid);
  }
  return state;
}

// 沙灘樂器的自動擺法：每個樂器放在「能多碰到我方棋子」的空格（同數先看海灘流行成員，再依 r、c 順序）
function autoInstruments(state, DATA) {
  const cap = instInfo(state, boardTraitMap(state, DATA)).cap;
  state.picks.inst = [];
  if (!cap) return;
  const taken = new Set(state.board.filter(u => u.pos).map(u => u.pos[0] + ',' + u.pos[1]));
  const covered = new Set();
  for (let n = 0; n < cap; n++) {
    let best = null, bs = null;
    for (let r = 0; r < INST_ROWS; r++) for (let c = 0; c < INST_COLS; c++) {
      if (taken.has(r + ',' + c)) continue;
      let all = 0, mem = 0;
      for (const [rr, cc] of instCovered([r, c])) {
        const u = state.board.find(x => x.pos && x.pos[0] === rr && x.pos[1] === cc);
        if (!u || covered.has(u.uid)) continue;
        all++; if (unitKeyTraits(DATA, u.key).includes('BeachPop')) mem++;
      }
      if (!bs || all > bs[0] || (all === bs[0] && mem > bs[1])) { bs = [all, mem]; best = [r, c]; }
    }
    if (!best) break;
    state.picks.inst.push(best); taken.add(best[0] + ',' + best[1]);
    for (const [rr, cc] of instCovered(best)) { const u = state.board.find(x => x.pos && x.pos[0] === rr && x.pos[1] === cc); if (u) covered.add(u.uid); }
  }
}

// 黃金卸除器：把一隻身上所有裝備卸回裝備欄；每局都有、可以一直用
export function actUseRemover(state, uid, DATA) {
  const g = needPlan(state); if (g) return g;
  const f = S.findUnit(state, uid);
  if (!f) return no('找不到這隻棋子');
  const items = f.unit.items;
  if (!items.length) return no('這隻身上沒有裝備');
  if (state.itemBench.length + items.length > R(DATA).itemBenchSize) return no('裝備欄放不下，先空出位子再用');
  for (const it of items) state.itemBench.push(it);
  f.unit.items = [];
  const events = [{ type: 'remove', uid, items: items.slice() }];
  runUnlocks(state, DATA, events);
  return ok({ events });
}

// 只從「含某個散件」的成品裡抽（劍匠：含暴風之劍）
function pickCompletedFrom(state, DATA, comp) {
  const list = S.itemIndex(DATA).completed.filter(k => (DATA.items.byKey[k].recipe || []).includes(comp));
  return rewardRng(state).pick(list.length ? list : S.itemIndex(DATA).completed);
}
function applyOnPick(state, DATA, on, events) {
  if (!on) return;
  if (on.gold) { state.gold += on.gold; events.push({ type: 'gold', gold: on.gold }); }
  if (on.xp) addXp(state, DATA, on.xp, events);
  for (let i = 0; i < (on.components || 0); i++) giveComponent(state, DATA, events);
  for (let i = 0; i < (on.completed || 0); i++) giveCompleted(state, DATA, events, on.completedFrom ? pickCompletedFrom(state, DATA, on.completedFrom) : null);
  for (const u of on.units || []) for (let i = 0; i < (u.n || 1); i++) giveUnitByCost(state, DATA, u.cost, events, u.star || 1);
  if (on.tankItem) giveCompleted(state, DATA, events, rewardRng(state).pick(on.tankItem));
  if (on.rerolls) state.freeRerolls = (state.freeRerolls || 0) + on.rerolls;
}

export function actPickAugment(state, idx, DATA) {
  const p = state.pendingChoices;
  if (!augmentsOn(DATA)) return no('增幅已關閉');
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
  if (!augmentsOn(DATA)) return no('增幅已關閉');
  if (!p || p.type !== 'augment') return no('現在沒有增幅可選');
  normAugmentPending(p, DATA);
  if (!(idx >= 0 && idx < p.options.length)) return no('沒有這個選項');
  if (!(p.rerollLeft[idx] > 0)) return no('這一張的重抽用完了');
  // 候選：沒拿過（augPool 已排除玩家擁有的）、而且這次三選一沒出現過的。同階段不夠就用同稀有度其他階段補
  const seen = p.seen;
  let cand = augPool(state, DATA, p.tier, p.stage).filter(k => !seen.includes(k));
  if (!cand.length) cand = augPool(state, DATA, p.tier, null).filter(k => !seen.includes(k));
  if (!cand.length) { p.rerollLeft[idx] = 0; return no('沒有別的增幅可以換了，這張的重抽鍵變灰'); }
  const rng = makeRng(hashSeed(state.seed, 'reward', state.round, 'augslot', p.tier, idx, p.rerollN[idx] + 1));
  const key = rng.pick(cand);
  p.options[idx] = key;
  seen.push(key);
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
  const trimEvents = [];
  trimToLimit(state, DATA, trimEvents);   // 場上超出人口：先移回板凳，放不下才賣
  fillAtBattle(state, DATA, trimEvents);   // 人數不夠：開戰前從板凳最左邊補上場
  prunePicks(state, DATA);
  fitMixer(state, DATA);
  if (state.dealFrom == null && state.board.some(u => u.key === 'DrMundo')) state.dealFrom = state.round;   // 唱片合約每 4 回合多 1 份，從蒙多第一次上場開戰那回合算
  const bu = battleUnits(state, DATA);
  const pUnits = bu.units;
  const pinfo = pickInfo(state, DATA);
  const unset = ['fav', 'spot', 'deal', 'prod', 'inst'].filter(id => pinfo[id].cap > 0 && !pinfo[id].active.length);
  const mx = mixerInfo(state, DATA);
  if (mx.active && mx.used === 0) unset.push('mixer');
  const ctx = { level: state.level, round: state.round, augments: activeAugments(state, DATA), persist: clone(state.persist), ...bu.ctx,
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
    try { if (B.countTraits && pUnits.length) traits = B.countTraits(pUnits.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, traitOpts(state, DATA)); } catch (e) { traits = []; }
    snap = { board: pUnits, traits };
  }
  state.battle = { result, enemy, round: state.round, attempt: state.attempt, deferred: pTeam.deferred || [], snap, mixer: pTeam.mixer || null };
  state.phase = 'battle';
  return ok({ result, enemy, playerTeam: pTeam, enemyTeam: eTeam, events: trimEvents.concat(unset.length ? [{ type: 'pickUnset', ids: unset }] : []) });
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
  const ihp = ruleSum(state, DATA, 'interestHp');   // 投資策略：每賺 1 點利息，全隊永久 +生命
  if (ihp && interest > 0) state.persist.interestHp = (state.persist.interestHp || 0) + interest * ihp;
  if (win) { add('win', '勝利', r.income.win); add('streak', '連勝', streakBonus(DATA, state.streak)); }
  // 混音器的金幣推桿：我方棋子每擊殺一隻敵人，依機率拿 1 金（官方是「參與擊殺」，這裡只算最後一擊，推測）
  const mxg = state.battle.mixer;
  if (mxg && mxg.gold && (mxg.gold.member > 0 || mxg.gold.other > 0)) {
    const grng = makeRng(hashSeed(state.seed, 'mixerGold', round, state.attempt || 0));
    let got = 0;
    for (const ev of result.events || []) {
      if (ev.e !== 'death' || !ev.killer || String(ev.id)[0] !== 'e' || String(ev.killer)[0] !== 'p') continue;
      const p = mxg.members.includes(ev.killer) ? mxg.gold.member : mxg.gold.other;
      if (p > 0 && grng.next() < p) got += 1;
    }
    add('trait', 'ILLBEATS 混音器', got);
  }
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
  if (!over && !(lastRound && (win || !retry))) { settleEvents(state, DATA, events); }
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

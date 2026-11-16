// 邊玩邊學的關卡狀態機（純邏輯，Node 可測；不碰 window／document／fetch，不用 Math.random 與 Date）。
// 座標：關卡資料的 pos＝[排, 欄]，合併棋盤 8×7（我方 4～7 排，前排在 4；敵方 3～0 排，前排在 3），跟 hex.js 同一套。
//   我方棋子在遊戲狀態裡是半場座標 [排-4, 欄]；敵方在 rules 回合定義裡是 [3-排, 6-欄]（enemies.js 的 fixed 欄位）。
import * as G from '../../trials/js/game.js';
import * as S from '../../trials/js/shop.js';
import { indexData } from '../../trials/js/data.js';
import { hashSeed, makeRng } from '../../trials/js/rng.js';
import { countTraits } from '../../trials/js/stats.js';
import { evalCond, describe } from './checks.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const COLS_MID_OUT = [3, 2, 4, 1, 5, 0, 6];
export const DEFAULT_HP = 100;

// ---------- 資料 ----------
// raw = { units, traits, items, augments, rules, enemies, unlocks, lessons }
export function indexLearn(raw) {
  const DATA = indexData(raw);
  return { DATA, lessons: raw.lessons.lessons, version: raw.lessons.version, unitInfo: raw.lessons.units };
}
export const lessonById = (L, id) => L.lessons.find(x => x.id === id);

const toEnemyPos = (pos) => [3 - pos[0], 6 - pos[1]];
const toPlayerPos = (pos) => [pos[0] - 4, pos[1]];

// ---------- 第 12 關：用固定種子產生的敵人 ----------
function genEnemy(DATA, lessonId, plan, n) {
  const rng = makeRng(hashSeed('learn-enemy', lessonId, n));
  const list = DATA.units.list.filter(u => u.cost <= plan.maxCost);
  const tanks = rng.shuffle(list.filter(u => u.lr === 'tank'));
  const carries = rng.shuffle(list.filter(u => u.lr === 'carry'));
  const nT = Math.min(tanks.length, Math.ceil(plan.count / 2));
  const nC = Math.min(carries.length, plan.count - nT);
  const front = tanks.slice(0, nT), back = carries.slice(0, nC);
  if (plan.boss) {
    const bi = front.findIndex(u => u.key === plan.bossKey);
    if (bi >= 0) front.splice(bi, 1);
    front.unshift(DATA.units.byKey[plan.bossKey]);
    if (front.length > nT) front.pop();
  }
  const out = [];
  front.forEach((u, i) => out.push({ key: u.key, star: 1, items: [], pos: [3, COLS_MID_OUT[i]], tank: true }));
  back.forEach((u, i) => out.push({ key: u.key, star: 1, items: [], pos: [0, COLS_MID_OUT[i]] }));
  // 二星：費用高的先升
  const order = out.slice().sort((a, b) => DATA.units.byKey[b.key].cost - DATA.units.byKey[a.key].cost);
  order.slice(0, plan.star2 || 0).forEach(u => { u.star = 2; });
  if (plan.boss) { const b = out.find(u => u.key === plan.bossKey); b.star = plan.bossStar || 2; b.boss = true; }
  // 裝備：第一件給輸出（巨人殺手），第二件給坦（日炎斗篷）
  const itemList = ['GiantSlayer', 'SunfireCape'];
  for (let i = 0; i < (plan.items || 0); i++) {
    const want = i === 0 ? out.find(u => !u.tank) : out.find(u => u.tank && !u.boss && !u.items.length) || out.find(u => u.tank);
    if (want) want.items.push(itemList[i]);
  }
  return out.map(({ tank, ...u }) => u);
}

// 這一關每一回合的敵人（關卡座標）
export function enemiesOf(DATA, lesson) {
  if (Array.isArray(lesson.enemies)) return lesson.enemies;
  if (lesson.enemies === 'generated') return lesson.enemyPlan.map((p, i) => genEnemy(DATA, lesson.id, p, i + 1));
  return [lesson.enemy];
}
export const roundsOf = (lesson) => (lesson.setup.rounds || 1);

// 這一關專用的資料：BASE 加上這一關的回合表（最後多放一個一樣的回合，避免遊戲跑到「通關」就結束）
export function lessonData(BASE, lesson) {
  const n = roundsOf(lesson);
  const enemies = enemiesOf(BASE, lesson);
  const rounds = [];
  for (let i = 1; i <= n + 1; i++) {
    const list = enemies[Math.min(i - 1, enemies.length - 1)];
    const plan = lesson.enemies === 'generated' ? lesson.enemyPlan[Math.min(i - 1, lesson.enemyPlan.length - 1)] : null;
    const enemy = { fixed: list.map(u => ({ key: u.key, star: u.star || 1, items: u.items || [], pos: toEnemyPos(u.pos), ...(u.boss ? { boss: true } : {}) })), name: '對手' };
    if (plan && plan.hpMult) enemy.hpMult = plan.hpMult;
    if (plan && plan.dmgMult) enemy.dmgMult = plan.dmgMult;
    if (plan && plan.boss) {
      enemy.name = '頭目';
      enemy.boss = { key: plan.bossKey, hpMult: plan.bossHpMult || 1, dmgMult: 1, ccCap: 0.5, slotsScale: 1.3 };
    }
    rounds.push({ n: i, type: 'normal', enemy });
  }
  return { ...BASE, rules: { ...BASE.rules, rounds, componentChoice: false } };   // 教學關卡的散件照關卡設定，不出自選
}

// ---------- 開局 ----------
function takePool(state, key, star) {
  if (state.pool[key] === undefined) return;
  state.pool[key] = Math.max(0, state.pool[key] - 3 ** ((star || 1) - 1));
}
function setShopCards(state, DATA, keys) {
  S.returnShop(state);
  state.shop = keys.map(k => {
    if (!k) return null;
    state.pool[k] = Math.max(0, (state.pool[k] || 0) - 1);
    return { key: k, cost: DATA.units.byKey[k].cost };
  });
  while (state.shop.length < 5) state.shop.push(null);
}

export function applySetup(state, DATA, setup) {
  state.level = setup.level; state.xp = setup.xp || 0; state.gold = setup.gold;
  state.noAutoFill = true;   // 教學關卡要讓玩家自己把棋子拖上場，不套用升級自動補位
  state.board = []; state.bench = new Array(DATA.rules.benchSize).fill(null);
  for (const u of setup.board || []) {
    const x = S.makeUnit(state, u.key); x.star = u.star || 1; x.pos = toPlayerPos(u.pos);
    state.board.push(x); takePool(state, u.key, x.star);
  }
  let bi = 0;
  for (const u of setup.bench || []) {
    const x = S.makeUnit(state, u.key); x.star = u.star || 1;
    state.bench[bi++] = x; takePool(state, u.key, x.star);
  }
  state.itemBench = (setup.items || []).slice();
  S.returnShop(state);   // 開局那次抽到的牌先放回池子，再套這關指定的池子張數（不然放回去會把「池子是空的」補回來）
  for (const [k, n] of Object.entries(setup.pool || {})) state.pool[k] = n;
  if (Array.isArray(setup.shop)) setShopCards(state, DATA, setup.shop);
  else if (setup.shop === 'off') { S.returnShop(state); }
  else S.rollShop(state, DATA);
  state.stats = { rerolls: 0, loseStreak: 0 }; state.streak = 0;
  state.round = 1; state.attempt = 0; state.phase = 'plan';
}

const roleOf = (DATA, key) => (DATA.units.byKey[key] || {}).lr;

// ---------- Session ----------
export class Session {
  // seed：商店亂數種子。UI 傳隨機數；固定種子的關卡（setup.seed）用關卡自己的。
  constructor(BASE, lesson, { seed = 1, route = null } = {}) {
    this.lesson = lesson;
    this.DATA = lessonData(BASE, lesson);
    this.setup = lesson.setup;
    const sd = lesson.setup.shop === 'seeded' && lesson.setup.seed ? lesson.setup.seed : seed;
    this.state = G.newGame(sd, this.DATA);
    applySetup(this.state, this.DATA, lesson.setup);
    this.hp = lesson.setup.hp != null ? lesson.setup.hp : DEFAULT_HP;
    this.route = route;
    this.stats = { battles: 0, bought: 0, ownCost: [], scouted: 0, rerolls: 0, interest: 0, emptyRounds: 0, bestWin: 0, bestLose: 0, streakRun: { win: 0, lose: 0 } };
    this.start = null; this.last = null; this.snapshot = null;
    this.scriptFired = new Set();
    this.passed = false; this.passedMsg = null;
    this.startBlock = null;
    this.pending = null;       // 開戰後、finish 之前的戰鬥
    this.history = [];         // 每場結果：{win, gains, hpLoss}
    const own = [...this.state.board, ...this.state.bench].filter(Boolean);
    this.base = { star2: own.filter(u => u.star >= 2).length, star3: own.filter(u => u.star >= 3).length };
    this.enemiesPlan = enemiesOf(BASE, lesson);
  }

  get rounds() { return roundsOf(this.lesson); }
  get ended() { return this.stats.battles >= this.rounds && !this.pending; }
  get canRetry() { return this.rounds === 1; }
  ctx() { return { state: this.state, DATA: this.DATA, stats: this.stats, start: this.start, last: this.last, base: this.base, hp: this.hp }; }

  // ----- 規則開關 -----
  shopOff() { return this.setup.shop === 'off'; }
  rerollOff() { return this.setup.reroll === 'off' || this.shopOff(); }
  buyXpOff() { return this.setup.buyXp === 'off'; }
  popMax() { return G.teamLimit(this.state, this.DATA); }
  popUsed() { return G.population(this.state, this.DATA); }
  poolLeft(key) { return this.state.pool[key] || 0; }

  // ----- 操作 -----
  act(name, ...args) {
    if (this.pending) return { ok: false, reason: '戰鬥中' };
    if (name === 'buy' && this.shopOff()) return { ok: false, reason: '這一關沒有商店' };
    if (name === 'reroll' && this.rerollOff()) return { ok: false, reason: '這一關先不用重抽' };
    if ((name === 'buyXp' || name === 'levelUp') && this.buyXpOff()) return { ok: false, reason: '這一關先不用買經驗' };
    if (this.stats.battles >= this.rounds && this.rounds > 1) return { ok: false, reason: '這一關打完了' };
    const fn = G['act' + name[0].toUpperCase() + name.slice(1)];
    if (!fn) throw new Error('沒有這個動作：' + name);
    let card = null;
    if (name === 'buy') card = this.state.shop[args[0]];
    const r = fn(this.state, ...args, this.DATA);
    if (!r || !r.ok) return r || { ok: false };
    this.startBlock = null;
    if (name === 'buy') {
      this.stats.bought++;
      if (card && !this.stats.ownCost.includes(card.cost)) this.stats.ownCost.push(card.cost);
    } else if (name === 'reroll') {
      this.stats.rerolls++;
      this._script();
    }
    this._evaluate();
    return r;
  }

  _script() {
    (this.setup.script || []).forEach((sc, i) => {
      if (this.scriptFired.has(i)) return;
      const m = /^firstRerollAtLevel(\d+)$/.exec(sc.when || '');
      if (m && this.state.level >= Number(m[1])) { this.scriptFired.add(i); setShopCards(this.state, this.DATA, sc.shop); }
    });
  }

  scout() { this.stats.scouted++; this._evaluate(); }

  // 開戰：回傳 { ok, result, enemy, ... }（跟 G.actStartBattle 一樣）；擋下來時 ok:false＋reason
  go() {
    if (this.pending) return { ok: false, reason: '戰鬥中' };
    if (this.ended && this.rounds > 1) return { ok: false, reason: '這一關打完了' };
    const warn = this.notice();
    if (warn && warn.block) { this.startBlock = warn; return { ok: false, reason: warn.msg, fail: true }; }
    const st = this.state;
    this.snapshot = { state: clone(st), hp: this.hp, stats: clone({ ...this.stats, battles: 0 }), };
    const board = st.board.slice();
    const tc = countTraits(board.map(u => ({ key: u.key, star: u.star, items: u.items })), this.DATA, {});
    const traits = {};
    for (const t of tc) traits[t.key] = t.count;
    const itemOn = [];
    for (const u of board) for (const it of u.items) itemOn.push(it + '|' + roleOf(this.DATA, u.key));
    this.start = { board: board.length, gold: st.gold, level: st.level, traits, itemOn, pop: this.popUsed(), max: this.popMax() };
    const r = G.actStartBattle(st, this.DATA);
    if (!r || !r.ok) { this.start = null; return r; }
    this.pending = r;
    return r;
  }

  // 戰鬥播完後呼叫：結算收入、扣血、更新統計、判定過關
  finish() {
    if (!this.pending) return { ok: false, reason: '沒有進行中的戰鬥' };
    const res = this.pending.result;
    const win = res.winner === 'player';
    const alive = [];
    for (const u of res.units) if (u.side === 'player' && res.summary.byUnit[u.id] && res.summary.byUnit[u.id].alive) alive.push(u.key);
    const enemyAlive = res.summary.enemyAlive || 0;
    const fin = G.actFinishBattle(this.state, this.DATA);
    this.pending = null;
    if (!fin || !fin.ok) return fin;
    this.stats.battles++;
    if (this.start && this.start.pop < this.start.max) this.stats.emptyRounds++;
    const sr = this.stats.streakRun;
    if (win) { sr.win++; sr.lose = 0; } else { sr.lose++; sr.win = 0; }
    this.stats.bestWin = Math.max(this.stats.bestWin, sr.win);
    this.stats.bestLose = Math.max(this.stats.bestLose, sr.lose);
    for (const g of fin.gains || []) if (g.type === 'interest') this.stats.interest += g.gold;
    let hpLoss = 0;
    if (!win) { hpLoss = 4 + enemyAlive * 2; this.hp -= hpLoss; }
    this.last = { win, alive, enemyAlive };
    this.history.push({ win, gains: fin.gains || [], hpLoss, enemyAlive });
    this._evaluate();
    return { ...fin, win, hpLoss, enemyAlive, alive };
  }

  // 再排一次：回到這場開打前（battles 照算，其他都還原）
  retry() {
    if (!this.snapshot) return false;
    const battles = this.stats.battles;
    this.state = clone(this.snapshot.state);
    this.hp = this.snapshot.hp;
    this.stats = { ...clone(this.snapshot.stats), battles };
    this.pending = null; this.start = null; this.startBlock = null;
    return true;
  }

  // ----- 判定 -----
  conds() { return this.lesson.pass.all; }
  checks() { const c = this.ctx(); return this.conds().map(cd => ({ cond: cd, label: describe(cd, this.DATA), done: evalCond(cd, c) })); }
  _evaluate() {
    if (this.passed) return;
    const c = this.ctx();
    if (this.conds().every(cd => evalCond(cd, c))) { this.passed = true; }
  }

  // 目前要顯示的提醒（失敗條件、裝錯人）；block＝按「開戰」會被擋下來
  notice() {
    const L = this.lesson, st = this.state, f = L.fail && L.fail.when;
    if (this.passed) return null;
    if (f) {
      if (f.goldAtStartBelow != null && st.gold < f.goldAtStartBelow) return { kind: 'fail', msg: L.fail.msg, block: true };
      if (f.goldBelow != null && st.gold < f.goldBelow) return { kind: 'fail', msg: L.fail.msg };
      if (f.hpAtMost != null && this.hp <= f.hpAtMost) return { kind: 'fail', msg: L.fail.msg, dead: true };
      if (f.battles != null && this.stats.battles >= f.battles) return { kind: 'fail', msg: L.fail.msg };
    }
    if (L.wrongItemMsg) {
      for (const u of [...st.board, ...st.bench].filter(Boolean)) {
        const r = roleOf(this.DATA, u.key);
        if ((u.items.includes('GiantSlayer') && r === 'tank') || (u.items.includes('SunfireCape') && r === 'carry')) return { kind: 'fail', msg: L.wrongItemMsg };
      }
    }
    return null;
  }
  dead() { const n = this.notice(); return !!(n && n.dead); }
}

// 完成卡的 recap（第 12 關）：把 {interest} 等代入文字
export function recapLines(session, routeLabel) {
  const L = session.lesson;
  if (!L.recap) return [];
  const s = session.stats;
  const vars = { interest: s.interest, emptyRounds: s.emptyRounds, bestWin: s.bestWin, bestLose: s.bestLose, route: routeLabel || '沒選路線' };
  return L.recap.map(t => t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')));
}

// enemies.js — 每回合的敵方陣容（純函式；同 round＋seed 永遠同結果）
import { hashSeed, makeRng } from './rng.js';

let countTraitsFn = null;
try { const m = await import('./stats.js'); countTraitsFn = m.countTraits || null; } catch (e) { /* stats.js 還沒有就不給預覽 */ }
export function setCountTraits(fn) { countTraitsFn = fn; }

const COLS_MID_OUT = [3, 2, 4, 1, 5, 0, 6];
const clone = x => JSON.parse(JSON.stringify(x));

function roundDef(DATA, round) {
  return DATA.rules.rounds.find(r => r.n === round) || null;
}
function pickNum(o, names, d) {
  for (const n of names) if (o[n] !== undefined) return o[n];
  return d;
}

function normalIndex(DATA, round) {
  let n = 0;
  for (const r of DATA.rules.rounds) if (r.n < round && r.type !== 'boss') n++;
  return n;
}

function compFor(DATA, round, seed) {
  const comps = DATA.enemies.comps.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const i = normalIndex(DATA, round);
  const cycle = Math.floor(i / comps.length);
  const order = makeRng(hashSeed(seed, 'enemy', 'cycle', cycle)).shuffle(comps);
  return order[i % comps.length];
}

function placeFiller(taken, isTank) {
  const rows = isTank ? [0, 1, 2, 3] : [3, 2, 1, 0];
  for (const r of rows) for (const c of COLS_MID_OUT) if (!taken.has(r + ',' + c)) return [r, c];
  return null;
}

function normalEnemy(round, seed, DATA, rd) {
  const cfg = rd.enemy || {};
  const N = pickNum(cfg, ['count', 'units', 'n', 'size'], 1);
  const maxCost = pickNum(cfg, ['maxCost', 'cost'], 5);
  const comp = compFor(DATA, round, seed);
  const rng = makeRng(hashSeed(seed, 'enemy', round));
  const ub = DATA.units.byKey;

  // 依 prio 裁切
  const usable = comp.units
    .filter(u => ub[u.key] && ub[u.key].cost <= maxCost && ub[u.key].cost !== 7)
    .map((u, i) => ({ ...clone(u), _i: i }))
    .sort((a, b) => ((a.prio || 99) - (b.prio || 99)) || (a._i - b._i));
  const chosen = usable.slice(0, N);
  const taken = new Set(chosen.map(u => u.pos[0] + ',' + u.pos[1]));

  // 不足：補共用羈絆最多的
  while (chosen.length < N) {
    const have = new Set(chosen.map(u => u.key));
    const tc = {};
    for (const u of chosen) for (const t of ub[u.key].traits || []) tc[t] = (tc[t] || 0) + 1;
    let best = -1, cands = [];
    const list = DATA.units.list.slice().sort((a, b) => (a.key < b.key ? -1 : 1));
    for (const u of list) {
      if (have.has(u.key) || u.cost > maxCost || u.cost === 7) continue;
      let s = 0;
      for (const t of u.traits || []) s += tc[t] || 0;
      if (s > best) { best = s; cands = [u]; } else if (s === best) cands.push(u);
    }
    if (!cands.length) break;
    const pick = rng.pick(cands);
    const pos = placeFiller(taken, pick.roleClass === 'Tank');
    if (!pos) break;
    taken.add(pos[0] + ',' + pos[1]);
    chosen.push({ key: pick.key, star: 1, items: [], pos, prio: 100 + chosen.length, _i: 1000 + chosen.length, filler: true });
  }

  // 星級（rules：star.base／costStar／lowestStar2／halfStar2）
  const sr = typeof cfg.star === 'object' && cfg.star ? cfg.star : { base: cfg.star || 1 };
  const costOf = u => ub[u.key].cost;
  chosen.forEach(u => { u.star = sr.base || 1; });
  if (sr.halfStar2) {
    chosen.slice().sort((a, b) => (costOf(b) - costOf(a)) || (a._i - b._i))
      .slice(0, Math.floor(chosen.length / 2)).forEach(u => { u.star = 2; });
  }
  if (sr.lowestStar2) {
    chosen.slice().sort((a, b) => (costOf(a) - costOf(b)) || (a._i - b._i))
      .slice(0, sr.lowestStar2).forEach(u => { u.star = 2; });
  }
  const byCost = sr.costStar || {};
  for (const u of chosen) if (byCost[String(costOf(u))] !== undefined) u.star = byCost[String(costOf(u))];

  // 裝備
  let left = pickNum(cfg, ['items', 'itemCount'], 0);
  const ib = DATA.items.byKey;
  const comps2 = new Set((DATA.items.components || []).map(x => (typeof x === 'string' ? x : x.key)));
  const early = round <= (DATA.rules.enemyItemComponentUntil ?? 5);
  for (const u of chosen) {
    const mine = [];
    for (let it of u.items || []) {
      if (left <= 0 || mine.length >= DATA.rules.maxItems) break;
      if (!ib[it] && !comps2.has(it)) continue;
      if (early && ib[it] && ib[it].recipe) it = ib[it].recipe[0];
      mine.push(it);
      left--;
    }
    u.items = mine;
  }

  const units = chosen.map(u => ({ key: u.key, star: u.star, items: u.items || [], pos: u.pos.slice() }));
  return {
    name: comp.name, compId: comp.id, units,
    mods: { hpMult: pickNum(cfg, ['hpMult'], 1), dmgMult: pickNum(cfg, ['dmgMult'], 1), extraPassives: [] },
  };
}

function bossEnemy(round, DATA) {
  const b = (DATA.rules.bosses || []).find(x => x.round === round);
  if (!b) throw new Error('找不到第 ' + round + ' 回合的頭目設定');
  const bu = clone(b.boss);
  const units = [{ key: bu.key, star: bu.star || 1, items: bu.items || [], pos: bu.pos.slice(), boss: true }];
  for (const m of clone(b.minions || [])) units.push({ key: m.key, star: m.star || 1, items: m.items || [], pos: m.pos.slice() });
  return {
    name: b.name, boss: clone(b), units,
    mods: {
      // 整合：頭目回合也可用 hpMult／dmgMult 調整整隊（含隨從）；頭目本體另外再乘 bossHp／bossDmg
      hpMult: b.hpMult ?? 1, dmgMult: b.dmgMult ?? 1, extraPassives: clone(b.extraPassives || []),
      boss: { key: bu.key, hpMult: bu.bossHp ?? 1, dmgMult: bu.bossDmg ?? 1, ccCap: bu.ccCap ?? 0.5, slotsScale: bu.slotsScale ?? 1.3 },
    },
  };
}

export function enemyForRound(round, seed, DATA) {
  const rd = roundDef(DATA, round);
  if (!rd) throw new Error('沒有第 ' + round + ' 回合');
  const out = rd.type === 'boss' ? bossEnemy(round, DATA) : normalEnemy(round, seed, DATA, rd);
  let prev = [];
  if (countTraitsFn) {
    try { prev = countTraitsFn(out.units.map(u => ({ key: u.key, star: u.star, items: u.items })), DATA, { augments: [] }); } catch (e) { prev = []; }
  }
  out.traitsPreview = prev;
  return out;
}

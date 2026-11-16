// 過關條件判定（純函式，Node 可測）。條件寫法見 content/lessons.json 的 pass.all。
// 判定用的資料（ctx）由 lesson.js 的 Session 提供：
//   ctx.state       遊戲狀態（等級、金幣、場上、板凳）
//   ctx.DATA        這一關的資料（棋子、羈絆、裝備名稱）
//   ctx.stats       這一關累計：battles、bought、ownCost（買進過的費用）、scouted、streakRun{win,lose}
//   ctx.start       最近一次按「開戰」那一刻的快照：{ board, gold, traits:{key:人數}, itemOn:['裝備|role'] }（還沒開過戰是 null）
//   ctx.last        最近一場的結果：{ win, alive:[棋子 key] }（還沒打過是 null）
//   ctx.base        開局時各星級的張數：{ star2: 2 星以上有幾隻, star3 }
//   ctx.hp          血量

export const STAR_KEYS = (s) => (s >= 3 ? 'star3' : 'star2');

export function ownedUnits(state) {
  return [...(state.board || []), ...(state.bench || [])].filter(Boolean);
}
const countStar = (state, star) => ownedUnits(state).filter(u => (u.star || 1) >= star).length;

const FN = {
  battles: (n, c) => c.stats.battles >= n,
  boardAtStart: (n, c) => !!c.start && c.start.board >= n,
  anyStar: (s, c) => countStar(c.state, s) > 0,
  starCount: (v, c) => countStar(c.state, v.star) - (c.base[STAR_KEYS(v.star)] || 0) >= v.n,
  unitStar: (v, c) => ownedUnits(c.state).some(u => u.key === v.key && (u.star || 1) >= v.star),
  level: (n, c) => c.state.level >= n,
  win: (v, c) => !!c.last && c.last.win === !!v,
  aliveAtEnd: (key, c) => !!c.last && c.last.alive.includes(key),
  traitAtStart: (m, c) => !!c.start && Object.keys(m).every(k => (c.start.traits[k] || 0) >= m[k]),
  itemOn: (v, c) => !!c.start && c.start.itemOn.includes(v.item + '|' + v.role),
  bought: (n, c) => c.stats.bought >= n,
  goldAtStart: (n, c) => !!c.start && c.start.gold >= n,
  streakAbs: (n, c) => Math.max(c.stats.streakRun.win, c.stats.streakRun.lose) >= n,
  ownCost: (cost, c) => c.stats.ownCost.includes(cost),
  scouted: (n, c) => c.stats.scouted >= n,
  hpAbove: (n, c) => c.hp > n,
};

export function evalCond(cond, ctx) {
  const k = Object.keys(cond)[0];
  const f = FN[k];
  if (!f) throw new Error('不認得的過關條件：' + k);
  return !!f(cond[k], ctx);
}
export const condNames = () => Object.keys(FN);

// 條件的中文說明（任務卡的勾選清單用）
export function describe(cond, DATA) {
  const k = Object.keys(cond)[0], v = cond[k];
  const zh = (key) => (DATA.units.byKey[key] && DATA.units.byKey[key].zh) || key;
  const tz = (key) => (DATA.traits.byKey[key] && DATA.traits.byKey[key].zh) || key;
  const iz = (key) => (DATA.items.byKey[key] && DATA.items.byKey[key].zh) || key;
  switch (k) {
    case 'battles': return v === 1 ? '打一場' : `打 ${v} 場`;
    case 'boardAtStart': return `開戰時場上 ${v} 隻`;
    case 'anyStar': return `合出一隻 ${v} 星`;
    case 'starCount': return `多合出 ${v.n} 隻 ${v.star} 星`;
    case 'unitStar': return `${zh(v.key)} 升到 ${v.star} 星`;
    case 'level': return `升到 ${v} 等`;
    case 'win': return '打贏';
    case 'aliveAtEnd': return `${zh(v)} 活到最後`;
    case 'traitAtStart': return Object.keys(v).map(t => `${tz(t)} 湊到 ${v[t]} 隻`).join('、');
    case 'itemOn': return `${iz(v.item)} 給${v.role === 'carry' ? '輸出' : '坦'}`;
    case 'bought': return `買 ${v} 張牌`;
    case 'goldAtStart': return `開戰時還有 ${v} 金以上`;
    case 'streakAbs': return `連贏或連輸 ${v} 場`;
    case 'ownCost': return `買進一張 ${v} 費牌`;
    case 'scouted': return '按「看對手」看一眼';
    case 'hpAbove': return '血量還沒歸零';
    default: return k;
  }
}

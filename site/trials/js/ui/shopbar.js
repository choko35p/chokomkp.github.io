// 商店上緣 HUD（等級條、機率、金幣頁籤、連勝、人口）＋商店本體（左：買經驗／重抽；右：5 張卡）。SPEC 2.3、2.4。
// 買、刷新等動作一律走 api.act；卡片點擊與拖曳由 input.js／dnd.js 接（desc：shop:<slot>）。
import { el, avatarEl, styleAvatar, zhOf, costOf, starsEl } from './board.js';
import { traitIcon, traitZh } from './traitbar.js';

const COST_NAMES = ['1費', '2費', '3費', '4費', '5費'];
const SHAPES = ['●', '■', '▲', '◆', '⬟'];   // 形狀不同，不只靠顏色
const COIN = 'img/ui/gold_coin.webp';

const coin = (cls = '') => el('img', 'tt-coin ' + cls, { src: COIN, alt: '', 'aria-hidden': 'true', draggable: 'false' });
const hk = (api, action, def) => { try { const l = api.hotkeys && api.hotkeys.label(action); return l || def; } catch (_) { return def; } };

// 場上＋板凳同名棋子的「等值張數」（1★=1、2★=3、3★=9）與各星級張數
export function ownedOf(state, key) {
  const n = { 1: 0, 2: 0, 3: 0 };
  for (const u of [...(state.board || []), ...(state.bench || [])]) if (u && u.key === key) n[u.star] = (n[u.star] || 0) + 1;
  return { n, equiv: n[1] + n[2] * 3 + n[3] * 9 };
}
const haveText = (own) => '已有 ' + [3, 2, 1].filter(st => own.n[st]).map(st => `${st} 星 ${own.n[st]} 隻`).join('、');
// 再買這張會不會合星：回傳合成後的星級（2 或 3），沒有回 0
export function mergeStar(state, key) {
  const { n } = ownedOf(state, key);
  if (n[1] >= 2) return n[2] >= 2 ? 3 : 2;
  return 0;
}

// 買了（上場）會讓哪些羈絆升階
export function upgradeSet(api, key) {
  const { state, DATA } = api;
  if (!api.countTraits) return new Set();
  const board = (state.board || []).filter(Boolean);
  if (board.some(u => u.key === key)) return new Set();
  try {
    const opts = api.traitOpts ? api.traitOpts() : { augments: state.augments || [] };
    const before = Object.fromEntries(api.countTraits(board, DATA, opts).map(t => [t.key, t.tier]));
    const after = api.countTraits([...board, { key, star: 1, items: [] }], DATA, opts);
    return new Set(after.filter(t => t.tier > (before[t.key] || 0)).map(t => t.key));
  } catch (_) { return new Set(); }
}

export function oddsRow(DATA, level) {
  const o = DATA.rules.shopOdds || {};
  return o[String(level)] || o[String(Math.min(level, 10))] || [100, 0, 0, 0, 0];
}

const flameSvg = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'tt-flame'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M12 2c1 4-3 6-3 10 0 1 .3 2 1 2.7C9 14 8 12.6 8 11 5.5 13 5 16 6.5 18.6 8 21 10 22 12 22s4-1 5.500-3.400C19 16 18.500 13 17 11c-.5 2-1.500 3-2.500 3.500C15.500 10 13 7 12 2z');
  p.setAttribute('fill', 'currentColor'); s.append(p); return s;
};

// ---------- HUD ----------
export function renderHud(root, api) {
  const { state: s, DATA } = api, r = DATA.rules;
  const need = r.xpToNext?.[String(s.level)];
  const maxed = need == null;
  const interest = Math.min(Math.floor(s.gold / (r.income?.interestPer || 10)), r.income?.interestCap ?? 5);
  const streakN = s.streak || 0, loseN = s.stats?.loseStreak || 0;
  const steps = r.income?.streak || [];
  const sg = (n) => { let g = 0; for (const [m, v] of steps) if (n >= m) g = v; return g; };
  const lvl = el('div', 'tt-hud-lv', { 'data-tt-tip': 'text:' + (maxed ? '已經滿級了' : `升到 ${s.level + 1} 級還要 ${need - s.xp} 點經驗。每回合自動 +2，買經驗一次 +4。`) },
    el('span', 'tt-hlv-n', {}, `等級 ${s.level}`), el('span', 'tt-hlv-x tt-num', {}, maxed ? '滿級' : `${s.xp}/${need}`),
    el('i', 'tt-xpbar', {}, el('b', '', { style: `width:${maxed ? 100 : Math.min(100, s.xp / need * 100)}%` })));
  const row = oddsRow(DATA, s.level);
  const odds = el('button', 'tt-hud-odds', { type: 'button', 'data-act': 'odds', 'aria-label': `等級 ${s.level} 的商店機率，點一下看完整機率表` },
    ...row.map((p, i) => el('span', 'tt-od tt-cost' + (i + 1) + (p ? '' : ' tt-off'), {}, el('i', '', { 'aria-hidden': 'true' }, SHAPES[i]), `${p}%`)));
  const gold = el('div', 'tt-hud-gold', { 'data-tt-tip': `text:利息 +${interest}（每 ${r.income?.interestPer || 10} 金 +1，上限 ${r.income?.interestCap ?? 5}）`, 'aria-label': `金幣 ${s.gold}，利息 ${interest}` },
    coin(), el('b', 'tt-num', {}, s.gold));
  const lose = !streakN && loseN > 0;
  const stN = streakN || loseN;
  const streak = el('div', 'tt-hud-streak' + (stN ? (lose ? ' tt-lose' : ' tt-win') : ''), {
    'data-tt-tip': 'text:' + (!stN ? '連勝 0：贏了才會累積' : lose ? `連敗 ${loseN}：連敗也有額外收入` : `連勝 ${streakN}：每回合 +${sg(streakN)} 金`), 'aria-label': (lose ? '連敗 ' : '連勝 ') + stN },
    flameSvg(), el('b', 'tt-num', {}, stN));
  const used = api.popUsed ? api.popUsed() : 0, max = api.popMax ? api.popMax() : s.level;
  const pop = el('div', 'tt-hud-pop' + (used >= max ? ' tt-full' : ''), { 'data-tt-tip': 'text:人口：場上棋子數／上限。升等會增加上限。', 'aria-label': `人口 ${used}/${max}` },
    el('img', 'tt-popic', { src: 'img/ui/population.webp', alt: '', 'aria-hidden': 'true', draggable: 'false' }), el('b', 'tt-num', {}, `${used}/${max}`));
  root.replaceChildren(lvl, odds, gold, streak, pop);
}

// ---------- 商店本體 ----------
function cardEl(api, slot, i) {
  const { state, DATA } = api;
  const key = slot.key, cost = slot.cost ?? costOf(DATA, key);
  const u = DATA.units.byKey[key];
  const poor = state.gold < cost;
  const card = el('div', `tt-card tt-cost${cost}` + (poor ? ' tt-poor' : ''), {
    role: 'button', tabindex: '0', 'data-tt-tap': `shop:${i}`, 'data-tt-drag': `shop:${i}`, 'data-tt-mouse': true, 'data-tt-unit': key,
    'data-tt-tip': `ability:${key}:1`,
  });
  const own = ownedOf(state, key);
  const ms = mergeStar(state, key);
  const ups = upgradeSet(api, key);
  const av = el('span', 'tt-cav', { 'aria-hidden': 'true' }); styleAvatar(av, DATA, key);
  card.append(av, el('span', 'tt-cshade', { 'aria-hidden': 'true' }));
  const tags = el('div', 'tt-ctags');
  for (const k of (u?.traits || []).slice(0, 3)) {
    const up = ups.has(k);
    tags.append(el('span', 'tt-ctag' + (up ? ' tt-up' : ''), { 'data-trait': k }, traitIcon(DATA, k, 16), el('span', 'tt-ctn', {}, traitZh(DATA, k)), up ? el('em', '', { 'aria-hidden': 'true' }, '↑') : null));
  }
  card.append(tags);
  card.append(el('div', 'tt-cfoot', {}, el('span', 'tt-cname', {}, zhOf(DATA, key)), el('span', 'tt-ccost', {}, coin('tt-sm'), el('b', 'tt-num', {}, cost))));
  if (ms) card.append(el('span', 'tt-mbadge', { 'aria-hidden': 'true' }, '買了＝', starsEl(ms, { label: false })));
  if (own.equiv) {   // 已有幾隻：依星級分開寫（星星圖示＋隻數），不再只給合計
    const have = el('span', 'tt-have', { title: haveText(own) });
    for (const st of [3, 2, 1]) if (own.n[st]) have.append(el('span', 'tt-hv tt-hv' + st, {}, starsEl(st, { label: false }), el('b', '', {}, '×' + own.n[st])));
    card.append(have);
  }
  if (slot.fresh) card.append(el('span', 'tt-fresh', {}, '新解鎖'));
  if (ms) card.classList.add('tt-merge');
  card.setAttribute('aria-label', `商店第 ${i + 1} 格：${zhOf(DATA, key)}，${cost} 費，${cost} 金` + (slot.fresh ? '，新解鎖' : '') + (own.equiv ? `，${haveText(own)}` : '') + (ms ? `，買了可升 ${ms} 星` : ''));
  return card;
}

export function renderShop(root, api) {
  const { state, DATA } = api;
  const rules = DATA.rules;
  const maxed = state.level >= (rules.maxLevel || 10);
  const xpCost = rules.xpCost ?? 4, rrCost = rules.rerollCost ?? 2;
  const btn = (cls, label, cost, icon, on, poor, key) => {
    const n = el('button', 'tt-sbtn ' + cls + (poor ? ' tt-poor' : ''), { type: 'button', 'aria-label': `${label}，${cost == null ? '' : cost + ' 金，'}快捷鍵 ${key}`, 'data-tt-noclear': '' },
      el('span', 'tt-sbl', {}, el('b', '', {}, label), el('span', 'tt-sbc', {}, cost == null ? '已滿級' : [coin('tt-sm'), el('span', 'tt-num', {}, cost)])),
      el('img', 'tt-sbi', { src: icon, alt: '', 'aria-hidden': 'true', draggable: 'false' }), el('kbd', 'tt-hk', { 'aria-hidden': 'true' }, key));
    n.addEventListener('click', on);
    return n;
  };
  const left = el('div', 'tt-sleft',  {},
    btn('tt-xpbtn', '購買經驗值', maxed ? null : xpCost, 'img/ui/buyxp.webp', () => api.act('buyXp'), maxed || state.gold < xpCost, hk(api, 'buyXp', 'F')),
    btn('tt-rrbtn', '重抽', rrCost, 'img/ui/reroll.webp', () => api.act('reroll'), state.gold < rrCost, hk(api, 'reroll', 'D')));
  const cards = el('div', 'tt-cards', { role: 'group', 'aria-label': '商店' });
  (state.shop || []).forEach((slot, i) => {
    if (!slot) { cards.append(el('div', 'tt-card tt-empty', { 'aria-hidden': 'true' })); return; }
    cards.append(cardEl(api, slot, i));
  });
  const wrap = el('div', 'tt-shopin', {}, left, cards);
  root.replaceChildren(wrap);
  // 戰鬥鍵上的快捷鍵小字
  const g = document.querySelector('.tt-go .tt-hk');
  if (g) g.textContent = hk(api, 'fight', '空白鍵');
}

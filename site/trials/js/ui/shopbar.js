// 商店列：機率條、買經驗／刷新／開戰、5 張商店卡。SPEC 5.2–5.4。
// 買、刷新等動作一律走 api.act；卡片點擊與拖曳由 dnd.js 接（desc：shop:<slot>）。
import { el, avatarEl, zhOf, costOf } from './board.js';

const COST_NAMES = ['1費', '2費', '3費', '4費', '5費'];

// 場上＋板凳同名棋子的「等值張數」（1★=1、2★=3、3★=9）與各星級張數
export function ownedOf(state, key) {
  const n = { 1: 0, 2: 0, 3: 0 };
  for (const u of [...(state.board || []), ...(state.bench || [])]) if (u && u.key === key) n[u.star] = (n[u.star] || 0) + 1;
  return { n, equiv: n[1] + n[2] * 3 + n[3] * 9 };
}
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
    const opts = { augments: state.augments || [] };
    const before = Object.fromEntries(api.countTraits(board, DATA, opts).map(t => [t.key, t.tier]));
    const after = api.countTraits([...board, { key, star: 1, items: [] }], DATA, opts);
    return new Set(after.filter(t => t.tier > (before[t.key] || 0)).map(t => t.key));
  } catch (_) { return new Set(); }
}

export function oddsRow(DATA, level) {
  const o = DATA.rules.shopOdds || {};
  return o[String(level)] || o[String(Math.min(level, 10))] || [100, 0, 0, 0, 0];
}

function oddsEl(api) {
  const { state, DATA } = api;
  const row = oddsRow(DATA, state.level);
  const bar = el('div', 'tt-oddsbar', { 'aria-hidden': 'true' });
  const txt = el('div', 'tt-oddstxt');
  row.forEach((p, i) => {
    if (p > 0) { const s = el('i'); s.style.width = p + '%'; s.className = 'tt-cost' + (i + 1); bar.append(s); }
    const sp = el('span', 'tt-cost' + (i + 1) + (p ? '' : ' tt-off'), {}, COST_NAMES[i] + ' ', el('b', '', {}, p + '%'));
    txt.append(sp);
  });
  return el('div', 'tt-odds', { 'aria-label': `等級 ${state.level} 的商店機率` }, bar, txt);
}

export function renderShop(root, api) {
  const { state, DATA } = api;
  const rules = DATA.rules;
  const kids = [oddsEl(api)];

  const cards = el('div', 'tt-cards', { role: 'group', 'aria-label': '商店' });
  (state.shop || []).forEach((slot, i) => {
    if (!slot) { cards.append(el('div', 'tt-card tt-empty', { 'aria-label': `商店第 ${i + 1} 格：已買` }, '已買')); return; }
    const key = slot.key, cost = slot.cost ?? costOf(DATA, key);
    const u = DATA.units.byKey[key];
    const card = el('div', `tt-card tt-cost${cost}` + (state.gold < cost ? ' tt-poor' : ''), {
      role: 'button', tabindex: '0', 'data-tt-tap': `shop:${i}`, 'data-tt-drag': `shop:${i}`, 'data-tt-mouse': true, 'data-tt-unit': key,
    });
    const own = ownedOf(state, key);
    const ms = mergeStar(state, key);
    const ups = upgradeSet(api, key);
    card.append(avatarEl(DATA, key));
    card.append(el('div', 'tt-cname', {}, zhOf(DATA, key)));
    const tags = el('div', 'tt-tags');
    for (const k of (u?.traits || []).slice(0, 3)) {
      const t = DATA.traits.byKey[k];
      tags.append(el('span', 'tt-tag' + (ups.has(k) ? ' tt-up' : ''), { 'data-kind': t?.kind || 'origin', 'data-trait': k }, (t?.zh || k) + (ups.has(k) ? '↑' : '')));
    }
    card.append(tags);
    card.append(el('div', 'tt-cfoot', {}, ms ? el('span', 'tt-mergetxt', {}, `可升${ms}★`) : el('span'), el('span', 'tt-ccost tt-num', {}, cost)));
    if (own.equiv) card.append(el('span', 'tt-have', {}, `已有 ${own.equiv}`));
    if (ms) card.classList.add('tt-merge');
    card.setAttribute('aria-label', `商店第 ${i + 1} 格：${zhOf(DATA, key)}，${cost} 費，${cost} 金` + (own.equiv ? `，已有 ${own.equiv}` : '') + (ms ? `，買了可升 ${ms} 星` : ''));
    cards.append(card);
  });

  const maxed = state.level >= (rules.maxLevel || 10);
  const xpCost = rules.xpCost ?? 4, rrCost = rules.rerollCost ?? 2;
  const b = (cls, label, sub, key, on, poor) => {
    const n = el('button', 'tt-xbtn ' + cls + (poor ? ' tt-poor' : ''), { type: 'button', 'aria-label': label + (sub ? ' ' + sub : '') + (key ? `（快捷鍵 ${key}）` : '') },
      label, sub ? el('small', '', {}, sub) : null, key ? el('kbd', '', { 'aria-hidden': 'true' }, key) : null);
    n.addEventListener('click', on);
    return n;
  };
  const dock = el('div', 'tt-dock');
  const xp = b('tt-xpbtn', '買經驗', maxed ? '已滿級' : `${xpCost} 金`, 'F', () => api.act('buyXp'), maxed || state.gold < xpCost);
  const rr = b('tt-rrbtn', '刷新', `${rrCost} 金`, 'D', () => api.act('reroll'), state.gold < rrCost);
  const go = b('tt-go', '開戰', '', 'Space', () => api.ui.go && api.ui.go(), false);
  dock.append(xp, rr, go);
  kids.push(cards, dock);
  root.replaceChildren(...kids);
}

// 羈絆列（SPEC 5.5）＋ U2 共用小工具（頭像、羈絆標籤、樣式注入）。純前端，不碰別人的檔。
// 樣式：在 trials.css（U2 區）。
import { countTraits } from '../stats.js';
import { showTraitPanel, PANEL_CSS } from './panels.js';

const CSS = ''; // 整合：樣式已搬進 trials.css

export function ensureStyle(doc = document) {
  // 整合：樣式已搬進 trials.css，這裡不再注入 <style>
  return doc && CSS + PANEL_CSS === null;
}

// ---------- 共用小工具 ----------
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const kindOf = (DATA, key) => DATA.traits.byKey[key]?.kind || 'origin';
export const traitZh = (DATA, key) => DATA.traits.byKey[key]?.zh || key;
export const unitZh = (DATA, key) => DATA.units.byKey[key]?.zh || key;
export const isStars = (DATA, key) => DATA.traits.byKey[key]?.countMode === 'stars' || key === 'KDA';

export function avatar(DATA, key, size = 40) {
  const u = DATA.units.byKey[key], sp = DATA.units.sprite || {};
  const idx = sp.map?.[key]; const cols = sp.cols || 10, rows = sp.rows || 10;
  const a = el('span', { class: 'tt-av', 'data-cost': u?.cost ?? 1, role: 'img', 'aria-label': unitZh(DATA, key) });
  a.style.setProperty('--tt-av', size + 'px');
  if (idx != null) {
    a.style.backgroundImage = `url("${sp.src}")`;
    a.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    a.style.backgroundPosition = `${(idx % cols) * 100 / (cols - 1)}% ${Math.floor(idx / cols) * 100 / (rows - 1)}%`;
  }
  return a;
}

export function boardUnits(state) { return (state.board || []).filter(Boolean); }
export function playerTraits(api) {
  const { state, DATA } = api;
  return countTraits(boardUnits(state), DATA, api.traitOpts ? api.traitOpts() : { augments: state.augments || [] });
}

// 買／上場這隻會讓哪些羈絆升階（回傳 key 集合）。已在場上同 key 不算（同 key 只算一次）。
export function upgradeTraits(api, unitKey) {
  const { state, DATA } = api;
  if (!api.countTraits) return new Set();
  const board = boardUnits(state);
  if (board.some(u => u.key === unitKey)) return new Set();
  const opts = api.traitOpts ? api.traitOpts() : { augments: state.augments || [] };
  const before = Object.fromEntries(countTraits(board, DATA, opts).map(t => [t.key, t.tier]));
  const after = countTraits([...board, { key: unitKey, star: 1, items: [] }], DATA, opts);
  return new Set(after.filter(t => t.tier > (before[t.key] || 0)).map(t => t.key));
}

// ---------- 羈絆圖示（SPEC 2.6）：唯一入口 ----------
// DATA.traits.sprite = {src, cols, size, index}。data.js 還沒把 sprite 帶進來時，用 setTraitSprite 補（layout.mount 會從 data/traits.json 讀）。
let fallbackSprite = null;
export function setTraitSprite(sp) { fallbackSprite = sp || null; }
export function traitIcon(DATA, key, size = 18) {
  const sp = DATA.traits.sprite || fallbackSprite;
  const n = el('span', { class: 'tt-ticon', 'data-trait': key, 'aria-hidden': 'true' });
  n.style.setProperty('--ti', size + 'px');
  const idx = sp && sp.index ? sp.index[key] : null;
  if (idx == null) { n.classList.add('tt-ticon-txt'); n.textContent = traitZh(DATA, key).slice(0, 1); return n; }
  const cols = sp.cols || 8;
  const max = Math.max(sp.count || 0, ...Object.values(sp.index).map(v => v + 1));
  const rows = Math.ceil(max / cols);
  n.style.backgroundImage = `url("${sp.src}")`;
  n.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  n.style.backgroundPosition = `${cols > 1 ? (idx % cols) * 100 / (cols - 1) : 0}% ${rows > 1 ? Math.floor(idx / cols) * 100 / (rows - 1) : 0}%`;
  return n;
}

// 羈絆文字標籤列。商店卡／棋子面板共用：traitTags(unitKey, api, {clickable, max})。買了會升階的加「↑」。
export function traitTags(unitKey, api, { clickable = false, max = 3 } = {}) {
  const { DATA } = api;
  const ups = upgradeTraits(api, unitKey);
  const wrap = el('span', { class: 'tt-tags' });
  for (const k of (DATA.units.byKey[unitKey]?.traits || []).slice(0, max)) {
    const up = ups.has(k);
    const label = traitZh(DATA, k);
    const t = el(clickable ? 'button' : 'span', {
      class: 'tt-tag' + (up ? ' tt-up' : ''), 'data-kind': kindOf(DATA, k), 'data-trait': k,
      type: clickable ? 'button' : null, 'aria-label': label + (up ? '，買了會升階' : ''),
    }, traitIcon(DATA, k, 16), label, up ? el('span', { class: 'tt-up-arrow', 'aria-hidden': 'true' }, '↑') : null);
    if (clickable) t.addEventListener('click', (e) => { e.stopPropagation(); showTraitPanel(k, api); });
    wrap.append(t);
  }
  return wrap;
}

// ---------- 羈絆列一列（SPEC 2.5） ----------
export function tierClass(t) {
  const n = (t.breakpoints || []).length, tier = t.tier || 0;
  if (!tier) return 'off';
  if (tier >= n) return n >= 4 ? 'prism' : 'gold';
  if (n >= 4 && tier === n - 1) return 'gold';
  if (tier === 1) return 'bronze';
  return 'silver';
}

// 羈絆列排序（照官方）：已啟動的獨有羈絆（多半是 5 費自帶）最上面；接著其他已啟動的，先看階級顏色（彩＞金＞銀＞銅）再看人數；未啟動的放最後
const TIER_RANK = { prism: 4, gold: 3, silver: 2, bronze: 1, off: 0 };
export function sortTraits(list, DATA) {
  const kind = t => t.kind || (DATA.traits.byKey[t.key] || {}).kind;
  const grp = t => (!t.active ? 2 : kind(t) === 'unique' ? 0 : 1);
  return (list || []).slice().sort((a, b) => grp(a) - grp(b)
    || (TIER_RANK[tierClass(b)] || 0) - (TIER_RANK[tierClass(a)] || 0) || (b.count - a.count) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function traitHex(DATA, t, size) {
  return el('span', { class: 'tt-hex', 'data-tier': tierClass(t), 'aria-hidden': 'true' }, traitIcon(DATA, t.key, size));
}

function statusText(t, DATA) {
  const unit = isStars(DATA, t.key) ? '星' : '隻';
  const bps = t.breakpoints || [];
  if (t.active && (t.next == null || t.tier >= bps.length)) return '已到最高階';
  if (t.active) return `啟動中，再 ${t.need ?? (t.next - t.count)} ${unit}升階`;
  return `差 ${t.need ?? (t.next - t.count)} ${unit}啟動`;
}

export function traitCard(t, api, { side = 'player', list } = {}) {
  const { DATA } = api;
  const bps = t.breakpoints || [];
  const name = traitZh(DATA, t.key);
  const bp = el('span', { class: 'tt-tbp' });
  if (t.active) bps.forEach((b, i) => {
    if (i) bp.append(el('s', {}, '›'));
    bp.append(el('i', { class: (t.tier === i + 1 ? 'tt-cur' : '') + (t.count >= b ? ' tt-on' : '') }, b));
  });
  else bp.append(el('i', { class: 'tt-cur' }, `${t.count} / ${bps[0] ?? t.next ?? '?'}`));
  let pk = null;
  try { pk = side === 'player' && api.picks ? api.picks() : null; } catch (_) { pk = null; }
  const withSona = !!(pk && pk.prod.active.length && pk.prod.trait === t.key);   // 製作人選到的羈絆：加「+索娜」
  if (withSona) bp.append(el('small', { class: 'tt-plus' }, '+索娜'));
  const btn = el('button', {
    type: 'button', class: 'tt-trow' + (t.active ? ' tt-active' : ' tt-inactive'), 'data-trait': t.key, 'data-kind': kindOf(DATA, t.key),
    'data-tt-tip': 'trait:' + t.key, 'data-tt-noclear': '',
    'aria-label': `${name}，${t.count}${isStars(DATA, t.key) ? ' 星' : ' 隻'}，${statusText(t, DATA)}。點圖示看說明，點文字標出相關棋子`,
  }, traitHex(DATA, t, 18), el('span', { class: 'tt-tcnt tt-num' }, t.count),
    el('span', { class: 'tt-tinfo' }, el('b', {}, name), bp));
  // 站主 2026-11-16：點左邊的圖示＝詳細說明；點文字＝像滑鼠移上去一樣把相關棋子標出來（再點一次或點空白取消）
  btn.addEventListener('click', (e) => {
    if (side !== 'player' || e.detail === 0 || e.target.closest?.('.tt-hex')) { showTraitPanel(t.key, api, { side, traits: list }); return; }
    if (Date.now() - lpAt < 800) return;   // 剛長按亮過，放開時不要再切換
    pinTrait(t.key);
  });
  return btn;
}

// ---------- 對外：renderTraits ----------
export function renderTraits(root, traitsPlayer, traitsEnemy, api) {
  ensureStyle(); bindHover(api);
  const list = sortTraits((traitsPlayer || []).filter(t => t.count >= 1), api.DATA);
  const ul = el('ul', { class: 'tt-trait-list tt-hscroll', 'aria-label': '我的羈絆' });
  if (!list.length) ul.append(el('li', { class: 'tt-traitbar-empty' }, '放棋子上場，羈絆就會出現在這裡'));
  for (const t of list) ul.append(el('li', {}, traitCard(t, api, { list })));
  const prev = root.querySelector?.('.tt-trait-list');
  const sx = prev?.scrollLeft || 0, sy = prev?.scrollTop || root.scrollTop || 0;
  root.replaceChildren(ul);
  ul.scrollLeft = sx; root.scrollTop = sy;
  if (pinnedTrait) {
    if (['battle', 'over'].includes(api.state?.phase) || !list.some(t => t.key === pinnedTrait)) clearPinnedTrait();
    else ul.querySelectorAll(`.tt-trow[data-trait="${pinnedTrait}"]`).forEach(n => n.classList.add('tt-pin', 'tt-hl'));
  }
  const eroot = document.querySelector('[data-tt-enemy]');
  if (eroot && traitsEnemy) renderEnemyTraits(eroot, traitsEnemy, api);
}

export function renderEnemyTraits(root, traitsEnemy, api) {
  ensureStyle(); bindHover(api);
  const { DATA } = api; const wrap = el('span', { class: 'tt-enemy-traits', 'aria-label': '敵方羈絆' });
  const list = sortTraits((traitsEnemy || []).filter(t => t.count >= 1), DATA);
  for (const t of list) {
    const star = isStars(DATA, t.key);
    const b = el('button', { type: 'button', class: 'tt-etrait' + (t.active ? ' tt-active' : ''), 'data-trait': t.key, 'data-kind': kindOf(DATA, t.key),
      'data-tt-tip': 'trait:' + t.key, 'data-tt-noclear': '',
      'aria-label': `敵方 ${traitZh(DATA, t.key)} ${t.count}${star ? ' 星' : ' 隻'}${t.active ? '，啟動' : '，未啟動'}` },
      traitHex(DATA, t, 14), el('b', { class: 'tt-num' }, t.count));
    b.addEventListener('click', () => showTraitPanel(t.key, api, { side: 'enemy', traits: traitsEnemy }));
    wrap.append(b);
  }
  if (!list.length) wrap.append(el('span', { class: 'tt-traitbar-empty' }, '—'));
  root.replaceChildren(wrap);
}

// 戰鬥中 trait 事件讓該羈絆卡閃一下（battle.js 可呼叫）
export function flashTrait(key, side = 'player') {
  document.querySelectorAll(`.tt-trow[data-trait="${key}"],.tt-etrait[data-trait="${key}"]`).forEach(n => {
    n.classList.remove('tt-flash'); void n.offsetWidth; n.classList.add('tt-flash');
    setTimeout(() => n.classList.remove('tt-flash'), 1300);
  });
}

// ---------- 懸停／長按亮起 ----------
// 約定：棋盤格上的棋子、板凳棋子、商店卡請加 data-tt-unit="<key>"（U1/U3 負責加屬性）。
// 滑鼠停在羈絆上（或手機長按）：該羈絆的棋子（場上、板凳、商店卡）亮起 tt-hl，其他的變暗（根節點 tt-hlmode）；
// 商店卡上那個羈絆的小圖示加 tt-hlt。移開全部還原。純樣式，不改 pointer-events，不影響拖曳與點選。
let activeTrait = null;
function memberSet(key) {
  const D = curApi?.DATA;
  const m = new Set(D?.traits.byKey[key]?.members || []);
  for (const u of D?.units.list || []) if ((u.traits || []).includes(key)) m.add(u.key);
  return m;
}
function paintTrait(key) {
  const m = key ? memberSet(key) : new Set();
  document.querySelectorAll('[data-tt-unit]').forEach(n => n.classList.toggle('tt-hl', !!key && m.has(n.dataset.ttUnit)));
  document.querySelectorAll('.tt-card .tt-ctag[data-trait]').forEach(n => n.classList.toggle('tt-hlt', !!key && n.dataset.trait === key));
  document.querySelectorAll('.tt-trow[data-trait],.tt-tag[data-trait],.tt-etrait[data-trait],.tt-pl-trait[data-trait]').forEach(n => n.classList.toggle('tt-hl', !!key && n.dataset.trait === key));
  document.body.classList.toggle('tt-hlmode', !!key);
}
// 點文字固定亮起的羈絆（pinnedTrait）：滑鼠移開不會熄，再點一次、點別的羈絆文字、點空白、Esc、開戰才會換掉或熄掉
let pinnedTrait = null, lpAt = 0;
export function pinTrait(key) {
  pinnedTrait = pinnedTrait === key ? null : (key || null);
  activeTrait = pinnedTrait;
  paintTrait(activeTrait);
  document.querySelectorAll('.tt-trow[data-trait]').forEach(n => n.classList.toggle('tt-pin', !!pinnedTrait && n.dataset.trait === pinnedTrait));
  return pinnedTrait;
}
export function clearPinnedTrait() { if (pinnedTrait) pinTrait(pinnedTrait); }
export const pinnedTraitKey = () => pinnedTrait;
export function highlightTrait(key, on) {
  activeTrait = on ? key : pinnedTrait;
  paintTrait(activeTrait);
}
export function highlightUnit(unitKey, on) {
  const ts = new Set(curApi?.DATA.units.byKey[unitKey]?.traits || []);
  document.querySelectorAll('.tt-trow[data-trait]').forEach(n => n.classList.toggle('tt-hl', !!on && ts.has(n.dataset.trait)));
  if (!on && activeTrait) paintTrait(activeTrait);
}
let bound = false, curApi = null;
function bindHover(api) {
  curApi = api;
  if (new URLSearchParams(location.search).has('seed')) window.__ttApi = api;
  if (bound) return; bound = true;
  let lp = null;
  const traitEl = (e) => e.target.closest?.('.tt-trow[data-trait],.tt-tag[data-trait],.tt-etrait[data-trait],.tt-pl-trait[data-trait]');
  const unitEl = (e) => e.target.closest?.('[data-tt-unit]');
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = traitEl(e); if (t) highlightTrait(t.dataset.trait, true);
    const u = unitEl(e); if (u) highlightUnit(u.dataset.ttUnit, true);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const t = traitEl(e); if (t) highlightTrait(t.dataset.trait, false);
    const u = unitEl(e); if (u) highlightUnit(u.dataset.ttUnit, false);
  });
  // 手機長按 450ms：棋子→亮羈絆卡；羈絆卡→亮棋子（放開後 1.5 秒消失）
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = traitEl(e), u = unitEl(e); if (!t && !u) return;
    clearTimeout(lp);
    lp = setTimeout(() => {
      if (t) { highlightTrait(t.dataset.trait, true); lpAt = Date.now(); } else highlightUnit(u.dataset.ttUnit, true);
      setTimeout(() => { activeTrait = pinnedTrait; document.querySelectorAll('.tt-hl').forEach(n => n.classList.remove('tt-hl')); paintTrait(activeTrait); }, 1500);
    }, 450);
  });
  // 重畫（買卡、刷新、換位）後把亮起狀態補回去
  let rq = 0;
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (!activeTrait || rq) return; rq = requestAnimationFrame(() => { rq = 0; paintTrait(activeTrait); }); }).observe(document.body, { childList: true, subtree: true });
  // 點空白處（不是按鈕、棋子、商店卡、羈絆）或按 Esc：取消固定亮起
  document.addEventListener('click', (e) => {
    if (!pinnedTrait) return;
    if (e.target.closest?.('button, a, input, select, label, [data-tt-unit], [data-tt-uid], .tt-card, .tt-trow, .tt-overlay, [role=dialog]')) return;
    clearPinnedTrait();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pinnedTrait) clearPinnedTrait(); });
  const cancel = () => clearTimeout(lp);
  document.addEventListener('pointerup', cancel); document.addEventListener('pointercancel', cancel);
}

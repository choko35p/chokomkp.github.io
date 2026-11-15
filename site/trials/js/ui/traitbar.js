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
  return countTraits(boardUnits(state), DATA, { augments: state.augments || [] });
}

// 買／上場這隻會讓哪些羈絆升階（回傳 key 集合）。已在場上同 key 不算（同 key 只算一次）。
export function upgradeTraits(api, unitKey) {
  const { state, DATA } = api;
  if (!api.countTraits) return new Set();
  const board = boardUnits(state);
  if (board.some(u => u.key === unitKey)) return new Set();
  const opts = { augments: state.augments || [] };
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
  const btn = el('button', {
    type: 'button', class: 'tt-trow' + (t.active ? ' tt-active' : ' tt-inactive'), 'data-trait': t.key, 'data-kind': kindOf(DATA, t.key),
    'data-tt-tip': 'trait:' + t.key, 'data-tt-noclear': '',
    'aria-label': `${name}，${t.count}${isStars(DATA, t.key) ? ' 星' : ' 隻'}，${statusText(t, DATA)}`,
  }, traitHex(DATA, t, 18), el('span', { class: 'tt-tcnt tt-num' }, t.count),
    el('span', { class: 'tt-tinfo' }, el('b', {}, name), bp));
  btn.addEventListener('click', () => showTraitPanel(t.key, api, { side, traits: list }));
  return btn;
}

// ---------- 對外：renderTraits ----------
export function renderTraits(root, traitsPlayer, traitsEnemy, api) {
  ensureStyle(); bindHover(api);
  const list = (traitsPlayer || []).filter(t => t.count >= 1);
  const ul = el('ul', { class: 'tt-trait-list tt-hscroll', 'aria-label': '我的羈絆' });
  if (!list.length) ul.append(el('li', { class: 'tt-traitbar-empty' }, '放棋子上場，羈絆就會出現在這裡'));
  for (const t of list) ul.append(el('li', {}, traitCard(t, api, { list: traitsPlayer })));
  const prev = root.querySelector?.('.tt-trait-list');
  const sx = prev?.scrollLeft || 0, sy = prev?.scrollTop || root.scrollTop || 0;
  root.replaceChildren(ul);
  ul.scrollLeft = sx; root.scrollTop = sy;
  const eroot = document.querySelector('[data-tt-enemy]');
  if (eroot && traitsEnemy) renderEnemyTraits(eroot, traitsEnemy, api);
}

export function renderEnemyTraits(root, traitsEnemy, api) {
  ensureStyle(); bindHover(api);
  const { DATA } = api; const wrap = el('span', { class: 'tt-enemy-traits', 'aria-label': '敵方羈絆' });
  const list = (traitsEnemy || []).filter(t => t.count >= 1);
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
export function highlightTrait(key, on) {
  const m = new Set(curApi?.DATA.traits.byKey[key]?.members || []);
  document.querySelectorAll('[data-tt-unit]').forEach(n => n.classList.toggle('tt-hl', !!on && m.has(n.dataset.ttUnit)));
}
export function highlightUnit(unitKey, on) {
  const ts = new Set(curApi?.DATA.units.byKey[unitKey]?.traits || []);
  document.querySelectorAll('.tt-trow[data-trait]').forEach(n => n.classList.toggle('tt-hl', !!on && ts.has(n.dataset.trait)));
}
let bound = false, curApi = null;
function bindHover(api) {
  curApi = api;
  if (new URLSearchParams(location.search).has('seed')) window.__ttApi = api;
  if (bound) return; bound = true;
  let lp = null;
  const traitEl = (e) => e.target.closest?.('.tt-trow[data-trait],.tt-etrait[data-trait]');
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
      if (t) highlightTrait(t.dataset.trait, true); else highlightUnit(u.dataset.ttUnit, true);
      setTimeout(() => { document.querySelectorAll('.tt-hl').forEach(n => n.classList.remove('tt-hl')); }, 1500);
    }, 450);
  });
  const cancel = () => clearTimeout(lp);
  document.addEventListener('pointerup', cancel); document.addEventListener('pointercancel', cancel);
}

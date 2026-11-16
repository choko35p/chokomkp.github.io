// 棋盤、板凳、裝備列（佈陣階段）。SPEC 5.2–5.4。
// 戰鬥階段：renderBoard(el, api, {mode:'battle'}) 只畫 8 排空格的 .tt-field（el.__field），棋子由 battle.js 疊上去。
// 戰鬥：座標約定（和 battle.js 一致）：格子中心 x = (col + 0.5*(row&1) + 0.5)*w，y = (row*0.866 + 0.5)*w，w = 棋盤寬/7.5。
// 佈陣：8 排等大、縱向壓扁的六角（官方視角），位置全用 CSS 變數 --x（欄＋奇數排半格）、--r（0–7 排）、--g（我方半場 1）。
export const COLS = 7;
const ROW_H = 0.866;

export function el(tag, cls, attrs, ...kids) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs || {})) { if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

export const zhOf = (DATA, key) => DATA.units.byKey[key]?.zh || key;
export const costOf = (DATA, key) => DATA.units.byKey[key]?.cost ?? 1;
export const itemZh = (DATA, key) => DATA.items.byKey[key]?.zh || DATA.items.compByKey?.[key]?.zh || key;
export const starText = (n) => '★'.repeat(Math.max(1, n || 1));

// 頭像：精靈圖（SPEC 0.2）。背景位置用百分比，任何尺寸都對得上。
export function styleAvatar(node, DATA, key) {
  const sp = DATA.units.sprite || {};
  const idx = sp.map?.[key];
  if (idx == null) { node.textContent = zhOf(DATA, key).slice(0, 1); node.style.display = node.style.display || 'grid'; return node; }
  const cols = sp.cols || 10, rows = sp.rows || 10;
  node.style.backgroundImage = `url("${sp.src}")`;
  node.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${(idx % cols) * 100 / (cols - 1)}% ${Math.floor(idx / cols) * 100 / (rows - 1)}%`;
  return node;
}
export function avatarEl(DATA, key, size) {
  const a = el('span', 'tt-xav', { role: 'img', 'aria-label': zhOf(DATA, key) });
  if (size) a.style.setProperty('--tt-av', size + 'px');
  return styleAvatar(a, DATA, key);
}

// 棋子 token（棋盤與板凳共用）。頭上：星級小方塊＋血條（官方樣式）。
export function unitToken(DATA, u, desc, { enemy = false, fav = null } = {}) {
  const cost = costOf(DATA, u.key);
  const t = el('div', 'tt-unit tt-cost' + cost, { 'data-tt-drag': desc, 'data-tt-uid': u.uid, 'data-tt-unit': u.key, 'data-tt-star': u.star, title: `${zhOf(DATA, u.key)} ${u.star}星` });
  t.append(styleAvatar(el('span', 'tt-xav'), DATA, u.key));
  t.append(el('span', 'tt-hpb' + (enemy ? ' tt-e' : '') + (u.star >= 2 ? ' tt-s' + u.star : ''), { 'aria-hidden': 'true' }, el('i', 'tt-sq', {}, u.star), el('span', 'tt-hpf')));
  if (fav) {   // 心鋼最愛標記：on＝有效（可以拖去改選）、off＝羈絆掉階暫時失效
    const on = fav === 'on';
    t.append(el('i', 'tt-favmark' + (on ? '' : ' tt-off'), { 'data-tt-tip': on ? 'sp:favmark' : 'sp:favoff', 'aria-label': on ? '心鋼最愛' : '心鋼最愛（暫時失效）', ...(on ? { 'data-tt-drag': 'fav:' + u.uid, 'data-tt-tap': 'fav:' + u.uid } : {}) }, '♥'));
    t.classList.add('tt-isfav');
  }
  if (u.items && u.items.length) {
    const box = el('span', 'tt-it', { 'aria-hidden': 'true' });
    for (const k of u.items) { const i = el('i'); i.style.backgroundImage = `url("../icons/items/${k}.webp")`; box.append(i); }
    t.append(box);
  }
  return t;
}

const hexX = (row, col) => col + 0.5 * (row & 1);

function cellEl(row, col, extra, mine) {
  const c = el('div', 'tt-cell', extra);
  c.style.setProperty('--x', hexX(row, col));
  c.style.setProperty('--r', row);
  if (mine) c.style.setProperty('--g', 1);
  return c;
}

const favOf = (api, u) => {
  try { const f = api.fav && api.fav(); if (!f || !f.held.includes(u.uid)) return null; return f.active.includes(u.uid) ? 'on' : 'off'; } catch (_) { return null; }
};

// 特殊道具（不佔 3 件裝備格、也不佔裝備欄的 10 格）：黃金卸除器、心鋼最愛
export const SPECIAL_INFO = {
  rm: { zh: '黃金卸除器', sub: '消耗品・每局開場送 1 個', desc: '拖到有裝備的棋子身上，會把他身上的裝備全部拆下來放回裝備欄。用完就沒了，想清楚再用。裝備欄放不下就不能用。', hint: '要用就把它拖到有裝備的棋子身上。' },
  fav: { zh: '心鋼最愛', sub: '心鋼之聲 3 階給 1 個、5 階再給 1 個', desc: '拖到一位心鋼之聲成員身上，就是選他當最愛，他的技能會變強（技能增幅 +25%）。只能放在心鋼之聲成員身上，同一位不能放兩個。佈陣時可以從一位身上拖到另一位改選。羈絆掉到 3 階以下，標記會先失效，湊回來就自動回到原本那位。沒放的話就不強化。', hint: '要選他強化，就把它拖到心鋼之聲成員身上。' },
  favmark: { zh: '心鋼最愛', sub: '', desc: '這位是你選的最愛，技能變強（技能增幅 +25%）。把這個標記拖到另一位心鋼之聲成員身上就能改選。要上場才有效。', hint: '' },
  favoff: { zh: '心鋼最愛（暫時失效）', sub: '', desc: '心鋼之聲掉到 3 階以下了，標記先留在這位身上沒效果。羈絆湊回來就自動生效。', hint: '' },
};

export function renderSpecials(el_, api) {
  const { state } = api;
  const f = api.fav ? api.fav() : { free: 0 };
  const sel = api.ui.sel && api.ui.sel.kind === 'sp' ? api.ui.sel.id : null;
  const nodes = [];
  const mk = (id, cls, label) => {
    const b = el('div', 'tt-xslot tt-xsp ' + cls, { role: 'button', tabindex: '0', 'data-tt-tap': 'sp:' + id, 'data-tt-drag': 'sp:' + id, 'data-tt-tip': 'sp:' + id, 'aria-label': label });
    if (sel === id) b.classList.add('tt-sel');
    return b;
  };
  if ((state.removers || 0) > 0) nodes.push(mk('rm', 'tt-sp-rm', '黃金卸除器，拖到有裝備的棋子身上，把裝備全部卸回裝備欄'));
  for (let i = 0; i < (f.free || 0); i++) nodes.push(mk('fav', 'tt-sp-fav', '心鋼最愛，拖到一位心鋼之聲成員身上，選他強化技能'));
  el_.replaceChildren(...nodes);
  el_.hidden = !nodes.length;
}

export function selUid(api) { const s = api.ui && api.ui.sel; return s && s.kind === 'unit' ? s.uid : null; }

export function renderBoard(el_, api, view = {}) {
  const { state, DATA } = api;
  const mode = view.mode || 'plan';
  el_.dataset.mode = mode;
  el_.__field = null;
  if (mode === 'battle') {
    const field = el('div', 'tt-field', { 'aria-hidden': 'true' });
    for (let r = 0; r < 8; r++) for (let c = 0; c < COLS; c++) { const cell = cellEl(r, c, null, false); cell.classList.add('tt-bcell'); field.append(cell); }
    el_.replaceChildren(field);
    el_.__field = field;
    return;
  }
  // —— 佈陣：上半敵方、下半我方，等大 ——
  const eh = el('div', 'tt-half tt-e', { role: 'group', 'aria-label': '敵方陣容' });
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) eh.append(cellEl(r, c, { 'aria-hidden': 'true' }, false));
  const esel = api.ui && api.ui.sel && api.ui.sel.kind === 'enemy' ? api.ui.sel : null;
  for (const u of (view.enemy && view.enemy.units) || []) {
    const row = 3 - u.pos[0], col = 6 - u.pos[1];
    const cell = eh.children[row * COLS + col];
    const tk = unitToken(DATA, { uid: 'e', key: u.key, star: u.star, items: u.items }, 'enemy', { enemy: true });
    tk.removeAttribute('data-tt-drag'); tk.removeAttribute('data-tt-uid');
    tk.classList.add('tt-eu'); tk.setAttribute('data-tt-tap', 'enemy:' + u.key);
    tk.setAttribute('data-tt-items', (u.items || []).join(','));
    if (esel && esel.key === u.key && esel.star === u.star) tk.classList.add('tt-sel');
    tk.setAttribute('role', 'button'); tk.setAttribute('tabindex', '0');
    tk.setAttribute('aria-label', `敵方：${zhOf(DATA, u.key)} ${u.star} 星`);
    cell.append(tk);
  }
  const ph = el('div', 'tt-half tt-p', { role: 'group', 'aria-label': '我方棋盤' });
  const sel = selUid(api);
  const place = new Map();
  for (const u of state.board || []) if (u && u.pos) place.set(u.pos[0] + ',' + u.pos[1], u);
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) {
    const u = place.get(r + ',' + c);
    const label = `我方 ${'ABCD'[r]}${c + 1}` + (u ? `：${zhOf(DATA, u.key)} ${u.star} 星` : '：空格');
    const cell = cellEl(4 + r, c, { role: 'button', tabindex: '0', 'aria-label': label, 'data-tt-drop': `board:${r},${c}` }, true);
    if (u) {
      const tk = unitToken(DATA, u, `board:${r},${c}`, { fav: favOf(api, u) });
      tk.setAttribute('data-tt-tap', `board:${r},${c}`);
      if (u.uid === sel) tk.classList.add('tt-sel');
      cell.append(tk);
    }
    ph.append(cell);
  }
  el_.replaceChildren(eh, ph);
}

export function renderBench(el_, api) {
  const { state, DATA } = api;
  const sel = selUid(api);
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const u = (state.bench || [])[i];
    const s = el('div', 'tt-bslot', { role: 'button', tabindex: '0', 'data-tt-drop': `bench:${i}`,
      'aria-label': `板凳 ${i + 1}` + (u ? `：${zhOf(DATA, u.key)} ${u.star} 星` : '：空') });
    if (u) { const tk = unitToken(DATA, u, `bench:${i}`, { fav: favOf(api, u) }); tk.setAttribute('data-tt-tap', `bench:${i}`); if (u.uid === sel) tk.classList.add('tt-sel'); s.append(tk); }
    slots.push(s);
  }
  el_.replaceChildren(...slots);
}

// 裝備欄：官方是最左一直排黑底方格（共 10 格），裝備依序放進去。
export function renderItems(el_, api) {
  const { state, DATA } = api;
  const sel = api.ui.sel;
  const list = state.itemBench || [];
  const n = DATA.rules.itemBenchSize || 10;
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const k = list[i];
    if (!k) { nodes.push(el('div', 'tt-xslot', { 'aria-hidden': 'true' })); continue; }
    const b = el('div', 'tt-xslot tt-xitem', { role: 'button', tabindex: '0', 'data-tt-tap': `item:${i}`, 'data-tt-drag': `item:${i}`, 'data-tt-tip': 'item:' + k, 'aria-label': '裝備：' + itemZh(DATA, k) });
    b.style.backgroundImage = `url("../icons/items/${k}.webp")`;
    if (sel && sel.kind === 'item' && sel.idx === i) b.classList.add('tt-sel');
    nodes.push(b);
  }
  el_.replaceChildren(...nodes);
}

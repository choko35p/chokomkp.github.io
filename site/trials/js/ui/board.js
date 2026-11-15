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
export function unitToken(DATA, u, desc, { enemy = false } = {}) {
  const cost = costOf(DATA, u.key);
  const t = el('div', 'tt-unit tt-cost' + cost, { 'data-tt-drag': desc, 'data-tt-uid': u.uid, 'data-tt-unit': u.key, 'data-tt-star': u.star, title: `${zhOf(DATA, u.key)} ${u.star}星` });
  t.append(styleAvatar(el('span', 'tt-xav'), DATA, u.key));
  t.append(el('span', 'tt-hpb' + (enemy ? ' tt-e' : '') + (u.star >= 2 ? ' tt-s' + u.star : ''), { 'aria-hidden': 'true' }, el('i', 'tt-sq', {}, u.star), el('span', 'tt-hpf')));
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
      const tk = unitToken(DATA, u, `board:${r},${c}`);
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
    if (u) { const tk = unitToken(DATA, u, `bench:${i}`); tk.setAttribute('data-tt-tap', `bench:${i}`); if (u.uid === sel) tk.classList.add('tt-sel'); s.append(tk); }
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

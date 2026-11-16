// 棋盤、板凳、裝備列（佈陣階段）。SPEC 5.2–5.4。
// 戰鬥階段：renderBoard(el, api, {mode:'battle'}) 只畫 8 排空格的 .tt-field（el.__field），棋子由 battle.js 疊上去。
// 戰鬥：座標約定（和 battle.js 一致）：格子中心 x = (col + 0.5*(row&1) + 0.5)*w，y = (row*0.866 + 0.5)*w，w = 棋盤寬/7.5。
// 佈陣：8 排正六角形（和戰鬥畫面同比例），位置全用 CSS 變數 --x（欄＋奇數排半格）、--r（0–7 排）、--g（我方半場 1）；格線整張置中、隨可用空間縮放。
import { traitIcon } from './traitbar.js';
import { starsEl } from './stars.js';
export { starsEl };
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

// 棋子 token（棋盤與板凳共用）。頭上：星星圖示（銅／銀／金）＋血條（官方樣式）。
// marks＝身上的指定道具標記：[{ id: 'fav'|'spot'|'deal'|'prod'|'clone', on: 有沒有效, extra: 合作邀請選到的羈絆 key }]，從右上角往下排。
export function unitToken(DATA, u, desc, { enemy = false, marks = null } = {}) {
  const cost = costOf(DATA, u.key);
  const t = el('div', 'tt-unit tt-cost' + cost + ' tt-star' + Math.min(3, u.star || 1), { 'data-tt-drag': desc, 'data-tt-uid': u.uid, 'data-tt-unit': u.key, 'data-tt-star': u.star, title: `${zhOf(DATA, u.key)} ${u.star}星` });
  t.append(styleAvatar(el('span', 'tt-xav'), DATA, u.key));
  // 頭上：星星（1 銅、2 銀、3 金）在血條上面，不蓋血條
  t.append(el('span', 'tt-hpb' + (enemy ? ' tt-e' : ''), { 'aria-hidden': 'true' }, el('span', 'tt-hpf')), el('span', 'tt-ustars', { 'aria-hidden': 'true' }, starsEl(u.star, { label: false })));
  (marks || []).forEach((m, i) => {
    const on = !!m.on, zh = PICK_ZH[m.id] || m.id;
    const tip = 'sp:' + m.id + (on ? 'mark' : 'off');
    const aria = zh + (on ? '' : '（暫時失效）');
    if (m.id === 'fav') {   // 心鋼最愛：愛心標記（有效的可以抓去拖到另一位改選）
      t.append(el('i', 'tt-favmark' + (on ? '' : ' tt-off'), { 'data-tt-tip': tip, 'aria-label': aria, style: `--mi:${i}`, 'data-tt-drag': 'fav:' + u.uid, 'data-tt-tap': 'fav:' + u.uid }, '♥'));
      t.classList.add('tt-isfav');
      return;
    }
    const mk = el('i', `tt-pickmark tt-pm-${m.id}` + (on ? '' : ' tt-off'), { 'data-tt-tip': tip, 'aria-label': aria, style: `--mi:${i}`, 'data-tt-drag': `mk:${m.id}:${u.uid}`, 'data-tt-tap': `mk:${m.id}:${u.uid}` });
    if (m.id === 'prod' && m.extra) mk.append(traitIcon(DATA, m.extra, 14));
    t.append(mk);
    if (m.id === 'spot') t.classList.add(on ? 'tt-isspot' : 'tt-isspot-off');
  });
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

const PICK_ZH = { fav: '心鋼最愛', spot: '聚光燈', deal: '唱片合約', prod: '合作邀請', clone: '分身站位' };
const PICK_ORDER = ['fav', 'spot', 'deal', 'prod', 'clone'];
// 這隻棋子身上有哪些指定道具標記（含暫時失效的）
const marksOf = (api, u) => {
  try {
    const p = api.picks && api.picks(); if (!p) return null;
    const out = [];
    for (const id of PICK_ORDER) { const f = p[id]; if (f && f.held.includes(u.uid)) out.push({ id, on: f.active.includes(u.uid), extra: id === 'prod' ? f.trait : null }); }
    return out.length ? out : null;
  } catch (_) { return null; }
};

// 特殊道具（不佔 3 件裝備格、也不佔裝備欄的 10 格）：黃金卸除器，加上羈絆給的指定道具。都可以一直重複用、可以重選。
export const SPECIAL_INFO = {
  rm: { zh: '黃金卸除器', sub: '每局都有，可以一直用', desc: '拖到有裝備的棋子身上，把他的裝備全部拆回裝備欄。可以重複用，不用省。裝備欄放不下就不能用。', hint: '要用就把它拖到有裝備的棋子身上。' },
  fav: { zh: '心鋼最愛', sub: '心鋼之聲 3 階給 1 個、5 階給 2 個', desc: '拖到一位心鋼之聲成員身上，就是選他當最愛，他的技能會變強（技能增幅 +25%）。可以一直重複用：想改選就再拖到另一位身上，或直接把他身上的愛心拖過去；拖到已經是最愛的那位就是取消。沒放就沒有效果。', hint: '要選他強化，就把它拖到心鋼之聲成員身上。' },
  spot: { zh: '聚光燈', sub: '經紀人 2 階給 1 盞', desc: '拖到你要捧的那隻身上。開場和每 5 秒他都拿一次加成，可以疊。想換人就再拖一次。', hint: '不一定要拖給經紀人，場上誰都可以。' },
  deal: { zh: '唱片合約', sub: '蒙多在場就有，每 4 回合多 1 份', desc: '拖到你要簽的那隻身上：他傷害增幅 +5%，他每殺一個，蒙多永久 +25 生命。簽錯了再拖一次就能改。', hint: '蒙多自己也可以簽，同一隻只能簽 1 份。' },
  prod: { zh: '合作邀請', sub: '索娜在場就有', desc: '拖到一隻棋子身上，索娜就跟他的樂團合作，那個羈絆多算 1 人。想換樂團就拖到別隻身上。', hint: '要拖給有起源羈絆的棋子，歐拉夫有兩個樂團，連拖兩次可以換。' },
  clone: { zh: '分身站位', sub: '銳空在場就有', desc: '拖到一隻棋子身上，銳空的分身開場就站在他旁邊。沒拖就站在銳空旁邊。', hint: '' },
  favmark: { zh: '心鋼最愛', sub: '', desc: '這位是你選的最愛，技能變強（技能增幅 +25%）。把這個標記拖到另一位心鋼之聲成員身上就能改選。要上場才有效。', hint: '' },
  favoff: { zh: '心鋼最愛（暫時失效）', sub: '', desc: '心鋼之聲掉階了，或他在板凳上，先沒有效果。湊回來、上場就自動恢復。', hint: '' },
  spotmark: { zh: '聚光燈', sub: '', desc: '這隻是你捧的人，開場和每 5 秒都拿一次傷害增幅。把這個標記拖到另一隻身上就能換人。要上場才有效。', hint: '' },
  spotoff: { zh: '聚光燈（暫時失效）', sub: '', desc: '經紀人湊不到 2 階，或他在板凳上，先沒有效果。湊回來、上場就自動恢復。', hint: '' },
  dealmark: { zh: '唱片合約', sub: '', desc: '他簽了合約：傷害增幅 +5%，他每殺一個，蒙多永久 +25 生命。把這個標記拖到別隻身上就能改簽。要上場才有效。', hint: '' },
  dealoff: { zh: '唱片合約（暫時失效）', sub: '', desc: '蒙多不在場、他在板凳上，或合約份數不夠，先沒有效果。回來就自動恢復。', hint: '' },
  prodmark: { zh: '合作邀請', sub: '', desc: '索娜跟他的樂團合作，標記上的那個羈絆多算 1 人。把這個標記拖到別隻身上就能換樂團。要上場才有效。', hint: '' },
  prodoff: { zh: '合作邀請（暫時失效）', sub: '', desc: '索娜不在場，或他在板凳上，先沒有效果。回來就自動恢復。', hint: '' },
  clonemark: { zh: '分身站位', sub: '', desc: '銳空的分身開場會站在這隻旁邊。把這個標記拖到別隻身上就能換位置。要上場才有效。', hint: '' },
  cloneoff: { zh: '分身站位（暫時失效）', sub: '', desc: '銳空不在場，或他在板凳上，先沒有效果，分身就站在銳空旁邊。', hint: '' },
};
const SP_LABEL = {
  rm: '黃金卸除器，拖到有裝備的棋子身上，把裝備全部卸回裝備欄，可以一直用',
  fav: '心鋼最愛，拖到一位心鋼之聲成員身上，選他強化技能，可以重選',
  spot: '聚光燈，拖到你要捧的那隻身上，可以重選',
  deal: '唱片合約，拖到你要簽的那隻身上，可以重選',
  prod: '合作邀請，拖到一隻棋子身上，選他的樂團多算 1 人，可以重選',
  clone: '分身站位，拖到一隻棋子身上，分身開場站在他旁邊，可以重選',
};

export function renderSpecials(el_, api) {
  const sel = api.ui.sel && api.ui.sel.kind === 'sp' ? api.ui.sel.id : null;
  const p = api.picks ? api.picks() : {};
  const nodes = [];
  const mk = (id, n) => {
    const b = el('div', `tt-xslot tt-xsp tt-sp-${id}`, { role: 'button', tabindex: '0', 'data-tt-tap': 'sp:' + id, 'data-tt-drag': 'sp:' + id, 'data-tt-tip': 'sp:' + id, 'aria-label': SP_LABEL[id] + (n != null ? `，還有 ${n} 個沒放` : '') });
    if (sel === id) b.classList.add('tt-sel');
    if (n != null) {
      b.append(el('i', 'tt-sp-n', { 'aria-hidden': 'true' }, n));   // 右下角：還沒放的數量（放完是 0，圖示不消失）
      if (n > 0 && id !== 'clone') b.classList.add('tt-pulse');
    }
    return b;
  };
  nodes.push(mk('rm', null));   // 黃金卸除器每局都在、無限用
  for (const id of PICK_ORDER) { const f = p[id]; if (f && f.cap > 0) nodes.push(mk(id, f.free)); }
  el_.replaceChildren(...nodes);
  el_.hidden = !nodes.length;
  // 桌機版：道具排成幾列由寬度決定，把高度記在舞台上，讓下面的增幅列、羈絆欄跟著往下讓
  const stage = el_.closest && el_.closest('.tt-stage');
  const sync = () => { const h = el_.offsetHeight; if (stage && h > 0) stage.style.setProperty('--tt-xh', h + 'px'); };
  sync();
  if (!el_.__ro && typeof ResizeObserver !== 'undefined') { el_.__ro = new ResizeObserver(sync); el_.__ro.observe(el_); }
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
      const tk = unitToken(DATA, u, `board:${r},${c}`, { marks: marksOf(api, u) });
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
    if (u) { const tk = unitToken(DATA, u, `bench:${i}`, { marks: marksOf(api, u) }); tk.setAttribute('data-tt-tap', `bench:${i}`); if (u.uid === sel) tk.classList.add('tt-sel'); s.append(tk); }
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

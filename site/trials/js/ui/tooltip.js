// 說明框（SPEC_UI2 4.5）：技能／羈絆／裝備／增幅／純文字／數值／解鎖條件。
//   bindTips(root, api)   委派：找 [data-tt-tip]，滑鼠 hover 150ms 顯示、離開收起；鍵盤 focus 也顯示；[data-tt-pin] 的元素點一下＝釘住／取消
//   showTip(anchorEl, spec, {pin=false, placement='top', row?, full?})   spec：data-tt-tip 字串，或 {icon, title, sub, body:[節點|字串], foot:[…]}
//   hideTip()
// data-tt-tip 的值：unit:<unitKey>（棋子頭像卡：名字、費用、羈絆、技能）｜ability:<unitKey>:<star>｜trait:<key>｜item:<key>｜aug:<key>｜text:<純文字>｜stat:<statKey>｜unlock:<unitKey>
// 本檔頂層不使用 panels／traitbar 的匯出（互相 import，只在函式執行時才用）。
import * as PN from './panels.js';
import * as TB from './traitbar.js';
import { SPECIAL_INFO } from './board.js';

const SHOW_MS = 150;
let tipEl = null, anchorEl = null, pinned = false, timer = 0, curApi = null, curSpec = null, curOpts = null;
let lastPt = { x: 0, y: 0 }, seq = 0;

const h = (tag, cls, ...kids) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
};
const traitIconNode = (DATA, key, size) => { try { return TB.traitIcon ? TB.traitIcon(DATA, key, size) : null; } catch (_) { return null; } };

// ---------- 內文：技能數字 280/420/630 把目前星級加粗、上青色 ----------
const TRIPLE = /(\d+(?:\.\d+)?%?)\/(\d+(?:\.\d+)?%?)\/(\d+(?:\.\d+)?%?)/g;
export function richText(text, star = 0) {
  const frag = document.createDocumentFragment();
  const s = String(text ?? '');
  let last = 0, m;
  TRIPLE.lastIndex = 0;
  while ((m = TRIPLE.exec(s))) {
    frag.append(s.slice(last, m.index));
    const g = h('span', 'tt-tipnum');
    for (let i = 1; i <= 3; i++) { if (i > 1) g.append('/'); g.append(h(i === star ? 'b' : 'span', '', m[i])); }
    frag.append(g);
    last = m.index + m[0].length;
  }
  frag.append(s.slice(last));
  return frag;
}
const paras = (text, star, max = 99) => String(text || '').split('\n').filter(Boolean).slice(0, max).map(t => h('p', 'tt-tip-p', richText(t, star)));

// ---------- 技能圖示（沒有專用圖示檔就用頭像＋青色圓框＋「技」） ----------
// 專用圖示放 ../icons/s19/abilities/<UnitKey>.webp；要用的話在 DATA.units.abilityIcons 登記 key（陣列或物件），避免亂發 404。
export function abilityIcon(DATA, key, size = 48) {
  const box = h('span', 'tt-abicon', h('i', 'tt-abtag', '技'));
  box.style.setProperty('--tt-ab', size + 'px');
  const reg = DATA.units?.abilityIcons;
  const has = reg && (Array.isArray(reg) ? reg.includes(key) : !!reg[key]);
  if (has) {
    const img = document.createElement('img');
    img.src = `../icons/s19/abilities/${key}.webp`; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', () => { img.remove(); fillAvatar(); });
    box.prepend(img);
    return box;
  }
  fillAvatar();
  return box;
  function fillAvatar() {
    const sp = DATA.units?.sprite || {}, idx = sp.map?.[key];
    const a = h('span', 'tt-abav');
    if (idx != null && sp.src) {
      const cols = sp.cols || 10, rows = sp.rows || 10;
      a.style.backgroundImage = `url("${sp.src}")`;
      a.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
      a.style.backgroundPosition = `${(idx % cols) * 100 / (cols - 1)}% ${Math.floor(idx / cols) * 100 / (rows - 1)}%`;
    }
    box.prepend(a);
  }
}

// ---------- 各種內容 ----------
function head(iconNode, title, sub) {
  return h('div', 'tt-tip-head', iconNode || null, h('div', 'tt-tip-ht', h('b', 'tt-tip-title', title), sub ? h('span', 'tt-tip-sub', sub) : null));
}
const badge = (t, cls = '') => h('span', 'tt-tip-badge ' + cls, t);

function buildAbility(api, key, star) {
  const { DATA } = api; const U = DATA.units.byKey[key]; const ab = U?.ability;
  if (!U || !ab) return h('div', 'tt-tip-in', head(null, U?.zh || key, ''), h('p', 'tt-tip-p', '這隻沒有技能說明。'));
  const mana = U.stats?.mana;
  const foot = [];
  foot.push(h('span', '', mana && mana[1] ? `法力 ${mana[0]}/${mana[1]}` : '不靠法力'));
  if (ab.simplified) foot.push(badge('簡化', 'tt-simp'));
  if (ab.guess) foot.push(badge('推測數值', 'tt-guess'));
  const wrap = h('div', 'tt-tip-in', head(abilityIcon(DATA, key, 48), ab.name, `${U.zh}${star ? '　' + star + ' 星' : ''}`), ...paras(ab.desc, star));
  if (ab.simplified) wrap.append(h('p', 'tt-tip-p tt-tip-muted', '本頁做法：' + ab.simplified));
  wrap.append(h('div', 'tt-tip-foot', foot));
  return wrap;
}

// 棋子頭像卡（羈絆面板成員、圖鑑、解鎖面板、隊伍編輯器）：名字、費用、羈絆（含圖示）、技能名與說明（星級數字 a/b/c）；沒解鎖的補一行解鎖條件
function buildUnit(api, key) {
  const { DATA } = api; const U = DATA.units.byKey[key];
  if (!U) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', key));
  const ab = U.ability;
  const tr = h('div', 'tt-tip-traits');
  for (const k of U.traits || []) tr.append(h('span', 'tt-tip-trait', traitIconNode(DATA, k, 18), DATA.traits.byKey[k]?.zh || k));
  const wrap = h('div', 'tt-tip-in', head(abilityIcon(DATA, key, 48), U.zh, `${U.cost} 費${U.role ? '　' + U.role : ''}`), tr);
  if (ab) {
    wrap.append(h('p', 'tt-tip-p tt-tip-abname', h('b', '', '技能：' + ab.name)), ...paras(ab.desc, 0));
    const mana = U.stats?.mana;
    const foot = [h('span', '', mana && mana[1] ? `法力 ${mana[0]}/${mana[1]}` : '不靠法力')];
    if (ab.simplified) foot.push(badge('簡化', 'tt-simp'));
    if (ab.guess) foot.push(badge('推測數值', 'tt-guess'));
    wrap.append(h('div', 'tt-tip-foot', foot));
  } else wrap.append(h('p', 'tt-tip-p', '這隻沒有技能說明。'));
  try {
    if (PN.isLocked && PN.isLocked(api, key)) { const n = PN.unlockTipNodes ? PN.unlockTipNodes(api, key) : null; if (n) wrap.append(h('div', 'tt-tip-lock', ...n)); }
  } catch (_) { /* 解鎖資訊壞了不影響說明 */ }
  return wrap;
}

function playerTraitList(api) {
  try { return PN.playerTraitsOf ? PN.playerTraitsOf(api) : []; } catch (_) { return []; }
}
function buildTrait(api, key) {
  const { DATA } = api; const T = DATA.traits.byKey[key];
  if (!T) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', key));
  const cur = playerTraitList(api).find(t => t.key === key) || { count: 0, tier: 0 };
  const star = T.countMode === 'stars' || key === 'KDA';
  const unit = star ? '星' : '隻';
  const KIND = { origin: '起源', class: '職業', unique: '獨特' };
  let unset = false;   // 經紀人／唱片大亨／製作人啟動了、但還沒指定對象
  try { const PK = api.picks && api.picks(); const id = { Manager: 'spot', RecordMogul: 'deal', Producer: 'prod', BeachPop: 'inst' }[key]; unset = !!(PK && id && PK[id].cap > 0 && !PK[id].active.length); } catch (_) { unset = false; }
  const wrap = h('div', 'tt-tip-in', head(traitIconNode(DATA, key, 40), T.zh, KIND[T.kind] || ''), unset ? h('p', 'tt-tip-p tt-tip-warn', key === 'BeachPop' ? '樂器還沒擺，要把裝備欄旁邊的沙灘樂器拖到我方空格上才有效果' : '還沒指定，要把裝備欄旁邊的道具拖到棋子身上才有效果') : null, ...paras(T.desc, 0, 2));
  const bps = T.breakpoints || [];
  const ul = h('ul', 'tt-tip-tiers');
  bps.forEach((b, i) => ul.append(h('li', (cur.tier === i + 1 ? 'tt-cur ' : '') + (cur.count >= b ? 'tt-reached' : ''), h('b', '', b), h('span', '', T.levelsText?.[i] || ''))));
  wrap.append(ul);
  const next = bps.find(b => b > cur.count);
  const foot = [];
  if (cur.count) foot.push(h('span', '', `目前 ${cur.count} ${unit}` + (cur.tier ? `（第 ${cur.tier} 階）` : '，還沒啟動')));
  if (next != null && cur.count) foot.push(h('span', '', `差 ${next - cur.count} ${unit}${cur.tier ? '升階' : '啟動'}`));
  if (!cur.count) foot.push(h('span', '', '場上沒有'));
  if (T.simplified) foot.push(badge('簡化', 'tt-simp'));
  if (T.guess) foot.push(badge('推測', 'tt-guess'));
  wrap.append(h('div', 'tt-tip-foot', foot));
  return wrap;
}

function itemOf(DATA, key) { return DATA.items?.byKey?.[key] || DATA.items?.compByKey?.[key] || null; }
function buildItem(api, key) {
  const { DATA } = api; const I = itemOf(DATA, key);
  const ic = h('span', 'tt-tip-itemicon'); ic.style.backgroundImage = `url("../icons/items/${key}.webp")`;
  const wrap = h('div', 'tt-tip-in', head(ic, I?.zh || key, I?.recipe ? '成品裝備' : '散件'));
  if (I?.desc) wrap.append(...paras(I.desc));
  if (I?.recipe) wrap.append(h('p', 'tt-tip-p tt-tip-muted', '合成：' + I.recipe.map(k => itemOf(DATA, k)?.zh || k).join(' ＋ ')));
  return wrap;
}

export function augIconNode(A) {
  const icon = h('span', 'tt-tip-augicon');
  icon.style.backgroundImage = 'url("../icons/aug-sprite.webp")'; icon.style.backgroundSize = '2000% 1300%';
  icon.style.backgroundPosition = `${((A.sp || 0) % 20) * 100 / 19}% ${Math.floor((A.sp || 0) / 20) * 100 / 12}%`;
  return icon;
}
function buildAug(api, key) {
  const { DATA } = api; const A = DATA.augments?.byKey?.[key];
  if (!A) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', key));
  const wrap = h('div', 'tt-tip-in', head(augIconNode(A), A.zh, ['', '銀色增幅', '金色增幅', '彩色增幅'][A.tier] || ''), ...paras(A.desc));
  if (A.guess) wrap.append(h('div', 'tt-tip-foot', badge('推測數值', 'tt-guess')));
  return wrap;
}

function buildStat(api, statKey) {
  const info = PN.statTipInfo ? PN.statTipInfo(api, statKey) : null;
  if (!info) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', statKey));
  const wrap = h('div', 'tt-tip-in', head(null, info.title, info.value));
  if (info.desc) wrap.append(h('p', 'tt-tip-p tt-tip-muted', info.desc));
  if (info.lines.length) { const ul = h('ul', 'tt-tip-src'); for (const [a, b] of info.lines) ul.append(h('li', '', h('span', '', a), h('b', '', b))); wrap.append(ul); }
  else wrap.append(h('p', 'tt-tip-p tt-tip-muted', '沒有額外加成。'));
  return wrap;
}

function buildUnlock(api, key) {
  const nodes = PN.unlockTipNodes ? PN.unlockTipNodes(api, key) : null;
  if (!nodes) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', '這隻要先解鎖。'));
  return h('div', 'tt-tip-in', ...nodes);
}

export function buildTip(spec, api = curApi) {
  if (spec && typeof spec === 'object' && !spec.nodeType) {
    return h('div', 'tt-tip-in', head(spec.icon || null, spec.title || '', spec.sub || ''), ...(spec.body || []).map(b => (typeof b === 'string' ? h('p', 'tt-tip-p', b) : b)),
      spec.foot && spec.foot.length ? h('div', 'tt-tip-foot', spec.foot) : null);
  }
  const s = String(spec || '');
  const i = s.indexOf(':'); const kind = i < 0 ? 'text' : s.slice(0, i); const rest = i < 0 ? s : s.slice(i + 1);
  if (kind === 'text') return h('div', 'tt-tip-in', h('p', 'tt-tip-p', rest));
  if (!api) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', rest));
  if (kind === 'unit') return buildUnit(api, rest);
  if (kind === 'ability') { const [k, st] = rest.split(':'); return buildAbility(api, k, Number(st) || 1); }
  if (kind === 'trait') return buildTrait(api, rest);
  if (kind === 'item') return buildItem(api, rest);
  if (kind === 'aug') return buildAug(api, rest);
  if (kind === 'sp') {
    const I = SPECIAL_INFO[rest]; if (!I) return h('div', 'tt-tip-in', h('p', 'tt-tip-p', rest));
    const ic = h('span', 'tt-tip-itemicon tt-spicon tt-sp-' + rest.replace(/(mark|off)$/, ''));
    return h('div', 'tt-tip-in', head(ic, I.zh, I.sub), h('p', 'tt-tip-p', I.desc), I.hint ? h('p', 'tt-tip-p tt-tip-muted', I.hint) : null);
  }
  if (kind === 'stat') return buildStat(api, rest);
  if (kind === 'unlock') return buildUnlock(api, rest);
  return h('div', 'tt-tip-in', h('p', 'tt-tip-p', s));
}

// ---------- 顯示／位置 ----------
function host() { return document.getElementById('tt-root') || document.body; }

function place(tip, anchor, o) {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const stage = anchor.closest?.('.tt-stage') || document.querySelector('.tt-stage');
  let b = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh };
  b = { left: Math.max(4, b.left), top: Math.max(4, b.top), right: Math.min(vw - 4, b.right), bottom: Math.min(vh - 4, b.bottom) };
  const compact = vw < 640;
  tip.style.maxWidth = compact || o.full ? `${vw - 16}px` : '420px';
  if (o.full || compact) { b.left = 8; b.right = vw - 8; }
  if (o.full) tip.style.width = `${vw - 16}px`;
  const a = anchor.getBoundingClientRect();
  const topRef = o.row ? o.row.getBoundingClientRect().top : a.top;
  const botRef = o.row ? o.row.getBoundingClientRect().bottom : a.bottom;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x, y, side = o.placement || 'top';
  if (side === 'left' || side === 'right') {
    x = side === 'right' ? a.right + 8 : a.left - tw - 8;
    if (x < 4 || x + tw > vw - 4) { side = 'top'; }
    else y = a.top + a.height / 2 - th / 2;
  }
  if (side === 'top' || side === 'bottom') {
    x = a.left + a.width / 2 - tw / 2;
    y = side === 'top' ? topRef - th - 8 : botRef + 8;
    if (side === 'top' && y < 4) y = botRef + 8;
    else if (side === 'bottom' && y + th > vh - 4) y = topRef - th - 8;
  }
  x = Math.max(b.left, Math.min(x, Math.max(b.left, b.right - tw)));
  y = Math.max(4, Math.min(y, vh - th - 4));
  tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y) + 'px';
  tip.dataset.side = side;
}

export function showTip(anchor, spec, opts = {}) {
  if (!anchor) return null;
  const api = opts.api || curApi;
  hideTip(true);
  const o = { pin: !!opts.pin, placement: opts.placement || anchor.dataset.ttTipPlace || 'top', row: opts.row || null, full: !!opts.full };
  const tip = h('div', 'tt-tip' + (o.pin ? ' tt-tip-pinned' : ''));
  tip.id = 'tt-tip-' + (++seq);
  tip.setAttribute('role', 'tooltip');
  tip.append(buildTip(spec, api));
  tip.style.visibility = 'hidden';
  host().append(tip);
  tipEl = tip; anchorEl = anchor; pinned = o.pin; curSpec = spec; curOpts = o;
  anchor.setAttribute('aria-describedby', tip.id);
  place(tip, anchor, o);
  tip.style.visibility = '';
  return tip;
}

export function hideTip(keepTimer = false) {
  if (!keepTimer) clearTimeout(timer);
  if (anchorEl && anchorEl.removeAttribute) anchorEl.removeAttribute('aria-describedby');
  if (tipEl) tipEl.remove();
  tipEl = null; anchorEl = null; pinned = false; curSpec = null; curOpts = null;
}
export const isTipPinned = () => !!tipEl && pinned;
export const currentTip = () => tipEl;

// ---------- 委派 ----------
export function bindTips(root, api) {
  curApi = api || curApi;
  if (!root || root.__ttTipsBound) return;
  root.__ttTipsBound = true;
  const find = (t) => (t && t.closest ? t.closest('[data-tt-tip]') : null);
  const specOf = (a) => a.dataset.ttTip;

  root.addEventListener('pointermove', (e) => { lastPt = { x: e.clientX, y: e.clientY }; }, { passive: true });
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const a = find(e.target); if (!a) return;
    if (a === anchorEl && tipEl) return;
    if (pinned) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (a.isConnected && !document.querySelector('.tt-xghost')) showTip(a, specOf(a), { placement: a.dataset.ttTipPlace || 'top', row: a.hasAttribute('data-tt-tip-row') ? a.parentElement : null }); }, SHOW_MS);
  });
  root.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const a = find(e.target); if (!a) return;
    if (e.relatedTarget && a.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    if (!pinned && a === anchorEl) hideTip();
  });
  // 按下去就收（買、拖曳都不該被說明框擋住）；釘住的不收
  root.addEventListener('pointerdown', (e) => {
    clearTimeout(timer);
    if (e.pointerType === 'touch' && !pinned) { /* 長按由 input.js 叫 showTip */ }
    if (!pinned && tipEl && !(find(e.target) && find(e.target).hasAttribute('data-tt-pin'))) hideTip();
  }, true);
  // 手機：長按棋子頭像卡（unit:）看說明；放開就收，這次放開不當點擊（不會誤開棋子面板）。
  // 有 data-tt-tap／data-tt-drag 的元素（棋盤、商店）由 input.js 的長按處理，這裡不碰。
  let lpT = 0, lpFired = 0, lpUp = 0;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const a = find(e.target);
    if (!a || !String(a.dataset.ttTip).startsWith('unit:') || a.closest('[data-tt-tap],[data-tt-drag]')) return;
    clearTimeout(lpT);
    const x0 = e.clientX, y0 = e.clientY;
    const mv = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) { clearTimeout(lpT); off(); } };
    const up = () => { clearTimeout(lpT); lpUp = Date.now(); off(); if (lpFired) { setTimeout(() => hideTip(), 0); } };
    const off = () => { window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    lpT = setTimeout(() => { lpFired = Date.now(); showTip(a, specOf(a), { placement: 'top' }); }, 400);
  }, true);
  root.addEventListener('click', (e) => { if (lpFired && Date.now() - lpFired < 4000 && Date.now() - lpUp < 600) { lpFired = 0; e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener('contextmenu', (e) => { const a = find(e.target); if (a && String(a.dataset.ttTip).startsWith('unit:') && e.pointerType === 'touch') e.preventDefault(); });
  root.addEventListener('focusin', (e) => {
    const a = find(e.target); if (!a || pinned) return;
    let kb = true; try { kb = a.matches(':focus-visible'); } catch (_) { /* 舊瀏覽器 */ }
    if (kb) showTip(a, specOf(a), { placement: a.dataset.ttTipPlace || 'top' });
  });
  root.addEventListener('focusout', (e) => { const a = find(e.target); if (a && a === anchorEl && !pinned) hideTip(); });
  // 點技能圖示＝釘住／取消
  root.addEventListener('click', (e) => {
    const a = find(e.target); if (!a || !a.hasAttribute('data-tt-pin')) return;
    e.stopPropagation();
    if (pinned && anchorEl === a) hideTip(); else showTip(a, specOf(a), { pin: true, placement: a.dataset.ttTipPlace || 'top' });
  });
  // 點別處收掉釘住的說明框
  document.addEventListener('pointerdown', (e) => {
    if (!pinned || !tipEl) return;
    if (tipEl.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
    hideTip();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tipEl) { e.stopPropagation(); e.preventDefault(); hideTip(); }
  }, true);
  window.addEventListener('resize', () => hideTip());
  window.addEventListener('scroll', () => { if (tipEl && !pinned) hideTip(); }, true);

  // 畫面重畫後錨點不在了：找一個等價的接回去；找不到就收起
  const reanchor = () => {
    if (!tipEl || !anchorEl || anchorEl.isConnected) return;
    const spec = curSpec, o = curOpts;
    let next = null;
    if (typeof spec === 'string') {
      if (pinned) next = [...root.querySelectorAll('[data-tt-tip]')].find(n => n.dataset.ttTip === spec && n.hasAttribute('data-tt-pin'));
      else { const n = document.elementFromPoint(lastPt.x, lastPt.y); const a = find(n); if (a && a.dataset.ttTip === spec) next = a; }
    }
    if (next) showTip(next, spec, { pin: pinned, placement: o?.placement, row: o?.row && o.row.isConnected ? o.row : null, full: o?.full });
    else hideTip();
  };
  if (api && typeof api.on === 'function') api.on('change', () => requestAnimationFrame(reanchor));
}

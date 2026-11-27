/* Renderers from the supplied 滴答克的試煉 S19 distribution. */
(function(root){ 'use strict'; const mods = {}, bind = []; const asset = path => root.FocusAsset ? root.FocusAsset('native-art/'+path) : 'native-art/'+path;
mods.stats = (()=>{const keyCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- 羈絆計數 ----------
function hasProducer(t) {
  const effs = [].concat(t.always || [], ...(t.tiers || []));
  return effs.some((e) => e && e.type === 'special' && e.id === 'producer');
}

function countTraits(units, DATA, opts = {}) {
  const seen = {};
  const field = [];
  for (const u of units) {
    if (!u || seen[u.key]) {
      // 同 key 只算一次；K/DA 星數取最高那隻
      if (u && seen[u.key] && u.star > seen[u.key].star) seen[u.key].star = u.star;
      continue;
    }
    const def = DATA.units.byKey[u.key];
    if (!def) continue;
    seen[u.key] = { key: u.key, star: u.star || 1, def };
    field.push(seen[u.key]);
  }
  const raw = {}; // traitKey -> {count, members}
  for (const f of field) {
    for (const tk of f.def.traits || []) {
      const t = DATA.traits.byKey[tk];
      if (!t) continue;
      const r = raw[tk] || (raw[tk] = { count: 0, members: [] });
      r.count += t.countMode === 'stars' ? f.star : 1; // BaronNashor 佔 2 人口但只算 1
      r.members.push(f.key);
    }
  }
  // 製作人：索娜在場，人數最多的 origin 羈絆 +1（同數取 key 字母序）
  const producerOn = DATA.traits.list.some((t) => raw[t.key] && hasProducer(t));
  if (producerOn) {
    let pick = opts.producerPick && raw[opts.producerPick] ? opts.producerPick : null;
    if (!pick && !opts.manual) {   // manual：玩家自己拖「合作邀請」選，沒選就不加；沒給 manual（敵方、舊測試）維持自動挑
      const origins = Object.keys(raw).filter((k) => DATA.traits.byKey[k].kind === 'origin').sort(keyCmp);
      let best = -1;
      for (const k of origins) if (raw[k].count > best) { best = raw[k].count; pick = k; }
    }
    if (pick) raw[pick].count += 1;
  }
  const out = [];
  for (const k of Object.keys(raw).sort(keyCmp)) {
    const t = DATA.traits.byKey[k];
    const bp = t.breakpoints || [];
    const count = raw[k].count;
    let tier = 0;
    for (let i = 0; i < bp.length; i++) if (count >= bp[i]) tier = i + 1;
    const next = tier < bp.length ? bp[tier] : null;
    out.push({ key: k, zh: t.zh, kind: t.kind, count, tier, tierCount: tier > 0 ? bp[tier - 1] : 0,
      breakpoints: bp, next, need: next === null ? 0 : next - count, active: tier > 0,
      members: raw[k].members.slice().sort(keyCmp) });
  }
  const grp = (x) => (x.kind === 'unique' ? 2 : x.active ? 0 : 1);
  out.sort((a, b) => grp(a) - grp(b)
    || (grp(a) === 0 && b.tier - a.tier) || (b.count - a.count) || keyCmp(a.key, b.key));
  return out;
}

// ---------- 建隊 ----------
;return {countTraits, buildTeam:(...a)=>root.TrialsTrainingNativeRuntime.buildTeam(...a)};})();
mods.shop = (()=>{const costOf=(data,key)=>data.units.byKey[key].cost;function sellValue(unit, DATA) {
  const cost = costOf(DATA, unit.key);
  const sp = DATA.rules.sellPrice || { star2Mult: 3, star3Mult: 9, minus: 1 };
  if (cost === 7) return (DATA.rules.sevenCost && DATA.rules.sevenCost.sellPrice) || 7;
  const adj = cost > 1 ? sp.minus : 0; // 1 費不扣（2★＝3、3★＝9）
  if (unit.star === 1) return cost;
  if (unit.star === 2) return cost * sp.star2Mult - adj;
  return cost * sp.star3Mult - adj;
};return {sellValue, CHOICE:'ChoiceComponent', ANVIL:'ComponentAnvil'};})();
mods.game = (()=>{const R=data=>data.rules,ruleSum=()=>0;function levelUpCost(state, DATA) {
  const r = R(DATA);
  if (state.level >= r.maxLevel) return null;
  const cost = Math.max(0, r.xpCost + ruleSum(state, DATA, 'xpCostDelta'));
  const need = Math.max(0, r.xpToNext[String(state.level)] - state.xp);
  const buys = Math.max(1, Math.ceil(need / (r.xpPerBuy || 4)));
  // 買完實際會到幾級（經驗溢出可能連升兩級，例如 1 級買一次就到 3 級）
  let to = state.level, xp = state.xp + buys * (r.xpPerBuy || 4);
  while (to < r.maxLevel && xp >= r.xpToNext[String(to)]) { xp -= r.xpToNext[String(to)]; to++; }
  return { buys, gold: buys * cost, to };
};return {levelUpCost};})();
mods.audio = {sfx:()=>{}}; mods.hex = {neighbors:h=>root.SimNativeBattle.neighbors(h)};
mods.stars=(()=>{
// 星級圖示（照官方）：1 星銅、2 星銀、3 星金，數量就是星級（1～3 顆）。全站共用：棋盤、板凳、戰鬥、面板、商店卡、結算。
// 用 SVG 畫，不靠字型，手機上大小顏色都一致。大小由外層的 --ss 決定（預設 12px）。
const NS = 'http://www.w3.org/2000/svg';
const STAR_D = 'M12 1.6l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.600 5.600 21.200 7 14.100 1.700 9.100l7.200-.9z';
const STAR_NAME = { 1: '銅', 2: '銀', 3: '金' };

// <span class="tt-stars-ic tt-st2" role="img" aria-label="2 星">…</span>
function starsEl(n, { label = true } = {}) {
  const k = Math.max(1, Math.min(3, n || 1));
  const w = document.createElement('span');
  w.className = 'tt-stars-ic tt-st' + k;
  if (label) { w.setAttribute('role', 'img'); w.setAttribute('aria-label', k + ' 星'); } else w.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < k; i++) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', STAR_D);
    s.append(p); w.append(s);
  }
  return w;
}

return {get STAR_NAME(){return STAR_NAME;},get starsEl(){return starsEl;}};})();
mods.dnd=(()=>{
// 點選＋拖曳＋長按（pointer events）。SPEC_UI2 4.2–4.4。
// 標記：data-tt-tap="<desc>"（可點）、data-tt-drag="<desc>"（可拖；data-tt-mouse 表示只有滑鼠能拖，觸控只當點擊）、
//       data-tt-drop="<desc>"（可放）。desc 的意義由 input.js 解讀，這裡只當字串傳。
// handlers: {
//   onTap(desc, el, ev),            // ev：{button:0|2, pointerType, clientX, clientY, shiftKey, originalEvent}
//   onTapEmpty(ev),                 // 按下處沒有 tap／drag 標記、且不在 button／a／[data-tt-noclear]／面板／說明框內
//   onDrop(fromDesc, toDesc|null, fromEl),
//   onDragStart?(desc, el), onDragEnd?(),
//   onLongPress?(desc, el),         // 只有 touch，400ms；觸發後這次放開不發 onTap
// }
// 左鍵（0）與右鍵（2）都收；右鍵不會起拖曳，只會 onTap／onTapEmpty。
const MOVE_PX = 8;
const LONG_MS = 400;
const NOCLEAR_SEL = 'button, a, input, select, textarea, label, summary, [data-tt-noclear], .tt-overlay, .tt-panel, .tt-fbmodal, [role=dialog], [role=tooltip], [data-tt-mount=unitpanel]';

function enableDnd(root, handlers) {
  let st = null;   // { id, el, desc, x0, y0, dragging, ghost, over, tapEl, button, pointerType, longTimer, longFired, moved, empty }
  let lastLongAt = 0;

  const closest = (t, sel) => (t && t.closest ? t.closest(sel) : null);
  const mkEv = (e, s) => ({ button: s.button, pointerType: s.pointerType, clientX: e.clientX, clientY: e.clientY, shiftKey: !!e.shiftKey, originalEvent: e });

  root.addEventListener('pointerdown', (e) => {
    if (st) return;
    const button = e.button == null ? 0 : e.button;
    if (button !== 0 && button !== 2) return;
    const dragEl = closest(e.target, '[data-tt-drag]');
    const tapEl = closest(e.target, '[data-tt-tap]');
    if (!dragEl && !tapEl) {
      // 空白處：只有沒碰到可互動元素才算
      if (closest(e.target, NOCLEAR_SEL) || !handlers.onTapEmpty) return;
      st = { id: e.pointerId, empty: true, button, pointerType: e.pointerType, x0: e.clientX, y0: e.clientY, moved: false };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      return;
    }
    const canDrag = button === 0 && !!dragEl && !(dragEl.hasAttribute('data-tt-mouse') && e.pointerType !== 'mouse');
    st = { id: e.pointerId, el: dragEl, canDrag, button, pointerType: e.pointerType, desc: dragEl ? dragEl.dataset.ttDrag : null,
      tapEl: tapEl || dragEl, x0: e.clientX, y0: e.clientY, dragging: false, ghost: null, over: null, moved: false, longFired: false, longTimer: 0 };
    if (e.pointerType === 'touch' && handlers.onLongPress && (tapEl || dragEl)) {
      const target = tapEl || dragEl, s = st;
      st.longTimer = setTimeout(() => {
        if (st !== s || s.dragging || s.moved) return;
        s.longFired = true; lastLongAt = Date.now();
        handlers.onLongPress(target.dataset.ttTap || target.dataset.ttDrag, target);
      }, LONG_MS);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });

  function overTarget(x, y) {
    const n = document.elementFromPoint(x, y);
    return closest(n, '[data-tt-drop]');
  }

  function startDrag() {
    st.dragging = true;
    clearTimeout(st.longTimer);
    const r = st.el.getBoundingClientRect();
    const g = st.el.cloneNode(true);
    g.removeAttribute('data-tt-drag'); g.removeAttribute('data-tt-tap'); g.removeAttribute('data-tt-tip'); g.removeAttribute('id');
    g.classList.add('tt-xghost');
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    document.body.appendChild(g);
    st.ghost = g;
    st.el.classList.add('tt-drag-src');
    document.body.style.userSelect = 'none';
    try { st.el.setPointerCapture(st.id); } catch (_) { /* 已被移除 */ }
    handlers.onDragStart && handlers.onDragStart(st.desc, st.el);
  }

  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.dragging) {
      if (Math.hypot(dx, dy) < MOVE_PX) return;
      st.moved = true; clearTimeout(st.longTimer);
      if (st.empty || !st.canDrag) return;
      startDrag();
    }
    e.preventDefault();
    st.ghost.style.left = e.clientX + 'px';
    st.ghost.style.top = e.clientY + 'px';
    const t = overTarget(e.clientX, e.clientY);
    if (t !== st.over) {
      if (st.over) st.over.classList.remove('tt-over');
      st.over = t;
      if (t) t.classList.add('tt-over');
      if (handlers.onDragOver) handlers.onDragOver(t ? t.dataset.ttDrop : null, st.desc);
    }
  }

  function finish() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    if (st) {
      clearTimeout(st.longTimer);
      if (st.over) st.over.classList.remove('tt-over');
      if (st.ghost) st.ghost.remove();
      if (st.el) st.el.classList.remove('tt-drag-src');
      document.body.style.userSelect = '';
    }
  }

  function up(e) {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    const target = s.dragging ? overTarget(e.clientX, e.clientY) : null;
    finish(); st = null;
    if (s.empty) { if (!s.moved) handlers.onTapEmpty(mkEv(e, s)); return; }
    if (s.dragging) {
      handlers.onDragEnd && handlers.onDragEnd();
      handlers.onDrop(s.desc, target ? target.dataset.ttDrop : null, s.el);
    } else if (s.longFired) {
      // 長按放開：不算點擊
    } else if (s.tapEl && !s.moved) {
      handlers.onTap(s.tapEl.dataset.ttTap || s.tapEl.dataset.ttDrag, s.tapEl, mkEv(e, s));
    }
  }

  function cancel(e) {
    if (!st || e.pointerId !== st.id) return;
    const was = st.dragging;
    finish(); st = null;
    if (was) handlers.onDragEnd && handlers.onDragEnd();
  }

  // 鍵盤：聚焦在可點元素（或裝著可點棋子的格子）上按 Enter ＝點一下（Space 留給快捷鍵）
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches) return;
    const t = e.target.matches('[data-tt-tap]') ? e.target : (e.target.matches('[data-tt-drop]') ? e.target.querySelector('[data-tt-tap]') : null);
    if (t) { e.preventDefault(); handlers.onTap(t.dataset.ttTap, t, { button: 0, pointerType: 'keyboard', clientX: 0, clientY: 0, shiftKey: !!e.shiftKey, originalEvent: e }); }
  });

  // 拖曳中避免瀏覽器原生拖影像／選字；觸控長按不要出瀏覽器選單
  root.addEventListener('dragstart', (e) => e.preventDefault());
  root.addEventListener('contextmenu', (e) => {
    if ((st && (st.dragging || st.longFired || st.pointerType === 'touch')) || Date.now() - lastLongAt < 1200) e.preventDefault();
  });
}

return {get MOVE_PX(){return MOVE_PX;},get LONG_MS(){return LONG_MS;},get NOCLEAR_SEL(){return NOCLEAR_SEL;},get enableDnd(){return enableDnd;}};})();
mods.hotkeys=(()=>{
// hotkeys.js — 快捷鍵核心（SPEC_UI2 第 5 章）。只有儲存、查詢、衝突規則，沒有 DOM。
// 用 event.code 比對（注音輸入法開著時 event.key 會收不到 D／F）。


// id、名稱、階段（plan／battle／any）、是否官方預設、預設 code
const ACTIONS = [
  { id: 'reroll', zh: '重抽', phase: 'plan', official: true, def: 'KeyD' },
  { id: 'buyXp', zh: '購買經驗值', phase: 'plan', official: true, def: 'KeyF' },
  { id: 'levelUp', zh: '一鍵升級（買到升下一級）', phase: 'plan', official: false, def: null },
  { id: 'lockShop', zh: '鎖住／解鎖商店', phase: 'plan', official: false, def: null },
  { id: 'sell', zh: '賣出', phase: 'plan', official: true, def: 'KeyE' },
  { id: 'deploy', zh: '上場／回板凳', phase: 'plan', official: true, def: 'KeyW' },
  { id: 'fight', zh: '戰鬥', phase: 'plan', official: false, def: 'Space' },
  { id: 'speed', zh: '切換戰鬥速度', phase: 'battle', official: false, def: 'Space' },
  { id: 'skip', zh: '跳過戰鬥', phase: 'battle', official: false, def: null },
  { id: 'buy1', zh: '買商店第 1 格', phase: 'plan', official: false, def: 'Digit1' },
  { id: 'buy2', zh: '買商店第 2 格', phase: 'plan', official: false, def: 'Digit2' },
  { id: 'buy3', zh: '買商店第 3 格', phase: 'plan', official: false, def: 'Digit3' },
  { id: 'buy4', zh: '買商店第 4 格', phase: 'plan', official: false, def: 'Digit4' },
  { id: 'buy5', zh: '買商店第 5 格', phase: 'plan', official: false, def: 'Digit5' },
  { id: 'unlocks', zh: '開解鎖說明', phase: 'any', official: false, def: null },
  { id: 'planner', zh: '開關隊伍編輯器', phase: 'any', official: false, def: 'KeyT' },
];
const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

// 固定不能改、不能被佔用
const RESERVED = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter', ...Array.from({ length: 12 }, (_, i) => 'F' + (i + 1))]);
// 單獨的修飾鍵不能當快捷鍵（組合鍵本來就不接受：比對時只看 code，不會有 Ctrl／Alt／Meta 的組合）
const MODIFIERS = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight', 'OSLeft', 'OSRight', 'CapsLock', 'ContextMenu']);

const isReserved = (code) => RESERVED.has(code);
const isAcceptable = (code) => typeof code === 'string' && code.length > 0 && !RESERVED.has(code) && !MODIFIERS.has(code);

const NAMES = {
  Space: '空白鍵', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  NumpadAdd: '數字鍵 +', NumpadSubtract: '數字鍵 -', NumpadMultiply: '數字鍵 *', NumpadDivide: '數字鍵 /', NumpadDecimal: '數字鍵 .',
};
// code → 面板上顯示的鍵名
function codeLabel(code) {
  if (!code) return '未設定';
  if (NAMES[code]) return NAMES[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code); if (m) return '數字鍵 ' + m[1];
  return code;
}

const overlap = (a, b) => a === 'any' || b === 'any' || a === b;

function memStore() {
  let v = null;
  return { getItem: () => v, setItem: (_, x) => { v = x; }, removeItem: () => { v = null; } };
}
function defaultStore() {
  try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch (e) { /* 無痕模式 */ }
  return memStore();
}

// 一個獨立的快捷鍵表（測試用；正式用下面匯出的 hotkeys）
function createHotkeys(store=defaultStore(), ACTIONS=BASE_ACTIONS, STORE_KEY='s19focus.keys') {
  const BY_ID = Object.fromEntries(ACTIONS.map(a=>[a.id,a]));
  const cur = {};          // action -> code|null
  const listeners = [];
  const defaults = () => { for (const a of ACTIONS) cur[a.id] = a.def; };

  function conflictOf(action, code) {
    if (!code) return null;
    const me = BY_ID[action];
    for (const a of ACTIONS) {
      if (a.id === action || cur[a.id] !== code) continue;
      if (overlap(a.phase, me.phase)) return a.id;
    }
    return null;
  }
  function save() {
    const map = {};
    for (const a of ACTIONS) if (cur[a.id] !== a.def) map[a.id] = cur[a.id];
    try {
      if (Object.keys(map).length) store.setItem(STORE_KEY, JSON.stringify({ v: 1, map }));
      else store.removeItem(STORE_KEY);
    } catch (e) { /* 存不了就算了，這次有效 */ }
  }
  function load() {
    defaults();
    let raw = null;
    try { raw = store.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.map || typeof o.map !== 'object' || Array.isArray(o.map)) return;
      const next = {};
      for (const a of ACTIONS) next[a.id] = a.def;
      for (const k of Object.keys(o.map)) {
        const c = o.map[k];
        if (!BY_ID[k] || !(c === null || isAcceptable(c))) return;   // 格式不對：整份不用
        next[k] = c;
      }
      // 載進來的設定本身有衝突也不用
      Object.assign(cur, next);
      for (const a of ACTIONS) if (conflictOf(a.id, cur[a.id])) { defaults(); return; }
    } catch (e) { defaults(); }
  }
  load();
  const emit = () => { for (const f of listeners.slice()) { try { f(); } catch (e) { /* 聽的人壞了不影響 */ } } };

  return {
    ACTIONS,
    get: (action) => (BY_ID[action] ? cur[action] : null),
    label: (action) => codeLabel(BY_ID[action] ? cur[action] : null),
    // code＋目前階段（'plan'｜'battle'）→ action；沒有就 null
    actionFor(code, phase) {
      if (!code) return null;
      for (const a of ACTIONS) if (cur[a.id] === code && (a.phase === 'any' || a.phase === phase)) return a.id;
      return null;
    },
    // 設定。回傳 {ok:true}｜{ok:false, conflict:action}｜{ok:false, reason:'reserved'|'invalid'}
    // opts.force：有衝突就把對方改成未設定（面板按「換過來」時用）
    set(action, code, opts = {}) {
      if (!BY_ID[action]) return { ok: false, reason: 'invalid' };
      if (code !== null && code !== undefined && !isAcceptable(code)) return { ok: false, reason: isReserved(code) ? 'reserved' : 'invalid' };
      code = code === undefined ? null : code;
      const c = conflictOf(action, code);
      if (c && !opts.force) return { ok: false, conflict: c };
      if (c) {
        // 強制換：同階段重疊的全部清掉
        for (const a of ACTIONS) if (a.id !== action && cur[a.id] === code && overlap(a.phase, BY_ID[action].phase)) cur[a.id] = null;
      }
      cur[action] = code;
      save(); emit();
      return { ok: true, ...(c ? { cleared: c } : {}) };
    },
    reset() { defaults(); save(); emit(); },
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    codeLabel,
  };
}

const BASE_ACTIONS=ACTIONS;


return {get ACTIONS(){return ACTIONS;},get isReserved(){return isReserved;},get isAcceptable(){return isAcceptable;},get codeLabel(){return codeLabel;},get createHotkeys(){return createHotkeys;}};})();
mods.traitbar=(()=>{let countTraits,showTraitPanel,PANEL_CSS;bind.push(()=>{countTraits=mods.stats.countTraits;showTraitPanel=mods.panels.showTraitPanel;PANEL_CSS=mods.panels.PANEL_CSS;});
// 羈絆列（SPEC 5.5）＋ U2 共用小工具（頭像、羈絆標籤、樣式注入）。純前端，不碰別人的檔。
// 樣式：在 trials.css（U2 區）。


const CSS = ''; // 整合：樣式已搬進 trials.css

function ensureStyle(doc = document) {
  // 整合：樣式已搬進 trials.css，這裡不再注入 <style>
  return doc && CSS + PANEL_CSS === null;
}

// ---------- 共用小工具 ----------
function el(tag, attrs = {}, ...kids) {
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
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const kindOf = (DATA, key) => DATA.traits.byKey[key]?.kind || 'origin';
const traitZh = (DATA, key) => DATA.traits.byKey[key]?.zh || key;
const unitZh = (DATA, key) => DATA.units.byKey[key]?.zh || key;
const isStars = (DATA, key) => DATA.traits.byKey[key]?.countMode === 'stars' || key === 'KDA';

function avatar(DATA, key, size = 40) {
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

function boardUnits(state) { return (state.board || []).filter(Boolean); }
function playerTraits(api) {
  const { state, DATA } = api;
  return countTraits(boardUnits(state), DATA, api.traitOpts ? api.traitOpts() : { augments: state.augments || [] });
}

// 買／上場這隻會讓哪些羈絆升階（回傳 key 集合）。已在場上同 key 不算（同 key 只算一次）。
function upgradeTraits(api, unitKey) {
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
function setTraitSprite(sp) { fallbackSprite = sp || null; }
function traitIcon(DATA, key, size = 18) {
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
function traitTags(unitKey, api, { clickable = false, max = 3 } = {}) {
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
function tierClass(t) {
  const n = (t.breakpoints || []).length, tier = t.tier || 0;
  if (!tier) return 'off';
  if (tier >= n) return n >= 4 ? 'prism' : 'gold';
  if (n >= 4 && tier === n - 1) return 'gold';
  if (tier === 1) return 'bronze';
  return 'silver';
}

// 羈絆列排序（照官方）：已啟動的獨有羈絆（多半是 5 費自帶）最上面；接著其他已啟動的，先看階級顏色（彩＞金＞銀＞銅）再看人數；未啟動的放最後
const TIER_RANK = { prism: 4, gold: 3, silver: 2, bronze: 1, off: 0 };
function sortTraits(list, DATA) {
  const kind = t => t.kind || (DATA.traits.byKey[t.key] || {}).kind;
  const grp = t => (!t.active ? 2 : kind(t) === 'unique' ? 0 : 1);
  return (list || []).slice().sort((a, b) => grp(a) - grp(b)
    || (TIER_RANK[tierClass(b)] || 0) - (TIER_RANK[tierClass(a)] || 0) || (b.count - a.count) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function traitHex(DATA, t, size) {
  return el('span', { class: 'tt-hex', 'data-tier': tierClass(t), 'aria-hidden': 'true' }, traitIcon(DATA, t.key, size));
}

function statusText(t, DATA) {
  const unit = isStars(DATA, t.key) ? '星' : '隻';
  const bps = t.breakpoints || [];
  if (t.active && (t.next == null || t.tier >= bps.length)) return '已到最高階';
  if (t.active) return `啟動中，再 ${t.need ?? (t.next - t.count)} ${unit}升階`;
  return `差 ${t.need ?? (t.next - t.count)} ${unit}啟動`;
}

function traitCard(t, api, { side = 'player', list } = {}) {
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
    if (side !== 'player' || e.detail === 0 || (api.traitBreakdown && matchMedia('(pointer:coarse)').matches) || e.target.closest?.('.tt-hex')) { showTraitPanel(t.key, api, { side, traits: list }); return; }
    if (Date.now() - lpAt < 800) return;   // 剛長按亮過，放開時不要再切換
    pinTrait(t.key);
  });
  return btn;
}

// ---------- 對外：renderTraits ----------
function renderTraits(root, traitsPlayer, traitsEnemy, api) {
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

function renderEnemyTraits(root, traitsEnemy, api) {
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
function flashTrait(key, side = 'player') {
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
function pinTrait(key) {
  pinnedTrait = pinnedTrait === key ? null : (key || null);
  activeTrait = pinnedTrait;
  paintTrait(activeTrait);
  document.querySelectorAll('.tt-trow[data-trait]').forEach(n => n.classList.toggle('tt-pin', !!pinnedTrait && n.dataset.trait === pinnedTrait));
  return pinnedTrait;
}
function clearPinnedTrait() { if (pinnedTrait) pinTrait(pinnedTrait); }
const pinnedTraitKey = () => pinnedTrait;
function highlightTrait(key, on) {
  activeTrait = on ? key : pinnedTrait;
  paintTrait(activeTrait);
}
function highlightUnit(unitKey, on) {
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

return {get ensureStyle(){return ensureStyle;},get el(){return el;},get fmt(){return fmt;},get kindOf(){return kindOf;},get traitZh(){return traitZh;},get unitZh(){return unitZh;},get isStars(){return isStars;},get avatar(){return avatar;},get boardUnits(){return boardUnits;},get playerTraits(){return playerTraits;},get upgradeTraits(){return upgradeTraits;},get setTraitSprite(){return setTraitSprite;},get traitIcon(){return traitIcon;},get traitTags(){return traitTags;},get tierClass(){return tierClass;},get sortTraits(){return sortTraits;},get traitHex(){return traitHex;},get traitCard(){return traitCard;},get renderTraits(){return renderTraits;},get renderEnemyTraits(){return renderEnemyTraits;},get flashTrait(){return flashTrait;},get pinTrait(){return pinTrait;},get clearPinnedTrait(){return clearPinnedTrait;},get pinnedTraitKey(){return pinnedTraitKey;},get highlightTrait(){return highlightTrait;},get highlightUnit(){return highlightUnit;}};})();
mods.board=(()=>{let traitIcon,starsEl,neighbors,CHOICE,ANVIL;bind.push(()=>{traitIcon=mods.traitbar.traitIcon;starsEl=mods.stars.starsEl;neighbors=mods.hex.neighbors;CHOICE=mods.shop.CHOICE;ANVIL=mods.shop.ANVIL;});
// 棋盤、板凳、裝備列（佈陣階段）。SPEC 5.2–5.4。
// 戰鬥階段：renderBoard(el, api, {mode:'battle'}) 只畫 8 排空格的 .tt-field（el.__field），棋子由 battle.js 疊上去。
// 戰鬥：座標約定（和 battle.js 一致）：格子中心 x = (col + 0.5*(row&1) + 0.5)*w，y = (row*0.866 + 0.5)*w，w = 棋盤寬/7.5。
// 佈陣：8 排正六角形（和戰鬥畫面同比例），位置全用 CSS 變數 --x（欄＋奇數排半格）、--r（0–7 排）、--g（我方半場 1）；格線整張置中、隨可用空間縮放。





const COLS = 7;
const ROW_H = 0.866;

function el(tag, cls, attrs, ...kids) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs || {})) { if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

const zhOf = (DATA, key) => DATA.units.byKey[key]?.zh || key;
const costOf = (DATA, key) => DATA.units.byKey[key]?.cost ?? 1;
const itemZh = (DATA, key) => DATA.items.byKey[key]?.zh || DATA.items.compByKey?.[key]?.zh || key;
const starText = (n) => '★'.repeat(Math.max(1, n || 1));

// 頭像：精靈圖（SPEC 0.2）。背景位置用百分比，任何尺寸都對得上。
function styleAvatar(node, DATA, key) {
  const sp = DATA.units.sprite || {};
  const idx = sp.map?.[key];
  if (idx == null) { node.textContent = zhOf(DATA, key).slice(0, 1); node.style.display = node.style.display || 'grid'; return node; }
  const cols = sp.cols || 10, rows = sp.rows || 10;
  node.style.backgroundImage = `url("${sp.src}")`;
  node.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${(idx % cols) * 100 / (cols - 1)}% ${Math.floor(idx / cols) * 100 / (rows - 1)}%`;
  return node;
}
function avatarEl(DATA, key, size) {
  const a = el('span', 'tt-xav', { role: 'img', 'aria-label': zhOf(DATA, key) });
  if (size) a.style.setProperty('--tt-av', size + 'px');
  return styleAvatar(a, DATA, key);
}

// 棋子 token（棋盤與板凳共用）。頭上：星星圖示（銅／銀／金）＋血條（官方樣式）。
// marks＝身上的指定道具標記：[{ id: 'fav'|'spot'|'deal'|'prod'|'clone', on: 有沒有效, extra: 合作邀請選到的羈絆 key }]，從右上角往下排。
function unitToken(DATA, u, desc, { enemy = false, marks = null } = {}) {
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
    for (const k of u.items) { const i = el('i'); i.style.backgroundImage = `url("${asset("icons/items/" + k + ".webp")}")`; box.append(i); }
    t.append(box);
  }
  return t;
}

const ANVIL_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M4 9h17c4.500 0 7 2 7 5-2.500 0-5 .800-6.500 2.500L21 20h-3v3h4v3H8v-3h4v-3H9.500L8 14.500C5.500 14 4 12 4 9z"/></svg>';
function anvilToken(u, desc, selected = false) {
  const t = el('div', 'tt-unit tt-anvil' + (selected ? ' tt-sel' : ''), { 'data-tt-drag': desc, 'data-tt-tap': desc, 'data-tt-uid': u.uid, 'data-tt-tip': 'text:散件鐵砧：點它或賣掉（拖到商店、滑鼠指著按 E），挑一件你要的散件放進裝備欄', title: '散件鐵砧' });
  const ic = el('span', 'tt-anv-ic'); ic.innerHTML = ANVIL_SVG;
  t.append(ic, el('span', 'tt-anv-t', {}, '散件'));
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
// 沙灘樂器相鄰 6 格（我方半場座標 [r,c]，超出我方半場的不算）；佈陣畫範圍、拖曳顯示範圍都用這個
const coverOf = (r, c) => neighbors({ row: 4 + r, col: c }).filter(h => h.row >= 4).map(h => [h.row - 4, h.col]);
const INST_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' aria-hidden='true'><g transform='rotate(38 24 25)'><rect x='21.5' y='2' width='5' height='20' rx='1.5' fill='#e9c98b' stroke='#8a5a2b' stroke-width='1.6'/><rect x='20' y='0.5' width='8' height='6' rx='2' fill='#c9904a' stroke='#8a5a2b' stroke-width='1.4'/><path d='M24 14c-6 0-9 3-9 7 0 2.5 1.5 3.6 1.5 5.3 0 1.7-4.5 3.7-4.5 8.7 0 4.5 5.4 7 12 7s12-2.5 12-7c0-5-4.5-7-4.5-8.7 0-1.7 1.5-2.8 1.5-5.3 0-4-3-7-9-7z' fill='#2ec4b6' stroke='#0f6d66' stroke-width='2' stroke-linejoin='round'/><circle cx='24' cy='32' r='4.2' fill='#10302d' stroke='#f4e3b2' stroke-width='1.6'/><rect x='19.5' y='40' width='9' height='2.4' rx='1' fill='#f4e3b2'/><path d='M23 18v20M25 18v20' stroke='#f4e3b2' stroke-width='.7' opacity='.8'/></g></svg>";
const PICK_ORDER = ['fav', 'spot', 'deal', 'prod', 'clone'];
const SP_ORDER = [...PICK_ORDER, 'inst'];
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
const SPECIAL_INFO = {
  rm: { zh: '黃金卸除器', sub: '每局都有，可以一直用', desc: '拖到有裝備的棋子身上，把他的裝備全部拆回裝備欄。可以重複用，不用省。裝備欄放不下就不能用。', hint: '要用就把它拖到有裝備的棋子身上。' },
  fav: { zh: '心鋼最愛', sub: '心鋼之聲 3 階給 1 個、5 階給 2 個', desc: '拖到一位心鋼之聲成員身上，就是選他當最愛，他的技能會變強（技能增幅 +25%）。可以一直重複用：想改選就再拖到另一位身上，或直接把他身上的愛心拖過去；拖到已經是最愛的那位就是取消。沒放就沒有效果。', hint: '要選他強化，就把它拖到心鋼之聲成員身上。' },
  spot: { zh: '聚光燈', sub: '經紀人 2 階給 1 盞', desc: '拖到你要捧的那隻身上。開場和每 5 秒他都拿一次加成，可以疊。想換人就再拖一次。', hint: '不一定要拖給經紀人，場上誰都可以。' },
  deal: { zh: '唱片合約', sub: '蒙多在場就有，每 4 回合多 1 份', desc: '拖到你要簽的那隻身上：他傷害增幅 +5%，他每殺一個，蒙多永久 +25 生命。簽錯了再拖一次就能改。', hint: '蒙多自己也可以簽，同一隻只能簽 1 份。' },
  prod: { zh: '合作邀請', sub: '索娜在場就有', desc: '拖到一隻棋子身上，索娜就跟他的樂團合作，那個羈絆多算 1 人。想換樂團就拖到別隻身上。', hint: '要拖給有起源羈絆的棋子，歐拉夫有兩個樂團，連拖兩次可以換。' },
  clone: { zh: '分身站位', sub: '銳空在場就有', desc: '拖到一隻棋子身上，銳空的分身開場就站在他旁邊。沒拖就站在銳空旁邊。', hint: '' },
  inst: { zh: '沙灘樂器', sub: '海灘流行 3 階給 1 個、5 階 2 個、7 階 3 個', desc: '拖到我方棋盤的空格就擺好了（樂器佔一格、不算人口，棋子不能站上去）。開戰那一刻，站在樂器旁邊 6 格內的友軍整場吃到海灘流行的加成：每 3 秒回 2% 生命；海灘流行成員還有攻速和回魔力。擺好的可以再拖去別格，或拖回這裡收回；放滿再拖會頂掉最早擺的。沒擺就沒效果。', hint: '一隻貼著好幾個樂器不會疊，所以盡量把樂器分開擺、讓更多人碰得到。' },
  favmark: { zh: '心鋼最愛', sub: '', desc: '這位是你選的最愛，技能變強（技能增幅 +25%）。把這個標記拖到另一位心鋼之聲成員身上就能改選。要上場才有效。', hint: '' },
  favoff: { zh: '心鋼最愛（暫時失效）', sub: '', desc: '心鋼之聲掉階了，或他在板凳上，先沒有效果。湊回來、上場就自動恢復。', hint: '' },
  spotmark: { zh: '聚光燈', sub: '', desc: '這隻是你捧的人，開場和每 5 秒都拿一次傷害增幅。把這個標記拖到另一隻身上就能換人。要上場才有效。', hint: '' },
  spotoff: { zh: '聚光燈（暫時失效）', sub: '', desc: '經紀人湊不到 2 階，或他在板凳上，先沒有效果。湊回來、上場就自動恢復。', hint: '' },
  dealmark: { zh: '唱片合約', sub: '', desc: '他簽了合約：傷害增幅 +5%，他每殺一個，蒙多永久 +25 生命。把這個標記拖到別隻身上就能改簽。要上場才有效。', hint: '' },
  dealoff: { zh: '唱片合約（暫時失效）', sub: '', desc: '蒙多不在場、他在板凳上，或合約份數不夠，先沒有效果。回來就自動恢復。', hint: '' },
  prodmark: { zh: '合作邀請', sub: '', desc: '索娜跟他的樂團合作，標記上的那個羈絆多算 1 人。把這個標記拖到別隻身上就能換樂團。要上場才有效。', hint: '' },
  prodoff: { zh: '合作邀請（暫時失效）', sub: '', desc: '索娜不在場，或他在板凳上，先沒有效果。回來就自動恢復。', hint: '' },
  instmark: { zh: '沙灘樂器', sub: '', desc: '開戰那一刻站在這個樂器旁邊 6 格內的友軍，整場都吃到海灘流行的加成（戰鬥中走開也不會掉）。可以拖去別格，或拖回道具列收回。棋子不能站在這一格。', hint: '' },
  instoff: { zh: '沙灘樂器（暫時失效）', sub: '', desc: '海灘流行掉階了，多出來的樂器先變灰、留在原位沒有效果。湊回原階就自動恢復，不用重擺。這一格棋子還是不能站。', hint: '' },
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
  inst: '沙灘樂器，拖到我方棋盤的空格擺好，開戰時相鄰 6 格內的友軍吃到海灘流行加成，可以重擺',
};

function renderSpecials(el_, api) {
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
  for (const id of SP_ORDER) { const f = p[id]; if (f && f.cap > 0) nodes.push(mk(id, f.free)); }
  el_.setAttribute('data-tt-drop', 'spbar');   // 已經擺好的樂器拖回這一排＝收回
  el_.replaceChildren(...nodes);
  el_.hidden = !nodes.length;
  // 桌機版：道具排成幾列由寬度決定，把高度記在舞台上，讓下面的增幅列、羈絆欄跟著往下讓
  const stage = el_.closest && el_.closest('.tt-stage');
  const sync = () => { const h = el_.offsetHeight; if (stage && h > 0) stage.style.setProperty('--tt-xh', h + 'px'); };
  sync();
  if (!el_.__ro && typeof ResizeObserver !== 'undefined') { el_.__ro = new ResizeObserver(sync); el_.__ro.observe(el_); }
}

function selUid(api) { const s = api.ui && api.ui.sel; return s && s.kind === 'unit' ? s.uid : null; }

function renderBoard(el_, api, view = {}) {
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
  const ph = el('div', 'tt-half tt-p', { role: 'group', 'aria-label': '我方棋盤' });
  const sel = selUid(api);
  let over = false; try { over = !!(api.popUsed && api.popMax && api.popUsed() > api.popMax()); } catch (_) { over = false; }   // 場上人口超出上限：標了 ov 的棋子畫「超出人口」
  const place = new Map();
  for (const u of state.board || []) if (u && u.pos) place.set(u.pos[0] + ',' + u.pos[1], u);
  // 沙灘樂器：有效的樂器相鄰 6 格淡淡標出範圍；變灰的（羈絆掉階）不標
  let ip = null; try { ip = api.picks ? api.picks().inst : null; } catch (_) { ip = null; }
  const instAt = new Map(), cover = new Set();
  if (ip) {
    ip.held.forEach((p, i) => instAt.set(p[0] + ',' + p[1], i < ip.cap));
    for (const p of ip.active) for (const q of coverOf(p[0], p[1])) cover.add(q[0] + ',' + q[1]);
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) {
    const u = place.get(r + ',' + c);
    const k = r + ',' + c;
    const label = `我方 ${'ABCD'[r]}${c + 1}` + (u ? `：${zhOf(DATA, u.key)} ${u.star} 星` : instAt.has(k) ? '：沙灘樂器' : '：空格');
    const cell = cellEl(r, c, { role: 'button', tabindex: '0', 'aria-label': label, 'data-tt-drop': `board:${r},${c}` }, true);
    if (cover.has(k)) cell.classList.add('tt-incover');
    if (instAt.has(k)) {
      const on = instAt.get(k);
      const ins = el('div', 'tt-inst' + (on ? '' : ' tt-off'), { role: 'button', tabindex: '-1', 'data-tt-drag': `inst:${r},${c}`, 'data-tt-tap': `inst:${r},${c}`, 'data-tt-tip': 'sp:inst' + (on ? 'mark' : 'off'),
        'aria-label': on ? '沙灘樂器，可以拖去別格或拖回道具列' : '沙灘樂器（暫時失效）' });
      ins.innerHTML = INST_SVG;
      cell.append(ins);
    }
    if (u) {
      const tk = unitToken(DATA, u, `board:${r},${c}`, { marks: marksOf(api, u) });
      tk.setAttribute('data-tt-tap', `board:${r},${c}`);
      if (u.uid === sel) tk.classList.add('tt-sel');
      if (u.ov && over) { tk.classList.add('tt-ovpop'); tk.title += '（超出人口，板凳有空格會自動跳回去，開戰前還超出就先移回板凳、放不下就賣掉）'; }
      cell.append(tk);
    }
    ph.append(cell);
  }
  el_.replaceChildren(ph);
}

function renderBench(el_, api) {
  const { state, DATA } = api;
  const sel = selUid(api);
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const u = (state.bench || [])[i];
    if (u && u.key === ANVIL) {   // 散件鐵砧（站主 2026-11-16）：賣掉＝挑一件散件
      const s = el('div', 'tt-bslot', { role: 'button', tabindex: '0', 'data-tt-drop': `bench:${i}`, 'aria-label': `板凳 ${i + 1}：散件鐵砧，點一下或賣掉就能挑散件` });
      s.append(anvilToken(u, `bench:${i}`, u.uid === sel));
      slots.push(s); continue;
    }
    const s = el('div', 'tt-bslot', { role: 'button', tabindex: '0', 'data-tt-drop': `bench:${i}`,
      'aria-label': `板凳 ${i + 1}` + (u ? `：${zhOf(DATA, u.key)} ${u.star} 星` : '：空') });
    if (u) { const tk = unitToken(DATA, u, `bench:${i}`, { marks: marksOf(api, u) }); tk.setAttribute('data-tt-tap', `bench:${i}`); if (u.uid === sel) tk.classList.add('tt-sel'); s.append(tk); }
    slots.push(s);
  }
  el_.replaceChildren(...slots);
}

// 裝備欄：官方是最左一直排黑底方格（共 10 格），裝備依序放進去。
function renderItems(el_, api) {
  const { state, DATA } = api;
  const sel = api.ui.sel;
  const list = state.itemBench || [];
  const n = DATA.rules.itemBenchSize || 10;
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const k = list[i];
    if (!k) { nodes.push(el('div', 'tt-xslot', { 'aria-hidden': 'true' })); continue; }
    if (k === CHOICE) {   // 自選散件：點開挑一件（站主 2026-11-16）
      const c = el('div', 'tt-xslot tt-xitem tt-xchoice', { role: 'button', tabindex: '0', 'data-tt-tap': `item:${i}`, 'data-tt-drop': `item:${i}`, 'data-tt-tip': 'text:自選散件：點一下，挑一件你要的散件', 'aria-label': '自選散件，點一下挑散件' },
        el('span', 'tt-xch-q', { 'aria-hidden': 'true' }, '?'), el('span', 'tt-xch-t', {}, '自選'));
      if (sel && sel.kind === 'item' && sel.idx === i) c.classList.add('tt-sel');
      nodes.push(c); continue;
    }
    const b = el('div', 'tt-xslot tt-xitem', { role: 'button', tabindex: '0', 'data-tt-tap': `item:${i}`, 'data-tt-drag': `item:${i}`, 'data-tt-drop': `item:${i}`, 'data-tt-tip': 'item:' + k, 'aria-label': '裝備：' + itemZh(DATA, k) });
    b.style.backgroundImage = `url("${asset("icons/items/" + k + ".webp")}")`;
    if (DATA.items.byKey[k] && DATA.items.byKey[k].radiant) b.classList.add('tt-radiant');   // 聖光成裝
    if (sel && sel.kind === 'item' && sel.idx === i) b.classList.add('tt-sel');
    nodes.push(b);
  }
  el_.replaceChildren(...nodes);
}

return {get COLS(){return COLS;},get el(){return el;},get zhOf(){return zhOf;},get costOf(){return costOf;},get itemZh(){return itemZh;},get starText(){return starText;},get styleAvatar(){return styleAvatar;},get avatarEl(){return avatarEl;},get unitToken(){return unitToken;},get anvilToken(){return anvilToken;},get coverOf(){return coverOf;},get SPECIAL_INFO(){return SPECIAL_INFO;},get renderSpecials(){return renderSpecials;},get selUid(){return selUid;},get renderBoard(){return renderBoard;},get renderBench(){return renderBench;},get renderItems(){return renderItems;},get starsEl(){return starsEl;}};})();
mods.tooltip=(()=>{let PN,TB,SPECIAL_INFO;bind.push(()=>{PN=mods.panels;TB=mods.traitbar;SPECIAL_INFO=mods.board.SPECIAL_INFO;});
// 說明框（SPEC_UI2 4.5）：技能／羈絆／裝備／增幅／純文字／數值／解鎖條件。
//   bindTips(root, api)   委派：找 [data-tt-tip]，滑鼠 hover 150ms 顯示、離開收起；鍵盤 focus 也顯示；[data-tt-pin] 的元素點一下＝釘住／取消
//   showTip(anchorEl, spec, {pin=false, placement='top', row?, full?})   spec：data-tt-tip 字串，或 {icon, title, sub, body:[節點|字串], foot:[…]}
//   hideTip()
// data-tt-tip 的值：unit:<unitKey>（棋子頭像卡：名字、費用、羈絆、技能）｜ability:<unitKey>:<star>｜trait:<key>｜item:<key>｜aug:<key>｜text:<純文字>｜stat:<statKey>｜unlock:<unitKey>
// 本檔頂層不使用 panels／traitbar 的匯出（互相 import，只在函式執行時才用）。



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
function richText(text, star = 0) {
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
function abilityIcon(DATA, key, size = 48) {
  const box = h('span', 'tt-abicon', h('i', 'tt-abtag', '技'));
  box.style.setProperty('--tt-ab', size + 'px');
  const reg = DATA.units?.abilityIcons;
  const has = reg && (Array.isArray(reg) ? reg.includes(key) : !!reg[key]);
  if (has) {
    const img = document.createElement('img');
    img.src = asset("icons/s19/abilities/" + key + ".webp"); img.alt = ''; img.loading = 'lazy';
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
  const ic = h('span', 'tt-tip-itemicon'); ic.style.backgroundImage = `url("${asset("icons/items/" + key + ".webp")}")`;
  const wrap = h('div', 'tt-tip-in', head(ic, I?.zh || key, I?.recipe ? '成品裝備' : '散件'));
  if (I?.desc) wrap.append(...paras(I.desc));
  if (I?.recipe) wrap.append(h('p', 'tt-tip-p tt-tip-muted', '合成：' + I.recipe.map(k => itemOf(DATA, k)?.zh || k).join(' ＋ ')));
  return wrap;
}

function augIconNode(A) {
  const icon = h('span', 'tt-tip-augicon');
  icon.style.backgroundImage = `url("${asset("icons/aug-sprite.webp")}")`; icon.style.backgroundSize = '2000% 1300%';
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

function buildTip(spec, api = curApi) {
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

function showTip(anchor, spec, opts = {}) {
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

function hideTip(keepTimer = false) {
  if (!keepTimer) clearTimeout(timer);
  if (anchorEl && anchorEl.removeAttribute) anchorEl.removeAttribute('aria-describedby');
  if (tipEl) tipEl.remove();
  tipEl = null; anchorEl = null; pinned = false; curSpec = null; curOpts = null;
}
const isTipPinned = () => !!tipEl && pinned;
const currentTip = () => tipEl;

// ---------- 委派 ----------
function bindTips(root, api) {
  curApi = api || curApi;
  if (!root || root.__ttTipsBound) return;
  root.__ttTipsBound = true;
  const find = (t) => (t && t.closest ? t.closest('[data-tt-tip]') : null);
  const specOf = (a) => a.dataset.ttTip;

  root.addEventListener('pointermove', (e) => { lastPt = { x: e.clientX, y: e.clientY }; }, { passive: true });
  // 點了裝備／道具選起來之後，右邊面板已經在講同一件事：游標還停在那格就不要再跳說明框
  // （以前是按下去收、重畫完又跳回來，一收一跳，站主說畫面會晃一下很不舒服 2026-11-17）。移出那格就恢復。
  // 重畫時舊格子被換掉，不能靠 pointerout 判斷「移出」：記下按下那格的範圍，游標離開範圍才恢復。
  let quiet = null, quietBox = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    const a = find(e.target);
    quiet = a && !a.hasAttribute('data-tt-pin') && a.closest('[data-tt-tap]') ? specOf(a) : null;
    quietBox = quiet ? a.getBoundingClientRect() : null;
  }, true);
  root.addEventListener('pointermove', (e) => {
    if (!quiet || !quietBox) return;
    const b = quietBox;
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) { quiet = null; quietBox = null; }
  }, { passive: true });
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const a = find(e.target); if (!a) return;
    if (quiet && specOf(a) === quiet) return;
    quiet = null; quietBox = null;
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
      else if (spec !== quiet) { const n = document.elementFromPoint(lastPt.x, lastPt.y); const a = find(n); if (a && a.dataset.ttTip === spec) next = a; }
    }
    if (next) showTip(next, spec, { pin: pinned, placement: o?.placement, row: o?.row && o.row.isConnected ? o.row : null, full: o?.full });
    else hideTip();
  };
  if (api && typeof api.on === 'function') api.on('change', () => requestAnimationFrame(reanchor));
}

return {get richText(){return richText;},get abilityIcon(){return abilityIcon;},get augIconNode(){return augIconNode;},get buildTip(){return buildTip;},get showTip(){return showTip;},get hideTip(){return hideTip;},get isTipPinned(){return isTipPinned;},get currentTip(){return currentTip;},get bindTips(){return bindTips;}};})();
mods.panels=(()=>{let starsEl,el,fmt,avatar,kindOf,traitZh,unitZh,isStars,ensureStyle,traitTags,boardUnits,playerTraits,countTraits,buildTeam,sellValue,CHOICE,ANVIL,TB,AU,sfx,SPECIAL_INFO,showTip,hideTip,richText,abilityIcon,augIconNode;bind.push(()=>{starsEl=mods.stars.starsEl;el=mods.traitbar.el;fmt=mods.traitbar.fmt;avatar=mods.traitbar.avatar;kindOf=mods.traitbar.kindOf;traitZh=mods.traitbar.traitZh;unitZh=mods.traitbar.unitZh;isStars=mods.traitbar.isStars;ensureStyle=mods.traitbar.ensureStyle;traitTags=mods.traitbar.traitTags;boardUnits=mods.traitbar.boardUnits;playerTraits=mods.traitbar.playerTraits;countTraits=mods.stats.countTraits;buildTeam=mods.stats.buildTeam;sellValue=mods.shop.sellValue;CHOICE=mods.shop.CHOICE;ANVIL=mods.shop.ANVIL;TB=mods.traitbar;AU=mods.audio;sfx=mods.audio.sfx;SPECIAL_INFO=mods.board.SPECIAL_INFO;showTip=mods.tooltip.showTip;hideTip=mods.tooltip.hideTip;richText=mods.tooltip.richText;abilityIcon=mods.tooltip.abilityIcon;augIconNode=mods.tooltip.augIconNode;});
// 面板（SPEC 5.5／5.6／5.8）：羈絆、棋子、圖鑑、增幅三選一、獎勵、結算、結束、說明、頭目登場。
// 注意：本檔頂層不可使用 traitbar.js 的匯出（兩檔互相 import，只在函式執行時用）。









// 羈絆圖示唯一入口是 traitbar.traitIcon（包 B）。還沒有時回 null，畫面只少圖示。
const tIcon = (DATA, key, size = 18) => { try { return TB.traitIcon ? TB.traitIcon(DATA, key, size) : null; } catch (_) { return null; } };
let curApi = null;
function bindApi(api) { if (api) curApi = api; }
const playerTraitsOf = (api) => playerTraits(api);

const PANEL_CSS = ''; // 整合：樣式已搬進 trials.css

// ---------- 面板管理（堆疊，Esc 關最上層，focus 還原） ----------
const stack = [];
function openPanel({ title, titleNode, body, footer, cls = '', modal = false, onClose, label }) {
  ensureStyle();
  const opener = document.activeElement;
  const ov = el('div', { class: 'tt-overlay' });
  const id = 'tt-pt-' + Math.random().toString(36).slice(2, 7);
  const panel = el('div', { class: 'tt-panel ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id });
  const h = el('h2', { id }, titleNode || title);
  const head = el('div', { class: 'tt-ph' });
  if (stack.length) head.append(el('button', { type: 'button', class: 'tt-x', 'aria-label': '返回上一個面板', onclick: () => closeTop() }, '←'));
  head.append(h);
  if (!modal) head.append(el('button', { type: 'button', class: 'tt-x', 'aria-label': '關閉', onclick: () => closeAll() }, '✕'));
  const bodyEl = el('div', { class: 'tt-pb' }, body);
  panel.append(head, bodyEl);
  if (footer) panel.append(el('div', { class: 'tt-pf' }, footer));
  ov.append(panel);
  // 點彈窗外面的暗色背景＝關閉（必須選擇的彈窗不行）。按下和放開都要在背景上，在彈窗裡拖出來不會誤關。
  if (!modal) {
    let downOnOv = false;
    ov.addEventListener('pointerdown', (e) => { downOnOv = e.target === ov; });
    ov.addEventListener('click', (e) => { if (e.target === ov && downOnOv) closeAll(); downOnOv = false; });
  }
  const prev = stack[stack.length - 1]; if (prev) { prev.ov.hidden = true; }
  const rec = { ov, panel, opener, modal, onClose };
  stack.push(rec); document.body.append(ov);
  syncHistory();
  const first = panel.querySelector('[data-autofocus]') || panel.querySelector('.tt-opt,.tt-btn,button') || panel;
  if (first === panel) panel.tabIndex = -1;
  first.focus({ preventScroll: true });
  return rec;
}
// Android 返回鍵：有可關的彈窗時，開第一個就推一筆 history，返回鍵（popstate）關最上層；全部關掉就把那筆收回。
// 必須選擇的彈窗（modal）不推也不收，返回鍵不會關它。
let histPushed = false, histIgnore = 0;
const hasClosable = () => stack.some(r => !r.modal);
function syncHistory() {
  try {
    if (hasClosable() && !histPushed) { history.pushState({ ttPanel: 1 }, ''); histPushed = true; }
    else if (!hasClosable() && histPushed) { histPushed = false; histIgnore++; history.back(); }
  } catch (_) { histPushed = false; }
}
window.addEventListener('popstate', () => {
  if (histIgnore > 0) { histIgnore--; return; }
  if (!histPushed) return;
  histPushed = false;                       // 瀏覽器已經把那筆收掉了
  const top = stack[stack.length - 1];
  if (top && !top.modal) closeTop();
  syncHistory();                            // 還有可關的就再推一筆，下一次返回鍵接著關
});
function closeTop() {
  const r = stack.pop(); if (!r) return;
  r.ov.remove(); r.onClose?.();
  syncHistory();
  const prev = stack[stack.length - 1];
  if (prev) { prev.ov.hidden = false; (prev.panel.querySelector('button') || prev.panel).focus?.(); }
  else if (r.opener && document.contains(r.opener)) r.opener.focus?.({ preventScroll: true });
}
function closeAll() { while (stack.length && !stack[stack.length - 1].modal) closeTop(); }
function closePanels() { while (stack.length) closeTop(); }
const hasPanel = () => stack.length > 0;
document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1]; if (!top) return;
  if (e.key === 'Escape' && !top.modal) { e.preventDefault(); e.stopPropagation(); closeTop(); }
  if (e.key === 'Tab') {
    const f = [...top.panel.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
  }
}, true);

const badge = (t, cls = '') => el('span', { class: 'tt-badge ' + cls }, t);
const KIND_ZH = { origin: '起源', class: '職業', unique: '獨特' };
const kindBadge = (DATA, key) => el('span', { class: 'tt-badge tt-kind', 'data-kind': kindOf(DATA, key) }, KIND_ZH[kindOf(DATA, key)] || '');
const stars = (n) => starsEl(n);

function whereIs(api, key) {
  const { state } = api;
  return {
    board: (state.board || []).some(u => u && u.key === key),
    bench: (state.bench || []).some(u => u && u.key === key),
    shop: (state.shop || []).some(s => s && s.key === key),
  };
}

// ---------- 羈絆面板 ----------
// opts: {side:'player'|'enemy', traits: countTraits 結果（敵方或指定時用）}
function showTraitPanel(key, api, opts = {}) {
  const { DATA, state } = api; const T = DATA.traits.byKey[key]; if (!T) return;
  const side = opts.side || 'player';
  const traits = opts.traits || (side === 'player' ? playerTraits(api) : []);
  const cur = traits.find(t => t.key === key) || { count: 0, tier: 0 };
  const star = isStars(DATA, key); const unit = star ? '星' : '隻';
  const bps = T.breakpoints || [];
  const body = [];
  body.push(el('p', { class: 'tt-desc' }, T.desc || ''));
  body.push(el('p', { class: 'tt-desc' }, el('b', {}, side === 'enemy' ? '敵方目前：' : '你目前：'),
    cur.count ? `${cur.count} ${unit}` + (cur.tier ? `，第 ${cur.tier} 階啟動` : '，還沒啟動') : '場上沒有'));
  const ul = el('ul', { class: 'tt-tiers', style: `--tt-kind:var(--tt-${kindOf(DATA, key)},var(--accent))` });
  bps.forEach((b, i) => {
    ul.append(el('li', { class: (cur.tier === i + 1 ? 'tt-cur ' : '') + (cur.count >= b ? 'tt-reached' : '') },
      el('b', {}, b), el('span', {}, T.levelsText?.[i] ?? '', cur.tier === i + 1 ? [' ', badge('目前')] : null)));
  });
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, `各階效果（${star ? '星數總和' : '人數'}）`), ul));
  if (T.simplified || T.guess) {
    const box = el('div', { class: 'tt-notice' });
    box.append(el('h3', { class: 'tt-h', style: 'margin:0 0 4px' }, '本頁做法'));
    if (T.simplified) box.append(el('p', { style: 'margin:0 0 4px' }, badge('簡化', 'tt-simp'), ' ', T.simplified));
    if (T.guess) box.append(el('p', { style: 'margin:0' }, badge('推測數值', 'tt-guess'), ' 推測數值，PBE 後更新。'));
    body.push(box);
  }
  if (T.counter && side === 'player') {
    const v = state.persist?.[T.counter.persistKey] ?? 0;
    const next = (T.counter.thresholds || []).find(x => x > v);
    body.push(el('div', { class: 'tt-counter' }, `${T.counter.label || '累計'} `, el('b', {}, fmt(v)),
      next != null ? ['／下一獎勵 ', el('b', {}, next)] : '（獎勵已全部拿完）'));
  }
  // 成員
  const mem = (T.members || []).map(k => DATA.units.byKey[k]).filter(Boolean).sort((a, b) => a.cost - b.cost || (a.key < b.key ? -1 : 1));
  const ml = el('ul', { class: 'tt-members' });
  for (const u of mem) {
    const w = side === 'player' ? whereIs(api, u.key) : {};
    const marks = [];
    if (w.board) marks.push(el('span', { class: 'tt-mark tt-in' }, '✓ 場上'));
    if (w.bench) marks.push(el('span', { class: 'tt-mark' }, '板凳'));
    if (w.shop) marks.push(el('span', { class: 'tt-mark tt-shop' }, '商店有'));
    const locked = isLocked(api, u.key);
    const b = el('button', { type: 'button', class: 'tt-member' + (locked ? ' tt-locked' : ''), 'data-tt-tip': 'unit:' + u.key,
      'aria-label': `${u.zh}，${u.cost} 費` + (locked ? '，還沒解鎖' : '') + (w.board ? '，已在場上' : '') + (w.bench ? '，在板凳' : '') + (w.shop ? '，商店有' : '') },
      lockedAvatar(DATA, u.key, 40, locked), el('span', {}, u.zh, el('small', {}, `${u.cost} 費`), marks.length ? el('small', {}, marks) : null));
    b.addEventListener('click', () => showUnitPanel(u.key, api));
    ml.append(el('li', {}, b));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, `成員（${mem.length}）`), ml));
  const titleNode = [tIcon(DATA, key, 28), traitZh(DATA, key), ' ', kindBadge(DATA, key), side === 'enemy' ? badge('敵方') : null];
  if (api.traitBreakdown && side === 'player') body.splice(0, 2, api.traitBreakdown(key, cur), body[0]);
  return openPanel({ titleNode, body, cls: 'tt-trait-panel' });
}

// ---------- 棋子面板 ----------
const STAT_ROWS = [
  ['hp', '生命', ['hp', 'hpPct']], ['ad', '攻擊', ['ad', 'adPct']], ['as', '攻速', ['as', 'asPct']],
  ['armor', '護甲', ['armor']], ['mr', '魔抗', ['mr']], ['range', '射程', ['range']],
];
function srcLabel(DATA, src) {
  const [t, k] = String(src).split(':');
  if (t === 'trait') return traitZh(DATA, k);
  if (t === 'item') return DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k;
  if (t === 'aug') return DATA.augments?.byKey?.[k]?.zh || k;
  return String(src);
}
function combatantFor(api, unit) {
  const { state, DATA } = api;
  const ctx = { level: state.level, round: state.round, augments: state.augments || [], persist: state.persist || {} };
  const board = boardUnits(state);
  const idx = unit.uid != null ? board.findIndex(u => u.uid === unit.uid) : -1;
  try {
    if (idx >= 0) {
      // 跟實戰用同一份棋子與標記（心鋼最愛、聚光燈、唱片合約…），面板數字才會和打起來一樣
      const bu = api.battleUnits ? api.battleUnits() : null;
      const team = bu && bu.units.length === board.length
        ? buildTeam('player', bu.units, DATA, { ...ctx, ...bu.ctx })
        : buildTeam('player', board.map(u => ({ ...u, pos: u.pos || [3, 3] })), DATA, ctx);
      return { c: team.combatants[idx] || team.combatants.find(x => x.key === unit.key), onBoard: true };
    }
    const team = buildTeam('player', [{ key: unit.key, star: unit.star || 1, items: unit.items || [], pos: [3, 3] }], DATA, ctx);
    return { c: team.combatants[0], onBoard: false };
  } catch (e) { return { c: null, onBoard: false }; }
}
function fmtSrc(v, stat) { return stat.endsWith('Pct') ? `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v >= 0 ? '+' : ''}${fmt(v)}`; }

function showUnitPanel(unitOrKey, api) {
  const { DATA, state } = api;
  const unit = typeof unitOrKey === 'string' ? { key: unitOrKey, star: 1, items: [] } : unitOrKey;
  const U = DATA.units.byKey[unit.key]; if (!U) return;
  const star = unit.star || 1;
  const { c, onBoard } = combatantFor(api, unit);
  const body = [];
  body.push(el('div', { class: 'tt-hero' }, avatar(DATA, unit.key, 64),
    el('div', {}, el('div', { class: 'tt-hn' }, U.zh, ' ', el('span', { class: 'tt-stars' }, stars(star))),
      el('div', {}, el('span', { class: 'tt-cost', 'data-cost': U.cost, style: `--tt-cost:var(--c${Math.min(U.cost, 5)})` }, U.cost + ' 費'), ' ', badge(U.role || ''), ' ',
        (U.statsGuess ?? true) ? badge('推測數值', 'tt-guess') : null))));
  body.push(el('div', {}, traitTags(unit.key, api, { clickable: true, max: 4 })));
  if (isLocked(api, unit.key)) body.push(el('div', { class: 'tt-notice tt-unlock-note' }, ...unlockTipNodes(api, unit.key)));
  // 數值
  const stats = el('div', {});
  if (c) {
    const by = {};
    for (const s of (c.sources || [])) (by[s.stat] ||= []).push(s);
    for (const [k, zh, names] of STAT_ROWS) {
      const val = c[k]; if (val == null) continue;
      const txt = k === 'as' ? val.toFixed(2) : fmt(val);
      const srcs = names.flatMap(n => (by[n] || []).map(s => `${srcLabel(DATA, s.src)} ${fmtSrc(s.value, s.stat)}`));
      stats.append(el('div', { class: 'tt-stat' }, el('span', {}, zh), el('span', {}, el('b', {}, txt), srcs.length ? el('span', { class: 'tt-src' }, `（${srcs.join('、')}）`) : null)));
    }
    if (!onBoard) stats.append(el('p', { class: 'tt-src xs muted', style: 'margin:4px 0 0;font-size:var(--fs-xs);color:var(--muted)' }, '還沒上場，數值沒有算羈絆加成。'));
  } else {
    const st = U.stats || {};
    for (const [k, zh] of STAT_ROWS) if (st[k] != null) stats.append(el('div', { class: 'tt-stat' }, el('span', {}, zh), el('b', {}, String(st[k]))));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '數值'), stats));
  // 技能
  const ab = U.ability;
  if (ab) {
    const mana = c ? [c.mana, c.manaMax] : (U.stats?.mana || null);
    const box = el('div', { class: 'tt-ab' }, el('h3', {}, ab.name, mana && mana[1] ? badge(`法力 ${mana[0]}/${mana[1]}`) : badge('不靠法力'),
      ab.simplified ? badge('簡化', 'tt-simp') : null, ab.guess ? badge('推測數值', 'tt-guess') : null),
      el('p', { class: 'tt-desc', style: 'margin:0' }, richText(ab.desc || '', star)));
    if (ab.simplified) box.append(el('p', { style: 'margin:6px 0 0;font-size:var(--fs-s);color:var(--muted)' }, '本頁做法：' + ab.simplified));
    body.push(box);
  }
  if ((unit.items || []).length) {
    body.push(el('div', {}, el('h3', { class: 'tt-h' }, '裝備'), el('div', { class: 'tt-items' },
      unit.items.map(k => el('span', { class: 'tt-item' }, el('img', { src: asset("icons/items/" + k + ".webp"), alt: '', loading: 'lazy' }), DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k)))));
  }
  const footer = [];
  if (unit.uid != null) {
    const price = sellValue(unit, DATA);
    const b = el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'sell' }, `賣出 +${price} 金`);
    b.addEventListener('click', () => sellUnit(api, unit, { onSold: () => closePanels() }));
    footer.push(b);
  }
  footer.push(el('button', { type: 'button', class: 'tt-btn', onclick: () => closeAll() }, '關閉'));
  return openPanel({ titleNode: [U.zh, (isLocked(api, unit.key) ? badge('還沒解鎖', 'tt-guess') : null)], body, footer, cls: 'tt-unit-panel' });
}

// ---------- 圖鑑 ----------
function showCodex(api) {
  const { DATA } = api; const body = [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '全部羈絆，不用上場也能查。點一個看說明。')];
  for (const kind of ['origin', 'class', 'unique']) {
    const list = DATA.traits.list.filter(t => t.kind === kind).sort((a, b) => (a.zh < b.zh ? -1 : 1));
    if (!list.length) continue;
    const g = el('div', { class: 'tt-group' }, el('h3', {}, el('span', { class: 'tt-badge tt-kind', 'data-kind': kind }, KIND_ZH[kind]), `${list.length} 個`));
    for (const t of list) {
      const mems = (t.members || []).map(k => DATA.units.byKey[k]).filter(Boolean).sort((a, b) => a.cost - b.cost);
      const b = el('button', { type: 'button', class: 'tt-crow', 'data-kind': kind, 'aria-label': `${t.zh}，門檻 ${t.breakpoints.join('、')}` },
        el('span', { class: 'tt-cn' }, tIcon(DATA, t.key, 22), t.zh, el('small', {}, (t.breakpoints || []).join(' ▸ ')), (t.simplified ? badge('簡化', 'tt-simp') : null), (t.guess ? badge('推測', 'tt-guess') : null)),
        el('span', { class: 'tt-cd' }, t.desc || ''),
        el('span', { class: 'tt-cm' }, mems.map(u => lockedAvatar(DATA, u.key, 26, isLocked(api, u.key)))));
      b.addEventListener('click', () => showTraitPanel(t.key, api));
      g.append(b);
    }
    body.push(g);
  }
  return openPanel({ title: '羈絆圖鑑', body, cls: 'tt-wide' });
}

// ---------- 已選增幅說明（點狀態列的增幅圖示） ----------
function showAugmentInfo(api, key) {
  const { DATA } = api; const A = DATA.augments.byKey[key]; if (!A) return;
  const own = (api.state.augments || []).map(k => DATA.augments.byKey[k]).filter(Boolean);
  const body = [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '你這場選過的增幅：')];
  const ul = el('ul', { class: 'tt-kv' });
  for (const a of own) ul.append(el('li', { style: a.key === key ? 'font-weight:700' : '' }, el('span', {}, ['', '銀色', '金色', '彩色'][a.tier] + '｜' + a.zh), el('span', {}, (a.desc || '') + (a.stages && a.stages.length ? `（出現階段：${a.stages.join('、')}）` : ''))));
  body.push(ul);
  return openPanel({ title: A.zh, body, footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')], cls: 'tt-wide' });
}

// ---------- 增幅三選一 ----------
// pending = state.pendingChoices {type:'augment', options:[key|{key}], rerollLeft?:n}
function showAugmentChoice(api, pending) {
  const { DATA, state } = api; pending = pending || state.pendingChoices;
  // 每一張各有自己的重抽鍵（官方做法）：按了只換那一張，其他兩張不變。pending 是 state.pendingChoices，原地被改，這裡自己重畫。
  const cur = () => state.pendingChoices && state.pendingChoices.type === 'augment' ? state.pendingChoices : pending;
  const holder = el('div', {});
  const render = (focusIdx = 0) => {
    const p = cur();
    const row = el('div', { class: 'tt-opts' });
    p.options.forEach((o, i) => {
      const A = DATA.augments.byKey[typeof o === 'string' ? o : o.key]; if (!A) return;
      const icon = el('span', { class: 'tt-augi', 'aria-hidden': 'true' });
      icon.style.backgroundImage = `url("${asset("icons/aug-sprite.webp")}")`; icon.style.backgroundSize = '2000% 1300%';
      icon.style.backgroundPosition = `${(A.sp % 20) * 100 / 19}% ${Math.floor(A.sp / 20) * 100 / 12}%`;
      const b = el('button', { type: 'button', class: 'tt-opt', 'data-tier': A.tier, 'data-i': i, 'data-autofocus': i === focusIdx ? '' : null },
        el('span', { class: 'tt-opt-head' }, icon, el('span', {}, el('span', { class: 'tt-tl' }, ['', '銀色', '金色', '彩色'][A.tier] || ''), el('div', { class: 'tt-on' }, A.zh))),
        el('span', {}, A.desc), A.guess ? el('span', {}, badge('推測數值', 'tt-guess')) : null);
      b.addEventListener('click', () => { sfx('pick'); closePanels(); api.act('pickAugment', i); });
      const left = Array.isArray(p.rerollLeft) ? (p.rerollLeft[i] || 0) : 0;
      const rr = el('button', { type: 'button', class: 'tt-btn tt-ghost tt-augrr', 'data-tt': 'aug-reroll', 'data-i': i, disabled: left > 0 ? null : '', 'aria-label': left > 0 ? `重抽第 ${i + 1} 張（只換這一張，還有 ${left} 次）` : `第 ${i + 1} 張的重抽用完了` },
        left > 0 ? `重抽這張（${left}）` : '重抽用完了');
      rr.addEventListener('click', () => { const r = api.act('rerollAugmentSlot', i); if (r && r.ok) { holder.replaceChildren(render(i)); const nb = holder.querySelector(`.tt-opt[data-i="${i}"]`); nb && nb.focus({ preventScroll: true }); }
        else if (r && state.pendingChoices && state.pendingChoices.rerollLeft && state.pendingChoices.rerollLeft[i] === 0) { holder.replaceChildren(render(i)); try { api.toast(r.reason || '沒有別的增幅可以換了'); } catch (_) { /* 略過 */ } } });
      row.append(el('div', { class: 'tt-optcol' }, b, rr));
    });
    return row;
  };
  const tier = pending.tier || DATA.augments.byKey[typeof pending.options[0] === 'string' ? pending.options[0] : pending.options[0]?.key]?.tier;
  holder.append(render());
  // 標題：第幾個增幅（對應正式遊戲的回合）＋這次的稀有度；不先講後面兩次是什麼稀有度
  const head = pending.slot && pending.stage ? `第 ${pending.slot} 個增幅（${pending.stage}）｜${['', '銀', '金', '彩'][tier] || ''}` : `選一個增幅${tier ? '（' + ['', '銀', '金', '彩'][tier] + '）' : ''}`;
  return openPanel({ title: head, body: [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '三選一。不喜歡哪一張，就按它下面的重抽，只會換那一張（每張可以換 1 次）。'), holder], modal: true, cls: 'tt-wide' });
}

// ---------- 獎勵 ----------
// pending = state.pendingChoices {type:'reward', options:[{kind:'item', items:[k,k,k]}|{kind:'gold', value}|{kind:'unit', key, component?}|{kind:'unit7', keys:[k,k,k,k]}]}
// 點選 -> api.act('pickReward', idx, sub?)；kind 為 item／unit7 的要再點裡面一個。
// 整合：game.js 的選項是 {kind:'completed',choices}|{kind:'gold',gold}|{kind:'unit',key,cost}|{kind:'seven',choices}，
// 第二段是 {type:'rewardPick', from, options:[{key}]}；這裡轉成本檔用的形狀。
function normReward(p) {
  if (p.type === 'rewardPick') {
    const keys = p.options.map(o => o.key);
    return { ...p, options: [p.from === 'completed' ? { kind: 'item', items: keys, stage2: true } : { kind: 'unit7', keys, stage2: true }] };
  }
  return { ...p, options: p.options.map(o => {
    if (o.kind === 'completed') return { kind: 'item', items: o.choices };
    if (o.kind === 'seven') return { kind: 'unit7', keys: o.choices };
    if (o.kind === 'gold') return { kind: 'gold', value: o.gold ?? o.value };
    if (o.kind === 'unit') return { kind: 'unit', key: o.key, component: o.component };
    return o;
  }) };
}
function showReward(api, pending) {
  const { DATA, state } = api; pending = normReward(pending || state.pendingChoices);
  const itemChip = (k) => el('span', { class: 'tt-item' }, el('img', { src: asset("icons/items/" + k + ".webp"), alt: '' }), DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k);
  const row = el('div', { class: 'tt-opts' });
  const done = (idx, sub) => {
    sfx('pick'); closePanels();
    if (pending.type === 'rewardPick') api.act('pickReward', sub); else api.act('pickReward', idx, sub);
  };
  pending.options.forEach((o, i) => {
    const kind = o.kind || o.type;
    let box;
    if (kind === 'item' || kind === 'unit7') {
      box = el('div', { class: 'tt-opt', style: 'cursor:default' }, el('span', { class: 'tt-on' }, kind === 'item' ? '成品裝備 1 件' : '7 費棋子 1 隻'), el('span', { class: 'tt-src', style: 'color:var(--muted)' }, '再點一個：'));
      const sub = el('div', { class: 'tt-sub' });
      (kind === 'item' ? o.items : o.keys).forEach((k, j) => {
        const b = el('button', { type: 'button', class: 'tt-opt', 'data-tier': 2, 'data-autofocus': i === 0 && j === 0 ? '' : null },
          kind === 'item' ? itemChip(k) : [avatar(DATA, k, 36), unitZh(DATA, k)]);
        b.addEventListener('click', () => done(i, j)); sub.append(b);
      });
      box.append(sub);
    } else {
      const title = kind === 'gold' ? `${o.value ?? 8} 金` : '1 隻棋子＋1 散件';
      const detail = kind === 'gold' ? '直接拿錢。' : [o.key ? el('span', { class: 'tt-item' }, avatar(DATA, o.key, 28), unitZh(DATA, o.key), ' 1 星') : '費用最高的隨機棋子', o.component ? [' ＋ ', el('span', { class: 'tt-item' }, DATA.items?.byKey?.[o.component]?.zh || DATA.items?.components?.find?.(c => c.key === o.component)?.zh || '散件')] : ''];
      box = el('button', { type: 'button', class: 'tt-opt', 'data-autofocus': i === 0 ? '' : null }, el('span', { class: 'tt-on' }, title), el('span', {}, detail));
      box.addEventListener('click', () => done(i));
    }
    row.append(box);
  });
  return openPanel({ title: '頭目獎勵', body: [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '打贏頭目的獎勵，三選一。'), row], modal: true, cls: 'tt-wide' });
}

// ---------- 頭目登場 ----------
// boss = {name, theme, mechanic, hint}
function showBossIntro(api, boss, onGo) {
  sfx('boss');
  const body = [el('div', { class: 'tt-resbig tt-lose' }, boss.name || '頭目'),
    boss.theme ? el('p', { class: 'tt-desc' }, el('b', {}, '主題羈絆：'), boss.theme) : null,
    el('p', { class: 'tt-desc' }, el('b', {}, '機制：'), boss.mechanic || ''),
    el('p', { class: 'tt-desc' }, el('b', {}, '破解：'), boss.hint || ''),
    el('p', { class: 'tt-desc muted', style: 'font-size:var(--fs-s)' }, '本站自己設計的頭目，不是官方關卡。')];
  return openPanel({ title: '頭目登場', body, footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); onGo?.(); } }, '知道了')], modal: true });
}

// ---------- 結算 ----------
const GAIN_ZH = { gold: '金幣', xp: '經驗', life: '生命', heat: '熱度', unit: '棋子', item: '裝備', interest: '利息', streak: '連勝', base: '基本收入', win: '勝利獎勵' };
// 整合：game.js 的 gains 是 {type, label, gold?|xp?|unit?|item?|life?|heat?|counter?+value}
function gainText(DATA, g) {
  const name = g.label || GAIN_ZH[g.type] || g.type;
  let v;
  if (g.gold != null) v = `+${g.gold} 金`;
  else if (g.xp != null) v = `+${g.xp} 經驗`;
  else if (g.unit) v = unitZh(DATA, g.unit) + ' 1 星';
  else if (g.item) v = DATA.items?.byKey?.[g.item]?.zh || DATA.items?.compByKey?.[g.item]?.zh || g.item;
  else if (g.life != null) v = `+${g.life} 命`;
  else if (g.heat != null) v = `熱度 +${fmt(g.heat)}`;
  else if (g.counter) v = `${g.counter} +${fmt(g.value)}`;
  else v = g.value != null ? `${g.value > 0 ? '+' : ''}${g.value}` : '';
  return [name, v];
}
function traitContribution(DATA, key, s) {
  const parts = [];
  if (s.procs) parts.push(`觸發 ${s.procs} 次`);
  if (s.dmg) parts.push(`傷害 ${fmt(s.dmg)}`);
  if (s.heal) parts.push(`治療 ${fmt(s.heal)}`);
  if (s.shield) parts.push(`護盾 ${fmt(s.shield)}`);
  return [[tIcon(DATA, key, 18), traitZh(DATA, key)], parts.join('、') || '—'];
}
// info = {result, enemy, finish, onNext}；finish = actFinishBattle 的回傳 {roundScore, gains[], gameOver?, cleared?, scoreParts?[]}
function buildResultBody(api, info, playCoin) {
  const { DATA, state } = api; const { result, enemy, finish = {} } = info;
  const win = result.winner === 'player';
  const lives = info.livesAfter ?? state.lives, scoreNow = info.scoreAfter ?? state.score;   // 回看時用當時的數字
  const body = [];   // 勝敗音效由 battle.js 在 end 事件播
  body.push(el('div', { class: 'tt-resbig ' + (win ? 'tt-win' : 'tt-lose') }, win ? '勝利' : '落敗',
    el('small', {}, `${enemy?.name ? 'VS ' + enemy.name + '，' : ''}${Math.round(result.seconds)} 秒，我方存活 ${result.summary.playerAlive} 隻`)));
  if (!win) body.push(el('p', { class: 'tt-desc' }, `扣 1 條命，剩 ${lives} 條。敵方還剩 ${Math.round((result.summary.enemyHpPctLeft ?? 0) * 100)}% 血。`));
  // 得分
  const sc = el('ul', { class: 'tt-kv' });
  for (const p of (finish.scoreParts || [])) sc.append(el('li', {}, el('span', {}, p.label), el('b', {}, '+' + fmt(p.value))));
  sc.append(el('li', {}, el('span', {}, '本回合得分'), el('b', {}, '+' + fmt(finish.roundScore ?? 0))));
  if (finish.endBonus) sc.append(el('li', {}, el('span', {}, finish.cleared ? '通關加分（通關、剩下的命、剩下的金錢）' : '剩下的金錢加分'), el('b', {}, '+' + fmt(finish.endBonus))));
  sc.append(el('li', {}, el('span', {}, '累計分數'), el('b', {}, fmt(scoreNow ?? 0))));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '得分'), sc));
  // 收入
  const gains = finish.gains || [];   // 戰鬥中的經濟效果（summary.rewards）已由 game.js 併進 gains
  const gl = el('ul', { class: 'tt-kv' });
  let coinPlayed = false;   // 金幣音效 1.35 秒：只在第一行有金幣的收入播一次，不疊
  gains.forEach((g) => { const [a, b] = gainText(DATA, g); const li = el('li', {}, el('span', {}, a), el('b', {}, b)); gl.append(li); if (g.gold && !coinPlayed) { coinPlayed = true; if (playCoin) sfx('coin'); } });
  if (!gains.length) gl.append(el('li', {}, el('span', { class: 'muted' }, '這回合沒有收入'), ''));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '收入'), gl));
  // 羈絆貢獻
  const bt = Object.entries(result.summary.byTrait || {}).filter(([, s]) => s && (s.procs || s.dmg || s.heal || s.shield))
    .sort((a, b) => (b[1].procs || 0) - (a[1].procs || 0) || (a[0] < b[0] ? -1 : 1));
  const tl = el('ul', { class: 'tt-kv', 'data-tt': 'trait-contrib' });
  for (const [k, s] of bt) { const [a, b] = traitContribution(DATA, k, s); tl.append(el('li', {}, el('span', {}, a), el('span', {}, b))); }
  if (!bt.length) tl.append(el('li', {}, el('span', { class: 'muted' }, '這場沒有羈絆做出額外效果。'), ''));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '羈絆做了什麼'), tl));
  // 傷害排行
  const mine = result.units.filter(u => u.side === 'player');
  const rows = mine.map(u => ({ u, s: result.summary.byUnit[u.id] || {} })).sort((a, b) => (b.s.dmg || 0) - (a.s.dmg || 0));
  const mx = Math.max(1, ...rows.map(r => r.s.dmg || 0));
  const dl = el('div', { class: 'tt-dmg' });
  for (const { u, s } of rows) {
    const tot = s.dmg || 0; const w = (tot / mx) * 100;
    const part = (x) => tot ? (x || 0) / tot * w : 0;
    dl.append(el('div', { class: 'tt-dmgrow' }, avatar(DATA, u.key, 32), el('span', {}, u.zh, ' ', el('span', { class: 'tt-stars' }, stars(u.star))),
      el('span', { class: 'tt-bar', role: 'img', 'aria-label': `物理 ${fmt(s.phys || 0)}，魔法 ${fmt(s.magic || 0)}，真實 ${fmt(s.true || 0)}` },
        el('i', { class: 'p', style: `width:${part(s.phys)}%` }), el('i', { class: 'm', style: `width:${part(s.magic)}%` }), el('i', { class: 't', style: `width:${part(s.true)}%` })),
      el('span', { class: 'tt-dn' }, fmt(tot))));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '傷害排行'), el('div', { class: 'tt-legend' }, el('span', {}, el('i', { style: 'background:#e8863a' }), '物理'), el('span', {}, el('i', { style: 'background:#4a86e0' }), '魔法'), el('span', {}, el('i', { style: 'background:#d8d8d8;box-shadow:inset 0 0 0 1px #888' }), '真實')), dl));
  return body;
}
// 遊戲結束／通關那一場：還是跳完整結算視窗（按「看結果」才往下）。
// info.review＝回頭看上一回合：可以關掉的普通視窗，不重播金幣音效。
function showResult(api, info) {
  const { state } = api; const finish = info.finish || {};
  const round = info.round ?? state.history?.slice(-1)[0]?.round ?? state.round;
  if (info.review) {
    const close = el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉');
    return openPanel({ title: `第 ${round} 回合結算`, body: buildResultBody(api, info, false), footer: [close], cls: 'tt-wide tt-result' });
  }
  const next = el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); info.onNext?.(); } }, finish.gameOver || finish.cleared ? '看結果' : '下一回合');
  return openPanel({ title: `第 ${round} 回合結算`, body: buildResultBody(api, info, true), footer: [next], modal: true, cls: 'tt-wide tt-result' });
}

// 一般回合打完：不擋操作的小橫幅（約 2.5 秒淡出），點一下開完整明細。金幣音效只在這裡播一次。
let bannerEl = null, bannerT = null;
function hideResultBanner() { clearTimeout(bannerT); if (bannerEl) { bannerEl.remove(); bannerEl = null; } }
function showResultBanner(api, info) {
  const { DATA } = api; const { result, finish = {} } = info;
  hideResultBanner();
  const win = result.winner === 'player';
  const round = info.round ?? api.state.round;
  const gains = finish.gains || [];
  const goldTotal = gains.reduce((n, g) => n + (g.gold || 0), 0);
  if (goldTotal > 0) sfx('coin');
  const parts = gains.filter(g => g.gold).map(g => { const [a, b] = gainText(DATA, g); return `${a} ${b.replace(' 金', '')}`; });
  const other = gains.filter(g => !g.gold).length;
  const line2 = [];
  if (!win) line2.push(`扣 1 條命，剩 ${info.livesAfter ?? api.state.lives} 條`);
  if (goldTotal > 0) line2.push(`收入 +${goldTotal} 金（${parts.join('、')}）`);
  if (other) line2.push(`另外拿了 ${other} 項`);
  if (api.state.streak >= 2 && win) line2.push(`${api.state.streak} 連勝`);
  const b = el('div', { class: 'tt-rbanner ' + (win ? 'tt-win' : 'tt-lose'), role: 'status', 'aria-live': 'polite', tabindex: '0', 'data-tt': 'result-banner', 'aria-label': '上回合結算，點一下看明細' },
    el('div', { class: 'tt-rb-h' }, el('b', {}, win ? '勝利' : '落敗'), el('span', {}, `第 ${round} 回合・得分 +${fmt(finish.roundScore ?? 0)}`), el('em', {}, '點一下看明細')),
    line2.length ? el('div', { class: 'tt-rb-b' }, line2.join('　')) : null);
  const open = () => { hideResultBanner(); showResult(api, { ...info, review: true }); };
  b.addEventListener('click', open);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  document.body.append(b); bannerEl = b;
  bannerT = setTimeout(() => { if (bannerEl !== b) return; b.classList.add('tt-out'); bannerT = setTimeout(() => { if (bannerEl === b) hideResultBanner(); }, 400); }, 2500);
  return b;
}

// ---------- 遊戲結束／通關 ----------
// info = {cleared, score, round, bestTraits:[{key,tier}]}（分數與回合缺的話讀 state）；最高分讀 localStorage['trials19.best']
function showGameOver(api, info = {}) {
  const { DATA, state } = api;
  const score = info.score ?? state.score ?? 0; const round = info.round ?? state.round;
  let best = null; try { best = JSON.parse(localStorage.getItem('trials19.best') || 'null'); } catch (_) {}
  const isNew = !best || score >= best.score;
  const body = [el('div', { class: 'tt-resbig ' + (info.cleared ? 'tt-win' : 'tt-lose') }, info.cleared ? '通關' : '遊戲結束', el('small', {}, `打到第 ${round} 回合`)),
    el('div', {}, el('div', { class: 'tt-bigscore' }, fmt(score)), el('div', { class: 'muted' }, isNew ? '新的最高分' : `最高分 ${fmt(best.score)}（第 ${best.round} 回合）`),
      info.endBonus ? el('div', { class: 'muted' }, `這個分數已含${info.cleared ? '通關、剩下的命和金錢' : '剩下的金錢'}加分 +${fmt(info.endBonus)}`) : null)];
  const traits = info.bestTraits || [];
  const chips = el('div', { class: 'tt-chips' });
  for (const t of traits) chips.append(el('span', { class: 'tt-chip', 'data-kind': kindOf(DATA, t.key) }, [tIcon(DATA, t.key, 18), `${traitZh(DATA, t.key)} 第 ${t.tier} 階`]));
  if (!traits.length) chips.append(el('span', { class: 'muted' }, '這場沒有啟動過羈絆。'));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '這場啟動過的羈絆（最高階）'), chips));
  const footer = [el('a', { class: 'tt-btn tt-ghost', href: '../?s=19' }, '回攻略站'),
    el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); api.act('restart'); } }, '再玩一次')];
  return openPanel({ title: info.cleared ? '通關了' : '遊戲結束', body, footer, modal: true });
}

// ======================================================================
// 以下是第二版介面（SPEC_UI2）加的：解鎖、快捷鍵、右側棋子面板、賣出確認、說明
// ======================================================================

// ---------- 解鎖資料入口（api.unlocks 由包 A 提供；沒有就當機制關閉） ----------
const unlockOn = (api) => { const u = api && api.unlocks; if (!u) return false; const e = u.enabled; return typeof e === 'function' ? !!e.call(u) : !!e; };
function isLocked(api, key) { try { return unlockOn(api) && typeof api.unlocks.isUnlocked === 'function' && !api.unlocks.isUnlocked(key); } catch (_) { return false; } }
function unlockEntries(api) {
  const byKey = api.DATA.unlocks?.byKey || {};
  let list = [];
  try { list = (api.unlocks && api.unlocks.list && api.unlocks.list()) || api.DATA.unlocks?.list || []; } catch (_) { list = api.DATA.unlocks?.list || []; }
  return list.map(x => (typeof x === 'string' ? { key: x } : x)).map(x => ({ ...(byKey[x.key] || {}), ...x })).filter(x => x.key && api.DATA.units.byKey[x.key]);
}
function unlockProgress(api, key) {
  try { return (api.unlocks && api.unlocks.progress && api.unlocks.progress(key)) || null; } catch (_) { return null; }
}
// 互斥（兩隻阿卡莉）：條件樹裡有 not:unlocked:X 而 X 已解鎖
function blockedBy(api, cond) {
  if (!cond || typeof cond !== 'object') return null;
  if (cond.type === 'not' && cond.unlocked && api.unlocks && api.unlocks.isUnlocked(cond.unlocked)) return cond.unlocked;
  for (const c of (cond.of || [])) { const r = blockedBy(api, c); if (r) return r; }
  return null;
}
// 條件樹裡提到的棋子 key（連鎖解鎖：把名字做成可點）
function condUnits(cond, out = new Set()) {
  if (!cond || typeof cond !== 'object') return out;
  for (const k of ['unit', 'withUnit', 'unlocked']) if (typeof cond[k] === 'string') out.add(cond[k]);
  if (cond.who && typeof cond.who === 'object' && cond.who.unit) out.add(cond.who.unit);
  for (const c of (cond.of || [])) condUnits(c, out);
  return out;
}
const nfmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>';
// 頭像；沒解鎖的灰階＋右下角小鎖
function lockedAvatar(DATA, key, size, locked) {
  const w = el('span', { class: 'tt-lockav' + (locked ? ' tt-locked' : '') }, avatar(DATA, key, size));
  if (locked) { const b = el('span', { class: 'tt-lockbadge', 'aria-hidden': 'true' }); b.innerHTML = LOCK_SVG; w.append(b); }
  w.setAttribute('data-tt-tip', 'unit:' + key);   // 滑鼠停上去（手機長按）就看到名字、羈絆、技能；沒解鎖的最後補解鎖條件
  return w;
}
function progressNodes(p) {
  if (!p) return [];
  if (p.parts && p.parts.length) return p.parts.map(x => el('p', { class: 'tt-tip-p' }, (x.done ? '✓ ' : '○ ') + (x.text || '') + (x.need != null && x.need > 1 ? `　${nfmt(x.cur)}/${nfmt(x.need)}` : '')));
  return [el('p', { class: 'tt-tip-p' }, `進度 ${nfmt(p.cur)}/${nfmt(p.need)}`)];
}
// 說明框用（tooltip.js 的 unlock:<key>）與棋子面板共用
function unlockTipNodes(api, key) {
  const ent = unlockEntries(api).find(x => x.key === key); if (!ent) return null;
  const { DATA } = api; const U = DATA.units.byKey[key];
  const done = api.unlocks.isUnlocked(key);
  const nodes = [el('b', { class: 'tt-tip-title' }, `${U.zh}　${done ? '已解鎖' : '還沒解鎖'}`), el('p', { class: 'tt-tip-p' }, ent.text || '')];
  if (ent.local) nodes.push(el('p', { class: 'tt-tip-p tt-tip-muted' }, '本頁做法：' + ent.local));
  if (ent.note) nodes.push(el('p', { class: 'tt-tip-p tt-tip-muted' }, '算法：' + ent.note));
  const b = blockedBy(api, ent.cond);
  if (b && !done) nodes.push(el('p', { class: 'tt-tip-p tt-tip-muted' }, '這一局不能解鎖了（已解鎖另一隻阿卡莉）'));
  else if (!done) nodes.push(...progressNodes(unlockProgress(api, key)));
  if (ent.guess) nodes.push(el('div', { class: 'tt-tip-foot' }, el('span', { class: 'tt-tip-badge tt-guess' }, '推測')));
  return nodes;
}

// ---------- 賣出（3★ 與 7 費要確認；拖到商店、E 鍵、面板賣出鍵共用） ----------
function sellUnit(api, unit, opts = {}) {
  if (unit && unit.key === ANVIL) {   // 散件鐵砧：賣掉＝打開挑散件
    if (api.ui) api.ui.sel = { kind: 'unit', uid: unit.uid };
    api.emit && api.emit('change');
    api.toast && api.toast('挑一件散件，就會放進裝備欄');
    return null;
  }
  const { DATA } = api; const U = DATA.units.byKey[unit.key]; if (!U) return null;
  const star = unit.star || 1, price = sellValue(unit, DATA);
  const doit = () => {
    const sel = api.ui && api.ui.sel;
    if (sel && sel.kind === 'unit' && sel.uid === unit.uid) api.ui.sel = null;
    const r = api.act('sell', unit.uid);
    if (r && r.ok !== false) opts.onSold && opts.onSold();
    return r;
  };
  if (!(star >= 3 || U.cost >= 7)) return doit();
  const body = [el('p', { class: 'tt-desc' }, `確定賣掉 ${star} 星 ${U.zh}？可以拿 ${price} 金，賣掉就回不來了。`)];
  const footer = [
    el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'sell-cancel', onclick: () => closeTop() }, '取消'),
    el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', 'data-tt': 'sell-confirm', onclick: () => { closeTop(); doit(); } }, `確定賣掉 +${price} 金`),
  ];
  return openPanel({ title: `確定賣掉 ${U.zh}？`, body, footer, cls: 'tt-confirm' });
}

// ---------- 目前選取（SPEC_UI2 4.1） ----------
function resolveSel(api) {
  const sel = api.ui && api.ui.sel; if (!sel) return null;
  const { state } = api;
  if (sel.kind === 'unit') { const u = [...(state.board || []), ...(state.bench || [])].find(x => x && x.uid === sel.uid); return u ? { kind: 'unit', unit: u } : null; }
  if (sel.kind === 'enemy') return api.DATA.units.byKey[sel.key] ? { kind: 'enemy', unit: { key: sel.key, star: sel.star || 1, items: sel.items || [] } } : null;
  if (sel.kind === 'sp') return SPECIAL_INFO[sel.id] ? { kind: 'sp', id: sel.id } : null;
  if (sel.kind === 'item') { const k = (state.itemBench || [])[sel.idx]; return k ? { kind: 'item', key: k, idx: sel.idx } : null; }
  return null;
}
function enemyTraitsOf(api) {
  try {
    const e = api.enemy && api.enemy(); if (!e) return [];
    if (e.traitsPreview && e.traitsPreview.length) return e.traitsPreview;
    return api.countTraits ? api.countTraits(e.units.map(u => ({ key: u.key, star: u.star, items: u.items || [] })), api.DATA, { augments: [] }) : [];
  } catch (_) { return []; }
}

// ---------- 數值格 ----------
const pct = (v) => `${Math.round(v * 100)}%`;
const STAT_DEFS = [
  { id: 'ad', zh: '攻擊力', g: '攻', srcs: ['ad', 'adPct'], val: (c) => fmt(c.ad), base: (U) => U.stats?.ad, desc: '普通攻擊的傷害。' },
  { id: 'ap', zh: '法術強度', g: '法', srcs: ['ap'], val: (c) => fmt(c.ap), base: () => 100, desc: '技能的魔法傷害、治療、護盾會跟著變大。' },
  { id: 'armor', zh: '護甲', g: '甲', srcs: ['armor'], val: (c) => fmt(c.armor), base: (U) => U.stats?.armor, desc: '減少受到的物理傷害。' },
  { id: 'mr', zh: '魔法抗性', g: '抗', srcs: ['mr'], val: (c) => fmt(c.mr), base: (U) => U.stats?.mr, desc: '減少受到的魔法傷害。' },
  { id: 'as', zh: '攻擊速度', g: '速', srcs: ['as', 'asPct'], val: (c) => c.as.toFixed(2), base: (U) => U.stats?.as, desc: '每秒普通攻擊的次數。' },
  { id: 'crit', zh: '暴擊率', g: '暴', srcs: ['crit'], val: (c) => pct(c.crit), base: (U) => U.stats?.crit, desc: '普通攻擊暴擊的機率。' },
  { id: 'critDmg', zh: '暴擊傷害', g: '傷', srcs: ['critDmg'], val: (c) => pct(c.critDmg), base: (U) => U.stats?.critDmg, desc: '暴擊時的傷害倍率。' },
  { id: 'range', zh: '射程', g: '程', srcs: ['range'], val: (c) => `${c.range} 格`, base: (U) => U.stats?.range, desc: '可以打到幾格遠。' },
  { id: 'hpBonus', zh: '生命加成', g: '血', srcs: ['hpPct'], val: (c) => (c.baseHp ? pct(c.hp / c.baseHp - 1) : '—'), show: (c) => c.baseHp && c.hp / c.baseHp - 1 > 0.0005, desc: '比基礎生命多出來的比例。' },
  { id: 'dr', zh: '減傷', g: '減', srcs: ['dr'], val: (c) => pct(c.dr), show: (c) => c.dr > 0, desc: '所有受到的傷害再打折。' },
];
const statDef = (id) => STAT_DEFS.find(d => d.id === id);
// 面板數值用小圖示（單色，跟著文字色）；找不到就退回單字
const SI = {
  ad: '<path d="M15 3h6v6L11 19l-2-2zM8 16l-4 4 1 1 4-4zM3 17l4 4"/>',
  ap: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  armor: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  mr: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l1.6 3.4L17 12l-3.4 1.6L12 17l-1.6-3.4L7 12l3.4-1.6z"/>',
  as: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  crit: '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 1h2v6h-2zM11 17h2v6h-2zM1 11h6v2H1zM17 11h6v2h-6z"/>',
  critDmg: '<path d="M12 1l2.2 6.3L20.5 4l-3.3 6.3L23 12l-5.8 1.7 3.3 6.3-6.3-3.3L12 23l-2.2-6.3L3.5 20l3.3-6.3L1 12l5.8-1.7L3.5 4l6.3 3.3z"/>',
  range: '<path d="M2 12l5-5v3.5h10V7l5 5-5 5v-3.5H7V17z"/>',
  hpBonus: '<path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11z"/>',
  dr: '<path d="M10 3h4v9h4l-6 9-6-9h4z"/>',
};
const statIcon = (d) => {
  const i = el('i', { 'aria-hidden': 'true' });
  if (SI[d.id]) i.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%" focusable="false">${SI[d.id]}</svg>`; else i.textContent = d.g;
  return i;
};
// tooltip 的 stat:<id>：用目前選取的棋子
function statTipInfo(api, statId) {
  const d = statDef(statId); const r = resolveSel(api); if (!d || !r || r.kind === 'item') return null;
  const { DATA } = api; const U = DATA.units.byKey[r.unit.key];
  const { c } = combatantFor(api, r.unit); if (!c) return null;
  const lines = [];
  const base = d.base && d.base(U);
  if (base != null && statId !== 'range') lines.push(['基礎', statId === 'crit' || statId === 'critDmg' ? pct(base) : statId === 'as' ? Number(base).toFixed(2) : fmt(base)]);
  for (const s of (c.sources || [])) if (d.srcs.includes(s.stat)) lines.push([srcLabel(DATA, s.src), s.stat === 'asPct' || s.stat === 'hpPct' || s.stat === 'adPct' ? fmtSrc(s.value, s.stat) : (['crit', 'critDmg', 'dr'].includes(s.stat) ? `${s.value >= 0 ? '+' : ''}${pct(s.value)}` : fmtSrc(s.value, s.stat))]);
  return { title: d.zh, value: d.val(c), desc: d.desc, lines: lines.filter(x => !(x[0] === '基礎' && lines.length === 1)) };
}

// ---------- 右側棋子面板／手機底部抽屜 ----------
function spriteBg(node, DATA, key) {
  const sp = DATA.units.sprite || {}, idx = sp.map?.[key];
  if (idx == null || !sp.src) return node;
  const cols = sp.cols || 10, rows = sp.rows || 10;
  node.style.backgroundImage = `url("${sp.src}")`;
  node.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${(idx % cols) * 100 / (cols - 1)}% ${Math.floor(idx / cols) * 100 / (rows - 1)}%`;
  return node;
}
const coin = () => el('img', { class: 'tt-coin', src: asset("img/ui/gold_coin.webp"), alt: '', draggable: 'false' });
const FRONT_ROLES = ['Tank', 'Fighter'];

function bar(cls, cur, max, text, label) {
  const b = el('div', { class: 'tt-us-bar ' + cls, role: 'img', 'aria-label': label }, el('i'), el('span', { class: 'tt-num' }, text));
  b.firstChild.style.width = (max > 0 ? Math.max(0, Math.min(100, cur / max * 100)) : 0) + '%';
  return b;
}

// 自選散件：列出全部散件，每件寫出「跟裝備欄裡的哪件能合成什麼」，點一件就換上（站主 2026-11-16）
function choiceSide(api, r) {
  const { DATA } = api;
  const anvil = r.kind === 'unit';   // 板凳上的散件鐵砧；不然是裝備欄的自選散件（舊存檔）
  const bench = api.state.itemBench || [];
  const wrap = el('div', { class: 'tt-us tt-us-item tt-us-choice' }, el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }),
    el('div', { class: 'tt-us-itemhead' }, el('span', { class: 'tt-us-itemicon tt-xchoice' }, el('span', { class: 'tt-xch-q' }, '?')), el('div', {}, el('b', { class: 'tt-us-iname' }, anvil ? '散件鐵砧' : '自選散件'), el('small', {}, anvil ? '挑一件散件，會放進裝備欄' : '挑一件你要的散件'))));
  const grid = el('div', { class: 'tt-us-chgrid', role: 'group', 'aria-label': '挑散件' });
  const comps = (DATA.items.components || []).map(x => (typeof x === 'string' ? x : x.key));
  for (const k of comps) {
    const zh = DATA.items.compByKey?.[k]?.zh || k;
    const makes = [];
    bench.forEach((o, j) => { if ((!anvil && j === r.idx) || o === CHOICE) return; const res = DATA.items.recipes && DATA.items.recipes[[k, o].sort().join('+')]; if (res && !makes.includes(res)) makes.push(res); });
    const ic = el('span', { class: 'tt-us-itemicon tt-us-mini' }); ic.style.backgroundImage = `url("${asset("icons/items/" + k + ".webp")}")`;
    const b = el('button', { type: 'button', class: 'tt-us-chbtn' + (makes.length ? ' tt-can' : ''), 'data-tt': 'choose-comp', 'data-key': k,
      'aria-label': `挑${zh}` + (makes.length ? `，可以合成${makes.map(x => DATA.items.byKey[x]?.zh || x).join('、')}` : '') },
      ic, el('span', { class: 'tt-us-chtxt' }, el('b', {}, zh), makes.length ? el('small', {}, '可合：' + makes.map(x => DATA.items.byKey[x]?.zh || x).join('、')) : null));
    b.addEventListener('click', (e) => { e.stopPropagation(); if (api.ui) api.ui.sel = null; if (anvil) api.act('openAnvil', r.unit.uid, k); else api.act('chooseComponent', r.idx, k); });
    grid.append(b);
  }
  wrap.append(grid, el('p', { class: 'tt-us-hint tt-muted' }, '亮起來的那幾件，跟你裝備欄裡現有的散件可以直接合成。'));
  return wrap;
}
function itemSide(api, r) {
  const { DATA } = api; const k = r.key;
  if (k === CHOICE) return choiceSide(api, r);
  const I = DATA.items?.byKey?.[k] || DATA.items?.compByKey?.[k];
  const isComp = !!DATA.items?.compByKey?.[k];
  const ic = el('span', { class: 'tt-us-itemicon' }); ic.style.backgroundImage = `url("${asset("icons/items/" + k + ".webp")}")`;
  const wrap = el('div', { class: 'tt-us tt-us-item' }, el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }),
    el('div', { class: 'tt-us-itemhead' }, ic, el('div', {}, el('b', { class: 'tt-us-iname' }, I?.zh || k), el('small', {}, I?.recipe ? '成品裝備' : '散件'))));
  if (I?.desc) wrap.append(el('p', { class: 'tt-us-desc' }, I.desc));
  if (I?.recipe) wrap.append(el('p', { class: 'tt-us-desc tt-muted' }, '合成：' + I.recipe.map(x => DATA.items?.byKey?.[x]?.zh || DATA.items?.compByKey?.[x]?.zh || x).join(' ＋ ')));
  if (isComp) {
    const seen = new Set(); const ul = el('ul', { class: 'tt-us-recipes' });
    for (const it of DATA.items.list || Object.values(DATA.items.byKey)) {
      if (!it.recipe || !it.recipe.includes(k)) continue;
      const other = it.recipe[0] === k ? it.recipe[1] : it.recipe[0];
      if (seen.has(other)) continue; seen.add(other);
      ul.append(el('li', {}, `＋${DATA.items?.compByKey?.[other]?.zh || DATA.items?.byKey?.[other]?.zh || other}＝`, el('b', {}, it.zh)));
    }
    // 裝備欄裡現在就能跟它合的散件：每個旁邊一顆「合成」鍵，按一下直接合（不用拖、不用停 0.5 秒）
    const bench = api.state.itemBench || []; const can = [];
    bench.forEach((o, j) => { if (j === r.idx) return; const res = DATA.items.recipes && DATA.items.recipes[[k, o].sort().join('+')]; if (res) can.push({ j, o, res }); });
    if (can.length) {
      const cl = el('ul', { class: 'tt-us-combos' });
      for (const c of can) {
        const ci = el('span', { class: 'tt-us-itemicon tt-us-mini' }); ci.style.backgroundImage = `url("${asset("icons/items/" + c.o + ".webp")}")`;
        const btn = el('button', { type: 'button', class: 'tt-btn tt-us-combo', 'data-tt': 'combine', 'data-j': c.j, 'aria-label': `和${DATA.items.compByKey[c.o]?.zh || c.o}合成${DATA.items.byKey[c.res]?.zh || c.res}` }, '合成');
        btn.addEventListener('click', (e) => { e.stopPropagation(); if (api.ui) api.ui.sel = null; api.act('combineItems', r.idx, c.j); });
        cl.append(el('li', {}, ci, el('span', { class: 'tt-us-combotxt' }, `${DATA.items.compByKey[c.o]?.zh || c.o} ＝ `, el('b', {}, DATA.items.byKey[c.res]?.zh || c.res)), btn));
      }
      wrap.append(el('h3', { class: 'tt-us-h' }, '裝備欄裡可以合的'), cl);
    }
    if (ul.children.length) wrap.append(el('details', { class: 'tt-us-alldet' }, el('summary', { class: 'tt-us-h' }, '全部可以合成的'), ul));   // 完整配方表收起來放後面：先看到能直接按的合成鍵，手機抽屜也不會長到蓋住裝備欄
  }
  wrap.append(el('p', { class: 'tt-us-hint tt-muted' }, '選著它再點一隻棋子就裝上去（用拖的也可以）；棋子身上已有 1 件散件，會直接合成。'));
  return wrap;
}

const PICK_ORIGIN = (api, key) => { const t = api.DATA.units.byKey[key]?.traits || []; return t.includes('Producer') ? null : (t.find(k => api.DATA.traits.byKey[k]?.kind === 'origin') || null); };
function spSide(api, r) {
  const I = SPECIAL_INFO[r.id];
  const ic = el('span', { class: 'tt-us-itemicon tt-spicon tt-sp-' + r.id });
  const wrap = el('div', { class: 'tt-us tt-us-item' }, el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }),
    el('div', { class: 'tt-us-itemhead' }, ic, el('div', {}, el('b', { class: 'tt-us-iname' }, I.zh), el('small', {}, I.sub))));
  const tapHint = r.id === 'inst' ? '選著它再點我方棋盤的空格就擺上去（用拖的也可以）。' : r.id === 'favmark' ? '' : '選著它再點一隻棋子就用上去（用拖的也可以）。';
  wrap.append(...[el('p', { class: 'tt-us-desc' }, I.desc), tapHint && el('p', { class: 'tt-us-hint' }, tapHint), I.hint && el('p', { class: 'tt-us-hint tt-muted' }, I.hint)].filter(Boolean));
  return wrap;
}

function unitSide(api, r) {
  const { DATA } = api; const u = r.unit; const U = DATA.units.byKey[u.key]; const star = u.star || 1;
  const enemy = r.kind === 'enemy';
  const { c } = combatantFor(api, u);
  const wrap = el('div', { class: 'tt-us', 'data-kind': r.kind, 'data-cost': U.cost });
  wrap.append(el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }));
  // 頭圖＋左邊羈絆
  const art = spriteBg(el('span', { class: 'tt-us-art', 'aria-hidden': 'true' }), DATA, u.key);
  const tl = el('div', { class: 'tt-us-traits' });
  const etraits = enemy ? enemyTraitsOf(api) : null;
  for (const k of (U.traits || [])) {
    const b = el('button', { type: 'button', class: 'tt-us-trait', 'data-trait': k, 'data-kind': kindOf(DATA, k), 'data-tt-tip': 'trait:' + k, 'aria-label': `${traitZh(DATA, k)}，點開羈絆說明` }, tIcon(DATA, k, 22), el('span', {}, traitZh(DATA, k)));
    b.addEventListener('click', () => showTraitPanel(k, api, enemy ? { side: 'enemy', traits: etraits } : {}));
    tl.append(b);
  }
  wrap.append(el('div', { class: 'tt-us-hero' }, art, el('div', { class: 'tt-us-stars' }, starsEl(star)), tl));
  // 名稱列
  const price = enemy ? U.cost : sellValue(u, DATA);
  wrap.append(el('div', { class: 'tt-us-name' }, el('b', {}, U.zh), enemy ? badge('敵方', 'tt-enemy') : null,
    el('span', { class: 'tt-us-price', 'aria-label': (enemy ? '費用 ' : '賣價 ') + price + ' 金' }, coin(), el('span', { class: 'tt-num' }, price))));
  // 指定道具（心鋼最愛、聚光燈、唱片合約、合作邀請、分身站位）：棋子身上有標記就寫在這裡；能放但還沒放就提示怎麼放
  if (!enemy && api.picks) {
    try {
      const pk = api.picks();
      const inb = !!(api.state.board || []).find(x => x && x.uid === u.uid);
      const lines = [];
      for (const [id, ico] of [['fav', '♥ 最愛：'], ['spot', '聚光燈：'], ['deal', '唱片合約：'], ['prod', '合作邀請：'], ['clone', '分身站位：']]) {
        const f = pk[id]; if (!f || !f.cap) continue;
        const held = f.held.includes(u.uid), on = f.active.includes(u.uid);
        if (held) {
          const txt = !on ? (inb ? '羈絆掉階了或數量不夠，暫時失效' : '在板凳上，要上場才有效')
            : id === 'fav' ? '技能增幅 +25%' : id === 'spot' ? '開場和每 5 秒都拿一次傷害增幅' : id === 'deal' ? '傷害增幅 +5%，他每殺一個蒙多永久 +25 生命'
              : id === 'prod' ? `${traitZh(api.DATA, f.trait)} 多算 1 人` : '分身開場站在他旁邊';
          lines.push(el('p', { class: 'tt-us-fav' + (on ? '' : ' tt-off') }, ico, txt));
        } else if (f.free > 0 && (id === 'fav' ? (U.traits || []).includes('Heartsteel') : id === 'prod' ? !!(PICK_ORIGIN(api, u.key)) : true)) {
          const hint = { fav: '拖「心鋼最愛」到他身上，就選他強化技能', spot: '想捧他就把聚光燈拖到他身上', deal: '要簽他就把唱片合約拖到他身上',
            prod: `拖「合作邀請」到他身上，${traitZh(api.DATA, PICK_ORIGIN(api, u.key) || '')} 就多算 1 人`, clone: '拖「分身站位」到他身上，分身就站他旁邊' }[id];
          lines.push(el('p', { class: 'tt-us-fav tt-off' }, hint));
        }
      }
      wrap.append(...lines);
    } catch (_) { /* 說明少一行沒關係 */ }
  }
  // 血條、法力條
  const hp = c ? c.hp : (U.stats?.hp || 0);
  wrap.append(bar('tt-hp', hp, hp, `${fmt(hp)} / ${fmt(hp)}`, `生命 ${fmt(hp)}`));
  const hasMana = c ? c.manaMax > 0 : !!(U.stats?.mana && U.stats.mana[1]);
  const m0 = c ? c.mana : U.stats?.mana?.[0], m1 = c ? c.manaMax : U.stats?.mana?.[1];
  wrap.append(hasMana ? bar('tt-mana', m0, m1, `${fmt(m0)} / ${fmt(m1)}`, `法力 ${m0}／${m1}`) : bar('tt-mana tt-none', 0, 1, '—', '不靠法力'));
  // 技能圖示＋定位＋射程
  const ab = U.ability;
  const abBtn = ab
    ? el('button', { type: 'button', class: 'tt-us-ab', 'data-tt-tip': `ability:${u.key}:${star}`, 'data-tt-pin': '', 'data-tt-tip-place': 'left', 'aria-label': `技能：${ab.name}，點一下釘住說明` }, abilityIcon(DATA, u.key, 44))
    : el('span', { class: 'tt-us-ab tt-empty', 'aria-hidden': 'true' });
  const rng = c ? c.range : U.stats?.range;
  wrap.append(el('div', { class: 'tt-us-row3' }, abBtn,
    el('span', { class: 'tt-us-cell' }, el('small', {}, '定位'), el('b', {}, FRONT_ROLES.includes(U.roleClass) ? '前排' : '後排')),
    el('span', { class: 'tt-us-cell' }, el('small', {}, '射程'), el('b', {}, `${rng} 格`))));
  // 裝備 3 格
  const slots = el('div', { class: 'tt-us-items', 'aria-label': '裝備' });
  for (let i = 0; i < 3; i++) {
    const k = (u.items || [])[i];
    if (k) { const s = el('span', { class: 'tt-us-item1', 'data-tt-tip': 'item:' + k, tabindex: '0', role: 'img', 'aria-label': DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k }); s.style.backgroundImage = `url("${asset("icons/items/" + k + ".webp")}")`; slots.append(s); }
    else slots.append(el('span', { class: 'tt-us-item1 tt-empty', 'aria-hidden': 'true' }));
  }
  wrap.append(slots);
  wrap.append(el('div', { class: 'tt-us-role' }, U.role || ''));
  // 數值 2×5
  const grid = el('div', { class: 'tt-us-stats' });
  for (const d of STAT_DEFS) {
    if (!c || (d.show && !d.show(c))) { grid.append(el('span', { class: 'tt-us-stat tt-empty', 'aria-hidden': 'true' })); continue; }
    grid.append(el('span', { class: 'tt-us-stat', tabindex: '0', 'data-tt-tip': 'stat:' + d.id, 'aria-label': `${d.zh} ${d.val(c)}` }, statIcon(d), el('b', { class: 'tt-num' }, d.val(c))));
  }
  wrap.append(grid);
  // 按鈕
  const btns = el('div', { class: 'tt-us-btns' });
  const more = el('button', { type: 'button', class: 'tt-us-btn', 'data-tt': 'unit-detail' }, '詳情');
  more.addEventListener('click', () => showUnitPanel(u, api));
  btns.append(more);
  if (!enemy) {
    const sell = el('button', { type: 'button', class: 'tt-us-btn tt-sell', 'data-tt': 'unit-sell' }, '賣出 ', el('span', { class: 'tt-num' }, '+' + price));
    sell.addEventListener('click', () => sellUnit(api, u));
    btns.append(sell);
  }
  wrap.append(btns);
  return wrap;
}

function renderUnitSide(root, api) {
  if (!root || !api) return;
  bindApi(api);
  const ui = api.ui || {};
  const r = ui.mode === 'battle' ? null : resolveSel(api);
  if (ui.sel && !r && ui.mode !== 'battle') ui.sel = null;   // 選取的東西不在了
  if (!r) { root.hidden = true; root.replaceChildren(); delete root.dataset.sel; return; }
  root.hidden = false; root.dataset.sel = r.kind; root.classList.add('tt-unitside');
  const node = r.kind === 'sp' ? spSide(api, r) : r.kind === 'item' ? itemSide(api, r) : (r.kind === 'unit' && r.unit.key === ANVIL) ? choiceSide(api, r) : unitSide(api, r);
  root.replaceChildren(node);
  if (!root.__ttGrip) {   // 手機抽屜：點把手或往下滑收起
    root.__ttGrip = true;
    let y0 = null;
    const close = () => { if (api.ui) api.ui.sel = null; api.emit && api.emit('change'); };
    root.addEventListener('pointerdown', (e) => { const g = e.target.closest?.('[data-tt-grip]'); y0 = g ? e.clientY : null; });
    root.addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy > 36 || Math.abs(dy) < 6) close(); });
  }
}

// ---------- 解鎖說明 ----------
function showUnlocks(api) {
  bindApi(api);
  const { DATA } = api;
  const entries = unlockEntries(api);
  if (!unlockOn(api) || !entries.length) {
    return openPanel({ title: '棋子解鎖', body: [el('p', { class: 'tt-desc' }, '這一季沒有要解鎖的棋子。')], footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')] });
  }
  const total = entries.length;
  const doneCount = () => entries.filter(x => api.unlocks.isUnlocked(x.key)).length;
  if (api.ui) { api.ui.unlockNew = false; api.emit && api.emit('change'); }
  const intro = el('ul', { class: 'tt-ul-intro' },
    el('li', {}, `這一季有 ${total} 隻棋子要先達成條件才會進商店。`),
    el('li', {}, '解鎖後的下一次商店，最右邊那格一定是它（一次）。'),
    el('li', {}, '達成一次，這一局就一直有效；每一局重新來過。'),
    el('li', {}, '正式服解鎖後一直不買會變少出現，這裡沒有做。標「推測」的條件官方還沒公布完整數字，PBE 開了會更新。「A 或 B 羈絆的英雄」這類條件是兩個羈絆加起來算，同時有兩個羈絆的英雄只算一次。'));
  let filter = 'all';
  const list = el('div', { class: 'tt-ul-list' });
  const tabs = el('div', { class: 'tt-ul-tabs', role: 'group', 'aria-label': '篩選' });
  const sum = el('p', { class: 'tt-ul-sum', 'aria-live': 'polite' });
  const COSTS = [1, 2, 3, 4, 5, 7];
  const textWithLinks = (ent) => {
    const refs = [...condUnits(ent.cond)].filter(k => DATA.units.byKey[k] && k !== ent.key);
    let parts = [ent.text || '']; 
    for (const k of refs) {
      const zh = DATA.units.byKey[k].zh;
      parts = parts.flatMap(p => (typeof p !== 'string' || !p.includes(zh)) ? [p] : p.split(zh).flatMap((seg, i, a) => {
        if (i === a.length - 1) return [seg];
        const b = el('button', { type: 'button', class: 'tt-ul-ref', 'aria-label': `看 ${zh} 的資料` }, zh);
        b.addEventListener('click', (e) => { e.stopPropagation(); showUnitPanel(k, api); });
        return [seg, b];
      }));
    }
    return parts;
  };
  const row = (ent) => {
    const U = DATA.units.byKey[ent.key];
    const done = api.unlocks.isUnlocked(ent.key);
    const blk = !done ? blockedBy(api, ent.cond) : null;
    const p = unlockProgress(api, ent.key);
    const r = el('div', { class: 'tt-ulrow' + (done ? ' tt-done' : '') + (blk ? ' tt-blocked' : ''), 'data-unit': ent.key, 'data-done': done ? '1' : '0' });
    const name = el('button', { type: 'button', class: 'tt-ul-name', 'aria-label': `${U.zh}，${U.cost} 費，${done ? '已解鎖' : '未解鎖'}，點開看資料` }, U.zh);
    name.addEventListener('click', (e) => { e.stopPropagation(); showUnitPanel(ent.key, api); });
    const tr = el('span', { class: 'tt-ul-traits' }, (U.traits || []).slice(0, 3).map(k => el('span', { class: 'tt-ul-t' }, tIcon(DATA, k, 16), el('small', {}, traitZh(DATA, k)))));
    const tags = [];
    if (ent.local) tags.push(badge('簡化', 'tt-simp'));
    if (ent.guess) tags.push(badge('推測', 'tt-guess'));
    const cond = el('div', { class: 'tt-ul-cond' }, el('p', {}, textWithLinks(ent), ' ', tags),
      ent.local ? el('p', { class: 'tt-ul-local' }, '本頁做法：' + ent.local) : null,
      ent.note ? el('p', { class: 'tt-ul-local' }, '算法：' + ent.note) : null);
    const prog = el('div', { class: 'tt-ul-prog' });
    if (blk) prog.append(el('p', { class: 'tt-ul-block' }, '這一局不能解鎖了（已解鎖另一隻阿卡莉）'));
    else if (p && p.parts && p.parts.length) {
      for (const x of p.parts) prog.append(el('div', { class: 'tt-ul-part' + (x.done ? ' tt-ok' : '') }, el('span', { class: 'tt-ul-chk', 'aria-hidden': 'true' }, x.done ? '✓' : '○'),
        el('span', { class: 'tt-ul-pt' }, x.text || ''), x.need != null && x.need > 1 ? el('span', { class: 'tt-num tt-ul-pn' }, `${nfmt(x.cur)}/${nfmt(x.need)}`) : null));
    } else if (p) {
      const pb = el('div', { class: 'tt-ul-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(p.need), 'aria-valuenow': String(Math.min(p.cur, p.need)) }, el('i'));
      pb.firstChild.style.width = (p.need > 0 ? Math.min(100, p.cur / p.need * 100) : 0) + '%';
      prog.append(pb, el('span', { class: 'tt-num tt-ul-pn' }, `${nfmt(Math.min(p.cur, p.need))}/${nfmt(p.need)}`));
    }
    const rd = api.state?.unlocks?.[ent.key]?.round;
    const status = el('div', { class: 'tt-ul-status' }, done ? `已解鎖${rd != null ? `（第 ${rd} 回合）` : ''}` : (blk ? '不能解鎖' : '未解鎖'));
    r.append(lockedAvatar(DATA, ent.key, 44, !done), el('div', { class: 'tt-ul-main' }, name, tr), cond, prog, status);
    r.addEventListener('click', () => showUnitPanel(ent.key, api));
    return r;
  };
  const draw = () => {
    const shown = entries.filter(x => filter === 'all' || (filter === 'done') === api.unlocks.isUnlocked(x.key));
    const groups = COSTS.map(c => ({ c, rows: shown.filter(x => DATA.units.byKey[x.key].cost === c) })).filter(g => g.rows.length);
    list.replaceChildren(...groups.map(g => el('section', { class: 'tt-ul-group' }, el('h3', { class: 'tt-h' }, `${g.c} 費`, el('small', {}, `${g.rows.length} 隻`)), ...g.rows.map(row))));
    if (!groups.length) list.replaceChildren(el('p', { class: 'tt-desc tt-muted' }, filter === 'done' ? '還沒有解鎖的棋子。' : '全部都解鎖了。'));
    sum.textContent = `已解鎖 ${doneCount()}／${total}`;
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.f === filter));
  };
  for (const [f, zh] of [['all', '全部'], ['todo', '未解鎖'], ['done', '已解鎖']]) {
    const b = el('button', { type: 'button', class: 'tt-ul-tab', 'data-f': f, 'aria-pressed': String(f === filter) }, zh);
    b.addEventListener('click', () => { filter = f; draw(); });
    tabs.append(b);
  }
  draw();
  const off = api.on ? api.on('change', () => { if (list.isConnected) draw(); }) : null;
  return openPanel({ title: '棋子解鎖', body: [intro, el('div', { class: 'tt-ul-bar2' }, tabs, sum), list], cls: 'tt-wide tt-unlocks', onClose: () => { if (typeof off === 'function') off(); },
    footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')] });
}

// ---------- 快捷鍵 ----------
const KEY_ZH = { Space: '空白鍵', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'CapsLock', ShiftLeft: '左 Shift', ShiftRight: '右 Shift' };
function codeLabel(code) {
  if (!code) return '未設定';
  if (KEY_ZH[code]) return KEY_ZH[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return '數字鍵 ' + m[1];
  if (code.startsWith('Numpad')) return '數字鍵 ' + code.slice(6);
  return code;
}
const FIXED_KEY = /^(Escape|Tab|Enter|NumpadEnter|F\d{1,2}|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right|OS.*)|OS(Left|Right)|ContextMenu)$/;
const HK_ACTIONS = [
  { id: 'reroll', zh: '重抽', phase: 'plan', official: true, def: 'KeyD' },
  { id: 'buyXp', zh: '購買經驗值', phase: 'plan', official: true, def: 'KeyF' },
  { id: 'levelUp', zh: '一鍵升級（買到升下一級）', phase: 'plan', official: false, def: null },
  { id: 'lockShop', zh: '鎖住／解鎖商店', phase: 'plan', official: false, def: null },
  { id: 'sell', zh: '賣出（滑鼠指著棋子按）', phase: 'plan', official: true, def: 'KeyE' },
  { id: 'deploy', zh: '上場／回板凳（同上）', phase: 'plan', official: true, def: 'KeyW' },
  { id: 'fight', zh: '戰鬥', phase: 'plan', official: false, def: 'Space' },
  { id: 'speed', zh: '切換戰鬥速度', phase: 'battle', official: false, def: 'Space' },
  { id: 'skip', zh: '跳過戰鬥', phase: 'battle', official: false, def: null },
  ...[1, 2, 3, 4, 5].map(n => ({ id: 'buy' + n, zh: `買商店第 ${n} 格`, phase: 'plan', official: false, def: 'Digit' + n })),
  { id: 'unlocks', zh: '開解鎖說明', phase: 'any', official: false, def: null },
  { id: 'planner', zh: '開關隊伍編輯器', phase: 'any', official: false, def: 'KeyT' },
];
// 包 A 的 api.hotkeys 還沒接上時的備用（同介面、同儲存格式）
let fbHot = null;
function fallbackHotkeys() {
  if (fbHot) return fbHot;
  const KEY = 'trials19.keys';
  const map = Object.fromEntries(HK_ACTIONS.map(a => [a.id, a.def]));
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1 && o.map) for (const k of Object.keys(o.map)) if (k in map) map[k] = o.map[k]; } catch (_) { /* 用預設 */ }
  const subs = [];
  const save = () => { try { const diff = {}; for (const a of HK_ACTIONS) if (map[a.id] !== a.def) diff[a.id] = map[a.id]; localStorage.setItem(KEY, JSON.stringify({ v: 1, map: diff })); } catch (_) { /* 略過 */ } };
  const emit = () => subs.slice().forEach(f => f());
  const overlap = (a, b) => a.phase === b.phase || a.phase === 'any' || b.phase === 'any';
  fbHot = {
    ACTIONS: HK_ACTIONS, __fallback: true,
    get: (id) => map[id] ?? null,
    label: (id) => codeLabel(map[id]),
    actionFor: (code, phase) => (HK_ACTIONS.find(a => map[a.id] === code && (a.phase === phase || a.phase === 'any')) || {}).id ?? null,
    set(id, code) {
      const a = HK_ACTIONS.find(x => x.id === id); if (!a) return { ok: false };
      if (code) {
        if (FIXED_KEY.test(code)) return { ok: false, reason: '這個鍵不能用' };
        const c = HK_ACTIONS.find(b => b.id !== id && map[b.id] === code && overlap(a, b));
        if (c) return { ok: false, conflict: c.id };
      }
      map[id] = code || null; save(); emit(); return { ok: true };
    },
    reset() { for (const a of HK_ACTIONS) map[a.id] = a.def; save(); emit(); },
    onChange(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  };
  return fbHot;
}
const hotkeysOf = (api) => (api && api.hotkeys) || fallbackHotkeys();

function showHotkeys(api) {
  bindApi(api);
  const hk = hotkeysOf(api);
  const actions = hk.ACTIONS || HK_ACTIONS;
  const zhOfAct = (id) => (actions.find(a => a.id === id) || {}).zh || id;
  const PH = { plan: '佈陣時', battle: '戰鬥時', any: '隨時' };
  let recording = null, pending = null, note = '', displaced = new Set();
  const list = el('div', { class: 'tt-hk-list' });
  const msg = el('p', { class: 'tt-hk-msg', role: 'status', 'aria-live': 'polite' });
  const confirmBox = el('div', { class: 'tt-hk-confirm', hidden: true, role: 'alert' });

  const stopRec = () => { recording = null; window.removeEventListener('keydown', onKey, true); document.body.removeAttribute('data-tt-recording'); if (api.ui) api.ui.recording = false; };
  function draw() {
    list.replaceChildren(...actions.map(a => {
      const code = hk.get(a.id);
      const isRec = recording === a.id;
      const keyBtn = el('button', { type: 'button', class: 'tt-hk-key' + (isRec ? ' tt-rec' : '') + (!code ? ' tt-unset' : '') + (displaced.has(a.id) ? ' tt-warn' : ''), 'data-action': a.id,
        'aria-label': `${a.zh}：${isRec ? '請按一個鍵' : code ? codeLabel(code) : '未設定'}，按一下改鍵` }, isRec ? '請按一個鍵…（Esc 取消）' : codeLabel(code));
      keyBtn.addEventListener('click', () => startRec(a.id));
      const clr = el('button', { type: 'button', class: 'tt-hk-clear', 'data-clear': a.id, disabled: !code ? '' : null, 'aria-label': `清除 ${a.zh} 的快捷鍵` }, '清除');
      clr.addEventListener('click', () => { stopRec(); displaced.delete(a.id); hk.set(a.id, null); note = ''; refresh(); });
      return el('div', { class: 'tt-hk-row', 'data-row': a.id },
        el('span', { class: 'tt-hk-name' }, a.zh, ' ', el('small', {}, PH[a.phase] || ''), a.official ? badge('官方預設', 'tt-official') : null), keyBtn, clr);
    }));
    msg.textContent = note;
  }
  const refresh = () => { draw(); };
  function startRec(id) {
    stopRec(); pending = null; confirmBox.hidden = true; note = '';
    recording = id; document.body.setAttribute('data-tt-recording', '1'); if (api.ui) api.ui.recording = true;
    window.addEventListener('keydown', onKey, true);
    draw();
  }
  function onKey(e) {
    if (!recording) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') { stopRec(); draw(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || FIXED_KEY.test(e.code)) { note = '這個鍵不能用（Esc、Tab、Enter、F1–F12 和含 Ctrl／Alt／Meta 的組合都不行）。'; draw(); return; }
    const id = recording; const code = e.code;
    const r = hk.set(id, code);
    if (r && r.ok) { displaced.delete(id); stopRec(); note = ''; draw(); return; }
    if (r && r.conflict) {
      stopRec(); pending = { id, code, other: r.conflict };
      confirmBox.replaceChildren(el('p', {}, `${codeLabel(code)} 已經是「${zhOfAct(r.conflict)}」。要改給「${zhOfAct(id)}」嗎？「${zhOfAct(r.conflict)}」會變成未設定。`),
        el('div', { class: 'tt-hk-cbtns' },
          el('button', { type: 'button', class: 'tt-btn', 'data-tt': 'hk-swap', onclick: () => {
            const p = pending; pending = null; confirmBox.hidden = true;
            hk.set(p.other, null); const rr = hk.set(p.id, p.code);
            displaced.add(p.other); if (rr && rr.ok) displaced.delete(p.id);
            note = ''; draw();
          } }, '換過來'),
          el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'hk-cancel', onclick: () => { pending = null; confirmBox.hidden = true; } }, '取消')));
      confirmBox.hidden = false; draw();
      confirmBox.querySelector('button')?.focus();
      return;
    }
    note = '這個鍵不能用（Esc、Tab、Enter、F1–F12 和含 Ctrl／Alt／Meta 的組合都不行）。'; draw();
  }
  draw();
  const off = hk.onChange ? hk.onChange(() => { if (list.isConnected) draw(); api.emit && api.emit('change'); }) : null;
  // 音量
  const vol = el('div', { class: 'tt-hk-vol' });
  if (AU.getVolume && AU.setVolume) {
    const sl = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round((AU.getVolume() ?? 0.5) * 100)), 'aria-label': '音量' });
    const out = el('span', { class: 'tt-num' }, sl.value + '%');
    sl.addEventListener('input', () => { AU.setVolume(Number(sl.value) / 100); out.textContent = sl.value + '%'; });
    sl.addEventListener('change', () => sfx('buy'));
    vol.append(el('label', {}, '音量'), sl, out);
    // 頁首音效面板調了音量，這裡跟著動
    if (AU.onAudioChange) { const off2 = AU.onAudioChange(() => { if (!sl.isConnected) { off2(); return; } const v = String(Math.round(AU.getVolume() * 100)); if (sl.value !== v) { sl.value = v; out.textContent = v + '%'; } }); }
  }
  const reset = el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'hk-reset', onclick: () => { stopRec(); displaced = new Set(); pending = null; confirmBox.hidden = true; note = ''; hk.reset(); draw(); } }, '還原預設');
  return openPanel({ title: '快捷鍵設定', cls: 'tt-wide tt-hotkeys', onClose: () => { stopRec(); if (typeof off === 'function') off(); },
    body: [vol.children.length ? vol : null, el('p', { class: 'tt-desc tt-muted' }, '按一下鍵名，再按你想用的鍵。會記在這台裝置上。'), confirmBox, list, msg].filter(Boolean),
    footer: [reset, el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')] });
}

// ---------- 說明 ----------
const augOnOf = (api) => { const a = api && api.DATA && api.DATA.rules && api.DATA.rules.augment; return !a || a.enabled !== false; };   // 增幅總開關（rules.json augment.enabled）
function showHelp(opts = {}) {
  const api = opts.api || curApi;
  const hk = hotkeysOf(api);
  const L = (id) => { try { return hk.label(id); } catch (_) { return '?'; } };
  const sec = (title, ...kids) => el('div', {}, el('h3', { class: 'tt-h' }, title), ...kids);
  const secD = (title, ...kids) => el('div', { class: 'tt-only-desktop' }, el('h3', { class: 'tt-h' }, title), ...kids);   // 手機沒有鍵盤，整段不顯示
  const body = [
    el('ol', { class: 'tt-ol' }, el('li', {}, '一共 30 回合，每 5 回合有一隻頭目（共 6 隻）。'), el('li', {}, '有 3 條命，輸一場扣 1 條，沒命就結束。'), el('li', {}, '沒有計時，準備好再按「戰鬥」。')),
    !augOnOf(api) ? null : sec('增幅怎麼出',
      el('p', { class: 'tt-desc' }, '一場三個增幅：第 2、11、21 回合，對應正式遊戲的 2-1、3-2、4-2。'),
      el('p', { class: 'tt-desc' }, '稀有度跟正式遊戲一樣是開局就抽好一整組，機率照官方的表。最常見是金金金（兩成），開局就彩色大概一成，三個全彩不到 1%。'),
      el('p', { class: 'tt-desc' }, '每個增幅有自己會出現的階段。給錢、給經驗、給棋子的大多只在第一個出，打架用的數值大多在後面兩個。所以加速開始、銀湯匙這種第 11 回合之後就不會再看到。'),
      el('p', { class: 'tt-desc' }, '每張可以免費換一次，只換那一張。')),
    sec('星級',
      el('p', { class: 'tt-desc' }, '棋子頭上的星星就是星級：', starsEl(1), ' 1 星銅、', starsEl(2), ' 2 星銀、', starsEl(3), ' 3 星金；2 星銀框、3 星金框。')),
    sec('操作',
      el('ul', { class: 'tt-ul-plain' },
        el('li', {}, '點商店卡就買；滑鼠停在卡片上會跳出技能說明（手機是長按，放開不會買）。'),
        el('li', {}, '點棋子是「選取」，右邊會出現資訊。點另一隻就改選，點空白處就取消。點棋子不會換位子。'),
        el('li', {}, '要換位子只能用拖的：拖到空格是移動，拖到有棋子的格子是兩隻交換，拖到商店就是賣掉。'),
        el('li', {}, '點裝備會選起來、右邊出現說明，這時再點一隻棋子就裝上去；用拖的也可以。黃金卸除器和其他道具一樣，點一下再點棋子。右鍵跟左鍵一樣，是選取。'),
        el('li', {}, '裝備欄旁邊有兩種特殊道具：黃金卸除器（每局 1 個，拖到有裝備的棋子身上，把裝備全卸回裝備欄）、心鋼最愛（心鋼之聲 3 階給 1 個、5 階再給 1 個，拖到心鋼之聲成員身上就是選他強化技能，佈陣時可以從一位拖到另一位改選）。'),
        augOnOf(api) ? el('li', {}, '選增幅時，每一張下面都有自己的重抽鍵，按了只換那一張。') : null,
        el('li', {}, '用鍵盤的話：Tab 選到棋子按 Enter 是選取，賣出用 ' + L('sell') + '、上場／下場用 ' + L('deploy') + '，這兩個都是滑鼠指著那隻棋子按，跟選取的是誰無關；手機沒有游標，賣出請按右側面板裡的「賣出」鍵。場上換格子沒有鍵盤的做法，只能用滑鼠或手指拖。'))),
    sec('裝備合成、開戰補位、人口超出',
      el('ul', { class: 'tt-ul-plain' },
        el('li', {}, '裝備欄裡兩件散件可以直接合：拖一件到另一件上面，旁邊會跳出「會合成：○○」，停滿 0.5 秒（目標格會繞一圈倒數）再放開，就合成了，成品放在你放的那一格。不到 0.5 秒放開就什麼都不會發生；成品或配不出來的組合不會有提示。手機一樣用手指拖著不放。'),
        el('li', {}, '按開戰的時候，如果場上人口還沒放滿，會自動從板凳最左邊的棋子開始補上場，補到滿或板凳沒人為止（升級當下不會動你的棋子）。位置：坦克、鬥士放前排（從最前面一排、由中間往兩邊找空格），施法者、射手、刺客這些放後排（從最後面一排找起），查不到定位的放最前排最左邊的空格；放不下的 2 人口棋子會跳過，換下一隻。'),
        el('li', {}, (augOnOf(api) ? '選獎勵、增幅、頭目獎勵' : '選獎勵、頭目獎勵') + '拿到棋子，但板凳滿了，不會直接賣掉，會先放到場上，人口可以超過上限，超出的那隻會標「超出人口」。佈陣時只要板凳空出一格（賣掉、合星、拖下場都算），超出的棋子就自動跳回板凳，最後放上去的先跳。'),
        el('li', {}, '按「戰鬥」的時候場上還是超出人口：先試著移回板凳，板凳放不下才自動賣掉（照賣出價給錢，畫面會告訴你賣了誰）。商店買棋子還是要有板凳空格，這點沒變。三張一樣的合星，場上加板凳一起算。'),
        el('li', {}, '滑鼠停在左邊的羈絆上，場上、板凳屬於它的棋子會亮起金框（其他的變暗），商店裡有這個羈絆的卡片也會亮、羈絆圖示發光。點羈絆的文字會固定亮著（手機也一樣，再點一次或點空白處取消）；點左邊的圖示才是羈絆說明。滑鼠停在羈絆面板、圖鑑、解鎖清單、隊伍編輯器裡的棋子頭像上，會直接跳出他的羈絆跟技能（手機長按），不用再點一下。'))),
    sec('ILLBEATS 混音器',
      el('p', { class: 'tt-desc' }, 'ILLBEATS 啟動後，畫面右邊（手機是敵方列右邊的「混音器」頁籤）會出現混音器，跟官方一樣有四條推桿：攻擊、法強、生命、擊殺金幣機率。'),
      el('ul', { class: 'tt-ul-plain' },
        el('li', {}, '每 1 分貝一格，拖推桿（或選中推桿按上下鍵）就會即時換算成數值。總量上限：2 人 10、3 人 14、4 人 18 分貝，用完了就推不上去，要先把別條拉下來。'),
        el('li', {}, '右邊的總量計是「已用／上限」，RESET 全部歸零。ATTACK 兩顆是「攻擊＋金幣」、MAGIC 兩顆是「法強＋生命」，一鍵套用，套完還能再微調。預設鍵的比例是推測。'),
        el('li', {}, '佈陣時隨時能調，開戰後鎖住，下一回合才能再改。羈絆掉階、上限變小時，多出來的分貝會從你最後調的那一條扣回去。'),
        el('li', {}, 'ILLBEATS 成員拿全額，其他隊友拿 50%；4 人那階混音再強化 50%。沒分配就開戰是 0 加成，開戰前會提醒你。'),
        el('li', {}, '每分貝換多少是從官方混音器截圖反推的，標「推測」：攻擊約 2.16%、生命約 1.76%、法強 2 點、擊殺拿 1 金的機率 2%（4 人那階再乘 1.5）。金幣只算最後一擊，官方是參與擊殺。')),
      ),
    sec('隊伍編輯器',
      el('p', { class: 'tt-desc' }, '頁首的「隊伍編輯器」（快捷鍵 ' + L('planner') + '）可以先排好你想湊的隊伍，最多 25 隻，換局也還在。'),
      el('ul', { class: 'tt-ul-plain' },
        el('li', {}, '左鍵點棋子加入（目標 2 星），再點一次改成 3 星，再點回 2 星。右鍵是移出。手機點一下加入、長按移出。'),
        el('li', {}, '商店裡出現你要的棋子，會有金框和書籤。你場上加板凳已經有 2 星（目標 3 星就要有 3 星）就不再標，編輯器裡那隻會變暗打勾；賣掉了又會標回來。'),
        el('li', {}, '「看圖匯入」可以貼截圖（Ctrl+V）或選圖，認出頭像讓你確認再加。對戰畫面的 3D 模型認不出來，請截隊伍編輯器或陣容頁。圖片只在你的瀏覽器裡處理，不會上傳。'))),
    sec('音效',
      el('p', { class: 'tt-desc' }, '頁首的「音效」鍵點開可以調音量、靜音，快捷鍵面板裡的滑桿是同一個。')),
    secD('快捷鍵（桌機）', el('div', { class: 'tt-keys' },
      ...[[L('reroll'), '重抽'], [L('buyXp'), '購買經驗值'], [L('levelUp'), '一鍵升級（等級旁邊的「升 N 級」鍵；預設沒綁，可以自己設）'], [L('sell'), '滑鼠指著棋子按，賣掉那一隻'], [L('deploy'), '滑鼠指著棋子按，上場／回板凳'],
        [[1, 2, 3, 4, 5].map(n => L('buy' + n)).join(' '), '買商店第 1–5 格'],
        [L('fight') + '（戰鬥中：' + L('speed') + '）', '開戰；戰鬥中切換速度'], [L('planner'), '開關隊伍編輯器'], ['Esc', '關面板、取消選取']]
        .flatMap(([k, d]) => [el('kbd', {}, k), el('span', {}, d)])),
      api ? el('p', { class: 'tt-only-desktop' }, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'open-hotkeys', onclick: () => showHotkeys(api) }, '設定快捷鍵')) : null),
  ];
  if (api && unlockOn(api)) {
    const n = unlockEntries(api).length;
    body.push(sec('解鎖',
      el('p', { class: 'tt-desc', style: 'margin:0 0 8px' }, `這一季有 ${n} 隻棋子一開始是鎖住的，要先達成條件才會進商店。解鎖的那一下，下一次商店最右邊那格一定是它。每一局重新來過。`),
      el('p', { style: 'margin:0' }, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'open-unlocks', onclick: () => showUnlocks(api) }, '看每隻怎麼解鎖'))));
  }
  body.push(
    el('div', { class: 'tt-notice' }, '這是站上自己做的練習版，不是官方模式。數值照 PBE 11/20 的版本，少數羈絆還是簡化或推測，點羈絆可以看本頁的做法。'),
    el('p', { class: 'muted', style: 'margin:0;font-size:var(--fs-s)' }, '名稱照 PBE 官方繁中，官方還沒翻的先用暫譯。'),
    el('p', { class: 'muted', style: 'margin:0;font-size:var(--fs-s)' }, '非官方重製｜數值照 PBE 現在的版本（11/20），PBE 每天改，會再更新'),
    opts.onRestart ? el('div', {}, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'restart', onclick: (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '真的要重來？目前進度會不見，再按一次'; return; }
      closePanels(); opts.onRestart();
    } }, '重新開始')) : null);
  return openPanel({ title: '說明', body: body.filter(Boolean), footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { try { localStorage.setItem('trials19.helpSeen', '1'); } catch (_) {} closeAll(); } }, '知道了')], cls: opts.cls || '' });
}

// 首次進入自動跳說明（U1 的 layout 可在 mount 後呼叫一次）
function maybeShowHelpFirst() {
  try { if (localStorage.getItem('trials19.helpSeen')) return null; } catch (_) {}
  if (!curApi) { setTimeout(() => { if (!hasPanel()) showHelp(); }, 0); return null; }
  return showHelp();
}

return {get bindApi(){return bindApi;},get playerTraitsOf(){return playerTraitsOf;},get PANEL_CSS(){return PANEL_CSS;},get closeAll(){return closeAll;},get closePanels(){return closePanels;},get hasPanel(){return hasPanel;},get showTraitPanel(){return showTraitPanel;},get combatantFor(){return combatantFor;},get showUnitPanel(){return showUnitPanel;},get showCodex(){return showCodex;},get showAugmentInfo(){return showAugmentInfo;},get showAugmentChoice(){return showAugmentChoice;},get showReward(){return showReward;},get showBossIntro(){return showBossIntro;},get showResult(){return showResult;},get hideResultBanner(){return hideResultBanner;},get showResultBanner(){return showResultBanner;},get showGameOver(){return showGameOver;},get isLocked(){return isLocked;},get lockedAvatar(){return lockedAvatar;},get unlockTipNodes(){return unlockTipNodes;},get sellUnit(){return sellUnit;},get enemyTraitsOf(){return enemyTraitsOf;},get statTipInfo(){return statTipInfo;},get renderUnitSide(){return renderUnitSide;},get showUnlocks(){return showUnlocks;},get codeLabel(){return codeLabel;},get hotkeysOf(){return hotkeysOf;},get showHotkeys(){return showHotkeys;},get showHelp(){return showHelp;},get maybeShowHelpFirst(){return maybeShowHelpFirst;},get openPanel(){return openPanel;}};})();
mods.shopbar=(()=>{let el,avatarEl,styleAvatar,zhOf,costOf,starsEl,traitIcon,traitZh,levelUpCost;bind.push(()=>{el=mods.board.el;avatarEl=mods.board.avatarEl;styleAvatar=mods.board.styleAvatar;zhOf=mods.board.zhOf;costOf=mods.board.costOf;starsEl=mods.board.starsEl;traitIcon=mods.traitbar.traitIcon;traitZh=mods.traitbar.traitZh;levelUpCost=mods.game.levelUpCost;});
// 商店上緣 HUD（等級條、機率、金幣頁籤、連勝、人口）＋商店本體（左：買經驗／重抽；右：5 張卡）。SPEC 2.3、2.4。
// 買、刷新等動作一律走 api.act；卡片點擊與拖曳由 input.js／dnd.js 接（desc：shop:<slot>）。



const COST_NAMES = ['1費', '2費', '3費', '4費', '5費'];
const SHAPES = ['●', '■', '▲', '◆', '⬟'];   // 形狀不同，不只靠顏色
const COIN = asset("img/ui/gold_coin.webp");

const coin = (cls = '') => el('img', 'tt-coin ' + cls, { src: COIN, alt: '', 'aria-hidden': 'true', draggable: 'false' });
const hk = (api, action, def) => { try { const l = api.hotkeys && api.hotkeys.label(action); return l || def; } catch (_) { return def; } };

// 場上＋板凳同名棋子的「等值張數」（1★=1、2★=3、3★=9）與各星級張數
function ownedOf(state, key) {
  const n = { 1: 0, 2: 0, 3: 0 };
  for (const u of [...(state.board || []), ...(state.bench || [])]) if (u && u.key === key) n[u.star] = (n[u.star] || 0) + 1;
  return { n, equiv: n[1] + n[2] * 3 + n[3] * 9 };
}
const haveText = (own) => '已有 ' + [3, 2, 1].filter(st => own.n[st]).map(st => `${st} 星 ${own.n[st]} 隻`).join('、');
// 再買這張會不會合星：回傳合成後的星級（2 或 3），沒有回 0
function mergeStar(state, key) {
  const { n } = ownedOf(state, key);
  if (n[1] >= 2) return n[2] >= 2 ? 3 : 2;
  return 0;
}

// 買了（上場）會讓哪些羈絆升階
function upgradeSet(api, key) {
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

function oddsRow(DATA, level) {
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
function renderHud(root, api) {
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
    el('img', 'tt-popic', { src: asset("img/ui/population.webp"), alt: '', 'aria-hidden': 'true', draggable: 'false' }), el('b', 'tt-num', {}, `${used}/${max}`));
  // 站主 2026-11-16「加個一鍵升等的功能」：一次買到升下一級（錢不夠升一級就不買）
  let lvup = null;
  const lc = maxed ? null : levelUpCost(s, DATA);
  if (lc) {
    const poor = s.gold < lc.gold, key = hk(api, 'levelUp', '');
    lvup = el('button', 'tt-hud-lvup' + (poor ? ' tt-poor' : ''), {
      type: 'button', 'data-tt-noclear': '',
      'data-tt-tip': 'text:' + `一鍵升到 ${lc.to} 級：連買 ${lc.buys} 次經驗，共 ${lc.gold} 金` + (poor ? `（還差 ${lc.gold - s.gold} 金）` : '') + (key && key !== '未設定' ? `。快捷鍵 ${key}` : '。快捷鍵可以在設定裡指定'),
      'aria-label': `一鍵升到 ${lc.to} 級，${lc.gold} 金`,
    }, el('span', 'tt-lvup-ar', { 'aria-hidden': 'true' }, '⏫'), el('b', '', {}, `升 ${lc.to} 級`), coin('tt-sm'), el('span', 'tt-num', {}, lc.gold));
    lvup.addEventListener('click', () => api.act('levelUp'));
  }
  // 站主 2026-11-17「商店要可以鎖」
  const lk = !!s.shopLocked, lkKey = hk(api, 'lockShop', '');
  const lock = el('button', 'tt-hud-lock' + (lk ? ' tt-on' : ''), { type: 'button', 'data-tt-noclear': '', 'aria-pressed': String(lk),
    'aria-label': lk ? '商店已鎖住，下回合不換；點一下解鎖' : '鎖住商店：下回合不換商店',
    'data-tt-tip': 'text:' + (lk ? '商店鎖住了：下回合開始不會換掉這排，用過一次自動解鎖。點一下解鎖。' : '鎖住商店：下回合開始不會換掉這排（重抽還是可以）。') + (lkKey && lkKey !== '未設定' ? `快捷鍵 ${lkKey}` : '') });
  lock.innerHTML = lk
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1.500A1.500 1.500 0 0 1 20 11.500v9A1.500 1.500 0 0 1 18.500 22h-13A1.500 1.500 0 0 1 4 20.500v-9A1.500 1.500 0 0 1 5.500 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 10h9.500A1.500 1.500 0 0 1 20 11.500v9A1.500 1.500 0 0 1 18.500 22h-13A1.500 1.500 0 0 1 4 20.500v-9A1.500 1.500 0 0 1 5.500 10H7V7a5 5 0 0 1 9.600-1.900l-1.850.760A3 3 0 0 0 9 7v3z"/></svg>';
  lock.addEventListener('click', () => api.act('lockShop'));
  root.replaceChildren(...[lvl, lvup, odds, gold, streak, lock, pop].filter(Boolean));
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
  // 隊伍編輯器裡要的、還沒達成的：金色外框＋右上角書籤
  const PL = api.planner;
  const wantStar = PL && api.ownedUnits && PL.wants(key, api.ownedUnits()) ? PL.starOf(key) : 0;
  if (wantStar) {
    card.classList.add('tt-want');
    const bm = el('span', 'tt-wantmark', { 'aria-hidden': 'true', title: `隊伍編輯器要的（目標 ${wantStar} 星）`, 'data-star': wantStar });
    bm.innerHTML = '<svg viewBox="0 0 24 30" focusable="false"><path d="M3 1h18a1 1 0 0 1 1 1v25.500a.8.8 0 0 1-1.300.6L12 21l-8.700 7.100A.8.8 0 0 1 2 27.500V2a1 1 0 0 1 1-1z"/></svg>';
    card.append(bm);
  }
  if (ms) card.classList.add('tt-merge');
  card.setAttribute('aria-label', `商店第 ${i + 1} 格：${zhOf(DATA, key)}，${cost} 費，${cost} 金` + (slot.fresh ? '，新解鎖' : '') + (own.equiv ? `，${haveText(own)}` : '') + (ms ? `，買了可升 ${ms} 星` : '') + (wantStar ? `，隊伍編輯器要的，目標 ${wantStar} 星` : ''));
  return card;
}

function renderShop(root, api) {
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
    btn('tt-xpbtn', '購買經驗值', maxed ? null : xpCost, asset("img/ui/buyxp.webp"), () => api.act('buyXp'), maxed || state.gold < xpCost, hk(api, 'buyXp', 'F')),
    btn('tt-rrbtn', '重抽', rrCost, asset("img/ui/reroll.webp"), () => api.act('reroll'), state.gold < rrCost, hk(api, 'reroll', 'D')));
  const cards = el('div', 'tt-cards', { role: 'group', 'aria-label': '商店' });
  (state.shop || []).forEach((slot, i) => {
    if (!slot) { cards.append(el('div', 'tt-card tt-empty', { 'aria-hidden': 'true' })); return; }
    cards.append(cardEl(api, slot, i));
  });
  const wrap = el('div', 'tt-shopin' + (state.shopLocked ? ' tt-shop-locked' : ''), {}, left, cards);
  root.replaceChildren(wrap);
  // 戰鬥鍵上的快捷鍵小字
  const g = document.querySelector('.tt-go .tt-hk');
  if (g) g.textContent = hk(api, 'fight', '空白鍵');
}

return {get ownedOf(){return ownedOf;},get mergeStar(){return mergeStar;},get upgradeSet(){return upgradeSet;},get oddsRow(){return oddsRow;},get renderHud(){return renderHud;},get renderShop(){return renderShop;}};})();
mods.settings=(()=>{
// 戰鬥畫面特效的設定：畫面震動（開／關）、特效品質（高／低）。存在 localStorage，頁首「音效」面板旁有開關。
// 預設：震動開（幅度小）、品質高；手機寬（≤600px）預設低。prefers-reduced-motion 時震動、粒子、拖尾一律關。
const K_SHAKE = 'trials19.fxShake', K_Q = 'trials19.fxQuality';
const subs = new Set();
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
const mem = {};
const get = (k) => { const s = ls(); try { const v = s ? s.getItem(k) : null; return v != null ? v : (k in mem ? mem[k] : null); } catch (_) { return mem[k] ?? null; } };
const put = (k, v) => { mem[k] = v; const s = ls(); try { if (s) s.setItem(k, v); } catch (_) { /* 無痕模式：只在這次有效 */ } };

const isPhone = () => typeof innerWidth === 'number' && innerWidth <= 600;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function getShake() { const v = get(K_SHAKE); return v == null ? true : v === '1'; }
function getQuality() { const v = get(K_Q); return v === 'high' || v === 'low' ? v : (isPhone() ? 'low' : 'high'); }
function setShake(on) { put(K_SHAKE, on ? '1' : '0'); subs.forEach((f) => f()); }
function setQuality(q) { put(K_Q, q === 'low' ? 'low' : 'high'); subs.forEach((f) => f()); }
function onFxSettings(f) { subs.add(f); return () => subs.delete(f); }

return {get isPhone(){return isPhone;},get reducedMotion(){return reducedMotion;},get getShake(){return getShake;},get getQuality(){return getQuality;},get setShake(){return setShake;},get setQuality(){return setQuality;},get onFxSettings(){return onFxSettings;}};})();
mods.stage=(()=>{let getShake,getQuality,reducedMotion,isPhone;bind.push(()=>{getShake=mods.settings.getShake;getQuality=mods.settings.getQuality;reducedMotion=mods.settings.reducedMotion;isPhone=mods.settings.isPhone;});
// 戰鬥特效舞台（SPEC_ABILITY_FX 第 4 章）：兩張 canvas（地面層、空中層）＋粒子池＋投射物＋場上物件。
// 只負責「畫」：不重算任何戰鬥，不碰引擎。畫面用的亂數都在這裡（rnd），跟戰鬥亂數無關。
// 上限：粒子 150（手機寬 ≤600px 用 80）、投射物 40、場上物件 24、一次性特效 24；超過就丟最舊的（投射物／物件不丟，改畫簡單圓點）。

const TAU = Math.PI * 2;
const rnd = Math.random;   // 只影響畫面
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// ---------- 顏色 ----------
const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  let h = String(hex || '#ffd24a').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}
const css = (hex, a) => { const [r, g, b] = rgb(hex); return a == null || a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a < 0 ? 0 : a})`; };
function mix(a, b, t) { const x = rgb(a), y = rgb(b); return '#' + [0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join(''); }
const glowCache = new Map();
function glowSprite(hex) {
  let g = glowCache.get(hex);
  if (g) return g;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, css(hex, 1)); gr.addColorStop(0.35, css(hex, 0.55)); gr.addColorStop(1, css(hex, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowCache.set(hex, c);
  return c;
}
function glow(c, x, y, r, hex, a) { if (r <= 0.5) return; c.globalAlpha = clamp(a, 0, 1); c.drawImage(glowSprite(hex), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }

// ---------- 投射物圖形 ----------
const BASE = { orb: 'orb', ball: 'orb', pinball: 'orb', moon: 'orb', prism: 'orb', heart: 'heart', bolt: 'bolt', bullet: 'bolt', laser: 'bolt', spike: 'bolt', spear: 'bolt', arrow: 'bolt', blade: 'bolt',
  disc: 'disc', card: 'card', bomb: 'bomb', rocket: 'bomb', missile: 'bomb', mushroom: 'bomb', snack: 'bomb', rock: 'rock', feather: 'feather', ribbon: 'feather', note: 'note',
  wave: 'wave', gust: 'wave', dragon: 'wave', web: 'web', spirit: 'spirit', clone: 'clone' };

function drawHeart(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y, x - s * 0.7, y - s * 1.1, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9);
  c.closePath(); c.fill();
}

function createStage(root, env) {
  const under = document.createElement('canvas'), over = document.createElement('canvas');
  under.className = 'tt-bt-fx tt-bt-fx-under'; over.className = 'tt-bt-fx tt-bt-fx-over';
  under.setAttribute('aria-hidden', 'true'); over.setAttribute('aria-hidden', 'true');
  root.prepend(under); root.appendChild(over);
  const cu = under.getContext('2d'), co = over.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const S = { under, over, now: 0, level: 0, enabled: true, reduced: reducedMotion() };

  const limits = () => ({ part: isPhone() ? 80 : 150, proj: 40, obj: 24, fx: 24 });
  let LIM = limits();
  const P = Array.from({ length: 150 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 1, size: 3, col: '#fff', shape: 0, rot: 0, vr: 0, drag: 0, add: true }));
  let pLive = 0, pCur = 0;
  const fxs = [], objs = [], projs = [], timers = [];
  let drewLast = false;

  S.resize = () => {
    W = env.W(); H = env.H();
    dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    for (const cv of [under, over]) { cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr)); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    cu.setTransform(dpr, 0, 0, dpr, 0, 0); co.setTransform(dpr, 0, 0, dpr, 0, 0);
    LIM = limits();
  };
  S.resize();

  // 品質：高／低＋自動降級（level 1：關拖尾、粒子減半；level 2：只留投射物、場上物件、地面、光束）
  const eff = () => Math.max(S.level, getQuality() === 'low' ? 1 : 0);
  S.eff = eff;
  S.cnt = (n) => { const e = eff(); const sp = env.speed() >= 4 ? 0.5 : 1; return Math.max(1, Math.round(n * (e >= 1 ? 0.5 : 1) * sp)); };
  S.trailOn = () => !S.reduced && eff() === 0 && env.speed() < 4;
  const ESS = new Set(['proj', 'ground', 'beam', 'zone', 'roller', 'telegraph', 'chan', 'obj']);
  const RM = new Set(['proj', 'ground', 'beam', 'telegraph', 'zone', 'roller']);   // 減少動態時只留靜態、看得懂的
  S.allow = (name) => S.enabled && (S.reduced ? RM.has(name) : (eff() < 2 || ESS.has(name)));
  S.slow = () => (env.speed() >= 4 ? 0.5 : 1);   // 4 倍速：一次性特效時間除以 2

  // ---------- 粒子 ----------
  S.part = (x, y, vx, vy, o) => {
    if (S.reduced || !S.enabled) return false;
    if (pLive >= LIM.part) return false;
    for (let k = 0; k < P.length; k++) {
      const p = P[(pCur + k) % P.length];
      if (p.on) continue;
      pCur = (pCur + k + 1) % P.length;
      p.on = true; pLive++;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.age = 0; p.life = o.life || 500; p.size = o.size || 3; p.col = o.col || '#fff';
      p.shape = o.shape || 0; p.rot = o.rot || 0; p.vr = o.vr || 0; p.g = o.g || 0; p.drag = o.drag || 0; p.add = o.add !== false;
      return true;
    }
    return false;
  };
  S.partCount = () => pLive;

  // ---------- 計時 ----------
  S.after = (ms, fn) => { if (ms <= 0) { fn(); return; } timers.push({ at: S.now + ms, fn }); };

  // ---------- 一次性特效 ----------
  S.add = (layer, dur, draw, extra) => {
    if (!S.enabled) return null;
    const e = Object.assign({ layer, t0: S.now, dur: Math.max(30, dur), draw }, extra);
    if (fxs.length >= LIM.fx) fxs.shift();
    fxs.push(e);
    return e;
  };
  S.addObj = (o) => {
    if (!S.enabled) return null;
    if (objs.length >= LIM.obj) { const i = objs.findIndex((x) => !x.keep); objs.splice(i < 0 ? 0 : i, 1); }
    o.t0 = S.now; o.on = true; objs.push(o); return o;
  };
  S.removeObj = (o) => { if (o) o.on = false; };
  S.objs = () => objs;

  // 投射物：simple＝降級成圓點（不畫拖尾）
  S.proj = (o) => {
    if (!S.enabled) { if (o.arrive) o.arrive(); return null; }
    if (projs.length >= LIM.proj) { const old = projs.shift(); if (old && old.arrive) old.arrive(); }
    o.t0 = S.now; o.on = true; o.tr = o.tr || []; projs.push(o); return o;
  };

  S.clear = () => {
    for (const p of P) p.on = false; pLive = 0;
    fxs.length = 0; objs.length = 0; projs.length = 0; timers.length = 0;
    cu.clearRect(0, 0, W, H); co.clearRect(0, 0, W, H); drewLast = false;
  };
  S.projN = () => projs.length;
  S.busy = () => fxs.length + objs.length + projs.length + pLive + timers.length;

  // ---------- 逐幀 ----------
  let fAcc = 0, fN = 0;
  S.step = (dtReal) => {
    const dt = Math.min(dtReal, 64);
    if (dtReal > 0) {   // 連續 30 幀平均超過 22ms：降一級
      fAcc += dtReal; fN++;
      if (fN >= 30) { if (fAcc / fN > 22 && S.level < 2) S.level++; fAcc = 0; fN = 0; }
    }
    S.now += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= S.now) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
    // 物理
    for (const p of P) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; pLive--; continue; }
      const s = dt / 1000;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * s); p.vx *= k; p.vy *= k; }
      p.vy += p.g * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
    }
    for (let i = fxs.length - 1; i >= 0; i--) if (S.now - fxs[i].t0 >= fxs[i].dur) { const e = fxs[i]; fxs.splice(i, 1); if (e.done) e.done(); }
    for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if (!o.on || (o.until && S.now >= o.until)) { objs.splice(i, 1); if (o.done) o.done(o); } }
    for (let i = projs.length - 1; i >= 0; i--) {
      const q = projs[i], p = (S.now - q.t0) / q.dur;
      const tp = q.follow ? env.pos(q.follow) : null;
      if (tp) { q.x1 = tp.x; q.y1 = tp.y; }
      if (q.on) {
        const k = clamp(p, 0, 1);
        q.x = lerp(q.x0, q.x1, k); q.y = lerp(q.y0, q.y1, k);
        if (q.arc) q.h = Math.sin(Math.PI * k) * Math.min(Math.hypot(q.x1 - q.x0, q.y1 - q.y0) * 0.45, env.w() * 2.4);
        else q.h = 0;
        if (S.trailOn()) { q.tr.push(q.x, q.y - q.h); if (q.tr.length > 14) q.tr.splice(0, 2); }
      }
      if (p >= 1 || !q.on) { projs.splice(i, 1); q.on = false; if (q.arrive) { try { q.arrive(); } catch (e) { console.error(e); } } }
    }
    for (const o of objs) if (o.upd) o.upd(o, dt, S.now);
    S.draw();
  };

  S.draw = () => {
    const any = fxs.length || objs.length || projs.length || pLive;
    if (!any) { if (drewLast) { cu.clearRect(0, 0, W, H); co.clearRect(0, 0, W, H); drewLast = false; } return; }
    drewLast = true;
    cu.clearRect(0, 0, W, H); co.clearRect(0, 0, W, H);
    for (const o of objs) if (o.drawU) { cu.save(); o.drawU(cu, o, S.now); cu.restore(); }
    for (const e of fxs) if (e.layer === 'u') { cu.save(); e.draw(cu, clamp((S.now - e.t0) / e.dur, 0, 1), e); cu.restore(); }
    for (const e of fxs) if (e.layer === 'o') { co.save(); e.draw(co, clamp((S.now - e.t0) / e.dur, 0, 1), e); co.restore(); }
    for (const o of objs) if (o.drawO) { co.save(); o.drawO(co, o, S.now); co.restore(); }
    for (const q of projs) { co.save(); drawProj(co, q); co.restore(); }
    // 粒子
    if (pLive) {
      co.globalCompositeOperation = 'lighter';
      for (const p of P) {
        if (!p.on) continue;
        const k = p.age / p.life, a = 1 - k * k;
        if (p.shape === 0) glow(co, p.x, p.y, p.size * (1.6 - k * 0.6), p.col, a);
        else {
          co.globalAlpha = clamp(a, 0, 1); co.fillStyle = css(p.col); co.strokeStyle = css(p.col);
          if (p.shape === 1) { co.lineWidth = Math.max(1, p.size * 0.5); co.beginPath(); co.moveTo(p.x, p.y); co.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); co.stroke(); }
          else if (p.shape === 2) { co.save(); co.translate(p.x, p.y); co.rotate(p.rot); co.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); co.restore(); }
          else if (p.shape === 3) { co.globalCompositeOperation = 'source-over'; drawHeart(co, p.x, p.y, p.size * 0.7); co.globalCompositeOperation = 'lighter'; }
          else if (p.shape === 4) { co.save(); co.translate(p.x, p.y); co.rotate(p.rot); co.beginPath(); co.ellipse(0, 0, p.size * 0.9, p.size * 0.4, 0, 0, TAU); co.fill(); co.restore(); }
          else if (p.shape === 5) { co.globalCompositeOperation = 'source-over'; co.font = `700 ${Math.round(p.size * 3)}px sans-serif`; co.textAlign = 'center'; co.textBaseline = 'middle'; co.fillText('+', p.x, p.y); co.globalCompositeOperation = 'lighter'; }
          co.globalAlpha = 1;
        }
      }
      co.globalCompositeOperation = 'source-over';
    }
  };

  function drawProj(c, q) {
    const w = env.w(), x = q.x, y = q.y - (q.h || 0);
    const simple = !q.full && (eff() >= 2 || projs.length > 30);
    if (q.arc && q.h > 1) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, q.y + w * 0.12, w * 0.16, w * 0.07, 0, 0, TAU); c.fill(); }
    const col = q.col || '#ffd24a', col2 = q.col2 || '#fff';
    if (simple) { c.fillStyle = css(col); c.beginPath(); c.arc(x, y, w * 0.08 * (q.sz || 1), 0, TAU); c.fill(); return; }
    if (q.tr.length >= 4 && S.trailOn()) {
      c.lineCap = 'round'; c.strokeStyle = css(col, 0.5);
      for (let i = 2; i < q.tr.length; i += 2) { c.globalAlpha = i / q.tr.length * 0.7; c.lineWidth = w * 0.13 * (q.sz || 1) * (i / q.tr.length); c.beginPath(); c.moveTo(q.tr[i - 2], q.tr[i - 1]); c.lineTo(q.tr[i], q.tr[i + 1]); c.stroke(); }
      c.globalAlpha = 1;
    }
    const ang = Math.atan2(q.y1 - q.y0, q.x1 - q.x0) + (q.arc ? Math.cos(Math.PI * clamp((S.now - q.t0) / q.dur, 0, 1)) * -0.5 * (q.x1 >= q.x0 ? 1 : -1) * 0 : 0);
    const spin = (S.now - q.t0) / 90;
    drawShape(c, q.base || 'orb', x, y, w * 0.2 * (q.sz || 1), col, col2, ang, spin, q);
  }

  function drawShape(c, base, x, y, s, col, col2, ang, spin, q) {
    switch (base) {
      case 'orb': glow(c, x, y, s * 2.6, col, 0.9); c.fillStyle = css(col2); c.beginPath(); c.arc(x, y, s * 0.55, 0, TAU); c.fill(); break;
      case 'heart': glow(c, x, y, s * 2.4, col, 0.7); c.fillStyle = css(col); drawHeart(c, x, y, s * 0.9); break;
      case 'bolt': {
        c.save(); c.translate(x, y); c.rotate(ang); c.lineCap = 'round';
        glow(c, 0, 0, s * 2.2, col, 0.6);
        c.strokeStyle = css(col); c.lineWidth = s * 0.9; c.beginPath(); c.moveTo(-s * 1.7, 0); c.lineTo(s * 1.3, 0); c.stroke();
        c.strokeStyle = css(col2); c.lineWidth = s * 0.38; c.beginPath(); c.moveTo(-s * 1.2, 0); c.lineTo(s * 1.3, 0); c.stroke(); c.restore(); break;
      }
      case 'disc': case 'card': {
        c.save(); c.translate(x, y); c.rotate(spin);
        if (base === 'card') { c.fillStyle = '#fff'; c.strokeStyle = css(col); c.lineWidth = 2; c.fillRect(-s * 0.7, -s, s * 1.4, s * 2); c.strokeRect(-s * 0.7, -s, s * 1.4, s * 2); c.fillStyle = css(col); c.fillRect(-s * 0.3, -s * 0.5, s * 0.6, s); }
        else { c.scale(1, 0.55); glow(c, 0, 0, s * 2.2, col, 0.6); c.fillStyle = css(col); c.beginPath(); c.arc(0, 0, s * 1.25, 0, TAU); c.fill(); c.strokeStyle = css(col2); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, s * 0.75, 0, TAU); c.stroke(); }
        c.restore(); break;
      }
      case 'bomb': {
        c.fillStyle = '#23232e'; c.strokeStyle = css(col); c.lineWidth = 2; c.beginPath(); c.arc(x, y, s * 0.95, 0, TAU); c.fill(); c.stroke();
        const fx = x + Math.cos(ang + Math.PI) * s * 1.1, fy = y + Math.sin(ang + Math.PI) * s * 1.1;
        glow(c, fx, fy, s * (1.2 + rnd() * 0.5), '#ffb13a', 0.95); break;
      }
      case 'rock': {
        c.save(); c.translate(x, y); c.rotate(spin * 0.7); c.fillStyle = css(col); c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, r = s * (1.0 + 0.25 * Math.sin(i * 2.7)); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, TAU); c.fill(); c.restore(); break;
      }
      case 'feather': {
        c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = css(col); c.beginPath(); c.moveTo(-s * 1.6, 0); c.quadraticCurveTo(0, -s * 0.9, s * 1.6, 0); c.quadraticCurveTo(0, s * 0.9, -s * 1.6, 0); c.fill();
        c.strokeStyle = css(col2); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-s * 1.6, 0); c.lineTo(s * 1.4, 0); c.stroke(); c.restore(); break;
      }
      case 'note': {
        glow(c, x, y, s * 2.2, col, 0.5); c.save(); c.translate(x, y); c.rotate(Math.sin(spin) * 0.3); c.fillStyle = css(col2); c.font = `700 ${Math.round(s * 3.4)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♪', 0, 0); c.restore(); break;
      }
      case 'wave': {
        c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = css(col); c.lineCap = 'round';
        for (let i = 0; i < 3; i++) { c.globalAlpha = 1 - i * 0.28; c.lineWidth = s * (0.7 - i * 0.15); c.beginPath(); c.arc(-i * s * 0.9, 0, s * 1.5, -1.0, 1.0); c.stroke(); }
        c.restore(); break;
      }
      case 'web': {
        c.save(); c.translate(x, y); c.rotate(spin * 0.3); c.strokeStyle = css(col2); c.lineWidth = 1.3;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * s * 1.5, Math.sin(a) * s * 1.5); c.stroke(); }
        for (const r of [0.6, 1.1, 1.5]) { c.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU; c.lineTo(Math.cos(a) * s * r, Math.sin(a) * s * r); } c.stroke(); }
        c.restore(); break;
      }
      case 'spirit': { for (let i = 0; i < 4; i++) { const a = spin * 0.5 + i * TAU / 4; glow(c, x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9, s * 1.1, i % 2 ? col2 : col, 0.85); } glow(c, x, y, s * 1.4, col, 0.7); break; }
      case 'clone': { c.globalAlpha = 0.7; env.sprite(c, q && q.key, x, y, s * 1.5, 0.7); c.globalAlpha = 1; c.strokeStyle = css(col, 0.8); c.lineWidth = 2; c.beginPath(); c.arc(x, y, s * 1.5, 0, TAU); c.stroke(); break; }
      default: glow(c, x, y, s * 2, col, 0.9);
    }
  }
  S.baseOf = (shape) => BASE[shape] || 'orb';

  // ---------- 震動（DOM）----------
  S.shake = (power) => {
    if (S.reduced || !S.enabled || !getShake() || !env.shakeEl) return;
    const el = env.shakeEl(); if (!el || !el.animate) return;
    const a = [0, 2.4, 3.6, 5.4][clamp(power | 0, 1, 3)] * (env.w() / 52);   // 幅度小：1～3 級約 2～5px
    const ms = 110 + power * 30;
    el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-a}px,${a * 0.5}px)` }, { transform: `translate(${a}px,${-a * 0.6}px)` }, { transform: `translate(${-a * 0.6}px,${-a * 0.3}px)` }, { transform: `translate(${a * 0.3}px,${a * 0.2}px)` }, { transform: 'translate(0,0)' }], { duration: ms, easing: 'linear' });
  };

  S.cell = () => env.w();
  S.env = env;
  S.drawShape = drawShape;
  S.rnd = rnd;
  return S;
}



return {get rgb(){return rgb;},get css(){return css;},get mix(){return mix;},get createStage(){return createStage;},get TAU(){return TAU;},get clamp(){return clamp;},get lerp(){return lerp;},get easeOut(){return easeOut;},get rnd(){return rnd;},get glow(){return glow;},get drawHeart(){return drawHeart;}};})();
mods.presets=(()=>{let css,mix,glow,TAU,clamp,lerp,easeOut,rnd;bind.push(()=>{css=mods.stage.css;mix=mods.stage.mix;glow=mods.stage.glow;TAU=mods.stage.TAU;clamp=mods.stage.clamp;lerp=mods.stage.lerp;easeOut=mods.stage.easeOut;rnd=mods.stage.rnd;});
// 特效預設（SPEC_ABILITY_FX 4.2）：trail、afterimage、burst、shockwave、ground、telegraph、beam、tether、slash、spin、cone、rain、aura、flash、morph、sweep、shake，
// 加上 hop、charge（蓄力）、shield／heal／stun／死亡等戰鬥基本演出。全部用 canvas 程式畫，不用圖檔。

// 外觀名 → [主色, 輔色, 粒子形狀]（形狀：0 光點 1 火花線 2 方塊 3 愛心 4 花瓣 ）
const SKIN = {
  fire: ['#ff7a1a', '#ffd23a', 1], ignite: ['#ff5a2a', '#ffe08a', 1], paint: ['#ff3fa8', '#3df2ff', 0], spray: ['#ff3fa8', '#c8ff3a', 0],
  sparkle: ['#fff3b0', '#ffd24a', 0], poison: ['#7bd34a', '#2f7a2a', 0], spore: ['#b9e66a', '#6b8f3a', 0], toxic: ['#7bd34a', '#3a8a2a', 0],
  petal: ['#ffc2dc', '#ff6fa8', 4], flowers: ['#ffc2dc', '#ff8fbd', 4], shards: ['#bfeaff', '#ffffff', 2], light: ['#fff6c0', '#ffe27a', 0], pixel: ['#3df2ff', '#ff3fa8', 2],
  mark: ['#ffe27a', '#ffffff', 0], shield: ['#bfe3ff', '#ffffff', 0], neon: ['#ff3fa8', '#3df2ff', 1], scissors: ['#e8f4ff', '#9ad0ff', 1], dragon: ['#ffcf3a', '#ff8a2a', 1],
  x: ['#ff5ad0', '#ffffff', 1], wind: ['#bfeaff', '#ffffff', 1], airslash: ['#bfeaff', '#ffffff', 1], hurricane: ['#d8f2ff', '#8ad0ff', 1], roar: ['#e8d8ff', '#a070ff', 0],
  soundwave: ['#8ad0ff', '#ffffff', 0], xslash: ['#ff5ad0', '#ffffff', 1], rage: ['#ff3a2a', '#ffb13a', 1], grow: ['#ffd24a', '#ffffff', 0], spider: ['#8b3fd9', '#f1e9ff', 0],
  shadow: ['#6a3fd0', '#1a1030', 0], demon: ['#c02a4a', '#2a0a14', 1], glow: ['#fff3b0', '#ffd24a', 0], spark: ['#ffe27a', '#ffffff', 1], hype: ['#ff7ad0', '#ffe27a', 0],
  party: ['#ff7ad0', '#3df2ff', 2], drain: ['#d02a4a', '#ff9ab0', 0], swords: ['#cfe8ff', '#ffffff', 1], holofists: ['#3df2ff', '#ffffff', 0], recordstack: ['#ffd24a', '#222', 2],
  blood: ['#d02a2a', '#ff8a8a', 0], soul: ['#7ad7ff', '#ffffff', 0], violin: ['#ffb36a', '#fff0d0', 0], hook: ['#c8d0d8', '#ffffff', 1], gem: ['#c070ff', '#ffffff', 2],
  sparkle2: ['#fff', '#ffd24a', 0], bandage: ['#f4e8c8', '#ffffff', 0], tentacle: ['#6a3fd0', '#c08aff', 0], claw: ['#ff5a2a', '#ffffff', 1], aurora: ['#7affc8', '#8a8aff', 0],
  beam: ['#9ad0ff', '#ffffff', 0], notes: ['#ffd0f0', '#ffffff', 0], rewind: ['#6ad0ff', '#ffffff', 0], flow: ['#ffb0e0', '#ffffff', 0], spirit: ['#9ad0ff', '#ffffff', 0],
  sweep: ['#ffe8b0', '#ffffff', 1], lash: ['#c070ff', '#ffffff', 1], vortex: ['#8ad0ff', '#ffffff', 0], stage: ['#ffd24a', '#ff7ad0', 0], speakers: ['#ff7ad0', '#ffffff', 0],
  gala: ['#ffd24a', '#ff7ad0', 0], wildgrowth: ['#7bd34a', '#c8ff8a', 4], tossback: ['#fff', '#ffd24a', 0],
};
function pal(skin, c1, c2) { const s = SKIN[skin]; return s ? [s[0], s[1], s[2]] : [c1, c2 || '#fff', 0]; }

const A = (v, star) => (Array.isArray(v) ? v[Math.min(Math.max(star || 1, 1), v.length) - 1] : v);

function makePresets(S) {
  const env = S.env, w = () => env.w();
  const R = (cells) => (cells + 0.5) * w() * 0.96;
  const pt = (a) => ({ x: a.x, y: a.y });

  function burst(a) {
    if (!S.allow('burst')) return;
    const [c1, c2, shape] = pal(a.skin, a.c1, a.c2);
    const n = S.cnt(a.n || (a.big ? 16 : a.small ? 6 : 10));
    const sp = w() * (a.big ? 5.5 : a.small ? 2.6 : 3.8) * (a.r ? 0.8 + a.r * 0.35 : 1);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * TAU, v = sp * (0.4 + rnd() * 0.7);
      const poison = a.skin === 'poison' || a.skin === 'spore' || a.skin === 'toxic';
      S.part(a.x, a.y, Math.cos(ang) * v, Math.sin(ang) * v - w() * 0.6, { life: 380 + rnd() * 320, size: (poison ? 5 : 3) + rnd() * 3, col: i % 2 ? c1 : c2, shape: shape === 0 ? (i % 3 ? 0 : 1) : shape, g: poison ? -w() * 0.8 : w() * 4.2, drag: 1.4, vr: (rnd() - 0.5) * 12 });
    }
    if (!S.reduced) S.add('o', 220, (c, p) => { glow(c, a.x, a.y, w() * (0.5 + p * (a.big ? 1.3 : 0.8)), c1, 0.8 * (1 - p)); });
  }
  function flash(a) {
    if (!S.allow('flash')) return;
    const [c1] = pal(a.skin, a.c1);
    S.add('o', 200, (c, p) => {
      const r = w() * (0.45 + p * 0.25);
      c.globalCompositeOperation = 'lighter';
      glow(c, a.x, a.y, r * 1.5, '#ffffff', (1 - p) * 0.9); glow(c, a.x, a.y, r * 2, c1, (1 - p) * 0.6);
      c.strokeStyle = css('#fff', 1 - p); c.lineWidth = 2; const L = w() * (0.2 + p * 0.45);
      c.beginPath(); c.moveTo(a.x - L, a.y); c.lineTo(a.x + L, a.y); c.moveTo(a.x, a.y - L); c.lineTo(a.x, a.y + L); c.stroke();
    });
  }
  function shockwave(a) {
    if (!S.allow('shockwave')) return;
    const r = R(A(a.r, a.star) || 1), [c1] = pal(a.skin, a.c1);
    S.add('o', 380 * S.slow(), (c, p) => {
      const k = easeOut(p);
      c.strokeStyle = css(c1, 1 - p); c.lineWidth = (a.thin ? 2 : 4) * (1 - p) + 1; c.beginPath(); c.ellipse(a.x, a.y, r * k, r * k * 0.82, 0, 0, TAU); c.stroke();
      if (!a.thin) { c.strokeStyle = css('#fff', (1 - p) * 0.7); c.lineWidth = 1.5; c.beginPath(); c.ellipse(a.x, a.y, r * k * 0.82, r * k * 0.82 * 0.82, 0, 0, TAU); c.stroke(); }
    });
    S.add('u', 380 * S.slow(), (c, p) => { c.fillStyle = css(c1, 0.22 * (1 - p)); c.beginPath(); c.ellipse(a.x, a.y, r * easeOut(p), r * easeOut(p) * 0.82, 0, 0, TAU); c.fill(); });
  }
  // 地面色塊：circle／line／row；persist＝留到物件被移除（回傳物件）
  function ground(a) {
    if (!S.allow('ground')) return null;
    const [c1, c2] = pal(a.skin, a.c1, a.c2);
    const shape = a.shape || 'circle', r = R(A(a.r, a.star) || 1), dur = (A(a.dur, a.star) || 0.8) * 1000;
    const draw = (c, alpha, tt) => {
      c.fillStyle = css(c1, 0.28 * alpha); c.strokeStyle = css(c2, 0.8 * alpha); c.lineWidth = 2;
      if (shape === 'circle') { c.beginPath(); c.ellipse(a.x, a.y, r, r * 0.82, 0, 0, TAU); c.fill(); c.stroke(); }
      else if (shape === 'row') { const h = w() * 0.55; c.fillRect(0, a.y - h / 2, env.W(), h); c.strokeRect(0, a.y - h / 2, env.W(), h); }
      else {   // line：從 (x,y) 朝 (tx,ty) 延伸
        const ang = Math.atan2(a.ty - a.y, a.tx - a.x), L = (a.len || 4) * w(), hw = (a.width || 1) * w() * 0.32;
        c.save(); c.translate(a.x, a.y); c.rotate(ang); c.fillRect(0, -hw, L, hw * 2); c.strokeRect(0, -hw, L, hw * 2); c.restore();
      }
      if (a.skin === 'ignite' || a.skin === 'fire') { c.globalCompositeOperation = 'lighter'; glow(c, a.x, a.y, r * 0.9, c1, 0.5 * alpha * (0.6 + 0.4 * Math.sin(tt / 60))); }
    };
    if (a.persist) { const o = S.addObj({ keep: true, drawU: (c, o2, now) => draw(c, 0.9, now) }); return o; }
    S.add('u', dur, (c, p) => draw(c, p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1, S.now));
    return null;
  }
  function telegraph(a) {
    if (!S.allow('telegraph')) return;
    const r = R(A(a.r, a.star) || 1), [c1] = pal(a.skin, a.c1), n = A(a.n, a.star) || 1;
    S.add('u', (A(a.dur, a.star) || 0.5) * 1000, (c, p) => {
      c.setLineDash([7, 6]); c.lineDashOffset = -S.now / 40; c.strokeStyle = css(c1, S.reduced ? 0.8 : 0.5 + 0.4 * Math.abs(Math.sin(p * 9))); c.lineWidth = 2.5;
      for (let i = 0; i < n; i++) { const o = n > 1 ? (i - (n - 1) / 2) * w() * 1.1 : 0; c.beginPath(); c.ellipse(a.x + o, a.y, r, r * 0.82, 0, 0, TAU); c.stroke(); }
    });
  }
  function beam(a) {
    if (!S.allow('beam')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (A(a.dur, a.star) || 0.35) * 1000;
    const wide = a.wide ? 1.7 : a.thin ? 0.5 : 1;
    S.add('o', dur, (c, p) => {
      let x1 = a.tx, y1 = a.ty;
      if (a.fromId) { const q = env.pos(a.fromId); if (q) { a.x = q.x; a.y = q.y; } }
      if (a.toId) { const q = env.pos(a.toId); if (q) { x1 = q.x; y1 = q.y; } }
      if (a.along) { const L = Math.hypot(x1 - a.x, y1 - a.y) || 1, k = (a.len ? a.len * w() : env.W()) / L; x1 = a.x + (x1 - a.x) * k; y1 = a.y + (y1 - a.y) * k; }
      const pulse = S.reduced ? 1 : 0.8 + 0.2 * Math.sin(S.now / 45), fade = p < 0.12 ? p / 0.12 : p > 0.75 ? (1 - p) / 0.25 : 1;
      c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      c.strokeStyle = css(c1, 0.35 * fade); c.lineWidth = w() * 0.55 * wide * pulse; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = css(c1, 0.9 * fade); c.lineWidth = w() * 0.2 * wide * pulse; c.stroke();
      c.strokeStyle = css(c2 === c1 ? '#fff' : '#ffffff', fade); c.lineWidth = w() * 0.07 * wide; c.stroke();
      glow(c, a.x, a.y, w() * 0.45 * wide, c1, 0.8 * fade); glow(c, x1, y1, w() * 0.4 * wide, c1, 0.7 * fade);
    });
  }
  // 連線：兩個單位間（會跟著移動），可有流動光點
  function tether(a) {
    if (!S.allow('beam')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (a.dur || 0.5) * 1000;
    S.add('o', dur, (c, p) => {
      const q0 = a.fromId ? env.pos(a.fromId) : { x: a.x, y: a.y }, q1 = a.toId ? env.pos(a.toId) : { x: a.tx, y: a.ty };
      if (!q0 || !q1) return;
      const fade = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1;
      c.strokeStyle = css(c1, 0.7 * fade); c.lineWidth = 2.5; c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      const mx = (q0.x + q1.x) / 2, my = (q0.y + q1.y) / 2 - Math.hypot(q1.x - q0.x, q1.y - q0.y) * 0.12;
      c.beginPath(); c.moveTo(q0.x, q0.y); c.quadraticCurveTo(mx, my, q1.x, q1.y); c.stroke();
      if (!S.reduced) for (let i = 0; i < 4; i++) { const k = ((S.now / 380) + i / 4) % 1, x = (1 - k) * (1 - k) * q0.x + 2 * k * (1 - k) * mx + k * k * q1.x, y = (1 - k) * (1 - k) * q0.y + 2 * k * (1 - k) * my + k * k * q1.y; glow(c, x, y, w() * 0.16, c2, 0.9 * fade); }
    });
  }
  function slash(a) {
    if (!S.allow('slash')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), n = A(a.n, a.star) || 1;
    const big = a.big || a.heavy ? 1.55 : 1;
    for (let i = 0; i < n; i++) {
      S.after(i * 90 * S.slow(), () => S.add('o', 240 * S.slow(), (c, p) => {
        const r = w() * 0.62 * big, k = easeOut(clamp(p * 1.5, 0, 1));
        c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
        if (a.shape === 'row') {
          const x0 = 0, x1 = env.W() * k; c.strokeStyle = css(c1, 1 - p); c.lineWidth = w() * 0.28 * (1 - p) + 2; c.beginPath(); c.moveTo(x0, a.y); c.lineTo(x1, a.y); c.stroke();
          c.strokeStyle = css('#fff', 1 - p); c.lineWidth = 2; c.stroke(); return;
        }
        const base = (a.ang != null ? a.ang : -0.6) + (i % 2 ? 0.9 : -0.9) * 0.5 + (i ? Math.PI * 0.5 * i : 0);
        const a0 = base - 1.25, a1 = a0 + 2.5 * k;
        for (let j = 0; j < 3; j++) { c.strokeStyle = j === 2 ? css('#ffffff', (1 - p)) : css(j ? c2 : c1, (1 - p) * (j ? 0.7 : 0.5)); c.lineWidth = (j === 0 ? 0.3 : j === 1 ? 0.14 : 0.05) * w() * (a.heavy ? 1.4 : 1) * (1 - p * 0.5); c.beginPath(); c.arc(a.x, a.y, r, a0, a1); c.stroke(); }
        if (a.heavy) { c.strokeStyle = css(c1, (1 - p) * 0.6); c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, r * 0.7, a0 + 0.4, a1 - 0.2); c.stroke(); }
      }));
    }
  }
  function spin(a) {
    if (!S.allow('spin')) return;
    const r = R(A(a.r, a.star) || 1) * 0.72, [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (A(a.dur, a.star) || 0.35) * 1000;
    S.add('o', dur, (c, p) => {
      const q = a.id ? env.pos(a.id) : { x: a.x, y: a.y }; if (!q) return;
      const rot = p * TAU * 2.2, fade = p > 0.7 ? (1 - p) / 0.3 : 1;
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const b = rot + i * TAU / 3; c.strokeStyle = css(i % 2 ? c2 : c1, fade * 0.9); c.lineWidth = w() * 0.16; c.beginPath(); c.arc(q.x, q.y, r, b, b + 1.1); c.stroke(); c.strokeStyle = css('#fff', fade); c.lineWidth = 2; c.stroke(); }
    });
  }
  function cone(a) {
    if (!S.allow('cone')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), r = R(A(a.r, a.star) || 2), wide = a.wide ? 1.25 : 0.8;
    const ang = Math.atan2(a.ty - a.y, a.tx - a.x), dur = (a.dur || 0.4) * 1000 * S.slow();
    S.add('u', dur, (c, p) => {
      const k = easeOut(clamp(p * 1.6, 0, 1));
      c.fillStyle = css(c1, 0.35 * (1 - p)); c.strokeStyle = css(c2, 0.8 * (1 - p)); c.lineWidth = 2;
      c.beginPath(); c.moveTo(a.x, a.y); c.arc(a.x, a.y, r * k, ang - wide, ang + wide); c.closePath(); c.fill(); c.stroke();
    });
    S.add('o', dur, (c, p) => { c.globalCompositeOperation = 'lighter'; const k = easeOut(clamp(p * 1.6, 0, 1)); c.strokeStyle = css('#fff', (1 - p) * 0.8); c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, r * k, ang - wide, ang + wide); c.stroke(); });
  }
  function rain(a) {
    if (!S.allow('rain')) return;
    const n = Math.min(A(a.n, a.star) || 6, S.eff() ? 8 : 14), r = R(A(a.r, a.star) || 2), [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (A(a.dur, a.star) || 0.6) * 1000;
    for (let i = 0; i < n; i++) {
      const tx = a.x + (rnd() - 0.5) * r * 1.7, ty = a.y + (rnd() - 0.5) * r * 1.2, d0 = (i / n) * dur * 0.7, fall = 260;
      S.after(d0, () => S.proj({ x0: tx + 12, y0: -w() * 0.5, x1: tx, y1: ty, dur: fall, col: c1, col2: c2, base: a.shape === 'note' ? 'note' : a.shape === 'pillar' || a.shape === 'blade' ? 'bolt' : 'bolt', sz: 1.1, full: false, arc: false,
        arrive: () => { burst({ x: tx, y: ty, c1, c2, small: true, n: 4 }); } }));
    }
  }
  function aura(a) {
    if (!S.allow('obj')) return null;
    const [c1, c2, shape] = pal(a.skin, a.c1, a.c2), dur = a.dur ? A(a.dur, a.star) * 1000 : 900;
    return S.addObj({ id: a.id, until: S.now + dur, drawO: (c, o, now) => {
      const q = env.pos(a.id); if (!q) return;
      const t = (now - o.t0) / dur, fade = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
      c.globalCompositeOperation = 'lighter';
      const rr = w() * (0.46 + (a.pulse ? 0.08 * Math.sin(now / 90) : 0));
      c.strokeStyle = css(c1, 0.75 * fade); c.lineWidth = 2.5; c.beginPath(); c.ellipse(q.x, q.y + w() * 0.08, rr, rr * 0.85, 0, 0, TAU); c.stroke();
      if (S.reduced) return;
      const m = S.eff() ? 2 : 3;
      for (let i = 0; i < m; i++) { const ang = now / 300 + i * TAU / m; const x = q.x + Math.cos(ang) * rr, y = q.y + Math.sin(ang) * rr * 0.85; if (shape === 1) { c.strokeStyle = css(c2, fade); c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang + 1.57) * 8, y + Math.sin(ang + 1.57) * 8); c.stroke(); } else glow(c, x, y, w() * 0.14, c2, fade); }
    } });
  }
  // morph：頭像放大／縮扁／換外框色。skin 決定顏色；dur 沒給＝永久（回傳不還原）
  function morph(a) {
    const [c1] = pal(a.skin, a.c1), node = env.unitNode(a.id); if (!node) return;
    const av = node.querySelector('.tt-bt-av');
    S.add('o', 420, (c, p) => { const q = env.pos(a.id); if (!q) return; c.globalCompositeOperation = 'lighter'; glow(c, q.x, q.y, w() * (0.5 + p * 0.7), c1, (1 - p) * 0.9); c.strokeStyle = css(c1, 1 - p); c.lineWidth = 3; c.beginPath(); c.arc(q.x, q.y, w() * (0.3 + p * 0.6), 0, TAU); c.stroke(); });
    if (S.reduced || !av || !av.animate) { if (av) av.style.setProperty('--tt-morph', c1); return; }
    const big = a.skin === 'grow' || a.skin === 'rage' || a.skin === 'dragon' || a.skin === 'demon' ? 1.2 : 1.12;
    node.querySelector('.tt-bt-in').animate([{ scale: 1 }, { scale: big * 1.12, offset: 0.4 }, { scale: big }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
    av.style.boxShadow = `0 0 0 2px ${c1}, 0 0 10px ${css(c1, 0.9)}`; av.style.borderColor = c1;
    if (a.dur) setTimeout(() => { av.style.boxShadow = ''; av.style.borderColor = ''; const inn = node.querySelector('.tt-bt-in'); if (inn && inn.animate) inn.animate([{ scale: big }, { scale: 1 }], { duration: 250, fill: 'forwards' }); }, A(a.dur, a.star) * 1000 / (env.speed() || 1));
  }
  function sweep(a) {
    if (!S.allow('sweep')) return;
    const [c1, c2] = pal(a.skin, a.c1, a.c2), dur = (a.dur || 0.7) * 1000 * S.slow(), Wd = env.W(), Hd = env.H();
    const dir = a.dir || (a.skin === 'xslash' ? 'x' : 'h');
    S.add('o', dur, (c, p) => {
      c.globalCompositeOperation = 'lighter'; const al = 0.35 * Math.sin(p * Math.PI);   // 最高 35%
      if (dir === 'x') { c.strokeStyle = css(c1, al * 2); c.lineWidth = w() * 0.3; c.lineCap = 'round'; const k = easeOut(p); for (const f of [1, -1]) { c.beginPath(); c.moveTo(f > 0 ? 0 : Wd, 0); c.lineTo(f > 0 ? Wd * k : Wd * (1 - k), Hd * k); c.stroke(); } return; }
      const x = lerp(-Wd * 0.3, Wd * 1.1, p), g = c.createLinearGradient(x - Wd * 0.3, 0, x + Wd * 0.05, 0);
      g.addColorStop(0, css(c1, 0)); g.addColorStop(0.7, css(c1, al)); g.addColorStop(1, css(c2, al * 1.2));
      c.fillStyle = g; c.fillRect(0, 0, Wd, Hd);
    });
  }
  function hop(a) {
    const node = env.unitNode(a.id); if (!node || S.reduced || !node.animate) return;
    const inn = node.querySelector('.tt-bt-in'); inn.animate([{ translate: '0 0' }, { translate: `0 ${-w() * 0.35}px`, offset: 0.45 }, { translate: '0 0' }], { duration: 300, easing: 'ease-out' });
  }
  // 蓄力：光點往施法者收攏（施法前搖 0.5 秒）
  function charge(a) {
    if (!S.allow('burst')) return;
    const n = S.cnt(8), q = a.id;
    for (let i = 0; i < n; i++) S.after(i * 45, () => { const p0 = env.pos(q); if (!p0) return; const ang = rnd() * TAU, d = w() * 0.9, s = w() * 2.6; S.part(p0.x + Math.cos(ang) * d, p0.y + Math.sin(ang) * d, -Math.cos(ang) * s, -Math.sin(ang) * s, { life: 330, size: 3, col: i % 2 ? a.c1 : a.c2 || '#fff' }); });
    S.add('o', 520, (c, p) => { const p0 = env.pos(q); if (!p0) return; c.globalCompositeOperation = 'lighter'; glow(c, p0.x, p0.y, w() * (0.9 - p * 0.35), a.c1, 0.55 * p); });
  }
  function shield(a) {
    if (S.reduced || !S.enabled) return;
    S.add('o', 520, (c, p) => { const q = env.pos(a.id); if (!q) return; const r = w() * (0.5 + 0.08 * Math.sin(p * 9)), al = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8; c.fillStyle = css('#bfe3ff', 0.22 * al); c.strokeStyle = css('#ffffff', 0.8 * al); c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill(); c.stroke(); });
  }
  function heal(a) {
    if (S.reduced || !S.enabled) return;
    const n = S.cnt(5);
    for (let i = 0; i < n; i++) S.part(a.x + (rnd() - 0.5) * w() * 0.6, a.y + w() * 0.1, 0, -w() * (1.2 + rnd()), { life: 650, size: 3.2, col: '#4ade80', shape: 5, add: false });
    S.add('o', 400, (c, p) => { c.globalCompositeOperation = 'lighter'; glow(c, a.x, a.y, w() * 0.7, '#4ade80', (1 - p) * 0.55); });
  }
  function death(a) {
    if (S.reduced || !S.enabled) return;
    const n = S.cnt(a.big ? 18 : 10);
    for (let i = 0; i < n; i++) { const ang = rnd() * TAU, v = w() * (1.4 + rnd() * 2.4); S.part(a.x, a.y, Math.cos(ang) * v, Math.sin(ang) * v - w() * 0.8, { life: 600 + rnd() * 300, size: 3 + rnd() * 2.5, col: i % 3 ? a.c1 : '#ffffff', g: w() * 3, drag: 1 }); }
    S.add('o', 420 * S.slow(), (c, p) => { c.globalCompositeOperation = 'lighter'; c.strokeStyle = css(a.c1, 1 - p); c.lineWidth = 4 * (1 - p) + 1; c.beginPath(); c.arc(a.x, a.y, w() * (0.3 + p * 0.8), 0, TAU); c.stroke(); glow(c, a.x, a.y, w() * 0.9, '#fff', (1 - p) * 0.6); });
  }
  // 普攻命中：近戰＝小斬痕；遠程＝閃光火花
  function hit(a) {
    if (S.reduced || !S.enabled) return;
    const n = S.cnt(a.crit ? 7 : 4), ang0 = a.ang != null ? a.ang : rnd() * TAU;
    for (let i = 0; i < n; i++) { const ang = ang0 + (rnd() - 0.5) * 1.6, v = w() * (2.2 + rnd() * 2.2); S.part(a.x, a.y, Math.cos(ang) * v, Math.sin(ang) * v, { life: 260 + rnd() * 160, size: 2.6, col: i % 2 ? a.c1 : '#ffffff', shape: 1, drag: 2.4 }); }
    S.add('o', a.crit ? 260 : 170, (c, p) => { c.globalCompositeOperation = 'lighter'; glow(c, a.x, a.y, w() * (0.3 + p * 0.3) * (a.crit ? 1.5 : 1), '#ffffff', (1 - p) * 0.8); });
    if (a.melee) slash({ x: a.x, y: a.y, ang: a.ang != null ? a.ang + 0.3 : null, c1: a.c1, c2: '#ffffff', big: a.crit });
  }
  function stun(a) {
    if (!S.allow('obj')) return null;
    return S.addObj({ id: a.id, drawO: (c, o, now) => { const q = env.pos(a.id); if (!q) return; for (let i = 0; i < 3; i++) { const ang = now / 260 + i * TAU / 3; glow(c, q.x + Math.cos(ang) * w() * 0.3, q.y - w() * 0.46 + Math.sin(ang) * w() * 0.09, w() * 0.11, '#ffe27a', 1); } } });
  }
  return { burst, flash, shockwave, ground, telegraph, beam, tether, slash, spin, cone, rain, aura, morph, sweep, hop, charge, shield, heal, death, hit, stun };
}

return {get SKIN(){return SKIN;},get pal(){return pal;},get makePresets(){return makePresets;}};})();
mods.script=(()=>{let createStage,css,mix,glow,TAU,clamp,lerp,easeOut,rnd,makePresets,pal;bind.push(()=>{createStage=mods.stage.createStage;css=mods.stage.css;mix=mods.stage.mix;glow=mods.stage.glow;TAU=mods.stage.TAU;clamp=mods.stage.clamp;lerp=mods.stage.lerp;easeOut=mods.stage.easeOut;rnd=mods.stage.rnd;makePresets=mods.presets.makePresets;pal=mods.presets.pal;});
// 技能演出播放：引擎事件（fire／atk／dmg／move／proj／obj／air／chan／fx…）變成 stage 上的特效。
// 位移、投射物、場上物件（努努的球、染色格、區域）全部照引擎事件的位置與時間走；data/fx.json 只剩配色、一句動作描述、沒有明確演出時的備用提示。
// 完全不影響戰鬥：這裡只讀事件、只畫。畫面亂數只用 Math.random（UI 端）。
const TICK = 50;   // 引擎 1 tick ＝ 50ms（與 battle.js 的 TICK_MS 相同）


const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const A = (v, star) => (Array.isArray(v) ? v[Math.min(Math.max(star || 1, 1), v.length) - 1] : v);
const RANGED_SHAPE = new Set(['bolt', 'bullet', 'arrow', 'laser', 'spear', 'spike', 'feather', 'card', 'orb', 'ball', 'spirit', 'note', 'blade']);

function createFx(root, env0) {
  let fxData = { units: {} };
  const env = env0;
  const S = createStage(root, env);
  const FX = makePresets(S);
  const w = () => env.w();
  const spd = () => env.speed() || 1;
  const ms = (sec) => sec * 1000 / spd();   // 遊戲秒 → 實際毫秒（跟著戰鬥速度）
  const udef = (u) => (u && fxData.units[u.key]) || null;
  const colors = (u) => {
    const d = udef(u); let c1 = (d && d.c[0]) || '#ffd24a', c2 = (d && d.c[1]) || '#ffffff';
    if (u && u.side === 'enemy') { c1 = mix(c1, '#ff4040', 0.15); c2 = mix(c2, '#ff4040', 0.1); }   // 敵方特效偏紅一點，鏡像對戰分得出誰放的
    return [c1, c2];
  };
  const P = (u) => (u ? env.pos(u.id) : null);
  const enemiesOf = (u) => env.units().filter((x) => x.alive && x.side !== u.side);
  const alliesOf = (u) => env.units().filter((x) => x.alive && x.side === u.side);

  // ---------- 目標解析 ----------
  function resolve(spec, c, dflt) {
    if (Array.isArray(spec)) return spec.map((id) => env.unit(id)).filter(Boolean);   // 引擎事件：已解析好的單位 id
    const s = spec || dflt || 'tgt';
    const u = c.u, t = c.tgt;
    switch (s) {
      case 'self': return [u];
      case 'enemies': return enemiesOf(u);
      case 'allies': return alliesOf(u);
      case 'row': { const t0 = t; return t0 ? enemiesOf(u).filter((x) => x.hex.row === t0.hex.row) : []; }
      case 'boardCenter': return [{ id: null, fixed: { x: env.W() / 2, y: env.H() / 2 } }];
      default: return t && t.alive !== false ? [t] : (t ? [t] : []);
    }
  }
  const ptOf = (x) => (x.fixed ? x.fixed : P(x));

  // ---------- 節點執行 ----------
  function run(nodes, c, baseMs) {
    for (const n of nodes || []) {
      if (n.cn && !(c.castN > 0 && c.castN % n.cn === 0)) continue;
      if (n.once && c.castN > 1) continue;
      const d = (baseMs || 0) + ms(n.t || 0);
      const go = () => { try { exec(n, c); } catch (e) { console.error(e); } };
      if (d > 0) S.after(d, go); else go();
    }
  }
  function ctxOf(u, tgt, extra) { return Object.assign({ u, tgt, star: u ? u.star : 1, castN: u ? u.castN : 1, c1: colors(u)[0], c2: colors(u)[1] }, extra); }

  function exec(n, c) {
    const u = c.u;
    if (!u) return;
    switch (n.k) {
      case 'fx': return execFx(n, c);
      case 'proj': return execProj(n, c);
    }
  }

  function execFx(n, c) {
    const u = c.u, name = n.f;
    if (name === 'shake') return S.shake(A(n.power, c.star) || 1);
    if (name === 'sweep') return FX.sweep({ skin: n.skin, dir: n.dir, dur: n.dur, c1: c.c1, c2: c.c2 });
    const base = { skin: n.skin, r: n.r, n: n.n, big: n.big, small: n.small, heavy: n.heavy, thin: n.thin, wide: n.wide, shape: n.shape, dur: n.dur, pulse: n.pulse, len: n.len, width: n.width, along: n.along, star: c.star, c1: c.c1, c2: c.c2 };
    if (name === 'beam' || name === 'tether' || name === 'cone' || name === 'ground' && (n.shape === 'line') || name === 'telegraph' && false) {
      const frs = resolve(n.frm, c, 'self'), tos = n.toXY ? [{ fixed: env.xy(n.toXY), id: null }] : resolve(n.to, c, 'tgt');
      const fr0 = frs[0];
      if (!fr0 || !tos.length) return;
      const lim = Math.min(tos.length, S.eff() ? 3 : 6);
      for (let i = 0; i < lim; i++) {   // 一個來源對多個目標（阿姆姆 4 條繃帶、瑟雷西 3 條連線）：各畫一條；多個來源對一個目標（弗拉迪米爾）：各畫一條
        const to = tos[i], fr = frs.length > 1 && frs.length === tos.length ? frs[i] : fr0, pf = ptOf(fr), pt = ptOf(to);
        if (!pf || !pt) continue;
        const a = Object.assign({}, base, { x: pf.x, y: pf.y, tx: pt.x, ty: pt.y, fromId: fr.id, toId: to.id });
        if (name === 'beam') FX.beam(a); else if (name === 'tether') FX.tether(a); else if (name === 'cone') FX.cone(a); else FX.ground(a);
      }
      return;
    }
    const list = n.center ? [{ id: null, fixed: { x: env.W() / 2, y: env.H() / 2 } }] : resolve(n.at, c, name === 'aura' || name === 'morph' || name === 'spin' || name === 'hop' ? 'self' : 'tgt');
    const lim = Math.min(list.length, S.eff() ? 4 : 8);
    const src = P(u);
    for (let i = 0; i < lim; i++) {
      const t = list[i], p = ptOf(t); if (!p) continue;
      const a = Object.assign({}, base, { x: p.x, y: p.y, id: t.id, tx: src ? src.x : p.x, ty: src ? src.y : p.y });
      const ang = src ? Math.atan2(p.y - src.y, p.x - src.x) : null;
      a.ang = ang != null && t !== u ? ang : null;
      switch (name) {
        case 'burst': FX.burst(a); break;
        case 'flash': FX.flash(a); break;
        case 'shockwave': FX.shockwave(a); break;
        case 'slash': FX.slash(a); break;
        case 'ground': if (n.shape === 'row') a.shape = 'row'; FX.ground(a); break;
        case 'telegraph': FX.telegraph(a); break;
        case 'spin': FX.spin(a); break;
        case 'rain': FX.rain(a); break;
        case 'aura': FX.aura(a); break;
        case 'morph': FX.morph(a); break;
        case 'hop': FX.hop(a); break;
        case 'afterimage': ghost(t, c.c1, 3); break;
        case 'trail': trailOn(t, c.c1, 500); break;
        default: break;
      }
    }
  }

  // ---------- 殘影／拖尾 ----------
  function ghost(u, col, n, spanMs) {
    if (!S.allow('slash') || !u) return;
    n = Math.min(n || 3, S.eff() ? 2 : 3);
    for (let i = 0; i < n; i++) S.after(i * (spanMs || 55), () => {
      const p = P(u); if (!p) return;
      const x = p.x, y = p.y;
      S.add('o', 260 * S.slow(), (cv, k) => { cv.globalAlpha = 0.5 * (1 - k); env.sprite(cv, u.key, x, y, w() * 0.42, 0.5 * (1 - k)); cv.globalAlpha = 1; cv.strokeStyle = css(col, 0.7 * (1 - k)); cv.lineWidth = 2; cv.beginPath(); cv.arc(x, y, w() * 0.42, 0, TAU); cv.stroke(); });
    });
  }
  function trailOn(u, col, durMs) {
    if (!S.trailOn() || !u) return;
    const pts = []; const t0 = S.now;
    S.addObj({ until: S.now + durMs + 260, drawO: (cv, o, now) => {
      if (now - t0 < durMs) { const p = P(u); if (p) pts.push(p.x, p.y, now); }
      while (pts.length && now - pts[2] > 260) pts.splice(0, 3);
      cv.lineCap = 'round'; cv.globalCompositeOperation = 'lighter';
      for (let i = 3; i < pts.length; i += 3) { const a = 1 - (now - pts[i + 2]) / 260; cv.strokeStyle = css(col, 0.55 * a); cv.lineWidth = w() * 0.3 * a; cv.beginPath(); cv.moveTo(pts[i - 3], pts[i - 2]); cv.lineTo(pts[i], pts[i + 1]); cv.stroke(); }
    } });
  }

  // ---------- 擊飛 ----------
  function knockUp(t, durSec, high) {
    const node = env.unitNode(t.id); if (!node || S.reduced || !S.enabled) return;
    const total = Math.min(Math.max(ms(durSec || 1), 260), 900), t0 = S.now, h = w() * (high ? 1.0 : 0.6);
    const o = S.addObj({ until: t0 + total, upd: (ob, dt, now) => { const k = clamp((now - t0) / total, 0, 1); t.oy = -Math.sin(Math.PI * k) * h; env.applyOffset(t); },
      done: () => { t.oy = 0; env.applyOffset(t); const p = P(t); if (p) { FX.shockwave({ x: p.x, y: p.y + w() * 0.2, r: 0.6, thin: true, c1: '#ffffff' }); FX.burst({ x: p.x, y: p.y + w() * 0.25, small: true, c1: '#d8c8a8', c2: '#ffffff', skin: 'spore', n: 5 }); } } });
    if (!o) { t.oy = 0; }
  }

  // ---------- 投射物 ----------
  function flightMs(a, b, cellsPerSec, lo, hi) { return clamp(dist(a, b) / (w() * (cellsPerSec || 12)) * 1000, lo || 110, hi || 420) * (spd() >= 4 ? 0.55 : 1); }
  function shoot(u, from, to, o) {   // 單發：from/to 是座標，to 也可帶 follow 單位
    const base = S.baseOf(o.shape);
    const dur = o.dur || flightMs(from, to, o.speed, 100, 420);
    return S.proj({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, x: from.x, y: from.y, follow: o.follow || null, dur, arc: !!o.arc, col: o.c1, col2: o.c2, base, sz: o.sz || 1, key: u && u.key, full: !!o.full, spin: !!o.spin, arrive: o.arrive });
  }
  // 沒有引擎演出的備用：tok 提示產生的簡單投射物（只畫，不重複引擎的飛行）
  function execProj(n, c) {
    const u = c.u, src = P(u); if (!src) return;
    const t = resolve(n.to, c)[0], pt = t && ptOf(t); if (!pt) return;
    shoot(u, src, pt, { shape: n.shape, c1: c.c1, c2: c.c2, speed: 14, follow: t.id, arrive: () => { const q = P(t); if (q) FX.burst({ x: q.x, y: q.y, c1: c.c1, c2: c.c2, small: true }); } });
  }

  // ---------- 引擎事件：投射物 ----------
  function onProj(ev) {
    const src = ev.src != null ? env.unit(ev.src) : null;
    if (!S.enabled || !src && ev.src != null) return;
    const [c1, c2] = colors(src);
    const a0 = ev.fromId != null && env.pos(ev.fromId) ? env.pos(ev.fromId) : env.hexPt(ev.from);
    let tgt, follow = null;
    if (typeof ev.to === 'string') { const tp = env.pos(ev.to); if (!tp) return; tgt = { x: tp.x, y: tp.y }; follow = ev.to; }
    else if (ev.to && ev.to.x != null) tgt = env.xy(ev.to);
    else if (ev.to && ev.to.row != null) tgt = env.hexPt(ev.to);
    else return;
    const dur = Math.max(60, ev.dur * TICK / spd());
    const nCopy = ev.n && ev.n > 1 ? Math.min(ev.n, S.eff() ? 3 : 5) : 1;
    const base = Math.atan2(tgt.y - a0.y, tgt.x - a0.x);
    for (let i = 0; i < nCopy; i++) {
      const off = nCopy > 1 ? (i - (nCopy - 1) / 2) * w() * 0.34 : (ev.fan != null ? ev.fan * w() * 0.3 : 0);
      const ox = -Math.sin(base) * off, oy = Math.cos(base) * off;
      shoot(src, { x: a0.x + ox * 0.4, y: a0.y + oy * 0.4 }, { x: tgt.x + ox, y: tgt.y + oy }, { shape: ev.shape, c1, c2, dur, arc: ev.arc, spin: ev.spin, follow: nCopy === 1 && ev.fan == null ? follow : null, sz: (ev.big ? 1.45 : 1) * (ev.bounce ? 0.85 : 1) * (ev.cosmetic ? 0.8 : 1), full: !ev.cosmetic });
    }
  }
  function onAir(ev) { const t = env.unit(ev.id); if (t && t.alive !== false) knockUp(t, ev.dur * TICK / 1000, ev.high); }

  // ---------- 引擎事件：場上物件 ----------
  const objs = new Map();   // oid -> { o, R }
  function onObj(ev) {
    if (!S.enabled) return;
    if (ev.act === 'remove') { const q = objs.get(ev.oid); if (q) { S.removeObj(q.o); objs.delete(ev.oid); } return; }
    if (ev.act === 'move') { const q = objs.get(ev.oid); if (q && q.R) { const R = q.R; R.sx = R.x; R.sy = R.y; const p = env.xy(ev.xy); R.tx = p.x; R.ty = p.y; R.mt0 = S.now; R.mdur = Math.max(30, ev.dur * TICK / spd()); } return; }
    if (ev.act === 'mod') { const q = objs.get(ev.oid); if (q && q.R) q.R.goalSize = ev.scale || 1; return; }
    if (ev.act !== 'spawn') return;
    const src = ev.src != null ? env.unit(ev.src) : null, [c1, c2] = colors(src);
    if (ev.skin === 'discoball') return spawnBall(ev);
    if (ev.persist) {   // 染色格：整場留在地上
      const p = env.hexPt(ev.hex), o = FX.ground({ x: p.x, y: p.y, skin: ev.skin, r: 0.5, persist: true, c1, c2 });
      if (o) objs.set(ev.oid, { o });
      return;
    }
    spawnZone(ev, c1, c2);
  }
  function spawnZone(ev, c1x, c2x) {
    const [c1, c2] = pal(ev.skin, c1x, c2x), r = ev.r || 1, follow = ev.follow || null, fixed = env.hexPt(ev.hex);
    const dur = Math.max(400, ev.dur * TICK / spd());
    const o = S.addObj({ keep: true, drawU: (cv, ob, now) => {
      const p = (follow && P(env.unit(follow))) || fixed; if (!p) return; const R = (r + 0.5) * w() * 0.96, k = (now - ob.t0) / dur, al = k < 0.08 ? k / 0.08 : 1;
      cv.fillStyle = css(c1, 0.2 * al); cv.strokeStyle = css(c2, 0.7 * al); cv.lineWidth = 2; cv.beginPath(); cv.ellipse(p.x, p.y, R, R * 0.82, 0, 0, TAU); cv.fill(); cv.stroke();
      cv.setLineDash([6, 8]); cv.lineDashOffset = -now / 50; cv.beginPath(); cv.ellipse(p.x, p.y, R * 0.7, R * 0.7 * 0.82, 0, 0, TAU); cv.stroke();
    }, upd: (ob, dt) => { if (!S.reduced && rnd() < dt / 160) { const p = (follow && P(env.unit(follow))) || fixed; if (p) { const a = rnd() * TAU, rr = rnd() * (r + 0.4) * w(); S.part(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.8, 0, -w() * 0.8, { life: 600, size: 3, col: rnd() < 0.5 ? c1 : c2 }); } } } });
    if (o) { objs.set(ev.oid, { o }); o.until = S.now + dur * 1.5 + 1500; }   // 保險：remove 事件沒到也會自己收掉
  }
  // 迪斯可球：位置全部照引擎的 obj 事件（努努就站在球後面，是引擎真的在移動他）
  function spawnBall(ev) {
    const p0 = env.xy(ev.xy);
    const R = { x: p0.x, y: p0.y, sx: p0.x, sy: p0.y, tx: p0.x, ty: p0.y, mt0: S.now, mdur: 1, size: 1, goalSize: 1, ang: 0 };
    const o = S.addObj({ keep: true, upd: (ob, dt, now) => {
      const k = clamp((now - R.mt0) / R.mdur, 0, 1); R.x = lerp(R.sx, R.tx, k); R.y = lerp(R.sy, R.ty, k);
      R.size = lerp(R.size, R.goalSize, Math.min(1, dt / 240)); R.ang += dt / 160;
      if (S.trailOn() && rnd() < 0.5) S.part(R.x, R.y + w() * 0.2, (rnd() - 0.5) * 30, w() * 0.2, { life: 400, size: 3, col: ['#ffd24a', '#ff3fa8', '#3df2ff'][Math.floor(rnd() * 3)] });
    }, drawU: (cv) => { const g = cv.createRadialGradient(R.x, R.y + w() * 0.2, 0, R.x, R.y + w() * 0.2, w() * 0.5 * R.size); g.addColorStop(0, 'rgba(255,210,74,.35)'); g.addColorStop(1, 'rgba(255,210,74,0)'); cv.fillStyle = g; cv.fillRect(R.x - w(), R.y - w() * 0.5, w() * 2, w() * 1.8); },
    drawO: (cv) => {
      const r = w() * 0.34 * R.size, x = R.x, y = R.y - w() * 0.05;
      const gr = cv.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#b8c4d4'); gr.addColorStop(1, '#6a7890');
      cv.fillStyle = gr; cv.beginPath(); cv.arc(x, y, r, 0, TAU); cv.fill();
      cv.save(); cv.beginPath(); cv.arc(x, y, r, 0, TAU); cv.clip(); cv.strokeStyle = 'rgba(40,50,70,.55)'; cv.lineWidth = 1;
      for (let i = -3; i <= 3; i++) { const xx = x + Math.sin(R.ang + i * 0.5) * r * 0.9; cv.beginPath(); cv.moveTo(xx, y - r); cv.quadraticCurveTo(xx + Math.sin(R.ang + i * 0.5) * r * 0.3, y, xx, y + r); cv.stroke(); }
      for (let j = -2; j <= 2; j++) { cv.beginPath(); cv.moveTo(x - r, y + j * r * 0.33); cv.lineTo(x + r, y + j * r * 0.33); cv.stroke(); }
      cv.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) { const a = R.ang * 1.3 + i * 1.25; glow(cv, x + Math.cos(a) * r * 0.6, y + Math.sin(a * 1.4) * r * 0.55, r * 0.35, ['#ffd24a', '#ff3fa8', '#3df2ff'][i % 3], 0.9); }
      cv.restore();
      cv.strokeStyle = 'rgba(255,255,255,.7)'; cv.lineWidth = 1.5; cv.beginPath(); cv.arc(x, y, r, 0, TAU); cv.stroke();
    } });
    if (o) { objs.set(ev.oid, { o, R }); FX.burst({ x: p0.x, y: p0.y, skin: 'sparkle', n: 10, c1: '#ffd24a', c2: '#ff3fa8' }); }
  }

  // ---------- 引擎事件：引導 ----------
  const chans = new Map();
  function onChan(ev) {
    const old = chans.get(ev.id); if (old) { S.removeObj(old); chans.delete(ev.id); }
    if (!ev.on || !S.enabled) return;
    const u = env.unit(ev.id); if (!u) return;
    const [c1, c2] = colors(u), notes = ev.skin === 'notes';
    const o = S.addObj({ keep: true, drawO: (cv, ob, now) => {
      const a = P(u), tg = env.unit(ev.tgt); const b = tg && tg.alive !== false ? P(tg) : null; if (!a) return;
      cv.globalCompositeOperation = 'lighter';
      const pulse = S.reduced ? 1 : 0.8 + 0.2 * Math.sin(now / 45);
      if (b && !notes) {
        cv.lineCap = 'round';
        cv.strokeStyle = css(c1, 0.32); cv.lineWidth = w() * 0.5 * pulse; cv.beginPath(); cv.moveTo(a.x, a.y); cv.lineTo(b.x, b.y); cv.stroke();
        cv.strokeStyle = css(c1, 0.9); cv.lineWidth = w() * 0.18 * pulse; cv.stroke();
        cv.strokeStyle = '#fff'; cv.lineWidth = w() * 0.06; cv.stroke();
        glow(cv, b.x, b.y, w() * 0.45, c1, 0.7);
      }
      glow(cv, a.x, a.y, w() * (0.55 + (S.reduced ? 0 : 0.08 * Math.sin(now / 80))), notes ? c2 : c1, 0.7);
    }, until: S.now + Math.max(500, ev.dur * TICK / spd()) + 600 });
    if (o) chans.set(ev.id, o);
  }

  // ---------- 引擎事件：fx op ----------
  function onFx(ev) {
    const u = ev.src != null ? env.unit(ev.src) : null;
    const c = Object.assign({ u, tgt: null, star: u ? u.star : 1, castN: u ? u.castN : 1 }, { c1: colors(u)[0], c2: colors(u)[1] });
    if (!u) { c.c1 = '#ffd24a'; c.c2 = '#ffffff'; }
    const n = Object.assign({ k: 'fx', f: ev.name }, ev);
    delete n.e; delete n.name; delete n.src;
    n.f = ev.name;
    if (ev.name === 'shake') return S.shake(ev.power || 1);
    if (n.at === undefined && !n.center && (ev.name === 'aura' || ev.name === 'morph' || ev.name === 'spin' || ev.name === 'hop')) n.at = u ? [u.id] : [];
    if (n.frm === undefined && u && (ev.name === 'beam' || ev.name === 'tether' || ev.name === 'cone')) n.frm = [u.id];
    if (ev.name === 'cone' && n.to === undefined && u && u.target != null) n.to = [u.target];
    if (n.at === undefined && !n.center && ev.name !== 'sweep' && ev.name !== 'beam' && ev.name !== 'tether' && ev.name !== 'cone') n.at = n.to || [];
    try { execFx(n, c); } catch (e) { console.error(e); }
  }

  // ---------- 對外：事件處理 ----------
  // ---------- 對外：事件處理 ----------
  const api = {
    stage: S,
    setData(d) { fxData = d && d.units ? d : { units: {} }; },
    colors,
    // 舊版區域事件（addZone）：把整塊範圍的格子畫成地面色塊
    hexes(pts, src) {
      if (!S.allow('ground')) return;
      const [c1] = src ? colors(src) : ['#ffd24a']; const r = w() * 0.5;
      S.add('u', 420 * S.slow(), (cv, p) => { cv.fillStyle = css(c1, 0.3 * (1 - p)); cv.strokeStyle = css(c1, 0.8 * (1 - p)); cv.lineWidth = 2; for (const q of pts.slice(0, 24)) { cv.beginPath(); cv.ellipse(q.x, q.y, r * 0.95, r * 0.8, 0, 0, TAU); cv.fill(); cv.stroke(); } });
    },
    line(a, b, kind, src) { const [c1, c2] = src ? colors(src) : ['#9ad0ff', '#fff']; if (kind === 'beam') FX.beam({ x: a.x, y: a.y, tx: b.x, ty: b.y, c1, c2, dur: 0.3 }); else if (src) shoot(src, a, b, { shape: 'orb', c1, c2, sz: 0.7 }); },
    spawn(u) { const p = P(u); if (p) { const [c1, c2] = colors(u); FX.burst({ x: p.x, y: p.y, c1, c2, n: 8 }); FX.shockwave({ x: p.x, y: p.y, r: 0.8, thin: true, c1 }); } },
    resize() { S.resize(); },
    tick(dt) { S.step(dt); },
    clear() { S.clear(); objs.clear(); chans.clear(); },
    busy: () => S.busy(),
    dbg: () => ({ objs: objs.size, balls: [...objs.values()].filter((q) => q.R).map((q) => ({ x: q.R.x, y: q.R.y })), projs: S.projN(), chans: chans.size, pos: env.units().filter((u) => u.alive !== false).map((u) => { const q = env.pos(u.id); return { k: u.key, s: u.side, x: q.x, y: q.y }; }) }),
    // 戰鬥開始：被動演出（努努的球等）
    start() {
      for (const u of env.units()) {
        const d = udef(u); if (!d || !d.pas) continue;
        for (const p of d.pas) if (p.on === 'start') run(p.nodes, ctxOf(u, enemiesOf(u)[0] || null), 0);
      }
    },
    cast(u) {   // 前搖：蓄力光
      const [c1, c2] = colors(u); const p = P(u); if (!p) return;
      FX.charge({ id: u.id, c1, c2 });
    },
    fire(u, ev) {   // 技能生效：瞬間的蓄力收尾；真正的演出（位移、投射物、特效）由引擎事件逐一帶出
      u.castN = (u.castN || 0) + 1;
      api.lastFire = { key: u.key, id: u.id, n: u.castN, at: performance.now() }; api.fires = (api.fires || 0) + 1;
      const d = udef(u), tgt = ev.tgt != null ? env.unit(ev.tgt) : null;
      const c = ctxOf(u, tgt || enemiesOf(u)[0] || null);
      const p = P(u); if (p) { FX.flash({ x: p.x, y: p.y, skin: 'light', c1: c.c1 }); FX.shockwave({ x: p.x, y: p.y, r: 0.7, thin: true, c1: c.c1 }); }
      if (d && d.eng) {
        if (!d.strong) generic(u, d, c);
        else if (d.ar && d.ar[1] >= 1 && !d.area) areaHint(u, d, c);
        return;
      }
      generic(u, d, c); run(tokNodes(d && d.tok), c, 0);
    },
    atk(u, ev) {
      const t = env.unit(ev.tgt); if (!t) return;
      u.atkN = (u.atkN || 0) + 1; u.lastRanged = !!ev.ranged; u.lastAtkCrit = false;
      const d = udef(u);
      if (d && d.pas) for (const p of d.pas) if (p.on === 'attack' && p.n && u.atkN % p.n === 0) run(p.nodes, ctxOf(u, t), 0);
      if (!ev.ranged) return;
      const a = P(u), b = P(t); if (!a || !b) return;
      const [c1, c2] = (d && d.bc) || colors(u);   // bc＝普攻自己的顏色（照實況對的；沒有就用技能色）
      let shape = 'orb'; if (d && d.bs && RANGED_SHAPE.has(d.bs)) shape = d.bs;
      const info = { crit: false }; u.lastAtk = info;
      shoot(u, a, b, { shape, c1, c2, sz: 0.62, speed: 15, follow: t.id, arrive: () => { const q = P(t); if (q && !(t.hitAt && S.now - t.hitAt < 60)) { t.hitAt = S.now; FX.hit({ x: q.x, y: q.y, c1, crit: info.crit, ang: Math.atan2(q.y - a.y, q.x - a.x) }); } } });
    },
    dmg(t, ev, src) {
      let [c1] = colors(src || t);
      const p = P(t); if (!p) return;
      if (ev.tag === 'atk') {
        const sd = src && udef(src); if (sd && sd.bc) c1 = sd.bc[0];
        if (src && src.lastRanged) { if (src.lastAtk) src.lastAtk.crit = !!ev.crit; return; }
        const sp = src ? P(src) : null, ang = sp ? Math.atan2(p.y - sp.y, p.x - sp.x) : null;
        S.after(60, () => { const q = P(t) || p; FX.hit({ x: q.x, y: q.y, c1, crit: !!ev.crit, melee: true, ang }); });
        return;
      }
      if (ev.tag === 'ot' || ev.tag === 'burn') return;
      if (t.hitAt && S.now - t.hitAt < 90) return;   // 同一個單位短時間內的連續命中只畫一次，省效能
      t.hitAt = S.now;
      FX.hit({ x: p.x, y: p.y, c1, crit: !!ev.crit });
    },
    shield(t, ev) { if (ev.amt > 0 && t) { const now = S.now; if (t.shAt && now - t.shAt < 200) return; t.shAt = now; FX.shield({ id: t.id }); } },
    heal(t, ev) { if (ev.amt > 0 && t) { const p = P(t); if (p && !(t.hlAt && S.now - t.hlAt < 250)) { t.hlAt = S.now; FX.heal({ x: p.x, y: p.y }); } } },
    death(t, ev, killer) {
      const p = P(t); if (!p) return; const [c1] = colors(t);
      FX.death({ x: p.x, y: p.y, c1, big: !!t.boss });
      if (t.boss) S.shake(2);
      const d = udef(t); if (d && d.pas) for (const q of d.pas) if (q.on === 'death') run(q.nodes, ctxOf(t, killer || null), 0);
      if (killer) { const kd = udef(killer); if (kd && kd.pas) for (const q of kd.pas) if (q.on === 'kill') run(q.nodes, ctxOf(killer, enemiesOf(killer)[0] || null), 0); }
      const o = t.stunObj; if (o) { S.removeObj(o); t.stunObj = null; }
    },
    hpLow(t) {
      const d = udef(t); if (!d || !d.pas) return;
      for (const q of d.pas) if (q.on === 'hpBelow' && q.n && !(t.hpDone && t.hpDone[q.n]) && t.hp / t.hpMax < q.n) { t.hpDone = t.hpDone || {}; t.hpDone[q.n] = 1; run(q.nodes, ctxOf(t, enemiesOf(t)[0] || null), 0); }
    },
    status(t, kind, on) {
      if (kind === 'stun') { if (on && !t.stunObj) t.stunObj = FX.stun({ id: t.id }); else if (!on && t.stunObj) { S.removeObj(t.stunObj); t.stunObj = null; } }
    },
    move(u, from, to, ev) {   // from/to 是格座標；位置本身由 battle.js 照事件走，這裡只加拖尾、殘影、落地等演出
      const [c1, c2] = colors(u);
      const ms2 = Math.max(60, (ev.dur || 4) * TICK / spd());
      const st = ev.style || 'walk';
      if (st === 'walk' || st === 'push') return;
      if (st === 'blink') { const p = env.hexPt(from), q = env.hexPt(to); FX.burst({ x: p.x, y: p.y, c1, c2, skin: 'shadow', small: true }); FX.shockwave({ x: q.x, y: q.y, r: 0.7, thin: true, c1 }); ghost(u, c1, 2, 40); return; }
      if (st === 'leap') {
        if (!S.reduced) S.add('u', ms2, (cv, p) => { const q = env.basePos(u.id); if (!q) return; const k = Math.sin(Math.PI * p); cv.fillStyle = `rgba(0,0,0,${0.28 * (1 - k * 0.5)})`; cv.beginPath(); cv.ellipse(q.x, q.y + w() * 0.2, w() * 0.3 * (1 - k * 0.35), w() * 0.12 * (1 - k * 0.35), 0, 0, TAU); cv.fill(); });
        const p = env.hexPt(to); S.after(ms2, () => { FX.shockwave({ x: p.x, y: p.y + w() * 0.1, r: 0.8, thin: true, c1: '#ffffff' }); FX.burst({ x: p.x, y: p.y + w() * 0.2, small: true, c1: '#d8c8a8', c2: '#ffffff', skin: 'spore', n: 5 }); });
      }
      if (st === 'knockback' || st === 'pull') { if (S.trailOn()) trailOn(u, '#ffffff', ms2); return; }
      if (!S.trailOn()) return;
      trailOn(u, c1, ms2 + 40); ghost(u, c1, 2, 40);
    },
    proj: onProj, air: onAir, obj: onObj, chan: onChan, fxEv: onFx,
  };

  function generic(u, d, c) {   // 沒有明確演出的技能：目標身上爆一下＋依範圍提示補一圈
    const t = c.tgt, p = t && P(t);
    if (p) { FX.burst({ x: p.x, y: p.y, c1: c.c1, c2: c.c2, n: 9 }); FX.flash({ x: p.x, y: p.y, c1: c.c1 }); }
    if (d && d.ar) areaHint(u, d, c);
  }
  function areaHint(u, d, c) {
    const [k, r] = d.ar, t = c.tgt, sp = P(u), tp = t && P(t);
    if (k === 'around' && tp) FX.shockwave({ x: tp.x, y: tp.y, r, c1: c.c1 });
    else if (k === 'adj' && sp) FX.shockwave({ x: sp.x, y: sp.y, r: 1, c1: c.c1 });
    else if (k === 'cone' && sp && tp) FX.cone({ x: sp.x, y: sp.y, tx: tp.x, ty: tp.y, r, c1: c.c1, c2: c.c2, dur: 0.35 });
    else if (k === 'line' && sp && tp) FX.beam({ x: sp.x, y: sp.y, tx: tp.x, ty: tp.y, along: true, c1: c.c1, c2: c.c2, dur: 0.3 });
    else if (k === 'all') FX.sweep({ c1: c.c1, c2: c.c2, dur: 0.6 });
  }
  function tokNodes(tok) {
    const out = [];
    for (const s of tok || []) {
      const m = /^projectile:(\w+)(?:\(([^)]*)\))?$/.exec(s);
      if (m) { const fl = (m[2] || ''); out.push({ k: 'proj', t: 0, shape: m[1], speed: 14, to: 'tgt', arc: /arc/.test(fl), pierce: /pierce/.test(fl), count: /fan/.test(fl) ? 3 : 1, spread: /fan/.test(fl) ? 'fan' : undefined, hit: [{ k: 'fx', f: 'burst', t: 0, at: 'tgt', small: true }] }); continue; }
      if (s === 'slash') out.push({ k: 'fx', f: 'slash', t: 0, at: 'tgt' });
      else if (s === 'shockwave') out.push({ k: 'fx', f: 'shockwave', t: 0.05, at: 'tgt', r: 1 });
      else if (s === 'rain') out.push({ k: 'fx', f: 'rain', t: 0, at: 'tgt', n: 6, r: 2 });
      else if (s === 'shake') out.push({ k: 'fx', f: 'shake', t: 0.05, power: 1 });
      else if (s === 'beam') out.push({ k: 'fx', f: 'beam', t: 0, dur: 0.4 });
    }
    return out;
  }
  return api;
}

return {get createFx(){return createFx;}};})();
mods.battle=(()=>{let sfx,starsEl,createFx,reducedMotion;bind.push(()=>{sfx=mods.audio.sfx;starsEl=mods.stars.starsEl;createFx=mods.script.createFx;reducedMotion=mods.settings.reducedMotion;});
// 戰鬥播放（SPEC 5.6）：照 Result.events 的 t 排程，不重算任何戰鬥邏輯。
// playBattle(boardEl, result, opts) -> Promise<void>
//   opts: { speed:1|2|4（預設 2）, onEvent(ev, api), skip:AbortSignal,
//           spriteIndex(key)->0..99（頭像在 champions.webp 的格序，沒給就顯示中文名第一個字）,
//           spriteUrl（預設 '../icons/s19/champions.webp'）, noEndSound:bool }
// 另外匯出 setBattleSpeed(n)、getBattleSpeed()，戰鬥中可隨時改速度。




const TICK_MS = 50;
const ROW_H = 0.866;
let speed = 2;
function setBattleSpeed(n) { if (n === 1 || n === 2 || n === 4) speed = n; }
function getBattleSpeed() { return speed; }

// 技能演出設定（data/fx.json，由 tools/build_fx.py 從 research/ability_fx.json 轉出）；兩個頁面（滴答克、教學頁）共用這一份
const fxJson={"version":2,"source":"research/ability_fx.json","note":"純畫面設定（配色、一句動作描述、備用提示）：位移、投射物、特效都由引擎事件帶出，不影響戰鬥數值。由 tools/build_fx.py 轉出。｜2026-11-20：42 隻的顏色／普攻形狀照 PBE 實況畫面對過（src=stream）","units":{"Elise":{"c":["#8b3fd9","#f1e9ff"],"vis":"第一次施放頭像外框變紫並放大一下（變身）；朝目標吐一團白色蛛網，飛行中會被路上第一個敵人擋下，命中處炸開蛛絲並出現暈眩圈","eng":true,"strong":true,"area":true,"tok":["morph","projectile:web","burst","flash"]},"Gnar":{"c":["#d98a2b","#7a5a3a"],"vis":"每第 3 下普攻改丟一顆拋物線巨石，落點小型碎石噴發","eng":true,"strong":true,"area":true,"tok":["projectile:rock(arc)","burst","shake"]},"Katarina":{"c":["#c2213f","#ffd9e0"],"vis":"原地快速轉一圈（刀刃環掃過相鄰 6 格），停下後對當前目標補一記大斬擊弧，被掃到的都冒愛心","eng":true,"strong":true,"ar":["adj",1],"tok":["spin","slash","flash"]},"Kayn":{"c":["#b3122f","#2b2b3d"],"vis":"慨影壓低身體沿目標方向滑過 2 格，鐮刀拖出紅黑色殘影，經過的敵人身上各出現一道斬痕；停在線的末端（沒有空格就停在最近的空格）","eng":true,"strong":true,"tok":["pathDash","trail","afterimage","slash","morph"]},"Kennen":{"c":["#40e0f0","#ffffff"],"vis":"青色鋸齒閃電從凱能本體直接連到相鄰敵人身上，凱能頭部也是青綠光（心鋼造型）","eng":true,"strong":true,"area":true,"tok":["aura","tether","flash"],"src":"stream"},"Kobuko":{"c":["#a8f020","#ff3fd0"],"vis":"柯布柯整隻變很大、身體是螢光黃綠色加紫色、外圈一層洋紅色亮邊，身上不斷跳綠色補血數字（+123、+128）；打到人時炸出洋紅／綠／藍的彩色碎條和黃色星形閃光","eng":true,"strong":true,"area":true,"tok":["aura","burst"],"src":"stream"},"Lillia":{"c":["#e06aa8","#ffe3f1"],"vis":"揮杖打向目標，目標腳下擴散 1 格粉色花粉衝擊波","eng":true,"strong":true,"area":true,"ar":["around",1],"tok":["slash","shockwave","ground"]},"Neeko":{"c":["#ff7ac8","#7ad7ff"],"vis":"連射 3 條彩帶（粉、藍、紫各一），命中時灑彩紙","eng":true,"strong":true,"tok":["projectile:ribbon","burst"]},"Olaf":{"c":["#d1361f","#ffb347"],"vis":"死亡瞬間原地爆出紅色衝擊波、外框變紅並持續冒火星，表示狂暴中","eng":true,"strong":true,"area":true,"tok":["morph","shockwave","aura"],"bc":["#ff8a2a","#ffc24a"],"src":"stream"},"Sett":{"c":["#e0832b","#ffd9a8"],"vis":"左右各一記重拳（兩道橘色弧光＋輕微震動）","eng":true,"tok":["slash","flash","shake"]},"Taric":{"c":["#5ad1ff","#ffd6f5"],"vis":"塔里克與被保護的友軍之間拉一條寶石光鏈，兩人身上各套一層藍色晶盾","eng":true,"strong":true,"tok":["tether","flash"]},"Varus":{"c":["#8a2be2","#ff5a5a"],"vis":"朝天射出一把箭，目標與周圍 1 格落下一陣箭雨，地面留下短暫範圍圈","eng":true,"strong":true,"area":true,"ar":["around",1],"tok":["rain","ground","flash"]},"Yunara":{"c":["#ffd24a","#ff8ad8"],"vis":"施放後每下普攻旁邊多飛一顆小光球跟著打到目標","eng":true,"strong":true,"area":true,"tok":["projectile:orb","aura"],"bc":["#ffd24a","#c04ad0"],"bs":"bolt","src":"stream"},"Ziggs":{"c":["#f0409a","#3fe04a"],"vis":"腳邊一圈煙火狀的紅粉＋綠色碎片排成圓環，中間幾顆桃紅色圓球；另一張丟出一顆白綠色帶粉紅邊的圓球炸彈","eng":true,"strong":true,"area":true,"ar":["around",1],"tok":["projectile:bomb(arc)","burst","shockwave","shake"],"bc":["#2fe04a","#c8fff0"],"bs":"bolt","src":"stream"},"Zoe":{"c":["#ff9f43","#8f6bff"],"vis":"柔依先把球往身後拋、轉身一拍打出去，球帶彩色尾巴直線飛向最遠的敵人；打死人就帶著剩餘傷害彈向下一個","eng":true,"strong":true,"area":true,"bs":"ball","tok":["projectile:ball","trail","burst"]},"Annie":{"c":["#ff5a1f","#ffc94a"],"vis":"朝目標噴出扇形火焰（2 格深），被燒到的敵人身上留小火苗","eng":true,"strong":true,"area":true,"ar":["cone",2],"tok":["cone","burst","aura"]},"Ashe":{"c":["#6fd3ff","#e8f8ff"],"vis":"強化期間每下普攻變成一次射出 3 支冰藍色箭（小扇形收束到同一目標）","eng":true,"strong":true,"tok":["projectile:arrow(fan)","flash"]},"Camille":{"c":["#4ad0c8","#dfe8ee"],"vis":"擊殺後射出鉤索、沿鉤索衝到下一個目標；主動是一記半月形掃腿","eng":true,"strong":true,"area":true,"ar":["cone",2],"tok":["tether","trail","cone","slash"]},"Ezreal":{"c":["#ffcf3a","#3aa0ff"],"vis":"先射一發金色魔彈在目標身上留標記，緊接第二發把標記引爆（1 格爆炸；每第 3 次是 2 格大爆炸）","eng":true,"strong":true,"area":true,"ar":["around",2],"bs":"bolt","tok":["projectile:bolt","flash","burst","shockwave"]},"Gragas":{"c":["#ff7ab0","#ffd24a"],"vis":"身邊冒彩色泡泡與音符 5 秒，普攻命中多一圈酒花","eng":true,"strong":true,"area":true,"tok":["aura","burst"]},"Illaoi":{"c":["#1fe0c0","#7a2be0"],"vis":"一根比棋子高好幾倍的觸手從上方直直拍下：青綠＋紫色漩渦紋，根部一團青紫漩渦；另兩張顏色偏暗紫、暗紅，落點有青白色四角星閃光","eng":true,"strong":true,"area":true,"ar":["line",0],"tok":["ground(line)","shake","flash"],"src":"stream"},"Jax":{"c":["#8a5cff","#3df2ff"],"vis":"燈柱重擊目標；電子舞曲啟動時再向最近 2 名敵人各射一道霓虹光束","eng":true,"tok":["slash","beam","flash"]},"Karthus":{"c":["#3fd68a","#ff6a2a"],"vis":"施法時他腳下一團綠色光＋白色煙圈；同時場上遠處有一道半透明青綠色光柱從上面落下；另一次目標腳下是橘紅色符文圓圈，他本體變成橘色火焰","eng":true,"strong":true,"area":true,"tok":["telegraph","rain","shake"],"wind":{"name":"telegraph","at":"current","r":0},"src":"stream"},"Lucian":{"c":["#f5e9c8","#6a8cff"],"vis":"側滑一格（留殘影），雙槍連開 2 發光彈","eng":true,"strong":true,"bs":"bolt","tok":["pathDash","afterimage","projectile:bolt"]},"Lulu":{"c":["#f5c84a","#ffd9a0"],"vis":"被她加持的友軍身上套一個金色圓環，周圍飄幾顆米黃色小星星","eng":true,"strong":true,"area":true,"tok":["tether","aura","morph","ground(follow)"],"bc":["#ff2fa0","#7de03a"],"bs":"spike","src":"stream"},"Lux":{"c":["#e40c9c","#fcfc9c"],"vis":"稜鏡是粉紅色四角星（中心一顆藍寶石）；拉克絲到稜鏡有一條細淡黃線，稜鏡射出兩道光：粗的是亮桃紅外緣（邊緣有網點）包金黃核心、帶小音符，細的是純金黃色折向另一邊","eng":true,"strong":true,"ar":["around",2],"tok":["projectile:prism(arc)","beam","flash"],"src":"stream"},"Nasus":{"c":["#e6c15a","#7a4bd6"],"vis":"腳下展開 2 格金色華麗領域並持續 5 秒，每秒脈動一次（友軍冒綠字、敵人冒傷害）","eng":true,"strong":true,"area":true,"tok":["ground(persist)","shockwave"]},"Qiyana":{"c":["#ff4a4a","#3fd98a","#4aa8ff","#ffd24a"],"vis":"沿目標方向衝刺穿過 2 格，環刃拖出當次顏色的尾巴（紅／綠／藍／金），穿過的敵人身上各一道斬痕","eng":true,"strong":true,"tok":["pathDash","trail","slash","flash"]},"RenataGlasc":{"c":["#9b4ad9","#5ad98a"],"vis":"丟出一張發紫光的樂譜，命中後毒霧濺到旁邊 2 名敵人，中毒者頭上冒紫色泡泡","eng":true,"strong":true,"area":true,"ar":["around",2],"bs":"note","tok":["projectile:note","burst","aura"]},"Renekton":{"c":["#2fa86a","#ffb347"],"vis":"雷尼克頓頭像永久放大一級，接著轉一圈掃過相鄰敵人","eng":true,"strong":true,"ar":["adj",1],"tok":["morph","spin","flash"],"bc":["#f7e04a","#4fb8f0"],"src":"stream"},"Samira":{"c":["#ff5a3a","#ffd9a8"],"vis":"雙槍掃射：10 道細亮彈道快速打在目標身上，槍口有火光","eng":true,"strong":true,"bs":"bullet","tok":["projectile:bullet","flash"]},"Seraphine":{"c":["#ff8ad8","#7ad7ff"],"vis":"瑟菈紛原地擺姿勢 2.5 秒（腳下聚光燈），一串彩色音符連續飛向目標","eng":true,"strong":true,"bs":"note","tok":["channel","projectile:note","aura"]},"Tristana":{"c":["#ff5aa8","#ffd24a"],"vis":"依序朝 3 名敵人各拋一顆炸彈並引爆，最後一顆是大爆炸","eng":true,"strong":true,"area":true,"tok":["projectile:bomb(arc)","burst","shake"]},"Amumu":{"c":["#7fd18a","#d9e8c8"],"vis":"同時甩出 4 條繃帶各纏住一名敵人，被纏的敵人暈眩","eng":true,"strong":true,"tok":["tether","flash"]},"Bard":{"c":["#ffd24a","#7ad7ff"],"vis":"一小群發光小精靈排成一波沿直線飄過去，每穿過一個敵人就少幾隻、變暗一點","eng":true,"strong":true,"bs":"spirit","tok":["projectile:spirit(pierce)","trail","flash"]},"Braum":{"c":["#24a080","#ffc93a"],"vis":"以布郎姆為中心的大圓：圓內是藍綠色漫畫網點（halftone），一圈亮青綠線，最外圍是黃橘色鋸齒狀的漫畫爆炸邊框；兩場長得一樣","eng":true,"strong":true,"area":true,"ar":["adj",1],"tok":["shockwave","shake","ground"],"src":"stream"},"Briar":{"c":["#d9304f","#ffb3c0"],"vis":"把零食踢向 3 格內最遠的敵人，零食落地後布蕾爾沿同一路線滑過去咬一口（1 格衝擊），接著 3 下狂暴劈砍","eng":true,"strong":true,"area":true,"ar":["around",1],"tok":["projectile:snack(arc)","trail","burst","slash"]},"Draven":{"c":["#ffb347","#3a3a4a"],"vis":"丟出一張大唱片圓盤旋轉飛向目標，命中後在原地留下旋轉的漩渦 3 秒，每秒切一次","eng":true,"strong":true,"area":true,"tok":["projectile:disc","ground(persist)","spin"],"bc":["#b9a2f2","#ffffff"],"bs":"blade","src":"stream"},"Ekko":{"c":["#3fe0c8","#ffffff"],"vis":"艾克身上閃過倒帶殘影（藍綠色），接著揮棒","eng":true,"strong":true,"tok":["afterimage","slash"]},"Evelynn":{"c":["#c84ad9","#3a1a4a"],"vis":"尾鞭甩出半圓弧，主目標身上多一道重擊閃光","eng":true,"strong":true,"area":true,"ar":["cone",2],"tok":["cone","slash","flash"]},"Galio":{"c":["#e6c15a","#ffffff"],"vis":"朝「打最痛的那個敵人」吹出一道捲風，命中後把他吹暈","eng":true,"strong":true,"area":true,"tok":["projectile:gust","trail","flash"]},"KSante":{"c":["#e6a23a","#3a2a1a"],"vis":"卡桑帝頂著盾衝撞，把目標往後推一格並撞暈旁邊的人，接著補一棍","eng":true,"strong":true,"area":true,"tok":["trail","displace(knockback)","shockwave","shake"]},"KaiSa":{"c":["#b06aff","#ff7ac8"],"vis":"每 3 下普攻背後彈出 3 枚紫色小飛彈，繞弧線追上目標","eng":true,"strong":true,"area":true,"tok":["projectile:missile(arc)","flash"]},"Malzahar":{"c":["#5fe85a","#3fd8c8"],"vis":"一道連續的綠色光束（中間白芯，靠近馬爾札哈那端偏黃綠、中段偏藍綠）連到目標身上，目標腳下一個綠色圓圈；馬爾札哈自己手上、身上是黃綠色光","eng":true,"strong":true,"area":true,"tok":["channel","beam","shockwave"],"src":"stream"},"Senna":{"c":["#3fe0c8","#1a2a3a"],"vis":"開一槍在目標身上留下發光標記；第二次施放打中標記時爆出亮光","eng":true,"strong":true,"bs":"bolt","tok":["projectile:bolt","flash","aura"]},"Swain":{"c":["#6a2fd0","#3fc8ff"],"vis":"變身後張開一對很大的翅膀，翅膀是藍青色和紫洋紅色；腳下一圈深紫色的大圓環（半徑約 1.5～2 格）；會飛出深紫色的烏鴉形狀","eng":true,"strong":true,"area":true,"tok":["morph","aura","tether"],"src":"stream"},"Syndra":{"c":["#ffb347","#7ad7ff"],"vis":"跳起扣殺一顆排球砸中目標，球高高彈起落到後排另一名敵人頭上","eng":true,"strong":true,"area":true,"bs":"ball","tok":["projectile:ball(arc)","burst","flash"]},"Tibbers":{"c":["#ff5a1f","#3a1a0a"],"vis":"狂暴時放大、外框著火","eng":true,"strong":true,"tok":["morph","aura"]},"Viego":{"c":["#e0207a","#ff8a5a"],"vis":"好幾把細長的洋紅色劍圍住目標、劍尖朝內，劍柄是橘粉色火焰花形；刺出去時拖洋紅光痕","eng":true,"strong":true,"tok":["telegraph","projectile:blade","flash"],"src":"stream"},"Ahri":{"c":["#ff6a2a","#e83a6a"],"vis":"腳下一圈紅粉色圓環，環上繞著 5 顆橘紅色火苗形的狐火（黃芯、紅邊）；另一張腳下是粉紅光","eng":true,"strong":true,"area":true,"bs":"orb","tok":["projectile:orb(arc)","projectile:heart","aura","burst"],"src":"stream"},"Alistar":{"c":["#b07a4a","#ffd24a"],"vis":"牛頭猛撞目標，3 格內的敵人全部被震到半空（頭像往上彈起再落下），地面一圈大衝擊波","eng":true,"strong":true,"area":true,"ar":["around",3],"tok":["slash","shockwave","displace(knockup)","shake"]},"Alune":{"c":["#2fd8a8","#efe8ff"],"vis":"天上打下一道白紫色、閃電狀的光束到目標身上；地面展開很大的青綠色圓圈（內有同心條紋），外緣有青色電光 #40e8f0 和一圈紫粉色尖刺 #b04ad0","eng":true,"strong":true,"area":true,"ar":["around",2],"bs":"orb","tok":["rain","ground","projectile:orb"],"src":"stream"},"Aurora":{"c":["#e0508a","#b4fcfc"],"vis":"施放瞬間原地出現一個桃粉色圓形傳送門，門上有一對粉紅＋天藍的兔耳，周圍幾顆小黃星（兩場都看到）；隨後棋盤上留下斜貫全場的淡金黃色半透明光帶（#fcfcb4），沿線六個敵人同時跳出大量藍色魔法傷害數字","eng":true,"strong":true,"ar":["line",0],"tok":["blink","afterimage","beam","shake"],"src":"stream"},"Garen":{"c":["#3a8cff","#ff5ad8"],"vis":"大劍往前一劈，一道弧形劍氣往前推 2 格","eng":true,"strong":true,"ar":["cone",2],"tok":["projectile:wave","cone","flash"]},"Graves":{"c":["#ff8a3a","#3a3a3a"],"vis":"滑到目標旁，接下來 2 槍各噴出 5 顆散彈的扇形","eng":true,"tok":["trail","cone","flash"]},"Jhin":{"c":["#c8482a","#f2e01a"],"vis":"身邊浮著 3 把紅橘色的提琴（底座像骷髏），跟著他一起動","eng":true,"strong":true,"area":true,"tok":["tether","projectile:bullet","burst"],"bc":["#f2e01a","#2ab8f0"],"bs":"bullet","src":"stream"},"Jinx":{"c":["#ffb0a0","#8fe8d8"],"vis":"一整串小火箭連發：每枚後面拖一條很寬的蜜桃粉緞帶、緞帶中間有一條薄荷綠細線，沿路撒米黃色小星星和愛心；火箭頭是小玩偶臉；槍口是黃色星形閃光；落點炸開一團紫粉色（#d060e0）帶波浪圈線的爆炸","eng":true,"strong":true,"area":true,"tok":["projectile:rocket(arc)","trail","burst"],"src":"stream"},"Kayle":{"c":["#f0552a","#ffc23a"],"vis":"腳邊立起一圈紅橘色刀身、金色劍柄的劍（6～10 把），身上冒橘色火柱；時間到後細橘線從天而降，整個棋盤插滿小把暗紅色的劍","eng":true,"strong":true,"area":true,"ar":["around",2],"tok":["aura","rain","ground","shake"],"bc":["#ff5a1f","#ffc24a"],"bs":"blade","src":"stream"},"Leona":{"c":["#ffcf3a","#ff8a3a"],"vis":"太陽光束一道道從天上打在附近敵人身上（每道間隔很短）","eng":true,"tok":["rain","flash"],"bc":["#ff2fb0","#7ad8f0"],"src":"stream"},"Locke":{"c":["#3fe0c8","#3a1a4a"],"vis":"朝 4 格內最遠的敵人連射 3 根靈魂釘（穿過路上的敵人並留下標記），接著瞬移到他身邊爆發","eng":true,"strong":true,"area":true,"bs":"spike","tok":["projectile:spike(pierce)","blink","afterimage","burst"],"bc":["#3fe06a","#6a3ad6"],"src":"stream"},"Mel":{"c":["#ffcf3a","#ff7ac8"],"vis":"金色小飛彈一波波繞弧線飛向最近的 3 名敵人","eng":true,"tok":["projectile:orb(arc)","flash"]},"Shyvana":{"c":["#ff5a1f","#7a2bbf"],"vis":"變身時放大、外框變成龍焰；之後每第 3 下普攻在目標周圍噴 1 格火焰","eng":true,"strong":true,"area":true,"tok":["morph","burst","aura"],"bc":["#f6a45b","#fff28e"],"src":"stream"},"Thresh":{"c":["#3fe08a","#1a3a2a"],"vis":"3 條幽綠色靈魂鎖鏈連著附近 3 名敵人 3 秒，光點沿鎖鏈流回瑟雷西","eng":true,"strong":true,"tok":["tether","aura"]},"Vayne":{"c":["#d9304f","#2b2b3d"],"vis":"施放或被打到時往旁邊翻滾一格（留殘影）；強化的箭變成粗的紅色弩箭","eng":true,"strong":true,"area":true,"tok":["pathDash","afterimage","projectile:arrow"]},"Wukong":{"c":["#e6c15a","#d9304f"],"vis":"悟空甩出 6 個半透明分身朝六個方向衝出 2 格再飛回來，穿過的敵人身上各一道棍影，回來時金光吸回悟空身上","eng":true,"strong":true,"tok":["projectile:clone(radial,return)","afterimage","flash"]},"Xayah":{"c":["#ffe8d8","#ff4a6a"],"vis":"從身上往前扇形連射一整排米白色刀片狀羽毛，每根後面拉一條細細的紅粉色線；命中處閃一個青綠色十字星光；剎雅腳下是洋紅色光；射出去的羽毛會插在地上排成一列白色尖刺，之後再飛回來","eng":true,"tok":["projectile:feather","flash"],"bc":["#e0307a","#ffe8d8"],"bs":"feather","src":"stream"},"Yasuo":{"c":["#7ad7ff","#ffffff"],"vis":"犽宿帶著風刃殘影沿目標方向突刺穿過 2 格；每第 3 次把目標捲上半空、在空中連斬，1 秒後重摔落地炸出衝擊波","eng":true,"strong":true,"area":true,"ar":["around",[1,1,2]],"tok":["pathDash","trail","slash","displace(knockup)","shockwave","shake"]},"Yone":{"c":["#ff5a5a","#5a8cff"],"vis":"犽凝身邊分出靈體殘影，紅藍雙刀快速連砍目標與旁邊的人，最後一刀是橫掃的大弧光","eng":true,"strong":true,"tok":["afterimage","slash","shake"]},"Yorick":{"c":["#3fbf6a","#3a1a4a"],"vis":"約瑞科原地彈吉他，腳下 2 格暗綠色舞台區持續冒音符；最後一個音符炸出一圈大衝擊波","eng":true,"strong":true,"area":true,"tok":["ground(persist)","shockwave","shake"]},"Yuumi":{"c":["#ff8ad8","#3a3a4a"],"vis":"丟出一張旋轉唱片疊在目標頭上，接著唱片堆倒塌、碎片濺到附近敵人","eng":true,"strong":true,"area":true,"ar":["around",2],"tok":["projectile:disc","aura","burst"]},"Zac":{"c":["#7ac8f0","#ffffff"],"vis":"本體是淺藍色史萊姆（泳池派對造型）；落地處爆開一大片半透明水藍色水花＋白色泡沫","eng":true,"strong":true,"area":true,"ar":["around",1],"tok":["leap","shockwave","displace(knockup)","shake"],"wind":{"name":"morph","at":"self","skin":"squash"},"src":"stream"},"AkaliKDA":{"c":["#f45ec6","#5a1848","#c8ff3a"],"vis":"噴漆是螢光桃紅：地上留桃紅色潑漆（上面還畫了塗鴉臉），漆痕邊緣和舊漆是深紫紅；經過的地方立起一道道桃紅直條光柱。點燃那一格整片亮桃紅，敵人身上爆白色四角星芒。","eng":true,"strong":true,"area":true,"tok":["pathDash","trail","ground(persist)","burst","shake"],"src":"stream"},"AkaliTrueDamage":{"c":["#ffd24a","#3a3a4a"],"vis":"阿卡莉化成殘影對目標連砍 3 刀，瞬間出現在目標頭上丟下一顆炸彈，2 格大爆炸","eng":true,"strong":true,"area":true,"ar":["around",2],"tok":["slash","afterimage","blink","projectile:bomb","shockwave","shake"],"bc":["#ff9a2a","#ff2fa0"],"src":"stream"},"Aphelios":{"c":["#7dffd8","#b06aff"],"vis":"向最近 3 名敵人各射一枚月刃，命中後碎成 16 片往外噴","eng":true,"strong":true,"area":true,"tok":["projectile:moon","burst","flash"],"bc":["#8ae0f5","#ffffff"],"bs":"orb","src":"stream"},"DrMundo":{"c":["#35d85a","#f2d24a"],"vis":"腳下一大圈亮綠色光環（約 2～3 格），圈裡散落白色股票走勢圖紙張和金幣，身上一直冒綠色 +數字、綠色 $ 符號（西裝造型的蒙多）","eng":true,"strong":true,"area":true,"tok":["aura","ground(follow)"],"src":"stream"},"Gwen":{"c":["#5ad1ff","#ffffff"],"vis":"戰場上方出現一把巨大的剪刀（張開橫跨整列），停一下後「喀嚓」合起來，目標所在的那一橫列被一道白光剪過","eng":true,"strong":true,"tok":["telegraph","slash(row)","shake","flash"],"wind":{"name":"telegraph","shape":"row","at":"current","skin":"scissors"}},"Janna":{"c":["#e0b060","#7fd8b0"],"vis":"平常：射出金黃色的小東方龍（龍形投射物，後面拖橘金色尾巴）各自飛向敵人；風暴：整個畫面四周被橘金色＋薄荷綠的祥雲／龍身捲起來包住（不是白色風暴雲）","eng":true,"strong":true,"area":true,"tok":["projectile:dragon","trail","sweep","aura"],"src":"stream"},"LeeSin":{"c":["#ffcf3a","#d9304f"],"vis":"第一下龍擊（金色龍形拳風＋2 格衝擊波）→ 迴旋踢把目標踢上半空 → 李星跳起一拳把人砸回地面（大震動）。目標身上有標記時最後一拳多一道白色核心爆光","eng":true,"strong":true,"area":true,"ar":["around",2],"tok":["slash","shockwave","spin","displace(knockup)","leap","burst","shake"]},"MissFortune":{"c":["#3df2ff","#ff3fa8"],"vis":"射出一顆像素風彈珠，在敵人之間「叮叮叮」連續彈跳最多 12 下，每彈一次變小一點、拖著方塊殘影","eng":true,"strong":true,"tok":["projectile:pinball(bounce)","trail","flash"]},"Mordekaiser":{"c":["#f0c020","#1a1a22"],"vis":"巨大的黑色爪臂從場邊伸出來，輪廓是黃色描邊光（M5 那次邊緣偏橘 #ff7a2a），釘頭錘灰白帶橘紅光；本體也是黑身黃描邊","eng":true,"strong":true,"area":true,"ar":["line",0],"tok":["ground(line)","displace(pull)","tether","shake"],"src":"stream"},"Nidalee":{"c":["#ff8a3a","#ffd24a","#3fd98a"],"vis":"獵豹形態：在敵人之間連跳 4 次，每跳一次爪擊更大；人形：丟一支標槍，目標周圍長出 3 朵花，半秒後花一起炸開","eng":true,"strong":true,"area":true,"ar":["around",1],"bs":"spear","tok":["leap","trail","burst","projectile:spear","telegraph"]},"NunuWillump":{"c":["#c8a8f5","#ff9ad8","#3df2ff"],"vis":"一顆比棋子還大的鏡面迪斯可球在場上滾：球面是淡紫/粉紅/白的小方格，外圍一圈白紫電光","eng":true,"strong":true,"area":true,"tok":["roller","trail","flash","aura"],"src":"stream"},"Pyke":{"c":["#c81e5a","#5a0f2a"],"vis":"兩條很長的深紅/洋紅色斬痕在棋盤下半交叉成一個大 X，橫跨半個棋盤","eng":true,"strong":true,"area":true,"tok":["blink","afterimage","slash","sweep","burst"],"src":"stream"},"Rell":{"c":["#ff8a3a","#b06aff"],"vis":"未騎乘：身邊立起 3 支喇叭，每秒一圈音波往外推；騎乘：連人帶馬跳進敵人最密的地方，3 格大衝擊波","eng":true,"strong":true,"area":true,"ar":["around",3],"tok":["ground(follow)","shockwave","leap","shake"]},"Taliyah":{"c":["#3ad0e8","#1f6fd8"],"vis":"一大片青藍色水浪橫掃過去，浪裡有白色浪花紋路，她整個人在浪裡（泳池派對造型，踩黃色衝浪板）","eng":true,"strong":true,"area":true,"ar":["line",0],"tok":["projectile:rock","blink","pathDash","trail","displace(knockup)"],"bc":["#dff5ea","#6fe0d0"],"bs":"spike","src":"stream"},"Teemo":{"c":["#8adf3a","#b06aff"],"vis":"拋出一顆大蘑菇，落地炸開 3 格的紫綠色孢子雲（中心最濃），被感染的敵人頭上有小病毒圖示","eng":true,"strong":true,"area":true,"ar":["around",3],"tok":["projectile:mushroom(arc)","burst","ground","aura"],"bc":["#97ef41","#ffe23a"],"bs":"orb","src":"stream"},"TwistedFate":{"c":["#ffd24a","#d9304f"],"vis":"接下來 5 下普攻變成甩出 3 張旋轉的卡牌：一張打目標、兩張打旁邊的人","eng":true,"strong":true,"tok":["projectile:card","flash"],"bc":["#e8455f","#ffd24a"],"bs":"card","src":"stream"},"Vi":{"c":["#ff3fa8","#3df2ff"],"vis":"菲艾身後浮出兩個半透明的霓虹大拳頭，左右輪流往目標砸，每一拳帶 2 格震波","eng":true,"strong":true,"area":true,"ar":["around",2],"tok":["aura","slash","shockwave","shake"],"bc":["#ffe03a","#ffffff"],"src":"stream"},"Vladimir":{"c":["#d9304f","#ffd24a"],"vis":"從最近 3 名敵人身上抽出血絲回到自己身上；每第 5 次，一盞大吊燈從天而降砸在棋盤正中央，衝擊波往外擴散","eng":true,"strong":true,"area":true,"ar":["all",9],"tok":["tether","rain","shockwave","shake"]},"Zeri":{"c":["#f7e21e","#2a2a2a"],"vis":"滑到棋盤邊緣，腳下黃色圓圈、身上一顆黃光球，射出黃黑相間的鋸齒閃電線","eng":true,"strong":true,"bs":"bolt","tok":["pathDash","trail","afterimage","projectile:laser(pierce)","flash"],"bc":["#f7e21e","#4b3bd0"],"src":"stream"},"BaronNashor":{"c":["#8a3fd9","#ffd24a"],"vis":"巴龍仰頭吼叫，一圈聲波掃過全場，所有敵人同時被震到半空；8 名小兵樂手從地上冒出來圍攻","eng":true,"strong":true,"area":true,"ar":["all",9],"tok":["sweep","displace(knockup)","shake","spawn"]},"Rakan":{"c":["#ff3fa0","#c79bf5"],"vis":"一整片桃紅色的巨大羽翼掃過左半場，跟著一排半透明淡紫色的羽毛刀片往右飛","eng":true,"strong":true,"area":true,"bs":"feather","tok":["pathDash","trail","projectile:feather","shockwave","displace(knockup)"],"bc":["#b030e0","#ff3fa0"],"src":"stream"},"Smeech":{"c":["#ffe01a","#a8d8f0"],"vis":"身上套一顆半透明淡藍泡泡護盾（裡面透暖黃光），同時頭頂炸出一大團亮黃色音符＋橘褐色煙","eng":true,"strong":true,"area":true,"tok":["shockwave","slash","flash"],"bc":["#ffe01a","#c8741e"],"src":"stream"},"Sona":{"c":["#e84a2a","#f2c84b","#3fd98a"],"vis":"腳下一直有一顆紅橘色發光圓盤（外圈金環），身旁浮著黃/青/洋紅配色的 DJ 台；前排友軍腳邊出現青綠色的同款鋸齒符號","eng":true,"strong":true,"area":true,"ar":["all",9],"tok":["sweep","shake","projectile:note","flash"],"bc":["#f5d92a","#c9b8ff"],"bs":"bolt","src":"stream"}}}; const loadFx=()=>Promise.resolve(fxJson);
const sheetImgs = new Map();
function sheetImg(url) {
  if (!url) return null;
  let i = sheetImgs.get(url);
  if (!i) { i = new Image(); i.src = url; sheetImgs.set(url, i); }
  return i;
}

const CSS = ''; // 整合：樣式已搬進 trials.css（U3 區）

function injectCss() {
  return CSS; // 整合：不再注入 <style>
}

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

function playBattle(boardEl, result, opts = {}) {
  injectCss();
  if (opts.speed) setBattleSpeed(opts.speed);
  else if (!opts.__keep) speed = 2;
  const reduced = reducedMotion();
  const events = result.events || [];

  const old = boardEl.querySelector(':scope > .tt-bt');
  if (old) old.remove();
  if (getComputedStyle(boardEl).position === 'static') boardEl.style.position = 'relative';
  const root = el('div', 'tt-bt' + (reduced ? ' tt-bt-rm' : ''));
  boardEl.appendChild(root);

  let W=0, H=0, pitch=0, w=0;
  const U = new Map();   // id -> state
  let fx = null, fast = false;
  const nowMs = () => performance.now();
  // 單位現在的畫面座標：格子位置（含滑行中的內插）＋純畫面的偏移（飛出去的演出、擊飛）
  const basePosOf = (u) => {
    const to = hexXY(u.hex);
    if (!u.mv) return to;
    const k = Math.min(1, Math.max(0, (nowMs() - u.mv.t0) / u.mv.dur));
    if (k >= 1) { u.mv = null; return to; }
    const m = u.mv;
    if (m.pts) {   // 沿引擎給的路徑一格一格走
      const L = m.cum[m.cum.length - 1] * k; let i = 1;
      while (i < m.cum.length - 1 && m.cum[i] < L) i++;
      const seg = m.cum[i] - m.cum[i - 1] || 1, f = Math.min(1, Math.max(0, (L - m.cum[i - 1]) / seg));
      return { x: m.pts[i - 1].x + (m.pts[i].x - m.pts[i - 1].x) * f, y: m.pts[i - 1].y + (m.pts[i].y - m.pts[i - 1].y) * f };
    }
    const f = hexXY(m.from);
    return { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k - (m.arc ? Math.sin(Math.PI * k) * w * m.arc : 0) };
  };
  const fxEnv = {
    W: () => W, H: () => H, w: () => w, speed: () => speed,
    pos: (id) => { const u = U.get(id); if (!u) return null; const p = basePosOf(u); return { x: p.x + (u.ox || 0), y: p.y + (u.oy || 0) }; },
    hexPt: (h) => hexXY(h),
    xy: p => ({ x:(p.x + .46) * pitch, y:(p.y + .53116225) * pitch }),   // 引擎世界座標（格寬為 1）→ 畫面
    basePos: (id) => { const u = U.get(id); return u ? basePosOf(u) : null; },
    unit: (id) => U.get(id) || null,
    units: () => Array.from(U.values()),
    unitNode: (id) => { const u = U.get(id); return u ? u.node : null; },
    applyOffset: (u) => { u.inn.style.translate = (u.ox || u.oy) ? `${u.ox || 0}px ${u.oy || 0}px` : ''; },
    shakeEl: () => boardEl,
    sprite: (c, key, x, y, r, alpha) => {
      const img = sheetImg(opts.spriteUrl || '../icons/s19/champions.webp'), idx = opts.spriteIndex ? opts.spriteIndex(key) : null;
      c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
      if (img && img.complete && img.naturalWidth && idx != null && idx >= 0) { const cw = img.naturalWidth / 10, ch = img.naturalHeight / 10; c.globalAlpha = alpha == null ? 1 : alpha; c.drawImage(img, (idx % 10) * cw, Math.floor(idx / 10) * ch, cw, ch, x - r, y - r, r * 2, r * 2); }
      else { c.fillStyle = 'rgba(220,220,230,.6)'; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.restore();
    },
  };

  function layout() {
    W = boardEl.clientWidth || 390;
    H=boardEl.clientHeight || W; pitch=W/7.42; w=pitch*.67;
    root.style.setProperty('--tt-w', w + 'px');
    root.style.height = H+'px';
    if (fx) fx.resize();
  }
  const hexXY = (h) => ({ x:(h.col + .5 * (h.row & 1) + .46) * pitch, y:(h.row * .8660254 + .53116225) * pitch });
  const place = (u, ms) => {
    const p = hexXY(u.hex);
    u.mv = ms && !reduced ? { from: u.prevHex || u.hex, t0: nowMs(), dur: ms } : null;
    u.node.style.transitionDuration = (reduced || !ms ? 0 : ms) + 'ms';
    u.node.style.transform = `translate(${p.x - w / 2}px,${p.y - w / 2}px)`;
  };
  const center = (u) => hexXY(u.hex);

  function makeUnit(d) {
    const u = { id: d.id, side: d.side, key: d.key, hex: { row: d.hex.row, col: d.hex.col }, hpMax: d.hpMax || 1, hp: d.hpMax || 1, shield: 0, manaMax: d.manaMax || 0, mana: 0, alive: true, st: new Map(), boss: !!d.boss, star: d.star || 1, castN: 0, atkN: 0, ox: 0, oy: 0, mv: null };
    const n = el('div', 'tt-bt-u ' + (d.side === 'player' ? 'tt-bt-p' : 'tt-bt-e') + (d.boss ? ' tt-bt-boss' : ''), root);
    const inn = el('div', 'tt-bt-in', n);
    const av = el('div', 'tt-bt-av', inn);
    const idx = opts.spriteIndex ? opts.spriteIndex(d.key) : null;
    if (idx != null && idx >= 0) {
      av.style.backgroundImage = `url(${opts.spriteUrl || '../icons/s19/champions.webp'})`;
      av.style.backgroundSize = '1000% 1000%';
      av.style.backgroundPosition = `${(idx % 10) / 9 * 100}% ${Math.floor(idx / 10) / 9 * 100}%`;
    } else av.textContent = (d.zh || d.key || '?').slice(0, 1);
    u.stars = el('div', 'tt-bt-star', inn);
    u.stars.append(starsEl(d.star, { label: false }));
    n.classList.add('tt-bt-s' + Math.min(3, Math.max(1, d.star || 1)));
    u.stbox = el('div', 'tt-bt-st', inn);
    const bars = el('div', 'tt-bt-bars', inn);
    const hp = el('div', 'tt-bt-hp', bars);
    u.hpf = el('div', 'tt-bt-hpf', hp);
    u.shf = el('div', 'tt-bt-shf', hp);
    const mp = el('div', 'tt-bt-mp', bars);
    u.mpf = el('div', 'tt-bt-mpf', mp);
    u.node = n; u.inn = inn;
    n.setAttribute('aria-hidden', 'true');
    U.set(u.id, u);
    place(u, 0);
    bars_(u);
    return u;
  }
  function bars_(u) {
    const den = Math.max(u.hpMax, u.hp + u.shield);
    u.hpf.style.width = Math.max(0, Math.min(100, u.hp / den * 100)) + '%';
    u.shf.style.left = Math.max(0, u.hp / den * 100) + '%';
    u.shf.style.width = Math.min(100, u.shield / den * 100) + '%';
    u.mpf.style.width = u.manaMax ? Math.max(0, Math.min(100, u.mana / u.manaMax * 100)) + '%' : '0%';
  }

  layout();
  fx = createFx(root, fxEnv);
  root.__fx = fx;   // 測試掛鉤：讀特效狀態用
  fx.setData(fxJson);
  if (!fxJson) loadFx().then((j) => { if (j && fx) fx.setData(j); });
  for (const d of (result.units || [])) makeUnit(d);
  // 沙灘樂器：場上的召喚物，只佔格、畫在那一格上（不動、不被打、沒有血條）
  const instNodes = [];
  for (const d of (result.instruments || [])) {
    const n = el('div', 'tt-bt-inst ' + (d.side === 'player' ? 'tt-bt-p' : 'tt-bt-e'), root);
    n.setAttribute('aria-hidden', 'true');
    instNodes.push({ n, hex: d.hex });
  }
  const placeInst = () => { for (const i of instNodes) { const p = hexXY(i.hex); i.n.style.transform = `translate(${p.x - w / 2}px,${p.y - w / 2}px)`; } };
  placeInst();
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => { layout(); for (const u of U.values()) place(u, 0); placeInst(); });
    ro.observe(boardEl);
  }

  // ---------- 視覺小工具 ----------
  const live = { n: 0 };
  const merge = new Map();   // 飄字合併
  function anim(node, keyframes, ms, done) {
    if (reduced || fast || !node.animate) { if (done) done(); return null; }
    const a = node.animate(keyframes, { duration: ms, easing: 'ease-out', fill: 'forwards' });
    if (done) a.onfinish = done;
    return a;
  }
  function floatNum(u, text, cls, crit) {
    if (reduced || fast || !u) return;
    const k = u.id + '|' + cls + '|' + (crit ? 1 : 0);
    const now = performance.now();
    const m = merge.get(k);
    if (m && now - m.t0 < 100 && m.node.isConnected && cls !== 'tt-bt-n-b') {
      m.amt += text; m.node.textContent = fmt(m.amt, cls); return;
    }
    if (live.n > 40) return;
    const p = center(u);
    const n = el('div', 'tt-bt-num ' + cls + (crit ? ' tt-bt-crit' : ''), root);
    n.style.left = (p.x + (Math.random() * 10 - 5)) + 'px';   // 只影響視覺，不影響戰鬥結果
    n.style.top = (p.y - w * 0.4) + 'px';
    const amt = typeof text === 'number' ? text : 0;
    n.textContent = typeof text === 'number' ? fmt(text, cls) : text;
    live.n++;
    merge.set(k, { t0: now, node: n, amt });
    anim(n, [{ opacity: 1, transform: 'translate(-50%,-50%)' }, { opacity: 0, transform: 'translate(-50%,-' + (w * 0.9 + 50) + '%)' }], 750, () => { n.remove(); live.n--; });
  }
  const fmt = (a, cls) => (cls === 'tt-bt-n-h' || cls === 'tt-bt-n-s' ? '+' : '') + Math.round(a);

  function lunge(a, b, ms) {
    if (!a || !b || reduced || fast) return;
    const pa = center(a), pb = center(b);
    const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(w * 0.3, d * 0.5) / d;
    anim(a.inn, [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * k}px,${dy * k}px)`, offset: 0.4 }, { transform: 'translate(0,0)' }], ms);
  }
  const resolvePt = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') { const u = U.get(v); return u ? center(u) : null; }
    if (v.row != null) return hexXY(v);
    return null;
  };
  let banner = null, bannerTimer = 0;
  function showBanner(text, side) {
    if (reduced && false) return;
    if (!banner) banner = el('div', 'tt-bt-banner', root);
    banner.style.setProperty('--tt-side', side === 'player' ? '#2563b0' : '#c4452f');
    banner.textContent = text;
    banner.style.display = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { if (banner) banner.style.display = 'none'; }, 1200);
  }
  function setStatus(u, kind, on) {
    if (on) u.st.set(kind, true); else u.st.delete(kind);
    u.node.classList.toggle('tt-bt-untarget', u.st.has('untargetable'));
    u.stbox.textContent = '';
    for (const k of u.st.keys()) {
      if (k === 'stun') { const s = el('span', 'tt-bt-st-stun', u.stbox); s.textContent = '◌'; }
      else if (k === 'charm') { const s = el('span', 'tt-bt-st-charm', u.stbox); s.textContent = '♥'; }
      else if (k === 'untargetable' || k === 'ccImmune') continue;
      else if (!reduced && STNAME[k]) { const s = el('span', 'tt-bt-st-misc', u.stbox); s.textContent = STNAME[k]; }
    }
  }
  const STNAME = { burn: '燃', wound: '傷', shred: '裂', sunder: '破', chill: '凍', weaken: '弱', vulnerable: '易', paint: '染', taunt: '嘲', silence: '默', root: '縛', slow: '緩' };
  const TYPE_CLS = { p: 'tt-bt-n-p', m: 'tt-bt-n-m', t: 'tt-bt-n-t' };

  // ---------- 事件 ----------
  // fast（跳過）時：只更新狀態，不做動畫、特效與音效
  const snd = (n) => { if (!fast) sfx(n); };
  function handle(ev) {
    const u = U.get(ev.id);
    switch (ev.e) {
      case 'move':
        if (u) {
          const from = { row: u.hex.row, col: u.hex.col };
          u.prevHex = from;
          u.hex = { row: ev.to.row, col: ev.to.col };
          const st = ev.style || 'walk', ms = fast ? 0 : (ev.dur || 0) * TICK_MS / speed;
          if (!fast && !reduced && st === 'blink') {
            place(u, 0);
            if (u.node.animate) u.node.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
          } else if (!fast && !reduced && ev.path && ev.path.length > 1 && ms > 0) {
            const pts = ev.path.map(hexXY), cum = [0];
            for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.max(0.001, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)));
            place(u, 0);
            u.mv = { t0: nowMs(), dur: ms, pts, cum };
            if (u.node.animate) {
              const T = cum[cum.length - 1];
              u.node.animate(pts.map((p, i) => ({ transform: `translate(${p.x - w / 2}px,${p.y - w / 2}px)`, offset: cum[i] / T })), { duration: ms, easing: 'linear' });
            }
          } else if (!fast && !reduced && st === 'leap' && ms > 0) {
            place(u, 0);
            const h = 1.1;
            u.mv = { from, t0: nowMs(), dur: ms, arc: h };
            const a = hexXY(from), b = hexXY(u.hex), kf = [];
            for (let i = 0; i <= 8; i++) { const k = i / 8; kf.push({ transform: `translate(${a.x + (b.x - a.x) * k - w / 2}px,${a.y + (b.y - a.y) * k - w / 2 - Math.sin(Math.PI * k) * w * h}px)`, offset: k }); }
            if (u.node.animate) u.node.animate(kf, { duration: ms, easing: 'linear' });
          } else place(u, ms);
          if (!fast && fx) fx.move(u, from, u.hex, ev);
        }
        break;
      case 'atk': {
        const t = U.get(ev.tgt);
        if (!ev.ranged) lunge(u, t, 160);
        if (u && !fast && fx) fx.atk(u, ev);
        break;
      }
      case 'dmg':
        if (u) {
          u.hp = ev.hp; u.shield = ev.shield || 0; bars_(u);
          floatNum(u, ev.amt, TYPE_CLS[ev.type] || 'tt-bt-n-p', ev.crit);
          if (ev.tag === 'atk') snd('hit');
          if (!fast && fx) { fx.dmg(u, ev, ev.src != null ? U.get(ev.src) : null); fx.hpLow(u); }
        }
        break;
      case 'heal':
        if (u) { u.hp = ev.hp; bars_(u); floatNum(u, ev.amt, 'tt-bt-n-h'); if (!fast && fx) fx.heal(u, ev); }
        break;
      case 'shield':
        if (u) { u.shield = ev.shield; bars_(u); floatNum(u, ev.amt, 'tt-bt-n-s'); if (!fast && fx) fx.shield(u, ev); }
        break;
      case 'mana':
        if (u) { u.mana = ev.mana; bars_(u); }
        break;
      case 'cast':
        if (u) {
          if (!reduced && !fast) {
            const c = el('div', 'tt-bt-cast', u.inn);
            c.textContent = ev.name || '';
            setTimeout(() => c.remove(), 800);
          }
          snd('cast');
          if (!fast && fx) fx.cast(u);
        }
        break;
      case 'fire':
        if (u && !fast && fx) fx.fire(u, ev);
        break;
      case 'fx': {
        if (fast || !fx) break;
        if (ev.name) { fx.fxEv(ev); break; }
        const a = resolvePt(ev.from), b = resolvePt(ev.to);
        const src = ev.src != null ? U.get(ev.src) : null;
        if (ev.kind === 'aoe' || ev.kind === 'cone') {
          if (Array.isArray(ev.hexes) && ev.hexes.length) fx.hexes(ev.hexes.map(hexXY), src);
          else if (b || a) fx.hexes([b || a], src);
        } else if (a && b) fx.line(a, b, ev.kind, src);
        break;
      }
      case 'proj': if (!fast && fx) fx.proj(ev); break;
      case 'obj': if (!fast && fx) fx.obj(ev); break;
      case 'air': if (!fast && fx) fx.air(ev); break;
      case 'chan': if (!fast && fx) fx.chan(ev); break;
      case 'status':
        if (u) { setStatus(u, ev.kind, ev.on); if (!fast && fx) fx.status(u, ev.kind, ev.on); }
        break;
      case 'buff':
        if (u && ev.stat) floatNum(u, `+${ev.stat}`, 'tt-bt-n-b');
        break;
      case 'trait':
        if (!fast) {
          showBanner(ev.text || ev.key, ev.side);
          boardEl.dispatchEvent(new CustomEvent('tt-trait', { bubbles: true, detail: { key: ev.key, side: ev.side } }));
        }
        break;
      case 'spawn': {
        const d = ev.unit;
        if (d && !U.has(d.id)) {
          const nu = makeUnit(d);
          anim(nu.node, [{ opacity: 0 }, { opacity: 1 }], 300);
          if (!fast && fx) fx.spawn(nu);
        }
        break;
      }
      case 'death':
        if (u) {
          u.alive = false; u.hp = 0; u.shield = 0; bars_(u);
          u.stbox.textContent = ''; u.st.clear();
          const a = anim(u.node, [{ opacity: 1 }, { opacity: 0 }], 350);
          if (!a) u.node.style.opacity = '0'; else a.onfinish = () => { u.node.style.opacity = '0'; };
          snd('death');
          if (!fast && fx) fx.death(u, ev, ev.killer != null ? U.get(ev.killer) : null);
          u.ox = 0; u.oy = 0; fxEnv.applyOffset(u);
        }
        break;
      case 'end':
        break;
    }
  }

  // ---------- 排程 ----------
  return new Promise((resolve) => {
    let i = 0, vt = 0, last = performance.now(), raf = 0, fxRaf = 0, fxLast = 0, done = false;
    const endEv = events.find((e) => e.e === 'end');
    const winner = endEv ? endEv.winner : result.winner;

    function finish(instant) {
      if (done) return; done = true;
      cancelAnimationFrame(raf); cancelAnimationFrame(fxRaf);
      document.removeEventListener('visibilitychange', onVis);
      if (fx) fx.clear();
      if (ro) ro.disconnect();
      if (opts.skip) opts.skip.removeEventListener('abort', onAbort);
      if (!opts.noEndSound) sfx(winner === 'player' ? 'win' : 'lose');
      clearTimeout(bannerTimer);
      if (banner) banner.style.display = 'none';
      resolve();
    }
    function onAbort() {
      if (done) return;
      fast = true;
      for (; i < events.length; i++) { handle(events[i]); if (opts.onEvent) opts.onEvent(events[i], { fast: true }); }
      for (const n of root.querySelectorAll('.tt-bt-num,.tt-bt-cast')) n.remove();
      if (fx) { fx.stage.enabled = false; fx.clear(); }   // 跳過：特效立即清空
      for (const u of U.values()) { u.ox = 0; u.oy = 0; u.mv = null; fxEnv.applyOffset(u); }
      finish(true);
    }
    if (opts.skip) {
      if (opts.skip.aborted) { onAbort(); return; }
      opts.skip.addEventListener('abort', onAbort);
    }

    // 特效自己一個 rAF 迴圈（戰鬥事件結束後還要把爆炸、死亡特效播完）；分頁隱藏時瀏覽器會停掉 rAF，回來後不補播
    function fxFrame(now) {
      if (done) return;
      const dt = fxLast ? now - fxLast : 16; fxLast = now;
      if (fx) { try { fx.tick(dt > 100 ? 16 : dt); } catch (e) { console.error(e); fx.clear(); } }
      fxRaf = requestAnimationFrame(fxFrame);
    }
    function onVis() { if (document.hidden) { fxLast = 0; last = performance.now(); } else { fxLast = 0; last = performance.now(); } }
    document.addEventListener('visibilitychange', onVis);

    function frame(now) {
      if (done) return;
      const dt = Math.min(now - last, 100);   // 分頁切走回來不要一次衝完
      last = now;
      vt += dt / TICK_MS * speed;
      while (i < events.length && events[i].t <= vt) {
        const ev = events[i++];
        handle(ev);
        if (opts.onEvent) opts.onEvent(ev, { fast: false });
        if (ev.e === 'end') { setTimeout(() => finish(false), 600); return; }
      }
      if (i >= events.length) { setTimeout(() => finish(false), 400); return; }
      raf = requestAnimationFrame(frame);
    }
    if (!events.length) { finish(false); return; }
    if (fxJson) fx.start(); else loadFx().then(() => { if (!done && !fast && fx) { fx.setData(fxJson); fx.start(); } });
    fxRaf = requestAnimationFrame(fxFrame);
    raf = requestAnimationFrame((t) => { last = t; frame(t); });
  });
}

function clearBattle(boardEl) {
  const old = boardEl.querySelector(':scope > .tt-bt');
  if (old) old.remove();
}

return {get setBattleSpeed(){return setBattleSpeed;},get getBattleSpeed(){return getBattleSpeed;},get playBattle(){return playBattle;},get clearBattle(){return clearBattle;}};})();
for(const wire of bind)wire(); mods.traitSprite={"src": "../icons/s19/traits.webp", "cols": 8, "size": 64, "count": 49, "index": {"IonicSpark": 0, "KDA": 1, "BeachPop": 2, "Classical": 3, "Heartsteel": 4, "Rock": 5, "Pentakill": 6, "TrueDamage": 7, "Hyperpop": 8, "ILLBEATS": 9, "GuFeng": 10, "Jazz": 11, "RAndB": 12, "EDM": 13, "Frontman": 14, "Juggernaut": 15, "Slayer": 16, "Swiftstriker": 17, "Choreographer": 18, "Bodyguard": 19, "Arcanist": 20, "Encore": 21, "Prodigy": 22, "Renegade": 23, "Collab": 24, "Trickshot": 25, "Hitmaker": 26, "Manager": 27, "8Bit": 28, "OneMonsterBand": 29, "Composer": 30, "Synthwave": 31, "Goth": 32, "RecordMogul": 33, "Emo": 34, "Tango": 35, "MelodicHeart": 36, "HypeMan": 37, "Indie": 38, "BoyBand": 39, "BeatMaster": 40, "Freestyle": 41, "Producer": 42, "Disco": 43, "Country": 44, "Windblessed": 45, "Mariachi": 46, "RisingStar": 47, "Superstar": 48}}; mods.asset=asset; root.FocusNativeRenderers=mods;})(globalThis);

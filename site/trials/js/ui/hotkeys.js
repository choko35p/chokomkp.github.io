// hotkeys.js — 快捷鍵核心（SPEC_UI2 第 5 章）。只有儲存、查詢、衝突規則，沒有 DOM。
// 用 event.code 比對（注音輸入法開著時 event.key 會收不到 D／F）。
const STORE_KEY = 'trials19.keys';

// id、名稱、階段（plan／battle／any）、是否官方預設、預設 code
export const ACTIONS = [
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

export const isReserved = (code) => RESERVED.has(code);
export const isAcceptable = (code) => typeof code === 'string' && code.length > 0 && !RESERVED.has(code) && !MODIFIERS.has(code);

const NAMES = {
  Space: '空白鍵', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  NumpadAdd: '數字鍵 +', NumpadSubtract: '數字鍵 -', NumpadMultiply: '數字鍵 *', NumpadDivide: '數字鍵 /', NumpadDecimal: '數字鍵 .',
};
// code → 面板上顯示的鍵名
export function codeLabel(code) {
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
export function createHotkeys(store = defaultStore()) {
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

export const hotkeys = createHotkeys();
export default hotkeys;

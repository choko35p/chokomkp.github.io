// planner.js：隊伍編輯器的資料與規則（沒有 DOM）。
// 清單最多 25 隻，每隻有目標星級（2 或 3）。存在 localStorage['trials19.planner']，跟存檔分開，換局還在。
// 「達成」：目標 2 星→玩家（場上＋板凳）有一隻 2 星以上；目標 3 星→有一隻 3 星。達成就不再在商店標示，賣掉會恢復。
export const MAX = 25;
export const STORE_KEY = 'trials19.planner';

// 這隻目標達成了沒有。units：[{key, star}]（場上＋板凳）
export function isAchieved(entry, units) {
  if (!entry) return false;
  const need = entry.star >= 3 ? 3 : 2;
  for (const u of units || []) if (u && u.key === entry.key && (u.star || 1) >= need) return true;
  return false;
}
// 清單中還沒達成的 key（商店要標示的）
export function pendingKeys(list, units) {
  const s = new Set();
  for (const e of list) if (!isAchieved(e, units)) s.add(e.key);
  return s;
}

function memStore() {
  let v = null;
  return { getItem: () => v, setItem: (_, x) => { v = x; }, removeItem: () => { v = null; } };
}

// opts.storage：{getItem,setItem,removeItem}，預設 localStorage（取不到就用記憶體）；opts.persist=false 不寫入（?seed= 測試局）；
// opts.valid(key)：認得的棋子才收（避免資料改版後留下不存在的 key）
export function createPlanner(opts = {}) {
  let storage = opts.storage;
  if (!storage) { try { storage = typeof localStorage !== 'undefined' && localStorage ? localStorage : memStore(); } catch (_) { storage = memStore(); } }
  const persist = opts.persist !== false;
  const valid = opts.valid || (() => true);
  let list = [];            // [{key, star}]，加入順序
  const subs = [];

  function load() {
    list = [];
    let raw = null;
    try { raw = storage.getItem(STORE_KEY); } catch (_) { return; }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || !Array.isArray(o.list)) return;
      const seen = new Set();
      for (const it of o.list) {
        const key = Array.isArray(it) ? it[0] : null, star = Array.isArray(it) ? it[1] : null;
        if (typeof key !== 'string' || seen.has(key) || !valid(key)) continue;
        seen.add(key);
        list.push({ key, star: star === 3 ? 3 : 2 });
        if (list.length >= MAX) break;
      }
    } catch (_) { list = []; }
  }
  function save() {
    if (!persist) return;
    try {
      if (list.length) storage.setItem(STORE_KEY, JSON.stringify({ v: 1, list: list.map(e => [e.key, e.star]) }));
      else storage.removeItem(STORE_KEY);
    } catch (_) { /* 滿了或無痕模式：這次還是有效 */ }
  }
  const emit = () => { for (const f of subs.slice()) { try { f(); } catch (_) { /* 聽的人壞了不影響 */ } } };
  load();

  const indexOf = (key) => list.findIndex(e => e.key === key);
  const api = {
    MAX,
    list: () => list.map(e => ({ ...e })),
    size: () => list.length,
    full: () => list.length >= MAX,
    has: (key) => indexOf(key) >= 0,
    starOf: (key) => { const i = indexOf(key); return i < 0 ? 0 : list[i].star; },
    // 加入（目標 2 星）。回傳 {ok, reason?}；reason：'full'｜'dup'｜'unknown'
    add(key, star = 2) {
      if (!valid(key)) return { ok: false, reason: 'unknown' };
      if (indexOf(key) >= 0) return { ok: false, reason: 'dup' };
      if (list.length >= MAX) return { ok: false, reason: 'full' };
      list.push({ key, star: star === 3 ? 3 : 2 });
      save(); emit();
      return { ok: true };
    },
    // 左鍵：沒有就加入（2 星）、2 星變 3 星、3 星回 2 星。回傳 {ok, action:'add'|'star3'|'star2', reason?}
    tap(key) {
      const i = indexOf(key);
      if (i < 0) { const r = api.add(key, 2); return r.ok ? { ok: true, action: 'add' } : r; }
      list[i].star = list[i].star >= 3 ? 2 : 3;
      save(); emit();
      return { ok: true, action: list[i].star === 3 ? 'star3' : 'star2' };
    },
    remove(key) {
      const i = indexOf(key); if (i < 0) return false;
      list.splice(i, 1); save(); emit();
      return true;
    },
    clear() { if (!list.length) return; list = []; save(); emit(); },
    // 一次加很多（看圖匯入）：items [{key, star?}]；已有的略過（星級不動），超過 25 隻的放不進。回傳 {added, dup, skipped}
    addMany(items) {
      let added = 0, dup = 0, skipped = 0;
      for (const it of items || []) {
        const key = typeof it === 'string' ? it : it.key;
        if (indexOf(key) >= 0) { dup++; continue; }
        if (!valid(key) || list.length >= MAX) { skipped++; continue; }
        list.push({ key, star: it && it.star === 3 ? 3 : 2 }); added++;
      }
      if (added) { save(); emit(); }
      return { added, dup, skipped };
    },
    // 標示用：這隻在清單裡而且還沒達成
    wants(key, units) { const i = indexOf(key); return i >= 0 && !isAchieved(list[i], units); },
    achieved(key, units) { const i = indexOf(key); return i >= 0 && isAchieved(list[i], units); },
    pending: (units) => pendingKeys(list, units),
    // 複製用的文字清單：「名稱 2★」一行一隻
    toText(zhOf) { return list.map(e => `${zhOf(e.key)} ${e.star}★`).join('\n'); },
    onChange(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    reload: () => { load(); emit(); },
  };
  return api;
}

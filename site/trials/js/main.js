// 進入點：載入資料 → 讀存檔或開新局 → 掛載介面。SPEC 1.9、4.12。
import { loadData } from './data.js';
import * as audio from './audio.js';
import * as U from './unlocks.js';
import { hotkeys } from './ui/hotkeys.js';
import { mount, askModal } from './ui/layout.js';
import { createPlanner } from './planner.js';

const q = new URLSearchParams(location.search);
const SAVE_KEY = 'trials19.save';
// 網址帶 ?seed= 是測試用：不讀、不寫、不清玩家原本的存檔
const seeded = q.has('seed');

const REASONS = {
  gold: '金錢不夠', 'not enough gold': '金錢不夠', noGold: '金錢不夠',
  benchFull: '板凳滿了', 'bench full': '板凳滿了', bench: '板凳滿了',
  popFull: '人口滿了', 'pop full': '人口滿了', population: '人口滿了',
  maxItems: '這隻最多 3 件裝備', itemsFull: '這隻最多 3 件裝備',
  maxLevel: '已經滿級了',
};
const reasonText = (r) => (r && /[一-鿿]/.test(r) ? r : REASONS[r] || '這個動作現在做不到');

const PICK_ZH = { fav: '心鋼最愛', spot: '聚光燈', deal: '唱片合約', prod: '合作邀請', clone: '分身站位' };
const SFX = { buy: 'buy', sell: 'sell', reroll: 'reroll', buyXp: 'xp', move: 'place', equip: 'equip', pickAugment: 'pick', rerollAugmentSlot: 'reroll', setFavorite: 'equip', moveFavorite: 'equip', pick: 'equip', useRemover: 'equip', pickReward: 'pick', startBattle: 'start' };

function showFatal(msg, withLink) {
  const root = document.getElementById('tt-root');
  const p = Object.assign(document.createElement('p'), { className: 'tt-fatal', textContent: msg });
  if (withLink) p.append(' ', Object.assign(document.createElement('a'), { href: '../?s=19', textContent: '回攻略站' }));
  root.replaceChildren(p);
}

async function boot() {
  const sParam = q.get('s');
  if (sParam && sParam !== '19') { showFatal('目前只有 S19 版。', true); return; }

  const DATA = await loadData('./data/');
  // 一律用真的 game／stats／enemies
  const game = await import('./game.js');
  const stats = await import('./stats.js');
  const enemies = await import('./enemies.js');
  const fake = false;   // 保留給存檔判斷，永遠是 false

  const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };
  const newState = (seed) => game.newGame(seed, DATA);

  // 存檔
  let state = null;
  // 存檔外面包一層資料版本號：版本不同（例如 PBE 換了資料）就不接，直接開新局
  const dataVer = String(DATA.units.version || '0');
  const clearSave = () => { if (seeded) return; try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* 無痕模式 */ } };
  const saved = seeded ? null : (() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null;
      const env = JSON.parse(raw);
      if (!env || env.dv !== dataVer || typeof env.save !== 'string') { clearSave(); return null; }
      if (JSON.parse(env.save).phase === 'over') { clearSave(); return null; }
      return env.save;
    } catch (_) { clearSave(); return null; }
  })();
  if (q.has('seed')) state = newState(Number(q.get('seed')));
  else if (saved && !fake) {
    const pick = await askModal('接著玩？', '上次的進度還在。', [{ label: '接著玩', primary: true, value: 'resume' }, { label: '重新開始', value: 'new' }]);
    if (pick === 'resume') { try { state = game.deserialize(saved, DATA); } catch (_) { state = null; } }
  }
  if (!state) state = newState(rnd());

  // 事件、api
  const L = {};
  const api = {
    DATA, ui: { mode: 'plan', sel: null, speed: 2 },
    get state() { return state; },
    on(evt, fn) { (L[evt] = L[evt] || []).push(fn); return () => api.off(evt, fn); },
    off(evt, fn) { L[evt] = (L[evt] || []).filter(f => f !== fn); },
    emit(evt, payload) { for (const f of (L[evt] || []).slice()) f(payload); },
    countTraits: stats ? (u, D, o) => stats.countTraits(u, D, o) : null,
    teamLimit: () => game.teamLimit(state, DATA),
    fav: () => game.favoriteInfo(state, DATA),
    picks: () => game.pickInfo(state, DATA),
    traitOpts: () => game.traitOpts(state, DATA),
    battleUnits: () => game.battleUnits(state, DATA),
    toast: () => {},
    sfx(n) { try { audio.sfx(n); } catch (_) { /* 音效壞了不影響遊戲 */ } },
    restart(seed) {
      clearSave();
      state = newState(seed ?? rnd()); cache = null; api.ui.sel = null; api.ui.mode = 'plan';
      best = {}; track();
      api.emit('restart'); api.emit('change');
    },
  };
  // 解鎖機制（SPEC_UI2 第 7 章）。enabled＝unlocks.json 有列棋子；關閉時 UI 不顯示入口
  api.hotkeys = hotkeys;
  // 隊伍編輯器：清單存在 localStorage（trials19.planner），跟存檔分開、換局還在；?seed= 測試局可讀不寫
  api.planner = createPlanner({ valid: (k) => !!DATA.units.byKey[k], persist: !seeded });
  api.ownedUnits = () => [...state.board, ...state.bench].filter(Boolean);
  api.unlocks = {
    enabled: DATA.unlocks.list.length > 0,
    // 全部要解鎖的棋子，照 unlocks.json 順序：{key, zh, cost, text, local, guess, cond, unlocked, round, progress}
    list: () => DATA.unlocks.list.map(u => {
      const d = DATA.units.byKey[u.key] || {};
      const got = state.unlocks && state.unlocks[u.key];
      return { key: u.key, zh: d.zh || u.key, cost: d.cost, traits: d.traits || [], text: u.text, local: u.local || '', guess: !!u.guess, cond: u.cond,
        unlocked: !!got, round: got ? got.round : null, progress: U.progress(state, DATA, u.key) };
    }),
    progress: (key) => U.progress(state, DATA, key),
    isUnlocked: (key) => U.isUnlocked(state, DATA, key),
    count: () => ({ done: DATA.unlocks.list.filter(u => state.unlocks && state.unlocks[u.key]).length, total: DATA.unlocks.list.length }),
    // 這隻現在是不是排在「下一次商店保證出現」的隊伍裡
    pending: () => (state.unlockQueue || []).slice(),
  };
  // 這場啟動過的羈絆（最高階）給結算畫面用
  let best = {};
  const track = () => { if (!api.countTraits) return; try { for (const t of api.countTraits(state.board.filter(Boolean), DATA, game.traitOpts(state, DATA))) if (t.tier > (best[t.key] || 0)) best[t.key] = t.tier; } catch (_) { /* 略過 */ } };
  api.bestTraits = () => Object.entries(best).map(([key, tier]) => ({ key, tier })).sort((a, b) => b.tier - a.tier);

  // 對手（同回合同重打次數只算一次）
  let cache = null;
  api.enemy = () => {
    const key = state.round + ':' + (state.attempt || 0) + ':' + state.seed;
    if (!cache || cache.key !== key) {
      const fn = (enemies && enemies.enemyForRound) || game.enemyForRound;
      cache = { key, v: fn ? fn(state.round, state.seed, DATA) : { name: '—', units: [] } };
    }
    return cache.v;
  };

  const tiers = () => { if (!api.countTraits) return null; try { return Object.fromEntries(api.countTraits(state.board.filter(Boolean), DATA, game.traitOpts(state, DATA)).map(t => [t.key, t.tier])); } catch (_) { return null; } };

  api.act = (name, ...args) => {
    if (name === 'restart') { api.restart(...args); return { ok: true }; }
    const fn = game['act' + name[0].toUpperCase() + name.slice(1)];
    if (!fn) throw new Error('沒有這個動作：' + name);
    const before = (name === 'move' || name === 'buy' || name === 'sell') ? tiers() : null;
    const r = fn(state, ...args, DATA) || { ok: false };
    if (!r.ok) {
      if (name !== 'finishBattle') { api.toast(reasonText(r.reason)); api.sfx('error'); }
      return r;
    }
    if (name === 'startBattle') {
      api.sfx('start');
      for (const ev of r.events || []) if (ev.type === 'pickUnset') api.toast(ev.ids.map(i => PICK_ZH[i] || i).join('、') + ' 還沒指定，這場不會有效果');
      return r;
    }
    const evs = r.events || [];
    for (const m of r.merged || []) if (!evs.some(e => e.type === 'merge' && e.key === m.key && e.star === m.star)) evs.push({ type: 'merge', key: m.key, star: m.star });
    let played = false;
    for (const ev of evs) {
      if (ev.type === 'unlock') {   // 解鎖：toast＋音效（延一下，不蓋掉這個動作本身的音效）
        const def = DATA.units.byKey[ev.key];
        api.toast('解鎖：' + (def ? def.zh : ev.key) + '！下一次商店一定會出現');
        setTimeout(() => api.sfx('unlock'), 180);
      }
      api.emit(ev.type, ev);
      if (ev.type === 'merge') { api.sfx(ev.star >= 3 ? 'star3' : 'star2'); played = true; }
      else if (ev.type === 'levelup') { api.sfx('levelup'); played = true; }
      else if (ev.type === 'interest') api.sfx('coin');
    }
    if (!played && SFX[name]) api.sfx(SFX[name]);
    if (before) { const after = tiers(); if (after && Object.keys(after).some(k => after[k] > (before[k] || 0))) setTimeout(() => api.sfx('trait'), 120); }
    // 佈陣、選增幅、選獎勵都存；打完（沒命或通關）就清掉，重整後不能接著玩
    if (state.phase === 'over' || r.gameOver || r.cleared) clearSave();
    else if (!seeded && !fake && (state.phase === 'plan' || state.phase === 'augment' || state.phase === 'reward')) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ dv: dataVer, save: game.serialize(state) })); } catch (_) { /* 滿了就算了 */ }
    }
    track();
    if (name !== 'startBattle') api.emit('change');
    return r;
  };

  await mount(document.getElementById('tt-root'), api);

  // 測試掛鉤：只有網址帶 ?seed= 才掛（正式玩不會有）
  if (q.has('seed')) window.__trials = {
    state: () => state,
    act: (name, ...a) => api.act(name, ...a),
    DATA,
    simulateNow: () => api.ui.battleNow && api.ui.battleNow(),
    setSpeed: (n) => api.ui.setSpeed && api.ui.setSpeed(n),
    skipBattle: () => api.ui.skipBattle && api.ui.skipBattle(),
    api,
  };
}

boot().catch((e) => { console.error(e); showFatal('載入失敗：' + (e && e.message ? e.message : e)); });

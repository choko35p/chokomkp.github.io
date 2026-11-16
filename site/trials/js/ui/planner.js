// 隊伍編輯器面板（官方風格）：已選列＋羈絆統計＋全部棋子格＋看圖匯入。資料與規則在 ../planner.js，辨識在 ../recog.js。
// 操作：左鍵點棋子＝加入（2 星）→ 再點＝3 星 → 再點回 2 星；右鍵＝移出。觸控：點＝同左鍵，長按 400ms＝移出。
// 面板不用 role=dialog（不然 input.js 會當成彈窗，擋掉快捷鍵）；放在 body 底下，不在棋盤的拖曳範圍裡。
import { el, zhOf, costOf, styleAvatar, starsEl } from './board.js';
import { traitIcon, traitHex, sortTraits, traitZh } from './traitbar.js';
import { isLocked } from './panels.js';
import { createRecognizer } from '../recog.js';

const LONG_MS = 400;
const MOVE_PX = 8;
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.500"/></svg>';
const ICONS = {
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"/></svg>',
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4l-1.600 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.400L15 4H9zm3 4.500a4.500 4.500 0 1 1 0 9 4.500 4.500 0 0 1 0-9zm0 2a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 2h6l1 2h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3l1-2zm0 2v2h6V4H9zm-3 3v13h12V7H6zm2 3h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>',
};
const iconEl = (k) => { const s = el('span', 'tt-pl-ic', { 'aria-hidden': 'true' }); s.innerHTML = ICONS[k]; return s; };
const MOBILE_Q = '(max-width: 1023px), (orientation: portrait)';

export function mountPlanner(api) {
  const { DATA } = api;
  const PL = api.planner;
  if (!PL) return { open() {}, close() {}, toggle() {}, isOpen: () => false };
  const toast = (m) => { try { api.toast && api.toast(m); } catch (_) { /* 略過 */ } };
  const mql = window.matchMedia ? window.matchMedia(MOBILE_Q) : { matches: false, addEventListener() {} };
  const isMobile = () => !!mql.matches;
  const units = DATA.units.list.filter(u => DATA.units.sprite?.map?.[u.key] != null);
  const unitsOwned = () => (api.ownedUnits ? api.ownedUnits() : []);
  const st = { open: false, sort: 'cost', q: '', collapsed: false, view: 'main', armClear: false };
  let recog = null, abortCtl = null;

  // ---------- 骨架 ----------
  const root = el('section', 'tt-pl', { id: 'tt-planner', role: 'region', 'aria-label': '隊伍編輯器', hidden: true, 'data-tt-noclear': '' });
  const count = el('span', 'tt-pl-count tt-num', { 'aria-live': 'polite' });
  const foldBtn = el('button', 'tt-pl-fold', { type: 'button', 'aria-label': '收合', 'aria-expanded': 'true', title: '收合／展開' }, '▾');
  const closeBtn = el('button', 'tt-pl-close', { type: 'button', 'aria-label': '關閉隊伍編輯器' }, '✕');
  const head = el('header', 'tt-pl-head', {}, el('b', 'tt-pl-title', {}, '隊伍編輯器'), count,
    el('span', 'tt-pl-hint', {}, '左鍵加入／升 3 星，右鍵移出'), el('span', 'tt-pl-hint tt-pl-hint-t', {}, '點一下加入／升 3 星，長按移出'), foldBtn, closeBtn);
  const selBox = el('div', 'tt-pl-sel', { role: 'group', 'aria-label': '已選棋子' });
  const traitBox = el('div', 'tt-pl-traits', { role: 'group', 'aria-label': '羈絆統計' });
  const top = el('div', 'tt-pl-top', {}, selBox, traitBox);
  const clearBtn = el('button', 'tt-pl-tool', { type: 'button', 'data-pl': 'clear' }, iconEl('trash'), el('span', '', {}, '清空'));
  const impBtn = el('button', 'tt-pl-tool', { type: 'button', 'data-pl': 'import' }, iconEl('cam'), el('span', '', {}, '看圖匯入'));
  const copyBtn = el('button', 'tt-pl-tool', { type: 'button', 'data-pl': 'copy' }, iconEl('copy'), el('span', '', {}, '複製文字'));
  const tools = el('div', 'tt-pl-tools', {}, clearBtn, impBtn, copyBtn);
  const search = el('input', 'tt-pl-search', { type: 'search', placeholder: '搜尋棋子或羈絆', 'aria-label': '搜尋棋子或羈絆', autocomplete: 'off', enterkeyhint: 'search' });
  const SORTS = [['cost', '費用'], ['name', '名稱'], ['origin', '起源'], ['class', '職業']];
  const sortBox = el('div', 'tt-pl-sorts', { role: 'tablist', 'aria-label': '排序' });
  for (const [k, zh] of SORTS) sortBox.append(el('button', 'tt-pl-sort', { type: 'button', role: 'tab', 'data-sort': k, 'aria-selected': String(k === st.sort) }, zh));
  const find = el('div', 'tt-pl-find', {}, el('label', 'tt-pl-sbox', {}, el('span', 'tt-sr', {}, '搜尋'), search), sortBox);
  const grid = el('div', 'tt-pl-grid', { role: 'group', 'aria-label': '全部棋子' });
  const body = el('div', 'tt-pl-body', {}, top, tools, find, grid);
  const imp = el('div', 'tt-pl-imp', { hidden: true });
  root.append(head, body, imp);
  document.body.append(root);

  // ---------- 頭像格 ----------
  function cellEl(key, { sel = false } = {}) {
    const star = PL.starOf(key);
    const owned = sel ? PL.achieved(key, unitsOwned()) : false;
    const locked = isLocked(api, key);
    const zh = zhOf(DATA, key), cost = costOf(DATA, key);
    const b = el('button', `tt-pl-cell tt-cost${cost}` + (sel ? ' tt-pl-unit' : '') + (star ? ' tt-in' : '') + (owned ? ' tt-done' : '') + (locked ? ' tt-locked' : ''), {
      type: 'button', 'data-pk': key, 'data-star': star || null, 'data-tt-tip': 'unit:' + key,
      'aria-label': `${zh}，${cost} 費${locked ? '，還沒解鎖' : ''}${star ? `，已加入，目標 ${star} 星${owned ? '，已達成' : ''}` : ''}` });
    b.append(styleAvatar(el('span', 'tt-pl-av', { 'aria-hidden': 'true' }), DATA, key));
    if (star) b.append(el('span', 'tt-pl-star', { 'aria-hidden': 'true' }, starsEl(star, { label: false })));
    if (owned) { const c = el('span', 'tt-pl-check', { 'aria-hidden': 'true' }); c.innerHTML = CHECK_SVG; b.append(c); }
    if (locked) { const l = el('span', 'tt-pl-lock', { 'aria-hidden': 'true' }); l.innerHTML = LOCK_SVG; b.append(l); }
    return b;
  }

  // ---------- 已選列＋羈絆 ----------
  function renderSel() {
    const list = PL.list();
    const nodes = list.map(e => cellEl(e.key, { sel: true }));
    const slots = list.length < 10 ? 10 : Math.min(PL.MAX, Math.ceil((list.length + 1) / 5) * 5);
    for (let i = list.length; i < slots; i++) nodes.push(el('span', 'tt-pl-empty', { 'aria-hidden': 'true' }));
    selBox.replaceChildren(...nodes);
    count.textContent = `${list.length}/${PL.MAX}`;
    count.classList.toggle('tt-full', PL.full());
    clearBtn.disabled = !list.length; copyBtn.disabled = !list.length;
    // 羈絆：用目標星級算（K/DA 這種算星數的羈絆照星級）
    let tr = [];
    try { tr = api.countTraits ? api.countTraits(list.map(e => ({ key: e.key, star: e.star, items: [] })), DATA, { augments: [] }) : []; } catch (_) { tr = []; }
    const shown = sortTraits(tr.filter(t => t.count >= 1), DATA);
    if (!shown.length) { traitBox.replaceChildren(el('span', 'tt-pl-tnone', {}, '加棋子進來，羈絆就會統計在這裡')); return; }
    traitBox.replaceChildren(...shown.map(t => {
      const name = traitZh(DATA, t.key);
      const n = el('span', 'tt-pl-trait' + (t.active ? ' tt-on' : ''), { 'data-trait': t.key, 'data-tt-tip': 'trait:' + t.key, title: `${name} ${t.count}`, 'aria-label': `${name} ${t.count}${t.active ? '，啟動' : ''}` },
        traitHex(DATA, t, 20), el('b', 'tt-num', {}, t.count));
      return n;
    }));
  }

  // ---------- 棋子格 ----------
  const zhSort = (a, b) => zhOf(DATA, a.key).localeCompare(zhOf(DATA, b.key), 'zh-Hant');
  function matches(u, q) {
    if (!q) return true;
    if (zhOf(DATA, u.key).toLowerCase().includes(q) || u.key.toLowerCase().includes(q)) return true;
    return (u.traits || []).some(k => traitZh(DATA, k).toLowerCase().includes(q));
  }
  function groupHead(t, n) {
    return el('h3', 'tt-pl-gh', {}, traitIcon(DATA, t.key, 18), t.zh, el('small', '', {}, String(n)));
  }
  function renderGrid() {
    const q = st.q.trim().toLowerCase();
    const list = units.filter(u => matches(u, q));
    const out = [];
    if (!list.length) out.push(el('p', 'tt-pl-none', {}, '找不到符合的棋子'));
    else if (st.sort === 'cost' || st.sort === 'name') {
      const sorted = list.slice().sort(st.sort === 'cost' ? ((a, b) => (a.cost - b.cost) || zhSort(a, b)) : zhSort);
      out.push(el('div', 'tt-pl-cells', {}, sorted.map(u => cellEl(u.key))));
    } else {
      const kind = st.sort;   // origin | class
      const seen = new Set();
      const groups = DATA.traits.list.filter(t => t.kind === kind).map(t => ({ t, us: list.filter(u => (u.traits || []).includes(t.key)).sort((a, b) => (a.cost - b.cost) || zhSort(a, b)) }))
        .filter(g => g.us.length).sort((a, b) => (b.us.length - a.us.length) || a.t.zh.localeCompare(b.t.zh, 'zh-Hant'));
      for (const g of groups) { g.us.forEach(u => seen.add(u.key)); out.push(el('section', 'tt-pl-group', {}, groupHead(g.t, g.us.length), el('div', 'tt-pl-cells', {}, g.us.map(u => cellEl(u.key))))); }
      if (kind === 'class') {   // 獨有羈絆放在職業分頁最後
        const uniq = DATA.traits.list.filter(t => t.kind === 'unique').map(t => ({ t, us: list.filter(u => (u.traits || []).includes(t.key)) })).filter(g => g.us.length);
        if (uniq.length) {
          const us = uniq.flatMap(g => g.us).filter((u, i, a) => a.indexOf(u) === i).sort((a, b) => (a.cost - b.cost) || zhSort(a, b));
          us.forEach(u => seen.add(u.key));
          out.push(el('section', 'tt-pl-group', {}, el('h3', 'tt-pl-gh', {}, '獨有羈絆', el('small', '', {}, String(us.length))), el('div', 'tt-pl-cells', {}, us.map(u => cellEl(u.key)))));
        }
      }
      const rest = list.filter(u => !seen.has(u.key)).sort((a, b) => (a.cost - b.cost) || zhSort(a, b));
      if (rest.length) out.push(el('section', 'tt-pl-group', {}, el('h3', 'tt-pl-gh', {}, '沒有這類羈絆', el('small', '', {}, String(rest.length))), el('div', 'tt-pl-cells', {}, rest.map(u => cellEl(u.key)))));
    }
    grid.replaceChildren(...out);
  }
  function refresh() {
    if (!st.open) return;
    const gs = grid.scrollTop, ss = selBox.scrollTop;
    renderSel(); renderGrid();
    grid.scrollTop = gs; selBox.scrollTop = ss;
    fit();
  }

  // ---------- 位置（桌機：置中、貼在商店上緣；手機：全螢幕由 CSS 管） ----------
  function fit() {
    if (!st.open) return;
    try {
      if (isMobile()) { root.style.removeProperty('--tt-pl-bottom'); return; }
      const hud = document.querySelector('.tt-hud');
      const top = hud ? hud.getBoundingClientRect().top : window.innerHeight * 0.78;
      root.style.setProperty('--tt-pl-bottom', Math.max(8, window.innerHeight - top + 8) + 'px');
    } catch (_) { /* 略過 */ }
  }

  // ---------- 操作：加入／升星／移出 ----------
  function doTap(key) {
    const r = PL.tap(key);
    if (!r.ok) {
      if (r.reason === 'full') { toast(isMobile() ? `滿 ${PL.MAX} 隻了，長按棋子移出一隻再加` : `滿 ${PL.MAX} 隻了，右鍵移出一隻再加`); try { api.sfx('error'); } catch (_) { /* 略過 */ } }
      return;
    }
    try { api.sfx(r.action === 'add' ? 'place' : 'pick'); } catch (_) { /* 略過 */ }
  }
  function doRemove(key) { if (PL.remove(key)) { try { api.sfx('sell'); } catch (_) { /* 略過 */ } } }

  let touchPress = null, lastType = 'mouse';
  const cellOf = (t) => (t && t.closest ? t.closest('[data-pk]') : null);
  root.addEventListener('pointerdown', (e) => {
    lastType = e.pointerType || 'mouse';
    const c = cellOf(e.target);
    if (!c || st.view !== 'main') return;
    if (e.pointerType === 'mouse') return;   // 滑鼠走 click／contextmenu
    touchPress = { key: c.dataset.pk, x: e.clientX, y: e.clientY, long: false, id: e.pointerId };
    touchPress.t = setTimeout(() => { if (touchPress) { touchPress.long = true; if (PL.has(touchPress.key)) { doRemove(touchPress.key); try { navigator.vibrate && navigator.vibrate(20); } catch (_) { /* 略過 */ } } } }, LONG_MS);
  });
  root.addEventListener('pointermove', (e) => {
    if (touchPress && e.pointerId === touchPress.id && Math.hypot(e.clientX - touchPress.x, e.clientY - touchPress.y) > MOVE_PX) { clearTimeout(touchPress.t); touchPress = null; }
  });
  const endPress = (e, cancel) => {
    if (!touchPress || e.pointerId !== touchPress.id) return;
    clearTimeout(touchPress.t);
    const p = touchPress; touchPress = null;
    if (!cancel && !p.long) doTap(p.key);
  };
  root.addEventListener('pointerup', (e) => endPress(e, false));
  root.addEventListener('pointercancel', (e) => endPress(e, true));
  root.addEventListener('click', (e) => {
    const c = cellOf(e.target);
    if (!c || st.view !== 'main') return;
    if (e.detail !== 0 && (lastType === 'touch' || lastType === 'pen')) { lastType = 'mouse'; return; }   // 觸控已在 pointerup 處理（鍵盤按 Enter 產生的 click 照算）
    doTap(c.dataset.pk);
  });
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('input')) return;
    e.preventDefault();
    if (lastType === 'touch' || lastType === 'pen') return;   // 長按已經移出，不要再處理一次
    const c = cellOf(e.target);
    if (c && st.view === 'main') doRemove(c.dataset.pk);
  });
  root.addEventListener('keydown', (e) => {
    const c = cellOf(e.target);
    if ((e.key === 'Delete' || e.key === 'Backspace') && c && st.view === 'main') { e.preventDefault(); doRemove(c.dataset.pk); const n = selBox.querySelector('[data-pk]') || grid.querySelector('[data-pk]'); n && n.focus(); }
  });

  // 頂部按鈕
  closeBtn.addEventListener('click', () => close());
  foldBtn.addEventListener('click', () => setCollapsed(!st.collapsed));
  function setCollapsed(v) {
    st.collapsed = !!v; root.dataset.collapsed = st.collapsed ? '1' : '0';
    foldBtn.setAttribute('aria-expanded', String(!st.collapsed)); foldBtn.textContent = st.collapsed ? '▴' : '▾';
    foldBtn.setAttribute('aria-label', st.collapsed ? '展開' : '收合');
  }
  sortBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    st.sort = b.dataset.sort;
    for (const x of sortBox.children) x.setAttribute('aria-selected', String(x === b));
    renderGrid(); grid.scrollTop = 0;
  });
  search.addEventListener('input', () => { st.q = search.value; renderGrid(); grid.scrollTop = 0; });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; st.q = ''; renderGrid(); } });

  clearBtn.addEventListener('click', () => {
    if (!st.armClear) {
      st.armClear = true; clearBtn.classList.add('tt-arm'); clearBtn.lastChild.textContent = '再按一次清空';
      setTimeout(() => { st.armClear = false; clearBtn.classList.remove('tt-arm'); clearBtn.lastChild.textContent = '清空'; }, 3000);
      return;
    }
    st.armClear = false; clearBtn.classList.remove('tt-arm'); clearBtn.lastChild.textContent = '清空';
    PL.clear(); toast('清空了');
  });
  copyBtn.addEventListener('click', async () => {
    const text = PL.toText((k) => zhOf(DATA, k));
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      try { const ta = el('textarea', '', { style: 'position:fixed;left:-999px;top:0' }); ta.value = text; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_2) { ok = false; }
    }
    toast(ok ? `複製了 ${PL.size()} 隻` : '複製失敗，瀏覽器不讓寫剪貼簿');
  });
  impBtn.addEventListener('click', () => showImport());

  // ---------- 看圖匯入 ----------
  const fileIn = el('input', '', { type: 'file', accept: 'image/*', hidden: true, 'data-pl': 'file', 'aria-label': '選擇截圖' });
  root.append(fileIn);
  fileIn.addEventListener('change', () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) startImport(f); });

  function setView(v) {
    st.view = v;
    imp.hidden = v === 'main';
    root.dataset.view = v;
  }
  function impHead(title, back) {
    const b = el('button', 'tt-pl-back', { type: 'button', 'aria-label': '回編輯器' }, '←');
    b.addEventListener('click', back);
    return el('header', 'tt-imp-head', {}, b, el('b', '', {}, title));
  }
  function showImport() {
    if (abortCtl) { try { abortCtl.abort(); } catch (_) { /* 略過 */ } abortCtl = null; }
    setView('imp');
    const pick = el('button', 'tt-pl-btn tt-primary', { type: 'button', 'data-pl': 'pick' }, '選一張圖');
    pick.addEventListener('click', () => fileIn.click());
    const drop = el('div', 'tt-imp-drop', { tabindex: '0', 'data-pl': 'drop' },
      el('p', 'tt-imp-big', {}, '貼上、拖進來，或選一張截圖'),
      el('p', 'tt-imp-sub', {}, isMobile() ? '手機：按下面的鈕從相簿選圖。' : '電腦：直接按 Ctrl+V 貼上截圖最快。'),
      pick);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    imp.replaceChildren(impHead('看圖匯入', backToMain), el('div', 'tt-imp-body', {}, drop,
      el('ul', 'tt-imp-notes', {},
        el('li', '', {}, '認得：遊戲內的隊伍編輯器、攻略網的陣容圖、本站陣容頁的截圖（有頭像的那種）。'),
        el('li', '', {}, '對戰畫面的 3D 模型認不出來，請改截隊伍編輯器或陣容頁。'),
        el('li', '', {}, '圖片只在你的瀏覽器裡處理，不會傳到任何地方。'))));
    // 拖放
    const stop = (e) => { e.preventDefault(); };
    imp.ondragover = (e) => { stop(e); drop.classList.add('tt-over'); };
    imp.ondragleave = () => drop.classList.remove('tt-over');
    imp.ondrop = (e) => { stop(e); drop.classList.remove('tt-over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) startImport(f); };
  }
  function backToMain() {
    if (abortCtl) { try { abortCtl.abort(); } catch (_) { /* 略過 */ } abortCtl = null; }
    setView('main'); refresh();
  }
  async function startImport(file) {
    if (!file || !/^image\//.test(file.type || 'image/')) { toast('這不是圖片'); return; }
    if (st.view !== 'imp') { st.view = 'imp'; imp.hidden = false; root.dataset.view = 'imp'; }
    if (!recog) recog = createRecognizer(DATA);
    if (abortCtl) { try { abortCtl.abort(); } catch (_) { /* 略過 */ } }
    const ctl = abortCtl = new AbortController();
    const bar = el('i', 'tt-imp-barfill'), pct = el('b', 'tt-num', {}, '0%');
    const cancel = el('button', 'tt-pl-btn', { type: 'button' }, '取消');
    cancel.addEventListener('click', backToMain);
    imp.replaceChildren(impHead('看圖匯入', backToMain), el('div', 'tt-imp-body tt-imp-work', {}, el('p', 'tt-imp-big', {}, '辨識中…'), el('div', 'tt-imp-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar), pct, el('p', 'tt-imp-sub', {}, '在你的瀏覽器裡算，不會上傳。'), cancel));
    const bm = imp.querySelector('.tt-imp-bar');
    const t0 = performance.now();
    let out;
    try {
      out = await recog.run(file, { signal: ctl.signal, onProgress: (p) => { const v = Math.round(p * 100); bar.style.width = v + '%'; pct.textContent = v + '%'; bm && bm.setAttribute('aria-valuenow', String(v)); } });
    } catch (err) {
      if (ctl.signal.aborted || (err && err.name === 'AbortError')) return;
      imp.replaceChildren(impHead('看圖匯入', backToMain), el('div', 'tt-imp-body', {}, el('p', 'tt-imp-big', {}, '這張圖讀不出來'), el('p', 'tt-imp-sub', {}, String(err && err.message || err)), againBtn()));
      return;
    }
    if (ctl.signal.aborted) return;
    abortCtl = null;
    showResults(out, Math.round(performance.now() - t0));
  }
  const againBtn = () => { const b = el('button', 'tt-pl-btn', { type: 'button' }, '換一張'); b.addEventListener('click', showImport); return b; };

  function thumb(out, it) {
    const c = el('canvas', 'tt-imp-crop', { 'aria-hidden': 'true' });
    const s = Math.round(it.size * 1.0), x = Math.round(it.x - s / 2), y = Math.round(it.y - s / 2);
    c.width = 64; c.height = 64;
    try { c.getContext('2d').drawImage(out.canvas, x, y, s, s, 0, 0, 64, 64); } catch (_) { /* 略過 */ }
    return c;
  }
  function showResults(out, ms) {
    // 每個偵測位置：{it, pick（目前選的候選序號）, on（要不要加）}
    const rows = out.items.map(it => ({ it, pick: 0, on: it.sure }));
    const sureN = rows.filter(r => r.on).length;
    const listBox = el('div', 'tt-imp-list');
    const sum = el('p', 'tt-imp-sum', {});
    const addBtn = el('button', 'tt-pl-btn tt-primary', { type: 'button', 'data-pl': 'add' }, '加入');
    const note = el('p', 'tt-imp-note', { role: 'status' });
    const chosen = () => { const m = new Map(); for (const r of rows) if (r.on) { const k = r.it.cands[r.pick].key; if (!m.has(k)) m.set(k, true); } return [...m.keys()]; };
    function sync() {
      const keys = chosen();
      const fresh = keys.filter(k => !PL.has(k)), room = PL.MAX - PL.size();
      addBtn.textContent = fresh.length ? `加入 ${Math.min(fresh.length, room)} 隻` : '加入';
      addBtn.disabled = !fresh.length || room <= 0;
      const bits = [];
      if (keys.length > fresh.length) bits.push(`${keys.length - fresh.length} 隻已經在編輯器裡`);
      if (fresh.length > room) bits.push(room > 0 ? `只剩 ${room} 格，後面的 ${fresh.length - room} 隻放不進去` : `編輯器滿了（${PL.MAX} 隻）`);
      const dupPick = rows.filter(r => r.on).length - keys.length;
      if (dupPick > 0) bits.push(`有 ${dupPick} 隻重複，只算一隻`);
      note.textContent = bits.join('；');
    }
    function draw() {
      listBox.replaceChildren(...rows.map((r, i) => {
        const card = el('div', 'tt-imp-card' + (r.on ? '' : ' tt-off') + (r.it.sure ? '' : ' tt-unsure'), { 'data-i': i });
        const cands = el('div', 'tt-imp-cands', { role: 'radiogroup', 'aria-label': '候選' });
        r.it.cands.forEach((c, j) => {
          const cb = el('button', `tt-imp-cand tt-cost${costOf(DATA, c.key)}` + (j === r.pick ? ' tt-pick' : ''), { type: 'button', role: 'radio', 'aria-checked': String(j === r.pick), 'data-key': c.key, title: `${zhOf(DATA, c.key)}（${Math.round(c.score * 100)}%）` },
            styleAvatar(el('span', 'tt-pl-av', { 'aria-hidden': 'true' }), DATA, c.key), el('span', 'tt-imp-nm', {}, zhOf(DATA, c.key)));
          cb.addEventListener('click', () => { r.pick = j; r.on = true; draw(); sync(); });
          cands.append(cb);
        });
        const x = el('button', 'tt-imp-x', { type: 'button', 'aria-label': r.on ? '這個不要' : '要加這個', title: r.on ? '這個不要' : '要加這個' }, r.on ? '✕' : '＋');
        x.addEventListener('click', () => { r.on = !r.on; draw(); sync(); });
        card.append(thumb(out, r.it), cands, x);
        if (!r.it.sure) card.append(el('span', 'tt-imp-flag', {}, '不太確定'));
        return card;
      }));
    }
    const ac = el('button', 'tt-pl-btn', { type: 'button', 'data-pl': 'all' }, '全部不要');
    ac.addEventListener('click', () => { rows.forEach(r => { r.on = false; }); draw(); sync(); });
    addBtn.addEventListener('click', () => {
      const keys = chosen();
      const r = PL.addMany(keys.map(k => ({ key: k, star: 2 })));
      toast(r.added ? `加進編輯器 ${r.added} 隻` + (r.skipped ? `，${r.skipped} 隻放不進去` : '') : '沒有新加的');
      backToMain();
    });
    const again = againBtn();
    if (!rows.length) {
      imp.replaceChildren(impHead('看圖匯入', backToMain), el('div', 'tt-imp-body', {},
        el('p', 'tt-imp-big', {}, '這張圖裡找不到棋子頭像'),
        el('p', 'tt-imp-sub', {}, '對戰畫面的 3D 模型認不出來，請改截隊伍編輯器或陣容頁。'),
        el('p', 'tt-imp-sub', {}, '也可能是頭像太小太糊，放大一點再截一次試試。'), again));
      return;
    }
    sum.textContent = `找到 ${rows.length} 個頭像，${sureN} 個很確定（${(ms / 1000).toFixed(1)} 秒）。點下面的候選可以換，✕ 不要。` + (rows.length > sureN ? '標「不太確定」的先不加。' : '');
    imp.replaceChildren(impHead('確認匯入', backToMain), el('div', 'tt-imp-body tt-imp-res', {}, sum, listBox, note),
      el('footer', 'tt-imp-foot', {}, again, ac, addBtn));
    draw(); sync();
  }

  // 貼上截圖（編輯器開著、不是在輸入文字時）
  document.addEventListener('paste', (e) => {
    if (!st.open) return;
    const files = e.clipboardData && e.clipboardData.files;
    const f = files && [...files].find(x => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    startImport(f);
  });

  // ---------- 開關 ----------
  function open() {
    if (st.open) return;
    st.open = true; root.hidden = false; setView('main');
    root.dataset.mobile = isMobile() ? '1' : '0';
    refresh();
    document.querySelector('[data-act=planner]')?.setAttribute('aria-pressed', 'true');
    try { api.sfx('select'); } catch (_) { /* 略過 */ }
    if (isMobile()) closeBtn.focus({ preventScroll: true });
  }
  function close() {
    if (!st.open) return;
    if (abortCtl) { try { abortCtl.abort(); } catch (_) { /* 略過 */ } abortCtl = null; }
    st.open = false; root.hidden = true;
    document.querySelector('[data-act=planner]')?.setAttribute('aria-pressed', 'false');
  }
  const toggle = () => (st.open ? close() : open());
  document.addEventListener('keydown', (e) => {
    if (!st.open || e.key !== 'Escape') return;
    if (document.querySelector('.tt-overlay, .tt-fbmodal')) return;
    if (st.view !== 'main') { backToMain(); e.preventDefault(); return; }
    close(); e.preventDefault();
  });
  window.addEventListener('resize', () => { root.dataset.mobile = isMobile() ? '1' : '0'; fit(); });
  // 清單一變就通知整個介面（商店卡的標示跟著變）；面板自己也在 change 時重畫（達成狀態會因買賣而變）
  PL.onChange(() => { try { api.emit('change'); } catch (_) { /* 略過 */ } });
  if (api.on) api.on('change', () => { if (st.open && st.view === 'main') refresh(); });
  api.togglePlanner = toggle; api.openPlanner = open; api.closePlanner = close;
  api.plannerOpen = () => st.open;
  return { open, close, toggle, isOpen: () => st.open, startImport };
}

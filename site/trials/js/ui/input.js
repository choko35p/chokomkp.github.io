// 輸入處理（SPEC_UI2 4.2–4.4、5.2）：選取、拖曳、右鍵、長按、鍵盤。layout.js 只管骨架與 render，輸入全在這裡。
//   bindInput({ app, api, R, render, h })
//   h = { unitByUid, unitAt, sellPrice, doSell, go, cycleSpeed, skipBattle, toBoardDefault, modalOpen, setSel }
// 規則：左鍵點＝選取（點另一隻＝改選、點空白＝取消）；換位子、上下場、賣出、買（拖）只能用拖的；點不會移動任何東西。
import { enableDnd } from './dnd.js';
import { bindTips, showTip, hideTip, isTipPinned } from './tooltip.js';
import * as PN from './panels.js';
import { coverOf } from './board.js';

export const parse = (d) => {
  if (!d) return null;
  const [k, ...rest] = String(d).split(':');
  if (k === 'board') { const [r, c] = (rest[0] || '').split(',').map(Number); return { k, r, c }; }
  if (k === 'bench' || k === 'shop' || k === 'item') return { k, i: Number(rest[0]) };
  if (k === 'enemy') return { k, key: rest[0], star: rest[1] != null ? Number(rest[1]) : null };
  if (k === 'sp') return { k, id: rest[0] };
  if (k === 'fav') return { k, uid: Number(rest[0]) };
  if (k === 'inst') { const [r, c] = (rest[0] || '').split(',').map(Number); return { k, r, c }; }   // 已經擺在棋盤上的沙灘樂器：inst:<r>,<c>
  if (k === 'spbar') return { k };
  if (k === 'mk') return { k, id: rest[0], uid: Number(rest[1]) };   // 棋子身上的標記：mk:<道具>:<棋子 uid>
  return { k };
};

const DROP_HINT = { rm: '要拖到有裝備的棋子身上', fav: '要拖到心鋼之聲成員身上', spot: '要拖到你要捧的那隻棋子身上', deal: '要拖到你要簽的那隻棋子身上', prod: '要拖到有樂團羈絆的棋子身上', clone: '要拖到一隻棋子身上', inst: '樂器要拖到我方棋盤的空格上' };
const tag = (n) => (n && n.tagName ? n.tagName : '');

export function bindInput({ app, api, R = {}, render, h = {} }) {
  const ui = api.ui;
  const { DATA } = api;
  PN.bindApi(api);
  bindTips(document.body, api);   // 綁在 body：彈窗（羈絆面板、解鎖說明）也要有說明框

  const sfx = (n) => { try { api.sfx && api.sfx(n); } catch (_) { /* 音效壞了不影響操作 */ } };
  const hot = () => PN.hotkeysOf(api);
  const modalOpen = () => (h.modalOpen ? h.modalOpen() : PN.hasPanel());
  const unitpanel = () => R.unitpanel || app.querySelector('[data-tt-mount=unitpanel]');
  const shopHost = () => R.shop || app.querySelector('.tt-xshop');
  const stateUnits = () => [...api.state.board.filter(Boolean), ...api.state.bench.filter(Boolean)];
  const unitByUid = (uid) => (h.unitByUid ? h.unitByUid(uid) : stateUnits().find(u => u.uid === uid));
  const unitAt = (d) => (h.unitAt ? h.unitAt(d) : d.k === 'board' ? api.state.board.find(u => u.pos && u.pos[0] === d.r && u.pos[1] === d.c) : d.k === 'bench' ? api.state.bench[d.i] : null);
  const setSel = (s) => { if (h.setSel) h.setSel(s); else { ui.sel = s; ui.sellArm = null; render(); } };
  const toast = (m) => { try { api.toast && api.toast(m); } catch (_) { /* 略過 */ } };

  const sameSel = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && (a.kind === 'unit' ? a.uid === b.uid : a.kind === 'item' ? a.idx === b.idx : a.kind === 'sp' ? a.id === b.id : a.key === b.key && a.star === b.star));
  function select(s) {
    if (sameSel(ui.sel, s)) return;       // 點已選的同一隻＝維持選取
    setSel(s);
    if (s) sfx('select');
  }
  const clearSel = () => { if (ui.sel) setSel(null); };

  // ---------- 敵方棋子：從目前對手陣容找星級與裝備 ----------
  function enemySel(d, el) {
    let star = d.star, items = [];
    try {
      const e = api.enemy && api.enemy();
      const list = ((e && e.units) || []).filter(u => u.key === d.key);
      const its = el && el.dataset.ttItems != null ? el.dataset.ttItems : null;
      const stEl = el && el.dataset.ttStar ? Number(el.dataset.ttStar) : star;
      const pick = list.find(u => (stEl == null || u.star === stEl) && (its == null || (u.items || []).join(',') === its)) || list.find(u => stEl == null || u.star === stEl) || list[0];
      if (pick) { star = pick.star; items = pick.items || []; }
    } catch (_) { /* 略過 */ }
    return { kind: 'enemy', key: d.key, star: star || 1, items };
  }

  // ---------- 點 ----------
  function onTap(desc, el, ev = { button: 0 }) {
    if (ui.mode !== 'plan' || modalOpen()) return;
    const d = parse(desc); if (!d) return;
    if (d.k === 'shop') {
      if (ev.button === 0) { hideTip(); api.act('buy', d.i); }
      return;
    }
    if (d.k === 'enemy') return select(enemySel(d, el));
    if (d.k === 'item') return select({ kind: 'item', idx: d.i });
    if (d.k === 'sp') return select({ kind: 'sp', id: d.id });
    if (d.k === 'inst') return select({ kind: 'sp', id: 'inst' });
    if (d.k === 'fav' || d.k === 'mk') return select({ kind: 'unit', uid: d.uid });
    if (d.k === 'board' || d.k === 'bench') {
      const u = unitAt(d);
      if (u) select({ kind: 'unit', uid: u.uid }); else clearSel();     // 空格＝取消選取，不是移動
    }
  }
  function onTapEmpty() {
    if (ui.mode !== 'plan' || modalOpen()) return;
    if (isTipPinned()) hideTip();
    clearSel();
  }

  // ---------- 拖 ----------
  function onDragStart(desc) {
    const d = parse(desc); if (!d) return;
    hideTip();
    app.dataset.dragging = d.k === 'shop' ? 'shop' : (d.k === 'item' || d.k === 'sp' || d.k === 'fav' || d.k === 'mk' || d.k === 'inst') ? 'item' : 'unit';
    if (d.k === 'inst' || (d.k === 'sp' && d.id === 'inst')) app.dataset.instDrag = '1';
    if (d.k === 'board' || d.k === 'bench') {
      const u = unitAt(d); if (!u) return;
      ui.dragUnit = u.uid;      // 包 B 的 render／syncDrag 讀這個 uid，把商店變成賣出區
      ui.sel = { kind: 'unit', uid: u.uid }; ui.sellArm = null;
      try { PN.renderUnitSide(unitpanel(), api); } catch (_) { /* 略過 */ }
      sfx('pickup');
    } else if (d.k === 'sp' || d.k === 'fav' || d.k === 'mk' || d.k === 'inst') {
      ui.sel = d.k === 'sp' ? { kind: 'sp', id: d.id } : d.k === 'inst' ? { kind: 'sp', id: 'inst' } : { kind: 'unit', uid: d.uid };
      try { PN.renderUnitSide(unitpanel(), api); } catch (_) { /* 略過 */ }
      sfx('pickup');
    } else if (d.k === 'item') {
      ui.sel = { kind: 'item', idx: d.i };
      try { PN.renderUnitSide(unitpanel(), api); } catch (_) { /* 略過 */ }
      sfx('pickup');
    }
  }
  // 拖沙灘樂器時：游標停在哪一格，那一格相鄰的 6 格就亮起來（顯示樂器碰得到的範圍）
  const clearRange = () => { for (const n of app.querySelectorAll('.tt-rangehint')) n.classList.remove('tt-rangehint'); };
  // ---------- 裝備欄合成：散件拖到另一件散件上，停滿 1 秒放開＝直接合成 ----------
  // 停上去就在旁邊顯示「會合成：成品」（圖示、名稱、一句效果），目標格繞一圈倒數；只有配得出成品的兩件才顯示。
  // 不到 1 秒放開、或移到別處＝照舊（沒有事發生，裝備留在原位）。dnd 會先呼叫 onDragEnd 再 onDrop，所以放開前把「已停滿」記在 comboDone。
  const COMBO_MS = 1000;
  let combo = null, comboDone = null;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function comboStop() {
    if (!combo) return;
    clearTimeout(combo.timer); cancelAnimationFrame(combo.raf);
    combo.pop.remove();
    combo.tgt.classList.remove('tt-combo-tgt', 'tt-ready'); combo.tgt.style.removeProperty('--p');
    combo = null;
  }
  function comboRecipe(fromI, toI) {
    const L = api.state.itemBench || [], a = L[fromI], b = L[toI];
    if (!a || !b || fromI === toI) return null;
    const res = DATA.items.recipes && DATA.items.recipes[[a, b].sort().join('+')];
    return res ? { res, a, b } : null;
  }
  // 散件拖到「身上已有 1 件散件」的棋子上＝直接合成（官方做法，game.js giveItem）；拖著經過時跳預覽，不用停
  function unitComboRecipe(itemI, u) {
    const a = (api.state.itemBench || [])[itemI];
    if (!a || !u || !DATA.items.compByKey || !DATA.items.compByKey[a]) return null;
    for (const e of u.items || []) {
      const res = DATA.items.recipes && DATA.items.recipes[[a, e].sort().join('+')];
      if (res) return { res, a, b: e };
    }
    return null;
  }
  function comboStart(fromI, toI, tgt) {
    const rc = comboRecipe(fromI, toI); if (!rc) return;
    comboBuild(rc, tgt, fromI, toI, true);
  }
  function comboBuild(rc, tgt, fromI, toI, hold) {
    const it = DATA.items.byKey[rc.res] || {};
    const nm = (k) => (DATA.items.compByKey && DATA.items.compByKey[k] ? DATA.items.compByKey[k].zh : k);
    const eff = String(it.desc || it.simplified || '').split('。')[0];
    const ic = document.createElement('span'); ic.className = 'tt-cp-ic'; ic.style.backgroundImage = `url("../icons/items/${rc.res}.webp")`;
    const txt = document.createElement('div');
    const b = document.createElement('b'); b.textContent = '會合成：' + (it.zh || rc.res);
    const sm = document.createElement('small'); sm.textContent = eff ? eff + '。' : '';
    const em = document.createElement('em'); em.textContent = `${nm(rc.a)} ＋ ${nm(rc.b)}　` + (hold ? '停 1 秒再放開' : '放開就合成');
    txt.append(b, sm, em);
    const pop = document.createElement('div'); pop.className = 'tt-combo-pop'; pop.setAttribute('role', 'status'); pop.setAttribute('data-tt-combo', rc.res);
    pop.append(ic, txt); document.body.append(pop);
    const r = tgt.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth;
    const narrow = vw < 1024 || (window.matchMedia && matchMedia('(orientation: portrait)').matches);
    let x, y;
    if (!narrow && r.right + 8 + pw <= vw - 4) { x = r.right + 8; y = r.top + r.height / 2 - ph / 2; }
    else { x = r.left + r.width / 2 - pw / 2; y = r.top - ph - 10; if (y < 4) y = r.bottom + 10; }
    pop.style.left = Math.max(4, Math.min(vw - pw - 4, x)) + 'px'; pop.style.top = Math.max(4, y) + 'px';
    tgt.classList.add('tt-combo-tgt');
    if (!hold) { combo = { from: null, to: null, res: rc.res, pop, tgt, ready: false, timer: 0, raf: 0 }; return; }   // 拖到棋子身上：只顯示預覽
    const t0 = nowMs();
    combo = { from: fromI, to: toI, res: rc.res, pop, tgt, ready: false, timer: 0, raf: 0 };
    const tick = () => { if (!combo) return; tgt.style.setProperty('--p', Math.min(1, (nowMs() - t0) / COMBO_MS).toFixed(3)); if (!combo.ready) combo.raf = requestAnimationFrame(tick); };
    combo.raf = requestAnimationFrame(tick);
    combo.timer = setTimeout(() => { if (!combo) return; combo.ready = true; tgt.style.setProperty('--p', '1'); tgt.classList.add('tt-ready'); pop.classList.add('tt-ready'); em.textContent = '現在放開就合成'; sfx('select'); }, COMBO_MS);
  }
  function onDragOver(to, from) {
    comboStop();
    const f0 = parse(from), t0 = parse(to);
    if (f0 && t0 && f0.k === 'item' && t0.k === 'item') {
      const tgt = app.querySelector(`[data-tt-drop="item:${t0.i}"]`);
      if (tgt) comboStart(f0.i, t0.i, tgt);
    } else if (f0 && t0 && f0.k === 'item' && (t0.k === 'board' || t0.k === 'bench')) {
      const rc = unitComboRecipe(f0.i, unitAt(t0));
      const tgt = rc && app.querySelector(`[data-tt-drop="${t0.k === 'board' ? `board:${t0.r},${t0.c}` : `bench:${t0.i}`}"]`);
      if (tgt) comboBuild(rc, tgt, null, null, false);
    }
    clearRange();
    if (!app.dataset.instDrag) return;
    const t = parse(to);
    if (!t || t.k !== 'board') return;
    for (const [r, c] of coverOf(t.r, t.c)) { const n = app.querySelector(`[data-tt-drop="board:${r},${c}"]`); if (n) n.classList.add('tt-rangehint'); }
  }
  function onDragEnd() {
    comboDone = combo && combo.ready ? { from: combo.from, to: combo.to } : null;
    comboStop();
    ui.dragUnit = null; ui.dragging = false;
    app.removeAttribute('data-dragging');
    app.removeAttribute('data-inst-drag');
    clearRange();
  }
  const bounce = () => { sfx('error'); render(); };
  function onDrop(from, to) {
    if (ui.mode !== 'plan') { comboDone = null; return; }
    const f = parse(from), t = parse(to);
    if (!f) return;
    if (!t) return bounce();
    let r = null;
    if (f.k === 'shop') {
      if (t.k === 'bench' || t.k === 'board') { ui.sel = null; r = api.act('buy', f.i); } else return bounce();
    } else if (f.k === 'inst' || (f.k === 'sp' && f.id === 'inst')) {
      // 沙灘樂器：拖到我方空格＝擺放／換位置；已擺好的拖回道具列＝收回。棋子不能站在樂器格（拖過去會彈回）
      const from = f.k === 'inst' ? [f.r, f.c] : null;
      if (t.k === 'spbar') { if (!from) return render(); ui.sel = null; r = api.act('instrument', { from, to: null }); }
      else if (t.k === 'board') {
        if (from && from[0] === t.r && from[1] === t.c) return render();
        if (unitAt(t)) { toast('那格有棋子，樂器要放在空格上'); return bounce(); }
        ui.sel = null; r = api.act('instrument', { from, to: [t.r, t.c] });
      } else { toast(DROP_HINT.inst); return bounce(); }
    } else if (f.k === 'sp' || f.k === 'fav' || f.k === 'mk') {
      const id = f.k === 'fav' ? 'fav' : f.id;
      const u = (t.k === 'board' || t.k === 'bench') ? unitAt(t) : null;
      if (!u) { toast(DROP_HINT[id] || '要拖到棋子身上'); return bounce(); }
      if (f.k !== 'sp' && f.uid === u.uid) return render();   // 標記拖回原本那隻
      if (id === 'rm') { ui.sel = null; r = api.act('useRemover', u.uid); }
      else { ui.sel = null; r = api.act('pick', id, u.uid, f.k === 'sp' ? {} : { from: f.uid }); }
    } else if (f.k === 'item' && t.k === 'item') {
      const cd = comboDone; comboDone = null;
      if (!cd || cd.from !== f.i || cd.to !== t.i) return render();   // 沒停滿 1 秒、或不能合：照舊（沒事發生）
      ui.sel = null; r = api.act('combineItems', f.i, t.i);
    } else if (f.k === 'item') {
      comboDone = null;
      const u = (t.k === 'board' || t.k === 'bench') ? unitAt(t) : null;
      if (!u) return bounce();
      ui.sel = null; r = api.act('equip', f.i, u.uid);
    } else {
      const u = unitAt(f); if (!u) return bounce();
      if (t.k === 'sell') { PN.sellUnit(api, u); render(); return; }
      if (t.k !== 'board' && t.k !== 'bench') return bounce();
      const there = unitAt(t);
      if (there && there.uid === u.uid) return render();   // 放回原位
      r = api.act('move', u.uid, t.k === 'board' ? { zone: 'board', pos: [t.r, t.c] } : { zone: 'bench', idx: t.i });
    }
    if (!r || r.ok === false) render();
  }

  // ---------- 手機長按商店卡：跳技能說明，放開就收，這次放開不算買 ----------
  function onLongPress(desc, el) {
    if (ui.mode !== 'plan') return;
    const d = parse(desc); if (!d) return;
    if (d.k === 'sp' || d.k === 'item' || d.k === 'fav' || d.k === 'mk' || d.k === 'inst') {   // 觸控長按道具＝看說明（放開就收）
      const spec = el.dataset.ttTip; if (!spec) return;
      showTip(el, spec, { placement: 'top' });
      const off2 = () => { hideTip(); window.removeEventListener('pointerup', off2, true); window.removeEventListener('pointercancel', off2, true); };
      window.addEventListener('pointerup', off2, true); window.addEventListener('pointercancel', off2, true);
      return;
    }
    if (d.k !== 'shop') return;
    const slot = api.state.shop && api.state.shop[d.i]; if (!slot) return;
    showTip(el, `ability:${slot.key}:1`, { placement: 'top', row: el.parentElement, full: true });
    const off = () => { hideTip(); window.removeEventListener('pointerup', off, true); window.removeEventListener('pointercancel', off, true); };
    window.addEventListener('pointerup', off, true); window.addEventListener('pointercancel', off, true);
  }

  enableDnd(app, { onTap, onTapEmpty, onDrop, onDragStart, onDragEnd, onDragOver, onLongPress });

  // ---------- 右鍵：棋子＝選取（dnd 已處理）、羈絆＝開羈絆面板、其餘不出瀏覽器選單 ----------
  app.addEventListener('contextmenu', (e) => {
    if (tag(e.target) === 'INPUT' || tag(e.target) === 'TEXTAREA') return;
    e.preventDefault();
    const t = e.target.closest && e.target.closest('[data-trait]');
    if (t && ui.mode === 'plan' && !modalOpen()) {
      const enemy = !!t.closest('.tt-etrait, [data-tt-enemy], .tt-enemybar');
      PN.showTraitPanel(t.dataset.trait, api, enemy ? { side: 'enemy', traits: PN.enemyTraitsOf(api) } : {});
    }
  });
  // 雙擊不做事
  app.addEventListener('dblclick', (e) => { if (e.target.closest && e.target.closest('[data-tt-uid]')) e.preventDefault(); });
  // 懸停：記下滑鼠下的棋子（賣出／上場鍵用）。觸控沒有游標，不記（快捷鍵不作用，要賣就按面板裡的「賣出」鍵）
  app.addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') { ui.hoverUid = null; return; } const t = e.target.closest && e.target.closest('[data-tt-uid]'); ui.hoverUid = t ? Number(t.dataset.ttUid) : null; });
  app.addEventListener('pointerleave', () => { ui.hoverUid = null; });

  // ---------- 鍵盤（用 event.code，注音輸入法開著也收得到） ----------
  // 官方做法：賣出鍵、上下場鍵只作用在「滑鼠游標正停在上面」的我方棋子（場上或備戰席），跟目前選取的是誰無關；滑鼠沒停在棋子上＝什麼都不做
  const target = () => unitByUid(ui.hoverUid) || null;
  function doDeploy() {
    const u = target(); if (!u) return;
    ui.hoverUid = null;   // 棋子移走後游標底下就不是它了
    if (u.pos) {
      const i = api.state.bench.indexOf(null);
      if (i < 0) { toast('板凳滿了'); sfx('error'); } else api.act('move', u.uid, { zone: 'bench', idx: i });
    } else {
      const to = h.toBoardDefault ? h.toBoardDefault(u) : null;
      if (!to) { toast('場上沒有空格了'); sfx('error'); } else api.act('move', u.uid, to);
    }
  }
  const ACT = {
    reroll: () => api.act('reroll'),
    buyXp: () => api.act('buyXp'),
    sell: () => { const u = target(); if (u) { ui.hoverUid = null; PN.sellUnit(api, u); } },
    deploy: doDeploy,
    fight: () => h.go && h.go(),
    speed: () => h.cycleSpeed && h.cycleSpeed(),
    skip: () => h.skipBattle && h.skipBattle(),
    unlocks: () => PN.showUnlocks(api),
    planner: () => { if (api.togglePlanner) api.togglePlanner(); },
  };
  for (let n = 1; n <= 5; n++) ACT['buy' + n] = () => api.act('buy', n - 1);

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target;
    if (tg && (tag(tg) === 'INPUT' || tag(tg) === 'TEXTAREA' || tag(tg) === 'SELECT' || tg.isContentEditable)) return;
    if (document.body.hasAttribute('data-tt-recording') || ui.recording) return;   // 正在設定快捷鍵
    if (e.key === 'Escape') {
      if (isTipPinned()) { hideTip(); return; }
      if (modalOpen()) return;   // 面板自己處理
      const p = app.querySelector('.tt-oddspop'); if (p) p.remove();
      clearSel();
      return;
    }
    if (modalOpen()) return;
    const a = hot().actionFor(e.code, ui.mode);
    if (!a || !ACT[a]) return;
    if (e.repeat && (a === 'fight' || a === 'speed' || a === 'skip' || a === 'unlocks' || a === 'planner')) { e.preventDefault(); return; }
    if (e.code === 'Space' || e.key === ' ') e.preventDefault();
    ACT[a]();
  };
  document.addEventListener('keydown', onKey);

  return { destroy() { document.removeEventListener('keydown', onKey); } };
}

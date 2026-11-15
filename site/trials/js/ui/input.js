// 輸入處理（SPEC_UI2 4.2–4.4、5.2）：選取、拖曳、右鍵、長按、鍵盤。layout.js 只管骨架與 render，輸入全在這裡。
//   bindInput({ app, api, R, render, h })
//   h = { unitByUid, unitAt, sellPrice, doSell, go, cycleSpeed, skipBattle, toBoardDefault, modalOpen, setSel }
// 規則：左鍵點＝選取（點另一隻＝改選、點空白＝取消）；換位子、上下場、賣出、買（拖）只能用拖的；點不會移動任何東西。
import { enableDnd } from './dnd.js';
import { bindTips, showTip, hideTip, isTipPinned } from './tooltip.js';
import * as PN from './panels.js';

export const parse = (d) => {
  if (!d) return null;
  const [k, ...rest] = String(d).split(':');
  if (k === 'board') { const [r, c] = (rest[0] || '').split(',').map(Number); return { k, r, c }; }
  if (k === 'bench' || k === 'shop' || k === 'item') return { k, i: Number(rest[0]) };
  if (k === 'enemy') return { k, key: rest[0], star: rest[1] != null ? Number(rest[1]) : null };
  return { k };
};

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

  const sameSel = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && (a.kind === 'unit' ? a.uid === b.uid : a.kind === 'item' ? a.idx === b.idx : a.key === b.key && a.star === b.star));
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
    app.dataset.dragging = d.k === 'shop' ? 'shop' : d.k === 'item' ? 'item' : 'unit';
    if (d.k === 'board' || d.k === 'bench') {
      const u = unitAt(d); if (!u) return;
      ui.dragUnit = u.uid;      // 包 B 的 render／syncDrag 讀這個 uid，把商店變成賣出區
      ui.sel = { kind: 'unit', uid: u.uid }; ui.sellArm = null;
      try { PN.renderUnitSide(unitpanel(), api); } catch (_) { /* 略過 */ }
      sfx('pickup');
    } else if (d.k === 'item') {
      ui.sel = { kind: 'item', idx: d.i };
      try { PN.renderUnitSide(unitpanel(), api); } catch (_) { /* 略過 */ }
      sfx('pickup');
    }
  }
  function onDragEnd() {
    ui.dragUnit = null; ui.dragging = false;
    app.removeAttribute('data-dragging');
  }
  const bounce = () => { sfx('error'); render(); };
  function onDrop(from, to) {
    if (ui.mode !== 'plan') return;
    const f = parse(from), t = parse(to);
    if (!f) return;
    if (!t) return bounce();
    let r = null;
    if (f.k === 'shop') {
      if (t.k === 'bench' || t.k === 'board') { ui.sel = null; r = api.act('buy', f.i); } else return bounce();
    } else if (f.k === 'item') {
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
    const d = parse(desc); if (!d || d.k !== 'shop') return;
    const slot = api.state.shop && api.state.shop[d.i]; if (!slot) return;
    showTip(el, `ability:${slot.key}:1`, { placement: 'top', row: el.parentElement, full: true });
    const off = () => { hideTip(); window.removeEventListener('pointerup', off, true); window.removeEventListener('pointercancel', off, true); };
    window.addEventListener('pointerup', off, true); window.addEventListener('pointercancel', off, true);
  }

  enableDnd(app, { onTap, onTapEmpty, onDrop, onDragStart, onDragEnd, onLongPress });

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
  // 懸停：記下滑鼠下的棋子（賣出／上場鍵用）
  app.addEventListener('pointerover', (e) => { const t = e.target.closest && e.target.closest('[data-tt-uid]'); ui.hoverUid = t ? Number(t.dataset.ttUid) : null; });
  app.addEventListener('pointerleave', () => { ui.hoverUid = null; });

  // ---------- 鍵盤（用 event.code，注音輸入法開著也收得到） ----------
  const target = () => unitByUid(ui.hoverUid) || (ui.sel && ui.sel.kind === 'unit' ? unitByUid(ui.sel.uid) : null);
  const NEED = '先把滑鼠停在棋子上，或先選一隻';
  function doDeploy() {
    const u = target(); if (!u) return toast(NEED);
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
    sell: () => { const u = target(); if (u) PN.sellUnit(api, u); else toast(NEED); },
    deploy: doDeploy,
    fight: () => h.go && h.go(),
    speed: () => h.cycleSpeed && h.cycleSpeed(),
    skip: () => h.skipBattle && h.skipBattle(),
    unlocks: () => PN.showUnlocks(api),
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
    if (e.repeat && (a === 'fight' || a === 'speed' || a === 'skip' || a === 'unlocks')) { e.preventDefault(); return; }
    if (e.code === 'Space' || e.key === ' ') e.preventDefault();
    ACT[a]();
  };
  document.addEventListener('keydown', onKey);

  return { destroy() { document.removeEventListener('keydown', onKey); } };
}

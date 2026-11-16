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
export const MOVE_PX = 8;
export const LONG_MS = 400;
export const NOCLEAR_SEL = 'button, a, input, select, textarea, label, summary, [data-tt-noclear], .tt-overlay, .tt-panel, .tt-fbmodal, [role=dialog], [role=tooltip], [data-tt-mount=unitpanel]';

export function enableDnd(root, handlers) {
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

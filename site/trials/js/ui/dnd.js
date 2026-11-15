// 點選＋拖曳兩用（pointer events）。SPEC 5.4。
// 標記：data-tt-tap="<desc>"（可點）、data-tt-drag="<desc>"（可拖；data-tt-mouse 表示只有滑鼠能拖，觸控只當點擊）、
//       data-tt-drop="<desc>"（可放）。desc 的意義由 layout.js 解讀，這裡只當字串傳。
// handlers: { onTap(desc, el), onDrop(fromDesc, toDesc|null, fromEl), onDragStart?(desc, el), onDragEnd?() }
const MOVE_PX = 8;

export function enableDnd(root, handlers) {
  let st = null;   // { id, el, desc, x0, y0, dragging, ghost, over, tapEl }

  const closest = (t, sel) => (t && t.closest ? t.closest(sel) : null);

  root.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    if (st) return;
    const dragEl = closest(e.target, '[data-tt-drag]');
    const tapEl = closest(e.target, '[data-tt-tap]');
    if (!dragEl && !tapEl) return;
    const canDrag = !!dragEl && !(dragEl.hasAttribute('data-tt-mouse') && e.pointerType !== 'mouse');
    st = { id: e.pointerId, el: dragEl, canDrag, desc: dragEl ? dragEl.dataset.ttDrag : null, tapEl: tapEl || dragEl, x0: e.clientX, y0: e.clientY, dragging: false, ghost: null, over: null };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });

  function overTarget(x, y) {
    const n = document.elementFromPoint(x, y);
    return closest(n, '[data-tt-drop]');
  }

  function startDrag(e) {
    st.dragging = true;
    const r = st.el.getBoundingClientRect();
    const g = st.el.cloneNode(true);
    g.removeAttribute('data-tt-drag'); g.removeAttribute('data-tt-tap'); g.removeAttribute('id');
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
      if (!st.canDrag || Math.hypot(dx, dy) < MOVE_PX) return;
      startDrag(e);
    }
    e.preventDefault();
    st.ghost.style.left = e.clientX + 'px';
    st.ghost.style.top = e.clientY + 'px';
    const t = overTarget(e.clientX, e.clientY);
    if (t !== st.over) {
      if (st.over) st.over.classList.remove('tt-over');
      st.over = t;
      if (t) t.classList.add('tt-over');
    }
  }

  function finish() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    if (st) {
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
    if (s.dragging) {
      handlers.onDragEnd && handlers.onDragEnd();
      handlers.onDrop(s.desc, target ? target.dataset.ttDrop : null, s.el);
    } else if (s.tapEl) {
      handlers.onTap(s.tapEl.dataset.ttTap || s.tapEl.dataset.ttDrag, s.tapEl);
    }
  }

  function cancel(e) {
    if (!st || e.pointerId !== st.id) return;
    const was = st.dragging;
    finish(); st = null;
    if (was) handlers.onDragEnd && handlers.onDragEnd();
  }

  // 鍵盤：Enter 觸發 tap（Space 留給開戰快捷鍵）
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = closest(e.target, '[data-tt-tap]');
    if (t && t === e.target) { e.preventDefault(); handlers.onTap(t.dataset.ttTap, t); }
  });

  // 拖曳中避免瀏覽器原生拖影像／選字
  root.addEventListener('dragstart', (e) => e.preventDefault());
  root.addEventListener('contextmenu', (e) => { if (st && st.dragging) e.preventDefault(); });
}

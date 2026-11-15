// 合併棋盤 8 列 × 7 行，odd-r（奇數 row 往右偏半格）。row 0 = 敵方後排，row 7 = 我方後排。
export const ROWS = 8, COLS = 7;
const H = 0.866;

export function inBoard(h) { return h.row >= 0 && h.row < ROWS && h.col >= 0 && h.col < COLS; }

function cube(h) {
  const x = h.col - (h.row - (h.row & 1)) / 2;
  return { x, z: h.row, y: -x - h.row };
}
export function dist(a, b) {
  const p = cube(a), q = cube(b);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

const EVEN = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]]; // E,SE,SW,W,NW,NE
const ODD = [[0, 1], [1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1]];
export function neighbors(h) {
  const d = (h.row & 1) ? ODD : EVEN;
  const out = [];
  for (let i = 0; i < 6; i++) {
    const n = { row: h.row + d[i][0], col: h.col + d[i][1] };
    if (inBoard(n)) out.push(n);
  }
  return out;
}

export function within(h, r) {
  const out = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      if (dist(h, { row, col }) <= r) out.push({ row, col });
  return out;
}

export function center(h) { return { x: h.col + 0.5 * (h.row & 1), y: h.row * H }; }

// 像素座標 -> 最近格（不限棋盤內；用 row/col 範圍外的值也可）
function nearestCell(x, y) {
  const r0 = Math.round(y / H);
  let best = null, bd = 1e9;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    const c = Math.round(x - 0.5 * (r & 1));
    const cx = c + 0.5 * (r & 1), cy = r * H;
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bd - 1e-9) { bd = d; best = { row: r, col: c }; }
  }
  return best;
}

export function line(a, b) {
  const n = dist(a, b);
  if (n === 0) return [{ row: a.row, col: a.col }];
  const ca = center(a), cb = center(b);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = 1e-6;
    out.push(nearestCell(ca.x + (cb.x - ca.x) * t + e, ca.y + (cb.y - ca.y) * t + e * 0.7));
  }
  out[0] = { row: a.row, col: a.col };
  out[n] = { row: b.row, col: b.col };
  return out;
}

export function lineThrough(a, b, len) {
  const ca = center(a), cb = center(b);
  let dx = cb.x - ca.x, dy = cb.y - ca.y;
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m === 0 || len <= 0) return [];
  dx /= m; dy /= m;
  const out = [];
  let last = a;
  for (let s = 1; s <= len * 4 + 4 && out.length < len; s++) {
    const k = s * 0.25;
    const c = nearestCell(ca.x + dx * k + 1e-6, ca.y + dy * k + 7e-7);
    if (!inBoard(c)) break;
    if (c.row === last.row && c.col === last.col) continue;
    out.push(c);
    last = c;
  }
  return out;
}

export function playerToBoard(pos) { return { row: 4 + pos[0], col: pos[1] }; }
export function enemyToBoard(pos) { return { row: 3 - pos[0], col: 6 - pos[1] }; }

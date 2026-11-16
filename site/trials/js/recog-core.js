// recog-core.js：看圖辨識棋子頭像的核心。只有運算，沒有 DOM，Web Worker 和測試共用。
// 做法：
//   1. 用本站頭像精靈圖建模板：每個頭像取中央 60%，縮成 8×8 亮度格（減平均、正規化）＋4×4 色差格。
//   2. 截圖建積分影像，多種大小的方窗以格子跳著掃；太平的窗直接略過，其餘跟全部模板比相似度。
//   3. 超過門檻的窗用貪心法去重疊（非極大值抑制），再在每個候選附近微調位置與大小，最後留下每個位置最像的 3 隻。
// 沒用到 Math.random、Date，同一張圖永遠得到同一個結果。
export const CORE = 0.6;      // 取頭像中央的比例（避開外框、星星、費用角標）
const N = 8;                  // 亮度格 N×N
const NC = 4;                 // 色差格 NC×NC
const NL = N * N, NCV = NC * NC * 2;
const NV = 16, NVV = NV * NV;   // 最後複查用的細格（16×16）
const W_L = 0.7, W_C = 0.3;   // 相似度 = 0.7 × 亮度圖樣 + 0.3 × 色彩

// ---------- 積分影像 ----------
export function buildIntegrals(data, w, h) {
  const W1 = w + 1, n = W1 * (h + 1);
  const Y = new Int32Array(n), R = new Int32Array(n), G = new Int32Array(n), B = new Int32Array(n);
  const Y2 = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let sy = 0, sr = 0, sg = 0, sb = 0, sy2 = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const yy = (77 * r + 150 * g + 29 * b) >> 8;
      sy += yy; sr += r; sg += g; sb += b; sy2 += yy * yy;
      const o = (y + 1) * W1 + x + 1, p = y * W1 + x + 1;
      Y[o] = Y[p] + sy; R[o] = R[p] + sr; G[o] = G[p] + sg; B[o] = B[p] + sb; Y2[o] = Y2[p] + sy2;
    }
  }
  return { w, h, W1, Y, R, G, B, Y2 };
}

// 整數座標的方塊總和
const sum = (I, W1, x0, y0, x1, y1) => I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
// 小數座標：對積分影像做雙線性內插（模板和微調用，比較準）
function at(I, W1, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w) x = w;
  if (y < 0) y = 0; else if (y > h) y = h;
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
  const x2 = xi < w ? xi + 1 : xi, y2 = yi < h ? yi + 1 : yi;
  const a = I[yi * W1 + xi], b = I[yi * W1 + x2], c = I[y2 * W1 + xi], d = I[y2 * W1 + x2];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const sumF = (I, W1, w, h, x0, y0, x1, y1) => at(I, W1, w, h, x1, y1) - at(I, W1, w, h, x0, y1) - at(I, W1, w, h, x1, y0) + at(I, W1, w, h, x0, y0);

const _xs = new Int32Array(N + 1), _ys = new Int32Array(N + 1);
const _raw = new Float32Array(NL), _chr = new Float32Array(NCV);

// 取窗中央 60% 的 n×n 亮度平均到 out；exact＝用小數座標
function lumRaw(S, cx, cy, size, exact, out, n = N) {
  const half = size * CORE / 2, cell = size * CORE / n, x0 = cx - half, y0 = cy - half;
  const { W1, Y, w, h } = S;
  if (exact) {
    const a = cell * cell;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      out[j * n + i] = sumF(Y, W1, w, h, x0 + i * cell, y0 + j * cell, x0 + (i + 1) * cell, y0 + (j + 1) * cell) / a;
    }
    return;
  }
  for (let k = 0; k <= N; k++) { _xs[k] = Math.round(x0 + k * cell); _ys[k] = Math.round(y0 + k * cell); }
  for (let j = 0; j < N; j++) {
    const ya = _ys[j], yb = _ys[j + 1] > ya ? _ys[j + 1] : ya + 1;
    for (let i = 0; i < N; i++) {
      const xa = _xs[i], xb = _xs[i + 1] > xa ? _xs[i + 1] : xa + 1;
      out[j * N + i] = sum(Y, W1, xa, ya, xb, yb) / ((xb - xa) * (yb - ya));
    }
  }
}
// 中央 60% 的 NC×NC 色差（R−G、B−(R+G)/2），不減平均
function chrRaw(S, cx, cy, size, exact, out) {
  const half = size * CORE / 2, cell = size * CORE / NC, x0 = cx - half, y0 = cy - half;
  const { W1, R, G, B, w, h } = S;
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    let r, g, b;
    if (exact) {
      const xa = x0 + i * cell, ya = y0 + j * cell, xb = xa + cell, yb = ya + cell, a = cell * cell;
      r = sumF(R, W1, w, h, xa, ya, xb, yb) / a; g = sumF(G, W1, w, h, xa, ya, xb, yb) / a; b = sumF(B, W1, w, h, xa, ya, xb, yb) / a;
    } else {
      const xa = Math.round(x0 + i * cell), ya = Math.round(y0 + j * cell);
      let xb = Math.round(x0 + (i + 1) * cell), yb = Math.round(y0 + (j + 1) * cell);
      if (xb <= xa) xb = xa + 1; if (yb <= ya) yb = ya + 1;
      const a = (xb - xa) * (yb - ya);
      r = sum(R, W1, xa, ya, xb, yb) / a; g = sum(G, W1, xa, ya, xb, yb) / a; b = sum(B, W1, xa, ya, xb, yb) / a;
    }
    const o = (j * NC + i) * 2;
    out[o] = r - g; out[o + 1] = b - (r + g) / 2;
  }
}
// 減平均、除以長度；回傳長度（太小代表整塊是平的）
function center(v, n) {
  let m = 0; for (let i = 0; i < n; i++) m += v[i]; m /= n;
  let s = 0; for (let i = 0; i < n; i++) { v[i] -= m; s += v[i] * v[i]; }
  const len = Math.sqrt(s);
  if (len > 1e-6) for (let i = 0; i < n; i++) v[i] /= len;
  return len;
}
function unit(v, n) {
  let s = 0; for (let i = 0; i < n; i++) s += v[i] * v[i];
  const len = Math.sqrt(s);
  if (len > 1e-6) for (let i = 0; i < n; i++) v[i] /= len;
  return len;
}

// ---------- 模板 ----------
// sprite：{data, w, h}（RGBA）；map：{key: 格序號}
export function buildTemplates(sprite, cols, rows, map) {
  const S = buildIntegrals(sprite.data, sprite.w, sprite.h);
  const cw = sprite.w / cols, ch = sprite.h / rows;
  const keys = Object.keys(map);
  const n = keys.length;
  const L = new Float32Array(n * NL), C = new Float32Array(n * NCV), L4 = new Float32Array(n * 16), LV = new Float32Array(n * NVV);
  const lv = new Float32Array(NL), cv = new Float32Array(NCV), l4 = new Float32Array(16), vv = new Float32Array(NVV);
  keys.forEach((k, t) => {
    const idx = map[k], cx = (idx % cols + 0.5) * cw, cy = (Math.floor(idx / cols) + 0.5) * ch;
    lumRaw(S, cx, cy, cw, true, lv);
    pool4(lv, l4); center(l4, 16);
    center(lv, NL);
    chrRaw(S, cx, cy, cw, true, cv); unit(cv, NCV);
    lumRaw(S, cx, cy, cw, true, vv, NV); center(vv, NVV);
    L.set(lv, t * NL); C.set(cv, t * NCV); L4.set(l4, t * 16); LV.set(vv, t * NVV);
  });
  return { keys, n, L, C, L4, LV };
}
function pool4(src, out) {
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const a = (2 * j) * N + 2 * i;
    out[j * 4 + i] = (src[a] + src[a + 1] + src[a + N] + src[a + N + 1]) / 4;
  }
}

// ---------- 比對 ----------
const _l4 = new Float32Array(16);
const _lv = new Float32Array(NL), _cv = new Float32Array(NCV), _vv = new Float32Array(NVV);
const _sc = new Float32Array(512), _l4s = new Float32Array(512);
const _top = new Int32Array(16);

// 某個窗跟模板 t 的（8×8 亮度＋色彩）相似度；要先呼叫過 prep 把窗的特徵放進 _lv／_cv
let _useC = false;
function prep(S, cx, cy, size, exact) {
  lumRaw(S, cx, cy, size, exact, _lv);
  if (center(_lv, NL) < 1e-3) return false;
  chrRaw(S, cx, cy, size, exact, _cv);
  _useC = unit(_cv, NCV) > 0.02;
  return true;
}
function simOf(T, t) {
  let a = 0, o = t * NL; const { L, C } = T;
  for (let i = 0; i < NL; i++) a += _lv[i] * L[o + i];
  let c = 0;
  if (_useC) { o = t * NCV; for (let i = 0; i < NCV; i++) c += _cv[i] * C[o + i]; }
  return W_L * a + W_C * c;
}
// 16×16 細格的亮度相關係數（複查用，專門打掉「只有大概像」的假陽性）
function fineOf(S, T, cx, cy, size, t) {
  lumRaw(S, cx, cy, size, true, _vv, NV);
  if (center(_vv, NVV) < 1e-3) return 0;
  let a = 0; const o = t * NVV, LV = T.LV;
  for (let i = 0; i < NVV; i++) a += _vv[i] * LV[o + i];
  return a;
}
// 最後分數：粗格相似度與細格相關係數各半
const FINE_MIX = 0.5;

// 掃描用：先用 4×4 粗篩選出最像的幾個模板，再只對它們算完整相似度。
// ex／ey：這個窗的格線座標（已四捨五入、長度 N+1），同一排的窗共用，不用每次重算
const best = { score: 0 };
const QK = 8;   // 掃描時每個窗最多拿幾個模板算完整相似度
function quickBest(S, T, ex, ey, cx, cy, size, thr4) {
  const { W1, Y } = S;
  // 先只算 4×4（16 塊）
  for (let j = 0; j < 4; j++) {
    const ya = ey[2 * j], yb = ey[2 * j + 2];
    for (let i = 0; i < 4; i++) {
      const xa = ex[2 * i], xb = ex[2 * i + 2];
      _l4[j * 4 + i] = sum(Y, W1, xa, ya, xb, yb) / ((xb - xa) * (yb - ya));
    }
  }
  if (center(_l4, 16) < 1e-3) return -1;
  const { n, L4 } = T;
  let tv = -2;
  for (let t = 0; t < n; t++) {
    let a = 0; const o = t * 16;
    for (let i = 0; i < 16; i++) a += _l4[i] * L4[o + i];
    _l4s[t] = a;
    if (a > tv) tv = a;
  }
  if (tv < thr4) return -1;
  // 只留 4×4 分數最高的 QK 個去算完整相似度：找第 QK 高的分數當門檻
  let cut = tv - 0.08;
  { let cnt = 0; for (let t = 0; t < n; t++) if (_l4s[t] >= cut) cnt++;
    while (cnt > QK && cut < tv) { cut += 0.01; cnt = 0; for (let t = 0; t < n; t++) if (_l4s[t] >= cut) cnt++; } }
  for (let j = 0; j < N; j++) {
    const ya = ey[j], yb = ey[j + 1];
    for (let i = 0; i < N; i++) {
      const xa = ex[i], xb = ex[i + 1];
      _raw[j * N + i] = sum(Y, W1, xa, ya, xb, yb) / ((xb - xa) * (yb - ya));
    }
  }
  center(_raw, NL);
  chrRaw(S, cx, cy, size, false, _chr);
  const useC = unit(_chr, NCV) > 0.02;
  const { L, C } = T;
  let bt = -1, bs = -2;
  // 粗篩分數離最高不到 0.08 的模板才算完整相似度
  for (let t = 0; t < n; t++) {
    if (_l4s[t] < cut) continue;
    let a = 0; const o = t * NL;
    for (let i = 0; i < NL; i++) a += _raw[i] * L[o + i];
    let c = 0;
    if (useC) { const p = t * NCV; for (let i = 0; i < NCV; i++) c += _chr[i] * C[p + i]; }
    const sc = W_L * a + W_C * c;
    if (sc > bs) { bs = sc; bt = t; }
  }
  best.score = bs;
  return bt;
}

const iou = (a, b) => {
  const ax0 = a.x - a.s / 2, ay0 = a.y - a.s / 2, bx0 = b.x - b.s / 2, by0 = b.y - b.s / 2;
  const w = Math.min(ax0 + a.s, bx0 + b.s) - Math.max(ax0, bx0), h = Math.min(ay0 + a.s, by0 + b.s) - Math.max(ay0, by0);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h;
  return i / (a.s * a.s + b.s * b.s - i);
};
// 交集佔較小那個的比例（一個框整個落在另一個框裡就接近 1）
const inside = (a, b) => {
  const ax0 = a.x - a.s / 2, ay0 = a.y - a.s / 2, bx0 = b.x - b.s / 2, by0 = b.y - b.s / 2;
  const w = Math.min(ax0 + a.s, bx0 + b.s) - Math.max(ax0, bx0), h = Math.min(ay0 + a.s, by0 + b.s) - Math.max(ay0, by0);
  if (w <= 0 || h <= 0) return 0;
  const m = Math.min(a.s * a.s, b.s * b.s);
  return w * h / m;
};

export const DEFAULTS = {
  minSize: 30,        // 頭像最小邊長（像素）
  maxSizeFrac: 0.5,   // 最大邊長＝短邊的這個比例
  ratio: 1.13,        // 相鄰大小的倍率
  stride: 0.125,       // 掃描步長＝窗邊長 × 這個數
  flatStd: 10,        // 窗內亮度標準差低於這個就當平的
  thr4: 0.7,          // 4×4 粗篩門檻
  thr1: 0.6,          // 掃描階段留下的相似度門檻
  maxPeaks: 700,      // 進微調的候選上限
  thrQuick: 0.74,     // 先看一眼，附近最像的還低於這個就放棄
  thrFinal: 0.84,     // 微調、複查後最低分數
  thrSmall: 0.78,     // 頭像小於 48 像素時的最低分數（小圖本來就比較糊）
  sure: 0.9,          // 這個分數以上算「很確定」，預設打勾
  topK: 3,
};

// img：{data, w, h}；T：buildTemplates 的結果；onProgress(0..1)
export function recognize(img, T, opts = {}, onProgress = () => {}) {
  const o = { ...DEFAULTS, ...opts };
  const S = buildIntegrals(img.data, img.w, img.h);
  const { w, h } = S;
  const sizes = [];
  const maxS = Math.min(w, h) * o.maxSizeFrac;
  for (let s = o.minSize; s <= maxS; s *= o.ratio) sizes.push(s);
  const peaks = [];
  const flatVar = o.flatStd * o.flatStd;
  // 掃描一個大小：stride＝步長（窗邊長的倍數）。回傳這個大小有幾個窗分數夠高（用來猜圖裡頭像大概多大）
  function scanLevel(s, stride) {
    const half = s * CORE / 2;
    const step = Math.max(2, Math.round(s * stride));
    const lo = Math.ceil(half) + 1;
    const cell = s * CORE / N;
    const nx = Math.floor((w - lo - lo) / step) + 1;
    let strong = 0;
    if (nx <= 0) return 0;
    const exs = new Int32Array(nx * (N + 1));
    for (let q = 0; q < nx; q++) for (let k = 0; k <= N; k++) {
      let v = Math.round(lo + q * step - half + k * cell);
      if (k > 0 && v <= exs[q * (N + 1) + k - 1]) v = exs[q * (N + 1) + k - 1] + 1;
      exs[q * (N + 1) + k] = v;
    }
    const ey = new Int32Array(N + 1);
    for (let cy = lo; cy <= h - lo; cy += step) {
      for (let k = 0; k <= N; k++) { let v = Math.round(cy - half + k * cell); if (k > 0 && v <= ey[k - 1]) v = ey[k - 1] + 1; ey[k] = v; }
      const ya = ey[0], yb = ey[N];
      for (let q = 0; q < nx; q++) {
        const cx = lo + q * step;
        const ex = exs.subarray(q * (N + 1), (q + 1) * (N + 1));
        const xa = ex[0], xb = ex[N];
        const a = (xb - xa) * (yb - ya);
        const m = sum(S.Y, S.W1, xa, ya, xb, yb) / a;
        const v = sum(S.Y2, S.W1, xa, ya, xb, yb) / a - m * m;
        if (v < flatVar) continue;
        const t = quickBest(S, T, ex, ey, cx, cy, s, o.thr4);
        if (t < 0 || best.score < o.thr1) continue;
        if (best.score >= o.thrLevel) strong++;
        peaks.push({ x: cx, y: cy, s, score: best.score, t });
      }
    }
    return strong;
  }
  // 第一輪：每個大小都用大步長粗掃（約 1/4 的窗），看哪幾個大小有明顯的頭像；第二輪只對那幾個大小（和左右鄰居）用細步長掃。
  // 整張圖都沒有明顯的大小（頭像很少、很糊）就退回每個大小都細掃，不漏。
  const strong = sizes.map((s, i) => { const c = scanLevel(s, o.strideCoarse); onProgress(0.2 * (i + 1) / sizes.length); return c; });
  const top = Math.max(0, ...strong);
  const pick = new Set();
  if (top >= 3) strong.forEach((c, i) => { if (c >= Math.max(3, top * 0.2)) { pick.add(i); if (i > 0) pick.add(i - 1); if (i + 1 < sizes.length) pick.add(i + 1); } });
  else sizes.forEach((_, i) => pick.add(i));
  let doneN = 0;
  for (const i of [...pick].sort((a, b) => a - b)) { scanLevel(sizes[i], o.stride); onProgress(0.2 + 0.3 * (++doneN) / pick.size); }
  if (o.onPeaks) o.onPeaks(peaks);
  // 掃描階段去重疊
  peaks.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const p of peaks) {
    if (kept.length >= o.maxPeaks) break;
    let dup = false;
    for (const k of kept) if (iou(p, k) > 0.3) { dup = true; break; }
    if (!dup) kept.push(p);
  }
  // 先便宜地看一眼：每個候選附近 3×3 個位置（整數座標）各比一次，還不像就放棄；剩下的再去一次重疊
  const out = [];
  const ranked = new Int32Array(T.n);
  const sc = new Float32Array(T.n);
  const near = [];
  for (let pi = 0; pi < kept.length; pi++) {
    const p = kept[pi];
    if (!prep(S, p.x, p.y, p.s, true)) continue;
    for (let t = 0; t < T.n; t++) { sc[t] = simOf(T, t); ranked[t] = t; }
    const cand = Array.from(ranked).sort((a, b) => sc[b] - sc[a]).slice(0, 6);
    let cur = { x: p.x, y: p.y, s: p.s, score: -2, cand };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = p.x + dx * 0.07 * p.s, y = p.y + dy * 0.07 * p.s;
      if (!prep(S, x, y, p.s, false)) continue;
      for (const t of cand) { const v = simOf(T, t); if (v > cur.score) cur = { x, y, s: p.s, score: v, cand }; }
    }
    if (cur.score >= o.thrQuick) near.push(cur);
    onProgress(0.5 + 0.2 * (pi + 1) / kept.length);
  }
  near.sort((a, b) => b.score - a.score);
  const todo = [];
  for (const p of near) if (!todo.some(k => iou(p, k) > 0.3)) todo.push(p);
  for (let pi = 0; pi < todo.length; pi++) {
    let cur = todo[pi];
    const cand = cur.cand;
    for (const [pos, scs, rad] of [[0.08, [0.88, 0.94, 1, 1.06, 1.12], 1], [0.04, [0.96, 1, 1.04], 1], [0.02, [0.98, 1, 1.02], 1]]) {
      const base = { ...cur };
      for (const f of scs) {
        const s = base.s * f, half = s * CORE / 2 + 1;
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const x = base.x + dx * pos * s / 2, y = base.y + dy * pos * s / 2;
          if (x < half || y < half || x > w - half || y > h - half) continue;
          if (!prep(S, x, y, s, true)) continue;
          for (const t of cand) { const v = simOf(T, t); if (v > cur.score) cur = { x, y, s, score: v }; }
        }
      }
    }
    // 對全部模板排名、細格複查
    if (!prep(S, cur.x, cur.y, cur.s, true)) continue;
    for (let t = 0; t < T.n; t++) sc[t] = simOf(T, t);
    const top = Array.from(ranked).sort((a, b) => sc[b] - sc[a]).slice(0, Math.max(o.topK, 6));
    const fin = top.map(t => ({ t, v: FINE_MIX * sc[t] + (1 - FINE_MIX) * fineOf(S, T, cur.x, cur.y, cur.s, t) })).sort((a, b) => b.v - a.v);
    onProgress(0.7 + 0.3 * (pi + 1) / todo.length);
    if (fin[0].v < (cur.s < 48 ? o.thrSmall : o.thrFinal)) continue;
    out.push({ x: cur.x, y: cur.y, s: cur.s, score: fin[0].v, cands: fin.slice(0, o.topK).map(f => ({ key: T.keys[f.t], score: f.v })) });
  }
  out.sort((a, b) => b.score - a.score);
  const fin = [];
  for (const p of out) { if (!fin.some(k => iou(p, k) > 0.3 || inside(p, k) > 0.5)) fin.push(p); }
  // 同一張圖裡頭像大小差不多：很確定的頭像有 3 個以上時，大小差太多的雜訊（文字、裝備、背景花紋）直接丟掉
  let keep = fin.slice();
  const sureSizes = fin.filter(p => p.score >= 0.93).map(p => p.s);
  if (sureSizes.length >= 3) {
    const lo = Math.min(...sureSizes) * 0.7, hi = Math.max(...sureSizes) * 1.4;
    keep = fin.filter(p => p.score >= 0.93 || (p.s >= lo && p.s <= hi));
  }
  fin.length = 0; fin.push(...keep);
  // 一個很確定的都沒有：只有「一堆大小一致、分數不差」的才算頭像（例如整頁縮得很小的陣容圖），其他一律當作沒找到，不亂猜
  if (!fin.some(p => p.score >= o.sure)) {
    const c = fin.filter(p => p.score >= 0.82).sort((a, b) => a.s - b.s);
    let bestG = [];
    for (let i = 0; i < c.length; i++) { const g = c.filter(p => p.s >= c[i].s && p.s <= c[i].s * 1.08); if (g.length > bestG.length) bestG = g; }
    fin.length = 0;
    if (bestG.length >= 8) fin.push(...bestG);
  }
  // 讀圖順序：先上到下（同一排以頭像大小的一半內算同排），再左到右
  fin.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.s, b.s) * 0.5 ? a.y - b.y : a.x - b.x));
  onProgress(1);
  return fin.map(p => ({ x: p.x, y: p.y, size: p.s, score: p.score, sure: p.score >= o.sure, cands: p.cands }));
}

// 星級圖示（照官方）：1 星銅、2 星銀、3 星金，數量就是星級（1～3 顆）。全站共用：棋盤、板凳、戰鬥、面板、商店卡、結算。
// 用 SVG 畫，不靠字型，手機上大小顏色都一致。大小由外層的 --ss 決定（預設 12px）。
const NS = 'http://www.w3.org/2000/svg';
const STAR_D = 'M12 1.6l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.600 5.600 21.200 7 14.100 1.700 9.100l7.200-.9z';
export const STAR_NAME = { 1: '銅', 2: '銀', 3: '金' };

// <span class="tt-stars-ic tt-st2" role="img" aria-label="2 星">…</span>
export function starsEl(n, { label = true } = {}) {
  const k = Math.max(1, Math.min(3, n || 1));
  const w = document.createElement('span');
  w.className = 'tt-stars-ic tt-st' + k;
  if (label) { w.setAttribute('role', 'img'); w.setAttribute('aria-label', k + ' 星'); } else w.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < k; i++) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', STAR_D);
    s.append(p); w.append(s);
  }
  return w;
}

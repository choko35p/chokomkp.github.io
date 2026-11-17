// 戰鬥畫面特效的設定：畫面震動（開／關）、特效品質（高／低）。存在 localStorage，頁首「音效」面板旁有開關。
// 預設：震動開（幅度小）、品質高；手機寬（≤600px）預設低。prefers-reduced-motion 時震動、粒子、拖尾一律關。
const K_SHAKE = 'trials19.fxShake', K_Q = 'trials19.fxQuality';
const subs = new Set();
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
const mem = {};
const get = (k) => { const s = ls(); try { const v = s ? s.getItem(k) : null; return v != null ? v : (k in mem ? mem[k] : null); } catch (_) { return mem[k] ?? null; } };
const put = (k, v) => { mem[k] = v; const s = ls(); try { if (s) s.setItem(k, v); } catch (_) { /* 無痕模式：只在這次有效 */ } };

export const isPhone = () => typeof innerWidth === 'number' && innerWidth <= 600;
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function getShake() { const v = get(K_SHAKE); return v == null ? true : v === '1'; }
export function getQuality() { const v = get(K_Q); return v === 'high' || v === 'low' ? v : (isPhone() ? 'low' : 'high'); }
export function setShake(on) { put(K_SHAKE, on ? '1' : '0'); subs.forEach((f) => f()); }
export function setQuality(q) { put(K_Q, q === 'low' ? 'low' : 'high'); subs.forEach((f) => f()); }
export function onFxSettings(f) { subs.add(f); return () => subs.delete(f); }

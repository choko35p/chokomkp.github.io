// ILLBEATS 混音器：純函式（決定性，不用亂數、不讀時間）。引擎（stats.js）、遊戲狀態（game.js）、介面（ui/mixer.js）共用。
// 四條推桿的順序固定：ad 攻擊、ap 法強、hp 生命、gold 擊殺金幣機率（跟官方混音器由左到右一樣）。
// 狀態：state.mixer = { db: [ad, ap, hp, gold]（整數分貝）, last: [通道 key…]（最近調過的排最後）}。
// 每 1 分貝換多少、各階上限、隊友拿幾成，都寫在 traits.json 的 ILLBEATS（special id 'mixer'）；這裡只留退回預設值。

export const CH = ['ad', 'ap', 'hp', 'gold'];
export const CH_ZH = { ad: '攻擊', ap: '法強', hp: '生命', gold: '金幣' };

// 退回預設：官方每階分貝 10/14/18、隊友拿 50%、4 階混音強 50% 是原文；每分貝數值是從官方混音器截圖反推（推測）。
const DEF = {
  caps: [10, 14, 18], boost: [1, 1, 1.5], teamShare: 0.5,
  per: { ad: 0.0216, ap: 2, hp: 0.0176, gold: 0.02 },
};

// 預設組合（官方混音器 ATTACK／MAGIC PRESETS 各兩格；圖示是「攻擊＋金幣」「法強＋生命」，實際比例官方沒公布，這裡是推測）
export const PRESETS = [
  { id: 'atk1', group: 'attack', zh: '攻擊＋金幣', ratio: [['ad', 2], ['gold', 1]] },
  { id: 'atk2', group: 'attack', zh: '重攻擊', ratio: [['ad', 5], ['gold', 1]] },
  { id: 'mag1', group: 'magic', zh: '法強＋生命', ratio: [['ap', 2], ['hp', 1]] },
  { id: 'mag2', group: 'magic', zh: '重法強', ratio: [['ap', 5], ['hp', 1]] },
];

export function mixerEffect(DATA) {
  const t = DATA && DATA.traits && DATA.traits.byKey && DATA.traits.byKey.ILLBEATS;
  if (!t) return null;
  for (const e of [].concat(t.always || [], ...(t.tiers || []))) if (e && e.type === 'special' && e.id === 'mixer') return e;
  return null;
}

export function mixerParams(DATA) {
  const e = mixerEffect(DATA) || {};
  return {
    caps: Array.isArray(e.caps) ? e.caps : DEF.caps,
    boost: Array.isArray(e.boost) ? e.boost : DEF.boost,
    teamShare: e.teamShare != null ? e.teamShare : DEF.teamShare,
    per: { ...DEF.per, ...(e.per || {}) },
  };
}

export const mixerCap = (P, tier) => (tier > 0 ? P.caps[Math.min(tier, P.caps.length) - 1] : 0);
export const mixerBoost = (P, tier) => (tier > 0 ? P.boost[Math.min(tier, P.boost.length) - 1] : 1);
// 成員每 1 分貝拿到的數值（已含 4 階強化）：ad／hp／gold 是小數比例，ap 是點數
export const mixerPer = (P, tier, ch) => P.per[ch] * mixerBoost(P, tier);

export const emptyMix = () => ({ db: [0, 0, 0, 0], last: [] });
export const sumDb = (db) => db.reduce((a, b) => a + b, 0);

// 沒人調過時用的自動分法（敵方、機器人、舊存檔搬進來）：攻擊、法強、生命平分，多的 1～2 分貝給生命，金幣不放
export function defaultMix(cap) {
  const base = Math.floor(cap / 3), rest = cap - base * 3;
  const db = [base, base, base + rest, 0];
  return { db, last: ['ad', 'ap', 'hp'] };
}

// 多出來的分貝從「最後調的那條」扣回；那條扣完還多，再扣前一條調的
export function fitMix(m, cap) {
  m.db = CH.map((_, i) => Math.max(0, Math.floor(Number(m.db && m.db[i]) || 0)));
  m.last = (Array.isArray(m.last) ? m.last : []).filter((k) => CH.includes(k));
  let over = sumDb(m.db) - cap;
  if (over <= 0) return m;
  const order = m.last.slice().reverse().concat(CH.filter((k) => !m.last.includes(k)).reverse());
  for (const k of order) {
    if (over <= 0) break;
    const i = CH.indexOf(k), cut = Math.min(m.db[i], over);
    m.db[i] -= cut; over -= cut;
  }
  return m;
}

const touch = (m, ch) => { m.last = m.last.filter((k) => k !== ch); m.last.push(ch); };

// 把某條推到 v 分貝：最多推到「這條現在的值＋還沒用的分貝」。回傳實際值
export function setChannel(m, ch, v, cap) {
  const i = CH.indexOf(ch);
  if (i < 0) return null;
  const others = sumDb(m.db) - m.db[i];
  const nv = Math.max(0, Math.min(Math.round(v), cap - others));
  if (nv !== m.db[i]) { m.db[i] = nv; touch(m, ch); }
  return nv;
}

// 套預設：按比例把 cap 分給兩條（最大餘數法，總和剛好 = cap）
export function presetMix(id, cap) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return null;
  const tot = p.ratio.reduce((a, [, w]) => a + w, 0);
  const raw = p.ratio.map(([k, w]) => [k, (cap * w) / tot]);
  const db = [0, 0, 0, 0];
  let used = 0;
  for (const [k, x] of raw) { db[CH.indexOf(k)] = Math.floor(x); used += Math.floor(x); }
  const fr = raw.map(([k, x]) => [k, x - Math.floor(x)]).sort((a, b) => b[1] - a[1] || CH.indexOf(a[0]) - CH.indexOf(b[0]));
  for (let i = 0; used < cap; i++, used++) db[CH.indexOf(fr[i % fr.length][0])] += 1;
  return { db, last: p.ratio.map(([k]) => k) };
}

// 一組分貝換成成員的數值：{ad: 比例, ap: 點數, hp: 比例, gold: 機率}
export function mixerValues(P, tier, db) {
  const o = {};
  CH.forEach((ch, i) => { o[ch] = db[i] * mixerPer(P, tier, ch); });
  return o;
}

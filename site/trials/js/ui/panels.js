// 面板（SPEC 5.5／5.6／5.8）：羈絆、棋子、圖鑑、增幅三選一、獎勵、結算、結束、說明、頭目登場。
// 注意：本檔頂層不可使用 traitbar.js 的匯出（兩檔互相 import，只在函式執行時用）。
import { el, fmt, avatar, kindOf, traitZh, unitZh, isStars, ensureStyle, traitTags, boardUnits, playerTraits } from './traitbar.js';
import { countTraits, buildTeam } from '../stats.js';
import { sellValue } from '../shop.js';
import * as TB from './traitbar.js';
import * as AU from '../audio.js';
import { sfx } from '../audio.js';
import { SPECIAL_INFO } from './board.js';
import { showTip, hideTip, richText, abilityIcon, augIconNode } from './tooltip.js';

// 羈絆圖示唯一入口是 traitbar.traitIcon（包 B）。還沒有時回 null，畫面只少圖示。
const tIcon = (DATA, key, size = 18) => { try { return TB.traitIcon ? TB.traitIcon(DATA, key, size) : null; } catch (_) { return null; } };
let curApi = null;
export function bindApi(api) { if (api) curApi = api; }
export const playerTraitsOf = (api) => playerTraits(api);

export const PANEL_CSS = ''; // 整合：樣式已搬進 trials.css

// ---------- 面板管理（堆疊，Esc 關最上層，focus 還原） ----------
const stack = [];
function openPanel({ title, titleNode, body, footer, cls = '', modal = false, onClose, label }) {
  ensureStyle();
  const opener = document.activeElement;
  const ov = el('div', { class: 'tt-overlay' });
  const id = 'tt-pt-' + Math.random().toString(36).slice(2, 7);
  const panel = el('div', { class: 'tt-panel ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id });
  const h = el('h2', { id }, titleNode || title);
  const head = el('div', { class: 'tt-ph' });
  if (stack.length) head.append(el('button', { type: 'button', class: 'tt-x', 'aria-label': '返回上一個面板', onclick: () => closeTop() }, '←'));
  head.append(h);
  if (!modal) head.append(el('button', { type: 'button', class: 'tt-x', 'aria-label': '關閉', onclick: () => closeAll() }, '✕'));
  const bodyEl = el('div', { class: 'tt-pb' }, body);
  panel.append(head, bodyEl);
  if (footer) panel.append(el('div', { class: 'tt-pf' }, footer));
  ov.append(panel);
  // 點彈窗外面的暗色背景＝關閉（必須選擇的彈窗不行）。按下和放開都要在背景上，在彈窗裡拖出來不會誤關。
  if (!modal) {
    let downOnOv = false;
    ov.addEventListener('pointerdown', (e) => { downOnOv = e.target === ov; });
    ov.addEventListener('click', (e) => { if (e.target === ov && downOnOv) closeAll(); downOnOv = false; });
  }
  const prev = stack[stack.length - 1]; if (prev) { prev.ov.hidden = true; }
  const rec = { ov, panel, opener, modal, onClose };
  stack.push(rec); document.body.append(ov);
  syncHistory();
  const first = panel.querySelector('[data-autofocus]') || panel.querySelector('.tt-opt,.tt-btn,button') || panel;
  if (first === panel) panel.tabIndex = -1;
  first.focus({ preventScroll: true });
  return rec;
}
// Android 返回鍵：有可關的彈窗時，開第一個就推一筆 history，返回鍵（popstate）關最上層；全部關掉就把那筆收回。
// 必須選擇的彈窗（modal）不推也不收，返回鍵不會關它。
let histPushed = false, histIgnore = 0;
const hasClosable = () => stack.some(r => !r.modal);
function syncHistory() {
  try {
    if (hasClosable() && !histPushed) { history.pushState({ ttPanel: 1 }, ''); histPushed = true; }
    else if (!hasClosable() && histPushed) { histPushed = false; histIgnore++; history.back(); }
  } catch (_) { histPushed = false; }
}
window.addEventListener('popstate', () => {
  if (histIgnore > 0) { histIgnore--; return; }
  if (!histPushed) return;
  histPushed = false;                       // 瀏覽器已經把那筆收掉了
  const top = stack[stack.length - 1];
  if (top && !top.modal) closeTop();
  syncHistory();                            // 還有可關的就再推一筆，下一次返回鍵接著關
});
function closeTop() {
  const r = stack.pop(); if (!r) return;
  r.ov.remove(); r.onClose?.();
  syncHistory();
  const prev = stack[stack.length - 1];
  if (prev) { prev.ov.hidden = false; (prev.panel.querySelector('button') || prev.panel).focus?.(); }
  else if (r.opener && document.contains(r.opener)) r.opener.focus?.({ preventScroll: true });
}
export function closeAll() { while (stack.length && !stack[stack.length - 1].modal) closeTop(); }
export function closePanels() { while (stack.length) closeTop(); }
export const hasPanel = () => stack.length > 0;
document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1]; if (!top) return;
  if (e.key === 'Escape' && !top.modal) { e.preventDefault(); e.stopPropagation(); closeTop(); }
  if (e.key === 'Tab') {
    const f = [...top.panel.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
  }
}, true);

const badge = (t, cls = '') => el('span', { class: 'tt-badge ' + cls }, t);
const KIND_ZH = { origin: '起源', class: '職業', unique: '獨特' };
const kindBadge = (DATA, key) => el('span', { class: 'tt-badge tt-kind', 'data-kind': kindOf(DATA, key) }, KIND_ZH[kindOf(DATA, key)] || '');
const stars = (n) => '★'.repeat(n || 1);

function whereIs(api, key) {
  const { state } = api;
  return {
    board: (state.board || []).some(u => u && u.key === key),
    bench: (state.bench || []).some(u => u && u.key === key),
    shop: (state.shop || []).some(s => s && s.key === key),
  };
}

// ---------- 羈絆面板 ----------
// opts: {side:'player'|'enemy', traits: countTraits 結果（敵方或指定時用）}
export function showTraitPanel(key, api, opts = {}) {
  const { DATA, state } = api; const T = DATA.traits.byKey[key]; if (!T) return;
  const side = opts.side || 'player';
  const traits = opts.traits || (side === 'player' ? playerTraits(api) : []);
  const cur = traits.find(t => t.key === key) || { count: 0, tier: 0 };
  const star = isStars(DATA, key); const unit = star ? '星' : '隻';
  const bps = T.breakpoints || [];
  const body = [];
  body.push(el('p', { class: 'tt-desc' }, T.desc || ''));
  body.push(el('p', { class: 'tt-desc' }, el('b', {}, side === 'enemy' ? '敵方目前：' : '你目前：'),
    cur.count ? `${cur.count} ${unit}` + (cur.tier ? `，第 ${cur.tier} 階啟動` : '，還沒啟動') : '場上沒有'));
  const ul = el('ul', { class: 'tt-tiers', style: `--tt-kind:var(--tt-${kindOf(DATA, key)},var(--accent))` });
  bps.forEach((b, i) => {
    ul.append(el('li', { class: (cur.tier === i + 1 ? 'tt-cur ' : '') + (cur.count >= b ? 'tt-reached' : '') },
      el('b', {}, b), el('span', {}, T.levelsText?.[i] ?? '', cur.tier === i + 1 ? [' ', badge('目前')] : null)));
  });
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, `各階效果（${star ? '星數總和' : '人數'}）`), ul));
  if (T.simplified || T.guess) {
    const box = el('div', { class: 'tt-notice' });
    box.append(el('h3', { class: 'tt-h', style: 'margin:0 0 4px' }, '本頁做法'));
    if (T.simplified) box.append(el('p', { style: 'margin:0 0 4px' }, badge('簡化', 'tt-simp'), ' ', T.simplified));
    if (T.guess) box.append(el('p', { style: 'margin:0' }, badge('推測數值', 'tt-guess'), ' 推測數值，PBE 後更新。'));
    body.push(box);
  }
  if (T.counter && side === 'player') {
    const v = state.persist?.[T.counter.persistKey] ?? 0;
    const next = (T.counter.thresholds || []).find(x => x > v);
    body.push(el('div', { class: 'tt-counter' }, `${T.counter.label || '累計'} `, el('b', {}, fmt(v)),
      next != null ? ['／下一獎勵 ', el('b', {}, next)] : '（獎勵已全部拿完）'));
  }
  // 成員
  const mem = (T.members || []).map(k => DATA.units.byKey[k]).filter(Boolean).sort((a, b) => a.cost - b.cost || (a.key < b.key ? -1 : 1));
  const ml = el('ul', { class: 'tt-members' });
  for (const u of mem) {
    const w = side === 'player' ? whereIs(api, u.key) : {};
    const marks = [];
    if (w.board) marks.push(el('span', { class: 'tt-mark tt-in' }, '✓ 場上'));
    if (w.bench) marks.push(el('span', { class: 'tt-mark' }, '板凳'));
    if (w.shop) marks.push(el('span', { class: 'tt-mark tt-shop' }, '商店有'));
    const locked = isLocked(api, u.key);
    const b = el('button', { type: 'button', class: 'tt-member' + (locked ? ' tt-locked' : ''), 'data-tt-tip': locked ? 'unlock:' + u.key : null,
      'aria-label': `${u.zh}，${u.cost} 費` + (locked ? '，還沒解鎖' : '') + (w.board ? '，已在場上' : '') + (w.bench ? '，在板凳' : '') + (w.shop ? '，商店有' : '') },
      lockedAvatar(DATA, u.key, 40, locked), el('span', {}, u.zh, el('small', {}, `${u.cost} 費`), marks.length ? el('small', {}, marks) : null));
    b.addEventListener('click', () => showUnitPanel(u.key, api));
    ml.append(el('li', {}, b));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, `成員（${mem.length}）`), ml));
  const titleNode = [tIcon(DATA, key, 28), traitZh(DATA, key), ' ', kindBadge(DATA, key), side === 'enemy' ? badge('敵方') : null];
  return openPanel({ titleNode, body, cls: 'tt-trait-panel' });
}

// ---------- 棋子面板 ----------
const STAT_ROWS = [
  ['hp', '生命', ['hp', 'hpPct']], ['ad', '攻擊', ['ad', 'adPct']], ['as', '攻速', ['as', 'asPct']],
  ['armor', '護甲', ['armor']], ['mr', '魔抗', ['mr']], ['range', '射程', ['range']],
];
function srcLabel(DATA, src) {
  const [t, k] = String(src).split(':');
  if (t === 'trait') return traitZh(DATA, k);
  if (t === 'item') return DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k;
  if (t === 'aug') return DATA.augments?.byKey?.[k]?.zh || k;
  return String(src);
}
export function combatantFor(api, unit) {
  const { state, DATA } = api;
  const ctx = { level: state.level, round: state.round, augments: state.augments || [], persist: state.persist || {} };
  const board = boardUnits(state);
  const idx = unit.uid != null ? board.findIndex(u => u.uid === unit.uid) : -1;
  try {
    if (idx >= 0) {
      // 跟實戰用同一份棋子與標記（心鋼最愛、聚光燈、唱片合約…），面板數字才會和打起來一樣
      const bu = api.battleUnits ? api.battleUnits() : null;
      const team = bu && bu.units.length === board.length
        ? buildTeam('player', bu.units, DATA, { ...ctx, ...bu.ctx })
        : buildTeam('player', board.map(u => ({ ...u, pos: u.pos || [3, 3] })), DATA, ctx);
      return { c: team.combatants[idx] || team.combatants.find(x => x.key === unit.key), onBoard: true };
    }
    const team = buildTeam('player', [{ key: unit.key, star: unit.star || 1, items: unit.items || [], pos: [3, 3] }], DATA, ctx);
    return { c: team.combatants[0], onBoard: false };
  } catch (e) { return { c: null, onBoard: false }; }
}
function fmtSrc(v, stat) { return stat.endsWith('Pct') ? `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v >= 0 ? '+' : ''}${fmt(v)}`; }

export function showUnitPanel(unitOrKey, api) {
  const { DATA, state } = api;
  const unit = typeof unitOrKey === 'string' ? { key: unitOrKey, star: 1, items: [] } : unitOrKey;
  const U = DATA.units.byKey[unit.key]; if (!U) return;
  const star = unit.star || 1;
  const { c, onBoard } = combatantFor(api, unit);
  const body = [];
  body.push(el('div', { class: 'tt-hero' }, avatar(DATA, unit.key, 64),
    el('div', {}, el('div', { class: 'tt-hn' }, U.zh, ' ', el('span', { class: 'tt-stars', 'aria-label': star + ' 星' }, stars(star))),
      el('div', {}, el('span', { class: 'tt-cost', 'data-cost': U.cost, style: `--tt-cost:var(--c${Math.min(U.cost, 5)})` }, U.cost + ' 費'), ' ', badge(U.role || ''), ' ',
        (U.statsGuess ?? true) ? badge('推測數值', 'tt-guess') : null))));
  body.push(el('div', {}, traitTags(unit.key, api, { clickable: true, max: 4 })));
  if (isLocked(api, unit.key)) body.push(el('div', { class: 'tt-notice tt-unlock-note' }, ...unlockTipNodes(api, unit.key)));
  // 數值
  const stats = el('div', {});
  if (c) {
    const by = {};
    for (const s of (c.sources || [])) (by[s.stat] ||= []).push(s);
    for (const [k, zh, names] of STAT_ROWS) {
      const val = c[k]; if (val == null) continue;
      const txt = k === 'as' ? val.toFixed(2) : fmt(val);
      const srcs = names.flatMap(n => (by[n] || []).map(s => `${srcLabel(DATA, s.src)} ${fmtSrc(s.value, s.stat)}`));
      stats.append(el('div', { class: 'tt-stat' }, el('span', {}, zh), el('span', {}, el('b', {}, txt), srcs.length ? el('span', { class: 'tt-src' }, `（${srcs.join('、')}）`) : null)));
    }
    if (!onBoard) stats.append(el('p', { class: 'tt-src xs muted', style: 'margin:4px 0 0;font-size:var(--fs-xs);color:var(--muted)' }, '還沒上場，數值沒有算羈絆加成。'));
  } else {
    const st = U.stats || {};
    for (const [k, zh] of STAT_ROWS) if (st[k] != null) stats.append(el('div', { class: 'tt-stat' }, el('span', {}, zh), el('b', {}, String(st[k]))));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '數值'), stats));
  // 技能
  const ab = U.ability;
  if (ab) {
    const mana = c ? [c.mana, c.manaMax] : (U.stats?.mana || null);
    const box = el('div', { class: 'tt-ab' }, el('h3', {}, ab.name, mana && mana[1] ? badge(`法力 ${mana[0]}/${mana[1]}`) : badge('不靠法力'),
      ab.simplified ? badge('簡化', 'tt-simp') : null, ab.guess ? badge('推測數值', 'tt-guess') : null),
      el('p', { class: 'tt-desc', style: 'margin:0' }, richText(ab.desc || '', star)));
    if (ab.simplified) box.append(el('p', { style: 'margin:6px 0 0;font-size:var(--fs-s);color:var(--muted)' }, '本頁做法：' + ab.simplified));
    body.push(box);
  }
  if ((unit.items || []).length) {
    body.push(el('div', {}, el('h3', { class: 'tt-h' }, '裝備'), el('div', { class: 'tt-items' },
      unit.items.map(k => el('span', { class: 'tt-item' }, el('img', { src: `../icons/items/${k}.webp`, alt: '', loading: 'lazy' }), DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k)))));
  }
  const footer = [];
  if (unit.uid != null) {
    const price = sellValue(unit, DATA);
    const b = el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'sell' }, `賣出 +${price} 金`);
    b.addEventListener('click', () => sellUnit(api, unit, { onSold: () => closePanels() }));
    footer.push(b);
  }
  footer.push(el('button', { type: 'button', class: 'tt-btn', onclick: () => closeAll() }, '關閉'));
  return openPanel({ titleNode: [U.zh, (isLocked(api, unit.key) ? badge('還沒解鎖', 'tt-guess') : null)], body, footer, cls: 'tt-unit-panel' });
}

// ---------- 圖鑑 ----------
export function showCodex(api) {
  const { DATA } = api; const body = [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '全部羈絆，不用上場也能查。點一個看說明。')];
  for (const kind of ['origin', 'class', 'unique']) {
    const list = DATA.traits.list.filter(t => t.kind === kind).sort((a, b) => (a.zh < b.zh ? -1 : 1));
    if (!list.length) continue;
    const g = el('div', { class: 'tt-group' }, el('h3', {}, el('span', { class: 'tt-badge tt-kind', 'data-kind': kind }, KIND_ZH[kind]), `${list.length} 個`));
    for (const t of list) {
      const mems = (t.members || []).map(k => DATA.units.byKey[k]).filter(Boolean).sort((a, b) => a.cost - b.cost);
      const b = el('button', { type: 'button', class: 'tt-crow', 'data-kind': kind, 'aria-label': `${t.zh}，門檻 ${t.breakpoints.join('、')}` },
        el('span', { class: 'tt-cn' }, tIcon(DATA, t.key, 22), t.zh, el('small', {}, (t.breakpoints || []).join(' ▸ ')), (t.simplified ? badge('簡化', 'tt-simp') : null), (t.guess ? badge('推測', 'tt-guess') : null)),
        el('span', { class: 'tt-cd' }, t.desc || ''),
        el('span', { class: 'tt-cm' }, mems.map(u => lockedAvatar(DATA, u.key, 26, isLocked(api, u.key)))));
      b.addEventListener('click', () => showTraitPanel(t.key, api));
      g.append(b);
    }
    body.push(g);
  }
  return openPanel({ title: '羈絆圖鑑', body, cls: 'tt-wide' });
}

// ---------- 已選增幅說明（點狀態列的增幅圖示） ----------
export function showAugmentInfo(api, key) {
  const { DATA } = api; const A = DATA.augments.byKey[key]; if (!A) return;
  const own = (api.state.augments || []).map(k => DATA.augments.byKey[k]).filter(Boolean);
  const body = [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '你這場選過的增幅：')];
  const ul = el('ul', { class: 'tt-kv' });
  for (const a of own) ul.append(el('li', { style: a.key === key ? 'font-weight:700' : '' }, el('span', {}, ['', '銀色', '金色', '彩色'][a.tier] + '｜' + a.zh), el('span', {}, a.desc || '')));
  body.push(ul);
  return openPanel({ title: A.zh, body, footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')], cls: 'tt-wide' });
}

// ---------- 增幅三選一 ----------
// pending = state.pendingChoices {type:'augment', options:[key|{key}], rerollLeft?:n}
export function showAugmentChoice(api, pending) {
  const { DATA, state } = api; pending = pending || state.pendingChoices;
  // 每一張各有自己的重抽鍵（官方做法）：按了只換那一張，其他兩張不變。pending 是 state.pendingChoices，原地被改，這裡自己重畫。
  const cur = () => state.pendingChoices && state.pendingChoices.type === 'augment' ? state.pendingChoices : pending;
  const holder = el('div', {});
  const render = (focusIdx = 0) => {
    const p = cur();
    const row = el('div', { class: 'tt-opts' });
    p.options.forEach((o, i) => {
      const A = DATA.augments.byKey[typeof o === 'string' ? o : o.key]; if (!A) return;
      const icon = el('span', { class: 'tt-augi', 'aria-hidden': 'true' });
      icon.style.backgroundImage = 'url("../icons/aug-sprite.webp")'; icon.style.backgroundSize = '2000% 1300%';
      icon.style.backgroundPosition = `${(A.sp % 20) * 100 / 19}% ${Math.floor(A.sp / 20) * 100 / 12}%`;
      const b = el('button', { type: 'button', class: 'tt-opt', 'data-tier': A.tier, 'data-i': i, 'data-autofocus': i === focusIdx ? '' : null },
        el('span', { class: 'tt-opt-head' }, icon, el('span', {}, el('span', { class: 'tt-tl' }, ['', '銀色', '金色', '彩色'][A.tier] || ''), el('div', { class: 'tt-on' }, A.zh))),
        el('span', {}, A.desc), A.guess ? el('span', {}, badge('推測數值', 'tt-guess')) : null);
      b.addEventListener('click', () => { sfx('pick'); closePanels(); api.act('pickAugment', i); });
      const left = Array.isArray(p.rerollLeft) ? (p.rerollLeft[i] || 0) : 0;
      const rr = el('button', { type: 'button', class: 'tt-btn tt-ghost tt-augrr', 'data-tt': 'aug-reroll', 'data-i': i, disabled: left > 0 ? null : '', 'aria-label': left > 0 ? `重抽第 ${i + 1} 張（只換這一張，還有 ${left} 次）` : `第 ${i + 1} 張的重抽用完了` },
        left > 0 ? `重抽這張（${left}）` : '重抽用完了');
      rr.addEventListener('click', () => { const r = api.act('rerollAugmentSlot', i); if (r && r.ok) { holder.replaceChildren(render(i)); const nb = holder.querySelector(`.tt-opt[data-i="${i}"]`); nb && nb.focus({ preventScroll: true }); } });
      row.append(el('div', { class: 'tt-optcol' }, b, rr));
    });
    return row;
  };
  const tier = DATA.augments.byKey[typeof pending.options[0] === 'string' ? pending.options[0] : pending.options[0]?.key]?.tier;
  holder.append(render());
  return openPanel({ title: `選一個增幅${tier ? '（' + ['', '銀', '金', '彩'][tier] + '）' : ''}`, body: [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '三選一。不喜歡哪一張，就按它下面的重抽，只會換那一張（每張可以換 1 次）。'), holder], modal: true, cls: 'tt-wide' });
}

// ---------- 獎勵 ----------
// pending = state.pendingChoices {type:'reward', options:[{kind:'item', items:[k,k,k]}|{kind:'gold', value}|{kind:'unit', key, component?}|{kind:'unit7', keys:[k,k,k,k]}]}
// 點選 -> api.act('pickReward', idx, sub?)；kind 為 item／unit7 的要再點裡面一個。
// 整合：game.js 的選項是 {kind:'completed',choices}|{kind:'gold',gold}|{kind:'unit',key,cost}|{kind:'seven',choices}，
// 第二段是 {type:'rewardPick', from, options:[{key}]}；這裡轉成本檔用的形狀。
function normReward(p) {
  if (p.type === 'rewardPick') {
    const keys = p.options.map(o => o.key);
    return { ...p, options: [p.from === 'completed' ? { kind: 'item', items: keys, stage2: true } : { kind: 'unit7', keys, stage2: true }] };
  }
  return { ...p, options: p.options.map(o => {
    if (o.kind === 'completed') return { kind: 'item', items: o.choices };
    if (o.kind === 'seven') return { kind: 'unit7', keys: o.choices };
    if (o.kind === 'gold') return { kind: 'gold', value: o.gold ?? o.value };
    if (o.kind === 'unit') return { kind: 'unit', key: o.key, component: o.component };
    return o;
  }) };
}
export function showReward(api, pending) {
  const { DATA, state } = api; pending = normReward(pending || state.pendingChoices);
  const itemChip = (k) => el('span', { class: 'tt-item' }, el('img', { src: `../icons/items/${k}.webp`, alt: '' }), DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k);
  const row = el('div', { class: 'tt-opts' });
  const done = (idx, sub) => {
    sfx('pick'); closePanels();
    if (pending.type === 'rewardPick') api.act('pickReward', sub); else api.act('pickReward', idx, sub);
  };
  pending.options.forEach((o, i) => {
    const kind = o.kind || o.type;
    let box;
    if (kind === 'item' || kind === 'unit7') {
      box = el('div', { class: 'tt-opt', style: 'cursor:default' }, el('span', { class: 'tt-on' }, kind === 'item' ? '成品裝備 1 件' : '7 費棋子 1 隻'), el('span', { class: 'tt-src', style: 'color:var(--muted)' }, '再點一個：'));
      const sub = el('div', { class: 'tt-sub' });
      (kind === 'item' ? o.items : o.keys).forEach((k, j) => {
        const b = el('button', { type: 'button', class: 'tt-opt', 'data-tier': 2, 'data-autofocus': i === 0 && j === 0 ? '' : null },
          kind === 'item' ? itemChip(k) : [avatar(DATA, k, 36), unitZh(DATA, k)]);
        b.addEventListener('click', () => done(i, j)); sub.append(b);
      });
      box.append(sub);
    } else {
      const title = kind === 'gold' ? `${o.value ?? 8} 金` : '1 隻棋子＋1 散件';
      const detail = kind === 'gold' ? '直接拿錢。' : [o.key ? el('span', { class: 'tt-item' }, avatar(DATA, o.key, 28), unitZh(DATA, o.key), ' 1★') : '費用最高的隨機棋子', o.component ? [' ＋ ', el('span', { class: 'tt-item' }, DATA.items?.byKey?.[o.component]?.zh || DATA.items?.components?.find?.(c => c.key === o.component)?.zh || '散件')] : ''];
      box = el('button', { type: 'button', class: 'tt-opt', 'data-autofocus': i === 0 ? '' : null }, el('span', { class: 'tt-on' }, title), el('span', {}, detail));
      box.addEventListener('click', () => done(i));
    }
    row.append(box);
  });
  return openPanel({ title: '頭目獎勵', body: [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '打贏頭目的獎勵，三選一。'), row], modal: true, cls: 'tt-wide' });
}

// ---------- 頭目登場 ----------
// boss = {name, theme, mechanic, hint}
export function showBossIntro(api, boss, onGo) {
  sfx('boss');
  const body = [el('div', { class: 'tt-resbig tt-lose' }, boss.name || '頭目'),
    boss.theme ? el('p', { class: 'tt-desc' }, el('b', {}, '主題羈絆：'), boss.theme) : null,
    el('p', { class: 'tt-desc' }, el('b', {}, '機制：'), boss.mechanic || ''),
    el('p', { class: 'tt-desc' }, el('b', {}, '破解：'), boss.hint || ''),
    el('p', { class: 'tt-desc muted', style: 'font-size:var(--fs-s)' }, '本站自己設計的頭目，不是官方關卡。')];
  return openPanel({ title: '頭目登場', body, footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); onGo?.(); } }, '知道了')], modal: true });
}

// ---------- 結算 ----------
const GAIN_ZH = { gold: '金幣', xp: '經驗', life: '生命', heat: '熱度', unit: '棋子', item: '裝備', interest: '利息', streak: '連勝', base: '基本收入', win: '勝利獎勵' };
// 整合：game.js 的 gains 是 {type, label, gold?|xp?|unit?|item?|life?|heat?|counter?+value}
function gainText(DATA, g) {
  const name = g.label || GAIN_ZH[g.type] || g.type;
  let v;
  if (g.gold != null) v = `+${g.gold} 金`;
  else if (g.xp != null) v = `+${g.xp} 經驗`;
  else if (g.unit) v = unitZh(DATA, g.unit) + ' 1★';
  else if (g.item) v = DATA.items?.byKey?.[g.item]?.zh || DATA.items?.compByKey?.[g.item]?.zh || g.item;
  else if (g.life != null) v = `+${g.life} 命`;
  else if (g.heat != null) v = `熱度 +${fmt(g.heat)}`;
  else if (g.counter) v = `${g.counter} +${fmt(g.value)}`;
  else v = g.value != null ? `${g.value > 0 ? '+' : ''}${g.value}` : '';
  return [name, v];
}
function traitContribution(DATA, key, s) {
  const parts = [];
  if (s.procs) parts.push(`觸發 ${s.procs} 次`);
  if (s.dmg) parts.push(`傷害 ${fmt(s.dmg)}`);
  if (s.heal) parts.push(`治療 ${fmt(s.heal)}`);
  if (s.shield) parts.push(`護盾 ${fmt(s.shield)}`);
  return [[tIcon(DATA, key, 18), traitZh(DATA, key)], parts.join('、') || '—'];
}
// info = {result, enemy, finish, onNext}；finish = actFinishBattle 的回傳 {roundScore, gains[], gameOver?, cleared?, scoreParts?[]}
function buildResultBody(api, info, playCoin) {
  const { DATA, state } = api; const { result, enemy, finish = {} } = info;
  const win = result.winner === 'player';
  const lives = info.livesAfter ?? state.lives, scoreNow = info.scoreAfter ?? state.score;   // 回看時用當時的數字
  const body = [];   // 勝敗音效由 battle.js 在 end 事件播
  body.push(el('div', { class: 'tt-resbig ' + (win ? 'tt-win' : 'tt-lose') }, win ? '勝利' : '落敗',
    el('small', {}, `${enemy?.name ? 'VS ' + enemy.name + '，' : ''}${Math.round(result.seconds)} 秒，我方存活 ${result.summary.playerAlive} 隻`)));
  if (!win) body.push(el('p', { class: 'tt-desc' }, `扣 1 條命，剩 ${lives} 條。敵方還剩 ${Math.round((result.summary.enemyHpPctLeft ?? 0) * 100)}% 血。`));
  // 得分
  const sc = el('ul', { class: 'tt-kv' });
  for (const p of (finish.scoreParts || [])) sc.append(el('li', {}, el('span', {}, p.label), el('b', {}, '+' + fmt(p.value))));
  sc.append(el('li', {}, el('span', {}, '本回合得分'), el('b', {}, '+' + fmt(finish.roundScore ?? 0))));
  if (finish.endBonus) sc.append(el('li', {}, el('span', {}, finish.cleared ? '通關加分（通關、剩下的命、剩下的金錢）' : '剩下的金錢加分'), el('b', {}, '+' + fmt(finish.endBonus))));
  sc.append(el('li', {}, el('span', {}, '累計分數'), el('b', {}, fmt(scoreNow ?? 0))));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '得分'), sc));
  // 收入
  const gains = finish.gains || [];   // 戰鬥中的經濟效果（summary.rewards）已由 game.js 併進 gains
  const gl = el('ul', { class: 'tt-kv' });
  let coinPlayed = false;   // 金幣音效 1.35 秒：只在第一行有金幣的收入播一次，不疊
  gains.forEach((g) => { const [a, b] = gainText(DATA, g); const li = el('li', {}, el('span', {}, a), el('b', {}, b)); gl.append(li); if (g.gold && !coinPlayed) { coinPlayed = true; if (playCoin) sfx('coin'); } });
  if (!gains.length) gl.append(el('li', {}, el('span', { class: 'muted' }, '這回合沒有收入'), ''));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '收入'), gl));
  // 羈絆貢獻
  const bt = Object.entries(result.summary.byTrait || {}).filter(([, s]) => s && (s.procs || s.dmg || s.heal || s.shield))
    .sort((a, b) => (b[1].procs || 0) - (a[1].procs || 0) || (a[0] < b[0] ? -1 : 1));
  const tl = el('ul', { class: 'tt-kv', 'data-tt': 'trait-contrib' });
  for (const [k, s] of bt) { const [a, b] = traitContribution(DATA, k, s); tl.append(el('li', {}, el('span', {}, a), el('span', {}, b))); }
  if (!bt.length) tl.append(el('li', {}, el('span', { class: 'muted' }, '這場沒有羈絆做出額外效果。'), ''));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '羈絆做了什麼'), tl));
  // 傷害排行
  const mine = result.units.filter(u => u.side === 'player');
  const rows = mine.map(u => ({ u, s: result.summary.byUnit[u.id] || {} })).sort((a, b) => (b.s.dmg || 0) - (a.s.dmg || 0));
  const mx = Math.max(1, ...rows.map(r => r.s.dmg || 0));
  const dl = el('div', { class: 'tt-dmg' });
  for (const { u, s } of rows) {
    const tot = s.dmg || 0; const w = (tot / mx) * 100;
    const part = (x) => tot ? (x || 0) / tot * w : 0;
    dl.append(el('div', { class: 'tt-dmgrow' }, avatar(DATA, u.key, 32), el('span', {}, u.zh, ' ', el('span', { class: 'tt-stars' }, stars(u.star))),
      el('span', { class: 'tt-bar', role: 'img', 'aria-label': `物理 ${fmt(s.phys || 0)}，魔法 ${fmt(s.magic || 0)}，真實 ${fmt(s.true || 0)}` },
        el('i', { class: 'p', style: `width:${part(s.phys)}%` }), el('i', { class: 'm', style: `width:${part(s.magic)}%` }), el('i', { class: 't', style: `width:${part(s.true)}%` })),
      el('span', { class: 'tt-dn' }, fmt(tot))));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '傷害排行'), el('div', { class: 'tt-legend' }, el('span', {}, el('i', { style: 'background:#e8863a' }), '物理'), el('span', {}, el('i', { style: 'background:#4a86e0' }), '魔法'), el('span', {}, el('i', { style: 'background:#d8d8d8;box-shadow:inset 0 0 0 1px #888' }), '真實')), dl));
  return body;
}
// 遊戲結束／通關那一場：還是跳完整結算視窗（按「看結果」才往下）。
// info.review＝回頭看上一回合：可以關掉的普通視窗，不重播金幣音效。
export function showResult(api, info) {
  const { state } = api; const finish = info.finish || {};
  const round = info.round ?? state.history?.slice(-1)[0]?.round ?? state.round;
  if (info.review) {
    const close = el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉');
    return openPanel({ title: `第 ${round} 回合結算`, body: buildResultBody(api, info, false), footer: [close], cls: 'tt-wide tt-result' });
  }
  const next = el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); info.onNext?.(); } }, finish.gameOver || finish.cleared ? '看結果' : '下一回合');
  return openPanel({ title: `第 ${round} 回合結算`, body: buildResultBody(api, info, true), footer: [next], modal: true, cls: 'tt-wide tt-result' });
}

// 一般回合打完：不擋操作的小橫幅（約 2.5 秒淡出），點一下開完整明細。金幣音效只在這裡播一次。
let bannerEl = null, bannerT = null;
export function hideResultBanner() { clearTimeout(bannerT); if (bannerEl) { bannerEl.remove(); bannerEl = null; } }
export function showResultBanner(api, info) {
  const { DATA } = api; const { result, finish = {} } = info;
  hideResultBanner();
  const win = result.winner === 'player';
  const round = info.round ?? api.state.round;
  const gains = finish.gains || [];
  const goldTotal = gains.reduce((n, g) => n + (g.gold || 0), 0);
  if (goldTotal > 0) sfx('coin');
  const parts = gains.filter(g => g.gold).map(g => { const [a, b] = gainText(DATA, g); return `${a} ${b.replace(' 金', '')}`; });
  const other = gains.filter(g => !g.gold).length;
  const line2 = [];
  if (!win) line2.push(`扣 1 條命，剩 ${info.livesAfter ?? api.state.lives} 條`);
  if (goldTotal > 0) line2.push(`收入 +${goldTotal} 金（${parts.join('、')}）`);
  if (other) line2.push(`另外拿了 ${other} 項`);
  if (api.state.streak >= 2 && win) line2.push(`${api.state.streak} 連勝`);
  const b = el('div', { class: 'tt-rbanner ' + (win ? 'tt-win' : 'tt-lose'), role: 'status', 'aria-live': 'polite', tabindex: '0', 'data-tt': 'result-banner', 'aria-label': '上回合結算，點一下看明細' },
    el('div', { class: 'tt-rb-h' }, el('b', {}, win ? '勝利' : '落敗'), el('span', {}, `第 ${round} 回合・得分 +${fmt(finish.roundScore ?? 0)}`), el('em', {}, '點一下看明細')),
    line2.length ? el('div', { class: 'tt-rb-b' }, line2.join('　')) : null);
  const open = () => { hideResultBanner(); showResult(api, { ...info, review: true }); };
  b.addEventListener('click', open);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  document.body.append(b); bannerEl = b;
  bannerT = setTimeout(() => { if (bannerEl !== b) return; b.classList.add('tt-out'); bannerT = setTimeout(() => { if (bannerEl === b) hideResultBanner(); }, 400); }, 2500);
  return b;
}

// ---------- 遊戲結束／通關 ----------
// info = {cleared, score, round, bestTraits:[{key,tier}]}（分數與回合缺的話讀 state）；最高分讀 localStorage['trials19.best']
export function showGameOver(api, info = {}) {
  const { DATA, state } = api;
  const score = info.score ?? state.score ?? 0; const round = info.round ?? state.round;
  let best = null; try { best = JSON.parse(localStorage.getItem('trials19.best') || 'null'); } catch (_) {}
  const isNew = !best || score >= best.score;
  const body = [el('div', { class: 'tt-resbig ' + (info.cleared ? 'tt-win' : 'tt-lose') }, info.cleared ? '通關' : '遊戲結束', el('small', {}, `打到第 ${round} 回合`)),
    el('div', {}, el('div', { class: 'tt-bigscore' }, fmt(score)), el('div', { class: 'muted' }, isNew ? '新的最高分' : `最高分 ${fmt(best.score)}（第 ${best.round} 回合）`),
      info.endBonus ? el('div', { class: 'muted' }, `這個分數已含${info.cleared ? '通關、剩下的命和金錢' : '剩下的金錢'}加分 +${fmt(info.endBonus)}`) : null)];
  const traits = info.bestTraits || [];
  const chips = el('div', { class: 'tt-chips' });
  for (const t of traits) chips.append(el('span', { class: 'tt-chip', 'data-kind': kindOf(DATA, t.key) }, [tIcon(DATA, t.key, 18), `${traitZh(DATA, t.key)} 第 ${t.tier} 階`]));
  if (!traits.length) chips.append(el('span', { class: 'muted' }, '這場沒有啟動過羈絆。'));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '這場啟動過的羈絆（最高階）'), chips));
  const footer = [el('a', { class: 'tt-btn tt-ghost', href: '../?s=19' }, '回攻略站'),
    el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); api.act('restart'); } }, '再玩一次')];
  return openPanel({ title: info.cleared ? '通關了' : '遊戲結束', body, footer, modal: true });
}

// ======================================================================
// 以下是第二版介面（SPEC_UI2）加的：解鎖、快捷鍵、右側棋子面板、賣出確認、說明
// ======================================================================

// ---------- 解鎖資料入口（api.unlocks 由包 A 提供；沒有就當機制關閉） ----------
const unlockOn = (api) => { const u = api && api.unlocks; if (!u) return false; const e = u.enabled; return typeof e === 'function' ? !!e.call(u) : !!e; };
export function isLocked(api, key) { try { return unlockOn(api) && typeof api.unlocks.isUnlocked === 'function' && !api.unlocks.isUnlocked(key); } catch (_) { return false; } }
function unlockEntries(api) {
  const byKey = api.DATA.unlocks?.byKey || {};
  let list = [];
  try { list = (api.unlocks && api.unlocks.list && api.unlocks.list()) || api.DATA.unlocks?.list || []; } catch (_) { list = api.DATA.unlocks?.list || []; }
  return list.map(x => (typeof x === 'string' ? { key: x } : x)).map(x => ({ ...(byKey[x.key] || {}), ...x })).filter(x => x.key && api.DATA.units.byKey[x.key]);
}
function unlockProgress(api, key) {
  try { return (api.unlocks && api.unlocks.progress && api.unlocks.progress(key)) || null; } catch (_) { return null; }
}
// 互斥（兩隻阿卡莉）：條件樹裡有 not:unlocked:X 而 X 已解鎖
function blockedBy(api, cond) {
  if (!cond || typeof cond !== 'object') return null;
  if (cond.type === 'not' && cond.unlocked && api.unlocks && api.unlocks.isUnlocked(cond.unlocked)) return cond.unlocked;
  for (const c of (cond.of || [])) { const r = blockedBy(api, c); if (r) return r; }
  return null;
}
// 條件樹裡提到的棋子 key（連鎖解鎖：把名字做成可點）
function condUnits(cond, out = new Set()) {
  if (!cond || typeof cond !== 'object') return out;
  for (const k of ['unit', 'withUnit', 'unlocked']) if (typeof cond[k] === 'string') out.add(cond[k]);
  if (cond.who && typeof cond.who === 'object' && cond.who.unit) out.add(cond.who.unit);
  for (const c of (cond.of || [])) condUnits(c, out);
  return out;
}
const nfmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>';
// 頭像；沒解鎖的灰階＋右下角小鎖
export function lockedAvatar(DATA, key, size, locked) {
  const w = el('span', { class: 'tt-lockav' + (locked ? ' tt-locked' : '') }, avatar(DATA, key, size));
  if (locked) { const b = el('span', { class: 'tt-lockbadge', 'aria-hidden': 'true' }); b.innerHTML = LOCK_SVG; w.append(b); w.setAttribute('data-tt-tip', 'unlock:' + key); }
  return w;
}
function progressNodes(p) {
  if (!p) return [];
  if (p.parts && p.parts.length) return p.parts.map(x => el('p', { class: 'tt-tip-p' }, (x.done ? '✓ ' : '○ ') + (x.text || '') + (x.need != null && x.need > 1 ? `　${nfmt(x.cur)}/${nfmt(x.need)}` : '')));
  return [el('p', { class: 'tt-tip-p' }, `進度 ${nfmt(p.cur)}/${nfmt(p.need)}`)];
}
// 說明框用（tooltip.js 的 unlock:<key>）與棋子面板共用
export function unlockTipNodes(api, key) {
  const ent = unlockEntries(api).find(x => x.key === key); if (!ent) return null;
  const { DATA } = api; const U = DATA.units.byKey[key];
  const done = api.unlocks.isUnlocked(key);
  const nodes = [el('b', { class: 'tt-tip-title' }, `${U.zh}　${done ? '已解鎖' : '還沒解鎖'}`), el('p', { class: 'tt-tip-p' }, ent.text || '')];
  if (ent.local) nodes.push(el('p', { class: 'tt-tip-p tt-tip-muted' }, '本頁做法：' + ent.local));
  const b = blockedBy(api, ent.cond);
  if (b && !done) nodes.push(el('p', { class: 'tt-tip-p tt-tip-muted' }, '這一局不能解鎖了（已解鎖另一隻阿卡莉）'));
  else if (!done) nodes.push(...progressNodes(unlockProgress(api, key)));
  if (ent.guess) nodes.push(el('div', { class: 'tt-tip-foot' }, el('span', { class: 'tt-tip-badge tt-guess' }, '推測')));
  return nodes;
}

// ---------- 賣出（3★ 與 7 費要確認；拖到商店、E 鍵、面板賣出鍵共用） ----------
export function sellUnit(api, unit, opts = {}) {
  const { DATA } = api; const U = DATA.units.byKey[unit.key]; if (!U) return null;
  const star = unit.star || 1, price = sellValue(unit, DATA);
  const doit = () => {
    const sel = api.ui && api.ui.sel;
    if (sel && sel.kind === 'unit' && sel.uid === unit.uid) api.ui.sel = null;
    const r = api.act('sell', unit.uid);
    if (r && r.ok !== false) opts.onSold && opts.onSold();
    return r;
  };
  if (!(star >= 3 || U.cost >= 7)) return doit();
  const body = [el('p', { class: 'tt-desc' }, `確定賣掉 ${star}★ ${U.zh}？可以拿 ${price} 金，賣掉就回不來了。`)];
  const footer = [
    el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'sell-cancel', onclick: () => closeTop() }, '取消'),
    el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', 'data-tt': 'sell-confirm', onclick: () => { closeTop(); doit(); } }, `確定賣掉 +${price} 金`),
  ];
  return openPanel({ title: `確定賣掉 ${U.zh}？`, body, footer, cls: 'tt-confirm' });
}

// ---------- 目前選取（SPEC_UI2 4.1） ----------
function resolveSel(api) {
  const sel = api.ui && api.ui.sel; if (!sel) return null;
  const { state } = api;
  if (sel.kind === 'unit') { const u = [...(state.board || []), ...(state.bench || [])].find(x => x && x.uid === sel.uid); return u ? { kind: 'unit', unit: u } : null; }
  if (sel.kind === 'enemy') return api.DATA.units.byKey[sel.key] ? { kind: 'enemy', unit: { key: sel.key, star: sel.star || 1, items: sel.items || [] } } : null;
  if (sel.kind === 'sp') return SPECIAL_INFO[sel.id] ? { kind: 'sp', id: sel.id } : null;
  if (sel.kind === 'item') { const k = (state.itemBench || [])[sel.idx]; return k ? { kind: 'item', key: k, idx: sel.idx } : null; }
  return null;
}
export function enemyTraitsOf(api) {
  try {
    const e = api.enemy && api.enemy(); if (!e) return [];
    if (e.traitsPreview && e.traitsPreview.length) return e.traitsPreview;
    return api.countTraits ? api.countTraits(e.units.map(u => ({ key: u.key, star: u.star, items: u.items || [] })), api.DATA, { augments: [] }) : [];
  } catch (_) { return []; }
}

// ---------- 數值格 ----------
const pct = (v) => `${Math.round(v * 100)}%`;
const STAT_DEFS = [
  { id: 'ad', zh: '攻擊力', g: '攻', srcs: ['ad', 'adPct'], val: (c) => fmt(c.ad), base: (U) => U.stats?.ad, desc: '普通攻擊的傷害。' },
  { id: 'ap', zh: '法術強度', g: '法', srcs: ['ap'], val: (c) => fmt(c.ap), base: () => 100, desc: '技能的魔法傷害、治療、護盾會跟著變大。' },
  { id: 'armor', zh: '護甲', g: '甲', srcs: ['armor'], val: (c) => fmt(c.armor), base: (U) => U.stats?.armor, desc: '減少受到的物理傷害。' },
  { id: 'mr', zh: '魔法抗性', g: '抗', srcs: ['mr'], val: (c) => fmt(c.mr), base: (U) => U.stats?.mr, desc: '減少受到的魔法傷害。' },
  { id: 'as', zh: '攻擊速度', g: '速', srcs: ['as', 'asPct'], val: (c) => c.as.toFixed(2), base: (U) => U.stats?.as, desc: '每秒普通攻擊的次數。' },
  { id: 'crit', zh: '暴擊率', g: '暴', srcs: ['crit'], val: (c) => pct(c.crit), base: (U) => U.stats?.crit, desc: '普通攻擊暴擊的機率。' },
  { id: 'critDmg', zh: '暴擊傷害', g: '傷', srcs: ['critDmg'], val: (c) => pct(c.critDmg), base: (U) => U.stats?.critDmg, desc: '暴擊時的傷害倍率。' },
  { id: 'range', zh: '射程', g: '程', srcs: ['range'], val: (c) => `${c.range} 格`, base: (U) => U.stats?.range, desc: '可以打到幾格遠。' },
  { id: 'hpBonus', zh: '生命加成', g: '血', srcs: ['hpPct'], val: (c) => (c.baseHp ? pct(c.hp / c.baseHp - 1) : '—'), show: (c) => c.baseHp && c.hp / c.baseHp - 1 > 0.0005, desc: '比基礎生命多出來的比例。' },
  { id: 'dr', zh: '減傷', g: '減', srcs: ['dr'], val: (c) => pct(c.dr), show: (c) => c.dr > 0, desc: '所有受到的傷害再打折。' },
];
const statDef = (id) => STAT_DEFS.find(d => d.id === id);
// 面板數值用小圖示（單色，跟著文字色）；找不到就退回單字
const SI = {
  ad: '<path d="M15 3h6v6L11 19l-2-2zM8 16l-4 4 1 1 4-4zM3 17l4 4"/>',
  ap: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  armor: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  mr: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l1.6 3.4L17 12l-3.4 1.6L12 17l-1.6-3.4L7 12l3.4-1.6z"/>',
  as: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  crit: '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 1h2v6h-2zM11 17h2v6h-2zM1 11h6v2H1zM17 11h6v2h-6z"/>',
  critDmg: '<path d="M12 1l2.2 6.3L20.5 4l-3.3 6.3L23 12l-5.8 1.7 3.3 6.3-6.3-3.3L12 23l-2.2-6.3L3.5 20l3.3-6.3L1 12l5.8-1.7L3.5 4l6.3 3.3z"/>',
  range: '<path d="M2 12l5-5v3.5h10V7l5 5-5 5v-3.5H7V17z"/>',
  hpBonus: '<path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11z"/>',
  dr: '<path d="M10 3h4v9h4l-6 9-6-9h4z"/>',
};
const statIcon = (d) => {
  const i = el('i', { 'aria-hidden': 'true' });
  if (SI[d.id]) i.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%" focusable="false">${SI[d.id]}</svg>`; else i.textContent = d.g;
  return i;
};
// tooltip 的 stat:<id>：用目前選取的棋子
export function statTipInfo(api, statId) {
  const d = statDef(statId); const r = resolveSel(api); if (!d || !r || r.kind === 'item') return null;
  const { DATA } = api; const U = DATA.units.byKey[r.unit.key];
  const { c } = combatantFor(api, r.unit); if (!c) return null;
  const lines = [];
  const base = d.base && d.base(U);
  if (base != null && statId !== 'range') lines.push(['基礎', statId === 'crit' || statId === 'critDmg' ? pct(base) : statId === 'as' ? Number(base).toFixed(2) : fmt(base)]);
  for (const s of (c.sources || [])) if (d.srcs.includes(s.stat)) lines.push([srcLabel(DATA, s.src), s.stat === 'asPct' || s.stat === 'hpPct' || s.stat === 'adPct' ? fmtSrc(s.value, s.stat) : (['crit', 'critDmg', 'dr'].includes(s.stat) ? `${s.value >= 0 ? '+' : ''}${pct(s.value)}` : fmtSrc(s.value, s.stat))]);
  return { title: d.zh, value: d.val(c), desc: d.desc, lines: lines.filter(x => !(x[0] === '基礎' && lines.length === 1)) };
}

// ---------- 右側棋子面板／手機底部抽屜 ----------
function spriteBg(node, DATA, key) {
  const sp = DATA.units.sprite || {}, idx = sp.map?.[key];
  if (idx == null || !sp.src) return node;
  const cols = sp.cols || 10, rows = sp.rows || 10;
  node.style.backgroundImage = `url("${sp.src}")`;
  node.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${(idx % cols) * 100 / (cols - 1)}% ${Math.floor(idx / cols) * 100 / (rows - 1)}%`;
  return node;
}
const coin = () => el('img', { class: 'tt-coin', src: 'img/ui/gold_coin.webp', alt: '', draggable: 'false' });
const FRONT_ROLES = ['Tank', 'Fighter'];

function bar(cls, cur, max, text, label) {
  const b = el('div', { class: 'tt-us-bar ' + cls, role: 'img', 'aria-label': label }, el('i'), el('span', { class: 'tt-num' }, text));
  b.firstChild.style.width = (max > 0 ? Math.max(0, Math.min(100, cur / max * 100)) : 0) + '%';
  return b;
}

function itemSide(api, r) {
  const { DATA } = api; const k = r.key;
  const I = DATA.items?.byKey?.[k] || DATA.items?.compByKey?.[k];
  const isComp = !!DATA.items?.compByKey?.[k];
  const ic = el('span', { class: 'tt-us-itemicon' }); ic.style.backgroundImage = `url("../icons/items/${k}.webp")`;
  const wrap = el('div', { class: 'tt-us tt-us-item' }, el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }),
    el('div', { class: 'tt-us-itemhead' }, ic, el('div', {}, el('b', { class: 'tt-us-iname' }, I?.zh || k), el('small', {}, I?.recipe ? '成品裝備' : '散件'))));
  if (I?.desc) wrap.append(el('p', { class: 'tt-us-desc' }, I.desc));
  if (I?.recipe) wrap.append(el('p', { class: 'tt-us-desc tt-muted' }, '合成：' + I.recipe.map(x => DATA.items?.byKey?.[x]?.zh || DATA.items?.compByKey?.[x]?.zh || x).join(' ＋ ')));
  if (isComp) {
    const seen = new Set(); const ul = el('ul', { class: 'tt-us-recipes' });
    for (const it of DATA.items.list || Object.values(DATA.items.byKey)) {
      if (!it.recipe || !it.recipe.includes(k)) continue;
      const other = it.recipe[0] === k ? it.recipe[1] : it.recipe[0];
      if (seen.has(other)) continue; seen.add(other);
      ul.append(el('li', {}, `＋${DATA.items?.compByKey?.[other]?.zh || DATA.items?.byKey?.[other]?.zh || other}＝`, el('b', {}, it.zh)));
    }
    if (ul.children.length) wrap.append(el('h3', { class: 'tt-us-h' }, '可以合成'), ul);
  }
  wrap.append(el('p', { class: 'tt-us-hint tt-muted' }, '要裝備就把它拖到棋子身上。'));
  return wrap;
}

const PICK_ORIGIN = (api, key) => { const t = api.DATA.units.byKey[key]?.traits || []; return t.includes('Producer') ? null : (t.find(k => api.DATA.traits.byKey[k]?.kind === 'origin') || null); };
function spSide(api, r) {
  const I = SPECIAL_INFO[r.id];
  const ic = el('span', { class: 'tt-us-itemicon tt-spicon tt-sp-' + r.id });
  const wrap = el('div', { class: 'tt-us tt-us-item' }, el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }),
    el('div', { class: 'tt-us-itemhead' }, ic, el('div', {}, el('b', { class: 'tt-us-iname' }, I.zh), el('small', {}, I.sub))));
  wrap.append(el('p', { class: 'tt-us-desc' }, I.desc), el('p', { class: 'tt-us-hint tt-muted' }, I.hint));
  return wrap;
}

function unitSide(api, r) {
  const { DATA } = api; const u = r.unit; const U = DATA.units.byKey[u.key]; const star = u.star || 1;
  const enemy = r.kind === 'enemy';
  const { c } = combatantFor(api, u);
  const wrap = el('div', { class: 'tt-us', 'data-kind': r.kind, 'data-cost': U.cost });
  wrap.append(el('div', { class: 'tt-us-grip', 'data-tt-grip': '', 'aria-hidden': 'true' }));
  // 頭圖＋左邊羈絆
  const art = spriteBg(el('span', { class: 'tt-us-art', 'aria-hidden': 'true' }), DATA, u.key);
  const tl = el('div', { class: 'tt-us-traits' });
  const etraits = enemy ? enemyTraitsOf(api) : null;
  for (const k of (U.traits || [])) {
    const b = el('button', { type: 'button', class: 'tt-us-trait', 'data-trait': k, 'data-kind': kindOf(DATA, k), 'data-tt-tip': 'trait:' + k, 'aria-label': `${traitZh(DATA, k)}，點開羈絆說明` }, tIcon(DATA, k, 22), el('span', {}, traitZh(DATA, k)));
    b.addEventListener('click', () => showTraitPanel(k, api, enemy ? { side: 'enemy', traits: etraits } : {}));
    tl.append(b);
  }
  wrap.append(el('div', { class: 'tt-us-hero' }, art, el('div', { class: 'tt-us-stars', role: 'img', 'aria-label': star + ' 星' }, '★'.repeat(star)), tl));
  // 名稱列
  const price = enemy ? U.cost : sellValue(u, DATA);
  wrap.append(el('div', { class: 'tt-us-name' }, el('b', {}, U.zh), enemy ? badge('敵方', 'tt-enemy') : null,
    el('span', { class: 'tt-us-price', 'aria-label': (enemy ? '費用 ' : '賣價 ') + price + ' 金' }, coin(), el('span', { class: 'tt-num' }, price))));
  // 指定道具（心鋼最愛、聚光燈、唱片合約、合作邀請、分身站位）：棋子身上有標記就寫在這裡；能放但還沒放就提示怎麼放
  if (!enemy && api.picks) {
    try {
      const pk = api.picks();
      const inb = !!(api.state.board || []).find(x => x && x.uid === u.uid);
      const lines = [];
      for (const [id, ico] of [['fav', '♥ 最愛：'], ['spot', '聚光燈：'], ['deal', '唱片合約：'], ['prod', '合作邀請：'], ['clone', '分身站位：']]) {
        const f = pk[id]; if (!f || !f.cap) continue;
        const held = f.held.includes(u.uid), on = f.active.includes(u.uid);
        if (held) {
          const txt = !on ? (inb ? '羈絆掉階了或數量不夠，暫時失效' : '在板凳上，要上場才有效')
            : id === 'fav' ? '技能增幅 +25%' : id === 'spot' ? '開場和每 5 秒都拿一次傷害增幅' : id === 'deal' ? '傷害增幅 +5%，他每殺一個蒙多永久 +25 生命'
              : id === 'prod' ? `${traitZh(api.DATA, f.trait)} 多算 1 人` : '分身開場站在他旁邊';
          lines.push(el('p', { class: 'tt-us-fav' + (on ? '' : ' tt-off') }, ico, txt));
        } else if (f.free > 0 && (id === 'fav' ? (U.traits || []).includes('Heartsteel') : id === 'prod' ? !!(PICK_ORIGIN(api, u.key)) : true)) {
          const hint = { fav: '拖「心鋼最愛」到他身上，就選他強化技能', spot: '想捧他就把聚光燈拖到他身上', deal: '要簽他就把唱片合約拖到他身上',
            prod: `拖「合作邀請」到他身上，${traitZh(api.DATA, PICK_ORIGIN(api, u.key) || '')} 就多算 1 人`, clone: '拖「分身站位」到他身上，分身就站他旁邊' }[id];
          lines.push(el('p', { class: 'tt-us-fav tt-off' }, hint));
        }
      }
      wrap.append(...lines);
    } catch (_) { /* 說明少一行沒關係 */ }
  }
  // 血條、法力條
  const hp = c ? c.hp : (U.stats?.hp || 0);
  wrap.append(bar('tt-hp', hp, hp, `${fmt(hp)} / ${fmt(hp)}`, `生命 ${fmt(hp)}`));
  const hasMana = c ? c.manaMax > 0 : !!(U.stats?.mana && U.stats.mana[1]);
  const m0 = c ? c.mana : U.stats?.mana?.[0], m1 = c ? c.manaMax : U.stats?.mana?.[1];
  wrap.append(hasMana ? bar('tt-mana', m0, m1, `${fmt(m0)} / ${fmt(m1)}`, `法力 ${m0}／${m1}`) : bar('tt-mana tt-none', 0, 1, '—', '不靠法力'));
  // 技能圖示＋定位＋射程
  const ab = U.ability;
  const abBtn = ab
    ? el('button', { type: 'button', class: 'tt-us-ab', 'data-tt-tip': `ability:${u.key}:${star}`, 'data-tt-pin': '', 'data-tt-tip-place': 'left', 'aria-label': `技能：${ab.name}，點一下釘住說明` }, abilityIcon(DATA, u.key, 44))
    : el('span', { class: 'tt-us-ab tt-empty', 'aria-hidden': 'true' });
  const rng = c ? c.range : U.stats?.range;
  wrap.append(el('div', { class: 'tt-us-row3' }, abBtn,
    el('span', { class: 'tt-us-cell' }, el('small', {}, '定位'), el('b', {}, FRONT_ROLES.includes(U.roleClass) ? '前排' : '後排')),
    el('span', { class: 'tt-us-cell' }, el('small', {}, '射程'), el('b', {}, `${rng} 格`))));
  // 裝備 3 格
  const slots = el('div', { class: 'tt-us-items', 'aria-label': '裝備' });
  for (let i = 0; i < 3; i++) {
    const k = (u.items || [])[i];
    if (k) { const s = el('span', { class: 'tt-us-item1', 'data-tt-tip': 'item:' + k, tabindex: '0', role: 'img', 'aria-label': DATA.items?.byKey?.[k]?.zh || DATA.items?.compByKey?.[k]?.zh || k }); s.style.backgroundImage = `url("../icons/items/${k}.webp")`; slots.append(s); }
    else slots.append(el('span', { class: 'tt-us-item1 tt-empty', 'aria-hidden': 'true' }));
  }
  wrap.append(slots);
  wrap.append(el('div', { class: 'tt-us-role' }, U.role || ''));
  // 數值 2×5
  const grid = el('div', { class: 'tt-us-stats' });
  for (const d of STAT_DEFS) {
    if (!c || (d.show && !d.show(c))) { grid.append(el('span', { class: 'tt-us-stat tt-empty', 'aria-hidden': 'true' })); continue; }
    grid.append(el('span', { class: 'tt-us-stat', tabindex: '0', 'data-tt-tip': 'stat:' + d.id, 'aria-label': `${d.zh} ${d.val(c)}` }, statIcon(d), el('b', { class: 'tt-num' }, d.val(c))));
  }
  wrap.append(grid);
  // 按鈕
  const btns = el('div', { class: 'tt-us-btns' });
  const more = el('button', { type: 'button', class: 'tt-us-btn', 'data-tt': 'unit-detail' }, '詳情');
  more.addEventListener('click', () => showUnitPanel(u, api));
  btns.append(more);
  if (!enemy) {
    const sell = el('button', { type: 'button', class: 'tt-us-btn tt-sell', 'data-tt': 'unit-sell' }, '賣出 ', el('span', { class: 'tt-num' }, '+' + price));
    sell.addEventListener('click', () => sellUnit(api, u));
    btns.append(sell);
  }
  wrap.append(btns);
  return wrap;
}

export function renderUnitSide(root, api) {
  if (!root || !api) return;
  bindApi(api);
  const ui = api.ui || {};
  const r = ui.mode === 'battle' ? null : resolveSel(api);
  if (ui.sel && !r && ui.mode !== 'battle') ui.sel = null;   // 選取的東西不在了
  if (!r) { root.hidden = true; root.replaceChildren(); delete root.dataset.sel; return; }
  root.hidden = false; root.dataset.sel = r.kind; root.classList.add('tt-unitside');
  const node = r.kind === 'sp' ? spSide(api, r) : r.kind === 'item' ? itemSide(api, r) : unitSide(api, r);
  root.replaceChildren(node);
  if (!root.__ttGrip) {   // 手機抽屜：點把手或往下滑收起
    root.__ttGrip = true;
    let y0 = null;
    const close = () => { if (api.ui) api.ui.sel = null; api.emit && api.emit('change'); };
    root.addEventListener('pointerdown', (e) => { const g = e.target.closest?.('[data-tt-grip]'); y0 = g ? e.clientY : null; });
    root.addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy > 36 || Math.abs(dy) < 6) close(); });
  }
}

// ---------- 解鎖說明 ----------
export function showUnlocks(api) {
  bindApi(api);
  const { DATA } = api;
  const entries = unlockEntries(api);
  if (!unlockOn(api) || !entries.length) {
    return openPanel({ title: '棋子解鎖', body: [el('p', { class: 'tt-desc' }, '這一季沒有要解鎖的棋子。')], footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')] });
  }
  const total = entries.length;
  const doneCount = () => entries.filter(x => api.unlocks.isUnlocked(x.key)).length;
  if (api.ui) { api.ui.unlockNew = false; api.emit && api.emit('change'); }
  const intro = el('ul', { class: 'tt-ul-intro' },
    el('li', {}, `這一季有 ${total} 隻棋子要先達成條件才會進商店。`),
    el('li', {}, '解鎖後的下一次商店，最右邊那格一定是它（一次）。'),
    el('li', {}, '達成一次，這一局就一直有效；每一局重新來過。'),
    el('li', {}, '正式服解鎖後一直不買會變少出現，這裡沒有做。標「推測」的條件官方還沒公布完整數字，PBE 開了會更新。'));
  let filter = 'all';
  const list = el('div', { class: 'tt-ul-list' });
  const tabs = el('div', { class: 'tt-ul-tabs', role: 'group', 'aria-label': '篩選' });
  const sum = el('p', { class: 'tt-ul-sum', 'aria-live': 'polite' });
  const COSTS = [1, 2, 3, 4, 5, 7];
  const textWithLinks = (ent) => {
    const refs = [...condUnits(ent.cond)].filter(k => DATA.units.byKey[k] && k !== ent.key);
    let parts = [ent.text || '']; 
    for (const k of refs) {
      const zh = DATA.units.byKey[k].zh;
      parts = parts.flatMap(p => (typeof p !== 'string' || !p.includes(zh)) ? [p] : p.split(zh).flatMap((seg, i, a) => {
        if (i === a.length - 1) return [seg];
        const b = el('button', { type: 'button', class: 'tt-ul-ref', 'aria-label': `看 ${zh} 的資料` }, zh);
        b.addEventListener('click', (e) => { e.stopPropagation(); showUnitPanel(k, api); });
        return [seg, b];
      }));
    }
    return parts;
  };
  const row = (ent) => {
    const U = DATA.units.byKey[ent.key];
    const done = api.unlocks.isUnlocked(ent.key);
    const blk = !done ? blockedBy(api, ent.cond) : null;
    const p = unlockProgress(api, ent.key);
    const r = el('div', { class: 'tt-ulrow' + (done ? ' tt-done' : '') + (blk ? ' tt-blocked' : ''), 'data-unit': ent.key, 'data-done': done ? '1' : '0' });
    const name = el('button', { type: 'button', class: 'tt-ul-name', 'aria-label': `${U.zh}，${U.cost} 費，${done ? '已解鎖' : '未解鎖'}，點開看資料` }, U.zh);
    name.addEventListener('click', (e) => { e.stopPropagation(); showUnitPanel(ent.key, api); });
    const tr = el('span', { class: 'tt-ul-traits' }, (U.traits || []).slice(0, 3).map(k => el('span', { class: 'tt-ul-t' }, tIcon(DATA, k, 16), el('small', {}, traitZh(DATA, k)))));
    const tags = [];
    if (ent.local) tags.push(badge('簡化', 'tt-simp'));
    if (ent.guess) tags.push(badge('推測', 'tt-guess'));
    const cond = el('div', { class: 'tt-ul-cond' }, el('p', {}, textWithLinks(ent), ' ', tags),
      ent.local ? el('p', { class: 'tt-ul-local' }, '本頁做法：' + ent.local) : null);
    const prog = el('div', { class: 'tt-ul-prog' });
    if (blk) prog.append(el('p', { class: 'tt-ul-block' }, '這一局不能解鎖了（已解鎖另一隻阿卡莉）'));
    else if (p && p.parts && p.parts.length) {
      for (const x of p.parts) prog.append(el('div', { class: 'tt-ul-part' + (x.done ? ' tt-ok' : '') }, el('span', { class: 'tt-ul-chk', 'aria-hidden': 'true' }, x.done ? '✓' : '○'),
        el('span', { class: 'tt-ul-pt' }, x.text || ''), x.need != null && x.need > 1 ? el('span', { class: 'tt-num tt-ul-pn' }, `${nfmt(x.cur)}/${nfmt(x.need)}`) : null));
    } else if (p) {
      const pb = el('div', { class: 'tt-ul-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(p.need), 'aria-valuenow': String(Math.min(p.cur, p.need)) }, el('i'));
      pb.firstChild.style.width = (p.need > 0 ? Math.min(100, p.cur / p.need * 100) : 0) + '%';
      prog.append(pb, el('span', { class: 'tt-num tt-ul-pn' }, `${nfmt(Math.min(p.cur, p.need))}/${nfmt(p.need)}`));
    }
    const rd = api.state?.unlocks?.[ent.key]?.round;
    const status = el('div', { class: 'tt-ul-status' }, done ? `已解鎖${rd != null ? `（第 ${rd} 回合）` : ''}` : (blk ? '不能解鎖' : '未解鎖'));
    r.append(lockedAvatar(DATA, ent.key, 44, !done), el('div', { class: 'tt-ul-main' }, name, tr), cond, prog, status);
    r.addEventListener('click', () => showUnitPanel(ent.key, api));
    return r;
  };
  const draw = () => {
    const shown = entries.filter(x => filter === 'all' || (filter === 'done') === api.unlocks.isUnlocked(x.key));
    const groups = COSTS.map(c => ({ c, rows: shown.filter(x => DATA.units.byKey[x.key].cost === c) })).filter(g => g.rows.length);
    list.replaceChildren(...groups.map(g => el('section', { class: 'tt-ul-group' }, el('h3', { class: 'tt-h' }, `${g.c} 費`, el('small', {}, `${g.rows.length} 隻`)), ...g.rows.map(row))));
    if (!groups.length) list.replaceChildren(el('p', { class: 'tt-desc tt-muted' }, filter === 'done' ? '還沒有解鎖的棋子。' : '全部都解鎖了。'));
    sum.textContent = `已解鎖 ${doneCount()}／${total}`;
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.f === filter));
  };
  for (const [f, zh] of [['all', '全部'], ['todo', '未解鎖'], ['done', '已解鎖']]) {
    const b = el('button', { type: 'button', class: 'tt-ul-tab', 'data-f': f, 'aria-pressed': String(f === filter) }, zh);
    b.addEventListener('click', () => { filter = f; draw(); });
    tabs.append(b);
  }
  draw();
  const off = api.on ? api.on('change', () => { if (list.isConnected) draw(); }) : null;
  return openPanel({ title: '棋子解鎖', body: [intro, el('div', { class: 'tt-ul-bar2' }, tabs, sum), list], cls: 'tt-wide tt-unlocks', onClose: () => { if (typeof off === 'function') off(); },
    footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')] });
}

// ---------- 快捷鍵 ----------
const KEY_ZH = { Space: '空白鍵', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'CapsLock', ShiftLeft: '左 Shift', ShiftRight: '右 Shift' };
export function codeLabel(code) {
  if (!code) return '未設定';
  if (KEY_ZH[code]) return KEY_ZH[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return '數字鍵 ' + m[1];
  if (code.startsWith('Numpad')) return '數字鍵 ' + code.slice(6);
  return code;
}
const FIXED_KEY = /^(Escape|Tab|Enter|NumpadEnter|F\d{1,2}|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right|OS.*)|OS(Left|Right)|ContextMenu)$/;
const HK_ACTIONS = [
  { id: 'reroll', zh: '重抽', phase: 'plan', official: true, def: 'KeyD' },
  { id: 'buyXp', zh: '購買經驗值', phase: 'plan', official: true, def: 'KeyF' },
  { id: 'sell', zh: '賣出（滑鼠下的棋子，沒有就賣已選取的）', phase: 'plan', official: true, def: 'KeyE' },
  { id: 'deploy', zh: '上場／回板凳（同上）', phase: 'plan', official: true, def: 'KeyW' },
  { id: 'fight', zh: '戰鬥', phase: 'plan', official: false, def: 'Space' },
  { id: 'speed', zh: '切換戰鬥速度', phase: 'battle', official: false, def: 'Space' },
  { id: 'skip', zh: '跳過戰鬥', phase: 'battle', official: false, def: null },
  ...[1, 2, 3, 4, 5].map(n => ({ id: 'buy' + n, zh: `買商店第 ${n} 格`, phase: 'plan', official: false, def: 'Digit' + n })),
  { id: 'unlocks', zh: '開解鎖說明', phase: 'any', official: false, def: null },
];
// 包 A 的 api.hotkeys 還沒接上時的備用（同介面、同儲存格式）
let fbHot = null;
function fallbackHotkeys() {
  if (fbHot) return fbHot;
  const KEY = 'trials19.keys';
  const map = Object.fromEntries(HK_ACTIONS.map(a => [a.id, a.def]));
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1 && o.map) for (const k of Object.keys(o.map)) if (k in map) map[k] = o.map[k]; } catch (_) { /* 用預設 */ }
  const subs = [];
  const save = () => { try { const diff = {}; for (const a of HK_ACTIONS) if (map[a.id] !== a.def) diff[a.id] = map[a.id]; localStorage.setItem(KEY, JSON.stringify({ v: 1, map: diff })); } catch (_) { /* 略過 */ } };
  const emit = () => subs.slice().forEach(f => f());
  const overlap = (a, b) => a.phase === b.phase || a.phase === 'any' || b.phase === 'any';
  fbHot = {
    ACTIONS: HK_ACTIONS, __fallback: true,
    get: (id) => map[id] ?? null,
    label: (id) => codeLabel(map[id]),
    actionFor: (code, phase) => (HK_ACTIONS.find(a => map[a.id] === code && (a.phase === phase || a.phase === 'any')) || {}).id ?? null,
    set(id, code) {
      const a = HK_ACTIONS.find(x => x.id === id); if (!a) return { ok: false };
      if (code) {
        if (FIXED_KEY.test(code)) return { ok: false, reason: '這個鍵不能用' };
        const c = HK_ACTIONS.find(b => b.id !== id && map[b.id] === code && overlap(a, b));
        if (c) return { ok: false, conflict: c.id };
      }
      map[id] = code || null; save(); emit(); return { ok: true };
    },
    reset() { for (const a of HK_ACTIONS) map[a.id] = a.def; save(); emit(); },
    onChange(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  };
  return fbHot;
}
export const hotkeysOf = (api) => (api && api.hotkeys) || fallbackHotkeys();

export function showHotkeys(api) {
  bindApi(api);
  const hk = hotkeysOf(api);
  const actions = hk.ACTIONS || HK_ACTIONS;
  const zhOfAct = (id) => (actions.find(a => a.id === id) || {}).zh || id;
  const PH = { plan: '佈陣時', battle: '戰鬥時', any: '隨時' };
  let recording = null, pending = null, note = '', displaced = new Set();
  const list = el('div', { class: 'tt-hk-list' });
  const msg = el('p', { class: 'tt-hk-msg', role: 'status', 'aria-live': 'polite' });
  const confirmBox = el('div', { class: 'tt-hk-confirm', hidden: true, role: 'alert' });

  const stopRec = () => { recording = null; window.removeEventListener('keydown', onKey, true); document.body.removeAttribute('data-tt-recording'); if (api.ui) api.ui.recording = false; };
  function draw() {
    list.replaceChildren(...actions.map(a => {
      const code = hk.get(a.id);
      const isRec = recording === a.id;
      const keyBtn = el('button', { type: 'button', class: 'tt-hk-key' + (isRec ? ' tt-rec' : '') + (!code ? ' tt-unset' : '') + (displaced.has(a.id) ? ' tt-warn' : ''), 'data-action': a.id,
        'aria-label': `${a.zh}：${isRec ? '請按一個鍵' : code ? codeLabel(code) : '未設定'}，按一下改鍵` }, isRec ? '請按一個鍵…（Esc 取消）' : codeLabel(code));
      keyBtn.addEventListener('click', () => startRec(a.id));
      const clr = el('button', { type: 'button', class: 'tt-hk-clear', 'data-clear': a.id, disabled: !code ? '' : null, 'aria-label': `清除 ${a.zh} 的快捷鍵` }, '清除');
      clr.addEventListener('click', () => { stopRec(); displaced.delete(a.id); hk.set(a.id, null); note = ''; refresh(); });
      return el('div', { class: 'tt-hk-row', 'data-row': a.id },
        el('span', { class: 'tt-hk-name' }, a.zh, ' ', el('small', {}, PH[a.phase] || ''), a.official ? badge('官方預設', 'tt-official') : null), keyBtn, clr);
    }));
    msg.textContent = note;
  }
  const refresh = () => { draw(); };
  function startRec(id) {
    stopRec(); pending = null; confirmBox.hidden = true; note = '';
    recording = id; document.body.setAttribute('data-tt-recording', '1'); if (api.ui) api.ui.recording = true;
    window.addEventListener('keydown', onKey, true);
    draw();
  }
  function onKey(e) {
    if (!recording) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') { stopRec(); draw(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || FIXED_KEY.test(e.code)) { note = '這個鍵不能用（Esc、Tab、Enter、F1–F12 和含 Ctrl／Alt／Meta 的組合都不行）。'; draw(); return; }
    const id = recording; const code = e.code;
    const r = hk.set(id, code);
    if (r && r.ok) { displaced.delete(id); stopRec(); note = ''; draw(); return; }
    if (r && r.conflict) {
      stopRec(); pending = { id, code, other: r.conflict };
      confirmBox.replaceChildren(el('p', {}, `${codeLabel(code)} 已經是「${zhOfAct(r.conflict)}」。要改給「${zhOfAct(id)}」嗎？「${zhOfAct(r.conflict)}」會變成未設定。`),
        el('div', { class: 'tt-hk-cbtns' },
          el('button', { type: 'button', class: 'tt-btn', 'data-tt': 'hk-swap', onclick: () => {
            const p = pending; pending = null; confirmBox.hidden = true;
            hk.set(p.other, null); const rr = hk.set(p.id, p.code);
            displaced.add(p.other); if (rr && rr.ok) displaced.delete(p.id);
            note = ''; draw();
          } }, '換過來'),
          el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'hk-cancel', onclick: () => { pending = null; confirmBox.hidden = true; } }, '取消')));
      confirmBox.hidden = false; draw();
      confirmBox.querySelector('button')?.focus();
      return;
    }
    note = '這個鍵不能用（Esc、Tab、Enter、F1–F12 和含 Ctrl／Alt／Meta 的組合都不行）。'; draw();
  }
  draw();
  const off = hk.onChange ? hk.onChange(() => { if (list.isConnected) draw(); api.emit && api.emit('change'); }) : null;
  // 音量
  const vol = el('div', { class: 'tt-hk-vol' });
  if (AU.getVolume && AU.setVolume) {
    const sl = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round((AU.getVolume() ?? 0.5) * 100)), 'aria-label': '音量' });
    const out = el('span', { class: 'tt-num' }, sl.value + '%');
    sl.addEventListener('input', () => { AU.setVolume(Number(sl.value) / 100); out.textContent = sl.value + '%'; });
    sl.addEventListener('change', () => sfx('buy'));
    vol.append(el('label', {}, '音量'), sl, out);
  }
  const reset = el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'hk-reset', onclick: () => { stopRec(); displaced = new Set(); pending = null; confirmBox.hidden = true; note = ''; hk.reset(); draw(); } }, '還原預設');
  return openPanel({ title: '快捷鍵設定', cls: 'tt-wide tt-hotkeys', onClose: () => { stopRec(); if (typeof off === 'function') off(); },
    body: [vol.children.length ? vol : null, el('p', { class: 'tt-desc tt-muted' }, '按一下鍵名，再按你想用的鍵。會記在這台裝置上。'), confirmBox, list, msg].filter(Boolean),
    footer: [reset, el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => closeAll() }, '關閉')] });
}

// ---------- 說明 ----------
export function showHelp(opts = {}) {
  const api = opts.api || curApi;
  const hk = hotkeysOf(api);
  const L = (id) => { try { return hk.label(id); } catch (_) { return '?'; } };
  const sec = (title, ...kids) => el('div', {}, el('h3', { class: 'tt-h' }, title), ...kids);
  const secD = (title, ...kids) => el('div', { class: 'tt-only-desktop' }, el('h3', { class: 'tt-h' }, title), ...kids);   // 手機沒有鍵盤，整段不顯示
  const body = [
    el('ol', { class: 'tt-ol' }, el('li', {}, '一共 30 回合，每 5 回合有一隻頭目（共 6 隻）。'), el('li', {}, '有 3 條命，輸一場扣 1 條，沒命就結束。'), el('li', {}, '沒有計時，準備好再按「戰鬥」。')),
    sec('操作',
      el('ul', { class: 'tt-ul-plain' },
        el('li', {}, '點商店卡就買；滑鼠停在卡片上會跳出技能說明（手機是長按，放開不會買）。'),
        el('li', {}, '點棋子是「選取」，右邊會出現資訊。點另一隻就改選，點空白處就取消。點棋子不會換位子。'),
        el('li', {}, '要換位子只能用拖的：拖到空格是移動，拖到有棋子的格子是兩隻交換，拖到商店就是賣掉。'),
        el('li', {}, '點裝備是看說明，要裝上去也是拖到棋子身上。右鍵跟左鍵一樣，是選取。'),
        el('li', {}, '裝備欄旁邊有兩種特殊道具：黃金卸除器（每局 1 個，拖到有裝備的棋子身上，把裝備全卸回裝備欄）、心鋼最愛（心鋼之聲 3 階給 1 個、5 階再給 1 個，拖到心鋼之聲成員身上就是選他強化技能，佈陣時可以從一位拖到另一位改選）。'),
        el('li', {}, '選增幅時，每一張下面都有自己的重抽鍵，按了只換那一張。'),
        el('li', {}, '用鍵盤的話：Tab 選到棋子按 Enter 是選取，上場、下場用 ' + L('deploy') + ' 鍵。場上換格子沒有鍵盤的做法，只能用滑鼠或手指拖。'))),
    secD('快捷鍵（桌機）', el('div', { class: 'tt-keys' },
      ...[[L('reroll'), '重抽'], [L('buyXp'), '購買經驗值'], [L('sell'), '賣出（滑鼠下的棋子，沒有就賣已選取的）'], [L('deploy'), '上場／回板凳'],
        [[1, 2, 3, 4, 5].map(n => L('buy' + n)).join(' '), '買商店第 1–5 格'],
        [L('fight') + '（戰鬥中：' + L('speed') + '）', '開戰；戰鬥中切換速度'], ['Esc', '關面板、取消選取']]
        .flatMap(([k, d]) => [el('kbd', {}, k), el('span', {}, d)])),
      api ? el('p', { class: 'tt-only-desktop' }, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'open-hotkeys', onclick: () => showHotkeys(api) }, '設定快捷鍵')) : null),
  ];
  if (api && unlockOn(api)) {
    const n = unlockEntries(api).length;
    body.push(sec('解鎖',
      el('p', { class: 'tt-desc', style: 'margin:0 0 8px' }, `這一季有 ${n} 隻棋子一開始是鎖住的，要先達成條件才會進商店。解鎖的那一下，下一次商店最右邊那格一定是它。每一局重新來過。`),
      el('p', { style: 'margin:0' }, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'open-unlocks', onclick: () => showUnlocks(api) }, '看每隻怎麼解鎖'))));
  }
  body.push(
    el('div', { class: 'tt-notice' }, '這是站上自己做的練習版，不是官方模式。S19 還沒上 PBE，棋子的血量攻擊、部分技能和羈絆數字是推測的，PBE 開了會更新。部分羈絆有簡化，點羈絆可以看本頁的做法。'),
    el('p', { class: 'muted', style: 'margin:0;font-size:var(--fs-s)' }, '名稱是暫譯，PBE 開了以後照官方繁中更新。'),
    el('p', { class: 'muted', style: 'margin:0;font-size:var(--fs-s)' }, '非官方重製｜數值為推測，PBE 後更新'),
    opts.onRestart ? el('div', {}, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'restart', onclick: (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '真的要重來？目前進度會不見，再按一次'; return; }
      closePanels(); opts.onRestart();
    } }, '重新開始')) : null);
  return openPanel({ title: '說明', body: body.filter(Boolean), footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { try { localStorage.setItem('trials19.helpSeen', '1'); } catch (_) {} closeAll(); } }, '知道了')], cls: opts.cls || '' });
}

// 首次進入自動跳說明（U1 的 layout 可在 mount 後呼叫一次）
export function maybeShowHelpFirst() {
  try { if (localStorage.getItem('trials19.helpSeen')) return null; } catch (_) {}
  if (!curApi) { setTimeout(() => { if (!hasPanel()) showHelp(); }, 0); return null; }
  return showHelp();
}

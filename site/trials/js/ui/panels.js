// 面板（SPEC 5.5／5.6／5.8）：羈絆、棋子、圖鑑、增幅三選一、獎勵、結算、結束、說明、頭目登場。
// 注意：本檔頂層不可使用 traitbar.js 的匯出（兩檔互相 import，只在函式執行時用）。
import { el, fmt, avatar, kindOf, traitZh, unitZh, isStars, ensureStyle, traitTags, boardUnits, playerTraits } from './traitbar.js';
import { countTraits, buildTeam } from '../stats.js';
import { sellValue } from '../shop.js';
import { sfx } from '../audio.js';

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
  if (!modal) ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeAll(); });
  const prev = stack[stack.length - 1]; if (prev) { prev.ov.hidden = true; }
  const rec = { ov, panel, opener, modal, onClose };
  stack.push(rec); document.body.append(ov);
  const first = panel.querySelector('[data-autofocus]') || panel.querySelector('.tt-opt,.tt-btn,button') || panel;
  if (first === panel) panel.tabIndex = -1;
  first.focus({ preventScroll: true });
  return rec;
}
function closeTop() {
  const r = stack.pop(); if (!r) return;
  r.ov.remove(); r.onClose?.();
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
    const b = el('button', { type: 'button', class: 'tt-member', 'aria-label': `${u.zh}，${u.cost} 費` + (w.board ? '，已在場上' : '') + (w.bench ? '，在板凳' : '') + (w.shop ? '，商店有' : '') },
      avatar(DATA, u.key, 40), el('span', {}, u.zh, el('small', {}, `${u.cost} 費`), marks.length ? el('small', {}, marks) : null));
    b.addEventListener('click', () => showUnitPanel(u.key, api));
    ml.append(el('li', {}, b));
  }
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, `成員（${mem.length}）`), ml));
  const titleNode = [traitZh(DATA, key), ' ', kindBadge(DATA, key), side === 'enemy' ? badge('敵方') : null];
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
function combatantFor(api, unit) {
  const { state, DATA } = api;
  const ctx = { level: state.level, round: state.round, augments: state.augments || [], persist: state.persist || {} };
  const board = boardUnits(state);
  const idx = unit.uid != null ? board.findIndex(u => u.uid === unit.uid) : -1;
  try {
    if (idx >= 0) {
      const team = buildTeam('player', board.map(u => ({ ...u, pos: u.pos || [3, 3] })), DATA, ctx);
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
      el('p', { class: 'tt-desc', style: 'margin:0' }, ab.desc || ''));
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
    const risky = star >= 3 || U.cost >= 7;
    const b = el('button', { type: 'button', class: 'tt-btn tt-ghost' }, `賣出 +${price} 金`);
    let armed = false;
    b.addEventListener('click', () => {
      if (risky && !armed) { armed = true; b.textContent = `確定要賣掉 ${star}★ ${U.zh}？再按一次`; return; }
      api.act('sell', unit.uid); closePanels();
    });
    footer.push(b);
  }
  footer.push(el('button', { type: 'button', class: 'tt-btn', onclick: () => closeAll() }, '關閉'));
  return openPanel({ title: U.zh, body, footer, cls: 'tt-unit-panel' });
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
        el('span', { class: 'tt-cn' }, t.zh, el('small', {}, (t.breakpoints || []).join(' ▸ ')), (t.simplified ? badge('簡化', 'tt-simp') : null), (t.guess ? badge('推測', 'tt-guess') : null)),
        el('span', { class: 'tt-cd' }, t.desc || ''),
        el('span', { class: 'tt-cm' }, mems.map(u => avatar(DATA, u.key, 26))));
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
  const rec = { cur: null };
  const render = (p) => {
    const row = el('div', { class: 'tt-opts' });
    p.options.forEach((o, i) => {
      const A = DATA.augments.byKey[typeof o === 'string' ? o : o.key]; if (!A) return;
      const icon = el('span', { class: 'tt-augi', 'aria-hidden': 'true' });
      icon.style.backgroundImage = 'url("../icons/aug-sprite.webp")'; icon.style.backgroundSize = '2000% 1300%';
      icon.style.backgroundPosition = `${(A.sp % 20) * 100 / 19}% ${Math.floor(A.sp / 20) * 100 / 12}%`;
      const b = el('button', { type: 'button', class: 'tt-opt', 'data-tier': A.tier, 'data-autofocus': i === 0 ? '' : null },
        el('span', { class: 'tt-opt-head' }, icon, el('span', {}, el('span', { class: 'tt-tl' }, ['', '銀色', '金色', '彩色'][A.tier] || ''), el('div', { class: 'tt-on' }, A.zh))),
        el('span', {}, A.desc), A.guess ? el('span', {}, badge('推測數值', 'tt-guess')) : null);
      b.addEventListener('click', () => { sfx('pick'); closePanels(); api.act('pickAugment', i); });
      row.append(b);
    });
    return row;
  };
  const tier = DATA.augments.byKey[typeof pending.options[0] === 'string' ? pending.options[0] : pending.options[0]?.key]?.tier;
  const holder = el('div', {});
  holder.append(render(pending));
  const footer = [];
  // game.js 的欄位叫 rerolls（剩幾次免費重抽）；重抽後由 layout 依新的 pendingChoices 重開面板
  if ((pending.rerolls ?? pending.rerollLeft ?? 0) > 0) footer.push(el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'aug-reroll', onclick: () => {
    closePanels(); api.act('rerollAugment');
  } }, '免費重抽（三格一起換，一次）'));
  return openPanel({ title: `選一個增幅${tier ? '（' + ['', '銀', '金', '彩'][tier] + '）' : ''}`, body: [el('p', { class: 'tt-desc', style: 'color:var(--muted);font-size:var(--fs-s)' }, '三選一，選了會顯示在狀態列。'), holder], footer: footer.length ? footer : null, modal: true, cls: 'tt-wide' });
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
  return [traitZh(DATA, key), parts.join('、') || '—'];
}
// info = {result, enemy, finish, onNext}；finish = actFinishBattle 的回傳 {roundScore, gains[], gameOver?, cleared?, scoreParts?[]}
export function showResult(api, info) {
  const { DATA, state } = api; const { result, enemy, finish = {} } = info;
  const win = result.winner === 'player';
  const body = [];   // 勝敗音效由 battle.js 在 end 事件播
  body.push(el('div', { class: 'tt-resbig ' + (win ? 'tt-win' : 'tt-lose') }, win ? '勝利' : '落敗',
    el('small', {}, `${enemy?.name ? 'VS ' + enemy.name + '，' : ''}${Math.round(result.seconds)} 秒，我方存活 ${result.summary.playerAlive} 隻`)));
  if (!win) body.push(el('p', { class: 'tt-desc' }, `扣 1 條命，剩 ${state.lives} 條。敵方還剩 ${Math.round((result.summary.enemyHpPctLeft ?? 0) * 100)}% 血。`));
  // 得分
  const sc = el('ul', { class: 'tt-kv' });
  for (const p of (finish.scoreParts || [])) sc.append(el('li', {}, el('span', {}, p.label), el('b', {}, '+' + fmt(p.value))));
  sc.append(el('li', {}, el('span', {}, '本回合得分'), el('b', {}, '+' + fmt(finish.roundScore ?? 0))));
  if (finish.endBonus) sc.append(el('li', {}, el('span', {}, finish.cleared ? '通關加分（通關、剩下的命、剩下的金錢）' : '剩下的金錢加分'), el('b', {}, '+' + fmt(finish.endBonus))));
  sc.append(el('li', {}, el('span', {}, '累計分數'), el('b', {}, fmt(state.score ?? 0))));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '得分'), sc));
  // 收入
  const gains = finish.gains || [];   // 戰鬥中的經濟效果（summary.rewards）已由 game.js 併進 gains
  const gl = el('ul', { class: 'tt-kv' });
  gains.forEach((g, i) => { const [a, b] = gainText(DATA, g); const li = el('li', {}, el('span', {}, a), el('b', {}, b)); gl.append(li); if (g.gold) setTimeout(() => sfx('coin'), 150 * i); });
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
  const next = el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); info.onNext?.(); } }, finish.gameOver || finish.cleared ? '看結果' : '下一回合');
  return openPanel({ title: `第 ${info.round ?? state.history?.slice(-1)[0]?.round ?? state.round} 回合結算`, body, footer: [next], modal: true, cls: 'tt-wide tt-result' });
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
  for (const t of traits) chips.append(el('span', { class: 'tt-chip', 'data-kind': kindOf(DATA, t.key) }, `${traitZh(DATA, t.key)} 第 ${t.tier} 階`));
  if (!traits.length) chips.append(el('span', { class: 'muted' }, '這場沒有啟動過羈絆。'));
  body.push(el('div', {}, el('h3', { class: 'tt-h' }, '這場啟動過的羈絆（最高階）'), chips));
  const footer = [el('a', { class: 'tt-btn tt-ghost', href: '../?s=19' }, '回攻略站'),
    el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { closePanels(); api.act('restart'); } }, '再玩一次')];
  return openPanel({ title: info.cleared ? '通關了' : '遊戲結束', body, footer, modal: true });
}

// ---------- 說明 ----------
export function showHelp(opts = {}) {
  const body = [
    el('ol', { class: 'tt-ol' }, el('li', {}, '一共 30 回合，每 5 回合有一隻頭目（共 6 隻）。'), el('li', {}, '有 3 條命，輸一場扣 1 條，沒命就結束。'), el('li', {}, '沒有計時，準備好再按「開戰」。')),
    el('div', {}, el('h3', { class: 'tt-h' }, '操作'), el('p', { class: 'tt-desc', style: 'margin:0' }, '點商店卡就買。點棋子選取，再點空格移動、點另一隻交換。也可以拖曳。點裝備再點棋子就裝上。點羈絆看說明。')),
    el('div', {}, el('h3', { class: 'tt-h' }, '快捷鍵（桌機）'), el('div', { class: 'tt-keys' },
      ...[['D', '刷新商店'], ['F', '買經驗'], ['E', '賣出（滑鼠下的棋子，沒有就賣已選取的）'], ['W', '場上 ↔ 板凳'], ['1–5', '買商店第 n 格'], ['Space', '開戰；戰鬥中切換速度'], ['Esc', '關面板']]
        .flatMap(([k, d]) => [el('kbd', {}, k), el('span', {}, d)]))),
    el('div', { class: 'tt-notice' }, '這是站上自己做的練習版，不是官方模式。S19 還沒上 PBE，棋子的血量攻擊、部分技能和羈絆數字是推測的，PBE 開了會更新。部分羈絆有簡化，點羈絆可以看本頁的做法。'),
    el('p', { class: 'muted', style: 'margin:0;font-size:var(--fs-s)' }, '名稱是暫譯，PBE 開了以後照官方繁中更新。'),
    el('p', { class: 'muted', style: 'margin:0;font-size:var(--fs-s)' }, '非官方重製｜數值為推測，PBE 後更新'),
    opts.onRestart ? el('div', {}, el('button', { type: 'button', class: 'tt-btn tt-ghost', 'data-tt': 'restart', onclick: (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '真的要重來？目前進度會不見，再按一次'; return; }
      closePanels(); opts.onRestart();
    } }, '重新開始')) : null,
  ].filter(Boolean);
  return openPanel({ title: '說明', body, footer: [el('button', { type: 'button', class: 'tt-btn', 'data-autofocus': '', onclick: () => { try { localStorage.setItem('trials19.helpSeen', '1'); } catch (_) {} closeAll(); } }, '知道了')], cls: opts.cls || '' });
}
// 首次進入自動跳說明（U1 的 layout 可在 mount 後呼叫一次）
export function maybeShowHelpFirst() {
  try { if (localStorage.getItem('trials19.helpSeen')) return null; } catch (_) {}
  return showHelp();
}

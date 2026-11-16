// 邊玩邊學的畫面：任務卡、關卡列、棋盤／商店（重用試煉的 board／shopbar／dnd／battle／tooltip／traitbar）、結果卡、完成卡。
// 操作：拖曳（沿用 dnd.js）＋點選（點一隻選起來，再點空格放過去、點另一隻互換、點裝備再點棋子裝上去）。
import { renderBoard, renderBench, renderItems, el, zhOf, costOf, styleAvatar, starsEl, itemZh } from '../../trials/js/ui/board.js';
import { renderShop, renderHud } from '../../trials/js/ui/shopbar.js';
import { renderTraits, renderEnemyTraits, traitIcon, traitZh } from '../../trials/js/ui/traitbar.js';
import { enableDnd } from '../../trials/js/ui/dnd.js';
import { bindTips, showTip, hideTip } from '../../trials/js/ui/tooltip.js';
import { playBattle, setBattleSpeed } from '../../trials/js/ui/battle.js';
import * as PN from '../../trials/js/ui/panels.js';
import { countTraits } from '../../trials/js/stats.js';
import * as G from '../../trials/js/game.js';
import { enemyForRound } from '../../trials/js/enemies.js';
import * as audio from '../../trials/js/audio.js';
import { sellValue } from '../../trials/js/shop.js';
import { Session, recapLines } from './lesson.js';

const KEY = 'choko.learn.v1';
const SFX = { buy: 'buy', sell: 'sell', reroll: 'reroll', buyXp: 'xp', move: 'place', equip: 'equip', startBattle: 'start' };
const NOUN = { carry: '輸出', tank: '坦' };

// ---------- 進度（localStorage，跟主站共用；存不了就只在這個畫面記著）----------
export function makeStore(storage) {
  let mem = null;
  const fresh = () => ({ v: 1, play: { done: [], last: null }, lab: { done: [], picks: {} } });
  const read = () => {
    try {
      const raw = storage && storage.getItem(KEY);
      const j = raw ? JSON.parse(raw) : null;
      if (j && j.v === 1) return j;
    } catch (_) { /* 讀不到就當沒有 */ }
    return mem || fresh();
  };
  return {
    get() { const j = read(); j.play = j.play || { done: [], last: null }; j.play.done = j.play.done || []; return j; },
    set(j) { mem = j; try { storage.setItem(KEY, JSON.stringify(j)); } catch (_) { /* 滿了或被擋：照玩，只是不記進度 */ } },
  };
}

const randomSeed = () => { const a = new Uint32Array(1); (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = 12345); return a[0] || 1; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function mountApp(root, LD, store, { backHref = '../#learn', search = '' } = {}) {
  const lessons = LD.lessons;
  let S = null, lesson = null, sel = null, busy = false, hintN = 0, sheet = null, abort = null, pulseT = 0, shownFirst = false, folded = false, speed = 2;
  const ui = { mode: 'plan', sel: null };
  const L = {};   // 事件

  const api = {
    get DATA() { return S.DATA; }, get state() { return S.state; }, ui,
    picks: () => ({ prod: { active: [], trait: null } }), countTraits: (u, D, o) => countTraits(u, D, o), traitOpts: () => ({ augments: [] }),
    teamLimit: () => S.popMax(), popUsed: () => S.popUsed(), popMax: () => S.popMax(),
    enemy: () => enemyForRound(S.state.round, S.state.seed, S.DATA),
    on(evt, fn) { (L[evt] = L[evt] || []).push(fn); return () => { L[evt] = (L[evt] || []).filter(f => f !== fn); }; },
    off(evt, fn) { L[evt] = (L[evt] || []).filter(f => f !== fn); },
    emit(evt, p) { for (const f of (L[evt] || []).slice()) f(p); },
    sfx(n) { try { audio.sfx(n); } catch (_) { /* 音效壞了照玩 */ } },
    toast(m) { toast(m); },
    act(name, ...args) { return act(name, ...args); },
  };
  PN.bindApi(api);

  // ---------- 骨架 ----------
  root.replaceChildren();
  const app = el('div', 'tt-shell lr-shell', { 'data-phase': 'plan' });
  app.innerHTML = `
    <header class="tt-top"><div class="tt-top-in">
      <a class="tt-link lr-back" href="${backHref}" aria-label="回新手教學">← 新手教學</a>
      <h1>邊玩邊學</h1>
      <span class="lr-prog tt-num" aria-live="polite"></span>
      <button class="tt-ibtn lr-mute" type="button" data-act="mute" aria-pressed="false">音效</button>
    </div></header>
    <main class="tt-app lr-app">
      <div class="lr-main">
        <nav class="lr-list" aria-label="關卡列"></nav>
        <aside class="lr-side">
          <section class="lr-mission" aria-label="本關任務"></section>
          <div class="tt-traits lr-traits" data-tt-mount="traits"></div>
        </aside>
        <div class="lr-stage">
          <div class="tt-enemybar lr-enemybar"></div>
          <div class="tt-board" aria-label="棋盤"></div>
          <div class="lr-selbar" hidden></div>
          <div class="tt-bench" aria-label="板凳"></div>
          <div class="tt-xitems lr-items" aria-label="裝備欄"></div>
          <div class="lr-status">
            <div class="tt-hud"></div>
            <div class="lr-oddsrow"></div>
            <div class="lr-extras"></div>
          </div>
          <div class="tt-xshop" data-tt-drop-zone></div>
          <button class="tt-go" type="button" data-act="go" data-tt-noclear><span>開戰</span><kbd class="tt-hk" aria-hidden="true"></kbd></button>
          <div class="tt-battlebar lr-battlebar">
            <div class="tt-speed" role="group" aria-label="戰鬥速度"></div>
          </div>
        </div>
      </div>
      <div class="lr-toast tt-toast" role="status" aria-live="polite"></div>
    </main>
    <footer class="tt-foot" id="tt-foot"><p>這是教學用的簡化版：牌只有 14 隻、羈絆只做 4 個、技能跟數字有簡化，跟正式對局不完全一樣。非官方，本站與 Riot Games 無關；遊戲名稱、素材與音效屬於其權利人。</p></footer>`;
  root.append(app);
  const $ = (s) => app.querySelector(s);
  const R = { list: $('.lr-list'), mission: $('.lr-mission'), traits: $('.lr-traits'), enemy: $('.lr-enemybar'), board: $('.tt-board'), bench: $('.tt-bench'),
    items: $('.lr-items'), hud: $('.tt-hud'), odds: $('.lr-oddsrow'), extras: $('.lr-extras'), shop: $('.tt-xshop'), go: $('.tt-go'), speed: $('.tt-speed'),
    selbar: $('.lr-selbar'), toast: $('.lr-toast'), prog: $('.lr-prog'), mute: $('.lr-mute') };
  bindTips(document.body, api);

  // ---------- 小工具 ----------
  let toastT = 0;
  function toast(msg) { R.toast.textContent = msg; R.toast.classList.add('tt-xon'); clearTimeout(toastT); toastT = setTimeout(() => R.toast.classList.remove('tt-xon'), 2400); }
  const modalOpen = () => !!document.querySelector('.lr-sheet-back, .tt-fbmodal, .tt-panel-back, [role=dialog]');
  const doneSet = () => new Set(store.get().play.done);
  const unitByUid = (uid) => [...S.state.board, ...S.state.bench].filter(Boolean).find(u => u.uid === uid);
  const parse = (d) => {
    if (!d) return null;
    const [k, rest] = String(d).split(':');
    if (k === 'board') { const [r, c] = (rest || '').split(',').map(Number); return { k, r, c }; }
    if (k === 'bench' || k === 'shop' || k === 'item') return { k, i: Number(rest) };
    if (k === 'enemy') return { k, key: rest };
    return { k };
  };
  const unitAt = (d) => (d.k === 'board' ? S.state.board.find(u => u.pos && u.pos[0] === d.r && u.pos[1] === d.c) : d.k === 'bench' ? S.state.bench[d.i] : null);
  const clearPulse = () => { clearTimeout(pulseT); for (const n of app.querySelectorAll('.lr-pulse')) n.classList.remove('lr-pulse'); };

  // ---------- 關卡列 ----------
  function renderList() {
    const done = doneSet();
    R.list.replaceChildren(...lessons.map(l => {
      const b = el('button', 'lr-li' + (l.id === lesson.id ? ' lr-cur' : '') + (done.has(l.id) ? ' lr-done' : ''), { type: 'button', 'data-lesson': l.id, 'aria-label': `第 ${l.n} 關 ${l.title}` + (done.has(l.id) ? '，已過關' : ''), 'aria-current': l.id === lesson.id ? 'step' : null },
        el('i', 'lr-no tt-num', {}, done.has(l.id) ? '✓' : l.n), el('span', 'lr-name', {}, l.title));
      b.addEventListener('click', () => openLesson(l.id));
      return b;
    }));
    R.prog.textContent = `${done.size} / ${lessons.length} 關`;
    const cur = R.list.querySelector('.lr-cur');
    if (cur && cur.scrollIntoView && R.list.scrollWidth > R.list.clientWidth) { try { R.list.scrollLeft = cur.offsetLeft - 8; } catch (_) { /* 略過 */ } }
  }

  // ---------- 任務卡 ----------
  function hintsOf() {
    const h = lesson.hints.slice();
    if (lesson.setup.routeChoice && S.route === 'level' && h.length > 1) { const t = h[0]; h[0] = h[1]; h[1] = t; }
    return h;
  }
  function renderMission() {
    const done = doneSet().has(lesson.id);
    const checks = S.checks();
    const note = S.notice();
    const hints = hintsOf();
    const shown = hints.slice(0, hintN);
    const fold = el('button', 'lr-fold', { type: 'button', 'aria-expanded': String(!folded), 'aria-label': folded ? '展開任務卡' : '收合任務卡' }, folded ? '展開' : '收合');
    fold.addEventListener('click', () => { folded = !folded; renderMission(); });
    const btnHint = el('button', 'tt-xbtn lr-hintbtn', { type: 'button', disabled: hintN >= hints.length ? true : null }, hintN >= hints.length ? '提示都給完了' : `看提示（${hintN}/${hints.length}）`);
    btnHint.addEventListener('click', () => { hintN = Math.min(hints.length, hintN + 1); renderMission(); });
    const btnReset = el('button', 'tt-xbtn lr-resetbtn', { type: 'button' }, '重來這關');
    btnReset.addEventListener('click', () => openLesson(lesson.id));
    const body = el('div', 'lr-body', {},
      el('p', 'lr-intro', {}, lesson.intro),
      el('ul', 'lr-checks', { 'aria-label': '過關條件' }, ...checks.map(c => el('li', c.done ? 'lr-ok' : '', {}, el('i', '', { 'aria-hidden': 'true' }, c.done ? '☑' : '☐'), c.label, c.done ? el('span', 'tt-sr', {}, '（達成）') : null))),
      shown.length ? el('ol', 'lr-hints', { 'aria-label': '提示' }, ...shown.map(t => el('li', '', {}, t))) : null,
      el('div', 'lr-actions', {}, btnHint, btnReset));
    R.mission.classList.toggle('lr-folded', folded);
    R.mission.replaceChildren(...[
      el('div', 'lr-mhead', {}, el('span', 'lr-badge', {}, `第 ${lesson.n} 關｜${lesson.topic}`), done ? el('span', 'lr-passed', {}, '已過關') : null, fold),
      el('h2', 'lr-title', {}, lesson.title),
      el('p', 'lr-task', {}, el('b', '', {}, lesson.task)),
      body,
      note ? el('p', 'lr-notice' + (note.kind === 'fail' ? ' lr-fail' : ''), { role: 'alert' }, note.msg) : null].filter(Boolean));
  }

  // ---------- 狀態列／棋盤／商店 ----------
  function renderStatus() {
    const st = S.setup, s = S.state;
    renderHud(R.hud, api);
    const odds = R.hud.querySelector('.tt-hud-odds');
    if (odds) { if (st.showOdds) R.odds.replaceChildren(odds); else odds.remove(); } else R.odds.replaceChildren();
    const streak = R.hud.querySelector('.tt-hud-streak');
    if (streak && !st.showStreak) streak.remove();
    const gold = R.hud.querySelector('.tt-hud-gold');
    const ex = [];
    if (st.showInterest && gold) {
      const r = S.DATA.rules, n = Math.min(Math.floor(s.gold / r.income.interestPer), r.income.interestCap);
      ex.push(el('span', 'lr-chip lr-interest', { 'data-tt-tip': 'text:每回合結束，身上每 10 金多 1 金，最多 5 金。' }, `這回合利息 +${n}`));
    }
    if (S.hp !== 100 || st.showHp) ex.push(el('span', 'lr-chip lr-hp' + (S.hp <= 15 ? ' lr-low' : ''), { 'aria-label': `血量 ${S.hp}` }, `血量 ${Math.max(0, S.hp)}`));
    if (S.rounds > 1) ex.push(el('span', 'lr-chip lr-round', {}, `第 ${Math.min(S.stats.battles + 1, S.rounds)} 場／共 ${S.rounds} 場`));
    if (st.rivals) {
      const b = el('button', 'tt-xbtn lr-scoutbtn', { type: 'button', 'data-tt-noclear': '' }, '看對手');
      b.addEventListener('click', openRivals);
      ex.push(b);
    }
    R.extras.replaceChildren(...ex);
  }
  function renderShopHost() {
    const st = S.setup;
    R.shop.hidden = S.shopOff();
    if (S.shopOff()) { R.shop.replaceChildren(); return; }
    renderShop(R.shop, api);
    const xp = R.shop.querySelector('.tt-xpbtn'), rr = R.shop.querySelector('.tt-rrbtn');
    if (xp && S.buyXpOff()) { xp.classList.add('tt-poor'); xp.setAttribute('aria-disabled', 'true'); }
    if (rr && S.rerollOff()) { rr.classList.add('tt-poor'); rr.setAttribute('aria-disabled', 'true'); }
    if (st.showPoolLeft) {
      for (const c of R.shop.querySelectorAll('.tt-card[data-tt-unit]')) c.append(el('span', 'lr-poolleft', {}, `池子剩 ${S.poolLeft(c.dataset.ttUnit)}`));
    }
  }
  const tipUnits = () => {
    for (const n of app.querySelectorAll('.tt-unit[data-tt-unit]')) n.setAttribute('data-tt-tip', `ability:${n.dataset.ttUnit}:${n.dataset.ttStar || 1}`);
  };
  function renderEnemyBar(enemy) {
    const e = enemy || api.enemy();
    const mount = el('span', 'tt-emount', { 'data-tt-enemy': '' });
    R.enemy.replaceChildren(el('span', 'tt-ename', {}, el('small', '', {}, '對手'), e.name || '對手'), ...(e.boss ? [el('span', 'tt-bossbadge', {}, '頭目')] : []), mount);
    return e;
  }
  function renderTraitsMount(e) {
    const s = S.state;
    const tp = countTraits(s.board.filter(Boolean), S.DATA, {});
    const te = e.traitsPreview || [];
    renderTraits(R.traits, tp, te, api);
  }
  function renderSelbar() {
    const u = sel && sel.kind === 'unit' ? unitByUid(sel.uid) : null;
    if (sel && sel.kind === 'item') {
      R.selbar.hidden = false;
      R.selbar.replaceChildren(el('span', '', {}, `選了「${itemZh(S.DATA, S.state.itemBench[sel.idx])}」，點要裝的棋子`));
      return;
    }
    if (!u) { R.selbar.hidden = true; R.selbar.replaceChildren(); return; }
    R.selbar.hidden = false;
    const on = !!u.pos;
    const sellB = el('button', 'tt-xbtn lr-sellbtn', { type: 'button', 'data-tt-noclear': '' }, `賣掉 +${sellValue(u, S.DATA)} 金`);
    sellB.addEventListener('click', () => { const id = u.uid; sel = null; ui.sel = null; act('sell', id); });
    const moveB = el('button', 'tt-xbtn lr-movebtn', { type: 'button', 'data-tt-noclear': '' }, on ? '放回板凳' : '上場');
    moveB.addEventListener('click', () => {
      if (on) { const i = S.state.bench.indexOf(null); if (i < 0) return toast('板凳滿了'); sel = null; ui.sel = null; act('move', u.uid, { zone: 'bench', idx: i }); }
      else { const to = defaultCell(u); if (!to) return toast('場上沒有空格了'); sel = null; ui.sel = null; act('move', u.uid, to); }
    });
    R.selbar.replaceChildren(el('span', 'lr-seltxt', {}, `${zhOf(S.DATA, u.key)} ${u.star} 星`), moveB, sellB);
  }
  function defaultCell(u) {
    const tank = (S.DATA.units.byKey[u.key] || {}).lr === 'tank';
    const rows = tank ? [0, 1, 2, 3] : [3, 2, 1, 0];
    for (const r of rows) for (const c of [3, 2, 4, 1, 5, 0, 6]) if (!S.state.board.some(x => x.pos[0] === r && x.pos[1] === c)) return { zone: 'board', pos: [r, c] };
    return null;
  }

  function render() {
    if (!S) return;
    if (sel && sel.kind === 'unit' && !unitByUid(sel.uid)) sel = null;
    if (sel && sel.kind === 'item' && !S.state.itemBench[sel.idx]) sel = null;
    ui.sel = sel;
    renderList(); renderMission();
    if (ui.mode === 'battle') return;
    const e = renderEnemyBar();
    renderTraitsMount(e);
    renderBoard(R.board, api, { mode: 'plan', enemy: e });
    renderBench(R.bench, api);
    renderItems(R.items, api);
    R.items.hidden = !(S.state.itemBench.length || S.setup.items);
    renderStatus(); renderShopHost(); renderSelbar(); tipUnits();
    R.go.classList.toggle('lr-blocked', !!(S.notice() && S.notice().block));
    R.go.disabled = busy;
  }

  // ---------- 動作 ----------
  function act(name, ...args) {
    if (busy || ui.mode !== 'plan') return { ok: false };
    const r = S.act(name, ...args);
    if (!r || !r.ok) {
      toast(reasonText(r && r.reason));
      api.sfx('error'); render();
      return r;
    }
    clearPulse();
    const evs = r.events || [];
    for (const m of r.merged || []) if (!evs.some(e => e.type === 'merge' && e.key === m.key && e.star === m.star)) evs.push({ type: 'merge', key: m.key, star: m.star });
    let played = false;
    for (const ev of evs) {
      api.emit(ev.type, ev);
      if (ev.type === 'merge') { api.sfx(ev.star >= 3 ? 'star3' : 'star2'); played = true; }
      else if (ev.type === 'levelup') { api.sfx('levelup'); played = true; }
    }
    if (!played && SFX[name]) api.sfx(SFX[name]);
    render();
    afterChange();
    return r;
  }
  const REASONS = { gold: '金錢不夠', benchFull: '板凳滿了' };
  const reasonText = (r) => (r && /[一-鿿]/.test(r) ? r : REASONS[r] || '這個動作現在做不到');

  function afterChange() {
    if (S.passed && !passedShown) { passedShown = true; onPassed(null); }
    else armPulse();
  }
  let passedShown = false;

  function onPassed(fin) {
    const j = store.get();
    if (!j.play.done.includes(lesson.id)) j.play.done.push(lesson.id);
    j.play.last = lesson.id;
    store.set(j);
    renderList(); renderMission();
    api.sfx('star3');
    setTimeout(() => openDone(fin), fin ? 350 : 250);
  }

  // ---------- 開戰 ----------
  async function go() {
    if (busy || ui.mode !== 'plan' || modalOpen()) return;
    clearPulse(); hideTip();
    if (!S.state.board.some(Boolean) && lesson.id !== 'streak') { toast('場上還沒放棋子，先放一隻再開戰'); api.sfx('error'); return; }
    const r = S.go();
    if (!r || !r.ok) { toast(reasonText(r && r.reason)); api.sfx('error'); render(); return; }
    busy = true; ui.mode = 'battle'; sel = null; ui.sel = null;
    app.dataset.phase = 'battle'; api.sfx('start');
    const e = renderEnemyBar(r.enemy);
    renderEnemyTraits(R.enemy.querySelector('[data-tt-enemy]'), r.enemy.traitsPreview || [], api);
    renderBoard(R.board, api, { mode: 'battle' });
    renderSpeed();
    try { R.board.scrollIntoView({ block: 'nearest' }); } catch (_) { /* 略過 */ }
    abort = new AbortController();
    try {
      await playBattle(R.board.__field, r.result, { speed, skip: abort.signal, spriteIndex: (k) => S.DATA.units.sprite.map[k], spriteUrl: S.DATA.units.sprite.src });
    } catch (err) { console.error(err); }
    abort = null;
    const fin = S.finish();
    busy = false; ui.mode = 'plan'; app.dataset.phase = 'plan';
    render();
    const justPassed = S.passed && !passedShown;
    if (justPassed) { passedShown = true; showResult(fin, true); onPassed(fin); }
    else showResult(fin, false);
  }
  function renderSpeed() {
    const mk = (n) => { const b = el('button', 'tt-xbtn', { type: 'button', 'aria-pressed': String(speed === n), 'data-tt-noclear': '' }, `×${n}`); b.addEventListener('click', () => { speed = n; setBattleSpeed(n); renderSpeed(); }); return b; };
    const skip = el('button', 'tt-xbtn lr-skip', { type: 'button', 'data-tt-noclear': '' }, '跳過');
    skip.addEventListener('click', () => { if (abort) abort.abort(); });
    R.speed.replaceChildren(mk(1), mk(2), mk(4), skip);
  }

  // ---------- 彈窗（✕ 固定在最上面）----------
  function closeSheet() { if (sheet) { sheet.back.remove(); const cb = sheet.onClose; sheet = null; if (cb) cb(); } }
  function openSheet({ title, nodes, cls = '', onClose = null, closable = true }) {
    closeSheet(); hideTip();
    const x = closable ? el('button', 'lr-x', { type: 'button', 'aria-label': '關閉' }, '✕') : null;
    if (x) x.addEventListener('click', closeSheet);
    const card = el('div', 'lr-sheet ' + cls, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', 'lr-sheet-top', {}, el('h2', '', {}, title), x), el('div', 'lr-sheet-body', {}, ...nodes));
    const back = el('div', 'lr-sheet-back', {}, card);
    back.addEventListener('pointerdown', (ev) => { if (closable && ev.target === back) closeSheet(); });
    document.body.append(back);
    sheet = { back, onClose };
    const f = card.querySelector('button.lr-primary, .lr-sheet-body button'); if (f) f.focus({ preventScroll: true });
    return card;
  }
  const btn = (label, fn, cls = '') => { const b = el('button', 'tt-xbtn ' + cls, { type: 'button' }, label); b.addEventListener('click', fn); return b; };
  const link = (label, href, cls = '') => el('a', 'tt-xbtn lr-linkbtn ' + cls, { href }, label);

  function showResult(fin, willShowDone) {
    if (!fin || fin.ok === false) return;
    const dead = S.dead();
    const rows = [];
    rows.push(el('p', 'lr-rsum', {}, `我方剩 ${fin.alive.length} 隻，對面剩 ${fin.enemyAlive} 隻。`));
    if (S.hp !== 100 || S.setup.showHp) rows.push(el('p', 'lr-rhp', {}, fin.win ? `血量沒扣，還有 ${Math.max(0, S.hp)}。` : `輸一場扣 ${fin.hpLoss} 血，剩 ${Math.max(0, S.hp)}。`));
    if (S.setup.showIncome) {
      const gold = (fin.gains || []).filter(g => g.gold);
      rows.push(el('table', 'lr-income', { 'aria-label': '這回合收入' }, el('caption', '', {}, '這回合收入'),
        ...gold.map(g => el('tr', '', {}, el('td', '', {}, g.label), el('td', 'tt-num', {}, `+${g.gold}`))),
        el('tr', 'lr-sum', {}, el('td', '', {}, '身上現在'), el('td', 'tt-num', {}, `${S.state.gold} 金`))));
    }
    if (!S.passed) {
      const left = S.checks().filter(c => !c.done);
      if (left.length && !dead) rows.push(el('p', 'lr-rleft', {}, '還差：' + left.map(c => c.label).join('、')));
    }
    const note = S.notice();
    if (note && !S.passed) rows.push(el('p', 'lr-notice lr-fail', { role: 'alert' }, note.msg));
    const acts = [];
    if (S.passed) { /* 完成卡會接著跳 */ }
    else if (dead) acts.push(btn('重來這關', () => { closeSheet(); openLesson(lesson.id); }, 'lr-primary'));
    else {
      const more = S.rounds > 1 && S.stats.battles < S.rounds;
      if (more) acts.push(btn('下一回合', closeSheet, 'lr-primary'));
      if (S.canRetry && S.snapshot) acts.push(btn('再排一次', () => { closeSheet(); S.retry(); passedShown = false; render(); toast('回到開打前，重新排一次'); }, more ? '' : 'lr-primary'));
      if (!more) acts.push(btn('重來這關', () => { closeSheet(); openLesson(lesson.id); }));
    }
    if (S.passed) return;   // 過關時直接跳完成卡，不先跳結果卡
    openSheet({ title: fin.win ? '這場贏了' : '這場輸了', nodes: [...rows, el('div', 'lr-sheet-acts', {}, ...acts)], cls: fin.win ? 'lr-win' : 'lr-lose' });
  }

  function openDone(fin) {
    const n = lesson.n, last = n >= lessons.length;
    const nodes = [];
    if (fin) nodes.push(el('p', 'lr-rsum', {}, `${fin.win ? '這場贏了' : '這場輸了'}：我方剩 ${fin.alive.length} 隻，對面剩 ${fin.enemyAlive} 隻。`));
    nodes.push(el('p', 'lr-donetext', {}, lesson.done));
    const rc = recapLines(S, routeLabel());
    if (rc.length) nodes.push(el('ul', 'lr-recap', {}, ...rc.map(t => el('li', '', {}, t))));
    const acts = [];
    if (!last) acts.push(btn('下一關 →', () => { closeSheet(); openLesson(lessons[n].id); }, 'lr-primary'));
    else {
      acts.push(link('去決策實驗室 →', '../' + search + '#learn-lab', 'lr-primary'));
      acts.push(link('想繼續玩：滴答克的試煉 →', '../trials/'));
    }
    acts.push(btn('再玩一次', () => { closeSheet(); openLesson(lesson.id); }));
    openSheet({ title: '過關！', nodes: [...nodes, el('div', 'lr-sheet-acts', {}, ...acts)], cls: 'lr-donecard' });
  }
  const routeLabel = () => { const rc = (lesson.setup.routeChoice || []).find(r => r.id === S.route); return rc ? rc.label : null; };

  // ---------- 看對手（第 11 關）----------
  function openRivals() {
    if (busy) return;
    S.scout(); render();
    const rivals = S.setup.rivals || [];
    const stars = (n) => { const w = el('span', 'lr-rs', { 'aria-label': `${n} 星` }); w.append(starsEl(n, { label: false })); return w; };
    const unit = (u) => { const a = el('span', 'lr-ru', { 'data-tt-tip': `ability:${u.key}:${u.star || 1}`, 'aria-label': `${zhOf(S.DATA, u.key)} ${u.star || 1} 星` }); a.append(styleAvatar(el('span', 'tt-xav lr-ruav'), S.DATA, u.key), stars(u.star || 1)); return a; };
    const cols = rivals.map(r => el('section', 'lr-rival', {}, el('h3', '', {}, r.name), el('p', 'lr-rlabel', {}, '場上'), el('div', 'lr-rrow', {}, ...r.board.map(unit)),
      el('p', 'lr-rlabel', {}, '板凳'), el('div', 'lr-rrow', {}, ...(r.bench.length ? r.bench.map(u => unit({ ...u, star: u.star || 1 })) : [el('span', 'tt-muted', {}, '空的')]))));
    const taken = {};
    for (const r of rivals) for (const u of [...r.board, ...r.bench]) taken[u.key] = (taken[u.key] || 0) + 3 ** ((u.star || 1) - 1);
    const mine = new Set([...S.state.board, ...S.state.bench].filter(Boolean).map(u => u.key));
    const lines = Object.keys(taken).filter(k => mine.has(k) || taken[k] >= 6).map(k => `${zhOf(S.DATA, k)}：對手拿走 ${taken[k]} 張，池子剩 ${S.poolLeft(k)}`);
    for (const k of mine) if (!taken[k] && S.setup.pool && S.setup.pool[k] !== undefined) lines.push(`${zhOf(S.DATA, k)}：沒人拿，池子剩 ${S.poolLeft(k)}`);
    openSheet({ title: '看對手', cls: 'lr-rivals', nodes: [el('div', 'lr-rcols', {}, ...cols), el('ul', 'lr-rlines', {}, ...lines.map(t => el('li', '', {}, t)))] });
  }

  // ---------- 第 12 關：先選路線 ----------
  function askRoute() {
    const opts = lesson.setup.routeChoice;
    openSheet({ title: '先選一條路', cls: 'lr-route', nodes: [
      el('p', '', {}, '兩條路都能過，選了就走到底。'),
      ...opts.map(o => { const b = el('button', 'tt-xbtn lr-routebtn', { type: 'button' }, el('b', '', {}, o.label), el('span', '', {}, o.note)); b.addEventListener('click', () => { S.route = o.id; closeSheet(); render(); }); return b; }),
    ] });
  }

  // ---------- 輸入（拖曳＋點選）----------
  function selectUnit(u) { sel = { kind: 'unit', uid: u.uid }; api.sfx('select'); render(); }
  function toDrop(d, uid) {
    if (d.k === 'board') return { zone: 'board', pos: [d.r, d.c] };
    return { zone: 'bench', idx: d.i };
  }
  function onTap(desc, node, ev = {}) {
    if (busy || ui.mode !== 'plan' || modalOpen()) return;
    const d = parse(desc); if (!d) return;
    clearPulse(); armPulse();
    if (d.k === 'shop') { if (ev.button === 0 || ev.button == null) { hideTip(); act('buy', d.i); } return; }
    if (d.k === 'enemy') { showTip(node, node.dataset.ttTip || `ability:${d.key}:${node.dataset.ttStar || 1}`, { placement: 'top' }); return; }
    if (d.k === 'item') { sel = sel && sel.kind === 'item' && sel.idx === d.i ? null : { kind: 'item', idx: d.i }; api.sfx('select'); render(); return; }
    if (d.k === 'board' || d.k === 'bench') {
      const u = unitAt(d);
      if (sel && sel.kind === 'item' && u) { const idx = sel.idx; sel = null; act('equip', idx, u.uid); return; }
      if (sel && sel.kind === 'unit') {
        if (u && u.uid === sel.uid) { sel = null; render(); return; }
        const id = sel.uid; sel = null; act('move', id, toDrop(d)); return;
      }
      if (u) selectUnit(u); else { sel = null; render(); }
    }
  }
  function onTapEmpty(ev) {
    if (busy || ui.mode !== 'plan' || modalOpen()) return;
    hideTip();
    const n = ev && document.elementFromPoint(ev.clientX, ev.clientY);
    const drop = n && n.closest ? n.closest('[data-tt-drop]') : null;
    const d = drop ? parse(drop.dataset.ttDrop) : null;
    if (d && (d.k === 'board' || d.k === 'bench') && sel && sel.kind === 'unit') { const id = sel.uid; sel = null; act('move', id, toDrop(d)); return; }
    if (sel) { sel = null; render(); }
  }
  function sellLabel(u) { return `賣出　+${sellValue(u, S.DATA)} 金`; }
  function onDragStart(desc) {
    const d = parse(desc); if (!d) return;
    hideTip(); clearPulse();
    if (d.k === 'board' || d.k === 'bench') {
      const u = unitAt(d); if (!u) return;
      sel = { kind: 'unit', uid: u.uid }; ui.sel = sel;
      R.shop.setAttribute('data-tt-drop', 'sell'); R.shop.dataset.sell = sellLabel(u); R.shop.classList.add('tt-sellmode');
      api.sfx('pickup');
    } else if (d.k === 'item') { sel = { kind: 'item', idx: d.i }; api.sfx('pickup'); }
    else if (d.k === 'shop') api.sfx('pickup');
  }
  function onDragEnd() { R.shop.removeAttribute('data-tt-drop'); delete R.shop.dataset.sell; R.shop.classList.remove('tt-sellmode'); }
  function onDrop(from, to) {
    if (busy || ui.mode !== 'plan') return;
    const f = parse(from), t = parse(to);
    if (!f) return;
    if (!t) { api.sfx('error'); sel = null; return render(); }
    sel = null;
    if (f.k === 'shop') {
      if (t.k !== 'board' && t.k !== 'bench') { api.sfx('error'); return render(); }
      const r = act('buy', f.i);
      if (r && r.ok && t.k === 'board') act('move', r.uid, toDrop(t));
      return;
    }
    if (f.k === 'item') {
      const u = (t.k === 'board' || t.k === 'bench') ? unitAt(t) : null;
      if (!u) { api.sfx('error'); return render(); }
      act('equip', f.i, u.uid); return;
    }
    const u = unitAt(f); if (!u) return render();
    if (t.k === 'sell') { act('sell', u.uid); return; }
    if (t.k !== 'board' && t.k !== 'bench') { api.sfx('error'); return render(); }
    const there = unitAt(t);
    if (there && there.uid === u.uid) return render();
    act('move', u.uid, toDrop(t));
  }
  function onLongPress(desc, node) {
    if (ui.mode !== 'plan') return;
    const d = parse(desc); if (!d) return;
    const spec = node.dataset.ttTip; if (!spec) return;
    if (d.k === 'shop') showTip(node, spec, { placement: 'top', row: node.parentElement, full: true });
    else showTip(node, spec, { placement: 'top' });
    const off = () => { hideTip(); window.removeEventListener('pointerup', off, true); window.removeEventListener('pointercancel', off, true); };
    window.addEventListener('pointerup', off, true); window.addEventListener('pointercancel', off, true);
  }
  enableDnd(app, { onTap, onTapEmpty, onDrop, onDragStart, onDragEnd, onLongPress });
  app.addEventListener('contextmenu', (e) => { if (e.target.closest && !e.target.closest('input,textarea')) e.preventDefault(); });
  R.go.addEventListener('click', go);

  // 鍵盤：D 重抽、F 買經驗、空白鍵開戰（跟真的遊戲一樣）；Esc 關彈窗
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return;
    if (e.key === 'Escape') { if (sheet && sheet.back.querySelector('.lr-x')) closeSheet(); else { sel = null; render(); } return; }
    if (modalOpen() || busy) return;
    if (e.code === 'KeyD') act('reroll');
    else if (e.code === 'KeyF') act('buyXp');
    else if (e.code === 'Space' && !(tg && tg.tagName === 'BUTTON')) { e.preventDefault(); go(); }
  });

  // 音效開關
  const syncMute = () => { const m = audio.isMuted ? audio.isMuted() : false; R.mute.setAttribute('aria-pressed', String(m)); R.mute.textContent = m ? '音效：關' : '音效：開'; };
  R.mute.addEventListener('click', () => { try { audio.setMuted(!audio.isMuted()); } catch (_) { /* 略過 */ } syncMute(); });
  syncMute();

  // 閒置 8 秒，把任務指到的東西閃一下（只有第一次玩這關才有）
  const PULSE = { 'first-fight': '.tt-bench .tt-unit', 'buy-merge': '.tt-card[data-tt-unit=Xayah]', 'level-up': '.tt-xpbtn', items: '.tt-xitem', interest: '.tt-card[data-tt-unit=Leona]', scout: '.lr-scoutbtn' };
  function armPulse() {
    clearPulse();
    if (!shownFirst || S.passed || ui.mode !== 'plan' || doneSet().has(lesson.id)) return;
    pulseT = setTimeout(() => {
      if (busy || modalOpen()) return;
      const n = app.querySelector(PULSE[lesson.id] || '.tt-go');
      if (n) n.classList.add('lr-pulse');
    }, 8000);
  }

  // ---------- 開關卡 ----------
  function openLesson(id, { quiet = false } = {}) {
    closeSheet(); clearPulse();
    lesson = lessons.find(l => l.id === id) || lessons[0];
    S = new Session(LD.DATA, lesson, { seed: randomSeed() });
    sel = null; ui.sel = null; ui.mode = 'plan'; busy = false; hintN = 0; passedShown = false; shownFirst = true;
    app.dataset.phase = 'plan';
    if (abort) abort.abort();
    try { history.replaceState(null, '', location.pathname + location.search + '#' + lesson.id); } catch (_) { /* 略過 */ }
    window.scrollTo(0, 0);
    render(); armPulse();
    if (lesson.setup.routeChoice) askRoute();
    const j = store.get(); j.play.last = lesson.id; store.set(j);
    return S;
  }

  // 測試掛鉤（網址帶 ?seed= 才掛）
  if (new URLSearchParams(location.search).has('seed')) window.__learn = { session: () => S, lesson: () => lesson, api, openLesson, go, act: (...a) => act(...a), render };

  return {
    openLesson, render,
    start(hashId) {
      const done = doneSet();
      const byHash = hashId && lessons.find(l => l.id === hashId);
      const first = byHash || lessons.find(l => !done.has(l.id));
      openLesson((first || lessons[0]).id);
      if (!first) toast('12 關都過了，想重玩哪一關都可以');
    },
  };
}

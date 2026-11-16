// 邊玩邊學的畫面：骨架、棋盤、商店、羈絆、戰鬥、右側棋子面板全部用滴答克的（trials/js/ui/layout.js 的 mount＋trials.css），
// 這裡只加教學專屬的東西：任務卡、關卡清單（頁首「第 N 關」鍵）、利息／血量／場次小晶片、結果卡、完成卡、看對手。
// 操作跟滴答克一樣：點一隻＝開右側面板（羈絆、技能、裝備、賣出），換位、上場、買、賣、裝備都用拖的。
import { el, zhOf, styleAvatar, starsEl } from '../../trials/js/ui/board.js';
import { showTip, hideTip } from '../../trials/js/ui/tooltip.js';
import * as PN from '../../trials/js/ui/panels.js';
import { mount } from '../../trials/js/ui/layout.js';
import { hotkeys } from '../../trials/js/ui/hotkeys.js';
import { countTraits } from '../../trials/js/stats.js';
import * as G from '../../trials/js/game.js';
import { enemyForRound } from '../../trials/js/enemies.js';
import * as audio from '../../trials/js/audio.js';
import { Session, recapLines } from './lesson.js';

const KEY = 'choko.learn.v1';
const SFX = { buy: 'buy', sell: 'sell', reroll: 'reroll', buyXp: 'xp', levelUp: 'xp', move: 'place', equip: 'equip', combineItems: 'equip', startBattle: 'start' };

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
const narrow = () => window.matchMedia('(max-width: 1023px), (orientation: portrait)').matches;

export async function mountApp(root, LD, store, { backHref = '../#learn', search = '', hashId = '' } = {}) {
  const lessons = LD.lessons;
  let S = null, lesson = null, hintN = 0, sheet = null, pulseT = 0, shownFirst = false, folded = false, passedShown = false, lay = null, R = null, app = null;
  const ui = { mode: 'plan', sel: null, speed: 2 };
  const L = {};   // 事件
  const doneSet = () => new Set(store.get().play.done);

  const api = {
    get DATA() { return S.DATA; }, get state() { return S.state; }, ui,
    picks: () => ({ prod: { active: [], trait: null } }), countTraits: (u, D, o) => countTraits(u, D, o), traitOpts: () => ({ augments: [] }),
    battleUnits: () => G.battleUnits(S.state, S.DATA),
    hotkeys,
    teamLimit: () => S.popMax(), popUsed: () => S.popUsed(), popMax: () => S.popMax(),
    enemy: () => enemyForRound(S.state.round, S.state.seed, S.DATA),
    on(evt, fn) { (L[evt] = L[evt] || []).push(fn); return () => { L[evt] = (L[evt] || []).filter(f => f !== fn); }; },
    off(evt, fn) { L[evt] = (L[evt] || []).filter(f => f !== fn); },
    emit(evt, p) { for (const f of (L[evt] || []).slice()) f(p); },
    sfx(n) { try { audio.sfx(n); } catch (_) { /* 音效壞了照玩 */ } },
    toast() {},   // mount 之後換成滴答克的提示
    act(name, ...args) { return act(name, ...args); },
  };
  PN.bindApi(api);
  const toast = (m) => api.toast(m);
  const render = () => api.emit('change');

  // 第一關（或網址指定的、或第一個沒過的）先把 Session 開好，mount 要用
  const done0 = doneSet();
  const first = (hashId && lessons.find(l => l.id === hashId)) || lessons.find(l => !done0.has(l.id));
  setLesson((first || lessons[0]).id);

  // ---------- 教學專屬的節點 ----------
  const missionEl = el('section', 'lr-mission', { 'aria-label': '本關任務', 'data-tt-noclear': '' });
  const extrasEl = el('div', 'lr-extras', { 'data-tt-noclear': '' });
  const listBtn = el('button', 'tt-ibtn lr-listbtn', { type: 'button', 'aria-haspopup': 'dialog', 'data-tt-noclear': '' });
  const progEl = el('span', 'lr-prog tt-num', { 'aria-live': 'polite' });
  listBtn.addEventListener('click', openList);

  lay = await mount(root, api, {
    title: '邊玩邊學', back: { href: backHref, label: '新手教學', aria: '回新手教學' }, noHelp: true,
    hide: ['unlocks', 'last', 'planner', 'hotkeys', 'help', 'codex', 'augs', 'special', 'mix', 'roundbar'],
    footer: '這是教學用的簡化版：牌只有 14 隻、羈絆只做 4 個、技能跟數字有簡化，跟正式對局不完全一樣。非官方，本站與 Riot Games 無關；遊戲名稱、素材與音效屬於其權利人。',
    headerExtra: [listBtn, progEl],
    onRender,
    battle: { start: startBattle, finish: finishBattle, after: afterBattle },
  });
  R = lay.R; app = lay.app;
  R.stage.prepend(missionEl); R.stage.append(extrasEl);
  lay.render();
  armPulse();
  if (lesson.setup.routeChoice) askRoute();

  // ---------- 小工具 ----------
  const modalOpen = () => !!document.querySelector('.lr-sheet-back, .tt-fbmodal, .tt-panel-back, [role=dialog]');
  const clearPulse = () => { clearTimeout(pulseT); if (app) for (const n of app.querySelectorAll('.lr-pulse')) n.classList.remove('lr-pulse'); };

  // ---------- 每次 render 之後：把教學專屬的東西補上去 ----------
  function onRender(Rr) {
    if (!S) return;
    renderHeader(); renderMission(); renderExtras();
    const st = S.setup;
    // HUD：不用的格子藏起來（機率、連勝、買經驗被鎖的關卡不要有「升 N 級」）
    if (!st.showOdds) Rr.hud.querySelector('.tt-hud-odds')?.remove();
    if (!st.showStreak) Rr.hud.querySelector('.tt-hud-streak')?.remove();
    if (S.buyXpOff()) Rr.hud.querySelector('.tt-hud-lvup')?.remove();
    // 商店：這關沒開放的整塊變暗，按了會出提示
    Rr.shop.classList.toggle('lr-off', S.shopOff());
    const xp = Rr.shop.querySelector('.tt-xpbtn'), rr = Rr.shop.querySelector('.tt-rrbtn');
    if (xp && S.buyXpOff()) { xp.classList.add('tt-poor', 'lr-off'); xp.setAttribute('aria-disabled', 'true'); }
    if (rr && S.rerollOff()) { rr.classList.add('tt-poor', 'lr-off'); rr.setAttribute('aria-disabled', 'true'); }
    if (st.showPoolLeft) for (const c of Rr.shop.querySelectorAll('.tt-card[data-tt-unit]')) c.append(el('span', 'lr-poolleft', {}, `池子剩 ${S.poolLeft(c.dataset.ttUnit)}`));
    Rr.items.hidden = !(S.state.itemBench.length || st.items);
    Rr.go.classList.toggle('lr-blocked', !!(S.notice() && S.notice().block));
    missionEl.classList.toggle('lr-compact', !!ui.sel);
    armPulse();
  }

  // ---------- 頁首：第 N 關 ▾ ----------
  function renderHeader() {
    const done = doneSet();
    listBtn.replaceChildren(`第 ${lesson.n} 關`, el('i', 'lr-caret', { 'aria-hidden': 'true' }, '▾'));
    listBtn.setAttribute('aria-label', `第 ${lesson.n} 關 ${lesson.title}，點開看全部關卡`);
    progEl.textContent = `${done.size} / ${lessons.length} 關`;
  }
  function openList() {
    if (modalOpen() && !sheet) return;
    const done = doneSet();
    const items = lessons.map(l => {
      const b = el('button', 'lr-li' + (l.id === lesson.id ? ' lr-cur' : '') + (done.has(l.id) ? ' lr-done' : ''), { type: 'button', 'data-lesson': l.id, 'aria-label': `第 ${l.n} 關 ${l.title}` + (done.has(l.id) ? '，已過關' : ''), 'aria-current': l.id === lesson.id ? 'step' : null },
        el('i', 'lr-no tt-num', {}, done.has(l.id) ? '✓' : l.n), el('span', 'lr-name', {}, l.title), el('small', 'lr-topic', {}, l.topic));
      b.addEventListener('click', () => { closeSheet(); openLesson(l.id); });
      return b;
    });
    openSheet({ title: '全部關卡', cls: 'lr-listsheet', nodes: [el('nav', 'lr-list', { 'aria-label': '關卡列' }, ...items)] });
    const cur = sheet && sheet.back.querySelector('.lr-cur'); if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'center' }); } catch (_) { /* 略過 */ } }
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
    missionEl.classList.toggle('lr-folded', folded);
    missionEl.replaceChildren(...[
      el('div', 'lr-mhead', {}, el('span', 'lr-badge', {}, `第 ${lesson.n} 關｜${lesson.topic}`), done ? el('span', 'lr-passed', {}, '已過關') : null, fold),
      el('h2', 'lr-title', {}, lesson.title),
      el('p', 'lr-task', {}, el('b', '', {}, lesson.task)),
      body,
      note ? el('p', 'lr-notice' + (note.kind === 'fail' ? ' lr-fail' : ''), { role: 'alert' }, note.msg) : null].filter(Boolean));
  }

  // ---------- 利息／血量／場次／看對手 ----------
  function renderExtras() {
    const st = S.setup, s = S.state;
    const ex = [];
    if (st.showInterest) {
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
    extrasEl.replaceChildren(...ex);
  }

  // ---------- 動作（Session 的規則：該關沒開放的買／重抽／買經驗都會被擋，擋下來就提示）----------
  function act(name, ...args) {
    if (ui.mode !== 'plan') return { ok: false };
    const r = S.act(name, ...args);
    if (!r || !r.ok) {
      toast(reasonText(r && r.reason));
      api.sfx('error'); render();
      return r;
    }
    clearPulse();
    if (narrow() && (name === 'move' || name === 'equip')) ui.sel = null;   // 手機的底部抽屜會蓋住「戰鬥」鍵：拖完就收
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
  }

  function onPassed(fin) {
    const j = store.get();
    if (!j.play.done.includes(lesson.id)) j.play.done.push(lesson.id);
    j.play.last = lesson.id;
    store.set(j);
    render();
    api.sfx('star3');
    setTimeout(() => openDone(fin), fin ? 350 : 250);
  }

  // ---------- 開戰（layout 的戰鬥流程呼叫這三個）----------
  function startBattle() {
    if (ui.mode !== 'plan' || modalOpen()) return null;
    clearPulse(); hideTip();
    if (!S.state.board.some(Boolean) && lesson.id !== 'streak') { toast('場上還沒放棋子，先放一隻再戰鬥'); api.sfx('error'); return null; }
    const r = S.go();
    if (!r || !r.ok) { toast(reasonText(r && r.reason)); api.sfx('error'); render(); return null; }
    return r;
  }
  function finishBattle() { return S.finish(); }
  function afterBattle(fin) {
    const justPassed = S.passed && !passedShown;
    if (justPassed) { passedShown = true; showResult(fin, true); onPassed(fin); }
    else showResult(fin, false);
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
    if (ui.mode === 'battle') return;
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


  // ---------- 閒置 8 秒，把任務指到的東西閃一下（只有第一次玩這關才有）----------
  const PULSE = { 'first-fight': '.tt-bench .tt-unit', 'buy-merge': '.tt-card[data-tt-unit=Xayah]', 'level-up': '.tt-xpbtn', items: '.tt-xitem', interest: '.tt-card[data-tt-unit=Leona]', scout: '.lr-scoutbtn' };
  function armPulse() {
    clearTimeout(pulseT);
    if (!app) return;
    for (const n of app.querySelectorAll('.lr-pulse')) n.classList.remove('lr-pulse');
    if (!shownFirst || S.passed || ui.mode !== 'plan' || doneSet().has(lesson.id)) return;
    pulseT = setTimeout(() => {
      if (modalOpen()) return;
      const n = app.querySelector(PULSE[lesson.id] || '.tt-go');
      if (n) n.classList.add('lr-pulse');
    }, 8000);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet && sheet.back.querySelector('.lr-x')) closeSheet(); });

  // ---------- 開關卡 ----------
  function setLesson(id) {
    lesson = lessons.find(l => l.id === id) || lessons[0];
    S = new Session(LD.DATA, lesson, { seed: randomSeed() });
    ui.sel = null; ui.mode = 'plan'; hintN = 0; passedShown = false; shownFirst = true;
    folded = typeof window !== 'undefined' && narrow();   // 手機預設收起來，不佔棋盤的位置
    try { history.replaceState(null, '', location.pathname + location.search + '#' + lesson.id); } catch (_) { /* 略過 */ }
    const j = store.get(); j.play.last = lesson.id; store.set(j);
  }
  function openLesson(id) {
    if (ui.mode === 'battle') return S;
    closeSheet(); clearPulse();
    setLesson(id);
    window.scrollTo(0, 0);
    render(); armPulse();
    if (lesson.setup.routeChoice) askRoute();
    return S;
  }

  // 測試掛鉤（網址帶 ?seed= 才掛）
  if (new URLSearchParams(location.search).has('seed')) window.__learn = { session: () => S, lesson: () => lesson, api, openLesson, act: (...a) => act(...a), render };

  return { openLesson, render, api };
}

// 版面骨架與整體流程：建 DOM、分派 render、佈陣⇄戰鬥切換。SPEC_UI2 第 2、3 章。
// 輸入（點選／拖曳／右鍵／快捷鍵）全部交給 input.js 的 bindInput（包 C）；這裡不處理任何輸入。
// 掛載點（給 U2／U3）：
//   [data-tt-mount=traits]  → traitbar.renderTraits(el, 我方羈絆, 敵方羈絆, api)（敵方羈絆畫在 [data-tt-enemy]）
//   .tt-board               → board.renderBoard；戰鬥時 el.__field 交給 battle.playBattle
//   面板：panels.showUnitPanel／showTraitPanel／showAugmentChoice／showReward／showResult／showGameOver／showHelp／showCodex
import { renderBoard, renderBench, renderItems, renderSpecials, el, zhOf, costOf, itemZh } from './board.js';
import { renderShop, renderHud } from './shopbar.js';
import { sfx, setMuted, isMuted } from '../audio.js';

let traitbar = null, panels = null, battle = null, inputMod = null;
const FRONT_COLS = [3, 2, 4, 1, 5, 0, 6];

const $ = (r, s) => r.querySelector(s);
export const parse = (d) => {
  if (!d) return null;
  const [k, rest] = d.split(':');
  if (k === 'board') { const [r, c] = rest.split(',').map(Number); return { k, r, c }; }
  if (k === 'bench' || k === 'shop' || k === 'item') return { k, i: Number(rest) };
  if (k === 'enemy') return { k, key: rest };
  return { k };
};

// ---------- 備用小彈窗（U2 的 panels.js 不在時才用；也給「接著玩？」用） ----------
export function askModal(title, text, buttons) {
  return new Promise((res) => {
    const back = el('div', 'tt-fbmodal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const box = el('div', '', {}, el('h2', '', {}, title), typeof text === 'string' ? el('p', '', {}, text) : text);
    const row = el('div', 'tt-fbrow');
    buttons.forEach((b, i) => {
      const n = el('button', 'tt-xbtn' + (b.primary ? ' tt-go' : ''), { type: 'button' }, b.label);
      n.style.marginLeft = '0';
      n.addEventListener('click', () => { back.remove(); res(b.value ?? i); });
      row.append(n);
    });
    box.append(row); back.append(box); document.body.append(back);
    (row.querySelector('button') || box).focus();
  });
}

// ---------- 掛載 ----------
export async function mount(root, api) {
  [traitbar, panels, battle, inputMod] = await Promise.all([
    import('./traitbar.js').catch(() => null),
    import('./panels.js').catch(() => null),
    import('./battle.js').catch(() => null),
    import('./input.js').catch(() => null),
  ]);
  const { DATA } = api;
  const ui = api.ui;
  ui.mode = 'plan'; ui.sel = null; ui.speed = ui.speed || 2; ui.sellArm = null; ui.hoverUid = null; ui.dragUnit = null;
  // data.js 還沒把 traits.json 的 sprite 帶進 DATA 時，自己讀一次補上（SPEC 2.6）
  if (!DATA.traits.sprite && traitbar && traitbar.setTraitSprite) {
    try { const r = await fetch('./data/traits.json'); if (r.ok) { const j = await r.json(); if (j.sprite) traitbar.setTraitSprite(j.sprite); } } catch (_) { /* 沒圖示就退回文字 */ }
  }

  root.replaceChildren();
  const app = el('div', 'tt-shell', { 'data-phase': 'plan' });
  app.innerHTML = `
    <header class="tt-top"><div class="tt-top-in">
      <a class="tt-link" href="../?s=19" aria-label="回攻略站">← <span class="tt-hide-s">回攻略站</span></a>
      <h1>滴答克的試煉 <small>S19</small></h1>
      <button class="tt-ibtn tt-unlockbtn" type="button" data-act="unlocks" hidden></button>
      <button class="tt-ibtn tt-hide-m" type="button" data-act="hotkeys">快捷鍵</button>
      <button class="tt-ibtn" type="button" data-act="help" aria-label="說明">說明</button>
      <button class="tt-ibtn" type="button" data-act="mute" aria-pressed="false"></button>
    </div></header>
    <main class="tt-app">
      <div class="tt-stage">
        <div class="tt-roundbar" aria-label="回合"></div>
        <div class="tt-enemybar"></div>
        <div class="tt-augs" aria-label="增幅"></div>
        <div class="tt-xitems" aria-label="裝備欄"></div>
        <div class="tt-xspecial" aria-label="特殊道具" hidden></div>
        <div class="tt-traits" data-tt-mount="traits"></div>
        <button class="tt-codexbtn" type="button" data-act="codex" data-tt-noclear>圖鑑</button>
        <div class="tt-board" aria-label="棋盤"></div>
        <div class="tt-bench" aria-label="板凳"></div>
        <div class="tt-hud"></div>
        <div class="tt-xshop" data-tt-drop-zone></div>
        <button class="tt-go" type="button" data-act="go" data-tt-noclear><span>戰鬥</span><kbd class="tt-hk" aria-hidden="true"></kbd></button>
        <div class="tt-battlebar">
          <div class="tt-speed" role="group" aria-label="戰鬥速度"></div>
          <div class="tt-rank" aria-label="即時傷害排行"></div>
        </div>
        <div data-tt-mount="unitpanel" class="tt-unitpanel"></div>
        <div class="tt-toast" role="status" aria-live="polite"></div>
      </div>
    </main>
    <footer class="tt-foot" id="tt-foot"><p>非官方重製・名稱是暫譯・S19 數值為推測｜本站與 Riot Games 無關；遊戲名稱、素材與音效屬於其權利人。</p></footer>`;
  root.append(app);

  const R = {
    stage: $(app, '.tt-stage'), enemy: $(app, '.tt-enemybar'), board: $(app, '.tt-board'), bench: $(app, '.tt-bench'),
    items: $(app, '.tt-xitems'), special: $(app, '.tt-xspecial'), shop: $(app, '.tt-xshop'), hud: $(app, '.tt-hud'), roundbar: $(app, '.tt-roundbar'), augs: $(app, '.tt-augs'),
    traits: $(app, '[data-tt-mount=traits]'), unitpanel: $(app, '[data-tt-mount=unitpanel]'), toast: $(app, '.tt-toast'),
    speed: $(app, '.tt-speed'), rank: $(app, '.tt-rank'), mute: $(app, '[data-act=mute]'), go: $(app, '.tt-go'),
    unlockBtn: $(app, '.tt-unlockbtn'),
  };
  // 站台列的「戰鬥」鍵：戰鬥階段整個收起；快捷鍵提示由 renderShop 填

  // 手機抽屜最高不能蓋到板凳（SPEC：抽屜不蓋棋盤與板凳）
  const fitDrawer = () => {
    try {
      const b = R.bench.getBoundingClientRect();
      const room = window.innerHeight - b.bottom - 4;
      R.unitpanel.style.setProperty('--tt-drawer-max', Math.max(150, room) + 'px');
    } catch (_) { /* 略過 */ }
  };
  window.addEventListener('resize', fitDrawer);
  // ---- toast ----
  let toastT = null;
  // 提示放在棋盤下緣（板凳上方），不蓋金幣、連勝和商店卡；桌機位置由 CSS 管
  const placeToast = () => { try { R.toast.style.setProperty('--tt-ty', (R.board.offsetTop + R.board.offsetHeight - 6) + 'px'); } catch (_) { /* 略過 */ } };
  api.toast = (msg) => { placeToast(); R.toast.textContent = msg; R.toast.classList.add('tt-xon'); clearTimeout(toastT); toastT = setTimeout(() => R.toast.classList.remove('tt-xon'), 2200); };

  // ---- 小工具 ----
  const stateUnits = () => [...api.state.board.filter(Boolean), ...api.state.bench.filter(Boolean)];
  const unitByUid = (uid) => stateUnits().find(u => u.uid === uid);
  const unitAt = (d) => d.k === 'board' ? api.state.board.find(u => u.pos && u.pos[0] === d.r && u.pos[1] === d.c)
    : d.k === 'bench' ? api.state.bench[d.i] : null;
  const popUsed = () => api.state.board.reduce((n, u) => n + (DATA.units.byKey[u.key]?.slots || 1), 0);
  const popMax = () => (api.teamLimit ? api.teamLimit() : api.state.level);
  api.popUsed = popUsed; api.popMax = popMax;
  const sellPrice = (u) => {
    const c = costOf(DATA, u.key), m = DATA.rules.sellPrice || { star2Mult: 3, star3Mult: 9, minus: 1 };
    if (c >= 7) return DATA.rules.sevenCost?.sellPrice ?? 7;
    if (u.star === 1) return c;
    if (c === 1) return u.star === 2 ? 3 : 9;
    return c * (u.star === 2 ? m.star2Mult : m.star3Mult) - m.minus;
  };
  const modalOpen = () => !!document.querySelector('.tt-fbmodal, [role=dialog], dialog[open], .tt-modal, .tt-panel-back');
  const setSel = (s) => { ui.sel = s; ui.sellArm = null; render(); };

  // ---- 站台列：解鎖鍵 ----
  function renderUnlockBtn() {
    const U = api.unlocks;
    if (!U || U.enabled === false) { R.unlockBtn.hidden = true; return; }
    let list = []; try { list = U.list() || []; } catch (_) { /* 還沒接上 */ }
    if (!list.length) { R.unlockBtn.hidden = true; return; }
    const done = list.filter(x => { try { return U.isUnlocked(x.key ?? x); } catch (_) { return false; } }).length;
    R.unlockBtn.hidden = false;
    R.unlockBtn.replaceChildren(`解鎖 ${done}/${list.length}`, ...(ui.unlockNew ? [el('i', 'tt-dot', { 'aria-label': '有新解鎖' })] : []));
  }
  if (api.on) api.on('unlock', () => { ui.unlockNew = true; renderUnlockBtn(); R.unlockBtn.classList.remove('tt-flash'); void R.unlockBtn.offsetWidth; R.unlockBtn.classList.add('tt-flash'); });

  // ---- 回合列 ----
  function renderRoundbar() {
    const s = api.state, rounds = DATA.rules.rounds?.length || 30, maxLives = DATA.rules.start?.lives || 3;
    const bosses = (DATA.rules.rounds || []).filter(r => r.type === 'boss').map(r => r.n);
    const prev = bosses.filter(n => n < s.round).pop() || 0;
    const next = bosses.find(n => n >= s.round) || rounds;
    const dots = el('span', 'tt-rdots', { 'aria-hidden': 'true' });
    for (let n = prev + 1; n <= next; n++) {
      const boss = bosses.includes(n);
      dots.append(el('i', 'tt-rd' + (n < s.round ? ' tt-past' : n === s.round ? ' tt-now' : '') + (boss ? ' tt-boss' : ''), {}, boss ? '☠' : ''));
    }
    const hearts = el('span', 'tt-hearts', { 'aria-label': `命 ${s.lives}/${maxLives}`, role: 'img' });
    for (let i = 0; i < maxLives; i++) hearts.append(el('img', '', { src: i < s.lives ? 'img/ui/heart.webp' : 'img/ui/heart_gray.webp', alt: '', draggable: 'false' }));
    R.roundbar.replaceChildren(el('b', 'tt-rtxt', {}, `回合 `, el('span', 'tt-num', {}, `${s.round}/${rounds}`)), dots, hearts,
      el('span', 'tt-score tt-num', { 'aria-label': '分數 ' + (s.score || 0), 'data-tt-tip': 'text:分數' }, (s.score || 0).toLocaleString('en-US')));
  }

  // ---- 增幅 ----
  function renderAugs() {
    const nodes = (api.state.augments || []).slice(0, 3).map((k) => {
      const a = DATA.augments.byKey[k];
      const b = el('button', 'tt-aug t' + (a?.tier || 1), { type: 'button', 'data-tt-tip': 'aug:' + k, 'data-tt-noclear': '', 'aria-label': '增幅：' + (a?.zh || k) + '，點一下看說明' }, el('i', '', { 'aria-hidden': 'true' }));
      if (a && a.sp != null) {
        const i = b.firstChild;
        i.style.backgroundImage = 'url("../icons/aug-sprite.webp")'; i.style.backgroundSize = '2000% 1300%';
        i.style.backgroundPosition = `${(a.sp % 20) * 100 / 19}% ${Math.floor(a.sp / 20) * 100 / 12}%`;
      }
      b.addEventListener('click', () => { if (panels && panels.showAugmentInfo) panels.showAugmentInfo(api, k); else api.toast((a?.zh || k) + (a?.desc ? '：' + a.desc : '')); });
      return b;
    });
    R.augs.replaceChildren(...nodes);
  }

  function toggleOdds() {
    const ex = $(R.stage, '.tt-oddspop');
    if (ex) { ex.remove(); return; }
    const t = el('table', '', { 'aria-label': '商店機率表' });
    t.append(el('tr', '', {}, el('th', '', {}, '等級'), ...[1, 2, 3, 4, 5].map(c => el('th', 'tt-cost' + c, {}, c + '費'))));
    for (let l = 1; l <= (DATA.rules.maxLevel || 10); l++) {
      const row = DATA.rules.shopOdds[String(l)]; if (!row) continue;
      t.append(el('tr', l === api.state.level ? 'tt-xcur' : '', {}, el('td', '', {}, l), ...row.map(p => el('td', '', {}, p ? p + '%' : '—'))));
    }
    const pop = el('div', 'tt-oddspop', { role: 'region', 'aria-label': '商店機率' }, t, el('div', 'tt-oddsnote', {}, '（推測數值，PBE 後更新）'));
    R.stage.append(pop);
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
  }

  // ---- 敵方列 ----
  function renderEnemyBar(enemy) {
    const n = [el('span', 'tt-ename', {}, el('small', '', {}, '對手'), enemy?.name || '—')];
    if (enemy?.boss) n.push(el('span', 'tt-bossbadge', {}, '頭目'));
    const mount = el('span', 'tt-emount', { 'data-tt-enemy': '' });
    n.push(mount);
    R.enemy.replaceChildren(...n);
    return mount;
  }

  // ---- 羈絆列 ----
  let lastTe = [];
  function renderTraitsMount(enemy) {
    const s = api.state;
    const tp = api.countTraits ? api.countTraits(s.board.filter(Boolean), DATA, { augments: s.augments || [] }) : [];
    let te = enemy?.traitsPreview;
    if ((!te || !te.length) && enemy && api.countTraits) te = api.countTraits(enemy.units.map(u => ({ key: u.key, star: u.star, items: u.items || [] })), DATA, { augments: [] });
    lastTe = te || [];
    if (traitbar && traitbar.renderTraits) { traitbar.renderTraits(R.traits, tp, te || [], api); return; }
    R.traits.replaceChildren(...tp.filter(t => t.count >= 1).map(t => el('span', 'tt-selchip', {}, `${t.zh} ${t.count}/${t.next ?? '滿'}${t.active ? ' 啟動' : ''}`)));
  }

  function openUnit(u) {
    if (panels && panels.showUnitPanel) panels.showUnitPanel(u, api);
    else askModal(zhOf(DATA, u.key) + ' ' + u.star + '★', '（棋子面板尚未接上）', [{ label: '關閉' }]);
  }

  // ---- 拖曳中：商店整塊變成賣出區（SPEC 4.2）。dragUnit 由 C 的 onDragStart 設；沒設時從 .tt-drag-src 自己抓 ----
  function syncDrag() {
    let uid = ui.dragUnit;
    const src = app.querySelector('.tt-drag-src[data-tt-uid]');
    if (src) uid = Number(src.dataset.ttUid); else if (!app.querySelector('.tt-drag-src')) uid = null;
    const u = uid != null ? unitByUid(uid) : null;
    const want = u ? `賣出　+${sellPrice(u)} 金` : '';
    if ((R.shop.dataset.sell || '') === want) return;   // 沒變就不動 DOM（避免 MutationObserver 自己觸發自己）
    if (u) { R.shop.setAttribute('data-tt-drop', 'sell'); R.shop.dataset.sell = want; R.shop.classList.add('tt-sellmode'); }
    else { R.shop.removeAttribute('data-tt-drop'); delete R.shop.dataset.sell; R.shop.classList.remove('tt-sellmode'); }
  }
  new MutationObserver(syncDrag).observe(app, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });

  // ---- 選取是否還有效 ----
  function validateSel() {
    const s = ui.sel; if (!s) return;
    if (s.kind === 'unit' && !unitByUid(s.uid)) ui.sel = null;
    else if (s.kind === 'item' && !api.state.itemBench[s.idx]) ui.sel = null;
    else if (s.kind === 'sp') { const f = api.fav ? api.fav() : { free: 0 }; if (s.id === 'rm' ? !(api.state.removers > 0) : !(f.free > 0)) ui.sel = null; }
    else if (s.kind === 'enemy' && !(curEnemy && curEnemy.units.some(u => u.key === s.key))) ui.sel = null;
  }

  // ---- 主要 render ----
  let curEnemy = null;
  function render() {
    curEnemy = api.enemy();
    validateSel();
    renderRoundbar(); renderAugs(); renderUnlockBtn();
    renderHud(R.hud, api);
    if (ui.mode === 'battle') return;
    const s = api.state;
    renderEnemyBar(curEnemy);
    renderTraitsMount(curEnemy);
    renderBoard(R.board, api, { mode: 'plan', enemy: curEnemy });
    renderBench(R.bench, api);
    renderItems(R.items, api);
    renderSpecials(R.special, api);
    renderShop(R.shop, api);
    syncDrag();
    fitDrawer();
    if (panels && panels.renderUnitSide) panels.renderUnitSide(R.unitpanel, api);
    app.dataset.phase = 'plan';
    if ((s.phase === 'augment' || s.phase === 'reward') && s.pendingChoices) openChoice(s);
    else { ui.choiceOpen = null; maybeBossIntro(s); }
  }
  // 頭目回合：佈陣階段先跳「頭目登場」卡片（每回合每次重打一次）
  function maybeBossIntro(s) {
    if (s.phase !== 'plan' || !curEnemy || !curEnemy.boss) return;
    const k = s.seed + ':' + s.round + ':' + (s.attempt || 0);
    if (ui.bossShown === k) return;
    ui.bossShown = k;
    if (panels && panels.showBossIntro) setTimeout(() => { if (ui.mode === 'plan') panels.showBossIntro(api, curEnemy.boss, () => {}); }, 0);
  }
  api.on('change', render);
  if (api.hotkeys && api.hotkeys.onChange) api.hotkeys.onChange(() => render());

  // ---- 增幅／獎勵 ----
  function openChoice(s) {
    const pc = s.pendingChoices;
    if (ui.choiceOpen === pc) return;   // 同一個選擇視窗只開一次；換了新的（重抽、下一個獎勵）就再開
    ui.choiceOpen = pc;
    const fn = pc.type === 'augment' ? panels?.showAugmentChoice : panels?.showReward;
    if (fn) { fn(api, pc); return; }
    const row = el('div', '', {}, ...pc.options.map((o, i) => {
      const label = typeof o === 'string' ? (DATA.augments.byKey[o]?.zh || o) : (o.zh || o.name || o.label || JSON.stringify(o));
      const b = el('button', 'tt-xbtn', { type: 'button' }, label);
      b.addEventListener('click', () => { document.querySelector('.tt-fbmodal')?.remove(); api.act(pc.type === 'augment' ? 'pickAugment' : 'pickReward', i); });
      return b;
    }));
    row.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    const back = el('div', 'tt-fbmodal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '選一個' }, el('div', '', {}, el('h2', '', {}, pc.type === 'augment' ? '選一個增幅' : '選一個獎勵'), row));
    document.body.append(back);
  }

  // ---- 動作（給 input.js 用的 h） ----
  const toBoardDefault = (u) => {
    const front = ['Tank', 'Fighter'].includes(DATA.units.byKey[u.key]?.roleClass);
    const rows = front ? [0, 1, 2, 3] : [3, 2, 1, 0];
    const used = new Set(api.state.board.map(x => x.pos.join(',')));
    for (const r of rows) for (const c of FRONT_COLS) if (!used.has(r + ',' + c)) return { zone: 'board', pos: [r, c] };
    return null;
  };
  // 賣出：3★ 與 7 費先問一次（拖到商店、E 鍵、面板賣出鍵共用）
  async function doSell(u) {
    const needConfirm = u.star >= 3 || costOf(DATA, u.key) >= 7;
    if (needConfirm) {
      const v = await askModal('確定賣掉？', `${zhOf(DATA, u.key)} ${u.star}★，可得 ${sellPrice(u)} 金。`, [{ label: '賣掉', primary: true, value: 'sell' }, { label: '取消', value: 'no' }]);
      if (v !== 'sell') { render(); return; }
      if (!unitByUid(u.uid)) return;
    }
    ui.sel = null; ui.sellArm = null;
    api.act('sell', u.uid);
  }
  // 沒有 input.js 時的最小退回：只保留「點商店卡＝買」，其他操作都沒有（不保留舊的點擊換位）
  function fallbackInput() {
    app.addEventListener('click', (e) => {
      const c = e.target.closest('[data-tt-tap^="shop:"]'); if (!c || ui.mode !== 'plan' || modalOpen()) return;
      api.act('buy', Number(c.dataset.ttTap.split(':')[1]));
    });
  }
  const h = { unitByUid, unitAt, sellPrice, doSell, go: () => go(), cycleSpeed: () => cycleSpeed(), skipBattle: () => skipBattle(), toBoardDefault, modalOpen, setSel };
  if (inputMod && inputMod.bindInput) inputMod.bindInput({ app, api, R, render, h });
  else fallbackInput();
  // 懸停：記下滑鼠下的棋子（快捷鍵用；input.js 有自己的也不衝突）
  app.addEventListener('pointerover', (e) => { const t = e.target.closest?.('[data-tt-uid]'); ui.hoverUid = t ? Number(t.dataset.ttUid) : null; });
  app.addEventListener('pointerleave', () => { ui.hoverUid = null; });

  // ---- 頁首按鈕 ----
  const syncMute = () => { const m = isMuted(); R.mute.textContent = m ? '音效：關' : '音效：開'; R.mute.setAttribute('aria-pressed', String(m)); R.mute.setAttribute('aria-label', m ? '音效：關（點一下開啟）' : '音效：開（點一下關閉）'); };
  syncMute();
  const call = (fn, label) => { if (panels && panels[fn]) panels[fn](api); else api.toast(label + '還沒接上'); };
  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'mute') { setMuted(!isMuted()); syncMute(); }
    else if (a === 'help') showHelp();
    else if (a === 'codex') call('showCodex', '圖鑑');
    else if (a === 'unlocks') { ui.unlockNew = false; renderUnlockBtn(); call('showUnlocks', '解鎖說明'); }
    else if (a === 'hotkeys') call('showHotkeys', '快捷鍵設定');
    else if (a === 'odds') toggleOdds();
    else if (a === 'go') go();
  });
  function showHelp() {
    if (panels && panels.showHelp) panels.showHelp({ onRestart: () => api.act('restart'), api });
    else askModal('說明', '30 回合、6 隻頭目、3 條命、沒有計時。非官方重製，數值為推測。把棋子拖到商店可以賣掉，拖到格子可以移動或交換。', [{ label: '知道了', primary: true }]);
  }
  api.showHelp = showHelp;
  if (!new URLSearchParams(location.search).has('seed')) { if (panels && panels.maybeShowHelpFirst) panels.maybeShowHelpFirst(); else try { if (!localStorage.getItem('trials19.helpSeen')) { localStorage.setItem('trials19.helpSeen', '1'); showHelp(); } } catch (_) { /* 無痕模式 */ } }

  // ---- 戰鬥 ----
  let busy = false, abortCtl = null;
  const SPEEDS = [1, 2, 4];
  function renderSpeed() {
    R.speed.replaceChildren(...SPEEDS.map(n => {
      const b = el('button', 'tt-xbtn', { type: 'button', 'aria-pressed': String(ui.speed === n) }, n + '×');
      b.addEventListener('click', () => setSpeed(n)); return b;
    }), (() => { const b = el('button', 'tt-xbtn', { type: 'button' }, '跳過'); b.addEventListener('click', skipBattle); return b; })());
  }
  function setSpeed(n) { ui.speed = n; if (battle && battle.setBattleSpeed) battle.setBattleSpeed(n); renderSpeed(); }
  function cycleSpeed() { setSpeed(SPEEDS[(SPEEDS.indexOf(ui.speed) + 1) % SPEEDS.length]); }
  function skipBattle() { if (abortCtl) abortCtl.abort(); }
  ui.setSpeed = setSpeed; ui.skipBattle = skipBattle;

  function trackRank(result) {
    const mine = new Map(); for (const u of result.units || []) if (u.side === 'player') mine.set(u.id, { zh: u.zh || zhOf(DATA, u.key), p: 0, m: 0, t: 0 });
    let dirty = false;
    const draw = () => {
      dirty = false;
      const top = [...mine.values()].map(x => ({ ...x, sum: x.p + x.m + x.t })).filter(x => x.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 3);
      const max = top[0] ? top[0].sum : 1;
      R.rank.replaceChildren(...top.map(x => {
        const bar = el('span', 'tt-xbar'); for (const k of ['p', 'm', 't']) if (x[k]) { const i = el('i', k); i.style.width = (x[k] / max * 100) + '%'; bar.append(i); }
        return el('div', '', {}, el('span', '', {}, x.zh), bar, el('b', 'tt-num', {}, Math.round(x.sum).toLocaleString('en-US')));
      }));
    };
    return (ev) => {
      if (ev.e !== 'dmg') return;
      const m = mine.get(ev.src); if (!m) return;
      m[ev.type === 'p' ? 'p' : ev.type === 'm' ? 'm' : 't'] += ev.amt;
      if (!dirty) { dirty = true; requestAnimationFrame(draw); }
    };
  }

  async function go() {
    if (ui.mode !== 'plan' || busy) return;
    if (api.state.phase !== 'plan') return;
    // 場上沒棋子：板凳還有棋子就先擋（提醒上場）；手上完全沒棋子就放行，當作這回合輸掉，不會卡死
    if (!api.state.board.length && api.state.bench.some(Boolean)) { api.toast('場上還沒有棋子'); sfx('error'); return; }
    const r = api.act('startBattle');
    if (!r || !r.ok) return;
    await runBattle(r);
  }
  api.ui.go = go;

  async function runBattle(r) {
    busy = true; ui.mode = 'battle'; ui.sel = null; ui.sellArm = null;
    app.dataset.phase = 'battle';
    renderEnemyBar(r.enemy || curEnemy);
    if (traitbar && traitbar.renderEnemyTraits) { traitbar.renderEnemyTraits($(R.enemy, '[data-tt-enemy]'), lastTe, api); }
    renderBoard(R.board, api, { mode: 'battle' });
    fitDrawer();
    if (panels && panels.renderUnitSide) panels.renderUnitSide(R.unitpanel, api);
    syncDrag();
    R.rank.replaceChildren();
    renderSpeed(); renderHud(R.hud, api); renderRoundbar();
    abortCtl = new AbortController();
    const onEvent = trackRank(r.result);
    const opts = {
      speed: ui.speed, skip: abortCtl.signal, onEvent,
      spriteIndex: (key) => DATA.units.sprite?.map?.[key], spriteUrl: DATA.units.sprite?.src,
    };
    try {
      if (battle && battle.playBattle) await battle.playBattle(R.board.__field, r.result, opts);
      else await new Promise(res => setTimeout(res, 400));
    } catch (err) { console.error(err); }
    abortCtl = null;
    const fin = api.act('finishBattle') || {};
    const win = r.result.winner === 'player';
    const data = { round: api.state.history?.length ? api.state.history[api.state.history.length - 1].round : undefined, win, result: r.result, enemy: r.enemy || curEnemy, finish: fin, state: api.state, roundScore: fin.roundScore, gains: fin.gains, gameOver: fin.gameOver, cleared: fin.cleared };
    await showResult(data);
    if (fin.gameOver || fin.cleared) await showOver(data);
    ui.mode = 'plan'; busy = false;
    render();
  }

  function showResult(data) {
    return new Promise((res) => {
      data.onNext = res;
      if (panels && panels.showResult) {
        const p = panels.showResult(api, data);
        if (p && typeof p.then === 'function') p.then(res);
      } else {
        askModal(data.win ? '這回合贏了' : '這回合輸了', `得分 +${data.roundScore ?? 0}`, [{ label: '下一回合', primary: true }]).then(res);
      }
    });
  }
  function showOver(data) {
    return new Promise((res) => {
      const off = api.on('restart', () => { off(); res(); });
      const info = { cleared: !!data.cleared, endBonus: data.finish?.endBonus, score: api.state.score, round: data.round ?? api.state.round, bestTraits: api.bestTraits ? api.bestTraits() : [] };
      if (panels && panels.showGameOver) panels.showGameOver(api, info);
      else askModal(data.cleared ? '通關！' : '遊戲結束', `總分 ${api.state.score}，到第 ${api.state.round} 回合`, [{ label: '再玩一次', primary: true }]).then(() => api.restart());
      // 最高分（SPEC 4.10）：面板先讀舊紀錄，再寫新的
      if (!new URLSearchParams(location.search).has('seed')) try {   // ?seed= 測試局不寫最高分
        const old = JSON.parse(localStorage.getItem('trials19.best') || 'null');
        if (!old || info.score > old.score) localStorage.setItem('trials19.best', JSON.stringify({ score: info.score, round: info.round, date: new Date().toISOString().slice(0, 10) }));
      } catch (_) { /* 無痕模式 */ }
    });
  }

  // 測試掛鉤用：不播動畫直接打完
  ui.battleNow = async () => { if (ui.mode !== 'plan') return; const p = go(); await new Promise(r => setTimeout(r, 0)); skipBattle(); return p; };

  render();
  return { render };
}

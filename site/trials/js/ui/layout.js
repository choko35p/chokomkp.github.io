// 版面骨架與整體流程：建 DOM、分派 render、點選／拖曳／快捷鍵、佈陣⇄戰鬥切換。SPEC 1.9、5.1–5.4。
// 掛載點（給 U2／U3）：
//   [data-tt-mount=traits]  → traitbar.renderTraits(el, 我方羈絆, 敵方羈絆, api)（敵方羈絆畫在 [data-tt-enemy]）
//   .tt-board               → board.renderBoard；戰鬥時 el.__field 交給 battle.playBattle
//   面板：panels.showUnitPanel／showTraitPanel／showAugmentChoice／showReward／showResult／showGameOver／showHelp／showCodex
import { renderBoard, renderBench, renderItems, el, zhOf, costOf, itemZh } from './board.js';
import { renderShop } from './shopbar.js';
import { enableDnd } from './dnd.js';
import { sfx, setMuted, isMuted } from '../audio.js';

let traitbar = null, panels = null, battle = null;
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
  [traitbar, panels, battle] = await Promise.all([
    import('./traitbar.js').catch(() => null),
    import('./panels.js').catch(() => null),
    import('./battle.js').catch(() => null),
  ]);
  const { DATA } = api;
  const ui = api.ui;
  ui.mode = 'plan'; ui.sel = null; ui.speed = ui.speed || 2; ui.sellArm = null; ui.hoverUid = null;

  root.replaceChildren();
  const app = el('div', 'tt-shell', { 'data-phase': 'plan' });
  app.innerHTML = `
    <header class="tt-top"><div class="tt-top-in">
      <a class="tt-link" href="../?s=19" aria-label="回攻略站">← <span class="tt-hide-s">回攻略站</span></a>
      <h1>滴答克的試煉 <small>S19</small></h1>
      <button class="tt-ibtn" type="button" data-act="help" aria-label="說明">說明</button>
      <button class="tt-ibtn" type="button" data-act="mute" aria-pressed="false"></button>
    </div>
    <p class="tt-note">非官方重製｜名稱是暫譯，數值為推測，PBE 後更新</p></header>
    <main class="tt-app">
      <section class="tt-side" aria-label="狀態"></section>
      <div class="tt-center">
        <div class="tt-enemybar"></div>
        <div class="tt-board" aria-label="棋盤"></div>
        <div class="tt-battlebar">
          <div class="tt-speed" role="group" aria-label="戰鬥速度"></div>
          <div class="tt-rank" aria-label="即時傷害排行"></div>
        </div>
        <div class="tt-bench" aria-label="板凳"></div>
        <div class="tt-itemrow"><div class="tt-xitems" aria-label="裝備欄"></div>
          <button class="tt-sell" type="button" data-tt-drop="sell" data-tt-tap="sell"></button></div>
        <div class="tt-selbar" aria-live="polite"></div>
        <div class="tt-xshop"></div>
      </div>
      <aside class="tt-right"><div class="tt-traits" data-tt-mount="traits"></div>
        <button class="tt-xbtn tt-codexbtn" type="button" data-act="codex">羈絆圖鑑</button></aside>
    </main>
    <footer class="tt-foot" id="tt-foot"><p>非官方重製・名稱是暫譯，PBE 開了以後照官方繁中更新・S19 數值為推測｜本站與 Riot Games 無關；遊戲名稱與素材屬於其權利人。</p></footer>
    <div class="tt-toast" role="status" aria-live="polite"></div>`;
  root.append(app);

  const R = {
    side: $(app, '.tt-side'), enemy: $(app, '.tt-enemybar'), board: $(app, '.tt-board'), bench: $(app, '.tt-bench'),
    items: $(app, '.tt-xitems'), sell: $(app, '.tt-sell'), selbar: $(app, '.tt-selbar'), shop: $(app, '.tt-xshop'),
    traits: $(app, '[data-tt-mount=traits]'), toast: $(app, '.tt-toast'), speed: $(app, '.tt-speed'), rank: $(app, '.tt-rank'),
    mute: $(app, '[data-act=mute]'),
  };

  // ---- toast ----
  let toastT = null;
  api.toast = (msg) => { R.toast.textContent = msg; R.toast.classList.add('tt-xon'); clearTimeout(toastT); toastT = setTimeout(() => R.toast.classList.remove('tt-xon'), 2000); };

  // ---- 小工具 ----
  const stateUnits = () => [...api.state.board.filter(Boolean), ...api.state.bench.filter(Boolean)];
  const unitByUid = (uid) => stateUnits().find(u => u.uid === uid);
  const unitAt = (d) => d.k === 'board' ? api.state.board.find(u => u.pos && u.pos[0] === d.r && u.pos[1] === d.c)
    : d.k === 'bench' ? api.state.bench[d.i] : null;
  const popUsed = () => api.state.board.reduce((n, u) => n + (DATA.units.byKey[u.key]?.slots || 1), 0);
  const popMax = () => (api.teamLimit ? api.teamLimit() : api.state.level);
  const sellPrice = (u) => {
    const c = costOf(DATA, u.key), m = DATA.rules.sellPrice || { star2Mult: 3, star3Mult: 9, minus: 1 };
    if (c >= 7) return DATA.rules.sevenCost?.sellPrice ?? 7;
    if (u.star === 1) return c;
    if (c === 1) return u.star === 2 ? 3 : 9;
    return c * (u.star === 2 ? m.star2Mult : m.star3Mult) - m.minus;
  };
  const modalOpen = () => !!document.querySelector('.tt-fbmodal, [role=dialog], dialog[open], .tt-modal, .tt-panel-back');
  const setSel = (s) => { ui.sel = s; ui.sellArm = null; render(); };

  // ---- 狀態列 ----
  function renderStatus() {
    const s = api.state, r = DATA.rules;
    const interest = Math.min(Math.floor(s.gold / (r.income?.interestPer || 10)), r.income?.interestCap ?? 5);
    const need = r.xpToNext?.[String(s.level)];
    const maxLives = r.start?.lives || 3;
    const stat = (cls, label, val, extra, tag = 'span') => {
      const n = el(tag, 'tt-xstat ' + cls, tag === 'button' ? { type: 'button' } : {}, el('span', '', {}, label), el('b', 'tt-num', {}, val), extra || null);
      return n;
    };
    const lives = el('span', 'tt-xstat tt-lives', { 'aria-label': `命 ${s.lives}/${maxLives}` }, el('span', '', {}, '命'), el('b', '', { 'aria-hidden': 'true' }, '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, maxLives - s.lives))));
    const lv = stat('tt-lv', '等級', s.level, el('small', '', {}, need ? `　經驗 ${s.xp}/${need}` : '　滿級'), 'button');
    lv.setAttribute('aria-label', `等級 ${s.level}，點開看商店機率表`);
    lv.addEventListener('click', () => toggleOdds());
    const aug = el('span', 'tt-xstat tt-aug', { 'aria-label': '增幅' });
    (s.augments || []).forEach((k) => {
      const a = DATA.augments.byKey[k];
      const ab = el('button', 't' + (a?.tier || 1), { type: 'button', title: (a?.zh || k) + (a?.desc ? '：' + a.desc : ''), 'aria-label': '增幅：' + (a?.zh || k) + '，點一下看說明' }, '◆');
      ab.addEventListener('click', () => { if (panels && panels.showAugmentInfo) panels.showAugmentInfo(api, k); else api.toast((a?.zh || k) + (a?.desc ? '：' + a.desc : '')); });
      aug.append(ab);
    });
    const rounds = r.rounds?.length || 30;
    const nodes = [
      stat('tt-round', '回合', `${s.round}/${rounds}`), lives, lv,
      stat('tt-pop', '人口', `${popUsed()}/${popMax()}`),
      stat('tt-gold', '金錢', s.gold, el('small', '', {}, `　利息 +${interest}`)),
      stat('tt-score', '分數', (s.score || 0).toLocaleString('en-US')),
      stat('tt-streak', '連勝', s.streak || 0),
    ];
    if ((s.augments || []).length) nodes.push(aug);
    const pop = $(R.side, '.tt-oddspop');
    R.side.replaceChildren(...nodes);
    if (pop) R.side.append(pop);
  }
  function toggleOdds() {
    const ex = $(R.side, '.tt-oddspop');
    if (ex) { ex.remove(); return; }
    const t = el('table', '', { 'aria-label': '商店機率表' });
    t.append(el('tr', '', {}, el('th', '', {}, '等級'), ...[1, 2, 3, 4, 5].map(c => el('th', 'tt-cost' + c, {}, c + '費'))));
    for (let l = 1; l <= (DATA.rules.maxLevel || 10); l++) {
      const row = DATA.rules.shopOdds[String(l)]; if (!row) continue;
      const tr = el('tr', l === api.state.level ? 'tt-xcur' : '', {}, el('td', '', {}, l), ...row.map(p => el('td', '', {}, p ? p + '%' : '—')));
      t.append(tr);
    }
    const pop = el('div', 'tt-oddspop', { role: 'region', 'aria-label': '商店機率' }, t, el('div', '', {}, '（推測數值，PBE 後更新）'));
    R.side.append(pop);
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
  }

  // ---- 敵方列 ----
  function renderEnemyBar(enemy) {
    const n = [el('span', 'tt-ename', {}, '本回合對手：' + (enemy?.name || '—'))];
    if (enemy?.boss) n.push(el('span', 'tt-bossbadge', {}, '頭目'));
    const mount = el('span', '', { 'data-tt-enemy': '' });
    n.push(mount);
    R.enemy.replaceChildren(...n);
    return mount;
  }

  // ---- 羈絆列 ----
  function renderTraitsMount(enemy) {
    const s = api.state;
    const tp = api.countTraits ? api.countTraits(s.board.filter(Boolean), DATA, { augments: s.augments || [] }) : [];
    let te = enemy?.traitsPreview;
    if ((!te || !te.length) && enemy && api.countTraits) te = api.countTraits(enemy.units.map(u => ({ key: u.key, star: u.star, items: u.items || [] })), DATA, { augments: [] });
    if (traitbar && traitbar.renderTraits) { traitbar.renderTraits(R.traits, tp, te || [], api); return; }
    // 備用（U2 的 traitbar 不在時）
    const li = tp.filter(t => t.count >= 1).map(t => el('span', 'tt-selchip', {}, `${t.zh} ${t.count}/${t.next ?? '滿'}${t.active ? ' 啟動' : ''}`));
    R.traits.replaceChildren(...li);
  }

  // ---- 選取列（說明＋賣出＋合成表） ----
  function renderSelbar() {
    const s = ui.sel, sellEl = R.sell;
    const nodes = [];
    sellEl.className = 'tt-sell'; sellEl.disabled = false;
    sellEl.textContent = '賣出區';
    sellEl.setAttribute('aria-label', '賣出區：把棋子拖到這裡，或先選棋子再按這裡');
    if (s && s.kind === 'unit') {
      const u = unitByUid(s.uid);
      if (!u) { ui.sel = null; return renderSelbar(); }
      const price = sellPrice(u);
      const risky = u.star >= 3 || costOf(DATA, u.key) >= 7;
      if (ui.sellArm === u.uid) { sellEl.classList.add('tt-ready', 'tt-armed'); sellEl.textContent = '再按一次確認賣出'; }
      else { sellEl.classList.add('tt-ready'); sellEl.textContent = `賣出 +${price}金` + (risky ? '（要確認）' : ''); }
      sellEl.setAttribute('aria-label', `賣出 ${zhOf(DATA, u.key)}，得 ${price} 金`);
      const info = el('span', 'tt-xchip', {}, `${zhOf(DATA, u.key)} ${u.star}★`);
      const det = el('button', '', { type: 'button' }, '詳情'); det.addEventListener('click', () => openUnit(u));
      nodes.push(info, det, el('span', 'tt-muted', {}, '點空格或另一隻棋子＝移動／交換；再點同一隻＝取消'));
    } else if (s && s.kind === 'item') {
      const k = api.state.itemBench[s.idx];
      if (!k) { ui.sel = null; return renderSelbar(); }
      nodes.push(el('span', 'tt-xchip', {}, itemZh(DATA, k)), el('span', 'tt-muted', {}, '點棋子裝上去；兩個散件會自動合成。'));
      const isComp = !!DATA.items.compByKey?.[k];
      if (isComp) {
        const seen = new Set();
        for (const it of DATA.items.list || Object.values(DATA.items.byKey)) {
          if (!it.recipe || !it.recipe.includes(k)) continue;
          const other = it.recipe[0] === k ? it.recipe[1] : it.recipe[0];
          if (seen.has(other)) continue; seen.add(other);
          nodes.push(el('span', 'tt-xchip', {}, `＋${itemZh(DATA, other)}＝${it.zh}`));
        }
      } else { const d = DATA.items.byKey[k]?.desc; if (d) nodes.push(el('span', 'tt-xchip', {}, d)); }
    }
    R.selbar.replaceChildren(...nodes);
  }

  function openUnit(u) {
    if (panels && panels.showUnitPanel) panels.showUnitPanel(u, api);
    else askModal(zhOf(DATA, u.key) + ' ' + u.star + '★', '（棋子面板尚未接上）', [{ label: '關閉' }]);
  }

  // ---- 主要 render ----
  let curEnemy = null;
  function render() {
    renderStatus();
    if (ui.mode === 'battle') return;
    const s = api.state;
    curEnemy = api.enemy();
    renderEnemyBar(curEnemy);
    renderTraitsMount(curEnemy);
    renderBoard(R.board, api, { mode: 'plan', enemy: curEnemy });
    renderBench(R.bench, api);
    renderItems(R.items, api);
    renderSelbar();
    renderShop(R.shop, api);
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

  // ---- 動作 ----
  const toBoardDefault = (u) => {
    const front = ['Tank', 'Fighter'].includes(DATA.units.byKey[u.key]?.roleClass);
    const rows = front ? [0, 1, 2, 3] : [3, 2, 1, 0];
    const used = new Set(api.state.board.map(x => x.pos.join(',')));
    for (const r of rows) for (const c of FRONT_COLS) if (!used.has(r + ',' + c)) return { zone: 'board', pos: [r, c] };
    return null;
  };
  function doMove(u, d) {
    const to = d.k === 'board' ? { zone: 'board', pos: [d.r, d.c] } : { zone: 'bench', idx: d.i };
    return api.act('move', u.uid, to);
  }
  function doSell(u) {
    const needConfirm = u.star >= 3 || costOf(DATA, u.key) >= 7;
    if (needConfirm && ui.sellArm !== u.uid) { ui.sellArm = u.uid; ui.sel = { kind: 'unit', uid: u.uid }; api.toast('這隻比較貴，再按一次才會賣'); render(); setTimeout(() => { if (ui.sellArm === u.uid) { ui.sellArm = null; render(); } }, 3000); return; }
    ui.sel = null; ui.sellArm = null;
    api.act('sell', u.uid);
  }
  const bounce = () => { sfx('error'); render(); };

  function onTap(desc) {
    if (ui.mode !== 'plan' || modalOpen()) return;
    const d = parse(desc); if (!d) return;
    if (d.k === 'shop') { api.act('buy', d.i); return; }
    if (d.k === 'enemy') { if (panels && panels.showUnitPanel) panels.showUnitPanel(d.key, api); return; }
    if (d.k === 'item') {
      if (ui.sel && ui.sel.kind === 'item' && ui.sel.idx === d.i) return setSel(null);
      return setSel({ kind: 'item', idx: d.i });
    }
    if (d.k === 'sell') {
      if (ui.sel && ui.sel.kind === 'unit') { const u = unitByUid(ui.sel.uid); if (u) doSell(u); }
      else api.toast('先點一隻棋子，或直接拖到這裡賣');
      return;
    }
    const u = unitAt(d);
    const sel = ui.sel;
    if (sel && sel.kind === 'item') {
      if (u) { ui.sel = null; api.act('equip', sel.idx, u.uid); } else setSel(null);
      return;
    }
    if (sel && sel.kind === 'unit') {
      if (u && u.uid === sel.uid) return setSel(null);
      const me = unitByUid(sel.uid);
      ui.sel = null;
      if (me) doMove(me, d); else render();
      return;
    }
    if (u) { setSel({ kind: 'unit', uid: u.uid }); }
  }

  function onDrop(from, to) {
    if (ui.mode !== 'plan') return;
    const f = parse(from), t = parse(to);
    ui.sel = null; ui.sellArm = null;
    if (!t) return bounce();
    if (f.k === 'shop') { if (t.k === 'bench' || t.k === 'board') api.act('buy', f.i); else bounce(); return; }
    if (f.k === 'item') {
      const u = (t.k === 'board' || t.k === 'bench') ? unitAt(t) : null;
      if (u) api.act('equip', f.i, u.uid); else bounce();
      return;
    }
    const u = unitAt(f); if (!u) return bounce();
    if (t.k === 'sell') { doSell(u); return; }
    if (t.k === 'board' || t.k === 'bench') { api.act('move', u.uid, t.k === 'board' ? { zone: 'board', pos: [t.r, t.c] } : { zone: 'bench', idx: t.i }); return; }
    bounce();
  }
  enableDnd(app, { onTap, onDrop, onDragStart: () => { ui.dragging = true; }, onDragEnd: () => { ui.dragging = false; } });
  // 右鍵／雙擊棋子開面板（桌機）
  app.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('[data-tt-uid]'); if (!t) return;
    e.preventDefault(); const u = unitByUid(Number(t.dataset.ttUid)); if (u) openUnit(u);
  });
  app.addEventListener('dblclick', (e) => {
    const t = e.target.closest('[data-tt-uid]'); if (!t) return;
    const u = unitByUid(Number(t.dataset.ttUid)); if (u) openUnit(u);
  });
  // 懸停：記下滑鼠下的棋子（E／W 用）
  app.addEventListener('pointerover', (e) => { const t = e.target.closest?.('[data-tt-uid]'); ui.hoverUid = t ? Number(t.dataset.ttUid) : null; });
  app.addEventListener('pointerleave', () => { ui.hoverUid = null; });

  // ---- 頁首按鈕 ----
  const syncMute = () => { const m = isMuted(); R.mute.textContent = m ? '🔇' : '🔊'; R.mute.setAttribute('aria-pressed', String(m)); R.mute.setAttribute('aria-label', m ? '音效：關（點一下開啟）' : '音效：開（點一下關閉）'); };
  syncMute();
  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'mute') { setMuted(!isMuted()); syncMute(); }
    else if (a === 'help') showHelp();
    else if (a === 'codex') { if (panels && panels.showCodex) panels.showCodex(api); else api.toast('圖鑑還沒接上'); }
  });
  function showHelp() {
    if (panels && panels.showHelp) panels.showHelp({ onRestart: () => api.act('restart') });
    else askModal('說明', '30 回合、6 隻頭目、3 條命、沒有計時。非官方重製，數值為推測。快捷鍵：D 刷新、F 買經驗、E 賣出、W 上場／下板凳、1–5 買商店、Space 開戰。', [{ label: '知道了', primary: true }]);
  }
  api.showHelp = showHelp;
  if (!new URLSearchParams(location.search).has('seed')) { if (panels && panels.maybeShowHelpFirst) panels.maybeShowHelpFirst(); else try { if (!localStorage.getItem('trials19.helpSeen')) { localStorage.setItem('trials19.helpSeen', '1'); showHelp(); } } catch (_) { /* 無痕模式 */ } }

  // ---- 快捷鍵 ----
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    if (e.key === 'Escape') {
      if (modalOpen()) return;   // 面板自己處理
      if (ui.sel) { setSel(null); }
      const p = $(R.side, '.tt-oddspop'); if (p) p.remove();
      return;
    }
    if (modalOpen()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ui.mode === 'battle') {
      if (k === ' ') { e.preventDefault(); cycleSpeed(); }
      return;
    }
    const target = () => unitByUid(ui.hoverUid) || (ui.sel && ui.sel.kind === 'unit' ? unitByUid(ui.sel.uid) : null);
    if (k === 'd') api.act('reroll');
    else if (k === 'f') api.act('buyXp');
    else if (k === 'e') { const u = target(); if (u) doSell(u); else api.toast('先把滑鼠停在棋子上，或先選一隻'); }
    else if (k === 'w') {
      const u = target(); if (!u) { api.toast('先把滑鼠停在棋子上，或先選一隻'); return; }
      if (u.pos) { const i = api.state.bench.indexOf(null); if (i < 0) { api.toast('板凳滿了'); sfx('error'); } else { ui.sel = null; api.act('move', u.uid, { zone: 'bench', idx: i }); } }
      else { const to = toBoardDefault(u); if (!to) { api.toast('場上沒有空格了'); sfx('error'); } else { ui.sel = null; api.act('move', u.uid, to); } }
    }
    else if (k >= '1' && k <= '5') api.act('buy', Number(k) - 1);
    else if (k === ' ') { e.preventDefault(); go(); }
  });

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
    renderBoard(R.board, api, { mode: 'battle' });
    R.rank.replaceChildren();
    renderSpeed(); renderStatus();
    window.scrollTo({ top: 0 });
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
      try {
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

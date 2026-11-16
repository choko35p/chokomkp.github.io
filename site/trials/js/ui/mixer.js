// ILLBEATS 混音器面板（官方風格：深色底、橘色外框、四條直立推桿、右側總量計、RESET、ATTACK／MAGIC 預設鍵）。
// 桌機放舞台右側、手機是底部抽屜；收起時只剩一個小頁籤（顯示 已用/上限）。佈陣時可調、戰鬥中鎖住。
// 資料與換算都在 game.js 的 mixerInfo／actSetMixer／actMixerPreset／actMixerReset，這裡只管畫面和輸入。
import { el } from './board.js';
import { CH, CH_ZH } from '../mixer.js';

const ICON = {
  ad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20 17 4l3 1-1 3L6 21z" fill="#ff9f1c"/><path d="M14 4h6v6l-3-1z" fill="#ffd27a"/></svg>',
  ap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3c-9 0-15 5-16 14l4-2 1 3c2-2 3-4 3-6 3 1 5-1 6-4l-3 1 3-2-2-1z" fill="#6f6bff"/></svg>',
  hp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.5 12.5A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.5z" fill="#2fd45a"/></svg>',
  gold: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="13" rx="8" ry="6" fill="#f6d33a"/><ellipse cx="12" cy="11" rx="5.5" ry="3.4" fill="#fff0a0"/></svg>',
};
const ICON_BTN = {
  attack: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20 16 5l3 1-1 3L6 21z" fill="#2b2b2b"/><path d="M13 5h6v6z" fill="#2b2b2b"/></svg>',
  magic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3c-9 0-15 5-16 14l4-2 1 3c2-2 3-4 3-6 3 1 5-1 6-4l-3 1 3-2-2-1z" fill="#2b2b2b"/></svg>',
  gold: ICON.gold.replace('#f6d33a', '#2b2b2b').replace('#fff0a0', '#6b6b6b'),
  hp: ICON.hp.replace('#2fd45a', '#2b2b2b'),
};
const PLUS = '<b class="tt-mixplus">+</b>';
const svg = (html, cls) => { const s = el('span', cls || 'tt-mixic'); s.innerHTML = html; return s; };

const fmt = (ch, v) => (ch === 'ap' ? '+' + (Math.round(v * 10) / 10) : (Math.round(v * 1000) / 10).toFixed(1) + '%');

export function mountMixer(host, api) {
  host.replaceChildren();
  host.setAttribute('data-tt-noclear', '');
  const ui = api.ui;
  const tab = el('button', 'tt-mixtab', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'tt-mixbody', 'data-tt-noclear': '' });
  const tabTxt = el('b', 'tt-num', {}, '0/0');
  const tabU = el('span', 'tt-mixtab-u', {}, 'dB');
  tab.append(svg('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v13.2A3.5 3.5 0 1 0 11 19V8l8-2v8.2A3.5 3.5 0 1 0 21 17V3z" fill="currentColor"/></svg>', 'tt-mixtab-ic'), el('span', 'tt-mixtab-t', {}, '混音器'), tabTxt, tabU);
  const body = el('section', 'tt-mixbody', { id: 'tt-mixbody', role: 'group', 'aria-label': 'ILLBEATS 混音器', 'data-tt-noclear': '' });

  const closeBtn = el('button', 'tt-mixclose', { type: 'button', 'aria-label': '收合混音器' }, '收合 ▸');
  const status = el('span', 'tt-mixstatus', { role: 'status' });
  body.append(el('header', 'tt-mixhead', {}, el('b', '', {}, '混音器'), el('small', '', {}, 'ILLBEATS'), closeBtn));
  body.append(el('div', 'tt-mixlcd', {}, el('i', 'tt-mixlcd-dot', { 'aria-hidden': 'true' }), status));

  const chs = {};
  const bank = el('div', 'tt-mixbank');
  for (const ch of CH) {
    const pct = el('span', 'tt-mixpctv', {}, '0%');
    const rail = el('div', 'tt-mixrail');
    const fill = el('i', 'tt-mixfill');
    const knob = el('i', 'tt-mixknob');
    rail.append(fill, knob);
    const track = el('div', 'tt-mixtrack', { tabindex: '0', role: 'slider', 'aria-orientation': 'vertical', 'aria-label': CH_ZH[ch] + '推桿', 'aria-valuemin': '0', 'data-ch': ch, 'data-tt-noclear': '' }, rail);
    const dbv = el('b', 'tt-num', {}, '0');
    const col = el('div', 'tt-mixch', { 'data-ch': ch },
      el('div', 'tt-mixpct', {}, svg(ICON[ch]), pct), track, el('div', 'tt-mixdb', {}, dbv, el('small', '', {}, ' dB')));
    chs[ch] = { col, pct, rail, fill, knob, track, dbv };
    bank.append(col);
  }
  const resetBtn = el('button', 'tt-mixreset', { type: 'button' }, 'RESET');
  const meter = el('div', 'tt-mixmeter', { 'aria-hidden': 'true' });
  const tot = el('div', 'tt-mixtot', {}, el('b', 'tt-num', {}, '0/0'), el('small', '', {}, ' dB'));
  body.append(el('div', 'tt-mixmain', {}, bank, el('div', 'tt-mixside', {}, resetBtn, meter, tot)));

  const presetBtns = {};
  const mkGroup = (group, title, list) => {
    const g = el('div', 'tt-mixgroup', {}, el('h4', '', {}, title));
    const row = el('div', 'tt-mixprow');
    for (const p of list) {
      const b = el('button', 'tt-mixpre', { type: 'button', 'data-preset': p.id, 'aria-label': `${group === 'attack' ? 'ATTACK' : 'MAGIC'} 預設：${p.zh}`, title: p.zh });
      const a = group === 'attack' ? ICON_BTN.attack : ICON_BTN.magic;
      const z = group === 'attack' ? ICON_BTN.gold : ICON_BTN.hp;
      b.innerHTML = a + PLUS + z;
      b.append(el('span', 'tt-mixpre-t', {}, p.zh));
      presetBtns[p.id] = b; row.append(b);
    }
    g.append(row); return g;
  };
  const presets = api.mixer ? api.mixer.info().presets : [];
  body.append(el('div', 'tt-mixpresets', {}, mkGroup('attack', 'ATTACK PRESETS', presets.filter(p => p.group === 'attack')), mkGroup('magic', 'MAGIC PRESETS', presets.filter(p => p.group === 'magic'))));
  const note = el('p', 'tt-mixnote');
  body.append(note);
  host.append(tab, body);

  let info = null;
  const setOpen = (v) => {
    ui.mixOpen = !!v;
    if (v && ui.sel) { ui.sel = null; }       // 右側欄和棋子資訊共用：打開混音器就取消選取
    api.emit('change');
  };
  tab.addEventListener('click', () => setOpen(!ui.mixOpen));
  closeBtn.addEventListener('click', () => { setOpen(false); tab.focus(); });
  resetBtn.addEventListener('click', () => { if (!info || info.locked) return; api.act('mixerReset'); });
  for (const [id, b] of Object.entries(presetBtns)) b.addEventListener('click', () => { if (!info || info.locked) return; api.act('mixerPreset', id); });

  // ---- 推桿輸入：指標拖曳＋鍵盤 ----
  const valueAt = (ch, ev) => {
    const r = chs[ch].rail.getBoundingClientRect();
    const f = 1 - (ev.clientY - r.top) / Math.max(1, r.height);
    return Math.round(Math.max(0, Math.min(1, f)) * info.cap);
  };
  const apply = (ch, v) => { if (info.locked) return; const cur = info.db[CH.indexOf(ch)]; if (v !== cur) api.act('setMixer', ch, v); };
  for (const ch of CH) {
    const t = chs[ch].track;
    let dragging = false;
    t.addEventListener('pointerdown', (e) => {
      if (!info || !info.active) return;
      if (e.button != null && e.button !== 0) return;
      if (info.locked) { api.toast('戰鬥中混音器鎖住，下一回合佈陣再調'); return; }
      dragging = true; t.setPointerCapture && t.setPointerCapture(e.pointerId);
      t.classList.add('tt-drag'); host.dataset.drag = ch;
      apply(ch, valueAt(ch, e)); e.preventDefault();
    });
    t.addEventListener('pointermove', (e) => { if (dragging) apply(ch, valueAt(ch, e)); });
    const end = (e) => { if (!dragging) return; dragging = false; t.classList.remove('tt-drag'); delete host.dataset.drag; try { t.releasePointerCapture(e.pointerId); } catch (_) { /* 略過 */ } };
    t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); t.addEventListener('lostpointercapture', end);
    t.addEventListener('keydown', (e) => {
      if (!info || !info.active) return;
      const cur = info.db[CH.indexOf(ch)];
      const k = e.key;
      let v = null;
      if (k === 'ArrowUp' || k === 'ArrowRight') v = cur + 1;
      else if (k === 'ArrowDown' || k === 'ArrowLeft') v = cur - 1;
      else if (k === 'PageUp') v = cur + 3;
      else if (k === 'PageDown') v = cur - 3;
      else if (k === 'Home') v = 0;
      else if (k === 'End') v = cur + info.free;
      if (v == null) return;
      e.preventDefault(); e.stopPropagation();
      apply(ch, Math.max(0, v));
    });
  }

  function update() {
    info = api.mixer ? api.mixer.info() : null;
    if (!info || !info.active) { host.hidden = true; return; }
    host.hidden = false;
    // 第一次啟動（桌機、沒選別的東西）自動展開一次，之後照玩家的選擇；手機只讓頁籤閃一下，不蓋住商店
    if (!ui.mixSeen) {
      ui.mixSeen = true;
      const desk = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px) and (orientation: landscape)').matches;
      if (desk && !ui.sel && ui.mode === 'plan') ui.mixOpen = true;
      else { tab.classList.remove('tt-flash'); void tab.offsetWidth; tab.classList.add('tt-flash'); }
    }
    if (ui.mixOpen && ui.sel && ui.mode !== 'battle') ui.mixOpen = false;   // 選了棋子／道具：右側改給資訊欄，混音器收成頁籤
    // 手機：開戰後棋盤變大，抽屜會蓋到戰場，所以一開戰就收成頁籤
    if (ui.mixOpen && ui.mode === 'battle' && typeof matchMedia === 'function' && matchMedia('(max-width: 1023px), (orientation: portrait)').matches) ui.mixOpen = false;
    const open = !!ui.mixOpen;
    host.dataset.open = open ? '1' : '0';
    tab.setAttribute('aria-expanded', String(open));
    host.classList.toggle('tt-locked', info.locked);
    host.dataset.tier = String(info.tier);
    tabTxt.textContent = `${info.used}/${info.cap}`;
    tabU.textContent = info.locked ? 'dB・鎖定' : 'dB';
    tab.classList.toggle('tt-mixempty', info.used === 0);
    tab.title = `ILLBEATS 混音器：已用 ${info.used}／${info.cap} 分貝${info.used === 0 ? '（還沒分配）' : ''}`;
    status.textContent = info.locked ? '戰鬥中：鎖住' : info.used === 0 ? '佈陣中：拖推桿分配分貝' : info.free > 0 ? `佈陣中：還有 ${info.free} 分貝沒分` : '佈陣中：分貝用完了';
    for (const ch of CH) {
      const c = chs[ch], i = CH.indexOf(ch), v = info.db[i];
      const f = info.cap ? v / info.cap : 0;
      c.fill.style.height = (f * 100) + '%';
      c.knob.style.bottom = (f * 100) + '%';
      c.pct.textContent = fmt(ch, info.values[ch]);
      c.dbv.textContent = String(v);
      c.col.classList.toggle('tt-on', v > 0);
      const t = c.track;
      t.setAttribute('aria-valuemax', String(Math.min(info.cap, v + info.free)));
      t.setAttribute('aria-valuenow', String(v));
      t.setAttribute('aria-valuetext', `${CH_ZH[ch]} ${v} 分貝，成員 ${fmt(ch, info.values[ch])}`);
      t.setAttribute('aria-disabled', String(info.locked));
      t.title = `${CH_ZH[ch]}：每 1 分貝成員 ${ch === 'ap' ? '+' + Math.round(info.per[ch] * 10) / 10 + ' 法強' : (Math.round(info.per[ch] * 1000) / 10) + '%' + (ch === 'gold' ? ' 機率（我方擊殺拿 1 金）' : ch === 'hp' ? ' 生命' : ' 攻擊')}（推測）`;
      // 刻度：每 1 分貝一格
      if (t.dataset.cap !== String(info.cap)) {
        t.dataset.cap = String(info.cap);
        for (const x of c.rail.querySelectorAll('.tt-mixtick')) x.remove();
        for (let k = 0; k <= info.cap; k++) c.rail.append(el('i', 'tt-mixtick' + (k % 5 === 0 ? ' tt-major' : ''), { style: `bottom:${(k / info.cap) * 100}%` }));
      }
    }
    // 總量計：cap 格，亮 used 格
    if (meter.childElementCount !== info.cap) { meter.replaceChildren(...Array.from({ length: info.cap }, () => el('i'))); }
    [...meter.children].forEach((s, k) => s.classList.toggle('tt-lit', info.cap - k <= info.used));
    tot.firstChild.textContent = `${info.used}/${info.cap}`;
    resetBtn.disabled = info.locked || info.used === 0;
    for (const [id, b] of Object.entries(presetBtns)) b.disabled = info.locked;
    note.textContent = `成員拿全額，其他隊友拿 ${Math.round(info.teamShare * 100)}%${info.boost > 1 ? `；${info.bp} 階混音再強 ${Math.round((info.boost - 1) * 100)}%` : ''}。每分貝數值與預設比例是推測。`;
  }
  return { update, el: host };
}

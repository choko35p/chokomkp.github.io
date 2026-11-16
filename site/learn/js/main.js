// 進入點：載資料 → 讀進度 → 開關卡。網址 learn/#<關卡id> 直接開那一關。
import { indexLearn } from './lesson.js';
import { mountApp, makeStore } from './ui.js';

const FILES = ['units', 'traits', 'items', 'augments', 'rules', 'enemies', 'unlocks', 'lessons'];

function showFatal(msg) {
  const root = document.getElementById('tt-root');
  const p = Object.assign(document.createElement('p'), { className: 'tt-fatal', textContent: msg });
  p.append(' ', Object.assign(document.createElement('a'), { href: '../', textContent: '回攻略站' }));
  root.replaceChildren(p);
}

async function boot() {
  const raw = {};
  await Promise.all(FILES.map(async (n) => {
    const r = await fetch('./data/' + n + '.json');
    if (!r.ok) throw new Error('載入失敗：' + n + '.json（' + r.status + '）');
    raw[n] = await r.json();
  }));
  const LD = indexLearn(raw);
  let storage = null;
  try { storage = window.localStorage; } catch (_) { storage = null; }
  const q = new URLSearchParams(location.search);
  const s = q.get('s');
  const search = s && /^\d+$/.test(s) ? '?s=' + s : '';
  const store = makeStore(storage);
  const hashId = decodeURIComponent(location.hash.slice(1));
  const app = await mountApp(document.getElementById('tt-root'), LD, store, { backHref: '../' + search + '#learn', search, hashId });
  if (!hashId && LD.lessons.every(l => store.get().play.done.includes(l.id))) app.api.toast('12 關都過了，想重玩哪一關都可以');
  window.addEventListener('hashchange', () => { const id = decodeURIComponent(location.hash.slice(1)); if (LD.lessons.some(l => l.id === id)) app.openLesson(id); });
}

boot().catch((e) => { console.error(e); showFatal('載入失敗：' + (e && e.message ? e.message : e)); });

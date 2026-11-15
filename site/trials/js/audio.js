// 滴答克的試煉：音效（SPEC_UI2 第 6 章）。
// 有 sfx/index.json 就載入官方取樣音檔；沒有（或載入失敗）就用 WebAudio 合成音。
// 第一次使用者互動後才建立 AudioContext；音量記在 localStorage['trials19.vol']（預設 0.5）；靜音 ['trials19.mute']。
const MUTE_KEY = 'trials19.mute';
const VOL_KEY = 'trials19.vol';
const SYNTH_MULT = 0.5;      // 合成音＝音量值 × 0.5（維持原本 0.25 的大小）
const SFX_BASE = new URL('../sfx/', import.meta.url).href;

let ctx = null, master = null, sampleBus = null, noiseBuf = null;
let muted = false;
let volume = 0.5;
const samples = {};        // 檔名（不含副檔名）-> AudioBuffer
let loadStarted = false, warned = false;
let unlocked = false;   // 有過使用者互動才建立 AudioContext
const last = {};   // 節流用，以 ctx.currentTime 計

try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }
try {
  const v = localStorage.getItem(VOL_KEY);
  if (v !== null && v !== '' && Number.isFinite(Number(v))) volume = Math.min(1, Math.max(0, Number(v)));
} catch (e) { volume = 0.5; }

const applyGain = () => {
  if (master) master.gain.value = muted ? 0 : volume * SYNTH_MULT;
  if (sampleBus) sampleBus.gain.value = muted ? 0 : volume;
};

function ensure() {
  if (!unlocked) return null;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sampleBus = ctx.createGain();
  sampleBus.connect(ctx.destination);
  applyGain();
  const n = Math.floor(ctx.sampleRate * 0.2);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 12345;   // 固定種子的簡單亂數，讓噪音每次一樣
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
  return ctx;
}

// 第一次互動才建立（瀏覽器規定）
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    ensure();
    loadSamples();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function env(g, t0, dur, vol) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.005);               // attack 5ms
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, 0.01));   // 指數衰減
}

// 振盪器：type, f0→f1（Hz）, 起點秒, 長度秒, 音量, 可選濾波
function tone(type, f0, f1, t0, dur, vol, filt) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  env(g, t0, dur, vol);
  let node = o;
  if (filt) {
    const f = ctx.createBiquadFilter();
    f.type = filt.type; f.frequency.value = filt.f;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(t0, dur, vol, filt) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuf;
  f.type = filt.type; f.frequency.value = filt.f;
  env(g, t0, dur, vol);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0); s.stop(t0 + Math.min(dur + 0.02, 0.2));
}

// 依序播音：[[freq, 秒]...]，每個音接著上一個
function seq(type, notes, t0, vol) {
  let t = t0;
  for (const [f, d] of notes) { tone(type, f, f, t, d, vol); t += d; }
  return t;
}

const D = {
  buy: (t) => tone('triangle', 660, 880, t, 0.09, 0.8),
  sell: (t) => { tone('triangle', 520, 330, t, 0.11, 0.7); tone('sine', 1320, 1320, t, 0.04, 0.5); },
  reroll: (t) => [420, 470, 520, 570, 620].forEach((f, i) => tone('square', f, f, t + i * 0.028, 0.025, 0.5)),
  xp: (t) => tone('sine', 440, 660, t, 0.12, 0.8),
  levelup: (t) => seq('triangle', [[523, .07], [659, .07], [784, .07], [1047, .07]], t, 0.8),
  place: (t) => { tone('sine', 220, 220, t, 0.05, 0.8); noise(t, 0.03, 0.6, { type: 'lowpass', f: 800 }); },
  error: (t) => tone('square', 160, 160, t, 0.12, 0.4),
  star2: (t) => seq('triangle', [[659, .09], [988, .09]], t, 0.8),
  star3: (t) => { const e = seq('triangle', [[659, .09], [988, .09], [1319, .09], [1976, .09]], t, 0.8); tone('sine', 2637, 2637, e, 0.3, 0.6); },
  equip: (t) => { tone('square', 880, 880, t, 0.03, 0.5); tone('square', 1175, 1175, t + 0.03, 0.05, 0.5); },
  craft: (t) => { noise(t, 0.06, 0.6, { type: 'bandpass', f: 3000 }); tone('triangle', 1047, 1047, t, 0.15, 0.7); },
  trait: (t) => { tone('sine', 784, 784, t, 0.18, 0.6); tone('sine', 1175, 1175, t, 0.18, 0.6); },
  start: (t) => tone('sawtooth', 110, 220, t, 0.3, 0.7, { type: 'lowpass', f: 1200 }),
  hit: (t) => noise(t, 0.02, 0.3, { type: 'highpass', f: 2000 }),
  cast: (t) => tone('sine', 880, 1320, t, 0.1, 0.7),
  death: (t) => tone('triangle', 300, 90, t, 0.18, 0.8),
  win: (t) => { const e = seq('triangle', [[523, .1], [659, .1], [784, .1]], t, 0.8); tone('triangle', 1047, 1047, e, 0.25, 0.8); },
  lose: (t) => seq('triangle', [[392, .15], [330, .15], [262, .15]], t, 0.8),
  boss: (t) => { tone('sawtooth', 82, 82, t, 0.6, 0.7, { type: 'lowpass', f: 600 }); tone('sawtooth', 98, 98, t, 0.6, 0.7, { type: 'lowpass', f: 600 }); },
  pick: (t) => seq('sine', [[988, .08], [1319, .08]], t, 0.8),
  coin: (t) => seq('sine', [[1568, .04], [2093, .06]], t, 0.7),
  pickup: (t) => tone('sine', 300, 380, t, 0.05, 0.6),
  select: (t) => tone('sine', 520, 520, t, 0.03, 0.4),
  unlock: (t) => { const e = seq('triangle', [[784, .08], [988, .08], [1319, .08]], t, 0.8); tone('sine', 1976, 1976, e, 0.25, 0.6); },
};

// 程式音效名 -> 官方音檔檔名（不含副檔名）。檔在 sfx/，列在 sfx/index.json 才會用
export const FILE = {
  buy: 'buy', sell: 'sell', reroll: 'reroll', xp: 'buyxp', levelup: 'levelup', star2: 'star2', star3: 'star3',
  pickup: 'pickup', place: 'drop', start: 'battle_start', win: 'win', lose: 'lose', pick: 'augment', coin: 'gold',
};

const THROTTLE = { hit: 0.06, cast: 0.12, coin: 0.08 };   // 秒

function warnOnce(msg) {
  if (warned) return;
  warned = true;
  try { console.warn('[trials audio] ' + msg); } catch (e) { /* 沒有 console */ }
}

// 載入官方音檔：抓 sfx/index.json → 逐檔 fetch＋decode。任何一步失敗就略過，遊戲照常（用合成音）。
// deps 給測試用：{ctx, fetch, base, canOgg}。沒有 AudioContext（或沒有 fetch）就什麼都不做、不發請求。
export async function loadSamples(deps = {}) {
  const c = deps.ctx || ctx;
  const f = deps.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!c || !f) return false;
  if (!deps.ctx) { if (loadStarted) return false; loadStarted = true; }
  const base = deps.base || SFX_BASE;
  let index;
  try {
    const r = await f(base + 'index.json');
    if (!r || !r.ok) return false;                 // 沒有 index.json ＝ 全部用合成音，不發任何音檔請求
    index = await r.json();
  } catch (e) { return false; }
  const names = Array.isArray(index && index.names) ? index.names : [];
  let exts = Array.isArray(index && index.ext) && index.ext.length ? index.ext : ['ogg'];
  let canOgg = deps.canOgg;
  if (canOgg === undefined) {
    try { canOgg = !!(typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs=vorbis')); } catch (e) { canOgg = false; }
  }
  exts = (canOgg ? ['ogg', 'mp3'] : ['mp3']).filter(x => exts.includes(x));   // 解不了 ogg（iPhone／舊 Safari）就只抓 mp3
  const stems = [...new Set(names.filter(n => typeof n === 'string' && n).map(n => FILE[n] || n))];
  await Promise.all(stems.map(async (stem) => {
    for (const ext of exts) {
      try {
        const r = await f(base + stem + '.' + ext);
        if (!r || !r.ok) continue;
        const buf = await c.decodeAudioData(await r.arrayBuffer());
        if (buf) { samples[stem] = buf; return; }
      } catch (e) { /* 換下一種格式 */ }
    }
    warnOnce('音檔載入失敗，改用合成音：' + stem);
  }));
  return true;
}

export function sfx(name) {
  const fn = D[name];
  if (!fn || muted) return;
  if (!ensure()) return;
  if (ctx.state !== 'running') return;   // 還沒有使用者互動就不播
  const now = ctx.currentTime;
  const gap = THROTTLE[name];
  if (gap) {
    if (last[name] !== undefined && now - last[name] < gap) return;
    last[name] = now;
  }
  try {
    const buf = FILE[name] ? samples[FILE[name]] : null;
    if (buf) {   // 官方取樣音
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(sampleBus);
      s.start(now);
      return;
    }
    fn(now + 0.005);   // 沒有音檔：合成音
  } catch (e) { /* 音效失敗不影響遊戲 */ }
}

export function setVolume(v) {
  const n = Number(v);
  volume = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : volume;
  try { localStorage.setItem(VOL_KEY, String(volume)); } catch (e) { /* 無痕模式 */ }
  applyGain();
}
export function getVolume() { return volume; }

export function setMuted(b) {
  muted = !!b;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 無痕模式 */ }
  applyGain();
}

export function isMuted() { return muted; }
export const SFX_NAMES = Object.keys(D);

export function hasSample(stem) { return !!samples[stem]; }

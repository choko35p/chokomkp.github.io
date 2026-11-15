// 滴答克的試煉：WebAudio 合成音效（SPEC 5.7）。不使用任何外部音效檔。
// 第一次使用者互動後才建立 AudioContext；總音量 0.25；靜音記在 localStorage['trials19.mute']。
const MUTE_KEY = 'trials19.mute';
const MASTER = 0.25;

let ctx = null, master = null, noiseBuf = null;
let muted = false;
let unlocked = false;   // 有過使用者互動才建立 AudioContext
const last = {};   // 節流用，以 ctx.currentTime 計

try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

function ensure() {
  if (!unlocked) return null;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  master.connect(ctx.destination);
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
};

const THROTTLE = { hit: 0.06, cast: 0.12 };   // 秒

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
  try { fn(now + 0.005); } catch (e) { /* 音效失敗不影響遊戲 */ }
}

export function setMuted(b) {
  muted = !!b;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 無痕模式 */ }
  if (master) master.gain.value = muted ? 0 : MASTER;
}

export function isMuted() { return muted; }
export const SFX_NAMES = Object.keys(D);

// 看圖辨識的 Web Worker：收到頭像精靈圖就建模板，收到截圖就辨識，進度一路回報。
import { buildTemplates, recognize } from './recog-core.js';
let T = null;
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      T = buildTemplates({ data: new Uint8ClampedArray(m.data), w: m.w, h: m.h }, m.cols, m.rows, m.map);
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'run') {
      let last = -1;
      const items = recognize({ data: new Uint8ClampedArray(m.data), w: m.w, h: m.h }, T, m.opts || {}, (p) => {
        const q = Math.floor(p * 50);
        if (q !== last) { last = q; self.postMessage({ type: 'progress', p }); }
      });
      self.postMessage({ type: 'done', items });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};

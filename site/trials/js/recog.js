// recog.js：看圖匯入的主執行緒這一半。圖片只在瀏覽器裡處理，不會送到任何伺服器。
//   const r = createRecognizer(DATA);
//   const out = await r.run(file, { onProgress(p), signal });  → { items:[{x,y,size,score,sure,cands:[{key,score}]}], w, h, scale, canvas }
// 座標是縮放後那張圖的座標（out.canvas 就是那張圖，確認畫面直接拿來裁頭像）。
const TARGET_MIN = 1200;      // 圖太小就放大（頭像才夠大），最多放大到 3 倍
const MAX_PIXELS = 4500000;   // 圖太大就縮小，省記憶體與時間

export async function decodeImage(file) {
  let bmp = null;
  if (typeof createImageBitmap === 'function') { try { bmp = await createImageBitmap(file); } catch (_) { bmp = null; } }
  if (!bmp) {
    bmp = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('這個檔案不是圖片，或瀏覽器打不開。')); };
      img.src = url;
    });
  }
  const w0 = bmp.width, h0 = bmp.height;
  let k = 1;
  if (Math.max(w0, h0) < TARGET_MIN) k = Math.min(3, TARGET_MIN / Math.max(w0, h0));
  if (w0 * h0 * k * k > MAX_PIXELS) k = Math.sqrt(MAX_PIXELS / (w0 * h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);   // 透明背景當白底
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return { canvas: cv, w, h, scale: k, data: g.getImageData(0, 0, w, h) };
}

async function spritePixels(DATA) {
  const sp = DATA.units.sprite;
  const url = new URL(sp.src, document.baseURI).href;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('頭像圖載入失敗')); i.src = url; });
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  return { px: g.getImageData(0, 0, cv.width, cv.height), cols: sp.cols || 10, rows: sp.rows || 10, map: sp.map };
}

export function createRecognizer(DATA) {
  let worker = null, ready = null, sprite = null, core = null;
  const hasWorker = typeof Worker !== 'undefined';

  async function init() {
    sprite = sprite || await spritePixels(DATA);
    if (hasWorker) {
      try {
        worker = new Worker(new URL('./recog.worker.js', import.meta.url), { type: 'module' });
        await new Promise((res, rej) => {
          worker.onmessage = (e) => { if (e.data.type === 'ready') res(); else if (e.data.type === 'error') rej(new Error(e.data.message)); };
          worker.onerror = (e) => rej(new Error(e.message || 'worker 起不來'));
          const buf = sprite.px.data.buffer.slice(0);
          worker.postMessage({ type: 'init', data: buf, w: sprite.px.width, h: sprite.px.height, cols: sprite.cols, rows: sprite.rows, map: sprite.map }, [buf]);
        });
        return;
      } catch (_) { try { worker && worker.terminate(); } catch (e) { /* 略過 */ } worker = null; }
    }
    // 退路：瀏覽器不支援模組 Worker 就在主執行緒算（算的時候畫面會停一下）
    core = await import('./recog-core.js');
    core.T = core.buildTemplates({ data: sprite.px.data, w: sprite.px.width, h: sprite.px.height }, sprite.cols, sprite.rows, sprite.map);
  }

  return {
    get usesWorker() { return !!worker; },
    // file：File／Blob。回傳 {items, w, h, scale, canvas}
    async run(file, { onProgress = () => {}, signal } = {}) {
      if (signal && signal.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' });
      const img = await decodeImage(file);
      onProgress(0.02);
      if (!ready) ready = init();
      await ready;
      onProgress(0.05);
      let items;
      if (worker) {
        items = await new Promise((res, rej) => {
          const stop = () => { try { worker.terminate(); } catch (_) { /* 略過 */ } worker = null; ready = null; rej(Object.assign(new Error('已取消'), { name: 'AbortError' })); };
          if (signal) signal.addEventListener('abort', stop, { once: true });
          worker.onmessage = (e) => {
            const m = e.data;
            if (m.type === 'progress') onProgress(0.05 + 0.95 * m.p);
            else if (m.type === 'done') res(m.items);
            else if (m.type === 'error') rej(new Error(m.message));
          };
          worker.onerror = (e) => rej(new Error(e.message || '辨識出錯'));
          const buf = img.data.data.buffer.slice(0);
          worker.postMessage({ type: 'run', data: buf, w: img.w, h: img.h }, [buf]);
        });
      } else {
        items = core.recognize({ data: img.data.data, w: img.w, h: img.h }, core.T, {}, (p) => onProgress(0.05 + 0.95 * p));
      }
      onProgress(1);
      return { items, w: img.w, h: img.h, scale: img.scale, canvas: img.canvas };
    },
    dispose() { try { worker && worker.terminate(); } catch (_) { /* 略過 */ } worker = null; ready = null; },
  };
}

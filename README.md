# 巧克力MKP的戰棋研究室

聯盟戰棋選陣速查與陣容研究：https://chokomkp.com/

網站檔案在 `site/`，部署在 Cloudflare Workers（`wrangler.jsonc`）。

這個專案只放公開的網站檔案；研究資料與工具不在這裡。

## 站主專用讀者統計（/stats）

- `worker/`：只處理 `https://chokomkp.com/stats`，其他網址照舊直接給 `site/` 的靜態檔案。
- 數字是打開頁面時直接向 Cloudflare 查的（Web Analytics＋網站流量），不存任何讀者資料。
- 兩道鎖：Cloudflare Access（只放行站主信箱）＋程式再驗一次 Access 通行證。`ACCESS_TEAM`、`ACCESS_AUD` 空白時一律不給看。
- 讀取金鑰放在 Cloudflare 後台的密鑰 `CF_API_TOKEN`（權限：Account Analytics 讀取、Zone Analytics 讀取），不要寫進這個專案。
- 改畫面：編輯 `worker/stats.html` 後執行 `node worker/build_page.mjs`；測試：`node worker/test.mjs`。
- 推網站檔案時，不要刪掉 `worker/`，也不要拿掉 `wrangler.jsonc` 裡的 `main`、`run_worker_first`、`vars`。

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

## 快取設定（site/_headers）

- `site/_headers` 讓圖示、字型留在讀者的瀏覽器裡，回訪時不用重新下載。推網站檔案時請保留這個檔案。
- 圖示記 1 天（換圖最慢隔天生效）；字型記 30 天；`data/`、`app.js`、`style.css`、`index.html` 不受影響，每次都會拿最新的。

## 首頁功能點擊紀錄（/e/，2026-11-23）

- 站主 11/23：「要補，直接更新正式網」「我還要知道多少人點了高手教學或是滴答克等其他東西」。
- `worker/` 在首頁 HTML 結尾加一支小程式 `/e/t.js`：網址的 # 變了（陣容頁、小百科、新手教學…）就對 `/e/v/<#後面>` 送一個空請求，同一次瀏覽同一個只送一次。Worker 回 204，不存任何東西；次數從 Cloudflare 網站流量統計算。不用 cookie、不帶讀者資料。
- 這樣 S19 各套陣容（`#c-s19-…`）的打開次數也看得到。`site/app.js` 沒改，網站重新建置不會蓋掉。
- 高手教學庫（/pros/）、滴答克的試煉（/trials/）、模擬器（/sim/）、新手教學（/learn/）是獨立頁面，統計頁直接用 Web Analytics 的頁面路徑算。

## S19 裝備改動區（2026-11-24）

- 站主 11/24：「s19甚麼時候偷改裝備我都不知道」→「放到正式網上面，弄一區固定的」。
- S19 首頁 T 表下面一區「S19 裝備改動」，導覽列多一個「裝備改動」（只有 S19 有）。
- 資料：`site/data/s19/item-changes.json`（手動整理，**建置不會產生**）；程式：`site/app.js` 的 `renderItems19()`，CSS 在 `style.css` 的「S19 裝備改動」。
- **重建網站時要保留**：換 `site/` 前先把 `site/data/s19/item-changes.json` 留下來；`app.js` 用建置版時要把 `renderItems19` 和導覽那一行補回去。
- 分組：官方每天公告沒寫的（S18 正式服 vs S19 PBE 遊戲資料比對）／PBE 第 N 天有公告的（Truexy 改動圖）／只改說明文字。之後 PBE 再改裝備，照日期加一組。

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/page.js
var page_default = '<!doctype html>\n<html lang="zh-Hant-TW">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">\n<title>\u8B80\u8005\u7D71\u8A08\uFF5C\u5DE7\u514B\u529BMKP\u7684\u6230\u68CB\u7814\u7A76\u5BA4</title>\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<style>\n:root{--bg:#f6f5f2;--surface:#fff;--surface-2:#f6f5f2;--line:#e4e1dc;--text:#242321;--muted:#57534e;--accent:#984336;--bar:#984336;--cream:#fdf0d6;--warn-bg:#fff6e5;--warn-line:#c98a1b;--focus:#1d5fbf;--r:10px}\n@media (prefers-color-scheme:dark){:root{--bg:#1b1a19;--surface:#232120;--surface-2:#2c2a28;--line:#44403c;--text:#f3efe9;--muted:#c4bdb4;--accent:#e9a48f;--bar:#cf7258;--cream:#3a2c22;--warn-bg:#3a2e17;--warn-line:#c98a1b;--focus:#7aa7ff}}\n*{box-sizing:border-box}\nbody{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif}\n.w{max-width:1040px;margin:0 auto;padding:16px 16px 48px}\nheader{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:4px 0 16px}\nheader img{width:36px;height:36px}\nh1{font-size:1.25rem;margin:0;font-weight:800}\n.sub{color:var(--muted);font-size:.875rem}\n.bar-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:2}\n.seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--surface)}\n.seg button{border:0;background:none;color:var(--text);font:inherit;font-size:.875rem;padding:6px 14px;cursor:pointer;min-height:36px}\n.seg button[aria-pressed="true"]{background:var(--accent);color:#fff;font-weight:700}\n@media (prefers-color-scheme:dark){.seg button[aria-pressed="true"]{color:#1b1a19}}\n.chk{display:inline-flex;align-items:center;gap:6px;font-size:.875rem;border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:var(--surface);min-height:36px;cursor:pointer}\n.btn{border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:999px;font:inherit;font-size:.875rem;padding:6px 14px;cursor:pointer;min-height:36px}\nbutton:focus-visible,.chk:focus-within{outline:2px solid var(--focus);outline-offset:2px}\n.live{font-size:.875rem;color:var(--muted);margin-left:auto}\n.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4f8a4f;margin-right:6px;vertical-align:middle}\n.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;margin-bottom:16px}\n.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 16px}\n.kpi .l{font-size:.875rem;color:var(--muted)}\n.kpi .v{font-size:1.75rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.3}\n.kpi .d{font-size:.875rem;color:var(--muted)}\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:12px}\n.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:12px;min-width:0}\n.card h2{font-size:1.0625rem;margin:0 0 4px}\n.card .note{font-size:.875rem;color:var(--muted);margin:0 0 12px}\ntable{width:100%;border-collapse:collapse;font-size:.9375rem}\nth{font-size:.875rem;color:var(--muted);font-weight:600;text-align:left;padding:4px 6px;border-bottom:1px solid var(--line);white-space:nowrap}\ntd{padding:6px;border-bottom:1px solid var(--line);vertical-align:middle}\ntd.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:1%}\ntd.b{width:38%}\n.hb{height:10px;border-radius:0 4px 4px 0;background:var(--bar);min-width:2px}\n.tier{display:inline-block;min-width:1.6em;text-align:center;border-radius:6px;font-size:.875rem;font-weight:800;padding:0 4px;background:var(--cream);color:var(--accent)}\n.tier.none{background:var(--surface-2);color:var(--muted);font-weight:600}\n.chart{position:relative}\n.chart svg{display:block;width:100%;height:220px}\n.chart .tip{position:absolute;pointer-events:none;background:var(--text);color:var(--bg);font-size:.875rem;padding:4px 8px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-110%);opacity:0;transition:opacity .1s}\n.axis{fill:var(--muted);font-size:13px}\n.gridl{stroke:var(--line);stroke-width:1}\n.warn{background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:var(--r);padding:12px 16px;font-size:.9375rem;margin-bottom:12px}\n.err{background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:var(--r);padding:12px 16px;margin-bottom:12px;display:none}\nul.lim{margin:0;padding-left:1.2em;font-size:.9375rem}\nul.lim li+li{margin-top:4px}\n.empty{color:var(--muted);font-size:.9375rem}\n@media (max-width:560px){td.b{width:24%}.kpis{grid-template-columns:1fr 1fr}.kpi .v{font-size:1.5rem}.w{padding:12px 12px 40px}}\n.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}\n</style>\n</head>\n<body>\n<div class="w">\n  <header>\n    <img src="/favicon.svg" alt="">\n    <div>\n      <h1>\u8B80\u8005\u7D71\u8A08\uFF08\u7AD9\u4E3B\u5C08\u7528\uFF09</h1>\n      <div class="sub">chokomkp.com\uFF5C\u6253\u958B\u6642\u5411 Cloudflare \u67E5\u6700\u65B0\u6578\u5B57\uFF0C\u6BCF\u5206\u9418\u81EA\u52D5\u66F4\u65B0</div>\n    </div>\n  </header>\n\n  <div class="bar-row" role="toolbar" aria-label="\u7BE9\u9078">\n    <div class="seg" id="range" role="group" aria-label="\u6642\u9593\u7BC4\u570D">\n      <button type="button" data-r="today" aria-pressed="true">\u4ECA\u5929</button>\n      <button type="button" data-r="24h" aria-pressed="false">24 \u5C0F\u6642</button>\n      <button type="button" data-r="7d" aria-pressed="false">7 \u5929</button>\n      <button type="button" data-r="30d" aria-pressed="false">30 \u5929</button>\n    </div>\n    <label class="chk"><input type="checkbox" id="tw" checked> \u53EA\u770B\u53F0\u7063</label>\n    <button type="button" class="btn" id="reload">\u91CD\u65B0\u6574\u7406</button>\n    <span class="live" id="live" aria-live="polite">\u8F09\u5165\u4E2D\u2026</span>\n  </div>\n\n  <div class="err" id="err" role="alert"></div>\n  <p class="warn" id="scope" style="display:none"></p>\n\n  <section class="kpis" aria-label="\u91CD\u9EDE\u6578\u5B57">\n    <div class="kpi"><div class="l">\u9020\u8A2A</div><div class="v" id="k-visits">\u2014</div><div class="d" id="k-visits-d">&nbsp;</div></div>\n    <div class="kpi"><div class="l">\u9801\u9762\u700F\u89BD</div><div class="v" id="k-views">\u2014</div><div class="d" id="k-views-d">&nbsp;</div></div>\n    <div class="kpi"><div class="l">\u6BCF\u6B21\u9020\u8A2A\u770B\u5E7E\u9801</div><div class="v" id="k-ppv">\u2014</div><div class="d">\u5207\u63DB\u9663\u5BB9\u3001\u56DE\u5230 T \u8868\u90FD\u7B97\u4E00\u9801</div></div>\n    <div class="kpi"><div class="l">\u6700\u8FD1 1 \u5C0F\u6642\u9020\u8A2A</div><div class="v" id="k-hour">\u2014</div><div class="d" id="k-hour-d">&nbsp;</div></div>\n  </section>\n\n  <section class="card">\n    <h2 id="trend-h">\u6BCF\u5C0F\u6642\u9020\u8A2A</h2>\n    <p class="note">\u53F0\u7063\u6642\u9593\u3002\u6ED1\u904E\u6216\u9EDE\u9577\u689D\u770B\u6578\u5B57\u3002</p>\n    <div class="chart" id="trend"><svg role="img" aria-label="\u9020\u8A2A\u8DA8\u52E2"></svg><div class="tip"></div></div>\n  </section>\n\n  <div class="grid">\n    <section class="card">\n      <h2>\u8B80\u8005\u5F9E\u54EA\u88E1\u4F86</h2>\n      <p class="note">\u4EE5\u9020\u8A2A\u8A08\u3002Threads\u3001IG\u3001LINE\u3001Discord \u7684 App \u4E0D\u6703\u544A\u8A34\u7DB2\u7AD9\u4F86\u6E90\uFF0C\u90FD\u6703\u7B97\u5728\u300C\u76F4\u63A5\u6253\u958B\u300D\u3002</p>\n      <div id="sources"></div>\n    </section>\n    <section class="card">\n      <h2>\u9663\u5BB9\u88AB\u6253\u958B\u7684\u6B21\u6578</h2>\n      <p class="note" id="comps-note">\u5F9E\u9663\u5BB9\u9801\u8F09\u5165\u7684\u88DD\u5099\u8CC7\u6599\u63A8\u7B97\u3002\u540C\u4E00\u4F4D\u8B80\u8005\u6C92\u91CD\u65B0\u6574\u7406\u524D\u91CD\u8907\u6253\u958B\u540C\u4E00\u5957\u53EA\u7B97\u4E00\u6B21\u3002</p>\n      <div id="comps"></div>\n    </section>\n    <section class="card">\n      <h2>\u624B\u6A5F\u9084\u662F\u96FB\u8166</h2>\n      <p class="note">\u300C\u9EDE\u958B\u9663\u5BB9\u300D\uFF1D\u6253\u958B\u7DB2\u7AD9\u5F8C\uFF0C\u81F3\u5C11\u770B\u4E86\u4E00\u5957\u9663\u5BB9\u9801\u7684\u6BD4\u4F8B\uFF1B\u300C\u770B\u5E7E\u5957\u300D\uFF1D\u9019\u4E9B\u4EBA\u5E73\u5747\u770B\u4E86\u5E7E\u5957\u3002</p>\n      <div id="devices"></div>\n    </section>\n    <section class="card">\n      <h2>\u700F\u89BD\u5668\u8207 App</h2>\n      <p class="note">\u4EE5\u9020\u8A2A\u8A08\u3002</p>\n      <div id="browsers"></div>\n    </section>\n    <section class="card" id="countries-card">\n      <h2>\u570B\u5BB6\uFF0F\u5730\u5340</h2>\n      <p class="note">\u4EE5\u9020\u8A2A\u8A08\u3002</p>\n      <div id="countries"></div>\n    </section>\n    <section class="card">\n      <h2>\u8F09\u5165\u901F\u5EA6</h2>\n      <p class="note">\u300C\u770B\u5230\u756B\u9762\u300D\u300C\u8F09\u5B8C\u300D\u662F\u4E2D\u4F4D\u6578\uFF0C\u4E00\u534A\u7684\u8B80\u8005\u6BD4\u9019\u66F4\u5FEB\uFF1B\u300C\u6700\u6162\u4E00\u6210\u300D\u662F\u7DB2\u8DEF\u5DEE\u6216\u624B\u6A5F\u820A\u7684\u8B80\u8005\u8981\u7B49\u591A\u4E45\u3002\u53EA\u770B\u6700\u8FD1 7 \u5929\u3002</p>\n      <div id="perf"></div>\n    </section>\n  </div>\n\n  <section class="card">\n    <h2>\u9019\u4E9B\u6578\u5B57\u7684\u9650\u5236</h2>\n    <ul class="lim">\n      <li><b>\u4F60\u81EA\u5DF1\u7684\u700F\u89BD\u4E5F\u7B97\u5728\u88E1\u9762\u3002</b>\u76EE\u524D\u6C92\u8FA6\u6CD5\u628A\u7AD9\u4E3B\u5206\u51FA\u4F86\uFF0C\u4F60\u6AA2\u67E5\u7DB2\u7AD9\u8D8A\u983B\u7E41\uFF0C\u6578\u5B57\u8D8A\u504F\u9AD8\u3002</li>\n      <li>\u5DF2\u6392\u9664 Cloudflare \u5224\u65B7\u70BA\u6A5F\u5668\u4EBA\u7684\u6D41\u91CF\uFF0C\u4E5F\u6392\u9664\u9019\u500B\u7D71\u8A08\u9801\u672C\u8EAB\u3002\u4E3B\u6A5F\u7684\u300C\u7E3D\u8ACB\u6C42\u6578\u300D\u5305\u542B\u5927\u91CF\u81EA\u52D5\u6383\u63CF\uFF0C\u6240\u4EE5\u9019\u88E1\u4E0D\u7528\u5B83\u3002</li>\n      <li>Cloudflare \u7684\u7D71\u8A08\u4E0D\u7528 cookie\uFF0C\u5206\u4E0D\u51FA\u65B0\u8B80\u8005\u548C\u56DE\u8A2A\u8B80\u8005\uFF0C\u4E5F\u770B\u4E0D\u5230\u901F\u67E5\u3001\u88DD\u5099\u7BE9\u9078\u6216\u5916\u90E8\u9023\u7D50\u7684\u9EDE\u64CA\u3002</li>\n      <li>\u6D41\u91CF\u5927\u6642 Cloudflare \u6703\u62BD\u6A23\u4F30\u7B97\uFF0C\u5C0F\u6578\u5B57\u53EF\u80FD\u6709 1\uFF5E2 \u7684\u8AA4\u5DEE\u3002\u9663\u5BB9\u6B21\u6578\u6700\u591A\u53EA\u80FD\u770B\u6700\u8FD1 30 \u5929\u3002</li>\n      <li>\u53D6\u6D88\u300C\u53EA\u770B\u53F0\u7063\u300D\u6703\u6DF7\u9032\u6D77\u5916\u7684\u6E2C\u8A66\u8207\u9810\u89BD\u6D41\u91CF\uFF08\u4F8B\u5982\u4E0A\u7DDA\u6AA2\u67E5\u3001\u9023\u7D50\u9810\u89BD\uFF09\u3002</li>\n    </ul>\n  </section>\n</div>\n\n<script>\n(() => {\n  "use strict";\n  const $ = (s) => document.querySelector(s);\n  const fmt = new Intl.NumberFormat("zh-Hant-TW");\n  const region = (() => { try { return new Intl.DisplayNames(["zh-Hant-TW"], { type: "region" }); } catch { return null; } })();\n  const TZ = "Asia/Taipei";\n  const twHour = (ms) => new Date(ms + 8 * 3600e3).getUTCHours();\n  const dayFmt = new Intl.DateTimeFormat("zh-Hant-TW", { timeZone: TZ, month: "numeric", day: "numeric" });\n  const clockFmt = new Intl.DateTimeFormat("zh-Hant-TW", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });\n  const twDayKey = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);\n  const RANGE_TEXT = { today: "\u6628\u5929\u540C\u6642\u6BB5", "24h": "\u524D 24 \u5C0F\u6642", "7d": "\u524D 7 \u5929", "30d": "\u524D 30 \u5929" };\n\n  let state = { range: "today", tw: true };\n  try { const s = JSON.parse(localStorage.getItem("choko-stats") || "{}"); if (s.range) state.range = s.range; if (typeof s.tw === "boolean") state.tw = s.tw; } catch {}\n  const save = () => { try { localStorage.setItem("choko-stats", JSON.stringify(state)); } catch {} };\n\n  const el = (t, attrs, ...kids) => {\n    const e = document.createElement(t);\n    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v); }\n    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));\n    return e;\n  };\n\n  /* \u9663\u5BB9\u540D\u7A31\u8207\u8A55\u7D1A\uFF1A\u5F9E\u7DB2\u7AD9\u672C\u8EAB\u7684\u8CC7\u6599\u8B80 */\n  let NAMES = null;\n  async function loadNames() {\n    if (NAMES) return NAMES;\n    try {\n      const d = await fetch("/data/site-data.json").then((r) => r.json());\n      const m = {};\n      for (const c of d.comps || []) {\n        m[c.id] = { name: c.name, tier: c.tier || null, status: c.status };\n        for (const v of c.variants || []) m[v.id] = { name: v.name, tier: null, branch: true, parent: c.name };\n      }\n      NAMES = m;\n    } catch { NAMES = {}; }\n    return NAMES;\n  }\n\n  const SRC = (h) => {\n    if (!h) return "\u76F4\u63A5\u6253\u958B\uFF0FApp \u5167";\n    if (/chatgpt\\.site$/.test(h)) return "GPT \u820A\u7AD9\u8F49\u5740";\n    if (/(^|\\.)youtube\\.com$/.test(h) || h === "youtu.be") return "YouTube";\n    if (/(^|\\.)threads\\.(net|com)$/.test(h)) return "Threads";\n    if (/(^|\\.)facebook\\.com$/.test(h)) return "Facebook";\n    if (/(^|\\.)instagram\\.com$/.test(h)) return "Instagram";\n    if (/(^|\\.)google\\./.test(h)) return "Google \u641C\u5C0B";\n    if (/(^|\\.)bing\\.com$/.test(h)) return "Bing \u641C\u5C0B";\n    if (/(^|\\.)claude\\.ai$/.test(h)) return "claude.ai \u820A\u9023\u7D50";\n    if (/(^|\\.)discord(app)?\\.com$/.test(h)) return "Discord";\n    if (/(^|\\.)twitch\\.tv$/.test(h)) return "Twitch";\n    return h;\n  };\n  const BROWSER = (b, os) => {\n    if (b === "Facebook") return "Threads\uFF0FIG\uFF0FFB App \u5167";\n    if (b === "Instagram") return "Instagram App \u5167";\n    if (/^Line/i.test(b)) return "LINE App \u5167";\n    if (b === "ChromeMobileWebview") return "App \u5167\u5EFA\u700F\u89BD\u5668\uFF08Android\uFF09";\n    if (b === "Unknown") return "\u7121\u6CD5\u8FA8\u8B58\uFF08\u591A\u534A\u662F App \u5167\uFF09";\n    if (b === "MobileSafari") return "Safari\uFF08iPhone\uFF0FiPad\uFF09";\n    if (b === "ChromeMobile") return `Chrome\uFF08${os === "iOS" ? "iPhone" : "Android"}\uFF09`;\n    const o = { Windows: "Windows", MacOSX: "Mac", Linux: "Linux", iOS: "iPhone", Android: "Android" }[os] || os;\n    return `${b}\uFF08${o}\uFF09`;\n  };\n  const DEVICE = (d) => ({ desktop: "\u96FB\u8166", mobile: "\u624B\u6A5F", tablet: "\u5E73\u677F" }[d] || d || "\u5176\u4ED6");\n\n  function barTable(rows, head, opts = {}) {\n    if (!rows.length) return el("p", { class: "empty" }, "\u9019\u6BB5\u6642\u9593\u6C92\u6709\u8CC7\u6599\u3002");\n    const max = Math.max(...rows.map((r) => r.value), 1);\n    const total = rows.reduce((s, r) => s + r.value, 0);\n    return el("table", null,\n      el("thead", null, el("tr", null, el("th", null, head[0]), el("th", null, el("span", { class: "sr" }, "\u9577\u689D")), el("th", { style: "text-align:right" }, head[1]), opts.pct === false ? null : el("th", { style: "text-align:right" }, "\u5360\u6BD4"))),\n      el("tbody", null, rows.map((r) => el("tr", null,\n        el("td", null, r.label),\n        el("td", { class: "b" }, el("div", { class: "hb", style: `width:${(r.value / max) * 100}%` })),\n        el("td", { class: "n" }, fmt.format(r.value)),\n        opts.pct === false ? null : el("td", { class: "n" }, total ? Math.round((r.value / total) * 100) + "%" : "\u2014")))));\n  }\n\n  const group = (rows, keyFn, valFn) => {\n    const m = new Map();\n    for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + valFn(r)); }\n    return [...m].map(([label, value]) => ({ label, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);\n  };\n\n  function delta(cur, prev, label) {\n    if (prev == null) return `${label}\u7DB2\u7AD9\u9084\u6C92\u4E0A\u7DDA\uFF0C\u6C92\u5F97\u6BD4`;\n    if (!prev) return `${label}\u662F 0`;\n    const d = Math.round(((cur - prev) / prev) * 100);\n    return `${label} ${fmt.format(prev)}\uFF08${d > 0 ? "+" : ""}${d}%\uFF09`;\n  }\n\n  function drawTrend(data) {\n    const box = $("#trend"), svg = box.querySelector("svg"), tip = box.querySelector(".tip");\n    svg.innerHTML = "";\n    const byHour = new Map(data.trend.map((x) => [Date.parse(x.t), x]));\n    const start = Date.parse(data.window.start), end = Date.parse(data.window.end);\n    let pts = [];\n    if (data.range === "today" || data.range === "24h") {\n      $("#trend-h").textContent = "\u6BCF\u5C0F\u6642\u9020\u8A2A";\n      let t = Math.floor(start / 3600e3) * 3600e3;\n      for (; t < end; t += 3600e3) { const x = byHour.get(t); pts.push({ key: t, label: twHour(t) + " \u9EDE", short: twHour(t) + " \u9EDE", v: x ? x.visits : 0, views: x ? x.views : 0 }); }\n    } else {\n      $("#trend-h").textContent = "\u6BCF\u5929\u9020\u8A2A";\n      const m = new Map();\n      for (const x of data.trend) { const k = twDayKey(Date.parse(x.t)); const o = m.get(k) || { v: 0, views: 0 }; o.v += x.visits; o.views += x.views; m.set(k, o); }\n      for (let t = start; t < end + 1; t += 86400e3) {\n        const k = twDayKey(t); if (pts.length && pts[pts.length - 1].dk === k) continue;\n        const o = m.get(k) || { v: 0, views: 0 }; pts.push({ dk: k, key: t, label: dayFmt.format(t), short: dayFmt.format(t), v: o.v, views: o.views });\n      }\n    }\n    const W = Math.max(box.clientWidth, 280), H = 220, L = 34, R = 8, T = 10, B = 26;\n    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);\n    const max = Math.max(...pts.map((p) => p.v), 1);\n    const step = Math.max(1, Math.ceil(max / 4 / (max > 20 ? 5 : 1)) * (max > 20 ? 5 : 1));\n    const nice = step * 4;\n    const ns = "http://www.w3.org/2000/svg";\n    const mk = (t, a) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };\n    const y = (v) => T + (H - T - B) * (1 - v / nice);\n    for (let i = 0; i <= 4; i++) {\n      const v = (nice / 4) * i, yy = y(v);\n      svg.append(mk("line", { x1: L, x2: W - R, y1: yy, y2: yy, class: "gridl" }));\n      const tx = mk("text", { x: L - 6, y: yy + 4, "text-anchor": "end", class: "axis" }); tx.textContent = fmt.format(v); svg.append(tx);\n    }\n    const n = pts.length, slot = (W - L - R) / Math.max(n, 1), bw = Math.max(2, Math.min(28, slot - 2));\n    const every = Math.ceil(n / Math.floor((W - L - R) / 44));\n    pts.forEach((p, i) => {\n      const cx = L + slot * i + slot / 2, top = y(p.v), h = Math.max(0, H - B - top);\n      if (p.v > 0) {\n        const r = Math.min(4, bw / 2, h);\n        svg.append(mk("path", { d: `M${cx - bw / 2},${H - B}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${H - B}Z`, fill: "var(--bar)" }));\n      }\n      const hit = mk("rect", { x: L + slot * i, y: T, width: slot, height: H - T - B, fill: "transparent", tabindex: "0" });\n      const show = () => { tip.textContent = `${p.label}\uFF1A${fmt.format(p.v)} \u6B21\u9020\u8A2A\u3001${fmt.format(p.views)} \u6B21\u700F\u89BD`; tip.style.left = (cx / W) * box.clientWidth + "px"; tip.style.top = (Math.min(top, H - B - 4) / H) * 220 + "px"; tip.style.opacity = 1; };\n      hit.addEventListener("mouseenter", show); hit.addEventListener("focus", show); hit.addEventListener("click", show);\n      hit.addEventListener("mouseleave", () => (tip.style.opacity = 0)); hit.addEventListener("blur", () => (tip.style.opacity = 0));\n      svg.append(hit);\n      if (i % every === 0) { const tx = mk("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "axis" }); tx.textContent = p.short; svg.append(tx); }\n    });\n    svg.setAttribute("aria-label", pts.map((p) => `${p.label} ${p.v}`).join("\uFF0C"));\n  }\n\n  async function render(d) {\n    window.__last = d;\n    const names = await loadNames();\n    $("#k-visits").textContent = fmt.format(d.total.visits);\n    $("#k-views").textContent = fmt.format(d.total.views);\n    $("#k-ppv").textContent = d.total.visits ? (d.total.views / d.total.visits).toFixed(1) : "\u2014";\n    $("#k-hour").textContent = fmt.format(d.lastHour.visits);\n    $("#k-hour-d").textContent = `${fmt.format(d.lastHour.views)} \u6B21\u700F\u89BD`;\n    $("#k-visits-d").textContent = delta(d.total.visits, d.prev && d.prev.visits, RANGE_TEXT[d.range]);\n    $("#k-views-d").textContent = delta(d.total.views, d.prev && d.prev.views, RANGE_TEXT[d.range]);\n    const clipped = Date.parse(d.window.start) > Date.parse(d.window.requestedStart) + 60e3;\n    const notes = [];\n    if (clipped) notes.push(`\u7DB2\u7AD9 ${dayFmt.format(Date.parse(d.window.since))} ${twHour(Date.parse(d.window.since))} \u9EDE\u624D\u642C\u5230 chokomkp.com\uFF0C\u66F4\u65E9\u6C92\u6709\u8CC7\u6599\u3002`);\n    if (d.sampled) notes.push("\u9019\u6BB5\u6642\u9593\u6D41\u91CF\u8F03\u5927\uFF0CCloudflare \u6709\u62BD\u6A23\u4F30\u7B97\uFF0C\u6578\u5B57\u662F\u5927\u7D04\u503C\u3002");\n    $("#scope").textContent = notes.join("");\n    $("#scope").style.display = notes.length ? "" : "none";\n    drawTrend(d);\n\n    $("#sources").replaceChildren(barTable(group(d.sources, (x) => SRC(x.host), (x) => x.visits), ["\u4F86\u6E90", "\u9020\u8A2A"]));\n    $("#browsers").replaceChildren(barTable(group(d.browsers, (x) => BROWSER(x.browser, x.os), (x) => x.visits).slice(0, 10), ["\u700F\u89BD\u5668", "\u9020\u8A2A"]));\n    $("#countries-card").style.display = d.tw ? "none" : "";\n    $("#countries").replaceChildren(barTable(group(d.countries, (x) => (region && x.country ? region.of(x.country) : x.country) || "\u672A\u77E5", (x) => x.visits).slice(0, 12), ["\u570B\u5BB6\uFF0F\u5730\u5340", "\u9020\u8A2A"]));\n\n    // \u9663\u5BB9\n    const comps = group(d.comps, (x) => x.path.replace(/^\\/data\\/items\\//, "").replace(/\\.json$/, ""), (x) => x.n);\n    $("#comps-note").textContent = "\u5F9E\u9663\u5BB9\u9801\u8F09\u5165\u7684\u88DD\u5099\u8CC7\u6599\u63A8\u7B97\u3002\u540C\u4E00\u4F4D\u8B80\u8005\u6C92\u91CD\u65B0\u6574\u7406\u524D\u91CD\u8907\u6253\u958B\u540C\u4E00\u5957\u53EA\u7B97\u4E00\u6B21\u3002";\n    if (!comps.length) $("#comps").replaceChildren(el("p", { class: "empty" }, "\u9019\u6BB5\u6642\u9593\u6C92\u6709\u4EBA\u6253\u958B\u9663\u5BB9\u9801\u3002"));\n    else {\n      const max = comps[0].value;\n      $("#comps").replaceChildren(el("table", null,\n        el("thead", null, el("tr", null, el("th", null, "\u8A55\u7D1A"), el("th", null, "\u9663\u5BB9"), el("th", null, el("span", { class: "sr" }, "\u9577\u689D")), el("th", { style: "text-align:right" }, "\u6B21\u6578"))),\n        el("tbody", null, comps.slice(0, 25).map((c) => {\n          const m = names[c.label] || { name: c.label };\n          const tier = m.branch ? "\u5206\u652F" : m.tier || "\u7814\u7A76\u4E2D";\n          return el("tr", null,\n            el("td", { class: "n" }, el("span", { class: "tier" + (m.tier ? "" : " none") }, tier)),\n            el("td", null, m.name),\n            el("td", { class: "b" }, el("div", { class: "hb", style: `width:${(c.value / max) * 100}%` })),\n            el("td", { class: "n" }, fmt.format(c.value)));\n        }))));\n    }\n\n    // \u624B\u6A5F\uFF0F\u96FB\u8166\uFF1A\u9020\u8A2A\u3001\u6709\u9EDE\u958B\u9663\u5BB9\u7684\u6BD4\u4F8B\u3001\u5E73\u5747\u770B\u5E7E\u5957\n    const dv = group(d.devices, (x) => x.device, (x) => x.visits);\n    const ses = (dev, file) => d.sessions.filter((s) => s.device === dev && s.path === file).reduce((a, s) => a + s.n, 0);\n    const openN = (dev) => d.comps.filter((c) => c.device === dev).reduce((a, c) => a + c.n, 0);\n    const devs = [...new Set([...dv.map((x) => x.label), "mobile", "desktop"])].filter((k) => dv.some((x) => x.label === k) || ses(k, "/data/site-data.json"));\n    if (!devs.length) $("#devices").replaceChildren(el("p", { class: "empty" }, "\u9019\u6BB5\u6642\u9593\u6C92\u6709\u8CC7\u6599\u3002"));\n    else {\n      const tot = dv.reduce((a, x) => a + x.value, 0);\n      $("#devices").replaceChildren(el("table", null,\n        el("thead", null, el("tr", null, el("th", null, "\u88DD\u7F6E"), el("th", { style: "text-align:right" }, "\u9020\u8A2A"), el("th", { style: "text-align:right" }, "\u5360\u6BD4"), el("th", { style: "text-align:right" }, "\u9EDE\u958B\u9663\u5BB9"), el("th", { style: "text-align:right" }, "\u770B\u5E7E\u5957"))),\n        el("tbody", null, devs.map((k) => {\n          const v = (dv.find((x) => x.label === k) || { value: 0 }).value;\n          const s = ses(k, "/data/site-data.json"), o = ses(k, "/data/vods.json"), n = openN(k);\n          return el("tr", null, el("td", null, DEVICE(k)), el("td", { class: "n" }, fmt.format(v)), el("td", { class: "n" }, tot ? Math.round((v / tot) * 100) + "%" : "\u2014"),\n            el("td", { class: "n" }, s ? Math.round((Math.min(o, s) / s) * 100) + "%" : "\u2014"), el("td", { class: "n" }, o ? (n / o).toFixed(1) + " \u5957" : "\u2014"));\n        }))));\n    }\n\n    // \u901F\u5EA6\n    const sec = (us) => (us == null ? "\u2014" : (us / 1e6).toFixed(1) + " \u79D2");\n    $("#perf").replaceChildren(d.perf.length ? el("table", null,\n      el("thead", null, el("tr", null, el("th", null, "\u88DD\u7F6E"), el("th", { style: "text-align:right" }, "\u770B\u5230\u756B\u9762"), el("th", { style: "text-align:right" }, "\u8F09\u5B8C"), el("th", { style: "text-align:right" }, "\u6700\u6162\u4E00\u6210"))),\n      el("tbody", null, d.perf.sort((a, b) => b.n - a.n).map((p) => el("tr", null, el("td", null, `${DEVICE(p.device)}\uFF08${p.n}\uFF09`), el("td", { class: "n" }, sec(p.fcp50)), el("td", { class: "n" }, sec(p.load50)), el("td", { class: "n" }, sec(p.load90))))))\n      : el("p", { class: "empty" }, "\u9019\u6BB5\u6642\u9593\u6C92\u6709\u8CC7\u6599\u3002"));\n  }\n\n  let timer = null, busy = false;\n  async function load() {\n    if (busy) return; busy = true;\n    $("#live").textContent = "\u66F4\u65B0\u4E2D\u2026";\n    try {\n      const r = await fetch(`/stats/api?range=${state.range}&tw=${state.tw ? 1 : 0}`, { cache: "no-store", credentials: "same-origin" });\n      const d = await r.json().catch(() => ({ error: "\u4F3A\u670D\u5668\u56DE\u61C9\u770B\u4E0D\u61C2\uFF08" + r.status + "\uFF09" }));\n      if (!r.ok || d.error) throw new Error(d.error || r.status);\n      await render(d);\n      $("#err").style.display = "none";\n      $("#live").replaceChildren(el("span", { class: "dot", "aria-hidden": "true" }), `\u6700\u5F8C\u66F4\u65B0 ${clockFmt.format(new Date(d.generatedAt))}`);\n    } catch (e) {\n      $("#err").textContent = "\u8B80\u4E0D\u5230\u6700\u65B0\u6578\u5B57\uFF1A" + (e.message || e) + "\u3002\u756B\u9762\u4E0A\u662F\u4E0A\u4E00\u6B21\u7684\u7D50\u679C\u3002";\n      $("#err").style.display = "block";\n      $("#live").textContent = "\u66F4\u65B0\u5931\u6557";\n    } finally { busy = false; }\n  }\n  const schedule = () => { clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000); };\n\n  const syncUI = () => {\n    document.querySelectorAll("#range button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.r === state.range)));\n    $("#tw").checked = state.tw;\n  };\n  document.querySelectorAll("#range button").forEach((b) => b.addEventListener("click", () => { state.range = b.dataset.r; save(); syncUI(); load(); schedule(); }));\n  $("#tw").addEventListener("change", (e) => { state.tw = e.target.checked; save(); load(); schedule(); });\n  $("#reload").addEventListener("click", () => { load(); schedule(); });\n  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });\n  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => window.__last && drawTrend(window.__last), 150); });\n  syncUI(); load(); schedule();\n})();\n<\/script>\n</body>\n</html>\n';

// worker/index.js
var TW_OFFSET = 8 * 3600 * 1e3;
var RANGES = { today: 0, "24h": 24, "7d": 168, "30d": 720 };
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p !== "/stats" && !p.startsWith("/stats/")) return env.ASSETS.fetch(request);
    const auth = await verifyAccess(request, env);
    if (!auth.ok) return denied(auth.why, p.startsWith("/stats/api"));
    if (p === "/stats/api") {
      try {
        const body = await buildStats(env, url.searchParams.get("range"), url.searchParams.get("tw") !== "0");
        return json(body, 200);
      } catch (e) {
        return json({ error: String(e && e.message || e) }, 502);
      }
    }
    if (p === "/stats" || p === "/stats/") return new Response(page_default, { headers: secureHeaders("text/html; charset=utf-8") });
    return new Response("\u627E\u4E0D\u5230\u9019\u500B\u9801\u9762", { status: 404, headers: secureHeaders("text/plain; charset=utf-8") });
  }
};
var b64urlBytes = /* @__PURE__ */ __name((s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}, "b64urlBytes");
var b64urlJson = /* @__PURE__ */ __name((s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s))), "b64urlJson");
function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}
__name(getCookie, "getCookie");
var CERTS = null;
async function accessKeys(team, fetchImpl) {
  if (CERTS && Date.now() - CERTS.at < 36e5) return CERTS.keys;
  const r = await fetchImpl(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs " + r.status);
  const keys = (await r.json()).keys || [];
  CERTS = { at: Date.now(), keys };
  return keys;
}
__name(accessKeys, "accessKeys");
async function verifyAccess(request, env, fetchImpl = fetch) {
  const team = (env.ACCESS_TEAM || "").trim();
  const aud = (env.ACCESS_AUD || "").trim();
  if (!team || !aud) return { ok: false, why: "setup" };
  const token = request.headers.get("cf-access-jwt-assertion") || getCookie(request, "CF_Authorization");
  if (!token) return { ok: false, why: "login" };
  try {
    const [h, pl, sig] = token.split(".");
    const header = b64urlJson(h);
    const payload = b64urlJson(pl);
    if (header.alg !== "RS256") return { ok: false, why: "login" };
    const jwk = (await accessKeys(team, fetchImpl)).find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, why: "login" };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${pl}`));
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const now = Date.now() / 1e3;
    if (!good || !auds.includes(aud) || !(payload.exp > now) || payload.iss !== `https://${team}.cloudflareaccess.com`) {
      return { ok: false, why: "login" };
    }
    return { ok: true, email: payload.email || "" };
  } catch {
    return { ok: false, why: "login" };
  }
}
__name(verifyAccess, "verifyAccess");
function denied(why, isApi) {
  const msg = why === "setup" ? "\u7D71\u8A08\u9801\u7684\u767B\u5165\u4FDD\u8B77\u9084\u6C92\u8A2D\u5B9A\u597D\uFF0C\u6240\u4EE5\u5148\u4E0D\u986F\u793A\u4EFB\u4F55\u6578\u5B57\u3002" : "\u9019\u4E00\u9801\u53EA\u6709\u7AD9\u4E3B\u80FD\u770B\u3002\u8ACB\u5F9E Cloudflare \u7684\u767B\u5165\u756B\u9762\u7528\u7AD9\u4E3B\u7684\u4FE1\u7BB1\u767B\u5165\u3002";
  if (isApi) return json({ error: msg }, 403);
  const html = `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>\u8B80\u8005\u7D71\u8A08\uFF5C\u7AD9\u4E3B\u5C08\u7528</title><body style="font:16px/1.7 system-ui,'Microsoft JhengHei',sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#242321"><h1 style="font-size:1.25rem">\u8B80\u8005\u7D71\u8A08\uFF5C\u7AD9\u4E3B\u5C08\u7528</h1><p>${msg}</p></body></html>`;
  return new Response(html, { status: 403, headers: secureHeaders("text/html; charset=utf-8") });
}
__name(denied, "denied");
function secureHeaders(type) {
  return {
    "content-type": type,
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}
__name(secureHeaders, "secureHeaders");
var json = /* @__PURE__ */ __name((o, status) => new Response(JSON.stringify(o), { status, headers: secureHeaders("application/json; charset=utf-8") }), "json");
function windows(range, now = Date.now()) {
  const r = range in RANGES ? range : "today";
  let start;
  if (r === "today") {
    const tw = new Date(now + TW_OFFSET);
    start = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()) - TW_OFFSET;
  } else start = now - RANGES[r] * 36e5;
  const span = now - start;
  const prevStart = r === "today" ? start - 24 * 36e5 : start - span;
  return { range: r, start, end: now, prevStart, prevEnd: prevStart + span };
}
__name(windows, "windows");
var iso = /* @__PURE__ */ __name((ms) => new Date(Math.floor(ms / 1e3) * 1e3).toISOString().replace(".000Z", "Z"), "iso");
var DEFAULT_SINCE = "2026-11-05T02:00:00Z";
var CHUNK = 7 * 864e5;
function chunks(a, b, size = CHUNK) {
  const out = [];
  for (let e = b; e > a; e -= size) out.unshift([Math.max(a, e - size), e]);
  return out;
}
__name(chunks, "chunks");
function buildQueries(env, w, tw) {
  const since = Date.parse(env.SITE_SINCE || DEFAULT_SINCE);
  const country = tw ? `, countryName: "TW"` : "";
  const rum = /* @__PURE__ */ __name((a, b) => `filter: { siteTag: "${env.SITE_TAG}", bot: 0, requestPath_notlike: "/stats%", datetime_geq: "${iso(a)}", datetime_lt: "${iso(b)}"${country} }`, "rum");
  const acct = /* @__PURE__ */ __name((nodes) => `{ viewer { accounts(filter: { accountTag: "${env.ACCOUNT_ID}" }) {
  ${nodes.join("\n  ")}
} } }`, "acct");
  const grp = /* @__PURE__ */ __name((name, dims, a, b, order = "sum_visits_DESC", limit = 50) => `${name}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, ${rum(a, b)}, orderBy: [${order}]) { count sum { visits } avg { sampleInterval } dimensions { ${dims} } }`, "grp");
  const tot = /* @__PURE__ */ __name((name, a, b) => `${name}: rumPageloadEventsAdaptiveGroups(limit: 1, ${rum(a, b)}) { count sum { visits } avg { sampleInterval } }`, "tot");
  const s0 = Math.max(w.start, since);
  const p0 = Math.max(w.prevStart, since);
  const cur = s0 < w.end ? chunks(s0, w.end) : [];
  const prev = p0 < w.prevEnd ? chunks(p0, w.prevEnd) : [];
  const account = cur.map(([a, b]) => acct([
    grp("hours", "datetimeHour", a, b, "datetimeHour_ASC", 1e3),
    grp("sources", "refererHost", a, b),
    grp("devices", "deviceType", a, b),
    grp("browsers", "userAgentBrowser userAgentOS", a, b),
    grp("countries", "countryName", a, b)
  ]));
  const extra = prev.map(([a, b], i) => tot(`p${i}`, a, b));
  const lh = Math.max(w.end - 36e5, since);
  if (lh < w.end) extra.push(tot("lastHour", lh, w.end));
  const perfStart = Math.max(s0, w.end - CHUNK);
  if (perfStart < w.end) extra.push(`perf: rumPerformanceEventsAdaptiveGroups(limit: 5, ${rum(perfStart, w.end)}) { count quantiles { pageLoadTimeP50 pageLoadTimeP90 firstContentfulPaintP50 } dimensions { deviceType } }`);
  const misc = extra.length ? acct(extra) : null;
  const zStart = Math.max(s0, w.end - 30 * 864e5 + 6e4);
  const zc = tw ? `, clientCountryName: "TW"` : "";
  const zone = (zStart < w.end ? chunks(zStart, w.end) : []).map(([a, b]) => {
    const zf = /* @__PURE__ */ __name((x) => `filter: { datetime_geq: "${iso(a)}", datetime_lt: "${iso(b)}", edgeResponseStatus_lt: 400${zc}${x} }`, "zf");
    return `{ viewer { zones(filter: { zoneTag: "${env.ZONE_ID}" }) {
  comps: httpRequestsAdaptiveGroups(limit: 500, ${zf(`, clientRequestPath_like: "/data/items/%"`)}, orderBy: [count_DESC]) { count avg { sampleInterval } dimensions { clientRequestPath clientDeviceType } }
  sessions: httpRequestsAdaptiveGroups(limit: 20, ${zf(`, clientRequestPath_in: ["/data/site-data.json", "/data/vods.json"]`)}, orderBy: [count_DESC]) { count avg { sampleInterval } dimensions { clientRequestPath clientDeviceType } }
} } }`;
  });
  return { account, misc, zone, start: s0, prevStart: p0, zoneStart: zStart, perfStart, nPrev: prev.length };
}
__name(buildQueries, "buildQueries");
async function gql(env, query, fetchImpl) {
  const r = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query })
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.errors && j.errors.length) {
    const m = j && j.errors && j.errors[0] && j.errors[0].message;
    throw new Error("Cloudflare \u67E5\u8A62\u5931\u6557\uFF1A" + (m || r.status));
  }
  return j.data.viewer;
}
__name(gql, "gql");
var sampledRows = /* @__PURE__ */ __name((rows) => (rows || []).some((x) => x.avg && x.avg.sampleInterval > 1.01), "sampledRows");
function merge(list, keyFn) {
  const m = /* @__PURE__ */ new Map();
  for (const x of list) {
    const k = keyFn(x.dimensions || {});
    const o = m.get(k) || { ...x.dimensions, visits: 0, views: 0 };
    o.visits += x.sum ? x.sum.visits : 0;
    o.views += x.count;
    m.set(k, o);
  }
  return [...m.values()];
}
__name(merge, "merge");
async function buildStats(env, range, tw, fetchImpl = fetch, now = Date.now()) {
  if (!env.CF_API_TOKEN) throw new Error("\u9084\u6C92\u8A2D\u5B9A\u8B80\u53D6\u91D1\u9470\uFF08CF_API_TOKEN\uFF09");
  const w = windows(range, now);
  const q = buildQueries(env, w, tw);
  const [accs, misc, zones] = await Promise.all([
    Promise.all(q.account.map((x) => gql(env, x, fetchImpl).then((v) => v.accounts[0] || {}))),
    q.misc ? gql(env, q.misc, fetchImpl).then((v) => v.accounts[0] || {}) : {},
    Promise.all(q.zone.map((x) => gql(env, x, fetchImpl).then((v) => v.zones[0] || {})))
  ]);
  const all = /* @__PURE__ */ __name((k) => accs.flatMap((a) => a[k] || []), "all");
  const hours = all("hours");
  const one = /* @__PURE__ */ __name((rows) => ({ visits: rows.reduce((s, x) => s + x.sum.visits, 0), views: rows.reduce((s, x) => s + x.count, 0) }), "one");
  const prevRows = Array.from({ length: q.nPrev }, (_, i) => misc[`p${i}`] || []).flat();
  const zc = zones.flatMap((z) => z.comps || []), zs = zones.flatMap((z) => z.sessions || []);
  const zmerge = /* @__PURE__ */ __name((rows) => merge(rows, (d) => d.clientRequestPath + "|" + d.clientDeviceType).map((x) => ({ path: x.clientRequestPath, device: x.clientDeviceType, n: x.views })), "zmerge");
  return {
    generatedAt: new Date(now).toISOString(),
    range: w.range,
    tw,
    window: { start: iso(q.start), requestedStart: iso(w.start), end: iso(w.end), prevStart: iso(q.prevStart), prevEnd: iso(w.prevEnd), compsStart: iso(q.zoneStart), perfStart: iso(q.perfStart), since: env.SITE_SINCE || DEFAULT_SINCE },
    total: one(hours),
    prev: q.nPrev ? one(prevRows) : null,
    lastHour: one(misc.lastHour || []),
    trend: hours.map((x) => ({ t: x.dimensions.datetimeHour, visits: x.sum.visits, views: x.count })),
    sources: merge(all("sources"), (d) => d.refererHost || "").map((x) => ({ host: x.refererHost || "", visits: x.visits, views: x.views })).filter((x) => x.visits > 0),
    devices: merge(all("devices"), (d) => d.deviceType).map((x) => ({ device: x.deviceType, visits: x.visits, views: x.views })),
    browsers: merge(all("browsers"), (d) => d.userAgentBrowser + "|" + d.userAgentOS).map((x) => ({ browser: x.userAgentBrowser, os: x.userAgentOS, visits: x.visits, views: x.views })),
    countries: merge(all("countries"), (d) => d.countryName).map((x) => ({ country: x.countryName, visits: x.visits, views: x.views })),
    perf: (misc.perf || []).map((x) => ({ device: x.dimensions.deviceType, n: x.count, load50: x.quantiles.pageLoadTimeP50, load90: x.quantiles.pageLoadTimeP90, fcp50: x.quantiles.firstContentfulPaintP50 })),
    comps: zmerge(zc),
    sessions: zmerge(zs),
    sampled: sampledRows(hours) || sampledRows(all("sources")) || sampledRows(zc),
    queries: q.account.length + (q.misc ? 1 : 0) + q.zone.length
  };
}
__name(buildStats, "buildStats");

// ../../../tmp/wt/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../tmp/wt/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-4zSEV6/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../tmp/wt/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-4zSEV6/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  buildQueries,
  buildStats,
  chunks,
  middleware_loader_entry_default as default,
  verifyAccess,
  windows
};
//# sourceMappingURL=index.js.map

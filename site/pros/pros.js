/* 高手教學庫（站主 2026-11-17：「就是一個教學庫一個課本的概念…這個教學庫包含所有可以教的東西」）
   資料：pros/book.json（課本文章）、pros/data.json（S19 評價）、pros/videos.json（高手與影片）。設計：Fable 5.2。純前端、不連外。 */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v; else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const mmss = (t) => (t == null ? "" : `${Math.floor(t / 3600) ? Math.floor(t / 3600) + ":" + String(Math.floor(t / 60) % 60).padStart(2, "0") : Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
  const ytUrl = (id, t) => `https://www.youtube.com/watch?v=${id}${t ? "&t=" + t + "s" : ""}`;
  const CONS = { consensus: ["高手共識", "t-up"], multi: ["兩位提到", "t-up2"], single: ["一位提到", "t-mid"], split: ["看法分歧", "t-mix"], outdated: ["可能過時", "t-na"] };
  const TAG = { "一致看好": "t-up", "多數看好": "t-up2", "看法分歧": "t-mix", "評價普通": "t-mid", "多數看衰": "t-down", "資料不足": "t-na" };
  const SHOW = { "資料不足": "一位高手看法" };  // Fable 2026-11-17：七成只有一位評過，不要整頁灰色「資料不足」
  const ORDER = ["一致看好", "多數看好", "看法分歧", "多數看衰", "評價普通", "資料不足"];
  const byLabel = (a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label) || (a.cost || 0) - (b.cost || 0);
  const st = { tab: "book", q: "", pros: new Set(), season: "default", cons: "all", ch: null, cost: "全部", label: "全部", tLabel: "全部" };
  let B = null, R = null, V = null;
  const proName = (k) => (B?.pros.find((p) => p.key === k) || {}).name || k;

  /* ---------- 課本（站主 2026-11-17：「要梳理出一套邏輯…寫成好幾篇文章，然後有條理的把它串聯起來」） ---------- */
  const arts = () => B.parts.flatMap((p) => p.articles.map((a) => ({ ...a, part: p })));
  const go = (hash) => { location.hash = hash; };
  function cover() {
    let n = 0;
    return h("div", { class: "bk-cover" },
      h("h2", { class: "bk-title" }, B.title),
      B.intro ? h("p", { class: "bk-intro" }, B.intro) : null,
      B.parts.map((p, pi) => h("section", { class: "bk-part" },
        h("h3", null, h("span", { class: "bk-pno" }, `第 ${pi + 1} 部`), p.title),
        p.intro ? h("p", { class: "bk-pintro muted" }, p.intro) : null,
        h("ol", { class: "bk-list", start: String(n + 1) }, p.articles.map((a) => { n++;
          return h("li", { class: a.todo ? "todo" : null },
            a.todo ? h("span", { class: "bk-a" }, h("b", null, a.title), h("span", { class: "muted" }, a.one), h("em", { class: "bk-soon" }, "撰寫中"))
              : h("a", { class: "bk-a", href: "#a/" + a.id }, h("b", null, a.title), h("span", { class: "muted" }, a.one), h("em", null, `約 ${a.mins} 分鐘`)));
        })))));
  }
  function toc(cur) {
    let n = 0;
    return h("nav", { class: "bk-toc", "aria-label": "課本目錄" },
      h("a", { class: "bk-toc-home", href: "#book" }, "📖 " + B.title),
      B.parts.map((p, pi) => h("div", { class: "bk-toc-part" },
        h("div", { class: "bk-toc-ph" }, `第 ${pi + 1} 部｜${p.title}`),
        p.articles.map((a) => { n++;
          const on = cur && a.id === cur.id;
          return h("div", null,
            a.todo ? h("span", { class: "bk-toc-a todo" }, `${n}. ${a.title}`) : h("a", { class: "bk-toc-a" + (on ? " on" : ""), href: "#a/" + a.id, "aria-current": on ? "page" : null }, `${n}. ${a.title}`),
            on && a.heads?.length ? h("div", { class: "bk-toc-sub" }, a.heads.map((x) => h("a", { href: "#" + x.id, onclick: (e) => { e.preventDefault(); document.getElementById(x.id)?.scrollIntoView({ behavior: "smooth" }); } }, x.title))) : null);
        }))));
  }
  function article(id) {
    const all = arts().filter((a) => !a.todo), i = all.findIndex((a) => a.id === id), a = all[i];
    if (!a) return cover();
    const pno = B.parts.indexOf(a.part) + 1, num = arts().findIndex((x) => x.id === id) + 1;
    const body = h("div", { class: "bk-body" }); body.innerHTML = a.html;
    body.querySelectorAll(".bk-cite a").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); const t = document.getElementById(el.getAttribute("href").slice(1)); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("hl"); setTimeout(() => t.classList.remove("hl"), 1600); } }));
    const nav = (x, dir) => x ? h("a", { class: "bk-nav " + dir, href: "#a/" + x.id }, h("small", null, dir === "prev" ? "← 上一篇" : "下一篇 →"), h("b", null, x.title)) : h("span");
    return h("div", { class: "bk-read" },
      h("details", { class: "bk-toc-m" }, h("summary", null, "目錄"), toc(a)),
      h("aside", { class: "bk-side" }, toc(a)),
      h("article", { class: "bk-art" },
        h("div", { class: "bk-crumb muted" }, `第 ${pno} 部｜${a.part.title}　·　第 ${num} 篇　·　約 ${a.mins} 分鐘`),
        h("h2", { class: "bk-h1" }, a.title),
        a.one ? h("p", { class: "bk-one" }, a.one) : null,
        body,
        a.cites.length ? h("section", { class: "bk-srcs" }, h("h3", null, "出處（點了直接看高手原片那一段）"),
          h("ol", null, a.cites.map((c, k) => h("li", { id: `${a.id}--src${k + 1}` },
            h("span", null, c.text),
            h("span", { class: "bk-srcl" }, c.src.map((s) => h("a", { href: ytUrl(s.v, s.t), target: "_blank", rel: "noopener" }, `${s.pro}${s.old ? "（舊講法）" : s.opp ? "（相反）" : ""} ▶ ${mmss(s.t) || "原片"}`))))))) : null,
        h("div", { class: "bk-navs" }, nav(all[i - 1], "prev"), nav(all[i + 1], "next"))));
  }
  function bookTab() { return st.art ? article(st.art) : cover(); }

  /* ---------- S19 評價（原本的棋子卡片） ---------- */
  function pic(key, cost) {
    const sp = R.sprite, i = sp && sp.map ? sp.map[key] : undefined;
    const s = i == null ? "" : `background-image:url(../${sp.src});background-size:${sp.cols * 100}% ${sp.rows * 100}%;` +
      `background-position:${(i % sp.cols) * 100 / (sp.cols - 1)}% ${Math.floor(i / sp.cols) * 100 / (sp.rows - 1)}%`;
    return h("div", { class: "pr-pic", "data-cost": cost, style: s, role: "img", "aria-label": "" });
  }
  function ops(list) {
    return h("div", { class: "pr-ops" }, list.map((o) => h("div", { class: "pr-op" },
      h("b", null, o.author), o.verdict ? h("span", { class: "pr-v v-" + o.verdict }, o.verdict) : null, o.summary,
      o.url ? h("a", { class: "src", href: o.url, target: "_blank", rel: "noopener" }, o.time ? `看原片 ${o.time}` : "看來源") : null,
      o.items && o.items.length ? h("span", { class: "it" }, "提到的裝備：" + o.items.join("、")) : null)));
  }
  function card(u, kind) {
    const who = [...new Set(u.ops.map((o) => o.author))].length;
    return h("details", { class: "pr-card", "data-key": u.key },
      h("summary", null,
        kind === "trait" ? h("div", { class: "pr-pic trait", "aria-hidden": "true" }, (u.zh || u.en || "").slice(0, 2)) : pic(u.key, u.cost),
        h("div", null,
          h("div", { class: "pr-name" }, u.zh || u.en, u.temp ? h("small", null, "暫譯") : null, kind !== "trait" ? h("small", null, `${u.cost} 費`) : null),
          h("span", { class: "pr-tag " + (TAG[u.label] || "t-na") }, SHOW[u.label] || u.label || "一位高手看法"),
          h("span", { class: "pr-n" }, `${who} 位高手、${u.ops.length} 則看法`),
          u.summary ? h("p", { class: "pr-sum" }, u.summary) : null,
          h("span", { class: "pr-more" }, "點開看每個人怎麼說 ▾"))),
      ops(u.ops));
  }
  function reviewTab() {
    if (!R) { loadReviews(); return h("p", { class: "muted" }, "載入中…"); }
    const chips = (list, cur, set, fmt) => list.map((c) => h("button", { type: "button", class: "pr-chip", "aria-pressed": String(cur === c), onclick: () => { set(c); render(); } }, fmt(c)));
    const units = R.units.filter((u) => (st.cost === "全部" || u.cost === st.cost) && (st.label === "全部" || u.label === st.label)).sort((a, b) => byLabel(a, b));
    const traits = R.traits.filter((t) => st.tLabel === "全部" || t.label === st.tLabel).sort((a, b) => byLabel(a, b));
    const LBL = ["全部", "一致看好", "多數看好", "看法分歧", "評價普通", "多數看衰", "資料不足"];
    return h("div", null,
      h("p", { class: "pr-lead" }, R.intro),
      R.caveat ? h("div", { class: "pr-note" }, R.caveat) : null,
      R.headline?.length ? [h("h2", null, "這週重點"), h("ul", { class: "pr-key" }, R.headline.map((x) => h("li", null, x)))] : null,
      h("h2", { id: "units", style: "margin-top:24px" }, "棋子評價"),
      h("div", { class: "pr-bar" }, chips(["全部", 1, 2, 3, 4, 5, 7], st.cost, (c) => (st.cost = c), (c) => (c === "全部" ? "全部費用" : c + " 費"))),
      h("div", { class: "pr-bar" }, chips(LBL, st.label, (c) => (st.label = c), (c) => (c === "全部" ? "全部評價" : SHOW[c] || c))),
      units.length ? h("div", { class: "pr-grid" }, units.map((u) => card(u))) : h("p", { class: "pr-empty" }, "沒有符合的棋子。"),
      h("h2", { id: "traits", style: "margin-top:24px" }, "羈絆評價"),
      h("div", { class: "pr-bar" }, chips(LBL, st.tLabel, (c) => (st.tLabel = c), (c) => (c === "全部" ? "全部評價" : SHOW[c] || c))),
      traits.length ? h("div", { class: "pr-grid" }, traits.map((t) => card(t, "trait"))) : h("p", { class: "pr-empty" }, "沒有符合的羈絆。"),
      R.mechanics?.length ? [h("h2", { style: "margin-top:24px" }, "新機制"), h("div", { class: "pr-mech" }, R.mechanics.map((m) => h("div", { class: "pr-wc" }, h("h3", null, m.title), h("p", null, m.summary), m.by ? h("p", { class: "why" }, "提到的人：" + m.by) : null)))] : null);
  }
  /* ---------- 高手與影片 ---------- */
  function videoTab() {
    if (!V) { loadVideos(); return h("p", { class: "muted" }, "載入中…"); }
    const cat = V.catalog, byC = {};
    for (const x of cat) (byC[x.creator] ||= []).push(x);
    return h("div", null,
      h("p", { class: "small muted" }, "只收曾經打到宗師以上的高手。段位是我們到 op.gg 等戰績網站查的。每週自動整理新影片，舊影片也會慢慢補完。"),
      h("div", { class: "pr-who" }, B.pros.map((p) => {
        const mine = cat.filter((x) => x.creator === p.name || (p.key === "jazlatte" && x.creator === "絕世拿鐵"));
        const done = V.videos.filter((v) => v.pro === p.key).length;
        return h("div", { class: "pr-wc" }, h("h3", null, h("a", { href: p.channel, target: "_blank", rel: "noopener" }, p.name)),
          h("p", { class: "why" }, p.peak),
          h("p", { class: "why" }, `已整理 ${done} 支影片` + (mine.length ? `（頻道 S17 以來 ${mine.length} 支）` : "")));
      })),
      h("h2", { style: "margin-top:24px" }, "已整理的影片"),
      h("ul", { class: "pr-src" }, V.videos.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((v) =>
        h("li", null, h("a", { href: ytUrl(v.id), target: "_blank", rel: "noopener" }, v.title), h("span", { class: "muted" }, `｜${proName(v.pro)}｜${v.date || ""}｜${v.claims ? v.claims + " 條觀念" : "沒有可整理的觀念"}`)))));
  }

  function render() {
    const app = $("#pr-app");
    const tabs = [["book", "📖", "課本"], ["review", "🆕", "S19 評價"], ["videos", "🎬", "高手與影片"]];
    app.replaceChildren(
      h("div", { class: "pr-meta" }, h("span", null, `上次更新：${B.updated}`), h("span", null, `${B.stats.articles} 篇文章，整理自 ${B.stats.videos} 支高手影片`)),
      h("div", { class: "pr-tabs", role: "tablist" }, tabs.map(([id, ic, t]) => h("button", { type: "button", role: "tab", class: "pr-tab", "aria-selected": String(st.tab === id), onclick: () => go(id === "book" ? "book" : id) }, h("span", { "aria-hidden": "true" }, ic), t))),
      st.tab === "book" ? bookTab() : st.tab === "review" ? reviewTab() : videoTab());
  }
  const get = (f) => fetch(f + "?v=" + Date.now().toString(36).slice(0, -4)).then((r) => r.json());
  function loadReviews() { get("data.json").then((d) => { R = d; render(); }).catch((e) => { console.error(e); R = { units: [], traits: [], intro: "評價資料載入失敗，請重新整理。" }; render(); }); }
  function loadVideos() { get("videos.json").then((d) => { V = d; render(); }).catch(() => { V = { videos: [], catalog: [] }; render(); }); }
  function route() {
    const hsh = decodeURIComponent(location.hash.slice(1));
    if (hsh.includes("--")) { const t = document.getElementById(hsh); if (t) { t.scrollIntoView(); return; } }
    st.art = null;
    if (hsh === "review" || hsh === "units" || hsh === "traits") st.tab = "review";
    else if (hsh === "videos") st.tab = "videos";
    else { st.tab = "book"; if (hsh.startsWith("a/")) st.art = hsh.slice(2); }
    render(); window.scrollTo(0, 0);
  }
  get("book.json").then((d) => {
    B = d; $("#pr-loading").remove(); $("#pr-app").hidden = false;
    window.addEventListener("hashchange", route); route();
  }).catch((e) => { console.error(e); $("#pr-loading").textContent = "資料載入失敗，請重新整理再試一次。"; });
})();

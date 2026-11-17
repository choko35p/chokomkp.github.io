/* 高手教學庫（站主 2026-11-17：「就是一個教學庫一個課本的概念…這個教學庫包含所有可以教的東西」）
   資料：pros/lessons.json（課本）、pros/data.json（S19 評價）、pros/videos.json（高手與影片）。設計：Fable 5.2。純前端、不連外。 */
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
  let L = null, R = null, V = null;
  const proName = (k) => (L?.pros.find((p) => p.key === k) || {}).name || k;

  /* ---------- 課本 ---------- */
  function scopeTag(p) {
    const s = p.scope || {};
    if (s.level === "set") return h("span", { class: "pr-tag t-na" }, `${s.set || ""} 限定`);
    if (s.level === "patch") return h("span", { class: "pr-tag t-na" }, `${s.patch || s.set || ""} 版`);
    if (s.system_dependent) return h("span", { class: "pr-tag t-na" }, "數字以當季為準");
    return null;
  }
  function seasonOk(p) {
    const s = p.scope || {};
    if (st.season === "all") return true;
    if (st.season === "default") return s.level === "universal" || !s.level || s.set === "S19";
    if (st.season === "universal") return s.level === "universal" || !s.level;
    return s.set === st.season || (p.sources || []).some((x) => x.set === st.season);
  }
  function pointOk(p) {
    if (!seasonOk(p)) return false;
    if (st.cons === "consensus" && !["consensus", "multi"].includes(p.consensus)) return false;
    if (st.cons === "split" && p.consensus !== "split") return false;
    if (st.pros.size && !p.pros.some((k) => st.pros.has(k))) return false;
    const q = st.q.trim().toLowerCase();
    if (q && ![p.text, p.why, p.when, ...p.pros.map(proName)].some((x) => String(x || "").toLowerCase().includes(q))) return false;
    return true;
  }
  function point(p) {
    const srcs = []; const seen = new Set();
    for (const s of p.sources) { const k = s.pro + s.video; if (seen.has(k)) continue; seen.add(k); srcs.push(s); }
    { const one = [], rest = [], got = new Set(); for (const s of srcs) (got.has(s.pro) ? rest : (got.add(s.pro), one)).push(s); srcs.length = 0; srcs.push(...one, ...rest); }
    const split = p.consensus === "split" && p.sides && p.sides.length;
    return h("li", { class: "pr-pt", id: p.id },
      h("p", { class: "pr-pt-t" }, split ? "高手看法不同：" + p.sides.map((sd) => sd.label).join("，還是") + "？" : p.text),
      !split && (p.why || p.when) ? h("p", { class: "pr-pt-s" }, p.why ? `理由：${p.why}` : null, p.why && p.when ? "　" : null, p.when ? `情況：${p.when}` : null) : null,
      p.sides && p.sides.length ? h("div", { class: "pr-sides" }, p.sides.map((sd) => h("div", { class: "pr-side" },
        h("b", null, sd.label), h("p", null, sd.text), sd.why ? h("p", { class: "pr-pt-s" }, `理由：${sd.why}`) : null, sd.when ? h("p", { class: "pr-pt-s" }, `情況：${sd.when}`) : null,
        (sd.pros || []).length ? h("p", { class: "pr-pt-s" }, "這樣說的：" + sd.pros.map(proName).join("、")) : null))) : null,
      p.old_note ? h("p", { class: "pr-pt-s pr-old" }, `以前的講法已過時：${p.old_note}`) : null,
      !split && srcs.some((s) => s.note) ? h("ul", { class: "pr-notes" }, srcs.filter((s) => s.note).map((s) => h("li", null, `${proName(s.pro)} 補充：${s.note}`))) : null,
      h("div", { class: "pr-pt-m" },
        h("span", { class: "pr-tag " + (CONS[p.consensus] || CONS.single)[1] }, (CONS[p.consensus] || CONS.single)[0]), scopeTag(p),
        srcs.slice(0, 6).map((s) => h("a", { class: "pr-src-a" + (!split && (s.stance === "oppose" || s.stance === "old") ? " opp" : ""), href: ytUrl(s.video, s.t), target: "_blank", rel: "noopener", title: split ? null : s.stance === "oppose" ? "這位高手持相反看法" : s.stance === "old" ? "較早的講法，已被新的取代" : null }, `${proName(s.pro)}${split ? "" : s.stance === "oppose" ? "（相反）" : s.stance === "old" ? "（舊講法）" : ""} ▶ ${mmss(s.t) || "看原片"}`)),
        srcs.length > 6 ? h("span", { class: "pr-n" }, `等 ${srcs.length} 支`) : null));
  }
  function bookTab() {
    const pts = L.points.filter((p) => p.status !== "hidden" && p.status !== "review");
    const vis = pts.filter(pointOk);
    const chaps = L.chapters.filter((c) => c.id !== "other" || vis.some((p) => p.chapter === "other"));
    const search = h("input", { class: "pr-search", type: "search", placeholder: "搜尋觀念、高手（例：連敗、D 牌、前排）", value: st.q, "aria-label": "搜尋觀念" });
    search.addEventListener("input", () => { st.q = search.value; const k = search.selectionStart; render(); const s2 = $(".pr-search"); s2.focus(); s2.setSelectionRange(k, k); });
    const chip = (on, label, fn) => h("button", { type: "button", class: "pr-chip", "aria-pressed": String(on), onclick: () => { fn(); render(); } }, label);
    const toc = h("nav", { class: "pr-toc", "aria-label": "章節" }, chaps.map((c) => {
      const n = vis.filter((p) => p.chapter === c.id).length;
      return h("a", { href: "#ch-" + c.id, class: "pr-toc-a" + (n ? "" : " dim") }, c.name, h("span", { class: "pr-n" }, ` ${n}`));
    }));
    const body = chaps.map((c) => {
      const cp = vis.filter((p) => p.chapter === c.id);
      const who = new Set(cp.flatMap((p) => p.pros));
      return h("section", { class: "pr-ch", id: "ch-" + c.id },
        h("h2", null, c.name, h("span", { class: "pr-n" }, `　${cp.length} 條、${who.size} 位高手`)),
        h("p", { class: "small muted" }, c.desc),
        cp.length ? null : h("p", { class: "pr-empty small" }, "這一章還在補，之後每週整理新影片會陸續加進來。"),
        c.sections.filter((sec) => cp.some((p) => p.section === sec.id)).map((sec) => {
          const sp = cp.filter((p) => p.section === sec.id);
          const main = sp.filter((p) => !p.loose && p.consensus !== "split" && !(p.scope?.level === "set" && p.scope?.set !== "S19"));
          const split = sp.filter((p) => p.consensus === "split");
          const lim = sp.filter((p) => !p.loose && p.consensus !== "split" && p.scope?.level === "set" && p.scope?.set !== "S19");
          const loose = sp.filter((p) => p.loose);
          return h("div", { class: "pr-sec2", id: sec.id },
            h("h3", null, sec.name, sp.length < 3 ? h("span", { class: "pr-n" }, "　還在補") : null),
            main.length ? h("ul", { class: "pr-pts" }, main.map(point)) : null,
            split.length ? h("div", { class: "pr-split" }, h("h4", null, "看法分歧"), h("ul", { class: "pr-pts" }, split.map(point))) : null,
            lim.length ? h("details", { class: "pr-fold" }, h("summary", null, `賽季限定（${lim.length}）`), h("ul", { class: "pr-pts" }, lim.map(point))) : null,
            loose.length ? h("details", { class: "pr-fold" }, h("summary", null, `零散觀念（${loose.length}）`), h("ul", { class: "pr-pts" }, loose.map(point))) : null);
        }));
    });
    return h("div", null,
      h("div", { class: "pr-bar" }, search, h("span", { class: "pr-count" }, `符合 ${vis.length} 條`)),
      h("div", { class: "pr-bar", role: "group", "aria-label": "賽季" },
        chip(st.season === "default", "通用＋S19", () => (st.season = "default")), chip(st.season === "universal", "只看通用", () => (st.season = "universal")),
        ["S19", "S18", "S17"].map((s) => chip(st.season === s, s, () => (st.season = s))), chip(st.season === "all", "全部", () => (st.season = "all"))),
      h("div", { class: "pr-bar", role: "group", "aria-label": "共識" },
        chip(st.cons === "all", "全部觀念", () => (st.cons = "all")), chip(st.cons === "consensus", "兩位以上都講", () => (st.cons = "consensus")), chip(st.cons === "split", "看法分歧", () => (st.cons = "split"))),
      h("div", { class: "pr-bar", role: "group", "aria-label": "高手" },
        chip(!st.pros.size, "全部高手", () => st.pros.clear()),
        L.pros.filter((p) => pts.some((x) => x.pros.includes(p.key))).map((p) => chip(st.pros.has(p.key), p.name, () => (st.pros.has(p.key) ? st.pros.delete(p.key) : st.pros.add(p.key))))),
      h("div", { class: "pr-book" }, toc, h("div", { class: "pr-book-body" }, body)));
  }

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
      h("div", { class: "pr-who" }, L.pros.map((p) => {
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
    const app = $("#pr-app"), y = window.scrollY;
    const tabs = [["book", "📖", "課本"], ["review", "🆕", "S19 評價"], ["videos", "🎬", "高手與影片"]];
    app.replaceChildren(
      h("div", { class: "pr-meta" }, h("span", null, `上次更新：${L.updated}`), h("span", null, `已整理 ${L.stats.videos_done} 支影片、${L.stats.points} 條觀念`)),
      h("div", { class: "pr-tabs", role: "tablist" }, tabs.map(([id, ic, t]) => h("button", { type: "button", role: "tab", class: "pr-tab", "aria-selected": String(st.tab === id), onclick: () => { st.tab = id; history.replaceState(null, "", "#" + id); render(); window.scrollTo(0, 0); } }, h("span", { "aria-hidden": "true" }, ic), t))),
      st.tab === "book" ? bookTab() : st.tab === "review" ? reviewTab() : videoTab());
    window.scrollTo(0, y);
  }
  const get = (f) => fetch(f + "?v=" + Date.now().toString(36).slice(0, -4)).then((r) => r.json());
  function loadReviews() { get("data.json").then((d) => { R = d; render(); }).catch((e) => { console.error(e); R = { units: [], traits: [], intro: "評價資料載入失敗，請重新整理。" }; render(); }); }
  function loadVideos() { get("videos.json").then((d) => { V = d; render(); }).catch(() => { V = { videos: [], catalog: [] }; render(); }); }
  get("lessons.json").then((d) => {
    L = d; $("#pr-loading").remove(); $("#pr-app").hidden = false;
    const hsh = location.hash.slice(1);
    if (hsh === "review" || hsh === "units" || hsh === "traits") st.tab = "review"; else if (hsh === "videos") st.tab = "videos";
    render();
    if (hsh && st.tab === "book") { const t = document.getElementById(hsh); if (t) { if (t.closest("details")) t.closest("details").open = true; t.scrollIntoView(); } }
  }).catch(() => { $("#pr-loading").textContent = "資料載入失敗，請重新整理再試一次。"; });
})();

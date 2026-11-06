/* 巧克力MKP的戰棋研究室｜前端
   - 資料全部來自 data/site-data.json（公開資料，不含任何私人研究規則）。
   - 必要條件與加分條件分開：缺必要條件的陣容不會出現在推薦裡。
   - 匿名閱讀統計需讀者同意，且站主本人與未登入的瀏覽不記錄。 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
  const num = (x, d = 2) => (x == null ? "—" : Number(x).toFixed(d));
  const fmtTime = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) + "（台灣時間）"; }
    catch { return iso; }
  };
  const slug = (id) => "c-" + String(id).replace(/[^A-Za-z0-9]+/g, "-");

  let D, CH, IT, TR, XI = {}, EM = {}, ICONS = new Set();
  const S = { comp: new Set(), item: new Set(), champ: new Set(), cond: new Set() };
  const AD = new Set(["InfinityEdge", "Deathblade", "GiantSlayer", "LastWhisper", "Bloodthirster", "SteraksGage", "EdgeOfNight"]);
  const AP = new Set(["JeweledGauntlet", "RabadonsDeathcap", "ArchangelsStaff", "Morellonomicon"]);

  /* ---------- 名稱與圖示 ---------- */
  const champName = (k) => { const c = CH[k]; return c ? (c.zh || c.en) : k; };
  const itemName = (k) => {
    if (EM[k]) return EM[k].zh;
    if (k.endsWith("Emblem")) { const t = TR[k.slice(0, -6)]; return (t ? (t.zh || t.en) : k.slice(0, -6)) + "徽章"; }
    const i = IT[k] || XI[k]; return i ? (i.zh || i.en) : k;
  };
  const traitName = (k) => { const t = TR[k]; return t ? (t.zh || t.en) : k; };
  const unverifiedMark = (status) => (status && status !== "verified" ? h("span", { class: "tag unv", title: "名稱尚未與遊戲內核對" }, "名稱未核對") : null);

  function icon(kind, key, size = "") {
    const isChamp = kind === "champion";
    const c = isChamp ? CH[key] : null;
    const name = isChamp ? champName(key) : itemName(key);
    const box = h("span", { class: `ico ${size} ${isChamp && c ? "c" + c.cost : "item"}`, role: "img", "aria-label": name });
    const fb = h("span", { class: "fb" }, name.replace(/(轉職|徽章)$/, "").slice(0, 2));
    const base = `icons/${isChamp ? "champions" : "items"}/${isChamp ? key : (IT[key]?.icon || key)}`;
    const path = ICONS.has(base + ".webp") ? base + ".webp" : base + ".png";
    if (ICONS.has(path)) {
      const img = h("img", { src: path, alt: "", loading: "lazy", decoding: "async", width: 48, height: 48 });
      img.addEventListener("error", () => { img.remove(); box.append(fb); });
      box.append(img);
    } else box.append(fb);
    if (isChamp && c) box.append(h("span", { class: "cost", "aria-hidden": "true" }, c.cost));
    return box;
  }

  /* ---------- 頁首與首頁區塊 ---------- */
  // 站主 2026-11-04：首頁文字都要能改 → 固定文字用 ui()（鍵 ui:名稱；站主改過的版本在 D.uiText）
  function ui(key, def) {
    const k = "ui:" + key;
    const cur = O.edits[k] === null ? def : (D.uiText?.[k] ?? def);
    if (D.uiText?.[k] != null) (D.editBase ||= {})[k] ??= def;
    return tx(k, cur);
  }
  const uiStr = (key, def) => { const k = "ui:" + key; const e = O.edits[k]; return e && typeof e.after === "string" ? e.after : e === null ? def : (D.uiText?.[k] ?? def); };
  // 站主 2026-11-04 的版面（T 表往上、改動一覽、本次更新收起來、導覽順序）用程式調整，不動已發布的 index.html
  function adaptLayout() {
    const ul = document.querySelector(".nav ul");
    if (ul) ul.replaceChildren(...[["#tierlist", "nav.tier", "T 度表"], ["#updates-sec", "nav.updates", "本次更新"],
      ["#version", "nav.version", "版本主軸"], ["#picker", "nav.picker", "隨手速查"], ["#comps", "nav.comps", "陣容攻略"]].map(([href, k, t]) => h("li", null, h("a", { href, "data-tx": k }, t))));
    const up = $("#updates-sec"), tl = $("#tierlist");
    if (up && !$("#updates-fold")) {
      up.classList.add("slim");
      const list = $("#updates");
      up.replaceChildren(h("details", { class: "fold", id: "updates-fold" }, h("summary", null, h("h2", { "data-tx": "h2.updates" }, "本次更新重點"), h("span", { class: "fold-hint", id: "updates-count" })), list));
    }
    // 站主 2026-11-04：改動一覽不要佔大篇幅 → T 表標題旁一顆醒目的按鈕，點了才打開
    const th2 = $("#tierlist > h2");
    if (th2 && !$("#tier-head")) { const hd = h("div", { class: "sec-head", id: "tier-head" }); th2.before(hd); hd.append(th2, h("span", { id: "patch-btn-slot" })); }
    up?.after(tl); tl.after($("#version"));
    for (const [sel, k] of [["#tierlist h2", "h2.tier"], ["#version > h2", "h2.version"], ["#picker > h2", "h2.picker"], ["#comps > h2", "h2.comps"]]) $(sel)?.setAttribute("data-tx", k);
    $("#tierlist > p.small")?.remove();
  }
  function applyDataTx() {
    for (const el of document.querySelectorAll("[data-tx]")) {
      el.dataset.def ??= el.textContent;
      el.replaceChildren(ui(el.dataset.tx, el.dataset.def));
    }
  }
  function relTime(iso) {
    if (!iso) return "—";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} 分鐘前`;
    if (s < 86400) return `${Math.round(s / 3600)} 小時前`;
    return `${Math.round(s / 86400)} 天前`;
  }
  // 站主 2026-11-04：最上面的時間太佔版面 → 只留「上次更新：多久前」，細節和網站新功能都收起來
  function renderTop() {
    const p = D.patch, t = D.times;
    $("#patch").textContent = `${p.patch} 版本｜S${p.set}「${p.setName}」`;
    const meta = $("#meta"); meta.textContent = "";
    const when = t.publishedAt;
    meta.append(
      h("details", { class: "mini" }, h("summary", null, ui("meta.updated", "上次更新"), "：", h("b", { title: fmtTime(when) || "" }, relTime(when))),
        h("div", { class: "in small" },
          h("p", null, h("b", null, "網站內容發布："), fmtTime(when) || "—"),
          h("p", null, h("b", null, "高手資料："), t.dataUpdatedAt ? fmtTime(t.dataUpdatedAt) : (t.dataStatus || "尚無研究資料"),
            D.inference ? `（${D.inference.basePatch} 的對局；${D.inference.patch} 的資料還在累積）` : ""),
          h("p", null, h("b", null, "下一個版本："), `${p.nextPatch}：${p.nextPatchDate}`))),
      D.siteChanges?.length ? h("details", { class: "mini" }, h("summary", null, ui("meta.news", "網站新功能與改動")),
        h("div", { class: "in small" }, h("ul", { class: "list" }, D.siteChanges.map((x) => h("li", null, h("span", { class: "xs muted" }, x.date.slice(5).replace("-", "/") + "　"), tx(`version:sitechange.${x.id}`, x.text)))))) : null);
    $("#yt").href = D.brand.youtube; $("#th").href = D.brand.threads;
    $("#yt2").href = D.brand.youtube; $("#th2").href = D.brand.threads;
    // 頁尾的帳號文字跟著連結走（站主 2026-11-05：Threads 帳號是 @chokomkp）
    const handle = (u) => (String(u || "").match(/@[^/?#]+/) || [""])[0];
    if ($("#th2")) $("#th2").textContent = "Threads " + handle(D.brand.threads);
    if ($("#yt2")) $("#yt2").textContent = "YouTube " + handle(D.brand.youtube);
    // 站主 2026-11-04：右上角的頻道連結要明顯一點 → 品牌色按鈕（YouTube 紅、Threads 黑），符號用一般的播放鍵和 @
    for (const [id, glyph, label, sub] of [["#yt", "▶", "YouTube", "看影片"], ["#th", "@", "Threads", "追蹤"]]) {
      const a = $(id);
      if (!a || a.dataset.deco) continue;
      a.dataset.deco = "1"; a.classList.add("chbtn"); a.target = "_blank"; a.rel = "noopener";
      a.textContent = "";
      a.append(h("span", { class: "chg", "aria-hidden": "true" }, glyph), h("span", { class: "chl" }, h("b", null, label), h("small", null, sub)));
    }
  }

  function renderUpdates() {
    const ul = $("#updates"); ul.textContent = "";
    for (const u of D.updateNotes) ul.append(h("li", null, h("b", null, u.id ? tx(`update:${u.id}.title`, u.title) : u.title),
      h("span", { class: "muted" }, u.id ? tx(`update:${u.id}.impact`, u.impact) : u.impact)));
    const c = $("#updates-count"); if (c) c.textContent = `${D.updateNotes.length} 項，點開看`;
  }

  /* ---------- 改動一覽（站主 2026-11-04：增強、削弱、調整一眼看懂，特別是增幅跟神火） ---------- */
  const DIRS = { up: ["↑", "加強"], down: ["↓", "削弱"], adj: ["↔", "調整"], fix: ["✓", "修正"] };
  function pIcon(it) {
    if (it.unit && CH[it.unit]) return icon("champion", it.unit, "sm");
    const box = h("span", { class: "ico sm item pico" + (/set18_mechanicicon/.test(it.icon || "") ? " wisp" : /^traits\//.test(it.icon || "") ? " trait" : ""), role: "img", "aria-label": it.name });
    const fb = h("span", { class: "fb" }, it.name.slice(0, 2));
    if (it.icon) { const img = h("img", { src: "icons/" + it.icon, alt: "", loading: "lazy", width: 36, height: 36 }); img.addEventListener("error", () => { img.remove(); box.append(fb); }); box.append(img); }
    else box.append(fb);
    return box;
  }
  function patchChart(pc) {
    const body = h("div", { class: "pchart" });
    const all = pc.groups.filter((g) => g.id !== "fix").flatMap((g) => g.items);
    const n = (d) => all.filter((x) => x.dir === d).length;
    body.append(h("p", { class: "pc-sum" }, ui("patch.summary", pc.summary)),
      h("div", { class: "pc-count", "aria-label": "改動統計" }, ["up", "down", "adj"].filter((d) => n(d)).map((d) => h("span", { class: "dirtag " + d }, `${DIRS[d][0]} ${DIRS[d][1]} ${n(d)}`))));
    const card = (it) => h("div", { class: "pcard " + it.dir },
      pIcon(it),
      h("div", { class: "pc-txt" },
        h("div", { class: "pc-head" }, h("b", null, it.name), h("span", { class: "dirtag " + it.dir }, DIRS[it.dir][0] + " " + DIRS[it.dir][1])),
        h("div", { class: "small" }, it.what),
        it.from || it.to ? h("div", { class: "pc-ft" }, h("s", null, it.from), " → ", h("b", null, it.to)) : null,
        it.note ? h("div", { class: "xs muted" }, it.note) : null));
    for (const g of pc.groups) {
      const grid = h("div", { class: "pgrid2" }, g.items.map(card));
      if (g.id === "fix") body.append(h("details", { class: "pgroup" }, h("summary", null, `${g.label}（${g.items.length} 項）`), h("div", { class: "in" }, grid)));
      else body.append(h("div", { class: "pgroup" }, h("h3", null, g.label, g.remember ? h("span", { class: "tag remember" }, "容易忘") : null,
        h("span", { class: "xs muted" }, ` ${g.items.length} 項`)), grid));
    }
    return body;
  }
  function openPatch() {
    const pc = D.versionSummary?.patchChart;
    if (!pc) return;
    track("patch", pc.patch);
    $("#patch-modal")?.remove();
    const close = () => { bg.remove(); document.removeEventListener("keydown", esc); $("#patch-btn")?.focus(); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    const x = h("button", { class: "btn ghost", type: "button", onclick: close }, "關閉");
    const bg = h("div", { id: "patch-modal", class: "modal-bg", onclick: (e) => { if (e.target === bg) close(); } },
      h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": `${pc.patch} 改動一覽` },
        h("div", { class: "modal-head" }, h("h2", null, ui("h2.patch", `${pc.patch} 改動一覽`)), x),
        h("div", { class: "modal-body" }, patchChart(pc))));
    document.body.append(bg);
    document.addEventListener("keydown", esc);
    x.focus();
  }
  function renderPatch() {
    const pc = D.versionSummary?.patchChart, slot = $("#patch-btn-slot");
    if (!slot) return;
    slot.textContent = "";
    if (!pc) return;
    const all = pc.groups.filter((g) => g.id !== "fix").flatMap((g) => g.items);
    const n = (d) => all.filter((x) => x.dir === d).length;
    const ics = pc.groups.filter((g) => g.remember).flatMap((g) => g.items).filter((x) => x.icon).slice(0, 3);
    slot.append(h("button", { id: "patch-btn", class: "patch-btn", type: "button", onclick: openPatch, "aria-haspopup": "dialog" },
      h("span", { class: "pb-icons", "aria-hidden": "true" }, ics.map(pIcon)),
      h("span", { class: "pb-txt" }, h("span", { class: "pb-main" }, `${pc.patch} 改動一覽`),
        h("span", { class: "pb-sub" }, h("span", { class: "dirtag up" }, `↑ ${n("up")}`), h("span", { class: "dirtag down" }, `↓ ${n("down")}`), "增幅、神火都在這"))));
  }

  /* 版本主軸：練線路線（先練→再練）。同一步裡左強右弱，點陣容看完整攻略。 */
  function pathComp(id, i) {
    const c = D.comps.find((x) => x.id === id);
    if (!c) return null;
    const keys = [...new Set((c.core || [c.carrier]).filter(Boolean))].slice(0, 3);
    return h("a", { class: "pcomp", href: "#" + slug(id), onclick: () => track("path", id) },
      h("span", { class: "picons" }, keys.map((k, j) => icon("champion", k, j ? "xs" : "sm"))),
      h("span", { class: "pmeta" },
        h("span", { class: "nm" }, c.name, " ", c.tier ? h("span", { class: "tag tier" }, c.tier + " 級") : c.lane === "highroll" ? h("span", { class: "tag" }, "上限") : null,
          i === 0 ? h("span", { class: "tag up" }, "優先") : null),
        h("span", { class: "xs muted" }, rangeLine(c))));
  }
  function renderPath(p) {
    const wrap = h("div", { class: "path" },
      h("div", { class: "path-head" }, h("h3", null, tx("path:title", p.title)), h("p", { class: "small muted" }, tx("path:intro", p.intro)),
        p.stale ? h("p", { class: "notice small" }, `這是 ${p.patch} 的練線建議；新版本的高手資料足夠後會重新研究。`) : null));
    for (const st of p.steps) {
      wrap.append(h("div", { class: "pstep" },
        h("div", { class: "pnum", "aria-hidden": "true" }, String(st.step)),
        h("div", { class: "pbody" },
          h("div", { class: "phead" }, h("span", { class: "plabel" }, st.label), h("b", null, tx(`path:step${st.step}.line`, st.line))),
          h("div", { class: "pcomps" }, st.comps.map((id, i) => pathComp(id, i))),
          st.endpoint?.length ? h("p", { class: "pend small" }, "順風升九等接：", st.endpoint.map((id, i) => [i ? "、" : "", h("a", { href: "#" + slug(id) }, nameOf(id))])) : null,
          h("ul", { class: "list small pwhy" }, st.why.map((w) => h("li", null, tx(`path:step${st.step}.why.${w.id}`, w.text)))))));
    }
    if (p.skip?.length) wrap.append(h("div", { class: "pskip small" }, h("b", null, "先不用練"), h("ul", { class: "list" }, p.skip.map((s) => h("li", null, tx(`path:skip.${s.id}`, s.text))))));
    return wrap;
  }

  function renderVersion() {
    const v = D.versionSummary, box = $("#version-body"); box.textContent = "";
    if (v.status !== "ready") {
      box.append(h("div", { class: "notice" }, h("b", null, "還不下版本結論"), h("p", { class: "small", style: "margin:4px 0 0" }, v.pendingText)));
    } else if (v.path?.steps?.length) {
      box.append(renderPath(v.path));
    } else {
      box.append(h("div", { class: "card stack" }, h("p", null, tx("version:conclusion", v.conclusion)), v.priority ? h("ol", { class: "list" }, v.priority.map((x, i) => h("li", null, tx(`version:priority.${i}`, x)))) : null));
    }
  }

  /* 從2-1選路線（站主 2026-11-05：「舊網址的這個部分你也要做出來，定陣容，這是新手會看最多的地方」）
     文字裡 **粗體**；每張卡的代表陣容由建置時依最新資料挑。區塊和導覽連結由這裡插入，不用改 index.html。 */
  function rich(key, text) {
    const t = tx(key, text);
    const parse = (s) => String(s).split(/\*\*(.+?)\*\*/).map((x, i) => (i % 2 ? h("strong", null, x) : x));
    if (t == null || typeof t === "string") return t == null ? t : parse(t);
    t.replaceChildren(...parse(t.textContent).map((x) => (typeof x === "string" ? document.createTextNode(x) : x)));
    return t;
  }
  function routeComp(id) {
    const c = D.comps.find((x) => x.id === id);
    if (!c) return null;
    const keys = [...new Set((c.core || [c.carrier]).filter(Boolean))].slice(0, 2);
    return h("a", { class: "rcomp", href: "#" + slug(id), onclick: () => track("route", id) },
      h("span", { class: "picons" }, keys.map((k, j) => icon("champion", k, j ? "xs" : "sm"))),
      h("span", { class: "nm" }, c.name),
      c.tier ? h("span", { class: "tag tier" }, c.tier + " 級") : c.status !== "ready" ? h("span", { class: "tag" }, "研究中") : null,
      c.lane === "conditional" ? h("span", { class: "tag" }, "條件") : null);
  }
  // 站主 2026-11-05 20:17：「定陣路線做的很難懂…易讀性更高」→ 路線圖（一到五費 × 遊戲階段）＋選一條看逐步說明
  let ROUTE_SEL = 4;  // 預設八等四費：普通局最常走的一條
  const KIND_TXT = { keep: "先留著", decide: "定下來", do: "照計畫做" };
  const mark = (kind) => h("span", { class: "mk mk-" + kind, "aria-hidden": "true" });
  function routeMap(r) {
    const cols = r.cols || [];
    const grid = h("div", { class: "rmap", role: "tablist", "aria-label": "選一條路線看怎麼打", style: `--ncol:${cols.length}` },
      h("div", { class: "rm-head", "aria-hidden": "true" }, h("span", { class: "rm-corner" }, "階段"), cols.map((c) => h("span", { class: "rm-col" }, c))));
    for (const x of r.routes) {
      const at = cols.map((c) => { const ks = x.steps.filter((st) => (st.cols || []).includes(c)).map((st) => st.kind); return ks.includes("decide") ? "decide" : ks.includes("keep") ? "keep" : ks.includes("do") ? "do" : null; });
      const on = at.map((k, i) => (k ? i : -1)).filter((i) => i >= 0), lo = Math.min(...on), hi = Math.max(...on);
      const said = x.steps.filter((st) => (st.cols || []).length).map((st) => `${st.at} ${KIND_TXT[st.kind]}`).join("、");
      grid.append(h("button", { type: "button", role: "tab", class: "rm-row", "aria-selected": x.cost === ROUTE_SEL ? "true" : "false", "aria-controls": "route-panel",
        "aria-label": `${x.tag}：${x.goal}。${said}`, style: `--cc:var(--c${x.cost})`,
        onclick: () => { ROUTE_SEL = x.cost; track("route_tab", x.cost); renderRoute(); document.getElementById("route-panel")?.focus({ preventScroll: true }); } },
        h("span", { class: "rm-lab" }, h("b", null, x.tag.replace("核心", "")), h("span", null, tx(`route:c${x.cost}.goal`, x.goal))),
        at.map((k, i) => h("span", { class: "rm-cell" + (i >= lo && i <= hi ? " on" : "") + (i === lo ? " first" : "") + (i === hi ? " last" : "") }, k ? mark(k) : null))));
    }
    const lg = r.legend || {};
    return [grid, h("p", { class: "rm-legend xs" }, ["keep", "decide", "do"].map((k) => h("span", null, mark(k), lg[k] || KIND_TXT[k])), h("span", { class: "rm-hint" }, "點一列看這條怎麼打"))];
  }
  function routePanel(r) {
    const x = r.routes.find((y) => y.cost === ROUTE_SEL) || r.routes[0];
    return h("div", { class: "rpanel", id: "route-panel", role: "tabpanel", tabindex: "-1", style: `--cc:var(--c${x.cost})`, "aria-label": `${x.tag}怎麼打` },
      h("div", { class: "rp-head" },
        h("div", null, h("span", { class: "rp-tag" }, x.tag), h("h3", null, tx(`route:c${x.cost}.goal`, x.goal)), h("p", { class: "rp-sub small" }, tx(`route:c${x.cost}.title`, x.title))),
        x.comps?.length ? h("div", { class: "rcomps" }, h("span", { class: "rc-h" }, "代表陣容"), x.comps.map(routeComp)) : null),
      h("ol", { class: "rsteps" }, x.steps.map((st, j) => h("li", { class: "rstep k-" + st.kind },
        h("span", { class: "rs-at" }, mark(st.kind), h("span", null, st.at)),
        h("div", { class: "rs-body" },
          h("p", { class: "rs-title" }, h("b", null, tx(`route:c${x.cost}.s${j}.title`, st.title)), h("span", { class: "rs-kind" }, KIND_TXT[st.kind])),
          h("p", { class: "rs-rule" }, rich(`route:c${x.cost}.s${j}.rule`, st.rule)),
          st.detail ? h("p", { class: "rs-detail" }, rich(`route:c${x.cost}.s${j}.detail`, st.detail)) : null)))));
  }
  function renderRoute() {
    document.querySelector('.nav a[href="#updates-sec"]')?.parentElement?.remove();  // 站主 2026-11-05：「本次更新不要顯示在最上面的索引」
    const r = D.routeGuide;
    let sec = $("#route-sec");
    if (!r?.routes?.length) { sec?.remove(); $("#nav-route")?.remove(); return; }
    if (!sec) {
      sec = h("section", { class: "block", id: "route-sec" });
      const pk = $("#picker");
      if (pk) pk.after(sec); else $("#home")?.append(sec);
      const a = document.querySelector('.nav a[href="#picker"]');
      if (a && !$("#nav-route")) a.parentElement.after(h("li", { id: "nav-route" }, h("a", { href: "#route-sec" }, "定陣路線")));
    }
    if (!r.routes.some((x) => x.cost === ROUTE_SEL)) ROUTE_SEL = r.routes[0].cost;
    sec.textContent = "";
    sec.append(...[
      h("h2", null, tx("route:title", r.title)),
      r.stale ? h("p", { class: "notice small" }, `這是 ${r.patch} 的定陣建議；新版本的高手資料足夠後會重新研究。`) : null,
      h("p", { class: "rlead" }, rich("route:lead", r.lead)),
      h("div", { class: "ropen" }, h("h3", null, tx("route:openingTitle", r.openingTitle || "2-1 先看裝備")),
        h("div", { class: "ro-grid" }, (r.opening || []).map((o, i) => h("div", { class: "ro-item ro-" + i },
          h("p", { class: "ro-if" }, tx(`route:open${i}.title`, o.title)), h("p", null, rich(`route:open${i}.text`, o.text)))))),
      h("h3", { class: "rmap-title" }, "一到五費，什麼時候定下來"),
      ...routeMap(r),
      routePanel(r),
      r.count ? h("aside", { class: "rcount small" }, h("b", null, tx("route:countTitle", r.countTitle || "怎麼數張數")), " ", rich("route:count", r.count)) : null,
    ].filter(Boolean));
  }

  /* ---------- T 度表 ---------- */
  /* 站主 2026-11-04：均名、前四、吃雞新手看不懂 → 改成「下限」「上限」各分高／中／低 */
  const lvTag = (v) => h("b", { class: "lv lv-" + ({ 高: "hi", 中: "mid", 低: "lo" }[v] || "na") }, v || "—");
  const rangeLine = (c) => {
    const r = c.range || {};
    if (!r.ceil) return h("span", null, c.status === "custom" ? "待補資料" : "研究中");
    return h("span", { class: "rg" }, h("span", { class: "nw" }, "下限 ", lvTag(r.floor)), "｜", h("span", { class: "nw" }, "上限 ", lvTag(r.ceil)), c.freq != null ? ["｜", h("span", { class: "nw" }, `頻率 ${pct(c.freq)}`)] : null);
  };
  const tierLabel = (c) => c.tier ? `${c.tier} 級${D.inference && c.patchImpact?.tierFrom ? "（推測）" : ""}` : "";
  const reqText = (r) => (r || []).map((x) => x.text.replace(/（轉職）$/, "")).join("、");
  const impArrow = (c) => {
    const p = c.patchImpact;
    if (!p || !D.inference) return null;
    const sym = { up: "↑", down: "↓", mixed: "↕" }[p.dir];
    return h("span", { class: "imp " + p.dir, title: `${D.inference.patch}：${p.notes.join("、")}`, "aria-label": `${D.inference.patch} ${p.dir === "up" ? "變強" : p.dir === "down" ? "變弱" : "有加有減"}：${p.notes.join("、")}` }, sym);
  };
  function variantLine(v) {
    const ready = v.status === "ready";
    return h("button", { class: "vline" + (v.better ? " better" : ""), type: "button", onclick: () => go(v.id) },
      h("span", { class: "vk" }, reqText(v.required).replace("持有", "帶")),
      h("span", { class: "vs" }, ready ? rangeLine(v) : "研究中"),
      v.better ? h("span", { class: "tag up" }, "比主陣容強") : null);
  }
  // 分支短名：「卡瑪持有處刑者徽章（轉職）」→「卡瑪處刑者轉」；來牌分支用名稱後半（「雷葛爾疊層」）
  const branchShort = (v) => {
    const r = (v.required || [])[0];
    const m = r?.type === "emblem" && /(.+?)持有(.+?)徽章/.exec(r.text);
    return m ? `${m[1]}${m[2]}轉` : String(v.name).split(/\s*[·・]\s*/).pop();
  };
  const branchIcon = (v) => { const r = (v.required || [])[0]; return r?.type === "emblem" ? icon("item", r.key, "xs") : r?.key && CH[r.key] ? icon("champion", r.key, "xs") : null; };

  // 站主 T 表調整（預覽站）：評級、分區、順序、隱藏；站主手動加的陣容
  const withOwner = (c) => {
    const t = O.tiers[c.id];
    if (!t) return c;
    return { ...c, tier: ["S", "A", "B", "C"].includes(t.tier) ? t.tier : c.tier, hidden: t.tier === "hide" ? true : t.tier ? false : c.hidden,
      lane: t.lane || c.lane, ownerOrder: typeof t.order === "number" ? t.order : c.ownerOrder, tierSource: t.tier ? "owner" : c.tierSource };
  };
  const customToComp = (x) => ({ id: x.id, name: x.name, carrier: x.carrier, core: [x.carrier, ...(x.units || []).filter((u) => u !== x.carrier)].slice(0, 3), units: x.units || [],
    status: "custom", custom: true, lane: x.lane || "normal", tier: x.tier || null, ownerOrder: x.order ?? 999, ownerNote: x.note || "", required: [], rank: 999, cats: [] });
  function tierPool() {
    let xs = D.comps.filter((c) => c.status === "ready" || (c.status === "custom" && D.preview));
    if (O.on) {
      xs = xs.filter((c) => c.status !== "custom" || O.custom.some((y) => y.id === c.id));
      xs = xs.concat(O.custom.filter((y) => !xs.some((x) => x.id === y.id)).map(customToComp));
    }
    return xs.map((c) => withOwner(c.lane ? c : { ...c, lane: c.conditional ? "conditional" : "normal" }));
  }
  const LANES = [
    { id: "normal", label: "普通局", sub: "怎麼樣都能玩" },
    { id: "highroll", label: "九等五費", sub: "血量健康、順風才走" },
    { id: "conditional", label: "條件陣容", sub: "有轉職或來牌入口才玩" },
  ];
  const cellSort = (a, b) => (a.ownerOrder ?? 999) - (b.ownerOrder ?? 999) || (a.rank ?? 99) - (b.rank ?? 99);
  // T 表卡片：名稱一行、下限／上限做成有顏色的標籤、頻率淡色；條件只留一行淡色說明
  const lvPill = (label, v) => h("b", { class: "lvp lv-" + ({ 高: "hi", 中: "mid", 低: "lo" }[v] || "na") }, `${label} ${v || "—"}`);
  const fmtChg = (v) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(2));
  function tcard(c, pool) {
    const showReq = c.lane === "conditional" && c.required?.length;
    // 站主 2026-11-04：分支標「名次變動」（和主陣容比），不標評級、不標加強削弱（跟主陣容一樣，多餘）
    const vs = O.tmode ? [] : pool.filter((v) => v.baseOf?.some((b) => b.id === c.id) && !v.hidden && v.tier);
    const req = showReq ? c.required.map((r) => r.text.replace(/^入場條件：/, "").replace(/（轉職）$/, "")).join("、") : "";
    const r = c.range || {};
    const el = h("div", { class: "tc" + (c.custom ? " custom" : "") + (c.hidden ? " hid" : ""), "data-id": c.id },
      h("button", { class: "tc-main", type: "button", onclick: () => go(c.id) },
        icon("champion", c.carrier, "sm"),
        h("span", { class: "tc-txt" },
          h("span", { class: "tc-nm" }, h("span", { class: "nm" }, c.name), impArrow(c),
            c.patchImpact?.tierFrom && D.inference && c.tierSource !== "owner" ? h("span", { class: "was", title: `推測前是 ${c.patchImpact.tierFrom} 級` }, "原" + c.patchImpact.tierFrom) : null,
            c.custom ? h("span", { class: "tag todo" }, "待補資料") : null),
          r.ceil ? h("span", { class: "tc-sub" }, lvPill("下限", r.floor), lvPill("上限", r.ceil), c.freq != null ? h("span", { class: "tc-freq" }, `頻率 ${pct(c.freq)}`) : null)
            : h("span", { class: "tc-sub" }, c.custom ? "待補資料" : "研究中"),
          showReq ? h("span", { class: "tc-req", title: req }, "需要：", req) : null)),
      vs.length ? h("div", { class: "tc-br" }, h("span", { class: "tc-brh" }, "分支"), vs.sort(cellSort).map((v) => {
        const g = (c.variants || []).find((x) => x.id === v.id)?.avgGain;
        const chg = g == null ? null : -g;
        return h("button", { class: "brc", type: "button", title: `${v.name}（${reqText(v.required)}）：平均名次比主陣容${chg == null ? "—" : chg < 0 ? "前面 " + Math.abs(chg).toFixed(2) + " 名" : "後面 " + chg.toFixed(2) + " 名"}`, onclick: () => go(v.id) },
          branchIcon(v), h("span", { class: "brn" }, branchShort(v)),
          h("span", { class: "brchg " + (chg == null ? "" : chg < 0 ? "good" : chg > 0 ? "bad" : "") }, "名次 ", fmtChg(chg)));
      })) : null,
      O.tmode ? ownerTierCtl(c, pool) : null);
    return el;
  }
  function renderTiers() {
    const root = $("#tiers"); root.textContent = "";
    $("#tierlist > p.small")?.remove();
    const pool = tierPool();
    const ids = new Set(pool.filter((c) => !c.hidden || O.tmode).map((c) => c.id));
    // 分支收進主陣容卡片（站主 2026-11-04：分支不要佔一大格）；主陣容不在表上時，分支自己一張卡
    const isChip = (c) => !O.tmode && c.baseOf?.some((b) => ids.has(b.id) && pool.find((x) => x.id === b.id && !x.hidden));
    const shown = pool.filter((c) => (O.tmode || !c.hidden) && !isChip(c));
    if (D.inference) root.append(h("div", { class: "tb-infer small" }, h("b", { class: "tag infer" }, "推測"), " ",
      ui("tier.infer", `${D.inference.patch} 剛上線，先用 ${D.inference.basePatch} 的高手資料加上 ${D.inference.patch} 改動推測：↑ 變強、↓ 變弱，「原B」是推測前的評級。改版 ${D.inference.hours} 小時後、對局夠多就改用 ${D.inference.patch} 的資料。`)));
    root.append(h("p", { class: "tb-legend small" }, h("b", null, ui("tier.legendHead", "下限與上限：")), ui("tier.legend", "逆風選下限高的，順風選上限高的。")));
    const lanes = LANES.filter((l) => O.tmode || shown.some((c) => c.lane === l.id));
    const rows = ["S", "A", "B", "C"].filter((t) => O.tmode || shown.some((c) => c.tier === t));
    if (O.tmode || shown.some((c) => !c.tier)) rows.push("?");
    if (!shown.length) {
      root.append(h("p", { class: "empty" }, "目前沒有通過樣本門檻的陣容，因此不顯示評級。資料接入並通過檢查後會自動出現。"));
      if (O.tmode) root.append(ownerTierBar());
      return;
    }
    const nav = h("div", { class: "tb-lanes", role: "group", "aria-label": "跳到分區" });
    // 寬螢幕：陣容多的分區（例：條件陣容）給兩倍寬、一格放兩欄，整張表比較矮，一頁看得完
    const maxCell = (l) => Math.max(...["S", "A", "B", "C", "?"].map((t) => shown.filter((c) => c.lane === l.id && (t === "?" ? !c.tier : c.tier === t)).length));
    const widest = [...lanes].sort((a, b) => maxCell(b) - maxCell(a))[0];
    const wide = (l) => (l === widest && maxCell(l) >= 5 && lanes.length <= 3 ? 2 : 1);
    const tplD = "2.75rem " + lanes.map((l) => `minmax(${wide(l) * 14}rem, ${wide(l)}fr)`).join(" ");
    const grid = h("div", { class: "tb", style: `--cols:${lanes.length};--tpl-d:${tplD}`, role: "table", "aria-label": "T 度表：橫的是分區、直的是評級" });
    grid.append(h("div", { class: "tb-corner", role: "columnheader" }));
    lanes.forEach((l, i) => {
      const n = shown.filter((c) => c.lane === l.id).length;
      grid.append(h("div", { class: "tb-head", role: "columnheader", "data-lane": l.id }, h("b", null, ui(`lane.${l.id}`, l.label)), h("span", { class: "xs" }, ` ${n}`), h("span", { class: "tb-sub" }, ui(`lane.${l.id}.sub`, l.sub))));
      nav.append(h("button", { type: "button", onclick: () => { const hd = grid.querySelector(`.tb-head[data-lane="${l.id}"]`); const sc = grid.parentElement; sc.scrollTo({ left: hd.offsetLeft - grid.querySelector(".tb-corner").offsetWidth, behavior: "smooth" }); } }, uiStr(`lane.${l.id}`, l.label), h("span", { class: "xs" }, ` ${n}`)));
    });
    for (const t of rows) {
      grid.append(h("div", { class: "tb-tier t-" + (t === "?" ? "Q" : t), role: "rowheader" }, t === "?" ? "未分級" : t));
      for (const l of lanes) {
        const cs = shown.filter((c) => c.lane === l.id && (t === "?" ? !c.tier : c.tier === t)).sort(cellSort);
        grid.append(h("div", { class: "tb-cell" + (wide(l) > 1 ? " w2" : ""), role: "cell", "data-lane": l.id, "data-tier": t }, cs.length ? cs.map((c) => tcard(c, pool)) : h("span", { class: "tb-none", "aria-label": "沒有" }, "—")));
      }
    }
    const scroll = h("div", { class: "tb-scroll" }, grid);
    const wrap = h("div", { class: "tb-wrap" }, scroll);
    const hint = h("p", { class: "tb-hint xs" }, h("span", { class: "tb-swipe", "aria-hidden": "true" }, "⇆"), " ", ui("tier.hint", "左右滑動：右邊還有九等五費、條件陣容"));
    root.append(nav, hint, wrap);
    const heads = [...grid.querySelectorAll(".tb-head")], btns = [...nav.querySelectorAll("button")];
    const upd = () => {
      const max = scroll.scrollWidth - scroll.clientWidth;
      wrap.classList.toggle("can-scroll", max > 4);
      wrap.classList.toggle("at-start", scroll.scrollLeft < 4);
      wrap.classList.toggle("at-end", scroll.scrollLeft > max - 4);
      hint.hidden = !(max > 4); nav.hidden = !(max > 4);
      const x = scroll.scrollLeft + 60;  // 目前看的分區：按鈕標起來
      let cur = 0; heads.forEach((hd, i) => { if (hd.offsetLeft <= x) cur = i; });
      if (scroll.scrollLeft > max - 4) cur = heads.length - 1;
      btns.forEach((b, i) => b.setAttribute("aria-current", i === cur ? "true" : "false"));
    };
    scroll.addEventListener("scroll", upd, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(upd).observe(scroll); else addEventListener("resize", upd);
    requestAnimationFrame(upd); setTimeout(upd, 400);
    if (O.tmode) root.append(ownerTierBar());
  }

  /* ---------- 隨手速查 ---------- */
  let tab = "comp", q = "";
  function chip(set, key, kind, label, extra) {
    const on = S[set].has(key);
    return h("button", { class: "chip", type: "button", "aria-pressed": on ? "true" : "false",
      onclick: () => { on ? S[set].delete(key) : S[set].add(key); track("filter", set); renderPicker(); } },
      icon(kind, key, "sm"), label, extra);
  }
  function renderPicker() {
    const tabs = [["comp", "散件"], ["item", "已合成裝備"], ["champ", "關鍵來牌"], ["cond", "轉職與特殊資源"]];
    const tb = $("#picker-tabs"); tb.textContent = "";
    for (const [k, l] of tabs) tb.append(h("button", { type: "button", role: "tab", "aria-selected": tab === k ? "true" : "false",
      onclick: () => { tab = k; q = ""; renderPicker(); } }, l, S[k].size ? `（${S[k].size}）` : ""));
    const body = $("#picker-body"); body.textContent = "";
    if (tab === "comp") body.append(h("div", { class: "chips" }, D.gamedata.components.map((c) => chip("comp", c.key, "item", c.zh))));
    if (tab === "item") {
      body.append(h("input", { class: "search", type: "search", placeholder: "搜尋裝備名稱", value: q, oninput: (e) => { q = e.target.value; drawItems(); } }));
      const box = h("div", { class: "chips" }); body.append(box);
      const arts = h("div", { class: "chips" });
      body.append(h("h4", { class: "small", style: "margin:12px 0 4px" }, "神器"), arts);
      const match = (k, en) => !q || itemName(k).includes(q) || (en || "").toLowerCase().includes(q.toLowerCase());
      const drawItems = () => {
        box.textContent = ""; arts.textContent = "";
        for (const i of D.gamedata.items) { if ((i.kind || "completed") !== "completed" || !match(i.key, i.en)) continue; box.append(chip("item", i.key, "item", itemName(i.key), unverifiedMark(i.nameStatus))); }
        const artList = [...D.gamedata.items.filter((i) => i.kind === "artifact"), ...(D.gamedata.extraItems || []).filter((i) => i.kind === "artifact")];
        for (const i of artList) { if (!match(i.key, i.en)) continue; arts.append(chip("item", i.key, "item", itemName(i.key))); }
      };
      drawItems();
    }
    if (tab === "champ") {
      body.append(h("input", { class: "search", type: "search", placeholder: "搜尋英雄", value: q, oninput: (e) => { q = e.target.value; drawCh(); } }));
      const box = h("div"); body.append(box);
      const drawCh = () => { box.textContent = ""; for (let cost = 1; cost <= 5; cost++) { const cs = D.gamedata.champions.filter((c) => c.cost === cost && (!q || champName(c.key).includes(q) || c.en.toLowerCase().includes(q.toLowerCase()))); if (!cs.length) continue; box.append(h("div", { class: "costhead" }, `${cost} 費`), h("div", { class: "chips" }, cs.map((c) => chip("champ", c.key, "champion", champName(c.key))))); } };
      drawCh();
    }
    if (tab === "cond") {
      const em = (D.gamedata.emblems || []).length ? D.gamedata.emblems.map((e) => e.key) : D.gamedata.traits.filter((t) => t.kind !== "unique").map((t) => t.key + "Emblem");
      body.append(h("p", { class: "small muted" }, "選你已經拿到的徽章（轉職）。名稱與圖示來自 Riot 官方資料。"),
        h("div", { class: "chips" }, em.map((k) => chip("cond", k, "item", itemName(k)))));
    }
    renderResult();
  }

  function compItems(c) {
    const g = c.items || {};
    return { top: (g.top || []).map((x) => x.key), second: (g.second || []).map((x) => x.key), extra: (g.extra || []).map((x) => x.key) };
  }
  function evaluate(c) {
    const why = [], missing = [], reqState = [];
    let score = 0, unmet = 0;
    for (const r of c.required || []) {
      const ok = r.type === "emblem" ? S.cond.has(r.key) : (r.type === "champion" || r.type === "entry") ? S.champ.has(r.key) : r.type === "item" ? S.item.has(r.key) : false;
      reqState.push({ text: r.text, ok });
      if (ok) { score += 3; why.push(`已具備必要條件：${r.text}`); } else unmet++;
    }
    const ci = compItems(c);
    const allItems = [...ci.top, ...ci.second, ...ci.extra];
    for (const k of S.item) {
      if (ci.top.includes(k)) { score += 3; why.push(`${itemName(k)}是最重要裝備`); }
      else if (ci.second.includes(k)) { score += 2; why.push(`${itemName(k)}是次重要裝備`); }
      else if (ci.extra.includes(k)) { score += 1; why.push(`${itemName(k)}可以用`); }
    }
    for (const k of S.comp) {
      const into = ci.top.filter((i) => (IT[i]?.recipe || []).includes(k));
      if (into.length) { score += 1; why.push(`${itemName(k)}可合成 ${into.map(itemName).join("／")}`); }
    }
    for (const k of S.champ) {
      if ((c.core || []).includes(k) || c.carrier === k) { score += 2; why.push(`來了核心英雄 ${champName(k)}`); }
    }
    for (const b of c.bonus || []) if (b.type === "emblem" && S.cond.has(b.key)) { score += 2; why.push(`加分條件：${b.text}`); }
    for (const k of ci.top) if (!S.item.has(k)) missing.push(itemName(k));
    return { c, score, why, missing, reqState, unmet };
  }
  function renderResult() {
    const box = $("#picker-result"); box.textContent = "";
    const picked = [...S.comp].map((k) => ["comp", k]).concat([...S.item].map((k) => ["item", k]), [...S.champ].map((k) => ["champ", k]), [...S.cond].map((k) => ["cond", k]));
    const head = h("div", { class: "selected-line" }, h("b", null, "目前條件："));
    if (!picked.length) head.append(h("span", { class: "muted small" }, "還沒選。點左邊的散件、裝備、英雄或轉職。"));
    for (const [set, k] of picked) head.append(h("button", { class: "chip", type: "button", "aria-pressed": "true", onclick: () => { S[set].delete(k); renderPicker(); } },
      icon(set === "champ" ? "champion" : "item", k, "xs"), set === "champ" ? champName(k) : set === "comp" ? (D.gamedata.components.find((c) => c.key === k)?.zh || k) : itemName(k)));
    if (picked.length) head.append(h("button", { class: "btn ghost", type: "button", onclick: () => { for (const s of Object.values(S)) s.clear(); track("filter", "clear"); renderPicker(); } }, "全部清除"));
    box.append(head);
    if (!picked.length) return;

    const evals = D.comps.map(evaluate);
    const ready = evals.filter((e) => e.c.status === "ready");
    const rec = ready.filter((e) => e.unmet === 0 && e.score > 0).sort((a, b) => b.score - a.score || (a.c.rank ?? 99) - (b.c.rank ?? 99));
    const blocked = evals.filter((e) => e.unmet > 0 && (e.score > 0 || (e.c.required || []).some((r) => S.champ.has(r.key) || e.c.carrier && S.champ.has(e.c.carrier))));
    const pendingHit = [];  // 站主 2026-11-04：研究中的陣容新手用不到，不列

    const ad = [...S.item].filter((k) => AD.has(k)), ap = [...S.item].filter((k) => AP.has(k));
    if (ad.length && ap.length) box.append(h("div", { class: "notice small" }, h("b", null, "條件互相衝突"),
      ` 你同時有物理主C裝（${ad.map(itemName).join("、")}）和法系主C裝（${ap.map(itemName).join("、")}）。通常只能擇一當主C，另一邊的裝備給副C或坦克用；下面的推薦已分開列出，不會硬湊在同一套。`));

    if (rec.length) {
      box.append(h("h3", { style: "margin:12px 0 8px" }, "適合的陣容"));
      for (const e of rec.slice(0, 3)) box.append(recCard(e));
    } else {
      box.append(h("p", { class: "empty" }, ready.length ? "這組條件目前沒有對得上的已研究陣容。可以換個條件，或看下面的研究中方向。" : "目前還沒有完成研究的陣容可推薦（資料接入後會自動啟用）。"));
    }
    if (blocked.length) {
      box.append(h("h3", { style: "margin:16px 0 8px" }, "差必要條件，先不要玩"));
      for (const e of blocked) box.append(h("div", { class: "card rec small" }, h("b", null, e.c.name, " "), h("span", { class: "tag cond" }, ""),
        h("p", { style: "margin:4px 0 0" }, "缺少：", e.reqState.filter((r) => !r.ok).map((r) => r.text).join("、"), "。沒有這個條件時，它的強度不能直接套用。")));
    }
    if (pendingHit.length) {
      box.append(h("h3", { style: "margin:16px 0 8px" }, "對得上、但還在研究中的方向"));
      box.append(h("ul", { class: "list small" }, pendingHit.map((e) => h("li", null, h("a", { href: "#" + slug(e.c.id) }, e.c.name), "：", e.why.join("；"), "（尚無合資格數據，不當成推薦）"))));
    }
  }
  function recCard(e) {
    const c = e.c;
    const alt = (c.compare || [])[0], sw = (c.switchTo || []);
    return h("div", { class: "card rec" },
      h("h4", null, icon("champion", c.carrier, "sm"), h("a", { href: "#" + slug(c.id) }, c.name), c.tier ? h("span", { class: "tag" }, tierLabel(c)) : c.lane === "highroll" ? h("span", { class: "tag" }, "九等五費") : null, c.conditional ? h("span", { class: "tag cond" }, "") : null),
      h("dl", null,
        h("dt", null, "為什麼適合"), h("dd", null, e.why.join("；") || "—"),
        h("dt", null, "還缺什麼"), h("dd", null, e.missing.length ? e.missing.slice(0, 3).join("、") : "最重要裝備已齊"),
        h("dt", null, "必要條件"), h("dd", null, e.reqState.length ? e.reqState.map((r) => (r.ok ? "✓ " : "✗ ") + r.text).join("；") : "無，普通局可玩"),
        h("dt", null, "另一套更好"), h("dd", null, alt ? [h("a", { href: "#" + slug(alt.id) }, nameOf(alt.id)), "：", alt.when] : "—"),
        h("dt", null, "不順時轉哪套"), h("dd", null, sw.length ? sw.map((s, i) => [i ? "；" : "", h("a", { href: "#" + slug(s.id), onclick: () => track("switch", c.id + ">" + s.id) }, nameOf(s.id)), "：", s.when]) : "—")));
  }
  const nameOf = (id) => {
    const c = D.comps.find((x) => x.id === id);
    if (!c) return id;
    const miss = (c.required || []).filter((r) => !(r.type === "emblem" ? S.cond.has(r.key) : (r.type === "champion" || r.type === "entry") ? S.champ.has(r.key) : S.item.has(r.key)));
    return c.name + (miss.length ? `（需要：${miss.map((r) => r.text).join("、")}）` : "");
  };

  /* ---------- 陣容清單與詳細頁 ---------- */
  // 陣容速查分類（站主 2026-11-04：常用、法系、物理、追三、95、條件等等）
  const CATS = ["全部", "常用", "追三", "95", "條件", "法系", "物理", "攻速"];
  let compCat = "全部";
  const LANE_ORDER = { normal: 0, conditional: 1, highroll: 2 };
  function renderCompList() {
    const box = $("#comp-list"); box.textContent = "";
    const order = D.comps.filter((c) => c.status === "ready").sort((a, b) => LANE_ORDER[a.lane || "normal"] - LANE_ORDER[b.lane || "normal"] || (a.conditional ? 1 : 0) - (b.conditional ? 1 : 0) || "SAB".indexOf(a.tier || "B") - "SAB".indexOf(b.tier || "B") || (a.rank ?? 99) - (b.rank ?? 99));
    const count = (k) => order.filter((c) => k === "全部" || (c.cats || []).includes(k)).length;
    const bar = h("div", { class: "tabs catbar", role: "tablist", "aria-label": "陣容分類" }, CATS.filter((k) => count(k)).map((k) =>
      h("button", { type: "button", role: "tab", "aria-selected": compCat === k ? "true" : "false", onclick: () => { compCat = k; track("cat", k); renderCompList(); } }, `${k === "95" ? "九等五費" : k}（${count(k)}）`)));
    box.parentElement.querySelector(".catbar")?.remove();
    box.before(bar);
    // 和 T 表同一種卡片（同樣的東西長得一樣），左上角多一個評級
    for (const c of order.filter((c) => compCat === "全部" || (c.cats || []).includes(compCat))) {
      const card = tcard(c, []);
      card.classList.add("tc-list");
      card.querySelector(".tc-nm")?.prepend(c.tier ? h("b", { class: "tl t-" + c.tier, "aria-label": c.tier + " 級" }, c.tier) : null);
      card.append(h("div", { class: "tc-cats" }, (c.cats || []).map((k) => h("span", { class: "cat" }, k === "95" ? "九等五費" : k))));
      box.append(card);
    }
  }

  // 站主 2026-11-04：賭一費 5 等就要有盤面、賭二費 6 等、賭三費 7 等
  const rerollTitle = (c) => `${c.rerollLevel} 等盤面（賭${"一二三"[(c.rerollCost || 1) - 1]}費：${c.rerollLevel} 等就要有這個盤面）`;
  const levelsOf = (c) => [c.rerollLevel, 8, 9].filter(Boolean);
  /* ---------- 攻略頁棋盤：只放一張主圖，升等要補的、可以替換的放旁邊（站主 2026-11-04，參考 TFT Academy 的 Flex Units） ---------- */
  // 主圖人口：一費 5、二費 6、三費 7、四費 8（站主指定）；五費主C 放 9；沒有那張棋盤就退回 8／9
  const COST_LV = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 };
  const boardOk = (c, lv) => c.boards?.["lv" + lv]?.status === "ok";
  function mainLevel(c) {
    if (c.rerollLevel && boardOk(c, c.rerollLevel)) return c.rerollLevel;
    const want = COST_LV[CH[c.carrier]?.cost];
    if (want && boardOk(c, want)) return want;
    return [8, 9, 7, 6, 5].find((lv) => boardOk(c, lv)) || null;
  }
  const keysOf = (b) => champsOnly(b?.units).map((u) => u.key);
  const msDiff = (a, b) => { const left = [...b]; return a.filter((k) => { const i = left.indexOf(k); if (i < 0) return true; left.splice(i, 1); return false; }); };
  // 同上，但回傳棋子本身（要帶裝備）：a 是棋子陣列，b 是代碼陣列
  const msDiffU = (a, b) => { const left = [...b]; return a.filter((u) => { const i = left.indexOf(u.key); if (i < 0) return true; left.splice(i, 1); return false; }); };
  // 升等路線：主圖往上每一張棋盤和前一張比（只補＝升等要補；有拿掉＝換一組）；比主圖低的棋盤＝那個等級先怎麼放
  function levelSteps(c, M, boards = c.boards) {
    const lvs = Object.keys(boards || {}).map((k) => +k.slice(2)).filter((lv) => boards["lv" + lv]?.status === "ok").sort((a, b) => a - b);
    const out = [];
    let prev = M;
    for (const lv of lvs.filter((x) => x > M)) {
      const a = keysOf(boards["lv" + prev]), b = keysOf(boards["lv" + lv]);
      const add = msDiffU(champsOnly(boards["lv" + lv]?.units), a), rem = msDiff(a, b);
      if (add.length || rem.length) out.push({ level: lv, add, rem });
      prev = lv;
    }
    for (const lv of lvs.filter((x) => x < M).reverse()) {
      const a = keysOf(boards["lv" + M]), b = keysOf(boards["lv" + lv]);
      const early = msDiffU(champsOnly(boards["lv" + lv]?.units), a), later = msDiff(a, b);
      if (early.length) out.push({ level: lv, early, later, below: true });
    }
    return out;
  }
  // 六角頭像（費用色框）；corner＝換掉的那隻（左上小圖）、badge＝第幾等補（左上數字）
  // 站主 2026-11-04：「牌上面也要推薦裝備」→ 頭像下面放推薦裝備；站主編輯時可以點選（onPick）
  function fhex(key, { corner = null, badge = null, name = true, items = null, onPick = null, sel = false } = {}) {
    const cost = CH[key]?.cost || 1;
    const its = (items || []).slice(0, 3);
    const attrs = { class: "fhex c" + cost + (onPick ? " pick" : "") + (sel ? " sel" : ""), title: champName(key) + (corner ? `（換掉${champName(corner)}）` : badge ? `（${badge} 等補上）` : "") + (its.length ? "｜推薦裝備：" + its.map(itemName).join("、") : "") };
    const kids = [h("span", { class: "fhex-in" }, icon("champion", key)),
      corner ? h("span", { class: "fhex-corner" }, icon("champion", corner, "xs")) : null,
      badge ? h("span", { class: "fhex-lv" }, String(badge)) : null,
      its.length ? h("span", { class: "fhex-items" }, its.map((i) => icon("item", i, "xs"))) : null,
      name ? h("span", { class: "fhex-name" }, champName(key)) : null];
    return onPick ? h("button", { ...attrs, type: "button", "aria-pressed": sel ? "true" : "false", onclick: onPick }, kids) : h("span", attrs, kids);
  }
  const miniRow = (keys) => h("span", { class: "fx-minis" }, keys.map((k) => h("span", { class: "fx-mini" }, icon("champion", k, "xs"), champName(k))));
  /* 旁邊一區：升等要補、可以替換。ed＝站主編輯（站主 2026-11-04：「你這邊也要讓我可以修改，包括加甚麼牌，牌上面也要推薦裝備」） */
  function sidePanel(c, M, boards = c.boards, ed = null) {
    const steps = levelSteps(c, M, boards);
    const flexSrc = ed ? ed.flex : c.flex;
    const fx = Object.entries(flexSrc || {}).map(([k, xs]) => [+k.slice(2), xs]).filter(([lv]) => lv >= M || M < 8).sort((a, b) => a[0] - b[0]);
    if (ed) for (const lv of ed.flexLevels) if (!fx.some(([l]) => l === lv)) fx.push([lv, []]);
    fx.sort((a, b) => a[0] - b[0]);
    const upLvs = ed ? ed.stepLevels : [];
    if (!steps.length && !fx.some(([, xs]) => xs.length) && !ed) return null;
    const box = h("aside", { class: "fxpanel" + (ed ? " editing" : ""), "aria-label": "升等要補與可以替換" });
    const isSel = (k) => ed?.sel && ed.sel.kind === k.kind && ed.sel.lv === k.lv && ed.sel.key === k.key && ed.sel.i === k.i;
    const pickOf = (k) => (ed ? () => ed.select(isSel(k) ? null : k) : null);
    const selBox = (k) => (ed && isSel(k) ? ed.selPanel(k) : null);
    const stepUnits = (s, lv) => s.add.map((u) => fhex(u.key, { badge: lv, items: u.items, onPick: pickOf({ kind: "step", lv, key: u.key }), sel: isSel({ kind: "step", lv, key: u.key }) }));
    const stepSel = (lv, us) => us.map((u) => selBox({ kind: "step", lv, key: u.key })).find(Boolean) || null;
    if (steps.length || upLvs.length) {
      box.append(h("p", { class: "fx-h" }, "升等要補"));
      for (const s of steps.filter((s) => s.below)) {
        box.append(h("div", { class: "fx-group" },
          h("div", { class: "fx-gh" }, h("span", { class: "fx-lvtag" }, `${s.level} 等`), `還沒到 ${M} 等時先放`),
          h("div", { class: "fx-units" }, s.early.map((u) => fhex(u.key, { badge: s.level, items: u.items }))),
          s.later.length ? h("p", { class: "fx-cap" }, `${M} 等時改放 `, s.later.map(champName).join("、")) : null));
      }
      const ups = steps.filter((s) => !s.below);
      const lvs = [...new Set([...ups.map((s) => s.level), ...upLvs])].sort((a, b) => a - b);
      for (const lv of lvs) {
        const s = ups.find((x) => x.level === lv) || { level: lv, add: [], rem: [] };
        const addBtn = ed ? h("button", { class: "chip add fx-add", type: "button", onclick: () => ed.addStep(lv) }, "＋ 加棋子") : null;
        if (!s.rem.length) {
          box.append(h("div", { class: "fx-step" + (ed ? " fx-group" : "") }, h("span", { class: "fx-lvtag" }, `${lv} 等`),
            h("div", { class: "fx-units" }, stepUnits(s, lv), s.add.length || !ed ? null : h("span", { class: "xs muted" }, "（和前一張一樣）"), addBtn), stepSel(lv, s.add)));
        } else {
          box.append(h("div", { class: "fx-group" },
            h("div", { class: "fx-gh" }, h("span", { class: "fx-lvtag" }, `${lv} 等`), "換一組：拿掉", miniRow(s.rem)),
            h("div", { class: "fx-units" }, stepUnits(s, lv), addBtn), stepSel(lv, s.add)));
        }
      }
    }
    if (fx.length) {
      box.append(h("p", { class: "fx-h" }, "可以替換"));
      for (const [lv, xs] of fx) {
        if (lv !== M) box.append(h("p", { class: "fx-sub" }, `${lv} 人口時`));
        xs.forEach((x, i) => {
          const meta = h("p", { class: "fx-meta" }, x.share != null ? [`高手 ${Math.round(x.share * 100)}% 這樣換`, h("span", { class: "brchg " + (x.chg < -0.05 ? "good" : x.chg > 0.05 ? "bad" : "") }, `名次 ${fmtChg(x.chg)}`)] : "站主推薦",
            ed ? h("button", { class: "linkbtn fx-del", type: "button", onclick: () => ed.delFlex(lv, i) }, "刪除這組") : null);
          const unitOf = (k) => fhex(k, { corner: x.out.length === 1 && x.in.length === 1 ? x.out[0] : null, name: !(x.out.length === 1 && x.in.length === 1), items: x.items?.[k],
            onPick: pickOf({ kind: "flex", lv, i, key: k }), sel: isSel({ kind: "flex", lv, i, key: k }) });
          const sel = x.in.map((k) => selBox({ kind: "flex", lv, i, key: k })).find(Boolean) || null;
          if (x.out.length === 1 && x.in.length === 1) {
            box.append(h("div", { class: "fx-one-wrap" }, h("div", { class: "fx-one" }, unitOf(x.in[0]),
              h("div", { class: "fx-txt" }, h("span", null, h("b", null, champName(x.in[0])), h("span", { class: "fx-cap" }, ` 換掉${champName(x.out[0])}`)), meta)), sel));
          } else {
            box.append(h("div", { class: "fx-group" },
              h("div", { class: "fx-gh" }, "一組換：拿掉", miniRow(x.out)),
              h("div", { class: "fx-units" }, x.in.map(unitOf)), meta, sel));
          }
        });
        if (ed) box.append(ed.flexForm?.lv === lv ? ed.flexFormBox(lv) : h("button", { class: "chip add fx-add", type: "button", onclick: () => ed.openFlexForm(lv) }, `＋ 加一組替換${lv !== M ? `（${lv} 人口）` : ""}`));
      }
      box.append(h("p", { class: "xs muted fx-note" }, "「可以替換」是高手同等級的終局棋盤裡，和這張圖比最常見的換法；名次是換了之後平均名次的變化（負的＝比較好）。頭像下面是推薦裝備。"));
    }
    if (ed) box.append(h("p", { class: "xs muted fx-note" }, "站主編輯：點旁邊的頭像可以改裝備或拿掉；「＋ 加棋子」加在那個等級（更高等級也會一起加）。改完按棋盤下面的「儲存棋盤」。"));
    return box;
  }
  function boardTitle(c, M) {
    if (c.rerollLevel && M === c.rerollLevel) return rerollTitle(c);
    return `${M} 人口站位圖`;
  }
  function boardArea(c, M) {
    const b = board(c.boards?.["lv" + M], M, c);
    if (!b) return null;
    const side = sidePanel(c, M);
    const list = b.querySelector(":scope > .unit-list");  // 棋子清單另外排：手機上放在「升等要補／可以替換」下面
    list?.remove();
    return h("div", { class: "bwrap" + (side ? " has-side" : "") }, h("div", { class: "bmain" }, b), side, list ? h("div", { class: "blist" }, list) : null);
  }
  /* ---------- 棋盤共用：神木植物、百戰老兵騎乘者、星級（站主 2026-11-04） ---------- */
  const ELDER = "Elderwood", SPRY = "Sprykin";
  const PLANT = { stonebark: "石皮樹", lifebloom: "生命花", protector: "深林保護者" };
  const isPlant = (u) => !!u?.plant;
  const champsOnly = (units) => (units || []).filter((u) => !isPlant(u));
  const traitN = (units, t) => {
    let n = 0;
    for (const u of champsOnly(units)) {
      if ((CH[u.key]?.traits || []).includes(t)) n++;
      for (const it of u.items || []) if ((EM[it]?.trait || (it.endsWith("Emblem") ? it.slice(0, -6) : null)) === t) n++;
    }
    return n;
  };
  // 神木精靈：3 隻＝石皮樹＋生命花、5 隻＝再一棵石皮樹、7 隻＝加深林保護者、9／11 隻＝植物 2／3 星（遊戲內特性說明）
  function plantPlan(units) {
    const n = traitN(units, ELDER);
    if (n < 3) return [];
    const star = n >= 11 ? 3 : n >= 9 ? 2 : 1, ks = ["stonebark", "lifebloom"];
    if (n >= 5) ks.push("stonebark");
    if (n >= 7) ks.push("protector");
    return ks.map((k) => ({ plant: k, star }));
  }
  // 植物數量跟著神木人數自動增減；已經放好的位置保留，新的放在前排空格
  function withPlants(units) {
    const champs = champsOnly(units), pool = (units || []).filter(isPlant), out = [];
    const taken = new Set(champs.filter((u) => u.pos).map((u) => u.pos.join(",")));
    for (const p of plantPlan(units)) {
      const i = pool.findIndex((x) => x.plant === p.plant);
      const x = i >= 0 ? pool.splice(i, 1)[0] : { plant: p.plant, pos: null };
      x.key = "plant:" + p.plant; x.star = p.star; x.items = [];
      if (x.pos && taken.has(x.pos.join(","))) x.pos = null;
      if (!x.pos) { outer: for (const r of [0, 1, 2, 3]) for (const c of [3, 2, 4, 1, 5, 0, 6]) if (!taken.has(r + "," + c)) { x.pos = [r, c]; break outer; } }
      if (x.pos) taken.add(x.pos.join(","));
      out.push(x);
    }
    return champs.concat(out);
  }
  const isSpry = (k) => (CH[k]?.traits || []).includes(SPRY);
  const spryOn = (units) => traitN(units, SPRY) >= ((TR[SPRY]?.breakpoints || [3])[0]);
  const starTag = (n) => h("span", { class: "stars s" + n, "aria-label": n + " 星" }, "★".repeat(n));
  const riderBadge = () => h("span", { class: "rider-badge", title: "騎乘者（騎上毛茸茸大夥伴）" }, h("img", { src: "icons/traits/Sprykin.png", alt: "" }));
  const plantTile = (u) => h("span", { class: "plant", title: PLANT[u.plant] }, h("img", { src: "icons/traits/Elderwood.png", alt: "" }), h("span", { class: "pl-n" }, PLANT[u.plant]));
  function hexInner(u, showMark = true) {
    if (isPlant(u)) return [starTag(u.star || 1), plantTile(u)];
    return [starTag(u.star), icon("champion", u.key), showMark && u.mark ? markBadge() : null, u.rider ? riderBadge() : null,
      h("span", { class: "its" }, (u.items || []).map((i) => icon("item", i, "xs")))];
  }
  const plantSummary = (units) => {
    const ps = (units || []).filter(isPlant);
    if (!ps.length) return null;
    const c = {}; for (const p of ps) c[p.plant] = (c[p.plant] || 0) + 1;
    return Object.entries(c).map(([k, n]) => PLANT[k] + (n > 1 ? ` ×${n}` : "")).join("、") + (ps[0].star > 1 ? `（${ps[0].star} 星）` : "");
  };

  function board(b, level, c) {
    if (!b || b.status === "na") return h("p", { class: "muted small" }, b?.reason || "不適用");
    if (b.status !== "ok") return null;  // 沒有棋盤就整區不顯示（新手用不到「樣本不足」）
    let units = b.units, auto = false;
    // 站主 2026-11-05：「有些陣容的站位圖在正式版的不見了」→ 沒有站位資料的棋盤，照站主編輯器同樣的規則自動排示意站位
    // （同陣容其他等級有站位的照抄位置；其餘坦在前排、持裝輸出在後排角落）
    if (c && !champsOnly(units).every((u) => Array.isArray(u.pos))) {
      const ref = [8, 9, 7, 6, 5].map((lv) => c.boards?.["lv" + lv]).find((x) => x?.units?.length && champsOnly(x.units).every((u) => Array.isArray(u.pos)));
      units = autoPlace(units.map((u) => ({ ...u, items: u.items || [], pos: Array.isArray(u.pos) ? [...u.pos] : null })), c, ref ? champsOnly(ref.units) : null);
      auto = true;
    }
    const cs = champsOnly(units);
    const pop = cs.reduce((n, u) => n + (CH[u.key]?.slots || 1), 0);
    const hasPos = cs.every((u) => Array.isArray(u.pos));
    const all = hasPos ? withPlants(units.map((u) => ({ ...u }))) : cs;
    const traits = {};
    for (const u of cs) for (const t of CH[u.key]?.traits || []) traits[t] = (traits[t] || 0) + 1;
    for (const u of cs) for (const it of u.items || []) if (it.endsWith("Emblem")) { const t = it.slice(0, -6); traits[t] = (traits[t] || 0) + 1; }
    const active = Object.entries(traits).map(([k, n]) => { const bp = (TR[k]?.breakpoints || []).filter((x) => x <= n); return bp.length ? `${traitName(k)} ${n}` : null; }).filter(Boolean);
    const marks = cs.filter((u) => u.mark).map((u) => champName(u.key));
    const riders = spryOn(cs) ? cs.filter((u) => u.rider && isSpry(u.key)).map((u) => champName(u.key)) : [];
    const plants = plantSummary(hasPos ? all : plantPlan(cs));  // 沒站位也列出神木植物
    const wrap = h("div", { class: "stack" },
      h("p", { class: "small" }, `人口 ${pop}／${level}${pop > level ? "（超出，請檢查）" : ""}｜啟動羈絆：${active.join("、") || "—"}`),
      marks.length ? h("p", { class: "small" }, h("b", null, "首領標記："), marks.join("、")) : null,
      riders.length ? h("p", { class: "small" }, h("b", null, "騎乘者："), riders.join("、"), "（騎上毛茸茸大夥伴）") : null,
      plants ? h("p", { class: "small" }, h("b", null, "神木植物："), plants) : null);
    if (hasPos) {
      const grid = h("div", { class: "board", role: "grid", "aria-label": `${level} 人口站位圖，四排七格` });
      for (let r = 0; r < 4; r++) {
        const row = h("div", { class: "brow" + (r % 2 ? " odd" : ""), role: "row" });
        for (let col = 0; col < 7; col++) {
          const u = all.find((x) => x.pos && x.pos[0] === r && x.pos[1] === col);
          row.append(h("div", { class: "hex" + (u ? " has" : "") + (isPlant(u) ? " is-plant" : ""), role: "gridcell" }, u ? hexInner(u) : null));
        }
        grid.append(row);
      }
      wrap.append(h("div", { class: "tablewrap" }, grid), h("p", { class: "xs muted" }, "上方為前排（第一排），下方為後排。",
        b.source === "template" ? "這版高手棋盤樣本還不夠，先放原站的示意盤（主C、副C、主坦掛首選裝備）。" : auto ? "這張是依角色排的示意站位（坦在前排、主C在後排角落），實際依對手調整。" : ""));
    } else wrap.append(h("p", { class: "xs muted" }, "這份棋盤還沒有站位資料，先列出角色、星級與裝備。"));
    wrap.append(h("div", { class: "unit-list" }, cs.map((u) => h("div", { class: "unit" }, icon("champion", u.key, "sm"),
      h("div", null, h("b", null, champName(u.key)), h("div", { class: "xs muted" }, `${u.star} 星${u.mark ? "｜首領標記" : ""}${u.rider && spryOn(cs) ? "｜騎乘者" : ""}`), h("div", null, (u.items || []).map((i) => icon("item", i, "xs"))))))));
    return wrap;
  }

  /* 合裝順序：沿用原站邏輯——三欄（最重要／次重要／補充）由「目前條件下最佳的完整三件套」決定，每欄只亮一件，
     其餘是同欄替代（另外兩件固定不變），顯示為暗色但仍可點選；點選已合裝（最多兩件）後重算包含它的最佳三件套。 */
  const ISTATE = {};
  // 站主規格（2026-11-04）：建置時已排好（MetaTFT 評級 A 以上、均名好 0.2 名、場數至少最多場一半 → 前面；其他照頻率）
  const qualified = (b) => b.n >= 30;
  const cmpB = (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.n - a.n || a.avg - b.avg;
  function hasAll(items, need) { const pool = [...items]; for (const k of need) { const i = pool.indexOf(k); if (i < 0) return false; pool.splice(i, 1); } return true; }
  function minus(items, rm) { const pool = [...items]; for (const k of rm) { const i = pool.indexOf(k); if (i >= 0) pool.splice(i, 1); } return pool; }
  function craftOrder(k, role) {
    if (role === "主坦") return /Gargoyle/.test(k) ? 0 : /Warmog/.test(k) ? 1 : /Steadfast|Bramble|DragonsClaw|AdaptiveHelm/.test(k) ? 2 : /SpiritVisage/.test(k) ? 4 : 3;
    if (/SpearOfShojin|BlueBuff|Guinsoo|Nashor/.test(k)) return 0;
    if (/SpiritVisage|Quicksilver|EdgeOfNight/.test(k)) return 2;
    return 1;
  }
  function itemModel(hero, sel) {
    const ranked = hero.builds.filter((b) => hasAll(b.items, sel)).sort(cmpB);
    const best = ranked[0];
    if (!best) return { ranked, best: null, cols: [] };
    const top3 = ranked.slice(0, 3), viable = ranked.slice(0, 20);
    const common = (k) => (top3.length >= 2 && top3.every((b) => b.items.includes(k)) ? 1 : 0);
    const breadth = (k) => viable.filter((b) => b.items.includes(k)).length;
    const anchors = best.items.map((k, i) => ({ k, i })).sort((a, b) => common(b.k) - common(a.k) || breadth(b.k) - breadth(a.k) || craftOrder(a.k, hero.role) - craftOrder(b.k, hero.role) || a.i - b.i).map((x) => x.k);
    const cols = anchors.map((anchor, idx) => {
      const fixed = anchors.filter((_, j) => j !== idx);
      const byKey = new Map();
      for (const b of hero.builds) {
        if (!hasAll(b.items, fixed) || !hasAll(b.items, sel)) continue;
        const k = minus(b.items, fixed)[0];
        if (!k) continue;
        const prev = byKey.get(k);
        if (!prev || cmpB(b, prev) < 0) byKey.set(k, { ...b, key: k });
      }
      const rows = [...byKey.values()].sort((a, b) => (b.key === anchor) - (a.key === anchor) || cmpB(a, b));
      return { anchor, fixed, rows };
    });
    const seen = new Set(), recs = [];
    for (const b of ranked) { const id = [...b.items].sort().join("|"); if (!seen.has(id)) { seen.add(id); recs.push(b); } if (recs.length >= 3) break; }
    return { ranked, best, cols, recs };
  }
  /* 站主 2026-11-04：裝備只看 MetaTFT 的評價、名次變動、頻率 */
  const chgText = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2));
  const metrics = (b) => `評價 ${b.tier || "—"}｜名次變動 ${chgText(b.chg)}｜頻率 ${b.share != null ? pct(b.share) : "—"}${b.n < 30 ? "｜場數少，僅供參考" : ""}`;
  function itemArea(c) {
    const area = h("div", { class: "itemarea" });
    const heroes = c.itemModel || [];
    if (!heroes.length) { area.append(h("p", { class: "empty small" }, "這套陣容還沒有足夠的完整三件套紀錄（每種組合至少 5 場）。")); return area; }
    const st = ISTATE[c.id] ||= { hero: heroes[0].key, sel: [], msg: "" };
    const draw = () => {
      area.textContent = "";
      const hero = heroes.find((x) => x.key === st.hero) || heroes[0];
      area.append(h("div", { class: "tabs", role: "tablist", "aria-label": "持裝英雄" }, heroes.map((x) =>
        h("button", { type: "button", role: "tab", "aria-selected": x.key === hero.key ? "true" : "false", onclick: () => { st.hero = x.key; st.sel = []; st.msg = ""; draw(); } }, `${champName(x.key)}・${x.role}`))));
      // 站主 2026-11-04：裝備的解釋（評價怎麼看、每欄只亮一件）刪掉
      if (hero.itemsOnly) {
        area.append(h("p", { class: "notice small" }, `${champName(hero.key)}（${hero.role}）三件套紀錄不夠，先列最常拿的裝備：`),
          h("div", { class: "ilist" }, hero.itemsOnly.map((x) => h("div", { class: "unit" }, icon("item", x.key, "sm"), h("span", null, h("b", null, itemName(x.key)), h("span", { class: "xs muted", style: "display:block" }, `持有率 ${pct(x.rate)}`))))));
        return;
      }
      if (hero.pooled) area.append(h("p", { class: "notice small" }, `這套陣容裡${champName(hero.key)}拿三件裝的場數不夠，改用所有陣容裡${champName(hero.key)}當坦的三件套（坦裝和陣容關係較小，可以參考）。`));
      const m = itemModel(hero, st.sel);
      const sel = h("div", { class: "selected-line" }, h("b", null, "已合裝："), st.sel.length ? st.sel.map((k) => h("button", { class: "chip", type: "button", "aria-pressed": "true", onclick: () => { st.sel = st.sel.filter((x) => x !== k); st.msg = ""; draw(); } }, icon("item", k, "xs"), itemName(k), " ×")) : h("span", { class: "small muted" }, "尚未選裝，顯示首選組合"),
        st.sel.length ? h("button", { class: "btn ghost", type: "button", onclick: () => { st.sel = []; st.msg = ""; draw(); } }, "清除選擇") : null);
      area.append(sel);
      if (st.msg) area.append(h("p", { class: "notice small", role: "status" }, st.msg));
      if (!m.best) { area.append(h("p", { class: "empty small" }, "目前條件沒有對得上的完整三件套紀錄，請取消一件已選裝。")); return; }
      const titles = ["最重要・優先合", "次重要・接著補", "補充・完成搭配"];
      const cols = h("div", { class: "icols" });
      area.append(cols);
      m.cols.forEach((col, i) => {
        const box = h("div", { class: "ilist" });
        const mk = (r) => {
          const isA = r.key === col.anchor, chosen = st.sel.includes(r.key);
          const b = h("button", { class: "irow " + (isA ? (chosen ? "on" : "lit") : "dim"), type: "button", "aria-pressed": chosen ? "true" : "false",
            onclick: () => { if (chosen) st.sel = st.sel.filter((x) => x !== r.key); else if (st.sel.length < 2) st.sel = [...st.sel, r.key]; else { st.msg = "最多選兩件；先點已選裝備取消。"; draw(); return; } st.msg = ""; draw(); } },
            icon("item", r.key, "sm"), h("span", { class: "irow-t" }, h("span", { class: "irow-nm" }, h("b", null, itemName(r.key)), isA && !chosen ? h("span", { class: "tag pick1" }, "首選") : chosen ? h("span", { class: "tag pick1" }, "已選") : null),
              h("span", { class: "irow-m" }, metrics(r))));
          return b;
        };
        col.rows.slice(0, 3).forEach((r) => box.append(mk(r)));
        const grp = h("div", { class: "igroup", "data-col": String(i) }, h("h4", null, titles[i]), h("p", { class: "xs muted ifixed" }, "搭配：", col.fixed.map(itemName).join("＋")), box);
        if (col.rows.length > 3) grp.append(h("details", null, h("summary", null, `再看 ${col.rows.length - 3} 件替代`), h("div", { class: "in ilist" }, col.rows.slice(3).map(mk))));
        if (col.rows.length === 1) grp.append(h("p", { class: "xs muted" }, "尚缺可比較的同欄替代；不等於沒有替代。"));
        cols.append(grp);
      });
      // 站主 2026-11-04：電腦上三欄並排（最重要／次重要／補充），推薦組合也並排
      area.append(h("h4", { class: "irecs-h" }, "完整搭配推薦"), h("div", { class: "irecs" }, m.recs.map((b, i) => h("div", { class: "irec" + (i ? "" : " first") },
        h("div", { class: "irec-h" }, h("b", null, `推薦 ${i + 1}`), b.promoted ? h("span", { class: "tag up" }, "評級高、場數夠，排前面") : null),
        h("div", { class: "irec-i" }, b.items.map((k) => h("span", { class: "irec-it" }, icon("item", k, "sm"), h("span", { class: "xs" }, itemName(k))))),
        h("div", { class: "xs muted" }, metrics(b))))));

      if (hero.detail) {
        const slot = h("div", null, h("p", { class: "small muted" }, "「選裝備看搭配」載入中…"));
        area.append(slot);
        loadItems(c.id).then((d) => {
          slot.textContent = "";
          const x = d?.heroes?.[hero.key];
          if (!x) { slot.append(h("p", { class: "small muted" }, "「選裝備看搭配」載入失敗，重新整理再試一次。")); return; }
          slot.append(finder(hero, x, d.label));
        });
      }
    };
    draw();
    return area;
  }

  // 預覽站：標出新手可能用不到的段落（D.reviewFlags，正式站沒有這份資料）
  function reviewWrap(key, ...kids) {
    const why = D.reviewFlags?.[key];
    if (!why) return kids;
    return [h("div", { class: "review" }, h("p", { class: "review-tag" }, h("b", null, "⚠ 新手可能用不到"), "（只有預覽看得到）", h("br"), why, h("br"), h("span", { class: "xs" }, "要刪或要留，跟我說一聲。")), ...kids)];
  }
  const ITEMS_P = {};
  const loadItems = (cid) => (ITEMS_P[cid] ||= fetch(`data/items/${cid}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  /* 選裝備看搭配：選一件、兩件或三件，列出跟其他裝備的組合、頻率和成績（像 MetaTFT 探索功能的裝備篩選） */
  const FSTATE = {};
  function finder(hero, data, label) {
    const st = FSTATE[hero.key + hero.role] ||= { sel: [], tab: "standard" };
    const box = h("div", { class: "stack finder", style: "margin-top:16px" });
    const KINDS = [["standard", "普通道具"], ["artifact", "神器"], ["radiant", "聖光（輝煌）"], ["emblem", "紋章（轉職）"], ["other", "其他"]];
    const has = (row, sel) => { const pool = row.slice(0, 3); for (const k of sel) { const i = pool.indexOf(k); if (i < 0) return false; pool.splice(i, 1); } return true; };
    const draw = () => {
      box.textContent = "";
      box.append(h("h4", null, `選裝備看搭配（${champName(hero.key)}）`),
        h("p", { class: "xs muted" }, `選一件、兩件或三件，看${champName(hero.key)}帶著它們時，跟哪些裝備搭配最好。`));
      box.append(h("div", { class: "selected-line" }, h("b", null, "已選："),
        st.sel.length ? st.sel.map((k, i) => h("button", { class: "chip", type: "button", title: "取消這件", onclick: () => { st.sel.splice(i, 1); draw(); } }, icon("item", k, "xs"), itemName(k), " ×")) : h("span", { class: "small muted" }, "還沒選，先列最常見的組合"),
        st.sel.length ? h("button", { class: "btn ghost", type: "button", onclick: () => { st.sel = []; draw(); } }, "清除") : null));
      const avail = {};
      const restOf = (r) => { const rest = r.slice(0, 3); for (const k of st.sel) rest.splice(rest.indexOf(k), 1); return rest; };
      for (const r of data.rows) if (has(r, st.sel)) for (const k of new Set(restOf(r))) avail[k] = (avail[k] || 0) + r[3];
      const kindOf = (k) => data.kinds?.[k] || "other";
      const tabs = KINDS.filter(([k]) => Object.keys(avail).some((x) => kindOf(x) === k));
      if (!tabs.some(([k]) => k === st.tab) && tabs.length) st.tab = tabs[0][0];
      if (st.sel.length < 3) {
        box.append(h("div", { class: "tabs", role: "tablist", "aria-label": "裝備種類" }, tabs.map(([k, l]) =>
          h("button", { type: "button", role: "tab", "aria-selected": st.tab === k ? "true" : "false", onclick: () => { st.tab = k; draw(); } }, l))));
        box.append(h("div", { class: "fpick" }, Object.entries(avail).filter(([k]) => kindOf(k) === st.tab).sort((a, b) => b[1] - a[1]).map(([k, n]) =>
          h("button", { class: "pick", type: "button", onclick: () => { st.sel.push(k); draw(); } }, icon("item", k, "sm"), h("span", null, itemName(k)), h("span", { class: "xs muted" }, pct(n / data.total))))));
      }
      const rows = data.rows.filter((r) => has(r, st.sel)).slice(0, st.sel.length ? 30 : 10);
      box.append(h("p", { class: "small" }, st.sel.length ? "含已選裝備的組合：" : "最常見的組合："));
      box.append(h("div", { class: "tablewrap" }, h("table", { class: "t finder-t" },
        h("tr", null, h("th", null, "組合"), h("th", null, "評價"), h("th", null, "名次變動"), h("th", null, "頻率")),
        rows.map((r) => { const rest = restOf(r);
          return h("tr", null, h("td", { class: "fcombo" }, [...st.sel, ...rest].map((k, i) => h("span", { class: i < st.sel.length ? "fsel" : null, title: itemName(k) }, icon("item", k, "xs")))),
            h("td", null, r[4] || h("span", { class: "muted", title: "不到 20 場，不給評價" }, "—")), h("td", null, chgText(r[5])), h("td", null, pct(r[3] / data.total)));
        }))));
      if (!rows.length) box.append(h("p", { class: "small muted" }, "沒有含這些裝備的組合（至少 5 場才列）。"));
    };
    draw();
    return box;
  }
  function section(title, content) {
    if (content == null || (Array.isArray(content) && !content.length)) return null;
    return reviewWrap("detail:" + title, h("h3", null, title), content);
  }
  const ul = (xs) => (xs?.length ? h("ul", { class: "list" }, xs.map((x) => h("li", null, x))) : null);

  /* 不順時轉哪套：放在攻略頁最上面，有圖（站主規格） */
  function switchBox(c) {
    const xs = (c.switchTo || []).filter((s) => D.comps.some((y) => y.id === s.id));
    const un = c.unsuitable?.length ? h("p", { class: "small" }, h("b", null, "這套不適合："), c.unsuitable.map((x, i) => [i ? "；" : "", tx(`comp:${c.id}:unsuitable.${i}`, x)])) : null;
    if (!xs.length) return un;
    return h("div", { class: "stack" }, un,
      h("div", { class: "swlist" }, xs.map((s) => {
        const t = D.comps.find((y) => y.id === s.id);
        const keys = [...new Set((t.core || [t.carrier]).filter(Boolean))].slice(0, 3);
        return h("a", { class: "swcard", href: "#" + slug(s.id), onclick: () => track("switch", c.id + ">" + s.id) },
          h("span", { class: "picons" }, keys.map((k, j) => icon("champion", k, j ? "xs" : "sm"))),
          h("span", { class: "pmeta" }, h("span", { class: "nm" }, t.name, " ", t.tier ? h("span", { class: "tag tier" }, t.tier + " 級") : null),
            s.when ? h("span", { class: "small" }, tx(`comp:${c.id}:switch.${s.id}`, s.when)) : null));
      })));
  }
  /* 近期有分的對戰紀錄：高手打進前四的單場，最多 20 場，有時間軸的優先；點過去 MetaTFT 看完整運營（data/cases.json；站主 11/6 開到正式站） */
  let CASES = null, CASES_P = null;
  const loadCases = () => (CASES_P ||= fetch("data/cases.json").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => (CASES = d)));
  /* 加分（站主 2026-11-04：「我說的明明就是這裡要有圖案」）：每一項一張卡，大圖示＋英雄頭像，數字分開排 */
  function bonusBox(c) {
    if (!c.bonus?.length) return null;
    return h("div", { class: "bonus-grid" }, c.bonus.map((b) => {
      // 站主 2026-11-04：括號裡的說明多餘；「多一個特性／多一個野性」重複又不直觀 → 直接寫「野性徽章」
      const title = b.type === "trait" ? itemName(b.key) : b.text.split("：")[0].replace(/（[^）]*）/g, "");
      const kind = b.type === "trait" ? null : b.type === "artifact" ? "神器" : b.type === "emblem" ? "轉職" : "裝備";
      return h("div", { class: "bcard" },
        h("div", { class: "bc-ico" }, icon("item", b.key), b.hero && CH[b.hero] ? h("span", { class: "bc-hero" }, icon("champion", b.hero, "sm")) : null),
        h("div", { class: "bc-txt" },
          kind ? h("span", { class: "bc-kind" }, kind) : null,
          h("b", { class: "bc-title" }, title),
          h("span", { class: "bc-meta" }, b.tier ? h("span", { class: "bc-tier t-" + b.tier }, b.tier) : null,
            h("span", { class: "brchg " + (b.chg < -0.05 ? "good" : b.chg > 0.05 ? "bad" : "") }, `名次 ${fmtChg(b.chg)}`),
            b.share != null ? h("span", null, `頻率 ${pct(b.share)}`) : null)));
    }));
  }
  /* 推薦增幅（站主 2026-11-04：「你明明就能看影片，另一個工作已經有數據了抓進去」）：
     MetaTFT 影片庫的實況錄影逐場辨識增幅，不是別人的評價。名次變動用全站同一套寫法（負的＝比較好）。 */
  const RAR = { "銀": "r-s", "金": "r-g", "稜鏡": "r-p" };
  function augBox(c) {
    const a = c.augPicks, M = D.augPicksMeta || {};
    if (!a || !(a.rows?.length || a.thin)) return null;
    const src = h("p", { class: "xs muted" }, `資料來源：MetaTFT 影片庫 ${M.patch || ""} 期間的高手實況錄影，逐場抓畫面辨識當場選的增幅，共 ${M.games || "—"} 場（其中高手 ${M.proGames || "—"} 場）。`,
      "名次變動＝選了這個增幅的場次，平均名次比這套的平均好多少（高手場次和其他場次各佔一半；場數少的往平均拉回）。多數增幅只有 2～4 場，當參考就好；18.6 改版後會重算。");
    const from = a.from ? h("p", { class: "small muted" }, `這個分支沒有單獨的資料，下面是主陣容〈${a.from}〉的。`) : null;
    if (!a.rows?.length) {
      const t = a.thin;
      return h("div", { class: "augbox stack" }, from,
        h("p", { class: "small" }, `影片庫裡這套只有 ${t.games} 場（高手 ${t.pro} 場），樣本太少，不列推薦表。`,
          t.best.length ? "目前看起來比較好的：" + t.best.map((b) => `${b.name}（名次 ${fmtChg(-b.score)}，${b.games} 場）`).join("、") + "。" : ""), src);
    }
    // 站主 2026-11-04：「你要做的是要在每個增幅裡面推薦拿甚麼」→ 2-1、3-2、4-2 每一次選增幅，依出現的稀有度各推薦拿什麼
    const TIERS = [["稜鏡", "r-p"], ["金", "r-g"], ["銀", "r-s"]];
    const chip = (x) => h("span", { class: "as-pick", title: `${x.name}：${x.games} 場（高手 ${x.pro} 場），平均第 ${x.avg.toFixed(1)} 名` },
      x.icon ? h("img", { src: "icons/" + x.icon, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null,
      h("span", { class: "as-nm" }, x.name), h("span", { class: "brchg good" }, `名次 ${fmtChg(-x.score)}`), h("span", { class: "xs muted" }, `${x.games} 場`));
    const grid = a.stages ? h("div", { class: "augstage" }, ["2-1", "3-2", "4-2"].map((st) => h("div", { class: "as-row" },
      h("div", { class: "as-st" }, h("b", null, st), h("span", { class: "xs" }, "選增幅")),
      h("div", { class: "as-cells" }, TIERS.map(([t, cls]) => h("div", { class: "as-cell " + cls + ((a.stages[st] || {})[t]?.length ? "" : " empty") },
        h("span", { class: "as-tier" }, `出${t}色時`),
        (a.stages[st] || {})[t]?.length ? h("div", { class: "as-picks" }, a.stages[st][t].map(chip)) : h("span", { class: "xs muted" }, "資料不夠，沒有推薦"))))))) : null;
    return h("div", { class: "augbox stack" }, from, grid,
      grid ? h("p", { class: "xs muted", style: "margin:0" }, "每格是那個階段、那種稀有度裡，選了之後平均名次比這套平均好的增幅（最多 3 個，好的排前面）。") : null,
      h("details", { class: "augfold" }, h("summary", null, "不分階段：評分最高的 6 個"), h("div", { class: "tablewrap" }, h("table", { class: "t aug-t" },
        h("tr", null, h("th", null, "增幅"), h("th", null, "名次變動"), h("th", null, "平均名次"), h("th", null, "場次（高手）"), h("th", null, "常見選點")),
        a.rows.map((r) => h("tr", null,
          h("td", null, h("span", { class: "aug " + (RAR[r.rarity] || ""), title: `${r.name}（${r.rarity}）` },
            r.icon ? h("img", { src: "icons/" + r.icon, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null, h("span", null, r.name))),
          h("td", null, h("span", { class: "brchg " + (r.score > 0.05 ? "good" : r.score < -0.05 ? "bad" : "") }, fmtChg(-r.score))),
          h("td", null, r.avg != null ? r.avg.toFixed(1) : "—"), h("td", null, `${r.games}（${r.pro}）`), h("td", null, r.stage || "—")))))), src);
  }
  // 站主 2026-11-04：「影片優先於時間軸」→ 實戰對局最上面先放高手影片，再放 MetaTFT 單場（有重播、有時間軸的在前）
  /* 實況影片（站主 2026-11-04：「把影片找出來然後在這邊附上能找到的每一場的連結」）：MetaTFT 影片庫逐場，data/vods.json */
  let VODS_P = null;
  const loadVods = () => (VODS_P ||= fetch("data/vods.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const RAR_V = { "銀": "r-s", "金": "r-g", "稜鏡": "r-p" };
  function vodBox(c, d) {
    const xs = d?.vods?.[c.vodKey || c.id] || [];
    if (!xs.length) return null;
    const row = (g) => h("a", { class: "vod", href: g.v, target: "_blank", rel: "noopener", onclick: () => track("vod", c.id) },
      h("span", { class: "plc p" + Math.min(g.p, 5) }, `第 ${g.p} 名`),
      h("span", { class: "vod-who" }, h("b", null, g.s), h("span", { class: "xs muted" }, `${g.t.slice(5, 10).replace("-", "/")}`)),
      h("span", { class: "vod-go" }, "▶ 看這場"),
      h("span", { class: "vod-augs" }, g.a.length ? g.a.map(([n, st, r, ic]) => h("span", { class: "vod-aug " + (RAR_V[r] || ""), title: `${st} 選的增幅：${n}` },
        h("span", { class: "st" }, st), ic ? h("img", { src: "icons/" + ic, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null, n)) : h("span", { class: "muted" }, "增幅沒有辨識到")));
    const first = xs.slice(0, 8), rest = xs.slice(8);
    return h("div", { class: "vodbox stack" },
      c.vodFrom ? h("p", { class: "small muted" }, `這個分支沒有單獨分出來，下面是主陣容〈${c.vodFrom}〉的對局。`) : null,
      h("p", { class: "small" }, `高手的實況錄影（MetaTFT 影片庫 ${d.patch || ""}），共 ${xs.length} 場（只放打進前四的）；最近的排前面。點一場會跳到 Twitch 那一場開始的地方。增幅前面的 2-1、3-2、4-2 是第幾階段選的（逐場抓畫面辨識）。`),
      h("div", { class: "vods" }, first.map(row)),
      rest.length ? h("details", { class: "vodmore" }, h("summary", null, `顯示其他 ${rest.length} 場`), h("div", { class: "vods" }, rest.map(row))) : null);
  }
  /* 冠軍選手的 YouTube 影片（站主 2026-11-04 22:01：「youtube影片也可以放」）：放在高手實況下面，最近的排前面 */
  function videoBox(c) {
    const vs = c.videos || [];
    if (!vs.length) return null;
    return h("div", { class: "vidbox" }, h("div", { class: "vids" }, vs.map((x) => h("a", { class: "vid" + (x.champion ? " champ" : ""), href: x.url, target: "_blank", rel: "noopener", onclick: () => track("video", c.id) },
      h("span", { class: "vid-play", "aria-hidden": "true" }, "▶"),
      h("span", { class: "vid-body" },
        h("span", { class: "vid-who" }, h("b", null, x.channel || x.player), x.achievement ? h("span", { class: "vid-badge" }, x.achievement) : null,
          h("span", { class: "xs muted" }, [x.uploaded ? x.uploaded.slice(5).replace("-", "/") : null, x.patch ? x.patch + " 版" : null].filter(Boolean).join("｜"))),
        h("span", { class: "vid-title" }, x.title || ""), x.note ? h("span", { class: "xs muted" }, x.note) : null)))),
      h("p", { class: "xs muted", style: "margin:6px 0 0" }, "版本比較舊的影片，數值可能已經改過，看思路就好。"));
  }
  // 站主 2026-11-04：先放別人的實況（每一場的連結），再放冠軍選手的 YouTube 影片
  function casesBox(c) {
    const box = h("div", { class: "stack" }, h("p", { class: "small muted" }, "載入中…"));
    Promise.all([c.vodCount ? loadVods() : null]).then(([vd]) => {
      box.textContent = "";
      const vb = vodBox(c, vd), yb = videoBox(c);
      if (vb) box.append(h("p", { class: "case-h" }, `高手實況 ${c.vodCount} 場（每一場的連結）`), vb);
      if (yb) box.append(h("p", { class: "case-h" }, `冠軍選手的 YouTube 影片 ${c.videos.length} 支`), yb);
      if (!vb && !yb) box.append(h("p", { class: "small muted" }, "這套目前還沒找到高手實況或冠軍選手的影片。"));
    });
    return box;
  }
  // 站主 2026-11-06：「另外加一區有顯示近期有分的對戰紀錄，並且有時間軸的優先」→ 高手打進前四的單場（MetaTFT），有時間軸的在前、其他新到舊
  function matchBox(c) {
    const box = h("div", { class: "stack" }, h("p", { class: "small muted" }, "載入中…"));
    loadCases().then((d) => {
      box.textContent = "";
      const xs = d?.cases?.[c.id] || [];
      if (!xs.length) { box.append(h("p", { class: "small muted" }, "目前沒有可以公開的對戰紀錄。")); return; }
      const nT = xs.filter((x) => x.timeline).length, nR = xs.filter((x) => x.replay).length;
      box.append(h("p", { class: "small" }, `${d.patch ? d.patch + " " : ""}高手用這套打進前四的對局 ${xs.length} 場（有時間軸 ${nT} 場${nR ? `、有重播 ${nR} 場` : ""}排在前面，其他照時間新到舊；同一位高手最多 2 場）。點一場到 MetaTFT，可以看每個階段的升級、搜牌和站位。`));
      box.append(h("div", { class: "cases" }, xs.map((x) => h("a", { class: "case", href: x.url, target: "_blank", rel: "noopener", onclick: () => track("case", c.id) },
        h("div", { class: "case-head" },
          h("span", { class: "plc p" + Math.min(x.placement, 5) }, `第 ${x.placement} 名`),
          h("b", null, x.player), x.score ? h("span", { class: "tag score", title: "那場玩家的積分" }, "分數 " + x.score) : null,
          h("span", { class: "xs muted" }, `${x.region}｜${x.level} 級｜${fmtTime(x.time)?.replace("（台灣時間）", "") || ""}`),
          x.timeline ? h("span", { class: "tag up" }, "有時間軸") : null, x.replay ? h("span", { class: "tag up" }, "有重播") : null, x.champ ? h("span", { class: "tag tier" }, x.champ) : null),
        h("div", { class: "case-units" }, x.units.map((u) => h("span", { class: "cu" }, h("span", { class: "stars" }, "★".repeat(u.star)), icon("champion", u.key, "sm"), h("span", { class: "its" }, (u.items || []).map((i) => icon("item", i, "xs"))))))))));
    });
    return box;
  }
  /* 手機：攻略頁的返回鈕跟著畫面，不用滑回最上面 */
  function floatBack(on) {
    $("#float-back")?.remove();
    if (!on) return;
    document.body.append(h("a", { id: "float-back", class: "float-back", href: "#comps", "aria-label": "回陣容列表" }, "← 返回"));
  }

  // 站主 2026-11-06：詳細頁加上均名、前四率、勝率（T 表和卡片維持下限／上限）。數字跟下限、上限同一份主資料（台服優先、美服補），場數照實列出
  function dStats(c) {
    const s = c.stats, m = c.statsMeta || {};
    if (!s || s.avg == null) return null;
    const tile = (k, label, val, hint) => h("div", { class: "dst", "data-k": k, title: hint }, h("span", { class: "dst-l" }, label), h("b", { class: "dst-v" }, val));
    return h("div", { class: "dstats" },
      h("div", { class: "dst-row" },
        tile("avg", ui("detail.avg", "均名"), s.avg.toFixed(2), "平均名次（1～8 名），越小越好"),
        tile("top4", ui("detail.top4", "前四率"), pct(s.top4), "打進前四名的比例"),
        tile("win", ui("detail.win", "勝率"), pct(s.win), "拿第一名的比例")),
      h("p", { class: "dst-n small muted" }, `${m.version ? m.version + " " : ""}高手實戰 ${m.games} 場${m.players ? `（${m.players} 位）` : ""}`,
        m.games < 10 ? "；場數少，參考就好" : "", "。均名越小越好。"));
  }
  const compById = (id) => D.comps.find((x) => x.id === id) || (O.on ? (O.custom.find((x) => x.id === id) && customToComp(O.custom.find((x) => x.id === id))) : null);
  function renderDetail(id) {
    const c = compById(id);
    const v = $("#detail"); v.textContent = "";
    if (!c) { v.append(h("p", null, "找不到這套陣容。"), h("a", { href: "#top" }, "回首頁")); return; }
    track("comp", c.id);
    floatBack(true);
    const r = c.range || {};
    const keys = [...new Set([c.carrier, ...(c.core || [])].filter(Boolean))].slice(0, 3);
    v.append(h("a", { class: "back btn ghost", href: "#comps" }, "← 回陣容列表"),
      h("header", { class: "dhero" },
        c.tier ? h("div", { class: "dtier t-" + c.tier, "aria-label": tierLabel(c) }, c.tier) : null,
        h("div", { class: "dhero-icons" }, keys.map((k, i) => icon("champion", k, i ? "sm" : ""))),
        h("div", { class: "dhero-txt" },
          h("h2", null, c.name),
          c.status === "ready" ? h("div", { class: "tc-sub dhero-sub" }, r.ceil ? [lvPill("下限", r.floor), lvPill("上限", r.ceil)] : null, c.freq != null ? h("span", { class: "tc-freq" }, `頻率 ${pct(c.freq)}`) : null,
            c.conditional || c.lane === "conditional" ? h("span", { class: "tag cond" }, "") : null, c.lane === "highroll" ? h("span", { class: "tag" }, "九等五費") : null,
            D.inference && c.patchImpact?.tierFrom ? h("span", { class: "was" }, `推測（原 ${c.patchImpact.tierFrom}）`) : null)
            : h("div", { class: "small muted" }, c.status === "custom" ? "站主新增，待補資料" : "研究中，尚無合資格數據"),
          c.status === "ready" ? dStats(c) : null)));
    if (c.status === "custom") {
      v.append(h("div", { class: "notice", style: "margin-top:16px" }, h("b", null, "站主手動加的陣容"),
        h("p", { class: "small", style: "margin:4px 0 0" }, "Claude 下次更新時會去查高手對局的數據，補上棋盤、裝備和攻略；補完才會放到正式站。")),
        h("div", { class: "row", style: "margin-top:12px" }, (c.units || []).map((k) => h("span", { class: "unit" }, icon("champion", k, "sm"), champName(k), k === c.carrier ? "（主C）" : ""))),
        c.ownerNote ? h("p", { class: "small" }, h("b", null, "站主說明："), c.ownerNote) : null);
      return;
    }
    if (c.status !== "ready") {
      v.append(h("div", { class: "notice", style: "margin-top:16px" }, h("b", null, "這套還在研究中"),
        h("p", { class: "small", style: "margin:4px 0 0" }, "高手玩的場數還不夠，先不提供棋盤、裝備與評級。")),
        c.required?.length ? h("p", { class: "small" }, "定義上的必要條件：", c.required.map((r) => r.text).join("、")) : null,
        h("p", { class: "small muted" }, `主要持裝輸出：${champName(c.carrier)}`));
      return;
    }
    // 改版推測：這套受哪些改動影響
    if (D.inference && c.patchImpact) v.append(h("div", { class: "pimpact small " + c.patchImpact.dir },
      h("b", null, `${D.inference.patch} 改動影響（推測）：`), impArrow(c), " ", c.patchImpact.notes.join("、"),
      c.patchImpact.tierFrom ? `；評級 ${c.patchImpact.tierFrom} → ${c.tier}` : ""));
    // 站主 2026-11-04：一句話選陣在「不順時轉哪套」上面；拿掉主C／副C／主坦那幾行（前排替換留著）
    const parts = [
      ["加分（拿到會更強）", "加分", bonusBox(c)],
      ["一句話選陣", "一句話選陣", c.oneLiner ? h("p", null, tx(`comp:${c.id}:oneLiner`, c.oneLiner)) : null],
      ["不順時轉哪套", "轉哪套", switchBox(c)],
      ["分支（拿到轉職或特定來牌時）", "分支", c.variants?.some((v) => v.status === "ready") ? h("div", { class: "small stack" },
        h("div", { class: "vlist" }, c.variants.filter((v) => v.status === "ready").map((v) => variantLine(v)))) : null],
      ["和主陣容比較", "和主陣容比較", c.baseOf?.length ? h("div", { class: "small stack" },
        h("p", null, "這個分支：", rangeLine(c)),
        ul(c.baseOf.map((b) => [h("a", { href: "#" + slug(b.id) }, b.name), "（主陣容）：", b.status === "ready" ? rangeLine(b) : "研究中"]))) : null],
      ...(O.on ? [[`${boardTitle(c, mainLevel(c) || 8)}（站主編輯：站位、星級、裝備）`, "棋盤", boardEditor(c)]]
        : [mainLevel(c) ? [boardTitle(c, mainLevel(c)), "棋盤", boardArea(c, mainLevel(c))] : null]),
      ["前排替換", "前排替換", c.roles?.swap ? h("p", { class: "small" }, tx(`comp:${c.id}:roles.swap`, c.roles.swap)) : null],
      ["星級要求", "星級", ul((c.stars || []).map((s) => `${champName(s.key)}：${s.need}${s.note ? "（" + s.note + "）" : ""}`))],
      ["裝備（一般、神器、光明／特殊同區）", "裝備", itemArea(c)],
      ["推薦增幅（高手實戰影片辨識）", "增幅", augBox(c)],
      ["各階段重點", "各階段", c.stages ? h("div", { class: "small stack" }, [["s2", "二階段"], ["s3", "三階段"], ["s4", "四階段"], ["late", "後期"]].map(([k, l]) => c.stages[k] ? h("p", null, h("b", null, l + "："), tx(`comp:${c.id}:stages.${k}`, c.stages[k])) : null)) : null],
      ["升等、抽牌、停手、追三與止損", "升等抽牌", c.tempo ? ul(Object.entries({ level: "升等", roll: "抽牌", stop: "停手", reroll3: "追三星", cutLoss: "止損轉陣" }).filter(([k]) => c.tempo[k]).map(([k, l]) => [`${l}：`, tx(`comp:${c.id}:tempo.${k}`, c.tempo[k])])) : null],
      ["同裝備、同來牌時的比較", "同裝比較", ul((c.compare || []).map((x) => [h("a", { href: "#" + slug(x.id) }, nameOf(x.id)), "：", x.when]))],
      ["普通局怎麼保名次", "保名次", ul(c.safeTop4)],
      ["大順風的吃雞上限與轉接成本", "吃雞上限", c.highroll ? h("p", { class: "small" }, c.highroll.ceiling, " ", c.highroll.cost) : null],
      ["常見失敗原因與避免方式", "失敗原因", ul((c.failures || []).map((f) => `${f.why} → ${f.avoid}`))],
      ["高手實戰對局（實況優先）", "實戰對局", c.vodCount || c.videos?.length ? casesBox(c) : null],
      ["近期有分的對戰紀錄（有時間軸的優先）", "對戰紀錄", c.caseCount ? matchBox(c) : null],
    ].filter((x) => x && x[2] != null && !(Array.isArray(x[2]) && !x[2].length));
    // 站主 2026-11-04：詳細頁加索引，點了跳到那一段
    // 電腦：左邊固定目錄、右邊內容；手機：目錄是一排可以點的標籤
    const toc = h("nav", { class: "toc", "aria-label": "這頁的段落" }, h("span", { class: "toc-h" }, "目錄"),
      parts.map(([t, short], i) => h("button", { type: "button", class: "tocb", "data-sec": "sec-" + i, onclick: () => { track("toc", short); document.getElementById("sec-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" }); } }, short)));
    const main = h("div", { class: "dmain" });
    parts.forEach(([title, , content], i) => {
      const out = section(title, content);
      if (!out) return;
      const h3 = out.find((x) => x?.tagName === "H3") || out.find((x) => x?.querySelector?.("h3"))?.querySelector("h3");
      if (h3) h3.id = "sec-" + i;
      main.append(...out);
    });
    const side = h("aside", { class: "dside" }, toc);
    v.append(h("div", { class: "dlayout" }, side, main));
    // 站主 2026-11-06：「螢幕窄的時候沒辦法跟著，會不會手機也沒辦法」→ 窄螢幕（含手機）目錄改成一排、貼在導覽列下面跟著畫面；
    // 目前段落的標籤自動捲到看得到的地方；點標籤跳過去時，標題不會被導覽列和目錄蓋住
    const narrow = () => !matchMedia("(min-width: 1100px)").matches;
    const tocH = () => { document.documentElement.style.setProperty("--toch", (narrow() ? side.offsetHeight : 0) + "px"); };
    tocH();
    const topOcc = () => (document.querySelector(".nav")?.offsetHeight || 56) + (narrow() ? side.offsetHeight : 0) + 8;
    spy([...main.querySelectorAll("h3[id]")], (id) => {
      let cur = null;
      toc.querySelectorAll(".tocb").forEach((b) => { const on = b.dataset.sec === id; b.setAttribute("aria-current", on ? "true" : "false"); if (on) cur = b; });
      if (cur && narrow() && toc.scrollWidth > toc.clientWidth + 2) toc.scrollTo({ left: Math.max(0, cur.offsetLeft - (toc.clientWidth - cur.offsetWidth) / 2), behavior: "smooth" });
    }, topOcc());
  }
  // 捲動時標出目前看到的段落（首頁導覽列、攻略頁目錄共用）
  let SPY = null;  // 取消目前的追蹤
  function spy(targets, onChange, top = 72) {
    // 目前段落＝最後一個捲過「導覽列（＋窄螢幕目錄）下緣」的標題；在兩個標題中間的長段落也標得出來（站主 2026-11-06）
    SPY?.();
    if (!targets.length) return;
    let last = null, raf = 0;
    const f = () => {
      raf = 0;
      let cur = null;
      for (const t of targets) {
        if (!t.offsetParent && t.getClientRects().length === 0) continue;  // 隱藏中的段落（例如在攻略頁時的首頁區塊）
        if (t.getBoundingClientRect().top - top <= innerHeight * 0.25) cur = t; else if (cur) break;
      }
      if (cur && cur.id !== last) { last = cur.id; onChange(cur.id); }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(f); };
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    SPY = () => { removeEventListener("scroll", on); removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
    f();
  }
  /* ---------- 小百科（站主 2026-11-05：「弄個小百科，裡面有所有的裝備跟增幅，放在索引最後面，
     裝備滑鼠移上去要能顯示是甚麼散件合的，也可以直接用散件搜索」） ---------- */
  const WK = { d: null, p: null, tab: "items", sel: [], q: "", aq: "", tier: "all", open: null };
  const loadWiki = () => (WK.p ||= fetch("data/wiki.json").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => (WK.d = d)));
  const wkName = (k) => { const c = (D.gamedata.components || []).find((x) => x.key === k); return c ? (c.zh || c.en) : itemName(k); };
  const AUG_TIERS = [["all", "全部"], ["1", "銀色"], ["2", "金色"], ["3", "稜鏡"], ["0", "特性與其他"]];
  const TIER_LB = { 1: "銀色", 2: "金色", 3: "稜鏡" };
  function recipeLine(it, size = "xs") {
    if (it.recipe?.length === 2) return h("span", { class: "wk-rec" }, icon("item", it.recipe[0], size), h("span", null, wkName(it.recipe[0])),
      h("span", { class: "plus", "aria-hidden": "true" }, "＋"), icon("item", it.recipe[1], size), h("span", null, wkName(it.recipe[1])));
    if (it.base) return h("span", { class: "wk-rec" }, icon("item", it.base, size), h("span", null, `${wkName(it.base)}升級成聖光版`));
    return h("span", { class: "wk-rec wk-norec" }, it.note || "不能合成");
  }
  function wkTip() { let t = $("#wk-tip"); if (!t) { t = h("div", { id: "wk-tip", role: "tooltip" }); t.hidden = true; document.body.append(t); } return t; }
  function showTip(el, it) {
    const t = wkTip(); t.textContent = "";
    t.append(h("b", null, wkName(it.key)), recipeLine(it, "sm"));
    t.hidden = false;
    const r = el.getBoundingClientRect(), w = t.offsetWidth, hh = t.offsetHeight;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    const y = r.top - hh - 8 < 8 ? r.bottom + 8 : r.top - hh - 8;
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  const hideTip = () => { const t = $("#wk-tip"); if (t) t.hidden = true; };
  function wkItems() {
    const d = WK.d, box = h("div", { class: "wk-items" });
    const comps = d.components || [];
    const sel = WK.sel;
    const find = h("div", { class: "wk-find" },
      h("p", { class: "wk-find-h" }, h("b", null, "用散件找"), h("span", { class: "small muted" }, sel.length ? "再點一件看合出什麼；同一件點兩次也可以" : "點一件散件，看它能合出哪些裝備")),
      h("div", { class: "wk-comps", role: "group", "aria-label": "散件" }, comps.map((k) => h("button", { type: "button", class: "wk-comp" + (sel.includes(k) ? " on" : ""), "aria-pressed": sel.includes(k) ? "true" : "false",
        onclick: () => { WK.sel = sel.length >= 2 ? [k] : [...sel, k]; WK.open = null; track("wiki_comp", k); drawWiki(); } },
        icon("item", k, "sm"), h("span", null, wkName(k)), sel.filter((x) => x === k).length === 2 ? h("span", { class: "wk-x2" }, "×2") : null))),
      sel.length ? h("p", { class: "wk-picked" }, h("span", { class: "small" }, "已選："), sel.map((k, i) => [i ? h("span", { class: "plus" }, "＋") : null, h("b", null, wkName(k))]),
        h("button", { type: "button", class: "btn ghost", onclick: () => { WK.sel = []; WK.open = null; drawWiki(); } }, "清除")) : null);
    const q = h("input", { type: "search", class: "wk-q", placeholder: "搜尋裝備名稱", "aria-label": "搜尋裝備名稱", value: WK.q });
    q.addEventListener("input", () => { WK.q = q.value.trim(); WK.open = null; drawGroups(); });
    const groupsBox = h("div", { class: "wk-groups" });
    const has = (it, k) => (it.recipe || []).includes(k);
    const exact = (it) => it.recipe?.length === 2 && [...it.recipe].sort().join() === [...sel].sort().join();
    function tile(it) {
      const other = sel.length === 1 && it.recipe ? it.recipe[1 - it.recipe.indexOf(sel[0])] : null;
      return h("button", { type: "button", class: "wk-it" + (other ? " has-other" : "") + (WK.open === it.key ? " on" : ""), "aria-expanded": WK.open === it.key ? "true" : "false", "data-key": it.key,
        onmouseenter: (e) => showTip(e.currentTarget, it), onmouseleave: hideTip, onfocus: (e) => showTip(e.currentTarget, it), onblur: hideTip,
        onclick: () => { WK.open = WK.open === it.key ? null : it.key; hideTip(); drawGroups(); } },
        icon("item", it.key, "sm"), h("span", { class: "nm" }, wkName(it.key)),
        other ? h("span", { class: "wk-other" }, "＋", icon("item", other, "xs"), h("span", null, wkName(other))) : null);
    }
    function detail(it, g) {
      const use = (d.use || {})[it.key] || [];
      return h("div", { class: "wk-detail", role: "region", "aria-label": wkName(it.key) },
        h("div", { class: "wk-dh" }, icon("item", it.key, "md"), h("div", null, h("b", null, wkName(it.key)), h("p", { class: "small" }, recipeLine({ ...it, note: it.note || g.note }, "sm")))),
        use.length ? h("p", { class: "small" }, h("span", { class: "muted" }, "這些陣容的首選組合有它："), use.map((u, i) => [i ? "、" : "", h("a", { href: "#" + slug(u.c) }, `${champName(u.h)}（${nameOf(u.c)}）`)])) : null);
    }
    function drawGroups() {
      groupsBox.textContent = "";
      const term = WK.q;
      if (sel.length === 2) {
        const hit = d.groups.flatMap((g) => g.items.filter(exact).map((it) => ({ it, g })));
        groupsBox.append(h("div", { class: "wk-answer", role: "status" }, sel.map((k, i) => [i ? h("span", { class: "plus" }, "＋") : null, icon("item", k, "sm"), h("span", null, wkName(k))]),
          h("span", { class: "eq" }, "＝"), hit.length ? hit.map(({ it }) => [icon("item", it.key, "md"), h("b", null, wkName(it.key))]) : h("span", null, "合不出裝備")));
        for (const { it, g } of hit) groupsBox.append(detail(it, g));
        return;
      }
      let shown = 0;
      for (const g of d.groups) {
        let items = g.items;
        if (sel.length === 1) items = items.filter((it) => has(it, sel[0]));
        if (term) items = items.filter((it) => wkName(it.key).includes(term) || (it.recipe || []).some((k) => wkName(k).includes(term)));
        if (!items.length) continue;
        shown += items.length;
        const grid = h("div", { class: "wk-grid" }, items.map(tile));
        const open = items.find((it) => it.key === WK.open);
        groupsBox.append(h("div", { class: "wk-group" }, h("h3", null, g.label, h("span", { class: "wk-n" }, String(items.length))), g.note && !sel.length ? h("p", { class: "small muted wk-gnote" }, g.note) : null,
          grid, open ? detail(open, g) : null));
      }
      if (sel.length === 1) groupsBox.prepend(h("p", { class: "wk-answer small", role: "status" }, h("b", null, wkName(sel[0])), `可以合出 ${shown} 件；每件後面是另一個要的散件。`));
      if (!shown) groupsBox.append(h("p", { class: "empty small" }, "找不到符合的裝備，換個關鍵字或清除散件。"));
    }
    drawGroups();
    box.append(find, q, groupsBox);
    return box;
  }
  // 增幅圖示：一張精靈圖（icons/aug-sprite.webp），sp = 第幾格；框內 40px（44px 減 2px 邊框）
  function augIcon(a, sp) {
    const cls = "wk-ai t" + (a.tier || 0);
    if (!sp || a.sp == null) return h("span", { class: cls, "aria-hidden": "true" });
    const D = 40, c = a.sp % sp.cols, r = Math.floor(a.sp / sp.cols);
    return h("span", { class: cls + " sp", "aria-hidden": "true",
      style: `background-image:url(${sp.src});background-size:${sp.cols * D}px ${sp.rows * D}px;background-position:-${c * D}px -${r * D}px` });
  }
  function wkAugs() {
    const d = WK.d, box = h("div", { class: "wk-augs-box" });
    const q = h("input", { type: "search", class: "wk-q", placeholder: "搜尋增幅名稱或效果（例如：金錢、徽章、攻速）", "aria-label": "搜尋增幅", value: WK.aq });
    const listBox = h("div");
    const chips = h("div", { class: "tabs wk-tiers", role: "group", "aria-label": "增幅分級" }, AUG_TIERS.map(([k, l]) => h("button", { type: "button", "aria-pressed": WK.tier === k ? "true" : "false", class: "wk-tier t" + k,
      onclick: () => { WK.tier = k; drawWiki(); } }, l)));
    function drawList() {
      listBox.textContent = "";
      const term = WK.aq;
      const xs = d.augments.filter((a) => (WK.tier === "all" || String(a.tier || 0) === WK.tier) && (!term || a.name.includes(term) || a.desc.includes(term)));
      listBox.append(h("p", { class: "small muted wk-count" }, `共 ${xs.length} 個`));
      listBox.append(h("ul", { class: "wk-augs" }, xs.map((a) => h("li", { class: "wk-aug" },
        augIcon(a, d.sprite),
        h("div", null,
          h("p", { class: "wk-an" }, h("b", null, a.name), h("span", { class: "tag wk-t t" + (a.tier || 0) }, TIER_LB[a.tier] || "特性／其他")),
          h("p", { class: "wk-ad small" }, a.desc),
          a.for?.length ? h("p", { class: "xs wk-for" }, h("span", { class: "muted" }, "高手實況推薦："), a.for.map((u, i) => [i ? "、" : "", h("a", { href: "#" + slug(u.c) }, nameOf(u.c)), `（${u.s}）`])) : null)))));
      if (!xs.length) listBox.append(h("p", { class: "empty small" }, "找不到符合的增幅。"));
    }
    q.addEventListener("input", () => { WK.aq = q.value.trim(); drawList(); });
    drawList();
    box.append(chips, q, listBox);
    return box;
  }
  function drawWiki() {
    const sec = $("#wiki-sec"); if (!sec) return;
    const body = sec.querySelector(".wk-body"); body.textContent = "";
    if (!WK.d) { body.append(h("p", { class: "small muted" }, WK.p ? "載入中…" : "小百科資料讀不到。")); return; }
    const tabs = [["items", `裝備 ${WK.d.groups.reduce((n, g) => n + g.items.length, 0)}`], ["augs", `增幅 ${WK.d.augments.length}`]];
    body.append(h("div", { class: "tabs wk-tabs", role: "tablist", "aria-label": "小百科分類" }, tabs.map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": WK.tab === k ? "true" : "false",
      onclick: () => { WK.tab = k; track("wiki_tab", k); drawWiki(); } }, l))),
      h("div", { role: "tabpanel" }, WK.tab === "items" ? wkItems() : wkAugs()),
      h("p", { class: "xs muted wk-src" }, `資料來源：${WK.d.source}。「首選組合」「高手實況推薦」是本站的陣容資料。`));
  }
  function renderWiki() {
    let sec = $("#wiki-sec");
    if (!sec) {
      sec = h("section", { class: "block", id: "wiki-sec" }, h("h2", null, "小百科"),
        h("p", { class: "rlead" }, "這版所有的裝備和增幅。裝備滑上去（手機點一下）就能看是哪兩件散件合的，也可以直接選散件，找它能合出什麼。"),
        h("div", { class: "wk-body" }));
      $("#home")?.append(sec);
      const ul = document.querySelector(".nav ul");
      if (ul && !$("#nav-wiki")) ul.append(h("li", { id: "nav-wiki" }, h("a", { href: "#wiki-sec" }, "小百科")));
    }
    drawWiki();
    loadWiki().then(drawWiki);
    addEventListener("scroll", hideTip, { passive: true });
  }

  function renderResearch() {
    // 站主 2026-11-04：「研究補充與資料限制」新手用不到，整區和導覽連結都拿掉
    $("#research")?.remove();
    document.querySelector('.nav a[href="#research"]')?.parentElement?.remove();
  }


  /* ---------- 路由 ---------- */
  function go(id) { location.hash = slug(id); }
  // 導覽列高度（T 表的分區標題、評級字母跟著畫面時，貼在導覽列下面）
  function navH() { const n = document.querySelector(".nav"); if (n) document.documentElement.style.setProperty("--navh", n.offsetHeight + "px"); }
  addEventListener("resize", navH);
  addEventListener("resize", () => { const s = document.querySelector("#detail:not([hidden]) .dside"); document.documentElement.style.setProperty("--toch", (s && !matchMedia("(min-width: 1100px)").matches ? s.offsetHeight : 0) + "px"); });
  function homeSpy() {
    // 導覽列有的段落都追（含定陣路線、小百科這些後來加的）
    const secs = [...document.querySelectorAll(".nav a[href^='#']")].map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
    spy(secs, (id) => document.querySelectorAll(".nav a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + id ? "true" : "false")));
  }
  function route() {
    const hsh = location.hash.slice(1);
    const c = D.comps.find((x) => slug(x.id) === hsh) || (O.on ? O.custom.map(customToComp).find((x) => slug(x.id) === hsh) : null);
    $("#home").hidden = !!c; $("#detail").hidden = !c;
    if (!c) { floatBack(false); homeSpy(); navH(); }
    if (c) { renderDetail(c.id); window.scrollTo(0, 0); }
  }

  /* ---------- 匿名閱讀統計（需同意） ---------- */
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const A = { on: false, ref: null, doc: null, dirty: false, busy: false, startedVisible: Date.now() };
  function dayKey(d = new Date()) { const t = new Date(d.getTime() + 8 * 3600e3); return t.toISOString().slice(0, 10); }
  function halfKey(d = new Date()) { const t = new Date(d.getTime() + 8 * 3600e3); return t.toISOString().slice(0, 10) + (t.getUTCHours() < 12 ? "a" : "b"); }
  function bump(path, n = 1) {
    if (!A.on || !A.doc) return;
    const day = A.doc.days[dayKey()] ||= {}; const half = A.doc.halves[halfKey()] ||= {};
    for (const o of [day, half]) { let cur = o; const ks = path.split("."); for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] ||= {}; cur[ks.at(-1)] = (cur[ks.at(-1)] || 0) + n; }
    A.dirty = true;
  }
  function track(kind, key) { bump(kind + "." + String(key).replace(/[.\/]/g, "_")); }
  async function flush() {
    if (!A.on || !A.dirty || !A.ref || A.busy) return;
    const keep = Object.keys(A.doc.days).sort().slice(-14); A.doc.days = Object.fromEntries(keep.map((k) => [k, A.doc.days[k]]));
    const keepH = Object.keys(A.doc.halves).sort().slice(-28); A.doc.halves = Object.fromEntries(keepH.map((k) => [k, A.doc.halves[k]]));
    A.doc.last = dayKey(); A.dirty = false; A.busy = true;
    try { await A.ref.set(A.doc); }
    catch (e) { if (e && (e.code === "invalid_argument" || e.code === "revoked" || e.code === "not_granted")) A.on = false; else A.dirty = true; }
    finally { A.busy = false; }
  }
  async function startAnalytics() {
    try {
      if (!window.claude?.use) return;
      const user = await window.claude.use("user");
      if (user?.isOwner?.()) return;              // 站主本人的瀏覽不列入
      const db = await window.claude.use("db");
      if (!db || !user) return;                    // 未登入：不記錄
      if ((await user.can?.("data.write")) === false) return;  // 只有檢視權限的讀者無法寫入，不打擾
      const choice = store.get("choko-consent");
      if (choice === "no") return;
      if (choice !== "yes") { showConsent(); return; }
      const id = await user.id();
      A.ref = db.doc("ev/" + id);
      let snap = null; try { snap = await A.ref.get(); } catch {}
      const data = snap && snap.exists ? snap.data() : null;
      A.doc = data && data.v === 1 ? structuredClone(data) : { v: 1, first: dayKey(), last: dayKey(), days: {}, halves: {} };
      A.on = true;
      bump("visit"); if (A.doc.first !== dayKey()) bump("returning");
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { track("section", e.target.id); io.unobserve(e.target); } }), { threshold: .4 });
      document.querySelectorAll("section.block").forEach((s) => io.observe(s));
      document.querySelectorAll("details").forEach((d) => d.addEventListener("toggle", () => d.open && track("expand", d.closest("section")?.id || "detail")));
      setInterval(flush, 60000);  // 只在有新互動（dirty）時寫入
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") { const s = Math.round((Date.now() - A.startedVisible) / 1000); if (s > 0) bump("sec", Math.min(s, 3600)); flush(); }
        else A.startedVisible = Date.now();
      });
      flush();
    } catch { /* 統計失敗不影響閱讀 */ }
  }
  function showConsent() {
    const box = h("div", { class: "consent", role: "dialog", "aria-label": "匿名閱讀統計" },
      h("b", null, "可以幫我們做匿名閱讀統計嗎？"),
      h("p", { class: "small", style: "margin:4px 0 0" }, "只記錄你看了哪些區塊與陣容、用了哪些篩選、停留多久和是否點外部頻道，用來改善網站。不記錄名字或 email，你隨時可以清除瀏覽器資料撤回。"),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => { store.set("choko-consent", "yes"); box.remove(); startAnalytics(); } }, "同意"),
        h("button", { class: "btn ghost", type: "button", onclick: () => { store.set("choko-consent", "no"); box.remove(); } }, "不要")));
    document.body.append(box);
  }

  /* ---------- 站主模式：只在預覽站、站主本人登入時開啟 ----------
     文字修改存在預覽站資料庫 edits/、用詞規則 terms/、棋盤 boards/；建置時套用到預覽與正式站，
     並整理成 docs/站主修改偏好.md，之後產生新文字時照著寫。讀者與正式站都看不到這些工具。 */
  const O = { on: false, db: null, edits: {}, terms: [], boards: {}, tiers: {}, custom: [], mode: false, tmode: false };
  function hash36(s) { let x = 2166136261; for (const ch of String(s)) { x ^= ch.codePointAt(0); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  const docId = (k) => String(k).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) + "-" + hash36(k);
  // 建置時已套用的用詞規則（D.termsApplied）不再重套，避免「改成的字」裡又含原字時重複替換
  const termed = (t) => O.terms.filter((r) => r.from && !(D.termsApplied || []).includes(r.from)).reduce((s, r) => s.split(r.from).join(r.to || ""), String(t));
  const baseText = (key, text) => (D.editBase && D.editBase[key] != null ? D.editBase[key] : text);
  function tx(key, text) {
    if (text == null || text === "") return text;
    const e = O.edits[key];
    const shown = e && typeof e.after === "string" ? e.after : (O.on ? termed(e === null ? baseText(key, text) : text) : text);
    if (!(O.on && O.mode)) return shown;
    const open = (ev) => { ev.preventDefault(); ev.stopPropagation(); openEditor(key, shown, e?.before ?? baseText(key, text)); };
    return h("span", { class: "editable" + (e ? " edited" : ""), tabindex: "0", role: "button", title: "點一下修改這段文字",
      onclick: open, onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") open(ev); } }, shown);
  }
  function rerender() {
    applyDataTx(); renderTop(); renderUpdates(); renderPatch(); renderVersion(); renderTiers(); renderRoute();
    const hsh = location.hash.slice(1), c = D.comps.find((x) => slug(x.id) === hsh) || (O.on ? O.custom.map(customToComp).find((x) => slug(x.id) === hsh) : null);
    if (c) { const y = scrollY; renderDetail(c.id); scrollTo(0, y); }
    ownerPanel();
  }
  async function startOwner() {
    try {
      if (!D.preview || !window.claude?.use) return;
      const user = await window.claude.use("user");
      if (!user?.isOwner?.()) return;
      const db = await window.claude.use("db");
      if (!db) return;
      O.db = db;
      const timer = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000));
      const opt = (c) => db.collection(c).get().catch(() => ({ docs: [] }));  // T 表與手動陣容是新集合，讀不到就當作空的
      const [es, ts, bs, tis, cus] = await Promise.race([Promise.all([db.collection("edits").get(), db.collection("terms").get(), db.collection("boards").get(), opt("tiers"), opt("customComps")]), timer]);
      for (const d of es.docs || []) { const x = d.data(); if (x?.key) O.edits[x.key] = x; }
      O.terms = (ts.docs || []).map((d) => d.data()).filter((x) => x?.from);
      for (const d of bs.docs || []) { const x = d.data(); if (x?.compId) O.boards[x.compId] = x; }
      for (const d of tis.docs || []) { const x = d.data(); if (x?.compId) O.tiers[x.compId] = x; }
      O.custom = (cus.docs || []).map((d) => d.data()).filter((x) => x?.id && x.name);
      O.on = true;
      rerender();
    } catch (e) {
      O.on = false;
      if (D.preview) ownerNotice("站主工具沒有載入（" + (e?.message || "資料庫無法連線") + "）。重新整理再試一次。");
    }
  }
  function ownerNotice(msg) {
    let n = $("#owner-note");
    if (!n) { n = h("div", { id: "owner-note", class: "owner-note", role: "status" }); document.body.append(n); }
    n.textContent = msg; clearTimeout(n._t); n._t = setTimeout(() => n.remove(), 4000);
  }
  function ownerPanel() {
    $("#owner-fab")?.remove();
    if (!O.on) return;
    document.body.classList.add("owner");
    const nEdits = Object.values(O.edits).filter(Boolean).length;
    const fab = h("div", { id: "owner-fab", class: "owner-fab" },
      h("button", { class: "btn" + (O.mode ? "" : " ghost"), type: "button", "aria-pressed": O.mode ? "true" : "false",
        onclick: () => { O.mode = !O.mode; rerender(); ownerNotice(O.mode ? "修改模式：點有虛線框的文字就能改。" : "已關閉修改模式。"); } },
        O.mode ? "✎ 修改中（點這裡結束）" : "✎ 修改文字"),
      h("button", { class: "btn" + (O.tmode ? "" : " ghost"), type: "button", "aria-pressed": O.tmode ? "true" : "false",
        onclick: () => { O.tmode = !O.tmode; rerender(); if (O.tmode) $("#tierlist")?.scrollIntoView({ behavior: "smooth" }); ownerNotice(O.tmode ? "調整 T 表：卡片下面可以改評級、分區、順序，也可以手動加陣容。" : "已結束調整 T 表。"); } },
        O.tmode ? "▦ 調整 T 表中（點這裡結束）" : "▦ 調整 T 表"),
      O.mode ? h("details", { class: "owner-terms" }, h("summary", null, `已改 ${nEdits} 段｜用詞規則 ${O.terms.length} 條`),
        h("div", { class: "in small stack" },
          h("p", { class: "xs muted" }, "用詞規則會套到全站同樣的說法，下次產生新文字時也照著寫。"),
          O.terms.length ? h("ul", { class: "list" }, O.terms.map((t) => h("li", null, `「${t.from}」→「${t.to}」`, t.note ? h("span", { class: "xs muted" }, `（${t.note}）`) : null, " ",
            h("button", { class: "linkbtn", type: "button", onclick: async () => { try { await O.db.doc("terms/" + docId(t.from)).delete(); O.terms = O.terms.filter((x) => x !== t); rerender(); } catch { ownerNotice("刪除失敗，請再試一次。"); } } }, "刪除")))) : h("p", { class: "xs" }, "還沒有用詞規則。")))
        : null);
    document.body.append(fab);
  }
  function guessDiff(a, b) {
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
    return { from: a.slice(i, a.length - j), to: b.slice(i, b.length - j) };
  }
  function openEditor(key, shown, before) {
    $("#editor")?.remove();
    const e = O.edits[key];
    const ta = h("textarea", { rows: "6", "aria-label": "修改後的文字" }); ta.value = shown;
    const why = h("input", { type: "text", placeholder: "例：這裡應該先講站位，不是裝備", "aria-label": "為什麼要改" });
    const tOn = h("input", { type: "checkbox", id: "term-on" });
    const tFrom = h("input", { type: "text", "aria-label": "原本的說法" }), tTo = h("input", { type: "text", "aria-label": "以後的說法" });
    const tBox = h("div", { class: "term-box", hidden: true }, "把「", tFrom, "」都改成「", tTo, "」");
    const msg = h("p", { class: "xs muted", role: "status" });
    tOn.addEventListener("change", () => { tBox.hidden = !tOn.checked; if (tOn.checked && !tFrom.value) { const d = guessDiff(shown, ta.value); tFrom.value = d.from; tTo.value = d.to; } });
    const close = () => sheet.remove();
    const save = async () => {
      const after = ta.value.trim();
      if (!after) { msg.textContent = "文字不能是空的；要拿掉這段請直接告訴我。"; return; }
      const doc = { key, after, before, note: why.value.trim(), at: new Date().toISOString(), where: location.hash || "#home" };
      msg.textContent = "儲存中…";
      try {
        await O.db.doc("edits/" + docId(key)).set(doc);
        O.edits[key] = doc;
        if (tOn.checked && tFrom.value) {
          const t = { from: tFrom.value, to: tTo.value, note: why.value.trim(), at: doc.at, sample: key };
          await O.db.doc("terms/" + docId(t.from)).set(t);
          O.terms = O.terms.filter((x) => x.from !== t.from).concat(t);
        }
        close(); rerender(); ownerNotice("已儲存。下次更新時會套到正式站。");
      } catch (err) { msg.textContent = "儲存失敗：" + (err?.message || "請再試一次") + "。內容還在，可以再按一次儲存。"; }
    };
    const restore = async () => {
      msg.textContent = "恢復中…";
      try { await O.db.doc("edits/" + docId(key)).delete(); O.edits[key] = null; close(); rerender(); ownerNotice("已恢復原文。"); }
      catch (err) { msg.textContent = "恢復失敗：" + (err?.message || "請再試一次"); }
    };
    const sheet = h("div", { id: "editor", class: "sheet-bg", onclick: (ev) => { if (ev.target === sheet) close(); } },
      h("div", { class: "sheet", role: "dialog", "aria-label": "修改文字" },
        h("b", null, "修改文字"),
        e ? h("p", { class: "xs muted" }, "原文：", before) : null,
        ta,
        h("label", { class: "small" }, "為什麼要改（選填，幫我學你的寫法）", why),
        h("label", { class: "small row-check" }, tOn, "以後全站同樣的說法都這樣改"), tBox,
        h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: save }, "儲存"),
          e ? h("button", { class: "btn ghost", type: "button", onclick: restore }, "恢復原文") : null,
          h("button", { class: "btn ghost", type: "button", onclick: close }, "取消")),
        msg));
    document.body.append(sheet);
    ta.focus();
  }

  /* ---------- 站主：調整 T 表、手動加陣容（預覽站）----------
     存在預覽站資料庫 tiers/（評級、分區、順序、隱藏）與 customComps/（手動加的陣容）；下次更新時套到正式站，
     手動加的陣容等 Claude 查完數據、補完攻略才上正式站。 */
  async function saveTier(cid, patch) {
    const cur = O.tiers[cid] || {};
    const doc = { ...cur, ...patch, compId: cid, at: new Date().toISOString() };
    await O.db.doc("tiers/" + docId(cid)).set(doc);
    O.tiers[cid] = doc;
  }
  function ownerTierCtl(c, pool) {
    const sel = (label, opts, val, on) => {
      const s = h("select", { "aria-label": label, onclick: (e) => e.stopPropagation() }, opts.map(([v, l]) => h("option", { value: v, selected: v === val ? true : null }, l)));
      s.addEventListener("change", () => on(s.value));
      return s;
    };
    const run = async (fn, msg) => { try { await fn(); renderTiers(); ownerNotice(msg); } catch (e) { ownerNotice("儲存失敗：" + (e?.message || "請再試一次")); } };
    const move = (d) => run(async () => {
      const cell = pool.filter((x) => x.lane === c.lane && x.tier === c.tier && (!x.hidden || x.id === c.id)).sort(cellSort);
      const i = cell.findIndex((x) => x.id === c.id), j = i + d;
      if (j < 0 || j >= cell.length) return;
      [cell[i], cell[j]] = [cell[j], cell[i]];
      await Promise.all(cell.map((x, k) => (x.custom ? saveCustom({ ...O.custom.find((y) => y.id === x.id), order: k }) : saveTier(x.id, { order: k }))));
    }, "已調整順序。");
    const setT = (v) => run(() => (c.custom ? saveCustom({ ...O.custom.find((y) => y.id === c.id), tier: v === "hide" ? null : v }) : saveTier(c.id, { tier: v, order: 999 })), v === "hide" ? "已從 T 表隱藏（下面「已隱藏」可以拿回來）。" : `已改成 ${v} 級。`);
    const setL = (v) => run(() => (c.custom ? saveCustom({ ...O.custom.find((y) => y.id === c.id), lane: v }) : saveTier(c.id, { lane: v, order: 999 })), "已換分區。");
    return h("div", { class: "tc-own" },
      sel("評級", [["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"], ["hide", "隱藏"]], c.hidden ? "hide" : c.tier, setT),
      sel("分區", LANES.map((l) => [l.id, l.label]), c.lane, setL),
      h("button", { class: "linkbtn", type: "button", "aria-label": "往前", onclick: () => move(-1) }, "◀"),
      h("button", { class: "linkbtn", type: "button", "aria-label": "往後", onclick: () => move(1) }, "▶"),
      O.tiers[c.id] && !c.custom ? h("button", { class: "linkbtn", type: "button", onclick: () => run(async () => { await O.db.doc("tiers/" + docId(c.id)).delete(); delete O.tiers[c.id]; }, "已恢復資料算出的評級。") }, "恢復") : null,
      c.custom ? h("button", { class: "linkbtn", type: "button", onclick: () => openCustom(O.custom.find((y) => y.id === c.id)) }, "編輯") : null);
  }
  function ownerTierBar() {
    const hidden = tierPool().filter((c) => c.hidden);
    return h("div", { class: "card small tb-ownbar" },
      h("p", { class: "xs muted", style: "margin:0 0 6px" }, "調整 T 表：每張卡下面可以改評級、換分區、用 ◀ ▶ 排順序。分支在這個模式會拆開成自己的卡片，方便調整。改完自動儲存，下次更新時套到正式站。"),
      h("button", { class: "btn", type: "button", onclick: () => openCustom(null) }, "＋ 手動加一套陣容"),
      O.custom.length ? h("p", { class: "xs", style: "margin:6px 0 0" }, `你加的陣容 ${O.custom.length} 套：Claude 會去查數據、補棋盤和攻略，補完才放正式站。`) : null,
      hidden.length ? h("p", { class: "xs", style: "margin:6px 0 0" }, "已隱藏：", hidden.map((c, i) => [i ? "、" : "", h("button", { class: "linkbtn", type: "button", onclick: async () => { try { await saveTier(c.id, { tier: c.tier || "B" }); renderTiers(); } catch {} } }, c.name + "（拿回來）")])) : null);
  }
  async function saveCustom(x) {
    const doc = { ...x, at: new Date().toISOString() };
    await O.db.doc("customComps/" + x.id).set(doc);
    O.custom = O.custom.filter((y) => y.id !== x.id).concat(doc);
  }
  const champGroups = (used = new Set()) => [1, 2, 3, 4, 5].map((cost) => ({ label: `${cost} 費`, items: D.gamedata.champions.filter((x) => x.cost === cost).map((x) => ({ key: x.key, name: champName(x.key) + (used.has(x.key) ? "（已選）" : ""), ico: icon("champion", x.key, "sm") })) })).filter((g) => g.items.length);
  function openCustom(cur) {
    $("#editor")?.remove();
    const st = cur ? { ...cur, units: [...(cur.units || [])] } : { id: "custom_" + Date.now().toString(36), name: "", lane: "normal", tier: "B", carrier: null, units: [], note: "", order: 999 };
    const name = h("input", { type: "text", "aria-label": "陣容名稱", placeholder: "例：重裝易大師" }); name.value = st.name;
    const note = h("textarea", { rows: "3", "aria-label": "給 Claude 的說明", placeholder: "例：3-2 前易大師 2 星就轉，主坦給蔚" }); note.value = st.note;
    const msg = h("p", { class: "xs muted", role: "status" });
    const chips = h("div", { class: "row" });
    const drawUnits = () => {
      chips.textContent = "";
      for (const k of st.units) chips.append(h("button", { class: "chip" + (k === st.carrier ? " carrier" : ""), type: "button", "aria-pressed": k === st.carrier ? "true" : "false", title: "點一下設成主C；再點一下移除",
        onclick: () => { if (st.carrier === k) { st.units = st.units.filter((x) => x !== k); st.carrier = st.units[0] || null; } else st.carrier = k; drawUnits(); } }, icon("champion", k, "xs"), champName(k), k === st.carrier ? "（主C）" : ""));
      chips.append(h("button", { class: "chip add", type: "button", onclick: () => openPicker("加棋子", champGroups(new Set(st.units)), (k) => { if (!st.units.includes(k) && st.units.length < 10) st.units.push(k); st.carrier ||= k; drawUnits(); }) }, "＋ 棋子"));
    };
    drawUnits();
    const selOf = (label, opts, val, on) => { const s = h("select", { "aria-label": label }, opts.map(([v, l]) => h("option", { value: v, selected: v === val ? true : null }, l))); s.addEventListener("change", () => on(s.value)); return s; };
    const close = () => sheet.remove();
    const save = async () => {
      st.name = name.value.trim(); st.note = note.value.trim();
      if (!st.name) { msg.textContent = "請填陣容名稱。"; return; }
      if (!st.carrier) { msg.textContent = "請至少加一隻棋子（第一隻是主C，可以點棋子改）。"; return; }
      msg.textContent = "儲存中…";
      try { await saveCustom(st); close(); renderTiers(); ownerNotice("已加入。Claude 下次更新時會查數據、補攻略。"); }
      catch (e) { msg.textContent = "儲存失敗：" + (e?.message || "請再試一次"); }
    };
    const del = async () => {
      try { await O.db.doc("customComps/" + st.id).delete(); O.custom = O.custom.filter((y) => y.id !== st.id); close(); renderTiers(); ownerNotice("已刪除。"); }
      catch (e) { msg.textContent = "刪除失敗：" + (e?.message || "請再試一次"); }
    };
    const sheet = h("div", { id: "editor", class: "sheet-bg", onclick: (ev) => { if (ev.target === sheet) close(); } },
      h("div", { class: "sheet", role: "dialog", "aria-label": cur ? "編輯手動加的陣容" : "手動加一套陣容" },
        h("b", null, cur ? "編輯手動加的陣容" : "手動加一套陣容"),
        h("label", { class: "small" }, "名稱", name),
        h("div", { class: "row" }, h("label", { class: "small" }, "分區", selOf("分區", LANES.map((l) => [l.id, l.label]), st.lane, (v) => (st.lane = v))),
          h("label", { class: "small" }, "評級", selOf("評級", [["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"]], st.tier, (v) => (st.tier = v)))),
        h("div", { class: "small" }, h("b", null, "棋子"), h("span", { class: "xs muted" }, "（第一隻是主C，點棋子可以改主C）"), chips),
        h("label", { class: "small" }, "給 Claude 的說明（選填）", note),
        h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: save }, "儲存"),
          cur ? h("button", { class: "btn ghost", type: "button", onclick: del }, "刪除這套") : null,
          h("button", { class: "btn ghost", type: "button", onclick: close }, "取消")),
        msg));
    document.body.append(sheet);
    name.focus();
  }
  function openPicker(title, groups, onPick) {
    $("#picker-sheet")?.remove();
    const q = h("input", { type: "search", placeholder: "搜尋名稱", "aria-label": "搜尋" });
    const tabs = h("div", { class: "tabs", role: "tablist" }), body = h("div", { class: "pgrid" });
    let g = 0;
    const show = () => {
      tabs.textContent = ""; body.textContent = "";
      groups.forEach((x, i) => tabs.append(h("button", { type: "button", role: "tab", "aria-selected": i === g && !q.value ? "true" : "false", onclick: () => { g = i; q.value = ""; show(); } }, x.label)));
      const term = q.value.trim();
      const list = term ? groups.flatMap((x) => x.items).filter((x) => x.name.includes(term) || x.key.toLowerCase().includes(term.toLowerCase())) : groups[g].items;
      for (const x of list) body.append(h("button", { class: "pick", type: "button", onclick: () => { sheet.remove(); onPick(x.key); } }, x.ico, h("span", null, x.name)));
      if (!list.length) body.append(h("p", { class: "small muted" }, "找不到。"));
    };
    q.addEventListener("input", show);
    const sheet = h("div", { id: "picker-sheet", class: "sheet-bg", onclick: (ev) => { if (ev.target === sheet) sheet.remove(); } },
      h("div", { class: "sheet tall", role: "dialog", "aria-label": title }, h("div", { class: "row between" }, h("b", null, title), h("button", { class: "btn ghost", type: "button", onclick: () => sheet.remove() }, "關閉")), q, tabs, body));
    document.body.append(sheet); show();
  }

  /* ---------- 棋盤編輯器（站主）：四排七格；點棋子選取、點空格移動、拖曳可交換；星級、裝備、加減棋子 ---------- */
  const BSTATE = {};
  const TANKY = /Gargoyle|Warmog|Steadfast|Bramble|DragonsClaw|SpiritVisage|Sunfire|Crownguard|AdaptiveHelm|ProtectorsVow|Evenshroud|TitansResolve/;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function autoPlace(units, c, ref) {
    const taken = new Set(units.filter((u) => u.pos).map((u) => u.pos.join(",")));
    const tank = new Set(c.roles?.tank || []), car = new Set([...(c.roles?.mainC || []), ...(c.roles?.subC || [])]);
    for (const u of units) {
      if (u.pos) continue;
      const r = ref?.find((x) => x.key === u.key && x.pos && !taken.has(x.pos.join(",")));
      if (r) { u.pos = [...r.pos]; taken.add(u.pos.join(",")); continue; }
      const front = tank.has(u.key) || (u.items || []).some((i) => TANKY.test(i));
      const rows = front ? [0, 1, 2, 3] : car.has(u.key) || (u.items || []).length ? [3, 2, 1, 0] : [1, 0, 2, 3];
      const cols = rows[0] === 3 ? [0, 6, 1, 5, 2, 4, 3] : [3, 2, 4, 1, 5, 0, 6];
      outer: for (const rr of rows) for (const cc of cols) if (!taken.has(rr + "," + cc)) { u.pos = [rr, cc]; taken.add(rr + "," + cc); break outer; }
    }
    return units;
  }
  function freshState(c, useSaved) {
    const sv = useSaved ? O.boards[c.id] : null;
    const pick = (lv) => (sv?.["lv" + lv]?.units ? clone(sv["lv" + lv].units).map((u) => (u.plant ? { ...u, key: "plant:" + u.plant, items: [] } : u)) : (c.boards?.["lv" + lv]?.units ? clone(c.boards["lv" + lv].units).map((u) => ({ ...u, items: u.items || [], pos: Array.isArray(u.pos) ? u.pos : null })) : []));
    const d8 = withPlants(autoPlace(pick(8), c, null));
    const data = { 8: d8, 9: withPlants(autoPlace(pick(9), c, d8)) };
    if (c.rerollLevel) data[c.rerollLevel] = withPlants(autoPlace(pick(c.rerollLevel), c, d8));
    const two = (lv) => !!((sv?.["lv" + lv]) || c.boards?.["lv" + lv] || {}).twoMarks;
    const main = levelsOf(c).includes(mainLevel(c)) ? mainLevel(c) : levelsOf(c).find((lv) => (data[lv] || []).length) || 8;
    // 旁邊「可以替換」：站主存過就用站主的，沒有就用資料算的（站主一改就整份變成站主的）
    const flex = clone(sv?.flex || c.flex || {});
    for (const xs of Object.values(flex)) for (const x of xs || []) x.items ||= {};
    return { lv: main, main, sel: null, dirty: false, two: Object.fromEntries(levelsOf(c).map((lv) => [lv, two(lv)])), msg: sv ? "目前是你存過的棋盤。" : "預先放好最常見的完整棋盤與推薦裝備，直接調整後按儲存。", data,
      flex, flexOwned: !!sv?.flex, side: null, flexForm: null };
  }
  const RIFT = "Riftbeast";
  const MARK_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAABLElEQVR42t2VsY1CMRBEXcKJGlzBVXDhlyjhEhpwejEtOLsyiFzDhcQrgpNI6OIh8S1GK2M2RbzM35rZXe8I0tvBkQPb6e2WA//PDb4A+OVjvOEPgF3UwwmAU3JQWDmnCH5YaV7eqbHBJ3RK/7Igvh+LANoqIHOn3zb3pUMFHQxUFXzDICQGzLlJBMJ1ZOTbQIbsNeWEcu+vDqWWJJhx7Duot14MP46gMSOTu9zTvEFlgnYjNJLeoDBD1T2FRQbPMCXR43Mgqk7DKo2KMJd113LB/LoAo/i3oiQxNsaOC7Ls887XuH/0vsO5IvbeYIMhstKhjZMRxkZqxVlkVaRJPsRYDMuqSscgL04Y51H9hb9KlJlBUF2QsamBkVOMguQMbFo7Ngnqhib1tf9NryAMi4k94yy8AAAAAElFTkSuQmCC";  // 遊戲檔案 trait_icon_18_riftbeast（32×32），內嵌避免多一個檔案
  // 首領標記：Riot 官方繁中（峽谷巨獸特性說明「使用首領標記賦予峽谷巨獸專屬增益」）；圖示用遊戲檔案裡的峽谷巨獸特性圖示
  const markBadge = () => h("span", { class: "mark-badge", title: "首領標記" }, h("img", { src: MARK_ICON, alt: "", width: 14, height: 14 }));
  const isRift = (k) => (CH[k]?.traits || []).includes(RIFT);
  const riftOn = (units) => units.filter((u) => isRift(u.key)).length >= ((TR[RIFT]?.breakpoints || [3])[0]);
  function traitsOf(units) {
    const t = {};
    units = champsOnly(units);
    for (const u of units) for (const k of CH[u.key]?.traits || []) t[k] = (t[k] || 0) + 1;
    for (const u of units) for (const it of u.items || []) { const tk = EM[it]?.trait || (it.endsWith("Emblem") ? it.slice(0, -6) : null); if (tk) t[tk] = (t[tk] || 0) + 1; }
    return Object.entries(t).map(([k, n]) => { const bp = TR[k]?.breakpoints || []; const hit = bp.filter((x) => x <= n); const next = bp.find((x) => x > n);
      return { k, n, on: hit.length > 0, label: `${traitName(k)} ${n}${next ? "/" + next : ""}` }; })
      .sort((a, b) => b.on - a.on || b.n - a.n);
  }
  function boardEditor(c) {
    const root = h("div", { class: "be" });
    const st = BSTATE[c.id] ||= freshState(c, true);
    const draw = () => {
      root.textContent = "";
      st.data[st.lv] = withPlants(st.data[st.lv]);  // 神木人數變了，植物跟著增減
      const units = st.data[st.lv];
      const pop = champsOnly(units).reduce((n, u) => n + (CH[u.key]?.slots || 1), 0);
      // 站主 2026-11-04：只放一張主圖的站位圖，其他人口放旁邊一區（升等要補、可以替換），要改其他人口從旁邊那區點進來
      const lvLabel = (lv) => (lv === c.rerollLevel ? `${lv} 等（賭${"一二三"[(c.rerollCost || 1) - 1]}費）` : `${lv} 人口`);
      const M = st.main;
      const main = h("div", { class: "be-main" });
      const live = Object.fromEntries(levelsOf(c).filter((lv) => champsOnly(st.data[lv]).length).map((lv) => ["lv" + lv, { status: "ok", units: st.data[lv] }]));
      const ed = { flex: st.flex, flexLevels: levelsOf(c).filter((lv) => lv >= M), stepLevels: levelsOf(c).filter((lv) => lv > M),
        sel: st.side, select: (k) => { st.side = k; st.flexForm = null; draw(); }, selPanel: sideSelPanel, addStep: pickStep,
        delFlex: (lv, i) => { ownFlex(); st.flex["lv" + lv].splice(i, 1); st.side = null; changed("已刪除這組替換。"); },
        flexForm: st.flexForm, openFlexForm: (lv) => { st.flexForm = { lv, out: [], in: [] }; st.side = null; draw(); }, flexFormBox };
      const side = sidePanel(c, M, live, ed);
      const others = levelsOf(c).filter((lv) => lv !== M);
      if (others.length) side.append(h("div", { class: "fx-edit" }, h("p", { class: "fx-h" }, "調整其他人口的棋盤"),
        h("p", { class: "xs muted", style: "margin:0" }, "旁邊的「升等要補」是用這幾張算的，改完會跟著變。"),
        h("div", { class: "row" }, others.map((lv) => h("button", { type: "button", class: "chip", "aria-pressed": st.lv === lv ? "true" : "false", onclick: () => { st.lv = lv; st.sel = null; draw(); } }, lvLabel(lv))))));
      root.append(h("div", { class: "bwrap has-side be-wrap" }, main, side));
      const put = (...xs) => main.append(...xs.filter(Boolean));
      put(st.lv === M ? h("p", { class: "be-lv" }, h("b", null, "主圖："), lvLabel(M))
        : h("div", { class: "be-lv other" }, h("b", null, `正在調整 ${lvLabel(st.lv)} 的棋盤`), h("button", { type: "button", class: "btn ghost", onclick: () => { st.lv = M; st.sel = null; draw(); } }, `← 回主圖（${lvLabel(M)}）`)));
      put(h("p", { class: "small" }, `人口 ${pop}／${st.lv}`, pop > st.lv ? h("b", { class: "warn" }, "（超出人口）") : null),
        h("div", { class: "tchips" }, traitsOf(units).map((t) => h("span", { class: "tchip" + (t.on ? " on" : "") }, t.label))));
      const rOn = riftOn(units);
      if (rOn) put(markBox(units));
      if (spryOn(units)) put(riderBox(units));
      const ps = plantSummary(units);
      if (ps) put(h("p", { class: "small notice-lite" }, h("b", null, "神木植物："), ps, "（神木精靈啟動時自動放上，可以拖曳換位置）"));
      const grid = h("div", { class: "board edit", role: "grid", "aria-label": `${st.lv} 人口站位編輯，四排七格；上方為前排` });
      const at = (r, col) => units.find((u) => u.pos && u.pos[0] === r && u.pos[1] === col);
      for (let r = 0; r < 4; r++) {
        const row = h("div", { class: "brow" + (r % 2 ? " odd" : ""), role: "row" });
        for (let col = 0; col < 7; col++) {
          const u = at(r, col);
          const cell = h("div", { class: "hex" + (u ? " has" : "") + (isPlant(u) ? " is-plant" : "") + (u && st.sel === u ? " sel" : ""), role: "gridcell", tabindex: "0", "data-r": r, "data-c": col,
            "aria-label": `${"ABCD"[r]}${col + 1}${u ? "：" + (isPlant(u) ? PLANT[u.plant] : champName(u.key)) + " " + u.star + " 星" + (rOn && u.mark ? "（首領標記）" : "") + (u.rider ? "（騎乘者）" : "") : "：空格"}` },
            u ? hexInner({ ...u, rider: u.rider && spryOn(units) && isSpry(u.key) }, rOn && isRift(u.key)) : h("span", { class: "hexlbl" }, `${"ABCD"[r]}${col + 1}`));
          cell.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); tapCell(r, col); } });
          if (u) dragable(cell, u); else cell.addEventListener("click", () => tapCell(r, col));
          row.append(cell);
        }
        grid.append(row);
      }
      put(h("div", { class: "tablewrap" }, grid), h("p", { class: "xs muted" }, "上方為前排。點棋子選取；選取後點空格＝移動。按住棋子拖到別格＝移動或交換。點空格可直接放新棋子。"));
      put(st.sel ? selPanel(st.sel) : h("div", { class: "card small" }, "還沒選棋子。點棋盤上的棋子可以改星級和裝備。"));
      put(h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => pickChamp(null) }, "＋ 加棋子"),
        h("button", { class: "btn", type: "button", onclick: saveBoard }, st.dirty ? "儲存棋盤" : "已是最新"),
        h("button", { class: "btn ghost", type: "button", onclick: () => { Object.assign(st, freshState(c, true)); st.msg = "已取消未儲存的變更。"; draw(); } }, "取消變更"),
        O.boards[c.id] ? h("button", { class: "btn ghost", type: "button", onclick: resetBoard }, "恢復資料預設") : null),
        h("p", { class: "xs muted", role: "status" }, st.msg));
    };
    const changed = (m) => { st.dirty = true; st.msg = m || "有未儲存的變更。"; draw(); };
    const ownFlex = () => { st.flexOwned = true; };
    // 推薦裝備預設：資料棋盤裡這隻帶的裝備，沒有就用裝備模型的第一套
    const recItems = (key) => {
      for (const b of Object.values(c.boards || {})) { const u = champsOnly(b?.units).find((x) => x.key === key && (x.items || []).length); if (u) return [...u.items].slice(0, 3); }
      const m = (c.itemModel || []).find((x) => x.key === key);
      return m?.builds?.[0]?.items ? [...m.builds[0].items].slice(0, 3) : [];
    };
    const champGroups = (used = new Set()) => {
      const groups = [1, 2, 3, 4, 5].map((cost) => ({ label: `${cost} 費`, items: D.gamedata.champions.filter((x) => x.cost === cost).map((x) => ({ key: x.key, name: champName(x.key) + (used.has(x.key) ? "（已在場上）" : ""), ico: icon("champion", x.key, "sm") })) })).filter((x) => x.items.length);
      const others = D.gamedata.champions.filter((x) => !(x.cost >= 1 && x.cost <= 5));
      if (others.length) groups.push({ label: "其他", items: others.map((x) => ({ key: x.key, name: champName(x.key), ico: icon("champion", x.key, "sm") })) });
      return groups;
    };
    // 升等要補：加在 lv，更高等級（主圖以上）也一起加
    function pickStep(lv) {
      const used = new Set(champsOnly(st.data[lv]).map((u) => u.key));
      picker(`${lv} 等要補的棋子`, champGroups(used), (key) => {
        const its = recItems(key);
        for (const L of levelsOf(c).filter((L) => L >= lv && L > st.main)) {
          const arr = st.data[L] ||= [];
          if (!champsOnly(arr).some((u) => u.key === key)) { arr.push({ key, star: 2, items: [...its], pos: null }); autoPlace(arr, c, null); }
        }
        st.side = { kind: "step", lv, key }; st.flexForm = null;
        changed(`${lv} 等補上${champName(key)}。`);
      });
    }
    function sideSelPanel(k) {
      let u, remove = null, after = null;
      if (k.kind === "step") {
        u = champsOnly(st.data[k.lv]).find((x) => x.key === k.key);
        if (!u) return null;
        const higher = () => levelsOf(c).filter((L) => L > k.lv).map((L) => champsOnly(st.data[L]).find((x) => x.key === k.key)).filter(Boolean);
        after = () => higher().forEach((x) => (x.items = [...u.items]));  // 同一隻在更高等級的裝備跟著改
        remove = () => {
          for (const L of levelsOf(c).filter((L) => L >= k.lv)) { const arr = st.data[L] || []; const j = arr.findIndex((x) => x.key === k.key); if (j >= 0) arr.splice(j, 1); }
          st.side = null; changed(`已從 ${k.lv} 等以上拿掉${champName(k.key)}。`);
        };
      } else {
        const opt = st.flex["lv" + k.lv]?.[k.i];
        if (!opt) return null;
        const its = (opt.items ||= {})[k.key] ||= [];
        u = { key: k.key, items: its };
        after = ownFlex;
      }
      const its = u.items || (u.items = []);
      return h("div", { class: "card selp fx-selp" },
        h("b", { class: "small" }, `${champName(u.key)}的推薦裝備`),
        h("div", { class: "islots" }, [0, 1, 2].map((i) => its[i]
          ? h("button", { class: "chip", type: "button", title: "拿掉這件", onclick: () => { its.splice(i, 1); after?.(); changed(); } }, icon("item", its[i], "xs"), itemName(its[i]), " ×")
          : h("button", { class: "chip add", type: "button", onclick: () => pickItem(u, after) }, "＋ 裝備"))),
        h("div", { class: "row" },
          remove ? h("button", { class: "btn ghost", type: "button", onclick: remove }, `從 ${k.lv} 等以上拿掉`) : null,
          h("button", { class: "btn ghost", type: "button", onclick: () => { st.side = null; draw(); } }, "完成")));
    }
    function flexFormBox(lv) {
      const f = st.flexForm;
      const onBoard = [...new Set(champsOnly(st.data[lv]).map((u) => u.key))];
      return h("div", { class: "card selp fx-form" },
        h("b", { class: "small" }, `新增一組替換（${lv} 人口）`),
        h("p", { class: "xs muted", style: "margin:0" }, "先點要拿掉的棋子（最多 3 隻），再選要換上的棋子。"),
        h("div", { class: "fx-gh" }, "拿掉："),
        h("div", { class: "row" }, onBoard.map((k) => h("button", { class: "chip", type: "button", "aria-pressed": f.out.includes(k) ? "true" : "false",
          onclick: () => { f.out = f.out.includes(k) ? f.out.filter((x) => x !== k) : [...f.out, k].slice(0, 3); draw(); } }, icon("champion", k, "xs"), champName(k)))),
        h("div", { class: "fx-gh" }, "換上："),
        h("div", { class: "row" }, f.in.map((k, j) => h("button", { class: "chip", type: "button", title: "拿掉", onclick: () => { f.in.splice(j, 1); draw(); } }, icon("champion", k, "xs"), champName(k), " ×")),
          f.in.length < 3 ? h("button", { class: "chip add", type: "button", onclick: () => picker("換上的棋子", champGroups(new Set(onBoard)), (key) => { f.in.push(key); draw(); }) }, "＋ 選棋子") : null),
        f.msg ? h("p", { class: "xs warn", style: "margin:0" }, f.msg) : null,
        h("div", { class: "row" },
          h("button", { class: "btn", type: "button", onclick: () => {
            if (!f.out.length || !f.in.length) { f.msg = "拿掉和換上都至少要選一隻。"; draw(); return; }
            ownFlex(); (st.flex["lv" + lv] ||= []).push({ out: [...f.out], in: [...f.in], items: Object.fromEntries(f.in.map((k) => [k, recItems(k)])) });
            st.flexForm = null; changed("已加入一組替換。"); } }, "加入"),
          h("button", { class: "btn ghost", type: "button", onclick: () => { st.flexForm = null; draw(); } }, "取消")));
    }
    function tapCell(r, col) {
      const units = st.data[st.lv], u = units.find((x) => x.pos && x.pos[0] === r && x.pos[1] === col);
      if (u) { st.sel = st.sel === u ? null : u; draw(); return; }
      if (st.sel) { st.sel.pos = [r, col]; changed(`已移到 ${"ABCD"[r]}${col + 1}。`); return; }
      pickChamp([r, col]);
    }
    function moveOrSwap(u, r, col) {
      const units = st.data[st.lv], other = units.find((x) => x !== u && x.pos && x.pos[0] === r && x.pos[1] === col);
      if (other) other.pos = u.pos ? [...u.pos] : null;
      u.pos = [r, col]; st.sel = u;
      changed(other ? `已和${champName(other.key)}交換位置。` : `已移到 ${"ABCD"[r]}${col + 1}。`);
    }
    function dragable(cell, u) {
      let sx = 0, sy = 0, drag = false, ghost = null, pid = null;
      cell.addEventListener("dragstart", (ev) => ev.preventDefault());  // 圖片的瀏覽器原生拖曳會中斷指標事件
      cell.addEventListener("pointerdown", (ev) => { if (ev.button > 0) return; sx = ev.clientX; sy = ev.clientY; drag = false; pid = ev.pointerId; cell.setPointerCapture(pid); });
      cell.addEventListener("pointermove", (ev) => {
        if (pid !== ev.pointerId) return;
        if (!drag && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { drag = true; ghost = cell.cloneNode(true); ghost.className = "hex ghost"; document.body.append(ghost); }
        if (drag) { ghost.style.left = ev.clientX - 24 + "px"; ghost.style.top = ev.clientY - 24 + "px";
          root.querySelectorAll(".hex.drop").forEach((x) => x.classList.remove("drop"));
          const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".be .hex"); if (t && t !== cell) t.classList.add("drop"); }
      });
      const end = (ev) => {
        if (pid !== ev.pointerId) return; pid = null;
        if (ghost) { ghost.remove(); ghost = null; }
        if (!drag) { tapCell(u.pos[0], u.pos[1]); return; }
        const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".be .hex");
        if (t && t !== cell && root.contains(t)) moveOrSwap(u, +t.dataset.r, +t.dataset.c); else draw();
      };
      cell.addEventListener("pointerup", end);
      cell.addEventListener("pointercancel", (ev) => { if (ghost) ghost.remove(); ghost = null; pid = null; drag = false; draw(); });
    }
    function markBox(units) {
      const rs = units.filter((u) => isRift(u.key));
      const max = st.two[st.lv] ? 2 : 1;
      const cb = h("input", { type: "checkbox" }); cb.checked = !!st.two[st.lv];
      cb.addEventListener("change", () => { st.two[st.lv] = cb.checked; if (!cb.checked) rs.filter((u) => u.mark).slice(1).forEach((u) => (u.mark = false)); changed(cb.checked ? "可以給兩隻首領標記。" : "首領標記改回只給一隻。"); });
      return h("div", { class: "card small markbox" },
        h("b", null, "首領標記給誰"),
        h("p", { class: "xs muted", style: "margin:2px 0 6px" }, "峽谷巨獸開啟時，首領標記給一隻峽谷巨獸棋子，觸發牠的專屬增益。點棋子選擇，再點一次取消。"),
        h("div", { class: "row" }, rs.map((u) => h("button", { class: "chip", type: "button", "aria-pressed": u.mark ? "true" : "false", onclick: () => toggleMark(u, rs, max) }, icon("champion", u.key, "xs"), champName(u.key)))),
        h("label", { class: "row-check small" }, cb, "有增幅可以多給第二隻"),
        rs.some((u) => u.mark) ? null : h("p", { class: "xs warn", style: "margin:4px 0 0" }, "還沒選首領標記給誰。"));
    }
    function riderBox(units) {
      const ss = champsOnly(units).filter((u) => isSpry(u.key));
      return h("div", { class: "card small markbox rider" },
        h("b", null, "騎乘者給誰（百戰老兵）"),
        h("p", { class: "xs muted", style: "margin:2px 0 6px" }, "百戰老兵開啟時，選一隻百戰老兵騎上毛茸茸大夥伴。點棋子選擇，再點一次取消。"),
        h("div", { class: "row" }, ss.map((u) => h("button", { class: "chip", type: "button", "aria-pressed": u.rider ? "true" : "false",
          onclick: () => { const on = !u.rider; ss.forEach((x) => (x.rider = false)); u.rider = on; changed(on ? `騎乘者給${champName(u.key)}。` : `已拿掉${champName(u.key)}的騎乘者。`); } }, icon("champion", u.key, "xs"), champName(u.key)))),
        ss.some((u) => u.rider) ? null : h("p", { class: "xs warn", style: "margin:4px 0 0" }, "還沒選騎乘者。"));
    }
    function toggleMark(u, rs, max) {
      if (u.mark) { u.mark = false; changed(`已拿掉${champName(u.key)}的首領標記。`); return; }
      const m = rs.filter((x) => x.mark);
      if (m.length >= max) {
        if (max === 1) m.forEach((x) => (x.mark = false));
        else { st.msg = "最多給兩隻；先點已選的取消一隻。"; draw(); return; }
      }
      u.mark = true; changed(`首領標記給${champName(u.key)}。`);
    }
    function selPanel(u) {
      if (isPlant(u)) return h("div", { class: "card selp" },
        h("div", { class: "comp-head" }, plantTile(u), h("div", null, h("b", null, PLANT[u.plant]), h("div", { class: "xs muted" }, `神木植物｜${u.star} 星｜位置 ${u.pos ? "ABCD"[u.pos[0]] + (u.pos[1] + 1) : "—"}`))),
        h("p", { class: "xs muted", style: "margin:0" }, "張數和星級跟著神木精靈人數自動變，這裡只能換位置：選取後點空格，或直接拖曳。"),
        h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", onclick: () => { st.sel = null; draw(); } }, "完成")));
      const its = u.items || (u.items = []);
      return h("div", { class: "card selp" },
        h("div", { class: "comp-head" }, icon("champion", u.key), h("div", null, h("b", null, champName(u.key)), h("div", { class: "xs muted" }, `${CH[u.key]?.cost ?? "?"} 費｜位置 ${u.pos ? "ABCD"[u.pos[0]] + (u.pos[1] + 1) : "—"}`))),
        h("div", { class: "row", role: "group", "aria-label": "星級" }, [1, 2, 3].map((n) =>
          h("button", { class: "chip star", type: "button", "aria-pressed": u.star === n ? "true" : "false", onclick: () => { u.star = n; changed(); } }, "★".repeat(n)))),
        h("div", { class: "islots" }, [0, 1, 2].map((i) => its[i]
          ? h("button", { class: "chip", type: "button", title: "拿掉這件", onclick: () => { its.splice(i, 1); changed(); } }, icon("item", its[i], "xs"), itemName(its[i]), " ×")
          : h("button", { class: "chip add", type: "button", onclick: () => pickItem(u) }, "＋ 裝備"))),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", type: "button", onclick: () => { st.data[st.lv] = st.data[st.lv].filter((x) => x !== u); st.sel = null; changed(`已移出${champName(u.key)}。`); } }, "移出棋盤"),
          h("button", { class: "btn ghost", type: "button", onclick: () => { st.sel = null; draw(); } }, "完成")));
    }
    const picker = openPicker;
    function pickChamp(target) {
      const used = new Set(champsOnly(st.data[st.lv]).map((u) => u.key));
      const groups = [1, 2, 3, 4, 5].map((cost) => ({ label: `${cost} 費`, items: D.gamedata.champions.filter((x) => x.cost === cost).map((x) => ({ key: x.key, name: champName(x.key) + (used.has(x.key) ? "（已在場上）" : ""), ico: icon("champion", x.key, "sm") })) }))
        .filter((x) => x.items.length);
      const others = D.gamedata.champions.filter((x) => !(x.cost >= 1 && x.cost <= 5));
      if (others.length) groups.push({ label: "其他", items: others.map((x) => ({ key: x.key, name: champName(x.key), ico: icon("champion", x.key, "sm") })) });
      picker(target ? `放到 ${"ABCD"[target[0]]}${target[1] + 1}` : "加棋子", groups, (key) => {
        const u = { key, star: 2, items: [], pos: target };
        st.data[st.lv].push(u); if (!target) autoPlace(st.data[st.lv], c, null);
        st.sel = u; changed(`已加入${champName(key)}。`);
      });
    }
    function pickItem(u, after = null) {
      const g = D.gamedata, mk = (arr) => arr.map((x) => ({ key: x.key, name: itemName(x.key), ico: icon("item", x.key, "sm") }));
      const groups = [
        { label: "一般成裝", items: mk(g.items.filter((x) => (x.kind || "completed") === "completed")) },
        { label: "光明", items: mk((g.extraItems || []).filter((x) => x.kind === "radiant")) },
        { label: "神器", items: mk([...g.items.filter((x) => x.kind === "artifact"), ...(g.extraItems || []).filter((x) => x.kind === "artifact")]) },
        { label: "徽章", items: mk(g.emblems || []) },
        { label: "其他", items: mk((g.extraItems || []).filter((x) => x.kind === "special")) },
      ].filter((x) => x.items.length);
      picker(`${champName(u.key)}的裝備`, groups, (key) => { if ((u.items || []).length >= 3) return; (u.items ||= []).push(key); after?.(); changed(`已給${champName(u.key)}${itemName(key)}。`); });
    }
    async function saveBoard() {
      if (!st.dirty) return;
      const strip = (lv) => { const us = withPlants(st.data[lv]), on = riftOn(us), so = spryOn(us);
        return { units: us.map((u) => (isPlant(u) ? { plant: u.plant, star: u.star, pos: u.pos } : { key: u.key, star: u.star, items: (u.items || []).slice(0, 3), pos: u.pos,
          ...(on && u.mark && isRift(u.key) ? { mark: true } : {}), ...(so && u.rider && isSpry(u.key) ? { rider: true } : {}) })), twoMarks: on && !!st.two[lv] }; };
      const flex = st.flexOwned ? Object.fromEntries(Object.entries(st.flex).map(([k, xs]) => [k, (xs || []).slice(0, 8).map((x) => ({ out: x.out.slice(0, 3), in: x.in.slice(0, 3),
        items: Object.fromEntries(x.in.slice(0, 3).map((k2) => [k2, ((x.items || {})[k2] || []).slice(0, 3)])) }))])) : null;
      const doc = { compId: c.id, ...Object.fromEntries(levelsOf(c).map((lv) => ["lv" + lv, strip(lv)])), ...(flex ? { flex } : {}), at: new Date().toISOString() };
      st.msg = "儲存中…"; draw();
      try { await O.db.doc("boards/" + c.id).set(doc); O.boards[c.id] = doc; st.dirty = false; st.msg = "已儲存。下次更新時會套到正式站。"; }
      catch (err) { st.msg = "儲存失敗：" + (err?.message || "請再試一次") + "。變更還在，可以再按一次儲存。"; }
      draw();
    }
    async function resetBoard() {
      st.msg = "恢復中…"; draw();
      try { await O.db.doc("boards/" + c.id).delete(); delete O.boards[c.id]; const base = { ...c, boards: c.boardsBase || c.boards }; Object.assign(st, freshState(base, false)); st.msg = "已恢復成資料預設的棋盤。"; }
      catch (err) { st.msg = "恢復失敗：" + (err?.message || "請再試一次"); }
      draw();
    }
    draw();
    return root;
  }

  /* ---------- 啟動 ---------- */
  async function boot() {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const [d, m] = await Promise.all([fetch("data/site-data.json", { signal: ctl.signal }).then((r) => r.json()),
        fetch("icons/manifest.json", { signal: ctl.signal }).then((r) => (r.ok ? r.json() : { files: [] })).catch(() => ({ files: [] }))]);
      D = d; ICONS = new Set(m.files || []);
    } catch {
      clearTimeout(timer);
      $("#loading").textContent = "資料載入失敗，請重新整理頁面。";
      return;
    }
    clearTimeout(timer);
    CH = Object.fromEntries(D.gamedata.champions.map((c) => [c.key, c]));
    IT = Object.fromEntries(D.gamedata.items.map((i) => [i.key, i]));
    XI = Object.fromEntries((D.gamedata.extraItems || []).map((i) => [i.key, i]));
    EM = Object.fromEntries((D.gamedata.emblems || []).map((i) => [i.key, i]));
    TR = Object.fromEntries(D.gamedata.traits.map((t) => [t.key, t]));
    $("#loading").remove();
    adaptLayout();
    renderTop(); renderUpdates(); renderPatch(); renderVersion(); renderTiers(); renderPicker(); renderRoute(); renderCompList(); renderResearch(); renderWiki(); applyDataTx();
    document.querySelectorAll("a.out").forEach((a) => a.addEventListener("click", () => track("out", a.dataset.ch)));
    addEventListener("hashchange", route); route();
    startAnalytics();
    startOwner();
  }
  window.__choko = { S, evaluate: (id) => evaluate(D.comps.find((c) => c.id === id)), renderPicker };
  boot();
})();

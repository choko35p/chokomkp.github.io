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

  /* ---------- 賽季切換（站主 2026-11-16：「弄一個可以切換成s19的按鈕，點了之後t度表等所有的東西包括小百科都要變成s19」）
     同一份程式，?s=19 讀 data/s19/ 的資料；切換時整頁重載。沒帶參數＝現行賽季（SEASON_DEFAULT，S19 正式上線那天改）。 ---------- */
  const SEASON_DEFAULT = 18;
  const SEASON = (() => {
    const q = new URLSearchParams(location.search).get("s");
    if (q === "19" || q === "18") return +q;
    if (/^#c-s19-/.test(location.hash)) return 19;  // S19 陣容連結沒帶參數
    return SEASON_DEFAULT;
  })();
  const S19 = SEASON === 19;
  const dataUrl = (p) => (S19 ? "data/s19/" : "data/") + p;
  const seasonHref = (s) => { const u = new URL(location.href); if (s === SEASON_DEFAULT) u.searchParams.delete("s"); else u.searchParams.set("s", String(s)); u.hash = ""; return u.pathname + u.search; };

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
  /* 羈絆小圖示精靈圖（小百科用；站主 2026-11-16：「羈絆要有小圖示」）。index 內嵌，不多一次請求；key 對不上就不畫圖、只留文字。
     S18＝32px 格、S19＝64px 格，都是 8 欄；來源 research/data/traits_sprite_s18.webp、research/data/s19/traits_sprite_s19.webp（tools/build_*.py 複製進 icons/） */
  const TRSP = {"18":{"src":"icons/traits_s18.webp","cols":8,"rows":5,"index":{"Riftbeast":0,"Blossom":1,"Elderwood":2,"Sprykin":3,"Inferno":4,"Coven":5,"Blackthorn":6,"Fae":7,"Solar":8,"Lunar":9,"Primal":10,"Rival":11,"FloraFatalis":12,"Spellweaver":13,"Juggernaut":14,"Vanguard":15,"Ravager":16,"Defender":17,"Brawler":18,"Adaptor":19,"Hunter":20,"Invoker":21,"Executioner":22,"Rapidfire":23,"Summoner":24,"OldGrowth":25,"Monolith":26,"Greenfather":27,"EmeraldAspect":28,"Avatar":29,"Caustic":30,"Thornmaiden":31,"Attuned":32,"BountySeeker":33,"ApexPredator":34}},"19":{"src":"icons/s19/traits.webp","cols":8,"rows":7,"index":{"IonicSpark":0,"KDA":1,"BeachPop":2,"Classical":3,"Heartsteel":4,"Rock":5,"Pentakill":6,"TrueDamage":7,"Hyperpop":8,"ILLBEATS":9,"GuFeng":10,"Jazz":11,"RAndB":12,"EDM":13,"Frontman":14,"Juggernaut":15,"Slayer":16,"Swiftstriker":17,"Choreographer":18,"Bodyguard":19,"Arcanist":20,"Encore":21,"Prodigy":22,"Renegade":23,"Collab":24,"Trickshot":25,"Hitmaker":26,"Manager":27,"8Bit":28,"OneMonsterBand":29,"Composer":30,"Synthwave":31,"Goth":32,"RecordMogul":33,"Emo":34,"Tango":35,"MelodicHeart":36,"HypeMan":37,"Indie":38,"BoyBand":39,"BeatMaster":40,"Freestyle":41,"Producer":42,"Disco":43,"Country":44,"Windblessed":45,"Mariachi":46,"RisingStar":47,"Superstar":48}}};
  const traitIco = (key, px = 20) => { const sp = TRSP[SEASON], i = sp?.index[key]; if (i == null) return null; const c = i % sp.cols, r = Math.floor(i / sp.cols);
    return h("span", { class: "tr-ico", "aria-hidden": "true", style: `width:${px}px;height:${px}px;background-image:url(${sp.src});background-size:${sp.cols * px}px ${sp.rows * px}px;background-position:-${c * px}px -${r * px}px` }); };
  // 羈絆一律用圖示（站主 2026-11-20）：六角底色照遊戲（未啟動灰、銅、銀、金、彩），右下角是人數；名稱和「人數／下一階」放 data-tip，
  // 滑鼠移上去、鍵盤選到、或手機點一下才出現（ftip 浮動提示，不會被卡片的 overflow 切掉）。沒有圖示的羈絆用名稱第一個字。
  const trTier = (k, n) => { const bp = TR[k]?.breakpoints || [], hit = bp.filter((x) => x <= n).length;
    if (!hit) return "off"; if (hit >= bp.length) return bp.length >= 4 ? "prism" : "gold"; if (bp.length >= 4 && hit === bp.length - 1) return "gold"; return hit === 1 ? "bronze" : "silver"; };
  const trTip = (k, n) => { const bp = TR[k]?.breakpoints || [], next = bp.find((x) => x > n);
    return n == null ? traitName(k) : `${traitName(k)} ${n}${next ? "／" + next : ""}`; };
  const traitBadge = (k, n, o = {}) => { const tip = o.tip || trTip(k, n), ico = traitIco(k, o.px || 18);
    return h(o.tag || "span", { class: "tbg t-" + (n == null ? "plain" : trTier(k, n)) + (o.cls ? " " + o.cls : ""), "data-tip": tip, "aria-label": tip,
      ...(o.tag === "button" ? { type: "button", onclick: o.onclick } : { tabindex: "0", role: "img" }) },
      h("span", { class: "tbg-hex", "aria-hidden": "true" }, ico || h("i", { class: "tbg-txt" }, traitName(k).slice(0, 1))), n == null ? null : h("b", { "aria-hidden": "true" }, n)); };
  const traitBadges = (list, o = {}) => h("span", { class: "tbgs" + (o.cls ? " " + o.cls : "") }, list.map((t) => traitBadge(t.k, t.n, { px: o.px })));
  const activeTraits = (counts) => Object.entries(counts).map(([k, n]) => ({ k, n })).filter((t) => (TR[t.k]?.breakpoints || []).some((x) => x <= t.n))
    .sort((a, b) => ({ prism: 4, gold: 3, silver: 2, bronze: 1, off: 0 }[trTier(b.k, b.n)] - { prism: 4, gold: 3, silver: 2, bronze: 1, off: 0 }[trTier(a.k, a.n)]) || b.n - a.n);
  const FTIP = (() => { const t = h("div", { class: "ftip", role: "tooltip", hidden: "" }); let on = null, pin = false;
    const hide = () => { t.hidden = true; on = null; pin = false; };
    const show = (el) => { if (!t.isConnected) document.body.append(t); t.textContent = el.dataset.tip; t.hidden = false; on = el;
      const r = el.getBoundingClientRect(), w = t.offsetWidth, hh = t.offsetHeight;
      t.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + "px";
      t.style.top = (r.top - hh - 6 < 4 ? r.bottom + 6 : r.top - hh - 6) + "px"; };
    const tgt = (e) => e.target?.closest?.("[data-tip]");
    document.addEventListener("mouseover", (e) => { const el = tgt(e); if (el) show(el); else if (!pin && on) hide(); });
    document.addEventListener("focusin", (e) => { const el = tgt(e); if (el) show(el); });
    document.addEventListener("focusout", () => { if (!pin) hide(); });
    document.addEventListener("click", (e) => { const el = tgt(e); if (!el) { if (on) hide(); return; }
      if (el.tagName === "BUTTON") { hide(); return; }   // 本身有動作的按鈕（例如小百科棋子的羈絆會跳到羈絆說明）：照原本的動作走
      if (pin && on === el) hide(); else { show(el); pin = true; } });
    addEventListener("scroll", () => on && hide(), { passive: true }); addEventListener("resize", () => on && hide());
    return { hide }; })();
  const unverifiedMark = (status) => (status && status !== "verified" ? h("span", { class: "tag unv", title: "名稱尚未與遊戲內核對" }, "名稱未核對") : null);

  // 輸出／坦的小圖（劍／盾），用在裝備分頁的角標
  const svgEl = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  function roleGlyph(tank) {
    const g = svgEl("svg", { viewBox: "0 0 16 16", width: "12", height: "12", class: "rglyph", "aria-hidden": "true" });
    g.append(tank ? svgEl("path", { d: "M8 1.2 2.6 3.2v4.1c0 3.4 2.3 6.1 5.4 7.5 3.1-1.4 5.4-4.1 5.4-7.5V3.2z", fill: "currentColor" })
      : svgEl("path", { d: "M13.8 1.2 7.6 7.4l1 1 6.2-6.2zM2.4 9.6l1.3-1.3 4 4-1.3 1.3-.9-.9-2 2-1.1-1.1 2-2z M6.6 8.4l1 1-2.2 2.2-1-1z", fill: "currentColor" }));
    return g;
  }
  function icon(kind, key, size = "") {
    const isChamp = kind === "champion";
    const c = isChamp ? CH[key] : null;
    const name = isChamp ? champName(key) : itemName(key);
    const box = h("span", { class: `ico ${size} ${isChamp && c ? "c" + c.cost : "item"}`, role: "img", "aria-label": name });
    const fb = h("span", { class: "fb" }, name.replace(/(轉職|徽章)$/, "").slice(0, 2));
    const base = `icons/${isChamp ? "champions" : "items"}/${isChamp ? key : (IT[key]?.icon || key)}`;
    const path = ICONS.has(base + ".webp") ? base + ".webp" : base + ".png";
    const sp = S19 ? (isChamp ? D.sprite19 : D.itemSprite19) : null, si = sp?.map?.[key];
    if (si != null) {  // S19 頭像、S19 新裝備／徽章（站主 11/19：轉職沒認出來）：各一張精靈圖（預覽站一個版本最多 512 個檔）
      const c = si % sp.cols, r = Math.floor(si / sp.cols);
      box.append(h("span", { class: "spr", "aria-hidden": "true", style: `background-image:url(${sp.src});background-size:${sp.cols * 100}% ${sp.rows * 100}%;background-position:${sp.cols > 1 ? (c / (sp.cols - 1)) * 100 : 0}% ${sp.rows > 1 ? (r / (sp.rows - 1)) * 100 : 0}%` }));
    } else if (!S19 && ICONS.has(path) || S19 && !isChamp && ICONS.has(path)) {
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
      ["#version", "nav.version", "版本主軸"], ["#picker", "nav.picker", "隨手速查"], ["#learn", "nav.learn", "新手教學"], ["#comps", "nav.comps", "陣容攻略"], ["sim/", "nav.editor", "陣容編輯器"], ["sim/", "nav.sim", "戰鬥模擬"], ["trials/", "nav.trials", "滴答克的試煉"], ["pros/", "nav.pros", "高手教學庫"]].filter(([href]) => !S19 || (S19FULL() ? href !== "sim/" && (href !== "#updates-sec" || D.updateNotes?.length) : href === "#tierlist" || href === "#learn" || href === "#comps" || href === "trials/" || href === "pros/")).map(([href, k, t]) => h("li", null, h("a", { href, "data-tx": k }, t))));  // 戰鬥模擬器 2026-11-11
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
    $("#patch").textContent = p.label || `${p.patch} 版本｜S${p.set}「${p.setName}」`;
    seasonUi();
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
        h("div", { class: "in small" }, h("ul", { class: "list" }, D.siteChanges.map((x) => h("li", null, h("span", { class: "xs muted" }, x.date.slice(5).replace("-", "/") + "　"), tx(`version:sitechange.${x.id}`, x.text)))))) : "");
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

  // 兩段式切換鈕：放在頁首版本文字旁邊；S19 時導覽列下面多一條「PBE 前預測」說明
  function seasonUi() {
    if ($("#ssw")) return;
    const mk = (s, label, sub) => h("a", { class: "ssw-b" + (SEASON === s ? " on" : ""), href: seasonHref(s), "aria-current": SEASON === s ? "true" : "false",
      onclick: () => track("season", s) }, h("b", null, label), h("small", null, sub));
    const sw = h("div", { id: "ssw", class: "ssw", role: "group", "aria-label": "切換賽季" }, mk(18, "S18", "現行"), mk(19, "S19", "PBE"));
    $(".top .brand")?.after(sw);
    // 觀眾 2026-11-16：點左上的圖或站名就回首頁
    const br = $(".top .brand");
    if (br && !br.dataset.home) {
      br.dataset.home = "1"; br.classList.add("brand-home"); br.setAttribute("role", "link"); br.setAttribute("tabindex", "0"); br.title = "回首頁";
      const goHome = (e) => { if (e.target.closest("a,button,.ssw")) return; e.preventDefault(); if (location.hash) { history.pushState(null, "", location.pathname + location.search); route(); } window.scrollTo({ top: 0, behavior: "smooth" }); track("brand", "home"); };
      br.addEventListener("click", goHome);
      br.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") goHome(e); });
    }
    if (S19) {
      document.documentElement.classList.add("s19");
      const n = D.seasonNote || {};
      $(".nav")?.after(h("div", { class: "s19-banner", role: "note" }, h("div", { class: "wrap" },
        h("b", null, n.title || "S19 PBE 前預測"), " ", h("span", null, n.text || "陣容與評級為攻略網預測，名稱暫譯，數值 PBE 後補。"))));
      const f = document.querySelector(".foot p");
      if (f && n.foot) f.replaceChildren(h("b", null, "巧克力MKP的戰棋研究室"), "｜", n.foot);
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
    if (pc.source?.url) body.append(h("p", { class: "xs muted" }, "來源：", h("a", { href: pc.source.url, target: "_blank", rel: "noopener" }, pc.source.name || "原文")));
    for (const old of pc.history || []) body.append(h("details", { class: "pgroup" }, h("summary", null, `${old.patch}（${old.live}）`), h("div", { class: "in" }, patchChart({ ...old, history: [] }))));  // S19 PBE：之前幾天的改動
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
    let ics = pc.groups.filter((g) => g.remember).flatMap((g) => g.items).filter((x) => x.icon).slice(0, 3);
    if (!ics.length) ics = all.filter((x) => x.unit || x.icon).slice(0, 3);  // S19 增幅還沒有圖示：改放棋子
    slot.append(h("button", { id: "patch-btn", class: "patch-btn", type: "button", onclick: openPatch, "aria-haspopup": "dialog" },
      h("span", { class: "pb-icons", "aria-hidden": "true" }, ics.map(pIcon)),
      h("span", { class: "pb-txt" }, h("span", { class: "pb-main" }, `${pc.patch} 改動一覽`),
        h("span", { class: "pb-sub" }, h("span", { class: "dirtag up" }, `↑ ${n("up")}`), h("span", { class: "dirtag down" }, `↓ ${n("down")}`), pc.btnSub || "增幅、神火都在這"))));
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
        onclick: () => { ROUTE_SEL = x.cost; track("route_tab", x.cost); renderLearnView(); document.getElementById("route-panel")?.focus({ preventScroll: true }); } },
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
    $("#nav-route")?.remove();
    renderLearnHub();
    renderLearnView();
  }
  /* 站主 2026-11-16：定陣路線歸進新手教學（#learn-route；舊網址 #route-sec 轉過來）。畫在 #learnv 裡 */
  const routeOk = () => !!D.routeGuide?.routes?.length;
  const S19FULL = () => S19 && D.versionSummary?.status === "ready";  // S19 有高手資料了：首頁各區照 S18 開
  const learnBack = () => h("a", { class: "back btn ghost", href: "#learn" }, "← 回新手教學");
  function drawRouteView(v) {
    const r = D.routeGuide;
    if (!routeOk()) {
      v.replaceChildren(learnBack(), h("h2", null, "定陣路線"), h("p", { class: "rlead" }, "S19 上線後補。S19 的定陣路線等正式上線、高手資料夠了再做。"));
      return;
    }
    if (!r.routes.some((x) => x.cost === ROUTE_SEL)) ROUTE_SEL = r.routes[0].cost;
    v.replaceChildren(...[
      learnBack(),
      h("h2", null, tx("route:title", r.title)),
      r.stale ? h("p", { class: "notice small" }, `這是 ${r.patch} 的定陣建議；新版本的高手資料足夠後會重新研究。`) : null,
      r.note ? h("p", { class: "small muted" }, r.note) : null,
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

  /* ---------- 新手教學（站主 2026-11-16：邊玩邊學、決策實驗室、定陣路線、新手認卡歸在一起）----------
     實驗室題庫直接內嵌在這個常數（預覽站檔案數已滿，不另開資料檔）。有 confirm 欄位的題目是站主還沒確認觀點的：
     站主模式看得到並標「待確認」，一般讀者先不顯示；拿掉 confirm 就會出現。 */
  const LAB = {"version":"lab-1","labels":{"ok":"推薦","dep":"看情況","bad":"不建議","pick":"站主會這樣選","flip":"什麼時候改口"},"cats":{"eco":"經濟","roll":"D 牌","level":"上人口","scout":"看場","item":"裝備"},"scenarios":[{"id":"open-streak","cat":"eco","title":"開局要拚連勝還是擺連敗？","sub":"2-1 就要決定，不要打到一半才想。","stats":{"stage":"2-1","level":4,"gold":10,"hp":100},"facts":["剛打完第一階段的野怪，手上的牌就這些。","商店有一張可以湊對子的牌。","同場八個人，還看不出誰強誰弱。"],"question":"第二階段這幾場，你打算怎麼打？","varName":"你開局拿到的牌","vars":[{"label":"兩隻二星＋一件成裝"},{"label":"全部一星、散件很散"}],"plans":[{"id":"win","label":"有對子就買，場上放滿，拚連勝"},{"id":"lose","label":"場上放少一點，故意輸，存錢吃連敗"},{"id":"none","label":"不特別想，有什麼放什麼"}],"grid":{"win":[{"g":"ok","why":"開局牌強就是該贏。連勝有錢拿、又不扣血，是最賺的開法。","flip":"連勝斷了、場上又沒升級，就不要再硬花錢追。"},{"g":"bad","why":"牌爛還硬買，錢花了還是輸，連勝沒拿到，利息也沒了。","flip":"商店連續來對子，一下子變強，才改拚贏。"}],"lose":[{"g":"bad","why":"明明能贏還故意輸，白白扣血。強的開局不拿來連勝很浪費。","flip":"幾乎沒有。除非你玩的陣容本來就是靠連敗拿東西。"},{"g":"ok","why":"反正打不贏，乾脆輸得乾淨一點，把錢存起來，選秀還能先選。","flip":"血掉太快（第二階段就掉到 60 以下）要提早收手。"}],"none":[{"g":"dep","why":"牌強的時候亂放大概也會贏，但少買一張對子可能就斷連勝。","flip":"想穩穩連勝，就認真把人口放滿、位置排好。"},{"g":"bad","why":"最容易變成贏一場輸一場。連勝連敗的錢都沒有，血照扣。","flip":"沒有。牌爛的時候一定要先選一邊。"}]},"pick":["win","lose"],"follow":{"q":"你連敗了三場，下一場的對手剛好是全場最弱的，放滿可能會贏。你怎麼做？","opts":[{"label":"繼續放少，維持連敗","good":true,"fb":"第二階段的連敗很值錢。贏這一場，前面三場的血就白扣了。除非血已經危險，不然先不要斷。"},{"label":"放滿拚這一場","good":false,"fb":"贏了連敗就斷了，下一場又輸，就變成最窮的輸輸贏贏。要贏就要有把握接下來能一直贏。"}]},"takeaway":"2-1 先選邊：牌強拚連勝，牌爛擺連敗。最怕的是不選。"},{"id":"interest-edge","cat":"eco","title":"買了會掉利息，買不買？","sub":"身上 21 金，商店有你想要的牌。","stats":{"stage":"2-3","level":4,"gold":21,"hp":92},"facts":["那張牌 2 金。買了剩 19，這回合利息少 1 金。","板凳上有一張完全用不到的一費牌。","這回合打的是玩家，不是野怪。"],"question":"這張 2 金的牌，你怎麼處理？","varName":"那張牌是什麼","vars":[{"label":"買了直接合二星，馬上能上場"},{"label":"只是第一張，之後可能用得到"}],"plans":[{"id":"buy","label":"直接買，掉到 19 沒差"},{"id":"skip","label":"不買，守住 20"},{"id":"swap","label":"先賣板凳那張沒用的，再買"}],"grid":{"buy":[{"g":"dep","why":"二星是實打實的戰力，1 金利息換一隻二星划算。但你明明可以不掉利息的。","flip":"板凳沒有東西可以賣的時候，這就是對的。"},{"g":"bad","why":"為了一張還沒用的牌掉利息，而且它還佔板凳。","flip":"那張是很難抽的高費牌、又是你這場一定會用的，才值得。"}],"skip":[{"g":"bad","why":"二星放在面前不買，為了 1 金利息少一隻二星，省小錢輸大的。","flip":"你正在擺連敗、這回合本來就不想贏。"},{"g":"ok","why":"第一張而已，不急。利息先拿，之後有對子再說。","flip":"那張牌同場沒人在拿，而且你下一回合就會超過 22 金，那下回合再買就好。"}],"swap":[{"g":"ok","why":"賣一張沒用的拿回 1 金，買完剛好 20。二星有了，利息也沒掉。","flip":"板凳那張其實之後用得到，就不要賣。"},{"g":"dep","why":"利息保住了，但你是拿一張沒用的換另一張還沒用的，板凳還是塞著。","flip":"新的這張確定在你的陣容裡，才換。"}]},"pick":["swap","skip"],"follow":{"q":"你現在 48 金，商店出了一張能湊二星的牌，3 金。買了剩 45。","opts":[{"label":"買。差 2 金而已，下回合就補回來","good":true,"fb":"二星優先。48 買完 45，利息從 4 變 4，根本沒掉。要看的是「有沒有跨過整十」，不是有沒有 50。"},{"label":"不買，等存到 50 再說","good":false,"fb":"45 跟 48 的利息一樣是 4 金。你沒有少拿任何東西，卻少了一隻二星。"}]},"takeaway":"看的是整十那條線。沒跨線就放心買，會跨線先看板凳有沒有東西可以賣。"},{"id":"carousel","cat":"item","title":"選秀要拿什麼？","sub":"轉盤上的東西很多，你只能拿一個。","stats":{"stage":"2-4","level":5,"gold":24,"hp":78},"facts":["你的主 C 差一個反曲弓就能合出核心裝。","轉盤上有一隻你有對子的牌，但它帶的散件你用不到。","也有一隻帶反曲弓的牌，那隻牌你用不到。"],"question":"輪到你的時候，你走向哪一個？","varName":"你選的順位","vars":[{"label":"血最少，第一個選"},{"label":"連勝中，最後才選"}],"plans":[{"id":"comp","label":"拿帶反曲弓的那隻（要的是裝備）"},{"id":"unit","label":"拿有對子的那隻（要的是二星）"},{"id":"any","label":"拿費用最高的那隻"}],"grid":{"comp":[{"g":"ok","why":"先選就是讓你拿最缺的散件。裝備整場都跟著你，牌之後商店還會來。","flip":"你缺的散件轉盤上有好幾個，那可以考慮先拿別的。"},{"g":"dep","why":"最後選，反曲弓八成被拿走了。要先想好第二、第三順位要什麼。","flip":"走過去發現還在，當然直接拿。"}],"unit":[{"g":"bad","why":"一費二費的對子商店自己會來。拿第一順位去換一張便宜牌，太虧。","flip":"那隻是四費以上、又是你的主 C，才值得。"},{"g":"dep","why":"要的散件沒了，拿對子湊二星也不差，至少馬上變強。","flip":"剩下的散件裡有任何一個你合得出有用的裝，還是先拿散件。"}],"any":[{"g":"bad","why":"費用高不代表你用得到。賣掉換的那幾金，比不上一個對的散件。","flip":"沒有。先選的時候不要這樣拿。"},{"g":"dep","why":"剩下的都用不到的時候，拿貴的賣錢是最後的辦法。","flip":"只要還有用得到的散件，就不要為了幾金放掉。"}]},"pick":["comp","comp"],"confirm":"站主確認：最後順位、要的散件被拿走時，站主自己會優先拿「次要散件」還是「對子」？目前寫的是先看散件。","follow":{"q":"選秀開始前的那幾秒，你應該先做什麼？","opts":[{"label":"先看自己缺哪個散件，排好第一、第二順位","good":true,"fb":"轉盤一放人就開始搶了。進場前就要知道自己要走去哪，被拿走就換第二個。"},{"label":"等放人了再看哪個離我最近","good":false,"fb":"離你近的通常不是你要的。站在原地想的那兩秒，東西就被拿走了。"}]},"takeaway":"選秀看的是散件，不是牌。進場前先排好順位。"},{"id":"slam","cat":"item","title":"散件要先合還是留著？","sub":"手上兩個散件，合得出一件能用的，但不是最想要的那件。","stats":{"stage":"2-2","level":4,"gold":14,"hp":96},"facts":["你有兩個散件，現在合出來的裝你場上的輸出用得上。","你最想要的那件，還差一個還沒看到的散件。","場上的牌普通，沒有特別強也沒有特別弱。"],"question":"這兩個散件，你怎麼處理？","varName":"你這幾回合的打算","vars":[{"label":"在拚連勝"},{"label":"在擺連敗存錢"}],"plans":[{"id":"slam","label":"現在就合，給場上的輸出"},{"id":"hold","label":"留著，等最想要的那件"},{"id":"tank","label":"拆開想：先合一件防裝給前排"}],"grid":{"slam":[{"g":"ok","why":"要連勝就要現在強。一件成裝在第二階段差很多，放在板凳上的散件是零戰力。","flip":"合出來的裝後期完全沒人能用，才考慮忍一下。"},{"g":"bad","why":"你這幾場本來就要輸，合了變強反而可能不小心贏一場，連敗就斷了。","flip":"決定要收手、開始贏的那一回合再合。"}],"hold":[{"g":"bad","why":"拚連勝還把戰力放板凳，等於少一件裝在打。等到的時候連勝可能早就斷了。","flip":"下一回合就是野怪或選秀、馬上能補到那個散件。"},{"g":"ok","why":"反正要輸，散件留著等看得更清楚再合，可以合到最適合的。","flip":"血掉到該收手了，就不要再等。"}],"tank":[{"g":"dep","why":"前排有裝也能幫你贏，但前提是那兩個散件真的合得出防裝。","flip":"合出來的是輸出裝就給輸出，不要硬塞給坦。"},{"g":"bad","why":"一樣是變強，連敗的時候不需要。","flip":"同上，要開始贏的時候再合。"}]},"pick":["slam","hold"],"follow":{"q":"已經打到第三階段了，你板凳上還有三個散件沒合。","opts":[{"label":"現在能合什麼就合什麼，先上場","good":true,"fb":"第三階段開始每一場扣血都很痛。板凳上放著三個散件，等於一件半的裝沒在用。"},{"label":"繼續等，要合就合最好的","good":false,"fb":"最好的裝合出來的時候如果你只剩 20 血，那也沒用了。能用的裝比完美的裝重要。"}]},"takeaway":"要贏的時候散件馬上合；要輸的時候才可以留。"},{"id":"streak-break","cat":"eco","title":"連敗要擺到什麼時候？","sub":"你已經連敗四場，錢存得不錯。","stats":{"stage":"2-6","level":5,"gold":38,"hp":64},"facts":["你場上故意放得很弱，板凳其實有牌可以上。","連敗的錢每回合都在拿。","同場有人已經連勝五場，打你一次扣很多。"],"question":"這一回合，你要繼續輸還是開始贏？","varName":"現在打到哪了","vars":[{"label":"2-6，下一場是野怪"},{"label":"3-3，後面連三場都是玩家"}],"plans":[{"id":"keep","label":"繼續擺，保連敗"},{"id":"stop","label":"把牌放上去、該買的買，開始贏"},{"id":"half","label":"放一半，輸少一點就好"}],"grid":{"keep":[{"g":"ok","why":"第二階段最後一場，輸了再拿一次連敗錢，接著打野怪不扣血。這一場擺完最划算。","flip":"血已經低於 50 就不要再送了。"},{"g":"bad","why":"第三階段對面都有二星了，輸一場扣十幾滴。再擺三場，錢有了，血沒了。","flip":"你玩的是專門吃連敗的陣容，而且血還很多。"}],"stop":[{"g":"dep","why":"可以，但差這一場而已，多拿一次連敗錢再開始贏會更舒服。","flip":"血已經偏低、或這場對手很強會扣很多，就現在收。"},{"g":"ok","why":"第三階段是連敗該收手的時候。把存的錢花掉、上人口、開始贏，血才撐得到後面。","flip":"你花了錢還是打不贏任何人，那問題不是連敗，是要 D 牌補強。"}],"half":[{"g":"dep","why":"輸少一點、連敗照拿，這是高手的打法。但控制不好會不小心贏。","flip":"沒把握就不要玩這個，乾脆放少一點穩穩輸。"},{"g":"bad","why":"第三階段放一半就是照樣輸、照樣扣很多血，還沒有變強。","flip":"沒有。這時候要嘛全力贏，要嘛你有很明確的理由再撐一回合。"}]},"pick":["keep","stop"],"confirm":"站主確認：連敗收手的時間點，站主平常教的是「3-1 就收」還是「看血量（例如 50 以下）」？目前寫的是第三階段開始收、血低於 50 提早收。","follow":{"q":"你決定收手開始贏了。存的 50 金怎麼用？","opts":[{"label":"先上人口、把人放滿，還打不贏再 D","good":true,"fb":"多一隻牌多一個羈絆，通常比 D 幾下穩。錢留在 50 附近利息繼續拿。"},{"label":"全部拿去 D，一次變強","good":false,"fb":"一次 D 光，之後每回合利息少 5 金，後面上人口會很慢。連敗存的錢是拿來用整場的。"}]},"takeaway":"連敗是拿血換錢。第二階段可以擺，進第三階段就要準備收。"},{"id":"lv6-timing","cat":"level","title":"大家都上 6 了，我要跟嗎？","sub":"3-2，你 5 等，身上 46 金。","stats":{"stage":"3-2","level":5,"gold":46,"hp":80},"facts":["同場大部分的人這回合都升 6 了。","你場上 5 隻放滿，板凳有一隻可以上的牌。","升 6 要花掉一筆，會掉一兩格利息。"],"question":"這回合的錢，你怎麼花？","varName":"你這場在玩什麼","vars":[{"label":"賭一費三星的陣容"},{"label":"正常上人口、玩四費主 C 的陣容"}],"plans":[{"id":"up","label":"跟著上 6，多放一隻"},{"id":"slow","label":"留在 5 等，超過 50 的錢才拿去 D"},{"id":"allin","label":"留在 5 等，現在把錢 D 光"}],"grid":{"up":[{"g":"bad","why":"一費在 5 等最好抽，升上去一費的機率就掉了。你要的三星會越來越難追。","flip":"三星已經追到了，那就可以開始往上升。"},{"g":"ok","why":"正常陣容 3-2 上 6 是標準節奏。多一隻牌、多一個羈絆，才不會在第三階段一直輸。","flip":"你在連敗而且錢很少，可以晚一回合。"}],"slow":[{"g":"ok","why":"賭牌就是這樣打：守著 50 金，每回合把多出來的拿去 D。利息照拿，牌慢慢追。","flip":"血掉太快、或同場有人跟你搶同一隻，就要 D 兇一點。"},{"g":"bad","why":"你要的是四費，5 等根本抽不到。留在 5 等 D 只是在買你不需要的低費牌。","flip":"沒有。玩四費陣容不要在 5 等 D。"}],"allin":[{"g":"dep","why":"差兩三張就三星、或血快沒了，可以一次 D 下去。不然把錢 D 光，後面就沒利息了。","flip":"還差很多張的時候，慢慢 D 才對。"},{"g":"bad","why":"在抽不到主 C 的等級把錢花光，之後連人口都上不去。這是最傷的一種。","flip":"沒有。"}]},"pick":["slow","up"],"confirm":"站主確認：站上寫賭一費留 5 等、賭二費 6 等、賭三費 7 等，這題照這個寫。賭牌「守 50 慢 D」還是「3-1／3-2 直接 D 一波」，站主的教法是哪一種？","follow":{"q":"你玩正常陣容，上了 6 等、放了第六隻，身上剩 22 金。接下來？","opts":[{"label":"不 D，開始存錢，準備下一次上人口","good":true,"fb":"6 等只是過渡。錢存回 50，到第四階段上 7、上 8 才是 D 主 C 的時候。"},{"label":"順便 D 幾下看看有沒有好牌","good":false,"fb":"「順便 D」最花錢。6 等四費很難出，你 D 掉的是之後上 8 的錢。"}]},"takeaway":"要不要跟著升，看你在找幾費的牌。賭低費留低等，玩高費就跟上。"},{"id":"bleed-out","cat":"roll","title":"一直輸，現在 D 還是再撐一下？","sub":"場上都一星，每場扣十滴以上。","stats":{"stage":"3-5","level":6,"gold":52,"hp":46},"facts":["你已經連輸好幾場，不是故意的，是真的打不贏。","板凳有兩組對子。","你原本的計畫是存到 4-1 升 7 再 D。"],"question":"這 52 金，現在怎麼用？","varName":"現在是哪一回合","vars":[{"label":"3-5，後面還有一場玩家才到野怪"},{"label":"3-7，這一場打的就是野怪"}],"plans":[{"id":"roll","label":"現在 D 一波，D 到剩 30 左右"},{"id":"wait","label":"一毛不花，照原計畫撐到 4-1"},{"id":"lvl","label":"先升 7 放人口，不 D"}],"grid":{"roll":[{"g":"ok","why":"後面還要被打兩場，照現在這樣會再掉二三十滴。先把對子 D 成二星止血，剩 30 還有利息。","flip":"板凳沒有對子的話，D 的效率很差，改成上人口。"},{"g":"bad","why":"這回合打野怪不扣血。現在 D 的錢，下回合升 7 之後 D 會好抽很多。","flip":"你連野怪都打不過會漏掉裝備，才需要先補一下。"}],"wait":[{"g":"bad","why":"46 血再輸兩場就剩二十幾。存到 4-1 是有錢了，但你只剩一次失誤的空間。","flip":"下一場的對手很弱、你有機會贏，才可以賭。"},{"g":"ok","why":"野怪回合不用戰力。錢留著拿利息，下一回合 4-1 升 7 再一次 D，最划算。","flip":"沒有，這回合就是該忍。"}],"lvl":[{"g":"dep","why":"多一隻牌有幫助，但你的問題是全場一星。光加人口，還是打不贏二星的場。","flip":"板凳剛好有一隻二星可以直接上，那升等就很值。"},{"g":"dep","why":"野怪前先升也可以，差別不大，只是少拿一回合利息。","flip":"經驗差一點點就升、不會掉利息線，就先升。"}]},"pick":["roll","wait"],"follow":{"q":"你 D 到剩 30 金，中了兩隻二星，場上好多了。商店裡還有一張對子的牌。","opts":[{"label":"買下那張，然後停手","good":true,"fb":"對子的牌幾金而已，買。但 D 就到這裡，目標是止血不是成型。剩下的錢存回去，4-1 還要升等。"},{"label":"手感正好，繼續 D 到三組都二星","good":false,"fb":"沒有「手感」這種事。你設的停損是 30，到了就停。再 D 下去 4-1 升不了等，會輸得更久。"}]},"takeaway":"扣血的回合前才花錢。打野怪的回合不要 D。"},{"id":"contested","cat":"scout","title":"有人跟我玩一樣的","sub":"按一圈看場，發現有兩家跟你拿同一隻主 C。","stats":{"stage":"3-1","level":5,"gold":34,"hp":84},"facts":["你的裝備是照這套陣容做的。","隔壁有一套陣容，主 C 吃的裝跟你差不多，沒人在玩。","現在才第三階段，還來得及換。"],"question":"這套你還要繼續玩嗎？","varName":"誰比較快","vars":[{"label":"你已經有二星主 C，他們還是一星"},{"label":"他們二星了，你只有一對"}],"plans":[{"id":"stay","label":"不管，照原本的玩"},{"id":"move","label":"換去隔壁那套，裝備照用"},{"id":"rush","label":"提早 D，搶在他們前面把牌拿完"}],"grid":{"stay":[{"g":"ok","why":"你領先，該換的是他們。二星主 C 加對的裝，繼續玩沒問題。只是三星不要想了。","flip":"你這套一定要追三星才會強，那被兩家搶就很難。"},{"g":"bad","why":"三家搶同一隻、你又最慢，牌都在別人手上。硬玩通常是三家一起第五到第八。","flip":"他們其中一家很快會被淘汰或自己換掉，才有機會。"}],"move":[{"g":"dep","why":"你領先還先讓，有點可惜。但如果隔壁那套這版本一樣強，換過去更安全。","flip":"看到對手也 D 出二星、開始追上你，就換。"},{"g":"ok","why":"裝備不浪費、牌沒人搶，越早換損失越小。這就是看場的目的。","flip":"隔壁那套的牌你一張都沒有、要從零開始，就要算一下來不來得及。"}],"rush":[{"g":"dep","why":"趁領先多拿幾張，讓他們更難追，有用。但提早 D 會傷經濟。","flip":"你這套不用三星就夠強，那就不用搶，照節奏走。"},{"g":"bad","why":"你落後還去跟領先的人搶，D 出來的機率比他們低，錢花了牌還是他們的。","flip":"沒有。落後就不要搶。"}]},"pick":["stay","move"],"follow":{"q":"你平常什麼時候看別人的場？","opts":[{"label":"每個階段開始、還有準備 D 牌之前，都按一圈","good":true,"fb":"D 之前看一圈最重要：你要找的牌被拿走幾張、有沒有人跟你同一套，D 之前就要知道。"},{"label":"輸了才去看是輸給誰","good":false,"fb":"那時候錢已經花了。看場是花錢之前做的事，不是輸了之後。"}]},"takeaway":"同一套誰快誰玩。你慢就換，越早換越便宜。"},{"id":"rolldown-stop","cat":"roll","title":"D 到剩 30，要不要停？","sub":"4-2 升 8，一口氣 D 了二十幾金。","stats":{"stage":"4-2","level":8,"gold":30,"hp":58},"facts":["你升 8 之後開始 D，現在剩 30 金。","同場有三家已經成型。","下一場打玩家。"],"question":"剩下的 30 金，繼續 D 還是停？","varName":"D 到現在的結果","vars":[{"label":"主 C 二星、主坦二星都到手了"},{"label":"只中一隻不太重要的二星"}],"plans":[{"id":"stop","label":"停手，開始存回 50"},{"id":"zero","label":"繼續 D，D 到沒錢為止"},{"id":"ten","label":"再 D 10 金，沒中就停"}],"grid":{"stop":[{"g":"ok","why":"主 C、主坦二星就是能打了。剩下的慢慢補，錢存回去準備升 9 或之後再補一波。","flip":"血已經很低、下一場輸了會出事，可以再補一點前排。"},{"g":"dep","why":"血還有 58，可以停下來存兩回合再 D 一次。但這兩回合你會繼續輸。","flip":"輸一場扣超過 15 滴，就沒有本錢停。"}],"zero":[{"g":"bad","why":"該有的都有了還 D，是在把名次往下丟。沒錢就沒利息，也升不了 9。","flip":"你只剩十幾滴血、這場輸了就出局，才 all in。"},{"g":"dep","why":"場上沒起來又停手，等於白 D。但 D 到 0 還沒中，這場就結束了。先看血夠不夠你分兩次 D。","flip":"血低於 40 就沒得選，只能 D 到中。"}],"ten":[{"g":"dep","why":"差一隻就更完整的話可以，但已經能打了，這 10 金比較像手癢。","flip":"商店剛好卡著一組對子，補得到就值得。"},{"g":"ok","why":"給自己最後一個額度，中了最好，沒中就停下來存錢，下回合再一次。比 D 到 0 安全。","flip":"D 完這 10 金還是什麼都沒有、血又低，就只能繼續。"}]},"pick":["stop","ten"],"confirm":"站主確認：沒中的時候站主會選「再 D 10 金就停」還是「血 58 直接 D 到底」？這題兩種教法都有人講。","follow":{"q":"升 8 準備 D 之前，你應該先想好什麼？","opts":[{"label":"我要找哪兩三隻、D 到剩多少停","good":true,"fb":"有目標才知道什麼時候算「中了」。有停損才不會回神發現錢是 0。"},{"label":"先 D 再說，看來什麼玩什麼","good":false,"fb":"來什麼玩什麼聽起來很靈活，實際上是每張都想買、每張都只有一星。"}]},"takeaway":"D 牌的目標是「能打」，不是「完美」。主 C 主坦二星就先停。"},{"id":"roll7-or-8","cat":"level","title":"7 等先 D 還是存到 8？","sub":"4-1，你 7 等，50 金。","stats":{"stage":"4-1","level":7,"gold":50,"hp":62},"facts":["你的主 C 是四費。7 等抽得到四費，但 8 等好抽很多。","升 8 要再存一兩回合。","同場有人這回合已經升 8 在 D 了。"],"question":"這 50 金，現在的計畫是？","varName":"你場上現在的強度","vars":[{"label":"大部分二星，最近輸贏各半、輸也扣不多"},{"label":"一堆一星，每場都輸十滴以上"}],"plans":[{"id":"save8","label":"不動，存到 4-2／4-5 升 8 再 D"},{"id":"roll7","label":"7 等現在 D 一波，D 到 20～30"},{"id":"lv8now","label":"現在硬升 8，剩多少 D 多少"}],"grid":{"save8":[{"g":"ok","why":"場上撐得住就不要急。到 8 等再 D，同樣的錢中四費的機會高很多。","flip":"突然連輸兩場大的，計畫就要改。"},{"g":"bad","why":"每場掉十幾滴，存兩回合就是少三十滴。等你升 8，可能只剩二十幾血在 D。","flip":"接下來剛好是野怪回合，可以多撐一場。"}],"roll7":[{"g":"bad","why":"你不缺戰力，卻在機率比較差的等級把錢花掉。之後升 8 會比別人慢一大截。","flip":"你的主 C 其實是三費，那 7 等就是該 D 的地方。"},{"g":"ok","why":"先在 7 等把二星補起來止血。主 C 不一定要現在中，前排二星就能少扣很多。","flip":"板凳完全沒有對子，D 的效率太差，那不如直接升 8。"}],"lv8now":[{"g":"dep","why":"升了 8 沒剩多少錢 D，多一隻人口而已。場上本來就穩的話，不差這一回合。","flip":"板凳有一隻很強的牌等著上場，那先升很值。"},{"g":"dep","why":"多一個人口有幫助，但只剩十幾金 D 不出什麼。沒中的話會卡在 8 等沒錢。","flip":"錢夠你升 8 之後還有 30 金以上可以 D，就選這個。"}]},"pick":["save8","roll7"],"follow":{"q":"你決定存到 8 等。結果下一場輸了，被扣 16 滴。","opts":[{"label":"看一下是輸給誰、接下來還會不會遇到，再決定要不要提早 D","good":true,"fb":"輸給全場最強的那家一次不算什麼。但如果是誰都打不贏，就不要再等了。"},{"label":"計畫就是計畫，照樣存到 8","good":false,"fb":"計畫是在「場上撐得住」的前提下定的。前提變了還不改，就是在硬撐。"}]},"takeaway":"撐得住就存到 8 再 D；撐不住就 7 等先止血。看的是你每場扣多少。"},{"id":"scout-position","cat":"scout","title":"站位要針對誰？","sub":"開打前還有十秒，你看了一圈。","stats":{"stage":"5-1","level":8,"gold":20,"hp":40},"facts":["全場最強的那家，主 C 放在右下角。","他有一隻會跳後排的牌，放在左邊。","你的主 C 現在也在左下角，剛好在那隻牌的對面。"],"question":"這十秒你要怎麼調？","varName":"場上還剩幾個人","vars":[{"label":"剩 3 個人，下一場八成就是打他"},{"label":"還有 6 個人，不知道會打誰"}],"plans":[{"id":"target","label":"完全針對他：主 C 換邊，離那隻跳後排的遠一點"},{"id":"safe","label":"排一個打誰都不太吃虧的位置"},{"id":"still","label":"不動，位置一直都這樣放"}],"grid":{"target":[{"g":"ok","why":"只剩三個人，對手是誰幾乎確定。針對最強的那個排，贏他就是前二。","flip":"他最後一秒也換邊，你就要跟著再調。"},{"g":"dep","why":"六個人裡只有一個是他。為了他把位置排得很極端，打到別人反而吃虧。","flip":"你剛好很久沒打到他，這場遇到的機會高，就可以針對。"}],"safe":[{"g":"dep","why":"不會錯，但剩三個人了還排通用位，等於放棄一個明顯能拿的優勢。","flip":"另一家也很強、兩家的威脅方向相反，才排通用的。"},{"g":"ok","why":"不知道打誰的時候，主 C 不要貼邊角、前排擋好，先求不被秒。","flip":"看得出下一場打誰（很久沒遇到的那家），就針對他。"}],"still":[{"g":"bad","why":"你的主 C 就站在會跳後排的那隻對面，等於送給他。十秒夠你換一個位置。","flip":"沒有。"},{"g":"bad","why":"從來不動位置，別人看一眼就知道怎麼針對你。至少主 C 要偶爾換邊。","flip":"你的陣容前排夠厚、主 C 不怕被切，才可以少動。"}]},"pick":["target","safe"],"follow":{"q":"你在倒數五秒把主 C 換到右邊，結果他最後一秒也把那隻牌換到右邊。","opts":[{"label":"下次等到最後兩三秒再換","good":true,"fb":"站位是互相看的。太早換就是告訴對方你要去哪。最後幾秒再動，他來不及跟。"},{"label":"算了，換位置沒用","good":false,"fb":"不是沒用，是換太早。後期一場就是十幾二十滴，站位是最不花錢的變強方式。"}]},"takeaway":"人少的時候針對最強的排；人多的時候排穩的。主 C 不要每場站同一格。"},{"id":"fast9","cat":"level","title":"要不要上 9？","sub":"5-1，你 8 等，60 金。","stats":{"stage":"5-1","level":8,"gold":60,"hp":55},"facts":["升 9 要花一大筆，升完剩不多。","9 等多一個人口，五費也好抽很多。","場上還剩 5 個人。"],"question":"這 60 金，你打算？","varName":"你 8 等的場","vars":[{"label":"主 C、主坦都二星，裝也齊了"},{"label":"主坦還是一星，前排一碰就倒"}],"plans":[{"id":"nine","label":"升 9，放第九隻、找五費"},{"id":"fix8","label":"留在 8 等 D，把缺的補到二星"},{"id":"bank","label":"都不做，繼續存"}],"grid":{"nine":[{"g":"ok","why":"場已經完整了，再 D 也只是小補。升 9 多一隻五費，才是從前四變前二的方法。","flip":"血不到 30，就不要把錢全壓在升等上。"},{"g":"bad","why":"前排是破的，多一隻一星五費補不起來。升完又沒錢 D，會一路輸到出局。","flip":"升 9 之後還能剩 30 金以上 D，才可以考慮。"}],"fix8":[{"g":"dep","why":"已經完整的場再 D，能進步的不多。除非你要追四費三星。","flip":"你差一兩張就四費三星、又沒人搶，那留 8 等 D 很合理。"},{"g":"ok","why":"先把主坦補到二星。前排站得住，你的主 C 才有時間打。這比升 9 急。","flip":"D 了 30 金都沒中，剩下的就留著，不要見底。"}],"bank":[{"g":"bad","why":"第五階段了，錢留著不會變成名次。60 金放在那裡，等於少一隻人口在打。","flip":"再一回合就剛好夠升 9 又能 D，可以多等一回合。"},{"g":"bad","why":"場是破的、錢是滿的，這是最常見的第五名打法。","flip":"沒有。"}]},"pick":["nine","fix8"],"confirm":"站主確認：「8 等場完整就上 9」的門檻，站主會不會加血量條件（例如 40 血以下不上）？目前寫 30。","follow":{"q":"你升了 9，商店出了一隻五費，但跟你的陣容沒有羈絆。","opts":[{"label":"看它單卡強不強、有沒有位置放，強就買來上","good":true,"fb":"五費很多是不靠羈絆、自己就很強的牌。第九個位置放一隻強的五費，常常比湊一個小羈絆好。"},{"label":"沒羈絆就不要","good":false,"fb":"後期不要被羈絆綁住。該看的是這隻上場之後，整場有沒有變強。"}]},"takeaway":"場完整了才上 9。場還是破的，先在 8 等補好。"}]};
  const LK = "choko.learn.v1";
  const lpGet = () => {
    try { const o = JSON.parse(store.get(LK) || "null"); if (o && o.v === 1) { o.play ||= { done: [], last: null }; o.lab ||= { done: [], picks: {} }; o.lab.done ||= []; o.lab.picks ||= {}; return o; } } catch {}
    return { v: 1, play: { done: [], last: null }, lab: { done: [], picks: {} } };
  };
  const lpSet = (o) => store.set(LK, JSON.stringify(o));
  const labList = () => LAB.scenarios.filter((s) => !s.confirm || O.on);
  const labDone = () => { const ids = new Set(lpGet().lab.done); return labList().filter((s) => ids.has(s.id)).length; };
  function clearProgress(label = "清除進度") {
    const b = h("button", { type: "button", class: "lc-clear xs", onclick: () => {
      if (b.dataset.ask) { store.set(LK, JSON.stringify({ v: 1, play: { done: [], last: null }, lab: { done: [], picks: {} } })); LB = null; renderLearnHub(); renderLearnView(); return; }
      b.dataset.ask = "1"; b.textContent = "再按一次確定清除"; setTimeout(() => { if (b.isConnected) { delete b.dataset.ask; b.textContent = label; } }, 4000);
    } }, label);
    return b;
  }
  function ensureLearnV() {
    let v = $("#learnv");
    if (!v) { v = h("article", { id: "learnv", class: "detail block", hidden: true }); ($("#quizv") || $("#detail")).after(v); }
    return v;
  }
  const learnViewOf = (hsh) => (hsh === "learn-route" ? "route" : hsh.startsWith("learn-lab") ? "lab" : null);
  function renderLearnView() {
    const v = ensureLearnV(), hsh = location.hash.slice(1), k = learnViewOf(hsh);
    if (!k || v.hidden) return;
    if (k === "route") drawRouteView(v); else drawLab(v, hsh);
  }
  function renderLearnHub() {
    if (!LAB) return;
    let sec = $("#learn");
    if (!sec) { sec = h("section", { class: "block", id: "learn" }); const pk = $("#picker") || $("#tierlist"); if (pk) pk.after(sec); else $("#home")?.append(sec); }
    const L = labList(), P = lpGet(), nDone = labDone(), best = Math.max(0, ...QZ_MODES.map(([m]) => +(store.get(`choko.quiz.s${SEASON}.${m}`) || 0)));
    const champs = Object.values(CH || {});
    const byName = (zh) => champs.find((c) => c.zh === zh)?.key;
    const face = (key) => (key ? icon("champion", key, "sm") : null);
    const qzFaces = [1, 2, 3].map((c) => champs.find((x) => x.cost === c)?.key).filter(Boolean);
    const card = (cls, href, pic, title, desc, prog, off) => {
      const body = [h("span", { class: "lc-pic", "aria-hidden": "true" }, pic), h("span", { class: "lc-txt" }, h("b", { class: "lc-t" }, title), h("span", { class: "lc-d small" }, desc), prog ? h("span", { class: "lc-p xs" }, prog) : null)];
      return off ? h("div", { class: "lcard off " + cls, "aria-disabled": "true" }, body) : h("a", { class: "lcard " + cls, href, onclick: () => track("learn", cls) }, body);
    };
    const S19note = S19 ? h("p", { class: "xs muted lc-note" }, "觀念每一季都一樣；邊玩邊學、決策實驗室示範用的是 S18 的牌。") : null;
    sec.replaceChildren(
      h("h2", null, tx("learn:title", "新手教學")),
      h("p", { class: "rlead" }, tx("learn:lead", "剛開始玩先看這邊。照順序玩一輪，大概半小時。")),
      h("div", { class: "lcards" },
        card("play", "learn/", [face(byName("鄂爾")), face(byName("剎雅"))], tx("learn:play.t", "邊玩邊學"), tx("learn:play.d", "12 關，直接動手玩。買牌、站位、利息、D 牌一次學會。"), P.play.done.length ? `${P.play.done.length} / 12 關` : null),
        card("lab", "#learn-lab", h("span", { class: "lc-coin" }, "？"), tx("learn:lab.t", "決策實驗室"), tx("learn:lab.d", `${L.length} 個常見狀況，這時候該存錢還是該 D？`), nDone ? `${nDone} / ${L.length} 題` : null),
        card("route", "#learn-route", h("span", { class: "lc-bands" }, [1, 2, 3, 4, 5].map((c) => h("i", { style: `--cc:var(--c${c});width:${30 + c * 12}%` }))), tx("learn:route.t", "定陣路線"),
          routeOk() ? tx("learn:route.d", "從 2-1 開始，什麼裝備走哪一條、幾等定下來。") : "S19 上線後補", null, !routeOk()),
        card("quiz", "#learn-quiz", qzFaces.map((k) => face(k)), tx("learn:quiz.t", "新手認卡"), tx("learn:quiz.d", "這季的棋子幾費、什麼羈絆，用小測驗記起來。"), best ? `最佳 ${best} / 10` : null)),
      h("div", { class: "lc-foot" }, S19note, (nDone || P.play.done.length) ? clearProgress() : null));
    applyDataTx();
  }

  /* ---------- 決策實驗室 ---------- */
  let LB = null, LB_KEYS = false;
  const LAB_G = { ok: "ok", dep: "dep", bad: "bad" };
  function labParse(hsh) {
    const rest = hsh.slice("learn-lab".length);
    if (!rest) return {};
    if (rest[0] !== "-") return { bad: true };
    const s = rest.slice(1), L = labList();
    let q = L.find((x) => x.id === s);
    if (q) return { q };
    const m = s.match(/^(.+)-([A-Za-z0-9]+)-([01])$/);
    if (m) { q = L.find((x) => x.id === m[1]); if (q && q.plans.some((p) => p.id === m[2])) return { q, plan: m[2], v: +m[3] }; }
    return { bad: true };
  }
  function labInit(q, pa, src) {
    const pk = lpGet().lab.picks[q.id];
    if (pa.plan) LB = { src, id: q.id, plan: pa.plan, v: pa.v, seen: new Set(), follow: null };
    else if (pk && q.plans.some((p) => p.id === pk.plan)) LB = { src, id: q.id, plan: pk.plan, v: pk.v ? 1 : 0, follow: pk.follow ?? null, seen: new Set(pk.follow != null ? [0, 1] : []) };
    else LB = { src, id: q.id, plan: null, v: 0, follow: null, seen: new Set() };
  }
  function labSave(q) {
    const P = lpGet();
    P.lab.picks[q.id] = { plan: LB.plan, v: LB.v, follow: LB.follow };
    if (LB.follow != null && !P.lab.done.includes(q.id)) { P.lab.done.push(q.id); track("lab_done", q.id); }
    lpSet(P);
  }
  function drawLab(v, hsh) {
    const pa = labParse(hsh);
    if (pa.bad) { history.replaceState(null, "", location.pathname + location.search + "#learn-lab"); }
    if (!pa.q) { LB = null; drawLabList(v); return; }
    if (!LB || LB.src !== hsh) { labInit(pa.q, pa, hsh); track("lab", pa.q.id); if (pa.plan) track("lab_plan", pa.q.id + "_" + pa.plan); }
    drawLabQ(v, pa.q);
  }
  let LAB_CAT = "all";
  function drawLabList(v) {
    const L = labList(), P = lpGet(), done = new Set(P.lab.done), nDone = labDone();
    const cats = [["all", "全部"], ...Object.entries(LAB.cats)];
    const shown = L.filter((s) => LAB_CAT === "all" || s.cat === LAB_CAT);
    v.replaceChildren(...[
      learnBack(),
      h("div", { class: "lab-headrow" }, h("h2", null, tx("learn:lab.t", "決策實驗室")), h("span", { class: "tag" }, `${nDone} / ${L.length} 題`)),
      h("p", { class: "rlead" }, tx("learn:lab.lead", "同一個狀況，換一個條件，答案就不一樣。每題兩三分鐘。")),
      L.length && nDone >= L.length ? h("div", { class: "ok lab-all" }, h("b", null, `${L.length} 題都看過了。`), " ", h("a", { href: routeOk() ? "#learn-route" : "#learn-quiz" }, routeOk() ? "看定陣路線 →" : "去新手認卡 →")) : null,
      h("div", { class: "tabs lab-cats", role: "group", "aria-label": "分類" }, cats.map(([k, t]) => h("button", { type: "button", "aria-pressed": LAB_CAT === k ? "true" : "false", "aria-selected": LAB_CAT === k ? "true" : "false", onclick: () => { LAB_CAT = k; drawLabList(v); } }, t))),
      h("div", { class: "lab-grid" }, shown.map((s) => h("a", { class: "lab-card" + (done.has(s.id) ? " done" : ""), href: "#learn-lab-" + s.id },
        h("span", { class: "lab-cat tag" }, LAB.cats[s.cat]), s.confirm ? h("span", { class: "tag lab-pend" }, "待確認") : null,
        h("b", { class: "lab-ct" }, s.title), h("span", { class: "small muted" }, s.sub), done.has(s.id) ? h("span", { class: "lab-ck xs", "aria-label": "做過了" }, "✓ 做過了") : null))),
      h("div", { class: "lc-foot" }, nDone ? clearProgress() : null)].filter(Boolean));
  }
  function labShare(q, btn, v) {
    const url = location.origin + location.pathname + location.search + "#learn-lab-" + q.id + (LB.plan ? `-${LB.plan}-${LB.v}` : "");
    const fallback = () => { const i = h("input", { class: "lab-url", readonly: true, value: url, "aria-label": "這題的網址" }); btn.after(i); i.focus(); i.select(); };
    try { navigator.clipboard.writeText(url).then(() => { btn.textContent = "已複製"; setTimeout(() => { btn.textContent = "分享這題"; }, 2000); }, fallback); } catch { fallback(); }
  }
  function drawLabQ(v, q) {
    const L = labList(), idx = L.findIndex((x) => x.id === q.id), cur = LB.plan, P = LAB.labels;
    if (cur) LB.seen.add(LB.v);
    const redraw = (focus) => { labSave(q); drawLabQ(v, q); if (focus) v.querySelector(focus)?.focus({ preventScroll: true }); };
    const st = q.stats, bothSeen = LB.seen.has(0) && LB.seen.has(1);
    const stat = (cls, k, val) => h("div", { class: "lab-st " + cls }, h("span", { class: "lab-sti", "aria-hidden": "true" }), h("span", { class: "lab-stk xs" }, k), h("b", null, val));
    const ev = cur ? q.grid[cur][LB.v] : null;
    const evCard = ev ? h("div", { class: "lab-ev lab-fade g-" + ev.g, role: "status" },
      h("div", { class: "lab-evh" }, h("b", { class: "lab-lv" }, P[ev.g]), q.pick[LB.v] === cur ? h("span", { class: "lab-pick" }, P.pick) : null),
      h("p", { class: "lab-why" }, ev.why), h("p", { class: "lab-flip small" }, h("b", null, P.flip + "："), ev.flip)) : null;
    const allPlans = cur ? h("details", { class: "lab-all3" }, h("summary", null, "三個計畫一起看"),
      h("div", { class: "lab-cols" }, q.plans.map((p) => { const e = q.grid[p.id][LB.v]; return h("div", { class: "lab-col g-" + e.g }, h("b", null, p.label), h("span", { class: "lab-lv xs" }, P[e.g]), h("p", { class: "small" }, e.why)); }))) : null;
    let follow = null;
    if (cur && !bothSeen) follow = h("p", { class: "lab-need small muted" }, "先切到另一個情境看一下，再往下。");
    else if (cur) {
      const f = q.follow;
      follow = h("div", { class: "lab-follow" }, h("h3", null, "追問"), h("p", null, f.q),
        h("div", { class: "lab-opts" }, f.opts.map((o, i) => h("button", { type: "button", class: "lab-opt" + (LB.follow === i ? " on" : ""), disabled: LB.follow != null, onclick: () => { LB.follow = i; redraw(); } }, o.label))),
        LB.follow != null ? h("div", { class: "lab-fbs" }, f.opts.map((o) => h("div", { class: "lab-fb" + (o.good ? " good" : "") }, o.good ? h("span", { class: "lab-pick" }, "站主會這樣做") : null, h("p", { class: "small" }, o.fb)))) : null);
    }
    const next = L[idx + 1];
    const take = LB.follow != null ? h("div", { class: "lab-take" }, h("p", { class: "lab-tk" }, q.takeaway),
      h("div", { class: "lab-act" }, next ? h("a", { class: "btn", href: "#learn-lab-" + next.id }, "下一題 →") : h("a", { class: "btn", href: "#learn-lab" }, "回題目清單"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { LB.plan = null; LB.follow = null; LB.v = 0; LB.seen = new Set(); redraw(); window.scrollTo(0, 0); } }, "再玩一次"))) : null;
    const share = h("button", { type: "button", class: "btn ghost lab-share", onclick: () => labShare(q, share, v) }, "分享這題");
    v.replaceChildren(...[
      h("div", { class: "lab-bar" }, h("a", { class: "back btn ghost", href: "#learn-lab" }, "← 回決策實驗室"), h("span", { class: "small muted" }, `第 ${idx + 1} / ${L.length} 題`), share),
      h("p", null, h("span", { class: "tag" }, LAB.cats[q.cat]), q.confirm ? h("span", { class: "tag lab-pend" }, "待確認") : null),
      h("h2", { class: "lab-title" }, q.title), h("p", { class: "rlead" }, q.sub),
      q.confirm && O.on ? h("p", { class: "notice small lab-confirm" }, h("b", null, "待站主確認："), " ", q.confirm) : null,
      h("div", { class: "lab-stats" }, stat("stage", "回合", st.stage), stat("lvl", "等級", st.level), stat("gold", "金幣", st.gold), stat("hp" + (st.hp <= 40 ? " low" : ""), "血量", st.hp)),
      h("ul", { class: "list lab-facts" }, q.facts.map((x) => h("li", null, x))),
      h("div", { class: "lab-var" }, h("span", { class: "lab-vn small" }, q.varName), h("div", { class: "lab-vb", role: "group", "aria-label": q.varName }, q.vars.map((x, i) => h("button", { type: "button", class: "lab-vbtn", "data-v": i, "aria-pressed": LB.v === i ? "true" : "false", onclick: () => { LB.v = i; redraw(`.lab-vbtn[data-v="${i}"]`); } }, x.label)))),
      h("h3", { class: "lab-q" }, q.question),
      h("div", { class: "lab-plans" }, q.plans.map((p, i) => h("button", { type: "button", class: "lab-plan", "data-p": p.id, "aria-pressed": cur === p.id ? "true" : "false", onclick: () => { if (LB.plan !== p.id && LB.follow != null) LB.follow = null; LB.plan = p.id; track("lab_plan", q.id + "_" + p.id); redraw(`.lab-plan[data-p="${p.id}"]`); } }, h("kbd", null, "ABC"[i]), h("span", null, p.label)))),
      evCard, cur ? h("p", { class: "lab-hint small muted" }, "換一下上面的情境看看 ↑") : null, allPlans, follow, take].filter(Boolean));
    if (!LB_KEYS) {
      LB_KEYS = true;
      addEventListener("keydown", (e) => {
        const vv = $("#learnv"), hs = location.hash.slice(1);
        if (!vv || vv.hidden || !LB || !hs.startsWith("learn-lab-") || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea")) return;
        const qq = labList().find((x) => x.id === LB.id); if (!qq) return;
        if (/^[1-3]$/.test(e.key) && qq.plans[+e.key - 1]) { LB.plan = qq.plans[+e.key - 1].id; labSave(qq); drawLabQ(vv, qq); e.preventDefault(); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { LB.v = e.key === "ArrowLeft" ? 0 : 1; labSave(qq); drawLabQ(vv, qq); e.preventDefault(); }
        else if (e.key === "Enter" && LB.follow != null) { const nx = labList()[labList().findIndex((x) => x.id === LB.id) + 1]; location.hash = nx ? "learn-lab-" + nx.id : "learn-lab"; e.preventDefault(); }
      });
    }
  }

  /* ---------- T 度表 ---------- */
  /* 站主 2026-11-04：均名、前四、吃雞新手看不懂 → 改成「下限」「上限」；11/06：「分五個等級好了，三個有點難判斷」→ 很高／高／中／低／很低 */
  const LVC = { 很高: "vhi", 高: "hi", 中: "mid", 低: "lo", 很低: "vlo" };
  const lvTag = (v) => h("b", { class: "lv lv-" + (LVC[v] || "na") }, v || "—");
  const rangeLine = (c) => {
    const r = c.range || {};
    if (!r.ceil) return h("span", null, c.status === "custom" ? "待補資料" : "研究中");
    return h("span", { class: "rg" }, h("span", { class: "nw" }, "下限 ", lvTag(r.floor)), "｜", h("span", { class: "nw" }, "上限 ", lvTag(r.ceil)), c.freq != null ? ["｜", h("span", { class: "nw" }, `頻率 ${pct(c.freq)}`)] : null);
  };
  const tierLabel = (c) => c.tier ? `${c.tier} 級${D.inference && c.patchImpact?.tierFrom ? "（推測）" : ""}` : "";
  const reqText = (r) => (r || []).map((x) => x.text.replace(/（轉職）$/, "")).join("、");
  // 站主 2026-11-19：「需要轉職的陣容不要用寫字的要用圖」→ 轉職條件畫成徽章圖（S18 指定誰拿的，前面加那隻的頭像）；滑過去／長按看得到原本的文字
  const reqHasEmblem = (r) => (r || []).some((x) => x.type === "emblem" && x.key);
  function reqIcons(r) {
    return (r || []).flatMap((x) => {
      const txt = x.text.replace(/^入場條件：/, "").replace(/（轉職）$/, "");
      if (x.type !== "emblem" || !x.key) return [h("span", { class: "rq-t" }, txt)];
      const holder = Object.keys(CH).filter((k) => txt.startsWith(champName(k))).sort((a, b) => champName(b).length - champName(a).length)[0];
      return [h("span", { class: "rq-i", title: txt, "aria-label": txt }, holder ? icon("champion", holder, "xs") : null, icon("item", x.key, "xs"))];
    });
  }
  const impArrow = (c) => {
    const p = c.patchImpact;
    if (!p || !D.inference) return null;
    const sym = { up: "↑", down: "↓", mixed: "↕" }[p.dir];
    return h("span", { class: "imp " + p.dir, title: `${D.inference.patch}：${p.notes.join("、")}`, "aria-label": `${D.inference.patch} ${p.dir === "up" ? "變強" : p.dir === "down" ? "變弱" : "有加有減"}：${p.notes.join("、")}` }, sym);
  };
  // 轉職分支（站主 2026-11-06：「要有站位圖、上面要裝備、要有上等放甚麼」）：各人口之間加了哪些、拿掉哪些
  function levelUpBox(c) {
    const ups = c.levelUps || [];
    if (!ups.length) return null;
    const nm = (ks) => ks.map(champName).join("、");
    return h("div", { class: "small stack" }, ul(ups.map((u) => [h("b", null, `${u.from} → ${u.to} 人口：`),
      u.add.length ? `放 ${nm(u.add)}` : "棋子不變（升星、補裝）", u.remove.length ? `；拿掉 ${nm(u.remove)}` : ""])),
      h("p", { class: "xs muted" }, "照這些高手對局各人口最常出現的棋子整理；上面的棋盤可以切人口看站位。"));
  }
  // 站主 2026-11-07：「我不是說了這邊不要只有文字要有圖」→ 分支每一行前面放圖：徽章／神器＋拿的英雄頭像（跟加分卡片一樣），來牌分支放那隻英雄
  function variantIcon(v, c) {
    const r = (v.required || [])[0];
    if (!r?.key) return null;
    if (r.type === "champion") return CH[r.key] ? h("span", { class: "bc-ico vl-ico" }, icon("champion", r.key)) : null;
    const hero = (c?.bonus || []).find((b) => b.branch === v.id)?.hero
      || Object.keys(CH).filter((k) => (r.text || "").startsWith(champName(k))).sort((a, b) => champName(b).length - champName(a).length)[0];
    return h("span", { class: "bc-ico vl-ico" }, icon("item", r.key), hero && CH[hero] ? h("span", { class: "bc-hero" }, icon("champion", hero, "sm")) : null);
  }
  function variantLine(v, c) {
    const ico = variantIcon(v, c);
    if (v.kind === "trait") return h("button", { class: "vline" + (ico ? " has-ico" : ""), type: "button", onclick: () => go(v.id) }, ico,
      h("span", { class: "vl-txt" }, h("span", { class: "vk" }, reqText(v.required)), h("span", { class: "vs" }, `看站位和裝備｜${v.games} 場高手對局`)));
    const ready = v.status === "ready";
    return h("button", { class: "vline" + (v.better ? " better" : "") + (ico ? " has-ico" : ""), type: "button", onclick: () => go(v.id) }, ico,
      h("span", { class: "vl-txt" }, h("span", { class: "vk" }, reqText(v.required).replace("持有", "帶")),
        h("span", { class: "vs" }, ready ? rangeLine(v) : "研究中"),
        v.better ? h("span", { class: "tag up" }, "比主陣容強") : null));
  }
  // 分支短名：「卡瑪持有處刑者徽章（轉職）」→「卡瑪處刑者轉」；來牌分支用名稱後半（「雷葛爾疊層」）
  const branchShort = (v) => {
    const r = (v.required || [])[0];
    if (r?.type === "trait") return String(v.name).split(/\s*[·・]\s*/).pop();  // 轉職分支：「武鬥家轉」
    const m = r?.type === "emblem" && /(.+?)持有(.+?)徽章/.exec(r.text);
    return m ? `${m[1]}${m[2]}轉` : String(v.name).split(/\s*[·・]\s*/).pop();
  };
  const branchIcon = (v) => { const r = (v.required || [])[0]; return r?.type === "emblem" || r?.type === "trait" ? icon("item", r.key, "xs") : r?.key && CH[r.key] ? icon("champion", r.key, "xs") : null; };

  // 站主 2026-11-09：「讓我可以改T度表上面的陣容名跟角色圖」→ tiers/ 文件多 name、icon；名字跟著換到全站（分支、公式名稱前面那段也一起換），角色圖用在 T 表和陣容頁
  const compIcon = (c) => O.tiers[c.id]?.icon || c.iconKey || c.carrier;
  function applyOwnerNames() {
    const ren = {};
    for (const [cid, t] of Object.entries(O.tiers || {})) if (t?.name) ren[cid] = t.name;
    for (const c of D.comps) if (c._n0 == null) c._n0 = c.nameOrig || c.name;  // nameOrig＝建置前的原名（建置已經套過站主改的名字）
    const byId = Object.fromEntries(D.comps.map((c) => [c.id, c]));
    for (const c of D.comps) {
      let n = ren[c.id] || c._n0;
      if (!ren[c.id]) {
        const parts = String(c.id).split("__");
        for (let k = parts.length - 1; k >= 1; k--) {
          const pid = parts.slice(0, k).join("__"), p = byId[pid];
          if (p && ren[pid] && c._n0.startsWith(p._n0 + " · ")) { n = ren[pid] + c._n0.slice(p._n0.length); break; }
        }
      }
      c.name = n;
    }
  }
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
  const lvPill = (label, v) => h("b", { class: "lvp lv-" + (LVC[v] || "na") }, `${label} ${v || "—"}`);
  const fmtChg = (v) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(2));
  // 站主 2026-11-08：「你這種按鈕的下面都按不到，你要步那個框框就不要框到下面按不到的部分，要不就下面那邊也做成按的到」
  // → 整張卡片都按得到：主按鈕撐滿卡片高度；分支那行的空白處（不是分支按鈕）也連到這套。站主調 T 表時不動（卡片上有控制項）
  const cardClick = (id) => (O.tmode ? null : (ev) => { if (!ev.target.closest("button, a, select, input, label, textarea")) go(id); });
  function tcard(c, pool) {
    const showReq = c.lane === "conditional" && c.required?.length;
    // 站主 2026-11-04：分支標「名次變動」（和主陣容比），不標評級、不標加強削弱（跟主陣容一樣，多餘）
    const vs = O.tmode ? [] : pool.filter((v) => v.baseOf?.some((b) => b.id === c.id) && !v.hidden && v.tier);
    const req = showReq ? c.required.map((r) => r.text.replace(/^入場條件：/, "").replace(/（轉職）$/, "")).join("、") : "";
    const r = c.range || {};
    const el = h("div", { class: "tc" + (c.custom ? " custom" : "") + (c.hidden ? " hid" : "") + (O.tmode ? "" : " tc-click"), "data-id": c.id, onclick: cardClick(c.id) },
      h("button", { class: "tc-main", type: "button", onclick: () => go(c.id) },
        icon("champion", compIcon(c), "sm"),
        h("span", { class: "tc-txt" },
          h("span", { class: "tc-nm" }, h("span", { class: "nm" }, c.name), impArrow(c),
            c.patchImpact?.tierFrom && D.inference && c.tierSource !== "owner" ? h("span", { class: "was", title: `推測前是 ${c.patchImpact.tierFrom} 級` }, "原" + c.patchImpact.tierFrom) : null,
            c.custom ? h("span", { class: "tag todo" }, "待補資料") : null),
          r.ceil ? h("span", { class: "tc-sub" }, c.watch ? h("b", { class: "tag watch" }, "研究中") : null, lvPill("下限", r.floor), lvPill("上限", r.ceil), c.watch ? h("span", { class: "tag few" }, `樣本少：${c.watch.n} 場`) : c.freq != null ? h("span", { class: "tc-freq" }, `頻率 ${pct(c.freq)}`) : null)
            : c.pbe ? h("span", { class: "tc-sub" }, h("b", { class: "tag pbe" }, "PBE"), h("span", { class: "tc-freq" }, `高手 ${c.pbe.n} 場・均名 ${c.pbe.avg.toFixed(1)}`))
            : c.pred ? h("span", { class: "tc-sub" }, h("b", { class: "tag pred" }, "預測"), c.pred.srcTier ? h("span", { class: "tc-freq" }, `${c.pred.src} ${c.pred.srcTier}`) : null)
            : h("span", { class: "tc-sub" }, c.custom ? "待補資料" : "研究中"),
          showReq ? (reqHasEmblem(c.required) ? h("span", { class: "tc-req rq", title: req }, "需要", reqIcons(c.required.filter((x) => x.type === "emblem"))) : h("span", { class: "tc-req", title: req }, "需要：", req)) : null)),
      vs.length ? h("div", { class: "tc-br" }, h("span", { class: "tc-brh" }, "分支"), vs.sort(cellSort).map((v) => {
        const g = (c.variants || []).find((x) => x.id === v.id)?.avgGain;
        const chg = g == null ? null : -g;
        return h("button", { class: "brc", type: "button", title: `${v.name}（${reqText(v.required)}）：平均名次比主陣容${chg == null ? "—" : chg < 0 ? "前面 " + Math.abs(chg).toFixed(2) + " 名" : "後面 " + chg.toFixed(2) + " 名"}`, onclick: () => go(v.id) },
          branchIcon(v), h("span", { class: "brn" }, branchShort(v)),
          h("span", { class: "brchg " + (chg == null ? "" : chg < 0 ? "good" : chg > 0 ? "bad" : "") }, "名次 ", fmtChg(chg)));
      })) : null,
      O.tmode ? ownerTierCtl(c, pool) : null);
    const cp = tierCopyBtn(c, el); if (cp) el.append(cp);
    return el;
  }
  // 「研究中」卡片：還沒有下限／上限，改列均名、前四率和場數（站主 2026-11-06）
  function wcard(c) {
    const w = c.watch;
    const el = h("div", { class: "tc wc" + (O.tmode ? "" : " tc-click"), "data-id": c.id, onclick: cardClick(c.id) },
      h("button", { class: "tc-main", type: "button", onclick: () => go(c.id) },
        icon("champion", compIcon(c), "sm"),
        h("span", { class: "tc-txt" },
          h("span", { class: "tc-nm" }, h("span", { class: "nm" }, c.name)),
          // T 度表只用下限／上限（站主 11/4）；均名、前四率在詳細頁
          h("span", { class: "tc-sub" }, c.range?.floor ? [lvPill("下限", c.range.floor), lvPill("上限", c.range.ceil)] : null,
            h("span", { class: "tag few" }, `樣本少：${w.n} 場・${w.players} 位`), c.pbe ? h("span", { class: "tc-freq" }, `均名 ${c.pbe.avg.toFixed(1)}`) : null),
          c.lane === "conditional" && c.required?.length ? (reqHasEmblem(c.required) ? h("span", { class: "tc-req rq", title: reqText(c.required) }, "需要", reqIcons(c.required.filter((x) => x.type === "emblem"))) : h("span", { class: "tc-req", title: reqText(c.required) }, "需要：", reqText(c.required))) : null)));
    const cp = tierCopyBtn(c, el); if (cp) el.append(cp);
    return el;
  }
  let TB_LANE = "normal";  // T 度表目前的分頁（站主 2026-11-06：三個分區各自一頁）
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
    // 站主 2026-11-19：「評級怎麼來的不用寫出來在正式站，不就跟s18一樣嗎」→ S19 也不寫評級說明
    else root.append(h("p", { class: "tb-legend small" }, h("b", null, ui("tier.legendHead", "下限與上限：")), ui("tier.legend", "逆風選下限高的，順風選上限高的。"),
      h("span", { class: "lv-scale", "aria-label": "分五級，由好到差" }, ["很高", "高", "中", "低", "很低"].map(lvTag))));
    // 站主 2026-11-06：數據很好但樣本很少的陣容，在 T 度表最下面另開一列「研究中」（站主調 T 表時不顯示）
    const watch = O.tmode ? [] : D.comps.filter((c) => c.watch && !ids.has(c.id) && !c.hidden).map((c) => (c.lane ? c : { ...c, lane: c.conditional ? "conditional" : "normal" }));
    const lanes = LANES.filter((l) => O.tmode || shown.some((c) => c.lane === l.id) || watch.some((c) => c.lane === l.id));
    const rows = ["S", "A", "B", "C"].filter((t) => O.tmode || shown.some((c) => c.tier === t));
    if (O.tmode || shown.some((c) => !c.tier)) rows.push("?");
    if (!shown.length) {
      root.append(h("p", { class: "empty" }, "目前沒有通過樣本門檻的陣容，因此不顯示評級。資料接入並通過檢查後會自動出現。"));
      if (O.tmode) root.append(ownerTierBar());
      return;
    }
    // 站主 2026-11-06：「9等五費跟條件陣容不要放在跟普通的放在一起，每個自己弄個分頁，我電腦一個頁面要能看完全部的陣容」
    // → 三個分區各一個分頁；分頁裡每個評級一列，卡片由左往右照順序排（站主前一句：「不要弄成兩行，看不出從左往右還是從上往下」）。
    // 站主調 T 表時三個分區全部攤開，方便搬來搬去。
    if (!lanes.some((l) => l.id === TB_LANE)) TB_LANE = lanes[0].id;
    const tabs = h("div", { class: "tb-tabs", role: "tablist", "aria-label": "陣容分區" });
    const panels = [];
    for (const l of lanes) {
      const n = shown.filter((c) => c.lane === l.id).length;
      const grid = h("div", { class: "tbx", role: "table", "data-lane": l.id, "aria-label": `${uiStr(`lane.${l.id}`, l.label)} T 度表：每一列是一個評級，由左往右排` });
      for (const t of rows) {
        const cs = shown.filter((c) => c.lane === l.id && (t === "?" ? !c.tier : c.tier === t)).sort(cellSort);
        if (!cs.length && !O.tmode) continue;
        grid.append(h("div", { class: "tb-tier t-" + (t === "?" ? "Q" : t), role: "rowheader" }, t === "?" ? "未分級" : t),
          h("div", { class: "tb-cell", role: "cell", "data-lane": l.id, "data-tier": t }, cs.length ? cs.map((c) => tcard(c, pool)) : h("span", { class: "tb-none", "aria-label": "沒有" }, "—")));
      }
      const ws = watch.filter((c) => c.lane === l.id).sort((a, b) => a.watch.rank - b.watch.rank).slice(0, 4);  // 站主規格：電腦一個畫面看完一個分區 → 研究中每區只列最有希望的 4 套
      if (ws.length) grid.append(h("div", { class: "tb-tier t-R", role: "rowheader", id: "tier-watch-" + l.id }, "研究中"),
        h("div", { class: "tb-cell watch", role: "cell", "data-lane": l.id, "data-tier": "R" }, ws.map(wcard)));
      const panel = h("div", { class: "tb-panel", role: "tabpanel", "data-lane": l.id, id: "tbp-" + l.id },
        O.tmode ? h("h3", { class: "tb-ptitle" }, uiStr(`lane.${l.id}`, l.label)) : null, grid,
        ws.length ? h("details", { class: "tb-watch-note small" }, h("summary", null, h("b", { class: "tag watch" }, "研究中"), " 是什麼？"),
          ui("tier.watch", `數據很好、但樣本還少，還沒正式評級，先列最有希望的幾套給你參考。下限、上限已經往全站平均拉過，場數越少越容易看走眼；點進去看棋盤、裝備和均名。樣本夠了會自動進 T 度表。`)) : null);
      panel.hidden = !O.tmode && l.id !== TB_LANE;
      panels.push(panel);
      tabs.append(h("button", { type: "button", role: "tab", class: "tb-tab", "data-lane": l.id, "aria-controls": "tbp-" + l.id, "aria-selected": l.id === TB_LANE ? "true" : "false",
        onclick: () => {
          TB_LANE = l.id; track("lane", l.id);
          tabs.querySelectorAll(".tb-tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.lane === l.id ? "true" : "false"));
          if (!O.tmode) panels.forEach((p) => { p.hidden = p.dataset.lane !== l.id; });
        } },
        h("span", { class: "tb-tl" }, h("b", null, ui(`lane.${l.id}`, l.label)), h("span", { class: "xs" }, ` ${n + ws.length}`)), h("span", { class: "tb-sub" }, ui(`lane.${l.id}.sub`, l.sub))));
    }
    if (O.tmode) tabs.hidden = true;
    root.append(tabs, ...panels);
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
      h("h4", null, icon("champion", compIcon(c), "sm"), h("a", { href: "#" + slug(c.id) }, c.name), c.tier ? h("span", { class: "tag" }, tierLabel(c)) : c.lane === "highroll" ? h("span", { class: "tag" }, "九等五費") : null, c.conditional ? h("span", { class: "tag cond" }, "") : null),
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
  const rerollTitle = (c, M = c.ownerMain || c.rerollLevel) => `${M} 等盤面（賭${"一二三"[(c.rerollCost || 1) - 1]}費：${M} 等就要有這個盤面）`;
  // 站主 2026-11-06：「這是五等，所以應該是678」→ 主圖 5／6 等時，中間每一等的棋盤也算進來（升等要補一等一等列）
  const levelsOf = (c) => [...new Set([c.ownerMain, c.rerollLevel, ...[6, 7].filter((lv) => c.rerollLevel && lv > c.rerollLevel && c.boards?.["lv" + lv]?.status === "ok"),
    c.variantKind && c.boards?.lv7?.status === "ok" && c.rerollLevel !== 7 ? 7 : null, 8, 9])].filter(Boolean).sort((a, b) => a - b);
  /* ---------- 攻略頁棋盤：只放一張主圖，升等要補的、可以替換的放旁邊（站主 2026-11-04，參考 TFT Academy 的 Flex Units） ---------- */
  // 主圖人口：一費 5、二費 6、三費 7、四費 8（站主指定）；五費主C 放 9；沒有那張棋盤就退回 8／9
  const COST_LV = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 };
  const boardOk = (c, lv) => c.boards?.["lv" + lv]?.status === "ok";
  // 站主 2026-11-13：主圖人口跟著站主放的棋子走（例：賭二費 6 等的主圖拿掉一隻＝5 人口），建置時放在 ownerMain
  function mainLevel(c) {
    if (c.ownerMain && boardOk(c, c.ownerMain)) return c.ownerMain;
    if (c.rerollLevel && boardOk(c, c.rerollLevel)) return c.rerollLevel;
    const want = COST_LV[CH[c.carrier]?.cost];
    if (want && boardOk(c, want)) return want;
    return [8, 9, 7, 6, 5].find((lv) => boardOk(c, lv)) || null;
  }
  const keysOf = (b) => champsOnly(b?.units).map((u) => u.key);
  const msDiff = (a, b) => { const left = [...b]; return a.filter((k) => { const i = left.indexOf(k); if (i < 0) return true; left.splice(i, 1); return false; }); };
  // 同上，但回傳棋子本身（要帶裝備）：a 是棋子陣列，b 是代碼陣列
  const msDiffU = (a, b) => { const left = [...b]; return a.filter((u) => { const i = left.indexOf(u.key); if (i < 0) return true; left.splice(i, 1); return false; }); };
  // 站主 2026-11-09：「正確的意思是放這些都可以」→ 棋盤放的比人口多＝候選：
  // 和低一等的棋盤一樣的棋子＝固定，多出來的＝候選，挑（人口−固定）隻放，放哪隻都可以。低一等也是候選盤就用它的固定棋子比。
  const popU = (us) => champsOnly(us).reduce((n, u) => n + (CH[u.key]?.slots || 1), 0);
  function candOf(boards, L, depth = 0) {
    const b = boards?.["lv" + L];
    if (!b || b.status !== "ok" || depth > 4) return null;
    const cs = champsOnly(b.units);
    if (popU(cs) <= L) return null;
    const lv = Object.keys(boards).map((k) => +k.slice(2)).filter((x) => x < L && boards["lv" + x]?.status === "ok" && champsOnly(boards["lv" + x].units).length).sort((a, b) => b - a)[0];
    if (!lv) return null;
    const base = (candOf(boards, lv, depth + 1)?.fixed || champsOnly(boards["lv" + lv].units)).map((u) => u.key);
    const fixed = [], cands = [];
    for (const u of cs) { const i = base.indexOf(u.key); if (i >= 0) { base.splice(i, 1); fixed.push(u); } else cands.push(u); }
    const pick = L - popU(fixed);
    if (!fixed.length || pick < 1 || pick >= popU(cands)) return null;
    return { fixed, cands, pick, from: lv };
  }
  // 升等路線：主圖往上每一張棋盤和前一張比（只補＝升等要補；有拿掉＝換一組）；比主圖低的棋盤＝那個等級先怎麼放
  // 候選盤（cands）：固定棋子照常比，多出來的另外列「挑幾隻」；下一張棋盤和候選盤的固定棋子比（after＝前一等已經放了其中幾隻）
  function levelSteps(c, M, boards = c.boards) {
    const lvs = Object.keys(boards || {}).map((k) => +k.slice(2)).filter((lv) => boards["lv" + lv]?.status === "ok").sort((a, b) => a - b);
    const out = [];
    let prev = M;
    for (const lv of lvs.filter((x) => x > M)) {
      const pc = candOf(boards, prev), cc = candOf(boards, lv);
      const a = pc ? pc.fixed.map((u) => u.key) : keysOf(boards["lv" + prev]);
      const now = cc ? cc.fixed : champsOnly(boards["lv" + lv]?.units);
      const add = msDiffU(now, a), rem = msDiff(a, now.map((u) => u.key));
      if (cc) out.push({ level: lv, add, rem, cands: cc.cands, pick: cc.pick });
      else if (add.length || rem.length) out.push({ level: lv, add, rem, after: pc ? { level: prev, pick: pc.pick } : null });
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
    // 站主 2026-11-10 截圖「你旁邊的不能改」：「拿掉」的那幾隻、還沒到主圖等級時先放的，站主編輯時也都可以點
    const remRow = (keys, lv) => (ed ? h("span", { class: "fx-minis" }, keys.map((k) => h("button", { type: "button", class: "fx-mini pick" + (isSel({ kind: "rem", lv, key: k }) ? " sel" : ""),
      "aria-pressed": isSel({ kind: "rem", lv, key: k }) ? "true" : "false", title: `${champName(k)}（${lv} 等拿掉；點一下可以放回來）`, onclick: pickOf({ kind: "rem", lv, key: k }) }, icon("champion", k, "xs"), champName(k))))
      : miniRow(keys));
    const remSel = (lv, keys) => keys.map((k) => selBox({ kind: "rem", lv, key: k })).find(Boolean) || null;
    const stepBtns = (lv) => (ed ? [h("button", { class: "chip add fx-add", type: "button", onclick: () => ed.addStep(lv) }, "＋ 加棋子"),
      ed.swapStep ? h("button", { class: "chip add fx-add fx-swap", type: "button", onclick: () => ed.swapStep(lv) }, "⇄ 換棋子") : null] : null);
    if (steps.length || upLvs.length) {
      box.append(h("p", { class: "fx-h" }, "升等要補"));
      for (const s of steps.filter((s) => s.below)) {
        const lv = s.level;
        box.append(h("div", { class: "fx-group" },
          h("div", { class: "fx-gh" }, h("span", { class: "fx-lvtag" }, `${lv} 等`), `還沒到 ${M} 等時先放`),
          h("div", { class: "fx-units" }, s.early.map((u) => fhex(u.key, { badge: lv, items: u.items, onPick: pickOf({ kind: "step", lv, key: u.key }), sel: isSel({ kind: "step", lv, key: u.key }) })), stepBtns(lv)),
          s.later.length ? h("p", { class: "fx-cap" }, `${M} 等時改放 `, s.later.map(champName).join("、")) : null, stepSel(lv, s.early)));
      }
      const ups = steps.filter((s) => !s.below);
      const lvs = [...new Set([...ups.map((s) => s.level), ...upLvs])].sort((a, b) => a - b);
      for (const lv of lvs) {
        const s = ups.find((x) => x.level === lv) || { level: lv, add: [], rem: [] };
        // 站主 2026-11-06：「七等要換棋子你這裡不能選」→ 每一等除了加棋子，也可以把前面的棋子換掉（或只拿掉）
        const addBtn = stepBtns(lv);
        const candBox = s.cands ? h("div", { class: "fx-group fx-cand" },
          h("div", { class: "fx-gh" }, h("span", { class: "fx-lvtag" }, `${lv} 等`), `挑 ${s.pick} 隻放（放哪${s.pick > 1 ? "幾" : ""}隻都可以）`),
          h("div", { class: "fx-units" }, s.cands.map((u) => fhex(u.key, { badge: lv, items: u.items, onPick: pickOf({ kind: "step", lv, key: u.key }), sel: isSel({ kind: "step", lv, key: u.key }) }))),
          stepSel(lv, s.cands)) : null;
        const afterCap = s.after ? h("p", { class: "fx-cap" }, `${s.after.level} 等已經放了其中 ${s.after.pick} 隻，${lv} 等把其他的補上`) : null;
        if (s.cands && !s.add.length && !s.rem.length) {
          box.append(candBox);
          if (ed) box.append(h("div", { class: "fx-units" }, addBtn));
        } else if (!s.rem.length) {
          box.append(h("div", { class: "fx-step" + (ed ? " fx-group" : "") }, h("span", { class: "fx-lvtag" }, `${lv} 等`),
            h("div", { class: "fx-units" }, stepUnits(s, lv), s.add.length || !ed ? null : h("span", { class: "xs muted" }, "（和前一張一樣）"), addBtn), afterCap, stepSel(lv, s.add)));
          if (candBox) box.append(candBox);
        } else {
          box.append(h("div", { class: "fx-group" },
            h("div", { class: "fx-gh" }, h("span", { class: "fx-lvtag" }, `${lv} 等`), "換一組：拿掉", remRow(s.rem, lv)),
            h("div", { class: "fx-units" }, stepUnits(s, lv), addBtn), afterCap, remSel(lv, s.rem) || stepSel(lv, s.add)));
          if (candBox) box.append(candBox);
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
          // 候選盤（站主 2026-11-09「放這些都可以」）：拿掉的全是候選＝候選之外也可以放這幾隻
          const cdx = candOf(boards, lv);
          if (cdx && x.out.every((k) => cdx.cands.some((u) => u.key === k)) && x.in.length <= cdx.pick) {
            box.append(h("div", { class: "fx-group fx-cand" },
              h("div", { class: "fx-gh" }, `候選之外也可以放（佔候選的 ${x.in.length} 個位置）`),
              h("div", { class: "fx-units" }, x.in.map(unitOf)), meta, sel));
            return;
          }
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
    if (ed) box.append(h("p", { class: "xs muted fx-note" }, "站主編輯：點旁邊的頭像可以改裝備或拿掉；點「拿掉」那排的棋子可以放回來；「＋ 加棋子」加在那個等級（更高等級也會一起加；還沒到主圖等級的只改那一等）；「⇄ 換棋子」把那一等場上的棋子換掉或拿掉（更高等級也會一起換）。改完按棋盤下面的「儲存棋盤」。"));
    return box;
  }
  function boardTitle(c, M) {
    if (c.rerollLevel && M === (c.ownerMain || c.rerollLevel)) return rerollTitle(c, M);
    return `${M} 人口站位圖`;
  }
  /* 站主給的公式（站主 2026-11-06：三張盤面「研究這套，把他排在a，很強」）：同一套陣容的幾種盤面，主頁和公式頁的棋盤上方都可以切換 */
  // 站主 2026-11-08：「分支公式那些不一樣的重點是主坦副坦不一樣，你要把圖放上去不要只有字」→ 每個公式放關鍵棋子頭像（主坦／副坦／副C／特色）
  const fmKeys = (f) => (f.keys || []).length ? h("span", { class: "fm-keys" }, f.keys.map((k) => h("span", { class: "fm-key", title: `${k.role}：${champName(k.key)}` },
    icon("champion", k.key, "xs"), h("small", { class: "fm-role" }, k.role)))) : null;
  // 站主 2026-11-08：「讓我能手動添加公式一公式二，並且添加的時候可以複製其他的公式」→ 預覽站資料庫 boards/<陣容>__formulas
  // （{compId: "<陣容>__formulas", of, mainName, formulas: [{id, name}]}）；每個公式的盤面存 boards/<陣容>__fx_<id>，和站主公式頁同一種格式。
  const fxDoc = (cid) => (O.on ? O.boards[cid + "__formulas"] : null);
  const formulasOf = (b) => {
    const built = b?.formulas || [], doc = b && fxDoc(b.id);
    if (!doc) return built;
    const fixed = built.filter((f) => !f.owner).map((f, i) => (i === 0 && doc.mainName ? { ...f, name: doc.mainName } : f));
    const head = fixed.length ? fixed : [{ id: b.id, name: doc.mainName || "公式一", dataMain: true }];
    const all = [...head, ...(doc.formulas || []).map((f) => { const id = `${b.id}__fx_${f.id}`; return { ...(built.find((x) => x.id === id) || {}), id, name: f.name, owner: true }; })];
    // 站主 2026-11-09：「讓我可以調每個公式的順序」→ doc.order＝公式 id 的順序（沒列到的照原本順序排在後面）
    const ord = Array.isArray(doc.order) ? doc.order : [];
    const rank = (f) => { const i = ord.indexOf(f.id); return i < 0 ? 1e3 + all.indexOf(f) : i; };
    return ord.length ? [...all].sort((a, b2) => rank(a) - rank(b2)) : all;
  };
  const formulaOf = (c) => { const b = c.formulaOf ? compById(c.formulaOf) : c; return formulasOf(b).length > 1 ? b : null; };
  function formulaArea(c) {
    const base = formulaOf(c);
    let cur = c.id;
    const info = h("div", { class: "fm-info" }), area = h("div", { class: "fm-board" });
    const draw = () => {
      const f = formulasOf(base).find((x) => x.id === cur) || formulasOf(base)[0];
      const v = compById(f.id);
      const lv = v ? (f.lv && boardOk(v, f.lv) ? f.lv : mainLevel(v)) : null;
      info.textContent = ""; area.textContent = "";
      if (f.note) info.append(h("p", { class: "small fm-note" }, f.note));
      if (f.stats) info.append(h("p", { class: "xs muted fm-st" }, `MetaTFT 大師以上 ${f.games} 場：均名 ${f.stats.avg.toFixed(2)}・前四率 ${pct(f.stats.top4)}${f.games < 30 ? "（場數少，參考就好）" : ""}`));
      area.append((v && lv && boardArea(v, lv)) || h("p", { class: "small muted" }, "這個公式還沒有棋盤。"));
    };
    const chips = h("div", { class: "chips fm-chips", role: "group", "aria-label": "公式" }, formulasOf(base).map((f) => h("button", { type: "button", class: "chip fm-chip", "aria-pressed": f.id === cur ? "true" : "false", "data-fid": f.id,
      onclick: () => { cur = f.id; track("formula", f.id); chips.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x.dataset.fid === cur ? "true" : "false")); draw(); } }, fmKeys(f), h("span", { class: "fm-name" }, f.name))));
    draw();
    return h("div", { class: "fm" }, chips, info, area);
  }
  // 站主編輯時：這頁的編輯器只改這個公式；其他公式到各自的頁面調整
  const formulaLinks = (c) => { const base = formulaOf(c); return h("p", { class: "small fm-links" }, "這套有幾個公式，這裡改的是「", formulasOf(base).find((f) => f.id === c.id)?.name || c.name, "」。其他公式到各自的頁面改：",
    formulasOf(base).filter((f) => f.id !== c.id).map((f, i) => [i ? "、" : "", h("a", { href: "#" + slug(f.id), class: "fm-link" }, fmKeys(f), f.name)])); };
  // 站主加的公式在預覽站馬上出現（還沒重新建置前，用存的盤面做一個公式頁）
  const docBoards = (d) => Object.fromEntries(Object.entries(d || {}).filter(([k, b]) => /^lv\d$/.test(k) && b?.units?.length)
    .map(([k, b]) => [k, { status: "ok", source: "owner", units: b.units.map((u) => ({ ...u, items: u.items || [] })), ...(b.twoMarks ? { twoMarks: true } : {}) }]));
  function ownerFormulaComps() {
    for (const doc of Object.values(O.boards)) {
      const base = doc?.of && D.comps.find((x) => x.id === doc.of && !x.formulaOf);
      if (!base || !String(doc.compId).endsWith("__formulas")) continue;
      for (const f of doc.formulas || []) {
        const id = `${base.id}__fx_${f.id}`;
        let v = D.comps.find((x) => x.id === id);
        if (!v) {
          v = { ...JSON.parse(JSON.stringify(base)), id, status: "variant", variantKind: "formula", formulaOf: base.id, tier: null, tierAuto: null, tierSource: null, rank: 99,
            formulas: undefined, variants: [], baseOf: [], stats: null, statsMeta: { games: 0, players: null, version: base.statsMeta?.version, source: "owner", sourceLabel: "站主" },
            freq: null, range: null, cases: null, caseCount: 0, levelUps: [], flex: null, itemsFrom: base.itemsFrom || base.id, boards: docBoards(O.boards[id]),
            switchTo: [{ id: base.id, when: `湊不到「${f.name}」的棋子，就照${base.name}的其他公式放。` }],
            research: { notes: [`${f.name}：站主在預覽站加的公式（站位、棋子、裝備都是站主放的）。`] } };
          D.comps.push(v);
        }
        v.name = `${base.name} · ${f.name}`;
      }
    }
  }
  const CN_NUM = "一二三四五六七八九十";
  // 站主編輯：這套的公式（加公式、從哪個公式複製、改名、刪掉自己加的）
  function formulaTools(c) {
    const base = c.formulaOf ? compById(c.formulaOf) : c;
    if (!base || O.custom.some((x) => x.id === base.id)) return null;  // 手動陣容另外管
    const fs = formulasOf(base), doc = fxDoc(base.id) || { compId: base.id + "__formulas", of: base.id, formulas: [] };
    const me = fs.find((f) => f.id === c.id) || { id: c.id, name: "公式一", dataMain: true };
    const box = h("div", { class: "card small fx-tools" });
    const msg = h("p", { class: "xs muted", role: "status" });
    const save = async (nd, after) => {
      msg.textContent = "儲存中…";
      try { nd.at = new Date().toISOString(); await O.db.doc("boards/" + base.id + "__formulas").set(nd); O.boards[base.id + "__formulas"] = nd; ownerFormulaComps(); after?.(); rerender(); }
      catch (err) { msg.textContent = "儲存失敗：" + (err?.message || "請再試一次"); }
    };
    const copyDoc = (srcId, id) => {
      const src = compById(srcId), M = src ? mainLevel(src) : null, sv = O.boards[srcId];
      const units = (sv?.["lv" + M]?.units?.length ? sv["lv" + M].units : src?.boards?.["lv" + M]?.units) || [];
      return { compId: id, ...(M && units.length ? { ["lv" + M]: { units: units.map((u) => (u.plant ? { plant: u.plant, star: u.star || 1, pos: u.pos } : { key: u.key, star: u.star || 2, items: (u.items || []).slice(0, 3), pos: u.pos, ...(u.mark ? { mark: true } : {}), ...(u.rider ? { rider: true } : {}) })),
        twoMarks: !!(sv?.["lv" + M] || src?.boards?.["lv" + M] || {}).twoMarks } } : {}), at: new Date().toISOString() };
    };
    const form = () => {
      const name = h("input", { type: "text", class: "fx-name-in", value: `公式${CN_NUM[fs.length ? fs.length : 1] || fs.length + 1}`, "aria-label": "新公式的名稱", maxlength: "40" });
      const from = h("select", { class: "fx-from", "aria-label": "從哪個公式複製" }, [...(fs.length ? fs : [{ id: base.id, name: "公式一（目前的盤面）" }]).map((f) => h("option", { value: f.id }, `複製「${f.name}」`)),
        h("option", { value: "" }, "空白盤面（自己放）")]);
      from.value = c.id;
      const add = async () => {
        const nm = name.value.trim(); if (!nm) { msg.textContent = "先取個名字。"; return; }
        const fid = "o" + Date.now().toString(36), id = `${base.id}__fx_${fid}`;
        msg.textContent = "新增中…";
        try {
          const bd = from.value ? copyDoc(from.value, id) : { compId: id, at: new Date().toISOString() };
          await O.db.doc("boards/" + id).set(bd); O.boards[id] = bd;
          await save({ ...doc, compId: base.id + "__formulas", of: base.id, ...(fs.length ? {} : { mainName: doc.mainName || "公式一" }), formulas: [...(doc.formulas || []), { id: fid, name: nm }] }, () => { location.hash = "#" + slug(id); });
        } catch (err) { msg.textContent = "新增失敗：" + (err?.message || "請再試一次"); }
      };
      return h("div", { class: "fx-form row" }, name, from, h("button", { class: "btn primary", type: "button", onclick: add }, "加上去"),
        h("button", { class: "btn ghost", type: "button", onclick: () => { box.replaceWith(formulaTools(c)); } }, "取消"));
    };
    const rename = () => {
      const inp = h("input", { type: "text", class: "fx-name-in", value: me.name, "aria-label": "公式名稱", maxlength: "40" });
      const ok = () => { const nm = inp.value.trim(); if (!nm) return;
        save(me.owner ? { ...doc, formulas: (doc.formulas || []).map((f) => (`${base.id}__fx_${f.id}` === me.id ? { ...f, name: nm } : f)) } : { ...doc, compId: base.id + "__formulas", of: base.id, mainName: nm }); };
      return h("div", { class: "fx-form row" }, inp, h("button", { class: "btn primary", type: "button", onclick: ok }, "改名"), h("button", { class: "btn ghost", type: "button", onclick: () => { box.replaceWith(formulaTools(c)); } }, "取消"));
    };
    let armed = false;
    const del = async (ev) => {
      if (!armed) { armed = true; ev.currentTarget.textContent = "確定刪掉「" + me.name + "」？再按一次"; return; }
      const fid = me.id.slice(base.id.length + 5);
      await save({ ...doc, formulas: (doc.formulas || []).filter((f) => f.id !== fid) }, async () => {
        try { await O.db.doc("boards/" + me.id).delete(); } catch { /* 盤面留著也不會顯示 */ }
        delete O.boards[me.id]; const i = D.comps.findIndex((x) => x.id === me.id && x.statsMeta?.source === "owner"); if (i >= 0) D.comps.splice(i, 1);
        location.hash = "#" + slug(base.id);
      });
    };
    // 站主 2026-11-09：調公式的順序（▲▼ 排好再按「儲存順序」；只改頁面上公式按鈕的排列）
    const reorder = () => {
      const ids = fs.map((f) => f.id);
      const list = h("ol", { class: "fx-order" });
      const draw = () => {
        list.textContent = "";
        ids.forEach((id, i) => list.append(h("li", { class: "row" }, fmKeys(fs.find((f) => f.id === id)) || null, h("span", { class: "fx-oname" }, fs.find((f) => f.id === id)?.name || id),
          h("button", { class: "btn ghost xs", type: "button", "aria-label": "往前", disabled: i === 0 || null, onclick: () => { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; draw(); } }, "▲"),
          h("button", { class: "btn ghost xs", type: "button", "aria-label": "往後", disabled: i === ids.length - 1 || null, onclick: () => { [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; draw(); } }, "▼"))));
      };
      draw();
      const ok = () => save({ ...doc, compId: base.id + "__formulas", of: base.id, formulas: doc.formulas || [], order: ids }, () => { msg.textContent = "已儲存公式順序。"; });
      return h("div", { class: "fx-form" }, list, h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: ok }, "儲存順序"),
        h("button", { class: "btn ghost", type: "button", onclick: () => { box.replaceWith(formulaTools(c)); } }, "取消")));
    };
    const canName = me.owner || me.id === base.id;
    box.append(h("div", { class: "row fx-btns" },
      h("b", null, fs.length > 1 ? `公式（${fs.length} 個）` : "公式"),
      h("button", { class: "btn", type: "button", onclick: (ev) => { ev.currentTarget.closest(".fx-tools").querySelector(".fx-slot").replaceChildren(form()); } }, "＋ 加公式"),
      fs.length > 1 && canName ? h("button", { class: "btn ghost", type: "button", onclick: (ev) => { ev.currentTarget.closest(".fx-tools").querySelector(".fx-slot").replaceChildren(rename()); } }, "改這個公式的名字") : null,
      fs.length > 1 ? h("button", { class: "btn ghost", type: "button", onclick: (ev) => { ev.currentTarget.closest(".fx-tools").querySelector(".fx-slot").replaceChildren(reorder()); } }, "調整順序") : null,
      me.owner ? h("button", { class: "btn ghost danger", type: "button", onclick: del }, "刪掉這個公式") : null),
      h("div", { class: "fx-slot" }),
      h("p", { class: "xs muted" }, fs.length > 1 ? "加公式時可以複製任何一個公式的盤面，再到新公式的頁面改。" : "這套還沒有公式。加公式後，目前的盤面就是「公式一」，新的是「公式二」，頁面上方可以切換。"), msg);
    return box;
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
  const PLANT = { stonebark: "石皮樹", lifebloom: "生命花", protector: "深林保護者", ins1: "樂器（雨笙／邦哥鼓／沙鈴選一）", ins2: "樂器（鋼鐵鼓／排笛／烏克麗麗選一）" };
  // 站主 11/20「海灘有召喚物可以放，你去好好看有幾個」：S19 海灘流行樂的樂器（佔一格、不算人口）。PBE 戰績（11/17～18 還有記樂器的 1,411 場）：
  // 3 隻＝1 個、5 隻＝2 個、7 隻還是 2 個（7 隻多的是海風）。第一個一定是雨笙／邦哥鼓／沙鈴其中之一，第二個是鋼鐵鼓／排笛／烏克麗麗其中之一，高手三種選得差不多平均。
  const isIns = (u) => /^ins\d$/.test(u?.plant || "");
  const BEACH = "BeachPop";
  const isPlant = (u) => !!u?.plant;
  /* ---------- 遊戲內「戰術規劃」分享碼（站主 2026-11-16：「每個陣容都要能匯出分享碼像是0241f4234363eb41040042143d3ec401TFTSet18」）
     格式：02＋10 格×3 位 16 進位棋子代碼（空格 000）＋TFTSet18。代碼表在 data/wiki.json 的 planner（官方 team_planner_code）。 ---------- */
  const PL = { p: null, d: null };
  const loadPlanner = () => (PL.p ||= loadWiki().then((w) => { PL.done = true; return (PL.d = w?.planner || null); }));  // 代碼表在 wiki.json（預覽站檔案數上限）
  function plannerCode(units) {
    const codes = PL.d?.codes || {};
    const us = champsOnly(units).filter((u) => codes[u.key]);
    // 規劃器最多 10 格：超過時先留有帶裝的、再由高費補滿；代碼裡照費用由低到高排
    const keep = [...us].sort((a, b) => (b.items?.length ? 1 : 0) - (a.items?.length ? 1 : 0) || (CH[b.key]?.cost || 0) - (CH[a.key]?.cost || 0)).slice(0, 10);
    const list = keep.sort((a, b) => (CH[a.key]?.cost || 9) - (CH[b.key]?.cost || 9) || codes[a.key] - codes[b.key]).map((u) => codes[u.key]);
    if (!list.length) return null;
    const missing = champsOnly(units).filter((u) => !codes[u.key]).map((u) => champName(u.key));
    if (us.length > 10) missing.push(`另外 ${us.length - 10} 隻候選（規劃器只放得下 10 隻）`);
    return { code: "02" + [...list, ...Array(10 - list.length).fill(0)].map((n) => n.toString(16).padStart(3, "0")).join("") + PL.d.set, missing };
  }
  async function copyText(text, el) {
    try {
      if (!navigator.clipboard) throw 0;
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500))]);
      return true;
    } catch {
      try {
        const ta = h("textarea", { readonly: true, style: "position:fixed;left:-9999px;top:0;opacity:0" }); ta.value = text; document.body.append(ta);
        ta.select(); ta.setSelectionRange(0, text.length); const ok = document.execCommand("copy"); ta.remove();
        if (el && !el.hidden) { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
        return ok;
      } catch { return false; }
    }
  }
  function plannerRow(units, label, more = []) {
    const row = h("div", { class: "tp-row" });
    const draw = () => {
      row.textContent = "";
      if (S19) {
        const cid = String(label || "").split(":")[0], lvm = /:lv(\d+)/.exec(label || ""), sc = shareCode19(cid);
        if (sc) {
          const codeEl = h("code", { class: "tp-code", title: "遊戲內「戰術規劃」的分享碼" }, sc.code), msg = h("span", { class: "xs tp-msg", role: "status" });
          const btn = h("button", { type: "button", class: "btn tp-copy", onclick: async () => { track("planner", label || "board"); const ok = await copyText(sc.code, codeEl);
            msg.textContent = ok ? "已複製！到遊戲的「戰術規劃」按匯入貼上。" : "瀏覽器不讓複製，請長按／選取上面的代碼複製。"; } }, "📋 複製分享碼");
          codeEl.addEventListener("click", () => btn.click()); codeEl.style.cursor = "pointer";
          row.append(h("div", { class: "tp-line" }, btn, codeEl), msg, sc.auto ? h("p", { class: "xs muted" }, "這組是用站主填過的代碼推算的。") : null);
        } else if (!O.on) row.append(h("p", { class: "xs muted" }, "S19 的分享碼還沒放。"));
        if (O.on && cid) {
          const inp = h("input", { type: "text", class: "tp-in", placeholder: "在遊戲「戰術規劃」排好按匯出，把代碼貼這裡", value: sc?.own ? sc.code : "", spellcheck: "false", autocomplete: "off" });
          const note = h("span", { class: "xs tp-msg", role: "status" });
          const save = async (val) => {
            const key = "code19:" + cid, v = val.trim().replace(/\s+/g, "");
            if (v && !/^0[0-9a-f]{31}/i.test(v)) { note.textContent = "看起來不是戰術規劃的代碼（應該是 02 開頭、後面一串英數字）。"; return; }
            const doc = v ? { key, after: v, before: "", lv: lvm ? +lvm[1] : null, note: "S19 分享碼", at: new Date().toISOString(), where: location.hash || "#home" } : null;
            try { if (doc) await O.db.doc("edits/" + docId(key)).set(doc); else await O.db.doc("edits/" + docId(key)).delete(); O.edits[key] = doc; ownerNotice(doc ? "分享碼已儲存，下次更新正式站會一起上線。" : "分享碼已清掉。"); draw(); }
            catch (err) { note.textContent = "儲存失敗：" + (err?.message || "請再試一次"); }
          };
          inp.addEventListener("paste", () => setTimeout(() => { if (inp.value.trim()) save(inp.value); }, 0));   // 貼上就存，不用再按
          row.append(h("div", { class: "tp-own" }, h("span", { class: "xs" }, "站主：這套的分享碼（貼上就存）"), inp,
            h("button", { type: "button", class: "btn sm", onclick: () => save(inp.value) }, "儲存"), sc?.own ? h("button", { type: "button", class: "btn sm ghost", onclick: () => save("") }, "清掉") : null, note));
        }
        return;
      }
      if (!PL.d) { row.append(h("p", { class: "xs muted" }, PL.done ? "分享碼讀不到，重新整理再試一次。" : "分享碼載入中…")); return; }
      const r = plannerCode(units);
      if (!r) return;
      const codeEl = h("code", { class: "tp-code", title: "遊戲內「戰術規劃」的分享碼" }, r.code);
      const msg = h("span", { class: "xs tp-msg", role: "status" });
      const btn = h("button", { type: "button", class: "btn tp-copy", onclick: async () => {
        track("planner", label || "board");
        const ok = await copyText(r.code, codeEl);
        msg.textContent = ok ? "已複製！到遊戲的「戰術規劃」按匯入貼上。" : "瀏覽器不讓複製，請長按／選取上面的代碼複製。";
      } }, "📋 複製分享碼");
      // 主圖之外，更高人口的棋盤也給分享碼（匯入規劃器多半要完整陣容）
      const extra = more.map(([lv, us]) => [lv, plannerCode(us)]).filter(([, x]) => x && x.code !== r.code);
      codeEl.addEventListener("click", () => btn.click()); codeEl.style.cursor = "pointer";
      row.append(h("div", { class: "tp-line" }, btn, codeEl), msg,
        extra.length ? h("div", { class: "tp-more" }, h("span", { class: "xs muted" }, "其他人口："), extra.map(([lv, x]) => {
          const ce = h("code", { class: "tp-code sm", hidden: true }, x.code);
          return h("button", { type: "button", class: "chip tp-lv", title: x.code, onclick: async () => {
            track("planner", `${label}:lv${lv}`);
            const ok = await copyText(x.code, ce);
            msg.textContent = ok ? `已複製 ${lv} 等的分享碼！到遊戲的「戰術規劃」按匯入貼上。` : `瀏覽器不讓複製，${lv} 等的代碼：${x.code}`;
          } }, `📋 ${lv} 等`, ce);
        })) : "",
        r.missing.length ? h("p", { class: "xs muted" }, `規劃器沒有的單位不放：${r.missing.join("、")}`) : "");
    };
    draw();
    if (!PL.d) loadPlanner().then(draw);
    return row;
  }
  /* ---------- T 表一鍵複製分享碼（站主 2026-11-17：「把陣容複製碼弄到T度表上面讓人可以很方便就使用」；設計 Fable 5.2）
     卡片右邊一條複製鈕（只放圖示），複製「成形盤」＝主圖和 8 等取大的那張，沒有就往下找最近的；分支小按鈕不加、研究中卡片照加；
     S19 沒有官方代碼、站主調 T 表時都不顯示。代碼表 T 表畫完後先預載，載好才露出按鈕（按了才抓檔，Safari 會擋剪貼簿）。 ---------- */
  function tierBoardLv(c) {
    const M = mainLevel(c); if (!M) return null;
    const want = Math.max(M, 8);
    for (let lv = want; lv >= 5; lv--) if (boardOk(c, lv)) return lv;
    for (let lv = want + 1; lv <= 10; lv++) if (boardOk(c, lv)) return lv;
    return null;
  }
  // S19 分享碼（站主 2026-11-19：「弄不出來就讓我有個地方能自己填方便填…我想到順手填一下」）：站主在遊戲裡排好、按匯出貼上的代碼，
  // 存在預覽站資料庫 edits（key code19:<陣容id>），上線時寫進 site-data 的 shareCodes；建置時也用這些代碼反推棋子代碼表（D.planner19）
  const shareCode19 = (cid) => { const e = O.edits?.["code19:" + cid]; if (e === null) return null; if (e && e.after) return { code: e.after, lv: e.lv || null, own: true }; return D.shareCodes?.[cid] || null; };
  const tierCode = (c) => { if (S19) { const sc = shareCode19(c.id); if (sc) return { lv: sc.lv || tierBoardLv(c), code: sc.code }; } const lv = PL.d ? tierBoardLv(c) : null; const r = lv ? plannerCode(c.boards["lv" + lv].units) : null; return r ? { lv, code: r.code } : null; };
  function tpToast(msg, code) {
    let n = $("#tp-toast");
    if (!n) { n = h("div", { id: "tp-toast", class: "tp-toast", role: "status", "aria-live": "polite" }); document.body.append(n); }
    n.textContent = ""; n.append(h("span", null, msg));
    if (code) n.append(h("code", { class: "tp-code" }, code));
    n.classList.toggle("stay", !!code); n.hidden = false;
    clearTimeout(n._t); document.removeEventListener("pointerdown", n._off, true);
    if (!code) { n._t = setTimeout(() => { n.hidden = true; }, 3500); return; }
    // 被擋時代碼要留著讓人慢慢長按複製：點提示框外面才收起來
    n._off = (ev) => { if (!n.contains(ev.target)) { n.hidden = true; document.removeEventListener("pointerdown", n._off, true); } };
    setTimeout(() => document.addEventListener("pointerdown", n._off, true), 0);
    const r = document.createRange(); r.selectNodeContents(n.querySelector("code")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  const CP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const OK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  // 首頁就有 T 表：等瀏覽器閒下來才抓代碼表，不跟首頁搶頻寬
  const idlePlanner = () => (PL.ip ||= new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(() => res(), { timeout: 2500 }) : setTimeout(res, 400))).then(loadPlanner));
  function tierCopyBtn(c, card) {
    if (O.tmode || (PL.d && !tierCode(c))) return null;  // S19 PBE 有官方代碼了（站主 2026-11-19：「分享碼你也要弄在T度表那邊」）  // 代碼表已載好卻算不出代碼（沒有棋盤的待補陣容等）就不放
    const btn = h("button", { type: "button", class: "tc-cp", hidden: true, "aria-label": `複製「${c.name}」的戰術規劃分享碼` });
    btn.innerHTML = CP_SVG;
    const show = () => {
      const r = tierCode(c);
      if (!r) { btn.remove(); return; }  // 按鈕這時已掛在卡片上（代碼表是非同步載入的）
      btn.title = `複製 ${r.lv} 等盤的分享碼，到遊戲「戰術規劃」按匯入貼上`;
      btn.hidden = false; card.classList.add("has-cp");
    };
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      const r = tierCode(c); if (!r) return;
      track("planner", `tier:${c.id}:lv${r.lv}`);
      const ok = await copyText(r.code, null);
      if (ok) {
        btn.innerHTML = OK_SVG; btn.classList.add("done"); clearTimeout(btn._t);
        btn._t = setTimeout(() => { btn.innerHTML = CP_SVG; btn.classList.remove("done"); }, 1500);
        tpToast(`複製好了（${c.name}・${r.lv} 等盤）！進遊戲開「戰術規劃」按匯入貼上。`);
      } else tpToast("瀏覽器擋住複製了，下面這串長按（電腦按 Ctrl+C）複製：", r.code);
    });
    btn.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") ev.stopPropagation(); });
    if (PL.d) show(); else idlePlanner().then(show);
    return btn;
  }
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
    if (S19) { const b = traitN(units, BEACH); return b >= 3 ? (b >= 5 ? ["ins1", "ins2"] : ["ins1"]).map((k) => ({ plant: k, star: 1 })) : []; }
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
  // 站主 2026-11-06：「神木的那些小東西不要用字，遊戲裡面也有圖片」→ 用遊戲內頭像（tools/fetch_plant_icons.py）。
  // 石皮樹和生命花在遊戲資料裡是同一隻單位、同一張頭像，所以兩棵樹左下角留一個小字（石／花）分辨
  const PLANT_IMG = { stonebark: "tree", lifebloom: "tree", protector: "protector" };
  const PLANT_MARK = { stonebark: "石", lifebloom: "花" };
  const plantTile = (u) => isIns(u) ? h("span", { class: "plant ins", "data-tip": PLANT[u.plant], "aria-label": PLANT[u.plant] },
      h("span", { class: "tbg t-gold", "aria-hidden": "true" }, h("span", { class: "tbg-hex" }, traitIco(BEACH, 18))), h("span", { class: "pl-n" }, "樂器" + u.plant.slice(3)))
    : h("span", { class: "plant pic", title: PLANT[u.plant], "aria-label": PLANT[u.plant] },
    h("img", { src: `icons/plants/${PLANT_IMG[u.plant] || "tree"}.webp`, alt: "", onerror: (e) => { e.target.closest(".plant")?.classList.remove("pic"); e.target.src = "icons/traits/Elderwood.png"; } }),
    PLANT_MARK[u.plant] ? h("span", { class: "pl-m", "aria-hidden": "true" }, PLANT_MARK[u.plant]) : null,
    h("span", { class: "pl-n" }, PLANT[u.plant]));
  // 站主 11/20「你弄一個東西要選誰我來選」：S19 心鋼 3 隻選一位本命、5 隻再選第二位（遊戲裡是「偏好選擇器 #1／#2」，強化那隻的技能）。
  // 站主在預覽站選（資料庫 edits 的 bias19:<陣容id>），上線時寫進 site-data 每套的 bias19
  const HS = "Heartsteel";
  const bias19 = (c) => { const e = O.edits?.["bias19:" + c?.id]; if (e === null) return {}; if (e && (e.b1 || e.b2)) return { b1: e.b1 || null, b2: e.b2 || null, own: true }; return c?.bias19 || {}; };
  const biasBadge = (n) => h("span", { class: "bias-b", "data-tip": `心鋼本命${n === 1 ? "一" : "二"}（強化他的技能）`, "aria-label": "心鋼本命" + n }, n === 1 ? "①" : "②");
  function biasRow(c, cs) {
    if (!S19 || !c?.id) return null;
    const n = traitN(cs, HS); if (n < 3) return null;
    const slots = n >= 5 ? 2 : 1;
    const mems = [...new Set(cs.filter((u) => (CH[u.key]?.traits || []).includes(HS) || (u.items || []).some((i) => EM[i]?.trait === HS)).map((u) => u.key))];
    const box = h("div", { class: "bias-row" });
    if (!O.on && !bias19(c).b1 && !bias19(c).b2) return h("p", { class: "small" }, h("b", null, "心鋼本命："), "心鋼 3 隻選一位、5 隻再選第二位，被選到的技能會變強。");
    const paint = () => {
      box.textContent = "";
      const cur = bias19(c);
      box.append(h("span", { class: "small muted" }, "心鋼本命"));
      for (let i = 1; i <= slots; i++) {
        const k = cur["b" + i];
        box.append(h("span", { class: "bias-pick", tabindex: "0", "data-tip": k ? `本命${i === 1 ? "一" : "二"}：${champName(k)}（強化他的技能）` : `心鋼 ${i === 1 ? 3 : 5} 隻可以選一位本命（強化他的技能），站主還沒選` },
          h("b", null, i === 1 ? "①" : "②"), k ? icon("champion", k, "sm") : h("span", { class: "xs muted" }, "未定")));
      }
      if (!(O.on && O.db)) return;
      const save = async (i, k) => {
        const now = bias19(c), nb = { b1: now.b1 || null, b2: now.b2 || null }; nb["b" + i] = k;
        if (nb.b1 && nb.b1 === nb.b2) nb["b" + (i === 1 ? 2 : 1)] = null;   // 同一隻不能兩個都選
        const key = "bias19:" + c.id, empty = !nb.b1 && !nb.b2;
        const doc = empty ? null : { key, b1: nb.b1, b2: nb.b2, before: "", after: `${nb.b1 || ""},${nb.b2 || ""}`, note: "S19 心鋼本命", at: new Date().toISOString(), where: location.hash || "#home" };
        try { if (doc) await O.db.doc("edits/" + docId(key)).set(doc); else await O.db.doc("edits/" + docId(key)).delete(); O.edits[key] = doc; ownerNotice(doc ? "本命已儲存，下次更新正式站會一起上線。" : "本命已清掉。"); rerender(); }
        catch (err) { ownerNotice("儲存失敗：" + (err?.message || "請再試一次")); }
      };
      for (let i = 1; i <= slots; i++) box.append(h("div", { class: "bias-own" }, h("span", { class: "xs" }, `站主：本命${i === 1 ? "一" : "二"}選誰`),
        mems.map((k) => h("button", { type: "button", class: "bias-opt", "aria-pressed": cur["b" + i] === k ? "true" : "false", title: champName(k), onclick: () => save(i, cur["b" + i] === k ? null : k) }, icon("champion", k, "sm"))),
        cur["b" + i] ? h("button", { type: "button", class: "btn sm ghost", onclick: () => save(i, null) }, "清掉") : null));
    };
    paint(); return box;
  }
  function hexInner(u, showMark = true) {
    if (isPlant(u)) return [isIns(u) ? null : starTag(u.star || 1), plantTile(u)];
    return [starTag(u.star), icon("champion", u.key), showMark && u.mark ? markBadge() : null, u.rider ? riderBadge() : null, u.biasN ? biasBadge(u.biasN) : null,
      h("span", { class: "its" }, (u.items || []).map((i) => icon("item", i, "xs")))];
  }
  const plantSummary = (units) => {
    const ps = (units || []).filter(isPlant);
    if (!ps.length) return null;
    const c = {}; for (const p of ps) c[p.plant] = (c[p.plant] || 0) + 1;
    return Object.entries(c).map(([k, n]) => PLANT[k] + (n > 1 ? ` ×${n}` : "")).join("、") + (ps[0].star > 1 ? `（${ps[0].star} 星）` : "");
  };

  // 站主 2026-11-06：「二星還三星你要確定欸」→ 一起算的盤面，另一種星級也常見（≥20%）就寫出來
  const starMixText = (u) => { const o = Object.entries(u.starMix || {}).filter(([k, r]) => +k !== u.star && r >= 0.2).map(([k, r]) => `${k} 星 ${Math.round(r * 100)}%`); return o.length ? `（${o.join("、")}）` : ""; };
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
    const cand = c && pop > level ? candOf(c.boards, level) : null;  // 放的比人口多＝候選（站主 2026-11-09）
    const candKeys = cand ? cand.cands.map((u) => u.key) : [];
    const isCand = (u) => { const i = candKeys.indexOf(u?.key); if (i < 0 || isPlant(u)) return false; candKeys.splice(i, 1); return true; };
    const hasPos = cs.every((u) => Array.isArray(u.pos));
    const all = hasPos ? withPlants(units.map((u) => ({ ...u }))) : cs;
    if (S19 && hasPos && c && traitN(cs, HS) >= 3) { const bb = bias19(c), two = traitN(cs, HS) >= 5; for (const u of all) if (!isPlant(u)) u.biasN = u.key === bb.b1 ? 1 : two && u.key === bb.b2 ? 2 : 0; }
    const traits = {};
    const tcs = cand ? cand.fixed : cs;
    for (const u of tcs) for (const t of CH[u.key]?.traits || []) traits[t] = (traits[t] || 0) + 1;
    for (const u of tcs) for (const it of u.items || []) if (it.endsWith("Emblem")) { const t = it.slice(0, -6); traits[t] = (traits[t] || 0) + 1; }
    const active = activeTraits(traits);
    const marks = cs.filter((u) => u.mark).map((u) => champName(u.key));
    const riders = spryOn(cs) ? cs.filter((u) => u.rider && isSpry(u.key)).map((u) => champName(u.key)) : [];
    const plants = plantSummary(hasPos ? all : plantPlan(cs));  // 沒站位也列出神木植物
    const wrap = h("div", { class: "stack" },
      cand ? h("p", { class: "small" }, `${level} 人口：固定 ${cand.fixed.length} 隻＋虛線框的 ${cand.cands.length} 隻挑 ${cand.pick} 隻放（放哪${cand.pick > 1 ? "幾" : ""}隻都可以）`)
        : h("p", { class: "small" }, `人口 ${pop}／${level}${pop > level ? "（超出，請檢查）" : ""}`),
      h("div", { class: "bd-tr" }, h("span", { class: "small muted" }, cand ? "固定棋子的羈絆" : "啟動羈絆"), active.length ? traitBadges(active) : h("span", { class: "small" }, "—")),
      marks.length ? h("p", { class: "small" }, h("b", null, "首領標記："), marks.join("、")) : null,
      riders.length ? h("p", { class: "small" }, h("b", null, "騎乘者："), riders.join("、"), "（騎上毛茸茸大夥伴）") : null,
      plants ? h("p", { class: "small" }, h("b", null, S19 ? "海灘樂器（佔一格、不算人口）：" : "神木植物："), plants) : null,
      biasRow(c, cs),
      // 戰鬥模擬器（2026-11-11）：把這個站位帶進模擬器
      c?.id && !S19 && c.boards?.["lv" + level] === b ? h("p", { class: "small" }, h("a", { class: "sim-link", href: `sim/#a=comp:${encodeURIComponent(c.id)}:lv${level}` }, "⚔️ 用戰鬥模擬器打打看")) : null,
      plannerRow(cs, c?.id ? `${c.id}:lv${level}` : "board",
        c && c.boards?.["lv" + level] === b ? [5, 6, 7, 8, 9, 10].filter((lv) => lv > level && boardOk(c, lv)).map((lv) => [lv, c.boards["lv" + lv].units]) : []));
    if (hasPos) {
      const grid = h("div", { class: "board", role: "grid", "aria-label": `${level} 人口站位圖，四排七格` });
      for (let r = 0; r < 4; r++) {
        const row = h("div", { class: "brow" + (r % 2 ? " odd" : ""), role: "row" });
        for (let col = 0; col < 7; col++) {
          const u = all.find((x) => x.pos && x.pos[0] === r && x.pos[1] === col);
          const tip = u && !isPlant(u) ? `${champName(u.key)} ${u.star} 星${starMixText(u)}${u.seen != null ? `｜出現 ${Math.round(u.seen * 100)}%` : ""}${(u.items || []).length ? "｜" + u.items.map(itemName).join("、") : ""}` : null;
          const cd = u && isCand(u);
          row.append(h("div", { class: "hex" + (u ? " has" : "") + (isPlant(u) ? " is-plant" : "") + (cd ? " cand" : ""), role: "gridcell", title: tip && (cd ? tip + "｜候選" : tip), "aria-label": tip && (cd ? tip + "｜候選" : tip) }, u ? hexInner(u) : null));
        }
        grid.append(row);
      }
      // 站主 2026-11-06：棋盤下面的棋子清單「蠻多餘的」→ 有站位圖就不列清單；一起算的棋盤只把「星級不一定、不一定會放」的寫成一行
      const unsure = b.basis === "consensus" ? cs.filter((u) => starMixText(u) || (u.seen != null && u.seen < 0.6)).map((u) => `${champName(u.key)}${starMixText(u)}${u.seen != null && u.seen < 0.6 ? `（出現 ${Math.round(u.seen * 100)}%）` : ""}`) : [];
      const stepNote = b.source === "steps" ? (b.basis === "metatft" ? `${level} 等補哪隻是照 MetaTFT 這套在 ${level} 等最常見的場上棋子排的。` : `${level} 等補哪隻是照費用排的（便宜的先補）。`) : "";
      wrap.append(...[h("div", { class: "tablewrap" }, grid), h("p", { class: "xs muted" }, "上方為前排（第一排），下方為後排。",
        b.source === "template" ? "這版高手棋盤樣本還不夠，先放原站的示意盤（主C、副C、主坦掛首選裝備）。" : auto ? "這張是依角色排的示意站位（坦在前排、主C在後排角落），實際依對手調整。" : "", stepNote),
        b.basis === "consensus" ? h("p", { class: "xs muted bd-basis" }, `這張是 MetaTFT 大師以上 ${b.games} 場（${level} 人口）一起算的：依出現率挑棋子、星級取最常見的。`, unsure.length ? `星級不一定或不一定會放：${unsure.join("、")}。` : "") : null].filter(Boolean));
    } else {
      wrap.append(h("p", { class: "xs muted" }, "這份棋盤還沒有站位資料，先列出角色、星級與裝備。"));
      wrap.append(h("div", { class: "unit-list" }, cs.map((u) => h("div", { class: "unit" }, icon("champion", u.key, "sm"),
        h("div", null, h("b", null, champName(u.key)), h("div", { class: "xs muted" }, `${u.star} 星${starMixText(u)}${u.seen != null ? `｜出現 ${Math.round(u.seen * 100)}%` : ""}${u.mark ? "｜首領標記" : ""}${u.rider && spryOn(cs) ? "｜騎乘者" : ""}`), h("div", null, (u.items || []).map((i) => icon("item", i, "xs"))))))));
    }
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
      // 站主 2026-11-09：「標籤不要用文字要用圖」→ 頭像＋角標（劍＝輸出、盾＝坦；角標數字＝第幾隻），輸出在左、坦在右；名字和角色放在滑過提示與讀屏
      const tabOf = (x) => {
        const tank = /坦/.test(x.role), rank = { 主C: 1, 副C: 2, 第二副C: 3, 主坦: 1, 副坦: 2, 第三坦: 3 }[x.role];
        const label = `${champName(x.key)}・${x.role}`;
        return h("button", { type: "button", role: "tab", class: "htab " + (tank ? "tank" : "carry") + (x.role === "可換主C" ? " alt" : ""), title: label, "aria-label": label,
          "aria-selected": x.key === hero.key ? "true" : "false", onclick: () => { st.hero = x.key; st.sel = []; st.msg = ""; draw(); } },
          icon("champion", x.key, "sm"), h("span", { class: "htab-mark", "aria-hidden": "true" }, roleGlyph(tank), rank ? h("b", null, String(rank)) : null));
      };
      const cTabs = heroes.filter((x) => !/坦/.test(x.role)), tTabs = heroes.filter((x) => /坦/.test(x.role));
      area.append(h("div", { class: "tabs hero-tabs", role: "tablist", "aria-label": "持裝英雄（劍＝輸出、盾＝坦）" }, cTabs.map(tabOf),
        cTabs.length && tTabs.length ? h("span", { class: "htab-sep", "aria-hidden": "true" }) : null, tTabs.map(tabOf)));
      // 站主 2026-11-04：裝備的解釋（評價怎麼看、每欄只亮一件）刪掉
      if (hero.simple) {  // S19 預測：只有攻略網的推薦裝，沒有場數
        area.append(h("p", { class: "small muted" }, `${champName(hero.key)}（${hero.role}）的推薦裝（${hero.src === "pbe" ? "PBE 高手實際帶的" : `${hero.src || "攻略網"}，PBE 前預測`}）：`),
          h("div", { class: "irecs" }, h("div", { class: "irec first" }, h("div", { class: "irec-h" }, h("b", null, "推薦")),
            h("div", { class: "irec-i" }, hero.bis.map((k) => h("span", { class: "irec-it" }, icon("item", k, "sm"), h("span", { class: "xs" }, itemName(k))))))));
        return;
      }
      if (hero.itemsOnly) {
        area.append(h("p", { class: "notice small" }, hero.generic ? `${champName(hero.key)}（${hero.role}）在高手對局裡幾乎不拿裝，先列所有${/坦/.test(hero.role) ? "坦" : "輸出"}最常拿的裝備：`
          : `${champName(hero.key)}（${hero.role}）三件套紀錄不夠，先列最常拿的裝備：`),
          h("div", { class: "ilist" }, hero.itemsOnly.map((x) => h("div", { class: "unit" }, icon("item", x.key, "sm"), h("span", null, h("b", null, itemName(x.key)), h("span", { class: "xs muted", style: "display:block" }, `持有率 ${pct(x.rate)}`))))));
        return;
      }
      if (hero.pooled) area.append(h("p", { class: "notice small" }, /坦/.test(hero.role) ? `這套陣容裡${champName(hero.key)}拿三件裝的場數不夠，改用所有陣容裡${champName(hero.key)}當坦的三件套（坦裝和陣容關係較小，可以參考）。`
        : `這套陣容裡${champName(hero.key)}拿三件裝的場數不夠，改用所有陣容裡${champName(hero.key)}當輸出的三件套（可以參考）。`));
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
  let ITEMS19 = null;  // S19：所有陣容的「選裝備看搭配」放在一個檔（預覽站檔案數有上限）
  const loadItems = (cid) => (ITEMS_P[cid] ||= S19 ? (ITEMS19 ||= fetch(dataUrl("items.json")).then((r) => (r.ok ? r.json() : {})).catch(() => ({})))
    .then((all) => all?.[cid] || null) : fetch(dataUrl(`items/${cid}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
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
  const loadCases = () => (CASES_P ||= fetch(dataUrl("cases.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => (CASES = d)));
  /* 加分（站主 2026-11-04：「我說的明明就是這裡要有圖案」）：每一項一張卡，大圖示＋英雄頭像，數字分開排 */
  // 站主 2026-11-06：「你有用的你要在詳情頁那邊給我版面，沒用的就不要列出來」→ 加分裡的轉職每個都有版面（b.branch），
  // 點卡片就在加分下面打開那個轉職的棋盤（站位、裝備、可切人口），也可以點進完整頁面看升等放什麼
  function bonusBox(c) {
    if (!c.bonus?.length) return null;
    const pane = h("div", { class: "bonus-pane" });
    let open = null;
    const show = (b, card) => {
      pane.textContent = "";
      grid.querySelectorAll(".bcard").forEach((x) => x.setAttribute("aria-expanded", x === card && open !== b.branch ? "true" : "false"));
      if (open === b.branch) { open = null; return; }
      open = b.branch;
      const v = compById(b.branch);
      if (!v) return;
      const title = `${b.type === "trait" ? itemName(b.key) : b.text.split("：")[0].replace(/（[^）]*）/g, "")}的版面`;  // type "unit"（S19 古風李星）也走 text
      const more = h("a", { class: "bp-more", href: "#" + slug(v.id) }, "完整頁面（升等放什麼）→");
      // 站主 2026-11-10：「你這個版面也要讓我可以調阿」→ 站主模式打開加分的版面＝直接是棋盤編輯器（人口、站位、星級、裝備，存到這個轉職自己的棋盤）
      if (O.on) { pane.append(h("div", { class: "bp-head" }, h("b", null, title), more), boardEditor(v)); return; }
      // 站主 2026-11-10：「訪客不要是789，頁面就跟一般下面的一樣就行」→ 不放人口切換；跟一般詳細頁的棋盤一樣：主圖＋旁邊「升等要補／可以替換」
      const M = mainLevel(v) || levelsOf(v).filter((lv) => boardOk(v, lv)).at(-1);
      pane.append(h("div", { class: "bp-head" }, h("b", null, title), h("span", { class: "bp-sub" }, boardTitle(v, M)), more),
        boardArea(v, M) || h("p", { class: "small muted" }, "沒有這個人口的棋盤。"));
    };
    const grid = h("div", { class: "bonus-grid" }, c.bonus.map((b) => {
      // 站主 2026-11-04：括號裡的說明多餘；「多一個特性／多一個野性」重複又不直觀 → 直接寫「野性徽章」
      const title = b.type === "trait" ? itemName(b.key) : b.text.split("：")[0].replace(/（[^）]*）/g, "");
      const kind = b.type === "trait" ? null : b.type === "artifact" ? "神器" : b.type === "emblem" ? "轉職" : b.type === "unit" ? "拿到棋子" : "裝備";
      const card = h(b.branch ? "button" : "div", { class: "bcard" + (b.branch ? " has-board" : ""), ...(b.branch ? { type: "button", "aria-expanded": "false", onclick: () => show(b, card) } : {}) },
        h("div", { class: "bc-ico" }, b.type === "unit" ? icon("champion", b.key, "sm") : icon("item", b.key), b.hero && CH[b.hero] ? h("span", { class: "bc-hero" }, icon("champion", b.hero, "sm")) : null),
        h("div", { class: "bc-txt" },
          kind ? h("span", { class: "bc-kind" }, kind) : null,
          h("b", { class: "bc-title" }, title),
          h("span", { class: "bc-meta" }, b.tier ? h("span", { class: "bc-tier t-" + b.tier }, b.tier) : null,
            h("span", { class: "brchg " + (b.chg < -0.05 ? "good" : b.chg > 0.05 ? "bad" : "") }, `名次 ${fmtChg(b.chg)}`),
            b.share != null ? h("span", null, `頻率 ${pct(b.share)}`) : null),
          b.branch ? h("span", { class: "bc-open" }, "看版面 ▾") : null));
      return card;
    }));
    return h("div", { class: "stack" }, grid, pane);
  }
  /* 推薦增幅（站主 2026-11-04：「你明明就能看影片，另一個工作已經有數據了抓進去」）：
     MetaTFT 影片庫的實況錄影逐場辨識增幅，不是別人的評價。名次變動用全站同一套寫法（負的＝比較好）。 */
  const RAR = { "銀": "r-s", "金": "r-g", "稜鏡": "r-p" };
  function augBox(c) {
    const a = c.augPicks, M = D.augPicksMeta || {};
    if (!a || !(a.rows?.length || a.thin)) return null;
    const src = h("p", { class: "xs muted" }, `資料來源：MetaTFT 影片庫 ${M.patch || ""} 期間的高手實況錄影，逐場抓畫面辨識當場選的增幅，共 ${M.games || "—"} 場（其中高手 ${M.proGames || "—"} 場${M.games186 ? `；18.6 有 ${M.games186} 場` : ""}）。`,
      "名次變動＝選了這個增幅的場次，平均名次比這套的平均好多少（高手場次和其他場次各佔一半；場數少的往平均拉回）。多數增幅只有 2～6 場，當參考就好。");
    const from = a.from ? h("p", { class: "small muted" }, `這個分支沒有單獨的資料，下面是主陣容〈${a.from}〉的。`) : null;
    if (!a.rows?.length) {
      const t = a.thin;
      return h("div", { class: "augbox stack" }, from,
        h("p", { class: "small" }, `影片庫裡這套只有 ${t.games} 場（高手 ${t.pro} 場），樣本太少，不列推薦表。`,
          t.best.length ? "目前看起來比較好的：" + t.best.map((b) => `${b.name}（名次 ${fmtChg(-b.score)}，${b.games} 場）`).join("、") + "。" : ""), src);
    }
    // 站主 2026-11-07：「增幅推薦那邊有點太難看懂，詳細的可以作為補充，先做類似這樣讓人一眼就能看懂的推薦」
    // → 上面一排增幅圖（框色＝稀有度、右上角＋幾名、下面場數），下面一行「陷阱」；分階段的詳細表收進折疊
    // 站主 2026-11-08：「增幅可以推薦多一點推12個，表現較差這幾個字改成：陷阱，內容可以多放一點放6個」
    const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(2);
    const tile = (x, bad) => h("div", { class: "ag-tile " + (RAR[x.rarity] || "") + (bad ? " bad" : ""), title: `${x.name}（${x.rarity}，常在 ${x.stage || "—"} 選）：${x.games} 場、高手 ${x.pro} 場，平均第 ${x.avg != null ? x.avg.toFixed(2) : "—"} 名` },
      h("span", { class: "ag-ico" }, x.icon ? h("img", { src: "icons/" + x.icon, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null,
        bad ? null : h("b", { class: "ag-d" }, sgn(x.score))),
      h("span", { class: "ag-nm" }, x.name),
      h("span", { class: "ag-n" }, bad ? [h("b", null, sgn(x.score)), `・${x.games} 場・平均第 ${x.avg.toFixed(1)} 名`] : `${x.games} 場・高手 ${x.pro}`));
    const hd = a.head;
    const quick = h("div", { class: "agq" },
      hd ? h("p", { class: "ag-head small muted" }, `${hd.games} 場｜高手 ${hd.pro} 場｜平均第 ${hd.avg.toFixed(2)} 名｜前四率 ${Math.round(hd.top4 * 100)}%`) : null,
      h("div", { class: "ag-tiles" }, a.rows.slice(0, 12).map((x) => tile(x))),
      a.bad?.length ? h("div", { class: "ag-bad" }, h("b", { class: "ag-badh" }, "陷阱（≥3 場）"), h("div", { class: "ag-tiles" }, a.bad.slice(0, 6).map((x) => tile(x, true)))) : null,
      h("p", { class: "xs muted", style: "margin:0" }, "＋幾＝選了這個增幅的場次，平均名次比這套平均好幾名；框的顏色是稀有度（銀、金、稜鏡）。"));
    // 站主 2026-11-04：「你要做的是要在每個增幅裡面推薦拿甚麼」→ 2-1、3-2、4-2 每一次選增幅，依出現的稀有度各推薦拿什麼
    // 站主 2026-11-07：「銀色應該是在左邊，從左到右是從小到大不是從大到小」
    const TIERS = [["銀", "r-s"], ["金", "r-g"], ["稜鏡", "r-p"]];
    const chip = (x) => h("span", { class: "as-pick", title: `${x.name}：${x.games} 場（高手 ${x.pro} 場），平均第 ${x.avg.toFixed(1)} 名` },
      x.icon ? h("img", { src: "icons/" + x.icon, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null,
      h("span", { class: "as-nm" }, x.name), h("span", { class: "brchg good" }, `名次 ${fmtChg(-x.score)}`), h("span", { class: "xs muted" }, `${x.games} 場`));
    const grid = a.stages ? h("div", { class: "augstage" }, ["2-1", "3-2", "4-2"].map((st) => h("div", { class: "as-row" },
      h("div", { class: "as-st" }, h("b", null, st), h("span", { class: "xs" }, "選增幅")),
      h("div", { class: "as-cells" }, TIERS.map(([t, cls]) => h("div", { class: "as-cell " + cls + ((a.stages[st] || {})[t]?.length ? "" : " empty") },
        h("span", { class: "as-tier" }, `出${t}色時`),
        (a.stages[st] || {})[t]?.length ? h("div", { class: "as-picks" }, a.stages[st][t].map(chip)) : h("span", { class: "xs muted" }, "資料不夠，沒有推薦"))))))) : null;
    return h("div", { class: "augbox stack" }, from, quick,
      grid ? h("details", { class: "augfold" }, h("summary", null, "詳細：每次選增幅（2-1／3-2／4-2）出銀、金、稜鏡時各拿什麼"), grid,
        h("p", { class: "xs muted", style: "margin:.5rem 0 0" }, "每格是那個階段、那種稀有度裡，選了之後平均名次比這套平均好的增幅（最多 3 個，好的排前面）。")) : null,
      h("details", { class: "augfold" }, h("summary", null, `詳細：評分最高的 ${a.rows.length} 個（數字表）`), h("div", { class: "tablewrap" }, h("table", { class: "t aug-t" },
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
  const loadVods = () => (VODS_P ||= fetch(dataUrl("vods.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null));
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
      box.append(h("p", { class: "small" }, `${d.patch ? d.patch + " " : ""}高手用這套打進前四的對局 ${xs.length} 場（${nT || nR ? `有時間軸 ${nT} 場${nR ? `、有重播 ${nR} 場` : ""}排在前面，其他照時間新到舊` : "照時間新到舊"}；同一位高手最多 2 場）。點一場到 MetaTFT，可以看那場的完整紀錄。`));
      box.append(h("div", { class: "cases" }, xs.map((x) => h("a", { class: "case", href: x.url, target: "_blank", rel: "noopener", onclick: () => track("case", c.id) },
        h("div", { class: "case-head" },
          h("span", { class: "plc p" + Math.min(x.placement, 5) }, `第 ${x.placement} 名`),
          h("b", null, x.player), x.score ? h("span", { class: "tag score", title: "那場玩家的積分" }, "分數 " + x.score) : null,
          h("span", { class: "xs muted" }, `${x.region}｜${x.level} 級｜${fmtTime(x.time)?.replace("（台灣時間）", "") || ""}`),
          x.timeline ? h("span", { class: "tag up" }, "有時間軸") : null, x.replay ? (typeof x.replay === "string" ? h("span", { class: "tag up rp-tag", role: "link", tabindex: "0", title: "看這場的實況錄影", onclick: (e) => { e.preventDefault(); e.stopPropagation(); track("case_rp", c.id); window.open(x.replay, "_blank", "noopener"); } }, "▶ 看 RP") : h("span", { class: "tag up" }, "有重播")) : null, x.champ ? h("span", { class: "tag tier" }, x.champ) : null),
        // 站主 2026-11-19：「下面戰機要有羈絆」→ 每場列出那場實際開到的羈絆（S19 用對局資料記的；S18 用棋子＋徽章算）
        (() => { const ts = (x.traits ? x.traits.map(([k, n]) => ({ k, n })) : traitsOf(x.units).filter((t) => t.on)).filter((t) => t.n > 1).slice(0, 10);   // 只有 1 隻就開的小羈絆不列，太雜
          return ts.length ? traitBadges(ts.slice().sort((a, b) => b.n - a.n), { cls: "case-tr", px: 15 }) : null; })(),
        h("div", { class: "case-units" }, x.units.map((u) => h("span", { class: "cu" }, h("span", { class: "stars" }, "★".repeat(u.star)), icon("champion", u.key, "sm"), h("span", { class: "its" }, (u.items || []).map((i) => icon("item", i, "xs"))))))))));
    });
    return box;
  }
  /* 手機：攻略頁的返回鈕跟著畫面，不用滑回最上面 */
  function floatBack(on) {
    $("#float-back")?.remove();
    if (!on) return;
    // 讀者 11/20（手機）：「每次我點進去上面T度表陣容 按返回他都會跳到最下面」→ 是從首頁點進來的就用上一頁回去，回到原本看的位置
    document.body.append(h("a", { id: "float-back", class: "float-back", href: "#comps", "aria-label": "回陣容列表",
      onclick: (e) => { if (HOME_Y != null && history.length > 1) { e.preventDefault(); history.back(); } } }, "← 返回"));
  }

  // 站主 2026-11-06：詳細頁加上均名、前四率、勝率（T 表和卡片維持下限／上限）。數字跟下限、上限同一份主資料（台服優先、美服補），場數照實列出
  function dStats(c, watch) {
    // 研究中（watch）的陣容用評級樣本（全部高手場次）的數字，場數照實寫、標「樣本少」
    const s = watch ? c.watch : c.stats, m = watch ? { games: c.watch.n, players: c.watch.players, version: c.statsMeta?.version } : (c.statsMeta || {});
    if (!s || s.avg == null) return null;
    const tile = (k, label, val, hint) => h("div", { class: "dst", "data-k": k, title: hint }, h("span", { class: "dst-l" }, label), h("b", { class: "dst-v" }, val));
    return h("div", { class: "dstats" },
      h("div", { class: "dst-row" },
        tile("avg", ui("detail.avg", "均名"), s.avg.toFixed(2), "平均名次（1～8 名），越小越好"),
        tile("top4", ui("detail.top4", "前四率"), pct(s.top4), "打進前四名的比例"),
        tile("win", ui("detail.win", "勝率"), pct(s.win), "拿第一名的比例")),
      h("p", { class: "dst-n small muted" }, m.source === "metatft"
        ? `${m.version ? m.version + " " : ""}${m.sourceLabel || "MetaTFT"} ${m.games} 場${c.variantKind ? "" : "（本站高手樣本還不夠，先用這個）"}`
        : m.source === "own-rating"  // 站主 2026-11-08：站主新加的陣容，高手名單自己的場次不夠時用本站抓的對局（含同場對手）
          ? `${m.version ? m.version + " " : ""}${m.sourceLabel} ${m.games} 場${m.players ? `（${m.players} 位）` : ""}（高手名單自己的場次還不夠，先用這個）`
          : `${m.version ? m.version + " " : ""}高手實戰 ${m.games} 場${m.players ? `（${m.players} 位）` : ""}`,
        watch ? "；樣本少，還在研究，參考就好" : m.games < (m.source === "metatft" || m.source === "own-rating" ? 30 : 10) ? "；場數少，參考就好" : "", "。均名越小越好。"));
  }
  // S19 預測陣容：評級理由、來源、還沒有的資料
  function predBox(c) {
    const p = c.pred;
    return h("div", { class: "small stack" },
      p.reason ? h("p", null, h("b", null, c.pbe ? "PBE 前的預測：" : `${c.tier} 級：`), p.reason) : null,
      h("p", { class: "muted" }, Object.values(c.boards || {}).some((b) => b && b.source === "pbe") ? "PBE 前的預測來自 " : (c.itemModel || []).some((m) => m.src === "pbe") ? "棋盤來自 " : "棋盤、裝備來自 ", p.url ? h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.srcName || p.src) : (p.srcName || p.src),
        `（原名「${p.srcComp}」${p.srcTier ? `，評 ${p.srcTier}` : ""}）。${Object.values(c.boards || {}).some((b) => b && b.source === "pbe") ? "棋盤和推薦裝已改成 PBE 高手實戰的樣子。" : (c.itemModel || []).some((m) => m.src === "pbe") ? "推薦裝改用 PBE 高手實際帶的。" : ""}${c.pbe ? "" : "評級是本站審查後的結果。"}`),
      h("p", { class: "muted" }, D.seasonNote?.detail || "增幅、均名、實戰對局等 PBE 開了、有對局之後再補。"));
  }
  // S19 PBE（站主 2026-11-18「抓高手的戰績，PBE只有一般場，然後做成新陣容T度表」）：高手 PBE 實況錄影辨識出的每一場
  function pbeBox(c) {
    const p = c.pbe;
    const gs = [...(p.games || [])].sort((a, b) => a.p - b.p);
    return h("div", { class: "small stack" },
      p.reason ? h("p", null, h("b", null, c.tier ? `${c.tier} 級：` : c.status === "branch" ? "加分版本：" : "研究中："), p.reason) : null,
      p.dist ? h("p", null, h("b", null, "名次分布："), p.dist.map((n, i) => `${i + 1} 名 ${n} 場`).join("・")) : null,
      gs.length && p.dist ? h("p", null, h("b", null, "高手實況錄影")) : null,
      gs.length ? ul(gs.map((g) => [h("b", null, `第 ${g.p} 名`), `　${g.s}${g.rg ? `（${g.rg}）` : ""}`, g.lv ? `・${g.lv} 等` : "",
        g.v ? ["　", h("a", { href: g.v, target: "_blank", rel: "noopener" }, "看錄影")] : null])) : null,
      h("p", { class: "muted" }, D.pbeNote || "PBE 只有一般場，名次和陣容是從高手實況錄影的結算畫面辨識的；裝備圖示太小認不出，推薦裝先沿用預測版。"));
  }
  const compById = (id) => D.comps.find((x) => x.id === id) || (O.on ? (O.custom.find((x) => x.id === id) && customToComp(O.custom.find((x) => x.id === id))) : null);
  function renderDetail(id) {
    const c = compById(id);
    const v = $("#detail"); v.textContent = "";
    if (!c) { v.append(h("p", null, "找不到這套陣容。"), h("a", { href: "#top" }, "回首頁")); return; }
    track("comp", c.id);
    floatBack(true);
    const r = c.range || {};
    const keys = [...new Set([compIcon(c), c.carrier, ...(c.core || [])].filter(Boolean))].slice(0, 3);
    v.append(h("a", { class: "back btn ghost", href: "#comps" }, "← 回陣容列表"),
      h("header", { class: "dhero" },
        c.tier ? h("div", { class: "dtier t-" + c.tier, "aria-label": tierLabel(c) }, c.tier) : null,
        h("div", { class: "dhero-icons" }, keys.map((k, i) => icon("champion", k, i ? "sm" : ""))),
        h("div", { class: "dhero-txt" },
          h("h2", null, c.name),
          c.pbe && !r.ceil && c.status !== "branch" ? h("div", { class: "tc-sub dhero-sub" }, h("b", { class: "tag pbe" }, "PBE"), c.lane === "conditional" ? h("span", { class: "tag cond" }, "") : null, c.lane === "highroll" ? h("span", { class: "tag" }, "九等五費") : null,
            h("span", { class: "small muted" }, `高手 ${c.pbe.n} 場（${c.pbe.players} 位）・均名 ${c.pbe.avg.toFixed(2)}・前四 ${pct(c.pbe.top4)}${c.watch ? "・樣本少，還沒正式評級" : ""}`))
          : c.pred && !r.ceil && !c.stats ? h("div", { class: "tc-sub dhero-sub" }, h("b", { class: "tag pred" }, "預測"), c.lane === "conditional" ? h("span", { class: "tag cond" }, "") : null, c.lane === "highroll" ? h("span", { class: "tag" }, "九等五費") : null,
            c.pred.srcTier ? h("span", { class: "small muted" }, `${c.pred.src} 評 ${c.pred.srcTier}`) : null)
          : c.status === "ready" ? h("div", { class: "tc-sub dhero-sub" }, r.ceil ? [lvPill("下限", r.floor), lvPill("上限", r.ceil)] : null, c.freq != null ? h("span", { class: "tc-freq" }, `頻率 ${pct(c.freq)}`) : null,
            c.conditional || c.lane === "conditional" ? h("span", { class: "tag cond" }, "") : null, c.lane === "highroll" ? h("span", { class: "tag" }, "九等五費") : null,
            D.inference && c.patchImpact?.tierFrom ? h("span", { class: "was" }, `推測（原 ${c.patchImpact.tierFrom}）`) : null)
            : c.variantKind === "trait" ? h("div", { class: "tc-sub dhero-sub" }, h("b", { class: "tag watch" }, "轉職分支"), h("span", { class: "small muted" }, `${c.statsMeta?.games || 0} 場高手對局整理，只放站位、裝備和升等，不評級`))
            : c.variantKind === "formula" ? h("div", { class: "tc-sub dhero-sub" }, h("b", { class: "tag watch" }, "公式"), h("span", { class: "small muted" }, "站主給的盤面，不另外評級；評級看"), h("a", { class: "small", href: "#" + slug(c.formulaOf) }, nameOf(c.formulaOf)))
            : c.watch ? h("div", { class: "tc-sub dhero-sub" }, h("b", { class: "tag watch" }, "研究中"), r.ceil ? [lvPill("下限", r.floor), lvPill("上限", r.ceil)] : null, h("span", { class: "small muted" }, "數據很好、樣本還少，還沒正式評級"))
            : c.status === "branch" && c.branchOf ? h("div", { class: "tc-sub dhero-sub" }, h("b", { class: "tag watch" }, "加分版面"), h("span", { class: "small muted" }, "不另外評級；評級看"), h("a", { class: "small", href: "#" + slug(c.branchOf) }, nameOf(c.branchOf)))
            : h("div", { class: "small muted" }, c.status === "custom" ? "站主新增，待補資料" : "研究中，尚無合資格數據"),
          c.lane === "conditional" && reqHasEmblem(c.required) && c.status !== "branch" ? h("div", { class: "dreq" }, h("b", null, "需要"), reqIcons(c.required.filter((x) => x.type === "emblem")), h("span", { class: "small muted" }, reqText(c.required))) : null,
          c.status === "ready" || c.status === "branch" || c.variantKind === "formula" ? dStats(c) : c.watch ? dStats(c, true) : null)));
    if (c.status === "custom") {
      v.append(h("div", { class: "notice", style: "margin-top:16px" }, h("b", null, "站主手動加的陣容"),
        h("p", { class: "small", style: "margin:4px 0 0" }, "Claude 下次更新時會去查高手對局的數據，補上棋盤、裝備和攻略；補完才會放到正式站。")),
        h("div", { class: "row", style: "margin-top:12px" }, (c.units || []).map((k) => h("span", { class: "unit" }, icon("champion", k, "sm"), champName(k), k === c.carrier ? "（主C）" : ""))),
        c.ownerNote ? h("p", { class: "small" }, h("b", null, "站主說明："), c.ownerNote) : null);
      return;
    }
    // 轉職分支（站主 2026-11-06）照常顯示棋盤、裝備、升等；其他沒評級的陣容維持研究中說明
    // 站主 2026-11-06：研究中的陣容「直接給棋盤跟裝備」→ 有棋盤或推薦裝就照常顯示，連一個都沒有才放研究中說明
    const hasBody = levelsOf(c).some((lv) => boardOk(c, lv)) || [7, 6, 5].some((lv) => boardOk(c, lv)) || (c.itemModel || []).length;
    if (c.status !== "ready" && !c.variantKind && !hasBody) {
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
      ...(c.pbe ? [["PBE 高手戰績", "PBE戰績", pbeBox(c)]] : []),
      ...(c.pred && !c.pbe ? [["S19 預測說明", "說明", predBox(c)]] : []),  // 站主 11/19：要跟 S18 一樣，有 PBE 戰績的就不放預測說明
      ["加分（拿到會更強）", "加分", bonusBox(c)],
      ["一句話選陣", "一句話選陣", c.oneLiner ? h("p", null, tx(`comp:${c.id}:oneLiner`, c.oneLiner)) : null],
      ["不順時轉哪套", "轉哪套", switchBox(c)],
      ["分支（拿到轉職或特定來牌時）", "分支", c.variants?.some((v) => v.status === "ready") ? h("div", { class: "small stack" },
        h("div", { class: "vlist" }, c.variants.filter((v) => v.status === "ready").map((v) => variantLine(v, c)))) : null],
      ["和主陣容比較", "和主陣容比較", c.baseOf?.length && !c.variantKind ? h("div", { class: "small stack" },
        h("p", null, "這個分支：", rangeLine(c)),
        ul(c.baseOf.map((b) => [h("a", { href: "#" + slug(b.id) }, b.name), "（主陣容）：", b.status === "ready" ? rangeLine(b) : "研究中"]))) : null],
      ...(O.on ? [[`${boardTitle(c, mainLevel(c) || 8)}（站主編輯：站位、星級、裝備）`, "棋盤", h("div", { class: "stack" }, formulaOf(c) ? formulaLinks(c) : null, c.variantKind && c.variantKind !== "formula" ? null : formulaTools(c), boardEditor(c))]]
        : [formulaOf(c) ? [`站位圖（${formulasOf(formulaOf(c)).length} 個公式，點上面切換）`, "棋盤", formulaArea(c)]
          : mainLevel(c) ? [boardTitle(c, mainLevel(c)), "棋盤", boardArea(c, mainLevel(c))] : null]),
      ["升等放什麼（各人口的棋子）", "升等", levelUpBox(c)],
      ["前排替換", "前排替換", c.roles?.swap ? h("p", { class: "small" }, tx(`comp:${c.id}:roles.swap`, c.roles.swap)) : null],
      ["星級要求", "星級", ul((c.stars || []).map((s) => `${champName(s.key)}：${s.need}${s.note ? "（" + s.note + "）" : ""}`))],
      ["裝備（一般、神器、光明／特殊同區）", "裝備", itemArea(c.itemsFrom ? compById(c.itemsFrom) || c : c)],
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
      parts.map(([t, short], i) => {
        // 站主 2026-11-07：「目錄裡面裝備很常用到，看可不可以把她弄得明顯或是特別一點」→ 裝備那顆放主C第一件推薦裝的小圖、用主色框起來
        const key = short === "裝備";
        const ic = c.itemsFrom ? compById(c.itemsFrom) || c : c;
        const it = key ? (ic.items?.top?.[0]?.key || (ic.itemModel || []).find((x) => x.role === "主C")?.builds?.[0]?.items?.[0] || (ic.itemModel || [])[0]?.bis?.[0]) : null;  // 主C持有率最高的那件（三件組合是照字母排，第一件不一定最重要）
        return h("button", { type: "button", class: "tocb" + (key ? " tocb-key" : ""), "data-sec": "sec-" + i, onclick: () => { track("toc", short); document.getElementById("sec-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" }); } },
          key && it ? icon("item", it, "xs") : null, short);
      }));
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
  const WK = { d: null, p: null, tab: S19 ? "units" : "items", sel: [], q: "", aq: "", tier: "all", open: null, uq: "", uopen: null, topen: null };
  const loadWiki = () => (WK.p ||= fetch(dataUrl("wiki.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => (WK.d = d)));
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
      listBox.append(h("p", { class: "small muted wk-count" }, `共 ${xs.length} 個（只列 ${D.patch?.patch || "這個版本"} 會出現的增幅）`));
      listBox.append(h("ul", { class: "wk-augs" }, xs.map((a) => h("li", { class: "wk-aug" },
        augIcon(a, d.sprite),
        h("div", null,
          h("p", { class: "wk-an" }, h("b", null, a.name), h("span", { class: "tag wk-t t" + (a.tier || 0) }, TIER_LB[a.tier] || "特性／其他"), a.temp ? h("span", { class: "tag", title: "官方還沒翻成中文，先用本站翻的" }, "暫譯") : null),
          h("p", { class: "wk-ad small" }, a.desc),
          a.for?.length ? h("p", { class: "xs wk-for" }, h("span", { class: "muted" }, "高手實況推薦："), a.for.map((u, i) => [i ? "、" : "", h("a", { href: "#" + slug(u.c) }, nameOf(u.c)), `（${u.s}）`])) : null)))));
      if (!xs.length) listBox.append(h("p", { class: "empty small" }, "找不到符合的增幅。"));
    }
    q.addEventListener("input", () => { WK.aq = q.value.trim(); drawList(); });
    drawList();
    box.append(chips, q, listBox);
    return box;
  }
  /* 棋子／羈絆（站主 2026-11-16：「小百科要再新增羈絆跟特性等等的說明還有所有的棋子的血量攻擊力等細節」） */
  const KIND_LB = { origin: "起源", class: "職業", unique: "獨特" };
  const trName = (k) => { const t = (WK.d?.traits || []).find((x) => x.key === k); return t ? t.zh : traitName(k); };
  const starVals = (xs) => (xs?.length ? xs.map((v) => (Math.round(v * 10) / 10).toString()).join(" / ") : null);
  // S19 解鎖條件（站主 2026-11-17：「s19小百科沒有寫解鎖條件」）：要解鎖的棋子格子上有鎖頭，點開寫條件；資料是 wiki.json 的 unit.unlock（build_s19 從試煉的 unlocks.json 併進來）
  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const lockIco = (cls) => { const e = h("span", { class: cls }); e.innerHTML = LOCK_SVG; return e; };
  const hasUnlocks = () => (WK.d?.units || []).some((u) => u.unlock);
  function wkUnlock(u) {
    if (u.unlock) return h("div", { class: "wk-unlock" },
      h("p", null, lockIco("wk-lk"), h("b", null, "解鎖條件："), u.unlock.text, u.unlock.temp ? h("span", { class: "tag unv" }, "暫譯") : null),
      h("p", { class: "xs muted" }, "要先達成這個條件才拿得到這隻。"),
      u.unlock.note ? h("p", { class: "xs muted" }, u.unlock.note) : null);
    return hasUnlocks() ? h("p", { class: "small muted wk-unlock-free" }, "不用解鎖，一開始就抽得到。") : null;
  }
  function wkUnitDetail(u) {
    const later = "PBE 後補";
    const row = (l, v) => h("div", { class: "wk-st" }, h("span", { class: "wk-stl" }, l), h("b", null, v ?? later));
    return h("div", { class: "wk-detail wk-udetail", role: "region", "aria-label": u.zh },
      h("div", { class: "wk-dh" }, icon("champion", u.key, "md"), h("div", null,
        h("b", null, u.zh), u.nameStatus === "temp" ? h("span", { class: "tag unv" }, "暫譯") : null,
        h("p", { class: "small muted" }, `${u.cost} 費`, u.role ? `・${u.role}` : "", u.dmg ? `・${u.dmg}傷害` : ""),
        h("p", { class: "wk-utr tbgs" }, (u.traits || []).map((t) => traitBadge(t, null, { tag: "button", tip: trName(t) + "（點了看說明）", onclick: () => { FTIP.hide(); WK.tab = "traits"; WK.topen = t; drawWiki(); } }))))),
      wkUnlock(u),
      h("div", { class: "wk-stats" },
        row("生命（1/2/3 星）", starVals(u.hp)), row("物攻（1/2/3 星）", starVals(u.ad)), row("攻速", u.as != null ? String(u.as) : null),
        row("護甲", u.armor != null ? String(u.armor) : null), row("魔抗", u.mr != null ? String(u.mr) : null),
        row("射程", u.range != null ? `${u.range} 格` : null), row("法力（起始／上限）", u.mana?.length === 2 ? `${u.mana[0]} / ${u.mana[1]}` : null)),
      u.ability?.name || u.ability?.desc ? h("div", { class: "wk-abil" }, h("p", null, h("b", null, "技能："), u.ability.name || ""), h("p", { class: "small wk-pre" }, u.ability.desc || "")) : null);
  }
  function wkUnits() {
    const d = WK.d, box = h("div", { class: "wk-units" });
    const q = h("input", { type: "search", class: "wk-q", placeholder: "搜尋棋子或羈絆名稱", "aria-label": "搜尋棋子", value: WK.uq });
    const list = h("div");
    const draw = () => {
      list.textContent = "";
      const term = WK.uq;
      const xs = (d.units || []).filter((u) => !term || u.zh.includes(term) || (u.en || "").toLowerCase().includes(term.toLowerCase()) || (u.traits || []).some((t) => trName(t).includes(term)));
      const costs = [...new Set(xs.map((u) => u.cost))].sort((a, b) => a - b);
      for (const cost of costs) {
        const us = xs.filter((u) => u.cost === cost);
        const open = us.find((u) => u.key === WK.uopen);
        list.append(h("div", { class: "wk-group" }, h("h3", null, `${cost} 費`, h("span", { class: "wk-n" }, String(us.length))),
          h("div", { class: "wk-grid wk-ugrid" }, us.map((u) => h("button", { type: "button", class: "wk-it" + (WK.uopen === u.key ? " on" : "") + (u.unlock ? " locked" : ""), "aria-expanded": WK.uopen === u.key ? "true" : "false",
            onclick: () => { WK.uopen = WK.uopen === u.key ? null : u.key; track("wiki_unit", u.key); draw(); } },
            icon("champion", u.key, "sm"), h("span", { class: "nm" }, u.zh, u.unlock ? h("span", { class: "sr-only" }, "（要解鎖）") : null), u.unlock ? lockIco("wk-lockb") : null))),
          open ? wkUnitDetail(open) : null));
      }
      if (!xs.length) list.append(h("p", { class: "empty small" }, "找不到符合的棋子。"));
      const el = WK.uopen && list.querySelector(".wk-udetail");
      if (el && WK.scrollTo) { WK.scrollTo = false; requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" })); }
    };
    q.addEventListener("input", () => { WK.uq = q.value.trim(); draw(); });
    draw();
    box.append(d.units?.some((u) => u.hp?.length) ? h("p", { class: "small muted" }, d.starNote || "") : h("p", { class: "notice small" }, d.statsNote || "血量、物攻等基礎數值 PBE 開了才會公布，到時候補上。"),
      hasUnlocks() ? h("p", { class: "small wk-unlock-legend" }, lockIco("wk-lk"), `有鎖頭的 ${d.units.filter((u) => u.unlock).length} 隻要先達成解鎖條件才拿得到，點棋子看條件。`) : null, q, list);
    return box;
  }
  function wkTraits() {
    const d = WK.d, box = h("div", { class: "wk-traits" });
    for (const kind of ["origin", "class", "unique"]) {
      const ts = (d.traits || []).filter((t) => (t.kind || "origin") === kind);
      if (!ts.length) continue;
      box.append(h("div", { class: "wk-group" }, h("h3", null, KIND_LB[kind], h("span", { class: "wk-n" }, String(ts.length))),
        h("div", { class: "wk-tlist" }, ts.map((t) => h("div", { class: "wk-tr" + (WK.topen === t.key ? " on" : ""), id: "wk-t-" + t.key.replace(/[^A-Za-z0-9-]/g, "") },
          h("div", { class: "wk-trh" }, h("span", { class: "tbg t-plain", "aria-hidden": "true" }, h("span", { class: "tbg-hex" }, traitIco(t.key, 18) || h("i", { class: "tbg-txt" }, t.zh.slice(0, 1)))), h("b", null, t.zh), t.nameStatus === "temp" ? h("span", { class: "tag unv" }, "暫譯") : null,
            t.en && t.en !== t.zh ? h("span", { class: "xs muted" }, t.en) : null,
            h("span", { class: "wk-bps" }, (t.breakpoints || []).map((n) => h("span", { class: "wk-bp" }, String(n))))),
          t.desc ? h("p", { class: "small wk-pre" }, t.desc) : null,
          t.levels?.length ? h("ul", { class: "wk-lv small" }, t.levels.filter((l) => l.text).map((l) => h("li", null, l.n != null ? h("b", { class: "wk-bp" }, String(l.n)) : null, h("span", { class: "wk-pre" }, l.text)))) : null,
          h("div", { class: "wk-mem" }, (t.units || []).map((k) => h("button", { type: "button", class: "wk-memb", title: champName(k), "aria-label": champName(k),
            onclick: () => { WK.tab = "units"; WK.uopen = k; WK.uq = ""; WK.scrollTo = true; drawWiki(); } }, icon("champion", k, "xs")))))))));
    }
    if (WK.topen) requestAnimationFrame(() => { document.getElementById("wk-t-" + WK.topen.replace(/[^A-Za-z0-9-]/g, ""))?.scrollIntoView({ block: "nearest" }); WK.topen = null; });
    return box;
  }
  // 站主 2026-11-09：「小百科裡面幫我放甚麼時候更新新版本，要用台灣時間來算」
  // 官方時間表是美西日期；台服在美西更新日的隔天（台灣時間）上線。現在／下一版用台灣今天的日期判斷，不用等重建網站。
  function wkSchedule(sc) {
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const ps = sc.patches;
    const cur = [...ps].reverse().find((x) => x.tw <= today);
    const nexts = ps.filter((x) => x.tw > today);
    const nx = nexts[0];
    const days = nx ? Math.round((Date.parse(nx.tw) - Date.parse(today)) / 864e5) : null;
    const seenTxt = (x) => x?.seen ? `（台服 ${+x.seen.slice(5, 7)}/${+x.seen.slice(8, 10)} ${x.seen.slice(11, 16)} 就有人在打新版本）` : "";
    return h("div", { class: "wk-sched" },
      h("h3", null, "版本更新時間（台灣時間）"),
      nx ? h("p", { class: "wk-next" }, h("b", null, `下一版 ${nx.patch}：${nx.twLabel}`), days === 0 ? "　今天" : `　還有 ${days} 天`, nx.note ? h("span", { class: "tag" }, nx.note) : null)
        : h("p", { class: "wk-next" }, "官方還沒公布下一個版本的日期。"),
      cur ? h("p", { class: "small" }, `現在：${cur.patch}，${cur.twLabel}上線${seenTxt(cur)}`) : null,
      nexts.length > 1 ? h("ul", { class: "wk-later small" }, nexts.slice(1).map((x) => h("li", null, `${x.patch}：${x.twLabel}`, x.note ? `　${x.note}` : ""))) : null,
      h("p", { class: "xs muted" }, `官方時間表用美國西岸日期（例：${(nx || cur).patch} 是美西 ${(nx || cur).ptLabel}），台服是隔天（台灣時間）維護後上線；官方延期會在 48 小時內公告。`,
        sc.source ? h("a", { href: sc.source.split(" ").pop(), target: "_blank", rel: "noopener" }, "官方時間表") : null));
  }
  function drawWiki() {
    const sec = $("#wiki-sec"); if (!sec) return;
    const body = sec.querySelector(".wk-body"); body.textContent = "";
    if (!WK.d) { body.append(h("p", { class: "small muted" }, WK.p ? "載入中…" : "小百科資料讀不到。")); return; }
    const tabs = [WK.d.units?.length ? ["units", `棋子 ${WK.d.units.length}`] : null, WK.d.traits?.length ? ["traits", `羈絆 ${WK.d.traits.length}`] : null,
      ["items", `裝備 ${WK.d.groups.reduce((n, g) => n + g.items.length, 0)}`], WK.d.augments?.length ? ["augs", `增幅 ${WK.d.augments.length}`] : null].filter(Boolean);
    if (!tabs.some(([k]) => k === WK.tab)) WK.tab = tabs[0][0];
    if (WK.d.schedule?.patches?.length) body.append(wkSchedule(WK.d.schedule));
    body.append(h("div", { class: "tabs wk-tabs", role: "tablist", "aria-label": "小百科分類" }, tabs.map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": WK.tab === k ? "true" : "false",
      onclick: () => { WK.tab = k; track("wiki_tab", k); drawWiki(); } }, l))),
      h("div", { role: "tabpanel" }, WK.tab === "items" ? wkItems() : WK.tab === "units" ? wkUnits() : WK.tab === "traits" ? wkTraits() : wkAugs()),
      h("p", { class: "xs muted wk-src" }, `資料來源：${WK.tab === "units" || WK.tab === "traits" ? (WK.d.codexSource || WK.d.source) : WK.d.source}。${S19 ? "" : "「首選組合」「高手實況推薦」是本站的陣容資料。"}`));
  }
  function renderWiki() {
    let sec = $("#wiki-sec");
    if (!sec) {
      sec = h("section", { class: "block", id: "wiki-sec" }, h("h2", null, "小百科"),
        h("p", { class: "rlead" }, S19 ? "S19 所有的棋子（技能、數值）、羈絆說明、裝備和增幅，數字對過 PBE 現在的版本。名稱照 PBE 官方繁中，官方還沒翻的先用暫譯。" : "這版所有的棋子（血量、物攻、技能）、羈絆說明、裝備和增幅。裝備滑上去（手機點一下）就能看是哪兩件散件合的，也可以直接選散件，找它能合出什麼。"),
        h("div", { class: "wk-body" }));
      $("#home")?.append(sec);
      const ul = document.querySelector(".nav ul");
      if (ul && !$("#nav-wiki")) ul.append(h("li", { id: "nav-wiki" }, h("a", { href: "#wiki-sec" }, "小百科")));
    }
    drawWiki();
    loadWiki().then(drawWiki);
    addEventListener("scroll", hideTip, { passive: true });
  }

  /* ---------- 高手 RP（站主 2026-11-06：「在小百科上面那區加一區高手rp，在YT上面有開的人也要加進去，特別是我自己的頻道的rp。
     找高手rp然後分析有分的以最近的排序分好陣容跟選的海克斯，跟實戰對局那樣附上鏈接」）
     data/rp.json（lab/pro_rp.py）：本版、大師以上、打進前四的實況錄影，最近的在前；上面的按鈕依陣容篩。 ---------- */
  const RP = { p: null, d: null, comp: "all", n: 20 };
  const loadRp = () => (RP.p ||= fetch(dataUrl("rp.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => (RP.d = d)));
  // 海克斯圖示（小百科同一張精靈圖），20px
  const rpAugIcon = (i, sp) => { const S = 20, c = i % sp.cols, r = Math.floor(i / sp.cols);
    return h("span", { class: "rp-ai", "aria-hidden": "true", style: `background-image:url(${sp.src});background-size:${sp.cols * S}px ${sp.rows * S}px;background-position:-${c * S}px -${r * S}px` }); };
  function rpCard(g) {
    const c = g.c ? D.comps.find((x) => x.id === g.c) : null;
    return h("div", { class: "case rp" },
      h("div", { class: "case-head" },
        h("span", { class: "plc p" + Math.min(g.p, 5) }, `第 ${g.p} 名`),
        h("b", null, g.s), g.own ? h("span", { class: "tag up" }, "站主") : null, h("span", { class: "tag rp-pf" }, g.pf === "youtube" ? "YouTube" : "Twitch"), g.rk ? h("span", { class: "tag score" }, g.rk) : null,
        h("span", { class: "xs muted" }, [g.rg, g.lv ? g.lv + " 級" : null, fmtTime(g.t)?.replace("（台灣時間）", "")].filter(Boolean).join("｜"))),
      h("div", { class: "rp-comp" }, c ? [g.near ? h("span", { class: "xs muted" }, "接近 ") : null, h("a", { href: "#" + slug(c.id), onclick: () => track("rp_comp", c.id) }, c.name, " →")]
        : h("span", { class: "muted" }, g.f ? `其他：${g.f}` : "其他陣容")),
      S19 ? null : h("div", { class: "vod-augs rp-augs" }, g.a.length ? [...g.a.map(([n, st, r, ic, sp]) => h("span", { class: "vod-aug " + (RAR_V[r] || ""), title: `${st} 選的海克斯：${n}` },
        h("span", { class: "st" }, st), sp != null && RP.d?.sprite ? rpAugIcon(sp, RP.d.sprite) : ic ? h("img", { src: "icons/" + ic, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null, n)),
        g.ap ? h("span", { class: "xs muted" }, "（有一個沒辨識出來）") : null] : h("span", { class: "xs muted" }, "海克斯：待錄影辨識")),
      h("div", { class: "case-units" }, g.u.map(([k, st, its]) => h("span", { class: "cu" }, h("span", { class: "stars" }, "★".repeat(st)), icon("champion", k, "sm"), h("span", { class: "its" }, its.map((i) => icon("item", i, "xs")))))),
      h("a", { class: "rp-go", href: g.v, target: "_blank", rel: "noopener", onclick: () => track("rp", g.c || "other") }, "▶ 看這場 RP"));
  }
  function drawRp() {
    const sec = $("#rp-sec"); if (!sec) return;
    const body = sec.querySelector(".rp-body"); body.textContent = "";
    const d = RP.d;
    if (!d) { body.append(h("p", { class: "small muted" }, RP.p ? "載入中…" : "高手 RP 資料讀不到。")); return; }
    if (!d.games.length) { body.append(h("p", { class: "small muted" }, "這版還沒有打進前四的高手 RP。")); return; }
    // 篩選按鈕照主陣容分（分支、轉職併到主陣容），卡片上寫實際是哪個分支
    const grp = (g) => (!g.c ? "other" : D.comps.some((x) => x.id === g.c.split("__")[0]) ? g.c.split("__")[0] : g.c);
    const short = (k) => D.comps.find((x) => x.id === k)?.name || k;
    const cnt = {};
    for (const g of d.games) { const k = grp(g); cnt[k] = (cnt[k] || 0) + 1; }
    const keys = Object.keys(cnt).filter((k) => k !== "other").sort((a, b) => cnt[b] - cnt[a] || short(a).localeCompare(short(b)));
    if (cnt.other) keys.push("other");
    // 站主 2026-11-06：「特別是我自己的頻道的rp」→ 站主自己的場次有一個按鈕
    const nOwn = d.games.filter((g) => g.own).length;
    if (RP.comp !== "all" && RP.comp !== "own" && !cnt[RP.comp]) RP.comp = "all";
    const xs = d.games.filter((g) => RP.comp === "all" || (RP.comp === "own" ? g.own : grp(g) === RP.comp));
    // 站主 2026-11-06：「上面的按鈕盡量用圖案，都是字易讀性太差」→ 陣容按鈕用主C、副C頭像＋場數，名字放在滑鼠提示和下面那行
    const label = (k) => (k === "all" ? "全部" : k === "own" ? "站主的 RP" : k === "other" ? "其他陣容" : short(k));
    const n = (k) => (k === "all" ? d.games.length : k === "own" ? nOwn : cnt[k]);
    const face = (k) => {
      if (k === "all") return [h("span", { class: "rp-all" }, "全部")];
      if (k === "own") return [h("img", { class: "rp-brand", src: "assets/brand/choko-c-lab-c5.svg", alt: "" })];
      if (k === "other") return [h("span", { class: "rp-q", "aria-hidden": "true" }, "？")];
      const c = D.comps.find((x) => x.id === k);
      const two = [c?.carrier || c?.roles?.mainC?.[0], (c?.roles?.subC || []).find((x) => x && x !== c?.carrier)].filter((x) => x && CH[x]);
      return two.length ? two.map((x) => icon("champion", x, "sm")) : [h("span", { class: "rp-all" }, short(k).slice(0, 2))];
    };
    const ks = ["all", ...(nOwn ? ["own"] : []), ...keys];
    body.append(
      h("div", { class: "rp-chips", role: "group", "aria-label": "依陣容篩選" }, ks.map((k) =>
        h("button", { type: "button", class: "rp-chip" + (k === "all" || k === "own" ? " wide" : ""), "aria-pressed": RP.comp === k ? "true" : "false", title: `${label(k)}（${n(k)} 場）`, "aria-label": `${label(k)}，${n(k)} 場`,
          onclick: () => { RP.comp = k; RP.n = 20; track("rp_filter", k); drawRp(); } },
          h("span", { class: "rp-face" }, face(k)), h("span", { class: "rp-n" }, n(k))))),
      h("p", { class: "rp-cur" }, h("b", null, label(RP.comp)), `　${xs.length} 場`, RP.comp !== "all" && RP.comp !== "own" && RP.comp !== "other" ? h("a", { href: "#" + slug(RP.comp), class: "rp-cur-go" }, "看這套攻略 →") : null),
      h("div", { class: "cases rp-list" }, xs.slice(0, RP.n).map(rpCard)),
      xs.length > RP.n ? h("button", { type: "button", class: "btn rp-more", onclick: () => { RP.n += 20; drawRp(); } }, `再顯示 ${Math.min(20, xs.length - RP.n)} 場（還有 ${xs.length - RP.n} 場）`) : null,
      S19 ? h("p", { class: "xs muted" }, `資料來源：${d.source}，${d.patch} 打進前四，最近的排前面。陣容用本站的分類，分類對不到的寫「其他陣容」。點「看這場 RP」會跳到錄影裡那一場開始的地方。`) :
      h("p", { class: "xs muted" }, `資料來源：${d.source || "MetaTFT 影片庫"}＋站主的 YouTube 直播存檔，${d.patch || ""} 版、大師以上、打進前四，最近的排前面${d.asOf ? `（${fmtTime(d.asOf)?.replace("（台灣時間）", "") || ""} 更新）` : ""}。`,
        "陣容用本站的分類；分類對不到、但主C一樣而且棋子有 5 隻以上一樣的寫「接近」；都不像的寫主C。點「看這場 RP」會跳到錄影裡那一場開始的地方。海克斯對局資料裡沒有，要看錄影辨識，還沒辨識的寫「待錄影辨識」。",
        d.pendingYoutube?.length ? `YouTube 頻道（${d.pendingYoutube.join("、")}）還在接。` : ""));
  }
  function renderRp() {
    if (!D.rpMeta) return;
    let sec = $("#rp-sec");
    if (!sec) {
      sec = h("section", { class: "block", id: "rp-sec" }, h("h2", null, "高手 RP"),
        h("p", { class: "rlead" }, S19 ? "高手 PBE 實況裡打進前四的對局，最近的排前面。可以照陣容篩，點進錄影看那一場怎麼打。" : "高手實況裡打進前四的對局，最近的排前面。可以照陣容篩，看他們選了哪些海克斯，再點進錄影看那一場怎麼打。"),
        h("div", { class: "rp-body" }));
      $("#home")?.append(sec);
      const ul = document.querySelector(".nav ul");
      if (ul && !$("#nav-rp")) ul.append(h("li", { id: "nav-rp" }, h("a", { href: "#rp-sec" }, "高手RP")));
    }
    drawRp();
    loadRp().then(drawRp);
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

  /* ---------- 新手認卡（站主 2026-11-16：「雲頂大數據 新手認卡 弄個像是這樣的功能，但是要有s19」；
     題型照站主選的：看頭像選費用、看頭像選羈絆、看羈絆選成員）。跟著 S18／S19 切換，資料用小百科的 units／traits ---------- */
  const QZ = { mode: "mix", n: 10, i: 0, score: 0, streak: 0, best: 0, q: null, answered: false, pick: new Set(), started: 0, mute: false };
  const QZ_MODES = [["mix", "混合"], ["cost", "看頭像猜費用"], ["trait", "看頭像猜羈絆"], ["member", "看羈絆找成員"]];
  const qzKey = () => `choko.quiz.s${SEASON}.${QZ.mode}`;
  const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pickOne = (xs) => xs[Math.floor(Math.random() * xs.length)];
  let QZ_AC = null;
  function qzSound(ok) {  // 自己合成的提示音（不用別人的音效檔）
    if (QZ.mute) return;
    try {
      QZ_AC ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = QZ_AC.currentTime, notes = ok ? [660, 880] : [220, 165];
      notes.forEach((f, i) => {
        const o = QZ_AC.createOscillator(), g = QZ_AC.createGain();
        o.type = ok ? "triangle" : "square"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(ok ? 0.18 : 0.08, t + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
        o.connect(g).connect(QZ_AC.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.18);
      });
    } catch {}
  }
  function qzPool() {
    const w = WK.d || {};
    const units = (w.units || []).filter((u) => CH[u.key] && (u.traits || []).length);
    const traits = (w.traits || []).filter((t) => (t.units || []).filter((k) => CH[k]).length >= 2);
    return { units, traits };
  }
  function qzMake() {
    const all = qzPool(), used = QZ.used ||= new Set();
    const fresh = (xs, k) => { const f = xs.filter((x) => !used.has(k(x))); return f.length ? f : xs; };
    const units = fresh(all.units, (u) => u.key), traits = fresh(all.traits, (t) => t.key);
    const type = QZ.mode === "mix" ? pickOne(["cost", "trait", "member"]) : QZ.mode;
    if (type === "cost") {
      const u = pickOne(units);
      used.add(u.key);
      return { type, unit: u, options: [...new Set(all.units.map((x) => x.cost))].sort((a, b) => a - b).map((c) => ({ id: String(c), label: `${c} 費` })), answer: new Set([String(u.cost)]) };
    }
    if (type === "trait") {
      const u = pickOne(units.filter((x) => (x.traits || []).length));
      const right = pickOne(u.traits); used.add(u.key);
      const others = shuffle((WK.d.traits || []).filter((t) => !u.traits.includes(t.key) && t.kind !== "unique")).slice(0, 3);
      const opts = shuffle([right, ...others.map((t) => t.key)]);
      return { type, unit: u, options: opts.map((k) => ({ id: k, label: trName(k) })), answer: new Set([right]) };
    }
    const t = pickOne(traits); used.add(t.key);
    const mem = t.units.filter((k) => CH[k]);
    const k = Math.min(mem.length, 2 + Math.floor(Math.random() * 3));
    const right = shuffle(mem).slice(0, k);
    const wrong = shuffle(all.units.map((u) => u.key).filter((x) => !mem.includes(x))).slice(0, 8 - k);
    return { type: "member", trait: t, options: shuffle([...right, ...wrong]).map((x) => ({ id: x, label: champName(x) })), answer: new Set(right) };
  }
  function qzAnswer(id) {
    if (QZ.answered) return;
    const q = QZ.q;
    if (q.type === "member") { QZ.pick.has(id) ? QZ.pick.delete(id) : QZ.pick.add(id); drawQuiz(); return; }
    QZ.pick = new Set([id]); qzCheck();
  }
  function qzCheck() {
    const q = QZ.q, ok = q.answer.size === QZ.pick.size && [...q.answer].every((x) => QZ.pick.has(x));
    QZ.answered = true; QZ.ok = ok;
    if (ok) { QZ.score++; QZ.streak++; } else QZ.streak = 0;
    qzSound(ok); track("quiz", q.type + (ok ? "_ok" : "_ng"));
    drawQuiz();
  }
  function qzNext() {
    QZ.i++;
    if (QZ.i >= QZ.n) {
      QZ.done = true; QZ.secs = Math.round((Date.now() - QZ.started) / 1000);
      const prev = +(store.get(qzKey()) || 0);
      QZ.newBest = QZ.score > prev; if (QZ.newBest) store.set(qzKey(), String(QZ.score));
      QZ.best = Math.max(prev, QZ.score);
    } else { QZ.q = qzMake(); QZ.answered = false; QZ.pick = new Set(); }
    drawQuiz();
  }
  function qzStart(mode) {
    if (mode) QZ.mode = mode;
    Object.assign(QZ, { used: new Set(), i: 0, score: 0, streak: 0, done: false, answered: false, pick: new Set(), started: Date.now(), best: +(store.get(qzKey()) || 0) });
    QZ.q = qzMake(); drawQuiz();
  }
  function drawQuiz() {
    const v = $("#quizv"); if (!v) return;
    const body = v.querySelector(".qz-body"); body.textContent = "";
    if (!WK.d) { body.append(h("p", { class: "small muted" }, QZ.loaded ? "資料讀不到，重新整理再試一次。" : "載入中…")); return; }
    const modes = h("div", { class: "tabs qz-modes", role: "tablist", "aria-label": "題型" }, QZ_MODES.map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": QZ.mode === k ? "true" : "false", onclick: () => { track("quiz_mode", k); qzStart(k); } }, l)));
    const bar = h("div", { class: "qz-bar" },
      h("span", null, h("b", null, `第 ${Math.min(QZ.i + 1, QZ.n)} / ${QZ.n} 題`)), h("span", null, `答對 ${QZ.score}`), h("span", null, `連對 ${QZ.streak}`), h("span", { class: "muted" }, `最佳 ${QZ.best} / ${QZ.n}`),
      h("button", { type: "button", class: "btn ghost qz-mute", "aria-pressed": QZ.mute ? "true" : "false", onclick: () => { QZ.mute = !QZ.mute; drawQuiz(); } }, QZ.mute ? "🔇 音效關" : "🔊 音效開"));
    body.append(modes, bar);
    if (QZ.done) {
      body.append(h("div", { class: "qz-card qz-end" },
        h("p", { class: "qz-big" }, `${QZ.score} / ${QZ.n}`), h("p", null, `花了 ${QZ.secs} 秒`, QZ.newBest ? h("b", { class: "tag up" }, "新紀錄！") : null),
        h("button", { type: "button", class: "btn qz-go", onclick: () => qzStart() }, "再來一輪")));
      return;
    }
    const q = QZ.q;
    const head = q.type === "member"
      ? h("div", { class: "qz-prompt" }, h("p", { class: "qz-ask" }, "哪些棋子有這個羈絆？（可複選）"), h("p", { class: "qz-trait" }, h("b", null, trName(q.trait.key)), q.trait.nameStatus === "temp" ? h("span", { class: "tag unv" }, "暫譯") : null,
          h("span", { class: "wk-bps" }, (q.trait.breakpoints || []).map((n) => h("span", { class: "wk-bp" }, String(n))))), h("p", { class: "xs muted" }, `正確答案有 ${q.answer.size} 隻`))
      : h("div", { class: "qz-prompt" }, h("p", { class: "qz-ask" }, q.type === "cost" ? "這隻是幾費？" : "這隻有哪個羈絆？"),
          h("div", { class: "qz-face" + (q.type === "cost" && !QZ.answered ? " hide-cost" : "") }, icon("champion", q.unit.key, "xl")),
          QZ.answered ? h("p", { class: "qz-name" }, h("b", null, q.unit.zh), `｜${q.unit.cost} 費｜`, q.unit.traits.map(trName).join("、")) : h("p", { class: "qz-name muted" }, "（答完才會顯示名字）"));
    const opts = h("div", { class: "qz-opts" + (q.type === "member" ? " qz-grid" : "") }, q.options.map((o, i) => {
      const chosen = QZ.pick.has(o.id), right = q.answer.has(o.id);
      const cls = "qz-opt" + (chosen ? " on" : "") + (QZ.answered ? (right ? " right" : chosen ? " wrong" : " dim") : "");
      return h("button", { type: "button", class: cls, "aria-pressed": chosen ? "true" : "false", disabled: QZ.answered, onclick: () => qzAnswer(o.id) },
        q.type === "member" ? [icon("champion", o.id, "md"), h("span", { class: "qz-on" }, o.label)] : [h("kbd", null, q.type === "cost" ? o.id : String(i + 1)), h("span", null, o.label)]);
    }));
    const foot = h("div", { class: "qz-foot" },
      QZ.answered ? h("p", { class: "qz-res " + (QZ.ok ? "ok" : "ng"), role: "status" }, QZ.ok ? "答對了！" : "答錯了，綠色的是正確答案。") : null,
      q.type === "member" && !QZ.answered ? h("button", { type: "button", class: "btn qz-go", disabled: !QZ.pick.size, onclick: qzCheck }, "確定") : null,
      QZ.answered ? h("button", { type: "button", class: "btn qz-go", onclick: qzNext }, QZ.i + 1 >= QZ.n ? "看結果" : "下一題 →") : null);
    body.append(h("div", { class: "qz-card" }, head, opts, foot));
  }
  function renderQuiz() {
    let v = $("#quizv");
    if (!v) {
      v = h("article", { id: "quizv", class: "detail block" },
        h("a", { class: "back btn ghost", href: "#learn" }, "← 回新手教學"),
        h("h2", null, `新手認卡${S19 ? "（S19 預測）" : `（S${SEASON}）`}`),
        h("p", { class: "rlead" }, S19 ? "S19 的棋子費用、羈絆一次記起來。名稱照 PBE 官方繁中，官方還沒翻的先用暫譯。鍵盤可以按 1～7 選答案、Enter 下一題。" : "這季的棋子費用、羈絆一次記起來。鍵盤可以按 1～7 選答案、Enter 下一題。"),
        h("div", { class: "qz-body" }));
      $("#detail").after(v);
      addEventListener("keydown", (e) => {
        if (v.hidden || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea") || !QZ.q) return;
        if (e.key === "Enter") { if (QZ.done) qzStart(); else if (QZ.answered) qzNext(); else if (QZ.q.type === "member" && QZ.pick.size) qzCheck(); else return; e.preventDefault(); return; }
        if (QZ.answered || QZ.q.type === "member") return;
        const o = QZ.q.type === "cost" ? QZ.q.options.find((x) => x.id === e.key) : QZ.q.options[+e.key - 1];  // 費用題：按幾就是幾費
        if (o) { qzAnswer(o.id); e.preventDefault(); }
      });
    }
    v.hidden = false;
    track("quiz", "open");
    if (!QZ.q && WK.d) qzStart(); else drawQuiz();  // 小百科資料已經載好時（從首頁點進來）直接出題
    loadWiki().then(() => { QZ.loaded = true; if (!QZ.q && WK.d) qzStart(); else drawQuiz(); });
  }

  let HOME_Y = null;   // 從首頁點進陣容頁時，首頁捲到哪裡（回來時捲回去）
  let ROUTED = false;
  function route() {
    // 站主 2026-11-10「就是一樣的」：被併掉的陣容舊網址（例：#c-xayah）轉到併入的那套
    const al = Object.entries(D.aliases || {}).find(([from]) => slug(from) === location.hash.slice(1));
    if (al) { history.replaceState(null, "", "#" + slug(al[1])); }
    let hsh = location.hash.slice(1);
    if (hsh === "route-sec") { history.replaceState(null, "", location.pathname + location.search + "#learn-route"); hsh = "learn-route"; }  // 舊網址
    const c = D.comps.find((x) => slug(x.id) === hsh) || (O.on ? O.custom.map(customToComp).find((x) => slug(x.id) === hsh) : null);
    const fromDetail = !$("#detail").hidden || !!$("#quizv")?.isConnected && !$("#quizv").hidden || !!$("#learnv")?.isConnected && !$("#learnv").hidden;
    const quiz = hsh === "quiz" || hsh === "learn-quiz";
    const lv = !c && !quiz ? learnViewOf(hsh) : null;
    if (ROUTED && !$("#home").hidden && (c || quiz || lv)) HOME_Y = scrollY;   // 直接開陣容頁網址進來的不算（沒有上一頁可回）
    ROUTED = true;
    $("#home").hidden = !!c || quiz || !!lv; $("#detail").hidden = !c;
    if ($("#quizv")) $("#quizv").hidden = !quiz;
    if (lv || $("#learnv")) ensureLearnV().hidden = !lv;
    if (!lv) LB = null;
    if (quiz) { floatBack(false); renderQuiz(); window.scrollTo(0, 0); return; }
    if (lv) { floatBack(false); renderLearnView(); window.scrollTo(0, 0); return; }
    if (!c) {
      floatBack(false); homeSpy(); navH();
      // 站主 2026-11-07：在陣容詳細頁點最上面的「T 度表」會先跳出去、要再按一次才到 → 首頁顯示出來後直接捲到那一區
      // （詳細頁時首頁是隱藏的，瀏覽器原本的錨點跳轉找不到位置）
      const t = fromDetail && hsh ? document.getElementById(hsh) : null;
      if (fromDetail && HOME_Y != null && (!hsh || hsh === "comps" || hsh === "tierlist")) {   // 返回：回到點進去之前看的位置（T 表、陣容列表都一樣）
        const y = HOME_Y; requestAnimationFrame(() => { scrollTo(0, y); setTimeout(() => scrollTo(0, y), 60); });
      } else if (t && $("#home").contains(t)) requestAnimationFrame(() => t.scrollIntoView({ block: "start" }));
    }
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
    applyOwnerNames(); applyDataTx(); renderTop();
    if (S19 && !S19FULL()) { renderTiers(); renderPatch(); renderCompList(); } else { if ($("#updates")) renderUpdates(); renderPatch(); renderVersion(); renderTiers(); renderRoute(); if (S19) renderCompList(); }  // S19 還沒有高手資料時沒有本次更新、版本主軸那幾區
    const hsh = location.hash.slice(1), c = D.comps.find((x) => slug(x.id) === hsh) || (O.on ? O.custom.map(customToComp).find((x) => slug(x.id) === hsh) : null);
    if (c) { const y = scrollY; renderDetail(c.id); scrollTo(0, y); }
    ownerPanel();
  }
  async function startOwner() {
    try {
      if (!D.preview || !window.claude?.use) return;
      const user = await window.claude.use("user");
      if (!user?.isOwner?.()) return;
      // 站主 2026-11-19：「為什麼盤面我不能調，你s18那邊有的功能這裡也要有啊」→ S19 也開站主工具（陣容 id 有 s19_ 開頭，跟 S18 存在同一個資料庫不會打架；手動陣容記 season）
      const db = await window.claude.use("db");
      if (!db) return;
      O.db = db;
      const timer = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000));
      const opt = (c) => db.collection(c).get().catch(() => ({ docs: [] }));  // T 表與手動陣容是新集合，讀不到就當作空的
      const [es, ts, bs, tis, cus, rel] = await Promise.race([Promise.all([db.collection("edits").get(), db.collection("terms").get(), db.collection("boards").get(), opt("tiers"), opt("customComps"), opt("releases")]), timer]);
      O.releases = (rel.docs || []).map((d) => d.data()).filter((x) => x?.at).sort((a, b) => (b.at > a.at ? 1 : -1));
      for (const d of es.docs || []) { const x = d.data(); if (x?.key) O.edits[x.key] = x; }
      O.terms = (ts.docs || []).map((d) => d.data()).filter((x) => x?.from);
      for (const d of bs.docs || []) { const x = d.data(); if (x?.compId) O.boards[x.compId] = x; }
      for (const d of tis.docs || []) { const x = d.data(); if (x?.compId) O.tiers[x.compId] = x; }
      O.custom = (cus.docs || []).map((d) => d.data()).filter((x) => x?.id && x.name && (x.season || 18) === SEASON);
      O.on = true;
      ownerFormulaComps();
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
  /* 站主 2026-11-06：「你給我預覽頁一個按鈕，我按下去你就更新到主頁」
     站主 2026-11-09：「我按這個不要再把更新的東西傳到留言我會看不到」「我就是不想在這邊說我按了，要直接你可以自動收到」
     按下確定：先在資料庫 releases/ 記一筆要求，再自動通知 Claude（sendToClaude；這是唯一能叫醒對話的管道，站主不用看留言）。
     Claude 更新完把 status 改成 done、寫 summary（這次更新了什麼），結果直接顯示在按鈕下面。
     Claude 收不到（對話沒連上）時要求留在資料庫，Claude 下次在對話裡做任何事之前會先查這裡、照這筆更新。 */
  function releaseBox() {
    const rs = O.releases || [];
    const done = rs.find((x) => x.status === "done");
    const pending = rs.filter((x) => x.status === "requested" && (!done || x.at > (done.doneAt || done.at)));
    const send = async (ev) => {
      const anchorEl = ev.currentTarget.closest(".rel-box") || ev.currentTarget;
      O.relAsk = false; O.relBusy = true; ownerPanel();
      const at = new Date().toISOString(), id = "r" + at.replace(/\D/g, "").slice(0, 14);
      const req = { id, at, status: "requested", where: location.hash || "#home" };
      try { await O.db.doc("releases/" + id).set(req); O.releases = [req, ...rs]; }
      catch (err) { O.relBusy = false; ownerPanel(); ownerNotice("送出失敗：" + (err?.message || "請再試一次")); return; }
      let sent = false;
      try {
        const cm = await window.claude.use("comments");
        if (cm && (await cm.canSendToClaude().catch(() => "off")) === "available") {
          const anchor = await cm.anchorFor(document.body.contains(anchorEl) ? anchorEl : document.body);
          await cm.sendToClaude({ anchor, text: `【站主按鈕】更新正式站（要求 ${id}）：請把預覽站的修改同步並更新到正式站 chokomkp.com。結果寫在按鈕下面和對話裡，不要回在留言。` });
          sent = true;
        }
      } catch { sent = false; }
      req.sent = sent;
      try { await O.db.doc("releases/" + id).set(req); } catch { /* 記不到也沒關係，要求本身已經存了 */ }
      O.relBusy = false; ownerPanel();
      ownerNotice(sent ? "已自動通知 Claude 更新正式站，好了這裡會顯示時間和更新了什麼。"
        : "已記下更新要求，但 Claude 現在收不到（對話沒連上）。Claude 下次在對話裡動工前會先照這筆更新。");
    };
    return h("div", { class: "rel-box" },
      O.relAsk ? [h("p", { class: "xs rel-q" }, "把預覽站的修改（文字、棋盤、T 表）更新到正式站？"),
        h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: send }, "確定更新"),
          h("button", { class: "btn ghost", type: "button", onclick: () => { O.relAsk = false; ownerPanel(); } }, "取消"))]
        : h("button", { class: "btn ghost", type: "button", disabled: O.relBusy || null, onclick: () => { O.relAsk = true; ownerPanel(); } }, O.relBusy ? "送出中…" : "⇪ 更新到正式站"),
      pending.length ? h("p", { class: "xs rel-st rel-wait", role: "status" }, pending[0].sent === false
        ? `已記下更新要求（${fmtTime(pending[0].at)}）；Claude 當時收不到，下次動工前會先處理。`
        : `已通知 Claude 更新（${fmtTime(pending[0].at)}），處理中。`) : null,
      done ? h("div", { class: "xs muted rel-st", role: "status" }, `正式站最後更新：${fmtTime(done.doneAt || done.at)}`,
        (done.summary || []).length ? h("ul", { class: "rel-sum" }, done.summary.slice(0, 6).map((t) => h("li", null, t))) : null) : null);
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
      releaseBox(),
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
    // 名字、角色圖會出現在全站：存完整個重畫
    const runAll = async (fn, msg) => { try { await fn(); rerender(); ownerNotice(msg); } catch (e) { ownerNotice("儲存失敗：" + (e?.message || "請再試一次")); } };
    const nameForm = (c2) => {
      const orig = D.comps.find((x) => x.id === c2.id)?._n0 || c2.name;
      const inp = h("input", { type: "text", class: "tc-name-in", value: c2.name, maxlength: "40", "aria-label": "陣容名稱", onclick: (e) => e.stopPropagation() });
      const t = O.tiers[c2.id] || {};
      return h("div", { class: "tc-own tc-namef", onclick: (e) => e.stopPropagation() }, inp,
        h("button", { class: "btn xs", type: "button", onclick: () => { const nm = inp.value.trim(); if (!nm) return; runAll(() => saveTier(c2.id, { name: nm === orig ? null : nm }), "已改陣容名稱（全站一起改）。"); } }, "儲存"),
        t.name ? h("button", { class: "btn ghost xs", type: "button", onclick: () => runAll(() => saveTier(c2.id, { name: null }), "已恢復原本的名稱。") }, "恢復原名") : null,
        t.icon ? h("button", { class: "btn ghost xs", type: "button", onclick: () => runAll(() => saveTier(c2.id, { icon: null }), "已恢復原本的角色圖。") }, "恢復原圖") : null,
        h("button", { class: "btn ghost xs", type: "button", onclick: () => renderTiers() }, "取消"));
    };
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
      c.custom ? null : h("button", { class: "linkbtn", type: "button", onclick: (ev) => { ev.stopPropagation(); ev.currentTarget.closest(".tc-own").replaceWith(nameForm(c)); } }, "改名"),
      c.custom ? null : h("button", { class: "linkbtn", type: "button", onclick: (ev) => { ev.stopPropagation(); openPicker(`${c.name}：T 表的角色圖`, champGroups(new Set([compIcon(c)])), (key) => runAll(() => saveTier(c.id, { icon: key }), "已換角色圖。")); } }, "換圖"),
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
    const st = cur ? { ...cur, units: [...(cur.units || [])] } : { id: (S19 ? "custom19_" : "custom_") + Date.now().toString(36), season: SEASON, name: "", lane: "normal", tier: "B", carrier: null, units: [], note: "", order: 999 };
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
    const tabs = h("div", { class: "tabs", role: "tablist" }), body = h("div", { class: "pgrid" }), catbar = h("div");
    let g = 0, cat = "all";
    const show = () => {
      tabs.textContent = ""; body.textContent = ""; catbar.textContent = "";
      groups.forEach((x, i) => tabs.append(h("button", { type: "button", role: "tab", "aria-selected": i === g && !q.value ? "true" : "false", onclick: () => { g = i; cat = "all"; q.value = ""; show(); } }, x.label)));
      const term = q.value.trim();
      const mk = (x) => h("button", { class: "pick", type: "button", onclick: () => { sheet.remove(); onPick(x.key); } }, x.ico, h("span", null, x.name));
      const list = term ? groups.flatMap((x) => x.items).filter((x) => x.name.includes(term) || x.key.toLowerCase().includes(term.toLowerCase())) : groups[g].items;
      if (!term && groups[g].cats) {  // 成品／光明裝備：分類按鈕＋「全部」時分區
        catbar.append(catChips(list, cat, (id) => { cat = id; show(); }));
        const nodes = catView(list, cat, mk);
        body.append(...nodes);
        if (!nodes.length) body.append(h("p", { class: "small muted" }, "找不到。"));
        return;
      }
      for (const x of list) body.append(mk(x));
      if (!list.length) body.append(h("p", { class: "small muted" }, "找不到。"));
    };
    q.addEventListener("input", show);
    const sheet = h("div", { id: "picker-sheet", class: "sheet-bg", onclick: (ev) => { if (ev.target === sheet) sheet.remove(); } },
      h("div", { class: "sheet tall", role: "dialog", "aria-label": title }, h("div", { class: "row between" }, h("b", null, title), h("button", { class: "btn ghost", type: "button", onclick: () => sheet.remove() }, "關閉")), q, tabs, catbar, body));
    document.body.append(sheet); show();
  }

  /* ---------- 棋盤編輯器（站主）：四排七格；點棋子選取、點空格移動、拖曳可交換；星級、裝備、加減棋子 ---------- */
  const BSTATE = {};
  const TANKY = /Gargoyle|Warmog|Steadfast|Bramble|DragonsClaw|SpiritVisage|Sunfire|Crownguard|AdaptiveHelm|ProtectorsVow|Evenshroud|TitansResolve/;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // 裝備分類（站主 2026-11-11：「裝備要分類，至少要分出物理裝、魔攻裝、攻速裝、啟動裝等等」；隊伍編輯器的挑選視窗和旁邊常駐的挑選區都用這張表）
  // 注意：這張表是從戰鬥模擬器 site/sim/ui/item-cats.js 複製來的（app.js 是單一檔案、沒有模組系統）。改一邊要改另一邊（兩邊的內容要一樣）。
  const ITEM_CATS = [
    { id: "ad", zh: "物理" }, { id: "ap", zh: "魔攻" }, { id: "as", zh: "攻速" }, { id: "mana", zh: "啟動（回魔）" },
    { id: "tank", zh: "坦克" }, { id: "util", zh: "功能" }, { id: "tactician", zh: "棋手裝" },
  ];
  const ITEM_CAT_MAP = {
    // 物理
    Deathblade: ["ad"], InfinityEdge: ["ad"], Bloodthirster: ["ad"], SteraksGage: ["ad", "tank"], EdgeOfNight: ["ad", "as"],
    GiantSlayer: ["ad", "as", "ap"], HandOfJustice: ["ad", "ap", "mana"], StrikersFlail: ["ad", "ap"], KrakensFury: ["ad", "as"],
    // 魔攻
    RabadonsDeathcap: ["ap"], JeweledGauntlet: ["ap"], ArchangelsStaff: ["ap"], Morellonomicon: ["ap"], HextechGunblade: ["ap", "ad"],
    // 攻速
    RedBuff: ["as"], GuinsoosRageblade: ["as", "ap"], LastWhisper: ["as", "ad"], NashorsTooth: ["ap", "as"], VoidStaff: ["ap", "as"],  // 站主 2026-11-11：虛空之杖、納什之牙是魔攻裝
    TitansResolve: ["as", "tank"], Quicksilver: ["as", "util"],
    // 啟動（回魔）
    BlueBuff: ["mana", "ad", "ap"], SpearOfShojin: ["mana", "ad", "ap"], AdaptiveHelm: ["mana", "tank"], ProtectorsVow: ["mana", "tank"],
    // 坦克
    BrambleVest: ["tank"], DragonsClaw: ["tank"], GargoyleStoneplate: ["tank"], WarmogsArmor: ["tank"], SunfireCape: ["tank"],
    Evenshroud: ["tank"], IonicSpark: ["tank", "ap"], SpiritVisage: ["tank"], SteadfastHeart: ["tank"], Crownguard: ["tank", "ap"],
    // 功能
    ThiefsGloves: ["util"],
    // 棋手裝
    TacticiansCape: ["tactician"], TacticiansCrown: ["tactician"], TacticiansShield: ["tactician"],
  };
  const catsOf = (key) => ITEM_CAT_MAP[key] || ITEM_CAT_MAP[String(key).replace(/_?Radiant$/, "")] || ["util"];  // 第一個是主要分類（「全部」時分區用），其餘只影響篩選；光明裝照原本那件
  const primaryCat = (key) => catsOf(key)[0];
  const catChips = (items, cur, onPick) => h("div", { class: "row pcats", role: "group", "aria-label": "裝備分類" },
    [{ id: "all", zh: "全部" }, ...ITEM_CATS].filter((c) => c.id === "all" || items.some((x) => catsOf(x.key).includes(c.id)))
      .map((c) => h("button", { class: "chip", type: "button", "aria-pressed": cur === c.id ? "true" : "false", onclick: () => onPick(c.id) }, c.zh)));
  // 「全部」：照主要分類分區（物理／魔攻／攻速／啟動／坦克／功能／棋手裝）；選了某一類：只留屬於那一類的（一件可以屬於多類）
  function catView(items, cat, mk) {
    if (cat !== "all") return items.filter((x) => catsOf(x.key).includes(cat)).map(mk);
    const out = [];
    for (const c of ITEM_CATS) { const xs = items.filter((x) => primaryCat(x.key) === c.id); if (xs.length) out.push(h("h4", { class: "pgh" }, c.zh), ...xs.map(mk)); }
    return out;
  }
  // 挑裝備的分頁（挑選視窗和常駐挑選區共用）：成品和光明裝備（cats）有分類按鈕
  function itemGroups() {
    const g = D.gamedata, mk = (arr) => arr.map((x) => ({ key: x.key, name: itemName(x.key), ico: icon("item", x.key, "sm") }));
    return [
      { label: "一般成裝", cats: true, items: mk(g.items.filter((x) => (x.kind || "completed") === "completed")) },
      { label: "光明", cats: true, items: mk((g.extraItems || []).filter((x) => x.kind === "radiant")) },
      { label: "神器", items: mk([...g.items.filter((x) => x.kind === "artifact"), ...(g.extraItems || []).filter((x) => x.kind === "artifact")]) },
      { label: "徽章", items: mk(g.emblems || []) },
      { label: "其他", items: mk((g.extraItems || []).filter((x) => x.kind === "special")) },
    ].filter((x) => x.items.length);
  }
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
    // 站主存過的：沒存的等級才用資料的棋盤；資料裡「站主的棋盤」是建置時套上去的（可能換過人口），站主存的那份已經有了，不重複拿
    const dataB = (lv) => { const b = c.boards?.["lv" + lv]; return b?.units && !(sv && b.source === "owner") ? b : null; };
    const pick = (lv) => (sv?.["lv" + lv]?.units ? clone(sv["lv" + lv].units).map((u) => (u.plant ? { ...u, key: "plant:" + u.plant, items: [] } : u)) : (dataB(lv) ? clone(dataB(lv).units).map((u) => ({ ...u, items: u.items || [], pos: Array.isArray(u.pos) ? u.pos : null })) : []));
    const d8 = withPlants(autoPlace(pick(8), c, null));
    const data = { 8: d8, 9: withPlants(autoPlace(pick(9), c, d8)) };
    if (c.rerollLevel) data[c.rerollLevel] = withPlants(autoPlace(pick(c.rerollLevel), c, d8));
    for (const lv of levelsOf(c)) if (!data[lv]) data[lv] = withPlants(autoPlace(pick(lv), c, d8));
    // 站主 2026-11-08：人口跟著棋子走 → 存過或資料裡有的其他人口（例：拿到剩 7 隻的 8-4 盤＝7 人口）也要載入
    for (const lv of [5, 6, 7, 8, 9]) if (!data[lv] && (sv?.["lv" + lv]?.units?.length || dataB(lv)?.units?.length)) data[lv] = withPlants(autoPlace(pick(lv), c, d8));
    // 站主存的棋盤人口和等級對不上（例：存在 8 人口、其實只有 7 隻）→ 跟建置（owner_content.apply_boards）一樣，當作實際人口那一等（那一等沒存過才搬）
    let moved = null;
    // 主圖等級：站主存過的（sv.main）；舊的存檔沒有 main，用資料的主圖等級（不看建置換過的 ownerMain），打開編輯器時再整條一起移（boardEditor 的 relevel）
    const ml = sv ? (sv.main || mainLevel({ ...c, ownerMain: null, boards: c.boardsBase || c.boards })) : mainLevel(c);  // boardsBase＝套站主棋盤之前的資料
    if (sv) for (const L of [9, 8, 7, 6, 5]) {
      const us = sv["lv" + L]?.units;
      if (!us?.length || [ml, c.rerollLevel].includes(L)) continue;
      const P = champsOnly(us).reduce((n, u) => n + (CH[u.key]?.slots || 1), 0);
      if (P !== L && P >= 5 && P <= 9 && P !== c.rerollLevel && !sv["lv" + P]?.units?.length) { data[P] = data[L]; data[L] = []; moved ||= `之前存在 ${L} 人口的棋盤場上是 ${P} 人口，改成 ${P} 人口的棋盤。按「儲存棋盤」就會存成這樣。`; }
    }
    const two = (lv) => !!((sv?.["lv" + lv]) || c.boards?.["lv" + lv] || {}).twoMarks;
    const main = ml && (champsOnly(data[ml]).length || levelsOf(c).includes(ml)) ? ml : Object.keys(data).map(Number).sort((a, b) => a - b).find((lv) => champsOnly(data[lv]).length) || 8;
    data[main] ||= [];
    // 旁邊「可以替換」：站主存過就用站主的，沒有就用資料算的（站主一改就整份變成站主的）
    const flex = clone(sv?.flex || c.flex || {});
    for (const xs of Object.values(flex)) for (const x of xs || []) x.items ||= {};
    return { lv: main, main, sel: null, dirty: !!moved, two: Object.fromEntries(Object.keys(data).map((lv) => [lv, two(lv)])), msg: moved || (sv ? "目前是你存過的棋盤。" : "預先放好最常見的完整棋盤與推薦裝備，直接調整後按儲存。"), data,
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
  // 站主 2026-11-09：「只要我點到其他地方自動幫我按這個完成」→ 選了棋子（或旁邊一欄的棋子）時，點到棋盤、選取面板、挑選視窗以外的地方＝按「完成」
  // 用 click（不是 pointerdown，不會吃掉那一下）：點在編輯器外面＝先收起再做那一下（索引、連結算位置時版面已經變好）；
  // 點在編輯器裡面的其他按鈕＝先讓按鈕做完自己的事再收起（重畫編輯器會換掉那顆按鈕）
  // 站主 2026-11-11：「ctrl+z 可以回復上一個動作 ctrl+shift+z 則是撤回回復」→ 編輯器的復原／重做。
  // 歷史＝每次重畫時的快照（棋盤、旁邊「可以替換」、首領標記／騎乘者都在棋子裡；只有選取、目前看哪個人口不算），每個陣容的編輯器各一份，
  // 存了棋盤之後保留（復原後會變成「有未儲存的變更」，要再存）；「取消變更」「恢復資料預設」會清掉。上限 100 步；復原後做新動作就清掉重做。
  // 快捷鍵只在編輯器開著時攔截（焦點在輸入框／下拉時不攔，讓瀏覽器自己處理），多個編輯器時以最後操作的那個為準。和戰鬥模擬器 sim/ui/history.js 同一套規則。
  const BHIST = {};
  let beKeysOn = false, beLast = null;
  function beKeysInit() {
    if (beKeysOn) return;
    beKeysOn = true;
    const mark = (ev) => { const be = ev.target.closest?.(".be"); if (be) beLast = be; };
    document.addEventListener("pointerdown", mark, true); document.addEventListener("focusin", mark, true);
    document.addEventListener("keydown", (ev) => {
      if (ev.defaultPrevented || ev.altKey || !(ev.ctrlKey || ev.metaKey)) return;
      const k = String(ev.key || "").toLowerCase();
      const act = k === "z" ? (ev.shiftKey ? "redo" : "undo") : k === "y" && !ev.shiftKey ? "redo" : null;
      if (!act) return;
      const t = ev.target, tag = (t?.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "select" || t?.isContentEditable || (tag === "input" && !["button", "checkbox", "radio", "range", "submit", "reset", "image", "file", "color"].includes((t.type || "text").toLowerCase()))) return;
      if (document.querySelector("[role=dialog]")) return;
      const bes = [...document.querySelectorAll(".be")].filter((x) => x._undo);
      const be = beLast && beLast.isConnected && bes.includes(beLast) ? beLast : bes[bes.length - 1];
      if (!be) return;
      ev.preventDefault();
      be[act === "undo" ? "_undo" : "_redo"]();
    });
  }
  let beDismissOn = false;
  function beDismissInit() {
    if (beDismissOn) return;
    beDismissOn = true;
    const skip = (t) => !(t instanceof Element) || !t.isConnected || !!t.closest(".board.edit, .selp, .dock, #picker-sheet, .fxpanel .fhex, .fxpanel .fx-mini, [role=dialog], .owner-note");
    const all = () => { for (const be of document.querySelectorAll(".be")) be._dismiss?.(); };
    document.addEventListener("click", (ev) => { if (!skip(ev.target) && !ev.target.closest(".be")) all(); }, true);
    document.addEventListener("click", (ev) => { if (!skip(ev.target) && ev.target.closest(".be")) all(); });
  }
  function boardEditor(c) {
    const root = h("div", { class: "be" });
    const st = BSTATE[c.id] ||= freshState(c, true);
    beDismissInit(); beKeysInit();
    // 編輯器的等級：資料的等級＋現在有棋子的等級（人口跟著棋子走，可能換到 5～9 任何一等）
    // 站主 2026-11-13：「5人口的話就有要有升等要補，6、7、8等」→ 主圖以上每一等都列（升等要補、調整其他人口）
    const edLv = () => [...new Set([...levelsOf(c), st.main, ...[5, 6, 7, 8, 9].filter((L) => L > st.main), ...Object.keys(st.data).map(Number).filter((L) => champsOnly(st.data[L]).length)])].filter((L) => L >= 5 && L <= 9).sort((a, b) => a - b);
    const mqWide = matchMedia("(min-width: 1000px)"), wide = () => mqWide.matches;   // 桌機（棋盤旁邊有一欄）／手機（單欄）
    // ---- 復原／重做（見 beKeysInit 的說明）
    const bh = () => (BHIST[c.id] ||= { stack: [], idx: -1 });
    const snapOf = () => JSON.stringify({ data: st.data, two: st.two, flex: st.flex, flexOwned: !!st.flexOwned, main: st.main });
    const unitSig = (u) => [u.key || u.plant, u.star, (u.items || []).join("+"), u.pos?.join(","), u.mark ? 1 : 0, u.rider ? 1 : 0].join("|");
    function histPush() {
      const H = bh(), k = snapOf();
      if (H.idx >= 0 && H.stack[H.idx] === k) return;
      H.stack = H.stack.slice(0, H.idx + 1); H.stack.push(k);
      if (H.stack.length > 100) H.stack.shift();
      H.idx = H.stack.length - 1;
    }
    function histGo(d) {
      const H = bh(), to = H.idx + d;
      if (to < 0 || to >= H.stack.length) return;
      const cur = JSON.parse(snapOf()), nxt = JSON.parse(H.stack[to]);
      H.idx = to;
      // 看哪個人口變了就切到那個人口；選取變動的那隻（被移除的棋子回來就選牠）
      const lvs = [...new Set([...Object.keys(cur.data), ...Object.keys(nxt.data)])].map(Number);
      const diff = lvs.filter((lv) => JSON.stringify(cur.data[lv] || []) !== JSON.stringify(nxt.data[lv] || []));
      st.data = nxt.data; st.two = nxt.two; st.flex = nxt.flex; st.flexOwned = nxt.flexOwned; st.main = nxt.main;
      if (nxt.main !== cur.main) st.lv = st.main;  // 主圖人口變了（整條一起移）：回到主圖
      // 人口會跟著棋子數搬（relevel）：復原／重做後，看變動的人口裡「現在有棋子」的那張；沒有就留在原本那張，再不行回主圖
      const filled = diff.filter((lv) => champsOnly(nxt.data[lv] || []).length);
      if (filled.length && !filled.includes(st.lv)) st.lv = filled[0];
      else if (!filled.length && !champsOnly(nxt.data[st.lv] || []).length && st.lv !== st.main) st.lv = st.main;
      if (!st.data[st.lv]) st.lv = st.main;
      const had = new Set((cur.data[st.lv] || []).map(unitSig));
      st.sel = (st.data[st.lv] || []).find((u) => !isPlant(u) && !had.has(unitSig(u))) || null;
      st.side = null; st.pend = null; st.flexForm = null;
      st.dirty = true; st.msg = d < 0 ? "已復原上一步。要保留請按「儲存棋盤」。" : "已重做。要保留請按「儲存棋盤」。";
      draw();
    }
    root._undo = () => histGo(-1); root._redo = () => histGo(1);
    beLast = root;
    const draw = () => {
      histPush();
      const dkSc = dkList ? dkList.scrollTop : 0;   // 常駐挑選區是同一個元素、重畫時搬回來，捲動位置要自己記
      root.textContent = "";
      st.data[st.lv] = withPlants(st.data[st.lv]);  // 神木人數變了，植物跟著增減
      const units = st.data[st.lv];
      const pop = champsOnly(units).reduce((n, u) => n + (CH[u.key]?.slots || 1), 0);
      // 站主 2026-11-04：只放一張主圖的站位圖，其他人口放旁邊一區（升等要補、可以替換），要改其他人口從旁邊那區點進來
      const lvLabel = (lv) => (c.rerollLevel && lv === st.main ? `${lv} 等（賭${"一二三"[(c.rerollCost || 1) - 1]}費）` : `${lv} 人口`);
      const M = st.main;
      const main = h("div", { class: "be-main" });
      const live = Object.fromEntries(edLv().filter((lv) => champsOnly(st.data[lv]).length).map((lv) => ["lv" + lv, { status: "ok", units: st.data[lv] }]));
      const ed = { flex: st.flex, flexLevels: edLv().filter((lv) => lv === M || (lv > M && (champsOnly(st.data[lv]).length || levelsOf(c).includes(lv)))), stepLevels: edLv().filter((lv) => lv > M),
        sel: st.side, select: (k) => { st.side = k; st.flexForm = null; draw(); }, selPanel: sideSelPanel, addStep: pickStep, swapStep: pickSwap,
        delFlex: (lv, i) => { ownFlex(); st.flex["lv" + lv].splice(i, 1); st.side = null; changed("已刪除這組替換。"); },
        flexForm: st.flexForm, openFlexForm: (lv) => { st.flexForm = { lv, out: [], in: [] }; st.side = null; draw(); }, flexFormBox };
      const side = sidePanel(c, M, live, ed);
      const others = edLv().filter((lv) => lv !== M);
      if (others.length) side.append(h("div", { class: "fx-edit" }, h("p", { class: "fx-h" }, "調整其他人口的棋盤"),
        h("p", { class: "xs muted", style: "margin:0" }, "旁邊的「升等要補」是用這幾張算的，改完會跟著變。"),
        h("div", { class: "row" }, others.map((lv) => h("button", { type: "button", class: "chip", "aria-pressed": st.lv === lv ? "true" : "false", onclick: () => { st.lv = lv; st.sel = null; draw(); } }, lvLabel(lv))))));
      const wrap = h("div", { class: "bwrap has-side be-wrap" }, main, side);
      root.append(wrap);
      if (wide()) wrap.append(dock);   // 桌機：在棋盤旁邊（右欄最上面）；手機：在下面放在棋盤和選取面板之後（見下面）
      const put = (...xs) => main.append(...xs.filter(Boolean));
      put(st.lv === M ? h("p", { class: "be-lv" }, h("b", null, "主圖："), lvLabel(M))
        : h("div", { class: "be-lv other" }, h("b", null, `正在調整 ${lvLabel(st.lv)} 的棋盤`), h("button", { type: "button", class: "btn ghost", onclick: () => { st.lv = M; st.sel = null; draw(); } }, `← 回主圖（${lvLabel(M)}）`)));
      const ec = pop > st.lv ? candOf(live, st.lv) : null;  // 放的比人口多＝候選（站主 2026-11-09「放這些都可以」）
      const ecs = ec ? [...ec.cands] : [];
      put(ec ? h("p", { class: "small" }, `人口 ${st.lv}：固定 ${ec.fixed.length} 隻（和 ${ec.from} 人口一樣）＋虛線框的 ${ec.cands.length} 隻是候選，挑 ${ec.pick} 隻放（放哪${ec.pick > 1 ? "幾" : ""}隻都可以）`)
        : h("p", { class: "small" }, `人口 ${pop}／${st.lv}`, pop > st.lv ? h("b", { class: "warn" }, "（超出人口）") : null),
        traitBadges(traitsOf(units)));
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
          const cd = u && ecs.includes(u);
          const cell = h("div", { class: "hex" + (u ? " has" : "") + (isPlant(u) ? " is-plant" : "") + (cd ? " cand" : "") + (u && st.sel === u ? " sel" : "") + (!u && st.pend && st.pend[0] === r && st.pend[1] === col ? " pend" : ""), role: "gridcell", tabindex: "0", "data-r": r, "data-c": col,
            "aria-label": `${"ABCD"[r]}${col + 1}${u ? "：" + (isPlant(u) ? PLANT[u.plant] : champName(u.key)) + " " + u.star + " 星" + (rOn && u.mark ? "（首領標記）" : "") + (u.rider ? "（騎乘者）" : "") : "：空格"}` },
            u ? hexInner({ ...u, rider: u.rider && spryOn(units) && isSpry(u.key) }, rOn && isRift(u.key)) : h("span", { class: "hexlbl" }, `${"ABCD"[r]}${col + 1}`));
          cell.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); tapCell(r, col); } });
          if (u) dragable(cell, u); else cell.addEventListener("click", () => tapCell(r, col));
          // 站主 2026-11-08：「我在版面上右鍵點那隻角色就可以把他移出盤面」（手機長按也會觸發）；神木植物張數自動算，不能移出
          // 站主 2026-11-11：右鍵（手機長按）點棋子下面的裝備小圖＝只移出那一件；點棋子本身＝移出棋子。長按放開後不要接著當成點擊（st.noTap，tapCell 會擋）
          if (u && !isPlant(u)) cell.addEventListener("contextmenu", (ev) => {
            ev.preventDefault(); st.noTap = Date.now();
            const ic = ev.target.closest?.(".its > *"), i = ic ? [...ic.parentNode.children].indexOf(ic) : -1;
            if (i >= 0 && u.items?.[i]) { const it = u.items.splice(i, 1)[0]; changed(`已拿掉${champName(u.key)}的${itemName(it)}。`); } else removeUnit(u);
          });
          row.append(cell);
        }
        grid.append(row);
      }
      put(h("div", { class: "tablewrap" }, grid), h("p", { class: "xs muted" }, "上方為前排。點棋子選取；點別格＝自動按完成、照那格做（點空格＝放新棋子，點別隻＝選那隻）。按住棋子拖到別格＝移動或交換。按住裝備小圖拖到別隻棋子＝把裝備給牠（滿三件就交換）。右鍵（手機長按）點棋子＝移出棋盤，點棋子下面的裝備小圖＝只移出那一件。" + (wide() ? "右邊的「棋子／裝備」可以點或按住拖到棋盤上：點棋子＝放到選好的空格（沒有就放第一個空格）、拖到別隻棋子上＝取代牠（留下位置、星級、裝備）；點裝備＝給選取的棋子、拖到棋子上＝給那隻。" : "")));
      put(st.sel ? selPanel(st.sel) : h("div", { class: "card small" }, "還沒選棋子。點棋盤上的棋子可以改星級和裝備。"));
      if (!wide()) put(dock);
      put(h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => { if (wide()) { st.pend = null; DK.tab = "champ"; renderDock(); draw(); dock.scrollIntoView({ block: "nearest" }); } else pickChamp(null); } }, "＋ 加棋子"),
        h("button", { class: "btn ghost be-undo", type: "button", title: "復原（Ctrl+Z）", "aria-label": "復原上一步", disabled: !(bh().idx > 0), onclick: () => histGo(-1) }, "↶ 復原"),
        h("button", { class: "btn ghost be-redo", type: "button", title: "重做（Ctrl+Shift+Z）", "aria-label": "重做", disabled: !(bh().idx < bh().stack.length - 1), onclick: () => histGo(1) }, "↷ 重做"),
        h("button", { class: "btn", type: "button", onclick: saveBoard }, st.dirty ? "儲存棋盤" : "已是最新"),
        h("button", { class: "btn ghost", type: "button", onclick: () => { Object.assign(st, freshState(c, true)); BHIST[c.id] = null; st.msg = "已取消未儲存的變更。"; draw(); } }, "取消變更"),
        O.boards[c.id] ? h("button", { class: "btn ghost", type: "button", onclick: resetBoard }, "恢復資料預設") : null),
        h("p", { class: "xs muted", role: "status" }, st.msg));
      dockNote();
      if (dkList) dkList.scrollTop = dkSc;
    };
    const changed = (m) => { const r = relevel(); st.dirty = true; st.msg = [m, r].filter(Boolean).join(" ") || "有未儲存的變更。"; draw(); };
    // 站主 2026-11-08：「這是84陣容，所以應該只放8人口的版面…你要能隨著我修改而實時改動人口，旁邊的可以替換也要變」
    // 站主 2026-11-13：「6人口的編輯器變成五人口的時候你沒有跟著變阿，不只是9變8…」→ 這條規則每一等都適用，賭牌等級（主圖）也一樣：
    //   主圖 6 等拿掉一隻＝主圖變 5 等；其他人口的棋盤不動（站主選「只有主圖變 5 等」），旁邊升等要補多出 6 等讓站主填（edLv 主圖以上每一等都列）。
    function relevel(from = st.lv) {
      const to = popOf(st.data[from]);
      if (!from || to === from || to < 5 || to > 9 || champsOnly(st.data[to]).length) return null;
      if (from !== st.main && to <= st.main) return null;  // 其他人口那張（例：9 人口）拿到比主圖還少時不搬，等加回來
      st.data[to] = st.data[from]; st.data[from] = [];
      st.two[to] = !!st.two[from]; st.two[from] = false;
      if ((st.flex["lv" + from] || []).length && !(st.flex["lv" + to] || []).length) { st.flex["lv" + to] = st.flex["lv" + from]; st.flex["lv" + from] = []; }
      if (st.flexForm?.lv === from) st.flexForm.lv = to;
      if (st.side?.lv === from) st.side = null;
      if (st.main === from) st.main = to;
      if (st.lv === from) st.lv = to;
      return `場上是 ${to} 人口，這張圖改成 ${to} 人口的棋盤。`;
    }
    const removeUnit = (u) => { st.data[st.lv] = st.data[st.lv].filter((x) => x !== u); if (st.sel === u) st.sel = null; changed(`已從 ${st.lv} 人口的棋盤移出${champName(u.key)}。`); };
    const ownFlex = () => { st.flexOwned = true; };
    // 站主 2026-11-08：「你要給我可以拿掉原本的盤面的東西然後換上甚麼…你現在那個換掉超沒意義」
    // 主圖以上的等級還沒有完整棋盤時（空的，或只有後來加的幾隻），用下面一等的棋盤當底，再加上這一等多的；換棋子、加一組替換都從完整棋盤選
    const popOf = (us) => champsOnly(us).reduce((n, u) => n + (CH[u.key]?.slots || 1), 0);
    const baseBelow = (L) => { const lv = edLv().filter((x) => x < L && champsOnly(st.data[x]).length).sort((a, b) => b - a)[0]; return lv ? st.data[lv] : null; };
    function fullBoard(L) {
      const cur = st.data[L] || [];
      const base = L > st.main ? baseBelow(L) : null;
      if (!base || (champsOnly(cur).length && popOf(cur) >= popOf(base))) return cur;
      const have = new Set(champsOnly(cur).map((u) => u.key));
      return [...clone(champsOnly(base)).filter((u) => !have.has(u.key)), ...champsOnly(cur)];
    }
    function ensureBoard(L) {
      const full = fullBoard(L);
      if (full !== st.data[L]) st.data[L] = withPlants(autoPlace(full, c, baseBelow(L)));
      return st.data[L];
    }
    // 之前存過、只有幾隻的高等級棋盤，打開時先補成完整的（空的不動：代表這套不打到那一等）
    for (const L of edLv().filter((L) => L > st.main && champsOnly(st.data[L]).length)) ensureBoard(L);
    // 之前存的棋盤人口和等級對不上（例：存在 9 人口、其實只放 8 隻）→ 打開時就換到實際人口，按儲存才會存成新的
    if (!st.leveled) {
      st.leveled = true;
      const msgs = [...edLv()].sort((a, b) => b - a).map((L) => relevel(L)).filter(Boolean);
      if (!champsOnly(st.data[st.main]).length) { const L = edLv().find((x) => champsOnly(st.data[x]).length); if (L) st.main = st.lv = L; }
      if (msgs.length) { st.dirty = true; st.msg = msgs[0] + "按「儲存棋盤」就會存成這樣。"; }
    }
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
    // 主圖以上：這一等和更高等級一起改；主圖以下（還沒到主圖等級時先放）：只改那一等（站主 2026-11-10「你旁邊的不能改」）
    const spanLv = (lv) => (lv < st.main ? [lv] : edLv().filter((L) => L >= lv && L > st.main));
    function pickStep(lv) {
      const used = new Set(champsOnly(st.data[lv]).map((u) => u.key));
      picker(lv < st.main ? `${lv} 等先放的棋子` : `${lv} 等要補的棋子`, champGroups(used), (key) => {
        const its = recItems(key);
        for (const L of spanLv(lv)) {
          const arr = ensureBoard(L);
          if (!champsOnly(arr).some((u) => u.key === key)) { arr.push({ key, star: 2, items: [...its], pos: null }); autoPlace(arr, c, null); }
        }
        st.side = { kind: "step", lv, key }; st.flexForm = null;
        changed(lv < st.main ? `${lv} 等先放${champName(key)}（只改 ${lv} 等）。` : `${lv} 等補上${champName(key)}。`);
      });
    }
    // 升等換棋子：先選這一等場上要換掉的，再選換上的（或只拿掉）；這一等和更高等級（主圖以上）一起換，換上的站在原本那格
    function pickSwap(lv) {
      const here = champsOnly(fullBoard(lv));
      if (!here.length) return;
      picker(`${lv} 等要換掉哪隻`, [{ label: `${lv} 等場上`, items: here.map((u) => ({ key: u.key, name: champName(u.key), ico: icon("champion", u.key, "sm") })) }], (outKey) => {
        const used = new Set(here.map((u) => u.key));
        const groups = [...champGroups(used), { label: "不換上", items: [{ key: "__none__", name: `只拿掉${champName(outKey)}`, ico: icon("champion", outKey, "sm") }] }];
        picker(`${lv} 等：${champName(outKey)}換成`, groups, (inKey) => {
          const none = inKey === "__none__", its = none ? [] : recItems(inKey);
          for (const L of spanLv(lv)) {
            const arr = ensureBoard(L);
            const i = arr.findIndex((u) => u.key === outKey);
            const pos = i >= 0 ? arr[i].pos : null;
            if (i >= 0) arr.splice(i, 1);
            if (!none && !champsOnly(arr).some((u) => u.key === inKey)) { arr.push({ key: inKey, star: 2, items: [...its], pos }); if (!pos) autoPlace(arr, c, null); }
          }
          st.side = none ? null : { kind: "step", lv, key: inKey }; st.flexForm = null;
          const at = lv < st.main ? `${lv} 等` : `${lv} 等起`;
          changed(none ? `${at}拿掉${champName(outKey)}。` : `${at}${champName(outKey)}換成${champName(inKey)}。`);
        });
      });
    }
    // 「換一組：拿掉」裡的棋子：點了可以放回來（這一等以上，站回前一等的位置、帶前一等的星級裝備）
    function remSelPanel(k) {
      const prevU = () => edLv().filter((L) => L < k.lv).reverse().map((L) => champsOnly(st.data[L]).find((x) => x.key === k.key)).find(Boolean);
      const back = () => {
        const p = prevU() || { key: k.key, star: 2, items: recItems(k.key), pos: null };
        for (const L of spanLv(k.lv)) {
          const arr = ensureBoard(L);
          if (champsOnly(arr).some((x) => x.key === k.key)) continue;
          const taken = p.pos && arr.some((x) => x.pos && x.pos[0] === p.pos[0] && x.pos[1] === p.pos[1]);
          arr.push({ key: k.key, star: p.star || 2, items: [...(p.items || [])], pos: taken ? null : p.pos || null });
          if (taken || !p.pos) autoPlace(arr, c, null);
        }
        st.side = null; changed(`${k.lv} 等起把${champName(k.key)}放回來。`);
      };
      return h("div", { class: "card selp fx-selp" },
        h("b", { class: "small" }, `${k.lv} 等拿掉了${champName(k.key)}`),
        h("p", { class: "xs muted", style: "margin:0" }, `要留著就按「放回來」（${k.lv} 等以上都放回去）；要換成別隻用「⇄ 換棋子」。`),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", type: "button", onclick: back }, "放回來"),
          h("button", { class: "btn ghost", type: "button", onclick: () => { st.side = null; draw(); } }, "完成")));
    }
    function sideSelPanel(k) {
      let u, remove = null, after = null;
      if (k.kind === "rem") return remSelPanel(k);
      const below = k.lv < st.main;  // 還沒到主圖等級時先放的：只改那一等
      if (k.kind === "step") {
        u = champsOnly(st.data[k.lv]).find((x) => x.key === k.key);
        if (!u) return null;
        const higher = () => (below ? [] : edLv().filter((L) => L > k.lv).map((L) => champsOnly(st.data[L]).find((x) => x.key === k.key)).filter(Boolean));
        after = () => higher().forEach((x) => (x.items = [...u.items]));  // 同一隻在更高等級的裝備跟著改
        remove = () => {
          for (const L of below ? [k.lv] : edLv().filter((L) => L >= k.lv)) { const arr = st.data[L] || []; const j = arr.findIndex((x) => x.key === k.key); if (j >= 0) arr.splice(j, 1); }
          st.side = null; changed(below ? `已從 ${k.lv} 等拿掉${champName(k.key)}。` : `已從 ${k.lv} 等以上拿掉${champName(k.key)}。`);
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
          remove ? h("button", { class: "btn ghost", type: "button", onclick: remove }, below ? `從 ${k.lv} 等拿掉` : `從 ${k.lv} 等以上拿掉`) : null,
          h("button", { class: "btn ghost", type: "button", onclick: () => { st.side = null; draw(); } }, "完成")));
    }
    function flexFormBox(lv) {
      const f = st.flexForm;
      const onBoard = [...new Set(champsOnly(fullBoard(lv)).map((u) => u.key))];
      return h("div", { class: "card selp fx-form" },
        h("b", { class: "small" }, `新增一組替換（${lv} 人口）`),
        h("p", { class: "xs muted", style: "margin:0" }, `下面是 ${lv} 人口的完整棋盤：先點要拿掉的棋子（最多 3 隻），再選要換上的棋子。`),
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
      if (Date.now() - (st.noTap || 0) < 700) return;  // 長按移出後手指放開，不要接著開「放新棋子」
      const units = st.data[st.lv], u = units.find((x) => x.pos && x.pos[0] === r && x.pos[1] === col);
      if (u) { st.sel = st.sel === u ? null : u; st.side = null; st.pend = null; draw(); return; }
      // 站主 2026-11-10：「選定一個棋子之後，我按其他的格子妳不要讓棋子跳過去，要直接幫我按完成然後執行下一個動作，我按空白的格子就是要加棋子」
      // → 有選取時點空格＝先按完成、再在那格放新棋子；要換位置用拖的
      // 站主 2026-11-11：桌機有常駐的「棋子／裝備」挑選區 → 點空格＝選取那格、挑選區切到棋子分頁（點英雄就放到這格）；手機維持跳出挑選視窗
      if (wide()) {
        st.sel = null; st.side = null;
        st.pend = st.pend && st.pend[0] === r && st.pend[1] === col ? null : [r, col];
        if (st.pend && DK.tab !== "champ") { DK.tab = "champ"; renderDock(); }
        draw();
        if (st.pend) dock.scrollIntoView({ block: "nearest" });
        return;
      }
      if (st.sel || st.side) { st.sel = null; st.side = null; draw(); }
      pickChamp([r, col]);
    }
    function moveOrSwap(u, r, col) {
      const units = st.data[st.lv], other = units.find((x) => x !== u && x.pos && x.pos[0] === r && x.pos[1] === col);
      if (other) other.pos = u.pos ? [...u.pos] : null;
      u.pos = [r, col]; st.sel = u;
      changed(other ? `已和${champName(other.key)}交換位置。` : `已移到 ${"ABCD"[r]}${col + 1}。`);
    }
    // 站主 2026-11-08：「裝備我可以直接從一隻角色拖動到另一隻角色」→ 按住棋子下面的裝備小圖拖到別隻棋子＝把那件給牠；
    // 對方已經三件就交換（放在對方哪件裝備上就換那件，沒對準就換最後一件）。按住棋子本身拖照舊是移動／交換位置。
    function moveItem(from, idx, to, toIdx) {
      const it = from.items[idx];
      if (!it || from === to) return draw();
      to.items ||= [];
      if (to.items.length < 3) { from.items.splice(idx, 1); to.items.push(it); changed(`${itemName(it)}：${champName(from.key)} → ${champName(to.key)}。`); return; }
      const j = toIdx >= 0 && toIdx < to.items.length ? toIdx : to.items.length - 1;
      const other = to.items[j]; to.items[j] = it; from.items[idx] = other;
      changed(`${champName(to.key)}已經三件，${itemName(it)}和${itemName(other)}交換。`);
    }
    const unitAt = (t) => t && st.data[st.lv].find((x) => x.pos && x.pos[0] === +t.dataset.r && x.pos[1] === +t.dataset.c);
    function dragable(cell, u) {
      let sx = 0, sy = 0, drag = false, ghost = null, pid = null, itIdx = -1;
      cell.addEventListener("dragstart", (ev) => ev.preventDefault());  // 圖片的瀏覽器原生拖曳會中斷指標事件
      cell.addEventListener("pointerdown", (ev) => { if (ev.button > 0) return; sx = ev.clientX; sy = ev.clientY; drag = false; pid = ev.pointerId; cell.setPointerCapture(pid);
        const ic = !isPlant(u) && ev.target.closest?.(".its > *"); itIdx = ic ? [...ic.parentNode.children].indexOf(ic) : -1; });
      cell.addEventListener("pointermove", (ev) => {
        if (pid !== ev.pointerId) return;
        if (!drag && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          drag = true;
          if (itIdx >= 0) { ghost = h("span", { class: "item-ghost" }, icon("item", u.items[itIdx], "sm")); cell.classList.add("item-src"); }
          else { ghost = cell.cloneNode(true); ghost.className = "hex ghost"; }
          document.body.append(ghost);
        }
        if (drag) { ghost.style.left = ev.clientX - (itIdx >= 0 ? 16 : 24) + "px"; ghost.style.top = ev.clientY - (itIdx >= 0 ? 16 : 24) + "px";
          root.querySelectorAll(".hex.drop").forEach((x) => x.classList.remove("drop"));
          const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".be .hex");
          if (t && t !== cell && (itIdx < 0 || (t.classList.contains("has") && !t.classList.contains("is-plant")))) t.classList.add("drop"); }
      });
      const end = (ev) => {
        if (pid !== ev.pointerId) return; pid = null;
        if (ghost) { ghost.remove(); ghost = null; }
        cell.classList.remove("item-src");
        if (!drag) { tapCell(u.pos[0], u.pos[1]); return; }
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const t = el?.closest(".be .hex");
        if (itIdx >= 0) {
          const to = t && root.contains(t) && t !== cell ? unitAt(t) : null;
          if (to && !isPlant(to)) { const ti = el.closest(".its > *"); moveItem(u, itIdx, to, ti ? [...ti.parentNode.children].indexOf(ti) : -1); } else draw();
          return;
        }
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
        h("p", { class: "xs muted", style: "margin:0" }, "張數和星級跟著神木精靈人數自動變，這裡只能換位置：按住拖到別格。"),
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
          h("button", { class: "btn ghost", type: "button", onclick: () => removeUnit(u) }, "移出棋盤"),
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
      picker(`${champName(u.key)}的裝備`, itemGroups(), (key) => { if ((u.items || []).length >= 3) return; (u.items ||= []).push(key); after?.(); changed(`已給${champName(u.key)}${itemName(key)}。`); });
    }
    // ---------- 常駐的「棋子／裝備」挑選區（站主 2026-11-11：「規劃器那邊幫我把你這區棋子跟裝備加進去很好用」；跟戰鬥模擬器右邊那欄一樣的用法） ----------
    // 桌機：在棋盤旁邊（右欄最上面）；手機：在棋盤和選取面板下面。點＝放／給；桌機可以按住卡片拖到棋盤上（手機的手指拖曳要捲動清單，所以手機只能點）。
    // 分類表和戰鬥模擬器 site/sim/ui/item-cats.js 同一張（見上面 ITEM_CATS 的註解）。
    const DK = (st.dk ||= { tab: "champ", q: "", cost: "all", trait: "", kind: 0, iq: "", cat: "all" });
    const dock = h("div", { class: "card dock dock-side", "aria-label": "棋子／裝備挑選區" });
    const dkNote = h("p", { class: "xs muted dk-note", role: "status", style: "margin:0" });
    let dkList = null;
    function dockNote() {
      const sel = st.sel && !isPlant(st.sel) ? st.sel : null;
      dkNote.textContent = DK.tab === "champ"
        ? (st.pend ? `點棋子＝放到 ${"ABCD"[st.pend[0]]}${st.pend[1] + 1}；或拖到棋盤上` : "點棋子＝放到第一個空格；按住拖到空格＝放那格，拖到別隻身上＝取代牠。新棋子預設 2 星。")
        : (sel ? `點裝備＝給${champName(sel.key)}（${(sel.items || []).length}/3）；或按住拖到別隻棋子上` : "先點棋盤上的棋子再點裝備；或按住裝備拖到棋子上（滿三件會換掉那件）。");
    }
    const firstEmpty = () => { const us = st.data[st.lv]; for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 7; c2++) if (!us.some((x) => x.pos && x.pos[0] === r && x.pos[1] === c2)) return [r, c2]; return null; };
    // 放英雄：空格＝新增（預設 2 星）；有棋子的格子＝取代牠，保留位置、星級和裝備（跟戰鬥模擬器一樣，只換英雄）；神木植物的格子不能取代
    function dockPutChamp(key, cell) {
      const us = st.data[st.lv];
      const occ = cell && us.find((x) => x.pos && x.pos[0] === cell[0] && x.pos[1] === cell[1]);
      if (occ) {
        if (isPlant(occ)) { ownerNotice("神木植物的格子不能取代，放到別格。"); draw(); return; }
        if (occ.key === key) { draw(); return; }
        const old = champName(occ.key);
        occ.key = key; delete occ.mark; delete occ.rider; delete occ.starMix; st.sel = occ; st.pend = null;
        changed(`${old}換成${champName(key)}（留下位置、${occ.star} 星和裝備）。`); return;
      }
      const pos = cell || firstEmpty();
      if (!pos) { ownerNotice("棋盤已經滿了，先移出一隻再放。"); draw(); return; }
      const u = { key, star: 2, items: [], pos: [...pos] };
      us.push(u); st.sel = u; st.pend = null; st.side = null;
      changed(`已放${champName(key)}（2 星）到 ${"ABCD"[pos[0]]}${pos[1] + 1}。`);
    }
    // 給裝備：不到三件＝加上去；滿三件＝換掉 idx 那件（沒對準就換最後一件），跟 moveItem 一致
    function dockGiveItem(key, u, idx = -1) {
      if (!u || isPlant(u)) { ownerNotice("裝備只能給棋子。"); draw(); return; }
      u.items ||= [];
      if (u.items.length < 3) { u.items.push(key); st.sel = u; changed(`已給${champName(u.key)}${itemName(key)}。`); return; }
      const j = idx >= 0 && idx < u.items.length ? idx : u.items.length - 1, old = u.items[j];
      u.items[j] = key; st.sel = u; changed(`${champName(u.key)}已經三件，${itemName(old)}換成${itemName(key)}。`);
    }
    function dockTap(kind, key) {
      if (kind === "champ") {
        const cell = st.pend && !st.data[st.lv].some((x) => x.pos && x.pos[0] === st.pend[0] && x.pos[1] === st.pend[1]) ? st.pend : null;
        dockPutChamp(key, cell); return;
      }
      const u = st.sel && !isPlant(st.sel) ? st.sel : null;
      if (!u) { ownerNotice("先點棋盤上的一隻棋子，再點裝備。"); return; }
      if ((u.items || []).length >= 3) { ownerNotice(`${champName(u.key)}已經三件了。先拿掉一件（右鍵點裝備小圖），或把裝備拖到棋子上換掉一件。`); return; }
      dockGiveItem(key, u);
    }
    function renderDock() {
      dock.textContent = ""; dkList = null;
      const tab = (id, label) => h("button", { type: "button", role: "tab", "aria-selected": String(DK.tab === id), onclick: () => { DK.tab = id; renderDock(); dockNote(); } }, label);
      dock.append(h("div", { class: "tabs", role: "tablist" }, tab("champ", "棋子"), tab("item", "裝備")));
      const list = h("div", { class: "dk-list" });
      const search = h("input", { type: "search", placeholder: "搜尋名稱", "aria-label": DK.tab === "champ" ? "搜尋棋子" : "搜尋裝備", value: DK.tab === "champ" ? DK.q : DK.iq });
      const chipBtn = (label, on, fn) => h("button", { class: "chip", type: "button", "aria-pressed": on ? "true" : "false", onclick: fn }, label);
      const card = (kind, key, name, ico) => h("button", { class: "dk-card " + kind, type: "button", "data-kind": kind, "data-key": key, title: name }, ico, h("span", null, name));
      const hd = (t) => h("h4", { class: "pgh" }, t);
      if (DK.tab === "champ") {
        const costs = [["all", "全部"], ...[1, 2, 3, 4, 5].map((n) => [n, `${n} 費`]), ["other", "其他"]];
        const traitKeys = [...new Set(D.gamedata.champions.flatMap((x) => x.traits || []))].sort((a, b) => traitName(a).localeCompare(traitName(b), "zh-Hant"));
        const sel = h("div", { class: "tbgs dk-trf", role: "group", "aria-label": "羈絆篩選" },
          h("button", { type: "button", class: "chip", "aria-pressed": DK.trait ? "false" : "true", onclick: () => { DK.trait = ""; mark(); fill(); } }, "全部羈絆"),
          traitKeys.map((k) => traitBadge(k, null, { tag: "button", cls: "dk-trb", tip: traitName(k), onclick: () => { DK.trait = DK.trait === k ? "" : k; mark(); fill(); } })));
        const mark = () => { sel.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", (i === 0 ? !DK.trait : traitKeys[i - 1] === DK.trait) ? "true" : "false")); };
        mark();
        const fill = () => {
          list.textContent = "";
          const xs = D.gamedata.champions.filter((x) => (!DK.q || champName(x.key).toLowerCase().includes(DK.q) || x.key.toLowerCase().includes(DK.q) || (x.en || "").toLowerCase().includes(DK.q))
            && (!DK.trait || (x.traits || []).includes(DK.trait)));
          let any = false;
          for (const n of [1, 2, 3, 4, 5, "other"]) {
            if (DK.cost !== "all" && DK.cost !== n) continue;
            const g = xs.filter((x) => (n === "other" ? !(x.cost >= 1 && x.cost <= 5) : x.cost === n));
            if (!g.length) continue; any = true;
            list.append(hd(n === "other" ? "其他" : `${n} 費`), ...g.map((x) => card("champ", x.key, champName(x.key), icon("champion", x.key, "sm"))));
          }
          if (!any) list.append(h("p", { class: "small muted", style: "grid-column:1/-1" }, "找不到。"));
        };
        search.addEventListener("input", () => { DK.q = search.value.trim().toLowerCase(); fill(); });
        dock.append(h("div", { class: "dk-filters" }, search, sel), h("div", { class: "row pcats", role: "group", "aria-label": "費用" }, costs.map(([v, l]) => chipBtn(l, DK.cost === v, () => { DK.cost = v; renderDock(); }))), dkNote, list);
        fill();
      } else {
        const groups = itemGroups(); if (DK.kind >= groups.length) DK.kind = 0;
        const grp = groups[DK.kind];
        const fill = () => {
          list.textContent = "";
          const mk = (x) => card("item", x.key, x.name, x.ico);
          const term = DK.iq;
          const match = (x) => !term || x.name.toLowerCase().includes(term) || x.key.toLowerCase().includes(term);
          const items = grp.items.filter(match);
          const nodes = grp.cats ? catView(items, DK.cat, mk) : items.map(mk);
          list.append(...nodes);
          if (!nodes.length) list.append(h("p", { class: "small muted", style: "grid-column:1/-1" }, "找不到。"));
        };
        search.addEventListener("input", () => { DK.iq = search.value.trim().toLowerCase(); fill(); });
        dock.append(h("div", { class: "dk-filters" }, search),
          h("div", { class: "row pcats", role: "group", "aria-label": "裝備種類" }, groups.map((g, i) => chipBtn(g.label, DK.kind === i, () => { DK.kind = i; DK.cat = "all"; renderDock(); }))),
          grp.cats ? catChips(grp.items, DK.cat, (id) => { DK.cat = id; renderDock(); }) : null, dkNote, list);
        fill();
      }
      dkList = list;
      dockNote();
    }
    // 點（手機也可以）：放／給；按住拖（滑鼠）：放到那格或給那隻。拖曳結束後瀏覽器還會補一個 click，用 DK.sup 擋掉。
    dock.addEventListener("click", (ev) => { const k = ev.target.closest?.(".dk-card"); if (!k || DK.sup) return; dockTap(k.dataset.kind, k.dataset.key); });
    dock.addEventListener("dragstart", (ev) => ev.preventDefault());
    dock.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "touch" || ev.button > 0) return;
      const k = ev.target.closest?.(".dk-card"); if (!k) return;
      const kind = k.dataset.kind, key = k.dataset.key, sx = ev.clientX, sy = ev.clientY;
      let drag = false, ghost = null;
      const hexAt = (x, y) => { const t = document.elementFromPoint(x, y)?.closest(".be .board.edit .hex"); return t && root.contains(t) ? t : null; };
      const clearDrop = () => root.querySelectorAll(".hex.drop").forEach((x) => x.classList.remove("drop"));
      const mv = (e) => {
        if (!drag && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { drag = true; ghost = h("span", { class: "dk-ghost" }, kind === "champ" ? icon("champion", key, "sm") : icon("item", key, "sm")); document.body.append(ghost); }
        if (!drag) return;
        e.preventDefault();
        ghost.style.left = e.clientX - 20 + "px"; ghost.style.top = e.clientY - 20 + "px";
        clearDrop();
        const t = hexAt(e.clientX, e.clientY);
        if (t && (kind === "champ" ? !t.classList.contains("is-plant") : t.classList.contains("has") && !t.classList.contains("is-plant"))) t.classList.add("drop");
      };
      const done = (e) => {
        window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", done); window.removeEventListener("pointercancel", done);
        if (ghost) { ghost.remove(); ghost = null; }
        clearDrop();
        if (!drag) return;
        DK.sup = true; setTimeout(() => { DK.sup = false; }, 0);
        if (e.type === "pointercancel") return;
        const el = document.elementFromPoint(e.clientX, e.clientY), t = hexAt(e.clientX, e.clientY);
        if (!t) return;   // 拖到棋盤外：什麼都不做
        const r = +t.dataset.r, c2 = +t.dataset.c;
        if (kind === "champ") { dockPutChamp(key, [r, c2]); return; }
        const to = unitAt(t), ic = el?.closest(".its > *");
        if (!to || isPlant(to)) { ownerNotice("裝備要拖到有棋子的格子。"); return; }
        dockGiveItem(key, to, ic ? [...ic.parentNode.children].indexOf(ic) : -1);
      };
      window.addEventListener("pointermove", mv, { passive: false }); window.addEventListener("pointerup", done); window.addEventListener("pointercancel", done);
    });
    renderDock();
    if (mqWide.addEventListener) mqWide.addEventListener("change", () => { if (root.isConnected) draw(); });  // 視窗寬度跨過 1000px：挑選區在旁邊／在下面換位置

    async function saveBoard() {
      if (!st.dirty) return;
      const strip = (lv) => { const us = withPlants(st.data[lv]), on = riftOn(us), so = spryOn(us);
        return { units: us.map((u) => (isPlant(u) ? { plant: u.plant, star: u.star, pos: u.pos } : { key: u.key, star: u.star, items: (u.items || []).slice(0, 3), pos: u.pos,
          ...(on && u.mark && isRift(u.key) ? { mark: true } : {}), ...(so && u.rider && isSpry(u.key) ? { rider: true } : {}) })), twoMarks: on && !!st.two[lv] }; };
      const flex = st.flexOwned ? Object.fromEntries(Object.entries(st.flex).map(([k, xs]) => [k, (xs || []).slice(0, 8).map((x) => ({ out: x.out.slice(0, 3), in: x.in.slice(0, 3),
        items: Object.fromEntries(x.in.slice(0, 3).map((k2) => [k2, ((x.items || {})[k2] || []).slice(0, 3)])) }))])) : null;
      const doc = { compId: c.id, main: st.main, ...Object.fromEntries([...new Set([...edLv(), ...Object.keys(st.data).map(Number)])].map((lv) => ["lv" + lv, strip(lv)])), ...(flex ? { flex } : {}), at: new Date().toISOString() };
      st.msg = "儲存中…"; draw();
      try { await O.db.doc("boards/" + c.id).set(doc); O.boards[c.id] = doc; st.dirty = false; st.msg = "已儲存。下次更新時會套到正式站。"; }
      catch (err) { st.msg = "儲存失敗：" + (err?.message || "請再試一次") + "。變更還在，可以再按一次儲存。"; }
      draw();
    }
    async function resetBoard() {
      st.msg = "恢復中…"; draw();
      try { await O.db.doc("boards/" + c.id).delete(); delete O.boards[c.id]; const base = { ...c, boards: c.boardsBase || c.boards }; Object.assign(st, freshState(base, false)); BHIST[c.id] = null; st.msg = "已恢復成資料預設的棋盤。"; }
      catch (err) { st.msg = "恢復失敗：" + (err?.message || "請再試一次"); }
      draw();
    }
    root._dismiss = () => { if (st.sel || st.side || st.pend) { st.sel = null; st.side = null; st.pend = null; draw(); } };
    draw();
    return root;
  }

  /* ---------- 啟動 ---------- */
  async function boot() {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const [d, m] = await Promise.all([fetch(dataUrl("site-data.json"), { signal: ctl.signal }).then((r) => r.json()),
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
    XI = Object.fromEntries([...(D.gamedata.components || []), ...(D.gamedata.extraItems || [])].map((i) => [i.key, i]));  // 散件也要有中文名（站主 11/21：隨手速查「為什麼適合」顯示 RecurveBow）
    EM = Object.fromEntries((D.gamedata.emblems || []).map((i) => [i.key, i]));
    TR = Object.fromEntries(D.gamedata.traits.map((t) => [t.key, t]));
    $("#loading").remove();
    adaptLayout();
    if (S19 && S19FULL() && !D.updateNotes?.length) $("#updates-sec")?.remove();
    if (S19 && !S19FULL()) {  // S19 預測版：沒有高手資料，本次更新、版本主軸、隨手速查、定陣路線、高手 RP 都不放
      for (const id of ["#updates-sec", "#version", "#picker"]) $(id)?.remove();
      renderTop(); renderTiers(); renderPatch(); renderLearnHub(); renderCompList(); renderResearch(); renderRp(); renderWiki(); applyDataTx();  // 站主 11/19：S19 也要有「改動一覽」、「高手的RP呢?」
    } else {
      renderTop(); if ($("#updates")) renderUpdates(); renderPatch(); renderVersion(); renderTiers(); renderPicker(); renderRoute(); if (S19) renderLearnHub(); renderCompList(); renderResearch(); renderRp(); renderWiki(); applyDataTx();
    }
    document.querySelectorAll("a.out").forEach((a) => a.addEventListener("click", () => track("out", a.dataset.ch)));
    addEventListener("hashchange", route); route();
    startAnalytics();
    startOwner();
  }
  window.__choko = { S, evaluate: (id) => evaluate(D.comps.find((c) => c.id === id)), renderPicker };
  boot();
})();

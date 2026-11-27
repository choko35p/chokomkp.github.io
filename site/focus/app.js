/* Course controls live outside the game. Each mount opens a single playable decision. */
(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("practice")==="coach") return;
  const skills = FocusCourseVisibility.names;
  const {chapterOf,tierOf} = FocusCourseOrder;
  const descriptions = {
    combined:"看場上、備戰和商店，在能吃利息的情況下擺出最強盤面。",
    retention:"先留能接進場上的棋。確認後，下一回合用手上的牌升星、換人。",
    augment:"先看當下最缺什麼，再從三張增幅挑一張。",
    route:"從 2-1 的牌和裝備選方向。挑戰題加入同行偵查。",
    routeAugment:"已決定升八找四費，練習選下一個增幅。",
    transition:"沿著同一局的自然商店，練習在開始 D 牌前逐輪補強。"
  };
  const tiers = {basic:"入門", advanced:"進階", challenge:"挑戰"};
  const storeKey = "choko.s19.focus.course.v1";
  const $ = id => document.getElementById(id);
  const allQuestions = FocusCourseOrder.sort([...FocusBankA,...FocusBankB]);
  const published = FocusCourseVisibility.isPublished;
  const questions = allQuestions.filter(FocusCourseVisibility.isQuestionPublished);
  const publishedIds = new Set(questions.map(q=>q.id));
  const engine = FocusEngine;
  const catalog = FocusCatalog;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storeKey)) || {}; } catch {}
  const progress = engine.createProgress(saved.progress,catalog,saved.drafts);
  const drafts = saved.drafts || {};
  let current, game, view, demo, storageWarned = false;
  let hintIndex = 0, hintStep = 0;
  let routePickerOpen = false;
  let routeHadSlam = false, routeScouting = false, rivalIndex = -1;
  let renderedRivals = null, renderedRival = null;
  const dialog = $("lesson-dialog");
  const body = $("dialog-content");
  const group = (skill,tier) => questions.filter(q => chapterOf(q) === skill && tierOf(q) === tier);
  const byId = id => questions.find(q => q.id === id);
  const home = $("course-home"), playBar = document.querySelector(".lesson-bar");
  const checkedDrafts = new WeakSet();
  let choice = saved.homeChoice || {}, onHome = true;
  function remember() {
    try { localStorage.setItem(storeKey, JSON.stringify({current:current?.id || saved.current,
      progress:progress.export(),drafts,homeChoice:choice})); }
    catch { if (!storageWarned && !onHome) { storageWarned = true; note("這個瀏覽器未能儲存進度，本次可繼續練習。"); } }
  }
  function persist() {
    if (!current || !game) return;
    drafts[current.id] = {game:game.export(), at:Date.now(), hintIndex, hintStep};
    const recent = Object.entries(drafts).filter(([id])=>publishedIds.has(id)).sort((a,b) => b[1].at-a[1].at);
    for (const [id] of recent.slice(8)) delete drafts[id];
    remember();
  }
  function node(tag,text) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    return el;
  }
  function button(text,fn,parent,primary=false) {
    const b = node("button",text);
    b.type = "button";
    b.classList.toggle("primary",primary);
    b.addEventListener("click",fn);
    parent.append(b);
    return b;
  }
  function actions() { const row = node("div"); row.className = "course-buttons"; body.append(row); return row; }
  function hideNote() { $("lesson-note").hidden = true; $("lesson-note").replaceChildren(); }
  function closeHints() {
    $("lesson-hints").hidden = true;
    $("lesson-hint-toggle").setAttribute("aria-expanded","false");
    $("lesson-hint-text").textContent = "";
    $("lesson-hint-count").textContent = "";
  }
  function brief() { return FocusLessonBriefs.forStep(current,game.stepIndex); }
  function showHint(index=hintIndex) {
    const tips = brief().hints;
    if (!tips?.length || onHome || demo) return;
    hintIndex = Math.max(0,Math.min(index,tips.length-1));
    game.hint();
    $("lesson-hint-toggle").setAttribute("aria-expanded","true");
    $("lesson-hint-prev").hidden = hintIndex === 0;
    $("lesson-hint-next").hidden = hintIndex === tips.length-1;
    $("lesson-hints").hidden = false;
    $("lesson-hint-count").textContent = "提示 "+(hintIndex+1)+"／"+tips.length;
    $("lesson-hint-text").textContent = tips[hintIndex];
    persist();
  }
  $("lesson-hint-toggle").onclick = () => $("lesson-hints").hidden ? showHint() : closeHints();
  $("lesson-hint-prev").onclick = () => {
    showHint(hintIndex-1);
    if ($("lesson-hint-prev").hidden) $("lesson-hint-next").focus();
  };
  $("lesson-hint-next").onclick = () => {
    showHint(hintIndex+1);
    if ($("lesson-hint-next").hidden) $("lesson-hint-close").focus();
  };
  $("lesson-hint-close").onclick = () => { closeHints(); $("lesson-hint-toggle").focus(); };
  function note(text,controls) {
    const box = $("lesson-note");
    box.replaceChildren(node("span",text));
    if (controls) controls(box);
    else button("收起",hideNote,box);
    box.hidden = false;
  }
  function openDialog(title) {
    $("dialog-title").textContent = title; body.replaceChildren();
    dialog.classList.remove("with-option-review");
    dialog.scrollTop=0;
    if (!dialog.open) dialog.showModal();
  }
  function refreshRoute() {
    const workbench=$("route-workbench");
    const session=demo?.session || game;
    const prep=!onHome && current?.skill==="route" && session?.routePreparation?.();
    workbench.hidden=!prep;
    if(!prep){routePickerOpen=false;routeHadSlam=false;routeScouting=false;rivalIndex=-1;$("focus-game").inert=false;return;}
    const picked=session.round().plans.find(card=>card.id===session.state.currentPlan);
    const worn=prep.worn;
    const hasSlam=worn.length>0;
    const needsScout=prep.scoutTotal>0 && !prep.scoutComplete;
    if(!prep.ready || needsScout || routeScouting || demo)routePickerOpen=false;
    else if(hasSlam && !routeHadSlam && !routeScouting && !picked && window.matchMedia?.("(min-width: 761px) and (min-height: 560px)").matches){
      routePickerOpen=true;
      buildRouteCards();
    }
    routeHadSlam=!demo && hasSlam;
    const held=worn.map(p=>catalog.units[p.id].name+"（"+p.items.join("、")+"）").join("、");
    $("route-selection").textContent=picked?"已選方向　"+picked.name:
      held?"二星持裝　"+held:prep.upgraded?"合裝給剛升二星的棋子，讓他上場。":"從商店買出二星。";
    const toggle=$("route-toggle");
    toggle.disabled=!prep.ready || needsScout || routeScouting || !!demo;
    toggle.textContent=routePickerOpen?"收起選項":prep.selected?"更改陣容方向":"選擇陣容方向";
    toggle.setAttribute("aria-expanded",String(routePickerOpen));
    toggle.classList.toggle("route-secondary",!!prep.selected);
    $("route-picker").hidden=!routePickerOpen;
    if(routePickerOpen)for(const card of $("route-cards").children){
      card.setAttribute("aria-pressed",String(card.dataset.routeChoice===session.state.currentPlan));
    }
    const contest=$("route-contest"), count=$("route-contest-count");
    contest.hidden=!picked || !prep.scoutTotal || routePickerOpen || routeScouting || !!demo;
    if(!contest.hidden){
      $("route-contest-label").textContent=picked.name+"有幾家同行？";
      count.value=prep.contestCount===null ? "" : String(prep.contestCount);
    }
    refreshScouting(session,prep);
  }
  function scoutNode(tag,className,text){
    const el=node(tag,text);
    el.className=className;
    return el;
  }
  function scoutUnitName(piece){
    return catalog.units[piece.id]?.name || piece.id;
  }
  function scoutLabel(rival,index){
    return engine.scoutLabel(rival.name,index);
  }
  function scoutToken(piece){
    const unit=catalog.units[piece.id], name=scoutUnitName(piece);
    const token=scoutNode("span","scout-token");
    token.dataset.scoutUnit=piece.id;
    token.title=[name,piece.star+" 星",...(piece.items || [])].join(" · ");
    token.setAttribute("aria-label",token.title);
    if(unit?.icon)token.append(art(unit.icon));
    token.append(scoutNode("span","scout-stars","★".repeat(piece.star)),scoutNode("span","scout-name",name));
    return token;
  }
  function scoutBoard(rival,index,traits){
    const column=scoutNode("section","scout-board-column");
    const head=scoutNode("div","scout-board-head");
    const label=scoutLabel(rival,index);
    const heading=node("h3",label);
    heading.setAttribute("aria-live","polite");
    head.append(heading,node("span","等級 "+rival.level+"　·　前排在上"));
    const field=scoutNode("div","scout-field");
    field.setAttribute("role","group");
    field.setAttribute("aria-label",label+"的四排七格棋盤");
    const positions=new Map(rival.units.map(piece=>[piece.cell,piece]));
    for(let cell=0;cell<28;cell++){
      const row=Math.floor(cell/7), col=cell%7;
      const hex=scoutNode("div","scout-hex");
      hex.dataset.scoutCell=String(cell);
      hex.style.setProperty("--scout-col",String(col+(row%2)/2));
      hex.style.setProperty("--scout-row",String(row));
      const piece=positions.get(cell);
      if(piece){
        const token=scoutToken(piece);
        hex.setAttribute("aria-label","第 "+(row+1)+" 排第 "+(col+1)+" 格，"+token.title);
        const items=scoutNode("span","scout-token-items");
        for(const item of piece.items || []){
          const icon=catalog.items[item]?.icon;
          if(icon)items.append(art(icon,item));
        }
        if(items.children.length)token.append(items);
        hex.append(token);
      }else hex.setAttribute("aria-hidden","true");
      field.append(hex);
    }
    const active=scoutNode("div","scout-traits");
    active.append(node("h4","已啟動羈絆"));
    for(const trait of traits){
      const tag=scoutNode("span","scout-trait",trait.active+" "+trait.name);
      tag.dataset.scoutTrait=trait.name;
      tag.title=trait.name+"，場上 "+trait.count+" "+trait.unit+"，已啟動 "+trait.active+" "+trait.unit+"檔";
      tag.setAttribute("aria-label",tag.title);
      active.append(tag);
    }
    if(!traits.length)active.append(node("span","無"));
    const reserve=scoutNode("div","scout-reserve");
    reserve.append(node("h4","備戰席"));
    for(const piece of rival.bench || []){
      const token=scoutNode("span","scout-reserve-piece"), unit=catalog.units[piece.id];
      if(unit?.icon)token.append(art(unit.icon));
      token.append(node("span",scoutUnitName(piece)+" "+"★".repeat(piece.star)));
      reserve.append(token);
    }
    if(!rival.bench?.length)reserve.append(node("span","空"));
    column.append(head,field,active,reserve);
    return column;
  }
  function scoutEvidence(rival){
    const sidebar=scoutNode("div","scout-evidence");
    const augments=scoutNode("section","scout-augments");
    augments.append(node("h4","已選增幅"));
    for(const pick of rival.augments){
      const card=catalog.augments[pick.id];
      const detail=scoutNode("details","scout-augment");
      detail.dataset.scoutAugment=pick.id;
      const summary=node("summary");
      if(card.icon)summary.append(art(card.icon));
      const caption=node("span");
      caption.append(node("small",pick.stage),node("b",card.name));
      summary.append(caption);
      detail.append(summary,node("p",card.description));
      augments.append(detail);
    }
    const equipment=scoutNode("section","scout-equipment");
    equipment.append(node("h4","持裝棋子"));
    function addHolder(piece,benched){
      if(!piece.items?.length)return;
      const holder=scoutNode("div","scout-holder");
      const unit=catalog.units[piece.id];
      const caption=scoutNode("div","scout-holder-name");
      if(unit?.icon)caption.append(art(unit.icon));
      caption.append(node("b",scoutUnitName(piece)),node("small",benched?"備戰席":piece.star+" 星"));
      holder.append(caption);
      for(const name of piece.items){
        const row=scoutNode("div","scout-held-item");
        const item=catalog.items[name];
        if(item?.icon)row.append(art(item.icon));
        row.append(node("span",name));
        holder.append(row);
      }
      equipment.append(holder);
    }
    rival.units.forEach(piece=>addHolder(piece,false));
    (rival.bench || []).forEach(piece=>addHolder(piece,true));
    if(equipment.children.length===1)equipment.append(node("p","沒有棋子持裝"));
    sidebar.append(augments,equipment);
    return sidebar;
  }
  function displayRival(session,index){
    const rival=session.step.routeStrategy?.scout?.boards?.[index];
    if(renderedRival===rival)return;
    const detail=$("route-scout-detail");
    if(rival)detail.replaceChildren(scoutBoard(rival,index,session.scoutTraits(index)),scoutEvidence(rival));
    else detail.replaceChildren(node("p","選一位對手查看棋盤。"));
    renderedRival=rival;
  }
  function refreshScouting(session,prep) {
    const scouts=current.tier==="challenge" ? session.step.routeStrategy?.scout?.boards || [] : [];
    const toggle=$("route-scout-toggle"), panel=$("route-scout-panel");
    toggle.hidden=!scouts.length;
    toggle.disabled=!!demo;
    const seen=prep.scouted || [];
    if(!scouts.length)routeScouting=false;
    toggle.textContent="偵查對手　"+seen.length+"／"+scouts.length;
    toggle.classList.toggle("scout-pending",!!scouts.length && !prep.scoutComplete && !routeScouting);
    toggle.setAttribute("aria-expanded",String(routeScouting));
    panel.hidden=!routeScouting;
    $("focus-game").inert=routeScouting;
    if(!routeScouting)return;
    $("route-scout-progress").textContent="已偵查 "+seen.length+"／"+scouts.length;
    $("route-scout-close").textContent=demo?"換我試一次":prep.scoutComplete?"回棋盤選方向":"回到我的棋盤";
    $("route-scout-demo").hidden=!demo;
    const rivals=$("route-scout-rivals");
    if(renderedRivals!==scouts){
      renderedRivals=scouts;
      rivals.replaceChildren();
      scouts.forEach((rival,i)=>{
        const b=button("",()=>inspectRival(i),rivals);
        b.dataset.scoutIndex=String(i);
        b.setAttribute("aria-controls","route-scout-detail");
        const seat="對手 "+(i+1), label=scoutLabel(rival,i);
        b.append(scoutNode("span","scout-seat",seat));
        if(label!==seat)b.append(scoutNode("span","scout-nick",label.slice(seat.length)));
      });
    }
    if(!seen.includes(rivalIndex))rivalIndex=seen.at(-1) ?? -1;
    for(const [i,b] of Array.from(rivals.children).entries()){
      b.setAttribute("aria-pressed",String(i===rivalIndex));
      b.disabled=!!demo;
      const visited=seen.includes(i);
      b.dataset.visited=String(visited);
      b.setAttribute("aria-label",scoutLabel(scouts[i],i)+(visited?"，已看":"，尚未看"));
    }
    displayRival(session,rivalIndex);
  }
  function inspectRival(i){
    if(!routeScouting || demo)return;
    const rival=game.step.routeStrategy?.scout?.boards?.[i];
    if(!rival || $("route-scout-panel").hidden)return;
    displayRival(game,i);
    if(!(game.routePreparation().scouted || []).includes(i)){
      const result=game.act("scout",{index:i});
      if(!result.ok){refreshRoute();note(result.message);return;}
      if(game.routePreparation().scoutComplete)view.render();
    }
    rivalIndex=i;
    $("route-scout-panel").scrollTop=0;
    hideNote();refreshRoute();refreshTools();persist();
  }
  function toggleScouts(open,focus=true,showPlayer=true) {
    if((demo && open) || onHome || current?.tier!=="challenge" || !current?.routeStrategy?.scout?.boards?.length)return;
    routeScouting=open;
    if(open)routePickerOpen=false;
    refreshRoute();resizeStage();
    if(open && showPlayer){
      const seen=game.routePreparation().scouted;
      const next=current.routeStrategy.scout.boards.findIndex((rival,i)=>!seen.includes(i));
      inspectRival(next>=0?next:Math.max(rivalIndex,0));
    }
    if(focus)(open?$("route-scout-rivals").children[Math.max(0,rivalIndex)]:$("route-scout-toggle"))?.focus({preventScroll:true});
  }
  function buildRouteCards() {
    const cards=$("route-cards");
    cards.replaceChildren();
    for(const option of game.round().plans){
      const route=catalog.routes.find(r=>r.id===option.id);
      const card=button("",()=>{
        if(game.state.currentPlan!==option.id){
          const result=game.act("plan",{id:option.id});
          if(!result.ok){
            if(!game.routePreparation().scoutComplete && game.step.routeStrategy?.scout)toggleScouts(true);
            note(result.message);return;
          }
        }
        hideNote(); routePickerOpen=false; view.render(); refreshBar(); persist();
        const next=$("route-contest").hidden ? $("focus-game").querySelector(".tt-go") : $("route-contest-count");
        next?.focus({preventScroll:true});
      },cards);
      card.className="route-card";
      card.dataset.routeChoice=option.id;
      const carry=Object.values(catalog.units).find(u=>u.name===option.carry) || catalog.units[route?.carryIds?.[0]];
      if(carry?.icon)card.append(art(carry.icon));
      else card.classList.add("route-text-card");
      const copy=node("span");
      copy.append(node("b",option.name),node("small",option.description || (carry?"接裝主力　"+carry.name:"")));
      card.append(copy);
    }
  }
  function toggleRoute(open) {
    if(onHome || demo || routeScouting || current?.skill!=="route" || !game.routePreparation?.()?.ready)return;
    routePickerOpen=open;
    if(open){routeScouting=false;buildRouteCards();}
    refreshRoute();resizeStage();
    if(open){
      const cards=$("route-cards");
      (cards.querySelector('[aria-pressed="true"]') || cards.children[0])?.focus({preventScroll:true});
    }else $("route-toggle").focus({preventScroll:true});
  }
  $("route-toggle").onclick=()=>toggleRoute(!routePickerOpen);
  $("route-contest-count").onchange=event=>{
    const value=event.target.value;
    if(!/^\d$/.test(value))return;
    const result=game.act("contestCount",{count:Number(value)});
    if(!result.ok){note(result.message);return;}
    hideNote();view.render();refreshBar();persist();
  };
  $("route-scout-toggle").onclick=()=>toggleScouts(!routeScouting);
  $("route-scout-close").onclick=()=>{
    if(demo)return endDemo();
    toggleScouts(false);
    if(game.routePreparation().scoutComplete)toggleRoute(true);
  };
  $("route-scout-demo").onclick=()=>demoStep();
  $("route-workbench").addEventListener("keydown",e=>{
    if(e.key==="Escape" && routePickerOpen){e.preventDefault();toggleRoute(false);}
    else if(e.key==="Escape" && routeScouting){e.preventDefault();toggleScouts(false);}
  });
  function targetCarryName(q) {
    return catalog.units[q.targetCarry]?.name || q.targetCarry;
  }
  function refreshBar() {
    const {skill,tier,number,total} = FocusCourseOrder.position(questions,current.id);
    let label = skills[skill] + "　／　" + tiers[tier] + " " + number + "／" + total;
    const meta = $("lesson-meta");
    if (current.skill==="retention") {
      meta.dataset.retentionStep=String(game.stepIndex+1);
      label += game.stepIndex===0 ? "　·　1/2 留牌" : "　·　2/2 升星上場";
    } else {
      delete meta.dataset.retentionStep;
      if (game.stepCount > 1) label += "　·　第 " + (game.stepIndex+1) + " 間商店";
    }
    if (demo) label += "　·　示範中";
    meta.textContent = label;
    if (hintStep !== game.stepIndex) {
      hintStep=game.stepIndex;
      hintIndex=0;
      closeHints();
    }
    const {goal,hints}=brief();
    $("lesson-goal").textContent=goal;
    $("lesson-hint-toggle").hidden=!hints.length || !!demo;
    $("lesson-help").textContent = demo ? "回到練習" : "看教學";
    refreshRoute();
    refreshTools();
  }
  function refreshTools() {
    const editable=!!game && !onHome && !demo && view?.canEdit?.()!==false;
    const key=view?.getUndoLabel?.() ?? "Ctrl+Z";
    $("lesson-undo").disabled=!editable || !game.canUndo();
    $("lesson-undo-key").hidden=!key;
    $("lesson-undo-key").textContent=key || "";
    $("lesson-undo").title=game?.canUndo() ? "復原最近一次操作" : "已在可復原的起點";
    $("lesson-keys").disabled=!editable;
  }
  function undoAction() {
    if(onHome || demo || dialog.open || view?.canEdit?.()===false || !game.canUndo())return false;
    const result=game.undo();
    if(!result.ok)return false;
    hideNote();
    if(view.afterUndo)view.afterUndo(); else mount();
    refreshBar();persist();
    $("undo-status").textContent=result.message;
    if(result.stepChanged)note(result.message);
    return true;
  }
  function markAction(action) {
    const host = $("focus-game");
    host.querySelectorAll(".course-cue").forEach(el => el.classList.remove("course-cue"));
    if (!action) return;
    let desc;
    if (action.from) {
      const {zone,index} = action.from;
      desc = zone === "bench" ? "bench:" + index : "board:" + Math.floor(index/7) + "," + (index%7);
    } else if (action.type === "buy") desc = "shop:" + action.index;
    else if (action.type === "equip") desc = "item:" + action.itemIndex;
    else if (action.type === "combine") desc = "item:" + action.a;
    if (desc) host.querySelector('[data-tt-tap="' + desc + '"]')?.classList.add("course-cue");
  }
  function mount() {
    if (view) view.destroy();
    const display = demo ? new Proxy(demo.session,{get(target,key) {
      if (key === "act" || key === "undo" || key === "reset") return () => ({ok:false,message:"按「看這一步」觀看操作，或回到練習自己試。"});
      return target[key];
    }}) : game;
    view = FocusNativeUI.mount($("focus-game"),{
      session:display, catalog,
      readOnly:!!demo, onUndo:undoAction, onHotkeyChange:refreshTools, onModeChange:refreshTools,
      onChange:() => { refreshBar(); if (!demo) persist(); },
      onLessons:picker, onRouteChoices:()=>toggleRoute(true),
      isRouteScouting:()=>routeScouting,
      onRouteScout:current.tier==="challenge" && current.routeStrategy?.scout ? direction=>{
        const count=game.routePreparation().scoutTotal;
        if(!count)return;
        const previous=routeScouting?rivalIndex:-1;
        toggleScouts(true,false,false);
        const index=direction<0?(previous<=0?count-1:previous-1):(previous+1)%count;
        inspectRival(index);
      } : null,
      onRouteScoutHome:()=>{if(routeScouting)toggleScouts(false);},
      submitLabel:current.skill==="retention" ? ()=>demo ? "看這一步" : game.stepIndex===0 ? "確認留牌" : "確認上場" : null,
      onSubmit:() => { if (demo) demoStep(); else submit(); }
    });
    refreshBar();
  }
  function setAddress(hash, replace=false) {
    if (location.hash !== hash) history[replace?"replaceState":"pushState"](null,"",hash);
  }
  function screen(isHome) {
    onHome = isHome;
    document.body.classList.toggle("at-catalog",isHome);
    home.hidden = !isHome;
    playBar.hidden = isHome;
    $("focus-game").hidden = isHome;
    if(isHome){closeHints();routePickerOpen=false;routeScouting=false;$("route-workbench").hidden=true;}
    document.querySelector('meta[name="theme-color"]').content = isHome ? "#f8f5ed" : "#0a1420";
  }
  function start(q,{fresh=false,navigate=true}={}) {
    if (!q || !FocusCourseVisibility.isQuestionPublished(q)) return;
    if (dialog.open) dialog.close();
    if (current && !onHome) persist();
    hideNote(); closeHints();
    current = q; demo = null; routePickerOpen=false; routeHadSlam=false; routeScouting=false; rivalIndex=-1; choice = {skill:chapterOf(q),tier:tierOf(q),id:q.id};
    if (navigate) setAddress("#q="+encodeURIComponent(q.id));
    screen(false);
    let draft = fresh ? null : drafts[q.id];
    try { game = engine.create(q,catalog,draft?.game ? {...draft.game,legacyRoundStart:draft.roundStart?.game?.state} : undefined); }
    catch (e) {
      if (!drafts[q.id]) throw e;
      delete drafts[q.id]; draft = null; game = engine.create(q,catalog);
    }
    hintStep=game.stepIndex;
    const savedIndex=draft?.hintIndex;
    hintIndex=(draft?.hintStep ?? 0)===hintStep && Number.isInteger(savedIndex) && savedIndex>=0 && savedIndex<brief().hints.length ? savedIndex : 0;
    mount(); persist();
    $("lesson-goal").focus({preventScroll:true});
    const previous=game.lastSubmission;
    if (previous?.passed || previous?.optionReviews?.length) showResult(previous);
  }
  function art(src,alt="") { const img=node("img"); img.src=src; img.alt=alt; img.draggable=false; return img; }
  function renderPreview(q) {
    const source=q.initial, grid=$("preview-grid"), bench=$("preview-bench");
    grid.replaceChildren();
    const positions=new Map();
    (source.board || []).forEach((p,i)=>{
      if(!p)return;
      const piece=typeof p==="string"?{id:p}:p;
      const cell=piece.cell??piece.index??(piece.r!=null && piece.c!=null?piece.r*7+piece.c:i);
      positions.set(cell,piece);
    });
    for (let r=0;r<4;r++) {
      const row=node("div"); row.className="preview-row";
      for (let c=0;c<7;c++) {
        const hex=node("i"); hex.className="preview-hex";
        const piece=positions.get(r*7+c);
        if(piece) {
          hex.classList.add("occupied");
          hex.append(art(catalog.units[piece.id].icon));
          if((piece.star || 1)>1) hex.append(node("b","★".repeat(piece.star)));
        }
        row.append(hex);
      }
      grid.append(row);
    }
    const target=q.skill==="routeAugment" && targetCarryName(q);
    $("preview-stage").textContent="回合 "+(q.round || q.steps[0].round).id+(target?"　·　八等找"+target:"");
    $("preview-coin").src=catalog.uiIcons.gold_coin;
    $("preview-gold").textContent=source.gold;
    const reserve=(source.bench || []).filter(Boolean).map(p=>typeof p==="string"?{id:p}:p);
    bench.replaceChildren(node("span",reserve.length?"備戰區":"上場棋子"));
    if(reserve.length) {
      const pics=node("div"); pics.className="reserve-pictures";
      for(const p of reserve.slice(0,3))pics.append(art(catalog.units[p.id].icon,catalog.units[p.id].name));
      if(reserve.length>3)pics.append(node("small","＋"+(reserve.length-3)));
      bench.append(pics);
    } else bench.append(node("b",positions.size+" / "+source.level));
  }
  function resumable(q) {
    const draft=q && drafts[q.id];
    if(!draft?.game || progress.status(q)?.answered || draft.game.last?.complete)return false;
    if(!checkedDrafts.has(draft)) {
      try { engine.create(q,catalog,draft.game); checkedDrafts.add(draft); }
      catch { delete drafts[q.id]; return false; }
    }
    return true;
  }
  function questionLabel(q) {
    const {tier,number}=FocusCourseOrder.position(questions,q.id);
    return tiers[tier]+"第 "+number+" 題";
  }
  function setupLabel(q) {
    const opening=q.initial;
    const carrier=opening.board.find(p=>p?.items?.length);
    const round=(q.round || q.steps[0].round).id;
    const detail=q.skill==="interest" ? opening.gold+" 金" : carrier ? catalog.units[carrier.id].name : opening.level+" 人口";
    return round+" · "+detail;
  }
  function startUnanswered(q) {
    setAddress("#play-"+chapterOf(q));
    start(q,{fresh:!resumable(q),navigate:false});
  }
  function wrongQuestions(skill) {
    return questions.filter(q=>chapterOf(q)===skill && progress.status(q)?.review);
  }
  function openWrongList(skill) {
    openDialog(skills[skill]+"・複習錯題");
    const row=actions();
    row.classList.add("wrong-question-list");
    for(const q of wrongQuestions(skill)){
      const item=button(questionLabel(q)+"　"+setupLabel(q),()=>start(q,{fresh:true}),row);
      item.dataset.wrongQuestion=q.id;
    }
  }
  function renderHome(skill=choice.skill, tier, id) {
    if(!published(skill))skill=FocusCourseVisibility.publishedSkills[0];
    const course=progress.courseNext(questions,skill);
    if(!Object.hasOwn(tiers,tier))tier=course.question ? tierOf(course.question) : "challenge";
    const list=group(skill,tier);
    const picked=list.find(q=>q.id===id) || progress.next(questions,skill,tier);
    choice={skill,tier,id:picked?.id || null};
    const module=progress.summary(questions,skill);
    const courseNav=$("course-list");
    if(!courseNav.children.length) FocusCourseVisibility.publishedSkills.forEach((k,i)=>{
      const name=skills[k];
      const row=button("",()=>renderHome(k),courseNav);
      row.dataset.skill=k; row.className="academy-chapter";
      const number=node("span",String(i+1).padStart(2,"0")); number.className="chapter-number"; number.setAttribute("aria-hidden","true");
      const title=node("span",name); title.className="chapter-title";
      const arrow=node("span","›");arrow.className="chapter-arrow";arrow.setAttribute("aria-hidden","true");row.append(number,title,arrow);
    });
    const pending=$("pending-course-list");
    if(!pending.children.length){
      const upcoming=Object.keys(skills).filter(k=>!published(k));
      for(const k of upcoming){const item=node("li",skills[k]);item.dataset.pendingSkill=k;pending.append(item);}
      pending.parentElement.hidden=!upcoming.length;
    }
    for(const row of courseNav.children)row.setAttribute("aria-pressed",String(row.dataset.skill===skill));
    $("home-module-name").textContent=skills[skill];
    $("home-skill-description").textContent=descriptions[skill];
    $("home-recommend").hidden=skill!=="combined" || module.answered>0;
    const tabs=$("home-difficulty");
    if(!tabs.children.length) for(const [key,name] of Object.entries(tiers)) {
      const tab=button(name,()=>renderHome(choice.skill,key,null),tabs);
      tab.dataset.tier=key; tab.append(node("small",""));
    }
    for(const tab of tabs.children) {
      tab.setAttribute("aria-pressed",String(tab.dataset.tier===tier));
      const count=module.tiers[tab.dataset.tier];
      tab.querySelector("small").textContent=" "+count.answered+"/"+count.total;
      tab.title=tiers[tab.dataset.tier]+"已作答 "+count.answered+"／"+count.total+" 題";
    }
    const select=$("home-question");
    const options=list.map((q,i)=>{
      const status=progress.status(q);
      const mark=status?.previousEdition?"　✓ 前版已答對":status?.completed?"　✓ 答對":status?.answered?"　待複習":"";
      return new Option((i+1)+"　"+setupLabel(q)+mark,q.id);
    });
    if(!picked){
      const placeholder=new Option("本級已全部作答，可手動選題重練","");
      placeholder.disabled=true;options.unshift(placeholder);
    }
    select.replaceChildren(...options); select.value=picked?.id || "";
    const launch=picked || course.question;
    const startButton=$("course-start");
    startButton.hidden=!launch;
    if(launch){
      const repeat=progress.status(launch)?.answered;
      startButton.textContent=(repeat?"重練":resumable(launch) || module.answered?"繼續":"開始")+"・"+questionLabel(launch);
      startButton.onclick=()=>id || launch!==course.question ? start(launch,{fresh:!resumable(launch)}) : startUnanswered(launch);
    }
    const wrong=wrongQuestions(skill),review=$("home-review-wrong");
    review.hidden=!wrong.length;review.textContent="複習錯題（"+wrong.length+"）";
    review.onclick=()=>openWrongList(skill);
    $("home-selection-status").textContent=course.finished?(module.completed===module.total?"本單元 "+module.total+" 題全部答對。":"本單元 "+module.total+" 題已全部作答。"):
      tiers[tier]+"已作答 "+module.tiers[tier].answered+"／"+list.length+" 題";
    const done=questions.filter(q=>progress.status(q)?.answered).length;
    $("home-progress").textContent="已作答 "+done+" / "+questions.length+" 題";
    $("home-progress-meter").value=done; $("home-progress-meter").max=questions.length;
    const last=current || byId(saved.current);
    const resume=last && (resumable(last) ? last : progress.courseNext(questions,chapterOf(last)).question);
    $("home-resume").hidden=!resume;
    if(resume){
      $("home-resume").title=skills[chapterOf(resume)]+"・"+questionLabel(resume);
      $("home-resume").onclick=()=>resumable(resume) ? start(resume) : startUnanswered(resume);
    }
    $("lesson-preview").hidden=!launch;
    if(launch)renderPreview(launch);
    remember();
  }
  $("home-question").onchange=e=>renderHome(choice.skill,choice.tier,e.target.value);
  function picker(navigate=true) {
    if(current && !onHome)persist();
    if(dialog.open)dialog.close();
    if(view){view.destroy();view=null;}
    demo=null;hideNote();
    if(navigate!==false)setAddress("#catalog");
    screen(true);
    const selected=byId(choice.id);
    if (selected && !progress.status(selected)?.answered) renderHome(chapterOf(selected),tierOf(selected),selected.id);
    else renderHome();
    home.scrollTop=0;
    if(current)$("home-heading").focus({preventScroll:true});
  }
  const where = slot => slot.zone === "bench" ? "備戰區第 " + (slot.index+1) + " 格" :
    "我方第 " + (Math.floor(slot.index/7)+1) + " 排第 " + ((slot.index%7)+1) + " 格";
  function describe(action,sim) {
    if (!action) return "保留現在的盤面，直接確認。";
    const name = id => catalog.units[id]?.name || id || "棋子";
    const unit = pos => name(sim.state[pos.zone][pos.index]?.id);
    switch (action.type) {
      case "sell": return "賣掉" + where(action.from) + "的" + unit(action.from) + "。";
      case "buy": return "買商店第 " + (action.index+1) + " 格的" + name(sim.state.shop[action.index]) + "。";
      case "move": return "把" + unit(action.from) + "移到" + where(action.to) + "。";
      case "equip": return "把" + sim.state.items[action.itemIndex] + "交給" + unit(action.to) + "。";
      case "combine": return "把" + sim.state.items[action.a] + "和" + sim.state.items[action.b] + "合起來。";
      case "scout": return "偵查"+scoutLabel(sim.step.routeStrategy.scout.boards[action.index],action.index)+"，查看增幅、盤面和持裝者。";
      case "contestCount": return "這個方向填 "+action.count+" 家同行。";
      case "plan": case "augment": {
        const cards = sim.round().plans || sim.round().augments || [];
        return "選擇「" + (cards.find(c => c.id === action.id)?.name || action.id) + "」。";
      }
      case "xp": return "購買一次經驗值。";
      default: return "執行下一個操作。";
    }
  }
  function beginDemo() {
    dialog.close(); closeHints(); game.reveal(); persist();
    const original = engine.create(current,catalog,game.roundBaseline());
    routePickerOpen=false;routeScouting=false;rivalIndex=-1;
    demo = {session:original,index:0}; mount(); showDemoInstruction();
  }
  function showDemoInstruction() {
    const witness = demo.session.step.witness || [];
    const done = demo.index >= witness.length;
    markAction(done ? null : witness[demo.index]);
    const hasOptions=["route","augment","routeAugment"].includes(demo.session.q.skill);
    const verdict=done && hasOptions ? demo.session.submit() : null;
    const message = done ? ((witness.length ? "" : "這回合保留原盤。") + (verdict?.feedback || demo.session.step.explanation)) :
      describe(witness[demo.index],demo.session);
    note(message,box => {
      if (!done) button("看這一步",demoStep,box,true);
      if(verdict?.optionReviews?.length) button("比較全部選項",()=>{
        openDialog("示範解析"); showContestReview(verdict.contestReview,true); showOptionReviews(verdict.optionReviews,true);
        const row=actions();
        button("換我試一次",()=>{dialog.close();endDemo();},row,true);
        button("回到示範",()=>dialog.close(),row);
      },box);
      button(done ? "換我試一次" : "結束示範",endDemo,box);
    });
  }
  function demoStep() {
    if (!demo) return;
    const action = demo.session.step.witness?.[demo.index];
    if (!action) return endDemo();
    const result = demo.session.act(action.type,action);
    if (!result.ok) { endDemo(); return note(result.message); }
    routeScouting=action.type==="scout";
    if(routeScouting)rivalIndex=action.index;
    demo.index++; view.render(); refreshRoute(); showDemoInstruction();
  }
  function endDemo() { demo = null; routeScouting=false; rivalIndex=-1; hideNote(); mount(); }
  function help() {
    if (demo) return endDemo();
    openDialog("本題教學");
    const row = actions();
    button("看一步示範",beginDemo,row,true);
    button("給我一個提示",() => { dialog.close(); showHint(); },row);
    button("快捷鍵設定",() => {dialog.close();view.settings();},row);
    button("重設本題盤面",() => { game.reset(); hintStep=0; hintIndex=0; closeHints(); dialog.close(); hideNote(); mount(); refreshBar(); persist(); },row);
  }
  function submit() {
    const result = game.submit();
    const prep=game.routePreparation?.();
    if(result.needsScouting){
      toggleScouts(true);return;
    }
    if(result.needsPreparation){note(result.feedback);return;}
    if(result.needsContestCount){
      if(routeScouting)toggleScouts(false);
      if(routePickerOpen)toggleRoute(false);
      $("route-contest-count").focus();return;
    }
    if(result.pending && prep){toggleRoute(true);return;}
    if (result.pending) { note(result.feedback); view.openChoices(); return; }
    if (result.complete || !result.passed) progress.record(current,result);
    persist(); showResult(result);
  }
  function showTraitChange(result) {
    const reason=result.evidenceReason && result.evidenceReason!==result.feedback ? result.evidenceReason : "";
    if(!result.traitReview?.length){if(reason)body.append(node("p",reason));return;}
    const section=node("section");section.className="trait-review";
    const heading=node("h3","場上羈絆");section.append(heading);
    function table(rows) {
      const t=node("table"), head=t.createTHead().insertRow();
      for(const text of ["羈絆","回合開始","交卷時"]) {const th=node("th",text);th.scope="col";head.append(th);}
      const tbody=t.createTBody();
      for(const change of rows) {
        const row=tbody.insertRow(), name=node("th",change.name);name.scope="row";row.append(name);
        for(const s of [change.before,change.after]){
          const cell=row.insertCell();cell.append(node("b",s.count+" "+change.unit));
          cell.append(node("span",s.active?"開 "+s.active+" "+change.unit+"檔":"未啟動"));
        }
        if(change.before.active!==change.after.active)row.className="trait-tier-change";
      }
      return t;
    }
    section.append(table(result.traitReview.slice(0,2)));
    if(result.traitReview.length>2) {
      const details=node("details");details.append(node("summary","查看其餘羈絆"),table(result.traitReview.slice(2)));section.append(details);
    }
    if(result.traitReview.some(t=>t.after.members.length)) {
      const members=node("details");members.append(node("summary","哪些場上棋子有算進來？"));
      for(const trait of result.traitReview) {
        if(!trait.after.members.length)continue;
        const names=trait.after.members.map(id=>{
          const u=catalog.units[id], star=Math.max(0,...game.state.board.filter(p=>p?.id===id).map(p=>p.star));
          return (u?.name || id)+(trait.unit==="星"?" "+star+" 星":"")+(u?.role?"（"+u.role+"）":"");
        });
        members.append(node("small",trait.name+"　"+names.join("、")));
      }
      section.append(members);
    }
    body.append(section);
    if(reason)body.append(node("p",reason));
  }
  function showOptionReviews(reviews,isDemo=false) {
    dialog.classList.add("with-option-review");
    const section=node("section");section.className="option-review";
    const heading=node("h3",current.skill==="route"?"這局的陣容方向":"這局的增幅選擇");
    heading.id="option-review-title";
    section.setAttribute("aria-labelledby",heading.id);
    const list=node("ul");
    const labels={recommended:"這局優先",viable:"這局可選",conditional:"要先調整",unsuitable:"這局不適合"};
    for(const option of reviews){
      const item=node("li"),head=node("div"),name=node("h4",option.name);
      item.dataset.optionReview=option.id;
      item.dataset.selected=String(option.selected);
      item.dataset.accepted=String(option.accepted);
      item.dataset.status=option.status;
      head.className="option-heading";name.className="option-name";
      const verdict=node("span",labels[option.status] || (option.accepted?"這局可選":"這局不適合"));
      verdict.className="option-verdict";
      head.append(name,verdict);
      if(option.selected) {
        const picked=node("span",isDemo?"示範選擇":"你的選擇");
        picked.className="option-picked";head.append(picked);
      }
      const reason=node("p",option.reason);
      reason.className="option-reason";item.append(head,reason);list.append(item);
    }
    section.append(heading,list);body.append(section);
    const title=$("dialog-title");
    title.tabIndex=-1;title.focus({preventScroll:true});
  }
  function showContestReview(review,isDemo=false) {
      if(!review)return;
      const {planId,reported,expected,correct,rivals}=review;
      const name=game.round().plans.find(plan=>plan.id===planId)?.name;
      const section=node("section");section.className="contest-review";
      section.append(node("h3",name+"・"+expected+" 家同行"));
      if(!isDemo)section.append(node("p",correct?"家數判斷正確。":"你填了 "+reported+" 家，七家裡有 "+expected+" 家同行。"));
      if(rivals.length){
        const list=node("ul");
        for(const rival of rivals)list.append(node("li",scoutLabel(rival,rival.seat-1)+"　"+rival.reason));
        section.append(list);
      } else section.append(node("small","七家的盤面、持裝和增幅都沒有足夠線索指向這個陣容。"));
      body.append(section);
  }
  function showInterestAtSettlement() {
    const gold=game.state.gold;
    const win=game.previewIncome("win"), loss=game.previewIncome("loss");
    const incomeText = win.interest===loss.interest ? "勝敗都是 "+loss.interest+" 息" :
      "贏 "+win.interest+" 息／輸 "+loss.interest+" 息";
    body.append(node("small",gold+" 金開打，維持到結算時"+incomeText+"。"));
    if(game.round().type!=="pvp") return;
    const bench=game.state.bench.flatMap((piece,index)=>piece?[{piece,index,value:game.sellValue(piece)}]:[]);
    if(!bench.some(({value})=>game.interest(gold+value+win.win)>win.interest ||
        game.interest(gold+value+loss.win)>loss.interest)) return;
    const details=node("details");details.className="lesson-references settlement-review";
    details.append(node("summary","試算結算前賣一張備戰棋"));
    const label=node("label","備戰區　"), select=node("select");
    select.add(new Option("全部留著","0"));
    for (const {piece,index,value} of bench) {
      const name=catalog.units[piece.id].name;
      select.add(new Option("第 "+(index+1)+" 格　"+name+" "+piece.star+"★（賣 "+value+" 金）",String(value)));
    }
    label.append(select);
    const calculation=node("p");
    calculation.setAttribute("aria-live","polite");
    function update() {
      const coins=gold+Number(select.value);
      const onWin=coins+win.win, onLoss=coins+loss.win;
      calculation.textContent="贏　"+onWin+" 金，"+game.interest(onWin)+" 息　／　輸　"+
        onLoss+" 金，"+game.interest(onLoss)+" 息";
    }
    select.onchange=update; update();
    details.append(label,calculation);
    body.append(details);
  }
  function showResult(result) {
    hideNote(); closeHints();
    const keeping=current.skill==="retention" && game.stepIndex===0;
    openDialog(result.complete ? "這題完成了" : keeping ? (result.passed?"留牌通過":"再看一下留牌") : (result.hasNext ? "這回合完成了" : "還沒完成目標"));
    if (current.skill === "interest") {
      showInterestAtSettlement();
    }
    if (current.keepInterest) body.append(node("small",FocusNativeUI.swapIncomeText(current.initial.gold,game.state.gold,current.settings?.interestCap)));
    showContestReview(result.contestReview);
    if(result.optionReviews?.length)showOptionReviews(result.optionReviews);
    else body.append(node("p",result.feedback));
    if(!keeping)showTraitChange(result);
    const references=catalog.lessonReferences?.[current.id];
    const evidence=catalog.lessonEvidence?.[current.id];
    if(!keeping && evidence?.pattern && evidence.changesWhen){
      const transfer=node("details");transfer.className="lesson-references";
      transfer.append(node("summary","換個條件，還會這樣打嗎？"),node("p",evidence.pattern),node("p",evidence.changesWhen));
      body.append(transfer);
    }
    // 站主網站 2026-11-27：「出題依據」裡是內部檔名、對局事件編號和出題筆記，正式站學員不顯示
    if(false && !keeping && references?.length){
      const details=node("details");details.className="lesson-references";
      const list=node("ul");
      for(const source of references)list.append(node("li",source));
        details.append(node("summary","看這題的出題依據"));
        if(evidence) {
          details.append(node("p",evidence.kind+"　"+evidence.source),node("p",evidence.limits));
        }
        details.append(list);body.append(details);
    }
    const row = actions();
    row.classList.add("course-result-actions");
    function continueCourse() {
      const next=progress.courseNext(questions,chapterOf(current)).question;
      if(next){
        const forward=button("繼續・"+questionLabel(next),()=>startUnanswered(next),row,true);
        forward.dataset.courseNext=next.id;
      } else {
        const finish=button("完成本單元・回課題目錄",picker,row,true);
        finish.dataset.courseFinished=chapterOf(current);
      }
      return next;
    }
    function replayButton() {
      if (current.skill !== "board" || !view.replay) return;
      button("試打固定對手",() => {
        dialog.close();
        view.replay(() => showResult(result));
      },row);
    }
    if (!result.passed) {
      const lastStep=game.stepIndex===game.stepCount-1;
      if(lastStep)continueCourse();
      button("回棋盤調整",() => {
        if (game.state.currentAugment || (game.state.currentPlan && current.skill!=="route")) {
          const undone = game.undo(); if (!undone.ok) game.reset();
        }
        dialog.close(); view.render(); refreshBar(); persist();
      },row,!lastStep);
      button("看一步示範",beginDemo,row);
      replayButton();
      return;
    }
    if (result.hasNext) {
      const advance=button(keeping?"開啟下一回合":"看下間自然商店",() => {
        const outcome = game.advance();
        if (!outcome.ok) { dialog.close(); return note(outcome.message); }
        dialog.close(); hideNote(); view.render(); refreshBar(); persist();
      },row,true);
      advance.id="lesson-next-shop";
      return;
    }
    const more=continueCourse();
    replayButton();
    if (more) button("回課題目錄",picker,row);
  }
  $("course-open").onclick = picker;
  $("lesson-undo").onclick = undoAction;
  $("lesson-keys").onclick = () => view?.settings();
  $("lesson-help").onclick = help;
  function resizeStage() {
    const height = document.querySelector(".lesson-bar").offsetHeight + $("lesson-hints").offsetHeight + $("lesson-note").offsetHeight + $("route-workbench").offsetHeight;
    document.documentElement.style.setProperty("--focus-lesson-h",height + "px");
  }
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(resizeStage);
    observer.observe(document.querySelector(".lesson-bar")); observer.observe($("lesson-hints")); observer.observe($("lesson-note"));observer.observe($("route-workbench"));
  } else window.addEventListener("resize",resizeStage);
  $("dialog-close").onclick = () => dialog.close();
  dialog.addEventListener("click",e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dialog.close();
  });
  function readAddress() {
    const query = new URLSearchParams(location.hash.slice(1)).get("q");
    const target = location.hash.startsWith("#play-") ? location.hash.slice(6) : query || location.hash.slice(1);
    const legacy=target==="interest" || target==="board";
    const chapter=legacy ? "combined" : target;
    const targetSkill=Object.hasOwn(skills,chapter) ? chapter : FocusCourseVisibility.skillForQuestion(target);
    if(targetSkill && !published(targetSkill)){
      setAddress("#catalog",true);picker(false);
      $("home-selection-status").textContent=targetSkill==="archive"?"這題已收入舊題。可從合併後的課題繼續。":skills[targetSkill]+"目前待定，可選擇已開放的課題。";
      return;
    }
    if (location.hash.startsWith("#play-")) {
      if(Object.hasOwn(skills,chapter)){
        const next=progress.courseNext(questions,chapter).question;
        if(next){if(onHome || current?.id!==next.id)start(next,{fresh:!resumable(next),navigate:false});}
        else {choice={skill:chapter};setAddress("#catalog",true);picker(false);}
        return;
      }
      const trial = byId(target);
      if (trial) {
        setAddress("#q="+encodeURIComponent(trial.id),true);
        start(trial,{fresh:!resumable(trial),navigate:false});
        return;
      }
    }
    if(Object.hasOwn(skills,chapter)){
      choice={skill:chapter};picker(false);return;
    }
    const requested = byId(target);
    if (requested) { if(onHome || current?.id!==requested.id)start(requested,{navigate:false}); }
    else if (!onHome || !$("course-list").children.length) picker(false);
  }
  window.addEventListener("popstate",readAddress);
  window.addEventListener("hashchange",readAddress);
  readAddress();
  resizeStage();
})();

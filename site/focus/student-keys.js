/* Optional signed course, available in both the offline HTML and the hosted site. */
(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("practice") !== "coach") return;

  const filesKey = "choko.s19.signed.file.v1", progressKey = "choko.s19.signed.progress.v1";
  const names = FocusCourseVisibility.names;
  const levels = {basic:"入門",advanced:"進階",challenge:"挑戰"};
  const questions = FocusCourseOrder.sort(FocusCoachQuestions);
  const isPublished=FocusCourseVisibility.isPublished;
  const skillOf=FocusCourseVisibility.skillForQuestion;
  function questionLabel(item,round=item.round.id) {
    const {skill,tier,number}=FocusCourseOrder.position(questions,item.id);
    return `${names[skill]} · ${levels[tier]} ${number} · ${round}`;
  }
  const catalog = {...FocusCatalog, routes:CoachTiers.routes};
  const goal = {interest:"擺出最強盤面，再決定吃幾金利息。",board:"擺出這回合最強的盤面。",augment:"選這一輪的增幅。",route:"選擇這一把的陣容方向。",routeAugment:"選擇這套八四陣容需要的增幅。",transition:"根據這間商店調整過渡盤面。"};
  const byId = id => document.getElementById(id);
  function element(tag,text,cls) {
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(cls)el.className=cls;
    return el;
  }
  function button(text,fn,id) {
    const b=element("button",text);b.type="button";b.onclick=fn;if(id)b.id=id;return b;
  }
  function read(key,empty) {
    try {return JSON.parse(localStorage.getItem(key)) ?? empty;}catch{return empty;}
  }
  const saved=read(progressKey,{});
  const done=saved.done && typeof saved.done==="object"?saved.done:{};
  let draft=saved.draft || null, store, active=[], q, session, view, pick=null, history=[], frames=[];
  const heldDrafts={...saved.heldDrafts};
  if(draft && !isPublished(skillOf(draft.id))){heldDrafts[draft.id]=draft;draft=null;}
  let seatIndex=0, imported=false, routeNames=new Map(), saveWarning="", retiredCount=0;
  const dialog=byId("lesson-dialog"), content=byId("dialog-content"), title=byId("dialog-title");
  const field=byId("focus-game"), home=byId("course-home"), bar=document.querySelector(".lesson-bar");
  const homeURL=new URL(location.href);homeURL.searchParams.delete("practice");homeURL.hash="catalog";
  const homeLink=element("a","返回練習目錄");homeLink.href=homeURL.href;
  function modal(label) {
    title.textContent=label;content.replaceChildren();if(!dialog.open)dialog.showModal();
  }
  byId("dialog-close").onclick=()=>dialog.close();
  document.title="教練定稿練習｜巧克力的戰棋研究室";
  const heading=element("h1","教練定稿練習");heading.id="signed-heading";
  home.setAttribute("aria-labelledby",heading.id);
  const sheet=element("div",undefined,"academy-sheet signed-sheet"), actions=element("div",undefined,"course-buttons");
  const upload=element("input");upload.type="file";upload.accept=".json,application/json";upload.hidden=true;upload.id="signed-file";
  const openFile=button("載入教練答案檔",()=>upload.click(),"signed-import");
  const resetFile=button("使用站內定稿",()=>{if(loadDeck(window.FocusPublishedAnswers,false)){try{localStorage.removeItem(filesKey);}catch{} landing();}},"signed-preset");
  const stats=element("p");stats.setAttribute("role","status");
  const choices=element("select");choices.setAttribute("aria-label","選擇定稿題目");choices.id="signed-question";
  const go=button("開始練習",()=>play(choices.value),"signed-start");
  actions.append(choices,go,openFile,resetFile,upload);
  const openHeading=element("h2","已開放課題");
  const openSubjects=element("p",FocusCourseVisibility.publishedSkills.map(skill=>names[skill]).join("、"));
  const pendingBox=element("section",undefined,"pending-courses");
  const pendingList=element("ul");
  for(const skill of Object.keys(names).filter(skill=>!isPublished(skill)))pendingList.append(element("li",names[skill]));
  pendingBox.hidden=!pendingList.children.length;
  pendingBox.append(element("h2","待定課題"),pendingList);
  sheet.append(homeLink,heading,openHeading,openSubjects,stats,actions,pendingBox);home.replaceChildren(sheet);
  const choose=element("div",undefined,"signed-options");
  const topLabel=element("strong");const roundInfo=element("span");roundInfo.id="signed-phase";
  const undoBtn=button("復原上一步",undo,"signed-undo");
  const keys=button("快捷鍵",()=>view?.settings());
  const scout=button("偵查七家",()=>showScout(0),"signed-scout");
  const menu=button("‹ 定稿題目",()=>{remember();landing();});
  const actionsTop=element("div",undefined,"lesson-tools");actionsTop.append(undoBtn,keys,scout);
  const line=element("div",undefined,"lesson-copy");line.append(roundInfo,topLabel);
  bar.classList.add("signed-bar");bar.replaceChildren(menu,line,actionsTop);
  bar.after(choose);
  const knownOldKey=(id,key)=>Object.hasOwn(window.FocusPriorOpeningKeys || {},id) && window.FocusPriorOpeningKeys[id].includes(key);
  const credit=q=>done[q.id]===FocusCoachStore.openingKey(q) || knownOldKey(q.id,done[q.id]);
  function nextOpen(after) {
    const start=after ? active.indexOf(after)+1 : 0;
    return active.slice(start).find(item=>!credit(item)) || active.slice(0,start).find(item=>!credit(item));
  }
  function persist() {
    try {localStorage.setItem(progressKey,JSON.stringify({done,draft,heldDrafts}));}
    catch {saveWarning="這個瀏覽器只能保留本次開啟的進度。";}
  }
  function signature(row){return [row.openingKey,row.savedAt,...(row.alternatives||[]).map(a=>a.savedAt)].join("/");}
  function remember() {
    if(!session || !q)return;
    draft={id:q.id,key:signature(store.answer(q.id)),state:session.state,history,frames,pick};
    persist();
  }
  function loadDeck(data,isImported) {
    try {
      const next=FocusCoachStore.create(catalog,questions,null);
      let file=data;
      if(typeof file==="string"){
        try{file=JSON.parse(file.replace(/^\uFEFF/,""));}catch{throw Error("無法讀取 JSON 答案檔。");}
      }
      const pending=row=>{const skill=skillOf(row?.id);return skill && !isPublished(skill);};
      if(Array.isArray(file?.answers) && file.answers.some(pending)){
        const answers=file.answers.filter(row=>!pending(row));
        if(!answers.length)throw Error("這份定稿只包含待定課題。已開放「"+FocusCourseVisibility.publishedSkills.map(skill=>names[skill]).join("」、「")+"」。");
        file={...file,answers};
        if(Array.isArray(file.openings))file.openings=file.openings.filter(row=>!pending(row));
      }
      const retired=new Set();
      if(Array.isArray(file?.answers)) {
        const seen=new Set();
        for(const row of file.answers) {
          if(seen.has(row?.id))
            throw Error("答案檔內題號重複："+(row?.id || "缺少題號"));
          seen.add(row?.id);
          if(!knownOldKey(row?.id,row?.openingKey))continue;
          if(file.openings!==undefined){
            const matched=Array.isArray(file.openings) && file.openings.filter(q=>q?.id===row.id);
            if(!matched || matched.length!==1 || !matched[0].initial || !matched[0].round || FocusCoachStore.openingKey(matched[0])!==row.openingKey)
              throw Error(row.id+" 的起手版本不同。");
          }
          retired.add(row.id);
        }
        if(retired.size) {
          const keep=row=>!retired.has(row?.id);
          file={...file,answers:file.answers.filter(keep)};
          if(Array.isArray(file.openings))file.openings=file.openings.filter(keep);
          if(!file.answers.length)throw Error("這份答案檔的題目都已換成新起手，請載入教練重新定稿的版本。");
        }
      }
      next.importAnswers(file);
      const ids=new Set(next.savedIds());
      if(!ids.size)throw Error("答案檔沒有適用於這個版本的定稿。");
      const open=questions.filter(q=>ids.has(q.id) && FocusCourseVisibility.isQuestionPublished(q));
      if(!open.length)throw Error("答案檔沒有適用於已開放課題的定稿。");
      store=next;active=open;imported=isImported;retiredCount=retired.size;
      routeNames=new Map([...catalog.routes,...next.retiredRoutes()].map(r=>[r.id,r.name]));
      return true;
    } catch(e) {modal("無法載入定稿");content.append(element("p",e.message));return false;}
  }
  upload.onchange=async()=>{
    const file=upload.files?.[0];if(!file)return;
    try {
      const raw=await file.text();
      if(!loadDeck(raw,true))return;
      try {localStorage.setItem(filesKey,JSON.stringify(raw));}catch{saveWarning="此答案檔只會在本次開啟時使用。";}
      landing();
    }catch(e){modal("無法讀取檔案");content.append(element("p",e.message));}
    finally{upload.value="";}
  };
  function selectQuestion(id){location.hash!==("#"+id) && window.history.replaceState(null,"","#"+id);}
  function landing() {
    view?.destroy();view=null;q=null;session=null;field.hidden=true;bar.hidden=true;choose.hidden=true;home.hidden=false;
    document.body.classList.add("at-catalog");choices.replaceChildren();const pending=nextOpen();
    for(const item of active){
      const o=element("option",questionLabel(item)+(credit(item)?"　✓":""));
      o.value=item.id;choices.append(o);
    }
    const resumed=active.find(item=>{
      const previous=item.id===draft?.id ? draft : heldDrafts[item.id];
      return previous && !credit(item) && previous.key===signature(store.answer(item.id));
    });
    choices.value=resumed?.id || pending?.id || active[0]?.id || "";
    stats.textContent=(active.length?"已完成 "+active.filter(credit).length+" / "+active.length+" 題。":"選擇教練匯出的 S19 答案 JSON。")+
      (retiredCount?retiredCount+" 題已換起手，等待新版定稿。":"")+saveWarning;
    choices.hidden=go.hidden=active.length===0;resetFile.hidden=!imported || !window.FocusPublishedAnswers;
    go.textContent=resumed?"繼續練習":pending?"開始練習":"重看所選題目";
    if(location.hash)window.history.replaceState(null,"",location.pathname+location.search);
  }
  function buildChoices() {
    choose.replaceChildren();
    const row=store.answer(q.id);choose.hidden=!row.options?.length;
    for(const id of row.options||[]){
      const a=catalog.augments[id],b=button(a?.name||routeNames.get(id)||id,()=>{
        if(pick!==id){history.push({selected:pick});pick=id;buildChoices();refresh();remember();}
      });
      b.dataset.signedOption=id;b.setAttribute("aria-pressed",String(id===pick));if(a)b.title=a.description;
      choose.append(b);
    }
  }
  function undo() {
    if(!view?.canEdit()||!history.length)return;
    const last=history.pop();
    if(Object.hasOwn(last,"selected")){pick=last.selected;buildChoices();}
    else {const s={...session.state,...last.previous};for(const key of last.added)delete s[key];session.restore(s);}
    view.afterUndo();refresh();remember();
  }
  function refresh() {
    const i=frames.length+1, n=q.rounds?.length||1;
    const retention=q.skill==="retention";
    if(retention)roundInfo.dataset.retentionStep=String(i);
    else delete roundInfo.dataset.retentionStep;
    roundInfo.textContent=questionLabel(q,session.round().id)+(retention?(i===1?"　1/2 留牌":"　2/2 升星上場"):n>1?"　商店 "+i+" / "+n:"");
    topLabel.textContent=session.round().goal||q.goal||goal[q.skill];
    undoBtn.disabled=!history.length;
    undoBtn.title=view?.getUndoLabel()||"Ctrl+Z";
    scout.hidden=!q.scoutBoards?.length;
    const nativeChoice=field.querySelector(".tt-choice-open");if(nativeChoice)nativeChoice.hidden=true;
    const submit=field.querySelector(".tt-go");
    if(submit){submit.disabled=!choose.hidden && !pick;submit.querySelector("span").textContent=retention?(i===1?"確認留牌":"確認上場"):"交卷";}
    document.documentElement.style.setProperty("--focus-lesson-h",bar.offsetHeight+choose.offsetHeight+"px");
  }
  function mount() {
    view?.destroy();view=FocusNativeUI.mount(field,{session,catalog,onChange:()=>{refresh();remember();},onUndo:undo,onRender:refresh,
      onSubmit:grade,onHotkeyChange:refresh,onRouteScout:delta=>{if(q.scoutBoards?.length)showScout((seatIndex+delta+q.scoutBoards.length)%q.scoutBoards.length);}});
    refresh();
  }
  function play(id) {
    const selected=active.find(item=>item.id===id);if(!selected)return;
    q=selected;const row=store.answer(id);
    const previous=draft?.id===id ? draft : heldDrafts[id];
    let resume=previous && signature(row)===previous.key && !credit(q)?previous:null;
    try {session=CoachRounds.createBoardSession(q,catalog,resume?.state,entry=>history.push(entry));}
    catch {resume=null;session=CoachRounds.createBoardSession(q,catalog,null,entry=>history.push(entry));}
    delete heldDrafts[id];history=resume?.history||[];frames=resume?.frames||[];pick=resume?.pick||null;seatIndex=0;
    home.hidden=true;bar.hidden=false;field.hidden=false;document.body.classList.remove("at-catalog");
    buildChoices();mount();selectQuestion(id);remember();
  }
  function grade() {
    if(!choose.hidden && !pick)return;
    const result=store.compare(q.id,session.state,pick,frames.length,frames);
    const more=frames.length+1<(q.rounds?.length||1);
    const holding=q.skill==="retention" && frames.length===0;
    modal(holding?(result.passed?"留牌通過":"再看一下留牌"):result.passed?(more?"這一間答對了":"這題完成了"):"再試一次");
    const row=element("div",undefined,"course-buttons");
    if(!result.passed){
      const details=store.explain?.(q.id,session.state,pick,frames.length,frames) || [];
      if(details.length){
        for(const message of details)content.append(element("p",message));
      }else{
        const labels={sequence:"先前商店的過渡",board:"上場棋子與星級",gear:"成裝及持裝者",bench:"備戰留牌",economy:"金幣與利息",route:"陣容方向",augment:"增幅"};
        const missed=Object.entries(result).filter(([key,ok])=>!ok && labels[key]).map(([key])=>labels[key]);
        content.append(element("p","再看一下"+(missed.join("、")||"這次的決定")+"。"));
      }
      row.append(button("回棋盤調整",()=>dialog.close()));
    }else if(more){
      row.append(button(holding?"開啟下一回合":"進下一間商店",()=>{
        const before=structuredClone(session.state);let result;
        try{result=session.advance();}catch(e){result={ok:false,message:e.message};}
        if(!result.ok){session.restore(before);modal("無法進入下一間商店");content.append(element("p",result.message));return;}
        dialog.close();frames.push(before);history=[];pick=null;buildChoices();mount();remember();
      },"signed-advance"));
    }else{
      done[q.id]=FocusCoachStore.openingKey(q);draft=null;persist();
      const next=nextOpen(q);
      content.append(element("p",next?"已記錄完成。":"本份定稿已全部完成。"));
      if(next)row.append(button("繼續下一題",()=>{dialog.close();play(next.id);},"signed-next"));
      row.append(button("回定稿題目",()=>{dialog.close();landing();}));
    }
    content.append(row);
  }
  function showScout(i) {
    const team=q.scoutBoards[i];if(!team)return;
    seatIndex=i;modal("偵查對手");
    const nav=element("div",undefined,"course-buttons");q.scoutBoards.forEach((other,j)=>{const b=button(other.name||"對手 "+(j+1),()=>showScout(j));b.setAttribute("aria-pressed",String(i===j));nav.append(b);});
    content.append(nav,element("h3",(team.name||"對手")+"　等級 "+team.level),
      element("p","增幅　"+team.augments.map(a=>(a.stage||"")+" "+(catalog.augments[a.id]?.name||a.id)).join("、")));
    const grid=element("div",undefined,"scout-field");grid.setAttribute("aria-label","對手棋盤");
    for(let j=0;j<28;j++){const p=team.units.find(p=>p.cell===j),hex=element("div",undefined,"scout-hex");hex.style.setProperty("--scout-row",Math.floor(j/7));hex.style.setProperty("--scout-col",j%7+(Math.floor(j/7)%2)/2);
      if(p){const t=element("span",undefined,"scout-token"),img=element("img");img.src=FocusAsset(catalog.units[p.id].icon);img.alt="";
        t.append(img,element("span","★".repeat(p.star),"scout-stars"),element("span",catalog.units[p.id].name,"scout-name"));
        const items=element("span",undefined,"scout-token-items");for(const item of p.items){const icon=element("img");icon.src=FocusAsset(catalog.items[item].icon);icon.alt=item;items.append(icon);}t.append(items);hex.append(t);}grid.append(hex);}
    content.append(grid,element("p","備戰　"+(team.bench.map(p=>catalog.units[p.id].name+" "+p.star+"★ "+p.items.join("、")).join(" ／ ")||"空")));
  }
  function followAddress(hash){
    const raw=hash.slice(1), requested=raw.startsWith("play-")?raw.slice(5):raw.startsWith("q=")?new URLSearchParams(raw).get("q"):raw;
    const skill=requested==="interest" || requested==="board"?"combined":Object.hasOwn(names,requested)?requested:skillOf(requested);
    if(skill && !isPublished(skill)){
      landing();stats.textContent=skill==="archive"?"這題已收入舊題，可繼續練已開放的定稿。":names[skill]+"目前待定，可選擇已開放的課題。";
    }else if(requested && active.some(item=>item.id===requested)){
      if(q?.id!==requested)play(requested);
    }else landing();
  }
  const deep=location.hash;
  const previous=read(filesKey,null);
  if(previous)loadDeck(previous,true);
  if(!store && window.FocusPublishedAnswers)loadDeck(window.FocusPublishedAnswers,false);
  followAddress(deep);
  window.addEventListener("hashchange",()=>followAddress(location.hash));
  window.addEventListener("resize",()=>{if(session)refresh();});
})();

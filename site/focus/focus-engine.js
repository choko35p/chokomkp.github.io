/* One learning objective per question; the native game owns pieces, purchases and combat. */
(function (root, factory) {
  const order = typeof module === "object" && module.exports ? require("./course-order.js") : root.FocusCourseOrder;
  const api = factory(root, order);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FocusEngine = api;
})(globalThis, function (root, order) {
  "use strict";

  const tiers = ["basic", "advanced", "challenge"];
  const skillActions = {
    interest: ["buy", "move", "sell", "xp", "lock", "equip"],
    board: ["buy", "move", "sell", "equip", "combine", "xp"],
    retention: ["buy", "move", "sell", "equip", "combine", "xp"],
    augment: ["augment"],
    route: ["buy", "move", "equip", "combine", "scout", "plan", "contestCount"],
    routeAugment: ["augment"],
    transition: ["buy", "move", "sell", "equip", "combine", "xp", "lock"]
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const blocked = message => ({ok: false, reason: message, message});
  const removerAllowance = q => q.study ? (q.initial.removers ?? 0) : 1;
  function equipmentToolAllows(q, state, action) {
    if (action==="removeGear") return state.removers>0;
    return action==="equip" && state.removers<removerAllowance(q) && state.items.length>0;
  }
  const day = 86400000;
  const flexibleEight = "s19_flex84";
  const uid = () => root.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const stamps = new WeakMap();
  // Earlier releases fingerprinted the teaching copy as well as the game state.
  // Map the grading fingerprints of those published augment lessons to their
  // original save keys. A changed reward, board or answer has a different key.
  const publishedAugmentStamps = {
    "1lr860j":"5yi32w", "w90kfu":"kis3l7", "1xpp5p0":"ik63p", "7ja5jr":"ytfv3t",
    "1w4q9nd":"18dhq07", "1dcurwi":"1grrqk8", "qky9e0":"m517fn", "gxq3ch":"rk0ga5",
    "1vwkwjg":"zhdkcd", "1fcpiwk":"3fo6dw", "1g2gjm9":"1vfv1np", "iecw0l":"15apw5f",
    "1gshham":"1bv4y2w", "1azjba3":"ryf2fp", "7d9zgy":"bvn3f1", "xlrlj5":"3nbtq2",
    "15njsq2":"yyzyw3", "zuy3hq":"axy6k1", "82y7ak":"7trogo",
    "r847wa":"1ecvb2t", "15tkvwt":"10iupcf", "1tcwyhp":"13nao6f", "176xr9g":"1ytix23",
    "er2ivf":"1ke2bo9", "ynewa9":"1y35inz", "8r9918":"17oxa50", "zqstjd":"g3vq3b",
    "1a6vxu8":"1rq1cvt", "1sfg9de":"grguo3", "aa1vn3":"1hj9k3b", "1vorb9h":"1qk1g3c",
    "1q01nar":"1vqwg29", "1kjni38":"1eqyjiz", "11cpfhg":"1jlrtgg", "1r52mbh":"sv1c7",
    "hbj6er":"1xqjlyg", "1td37ue":"16bmkow", "whebcy":"1vreh39"
  };
  const reviewCopy = new Set(["opponentCue","opponentCueKind","routeRejection","routeChoiceReason","routeSetupReason","why","feedback","explanation"]);
  const augmentCopy = new Set([...reviewCopy,"miss","pickReason","explanation"]);
  // Feedback changed on these five released deals. Preserve the original
  // revision when the playable scenario and accepted answers still match.
  const sameLessonBriefs = {
    "interest-01":{"4nw5r7":"1bjizb0"}, "interest-02":{"1nc55jr":"wjy67w"},
    "interest-03":{"1yikvil":"1hkggtk"}, "interest-11":{"1lwpf6b":"1w7wukn"},
      "interest-12":{"6rmhwj":"321jwk"},
      "retention-13":{"1izp8uz":"chnotd"},
      // The same two shops now also accept keeping Gnar and using a remover.
      "retention-16":{"ery3q4":"5wokow"},
      // Same shops and resources; six recognizes an additional equipped carry
      // and nine clarifies the decision. All previously correct plays still pass.
      "retention-21":{"6ghcn1":"1shsgvs"}, "retention-24":{"1s2k5m6":"6hubza"}
  };
  function stamp(q) {
    if (!stamps.has(q)) {
      let hash = 2166136261;
      const augment = q.skill==="augment" || q.skill==="routeAugment";
      const copyFields = augment ? augmentCopy : reviewCopy;
      // Optional, display-only coaching never alters an answer or invalidates a saved board.
      const text = JSON.stringify(q,(key,value)=>{
        if (key==="fieldChanges" || key==="practiceGoal" || key==="hints" || key==="study" || copyFields.has(key)) return undefined;
        if (key==="revisedBrief") return Array.isArray(value) ? value.map(step=>step.facts || "") : value.facts || undefined;
        return value;
      });
      for (let i=0; i<text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      const key=(hash >>> 0).toString(36);
      stamps.set(q, sameLessonBriefs[q.id]?.[key] || (augment && publishedAugmentStamps[key]) || key);
    }
    return stamps.get(q);
  }
  function matchesProgressStamp(q, recordedStamp) {
    const current=stamp(q);
    if(current===recordedStamp)return true;
    // Two boxes had the wrong glove ID. The choices and their grading did not
    // change, so keep prior answers while restarting a draft with the right item.
    return (q.id==="augment-07" && current==="m9tvzb" && recordedStamp==="m517fn") ||
      (q.id==="augment-12" && current==="1uv3bjo" && recordedStamp==="15apw5f");
  }
  function version(catalog) { return [catalog?.schema, catalog?.patch, catalog?.asOf, catalog?.balanceRevision].join("/"); }
  function scoutLabel(name,index) {
    const seat="對手 "+(index+1), nick=(name || "").trim();
    return !nick || nick.replace(/\s/g,"")===seat.replace(/\s/g,"") ? seat : seat+"（"+nick+"）";
  }
  // Each frame owns only what the transaction changed. Appending combat history or
  // an action message therefore costs one array length, even in a long saved draft.
  function reverseFrame(before, after, kind) {
    const fields={}, arrays={};
    for (const key of Object.keys(before)) {
      const a=before[key], b=after[key];
      if (JSON.stringify(a)===JSON.stringify(b)) continue;
      if (Array.isArray(a) && Array.isArray(b)) {
        const entries=[];
        a.forEach((value,i)=>{ if (i>=b.length || JSON.stringify(value)!==JSON.stringify(b[i])) entries.push([i,value]); });
        arrays[key]={length:a.length,entries};
      } else fields[key]=a;
    }
    return {kind,fields,arrays,remove:Object.keys(after).filter(key=>!Object.hasOwn(before,key))};
  }
  function rewind(state, frame) {
    Object.assign(state,copy(frame.fields));
    for(const key of frame.remove) delete state[key];
    for (const [key,delta] of Object.entries(frame.arrays)) {
      const array=state[key]; array.length=delta.length;
      for(const [i,value] of delta.entries)array[i]=copy(value);
    }
    return state;
  }

  function create(q, catalog, saved) {
    if (!q?.id || !skillActions[q.skill] || !tiers.includes(q.tier)) throw new TypeError("題目缺少識別碼、技能或難度。");
    const steps = q.steps ? q.steps.map(step => ({...q, ...step})) : [q];
    if (q.skill==="retention" && steps.length!==2) throw new TypeError("留牌練習需要留牌與下一回合換人兩步。");
    if (!steps.length || steps.some(s => !s.round || !Array.isArray(s.rules) || !s.rules.length)) throw new TypeError("每次決策都需要商店情境與判分條件。");
    for (const {round} of steps) {
      if (typeof round.shopActive !== "boolean" || !Array.isArray(round.shop) || round.shop.length !== 5 ||
          !round.shop.every(id => round.shopActive ? Boolean(catalog.units[id]) : id === null)) {
        throw new TypeError("每步都要指定商店用途。開店填五張合法棋子，關店填五個空格。");
      }
    }
    const scenario = {
      id: q.id, seed: q.seed ?? q.id, initial: q.study ? q.initial : {...q.initial,removers:removerAllowance(q)}, settings: q.settings,
      rounds: steps.map(s => ({type: "pvp", ...s.round, rules: [], fightRules: []}))
    };
    if (!root.SimEngine?.create) throw new Error("須先載入站內的商店與盤面引擎。");
    const revision = stamp(q) + "/" + version(catalog);
    if (saved && (saved.version !== 1 || saved.qid !== q.id || saved.revision !== revision || !saved.game)) throw new Error("這份進度的題目或版本已經更換。");
    let sim = root.SimEngine.create(scenario, catalog, saved?.game);
    // At an augment round inside a board-only exercise, the teacher supplies that decision.
    // Route its effects through the normal on-pick code. The player's shop stays actionable.
    function presetAugment(model=sim) {
      const r = model.round();
      if (!r.autoAugment) return;
      const offered = typeof r.autoAugment === "string" ? {id:r.autoAugment} : r.autoAugment;
      const definition = catalog.augments[offered.id];
      if (!definition || !definition.stages.includes(r.id) || r.augments?.length || model.state.augments.includes(offered.id)) {
        throw new Error("本題代選增幅不符合該回合的條件。");
      }
      r.augments = [{...definition, ...offered}];
      try {
        const pick = model.act("augment", {id: offered.id});
        if (!pick.ok) throw new Error(pick.message);
        model.state.currentAugment = null;
      } finally { delete r.augments; }
    }
    if (!saved) presetAugment();
    let runId = saved?.runId || uid(), attempts = saved?.attempts || 0;
    let hinted = !!saved?.hinted, revealed = !!saved?.revealed, missed = !!saved?.missed;
    let last = saved?.last ? copy(saved.last) : null;
    if (q.id==="retention-16" && last?.stepIndex===0 && !last.passed && saved.game.state.removers===undefined) {
      last=null;
    }
    const snapshot = state => ({version:1,scenarioId:q.id,state:copy(state),undo:[]});
    const rebuild = state => root.SimEngine.create(scenario,catalog,snapshot(state));
    let journal=[], baselines={};
    if(saved?.undoJournal) {
      journal=copy(saved.undoJournal); baselines=copy(saved.baselines);
    } else {
      // Earlier releases exported up to four same-round native undo snapshots.
      const available=saved?.game.undo || [], n=Math.min(saved?.edits || 0,available.length);
      const old=available.slice(available.length-n);
      old.forEach((prior,i)=>journal.push(reverseFrame(copy(prior),old[i+1] || sim.state,"edit")));
      let original=saved?.legacyRoundStart;
      if (!original || original.roundIndex!==sim.state.roundIndex) {
        if(saved && !sim.state.roundIndex) {
          const initial=root.SimEngine.create(scenario,catalog); presetAugment(initial); original=initial.state;
        } else original=old[0] || sim.state;
      }
      baselines[sim.state.roundIndex]=copy(original);
    }
    function step() { return steps[sim.state.roundIndex]; }
    const isComponent = item => catalog.items[item]?.kind === "component";
    const rosterPractice = ["board","transition","interest","retention"].includes(q.skill);
    const completedItems=new Set((catalog.recipes || []).map(recipe=>recipe.result));
    function gearCounts(state) {
      const counts=new Map();
      const add=item=>counts.set(item,(counts.get(item)||0)+1);
      state.items.forEach(add);
      for(const piece of [...state.board,...state.bench])if(piece)piece.items.forEach(add);
      return counts;
    }
    function routePreparation() {
      const {routeBuilds:builds,routeStrategy:strategy}=step();
      if (!builds?.length) return null;
      const opening=baselines[sim.state.roundIndex], current=sim.state;
      const fromStart=[...opening.board,...opening.bench].filter(Boolean);
      const oldGear=gearCounts(opening), newGear=gearCounts(current);
      const crafted=item=>current.routeCrafted?.includes(item) && completedItems.has(item) && newGear.get(item)>(oldGear.get(item)||0);
      const craftedItems=[...newGear.keys()].filter(crafted).sort();
      const promoted=p=>p?.star>=2 && p.routeUpgraded;
      const owned=[...current.board,...current.bench].filter(Boolean);
      const upgraded=owned.some(promoted);
      // A second copy crafted on the rack does not turn a holder's starting item into a new slam.
      // Count equipment across the original copies since a star upgrade can consolidate them.
      const newOnHolder=p=>p.items.filter((item,i)=>crafted(item) &&
        p.items.slice(0,i+1).filter(id=>id===item).length >
        fromStart.reduce((n,old)=>n+(old.id===p.id ? old.items.filter(id=>id===item).length : 0),0));
      const holders=current.board.filter(Boolean)
        .map(p=>({p,items:newOnHolder(p)})).filter(row=>row.items.length);
      const worn=holders.filter(({p})=>promoted(p)).map(({p,items})=>({id:p.id,items:items.sort()}))
        .sort((a,b)=>a.id.localeCompare(b.id));
      const copies={};
      for(const b of builds)if(b.minCopies)copies[b.holder]=owned.reduce((sum,p)=>
        sum+(p.id===b.holder ? 3**(p.star-1) : 0),0);
      const scouted=current.routeScouted?.[current.roundIndex]||[];
      const scoutTotal=strategy?.scout?.boards?.length || 0;
      const scoutComplete=scouted.length===scoutTotal;
      const loose=items=>items.filter(id=>catalog.items[id]?.kind==="component").sort();
      const keptComponents=JSON.stringify(loose(opening.items))===JSON.stringify(loose(current.items));
      return {upgraded,equipped:holders.length>0,ready:worn.length>0 && scoutComplete,selected:!!current.currentPlan,
        contestCount:current.currentPlan && Number.isInteger(current.routeContestCount) ? current.routeContestCount : null,
        holderIds:worn.map(p=>p.id),worn,craftedItems,keptComponents,copies,scouted:[...scouted],scoutTotal,scoutComplete};
    }
    function preparationHint(prep) {
      if (!prep.upgraded) return "先看商店和手上的對子，買進第三張合成二星。";
      if (!prep.worn.length) return "把兩個散件合成一件裝備，讓這回合升到二星的持裝者上場。";
      return "偵查七家，再選陣容方向。";
    }
    function lessonAllows(type) {
      // 站主 2026-11-28「為什麼不讓我上裝」：裝備欄有裝備（賣棋收回、拆下來的）就一律能裝，跟遊戲一樣
      if (type==="equip" && skillActions[q.skill].includes("move") && sim.state.items.length>0) return true;
      return skillActions[q.skill].includes(type) && (step().allowed || skillActions[q.skill]).includes(type);
    }
    function can(type) {
      if (equipmentToolAllows(q,sim.state,type)) return true;
      if (type==="buyTo") return can("buy") && can("move");
      if(type==="contestCount")return can("plan") && !!step().routeStrategy?.scout?.boards?.length;
      if(type==="scout" && !step().routeStrategy?.scout?.boards?.length)return false;
      if (!sim.round().shopActive && ["buy","reroll","lock"].includes(type)) return false;
      return lessonAllows(type) || (type==="equip" && rosterPractice && q.skill!=="retention" && sim.state.items.some(isComponent));
    }
    function transaction(kind,operation) {
      const before=copy(sim.state);
      try {
        const result=operation();
        if(!result.ok) {
          if(JSON.stringify(before)!==JSON.stringify(sim.state))sim=rebuild(before);
          return result;
        }
        journal.push(reverseFrame(before,sim.state,kind));
        last=null;return result;
      } catch(error) {sim=rebuild(before);throw error;}
    }
    function purchaseTo({index,to}) {
      if(!to || !["board","bench"].includes(to.zone) || !Number.isInteger(to.index) || to.index<0 || to.index>=sim.state[to.zone].length) return blocked("請先選擇有效的棋格。");
      const id=sim.state.shop[index];
      const previous=sim.state.bench.map(p=>p?.id+":"+p?.star);
      const bought=sim.act("buy",{index});
      if(!bought.ok)return bought;
      const slot=sim.state.bench.findIndex((p,i)=>p?.id===id && previous[i]!==p.id+":"+p.star);
      // A triple can complete directly on the board without a separate bench piece.
      if(slot<0 || (sim.state.bench[slot].star>1) || (to.zone==="bench" && to.index===slot))return bought;
      return sim.act("move",{from:{zone:"bench",index:slot},to});
    }
    function act(type, payload = {}) {
      if (!can(type)) return blocked("本題只開放和這次練習有關的操作。");
      if(type==="equip" && !lessonAllows(type) && !equipmentToolAllows(q,sim.state,type)) {
        const item=sim.state.items[payload.itemIndex], target=payload.to;
        if(!isComponent(item))return blocked("這題可以自行分配散件。");
        const wearer=target && ["board","bench"].includes(target.zone) && sim.state[target.zone][target.index];
        if(wearer?.items.some(held=>catalog.recipes.some(recipe=>
          (recipe.a===item && recipe.b===held) || (recipe.b===item && recipe.a===held)))) {
          return blocked("這樣會合成裝備。散件可以先留著，或給另一位隊友。");
        }
      }
      if(type==="scout") {
        const boards=step().routeStrategy.scout.boards, {index}=payload;
        if(!Number.isInteger(index) || index<0 || index>=boards.length)return blocked("請選擇要看的玩家。");
        const round=sim.state.roundIndex, viewed=sim.state.routeScouted?.[round]||[];
        if(viewed.includes(index))return {ok:true,message:"已查看"+boards[index].name+"。"};
        return transaction(type,()=>{
          sim.state.routeScouted={...sim.state.routeScouted,[round]:[...viewed,index]};
          return {ok:true,message:"已查看"+boards[index].name+"。"};
        });
      }
      if(type==="contestCount"){
        if(!sim.state.currentPlan || !routePreparation().ready)return blocked("先選擇要判斷的陣容。");
        if(!Number.isInteger(payload.count) || payload.count<0 || payload.count>7)return blocked("選擇 0 到 7 家。");
        if(sim.state.routeContestCount===payload.count)return {ok:true};
        return transaction(type,()=>{
          sim.state.routeContestCount=payload.count;
          return {ok:true};
        });
      }
      const prep=step().routeBuilds && (type==="plan" || sim.state.currentPlan) ? routePreparation() : null;
      if (type==="plan" && prep && !prep.ready) return blocked(preparationHint(prep));
      if(type==="plan" && sim.state.currentPlan===payload.id)return blocked("已選擇這個陣容。");
      return transaction(type,()=>{
        const route=q.skill==="route";
        const buying=route && (type==="buy" || type==="buyTo");
        const crafting=route && (type==="equip" || type==="combine");
        const oldStars=buying && new Map([...sim.state.board,...sim.state.bench].filter(Boolean).map(p=>[p,p.star]));
        const oldGear=crafting && gearCounts(sim.state);
        const result=type==="buyTo" ? purchaseTo(payload) : sim.act(type,payload);
        if (!result.ok) return result;
        if(buying)for(const p of [...sim.state.board,...sim.state.bench]){
          if(p?.star>=2 && (oldStars.get(p)||1)<p.star)p.routeUpgraded=true;
        }
        if(crafting)for(const [item,count] of gearCounts(sim.state)){
          if(completedItems.has(item) && count>(oldGear.get(item)||0)){
            sim.state.routeCrafted=[...new Set([...(sim.state.routeCrafted || []),item])];
          }
        }
        if(type==="plan")delete sim.state.routeContestCount;
        if (result.ok && type!=="plan" && prep?.selected) {
          const after=routePreparation();
          if(["worn","craftedItems","keptComponents","copies"].some(key=>JSON.stringify(prep[key])!==JSON.stringify(after[key]))) {
            sim.state.currentPlan=null;
            sim.state.plan=q.initial.plan || "";
            delete sim.state.routeContestCount;
          }
        }
        return result;
      });
    }
    const canUndo=()=>journal.length>0;
    function undo() {
      if(!canUndo())return blocked("已在這題的開局。");
      const previousRound=sim.state.roundIndex, frame=journal.at(-1);
      sim=rebuild(rewind(copy(sim.state),frame));journal.pop();
      const crossed=previousRound!==sim.state.roundIndex;
      if(crossed)delete baselines[previousRound];
      last=null;
      return {ok:true,kind:frame.kind,stepChanged:crossed,message:crossed?"已回到 "+sim.round().id+" 結算前。":"已復原上一步。"};
    }
    function reset() {
      sim = root.SimEngine.create(scenario, catalog);
      presetAugment();
      // Starting the same problem over after seeing feedback is still a supported retry.
      last=null; journal=[]; baselines={0:copy(sim.state)};
      return {ok: true, message: "已回到題目的開局。"};
    }
    function nativeBattle() {
      if (!sim.round().opponent?.units?.length) return null;
      return sim.battle();
    }
    const traitNames=Object.fromEntries(Object.entries(catalog.traits || {}).map(([name,trait])=>[trait.id,name]));
    const traitCache=new WeakMap();
    function nativeTraits(state) {
      const sig=JSON.stringify([state.board,state.augments]);
      const cached=traitCache.get(state);
      if(cached?.signature===sig)return cached.rows;
      const runtime=root.TrialsTrainingNativeRuntime;
      if(!runtime?.data)throw new Error("羈絆資料尚未就緒，請重新載入。");
      const pieces=state.board.flatMap((p,i)=>p?[{key:catalog.units[p.id].siteKey || p.id.replace(/^TFT19_/,""),
        star:p.star || 1,items:(p.items || []).map(item=>catalog.items[item]?.key || item),pos:[Math.floor(i/7),i%7]}]:[]);
      const opts={augments:state.augments};
      const count=root.FocusNativeRenderers?.stats?.countTraits || runtime.countTraits;
      // The headless combat bundle exposes the same counter through buildTeam.
      const raw=count?count(pieces,runtime.data,opts):runtime.buildTeam("player",pieces,runtime.data,{
        ...opts,level:state.level,round:state.roundIndex+1,persist:{},rng:runtime.makeRng(1)
      }).traits;
      const rows=raw.map(t=>{
        const name=traitNames[t.key] || t.zh;
        return {name,count:t.count,active:t.tierCount,next:t.next,
          unit:catalog.traits[name]?.countBy==="fielded_stars"?"星":"人",
          members:t.members.map(key=>"TFT19_"+key)};
      });
      traitCache.set(state,{signature:sig,rows});
      return rows;
    }
    function traitState(name,state) {
      const def=catalog.traits[name];
      if(!def)throw new Error("找不到羈絆："+name);
      return nativeTraits(state).find(row=>row.name===name) || {name,count:0,active:0,next:def.breakpoints[0]??null,
        unit:def.countBy==="fielded_stars"?"星":"人",members:[]};
    }
    function scoutTraits(index) {
      const rival=step().routeStrategy?.scout?.boards?.[index];
      if(!rival)return [];
      const board=Array(28).fill(null);
      for(const piece of rival.units)board[piece.cell]=piece;
      return copy(nativeTraits({board,augments:rival.augments.map(pick=>pick.id),
        level:rival.level,roundIndex:sim.state.roundIndex}).filter(trait=>trait.active>0));
    }
    function traitFeedback() {
      const evidence=step().evidence;
      const targets=new Set((evidence?.traits || []).map(t=>typeof t==="string"?t:t.name));
      function collect(rule) {
        if(rule.test==="trait" || rule.test==="traitTier")targets.add(rule.name);
        for(const child of rule.rules || [])collect(child);
        for(const key of ["rule","when","then","else"])if(rule[key])collect(rule[key]);
      }
      for(const rule of step().rules)collect(rule);
      const before=baselines[sim.state.roundIndex];
      return [...targets].map(name=>{
        const a=traitState(name,before), b=traitState(name,sim.state);
        return {name,unit:b.unit,before:copy(a),after:copy(b)};
      });
    }
    function preservesOpeningGear(rule) {
      if (!rosterPractice || lessonAllows("equip") || !["holds","itemsOn"].includes(rule.test)) return false;
      if (rule.ids?.length!==1 || !rule.items?.length || rule.max!=null) return false;
      if (rule.min!==(rule.test==="holds" ? 1 : rule.items.length)) return false;
      return q.initial.board.some(p=>p?.id===rule.ids[0] && (p.star||1)===rule.star &&
        p.items?.length===rule.items.length && p.items.every((item,i)=>item===rule.items[i]));
    }
    function wearingOriginalItems(piece,rule) {
      if (!piece || piece.id!==rule.ids[0] || piece.star<rule.star) return false;
      const worn=piece.items.slice();
      for(const item of rule.items) {
        if(isComponent(item))continue;
        const index=worn.indexOf(item);
        if(index<0)return false;
        worn.splice(index,1);
      }
      return true;
    }
    function check(rule,choice) {
      // A roster exercise may preserve a starting unit's full build. Item
      // exercises and rules naming a specific new item keep native semantics.
      if(preservesOpeningGear(rule))return sim.state.board.some(p=>wearingOriginalItems(p,rule));
      switch (rule.test) {
        case "onBoardUnique": {
          const names=new Set(sim.state.board.filter(p=>p && (!rule.ids || rule.ids.includes(p.id)) && p.star>=(rule.star || 1)).map(p=>p.id));
          return names.size >= (rule.min??(rule.max==null?1:0)) && names.size <= (rule.max??Infinity);
        }
        case "ownedTrait": {
          const owned=[...sim.state.board,...sim.state.bench];
          const traits=root.SimEngine.traitsForBoard(owned,catalog.units,catalog.traits);
          return (traits.find(t=>t.name===rule.name)?.count || 0)>=rule.min;
        }
        case "trait": case "traitTier": {
          const tier=rule.test==="traitTier", trait=traitState(rule.name,sim.state);
          const bp=catalog.traits[rule.name].breakpoints;
          const min=rule.min ?? (rule.max!=null?0:tier?bp[0]:1);
          if(tier && [min,rule.max].some(n=>n!=null && n!==0 && !bp.includes(n)))throw new Error(rule.name+" 沒有指定的羈絆檔位。");
          const value=tier?trait.active:trait.count;
          return value>=min && value<=(rule.max??Infinity);
        }
        case "removers": return (sim.state.removers ?? 0) >= rule.min;
        case "shopUntouched": return sim.state.shop.every((id,i) => id === sim.round().shop[i]);
        case "battleWin": {
          const result = nativeBattle();
          if (!result) throw new Error("本站戰鬥資料尚未就緒，請重新載入後再判分。");
          return result.won;
        }
        case "incomeInterest": {
          if (!["win","loss"].includes(rule.outcome)) throw new Error("利息情境須指定勝負。");
          const value = sim.previewIncome(rule.outcome).interest;
          return value >= (rule.min ?? 0) && value <= (rule.max ?? Infinity);
        }
        case "keepOpeningInterest":
          return root.SimEngine.keepsPvpInterest(baselines[sim.state.roundIndex].gold, sim.state.gold, q.settings?.interestCap);
        case "lossInterestWithBenchSale": {
          if (sim.previewIncome("win").interest < rule.min) return false;
          if (sim.previewIncome("loss").interest >= rule.min) return true;
          return sim.state.bench.some(p => p && p.star === 1 && !p.items.length &&
            (!rule.ids || rule.ids.includes(p.id)) && !rule.protect?.includes(p.id) &&
            sim.interest(sim.state.gold + sim.sellValue(p)) >= rule.min);
        }
        case "inventory": {
          const count = sim.state.items.filter(item => rule.items.includes(item)).length;
          return count >= (rule.min ?? (rule.max == null ? 1 : 0)) && count <= (rule.max ?? Infinity);
        }
        case "augment": return (rule.ids || []).includes(choice?.augment ?? sim.state.currentAugment);
        case "plan": return (rule.ids || []).includes(choice?.plan ?? sim.state.currentPlan);
        case "all": return rule.rules.every(child=>check(child,choice));
        case "any": return rule.rules.some(child=>check(child,choice));
        case "not": return !check(rule.rule,choice);
        case "if": return check(rule.when,choice) ? check(rule.then,choice) : (!rule.else || check(rule.else,choice));
        default: return sim.check(rule);
      }
    }
    // Names on a scouting screen are nicknames. Use the same numbered seat in feedback.
    function withOpponentLabels(message) {
      const seats=step().routeStrategy?.scout?.boards;
      if(!message || !seats?.length)return message;
      const labels=new Map(seats.map((seat,index)=>[seat.name,scoutLabel(seat.name,index)]));
      const escape=name=>name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const names=[...labels.keys()].sort((a,b)=>b.length-a.length).map(escape);
      return message.replace(new RegExp(names.join("|"),"g"),name=>labels.get(name));
    }
    function matchesRoute(build,prep) {
      if(!build.holder)return false;
      if(build.minCopies && prep.copies[build.holder]<build.minCopies)return false;
      return prep.worn.some(p=>p.id===build.holder && p.items.some(item=>build.items.includes(item)));
    }
    function routeRequirement(build,prep) {
      if(!build.holder) {
        const items=baselines[sim.state.roundIndex].items.filter(id=>catalog.items[id]?.kind==="component");
        return "請把"+items.join("和")+"都留在裝備欄。可以復原剛才的穿裝或合裝。";
      }
      const name=catalog.units[build.holder].name, pieces=sim.state.board.filter(p=>p?.id===build.holder);
      const best=Math.max(0,...pieces.map(p=>p.star)), items=build.items.join("或");
      const extra=build.minCopies && prep.copies[build.holder]<build.minCopies?
        "你實際持有 "+prep.copies[build.holder]+" 張"+name+"，本題的追三開局要買齊眼前的 "+build.minCopies+" 張。":"";
      const star=best===0?"目前"+name+"沒有上場。":best<2?"目前場上的"+name+"仍是一星。":"";
      const worn=pieces.find(p=>p.star===best)?.items || [];
      const carry=prep.worn.find(p=>p.id!==build.holder);
      let gear="";
      if(!prep.worn.some(p=>p.id===build.holder && p.items.some(i=>build.items.includes(i)))) {
        if(carry)gear="你實際讓"+catalog.units[carry.id].name+"帶了"+carry.items.join("、")+"。";
        else if(worn.length)gear="場上的"+name+"現在穿著"+worn.join("、")+"。";
        else if(prep.craftedItems.length)gear="你目前已合出"+prep.craftedItems.join("、")+"。";
      }
      return extra+star+gear+"這條線要讓二星"+name+"上場，並穿上這回合合的"+items+"。";
    }
    function reviewRoute(card,prep) {
      const s=step(),scout=s.routeStrategy?.scout;
      const builds=s.routeBuilds.filter(b=>b.plans.includes(card.id));
      if(scout?.blockedPlans?.includes(card.id)) {
        const rivals=scout.rivalsByPlan[card.id], name=card.carry || card.name;
        const observations=rivals.map(clue=>clue.rival+"的盤面顯示，"+clue.reason);
        const competition="已有 "+rivals.length+" 家投入"+card.name+"，你升八後還要和他們從同一個牌池找"+name+"。";
        return {accepted:false,status:"unsuitable",reason:withOpponentLabels(observations.join(" ")+competition)};
      }
      const branch=builds.find(b=>(b.holder || card.id===flexibleEight) && matchesRoute(b,prep));
      const accepted=!!branch && s.rules.every(rule=>check(rule,{plan:card.id}));
      if(accepted)return {accepted,status:"recommended",reason:withOpponentLabels(card.routeChoiceReason || branch.reason)};
      if(builds.length)return {accepted:false,status:"conditional",
        reason:withOpponentLabels((card.routeSetupReason || "")+routeRequirement(builds[0],prep))};
      return {accepted:false,status:"unsuitable",reason:withOpponentLabels(card.routeRejection || card.miss || s.hint)};
    }
    function reviewContests(scout,planId,reported) {
      const observations=scout.rivalsByPlan?.[planId];
      if(!Array.isArray(observations))throw Error(q.id+" 缺少陣容同行資料 "+planId);
      const rivals=observations.map(clue=>{
        const seat=scout.boards.findIndex(board=>board.name===clue.rival)+1;
        if(!seat || !clue.reason)throw Error(q.id+" 的同行線索缺少對手或依據。");
        return {seat,name:clue.rival,reason:clue.reason};
      }).sort((a,b)=>a.seat-b.seat);
      if(new Set(rivals.map(r=>r.seat)).size!==rivals.length)throw Error(q.id+" 的同行資料重複計算同一位對手。");
      return {planId,reported,expected:rivals.length,correct:reported===rivals.length,rivals};
    }
    function optionReviews(prep) {
      const s=step(),round=sim.round();
      const reviewingPlans=!!round.plans?.length && !!prep;
      const cards=reviewingPlans ? round.plans : round.augments;
      if(!cards?.length)return [];
      const selected=reviewingPlans ? sim.state.currentPlan : sim.state.currentAugment;
      const rows=cards.map(card=>{
        if(reviewingPlans)return {id:card.id,name:card.name,selected:card.id===selected,...reviewRoute(card,prep)};
        const accepted=s.rules.every(rule=>check(rule,{augment:card.id}));
        return {id:card.id,name:card.name,selected:card.id===selected,accepted,status:accepted?"recommended":"unsuitable",
          reason:accepted ? card.pickReason || s.explanation : card.miss || s.hint};
      });
      if(rows.filter(row=>row.accepted).length>1)
        for(const row of rows)if(row.accepted)row.status="viable";
      return rows;
    }
    function lastResult() {
      if(!last)return null;
      if(!last.optionReviews && (sim.round().plans?.length || sim.round().augments?.length)) {
        last.optionReviews=optionReviews(routePreparation());
        const chosen=last.optionReviews.find(row=>row.selected);
        if(chosen) {
          last.feedback=chosen.reason;
          if(last.passed)last.explanation=chosen.reason;
        }
      }
      return copy(last);
    }
    // 站主 2026-11-28：不卡利息的牌都要買起來，誰知道下回合怎麼進牌。
    // 開打前的錢扣掉這回合要守的檔位還買得起、備戰也放得下的店內棋，沒買就判錯。
    function spareFloor(s) {
      const golds=[];
      const walk=rule=>{if(!rule)return;if(rule.test==="gold"&&Number.isFinite(rule.min))golds.push(rule.min);
        if(rule.test==="lossInterestWithBenchSale"&&Number.isFinite(rule.min))golds.push(rule.min*10);
        for(const child of rule.rules||[])walk(child);};
      for(const rule of s.rules)walk(rule);
      if(Number.isInteger(s.interestFloor))golds.push(s.interestFloor*10);
      return golds.length?Math.max(...golds):null;
    }
    function spareBuys() {
      const s=step();
      if(!["board","interest","retention"].includes(q.skill) || s.spareBuys===false)return null;
      if(sim.round().shopActive===false || sim.round().type==="carousel")return null;
      const floor=spareFloor(s);
      if(floor==null)return null;
      if(!sim.state.bench.some(p=>!p))return null;
      const names=[];
      for(const id of sim.state.shop){
        const unit=id && catalog.units[id];
        if(!unit)continue;
        if(unit.locked && !(sim.state.unlocked||[]).includes(id))continue;
        if(sim.state.gold-unit.cost>=floor && !names.includes(unit.name))names.push(unit.name);
      }
      return Object.assign(names,{names,floor});
    }
    function submit() {
      if (last) return lastResult();
      const s = step();
      const prep=routePreparation();
      if(prep?.worn.length && !prep.scoutComplete)return {ok:false,pending:true,needsScouting:true,passed:false,complete:false,
        feedback:preparationHint(prep),checks:[]};
      if (prep && !prep.ready) return {ok:false,pending:true,needsPreparation:true,passed:false,
        complete:false,feedback:preparationHint(prep),checks:[]};
      const pending = (can("augment") && !sim.state.currentAugment) || (can("plan") && !sim.state.currentPlan);
      if (pending) return {ok: false, pending: true, passed: false, complete: false, feedback: prep?"看完手牌和裝備，選擇這把的方向。":"先選一張卡，再確認選擇。", checks: []};
      if(prep?.scoutTotal && prep.contestCount===null)return {ok:false,pending:true,needsContestCount:true,passed:false,complete:false,
        feedback:"選擇這個陣容有幾家同行。",checks:[]};
      const checks = s.rules.map(rule => ({ok: check(rule), label: rule.label || "", why: rule.why || ""}));
      const spare=spareBuys();
      if(spare)checks.push({ok:!spare.length,label:"不卡利息的牌要買起來",
        why:spare.length?"還有 "+(sim.state.gold-spare.floor)+" 金不卡利息，店裡的"+spare.names.join("、")+"買起來放備戰，下回合不知道會進什麼牌。":""});
      const reviews=optionReviews(prep),chosen=reviews.find(row=>row.selected);
      if (prep) checks.push({ok:!!chosen?.accepted,label:s.routeStrategy?"開局來牌、裝備與路線":"二星持裝者與陣容交接",why:chosen?.accepted?"":chosen?.reason});
      const contestReview=prep?.scoutTotal ? reviewContests(s.routeStrategy.scout,sim.state.currentPlan,prep.contestCount) : null;
      const countFeedback=contestReview && "你選了 "+contestReview.reported+" 家，場上有 "+contestReview.expected+" 家同行。";
      if(contestReview)checks.push({ok:contestReview.correct,label:"所選陣容的同行家數",why:contestReview.correct?"":countFeedback});
      const passed = checks.every(c => c.ok);
      const complete = passed && sim.state.roundIndex === steps.length - 1;
      const explanation=chosen?.reason || s.explanation;
      const lostOnlyInterest = checks.some((c,i)=>!c.ok && s.rules[i]?.test==="keepOpeningInterest") &&
        checks.every((c,i)=>c.ok || s.rules[i]?.test==="keepOpeningInterest");
      const targetGold = Number.isInteger(s.interestFloor) ? s.interestFloor*10 : 0;
      const missedFloor = sim.state.gold < targetGold;
      const floorFeedback = missedFloor ? "現在 "+sim.state.gold+" 金，離 "+targetGold+" 金還差 "+(targetGold-sim.state.gold)+" 金。看看備戰區，或復原剛才的購買。" : "";
      const levelFeedback = Number.isInteger(s.maximumLevel) && sim.state.level>s.maximumLevel
        ? s.rules.find(rule=>rule.test==="level" && rule.max===s.maximumLevel)?.why : "";
      const feedback = levelFeedback || (missedFloor ? floorFeedback : lostOnlyInterest ? "上場的人選已經到位。看看備戰席，結算前還能怎麼把少掉的一息補回來？" :
        contestReview && !contestReview.correct ? countFeedback : passed ? explanation : chosen?.reason ||
        (s.feedback || []).find(f => !check(f.rule))?.miss || s.hint);
      if (!passed) missed = true;
      attempts++;
      last = {
        ok: true, passed, correct: passed, complete, hasNext: passed && !complete,
        feedback, explanation: passed ? explanation : "", ...(reviews.length?{optionReviews:reviews}:{}), ...(contestReview?{contestReview}:{}),hinted, revealed,
        traitReview:traitFeedback(), evidenceReason:s.evidence?.reason || "",
        assisted: hinted || revealed || missed, independent: complete && !hinted && !revealed && !missed,
        attempts, checks, runId, submissionId: runId + "/" + attempts, questionId:q.id, stepIndex:sim.state.roundIndex
      };
      return copy(last);
    }
    function advance() {
      if (!last?.hasNext) return blocked("先完成這回合的練習。");
      if (sim.round().type === "pvp" && !nativeBattle()) return blocked("缺少本回合的戰鬥資料，暫時無法結算。");
      if (sim.evaluate().hpAfter <= 0) return blocked("這次戰鬥會耗盡生命。可以調整後再出戰，或重設本題。");
      return transaction("advance",()=>{
        const result=sim.act("commit");
        if(result.ok){presetAugment();baselines[sim.state.roundIndex]=copy(sim.state);}
        return result;
      });
    }
    return {
      q, get sim() { return sim; }, get state() { return sim.state; }, get step() { return step(); },
      get stepCount() { return steps.length; }, get stepIndex() { return sim.state.roundIndex; },
      get lastSubmission() { return lastResult(); },
      round: () => sim.round(), routePreparation, can, act, canUndo, undo, reset, submit, advance, check,
      roundBaseline() {
        const baseline=baselines[sim.state.roundIndex];
        return {version:1,qid:q.id,revision,game:snapshot(baseline),legacyRoundStart:copy(baseline)};
      },
      hint() { hinted = true; return step().hint; },
      reveal() { revealed = true; return withOpponentLabels(step().explanation); },
      traits: () => copy(nativeTraits(sim.state)), scoutTraits, interest: amount => sim.interest(amount),
      sellValue: p => sim.sellValue(p), previewIncome: result => sim.previewIncome(result), battle: nativeBattle,
      export() { return {version:1, qid:q.id, revision, game:snapshot(sim.state), runId, attempts, hinted, revealed, missed, last:copy(last), undoJournal:copy(journal),baselines:copy(baselines)}; }
    };
  }

  function createProgress(saved, catalog = root.FocusCatalog, drafts = {}) {
    const balance=version(catalog);
    const data=saved?.version===1 && saved.balance===balance && saved.entries && saved.runs ?
      copy(saved) : {version:1,balance,entries:{},runs:{},recent:{}};
    const checkedDrafts=new WeakSet();
    const toTime=value=>value instanceof Date ? value.getTime() : Number(value);
    const due=(e,now)=>!!e?.review && (e.other.length>=2 || now>=e.after);
    function finalSubmission(q,result) {
      if(!result || result.ok!==true || result.pending || result.questionId!==q.id ||
        !result.runId || !Number.isInteger(result.attempts) || result.attempts<1 ||
        typeof result.passed!=="boolean" || (result.passed && !result.complete))return false;
      const finalIndex=(q.steps?.length || 1)-1;
      // Old single-step saves and completed runs may omit the index.
      return result.stepIndex===finalIndex || (result.stepIndex==null && (finalIndex===0 || result.complete===true));
    }
    function fresh(q) {
      return data.entries[q.id]={skill:q.skill,tier:q.tier,stamp:stamp(q),family:q.family || "",
        answered:false,completed:false,independent:false,review:false,other:[],after:0};
    }
    function entry(q) {
      let e=data.entries[q.id];
      if(e && !matchesProgressStamp(q,e.stamp)){
        const revision=catalog?.priorCourseCredit?.[q.id];
        if(revision?.to===stamp(q) && revision.from.includes(e.stamp) && (e.completed || e.independent)){
          // Credit already earned is kept. A saved board still uses the exact
          // scenario revision and cannot restore an outdated grading result.
          e.stamp=stamp(q);e.completed=true;e.answered=true;e.review=false;e.previousEdition=true;
        }
      }
      if(!e || !matchesProgressStamp(q,e.stamp))e=null;
      if(e && typeof e.answered!=="boolean") {
        // Old wrong submissions mixed up failed intermediate and final rounds.
        // A completed run or a recorded single-step mistake proves a final answer.
        e.completed=!!(e.completed || e.independent);
        e.answered=e.completed || ((q.steps?.length || 1)===1 && !!e.review);
        e.review=e.answered && !e.completed;
      }
      if(!checkedDrafts.has(q)) {
        checkedDrafts.add(q);
        const draft=drafts?.[q.id], game=draft?.game, result=game?.last;
        if(game?.qid===q.id && game.revision===stamp(q)+"/"+balance && finalSubmission(q,result)) {
          e ||= fresh(q);
          e.answered=true;
          e.completed ||= !!result.complete;
          e.independent ||= !!result.independent;
          e.review=!e.completed;
          e.lastAt=Math.max(e.lastAt || 0,draft.at || 0);
          data.runs[result.runId]=Math.max(data.runs[result.runId] || 0,result.attempts);
        }
      }
      return e;
    }
    function record(q,result,now=Date.now()) {
      if(!finalSubmission(q,result))return false;
      const previous=entry(q);
      if(data.runs[result.runId]>=result.attempts)return false;
      data.runs[result.runId]=result.attempts;
      const e=previous || fresh(q);
      e.answered=true;
      e.lastAt=toTime(now);
      e.lastIndependent=!!result.independent;
      if(result.complete) {
        e.completed=true;
        if(e.previousEdition)delete e.previousEdition;
        e.independent ||= !!result.independent;
        // Preserve optional spaced-review due counts; they do not drive course navigation.
        for(const [id,item] of Object.entries(data.entries)) {
          if(id!==q.id && order.chapterOf({...item,id})===order.chapterOf(q) && item.review && !item.other.includes(q.id))item.other.push(q.id);
        }
      }
      if(!e.completed && !e.review){e.other=[];e.after=e.lastAt+day;}
      e.review=!e.completed;
      return true;
    }
    // Internal subject keys remain available to old links and to callers that
    // review all of a retired syllabus, including its earlier tier boundaries.
    const legacySkill=skill=>skill==="interest" || skill==="board";
    const inChapter=(q,skill)=>legacySkill(skill) ? q.skill===skill : order.chapterOf(q)===skill;
    const inTier=(q,skill,tier)=>(legacySkill(skill) ? q.tier : order.tierOf(q))===tier;
    function next(questions,skill,tier) {
      return order.sort(questions.filter(q=>inChapter(q,skill) && inTier(q,skill,tier))).find(q=>!entry(q)?.answered) || null;
    }
    function courseNext(questions,skill) {
      for(const tier of tiers) {
        const question=next(questions,skill,tier);
        if(question)return {question,tier,finished:false};
      }
      return {question:null,tier:null,finished:true};
    }
    function counts(pool,now) {
      const entries=pool.map(entry).filter(Boolean);
      return {total:pool.length,answered:entries.filter(e=>e.answered).length,completed:entries.filter(e=>e.completed).length,
        independent:entries.filter(e=>e.independent).length,review:entries.filter(e=>e.review).length,due:entries.filter(e=>due(e,now)).length};
    }
    function summary(questions,skill,now=Date.now()) {
      const list=questions.filter(q=>inChapter(q,skill));
      const byTier=tiers.map(tier=>{
        const stats=counts(list.filter(q=>inTier(q,skill,tier)),now);
        return [tier,{...stats,ready:stats.total>0 && stats.answered===stats.total}];
      });
      return {...counts(list,now),tiers:Object.fromEntries(byTier)};
    }
    return {record,next,courseNext,summary,status(q){const e=entry(q);return e?copy(e):null;},export:()=>copy(data)};
  }
  return {create, createProgress, removerAllowance, equipmentToolAllows, scoutLabel, skills:Object.keys(skillActions), tiers};
});

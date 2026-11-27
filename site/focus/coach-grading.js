/* Compare one recorded answer, one shop at a time. No solutions are inferred from a lesson ID. */
(function (root, factory) {
  function engine() {
    if (root.SimEngine) return root.SimEngine;
    if (typeof module === "object" && module.exports) {
      const fs = require("node:fs"), path = require("node:path");
      return fs.existsSync(path.join(__dirname,"engine.js")) ? require("./engine.js") : require("../s19sim/engine.js");
    }
    throw Error("棋盤規則尚未載入。");
  }
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FocusCoachGrading = api;
})(globalThis, function (engine) {
  "use strict";

  const modes = {
    board:["roster","positions","traits","count","ignore"],
    gear:["holders","items","exact","ignore"],
    economy:["interest","floor","gold","ignore"],
    bench:["roster","pairs","retained","ignore"],
    decision:["required","ignore"]
  };
  const skillsWithChoice = new Set(["route","augment","routeAugment"]);
  const isAugment = skill => skill === "augment" || skill === "routeAugment";
  const own = (object, key) => Object.hasOwn(object, key);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const pieces = slots => (slots || []).filter(Boolean);
  const pack = values => values.map(value => JSON.stringify(value)).sort();
  const unitKey = p => [p.id,p.star];

  function interestFloor(q,index) {
    const floor=q.rounds?.[index]?.interestFloor ?? q.interestFloor;
    return Number.isInteger(floor) ? floor : undefined;
  }

  function lineupIssue(q,index,frame) {
    const round=q.rounds?.[index];
    if (Number.isInteger(round?.maximumLevel) && frame.level>round.maximumLevel)
      return "目前 "+frame.level+" 等，這回合先留在 "+round.maximumLevel+" 等，下回合再補人口。";
    const minimum=round?.minimumFielded;
    if (!Number.isInteger(minimum)) return "";
    const count=pieces(frame.board).length;
    return count<minimum ? "目前上場 "+count+"/"+minimum+" 人，還要上 "+(minimum-count)+" 人。" : "";
  }

  function applyRoundFloors(q,policy) {
    for (const [index,round] of (q.rounds || []).entries()) {
      if (!Number.isInteger(round.interestFloor)) continue;
      const {byRound,...settings}=policy.byRound?.[index] || policy;
      (policy.byRound ||= {})[index]={...settings,economy:"floor"};
    }
    return policy;
  }

  function firstHoldPolicy(q) {
    const intent = q.gradingIntent?.firstRound;
    return {board:intent?.board ?? "count",bench:intent?.bench ?? "retained",economy:"floor"};
  }

  function requiresFirstBench(q) {
    return q.skill==="retention" && !(q.gradingIntent?.retentionGoal==="interest" &&
      q.gradingIntent.firstRound?.bench==="ignore");
  }

  function defaults(q) {
    const skill = q.skill || "route", intent = q.gradingIntent || {};
    const board = isAugment(skill) || skill === "route" ? "ignore" : "roster";
    const policy = {
      board:intent.positions || (q.study && skill !== "interest") ? "positions" : (intent.board || board),
      gear:q.study ? "exact" : (intent.gear || (isAugment(skill) ? "ignore" : "holders")),
      economy:Number.isInteger(q.interestFloor) ? "floor" : intent.economy || (q.study && skill === "interest" ? "gold" :
        q.keepInterest ? "floor" : skill === "interest" ? "interest" : "ignore"),
      bench:intent.bench || (skill === "interest" ? "roster" : "ignore"),
      decision:skillsWithChoice.has(skill) && !q.study ? "required" : "ignore",
      cores:[], traits:[]
    };
    if (skill === "retention") policy.byRound = {0:{...policy,...firstHoldPolicy(q)}};
    return applyRoundFloors(q,policy);
  }

  function traitKey(catalog,id) {
    if (typeof id !== "string") return undefined;
    if (own(catalog.traits || {},id)) return id;
    return Object.keys(catalog.traits || {}).find(name => catalog.traits[name].id === id);
  }

  function traitLevels(frame,catalog) {
    return engine().traitsForBoard(frame.board || [],catalog.units,catalog.traits)
      .map(({name,count,active}) => ({id:name,name,count,tier:active}));
  }

  function suggestTraits(q,frame,catalog,previousFrame) {
    const field = pieces(frame.board);
    const counts = new Map();
    for (const p of field) counts.set(p.id,(counts.get(p.id) || 0)+1);
    const cores = [...new Set(field.filter(p => p.star >= 2 || counts.get(p.id) > 1 ||
      p.items?.some(id => catalog.items[id]?.kind !== "component")).map(p => p.id))];
    const coreTraits = new Set(cores.flatMap(id => catalog.units[id]?.traits || []));
    const before = new Map(traitLevels(previousFrame || q.initial || {},catalog).map(t => [t.id,t.tier]));
    const traits = traitLevels(frame,catalog).filter(t => t.tier > 0 &&
      (t.tier > (before.get(t.id) || 0) || (t.tier > 1 && coreTraits.has(t.id))))
      .map(t => ({id:t.id,min:t.tier}));
    return {cores,traits};
  }

  function normalizedFields(q,input,base,catalog,index) {
    for (const key of Object.keys(input)) {
      if (!own(modes,key) && !["cores","traits","byRound"].includes(key)) throw Error("未知的評量設定。");
    }
    const policy = {};
    for (const [key,valid] of Object.entries(modes)) {
      const mode = own(input,key) ? input[key] : base[key];
      if (!valid.includes(mode)) throw Error("評量方式無效。");
      policy[key] = mode;
    }
    if (interestFloor(q,index)!==undefined) policy.economy = "floor";
    const cores = own(input,"cores") ? input.cores : base.cores;
    if (!Array.isArray(cores) || cores.length > 28 || new Set(cores).size !== cores.length ||
      cores.some(id => typeof id !== "string" || !own(catalog.units,id))) throw Error("必要棋子名單無效。");
    policy.cores = [...cores];
    const traits = own(input,"traits") ? input.traits : base.traits;
    if (!Array.isArray(traits) || traits.length > Object.keys(catalog.traits || {}).length) throw Error("必要羈絆無效。");
    policy.traits = traits.map(t => {
      const id = object(t) && traitKey(catalog,t.id);
      if (!id || !catalog.traits[id].breakpoints.includes(t.min)) throw Error("請選擇該羈絆實際可開啟的檔位。");
      return {id,min:t.min};
    });
    if (new Set(policy.traits.map(t => t.id)).size !== policy.traits.length) throw Error("必要羈絆不可重複。");
    if (policy.board === "traits" && !policy.traits.length) throw Error("至少選一個要開到的羈絆檔位。");
    const choice = skillsWithChoice.has(q.skill || "route") && !q.study;
    if (choice !== (policy.decision === "required")) throw Error(choice ? "這題必須核對選擇。" : "這題沒有可核對的選項。");
    if (Object.keys(modes).every(key => policy[key] === "ignore")) throw Error("請保留至少一個評量項目。");
    return policy;
  }

  function normalizePolicy(q,input,catalog) {
    if (input === undefined) input = {};
    if (!object(input)) throw Error("評量設定無效。");
    const policy = normalizedFields(q,input,defaults(q),catalog);
    const overrides = own(input,"byRound") ? input.byRound :
      (q.skill === "retention" ? {0:firstHoldPolicy(q)} : undefined);
    if (overrides !== undefined) {
      if (!object(overrides)) throw Error("每輪評量設定無效。");
      policy.byRound = {};
      const length = q.rounds?.length || 1;
      for (const [key,override] of Object.entries(overrides)) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length ||
          !object(override) || own(override,"byRound")) throw Error("每輪評量設定無效。");
        policy.byRound[key] = normalizedFields(q,override,policy,catalog,key);
      }
    }
    if (policy.bench==="retained" || Object.entries(policy.byRound || {}).some(([i,p]) =>
      p.bench==="retained" && (q.skill!=="retention" || i!=="0"))) throw Error("下一步上場的留牌只適用於留牌練習的第一步。");
    if (requiresFirstBench(q) && (policy.byRound?.[0] || policy).bench==="ignore")
      throw Error("第一步要核對本回合留下的棋子。");
    return applyRoundFloors(q,policy);
  }

  function countCopies(slots) {
    const counts=new Map();
    for (const p of pieces(slots)) counts.set(p.id,(counts.get(p.id) || 0)+3**(p.star-1));
    return counts;
  }

  const owned = frame => [...pieces(frame.board),...pieces(frame.bench)];
  function requiresPromotion(q) {
    return q.skill === "retention" && q.gradingIntent?.retentionGoal !== "interest";
  }
  function changedHold(q,frame) {
    const initial=countCopies(owned(q.initial));
    return [...countCopies(owned(frame))].some(([id,n])=>n>(initial.get(id) || 0));
  }

  function firstHoldIssue(q,frame) {
    if (!requiresPromotion(q)) return "";
    if (!q.gradingIntent?.firstRound?.requireFieldPair)
      return changedHold(q,frame) ? "" : "請先在第一間商店收下要留到下回合的牌。";

    const before=countCopies(owned(q.initial));
    const after=countCopies(owned(frame).filter(p=>p.star===1));
    const formed=pieces(frame.board).some(p=>p.star===1 &&
      (before.get(p.id) || 0)<2 && (after.get(p.id) || 0)>=2);
    return formed ? "" : "還沒留到場上棋子的對子。看看這間商店有哪些牌能和上場的一星棋湊對。";
  }

  // A reserve can fight immediately. Count physical copies across both zones
  // and cap the requirement at what the coach actually used next round.
  function retainedCopies(q,hold,lineup) {
    const onField=countCopies(q.initial.board), available=countCopies(owned(hold)), needed=new Map();
    const developed=new Set(pieces(q.initial.board).filter(p=>p.star>=2).map(p=>p.id));
    for(const [id,used] of countCopies(lineup?.board)) {
      const n=Math.min(used,available.get(id) || 0);
      if(n>(onField.get(id) || 0) || (n>=3 && developed.has(id))) needed.set(id,n);
    }
    return needed;
  }
  function missingCopies(wanted,played) {
    const available=countCopies(owned(played));
    return [...wanted].flatMap(([id,n])=>n>(available.get(id) || 0)?[[id,n-(available.get(id) || 0)]]:[]);
  }

  function validateReference(q,grading,frames,catalog) {
    const base = normalizePolicy(q,grading,catalog);
    for (const [i,frame] of frames.entries()) {
      const issue=lineupIssue(q,i,frame);
      if (issue) throw Error(issue);
    }
    if (q.skill === "retention" && frames.length!==2) throw Error("留牌練習需要兩步的定稿。");
    if (requiresPromotion(q)) {
      const [hold,lineup]=frames;
      const holdIssue=firstHoldIssue(q,hold);
      if (holdIssue) throw Error(holdIssue);
      const prior=owned(hold);
      const promoted=pieces(lineup.board).some(p => p.star>=2 && prior.some(b=>b.id===p.id && b.star<p.star) &&
        pieces(lineup.board).filter(end=>end.id===p.id && end.star>=p.star).length >
        prior.filter(start=>start.id===p.id && start.star>=p.star).length);
      if (!promoted) throw Error("請在第二步將上回合留下的棋子升星，並實際換上場。");
      if (!missingCopies(retainedCopies(q,hold,lineup),q.initial).length)
        throw Error("第二步的上場陣容需要用到第一步新留的棋子。");
    }
    for (let i=0; i<frames.length; i++) {
      const policy = base.byRound?.[i] || base;
      const floor=interestFloor(q,i);
      if (floor!==undefined && frames[i].gold < 10*floor) {
        throw Error("定稿目前 "+frames[i].gold+" 金，這回合要守住 "+(10*floor)+" 金。");
      }
      if (policy.board !== "traits") continue;
      const field = pieces(frames[i].board), active = traitLevels(frames[i],catalog);
      if (policy.cores.some(id => !field.some(p => p.id === id))) throw Error("這間商店的定稿盤缺少必要棋子。");
      if (policy.traits.some(t => !active.some(row => row.id === t.id && row.tier >= t.min))) {
        throw Error("這間商店的定稿盤尚未開到指定羈絆。");
      }
    }
    return true;
  }

  function boardMatches(mode,policy,saved,played,catalog) {
    if (mode === "positions") {
      return same(saved.board.map(p => p && unitKey(p)), played.board.map(p => p && unitKey(p)));
    }
    const reference = pieces(saved.board), field = pieces(played.board);
    if (mode === "roster") return same(pack(reference.map(unitKey)),pack(field.map(unitKey)));
    if (reference.length !== field.length) return false;
    if (mode === "count") return true;
    const levels = traitLevels(played,catalog);
    return policy.cores.every(id => {
      const required = reference.filter(p => p.id === id).map(p => p.star).sort((a,b) => b-a);
      const found = field.filter(p => p.id === id).map(p => p.star).sort((a,b) => b-a);
      return required.length > 0 && required.every((star,i) => found[i] >= star);
    }) && policy.traits.every(t => levels.some(row => row.id === t.id && row.tier >= t.min));
  }

  function gearKey(frame,policy,catalog,fieldOnly,interchangeable) {
    const filtered = items => (items || []).filter(id => policy.gear === "exact" || catalog.items[id]?.kind !== "component");
    function worn(slots,onBoard) {
      if (policy.gear === "items") return pieces(slots).flatMap(p => filtered(p.items)).sort();
      return pack((slots || []).flatMap((p,i) => {
        if (!p) return [];
        const personal=[],shared=[];
        for (const item of filtered(p.items)) {
          const holders = onBoard && policy.gear === "holders" && interchangeable?.[item];
          if (holders && holders.includes(p.id)) shared.push([holders[0],p.star,[item],null,holders]);
          else personal.push(item);
        }
        if (personal.length) shared.push([p.id,p.star,personal.sort(),onBoard && policy.board === "positions" ? i : null]);
        return shared;
      }));
    }
    const field = worn(frame.board,true);
    return fieldOnly && policy.gear !== "exact" ? [field] :
      [field,worn(frame.bench,false),filtered(frame.items).sort()];
  }

  function differences(expected,actual) {
    const remaining = new Map();
    for (const value of actual) remaining.set(value,(remaining.get(value) || 0)+1);
    return expected.filter(value => {
      if (!remaining.get(value)) return true;
      remaining.set(value,remaining.get(value)-1);
      return false;
    });
  }

  function gearDifference(q,policy,saved,played,catalog) {
    const fieldOnly = q.answerScope === "fieldRoster" && q.skill === "board";
    const shared=q.gradingIntent?.interchangeableHolders;
    const wanted = gearKey(saved,policy,catalog,fieldOnly,shared), got = gearKey(played,policy,catalog,fieldOnly,shared);
    for (let zone=0; zone<wanted.length; zone++) {
      if (same(wanted[zone],got[zone])) continue;
      if (zone === 0 && policy.board === "traits" && policy.gear === "holders") {
        // A stronger copy of the same carry may wear its signed build. Consume each actual wearer only once.
        const available = got[zone].map(s => JSON.parse(s)).sort((a,b) => a[1]-b[1]);
        const missing = wanted[zone].filter(signature => {
          const [id,minStar,items] = JSON.parse(signature);
          const index = available.findIndex(p => p[0] === id && p[1] >= minStar && same(p[2],items));
          if (index === -1) return true;
          available.splice(index,1);
          return false;
        });
        if (!missing.length && !available.length) continue;
        return {zone,missing,extra:available.map(row => JSON.stringify(row))};
      }
      return {zone,missing:differences(wanted[zone],got[zone]),extra:differences(got[zone],wanted[zone])};
    }
    return null;
  }

  function requiredReserves(frame,protectedIds = []) {
    const reserve = new Set(pack(pieces(frame.bench).map(unitKey))), copies = new Map();
    for (const p of [...pieces(frame.board),...pieces(frame.bench)]) {
      const key = JSON.stringify(unitKey(p));
      copies.set(key,(copies.get(key) || 0)+1);
    }
    return Array.from(reserve).filter(key => copies.get(key) >= 2 || protectedIds.includes(JSON.parse(key)[0]));
  }

  function benchMatches(q,mode,saved,played,protectedIds,next) {
    if (mode === "roster") return same(pack(pieces(saved.bench).map(unitKey)),pack(pieces(played.bench).map(unitKey)));
    if (mode === "retained")
      return !missingCopies(retainedCopies(q,saved,next),played).length;
    if (next && q.gradingIntent?.requireFutureHold && missingCopies(retainedCopies(q,saved,next),played).length) return false;
    const held = new Set(requiredReserves(played,protectedIds));
    return requiredReserves(saved,protectedIds).every(key => held.has(key));
  }

  // A unique carry that must stay on the signed final board cannot give its
  // finished items away after the only remover and every spare copy are gone.
  function blockedHandoff(q,played,lineup,policy,catalog) {
    const finalPolicy=policy.byRound?.[1] || policy;
    if (!["roster","positions"].includes(finalPolicy.board) ||
        !["holders","exact"].includes(finalPolicy.gear)) return null;
    const ownedNow=owned(played), nextShop=q.rounds?.[1]?.shop || [];
    return ownedNow.find(holder=>{
      const gear=holder.items.filter(item=>catalog.items[item]?.kind!=="component");
      if (!gear.length || nextShop.includes(holder.id) || ownedNow.some(p=>p!==holder && p.id===holder.id)) return false;
      const required=pieces(lineup.board).filter(p=>p.id===holder.id);
      return required.length && required.every(p=>differences(gear,p.items).length>0);
    });
  }

  function interestProfile(q,round,frame,catalog) {
    if (round?.type === "carousel") return [0];
    const interest = engine().interestForGold;
    const cap = q.settings?.interestCap ?? 5;
    const lose = interest(frame.gold,cap);
    if (round?.type === "pve") return [lose];
    const win = interest(frame.gold+1,cap), intent = q.gradingIntent || {};
    if (!intent.lossSale) return [lose,win];
    // Only one empty, one-star reserve can be sold after the fight. A sale cannot rescue the win path.
    const allowed = intent.saleOnly || intent.lossSale.ids, protectedIds = intent.saleProtect || intent.lossSale.protect;
    const eligible = pieces(frame.bench).filter(p => p.star === 1 && !p.items?.length &&
      (!allowed || allowed.includes(p.id)) && !protectedIds?.includes(p.id));
    const price = Math.max(0,...eligible.map(p => catalog.units[p.id]?.cost || 0));
    return [Math.min(win,interest(frame.gold+price,cap)),win];
  }

  function compare(q,frame,played,selected,answerRow,catalog,state,index) {
    const policy = normalizePolicy(q,answerRow.grading,catalog);
    const i = index ?? frame.resume?.roundIndex ?? state?.roundIndex ?? 0;
    const current = policy.byRound?.[i] || policy, checks = {}, skill = q.skill || "route";
    if (current.board !== "ignore") checks.board = boardMatches(current.board,current,frame,played,catalog);
    if (lineupIssue(q,i,played)) checks.board=false;
    if (current.gear !== "ignore") {
      checks.gear = !gearDifference(q,current,frame,played,catalog);
    }
    if (current.economy === "gold") checks.economy = frame.gold === played.gold;
    const floor=interestFloor(q,i);
    if (floor!==undefined) {
      checks.economy = played.gold >= 10*floor;
    } else if (current.economy === "interest" || current.economy === "floor") {
      const round = q.rounds?.[i] || q.round;
      const savedIncome = interestProfile(q,round,frame,catalog), playedIncome = interestProfile(q,round,played,catalog);
      checks.economy = current.economy === "floor" ? savedIncome.every((floor,j) => playedIncome[j] >= floor) : same(savedIncome,playedIncome);
    }
    if (current.bench !== "ignore") checks.bench = benchMatches(q,current.bench,frame,played,q.gradingIntent?.saleProtect,answerRow.frames?.[i+1]);
    if (i===0 && current.bench==="retained" && state?.removers===0 && answerRow.frames?.[1] &&
        blockedHandoff(q,played,answerRow.frames[1],policy,catalog)) checks.handoff=false;
    if (current.decision === "required") {
      checks[isAugment(skill) ? "augment" : "route"] = typeof answerRow.correct === "string" && selected === answerRow.correct;
    }
    return {...checks,passed:Object.values(checks).every(Boolean)};
  }

  function explain(q,frame,played,selected,answerRow,catalog,state,index) {
    const checks = compare(q,frame,played,selected,answerRow,catalog,state,index);
    if (checks.passed) return [];
    const base = normalizePolicy(q,answerRow.grading,catalog);
    const i = index ?? frame.resume?.roundIndex ?? state?.roundIndex ?? 0;
    const policy = base.byRound?.[i] || base, notes = [];
    const name = id => catalog.units[id]?.name || id;
    const piece = p => p ? p.star+" 星"+name(p.id) : "空格";

    const labels = slots => pieces(slots).map(piece);
    function nameDifferences(zone,expected,actual) {
      const missing = differences(expected,actual), extra = differences(actual,expected);
      listDifferences(zone,missing,extra);
    }
    function listDifferences(zone,missing,extra) {
      const parts = [];
      if (missing.length) parts.push("缺"+missing.slice(0,3).join("、"));
      if (extra.length) parts.push("多了"+extra.slice(0,3).join("、"));
      if (parts.length) notes.push(zone+parts.join("，")+"。");
    }

    if (checks.board === false) {
      const expected = pieces(frame.board), field = pieces(played.board);
      const issue=lineupIssue(q,i,played);
      if (issue) notes.push(issue);
      else if (expected.length !== field.length) notes.push("目前上陣 "+field.length+" 人，這組盤面需要 "+expected.length+" 人。");
      if (policy.board === "traits") {
        for (const id of policy.cores) {
          const required = expected.filter(p => p.id === id).map(p => p.star).sort((a,b) => b-a);
          const found = field.filter(p => p.id === id).map(p => p.star).sort((a,b) => b-a);
          const at = required.findIndex((star,j) => !(found[j] >= star));
          if (at >= 0) {
            const now = found[at] ? "，目前是 "+found[at]+" 星" : "，目前少一隻";
            notes.push("需要 "+required[at]+" 星"+name(id)+now+"。");
          }
        }
        const active = traitLevels(played,catalog);
        for (const t of policy.traits) {
          const current = active.find(row => row.id === t.id);
          if ((current?.tier || 0) < t.min) {
            const unit = catalog.traits[t.id]?.countBy === "fielded_stars" ? " 星" : " 人";
            notes.push(t.id+"目前 "+(current?.count || 0)+unit+"，需要開到 "+t.min+unit+"。");
          }
        }
      } else if (policy.board === "positions" && same(pack(expected.map(unitKey)),pack(field.map(unitKey)))) {
        const slot = frame.board.findIndex((p,j) => p && !same(unitKey(p),played.board[j] && unitKey(played.board[j])));
        if (slot >= 0) notes.push(piece(frame.board[slot])+"要站第 "+(1+Math.floor(slot/7))+" 排第 "+(1+slot%7)+" 格。");
      } else if (policy.board !== "count" && policy.board !== "ignore") nameDifferences("場上",labels(frame.board),labels(played.board));
    }

    if (checks.gear === false) {
      const {zone,missing,extra} = gearDifference(q,policy,frame,played,catalog);
      const location = ["場上","備戰區","裝備欄"][zone];
      if (policy.gear === "items" || zone === 2) listDifferences(location,missing,extra);
      else {
        const [id,star,items,slot,holders] = JSON.parse((missing.length ? missing : extra)[0]);
        const who = holders ? holders.map(name).join("或") : name(id);
        const where = slot === null ? location : "第 "+(1+Math.floor(slot/7))+" 排第 "+(1+slot%7)+" 格";
        notes.push(missing.length ? where+"的 "+star+" 星"+who+"需要帶"+items.join("、")+"。" :
          where+"的 "+star+" 星"+who+"額外帶了"+items.join("、")+"。");
      }
    }

    if (checks.economy === false) {
      const floor=interestFloor(q,i);
      if (floor!==undefined) {
        notes.push("目前 "+played.gold+" 金，距離 "+(floor*10)+" 金利息線還差 "+(floor*10-played.gold)+" 金。");
      } else if (policy.economy === "gold") notes.push("目前 "+played.gold+" 金，這組盤面需要 "+frame.gold+" 金。");
      else {
        const round = q.rounds?.[i] || q.round;
        const wanted = interestProfile(q,round,frame,catalog), got = interestProfile(q,round,played,catalog);
        const conditions = wanted.length === 1 ? ["本輪"] :
          [q.gradingIntent?.lossSale ? "敗場可賣一張備戰後" : "敗場","勝場"];
        const floor = policy.economy === "floor";
        wanted.forEach((target,j) => {
          if (floor ? got[j] < target : got[j] !== target) {
            notes.push(conditions[j]+"可吃 "+got[j]+" 金利息，這組需要"+(floor ? "至少" : "")+" "+target+" 金利息。");
          }
        });
      }
    }
    if (checks.bench === false) {
      if (policy.bench === "retained") {
        const missing=missingCopies(retainedCopies(q,frame,answerRow.frames?.[i+1]),played);
        const labels=missing.map(([id,n])=>name(id)+"還差 "+n+" 張");
        notes.push("場上和備戰合計，"+labels.join("、")+"。");
      } else if (policy.bench === "pairs") {
        const protectedIds = q.gradingIntent?.saleProtect;
        const pairs = new Set(requiredReserves(frame));
        const next = answerRow.frames?.[i+1];
        if (next && q.gradingIntent?.requireFutureHold) {
          for (const [id,n] of missingCopies(retainedCopies(q,frame,next),played)) {
            notes.push("下回合要上場的"+name(id)+"還差 "+n+" 張。");
          }
        }
        for (const key of differences(requiredReserves(frame,protectedIds),requiredReserves(played,protectedIds))) {
          const [id,star] = JSON.parse(key);
          notes.push("要留"+piece({id,star})+(pairs.has(key) ? "對子，至少一張在備戰區。" : "在備戰區。"));
        }
      } else nameDifferences("備戰區",labels(frame.bench),labels(played.bench));
    }
    if (checks.handoff===false) {
      const holder=blockedHandoff(q,played,answerRow.frames[1],base,catalog);
      notes.push(name(holder.id)+"還要上場。保留拆卸器給他，或先留一張能替換他的同名棋。");
    }
    if (checks.augment === false || checks.route === false) {
      const augment = checks.augment === false;
      const table = augment ? Object.values(catalog.augments || {}) : catalog.routes || [];
      const target = table.find(row => row.id === answerRow.correct)?.name;
      notes.push(target ? "這組盤面選的是「"+target+"」。" : "這組盤面的"+(augment ? "增幅" : "陣容方向")+"不同。");
    }
    return notes;
  }

  return {defaults,normalizePolicy,requiresFirstBench,requiresPromotion,changedHold,firstHoldIssue,validateReference,traitLevels,suggestTraits,interestFloor,lineupIssue,compare,explain};
});

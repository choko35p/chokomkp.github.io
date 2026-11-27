/* The coach's saved position is the answer. This module accepts no learner rules or witnesses. */
(function (root, factory) {
  const history = typeof module === "object" && module.exports ?
    require("./editor/coach-opening-history.json") : root.FocusCoachOpeningHistory || [];
  const grading = typeof module === "object" && module.exports ? require("./coach-grading.js") : root.FocusCoachGrading;
  const engine = typeof module === "object" && module.exports ? require("./focus-engine.js") : root.FocusEngine;
  const api = factory(history,grading,engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FocusCoachStore = api;
})(globalThis, function (publishedOpenings,grading,engine) {
  "use strict";
  const storageKey = "s19-focus.coach.route.v1";
  const format = "s19-coach-answers";
  const storageVersion = 1;
  // Older editors reject this format instead of importing just the primary
  // position and silently dropping its grading rules and other solutions.
  const exportVersion = 2;
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  const pick = (row, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(row, k)).map(k => [k, row[k]]));
  const skillOf = q => q.skill || "route";
  const isAugment = q => ["augment","routeAugment"].includes(skillOf(q));
  // The primary keeps its original v1 shape. Each alternative is a complete
  // solution to the same deal, including all shops of a multi-round exercise.
  function solutionRows(row) {
    if (!row) return [];
    const {alternatives, ...primary} = row;
    return [primary,...(alternatives || [])];
  }
  const needsReview = row => solutionRows(row).some(solution => solution.needsOptionsReview);
  // The same cards and resources were reworded in these exact published deals.
  // Keep the saved coach decision and draft attached to their original deal.
  const sameDealNotes = {
    "interest-10": ["1ui80sa","175xwne"], "interest-15": ["1n1brpo","10swxbt"],
    "interest-17": ["6f1tp8","spr0ti"], "interest-19": ["vo3ky8","10xzoe1"],
    "interest-16": ["yplnmq","1858xnk"], "board-09": ["atpdiq","1snucks"],
    "board-11": ["h5dh7x","1f0cqlh"], "board-19": ["190s6p1","1cq9ze4"],
    "retention-03": ["1n4wslf","5v64b2"], "retention-04": ["s746xc","iug74l"],
    "retention-12": ["fbyx7o","hoykma"], "retention-14": ["st4if7","1v2t6lb"],
    "retention-17": ["1x3ac18","1ioxl8"], "retention-24": ["k7ecmt","15hhm64"]
  };
  function publicOpening(q) {
    if (skillOf(q) !== "route") {
      const opening = pick(q, ["id","skill","tier","initial","round","rounds","scoutBoards","targetCarry",
        "seed","opponentCue","opponentCueKind","settings","facts","study","answerScope","keepInterest","interestFloor"]);
      if (q.gradingIntent && (Number.isInteger(q.interestFloor) || q.gradingIntent.bench || q.gradingIntent.firstRound)) opening.gradingIntent = copy(q.gradingIntent);
      return opening;
    }
    return {id:q.id, tier:q.tier,
      ...pick(q, ["facts"]),
      initial:pick(q.initial, ["board","bench","items","level","xp","gold","hp","streak","augments","unlocked","plan"]),
      round:pick(q.round, ["id","type","shopActive","shop","facts"]),
      scoutBoards:(q.scoutBoards || []).map(seat => pick(seat, ["name","level","units","bench","augments","unlocks"]))};
  }
  // These two lessons changed places in the syllabus. Keep their original
  // signature when the cards, money and observations on which the coach acted agree.
  function tierForSignature(q) {
    if (q.id === "interest-09" && q.tier === "challenge") return "advanced";
    if (q.id === "interest-11" && q.tier === "advanced") return "challenge";
    return q.tier;
  }
  function openingKey(q) {
    const data = skillOf(q) === "route"
      ? [q.id, q.initial, q.round.id, q.round.shop, q.round.shopActive, q.scoutBoards || []]
      : publicOpening(q);
    if (Array.isArray(data) && (q.facts || q.round.facts)) data.push([q.facts || "",q.round.facts || ""]);
    // Revising the historical comparison does not change what was available
    // when the coach made their own decision.
    if (!Array.isArray(data)) {
      delete data.study;
      data.tier=tierForSignature(q);
      // Enabling first-shop swaps adds valid plays to the same deal. The
      // original answer and any explicit grading settings still apply.
      if(q.skill==="retention" && same(data.rounds?.[0]?.allowed,["buy","sell","move"])) {
        const [first,...rest]=data.rounds;
        data.rounds=[{...first,allowed:["buy","sell"]},...rest];
      }
    }
    const text = JSON.stringify(data, (key, value) => {
      if (q.skill==="retention" && key==="goal") return undefined;
      return object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value;
    });
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    const key = (hash >>> 0).toString(36);
    const pair = sameDealNotes[q.id];
    return pair && key === pair[0] ? pair[1] : key;
  }

  // This edition was already available for coaches to sign. Earlier builds
  // kept its opening fingerprint and the authored answer, but not the deal.
  const oldPiece = (name, cell) => ({id:"TFT19_"+name, star:1, items:[], ...(cell === undefined ? {} : {cell})});
  const earlierOpenings = [
    ["interest-01",9,["Katarina"]], ["interest-02",8,["Gragas","Kayn"]], ["interest-03",10,["Sett","Kayn"]]
  ].map(([id,gold,bench]) => ({
    id, skill:"interest", tier:"basic",
    initial:{board:[oldPiece("Elise",2),oldPiece("Sett",4),oldPiece("Varus",24)],
      bench:bench.map(name => oldPiece(name)), level:3, gold, hp:94, streak:-1},
    round:{id:"2-2", type:"pvp", shopActive:false, shop:Array(5).fill(null)}, scoutBoards:[]
  }));

  function create(catalog, questions, storage, keyForStore = storageKey) {
    const bank = new Map(questions.map(q => [q.id, {q, key:openingKey(q)}]));
    const previousDeals = new Map();
    const firstPublishedKey = new Map();
    for (const q of [...earlierOpenings, ...publishedOpenings]) {
      if (!bank.has(q.id)) continue;
      const key = openingKey(q);
      previousDeals.set(q.id+"@"+key, {q,key});
      if (!firstPublishedKey.has(q.id)) firstPublishedKey.set(q.id,key);
    }
    function atEdition(doc, section, id, key = bank.get(id).key) {
      const rows = doc[section];
      return rows[id+"@"+key] || (rows[id]?.openingKey === key ? rows[id] : null);
    }
    function putEdition(doc, section, id, key, row) {
      // Older open tabs only know the bare ID. Leave their records intact
      // and give the revised deal its own slot, including on a fresh device.
      const oldKey = firstPublishedKey.get(id);
      const separate = (oldKey && oldKey !== key) ||
        [doc.answers[id], doc.drafts[id]].some(r => r && r.openingKey !== key);
      const slot = separate || doc[section][id+"@"+key] ? id+"@"+key : id;
      if (slot !== id && doc[section][id]?.openingKey === key) delete doc[section][id];
      if (row) doc[section][slot] = row;
      else delete doc[section][slot];
    }
    const routes = new Map(catalog.routes.map(route => [route.id, route]));
    function aliasesFor(table) {
      const result = new Map();
      for (const row of table.values()) {
        for (const alias of row.aliases || []) {
          // Exact published IDs take precedence. A conflicting declaration has
          // no single successor. Matching display names never establishes an ID.
          if (typeof alias !== "string" || !alias || table.has(alias)) continue;
          if (!result.has(alias)) result.set(alias,row.id);
          else if (result.get(alias) !== row.id) result.set(alias,null);
        }
      }
      return result;
    }
    let aliases = aliasesFor(routes);
    const resolveRoute = id => aliases.get(id) || id;
    function remapChoices(row, field) {
      if (!Array.isArray(row?.options)) return false;
      const mapped = row.options.map(resolveRoute), correct = resolveRoute(row[field]);
      if (correct === row[field] && mapped.every((id,i) => id === row.options[i])) return false;
      row.options = [...new Set(mapped)];
      row[field] = correct;
      return true;
    }
    function migrateAliases(doc) {
      if (!aliases.size) return false;
      let changed = false;
      for (const [id,{q}] of bank) {
        if (skillOf(q) !== "route") continue;
        const approved = atEdition(doc,"answers",id);
        const draft = atEdition(doc,"drafts",id);
        for (const row of [approved,...(approved?.alternatives || []), draft]) {
          if (!row) continue;
          if (remapChoices(row,"correct")) {
            changed = true;
            // A previously saved trio could contain both names for one route.
            // Keep the authored board and correct route while the coach
            // chooses the missing third option. Never invent a replacement.
            if (row !== draft && row.options.length < 3) row.needsOptionsReview = true;
          }
          for (const step of row.game?.undo || []) {
            if (remapChoices(step?.choice,"answer")) changed = true;
          }
        }
      }
      return changed;
    }
    const patch = String(catalog.patch?.patch || catalog.patch || "");
    const blank = () => ({version:storageVersion, drafts:{}, answers:{}, routeArchive:{}});
    let data = blank();
    let lastRead;
    let persistent = false;
    let storageMessage = "";
    try {
      if (storage === undefined) storage = globalThis.localStorage;
      check(storage && typeof storage.getItem === "function", "無法開啟瀏覽器儲存。");
      persistent = true;
    } catch {
      storageMessage = "瀏覽器未開放儲存。離開前請匯出已定稿答案。";
    }

    function refresh() {
      if (!persistent) return;
      try {
        const raw = storage.getItem(keyForStore);
        if (raw === lastRead) return;
        const parsed = raw === null ? blank() : JSON.parse(raw);
        check(parsed?.version === storageVersion && object(parsed.answers) && object(parsed.drafts), "存檔格式異常。");
        data = parsed;
        lastRead = raw;
        if (migrateAliases(parsed)) {
          const serialized = JSON.stringify(parsed);
          storage.setItem(keyForStore,serialized);
          lastRead = serialized;
        }
      } catch {
        // Leave unreadable bytes intact. New work can still be exported from memory.
        persistent = false;
        storageMessage = "無法讀取本機存檔。這次修改會暫存，離開前請匯出已定稿答案。";
      }
    }
    refresh();

    function write(change) {
      refresh();
      const next = {version:storageVersion, drafts:{...data.drafts}, answers:{...data.answers}, routeArchive:{...data.routeArchive}};
      change(next);
      if (persistent) {
        try {
          const serialized = JSON.stringify(next);
          storage.setItem(keyForStore, serialized);
          lastRead = serialized;
        }
        catch {
          persistent = false;
          storageMessage = "本機儲存失敗。這次修改會暫存，離開前請匯出已定稿答案。";
        }
      }
      data = next;
    }
    function lesson(id) {
      const row = bank.get(id);
      check(row, "找不到這個題號：" + String(id));
      return row;
    }
    function retiredRoutes() {
      refresh();
      const ids = new Set();
      for (const [questionId,{q}] of bank) {
        if (skillOf(q) !== "route") continue;
        for (const saved of [...solutionRows(atEdition(data,"answers",questionId)), atEdition(data,"drafts",questionId)]) {
          for (const id of saved?.options || []) ids.add(id);
        }
      }
      return Array.from(ids).filter(id => !routes.has(id)).map(id => {
        const prior = data.routeArchive?.[id];
        return {id, name:prior?.name || id, tier:"已下架", group:"舊題選項", carryIds:[]};
      });
    }
    function rememberRoutes(next, q, options, importedRoutes) {
      if (skillOf(q) !== "route") return;
      for (const id of options) {
        const row = routes.get(id) || importedRoutes?.get(id) || next.routeArchive[id];
        if (row) next.routeArchive[id] = {id, name:row.name || id, tier:row.tier || ""};
      }
    }
    function updateRoutes(nextRoutes) {
      const fresh = new Map(nextRoutes.map(r => [r.id,r]));
      check(fresh.size >= 3 && fresh.size === nextRoutes.length, "T 度表的選項不足或重複。");
      write(next => {
        for (const [id, {q}] of bank) {
          for (const row of [...solutionRows(atEdition(next,"answers",id)), atEdition(next,"drafts",id)]) if (row) rememberRoutes(next, q, row.options);
        }
      });
      routes.clear();
      for (const [id, row] of fresh) routes.set(id,row);
      aliases = aliasesFor(routes);
      if (aliases.size) write(next => {migrateAliases(next);});
    }
    function choices(q, options = [], correct, final, retired) {
      if (skillOf(q) !== "route" && !isAugment(q)) {
        check(Array.isArray(options) && options.length === 0 && correct == null, "盤面題沒有選擇卡。");
        return {options:[], correct:null};
      }
      if (skillOf(q) === "route" && Array.isArray(options)) {
        options = options.map(resolveRoute);
        correct = resolveRoute(correct);
      }
      const legal = id => {
        if (skillOf(q) === "route") return routes.has(id) || retired?.has(id) ||
          Boolean(atEdition(data,"answers",q.id)?.options?.includes(id) || atEdition(data,"drafts",q.id)?.options?.includes(id));
        const aug = catalog.augments?.[id];
        const offeredTier = catalog.augments?.[q.round.augments?.[0]?.id]?.tier;
        return aug && aug.stages.includes(q.round.id) && aug.tier === offeredTier &&
          !q.initial.augments?.includes(id);
      };
      check(Array.isArray(options) && options.length <= 3 && (!final || options.length === 3),
        "請挑選三個選項。");
      check(new Set(options).size === options.length && options.every(id => typeof id === "string" && legal(id)),
        "選項重複或不適用這一回合。");
      check((correct == null && !final) || options.includes(correct), "請從本題選項指定一個正解。");
      return {options:[...options], correct:correct ?? null};
    }
    function knownItem(id) { return typeof id === "string" && Object.hasOwn(catalog.items, id); }
    function knownUnit(id) { return typeof id === "string" && Object.hasOwn(catalog.units, id); }
    function itemList(items, max) {
      check(Array.isArray(items) && items.length <= max && items.every(knownItem), "裝備欄含有無效的道具。");
      return [...items];
    }
    function cells(slots, length) {
      check(Array.isArray(slots) && slots.length === length, "棋盤或備戰席格數不符。");
      return Array.from(slots, p => {
        if (p === null) return null;
        check(object(p) && knownUnit(p.id) && integer(p.star, 1, 4), "棋子或星級無效。");
        return {id:p.id, star:p.star, items:itemList(p.items, 3)};
      });
    }
    function captures(state) {
      check(object(state), "缺少目前盤面。");
      const board = cells(state.board, 28), bench = cells(state.bench, 9);
      check(integer(state.gold, 0, 9999) && integer(state.level, 1, 10) && integer(state.xp, 0, 999),
        "金幣、等級或經驗值無效。");
      check(board.filter(Boolean).length <= state.level, "上場人數超過目前人口。");
      check(Array.isArray(state.shop) && state.shop.length === 5 &&
        state.shop.every(id => id === null || knownUnit(id)), "商店內含有無效棋子。");
      return {board, bench, items:itemList(state.items, 100), gold:state.gold, level:state.level, xp:state.xp,
        shop:[...state.shop]};
    }
    function captureRemovers(q, state) {
      const limit=engine.removerAllowance(q);
      // Ordinary signed answers exported before the tool was introduced omit this field.
      if (state.removers === undefined && !(q.study && limit)) return {};
      check(integer(state.removers,0,limit), "拆卸器數量與起手不符。");
      return {removers:state.removers};
    }
    function roundFrame(state, index, q) {
      const source = state.resume || state;
      check(source.roundIndex === undefined || source.roundIndex === index, "自然商店的定稿順序不符。");
      const resume = {roundIndex:index};
      for (const [field,min,max] of [["hp",0,200],["streak",-100,100],["refreshIndex",0,9999],["freeRerolls",0,9999]]) {
        if (source[field] === undefined) continue;
        check(integer(source[field],min,max), "自然商店的回合資料無效。");
        resume[field] = source[field];
      }
      for (const field of ["locked","freeRoundRefresh"]) {
        if (source[field] === undefined) continue;
        check(typeof source[field] === "boolean", "自然商店的商店狀態無效。");
        resume[field] = source[field];
      }
      if (source.augments !== undefined) {
        check(Array.isArray(source.augments) && source.augments.every(id => Object.hasOwn(catalog.augments,id)),
          "自然商店的增幅記錄無效。");
        resume.augments = [...source.augments];
      }
      return {...captures(state), ...captureRemovers(q,state), resume};
    }
    function record(id, inputs, at, retired, {q, key} = lesson(id)) {
      const snapshot = {...captures(inputs.state),...captureRemovers(q,inputs.state)};
      let options = inputs.options;
      let repair = false;
      if (retired && skillOf(q) === "route" && Array.isArray(options) && options.length === 3 &&
          new Set(options).size === 3 && options.includes(inputs.correct)) {
        const unique = [...new Set(options.map(resolveRoute))];
        if (unique.length < 3) { options = unique; repair = true; }
      }
      if (retired && inputs.needsOptionsReview === true && skillOf(q) === "route" &&
          Array.isArray(options) && options.length > 0 && options.length < 3 &&
          options.includes(inputs.correct)) repair = true;
      const row = {id, round:q.round.id, openingKey:key, ...choices(q, options, inputs.correct, !repair, retired),
        ...snapshot, savedAt:at};
      if (repair) row.needsOptionsReview = true;
      if (skillOf(q) !== "route") row.skill = q.skill;
      if (q.rounds?.length > 1) {
        check(Array.isArray(inputs.frames) && inputs.frames.length === q.rounds.length, "請先記錄每間商店的盤面。");
        row.frames = inputs.frames.map((state,index)=>roundFrame(state,index,q));
        const allowance=engine.removerAllowance(q);
        let remaining=allowance;
        for (const frame of row.frames) {
          const count=frame.removers ?? allowance;
          check(count<=remaining,"跨回合的拆卸器數量不能增加。");
          remaining=count;
        }
        const last=row.frames.at(-1);
        check(same(captures(last),captures(snapshot)) && remaining===(snapshot.removers ?? allowance),
          "最後一間商店的盤面與定稿不一致。");
      }
      if (inputs.grading !== undefined) {
        row.grading = grading.normalizePolicy(q,inputs.grading,catalog);
      }
      if (row.grading || Number.isInteger(q.interestFloor) || skillOf(q)==="retention")
        grading.validateReference(q,row.grading,row.frames || [row],catalog);
      return row;
    }
    function draftRecord(id, inputs) {
      check(object(inputs.game), "缺少可還原的操作記錄。");
      const {q, key} = lesson(id);
      return {openingKey:key, game:copy(inputs.game), ...choices(q, inputs.options, inputs.correct, false)};
    }
    function current(section, id) {
      const {key} = lesson(id);
      refresh();
      const value = atEdition(data,section,id,key);
      return value ? copy(value) : null;
    }
    function draft(id) { return current("drafts", id); }
    function answer(id) { return current("answers", id); }
    function solutions(id) { return solutionRows(answer(id)); }
    function savedIds() {
      refresh();
      return Array.from(bank.keys()).filter(id => {
        const row = atEdition(data,"answers",id);
        return row && !needsReview(row);
      });
    }
    function previousEditions(id) {
      const {key} = lesson(id);
      refresh();
      const keys = new Set();
      for (const section of [data.answers, data.drafts]) {
        for (const [slot,row] of Object.entries(section)) {
          if ((slot === id || slot.startsWith(id+"@")) && row?.openingKey && row.openingKey !== key) keys.add(row.openingKey);
        }
      }
      return Array.from(keys, old => copy({id, openingKey:old, opening:previousDeals.get(id+"@"+old)?.q || null,
        answer:atEdition(data,"answers",id,old), draft:atEdition(data,"drafts",id,old)}));
    }
    function putDraft(id, inputs) {
      const fresh = draftRecord(id, inputs);
      write(next => {
        putEdition(next,"drafts",id,fresh.openingKey,fresh);
        rememberRoutes(next, lesson(id).q, fresh.options);
      });
    }
    function clearDraft(id) {
      const {key} = lesson(id);
      write(next => { putEdition(next,"drafts",id,key,null); });
    }
    function assertGuard(current,guard) {
      if (guard !== undefined) check(same(guard,current || null),
        "這套正解已在其他分頁更新或移除。請重新打開題目，確認要修改的那一套。");
    }
    function writeSolution(id, inputs, index, append, guard) {
      let saved;
      write(next => {
        const {key,q} = lesson(id);
        const old = solutionRows(atEdition(next,"answers",id,key));
        if (append) check(old.length > 0,"請先儲存第一套正解。");
        const target = append ? old.length : index;
        check(integer(target,0,Math.max(old.length-1,0)) || append,"這套正解已不存在，請重新選擇。");
        if (!append) assertGuard(old[target],guard);
        saved = record(id,{...inputs,grading:inputs.grading ?? old[target]?.grading},new Date().toISOString());
        const draft = inputs.game ? draftRecord(id, inputs) : null;
        if (draft && (target>0 || Object.hasOwn(draft.game,"solutionIndex"))) draft.game.solutionIndex = target;
        if (target > 0) {
          check(!needsReview(old[0]),"請先補齊第一套正解的三個選項。");
          check(saved.options.length === old[0].options.length && saved.options.every(id => old[0].options.includes(id)),
            "同一道題的各套正解須使用相同的三個選項。");
          saved.options = [...old[0].options];
        }
        old[target] = saved;
        const primary = old[0];
        const others = old.slice(1).map((row,i) => {
          check(row.correct == null || primary.options.includes(row.correct),
            "第 "+(i+2)+" 套正解仍使用「"+(routes.get(row.correct)?.name || catalog.augments?.[row.correct]?.name || row.correct)+"」，請保留該選項或先修改這套正解。");
          const fresh = {...row,options:[...primary.options]};
          delete fresh.needsOptionsReview;
          return fresh;
        });
        putEdition(next,"answers",id,saved.openingKey,others.length ? {...primary,alternatives:others} : primary);
        rememberRoutes(next, q, saved.options);
        putEdition(next,"drafts",id,saved.openingKey,draft);
      });
      return copy(saved);
    }
    function saveAnswer(id, inputs, solutionIndex = 0, guard) { return writeSolution(id,inputs,solutionIndex,false,guard); }
    function addSolution(id, inputs) { return writeSolution(id,inputs,0,true); }
    function removeSolution(id,index,guard) {
      const {key} = lesson(id);
      write(next => {
        const rows = solutionRows(atEdition(next,"answers",id,key));
        check(index !== 0,"第一套正解可以更新，不能移除。");
        check(integer(index,1,rows.length-1),"這套替代正解已不存在，請重新選擇。");
        assertGuard(rows[index],guard);
        rows.splice(index,1);
        const [primary,...others] = rows;
        putEdition(next,"answers",id,key,others.length ? {...primary,alternatives:others} : primary);
        const draft = atEdition(next,"drafts",id,key);
        const draftIndex = draft?.game?.solutionIndex;
        if (draftIndex === index) putEdition(next,"drafts",id,key,null);
        else if (Number.isInteger(draftIndex) && draftIndex>index) {
          putEdition(next,"drafts",id,key,{...draft,game:{...draft.game,solutionIndex:draftIndex-1}});
        }
      });
    }
    function restoreState(id, nativeOpening, index = 0, solutionIndex = 0) {
      const saved = solutions(id)[solutionIndex];
      if (!saved) return null;
      const frame = saved.frames?.[index] || saved;
      const state=Object.assign(copy(nativeOpening),frame.resume || {},captures(frame));
      if (frame.removers!==undefined || nativeOpening.removers!==undefined)
        state.removers=frame.removers ?? engine.removerAllowance(lesson(id).q);
      return state;
    }
    function matchAttempt(id, state, selected, index = 0, priorFrames = []) {
      const row = answer(id);
      check(row, "這一題還沒有教練答案。");
      check(!needsReview(row), "兩個舊選項已合為一套，請補選第三個陣容後重新定稿。");
      const q = lesson(id).q, candidates = solutionRows(row);
      check(integer(index,0,(q.rounds?.length || 1)-1), "找不到這一間商店的教練答案。");
      if (!Array.isArray(priorFrames) || (priorFrames.length !== index && (q.skill==="retention" || candidates.length > 1 || priorFrames.length))) {
        return {checks:{sequence:false,passed:false}};
      }
      const choice = skillOf(q) === "route" ? resolveRoute(selected) : selected;
      const played = captures(state), earlier = priorFrames.map(captures);
      const matches = candidates.filter(solution => earlier.every((position,i) =>
        grading.compare(q,solution.frames[i],position,choice,solution,catalog,priorFrames[i],i).passed));
      if (!matches.length) return {checks:{sequence:false,passed:false}};
      let closest, fewestMisses = Infinity;
      for (const solution of matches) {
        const frame = solution.frames?.[index] || solution;
        const checks = grading.compare(q,frame,played,choice,solution,catalog,state,index);
        if (checks.passed) return {checks};
        const misses = Object.values(checks).filter(check => check === false).length;
        if (misses < fewestMisses) {
          fewestMisses = misses;
          closest = {checks, explain:() => grading.explain(q,frame,played,choice,solution,catalog,state,index)};
        }
      }
      return closest;
    }
    function compare(...args) { return matchAttempt(...args).checks; }
    function explain(...args) { return matchAttempt(...args).explain?.() || []; }
    function makeExport(answers, deals) {
      const openings = deals.map(q => copy(publicOpening(q)));
      const allSolutions = answers.flatMap(solutionRows);
      const routeIds = new Set(allSolutions.filter(a => skillOf(lesson(a.id).q) === "route").flatMap(a => a.options));
      const unitIds = new Set(allSolutions.flatMap(a => (a.frames || [a]).flatMap(s =>
        [...s.board, ...s.bench].filter(Boolean).map(p => p.id).concat(s.shop.filter(Boolean)))));
      for (const q of openings) {
        const all = [...q.initial.board, ...(q.initial.bench || []), ...(q.rounds || [q.round]).flatMap(r => r.shop),
          ...(q.scoutBoards || []).flatMap(seat => [...seat.units, ...(seat.bench || [])])];
        for (const p of all) if (p) unitIds.add(typeof p === "string" ? p : p.id);
      }
      const tierSnapshot = pick(catalog.coachTierSnapshot || {}, ["sourceUrl","sourceLabel","asOf","set","patch"]);
      return {format, version:exportVersion, patch, asOf:catalog.asOf || "", exportedAt:new Date().toISOString(),
        tierSnapshot:copy(tierSnapshot), openings,
        routes:Array.from(routeIds, id => { const r = routes.get(id) || data.routeArchive?.[id]; return {id, name:r?.name || id, tier:r?.tier || ""}; }),
        unitNames:Object.fromEntries(Array.from(unitIds, id => [id, catalog.units[id].name])), answers};
    }
    function exportAnswers() {
      const ids = savedIds();
      return makeExport(ids.map(id => copy(atEdition(data,"answers",id))), ids.map(id => lesson(id).q));
    }
    function exportPreviousAnswer(id, key) {
      const row = previousEditions(id).find(version => version.openingKey === key);
      check(row?.answer && row.opening, "找不到這份舊版定稿的起手。");
      return makeExport([row.answer],[row.opening]);
    }
    function readImport(file) {
      let input = file;
      if (typeof file === "string") {
        try { input = JSON.parse(file.replace(/^\uFEFF/, "")); } catch { throw new Error("無法讀取 JSON 答案檔。"); }
      }
      check(input?.format === format && [1,exportVersion].includes(input.version), "請選擇此預覽版支援的教練答案 JSON。");
      check(input.patch === patch, "答案檔與目前的賽季版本不同。");
      check(Array.isArray(input.answers) && input.answers.length > 0 && input.answers.length <= bank.size,
        "答案檔內沒有可匯入的題目，或題數超出範圍。");
      const importedRoutes = new Map();
      for (const r of input.routes || []) {
        check(typeof r?.id === "string" && r.id.trim() && !["__proto__","prototype","constructor"].includes(r.id) && typeof r.name === "string" &&
          !importedRoutes.has(r.id), "陣容名稱資料無效。");
        importedRoutes.set(r.id, {id:r.id,name:r.name,tier:typeof r.tier === "string" ? r.tier : ""});
      }
      const ids = new Set();
      const rows = input.answers.map(row => {
        check(object(row), "答案資料不完整。");
        const current = lesson(row.id);
        const edition = row.openingKey === current.key ? current : previousDeals.get(row.id+"@"+row.openingKey);
        check(!ids.has(row.id), "答案檔內題號重複：" + row.id);
        ids.add(row.id);
        check(edition && row.round === edition.q.round.id, row.id + " 的起手版本不同。");
        function readSolution(solution) {
          check(object(solution) && solution.id === row.id && solution.round === row.round &&
            solution.openingKey === row.openingKey, "每一套正解必須來自同一道題和同一副起手。");
          check(typeof solution.savedAt === "string" && Number.isFinite(Date.parse(solution.savedAt)), "定稿時間無效。");
          if (solution.skill !== undefined) check(solution.skill === skillOf(edition.q), "定稿課題不符。");
          return record(row.id, {state:solution, options:solution.options, correct:solution.correct, frames:solution.frames,
            grading:solution.grading,needsOptionsReview:solution.needsOptionsReview},
            solution.savedAt, importedRoutes, edition);
        }
        const primary = readSolution(row);
        if (row.alternatives !== undefined) {
          check(Array.isArray(row.alternatives), "替代正解格式不符。");
          const others = row.alternatives.map(solution => {
            check(object(solution) && !Object.hasOwn(solution,"alternatives"), "替代正解不可內嵌其他解答。");
            const restored = readSolution(solution);
            check(restored.options.length === primary.options.length &&
              restored.options.every(id => primary.options.includes(id)), "各套正解的題目選項不一致。");
            restored.options = [...primary.options];
            return restored;
          });
          if (others.length) primary.alternatives = others;
        }
        return primary;
      });
      if (input.openings !== undefined) {
        check(Array.isArray(input.openings) && input.openings.length === rows.length, "起手情境和定稿題數不符。");
        const remaining = new Set(ids);
        for (const q of input.openings) {
          check(object(q) && remaining.delete(q.id) && object(q.initial) && object(q.round) && Array.isArray(q.scoutBoards),
            "答案檔中的起手情境缺漏或重複。");
          const row = rows.find(answer => answer.id === q.id);
          const issued = row.openingKey === lesson(q.id).key ? lesson(q.id) : previousDeals.get(q.id+"@"+row.openingKey);
          check(tierForSignature(q) === tierForSignature(issued.q) && openingKey(q) === row.openingKey,
            q.id + " 的起手版本不同。");
        }
      }
      return {rows, importedRoutes};
    }
    function inspectImport(file) {
      const {rows} = readImport(file);
      refresh();
      return {count:rows.length, previousCount:rows.filter(r => lesson(r.id).key !== r.openingKey).length,
        overwriteIds:rows.filter(r => atEdition(data,"answers",r.id,r.openingKey)).map(r => r.id),
        draftIds:rows.filter(r => atEdition(data,"drafts",r.id,r.openingKey)).map(r => r.id)};
    }
    function importAnswers(file) {
      const {rows, importedRoutes} = readImport(file);
      write(next => {
        for (const row of rows) {
          putEdition(next,"answers",row.id,row.openingKey,row);
          rememberRoutes(next, lesson(row.id).q, row.options, importedRoutes);
          putEdition(next,"drafts",row.id,row.openingKey,null);
        }
      });
      return rows.length;
    }
    return {draft, putDraft, clearDraft, answer, solutions, savedIds, saveAnswer, addSolution, removeSolution, restoreState, compare, explain, exportAnswers, inspectImport, importAnswers,
      retiredRoutes, updateRoutes, resolveRoute, previousEditions, exportPreviousAnswer,
      get persistent() { return persistent; }, get storageMessage() { return storageMessage; }};
  }
  return {storageKey, openingKey, create};
});

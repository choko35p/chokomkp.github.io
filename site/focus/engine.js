/* Continuous teaching rounds. Shops and combat conditions are supplied by each lesson. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SimEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const clone = value => JSON.parse(JSON.stringify(value));
  const defaultXp = [0, 2, 2, 6, 10, 20, 36, 48, 76, 84];
  // The site's S19 trial rules.json provides XP, level odds, pool sizes and streak tiers.
  // Its PvE base income is customized. Normal training rounds supply their own PvP income.
  const defaultStreak = [[2, 1], [4, 2], [5, 3]];
  const defaultOdds = [[],[100,0,0,0,0],[100,0,0,0,0],[75,25,0,0,0],[55,30,15,0,0],
    [45,33,20,2,0],[30,40,25,5,0],[19,30,40,10,1],[17,24,32,24,3],[15,18,25,30,12],[5,10,20,40,25]];
  const defaultPool = [0,30,25,18,10,9];
  const interestForGold = (gold, cap = 5) => Math.max(0, Math.min(cap, Math.floor(gold/10)));
  function keepsPvpInterest(before, after, cap = 5) {
    return interestForGold(after,cap) >= interestForGold(before,cap) &&
      interestForGold(after+1,cap) >= interestForGold(before+1,cap);
  }
  function traitsForBoard(slots, units, traitDefs) {
    const strongest = new Map();
    for (const p of slots) {
      if (p) strongest.set(p.id, Math.max(p.star || 1, strongest.get(p.id) || 0));
    }
    const counts = new Map();
    for (const [id,star] of strongest) for (const name of units[id].traits || []) {
      const amount = traitDefs[name]?.countBy === 'fielded_stars' ? star : 1;
      counts.set(name, (counts.get(name) || 0) + amount);
    }
    return [...counts].map(([name,count]) => {
      const steps = traitDefs[name]?.breakpoints || [];
      return {name,count,active:Math.max(0,...steps.filter(x=>x<=count)),next:steps.find(x=>x>count) || null};
    }).sort((a,b)=>b.active-a.active || b.count-a.count || a.name.localeCompare(b.name,'zh-Hant'));
  }
  const pack = (ok, message, extra = {}) => ({ok, message, ...extra});
  const asMap = (entries, key) => Array.isArray(entries) ? Object.fromEntries(entries.map(e => [e[key], e])) : (entries || {});
  const qualified = (value, r) => value >= (r.min ?? (r.max == null ? 1 : -Infinity)) && value <= (r.max ?? Infinity);
  const zones = ['board', 'bench'];
  // A saved replay should never show a different battle after an engine or balance update.
  function traceHash(native) {
    const text=JSON.stringify([native.winner,native.seconds,native.result?.events || []]);
    let hash=2166136261;
    for (let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
    return (hash>>>0).toString(16);
  }

  function create(scenario, catalog, saved) {
    if (!scenario?.rounds?.length || !catalog?.units) throw new Error('需要回合與棋子資料');
    const units = asMap(catalog.units, 'id');
    const traitDefs = asMap(catalog.traits, 'name');
    const recipeBook = new Map(), parts = new Set();
    const recipeKey = (a, b) => [a, b].sort().join('|');
    for (const {a, b, result} of catalog.recipes || []) {
      recipeBook.set(recipeKey(a, b), result);
      parts.add(a); parts.add(b);
    }
    const settings = scenario.settings || {};
    const xpTable = settings.xpToNext || defaultXp;
    const streakTable = settings.streakIncome || defaultStreak;
    const shopOdds = settings.shopOdds || defaultOdds;
    const poolSize = settings.pool || defaultPool;
    const maxLevel = settings.maxLevel || 10;
    const start = scenario.initial || {};
    if (start.removers!==undefined && (!Number.isSafeInteger(start.removers) || start.removers<0))
      throw Error('開局拆卸器數量無效。');
    function piece(source) {
      const p = typeof source === 'string' ? {id:source} : source;
      if (!units[p.id]) throw new Error('未知棋子 ' + p.id);
      return {id:p.id, star:p.star || 1, items:[...(p.items || [])]};
    }
    let state = {
      gold:start.gold ?? 0, hp:start.hp ?? 100, level:start.level ?? 3, xp:start.xp ?? 0,
      streak:start.streak ?? 0, board:Array(28).fill(null), bench:Array(9).fill(null), items:[...(start.items || [])],
      shop:Array(5).fill(null), augments:[...(start.augments || [])], unlocked:[...(start.unlocked || [])], plan:start.plan || '',
      roundIndex:0, history:[], finished:false, locked:false, refreshIndex:0, freeRerolls:0, freeRoundRefresh:false,
      currentAugment:null, beforeAugment:null,currentPlan:null, actionLog:[], pendingShops:[], pendingLoot:[], bonuses:{},parkedShop:null,combatPersist:{},
    };
    if (start.removers!==undefined) state.removers=start.removers;
    for (const zone of zones) {
      (start[zone] || []).forEach((p, i) => {
        if (!p) return;
        const position = p.cell ?? p.index ?? (p.r != null && p.c != null ? p.r*7+p.c : i);
        if (position < 0 || position >= state[zone].length || state[zone][position]) throw new Error('開局格位重複或超界');
        state[zone][position] = piece(p);
      });
    }
    const undoStack = [];
    let battleCache = null, lastBattle = null, revision = 0;
    const round = () => scenario.rounds[state.roundIndex];
    const cells = zone => zone ? state[zone].filter(Boolean) : [...state.board, ...state.bench].filter(Boolean);
    const slotOk = s => s && zones.includes(s.zone) && Number.isInteger(s.index) && s.index >= 0 && s.index < state[s.zone].length;
    const at = s => slotOk(s) ? state[s.zone][s.index] : null;
    const setSlot = (s, value) => {state[s.zone][s.index] = value;};
    const name = id => units[id]?.name || id;
    const sellValue = p => !p ? 0 : units[p.id].cost===7 ? 7 : Math.max(0, units[p.id].cost * (3 ** (p.star-1)) - (units[p.id].cost>1 && p.star>1 ? 1 : 0));
    const xpNeeded = (level = state.level) => level >= maxLevel ? 0 : xpTable[level];
    const population = () => cells('board').length;
    const interest = (coins = state.gold) => interestForGold(coins,settings.interestCap ?? 5);
    const costToLevel = (target,resources=state) => {
      if (target <= resources.level) return 0;
      if (target > maxLevel) return Infinity;
      let needed = -resources.xp;
      for (let level = resources.level; level < target; level++) needed += xpNeeded(level);
      return 4*Math.ceil(Math.max(0, needed)/4);
    };
    function addXp(amount) {
      state.xp += amount;
      while (state.level < maxLevel && state.xp >= xpNeeded()) {
        state.xp -= xpNeeded(); state.level++;
      }
      if (state.level >= maxLevel) state.xp = 0;
    }
    function shopFrom(ids, refresh = 0, restrictedPool = null) {
      const odds = shopOdds[state.level] || defaultOdds[state.level];
      const roster = cells();
      const taken = new Map();
      for (const p of [...roster, ...(round().opponent?.units || [])]) taken.set(p.id,(taken.get(p.id)||0)+3**((p.star || 1)-1));
      const mastered = new Set(roster.filter(p=>p.star>=3).map(p=>p.id));
      let seed = (state.roundIndex+1)*9173+(refresh+1)*1487+(Number(scenario.seed)||0);
      function draw(total) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*total;}
      function left(id) {return Math.max(0,(poolSize[units[id].cost] || 0)-(taken.get(id)||0));}
      function isAvailable(id,guaranteed=false) {
        return units[id] && !mastered.has(id) && (!units[id].locked || state.unlocked.includes(id)) &&
            (guaranteed || odds[units[id].cost-1]>0) && (left(id)>0 || (guaranteed && units[id].cost===7));
      }
      function weighted(entries, weight) {
        const sum = entries.reduce((n, e)=>n+weight(e),0);
        if (!sum) return null;
        let cursor = draw(sum);
        for (const e of entries) {cursor-=weight(e);if (cursor<0) return e;}
        return entries[entries.length-1];
      }
      function drawFromPool() {
        let pool = (restrictedPool || Object.keys(units)).filter(id=>isAvailable(id));
        if (!pool.length && restrictedPool) pool=Object.keys(units).filter(id=>isAvailable(id));
        const costs=[...new Set(pool.map(id=>units[id].cost))].sort((a,b)=>a-b);
        const cost=weighted(costs,c=>odds[c-1]);
        return weighted(pool.filter(id=>units[id].cost===cost),left);
      }
      const shop=Array(5).fill(null);
      // Guaranteed unlocks take the rightmost slot at the next actual refresh.
      let last=4;
      while (state.pendingShops.length && last>=0) {
        const id=state.pendingShops.shift();
        if (isAvailable(id,true)) {shop[last--]=id;taken.set(id,(taken.get(id)||0)+1);}
      }
      for (let i=0;i<=last;i++) {
        const id=ids?.[i]?.id || ids?.[i];
        if (id && !units[id]) throw new Error('商店內未知棋子 '+id);
        const chosen=isAvailable(id) ? id : drawFromPool();
        if (chosen) {shop[i]=chosen;taken.set(chosen,(taken.get(chosen)||0)+1);}
      }
      return shop;
    }
    function clearShop(snapshot) {
      snapshot.shop=Array(5).fill(null);snapshot.parkedShop=null;snapshot.locked=false;snapshot.freeRoundRefresh=false;
    }
    function startRound(first = false) {
      state.refreshIndex=0;state.currentAugment=null;state.beforeAugment=null;state.currentPlan=null;state.actionLog=[];
      state.freeRoundRefresh=round().type!=='carousel' && round().shopActive!==false && Boolean(state.bonuses.freeRefreshEachRound);
      if (round().shopActive===false) {
        clearShop(state);
        return;
      }
      if (round().type==='carousel') {
        if (state.locked) state.parkedShop=[...state.shop];
        state.shop=Array(5).fill(null);return;
      }
      if (!state.locked || first) state.shop=shopFrom(round().shop);
      else if (state.parkedShop) state.shop=state.parkedShop;
      state.parkedShop=null;state.locked=false;
    }
    if (saved) {
      if (saved.scenarioId!==scenario.id || saved.version!==1 || !saved.state || saved.state.board?.length!==28 ||
          saved.state.bench?.length!==9 || saved.state.shop?.length!==5 || !scenario.rounds[saved.state.roundIndex]) throw new Error('這份記錄不屬於本局，或內容已損壞');
      state = clone(saved.state);
      if (Array.isArray(saved.undo)) undoStack.push(...clone(saved.undo.slice(-4)));
      for (const snapshot of [state,...undoStack]) {
        // Old practice drafts predate the counter. An explicit zero is a spent tool.
        if (snapshot.removers===undefined && start.removers!==undefined) snapshot.removers=start.removers;
        if (snapshot.removers!==undefined && (!Number.isSafeInteger(snapshot.removers) ||
            snapshot.removers<0 || snapshot.removers>(start.removers ?? 0))) throw Error('這份進度的拆卸器數量無效。');
        if (scenario.rounds[snapshot.roundIndex]?.shopActive===false) clearShop(snapshot);
      }
    } else startRound(true);

    function traits() {
      return traitsForBoard(state.board, units, traitDefs);
    }
    function check(r) {
      const idMatches = p => p && (!r.ids || r.ids.includes(p.id)) && p.star >= (r.star || 1);
      const field = state.board.filter(idMatches);
      switch (r.test) {
        case 'gold': case 'level': case 'hp': case 'streak': return qualified(state[r.test],r);
        case 'interest': return qualified(interest(),r);
        case 'boardCount': return qualified(population(),r);
        case 'onBoard': return qualified(field.length,r);
        case 'leadCell': {
          const candidates=state.board.flatMap((p,index)=>{
            if(!idMatches(p))return [];
            const held=p.items.filter(item=>!parts.has(item) && (!r.items || r.items.includes(item))).length;
            return held ? [{index,held,star:p.star}] : [];
          });
          candidates.sort((a,b)=>b.held-a.held || b.star-a.star);
          const first=candidates[0];
          return Boolean(first && candidates.some(p=>p.held===first.held && p.star===first.star && r.cells?.includes(p.index)));
        }
        case 'front': case 'back': case 'cell':
          return qualified(state.board.filter((p, i) => idMatches(p) && (!r.items || p.items.some(item=>r.items.includes(item))) &&
            (r.test==='cell' ? (r.cells||[]).includes(i) : r.test==='front' ? i<14 : i>=14)).length,r);
        case 'owns': return qualified(cells().filter(idMatches).length,r);
        case 'copies': return qualified(cells().filter(idMatches).reduce((n,p)=>n+3**(p.star-1),0),r);
        case 'ownsItem': return qualified([...state.items,...cells().flatMap(p=>p.items)].filter(i=>(r.items||[]).includes(i)).length,r);
        case 'holds': return qualified(field.filter(p=>p.items.some(i=>r.items?.includes(i))).length,r);
        case 'itemsOn': return field.some(p=>qualified(p.items.filter(i=>r.items ? r.items.includes(i) : !parts.has(i)).length,r));
        case 'trait': return qualified(traits().find(t=>t.name===r.name)?.count||0,r);
        case 'augment': return (r.ids||[]).some(id=>state.augments.includes(id));
        case 'plan': return (r.ids||[]).includes(state.plan);
        case 'budgetAtLevel': return qualified(state.gold-costToLevel(r.level),r);
        case 'budgetBeforeAugment': {
          const before=state.beforeAugment || state;
          return qualified(before.gold-costToLevel(r.level,before),r);
        }
        case 'any': return r.rules.some(check);
        case 'all': return r.rules.every(check);
        case 'not': return !check(r.rule);
        case 'if': return check(r.when) ? check(r.then) : (r.else ? check(r.else) : true);
        default: throw new Error('未知教學判定 ' + r.test);
      }
    }
    const checked = rules => (rules||[]).map(r=>({label:r.label || r.test,ok:check(r),
      why:r.whyCases?.find(item=>check(item.when))?.why || r.why || ''}));
    const newStreak = result => result==='win' ? Math.max(0,state.streak)+1 : result==='loss' ? Math.min(0,state.streak)-1 : state.streak;
    function previewIncome(result) {
      const r = round(), carousel = r.type==='carousel';
      const win = result==='win' ? 1 : 0;
      const base = r.income ?? (carousel ? 0 : 5);
      const length = Math.abs(newStreak(result));
      const streak = carousel ? 0 : Math.max(0,...streakTable.filter(([t])=>length>=t).map(([,gold])=>gold));
      const earnedInterest = carousel ? 0 : interest(state.gold + win);
      const loot = r.loot?.gold || 0;
      const conditional = result==='win' ? state.bonuses.onPvpWinGold : result==='loss' ? state.bonuses.onPvpLossGold : 0;
      const augment = carousel ? 0 : (state.bonuses.income || 0)+(conditional||0);
      return {base,win,interest:earnedInterest,streak,loot,augment,total:base+win+earnedInterest+streak+loot+augment};
    }
    function battle() {
      const r=round();
      if (r.type==='pve' || r.type==='carousel') return null;
      const adapter=catalog.battleAdapter || globalThis.SimNativeBattle;
      if (typeof adapter?.run!=='function') return null;
      if (battleCache?.revision===revision && battleCache.adapter===adapter) return battleCache.result;
      const result=adapter.run(state,r,scenario,catalog);
      if (!result || typeof result.won!=='boolean') return null;
      battleCache={revision,adapter,result};
      return result;
    }
    function replayBattle(historyIndex) {
      const report=state.history[historyIndex], r=scenario.rounds[historyIndex];
      const adapter=catalog.battleAdapter || globalThis.SimNativeBattle;
      if (!report?.replayInput || !r || !adapter?.run) return null;
      const input={board:clone(report.board),level:report.level,roundIndex:historyIndex,...clone(report.replayInput)};
      const replayed=adapter.run(input,r,scenario,catalog);
      return replayed && (!report.traceHash || traceHash(replayed)===report.traceHash) ? replayed : null;
    }
    function evaluate() {
      const r = round();
      const checks = checked(r.rules);
      const battleChecks = checked(r.fightRules), met = checks.filter(c=>c.ok).length;
      const battleMet = battleChecks.filter(c=>c.ok).length;
      let outcome = r.result || 'neutral';
      if (r.type !== 'pve' && r.type !== 'carousel' && battleChecks.length) outcome = battleMet >= (r.winAt ?? battleChecks.length) ? 'win' : 'loss';
      if (r.type==='pve' || r.type==='carousel') outcome = 'neutral';
      const simulated = battle();
      if (simulated) outcome = simulated.won ? 'win' : 'loss';
      const gain = previewIncome(outcome);
      const damage = outcome==='loss' ? (r.lossDamage ?? 4) : 0;
      const detail = simulated ? {winner:simulated.winner,seconds:simulated.seconds,playerAlive:simulated.playerAlive,enemyAlive:simulated.enemyAlive} : null;
      return {roundId:r.id, outcome, outcomeSource:simulated?'native':outcome==='neutral'?'neutral':'lesson',battle:detail,
        checks, fightChecks:battleChecks, met, total:checks.length, passed:met===checks.length,
        income:gain,goldBefore:state.gold,goldAfter:state.gold+gain.total,hpBefore:state.hp,hpAfter:Math.max(0,state.hp-damage),
        streakBefore:state.streak,streakAfter:newStreak(outcome),plan:state.plan,augment:state.currentAugment,
        level:state.level,board:state.board.map(p=>p ? clone(p) : null),actions:[...state.actionLog]};
    }
    function equipOn(p, item, spill = false) {
      if (parts.has(item)) {
        const at = p.items.findIndex(other=>recipeBook.has(recipeKey(item,other)));
        if (at!==-1) {
          p.items[at] = recipeBook.get(recipeKey(item,p.items[at]));
          return true;
        }
      }
      if (p.items.length>=3) {
        if (spill) state.items.push(item);
        return false;
      }
      p.items.push(item); return true;
    }
    function matchingSlots(id, star) {
      const found = [];
      for (const zone of zones) state[zone].forEach((p,index)=>{
        if (p?.id === id && p.star === star) found.push({zone,index});
      });
      return found;
    }
    function mergedAt(slots) {
      const target = at(slots[0]); target.star++;
      const extras = [];
      for (const slot of slots.slice(1)) {
        extras.push(...at(slot).items); setSlot(slot,null);
      }
      for (const item of extras.sort((a,b)=>Number(parts.has(a))-Number(parts.has(b)))) equipOn(target,item,true);
      return target;
    }
    function collect(id) {
      const empty = state.bench.indexOf(null);
      if (empty>=0) state.bench[empty] = piece(id);
      else {
        const match = matchingSlots(id,1);
        if (match.length<2) return false;
        mergedAt(match.slice(0,2));  // The incoming shop copy completes the triple without occupying a slot.
      }
      for (const star of [1,2]) {
        const matches = matchingSlots(id,star);
        if (matches.length>=3) mergedAt(matches.slice(0,3));
      }
      return true;
    }
    function collectLoot() {
      const remaining = [];
      for (const id of state.pendingLoot) if (!collect(id)) remaining.push(id);
      state.pendingLoot = remaining;
    }
    function applyEffect(effect={}) {
      state.gold += effect.gold || 0; addXp(effect.xp || 0);
      state.items.push(...(effect.items || [])); state.freeRerolls += effect.freeRerolls || 0;
      if (effect.freeRefreshEachRound) {
        state.bonuses.freeRefreshEachRound=true;
        state.freeRoundRefresh=round().type!=='carousel' && round().shopActive!==false;
      }
      state.bonuses.income = (state.bonuses.income || 0) + (effect.incomePerRound || 0);
      state.bonuses.xp = (state.bonuses.xp || 0) + (effect.xpPerRound || 0);
      for (const key of ['onPvpWinGold','onPvpLossGold','onPvpWinXp','onPvpLossXp'])
        if (effect[key]) state.bonuses[key]=(state.bonuses[key] || 0)+effect[key];
      state.pendingLoot.push(...(effect.units || [])); collectLoot();
    }
    function take(kind, p) {
      if (round().shopActive===false && ['buy','reroll','lock'].includes(kind)) return pack(false,'本步不使用商店。');
      if (round().type==='carousel' && ['buy','xp','reroll','lock'].includes(kind)) return pack(false,'選秀期間沒有開放商店，選秀後繼續整備。');
      switch (kind) {
        case 'buy': {
          const id = state.shop[p.index];
          if (!id) return pack(false,'這一格沒有可購買的棋子。');
          const cost = units[id].cost;
          if (state.gold<cost) return pack(false,'金幣不足，這張需要 '+cost+' 金。');
          if (!collect(id)) return pack(false,'備戰區已滿，先賣出棋子或移到場上。');
          state.gold-=cost; state.shop[p.index]=null;
          return pack(true,'買入'+name(id)+'，花費 '+cost+' 金。');
        }
        case 'sell': {
          const unit = at(p.from);
          if (!unit) return pack(false,'請先選一張要出售的棋子。');
          const gold = sellValue(unit);
          state.gold+=gold;state.items.push(...unit.items);setSlot(p.from,null);collectLoot();
          return pack(true,'售出'+name(unit.id)+'取得 '+gold+' 金。裝備已收回。');
        }
        case 'move': {
          if (!slotOk(p.from) || !slotOk(p.to) || !at(p.from)) return pack(false,'請選棋子和目的格。');
          if (p.from.zone===p.to.zone && p.from.index===p.to.index) return pack(false,'棋子已在這格。');
          const source = at(p.from), target = at(p.to);
          if (p.from.zone==='bench' && p.to.zone==='board' && !target && population()>=state.level)
            return pack(false,'場上人口已滿。點場上棋子可直接交換。');
          setSlot(p.to,source);setSlot(p.from,target);collectLoot();
          return pack(true,target?'兩張棋子已換位。':name(source.id)+'已移動。');
        }
        case 'combine': {
          if (!Number.isInteger(p.a)||!Number.isInteger(p.b)||p.a===p.b||!state.items[p.a]||!state.items[p.b]) return pack(false,'請選兩個不同的散件格。');
          const result = recipeBook.get(recipeKey(state.items[p.a],state.items[p.b]));
          if (!result) return pack(false,'這兩件沒有收錄的合成配方。');
          state.items.splice(Math.max(p.a,p.b),1);state.items.splice(Math.min(p.a,p.b),1,result);
          return pack(true,'合成'+result+'。');
        }
        case 'removeGear': {
          if (!(state.removers>0)) return pack(false,'拆卸器已用完。');
          const unit=at(p?.from);
          if (!unit?.items.length) return pack(false,'請選一隻持裝棋子。');
          if (state.items.length+unit.items.length>10) return pack(false,'請先騰出足夠的裝備欄位。');
          state.items.push(...unit.items);
          unit.items=[];
          state.removers--;
          return pack(true,'裝備已移回裝備欄。');
        }
        case 'equip': {
          const unit=at(p.to), item=state.items[p.itemIndex];
          if (!unit||!item) return pack(false,'請先選裝備，再選持裝棋子。');
          if (!equipOn(unit,item)) return pack(false,'裝備欄已滿。');
          state.items.splice(p.itemIndex,1);
          return pack(true,name(unit.id)+'已裝上'+item+'。');
        }
        case 'xp':
          if (state.level>=maxLevel) return pack(false,'已達最高等級。');
          if (state.gold<4) return pack(false,'購買經驗需要 4 金。');
          state.gold-=4;addXp(4);return pack(true,'花費 4 金，獲得 4 經驗。');
        case 'reroll': {
          const cost=state.freeRoundRefresh || state.freeRerolls ? 0 : 2;
          if (state.gold<cost) return pack(false,'重抽商店需要 2 金。');
          const r=round(), index=state.refreshIndex;
          state.shop=shopFrom(r.rerolls?.[index],index+1,r.rerollPool);state.gold-=cost;
          if (state.freeRoundRefresh) state.freeRoundRefresh=false;
          else if (!cost) state.freeRerolls--;
          state.refreshIndex++;state.locked=false;return pack(true,cost?'花費 2 金重抽商店。':'已使用免費重抽。');
        }
        case 'lock':
          state.locked=!state.locked;return pack(true,state.locked?'已鎖定目前商店。':'已解除商店鎖定。');
        case 'augment': {
          if (state.currentAugment) return pack(false,'本輪已選增幅。');
          const chosen = round().augments?.find(a=>a.id===p.id);
          if (!chosen) return pack(false,'請選本輪提供的增幅。');
          state.beforeAugment={gold:state.gold,level:state.level,xp:state.xp};
          state.currentAugment=chosen.id;state.augments.push(chosen.id);applyEffect(chosen.effect);
          return pack(true,'已選擇'+chosen.name+'。');
        }
        case 'plan': {
          const chosen = round().plans?.find(a=>a.id===p.id);
          if (!chosen) return pack(false,'請選本輪提供的陣容方向。');
          state.plan=chosen.id;state.currentPlan=chosen.id;return pack(true,'目前以'+chosen.name+'為方向。');
        }
        case 'commit': {
          const r = round();
          if (r.augments?.length && !state.currentAugment) return pack(false,'請先處理本輪的增幅選擇。');
          if (r.requirePlan && !state.currentPlan) return pack(false,'請先選擇本回合的陣容方向。');
          const report = evaluate();
          lastBattle = battle();
          if (lastBattle) {
            report.replayInput={augments:[...state.augments],combatPersist:clone(state.combatPersist || {})};
            report.traceHash=traceHash(lastBattle);
            if (lastBattle.result?.summary?.persist) state.combatPersist=clone(lastBattle.result.summary.persist);
          }
          const unlocked = [];
          for (const rule of scenario.unlockRules||[]) {
            if (!state.unlocked.includes(rule.id) && check(rule.when)) {
              state.unlocked.push(rule.id);unlocked.push(rule.id);
              if (rule.guaranteeNext) state.pendingShops.push(rule.id);
            }
          }
          report.unlocked=unlocked;
          state.gold=report.goldAfter;state.hp=report.hpAfter;state.streak=report.streakAfter;
          state.items.push(...(r.loot?.items||[]));state.pendingLoot.push(...(r.loot?.units||[]));collectLoot();
          const extraXp = report.outcome==='win' ? state.bonuses.onPvpWinXp : report.outcome==='loss' ? state.bonuses.onPvpLossXp : 0;
          report.xpGained=(r.autoXp ?? (r.type==='carousel'?0:2))+(r.type==='carousel'?0:state.bonuses.xp||0)+(extraXp||0);
          addXp(report.xpGained);
          state.history.push(report);
          if (state.roundIndex>=scenario.rounds.length-1 || !state.hp) state.finished=true;
          else {state.roundIndex++;startRound();}
          return pack(true,'本回合已結算。',{report,battle:lastBattle});
        }
        default: return pack(false,'不支援這個操作。');
      }
    }
    function act(kind, payload={}) {
      if (state.finished) return pack(false,'這局已完成，可以重練或回到上一步。');
      const previous=clone(state);
      try {
        const result=take(kind,payload);
        if (!result.ok) return result;
        if (kind!=='commit') state.actionLog.push(result.message);
        revision++;battleCache=null;
        undoStack.push(previous);
        if (undoStack.length>60) undoStack.shift();
        return result;
      } catch (e) {state=previous; throw e;}
    }
    function undo() {
      if (!undoStack.length) return pack(false,'已在本局最初的狀態。');
      state=undoStack.pop();revision++;battleCache=null;lastBattle=null;return pack(true,'已回到上一步。');
    }
    return {get state(){return state;},round,act,undo,evaluate,traits,interest,sellValue,xpNeeded,previewIncome,costToLevel,
      check,battle,replayBattle,lastBattle:()=>lastBattle,export(){return {version:1,scenarioId:scenario.id,state:clone(state),undo:clone(undoStack.slice(-4))};}};
  }
  return {create,interestForGold,keepsPvpInterest,traitsForBoard,restore:(scenario,catalog,save)=>create(scenario,catalog,save)};
});

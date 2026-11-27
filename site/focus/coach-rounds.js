/* Play the coach's decisions forward with the same economy, battle and natural
   shops used by the practice course. Only the coach chooses when to advance. */
(function (root, factory) {
  const api=factory(root);
  if (typeof module === 'object' && module.exports) module.exports=api;
  root.CoachRounds=api;
})(globalThis, function(root) {
  'use strict';
  const focus=typeof module==='object' && module.exports ? require('./focus-engine.js') : root.FocusEngine;

  function create(q,catalog,savedState) {
    const grading=typeof module === 'object' && module.exports ? require('./coach-grading.js') : root.FocusCoachGrading;
    const rounds = (q.rounds || [q.round]).map(r=>({...r}));
    const initial=q.study ? q.initial : {...q.initial,removers:focus.removerAllowance(q)};
    const scenario = {id:q.id,seed:q.seed ?? q.id,initial,settings:q.settings,rounds};
    const blocked = message => ({ok:false,message});
    let sim;

    // The transition course supplies the 3-2 augment outside this drill. Its
    // on-pick effects belong to the new round once, also when replaying a draft.
    function applyGivenAugment() {
      const round=sim.round();
      if (!round.autoAugment) return;
      const offer=typeof round.autoAugment==='string' ? {id:round.autoAugment} : round.autoAugment;
      const definition=catalog.augments[offer.id];
      if (!definition?.stages?.includes(round.id) || round.augments?.length ||
          sim.state.augments.includes(offer.id)) throw Error('這回合預先提供的增幅與起手資料不符。');
      round.augments=[{...definition,...offer}];
      try {
        const result=sim.act('augment',{id:offer.id});
        if (!result.ok) throw Error(result.message);
        sim.state.currentAugment=null;
      } finally { delete round.augments; }
    }

    function restore(state) {
      if (state && q.study && initial.removers && state.removers===undefined) throw Error('這份盤面的拆卸器數量無效。');
      const record=state ? {version:1,scenarioId:q.id,state,undo:[]} : undefined;
      sim=root.SimEngine.create(scenario,catalog,record);
      // A partially purchased replay shop has empty slots. The normal
      // simulator fills unspecified slots; preserve the recorded vacancies.
      if (q.study && !state) sim.state.shop = [...q.round.shop];
      if (!state) applyGivenAugment();
    }
    function act(type,payload) {
      if(q.skill==='retention' && !sim.round().allowed?.includes(type) && !focus.equipmentToolAllows(q,sim.state,type))
        return blocked('這一步無法執行此操作。');
      return sim.act(type,payload);
    }
    function advance() {
      if (sim.state.roundIndex>=rounds.length-1) return blocked('此題已是最後一個回合。');
      const lineupIssue=grading.lineupIssue(q,sim.state.roundIndex,sim.state);
      if (lineupIssue) return blocked(lineupIssue);
      if (sim.state.roundIndex===0) {
        const holdIssue=grading.firstHoldIssue(q,sim.state);
        if (holdIssue) return blocked(holdIssue);
      }
      const floor=grading.interestFloor(q,sim.state.roundIndex);
      if (floor!==undefined && sim.state.gold<floor*10)
        return blocked('目前 '+sim.state.gold+' 金，這回合要守住 '+(floor*10)+' 金。');
      if (sim.round().type==='pvp' && !sim.battle()) return blocked('無法結算本輪戰鬥。');
      if (sim.evaluate().hpAfter<=0) return blocked('這次戰鬥會耗盡生命，請先調整盤面。');
      const before=sim.export().state;
      try {
        const result=sim.act('commit');
        if (result.ok) applyGivenAugment();
        return result;
      } catch(error) {
        restore(before);
        throw error;
      }
    }
    restore(savedState);
    return {get state(){return sim.state;},round:()=>sim.round(),act,
      traits:()=>sim.traits(),interest:result=>sim.previewIncome(result).interest,
      sellValue:piece=>sim.sellValue(piece),restore,advance,next:advance};
  }
  function createBoardSession(q, catalog, savedState, onUndoEntry) {
    const sim=create(q,catalog,savedState);
    const restore=state=>sim.restore(state);
    function buyTo(payload) {
      const {index,to}=payload;
      if (!to || !['board','bench'].includes(to.zone) || !Number.isInteger(to.index) || to.index<0 || to.index>=sim.state[to.zone].length)
        return {ok:false,message:'請選一個棋盤或備戰格。'};
      const id=sim.state.shop[index], before=sim.state.bench.map(p=>p && [p.id,p.star]);
      const bought=sim.act('buy',{index});
      if (!bought.ok) return bought;
      const i=sim.state.bench.findIndex((p,i)=>p?.id===id && (before[i]?.[0]!==id || before[i][1]!==p.star));
      if (i<0 || sim.state.bench[i].star>1 || (to.zone==='bench' && to.index===i)) return bought;
      return sim.act('move',{from:{zone:'bench',index:i},to});
    }
    return {step:q,get state(){return sim.state;}, round:()=>sim.round(),sellValue:p=>sim.sellValue(p),
      traits:()=>sim.traits(),interest:result=>sim.interest(result),
      can(type){
        if (focus.equipmentToolAllows(q,sim.state,type)) return true;
        if (q.skill==='retention') {
          const allowed=sim.round().allowed || [];
          return type==='buyTo' ? allowed.includes('buy') && allowed.includes('move') : allowed.includes(type);
        }
        return !['augment','routeAugment'].includes(q.skill) && !(q.study && type==='reroll') && ['buy','buyTo','move','sell','equip','combine','xp','lock','reroll'].includes(type);
      },
      restore,advance:()=>sim.advance(),
      act(type,payload){
        if (!this.can(type)) return {ok:false,message:'這個回合無法執行此操作。'};
        const before=JSON.parse(JSON.stringify(sim.state));
        const result=type==='buyTo'?buyTo(payload):sim.act(type,payload);
        if (!result.ok) { restore(before); return result; }
        const previous={};
        for (const key of Object.keys(before)) {
          if (JSON.stringify(sim.state[key])!==JSON.stringify(before[key])) previous[key]=before[key];
        }
        onUndoEntry({previous,added:Object.keys(sim.state).filter(k=>!(k in before))});
        return result;
      }
    };
  }
  return {create,createBoardSession};
});

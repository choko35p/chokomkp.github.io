/* Drive the Trials planning field with a single FocusEngine exercise. */
(function (root) {
  'use strict';
  const R = root.FocusNativeRenderers;
  const { el, avatarEl } = R.board;
  const shorten = id => (id || '').replace(/^TFT19_/, '');
  const pos = i => [Math.floor(i / 7), i % 7];
  function decorateArena(board) {
    const scenery = el('div','focus-arena-art',{'aria-hidden':'true'});
    for(const side of ['left','right']) {
      const deck=el('div','focus-stage-deck deck-'+side,{},
        el('i','deck-vents'),el('i','deck-platter'),el('i','deck-tonearm'),el('i','deck-slider'));
      scenery.append(deck);
    }
    scenery.append(el('i','focus-stage-lamps lamps-top'),el('i','focus-stage-lamps lamps-bottom'),
      el('i','focus-stage-monitor monitor-top'),el('i','focus-stage-monitor monitor-bottom'));
    board.prepend(scenery);
    if(board.dataset.mode==='battle') {
      scenery.append(el('i','focus-center-track'));
      board.append(el('div','focus-field-markers',{'aria-hidden':'true'},
        el('span','focus-side-mark foe',{},el('i'),'對手'),el('span','focus-side-mark ally',{},el('i'),'我方')));
    }
  }
  function renderPlanningBoard(board,api,positions) {
    const instrument=positions[0];
    const fieldApi=instrument ? {...api,picks:()=>({inst:{cap:1,held:positions,active:positions}})} : api;
    R.board.renderBoard(board,fieldApi,{mode:'plan'});decorateArena(board);
    const marker=board.querySelector('.tt-inst');
    if(marker){
      for (const attr of ['data-tt-drag','data-tt-tap','data-tt-tip','tabindex'])marker.removeAttribute(attr);
      marker.setAttribute('role','img');marker.setAttribute('aria-label','預放的沙灘樂器，效果涵蓋相鄰格');
      marker.title='此題預放樂器，效果涵蓋相鄰格';
    }
    return instrument ? instrument[0]*7+instrument[1] : -1;
  }
  function slot(desc) {
    if (typeof desc !== 'string') return null;
    const [zone, raw] = desc.split(':');
    if (zone === 'board') { const [r,c] = raw.split(',').map(Number); return {zone,index:7*r+c}; }
    if (zone === 'bench') return {zone,index:Number(raw)};
    return null;
  }
  function safeStore() {
    try { return root.localStorage; } catch (_) { const data=new Map(); return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}; }
  }
  const modifierNames=['Ctrl','Alt','Shift','Meta'];
  const bindingLabel=code=>!code?'未設定':code.split('+').map(part=>part==='Meta'?'⌘':R.hotkeys.codeLabel(part)).join('+');
  function bindingFromEvent(e) {
    if(!e.code || e.code==='Unidentified' || !R.hotkeys.isAcceptable(e.code))return null;
    const modifiers=[e.ctrlKey,e.altKey,e.shiftKey,e.metaKey];
    return [...modifierNames.filter((_,i)=>modifiers[i]),e.code].join('+');
  }
  function typingTarget(target) {
    return !!(target?.isContentEditable || target?.closest?.('input,textarea,select,[role="textbox"]'));
  }
  function keyProfiles() {
    const storage=safeStore();
    let profile='game';
    try {profile=storage.getItem('s19focus.keyProfile') === 'trials' ? 'trials' : 'game';} catch (_) {}
    const extra=(id,zh,def)=>({id,zh,phase:'plan',official:true,def});
    function make(id) {
      const actions=R.hotkeys.ACTIONS.filter(a=>!['planner','unlocks','speed','skip'].includes(a.id)).map(a=>({...a,
        zh:a.id==='fight'?'確認本題':a.zh, def:!a.official && id==='game'?null:a.def}));
      actions.push(extra('scoutPrev','順時針查看對手',id==='game'?'KeyQ':null),extra('scoutNext','逆時針查看對手',id==='game'?'KeyR':null),
        extra('scoutPrev2','順時針查看對手（第二組）', id==='game'?'Digit1':null),extra('scoutNext2','逆時針查看對手（第二組）',id==='game'?'Digit3':null),
        extra('scoutRankPrev','查看上一名',id==='game'?'BracketLeft':null),extra('scoutRankNext','查看下一名',id==='game'?'BracketRight':null),
        extra('home','回到自己的棋盤',id==='game'?'Space':null),extra('home2','回到自己的棋盤（第二組）',id==='game'?'Digit2':null));
      const apple=/Mac|iPhone|iPad|iPod/i.test(root.navigator?.platform || root.navigator?.userAgent || '');
      actions.unshift({...extra('undo','復原上一步',(apple?'Meta':'Ctrl')+'+KeyZ'),official:false});
      return R.hotkeys.createHotkeys(storage,actions,'s19focus.keys.'+id);
    }
    const maps={game:make('game'),trials:make('trials')};
    const listeners=new Set();const notify=()=>listeners.forEach(fn=>fn());
    Object.values(maps).forEach(map=>map.onChange(notify));
    const current={get ACTIONS(){return maps[profile].ACTIONS;},get:id=>maps[profile].get(id),label:id=>bindingLabel(maps[profile].get(id)),actionFor:(...args)=>maps[profile].actionFor(...args),set:(...args)=>maps[profile].set(...args),reset:()=>maps[profile].reset(),onChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
    return {current,get name(){return profile;}, select(id){profile=id;try{storage.setItem('s19focus.keyProfile',id);}catch(_){} notify();}};
  }
  function mount(host, options) {
    const {session,catalog} = options;
    const native = root.TrialsTrainingNativeRuntime.data;
    const DATA = {...native,units:{...native.units,sprite:{...native.units.sprite,src:R.asset('icons/s19/champions.webp')}},traits:{...native.traits,sprite:{...R.traitSprite,src:R.asset('icons/s19/traits.webp')}}};
    const itemKey = name => catalog.items?.[name]?.key || name;
    const profiles = keyProfiles();
    const shell=el('div','tt-shell',{'data-phase':'plan'});
    shell.innerHTML=`<div class="tt-app"><div class="tt-stage"><div class="tt-roundbar" aria-label="回合"></div><div class="tt-augs" aria-label="已選增幅"></div><div class="tt-xitems" aria-label="裝備欄"></div><div class="tt-traits" data-tt-mount="traits"></div><button class="tt-codexbtn" type="button" data-act="codex">圖鑑</button><div class="tt-board" aria-label="棋盤"></div><div class="tt-bench" aria-label="板凳"></div><div class="tt-hud"></div><div class="tt-xshop" data-tt-drop="sell"></div><button class="tt-go" type="button" data-act="submit"><span>確認</span><kbd class="tt-hk"></kbd></button><button class="tt-autoskip tt-choice-open" type="button" data-act="choose" hidden></button><div data-tt-mount="unitpanel" class="tt-unitpanel" hidden></div><div class="tt-toast" role="status" aria-live="polite"></div></div></div>`;
    host.replaceChildren(shell);
    const node = klass=>shell.querySelector('.tt-'+klass);
    const ui = {mode:'plan',sel:null};
    let held=null,hover=null,enemy=null,scouting=false,timer=null,disposed=false,replayControl=null;
    let instrumentCell = -1;
    function toast(message) {
      if (!message) return;
      const n=node('toast'),board=node('board'); n.textContent=message;
      n.style.setProperty('--tt-ty', (board.offsetTop+board.offsetHeight-6)+'px'); n.classList.add('tt-xon');
      clearTimeout(timer);timer=setTimeout(()=>n.classList.remove('tt-xon'),2100);
    }
    const api={DATA,ui,toast,get hotkeys(){return profiles.current;},state:{},countTraits:R.stats.countTraits,
      enemy:()=>null,traitBreakdown,popUsed:()=>session.state.board.filter(Boolean).length,popMax:()=>session.state.level,
      emit:()=>render(), act:handleNative};
    const step=()=>session.step || session.q;
    const can=kind=>session.can(kind);
    function action(kind,payload={}) {
      if(options.readOnly)return {ok:false,message:'示範中，回到練習後即可操作棋盤。'};
      if (payload.to?.zone === 'board' && payload.to.index === instrumentCell) {
        const message='這格有預放的沙灘樂器，請選旁邊的空格。';toast(message);return {ok:false,message};
      }
      const result=session.act(kind,payload);
      if (result.ok) { held=null; ui.sel=null; }
      render(); toast(result.message || result.reason || result.text);
      if (result.ok) options.onChange?.(session,result);
      return result;
    }
    function handleNative(kind,...args) {
      if(replayControl)return toast('先回到自己的棋盤再調整。');
      if(session.round().shopActive===false && (kind==='reroll' || kind==='lockShop'))return toast('本題不使用商店。');
      if (kind==='sell') return action('sell',{from:slot(args[0])});
      if (kind==='combineItems') return action('combine',{a:args[0],b:args[1]});
      if (kind==='levelUp') {
        if(!can('xp')) return action('xp');
        const target=R.game.levelUpCost(api.state,DATA);
        if(!target || target.gold>session.state.gold) return toast('升級金幣不足。');
        for(let i=0;i<target.buys;i++){const result=action('xp');if(!result.ok)return result;} return;
      }
      const known={buyXp:'xp',reroll:'reroll',lockShop:'lock'};
      if(known[kind]) return action(known[kind]);
    }
    function nativePiece(piece,i,zone) {
      if(!piece)return null;
      const where=zone==='board'?pos(i):null;
      return {key:shorten(piece.id || piece.key),uid:where?'board:'+where.join(','):'bench:'+i,star:piece.star||1,items:(piece.items || []).map(itemKey),pos:where};
    }
    function nativeState() {
      const s=session.state, r=session.round();
      enemy=step().opponentCue && step().opponentCueKind!=='report' && r.opponent?.units?.length ? {name:r.opponent.name || '對手',units:r.opponent.units.map(p=>({key:shorten(p.id || p.key),star:p.star||1,items:(p.items||[]).map(itemKey),pos:pos(p.cell ?? 0)}))} : null;
      api.state={...s,phase:'plan',round:Math.max(1,s.roundIndex+1),shopLocked:s.locked,streak:Math.max(0,s.streak||0),stats:{loseStreak: Math.max(0,-s.streak||0)},
        board:s.board.map((p,i)=>nativePiece(p,i,'board')),bench:s.bench.map((p,i)=>nativePiece(p,i,'bench')),itemBench:s.items.map(itemKey),
        shop:s.shop.map(id=>id?{key:shorten(id),cost:catalog.units[id]?.cost}:null),persist:s.combatPersist || {}};
    }
    // Count, active breakpoint, next breakpoint and contributing champions all
    // come from the current board. A shop prediction or an answer/rule list
    // never enters the live trait HUD.
    function traitReading(key,raw) {
      const trait=DATA.traits.byKey[key], breaks=trait.breakpoints || [],unit=R.traitbar.isStars(DATA,key)?'星':'人';
      const tier=raw.tier || 0,active=tier?breaks[tier-1]:null,next=breaks[tier] ?? null,count=raw.count || 0;
      return {unit,count,active,next,more:next===null?0:Math.max(0,next-count)};
    }
    function traitBreakdown(key,raw) {
      const {unit,count,active,next,more}=traitReading(key,raw);
      const members=(raw.members || []).map(k=>{
        const name=DATA.units.byKey[k]?.zh||k;
        if(unit!=='星')return name;
        const star=Math.max(0,...api.state.board.filter(u=>u?.key===k).map(u=>u.star));
        return name+'（'+star+' 星）';
      });
      const summary=el('section','focus-trait-summary',{'aria-label':'目前場上羈絆'},
        el('strong','',{},'目前 '+count+' '+unit),
        el('span','',{},active===null?'尚未啟動':'已啟動 '+active+' '+unit+'檔'),
        el('span','',{},next===null?'已達最高檔':'下一檔 '+next+' '+unit+'，還差 '+more+' '+unit+'。'));
      if(members.length)summary.append(el('span','focus-trait-members',{},'場上成員　'+members.join('、')));
      return summary;
    }
    function renderLiveTraits(rows) {
      R.traitbar.renderTraits(node('traits'),rows,null,api);
      const byKey=new Map(rows.map(r=>[r.key,r]));
      for(const button of node('traits').querySelectorAll('.tt-trow')) {
        const raw=byKey.get(button.dataset.trait);if(!raw)continue;
        const {count,unit,active,next}=traitReading(raw.key,raw);
        const current=active===null?'未啟動':'已開 '+active,later=next===null?'最高檔':'下檔 '+next;
        button.querySelector('.tt-tcnt').replaceChildren(String(count),el('small','focus-trait-unit',{},unit));
        button.querySelector('.tt-tbp').replaceChildren(el('span','',{},current),el('span','',{},later));
        button.setAttribute('aria-label',`${raw.zh}，目前 ${count} ${unit}，${current}${active===null?'':unit+'檔'}，${later}${next===null?'':unit}。查看羈絆詳情`);
      }
    }
    function renderEquipment() {
      const tray=node('xitems');
      R.board.renderItems(tray,api);
      const count=session.state.removers;
      if (!Number.isInteger(count)) return;
      const available=can('removeGear') && !options.readOnly;
      const hint=count ? '點選或拖到持裝棋子，將裝備全部取回' : '已用完';
      const button=el('button','tt-xslot tt-remover'+(held==='remover'?' tt-sel':''),{
        type:'button',id:options.onRemoverPick?'study-remover':'focus-remover',
        title:'拆卸器 · '+hint,disabled:!available,'aria-pressed':String(held==='remover'),
        'aria-label':'拆卸器，剩 '+count+' 個。'+hint,
        'data-tt-tap':available?'remover':null,'data-tt-drag':available?'remover':null
      },el('span','tt-remover-art',{'aria-hidden':'true'},
        el('img','tt-remover-icon',{src:R.asset('icons/items/MagneticRemover.webp'),alt:'',draggable:'false'}),
        el('small','remover-count',{},String(count))));
      const space=tray.querySelector('.tt-xslot[aria-hidden="true"]');
      tray.classList.toggle('tt-extra-item',!space);
      if (space) space.replaceWith(button);
      else tray.append(button);
      if (held==='remover') {
        for (const token of shell.querySelectorAll('.tt-unit[data-tt-tap]')) {
          const loc=slot(token.dataset.ttTap);
          if (loc && session.state[loc.zone][loc.index]?.items.length) token.classList.add('tt-remover-target');
        }
      }
    }
    function render() {
      if(disposed || replayControl)return;
      const focusNode=document.activeElement, focusCell=shell.contains(focusNode) && focusNode.dataset?.ttDrop;
      nativeState(); const s=session.state,r=session.round(),rr=String(r.id||'');
      const turn=Number(rr.split('-')[1]); const dots=el('span','tt-rdots',{'aria-hidden':'true'});
      for(let i=1;i<=7;i++)dots.append(el('i','tt-rd'+(i<turn?' tt-past':i===turn?' tt-now':'')+(i===7?' tt-boss':''),{},i===7?'☠':''));
      node('roundbar').replaceChildren(el('b','tt-rtxt',{},'回合 ',el('span','tt-num',{},rr)),dots,el('span','tt-score tt-num',{'aria-label':'生命值 '+s.hp},el('img','',{src:R.asset('img/ui/heart.webp'),alt:''}),s.hp));
      renderScoutCue();
      const mine=api.state.board.filter(Boolean),mineTraits=R.stats.countTraits(mine,DATA,{augments:s.augments});
      renderLiveTraits(mineTraits);
      const positions=r.instrumentBeside && mineTraits.some(t=>t.key==='BeachPop' && t.tier>0)
        ? root.SimNativeBattle.lessonInstruments(s,r) : [];
      instrumentCell=renderPlanningBoard(node('board'),api,positions);
      R.board.renderBench(node('bench'),api); renderEquipment();
      R.shopbar.renderHud(node('hud'),api); R.shopbar.renderShop(node('xshop'),api);
      const market=node('xshop');market.classList.remove('tt-sellmode');market.classList.toggle('is-closed',r.shopActive===false);
      if(r.shopActive===false){const cards=market.querySelector('.tt-cards');cards.append(el('span','tt-market-note',{},'本題不使用商店'));}
      const free=s.freeRerolls || s.freeRoundRefresh;
      if(free){const fee=node('rrbtn').querySelector('.tt-sbc'); if(fee)fee.textContent='免費';}
      for(const [cls,type] of [['xpbtn','xp'],['rrbtn','reroll'],['hud-lvup','xp'],['hud-lock','lock']]) node(cls)?.setAttribute('aria-disabled',String(!can(type) || (r.shopActive===false && ['reroll','lock'].includes(type))));
      const choice=node('choice-open'),a=r.augments?.length,p=r.plans?.length;
      const route=p && options.onRouteChoices && session.routePreparation?.();
      choice.hidden=!!route || !(a||p);choice.textContent=a?(s.currentAugment?'查看增幅':'選擇增幅'):(s.currentPlan?'查看方向':'選陣容方向');
      const go=node('go');
      const scoutingLesson=!!route?.scoutTotal && !options.readOnly;
      go.disabled=!!route && !options.readOnly && (!route.worn.length || (scoutingLesson && route.selected && route.contestCount===null));
      let goLabel=options.submitLabel?.() || (route && !options.readOnly?'確認方向':'確認');
      if(route && !route.selected && !options.readOnly)goLabel=scoutingLesson && !route.scoutComplete?'偵查對手':'選擇方向';
      go.querySelector('span').textContent=goLabel;
      const key=profiles.current.get('fight');node('go').querySelector('kbd').textContent=key?profiles.current.label('fight'):'';
      const chosen=node('augs');chosen.replaceChildren();
      for(const id of s.augments || []) {const def=DATA.augments.byKey[id]; if(!def)continue;
        const b=el('button','tt-aug t'+def.tier,{type:'button','aria-label':def.zh,'data-tt-tip':'aug:'+id});const icon=R.tooltip.augIconNode(def);b.append(icon);b.onclick=()=>R.panels.showAugmentInfo(api,id);chosen.append(b);}
      R.panels.renderUnitSide(node('unitpanel'),api);
      for(const place of shell.querySelectorAll('[data-tt-drop^="board:"],[data-tt-drop^="bench:"]')) place.dataset.ttTap=place.dataset.ttDrop;
      node('board').setAttribute('aria-label','我方棋盤，4 排 7 格');
      if(focusCell && document.activeElement===document.body)shell.querySelector('[data-tt-drop="'+CSS.escape(focusCell)+'"]')?.focus({preventScroll:true});
      options.onRender?.();
    }
    function select(desc,target) {
      const loc=slot(desc);
      if (loc && session.state[loc.zone][loc.index]) {held=desc;ui.sel={kind:'unit',uid:desc};}
      else if(desc?.startsWith('item:')){held=desc;ui.sel={kind:'item',idx:Number(desc.slice(5))};}
      else {held=null;ui.sel=null;}
      render();
    }
    function drop(from,to) {
      if(replayControl)return;
      if(!from||!to||from===to)return;
      const src=slot(from),dest=slot(to);
      if(from==='remover' && dest)return action('removeGear',{from:dest});
      if(src && to==='sell')return action('sell',{from:src});
      if(src && dest)return action('move',{from:src,to:dest});
      if(from.startsWith('item:')) {
        const itemIndex=Number(from.slice(5));
        if(to.startsWith('item:'))return action('combine',{a:itemIndex,b:Number(to.slice(5))});
        if(dest)return action('equip',{itemIndex,to:dest});
      }
      if(from.startsWith('shop:') && dest){
        const index=Number(from.slice(5));
        return can('move') ? action('buyTo',{index,to:dest}) : action('buy',{index});
      }
    }
    function tap(desc,target,event={}) {
      if(replayControl)return;
      if(desc==='remover'){
        if(options.readOnly || !can('removeGear'))return;
        if(options.onRemoverPick)return options.onRemoverPick();
        if(held==='remover')return select(null);
        if(![...session.state.board,...session.state.bench].some(p=>p?.items.length))return toast('場上和備戰區都沒有持裝棋子。');
        held='remover';ui.sel=null;render();
        if(event.pointerType==='keyboard')shell.querySelector('.tt-remover-target')?.closest('[data-tt-drop]')?.focus();
        return toast('點選要拆裝的棋子。');
      }
      if(event.button===2){if(desc.startsWith('shop:')){const id=session.state.shop[Number(desc.slice(5))];if(id)R.panels.showUnitPanel(shorten(id),api);}else select(desc,target);return;}
      if(held==='remover' && slot(desc))return drop(held,desc);
      if(desc.startsWith('shop:'))return action('buy',{index:Number(desc.slice(5))});
      if(held===desc)return select(null);
      // 站主 2026-11-27：棋子換位置只能用拖的（跟滴答克的試煉一樣）。選著棋子再點別格＝改選那格／取消，不會移動。
      // 裝備、拆卸器照遊戲：選著再點棋子可以裝上去。
      if(held){const dest=slot(desc); const carry=held.startsWith('item:');
        if((carry && dest && can('equip')) || (carry && desc.startsWith('item:') && can('combine')))return drop(held,desc);}
      select(desc,target);
    }
    R.dnd.enableDnd(shell,{onTap:tap,onDrop:drop,onLongPress:(d,t)=>tap(d,t,{button:2}),onTapEmpty:()=>select(null),
      onDragStart:d=>{const loc=slot(d);if(!loc || !can('sell'))return;const u=session.state[loc.zone][loc.index];if(!u)return;node('xshop').classList.add('tt-sellmode');node('xshop').dataset.sell='出售 ＋'+session.sellValue(u)+' 金';},
      onDragEnd:()=>node('xshop').classList.remove('tt-sellmode')});
    shell.addEventListener('contextmenu',e=>{if(e.target.closest('[data-tt-tap]'))e.preventDefault();});
    shell.addEventListener('pointerover',e=>{hover=e.target.closest('[data-tt-tap],[data-tt-drop]')?.dataset.ttTap || null;});
    shell.addEventListener('pointerleave',()=>hover=null);
    function choices() {
      const r=session.round(),isAug=!!r.augments?.length,available=isAug?r.augments:r.plans;
      if(!available?.length)return;
      if(!isAug && options.onRouteChoices && session.routePreparation?.()){options.onRouteChoices();return;}
      const cards=el('div','tt-opts');
      for(const option of available){
        const selected=(isAug?session.state.currentAugment:session.state.currentPlan)===option.id;
        const nativeAug=DATA.augments.byKey[option.id]; const route=catalog.routes?.find?.(x=>x.id===option.id);
        const title=el('span','tt-opt-head');const info=el('span','');
        if(isAug && nativeAug){title.append(R.tooltip.augIconNode(nativeAug));info.append(el('span','tt-tl',{},['','銀色','金色','彩色'][nativeAug.tier] || ''));}
        info.append(el('span','tt-on',{},option.name));title.append(info);
        const card=el('button','tt-opt'+(selected?' focus-opt-picked':''),{type:'button','data-tier':nativeAug?.tier||1,'aria-pressed':String(selected),'data-choice-id':option.id},title);
        if(route?.coreIds?.length)card.append(el('span','focus-option-portraits',{},route.coreIds.slice(0,4).map(id=>avatarEl(DATA,shorten(id),34))));
        const desc=option.description || nativeAug?.desc || (route?.coreIds||[]).slice(0,4).map(id=>catalog.units[id]?.name).filter(Boolean).join('、');if(desc)card.append(el('span','',{},desc));
        card.onclick=()=>{R.panels.closePanels();if(selected)return;action(isAug?'augment':'plan',{id:option.id});};cards.append(el('div','tt-optcol',{},card));
      }
      R.panels.openPanel({title:isAug?'選擇增幅裝置':'選擇陣容方向',body:[cards],cls:'tt-augpick'});
    }
    function settings(){
      if(disposed || replayControl || R.panels.hasPanel())return;
      const hk=profiles.current;
      const pick=el('select','',{'aria-label':'快捷鍵配置'},el('option','',{value:'game'},'聯盟戰棋'),el('option','',{value:'trials'},'滴答克原版'));
      pick.value=profiles.name;pick.tabIndex=0;
      const list=el('div','tt-hk-list');
      const message=el('p','tt-desc',{role:'status','aria-live':'polite'});
      let editing=null, pending=null;
      function stop() {
        editing=null;pending=null;
        document.body.removeAttribute('data-tt-recording');
      }
      function rememberFocus(id) { list.querySelector('[data-action="'+id+'"]')?.focus({preventScroll:true}); }
      const field=(name,values)=>el('select','',{'aria-label':name,tabindex:'0'},values.map(([value,text])=>el('option','',{value},text)));
      const named=(text,run,attrs={})=>{const b=el('button','tt-btn',{type:'button',...attrs},text);b.onclick=run;return b;};
      function assign(id,code,force=false) {
        const result=hk.set(id,code,{force});
        if(!result.ok && result.conflict) {
          pending={code,other:result.conflict};draw();
          list.querySelector('[data-tt="hk-swap"]')?.focus({preventScroll:true});return;
        }
        if(!result.ok)return;
        stop();draw();rememberFocus(id);message.textContent='已儲存。';
      }
      function editor(id) {
        const box=el('div','focus-key-edit');
        if(pending) {
          const old=hk.ACTIONS.find(a=>a.id===pending.other);
          box.append(el('span','',{role:'alert'},bindingLabel(pending.code)+' 已經用於「'+old.zh+'」。要移給這個操作嗎？'),
            named('換過來',()=>assign(id,pending.code,true),{'data-tt':'hk-swap'}),
            named('取消',()=>{stop();draw();rememberFocus(id);},{'data-tt':'hk-cancel'}));
          return box;
        }
        const baseKeys=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(x=>'Key'+x).concat([...'0123456789'].map(x=>'Digit'+x),
          ['Space','BracketLeft','BracketRight','Backquote','Minus','Equal','Backslash','Semicolon','Quote','Comma','Period','Slash','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Delete','Backspace','Insert']);
        const modifierValues=Array.from({length:16},(_,mask)=>modifierNames.filter((_,i)=>mask & (1<<i)).join('+'));
        const mods=field('修飾鍵',modifierValues.map(v=>[v,v?bindingLabel(v):'無修飾鍵']));
        const key=field('按鍵',baseKeys.map(k=>[k,R.hotkeys.codeLabel(k)]));
        const bits=(hk.get(id) || 'KeyA').split('+'),base=bits.pop();
        if(!baseKeys.includes(base)) key.add(new Option(R.hotkeys.codeLabel(base),base));
        key.value=base;mods.value=bits.join('+');
        box.append(el('span','',{},'按下新快捷鍵，或從選單指定。'),mods,key,
          named('套用',()=>assign(id,[mods.value,key.value].filter(Boolean).join('+'))),
          named('取消',()=>{stop();draw();rememberFocus(id);}));
        return box;
      }
      function draw() {
        list.replaceChildren(...hk.ACTIONS.map(a=>{
          const editingThis=editing===a.id, code=hk.get(a.id);
          const key=el('button','tt-hk-key'+(editingThis?' tt-rec':''),{type:'button','data-action':a.id,
            'aria-label':a.zh+'，'+hk.label(a.id)+'，按一下改鍵','aria-expanded':String(editingThis)},editingThis?'等待新按鍵…':hk.label(a.id));
          key.onclick=()=>{
            const toggle=editingThis;stop();
            if(!toggle) { editing=a.id;document.body.setAttribute('data-tt-recording','1'); }
            message.textContent='';draw();rememberFocus(a.id);
          };
          const clear=el('button','tt-hk-clear',{type:'button','data-clear':a.id,disabled:!code,'aria-label':'清除'+a.zh+'的快捷鍵'},'清除');
          clear.onclick=()=>assign(a.id,null);
          const row=el('div','tt-hk-row',{'data-row':a.id},el('span','tt-hk-name',{},a.zh),key,clear);
          if(editingThis)row.append(editor(a.id));return row;
        }));
      }
      function record(e) {
        if(!editing || e.isComposing || e.keyCode===229 || e.defaultPrevented)return;
        if(e.code==='Escape'){
          e.preventDefault();e.stopImmediatePropagation();const id=editing;stop();draw();rememberFocus(id);return;
        }
        if(pending || typingTarget(e.target) || e.code==='Tab' || e.target.closest?.('.focus-key-edit'))return;
        if(e.target.dataset?.action!==editing)return;
        e.preventDefault();e.stopImmediatePropagation();
        if(e.repeat)return;
        const code=bindingFromEvent(e);
        if(code)assign(editing,code);
        else if(!/^(Shift|Meta|Control|Alt|OS)(Left|Right)$/.test(e.code))message.textContent='這個按鍵保留給瀏覽器或視窗操作。';
      }
      pick.onchange=()=>{stop();message.textContent='';profiles.select(pick.value);draw();};
      const reset=named('還原預設',()=>{stop();hk.reset();draw();message.textContent='已還原這組配置的預設鍵位。';},{'data-tt':'hk-reset'});
      draw();
      R.panels.openPanel({title:'快捷鍵設定',cls:'tt-wide tt-hotkeys',body:[
        el('label','focus-preset',{},'預設配置',pick),el('p','tt-desc',{},'點一下鍵名即可更改。設定會儲存在這台裝置。'),list,message],
        footer:[reset,named('關閉',()=>R.panels.closePanels(),{'data-autofocus':''})],onClose:()=>{
          stop();window.removeEventListener('keydown',record,true);options.onModeChange?.();
        }});
      window.addEventListener('keydown',record,true);options.onModeChange?.();
    }
    let scoutStep=null;
    function renderScoutCue() {
      const stage=node('stage'),current=step(),cue=String(current.opponentCue || '').trim();
      stage.querySelector('.focus-scout-cue')?.remove();stage.querySelector('.focus-scout-panel')?.remove();
      stage.style.removeProperty('--focus-scout-h');
      if(scoutStep!==current){scoutStep=current;scouting=false;}
      if(!cue || replayControl){scouting=false;return;}
      const report=current.opponentCueKind==='report', label=report?'上輪戰報':'對位提示';
      const cueBox=el('aside','focus-scout-cue',{'aria-label':label},el('span','focus-scout-label',{},label),el('span','focus-scout-text',{},report?cue.replace(/^上輪戰報[：:，、\s]*/,''):cue));
      if(enemy){
        const trigger=el('button','focus-scout-toggle',{type:'button','aria-expanded':String(scouting),'aria-label':scouting?'收起對手站位':'查看對手站位'},scouting?'收起':'看站位');
        trigger.onclick=()=>{if(scouting)returnHome();else scout();stage.querySelector('.focus-scout-toggle')?.focus({preventScroll:true});};
        if(scouting)trigger.setAttribute('aria-controls','focus-scout-panel');
        cueBox.append(trigger);
      }
      stage.append(cueBox);
      if(!scouting || !enemy)return;
      const grid=el('div','focus-scout-grid',{'aria-label':'對手的四排七格'});
      // Stored enemy cells face their owner. Rotate 180° to show our view.
      const pieces=new Map(enemy.units.map(u=>[(3-u.pos[0])*7+(6-u.pos[1]),u]));
      const detail=el('span','focus-scout-piece',{'aria-live':'polite'});
      for(let i=0;i<28;i++){
        const [row,col]=pos(i),u=pieces.get(i);
        const cell=el(u?'button':'span','focus-scout-cell',u?{type:'button','data-scout-cell':i}:{'aria-hidden':'true'});
        cell.style.setProperty('--sc-x',col+.5*(row%2));cell.style.setProperty('--sc-row',row);
        if(u){const itemNames=u.items.map(k=>R.board.itemZh(DATA,k));
          const label=`${DATA.units.byKey[u.key]?.zh||u.key} ${u.star} 星，從左第 ${col+1} 格、離我方第 ${4-row} 排`+(itemNames.length?'。裝備有'+itemNames.join('、'):'');
          cell.setAttribute('aria-label',label);cell.title=label;cell.append(avatarEl(DATA,u.key));
          cell.onclick=()=>{detail.textContent=label;stage.style.setProperty('--focus-scout-h',panel.offsetHeight+'px');};
        }
        grid.append(cell);
      }
      const panel=el('section','focus-scout-panel',{id:'focus-scout-panel','aria-label':'對手站位'},el('b','',{},'對手站位'),el('small','',{},'我方視角，下方較近'),grid,detail);
      stage.append(panel);stage.style.setProperty('--focus-scout-h',panel.offsetHeight+'px');
    }
    function scout(){
      if(!enemy || !String(step().opponentCue||'').trim() || scouting || replayControl)return;
      scouting=true;renderScoutCue();options.onModeChange?.();
    }
    function returnHome(){if(!scouting)return;scouting=false;renderScoutCue();options.onModeChange?.();}
    async function replay(onEnd) {
      if(disposed || replayControl)return false;
      const report=session.battle(); if(!report?.result?.events?.length)return false;
      const ctl=new AbortController();replayControl=ctl;held=null;ui.sel=null;ui.mode='battle';scouting=false;
      options.onModeChange?.();
      shell.dataset.phase='battle';node('unitpanel').hidden=true;node('choice-open').hidden=true;
      const go=node('go');go.querySelector('span').textContent='返回';go.querySelector('kbd').textContent='';
      const board=node('board');R.board.renderBoard(board,api,{mode:'battle'});decorateArena(board);renderScoutCue();
      try {
        await R.battle.playBattle(board.__field,report.result,{skip:ctl.signal,speed:2,noEndSound:true,
          spriteIndex:key=>DATA.units.sprite.map[key],spriteUrl:DATA.units.sprite.src});
      } finally {
        replayControl=null;ui.mode='plan';shell.dataset.phase='plan';
        if(!disposed){render();options.onModeChange?.();onEnd?.({stopped:ctl.signal.aborted,won:report.won});}
      }
      return true;
    }
    function keydown(e) {
      if(disposed || e.defaultPrevented || e.repeat || e.isComposing || e.keyCode===229 ||
        document.body.hasAttribute('data-tt-recording') || document.querySelector('dialog[open]') || R.panels.hasPanel())return;
      const current=profiles.current.actionFor(bindingFromEvent(e),'plan');
      if(typingTarget(e.target) && !(e.target.id==='route-contest-count' && current==='undo'))return;
      if(replayControl){if(e.code==='Escape' || current==='home' || current==='home2'){e.preventDefault();replayControl.abort();}return;}
      if(held==='remover' && e.code==='Escape'){e.preventDefault();select(null);return;}
      const viewingRival=options.isRouteScouting?.();
      const returnFromScout=viewingRival && (current==='home' || current==='home2');
      if(!current || options.readOnly || (!returnFromScout && e.code==='Space' && e.target.closest?.('button,summary') && !shell.contains(e.target)))return;
      if(viewingRival && !returnFromScout && current!=='undo' && !current.startsWith('scout'))return;
      const target=e.target.closest?.('[data-tt-tap],[data-tt-drop]');
      const loc=slot(hover) || slot(target?.dataset.ttTap) || slot(held);
      e.preventDefault();
      if(current==='undo')return options.onUndo?.();
      if(current==='home' || current==='home2'){options.onRouteScoutHome?.();return returnHome();}
      if(current.startsWith('scout')){
        if(options.onRouteScout)return options.onRouteScout(current.includes('Prev')?-1:1);
        return scout();
      }
      if(current==='fight')return options.onSubmit?.();
      if(/^buy[1-5]$/.test(current))return action('buy',{index:Number(current.slice(3))-1});
      if(current==='sell'){if(loc)action('sell',{from:loc});else toast('將游標移到要賣的棋子。');return;}
      if(current==='deploy'){
        if(!loc || !session.state[loc.zone][loc.index])return toast('將游標移到要調度的棋子。');
        const zone=loc.zone==='board'?'bench':'board';const index=session.state[zone].findIndex((p,i)=>!p && (zone!=='board' || i!==instrumentCell));
        if(index<0)return toast('沒有空格。');return action('move',{from:loc,to:{zone,index}});
      }
      handleNative(current);
    }
    const click=e=>{const act=e.target.closest('[data-act]')?.dataset.act;
      if(replayControl){if(act==='submit')replayControl.abort();return;}
      if(act==='submit'){options.onSubmit?.();}else if(act==='choose')choices();else if(act==='codex')R.panels.showCodex(api);
      else if(act==='odds'){const rows=Object.entries(DATA.rules.shopOdds).map(([lv,x])=>el('p','tt-num',{},'等級 '+lv+'　'+x.map(v=>v+'%').join('　')));R.panels.openPanel({title:'商店機率',body:[el('p','',{},'依序為一至五費。'),...rows]});}};
    shell.addEventListener('click',click);window.addEventListener('keydown',keydown);
    const offKeys=profiles.current.onChange(()=>{render();options.onHotkeyChange?.();});
    R.tooltip.bindTips(shell,api);R.panels.bindApi(api);
    const old=root.ResizeObserver && new ResizeObserver(()=>{if(disposed)return;const b=node('bench').getBoundingClientRect();node('unitpanel').style.setProperty('--tt-drawer-max', Math.max(145,innerHeight-b.bottom-4)+'px');});if(old)old.observe(node('bench'));
    render();
    return {render,settings,replay,openChoices:choices,getUndoLabel:()=>profiles.current.label('undo'),
      afterUndo(){held=null;hover=null;ui.sel=null;R.tooltip.hideTip();render();},
      canEdit:()=>!disposed && !options.readOnly && !replayControl && !R.panels.hasPanel(),
      destroy(){disposed=true;offKeys();replayControl?.abort();clearTimeout(timer);old?.disconnect();window.removeEventListener('keydown',keydown);R.tooltip.hideTip();R.panels.closePanels();shell.remove();}};
  }
  function swapIncomeText(before,after,cap) {
    const earned = coins => {
      const loss = root.SimEngine.interestForGold(coins,cap);
      const win = root.SimEngine.interestForGold(coins+1,cap);
      return win===loss ? loss+' 息' : '贏 '+win+' 息／輸 '+loss+' 息';
    };
    return '換牌前 '+before+' 金（'+earned(before)+'） → 現在 '+after+' 金（'+earned(after)+'）';
  }
  root.FocusNativeUI={mount,swapIncomeText};
})(globalThis);

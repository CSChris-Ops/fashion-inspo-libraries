/* Fashion Inspo Libraries — Mix & Match studio (the flagship view).
 *
 * Every item in every catalogue is a separate wearable piece (app/wardrobe.js)
 * drawn on its own layer on the avatar (app/avatar.js). Pieces can be mixed
 * inside one brand or across brands; every change re-scores the outfit and
 * every wardrobe card shows the match chance it would give.
 */
(function(){
  'use strict';
  const W=window.FIL.wardrobe,A=window.FIL.avatar;
  const TAB_SLOTS={outerwear:['outerwear'],layer:['layer'],top:['top'],bottom:['bottom'],shoes:['shoes'],accessories:['belt','watch','bag','eyewear']};
  const TAB_LABELS={outerwear:'Outerwear',layer:'Knit layers',top:'Tops',bottom:'Bottoms',shoes:'Shoes',accessories:'Accessories'};
  const TONE_COLOURS={strong:'#4f8a66',good:'#7d8b4e',risky:'#c19a45',clash:'#b25b4f',empty:'#9a9a94'};
  const STATE_KEY='fil-studio-v2';

  function mount(env){
    const $=s=>env.root.querySelector(s);
    const esc=env.esc;
    const listeners=new Set();
    const saved=env.prefs.get(STATE_KEY)||{};
    const state={
      ids:saved.ids||{},colours:saved.colours||{},locks:new Set(saved.locks||[]),tuck:saved.tuck!==false,open:saved.open!==false,
      avatar:{skin:1,hair:1,hairStyle:'side',build:'auto',...(saved.avatar||{})},
      mode:saved.mode||'crossover',brand:saved.brand||'',season:saved.season||'all',tab:saved.tab||'top',sort:saved.sort||'match',query:'',
      history:[],suggestions:null,suggestIndex:0,changed:null,oddsCache:null
    };
    let w=null;
    const thumbs=new Map();

    // ------------------------------------------------------------ helpers
    const slotsNow=()=>{const out={};for(const [slot,id] of Object.entries(state.ids)){const p=w&&w.resolve(id);if(p&&p.slot===slot)out[slot]=p}return out};
    const fit=()=>env.getFit()||{};
    const buildFactor=()=>{
      if(state.avatar.build!=='auto')return Number(state.avatar.build)||1;
      const f=fit();if(!f.height||!f.weight)return 1.02;
      const bmi=f.weight/((f.height/100)**2);return bmi<20?.94:bmi<25?1.02:bmi<29?1.1:1.16;
    };
    const ctx=()=>({season:state.season,height:fit().height,tuck:state.tuck,colours:state.colours});
    const scoreOf=slots=>W.score({slots,colours:state.colours,tuck:state.tuck},ctx());
    const usdOf=p=>env.toUSD(p.price.amount,p.price.currency);
    const priceLabel=p=>`${env.money(usdOf(p))}${p.price.basis==='estimated'?' est.':''}`;
    const persist=()=>env.prefs.set(STATE_KEY,{ids:state.ids,colours:state.colours,locks:[...state.locks],tuck:state.tuck,open:state.open,avatar:state.avatar,mode:state.mode,brand:state.brand,season:state.season,tab:state.tab,sort:state.sort});
    const emit=()=>{const o=api.outfit();listeners.forEach(fn=>{try{fn(o)}catch(e){console.error(e)}})};
    const snapshot=()=>({ids:{...state.ids},colours:{...state.colours},tuck:state.tuck,open:state.open});
    const pushHistory=()=>{state.history.push(snapshot());if(state.history.length>40)state.history.shift()};
    const brandsList=()=>w?[...new Map(w.pieces.map(p=>[p.brand,p.brandLabel])).entries()]:[];
    const activeBrand=()=>{
      if(state.mode!=='same-brand')return null;
      if(state.brand&&brandsList().some(([id])=>id===state.brand))return state.brand;
      const first=Object.values(slotsNow())[0];return first?first.brand:(brandsList()[0]||[])[0]||null;
    };
    const thumbOf=p=>{const key=`${p.id}|${state.colours[p.id]||''}`;if(!thumbs.has(key))thumbs.set(key,A.thumb(p,{colours:state.colours,palette:W.COLOURS}));return thumbs.get(key)};
    const toneOf=score=>score>=80?'strong':score>=65?'good':score>=50?'risky':'clash';

    // ------------------------------------------------------------ changing the outfit
    function setPiece(slot,piece,{record=true}={}){
      if(record)pushHistory();
      if(piece)state.ids[slot]=piece.id;else{delete state.ids[slot];state.locks.delete(slot)}
      state.changed=slot;state.suggestions=null;
      afterChange();
    }
    function toggle(piece){
      const current=state.ids[piece.slot];
      setPiece(piece.slot,current===piece.id?null:piece);
    }
    function applySlots(slots,{keep=[]}={}){
      pushHistory();
      const next={};
      for(const s of W.SLOTS){if(keep.includes(s)&&state.ids[s])next[s]=state.ids[s];else if(slots[s])next[s]=slots[s].id}
      state.ids=next;state.changed='all';
      afterChange();
    }
    function afterChange(){persist();renderStage();renderGrid();renderSummary();emit()}

    // ------------------------------------------------------------ stage
    function renderStage(){
      const slots=slotsNow();
      const svg=A.render({slots,colours:state.colours,tuck:state.tuck,open:state.open,avatar:{...state.avatar,build:buildFactor()}},{palette:W.COLOURS,label:'Your Mix & Match avatar'});
      const stage=$('#mmStage');stage.innerHTML=svg;
      if(state.changed){const sel=state.changed==='all'?'.av-piece':`.av-piece[data-slot="${state.changed}"]`;stage.querySelectorAll(sel).forEach(n=>n.classList.add('av-pop'));state.changed=null}
      const r=scoreOf(slots);
      const brandNote=r.brands.length>1?`Crossover · ${r.brands.length} brands`:r.brands.length===1?`Same brand · ${esc((brandsList().find(([id])=>id===r.brands[0])||[])[1]||'')}`:'No pieces yet';
      const bar=(label,v)=>`<div class="mm-bar"><span>${label}</span><i style="--v:${v}%"></i><b>${Math.round(v)}</b></div>`;
      $('#mmScore').innerHTML=`<div class="mm-ring" style="--p:${r.score};--c:${TONE_COLOURS[r.tone]}"><b>${r.score}<small>%</small></b></div>
        <div class="mm-score-copy"><strong>${esc(r.label)}</strong><span>${brandNote}</span><em>Match chance</em></div>
        <div class="mm-bars">${bar('Colour',r.parts.colour)}${bar('Formality',r.parts.formality)}${bar('Season',r.parts.season)}${bar('Proportion',r.parts.proportion)}</div>
        <ul class="mm-notes">${r.notes.slice(0,4).map(n=>`<li data-tone="${n.tone}">${esc(n.text)}</li>`).join('')}</ul>`;
      const tuckable=slots.top&&!['sweatshirt','sweater','halfzip','turtleneck','mockneck'].includes(slots.top.type);
      const tuckBtn=$('#mmTuck'),openBtn=$('#mmOpen');
      tuckBtn.setAttribute('aria-pressed',String(state.tuck));tuckBtn.textContent=state.tuck?'Top tucked in':'Top untucked';
      tuckBtn.disabled=!tuckable;tuckBtn.title=tuckable?'':slots.top?'Knitwear and sweatshirts are worn out':'Wear a shirt, tee or polo to tuck it in';
      openBtn.setAttribute('aria-pressed',String(state.open));openBtn.textContent=state.open?'Jacket open':'Jacket closed';
      openBtn.disabled=!slots.outerwear;openBtn.title=slots.outerwear?'':'Wear a jacket or coat first';
      stage.insertAdjacentHTML('beforeend',`<div class="mm-stage-badge" data-tone="${r.tone}"${r.score?'':' hidden'}><b>${r.score}%</b><span>${esc(r.label)}</span></div>`);
      $('#mmUndo').disabled=!state.history.length;
    }

    // ------------------------------------------------------------ wardrobe grid
    function candidates(tab){
      const brand=activeBrand(),q=state.query;
      return TAB_SLOTS[tab].flatMap(slot=>w.bySlot[slot]||[]).filter(p=>(!brand||p.brand===brand)&&(state.season==='all'||p.seasons.includes(state.season))&&(!q||`${p.name} ${p.brandLabel} ${p.typeLabel} ${p.colour.name}`.toLowerCase().includes(q)));
    }
    function renderTabs(){
      $('#mmTabs').innerHTML=Object.keys(TAB_SLOTS).map(tab=>{
        const n=candidates(tab).length,worn=TAB_SLOTS[tab].filter(s=>state.ids[s]).length;
        return`<button type="button" role="tab" data-mm-tab="${tab}" aria-selected="${state.tab===tab}" tabindex="${state.tab===tab?0:-1}">${TAB_LABELS[tab]}<span>${n}</span>${worn?'<i aria-label="piece equipped"></i>':''}</button>`;
      }).join('');
    }
    function renderGrid(){
      if(!w)return;
      renderTabs();
      const slots=slotsNow();
      const dressed=Object.values(slots).some(p=>!['watch','eyewear'].includes(p.slot));
      let list=candidates(state.tab).map(p=>{
        const trial={...slots,[p.slot]:p};
        return{p,chance:scoreOf(trial).score,worn:state.ids[p.slot]===p.id};
      });
      const sorters={match:(a,b)=>b.chance-a.chance||a.p.brandLabel.localeCompare(b.p.brandLabel)||a.p.name.localeCompare(b.p.name),low:(a,b)=>usdOf(a.p)-usdOf(b.p),high:(a,b)=>usdOf(b.p)-usdOf(a.p),brand:(a,b)=>a.p.brandLabel.localeCompare(b.p.brandLabel)||a.p.name.localeCompare(b.p.name)};
      list.sort(sorters[state.sort]||sorters.match);
      list.sort((a,b)=>b.worn-a.worn);
      const grid=$('#mmGrid');
      if(!list.length){grid.innerHTML=`<p class="mm-empty">No pieces match these filters. Try another season, clear the search or switch to Crossover.</p>`;return}
      let lastSlot=null;
      grid.innerHTML=list.map(({p,chance,worn})=>{
        const head=state.tab==='accessories'&&p.slot!==lastSlot?`<h4 class="mm-subhead">${W.SLOT_LABELS[p.slot]}</h4>`:'';lastSlot=p.slot;
        return`${head}<div class="mm-card${worn?' is-worn':''}"><button type="button" class="mm-card-main" data-mm-equip="${esc(p.id)}" aria-pressed="${worn}" aria-label="${worn?'Take off':'Wear'} ${esc(p.name)}, ${esc(p.brandLabel)}, match chance ${chance}%"><span class="mm-thumb">${thumbOf(p)}</span><span class="mm-name">${esc(p.name)}</span><span class="mm-meta">${esc(p.brandLabel)} · ${esc(priceLabel(p))}</span></button>${dressed||worn?`<span class="mm-chance" data-tone="${toneOf(chance)}" title="Match chance if you wear this">${chance}%</span>`:''}<button type="button" class="mm-info" data-mm-info="${esc(p.id)}" aria-label="Details for ${esc(p.name)}">i</button></div>`;
      }).join('');
      if(state.tab==='accessories'){const order=['belt','watch','bag','eyewear'];void order}
    }

    // ------------------------------------------------------------ summary (what is worn)
    function swatchesFor(p){
      const names=[...new Set([p.colour.name,...(W.PALETTES[p.type]||[]),'navy','charcoal','stone','white','black','dark brown'])].filter(n=>W.COLOURS[n]).slice(0,8);
      const current=state.colours[p.id]||p.colour.name;
      return names.map(n=>`<button type="button" class="mm-swatch" data-mm-colour="${esc(p.id)}" data-colour="${esc(n)}" style="--sw:${W.COLOURS[n].hex}" aria-pressed="${current===n}" aria-label="Preview in ${esc(n)}"></button>`).join('');
    }
    function renderSummary(){
      const slots=slotsNow(),rows=W.SLOTS.filter(s=>slots[s]).map(s=>slots[s]);
      const box=$('#mmSummary');
      if(!rows.length){box.innerHTML=`<div class="mm-summary-head"><h3>On the avatar</h3></div><p class="mm-empty">Nothing on yet. Tap any piece, press Shuffle, or Complete the look.</p>`;return}
      const total=rows.reduce((s,p)=>s+usdOf(p),0),est=rows.some(p=>p.price.basis==='estimated');
      box.innerHTML=`<div class="mm-summary-head"><h3>On the avatar</h3><strong>${esc(env.money(total))}</strong></div>
        <ul class="mm-worn">${rows.map(p=>`<li><span class="mm-mini">${thumbOf(p)}</span><div class="mm-worn-copy"><b>${esc(p.name)}</b><small>${esc(W.SLOT_LABELS[p.slot])} · ${esc(p.brandLabel)} · ${esc(priceLabel(p))}${p.colour.source==='default'&&!state.colours[p.id]?' · illustrative colour':''}${state.colours[p.id]?` · previewing ${esc(state.colours[p.id])}`:''}</small><div class="mm-swatches">${swatchesFor(p)}${state.colours[p.id]?`<button type="button" class="mm-swatch-reset" data-mm-colour-reset="${esc(p.id)}">Reset colour</button>`:''}</div></div><div class="mm-worn-actions"><button type="button" data-mm-lock="${p.slot}" aria-pressed="${state.locks.has(p.slot)}" title="Keep this piece when shuffling">${state.locks.has(p.slot)?'Locked':'Lock'}</button><a href="${esc(env.safeUrl(p.url))}" target="_blank" rel="noreferrer" aria-label="Shop ${esc(p.name)}">Shop ↗</a><button type="button" data-mm-remove="${p.slot}" aria-label="Take off ${esc(p.name)}">×</button></div></li>`).join('')}</ul>
        <p class="mm-fine">${est?'Prices marked “est.” are estimated from the formula basket. ':''}Colour previews are visual only — check what the retailer actually stocks.</p>
        <div class="mm-summary-actions"><button type="button" id="mmSave" class="primary">Save outfit</button><button type="button" id="mmShare">Copy outfit link</button></div>`;
    }

    // ------------------------------------------------------------ odds
    const compact=n=>n>=1e9?`${(n/1e9).toFixed(1)}B`:n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:String(n);
    function renderOdds(force){
      const box=$('#mmOdds');if(!w)return;
      const key=`${state.season}|${w.pieces.length}|${Object.keys(state.colours).length}`;
      if(!force&&state.oddsCache&&state.oddsCache.key===key){paint(state.oddsCache.data);return}
      box.innerHTML=`<div class="mm-odds-head"><h3>Match odds</h3><span>Calculating…</span></div>`;
      const run=()=>{const data=W.odds(w,{samples:1500,season:state.season==='all'?null:state.season,ctx:{height:fit().height}});state.oddsCache={key,data};paint(data)};
      ('requestIdleCallback' in window)?requestIdleCallback(run,{timeout:1500}):setTimeout(run,60);
      function paint(d){
        const pct=v=>`${Math.round(v*100)}%`;
        const row=(label,g,brand)=>`<tr><th scope="row">${esc(label)}</th><td>${compact(g.combinations)}</td><td>${pct(g.good)}</td><td>${pct(g.strong)}</td><td>${g.average}</td><td>${g.best?`<button type="button" data-mm-best="${esc(brand)}">Try best</button>`:''}</td></tr>`;
        box.innerHTML=`<div class="mm-odds-head"><h3>Match odds</h3><span>${state.season==='all'?'All seasons':esc(state.season)} · ${d.samplesPerGroup.toLocaleString('en-US')} random outfits per group</span></div>
          <div class="mm-odds-scroll"><table><thead><tr><th scope="col">Mix</th><th scope="col">Outfits possible</th><th scope="col">Good or better</th><th scope="col">Strong</th><th scope="col">Avg</th><th scope="col"><span class="sr-only">Load outfit</span></th></tr></thead><tbody>${d.brands.map(b=>row(`${b.label} only`,b,b.brand)).join('')}${row('Crossover (2+ brands)',d.crossover,'__crossover')}</tbody></table></div>
          <p class="mm-fine">“Good” means a match chance of 65% or more, “Strong” 80% or more, using the same rules as the live score. Outfits counted as top × bottoms × shoes × (outerwear or none).</p>`;
        box._data=d;
      }
    }

    // ------------------------------------------------------------ piece details
    const pieceDialog=document.getElementById('pieceDialog');
    function openPiece(id){
      const p=w.resolve(id);if(!p)return;
      if(p.productId&&env.openProduct(p.productId))return;
      const worn=state.ids[p.slot]===p.id;
      document.getElementById('pieceVisual').innerHTML=A.thumb(p,{colours:state.colours,palette:W.COLOURS});
      document.getElementById('pieceBrand').textContent=`${p.brandLabel} · ${W.SLOT_LABELS[p.slot]} · ${p.typeLabel}`;
      document.getElementById('pieceName').textContent=p.name;
      document.getElementById('piecePrice').textContent=priceLabel(p);
      const sources=[...new Map(p.sources.map(s=>[s.id,s])).values()];
      document.getElementById('pieceFacts').innerHTML=[
        ['Colour',`${p.colour.name}${p.colour.source==='default'?' (illustrative)':''}`],['Fit',p.fit||p.length||'—'],['Material',p.material||'—'],['Seasons',p.seasons.join(', ')],
        ['Price basis',p.price.basis==='catalogue'?'Catalogue price':p.price.basis==='reference'?'Reference price':'Estimated share of the formula basket'],
        ['Appears in',sources.slice(0,4).map(s=>s.title).join(' · ')+(sources.length>4?` +${sources.length-4} more`:'')]
      ].map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      document.getElementById('pieceWear').textContent=worn?'Take off':'Wear it';
      document.getElementById('pieceWear').dataset.piece=p.id;
      document.getElementById('pieceShop').href=env.safeUrl(p.url);
      if(!pieceDialog.open)pieceDialog.showModal();
    }
    document.getElementById('pieceClose').addEventListener('click',()=>pieceDialog.close());
    pieceDialog.addEventListener('click',e=>{if(e.target===pieceDialog)pieceDialog.close()});
    document.getElementById('pieceWear').addEventListener('click',e=>{const p=w.resolve(e.currentTarget.dataset.piece);if(p)toggle(p);pieceDialog.close()});

    // ------------------------------------------------------------ avatar options
    function renderAvatarOpts(){
      const a=state.avatar;
      const sw=(key,list)=>list.map((c,i)=>`<button type="button" class="mm-swatch" data-mm-avatar="${key}" data-value="${i}" style="--sw:${c}" aria-pressed="${a[key]===i}" aria-label="${key==='skin'?'Skin tone':'Hair colour'} ${i+1} of ${list.length}"></button>`).join('');
      const builds=[['auto','From fit settings'],['0.94','Slim'],['1.02','Regular'],['1.1','Broad']];
      $('#mmAvatarOpts').innerHTML=`<div><span>Skin</span>${sw('skin',A.SKINS)}</div><div><span>Hair</span>${sw('hair',A.HAIRS)}</div>
        <div><span>Style</span>${A.HAIR_STYLES.map(s=>`<button type="button" class="mm-chip" data-mm-avatar="hairStyle" data-value="${s}" aria-pressed="${a.hairStyle===s}">${s==='crop'?'Crop':s==='side'?'Side part':'Wave'}</button>`).join('')}</div>
        <div><span>Build</span>${builds.map(([v,l])=>`<button type="button" class="mm-chip" data-mm-avatar="build" data-value="${v}" aria-pressed="${String(a.build)===v}">${l}</button>`).join('')}</div>`;
    }

    // ------------------------------------------------------------ toolbar
    function renderToolbar(){
      env.root.querySelectorAll('[data-mm-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mmMode===state.mode)));
      const sel=$('#mmBrand');sel.hidden=state.mode!=='same-brand';
      sel.innerHTML=brandsList().map(([id,label])=>`<option value="${esc(id)}"${id===activeBrand()?' selected':''}>${esc(label)}</option>`).join('');
      $('#mmSeason').value=state.season;$('#mmSort').value=state.sort;
      $('#studioCount').textContent=w?`${w.pieces.length} pieces from ${brandsList().length} catalogues`:'';
    }

    // In same-brand mode, pieces from other brands (even locked ones) are not kept.
    const brandName=id=>(brandsList().find(([b])=>b===id)||[])[1]||'';
    function brandSafeKeep(slotList){
      const worn=slotsNow(),brand=state.mode==='same-brand'?activeBrand():null;
      const locked={},keep=[];let dropped=0;
      const accessories=['watch','bag','eyewear'];
      for(const s of new Set([...slotList,...accessories])){
        const p=worn[s];if(!p)continue;
        if(brand&&p.brand!==brand){dropped++;state.locks.delete(s);continue}
        if(slotList.includes(s))locked[s]=p;keep.push(s);
      }
      return{locked,keep,dropped};
    }

    // ------------------------------------------------------------ events
    env.root.addEventListener('click',e=>{
      const t=e.target.closest('button,a');if(!t||!env.root.contains(t))return;
      const d=t.dataset;
      if(d.mmEquip){const p=w.resolve(d.mmEquip);if(p)toggle(p);return}
      if(d.mmInfo){openPiece(d.mmInfo);return}
      if(d.mmTab){state.tab=d.mmTab;persist();renderGrid();return}
      if(d.mmMode){state.mode=d.mmMode;state.suggestions=null;if(state.mode==='same-brand'&&!state.brand)state.brand=activeBrand()||'';persist();renderToolbar();renderGrid();return}
      if(d.mmRemove){setPiece(d.mmRemove,null);return}
      if(d.mmLock){state.locks.has(d.mmLock)?state.locks.delete(d.mmLock):state.locks.add(d.mmLock);persist();renderSummary();return}
      if(d.mmColour){pushHistory();state.colours[d.mmColour]=d.colour;state.changed=(w.resolve(d.mmColour)||{}).slot;afterChange();return}
      if(d.mmColourReset){pushHistory();delete state.colours[d.mmColourReset];state.changed=(w.resolve(d.mmColourReset)||{}).slot;afterChange();return}
      if(d.mmAvatar){const v=d.mmAvatar==='hairStyle'||d.mmAvatar==='build'&&d.value==='auto'?d.value:Number(d.value);state.avatar[d.mmAvatar]=d.mmAvatar==='build'&&d.value!=='auto'?d.value:v;persist();renderAvatarOpts();renderStage();return}
      if(d.mmBest){const g=d.mmBest==='__crossover'?$('#mmOdds')._data.crossover:$('#mmOdds')._data.brands.find(b=>b.brand===d.mmBest);if(g&&g.best){const slots={};g.best.pieces.forEach(id=>{const p=w.resolve(id);if(p)slots[p.slot]=p});applySlots(slots,{keep:['watch','bag','eyewear']});env.toast(`Loaded the best sampled ${d.mmBest==='__crossover'?'crossover':g.label} outfit · ${g.best.score}%.`)}return}
      switch(t.id){
        case'mmShuffle':{
          const {locked,keep,dropped}=brandSafeKeep([...state.locks]);
          const r=W.shuffle(w,{locked,mode:state.mode,brand:activeBrand(),season:state.season==='all'?null:state.season,ctx:ctx()});
          if(r){applySlots(r.slots,{keep});env.toast(`${r.label} · ${r.score}% match chance${r.brands.length>1?` · ${r.brands.length} brands`:''}.${dropped?` Swapped ${dropped} piece${dropped>1?'s':''} from other brands to keep it ${brandName(activeBrand())}-only.`:''}`,{timeout:3600})}
          break}
        case'mmComplete':{
          const sig=W.SLOTS.map(s=>state.ids[s]||'').join('|');
          // Pressing again right after a completion cycles through alternatives built
          // from the same starting pieces, instead of "completing" the finished outfit.
          if(!state.suggestions||state.suggestions.sig!==sig){
            const {locked:base,dropped}=brandSafeKeep(Object.keys(slotsNow()));
            if(dropped)env.toast(`Same brand: ${dropped} piece${dropped>1?'s':''} from other brands will be replaced.`,{timeout:2600});
            const list=W.suggest(w,{locked:base,mode:state.mode,brand:activeBrand(),season:state.season==='all'?null:state.season,count:6,ctx:ctx()});
            state.suggestions={sig:null,list,baseSlots:Object.keys(base)};state.suggestIndex=0;
          }else state.suggestIndex=(state.suggestIndex+1)%state.suggestions.list.length;
          const pickR=state.suggestions.list[state.suggestIndex];
          if(pickR){
            const {list,baseSlots}=state.suggestions,idx=state.suggestIndex;
            applySlots(pickR.slots,{keep:baseSlots});
            state.suggestions={sig:W.SLOTS.map(s=>state.ids[s]||'').join('|'),list,baseSlots};state.suggestIndex=idx;
            env.toast(list.length>1?`Option ${idx+1} of ${list.length} · ${pickR.score}% match chance. Press again for another.`:`${pickR.score}% match chance.`,{timeout:3200});
          }else env.toast('No combination fits these filters — try another season or Crossover.');
          break}
        case'mmUndo':{const prev=state.history.pop();if(prev){Object.assign(state,prev);state.changed='all';persist();renderStage();renderGrid();renderSummary();emit()}break}
        case'mmReset':pushHistory();state.ids={};state.locks.clear();state.changed='all';afterChange();break;
        case'mmTuck':pushHistory();state.tuck=!state.tuck;state.changed='top';afterChange();break;
        case'mmOpen':pushHistory();state.open=!state.open;state.changed='outerwear';afterChange();break;
        case'mmOddsRun':renderOdds(true);break;
        case'mmSave':{const r=scoreOf(slotsNow());env.saveOutfit({ids:{...state.ids},colours:{...state.colours},tuck:state.tuck,open:state.open,score:r.score});break}
        case'mmShare':{
          const url=`${location.origin}${location.pathname}#studio?o=${encodeURIComponent(Object.values(state.ids).join('~'))}&t=${state.tuck?1:0}&j=${state.open?1:0}`;
          (navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(()=>env.toast('Outfit link copied.')).catch(()=>{prompt('Copy this outfit link:',url)});
          break}
      }
    });
    $('#mmTabs').addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const tabs=Object.keys(TAB_SLOTS),i=tabs.indexOf(state.tab);
      const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      e.preventDefault();state.tab=tabs[next];persist();renderGrid();$(`[data-mm-tab="${tabs[next]}"]`).focus();
    });
    $('#mmSearch').addEventListener('input',e=>{clearTimeout(mount._t);mount._t=setTimeout(()=>{state.query=e.target.value.trim().toLowerCase();renderGrid()},120)});
    $('#mmSort').addEventListener('change',e=>{state.sort=e.target.value;persist();renderGrid()});
    $('#mmSeason').addEventListener('change',e=>{state.season=e.target.value;state.suggestions=null;persist();renderStage();renderGrid();renderOdds()});
    $('#mmBrand').addEventListener('change',e=>{state.brand=e.target.value;state.suggestions=null;persist();renderGrid()});

    // ------------------------------------------------------------ public surface
    const toSlots=input=>{
      if(!input)return slotsNow();
      if(Array.isArray(input)){const s={};input.forEach(id=>{const p=w.resolve(id);if(p)s[p.slot]=p});return s}
      const s={};for(const [slot,v] of Object.entries(input.slots||input)){const p=typeof v==='string'?w.resolve(v):v;if(p)s[slot]=p}return s;
    };
    const plain=p=>p&&JSON.parse(JSON.stringify(p));
    const api={
      refresh(catalogues){
        w=W.build(catalogues);thumbs.clear();state.oddsCache=null;
        for(const [slot,id] of Object.entries(state.ids)){const p=w.resolve(id);if(p&&p.slot===slot)state.ids[slot]=p.id;else delete state.ids[slot]}
        renderToolbar();renderAvatarOpts();renderStage();renderGrid();renderSummary();
        if(!env.root.hidden)renderOdds();
      },
      shown(){renderOdds()},
      wardrobe:()=>w,
      pieces:(filter={})=>w.pieces.filter(p=>(!filter.slot||p.slot===filter.slot)&&(!filter.brand||p.brand===filter.brand)&&(!filter.season||p.seasons.includes(filter.season))&&(!filter.type||p.type===filter.type)).map(plain),
      piece:id=>plain(w&&w.resolve(id)),
      outfit:()=>{const slots=slotsNow();return{pieces:Object.fromEntries(Object.entries(slots).map(([s,p])=>[s,p.id])),colours:{...state.colours},tuck:state.tuck,open:state.open,...scoreOf(slots)}},
      equip(ids,{replace=false}={}){const list=(Array.isArray(ids)?ids:[ids]).map(id=>w.resolve(id)).filter(Boolean);if(!list.length)return false;pushHistory();if(replace)state.ids={};list.forEach(p=>{state.ids[p.slot]=p.id});state.changed='all';afterChange();return true},
      remove(slot){setPiece(slot,null)},
      clear(){pushHistory();state.ids={};state.locks.clear();state.changed='all';afterChange()},
      score:input=>scoreOf(toSlots(input)),
      suggest:(opts={})=>W.suggest(w,{locked:toSlots(opts.locked||{}),mode:opts.mode||'crossover',brand:opts.brand||null,season:opts.season||null,count:opts.count||5,ctx:ctx()}).map(r=>({score:r.score,label:r.label,brands:r.brands,pieces:Object.fromEntries(Object.entries(r.slots).map(([s,p])=>[s,p.id]))})),
      shuffle:(opts={})=>{const r=W.shuffle(w,{mode:opts.mode||'crossover',brand:opts.brand||null,season:opts.season||null,seed:opts.seed,ctx:ctx()});return r&&{score:r.score,label:r.label,brands:r.brands,pieces:Object.fromEntries(Object.entries(r.slots).map(([s,p])=>[s,p.id]))}},
      odds:(opts={})=>W.odds(w,{samples:opts.samples||1500,season:opts.season||null}),
      svg:(input,opts={})=>A.render({slots:toSlots(input),colours:state.colours,tuck:state.tuck,open:state.open,avatar:{...state.avatar,build:buildFactor()}},{palette:W.COLOURS,...opts}),
      thumbnail:id=>{const p=w.resolve(id);return p?A.thumb(p,{palette:W.COLOURS}):null},
      tryAliases(ids){return api.equip(ids,{replace:true})},
      tryFormula(formulaId){return api.equip(w.byFormula[formulaId]||[],{replace:true})},
      trySeasonal(lookId){return api.equip(w.bySeasonal[lookId]||[],{replace:true})},
      load(outfit){pushHistory();state.ids={...(outfit.ids||{})};state.colours={...state.colours,...(outfit.colours||{})};if(outfit.tuck!==undefined)state.tuck=outfit.tuck;if(outfit.open!==undefined)state.open=outfit.open;state.changed='all';afterChange()},
      priceUSD:ids=>Object.values(ids||{}).map(id=>w&&w.resolve(id)).filter(Boolean).reduce((s,p)=>s+usdOf(p),0),
      describe:ids=>Object.values(ids||{}).map(id=>w&&w.resolve(id)).filter(Boolean),
      on:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
      openLink(hash){
        const m=/^#studio\?(.*)$/.exec(hash||'');if(!m)return false;
        const q=new URLSearchParams(m[1]);const ids=(q.get('o')||'').split('~').filter(Boolean);
        if(q.has('t'))state.tuck=q.get('t')!=='0';if(q.has('j'))state.open=q.get('j')!=='0';
        return ids.length?api.equip(ids,{replace:true}):false;
      }
    };
    return api;
  }
  window.FIL=window.FIL||{};
  window.FIL.studio={mount};
})();

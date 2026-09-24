/* Fashion Inspo Libraries — page rendering.
 * Everything below renders from the catalogues held by FIL.sync, so a catalogue
 * update (from the pipeline, another tab, an import or a local correction)
 * re-renders in place without a reload and without losing filters or saves.
 */
(function(){
  'use strict';
  const {store,sync}=window.FIL;
  const prefs=store.prefs;
  const $=selector=>document.querySelector(selector);
  const $$=selector=>[...document.querySelectorAll(selector)];

  // ---------------------------------------------------------------- safety helpers
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  const safeUrl=url=>typeof url==='string'&&/^https:\/\//i.test(url)?url:'#';
  const safeAsset=url=>typeof url==='string'&&(/^assets\/[\w.\-/]+$/.test(url)||/^https:\/\//i.test(url))?url:'';
  // Advice copy may carry <strong> emphasis; everything else is escaped.
  const rich=value=>esc(value).replace(/&lt;strong&gt;([\s\S]*?)&lt;\/strong&gt;/g,'<strong>$1</strong>');
  const cap=value=>value?value[0].toUpperCase()+value.slice(1):'';
  const withTransition=change=>{try{if(document.startViewTransition&&document.visibilityState==='visible')return document.startViewTransition(change)}catch{}change()};

  // ---------------------------------------------------------------- toasts
  const toastRegion=$('#toastRegion');
  function toast(message,{action,onAction,timeout=5200}={}){
    const node=document.createElement('div');node.className='toast';
    node.innerHTML=`<span>${esc(message)}</span>${action?`<button type="button">${esc(action)}</button>`:''}`;
    if(action)node.querySelector('button').addEventListener('click',()=>{onAction&&onAction();node.remove()});
    toastRegion.append(node);
    while(toastRegion.children.length>3)toastRegion.firstElementChild.remove();
    setTimeout(()=>node.remove(),timeout);
  }

  // ---------------------------------------------------------------- currency
  const currencySelect=$('#currencySelect'),rateStatus=$('#rateStatus');
  const legacyCurrency=prefs.raw('fashion-currency');
  let displayCurrency=(()=>{try{return JSON.parse(legacyCurrency)}catch{return legacyCurrency}})()||'USD';
  if(![...currencySelect.options].some(o=>o.value===displayCurrency))displayCurrency='USD';
  currencySelect.value=displayCurrency;
  const cachedRates=prefs.get('fil-rates');
  let rates={USD:1,AMD:364.47,IDR:17790.47,MYR:4.08,EUR:.86,...(cachedRates&&cachedRates.rates||{})};
  const locales={IDR:'id-ID',AMD:'hy-AM',MYR:'ms-MY',USD:'en-US'};
  const toUSD=(amount,currency)=>Number(amount)/(rates[currency||'USD']||1);
  const formatIn=(value,currency,digits)=>{try{return new Intl.NumberFormat(locales[currency]||'en-US',{style:'currency',currency,maximumFractionDigits:digits??(currency==='USD'||currency==='MYR'||currency==='EUR'?2:0)}).format(value)}catch{return`${Math.round(value)} ${currency}`}};
  const money=(usd,digits)=>formatIn(Number(usd)*(rates[displayCurrency]||1),displayCurrency,digits);
  const native=(amount,currency)=>currency==='USD'?`$${Number(amount).toFixed(2)}`:`${Math.round(Number(amount)).toLocaleString('en-US')} ${currency}`;
  const priceHTML=(amount,currency)=>currency===displayCurrency?esc(native(amount,currency)):`${esc(money(toUSD(amount,currency)))}<span class="price-native">${esc(native(amount,currency))}</span>`;

  // ---------------------------------------------------------------- fit profile
  const profileKey='fashion-inspo-profile-v1';
  const fitDialog=$('#fitDialog'),fitForm=$('#fitForm'),heightInput=$('#heightInput'),weightInput=$('#weightInput'),fitError=$('#fitError');
  let hasFitProfile=false;
  const getFitGuidance=(height,weight)=>{
    const bmi=weight/((height/100)**2);
    let top='M',trouser='40–42 EU';
    if(bmi<19.5){top='S–M';trouser='38–40 EU'}else if(bmi<25){top='M';trouser='40–42 EU'}else if(bmi<29){top='M–L';trouser='42–44 EU'}else{top='L–XL';trouser='44–46 EU'}
    let hem='Regular · minimal break',lengthCopy='regular lengths with a clean, minimal trouser break';
    if(height<168){hem='Short · no break';lengthCopy='short or altered lengths with little to no trouser break'}
    else if(height>=182){hem='Long · slight break';lengthCopy='regular-long lengths with a controlled slight trouser break'}
    return{top,trouser,hem,lengthCopy};
  };
  const validFit=(h,w)=>Number.isFinite(h)&&Number.isFinite(w)&&h>=140&&h<=210&&w>=40&&w<=160;
  const applyFitProfile=profile=>{
    const height=Number(profile&&profile.height),weight=Number(profile&&profile.weight);
    if(!validFit(height,weight))return false;
    const g=getFitGuidance(height,weight);
    hasFitProfile=true;heightInput.value=height;weightInput.value=weight;
    $('#userMetrics').textContent=`${height} cm · ${weight} kg`;
    const setFit=$('#fitBriefSet');if(setFit)setFit.hidden=true;
    $('#fitTop').textContent=g.top;$('#fitTrouser').textContent=g.trouser;$('#fitHem').textContent=g.hem;
    $('#fitRuleStart').textContent=`Begin around ${g.top} for tops and outerwear and ${g.trouser} for trousers. This is a starting point only—compare the product measurements with a garment you already own.`;
    $('#fitRuleLength').textContent=`At ${height} cm, prioritize ${g.lengthCopy}. Tailor wide-leg styles when the fabric pools over the shoe.`;
    return true;
  };
  const openFitSettings=()=>{fitError.textContent='';if(!fitDialog.open)fitDialog.showModal();setTimeout(()=>heightInput.focus(),80)};
  const skipFit=()=>{try{sessionStorage.setItem('fil-fit-skipped','1')}catch{}fitDialog.close()};
  fitForm.addEventListener('submit',event=>{
    event.preventDefault();
    const height=Number(heightInput.value),weight=Number(weightInput.value);
    if(!heightInput.value||!weightInput.value||!validFit(height,weight)){fitError.textContent='Enter a height from 140–210 cm and a weight from 40–160 kg, or skip for now.';return}
    prefs.set(profileKey,{height,weight});applyFitProfile({height,weight});fitDialog.close();
  });
  $('#fitSkip').addEventListener('click',skipFit);
  fitDialog.addEventListener('cancel',()=>{if(!hasFitProfile)skipFit()});
  $('#fitSettings').addEventListener('click',openFitSettings);
  const params=new URLSearchParams(location.search);
  if(!applyFitProfile(prefs.get(profileKey))){
    let skipped=false;try{skipped=sessionStorage.getItem('fil-fit-skipped')==='1'}catch{}
    if(params.has('preview'))applyFitProfile({height:175,weight:75});else if(!skipped)setTimeout(openFitSettings,120);
  }

  // ---------------------------------------------------------------- sticky offsets
  const topbar=$('#topbar');
  const setTopbarOffset=()=>document.documentElement.style.setProperty('--topbar-h',`${Math.ceil(topbar.getBoundingClientRect().height)+14}px`);
  if('ResizeObserver' in window)new ResizeObserver(setTopbarOffset).observe(topbar);setTopbarOffset();

  // ---------------------------------------------------------------- data model
  let catalogues=[],productIndex=new Map(),catalogueIndex=new Map();
  const labelOf=id=>id==='both'?'All brands':(catalogueIndex.get(id)||{}).label||id;
  function rebuild(){
    catalogues=sync.effectiveCatalogues();
    catalogueIndex=new Map(catalogues.map(c=>[c.id,c]));
    productIndex=new Map();
    for(const cat of catalogues)for(const product of cat.products||[])productIndex.set(product.id,{product,cat});
  }

  // ---------------------------------------------------------------- saved (unified: looks, formulas, boards)
  const SAVED_KEY='fil-saved-v2';
  const saved=new Set(prefs.get(SAVED_KEY)||(()=>{
    // migrate the two earlier save lists
    const keys=[];
    (prefs.get('seasonal-wardrobe-saved')||[]).forEach(key=>keys.push(`look:${key.includes(':')?key:`massimo:${key}`}`));
    (prefs.get('fashion-lookboards-saved')||[]).forEach(key=>keys.push(`board:${key}`));
    return keys;
  })());
  const persistSaved=()=>{prefs.set(SAVED_KEY,[...saved]);sync.broadcastUser(SAVED_KEY)};
  const liteLooks=new Set(),liteBoards=new Set();

  // ---------------------------------------------------------------- filters
  const ui={season:'all',budget:Infinity,category:'seasons',brand:'both',query:'',formulaLimit:24};
  const library=$('#styleLibrary'),resultsNote=$('#resultsNote');
  const BUDGETS=[Infinity,300,500,800];
  function renderBudgets(){
    // Tier labels are rounded to tidy numbers in the display currency.
    const nice=usd=>{const local=usd*(rates[displayCurrency]||1),step=10**Math.max(0,Math.floor(Math.log10(local))-1);return Math.round(local/step)*step/(rates[displayCurrency]||1)};
    $('#budgetGroup').innerHTML=BUDGETS.map(v=>{const tier=v===Infinity?v:nice(v);if(ui.budget!==Infinity&&Math.abs(ui.budget-tier)>1e-6&&Math.abs(ui.budget-v)<v*.2)ui.budget=tier;return`<button class="filter budget-filter" type="button" data-budget="${tier}" aria-pressed="${ui.budget===tier}">${v===Infinity?'Any':`≤ ${esc(money(tier,0))}`}</button>`}).join('');
  }
  const matchesQuery=text=>!ui.query||text.toLowerCase().includes(ui.query);

  function renderBrandSwitch(){
    if(ui.brand!=='both'&&!catalogueIndex.has(ui.brand))ui.brand='both';
    library.dataset.brand=ui.brand;
    $('#brandSwitch').innerHTML=`<button class="brand-mode" type="button" data-brand-mode="both" aria-pressed="${ui.brand==='both'}">All brands</button>`+catalogues.map(cat=>{
      const logo=cat.logo&&safeAsset(cat.logo.src);
      return logo?`<button class="brand-mode brand-logo-button" type="button" data-brand-mode="${esc(cat.id)}" aria-pressed="${ui.brand===cat.id}" aria-label="${esc(cat.label)}"><span class="brand-logo-crop ${esc(cat.logo.class||'')}" aria-hidden="true"><img src="${esc(logo)}" alt=""></span><span class="sr-only">${esc(cat.label)}</span></button>`
        :`<button class="brand-mode brand-text-button" type="button" data-brand-mode="${esc(cat.id)}" aria-pressed="${ui.brand===cat.id}">${esc(cat.label)}</button>`;
    }).join('');
  }

  // ---------------------------------------------------------------- seasonal looks
  const lookKey=(cat,look)=>`look:${cat.id}:${look.season}`;
  const lookPrice=(cat,look)=>liteLooks.has(lookKey(cat,look))?look.lite:look.full;
  function seasonalLooks(){
    const out=[];
    for(const cat of catalogues)for(const look of cat.seasonal||[])out.push({cat,look});
    const order=['spring','summer','fall','winter'];
    return out.sort((a,b)=>order.indexOf(a.look.season)-order.indexOf(b.look.season));
  }
  function lookCard({cat,look}){
    const key=lookKey(cat,look),lite=liteLooks.has(key),isSaved=saved.has(key),currency=look.currency||cat.currency;
    const noLite=look.full===look.lite;
    const image=safeAsset(look.image);
    return`<article class="look ${esc(look.season)}${lite?' is-lite':''}" id="look-${esc(cat.id)}-${esc(look.season)}" data-season="${esc(look.season)}" data-brand-item="${esc(cat.id)}" data-title="${esc(look.title)}">
      <button class="visual" type="button" data-full="${esc(image)}" aria-label="Open full-body ${esc(cat.label)} ${esc(look.season)} model"><img src="${esc(image)}" alt="Full-body AI model visualizing the ${esc(cat.label)} ${esc(look.season)} outfit" loading="lazy" decoding="async"><span class="season-tab">${esc(cap(look.season))}${look.range?` · ${esc(look.range)}`:''}</span><span class="zoom-hint">Full look ↗</span><span class="brand-tab">${esc(cat.label)}</span></button>
      <div class="content"><h2>${esc(look.title)}</h2><p class="occasion">${esc(look.occasion)}</p>
        <ul class="items">${(look.items||[]).map(item=>`<li${item.optional?' data-layer="optional"':''}><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noreferrer">${esc(item.name)}<span class="item-note">${esc(item.note)}</span></a><span class="price">${priceHTML(item.price,currency)}</span></li>`).join('')}</ul>
        <div class="total"><span>${lite?'Lighter version':'Complete outfit'}</span><b>${esc(money(toUSD(lite?look.lite:look.full,currency)))}</b></div>
        <div class="card-actions"><button class="card-action" type="button" data-save="${esc(key)}" aria-pressed="${isSaved}">${isSaved?'Saved ✓':'Save look'}</button><button class="card-action" type="button" data-lite="${esc(key)}" aria-pressed="${lite}"${noLite?` disabled title="Every layer is recommended for this look"`:''}>${noLite?(look.season==='winter'?'Winter-ready':'All layers needed'):lite?'Restore full set':'Lighter version'}</button><button class="card-action try-on" type="button" data-try-look="${esc(look.id)}">Try on in Mix &amp; Match</button></div>
        <aside class="advice"><h3>${esc(look.advice_title||'Styling cue')}</h3><p>${rich(look.advice)}</p></aside>
      </div></article>`;
  }

  // ---------------------------------------------------------------- formulas
  function formulaMatches(){
    const out=[];
    for(const cat of catalogues){
      if(ui.brand!=='both'&&cat.id!==ui.brand)continue;
      for(const f of cat.formulas||[]){
        if(!f.categories.includes(ui.category))continue;
        if(ui.season!=='all'&&!f.seasons.includes(ui.season))continue;
        if(!matchesQuery(`${f.title} ${f.rule} ${(f.pieces||[]).join(' ')} ${cat.label}`))continue;
        out.push({cat,f});
      }
    }
    return out;
  }
  function formulaCard({cat,f}){
    const key=`formula:${f.id}`,isSaved=saved.has(key),image=safeAsset(f.image);
    const seasonLabel=f.seasons.map(cap).join(' / ');
    const basket=f.basket?(f.basket.currency===displayCurrency?native(f.basket.amount,f.basket.currency):`${money(toUSD(f.basket.amount,f.basket.currency))} (${native(f.basket.amount,f.basket.currency)})`):'';
    return`<article class="formula" data-brand-item="${esc(cat.id)}" data-title="${esc(`${f.title} · ${cat.label}`)}">
      <button class="formula-visual" type="button" data-full="${esc(image)}" aria-label="Open full-body ${esc(cat.label)} ${esc(f.title)} model"><img src="${esc(image)}" alt="Full-body AI model visualizing the ${esc(cat.label)} ${esc(f.title)} outfit" loading="lazy" decoding="async"><span class="zoom-hint">Full look</span></button>
      <div class="formula-top"><div><span class="formula-season">${esc(seasonLabel)}</span><h3>${esc(f.title)}</h3></div><span class="brand-badge">${esc(cat.label)}</span></div>
      <p class="formula-rule">${esc(f.rule)}</p>
      <div class="tone-row" aria-label="Colour palette">${(cat.tones||[]).filter(t=>/^#[0-9a-f]{3,8}$/i.test(t)).map(t=>`<span class="tone" style="--tone:${t}"></span>`).join('')}</div>
      <div class="brand-pair"><div class="brand-block" data-brand="${esc(cat.id)}"><b>${esc(cat.label)} only</b><span>${esc((f.pieces||[]).join(' · '))}</span><span><strong>Complete basket: ${esc(basket)}</strong></span><a href="${esc(safeUrl(cat.home_url))}" target="_blank" rel="noreferrer">Shop ${esc(cat.label)} ↗</a></div></div>
      <div class="formula-actions"><button type="button" data-save="${esc(key)}" aria-pressed="${isSaved}">${isSaved?'Saved ✓':'Save formula'}</button><button type="button" data-try-formula="${esc(f.id)}">Try on</button></div>
    </article>`;
  }

  // ---------------------------------------------------------------- library render
  const categoryCopy={
    seasons:['Seasonal wardrobe','Complete spring, summer, fall and winter outfits with brand-specific pieces, budgets, fit guidance and full-body model views.'],
    'old-money':['Old-money library','Screened Pinterest formulas rebuilt as separate brand collections, each shown on a full-body AI model.'],
    casual:['Casual library','Relaxed brand-specific formulas with quiet-luxury colours, clean proportions and polished footwear.']
  };
  function renderLibrary(){
    library.dataset.category=ui.category;library.dataset.brand=ui.brand;
    $$('.category-mode').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.categoryMode===ui.category)));
    $$('.season-filter').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===ui.season)));
    $$('.budget-filter').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.budget)===ui.budget)));
    $$('.brand-mode').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.brandMode===ui.brand)));
    const [title,intro]=categoryCopy[ui.category];
    $('#libraryTitle').textContent=ui.brand==='both'?title:`${title} · ${labelOf(ui.brand)}`;
    $('#libraryIntro').textContent=ui.brand==='both'?`${intro} Compare all ${catalogues.length} catalogues or choose one brand.`:`${intro} Showing the complete ${labelOf(ui.brand)} list.`;
    let count=0;
    if(ui.category==='seasons'){
      const looks=seasonalLooks().filter(({cat,look})=>{
        if(ui.brand!=='both'&&cat.id!==ui.brand)return false;
        if(ui.season!=='all'&&look.season!==ui.season)return false;
        if(toUSD(lookPrice(cat,look),look.currency||cat.currency)>ui.budget)return false;
        return matchesQuery(`${look.title} ${look.occasion} ${(look.items||[]).map(i=>i.name).join(' ')} ${cat.label}`);
      });
      count=looks.length;
      const grid=$('#seasonalGrid'),empty=$('#emptyState');
      grid.querySelectorAll('.look').forEach(n=>n.remove());
      grid.insertAdjacentHTML('beforeend',looks.map(lookCard).join(''));
      empty.hidden=count!==0;
      $('#formulaMore').hidden=true;
    }else{
      const matches=formulaMatches();count=matches.length;
      const grid=$('#formulaGrid'),empty=$('#formulaEmpty');
      grid.querySelectorAll('.formula').forEach(n=>n.remove());
      empty.insertAdjacentHTML('beforebegin',matches.slice(0,ui.formulaLimit).map(formulaCard).join(''));
      empty.hidden=count!==0;
      const remaining=count-Math.min(count,ui.formulaLimit),more=$('#formulaMore');
      more.hidden=remaining<=0;more.textContent=`Show ${Math.min(remaining,24)} more · ${remaining} remaining`;
    }
    const categoryLabel=ui.category==='seasons'?'Seasons':ui.category==='old-money'?'Old Money':'Casual';
    resultsNote.textContent=`Showing ${count} ${count===1?'look':'looks'} · ${categoryLabel} · ${labelOf(ui.brand)} · ${ui.season==='all'?'all seasons':ui.season}${ui.budget!==Infinity&&ui.category==='seasons'?` · up to ${money(ui.budget,0)}`:''}${ui.query?` · “${ui.query}”`:''}`;
    const formulaCounts=catalogues.map(c=>`${c.label} ${(c.formulas||[]).length}`).join(' · ');
    $('#libraryNote').textContent=`Formulas per brand: ${formulaCounts}. Every basket stays within its selected brand. Prices are catalogue-based estimates and may move with stock or sales.`;
  }

  // ---------------------------------------------------------------- lookboards
  const lookboardGrid=$('#lookboardGrid');
  function renderLookboards(){
    const boards=(sync.state.lookboards&&sync.state.lookboards.boards)||[];
    lookboardGrid.innerHTML=boards.map(board=>{
      const items=(board.items||[]).map(id=>productIndex.get(id)).filter(Boolean);
      if(items.length<2)return'';
      const key=`board:${board.id}`,isSaved=saved.has(key),lite=liteBoards.has(board.id);
      const optional=items.find(x=>x.product.slot===board.optional_slot);
      const total=items.filter(x=>!(lite&&x===optional)).reduce((sum,x)=>sum+toUSD(x.product.price.amount,x.product.price.currency),0);
      return`<article class="lookboard${lite?' is-lite':''}" data-board="${esc(board.id)}"><div class="lookboard-model"><img src="${esc(safeAsset(board.model))}" alt="AI model wearing ${esc(board.title)}" loading="lazy"></div><div class="lookboard-details"><div class="lookboard-copy"><small>${esc(board.label)}</small><h3>${esc(board.title)}</h3><span class="lookboard-total">${esc(money(total))}${lite?' · lighter':''}</span></div><div class="flatlay">${items.map(({product})=>`<button class="piece${lite&&optional&&product.id===optional.product.id?' is-removed':''}" type="button" data-product="${esc(product.id)}" aria-label="View ${esc(product.name)} details"><img src="${esc(safeAsset(product.image))}" alt="${esc(product.name)}" loading="lazy"><span>${esc(slotLabels[product.slot])}</span></button>`).join('')}</div><div class="lookboard-actions"><button type="button" data-save="${esc(key)}" aria-pressed="${isSaved}">${isSaved?'Saved ✓':'Save look'}</button><button type="button" data-board-lite="${esc(board.id)}" aria-pressed="${lite}"${optional?'':` disabled title="This board has no optional outer layer"`}>${optional?(lite?'Restore full look':'Lighter version'):'All pieces needed'}</button><button type="button" class="board-try" data-try-board="${esc(board.id)}">Try on in Mix &amp; Match</button></div></div></article>`;
    }).join('');
  }

  // ---------------------------------------------------------------- studio
  const slotLabels={outerwear:'Outerwear',top:'Tops',bottom:'Bottoms',shoes:'Shoes',accessory:'Accessories'};

  // ---------------------------------------------------------------- Mix & Match studio (app/studio.js)
  const OUTFITS_KEY='fil-outfits';
  const outfits=prefs.get(OUTFITS_KEY)||{};
  let studio=null;
  const showStudio=()=>{withTransition(()=>{setMainView('studio');window.scrollTo({top:0,behavior:'smooth'})})};
  function mountStudio(){
    studio=window.FIL.studio.mount({
      root:$('#studioView'),prefs,esc,safeUrl,money,toUSD,
      toast,getFit:()=>prefs.get(profileKey),
      openProduct:id=>{if(!productIndex.has(id))return false;openProduct(id);return true},
      saveOutfit:outfit=>{
        if(!Object.keys(outfit.ids).length){toast('Put at least one piece on the avatar first.');return}
        const id=`o${Date.now().toString(36)}`;outfits[id]={...outfit,at:new Date().toISOString()};prefs.set(OUTFITS_KEY,outfits);
        saved.add(`outfit:${id}`);persistSaved();renderSaved();
        toast(`Outfit saved · ${outfit.score}% match chance.`,{action:'View saved',onAction:()=>savedPanel.scrollIntoView({behavior:'smooth',block:'center'})});
      }
    });
    window.FashionLibrary&&(window.FashionLibrary.studio=studio);
  }

  // ---------------------------------------------------------------- product dialog (+ local corrections)
  const productDialog=$('#productDialog');let activeProduct=null;
  const fmtDate=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
  function fillProduct(){
    const entry=activeProduct&&productIndex.get(activeProduct);if(!entry){productDialog.open&&productDialog.close();return}
    const {product,cat}=entry;const f=product.facts||{};const v=product.verified;
    $('#productImage').src=safeAsset(product.image);$('#productImage').alt=product.name;
    $('#productBrand').textContent=`${cat.label} · ${slotLabels[product.slot]||product.slot}`;
    $('#productName').innerHTML=`${esc(product.name)}${product._edited?'<span class="edited-flag">updated</span>':''}`;
    $('#productPrice').textContent=money(toUSD(product.price.amount,product.price.currency));
    const availability=product.availability||'listed';const availNode=$('#productAvailability');
    availNode.dataset.state=availability;availNode.textContent=availability==='listed'?'':availability==='limited'?'Limited sizes reported':availability==='unavailable'?'Reported unavailable — check the retailer':'Availability unknown';
    availNode.hidden=availability==='listed';
    $('#productNote').textContent=product.note||'';
    const checked=v&&v.verified_at||product.link_check&&product.link_check.checked_at||cat.updated_at;
    const rows=[['Colour',f.colour||'Not published on linked category'],['Material',f.material||'Not published'],['Pattern',f.pattern||'Not published'],['Construction',f.construction||'Not published'],
      ['Native price',v?native(v.price,v.currency):f.native_price||native(product.price.amount,product.price.currency)],['Evidence',f.evidence||(v?v.source_kind.replace(/_/g,' '):'Category route; product-level verification pending')],['Checked',fmtDate(checked)]];
    if(product.link_check)rows.push(['Link',product.link_check.state==='ok'?'Live':product.link_check.state==='dead'?'Page removed':'Could not verify automatically']);
    $('#productFacts').innerHTML=rows.map(([k,val])=>`<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('');
    $('#productLink').href=safeUrl(product.url);
    $('#productWear').textContent='Try on in Mix & Match';
    $('#suggestPrice').value=product.price.amount;$('#suggestCurrency').value=product.price.currency;$('#suggestAvailability').value=availability;$('#suggestNote').value='';
  }
  function openProduct(id){if(!productIndex.has(id))return;activeProduct=id;fillProduct();$('#productSuggest').open=false;if(!productDialog.open)productDialog.showModal()}
  $('#productClose').addEventListener('click',()=>productDialog.close());
  productDialog.addEventListener('click',event=>{if(event.target===productDialog)productDialog.close()});
  $('#productWear').addEventListener('click',()=>{const entry=productIndex.get(activeProduct);if(entry&&studio){studio.equip([entry.product.id]);productDialog.close();showStudio()}});
  $('#suggestForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const entry=productIndex.get(activeProduct);if(!entry)return;
    const amount=Number($('#suggestPrice').value);
    if(!Number.isFinite(amount)||amount<0){toast('Enter a valid price.');return}
    const fields={price:{amount,currency:$('#suggestCurrency').value},availability:$('#suggestAvailability').value};
    const noteText=$('#suggestNote').value.trim();
    await sync.patchProduct(entry.cat.id,entry.product.id,fields,noteText);
    rerender();fillProduct();$('#productSuggest').open=false;
    toast(sync.state.config.pushUrl?'Update saved and sent.':'Update saved. Export it from Catalogue updates to publish it for everyone.',{action:'Open',onAction:openLibraryDialog});
  });

  // ---------------------------------------------------------------- model dialog
  const modelDialog=$('#modelDialog');
  $('#dialogClose').addEventListener('click',()=>modelDialog.close());
  modelDialog.addEventListener('click',event=>{if(event.target===modelDialog)modelDialog.close()});

  // ---------------------------------------------------------------- saved panel
  const savedPanel=$('#savedPanel');
  function describeSaved(key){
    const [kind,a,b]=key.split(':');
    if(kind==='look'){const cat=catalogueIndex.get(a),look=cat&&(cat.seasonal||[]).find(l=>l.season===b);if(!look)return null;return{label:`${cat.label} · ${look.title}`,usd:toUSD(lookPrice(cat,look),look.currency||cat.currency)}}
    if(kind==='formula'){for(const cat of catalogues){const f=(cat.formulas||[]).find(x=>x.id===a);if(f)return{label:`${cat.label} · ${f.title}`,usd:f.basket?toUSD(f.basket.amount,f.basket.currency):0}}return null}
    if(kind==='board'){const board=((sync.state.lookboards||{}).boards||[]).find(x=>x.id===a);if(!board)return null;const items=board.items.map(id=>productIndex.get(id)).filter(Boolean);const optional=items.find(x=>x.product.slot===board.optional_slot);return{label:`Lookboard · ${board.title}`,usd:items.filter(x=>!(liteBoards.has(a)&&x===optional)).reduce((s,x)=>s+toUSD(x.product.price.amount,x.product.price.currency),0)}}
    if(kind==='outfit'){const o=outfits[a];if(!o||!studio)return null;const worn=studio.describe(o.ids);if(!worn.length)return null;return{label:`Outfit · ${worn.slice(0,2).map(p=>p.name).join(' + ')}${worn.length>2?` +${worn.length-2}`:''} · ${o.score}%`,usd:studio.priceUSD(o.ids),outfit:a}}
    return null;
  }
  function renderSaved(){
    const rows=[...saved].map(key=>({key,info:describeSaved(key)})).filter(r=>r.info);
    $('#savedCount').textContent=rows.length;
    savedPanel.hidden=rows.length===0;
    $('#savedTotal').textContent=money(rows.reduce((s,r)=>s+r.info.usd,0));
    $('#savedList').innerHTML=rows.map(({key,info})=>`<span class="saved-chip">${info.outfit?`<button type="button" class="saved-open" data-load-outfit="${esc(info.outfit)}">${esc(info.label)} · ${esc(money(info.usd))}</button>`:`${esc(info.label)} · ${esc(money(info.usd))}`}<button type="button" data-unsave="${esc(key)}" aria-label="Remove ${esc(info.label)} from saved">×</button></span>`).join('');
  }
  $('#savedTrigger').addEventListener('click',()=>{
    if(!Number($('#savedCount').textContent)){toast('Nothing saved yet — save an outfit in Mix & Match, or a look or formula in Lookboards.');return}
    savedPanel.scrollIntoView({behavior:'smooth',block:'center'});
  });

  // ---------------------------------------------------------------- views
  const libraryView=$('#libraryView'),studioView=$('#studioView');
  const setMainView=view=>{const studio=view==='studio';$$('.view-tab').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.view===view)));libraryView.hidden=studio;studioView.hidden=!studio;if(studio&&window.FashionLibrary&&window.FashionLibrary.studio)window.FashionLibrary.studio.shown();history.replaceState(null,'',`${location.pathname}${location.search}${studio?'#studio':'#lookboards'}`)};
  $$('.view-tab').forEach(button=>button.addEventListener('click',()=>withTransition(()=>{setMainView(button.dataset.view);window.scrollTo({top:0,behavior:'smooth'})})));

  // ---------------------------------------------------------------- one delegated click handler
  document.addEventListener('click',event=>{
    const t=event.target.closest('button,a');if(!t)return;
    const d=t.dataset;
    if(d.save){saved.has(d.save)?saved.delete(d.save):saved.add(d.save);persistSaved();$$(`[data-save="${CSS.escape(d.save)}"]`).forEach(b=>{const on=saved.has(d.save);b.setAttribute('aria-pressed',String(on));b.textContent=on?'Saved ✓':d.save.startsWith('formula:')?'Save formula':'Save look'});renderSaved();return}
    if(d.unsave){saved.delete(d.unsave);if(d.unsave.startsWith('outfit:')){delete outfits[d.unsave.slice(7)];prefs.set(OUTFITS_KEY,outfits)}persistSaved();renderSaved();renderVisibleSaves();return}
    if(d.lite){liteLooks.has(d.lite)?liteLooks.delete(d.lite):liteLooks.add(d.lite);renderLibrary();renderSaved();return}
    if(d.boardLite){liteBoards.has(d.boardLite)?liteBoards.delete(d.boardLite):liteBoards.add(d.boardLite);renderLookboards();renderSaved();return}
    if(d.product){openProduct(d.product);return}
    if(d.info){openProduct(d.info);return}
    if(d.tryBoard){const board=((sync.state.lookboards||{}).boards||[]).find(b=>b.id===d.tryBoard);if(board&&studio){studio.tryAliases(board.items);showStudio()}return}
    if(d.tryLook){if(studio&&studio.trySeasonal(d.tryLook))showStudio();return}
    if(d.tryFormula){if(studio&&studio.tryFormula(d.tryFormula))showStudio();return}
    if(d.loadOutfit){const o=outfits[d.loadOutfit];if(o&&studio){studio.load(o);showStudio()}return}
    if(d.viewGo){withTransition(()=>{setMainView(d.viewGo);(d.viewGo==='studio'?$('#studioView'):$('#libraryView')).scrollIntoView({behavior:'smooth',block:'start'})});return}
    if(d.full!==undefined&&(t.classList.contains('visual')||t.classList.contains('formula-visual'))){const card=t.closest('[data-title]');$('#dialogImage').src=d.full;$('#dialogImage').alt=t.querySelector('img').alt;$('#dialogTitle').textContent=card?card.dataset.title:'';modelDialog.showModal();return}
    if(d.brandMode){withTransition(()=>{ui.brand=d.brandMode;ui.formulaLimit=24;renderLibrary()});return}
    if(d.categoryMode){withTransition(()=>{ui.category=d.categoryMode;ui.formulaLimit=24;renderLibrary()});return}
    if(d.filter&&t.classList.contains('season-filter')){withTransition(()=>{ui.season=d.filter;ui.formulaLimit=24;renderLibrary()});return}
    if(d.budget){withTransition(()=>{ui.budget=Number(d.budget);renderLibrary()});return}
    if(t.id==='formulaMore'){ui.formulaLimit+=24;renderLibrary();return}
  });
  const renderVisibleSaves=()=>$$('[data-save]').forEach(b=>{const on=saved.has(b.dataset.save);b.setAttribute('aria-pressed',String(on));b.textContent=on?'Saved ✓':b.dataset.save.startsWith('formula:')?'Save formula':'Save look'});
  let searchTimer=null;
  $('#searchInput').addEventListener('input',event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{ui.query=event.target.value.trim().toLowerCase();ui.formulaLimit=24;renderLibrary()},140)});

  // ---------------------------------------------------------------- library/storage dialog
  const libraryDialog=$('#libraryDialog'),syncTrigger=$('#syncTrigger');
  const ago=ms=>{if(!ms)return'never';const s=Math.round((Date.now()-ms)/1000);if(s<45)return'just now';if(s<3600)return`${Math.round(s/60)} min ago`;if(s<86400)return`${Math.round(s/3600)} h ago`;return`${Math.round(s/86400)} d ago`};
    function renderSyncPill(){
    const s=sync.status();syncTrigger.dataset.status=s.status;
    const base={starting:'Loading library…',syncing:'Syncing…',synced:`Synced ${ago(s.lastPull)}`,offline:'Offline · saved copy',error:'Sync paused · saved copy',local:'Saved copy'}[s.status]||'Library';
    $('#syncLabel').textContent=`${base}${s.edits?` · ${s.edits} local`:''}${s.live==='live'?' · live':''}`;
    syncTrigger.title=`Catalogue source: ${s.source||'—'}. Tap for catalogue updates.`;
  }
  async function renderLibraryDialog(){
    const s=sync.status();
    const looks=catalogues.reduce((n,c)=>n+(c.seasonal||[]).length+(c.formulas||[]).length,0);
    const products=catalogues.reduce((n,c)=>n+(c.products||[]).length,0);
    $('#libraryStats').innerHTML=[[catalogues.length,'catalogues'],[looks,'looks & formulas'],[products,'products'],[ago(s.lastPull),'last sync']].map(([b,span])=>`<div class="stat"><b>${esc(b)}</b><span>${esc(span)}</span></div>`).join('');
    $('#librarySyncCopy').textContent=`New prices and products arrive automatically while the site is open.${sync.state.config.pushUrl?' Your updates are sent automatically.':' Your updates show here straight away; export them to publish them for everyone.'}`;
    $('#catalogueList').innerHTML=catalogues.map(c=>`<li><span><b>${esc(c.label)}</b><br><small>${(c.seasonal||[]).length} seasonal · ${(c.formulas||[]).length} formulas · ${(c.products||[]).length} products</small></span><small>${c._origin==='local'?'Imported':`Updated ${esc(fmtDate(c.updated_at))}`}</small></li>`).join('');
    const edits=[...sync.state.edits.values()];
    $('#editList').innerHTML=edits.length?edits.map(e=>{
      const entry=e.id&&productIndex.get(e.id);const what=e.op==='catalogue.upsert'?`Imported catalogue ${e.data&&e.data.label}`:entry?`${entry.cat.label} · ${entry.product.name}`:`${e.op} ${e.id||''}`;
      const detail=e.fields&&e.fields.price?` → ${native(e.fields.price.amount,e.fields.price.currency)}${e.fields.availability&&e.fields.availability!=='listed'?`, ${e.fields.availability}`:''}`:'';
      return`<li><span>${esc(what)}${esc(detail)}<br><small>${esc(fmtDate(e.at))}</small></span><button type="button" data-revert="${esc(e.key)}">Undo</button></li>`;
    }).join(''):'<li><span>No local updates yet. Use “Price or stock changed?” on any product.</span></li>';
  }
  function openLibraryDialog(){renderLibraryDialog();if(!libraryDialog.open)libraryDialog.showModal()}
  syncTrigger.addEventListener('click',openLibraryDialog);
  $('#libraryDialogClose').addEventListener('click',()=>libraryDialog.close());
  libraryDialog.addEventListener('click',async event=>{
    if(event.target===libraryDialog){libraryDialog.close();return}
    const revert=event.target.closest('[data-revert]');
    if(revert){await sync.revertEdit(revert.dataset.revert);rerender();renderLibraryDialog()}
  });
  $('#syncNow').addEventListener('click',async()=>{
    const diffs=await sync.pull('manual');renderLibraryDialog();
    const s=sync.status();
    if(s.status==='local')toast('Opened from a file, so live sync is off. Serve the folder over http(s) to turn it on.');
    else if(s.status!=='synced')toast('Could not reach the catalogue source right now. The saved copy is still shown.');
    else if(!diffs.length)toast('Everything is up to date.');
  });
  $('#exportChanges').addEventListener('click',()=>{
    const bundle=sync.exportChanges();
    if(!bundle.changes.length){toast('No local updates to export yet.');return}
    const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`fil-changes-${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    toast('Exported. Add the file to data/inbox/ in the repository and the pipeline publishes it to everyone.',{timeout:8000});
  });
  $('#importFile').addEventListener('change',async event=>{
    const file=event.target.files&&event.target.files[0];event.target.value='';if(!file)return;
    try{
      const result=await sync.importJSON(JSON.parse(await file.text()));
      rerender();renderLibraryDialog();
      toast(result.type==='catalogue'?`Catalogue “${result.label}” added.`:`${result.count} update${result.count===1?'':'s'} applied.`);
    }catch(error){toast(`Import failed: ${error.message}`)}
  });
  // ---------------------------------------------------------------- whole-page render
  function renderChrome(){
    const names=catalogues.map(c=>c.label);
    const list=names.length>1?`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`:names[0]||'';
    $('#introDek').textContent=`Pinterest-led outfit formulas organized as separate ${list} libraries, with seasonal, old-money and casual ways to explore.`;
    $('#footLinks').innerHTML=[`<a href="https://www.pinterest.com/search/pins/?q=mens%20outfit%20old%20money%20minimal%20all%20seasons&rs=typed" target="_blank" rel="noreferrer">Pinterest ↗</a>`,...catalogues.map(c=>`<a href="${esc(safeUrl(c.home_url))}" target="_blank" rel="noreferrer">${esc(c.label)} ↗</a>`)].join(' · ');
  }
  function rerender(){
    rebuild();renderChrome();renderBrandSwitch();renderBudgets();renderLookboards();renderLibrary();
    if(!studio)mountStudio();
    studio.refresh(catalogues);renderSaved();
    if(productDialog.open)fillProduct();
    if(libraryDialog.open)renderLibraryDialog();
  }

  currencySelect.addEventListener('change',()=>{displayCurrency=currencySelect.value;prefs.set('fashion-currency',displayCurrency);rerender()});
  fetch('https://open.er-api.com/v6/latest/USD').then(r=>r.ok?r.json():Promise.reject()).then(data=>{
    if(data.result!=='success')throw new Error();
    rates={...rates,...data.rates};prefs.set('fil-rates',{rates:data.rates,at:data.time_last_update_utc});
    rateStatus.textContent='Live rates';rateStatus.title=`Updated ${data.time_last_update_utc}`;rerender();
  }).catch(()=>{rateStatus.textContent=cachedRates?'Saved rates':'Reference rates';rateStatus.title=cachedRates?`Live service unavailable; using rates from ${cachedRates.at}`:'Live exchange service unavailable; using reference rates.'});

  // ---------------------------------------------------------------- sync wiring
  let firstRender=true;
  sync.on('ready',()=>{
    rerender();
    if(firstRender){
      firstRender=false;
      const presets={massimo:['md-suede','md-polo','md-trouser','md-loafer','md-belt'],zara:['z-navy-blazer','z-oxford','z-trouser','z-sneaker','z-watch'],hm:['hm-olive','hm-merino','hm-chino','hm-chelsea','hm-bag'],uniqlo:['u-jacket','u-knit','u-pleats','u-sneaker','u-glasses'],green:['u-green-polo','md-trouser','md-loafer','md-belt']};
      const preset=presets[params.get('preset')];
      if(preset)studio.tryAliases(preset);
      // Mix & Match is the landing view; #lookboards opens the library instead.
      if(location.hash==='#lookboards')setMainView('library');else{studio.openLink(location.hash);setMainView('studio')}
    }
  });
  sync.on('change',({reason,diffs})=>{
    rerender();
    if(!diffs.length||reason==='import')return;
    const parts=diffs.map(d=>d.isNew?`${d.label} added`:d.removedCatalogue?`${d.label} removed`:`${d.label}${d.priceChanges&&d.priceChanges.length?` · ${d.priceChanges.length} price change${d.priceChanges.length===1?'':'s'}`:` · ${d.added+d.changed+d.removed} update${d.added+d.changed+d.removed===1?'':'s'}`}`);
    toast(`Catalogue updated: ${parts.join('; ')}`,{action:'Details',onAction:openLibraryDialog,timeout:7000});
  });
  sync.on('edits',()=>rerender());
  sync.on('status',renderSyncPill);
  // Keep every catalogue image in the site's saved copy so the next visit opens without re-downloading.
  // Runs silently once the page is idle, and skips data-saver / slow connections.
  let warmed=false;
  sync.on('status',s=>{
    if(warmed||s.status!=='synced')return;
    const c=navigator.connection;if(c&&(c.saveData||/(^|-)2g|3g/.test(c.effectiveType||'')))return;
    warmed=true;
    const run=()=>sync.cacheAllAssets();
    'requestIdleCallback' in window?requestIdleCallback(run,{timeout:8000}):setTimeout(run,4000);
  });
  sync.on('user',msg=>{if(msg.key===SAVED_KEY){saved.clear();(prefs.get(SAVED_KEY)||[]).forEach(k=>saved.add(k));renderSaved();renderVisibleSaves()}});
  setInterval(renderSyncPill,30000);
  renderSyncPill();
  sync.start();

  // Small public API for scripts, bookmarklets and future integrations.
  window.FashionLibrary={
    catalogues:()=>structuredClone(catalogues),
    product:id=>{const e=productIndex.get(id);return e?structuredClone(e.product):null},
    sync:()=>sync.pull('api'),
    updateProduct:(catalogueId,productId,fields,note)=>sync.patchProduct(catalogueId,productId,fields,note),
    importCatalogue:json=>sync.importJSON(json),
    exportChanges:()=>sync.exportChanges(),
    on:(event,fn)=>sync.on(event,fn),
    status:()=>sync.status()
  };
})();

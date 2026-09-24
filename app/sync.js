/* Fashion Inspo Libraries — two-way catalogue sync.
 *
 * Pull (site ← catalogue source)
 *   • data/manifest.json lists every catalogue with a content hash.
 *   • On start, on an interval, when the tab becomes visible, when the network
 *     comes back, and whenever a live push arrives (optional EventSource), the
 *     manifest is revalidated and ONLY catalogues whose hash changed are fetched.
 *   • Fetched catalogues are hash-checked, stored in IndexedDB and pushed to the
 *     page (and every other open tab via BroadcastChannel) without a reload.
 *
 * Push (site → catalogue source)
 *   • Product corrections, imported catalogues and other local edits are stored
 *     on the device, applied on top of the synced data, and queued in an outbox.
 *   • The outbox is POSTed to a push endpoint when one is configured; otherwise
 *     it is exported as a change file that scripts/catalogue-pipeline.mjs merges
 *     from data/inbox/, after which every visitor pulls the update.
 *
 * Configuration (all optional): window.FIL_CONFIG = {liveUrl, pushUrl, pollSeconds}
 * or <meta name="fil:live-url">, <meta name="fil:push-url">, or manifest.sync.
 */
(function(){
  'use strict';
  const {store}=window.FIL;
  const MANIFEST_URL='data/manifest.json';
  const CHANNEL='fil-sync';
  const META_KEY='manifest';
  const listeners=new Map();
  const channel='BroadcastChannel' in self?new BroadcastChannel(CHANNEL):null;
  const isHttp=/^https?:$/.test(location.protocol);
  const meta=name=>{const node=document.querySelector(`meta[name="${name}"]`);return node&&node.content.trim()||null};

  const state={
    catalogues:new Map(),   // id -> catalogue record (synced or local)
    lookboards:{boards:[]},
    manifest:null,
    edits:new Map(),        // key -> change
    outboxSize:0,
    status:'starting',      // starting | syncing | synced | offline | error | local
    source:null,            // seed | device | network
    lastPull:0,
    lastChange:null,
    config:{},
    live:'off'              // off | connecting | live | error
  };

  const on=(event,fn)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);return()=>listeners.get(event).delete(fn)};
  const emit=(event,detail)=>{(listeners.get(event)||[]).forEach(fn=>{try{fn(detail)}catch(error){console.error(error)}})};
  const setStatus=status=>{state.status=status;emit('status',{...status_()})};
  const status_=()=>({status:state.status,source:state.source,lastPull:state.lastPull,live:state.live,outbox:state.outboxSize,edits:state.edits.size});

  const hashText=async text=>{
    if(!(self.crypto&&crypto.subtle))return null;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
  };

  // ---------------------------------------------------------------- diff
  const byId=list=>new Map((list||[]).map(x=>[x.id,x]));
  const diffCatalogue=(before,after)=>{
    const out={id:after?after.id:before.id,label:(after||before).label,added:0,removed:0,changed:0,priceChanges:[]};
    if(!before){out.added=(after.products||[]).length+(after.formulas||[]).length+(after.seasonal||[]).length;out.isNew=true;return out}
    if(!after){out.removedCatalogue=true;return out}
    for(const kind of['products','formulas','seasonal']){
      const a=byId(before[kind]),b=byId(after[kind]);
      for(const [id,item] of b){
        const old=a.get(id);
        if(!old){out.added++;continue}
        if(JSON.stringify(old)!==JSON.stringify(item)){
          out.changed++;
          const oldPrice=kind==='products'?old.price&&old.price.amount:kind==='seasonal'?old.full:old.basket&&old.basket.amount;
          const newPrice=kind==='products'?item.price&&item.price.amount:kind==='seasonal'?item.full:item.basket&&item.basket.amount;
          if(oldPrice!==newPrice)out.priceChanges.push({kind,id,title:item.name||item.title,from:oldPrice,to:newPrice});
        }
      }
      for(const id of a.keys())if(!b.has(id))out.removed++;
    }
    return out;
  };

  // ---------------------------------------------------------------- apply a manifest
  // fetcher(entry) -> {text?, data}
  async function applyManifest(manifest,fetcher,source){
    const diffs=[];const wanted=new Set(manifest.catalogues.map(c=>c.id));
    for(const entry of manifest.catalogues){
      const current=state.catalogues.get(entry.id);
      if(current&&current._hash===entry.hash&&current._origin!=='local')continue;
      const {text,data}=await fetcher(entry);
      if(text){const actual=await hashText(text);if(actual&&actual!==entry.hash)throw new Error(`hash mismatch for ${entry.id}`)}
      if(!data||data.id!==entry.id)throw new Error(`catalogue ${entry.id} is malformed`);
      const record={...data,_hash:entry.hash,_origin:'remote',_source:source,_stored_at:new Date().toISOString()};
      await store.put('catalogues',record);
      diffs.push(diffCatalogue(current&&current._origin!=='local'?current:null,record));
      state.catalogues.set(entry.id,record);
    }
    // catalogues removed upstream (local imports are kept)
    for(const [id,record] of [...state.catalogues]){
      if(record._origin==='remote'&&!wanted.has(id)){await store.del('catalogues',id);state.catalogues.delete(id);diffs.push(diffCatalogue(record,null))}
    }
    const lookHash=state.lookboards&&state.lookboards._hash;
    if(manifest.lookboards&&lookHash!==manifest.lookboards.hash){
      const {text,data}=await fetcher({id:'lookboards',path:manifest.lookboards.path,hash:manifest.lookboards.hash,lookboards:true});
      if(text){const actual=await hashText(text);if(actual&&actual!==manifest.lookboards.hash)throw new Error('hash mismatch for lookboards')}
      state.lookboards={...data,_hash:manifest.lookboards.hash};
      await store.put('kv',state.lookboards,'lookboards');
      if(lookHash)diffs.push({id:'lookboards',label:'Lookboards',changed:1,added:0,removed:0,priceChanges:[]});
    }
    state.manifest=manifest;
    await store.put('kv',manifest,META_KEY);
    return diffs;
  }

  const seedFetcher=seed=>async entry=>({data:entry.lookboards?seed.lookboards:seed.catalogues[entry.id]});
  const networkFetcher=async entry=>{
    const response=await fetch(`${entry.path}?v=${entry.hash}`,{cache:'no-cache'});
    if(!response.ok)throw new Error(`${entry.path}: HTTP ${response.status}`);
    const text=await response.text();
    return{text,data:JSON.parse(text)};
  };

  const announce=(diffs,reason)=>{
    const real=diffs.filter(d=>d.added||d.removed||d.changed||d.isNew||d.removedCatalogue);
    state.lastChange={at:Date.now(),reason,diffs:real};
    emit('change',{reason,diffs:real});
    if(real.length&&channel&&reason!=='broadcast')channel.postMessage({type:'catalogues-updated',ids:real.map(d=>d.id)});
  };

  // ---------------------------------------------------------------- pull
  let pulling=null;
  async function pull(reason='manual'){
    if(!isHttp){setStatus('local');return[]}
    if(pulling)return pulling;
    pulling=(async()=>{
      setStatus('syncing');
      try{
        const response=await fetch(MANIFEST_URL,{cache:'no-cache'});
        if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
        const manifest=await response.json();
        const diffs=await applyManifest(manifest,networkFetcher,'network');
        state.source='network';
        const offline=navigator.onLine===false; // the service worker answered from the device copy
        if(!offline){state.lastPull=Date.now();store.put('kv',state.lastPull,'lastPull')}
        configure(manifest.sync||{});
        await resolvePublishedEdits();
        setStatus(offline?'offline':'synced');
        announce(diffs,reason);
        flush();
        return diffs;
      }catch(error){
        console.warn('[sync] pull failed',error);
        setStatus(navigator.onLine===false?'offline':'error');
        return[];
      }finally{pulling=null}
    })();
    return pulling;
  }

  // ---------------------------------------------------------------- schedule & live channel
  let timer=null,events=null;
  function configure(fromManifest){
    const cfg=window.FIL_CONFIG||{};
    const next={
      pollSeconds:Math.max(60,Number(cfg.pollSeconds||fromManifest.poll_seconds||state.config.pollSeconds||300)),
      liveUrl:cfg.liveUrl||meta('fil:live-url')||fromManifest.live_url||null,
      pushUrl:cfg.pushUrl||meta('fil:push-url')||fromManifest.push_url||null
    };
    const changed=JSON.stringify(next)!==JSON.stringify(state.config);
    state.config=next;
    if(!changed)return;
    clearInterval(timer);
    timer=setInterval(()=>{if(document.visibilityState==='visible')pull('interval')},next.pollSeconds*1000);
    connectLive();
  }
  function connectLive(){
    if(events){events.close();events=null}
    if(!state.config.liveUrl||!('EventSource' in self)){state.live='off';return}
    state.live='connecting';emit('status',status_());
    events=new EventSource(state.config.liveUrl);
    events.onopen=()=>{state.live='live';emit('status',status_())};
    events.onerror=()=>{state.live='error';emit('status',status_())};
    // Any message means "something changed upstream": revalidate the manifest.
    events.onmessage=()=>pull('live');
    events.addEventListener('manifest',()=>pull('live'));
  }

  // ---------------------------------------------------------------- local edits (push direction)
  const changeKey=change=>`${change.op.split('.')[0]}:${change.catalogue||change.data&&change.data.id}:${change.id||change.data&&change.data.id}`;
  async function refreshOutbox(){state.outboxSize=(await store.all('outbox')).length}
  async function recordChange(change){
    change={...change,at:new Date().toISOString()};
    const key=changeKey(change);
    const previous=state.edits.get(key);
    // merge successive patches on the same item into one change
    if(previous&&previous.op===change.op&&change.op.endsWith('.patch'))change={...change,fields:{...previous.fields,...change.fields}};
    change.key=key;
    state.edits.set(key,change);
    await store.put('edits',change);
    await store.put('outbox',{change});
    await refreshOutbox();
    if(channel)channel.postMessage({type:'edits-changed'});
    emit('edits',{key});emit('status',status_());
    flush();
    return change;
  }
  async function revertEdit(key){
    state.edits.delete(key);await store.del('edits',key);
    await store.put('outbox',{change:{op:'revert',key,at:new Date().toISOString()}});
    await refreshOutbox();
    if(channel)channel.postMessage({type:'edits-changed'});
    emit('edits',{key});emit('status',status_());
  }
  // Once the catalogue source has published a local correction, the local copy is no longer needed.
  async function resolvePublishedEdits(){
    let resolved=0;
    for(const [key,change] of [...state.edits]){
      if(change.op!=='product.patch')continue;
      const product=(state.catalogues.get(change.catalogue)?.products||[]).find(p=>p.id===change.id);
      if(!product)continue;
      if(Object.entries(change.fields||{}).every(([k,v])=>JSON.stringify(product[k])===JSON.stringify(v))){
        state.edits.delete(key);await store.del('edits',key);resolved++;
      }
    }
    if(resolved){
      const pending=(await store.all('outbox')).filter(q=>q.change.key&&!state.edits.has(q.change.key)&&q.change.op==='product.patch');
      for(const q of pending)await store.del('outbox',q.seq);
      await refreshOutbox();
      if(channel)channel.postMessage({type:'edits-changed'});
      emit('edits',{resolved});
    }
    return resolved;
  }
  const patchProduct=(catalogue,id,fields,note)=>recordChange({op:'product.patch',catalogue,id,fields,note:note||null});

  async function importJSON(json){
    if(json&&json.format==='fil-changes'){
      let count=0;
      for(const change of json.changes||[]){if(change.op&&change.op!=='revert'){await recordChange(change);count++}}
      return{type:'changes',count};
    }
    if(json&&json.id&&json.label&&(json.formulas||json.products||json.seasonal)){
      if(!/^[a-z0-9-]+$/.test(json.id))throw new Error('Catalogue id must be lowercase letters, numbers and dashes.');
      const existing=state.catalogues.get(json.id);
      const record={...json,_origin:'local',_hash:null,_stored_at:new Date().toISOString()};
      await store.put('catalogues',record);state.catalogues.set(json.id,record);
      await recordChange({op:'catalogue.upsert',data:json});
      announce([diffCatalogue(existing||null,record)],'import');
      return{type:'catalogue',id:json.id,label:json.label};
    }
    throw new Error('Not a catalogue or change file.');
  }

  function exportChanges(){
    return{format:'fil-changes',version:1,exported_at:new Date().toISOString(),
      base:state.manifest&&state.manifest.content_hash,
      changes:[...state.edits.values()].map(({key,...change})=>change)};
  }

  let flushing=false,backoff=0;
  async function flush(){
    if(!state.config.pushUrl||flushing||!navigator.onLine)return false;
    const queued=await store.all('outbox');
    if(!queued.length)return true;
    flushing=true;
    try{
      const response=await fetch(state.config.pushUrl,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({format:'fil-changes',version:1,base:state.manifest&&state.manifest.content_hash,changes:queued.map(q=>q.change)})});
      if(!response.ok)throw new Error(`push HTTP ${response.status}`);
      for(const q of queued)await store.del('outbox',q.seq);
      backoff=0;await refreshOutbox();emit('status',status_());
      return true;
    }catch(error){
      backoff=Math.min(backoff?backoff*2:15,600);
      setTimeout(flush,backoff*1000);
      return false;
    }finally{flushing=false}
  }

  // ---------------------------------------------------------------- effective (merged) view
  function effectiveCatalogues(){
    const list=[...state.catalogues.values()].map(c=>structuredClone(c));
    const index=new Map(list.map(c=>[c.id,c]));
    for(const change of state.edits.values()){
      const [kind,op]=change.op.split('.');
      const cat=index.get(change.catalogue);
      if(!cat||op!=='patch'&&op!=='upsert'&&op!=='remove')continue;
      const coll={product:'products',formula:'formulas',seasonal:'seasonal'}[kind];if(!coll)continue;
      const items=cat[coll]||(cat[coll]=[]);
      const i=items.findIndex(x=>x.id===(change.id||change.data&&change.data.id));
      if(op==='remove'&&i>=0)items.splice(i,1);
      else if(op==='patch'&&i>=0)items[i]={...items[i],...change.fields,_edited:change.key};
      else if(op==='upsert'&&change.data){if(i>=0)items[i]={...items[i],...change.data,_edited:change.key};else items.push({...change.data,_edited:change.key})}
    }
    return list.sort((a,b)=>(a.order??99)-(b.order??99)||a.label.localeCompare(b.label));
  }

  // ---------------------------------------------------------------- device maintenance
  async function resetDevice(){
    for(const name of['catalogues','kv','edits','outbox'])await store.clear(name);
    try{for(const key of await caches.keys())if(key.startsWith('fil-'))await caches.delete(key)}catch{}
    state.catalogues.clear();state.edits.clear();state.manifest=null;state.lookboards={boards:[]};state.outboxSize=0;
    await boot();
  }
  function cacheAllAssets(){
    const urls=new Set((state.manifest&&state.manifest.assets)||[]);
    for(const cat of state.catalogues.values()){
      for(const x of[...(cat.formulas||[]),...(cat.seasonal||[]),...(cat.products||[])]){[x.image,x.worn].forEach(u=>{if(u&&u.startsWith('assets/'))urls.add(u)})}
    }
    if(!('serviceWorker' in navigator))return Promise.resolve({ok:false,total:urls.size});
    return navigator.serviceWorker.ready.then(reg=>{
      const worker=navigator.serviceWorker.controller||reg.active;
      if(!worker)return{ok:false,total:urls.size};
      worker.postMessage({type:'cache-assets',urls:[...urls]});
      return{ok:true,total:urls.size};
    });
  }

  // ---------------------------------------------------------------- boot
  async function boot(){
    await store.ready;
    const [stored,edits,manifest,lookboards,lastPull]=await Promise.all([store.all('catalogues'),store.all('edits'),store.get('kv',META_KEY),store.get('kv','lookboards'),store.get('kv','lastPull')]);
    stored.forEach(c=>state.catalogues.set(c.id,c));
    edits.forEach(e=>state.edits.set(e.key,e));
    state.manifest=manifest||null;state.lastPull=lastPull||0;
    if(lookboards)state.lookboards=lookboards;
    state.source=stored.length?'device':null;
    await refreshOutbox();
    const seed=window.__FIL_SEED__;
    // Seed covers first visits and file:// use; it never downgrades newer device data.
    if(seed&&(!state.manifest||!stored.length||String(seed.manifest.generated_at)>String(state.manifest.generated_at))){
      const diffs=await applyManifest(seed.manifest,seedFetcher(seed),'seed');
      if(!stored.length)state.source='seed';
      else announce(diffs,'seed');
    }
    emit('ready',status_());
  }

  async function start(){
    configure({});
    if(isHttp&&'serviceWorker' in navigator){
      navigator.serviceWorker.register('sw.js').catch(error=>console.warn('[sync] service worker not registered',error));
      navigator.serviceWorker.addEventListener('message',event=>{if(event.data&&event.data.type==='cache-progress')emit('cache-progress',event.data)});
    }
    await boot();
    if(channel)channel.onmessage=async event=>{
      const msg=event.data||{};
      if(msg.type==='catalogues-updated'){
        const before=new Map(state.catalogues);
        for(const id of msg.ids||[]){const rec=await store.get('catalogues',id);if(rec)state.catalogues.set(id,rec);else state.catalogues.delete(id)}
        const lb=await store.get('kv','lookboards');if(lb)state.lookboards=lb;
        state.manifest=await store.get('kv',META_KEY)||state.manifest;
        announce((msg.ids||[]).map(id=>diffCatalogue(before.get(id)||null,state.catalogues.get(id)||null)).filter(d=>d.id),'broadcast');
      }else if(msg.type==='edits-changed'){
        state.edits=new Map((await store.all('edits')).map(e=>[e.key,e]));await refreshOutbox();
        emit('edits',{remote:true});emit('status',status_());
      }else if(msg.type==='user-changed'){emit('user',msg)}
    };
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-state.lastPull>30000)pull('focus')});
    addEventListener('online',()=>{pull('online');flush()});
    addEventListener('offline',()=>setStatus('offline'));
    if(isHttp){store.persist();pull('start')}else setStatus('local');
  }

  window.FIL.sync={state,on,start,pull,patchProduct,recordChange,revertEdit,importJSON,exportChanges,flush,effectiveCatalogues,resetDevice,cacheAllAssets,
    status:status_,broadcastUser:key=>channel&&channel.postMessage({type:'user-changed',key})};
})();

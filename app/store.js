/* Fashion Inspo Libraries — on-device storage.
 *
 * Catalogues live in IndexedDB (hundreds of MB available, versus ~5 MB for
 * localStorage), so any number of catalogues can be kept on the device and
 * only changed ones are ever downloaded again. Small preferences stay in
 * localStorage. Every call is wrapped so private windows or blocked storage
 * degrade to in-memory state instead of breaking the page.
 */
(function(){
  'use strict';
  const DB_NAME='fashion-inspo-libraries';
  const DB_VERSION=1;
  const STORES={catalogues:{keyPath:'id'},kv:{},edits:{keyPath:'key'},outbox:{keyPath:'seq',autoIncrement:true}};

  // ---- small preferences (localStorage, guarded)
  const prefs={
    get(key,fallback=null){try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)}catch{return fallback}},
    set(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}},
    remove(key){try{localStorage.removeItem(key)}catch{}},
    raw(key){try{return localStorage.getItem(key)}catch{return null}}
  };

  // ---- memory fallback with the same surface as the IndexedDB adapter
  const memory=()=>{
    const data=Object.fromEntries(Object.keys(STORES).map(name=>[name,new Map()]));let seq=0;
    const keyOf=(store,value,key)=>key!==undefined?key:STORES[store].keyPath?value[STORES[store].keyPath]:undefined;
    return{
      kind:'memory',
      async get(store,key){return structuredClone(data[store].get(key))},
      async all(store){return[...data[store].values()].map(v=>structuredClone(v))},
      async put(store,value,key){if(STORES[store].autoIncrement&&value.seq===undefined)value={...value,seq:++seq};data[store].set(keyOf(store,value,key),structuredClone(value));return keyOf(store,value,key)},
      async del(store,key){data[store].delete(key)},
      async clear(store){data[store].clear()},
      async putMany(store,values){for(const v of values)await this.put(store,v)}
    };
  };

  const openIDB=()=>new Promise((resolve,reject)=>{
    if(!('indexedDB' in self)){reject(new Error('IndexedDB unavailable'));return}
    let request;
    try{request=indexedDB.open(DB_NAME,DB_VERSION)}catch(error){reject(error);return}
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const [name,options] of Object.entries(STORES))if(!db.objectStoreNames.contains(name))db.createObjectStore(name,options);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('IndexedDB blocked'));
  });

  const idb=db=>{
    const run=(store,mode,fn)=>new Promise((resolve,reject)=>{
      const tx=db.transaction(store,mode),os=tx.objectStore(store);let result;
      const req=fn(os);if(req)req.onsuccess=()=>{result=req.result};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    return{
      kind:'indexeddb',
      get:(store,key)=>run(store,'readonly',os=>os.get(key)),
      all:store=>run(store,'readonly',os=>os.getAll()),
      put:(store,value,key)=>run(store,'readwrite',os=>key===undefined?os.put(value):os.put(value,key)),
      del:(store,key)=>run(store,'readwrite',os=>os.delete(key)),
      clear:store=>run(store,'readwrite',os=>os.clear()),
      putMany:(store,values)=>run(store,'readwrite',os=>{values.forEach(v=>os.put(v))})
    };
  };

  let backend=null;
  const ready=(async()=>{
    try{const db=await openIDB();backend=idb(db);db.onversionchange=()=>db.close()}
    catch{backend=memory()}
    return backend;
  })();
  const call=method=>async(...args)=>{await ready;try{return await backend[method](...args)}catch(error){
    // A failing IndexedDB (quota, corruption) falls back to memory for the session.
    if(backend.kind==='indexeddb'){console.warn('[store] IndexedDB failed, using memory',error);backend=memory()}
    return backend[method](...args);
  }};

  const store={
    ready,
    prefs,
    get kind(){return backend?backend.kind:'pending'},
    get:call('get'),all:call('all'),put:call('put'),del:call('del'),clear:call('clear'),putMany:call('putMany'),
    async estimate(){
      try{if(navigator.storage&&navigator.storage.estimate)return await navigator.storage.estimate()}catch{}
      return null;
    },
    async persisted(){try{return navigator.storage&&navigator.storage.persisted?await navigator.storage.persisted():false}catch{return false}},
    // Ask the browser not to evict the stored catalogues under storage pressure.
    async persist(){try{return navigator.storage&&navigator.storage.persist?await navigator.storage.persist():false}catch{return false}}
  };
  window.FIL=window.FIL||{};
  window.FIL.store=store;
})();

// Service worker: keeps the site shell, every catalogue and every image the
// visitor has seen stored on the device, so returning visits never re-download
// what is already there. The version line below is rewritten by
// scripts/catalogue-pipeline.mjs whenever catalogue content changes.
const CACHE_VERSION='fil-3c29485ae8b90aaf';
const SHELL_CACHE=`${CACHE_VERSION}-shell`;
const DATA_CACHE='fil-data';
const ASSET_CACHE='fil-assets-v1';
const ASSET_LIMIT=1500;
const SHELL=['./','index.html','app/store.js','app/sync.js','app/wardrobe.js','app/avatar.js','app/studio.js','app/app.js','data/seed.js','data/manifest.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keep=new Set([SHELL_CACHE,DATA_CACHE,ASSET_CACHE]);
    for(const key of await caches.keys())if(!keep.has(key))await caches.delete(key);
    await self.clients.claim();
  })());
});

const trim=async(cacheName,limit)=>{
  const cache=await caches.open(cacheName);const keys=await cache.keys();
  for(let i=0;i<keys.length-limit;i++)await cache.delete(keys[i]);
};

// Images and logos: cache-first. Downloaded once, then served from the device.
const cacheFirst=async request=>{
  const cache=await caches.open(ASSET_CACHE);
  const hit=await cache.match(request,{ignoreSearch:true});
  if(hit)return hit;
  const response=await fetch(request);
  if(response.ok){await cache.put(request,response.clone());trim(ASSET_CACHE,ASSET_LIMIT)}
  return response;
};

// Catalogue data: network-first so sync sees fresh hashes, device copy when offline.
const networkFirst=async(request,cacheName)=>{
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch(error){
    const hit=await cache.match(request,{ignoreSearch:true})||await caches.match(request,{ignoreSearch:true});
    if(hit)return hit;
    throw error;
  }
};

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope).pathname;
  const rel=url.pathname.startsWith(scope)?url.pathname.slice(scope.length):url.pathname;
  if(rel.startsWith('assets/'))event.respondWith(cacheFirst(request));
  else if(rel.startsWith('data/'))event.respondWith(networkFirst(request,DATA_CACHE));
  else if(request.mode==='navigate'||rel.startsWith('app/')||rel===''||rel==='index.html')event.respondWith(networkFirst(request,SHELL_CACHE));
});

// The page can ask the worker to store every catalogue image for offline use.
self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type!=='cache-assets'||!Array.isArray(data.urls))return;
  event.waitUntil((async()=>{
    const cache=await caches.open(ASSET_CACHE);let done=0,failed=0;
    for(const url of data.urls){
      try{
        if(!await cache.match(url,{ignoreSearch:true})){const response=await fetch(url);if(response.ok)await cache.put(url,response);else failed++}
      }catch{failed++}
      done++;
      if(done%10===0||done===data.urls.length)event.source&&event.source.postMessage({type:'cache-progress',done,total:data.urls.length,failed});
    }
  })());
});

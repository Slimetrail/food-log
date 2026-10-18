// Food Log service worker: everything the app needs is precached so it works fully offline.
const VER="3",CACHE="foodlog-v"+VER;
const SHELL=["./","index.html","style.css?v=1","app.js?v=1","manifest.webmanifest",
 "vendor/zxing.min.js","vendor/tesseract.min.js","vendor/worker.min.js",
 "vendor/tesseract-core/tesseract-core-lstm.wasm.js","vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js","vendor/tessdata/eng.traineddata.gz",
 "data/index.json","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png"];
async function precache(){const c=await caches.open(CACHE);await c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"})));
 // research data files listed in data/index.json
 try{const idx=await (await fetch("data/index.json",{cache:"reload"})).json();await c.addAll(Object.keys(idx.files||{}).map(f=>new Request("data/"+f,{cache:"reload"})))}catch(e){}}
self.addEventListener("install",e=>{e.waitUntil(precache().then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("foodlog-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const BIG=/\/vendor\//; // large immutable libraries: cache-first
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);
 if(u.origin!==location.origin)return; // Open Food Facts lookups go to the network; the app keeps its own product cache
 if(BIG.test(u.pathname)){e.respondWith(caches.match(r,{ignoreSearch:true}).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res})));return}
 // network-first for app shell and research data/*.json: weekly updates arrive when online, cached copy offline
 e.respondWith(fetch(r,{cache:"no-cache"}).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res})
  .catch(()=>caches.match(r,{ignoreSearch:r.mode==="navigate"}).then(m=>m||caches.match(r,{ignoreSearch:true})).then(m=>m||(r.mode==="navigate"?caches.match("index.html"):Response.error()))));
});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window"}).then(ws=>ws.length?ws[0].focus():clients.openWindow("./")))});

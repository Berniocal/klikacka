/* Offline cache pro Reakční dobu */
const CACHE_NAME = 'reakcni-doba-v4-colors';
const ASSETS = ['./','./index.html','./styles.css','./app-v4.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(e.request,{ignoreSearch:true});if(hit)return hit;try{const fresh=await fetch(e.request);if(new URL(e.request.url).origin===self.location.origin)c.put(e.request,fresh.clone());return fresh}catch(err){if(e.request.mode==='navigate'){const f=await c.match('./index.html',{ignoreSearch:true});if(f)return f}throw err}})())});
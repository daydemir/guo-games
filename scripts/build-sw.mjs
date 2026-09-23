import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function files(dir) { const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?files(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat(); }
const paths=(await files('dist')).filter(p=>!p.endsWith('/sw.js')).sort();
const hash=createHash('sha256');
for(const path of paths) hash.update(await readFile(path));
const cache=`guo-shell-${hash.digest('hex').slice(0,12)}`;
await writeFile('dist/sw.js',`
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(paths.map(p=>p.slice(4)))};
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('guo-shell-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const url = new URL(event.request.url);
    const cached=await cache.match(url.pathname);
    if(cached) return cached;
    if(event.request.mode==='navigate') return (await cache.match('/index.html')) || fetch(event.request);
    return fetch(event.request);
  }));
});
`);
console.log(`Offline shell: ${paths.length} assets, ${cache}`);

/* Exercise the built service worker against stub Cache/fetch implementations.
   Verifies that installing precaches the whole build and that, with the
   network switched off, navigations and assets still resolve.
   Run with:  npm run check:sw   (after npm run build) */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DIST = path.resolve('dist');
const code = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');

/* ------------------------------------------------------------ stub world */
class StubHeaders {
  constructor(init = {}) { this.map = new Map(Object.entries(init)); }
  get(k) { return this.map.get(k.toLowerCase()) ?? null; }
}
class StubResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.type = init.type ?? 'basic';
    this.headers = new StubHeaders(init.headers);
    this.url = init.url ?? '';
  }
  clone() { return new StubResponse(this.body, { status: this.status, type: this.type, url: this.url }); }
}
class StubRequest {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? new URL(input, 'https://example.test/').href : input.url;
    this.method = init.method ?? 'GET';
    this.mode = init.mode ?? 'no-cors';
  }
}
class StubCache {
  constructor() { this.store = new Map(); }
  #key(r) { return typeof r === 'string' ? new URL(r, 'https://example.test/').href : r.url; }
  async put(req, res) { this.store.set(this.#key(req), res); }
  async match(req, opts = {}) {
    const k = this.#key(req);
    if (this.store.has(k)) return this.store.get(k);
    if (opts.ignoreSearch) {
      const bare = k.split('?')[0];
      for (const [key, v] of this.store) if (key.split('?')[0] === bare) return v;
    }
    return undefined;
  }
  async keys() { return [...this.store.keys()]; }
}
const caches = {
  boxes: new Map(),
  async open(name) {
    if (!this.boxes.has(name)) this.boxes.set(name, new StubCache());
    return this.boxes.get(name);
  },
  async keys() { return [...this.boxes.keys()]; },
  async delete(name) { return this.boxes.delete(name); },
};

let online = true;
const served = new Set();
async function stubFetch(input) {
  const url = typeof input === 'string' ? input : input.url;
  if (!online) throw new Error('offline');
  const rel = new URL(url, 'https://example.test/').pathname.replace(/^\//, '');
  const file = path.join(DIST, rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new StubResponse(null, { status: 404, url });
  served.add(rel);
  return new StubResponse(fs.readFileSync(file), { url });
}

const listeners = {};
const self = {
  location: new URL('https://example.test/sw.js'),
  addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
  skipWaiting: async () => { },
  clients: { claim: async () => { } },
};

const sandbox = {
  self, caches, fetch: stubFetch, Request: StubRequest, Response: StubResponse,
  URL, console, Promise, setTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'sw.js' });

/* --------------------------------------------------------------- helpers */
const fire = async (type, extra = {}) => {
  const waits = [];
  const responses = [];
  const event = {
    ...extra,
    waitUntil: p => waits.push(p),
    respondWith: p => responses.push(p),
  };
  for (const fn of listeners[type] ?? []) fn(event);
  await Promise.all(waits);
  return responses.length ? await responses[0] : undefined;
};

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

/* ----------------------------------------------------------------- tests */
check((listeners.install ?? []).length === 1, 'sw.js parses and registers an install handler');

await fire('install');
const cacheName = (await caches.keys())[0];
const box = await caches.open(cacheName);
const cachedCount = (await box.keys()).length;

const precache = JSON.parse(code.match(/const PRECACHE = (\[[\s\S]*?\n\]);/)[1]);
check(cachedCount === precache.length, `install precached all ${precache.length} files (got ${cachedCount})`);
check(/^dpc-[0-9a-f]{12}$/.test(cacheName), `cache is versioned: ${cacheName}`);

// A stale cache from an earlier version must be cleaned up on activate.
await caches.open('dpc-oldversion0');
await fire('activate');
check(!(await caches.keys()).includes('dpc-oldversion0'), 'activate deletes caches from earlier versions');

// Now pull the plug.
online = false;

const nav = await fire('fetch', {
  request: new StubRequest('https://example.test/', { mode: 'navigate' }),
});
check(nav && nav.status === 200, 'offline navigation is served from the cache');

const asset = await fire('fetch', {
  request: new StubRequest(precache.find(f => f.endsWith('.js')).replace('./', 'https://example.test/')),
});
check(asset && asset.ok, 'offline asset request is served from the cache');

const plate = await fire('fetch', {
  request: new StubRequest('https://example.test/plates/p424.png'),
});
check(plate && plate.ok, 'offline music plate is served from the cache');

const cross = await fire('fetch', {
  request: new StubRequest('https://elsewhere.test/thing.js'),
});
check(cross === undefined, 'cross-origin requests are left alone');

const post = await fire('fetch', {
  request: new StubRequest('https://example.test/', { method: 'POST' }),
});
check(post === undefined, 'non-GET requests are left alone');

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);

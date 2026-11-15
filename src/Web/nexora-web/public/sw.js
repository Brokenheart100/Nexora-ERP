/* Nexora ERP service worker: app shell plus a read-only data cache. */
const VERSION = 'v1'
const SHELL_CACHE = 'nexora-shell-' + VERSION
const DATA_CACHE = 'nexora-data-' + VERSION
const SHELL_URL = '/'
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icons/nexora.svg',
  '/icons/nexora-192.png',
  '/icons/nexora-512.png',
  '/icons/nexora-maskable-512.png',
]
const PRIVATE_PATHS = ['/bff/login', '/bff/logout', '/bff/callback', '/bff/antiforgery', '/bff/sessions', '/bff/account', '/bff/me']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    await Promise.all(SHELL_ASSETS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }))
      } catch {
        /* Optional shell asset: keep installing. */
      }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE])
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('nexora-') && !keep.has(key)).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data === 'NEXORA_CLEAR_DATA') event.waitUntil(caches.delete(DATA_CACHE))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.method !== 'GET') {
    if (request.method === 'POST' && url.pathname === '/bff/logout') {
      event.respondWith(fetch(request).then(async (response) => {
        await caches.delete(DATA_CACHE)
        return response
      }))
    }
    return
  }
  if (url.pathname === '/sw.js' || isPrivate(url.pathname)) return
  if (request.mode === 'navigate') {
    event.respondWith(navigation(request))
    return
  }
  if (url.pathname.startsWith('/bff/api/')) {
    if (url.pathname.includes('/exports/') || url.pathname.endsWith('/export')) return
    event.respondWith(readThrough(request))
    return
  }
  if (url.pathname.startsWith('/_nuxt/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(request))
  }
})

async function navigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      await cache.put(SHELL_URL, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(SHELL_URL)
    if (cached) return cached
    return new Response('<!doctype html><meta charset="utf-8"><title>Nexora ERP</title><p>当前处于离线状态，且尚未缓存应用外壳。</p>', {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return Response.error()
  }
}

async function readThrough(request) {
  const cache = await caches.open(DATA_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ code: 'network.offline', detail: '当前处于离线状态，暂无缓存数据。' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}

function isPrivate(pathname) {
  return PRIVATE_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))
}

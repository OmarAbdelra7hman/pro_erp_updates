// One lightweight root worker owns the PWA shell and standards-based Web Push.
const CACHE_NAME = 'proerp-pwa-v8';
const OFFLINE_URL = '/offline.html';
const SHELL_ASSETS = [
    OFFLINE_URL,
    '/manifest.webmanifest',
    '/icon-192.png',
    '/icon-512.png',
    '/logo.png',
    '/css/fonts.css?v=20260630.1',
    '/css/app.css?v=20260630.1',
    '/js/iconify-icon.min.js',
    '/js/iconBundle.js',
    '/js/theme.js?v=20260630.1',
    '/js/utils.js?v=20260630.1',
    '/js/pwa.js?v=1.0'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.allSettled(SHELL_ASSETS.map(asset => cache.add(asset)));
        })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        Promise.all([
            'navigationPreload' in self.registration
                ? self.registration.navigationPreload.enable()
                : Promise.resolve(),
            caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) =>
                    (name.startsWith('proerp-pwa-') && name !== CACHE_NAME) ||
                    name.startsWith('offline-cache-'))
                    .map((name) => caches.delete(name))
            );
            })
        ])
    );
    self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip non-http(s) requests
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Never cache live data, authentication, SignalR or the offline POS scope.
    if (url.pathname.includes('/hubs/') || url.pathname.includes('/api/') ||
        url.pathname.includes('/_blazor') || url.pathname.startsWith('/sales/pos-offline')) return;

    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                return (await event.preloadResponse) || await fetch(event.request);
            } catch {
                return await caches.match(OFFLINE_URL);
            }
        })());
        return;
    }

    const isStaticAsset = /\.(?:css|js|png|jpg|jpeg|svg|woff2?|ico|webmanifest)$/i.test(url.pathname);
    if (isStaticAsset) {
        event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
            if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
            return response;
        })));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
        const existing = windows.find(client => client.url.startsWith(self.location.origin));
        if (existing) {
            await existing.navigate(targetUrl);
            return existing.focus();
        }
        return clients.openWindow(targetUrl);
    }));
});

// Standards-based Web Push fallback (used by Safari, where Firebase Messaging
// for web may not initialize). Firebase payloads are ignored by this listener.
self.addEventListener('push', (event) => {
    if (!event.data) return;
    let payload;
    try { payload = event.data.json(); } catch { return; }
    if (payload?.provider !== 'proerp-webpush') return;

    event.waitUntil(self.registration.showNotification(payload.title || 'mktoop', {
        body: payload.body || '',
        icon: payload.icon || '/icon-192.png',
        badge: '/icon-192.png',
        dir: 'rtl',
        lang: 'ar',
        tag: payload.payloadId || 'mktoop-web-push',
        data: { url: payload.route || '/', payloadId: payload.payloadId || '' }
    }));
});

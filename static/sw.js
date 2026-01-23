const CACHE_NAME = 'ezan-vakti-v1';
const STATIC_CACHE = 'static-cache-v1';
const DYNAMIC_CACHE = 'dynamic-cache-v1';

const STATIC_ASSETS = [
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/manifest.json',
    '/static/icons/icon-72x72.png',
    '/static/icons/icon-96x96.png',
    '/static/icons/icon-128x128.png',
    '/static/icons/icon-144x144.png',
    '/static/icons/icon-152x152.png',
    '/static/icons/icon-192x192.png',
    '/static/icons/icon-384x384.png',
    '/static/icons/icon-512x512.png'
];

const EXTERNAL_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then((cache) => {
                return Promise.all(
                    STATIC_ASSETS.map(url => 
                        fetch(url)
                            .then(response => {
                                if (!response || response.status !== 200) {
                                    console.log('Failed to cache:', url, response.status);
                                    return;
                                }
                                return cache.put(url, response);
                            })
                            .catch(error => console.log('Failed to cache:', url, error))
                    )
                );
            }),
            caches.open(DYNAMIC_CACHE).then((cache) => {
                return Promise.all(
                    EXTERNAL_ASSETS.map(url => 
                        fetch(url)
                            .then(response => {
                                if (!response || response.status !== 200) {
                                    console.log('Failed to cache:', url, response.status);
                                    return;
                                }
                                return cache.put(url, response);
                            })
                            .catch(error => console.log('Failed to cache:', url, error))
                    )
                );
            })
        ])
    );
});

// Activate Service Worker and Clean Old Caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (![STATIC_CACHE, DYNAMIC_CACHE].includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch Event with Network-First Strategy for Dynamic Content
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and browser-sync requests
    if (event.request.method !== 'GET' || event.request.url.includes('browser-sync')) return;

    // Handle different caching strategies based on request type
    if (event.request.url.includes('/api/')) {
        // Network-first strategy for API calls
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (!response || response.status !== 200) {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE)
                        .then(cache => cache.put(event.request, responseClone))
                        .catch(error => console.log('Cache put error:', error));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else if (STATIC_ASSETS.some(asset => event.request.url.includes(asset))) {
        // Cache-first strategy for static assets
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request)
                        .then(networkResponse => {
                            if (!networkResponse || networkResponse.status !== 200) {
                                return networkResponse;
                            }
                            const responseClone = networkResponse.clone();
                            caches.open(STATIC_CACHE)
                                .then(cache => cache.put(event.request, responseClone))
                                .catch(error => console.log('Cache put error:', error));
                            return networkResponse;
                        });
                })
        );
    } else {
        // Network-first strategy for other requests
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (!response || response.status !== 200) {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE)
                        .then(cache => cache.put(event.request, responseClone))
                        .catch(error => console.log('Cache put error:', error));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});

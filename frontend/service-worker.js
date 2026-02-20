const CACHE_NAME = 'justcall-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/webrtc.js',
    '/manifest.json',
    'https://cdn.socket.io/4.7.2/socket.io.min.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Bypass cache for POST requests (Login/Register) and Socket.io
    if (event.request.method !== 'GET' ||
        event.request.url.includes('socket.io') ||
        event.request.url.includes('/login') ||
        event.request.url.includes('/register')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                // If fetch fails and no cache, just let it fail naturally
                return null;
            });
        })
    );
});

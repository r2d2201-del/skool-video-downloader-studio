/**
 * CINEMATIC LMS STUDIO - SERVICE WORKER (PWA & OFFLINE ENGINE)
 * Cache-First for static assets, Stale-While-Revalidate for course catalog.
 */

const CACHE_NAME = 'cinematic-studio-v2.5.7';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/studio-theme.css',
  './js/app.js',
  './data/course-data.js',
  './manifest.webmanifest'
];

// Install Event - Pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA SW] Pre-caching offline app shell...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First for course data, Cache First for app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Do not intercept external video streams or Google Drive previews
  if (url.origin.includes('google.com') || url.origin.includes('googleapis.com') || url.origin.includes('mux.com')) {
    return;
  }

  // Local Companion Server API bypass (127.0.0.1:4545)
  if (url.port === '4545') {
    return;
  }

  // Course data script: Stale-While-Revalidate
  if (url.pathname.includes('course-data.js')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          return cache.match(event.request);
        });
      })
    );
    return;
  }

  // App shell assets: Cache first with network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

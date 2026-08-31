/**
 * CINEMATIC LMS STUDIO - SERVICE WORKER (PWA & OFFLINE ENGINE)
 * Cache-First for static assets, Stale-While-Revalidate for course catalog.
 */

const CACHE_NAME = 'cinematic-studio-v2.6.6';
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

// Fetch Event - Stale-while-revalidate for data, cache-first for assets with ignoreSearch
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
          return cache.match(event.request, { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // App shell assets (CSS, JS, Fonts): Cache first with network fallback & ignoreSearch
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch update in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
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
          return caches.match('./index.html', { ignoreSearch: true });
        }
      });
    })
  );
});

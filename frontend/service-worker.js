const CACHE_NAME = 'attendance-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/myevents.html',
  '/admin.html',
  '/css/styles.css',
  '/js/app.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/main.min.css',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/main.min.js'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('fetch', ev => {
  ev.respondWith(caches.match(ev.request).then(resp => resp || fetch(ev.request)));
});

// Installation support only. Network requests and conversation storage keep
// their existing behavior; this worker does not intercept or cache requests.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

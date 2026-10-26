// PoundFighter service worker: shows move reminders sent by the server.
// Scope is /_/theme/app/ (registered from js/reminders.js).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data && event.data.text() };
  }
  const title = data.title || 'Time to move!';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'One quick fight. Brain off, glutes on.',
    icon: 'icon-192.png',
    badge: 'badge-96.png',
    tag: data.tag || 'pf-reminder',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.frameType === 'top-level' && new URL(client.url).origin === self.location.origin && 'focus' in client) {
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
